import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0346 — the two checker-side LUBs carry the literal-candidate asymmetry
// bug 0344 removed from `commonType` (the array/ternary LUB). `leastUpperBound`
// (src/parser/match-result.ts, the match-arm LUB behind `checkMatchArmTypes`)
// and `computeLub` (src/parser/functions.ts, the inferred-return LUB behind
// `resolveReturnType`) both search for a MEMBER of their contribution set that
// every member is `⊑`, and both relate candidates AS-IS. For the pairing
// `{prim integer, literal number}` neither member dominates: `literal number ⊑
// prim integer` is `integer-narrowing`, and `prim integer ⊑ literal number` is
// `incompatible` (`decide`'s literal-target arm, src/parser/type-compat.ts). The
// candidate set is empty and the LUB is `undefined`, so the callers refuse —
// `theta/parse/match-arm-type-mismatch` at the `match`,
// `theta/parse/return-no-common-type` at the inferred return — and
// `hasLoadParseError` denies registration of a program the member-LUB contract
// (docs/reference/type-system.md, the 0158 reconciliation) admits: `1.5` types
// as `number` in expression position (TYPE-3), `integer ⊑ number` (TYPE-2), so
// `number` is a member every contribution is `⊑`. The array spelling of the
// same reconciliation (`let xs = [n, 1.5]`) already types `array<number>` after
// bug 0344, so two constructs the spec binds to one discipline disagree.
// (docs/bugs/0346-checker-side-lubs-literal-candidate-asymmetry.md)
//
// SETTLED FIX (bug doc §Fix): widen each candidate to the primitive it types as
// before the domination test at both checker LUBs — the change bug 0344 landed
// in `commonType`, applied to `leastUpperBound` and `computeLub`. Reuse
// `widenLiteralTypes` (src/parser/type-compat.ts, the function bug 0341 ships)
// to derive each candidate's expression-position type and return the widened
// member as the LUB, so `{prim integer, literal number}` reduces to `number`:
// `prim number` dominates `prim integer` under TYPE-2. `⊑` does not change; the
// member-restricted discipline is preserved (a genuinely memberless set still
// refuses); the least-candidate scan and sink arm are untouched.
//
// WITNESS TABLE (Observed = current/RED, Expected = the settled contract):
//   M1  WITNESS  match `{ 1 => n, _ => 1.5 }` over integer n     refuses -> []
//   M2  CONTROL  match `{ 1 => n, _ => m }` two prim candidates   [] = []
//   M3  CONTROL  match `{ 1 => 1, _ => 1.5 }` two literal cands   [] = []
//   M4  WITNESS  match `{ 1 => 1.5, _ => n }` order-independent   refuses -> []
//   M5  WITNESS  match bound then read `r + 1`, registration      refuses -> []
//   R1  WITNESS  fn return {param a: integer, 1.5}               refuses -> []
//   R2  CONTROL  fn return {param a, param b} two prim contribs   [] = []
//   R3  WITNESS  fn return {1.5, param a} order-independent       refuses -> []
//   R4  CONTROL  fn return annotated `: number` bypasses lub      [] = []
//   O   ORACLE   {integer, number} => `number` at all 3 surfaces  agree
//   S   WITNESS  match binding fed to integer param + string sink  under-types -> fn-arg-mismatch
//   Fm  CONTROL  match `{integer, string}` genuinely memberless   still refuses
//   Fr  CONTROL  fn return {integer, string} genuinely memberless still refuses
//
// RED-FOR-RIGHT-REASON: M1/M4/M5 fail because pre-fix `leastUpperBound` finds
// no dominating member and `checkMatchArmTypes` emits
// `theta/parse/match-arm-type-mismatch` where the widened member LUB is
// `number` (Expected []); R1/R3 fail because pre-fix `computeLub` returns
// `undefined` and `resolveReturnType` emits `theta/parse/return-no-common-type`
// where the widened member LUB is `number` (Expected []); the oracle match /
// inferred-return sinks fail because the resolved type is absent / refused
// where the array sibling already renders `number`. M2/M3/R2/R4 and the two
// memberless fences are green in both directions and prove the widening
// collapses only the mixed prim-integer + literal-number pairing, leaving the
// two-prim / two-literal collapse and the member-restricted refusal untouched.

