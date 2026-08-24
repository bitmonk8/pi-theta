import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import {
  checkLiteralSublanguage,
  type LiteralPosition,
} from "../src/parser/literal-sublanguage";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0165 — a `params:` field whose `=` is followed by nothing records a
// DEFINED but EMPTY default. `splitParamValue` (src/parser/frontmatter.ts:777)
// cuts at the first top-level `=` and trims both halves, so `p: 'string = '`
// yields `defaultSource: ""`; `hasDefault` is keyed on definedness alone
// (:796), the field is dropped from `required` on the same test, in
// `parseParams` (`src/parser/params.ts`), and the block lowers. The one
// checker at the
// position, `checkLiteralSublanguage` (src/parser/literal-sublanguage.ts:54),
// returns `[]` when its parse yields no node (:62), which is what an empty or
// whitespace-only source produces — so nothing refuses the declaration, the
// binder prompt advertises `default=` with no literal after it, the
// invocation-time recovery parses no value, and the body binds `null` for a
// field whose own lowered fragment refuses `null`
// (docs/bugs/0165-empty-params-default-literal-admitted-and-never-bound.md).
//
// THE SETTLED ROUTE IS §Fix (a): `parseParams`'s per-field default loop gains a
// THIRD rule, placed BEHIND the bug-0059 type-half suppression guard
// (`typeRefused`, `src/parser/params.ts`) and AHEAD of the bug-0102
// raw-newline rule and the is-literal call (both in the same loop),
// `continue`ing so no later default rule double-reports the same field. The
// predicate is `defaultSource` empty after trim; the emitted code is the NEW
// registered row `theta/parse/default-without-literal`, and `parseParams`'s
// `hasError` gate then withholds the lowered document.
//
// THIS FILE IS THE WHOLE LOAD-TIME WITNESS for §Fix (d)(6): the four `=`
// spellings crossed with the six YAML deliveries (A), every declared type (B),
// the five over-refusal controls of §Fix (d)(4) (C), the bug-0059 suppression
// of §Fix (d)(2) (D), the cross-field ordering interaction of §Reproduction (j)
// (E), the withholding that discharges the body-scope obligation (F), and the
// deliberate boundary at the fail-open arm (G).
//
// SPEC ANCHORS (the contract, not the shipped code):
//   - docs/spec_topics/grammar.md:14 — the production set is closed over five
//     alternatives (`Literal ::= PrimitiveLit | NamedValueLit | ArrayLit |
//     BareObjectLit | NamedObjectLit`) and no alternative derives the empty
//     string; :20 enumerates `PrimitiveLit`; :9 states the position and the
//     is-literal check the parser performs there.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) — "A
//     param may declare a default with `field: type = literal`", whose form has
//     no arm without a `literal`, and whose admitted-forms list names five
//     shapes, none of them absent text. :58 (§Type side) is the mirror: the
//     TYPE half's refusal set already names "an empty or whitespace-only
//     string", so one half of a `params:` scalar refuses emptiness by name
//     while the other admits it.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:48 —
//     `theta/parse/default-not-literal`, whose *Trigger* predicates on a
//     default RHS that CONTAINS a form outside the sublanguage and whose
//     *Message* interpolates an offending sub-expression. Empty text contains
//     no form and names no sub-expression, which is why §Fix (d)(1) registers a
//     new row rather than widening this one; :50 —
//     `theta/parse/non-trailing-default`, the cross-field ordering rule group E
//     pairs the new refusal with.
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 —
//     `theta/load/params-type-not-expression`, carrying both the type half's
//     "an empty or whitespace-only string" *Trigger* clause (the drafting
//     precedent for the new row's wording) and the third precedence rule group
//     D holds: "a field refused by the text stage draws no default-RHS
//     literal-sublanguage diagnostic … for the same field".
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the
//     registry is closed, so the new row is a spec change landing in the same
//     commit as the code) and :74 (DIAG-4 — the *Message* column is normative,
//     which is why every expected message below is READ from the registry and
//     never restated).
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:123 — the
//     requirement token is "exactly one of the literal tokens `required` or
//     `default=<literal>`"; :142 requires that `<literal>` to be a
//     literal-sublanguage form. `  p (string) default=` is neither token, which
//     is the render-side statement of the same defect group F closes off.
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:11 — the
//     post-default-merge AJV validation hook, the seam the spec puts between a
//     filled default and the body.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every group-A and group-B fixture satisfies at
//     this HEAD) and :25 (the diagnostic-registry carve-out, which admits a
//     code addition within a 1.x minor exactly on the inputs it newly claims —
//     the enumeration §Fix (d)(3) requires IS groups A and B).
//
// MEASURED SIGNATURES AT HEAD (offline, deterministic, provider-free;
// re-derived by scratch probe over `parseDoc` before this file was written,
// then deleted). Every row of groups A and B loads with ZERO diagnostics,
// records `defaultSource: ""`, omits `p` from `required`, and lowers a
// constraining fragment. Group C already carries the verdicts asserted for it.
// Group D already draws its single type-half refusal. Group E's first row draws
// `theta/parse/non-trailing-default` ALONE and its second row draws nothing.
// Group G's two calls already return `[]`.
//
// WHAT IS RED HERE AND WHY: groups A, B, E and F — the empty default is
// admitted at every spelling, delivery and declared type, and the registry
// carries no row to name the refusal. GREEN AT HEAD AND REQUIRED TO STAY GREEN:
// group C (the over-refusal fence), group D (the bug-0059 suppression) and
// group G (the fail-open arm's boundary pin).
//
// TIER: unit, offline, deterministic, provider-free. The whole contract settles
// inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39 — the shipped front end wrapped in the standard
// inert deps double) plus one read of the committed registry corpus and two
// direct calls into the shipped literal-sublanguage checker. An integration
// tier would re-drive discovery to reach the same diagnostics and witness
// nothing further; a live tier adds a binder model, and a load-time refusal is
// upstream of every model interaction — a refused theta does not register at
// all, so a live drive could not distinguish this refusal from any other load
// error, and the `null` bind group F closes off is unreachable once the theta
// stops registering.
//
// NO SILENT SKIPPING: `registryMessageOf` FAILS LOUDLY naming the absent row
// rather than falling back to a copied literal, and every cell's code/count
// assertion runs BEFORE its message oracle, so the red at HEAD names the
// missing refusal first and the missing registry row second.

