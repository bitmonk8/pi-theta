import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  classifyGenericArgumentSegments,
  isUnspellableTextRefusable,
  lowerTypeExpr,
  splitTopLevel,
  type LowerCtx,
} from "../src/parser/params";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0204 — `lowerTypeExpr`'s generic-application arm reads its argument list
// with `splitTopLevel`'s `"angle"` default, whose brace/bracket tracking is off
// (`splitTopLevelSegments`' `tracksBraces` gate, src/parser/params.ts), so a
// derivable `GenericType` argument the author wrote as ONE unit is cut into
// fragments the source never spells. `array<{a: string, b: integer, c:
// boolean}>` becomes `{a: string` / `b: integer` / `c: boolean}`; each fragment
// recurses through `lowerGenericArgument` into `lowerTypeExpr`, misses every
// arm, lands on the trailing catch-all's `LowerCtx.unspellable` sink, and the
// brace-free MIDDLE fragment survives the shared decline
// (`isUnspellableTextRefusable`, which exempts a `LiteralType` atom and any text
// carrying `{` or `}`). The two positions that thread the sink through
// `collectUnresolvedNamedTypes` then refuse the enclosing declaration
// (`theta/parse/schema-type-not-expression`) and the `params:` position refuses
// the field (`theta/load/params-type-not-expression`) — both error-severity, so
// `hasLoadParseError` (src/extension/production-composition.ts) withholds
// registration, and at `params:` the whole frontmatter collapses to `null`.
// Meanwhile the grammar's own argument reader (`parseGeneric`, one `parseUnion`
// per argument) counts ONE argument, so `theta/parse/generic-arity-mismatch`
// does not fire, and the byte-identical text is admitted at bug 0124's three
// positions, whose recogniser (`annotationSourceIsNotTypeExpression`,
// src/parser/type-layer-checks.ts) declines a brace-and-angle source only where
// a split can still shred it, not on the bare presence of the two characters.
// The boundary itself is stated in one place, and this file does not restate
// it: the `theta/parse/annotation-type-not-expression` row of
// docs/spec_topics/diagnostics/code-registry-parse.md, read with that
// recogniser.
// (docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md)
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:90–:95 — the closed six-alternative `Type`
//     set; :99–:100 `GenericType`, whose argument is a recursive `Type`; :101
//     `ObjectType ::= "{" Field ("," Field)* ","? "}"`; :105 "The grammar is
//     otherwise identical in every position", which is what makes one expected
//     value readable at all three positions; :107 the closed constructor set
//     and the arity rule behind `theta/parse/generic-arity-mismatch`; :109
//     "`ObjectType` admits an anonymous object type `{ field: T, ... }` in any
//     `Type` position" and "nested inline objects and `array<{ ... }>` parse".
//   - docs/spec_topics/type-system.md:15 — one type grammar in every
//     type-annotation position, with the three refusal rows named as the
//     disposition for text deriving from NONE of the forms.
//   - docs/spec_topics/schemas.md:17 — schema "field types are any expression
//     from the Type System grammar".
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 — the `params:`
//     right-hand side is "a type expression parsed by the theta type grammar",
//     the inline object type is admitted, and the judged unit is "each fragment
//     of that text" — a clause about fragments the SOURCE spells.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2, the closed
//     registry) and :74 (DIAG-4, the normative *Message* column) — which is why
//     every expected message here is READ from the registry and none restated.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every RED fixture below fails today) and :25 (the
//     diagnostic-registry carve-out, under which bug 0204's edit is a code
//     REMOVAL for exactly the inputs this file's RED cells enumerate).
//
// WHAT THIS FILE PINS (bug 0204 §Expected behaviour; §Fix (c)(7) fixes the
// witness's shape as the §Reproduction (b) fixture matrix plus the (a) seam
// rows):
//   1. A `GenericType` argument that is an `ObjectType` draws NO refusal at any
//      of the three sink-threading positions, whatever its interior field count
//      (§Expected bullet 1) — group (b), RED.
//   2. The judged unit is text the author wrote (§Expected bullet 2). What moves
//      is only whether a MANUFACTURED fragment can be judged; the split itself,
//      its segment count, the shard-level verdict of the shared decline, and
//      every lowered byte stay byte-identical — group (a), GREEN in both
//      directions, and the sharpest fence in the file.
//   3. An inline `enum[…]` inside a generic argument stops drawing two
//      `schema-type-not-expression` naming the enclosure — group (g). Bug 0204's
//      own fix left the nested spelling drawing NOTHING (its §Fix (d) table
//      permitted either branch "stated either way"), and that silence was filed
//      as **bug 0217**
//      (docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md)
//      from bug 0204 §Fix *Residuals* item 1. Bug 0217's route — its §Fix
//      (b)(2), a refusal threaded for a recursed segment whose ENCLOSING cut
//      group derives from no `Type` alternative — restores ONE refusal per
//      position in that position's own registered code, so cells g3/g4 now
//      assert that one refusal rather than the count of two the shred produced
//      or the silence bug 0204 landed. The BARE spelling still keeps
//      `theta/parse/inline-enum` (group (g) g1/g2): bug 0217 does NOT extend
//      `checkInlineEnumForm`'s anchored match to depth, so that pair remains
//      the fence proving the anchored match was not touched. Bug 0217's own
//      witness is tests/nested-inline-enum-generic-argument-refusal.test.ts.
//   4. The refusals that stand, stand (§Expected bullet 5, §Fix (c)(1)): all six
//      §Reproduction (f) rows keep their code, count and position — group (f),
//      GREEN in both directions, and the reason bug 0204 §Fix (b)(2) (sharing
//      bug 0124's whole-source decline) is not the route taken.
//   5. Registration (§Reproduction (b)'s registration table) — group (k), RED.
//
// THE ROUTE THIS FILE IS WRITTEN AGAINST is §Fix (b)(3) in its
// traversal-suppression form: a group-aware probe over the argument-list
// interior decides whether the angle-only cut severed a group the author wrote
// as one unit, and when it did the shards recurse under a `LowerCtx` copy
// carrying no `unspellable` sink. Two consequences the cells below depend on:
//   - The `unresolved` sink is NOT dropped with it. Group (j) is the fence:
//     `Result<{…}, QueryError>` must keep `theta/parse/unresolved-named-type`
//     for `QueryError` alongside `theta/parse/result-in-schema-position`.
//   - §Fix (b)(3)'s own stated residual stands: the angle-only split still
//     disagrees with `parseGeneric` about the argument COUNT, so the two-field
//     spelling keeps lowering `{}` for a shape the grammar derives (cells c8,
//     a11). What an admitted generic argument lowers to is bug 0164's, 0039's
//     and 0184's subject (§Non-goals), and no cell here adjudicates it.
//
// THE ONE AUTHORIZED UNDER-REFUSAL, stated rather than discovered: group (h).
// `array<{a: Cat +, b: integer, c: boolean}>` carries junk the author DID write
// (`Cat +`), but that junk arrives inside the brace-rooted first shard
// `{a: Cat +`, which the shared decline exempts for its brace — so HEAD's only
// refusable entry is the MANUFACTURED `b: integer`, and removing the
// manufactured judgement leaves the row silent. That is exactly the class bug
// 0059's cell d13 already carries as an authorized under-refusal
// (`array<{a: ???}>`, admitted), and §Non-goals keeps the fragment-level brace
// exemption's domain out of scope. Group (h) asserts silence WITH that reason.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`, tests/helpers/e2e-s1.ts
// — the shipped front end with inert offline seams), plus three shipped seams
// called directly (`splitTopLevel`, `isUnspellableTextRefusable`,
// `lowerTypeExpr`) and one `lowerQueryResponseSchema` call. An integration tier
// could add nothing: the subject is which diagnostics a load emits and which
// bytes a type expression lowers to, both fully determined before any host or
// session exists, and the refusal un-registers the theta — so a live drive
// would observe only an absent slash command and could not distinguish this
// refusal from any other load error, while adding stochastic surface over a
// contract that has none. The registration consequence is reached the way the
// sibling unit locks reach it (tests/schema-body-nontype-text-refusal.test.ts's
// `expectBlocksRegistration`, tests/params-scalar-nontype-text-refusal.test.ts):
// by evaluating the two properties the shipped drop gate reads — error severity
// and the `theta/parse/` / `theta/load/` namespaces — over the diagnostics the
// fixture actually emitted, plus the frontmatter collapse.
//
// NO SILENT SKIPPING: every registry lookup asserts the row is present before
// using it, every fixture reader THROWS naming the absent intermediate when a
// declaration, a frontmatter block or a lowered `params:` document is missing,
// and no cell is `.skip`/`.todo`/`.only`. A broken fixture can never read as a
// pass.

