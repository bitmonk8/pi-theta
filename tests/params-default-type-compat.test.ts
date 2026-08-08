import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0066 — the load-time companion gate of the discarded post-default-merge
// verdict. `parseParams` (src/parser/params.ts) checks only that a `params:`
// default RHS is a literal-sublanguage form (`checkLiteralSublanguage`), never
// its TYPE, and `src/parser/params.ts` imports nothing from
// `src/parser/type-compat.ts` — so `p: integer = "xyzzy"` loads with zero
// diagnostics, registers, and reaches the runtime check whose verdict is
// dropped. `frontmatter-fields-a.md:60`'s compatibility MUST has no emitter
// (docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md, §Fix
// constraint 8).
//
// THIS FILE IS THE LOAD-TIME HALF of the witness. The runtime halves are
// tests/binder-post-merge-ajv-enforcement.test.ts (the `runBinder` routing) and
// tests/defaulting-post-merge-classification.test.ts (the depth walk and the
// `<ajv-summary>` projection).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) — "The
//     default literal's static type must be compatible with the param's declared
//     type per [Type System — Type compatibility] (e.g. an `integer` literal is
//     admissible for a `number` param; the reverse is
//     `theta/parse/integer-narrowing`)". The same paragraph's other refusals
//     (`theta/parse/default-not-literal`,
//     `theta/parse/literal-newline-in-string`) already have emitters in the same
//     per-field loop; this one does not.
//   - :66 — the section's OWN worked example,
//     `author: Author = { name: "anon", role: "developer", experience_years: 0 }`.
//     A gate that refused the spec's own example would be an over-refusal, which
//     is why that exact line rides the deferral table below verbatim.
//   - docs/spec_topics/type-system.md:27 — the normative enumeration of the
//     positions governed by `⊑`; :48 (§Unresolvable operands) licenses deferring
//     a static check to "the runtime AJV check [as] the safety net", which is the
//     bound on this gate's coverage and the reason the deferral table stays
//     silent.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:24 — the registered
//     `theta/parse/integer-narrowing` row (*Sev* `E`, *Phase* `type`, *Message*
//     `cannot narrow number to integer`), the code
//     `frontmatter-fields-a.md:60` names for the `number`-under-`integer`
//     direction; :48 — the `theta/parse/default-not-literal` row, the sibling
//     raised from the same per-field default loop.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the registry
//     is closed, so the new code is a spec change landing in lock-step with the
//     implementation) and :74 (DIAG-4 — the *Message* column is normative, which
//     is why every expected message below is READ from the registry).
//   - docs/spec_topics/governance/source-language-stability.md:25 — the GOV-15
//     diagnostic-registry carve-out: a code ADDITION is admissible within a
//     theta 1.x minor exactly on the inputs that did not previously emit it,
//     which is precisely the refusal table below.
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix constraint 8): `parseParams`
// compares each `defaultSource` against the field's declared type, emitting
// `theta/parse/integer-narrowing` where that registered row applies and the NEW
// registered code `theta/parse/params-default-type-mismatch` otherwise. The
// compat relation resolves names against an EMPTY environment, so every named /
// alias / literal-union / inline-object / enum-access / bare-object declared type
// or default answers `"unknown"` and DEFERS to the invocation-time AJV check —
// which is what keeps the spec's own `Author` example, bug 0165's empty default
// literal, and the runtime witness's `'"x" | "y" = "zzz"'` fixture loading.
//
// THE DECIDED DEFAULT SET is the one the registry row's Trigger enumerates: a
// `string` / `number` / `boolean` / `null` literal (a unary-`-` numeric literal
// included) and a FLAT array literal whose every element is such a literal, all
// typing as one primitive. A nested array literal, a mixed element list, an
// empty list and a non-literal element sit in the same Trigger's deferral set
// (rows c8–c13), so this position establishes no element type for them and the
// post-default-merge AJV hook judges the merged value instead.
//
// MEASURED SIGNATURES AT HEAD (offline, deterministic; re-derived by probe
// before this file was added, then deleted per probe policy). Every row of the
// REFUSED and NARROWING tables draws ZERO
// diagnostics; every row of DEFERRED and CONTROLS draws zero as well, and each
// PRECEDENCE row already draws exactly its one listed code. The `string = ` row
// records `hasDefault: true` with an EMPTY `defaultSource` (`fields[0]` is
// `{"wireName":"p","type":"string","hasDefault":true,"defaultSource":"",
// "nullable":false}`, `defaultedFields` `["p"]`), so it is a genuine defaulted
// field whose recorded default carries no literal at all — the shape a compat
// check must decline rather than compare.
//
// WHAT IS RED HERE AND WHY: group (r) — the registry carries no
// `params-default-type-mismatch` row at HEAD — and groups (a) and (b), because
// every offending default loads silently. GREEN AT HEAD AND REQUIRED TO STAY
// GREEN: groups (c), (d) and (e) — the deferral table, the controls, and the
// three precedence rows that pin the position's established "exactly one
// diagnostic per offending field" discipline.
//
// TIER: unit, offline, deterministic, provider-free. The whole contract settles
// inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end wrapped in the standard inert
// deps double) plus one read of the committed registry corpus. An integration
// tier would re-drive discovery to reach the same diagnostics and witness
// nothing further; a live tier adds a model, and a load-time refusal is upstream
// of every model interaction — the refused theta does not register at all, so a
// live drive could not distinguish this refusal from any other load error.
//
// NO SILENT SKIPPING: `registryMessageOf` and `registryRowOf` THROW naming the
// registry page when the row they need is absent, so a missing row reds as a
// named harness failure and never as a comparison against `undefined`; the
// message oracle is evaluated only AFTER each cell's primary code assertion, so
// the red at HEAD names the absent diagnostic rather than the absent row.

