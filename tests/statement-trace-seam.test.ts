// RFC 0015 D1/D7 (docs/rfcs/0015-theta-run-card.md §"The trace seam") — unit
// witnesses for the optional statement-trace seam on `ExecuteBodyDeps`:
//
//   (a) `deps.trace(site, "stmt")` fires at EVERY statement dispatch — once per
//       statement in source order, per loop iteration for loop-body statements,
//       before the statement's effect commits — with the statement's own
//       `{file, line, column}` site (the panic-site residence rule:
//       `env.currentResidence()` — a `.thetalib` fn body names its declaring
//       file — else the on-disk `sourcePath`, else the slash-name `file`);
//   (b) `deps.trace(site, <CheckpointKind>)` fires at every EFFECT dispatch,
//       beside (immediately before) that effect's `checkpoint.before`, with
//       the checkpoint site's line/column but the RESIDENCE-RULE file — the
//       no-join D1→D2 contract (src/seams/trace.ts): the trace stream is
//       self-sufficient, `checkpointBefore` ingest enriches nothing. Ordering
//       is pinned: `"stmt"` → effect kind → `checkpoint.before` → effect
//       commit → SETTLE. Loop statements publish `"loop-iter"` per iteration
//       at the loop's own head line (the same line their `"stmt"`
//       established);
//   (c) an absent trace is safe: no throw, byte-identical outcome and effect
//       order (the seam's absent cost is one undefined-check per site);
//   (d) a THROWING trace propagates to the nearest boundary — the executor
//       contains nothing, so it escapes `executeBody` bare when no boundary
//       intervenes, and a `par for` lane boundary downgrades it to that
//       element's `Err(invoke_infra, cause:"internal_error")` (ERR-20), per
//       the contract in `src/seams/trace.ts`;
//   (e) D7 SPAN semantics: the settle callback an effect-kind publication
//       returns is called exactly once, in a `finally` around the awaited
//       effect, on EVERY completion path — clean value, `Err` outcome,
//       cancellation observed at the checkpoint, and a throw unwinding the
//       await — while instant kinds' return values (`"stmt"`, `"loop-iter"`)
//       are DISCARDED even by a defective implementation that returns one,
//       and concurrent `par for` lanes hold independent, overlapping spans.

import { describe, expect, it } from "vitest";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import { isSpanTraceKind, type Trace, type TraceKind } from "../src/seams/trace";
import type { ThetaValue } from "../src/runtime/value";
import type {
  Block,
  Expr,
  ThetaBody,
  Stmt,
} from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { SEAM_NOOP_CHECKPOINT, RecordingMutator } from "./helpers/invoke-seam-scaffold";

// --- AST helpers with DISTINCT ranges (the trace site is the assertion) -----

function at(line: number, column = 1): SourceRange {
  return { start: { line, column }, end: { line, column: column + 1 } };
}

function numberExpr(text: string, range: SourceRange): Expr {
  return { kind: "number", text, numericType: "integer", range };
}

function letStmt(name: string, line: number): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init: numberExpr("1", at(line, 5)), range: at(line) };
}

function exprStmt(line: number): Stmt {
  return { kind: "expr", expr: numberExpr("0", at(line, 3)), range: at(line) };
}

function toolCallStmt(callee: string, line: number): Stmt {
  return { kind: "tool-call", call: { kind: "call", callee, args: [], range: at(line, 3) }, range: at(line) };
}

/** `let <name> = <callee>()?` — routes the effect through `evalAsResult`. */
function letTryCallStmt(name: string, callee: string, line: number): Stmt {
  const call: Expr = { kind: "call", callee, args: [], range: at(line, 9) };
  return {
    kind: "let",
    name,
    mutable: false,
    annotation: null,
    init: { kind: "try", operand: call, range: at(line, 9) },
    range: at(line),
  };
}

function parForTailExpr(variable: string, elements: readonly Expr[], bodyBlock: Block, line: number): Expr {
  return {
    kind: "par-for",
    variable,
    iterand: { kind: "array", elements, range: at(line, 12) },
    max: null,
    body: bodyBlock,
    range: at(line),
  };
}