// ===========================================================================
// The codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** The row §Fix (a) mints for a `=` followed by no literal. */
const CODE = "theta/parse/default-without-literal";

/** bug 0059's type-half refusal, whose suppression group D holds intact. */
const TYPE_TEXT_CODE = "theta/load/params-type-not-expression";

/** The cross-field ordering rule group E pairs the new refusal with. */
const ORDERING_CODE = "theta/parse/non-trailing-default";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
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
 * A registry row's normative *Message* (DIAG-4), read rather than restated.
 *
 * The absent row is itself a correct-reason red: DIAG-2 closes the registry, so
 * the new code's row lands in the same commit as the emitter. A copied literal
 * here would assert this file's own prose instead of the contract, and an early
 * return would report success while verifying nothing.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `the registry must carry a ${code} row; DIAG-2 (diagnostic-shape.md:72) lands it in docs/spec_topics/diagnostics/code-registry-parse.md in the same commit as the code, and DIAG-4 (:74) makes that row's Message column the only admissible source for the expected string`,
  ).toBeDefined();
  return template as string;
}

/** The refusal message for one field. The replacement is a function so a `$` in a name cannot read as a substitution pattern. */
function emptyDefaultMessage(field: string): string {
  return registryMessageOf(CODE).replace("<field>", () => field);
}

/** bug 0059's type-half refusal message for one field. */
function typeTextMessage(param: string): string {
  return registryMessageOf(TYPE_TEXT_CODE).replace("<param>", () => param);
}

/** The ordering rule's message for the first offending non-defaulted field. */
function orderingMessage(field: string): string {
  return registryMessageOf(ORDERING_CODE).replace("<field>", () => field);
}

// ===========================================================================
// Fixtures and the loud readers.
// ===========================================================================

/**
 * The declarations every fixture carries. `Sev` is the named enum the
 * declared-type table resolves through; `z` keeps the body non-empty.
 */
const BODY = ["enum Sev { A, B }", "let z = 1"].join("\n");