// ===========================================================================
// The codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** The code §Fix constraint 8 mints for the general incompatibility case. */
const CODE = "theta/parse/params-default-type-mismatch";

/** The registered code `frontmatter-fields-a.md:60` names for `number`-under-`integer`. */
const NARROWING_CODE = "theta/parse/integer-narrowing";

/** The sibling raised from the same `parseParams` per-field default loop. */
const NOT_LITERAL_CODE = "theta/parse/default-not-literal";

/** The raw-break refusal bug 0102 landed in that same loop. */
const NEWLINE_CODE = "theta/parse/literal-newline-in-string";

/** bug 0059's type-half refusal, which precedes every default-side check. */
const TYPE_TEXT_CODE = "theta/load/params-type-not-expression";

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
 * THROWS naming the registry page when the row is absent, so a registry drift
 * can never degrade an assertion into a comparison against `undefined`.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/** One registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: the parsed registry holds no structured row for ${code} — DIAG-2 closes the registry, so this row lands with the fix`,
    );
  }
  return row;
}

/** The mismatch message for one field, with the three placeholders rendered. */
function mismatchMessage(param: string, expected: string, actual: string): string {
  return registryMessageOf(CODE)
    .replace("<param>", param)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

// ===========================================================================
// Fixtures and the loud readers.
// ===========================================================================

/**
 * The declarations every fixture carries: the `enum` and the three `schema`
 * names the deferral and precedence tables reference. `Author`'s fields are
 * exactly the ones `frontmatter-fields-a.md:66`'s worked example supplies.
 */
const BODY = [
  "enum Sev { A, B }",
  "schema S { a: string }",
  "schema Triage { urgent: boolean }",
  "schema Author { name: string, role: string, experience_years: integer }",
  "let z = 1",
].join("\n");

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}\n`;
}

/**
 * A `params:` right-hand side wrapped as a YAML single-quoted scalar.
 * Theta-side literals carry theta-side quotes, and an unquoted spelling of a
 * text carrying a `:`, a `#` or a `{` breaks the YAML frame outright, which
 * collapses the load to a different diagnostic entirely.
 */
