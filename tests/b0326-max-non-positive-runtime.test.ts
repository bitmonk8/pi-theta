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
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
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
// Bug 0326 — a non-positive integer `par for max` operand (`max 0`, `max -3`,
// a computed `max 0 - 3`) is silently RAISED to width 1 by the ≥1 floor with
// ZERO diagnostics. Witness suite (Phase 1, RED). Fixed in 0.343.0.
// ===========================================================================
//
// Rule under witness (control-flow.md:72, CTRL-2): "at most `max n` iterations
// are in flight" and "`max` only *lowers* the in-flight width". For the
// integer-valued class `n < 1`, the implementation VIOLATES both clauses: 1 in
// flight exceeds "at most 0", and 1 > 0 is a RAISE, not a lowering. This is the
// one operand class where the clamp increases the author's stated bound, and it
// does so with no diagnostic and no spec sentence licensing it.
//
// Root cause (src/runtime/statement-executor.ts): the finite-number branch reads
// `const requested = Math.floor(maxResult.value)` (statement-executor.ts:1580)
// then `width = Math.max(1, Math.min(requested, PAR_FOR_THROTTLE))`
// (statement-executor.ts:1581). For `requested < 1` the `Math.max(1, …)` floor
// silently substitutes 1 — no `deps.emitDiagnostic` call on this path.
//
// Fix disposition (settled — DEFINE-THE-CLAMP-WITH-A-DIAGNOSTIC): after the
// `Math.floor`, a value-domain test — `requested < 1` → `width = 1` AND emit a
// NEW dedicated runtime code `theta/runtime/par-max-non-positive`
// (message: `'par for' max operand must be at least 1; in-flight width clamped
// to 1`) through the existing `deps.emitDiagnostic?.(…)` channel
// (statement-executor.ts:203). This mirrors 0324 (non-number) and 0325
// (non-finite), both of which clamp to 1 + emit `theta/runtime/par-max-non-integer`
// on the sibling `else` branch. `max 1` and above stay legal (NO diagnostic) —
// the test is `< 1`, NOT `<= 1`.
//
// Observables (modelled on tests/b0324-max-non-number-runtime.test.ts's
// `ParForHost`): a gated effect host holds every iteration open, so the peak
// in-flight count is the width the executor admits. At fork the ≥1 floor already
// clamps `max 0`/negatives to width 1 — so the PEAK is green today and post-fix.
// The RED gate is the ABSENT `par-max-non-positive` diagnostic on the `< 1`
// class: today that clamp is silent. Controls C/D/E/F/G pin that the ONLY thing
// missing at fork is that new diagnostic on the `< 1` class.
//
// emitDiagnostic wiring: the production `ExecuteBodyDeps` already carries the
// optional `emitDiagnostic?:` channel (statement-executor.ts:203, added when
// bug 0324 landed) and both sibling emits already call it. The `DiagnosticSpyDeps`
// interface below only TIGHTENS that field from optional to required so the
// capturing spy is statically guaranteed to be wired — no src/ change.

/** The new dedicated code the fix emits for the integer-valued `< 1` class. */
const NON_POSITIVE_CODE = "theta/runtime/par-max-non-positive";
/** The message the fix pins for the new code (parent adjudication). */
const NON_POSITIVE_MESSAGE =
  "'par for' max operand must be at least 1; in-flight width clamped to 1";
/** The 0324/0325 code — the sibling class this fix must NOT steal from. */
const NON_INTEGER_CODE = "theta/runtime/par-max-non-integer";

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

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
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
 * A gated `StatementEvalHost` for `par for` bodies, modelled on the `ParForHost`
 * of tests/b0324-max-non-number-runtime.test.ts: the bounded pure forms a
 * fan-out body needs are evaluated against the real per-iteration environment,
 * and `runEffect` is a checkpointed effect held open on `gate` so the in-flight
 * peak is the width the executor admits. The `max` operand itself (`0`, `0 - 3`,
 * `w`) is computed by the executor's internal `evalExpr`, not by this host, so
 * this pure surface is minimal.
 */
class ParForHost implements StatementEvalHost {
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
 * The production type carries `emitDiagnostic?:` since bug 0324 landed
 * (statement-executor.ts:203); this override only tightens it so the capturing
 * spy is guaranteed wired — no src/ change.
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

/** Count of `Ok(_)` envelopes in a loop's `array<Result>` value. */
// `BodyExecution.result.value` is `ThetaValue | undefined` (an absent-tail
// drive resolves to no value); the non-array guard already maps `undefined` to
// the sentinel, so the parameter admits it directly.
function okCount(value: ThetaValue | undefined): number {
  if (!Array.isArray(value)) {
    return -1;
  }
  return value.filter((e) => isResultValue(e) && e.ok).length;
}

/** Count of captured diagnostics carrying `code`. */
function countCode(captured: readonly Diagnostic[], code: string): number {
  return captured.filter((d) => d.code === code).length;
}

describe("bug 0326 runtime — a non-positive integer `max` value must clamp to 1 AND diagnose", () => {
  it("A: `max 0` over 5 gated elements holds peak 1, completes with 5 Ok, and emits par-max-non-positive exactly once", async () => {
    // CTRL-2: `max 0` means "admit no work"; the runtime instead runs 1-wide to
    // completion. The clamp to 1 is the pinned disposition — but it must NOT be
    // silent. Peak 1 and 5 Ok elements are green at fork (the ≥1 floor already
    // clamps); the RED gate is the absent new diagnostic on this `< 1` class.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 0 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    const exec = await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: `max 0` clamps the in-flight width to 1 (green at fork — the ≥1 floor)",
    ).toBe(1);
    expect(
      okCount(exec.result.value),
      "the clamped loop still drains every element to Ok",
    ).toBe(5);
    expect(
      countCode(captured, NON_POSITIVE_CODE),
      "RED at fork: no par-max-non-positive diagnostic today — the ≥1 floor raises silently; the fix emits it exactly once",
    ).toBe(1);
    const diag = captured.find((d) => d.code === NON_POSITIVE_CODE);
    expect(
      diag?.message ?? "",
      "RED at fork: no diagnostic captured; post-fix the message names the at-least-1 rule",
    ).toBe(NON_POSITIVE_MESSAGE);
  });

  it("B: a computed `max 0 - 3` (negative binary expr) holds peak 1, completes with 5 Ok, and emits par-max-non-positive exactly once", async () => {
    // `0 - 3` = -3 is computed by the executor's internal `evalExpr`; the width
    // read floors it, hits `Math.max(1, …)`, and raises to 1 silently. Computed
    // widths are the class that makes this a real trap (`max free_slots` at 0).
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 0 - 3 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    const exec = await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: a negative computed width clamps to 1 (green at fork — the ≥1 floor)",
    ).toBe(1);
    expect(
      okCount(exec.result.value),
      "the clamped loop still drains every element to Ok",
    ).toBe(5);
    expect(
      countCode(captured, NON_POSITIVE_CODE),
      "RED at fork: no par-max-non-positive diagnostic today on the computed-negative class; the fix emits it exactly once",
    ).toBe(1);
  });

