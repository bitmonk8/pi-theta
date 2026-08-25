import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0059 — a `params:` right-hand side that is a YAML SCALAR carrying text no
// `Type` production spells is recorded verbatim as the field's declared type,
// falls past every arm of `lowerTypeExpr` to its trailing catch-all
// (src/parser/params.ts — the `lowerCtx.unspellable` push and the permissive
// `return {}`), lowers the permissive `{}`, and draws no
// diagnostic at any severity — so the theta registers with a param that
// validates nothing
// (docs/bugs/0059-params-scalar-nontype-text-recorded-and-permissive.md).
//
// THE GAP IS BETWEEN TWO CORRECT DECISIONS. `paramValueCanCarryType`
// (src/parser/frontmatter.ts:483–485) judges the YAML value NODE and admits
// every scalar whatever bytes it carries; the lowering catch-all reads text but
// is licensed to be silent for a different class — a `LiteralType`, and a
// brace-rooted arm nested in a generic argument or a union arm. Text outside
// the grammar inherits that silence without belonging to either class. So
// `p: "a: Tirage"` loads, and so do prose, punctuation, `???`, `# comment`, a
// quoted `[a, b]`, the empty and whitespace-only spellings, and the same bytes
// written under `p: |` or `p: >`.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:90–:102 — the closed `Type` production set
//     (`PrimitiveType` | `NamedType` | `GenericType` | `ObjectType` | union |
//     `LiteralType`); :105 names "`params:` field types" among the bare-`Type`
//     positions and adds that "the grammar is otherwise identical in every
//     position". None of the texts group (a) refuses is spellable by any
//     production.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every
//     type-annotation position, `params:` named.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 — the `params:`
//     right-hand side is "a type expression parsed by the theta type grammar".
//   - docs/spec_topics/schema-subset.md:74–:81 — lowering step 3's per-type-form
//     emission table, which defines no `{}` emission for any admitted form, so
//     the permissive lowering matches no rule; :73 and :98 are the
//     `__inline_<slug>` hoist and the canonical-form hash the group (d) oracles
//     follow.
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 — the registered
//     row `theta/load/params-type-not-expression`, whose *Sev* `E` is what
//     un-registers the theta; DIAG-2 (diagnostic-shape.md:72) closes the
//     registry, so no second code is available for this input, and DIAG-4
//     (:74) makes the *Message* column normative.
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15) and
//     :25 (the diagnostic-registry carve-out) — files that load today may stop
//     loading only within the carve-out, and group (h) is the measured blast
//     radius over the committed corpus.
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix, ten constraints; RED now, GREEN
// after). The judgement is recorded where the text falls through and the
// REFUSAL is made by the caller, because `lowerTypeExpr` is shared by all four
// type positions:
//   1. Text no `Type` production spells, arriving at `params:` through ANY
//      scalar spelling, draws EXACTLY ONE error-severity
//      `theta/load/params-type-not-expression` at the field, and the lowered
//      `params:` document is withheld (constraint 4, group (a)). THE JUDGED
//      UNIT IS THE BRACE-FREE FRAGMENT, not the whole right-hand side: the
//      lowering hands the judgement a fragment at the type's own top level,
//      inside a union arm at any depth, inside a GENERIC TYPE ARGUMENT, and
//      inside a hoisted inline object's field type at any depth — the hoist
//      re-enters `lowerParamsFieldType` per field, so `{a: ???}` is refused
//      for its field's fragment while the braces around it are the hoist's.
//      Group (a)'s a21–a25 pin the three reaches past the top level.
//   2. A field whose value NODE is already refused keeps EXACTLY ONE
//      diagnostic — the frontmatter-seam one — and stays retained, so no
//      cascade fires at the `system:` interpolation seam (constraint 1,
//      group (b)).
//   3. The `schema`-body field, the alias right-hand side and the `@<T>`
//      annotation thread no sink, so their lowered documents AND their
//      diagnostic sequences are byte-identical across the change (constraint 2,
//      group (c)).
//   4. Grammar-admitted traffic that legitimately reaches the same catch-all
//      keeps its bytes: a brace-rooted arm nested in a generic argument or a
//      union arm, a mixed-union literal arm, and the all-literal union arms of
//      `array<"x" | "y">` (constraint 3, group (d)). SIX OF THOSE ROWS' BYTES
//      LATER MOVED UNDER TWO LATER REPORTS, and in both cases what moved is the
//      MECHANISM the row's own comment described — a recursion that re-enters
//      `lowerTypeExpr` and reaches no literal rule — never constraint 3's claim:
//        • bug 0184 §Fix routes the union-ARM recursion through the literal
//          sublanguage (gated to the MIXED arm set), so the mixed-union literal
//          arm lowers schema-subset.md:79's `{ "const": <value> }` at rows d7
//          and d8.
//        • bug 0164 §Fix (v0.123.0) routes the generic-ARGUMENT recursion
//          through the same sublanguage, so rows d1 / d2 / d3 lower their
//          argument's step-3 emission inside :77's `items` and d3's mint moves
//          with those bytes.
//      Constraint 3's own claim — that this traffic stays SILENT — is untouched
//      and is what all six rows still assert; their `.toEqual([])` diagnostic
//      assertions are the point of the tripwire and stay green.
//
// THE TWO AUTHORIZED BOUNDARY SENTENCES, quoted rather than re-derived:
//   - Widened brace decline — "the brace frame (`lowerParamsFieldType`'s
//     intercept, `hoistInlineObjectType`, bugs 0035/0045/0052) owns every text
//     carrying a brace; this refusal owns brace-free text." The decline is the
//     FRAGMENT's, not its enclosure's, because a fragment is what the
//     judgement holds. Consequence — the deliberate under-refusal, pinned in
//     group (d): junk that reaches the judgement WHOLE with a brace in it
//     stays silent, whether it is the whole right-hand side (`{junk}`, the
//     unterminated `{a: string`) or a brace-carrying fragment reached through
//     `lowerTypeExpr` (`string | {a: ???}`, `array<{a: ???}>`). Junk INSIDE a
//     hoisted field's brace-free type does not: the hoist hands that fragment
//     over with no brace on it (`{a: ???}`, group (a) a22).
//   - Guard-extension precedence — a field's type-half refusal is reported as
//     such, "not by whatever the lowering makes of its recovered bytes" (the
//     ordering comment at src/parser/frontmatter.ts:918–921).
//
// PROBED CURRENT SIGNATURES (HEAD 948b7814 / 0.85.0, offline, deterministic).
// THE BUG DOC'S §Reproduction WAS MEASURED AT 0.51.0 AND FOUR OF ITS ROWS HAVE
// SINCE DRIFTED; this file pins HEAD, not the doc:
//   - `p: 'array<'` is NOT silent. It draws one
//     `theta/parse/generic-arity-mismatch` (the doc's constraint 4 lists it
//     among the silent spellings), so it is a guard-extension row (group (g)),
//     not a refusal row.
//   - the value-less key `p:` lowers `{"const":null}`, not the doc's
//     `{"type":"null"}` (bug 0056 §Fix constraint 2 adjudicated `null` as a
//     `LiteralType` at every position).
//   - `p: '{}'` draws one `theta/parse/empty-schema-body` and `p: 'void'` one
//     `theta/parse/void-in-non-return-position`; both were silent-permissive
//     when the doc was written.
//   - `p: true` lowers `{"const":true}` rather than drawing an unresolved-name
//     refusal (bug 0044's fix), and `p: '"hello"'` / `p: 42` / `p: '"x" | "y"'`
//     carry their `LiteralType` and enum emissions (bug 0056's fix), so the
//     doc's "bug 0056's class, on the same catch-all" rows are closed.
//
// WHAT IS RED HERE: group (a) — every refusal cell, because each junk text
// loads with ZERO diagnostics and lowers `{}` — and group (f)'s
// `pick one = or two` cell, whose single diagnostic is today the default-side
// `theta/parse/default-not-literal` rather than the type-half refusal.
// EVERYTHING ELSE IS GREEN AT HEAD AND MUST STAY GREEN: groups (b), (c), (d),
// (e), (g) and (h) are the over-refusal tripwires, and every cell in them keeps
// its SILENCE. Byte invariance is the narrower claim, and group (d) carries one
// carve-out from it: d5 (`string | {a: string}`) is a bug-0097-MOVED row — its
// brace arm hoists under `__inline_<slug>` rather than reaching
// `lowerTypeExpr`'s catch-all — so it is asserted on its own, outside (d)'s
// byte-invariance loop, under bug 0097 §Fix's authority. A SECOND carve-out came
// later: d7 (`"x" | integer`) and d8 (`string | "x"`) are bug-0184-MOVED rows —
// their literal ARM lowers schema-subset.md:79's `const` rather than the
// permissive `{}` — re-derived in place inside (d)'s loop under bug 0184 §Fix's
// authority, with their SILENCE unchanged and still their subject. A THIRD came
// later still: d1 (`array<"x" | "y">`), d2 (`array<1 | 2>`) and d3
// (`{m: array<"x" | "y">}`, plus its `d3-body` mint) are bug-0164-MOVED rows,
// re-derived in place under bug 0164 §Fix (v0.123.0) with their SILENCE
// unchanged and still their subject: at HEAD their argument arms reached
// `lowerTypeExpr`'s catch-all and landed in the sink, so only the caller's
// literal decline kept them silent — and that decline is unchanged, because
// `isUnspellableTextRefusable` (src/parser/params.ts) is what withholds the
// refusal and bug 0164 §Fix constraint 7 registers no diagnostic. What that fix
// changed is where the argument text GOES, so the sink is no longer even fed for
// these three. The remaining sharpest tripwires are d4 (`array<{a: string}>`)
// and d13 (`array<{a: ???}>`): a BRACE-ROOTED argument, which the literal
// recogniser declines, so both keep `{"type":"array","items":{}}` and are the
// proof bug 0164's fix reaches only what that recogniser accepts.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`, tests/helpers/e2e-s1.ts
// — the shipped front end wrapped in the standard inert deps double), one
// `lowerQueryResponseSchema` call for the annotation position, and one read of
// the committed spec corpus. An integration or live tier could not observe the
// subject at all: the subject is which diagnostics a load emits and which exact
// bytes a type expression lowers to, both fully determined before any turn
// runs, and the refusal un-registers the theta — so a live drive would observe
// an absent slash command and could not distinguish this refusal from any other
// load-time error, while adding stochastic surface over a contract that has
// none. The registration consequence is reached the way the sibling unit locks
// reach it (tests/params-block-mapping-rhs-refusal.test.ts:418–432,
// tests/fn-param-name-reserved-keyword.test.ts:312–329): by asserting the two
// properties the shipped drop gate reads — error severity and the `theta/load/`
// namespace (`hasLoadParseError`,
// src/extension/production-composition.ts:2047–2054) — plus the frontmatter
// collapse, rather than by re-driving discovery, which witnesses nothing more.
//
// NO SILENT SKIPPING: every reader THROWS, naming the absent intermediate, when
// the lowered `params:` document, the `$defs` entry or the lowered annotation is
// missing, and the corpus walk throws when it finds no files. A refused parse,
// an absent params block or an empty walk can never be mistaken for a pass.

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

