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
// Bug 0438 — a laundered finite NON-integral `par for max` operand ≥ 1 (`2.5`,
// `63.9`) is silently `Math.floor`ed into the in-flight width (`2.5` → width 2,
// ZERO diagnostics) — the only silent cell in CTRL-2's runtime width matrix,
// whose every sibling class (`0.5`, `0`, NaN, non-number) is loud and whose
// direct spelling (`max 2.5`) is parse-refused. Witness suite (Phase 1, RED);
// fix deferred to Phase 2 (§Fix option 1, parent-ratified reuse-the-code).
// ===========================================================================
//
// Rule under witness (control-flow.md:72, CTRL-2): "`n` is any `integer`-typed
// expression" and "`max` only *lowers* the in-flight width". A finite value
// whose fractional part is non-zero and whose floor is ≥ 1 (`2.5`, `63.9`) is
// not an `integer` under any reading the spec admits, yet the runtime accepts
// it: `Math.floor` silently rewrites it to a width the author never stated and
// no diagnostic is raised on any channel. Every adjacent value class in the
// same matrix is loud — the deferred path exists precisely so it is never
// silent (0324 non-number, 0325 non-finite, 0326 sub-1), and this is the one
// arm the progression left silent.
//
// Root cause (src/runtime/statement-executor.ts): the finite-number branch gates
// on `Number.isFinite` ONLY (statement-executor.ts:1873) — no integrality test.
// `const requested = Math.floor(maxResult.value)` (statement-executor.ts:1880)
// truncates the fractional, and the `requested >= 1` arm
// (statement-executor.ts:1894-1896) sets `width = Math.max(1, Math.min(requested,
// PAR_FOR_THROTTLE))` with NO `deps.emitDiagnostic` call — the only silent arm.
// Both surrounding arms emit: `< 1` → par-max-non-positive
// (statement-executor.ts:1887, bug 0326), non-number/non-finite →
// par-max-non-integer (statement-executor.ts:1905-1910, bugs 0324/0325).
//
// Fix disposition (Phase 2, option 1 — WIDEN-par-max-non-integer): the number
// branch adds a `Number.isInteger(maxResult.value)` conjunct so a finite
// non-integral value whose floor is ≥ 1 routes to the EXISTING
// `theta/runtime/par-max-non-integer` emission, clamp-to-1. That code's message
// is REWORDED (its registered "is not a finite number" is false of `2.5`) to
// exactly `'par for' max operand is not a finite integer; in-flight width
// clamped to 1`. The sub-1 fractional (`0.5`, floor 0) stays 0326's
// par-max-non-positive class (control A3), and correct integers stay
// byte-identical (controls A4/bnd) — the fix lowers `2.5` to width 1 and
// touches nothing else.
//
// Observables (modelled on tests/b0326-max-non-positive-runtime.test.ts's
// `ParForHost`): a gated effect host holds every iteration open, so the peak
// in-flight count is the width the executor admits. The FLIP cells RED at fork
// for the silent-floor reason — `2.5` floors to width 2 (peak 2, not 1) with no
// par-max-non-integer diagnostic and no reworded message. The CONTROL/STATIC
// cells fence the fix: correct integers unaffected (A4/bnd), the `< 1` and
// non-finite classes keep their existing codes (A3/A2/D3), and the direct
// spelling stays parse-refused (A5).
//
// emitDiagnostic wiring: the production `ExecuteBodyDeps` already carries the
// optional `emitDiagnostic?:` runtime channel (statement-executor.ts:203, since
// bug 0324); the `DiagnosticSpyDeps` interface below only TIGHTENS that field
// from optional to required so the capturing spy is statically guaranteed wired
// — no src/ change. The executeBody seam runs the body REGARDLESS of parse/load
// diagnostics, standing in for the deferred/`unknown` runtime route whose
// laundered fractional VALUE reaches the width read (b0324's own comment says
// so); the `let w = 2.5` binding launders the fractional so the executor's
// internal `evalExpr` resolves the ident to the runtime value, not a literal.

/** The code the fix reuses for the finite non-integral ≥ 1 class (option 1). */
const NON_INTEGER_CODE = "theta/runtime/par-max-non-integer";
/** The reworded message the fix pins on that code (parent adjudication). */
const NON_INTEGER_MESSAGE =
  "'par for' max operand is not a finite integer; in-flight width clamped to 1";
