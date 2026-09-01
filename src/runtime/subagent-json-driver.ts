// RFC-0006 — parent-side subagent JSON driver (successor of subagent-rpc-driver).
//
// Under RFC 0006 the child owns its whole interpreter; the parent-side subagent
// contract reduces to ENVELOPE CONSUMPTION (PIC-59): the parent launches the
// child, awaits the `theta_result` envelope on the child's `--mode json` stdout
// stream, and maps `ok` / `err` to `Ok` / `Err`. This module owns:
//
//   - the drive loop (`driveSubagentChild`): read the stdout line stream, find
//     the reserved-key envelope (ignoring stray lines), map it to the invocation
//     result, and fail closed on child-exit-without-envelope;
//   - PIC-66 cancellation forwarding (`attachSubagentCancellation`): a `-p`
//     child exposes no RPC abort command and its stdin is spawned closed (bug
//     0002 — there is no in-band stop channel), so cancellation is effected by
//     killing the child. The one-shot listener is the sole
//     cancellation-forwarding mechanism; a synchronous kill-throw is trapped
//     and routed through `theta/runtime/internal-error` without altering the
//     result, and PIC-65 teardown's bounded-await → kill remains the backstop.
//
// The RFC-0005 RPC drive contract (`subagent-rpc-driver.ts`, the
// prompt/`agent_end`/abort mapping) is RETIRED by this driver, not kept as a
// fallback.
//
// Spec: pi-integration-contract/subagent.md (PIC-59, PIC-66, PIC-65,
// #subagent-error-fidelity), invocation.md (INV-5), cancellation.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { QueryError } from "./query-error";
import type { InvokeResultSource } from "./invoke-cancellation";
import type { SubagentChildProcess, ChildExitInfo } from "./subagent-launcher";
import type { Clock } from "../seams/clock";
import { makeCancelledError } from "./cancellation-core";
import {
  classifyChildStdoutLine,
  mapEnvelopeParseFailure,
  mapEnvelopeSchemaSkew,
  mapExitWithoutEnvelope,
  mapWireParseFailure,
  parseEnvelopeLine,
  type EnumTagEntry,
} from "./subagent-envelope";

/**
 * `theta/runtime/subagent-child-crashed` — the companion crash-detail code
 * PIC-59 pins ALONGSIDE `subagent-exit-without-envelope` on a nonzero / signal
 * child exit, recording the crash detail for operator triage. Owned locally (the
 * successor driver exports no crash-code surface; it is a registry-pinned string).
 */
const SUBAGENT_CHILD_CRASHED_CODE = "theta/runtime/subagent-child-crashed";

/** Render the exit detail for the exit-without-envelope / child-crashed diagnostics. */
function renderExitDetail(info: ChildExitInfo): string {
  if (info.signal !== null) {
    return `exited on signal ${info.signal}`;
  }
  return `exited code ${info.code ?? "unknown"}`;
}

// ---------------------------------------------------------------------------
// Drive loop (launch → await envelope → map).
// ---------------------------------------------------------------------------

/**
 * The three `invoke_infra` causes with NO child-side envelope writer, over the
 * closed `InvokeInfraCause` union (`query-error.ts`). The wire carries no
 * provenance marker, so `cause` is the driver's PROXY for where an
 * `invoke_infra` err was minted. These three have no production that mints them
 * onto a child's `theta_result` envelope, so an `invoke_infra` err carrying one
 * of them reaches this parent solely by the callee `?`-propagating its OWN
 * nested `invoke(...)` failure — it is callee-returned and must WRAP for INV-5
 * wrap parity vs the in-process leg:
 *
 *   - `parse_failure` — sole mint at `production-theta-producer.ts:3840`
 *     (`#driveCallee`); reaches the envelope only by body `?`-propagation.
 *   - `panic` — the child-side regime catch routes body panics to
 *     `internal_error` (`production-theta-producer.ts:2684`), so every
 *     `cause:"panic"` reaching the envelope is a propagated body value (a
 *     nested-hop boundary catch, a nested depth overflow, `par for` ERR-20, a
 *     `subagent fn` downgrade).
 *   - `subagent_model_unresolved` — minted PARENT-SIDE only (`guardResolvedModel`,
 *     `subagent-model-guard.ts:116`, thrown at
 *     `production-theta-producer.ts:2053`); the child-side preflight mints
 *     `subagent_model_preflight_mismatch` instead, so it reaches the envelope
 *     only by a nested modelless subagent invoke propagating.
 *
 * The other five causes (`load_failure`, `validation`, `return_validation`,
 * `internal_error`, `subagent_model_preflight_mismatch`) DO have a child-side
 * envelope writer, so their `cause` on the wire is provenance-ambiguous and
 * defaults BARE (boundary-minted). A future `invoke_infra` cause not listed here
 * therefore defaults to boundary-minted — the spec-safe conservative default,
 * since an over-bare missed-fix is safer than an over-wrap phantom-hop spec
 * violation.
 */
