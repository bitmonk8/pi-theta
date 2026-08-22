import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0162 — `theta/parse/inline-enum` is raised from the two `schema`
// declaration call sites only, so ONE authored mistake draws a different code
// by position. `checkInlineEnumForm` (src/parser/schema-declarations.ts:282,
// anchored `/^\s*enum\s*\[/` at :289) is called from exactly two places, both
// inside the `schema` declaration walk in src/parser/theta-document.ts — the
// alias/union per-arm pass and the object form's field-type pass. The `params:`
// right-hand side is lowered by `parseParams` (src/parser/params.ts — cited by
// SYMBOL, bug 0134's citation gate), which consults no inline-enum recogniser,
// so the byte-identical text at that position falls through to the
// fragment-level text judgement bug 0059 landed and draws the GENERIC
// `theta/load/params-type-not-expression` instead of the registered row whose
// *Fix hint* names the very remedy bug 0056 made enforce at `params:`.
// (docs/bugs/0162-inline-enum-trigger-misses-params-position.md, and its
// trailing "Note (0.86.0)": the observable flipped from SILENCE to the generic
// refusal when bug 0059 landed, and the code-divergence question this report
// owns survived that flip unchanged.)
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schemas.md:93 — "`enum` is **top-level only** — there is
//     no inline `enum["a", "b"]` form (`theta/parse/inline-enum`). For inline
//     enumerations use literal-union". Stated over the FORM, with no position
//     qualifier — which is the whole of this report's subject.
//   - docs/spec_topics/type-system.md:15 — "The same type grammar applies in
//     every type-annotation position: schema fields, frontmatter `params:`,
//     `let x: T`, function parameters, and `@<T>`".
//   - docs/spec_topics/grammar.md:105 — `params:` field types and union arms
//     named in the bare-`Type` position list; the grammar "is otherwise
//     identical in every position".
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 — the `params:`
//     right-hand side is "a type expression parsed by the theta type grammar —
//     the same grammar used in every other type-annotation position".
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2, the closed
//     registry — route (a) MINTS no code, it widens one existing row's reach)
//     and :74 (DIAG-4, the normative *Message* column — which is why every
//     expected message in this file is READ from the registry at runtime and
//     none is restated by hand).
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate) and :25 (the diagnostic-registry carve-out,
//     under which widening an existing row to inputs newly brought into the
//     code's emission set is a recognised spec change). Exactly ONE input in
//     this file loads cleanly at HEAD and must stop doing so — group (e).
//
// THE ROUTE THIS FILE IS WRITTEN AGAINST is §Fix ROUTE (a), as adjudicated:
// widen the `theta/parse/inline-enum` row to the `params:` right-hand side at
// the FIELD'S OWN TOP LEVEL, by reusing the EXPORTED recogniser
// `checkInlineEnumForm` (src/parser/schema-declarations.ts) over the field's
// `typeSource` inside `parseParams`'s per-field loop (src/parser/params.ts), so
// that it fires INSTEAD OF (never beside) `theta/load/params-type-not-expression`.
// The recogniser is REUSED, not re-spelled — §Fix (a): "a second predicate for
// one registry row recreates at `params:` the split this route exists to
// remove". Two direct consequences are pinned here as fences:
//   - the predicate is ANCHORED, so `p: 'string | enum["x", "y"]'` keeps the
//     generic code (group (b)) — the `params:` position runs no per-arm pass,
//     unlike the alias position, whose per-arm pass DOES fire on a
//     second-position arm;
//   - the predicate is CASE-SENSITIVE and requires the bare keyword, so
//     `ENUM["a"]` and `enumx["a"]` keep the generic code (group (b)).
// Nested spellings are unchanged: bug 0217 §Fix (b)(2) keeps
// `theta/load/params-type-not-expression` for `array<enum[...]>` and
// `{a: enum[...]}` at `params:`, exactly as the two schema positions keep
// `theta/parse/schema-type-not-expression` for their nested spellings.
//
// WHAT THIS FILE PINS:
//   1. Group (a) — the subject, one byte-identical text at three positions:
//      `params:` must draw `theta/parse/inline-enum` (RED at HEAD, where it
//      draws the generic text refusal) and the two `schema` spellings must keep
//      drawing it (GREEN, unmoved).
//   2. Group (b) — every bound that does NOT move: the union-arm asymmetry, the
//      two nested `params:` spellings bug 0217 owns, the nested `schema` field
//      spelling, the three positions that are silent at HEAD (`let`, `fn`
//      parameter, `@<T>` — measured-at-HEAD CURRENT behaviour, a wider trigger
//      gap this report's §Non-goals holds out of scope), controls C1/C3/C4, and
//      the two case/keyword negative controls.
//   3. Group (c) — the edge spellings. Route (a) buys FULL SYMMETRY with the
//      schema positions for the anchored predicate's whole matched set, not
//      just for the canonical `enum["x", "y"]`: unclosed, empty, spaced,
//      one-item, leading-whitespace, trailing-junk, mapping-interior,
//      union-tailed and default-carrying spellings all flip together.
//   4. Group (d) — exactly ONE diagnostic per offending field (§Fix constraint
//      3): the widened row fires INSTEAD OF the generic one, never beside it.
//   5. Group (e) — the single GOV-15 emission-set ADDITION: `p: 'enum[{a: string}]'`
//      loads CLEAN at HEAD (the fragment-level brace exemption declines it) and
//      must stop doing so, withholding the frontmatter instead of registering a
//      field the author wrote as an enumeration against the assert-nothing `{}`.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39 — the shipped front end with inert offline seams).
// An integration tier could add nothing: the subject is WHICH diagnostic code a
// load emits for one type text at one position, which is fully determined
// before any host, session or provider exists. A live tier is strictly weaker —
// both codes are error-severity in a namespace `hasLoadParseError`
// (src/extension/production-composition.ts) reads, so both un-register the
// theta and a live drive observes only an absent slash command, which cannot
// distinguish the two codes at all. The one live-visible consequence (group
// (e)'s registration flip) is reached here the way the sibling unit locks reach
// it: through the two properties that gate reads, plus the frontmatter collapse.
//
// NO SILENT SKIPPING: every registry lookup asserts the row is present before
// using it, the `params:` fixture builder THROWS naming the unmet precondition
// when a type text has no quoted YAML scalar spelling, the fixture reader
// THROWS naming the absent declaration when a `schema` fixture never parsed,
// and no cell is `.skip`/`.todo`/`.only`. A broken fixture can never read as a
// pass.

// ===========================================================================
// The registered codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

const INLINE_ENUM = "theta/parse/inline-enum";
const PARAMS_REFUSAL = "theta/load/params-type-not-expression";
const SCHEMA_REFUSAL = "theta/parse/schema-type-not-expression";
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
const UNRESOLVED_NAME = "theta/parse/unresolved-named-type";

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
 * A registry row's normative *Message* (DIAG-4, diagnostic-shape.md:74), read
 * rather than restated — the neighbour witness
 * (tests/nested-inline-enum-generic-argument-refusal.test.ts) reads its
 * expectations the same way, and this file must not become the one place where
 * the inline-enum bytes are hard-coded. Definedness is asserted first so a
 * missing row reds by naming the registry page instead of comparing against a
 * bare `undefined`. 
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

/** `error <code>: <message>` for one substitution set, rendered from the registry. */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = registryMessageOf(code);
  for (const [placeholder, value] of subs) {
    expect(
      message.includes(placeholder),
      `DIAG-4 anchor: the registry *Message* for ${code} must carry the ${placeholder} ` +
        `placeholder this file interpolates; observed template ${JSON.stringify(message)}`,
    ).toBe(true);
    message = message.replace(placeholder, value);
  }
  return `error ${code}: ${message}`;
}

