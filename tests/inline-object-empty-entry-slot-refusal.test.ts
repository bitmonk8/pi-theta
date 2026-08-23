import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { splitTopLevelSegments, topLevelColon } from "../src/parser/params";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0257 — an inline object entry SLOT spelling no token at all — the segment
// a doubled, leading or lone top-level comma opens (`{a: integer,,b: string}`,
// `{,a: integer}`, `{,}`) — derives from no `Field` and draws nothing at all
// twelve `Type` positions, so the theta REGISTERS over source no production
// derives and `{,}` lowers the byte-identical fragment `{}` is refused for
// producing
// (docs/bugs/0257-empty-inline-object-entry-slot-silently-tolerated.md).
// This file is that report's §Fix "Witness".
//
// THE MECHANISM (cited BY SYMBOL — docs/STYLE.md §Citations; bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// do-not-chase class for absolute line numbers into the parser modules a fix
// here edits).
//   1. THE SLOT IS PASSED OVER WITH NO RECORD. `TypeParser.parseObject`
//      (src/parser/type-grammar.ts) reads an interior entry by entry. A
//      field-name position holding a non-`ident` token takes one arm, and that
//      arm splits on the token's text: a `,` takes the branch that resets the
//      entry cursor and clears the refusal latch on the stated ground that a
//      skipped separator CLOSES an empty entry rather than opening one, then
//      falls through to `this.next(); continue;`. Bug 0244's keyless-entry
//      emission — `TypeParser.entryQualifiesForRefusal` /
//      `TypeParser.discardedEntryRefusal`, buffered into the same arm's
//      `pending` list and flushed at the interior's own `}` — sits in the
//      sibling `else if`, so it never runs for the slot the comma opened.
//   2. NO GRAMMAR-LEGAL SPELLING REACHES THE BRANCH. A well-formed entry ends
//      at the loop's own `eatPunct(",")` read; the LEGAL trailing comma is
//      consumed there and the loop then exits on `}`. Every entry into the
//      branch is therefore an undecidable slot, which is why the legal subset
//      (`{a: integer,}`, `{a: integer, }`) is a hard bound the fix cannot move.
//   3. THE RAW-KEY SPLIT SPELLS THE SLOT AND YIELDS NO KEY.
//      `splitTopLevelSegments` / `topLevelColon` (`src/parser/params.ts`)
//      divide `a: integer,,b: string` into three segments, the middle one
//      empty, and `inlineObjectFieldKeys` (src/parser/type-grammar.ts)
//      `continue`s on a segment spelling no top-level `:`. The slot is in
//      neither judged input: not `TypeNode.fieldNames`, not `fieldTypes`, not
//      the key split — which is why §Fix routes the emission through the
//      parser arm and NOT through the split (widening the key rule would move
//      the four raw-key rows and both lowerers keyed on it).
//   4. THE `let`-ANNOTATION LAYER ALREADY CALLS THE SAME SLOT MALFORMED.
//      `inlineObjectAnnotationToCompatType` (src/parser/type-layer-checks.ts)
//      strips the one trailing comma `ObjectType` admits
//      (`stripOneTrailingComma`), then requires an `Ident` key in every
//      remaining segment; the empty segment fails and the whole interior
//      returns `undefined`, so `convertAnnotation` falls back to a deferring
//      nominal and TYPE-8's `theta/parse/let-rhs-type-mismatch` is withheld
//      (§Reproduction (d) d1). §Fix's "The `let`-annotation layer" clause
//      settles that the conversion KEEPS declining and the parse refusal
//      stands ALONE — one line for one written mistake, bug 0129's
//      count-consequence law (code-registry-parse.md:104).
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE.
// Each POST-FIX value is the settled §Fix disposition:
//
//   SL1 — the `,` at a field-name position OPENS an empty slot and buffers ONE
//         error-severity diagnostic into bug 0244's `pending` buffer, flushed
//         only when the interior's own `}` is spelled.
//   SL2 — PARTITION, mirroring the declaration position (§Reproduction (e)
//         e1–e4) and the sentence `code-registry-parse.md:99` already states:
//         at least one `Field` derived in this interior BEFORE the slot draws
//         `theta/parse/malformed-schema-field`; no `Field` derived before it
//         draws `theta/parse/empty-schema-body`, rendered with the ANONYMOUS
//         inline subject `{}` (the `<X>` rule for the empty-inline-object
//         trigger, docs/spec_topics/diagnostics/placeholder-rendering-b.md:55).
//   SL3 — `empty-schema-body` is a PER-INTERIOR verdict: "'{}' has no fields"
//         cannot be true twice, so at most ONE such line per interior and
//         `{,,}` draws exactly one.
//   SL4 — `malformed-schema-field` is a PER-FIELD row: one line per offending
//         slot, so `{a: integer,,,b: string}` draws exactly TWO.
//   SL5 — ADJACENCY COLLAPSE (§Fix "The count law"): when the entry
//         IMMEDIATELY behind the slot itself draws bug 0244's keyless-entry
//         refusal, that refusal REPLACES the slot's buffered line, so
//         §Reproduction (c) rows c1–c3 stay exactly ONE line, unchanged from
//         HEAD.
//
// ORDER IS PART OF THE ASSERTION. The slot's line is BUFFERED IN THE PARSER
// LOOP and flushed at the interior's closing `}`, ahead of every rule that
// judges the built `TypeNode` — so §(c) c4–c7 read the slot's
// `malformed-schema-field` FIRST and their own sibling-rule line second, and
// §(d) d6 reads the slot's line ahead of the initialiser's
// `theta/parse/bare-object-literal`. That order is bug 0244's landed order for
// its own emission at the same site, measured at HEAD `206e0da9` on the
// byte-neighbour spellings (`{void, Zs: string}`, `{zs, p: void}`,
// `let mut x: {a: integer, zs} = { a: 1, b: "s" }`), not a guess.
//
// FOUR CELLS GAIN A LINE BESIDE ONE THEY ALREADY CARRY, and the additive shape
// is stated at each: §(c) c4–c7 (binding-case-mismatch, duplicate-inline-field-
// name, quoted-inline-field-name, void-in-non-return-position) and §(d) d6
// (bare-object-literal). Every other flip in this file is a cell going from
// `[]` to a single refusal. No cell loses a diagnostic, which is what §Fix
// "What must not move" requires.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:101 —
//     `ObjectType ::= "{" Field ("," Field)* ","? "}"`: ONE optional TRAILING
//     comma, and no `Field` deriving from an empty slot.
//   - docs/spec_topics/grammar.md:109 §"Inline object types" — the inline
//     `Field` reuses the object-schema `Field` form at any `Type` position and
//     any nesting depth, which is why the disposition is the same at all
//     twelve positions of group (B).
//   - docs/spec_topics/schemas.md:17 — "Fields are comma-separated; the
//     trailing comma is optional. Field names are identifiers".
//   - docs/spec_topics/schemas.md:19 — the declaration position's
//     `empty-schema-body` / `malformed-schema-field` partition SL2 mirrors.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:99
//     (`theta/parse/malformed-schema-field`, whose inline clause already
//     claims the loop refuses each KEYLESS entry its walk reaches, with three
//     stated exclusions the empty slot is in none of);
//     docs/spec_topics/diagnostics/code-registry-parse.md:98
//     (`theta/parse/empty-schema-body`);
//     docs/spec_topics/diagnostics/code-registry-parse.md:104, which states bug
//     0129's count-consequence law — the authority for SL3, SL4 and SL5.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:55 — `<X>`
//     renders the literal two-character text `{}` on the empty-inline-object
//     trigger, which is what SL2's inline `empty-schema-body` message reads.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and a test MUST source it from the registry. No
//     message prose is written out below; every expected string is read
//     through `parseRegistry` / `registryMessage`, so a reworded template reds
//     by naming the registry rather than by disagreeing with a copy.
//
// THE LEDGER — 88 diagnostic-list cells, 14 lowering cells and 6 split
// observables, in nine groups plus the inventory. The RED/GREEN split at HEAD
// `206e0da9` (0.251.0):
//   - (A) §Reproduction (a) rows a1–a10: RED, all ten report `[]`.
//   - (A-FENCE) §(a) rows a11–a14, the LEGAL subset and the well-formed
//     control: GREEN, and §Fix makes them a hard bound.
//   - (SPLIT-FENCE) §(a)'s split table: GREEN — the fix touches no split.
//   - (B) §Reproduction (b), twelve `Type` positions × three subject columns:
//     RED at all 36 subject cells; GREEN at all 12 control cells.
//   - (C) §Reproduction (c) rows c1–c8: GREEN at c1–c3 (SL5's adjacency
//     collapse keeps them at ONE line, exactly today's value), RED at c4–c8.
//   - (D) §Reproduction (d) rows d1–d7: RED at d1, d4, d5, d6; GREEN at d2,
//     d3, d7.
//   - (E) §Reproduction (e) rows e1–e9: RED at e6 and e7; GREEN at e1–e5, e8,
//     e9 — the declaration position already implements SL2's partition, which
//     is the whole authority for it.
//   - (F-FENCE) §Reproduction (f) rows f1–f9, `lowerQueryResponseSchema` over
//     an annotation STRING: GREEN, all nine — that entry point takes no
//     document, so no parse refusal gates it and the fix cannot move it.
//   - (F-PARAMS) the `params:` half of §(f): RED at the three subject rows
//     (each must withhold the frontmatter, so `loweredSchema` is `null` — the
//     value `p: '{}'` already yields), GREEN at the control row and its
//     `__inline_9b890568745f5ea5` slug.
//   - (SLOT-COMPOSITION) the slot composed with the two OTHER zero-token
//     positions an interior can spell — a keyless entry beside a second slot,
//     and bug 0237's empty TYPE position beside a slot. Measured post-fix and
//     pinned so the counts SL2/SL3/SL5 imply for a COMPOSED interior are
//     stated rather than discovered.
//   - (REG) the registry fence: GREEN — both rows exist and the emitted text
//     equals the registry template.
//   - (L) the inventory arithmetic, recomputed from the tables.
//
// §Reproduction's CORPUS CENSUS is not re-probed here. The claim is that no
// committed `.theta` / `.thetalib` spells `,[[:space:]]*,` or `\{[[:space:]]*,`,
// so a fix newly refuses no shipped source; that claim is discharged
// corpus-wide by `tests/committed-fixture-parse-gate.test.ts`, which parses
// every committed fixture the repository ships (AGENTS.md §"No silent
// skipping"). Re-walking `git ls-files` from here would duplicate that gate
// with a weaker scratch-probe version of it.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, and every group
// is asserted as ONE whole-map equality, so neither an extra diagnostic, nor a
// right diagnostic in a wrong order, nor a divergence in a later cell can hide
// behind an earlier cell's failure.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts a parse-time claim in. Every observable settles inside one
// `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts), one read of the settled document's own frontmatter
// object, or one direct call into a shipped pure function. An integration tier
// would add a session round-trip to a parse-time value and a live tier would
// make a determined value stochastic; neither buys reach for this claim.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup THROWS naming the
// missing row, so a reworded or absent Message row reds by naming the registry
// rather than by comparing against `undefined`. Group (L) recomputes the
// declared inventory from the tables themselves and re-checks the property that
// makes each subject a subject, so a row dropped or edited flat reds there
// rather than shrinking a group unnoticed.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. THROWS, naming the missing row, so a missing row can never degrade
 * an assertion below into a comparison against `undefined` and can never be
 * silently replaced by a hard-coded string. Called only from inside a test
 * body: at module scope a throw would abort collection and take the green
 * fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. Bug 0257's §Fix mints NO code: it REUSES ` +
        `theta/parse/malformed-schema-field and theta/parse/empty-schema-body ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md:99 and ` +
        `docs/spec_topics/diagnostics/code-registry-parse.md:98), amending their ` +
        `Trigger prose in the same commit and changing neither Message`,
    );
  }
  return template;
}

