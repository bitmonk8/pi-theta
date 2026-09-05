import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { lowerParamsFieldType, lowerTypeExpr, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0040 — nothing reserves the synthesised `__inline_<slug>` `$defs` name
// against author names, so an IMPORTED binding whose local name equals a minted
// inline-object slug replaces or aliases the hoisted fragment in both field
// orders: the declared `params:` shape stops constraining the argument and no
// diagnostic fires
// (docs/bugs/0040-inline-slug-def-namespace-not-reserved.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:73 — Lowering Algorithm step 2: an
//     anonymous inline object schema hoists into `$defs` under `__inline_<slug>`,
//     `<slug>` being the schema slug of the LOWERED fragment.
//   - :76 — step 3: a named or inline schema reference emits
//     `{"$ref": "#/$defs/<Name>"}`, which is what makes `$defs` ONE flat table
//     holding both author names and synthesised ones.
//   - :92–:107 — §Canonical schema hash: canonical form (code-point-sorted keys,
//     no insignificant whitespace), SHA-256, first 16 hex characters LOWERCASED.
//     The 16-lowercase-hex shape is what fixes the reserved forms exactly.
//   - :108 — §Synthesised names, "the source of truth for the full set": the four
//     forms `__inline_<slug>`, `__theta_respond_<slug>`, `__theta_bind_<slug>`,
//     `__theta_callee_<slug>__<post-rename-name>`. The reserved set this file
//     pins is EXACTLY those four, no bare-prefix widening (group (f)).
//   - :112 — §Schema-slug collision posture: a slug-keyed table verifies
//     byte-equality on a match and "surfaces a diagnostic and disambiguates …
//     rather than silently aliasing two distinct fragments", storing the
//     canonical bytes alongside the keyed artefact. An author-written entry has
//     no such bytes, which is why the mint path's check cannot fire for it.
//   - docs/spec_topics/lexical.md:13 — §Identifiers: `[A-Za-z_][A-Za-z0-9_]*`,
//     first-letter case enforced for `schema` / `enum` names and lowercase-first
//     bindings, and (`:18`) "The casing rule and the import-specifier
//     synthesised-name reservation are the only enforced naming constraints".
//     The casing half closes the `schema __inline_<16hex>` spelling (fixture E,
//     group (d)) and closes NOTHING at the import specifier's local binding —
//     the one name-introducing position the `params:` type universe reads that
//     admits a leading `_`, and the position the reservation half covers.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 — a `params:`
//     `NamedType` resolves against body declarations AND imported `.thetalib`
//     symbols, which is how the import binding reaches the `$defs` table.
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix Half A, settled — the route this
// file encodes; RED now, GREEN after):
//   1. A registered parse-phase diagnostic
//      `theta/parse/import-reserved-synthesised-name` (severity error, phase
//      parse) is raised at the import / `export … from` specifier's LOCAL
//      binding — the `as` alias where present, else the source name — when that
//      binding matches one of the four §Synthesised names forms with a slug of
//      EXACTLY 16 lowercase hex characters. Raised at PARSE time, so
//      `parseThetaDocument` alone witnesses it with no `.thetalib` resolution.
//   2. `lowerTypeExpr`'s IDENTIFIER arm (`src/parser/params.ts`), the
//      unconditional `lowerCtx.defs[s] = resolved;`, must not write a
//      reserved-form key: it returns the permissive `{}` and raises nothing of
//      its own, so the two `$defs` writers agree on key ownership (bug doc §Fix,
//      "the two writers of `lowerCtx.defs` must agree on key ownership") and
//      fixture E keeps its SINGLE diagnostic.
//
// PROBED CURRENT SIGNATURES (HEAD 4361d42a / 0.49.0, offline, deterministic;
// re-derived from the bug doc's §Reproduction table with zero drift). `D` is
// `__inline_e39f064476c952aa`, the slug of `{q: boolean}`'s lowered fragment:
//   A  p: {q: boolean}                    diags []  $defs.D = the `{q: boolean}`
//                                         fragment; {p:7} REJECTED
//   B  p: {q: boolean} then n: D          diags []  $defs.D = {}  {p:7,n:1} ACCEPTED
//   C  n: D then p: {q: boolean}          diags []  $defs.D = {}  {p:7,n:1} ACCEPTED
//   D  import { Zed as D }, n: D, p: {…}  diags []  $defs.D = {}
//   E  schema D { zzz: string }           ONE error schema-case-mismatch;
//                                         $defs.D = the AUTHOR's {zzz: string}
//   d  import { D } + schema S { f: {q: boolean} }
//        d0 s: S            diags []  S.f refs the minted fragment; {s:{f:7}} REJECTED
//        d1 n: D then s: S  diags []  $defs.D = {}; {n:1,s:{f:7}} ACCEPTED
//        d2 s: S then n: D  diags []  $defs.D = {}; {n:1,s:{f:7}} ACCEPTED
//   G  lowerTypeExpr("D", ctx) with D resolvable  writes defs.D, returns the $ref
//   H  mint {q: boolean} then lower "D"           the mint is OVERWRITTEN
//
// WHAT IS RED HERE AND WHY: (a) the registry row does not exist; (c) B / C / D
// raise nothing and alias the fragment to the imported `{}`; (d)'s second claim
// (the author fragment still takes the slug key); (e)'s d1 / d2 (the aliasing
// reaches a `schema` body field through `hoistNestedDefs`' name-keyed first-wins
// lift — 0039 §Fix residual (iv) composing with this bug); (f)'s refuse half;
// (g)'s two ownership claims. GREEN BY DESIGN and required to stay green:
// (b) the whole control, (d)'s single-diagnostic claim, (e)'s d0, (f)'s legal
// half, (g)'s non-reserved control, (h) the whole group. Those are the fences
// that stop the fix from widening the refusal beyond the exact forms,
// double-reporting on fixture E, disturbing the no-collision lowering, or
// buying the key-ownership guard by suppressing an EXISTING refusal.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// `parseThetaDocument` over a string (`parseDoc`, tests/helpers/e2e-s1.ts — the
// shipped front end wrapped in the standard inert deps double), one real
// `AjvSchemaValidator` compile of the document that parse produces, and two
// direct calls at the exported `lowerTypeExpr` / `lowerParamsFieldType` seam. An
// integration tier would add a round trip to a parse-time observable and still
// could not assert a `$defs` key or a diagnostic's ABSENCE (groups (b), (d),
// (f)); a live tier would add a provider to a decision no model participates in.
// The registration consequence (bug doc fixture F) is reached by asserting the
// two properties the shipped drop gate reads — error severity and the
// `theta/parse/` namespace (src/extension/production-composition.ts:1894–1901) —
// rather than by re-driving discovery, which witnesses no additional behaviour.
//
// THE SLUG ORACLE IS INDEPENDENT. `schemaSlug` (src/parser/schema-lowering.ts) is
// deliberately NOT imported: an oracle taken from the implementation under test
// proves nothing. `SLUG` below is derived from a HAND-WRITTEN canonical form via
// `node:crypto` and cross-checked in group (b) against both the bug doc's
// recorded value and the name the production lowering actually mints.
//
// NO SILENT SKIPPING: every helper that cannot find what it needs THROWS with
// the document's diagnostics rendered. A refused parse, an absent `params:`
// block or an absent lowered schema can never read as a pass.

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/parse/import-reserved-synthesised-name";

/**
 * The normative *Message* template the fix must land in the registry. It is
 * written literally HERE ONCE — group (a) asserts the registry row equals it —
 * and every other expected message in this file is derived from the REGISTRY
 * READ, never from this constant, so DIAG-4's "the Message column is normative"
 * is enforced rather than restated.
 */
const EXPECTED_TEMPLATE = "imported symbol '<name>' binds a reserved synthesised name";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
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
 * The row's normative *Message* template with its single `<name>` placeholder
 * filled by the LOCAL binding (DIAG-4). Definedness is asserted first so a
 * missing row reds by naming the registry page, never by a bare `undefined`
 * comparison.
 */
function reservedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
      `Message row for ${CODE}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}

// ===========================================================================
// The independent slug oracle (§Canonical schema hash steps 2–4).
// ===========================================================================

/** The lowered fragment of the inline object type `{q: boolean}` (step 3). */
const Q_FRAGMENT = {
  type: "object",
  properties: { q: { type: "boolean" } },
  required: ["q"],
  additionalProperties: false,
};

/**
 * `Q_FRAGMENT`'s hand-written canonical form: keys sorted by Unicode code point
 * — `additionalProperties` < `properties` < `required` < `type` — and no
 * insignificant whitespace (:99–:101).
 */
const Q_CANONICAL =
  '{"additionalProperties":false,"properties":{"q":{"type":"boolean"}},"required":["q"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 hex characters, lowercased. */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

const SLUG = slugOfCanonicalForm(Q_CANONICAL);

/** The synthesised `$defs` key an author name must not be able to occupy. */
const RESERVED = `__inline_${SLUG}`;

/** The `$ref` every reference to that key emits (:76). */
const RESERVED_REF = { $ref: `#/$defs/${RESERVED}` };

/**
 * The stand-in AUTHOR fragment — what `schema D { zzz: string }` lowers to, and
 * what an author-name writer would put under the reserved key.
 */
const ZZZ_FRAGMENT = {
  type: "object",
  properties: { zzz: { type: "string" } },
  required: ["zzz"],
  additionalProperties: false,
};

// ===========================================================================
// Fixture sources. `mode: prompt` plus one `params:` block and one body, exactly
// as the bug doc's §Reproduction table and the HEAD re-derivation build them.
// The `./lib.thetalib` path is never resolved by `parseThetaDocument` (import
// resolution is the load pass), so no sibling file is needed.
// ===========================================================================

function src(paramsBlock: string, body: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${body}`;
}

/** A body importing `name` directly, plus an inert statement. */
function bodyImport(name: string): string {
  return `import { ${name} } from "./lib.thetalib"\nlet x = 1\n`;
}

/** A body importing `source` under the `as` alias `local`. */
function bodyImportAlias(source: string, local: string): string {
  return `import { ${source} as ${local} } from "./lib.thetalib"\nlet x = 1\n`;
}

// ===========================================================================
// Reading a parsed document. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The lowered `params:` document plus its two sub-records. */
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Read a parsed document's lowered `params:` schema back.
 *
 * Diagnostics are NOT asserted here: three groups in this file read the lowered
 * document of a theta that carries exactly one diagnostic (fixture E now, and
 * B / C / D / d1 / d2 after the fix, whose new diagnostic comes from the body's
 * import statement and so does not withhold the `params:` lowering the way a
 * `params:`-owned error does). Every absent intermediate THROWS with the
 * diagnostics rendered, so a refused parse cannot read as a pass.
 */
function lowered(label: string, doc: ThetaDocument): LoadedParams {
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const schema = params.loweredSchema;
  if (schema === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document at the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = schema["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(schema)}`,
    );
  }
  return {
    properties: properties as Record<string, unknown>,
    required: (schema["required"] ?? []) as readonly string[],
    defs: (schema["$defs"] ?? {}) as Record<string, unknown>,
    loweredSchema: schema,
  };
}

