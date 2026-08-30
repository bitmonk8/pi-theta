import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ThetaDocument,
  type ThetaBody,
  type Expr,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import {
  executeBody,
  ParForUnwrittenSlotError,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import {
  buildEnvironment,
  type LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import { isResultValue, type ThetaValue } from "../src/runtime/value";

// ===========================================================================
// Bug 0325 — a NaN / ±Infinity `par for max` operand yields a non-finite width,
// which evades the `Math.max(1, …)` floor and spawns ZERO workers, and the
// join's `results[index] ?? makeOk(null)` hole-filler then fabricates a full
// `array<Result>` of `Ok(null)` with the body never run. Witness suite
// (Phase 1, RED). Fixed in 0.313.0.
// ===========================================================================
//
// Rules under witness:
//   - control-flow.md:72 (CTRL-2): `max` "only *lowers* the in-flight width".
//     A width the runtime cannot interpret must not both complete the loop AND
//     lower the width below every iteration — that satisfies no reading of the
//     one power the clause has.
//   - control-flow.md:74 (CTRL-3): the value is `array<Result<T, QueryError>>`,
//     "element `i` corresponds to input element `i`" — each element is the
//     OUTCOME of iteration `i`. "Iteration never ran, loop completed anyway with
//     Ok(null)" is on no arm of CTRL-3 / CTRL-5.
//   - expressions.md:236: division by zero → IEEE-754 `Infinity`; modulo by zero
//     (`n % 0`) → `NaN`; both are legal non-panicking `number` VALUES. This is
//     the operand class that reaches the width read as a first-class number and
//     evades the `typeof === "number"` guard (`NaN`/`Infinity` are numbers).
//
// Mechanism (src/runtime/statement-executor.ts, `evalParFor`):
//   1. WIDTH GUARD. The width resolve takes the `typeof maxResult.value ===
//      "number"` branch for `NaN`/`Infinity`. `Math.floor(NaN)` = `NaN`;
//      `Math.max(1, Math.min(NaN, 64))` = `NaN`, so the ≥1 floor is NaN-evaded.
//      `workerCount = Math.min(NaN, n)` = `NaN`; the spawn loop `for (i = 0; i <
//      NaN; …)` runs zero times; `Promise.all([])` settles at once. (`Infinity`
//      instead survives the floor as `Math.min(Infinity, 64)` = 64 — it runs
//      UNTHROTTLED at the throttle, a silent width bug, not zero workers.) The
//      fix adds `&& Number.isFinite(maxResult.value)` so `NaN` AND `±Infinity`
//      fall to the clamp-to-1 + diagnostic branch, and widens the message to
//      "'par for' max operand is not a finite number; in-flight width clamped to
//      1" (code stays `theta/runtime/par-max-non-integer`).
//   2. HOLE-FILLER. The CTRL-3 join `collected[index] = results[index] ??
//      makeOk(null)` converts every never-written slot into `Ok(null)`. With
//      zero workers every slot is unwritten, so the fabrication is total and
//      shape-perfect. The fix replaces the `??` with a loud internal-error-class
//      throw naming the unwritten index.
//
// Reachability: the schema route (cell A) and the direct-value routes (cells
// B/C) both LOAD with zero parse diagnostics at this HEAD — `1 % 0` is a
// `number`-typed value (expressions.md:236) and the union-typed `s["a"]` operand
// defers, so neither is caught by 0324's static `non-integer-max` refusal. The
// harness executes the body regardless of load diagnostics (mirroring
// tests/b0324-max-non-number-runtime.test.ts).
//
// Observables (modelled on tests/par-for.test.ts `ParForHost` and
// tests/b0324-max-non-number-runtime.test.ts): a host that COUNTS every
// `runEffect` dispatch (`started`) and, when a gate is set, holds each effect
// open so the in-flight peak is the admitted width. RED discipline is stated
// per cell; every RED assertion encodes the EXPECTED (post-fix) behaviour so it
// flips green once both fix lines land.
//
// emitDiagnostic wiring: the production `ExecuteBodyDeps` ALREADY carries the
// optional `emitDiagnostic?:` channel (added when bug 0324 landed), and
// `evalParFor`'s non-number branch already calls it. The `DiagnosticSpyDeps`
// interface below only TIGHTENS that field from optional to required so the
// capturing spy is statically guaranteed to be wired — no src/ change. Today the
// `NaN`/`Infinity` operands stay on the number branch and emit NOTHING, so the
// diagnostic assertions are RED-for-the-right-reason (empty) until the width
// guard routes them to the emitting branch.

const RUNTIME_CODE = "theta/runtime/par-max-non-integer";

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "b0325.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "test.theta",
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, makeDeps());
}