const MATCH_MISMATCH = "theta/parse/match-arm-type-mismatch";
const RETURN_NO_COMMON = "theta/parse/return-no-common-type";
const FN_ARG_MISMATCH = "theta/parse/fn-arg-type-mismatch";

/** Parse a body under the minimal frontmatter every cell here shares. */
function diagnosticsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc(`---\ndescription: b0346\nmode: prompt\n---\n${body.join("\n")}\n`).diagnostics;
}

function codesOf(body: readonly string[]): string[] {
  return diagnosticsOf(body).map((d) => d.code);
}

function messagesOf(body: readonly string[]): string[] {
  return diagnosticsOf(body).map((d) => d.message);
}

/**
 * The scalar sink message that prints a resolved type. A binding assigned to a
 * mismatching annotation renders `got <T>` — the only offline surface that
 * exposes a checker LUB's resolved type verbatim (TYPE-9, type-compat.ts). The
 * `array<string>` variant is bug 0344's array-surface sibling.
 */
function scalarSink(got: string): string {
  return `let binding 'ys' initialiser type mismatch: expected string, got ${got}`;
}

function arraySink(element: string): string {
  return `let binding 'ys' initialiser type mismatch: expected array<string>, got array<${element}>`;
}

/** The scalar primitive a sink message resolved, `array<X>` normalised to `X`. */
function gotType(message: string): string {
  const match = message.match(/got (?:array<)?([a-z]+)>?$/);
  return match?.[1] ?? message;
}

// ── leastUpperBound (match arms) ───────────────────────────────────────────

describe("bug 0346 M1 (WITNESS) — match arms {integer n, 1.5} reduce to `number`", () => {
  it("M1: `match 1 { 1 => n, _ => 1.5 }` over an integer-typed n draws no diagnostic", () => {
    const body = ["let n: integer = 1", "match 1 { 1 => n, _ => 1.5 }"];
    // The witness asserts only the settled contract so the cell reds now (pre-fix
    // `leastUpperBound` finds no dominating member and `checkMatchArmTypes` emits
    // the spurious `match-arm-type-mismatch`) and greens after the widening. The
    // RED run output shows that spurious code is the sole pre-fix diagnostic —
    // the documented symptom, not an unrelated throw.
    expect(codesOf(body)).toEqual([]);
  });
});

describe("bug 0346 M2 (CONTROL) — two prim candidates collapse", () => {
  it("M2: `match 1 { 1 => n, _ => m }` over integer n and number m stays []", () => {
    // Two `prim` contributions: `prim number` dominates `prim integer` under
    // TYPE-2 with no widening, so the pair already collapses. Green both ways.
    expect(codesOf(["let n: integer = 1", "let m: number = 1.5", "match 1 { 1 => n, _ => m }"])).toEqual(
      [],
    );
  });
});

describe("bug 0346 M3 (CONTROL) — two literal candidates collapse", () => {
  it("M3: `match 1 { 1 => 1, _ => 1.5 }` stays []", () => {
    // Two `literal` contributions collapse through `decidePrimitive`; the pair
    // reduces even though the widened member the fix returns is a `prim`.
    expect(codesOf(["match 1 { 1 => 1, _ => 1.5 }"])).toEqual([]);
  });
});

describe("bug 0346 M4 (WITNESS) — the match LUB is order-independent", () => {
  it("M4: `match 1 { 1 => 1.5, _ => n }` reduces to `number` regardless of arm order", () => {
    const body = ["let n: integer = 1", "match 1 { 1 => 1.5, _ => n }"];
    // Arm order must not decide the LUB; pre-fix the reversed pairing refuses
    // identically to M1. Expected [].
    expect(codesOf(body)).toEqual([]);
  });
});