const PROPAGATED_INVOKE_INFRA_CAUSES: ReadonlySet<string> = new Set([
  "parse_failure",
  "panic",
  "subagent_model_unresolved",
]);

/**
 * The parent-observed subagent invocation result reconstructed from the
 * envelope (INV-5). `enumTags` carries the PIC-59 §D3 sidecar
 * (`EnumTagEntry[]`, bug 0342 §Fix) through to the invoke-return retag when
 * the envelope carried one; absent on an enum-free return or an
 * envelope-version predating the sidecar.
 */
export type SubagentInvocationResult =
  | { readonly ok: true; readonly value: unknown; readonly enumTags?: readonly EnumTagEntry[] }
  | { readonly ok: false; readonly error: QueryError; readonly source: InvokeResultSource };

/** The collaborators the parent-side drive consumes (all injected; fake child in tests). */
export interface SubagentDriveDeps {
  /** The spawned child handle whose stdout / exit the drive reads. */
  readonly child: SubagentChildProcess;
  /** The per-invocation cancellation controller (PIC-66). */
  readonly thetaAbort: AbortController;
  /** The callee path carried onto a reconstructed `InvokeInfraError`. */
  readonly calleePath: string;
  /** Diagnostic sink for the envelope / exit failure-class diagnostics. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** Injected PIC-12 timer seam (no ambient `setTimeout`); defaults at the composition root. */
  readonly clock?: Clock;
}

/**
 * Drive one subagent-mode child to its result: read the stdout line stream,
 * scan for the reserved-key `theta_result` envelope (ignoring every stray line),
 * and map `ok` → `Ok(value)` / `err` → the reconstructed `QueryError`. A child
 * that exits WITHOUT an envelope maps fail-closed to `Err(InvokeInfraError {
 * cause: "internal_error" })`; a cancelled invocation maps to `Err(cancelled)`
 * (the cancellation short-circuit wins over the no-envelope map), per PIC-59 /
 * PIC-66 / INV-5.
 */