// ===========================================================================
// The registered codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

const SCHEMA_REFUSAL = "theta/parse/schema-type-not-expression";
const PARAMS_REFUSAL = "theta/load/params-type-not-expression";
const INLINE_ENUM = "theta/parse/inline-enum";
const ARITY = "theta/parse/generic-arity-mismatch";
const RESULT_IN_SCHEMA = "theta/parse/result-in-schema-position";
const UNRESOLVED = "theta/parse/unresolved-named-type";
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";

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
 * rather than restated. Definedness is asserted first so a missing row reds by
 * naming the registry page instead of comparing against a bare `undefined`.
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

/** The schema-position refusal, rendered for the offending declaration's name. */
function schemaRefusal(declName: string): string {
  return line(SCHEMA_REFUSAL, [["<X>", declName]]);
}

/** The `params:`-position refusal, rendered for one field name. */
function paramsRefusal(field: string): string {
  return line(PARAMS_REFUSAL, [["<param>", field]]);
}

// ===========================================================================
// The three sink-threading positions, and the §Reproduction (b) fixtures.
// ===========================================================================

/** The three positions bug 0204 §Reproduction (b) measures. */
type Position = "field" | "alias" | "params";
const POSITIONS: readonly Position[] = ["field", "alias", "params"];

/** `Cat` for the rows whose text names it, so no unresolved-name diagnostic enters. */
const CAT_DECL = "schema Cat { a: string }\n";

/** The declaration each schema position refuses at — what `<X>` renders. */
const DECL_NAME: Record<Position, string> = { field: "S", alias: "X", params: "f" };

/** The §Reproduction (b) fixture for one position, with `T` substituted. */
function fixture(position: Position, typeSource: string, withCat: boolean): string {
  const cat = withCat ? CAT_DECL : "";
  if (position === "field") {
    return `${cat}schema S {\n  f: ${typeSource}\n}\nlet x = 1\n`;
  }
  if (position === "alias") {
    return `${cat}schema X = ${typeSource}\nlet x = 1\n`;
  }
  return `---\nmode: prompt\nparams:\n  f: '${typeSource}'\n---\n${cat}let x = 1\n`;
}

/** What one fixture yields. */
interface Read {
  /** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
  readonly lines: readonly string[];
  /** Distinct codes present, sorted. */
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
 * every way a fixture can fail to reach the lowering: a fixture whose
 * declaration never parsed would assert silence for the wrong reason.
 */
function read(label: string, position: Position, typeSource: string, withCat = false): Read {
  const src = fixture(position, typeSource, withCat);
  const doc = parseDoc(src, "bug0204.theta");
  if (position !== "params") {
    const wanted = DECL_NAME[position];
    const decl = doc.body.statements.find(
      (s): s is SchemaDecl => s.kind === "schema" && s.name === wanted,
    );
    if (decl === undefined) {
      throw new Error(
        `${label}: the fixture must declare \`schema ${wanted}\` for a type-position verdict to ` +
          `be attributable to it; statement kinds ` +
          `${JSON.stringify(doc.body.statements.map((s) => s.kind))}, diagnostics ` +
          `${JSON.stringify(diagLines(doc))}`,
      );
    }
  }
  return {
    lines: diagLines(doc),
    codes: [...new Set(doc.diagnostics.map((d) => d.code))].sort(),
    gateCount: doc.diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
    ).length,
    frontmatterPresent: doc.frontmatter !== null && doc.frontmatter !== undefined,
    doc,
  };
}

/**
 * The lowered `params:` property for field `f`, loud when the load withheld the
 * frontmatter or the lowered document: comparing `undefined` against a fragment
 * would pass or fail for a reason that is not the cell's.
 */
function loweredF(label: string, r: Read): unknown {
  const document = r.doc.frontmatter?.params?.loweredSchema as
    | Record<string, unknown>
    | undefined;
  if (document === undefined) {
    throw new Error(
      `${label}: the fixture declares a \`params:\` block, so its lowered schema must be present ` +
        `for the field's fragment to be readable; frontmatter present: ` +
        `${r.frontmatterPresent}, diagnostics ${JSON.stringify(r.lines)}`,
    );
  }
  const properties = document["properties"] as Record<string, unknown> | undefined;
  if (properties === undefined || !("f" in properties)) {
    throw new Error(
      `${label}: the lowered \`params:\` document carries no property \`f\`, so the field never ` +
        `lowered; document ${JSON.stringify(document)}`,
    );
  }
  return properties["f"];
}

/** The `LowerCtx` the direct-seam cells thread: no declarations, one sink. */
function seamCtx(): { readonly ctx: LowerCtx; readonly sink: string[] } {
  const sink: string[] = [];
  return {
    ctx: { bodyTypeMap: new Map(), defs: {}, unresolved: [], unspellable: sink },
    sink,
  };
}