/** Parse `src` and return its body (for execution). */
function bodyOf(src: string): ThetaBody {
  return parse(src).body;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** Await `n` microtask turns — deterministic scheduling advance for the tests. */
async function tick(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** An `Ok(value)` operation result (the effect succeeded). */
function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}

/**
 * A `StatementEvalHost` for `par for` bodies that RECORDS every effect dispatch
 * (`started`) and, when `gate` is set, holds each effect open so the concurrent
 * peak (`peakInFlight`) is the width the executor admits — the union of the
 * tests/par-for.test.ts recording host and the tests/b0324 gated host. The
 * bounded pure forms a fan-out body needs (number / string / bool / null / ident
 * / array) are evaluated against the real per-iteration environment; the max
 * operand itself is `%`/`/`/object-construction/object-index, all of which the
 * executor's `evalExpr` computes INTERNALLY, so this pure surface is minimal.
 */
class RecordingParForHost implements StatementEvalHost {
  started = 0;
  inFlight = 0;
  peakInFlight = 0;
  /** An optional gate every effect awaits before resolving (concurrency probe). */
  gate: Promise<void> | null = null;

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
  }

  async runEffect(): Promise<OperationResult> {
    this.started += 1;
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    try {
      if (this.gate !== null) {
        await this.gate;
      }
      return ok(null);
    } finally {
      this.inFlight -= 1;
    }
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident": {
        const r = env.resolve(expr.name);
        return "value" in r ? ((r.value ?? null) as ThetaValue) : null;
      }
      case "array":
        return expr.elements.map((e) => this.#eval(e, env));
      default:
        return null;
    }
  }
}

/**
 * `ExecuteBodyDeps` with the runtime-diagnostic channel required (not optional).
 * The production type carries `emitDiagnostic?:` since bug 0324 landed; this
 * override only tightens it so the capturing spy is guaranteed wired — no src/
 * change.
 */
interface DiagnosticSpyDeps extends ExecuteBodyDeps {
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

function execDeps(
  body: ThetaBody,
  host: StatementEvalHost,
  captured: Diagnostic[],
): DiagnosticSpyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: "test.theta",
    emitDiagnostic: (d: Diagnostic): void => {
      captured.push(d);
    },
  };
}

/** Run `body` to completion and return the loop's final `array<Result>` value. */
async function driveToArray(
  body: ThetaBody,
  host: StatementEvalHost,
  captured: Diagnostic[],
): Promise<readonly ThetaValue[]> {
  const exec = await executeBody(body, execDeps(body, host, captured));
  const value = exec.result.value;
  return Array.isArray(value) ? value : [];
}

/** Project each element to its `Ok` payload, or a sentinel when it is not `Ok`. */
function okPayloads(elements: readonly ThetaValue[]): ThetaValue[] {
  return elements.map((e) =>
    isResultValue(e) && e.ok ? e.value : "NOT-OK",
  );
}

