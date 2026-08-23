import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildBodyTypeSchemas,
  lowerInlineObject,
  lowerTypeSource,
} from "../src/parser/body-type-lowering";
import type { EnumDecl, SchemaDecl } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import type { LoweredSchema } from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0098 — step 3 of the Lowering Algorithm in
// `docs/spec_topics/schema-subset.md` spells three emissions that touch a
// literal: a single literal of any kind (`schema-subset.md:79`,
// `{ "const": <value> }`), an enum or a STRING-literal union
// (`schema-subset.md:80`, `{ "type": "string", "enum": [...] }`), and SUBS-1's
// union of `PrimitiveType` arms (`schema-subset.md:81`, `{ "type": [...] }`).
// A union of two or more `LiteralType` arms (`docs/spec_topics/grammar.md:102`)
// NOT all of which are strings — `1 | 2`, `true | false`, `"x" | null`,
// `"x" | 1` — matches none of the three, and the shipped front end answers
// anyway with a bare `{ "enum": [...] }`
// (docs/bugs/0098-nonstring-literal-union-emission-unspecified.md).
//
// WHY THE SILENCE COSTS BYTES, NOT VERDICTS. Both candidate emissions — the
// bare form and a per-kind typed form — admit and refuse exactly the same JSON
// values, so no conformance suite over accept/reject discriminates them. What
// moves is the emitted bytes, and the bytes are content-addressed: they name
// the registered `__theta_respond_<slug>` tool, the hoisted `__inline_<slug>`
// `$defs` key, the PIC-44 registration cache key, and the schema text
// interpolated into the QRY-15 instruction shown to the model. A second
// implementation reading the corpus can derive none of them.
//
// THE RESOLUTION THIS FILE WITNESSES: bug 0098 §Fix disposition 1, a lawful
// fill. Step 3 gains a normative rule minted SUBS-3 stating that a union of two
// or more `LiteralType` arms not all of which are strings lowers to the bare
// `{ "enum": [...values...] }` form with NO `type` keyword, the `enum` array
// ordered by the existing *Array element order* clause
// (`schema-subset.md:85`), and a `null` arm carried by that rule rather than by
// SUBS-1. The rule RATIFIES the shipped bytes: no `src/**` change, no emitted
// byte moves, no slug moves.
//
// WHY THE RULE MUST LAND ON THE EXISTING BULLET AND NOT ON A NEW LINE.
// `docs/spec_topics/schema-subset.md` carries 271 inbound citations at lines
// at or after `schema-subset.md:81`, and `schema-subset.md:79`,
// `schema-subset.md:80`, `schema-subset.md:81`, `schema-subset.md:85`,
// `schema-subset.md:87`, `schema-subset.md:94`, `schema-subset.md:98`,
// `schema-subset.md:100`, `schema-subset.md:104` and `schema-subset.md:108`
// are each cited by name from `docs/bugs/**` and from `tests/**`. An inserted
// line falsifies every one of them silently. Group (a) therefore demands the
// rule INSIDE the `schema-subset.md:80` bullet and pins both files' total line
// counts, so a nil-shift edit passes and a shifting edit fails.
//
// SPEC ANCHORS (the contract, not the current code):
//   - `docs/spec_topics/schema-subset.md:74` — step 3, *Emits per type form*,
//     the enumeration SUBS-3 completes.
//   - `docs/spec_topics/schema-subset.md:7` — `enum` is admitted as a
//     validation keyword with no `type`-keyword precondition, so the bare form
//     is inside the subset; what is absent is a sentence electing it.
//   - `docs/spec_topics/schema-subset.md:85` — *Array element order*: the
//     `enum` array carries values in source enumeration order. Group (h) pins
//     it for the mixed-kind case SUBS-3 newly covers.
//   - `docs/spec_topics/grammar.md:94` (`Type "|" Type`),
//     `docs/spec_topics/grammar.md:97` (`PrimitiveType` — the five type
//     keywords), `docs/spec_topics/grammar.md:102` (`LiteralType` — `STRING`,
//     `NUMBER`, `BOOLEAN`, `NULL`). A literal union is `LiteralType` arms, so
//     SUBS-1 is not its rule.
//   - `docs/reference/schema-subset.md` — the user-facing mirror, edited in the
//     same commit per the corpus's spec/reference mirroring.
//
// A STALE CLAIM IN THE BUG DOCUMENT, RE-DERIVED HERE. The report's §Affected
// "Positions the branch does not reach" section — `params: p: 1 | 2` lowering
// `{"anyOf":[{},{}]}` and `array<1 | 2>` lowering
// `{"type":"array","items":{"anyOf":[{},{}]}}` — no longer holds. Bug 0056's
// fix routed the `params:` right-hand side through the same literal
// sublanguage, and bug 0164's fix routed the generic-ARGUMENT recursion
// through it, so BOTH positions now reach the branch and carry the bare form.
// Groups (g) and (d) measure them, which widens what SUBS-3 governs without
// changing which bytes it ratifies.
//
// CONTENTS
//   (a) b0098 — SPEC-TEXT WITNESS. SUBS-3 exists, is anchored, lands inside the
//       `schema-subset.md:80` bullet, states the bare emission and the
//       `null`/SUBS-1 boundary, is mirrored in `docs/reference/schema-subset.md`,
//       and shifts no line of either file. RED until the rule lands.
//   (b) b0098 — the bare-enum emission through `lowerTypeSource` directly, at
//       every literal-kind mixture that reaches the branch.
//   (c) b0098 — the controls SUBS-3 must NOT touch: the string-literal union,
//       the single literal of each kind, SUBS-1, and the mixed union.
//   (d) b0098 — the `@<T>` / `invoke<T>` annotation root, at depth 0, inside an
//       inline object, inside a hoisted nested inline object, and under
//       `array<T>` at two depths.
//   (e) b0098 — the `lowerInlineObject` field position.
//   (f) b0098 — the declared-body positions through `buildBodyTypeSchemas`:
//       `schema` field, alias right-hand side, generic argument, hoisted
//       nested inline object.
//   (g) b0098 — the `params:` position, which reaches the branch since bug
//       0056.
//   (h) b0098 — the source-order pin the *Array element order* clause already
//       owns, for the mixed-kind union.
//
// Groups (b) through (h) are GREEN at HEAD and must STAY green byte-for-byte:
// they are the emission SUBS-3 ratifies, and any drift in them is a change to
// the on-wire contract rather than a docs fill.

