// Bug 0349 (offline unit cells) — the `.theta`-callable CODE-CALL leg of
// `runToolCallEffect` applies NONE of cancellation.md's two-arm invoke-cancel
// rule: it returns the driven callee `Result` bare, so a subagent-mode `.theta`
// tool callee that aborts ITSELF surfaces to a never-cancelled caller as bare
// `Err(cancelled)` — the shape the spec reserves for "the parent's own signal
// fired first". This is the sibling of bug 0295 (fixed 0.337.0 at the
// `runInvokeEffect` invoke seam in `effectful-statement-host.ts`) surviving 30
// lines above on the tool-position leg.
//
// THE RULE, AND ITS REACH ONTO THIS LEG (four normative statements):
//   - cancellation.md:66 (§Surfacing): "A child invoke whose signal aborts
//     surfaces to the parent as `Err(QueryError { kind: "invoke_callee", inner:
//     { kind: "cancelled", ... } })` WHEN THE ABORT ORIGINATED INSIDE THE CHILD,
//     or directly as `kind: "cancelled"` WHEN THE PARENT'S OWN SIGNAL FIRED
//     FIRST." The letter names `invoke`; the two statements below place the
//     code-call leg inside that rule's reach.
//   - tool-calls.md:38: "For a `.theta` callable, failures the callee returned
//     cascade through the standard `InvokeCalleeError` variant (the call is,
//     semantically, an `invoke`)." So a callee-returned `Err` on this leg MUST
//     wrap as `invoke_callee`, exactly as at the invoke seam.
//   - tool-calls.md:46 (§Relationship with `invoke`): a `.theta`-callable call
//     and `invoke(...)` "surface failures through the same `QueryError` variants
//     … The two surfaces share a single error model." Bare on one leg and
//     wrapped on the other for the identical program is the divergence this
//     forbids.
//   - error-model.md:35 (per-cause table, Cancellation row): restates the split
//     as "the two-arm `invoke`-parent rule" — a child-internal abort wraps
//     `invoke_callee`, a parent-own-signal abort surfaces bare.
//
// WHY AN ENVELOPE `cancelled` WITH THE CALLER SIGNAL QUIET IS BY CONSTRUCTION
// THE CHILD'S OWN ABORT. Under RFC-0006 a subagent-mode `.theta` tool callee
// runs in its own child process with its own `thetaAbort`; the caller's abort
// reaches it only as a kill (PIC-66 → the no-envelope path), never as an
// envelope `err: cancelled`. So an envelope-delivered `cancelled` while the
// caller's signal is quiet can only have been minted by the child's own tool
// code calling the overridden `ctx.abort()`. `runInvokeChild`
// (invoke-cancellation.ts:154) settles that as `{ kind: "value", result:
// Err(cancelled), source: "callee-returned" }`.
//
// THE COLLAPSE (pre-fix). `runToolCallEffect`'s theta-callable branch
// (effectful-statement-host.ts:325-341) drives the callee through the shared
// `runInvokeChild` trampoline and returns the driven outcome bare:
//     case "value": return { ok: true, value: invokeOutcome.result };  // :337-338
// It reads neither `invokeOutcome.source` (the 0294 provenance discriminator)
// nor `deps.signal` (the 0295 two-arm discriminator), and calls
// `surfaceThetaCallableCalleeFailure` nowhere. So EVERY callee-returned `Err`
// surfaces bare — the cancelled kind among them — and the child-internal arm
// (`Err(invoke_callee, inner:{kind:"cancelled"})`) is unconstructable from any
// real code-call drive at this HEAD.
//
// THE FIX THESE CELLS TARGET (not implemented here; parent-adjudicated §Fix ¶1).
// Mirror `runInvokeEffect`'s value-arm decision at the code-call leg's `value` arm:
// `result.ok` returns the callee's typed `Result` directly (FN-5, byte-identical
// to today); an `Err` where `outcome.source === "boundary-minted" || (innerKind
// === "cancelled" && deps.signal.aborted)` stays BARE (boundary-minted infra,
// and the caller-own / envelope-after-abort race arms); otherwise it wraps via
// `surfaceThetaCallableCalleeFailure(child.calleePath, result.error, msg)` and
// records the SLSH-5 hop via `deps.recordInvokeHop` with `{ style:
// "theta_callable_bare", calleeNameToken: expr.range.start }`. Signal QUIET ⇒
// child-internal ⇒ wrap; signal ABORTED ⇒ parent-own ⇒ bare.
//
// SEAM, NOT COMPOSITION ROOT. Reproducing a genuine callee-RETURNED `cancelled`
// through the shipped root offline would need a live self-aborting subagent
// callee threaded through a spawned child process. The wrap decision lives at
// `runToolCallEffect`'s theta-callable branch, which the real body executor
// (`executeBody`) reaches directly over an injected `InvokeChild` boundary
// double — the same seam the bug-0295 sibling harness drives, routed here
// through `classifyCall` → `"theta-callable"` + `resolveCallAsInvoke` with a
// `call` expr tail in place of the `invoke` expr, and parameterised on the two
// inputs the arbitration turns on: the double's `source` (E) and the caller's
// `deps.signal` (A/B/C).
//
// NO SILENT SKIP. Every cell asserts a concrete value or drives to a concrete
// terminal outcome; a missing precondition (the body never reaching the call,
// the double never driving, the recorder never firing) surfaces as a failing
// assertion or a rejected promise, never an early return.
//
// Spec: cancellation.md:66 (§Surfacing, the two-arm rule); tool-calls.md:38 (the
// call is, semantically, an `invoke`; callee-returned failures cascade through
// `InvokeCalleeError`), :46 (§Relationship with `invoke` — a single error
// model); errors-and-results/error-model.md:35 (per-cause table, Cancellation
// row); functions.md:44 (FN-5 — success final value; defers the
// failure/cancellation envelope), :67 (a subagent callee's cancellation
// surfaces exactly as for an `invoke`d subagent-mode callee);
// slash-invocation.md (SLSH-5 chain suffix).