/** A `mode: prompt` theta whose `params:` block is `paramsBlock` verbatim. */
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}\n`;
}

/** Parse one `params:` block through the shipped front end. */
function paramsDoc(paramsBlock: string): ThetaDocument {
  return parseDoc(src(paramsBlock), "bug0165.theta");
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The lowered `params:` document, or `undefined` when the error gate withheld it. */
function loweredSchemaOf(doc: ThetaDocument): unknown {
  return doc.frontmatter?.params?.loweredSchema;
}

/** The lowered document's `required` list, or `undefined` when the document is withheld. */
function requiredOf(doc: ThetaDocument): unknown {
  return (loweredSchemaOf(doc) as { readonly required?: readonly string[] } | undefined)
    ?.required;
}

/** The recorded default half of one field, or `undefined` when no default was recorded. */
function recordedDefault(doc: ThetaDocument, wireName: string): string | undefined {
  return doc.frontmatter?.params?.fields.find((f) => f.wireName === wireName)?.defaultSource;
}

/** Whether one field recorded a default at all — the `hasDefault` bit keyed on definedness. */
function recordedHasDefault(doc: ThetaDocument, wireName: string): boolean | undefined {
  return doc.frontmatter?.params?.fields.find((f) => f.wireName === wireName)?.hasDefault;
}

/**
 * The whole refusal contract for one field whose `=` carries no literal:
 * EXACTLY ONE diagnostic, the new code at error severity carrying the
 * registry's message for that field, and the lowered document withheld.
 *
 * The count/code assertion runs FIRST so the red at HEAD names the symptom bug
 * 0165 reports — a declaration the sublanguage does not derive, admitted in
 * silence — rather than the absent registry row. The whole-list assertion then
 * pins code AND message together, so a fix that emits the right code with a
 * message the registry does not carry cannot pass.
 *
 * The lowered-document expectation is the reachability link: `parseParams`'s
 * `hasError` gate (`src/parser/params.ts`) returns without a `loweredSchema`
 * as soon as any diagnostic carries error severity, and `hasLoadParseError`
 * (src/extension/production-composition.ts:2070) drops the theta on the same
 * predicate over the `theta/parse/` namespace.
 */
function expectEmptyDefaultRefused(label: string, doc: ThetaDocument, field: string): void {
  expect(
    diagCodes(doc),
    `${label}: grammar.md:14 closes \`Literal\` over five alternatives and derives no empty one, and frontmatter-fields-a.md:60 writes the form as \`field: type = literal\` with no arm lacking a \`literal\` — so this declaration is unspellable at the position and draws the new refusal exactly once. Rendered: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${CODE}`]);
  expect(
    diagLines(doc),
    `${label}: DIAG-4 — the rendered message is the registry row's template with \`<field>\` rendered as the field's own name, so an author reading it learns which declaration to repair`,
  ).toEqual([`error ${CODE}: ${emptyDefaultMessage(field)}`]);
  expect(
    loweredSchemaOf(doc),
    `${label}: §Fix (a)'s blast radius is the loop and the gate — a refused declaration produces no lowered document, so the render token, the envelope, the merge and the child intake never see the field`,
  ).toBeUndefined();
}

// ===========================================================================
// (A) THE FOUR `=` SPELLINGS × THE SIX YAML DELIVERIES.
//
// Obligation: §Fix (d)(3) requires the GOV-15 carve-out's newly-claimed input
// set to be enumerated rather than discovered, and §Fix (d)(6) requires it as
// refusal cells carrying the emitted code and count. `splitParamValue` trims
// both halves, so all four spellings collapse to the same `defaultSource: ""`
// whatever the YAML scalar delivered — which is exactly why the enumeration is
// needed: there is no delivery an author can avoid and no narrower guard that
// would catch only a typo.
//
// RED at HEAD: every row loads with zero diagnostics and registers.
// ===========================================================================

/** Each row as `[label, params block]`. */
type Cell = readonly [string, string];

/** Single-quoted delivery — carries all four spellings verbatim. */
const SINGLE_QUOTED: readonly Cell[] = [
  ["a1 (single-quoted, `=` + one space)", "  p: 'string = '"],
  ["a2 (single-quoted, `=` + nothing)", "  p: 'string ='"],
  ["a3 (single-quoted, `=` + three spaces)", "  p: 'string =   '"],
  ["a4 (single-quoted, tight `=`)", "  p: 'string='"],
];