// The type texts every group reuses, spelled once.
const T3 = "array<{a: string, b: integer, c: boolean}>";
const T3_NO_SPACES = "array<{a:string,b:integer,c:boolean}>";
const T4 = "array<{a: string, b: integer, c: boolean, d: string}>";
const T5 = "array<{a: string, b: integer, c: boolean, d: string, e: number}>";
const T3_NULL = "array<{a: string, b: integer, c: boolean}> | null";
const T3_NESTED = "array<array<{a: string, b: integer, c: boolean}>>";
const T3_BRACE_ROOT = "{a: array<{x: integer, y: integer, z: integer}>}";
const T2 = "array<{a: string, b: integer}>";
const T1 = "array<{a: string}>";
const T_ADMITTED_NEST = "array<{a: array<{x: integer, y: integer, z: integer}>}>";

/**
 * The whole disposition of an ADMITTED row: no diagnostic at all. Used by every
 * RED cell (which asserts §Expected's verdict, not HEAD's) and by every
 * admission fence.
 */
function expectAdmitted(label: string, r: Read, why: string): void {
  expect(
    r.lines,
    `${label}: ${why} — grammar.md:99–:101 derives the annotation and :109 admits an ` +
      `\`ObjectType\` "in any \`Type\` position", :105 makes the grammar "otherwise identical in ` +
      `every position", so the honest disposition is a clean load (bug 0204 §Expected bullet 1). ` +
      `Observed diagnostics: ${JSON.stringify(r.lines)}`,
  ).toEqual([]);
}

// ===========================================================================
// (a) THE SEAMS — GREEN in both directions. §Reproduction (a), §Fix (c)(7).
//
// The chosen route (§Fix (b)(3), traversal suppression) moves NO split byte and
// NO decline verdict: it changes only whether a manufactured fragment is
// JUDGED. These cells are the lock on that, and they are the cells that catch a
// route silently widening the split to `"angle-and-brace"` (§Fix (b)(1)) — a
// route the orchestrator rejected because it reds bug 0164's landed cells d6/d7.
// The `LowerCtx.unspellable` CONTENTS are deliberately NOT pinned here: those
// entries are what the suppression stops producing, so pinning them would be a
// fence that cannot go green. What is pinned is the split, the per-shard
// verdict, and the lowered bytes.
// ===========================================================================

describe("bug 0204 (a) — the split, the decline and the lowered bytes do not move", () => {
  /** id, text, `"angle"` segments, `"angle-and-brace"` segments. */
  const SPLIT_ROWS: ReadonlyArray<readonly [string, string, string[], string[]]> = [
    [
      "a1",
      "{a: string, b: integer, c: boolean}",
      ["{a: string", "b: integer", "c: boolean}"],
      ["{a: string, b: integer, c: boolean}"],
    ],
    ["a2", "{a: string, b: integer}", ["{a: string", "b: integer}"], ["{a: string, b: integer}"]],
    ["a3", "{a: string}", ["{a: string}"], ["{a: string}"]],
    [
      "a4",
      "{x: integer, y: integer, z: integer}",
      ["{x: integer", "y: integer", "z: integer}"],
      ["{x: integer, y: integer, z: integer}"],
    ],
    [
      "a5",
      "{a: string, b: integer, c: boolean}, QueryError",
      ["{a: string", "b: integer", "c: boolean}", "QueryError"],
      ["{a: string, b: integer, c: boolean}", "QueryError"],
    ],
    [
      "a6",
      'enum["a", "b"]',
      ['enum["a"', '"b"]'],
      // Neither mode tracks BRACKET depth, which is bug 0124's SHRED sentence's
      // own ground and is left standing (§Non-goals, §Fix (c)(1)).
      ['enum["a"', '"b"]'],
    ],
  ];

  for (const [id, text, angle, angleAndBrace] of SPLIT_ROWS) {
    it(`FENCE (${id}): \`${text}\` splits identically in both nesting modes`, () => {
      const label = `${id} (splitTopLevel, ${text})`;
      expect(
        splitTopLevel(text, ","),
        `${label}: the route settled for bug 0204 suppresses the JUDGEMENT of a manufactured ` +
          `fragment, it does not move the split — \`splitTopLevel\`'s \`"angle"\` default and ` +
          `\`splitTopLevelSegments\`' \`tracksBraces\` gate are byte-untouched (§Fix (b)(3): ` +
          `"The split, its segment count, and every lowered byte are untouched")`,
      ).toEqual(angle);
      expect(
        splitTopLevel(text, ",", "angle-and-brace"),
        `${label}: the brace-aware mode every other reader of this argument list uses ` +
          `(\`queryResponseAnnotation\`, \`inlineObjectFieldKeys\`, \`lowerInlineObject\`) is ` +
          `unmoved too; this cell is the tripwire on a route that widens the split instead ` +
          `(§Fix (b)(1), rejected)`,
      ).toEqual(angleAndBrace);
    });
  }

  /** id, shard text, whether the SHARED decline finds it refusable. */
  const SHARD_ROWS: ReadonlyArray<readonly [string, string, boolean]> = [
    ["a7", "{a: string", false],
    ["a8", "b: integer", true],
    ["a9", "c: boolean}", false],
    ["a10", "b: integer}", false],
    ["a11", 'enum["a"', true],
    ["a12", '"b"]', true],
    ["a13", '"b"', false],
    ["a14", "Cat +", true],
  ];

  for (const [id, shard, refusable] of SHARD_ROWS) {
    it(`FENCE (${id}): \`${shard}\` is ${refusable ? "" : "not "}refusable to the shared decline`, () => {
      expect(
        isUnspellableTextRefusable(shard),
        `${id} (isUnspellableTextRefusable, ${shard}): the shared decline is NOT narrowed by ` +
          `bug 0204 — its fragment-level \`{\`/\`}\` exemption belongs to the brace frame (bugs ` +
          `0035/0045/0052) and stays exactly as wide as it is (§Non-goals). The fix removes the ` +
          `manufactured fragment from the sink; it does not teach this predicate anything`,
      ).toBe(refusable);
    });
  }

  /** id, source, the bytes `lowerTypeExpr` lowers it to (unmoved in both directions). */
  const LOWERED_ROWS: ReadonlyArray<readonly [string, string, unknown]> = [
    ["a15", T3, {}],
    ["a16", T2, {}],
    ["a17", T1, { type: "array", items: {} }],
    ["a18", "{a: string, b: integer, c: boolean}", {}],
    ["a19", T3_NESTED, { type: "array", items: {} }],
    ["a20", "Result<{a: string, b: integer, c: boolean}, QueryError>", {}],
    ["a21", T_ADMITTED_NEST, { type: "array", items: {} }],
    ["a22", T3_BRACE_ROOT, {}],
    ["a23", T3_NULL, { anyOf: [{}, { type: "null" }] }],
    ["a24", 'array<enum["a", "b"]>', {}],
  ];

  for (const [id, source, lowered] of LOWERED_ROWS) {
    it(`FENCE (${id}): \`${source}\` lowers to unchanged bytes`, () => {
      const { ctx } = seamCtx();
      expect(
        lowerTypeExpr(source, ctx),
        `${id} (lowerTypeExpr, ${source}): §Fix (b)(3) keeps every lowered byte identical, and ` +
          `§Non-goals holds what an admitted generic argument lowers to outside this report ` +
          `(bugs 0164 / 0039 / 0184 own it). A fix that moves these bytes is taking route ` +
          `(b)(1) — whose cost is bug 0164's landed cells d6/d7 — not route (b)(3)`,
      ).toEqual(lowered);
    });
  }
});