/** The row this refusal reuses; its *Trigger* widens, its *Message* does not. */
const CODE = "theta/load/params-type-not-expression";

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
 * Definedness is asserted first so a missing row reds by naming the registry
 * page, never by a bare `undefined` comparison.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}

/** One registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(`the parsed registry holds no structured row for ${code}`);
  }
  return row;
}

/** The refusal's message for one field (`<param>` is category-5, unquoted). */
function refusalMessage(param: string): string {
  return registryMessageOf(CODE).replace("<param>", param);
}

/** The `theta/parse/unresolved-named-type` message for one name. */
function unresolvedMessage(name: string): string {
  return registryMessageOf("theta/parse/unresolved-named-type").replace("<name>", name);
}

// ===========================================================================
// Fixture sources and the loud readers.
// ===========================================================================

/** `Triage` is declared in every fixture; `Tirage` and `Ghost` are declared nowhere. */
const DECLS = "schema Triage { urgent: boolean }\n";

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

/** The body every `params:` fixture carries. */
const BODY = `${DECLS}let x = 1\n`;

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}`;
}

/**
 * A theta type expression wrapped as a YAML single-quoted scalar. Theta-side
 * literals carry theta-side quotes, and an unquoted spelling of a text carrying
 * a `:`, a `#` or a `{` breaks the YAML frame outright, which collapses the load
 * to `theta/load/malformed-frontmatter-yaml` (bug 0263) — a different frame
 * entirely.
 */
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The lowered `params:` document, absent when the load withheld it. */
function loweredParams(doc: ThetaDocument): Record<string, unknown> | undefined {
  return doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
}

/** One theta parsed at the `params:` position with `p` bound to `typeSource`. */
function paramsDoc(typeSource: string): ThetaDocument {
  return parseDoc(src(`  p: ${yamlQuoted(typeSource)}`), "bug0059.theta");
}

/** The lowered `params:` document of a fixture that MUST load, loud when absent. */
function loadedParams(label: string, doc: ThetaDocument): Record<string, unknown> {
  const document = loweredParams(doc);
  if (document === undefined) {
    throw new Error(
      `${label}: the theta declares a \`params:\` block, so its lowered schema must be present ` +
        `for there to be anything at the argument boundary; diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return document;
}

/** The fragment at `properties.p` of a fixture that MUST load, loud when absent. */
function fragmentAtP(label: string, doc: ThetaDocument): unknown {
  const document = loadedParams(label, doc);
  const properties = document["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ` +
        `${JSON.stringify(document)}`,
    );
  }
  return (properties as Record<string, unknown>)["p"];
}

/** A fixture's `$defs`, defaulting to the empty record. */
function defsOf(label: string, doc: ThetaDocument): Record<string, unknown> {
  return (loadedParams(label, doc)["$defs"] ?? {}) as Record<string, unknown>;
}

/**
 * The whole refusal contract for one offending field: EXACTLY ONE diagnostic,
 * the registered code at error severity in the `theta/load/` namespace, its
 * message the registry's with `<param>` rendered, the frontmatter collapsed and
 * the lowered document withheld.
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * symptom the bug reports — a declaration that silently loses all validation —
 * rather than a downstream message or registry mismatch.
 */
function expectTextRefused(label: string, doc: ThetaDocument, param: string): void {
  expect(
    diagCodes(doc),
    `${label}: the right-hand side is outside the closed \`Type\` grammar ` +
      `(grammar.md:90–:102) and no emission rule admits it (schema-subset.md:74–:81), so the ` +
      `honest disposition is refusal with EXACTLY ONE error-severity ${CODE}. Rendered ` +
      `diagnostics: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${CODE}`]);
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  // The two properties the shipped drop gate reads. `hasLoadParseError`
  // (src/extension/production-composition.ts:2047–2054) drops a theta exactly
  // when some diagnostic has `severity === "error"` and a code in the
  // `theta/load/` or `theta/parse/` namespace, so asserting both is the
  // reachability link between this emission and a theta that does not register.
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the ` +
      `accept-anything param registered`,
  ).toBe("error");
  expect(
    diagnostic.code.startsWith("theta/load/"),
    `${label}: the drop gate reads the \`theta/load/\` / \`theta/parse/\` namespaces only; ` +
      `observed code ${diagnostic.code}`,
  ).toBe(true);
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's template with the ` +
      `category-5 \`<param>\` placeholder rendered as the field name, unquoted`,
  ).toBe(refusalMessage(param));
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic collapses the frontmatter, which is what ` +
      `withholds registration; a loaded theta whose param validates nothing is the hole this ` +
      `bug reports`,
  ).toBeNull();
  expect(
    loweredParams(doc),
    `${label}: no lowered \`params:\` document may survive the refusal — a surviving ` +
      `\`properties.p = {}\` is the permissive fragment the three consumers compile`,
  ).toBeUndefined();
}

// ===========================================================================
// (r) The registry oracle every message in this file is derived from.
// GREEN at HEAD — the row exists; the fix widens its *Trigger* only.
// ===========================================================================

describe("bug 0059 (r) — the registered row this refusal reuses", () => {
  it("r1: the row is `E` in the `load` phase and carries the `<param>` slot", () => {
    // DIAG-2 closes the registry, so the row's existence is the licence for
    // every cell in group (a); the *Sev* column is what ties the emission to
    // the registration refusal, and a `W` row would leave the accept-anything
    // param registered with a diagnostic attached.
    const row = registryRowOf(CODE);
    expect(
      row.severity,
      `code-registry-load.md:19's Sev column is what \`hasLoadParseError\` acts on; a non-\`E\` ` +
        `row would not un-register the theta`,
    ).toBe("E");
    expect(row.phase, "the refusal is raised during the frontmatter load, not at runtime").toBe(
      "load",
    );
    expect(
      row.message,
      "DIAG-4: the Message template carries the `<param>` slot the emission interpolates",
    ).toContain("<param>");
  });

  it("r2: the row's *Message* bytes are unchanged by this fix", () => {
    // §Fix *Registry*: "The *Message* bytes do not change, so no DIAG-4 reword
    // is involved." Pinning the template here makes a silent reword visible as
    // a red in this file rather than as a quiet drift in every message
    // assertion below, all of which derive from the same read.
    expect(
      registryMessageOf(CODE),
      "the widened *Trigger* must not drag the *Message* column with it",
    ).toBe("'params:' field '<param>' right-hand side is not a theta type expression");
  });
});

// ===========================================================================
// (a) THE DEFECT — constraint 4's refused set, through every spelling that
// carries it. RED at HEAD: every cell loads with ZERO diagnostics and lowers
// the permissive `{}`.
// ===========================================================================

