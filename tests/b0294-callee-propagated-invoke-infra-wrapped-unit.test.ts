// Bug 0294 (offline unit cells) — the two seams the composition-root witnesses
// (`tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts`) cannot reach
// cheaply: the subagent-leg provenance tag (INV-5) and the cancelled-exemption
// fence (bug 0295's subject; re-pinned to 0295's fix below).
//
// (F) SUBAGENT-LEG PARITY (INV-5). The parent-side subagent driver
// (`driveSubagentChild`, `src/runtime/subagent-json-driver.ts`) settles the
// child's result from the `--mode json` envelope. Under the SETTLED design
// (`.pi/tmp/fixes/0294-design.md`, type-change surface item 3) its
// `SubagentInvocationResult` err arm gains `readonly source: InvokeResultSource`
// so the parent-side wrap keys on PROVENANCE, not `kind`:
//   - an `err` envelope carries the child's OWN top-level `Err` (already wrapped
//     or minted child-side) → `source: "callee-returned"` (invocation.md:36,
//     INV-5 wrap parity: the reconstructed leaf is wrapped exactly as an
//     in-process callee's returned Err);
//   - a child that EXITS WITHOUT AN ENVELOPE is a parent-side fail-closed map
//     (`mapExitWithoutEnvelope`) → `source: "boundary-minted"`
//     (provider-error-mapping.md's parent-side rows stay bare).
// RED at this HEAD: the `source` field is absent, so both reads are `undefined`.
//
// (G) CANCELLED-EXEMPTION FENCE, RE-PINNED BY BUG 0295. 0294 flips only the
// `invoke_infra` arm of the XMODE-1 exemption to provenance; `cancelled` was
// left explicitly OUT OF SCOPE for 0294 (`.pi/tmp/fixes/0294-design.md`
// §Fix / §Scope fences) and assigned to 0295 as its own two-arm rule
// (cancellation.md:66): a child invoke's own abort wraps; the parent's own
// abort stays bare. This fence's double carries `source: "callee-returned"`
// and `seamHarness` drives with a QUIET parent signal (`new
// AbortController().signal`, never aborted) — by cancellation.md:66 /
// provider-error-mapping.md:44 that combination is, by construction, the
// CHILD-INTERNAL arm, so bug 0295's fix wraps it as
// `invoke_callee { inner: cancelled }`. The cell held the pre-0295
// bare-cancelled assertion only until 0295's lane landed the parent-signal
// gate at the wrap seam; it now pins the post-fix child-internal disposition.
// Witnessed at the `runInvokeEffect` seam
// (`src/runtime/effectful-statement-host.ts`) — the seam that owns the wrap
// decision — driven by the real body executor over a legitimate `InvokeChild`
// boundary double.
//
// WHY (G)'S DOUBLE CARRIES BOTH THE FORK AND THE POST-FIX DRIVE SHAPES. The fix
// changes `InvokeChild.drive()` from `Promise<ResultValue>` to
// `Promise<DrivenInvokeResult>` (`{ source, result }`,
// `.pi/tmp/fixes/0294-design.md` type-change surface item 1). To stay GREEN on
// both sides WITHOUT the implementer having to touch this file, the double's
// `drive()` returns one object that satisfies BOTH readers: `ok`/`error` for the
// fork (`runInvokeChild` treats the whole return as the `ResultValue`), and
// `source`/`result` for the post-fix (`runInvokeChild` reads `driven.result` /
// `driven.source`). Either way the surfaced parent value is an Err whose leaf
// `kind` is `cancelled`.
//
// WHY THESE ARE UNIT CELLS, NOT COMPOSITION-ROOT CELLS. (F): the envelope `err`
// arm and the exit-without-envelope map are the driver's own two settle sites; a
// fake child exercises them directly with zero process spawn and zero tokens.
// (G): reproducing a genuine callee-RETURNED `cancelled` Err through the shipped
// root offline would need a live abort threaded into a spawned callee; the wrap
// decision the fence guards lives at `runInvokeEffect`, which the body executor
// reaches directly over an injected `InvokeChild`.
//
// NO SILENT SKIP. Every cell asserts a concrete value; a missing precondition
// (the driver never settling, the body never reaching the invoke) surfaces as a
// failing assertion or a rejected promise, never an early return.
//
// Spec: pi-integration-contract/subagent.md (PIC-59 envelope consumption),
// `docs/spec_topics/invocation.md:36` (INV-5 wrap parity across legs),
// `docs/spec_topics/errors-and-results/queryerror-variants.md` §Invoke variants,
// `docs/spec_topics/cancellation.md` (the cancelled arm's own rule).