export function driveSubagentChild(deps: SubagentDriveDeps): Promise<SubagentInvocationResult> {
  const { child, thetaAbort, calleePath, emitDiagnostic } = deps;
  return new Promise<SubagentInvocationResult>((resolve) => {
    let settled = false;
    let lastStderr: string | undefined;
    // EMISSION BOUND (bug 0086 §Fix disposition 1): the child's stdout is
    // shared with other extensions (PIC-59) and the diagnostic is `E`, so a
    // chatty co-extension must not be able to produce one `E` per line — at
    // most the FIRST offending line is diagnosed per invocation. Scoped to
    // this drive's own closure, not module state, since the bound is
    // per-invocation.
    let wireParseFailureEmitted = false;
    let detachStdout: () => void = () => {};
    let detachStderr: () => void = () => {};
    const settle = (result: SubagentInvocationResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      detachStdout();
      detachStderr();
      resolve(result);
    };

    detachStderr = child.onStderrLine((line) => {
      lastStderr = line;
    });

    detachStdout = child.onStdoutLine((line) => {
      if (settled) {
        return;
      }
      // Stray-line tolerance: ignore every non-`theta_result` line (valid
      // `--mode json` events, garbage, partial JSON) until the reserved-key
      // envelope line — which cannot be split mid-write — is seen (PIC-59).
      // A non-envelope line that does not even parse as JSON gets the same
      // result-fidelity treatment (ignored for envelope selection) but is
      // additionally diagnosed, once per invocation, as advisory triage (bug
      // 0086 §Fix disposition 1) — never a result-altering failure.
      const classified = classifyChildStdoutLine(line);
      if (classified.kind === "other-json") {
        return;
      }
      if (classified.kind === "unparseable") {
        // BLANK-LINE FILTER: a line consisting only of JSON whitespace (space,
        // tab, CR, LF) is LF-delimited stdout framing — including the trailing
        // CR the line pump leaves on a `\r\n`-terminated write — not a malformed
        // JSON event, and is never diagnosed. The set is JSON's, not
        // ECMAScript's `trim`: U+2028, U+2029, U+00A0 and U+FEFF are ORDINARY
        // characters an implementation must not strip
        // (diagnostics/placeholder-rendering-b.md category 6), so a line made of
        // them is malformed stream bytes and is diagnosed like any other.
        if (/^[ \t\r\n]*$/.test(classified.line)) {
          return;
        }
        if (!wireParseFailureEmitted) {
          wireParseFailureEmitted = true;
          emitDiagnostic(mapWireParseFailure(classified.line));
        }
        return;
      }
      const parse = parseEnvelopeLine(line);
      switch (parse.kind) {
        case "ok":
          settle({
            ok: true,
            value: parse.value,
            ...(parse.enumTags !== undefined ? { enumTags: parse.enumTags } : {}),
          });
          return;
        case "err": {
          // Provenance over the CLOSED `InvokeInfraCause` union, read from a wire
          // that carries no provenance marker — so `cause` is the driver's
          // PROXY, partitioning the union into two groups.
          //
          // CALLEE-RETURNED (wrap) — no child-side envelope writer, so the cause
          // reaches this arm solely by the callee `?`-propagating its OWN nested
          // `invoke(...)` (the bug-0294 subagent-leg fix, INV-5 wrap parity):
          // `parse_failure`, `panic`, `subagent_model_unresolved` (see
          // `PROPAGATED_INVOKE_INFRA_CAUSES` for the per-cause evidence).
          //
          // BOUNDARY-MINTED (stay bare) — each HAS a child-side envelope writer,
          // so its `cause` on the wire is provenance-ambiguous and is spec'd
          // BARE to an invoke parent:
          //   - `load_failure` — marked-root registration refusal (bug 0178,
          //     `subagent-root-regime.ts:218` → `production-composition.ts:1244`);
          //   - `validation` — params-intake refusal
          //     (`production-theta-producer.ts:2590`; `subagent-params.ts:313`);
          //   - `return_validation` — return-value refusal
          //     (`production-theta-producer.ts:2658/2661`;
          //     `subagent-envelope.ts:862/900`);
          //   - `internal_error` — child body panic / defect catch
          //     (`production-theta-producer.ts:2684`);
          //   - `subagent_model_preflight_mismatch` — child-side preflight
          //     (`production-theta-producer.ts:2574`; `subagent-model-guard.ts:164`).
          //
          // A non-`invoke_infra` err (ValidationError, CodeToolError, transport,
          // model_tool, context_overflow, tool_loop_exhausted, invoke_callee) is
          // the callee's own returned Err — callee-returned.
          //
          // KNOWN RESIDUAL (bug 0294 F2): the FIVE boundary-minted causes above
          // — a callee that `?`-propagates a NESTED `invoke_infra` of
          // `load_failure` / `validation` / `return_validation` /
          // `internal_error` / `subagent_model_preflight_mismatch` through the
          // subagent leg is left BARE here, indistinguishable from a child-side
          // mint of the same cause without an envelope provenance sidecar
          // (0342-scale, out of scope), an INV-5 parity gap vs the in-process
          // leg. The three no-writer causes (`parse_failure`, `panic`,
          // `subagent_model_unresolved`) ARE wrapped, so they achieve full
          // parity. A future `invoke_infra` cause defaults to boundary-minted —
          // the spec-safe conservative default, since an over-bare missed-fix
          // is safer than an over-wrap phantom-hop spec violation.
          const err = parse.error as { readonly kind?: unknown; readonly cause?: unknown };
          const source: InvokeResultSource =
            err.kind === "invoke_infra" && !PROPAGATED_INVOKE_INFRA_CAUSES.has(err.cause as string)
              ? "boundary-minted"
              : "callee-returned";
          settle({ ok: false, error: parse.error, source });
          return;
        }
        case "parse-failed": {
          const mapping = mapEnvelopeParseFailure(parse.line, calleePath);
          emitDiagnostic(mapping.diagnostic);
          // The parent minted this `Err` from a malformed envelope; the callee
          // never returned it (bug 0294 provenance).
          settle({ ok: false, error: mapping.error, source: "boundary-minted" });
          return;
        }
        case "schema-skew": {
          const mapping = mapEnvelopeSchemaSkew(parse.observed, parse.required, calleePath);
          emitDiagnostic(mapping.diagnostic);
          // The parent minted this `Err` from an envelope-shape mismatch; the
          // callee never returned it (bug 0294 provenance).
          settle({ ok: false, error: mapping.error, source: "boundary-minted" });
          return;
        }
      }
    });

    child.onExit((info) => {
      if (settled) {
        return;
      }
      // The cancellation short-circuit wins over the no-envelope map: an aborted
      // invocation whose abort-driven kill exited the child WITHOUT an envelope
      // maps to `Err(cancelled)`, not `internal_error` (PIC-66).
      if (thetaAbort.signal.aborted) {
        // The parent's own cancellation short-circuit minted this `Err`; the
        // callee never returned it (bug 0294 provenance).
        settle({ ok: false, error: makeCancelledError(), source: "boundary-minted" });
        return;
      }
      const detail = renderExitDetail(info);
      // A nonzero / signal exit additionally records the companion
      // `subagent-child-crashed` crash detail for operator triage (PIC-59).
      if (info.code !== 0 || info.signal !== null) {
        emitDiagnostic({
          severity: "error",
          code: SUBAGENT_CHILD_CRASHED_CODE,
          message: `subagent child crashed: ${detail}`,
          ...(lastStderr === undefined ? {} : { hint: lastStderr }),
        });
      }
      // Fail-closed: the child exited without emitting an envelope.
      const mapping = mapExitWithoutEnvelope(detail, calleePath);
      emitDiagnostic(mapping.diagnostic);
      // The parent minted this fail-closed `Err` from a missing envelope; the
      // callee never returned it (bug 0294 provenance).
      settle({ ok: false, error: mapping.error, source: "boundary-minted" });
    });
  });
}