/** The 0326 code — the sub-1 class this fix must NOT steal from (control A3). */
const NON_POSITIVE_CODE = "theta/runtime/par-max-non-positive";
/** The parse-side refusal of the DIRECT spelling `max 2.5` (control A5). */
const INTEGER_NARROWING_CODE = "theta/parse/integer-narrowing";

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
 * of tests/b0326-max-non-positive-runtime.test.ts: the bounded pure forms a
 * fan-out body needs are evaluated against the real per-iteration environment,
 * and `runEffect` is a checkpointed effect held open on `gate` so the in-flight
 * peak is the width the executor admits. The `max` operand itself (`w`, `2`) is
 * computed by the executor's internal `evalExpr`, not by this host — so the
 * laundered `let w = 2.5` value reaches the width read exactly as a deferred
 * runtime operand would.
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

describe("bug 0438 runtime — a laundered finite non-integral `max` ≥ 1 must clamp to 1 AND diagnose, not silently floor", () => {
  it("FLIP A1: laundered `max 2.5` over 5 gated elements clamps to peak 1, drains 5 Ok, and emits par-max-non-integer with the reworded message", async () => {
    // The witness. At fork the number branch (statement-executor.ts:1873) gates
    // on `Number.isFinite` only: `Math.floor(2.5)` = 2 (statement-executor.ts:1880),
    // the `>= 1` arm (statement-executor.ts:1894-1896) sets width 2 with NO
    // emit — so peak 2 (RED, want 1) and zero par-max-non-integer (RED, want 1).
    // The 5 Ok elements are correct BOTH sides (the S4 bound: values/ordering
    // are never wrong, only the silently-rewritten scheduling width).
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      ["let w = 2.5", 'par for f in [1, 2, 3, 4, 5] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    const exec = await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: a finite non-integral `max` value clamps the in-flight width DOWN to 1 (RED at fork: 2 — the silent `Math.floor(2.5)`)",
    ).toBe(1);
    expect(
      okCount(exec.result.value),
      "S4 bound: the clamped loop still drains every element to Ok, both sides of the fix",
    ).toBe(5);
    expect(
      countCode(captured, NON_INTEGER_CODE),
      "RED at fork: no par-max-non-integer diagnostic today — the ≥1 non-integral arm is the only silent arm; the fix routes it here exactly once",
    ).toBe(1);
    const diag = captured.find((d) => d.code === NON_INTEGER_CODE);
    expect(
      diag?.message ?? "",
      "RED at fork: no diagnostic captured; post-fix the message is reworded so `2.5` no longer draws the false `is not a finite number`",
    ).toBe(NON_INTEGER_MESSAGE);
  });

  it("FLIP A1b: a larger laundered fractional `max 63.9` over 5 gated elements clamps to peak 1 and emits par-max-non-integer with the reworded message", async () => {
    // Strengthens A1 across the fractional range: at fork `Math.floor(63.9)` =
    // 63 (statement-executor.ts:1880), and with 5 elements the width-63 pool
    // runs them all in one batch — peak 5 (RED, want 1) — and stays silent
    // (RED, want 1 par-max-non-integer). Rules out an A1 artefact of `2.5`
    // flooring to exactly 2.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      ["let w = 63.9", 'par for f in [1, 2, 3, 4, 5] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    const exec = await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: `63.9` is not an interpretable width and clamps DOWN to 1 (RED at fork: 5 — the width-63 floor admits all 5 elements at once)",
    ).toBe(1);
    expect(
      okCount(exec.result.value),
      "S4 bound: values correct both sides",
    ).toBe(5);
    expect(
      countCode(captured, NON_INTEGER_CODE),
      "RED at fork: the larger fractional is silently floored too; the fix routes it to par-max-non-integer exactly once",
    ).toBe(1);
    const diag = captured.find((d) => d.code === NON_INTEGER_CODE);
    expect(
      diag?.message ?? "",
      "RED at fork: no diagnostic; post-fix carries the reworded `is not a finite integer` message",
    ).toBe(NON_INTEGER_MESSAGE);
  });

  it("CONTROL A4: `max 2` literal throttles to peak 2 with NO par-max-non-integer diagnostic — the correct-integer class is byte-identical", async () => {
    // The fix must not over-fire on integers: `2` is `Number.isInteger`, so it
    // stays on the ordinary `>= 1` arm at width 2. Green now and after.
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
      "a correct integer width emits no par-max-non-integer diagnostic",
    ).not.toContain(NON_INTEGER_CODE);
  });

  it("CONTROL bnd: `max 1` and `max 3` integers are unaffected (peak 1 / peak 3, no par-max-non-integer)", async () => {
    // The integer boundary either side of `2.5`'s floor: an integrality
    // conjunct must fire ONLY on non-integers, never on legal integer widths.
    for (const [maxLit, expectedPeak] of [
      ["1", 1],
      ["3", 3],
    ] as const) {
      const host = new ParForHost();
      const captured: Diagnostic[] = [];
      let release!: () => void;
      host.gate = new Promise<void>((res) => {
        release = res;
      });

      const body = bodyOf(
        `par for f in [1, 2, 3, 4, 5] max ${maxLit} { invoke("./c.theta", f) }`,
      );
      // eslint-disable-next-line no-await-in-loop
      const execPromise = executeBody(body, execDeps(body, host, captured));
      // eslint-disable-next-line no-await-in-loop
      await tick(30);

      const peakWhileGated = host.peakInFlight;
      release();
      // eslint-disable-next-line no-await-in-loop
      await execPromise;

      expect(
        peakWhileGated,
        `CTRL-2: \`max ${maxLit}\` admits at most ${expectedPeak} in flight — a legal integer width`,
      ).toBe(expectedPeak);
      expect(
        captured.map((d) => d.code),
        `\`max ${maxLit}\` is a legal integer: the integrality diagnostic never fires`,
      ).not.toContain(NON_INTEGER_CODE);
    }
  });

  it("CONTROL A3: a laundered sub-1 fractional `max 0.5` stays 0326's par-max-non-positive class and does NOT draw par-max-non-integer", async () => {
    // `Math.floor(0.5)` = 0 < 1, so `0.5` reaches 0326's `< 1` arm
    // (statement-executor.ts:1881-1893) and draws par-max-non-positive — the
    // fix must NOT reclassify it. CODE-only assertion: par-max-non-positive's
    // message is out of scope here.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ["let w = 0.5", 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    await executeBody(body, execDeps(body, host, captured));

    expect(
      captured.map((d) => d.code),
      "the sub-1 fractional stays on par-max-non-positive (0326's class)",
    ).toContain(NON_POSITIVE_CODE);
    expect(
      captured.map((d) => d.code),
      "the sub-1 fractional does NOT draw par-max-non-integer — the fix leaves the `< 1` arm alone",
    ).not.toContain(NON_INTEGER_CODE);
  });

  it("CONTROL A2: a laundered NaN `max 0 % 0` stays on par-max-non-integer (CODE only — its message also rewords post-fix)", async () => {
    // `0 % 0` = NaN reaches the non-finite `else` branch
    // (statement-executor.ts:1897-1911) and draws par-max-non-integer both at
    // fork and post-fix. Asserting on the message here would be a false control:
    // the fix rewords that shared code's message, so only the CODE is invariant.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ["let w = 0 % 0", 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    await executeBody(body, execDeps(body, host, captured));

    expect(
      captured.map((d) => d.code),
      "the NaN class stays on par-max-non-integer (0325 fence) — CODE invariant across the rewording",
    ).toContain(NON_INTEGER_CODE);
  });

  it("CONTROL D3: a laundered zero `max 0 - 0` stays on par-max-non-positive", async () => {
    // `0 - 0` = 0 → `Math.floor(0)` = 0 < 1 → par-max-non-positive
    // (statement-executor.ts:1881-1893). The integer-zero class is 0326's, not
    // this fix's — it must stay put.
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    const body = bodyOf(
      ["let w = 0 - 0", 'par for f in [1, 2, 3] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    await executeBody(body, execDeps(body, host, captured));

    expect(
      captured.map((d) => d.code),
      "the integer-zero class stays on par-max-non-positive (0326's class)",
    ).toContain(NON_POSITIVE_CODE);
  });
});

describe("bug 0438 static — the DIRECT spelling `max 2.5` is parse-refused (the runtime silent-floor class is reachable only through the deferred path)", () => {
  it("STATIC A5: `let r = par for f in [1, 2, 3] max 2.5 { f }` draws theta/parse/integer-narrowing", () => {
    // The spelled literal never reaches the runtime seam — CTRL-2's parse gate
    // refuses a `number`-typed `max` operand with integer-narrowing. This is
    // why the FLIP cells must LAUNDER `2.5` through a binding: only the
    // deferred/`unknown` path delivers a fractional VALUE to the width read,
    // and only there is the runtime silent. This cell is a parse-diagnostic
    // check (codesOf), independent of the executeBody seam. Green now and after.
    expect(
      codesOf("let r = par for f in [1, 2, 3] max 2.5 { f }\nr"),
      "the direct `max 2.5` spelling is parse-refused with integer-narrowing",
    ).toContain(INTEGER_NARROWING_CODE);
  });
});