// ===========================================================================
// Spec-text fixtures.
// ===========================================================================

/** The normative page carrying step 3 and the rule SUBS-3 must join. */
const SPEC_TOPIC_PATH = "docs/spec_topics/schema-subset.md";

/** The user-facing mirror that restates step 3. */
const REFERENCE_PATH = "docs/reference/schema-subset.md";

function readCorpusFile(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}

const SPEC_TOPIC_TEXT = readCorpusFile(SPEC_TOPIC_PATH);
const REFERENCE_TEXT = readCorpusFile(REFERENCE_PATH);

/**
 * Total newline-separated segments of each file at HEAD. Pinned as literals
 * rather than read back from git: the invariant is that the files do not grow,
 * and a git-relative comparison goes vacuously true the moment the fill is
 * committed.
 */
const SPEC_TOPIC_SEGMENTS = 119;
// Re-pinned 290→293 at 0.252.0 merge: bug 0256 (0.251.0) landed +3 lines in
// docs/reference/schema-subset.md (its DIAG-2 residual-exclusion rewrite)
// after this lane forked; the no-growth invariant now holds from 293.
// Re-pinned 293→299 at 0.253.0 merge: bug 0046 (0.253.0) landed +6 lines in
// docs/reference/schema-subset.md (its DIAG-2 mirror of the new
// absent-discriminator-field row); the no-growth invariant holds from 299.
const REFERENCE_SEGMENTS = 299;