/** Parse a fixture and read its lowered `params:` document in one step. */
function loadLowered(label: string, source: string): LoadedParams {
  return lowered(label, parseDoc(source, "bug0040.theta"));
}

/** A real `AjvSchemaValidator` plus the diagnostics it emitted. */
function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
    emitted,
  };
}

/** Whether a candidate argument object validates against a lowered document. */
function accepts(schema: LoweredSchema, value: unknown): boolean {
  return ajv().validator.compile(schema).validate(value).ok;
}

// ===========================================================================
// The located-site assertion: the diagnostic must point at the LOCAL binding.
// ===========================================================================

/** A 1-indexed half-open span of a name on one source line. */
interface BindingSite {
  readonly line: number;
  readonly column: number;
  readonly endColumn: number;
}

/**
 * The span of the local binding `name` on the fixture's `import` line.
 *
 * The local binding is the `as` alias where present, else the source name
 * (`ImportSpecifier.local`, src/parser/imports.ts:554) — searching the import
 * LINE rather than the whole source is what keeps the aliased spelling
 * (fixture D) pointing at the alias and not at a `params:` occurrence of the
 * same text.
 */
function importBindingSite(source: string, name: string): BindingSite {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith("import ") && !line.startsWith("export ")) {
      continue;
    }
    const index = line.indexOf(name);
    if (index < 0) {
      continue;
    }
    return { line: i + 1, column: index + 1, endColumn: index + 1 + name.length };
  }
  throw new Error(
    `no import/export line binding '${name}' in fixture source ${JSON.stringify(source)}`,
  );
}