// ---------------------------------------------------------------------------
// PIC-66 — cancellation: abort → child kill.
// ---------------------------------------------------------------------------

/** `theta/runtime/internal-error` — the surface a thrown cancellation kill routes through (PIC-66). */
export const SUBAGENT_CANCEL_KILL_INTERNAL_ERROR_CODE = "theta/runtime/internal-error";

/** The one-shot cancellation registration, detached in the per-invocation teardown `finally` (PIC-65). */
export interface SubagentCancellationRegistration {
  readonly detach: () => void;
}

/** Collaborators the cancellation forwarding drives. */
export interface SubagentCancellationDeps {
  /** Runtime-defect sink for a thrown synchronous cancellation kill. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * PIC-66. Forward cancellation to a `-p` child by killing it: register a
 * one-shot `thetaAbort.signal` listener that kills the child; if `thetaAbort`
 * is already aborted at attach time, kill SYNCHRONOUSLY before registering
 * the listener (the spawn-then-immediate-cancel path). The child's stdin is
 * spawned closed (bug 0002) and a `-p` child exposes no RPC abort command, so
 * no in-band stop channel exists — the kill IS the cancellation forward. The
 * kill destroys the
 * parent-held stdio pipes, so the child's terminal `'close'` fires and the
 * drive settles `Err(cancelled)` via its cancellation short-circuit. A
 * synchronous kill-throw is trapped and routed through
 * `theta/runtime/internal-error` without altering the invocation result;
 * PIC-65 teardown's bounded-await → kill remains the backstop. The listener is
 * detached in the per-invocation teardown `finally`.
 */
export function attachSubagentCancellation(
  thetaAbort: AbortController,
  child: SubagentChildProcess,
  deps: SubagentCancellationDeps,
): SubagentCancellationRegistration {
  // PIC-66: the kill is the cancellation forward to a `-p` child.
  // A synchronous kill-throw is trapped and routed through
  // `theta/runtime/internal-error` without altering the invocation result.
  const killChild = (): void => {
    try {
      child.kill();
    } catch (killError: unknown) { // allow-broad-catch: PIC-66 theta/runtime/internal-error — pi-integration-contract/subagent.md
      const message = killError instanceof Error ? killError.message : String(killError);
      const stack =
        killError instanceof Error && typeof killError.stack === "string" && killError.stack.length > 0
          ? killError.stack
          : "<no stack available>";
      deps.emitDiagnostic({
        severity: "error",
        code: SUBAGENT_CANCEL_KILL_INTERNAL_ERROR_CODE,
        message: `internal error: ${message}`,
        hint: stack,
      });
    }
  };

  // The spawn-then-immediate-cancel path: if `thetaAbort` is already aborted at
  // attach time, kill SYNCHRONOUSLY before registering the listener, so
  // correctness does not depend on microtask ordering.
  if (thetaAbort.signal.aborted) {
    killChild();
    return { detach: (): void => {} };
  }

  // The one-shot `thetaAbort.signal` listener is the sole cancellation-forwarding
  // mechanism; it is detached in the per-invocation teardown `finally`.
  const listener = (): void => {
    killChild();
  };
  thetaAbort.signal.addEventListener("abort", listener, { once: true });
  return {
    detach: (): void => {
      thetaAbort.signal.removeEventListener("abort", listener);
    },
  };
}