function paramsDoc(rhs: string): ThetaDocument {
  return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), "bug0066.theta");
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/**
 * The two properties the shipped drop gate reads (`hasLoadParseError`,
 * src/extension/production-composition.ts): error severity and a code in the
 * `theta/load/` or `theta/parse/` namespace. Asserting both is the reachability
 * link from this emission to a theta that does not register.
 */
function expectDropGateShape(label: string, doc: ThetaDocument): void {
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the theta registered with a default the declared type forbids`,
  ).toBe("error");
  expect(
    diagnostic.code.startsWith("theta/parse/"),
    `${label}: the drop gate reads the \`theta/load/\` / \`theta/parse/\` namespaces only; observed code ${diagnostic.code}`,
  ).toBe(true);
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic withholds the frontmatter, which is what un-registers the theta — the same disposition the sibling \`default-not-literal\` refusal already produces`,
  ).toBeNull();
  expect(
    doc.frontmatter?.params?.loweredSchema,
    `${label}: no lowered \`params:\` document may survive the refusal — a surviving one is what the discarded runtime verdict would then be the only judge of`,
  ).toBeUndefined();
}

// ===========================================================================
// (r) THE REGISTERED ROW (DIAG-2 / DIAG-4).
// RED at HEAD: the registry carries no row for the new code, so the whole
// message oracle every cell in group (a) reads has nothing to read.
// ===========================================================================

describe("bug 0066 (r) — the row §Fix constraint 8 mints", () => {
  it(`RED (r1): ${CODE} is registered E / type with the three-placeholder Message`, () => {
    // §Fix constraint 8: "`frontmatter-fields-a.md:60` states the MUST but names
    // no code for the general case, so the registry addition is a spec edit, not
    // a silent one." DIAG-2 (diagnostic-shape.md:72) closes the registry, so this
    // row's existence is the licence for every cell in group (a).
    const row = registryRowOf(CODE);
    expect(
      row.severity,
      "the Sev column is what `hasLoadParseError` acts on; a `W` row would leave the theta registered with an incompatible default bound",
    ).toBe("E");
    expect(
      row.phase,
      "diagnostic-shape.md:80 defines Phase as the emitting stage and :56 scopes the `theta/parse/*` values to `lex` / `parse` / `type`; a declared-type-vs-default-type comparison is the `type` stage, matching the `integer-narrowing` row this rule routes the narrowing direction to (code-registry-parse.md:24)",
    ).toBe("type");
    expect(
      registryMessageOf(CODE),
      "DIAG-4 — the Message column is normative, and it is the template every expected message in group (a) is rendered from",
    ).toBe("param '<param>' default type mismatch: expected <expected>, got <actual>");
  });

  it(`GREEN (r2): ${NARROWING_CODE} keeps the row the narrowing direction reuses`, () => {
    // The reused half of constraint 8: `frontmatter-fields-a.md:60` names this
    // code for the `number`-under-`integer` direction explicitly, so group (b)
    // must not mint a second code for it. Pinning the row here makes a silent
    // reword visible as one red rather than as drift in group (b)'s messages.
    const row = registryRowOf(NARROWING_CODE);
    expect(row.severity, "the narrowing row is E in the registry today").toBe("E");
    expect(row.phase, "and sits in the `type` phase").toBe("type");
    expect(
      registryMessageOf(NARROWING_CODE),
      "DIAG-4 — a Message reword is deferred to theta 2.0, so reusing this row must leave the column untouched",
    ).toBe("cannot narrow number to integer");
  });
});

// ===========================================================================
// (a) THE REFUSAL TABLE (§Fix constraint 8, the new code's arm).
// RED at HEAD: every row loads with ZERO diagnostics, registers, and reaches
// the runtime hook whose verdict is discarded.
// ===========================================================================

