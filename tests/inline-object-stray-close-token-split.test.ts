import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { splitTopLevelSegments, topLevelColon } from "../src/parser/params";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0238 — a stray depth-0 CLOSE token in an inline object type underflows
// `splitTopLevelSegments`' depth counter, so every entry behind it merges into
// one unkeyed segment: `p: '{a: integer, b > c, m: integer}'` loads clean,
// lowers `p` to a one-field `{a}` whose `additionalProperties: false` REJECTS
// the declared field `m`, and withholds all four raw-key rules — while
// `TypeParser.skipMalformedEntry` CLAMPS on the same token and its own field
// rules still fire behind it
// (docs/bugs/0238-stray-close-token-underflows-top-level-split.md). This file is
// that report's §Fix "Witness".
//
// THE MECHANISM (cited BY SYMBOL — bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// stale-citation class for absolute line numbers into src/parser/params.ts, and
// a route that edits that file shifts them, so every citation below names a
// function and its module and never a line in it; docs/STYLE.md §Citations).
// `splitTopLevelSegments` (src/parser/params.ts) increments its `depth` on `<`
// — and on `{` when `nesting === "angle-and-brace"` — decrements it
// unconditionally on `>` / `}`, and honours a separator only at `depth === 0`.
// A close token that opens nothing drives `depth` to `-1`, nothing raises it
// again in these fixtures, and the rest of the source accretes into one final
// segment. `topLevelColon` (src/parser/params.ts) repeats the shape and returns
// `-1` for the merged segment. Measured at HEAD:
//
//     splitTopLevelSegments("a: integer, b > c, m: integer", ",", "angle-and-brace")
//       → ["a: integer", "b > c, m: integer"]
//     topLevelColon("b > c, m: integer") → -1
//
// The three consumers that pair the two functions skip an entry whose
// `topLevelColon` is negative, because that is also what a legitimately keyless
// entry looks like: `inlineObjectFieldKeys` (src/parser/type-grammar.ts), the
// sole key source for the four raw-key rules; `hoistInlineObjectType`
// (src/parser/params.ts), where the `params:` fields disappear; and
// `lowerInlineObject` (src/parser/body-type-lowering.ts). None of the three
// emits anything on the skip, so the contract is deleted in silence.
//
// The gate the four raw-key rules share is satisfied for these interiors:
// `theta/parse/binding-case-mismatch`, gated on `TypeNode.closingBraceSpelled`
// alone, fires on `Zs` in `{a: integer, b > c, Zs: string}` (cell W13), which
// proves both that `TypeParser.parseObject`'s field loop reads PAST the stray
// token — bug 0231's `TypeParser.skipMalformedEntry` clamp
// (src/parser/type-grammar.ts) returns without decrementing on a depth-0 close
// token — and that the interior source the rules read is complete. One
// interior, two inventories, and they disagree.
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled by the parent run, premeasured by it
// against a working prototype: .pi/tmp/fixes/0238-premeasure.md)
// =====================================================================
// §Fix ROUTE (a) — CLAMP TO MATCH, implemented as a TYPED opener stack rather
// than as §Fix (a)'s literal `Math.max(0, depth - 1)` sketch. `>` closes only a
// `<`, `}` only a `{`, `)` only a `(`; a close token whose innermost OPEN frame
// is not its own matching opener (or none) is INERT — it neither opens nor
// closes a nesting level. The rule is §Kind 1's own words ("a close token with
// no matching opener") and it is applied in `splitTopLevelSegments` and
// `topLevelColon` (src/parser/params.ts), with the same rule in
// `TypeParser.skipMalformedEntry` (src/parser/type-grammar.ts) so the two
// inventories of one interior agree (§Expected behaviour 1). In `"angle"` mode
// the typed rule and a bare floor coincide, so `classifyGenericArgumentSegments`
// and `findCutBracketGroupText` (src/parser/params.ts) — the angle-only scans
// bug 0204 §Fix (b)(3) requires reproduce the split byte for byte (§Fix
// constraint 3) — take the floor. No diagnostic code is minted and no registry
// row moves: the only newly-refusing inputs draw codes already registered for
// exactly those spellings.
//
// WHY THE BARE FLOOR IS NOT ENOUGH, measured by the parent run: with
// `depth = Math.max(0, depth - 1)` alone, W15 (`{a: integer, n: {q > r, m:
// integer}}`) does NOT move — the stray `>` inside `n`'s own braces cancels a
// REAL `{`, depth never goes negative, and the floor never engages — while §Fix
// (a) promises W15's inner `m` reaches the fragment and §Fix constraint 2
// enumerates W15. The typed rule is what closes that cell, and the unit group
// (U) below pins exactly that arithmetic.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE. The
// post-fix values are the parent run's prototype measurements; every slug and
// every lowered byte asserted here was re-derived independently for this file
// from the canonical form (schema-subset.md:73 — the `__inline_<slug>` hoist,
// slug = first 16 hex characters of SHA-256 over the canonical-form bytes),
// never read back out of the implementation's serialiser:
//
//     canonical({"type":"object","properties":{"a":{"type":"integer"},
//                "m":{"type":"integer"}},"required":["a","m"],
//                "additionalProperties":false})
//       = {"additionalProperties":false,"properties":{"a":{"type":"integer"},
//          "m":{"type":"integer"}},"required":["a","m"],"type":"object"}
//       → sha256 → 6ab13cdeb4b48b5a…   ⇒ __inline_6ab13cdeb4b48b5a
//
// and likewise __inline_dce6284268274764 ({a,m,n}),
// __inline_0b0411e1b6314e7d ({m}), __inline_2595a5e183363f1e ({q,m}),
// __inline_179f60b38b2c7f64 ({a, n→{q,m}}), __inline_244e819b04c2fa49
// ({a, n→{m}}) and __inline_df817b794ef788ce ({a} — the DEFECT's one-field
// fragment, which no cell here expects).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 — §"Inline object types": the four
//     raw-key rules "hold in every `Type` position", judged over the entries
//     the body spells between its top-level commas and the text before each
//     entry's own top-level colon. A merged segment silently exempts them.
//   - docs/spec_topics/schema-subset.md:73 — the `__inline_<slug>` hoist over
//     the fields the type declares; it defines no field-dropping emission.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:100 —
//     `theta/parse/duplicate-inline-field-name`; :101
//     `theta/parse/quoted-inline-field-name`; :102
//     `theta/parse/renamed-inline-field-name`; :103
//     `theta/parse/inline-field-name-not-identifier` — the four withheld rows;
//     :19 `theta/parse/binding-case-mismatch` (W13); :59
//     `theta/parse/let-rhs-type-mismatch` (W20); :105
//     `theta/parse/schema-type-not-expression` (W18); :116
//     `theta/parse/missing-discriminator` (W19).
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 —
//     `theta/load/params-type-not-expression`, whose brace exemption is what
//     ADMITS this class (W14 and W17 are the two spellings it still refuses).
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and tests MUST source it from the registry. No
//     message prose is written out below; every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by
//     naming the registry.
//
// THE LEDGER — 22 diagnostic-list cells, seven lowering cells, three validator
// observables and eleven segmentation observables. RED at HEAD, each for the
// merged-segment symptom the report names:
//   - (A) the class at `params:`: the six diagnostic cells W1–W4/W15/W16 are
//     `[]` in BOTH trees (nothing refuses this class under route (a); the
//     repair is in the fragment), so that cell group is GREEN. The LOWERINGS
//     split: W1 and W16 are byte-unmoved FENCES (GREEN), while W2, W3, W4 and
//     W15 are RED — each reds by showing a fragment MISSING the fields the
//     author declared.
//   - (B) the four raw-key pairs: the controls W5/W7/W9/W11 are GREEN fences;
//     the behind-a-stray-token subjects W6/W8/W10/W12 are RED, each reporting
//     `[]` where its own control's registered code is expected
//     (grammar.md:109).
//   - (C) W13, the parser-side agreement cell: EXACTLY ONE line (§Fix
//     constraint 1 — `binding-case-mismatch` must not double under route (a)).
//     GREEN at HEAD and after.
//   - (D) W14, W17, W18, W19 — must-not-move refusal boundaries. GREEN both
//     trees: W14 bounds the class by POSITION within the entry, W17 is bug
//     0232's distinct spelling, W18/W19 are bug 0042's alias-RHS site, which
//     refuses ahead of the segment count §Fix constraint 4 protects.
//   - (P) W20/W21/W22, the `let`-annotation position. W20 GREEN, W21 now
//     ATTRIBUTED to bug 0252 and carrying that report's refusal (see the cell;
//     this report still attributes nothing there), W22 RED.
//   - (E) E1/E2, the AJV cells over the shipped validator's configuration
//     (`new Ajv({ strict: false, allErrors: true })`,
//     src/seams/schema-validator.ts:384). E1 GREEN, E2 RED — the registered
//     contract presently FORBIDS the field the author declared.
//   - (U) the direct unit cells over `splitTopLevelSegments` / `topLevelColon`,
//     the changed arithmetic. The well-formed-nesting fences are GREEN; the
//     depth-0 stray-token cell and the `>`-inside-`{…}` cell are RED.
//   - (L) anti-vacuity: the inventory arithmetic, recomputed from the tables.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check or a `.some()`.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in. Every observable settles inside one
// `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts), one read of the settled document's own frontmatter
// object, one `Ajv.compile` over the bytes that read yields, or one direct call
// to the two exported split functions. An integration tier would add a session
// round-trip to a parse-time value and a live tier would make a fully
// determined value stochastic; neither buys reach for a segmentation claim.
// §Fix's live clause (both routes change a registration outcome — W2 registers
// today) is a SEPARATE obligation and is not discharged by this file.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on the
// environment or conditionally skips. The registry lookup asserts its row's
// presence before the template is used, so a missing row reds by naming the
// registry. The validator cells assert the envelope is PRESENT before compiling
// it, so a withheld frontmatter fails loudly instead of validating nothing, and
// they pin a genuinely-extra property as REJECTED so `additionalProperties`
// cannot be satisfied by a permissive `{}`. Group (L) recomputes the declared
// inventory arithmetic from the tables themselves.

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
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
const MISSING_DISCRIMINATOR = "theta/parse/missing-discriminator";
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
/**
 * Bug 0252's row (code-registry-parse.md:106), which now ATTRIBUTES W21 below.
 * Added for that one cell; every other cell in this file is unmoved.
 */
