import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { annotationToCompatType } from "../src/parser/type-layer-checks";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0083 — a `let` binding's declared annotation is discarded after the
// initialiser check: `walkStmt`'s `case "let"` records `bindings.set(stmt.name,
// rhsType)` — the report's pinned citation,
// src/parser/type-layer-checks.ts:572 at `d06daae3` — so every later reference
// resolves the INITIALISER's inferred type instead of the declared one
// (docs/bugs/0083-let-annotation-discarded-from-recorded-binding-type.md).
// Line citations elsewhere in this file target the tree carrying the fix.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/lexical.md:28 §"Number literals" — "`integer` widens
//     implicitly to `number` in arithmetic and assignment positions; the
//     reverse is `theta/parse/integer-narrowing`". A binding DECLARED `number`
//     holds a `number`; copying it into an `integer` slot is the reverse
//     direction, whether the `number` arrived by annotation or by inference.
//   - docs/spec_topics/type-system.md:36 TYPE-2 (`integer ⊑ number`) — the
//     relation `checkLetRhsCompat` already applies at the initialiser. Nothing
//     in the spec suspends it for later uses of the binding.
//   - docs/spec_topics/type-system.md:54 TYPE-11 — a `NamedType` declared by a
//     type-alias schema (`schema X = R`) IS `R`: "on whichever side of a
//     `T₁ ⊑ T₂` check it appears, it is replaced by its right-hand side".
//     The transparent form is therefore what the author declared, and
//     docs/spec_topics/type-system.md:52 TYPE-10 bounds the transparency — an
//     object-schema `named` stays nominal.
//   - docs/spec_topics/expressions.md:220 — "`[]` is the empty array; its
//     element type is inferred from context (binding annotation, parameter
//     type, or surrounding constructor field)".
//   - docs/spec_topics/control-flow.md:13 — "Annotate via a `let xs: array<T> =
//     []` immediately above the loop" is the prescribed accumulate-then-join
//     idiom, so it must load.
//   - docs/spec_topics/expressions.md:108 (`array<T>` stdlib table, `join`
//     row) — "Element type must be `string`; non-string element types are
//     `theta/parse/non-string-array-join`". `array<string>` is a `string`
//     element type.
//
// THE SETTLED FIX (§Fix option 1): the `let` arm records the DECLARED type
// (src/parser/type-layer-checks.ts:591–594). The initialiser has already been
// checked against the annotation by `checkLetRhsCompat` (:559–567), so
// recording the declared type admits no unchecked value. Both directions are
// the same line; group (a) locks the permissive half and group (b) the
// restrictive half, so a partial fix that closes only the visible false
// rejection stays red. The declared type is recorded in its
// TYPE-11-transparent form (`unfoldAlias`, src/parser/type-compat.ts:155),
// which group (d) owns.
//
// THE THREE CONSTRAINTS §Fix imposes, each locked below:
//   (i)   an unresolvable annotation (`annotationToCompatType` → `undefined`)
//         keeps falling back to `rhsType` — group (i);
//   (ii)  `integer → number` stays legal, so `let m: number = n` over an
//         `integer`-declared `n` emits nothing — a3;
//   (iii) the annotated-array element sink (:571–573) keeps suppressing the
//         sink-less `array-no-common-type` check, so a validly annotated union
//         array still loads — c1.
//
// RED / GREEN LEDGER, measured against the unfixed record line
// (`bindings.set(stmt.name, rhsType)`) at v0.54.0 (`61806a3a`). Red there,
// green after the fix: a1, b1, s12, d4, and the `let mut` pin. Every other row
// holds on the unfixed tree and must stay green — a2/b2 are the controls
// proving each checker fires at all on this harness; b3/b4/s3/s9 prove the
// array-element, method-receiver and primitive-receiver layers still run once
// the recorded type changes shape; and d1/d2/d3/d5 are the rows that red if
// the declared type is recorded OPAQUELY (d1/d2: an alias-of-array iterand
// falsely rejected; d3: the non-string join true positive silently lost) or if
// its transparency leaks past TYPE-11 (d5: an object schema unfolded out of
// nominal typing).
//
// ANTI-VACUITY. Nine of the seventeen parse cases expect a NON-empty code list, so
// a harness that stopped reaching the type layer (a frontmatter refusal, an
// unfed static-type pass) fails loudly here rather than turning the
// `toEqual([])` rows into silent passes. Every assertion is an ordered
// whole-list equality on the aggregated codes, so a spurious extra diagnostic
// cannot hide inside a containment check.
//
// MESSAGE TEXT IS DELIBERATELY NOT PINNED. `checkArrayJoin`'s message renders
// the offending element type (src/runtime/stdlib-array.ts:120), which is the
// very value the fix changes for b3 and s9 (`array<unknown>` → `array<integer>`
// / `array<Foo>`). The CODE is what the spec row prescribes and what stays
// invariant across the fix, so these rows assert codes; no registry read is
// required (DIAG-4 applies to asserted message strings, of which there are
// none here).
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string plus one direct call on
// the exported annotation parser. An integration tier would add a session
// round-trip to a parse-time observable and buy no reach; a live tier would
// make a static, fully determined observable stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips.

