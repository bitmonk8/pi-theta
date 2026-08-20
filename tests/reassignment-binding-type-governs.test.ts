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
//     §Fix (d): "0090's adjudication lands first"), and 0115 has now landed:
//     `theta/parse/reassign-rhs-type-mismatch` fires AT THE REASSIGNMENT
//     STATEMENT (or the already-registered `theta/parse/integer-narrowing` for
//     the one-way `number`-under-`integer` case), never at the later reference
//     this file's own subject is about. That is a DIFFERENT position from the
//     later-reference codes this file locks, so b1 and c5 below gain the new
//     row's code IN ADDITION TO what they already asserted, and are re-pinned
//     by POSITION as well as by code so the two checks (declared-governs at
//     the reference; RHS-compatibility at the write) stay distinguishable at
//     `codesOf` granularity (0115's premeasure, residual 2 of 0090's fix
//     record).
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
// WHAT IN `src/` REALISES THE RULE (at pre-0115 HEAD 769164b8).
// `TypeLayerWalk.walkStmt`'s `case "reassign"` (then
// src/parser/type-layer-checks.ts:1314–1316, now wired at :1315–1345 by this
// commit's fix) was exactly `this.walkExpr(stmt.value, bindings, flow);
// return;` — it walked the assigned value for nested checks and never called
// `bindings.set`; bug 0115's fix reads the target's recorded type and pushes a
// compatibility diagnostic, but still never calls `bindings.set` — the
// property this file locks is unmoved. The `CompatType` map every later
// `typeOf` consults is written at declaration sites only; the `let` arm's
// write is `bindings.set(stmt.name, recorded)` (`:1250`), where
// `recorded` is the declared annotation in its TYPE-11-transparent form when
// one is present and the initialiser's inferred type otherwise (bug 0083's
// fix, 0.55.0). Declared type in, no re-derivation out.
//
// RED / GREEN LEDGER. The adjudication ratifies HEAD, so every cell was GREEN
// at pre-0115 HEAD by construction, and the file was red-proven by
// NEUTRALISATION against the REJECTED §Fix disposition 2 (each reassignment
// re-derives the recorded type from the assigned value). Neutralisation
// applied to the PRE-0115 tree: in `case "reassign"` (then `:1314–1316`,
// `this.walkExpr(stmt.value, bindings, flow); return;` with no compatibility
// check at all), resolve the assigned value's type and
// `bindings.set(stmt.target, <that type>)` before returning — the three-line
// edit disposition 2 prescribes. Under it:
//   - a1 reds: `["theta/parse/integer-narrowing"]` → `[]` (the `n = 2`
//     re-record replaces the declared `number` with the literal's `integer`,
//     so the later `let m: integer = n` no longer narrows);
//   - b1 reds: `[]` → `["theta/parse/integer-narrowing"]` (the `n = 1.5`
//     re-record replaces the inferred `integer` with `number`, so the LATER
//     `let m: integer = n` narrows — at that statement's line, not the
//     reassignment's);
//   - c5 reds: `[]` → `["theta/parse/non-string-array-join"]` (the `xs = [1]`
//     re-record replaces the declared `array<string>` with `array<integer>`,
//     so the join precondition refuses the receiver).
// Those three flips are exactly the ones bug 0090 §Fix disposition 2
// predicts, against the PRE-0115 tree. a2, a3, b2 and c6 hold under BOTH
// dispositions and stay green through the neutralisation: they are the
// controls that make each red attributable to the reassignment alone rather
// than to a checker that stopped firing. a2/a3 isolate the reassignment
// against the same source without it and without `mut`; b2 does the same on
// the inferred side; c6 is the positive control proving the join precondition
// fires at all on this harness.
//
// POST-0115 UPDATE (this file, this commit). Bug 0115 wires a compatibility
// check AT THE REASSIGNMENT itself, judged against the target's recorded
// type — the very type this file's rule fixes for the whole scope, per 0090's
// fix record residual 2 ("Two witness cells assert an absence 0115 will
// legitimately move"). b1 and c5 are exactly those two cells:
//   - b1: `n = 1.5` writes a `number` under an inferred `integer` target, so
//     0115's check now reports `theta/parse/integer-narrowing` AT THE
//     REASSIGNMENT (body line 2). The list is code-identical to the
//     REJECTED-disposition-2 neutralisation above, which reports the SAME
//     code at the LATER `let m: integer = n` (body line 3) — so `codesOf`
//     alone no longer discriminates declared-governs-plus-RHS-check from
//     re-derive, and the position pin below is what restores it.
//   - c5: `xs = [1]` writes an `array<integer>` under a declared
//     `array<string>` target, so 0115's check now reports
//     `theta/parse/reassign-rhs-type-mismatch` AT THE REASSIGNMENT. This code
//     differs from the REJECTED disposition's `theta/parse/non-string-array-join`
//     (fired at the later `.join(",")` instead), so c5 keeps discriminating
//     the two dispositions by code alone, and is the cell 0090's fix record
//     names as such.
// Neither cell's SUBJECT changes: both still lock that the LATER reference
// (`let m: integer = n` in b1, `xs.join(",")` in c5) resolves the DECLARED-OR-
// INFERRED type, not a re-derived one — the new reassignment-line diagnostic
// is an ADDITION ahead of that reference, not a replacement of it.
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

/**
 * The start line of the FIRST diagnostic the production parse reports for
 * `body` — bug 0115's post-fix pin for b1/c5, restoring discrimination
 * `codesOf` alone lost: the reassignment-line row and a later-reference row
 * can share a code, but never a line.
 */
function firstDiagnosticLine(body: readonly string[]): number | undefined {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics[0]?.range
    ?.start.line;
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
    //
    // POST-0115: this cell now gains `theta/parse/integer-narrowing` at the
    // REASSIGNMENT itself (`n = 1.5` is a `number` write under the inferred
    // `integer` target) — the same code the REJECTED disposition-2
    // neutralisation produces at the LATER `let m: integer = n` instead. The
    // code list alone no longer discriminates the two; the position does
    // (body line 2, the reassignment, not body line 3, the later reference).
    const body = ["let mut n = 1", "n = 1.5", "let m: integer = n", "1"];
    expect(codesOf(body)).toEqual(["theta/parse/integer-narrowing"]);
    expect(
      firstDiagnosticLine(body),
      "b1 — the narrowing fires at the REASSIGNMENT (0115), not at the later `let m: integer = n` a re-derived type would fire it at",
    ).toBe(5);
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
    //
    // POST-0115: this cell now gains `theta/parse/reassign-rhs-type-mismatch`
    // at the REASSIGNMENT itself (`xs = [1]` is an `array<integer>` write
    // under the declared `array<string>` target). This code differs from the
    // REJECTED disposition's `theta/parse/non-string-array-join` (which would
    // fire at the later `.join(",")`), so this cell keeps discriminating the
    // two dispositions by code alone — the cell 0090's fix record names as
    // such.
    const body = ["let mut xs: array<string> = []", "xs = [1]", 'xs.join(",")'];
    expect(codesOf(body)).toEqual(["theta/parse/reassign-rhs-type-mismatch"]);
    expect(
      firstDiagnosticLine(body),
      "c5 — the mismatch fires at the REASSIGNMENT (0115), not at the later `xs.join(\",\")` a re-derived type would refuse",
    ).toBe(5);
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