/**
 * §Fix constraint 4's enumerated set: text carrying a YAML mapping or sequence
 * shape, prose, punctuation, comment-shaped text, two space-separated
 * identifiers, and the empty or whitespace-only type text. `array<` is NOT in
 * this group — it draws its own arity refusal at HEAD and belongs to the
 * guard-extension rows (group (g)).
 *
 * Every row here is judged as the WHOLE right-hand side's own fragment, except
 * a11, whose junk sits in a union arm. The other three reaches the judgement
 * has — a generic type argument, and a hoisted inline object's field type at
 * any depth, reached either directly or through a top-level union arm — are
 * a21–a25 below.
 */
const REFUSED_TEXTS: ReadonlyArray<readonly [string, string]> = [
  ["a1 (block-mapping bytes)", "a: Tirage"],
  ["a2 (flow-sequence bytes)", "[a, b]"],
  ["a3 (block-sequence bytes)", "- a"],
  ["a4 (prose)", "not a type at all"],
  ["a5 (prose, description-shaped)", "the id of the ticket to triage"],
  ["a6 (punctuation)", "???"],
  ["a7 (comment-shaped)", "# comment"],
  ["a8 (two identifiers)", "Triage Triage"],
  ["a9 (empty)", ""],
  ["a10 (whitespace-only)", "   "],
  ["a11 (junk union arm)", "string | a: Tirage"],
  ["a12 (junk type, literal default)", "a: Tirage = 5"],
];

describe("bug 0059 (a) — text no `Type` production spells is refused at `params:`", () => {
  for (const [label, typeSource] of REFUSED_TEXTS) {
    it(`RED (${label}): \`${typeSource}\` draws exactly one ${CODE}`, () => {
      expectTextRefused(label, paramsDoc(typeSource), "p");
    });
  }

  /**
   * The same bytes reached through every scalar spelling the YAML frame offers.
   * All six deliver `a: Tirage` to the lowering: `extractParsedParams` reads
   * `String(item.value.value)` for a scalar (src/parser/frontmatter.ts:840–842)
   * and `splitParamValue` trims the ends (`:778–779`), so the quoted forms, both
   * block-scalar forms and the folded multi-line collapse to one text — which
   * is why the node-shape gate cannot separate them and the text-level
   * judgement must.
   */
  const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
    ["a13 (double-quoted scalar)", '  p: "a: Tirage"'],
    ["a14 (single-quoted scalar)", "  p: 'a: Tirage'"],
    ["a15 (literal block scalar, ONE line)", "  p: |\n    a: Tirage"],
    ["a16 (folded block scalar, ONE line)", "  p: >\n    a: Tirage"],
    ["a17 (folded block scalar, TWO lines folded to one)", "  p: >\n    a: Tirage\n    b: integer"],
    ["a18 (literal block scalar, TWO lines)", "  p: |\n    a: Tirage\n    b: integer"],
    ["a19 (double-quoted `\\n` escape)", '  p: "a: Tirage\\nb: integer"'],
  ];

  for (const [label, paramsBlock] of SPELLINGS) {
    it(`RED (${label}): the spelling does not change the disposition`, () => {
      expectTextRefused(label, parseDoc(src(paramsBlock), "bug0059.theta"), "p");
    });
  }

  it("RED (a20): a second offending field draws its own diagnostic, named for that field", () => {
    // §Fix: "one error-severity diagnostic per offending field". Two fields in
    // one block are what separates a per-field emission from a per-document
    // one, and the `<param>` rendering is what makes the two distinguishable.
    const doc = parseDoc(src("  p: '???'\n  q: 'not a type at all'"), "bug0059.theta");
    expect(
      diagLines(doc),
      "each offending field is reported at its own range with its own name rendered",
    ).toEqual([`error ${CODE}: ${refusalMessage("p")}`, `error ${CODE}: ${refusalMessage("q")}`]);
  });

  /**
   * THE JUDGED UNIT IS THE FRAGMENT, and these are the reaches past the top
   * level (bug 0059 §Fix; the brace boundary is the operator grant at HEAD
   * 948b7814). Each row's junk sits somewhere the lowering hands the judgement
   * a BRACE-FREE fragment even though the enclosing right-hand side is a
   * `GenericType` or an inline `ObjectType`:
   *
   *   - a21 — a generic type argument: `lowerTypeExpr`'s `array` arm lowers its
   *     one argument through itself, so the argument's own fragment reaches the
   *     catch-all. Nothing else fires for it, which is what makes it a REFUSAL
   *     row rather than one of group (g)'s guard-extension rows.
   *   - a22/a23 — a hoisted inline object's field type, at one and two levels:
   *     `hoistInlineObjectType` lowers each declared field through
   *     `lowerParamsFieldType` again, so the braces belong to the hoist and the
   *     field's own fragment is brace-free. The group (d) rows that stay silent
   *     are the complement — a brace-carrying fragment reaching the judgement
   *     WHOLE.
   *   - a24 — a union arm inside a hoisted field type: both recursions compose,
   *     which is what "at any depth" means for the reaches above.
   *   - a25 — the SAME hoisted-field reach as a22/a23, but the hoist is reached
   *     through a top-level union arm rather than the whole right-hand side:
   *     `lowerBraceGroupUnionArms` (src/parser/params.ts, bug 0097 §Fix) hoists
   *     the arm through the identical `hoistInlineObjectType` call a22
   *     reaches, so the arm's OWN braces belong to the hoist and its field's
   *     fragment arrives brace-free at the judgement exactly as a22's does.
   *     This row is not part of group (d)'s silent family: the arm hoists.
   */
  const FRAGMENT_REACHES: ReadonlyArray<readonly [string, string]> = [
    ["a21 (junk in a generic type argument)", "array<a: Tirage>"],
    ["a22 (junk in a hoisted inline object's field type)", "{a: ???}"],
    ["a23 (junk one hoist deeper)", "{a: {b: ???}}"],
    ["a24 (junk in a union arm inside a hoisted field type)", "{a: string | a: Tirage}"],
    ["a25 (junk in a hoisted field type reached through a top-level union arm)", "string | {a: ???}"],
  ];

  for (const [label, typeSource] of FRAGMENT_REACHES) {
    it(`RED (${label}): \`${typeSource}\` draws exactly one ${CODE}`, () => {
      expectTextRefused(label, paramsDoc(typeSource), "p");
    });
  }
});

// ===========================================================================
// (b) CONSTRAINT 1 — a field whose value NODE is already refused keeps EXACTLY
// ONE diagnostic, and stays retained so no cascade fires downstream.
// GREEN at HEAD and required to stay green.
// ===========================================================================

/** The three node shapes bug 0041's fix refuses before any text is in hand. */
const NODE_REFUSED: ReadonlyArray<readonly [string, string]> = [
  ["b1 (block mapping)", "  p:\n    a: Tirage"],
  ["b2 (block sequence)", "  p:\n    - a\n    - b"],
  ["b3 (flow sequence)", "  p: [a, b]"],
];

describe("bug 0059 (b) — a node-shape-refused field keeps its single diagnostic", () => {
  for (const [label, paramsBlock] of NODE_REFUSED) {
    it(`GREEN (${label}): exactly one ${CODE}, from the frontmatter seam`, () => {
      // The retained field's recovered bytes still reach `parseParams`, so a
      // block mapping would draw the text-level refusal as well unless one of
      // the two is suppressed. The ordering comment at
      // src/parser/frontmatter.ts:918–921 settles which survives: a field
      // whose right-hand side spells no type expression is reported as such,
      // "not by whatever the lowering makes of its recovered bytes".
      expectTextRefused(label, parseDoc(src(paramsBlock), "bug0059.theta"), "p");
    });
  }

  it("GREEN (b4): the `system:` interpolation seam fires no cascade over a refused field", () => {
    // The retention witness. `toSystemParamType`
    // (src/parser/frontmatter.ts:695) types the recovered text as a string, so
    // `${p}` is admitted. Were the fix to DROP the field instead of retaining
    // it, `${p}` would name an unknown param and a second, cascading
    // interpolation diagnostic would join the refusal — so EXACTLY one
    // diagnostic here is what pins the retention.
    const doc = parseDoc(
      `---\nmode: subagent\nparams:\n  p:\n    a: Tirage\nsystem: "\${p}"\n---\n${BODY}`,
      "bug0059.theta",
    );
    expectTextRefused("b4", doc, "p");
  });
});

// ===========================================================================
// (c) CONSTRAINT 2 — NO CROSS-POSITION BLAST RADIUS, NARROWED BY BUG 0061. The
// `@<T>` annotation, the `value` position (`let` annotations, `fn` parameter
// types) and the `return` position thread no sink under either bug, so the
// same junk text keeps byte-identical lowered documents AND byte-identical
// diagnostic sequences there — GREEN at HEAD and required to stay green. The
// `schema`-body field and the alias right-hand side are NO LONGER fenced here:
// bug 0061 §Fix threads its OWN sink at those two body positions
// (`isUnspellableTextRefusable`, params.ts), independent of this bug's
// `params:`-only one, so three cells that used to pin silence there (`c4`,
// `c5`, `c7` — operator grant "Authorize the 3-cell fence update; re-dispatch
// 0061", HEAD `8e2a199c`) now pin bug 0061's refusal instead, in their own
// table below. The other 18 `CONTRAST_ROWS` stay green for the same reason
// they always did: each already carries its own pre-existing code (a
// same-scope error, or `malformed-alias-rhs`), so bug 0061's guards hold them
// at their existing sequence — this bug's own subject stays fully witnessed.
// ===========================================================================