/** The step-3 bullet SUBS-3 is appended into, identified by text, not position. */
const ENUM_BULLET_TOKEN = "Enum (or string-literal union)";

/** The 1-based line the bullet occupies at HEAD; nil shift keeps it there. */
const ENUM_BULLET_LINE = 80;

/** Tokens the SUBS-3 sentence owes, each with the obligation it discharges. */
const SUBS3_LINE_TOKENS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly owed: string;
}> = [
  {
    pattern: /<a id="subs-3"><\/a>/,
    owed:
      "a linkable anchor, so the code comment on the literal-union arm and the two " +
      "regression files that pin its bytes can cite a rule instead of arguing from " +
      "the silence of the enum / string-literal-union bullet",
  },
  {
    pattern: /\bSUBS-3\b/,
    owed: "the minted rule id itself, the token inbound citations name",
  },
  {
    pattern: /\{ "enum": \[\.\.\.values\.\.\.\] \}/,
    owed:
      "the emitted form spelled verbatim, since the bytes and not the verdict are " +
      "what a second implementation cannot derive",
  },
  {
    pattern: /no\s+`?type`?\s+keyword/i,
    owed:
      "the explicit ABSENCE of the `type` keyword — the one byte that separates " +
      "this emission from the string-literal-union emission beside it",
  },
  {
    pattern: /not all (?:of which )?(?:are )?strings|not all strings/i,
    owed:
      "the condition: a union of two or more literal arms NOT all of which are " +
      "strings, the exact complement of the all-strings guard already stated",
  },
  {
    pattern: /`?null`?/,
    owed:
      'the null-arm case (`"x" | null`, `1 | null`, `true | null`), which reaches ' +
      "this branch and must be carried by a named rule",
  },
  {
    pattern: /\bSUBS-1\b/,
    owed:
      "the boundary against SUBS-1, which fixes the multi-type-array form for " +
      "`PrimitiveType` arms and does not govern `LiteralType` arms",
  },
  {
    pattern: /Array element order/,
    owed:
      "the ordering authority for the emitted `enum` array, which stays the " +
      "existing *Array element order* clause rather than a second ordering rule",
  },
];

/** The mirror's obligation: the same emission restated, position-free. */
const REFERENCE_TOKENS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly owed: string;
}> = [
  {
    pattern: /\bSUBS-3\b/,
    owed: "the rule id, so a reader of the reference can follow it back",
  },
  {
    pattern: /\{ "enum": \[\.\.\.values\.\.\.\] \}/,
    owed: "the emitted form, restated for the user-facing audience",
  },
];

// ===========================================================================
// Loud drivers — every absent intermediate throws naming the unmet condition.
// ===========================================================================

/** An empty body-type map: the direct-call fixtures name no declared type. */
function noBodyTypes(): Map<string, Record<string, unknown>> {
  return new Map<string, Record<string, unknown>>();
}

/**
 * One direct `lowerTypeSource` call. An unresolved-name entry would mean the
 * source never reached the literal sublanguage, so the row would be measuring
 * a different branch than the one SUBS-3 governs.
 */
function lowerSource(label: string, source: string): Record<string, unknown> {
  const unresolved: string[] = [];
  const lowered = lowerTypeSource(source, noBodyTypes(), {}, unresolved);
  expect(
    unresolved,
    `${label}: \`${source}\` names no declared type, so an unresolved-name entry ` +
      `here would mean the literal sublanguage was never entered; observed ` +
      `${JSON.stringify(unresolved)}`,
  ).toEqual([]);
  return lowered;
}