function forStmt(variable: string, elements: readonly Expr[], body: Block, line: number): Stmt {
  return {
    kind: "for",
    variable,
    iterand: { kind: "array", elements, range: at(line, 10) },
    body,
    range: at(line),
  };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

// --- Minimal host: `call` exprs are checkpointed effects, the rest pure -----

/** The slash-name-keyed file `checkpointFor` stamps — deliberately NOT the heat key. */
const CHECKPOINT_SITE_FILE = "/slash-name";

class TraceProbeHost implements StatementEvalHost {
  /** Interleaved event log shared with the trace fn: `trace:…` vs `effect:…`. */
  readonly events: string[] = [];

  evaluatePure(expr: Expr): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "array":
        return expr.elements.map((e) => this.evaluatePure(e));
      default:
        return null;
    }
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    return expr.kind === "call"
      ? { kind: "tool-call", site: { file: CHECKPOINT_SITE_FILE, line: expr.range.start.line, column: 1 } }
      : null;
  }

  async runEffect(expr: Expr): Promise<OperationResult> {
    this.events.push(`effect:${expr.kind === "call" ? expr.callee : expr.kind}`);
    return { ok: true, value: null };
  }
}

function deps(host: TraceProbeHost, extra: Partial<ExecuteBodyDeps> = {}): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host,
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new RecordingMutator(),
    mode: "prompt",
    file: "/probe.theta",
    ...extra,
  };
}

/** A recording trace that also stamps the host-shared interleaving log.
 *  D7-conforming: span kinds return a settle recorder, instants undefined. */
function recordingTrace(host: TraceProbeHost) {
  const calls: { site: CheckpointSite; kind: TraceKind }[] = [];
  const settles: { site: CheckpointSite; kind: TraceKind }[] = [];
  const trace: Trace = (site, kind) => {
    calls.push({ site, kind });
    host.events.push(`trace:${kind}@${site.line}`);
    if (!isSpanTraceKind(kind)) {
      return undefined;
    }
    return (): void => {
      settles.push({ site, kind });
      host.events.push(`settle:${kind}@${site.line}`);
    };
  };
  return { calls, settles, trace };
}

/** A recording checkpoint sharing the host log, to pin trace-vs-checkpoint order. */
function recordingCheckpoint(host: TraceProbeHost): Checkpoint {
  return {
    before: async (kind: CheckpointKind, site: CheckpointSite): Promise<void> => {
      host.events.push(`checkpoint:${kind}@${site.line}`);
    },
  };
}