import { describe, expect, it } from "vitest";

import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import {
  executeBody,
  type BodyExecution,
  type ExecuteBodyDeps,
} from "../src/runtime/statement-executor";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { makeErr, makeOk, type ResultValue, type ThetaValue } from "../src/runtime/value";
import type {
  DrivenInvokeResult,
  InvokeChild,
  InvokeResultSource,
} from "../src/runtime/invoke-cancellation";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { CallExpr, ThetaBody } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type {
  CancelledError,
  CodeToolError,
  InvokeCalleeError,
  InvokeInfraError,
  QueryError,
} from "../src/runtime/query-error";
import type { InvokeCallSite } from "../src/runtime/invoke-provenance";

// The parent theta the seam drives. Its body tail is a bare-identifier call
// `worker()` resolved to a `.theta`-callable.
const PARENT_FILE = "parent.theta";
// The bare-identifier callee name in the `call` expr (frontmatter `tools:`
// registers `./worker.theta` under this name).
const CALLEE_NAME = "worker";
// The resolved callee path the `InvokeChild` boundary double is spawned from —
// the value the wrapper's `callee_path` and the SLSH-5 hop name.
const WORKER = "./worker.theta";

// ===========================================================================
// Seam scaffolding — the bug-0295 sibling harness, re-routed through the
// code-call leg (`classifyCall` + `resolveCallAsInvoke`) with a `call` expr
// tail, driven by the real `executeBody` over an injected `InvokeChild` double.
// ===========================================================================

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

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** The body-tail `worker()` code-call the theta-callable leg drives (tool-calls.md:38). */
function callExpr(callee: string): CallExpr {
  return { kind: "call", callee, args: [], range: span() };
}

/** One recorded SLSH-5 hop (`deps.recordInvokeHop` fires only when the fix wraps an `invoke_callee`). */
interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}

/**
 * An `InvokeChild` boundary double whose completed drive resolves an `Err(leaf)`
 * with the given provenance `source` (`"callee-returned"` for the two-arm cells,
 * `"boundary-minted"` for the E control). `source: "callee-returned"`
 * deliberately exercises the path where PROVENANCE alone would wrap — so the
 * cancelled cells prove the outcome turns on the caller SIGNAL, not on
 * provenance.
 *
 * `onDrive` (the race cell C) fires at the START of `drive()` — AFTER
 * `runInvokeChild`'s pre-dispatch `signal.aborted` read has already passed —
 * modelling the caller's own abort landing while the child is mid-drive, so the
 * cancelled envelope is still delivered but `deps.signal` is aborted by the time
 * the wrap seam reads it.
 */
