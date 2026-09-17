import { parseDoc } from "./helpers/e2e-s1";
import { rootDouble } from "./helpers/call-with-clause-harness";
import {
  makeBeltProbes,
  type Probe,
  render,
  assertValue,
  producer as beltProducer,
} from "./helpers/runtime-belt-probe-harness";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { type ThetaDocument } from "../src/parser/theta-document";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";






// Bug 0314 — the five compound-assignment forms (`+= -= *= /= %=`) on a
// non-numeric `let mut` binding parse clean and silently overwrite the value
// with `0` (or `NaN`). The parse position judges only RHS `⊑` target
// (`checkReassignRhsCompat` in `src/parser/type-compat.ts`), which a same-type
// pair always satisfies, so the operator operand checks never fire; the runtime
// `applyCompound` (`src/runtime/statement-executor.ts`) coerced every
// non-number operand to `0` and the `case "reassign"` arm's `applyCompound`
// call wrote the fabricated number back.
// (docs/bugs/0314-compound-assign-non-numeric-silent-zero.md)
//
// PARENT-RATIFIED REMEDY (Option A). This file encodes the ratified witness
// table below, NOT the bug document's original single-disposition Expected
// column. The remedy blends the doc's two candidate fixes:
//   - `+=` gains the real `+` semantics: two `string` operands concatenate
//     (`docs/spec_topics/expressions.md` §"`+` operator" — "On two `string`
//     operands, concatenation"), so `s += "b"` loads and yields `"ab"`.
//   - the parse layer routes the implied binary through the existing operator
//     check `pushMixedPlusIfNeeded` (`src/parser/type-layer-checks.ts`), so
//     `+=` on `array`/`boolean` reds at parse with
//     `theta/parse/mixed-plus-operands`.
//   - `applyCompound`'s `: 0` coercions go: a non-number reaching a numeric
//     compound at runtime (`-=`/`*=`/`/=`/`%=` on a string) is a LOUD defect,
//     not a silent `0`/`NaN`.
//   - the numeric control (P1e) stays byte-identical.
//
// RATIFIED WITNESS TABLE (the FIXED contract this file pins; RED now unless a
// row is marked CONTROL):
//   P1a  let mut s = "a" / s += "b" / s              → success value "ab"
//   P1b  let mut s = "a" / s -= "b" / s              → RUNTIME LOUD THROW
//   P1c  let mut xs = [1] / xs += [2] / xs           → PARSE theta/parse/mixed-plus-operands
//   P1d  let mut b = true / b += false / b           → PARSE theta/parse/mixed-plus-operands
//   X4   let mut s = "a" / s %= "b" / s              → RUNTIME LOUD THROW
//   X1   let mut s = "a" / s += "b" / let n = s.length / n → success value 2
//   P1e  let mut n = 1 / n += 2 / n                  → success value 3 (CONTROL)
//
// RUNTIME LOUD THROW — surfaced shape, measured from the code (not invented):
// a plain `Error` (NOT a `ThetaPanic`) thrown from the runtime propagates
// UNCAUGHT out of `executeBody` — the reframing lives one layer up in
// theta-composition-producer.ts. So at this harness layer (the
// tests/non-object-receiver-gate pattern) P1b/X4 are observed as a THROW caught
// by the `try`/`catch` in `probeSource` (`kind === "threw"`). The caught throw
// fed through `surfaceUnexpectedThrow` (`src/runtime/runtime-panics.ts`) must
// route to the EXISTING permitted internal-error surface: `.code ===
// INTERNAL_ERROR_CODE` (`src/runtime/runtime-panics.ts`) and `.message` starts
// with `internal error: `. The message TAIL wording is the implementer's to
// choose — this file asserts only the code, the prefix, and that it threw.
//
// RED-FOR-RIGHT-REASON, per row (each is stated at its `it` and shown in the run):
//   P1a red: value is 0, not "ab" (both operands coerced to 0; 0 + 0 = 0).
//   P1b red: no throw — silent success value 0.
//   P1c/P1d red: parse is CLEAN at HEAD (no mixed-plus-operands; RHS `⊑` target
//               is the only judgement, and it passes).
//   X4  red: no throw — silent success value NaN (0 % 0), rendered JSON `null`.
//   X1  red: throws MissingObjectKeyPanic ("missing object key: length") — the
//           corrupted number receiver falls through to the member presence gate.
//   P1e CONTROL: byte-identical numeric guard — GREEN at HEAD (value 3) and must
//               stay green; it witnesses nothing, it guards the fix's promise
//               that the numeric path is untouched.

// ===========================================================================
// The registry code the desugared `+` on array/boolean operands must red with.
// ===========================================================================

/** expressions.md §"`+` operator" — a `+` whose operands are not both numeric / both string. */
const MIXED_PLUS_OPERANDS_CODE = "theta/parse/mixed-plus-operands";

// ===========================================================================
// Shared parse + production-executor harness (the non-object-receiver-gate
// pattern, verbatim in shape): parseThetaDocument → createProductionProducerDeps
// → bindPromptConversation → executeBody. Offline, provider-free, deterministic.
// ===========================================================================

function parseOnly(path: string, src: string): ThetaDocument {
  return parseDoc(src, path);
}

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

function producer() {
  return beltProducer(rootDouble());
}

const FM = "---\nmode: prompt\n---\n";

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "b0314.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

const { probeSource } = makeBeltProbes((src) => parseTheta("b0314.theta", FM + src), "b0314", { root: rootDouble });