/** The rendered diagnostics of a parsed fixture, for failure messages. */
function diagLines(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The `schema` / `enum` declarations of a body that MUST parse cleanly. */
function declsOf(
  label: string,
  body: string,
): { readonly schemas: SchemaDecl[]; readonly enums: EnumDecl[] } {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}\n`, "bug0098.theta");
  expect(
    diagLines(doc),
    `${label}: a non-string literal union is legal theta at every Type position ` +
      `(grammar.md:94 with grammar.md:102), so the fixture must load with NO ` +
      `diagnostics or the lowering under assertion never runs; observed ` +
      `${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  return {
    schemas: doc.body.statements.filter(
      (s): s is SchemaDecl => s.kind === "schema",
    ),
    enums: doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum"),
  };
}

/** One `@<T>` annotation lowered against an empty body, never `undefined`. */
function annotationRoot(label: string, annotation: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, [], []);
  if (lowered === undefined) {
    throw new Error(
      `${label}: \`@<${annotation}>\` lowered to nothing, so the typed query would ` +
        `bind an UNVALIDATED response; only the EMPTY annotation may lower to undefined`,
    );
  }
  return lowered;
}

/** One `$defs` entry of a body's lowered type map, never absent. */
function bodyDef(
  label: string,
  body: string,
  name: string,
): Record<string, unknown> {
  const { schemas, enums } = declsOf(label, body);
  const def = buildBodyTypeSchemas(schemas, enums).get(name);
  if (def === undefined) {
    throw new Error(
      `${label}: \`${name}\` is declared in the fixture body, so ` +
        `\`buildBodyTypeSchemas\` must return a \`$defs\` entry for it; the map is ` +
        `empty at that key`,
    );
  }
  return def;
}

/** The lowered `params:` schema of a theta that MUST load, never absent. */
function paramsSchema(label: string, source: string): LoweredSchema {
  const doc = parseDoc(source, "bug0098-params.theta");
  expect(
    diagLines(doc),
    `${label}: a literal union is legal theta in the \`params:\` position ` +
      `(grammar.md:105), so this fixture must load with NO diagnostics; observed ` +
      `${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there ` +
        `is no AJV-validatable document at the argument boundary. Diagnostics: ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return lowered;
}

/** Assert exact emitted bytes, naming SUBS-3 and the position in the failure. */
function expectBytes(
  label: string,
  observed: unknown,
  expected: string,
  position: string,
): void {
  expect(
    JSON.stringify(observed),
    `${label}: SUBS-3 (schema-subset.md:80) elects the bare ` +
      `\`{ "enum": [...values...] }\` emission with no \`type\` keyword, and ratifies ` +
      `it at ${position}. These bytes name the \`__theta_respond_<slug>\` tool, the ` +
      `\`__inline_<slug>\` \`$defs\` key and the PIC-44 cache key, so a move here is a ` +
      `breaking change to the on-disk and on-wire contract (schema-subset.md:94), ` +
      `not a refactor; observed ${JSON.stringify(observed)}`,
  ).toBe(expected);
}

/** The `params:` fixture. A bare `"` in a type breaks YAML, so `r` is quoted whole. */
const PARAMS_SOURCE = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: 1 | 2",
  "  q: true | false",
  `  r: '"x" | null'`,
  "  s: array<1 | 2>",
  "  t: 1 | 1.5",
  "---",
  "let a = 1",
  "",
].join("\n");

/** The `$defs` key the nested inline object of `@<{a: {b: 1 | 2}}>` hoists. */
const ANNOTATION_INLINE_DEF = "__inline_17e23f7b81fba003";

/** The `$defs` key the nested inline object of `schema W { p: { q: 1 | 2 } }` hoists. */
const BODY_INLINE_DEF = "__inline_486cdf9970e0af23";

// ===========================================================================
// (a) b0098 — SPEC-TEXT WITNESS. The rule that closes the gap.
// ===========================================================================