/**
 * Each offending row as `[label, params RHS, <expected>, <actual>]`. The
 * `<expected>` cell is the declared type's surface spelling and `<actual>` the
 * default literal's static type — both rendered verbatim into the registry
 * template, which is what makes the two placeholders' vectors the ones the
 * existing rendering-vector tests already own (category 1).
 */
const REFUSED: ReadonlyArray<readonly [string, string, string, string]> = [
  ["a1 (string literal under `integer`)", 'integer = "xyzzy"', "integer", "string"],
  ["a2 (integer literal under `string`)", "string = 5", "string", "integer"],
  ["a3 (`null` under `string`)", "string = null", "string", "null"],
  ["a4 (string literal under `number`)", 'number = "nope"', "number", "string"],
  ["a5 (string literal under `boolean`)", 'boolean = "nope"', "boolean", "string"],
  [
    "a6 (integer elements under `array<string>`)",
    "array<string> = [1, 2]",
    "array<string>",
    "array<integer>",
  ],
  [
    "a7 (integer literal under a nullable string)",
    "string | null = 5",
    "string | null",
    "integer",
  ],
];

describe("bug 0066 (a) — a default literal incompatible with its declared type is refused at load", () => {
  for (const [label, rhs, expected, actual] of REFUSED) {
    it(`RED (${label}): \`${rhs}\` draws exactly one ${CODE}`, () => {
      const doc = paramsDoc(rhs);
      // THE PRIMARY ASSERTION, first so the red names the symptom the bug
      // reports — a type-incompatible default loading with zero diagnostics —
      // rather than the absent registry row the message oracle needs. The
      // cardinality is per offending FIELD, the discipline this position already
      // holds for its other three refusals.
      expect(
        diagCodes(doc),
        `${label}: frontmatter-fields-a.md:60 makes the default literal's static type a MUST against the param's declared type, and \`parseParams\` imports nothing from src/parser/type-compat.ts today, so the MUST has no emitter. Rendered: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([`error ${CODE}`]);
      expect(
        doc.diagnostics[0]?.message,
        `${label}: DIAG-4 — the rendered message is the registry row's template with \`<param>\`, \`<expected>\` and \`<actual>\` rendered`,
      ).toBe(mismatchMessage("p", expected, actual));
      expectDropGateShape(label, doc);
    });
  }

  it("RED (a8): a second offending field draws its own diagnostic, named for that field", () => {
    // One diagnostic per offending FIELD: two fields in one block are what
    // separates a per-field emission from a per-document one, and the `<param>`
    // rendering is what makes the two distinguishable. Declaration order is
    // legal here — both fields are defaulted, so `non-trailing-default` cannot
    // fire.
    const doc = parseDoc(
      src(`  p: 'integer = "xyzzy"'\n  q: 'string = 5'`),
      "bug0066.theta",
    );
    // The count/code assertion runs FIRST, and its expected value is a literal
    // rather than a `mismatchMessage` call, so the red at HEAD names the two
    // absent diagnostics instead of the absent registry row the rendering oracle
    // reads (the row lands with the fix; group (r) is its reconciliation).
    expect(
      diagCodes(doc),
      `a8: one diagnostic per offending field, so two offending fields draw two. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`, `error ${CODE}`]);
    expect(
      diagLines(doc),
      `a8: each offending field is reported with its own name rendered. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([
      `error ${CODE}: ${mismatchMessage("p", "integer", "string")}`,
      `error ${CODE}: ${mismatchMessage("q", "string", "integer")}`,
    ]);
  });
});

// ===========================================================================
// (b) THE NARROWING ARM (§Fix constraint 8's reuse clause).
// RED at HEAD: both rows load with ZERO diagnostics.
// ===========================================================================

/**
 * The `number`-literal-under-`integer` spellings, including the negative and
 * the element-level one. b3 is the array arm of the SAME direction: the
 * decided-set bound on array defaults is flatness, not element typing, so a
 * flat homogeneous list still carries its element primitive into TYPE-7's
 * element-wise covariance and narrowing is decided there.
 */
const NARROWING: ReadonlyArray<readonly [string, string]> = [
  ["b1 (positive decimal)", "integer = 1.5"],
  ["b2 (unary-minus decimal — the sublanguage admits it)", "integer = -1.5"],
  ["b3 (decimal element under `array<integer>` — TYPE-7 element-wise)", "array<integer> = [1.5]"],
];

describe("bug 0066 (b) — a `number` default under an `integer` param reuses the registered narrowing row", () => {
  for (const [label, rhs] of NARROWING) {
    it(`RED (${label}): \`${rhs}\` draws exactly one ${NARROWING_CODE}`, () => {
      const doc = paramsDoc(rhs);
      expect(
        diagCodes(doc),
        `${label}: frontmatter-fields-a.md:60 names this code for this direction explicitly ("an \`integer\` literal is admissible for a \`number\` param; the reverse is \`theta/parse/integer-narrowing\`"), so no new code may be minted for it. Rendered: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([`error ${NARROWING_CODE}`]);
      expect(
        doc.diagnostics[0]?.message,
        `${label}: DIAG-4 — the registered row's Message, which carries no placeholder`,
      ).toBe(registryMessageOf(NARROWING_CODE));
      expectDropGateShape(label, doc);
    });
  }
});