function calleeReturningInvokeChild(
  calleePath: string,
  leaf: QueryError,
  source: InvokeResultSource,
  onDrive?: () => void,
): InvokeChild {
  return {
    calleePath,
    committed: [],
    drive: (): Promise<DrivenInvokeResult> => {
      onDrive?.();
      return Promise.resolve({
        source,
        result: makeErr(leaf as unknown as ThetaValue),
      });
    },
  } as unknown as InvokeChild;
}

function seamDeps(
  invoke: InvokeChild,
  controller: AbortController,
  recordHop: (hop: RecordedHop) => void,
): ExecuteBodyDeps {
  const signal = controller.signal;
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    sink: SEAM_NOOP_SINK,
    file: PARENT_FILE,
    evaluatePure(): ThetaValue {
      return null;
    },
    resolveQuery(): QueryHostDispatch {
      throw new Error("no `@`-query is executed in this seam — resolveQuery must not be reached");
    },
    // The code-call leg routes a theta-callable through `resolveCallAsInvoke`,
    // never the Pi-tool `execute` dispatch: reaching here means `classifyCall`
    // mis-routed, which must fail loudly, not silently lower a tool call.
    resolveToolCall(): never {
      throw new Error("the theta-callable leg must not fall through to resolveToolCall");
    },
    // The invoke SEAM (`runInvokeEffect`) is bug 0295's fixed subject and is
    // never reached from a `call` tail; a call here means the executor dispatched
    // the wrong effect kind.
    resolveInvoke(): never {
      throw new Error("no `invoke(...)` expr in this seam — resolveInvoke must not be reached");
    },
    // Route the `worker()` call to the invoke trampoline (H8b theta-callable
    // classification): this is what makes `runToolCallEffect` take its
    // theta-callable branch (effectful-statement-host.ts:325-329).
    classifyCall(): "theta-callable" {
      return "theta-callable";
    },
    resolveCallAsInvoke(): InvokeChild {
      return invoke;
    },
    recordInvokeHop(
      wrapper: InvokeCalleeError,
      calleePath: string,
      callSite: InvokeCallSite,
    ): Promise<void> {
      recordHop({ wrapper, calleePath, callSite });
      return Promise.resolve();
    },
  };
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    mutator: SEAM_NOOP_MUTATOR,
    mode: "prompt" as DrivenConversationMode,
    file: PARENT_FILE,
  };
}

interface SeamRun {
  readonly exec: BodyExecution;
  readonly hops: readonly RecordedHop[];
  readonly controller: AbortController;
}

/**
 * Drive one `worker()` code-call at the theta-callable leg through the real
 * `executeBody` over a callee-returning double.
 *   - `abortBeforeDrive` — abort the caller controller BEFORE the drive
 *     (`runInvokeChild`'s pre-dispatch check short-circuits: the caller-own
 *     arm's kill-path analogue).
 *   - `abortDuringDrive` — abort the caller controller INSIDE `drive()`, after
 *     the pre-dispatch check passed but before the leg reads the signal (the
 *     envelope-after-abort race).
 *   - `source` — the double's provenance (`"callee-returned"` default, or
 *     `"boundary-minted"` for the E control).
 */
async function runSeam(opts: {
  readonly leaf: QueryError;
  readonly source?: InvokeResultSource;
  readonly abortBeforeDrive?: boolean;
  readonly abortDuringDrive?: boolean;
}): Promise<SeamRun> {
  const controller = new AbortController();
  if (opts.abortBeforeDrive === true) {
    controller.abort();
  }
  const onDrive =
    opts.abortDuringDrive === true ? (): void => controller.abort() : undefined;
  const invoke = calleeReturningInvokeChild(
    WORKER,
    opts.leaf,
    opts.source ?? "callee-returned",
    onDrive,
  );
  const hops: RecordedHop[] = [];
  const deps = seamDeps(invoke, controller, (hop) => hops.push(hop));
  const body: ThetaBody = { statements: [], tail: callExpr(CALLEE_NAME) };
  const exec = await executeBody(body, deps);
  return { exec, hops, controller };
}