describe("bug 0325 — a non-finite `par for max` width spawns zero workers and the join fabricates Ok(null)", () => {
  it("A (schema route): a NaN operand runs zero iterations and the loop value is a fabricated Ok(null) array", async () => {
    // control-flow.md:74 (CTRL-3): element `i` is the OUTCOME of iteration `i`.
    // `s["a"]` is `1 % 0` = NaN (expressions.md:236). The width read floors NaN
    // → NaN, spawns zero workers, and the join back-fills every slot with
    // Ok(null). The body's tail `f` is the per-element discriminator: a REAL run
    // yields Ok(1)/Ok(2)/Ok(3); the fabrication yields Ok(null) for all three.
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      [
        "schema S { a: number, b: string }",
        'let s = S { a: 1 % 0, b: "x" }',
        'par for f in [1, 2, 3] max s["a"] { invoke("./c.theta", f) f }',
      ].join("\n"),
    );
    const collected = await driveToArray(body, host, captured);

    // The loop value is shape-correct (a full-length array of Result) either
    // way — that shape-perfection is WHY the fabrication is dangerous, so this
    // fact holds pre- and post-fix and is not a RED gate.
    expect(collected.length, "CTRL-3: one element per input element").toBe(3);
    expect(
      collected.every((e) => isResultValue(e)),
      "CTRL-3: every element is a Result envelope",
    ).toBe(true);

    // RED today (all three fail for the symptom); GREEN once the width guard
    // spawns a worker that drains all three real iterations.
    expect.soft(
      host.started,
      "the body's effects must dispatch once per element (RED today: 0 — zero workers, Promise.all([]) settles at once)",
    ).toBe(3);
    expect.soft(
      okPayloads(collected),
      "CTRL-3: element `i` carries iteration `i`'s real tail value (RED today: [null, null, null], the hole-filler fabrication)",
    ).toEqual([1, 2, 3]);
    expect.soft(
      captured.map((d) => d.code),
      "a non-finite width is diagnosed, not silently accepted (RED today: no runtime diagnostic)",
    ).toContain(RUNTIME_CODE);
  });

  it("B (direct NaN, gated): a NaN operand keeps peak in-flight and effects at zero", async () => {
    // expressions.md:236: `1 % 0` = NaN. control-flow.md:72 (CTRL-2): `max` only
    // LOWERS the width — never to zero-with-completion. A gated host holds each
    // effect open, so the peak in flight is the admitted width. With zero workers
    // nothing ever awaits the gate: effects === 0 is the cleaner symptom, peak 0
    // corroborates.
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      ["let w = 1 % 0", 'par for f in [1, 2, 3, 4, 5] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    // Read the concurrent peak WHILE gated (the admitted width), then release
    // and drain to read the TOTAL effect count. Post-fix the width-1 clamp holds
    // one iteration in flight (peak 1) while all five drain sequentially once
    // released (total 5) — so the total is read AFTER the await, never before.
    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;
    const totalEffects = host.started;

    expect.soft(
      totalEffects,
      "all five effects must dispatch once the gate releases (RED today: 0 — zero workers spawn, Promise.all([]) already settled)",
    ).toBe(5);
    expect.soft(
      peakWhileGated,
      "CTRL-2: the clamped width holds exactly 1 iteration in flight (RED today: 0 — no iteration ever starts)",
    ).toBe(1);
    expect.soft(
      captured.map((d) => d.code),
      "the clamp-down is diagnosed (RED today: no runtime diagnostic)",
    ).toContain(RUNTIME_CODE);
    const diag = captured.find((d) => d.code === RUNTIME_CODE);
    expect.soft(
      diag?.message ?? "",
      "the widened message names the non-FINITE class (RED today: no diagnostic captured)",
    ).toContain("not a finite number");
  });

  it("C (Infinity): a `1 / 0` operand runs unthrottled with no diagnostic — the silent pre-0325 path", async () => {
    // expressions.md:236: `1 / 0` = Infinity. `Math.min(Infinity, 64)` = 64, so
    // Infinity survives the ≥1 floor and runs at the 64-throttle — all three
    // effects dispatch, but with NO diagnostic (the silent-width class). The fix
    // routes Infinity to the SAME clamp-1 + diagnostic branch as NaN: all three
    // still run (width 1 over 3 drains sequentially), now diagnosed. So the RED
    // gate is the ABSENT diagnostic; the effect count is invariant across the fix.
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ["let w = 1 / 0", 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join("\n"),
    );
    const collected = await driveToArray(body, host, captured);

    // Infinity is NOT the zero-workers class — every element runs, pre- and
    // post-fix. This is a stable fact, not a RED gate.
    expect(
      host.started,
      "Infinity runs everything; the fix is throttle→clamp+diagnose, not zero-workers",
    ).toBe(3);
    expect(collected.length, "CTRL-3: one element per input element").toBe(3);

    // RED today: no diagnostic — the silent unthrottled path. GREEN post-fix:
    // clamp to 1 with the widened runtime diagnostic.
    expect.soft(
      captured.map((d) => d.code),
      "a non-finite (Infinity) width is diagnosed, not silently run at the throttle (RED today: no runtime diagnostic)",
    ).toContain(RUNTIME_CODE);
    const diag = captured.find((d) => d.code === RUNTIME_CODE);
    expect.soft(
      diag?.message ?? "",
      "the widened message names the non-FINITE class (RED today: no diagnostic captured)",
    ).toContain("not a finite number");
  });

  it("D (hole-filler invariant): every produced element must correspond to a dispatched effect", async () => {
    // control-flow.md:74 (CTRL-3) + the `?? makeOk(null)` join. There is no seam
    // through `StatementEvalHost` that leaves a result slot unwritten at a width
    // ≥ 1: index claiming is synchronous and the pool drains to `n` (the join's
    // filler is dead code on every HEALTHY path). So the invariant is witnessed
    // by CONSTRUCTION off the width defect: today the NaN width writes ZERO
    // slots, yet the loop returns a full-length all-Ok array — the join
    // fabricated every element. The proxy for "this element was produced by a
    // real iteration" is that its effect dispatched, so effects-dispatched must
    // be at least the number of produced elements. RED today: 0 effects, 3
    // elements. Post-fix line-1 makes zero-workers unreachable (effects ≥ 1) and
    // line-2 converts any residual unwritten slot to a loud internal-error-class
    // throw naming the index — the Phase-4 verifier discharges line-2 by
    // reverting line-1 alone so unwritten slots recur and the throw fires.
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ["let w = 1 % 0", 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join("\n"),
    );
    const collected = await driveToArray(body, host, captured);

    expect(
      collected.length,
      "CTRL-3: the loop returns one element per input element",
    ).toBe(3);
    expect(
      host.started,
      "no element may be produced without a real iteration — the join must not fabricate over unwritten slots (RED today: 0 effects behind 3 produced elements)",
    ).toBeGreaterThanOrEqual(collected.length);
  });

  it("D2 (join-line routing lock): ParForUnwrittenSlotError is a plain Error routed to INTERNAL_ERROR_CODE, not a ThetaPanic", () => {
    // Cell D witnesses the hole-filler INVARIANT (effects ≥ elements); it never
    // constructs `ParForUnwrittenSlotError` directly, so a revert of the join
    // line ALONE (line-2, back to `results[index] ?? makeOk(null)`) would leave
    // this suite green — the class would exist, unexercised, in src with no
    // witness pinning where its throw is routed. This cell locks that routing
    // directly, modelled on the b0314/b0338 belt pattern: construct the error,
    // confirm it is NOT one of the six closed panic sources (so it must not be
    // swallowed as a panic), and confirm `surfaceUnexpectedThrow` reframes it to
    // the existing `INTERNAL_ERROR_CODE` surface one layer up, exactly as
    // `CompoundNonNumericError`/`BinaryNonNumericError` are (bug 0325, fixed in
    // 0.313.0).
    const thrown = new ParForUnwrittenSlotError(2);

    expect(
      isThetaPanic(thrown),
      "ParForUnwrittenSlotError is a plain Error, NOT a ThetaPanic (the six-source panic list is closed)",
    ).toBe(false);

    const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
    expect(
      diagnostic,
      "surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw",
    ).toBeDefined();
    const diag = diagnostic as Diagnostic;
    expect(
      diag.code,
      "the unwritten-slot defect routes to the existing permitted internal-error surface",
    ).toBe(INTERNAL_ERROR_CODE);
    expect(
      diag.message,
      "the message names the unwritten index",
    ).toContain("index 2");
    expect(
      thrown.message,
      "the message ties the defect to this bug's report",
    ).toContain("bug 0325");
  });

  it("E1 (CONTROL): an integer `max 2` throttles to 2 with no diagnostic — the byte-unchanged path", async () => {
    // CTRL-2: an intelligible integer width is untouched by this fix. GREEN today
    // AND post-fix.
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf('par for f in [1, 2, 3, 4, 5] max 2 { invoke("./c.theta", f) }');
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: `max 2` admits at most 2 iterations in flight — the integer path is unchanged",
    ).toBe(2);
    expect(
      captured.map((d) => d.code),
      "an intelligible integer width emits no runtime diagnostic",
    ).not.toContain(RUNTIME_CODE);
  });

  it("E2 (CONTROL): a NaN VALUE bound and read is legal — only the WIDTH read refuses it", async () => {
    // expressions.md:236: `1 % 0` = NaN is a first-class `number` value. The fix
    // refuses NaN only as a par-for WIDTH, never as an ordinary value. GREEN
    // today AND post-fix.
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(["let x = 1 % 0", "x"].join("\n"));
    const exec = await executeBody(body, execDeps(body, host, captured));

    expect(exec.result.present, "the body produces a final value").toBe(true);
    expect(
      typeof exec.result.value === "number" && Number.isNaN(exec.result.value),
      "a NaN value flows normally as a `number` — no panic, no downgrade",
    ).toBe(true);
    expect(
      captured.map((d) => d.code),
      "reading NaN as a value emits no par-for width diagnostic",
    ).not.toContain(RUNTIME_CODE);
  });
});