// ===========================================================================
// (b) THE FALSE REFUSAL — RED at HEAD, GREEN after. §Reproduction (b),
// §Expected bullets 1 and 2.
//
// Every row's text derives from `Type`: `GenericType`'s argument is a recursive
// `Type` (grammar.md:99–:100) and `ObjectType` is one of `Type`'s six
// alternatives (:93, :101), admitted "in any `Type` position" (:109). The only
// thing standing between these and a clean load is a fragment the SPLIT
// manufactured.
// ===========================================================================

/** id, the type text, why the shred reaches it. */
const RED_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ["b1", T3, "the three-field spelling — the first interior field count whose middle shard is brace-free"],
  ["b2", T3_NO_SPACES, "the same annotation with no spaces: the shred is a comma rule, not a whitespace one"],
  ["b3", T4, "four interior fields: HEAD refuses TWICE at the schema positions, one per brace-free shard"],
  ["b4", T5, "five interior fields: HEAD refuses THREE times at the schema positions"],
  ["b5", T3_NULL, "a union arm — the union split hands the generic arm the same interior"],
  ["b6", T3_NESTED, "nested generics: the outer split sees the inner `<…>`, so the inner arm shreds it"],
  ["b7", T3_BRACE_ROOT, "a bare brace root, whose `lowerInlineObject` field split hands field `a`'s type to the generic arm"],
];

describe("bug 0204 (b) — a derivable `ObjectType` generic argument draws no refusal", () => {
  for (const [id, typeSource, why] of RED_ROWS) {
    for (const position of POSITIONS) {
      it(`RED (${id}, ${position}): \`${typeSource}\` loads clean`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource);
        expectAdmitted(
          label,
          r,
          `${why}. HEAD refuses because \`lowerTypeExpr\`'s angle-only argument split cut the ` +
            `\`ObjectType\` the author wrote as ONE unit and the brace-free interior shard ` +
            `survived \`isUnspellableTextRefusable\` — text appearing in no source and in no ` +
            `message (§Expected bullet 2; the refusal names the DECLARATION, ` +
            `\`${DECL_NAME[position]}\`)`,
        );
      });
    }
  }
});

// ===========================================================================
// (c) THE §Reproduction (b) CONTROL ROWS — GREEN in both directions, plus the
// exact lowered bytes of the one- and two-field spellings.
//
// These are the over-refusal fences from below: each row already loads clean at
// HEAD, so a fix that reaches them is refusing something new. §Fix (c)(2)
// enumerates the pinned bytes before the change rather than discovering them
// after; c7/c8/c9 are that enumeration at the `params:` position, the only one
// of the three whose fixture carries a lowered document to read.
// ===========================================================================

const CONTROL_ROWS: ReadonlyArray<readonly [string, string, boolean, string]> = [
  ["c1", T2, false, "two interior fields: both shards carry a brace, so both are declined today"],
  ["c2", T1, false, "one interior field: the split yields one segment and the `array` arm runs"],
  ["c3", "{a: string, b: integer, c: boolean}", false, "the bare brace root: `lowerInlineObject` splits `\"angle-and-brace\"`"],
  ["c4", T_ADMITTED_NEST, false, "a brace-ROOTED argument reaches the catch-all whole and is declined for its brace"],
  ["c5", "array<Cat>", true, "a resolved `NamedType` argument"],
  ["c6", "{a: Cat, b: string, c: integer}", true, "a bare three-field object whose first field is a resolved name"],
];