function cancelledLeaf(): CancelledError {
  // The envelope-carried `cancelled` a self-aborting subagent callee emits
  // (provider-error-mapping.md:44 — child-classified, envelope `err` arm).
  return { kind: "cancelled", message: "callee aborted itself" };
}

function codeToolLeaf(): CodeToolError {
  return { kind: "code_tool", message: "the read tool threw", tool_name: "read", cause: "execution" };
}

function boundaryMintedLeaf(): InvokeInfraError {
  // The classic boundary-minted shape (bug 0294): an infra `Err` THIS hop's
  // trampoline fabricated around the callee body, never returned by the callee.
  return { kind: "invoke_infra", message: "callee unloadable", callee_path: WORKER, cause: "internal_error" };
}

/** The `Err` `QueryError` a surfaced code-call `Result` carries (the call is the body tail). */
function surfacedError(exec: BodyExecution): QueryError {
  const value = exec.result.value as ResultValue;
  expect(value.ok, "a callee-returned Err surfaces as an Err Result at the caller tail").toBe(false);
  return (value as unknown as { readonly error: QueryError }).error;
}

/** The 1-indexed call-site line the recorded hop pins (SLSH-5 `<line>`). */
function callSiteLine(callSite: InvokeCallSite): number {
  return callSite.style === "literal_invoke"
    ? callSite.invokeToken.line
    : callSite.calleeNameToken.line;
}

// ===========================================================================
// (A) CHILD-INTERNAL ARM — caller signal QUIET, callee returned a cancellation.
// EXPECT the wrapped shape (invoke_callee { inner: cancelled }) + the SLSH-5 hop
// recorded with the code-call leg's `theta_callable_bare` call-site style.
// Fork state: RED — today the theta-callable branch returns it BARE `cancelled`
// (effectful-statement-host.ts:337-338), reading neither source nor signal
// (cancellation.md:66, tool-calls.md:38).
// ===========================================================================

describe("bug 0349 (A) — code-call child-internal abort (caller signal quiet) wraps invoke_callee{inner:cancelled}", () => {
  it("the caller observes Err(invoke_callee) carrying inner cancelled and the callee path, with the SLSH-5 theta_callable_bare hop", async () => {
    const { exec, hops } = await runSeam({ leaf: cancelledLeaf() });
    const err = surfacedError(exec);

    // cancellation.md:66 child-internal arm reached through tool-calls.md:38: the
    // surfaced kind is the wrapper, NOT the bare cancellation. RED at this HEAD —
    // the code-call leg returns `invokeOutcome.result` bare for every kind.
    expect(
      err.kind,
      "code-call child-internal abort (caller signal quiet) must wrap as invoke_callee, not surface bare cancelled (tool-calls.md:38)",
    ).toBe("invoke_callee");

    const wrapped = err as InvokeCalleeError;
    expect(
      wrapped.inner.kind,
      "the wrapper carries the callee's own cancellation as its inner QueryError (cancellation.md:66)",
    ).toBe("cancelled");
    expect(
      wrapped.callee_path,
      "the wrapper names the callee that aborted itself (SLSH-5 <callee_path>)",
    ).toBe(WORKER);

    // The SLSH-5 hop is recorded against the wrapper the leg built, tagged with
    // the CODE-CALL call-site style (`theta_callable_bare`, calleeNameToken) —
    // distinct from the invoke seam's `literal_invoke`. The bare arm records no
    // hop, so this asserts RED today.
    expect(hops.length, "one SLSH-5 hop is recorded for the wrapped child-internal cancellation").toBe(1);
    expect(hops[0]?.calleePath).toBe(WORKER);
    expect(
      hops[0]?.callSite.style,
      "the code-call leg records the theta_callable_bare call-site style, not literal_invoke",
    ).toBe("theta_callable_bare");
    expect(
      callSiteLine(hops[0]!.callSite),
      "the hop pins the callee-name identifier's 1-indexed line (the `worker` token, span line 1)",
    ).toBe(1);
  });
});