import { describe, expect, it } from "vitest";

import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";
import type { SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeRpcChild } from "./helpers/fake-rpc-child";

import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { makeErr, type ResultValue, type ThetaValue } from "../src/runtime/value";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { Expr, InvokeExpr, Stmt, ThetaBody } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// ===========================================================================
// (F) Subagent-leg provenance tag (INV-5).
// ===========================================================================

/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A microtask+macrotask flush so the drive reaches its stdout-read await. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function driveDeps(child: SubagentChildProcess, thetaAbort: AbortController): {
  child: SubagentChildProcess;
  thetaAbort: AbortController;
  calleePath: string;
  emitDiagnostic: (d: Diagnostic) => void;
} {
  return {
    child,
    thetaAbort,
    calleePath: "./worker.theta",
    emitDiagnostic: (): void => {},
  };
}

describe("bug 0294 (F) — the subagent driver tags the reconstructed err arm with its provenance (INV-5)", () => {
  it("an `invoke_infra` cause load_failure (marked-root registration refusal, child-side) is boundary-minted — ", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    // `load_failure` is ALSO minted child-side by `markedRootRegistrationRefusal`
    // (`subagent-root-regime.ts:218` → `production-composition.ts:1249`, bug
    // 0178): the marked root failed to register and fell through to ordinary
    // host handling — the callee never ran, so the writer stamps
    // `err_provenance:"mint"` (bug 0347). The wrap must therefore treat it as
    // boundary-minted so the child-side mint stays bare (INV-5's bare-cause
    // enumeration).
    child.emitRawLine(
      envelopeLine({
        v: THETA_ENVELOPE_VERSION,
        err: {
          kind: "invoke_infra",
          message: "invoke of ./missing.theta failed (load_failure)",
          callee_path: "./missing.theta",
          cause: "load_failure",
        },
        err_provenance: "mint",
      }),
    );
    child.crashWith(0);

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invoke_infra");
    }
    expect(
      (result as unknown as { source?: string }).source,
      "`load_failure` has a child-side envelope writer (marked-root registration refusal), stamping " +
        "`err_provenance:\"mint\"` (bug 0347) — the wrap must treat it as boundary-minted so it stays bare",
    ).toBe("boundary-minted");
  });

  it("an `invoke_infra` load_failure PROPAGATION (nested `?`-propagated invoke, cause load_failure) is callee-returned — ", async () => {
    // Bug 0347: the identical cause, but the callee itself `?`-propagated a
    // NESTED invoke's `load_failure` — the `err_provenance:"propagated"` marker
    // distinguishes it from the child-side mint above and forces the wrap
    // (INV-5 parity with the in-process leg).
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    child.emitRawLine(
      envelopeLine({
        v: THETA_ENVELOPE_VERSION,
        err: {
          kind: "invoke_infra",
          message: "invoke of ./deeper.theta failed (load_failure)",
          callee_path: "./deeper.theta",
          cause: "load_failure",
        },
        err_provenance: "propagated",
      }),
    );
    child.crashWith(0);

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(
      (result as unknown as { source?: string }).source,
      "an explicit `propagated` marker wraps the nested load_failure leaf (bug 0347 INV-5 parity)",
    ).toBe("callee-returned");
  });

  it("a child that EXITS WITHOUT AN ENVELOPE is tagged source boundary-minted — ", async () => {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    // No envelope: the parent-side fail-closed `mapExitWithoutEnvelope` mints
    // the `invoke_infra{internal_error}` — a boundary-minted error, not one the
    // callee returned.
    child.crashWith(1, null, "boom");

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invoke_infra");
    }
    // RED at this HEAD: `source` is absent (`undefined`). Post-fix it is
    // "boundary-minted".
    expect(
      (result as unknown as { source?: string }).source,
      "a child that exited without an envelope is a parent-side fail-closed map — the wrap " +
        "must treat it as boundary-minted so it stays bare",
    ).toBe("boundary-minted");
  });

  // The wire carries no provenance marker by default, so the driver falls back
  // to reading `cause` as a PROXY over the closed `InvokeInfraCause` union.
  // THREE causes have no child-side envelope writer (`parse_failure`, `panic`,
  // `subagent_model_unresolved`), so the callee reaches this arm with one of
  // them only by `?`-propagating its own nested invoke — callee-returned. The
  // other FIVE (`load_failure`, `validation`, `return_validation`,
  // `internal_error`, `subagent_model_preflight_mismatch`) each have a
  // child-side envelope writer, so their `cause` alone is provenance-ambiguous:
  // bug 0347 closed that ambiguity with the `err_provenance` sidecar
  // (subagent.md `#subagent-err-provenance-marker`) — a genuine child-side mint
  // stamps `"mint"` (stays boundary-minted, the cells below), while a
  // `?`-propagated nested leaf of the same cause stamps `"propagated"` (wraps,
  // callee-returned, each cell's PROPAGATION sibling further down). A
  // non-`invoke_infra` err is the callee's own returned Err and stays
  // callee-returned.
  async function driveErrEnvelopeSource(
    err: Record<string, unknown>,
    provenance?: string,
  ): Promise<string | undefined> {
    const child = new FakeRpcChild({ exitOnStdinEof: false });
    const thetaAbort = new AbortController();
    const pending = driveSubagentChild(driveDeps(child, thetaAbort));
    await tick();
    child.emitRawLine(
      envelopeLine({
        v: THETA_ENVELOPE_VERSION,
        err,
        ...(provenance !== undefined ? { err_provenance: provenance } : {}),
      }),
    );
    child.crashWith(0);
    const result = await pending;
    expect(result.ok).toBe(false);
    return (result as unknown as { source?: string }).source;
  }

  it("an `invoke_infra` model-preflight mint (child-side, subagent.md:152) is boundary-minted — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "subagent model preflight mismatch",
        callee_path: "./worker.theta",
        cause: "subagent_model_preflight_mismatch",
      },
      "mint",
    );
    expect(
      source,
      "the child root drive mints the model-preflight `invoke_infra` child-side (subagent.md:152), " +
        "stamping `err_provenance:\"mint\"`; it is spec'd bare to an invoke parent, so the wrap must " +
        "treat it as boundary-minted (bug 0347: the marker now drives this, not the closed-set default)",
    ).toBe("boundary-minted");
  });

  it("an `invoke_infra` model-preflight PROPAGATION (nested `?`-propagated invoke, cause subagent_model_preflight_mismatch) is callee-returned — ", async () => {
    // Bug 0347: the identical cause, but the callee itself `?`-propagated a
    // NESTED invoke's model-preflight mismatch — the marker distinguishes it
    // from the child-side mint above and forces the wrap (INV-5 parity).
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "invoke of ./deeper.theta failed (subagent_model_preflight_mismatch)",
        callee_path: "./deeper.theta",
        cause: "subagent_model_preflight_mismatch",
      },
      "propagated",
    );
    expect(
      source,
      "an explicit `propagated` marker wraps the nested model-preflight leaf (bug 0347 INV-5 parity)",
    ).toBe("callee-returned");
  });

  it("an `invoke_infra` params-intake refusal (cause validation) is boundary-minted — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "invoke params refused",
        callee_path: "./worker.theta",
        cause: "validation",
      },
      "mint",
    );
    expect(
      source,
      "the child root drive mints the params-intake refusal child-side (invocation.md ceiling-#4), " +
        "stamping `err_provenance:\"mint\"`; it is spec'd bare, so the wrap must treat it as " +
        "boundary-minted (bug 0347: the marker now drives this, not the closed-set default)",
    ).toBe("boundary-minted");
  });

  it("an `invoke_infra` params-intake PROPAGATION (nested `?`-propagated invoke, cause validation) is callee-returned — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "invoke of ./deeper.theta failed (validation)",
        callee_path: "./deeper.theta",
        cause: "validation",
      },
      "propagated",
    );
    expect(
      source,
      "an explicit `propagated` marker wraps the nested params-intake leaf (bug 0347 INV-5 parity)",
    ).toBe("callee-returned");
  });

  it("an `invoke_infra` child body panic / defect (cause internal_error) is boundary-minted — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "internal error",
        callee_path: "./worker.theta",
        cause: "internal_error",
      },
      "mint",
    );
    expect(
      source,
      "a child body panic / interpreter defect is minted child-side (error-model.md Panic row), " +
        "stamping `err_provenance:\"mint\"`; the panic downgrade stays bare, so the wrap must treat " +
        "it as boundary-minted (bug 0347: the marker now drives this, not the closed-set default)",
    ).toBe("boundary-minted");
  });

  it("an `invoke_infra` PROPAGATION (nested `?`-propagated invoke, cause internal_error) is callee-returned — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "invoke of ./deeper.theta failed (internal_error)",
        callee_path: "./deeper.theta",
        cause: "internal_error",
      },
      "propagated",
    );
    expect(
      source,
      "an explicit `propagated` marker wraps the nested internal_error leaf (bug 0347 INV-5 parity)",
    ).toBe("callee-returned");
  });

  // `return_validation` had no explicit (F) cell before bug 0347 (bug 0294
  // §Residuals item 2 — it rode the tested default arm); bug 0347 §Fix
  // constraint 4 gives it both a mint cell and a propagation cell, matching
  // the other four child-side-mintable causes above.
  it("an `invoke_infra` return-value refusal (cause return_validation, child-side mint) is boundary-minted — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "return value refused",
        callee_path: "./worker.theta",
        cause: "return_validation",
      },
      "mint",
    );
    expect(
      source,
      "the child root drive mints the return-value refusal child-side (subagent-envelope.ts), stamping " +
        "`err_provenance:\"mint\"`; it is spec'd bare, so the wrap must treat it as boundary-minted",
    ).toBe("boundary-minted");
  });

  it("an `invoke_infra` return-value PROPAGATION (nested `?`-propagated invoke, cause return_validation) is callee-returned — ", async () => {
    const source = await driveErrEnvelopeSource(
      {
        kind: "invoke_infra",
        message: "invoke of ./deeper.theta failed (return_validation)",
        callee_path: "./deeper.theta",
        cause: "return_validation",
      },
      "propagated",
    );
    expect(
      source,
      "an explicit `propagated` marker wraps the nested return-value-refusal leaf (bug 0347 INV-5 parity)",
    ).toBe("callee-returned");
  });

  it("an `invoke_infra` cause parse_failure is callee-returned (nested `?`-propagated invoke) — ", async () => {
    const source = await driveErrEnvelopeSource({
      kind: "invoke_infra",
      message: "invoke of ./missing.theta failed (parse_failure)",
      callee_path: "./missing.theta",
      cause: "parse_failure",
    });
    expect(
      source,
      "`parse_failure` reaches the envelope solely by the callee `?`-propagating its own nested " +
        "invoke; the wrap must treat it as callee-returned (the bug-0294 subagent-leg fix)",
    ).toBe("callee-returned");
  });

  it("an `invoke_infra` cause panic is callee-returned (no child-side writer, `?`-propagated) — ", async () => {
    const source = await driveErrEnvelopeSource({
      kind: "invoke_infra",
      message: "invoke of ./missing.theta failed (panic)",
      callee_path: "./missing.theta",
      cause: "panic",
    });
    expect(
      source,
      "the child-side regime catch routes body panics to `internal_error`, so a `cause:\"panic\"` " +
        "on the envelope is a callee `?`-propagated nested value; the wrap must treat it as " +
        "callee-returned (INV-5 parity)",
    ).toBe("callee-returned");
  });

  it("an `invoke_infra` cause subagent_model_unresolved is callee-returned (parent-side mint, `?`-propagated) — ", async () => {
    const source = await driveErrEnvelopeSource({
      kind: "invoke_infra",
      message: "subagent model unresolved",
      callee_path: "",
      cause: "subagent_model_unresolved",
    });
    expect(
      source,
      "`subagent_model_unresolved` is minted parent-side only (guardResolvedModel); the child-side " +
        "preflight mints `subagent_model_preflight_mismatch` instead, so it reaches the envelope " +
        "only by a nested modelless subagent invoke propagating — callee-returned (INV-5 parity)",
    ).toBe("callee-returned");
  });

  it("a non-`invoke_infra` err (kind transport) is callee-returned — ", async () => {
    const source = await driveErrEnvelopeSource({
      kind: "transport",
      message: "provider transport error",
    });
    expect(
      source,
      "a non-`invoke_infra` err is the callee's own returned Err (always wrapped) — callee-returned",
    ).toBe("callee-returned");
  });
});

