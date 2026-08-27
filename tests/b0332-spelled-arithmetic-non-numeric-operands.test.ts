import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0332 — the spelled binary operators `-`, `*`, `/`, `%` on non-numeric
// operands parse clean and silently JS-coerce. `docs/spec_topics/expressions.md`
// §"Other arithmetic" fixes the rule: "`-`, `*`, `/`, `%` accept only numeric
// operands." But `walkExpr`'s `case "binary"` arm
// (`src/parser/type-layer-checks.ts:3062`) gates only `&&`/`||`, `+`
// (`checkPlusOperands`), and the ordering operators (`checkOrderingOperands`);
// `-`/`*`/`/`/`%` fall through with no operand check. `#typeBinary`
// (`src/parser/static-type-inference.ts`) assigns each pairing a type without
// judging numericity, and `applyBinaryScalar`
// (`src/runtime/statement-executor.ts:1015`, arms at `:1025`–`:1032`) casts both
// operands `(x as number)` and applies the JS operator, so `"a" - "b"` → `NaN`
// (JSON `null`), `[1] - [2]` → `-1`, `true - false` → `1`. No diagnostic on any
// channel; every row runs to a `success` value.
// (docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
//
// SETTLED FIX (the parent-ratified route this file pins). This is the
// expression-position sibling of bug 0314's compound-assignment defect; 0314's
// fix added a runtime loud-throw for the compound path but left this path
// unguarded, and its `## Fix` §Residuals defers this surface to a future parse
// gate. The remedy has two parts:
//   - a parse-time numeric-operand gate in `walkExpr` for the spelled
//     `-`/`*`/`/`/`%`, mirroring `checkOrderingOperands` (including its deferral
//     on statically-unresolvable operands), emitting the NEW diagnostic code
//     `theta/parse/non-numeric-arithmetic-operands`.
//   - a runtime belt in `applyBinaryScalar`, mirroring 0314's `applyCompound`:
//     a non-number reaching `-`/`*`/`/`/`%` throws a plain `Error` (NOT a
//     `ThetaPanic`) that routes through `surfaceUnexpectedThrow` to
//     `INTERNAL_ERROR_CODE`. The belt catches the statically-invisible operand
//     the gate defers on (an unannotated fn param typed WITHHELD).
//
// WITNESS TABLE (the FIXED contract this file pins; RED now unless CONTROL):
//   G1  let x = "a" - "b" / x   → PARSE theta/parse/non-numeric-arithmetic-operands
//   G2  let x = "a" * "b" / x   → PARSE theta/parse/non-numeric-arithmetic-operands
//   G3  let x = "a" / "b" / x   → PARSE theta/parse/non-numeric-arithmetic-operands
//   G4  let x = "a" % "b" / x   → PARSE theta/parse/non-numeric-arithmetic-operands
//   G5  let x = [1] - [2] / x   → PARSE theta/parse/non-numeric-arithmetic-operands
//   G6  let x = true - false / x → PARSE theta/parse/non-numeric-arithmetic-operands
//   G7  let x = true * true / x → PARSE theta/parse/non-numeric-arithmetic-operands
//   G8  let x = "a" - 1 / x     → PARSE theta/parse/non-numeric-arithmetic-operands
//   C1  let x = 3 - 2 / x       → success value 1  (CONTROL)
//   C2  let x = 6 / 2 / x       → success value 3  (CONTROL)
//   C3  let x = 7 % 3 / x       → success value 1  (CONTROL)
//   C4  let x = 4 * 5 / x       → success value 20 (CONTROL)
//   B1  fn sub(a) { a - 1 } / sub("x") → RUNTIME LOUD THROW (belt)
//
// RUNTIME LOUD THROW — surfaced shape, measured from the code (not invented):
// a plain `Error` (NOT a `ThetaPanic`) thrown from the runtime propagates
// UNCAUGHT out of `executeBody` — the reframing lives one layer up in
// theta-composition-producer.ts. So at this harness layer B1 is observed as a
// THROW caught by the `try`/`catch` in `probeSource` (`kind === "threw"`). The
// caught throw fed through `surfaceUnexpectedThrow` must route to the existing
// permitted internal-error surface: `.code === INTERNAL_ERROR_CODE` and
// `.message` starts with `internal error: `. The message TAIL wording is the
// implementer's to choose — this file asserts only the code, the prefix, and
// that it threw.
//
// RED-FOR-RIGHT-REASON, per row (each is stated at its `it` and shown in the run):
//   G1–G8 red: parse is CLEAN at HEAD ([]) — `walkExpr`'s binary arm has no
//             numeric-operand check for `-`/`*`/`/`/`%`, so the spec-refused
//             pairing draws no diagnostic and binds a silent JS-coerced value.
//   B1 red:   no throw — the unannotated param defers the gate to runtime, and
//             `applyBinaryScalar` silently succeeds with NaN (`a - 1` where
//             `a == "x"`), instead of the belt's loud throw.
//   C1–C4 CONTROL: byte-identical numeric guard — GREEN at HEAD and must stay
//             green. They witness nothing; they guard the fix's promise that
//             the numeric arithmetic path is untouched. If any reds, the gate
//             over-reached into the numeric operands.