// ===========================================================================
// (B) CALLER-OWN-SIGNAL ARM — caller signal ABORTED before dispatch.
// EXPECT the bare `cancel` terminal outcome (the caller IS cancelled).
// `runInvokeChild`'s pre-dispatch `signal.aborted` read short-circuits before
// the child drives — the kill-path analogue of the caller-own arm, surfaced by
// the leg's `case "cancelled"` (effectful-statement-host.ts:339-340).
// Fork state: GREEN both sides (control; the fix does not touch this arm — the
// bug's Non-goals: the pre-dispatch cancelled arm is correct and untouched).
// ===========================================================================

describe("bug 0349 (B) — code-call caller-own-signal abort (pre-dispatch) surfaces the bare cancel terminal outcome", () => {
  it("an aborted caller signal short-circuits before the child drives and ends the body on the cancel arm", async () => {
    const { exec } = await runSeam({ leaf: cancelledLeaf(), abortBeforeDrive: true });

    // The caller's own signal fired first: bare cancellation, the Cancelled arm
    // of the trichotomy — never an invoke_callee wrap. GREEN before and after the
    // fix (the fix gates only the WRAP on the value arm, which this run's
    // pre-dispatch short-circuit never reaches).
    expect(
      exec.outcome,
      "the caller's own abort ends the body cancelled (SLSH-4 arm), not as an invoke_callee failure",
    ).toBe("cancel");
    expect(exec.result.present, "no FN-5 final value flows on cancellation").toBe(false);
  });
});

// ===========================================================================
// (C) RACE CELL — caller signal ABORTED during the drive, cancelled envelope
// present at wrap time. Distinct from (B): the pre-dispatch check passes QUIET,
// the child drives and delivers its cancelled envelope, and only THEN does the
// caller's own abort land — so the leg's value arm is reached with the signal
// aborted. EXPECT BARE cancelled per the adjudicated disposition ("the parent's
// own signal fired first").
// Fork state: GREEN both sides — guards the race disposition against a
// source-keyed flip. Today it is bare because the leg wraps nothing; post-fix
// the `&& deps.signal.aborted` gate keeps it bare.
// ===========================================================================

describe("bug 0349 (C) — code-call envelope-after-abort race (signal aborted at wrap time) stays bare cancelled", () => {
  it("the value arm is reached with the caller signal aborted, and the cancelled envelope passes bare (not invoke_callee)", async () => {
    const { exec, controller } = await runSeam({ leaf: cancelledLeaf(), abortDuringDrive: true });

    expect(
      controller.signal.aborted,
      "the caller's own signal fired during the drive — this is the caller-own arm the fix gates bare",
    ).toBe(true);

    const err = surfacedError(exec);
    expect(
      err.kind,
      "the adjudicated race disposition is bare cancelled (caller's own signal fired first), never a source-keyed invoke_callee wrap",
    ).toBe("cancelled");
    expect(err.kind).not.toBe("invoke_callee");
  });
});

// ===========================================================================
// (D) NON-CANCELLED CALLEE-ERR — the GENERAL-WRAP cell. A callee-returned
// NON-cancelled Err (leaf code_tool), source callee-returned, signal quiet, must
// wrap as invoke_callee (tool-calls.md:38 — "failures the callee returned
// cascade through the standard InvokeCalleeError variant").
// Fork state: RED — today the leg wraps NO callee-returned Err at all (the
// FN-5-pass-through 0088 deferred), so this surfaces bare `code_tool`.
// ===========================================================================