// --- production parse harness ----------------------------------------------
//
// `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the type layer under assertion is the production one.

/** The frontmatter every body below is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The aggregated diagnostic codes the production parse reports for `body`. */
function codesOf(body: readonly string[]): string[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics.map(
    (d: Diagnostic) => d.code,
  );
}

// ===========================================================================
// (a) Permissive direction — the declared widening must survive the binding.
// ===========================================================================

describe("0083 (a) — a `let` annotation wider than its initialiser is what later uses see", () => {
  it("a1: `let n: number = 1` then `let m: integer = n` narrows (reds today — the annotation is dropped and the check sees `integer → integer`)", () => {
    // `n` is DECLARED `number`, so copying it into an `integer` slot is the
    // `number → integer` direction lexical.md:28 reserves for
    // `theta/parse/integer-narrowing`. Today `n` reads back as the literal's
    // `integer`, and the guard the annotation exists to arm never fires.
    expect(codesOf(["let n: number = 1", "let m: integer = n", "1"])).toEqual([
      "theta/parse/integer-narrowing",
    ]);
  });

  it("a2: the same narrowing over an inferred `number` fires (control — the check itself works)", () => {
    // a1 and a2 differ only in whether `number` arrives by annotation or by
    // inference. This row is what makes a1's red attributable to the
    // annotation rather than to a missing checker.
    expect(codesOf(["let n = 1.5", "let m: integer = n", "1"])).toEqual([
      "theta/parse/integer-narrowing",
    ]);
  });

  it("a3: `let m: number = n` over an `integer`-declared `n` stays silent (constraint (ii) — TYPE-2 widening is legal)", () => {
    // TYPE-2 is `integer ⊑ number`. Recording the declared `integer` for `n`
    // must not make the legal widening direction report.
    expect(codesOf(["let n: integer = 1", "let m: number = n", "1"])).toEqual([]);
  });
});

// ===========================================================================
// (b) Restrictive direction — the declared element type must survive it too.
// ===========================================================================