describe("(a) b0098 — SUBS-3 is stated in step 3, in place, and shifts no line", () => {
  it("a1 — the spec topic carries the SUBS-3 anchor and id", () => {
    expect(
      SPEC_TOPIC_TEXT.includes('<a id="subs-3"></a>'),
      `a1: ${SPEC_TOPIC_PATH} must carry the anchor \`<a id="subs-3"></a>\` so the ` +
        `emission for a literal union not all of whose arms are strings is a citable ` +
        `rule. Today the disposition exists only as a code comment on the ` +
        `literal-union arm of \`lowerTypeSource\` and as test rows in two closed ` +
        `reports' regression files, all three arguing from the SILENCE of ` +
        `schema-subset.md:80 — an argument a later widening of that bullet would ` +
        `falsify without failing anything (bug 0098 §Why it matters item 3)`,
    ).toBe(true);
    expect(
      SPEC_TOPIC_TEXT.includes("SUBS-3"),
      `a1: ${SPEC_TOPIC_PATH} must carry the rule id \`SUBS-3\`, the token inbound ` +
        `citations name`,
    ).toBe(true);
  });

  it("a2 — SUBS-3 lands INSIDE the existing enum / string-literal-union bullet", () => {
    const lines = SPEC_TOPIC_TEXT.split("\n");
    const index = lines.findIndex((line) => line.includes(ENUM_BULLET_TOKEN));
    expect(
      index,
      `a2: ${SPEC_TOPIC_PATH} must still carry the step-3 bullet naming ` +
        `"${ENUM_BULLET_TOKEN}" — SUBS-3 joins that bullet, it does not replace it ` +
        `(bug 0098 §Fix constraint 5: the string-literal half does not move)`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      index + 1,
      `a2: the bullet must remain at line ${ENUM_BULLET_LINE} of ${SPEC_TOPIC_PATH}. ` +
        `271 inbound citations point at lines at or after schema-subset.md:81, so ` +
        `an edit that moves this bullet silently falsifies all of them ` +
        `(bug 0098 §Fix constraint 4)`,
    ).toBe(ENUM_BULLET_LINE);

    const bullet = lines[index] ?? "";
    for (const { pattern, owed } of SUBS3_LINE_TOKENS) {
      expect(
        pattern.test(bullet),
        `a2: the SUBS-3 sentence must be APPENDED INTO the ` +
          `"${ENUM_BULLET_TOKEN}" bullet (line ${ENUM_BULLET_LINE} of ` +
          `${SPEC_TOPIC_PATH}), not inserted as a new line, and that one line must ` +
          `carry ${owed}. No text matching ${String(pattern)} is on it. Observed ` +
          `line: ${JSON.stringify(bullet)}`,
      ).toBe(true);
    }
  });

  it("a3 — the user-facing mirror restates the emission", () => {
    for (const { pattern, owed } of REFERENCE_TOKENS) {
      expect(
        pattern.test(REFERENCE_TEXT),
        `a3: ${REFERENCE_PATH} restates step 3 for the user-facing audience and is ` +
          `edited in the same commit as ${SPEC_TOPIC_PATH} (bug 0098 §Fix ` +
          `constraint 3), so it must carry ${owed}. No text matching ` +
          `${String(pattern)} is anywhere in the file`,
      ).toBe(true);
    }
  });

  it("a4 — neither file grew: the fill is line-count preserving", () => {
    expect(
      SPEC_TOPIC_TEXT.split("\n").length,
      `a4: ${SPEC_TOPIC_PATH} must keep exactly ${SPEC_TOPIC_SEGMENTS} ` +
        `newline-separated segments. 271 inbound citations from docs/bugs/** and ` +
        `tests/** point at lines at or after schema-subset.md:81; a line inserted ` +
        `at or before schema-subset.md:80 shifts every one of them and nothing ` +
        `else fails when it does (bug 0098 §Fix constraint 4). SUBS-3 is appended ` +
        `into the existing bullet for exactly this reason`,
    ).toBe(SPEC_TOPIC_SEGMENTS);
    expect(
      REFERENCE_TEXT.split("\n").length,
      `a4: ${REFERENCE_PATH} must keep exactly ${REFERENCE_SEGMENTS} ` +
        `newline-separated segments, for the same citation-stability reason as ` +
        `${SPEC_TOPIC_PATH}`,
    ).toBe(REFERENCE_SEGMENTS);
  });
});

// ===========================================================================
// (b) b0098 — the emission SUBS-3 ratifies, through `lowerTypeSource` directly.
// ===========================================================================