/**
 * The registered inline-enum line. The row carries NO placeholder — it names
 * neither the field nor the declaration — which is itself part of the subject:
 * the two schema positions and the `params:` position must render the
 * BYTE-IDENTICAL line for byte-identical text, and §Fix (a) is explicit that
 * "the *Message* bytes do not change, so no DIAG-4 reword is involved". 
 */
function inlineEnumLine(): string {
  return line(INLINE_ENUM, []);
}

/** The `params:`-position generic text refusal, rendered for one field name. */
function paramsRefusal(field: string): string {
  return line(PARAMS_REFUSAL, [["<param>", field]]);
}

/** The schema-position generic text refusal, rendered for the declaration's name. */
function schemaRefusal(declName: string): string {
  return line(SCHEMA_REFUSAL, [["<X>", declName]]);
}

// ===========================================================================
// The positions and their fixtures.
// ===========================================================================

/** The three positions §Reproduction (a) puts one byte-identical text at. */
type Position = "params" | "field" | "alias" | "let" | "fnparam" | "query";

/** The declaration or field name each position's diagnostics name. */
const FIELD_NAME = "p";
const DECL_NAME = "S";

/**
 * The YAML scalar the `params:` fixture spells the type text as. §Reproduction
 * writes `p: 'T'`, which cannot carry a `T` containing an apostrophe; a text
 * carrying BOTH quote forms has no plain quoted spelling at all, so this THROWS
 * naming that precondition rather than emitting a fixture whose diagnostics
 * would belong to the broken quoting rather than to bug 0162's verdict. 
 */
function paramsScalar(typeSource: string): string {
  const hasSingle = typeSource.includes("'");
  const hasDouble = typeSource.includes('"');
  if (!hasSingle) {
    return `'${typeSource}'`;
  }
  if (!hasDouble) {
    return `"${typeSource}"`;
  }
  throw new Error(
    `params: fixture precondition unmet: the type text ${JSON.stringify(typeSource)} carries ` +
      `both quote forms, so no single- or double-quoted YAML scalar can spell it and any ` +
      `diagnostic the fixture drew would belong to the quoting rather than to bug 0162's ` +
      `verdict. Add a block-scalar spelling before adding such a row`,
  );
}