/** Double-quoted delivery — carries all four spellings verbatim. */
const DOUBLE_QUOTED: readonly Cell[] = [
  ["a5 (double-quoted, `=` + one space)", '  p: "string = "'],
  ["a6 (double-quoted, `=` + nothing)", '  p: "string ="'],
  ["a7 (double-quoted, `=` + three spaces)", '  p: "string =   "'],
  ["a8 (double-quoted, tight `=`)", '  p: "string="'],
];

/**
 * Unquoted plain scalar — TWO of the four spellings, not four. YAML strips
 * trailing white space from a plain scalar, so `p: string = ` and
 * `p: string =   ` both deliver the bytes `string =` and are not distinct
 * inputs to `splitParamValue`. The one-space and three-space spellings are
 * therefore unspellable through this delivery, and are asserted under the four
 * deliveries that do carry them rather than pinned here as rows that do not
 * exist.
 */
const UNQUOTED_PLAIN: readonly Cell[] = [
  ["a9 (unquoted plain, `=` + nothing)", "  p: string ="],
  ["a10 (unquoted plain, tight `=`)", "  p: string="],
];

/** Block-literal delivery — preserves the line's trailing spaces and appends a line break. */
const BLOCK_LITERAL: readonly Cell[] = [
  ["a11 (block literal `|`, `=` + one space)", "  p: |\n    string = "],
  ["a12 (block literal `|`, `=` + nothing)", "  p: |\n    string ="],
  ["a13 (block literal `|`, `=` + three spaces)", "  p: |\n    string =   "],
  ["a14 (block literal `|`, tight `=`)", "  p: |\n    string="],
];

/** Block-folded delivery — same recovered bytes as the literal form for a one-line scalar. */
const BLOCK_FOLDED: readonly Cell[] = [
  ["a15 (block folded `>`, `=` + one space)", "  p: >\n    string = "],
  ["a16 (block folded `>`, `=` + nothing)", "  p: >\n    string ="],
  ["a17 (block folded `>`, `=` + three spaces)", "  p: >\n    string =   "],
  ["a18 (block folded `>`, tight `=`)", "  p: >\n    string="],
];

/**
 * Tab-only default — the double-quoted `\t` escape, written here as the two
 * characters YAML decodes. The space-count spellings are a property of the
 * space character and ride the four deliveries above; what this delivery adds
 * is that a NON-space white-space character trims to the same empty default, so
 * the predicate cannot be written against the space character alone.
 */
const TAB_ONLY: readonly Cell[] = [
  ["a19 (tab-only default, `=` + tab)", '  p: "string =\\t"'],
  ["a20 (tab-only default, tight `=` + tab)", '  p: "string=\\t"'],
];

const SPELLINGS_BY_DELIVERY: ReadonlyArray<readonly [string, readonly Cell[]]> = [
  ["single-quoted", SINGLE_QUOTED],
  ["double-quoted", DOUBLE_QUOTED],
  ["unquoted plain", UNQUOTED_PLAIN],
  ["block literal `|`", BLOCK_LITERAL],
  ["block folded `>`", BLOCK_FOLDED],
  ["tab-only default", TAB_ONLY],
];

for (const [delivery, cells] of SPELLINGS_BY_DELIVERY) {
  describe(`bug 0165 (A) — the empty default is refused through the ${delivery} delivery`, () => {
    for (const [label, paramsBlock] of cells) {
      it(`RED (${label}): the declaration draws the refusal and lowers nothing`, () => {
        expectEmptyDefaultRefused(label, paramsDoc(paramsBlock), "p");
      });
    }
  });
}

// ===========================================================================
// (B) EVERY DECLARED TYPE.
//
// Obligation: §Fix (d)(6) requires the seven declared types of §Reproduction
// (c). The refusal predicate reads the DEFAULT half alone, so the declared half
// must not change the verdict — including for the two halves that answer
// `"unknown"` to every static relation (the named enum and the nullable union)
// and the one whose own lowered fragment admits `null` and would therefore
// never be caught downstream.
//
// RED at HEAD: every row loads with zero diagnostics and lowers a constraining
// fragment.
// ===========================================================================

