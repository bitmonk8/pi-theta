// Bug 0386 — a dead block-scoped `let x` overwrites the flat parse mutability
// map file-linearly, so a later LEGAL write to a live outer `let mut x` is
// refused with a false `theta/parse/immutable-rebinding` and the theta fails to
// load. `buildLet` (src/parser/theta-document.ts:2652) records every `let` in
// the flat `this.bindings` map with no save/restore at block exit, so a `let x`
// declared inside any non-top-level block (`if` / `for` / `while` / a
// `match`-arm block / a `fn` body) permanently overwrites the outer
// `let mut x`'s mutable=true with false for the rest of the file;
// `buildReassign` (:2722) then reads that leaked false and refuses the later
// legal `x = 3`. The §Fix block-scopes the map (the `withImmutableBindings`
// save/restore shape, :2756, generalised to declaration-carrying blocks).
// (docs/bugs/0386-dead-block-let-leaks-immutability-false-refusal.md)
//
// TIER: unit, offline, provider-free, deterministic — the sibling b0370 witness
// harness shape (`codesOf(src)`: frontmatter `---\nmode: prompt\n---\n`
// prepended, parsed through `parseThetaDocument` over a string, error-severity
// `.diagnostics` codes collected and sorted). The parse verdict settles inside
// one `parseThetaDocument` over a string; no seam here needs a provider, a
// child process, or a discovery round trip, so an integration or live tier
// would add machinery to a decision no model and no host boundary participate
// in. (The end-to-end registration consequence is pinned by the sibling live
// cell tests/live/b0386-dead-block-let-scope-live-cell.test.ts.)
//
// ASSERTION CONTRACT: every cell asserts the AGGREGATED, sorted, error-severity
// `.diagnostics` CODES multiset (the stable registry-owned contract — the house
// pattern, cf. b0370-reassign-target-scope.test.ts's `codesOf`), never the
// message PROSE (the implementer's wording). Each cell asserts the POST-FIX
// expected codes, so the false-refusal rows run RED against the current tree
// (the fork, source unedited during Phase 1) and go green once the map is
// block-scoped. `0.398.0` is a literal version placeholder the lane parent fills.
//
// NO SILENT SKIPPING: every cell is a direct `codesOf` equality over a fixed
// string; there is no precondition to skip past — a mis-parse surfaces as a
// wrong codes multiset, failing the assertion loudly.

import { describe, expect, it } from "vitest";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";

const FM = "---\nmode: prompt\n---\n";

// ===========================================================================
// Shared parse harness (the b0370 shape, verbatim).
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: "b0386.theta", bytes: new TextEncoder().encode(FM + src) };
  return parseThetaDocument(source, parseDeps());
}

/** The aggregated error-severity diagnostic codes, sorted so the assertion is
 *  order-independent (the multiset, not the textual order of the read vs the
 *  write occurrence). */