describe("bug 0204 (c) — the CONTROL rows keep their clean load", () => {
  for (const [id, typeSource, withCat, why] of CONTROL_ROWS) {
    for (const position of POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` stays clean`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource, withCat);
        expectAdmitted(
          label,
          r,
          `${why} — this row loads clean at HEAD, so a diagnostic here is a NEW refusal the fix ` +
            `introduced (§Fix (c)(1): the landed dispositions are locks)`,
        );
      });
    }
  }

  /** id, the type text, the bytes `properties.f` carries. §Fix (c)(2). */
  const BYTE_ROWS: ReadonlyArray<readonly [string, string, unknown, string]> = [
    ["c7", T1, { type: "array", items: {} }, "one argument to the split, so the `array` arm runs and arrayness is asserted"],
    [
      "c8",
      T2,
      {},
      "TWO segments, so the `array` arm is skipped and the permissive `{}` is emitted — §Fix " +
        "(b)(3)'s stated residual: the angle-only split still disagrees with `parseGeneric` " +
        "about the argument COUNT, and §Non-goals holds that disagreement's emission consequence " +
        "with bugs 0164 / 0039 / 0184",
    ],
    ["c9", T_ADMITTED_NEST, { type: "array", items: {} }, "the brace-rooted argument is one segment, so arrayness survives"],
  ];

  for (const [id, typeSource, bytes, why] of BYTE_ROWS) {
    it(`FENCE (${id}): \`${typeSource}\` lowers \`params.f\` to unchanged bytes`, () => {
      const label = `${id} (params, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        loweredF(label, r),
        `${label}: ${why}. §Fix (c)(2) pins these bytes BEFORE the change; route (b)(3) leaves ` +
          `them byte-identical, and a cell reading differently means the split was widened`,
      ).toEqual(bytes);
    });
  }
});

// ===========================================================================
// (d) THE POSITIONS THAT ALREADY ADMIT THE SAME TEXT — GREEN in both
// directions. §Reproduction (c), §Non-goals ("Bug 0124's immune positions",
// "The `@<T>` position's absent sink").
//
// Bug 0124's recogniser (`annotationSourceIsNotTypeExpression`,
// src/parser/type-layer-checks.ts) admits the brace-and-angle text these rows
// spell, on the boundary its own doc comment and the
// `theta/parse/annotation-type-not-expression` registry row
// (docs/spec_topics/diagnostics/code-registry-parse.md) state — not on the bare
// presence of a brace and an angle bracket. The `@<T>` position threads no sink
// at all. Neither is narrowed here: these cells are the fence proving the fix
// removed refusals without touching the positions that never had one.
// ===========================================================================

describe("bug 0204 (d) — the four already-admitting positions are untouched", () => {
  it("FENCE (d1): a `let` annotation keeps the RHS gate's row as its WHOLE disposition", () => {
    // ELEMENT 2 ONLY, RE-DERIVED under bug 0130: the premise this cell pins —
    // one row, no new code, this position's own disposition unmoved — still
    // holds. What does NOT hold any more is the claim that `parseType`'s
    // captured text is normalised so `<expected>` renders without spaces:
    // that claim was exactly the collapse bug 0130 element 2 corrects. The
    // `let`-annotation site now converts through `letAnnotationToCompatType`,
    // which mints TYPE-8's `object` arm for the well-formed 3-field inline
    // object inside `${T3}`, so `<expected>` renders through `displayType`'s
    // conformant `object` arm — single space after each `:` and each `,`
    // (placeholder-rendering-a.md:27) — rather than the pseudo-name's raw text.
    const r = parseDoc(`let x: ${T3} = 1\n`, "bug0204.theta");
    expect(
      diagLines(r),
      "d1 (let annotation): bug 0124's own cell p2 states the premise — the annotation is " +
        "well-formed, so the RHS gate's row is the whole disposition. A refusal appearing here " +
        "would mean the fix narrowed that decline (§Non-goals)",
    ).toEqual([
      line(LET_MISMATCH, [
        ["<name>", "x"],
        ["<expected>", "array<{ a: string, b: integer, c: boolean }>"],
        ["<actual>", "integer"],
      ]),
    ]);
  });

  it("FENCE (d2): an `fn` parameter type stays silent", () => {
    const r = parseDoc(`fn f(p: ${T3}): integer { 1 }\nlet x = 1\n`, "bug0204.theta");
    expect(
      diagLines(r),
      "d2 (fn parameter type): the byte-identical text is admitted here at HEAD; the asymmetry " +
        "bug 0204 reports is between positions that thread the sink and positions that carry " +
        "bug 0124's decline, and only the former move",
    ).toEqual([]);
  });

  it("FENCE (d3): an `fn` return type stays silent", () => {
    const r = parseDoc(`fn f(): ${T3} { 1 }\nlet x = 1\n`, "bug0204.theta");
    expect(
      diagLines(r),
      "d3 (fn return type): as d2 — this position never reached `lowerTypeSource`, so nothing " +
        "the fix does to the traversal's sink can reach it",
    ).toEqual([]);
  });

  it("FENCE (d4): the `@<T>` query annotation stays silent and lowers unchanged", () => {
    const r = parseDoc("let r = @<" + T3 + ">`hi`\n", "bug0204.theta");
    expect(
      diagLines(r),
      "d4 (`@<T>` annotation): this position's `collectUnresolvedNamedTypes` call threads NO " +
        "`unspellable` sink — bug 0061 §Fix constraint 2's byte-freeze, which §Non-goals keeps — " +
        "so it is silent at HEAD and must stay silent",
    ).toEqual([]);
    expect(
      lowerQueryResponseSchema(T3, [], []),
      "d4 (`@<T>` lowering): the annotation's lowered bytes are the permissive `{}` at HEAD and " +
        "route (b)(3) moves no lowered byte (§Fix (b)(3))",
    ).toEqual({});
  });
});

// ===========================================================================
// (e) THE ARGUMENT-COUNT ROWS — GREEN in both directions. §Reproduction (d),
// §Non-goals ("The arity rule and the closed constructor set").
//
// `array` stays arity 1 and `theta/parse/generic-arity-mismatch` keeps its
// trigger: e1 is the row the author really wrote two arguments for, e2 is the
// row `parseGeneric` counts as ONE argument (which is why no arity diagnostic
// fires for the shredded spelling, at HEAD or after).
// ===========================================================================

describe("bug 0204 (e) — the arity rule is unmoved in both directions", () => {
  for (const position of POSITIONS) {
    it(`FENCE (e1, ${position}): \`array<integer, integer>\` keeps its arity diagnostic`, () => {
      const label = `e1 (${position}, array<integer, integer>)`;
      const r = read(label, position, "array<integer, integer>");
      expect(
        r.lines,
        `${label}: two arguments the author really wrote, so the arity rule is the honest ` +
          `disposition and route (b)(3) must not suppress it — the suppression is gated on the ` +
          `split having CUT a group, and a comma between two primitives cuts none ` +
          `(§Non-goals: \`array\` stays arity 1)`,
      ).toEqual([line(ARITY, [["<ctor>", "array"], ["<expected>", "1"], ["<actual>", "2"]])]);
    });

    it(`FENCE (e2, ${position}): \`${T3}\` draws NO arity diagnostic`, () => {
      const label = `e2 (${position}, ${T3})`;
      const r = read(label, position, T3);
      expect(
        r.codes.includes(ARITY),
        `${label}: \`parseGeneric\` parses the argument with \`parseUnion\`, so it counts ONE ` +
          `argument and the arity rule is satisfied — the disagreement bug 0204 element 1 ` +
          `reports is between that count and the lowering's split, and the fix does not resolve ` +
          `it by minting an arity diagnostic. Observed codes: ${JSON.stringify(r.codes)}`,
      ).toBe(false);
    });
  }
});

// ===========================================================================
// (f) THE TRUE REFUSALS — GREEN in both directions. §Reproduction (f),
// §Expected bullet 5, §Fix (c)(1).
//
// Every row carries junk the grammar declines and that the AUTHOR wrote. The
// first three are bug 0061's landed cells a21–a25; the last three are the rows
// §Reproduction (f) measures as LOST under route (b)(2) (bug 0124's whole-source
// decline shared with these positions), which is why that route was rejected —
// §Expected's last bullet forbids dropping them in terms.
// ===========================================================================

const TRUE_REFUSAL_ROWS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["f1", "array<Cat +>", 1, "bug 0061 cells a21/a22 — one argument, junk inside it, no group cut"],
  ["f2", "{b: string +}", 1, "bug 0061 cells a23/a24 — the hoist hands the field's brace-free junk over"],
  ["f3", "{b: {c: ???}}", 1, "bug 0061 cell a25 — the same, two levels down"],
  ["f4", "{a: array<Cat +>}", 1, "§Reproduction (f): bug 0124's whole-source decline would ADMIT this (brace + angle), so route (b)(2) loses it"],
  ["f5", "{a: array<Cat +>, b: string}", 1, "the same loss, with a second field the brace-aware hoist split keeps whole"],
  ["f6", "string | {a: array<Cat +>}", 1, "the same loss through a union arm"],
];