const DECLARED_TYPES: readonly Cell[] = [
  ["b1 (`string`)", "  p: 'string = '"],
  ["b2 (`integer`)", "  p: 'integer = '"],
  ["b3 (`array<string>`)", "  p: 'array<string> = '"],
  ["b4 (string-literal union)", "  p: '\"x\" | \"y\" = '"],
  ["b5 (`boolean`)", "  p: 'boolean = '"],
  // The one declared type whose lowered fragment ADMITS `null`, so the runtime
  // AJV safety net cannot distinguish the unbound field from a deliberate
  // `null` — the load-time refusal is the only place this row is decidable.
  ["b6 (`string | null`)", "  p: 'string | null = '"],
  ["b7 (named enum `Sev`)", "  p: 'Sev = '"],
];

describe("bug 0165 (B) — the declared half does not change the verdict", () => {
  for (const [label, paramsBlock] of DECLARED_TYPES) {
    it(`RED (${label}): the empty default is refused whatever the field declares`, () => {
      expectEmptyDefaultRefused(label, paramsDoc(paramsBlock), "p");
    });
  }
});

// ===========================================================================
// (C) THE FIVE SILENT CONTROLS — THE OVER-REFUSAL FENCE.
//
// Obligation: §Fix (d)(4). Each of these loads cleanly at HEAD and must keep
// that verdict, so the predicate has to read the RECORDED default rather than
// the presence of an `=` or the emptiness of the VALUE the default denotes. The
// recorded `defaultSource` is asserted beside the silence: `""` and `[]` are
// literals that spell an empty value, and a fence that only asserted the
// absence of a diagnostic would pass against a rule that erased the record.
//
// GREEN at HEAD and required to stay green.
// ===========================================================================

/** Each row as `[label, params block, recorded default, lowered `required`]`. */
const CONTROLS: ReadonlyArray<readonly [string, string, string | undefined, readonly string[]]> = [
  // The conformant spelling one keystroke from the subject row: an explicit
  // empty-string literal, which binder-bypass-and-envelope.md:142 renders
  // `default=""`.
  ["c1 (explicit empty-string literal)", "  p: 'string = \"\"'", '""', []],
  // The empty-array round-trip binder-bypass-and-envelope.md:142 names by name.
  ["c2 (explicit empty-array literal)", "  p: 'array<string> = []'", "[]", []],
  ["c3 (an ordinary string literal)", "  p: 'string = \"ok\"'", '"ok"', []],
  // No `=` at all: the field is REQUIRED, which is the disposition §Fix (c) was
  // rejected for silently manufacturing out of a bare trailing `=`.
  ["c4 (no default declared)", "  p: 'string'", undefined, ["p"]],
  // The shape of the one committed default in the corpus
  // (tests/live/acceptance/fixtures/acc-params-binder.theta).
  ["c5 (a numeric literal)", "  p: 'number = 3'", "3", []],
];

describe("bug 0165 (C) — the conformant declarations keep loading", () => {
  for (const [label, paramsBlock, expectedDefault, expectedRequired] of CONTROLS) {
    it(`GREEN (${label}): loads silently and keeps its recorded default`, () => {
      const doc = paramsDoc(paramsBlock);
      expect(
        diagLines(doc),
        `${label}: a control that reds here is over-refusal — the new predicate reads the recorded default half, not the presence of an \`=\` and not the emptiness of the value that half denotes`,
      ).toEqual([]);
      expect(
        recordedDefault(doc, "p"),
        `${label}: the fence witnesses the RECORD, not merely the silence — a rule that erased the recorded default would leave the diagnostic list empty and still break the binder's \`default=<literal>\` token`,
      ).toBe(expectedDefault);
      expect(
        recordedHasDefault(doc, "p"),
        `${label}: \`hasDefault\` (src/parser/frontmatter.ts:942) is keyed on the recorded default's definedness and drives both the render token and the \`required\` decision`,
      ).toBe(expectedDefault !== undefined);
      expect(
        requiredOf(doc),
        `${label}: the lowered document survives, and \`required\` still follows the recorded default's definedness, in \`parseParams\` (src/parser/params.ts)`,
      ).toEqual(expectedRequired);
    });
  }
});