function codesOf(src: string): string[] {
  return parseOnly(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

// ===========================================================================
// FORWARD rows — a dead block-scoped `let x` shadow of an outer `let mut x`,
// then a later LEGAL top-level write. Per the lexical-shadowing rule
// (expressions.md:51, "Local bindings (1) shadow everything else lexically, the
// same as in Rust or TypeScript") the block shadow ends at the block's `}`, so
// `x = 3` targets the outer `let mut x` — a legal write on a `let mut` binding
// (bindings.md:12, reassignment "are all legal on `let mut` bindings"). The
// fork's flat file-linear map leaks the block-scoped `let x`'s false over the
// outer's true, so `buildReassign` falsely refuses the write with
// `theta/parse/immutable-rebinding` (bindings.md:6 — a code defined for
// rebinding an IMMUTABLE binding, which the live target is not). Each cell
// asserts the POST-FIX clean parse, so it reds at the fork.
// ===========================================================================

describe("bug 0386 forward — a dead block-scoped `let x` must not falsely refuse a later legal write to the outer `let mut x`", () => {
  it("A1 (if block): `let mut x = 1` / `if true { let x = 2 }` / `x = 3` parses clean", () => {
    // FORK: `["theta/parse/immutable-rebinding"]` — the block-scoped `let x`
    // leaks false onto the outer `let mut x`, falsely refusing the legal write.
    expect(
      codesOf("let mut x = 1\nif true { let x = 2 }\nx = 3"),
      "A1: the block-scoped `let x` shadow ends at `}`; `x = 3` targets the outer `let mut x`",
    ).toEqual([]);
  });

  it("A3 (for block): `let mut x = 1` / `for i in [1] { let x = 2 }` / `x = 3` parses clean", () => {
    // FORK: `["theta/parse/immutable-rebinding"]` — same leak from a `for`-body
    // `let x`.
    expect(
      codesOf("let mut x = 1\nfor i in [1] { let x = 2 }\nx = 3"),
      "A3: the `for`-body `let x` shadow ends at `}`; `x = 3` targets the outer `let mut x`",
    ).toEqual([]);
  });

  it("A4 (match-arm block): `let mut x = 1` / `match 1 { n => { let x = 2 } }` / `x = 3` draws block-expr-missing-tail ALONE", () => {
    // FORK: `["theta/parse/block-expr-missing-tail", "theta/parse/immutable-rebinding"]`.
    // The match-arm block ends in a `let` statement, not a tail expression, so
    // it independently draws `theta/parse/block-expr-missing-tail` (unrelated to
    // this bug, present both directions). The false `immutable-rebinding` from
    // the leaked shadow fires alongside it at the fork; post-fix that false code
    // is gone, leaving the block-expr-missing-tail alone — verified as this
    // exact split by a b0386scratch probe (deleted).
    expect(
      codesOf("let mut x = 1\nmatch 1 { n => { let x = 2 } }\nx = 3"),
      "A4: block-scoping removes the false immutable-rebinding; the tail-less match-arm block's block-expr-missing-tail remains",
    ).toEqual(["theta/parse/block-expr-missing-tail"]);
  });

  it("A5 (fn body local across the FN-1 boundary): a `fn` body's local `let x` must not poison the top-level map", () => {
    // FORK: `["theta/parse/immutable-rebinding"]`. A `fn` body's local `let x`
    // (functions.md:20, FN-1 — a `fn` body is closure-free, its locals are not
    // the file's top-level bindings) leaks false onto the top-level `let mut x`
    // across the activation boundary, falsely refusing the top-level `x = 3`.
    expect(
      codesOf("let mut x = 1\nfn g(): integer { let x = 2\nreturn x }\nx = 3\nlet y = g()"),
      "A5: the `fn` body's local `let x` is invisible outside the body; `x = 3` targets the outer `let mut x`",
    ).toEqual([]);
  });

  it("A6 (while block): `let mut x = 1` / `while n < 1 { let x = 2 … }` / `x = 3` parses clean", () => {
    // FORK: `["theta/parse/immutable-rebinding"]` — same leak from a `while`-body
    // `let x`.
    expect(
      codesOf("let mut x = 1\nlet mut n = 0\nwhile n < 1 { let x = 2\nn += 1 }\nx = 3"),
      "A6: the `while`-body `let x` shadow ends at `}`; `x = 3` targets the outer `let mut x`",
    ).toEqual([]);
  });
});

// ===========================================================================
// CONTROLS — byte-identical both directions (GREEN now and after the fix). They
// bound the forward rows: A2 proves a bare `let mut` write is clean with no dead
// block present, and A7 proves a genuine same-scope immutable rebinding is still
// refused, so the forward rows' clean parse cannot be a blanket suppression of
// the code.
// ===========================================================================

describe("bug 0386 controls — byte-identical both directions", () => {
  it("A2 control: `let mut x = 1` / `x = 3` parses clean (no dead block, plain mutable write)", () => {
    expect(codesOf("let mut x = 1\nx = 3"), "A2: a plain mutable write is clean").toEqual([]);
  });

  it("A7 control: `let x = 1` / `x = 3` draws immutable-rebinding (genuine same-scope refusal, unchanged)", () => {
    expect(
      codesOf("let x = 1\nx = 3"),
      "A7: a genuine same-scope immutable rebinding stays refused — the code is not blanket-suppressed",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });
});

// ===========================================================================
// REVERSE-DIRECTION control (R1) — the §Fix asks to ADD it; per parent
// ratification it proves the NEW parse-refusal disposition, NOT the old
// loud-runtime-belt disposition 0370 recorded for this shape. A dead block
// `let mut x` shadow of an immutable outer `let x`, then an outer write, must
// now be REFUSED AT PARSE. At the fork the leak makes the flat map see the
// block-scoped `let mut`'s true, so the outer `x = 3` parses clean (`[]`) and
// the write would reach the runtime; this cell asserts the POST-FIX refusal, so
// it reds at the fork and pins the reverse direction.
// ===========================================================================

describe("bug 0386 reverse — a dead block-scoped `let mut x` must not leak writability onto the immutable outer `let x`", () => {
  it("R1: `let x = 1` / `if true { let mut x = 2 }` / `x = 3` draws immutable-rebinding", () => {
    // Block-scoping restores the outer immutable `let x` after the dead block
    // closes, so `x = 3` correctly targets the immutable outer binding and is
    // refused at parse (expressions.md:51 lexical shadowing — the block-scoped
    // `let mut x` is invisible after `}`; bindings.md:6 immutable-rebinding).
    // FORK: `[]` (the leak makes the map see the block `let mut`'s mutability),
    // so this cell reds now and pins the reverse direction.
    expect(
      codesOf("let x = 1\nif true { let mut x = 2 }\nx = 3"),
      "R1: the block-scoped `let mut x` shadow ends at `}`; `x = 3` targets the immutable outer `let x` and is refused",
    ).toEqual(["theta/parse/immutable-rebinding"]);
  });
});