/** Error-severity diagnostic codes from a parse-only run (the parse-refusal rows). */
function parseErrorCodes(src: string): string[] {
  const doc = parseOnly("b0314.theta", FM + src);
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

/**
 * Assert a runtime-loud-throw row (P1b / X4): the runtime threw a plain `Error`
 * (NOT a `ThetaPanic`) that routes through `surfaceUnexpectedThrow` to the
 * existing `internal-error` surface. `leakAtHead` is the silent value the
 * current tree produces instead; the first `expect` reds naming it, so the run
 * shows the defect (silent success) rather than a bare assertion count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a numeric compound over a non-number operand must throw LOUDLY (${leakDescription}); at HEAD it silently succeeds`,
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
// P1a — `+=` on two strings concatenates (the `+` rule), yielding "ab".
// RED at HEAD: both operands coerce to 0, so the value is 0 not "ab".
// ===========================================================================

describe("bug 0314 P1a — `s += \"b\"` concatenates under the `+` rule", () => {
  it('RED (P1a): `let mut s = "a"` / `s += "b"` / `s` yields "ab", not 0', async () => {
    assertValue(await probeSource('let mut s = "a"\ns += "b"\ns'), "ab", "P1a");
  });
});

// ===========================================================================
// P1b — `-=` on strings is a numeric operator over non-numbers → LOUD THROW.
// RED at HEAD: no throw; silent success value 0 (0 - 0).
// ===========================================================================

describe("bug 0314 P1b — `s -= \"b\"` throws loudly instead of writing 0", () => {
  it('RED (P1b): `let mut s = "a"` / `s -= "b"` / `s` throws (was silent 0)', async () => {
    assertLoudThrow(
      await probeSource('let mut s = "a"\ns -= "b"\ns'),
      "at HEAD writes 0",
      "P1b",
    );
  });
});

// ===========================================================================
// P1c — `+=` on two arrays is `theta/parse/mixed-plus-operands`
// (expressions.md §"`+` operator" — `+` on `array<T>` is not supported). RED at
// HEAD: parse is CLEAN — the
// implied `xs + [2]` is never formed, so only RHS `⊑` target is judged and it
// passes.
// ===========================================================================

describe("bug 0314 P1c — `xs += [2]` reds at parse with mixed-plus-operands", () => {
  it("RED (P1c): `let mut xs = [1]` / `xs += [2]` / `xs` reds at parse", () => {
    expect(
      parseErrorCodes("let mut xs = [1]\nxs += [2]\nxs"),
      "P1c: the desugared `xs + [2]` must red with mixed-plus-operands; at HEAD parse is clean ([])",
    ).toContain(MIXED_PLUS_OPERANDS_CODE);
  });
});

// ===========================================================================
// P1d — `+=` on two booleans is `theta/parse/mixed-plus-operands`. RED at HEAD:
// parse is CLEAN (RHS `⊑` target passes for boolean/boolean).
// ===========================================================================

describe("bug 0314 P1d — `b += false` reds at parse with mixed-plus-operands", () => {
  it("RED (P1d): `let mut b = true` / `b += false` / `b` reds at parse", () => {
    expect(
      parseErrorCodes("let mut b = true\nb += false\nb"),
      "P1d: the desugared `b + false` must red with mixed-plus-operands; at HEAD parse is clean ([])",
    ).toContain(MIXED_PLUS_OPERANDS_CODE);
  });
});

// ===========================================================================
// X4 — `%=` on strings is a numeric operator over non-numbers → LOUD THROW.
// RED at HEAD: no throw; silent success value NaN (0 % 0), rendered JSON `null`.
// ===========================================================================

describe("bug 0314 X4 — `s %= \"b\"` throws loudly instead of writing NaN", () => {
  it('RED (X4): `let mut s = "a"` / `s %= "b"` / `s` throws (was silent NaN)', async () => {
    assertLoudThrow(
      await probeSource('let mut s = "a"\ns %= "b"\ns'),
      "at HEAD writes NaN (0 % 0), JSON null",
      "X4",
    );
  });
});

// ===========================================================================
// X1 — the follow-on: with the fix, `s += "b"` makes `s == "ab"`, so `s.length`
// is 2 and the pre-fix MissingObjectKeyPanic dissolves. RED at HEAD: `s` is the
// number 0, and reading `.length` on it aborts with MissingObjectKeyPanic
// ("missing object key: length").
// ===========================================================================

describe("bug 0314 X1 — the corrupted-receiver panic dissolves once += concatenates", () => {
  it('RED (X1): `s += "b"` then `let n = s.length` / `n` yields 2', async () => {
    assertValue(
      await probeSource('let mut s = "a"\ns += "b"\nlet n = s.length\nn'),
      2,
      "X1",
    );
  });
});

// ===========================================================================
// P1e — CONTROL. The numeric compound path must be byte-identical: GREEN at
// HEAD (value 3) and GREEN after. This row witnesses nothing; it guards the
// fix's promise that the numeric compound is untouched. If it ever reds, the
// fix over-reached into the numeric arm.
// ===========================================================================

describe("bug 0314 P1e — numeric compound control (byte-identical, green now and after)", () => {
  it("CONTROL (P1e): `let mut n = 1` / `n += 2` / `n` yields 3", async () => {
    assertValue(await probeSource("let mut n = 1\nn += 2\nn"), 3, "P1e");
  });
});