/** The §Reproduction fixture for one position, with `T` substituted. */
function fixture(position: Position, typeSource: string): string {
  switch (position) {
    case "params":
      return `---\nmode: prompt\nparams:\n  ${FIELD_NAME}: ${paramsScalar(typeSource)}\n---\nlet x = 1\n`;
    case "field":
      return `schema ${DECL_NAME} {\n  a: ${typeSource}\n}\nlet x = 1\n`;
    case "alias":
      return `schema ${DECL_NAME} = ${typeSource}\nlet x = 1\n`;
    case "let":
      return `let a: ${typeSource} = 1\n`;
    case "fnparam":
      return `fn f(a: ${typeSource}): integer { 1 }\nlet x = 1\n`;
    case "query":
      return `let r = @<${typeSource}>\`hi\`\n`;
  }
}

/** What one fixture yields. */
interface Read {
  /** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
  readonly lines: readonly string[];
  /** Every diagnostic's code, in emission order. */
  readonly codes: readonly string[];
  /** The count the shipped drop gate reads: error severity in the two namespaces. */
  readonly gateCount: number;
  /** Whether the load produced a frontmatter block at all. */
  readonly frontmatterPresent: boolean;
  /** The whole document, for the loud readers below. */
  readonly doc: ThetaDocument;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * Read one type text at one position through the shipped load path, loud on
 * every way a fixture can fail to reach the lowering: a `schema` fixture whose
 * declaration never parsed would assert a verdict for the wrong reason. 
 */
function read(label: string, position: Position, typeSource: string): Read {
  const doc = parseDoc(fixture(position, typeSource), "bug0162.theta");
  if (position === "field" || position === "alias") {
    const decl = doc.body.statements.find(
      (s): s is SchemaDecl => s.kind === "schema" && s.name === DECL_NAME,
    );
    if (decl === undefined) {
      throw new Error(
        `${label}: the fixture must declare \`schema ${DECL_NAME}\` for a type-position verdict ` +
          `to be attributable to it; statement kinds ` +
          `${JSON.stringify(doc.body.statements.map((s) => s.kind))}, diagnostics ` +
          `${JSON.stringify(diagLines(doc))}`,
      );
    }
  }
  return {
    lines: diagLines(doc),
    codes: doc.diagnostics.map((d) => d.code),
    gateCount: doc.diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
    ).length,
    frontmatterPresent: doc.frontmatter !== null && doc.frontmatter !== undefined,
    doc,
  };
}

/** The canonical subject text: §Reproduction's `T`, at every position. */
const T = 'enum["x", "y"]';

// ===========================================================================
// (a) THE SUBJECT — one byte-identical text, three positions, ONE code.
// §Reproduction (a) rows R1/R2/R3. RED at `params:`, GREEN at the two `schema`
// spellings.
//
// R2 and R3 render the registry's line byte-identically at HEAD. R1 renders the
// GENERIC text refusal instead. schemas.md:93 states the prohibition over the
// FORM with no position qualifier, type-system.md:15 puts `params:` in the same
// grammar as the schema field, and the row's own *Fix hint* names a remedy that
// has been enforcing at `params:` since 0.85.0 (bug 0056) — so the author who
// most needs the redirect is the only one who never receives it.
// ===========================================================================

