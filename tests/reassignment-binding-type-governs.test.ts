import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0090 — the corpus did not say what type a `let mut` binding carries
// AFTER a reassignment, so the shape of the code decided
// (docs/bugs/0090-let-mut-reassignment-type-rederivation-unspecified.md). The
// adjudication settles it as §Fix **disposition 1**: the type the binding was
// declared or inferred with governs the binding's WHOLE SCOPE; a reassignment
// does not re-derive the recorded type. That ratifies the behaviour at HEAD
// and changes no code, so this file exists to LOCK the adjudicated rule as
// observables — until now the rule existed only as a comment inside bug 0083's
// regression file (`tests/let-annotation-recorded-binding-type.test.ts:328–343`,
// the single pin), with no normative sentence and no dedicated witness.
//
// THE SPEC SENTENCE THIS FILE WITNESSES (docs/spec_topics/bindings.md
// §Reassignment, anchor `#reassignment-binding-type`):
//
//   "A reassignment does not change the binding's type: every later reference
//    resolves the type the binding was declared or inferred with, for the
//    whole of the binding's scope."
//
// SUPPORTING SPEC ANCHORS (the relations the observables turn on, unchanged by
// this adjudication):
//   - docs/spec_topics/bindings.md:12 §Reassignment — "the RHS must be
//     compatible with the binding's declared or inferred type". The clause the
//     sentence above extends; it already speaks of the binding's declared or
//     inferred type at a write that happens AFTER the declaration, which is the
//     declared-governs reading. ENFORCING that clause at the reassignment is
//     bug 0115's subject
//     (docs/bugs/0115-reassignment-type-compat-unchecked-no-registry-row.md
//     §Fix (d): "0090's adjudication lands first") and is OUT OF SCOPE here —
//     every cell below is measured with that check absent, which is why the
//     incompatible writes in c5 are silent.
//   - docs/spec_topics/type-system.md:36 TYPE-2 — `integer ⊑ number`, one-way.
//   - docs/spec_topics/lexical.md:28 §"Number literals" — "`integer` widens
//     implicitly to `number` in arithmetic and assignment positions; the
//     reverse is `theta/parse/integer-narrowing`".
//   - docs/spec_topics/expressions.md:108 (`array<T>` stdlib table, `join`
//     row) — "Element type must be `string`; non-string element types are
//     `theta/parse/non-string-array-join`".
//   - Registry rows for both asserted codes already exist, so no cell here
//     needs a DIAG-2 mint: `theta/parse/integer-narrowing`
//     (docs/spec_topics/diagnostics/code-registry-parse.md:24),
//     `theta/parse/non-string-array-join` (`:43`).
//
// WHAT IN `src/` REALISES THE RULE. `TypeLayerWalk.walkStmt`'s `case
// "reassign"` (src/parser/type-layer-checks.ts:1314–1316) is exactly
// `this.walkExpr(stmt.value, bindings, flow); return;` — it walks the assigned
// value for nested checks and never calls `bindings.set`. The `CompatType` map
// every later `typeOf` consults is written at declaration sites only; the `let`
// arm's write is `bindings.set(stmt.name, recorded)` (`:1249`), where
// `recorded` is the declared annotation in its TYPE-11-transparent form when
// one is present and the initialiser's inferred type otherwise (bug 0083's
// fix, 0.55.0). Declared type in, no re-derivation out.
//
// RED / GREEN LEDGER. The adjudication ratifies HEAD, so every cell is GREEN at
// HEAD by construction and the file is red-proven by NEUTRALISATION against the
// REJECTED §Fix disposition 2 (each reassignment re-derives the recorded type
// from the assigned value). Neutralisation applied: in `case "reassign"`
// (`:1314–1316`), resolve the assigned value's type and
// `bindings.set(stmt.target, <that type>)` before returning — the three-line
// edit disposition 2 prescribes. Under it:
//   - a1 reds: `["theta/parse/integer-narrowing"]` → `[]` (the `n = 2`
//     re-record replaces the declared `number` with the literal's `integer`,
//     so the later `let m: integer = n` no longer narrows);
//   - b1 reds: `[]` → `["theta/parse/integer-narrowing"]` (the `n = 1.5`
//     re-record replaces the inferred `integer` with `number`);
//   - c5 reds: `[]` → `["theta/parse/non-string-array-join"]` (the `xs = [1]`
//     re-record replaces the declared `array<string>` with `array<integer>`,
//     so the join precondition refuses the receiver).
// Those three flips are exactly the ones bug 0090 §Fix disposition 2
// predicts. a2, a3, b2 and c6 hold under BOTH dispositions and stay green
// through the neutralisation: they are the controls that make each red
// attributable to the reassignment alone rather than to a checker that stopped
// firing. a2/a3 isolate the reassignment against the same source without it and
// without `mut`; b2 does the same on the inferred side; c6 is the positive
// control proving the join precondition fires at all on this harness.
//
// ANTI-VACUITY. Five of the seven cells expect a NON-empty code list, so a
// harness that stopped reaching the type layer (a frontmatter refusal, an
// unfed static-type pass) fails loudly here rather than turning the
// `toEqual([])` cells into silent passes. Every assertion is an ordered
// whole-list equality over the AGGREGATED codes, so neither a lost diagnostic
// nor a spurious extra one can hide inside a containment check.
//
// MESSAGE TEXT IS DELIBERATELY NOT PINNED. The CODE is what the registry rows
// above prescribe and what the adjudication fixes; no message string is
// asserted, so DIAG-4 raises no obligation here.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string. An integration tier would
// add a session round-trip to a parse-time observable and buy no reach; a live
// tier would make a fully determined static observable stochastic.
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
// (a) The DECLARED type governs the whole scope, reassignment notwithstanding.
// ===========================================================================

