// Bug 0368 — `+` and the four ordering operators (`<`/`<=`/`>`/`>=`) have no
// runtime operand belt, so an operand pairing the spec refuses silently
// JS-coerces when it reaches the runtime through a statically-WITHHELD operand
// (an unannotated `fn` param). The byte-identical laundering under `-` aborts
// loudly with bug 0332's `BinaryNonNumericError`, so the disposition of one
// spec-refused pairing depends on which operator the author picked.
// (docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md)
//
// TWO unbelted sinks, both measured here:
//   - EXECUTOR: `applyBinaryScalar` (src/runtime/statement-executor.ts:1069).
//     The `+` arm's else-branch is a raw JS `+`
//     (statement-executor.ts:1077 — `(left as number) + (right as number)`)
//     taken by any pair that is not two-strings; the ordering arms
//     (statement-executor.ts:1106,1108 — `(left as number | string) OP
//     (right as number | string)`) apply raw JS relational semantics to
//     whatever arrived. The compound `+=` mirror inlines the same raw `+`
//     (`applyCompound`, statement-executor.ts:711 — `(current as number) +
//     (delta as number)`), so `s += n` over a laundered string yields `"x1"`.
//   - PURE HOST: `evaluateBinaryExpression`
//     (src/extension/production-theta-producer.ts:7458). Byte-identical `+`
//     (production-theta-producer.ts:7485) and ordering
//     (production-theta-producer.ts:7513,7515) arms, serving `${…}`
//     interpolations and invoke/`.theta`-callable arguments.
// The sibling `-`/`*`/`/`/`%` arms in both sinks already throw bug 0332/0338's
// belt (statement-executor.ts:1091–1092) — the position asymmetry this closes.
//
// SETTLED FIX (this file pins the §Fix contract, not HEAD's — the belt lands in
// v0.348.0, the literal placeholder the fix's version fills): after the
// two-string arm, `+` requires two numbers; `<`/`<=`/`>`/`>=` require two
// numbers or two strings; otherwise throw a plain `Error` (NOT a `ThetaPanic`)
// that propagates uncaught out of `executeBody` and routes through
// `surfaceUnexpectedThrow` (src/runtime/runtime-panics.ts) to
// `INTERNAL_ERROR_CODE` (`theta/runtime/internal-error`) — a LOUD FRAMED abort,
// not a crash and not a silent coerced value. `NaN`/`Infinity` are
// `typeof "number"`, so the belt must NOT fire on them (div/mod-by-zero
// products flow through `+`/ordering unbelted, as the spec requires). Applied
// identically in both sinks, and the compound `+=` mirror gains the same check.
// This harness drives `executeBody` directly (the sibling bug 0332 / bug 0338
// shape), so the belt throw surfaces here as the caught throw; the assertions
// route it through the SAME `surfaceUnexpectedThrow` the producer's frame uses,
// asserting the FRAMED disposition — code + `/^internal error: /` prefix + that
// it threw — never the implementer's tail wording.
//
// WITNESS TABLE (the FIXED contract; every FLIP is RED now, every CONTROL GREEN):
//   EXECUTOR (probeSource → applyBinaryScalar / applyCompound):
//     D1  fn f(a,b){a+b}  / f("x",1)   FLIP  HEAD success "x1"; post-fix loud
//     D2  fn f(a,b){a+b}  / f(null,5)  FLIP  HEAD success 5;    post-fix loud
//     D3  fn f(a,b){a+b}  / f(true,true) FLIP HEAD success 2;   post-fix loud
//     D4  fn f(a,b){a+b}  / f([1],[2]) FLIP  HEAD success "12"; post-fix loud
//     D5  fn g(a,b){a<b}  / g(true,2)  FLIP  HEAD success true;  post-fix loud
//     D6  fn g(a,b){a<b}  / g("5",3)   FLIP  HEAD success false; post-fix loud
//     D7  fn g(a,b){a<=b} / g(null,1)  FLIP  HEAD success true;  post-fix loud
//     CP  fn f(a){let mut s=a; s+=1; s} / f("x")  FLIP  HEAD success "x1";
//                                                       post-fix loud (compound)
//     D8  fn f(a,b){a-b}  / f("a",1)   CONTROL already loud (bug 0332 belt) —
//                                              the asymmetry witness; green ∀
//     CS+ fn f(a,b){a+b}  / f("x","y") CONTROL success "xy" (two-string)
//     CS< fn g(a,b){a<b}  / g("a","b") CONTROL success true  (two-string order)
//     CN+ fn f(a,b){a+b}  / f(2,3)     CONTROL success 5
//     CN< fn g(a,b){a<b}  / g(2,3)     CONTROL success true
//     CNaN+ fn f(a,b){a+b}/ f(1%0,2)   CONTROL success NaN (NaN carve-out)
//     CInf+ fn f(a,b){a+b}/ f(3/0,1)   CONTROL success Infinity (carve-out)
//     CNaN< fn g(a,b){a<b}/ g(1%0,2)   CONTROL success false (NaN < 2)
//     CInf< fn g(a,b){a<b}/ g(3/0,2)   CONTROL success false (Infinity < 2)
//   PURE HOST (second sink, evaluateBinaryExpression):
//     PI      fn f(a,b){ @`v=${a+b}` } / f("x",1)   FLIP  HEAD renders + sends
//                 ["v=x1"]; post-fix render throws before send (assertFrames…)
//     PInvoke fn f(a,b){ invoke("./c.theta", a+b) } / f("x",1)  FLIP  HEAD binds
//                 coerced "x1" and reaches callee load (parseCalleeCalls===1);
//                 post-fix loud abort BEFORE callee load (parseCalleeCalls===0)
//
// RED-FOR-RIGHT-REASON, per row (each `it` names the observed HEAD coercion, and
// every flip's first `expect` reds by NAMING the silent coerced value):
//   D1  red: `"x" + 1` binds "x1" (string+number concat), no throw.
//   D2  red: `null + 5` binds 5 (null→0), no throw.
//   D3  red: `true + true` binds 2 (bool→1), no throw.
//   D4  red: `[1] + [2]` binds "12" (array stringify), no throw.
//   D5  red: `true < 2` binds true (bool→1), no throw.
//   D6  red: `"5" < 3` binds false ("5"→5), no throw.
//   D7  red: `null <= 1` binds true (null→0), no throw.
//   CP  red: `"x" += 1` binds "x1" via applyCompound's inlined raw `+`, no throw.
//   PI  red: the interpolation renders "x1" and the query text ["v=x1"] is sent,
//            instead of the belt throwing before the send.
//   PInvoke red: `#resolveInvoke` coerces `"x" + 1` to "x1", binds it, and
//            reaches the callee load (parseCalleeCalls===1) with no throw.
//   D8 / CS+ / CS< / CN+ / CN< / CNaN+ / CInf+ / CNaN< / CInf< CONTROL:
//            byte-identical guards — green at HEAD and after. If any reds, the
//            belt over-reached into two-string, numeric, or NaN/Infinity pairs
//            (or perturbed bug 0332's `-` belt, D8).