describe("(b) b0098 — every non-all-strings literal union lowers to the bare enum form", () => {
  const rows: ReadonlyArray<{
    readonly id: string;
    readonly source: string;
    readonly bytes: string;
  }> = [
    { id: "b1", source: "1 | 2", bytes: '{"enum":[1,2]}' },
    { id: "b2", source: "1 | 1.5", bytes: '{"enum":[1,1.5]}' },
    { id: "b3", source: "true | false", bytes: '{"enum":[true,false]}' },
    { id: "b4", source: '"x" | null', bytes: '{"enum":["x",null]}' },
    { id: "b5", source: "1 | null", bytes: '{"enum":[1,null]}' },
    { id: "b6", source: "true | null", bytes: '{"enum":[true,null]}' },
    { id: "b7", source: '"x" | 1', bytes: '{"enum":["x",1]}' },
  ];

  for (const { id, source, bytes } of rows) {
    it(`${id} — \`${source}\``, () => {
      expectBytes(
        id,
        lowerSource(id, source),
        bytes,
        `\`lowerTypeSource("${source}")\``,
      );
    });
  }
});

// ===========================================================================
// (c) b0098 — the controls SUBS-3 must not reach.
// ===========================================================================

describe("(c) b0098 — the emissions already spelled elsewhere do not move", () => {
  const rows: ReadonlyArray<{
    readonly id: string;
    readonly source: string;
    readonly bytes: string;
    readonly ruleWhy: string;
  }> = [
    {
      id: "c1",
      source: '"x" | "y"',
      bytes: '{"type":"string","enum":["x","y"]}',
      ruleWhy:
        "the ALL-strings half of the same bullet, whose `type` keyword schema-subset.md:80 " +
        "already spells; SUBS-3 is its complement and must not widen onto it",
    },
    {
      id: "c2",
      source: '"x"',
      bytes: '{"const":"x"}',
      ruleWhy:
        "a single literal, which schema-subset.md:79 covers with `const`",
    },
    {
      id: "c3",
      source: "1",
      bytes: '{"const":1}',
      ruleWhy:
        "a single literal, which schema-subset.md:79 covers with `const`",
    },
    {
      id: "c4",
      source: "true",
      bytes: '{"const":true}',
      ruleWhy:
        "a single literal, which schema-subset.md:79 covers with `const`",
    },
    {
      id: "c5",
      source: "null",
      bytes: '{"const":null}',
      ruleWhy:
        "a single literal, which schema-subset.md:79 covers with `const`",
    },
    {
      id: "c6",
      source: "string | null",
      bytes: '{"type":["string","null"]}',
      ruleWhy:
        "a union of `PrimitiveType` arms, which SUBS-1 (schema-subset.md:81) owns; " +
        "SUBS-3's `null`-arm clause carries the LITERAL union only and must not " +
        "annex this one",
    },
    {
      id: "c7",
      source: "1 | string",
      bytes: '{"anyOf":[{"const":1},{"type":"string"}]}',
      ruleWhy:
        "a mixed union whose non-literal arm keeps the whole union off the literal " +
        "sublanguage; its literal ARM lands on schema-subset.md:79's `const`",
    },
  ];

  for (const { id, source, bytes, ruleWhy } of rows) {
    it(`${id} — \`${source}\` stays on its own rule`, () => {
      expect(
        JSON.stringify(lowerSource(id, source)),
        `${id}: \`${source}\` is ${ruleWhy}. SUBS-3 is a lawful fill that ratifies ` +
          `only the bare-enum branch and moves no other emission; observed ` +
          `${JSON.stringify(lowerSource(id, source))}`,
      ).toBe(bytes);
    });
  }
});

// ===========================================================================
// (d) b0098 — the annotation root, at every depth the branch reaches.
// ===========================================================================