describe("bug 0162 (a) — one inline `enum[...]` draws one code at all three positions", () => {
  it(`RED (a1, params): \`${FIELD_NAME}: '${T}'\` draws the registered inline-enum row`, () => {
    // The subject. Route (a) reuses the exported `checkInlineEnumForm` over the
    // field's own `typeSource` inside `parseParams`'s per-field loop, so this
    // position emits the SAME registered line the two schema positions emit for
    // the same bytes — INSTEAD OF the generic text refusal, never beside it. 
    const label = `a1 (params, ${T})`;
    const r = read(label, "params", T);
    expect(
      r.lines,
      `${label}: schemas.md:93 prohibits the inline \`enum[...]\` FORM with no position ` +
        `qualifier and type-system.md:15 puts the \`params:\` right-hand side under the same ` +
        `type grammar as a schema field, so this text must draw \`${INLINE_ENUM}\` here — the ` +
        `row whose *Fix hint* names the literal-union remedy bug 0056 made enforce at this very ` +
        `position (control b7 below). GREEN means route (a) reached the position through the ` +
        `reused recogniser. RED with \`${PARAMS_REFUSAL}\` is bug 0162's symptom exactly: the ` +
        `recogniser is wired to the two \`schema\` declaration call sites only, so the author ` +
        `receives the GENERIC "right-hand side is not a theta type expression" text in place of ` +
        `the targeted one-line remedy on file. RED with BOTH lines violates §Fix constraint 3 ` +
        `(group (d)). Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([inlineEnumLine()]);
  });

  it(`GREEN (a2, schema field): \`a: ${T}\` keeps the registered inline-enum row`, () => {
    // The comparator half of the subject, and a fence: route (a) widens the
    // row's REACH and moves no landed emission. §Fix constraint 6 keeps both
    // landed witnesses' bytes; this cell restates the object-field one over the
    // same text a1 uses, so the two cells are readable against each other. 
    const label = `a2 (field, ${T})`;
    const r = read(label, "field", T);
    expect(
      r.lines,
      `${label}: the object form's field-type pass calls \`checkInlineEnumForm\` today and must ` +
        `keep calling it — route (a) adds a fourth call site, it does not move this one. A red ` +
        `here means the fix relocated the recogniser instead of reusing it, which §Fix (a) bars ` +
        `("the recogniser is exported already and is reused, not re-spelled"). ` +
        `Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([inlineEnumLine()]);
  });

  it(`GREEN (a3, schema alias): \`schema ${DECL_NAME} = ${T}\` keeps the registered inline-enum row`, () => {
    // The alias/union per-arm pass, the second landed call site. §Fix
    // constraint 6 names tests/schema-alias-union-decl.test.ts cell n6 as the
    // lock on it; this cell is its restatement beside a1, so the divergence a1
    // witnesses is visible in one file. 
    const label = `a3 (alias, ${T})`;
    const r = read(label, "alias", T);
    expect(
      r.lines,
      `${label}: the alias/union per-arm pass is the second landed call site and is unmoved. ` +
        `Together with a2 this is the byte-identical line a1 must render: the *Message* bytes ` +
        `do not change under route (a) (§Fix (a): "no DIAG-4 reword is involved"). ` +
        `Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([inlineEnumLine()]);
  });
});

// ===========================================================================
// (b) THE BOUNDS THAT DO NOT MOVE — GREEN at HEAD and GREEN after the fix.
// §Fix constraint 1 ("the bounds in §Reproduction (c) are stated, not left
// implicit") and constraint 2 ("no cross-position blast radius").
//
// Route (a) widens the row to the `params:` field's OWN TOP LEVEL only, because
// the recogniser it reuses is ANCHORED (`/^\s*enum\s*\[/`,
// src/parser/schema-declarations.ts:289) and is handed the field's whole
// `typeSource`. Everything below is measured at HEAD and must read identically
// afterwards; each cell says which mechanism holds it.
// ===========================================================================

describe("bug 0162 (b) — the bounds route (a) does not reach", () => {
  it(`GREEN (b1, params): \`${FIELD_NAME}: 'string | ${T}'\` keeps the generic text refusal`, () => {
    // §Reproduction R5. The reused predicate is ANCHORED and the `params:`
    // position runs no per-arm pass, so a second-position arm is not matched
    // and the fragment-level judgement keeps the field. This is the asymmetry
    // route (a) deliberately does NOT remove — the report's subject is the
    // top-level occurrence (§Non-goals). 
    const label = `b1 (params, string | ${T})`;
    const r = read(label, "params", `string | ${T}`);
    expect(
      r.lines,
      `${label}: \`checkInlineEnumForm\` anchors at the START of what it is handed and route ` +
        `(a) hands it the FIELD'S OWN TOP-LEVEL \`typeSource\`, so \`string | enum[...]\` does ` +
        `not match and this field keeps \`${PARAMS_REFUSAL}\`. A red with \`${INLINE_ENUM}\` ` +
        `means the fix added a per-arm pass at \`params:\` — a scope the adjudicated route does ` +
        `not authorise, and one that would need its own *Trigger* prose. ` +
        `Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([paramsRefusal(FIELD_NAME)]);
  });

  it(`GREEN (b2, schema alias): \`schema ${DECL_NAME} = string | ${T}\` still fires per-arm`, () => {
    // §Reproduction R4, the other half of b1: the alias position DOES run a
    // per-arm pass, so the same union fires there. The two cells together are
    // the residual divergence route (a) leaves standing, stated rather than
    // discovered later. 
    const label = `b2 (alias, string | ${T})`;
    const r = read(label, "alias", `string | ${T}`);
    expect(
      r.lines,
      `${label}: the alias/union per-arm pass hands each arm to the recogniser separately, so a ` +
        `second-position arm matches the anchor and fires. Read beside b1 this is the bound in ` +
        `full: route (a) equalises the TOP-LEVEL occurrence and leaves the arm-depth asymmetry ` +
        `where §Reproduction (c) measured it. Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([inlineEnumLine()]);
  });

  /** id, `params:` text, why the generic text refusal survives route (a). */
  const PARAMS_UNMOVED: ReadonlyArray<readonly [string, string, string]> = [
    [
      "b3",
      `{a: ${T}}`,
      "§Reproduction R6, nested one level inside an inline object: bug 0217 §Fix (b)(2) already " +
        "assigns this spelling to the generic text row at `params:` (the registry row at " +
        "code-registry-load.md:19 names it), and the anchored predicate declines it because the " +
        "field's own top-level text starts with `{`",
    ],
    [
      "b4",
      `array<${T}>`,
      "§Reproduction R7, nested inside a generic argument: likewise bug 0217's, and likewise " +
        "declined by the anchor. The inline-enum registry row at " +
        "code-registry-parse.md:113 states this exclusion in terms — \"never one level down, " +
        "inside a `GenericType` argument or an inline `ObjectType` field\"",
    ],
    [
      "b10",
      'ENUM["a"]',
      "the case negative control: `/^\\s*enum\\s*\\[/` is case-SENSITIVE, so the upper-case " +
        "spelling is not an inline enum by the predicate route (a) reuses and keeps the generic " +
        "code. A red here means the fix re-spelled the predicate more loosely instead of " +
        "reusing the exported one, which §Fix (a) bars",
    ],
    [
      "b11",
      'enumx["a"]',
      "the keyword negative control: the predicate requires the BARE keyword followed by `[`, " +
        "so an identifier that merely starts with `enum` is not matched. A red here is the same " +
        "re-spelling failure as b10, one character further out",
    ],
  ];

  for (const [id, typeSource, why] of PARAMS_UNMOVED) {
    it(`GREEN (${id}, params): \`${FIELD_NAME}: '${typeSource}'\` keeps the generic text refusal`, () => {
      const label = `${id} (params, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        r.lines,
        `${label}: ${why}. Route (a) fires INSTEAD OF \`${PARAMS_REFUSAL}\` only where the ` +
          `reused anchored predicate matches the field's own top-level text; everywhere else ` +
          `this position's emission set is byte-untouched (§Fix constraint 2, no cross-position ` +
          `blast radius, restated inside the position). Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([paramsRefusal(FIELD_NAME)]);
    });
  }

  it(`GREEN (b5, schema field): \`a: {b: ${T}}\` keeps the schema text refusal`, () => {
    // §Reproduction R8, the declaration position's OWN silence-at-depth, now
    // (post-0217) a generic schema refusal. It is cited here because the two
    // positions must stay symmetric under route (a): each keeps its own generic
    // text row for the nested spelling and gains the targeted row only at the
    // field's own top level. 
    const label = `b5 (field, {b: ${T}})`;
    const r = read(label, "field", `{b: ${T}}`);
    expect(
      r.lines,
      `${label}: the recogniser is handed the field's whole \`typeSource\` and anchors, so a ` +
        `nested \`enum[...]\` at the DECLARATION position draws \`${SCHEMA_REFUSAL}\` too. ` +
        `Route (a) makes \`params:\` match this shape exactly — targeted row at the top level, ` +
        `generic row below it — rather than inventing a deeper reach the schema positions do ` +
        `not have (§Non-goals: widening the traversal is a different frame). ` +
        `Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([schemaRefusal(DECL_NAME)]);
  });

  /** The three positions that draw NOTHING for `T` at HEAD. */
  const SILENT_POSITIONS: ReadonlyArray<readonly [string, Position, string]> = [
    ["b6", "let", "`let a: T = 1` — the `let` annotation"],
    ["b7", "fnparam", "`fn f(a: T)` — the `fn` parameter type"],
    ["b8", "query", "`@<T>` — the query annotation (§Reproduction R9)"],
  ];

  for (const [id, position, description] of SILENT_POSITIONS) {
    it(`GREEN (${id}, ${position}): ${description} stays silent`, () => {
      // ASSERTS CURRENT (measured-at-HEAD) BEHAVIOUR, deliberately and by name:
      // these positions register no inline-enum check at all, and §Non-goals
      // holds them out of this report's scope ("a wider trigger gap in the same
      // row"). The cell exists as a blast-radius fence — route (a) touches
      // `parseParams` and must not reach them — not as a claim that the silence
      // is correct. A later report widening the row further will move it. 
      const label = `${id} (${position}, ${T})`;
      const r = read(label, position, T);
      expect(
        r.codes,
        `${label}: MEASURED AT HEAD, asserted as CURRENT behaviour, not as the desired end ` +
          `state — §Reproduction R9 and §Non-goals ("the nested and \`@<T>\` occurrences as a ` +
          `subject") record this silence as a WIDER gap in the same registry row and hold it out ` +
          `of scope. What this cell fences is §Fix constraint 2: route (a) wires the reused ` +
          `recogniser inside \`parseParams\` (src/parser/params.ts), a function none of these ` +
          `three positions calls, so their diagnostic sequences must be byte-identical ` +
          `afterwards. A red here means the check was wired into the shared lowering instead — ` +
          `which §Fix constraint 2 bars explicitly, because it would also double-report the two ` +
          `\`schema\` positions. Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([]);
    });
  }

  /** id, `params:` text, the expected line, why. §Reproduction (d) controls. */
  const CONTROLS: ReadonlyArray<readonly [string, string, string, string]> = [
    [
      "b7c",
      '"x" | "y"',
      "",
      "control C1: the literal-union form the row's own *Fix hint* names, which bug 0056 made " +
        "enforce at this position in 0.85.0. It must stay clean — it is the destination route " +
        "(a)'s redirect sends the author to, and a redirect into a diagnostic would be worse " +
        "than the divergence",
    ],
    [
      "b9c",
      "enum",
      line(RESERVED_KEYWORD, [["<keyword>", "enum"]]),
      "control C3: the BARE keyword, whose code bug 0044 settled at this position. It proves " +
        "`params:` already distinguishes this word — only the BRACKETED form falls through — and " +
        "route (a) must not swallow it: the reused predicate requires a `[` after the keyword",
    ],
    [
      "b12c",
      "Ghost",
      line(UNRESOLVED_NAME, [["<name>", "Ghost"]]),
      "control C4: an unresolved name at the same position, proving the position raises per-field " +
        "type diagnostics at all. What the position lacks is this ONE row (§Kind element 3)",
    ],
  ];

  for (const [id, typeSource, expected, why] of CONTROLS) {
    it(`GREEN (${id}, params): \`${FIELD_NAME}: '${typeSource}'\` keeps its own answer`, () => {
      const label = `${id} (params, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        r.lines,
        `${label}: ${why}. A red here means route (a)'s new call site fired on text the reused ` +
          `predicate does not match, or displaced a diagnostic the position already raised — ` +
          `both are §Fix constraint 2 failures inside the position. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual(expected === "" ? [] : [expected]);
    });
  }
});

// ===========================================================================
// (c) THE EDGE SPELLINGS — RED at `params:`, GREEN at the alias position.
// §Fix constraint 1: a route that widens the trigger states what it reaches.
//
// FULL SYMMETRY is the point of route (a): what flips is not the canonical
// `enum["x", "y"]` but the WHOLE set the anchored predicate matches. Every text
// below draws `theta/parse/inline-enum` at the `schema` alias arm at HEAD and
// `theta/load/params-type-not-expression` at `params:`; after the fix the
// `params:` column reads the alias column. The alias position is the comparator
// rather than the object-field one because two of these spellings
// (`enum["x"] extra`, `enum["x", "y"] = "x"`) break the object body's own field
// list at parse time and never reach a field-type walk — a fixture artefact of
// the `schema S { … }` spelling, not a statement about the recogniser.
// ===========================================================================

/** id, the type text, what the spelling probes. */
const EDGE_SPELLINGS: ReadonlyArray<readonly [string, string, string]> = [
  [
    "c1",
    'enum["a", "b"',
    "the UNCLOSED bracket list: the anchor only requires `enum` followed by `[`, so the " +
      "recogniser matches text whose group the source never closes — and the schema positions " +
      "already answer it with the targeted row rather than a malformed-syntax one",
  ],
  [
    "c2",
    "enum[]",
    "the EMPTY list: no items at all, still an inline-enum spelling by the registered row's own " +
      "words (\"`enum[\\\"a\\\", \\\"b\\\"]` or another inline-enum spelling\")",
  ],
  [
    "c3",
    'enum ["a"]',
    "a SPACE between the keyword and the bracket: `/^\\s*enum\\s*\\[/` admits interior " +
      "whitespace, so the author who spaces the form gets the same answer",
  ],
  [
    "c4",
    'enum["a"]',
    "the ONE-ITEM list: the item count is not a discriminator for the recogniser and must not " +
      "become one at `params:`",
  ],
  [
    "c5",
    '  enum["x"]',
    "LEADING whitespace before the keyword: `^\\s*` admits it, and the YAML single-quoted " +
      "scalar preserves it, so the fixture proves the anchor's own leading-whitespace tolerance " +
      "reaches this position too",
  ],
  [
    "c6",
    'enum["x"] extra',
    "TRAILING junk after a closed list: the anchor matches the START, so trailing text does not " +
      "un-match it. At `params:` the whole scalar is the field's type text, so the widened row " +
      "owns it — the same verdict the alias arm gives",
  ],
  [
    "c7",
    "enum[a: b]",
    "a YAML-MAPPING-shaped interior: brace-free, so the fragment-level brace exemption does not " +
      "reach it and it draws the generic text row at HEAD; the anchor matches it, so route (a) " +
      "must hand it the targeted one",
  ],
  [
    "c8",
    'enum["x"] | string',
    "a UNION TAIL after the inline enum. This is the anchor's own asymmetry with b1: the enum " +
      "sits in FIRST position, so the field's top-level text starts with `enum[` and matches, " +
      "where `string | enum[...]` does not",
  ],
  [
    "c9",
    'enum["x", "y"] = "x"',
    "the DEFAULT half: `splitParamValue` (src/parser/frontmatter.ts) separates the declared-type " +
      "half from the default literal, so the recogniser sees `enum[\"x\", \"y\"]` and the row " +
      "fires on the type half — the default-side rows stay suppressed behind it (the " +
      "`theta/parse/inline-enum` row's own no-default-side-diagnostic sentence)",
  ],
];

describe("bug 0162 (c) — every spelling the anchored recogniser matches flips together", () => {
  for (const [id, typeSource, why] of EDGE_SPELLINGS) {
    it(`RED (${id}, params): \`${FIELD_NAME}: '${typeSource}'\` draws the inline-enum row`, () => {
      // Route (a) reuses ONE predicate, so the `params:` position inherits its
      // whole matched set at a stroke — there is no per-spelling wiring to get
      // wrong, and a red on any single row here would mean the fix re-spelled
      // the predicate rather than reusing `checkInlineEnumForm`. 
      const label = `${id} (params, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        r.lines,
        `${label}: ${why}. GREEN means route (a) reused the exported anchored recogniser over ` +
          `the field's own \`typeSource\`, so this spelling reads exactly as it reads at the ` +
          `\`schema\` alias arm (cell ${id}s). RED with \`${PARAMS_REFUSAL}\` is bug 0162's ` +
          `symptom on this spelling: the position answers a recognised, named, registered ` +
          `mistake with the generic "not a theta type expression" text. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([inlineEnumLine()]);
    });

    it(`GREEN (${id}s, alias): \`schema ${DECL_NAME} = ${typeSource}\` already draws it`, () => {
      // The comparator that makes the RED cell above a DIVERGENCE claim rather
      // than a bare emission claim: the alias arm's verdict is the target, and
      // it is read from the same tree in the same run. 
      const label = `${id}s (alias, ${typeSource})`;
      const r = read(label, "alias", typeSource);
      expect(
        r.codes[0],
        `${label}: ${why}. This is the target value cell ${id} must reach — measured, not ` +
          `assumed. Two of these spellings additionally break the alias declaration's own ` +
          `right-hand-side parse and draw follow-on rows beside the inline-enum one, so this ` +
          `cell pins the FIRST emitted code only; what it establishes is that the recogniser ` +
          `fires here for this spelling. A red means the comparator moved and the whole ` +
          `divergence framing of group (c) needs re-deriving. Observed: ` +
          `${JSON.stringify(r.lines)}`,
      ).toBe(INLINE_ENUM);
    });
  }
});

// ===========================================================================
// (d) EXACTLY ONE DIAGNOSTIC PER OFFENDING FIELD — §Fix constraint 3.
//
// "A `params:` field must not draw both a widened `theta/parse/inline-enum` and
// 0059's `theta/load/params-type-not-expression` for one text; whichever route
// lands states which code survives and the other site suppresses." Under the
// adjudicated route the widened row fires INSTEAD OF the generic one. This
// group is the guard on the cheap wrong fix — adding an emission beside the
// existing one — which every cell above would otherwise still read as red-then-
// green only on its `toEqual`.
// ===========================================================================

describe("bug 0162 (d) — the widened row fires instead of the generic one, never beside it", () => {
  const SUBJECT_TEXTS: readonly string[] = [
    T,
    ...EDGE_SPELLINGS.map(([, typeSource]) => typeSource),
    "enum[{a: string}]",
  ];

  for (const typeSource of SUBJECT_TEXTS) {
    it(`(d1) \`${FIELD_NAME}: '${typeSource}'\` draws exactly one diagnostic`, () => {
      // GREEN at HEAD for every spelling that already draws the generic row
      // (one diagnostic, wrong code — which group (a)/(c) own) and RED for the
      // brace-interior spelling, which draws ZERO at HEAD (group (e)). Both
      // directions are therefore live in this group. 
      const label = `d1 (params, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        r.lines.length,
        `${label}: §Fix constraint 3 — exactly ONE diagnostic per offending field, at HEAD and ` +
          `after the fix alike. RED with 2 means route (a) added an emission BESIDE ` +
          `\`${PARAMS_REFUSAL}\` instead of in place of it, which is 0129's multiplicity defect ` +
          `re-created in this row; RED with 0 means the field drew nothing at all (the ` +
          `brace-interior spelling's HEAD state, group (e)). ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toBe(1);
      expect(
        r.gateCount,
        `${label}: and the one diagnostic is error-severity in a namespace \`hasLoadParseError\` ` +
          `(src/extension/production-composition.ts) reads, so the theta does not register with ` +
          `a field the author wrote as an enumeration validating nothing. Both codes in play ` +
          `satisfy this, so a red here is the emission disappearing, not the code changing`,
      ).toBe(1);
    });
  }
});

// ===========================================================================
// (e) THE ONE CLEAN-LOAD FLIP — the single GOV-15 emission-set ADDITION.
//
// `p: 'enum[{a: string}]'` loads CLEAN at HEAD: the fragment-level text
// judgement bug 0059 landed exempts every fragment carrying a `{` or `}`
// (code-registry-load.md:19, the brace exemption), so this one inline-enum
// spelling escapes even the generic refusal, lowers the assert-nothing `{}`,
// records `enum[{a: string}]` as the field's declared type and REGISTERS. The
// `schema` field position draws the targeted row for the same bytes.
//
// This is the only input in this file that satisfies the loads-cleanly
// predicate (source-language-stability.md:9) at HEAD and stops satisfying it
// after the fix, so it is exactly the addition GOV-15's diagnostic-registry
// carve-out (:25) disposes of and the new *Trigger* prose must enumerate
// (DIAG-2, diagnostic-shape.md:72). It is pinned here so the carve-out's scope
// is a measured set of one rather than an estimate.
// ===========================================================================

describe("bug 0162 (e) — the brace-interior spelling stops loading cleanly", () => {
  const BRACE_INTERIOR = "enum[{a: string}]";

  it(`RED (e1, params): \`${FIELD_NAME}: '${BRACE_INTERIOR}'\` draws the inline-enum row`, () => {
    // The anchored recogniser matches (`enum` then `[`), so route (a) hands
    // this spelling the targeted row like every other member of the matched
    // set — the brace exemption belongs to the fragment-level TEXT judgement,
    // which route (a) fires instead of, not to the recogniser. 
    const label = `e1 (params, ${BRACE_INTERIOR})`;
    const r = read(label, "params", BRACE_INTERIOR);
    expect(
      r.lines,
      `${label}: at HEAD this field loads CLEAN — the fragment carries braces, so bug 0059's ` +
        `judgement exempts it (code-registry-load.md:19) and not even the generic refusal ` +
        `fires. The anchored recogniser route (a) reuses matches it regardless, so after the ` +
        `fix it draws \`${INLINE_ENUM}\` like the rest of the matched set. RED with \`[]\` is ` +
        `bug 0162's pre-0059 symptom preserved in one spelling: input schemas.md:93 prohibits ` +
        `in terms loads clean, lowers \`{}\` and registers. ` +
        `Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([inlineEnumLine()]);
  });

  it(`RED (e2, params): \`${FIELD_NAME}: '${BRACE_INTERIOR}'\` no longer registers`, () => {
    // The GOV-15 half, measured through the two properties the shipped drop
    // gate reads plus the frontmatter collapse — the way the sibling unit locks
    // reach registration offline. 
    const label = `e2 (params registration, ${BRACE_INTERIOR})`;
    const r = read(label, "params", BRACE_INTERIOR);
    const recorded = r.doc.frontmatter?.params?.fields?.find((f) => f.wireName === FIELD_NAME);
    expect(
      r.gateCount,
      `${label}: at HEAD this load raises ZERO error-severity \`theta/parse/\` / \`theta/load/\` ` +
        `codes, which is exactly what \`hasLoadParseError\` ` +
        `(src/extension/production-composition.ts) reads, so the theta REGISTERS — with the ` +
        `field's declared type recorded as ${JSON.stringify(recorded?.type ?? null)} and the ` +
        `lowered property ` +
        `${JSON.stringify(
          (r.doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined)?.[
            "properties"
          ] ?? null,
        )}, a fragment that admits every value. Route (a) puts this input into the code's ` +
        `emission set, which is the ONE addition GOV-15's carve-out ` +
        `(source-language-stability.md:25) disposes of and the widened *Trigger* must enumerate. ` +
        `RED with 0 is that addition still missing. Observed: ${JSON.stringify(r.lines)}`,
    ).toBe(1);
    expect(
      r.frontmatterPresent,
      `${label}: and the whole frontmatter is withheld, so the theta is absent from the registry ` +
        `rather than degraded — the same collapse every other spelling in groups (a) and (c) ` +
        `already produces at this position`,
    ).toBe(false);
  });

  it(`GREEN (e3, schema field): \`a: ${BRACE_INTERIOR}\` already draws the inline-enum row`, () => {
    // The comparator: the declaration position answers these same bytes with
    // the targeted row today, which is what makes e1/e2 a divergence claim. 
    const label = `e3 (field, ${BRACE_INTERIOR})`;
    const r = read(label, "field", BRACE_INTERIOR);
    expect(
      r.lines,
      `${label}: the object form's field-type pass hands the field's whole \`typeSource\` to the ` +
        `anchored recogniser, which matches before any brace exemption is consulted — so the ` +
        `declaration position refuses what \`params:\` registers. This is bug 0162's divergence ` +
        `at its widest: not two codes for one mistake, but a refusal against a clean load. ` +
        `Observed: ${JSON.stringify(r.lines)}`,
    ).toEqual([inlineEnumLine()]);
  });
});