/**
 * The diagnostic's range must COVER the local binding's span.
 *
 * Coverage rather than equality: the fix may locate at the alias token alone or
 * at the whole `Source as Local` specifier span (`ImportSpecifier.range`,
 * built by `spanRange` in `parseImportExport`), and both satisfy the bug doc's
 * §Fix obligation that "the check must run at the import specifier's local
 * binding". Token ranges are half-open (`end` exclusive, diagnostic.ts:22).
 */
function expectRangeCoversBinding(
  diagnostic: Diagnostic,
  source: string,
  name: string,
  why: string,
): void {
  const site = importBindingSite(source, name);
  const range = diagnostic.range;
  if (range === undefined) {
    throw new Error(
      `${why}: a \`theta/parse/*\` row is a LOCATED site (diagnostics/diagnostic-shape.md:45), so the diagnostic must carry a range; observed ${JSON.stringify(diagnostic)}`,
    );
  }
  const startsAtOrBefore =
    range.start.line < site.line ||
    (range.start.line === site.line && range.start.column <= site.column);
  const endsAtOrAfter =
    range.end.line > site.line ||
    (range.end.line === site.line && range.end.column >= site.endColumn);
  expect(
    startsAtOrBefore && endsAtOrAfter,
    `${why}: the range must cover the local binding '${name}' at line ${site.line}, columns ${site.column}–${site.endColumn}; observed ${JSON.stringify(range)}`,
  ).toBe(true);
}

/**
 * The refusal contract shared by every colliding fixture: EXACTLY ONE
 * diagnostic, the registered code at error severity, its message the registry's
 * with `<name>` rendered as the LOCAL binding, and its range over that binding.
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * symptom the bug reports — zero diagnostics for source that silently loses its
 * declared shape — rather than a downstream message mismatch.
 */
function expectReservedRefusal(
  label: string,
  source: string,
  binding: string,
  doc: ThetaDocument,
): void {
  expect(
    diagCodes(doc),
    `${label}: bug 0040 §Expected — schema-subset.md:112 requires the site to surface "a diagnostic and disambiguate … rather than silently aliasing two distinct fragments"; the reservation rule (§Fix Half A) delivers that at the declaring position, so this fixture must raise EXACTLY ONE error-severity ${CODE}. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${CODE}`]);
  const diagnostic = doc.diagnostics[0] as Diagnostic;
  // WHY these two properties and not registration itself: `hasLoadParseError`
  // (src/extension/production-composition.ts:1894–1901) drops a theta from
  // registration exactly when some diagnostic has `severity === "error"` and a
  // code starting `theta/load/` or `theta/parse/`. Asserting both here is the
  // reachability link to the bug doc's fixture F — it is what turns the new
  // diagnostic into a file that does not register, which is the disposition
  // fixture E already has and B / C / D do not.
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the aliasing theta registered`,
  ).toBe("error");
  expect(
    diagnostic.code.startsWith("theta/parse/"),
    `${label}: the drop gate reads the \`theta/load/\` / \`theta/parse/\` namespaces only; observed code ${diagnostic.code}`,
  ).toBe(true);
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's template with \`<name>\` rendered as the LOCAL binding (imports.md §Visibility; \`ImportDecl.symbols\` carries the alias where present, src/parser/theta-document.ts:653–658)`,
  ).toBe(reservedMessage(binding));
  expectRangeCoversBinding(diagnostic, source, binding, label);
}

// ===========================================================================
// (a) THE DIAG-4 REGISTRY ANCHOR.
// RED at HEAD: the row does not exist, so the red names the registry page.
// ===========================================================================

describe("bug 0040 (a) — the reservation code has a registry row", () => {
  it(`RED (a1): code-registry-parse.md carries ${CODE} with the normative Message, severity E, phase parse`, () => {
    // A registry addition is a DIAG-2 operation
    // (diagnostics/diagnostic-shape.md:72), covered within a theta 1.x minor by
    // the GOV-15 diagnostic-registry carve-out
    // (governance/source-language-stability.md:25) for the inputs whose only
    // change is the appearance of the code — which is exactly fixtures B, C, D
    // and the (e) probes.
    const template = registryMessage(REGISTRY, CODE) as string | undefined;
    expect(
      template,
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
        `Message row for ${CODE}`,
    ).toBeDefined();
    expect(
      template,
      "DIAG-4 — the Message column is normative character-for-character; `<name>` is the category-5 source-derived placeholder (placeholder-rendering-b.md:10), rendered as the LOCAL binding",
    ).toBe(EXPECTED_TEMPLATE);
    const row = REGISTRY.find((r) => r.code === CODE) as RegistryRow | undefined;
    expect(row, `the parsed registry must hold a structured row for ${CODE}`).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — the reservation refuses the declaration, and only an error-severity code reaches the registration drop gate (production-composition.ts:1894–1901)",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase parse — the check is a parser-side static check over specifier names, beside `import-name-collision` and `import-unknown-symbol`",
    ).toBe("parse");
  });
});

