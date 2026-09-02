// Bug 0295 (offline unit cells) — the child-internal arm of cancellation.md's
// two-arm invoke-cancellation rule is unreachable at the wrap seam.
//
// THE RULE (three normative statements, one behaviour):
//   - cancellation.md:66 (§Surfacing): "A child invoke whose signal aborts
//     surfaces to the parent as `Err(QueryError { kind: "invoke_callee", inner:
//     { kind: "cancelled", ... } })` WHEN THE ABORT ORIGINATED INSIDE THE CHILD,
//     or directly as `kind: "cancelled"` WHEN THE PARENT'S OWN SIGNAL FIRED
//     FIRST."
//   - error-model.md:35 (per-cause table, Cancellation row): the same two-arm
//     split, verbatim ("a child-internal abort wraps `kind: "invoke_callee",
//     inner: { kind: "cancelled", ... }`; a parent-own-signal abort surfaces
//     bare `kind: "cancelled"`").
//   - provider-error-mapping.md:44 (subagent-path `QueryError` audit, the
//     `kind: "cancelled"` row): a child-classified cancellation rides the
//     envelope `err` arm — so an envelope-delivered `cancelled` with the parent
//     signal quiet is, BY CONSTRUCTION, the child's own abort (its tool code
//     called the overridden `ctx.abort()`); the parent-own abort reaches the
//     child only as a kill (PIC-66 → the no-envelope path), never as an
//     envelope `cancelled`.
//
// THE COLLAPSE (pre-fix; the guard has since moved to
// `src/runtime/effectful-statement-host.ts:507` under the fix below — line
// drifted by bug 0322's unrelated `unknown-tool-error` outcome arm added
// earlier in the same file). The wrap
// seam `runInvokeEffect` read:
//     if (outcome.source === "boundary-minted" || innerKind === "cancelled")
//       return { ok: true, value: result };   // passes BARE
// The `innerKind === "cancelled"` disjunct passes EVERY callee-returned
// cancellation through bare, ignoring `deps.signal` (the parent's own
// `AbortSignal`, in scope at the seam). Both arms collapse to the
// parent-own-signal arm: a child that aborts ITSELF surfaces to a NON-cancelled
// parent as bare `Err(cancelled)` — the shape the spec reserves for "the
// parent's own signal fired first" — and an unhandled propagation reads as a
// cancellation of the parent that never happened. The child-internal arm
// (`Err(invoke_callee, inner:{kind:"cancelled"})`) is unconstructable from any
// real drive; the only such value in the tree is a hand-built renderer fixture
// (`tests/tool-calls.test.ts:373-380`).
//
// THE FIX THESE CELLS TARGET (not implemented here). The disjunct gains the
// parent-signal gate: `innerKind === "cancelled" && deps.signal.aborted`. Signal
// QUIET ⇒ child-internal ⇒ wrap; signal ABORTED ⇒ parent-own ⇒ bare. The
// envelope race (child's cancelled envelope lands AFTER the parent's abort)
// resolves bare under the gate — the arm the spec assigns ("the parent's own
// signal fired first").
//
// SEAM, NOT COMPOSITION ROOT. Reproducing a genuine callee-RETURNED `cancelled`
// through the shipped root offline would need a live self-aborting subagent
// callee threaded through a spawned child process. The wrap decision the rule
// governs lives at `runInvokeEffect`, which the real body executor
// (`executeBody`) reaches directly over an injected `InvokeChild` boundary
// double — the same seam and driver the bug-0294 fence cell (G) uses
// (`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`), extended
// here with the one input the 0294 template hardcodes and 0295 must
// parameterise: the parent's `deps.signal` (QUIET for the child-internal arm,
// ABORTED for the parent-own / race arms).
//
// NO SILENT SKIP. Every cell asserts a concrete value or drives to a concrete
// terminal outcome; a missing precondition (the body never reaching the invoke,
// the double never driving, the recorder never firing) surfaces as a failing
// assertion or a rejected promise, never an early return.
//
// Spec: cancellation.md:66 (§Surfacing, the two-arm rule);
// errors-and-results/error-model.md:35 (per-cause table, Cancellation row);
// pi-integration-contract/provider-error-mapping.md:44 (audit-table row pinning
// the envelope carriage of a child-classified `cancelled`);
// slash-invocation.md (SLSH-3 top-level `Err` note, SLSH-4 per-kind rows, SLSH-5
// chain suffix); invocation.md §Failures (INV-5 wrap parity).