const MALFORMED_FIELD = "theta/parse/malformed-schema-field";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const REASSIGN_RHS_MISMATCH = "theta/parse/reassign-rhs-type-mismatch";
const BARE_OBJECT_LITERAL = "theta/parse/bare-object-literal";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const DUP_FIELD = "theta/parse/duplicate-inline-field-name";
const QUOTED_FIELD = "theta/parse/quoted-inline-field-name";
const VOID_NON_RETURN = "theta/parse/void-in-non-return-position";
const IMPORT_MALFORMED = "theta/parse/import-malformed-specifier-list";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** SL2's line for a slot standing behind at least one derived `Field`. */
const MALF: Exp = { severity: "error", code: MALFORMED_FIELD, fills: [] };

/**
 * SL2's line for a slot with NO `Field` derived before it. The subject is the
 * anonymous inline type, rendered as the literal two-character text `{}` by the
 * `<X>` rule at docs/spec_topics/diagnostics/placeholder-rendering-b.md:55 —
 * the same rendering `{}` itself already draws (§(a) row a13), which is the
 * point of the a8-versus-a13 pair: both lower the same bytes, so both must
 * carry the same refusal.
 */
const EMPTY: Exp = { severity: "error", code: EMPTY_BODY, fills: [["<X>", "{}"]] };