describe("(d) b0098 — the `@<T>` / `invoke<T>` annotation root carries the bare form", () => {
  it("d1 — the non-brace root `@<1 | 2>`", () => {
    expectBytes(
      "d1",
      annotationRoot("d1", "1 | 2"),
      '{"enum":[1,2]}',
      "the typed-query annotation root, whose bytes `respondSchemaSlug` hashes to " +
        "name the registered `__theta_respond_<slug>` tool",
    );
  });

  it("d2 — a field of the brace root `@<{a: 1 | 2}>`", () => {
    expectBytes(
      "d2",
      annotationRoot("d2", "{a: 1 | 2}"),
      '{"type":"object","properties":{"a":{"enum":[1,2]}},"required":["a"],"additionalProperties":false}',
      "a field of the annotation root's brace form",
    );
  });

  it("d3 — a field of a hoisted nested inline object `@<{a: {b: 1 | 2}}>`", () => {
    const lowered = annotationRoot("d3", "{a: {b: 1 | 2}}");
    const defs = lowered["$defs"];
    expect(
      defs === null || typeof defs !== "object"
        ? undefined
        : Object.keys(defs as Record<string, unknown>),
      `d3: the nested inline object must hoist under \`${ANNOTATION_INLINE_DEF}\`, the ` +
        `\`__inline_<slug>\` name the canonical hash of the SUBS-3 fragment mints. A ` +
        `different key means the emitted bytes moved, which is a breaking change for ` +
        `every cached artefact keyed on them (schema-subset.md:94); observed ` +
        `${JSON.stringify(lowered)}`,
    ).toEqual([ANNOTATION_INLINE_DEF]);
    expectBytes(
      "d3",
      (defs as Record<string, unknown>)[ANNOTATION_INLINE_DEF],
      '{"type":"object","properties":{"b":{"enum":[1,2]}},"required":["b"],"additionalProperties":false}',
      `the hoisted \`${ANNOTATION_INLINE_DEF}\` entry`,
    );
  });

  it("d4 — the generic argument `@<array<1 | 2>>`, a position the branch reaches since bug 0164", () => {
    expectBytes(
      "d4",
      annotationRoot("d4", "array<1 | 2>"),
      '{"type":"array","items":{"enum":[1,2]}}',
      "the `array<T>` element type, which the generic-ARGUMENT recursion routes " +
        "through the same literal sublanguage",
    );
  });

  it("d5 — the doubly-nested generic argument `@<array<array<1 | 2>>>`", () => {
    expectBytes(
      "d5",
      annotationRoot("d5", "array<array<1 | 2>>"),
      '{"type":"array","items":{"type":"array","items":{"enum":[1,2]}}}',
      "the element type at generic nesting depth 2",
    );
  });
});

// ===========================================================================
// (e) b0098 — the inline-object field position.
// ===========================================================================

describe("(e) b0098 — `lowerInlineObject` carries the bare form per field", () => {
  it("e1 — `b: 1 | 2`", () => {
    expectBytes(
      "e1",
      lowerInlineObject("b: 1 | 2", noBodyTypes(), []),
      '{"type":"object","properties":{"b":{"enum":[1,2]}},"required":["b"],"additionalProperties":false}',
      "the inline-object field position, whose whole fragment is the hashed input to " +
        "the `__inline_<slug>` mint",
    );
  });
});

// ===========================================================================
// (f) b0098 — the declared-body positions, through the shipped front end.
// ===========================================================================