// ===========================================================================
// (b) CONTROL A — the no-collision lowering, byte-for-byte.
// GREEN at HEAD by design: this is the regression fence. It is what proves the
// defect is the NAME AGREEMENT and not the inline-object hoist itself, and it
// is what reds if a fix widens the refusal to ordinary imports or disturbs the
// mint.
// ===========================================================================

describe("bug 0040 (b) — control A: an unreferenced NON-reserved import leaves the hoist untouched", () => {
  const label = "control A";
  const source = src("  p: {q: boolean}", bodyImport("Zed"));

  it("GREEN (b1): the slug oracle agrees with the bug doc and with what the lowering mints", () => {
    // The oracle is hand-written and hashed with `node:crypto`; `schemaSlug` is
    // not imported. Two independent cross-checks keep it honest: the value the
    // bug doc's §Reproduction records, and the `$defs` key b2 reads back off a
    // real lowering.
    expect(
      JSON.parse(Q_CANONICAL),
      "the hand-written canonical form must parse back to the fragment it hashes",
    ).toEqual(Q_FRAGMENT);
    expect(
      SLUG,
      "§Canonical schema hash step 4 (:107) — first 16 hex characters, lowercased; the bug doc's §Reproduction derives the same value independently",
    ).toBe("e39f064476c952aa");
    expect(RESERVED, "§Synthesised names (:108) — the hoisted key is `__inline_<slug>`").toBe(
      "__inline_e39f064476c952aa",
    );
  });

  it("GREEN (b2): the lowered document is exactly the bug doc's fixture A", () => {
    const doc = parseDoc(source, "bug0040.theta");
    expect(
      diagLines(doc),
      "an ordinary imported symbol is legal input at every position; the reservation must not touch it",
    ).toEqual([]);
    const loaded = lowered(label, doc);
    expect(
      loaded.loweredSchema,
      "schema-subset.md:73/:76 — the inline object hoists under its slug and the field emits the `$ref`; this whole document must survive the fix unchanged",
    ).toEqual({
      type: "object",
      properties: { p: RESERVED_REF },
      required: ["p"],
      additionalProperties: false,
      $defs: { [RESERVED]: Q_FRAGMENT },
    });
  });

  it("GREEN (b3): the declared shape actually constrains the argument", () => {
    // A bounds the defect: the identical inline declaration REJECTS a number
    // when no name collides. Groups (c) and (e) are the same declaration with a
    // name agreeing, and they accept one.
    const loaded = loadLowered(label, source);
    expect(
      accepts(loaded.loweredSchema, { p: 7 }),
      "a non-object argument for an object-declared param",
    ).toBe(false);
    expect(
      accepts(loaded.loweredSchema, { p: { q: true } }),
      "the well-formed argument must still validate, or the fence is meaningless",
    ).toBe(true);
    expect(
      accepts(loaded.loweredSchema, { p: { q: "yes" } }),
      "the field type is enforced through the `$ref` chain",
    ).toBe(false);
  });
});

// ===========================================================================
// (c) FIXTURES B / C / D — the defect, all three spellings.
// RED at HEAD: every fixture produces ZERO diagnostics, `$defs[RESERVED]` is the
// imported `{}`, and `{p: 7, n: 1}` validates.
// ===========================================================================

interface CollidingFixture {
  readonly label: string;
  readonly source: string;
  readonly binding: string;
}

/**
 * The three reachable spellings. B and C differ only in field order — which of
 * the two `$defs` writers runs first — and D swaps the direct import for an
 * `as` alias, so the map key comes from `ImportSpecifier.local` rather than from
 * the source symbol. All three must converge on one disposition (bug doc §Fix:
 * "B / C / D must converge on one disposition that a rule names").
 */
const COLLIDING: readonly CollidingFixture[] = [
  {
    label: "fixture B (inline field first, direct import)",
    source: src(`  p: {q: boolean}\n  n: ${RESERVED}`, bodyImport(RESERVED)),
    binding: RESERVED,
  },
  {
    label: "fixture C (named field first, direct import)",
    source: src(`  n: ${RESERVED}\n  p: {q: boolean}`, bodyImport(RESERVED)),
    binding: RESERVED,
  },
  {
    label: "fixture D (named field first, `as`-aliased import)",
    source: src(`  n: ${RESERVED}\n  p: {q: boolean}`, bodyImportAlias("Zed", RESERVED)),
    binding: RESERVED,
  },
];