// ===========================================================================
// (D) THE BUG-0059 SUPPRESSION STAYS SUPPRESSING.
//
// Obligation: §Fix (d)(2), and code-registry-load.md:19's third precedence rule
// — "a field refused by the text stage draws no default-RHS
// literal-sublanguage diagnostic … for the same field". Both rows carry a junk
// TYPE half; the first also carries an empty default, so it satisfies the new
// rule's predicate as well.
//
// THESE TWO CELLS RED IF THE NEW RULE IS PLACED AHEAD OF THE GUARD
// (`typeRefused`, src/parser/params.ts) RATHER THAN BEHIND IT — that placement is what they
// exist to catch. A rule in front of the guard emits on `d1` in addition to the
// type-half refusal, turning one report into two for one mistake, and the same
// count-of-one contract is already pinned for `d2` by cell f1 of
// tests/params-scalar-nontype-text-refusal.test.ts:1075.
//
// GREEN at HEAD and required to stay green.
// ===========================================================================

const SUPPRESSED: readonly Cell[] = [
  ["d1 (junk type half AND an empty default)", "  p: 'lol wut = '"],
  ["d2 (junk on both halves)", "  p: 'pick one = or two'"],
];

describe("bug 0165 (D) — a type-refused field draws no default-side diagnostic", () => {
  for (const [label, paramsBlock] of SUPPRESSED) {
    it(`GREEN (${label}): the type-half refusal survives alone, at a count of one`, () => {
      const doc = paramsDoc(paramsBlock);
      expect(
        diagCodes(doc),
        `${label}: the guard \`typeRefused\` (src/parser/params.ts) skips every default-side rule for a field whose type half was refused, and the new rule sits behind it — two diagnostics here means the rule was placed in front. Rendered: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([`error ${TYPE_TEXT_CODE}`]);
      expect(
        diagLines(doc),
        `${label}: the surviving report is the type half's own, whose registered *Trigger* already claims "an empty or whitespace-only string" (code-registry-load.md:19)`,
      ).toEqual([`error ${TYPE_TEXT_CODE}: ${typeTextMessage("p")}`]);
    });
  }
});

// ===========================================================================
// (E) THE CROSS-FIELD ORDERING INTERACTION.
//
// Obligation: §Reproduction (j) under the new refusal. The ordering rule
// (`seenDefault`'s loop in `parseParams`, src/parser/params.ts) reads
// `field.defaultSource !== undefined` across every field and is not gated on
// any field's own default-side verdict, so it keeps firing: the empty default
// stays authoritative enough to force
// declaration order while binding nothing. The two rules therefore COMPOSE
// rather than replace one another, and the first row is the cell that says so.
//
// The list order is `(file, line, col)`, imposed by `assembleDiagnostics`
// (src/diagnostics/diagnostic.ts:132), so `p` on the earlier line reports
// first regardless of which loop pushed it.
//
// RED at HEAD: the first row draws the ordering rule ALONE and the second draws
// nothing at all.
// ===========================================================================