// ===========================================================================
// (c) THE DEFERRAL TABLE (§Fix constraint 8's coverage bound).
// GREEN at HEAD and required to stay green: the compat relation resolves names
// against an EMPTY environment, so each of these answers `"unknown"` and defers
// to the invocation-time AJV check (type-system.md:48). An over-refusal here
// would refuse the spec's own worked example.
// ===========================================================================

const DEFERRED: ReadonlyArray<readonly [string, string]> = [
  // The runtime witness's own fixture shape: a literal union lowers the
  // enforcing `{"type":"string","enum":["x","y"]}` fragment, which AJV refuses
  // at the merge — so this row MUST keep loading or
  // tests/binder-post-merge-ajv-enforcement.test.ts loses its subject.
  ["c1 (string-literal union, out-of-arm default)", '"x" | "y" = "zzz"'],
  ["c2 (enum-typed field, string default)", 'Sev = "zzz"'],
  ["c3 (schema-typed field, bare object default)", "S = { a: 1 }"],
  // frontmatter-fields-a.md:66's OWN worked example, byte-identical. A gate that
  // refused this row would refuse the section that mandates the gate.
  [
    "c4 (the spec's own Author example)",
    'Author = { name: "anon", role: "developer", experience_years: 0 }',
  ],
  ["c5 (inline object type, mistyped field default)", "{m: string} = { m: 1 }"],
  ["c6 (enum-access default)", "Sev = Sev.A"],
  // bug 0165's shape: `hasDefault` is true and `defaultSource` is the EMPTY
  // string, so a compat check has no literal to type and must decline rather
  // than compare "" against `string`.
  ["c7 (empty default literal)", "string = "],
  ["c8 (empty array literal under array<string>)", "array<string> = []"],
  // c9–c13 — the nested-array rows. The Trigger decides a FLAT homogeneous
  // array literal of primitive literals and nothing deeper, so an element that
  // is itself an array literal leaves the default's static type undecided —
  // under a nested declared type (c9–c12) as much as under a flat one (c13).
  // Reading a deep shape off one element instead would report an `<actual>` the
  // rest of the list need not agree with: c11 and c12 are the same deeply
  // heterogeneous list in both element orders, and a first-element reading
  // renders `array<array<integer>>` for one and `array<array<string>>` for the
  // other over identical bytes.
  ["c9 (nested array literal matching the declared nesting)", "array<array<integer>> = [[1]]"],
  ["c10 (nested array literal against the declared nesting)", 'array<array<integer>> = [["x"]]'],
  ["c11 (deeply heterogeneous list, integer element first)", 'array<array<string>> = [[1], ["x"]]'],
  ["c12 (deeply heterogeneous list, string element first)", 'array<array<string>> = [["x"], [1]]'],
  ["c13 (nested array literal where a flat one is declared)", "array<integer> = [[1]]"],
];