describe("0083 (b) — a `let` annotation narrower than its initialiser is what later uses see", () => {
  it("b1: `let e: array<string> = []` then `e.join(\",\")` loads (reds today — the recorded element type is `unknown`)", () => {
    // expressions.md:220 sources the empty literal's element type from the
    // binding annotation, and control-flow.md:13 prescribes this exact idiom.
    // Today `typeOf([])` is `array<unknown>`, `checkArrayJoin` refuses it, and
    // the recommended shape does not load.
    expect(codesOf(["let e: array<string> = []", 'e.join(",")'])).toEqual([]);
  });

  it("b2: the same join over a non-empty `string` literal loads (control — inference supplies `string`)", () => {
    // The annotation and the inferred element type agree here, which is why
    // the defect is invisible to the existing suite.
    expect(codesOf(['let e: array<string> = ["a"]', 'e.join(",")'])).toEqual([]);
  });

  it("b3: `let e: array<integer> = []` then `.join` still reports the non-string element type", () => {
    // The code is invariant across the fix; only its reason moves, from an
    // `unknown` element type to the declared `integer` one. `array<integer>`
    // is a non-string element type under expressions.md:108 either way.
    expect(codesOf(["let e: array<integer> = []", 'e.join(",")'])).toEqual([
      "theta/parse/non-string-array-join",
    ]);
  });

  it("b4: `let e: array<string> = []` then `e.frobnicate()` still reports the unknown method", () => {
    // Only the ELEMENT type is at stake. The receiver classifies as an array
    // under both the inferred `array<unknown>` and the declared
    // `array<string>`, so the method allow-list must keep rejecting the call.
    expect(codesOf(["let e: array<string> = []", "e.frobnicate()"])).toEqual([
      "theta/parse/unknown-method",
    ]);
  });

  it("s9: `let e: array<Foo> = []` then `.join` still reports the non-string element type", () => {
    // An undeclared element name is not a `string` element type under either
    // recorded shape, so the join stays refused.
    expect(codesOf(["let e: array<Foo> = []", 'e.join(",")'])).toEqual([
      "theta/parse/non-string-array-join",
    ]);
  });

  it("s12: the join inside a nested block loads too (the block inherits whatever the enclosing `let` recorded)", () => {
    // `walkStmt`'s `if` arm walks `then` with `new Map(bindings)`
    // (src/parser/type-layer-checks.ts:604), so the nested check reads a copy
    // of whatever the enclosing `let` recorded. Fixing the record fixes the
    // copy; this row proves the fix reaches nested scopes and is not confined
    // to the statement list that declared the binding.
    expect(
      codesOf(["let e: array<string> = []", 'if true { e.join(",") } else { 1 }']),
    ).toEqual([]);
  });
});

// ===========================================================================
// (d) TYPE-11 alias transparency — the declared type is recorded in the form
//     the spec says it IS, so the structural gates reading it see through the
//     alias exactly as the `⊑` engine does.
// ===========================================================================

describe("0083 (d) — an alias-schema annotation is recorded in its TYPE-11-transparent form", () => {
  it("d1: an alias-of-array annotation is a legal `for` iterand", () => {
    // type-system.md:54 TYPE-11 makes `L` and `array<string>` the same type, so
    // control-flow.md:13's "the expression after `in` must have type
    // `array<T>`" is satisfied by a binding declared `L`. `checkForIterand`
    // (src/parser/control-flow.ts:51) decides on `kind === "array"` alone and
    // is handed no `TypeEnv` to unfold with, so an opaquely-recorded `named L`
    // would reject a program the spec admits — and reject it only because the
    // author named the array type.
    expect(
      codesOf(["schema L = array<string>", 'let e: L = ["a"]', "for x in e { x }", "1"]),
    ).toEqual([]);
  });

  it("d2: the same holds at the `par for` iterand, a second `checkForIterand` call site", () => {
    // control-flow.md:70 — "`par for` reuses the `for` iterand contract
    // unchanged" — and CTRL-4 (control-flow.md:76) makes `par for` legal in a
    // prompt-mode theta, so this body is source-reachable. The arm calls
    // `checkForIterand` from its own site
    // (src/parser/type-layer-checks.ts:1084–1087) over a type read from the
    // same binding map, so it needs its own row rather than inheriting d1's.
    expect(
      codesOf([
        "schema L = array<string>",
        'let e: L = ["a"]',
        "par for x in e { x }",
        "1",
      ]),
    ).toEqual([]);
  });

  it("d3: an alias of a NON-string array still reports the non-string join element type", () => {
    // The true positive the transparency must not swallow. The join gate tests
    // `targetType.kind === "array"` directly
    // (src/parser/type-layer-checks.ts:1222), so recording an opaque `named L`
    // would skip `checkArrayJoin` entirely and admit the call that
    // expressions.md:108 prescribes rejecting. Unfolding restores the check
    // AND its reason: the element type is the declared `integer`.
    expect(
      codesOf(["schema L = array<integer>", "let e: L = [1]", 'e.join(",")']),
    ).toEqual(["theta/parse/non-string-array-join"]);
  });

  it("d4: an alias of `array<string>` over an empty literal joins (the alias twin of b1)", () => {
    // expressions.md:220 sources the empty literal's element type from the
    // binding annotation; under TYPE-11 the alias IS that annotation, so the
    // accumulate-then-join idiom must load whether the author spelled the
    // array type inline or behind a name.
    expect(codesOf(["schema L = array<string>", "let e: L = []", 'e.join(",")'])).toEqual(
      [],
    );
  });

  it("d5: an object-schema annotation stays nominal and is still not iterable", () => {
    // TYPE-11 unfolds only the `schema X = R` alias form; type-system.md:52
    // TYPE-10 keeps an object-schema `named` nominal, and `unfoldAlias`
    // (src/parser/type-compat.ts:155) returns such a `named` untouched. A
    // nominal type is not `array<T>`, so the iterand check must still reject
    // — this row is what pins the transparency to the alias form instead of
    // letting it dissolve every declared name.
    expect(
      codesOf([
        "schema P { a: string }",
        'let p: P = P { a: "x" }',
        "for x in p { x }",
        "1",
      ]),
    ).toEqual(["theta/parse/non-array-iterand"]);
  });
});