// ===========================================================================
// (G) Cancelled-exemption fence, re-pinned to bug 0295's parent-signal gate
// (GREEN post-fix: child-internal arm wraps).
// ===========================================================================

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function invokeExpr(path: string): InvokeExpr {
  return { kind: "invoke", path, returnSchema: null, args: [], range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null): ThetaBody {
  return { statements, tail };
}

const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const SEAM_NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

/**
 * An `InvokeChild` boundary double whose completed drive resolves the callee's
 * own `Err(cancelled)`. The returned object carries BOTH drive shapes (see the
 * file header): `ok`/`error` for the fork reader and `source`/`result` for the
 * post-fix (0294) reader. `source: "callee-returned"` deliberately exercises
 * the path where provenance alone would wrap — `seamHarness`'s QUIET parent
 * signal is what actually arbitrates the outcome under bug 0295's fix (the
 * child-internal arm), per cancellation.md:66.
 */
function cancelledReturningInvokeChild(calleePath: string): InvokeChild {
  const cancelledErr = { kind: "cancelled", message: "callee cancelled" };
  const dual = {
    ok: false,
    error: cancelledErr,
    source: "callee-returned",
    result: makeErr(cancelledErr as unknown as ThetaValue),
  };
  return {
    calleePath,
    committed: [],
    drive: (): Promise<ResultValue> => Promise.resolve(dual as unknown as ResultValue),
  } as unknown as InvokeChild;
}

function seamHarness(invoke: InvokeChild): ExecuteBodyDeps {
  const signal = new AbortController().signal;
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    sink: SEAM_NOOP_SINK,
    file: "parent.theta",
    evaluatePure(): ThetaValue {
      return null;
    },
    resolveQuery(): QueryHostDispatch {
      throw new Error("no `@`-query is executed in this fence — resolveQuery must not be reached");
    },
    resolveToolCall(): never {
      throw new Error("no tool call is executed in this fence — resolveToolCall must not be reached");
    },
    resolveInvoke(): InvokeChild {
      return invoke;
    },
  };
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    mutator: SEAM_NOOP_MUTATOR,
    mode: "prompt" as DrivenConversationMode,
    file: "parent.theta",
  };
}