describe("bug 0165 (E) — the refusal composes with the ordering rule", () => {
  it("RED (e1): an empty default followed by a non-defaulted field draws BOTH rules", () => {
    const doc = paramsDoc("  p: 'string = '\n  q: string");
    expect(
      diagCodes(doc),
      `e1: the new rule refuses \`p\`'s own declaration and the ordering rule still refuses \`q\`'s position — neither subsumes the other, and an implementation that suppressed the ordering rule for a refused field would hide a second, independent repair. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`, `error ${ORDERING_CODE}`]);
    expect(
      diagLines(doc),
      "e1: each rule names its own field — the refusal names `p`, the ordering rule names the FIRST offending non-defaulted field `q`",
    ).toEqual([
      `error ${CODE}: ${emptyDefaultMessage("p")}`,
      `error ${ORDERING_CODE}: ${orderingMessage("q")}`,
    ]);
    expect(
      loweredSchemaOf(doc),
      "e1: two error-severity diagnostics withhold the lowered document exactly as one does",
    ).toBeUndefined();
  });

  it("RED (e2): two empty defaults draw one refusal PER FIELD", () => {
    const doc = paramsDoc("  p: 'string = '\n  q: 'integer = '");
    expect(
      diagCodes(doc),
      `e2: the rule sits inside the per-field loop, so each offending declaration is refused on its own and fixing one does not silently hide the other. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`, `error ${CODE}`]);
    expect(
      diagLines(doc),
      "e2: the two messages differ only in the field they name, which is what makes a two-field repair actionable from the diagnostics alone",
    ).toEqual([
      `error ${CODE}: ${emptyDefaultMessage("p")}`,
      `error ${CODE}: ${emptyDefaultMessage("q")}`,
    ]);
    expect(
      loweredSchemaOf(doc),
      "e2: with both fields defaulted the ordering rule has nothing to report, so the withholding rests on the new refusal alone",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (F) THE WITHHELD DOCUMENT DISCHARGES THE BODY-SCOPE OBLIGATION.
//
// §Fix (d)(6) asks for a body-scope read "for whichever rows a bounded route
// leaves loading". Route (a) leaves NO row loading: the refusal is
// error-severity and sits in the `theta/parse/` namespace, so `hasLoadParseError`
// (src/extension/production-composition.ts:2070) drops the theta before any
// registration, and `parseParams`'s `hasError` gate (src/parser/params.ts)
// returns without a `loweredSchema`. There is then no lowered fragment for the
// binder render to read a `default=` token off, no schema for
// `#mergeDeclaredDefaults` to compile, and no args entry for `paramBindingsFrom`
// to project — the `null` bind that makes this report S1 becomes unreachable BY
// CONSTRUCTION rather than by assertion, which is why this cell pins the two
// gate predicates instead of driving the binder.
//
// RED at HEAD: the parse carries no error and the lowered document is present.
// ===========================================================================

describe("bug 0165 (F) — the refusal removes the record the null bind came from", () => {
  it("RED (f1): the drop-gate predicate holds and the lowered document is withheld", () => {
    const doc = paramsDoc("  p: 'string = '");
    expect(
      doc.diagnostics.filter(
        (d) => d.severity === "error" && d.code.startsWith("theta/parse/"),
      ).length,
      `f1: the drop gate reads error severity in the \`theta/load/\` or \`theta/parse/\` namespace; a warning-severity row would leave the theta registered with the same empty default. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
    expect(
      loweredSchemaOf(doc),
      "f1: with no lowered document there is no `params:` schema to compile, so defaulting-system-note-echo.md:11's post-default-merge hook has nothing to run against and body scope has no field to read as `null`",
    ).toBeUndefined();
    expect(
      recordedDefault(doc, "p"),
      "f1: the field record itself does not survive the refusal, so binderPromptParamField cannot mint the `default=` requirement token that binder-bypass-and-envelope.md:123 forbids",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (G) THE DELIBERATE BOUNDARY AT THE FAIL-OPEN ARM.
//
// Route (a) refuses at the DECLARATION-FORM position (`parseParams`), not
// inside the is-literal checker, so `checkLiteralSublanguage`'s
// `node === undefined` early return (src/parser/literal-sublanguage.ts:62)
// stays deliberately silent: §Fix (b) — closing that arm instead — was not the
// route taken, and making "the default RHS parses to a literal" a total
// predicate at the position is a stronger claim than this report measures.
// `LiteralPosition` is the single value `"default"` (:40) and the function has
// one production caller, inside `parseParams` (src/parser/params.ts), so
// nothing else depends on the arm either way.
//
// THIS CELL IS GREEN AT HEAD AND MUST STAY GREEN. It is not a red witness: it
// converts a branch no committed call reaches into a documented boundary, so a
// later route that closes the arm has to move this pin knowingly rather than
// discover the change through an unrelated red.
// ===========================================================================

describe("bug 0165 (G) — the is-literal checker keeps its no-node silence", () => {
  const span: SourceRange = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
  const site = { file: "bug0165.theta", range: span };
  const position: LiteralPosition = "default";

  it("GREEN (g1): an empty source yields no diagnostic", () => {
    expect(
      checkLiteralSublanguage("", position, site),
      "g1: the checker judges a parsed node, and an empty source produces none — route (a) decides this input one seam earlier, at the declaration form, so closing this arm as well would double-report the same field",
    ).toEqual([]);
  });

  it("GREEN (g2): a whitespace-only source yields no diagnostic", () => {
    expect(
      checkLiteralSublanguage("   ", position, site),
      "g2: whitespace-only text reaches the same no-node arm; `splitParamValue` trims before `parseParams` reads it, so this spelling never arrives at the production caller and the arm's silence is unobservable from the load path",
    ).toEqual([]);
  });
});