describe("bug 0040 (c) — an imported binding in a synthesised-name form is refused", () => {
  for (const fixture of COLLIDING) {
    it(`RED (c-diag, ${fixture.label}): exactly one ${CODE} at the local binding`, () => {
      // At HEAD this fixture is silent at every severity and registers, so the
      // author's only evidence is a param that accepts junk (bug doc §Why it
      // matters).
      expectReservedRefusal(
        fixture.label,
        fixture.source,
        fixture.binding,
        parseDoc(fixture.source, "bug0040.theta"),
      );
    });

    it(`RED (c-defs, ${fixture.label}): the slug key holds the MINTED fragment and the name lowers permissively`, () => {
      const loaded = loadLowered(fixture.label, fixture.source);
      // (ii) The hoisted fragment is the one the inline declaration mints —
      // byte-identical to control (b)'s — not the permissive `{}` every imported
      // symbol resolves to (`collectBodyTypes`,
      // src/parser/theta-document.ts:1209–1213). This is the key-ownership half
      // of the fix: the IDENTIFIER arm no longer writes the key, so the mint
      // survives in both field orders.
      expect(
        loaded.defs[RESERVED],
        `${fixture.label}: schema-subset.md:73 — the \`__inline_<slug>\` entry is the lowered fragment of the inline object that minted it; observed ${JSON.stringify(loaded.defs[RESERVED])}`,
      ).toEqual(Q_FRAGMENT);
      // (iii) The inline field keeps its `$ref`; the reserved NAME no longer
      // resolves to one, because the arm that resolved it returns `{}` without
      // claiming the key.
      expect(
        loaded.properties["p"],
        `${fixture.label}: the inline field's emission is unchanged from control (b)`,
      ).toEqual(RESERVED_REF);
      expect(
        loaded.properties["n"],
        `${fixture.label}: bug doc §Fix — the IDENTIFIER arm returns the permissive \`{}\` for a reserved-form name and raises nothing of its own; observed ${JSON.stringify(loaded.properties["n"])}`,
      ).toEqual({});
    });

    it(`RED (c-ajv, ${fixture.label}): the argument boundary still rejects a non-object`, () => {
      // (iv) The consequence, through the real validator: with the imported `{}`
      // occupying the key, `p` accepts any JSON value — the accept-anything hole
      // bug 0035 closed at this boundary, re-opened whenever the name agrees.
      // Asserted in its own test so the loss of enforcement reds on its own
      // observable rather than behind the `$defs` claim above.
      const loaded = loadLowered(fixture.label, fixture.source);
      expect(
        accepts(loaded.loweredSchema, { p: 7, n: 1 }),
        `${fixture.label}: bug doc §Why it matters — the \`params:\` position is where untrusted input arrives (slash-argument binding, \`invoke(...)\`, tool-call arguments); a number for an object-declared param must be REJECTED`,
      ).toBe(false);
      expect(
        accepts(loaded.loweredSchema, { p: { q: "yes" }, n: 1 }),
        `${fixture.label}: the field type inside the declared shape is enforced through the \`$ref\` chain, exactly as in control (b)`,
      ).toBe(false);
    });
  }

  // USE-INDEPENDENCE. Every fixture above REFERENCES the imported name from a
  // `params:` field, so a regression that resolved the reservation at a USE site
  // — the `params:` `NamedType` resolution, a `schema` body field, a `@<T>`
  // annotation — would keep all of them green. The reservation is a property of
  // the BINDING: `theta/parse/import-reserved-synthesised-name` is raised where
  // the specifier introduces the local name (src/parser/theta-document.ts,
  // `parseImportExport`), before any use resolution exists, which is also what
  // lets a `.thetalib` re-export be refused with no importing use in sight. This
  // is the direct positive fence for that placement, and the ordinary-name
  // control differs from it in the bound token alone.
  const UNREFERENCED_PARAMS = "  p: string";

  it("RED (c-unused): an unreferenced reserved binding is refused, and the ordinary control stays clean", () => {
    const source = src(UNREFERENCED_PARAMS, bodyImport(RESERVED));
    expect(
      source.split(RESERVED).length - 1,
      `the claim is use-INDEPENDENCE, so the reserved name must occur exactly once in the fixture — on the import line, with no \`params:\` field, \`schema\` body or \`@<T>\` annotation naming it. Source: ${JSON.stringify(source)}`,
    ).toBe(1);
    expectReservedRefusal(
      "unreferenced reserved import",
      source,
      RESERVED,
      parseDoc(source, "bug0040.theta"),
    );
    const control = src(UNREFERENCED_PARAMS, bodyImport("Zed"));
    expect(
      diagLines(parseDoc(control, "bug0040.theta")),
      "the control differs in the bound token alone: an unreferenced ORDINARY import is legal input at every position and must stay silent, so the refusal above is the name's shape and not the fact that the import goes unused",
    ).toEqual([]);
  });
});

// ===========================================================================
// (d) FIXTURE E — the `schema`-declaration spelling. The casing rule already
// closes this position (lexical.md:15), so the reservation must not fire a
// SECOND diagnostic here, and must not move E's disposition.
// ===========================================================================

describe("bug 0040 (d) — the `schema`-declaration spelling keeps its single diagnostic", () => {
  const label = "fixture E";
  const source = src(`  n: ${RESERVED}\n  p: {q: boolean}`, `schema ${RESERVED} { zzz: string }\nlet x = 1\n`);

  it("GREEN (d1): exactly one diagnostic, and it is the casing rule's", () => {
    // The fence against double-reporting. `__inline_…` starts with `_`, so the
    // lexer's `"type"` arm (src/lexer/lexer.ts:874) already refuses the
    // declaration and the file does not register — a reservation rule scoped to
    // `schema` / `enum` name positions would close nothing that is open (bug doc
    // §Fix, first obligation), and one that fires here as well would report the
    // same input twice.
    const doc = parseDoc(source, "bug0040.theta");
    expect(
      diagCodes(doc),
      `${label}: bug doc §Fix acceptance set — "E must keep its single diagnostic". Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["error theta/parse/schema-case-mismatch"]);
  });

  it("RED (d2): the slug key holds the MINTED fragment even here, and the author name lowers permissively", () => {
    // The refused document still lowers, and its `$defs` still shows which
    // writer owns the key. At HEAD the author's `{zzz: string}` takes the slug
    // key and BOTH properties point at it, so the inline declaration's shape is
    // gone from a document that was written to carry it. The key-ownership guard
    // is what stops that, independently of whether the file registers.
    const loaded = loadLowered(label, source);
    expect(
      loaded.defs[RESERVED],
      `${label}: the key belongs to the mint — an author declaration cannot take a synthesised name (schema-subset.md:108/:112); observed ${JSON.stringify(loaded.defs[RESERVED])}`,
    ).toEqual(Q_FRAGMENT);
    expect(
      loaded.properties["n"],
      `${label}: the reserved-form name lowers permissively rather than to a \`$ref\` into a fragment it does not own; observed ${JSON.stringify(loaded.properties["n"])}`,
    ).toEqual({});
    expect(
      loaded.properties["p"],
      `${label}: the inline field's emission is unchanged`,
    ).toEqual(RESERVED_REF);
  });
});

