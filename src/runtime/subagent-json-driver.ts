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
//   - PIC-63 cancellation forwarding (`attachSubagentStdinCancellation`): a `-p`
//     child exposes no RPC abort command, so cancellation is effected by closing
//     the child's parent-held stdin pipe (the grace signal), then the bounded
//     grace + process-tree kill of PIC-9 teardown. The one-shot listener is the
//     sole cancellation-forwarding mechanism; a synchronous send-throw is trapped
//     and routed through `theta/runtime/internal-error` without altering the
//     result.
//
// The RFC-0005 RPC drive contract (`subagent-rpc-driver.ts`, the
// prompt/`agent_end`/abort mapping) is RETIRED by this driver, not kept as a
// fallback.
//
// Spec: pi-integration-contract/subagent.md (PIC-59, PIC-63, PIC-9,
// #subagent-error-fidelity), invocation.md (INV-5), cancellation.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { QueryError } from "./query-error";
import type { SubagentChildProcess, ChildExitInfo } from "./subagent-launcher";
import type { Clock } from "../seams/clock";
import { makeCancelledError } from "./cancellation-core";
import {
  lineCarriesReservedKey,
  mapEnvelopeParseFailure,
  mapEnvelopeSchemaSkew,
  mapExitWithoutEnvelope,
  parseEnvelopeLine,
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

/** The parent-observed subagent invocation result reconstructed from the envelope (INV-5). */
export type SubagentInvocationResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: QueryError };

/** The collaborators the parent-side drive consumes (all injected; fake child in tests). */
export interface SubagentDriveDeps {
  /** The spawned child handle whose stdout / exit the drive reads. */
  readonly child: SubagentChildProcess;
  /** The per-invocation cancellation controller (PIC-63). */
  readonly thetaAbort: AbortController;
  /** The callee path carried onto a reconstructed `InvokeInfraError`. */
  readonly calleePath: string;
  /** The resolved-model provider stamped onto a reconstructed transport `Err`, when needed. */
  readonly provider: string;
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
 * PIC-63 / INV-5.
 */
export function driveSubagentChild(deps: SubagentDriveDeps): Promise<SubagentInvocationResult> {
  const { child, thetaAbort, calleePath, emitDiagnostic } = deps;
  return new Promise<SubagentInvocationResult>((resolve) => {
    let settled = false;
    let lastStderr: string | undefined;
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
      if (!lineCarriesReservedKey(line)) {
        return;
      }
      const parse = parseEnvelopeLine(line);
      switch (parse.kind) {
        case "ok":
          settle({ ok: true, value: parse.value });
          return;
        case "err":
          settle({ ok: false, error: parse.error });
          return;
        case "parse-failed": {
          const mapping = mapEnvelopeParseFailure(parse.line, calleePath);
          emitDiagnostic(mapping.diagnostic);
          settle({ ok: false, error: mapping.error });
          return;
        }
        case "schema-skew": {
          const mapping = mapEnvelopeSchemaSkew(parse.observed, parse.required, calleePath);
          emitDiagnostic(mapping.diagnostic);
          settle({ ok: false, error: mapping.error });
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
      // maps to `Err(cancelled)`, not `internal_error` (PIC-63).
      if (thetaAbort.signal.aborted) {
        settle({ ok: false, error: makeCancelledError() });
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
      settle({ ok: false, error: mapping.error });
    });
  });
}

// ---------------------------------------------------------------------------
// PIC-63 — cancellation: stdin-close grace forwarding.
// ---------------------------------------------------------------------------

/** `theta/runtime/internal-error` — the surface a thrown grace-signal send routes through (PIC-63). */
export const SUBAGENT_CANCEL_GRACE_INTERNAL_ERROR_CODE = "theta/runtime/internal-error";

/** The one-shot cancellation registration, detached in the per-invocation teardown `finally` (PIC-9). */
export interface StdinCancellationRegistration {
  readonly detach: () => void;
}

/** Collaborators the cancellation forwarding drives. */
export interface StdinCancellationDeps {
  /** Runtime-defect sink for a thrown synchronous grace-signal send. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/**
 * PIC-63. Forward cancellation to a `-p` child by closing its parent-held stdin
 * pipe (the grace signal): register a one-shot `thetaAbort.signal` listener that
 * closes the child's stdin; if `thetaAbort` is already aborted at attach time,
 * close it SYNCHRONOUSLY before registering the listener (the
 * spawn-then-immediate-cancel path). A synchronous close-throw is trapped and
 * routed through `theta/runtime/internal-error` without altering the invocation
 * result; the bounded grace + process-tree kill is then the PIC-9 teardown's
 * responsibility. The listener is detached in the per-invocation teardown
 * `finally`.
 */
export function attachSubagentStdinCancellation(
  thetaAbort: AbortController,
  child: SubagentChildProcess,
  deps: StdinCancellationDeps,
): StdinCancellationRegistration {
  // PIC-63: closing the parent-held stdin pipe is the grace signal to a `-p`
  // child. A synchronous close-throw is trapped and routed through
  // `theta/runtime/internal-error` without altering the invocation result.
  const closeStdin = (): void => {
    try {
      child.closeStdin();
    } catch (closeError: unknown) { // allow-broad-catch: PIC-63 theta/runtime/internal-error — pi-integration-contract/subagent.md
      const message = closeError instanceof Error ? closeError.message : String(closeError);
      const stack =
        closeError instanceof Error && typeof closeError.stack === "string" && closeError.stack.length > 0
          ? closeError.stack
          : "<no stack available>";
      deps.emitDiagnostic({
        severity: "error",
        code: SUBAGENT_CANCEL_GRACE_INTERNAL_ERROR_CODE,
        message: `internal error: ${message}`,
        hint: stack,
      });
    }
  };

  // The spawn-then-immediate-cancel path: if `thetaAbort` is already aborted at
  // attach time, close stdin SYNCHRONOUSLY before registering the listener, so
  // correctness does not depend on microtask ordering.
  if (thetaAbort.signal.aborted) {
    closeStdin();
    return { detach: (): void => {} };
  }

  // The one-shot `thetaAbort.signal` listener is the sole cancellation-forwarding
  // mechanism; it is detached in the per-invocation teardown `finally`.
  const listener = (): void => {
    closeStdin();
  };
  thetaAbort.signal.addEventListener("abort", listener, { once: true });
  return {
    detach: (): void => {
      thetaAbort.signal.removeEventListener("abort", listener);
    },
  };
}