const CONTRAST_POSITIONS = ["field", "alias", "annotation"] as const;
type ContrastPosition = (typeof CONTRAST_POSITIONS)[number];

/** What one contrast position yields for one type source. */
interface PositionRead {
  /** Every diagnostic rendered `<severity> <code>`, in emission order. */
  readonly diagCodes: readonly string[];
  /** The lowered artefact AT the position — the `$defs` entry, or the annotation document. */
  readonly lowered: unknown;
}

/**
 * Read one type source at one contrast position, loud on every way a fixture
 * can fail to reach the lowering. The `params:` wrapper each of `field` and
 * `alias` needs is a plain `NamedType` reference, so the wrapper itself never
 * carries the junk under test.
 *
 * The `@<T>` annotation enters `lowerTypeSource` through
 * `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts:167) and
 * returns its lowered document directly; that seam has no diagnostic channel,
 * which is why its `diagCodes` are read off a document carrying no annotation
 * and are always empty.
 */
function readAt(position: ContrastPosition, typeSource: string): PositionRead {
  if (position === "annotation") {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0059.theta");
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(typeSource, schemas, enums);
    if (lowered === undefined) {
      throw new Error(
        `[annotation]: \`${typeSource}\` produced NO lowered annotation document, so there is ` +
          `nothing to compare across positions`,
      );
    }
    return { diagCodes: diagCodes(doc), lowered };
  }
  const wrapper = position === "field" ? "S" : "M";
  const source =
    position === "field"
      ? `---\nmode: prompt\nparams:\n  p: S\n---\n${DECLS}schema S { a: ${typeSource} }\nlet inert = 1\ninert\n`
      : `---\nmode: prompt\nparams:\n  a: M\n---\n${DECLS}schema M = ${typeSource}\nlet inert = 1\ninert\n`;
  const doc = parseDoc(source, "bug0059.theta");
  const document = loweredParams(doc);
  if (document === undefined) {
    throw new Error(
      `[${position}]: \`${typeSource}\` produced NO lowered \`params:\` document, so the ` +
        `\`$defs\` entry under assertion is unreachable; diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  if (!(wrapper in defs)) {
    throw new Error(
      `[${position}]: the wrapper \`${wrapper}\` is absent from \`$defs\`, so the contrast ` +
        `position never lowered; \`$defs\` keys ${JSON.stringify(Object.keys(defs))}`,
    );
  }
  return { diagCodes: diagCodes(doc), lowered: defs[wrapper] };
}

/** The permissive fragment every contrast position lowers junk text to today. */
const PERMISSIVE = {};

/** `schema S { a: <junk> }` when the body parser recovers a one-field schema. */
const S_WITH_PERMISSIVE_A = {
  type: "object",
  properties: { a: {} },
  required: ["a"],
  additionalProperties: false,
};

/**
 * The two-code sequence for junk inside a schema body: bug 0133 §Fix
 * (a)2/(a)3 + §Fix constraint 5's diagnostic-registry carve-out keeps the
 * field captured before the junk token, so `malformed-schema-field`
 * (anchored at the offending token) fires instead of `empty-schema-body`,
 * and the retained field's own junk type reaches the checker-time
 * field-type walk. Four of the five field-position CONTRAST_ROWS below have
 * a junk type that walk refuses too (`schema-type-not-expression`), so
 * their own sequence gains that row ahead of the comma rule's; `c16`
 * (`Triage Triage`) does not, because `Triage` is a resolvable named type.
 *
 * Bug 0285 (0.282.0) withholds the comma rule's `unsupported-feature` line
 * when the captured type ends no `Type` atom or the stray tail cannot start
 * a next field — which is exactly c1/c10/c13/c19's shape (tails `: Tirage`,
 * `-`, `#` start no field), so those four rows pin the two-code sequence
 * WITHOUT the comma line. `c16`'s tail (`Triage`, an identifier) can start a
 * next field, so its comma line survives. Ratified flip recorded in 0285's
 * fix record and in 0133's coordination note.
 */
const FIELD_JUNK_CODES_WITH_TYPE_REFUSAL = [
  "error theta/parse/schema-type-not-expression",
  "error theta/parse/unsupported-feature",
  "error theta/parse/malformed-schema-field",
];
/**
 * The bug 0285 (0.282.0) shape: type refusal beside the body-level row, the
 * phantom comma line withheld (capture ends no `Type` atom / tail starts no
 * next field).
 */
const FIELD_JUNK_CODES_TYPE_REFUSAL_NO_COMMA = [
  "error theta/parse/schema-type-not-expression",
  "error theta/parse/malformed-schema-field",
];
/** The field-position sequence when the retained field's own type resolves (c16). */
const FIELD_JUNK_CODES_RESOLVED_TYPE = [
  "error theta/parse/unsupported-feature",
  "error theta/parse/malformed-schema-field",
];

/** The alias declaration's own malformed-right-hand-side refusal. */
const ALIAS_MALFORMED = ["error theta/parse/malformed-alias-rhs"];

/**
 * Each junk text at each contrast position, with the lowered artefact and the
 * whole diagnostic-code sequence that position produces at HEAD. Every row but
 * the five FIELD-position rows named below (c1, c10, c13, c16, c19) is a
 * NO-CHANGE cell: this bug's own fix threads its sink at `params:` alone, so a
 * row that gains a code or changes a byte from THIS fix is the cross-position
 * blast constraint 2 forbids. The five named rows move under a DIFFERENT
 * authority — bug 0133 §Fix (a)2/(a)3 + §Fix constraint 5's diagnostic-registry
 * carve-out: the field list a malformed field sits in is retained, so each
 * row's own junk field type reaches the checker-time field-type walk this
 * bug's own gate unlocks.
 */
const CONTRAST_ROWS: ReadonlyArray<
  readonly [string, string, ContrastPosition, unknown, readonly string[]]
> = [
  // c1 — bug 0133 §Fix (a): the field `a` is retained, so the row's junk type
  // (`a` — `parseType`'s field-boundary stop ends the capture there) reaches
  // the checker-time field-type walk and draws its own refusal ahead of the
  // body-level row, replacing the discard's `empty-schema-body` with the new
  // anchored-at-the-token row. Comma line withheld since 0285 (0.282.0): the
  // stray tail `: Tirage` cannot start a next field.
  ["c1", "a: Tirage", "field", S_WITH_PERMISSIVE_A, FIELD_JUNK_CODES_TYPE_REFUSAL_NO_COMMA],
  [
    "c2",
    "a: Tirage",
    "alias",
    PERMISSIVE,
    [...ALIAS_MALFORMED, "error theta/parse/unknown-identifier"],
  ],
  ["c3", "a: Tirage", "annotation", PERMISSIVE, []],
  ["c6", "???", "annotation", PERMISSIVE, []],
  [
    "c8",
    "[a, b]",
    "alias",
    PERMISSIVE,
    ["error theta/parse/empty-schema-body", "error theta/parse/unknown-identifier"],
  ],
  ["c9", "[a, b]", "annotation", PERMISSIVE, []],
  // c10 — same authority as c1: the retained field's junk type (`-`) is
  // refused by the field-type walk this fix unlocks. Comma line withheld
  // since 0285 (0.282.0): the capture ends no `Type` atom.
  ["c10", "- a", "field", S_WITH_PERMISSIVE_A, FIELD_JUNK_CODES_TYPE_REFUSAL_NO_COMMA],
  ["c11", "- a", "alias", PERMISSIVE, ALIAS_MALFORMED],
  ["c12", "- a", "annotation", PERMISSIVE, []],
  // c13 — same authority as c1: the retained field's junk type is refused.
  // Comma line withheld since 0285 (0.282.0): the capture ends no `Type` atom.
  ["c13", "# comment", "field", S_WITH_PERMISSIVE_A, FIELD_JUNK_CODES_TYPE_REFUSAL_NO_COMMA],
  [
    "c14",
    "# comment",
    "alias",
    PERMISSIVE,
    [...ALIAS_MALFORMED, "error theta/parse/unknown-identifier"],
  ],
  ["c15", "# comment", "annotation", PERMISSIVE, []],
  // c16 — bug 0133 §Fix (a): the field `a: Triage` is retained and `Triage` IS
  // a resolvable named type (this file's own `DECLS`), so its lowered bytes
  // are a real `$ref` rather than the permissive fragment, and the
  // field-type walk draws nothing — only the comma rule's own line and the
  // new anchored row survive.
  [
    "c16",
    "Triage Triage",
    "field",
    { type: "object", properties: { a: { $ref: "#/$defs/Triage" } }, required: ["a"], additionalProperties: false },
    FIELD_JUNK_CODES_RESOLVED_TYPE,
  ],
  ["c17", "Triage Triage", "alias", { $ref: "#/$defs/Triage" }, ALIAS_MALFORMED],
  ["c18", "Triage Triage", "annotation", PERMISSIVE, []],
  // c19 — same authority as c1: the retained field's junk union arm is
  // refused by the field-type walk, beside the settled `string` arm. Comma
  // line withheld since 0285 (0.282.0): the stray tail `: Tirage` cannot
  // start a next field.
  [
    "c19",
    "string | a: Tirage",
    "field",
    { type: "object", properties: { a: { anyOf: [{ type: "string" }, {}] } }, required: ["a"], additionalProperties: false },
    FIELD_JUNK_CODES_TYPE_REFUSAL_NO_COMMA,
  ],
  [
    "c20",
    "string | a: Tirage",
    "alias",
    { anyOf: [{ type: "string" }, {}] },
    [...ALIAS_MALFORMED, "error theta/parse/unknown-identifier"],
  ],
  ["c21", "string | a: Tirage", "annotation", { anyOf: [{ type: "string" }, {}] }, []],
];