import { describe, expect, it } from "vitest";

import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import {
  executeBody,
  type BodyExecution,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import { parseThetaDocument } from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { Checkpoint } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { makeErr, makeOk, type ResultValue, type ThetaValue } from "../src/runtime/value";
import { makeCancelledError } from "../src/runtime/cancellation-core";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { DrivenInvokeResult, InvokeChild } from "../src/runtime/invoke-cancellation";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { Expr, InvokeExpr, ThetaBody } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type {
  CancelledError,
  CodeToolError,
  InvokeCalleeError,
  QueryError,
} from "../src/runtime/query-error";
import type { InvokeCallSite } from "../src/runtime/invoke-provenance";
import { renderTopLevelErrNote, type ChainHop } from "../src/runtime/err-note-render";

// The parent theta the seam drives; its slash name (filename stem) is `parent`.
const PARENT_FILE = "parent.theta";
const PARENT_NAME = "parent";
// The resolved callee path the `InvokeChild` boundary double is spawned from.
const WORKER = "./worker.theta";

// ===========================================================================
// Seam scaffolding — mirrors the bug-0294 fence template's inert seams, driven
// by the real `executeBody` executor over an injected `InvokeChild` double.
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

function invokeExpr(path: string): InvokeExpr {
  return { kind: "invoke", path, returnSchema: null, args: [], range: span() };
}

/** One recorded SLSH-5 invoke hop (`deps.recordInvokeHop` fires only when the wrap builds an `invoke_callee`). */
interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}

/**
 * An `InvokeChild` boundary double whose completed drive resolves the callee's
 * own returned `Err(leaf)` with `source: "callee-returned"` (the post-0294
 * `DrivenInvokeResult` shape `runInvokeChild` reads). `source: "callee-returned"`
 * deliberately exercises the path where PROVENANCE alone would wrap — so the
 * cells prove the outcome turns on the parent SIGNAL, not on provenance.
 *
 * `onDrive` (the race cell C) fires at the START of `drive()` — AFTER
 * `runInvokeChild`'s pre-dispatch `signal.aborted` read has already passed —
 * modelling the parent's own abort landing while the child is mid-drive, so the
 * cancelled envelope is still delivered but `deps.signal` is aborted by the time
 * the wrap seam reads it.
 */