describe("bug 0346 M5 (WITNESS) — registration is not denied before the read", () => {
  it("M5: a bound match `r` reduced to `number` admits `r + 1`", () => {
    const body = ["let n: integer = 1", "let r = match 1 { 1 => n, _ => 1.5 }", "r + 1"];
    // Pre-fix the match row fires match-arm-type-mismatch and registration is
    // denied before `r + 1` is ever read; post-fix `r` types `number` and the
    // read admits. Expected [].
    expect(codesOf(body)).toEqual([]);
  });
});

// ── computeLub (inferred returns) ──────────────────────────────────────────
// The integer contribution MUST be a PARAMETER: a local `let a: integer = 1`
// reads `unknown` in the return-inference env and does not reproduce (bug doc
// §Reproduction). The parameter places `{prim integer}` in the contribution set.

describe("bug 0346 R1 (WITNESS) — inferred-return {param integer, 1.5} reduces to `number`", () => {
  it("R1: `fn g(a: integer)` returning `a` or `1.5` draws no diagnostic", () => {
    const body = ["fn g(a: integer) {", "  if true { return a }", "  1.5", "}", "g(1)"];
    // The witness asserts only the settled contract so the cell reds now (pre-fix
    // `computeLub` returns `undefined` and `resolveReturnType` emits the spurious
    // `return-no-common-type`) and greens after the widening. The RED run output
    // shows that spurious code is the sole pre-fix diagnostic — the documented
    // symptom, not an unrelated throw.
    expect(codesOf(body)).toEqual([]);
  });
});

describe("bug 0346 R2 (CONTROL) — two prim contributions collapse", () => {
  it("R2: `fn g(a: integer, b: number)` returning `a` or `b` stays []", () => {
    // Two `prim` contributions; `prim number` dominates `prim integer` under
    // TYPE-2 with no widening. Green both ways.
    const body = ["fn g(a: integer, b: number) {", "  if true { return a }", "  b", "}", "g(1, 1.5)"];
    expect(codesOf(body)).toEqual([]);
  });
});

describe("bug 0346 R3 (WITNESS) — the return LUB is order-independent", () => {
  it("R3: `fn g(a: integer)` returning `1.5` or `a` reduces to `number` regardless of order", () => {
    const body = ["fn g(a: integer) {", "  if false { return 1.5 }", "  a", "}", "g(1)"];
    expect(codesOf(body)).toEqual([]);
  });
});

describe("bug 0346 R4 (CONTROL) — an explicit return annotation bypasses computeLub", () => {
  it("R4: `fn g(a: integer): number` returning `a` or `1.5` stays []", () => {
    // The annotated return type means `computeLub` is never invoked; the
    // refusal path is not taken. Green both ways.
    const body = ["fn g(a: integer): number {", "  if true { return a }", "  1.5", "}", "g(1)"];
    expect(codesOf(body)).toEqual([]);
  });
});

// ── Oracle — the 0158 reconciliation invariant ─────────────────────────────
// On {integer, number} (a set WITH a dominating member) all THREE LUB surfaces
// return the primitive `number`. Observe each resolved type through the scalar
// sink (mismatching annotation renders `got <T>`).