describe("bug 0059 (c) — the three other type positions keep their bytes and their diagnostics", () => {
  for (const [id, typeSource, position, lowered, codes] of CONTRAST_ROWS) {
    it(`GREEN (${id}, ${position}): \`${typeSource}\` is unchanged`, () => {
      // The refusal must not be raised inside `lowerTypeExpr`, which every
      // type position reaches — the `schema`-body field and the alias
      // right-hand side through `lowerTypeSource`'s delegation (its own
      // fallback, src/parser/body-type-lowering.ts:320, and the non-brace-arm
      // dispatch inside `lowerBraceGroupUnionArms`, src/parser/params.ts),
      // the `@<T>` annotation through that same function
      // (src/runtime/query-schema-lowering.ts:167). The sink
      // is optional on `LowerCtx` (src/parser/params.ts — the
      // `unspellable` member and its documented contract) for exactly this
      // reason: a position that threads none collects nothing.
      const read = readAt(position, typeSource);
      expect(
        read.lowered,
        `${id}: the lowered bytes at the ${position} position are outside this fix's reach ` +
          `(§Fix constraint 2)`,
      ).toEqual(lowered);
      expect(
        read.diagCodes,
        `${id}: the diagnostic SEQUENCE at the ${position} position is outside this fix's ` +
          `reach; a gained code is the cross-position blast constraint 2 forbids`,
      ).toEqual(codes);
    });
  }

  /**
   * THREE ROWS MOVED HERE FROM `CONTRAST_ROWS` ABOVE (bug 0061 §Fix, operator
   * grant "Authorize the 3-cell fence update; re-dispatch 0061", HEAD
   * `8e2a199c`): `c4` and `c7` were the FIELD position's `???` and `[a, b]`;
   * `c5` was the ALIAS position's `???`. Each is text no `Type` production
   * spells and carries no brace, so the ONE SHARED decline
   * (`isUnspellableTextRefusable`, params.ts) this bug's and bug 0061's
   * refusal both read cannot decline it without narrowing this bug's own
   * landed refusal too — no implementation faithful to bug 0061 §Fix
   * constraint 4 keeps these three cells silent. The lowered bytes are
   * UNMOVED (the refusal is raised by the caller, never inside
   * `lowerTypeExpr`): only the diagnostic sequence moves. `c6` (the
   * ANNOTATION position's own `???`) is untouched and stays in
   * `CONTRAST_ROWS` above — the `@<T>` position threads no sink under either
   * bug.
   */
  const BODY_POSITION_REFUSED: ReadonlyArray<
    readonly [string, string, ContrastPosition, unknown]
  > = [
    ["c4", "???", "field", S_WITH_PERMISSIVE_A],
    ["c5", "???", "alias", PERMISSIVE],
    ["c7", "[a, b]", "field", S_WITH_PERMISSIVE_A],
  ];

  for (const [id, typeSource, position, lowered] of BODY_POSITION_REFUSED) {
    it(`GREEN (${id}, ${position}): \`${typeSource}\` is refused now by bug 0061`, () => {
      const read = readAt(position, typeSource);
      expect(
        read.lowered,
        `${id}: the lowered bytes at the ${position} position are UNMOVED by bug 0061 — the ` +
          `refusal is raised by the caller, never inside \`lowerTypeExpr\` (§Fix constraint 2)`,
      ).toEqual(lowered);
      expect(
        read.diagCodes,
        `${id}: bug 0061 §Fix threads its own refusal at the ${position} position now, ` +
          `independent of this bug's \`params:\`-only sink — the fence these three cells used to ` +
          `pin has narrowed to the positions that still thread neither`,
      ).toEqual(["error theta/parse/schema-type-not-expression"]);
    });
  }
});

// ===========================================================================
// (d) CONSTRAINT 3, THE 0164 TRIPWIRE AND THE AUTHORIZED BRACE UNDER-REFUSAL —
// grammar-admitted traffic that legitimately reaches the same catch-all, and
// the brace-carrying FRAGMENTS the brace frame owns: a fragment that reaches
// the judgement whole with a brace in it, whether that fragment is the whole
// right-hand side or one `lowerTypeExpr` hands over from a union arm or a
// generic argument. GREEN at HEAD, byte-for-byte.
// ===========================================================================

/**
 * SHA-256 of a hand-written canonical form, first 16 lowercase hex characters
 * (schema-subset.md:98 hashes the LOWERED fragment; :106/:107 give the digest
 * and its truncation). `schemaSlug` is deliberately NOT imported — an oracle
 * taken from the implementation under test proves nothing.
 */
function inlineDefName(canonical: string): string {
  return `__inline_${createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)}`;
}

/**
 * `{m: array<"x" | "y">}` — the 0164 tripwire one level down, and its canonical
 * form. RE-DERIVED UNDER BUG 0164 §Fix (v0.123.0): that report re-routes
 * `lowerTypeExpr`'s generic-ARGUMENT recursion through
 * `lowerLiteralSublanguage`, so the hoisted `m` carries schema-subset.md:80's
 * emission inside :77's `items` where it carried the trailing catch-all's
 * `{"anyOf":[{},{}]}` — and the mint, a function of the LOWERED fragment (:73,
 * :98), moves with it. THE SUBJECT OF THE d1/d2/d3 ROWS IS SILENCE, NOT BYTES:
 * bug 0059 §Fix constraint 3's claim is that this grammar-admitted traffic draws
 * no `params-type-not-expression`, and that claim is untouched.
 */
const M_ARRAY_XY_FRAGMENT = {
  type: "object",
  properties: { m: { type: "array", items: { type: "string", enum: ["x", "y"] } } },
  required: ["m"],
  additionalProperties: false,
};
const M_ARRAY_XY_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"items":{"enum":["x","y"],"type":"string"},' +
  '"type":"array"}},"required":["m"],"type":"object"}';
const M_ARRAY_XY_INLINE = inlineDefName(M_ARRAY_XY_CANONICAL);

/** `{a: array<{m: integer}>}` — constraint 3's nested brace-rooted arm, hoisted. */
const A_ARRAY_INLINE_FRAGMENT = {
  type: "object",
  properties: { a: { type: "array", items: {} } },
  required: ["a"],
  additionalProperties: false,
};
const A_ARRAY_INLINE_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"items":{},"type":"array"}},' +
  '"required":["a"],"type":"object"}';
const A_ARRAY_INLINE_INLINE = inlineDefName(A_ARRAY_INLINE_CANONICAL);

/** `{a: string}` — d5's union arm, which bug 0097 §Fix's arm dispatch hoists. */
const A_STRING_FRAGMENT = {
  type: "object",
  properties: { a: { type: "string" } },
  required: ["a"],
  additionalProperties: false,
};
const A_STRING_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"string"}},"required":["a"],"type":"object"}';
const A_STRING_INLINE = inlineDefName(A_STRING_CANONICAL);

/** `{a: Triage}` — constraint 5's hoisting control. */
const A_TRIAGE_FRAGMENT = {
  type: "object",
  properties: { a: { $ref: "#/$defs/Triage" } },
  required: ["a"],
  additionalProperties: false,
};
const A_TRIAGE_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"}},' +
  '"required":["a"],"type":"object"}';
const A_TRIAGE_INLINE = inlineDefName(A_TRIAGE_CANONICAL);

const CANONICAL_PAIRS: ReadonlyArray<readonly [string, string, unknown]> = [
  ['{m: array<"x" | "y">}', M_ARRAY_XY_CANONICAL, M_ARRAY_XY_FRAGMENT],
  ["{a: array<{m: integer}>}", A_ARRAY_INLINE_CANONICAL, A_ARRAY_INLINE_FRAGMENT],
  ["{a: Triage}", A_TRIAGE_CANONICAL, A_TRIAGE_FRAGMENT],
  ["{a: string}", A_STRING_CANONICAL, A_STRING_FRAGMENT],
];