describe("bug 0204 (f) — the refusals that stand, stand", () => {
  for (const [id, typeSource, count, why] of TRUE_REFUSAL_ROWS) {
    for (const position of POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` keeps its refusal`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource, true);
        const expected =
          position === "params"
            ? Array.from({ length: count }, () => paramsRefusal("f"))
            : Array.from({ length: count }, () => schemaRefusal(DECL_NAME[position]));
        expect(
          r.lines,
          `${label}: ${why}. §Expected's last bullet is explicit — this text "keeps exactly the ` +
            `refusal it draws today, at the same position, with the same code and count". A ` +
            `route that greens this cell is route (b)(2), which §Expected forbids`,
        ).toEqual(expected);
        expect(
          r.gateCount,
          `${label}: the drop gate reads error severity AND the \`theta/parse/\` / ` +
            `\`theta/load/\` namespaces (\`hasLoadParseError\`); this row must still block ` +
            `registration`,
        ).toBeGreaterThan(0);
      });
    }
  }
});

// ===========================================================================
// (g) THE BRACKET HALF — §Reproduction (e), §Expected bullet 4, §Fix (d)'s
// route-dependent row.
//
// g1/g2 are fences: the BARE inline enum keeps `theta/parse/inline-enum` at the
// two schema positions (`checkInlineEnumForm`'s anchored `/^\s*enum\s*\[/` match
// is untouched, §Non-goals), and since bug 0162 §Fix route (a) the `params:`
// position draws the SAME registered row for the same top-level text, in place
// of the generic text refusal it drew before that fix — one authored mistake,
// one code, across all three positions.
//
// g3/g4 are the cells bug 0204 landed as silence and **bug 0217** moves
// deliberately (docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md,
// its §Fix (c)(4): "The pinned silence is moved deliberately, not discovered").
// Bug 0204's pre-fix behaviour was two `schema-type-not-expression` naming the
// enclosing declaration — neither registered row's code nor either row's count
// — and its §Fix (d) table permitted either "`theta/parse/inline-enum`, or
// nothing — stated either way", so bug 0204 chose nothing. That choice made
// input `schemas.md:93` refuses in terms ("`enum` is **top-level only** — there
// is no inline `enum["a", "b"]` form") load clean, lower `{}` and REGISTER,
// which bug 0204 §Fix *Residuals* item 1 named and bug 0217 filed.
//
// Bug 0217's route is its §Fix (b)(2): keep bug 0204's split, segment count,
// per-segment suppression and every lowered byte exactly as they are, and push
// the SOURCE TEXT of the innermost `[…]` group the angle-only split CUT into
// the caller's `unspellable` sink — as a LAST RESORT, only when this argument
// list's own segment recursion contributed nothing — where the shared decline
// `isUnspellableTextRefusable` finds it refusable and each position emits its
// own registered row (bug 0059's sink idiom). A `[…]` group derives from none
// of grammar.md:90–:102's six `Type` alternatives; a `{…}` group IS one of them
// (`ObjectType`, :101/:109), which is why bug 0204's admissions in groups (b),
// (c), (h) and (l) are untouched. So g3/g4 assert ONE refusal per position in
// that position's own code — `theta/parse/schema-type-not-expression` at the
// two schema positions and `theta/load/params-type-not-expression` at `params:`
// — and `checkInlineEnumForm`'s anchored match is still NOT extended to depth,
// which is what keeps g1/g2 above on `theta/parse/inline-enum` and keeps this
// pair off it.
// ===========================================================================

describe("bug 0204 (g) — the inline-enum spellings", () => {
  const BARE: ReadonlyArray<readonly [string, string]> = [
    ["g1", 'enum["a", "b"]'],
    ["g2", 'enum["a", "b", "c"]'],
  ];

  for (const [id, typeSource] of BARE) {
    for (const position of POSITIONS) {
      it(`FENCE (${id}, ${position}): bare \`${typeSource}\` keeps its own disposition`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource);
        const expected = [line(INLINE_ENUM, [])];
        expect(
          r.lines,
          `${label}: the bare spelling is what \`checkInlineEnumForm\`'s anchored match owns, and ` +
            `bug 0162 §Fix route (a) wires the same recogniser over \`params:\`'s own top-level ` +
            `captured text — the whole right-hand side, ONE fragment the author wrote, no split ` +
            `manufactured it — so all three positions draw this row for this input`,
        ).toEqual(expected);
      });
    }
  }

  const NESTED: ReadonlyArray<readonly [string, string]> = [
    ["g3", 'array<enum["a", "b"]>'],
    ["g4", 'array<enum["a", "b", "c"]>'],
  ];

  for (const [id, typeSource] of NESTED) {
    for (const position of POSITIONS) {
      it(`RED (${id}, ${position}): nested \`${typeSource}\` draws this position's ONE refusal`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource);
        const expected =
          position === "params" ? [paramsRefusal("f")] : [schemaRefusal(DECL_NAME[position])];
        expect(
          r.lines,
          `${label}: bug 0204's own pre-fix behaviour was TWO \`${SCHEMA_REFUSAL}\` at the ` +
            `schema positions — one per refusable shard of the shredded bracket list, the ` +
            `shards being the \`enum["a"\`-shaped head and the \`"…"]\`-shaped tail while any ` +
            `interior item is a \`LiteralType\` the shared decline exempts — and one ` +
            `\`${PARAMS_REFUSAL}\` at \`params:\`: a code and a count neither registered row ` +
            `states for this input (bug 0204 §Expected bullet 4). Bug 0204's fix removed the ` +
            `shard judgement and, under its §Fix (d) "stated either way" licence, left this ` +
            `input drawing NOTHING — which made a construct \`schemas.md:93\` refuses in terms ` +
            `load clean, lower \`{}\` and REGISTER. That silence is **bug 0217** ` +
            `(docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md), filed ` +
            `from bug 0204 §Fix *Residuals* item 1, and its §Fix (b)(2) route restores exactly ` +
            `ONE refusal here in this position's own registered code: the innermost \`[…]\` ` +
            `group the angle-only split CUT is pushed once into \`LowerCtx.unspellable\` (a ` +
            `\`[…]\` group derives from none of grammar.md:90–:102's six \`Type\` ` +
            `alternatives, unlike the \`{…}\` group bug 0204's own rows carry) and this ` +
            `position emits its row. \`checkInlineEnumForm\`'s anchored match is NOT extended ` +
            `to depth, so this pair stays off \`theta/parse/inline-enum\` while g1/g2 above ` +
            `keep it. RED with \`[]\` is bug 0217's symptom; RED with TWO refusals is bug ` +
            `0204's own defect returning. Observed: ${JSON.stringify(r.lines)}`,
        ).toEqual(expected);
      });
    }
  }
});

// ===========================================================================
// (h) THE AUTHORIZED UNDER-REFUSAL — RED, and stated as such. §Non-goals (the
// brace frame's ownership of brace-carrying fragments), bug 0059 cell d13.
// ===========================================================================