// ===========================================================================
// The NEW registry code the gate rows must red with. This is the DIAG-2 mint
// parallel to `theta/parse/non-orderable-operands` — the ordering operators
// already have their own row rather than sharing `mixed-plus-operands`, which
// is the closest structural match (§Fix).
// ===========================================================================

/** expressions.md §"Other arithmetic" — a spelled `-`/`*`/`/`/`%` whose operands are not both numeric. */
const NON_NUMERIC_ARITHMETIC_OPERANDS_CODE = "theta/parse/non-numeric-arithmetic-operands";

// ===========================================================================
// Shared parse + production-executor harness (the b0314 shape, verbatim):
// parseThetaDocument → createProductionProducerDeps → bindPromptConversation →
// executeBody. Offline, provider-free, deterministic.
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
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

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. The control
 * and belt rows (C1–C4 / B1) are parse-clean at HEAD by the bug's §Reproduction
 * (B1's unannotated param types WITHHELD, so the gate defers and parse stays
 * clean), so a rejection here is a harness precondition breach, never a silent
 * skip.
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseOnly(path, src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

const FM = "---\nmode: prompt\n---\n";

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "b0332.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/**
 * One probe's disposition: the body produced a value, or the runtime threw. A
 * raw non-panic throw propagates out of `executeBody` uncaught (the framing that
 * reclassifies it lives one layer up, theta-composition-producer.ts), so both
 * dispositions are observable here.
 */
type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("b0332.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0332",
    sourcePath: "/proj/b0332.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** Error-severity diagnostic codes from a parse-only run (the gate rows). */
function parseErrorCodes(src: string): string[] {
  const doc = parseOnly("b0332.theta", FM + src);
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

/**
 * Assert a value row: the body succeeded and its final value equals `expected`.
 * When the runtime threw instead, the first `expect` reds cleanly naming the
 * throw, rather than letting an uncaught throw escape the test.
 */
function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the witness table says success value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(
    probe.execution.result.value,
    `${what}: the numeric control value (byte-identical guard)`,
  ).toEqual(expected);
}

/**
 * Assert a runtime-loud-throw row (B1): the runtime threw a plain `Error` (NOT a
 * `ThetaPanic`) that routes through `surfaceUnexpectedThrow` to the existing
 * `internal-error` surface. `leakDescription` is the silent value the current
 * tree produces instead; the first `expect` reds naming it, so the run shows the
 * defect (silent success) rather than a bare assertion count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a spelled arithmetic op over a non-number operand must throw LOUDLY (${leakDescription})`,
    ).toBe("runtime loud throw");
    return;
  }
  expect(
    isThetaPanic(probe.thrown),
    `${what}: the loud throw is a plain Error, NOT a ThetaPanic (the six-source panic list is closed). Thrown: ${String(probe.thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(probe.thrown, SITE);
  expect(
    diagnostic,
    `${what}: surfaceUnexpectedThrow returns a Diagnostic for a non-panic throw`,
  ).toBeDefined();
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the loud throw routes to the existing permitted internal-error surface`,
  ).toBe(INTERNAL_ERROR_CODE);
  expect(
    diag.message,
    `${what}: the internal-error template prefix (tail wording is the implementer's)`,
  ).toMatch(/^internal error: /);
}

// ===========================================================================
// G1–G8 — the gate rows. Each spelled `-`/`*`/`/`/`%` over a statically
// non-numeric pair must red at PARSE with the new numeric-operand code. RED at
// HEAD: parse is CLEAN ([]) — the binary arm has no operand check for these
// operators, and the row binds a silent JS-coerced value.
// ===========================================================================

describe("bug 0332 G1–G8 — spelled arithmetic on non-numeric operands reds at parse", () => {
  const gateRows: ReadonlyArray<readonly [string, string, string]> = [
    ["G1", 'let x = "a" - "b"\nx', 'string `-` string → NaN (JSON null)'],
    ["G2", 'let x = "a" * "b"\nx', 'string `*` string → NaN (JSON null)'],
    ["G3", 'let x = "a" / "b"\nx', 'string `/` string → NaN (JSON null)'],
    ["G4", 'let x = "a" % "b"\nx', 'string `%` string → NaN (JSON null)'],
    ["G5", "let x = [1] - [2]\nx", "array `-` array → -1"],
    ["G6", "let x = true - false\nx", "boolean `-` boolean → 1"],
    ["G7", "let x = true * true\nx", "boolean `*` boolean → 1"],
    ["G8", 'let x = "a" - 1\nx', "mixed string/integer `-` → NaN (JSON null)"],
  ];
  for (const [id, src, symptom] of gateRows) {
    it(`RED (${id}): reds at parse (${symptom}); at HEAD parse is clean ([])`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: the spelled operator over a non-numeric pair must red with the numeric-operand code; at HEAD parse is clean ([])`,
      ).toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
  }
});

// ===========================================================================
// C1–C4 — CONTROL. Numeric arithmetic must be byte-identical: GREEN at HEAD and
// GREEN after. These witness nothing; they guard the fix's promise that the
// numeric operands are untouched. If any reds, the gate over-reached.
// ===========================================================================

describe("bug 0332 C1–C4 — numeric arithmetic controls (byte-identical, green now and after)", () => {
  const controlRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["C1", "let x = 3 - 2\nx", 1],
    ["C2", "let x = 6 / 2\nx", 3],
    ["C3", "let x = 7 % 3\nx", 1],
    ["C4", "let x = 4 * 5\nx", 20],
  ];
  for (const [id, src, expected] of controlRows) {
    it(`CONTROL (${id}): numeric arithmetic yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});

// ===========================================================================
// B1 — the runtime belt. An unannotated fn param types WITHHELD, so
// `classifyOperand` → "unknown" and the parse gate DEFERS (mirroring
// `checkOrderingOperands`'s deferral), leaving the row parse-clean. At runtime
// the non-number reaches `applyBinaryScalar` and must throw loudly. RED at HEAD:
// no throw — the body silently succeeds with NaN (`"x" - 1`), rendered JSON
// `null`.
// ===========================================================================

describe("bug 0332 B1 — statically-invisible operand throws loudly at the runtime belt", () => {
  it('RED (B1): `fn sub(a) { a - 1 }` / `sub("x")` throws (at HEAD silently succeeds with NaN)', async () => {
    assertLoudThrow(
      await probeSource('fn sub(a) { a - 1 }\nsub("x")'),
      "at HEAD silently succeeds with NaN",
      "B1",
    );
  });
});

// ===========================================================================
// N1 — §Non-goals control. The gate is binary-arithmetic only: the parser
// models unary `-` as a synthetic-null binary, and `checkArithmeticOperands`
// excludes that shape, so a bare unary-minus expression must draw no
// arithmetic-operand diagnostic. This pins the boundary rather than the
// compound-reassignment non-goal (already pinned by the registry row), since
// unary `-` is the shape most likely to be mistaken for a gated pairing.
// ===========================================================================

describe("bug 0332 N1 — unary minus is outside the gate (§Non-goals)", () => {
  const nonGoalRows: ReadonlyArray<readonly [string, string]> = [
    ["N1a", "let x = -3\nx"],
    ["N1b", "let y = -(2 + 3)\ny"],
  ];
  for (const [id, src] of nonGoalRows) {
    it(`CONTROL (${id}): unary minus over a numeric operand draws no arithmetic-operand code`, () => {
      expect(
        parseErrorCodes(src),
        `${id}: unary \`-\` is not the gated binary shape; it must not carry the new code`,
      ).not.toContain(NON_NUMERIC_ARITHMETIC_OPERANDS_CODE);
    });
  }
});