describe("0090 (a) — a declared binding type survives a reassignment for the whole of the binding's scope", () => {
  it("a1: a reference after `n = 2` still resolves the DECLARED `number`, so `let m: integer = n` narrows — bindings.md §Reassignment (#reassignment-binding-type): a reassignment does not change the binding's type", () => {
    // THE DISCRIMINATING CELL. `n` is declared `number`; the reassignment
    // writes an `integer` literal. Under the adjudicated rule the later
    // reference resolves `number`, and copying a `number` into an `integer`
    // slot is the direction lexical.md:28 reserves for
    // `theta/parse/integer-narrowing` (TYPE-2 is one-way). Under the REJECTED
    // disposition 2 the `n = 2` would re-derive `n` to `integer` and this list
    // would be `[]` — which is the neutralised red the ledger above records.
    expect(
      codesOf(["let mut n: number = 1", "n = 2", "let m: integer = n", "1"]),
    ).toEqual(["theta/parse/integer-narrowing"]);
  });

  it("a2: the same source WITHOUT the reassignment narrows identically — the reassignment is the only variable, and it moves nothing (#reassignment-binding-type)", () => {
    // Control, green under both dispositions. a1 and a2 differ only in the
    // presence of `n = 2`; the equal outcome is what makes a1's neutralised
    // red attributable to the re-record rather than to a checker that stopped
    // firing on `mut` sources.
    expect(codesOf(["let mut n: number = 1", "let m: integer = n", "1"])).toEqual([
      "theta/parse/integer-narrowing",
    ]);
  });

  it("a3: the same source without `mut` narrows identically — mutability does not weaken the declared type either (#reassignment-binding-type)", () => {
    // Control, green under both dispositions. Drops `mut` on top of a2, so
    // a1/a2/a3 together isolate first the reassignment and then the
    // mutability marker as non-factors in what type a later reference sees.
    expect(codesOf(["let n: number = 1", "let m: integer = n", "1"])).toEqual([
      "theta/parse/integer-narrowing",
    ]);
  });
});

// ===========================================================================
// (b) The INFERRED type governs its scope on the same terms.
// ===========================================================================

describe("0090 (b) — an inferred binding type survives a reassignment on the same terms", () => {
  it("b1: a reference after `n = 1.5` still resolves the INFERRED `integer`, so `let m: integer = n` is silent — bindings.md §Reassignment (#reassignment-binding-type) fixes the inferred type for the scope too", () => {
    // THE SECOND DISCRIMINATING CELL, on the inferred side and in the opposite
    // direction to a1. `let mut n = 1` infers `integer` (lexical.md:28: a
    // literal with no fractional or exponent part is `integer`), and the
    // adjudicated rule keeps that for the whole scope, so `m: integer = n` is
    // `integer ⊑ integer` and reports nothing. The `number` written by
    // `n = 1.5` is the statement bindings.md:12 makes illegal, and nothing
    // enforces that clause today (bug 0115) — hence the empty list rather than
    // a diagnostic at the reassignment. Under the REJECTED disposition 2 the
    // re-record would make `n` a `number` and this list would be
    // `["theta/parse/integer-narrowing"]`.
    expect(
      codesOf(["let mut n = 1", "n = 1.5", "let m: integer = n", "1"]),
    ).toEqual([]);
  });

  it("b2: an inferred `number` narrows when copied into an `integer` slot (control — the narrowing check fires on inferred types on this harness) (#reassignment-binding-type)", () => {
    // Control, green under both dispositions. b1's silence must be
    // attributable to `n` being `integer`, not to the checker being blind to
    // inferred binding types; here the same source infers `number` from
    // `1.5` and the narrowing reports.
    expect(codesOf(["let mut n = 1.5", "let m: integer = n", "1"])).toEqual([
      "theta/parse/integer-narrowing",
    ]);
  });
});

// ===========================================================================
// (c) The rule holds for a COMPOSITE declared type, not only for the
//     numeric-widening pair.
// ===========================================================================

describe("0090 (c) — a declared composite type also governs the whole scope", () => {
  it("c5: after `xs = [1]` the receiver still resolves the DECLARED `array<string>`, so `xs.join(\",\")` loads — bindings.md §Reassignment (#reassignment-binding-type) holds for composite types", () => {
    // THE COMPOSITE DISCRIMINATING CELL. `xs` is declared `array<string>`,
    // which expressions.md:108 admits as a `join` receiver; the reassignment
    // writes an `array<integer>`. Under the adjudicated rule the receiver
    // resolves the declared `array<string>` and the join loads. The
    // incompatible write itself is the unenforced bindings.md:12 obligation
    // (bug 0115), not this cell's subject. Under the REJECTED disposition 2 the
    // re-record would make the receiver `array<integer>` and this list would be
    // `["theta/parse/non-string-array-join"]`.
    expect(
      codesOf(["let mut xs: array<string> = []", "xs = [1]", 'xs.join(",")']),
    ).toEqual([]);
  });

  it("c6: a declared `array<integer>` receiver refuses the join (control — the element-type precondition fires at all here) (#reassignment-binding-type)", () => {
    // Control, green under both dispositions. Without it c5's `[]` could be a
    // join check that never ran on this harness rather than a receiver that
    // kept its declared element type.
    expect(codesOf(["let mut xs: array<integer> = []", 'xs.join(",")'])).toEqual([
      "theta/parse/non-string-array-join",
    ]);
  });
});