describe("RFC 0015 D1 — statement trace seam", () => {
  it("(a) fires \"stmt\" once per statement dispatch, in source order, with the statement's site", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    // Lines 2, 3, 4: let / pure expr / effect statement (which additionally
    // publishes its effect kind — locked separately below).
    const program = body([letStmt("a", 2), exprStmt(3), toolCallStmt("s0", 4)]);

    const execution = await executeBody(program, deps(host, { trace }));

    expect(execution.outcome).toBe("success");
    expect(calls.map((c) => ({ line: c.site.line, column: c.site.column, kind: c.kind }))).toEqual([
      { line: 2, column: 1, kind: "stmt" },
      { line: 3, column: 1, kind: "stmt" },
      { line: 4, column: 1, kind: "stmt" },
      { line: 4, column: 1, kind: "tool-call" },
    ]);
  });

  it("(a) the site file follows the panic-site residence rule: sourcePath when present, else the slash-name file", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    const program = body([exprStmt(1)]);

    await executeBody(program, deps(host, { trace, sourcePath: "C:/scripts/probe.theta" }));
    await executeBody(program, deps(host, { trace }));

    expect(calls.map((c) => c.site.file)).toEqual(["C:/scripts/probe.theta", "/probe.theta"]);
  });

  it("(a) residence rule, first leg: env.currentResidence() — a module body names its declaring .thetalib file for BOTH publication kinds, over the checkpoint site's slash-name file", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    const program = body([toolCallStmt("s0", 1)]);
    // An environment whose root IS a declaring module's nested root (the
    // shape `evalUserFnCall` opens a `.thetalib` fn body against) — the leg
    // D2's viewport-follow depends on. The effect-kind publication must carry
    // the same residence file even though `checkpointFor` stamped the
    // slash-name file on the checkpoint site (the cross-file collision the
    // no-join contract exists to kill).
    const moduleEnv = buildEnvironment({
      body: { statements: [], tail: null },
      moduleResidence: "C:/libs/util.thetalib",
    });

    await executeBody(program, deps(host, { trace, env: moduleEnv, sourcePath: "C:/scripts/probe.theta" }));

    expect(calls.map((c) => ({ file: c.site.file, kind: c.kind }))).toEqual([
      { file: "C:/libs/util.thetalib", kind: "stmt" },
      { file: "C:/libs/util.thetalib", kind: "tool-call" },
    ]);
    expect(calls.every((c) => c.site.file !== CHECKPOINT_SITE_FILE)).toBe(true);
  });

  it("(b) an effect statement publishes stmt → effect kind → checkpoint.before → commit, effect site residence-keyed", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    const program = body([toolCallStmt("s0", 3)]);

    const execution = await executeBody(
      program,
      deps(host, { trace, checkpoint: recordingCheckpoint(host) }),
    );

    expect(execution.outcome).toBe("success");
    // Pinned ordering: the "stmt" publication at statement dispatch, the
    // effect-kind publication at effect dispatch (after arg pre-evaluation,
    // beside — before — the effect's cancellation checkpoint), then commit.
    expect(host.events).toEqual([
      "trace:stmt@3",
      "trace:tool-call@3",
      "checkpoint:tool-call@3",
      "effect:s0",
      "settle:tool-call@3",
    ]);
    // The effect publication swaps the checkpoint site's slash-name file for
    // the residence key; line/column stay the checkpoint site's.
    expect(calls[1]).toEqual({
      site: { file: "/probe.theta", line: 3, column: 1 },
      kind: "tool-call",
    });
  });

  it("(b) the evalAsResult route (`let a = s0()?`) publishes the effect kind too", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    const program = body([letTryCallStmt("a", "s0", 7)]);

    const execution = await executeBody(
      program,
      deps(host, { trace, checkpoint: recordingCheckpoint(host) }),
    );

    expect(execution.outcome).toBe("success");
    expect(host.events).toEqual([
      "trace:stmt@7",
      "trace:tool-call@7",
      "checkpoint:tool-call@7",
      "effect:s0",
      "settle:tool-call@7",
    ]);
    expect(calls.map((c) => c.kind)).toEqual(["stmt", "tool-call"]);
  });

  it("(b) loop statements publish \"loop-iter\" per iteration at the loop's own head line — the same line their \"stmt\" established", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    // Line 1: `for x in [1, 2] { s0() }` with the body statement at line 2.
    const loop = forStmt(
      "x",
      [numberExpr("1", at(1, 11)), numberExpr("2", at(1, 14))],
      { statements: [toolCallStmt("s0", 2)], tail: null },
      1,
    );

    await executeBody(body([loop]), deps(host, { trace, checkpoint: recordingCheckpoint(host) }));

    // loopIterSite stamps the loop statement's OWN head line (line 1), which
    // statement dispatch trace-established — so every loop-iter publication
    // lands on an established (file, line) key, once per iteration, beside
    // (before) its loop-iter cancellation checkpoint.
    expect(host.events).toEqual([
      "trace:stmt@1",
      "trace:loop-iter@1",
      "checkpoint:loop-iter@1",
      "trace:stmt@2",
      "trace:tool-call@2",
      "checkpoint:tool-call@2",
      "effect:s0",
      "settle:tool-call@2",
      "trace:loop-iter@1",
      "checkpoint:loop-iter@1",
      "trace:stmt@2",
      "trace:tool-call@2",
      "checkpoint:tool-call@2",
      "effect:s0",
      "settle:tool-call@2",
    ]);
    expect(calls.every((c) => c.site.file === "/probe.theta")).toBe(true);
  });

  it("(b) a par-for lane's effect statement publishes both kinds inside the lane, residence-keyed", async () => {
    const host = new TraceProbeHost();
    const { calls, trace } = recordingTrace(host);
    // Tail: `par for x in [1] { s0() }` — one lane, body statement at line 5.
    const parFor = parForTailExpr(
      "x",
      [numberExpr("1", at(4, 14))],
      { statements: [toolCallStmt("s0", 5)], tail: null },
      4,
    );

    const execution = await executeBody(body([], parFor), deps(host, { trace }));

    expect(execution.outcome).toBe("success");
    expect(calls.map((c) => ({ line: c.site.line, kind: c.kind, file: c.site.file }))).toEqual([
      { line: 5, kind: "stmt", file: "/probe.theta" },
      { line: 5, kind: "tool-call", file: "/probe.theta" },
    ]);
    expect(host.events).toEqual([
      "trace:stmt@5",
      "trace:tool-call@5",
      "effect:s0",
      "settle:tool-call@5",
    ]);
  });

  it("(c) an absent trace is safe: same outcome, same effect order, no throw", async () => {
    const traced = new TraceProbeHost();
    const { trace } = recordingTrace(traced);
    const untraced = new TraceProbeHost();
    const program = body([letStmt("a", 1), toolCallStmt("s0", 2), toolCallStmt("s1", 3)]);

    const withTrace = await executeBody(program, deps(traced, { trace }));
    const withoutTrace = await executeBody(program, deps(untraced));

    expect(withoutTrace.outcome).toBe("success");
    expect(withoutTrace.outcome).toBe(withTrace.outcome);
    expect(untraced.events).toEqual(["effect:s0", "effect:s1"]);
    expect(traced.events.filter((e) => e.startsWith("effect:"))).toEqual(untraced.events);
  });

  it("(d) a throwing trace inside a par-for lane downgrades to that element's Err(cause:\"internal_error\") — the drive survives", async () => {
    class DefectiveTraceError extends Error {}
    const host = new TraceProbeHost();
    const laneCalls: number[] = [];
    // Throws only at the lane-body statement (line 5); the outer dispatch
    // (the tail's own statements — none here) traces normally.
    const trace: Trace = (site) => {
      laneCalls.push(site.line);
      if (site.line === 5) {
        throw new DefectiveTraceError("defective trace seam");
      }
      return undefined;
    };
    // Tail: `par for x in [1] { s0() }` — one lane, body statement at line 5.
    const parFor = parForTailExpr(
      "x",
      [numberExpr("1", at(4, 14))],
      { statements: [toolCallStmt("s0", 5)], tail: null },
      4,
    );

    const execution = await executeBody(body([], parFor), deps(host, { trace }));

    // ERR-20 lane boundary: the throw became this element's Err; the whole
    // drive still succeeds and yields the full per-element Result array.
    expect(execution.outcome).toBe("success");
    const results = execution.result.value as { ok: boolean; error: { kind: string; cause: string } }[];
    expect(results).toHaveLength(1);
    const element = results[0]!;
    expect(element.ok).toBe(false);
    expect(element.error.kind).toBe("invoke_infra");
    expect(element.error.cause).toBe("internal_error");
    // The throw happened AT dispatch: the lane statement's effect never committed.
    expect(host.events).toEqual([]);
    expect(laneCalls).toEqual([5]);
  });

  it("(d) a throwing trace propagates out of executeBody — the executor contains nothing", async () => {
    class DefectiveTraceError extends Error {}
    const host = new TraceProbeHost();
    const program = body([toolCallStmt("s0", 1)]);
    const trace: Trace = () => {
      throw new DefectiveTraceError("defective trace seam");
    };

    await expect(executeBody(program, deps(host, { trace }))).rejects.toThrow(DefectiveTraceError);
    // The throw happened AT dispatch: the statement's effect never committed.
    expect(host.events).toEqual([]);
  });
});