describe("bug 0059 (d0) — the independent `__inline_<slug>` oracle's own honesty", () => {
  for (const [label, canonical, fragment] of CANONICAL_PAIRS) {
    it(`GREEN (d0, ${label}): the hand-written canonical form is the fragment it names, canonicalised`, () => {
      expect(
        JSON.parse(canonical),
        `schema-subset.md:98 hashes the LOWERED fragment, so the oracle's canonical string must ` +
          `carry exactly that value; observed ${canonical}`,
      ).toEqual(fragment);
      const sorted = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(sorted);
        }
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sorted(v)]),
          );
        }
        return value;
      };
      expect(
        canonical,
        `schema-subset.md:100 — object keys sorted by Unicode code point at every level; :101 — ` +
          `no insignificant whitespace; observed ${canonical}`,
      ).toBe(JSON.stringify(sorted(fragment)));
    });
  }
});

/**
 * Every text the fix's recogniser must DECLINE at refusal time, with the
 * fragment it lowers at `params:` today. Three families sit here:
 *
 *   - the 0164 tripwire (`array<"x" | "y">`, `array<1 | 2>` and their nested
 *     form): at HEAD their argument arms reached the catch-all and landed in
 *     the sink, so only the caller's literal decline via `parseLiteralArm`
 *     (src/parser/params.ts, reached from `lowerParamsFieldType`'s call to
 *     `lowerLiteralSublanguage`) kept them silent. Bug 0164 §Fix
 *     (v0.123.0) re-routed the generic-ARGUMENT recursion through that same
 *     sublanguage, so their bytes were re-derived here — while the decline that
 *     withholds the refusal, `isUnspellableTextRefusable`, is
 *     unchanged and their silence is still what these rows assert.
 *   - constraint 3's grammar-admitted brace-rooted and mixed-union traffic.
 *   - the authorized under-refusal (operator grant, HEAD 948b7814): "the brace
 *     frame (`lowerParamsFieldType`'s intercept, `hoistInlineObjectType`, bugs
 *     0035/0045/0052) owns every text carrying a brace; this refusal owns
 *     brace-free text." `array<{x: integer, y: string}>` is why that decline is
 *     stated on braces rather than on brace-ROOTED text: `splitTopLevel`
 *     defaults to angle-bracket nesting, so the two generic arguments come out
 *     as the unbalanced `{x: integer` and `y: string}`, neither of them
 *     brace-rooted.
 *
 * THE UNDER-REFUSAL IS FRAGMENT-LEVEL, which is what d10, d11 and d13 and
 * group (a)'s a22–a25 pin between them: junk that reaches the judgement WHOLE
 * with a brace in it stays silent, whether it is the whole right-hand side
 * (d10 `{junk}`, d11 `{a: string`) or a fragment `lowerTypeExpr` hands over
 * intact through a GENERIC argument it never re-enters as a hoist (d13
 * `array<{a: ???}>`). Junk inside a HOISTED field's brace-free type is not
 * covered by it — the hoist strips the braces on the way in and the fragment
 * arrives brace-free, so `{a: ???}` is refused whether the hoist is reached
 * directly (a22) or through a top-level union arm `lowerBraceGroupUnionArms`
 * (src/parser/params.ts, bug 0097 §Fix) now hoists (a25, from
 * `string | {a: ???}`, which is not part of this family for exactly that
 * reason) — while `array<{a: ???}>` stays silent (d13) because a generic
 * argument is not a hoist. One `{a: ???}`, two dispositions, decided by which
 * route hands it to the judgement.
 */
const DECLINED_ROWS: ReadonlyArray<readonly [string, string, unknown, readonly string[]]> = [
  [
    "d1 (0164 tripwire, string-literal union arms)",
    'array<"x" | "y">',
    { type: "array", items: { type: "string", enum: ["x", "y"] } },
    [],
  ],
  [
    "d2 (0164 tripwire, number-literal union arms)",
    "array<1 | 2>",
    { type: "array", items: { enum: [1, 2] } },
    [],
  ],
  [
    "d3 (0164 tripwire, hoisted one level down)",
    '{m: array<"x" | "y">}',
    { $ref: `#/$defs/${M_ARRAY_XY_INLINE}` },
    [M_ARRAY_XY_INLINE],
  ],
  [
    "d4 (brace-rooted arm in a generic argument)",
    "array<{a: string}>",
    { type: "array", items: {} },
    [],
  ],
  [
    "d6 (brace-rooted arm under a hoist)",
    "{a: array<{m: integer}>}",
    { $ref: `#/$defs/${A_ARRAY_INLINE_INLINE}` },
    [A_ARRAY_INLINE_INLINE],
  ],
  // d1 / d2 / d3 are bug-0164-MOVED rows: `lowerTypeExpr`'s generic-ARGUMENT
  // recursion consults the literal sublanguage since bug 0164 §Fix (v0.123.0),
  // so an argument the recogniser accepts WHOLE lowers its step-3 emission
  // inside schema-subset.md:77's `items` — :80's
  // `{"type":"string","enum":[…]}` for the string-literal union, the bare
  // `{"enum":[…]}` for the number-literal one — and d3's mint moves with those
  // bytes. Before that fix each argument arm was the permissive `{}` from the
  // trailing catch-all, which is the MECHANISM this family's comment described
  // and the mechanism that fix removed. Their SILENCE — bug 0059 §Fix
  // constraint 3's claim, that grammar-admitted traffic reaching the catch-all
  // draws no `params-type-not-expression` — is unchanged and is still the whole
  // reason these rows exist; only the pinned bytes and slug moved, under bug
  // 0164 §Fix's authority.
  //
  // d7 / d8 are bug-0184-MOVED rows: the literal ARM of a MIXED union lowers
  // schema-subset.md:79's `{ "const": <value> }` because bug 0184 §Fix routes
  // `lowerTypeExpr`'s per-arm recursion through the literal sublanguage. Before
  // that fix each arm was the permissive `{}` from the trailing catch-all. Their
  // SILENCE — bug 0059 §Fix constraint 3's claim, that grammar-admitted traffic
  // reaching the catch-all draws no `params-type-not-expression` — is unchanged
  // and is what these two rows are here for; only the pinned bytes moved, under
  // bug 0184 §Fix's authority.
  [
    "d7 (mixed union, literal arm first)",
    '"x" | integer',
    { anyOf: [{ const: "x" }, { type: "integer" }] },
    [],
  ],
  [
    "d8 (mixed union, literal arm last)",
    'string | "x"',
    { anyOf: [{ type: "string" }, { const: "x" }] },
    [],
  ],
  ["d9 (unbalanced generic arguments)", "array<{x: integer, y: string}>", {}, []],
  // d10 is held OUT of this loop — bug 0244 (operator adjudication) supersedes
  // its "authorized under-refusal" for this ONE row (see the standalone `it`
  // below): `junk`'s lone entry is keyless, so it now draws a refusal, where
  // this loop asserts `[]` uniformly.
  ["d11 (authorized under-refusal, unterminated brace)", "{a: string", {}, []],
  [
    "d13 (authorized under-refusal, brace-carrying generic argument holding junk)",
    "array<{a: ???}>",
    { type: "array", items: {} },
    [],
  ],
];