describe("(f) b0098 — declared `schema` bodies and alias right-hand sides", () => {
  const rows: ReadonlyArray<{
    readonly id: string;
    readonly body: string;
    readonly name: string;
    readonly bytes: string;
    readonly position: string;
  }> = [
    {
      id: "f1",
      body: "schema S { p: 1 | 2 }",
      name: "S",
      bytes:
        '{"type":"object","properties":{"p":{"enum":[1,2]}},"required":["p"],"additionalProperties":false}',
      position: "a `schema` body field",
    },
    {
      id: "f2",
      body: "schema T { p: true | false }",
      name: "T",
      bytes:
        '{"type":"object","properties":{"p":{"enum":[true,false]}},"required":["p"],"additionalProperties":false}',
      position: "a `schema` body field of boolean literals",
    },
    {
      id: "f3",
      body: 'schema U { p: "x" | null }',
      name: "U",
      bytes:
        '{"type":"object","properties":{"p":{"enum":["x",null]}},"required":["p"],"additionalProperties":false}',
      position: "a `schema` body field whose union admits `null`",
    },
    {
      id: "f4",
      body: "schema X = 1 | 2",
      name: "X",
      bytes: '{"enum":[1,2]}',
      position: "an alias right-hand side",
    },
    {
      id: "f5",
      body: 'schema Y = "x" | 1',
      name: "Y",
      bytes: '{"enum":["x",1]}',
      position: "an alias right-hand side of mixed literal kinds",
    },
    {
      id: "f6",
      body: "schema Z { p: array<1 | 2> }",
      name: "Z",
      bytes:
        '{"type":"object","properties":{"p":{"type":"array","items":{"enum":[1,2]}}},"required":["p"],"additionalProperties":false}',
      position: "a generic argument inside a `schema` body field",
    },
  ];

  for (const { id, body, name, bytes, position } of rows) {
    it(`${id} — \`${body}\``, () => {
      expectBytes(id, bodyDef(id, body, name), bytes, position);
    });
  }

  it("f7 — `schema W { p: { q: 1 | 2 } }` hoists the nested inline object", () => {
    const def = bodyDef("f7", "schema W { p: { q: 1 | 2 } }", "W");
    const defs = def["$defs"];
    expect(
      defs === null || typeof defs !== "object"
        ? undefined
        : Object.keys(defs as Record<string, unknown>),
      `f7: the nested inline object must hoist under \`${BODY_INLINE_DEF}\`; a ` +
        `different key means the SUBS-3 fragment's bytes moved and every cached ` +
        `artefact keyed on them broke (schema-subset.md:94); observed ` +
        `${JSON.stringify(def)}`,
    ).toEqual([BODY_INLINE_DEF]);
    expectBytes(
      "f7",
      (defs as Record<string, unknown>)[BODY_INLINE_DEF],
      '{"type":"object","properties":{"q":{"enum":[1,2]}},"required":["q"],"additionalProperties":false}',
      `the hoisted \`${BODY_INLINE_DEF}\` entry`,
    );
  });
});

// ===========================================================================
// (g) b0098 — the `params:` position, reached since bug 0056.
// ===========================================================================

describe("(g) b0098 — the `params:` block carries the bare form at every field", () => {
  it("g1 — every literal-union field of one `params:` block", () => {
    expectBytes(
      "g1",
      paramsSchema("g1", PARAMS_SOURCE),
      '{"type":"object","properties":{"p":{"enum":[1,2]},"q":{"enum":[true,false]},' +
        '"r":{"enum":["x",null]},"s":{"type":"array","items":{"enum":[1,2]}},' +
        '"t":{"enum":[1,1.5]}},"required":["p","q","r","s","t"],"additionalProperties":false}',
      "the `params:` argument boundary, which routes through the same literal " +
        "sublanguage since bug 0056 and so is governed by SUBS-3 too — the bug 0098 " +
        'report\'s "positions the branch does not reach" section is stale on this row',
    );
  });
});

// ===========================================================================
// (h) b0098 — the ordering clause SUBS-3 defers to.
// ===========================================================================

describe("(h) b0098 — the emitted `enum` array follows source enumeration order", () => {
  it('h1 — `"x" | 1` emits ["x",1], not [1,"x"]', () => {
    const values = lowerSource("h1", '"x" | 1')["enum"];
    expect(
      JSON.stringify(values),
      `h1: SUBS-3 defers the emitted array's order to the existing *Array element ` +
        `order* clause (schema-subset.md:85), which fixes source enumeration order. ` +
        `A reordering here would move the canonical form and with it every ` +
        `\`__theta_respond_<slug>\` and \`__inline_<slug>\` name minted over the ` +
        `fragment; observed ${JSON.stringify(values)}`,
    ).toBe('["x",1]');
  });
});