// ===========================================================================
// (e) THE COMPOSED HAZARD at the `schema`-body position — 0039 §Fix residual
// (iv) composing with this bug. `hoistNestedDefs` (`src/parser/params.ts`)
// lifts nested `$defs` name-keyed and FIRST-WINS with no byte comparison, and it
// seeds its queue with the TOP-LEVEL entries, so the imported `{}` reaches the
// key before `S`'s own minted closure entry in BOTH field orders.
// RED at HEAD for d1 / d2: zero diagnostics, `$defs[RESERVED]` is `{}`, and
// `{n: 1, s: {f: 7}}` validates — for a `schema S` whose text references no
// import anywhere.
// ===========================================================================

describe("bug 0040 (e) — the aliasing must not reach a `schema` body field's hoisted fragment", () => {
  const BODY = `import { ${RESERVED} } from "./lib.thetalib"\nschema S { f: {q: boolean} }\nlet x = 1\n`;

  /** `schema S { f: {q: boolean} }`'s lowering after the nested lift. */
  const S_FRAGMENT = {
    type: "object",
    properties: { f: RESERVED_REF },
    required: ["f"],
    additionalProperties: false,
  };

  it("GREEN (e-d0, control): with no colliding field, `S.f` refs the minted enforcing fragment", () => {
    // The import is present but unreferenced, so the theta gains the new
    // diagnostic once the fix lands (the check is at the specifier, not at the
    // use). The claim asserted here is therefore the LOWERING, plus the absence
    // of any OTHER diagnostic — which holds in both directions.
    const label = "probe d0";
    const source = src("  s: S", BODY);
    const doc = parseDoc(source, "bug0040.theta");
    expect(
      diagCodes(doc).filter((line) => line !== `error ${CODE}`),
      `${label}: no diagnostic other than the reservation may appear. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
    const loaded = lowered(label, doc);
    expect(
      loaded.defs["S"],
      `${label}: bug 0039 §Fix part B — a \`schema\` body field's inline object hoists too, and \`S.f\` emits the \`$ref\`; observed ${JSON.stringify(loaded.defs["S"])}`,
    ).toEqual(S_FRAGMENT);
    expect(
      loaded.defs[RESERVED],
      `${label}: the lifted closure entry is the minted enforcing fragment; observed ${JSON.stringify(loaded.defs[RESERVED])}`,
    ).toEqual(Q_FRAGMENT);
    expect(
      accepts(loaded.loweredSchema, { s: { f: 7 } }),
      `${label}: the 0039 machinery enforces the nested shape — this is the behaviour d1 / d2 must not lose`,
    ).toBe(false);
    expect(
      accepts(loaded.loweredSchema, { s: { f: { q: true } } }),
      `${label}: the well-formed argument still validates`,
    ).toBe(true);
  });

  const COMPOSED: ReadonlyArray<readonly [string, string]> = [
    ["probe d1 (colliding field first)", `  n: ${RESERVED}\n  s: S`],
    ["probe d2 (schema field first)", `  s: S\n  n: ${RESERVED}`],
  ];

  for (const [label, paramsBlock] of COMPOSED) {
    const source = src(paramsBlock, BODY);

    it(`RED (e-diag, ${label}): exactly one ${CODE}`, () => {
      expectReservedRefusal(label, source, RESERVED, parseDoc(source, "bug0040.theta"));
    });

    it(`RED (e-defs, ${label}): \`S.f\` keeps its enforcing fragment`, () => {
      const loaded = loadLowered(label, source);
      expect(
        loaded.defs[RESERVED],
        `${label}: the first-wins lift must not hand the slug key to the imported \`{}\` — schema-subset.md:112 forbids silently aliasing two distinct fragments; observed ${JSON.stringify(loaded.defs[RESERVED])}`,
      ).toEqual(Q_FRAGMENT);
      expect(
        loaded.defs["S"],
        `${label}: \`S\`'s own lowering is unchanged from the control; observed ${JSON.stringify(loaded.defs["S"])}`,
      ).toEqual(S_FRAGMENT);
      expect(
        loaded.properties["n"],
        `${label}: the reserved-form name lowers permissively; observed ${JSON.stringify(loaded.properties["n"])}`,
      ).toEqual({});
    });

    it(`RED (e-ajv, ${label}): the \`schema\` body field's own payload check survives`, () => {
      const loaded = loadLowered(label, source);
      expect(
        accepts(loaded.loweredSchema, { n: 1, s: { f: 7 } }),
        `${label}: the accept-anything hole must not propagate from the colliding field to a declaration that references no import anywhere in its own text — control d0 rejects this same argument shape`,
      ).toBe(false);
      expect(
        accepts(loaded.loweredSchema, { n: 1, s: { f: { q: true } } }),
        `${label}: the well-formed argument must still validate`,
      ).toBe(true);
    });
  }
});

// ===========================================================================
// (f) THE RESERVED SET IS THE EXACT FORM, NOT THE PREFIX.
// schema-subset.md:108 fixes the four forms and :107 fixes the slug at 16
// LOWERCASE hex characters, so `__inline_zzz` can never equal a minted slug and
// stays legal. The refuse half is RED at HEAD; the legal half is GREEN by design
// and is the fence against a bare-prefix rule refusing input the corpus admits.
// ===========================================================================