describe("bug 0349 (D) — code-call non-cancelled callee-returned Err wraps invoke_callee (the general wrap)", () => {
  it("a callee-returned code_tool Err surfaces wrapped as invoke_callee{inner:code_tool} with the callee named and one hop", async () => {
    const { exec, hops } = await runSeam({ leaf: codeToolLeaf() });
    const err = surfacedError(exec);

    // RED at this HEAD: the code-call leg passes the callee's own `code_tool` Err
    // through bare (the `case "value"` arm's bare `invokeOutcome.result` return),
    // constructing no wrapper — tool-calls.md:38's InvokeCalleeError cascade is
    // unapplied on this leg.
    expect(
      err.kind,
      "a callee-returned failure on the code-call leg must cascade through InvokeCalleeError (tool-calls.md:38)",
    ).toBe("invoke_callee");

    const wrapped = err as InvokeCalleeError;
    expect(wrapped.inner.kind, "the callee's own code_tool error rides as the wrapper's inner").toBe("code_tool");
    expect(wrapped.callee_path).toBe(WORKER);
    expect(hops.length, "the general wrap records its SLSH-5 hop").toBe(1);
    expect(hops[0]?.callSite.style, "the code-call hop is theta_callable_bare").toBe("theta_callable_bare");
  });
});

// ===========================================================================
// (E) BOUNDARY-MINTED CONTROL — an `Err` THIS hop's trampoline fabricated
// (`source: "boundary-minted"`, bug 0294) stays BARE with the caller signal
// quiet: it is not a failure the callee RETURNED, so tool-calls.md:38's cascade
// does not apply and error-model.md's per-cause table keeps it bare.
// Fork state: GREEN both sides — today bare because the leg wraps nothing;
// post-fix the `outcome.source === "boundary-minted"` disjunct keeps it bare.
// Guards the fix against wrapping a boundary-minted infra Err by source-blindness.
// ===========================================================================

describe("bug 0349 (E) — code-call boundary-minted Err stays bare (not invoke_callee), no hop", () => {
  it("a boundary-minted invoke_infra Err surfaces with its bare leaf kind and records no SLSH-5 hop", async () => {
    const { exec, hops } = await runSeam({ leaf: boundaryMintedLeaf(), source: "boundary-minted" });
    const err = surfacedError(exec);

    // A boundary-minted `Err` stays bare on BOTH sides of the fix (the callee
    // never returned it — bug 0294 provenance), so it must NOT gain an
    // invoke_callee wrapper.
    expect(
      err.kind,
      "a boundary-minted infra Err stays bare (its own leaf kind), never wrapped as invoke_callee (bug 0294 provenance)",
    ).toBe("invoke_infra");
    expect(err.kind).not.toBe("invoke_callee");
    expect(hops.length, "no SLSH-5 hop is recorded for a bare boundary-minted Err").toBe(0);
  });
});

// ===========================================================================
// (F) CALLER MATCH-ABILITY — with the child-internal shape, a spec-conformant
// caller `match Err(e) { e.kind == "invoke_callee" => ... }` RECOVERS
// (cancellation.md:66 "the parent's `match` may recover"). Bare `cancelled`
// cannot be matched as `invoke_callee`, so today the caller cannot distinguish
// its callee's self-abort from its own cancellation.
// Fork state: RED — today the surfaced kind is bare `cancelled`.
// ===========================================================================

/** A caller recovery arm: `match theCalleeErr { Err(e) => if e.kind == "invoke_callee" { Ok(...) } else { Err(e) } }`. */
function callerRecovery(err: QueryError): ResultValue {
  if (err.kind === "invoke_callee") {
    return makeOk("callee cancelled itself, but I handled it" as unknown as ThetaValue);
  }
  return makeErr(err as unknown as ThetaValue);
}

describe("bug 0349 (F) — the code-call child-internal shape is recoverable by a caller match on invoke_callee", () => {
  it("a caller match arm keyed on invoke_callee recovers to Ok (bare cancelled cannot be matched)", async () => {
    const { exec } = await runSeam({ leaf: cancelledLeaf() });
    const topErr = surfacedError(exec);

    const recovered = callerRecovery(topErr);

    // RED at this HEAD: the surfaced kind is bare `cancelled`, so the
    // `invoke_callee` arm does not select and the caller cannot recover — it
    // ends cancelled, unable to tell "my user pressed Esc" from "my callee gave
    // up". Post-fix the wrapper is matchable and the caller recovers.
    expect(
      recovered.ok,
      "a caller match on invoke_callee must be able to recover a callee's self-abort (cancellation.md:66 'may recover')",
    ).toBe(true);
  });
});