// --- (e) D7 span semantics ---------------------------------------------------

/** A host whose effects block until the test releases them (concurrency probe). */
class GatedHost extends TraceProbeHost {
  readonly pending: (() => void)[] = [];

  override async runEffect(expr: Expr): Promise<OperationResult> {
    await new Promise<void>((release) => this.pending.push(release));
    return super.runEffect(expr);
  }
}

/** Bounded microtask wait; fails loudly rather than ever skipping silently. */
async function waitFor(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`precondition unmet: ${what}`);
}

describe("RFC 0015 D7 — effect-span settle", () => {
  it("(e) settle fires when the effect completes with an Err outcome", async () => {
    class ErrHost extends TraceProbeHost {
      override async runEffect(expr: Expr): Promise<OperationResult> {
        await super.runEffect(expr);
        return { ok: false, error: { kind: "tool_failed", message: "boom" } as never };
      }
    }
    const host = new ErrHost();
    const { settles, trace } = recordingTrace(host);
    // A value position (`let r = s0()?` would propagate; use the bare let so
    // the Err binds) — the drive completes and the span settled at the Err.
    const program = body([letTryCallStmt("r", "s0", 2)]);

    await executeBody(program, deps(host, { trace }));

    expect(settles.map((s) => ({ line: s.site.line, kind: s.kind }))).toEqual([
      { line: 2, kind: "tool-call" },
    ]);
    expect(host.events[host.events.length - 1]).toBe("settle:tool-call@2");
  });

  it("(e) settle fires when the awaited effect THROWS — settle-then-propagate", async () => {
    class ThrowingEffectError extends Error {}
    class ThrowingHost extends TraceProbeHost {
      override runEffect(): Promise<OperationResult> {
        return Promise.reject(new ThrowingEffectError("effect blew up"));
      }
    }
    const host = new ThrowingHost();
    const { settles, trace } = recordingTrace(host);
    const program = body([toolCallStmt("s0", 3)]);

    await expect(executeBody(program, deps(host, { trace }))).rejects.toThrow(
      ThrowingEffectError,
    );

    // The finally settled the span before the throw escaped the boundary.
    expect(settles.map((s) => ({ line: s.site.line, kind: s.kind }))).toEqual([
      { line: 3, kind: "tool-call" },
    ]);
  });

  it("(e) settle fires on a cancellation observed at the effect's checkpoint — the effect never committed", async () => {
    const host = new TraceProbeHost();
    const { settles, trace } = recordingTrace(host);
    const aborted = new AbortController();
    aborted.abort();
    const program = body([toolCallStmt("s0", 4)]);

    const execution = await executeBody(
      program,
      deps(host, { trace, signal: aborted.signal }),
    );

    expect(execution.outcome).toBe("cancel");
    // Dispatch published (the cancelled-before-commit line still shows as
    // reached), the effect never ran, and the span still settled.
    expect(host.events).toEqual(["trace:stmt@4", "trace:tool-call@4", "settle:tool-call@4"]);
    expect(settles).toHaveLength(1);
  });

  it("(e) par-for lanes hold independent, OVERLAPPING spans — both open while both lanes block, each settles its own", async () => {
    const host = new GatedHost();
    const { calls, settles, trace } = recordingTrace(host);
    // Tail: `par for x in [1, 2] { s0() }` — two lanes, body statement line 5.
    const parFor = parForTailExpr(
      "x",
      [numberExpr("1", at(4, 14)), numberExpr("2", at(4, 17))],
      { statements: [toolCallStmt("s0", 5)], tail: null },
      4,
    );

    const driving = executeBody(body([], parFor), deps(host, { trace }));
    await waitFor(() => host.pending.length === 2, "both lanes reached their effect");

    // Both spans dispatched (same source line — the shared-line case the
    // closure pairing exists for), NEITHER settled while both lanes block.
    expect(calls.filter((c) => c.kind === "tool-call")).toHaveLength(2);
    expect(settles).toHaveLength(0);

    // Release one lane: exactly ONE span settles — no cross-lane settle.
    host.pending[0]!();
    await waitFor(() => settles.length === 1, "first lane settled");
    expect(settles).toHaveLength(1);

    host.pending[1]!();
    const execution = await driving;
    expect(execution.outcome).toBe("success");
    expect(settles.map((s) => ({ line: s.site.line, kind: s.kind }))).toEqual([
      { line: 5, kind: "tool-call" },
      { line: 5, kind: "tool-call" },
    ]);
  });

  it("(e) the executor DISCARDS settles returned for instant kinds — a defective impl returning one for stmt/loop-iter never sees it called", async () => {
    const host = new TraceProbeHost();
    const settled: TraceKind[] = [];
    // Deliberately non-conforming: returns a settle for EVERY kind.
    const trace: Trace = (_site, kind) => (): void => {
      settled.push(kind);
    };
    const loop = forStmt(
      "x",
      [numberExpr("1", at(1, 11))],
      { statements: [toolCallStmt("s0", 2)], tail: null },
      1,
    );

    await executeBody(body([loop]), deps(host, { trace }));

    // Only the awaited effect's span settled; the loop-iter / stmt returns
    // were dropped at the call sites (trace.ts §"D7 span semantics").
    expect(settled).toEqual(["tool-call"]);
  });
});