function LETRHS(name: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: LET_RHS_MISMATCH,
    fills: [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}

function REASSIGNRHS(name: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: REASSIGN_RHS_MISMATCH,
    fills: [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}

const BARE_OBJ: Exp = { severity: "error", code: BARE_OBJECT_LITERAL, fills: [] };
const CASE_MISMATCH: Exp = { severity: "error", code: BINDING_CASE, fills: [] };
const VOID_HERE: Exp = { severity: "error", code: VOID_NON_RETURN, fills: [] };
const IMPORT_LIST: Exp = { severity: "error", code: IMPORT_MALFORMED, fills: [] };

function DUPLICATE(field: string): Exp {
  return { severity: "error", code: DUP_FIELD, fills: [["<field>", field]] };
}

function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_FIELD, fills: [["<field>", field]] };
}

/** One rendered diagnostic, in the shape `diagLines` produces. */
function render(exp: Exp): string {
  const template = registryMessageOf(exp.code);
  let out = template;
  for (const [slot, value] of exp.fills) {
    expect(
      template,
      `DIAG-4: the ${exp.code} row's Message must still carry the ${slot} slot this file ` +
        `renders; observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `${exp.severity} ${exp.code}: ${out}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}

// ===========================================================================
// Parse harness. `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped whole-file
// entry point `parseThetaDocument` wrapped in the standard inert deps — an
// in-band no-op system-note channel and a resolving `model:` matcher. No
// behaviour is stubbed: the lexer, the parser, the frontmatter reader and the
// lowerers under assertion are the production ones.
// ===========================================================================

/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: subagent\n---\n";

/** A `mode: subagent` theta whose body is `stmt`. */
function theta(stmt: string): string {
  return `${FM}${stmt}\n`;
}

/**
 * §Reproduction's verbatim `params:` fixture: a whole theta whose one `params:`
 * field carries the type under test as a single-quoted YAML scalar, so the
 * scalar the frontmatter reader delivers is that text verbatim. The document
 * BODY is `1`, a resolving expression, so no `theta/parse/unknown-identifier`
 * from the body can contaminate a cell. No type measured here spells a `'`,
 * which group (L) recomputes.
 */
function paramsSrc(type: string): string {
  return `---\nmode: subagent\nparams:\n  p: '${type}'\n---\n1\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(type: string): string {
  return JSON.stringify(parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema ?? null);
}

/** One diagnostic-list cell. */
interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string | undefined;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the subject-versus-control
 * agreement claims are only meaningful against whole lists compared together.
 */
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${c.src}`;
    actual[key] = lines(c.src, c.path ?? "test.theta");
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// ===========================================================================
// The fixtures, named once — §Reproduction (a) and (b) share them.
// ===========================================================================

/** THE SUBJECT of the `malformed-schema-field` half: a doubled comma. */
const DOUBLED = "{a: integer,,b: string}";
/** THE SUBJECT of the `empty-schema-body` half: a leading comma. */
const LEADING = "{,a: integer}";
/** THE SHARPEST SUBJECT: a comma-only interior, lowering `{}`'s own bytes. */
const LONE = "{,}";
/** THE WELL-FORMED CONTROL, one keystroke from `DOUBLED`. */
const CONTROL = "{a: integer,b: string}";

// ===========================================================================
// (A) THE CLASS — §Reproduction (a) rows a1–a10, each `fn f(p: <I>): integer
// { 1 }`. Every one reports `[]` and REGISTERS at HEAD.
// ===========================================================================

/** §(a) rows a1–a10 with the post-fix list SL2/SL3/SL4 assign each. */
const A_SUBJECT_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  // a1–a3, a7 — a `Field` derived before the slot, so SL2 sends them to
  // `malformed-schema-field`. a3 spells TWO slots between the same pair of
  // fields and draws TWO lines: SL4's per-field row.
  ["a1 doubled comma", DOUBLED, [MALF]],
  ["a2 doubled comma, spaced", "{a: integer, ,b: string}", [MALF]],
  ["a3 tripled comma", "{a: integer,,,b: string}", [MALF, MALF]],
  // a7 is THE DISCRIMINATOR against the legal subset: one comma past the
  // trailing comma `ObjectType`'s `","?` admits, and today the same `[]`.
  ["a7 one past the legal trailing comma", "{a: integer,,}", [MALF]],
  // a4–a6, a8–a10 — NO `Field` derived before the slot, so SL2 sends them to
  // `empty-schema-body` with the anonymous subject. a6 and a10 spell TWO slots
  // and still draw ONE line: SL3's per-interior verdict, since "'{}' has no
  // fields" cannot be true twice of one interior.
  ["a4 leading comma", LEADING, [EMPTY]],
  ["a5 leading comma, spaced", "{, a: integer}", [EMPTY]],
  ["a6 two leading commas", "{,,a: integer}", [EMPTY]],
  ["a8 comma-only interior", LONE, [EMPTY]],
  ["a9 comma-only interior, spaced", "{, }", [EMPTY]],
  ["a10 two-comma interior", "{,,}", [EMPTY]],
];

/** §(a) rows a11–a14: the LEGAL subset, the empty object, the control. */
const A_FENCE_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  ["a11 legal trailing comma", "{a: integer,}", []],
  ["a12 legal trailing comma, spaced", "{a: integer, }", []],
  ["a13 the empty object", "{}", [EMPTY]],
  ["a14 the well-formed control", CONTROL, []],
];

describe("bug 0257 (A) — the empty entry slot is refused, with the declaration position's partition", () => {
  it("rows a1–a10: a Field derived before the slot draws malformed-schema-field, none draws empty-schema-body ", () => {
    expectGroup(
      A_SUBJECT_ROWS.map(([id, type, expected]) => ({
        cell: `${id} ${type} `,
        src: theta(`fn f(p: ${type}): integer { 1 }`),
        expected,
      })),
      "docs/spec_topics/grammar.md:101 spells `ObjectType ::= \"{\" Field (\",\" Field)* \",\"? " +
        '"}"`, which admits ONE trailing comma and derives no `Field` from an empty slot, and ' +
        "docs/spec_topics/schemas.md:19 fixes the partition the declaration position already " +
        "implements (§Expected behaviour 1 and 3). A red reporting `[]` IS bug 0257: " +
        "`TypeParser.parseObject` (src/parser/type-grammar.ts) took its `,`-at-a-field-name " +
        "branch, reset the entry cursor and the refusal latch, and returned from the slot with " +
        "no line buffered, so the theta registered over source no production derives. A red at " +
        "a3 reporting ONE line breaks SL4's per-field count (bug 0129's count-consequence law, " +
        "docs/spec_topics/diagnostics/code-registry-parse.md:104); a red at a6 or a10 " +
        "reporting TWO lines breaks SL3 — \"'{}' has no fields\" is a per-interior verdict and " +
        "cannot be true twice of one interior. A red swapping the two codes on any row is the " +
        "partition inverted: the code depends only on whether a `Field` derived BEFORE the slot",
    );
  });

  it("rows a11–a14 (FENCE, green at HEAD): the legal trailing comma and the control do not move ", () => {
    expectGroup(
      A_FENCE_ROWS.map(([id, type, expected]) => ({
        cell: `${id} ${type} `,
        src: theta(`fn f(p: ${type}): integer { 1 }`),
        expected,
      })),
      "the legal subset is §Fix's HARD BOUND: docs/spec_topics/grammar.md:101 spells `\",\"?` " +
        "and docs/spec_topics/schemas.md:17 states the trailing comma is optional, so a11 and " +
        "a12 derive and their `[]` is correct. A red here is the fix over-refusing — the " +
        "reachability argument §Fix states (no grammar-legal spelling reaches the branch, " +
        "because the loop's own `eatPunct(\",\")` consumes the legal trailing comma and the " +
        "loop then exits on `}`) has been broken. A red at a13 losing its single " +
        "empty-schema-body line, or gaining a second, is the fix disturbing the row it reuses",
    );
  });
});

// ===========================================================================
// (SPLIT-FENCE) §Reproduction (a)'s split table — GREEN at HEAD and after.
//
// The slot is absent from `TypeNode.fieldNames`, from `fieldTypes` and from
// `inlineObjectFieldKeys`' output, which is exactly why §Fix routes the
// emission through the parser arm: widening the key rule to mint a key for an
// empty segment would move the four raw-key rows and both lowerers keyed on the
// same split (bug 0159's by-construction agreement). These six cells are the
// fence that proves the route taken was the parser arm and not the split.
// ===========================================================================

const SPLIT_ROWS: ReadonlyArray<readonly [string, readonly string[], number]> = [
  ["a: integer,,b: string", ["a: integer", "", "b: string"], 1],
  [",a: integer", ["", "a: integer"], 2],
  ["a: integer,", ["a: integer", ""], 1],
  [",", ["", ""], -1],
  [",,", ["", "", ""], -1],
  ["a: integer,,", ["a: integer", "", ""], 1],
];

describe("bug 0257 (SPLIT-FENCE) — the raw-key split is unmoved by the refusal", () => {
  it("splitTopLevelSegments and topLevelColon over the six interior texts ", () => {
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const [text, segments, colon] of SPLIT_ROWS) {
      actual[text] = {
        segments: splitTopLevelSegments(text, ",", "angle-and-brace"),
        topLevelColon: topLevelColon(text),
      };
      expected[text] = { segments: [...segments], topLevelColon: colon };
    }
    expect(
      actual,
      "`splitTopLevelSegments` / `topLevelColon` (`src/parser/params.ts`) are the shared key " +
        "rule the four raw-key rows and both lowerers read (bug 0159's by-construction " +
        "agreement). An empty segment stands in the split for the LEGAL spelling too " +
        "(`a: integer,` yields one), so the split alone cannot divide legal from illegal and " +
        "§Fix forbids the emission being routed through it. A red here is a route that widened " +
        "the key rule instead of emitting in `TypeParser.parseObject`'s own arm — which would " +
        "move `theta/parse/duplicate-inline-field-name`, `theta/parse/quoted-inline-field-name` " +
        "and both hoisting lowerers with it",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (B) THE CLASS AT TWELVE `Type` POSITIONS — §Reproduction (b).
// docs/spec_topics/grammar.md:109 admits the inline `Field` in any `Type`
// position at any depth, so the disposition is the same at all twelve.
// ===========================================================================

/** §Reproduction (b)'s twelve `Type` positions, parameterised by the type text. */
function positionRows(type: string): ReadonlyArray<readonly [string, string, string | undefined]> {
  return [
    ["b1 fn parameter", theta(`fn f(p: ${type}): integer { 1 }`), undefined],
    ["b2 fn return", theta(`fn f(): ${type} { 1 }`), undefined],
    ["b3 schema body field", theta(`schema S { a: ${type} }`), undefined],
    ["b4 alias RHS", theta(`schema T = ${type}`), undefined],
    ["b5 let annotation union arm", theta(`let x: ${type} | null = null`), undefined],
    ["b6 let annotation", theta(`let x: ${type} = 1`), undefined],
    ["b7 @<T> annotation root", theta("let r = @<" + type + ">`hi`"), undefined],
    // b8 is b3 written in a `.thetalib`, which carries no frontmatter — the
    // path is what selects the library grammar, so it is passed explicitly.
    ["b8 .thetalib schema body field", `schema S { a: ${type} }\n`, "lib.thetalib"],
    ["b9 params: field", paramsSrc(type), undefined],
    ["b10 nested one level", theta(`schema S { a: { p: ${type} } }`), undefined],
    ["b11 generic argument", theta(`fn f(p: array<${type}>): integer { 1 }`), undefined],
    ["b12 union arm", theta(`schema S { a: ${type} | integer }`), undefined],
  ];
}

/** The three subject columns and the control column of §(b)'s table. */
const B_COLUMNS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  ["subject doubled", DOUBLED, [MALF]],
  ["subject leading", LEADING, [EMPTY]],
  ["subject comma-only", LONE, [EMPTY]],
  ["control", CONTROL, []],
];

/**
 * b6 is the ONE position where the control carries a line, and it is the line
 * this class withholds (§Reproduction (d) d1). The three subject columns carry
 * their §(a) line ALONE there: §Fix's "The `let`-annotation layer" clause
 * settles that `inlineObjectAnnotationToCompatType`
 * (src/parser/type-layer-checks.ts) keeps declining the slot as malformation,
 * so TYPE-8 has no field set to compare and the parse refusal stands alone —
 * one line for one written mistake. Measured at HEAD on the byte-neighbour
 * spellings the parser already refuses in the same arm (`let x: {void} = 1`
 * and `let x: {} = 1` each report exactly one line, never two).
 */
function bCells(): Cell[] {
  const cells: Cell[] = [];
  for (const [label, type, expected] of B_COLUMNS) {
    for (const [id, src, path] of positionRows(type)) {
      const isLet = id === "b6 let annotation";
      cells.push({
        cell: `${id} ${label} ${type} `,
        src,
        path,
        expected:
          isLet && label === "control" ? [LETRHS("x", "{ a: integer, b: string }", "integer")] : expected,
      });
    }
  }
  return cells;
}

describe("bug 0257 (B) — the twelve Type positions agree, params: and .thetalib included", () => {
  it("rows b1–b12 in four columns ", () => {
    expectGroup(
      bCells(),
      "docs/spec_topics/grammar.md:109 admits the inline `Field` in any `Type` position at any " +
        "depth, so all twelve positions carry one disposition (§Expected behaviour 5). A red " +
        "on a SUBJECT cell reporting `[]` is bug 0257 at that position — including b11 inside " +
        "`array<…>`, b10 at nested depth, b12 in a union arm, b8 in a `.thetalib` and b9 at " +
        "the verbatim `params:` position, the one that reaches a provider. The twelve CONTROL " +
        "cells are GREEN at HEAD and must stay GREEN: the agreement is reached by ADDING the " +
        "subject's refusal, never by removing the control's. A red at a SUBJECT b6 cell " +
        "reporting a let-rhs-type-mismatch BESIDE the slot's line contradicts §Fix's " +
        "`let`-annotation clause, which settles one line for one written mistake",
    );
  });
});

// ===========================================================================
// (C) THE ENTRY BEHIND THE SLOT — §Reproduction (c), each row
// `fn f(p: <I>): integer { 1 }`.
//
// c1–c3 are SL5's adjacency collapse and are GREEN at HEAD: the entry
// immediately behind the slot itself draws bug 0244's keyless-entry refusal,
// and that refusal REPLACES the slot's buffered line, so each row stays at
// exactly ONE line — the count §Fix pins and §Expected behaviour 4 states.
// c4–c7 are ADDITIVE flips: the entry behind the slot spells `Ident ":"`, so it
// draws NO keyless refusal and the slot's own line stands beside the sibling
// rule's. The slot's line is emitted FIRST, because it is buffered in the
// parser loop and flushed at the interior's closing `}` while every sibling
// rule below judges the built `TypeNode` afterwards — the order bug 0244's own
// emission already shows at HEAD for `{void, Zs: string}`, `{void, a: integer,
// a: integer}`, `{void, "q": string}` and `{zs, p: void}`.
// ===========================================================================

const C_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  ["c1 keyword entry behind the slot", "{a: integer,,void}", [MALF]],
  ["c2 keyword entry behind a leading slot", "{,void}", [MALF]],
  ["c3 bare name behind the slot", "{a: integer,,zs}", [MALF]],
  ["c4 capitalised field behind the slot", "{a: integer,,Zs: string}", [MALF, CASE_MISMATCH]],
  ["c5 repeated field behind the slot", "{a: integer,,a: integer}", [MALF, DUPLICATE("a")]],
  ['c6 quoted field behind the slot', '{a: integer,,"q": string}', [MALF, QUOTED('"q"')]],
  ["c7 void field behind the slot", "{a: integer,,p: void}", [MALF, VOID_HERE]],
  ["c8 the slot at nested depth", "{a: {b: integer,,c: string}}", [MALF]],
];

describe("bug 0257 (C) — the adjacency collapse, and every sibling rule intact beside the slot", () => {
  it("rows c1–c8 ", () => {
    expectGroup(
      C_ROWS.map(([id, type, expected]) => ({
        cell: `${id} ${type} `,
        src: theta(`fn f(p: ${type}): integer { 1 }`),
        expected,
      })),
      "SL5 (§Fix's count law, docs/spec_topics/diagnostics/code-registry-parse.md:104): a slot " +
        "standing beside an entry that already draws its own keyless refusal adds NOTHING to " +
        "that entry, so c1–c3 stay at ONE line, exactly today's value. A red at c1, c2 or c3 " +
        "reporting TWO lines is the count law broken — two lines for one written mistake. A " +
        "red at c4–c7 reporting the sibling rule ALONE is bug 0257 surviving beside a " +
        "diagnostic another rule drew: those entries spell `Ident \":\"`, so no keyless " +
        "refusal is there to absorb the slot's line and SL2 must place it. A red at c4–c7 " +
        "with the two lines in the OTHER order is a route that emitted the slot's line off the " +
        "built `TypeNode` instead of buffering it in the parser loop, which contradicts §Fix's " +
        "emission site. A red at c8 reporting `[]` is the class unrefused at nested depth",
    );
  });
});

// ===========================================================================
// (D) THE `let` ANNOTATION — §Reproduction (d).
//
// The second, silent consequence: one extra comma turns TYPE-8's static check
// off, so `let x: {a: integer,,b: string} = 1` reports NOTHING where both its
// well-formed neighbour (d2) and the grammar-legal trailing-comma spelling (d3)
// report the initialiser mismatch. §Fix settles that the refusal stands ALONE:
// `inlineObjectAnnotationToCompatType` (src/parser/type-layer-checks.ts) keeps
// declining, so TYPE-8's own row does not additionally fire at d1, d4 or d5.
// ===========================================================================

const D_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  ["d1 doubled comma", theta("let x: {a: integer,,b: string} = 1"), [MALF]],
  [
    "d2 well-formed neighbour (FENCE)",
    theta("let x: {a: integer,b: string} = 1"),
    [LETRHS("x", "{ a: integer, b: string }", "integer")],
  ],
  [
    "d3 legal trailing comma (FENCE)",
    theta("let x: {a: integer,} = 1"),
    [LETRHS("x", "{ a: integer }", "integer")],
  ],
  ["d4 leading comma", theta("let x: {,a: integer} = 1"), [EMPTY]],
  ["d5 comma-only interior", theta("let x: {,} = 1"), [EMPTY]],
  // d6 — an ADDITIVE flip. The `bare-object-literal` line is the fixture's own
  // initialiser spelling and does not move; the slot's line joins it, ahead of
  // it, on the same buffered-in-the-loop ordering group (C) c4–c7 assert.
  [
    "d6 reassignment, doubled comma",
    theta('let mut x: {a: integer,,b: string} = { a: 1, b: "s" }\nx = 1'),
    [MALF, BARE_OBJ],
  ],
  [
    "d7 reassignment, well-formed (FENCE)",
    theta('let mut x: {a: integer,b: string} = { a: 1, b: "s" }\nx = 1'),
    [BARE_OBJ, REASSIGNRHS("x", "{ a: integer, b: string }", "integer")],
  ],
];

describe("bug 0257 (D) — the withheld TYPE-8 rows at a let annotation", () => {
  it("rows d1–d7 ", () => {
    expectGroup(
      D_ROWS.map(([id, src, expected]) => ({ cell: `${id} `, src, expected })),
      "§Why it matters: one extra comma does not merely go unreported — it SUPPRESSES a report " +
        "the author would otherwise get about a different mistake, because " +
        "`inlineObjectAnnotationToCompatType` (src/parser/type-layer-checks.ts) reads the slot " +
        "as malformation and declines to the deferring nominal while the parser admits it. A " +
        "red at d1, d4 or d5 reporting `[]` is that divergence unclosed. A red at d1, d4 or d5 " +
        "reporting the parse refusal BESIDE a let-rhs-type-mismatch contradicts §Fix's " +
        "settled `let`-annotation disposition — the conversion keeps declining and the parse " +
        "refusal stands alone, one line for one written mistake (bug 0129's count law, " +
        "docs/spec_topics/diagnostics/code-registry-parse.md:104). A red at d2, d3 or d7 is " +
        'the fix moving a cell §Fix "What must not move" pins — d3 in particular is the LEGAL ' +
        "trailing comma converting, which is what proves d1's withholding is caused by the " +
        "extra comma alone",
    );
  });
});

// ===========================================================================
// (E) THE DECLARATION POSITION — §Reproduction (e).
//
// e1–e5 and e8–e9 are GREEN at HEAD and are the whole AUTHORITY for SL2: the
// declaration position already refuses every illegal spelling with the exact
// partition `code-registry-parse.md:99` states, and leaves the legal trailing
// comma clean. e6 and e7 are the inline spellings of e1 and e3 — one `Field`
// form (docs/spec_topics/grammar.md:109), two verdicts at HEAD.
// ===========================================================================

const E_ROWS: ReadonlyArray<readonly [string, string, string | undefined, readonly Exp[]]> = [
  ["e1 declaration, doubled comma (FENCE)", theta("schema S { a: integer,, b: string }"), undefined, [MALF]],
  ["e2 declaration, past the trailing comma (FENCE)", theta("schema S { a: integer,, }"), undefined, [MALF]],
  [
    "e3 declaration, leading comma (FENCE)",
    theta("schema S { , a: integer }"),
    undefined,
    [{ severity: "error", code: EMPTY_BODY, fills: [["<X>", "S"]] }],
  ],
  [
    "e4 declaration, comma-only body (FENCE)",
    theta("schema S { , }"),
    undefined,
    [{ severity: "error", code: EMPTY_BODY, fills: [["<X>", "S"]] }],
  ],
  ["e5 declaration, legal trailing comma (FENCE)", theta("schema S { a: integer, }"), undefined, []],
  ["e6 inline spelling of e1", theta("fn f(p: {a: integer,, b: string}): integer { 1 }"), undefined, [MALF]],
  ["e7 inline spelling of e3", theta("fn f(p: {, a: integer}): integer { 1 }"), undefined, [EMPTY]],
  [
    "e8 import specifier list, doubled comma (FENCE)",
    'import { a, , b } from "./lib.thetalib"\n',
    "lib2.thetalib",
    [IMPORT_LIST],
  ],
  [
    "e9 import specifier list, leading comma (FENCE)",
    'import { , a } from "./lib.thetalib"\n',
    "lib2.thetalib",
    [IMPORT_LIST],
  ],
];

describe("bug 0257 (E) — the inline position joins the declaration position's landed partition", () => {
  it("rows e1–e9 ", () => {
    expectGroup(
      E_ROWS.map(([id, src, path, expected]) => ({ cell: `${id} `, src, path, expected })),
      "e1/e6 and e3/e7 are the position asymmetry over ONE `Field` form " +
        "(docs/spec_topics/grammar.md:109). A red at e6 or e7 reporting `[]` is that asymmetry " +
        "unclosed — the declaration position refuses the same bytes and the inline position " +
        "admits them. A red at e6 or e7 carrying the OTHER code is SL2's partition inverted: " +
        "e6 derived a `Field` before the slot and e7 did not, which is the only question the " +
        "code depends on, and the declaration rows beside them show the answer. A red at " +
        "e1–e5, e8 or e9 is the fix disturbing the landed behaviour it takes its authority " +
        "from; e3 and e4 in particular must keep the DECLARATION subject 'S' while e7 renders " +
        "the anonymous inline subject, per " +
        "docs/spec_topics/diagnostics/placeholder-rendering-b.md:55",
    );
  });
});

// ===========================================================================
// (F-FENCE) THE TEXTUAL LOWERER — §Reproduction (f) rows f1–f9.
//
// `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts) is handed an
// annotation STRING with no document around it, so no parse-time refusal gates
// it and the fix cannot move these bytes. GREEN at HEAD and after. They are
// recorded because f6–f9 are the harm §Why it matters names: a comma-only
// interior lowers the exact fragment `theta/parse/empty-schema-body` exists to
// refuse, which is why the refusal must be delivered at the DOCUMENT.
// ===========================================================================

const FRAG_AB =
  '{"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},' +
  '"required":["a","b"],"additionalProperties":false}';
const FRAG_A =
  '{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],' +
  '"additionalProperties":false}';
const FRAG_EMPTY =
  '{"type":"object","properties":{},"required":[],"additionalProperties":false}';

const F_LOWERINGS: ReadonlyArray<readonly [string, string, string]> = [
  ["f1", DOUBLED, FRAG_AB],
  ["f2", CONTROL, FRAG_AB],
  ["f3", LEADING, FRAG_A],
  ["f4", "{a: integer,,}", FRAG_A],
  ["f5", "{a: integer,}", FRAG_A],
  ["f6", LONE, FRAG_EMPTY],
  ["f7", "{, }", FRAG_EMPTY],
  ["f8", "{,,}", FRAG_EMPTY],
  ["f9", "{}", FRAG_EMPTY],
];

/** The control's hoisted `$defs` slug — §Fix pins it byte-for-byte. */
const CONTROL_PARAMS_LOWERED =
  '{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_9b890568745f5ea5"}},' +
  `"required":["p"],"additionalProperties":false,"$defs":{"__inline_9b890568745f5ea5":${FRAG_AB}}}`;

describe("bug 0257 (F-FENCE) — lowerQueryResponseSchema's bytes are unmoved", () => {
  it("rows f1–f9: the annotation-string entry point takes no document, so no refusal gates it ", () => {
    const actual: Record<string, string> = {};
    const expected: Record<string, string> = {};
    for (const [id, type, bytes] of F_LOWERINGS) {
      actual[`${id} ${type}`] = JSON.stringify(lowerQueryResponseSchema(type, [], []) ?? null);
      expected[`${id} ${type}`] = bytes;
    }
    expect(
      actual,
      "f1/f2 are the bound at the wire: a mixed interior lowers exactly what its well-formed " +
        "byte-neighbour lowers, so no property is lost or renamed by the slot. f6–f9 are the " +
        "harm: a comma-only interior lowers the SAME BYTES `{}` lowers, and only `{}` is " +
        "refused today — which is the a8-versus-a13 pair group (A) closes. A red here is a " +
        "route that changed the lowerer's field division instead of refusing the document, " +
        "which §Fix's emission-site constraint rules out",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (F-PARAMS) THE `params:` HALF OF §Reproduction (f) — the wire consequence.
//
// A refused document withholds its frontmatter, so `loweredSchema` is `null` —
// the same value `p: '{}'` already yields today (§(a) a13), the shape bug
// 0256's witness records at its own rows a1/a2. The three subject rows are RED
// at HEAD, and f12's row is the sharpest: `p: '{,}'` lowers `p` to the
// permissive `{}` — every value accepted — where `p: '{}'` is refused for
// producing those exact bytes.
// ===========================================================================

describe("bug 0257 (F-PARAMS) — no params: field lowers from this shape", () => {
  it("the three subjects withhold their frontmatter; the control keeps its slug ", () => {
    expect(
      {
        "doubled comma": loweredParams(DOUBLED),
        "leading comma": loweredParams(LEADING),
        "comma-only interior": loweredParams(LONE),
        "control (FENCE)": loweredParams(CONTROL),
        "the empty object (FENCE)": loweredParams("{}"),
      },
      "§Expected behaviour 6: no comma-only interior lowers the fragment " +
        "`theta/parse/empty-schema-body` refuses, and no `params:` field lowers to a permissive " +
        '`{}` from this shape. A red at "comma-only interior" reporting ' +
        '`{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` ' +
        "is the wire harm itself — a declared `params:` contract reaching the provider as the " +
        "accept-anything schema, from a document with no diagnostic. A red at the two other " +
        "subjects reporting a `$defs` fragment is the frontmatter surviving an error-severity " +
        'parse refusal. A red at "control (FENCE)" is §Fix\'s pinned no-move cell moving, slug ' +
        "included",
    ).toEqual({
      "doubled comma": "null",
      "leading comma": "null",
      "comma-only interior": "null",
      "control (FENCE)": CONTROL_PARAMS_LOWERED,
      "the empty object (FENCE)": "null",
    });
  });
});

// ===========================================================================
// (SLOT-COMPOSITION) THE SLOT BESIDE THE OTHER ZERO-TOKEN POSITIONS.
//
// Groups (A)–(E) measure one slot against well-formed neighbours. An interior
// may instead compose the slot with a SECOND slot, or with the empty TYPE
// position (`{a: }`) — bug 0237's §Fix residual 1
// (docs/bugs/0237-empty-inline-field-type-truncates-interior.md), a position
// this fix does not claim and does not move. The composed counts follow from
// SL2, SL3 and SL5 together rather than from any one of them, so they are
// pinned here instead of being left to be discovered by whoever next edits the
// arm.
//
// R1 `{,void,,x: integer}` — ONE `malformed-schema-field`, and the derivation
// is the whole point of the cell. The LEADING slot has no `Field` before it, so
// SL2 buffers `empty-schema-body`; the keyless entry `void` immediately behind
// it draws bug 0244's own refusal, which by SL5 REPLACES that buffered line
// with `malformed-schema-field`; the SECOND slot then buffers nothing, because
// SL3 makes `empty-schema-body` a per-interior verdict and this interior's one
// such buffering already happened. One written interior, one line — inside the
// letter of SL3 and SL5 both, and not a fourth rule.
//
// R2 `{a: ,,b: string}` and `{a: ,,}` — ONE `empty-schema-body` each, NOT the
// `malformed-schema-field` a reader scanning left-to-right expects from the
// `a:` before the slot. SL2's test is whether a `Field` DERIVED, not whether
// key text was spelled, and `a: ` derives none: the empty TYPE position is bug
// 0237's residual 1, kept by that report's §Fix and untouched here, so the slot
// still stands behind zero derived fields. The non-slot control `{a: ,b:
// string}` holds that reading to its bound — it spells the same empty TYPE
// position with NO slot beside it and stays `[]`, exactly 0237's kept residual,
// which is what proves the line above is drawn by the slot and not by `a: `.
// ===========================================================================

const SLOT_COMPOSITION_ROWS: ReadonlyArray<readonly [string, string, readonly Exp[]]> = [
  ["R1 leading slot, keyless entry, second slot", "{,void,,x: integer}", [MALF]],
  ["R2a empty TYPE position before the slot", "{a: ,,b: string}", [EMPTY]],
  ["R2b empty TYPE position, slot past the trailing comma", "{a: ,,}", [EMPTY]],
  ["R2c empty TYPE position, NO slot (0237 residual, FENCE)", "{a: ,b: string}", []],
];

describe("bug 0257 (SLOT-COMPOSITION) — the slot beside a keyless entry and beside bug 0237's empty TYPE position", () => {
  it("rows R1–R2c ", () => {
    expectGroup(
      SLOT_COMPOSITION_ROWS.map(([id, type, expected]) => ({
        cell: `${id} ${type} `,
        src: theta(`fn f(p: ${type}): integer { 1 }`),
        expected,
      })),
      "R1 is SL3 and SL5 composed: the leading slot buffers `empty-schema-body`, the keyless " +
        "entry `void` behind it collapses that buffered line into its own " +
        "`malformed-schema-field` (SL5), and the second slot adds nothing because " +
        "`empty-schema-body` is a PER-INTERIOR verdict already spent (SL3). A red reporting TWO " +
        "lines is one of those two laws broken — two lines for one written interior contradicts " +
        "bug 0129's count-consequence law " +
        "(docs/spec_topics/diagnostics/code-registry-parse.md:104). A red reporting " +
        "`empty-schema-body` instead is SL5's collapse not applied to a buffered line that a " +
        "keyless entry stands in front of. R2a/R2b turn on SL2's test being a DERIVED `Field`: " +
        "`a: ` spells a key over an empty TYPE position and derives no field — that position is " +
        "bug 0237's §Fix residual 1 " +
        "(docs/bugs/0237-empty-inline-field-type-truncates-interior.md) and is NOT this fix's " +
        "subject — so the slot behind it has no derived `Field` in front of it and SL2 sends it " +
        "to `empty-schema-body`. A red reporting `malformed-schema-field` there is the " +
        "partition decided on spelled key TEXT rather than on derivation. R2c is the bound: the " +
        "same empty TYPE position with NO slot beside it keeps 0237's kept `[]`, so a red there " +
        "is this fix reaching into another report's residual",
    );
  });
});

// ===========================================================================
// (REG) THE REGISTRY FENCE — the disposition is REUSE, no mint.
// ===========================================================================

describe("bug 0257 (REG) — both reused rows exist and the emitted text is the registry's", () => {
  it("malformed-schema-field and empty-schema-body render from their own Message templates ", () => {
    expect(
      {
        [MALFORMED_FIELD]: registryMessageOf(MALFORMED_FIELD),
        [EMPTY_BODY]: registryMessageOf(EMPTY_BODY),
      },
      "§Fix: \"The registry disposition is REUSE, and the partition is stated. No mint.\" Both " +
        "rows must still exist and must still carry the Message this file renders every cell " +
        "from; a red here is a Message reword, which is a registry-level change §Fix does not " +
        "authorise (it amends the two rows' TRIGGER prose only)",
    ).toEqual({
      [MALFORMED_FIELD]:
        "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'",
      [EMPTY_BODY]: "'<X>' has no fields; an empty schema cannot be validated.",
    });

    // The emitted text must EQUAL the template, filled — the same equality
    // every group above rests on, asserted once directly so a divergence
    // between the emitter and the registry cannot be mistaken for a
    // disposition failure in a group.
    expect(
      {
        inlineMalformed: lines(theta("fn f(p: {a: integer, void}): integer { 1 }")),
        inlineEmpty: lines(theta("fn f(p: {}): integer { 1 }")),
      },
      "these two spellings are ALREADY refused at HEAD by the two rows bug 0257 reuses, so " +
        "this cell measures the emitter against the registry independently of the fix. A red " +
        "here means the rendered text and the registry Message have diverged, and every " +
        "expected value in this file would then be wrong for that reason rather than for a " +
        "disposition reason",
    ).toEqual({
      inlineMalformed: renderAll([MALF]),
      inlineEmpty: renderAll([EMPTY]),
    });
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables, and
// the property that makes each subject a subject.
// ===========================================================================

/** The LEDGER's own numbers, recomputed below from the tables that produce them. */
const TOTAL_LIST_CELLS = 92;
const TOTAL_LOWERING_CELLS = 14;
const TOTAL_SPLIT_OBSERVABLES = 6;

/** A doubled, leading or lone top-level comma — the shape that opens a slot. */
const OPENS_A_SLOT = /,\s*,|\{\s*,/;

describe("bug 0257 (L) — the inventory this file asserts", () => {
  it("the tables carry the declared counts, and no fixture lost the property that makes it a subject ", () => {
    expect(
      {
        listCells:
          A_SUBJECT_ROWS.length +
          A_FENCE_ROWS.length +
          bCells().length +
          C_ROWS.length +
          D_ROWS.length +
          E_ROWS.length +
          SLOT_COMPOSITION_ROWS.length +
          2,
        loweringCells: F_LOWERINGS.length + 5,
        splitObservables: SPLIT_ROWS.length,
      },
      "the declared LEDGER must match the tables; a red here is a row dropped from a table, " +
        "which would shrink a group unnoticed",
    ).toEqual({
      listCells: TOTAL_LIST_CELLS,
      loweringCells: TOTAL_LOWERING_CELLS,
      splitObservables: TOTAL_SPLIT_OBSERVABLES,
    });

    // Every §(a) subject and every §(c) subject must still SPELL a slot: a
    // doubled, leading or post-trailing comma. A fixture edited flat would pass
    // for the wrong reason — it would be bug 0244's already-delivered reach (an
    // entry with at least one token), not this class.
    const subjects = [...A_SUBJECT_ROWS.map(([, t]) => t), ...C_ROWS.map(([, t]) => t)];
    expect(
      subjects.filter((t) => OPENS_A_SLOT.test(t)),
      "every subject must spell a doubled, leading or post-trailing comma; a row that lost it " +
        "spells an ordinary entry and locks nothing here",
    ).toEqual(subjects);

    // No LEGAL-subset fence row may spell one, or the fence would be measuring
    // the subject class and could not witness over-refusal.
    expect(
      A_FENCE_ROWS.filter(([, t]) => OPENS_A_SLOT.test(t)).map(([id]) => id),
      "the legal/control fence must spell NO slot: `{a: integer,}` derives from " +
        "`ObjectType`'s `\",\"?` (docs/spec_topics/grammar.md:101) and is the bound the fix " +
        "must not cross",
    ).toEqual([]);

    expect(
      new Set(subjects).size,
      "the subject spellings must all be distinct, or a cell is silently overwritten inside " +
        "the group's map",
    ).toBe(subjects.length);

    expect(
      [
        ...subjects,
        ...A_FENCE_ROWS.map(([, t]) => t),
        ...B_COLUMNS.map(([, t]) => t),
        ...F_LOWERINGS.map(([, t]) => t),
      ].filter((t) => t.includes("'")).length,
      "no fixture may spell a `'`, or the single-quoted YAML scalar in `paramsSrc` would stop " +
        "delivering the type text verbatim",
    ).toBe(0);
  });
});