describe("bug 0040 (f) — the reserved set is exactly the four §Synthesised names forms", () => {
  /** One theta importing `name` and referencing it from a `params:` field. */
  function boundaryFixture(name: string): string {
    return src(`  f: ${name}`, bodyImport(name));
  }

  const REFUSED: readonly string[] = [
    RESERVED,
    "__theta_respond_0123456789abcdef",
    "__theta_bind_0123456789abcdef",
    "__theta_callee_0123456789abcdef__plan",
  ];

  for (const name of REFUSED) {
    it(`RED (f-refuse): \`${name}\` is a synthesised-name form and is refused`, () => {
      const source = boundaryFixture(name);
      expectReservedRefusal(`reserved form '${name}'`, source, name, parseDoc(source, "bug0040.theta"));
    });
  }

  const LEGAL: ReadonlyArray<readonly [string, string]> = [
    ["__inline_zzz", "not hex, so no lowering can ever mint it"],
    ["__inline_", "the bare prefix with no slug at all"],
    ["__inline_E39F064476C952AA", "UPPERCASE hex; step 4 (:107) lowercases the digest"],
    ["__inline_e39f064476c952a", "15 hex characters, one short of the slug width"],
    ["__inline_e39f064476c952aab", "17 hex characters, one over the slug width"],
    ["__theta_callee_0123456789abcdef", "the callee form without its `__<post-rename-name>` tail"],
    ["__theta_callee_0123456789abcdef__", "the callee form with an EMPTY tail"],
    ["__inlined_0123456789abcdef", "a different prefix that merely starts alike"],
    ["Zed", "an ordinary imported symbol"],
  ];

  for (const [name, why] of LEGAL) {
    it(`GREEN (f-legal): \`${name}\` stays legal — ${why}`, () => {
      // lexical.md:20 §Reserved keywords is a closed KEYWORD list with no
      // name-shape reservations, and :18 names exactly two enforced naming
      // constraints — "The casing rule and the import-specifier
      // synthesised-name reservation" — the second scoped there to the four
      // §Synthesised names forms with a 16-lowercase-hex slug. A rule refusing
      // more than those exact forms would refuse input the corpus admits, and
      // would widen the GOV-15 carve-out's post-hoc input set beyond what the
      // fix declares.
      const doc = parseDoc(boundaryFixture(name), "bug0040.theta");
      expect(
        diagLines(doc),
        `'${name}' — ${why}; it cannot collide with any minted slug, so it must load with NO diagnostics`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (g) THE UNIT SEAM — the two `$defs` writers agree on key ownership.
// Bug doc §Fix, the obligation shared by both halves: "the two writers of
// `lowerCtx.defs` must agree on key ownership. Today the mint path's bookkeeping
// (`inlineCanonical`) is invisible to the IDENTIFIER arm and the arm's writes
// are invisible to the mint path's byte check, which is why the outcome is
// order-dependent and unreported in both directions."
// ===========================================================================

describe("bug 0040 (g) — key ownership at the `lowerCtx.defs` seam", () => {
  interface Seam {
    readonly ctx: LowerCtx;
    readonly defs: Record<string, Record<string, unknown>>;
    readonly unresolved: string[];
    readonly slugCollisions: string[];
  }

  /**
   * One hand-built lowering scope with the sinks readable afterwards, shaped as
   * `parseParams` builds it (`src/parser/params.ts`): one `defs`, one retention
   * pair, one collision sink, all block-shared.
   */
  function seam(bodyTypes: ReadonlyArray<readonly [string, Record<string, unknown>]>): Seam {
    const defs: Record<string, Record<string, unknown>> = {};
    const unresolved: string[] = [];
    const slugCollisions: string[] = [];
    return {
      ctx: {
        bodyTypeMap: new Map<string, Record<string, unknown>>(bodyTypes.map(([k, v]) => [k, v])),
        defs,
        unresolved,
        inlineCanonical: new Map<string, string>(),
        inlineFragments: new Map<string, Record<string, unknown>>(),
        slugCollisions,
      },
      defs,
      unresolved,
      slugCollisions,
    };
  }

  it("RED (g1, fixture G): the IDENTIFIER arm does not claim a reserved key, and reports nothing", () => {
    // Fixture G's original shape — `defs[RESERVED]` pre-occupied by an author
    // fragment with no retained bytes — is unconstructible once the fix lands,
    // because the only writer that could create that state is the arm under
    // test. The DIRECT ownership property is asserted instead: a resolvable
    // reserved-form name must leave the key unwritten and lower permissively.
    // At HEAD, `lowerTypeExpr` (`src/parser/params.ts`) writes `defs[s] = resolved`
    // unconditionally and returns the `$ref` — that write is arm 2 of the bug.
    const s = seam([[RESERVED, ZZZ_FRAGMENT]]);
    const emitted = lowerTypeExpr(RESERVED, s.ctx);
    expect(
      Object.keys(s.defs),
      `the reserved key belongs to the mint path; the author-name writer must leave \`defs\` untouched. Observed defs=${JSON.stringify(s.defs)}`,
    ).toEqual([]);
    expect(
      emitted,
      `bug doc §Fix — the arm returns the permissive \`{}\` rather than a \`$ref\` into a fragment it does not own; observed ${JSON.stringify(emitted)}`,
    ).toEqual({});
    expect(
      s.unresolved,
      `the name RESOLVES (it is in \`bodyTypeMap\`), so \`theta/parse/unresolved-named-type\` must not fire — the refusal belongs at the import specifier, not here; observed ${JSON.stringify(s.unresolved)}`,
    ).toEqual([]);
    expect(
      s.slugCollisions,
      `\`theta/load/schema-slug-collision\`'s trigger is TWO ANONYMOUS inline schemas (code-registry-load.md:58); one of these is an author name, so this sink must stay empty; observed ${JSON.stringify(s.slugCollisions)}`,
    ).toEqual([]);
  });

  it("RED (g2, fixture H): a mint already under the key survives a later reference to that name", () => {
    // The order-dependence the bug doc names: at HEAD the mint runs first and
    // the IDENTIFIER arm then overwrites it (`defs[RESERVED]` becomes the author
    // fragment), so which fragment survives depends on declaration order and
    // neither writer reports the clash.
    const s = seam([[RESERVED, ZZZ_FRAGMENT]]);
    const minted = lowerParamsFieldType("{q: boolean}", s.ctx);
    // The mint itself is the control half — green at HEAD and after.
    expect(minted, "the inline object hoists and emits its `$ref`").toEqual(RESERVED_REF);
    const mintedFragment = s.defs[RESERVED];
    expect(
      mintedFragment,
      `the minted entry before the second call; observed ${JSON.stringify(mintedFragment)}`,
    ).toEqual(Q_FRAGMENT);

    const second = lowerParamsFieldType(RESERVED, s.ctx);

    expect(
      s.defs[RESERVED],
      `first-wins on a slug-keyed entry (schema-subset.md:112): the SAME fragment object must still be under the key after a reference to the name; observed ${JSON.stringify(s.defs[RESERVED])}`,
    ).toBe(mintedFragment);
    expect(
      second,
      `the reserved-form name lowers permissively; observed ${JSON.stringify(second)}`,
    ).toEqual({});
    expect(
      s.slugCollisions,
      `no collision is reported either — the registered code's trigger is two anonymous inline schemas; observed ${JSON.stringify(s.slugCollisions)}`,
    ).toEqual([]);
  });

  it("GREEN (g3, control): an ordinary author name still registers and still refs", () => {
    // The fence on the guard's reach: the IDENTIFIER arm's behaviour for every
    // name that is not a synthesised form is untouched (schema-subset.md:76).
    const s = seam([["Zed", ZZZ_FRAGMENT]]);
    const emitted = lowerTypeExpr("Zed", s.ctx);
    expect(emitted, "step 3 — a resolved named type emits the in-document `$ref`").toEqual({
      $ref: "#/$defs/Zed",
    });
    expect(s.defs["Zed"], "and registers the resolved fragment under its own name").toBe(
      ZZZ_FRAGMENT,
    );
    expect(s.unresolved, "the name resolves").toEqual([]);
  });
});

// ===========================================================================
// (h) THE RESERVATION BUYS KEY OWNERSHIP, NOT SILENCE.
// A reserved-form name bound by NEITHER an import NOR a declaration resolves to
// nothing, and `theta/parse/unresolved-named-type`'s registry row
// (code-registry-parse.md:89) triggers on "a `NamedType` that resolves to no
// declaration usable at the position it is written" over a closed
// five-position list carrying no exemption for any name shape. GREEN at HEAD
// and required to stay green in both directions: the key-ownership guard the
// fix installs (src/parser/params.ts, the IDENTIFIER arm) sits AFTER the
// `bodyTypeMap` lookup precisely so this input class keeps its refusal. A guard
// placed before the lookup would trade a registered error-severity refusal for
// zero diagnostics and a registered theta whose field accepts any JSON value —
// the accept-anything class bug 0040 exists to close, minted for a new input.
// ===========================================================================

const UNRESOLVED_CODE = "theta/parse/unresolved-named-type";

describe("bug 0040 (h) — an UNBOUND reserved-form name keeps its unresolved-named-type refusal", () => {
  /** The row's normative Message template with `<name>` filled (DIAG-4). */
  function unresolvedMessage(name: string): string {
    const template = registryMessage(REGISTRY, UNRESOLVED_CODE) as string | undefined;
    expect(
      template,
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
        `Message row for ${UNRESOLVED_CODE}`,
    ).toBeDefined();
    return (template as string).replace("<name>", name);
  }

  /** An ordinary unbound name — the control the reserved spelling must match. */
  const ORDINARY = "Tirage";

  /** A body binding NOTHING: no `import`, no `schema`, no `enum`. */
  const INERT = "let x = 1\n";

  /**
   * The `NamedType` positions the reserved forms are reachable at, each built
   * from the name alone so the reserved fixture and its control differ in that
   * one token and nothing else. p1/p4/p5 are the `params:` right-hand side and
   * the two shapes `lowerTypeExpr` recurses through itself; p2/p3/p6 are the
   * three positions reaching the same arm through `lowerTypeSource`
   * (src/parser/body-type-lowering.ts).
   */
  const POSITIONS: ReadonlyArray<readonly [string, (name: string) => string]> = [
    ["p1 the bare `params:` right-hand side", (name) => src(`  n: ${name}`, INERT)],
    [
      "p2 a `schema` body field type",
      (name) => src("  s: S", `schema S { f: ${name} }\n${INERT}`),
    ],
    [
      "p3 an alias/union right-hand side",
      (name) => src("  a: A", `schema A = ${name} | string\n${INERT}`),
    ],
    ["p4 a generic argument of `array<T>`", (name) => src(`  n: array<${name}>`, INERT)],
    ["p5 a union arm under `params:`", (name) => src(`  n: ${name} | string`, INERT)],
    ["p6 the `@<T>` query annotation", (name) => src("  q: string", `let r = @<${name}>\`x\`\n`)],
  ];

  for (const [label, build] of POSITIONS) {
    it(`GREEN (h, ${label}): the unbound reserved form draws the ordinary unbound refusal`, () => {
      const control = parseDoc(build(ORDINARY), "bug0040.theta");
      const reserved = parseDoc(build(RESERVED), "bug0040.theta");
      // The control first, so a red here names a change in the position's own
      // wiring rather than a change in the reservation's reach.
      expect(
        diagLines(control),
        `${label}: an ordinary name resolving to no declaration is exactly one error-severity ${UNRESOLVED_CODE}`,
      ).toEqual([`error ${UNRESOLVED_CODE}: ${unresolvedMessage(ORDINARY)}`]);
      expect(
        diagLines(reserved),
        `${label}: the reservation is scoped to the import specifier's local binding (lexical.md:18) and to \`$defs\` key ownership; it exempts no name from ${UNRESOLVED_CODE}, whose trigger covers any \`NamedType\` resolving to no declaration. Rendered: ${JSON.stringify(diagLines(reserved))}`,
      ).toEqual([`error ${UNRESOLVED_CODE}: ${unresolvedMessage(RESERVED)}`]);
      expect(
        diagLines(reserved),
        `${label}: the two documents differ in one token, so their diagnostics must differ in that token alone — no severity, code, count or wording drift for the reserved shape`,
      ).toEqual(diagLines(control).map((line) => line.split(ORDINARY).join(RESERVED)));
    });
  }
});