describe("bug 0204 (h) — junk inside a shredded group's brace-rooted shard", () => {
  const T_JUNK_SHARD = "array<{a: Cat +, b: integer, c: boolean}>";

  for (const position of POSITIONS) {
    it(`RED (h1, ${position}): \`${T_JUNK_SHARD}\` draws nothing`, () => {
      const label = `h1 (${position}, ${T_JUNK_SHARD})`;
      const r = read(label, position, T_JUNK_SHARD, true);
      expect(
        r.lines,
        `${label}: HEAD's ONE refusal here is raised on the MANUFACTURED shard \`b: integer\`, ` +
          `not on the junk: the author's \`Cat +\` arrives inside the brace-rooted shard ` +
          `\`{a: Cat +\`, which \`isUnspellableTextRefusable\` exempts for its brace. Removing ` +
          `the manufactured judgement therefore leaves this row SILENT — the same authorized ` +
          `under-refusal bug 0059's cell d13 already carries for \`array<{a: ???}>\`, and ` +
          `§Non-goals keeps the fragment-level brace exemption's domain out of scope. This cell ` +
          `records the under-refusal deliberately rather than letting it be discovered. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (i) THE UNION SPLIT — GREEN in both directions. The stated rule the route
// owes §Fix (b)(3) ("a stated rule for what 'whole in the source' means at the
// union split as well").
//
// THE RULE: a segment of the angle-only UNION split is whole in the source
// whenever the source derives, because every arm of `Type ("|" Type)*` is
// itself a `Type`. The only way that split can cut a brace group is if the
// group's own field list carries a `|`, and then each cut piece either carries a
// brace (declined by the shared fragment exemption) or is itself a literal /
// primitive arm. Measured: i1 and i2 produce no refusable fragment at all. i3 is
// the TRUE-refusal direction of the same rule — `???` is a union arm the author
// wrote, so it is refused at HEAD and stays refused. The union split at
// `lowerTypeExpr`'s union arm is therefore left byte-identical, deliberately.
// ===========================================================================

describe("bug 0204 (i) — the union split inside a generic argument", () => {
  const UNION_ADMITTED: ReadonlyArray<readonly [string, string]> = [
    ["i1", 'array<{a: "x" | "y" | "z"}>'],
    ["i2", "array<{a: string | integer | number}>"],
  ];

  for (const [id, typeSource] of UNION_ADMITTED) {
    for (const position of POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` stays clean`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource);
        expectAdmitted(
          label,
          r,
          "the union split's cut pieces each carry a brace or are a literal / primitive arm, so " +
            "no refusable fragment is produced at HEAD and none may be produced after",
        );
      });
    }
  }

  const T_JUNK_ARM = "array<{a: string | ??? | boolean}>";

  for (const position of POSITIONS) {
    it(`FENCE (i3, ${position}): \`${T_JUNK_ARM}\` keeps its refusal`, () => {
      const label = `i3 (${position}, ${T_JUNK_ARM})`;
      const r = read(label, position, T_JUNK_ARM);
      const expected =
        position === "params" ? [paramsRefusal("f")] : [schemaRefusal(DECL_NAME[position])];
      expect(
        r.lines,
        `${label}: \`???\` is a union arm the AUTHOR wrote, so refusing it is the TRUE direction ` +
          `of the stated union-split rule. The argument-list interior carries no top-level ` +
          `comma, so no group is cut and the suppression does not apply — this cell is the ` +
          `tripwire on a fix that suppresses the sink for the whole generic arm instead of only ` +
          `where the split cut a group`,
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (j) THE MEASURED CONTROL bug 0204 §Reproduction records differently —
// GREEN in both directions.
//
// §Reproduction (a) measures `Result<{a: string, b: integer, c: boolean},
// QueryError>`'s shard `b: integer` as REFUSABLE at the seam, and it is (cell
// a8). End to end, though, this fixture draws NO refusal: the declaration
// already carries `theta/parse/result-in-schema-position` from its own walk, so
// the last-resort guard withholds the text-level refusal, and `QueryError`
// draws its own unresolved-name row. So this row is a measured CONTROL, not a
// red — and it is the fence on the route's ONE sink distinction: route (b)(3)
// drops the `unspellable` sink for a cut group's shards and keeps `unresolved`,
// so `QueryError` must still be reported.
// ===========================================================================

describe("bug 0204 (j) — the `Result<{…}, QueryError>` control", () => {
  const T_RESULT = "Result<{a: string, b: integer, c: boolean}, QueryError>";

  for (const position of POSITIONS) {
    it(`FENCE (j1, ${position}): \`${T_RESULT}\` keeps its two own rows`, () => {
      const label = `j1 (${position}, ${T_RESULT})`;
      const r = read(label, position, T_RESULT);
      expect(
        r.lines,
        `${label}: the disposition is the two rows this input earns on its own — \`Result\` in a ` +
          `schema-feeding position (grammar.md:107) and an unresolved \`QueryError\` — with NO ` +
          `refusal, at HEAD and after. The second line is the fence on the route's sink ` +
          `distinction: only \`LowerCtx.unspellable\` is withheld for a cut group's shards, ` +
          `never \`unresolved\`, so a fix that copies the context too aggressively reds here`,
      ).toEqual([line(RESULT_IN_SCHEMA, []), line(UNRESOLVED, [["<name>", "QueryError"]])]);
    });
  }
});

// ===========================================================================
// (k) THE REGISTRATION OBSERVABLE — RED except k4. §Reproduction (b)'s
// registration table.
//
// The refusal's cost is not the diagnostic, it is that the theta does not
// register: `hasLoadParseError` reads error severity plus the `theta/parse/` /
// `theta/load/` namespaces, and at `params:` the whole frontmatter is withheld
// as well, so the theta is absent from the registry rather than degraded.
// ===========================================================================

describe("bug 0204 (k) — the theta registers again", () => {
  it("RED (k1): the `params:` three-field fixture keeps its frontmatter", () => {
    const label = `k1 (params, ${T3})`;
    const r = read(label, "params", T3);
    expect(
      r.frontmatterPresent,
      `${label}: HEAD withholds the WHOLE frontmatter (\`frontmatter === null\`) for one ` +
        `manufactured fragment, so the theta is absent from the registry rather than degraded. ` +
        `Observed diagnostics: ${JSON.stringify(r.lines)}`,
    ).toBe(true);
    expect(
      loweredF(label, r),
      `${label}: the field lowers to the permissive \`{}\` — the two-segment split's emission, ` +
        `unchanged by route (b)(3) (§Fix (b)(3), §Non-goals: what an admitted argument lowers to ` +
        `is bugs 0164 / 0039 / 0184's subject)`,
    ).toEqual({});
  });

  for (const position of ["field", "alias"] as const) {
    it(`RED (k${position === "field" ? 2 : 3}, ${position}): the three-field fixture stops blocking registration`, () => {
      const id = position === "field" ? "k2" : "k3";
      const label = `${id} (${position}, ${T3})`;
      const r = read(label, position, T3);
      expect(
        r.gateCount,
        `${label}: HEAD emits one error-severity \`theta/parse/\` code, which is exactly what ` +
          `\`hasLoadParseError\` reads, so the theta does not register (§Reproduction (b)'s ` +
          `registration table). Observed diagnostics: ${JSON.stringify(r.lines)}`,
      ).toBe(0);
    });
  }

  it("FENCE (k4): the `params:` two-field CONTROL keeps its frontmatter and its bytes", () => {
    const label = `k4 (params, ${T2})`;
    const r = read(label, "params", T2);
    expect(
      r.frontmatterPresent,
      `${label}: the two-field control registers at HEAD; this is the other end of the ` +
        `discriminator bug 0204 reports — two interior fields load, three do not`,
    ).toBe(true);
    expect(
      r.gateCount,
      `${label}: and it emits nothing the drop gate reads`,
    ).toBe(0);
    expect(
      loweredF(label, r),
      `${label}: with the permissive \`{}\` the shredded two-segment split already produces`,
    ).toEqual({});
  });
});

// ===========================================================================
// (l) THE WHOLENESS DECISION IS PER SEGMENT — GREEN in both directions for l3
// and l4, RED at the list-scoped shape of the remedy for l1/l2.
//
// §Fix (b)(3)'s own wording scopes the suppression to an ENTRY: "an ENTRY came
// from a group the split cut … the refusal judges only fragments that are whole
// in the source". A list-scoped suppression — one flag for the whole argument
// list — reads §Expected's last bullet backwards: `array<{a: string, b:
// integer, c: boolean}, ???>` spells `???` as a WHOLE argument, and a list
// whose OTHER comma sat inside the `{…}` group would carry it out of judgement
// with the manufactured shards. So wholeness is decided per segment:
// `classifyGenericArgumentSegments` (src/parser/params.ts) reproduces the
// angle-only split's cut points and marks a segment whole iff both delimiting
// commas sat at `{}`/`[]` depth 0 and the segment's own groups balance.
//
// l3 is the byte-for-byte lock that the classification did not become a second
// splitter: its `text` sequence must equal `splitTopLevel(interior, ",")`
// exactly — same order, same trim, same non-empty filter, same length.
// ===========================================================================

describe("bug 0204 (l) — wholeness is decided per segment, not per list", () => {
  const T3_JUNK_ARG = "array<{a: string, b: integer, c: boolean}, ???>";
  const T_ENUM_JUNK_ARG = 'array<enum["a", "b"], ???>';

  const KEPT_REFUSALS: ReadonlyArray<readonly [string, string, string]> = [
    [
      "l1",
      T3_JUNK_ARG,
      "`???` is a whole argument of the same list — its two boundaries are the comma at group " +
        "depth 0 and the end of the interior — while the three `{…}` pieces beside it are what " +
        "the split manufactured",
    ],
    [
      "l2",
      T_ENUM_JUNK_ARG,
      "the same shape with the bracket family carrying the cut group: `enum[\"a\"` and `\"b\"]` " +
        "are pieces, `???` is not",
    ],
  ];

  for (const [id, typeSource, why] of KEPT_REFUSALS) {
    for (const position of POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` keeps ONE refusal on \`???\``, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource);
        const expected =
          position === "params" ? [paramsRefusal("f")] : [schemaRefusal(DECL_NAME[position])];
        expect(
          r.lines,
          `${label}: ${why}. §Expected's last bullet keeps a refusal the author earned, and ` +
            `§Fix (b)(3) scopes the suppression to an ENTRY the split cut — a LIST-scoped ` +
            `suppression greens this cell and loses the refusal for text the source spells`,
        ).toEqual(expected);
        expect(
          r.gateCount,
          `${label}: and the refusal still blocks registration (\`hasLoadParseError\`)`,
        ).toBe(1);
      });
    }
  }

  it("FENCE (l3): the classification is the split's own segments, byte for byte", () => {
    /** Every argument-list interior the groups above reach, plus the edge spellings. */
    const INTERIORS: ReadonlyArray<readonly [string, ReadonlyArray<boolean>]> = [
      ["{a: string, b: integer, c: boolean}", [false, false, false]],
      ["{a: string, b: integer, c: boolean}, ???", [false, false, false, true]],
      ["{a: string, b: integer, c: boolean}, QueryError", [false, false, false, true]],
      ["{a: string, b: integer, c: boolean} | Cat +", [false, false, false]],
      ["{a: string, b: integer}", [false, false]],
      ["{a: string}", [true]],
      ["integer, integer", [true, true]],
      ['enum["a", "b"]', [false, false]],
      ['enum["a", "b"], ???', [false, false, true]],
      ["{a: array<{x: integer, y: integer, z: integer}>}", [true]],
      ['{a: "x, y", b: integer, c: boolean}, ???', [false, false, false, true]],
      ["", []],
      ["Cat,", [true]],
      [",Cat", [true]],
    ];

    for (const [interior, wholeness] of INTERIORS) {
      const classified = classifyGenericArgumentSegments(interior);
      expect(
        classified.map((segment) => segment.text),
        `l3 (${JSON.stringify(interior)}): the classification exists only to MARK the segments ` +
          `\`splitTopLevel\`'s \`"angle"\` default already produces — same order, same trim, ` +
          `same non-empty filter, same length. A divergence here is a second splitter, which ` +
          `§Fix (b)(3) forbids ("The split, its segment count, and every lowered byte are ` +
          `untouched")`,
      ).toEqual(splitTopLevel(interior, ","));
      expect(
        classified.map((segment) => segment.whole),
        `l3 (${JSON.stringify(interior)}): a segment is whole in the source iff both delimiting ` +
          `comma boundaries sat at \`{}\`/\`[]\` depth 0 and its own groups balance; the ` +
          `interior's start and end count as such boundaries, and a quoted comma is no boundary ` +
          `at all`,
      ).toEqual([...wholeness]);
    }
  });

  const T_JUNK_IN_SHARD = "array<{a: string, b: integer, c: boolean} | Cat +>";

  for (const position of POSITIONS) {
    it(`FENCE (l4, ${position}): \`${T_JUNK_IN_SHARD}\` is admitted, under-refused`, () => {
      const label = `l4 (${position}, ${T_JUNK_IN_SHARD})`;
      const r = read(label, position, T_JUNK_IN_SHARD, true);
      expect(
        r.lines,
        `${label}: the junk \`Cat +\` sits INSIDE a fragment the split cut — the interior's ` +
          `commas sit inside the \`{…}\` group, so the third segment ` +
          `\`c: boolean} | Cat +\` is a piece of that group and not text the source spells on ` +
          `its own — and a piece is not judged. This is the authorized under-refusal bug 0059's ` +
          `cell d13 already carries in its own shape (\`array<{a: ???}>\`, admitted) and group ` +
          `(h) carries in this one; §Non-goals keeps the fragment-level brace exemption's ` +
          `domain out of scope, and this cell records the under-refusal rather than letting it ` +
          `be discovered. Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([]);
    });
  }
});