import { describe, expect, it } from "vitest";
import type { ThetaSource } from "../src/lexer/lexer";
import {
  parseThetaDocument,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { type BodyExecution } from "../src/runtime/statement-executor";
import type { ThetaValue } from "../src/runtime/value";
import { parseDeps } from "./helpers/e2e-s1";
import { assertInternalError, assertValue, makeBeltProbes, render } from "./helpers/runtime-belt-probe-harness";

const FM = "---\nmode: prompt\n---\n";

/** The zero body range `surfaceUnexpectedThrow` frames a throw against. */
const SITE = {
  file: "b0368.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

// ===========================================================================
// Shared parse harness (the b0332 / b0338 shape, verbatim): parseThetaDocument →
// createProductionProducerDeps → bindPromptConversation → executeBody. Offline,
// provider-free, deterministic.
// ===========================================================================

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: "b0368.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every
 * fixture this drives is parse-clean at HEAD BECAUSE its operands are WITHHELD
 * `fn` params (statically unresolvable), so `checkPlusOperands` /
 * `checkOrderingOperands` DEFER exactly as `checkArithmeticOperands` does — the
 * class this report measures is the deferred RUNTIME path, never a parse gap. A
 * rejection here is a harness precondition breach, never a silent skip.
 */
function parseTheta(src: string): ThetaDocument {
  const doc = parseOnly(src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

// ===========================================================================
// EXECUTOR harness. `rootDouble`/`producer`/`probeSource`/`assertValue` (and
// the PURE-HOST `InstantSettleSession`/`driveInterp`/`driveInvoke` below) are
// shared with the b0369 sibling file (tests/helpers/runtime-belt-probe-harness.ts,
// PTQ-0397); `Probe` stays local — `assertLoudThrow` below still needs it. A
// raw non-panic throw propagates out of `executeBody` uncaught (the framing
// that reclassifies it lives one layer up, theta-composition-producer.ts), so
// both dispositions are observable here.
// ===========================================================================

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

const { probeSource, driveInterp, driveInvoke } = makeBeltProbes(parseTheta, "b0368");

/**
 * Assert a runtime-loud-throw row (every FLIP + the D8 asymmetry control): the
 * runtime threw a plain `Error` (NOT a `ThetaPanic`) that routes through
 * `surfaceUnexpectedThrow` to the existing `internal-error` surface.
 * `leakDescription` names the silent value the current tree produces instead;
 * the first `expect` reds NAMING it, so the run shows the defect (silent
 * success) rather than a bare assertion count.
 */
function assertLoudThrow(probe: Probe, leakDescription: string, what: string): void {
  if (probe.kind === "value") {
    expect(
      `success value ${render(probe.execution.result.value)}`,
      `${what}: a laundered non-(two-string/two-number) pair reaching \`+\`/ordering must throw LOUDLY (${leakDescription})`,
    ).toBe("runtime loud throw");
    return;
  }
  assertFramesToInternalError(probe.thrown, what);
}

// ===========================================================================
// D1–D7 + CP — the executor FLIP rows. Each laundered pairing over `+`, an
// ordering operator, or the compound `+=` mirror must abort loudly at runtime.
// RED at HEAD: the body silently succeeds with the JS-coerced value named at the
// `it`.
// ===========================================================================

describe("bug 0368 D1–D7 + CP — laundered `+`/ordering/`+=` operands throw loudly at the executor belt", () => {
  const flipRows: ReadonlyArray<readonly [string, string, string]> = [
    ["D1", 'fn f(a, b) { a + b }\nf("x", 1)', 'at HEAD binds "x1" (string+number concatenation)'],
    ["D2", "fn f(a, b) { a + b }\nf(null, 5)", "at HEAD binds 5 (null coerces to 0)"],
    ["D3", "fn f(a, b) { a + b }\nf(true, true)", "at HEAD binds 2 (booleans coerce to 1)"],
    ["D4", "fn f(a, b) { a + b }\nf([1], [2])", 'at HEAD binds "12" (arrays stringify)'],
    ["D5", "fn g(a, b) { a < b }\ng(true, 2)", "at HEAD binds true (true coerces to 1)"],
    ["D6", 'fn g(a, b) { a < b }\ng("5", 3)', 'at HEAD binds false ("5" coerces to number 5)'],
    ["D7", "fn g(a, b) { a <= b }\ng(null, 1)", "at HEAD binds true (null coerces to 0)"],
    ["CP", "fn f(a) { let mut s = a\ns += 1\ns }\nf(\"x\")", 'at HEAD binds "x1" via applyCompound\'s inlined raw `+`'],
  ];
  for (const [id, src, leak] of flipRows) {
    it(`RED (${id}): throws (${leak})`, async () => {
      assertLoudThrow(await probeSource(src), leak, id);
    });
  }
});

// ===========================================================================
// D8 — CONTROL, the asymmetry witness. The byte-identical laundering one
// operator over (`a - b`) already throws bug 0332's `BinaryNonNumericError`,
// routing to internal-error. GREEN at HEAD (the `-` belt is untouched) and after
// (this fix must not perturb it). If it reds, bug 0332's belt was disturbed.
// ===========================================================================

describe("bug 0368 D8 — the `-` asymmetry control is loud now and after", () => {
  it('CONTROL (D8): `fn f(a, b) { a - b }` / `f("a", 1)` throws (bug 0332 belt, untouched)', async () => {
    assertLoudThrow(
      await probeSource('fn f(a, b) { a - b }\nf("a", 1)'),
      "the `-` belt already fires; this fix must leave it byte-identical",
      "D8",
    );
  });
});

// ===========================================================================
// Value CONTROLS — two-string `+`/ordering and all-numeric pairs. Byte-identical:
// GREEN at HEAD and after. If any reds, the belt over-reached into a pairing the
// spec ADMITS.
// ===========================================================================

describe("bug 0368 value controls — two-string and numeric pairs are byte-identical", () => {
  const controlRows: ReadonlyArray<readonly [string, string, ThetaValue]> = [
    ["CS+", 'fn f(a, b) { a + b }\nf("x", "y")', "xy"],
    ["CS<", 'fn g(a, b) { a < b }\ng("a", "b")', true],
    ["CN+", "fn f(a, b) { a + b }\nf(2, 3)", 5],
    ["CN<", "fn g(a, b) { a < b }\ng(2, 3)", true],
    ["CNaN<", "fn g(a, b) { a < b }\ng(1 % 0, 2)", false],
    ["CInf<", "fn g(a, b) { a < b }\ng(3 / 0, 2)", false],
  ];
  for (const [id, src, expected] of controlRows) {
    it(`CONTROL (${id}): admitted pair yields ${render(expected)}`, async () => {
      assertValue(await probeSource(src), expected, id);
    });
  }
});

// ===========================================================================
// NaN / Infinity CONTROLS — `+` over a non-finite NUMBER. `NaN`/`Infinity` are
// `typeof "number"`, so the belt must NOT fire and the arithmetic proceeds. These
// use Number.isNaN / `=== Infinity` rather than toEqual(NaN) (NaN !== NaN).
// GREEN at HEAD and after; witness nothing, guard the carve-out.
// ===========================================================================

describe("bug 0368 NaN/Infinity controls — non-finite numbers stay admitted (belt must not fire)", () => {
  it("CONTROL (CNaN+): `f(1 % 0, 2)` binds NaN (renders JSON null)", async () => {
    const probe = await probeSource("fn f(a, b) { a + b }\nf(1 % 0, 2)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "CNaN+: NaN is typeof number; the belt must NOT fire — `NaN + 2` binds NaN",
      ).toBe("success value NaN");
      return;
    }
    expect(probe.execution.outcome, "CNaN+: the body must succeed").toBe("success");
    expect(
      Number.isNaN(probe.execution.result.value as number),
      `CNaN+: \`NaN + 2\` is NaN (the div/mod-by-zero carve-out); got ${render(probe.execution.result.value)}`,
    ).toBe(true);
  });

  it("CONTROL (CInf+): `f(3 / 0, 1)` binds Infinity", async () => {
    const probe = await probeSource("fn f(a, b) { a + b }\nf(3 / 0, 1)");
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "CInf+: Infinity is typeof number; the belt must NOT fire — `Infinity + 1` binds Infinity",
      ).toBe("success value Infinity");
      return;
    }
    expect(probe.execution.outcome, "CInf+: the body must succeed").toBe("success");
    expect(
      probe.execution.result.value === Infinity,
      `CInf+: \`Infinity + 1\` is Infinity (the div/mod-by-zero carve-out); got ${render(probe.execution.result.value)}`,
    ).toBe(true);
  });
});

/**
 * Shared framing assertion: a caught throw must be the belt's plain `Error` (NOT
 * a `ThetaPanic`) that `surfaceUnexpectedThrow` frames to INTERNAL_ERROR_CODE —
 * the LOUD FRAMED disposition, not an unframed crash.
 */
function assertFramesToInternalError(thrown: unknown, what: string): void {
  assertInternalError(
    thrown,
    SITE,
    what,
    `${what}: the belt is a plain Error, NOT a ThetaPanic (the six-source panic list is closed); thrown: ${String(thrown)}`,
  );
}

// ===========================================================================
// PI — interpolation position. The operands are WITHHELD `fn` params, so the
// interpolation `${a + b}` inside f's body DEFERS at parse (bug 0345's descent
// cannot resolve a withheld param) and the pure host is the backstop. Calling
// `f("x", 1)` at top level dispatches the query, rendering the interpolation
// through `evaluateBinaryExpression`. RED at HEAD: the render coerces `"x" + 1`
// to "x1" and the query text ["v=x1"] is sent, instead of the belt throwing
// before the send.
// ===========================================================================

describe("bug 0368 PI — laundered `+` in interpolation position renders + sends the coerced text", () => {
  it('RED (PI): `fn f(a, b) { @`v=${a + b}` }` / `f("x", 1)` — HEAD sends ["v=x1"]; post-fix throws before send', async () => {
    const probe = await driveInterp('fn f(a, b) { @`v=${a + b}` }\nf("x", 1)');
    if (probe.kind === "rendered") {
      // RED-for-right-reason: the coerced "x1" was rendered into the prompt and
      // handed to sendUserMessage — the silent value reached the query text.
      expect(
        `${probe.outcome}; sent=${JSON.stringify(probe.sent)}`,
        "PI: the laundered `+` interpolation must abort at render (before send), not coerce and send the prompt",
      ).toBe('threw; sent=[]');
      return;
    }
    assertFramesToInternalError(probe.thrown, "PI");
    expect(
      probe.sent,
      "PI: the belt throws at render, so nothing is handed to sendUserMessage",
    ).toEqual([]);
  });
});

// ===========================================================================
// PInvoke — invoke-argument position. The operand is a WITHHELD `fn` param
// (statically unresolvable → parse defers), so `#resolveInvoke` binds the arg at
// runtime through the pure host. RED at HEAD: `"x" + 1` coerces to "x1", binds,
// and reaches the callee load (`parseCallee` called) with no throw — the coerced
// value is on its way to the child boundary. Mirrors b0338 A1 with `+`.
// ===========================================================================

describe("bug 0368 PInvoke — laundered `+` invoke arg reaches callee load carrying the coerced value", () => {
  it('RED (PInvoke): `fn f(a, b) { invoke("./c.theta", a + b) }` / `f("x", 1)` — HEAD binds "x1" and reaches callee load (parseCalleeCalls===1); post-fix aborts pre-load', async () => {
    const probe = await driveInvoke('fn f(a, b) { invoke("./c.theta", a + b) }\nf("x", 1)');
    if (probe.kind === "value") {
      // RED-for-right-reason: the coerced "x1" was bound and the invoke advanced
      // to callee load (parseCallee reached), on its way to the child boundary.
      expect(
        `value; parseCalleeCalls=${probe.parseCalleeCalls}`,
        "PInvoke: the invoking theta must abort loudly at arg binding, before any callee load or child spawn",
      ).toBe("loud framed abort; parseCalleeCalls=0");
      return;
    }
    assertFramesToInternalError(probe.thrown, "PInvoke");
    expect(
      probe.parseCalleeCalls,
      "PInvoke: the belt throws at arg binding, so the callee is never loaded and no child is spawned",
    ).toBe(0);
  });
});