describe("bug 0059 (d) — grammar-admitted catch-all traffic and the brace under-refusal", () => {
  for (const [label, typeSource, fragment, defsKeys] of DECLINED_ROWS) {
    it(`GREEN (${label}): \`${typeSource}\` stays silent and keeps its bytes`, () => {
      const doc = paramsDoc(typeSource);
      expect(
        diagLines(doc),
        `${label}: a refusal reaching this row refuses input the grammar admits at all four ` +
          `positions — the failure mode bug 0041's §Fix disqualified its own lowering point for`,
      ).toEqual([]);
      expect(
        fragmentAtP(label, doc),
        `${label}: the lowered bytes at the field. The table is the source of truth for these ` +
          `bytes; rows \`d1\`, \`d2\` and \`d3\` were re-derived under bug 0164 §Fix (a literal ` +
          `GENERIC ARGUMENT lowers its step-3 emission inside schema-subset.md:77's \`items\`, ` +
          `not the permissive \`{}\`), rows \`d7\` and \`d8\` under bug 0184 §Fix (a literal ARM ` +
          `of a MIXED union lowers schema-subset.md:79's \`const\`), and every other row's are ` +
          `bug 0059 §Fix constraint 3's own. WHAT THIS CELL IS FOR IS THE SILENCE ASSERTED ` +
          `ABOVE, which no report moved`,
      ).toEqual(fragment);
      expect(
        Object.keys(defsOf(label, doc)),
        `${label}: the minted \`$defs\` names, hashed from the lowered fragment ` +
          `(schema-subset.md:73/:98)`,
      ).toEqual(defsKeys);
    });
  }

  it("RED (d10, bug 0244 supersedes the authorized under-refusal): `{junk}` now draws bug 0244's refusal", () => {
    // `{junk}`'s brace-rooted text reaches `isUnspellableTextRefusable`'s
    // decline whole and silent — the "authorized under-refusal" this file's own
    // header records (operator grant), and the reason this cell reports `[]` at
    // HEAD `537c274c`. Bug 0244 (operator adjudication) supersedes that grant
    // for exactly this shape, so the flip observed under this change is an
    // ADDED refusal: `junk` is a
    // KEYLESS inline-object entry (no top-level `:`, no stray close token)
    // reached at a `Type` position through the same recursive parse, so
    // `TypeParser.parseObject` refuses it before the catch-all's own silence is
    // reached. The LOWERED bytes are unmoved — the document is refused, but the
    // direct `lowerTypeExpr` bytes this loop's other rows assert are a separate
    // observable this row keeps too.
    const label = "d10 (authorized under-refusal, brace-rooted junk)";
    const doc = paramsDoc("{junk}");
    expect(
      diagLines(doc),
      `${label}: bug 0244 refuses the keyless entry \`junk\`; a red reporting \`[]\` is a route ` +
        `that lost that refusal`,
    ).toEqual([
      "error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: " +
        "Type' or 'name as \"WireName\": Type'",
    ]);
    // The document as a whole is now refused (an error-severity diagnostic
    // stands), so the frontmatter gate withholds `params.loweredSchema`
    // entirely (§Non-goals, "a refusal added here refuses the document before
    // its bytes matter") — there is no fragment left at the field for
    // `fragmentAtP` to read, unlike this loop's other rows.
    expect(
      doc.frontmatter?.params?.loweredSchema,
      `${label}: bug 0244 refuses the whole document, so no \`params:\` fragment reaches the ` +
        `frontmatter at all`,
    ).toBeUndefined();
  });

  it("MOVED (d5, bug 0097 §Fix): `string | {a: string}` stays silent, and its brace arm hoists", () => {
    // Held OUT of the invariance loop above because this row's BYTES are the
    // ones bug 0097 §Fix moves, while its silence is unchanged: the text is
    // still one this recogniser must decline, and it still draws no diagnostic.
    // `lowerBraceGroupUnionArms` (src/parser/params.ts) hoists the brace arm on
    // its own terms, so the arm lands under the name every other type position
    // mints for `{a: string}` rather than on `lowerTypeExpr`'s catch-all.
    // Group (a)'s a25 is the diagnostic half of the same route.
    const doc = paramsDoc("string | {a: string}");
    expect(
      diagLines(doc),
      "d5: a refusal reaching this row refuses input the grammar admits at all four " +
        "positions — the failure mode bug 0041's §Fix disqualified its own lowering point for",
    ).toEqual([]);
    expect(fragmentAtP("d5", doc), "d5: the lowered bytes at the field").toEqual({
      anyOf: [{ type: "string" }, { $ref: `#/$defs/${A_STRING_INLINE}` }],
    });
    expect(
      Object.keys(defsOf("d5", doc)),
      "d5: the minted `$defs` names, hashed from the lowered fragment " +
        "(schema-subset.md:73/:98)",
    ).toEqual([A_STRING_INLINE]);
    expect(
      defsOf("d5", doc)[A_STRING_INLINE],
      "d5: the `$ref` and the mint must agree, or the enclosing `$defs` closure dangles",
    ).toEqual(A_STRING_FRAGMENT);
  });

  it(`GREEN (d3-body): \`{m: array<"x" | "y">}\` hoists the fragment its slug names`, () => {
    // The `$ref` and the mint must agree, or the enclosing `$defs` closure
    // dangles. Asserting the body as well as the name is what makes the slug
    // oracle a check on the lowering rather than on itself.
    const doc = paramsDoc('{m: array<"x" | "y">}');
    expect(
      defsOf("d3-body", doc)[M_ARRAY_XY_INLINE],
      `d3-body: re-derived under bug 0164 §Fix (v0.123.0) — the hoisted \`m\` carries the ` +
        `generic argument's step-3 emission inside schema-subset.md:77's \`items\`, so the mint ` +
        `(a function of the LOWERED fragment, :73/:98) moves with it. The cell's subject is ` +
        `unchanged: the \`$ref\` and the mint must agree or the enclosing \`$defs\` closure ` +
        `dangles; observed \`$defs\` keys ${JSON.stringify(Object.keys(defsOf("d3-body", doc)))}`,
    ).toEqual(M_ARRAY_XY_FRAGMENT);
  });

  it("GREEN (d6-body): `{a: array<{m: integer}>}` hoists the fragment its slug names", () => {
    const doc = paramsDoc("{a: array<{m: integer}>}");
    expect(defsOf("d6-body", doc)[A_ARRAY_INLINE_INLINE]).toEqual(A_ARRAY_INLINE_FRAGMENT);
  });
});

// ===========================================================================
// (e) CONSTRAINTS 5 AND 6 — the controls, pinned byte-for-byte. GREEN at HEAD.
// ===========================================================================

/** Each control's `params:` block, the fragment at `properties.p`, and its `$defs` keys. */
const CONTROL_ROWS: ReadonlyArray<
  readonly [string, string, unknown, readonly string[]]
> = [
  ["e1 (primitive)", "  p: string", { type: "string" }, []],
  [
    "e2 (generic over a primitive)",
    "  p: array<string>",
    { type: "array", items: { type: "string" } },
    [],
  ],
  ["e3 (bare named type)", "  p: Triage", { $ref: "#/$defs/Triage" }, ["Triage"]],
  [
    "e4 (quoted named type — same bytes, same lowering)",
    '  p: "Triage"',
    { $ref: "#/$defs/Triage" },
    ["Triage"],
  ],
  [
    "e5 (inline object type)",
    "  p: {a: Triage}",
    { $ref: `#/$defs/${A_TRIAGE_INLINE}` },
    ["Triage", A_TRIAGE_INLINE],
  ],
  ["e6 (boolean literal)", "  p: true", { const: true }, []],
  ["e7 (string literal)", "  p: '\"hello\"'", { const: "hello" }, []],
  ["e8 (number literal)", "  p: 42", { const: 42 }, []],
  ["e9 (string-literal union)", "  p: '\"x\" | \"y\"'", { type: "string", enum: ["x", "y"] }, []],
  ["e10 (value-less key — the null scalar)", "  p:", { const: null }, []],
];

describe("bug 0059 (e) — the controls do not move", () => {
  for (const [label, paramsBlock, fragment, defsKeys] of CONTROL_ROWS) {
    it(`GREEN (${label}): loads silently and keeps its emission`, () => {
      const doc = parseDoc(src(paramsBlock), "bug0059.theta");
      expect(diagLines(doc), `${label}: a control that reds here is over-refusal`).toEqual([]);
      expect(fragmentAtP(label, doc), `${label}: schema-subset.md:74–:81's emission`).toEqual(
        fragment,
      );
      expect(
        Object.keys(defsOf(label, doc)),
        `${label}: the \`$defs\` keys the control mints`,
      ).toEqual(defsKeys);
    });
  }

  it("GREEN (e5-body): the inline object type hoists the fragment its slug names", () => {
    const doc = parseDoc(src("  p: {a: Triage}"), "bug0059.theta");
    const defs = defsOf("e5-body", doc);
    expect(defs["Triage"], "the resolved named type registers under its own name").toEqual(
      TRIAGE_DEF,
    );
    expect(defs[A_TRIAGE_INLINE], "the hoisted inline fragment the `$ref` names").toEqual(
      A_TRIAGE_FRAGMENT,
    );
  });

  /**
   * Constraint 6: identifier-shaped junk keeps its current disposition. Whether
   * `theta/parse/unresolved-named-type` is the right code for these texts is
   * bug 0044's question for keyword-shaped text and bug 0051's for a lowercase
   * name; neither moves here.
   */
  const UNRESOLVED_ROWS: ReadonlyArray<readonly [string, string, string]> = [
    ["e11 (unresolved name inside a generic)", "array<Ghost>", "Ghost"],
    ["e12 (lowercase identifier-shaped junk)", "nonsense", "nonsense"],
  ];

  for (const [label, typeSource, name] of UNRESOLVED_ROWS) {
    it(`GREEN (${label}): \`${typeSource}\` keeps its single unresolved-named-type`, () => {
      const doc = paramsDoc(typeSource);
      expect(
        diagLines(doc),
        `${label}: the identifier arm already refuses this text; the type-text refusal must not ` +
          `join or replace it`,
      ).toEqual([`error theta/parse/unresolved-named-type: ${unresolvedMessage(name)}`]);
    });
  }
});

// ===========================================================================
// (f) THE GUARD EXTENSION — when a field's TYPE half draws the text refusal,
// the default-side literal checks for that field are suppressed, so the
// refusal survives ALONE. RED at HEAD for the subject row.
// ===========================================================================