  it("C (CONTROL): `max 2` throttles to peak 2 with no par-max-non-positive diagnostic — green now and after", async () => {
    // An intelligible width ≥ 1 is untouched by this fix. This control proves
    // the new branch does not over-fire on the ordinary integer path.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 2 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: `max 2` admits at most 2 in flight — the integer path is unchanged",
    ).toBe(2);
    expect(
      captured.map((d) => d.code),
      "an intelligible integer width emits no par-max-non-positive diagnostic",
    ).not.toContain(NON_POSITIVE_CODE);
  });

  it("D (BOUNDARY): `max 1` holds peak 1 with NO diagnostic — 1 is legal, so the test is `< 1` not `<= 1`", async () => {
    // The critical boundary. The fix's value-domain test fires only BELOW 1;
    // `max 1` is a legal author-stated width and must NOT draw the diagnostic.
    // A `<= 1` mis-implementation would red this cell.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 1 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: `max 1` admits exactly 1 in flight — a legal minimum width",
    ).toBe(1);
    expect(
      captured.map((d) => d.code),
      "`max 1` is legal: the diagnostic fires strictly below 1, never at 1",
    ).not.toContain(NON_POSITIVE_CODE);
  });

  it("E (0324-class CONTROL): a non-number `max` value still draws par-max-non-integer, NOT the new code", async () => {
    // A `string`-valued operand reaches the sibling `else` branch and emits the
    // 0324/0325 code. This proves the new `< 1` branch does not STEAL the
    // non-number class — the two branches stay disjoint.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ['let w = "abc"', 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    await executeBody(body, execDeps(body, host, captured));

    expect(
      captured.map((d) => d.code),
      "the non-number class stays on par-max-non-integer",
    ).toContain(NON_INTEGER_CODE);
    expect(
      captured.map((d) => d.code),
      "the non-number class does NOT draw the new non-positive code",
    ).not.toContain(NON_POSITIVE_CODE);
  });

  it("F (0325-class CONTROL): a NaN `max` value still draws par-max-non-integer, NOT the new code", async () => {
    // `1 % 0` = NaN (expressions.md:236) is computed by the executor's internal
    // `evalExpr`, so the NaN VALUE reaches the width read and falls to the
    // non-finite `else` branch (b0325's fence). This proves the new `< 1` branch
    // does not steal the non-finite class either.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ["let w = 1 % 0", 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    await executeBody(body, execDeps(body, host, captured));

    expect(
      captured.map((d) => d.code),
      "the NaN class stays on par-max-non-integer (b0325 fence)",
    ).toContain(NON_INTEGER_CODE);
    expect(
      captured.map((d) => d.code),
      "the NaN class does NOT draw the new non-positive code",
    ).not.toContain(NON_POSITIVE_CODE);
  });

  it("H: an empty iterand with `max 0` STILL emits par-max-non-positive and returns []", async () => {
    // The diagnostic fires PRE-ITERATION in the width-resolve block, before the
    // worker pool spawns — so the uniform rule fires whenever the resolved width
    // is < 1, regardless of iterand emptiness (both sibling emits fire here too).
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf('par for f in [] max 0 { invoke("./c.theta", f) }');
    const exec = await executeBody(body, execDeps(body, host, captured));

    expect(
      Array.isArray(exec.result.value) ? (exec.result.value as readonly ThetaValue[]).length : -1,
      "an empty iterand yields an empty result array",
    ).toBe(0);
    expect(
      countCode(captured, NON_POSITIVE_CODE),
      "RED at fork: no par-max-non-positive diagnostic today; the fix's width-resolve emit fires even with an empty iterand",
    ).toBe(1);
  });
});

describe("bug 0326 static — a non-positive `max` literal loads CLEAN (the type gate is untouched)", () => {
  it("G: `let r = par for f in [1, 2, 3] max 0 { f }` parses with zero diagnostics", () => {
    // The static half of this fix is NONE: `max 0` is a valid `integer`-typed
    // expression (CTRL-2's operand contract is type-only), so the type-layer
    // sink must keep loading it clean. The whole disposition is a RUNTIME
    // diagnostic; this cell pins the "static half = NONE" decision. Green now
    // and after.
    expect(
      codesOf("let r = par for f in [1, 2, 3] max 0 { f }\nr"),
      "`max 0` is integer-typed and loads clean — no load-time refusal",
    ).toEqual([]);
  });
});