describe("bug 0346 O (ORACLE) — the three LUB surfaces agree on `number`", () => {
  it("O: array, match, and inferred-return LUBs all resolve {integer, number} to `number`", () => {
    // Array surface — already `number` post-0344; the sibling the checker LUBs
    // must now agree with.
    const arraySurface = messagesOf([
      "let n: integer = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    expect(arraySurface).toEqual([arraySink("number")]);

    // Match surface — observable via the third-site `#matchArmType` mirror:
    // `r` resolves `number`, so the scalar sink renders `got number`. Absent the
    // inference-pass mirror the pass under-types `r` as `integer` and the sink
    // renders `got integer` (the current two-site tree — RED, cell S locks the
    // same observable).
    const matchSurface = messagesOf([
      "let n: integer = 1",
      "let r = match 1 { 1 => n, _ => 1.5 }",
      "let ys: string = r",
      "ys",
    ]);
    expect(matchSurface).toEqual([scalarSink("number")]);

    // The invariant read as an oracle over the two OBSERVABLE binding-sink
    // surfaces — array and match both render the same scalar `number` (the
    // array surface as `array<number>`, normalised).
    //
    // WHY the return surface is NOT read through a binding sink here: a call
    // never surfaces its return type through a downstream binding sink — the
    // inference pass computes no return LUB for calls (bug 0158), so
    // `let ys: string = g(1)` yields no mismatch for ANY fix and is
    // unobservable. `computeLub` returning `number` on {integer, number} is
    // discharged by R1/R3's ADMISSION alone (absence of
    // `return-no-common-type`), not by a binding sink.
    expect([
      gotType(arraySurface[0] ?? ""),
      gotType(matchSurface[0] ?? ""),
    ]).toEqual(["number", "number"]);
  });
});

// ── S — the inference-pass mirror closes the under-typing hole ──────────────
// The match-arm dominating-member search has a THIRD copy: `#matchArmType` in
// src/parser/static-type-inference.ts, the inference-pass mirror of
// `leastUpperBound`. `leastUpperBound` is unexported (it calls the production
// `checkCompatible` directly), so the pass keeps an independent copy rather than
// delegating the way it reaches `commonType` via `#commonType`. The two-site
// checker fix admits the asymmetric match, but until this pass mirror widens its
// candidate too the pass under-types the bound `r` as `integer` while the
// checker admits the arms — a value that is `1.5` at runtime flows into an
// integer-only parameter with NO diagnostic, strictly worse than the pre-fix
// wholesale refusal. The third-site widening types `r` as `number`, closing the
// hole. Both legs red on the current two-site tree for that documented reason.

describe("bug 0346 S (WITNESS/SOUNDNESS) — the inference-pass mirror closes the under-typing hole", () => {
  it("S: a match binding fed to an integer parameter draws fn-arg-type-mismatch", () => {
    const body = [
      "let n: integer = 1",
      "let r = match 1 { 1 => n, _ => 1.5 }",
      "fn f(i: integer) { i }",
      "f(r)",
    ];
    // WHY: the two-site checker fix admits the match (no arm-mismatch), but
    // without the `#matchArmType` inference-pass mirror the pass under-types `r`
    // as `integer`, so `f(r)` accepts a runtime `1.5` into an integer parameter
    // with NO diagnostic — strictly worse than the pre-fix refusal. The
    // third-site widening makes `r` type `number`, so `f(r)` draws
    // fn-arg-type-mismatch and the hole is closed. RED NOW because the current
    // two-site tree under-types `r` and admits `f(r)` (codesOf(body) === []).
    expect(codesOf(body)).toContain(FN_ARG_MISMATCH);
  });

  it("S-sink: the match binding resolves `number`, so a string sink renders `got number`", () => {
    // WHY: `r` resolves `number` once the third-site `#matchArmType` widens its
    // candidate, so the mismatching string sink renders `got number` — was
    // `got integer` under the two-site-only fix. RED NOW ("got integer").
    const sink = messagesOf([
      "let n: integer = 1",
      "let r = match 1 { 1 => n, _ => 1.5 }",
      "let ys: string = r",
      "ys",
    ]);
    expect(sink).toEqual([scalarSink("number")]);
  });
});

// ── Memberless fences — the member-restricted discipline is unchanged ───────

describe("bug 0346 Fm (CONTROL) — a genuinely memberless match set still refuses", () => {
  it("Fm: `match 1 { 1 => n, _ => s }` over integer n and string s keeps refusing", () => {
    // {integer, string} has no dominator under any widening; widening literals
    // to primitives never manufactures a dominator here. Still refuses.
    const body = ["let n: integer = 1", 'let s: string = "a"', "match 1 { 1 => n, _ => s }"];
    expect(codesOf(body)).toContain(MATCH_MISMATCH);
  });
});

describe("bug 0346 Fr (CONTROL) — a genuinely memberless return set still refuses", () => {
  it("Fr: `fn g(a: integer, s: string)` returning `a` or `s` keeps refusing", () => {
    const body = ["fn g(a: integer, s: string) {", "  if true { return a }", "  s", "}", 'g(1, "a")'];
    expect(codesOf(body)).toContain(RETURN_NO_COMMON);
  });
});