const ANNOTATION_NOT_EXPR = "theta/parse/annotation-type-not-expression";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}
function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", field]] };
}
function RENAMED(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
/** Bug 0154's lowercase-first pass over `TypeNode.fieldNames` — W13's line. */
const CASE: Exp = { severity: "error", code: BINDING_CASE, fills: [] };
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
function SCHEMANOTEXPR(subject: string): Exp {
  return { severity: "error", code: SCHEMA_NOT_EXPR, fills: [["<X>", subject]] };
}
/**
 * The discriminator row (code-registry-parse.md:116). Only `<X>` is filled: the
 * `<field>` text inside this row's Message is literal prose ("declare
 * explicitly with 'by <field>'"), not a placeholder.
 */
function MISSINGDISC(subject: string): Exp {
  return { severity: "error", code: MISSING_DISCRIMINATOR, fills: [["<X>", subject]] };
}
function PARAMSNOTEXPR(param: string): Exp {
  return { severity: "error", code: PARAMS_NOT_EXPR, fills: [["<param>", param]] };
}
/** Bug 0252's refusal, naming the `let` binder — W21's attributed line. */
function ANNOTATIONNOTEXPR(name: string): Exp {
  return { severity: "error", code: ANNOTATION_NOT_EXPR, fills: [["<name>", name]] };
}

/** One rendered diagnostic, in the shape `diagLines` produces. */
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
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

/**
 * §Reproduction's `params:` fixture: a whole prompt-mode theta whose one
 * `params:` field carries the type under test. The YAML quoting is chosen by
 * the type's own bytes so the SCALAR the reader delivers is always the type
 * verbatim: single-quoted unless the type spells a `'`, in which case
 * double-quoted with `\` and `"` escaped.
 */
function paramsSrc(type: string): string {
  const scalar = type.includes("'")
    ? `"${type.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : `'${type}'`;
  return `---\nmode: prompt\nparams:\n  p: ${scalar}\n---\nlet x = 1\n`;
}

/** A `mode: subagent` theta whose body is `stmt` (the statement on line 4). */
function theta(stmt: string): string {
  return `---\nmode: subagent\n---\n${stmt}\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src));
}