describe("bug 0294 (G) — a callee-returned cancelled Err with the parent signal QUIET wraps invoke_callee (0295 re-pin)", () => {
  it("the child-internal arm wraps: with the parent signal quiet, the surfaced Err is invoke_callee{inner:cancelled}, not bare cancelled", async () => {
    const invoke = cancelledReturningInvokeChild("./worker.theta");
    const program = body([], invokeExpr("./worker.theta"));

    const r = await executeBody(program, seamHarness(invoke));

    const value = r.result.value as ResultValue;
    expect(value.ok, "a callee-returned Err surfaces as an Err at the parent").toBe(false);
    const err = (value as { readonly error: { readonly kind?: string; readonly inner?: { readonly kind?: string }; readonly callee_path?: string } }).error;
    // 0294 established the PROVENANCE machinery (`source: "callee-returned"`)
    // this fence's double carries; 0295 established that `cancelled` is its
    // OWN two-arm rule keyed on the PARENT's signal, not on provenance
    // (cancellation.md:66). `seamHarness` here uses a QUIET parent signal, so
    // an envelope-delivered `cancelled` is, by construction, the callee's own
    // abort (provider-error-mapping.md:44) — the child-internal arm, which
    // wraps like any other callee-returned failure. This cell held the
    // pre-0295 bare-cancelled contract only until 0295's lane landed the
    // signal gate; it now pins the post-fix child-internal disposition.
    expect(
      err.kind,
      "the child-internal arm (parent signal quiet) wraps invoke_callee, per cancellation.md:66 and bug 0295's fix",
    ).toBe("invoke_callee");
    expect(err.inner?.kind, "the wrapper carries the callee's own cancellation as its inner QueryError").toBe("cancelled");
    expect(err.callee_path, "the wrapper names the callee that aborted itself").toBe("./worker.theta");
  });
});