describe("bug 0059 (f) — the type-half refusal survives alone", () => {
  it("RED (f1): `pick one = or two` is refused for its type half, at a count of one", () => {
    // `splitParamValue` (src/parser/frontmatter.ts:777) cuts at the first
    // top-level `=`, so this text is judged today only on its default half and
    // draws `theta/parse/default-not-literal`. Its TYPE half — `pick one` — is
    // the subject of this report, and the ordering the frontmatter seam already
    // states applies: the field is reported for what its right-hand side is,
    // "not by whatever the lowering makes of its recovered bytes". THE COUNT
    // MUST STAY ONE: a fix that emits both leaves the author two diagnostics
    // for one mistake.
    expectTextRefused("f1", paramsDoc("pick one = or two"), "p");
  });

  it("GREEN (f2): a VALID type half with junk on the default keeps its default-side refusal alone", () => {
    // The suppression is one-directional: it fires only when the type half is
    // itself refused. Here the type half is a primitive, so nothing about the
    // default-side check changes.
    const doc = paramsDoc("string = totally junk");
    expect(
      diagLines(doc),
      "f2: the type half is `string`, so no text refusal is available to suppress the " +
        "default-side check",
    ).toEqual([
      `error theta/parse/default-not-literal: ${registryMessageOf(
        "theta/parse/default-not-literal",
      ).replace("<expr>", "totally")}`,
    ]);
  });

  it("GREEN (f3): a literal-union type with an out-of-set default stays silent at load", () => {
    // Pinned AS-IS, deliberately. Whether a `params:` default is checked
    // against its declared type at load is bug 0163's gap
    // (docs/bugs/0163-params-default-type-compat-unchecked-at-load.md); this
    // fix must not pre-empt it, and this row is what makes an accidental
    // pre-emption visible.
    const doc = paramsDoc('"x" | "y" = "zzz"');
    expect(diagLines(doc), "f3: bug 0163 owns this gap").toEqual([]);
    expect(fragmentAtP("f3", doc), "f3: the declared literal union still lowers its enum").toEqual({
      type: "string",
      enum: ["x", "y"],
    });
  });
});

// ===========================================================================
// (g) THE LAST-RESORT GUARD — a field that already drew an error-severity
// diagnostic in the same loop iteration keeps that diagnostic and does not
// also draw the text refusal. GREEN at HEAD and required to stay green.
// ===========================================================================

/**
 * Each text that is already refused by a rule of its own, with the whole
 * diagnostic list it produces at HEAD. Every row is a count-of-one cell: a fix
 * that adds the text refusal on top turns one report into two.
 */
const GUARDED_ROWS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  [
    "g1 (truncated generic)",
    "array<",
    [
      `error theta/parse/generic-arity-mismatch: ${registryMessageOf(
        "theta/parse/generic-arity-mismatch",
      )
        .replace("<ctor>", "array")
        .replace("<expected>", "1")
        .replace("<actual>", "0")}`,
    ],
  ],
  [
    "g2 (unresolved name beside a junk union arm)",
    "Ghost | a: Tirage",
    [`error theta/parse/unresolved-named-type: ${unresolvedMessage("Ghost")}`],
  ],
  [
    "g3 (empty inline object)",
    "{}",
    [
      `error theta/parse/empty-schema-body: ${registryMessageOf(
        "theta/parse/empty-schema-body",
      ).replace("<X>", "{}")}`,
    ],
  ],
  [
    "g4 (`Result` in a lowered-schema position)",
    "Result<string, integer>",
    [
      `error theta/parse/result-in-schema-position: ${registryMessageOf(
        "theta/parse/result-in-schema-position",
      )}`,
    ],
  ],
  [
    "g5 (`void` outside a return position)",
    "void",
    [
      `error theta/parse/void-in-non-return-position: ${registryMessageOf(
        "theta/parse/void-in-non-return-position",
      )}`,
    ],
  ],
];

describe("bug 0059 (g) — a field already refused keeps exactly its own diagnostic", () => {
  for (const [label, typeSource, expected] of GUARDED_ROWS) {
    it(`GREEN (${label}): \`${typeSource}\` stays at one diagnostic`, () => {
      expect(
        diagLines(paramsDoc(typeSource)),
        `${label}: the field already has its own registered refusal, so the text refusal must ` +
          `not join it — one mistake, one report`,
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (h) GOV-15 — the measured blast radius over the committed corpus.
//
// SCOPE. The zero-load/parse-diagnostics half of this claim for committed
// `.theta` files is already `tests/committed-fixture-parse-gate.test.ts`'s and
// is NOT duplicated here. What that gate does not reach is asserted here: the
// committed `.thetalib` files (its walk collects `.theta` only) and the census
// property itself — that no committed file declares a `params:` field whose
// lowered fragment is the permissive `{}`, which is what makes this fix's
// newly-refused input set empty over the shipped corpus.
// ===========================================================================

/** Build and vendor trees the census never descends into. */
const CENSUS_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

/**
 * The seeded-invalid fixture, which is malformed on purpose and belongs to the
 * H7b gate's own red-path assertion rather than to the shipped corpus.
 */
const SEEDED_INVALID = "tests/fixtures/h7b-invalid/malformed.theta";

/** Every committed `.theta` / `.thetalib`, as repo-relative POSIX paths. */
function walkCorpus(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (CENSUS_SKIP_DIRS.has(entry.name)) continue;
      walkCorpus(join(dir, entry.name), acc);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".theta") || entry.name.endsWith(".thetalib"))
    ) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

const REPO_ROOT = process.cwd();

const CORPUS = walkCorpus(REPO_ROOT, [])
  .map((p) => p.slice(REPO_ROOT.length + 1).split(sep).join(posix.sep))
  .sort()
  .filter((p) => p !== SEEDED_INVALID);

describe("bug 0059 (h) — no committed file changes disposition", () => {
  it("GREEN (h1): the census walk finds the shipped corpus", () => {
    // Anti-vacuity. A walk that finds nothing would green h2 and h3 while
    // verifying nothing at all.
    if (CORPUS.length === 0) {
      throw new Error(
        `the census walk found no \`.theta\` / \`.thetalib\` under ${REPO_ROOT}, so the ` +
          `blast-radius measurement below is vacuous`,
      );
    }
    expect(CORPUS, "the documented examples are part of the measured corpus").toContain(
      "docs/examples/typed-params-across-boundary.theta",
    );
    expect(CORPUS, "the committed `.thetalib` half the H7b gate's walk does not reach").toContain(
      "docs/examples/personas.thetalib",
    );
    expect(CORPUS, "the seeded-invalid fixture is never part of the shipped set").not.toContain(
      SEEDED_INVALID,
    );
  });

  it("GREEN (h2): every committed `.thetalib` loads with zero diagnostics", () => {
    // `tests/committed-fixture-parse-gate.test.ts` walks `.theta` only, so the
    // `.thetalib` half of GOV-15's "a `.theta` or `.thetalib` file that loads
    // cleanly … is expected to load under every theta 1.x release"
    // (source-language-stability.md:5) has no gate. This is that half.
    const libs = CORPUS.filter((p) => p.endsWith(".thetalib"));
    if (libs.length === 0) {
      throw new Error("the census walk found no committed `.thetalib`, so h2 verifies nothing");
    }
    for (const lib of libs) {
      const doc = parseDoc(readFileSync(join(REPO_ROOT, lib), "utf8"), lib);
      expect(diagLines(doc), `${lib}: a committed library must keep loading cleanly`).toEqual([]);
    }
  });

  it("GREEN (h3): no committed file declares a `params:` field that lowers permissively", () => {
    // The measured blast radius. §Fix constraint 8 requires this census to be
    // re-derived at the fix baseline rather than assumed; re-derived here at
    // HEAD 948b7814 it is 34 shipped files, 17 declaring a lowered `params:`
    // block, and ZERO permissive fragments — so the newly-refused input set is
    // empty over the corpus and no committed file changes disposition.
    const permissive: string[] = [];
    let declaring = 0;
    for (const relPath of CORPUS) {
      const doc = parseDoc(readFileSync(join(REPO_ROOT, relPath), "utf8"), relPath);
      const document = loweredParams(doc);
      if (document === undefined) continue;
      declaring += 1;
      const properties = (document["properties"] ?? {}) as Record<string, unknown>;
      for (const [name, fragment] of Object.entries(properties)) {
        if (JSON.stringify(fragment) === "{}") {
          permissive.push(`${relPath}#${name}`);
        }
      }
    }
    expect(
      declaring,
      "the count of committed files declaring a lowered `params:` block; a drop below the " +
        "measured baseline means the census covers less than it was derived over",
    ).toBeGreaterThanOrEqual(17);
    expect(
      permissive,
      "a committed field lowering the permissive `{}` would be a file this fix stops loading, " +
        "which GOV-15's diagnostic-registry carve-out covers only after it is measured",
    ).toEqual([]);
  });
});