/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(type: string): string {
  return JSON.stringify(parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema ?? null);
}

/** One diagnostic-list cell. */
interface Cell {
  readonly cell: string;
  readonly src: string;
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
    actual[key] = lines(c.src);
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// The six §Reproduction (A) interiors.
const W1_TYPE = "{a: integer, m: integer}";
const W2_TYPE = "{a: integer, b > c, m: integer}";
const W3_TYPE = "{a: integer, b > c, m: integer, n: integer}";
const W4_TYPE = "{b > c, m: integer}";
const W15_TYPE = "{a: integer, n: {q > r, m: integer}}";
const W16_TYPE = "{a: integer, n: {q: integer, m: integer}}";

/** The `params:` envelope around a hoisted `p`, hand-written (schema-subset.md:73). */
function envelope(slug: string, defs: string): string {
  return (
    `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_${slug}"}},` +
    `"required":["p"],"additionalProperties":false,"$defs":{${defs}}}`
  );
}

/** One hand-written `$defs` fragment body, keyed by its own slug. */
function def(slug: string, body: string): string {
  return `"__inline_${slug}":${body}`;
}

const FRAG_AM =
  '{"type":"object","properties":{"a":{"type":"integer"},"m":{"type":"integer"}},' +
  '"required":["a","m"],"additionalProperties":false}';
const FRAG_AMN =
  '{"type":"object","properties":{"a":{"type":"integer"},"m":{"type":"integer"},' +
  '"n":{"type":"integer"}},"required":["a","m","n"],"additionalProperties":false}';
const FRAG_M =
  '{"type":"object","properties":{"m":{"type":"integer"}},"required":["m"],' +
  '"additionalProperties":false}';
const FRAG_QM =
  '{"type":"object","properties":{"q":{"type":"integer"},"m":{"type":"integer"}},' +
  '"required":["q","m"],"additionalProperties":false}';
const FRAG_A_N_TO_QM =
  '{"type":"object","properties":{"a":{"type":"integer"},' +
  '"n":{"$ref":"#/$defs/__inline_2595a5e183363f1e"}},"required":["a","n"],' +
  '"additionalProperties":false}';
const FRAG_A_N_TO_M =
  '{"type":"object","properties":{"a":{"type":"integer"},' +
  '"n":{"$ref":"#/$defs/__inline_0b0411e1b6314e7d"}},"required":["a","n"],' +
  '"additionalProperties":false}';

// ===========================================================================
// (A) THE CLASS AT `params:` — §Reproduction (A). The diagnostic column is `[]`
// in both trees (route (a) refuses nothing here); the LOWERINGS carry the
// claim.
// ===========================================================================

describe("bug 0238 (A) — the class at params:, diagnostics and lowered fragments", () => {
  it("W1–W4, W15, W16: every row loads clean, before and after ", () => {
    // §Fix ROUTE (a) mints no diagnostic code and narrows no registry row, so
    // the six rows of §Reproduction (A) keep their `[]`. The repair is in the
    // FRAGMENT, asserted in the two `it` blocks below. This cell is GREEN at
    // HEAD; it is pinned so a route that started refusing this class — §Fix
    // route (b), which the parent run declined — reds here rather than landing
    // unnoticed beside a green fragment cell.
    expectGroup(
      [
        { cell: "W1 control", src: paramsSrc(W1_TYPE), expected: [] },
        { cell: "W2 the sharp row", src: paramsSrc(W2_TYPE), expected: [] },
        { cell: "W3 two entries behind", src: paramsSrc(W3_TYPE), expected: [] },
        { cell: "W4 stray in the FIRST entry", src: paramsSrc(W4_TYPE), expected: [] },
        { cell: "W15 nested", src: paramsSrc(W15_TYPE), expected: [] },
        { cell: "W16 nested control", src: paramsSrc(W16_TYPE), expected: [] },
      ],
      "route (a) reconciles the SPLIT to `TypeParser.skipMalformedEntry`'s clamp and adds no " +
        "registry row, so none of these six rows gains a diagnostic; a red here is a route " +
        "change (§Fix route (b)) that must be stated at the cell before it lands",
    );
  });

  it("W1 and W16 FENCE: the two well-formed lowerings are byte-unmoved ", () => {
    // §Expected behaviour 5 — nothing else moves. W1 is the byte-neighbour
    // control W2 must become; W16 is the nested control W15 must become in
    // SHAPE (`n` a `$ref`, nothing promoted). Both are GREEN at HEAD, and they
    // are the proof this harness reaches the `params:` lowering at all, so a
    // red on the four cells below cannot be satisfied by withholding every
    // lowering.
    expect(
      { W1: loweredParams(W1_TYPE), W16: loweredParams(W16_TYPE) },
      "these two lowerings are §Expected behaviour 5's no-move bytes; a red here means the " +
        "route moved a well-formed interior's fragment",
    ).toEqual({
      W1: envelope("6ab13cdeb4b48b5a", def("6ab13cdeb4b48b5a", FRAG_AM)),
      // The nested control mints the INNER fragment first, then the outer one
      // that `$ref`s it — the `$defs` insertion order the hoist produces.
      W16: envelope(
        "179f60b38b2c7f64",
        `${def("2595a5e183363f1e", FRAG_QM)},${def("179f60b38b2c7f64", FRAG_A_N_TO_QM)}`,
      ),
    });
  });

  it("W2, W3, W4, W15: every field the author declared reaches the lowered fragment ", () => {
    // §Expected behaviour 2 — a field the author declared is not deleted from
    // the lowered contract in silence; schema-subset.md:73 defines a hoist over
    // the fields the type declares and no field-dropping emission.
    //
    // W2's fragment is BYTE-IDENTICAL to W1's, so both share the slug
    // `__inline_6ab13cdeb4b48b5a` (schema-subset.md:73 — two inline schemas
    // resolve to one `$defs` entry exactly when their fragments are
    // byte-identical). The malformed keyless entry `b > c` contributes no
    // property, exactly as any entry with no top-level colon does: route (a)
    // makes the split see THREE entries where HEAD saw two, and the middle one
    // still spells no key.
    //
    // W4 lowers to `{m}` ALONE — not to the permissive `p: {}` HEAD emits when
    // no segment survives with a key, and not to a fragment inventing a
    // property for `b > c`.
    //
    // W15 keeps its NESTING: the inner `q > r` drops as a keyless entry, the
    // inner `m` stays INSIDE `n`, and nothing is promoted to the outer
    // contract. Its outer fragment is byte-identical to the one
    // `{a: integer, n: {m: integer}}` mints, hence the shared slug.
    expect(
      {
        W2: loweredParams(W2_TYPE),
        W3: loweredParams(W3_TYPE),
        W4: loweredParams(W4_TYPE),
        W15: loweredParams(W15_TYPE),
      },
      "a red here reporting a fragment SHORT of the declared fields is bug 0238: " +
        "`splitTopLevelSegments`' unfloored decrement (src/parser/params.ts) took `depth` to -1 " +
        "on the stray close token, `topLevelColon` returned -1 for the merged remainder, and " +
        "`hoistInlineObjectType` skipped it whole. W2/W3 short by `m` (and `n`), W4 reporting " +
        "the permissive `{\"p\":{}}`, or W15 reporting a promoted `\"m\":{}` beside `\"n\":{}` in " +
        "the OUTER fragment are the four faces of the merge",
    ).toEqual({
      W2: envelope("6ab13cdeb4b48b5a", def("6ab13cdeb4b48b5a", FRAG_AM)),
      W3: envelope("dce6284268274764", def("dce6284268274764", FRAG_AMN)),
      W4: envelope("0b0411e1b6314e7d", def("0b0411e1b6314e7d", FRAG_M)),
      W15: envelope(
        "244e819b04c2fa49",
        `${def("0b0411e1b6314e7d", FRAG_M)},${def("244e819b04c2fa49", FRAG_A_N_TO_M)}`,
      ),
    });
  });
});

// ===========================================================================
// (B) THE FOUR RAW-KEY RULES, each with its control — §Reproduction (B).
// grammar.md:109: all four "hold in every `Type` position".
// ===========================================================================

/** One of §Reproduction (B)'s four rule pairs: a control and its behind-a-stray twin. */
interface RulePair {
  readonly rule: string;
  /** The control row's id (W5, W7, W9, W11). */
  readonly controlId: string;
  /** The behind-a-stray row's id (W6, W8, W10, W12). */
  readonly subjectId: string;
  readonly control: string;
  readonly subject: string;
  readonly expected: Exp;
}

const RULE_PAIRS: readonly RulePair[] = [
  {
    rule: "duplicate",
    controlId: "W5",
    subjectId: "W6",
    control: "{a: integer, a: integer}",
    subject: "{a: integer, b > c, a: integer}",
    expected: DUP("a"),
  },
  {
    rule: "quoted",
    controlId: "W7",
    subjectId: "W8",
    control: "{a: integer, 'q': integer}",
    subject: "{a: integer, b > c, 'q': integer}",
    expected: QUOTED("'q'"),
  },
  {
    rule: "non-identifier",
    controlId: "W9",
    subjectId: "W10",
    control: "{a: integer, é: integer}",
    subject: "{a: integer, b > c, é: integer}",
    expected: NOTIDENT("é"),
  },
  {
    rule: "rename",
    controlId: "W11",
    subjectId: "W12",
    control: '{a: integer, m as "w": integer}',
    subject: '{a: integer, b > c, m as "w": integer}',
    expected: RENAMED("m"),
  },
];

describe("bug 0238 (B) — the four raw-key rules, control and behind-a-stray-close-token", () => {
  it("W5, W7, W9, W11 FENCE: each control draws its own registered code ", () => {
    // GREEN at HEAD and after. These four are the proof `inlineObjectFieldKeys`
    // (src/parser/type-grammar.ts) and the raw-key loop run at all, so the four
    // reds below cannot be satisfied by breaking the controls down to the
    // subjects' silence: §Expected behaviour 3 is reached by ADDING the
    // subject's diagnostic, never by removing the control's.
    expectGroup(
      RULE_PAIRS.map((p) => ({
        cell: `${p.controlId} ${p.rule} control`,
        src: paramsSrc(p.control),
        expected: [p.expected],
      })),
      "code-registry-parse.md:100–:103 are the four raw-key rows; each control must keep its " +
        "own line in every run of this file",
    );
  });

  it("W6, W8, W10, W12: the same entry behind a stray close token draws the same line ", () => {
    // §Expected behaviour 3 — the four raw-key rules hold behind a stray close
    // token. Each subject is its control with `b > c, ` inserted ahead of the
    // offending entry; grammar.md:109 states all four rules hold "in every
    // `Type` position", which a merged segment silently exempts.
    expectGroup(
      RULE_PAIRS.map((p) => ({
        cell: `${p.subjectId} ${p.rule} behind a stray close token`,
        src: paramsSrc(p.subject),
        expected: [p.expected],
      })),
      "a red here reporting `[]` against the control's own line is bug 0238: " +
        "`inlineObjectFieldKeys` (src/parser/type-grammar.ts) reads " +
        "`splitTopLevelSegments` + `topLevelColon` (src/parser/params.ts), the underflowed " +
        "depth merged every entry behind `b > c` into one segment whose `topLevelColon` is -1, " +
        "and the `colon < 0` skip emptied the key list the four rules compare — the four rules " +
        "bugs 0159, 0176, 0160/0229 and 0227 each landed reverting behind one token",
    );
  });

  it("W6, W8, W10, W12 lower nothing, because a refused params: field withholds its frontmatter ", () => {
    // The other half of §Expected behaviour 4 for these four rows: at HEAD each
    // registers and lowers `p` to the defect's one-field `{a}` fragment
    // (`__inline_df817b794ef788ce`). After the fix each draws its control's
    // error-severity diagnostic, the frontmatter gate withholds the whole
    // frontmatter object, and nothing reaches a provider. The controls are
    // asserted beside them: they are already withheld at HEAD, so the pair
    // shows the subjects joining their controls rather than the controls
    // joining the subjects.
    const lowered: Record<string, string> = {};
    for (const p of RULE_PAIRS) {
      lowered[`${p.controlId} ${p.rule} control`] = loweredParams(p.control);
      lowered[`${p.subjectId} ${p.rule} behind a stray close token`] = loweredParams(p.subject);
    }
    expect(
      lowered,
      "a red reporting a `$defs` document for a SUBJECT row is bug 0238 registering a contract " +
        "the four raw-key rules would have refused; a red on a CONTROL row means the route " +
        "started lowering a refused field",
    ).toEqual({
      "W5 duplicate control": "null",
      "W6 duplicate behind a stray close token": "null",
      "W7 quoted control": "null",
      "W8 quoted behind a stray close token": "null",
      "W9 non-identifier control": "null",
      "W10 non-identifier behind a stray close token": "null",
      "W11 rename control": "null",
      "W12 rename behind a stray close token": "null",
    });
  });
});

// ===========================================================================
// (C) THE DISAGREEMENT WITH THE TYPE PARSER — §Reproduction (C), §Fix
// constraint 1. GREEN at HEAD and after.
// ===========================================================================

describe("bug 0238 (C) — the parser-side agreement cell", () => {
  it("W13 keeps EXACTLY ONE line: binding-case-mismatch on Zs, not doubled ", () => {
    // §Fix constraint 1. `theta/parse/binding-case-mismatch` keys on
    // `TypeNode.fieldNames` — the parser's identifier retention — and is gated
    // only on `TypeNode.closingBraceSpelled`, so its presence at HEAD proves
    // both that bug 0231's `TypeParser.skipMalformedEntry` clamp
    // (src/parser/type-grammar.ts) lets `parseObject`'s field loop read PAST
    // the stray token and that the gate the four raw-key rules share is
    // satisfied for this interior: the rules run, and their split answers
    // nothing.
    //
    // Route (a) makes the SPLIT agree with that clamp, which is exactly the
    // hazard this cell fences: once `inlineObjectFieldKeys` also sees `Zs`, a
    // second identifier pass over the recovered key would render a SECOND
    // `binding-case-mismatch` line. Exactly one is specified.
    expectGroup(
      [
        {
          cell: "W13 stray close token ahead of an uppercase field",
          src: paramsSrc("{a: integer, b > c, Zs: string}"),
          expected: [CASE],
        },
        {
          // The byte-neighbour control, so the cell reads as an agreement and
          // not merely as a count: the same interior without the stray token
          // draws the same single line.
          cell: "W13c control, the same interior without the stray token",
          src: paramsSrc("{a: integer, Zs: string}"),
          expected: [CASE],
        },
      ],
      "§Fix constraint 1: W13 keeps exactly one line. A red reporting TWO " +
        "`binding-case-mismatch` lines is route (a) double-reporting the field the clamp and " +
        "the newly-agreeing split now both see; a red reporting `[]` is the parser-side rule " +
        "lost, which would break the agreement §Expected behaviour 1 requires",
    );
  });
});

// ===========================================================================
// (D) THE REFUSAL BOUNDARIES — §Reproduction (D). ALL GREEN now and after.
// ===========================================================================

/** W18/W19's two arms: object schemas with no shared single-literal discriminator. */
const UNION_DECLS = "schema Cat { a: integer }\nschema Dog { b: string }\n";

describe("bug 0238 (D) — the boundaries this report measures and must not move", () => {
  it("W14, W17, W18, W19: four refusals keep their codes and messages ", () => {
    expectGroup(
      [
        {
          // W14 bounds the class by POSITION WITHIN THE ENTRY: a stray close
          // token AFTER a field type that already parsed leaves text the
          // `params:` text stage refuses (code-registry-load.md:19), so that
          // spelling is honest today and stays honest. The class this report
          // claims is the stray token inside an entry that does not spell
          // `Ident ":"` — W2's `b > c` — which the same row's brace exemption
          // admits.
          cell: "W14 stray close token after a well-formed field type",
          src: paramsSrc("{a: integer, b: integer > , m: integer}"),
          expected: [PARAMSNOTEXPR("p")],
        },
        {
          // W17 is bug 0232's spelling
          // (docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md),
          // re-measured: a string literal that never closes, which that
          // report's §Fix narrowed the brace exemption for. Distinct spelling,
          // distinct disposition; this report's subject has balanced quotes.
          cell: "W17 bug 0232's spelling, an unterminated literal",
          src: paramsSrc('{a as "w: integer}'),
          expected: [PARAMSNOTEXPR("p")],
        },
        {
          // W18/W19 are bug 0042's site
          // (docs/bugs/0042-schema-decl-same-line-residue-silent.md): the one
          // consumer reading `splitTopLevelSegments` DIRECTLY for its
          // empty-segment count. The alias RHS refuses this class AHEAD of the
          // count, so no count observable is claimed — but route (a) moves that
          // consumer's input, so §Fix constraint 4 pins both rows.
          cell: "W18 alias RHS carrying a stray close token",
          src: theta(`${UNION_DECLS}schema U = Cat > | Dog`),
          expected: [SCHEMANOTEXPR("U")],
        },
        {
          cell: "W19 alias RHS control",
          src: theta(`${UNION_DECLS}schema U = Cat | Dog`),
          expected: [MISSINGDISC("U")],
        },
      ],
      "§Expected behaviour 5 and §Fix constraint 4: W14 and W17 keep " +
        "`theta/load/params-type-not-expression` (code-registry-load.md:19) and W18/W19 keep " +
        "the alias-RHS rows (code-registry-parse.md:105 and :116). A red at W18 or W19 is " +
        "route (a) having moved bug 0042's count comparison between " +
        "`splitTopLevelSegments` and `splitTopLevel` (src/parser/params.ts); a red at W14 or " +
        "W17 is the brace exemption having been widened, which §Non-goals forbids",
    );
  });
});

// ===========================================================================
// (P) THE `let`-ANNOTATION POSITION — §Reproduction (D) rows W20–W22.
// ===========================================================================

describe("bug 0238 (P) — the same class at a second position", () => {
  it("W20 FENCE and W21: the control refuses, and the subject's row is bug 0252's refusal ", () => {
    expectGroup(
      [
        {
          // W20 — the control. The annotation's structural type is built off
          // the type parse and the RHS gate answers `= 1`. §Expected behaviour
          // 5 pins it unmoved.
          cell: "W20 let annotation, control",
          src: theta("let y: {a: integer, m: integer} = 1"),
          expected: [LETRHS("y", "{ a: integer, m: integer }", "integer")],
        },
        {
          // W21 — THE FENCE IS NOW ATTRIBUTED, not deleted. This report
          // measured the row's missing `let-rhs-type-mismatch` and explicitly
          // claimed no cause for it (§Non-goals, "The `let`-annotation
          // structural type"); route (a) left it `[]`, and the cell was pinned
          // as a fence so "a later route that does restore the RHS gate at this
          // position reds visibly rather than landing unnoticed". That route
          // has arrived, and the fence did its job.
          //
          // BUG 0252
          // (docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md)
          // OWNS THIS ROW. Its cause is not the split at all: the annotation
          // text carries both a brace and an angle bracket, so
          // `annotationSourceIsNotTypeExpression`
          // (src/parser/type-layer-checks.ts) declined to judge it before the
          // refusable-text sink ran, and the `let` annotation was admitted as a
          // deferring nominal. Under 0252's route the interior IS judged — the
          // stray `>` closes nothing inside a brace group the author wrote
          // whole, which derives from no `Type` production
          // (docs/reference/grammar.md:215) — so the annotation is REFUSED at
          // the recogniser and the row draws
          // `theta/parse/annotation-type-not-expression` alone. Nothing about
          // THIS report's claim moved: the RHS gate is still not restored at
          // this position, because there is no longer an annotation to gate
          // against (code-registry-parse.md:106 seeds the binding withheld).
          // The cell is 0252's witness's mirror here, kept so a route that
          // withdraws that refusal reds in both files.
          cell: "W21 let annotation, stray close token — bug 0252's refusal",
          src: theta("let y: {a: integer, b > c, m: integer} = 1"),
          expected: [ANNOTATIONNOTEXPR("y")],
        },
      ],
      "W20 is §Expected behaviour 5's no-move row. W21 is bug 0252's row, not this report's: a " +
        "red reporting `[]` is that report's brace-AND-angle exemption still admitting junk at " +
        "the `let` annotation; a red reporting `theta/parse/let-rhs-type-mismatch` is a route " +
        "that made the interior CONVERTIBLE instead of refusing it (0252 §Fix route (b)), " +
        "which must be stated at both cells before it lands",
    );
  });

  it("W22: a duplicate key behind a stray close token at the let annotation draws its rule ", () => {
    // The raw-key rules are position-independent (grammar.md:109, "in every
    // `Type` position"), so the class §Reproduction (B) measures at `params:`
    // must close at this position too. At HEAD W22 is `[]`; after route (a) the
    // split sees three entries, `a` repeats, and
    // `theta/parse/duplicate-inline-field-name` fires.
    expectGroup(
      [
        {
          cell: "W22 let annotation, duplicate behind a stray close token",
          src: theta("let y: {a: integer, b > c, a: integer} = 1"),
          expected: [DUP("a")],
        },
        {
          // The byte-neighbour control: the same duplicate with no stray token.
          // GREEN at HEAD — the proof the rule reaches this position at all.
          cell: "W22c control, the same duplicate with no stray close token",
          src: theta("let y: {a: integer, a: integer} = 1"),
          expected: [DUP("a")],
        },
      ],
      "a red at W22 reporting `[]` against its control's line is bug 0238 at the `let` " +
        "annotation: the same merged segment, the same emptied key list " +
        "(`inlineObjectFieldKeys`, src/parser/type-grammar.ts, over " +
        "`splitTopLevelSegments` + `topLevelColon`, src/parser/params.ts)",
    );
  });
});

// ===========================================================================
// (E) THE RUNTIME CONSEQUENCE — §Reproduction (E). The lowered envelope
// validated with the configuration `AjvSchemaValidator` uses
// (src/seams/schema-validator.ts:384).
// ===========================================================================

/** The call `{"p": {"a": 1, "m": 2}}` — every field the author declared. */
const DECLARED_CALL = { p: { a: 1, m: 2 } };
/** The same call carrying one field the author did NOT declare. */
const UNDECLARED_CALL = { p: { a: 1, m: 2, zz: 3 } };

/**
 * Validate `DECLARED_CALL` and `UNDECLARED_CALL` against the envelope a
 * `params:` type lowers to. The envelope's presence is asserted first, so a
 * withheld frontmatter fails loudly by naming the type rather than validating
 * nothing.
 */
function validate(type: string): { declared: boolean; undeclared: boolean } {
  const lowered = parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema;
  expect(
    lowered,
    `the ${type} fixture must register and lower a params: envelope for the validator to ` +
      "compile; an absent one means the row was refused, which §Reproduction (E) does not " +
      "measure",
  ).toBeDefined();
  // The shipped configuration, `AjvSchemaValidator`'s own
  // (src/seams/schema-validator.ts:384), constructed per call: no globals,
  // statics or singletons (CLAUDE.md §Code Style).
  const ajv = new Ajv({ strict: false, allErrors: true });
  const compiled = ajv.compile(lowered as object);
  return { declared: compiled(DECLARED_CALL), undeclared: compiled(UNDECLARED_CALL) };
}

describe("bug 0238 (E) — the registered contract must not forbid what it declares", () => {
  it("E1 FENCE: the control envelope accepts the declared call and refuses an undeclared field ", () => {
    // GREEN at HEAD. The `undeclared` half is the anti-vacuity guard: it proves
    // `additionalProperties: false` is still enforced, so E2 below cannot go
    // green by lowering the permissive `{}`.
    expect(
      validate(W1_TYPE),
      "the control's envelope must accept `{\"p\":{\"a\":1,\"m\":2}}` and reject a field the " +
        "author never declared; a red here means the fence itself moved",
    ).toEqual({ declared: true, undeclared: false });
  });

  it("E2: W2's envelope accepts the very call its declaration spells ", () => {
    // §Expected behaviour 4 — a registered contract does not forbid what it
    // declares. At HEAD W2 registers a fragment carrying `a` alone with
    // `additionalProperties: false`, so this call is refused with
    // `additionalProperty: "m"` — against a declaration that spells `m`. The
    // author's only signal is the absence of `m` from a schema they never see.
    expect(
      validate(W2_TYPE),
      "a red reporting `declared: false` is bug 0238's runtime inversion (§Reproduction (E) " +
        "row E2): `hoistInlineObjectType` (src/parser/params.ts) dropped the merged segment " +
        "carrying `m`, and the registered envelope's `additionalProperties: false` now refuses " +
        "the author's own declared field. A red reporting `undeclared: true` instead would be " +
        "the permissive `{}` of W4's HEAD behaviour, which §Expected behaviour 2 also forbids",
    ).toEqual({ declared: true, undeclared: false });
  });
});

// ===========================================================================
// (U) THE CHANGED ARITHMETIC, DIRECT — §Fix "Witness"'s unit cell. Route (a)
// changes `splitTopLevelSegments`' and `topLevelColon`'s cut points, so they
// are asserted at their own seam and not only through their consumers.
// ===========================================================================

const BRACE = "angle-and-brace" as const;

describe("bug 0238 (U) — splitTopLevelSegments / topLevelColon at their own seam", () => {
  it("FENCE: well-formed nesting keeps every cut point it has today ", () => {
    // GREEN at HEAD and after. Route (a) is a rule about a close token with no
    // MATCHING opener; a close token that does have one keeps closing its
    // level, which is what these five observables pin. §Fix constraint 3: the
    // angle-only scans (`classifyGenericArgumentSegments`,
    // `findCutBracketGroupText`, src/parser/params.ts) reproduce this idiom
    // byte for byte, so a change here moves them too.
    expect(
      {
        genericArgument: splitTopLevelSegments("a: array<integer, string>, m: integer", ",", BRACE),
        nestedObject: splitTopLevelSegments("a: {x: integer, y: integer}, m: integer", ",", BRACE),
        angleOnly: splitTopLevelSegments("array<a, b>, m: integer", ",", BRACE),
        colonInsideGeneric: topLevelColon("a: array<integer, string>"),
        colonPlain: topLevelColon("m: integer"),
      },
      "a red here means route (a) stopped a MATCHED close token from closing its level, which " +
        "would shred every generic argument list and nested interior in the corpus",
    ).toEqual({
      genericArgument: ["a: array<integer, string>", "m: integer"],
      nestedObject: ["a: {x: integer, y: integer}", "m: integer"],
      angleOnly: ["array<a, b>", "m: integer"],
      colonInsideGeneric: 1,
      colonPlain: 1,
    });
  });

  it("a depth-0 stray close token is INERT: the separator behind it stays top-level ", () => {
    // THE CHANGED ARITHMETIC, in the exact spelling §Kind 1 measures. At HEAD:
    //   splitTopLevelSegments("a: integer, b > c, m: integer", ",", "angle-and-brace")
    //     → ["a: integer", "b > c, m: integer"]
    //   topLevelColon("b > c, m: integer") → -1
    // After route (a) the `>` opens nothing and closes nothing, so the comma
    // behind it is still at depth 0 and the interior divides into its three
    // author-spelled entries. The middle one still spells no key (-1), exactly
    // as any keyless entry does — which is why W2's fragment carries `a` and
    // `m` and invents nothing for `b > c`.
    //
    // The `}` row is the same rule for the other token `"angle-and-brace"`
    // tracks: a `}` with no open `{` frame is inert too.
    expect(
      {
        split: splitTopLevelSegments("a: integer, b > c, m: integer", ",", BRACE),
        colonOfMerged: topLevelColon("b > c, m: integer"),
        colonOfKeylessEntry: topLevelColon("b > c"),
        colonOfTrailingEntry: topLevelColon("m: integer"),
        strayCloseBrace: splitTopLevelSegments("a}, m: integer", ",", BRACE),
      },
      "a red reporting `split: [\"a: integer\", \"b > c, m: integer\"]` with " +
        "`colonOfMerged: -1` is bug 0238's root cause at its own seam: " +
        "`splitTopLevelSegments`' decrement (src/parser/params.ts) has no floor and no opener " +
        "type, so the stray `>` took `depth` to -1 and the `depth === 0` separator test never " +
        "fired again",
    ).toEqual({
      split: ["a: integer", "b > c", "m: integer"],
      colonOfMerged: 8,
      colonOfKeylessEntry: -1,
      colonOfTrailingEntry: 1,
      strayCloseBrace: ["a}", "m: integer"],
    });
  });

  it("a `>` inside a `{…}` does not cancel that brace — the W15 arithmetic ", () => {
    // WHY THE BARE FLOOR IS INSUFFICIENT, at the seam. `{a: integer, n: {q > r,
    // m: integer}}`'s interior is `a: integer, n: {q > r, m: integer}`. Inside
    // `n`'s braces the stray `>` meets an open `{` frame, so under an
    // UNTYPED decrement it cancels that brace: `depth` returns to 0, the comma
    // before `m` reads as top-level, and the nested object is cut in two — the
    // promotion §Reproduction (A) row W15 measures. `depth` never goes
    // negative, so §Fix (a)'s literal `Math.max(0, depth - 1)` sketch does not
    // engage and this cell stays red under it.
    //
    // Under the TYPED rule the `>` is inert because the innermost open frame is
    // a `{`, the brace stays open across it, and the outer interior divides
    // into its two author-spelled entries. The inner interior then divides on
    // its own comma, dropping `q > r` as keyless and keeping `m` INSIDE `n`.
    expect(
      {
        outer: splitTopLevelSegments("a: integer, n: {q > r, m: integer}", ",", BRACE),
        inner: splitTopLevelSegments("q > r, m: integer", ",", BRACE),
        colonOfN: topLevelColon("n: {q > r, m: integer}"),
      },
      "a red reporting `outer: [\"a: integer\", \"n: {q > r\", \"m: integer}\"]` is bug 0238's " +
        "nested face: the `>` cancelled a REAL `{`, so the nested object was cut apart and its " +
        "second field promoted into the outer contract. This is the cell a bare " +
        "`Math.max(0, depth - 1)` floor does NOT close — the typed opener stack is what closes " +
        "it (§Fix constraint 2 enumerates W15)",
    ).toEqual({
      outer: ["a: integer", "n: {q > r, m: integer}"],
      inner: ["q > r", "m: integer"],
      colonOfN: 1,
    });
  });
});

// ===========================================================================
// (L) ANTI-VACUITY — the inventory arithmetic, recomputed from the tables.
// ===========================================================================

describe("bug 0238 (L) — the inventory this file asserts", () => {
  it("the cell tables carry the declared counts and no duplicate keys ", () => {
    // The four rule pairs are the load-bearing table; the rest of the file's
    // cells are written out literally in their own `it` blocks. This recomputes
    // what can be recomputed and pins the rest by name, so a pair silently
    // dropped from `RULE_PAIRS` reds here rather than shrinking group (B)
    // unnoticed.
    expect(
      RULE_PAIRS.length,
      "grammar.md:109 names FOUR raw-key rules — duplicate, quoted, renamed and " +
        "non-identifier — and §Reproduction (B) pairs each with its control (W5/W6, W7/W8, " +
        "W9/W10, W11/W12); a red here is a rule pair dropped",
    ).toBe(4);
    expect(
      new Set(RULE_PAIRS.map((p) => p.control)).size +
        new Set(RULE_PAIRS.map((p) => p.subject)).size,
      "all eight interiors are distinct, so no cell is silently overwritten inside a group's map",
    ).toBe(8);
    expect(
      new Set(RULE_PAIRS.map((p) => p.expected.code)).size,
      "the four pairs draw four DISTINCT registered codes (code-registry-parse.md:100–:103); a " +
        "red here means two pairs collapsed onto one rule",
    ).toBe(4);
    // Every interior this file measures spells a depth-0 close token, or is the
    // byte-neighbour control of one that does. Recomputed so a fixture edited
    // to drop the stray token — which would turn a red cell green for the wrong
    // reason — reds here instead.
    const subjects = [
      W2_TYPE,
      W3_TYPE,
      W4_TYPE,
      W15_TYPE,
      ...RULE_PAIRS.map((p) => p.subject),
      "{a: integer, b > c, Zs: string}",
      "{a: integer, b > c, m: integer}",
      "{a: integer, b > c, a: integer}",
    ];
    expect(
      subjects.filter((s) => s.includes(">")).length,
      "every SUBJECT interior must still spell the stray close token; a fixture that lost it " +
        "would pass for the wrong reason",
    ).toBe(subjects.length);
    const controls = [W1_TYPE, W16_TYPE, ...RULE_PAIRS.map((p) => p.control)];
    expect(
      controls.filter((c) => c.includes(">")).length,
      "no CONTROL interior spells a close token at all, which is what makes each pair a " +
        "one-token difference",
    ).toBe(0);
  });
});