function calleeReturningInvokeChild(
  calleePath: string,
  leaf: QueryError,
  onDrive?: () => void,
): InvokeChild {
  return {
    calleePath,
    committed: [],
    drive: (): Promise<DrivenInvokeResult> => {
      onDrive?.();
      return Promise.resolve({
        source: "callee-returned",
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
    resolveToolCall(): never {
      throw new Error("no tool call is executed in this seam — resolveToolCall must not be reached");
    },
    resolveInvoke(): InvokeChild {
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
 * Drive one `invoke(WORKER)` at the wrap seam through the real `executeBody`
 * over a callee-returning double.
 *   - `abortBeforeDrive` — abort the parent controller BEFORE the drive
 *     (`runInvokeChild`'s pre-dispatch check short-circuits: the parent-own
 *     arm's kill-path analogue).
 *   - `abortDuringDrive` — abort the parent controller INSIDE `drive()`, after
 *     the pre-dispatch check passed but before the wrap seam reads the signal
 *     (the envelope-after-abort race).
 */
async function runSeam(opts: {
  readonly leaf: QueryError;
  readonly abortBeforeDrive?: boolean;
  readonly abortDuringDrive?: boolean;
}): Promise<SeamRun> {
  const controller = new AbortController();
  if (opts.abortBeforeDrive === true) {
    controller.abort();
  }
  const onDrive =
    opts.abortDuringDrive === true ? (): void => controller.abort() : undefined;
  const invoke = calleeReturningInvokeChild(WORKER, opts.leaf, onDrive);
  const hops: RecordedHop[] = [];
  const deps = seamDeps(invoke, controller, (hop) => hops.push(hop));
  const body: ThetaBody = { statements: [], tail: invokeExpr(WORKER) };
  const exec = await executeBody(body, deps);
  return { exec, hops, controller };
}

function cancelledLeaf(): CancelledError {
  // The envelope-carried `cancelled` a self-aborting subagent callee emits
  // (provider-error-mapping.md:44 — child-classified, envelope `err` arm).
  return { kind: "cancelled", message: "callee aborted itself" };
}

/** The `Err` `QueryError` a surfaced invoke `Result` carries (the invoke is the body tail). */
function surfacedError(exec: BodyExecution): QueryError {
  const value = exec.result.value as ResultValue;
  expect(value.ok, "a callee-returned Err surfaces as an Err Result at the parent tail").toBe(false);
  return (value as unknown as { readonly error: QueryError }).error;
}

/** The 1-indexed call-site line the recorded hop pins (SLSH-5 `<line>`). */
function callSiteLine(callSite: InvokeCallSite): number {
  return callSite.style === "literal_invoke"
    ? callSite.invokeToken.line
    : callSite.calleeNameToken.line;
}

// ===========================================================================
// (A) CHILD-INTERNAL ARM — parent signal QUIET, callee returned a cancellation.
// EXPECT the wrapped shape (invoke_callee { inner: cancelled }) + the SLSH-5 hop.
// Fork state: RED (today the seam passes it BARE `cancelled`).
// ===========================================================================

describe("bug 0295 (A) — child-internal abort (parent signal quiet) wraps invoke_callee{inner:cancelled}", () => {
  it("the parent observes Err(invoke_callee) carrying inner cancelled and the callee path, with the SLSH-5 hop recorded", async () => {
    const { exec, hops } = await runSeam({ leaf: cancelledLeaf() });
    const err = surfacedError(exec);

    // cancellation.md:66 child-internal arm: the surfaced kind is the wrapper,
    // NOT the bare cancellation. RED at this HEAD — the seam's unconditional
    // `innerKind === "cancelled"` disjunct passes it bare (`kind: "cancelled"`).
    expect(
      err.kind,
      "child-internal abort (parent signal quiet) must wrap as invoke_callee, not surface bare cancelled",
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

    // The SLSH-5 chain hop is recorded against the wrapper the seam built
    // (`recordInvokeHop`), so an unhandled propagation can render the callee-
    // naming suffix. The bare arm records no hop.
    expect(hops.length, "one SLSH-5 invoke hop is recorded for the wrapped child-internal cancellation").toBe(1);
    expect(hops[0]?.calleePath).toBe(WORKER);
  });
});

// ===========================================================================
// (B) PARENT-OWN-SIGNAL ARM — parent signal ABORTED before dispatch.
// EXPECT a BARE cancellation (the parent IS cancelled). runInvokeChild's
// pre-dispatch `signal.aborted` read short-circuits before the child drives —
// the kill-path analogue of the parent-own arm.
// Fork state: GREEN both sides (control; the fix does not touch this path).
// ===========================================================================

describe("bug 0295 (B) — parent-own-signal abort (pre-dispatch) surfaces the bare cancel terminal outcome", () => {
  it("an aborted parent signal short-circuits before the child drives and ends the body on the cancel arm", async () => {
    const { exec } = await runSeam({ leaf: cancelledLeaf(), abortBeforeDrive: true });

    // The parent's own signal fired first: bare cancellation, the Cancelled arm
    // of the trichotomy — never an invoke_callee wrap. GREEN before and after
    // the fix (the fix gates only the WRAP seam, which this run never reaches).
    expect(
      exec.outcome,
      "the parent's own abort ends the body cancelled (SLSH-4 arm), not as an invoke_callee failure",
    ).toBe("cancel");
    expect(exec.result.present, "no FN-5 final value flows on cancellation").toBe(false);
  });
});

// ===========================================================================
// (C) RACE CELL — parent signal ABORTED during the drive, cancelled envelope
// present at wrap time. Distinct from (B): the pre-dispatch check passes QUIET,
// the child drives and delivers its cancelled envelope, and only THEN does the
// parent's own abort land — so the WRAP seam is reached with the signal aborted.
// EXPECT BARE cancelled per the adjudicated disposition ("the parent's own
// signal fired first").
// Fork state: GREEN both sides — guards the race disposition against a
// source-keyed flip (the fix's `&& deps.signal.aborted` keeps it bare).
// ===========================================================================

describe("bug 0295 (C) — envelope-after-abort race (signal aborted at wrap time) stays bare cancelled", () => {
  it("the wrap seam is reached with the parent signal aborted, and the cancelled envelope passes bare (not invoke_callee)", async () => {
    const { exec, controller } = await runSeam({ leaf: cancelledLeaf(), abortDuringDrive: true });

    expect(
      controller.signal.aborted,
      "the parent's own signal fired during the drive — this is the parent-own arm the fix gates bare",
    ).toBe(true);

    const err = surfacedError(exec);
    expect(
      err.kind,
      "the adjudicated race disposition is bare cancelled (parent's own signal fired first), never a source-keyed invoke_callee wrap",
    ).toBe("cancelled");
    expect(err.kind).not.toBe("invoke_callee");
  });
});

// ===========================================================================
// (D) UNHANDLED-PROPAGATION NOTE — the child-internal shape (quiet signal),
// rendered through the REAL note renderer over the REAL surfaced Err plus the
// REAL recorded hop, must NAME THE CALLEE (the SLSH-5 hop suffix), rather than
// reading as a bare parent cancellation.
//
// WHY NOT A `returned Err:` PREFIX. The task frames this as SLSH-3 `returned
// Err:` vs SLSH-4 `theta /<name> cancelled`. But the shipped renderer
// (`renderTopLevelErrNote`, err-note-render.ts) walks every `invoke_callee`
// wrapper to the LEAF variant and renders the leaf `kind`: a cancelled leaf
// takes SNK-f (`theta /<name> cancelled`) EVEN WHEN wrapped. The wrap-seam-only
// fix therefore cannot make the note begin with `returned Err:` — that would
// need a separate renderer change not in this bug's Fix. The real, achievable,
// spec-faithful discriminator the fix DOES flip is the SLSH-5 chain suffix
// naming the callee: measured on the shipped renderer, bare renders
// `"theta /parent cancelled"` (no callee) and wrapped+hop renders
// `"theta /parent cancelled from ./worker.theta invoked at parent.theta:1"`.
// This cell asserts on that real-path output plus the surfaced Err shape that
// FEEDS the renderer — the obligation is not dropped, it is pinned to the
// renderer's actual behaviour.
// Fork state: RED (today the surfaced Err is bare cancelled, no hop recorded, so
// the note is `theta /parent cancelled`, naming no callee).
// ===========================================================================

describe("bug 0295 (D) — an unhandled child-internal cancellation renders a note that NAMES THE CALLEE", () => {
  it("the real surfaced Err + recorded hop render the SLSH-5 callee-naming suffix, not a bare parent-cancellation note", async () => {
    const { exec, hops } = await runSeam({ leaf: cancelledLeaf() });
    const topErr = surfacedError(exec);

    const chain: ChainHop[] = hops.map((h) => ({
      calleePath: h.calleePath,
      record: { parentPath: PARENT_FILE, callSiteLine: callSiteLine(h.callSite) },
    }));
    const note = renderTopLevelErrNote({ thetaName: PARENT_NAME, error: topErr, chain });

    // RED at this HEAD: the surfaced Err is bare `cancelled` with no recorded
    // hop, so the renderer emits the SLSH-4 `theta /parent cancelled` row naming
    // no callee — a false account of a parent cancellation that never happened.
    expect(
      note,
      "the child-internal propagation must render the SLSH-5 hop naming the callee, not a bare parent cancellation",
    // Built as a concatenation, not one template literal: a bare colon-digit
    // suffix glued directly onto an interpolated brace reads to the repo's
    // citation-symbol-form gate (bug 0134,
    // tests/citation-symbol-form-gate.test.ts) as an unattributed line-number
    // continuation, though this is a rendered SLSH-5 note fragment, not a doc
    // citation into a TypeScript construct.
    ).toContain(`from ${WORKER} invoked at ${PARENT_FILE}` + ":1");

    // The surfaced Err shape that FEEDS the renderer is the wrapped invoke_callee
    // (its inner cancelled leaf is what the renderer walks to for the SNK-f row).
    expect(
      topErr.kind,
      "the shape feeding the top-level renderer is the invoke_callee wrapper, not a bare cancelled leaf",
    ).toBe("invoke_callee");
  });
});

// ===========================================================================
// (E) PARENT MATCH-ABILITY — with the child-internal shape, a spec-conformant
// parent `match Err(e) { e.kind == "invoke_callee" => ... }` RECOVERS (the
// doc's "the parent's `match` may recover" claim). Bare `cancelled` cannot be
// matched as `invoke_callee`, so today the parent cannot distinguish its
// callee's self-abort from its own cancellation.
// Fork state: RED (today the surfaced kind is `cancelled`).
// ===========================================================================

/** A parent recovery arm: `match theCalleeErr { Err(e) => if e.kind == "invoke_callee" { Ok(...) } else { Err(e) } }`. */
function parentRecovery(err: QueryError): ResultValue {
  if (err.kind === "invoke_callee") {
    return makeOk("callee cancelled itself, but I handled it" as unknown as ThetaValue);
  }
  return makeErr(err as unknown as ThetaValue);
}

describe("bug 0295 (E) — the child-internal shape is recoverable by a parent match on invoke_callee", () => {
  it("a parent match arm keyed on invoke_callee recovers to Ok (bare cancelled cannot be matched)", async () => {
    const { exec } = await runSeam({ leaf: cancelledLeaf() });
    const topErr = surfacedError(exec);

    const recovered = parentRecovery(topErr);

    // RED at this HEAD: the surfaced kind is bare `cancelled`, so the
    // `invoke_callee` arm does not select and the parent cannot recover — it
    // ends cancelled, unable to tell "my user pressed Esc" from "my callee gave
    // up". Post-fix the wrapper is matchable and the parent recovers.
    expect(
      recovered.ok,
      "a parent match on invoke_callee must be able to recover a callee's self-abort (cancellation.md:66 'may recover')",
    ).toBe(true);
  });
});

// ===========================================================================
// (F) NON-CANCELLED CALLEE-ERR CONTROL — a callee-returned NON-cancelled Err
// (leaf code_tool), source callee-returned, signal quiet, is wrapped as
// invoke_callee (the ordinary INV-5 wrap) — proving the fix does not disturb
// the ordinary callee-error wrap.
// Fork state: GREEN both sides.
// ===========================================================================

function codeToolLeaf(): CodeToolError {
  return { kind: "code_tool", message: "the read tool threw", tool_name: "read", cause: "execution" };
}

describe("bug 0295 (F) — a non-cancelled callee-returned Err wraps invoke_callee unchanged (ordinary wrap)", () => {
  it("a callee-returned code_tool Err surfaces wrapped as invoke_callee{inner:code_tool} with the callee named", async () => {
    const { exec, hops } = await runSeam({ leaf: codeToolLeaf() });
    const err = surfacedError(exec) as InvokeCalleeError;

    expect(err.kind, "the ordinary callee-error wrap is unchanged by the cancelled-arm fix").toBe("invoke_callee");
    expect(err.inner.kind, "the callee's own code_tool error rides as the wrapper's inner").toBe("code_tool");
    expect(err.callee_path).toBe(WORKER);
    expect(hops.length, "the ordinary wrap records its SLSH-5 hop").toBe(1);
  });
});

// ===========================================================================
// (G) IN-PROCESS SUBAGENT-FN CONTROL — the in-process `subagent fn` path shares
// the invocation's ONE controller, so the child-internal/parent-own distinction
// does not arise; a body cancel surfaces as the bare `cancel` terminal outcome
// (statement-executor.ts `evalSubagentFnCall`, the `case "cancel"` arm). The
// wrap-seam fix touches only `runInvokeEffect`, so this path is UNTOUCHED.
//
// CHOICE (per the bug's Non-goals: "In-process `subagent fn` bodies share the
// invocation's controller, so the child-internal/parent distinction does not
// arise for them"). Reproducing a self-aborting subagent-fn body at the wrap
// seam is not applicable — the subagent-fn path is a DIFFERENT executor site.
// Rather than a heavy live/spawn harness, this cell drives a thin parse-backed
// subagent-fn call whose body effect returns a cancelled `OperationResult`,
// asserting the bare `cancel` outcome. The broader in-process/subagent-mode
// cancel behaviour is additionally covered by
// `tests/statement-executor.test.ts` (ERR-12 subagent-mode mid-stream
// cancellation) and the RFC-0001 runtime suite `tests/subagent-fn.test.ts`.
// Fork state: GREEN both sides.
// ===========================================================================

function parseDeps(): { systemNote: SystemNoteChannelDeps; modelMatcher: ModelReferenceMatcher } {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/**
 * A `StatementEvalHost` that spawns a real (recorded) subagent-fn session and
 * returns a cancelled `OperationResult` for the body's single effect — the
 * in-process analogue of a self-aborting callee, but over the SHARED controller.
 */
class InProcessSubagentCancelHost implements StatementEvalHost {
  spawned = 0;
  evaluatePure(): ThetaValue {
    return null;
  }
  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    return expr.kind === "query" || expr.kind === "call" || expr.kind === "invoke"
      ? { kind: "tool-call", site: { file: "step.theta", line: 1, column: 1 } }
      : null;
  }
  runEffect(): Promise<OperationResult> {
    return Promise.resolve({ ok: false, error: makeCancelledError() });
  }
  spawnSubagentSession(): string {
    this.spawned += 1;
    return "subagent-fn-1";
  }
  exitSubagentSession(): void {}
}

describe("bug 0295 (G) — the in-process subagent-fn cancel arm is bare cancel, untouched by the wrap-seam fix", () => {
  it("a subagent fn whose body cancels ends the caller on the bare cancel outcome (shared controller — no wrap)", async () => {
    const src = "subagent fn step() { @`ping` }\nstep()";
    const source: ThetaSource = { path: "step.theta", bytes: new TextEncoder().encode(src) };
    const doc = parseThetaDocument(source, parseDeps());
    expect(doc.diagnostics.map((d) => d.code), "the subagent-fn source parses clean").toEqual([]);

    const host = new InProcessSubagentCancelHost();
    const deps: ExecuteBodyDeps = {
      env: buildEnvironment({ body: doc.body }),
      host,
      checkpoint: SEAM_NOOP_CHECKPOINT,
      signal: new AbortController().signal,
      mutator: SEAM_NOOP_MUTATOR,
      mode: "prompt" as DrivenConversationMode,
      file: "step.theta",
    };
    const exec = await executeBody(doc.body, deps);

    expect(host.spawned, "the call routed through the in-process subagent-fn path (a spawned session), not the invoke trampoline").toBe(1);
    expect(
      exec.outcome,
      "the in-process subagent-fn body cancel surfaces bare cancel (shared controller); the wrap-seam fix does not touch this path",
    ).toBe("cancel");
  });
});