// ===========================================================================
// Constraints the fix must not break.
// ===========================================================================

describe("0083 — the annotated-array element sink keeps suppressing the sink-less check", () => {
  it("c1: a validly annotated union array still loads (constraint (iii))", () => {
    // The `let` arm routes a typed array literal to the annotation's element
    // sink at :571–573 precisely so the generic, sink-less
    // `theta/parse/array-no-common-type` check does not re-flag it. Changing
    // what the binding RECORDS happens after that routing and must leave it
    // intact.
    expect(codesOf(['let u: array<string | integer> = ["a", 1]', "1"])).toEqual([]);
  });
});

describe("0083 — a primitive annotation leaves the receiver classification alone", () => {
  it("s3: `let s: string = \"ab\"` then `s.frobnicate()` still reports the unknown method", () => {
    // The declared and inferred types agree on the receiver's shape here, so
    // the method allow-list must be unmoved by the record change.
    expect(codesOf(['let s: string = "ab"', "s.frobnicate()"])).toEqual([
      "theta/parse/unknown-method",
    ]);
  });
});

describe("0083 — an unresolvable annotation keeps falling back to the initialiser type", () => {
  it("(i): `annotationToCompatType` answers `undefined` only for an empty annotation source", () => {
    // This is the sole input class that reaches the `rhsType` fallback at
    // :591–594, and the reason the fallback must stay: an annotation the
    // parser cannot convert must not be recorded as a hole.
    expect(annotationToCompatType("")).toBeUndefined();
    expect(annotationToCompatType("   ")).toBeUndefined();
  });

  it("(i): an undeclared type name converts to a deferred `named`, not to `undefined`", () => {
    // An unresolved NAME is not an unresolvable annotation: it converts to the
    // nominal shape the `⊑` engine defers on. Recording it is therefore
    // in-contract, and s9 pins the end-to-end disposition of a binding that
    // carries one.
    expect(annotationToCompatType("Foo")).toEqual({ kind: "named", name: "Foo" });
    expect(annotationToCompatType("array<Foo>")).toEqual({
      kind: "array",
      element: { kind: "named", name: "Foo" },
    });
  });
});

// ===========================================================================
// Reassignment interaction — pinned observation, not a behaviour change.
// ===========================================================================

describe("0083 — a `let mut` reassignment does not re-derive the recorded binding type", () => {
  it("pin: `let mut n: number = 1` / `n = 2` / `let m: integer = n` narrows — the declared type governs after reassignment", () => {
    // `case "reassign"` (src/parser/type-layer-checks.ts:1314–1316) walks
    // `stmt.value` for nested checks and never calls `bindings.set` again, so
    // the type recorded at the `let` — here the `number` annotation — is what
    // every later reference sees for the rest of `n`'s scope: `m: integer = n`
    // still narrows exactly as it does without the reassignment (a1). Bug 0090
    // made that rule NORMATIVE: docs/spec_topics/bindings.md §Reassignment
    // (anchor #reassignment-binding-type) states directly that a reassignment
    // does not change the binding's type, so this pin is that sentence's
    // witness rather than a standalone observation.
    expect(
      codesOf(["let mut n: number = 1", "n = 2", "let m: integer = n", "1"]),
    ).toEqual(["theta/parse/integer-narrowing"]);
  });
});