describe("bug 0066 (c) — every declared type or default the compat relation cannot resolve defers", () => {
  for (const [label, rhs] of DEFERRED) {
    it(`GREEN (${label}): \`${rhs}\` loads silently`, () => {
      const doc = paramsDoc(rhs);
      expect(
        diagLines(doc),
        `${label}: type-system.md:48 licenses deferring where "the runtime AJV check is the safety net"; the compat relation resolves names against an empty environment, and the registry row's Trigger decides no default shape past a primitive literal or a flat homogeneous array literal of them — a refusal reaching this row emits past that Trigger, on input the spec admits`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (d) THE CONTROLS (§Fix constraint 8's admitted set). GREEN at HEAD.
// ===========================================================================

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ["d1 (integer literal under `number` — the admitted widening)", "number = 3"],
  ["d2 (integer literal under `integer`)", "integer = 3"],
  ["d3 (string literal under `string`)", 'string = "ok"'],
  ["d4 (integer elements under array<integer>)", "array<integer> = [1, 2]"],
  ["d5 (integer literal under a nullable integer)", "integer | null = 1"],
  ["d6 (boolean literal under `boolean`)", "boolean = true"],
  ["d7 (`null` under a nullable string)", "string | null = null"],
];

describe("bug 0066 (d) — a compatible default keeps loading silently", () => {
  for (const [label, rhs] of CONTROLS) {
    it(`GREEN (${label}): \`${rhs}\` loads silently`, () => {
      const doc = paramsDoc(rhs);
      expect(
        diagLines(doc),
        `${label}: frontmatter-fields-a.md:60's own example of the admitted direction is "an \`integer\` literal is admissible for a \`number\` param"; a control that reds here is over-refusal`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (e) PRECEDENCE — exactly one diagnostic per offending field, the discipline
// this position already holds. GREEN at HEAD and required to stay green: each
// row already draws its one listed code, and the new check must not join it.
// ===========================================================================

describe("bug 0066 (e) — the new check does not co-fire with the position's existing refusals", () => {
  it(`GREEN (e1): a raw break inside the default's string literal keeps ${NEWLINE_CODE} alone`, () => {
    // bug 0102's lock. The recorded default is `"a<LF>b"` under a schema-typed
    // field, so a compat check that ran anyway would have a second opinion about
    // bytes the position has already refused. The block scalar is the spelling
    // that carries a physical break through the YAML frame.
    const doc = parseDoc(
      src('  p: |\n    Triage = "a\n    b"'),
      "bug0066.theta",
    );
    expect(
      diagCodes(doc),
      `e1: one diagnostic per offending field — the raw-break refusal survives alone. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NEWLINE_CODE}`]);
  });

  it(`GREEN (e2): a non-literal default keeps ${NOT_LITERAL_CODE} alone`, () => {
    // There is no literal to type at all: an operator RHS is outside the
    // sublanguage, so the compat check has no input and must not add a second
    // diagnostic to the same field.
    const doc = paramsDoc("integer = 1 + 1");
    expect(
      diagCodes(doc),
      `e2: the sibling check in the same per-field loop owns this input. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
  });

  it(`GREEN (e3): junk TYPE text keeps ${TYPE_TEXT_CODE} alone`, () => {
    // bug 0059's guard extension, quoted in src/parser/params.ts's own per-field
    // default loop: "a field whose type half spells no type expression is
    // reported as such, not by whatever its default half's literal check makes
    // of the same field's recovered bytes." A compat check needs a declared type
    // to compare against, and this field has none.
    const doc = paramsDoc('lol wut = "x"');
    expect(
      diagCodes(doc),
      `e3: the type-half refusal survives alone. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${TYPE_TEXT_CODE}`]);
  });
});
