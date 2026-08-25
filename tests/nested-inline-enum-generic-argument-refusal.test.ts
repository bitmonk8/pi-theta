import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  classifyGenericArgumentSegments,
  findCutBracketGroupText,
  lowerTypeExpr,
  splitTopLevel,
  type LowerCtx,
} from "../src/parser/params";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0217 — an inline `enum[…]` written inside a generic argument draws NO
// diagnostic at any position (HEAD `e5d760bd`, before this file's fix).
// `lowerTypeExpr`'s generic-application arm (src/parser/params.ts) splits its
// argument-list interior angle-only (`splitTopLevel(interior, ",")`),
// classifies the same cut points per segment
// (`classifyGenericArgumentSegments`) and recurses every segment
// that is NOT whole in the source through `withoutUnspellableSink`.
// A comma inside a `[…]` group
// sits at angle depth 0, so `enum["a", "b"]` is cut into `enum["a"` and
// `"b"]`; both pieces are non-whole, both recurse sink-less, and
// `LowerCtx.unspellable` — the sink the three refusing positions read
// (`refusable`, `params.ts`; `theta-document.ts:6519`, `:6986`) through the
// shared decline `isUnspellableTextRefusable` (`params.ts`) — stayed empty
// pre-fix. So
// `array<enum["a", "b"]>` loads clean at a `schema` field type, an alias arm
// and a `params:` field, lowers `{}` and REGISTERS, while the bare
// `enum["a", "b"]` draws `theta/parse/inline-enum` at the two schema positions
// and `theta/load/params-type-not-expression` at `params:`, and while the
// comma-free `array<enum["a"]>` still draws
// `theta/parse/schema-type-not-expression`. The discriminator is a top-level
// comma the author wrote inside the bracket list — a lowering detail no
// registered row mentions. `checkInlineEnumForm`'s match is anchored
// (`/^\s*enum\s*\[/`, src/parser/schema-declarations.ts:289) and is handed the
// whole alias arm and the whole field type, never a generic argument, so
// `theta/parse/inline-enum` cannot reach the nested spelling either; and
// `array<enum["a", "b"], integer>` — two arguments to an arity-1 constructor —
// draws no `theta/parse/generic-arity-mismatch`.
// (docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md)
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schemas.md:93 — `enum` is "**top-level only** — there is
//     no inline `enum["a", "b"]` form (`theta/parse/inline-enum`)". Stated with
//     NO depth qualifier, which is the whole of this report's verdict.
//   - docs/spec_topics/grammar.md:90–:102 — the closed six-alternative `Type`
//     set (`PrimitiveType`, `NamedType`, `GenericType`, `ObjectType`, the union,
//     `LiteralType`). None of the six is a bracket form, so `enum[…]` derives
//     from no `Type` alternative at any depth — whereas `ObjectType`
//     (`"{" Field ("," Field)* ","? "}"`) IS one of the six, which is exactly
//     why bug 0204's suppression of a cut `{…}` group's pieces is right and
//     must stay.
//   - docs/spec_topics/grammar.md:105 — "The grammar is otherwise identical in
//     every position", and the sentence naming the four position-level refusal
//     rows (`theta/parse/annotation-type-not-expression`,
//     `theta/parse/schema-type-not-expression`,
//     `theta/load/params-type-not-expression`,
//     `theta/parse/query-annotation-type-not-expression`) — which is what makes
//     ONE expected value readable across the three sink positions.
//   - docs/spec_topics/grammar.md:109 — the recursive `Type` inside each inline
//     object field and each generic type argument, so depth is not a licence.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2, the closed
//     registry: no code is minted, removed or re-namespaced here) and :74
//     (DIAG-4, the normative *Message* column) — which is why every expected
//     message in this file is READ from the registry at runtime and none is
//     restated by hand.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every RED fixture below currently satisfies and
//     must stop satisfying) and :25 (the diagnostic-registry carve-out, under
//     which widening an existing row's reach is a recognised spec change rather
//     than a silent behaviour drift).
//
// WHAT THIS FILE PINS:
//   1. An inline `enum[…]` inside a generic argument draws EXACTLY ONE refusal
//      at each of the three sink-threading positions — group (c), RED — and the
//      refusal is the code that position already draws for the bare spelling's
//      siblings: `theta/parse/schema-type-not-expression` at the `schema` field
//      type and the alias arm, `theta/load/params-type-not-expression` at
//      `params:`. No code is minted (DIAG-2).
//   2. Neither the item count nor the nesting depth is a discriminator: two- and
//      three-item lists, single-quoted lists, `array<array<…>>`,
//      `array<{a: …}>`, a union arm and a two-argument list all refuse once —
//      group (c) — and the comma-free `array<enum["a"]>` keeps its ONE refusal
//      rather than gaining a second — group (d).
//   3. The seam contract: `splitTopLevel` in BOTH nesting modes and
//      `classifyGenericArgumentSegments`' `text`/`whole` vectors are byte-for-
//      byte UNMOVED (group (a), FENCE — bug 0204's cell l3 is a lock and this
//      is its restatement over bug 0217's interiors), and the group the author
//      wrote reaches `LowerCtx.unspellable` exactly ONCE, as the source text
//      from the group's `[` extended left over the immediately preceding
//      identifier run through the matching `]` (group (b), RED for the in-class
//      rows and FENCE for every 0204 row).
//   4. Every lowered byte stays where it is (group (e), FENCE — §Fix (c)(1);
//      `array<enum["a", "b"]>` keeps lowering `{}`, which bug 0204's cell a24
//      pins and which a refusal does not need to move).
//   5. Registration flips for the `params:` in-class rows (group (g), RED):
//      zero gate codes / frontmatter present / `properties.f = {}` becomes one
//      error-severity gate code and the frontmatter withheld.
//   6. The four annotation-side positions do NOT move (group (f), FENCE) — the
//      blast-radius proof. §Fix (c)(5) holds them out of scope because bug
//      0124's `annotationSourceIsNotTypeExpression` admits any source carrying
//      a `[` before it consults the sink, so their silence pre-dates bug 0204
//      and is not narrowed here.
//   7. A bracket group the source never CLOSES (`array<enum["a", "b">`) is an
//      authorized under-refusal (group (h), FENCE): §Fix's two routes both
//      concern a cut, CLOSED group, so this input keeps each position's own
//      capture-level disposition — including the `params:` registration bug
//      0217 otherwise removes.
//
// THE ROUTE THIS FILE IS WRITTEN AGAINST is §Fix (b)(2): thread a refusal for a
// recursed segment whose ENCLOSING cut group derives from no `Type`
// alternative. Concretely, and the expected values above are written against
// THIS and no other mechanism:
//   - `lowerTypeExpr`'s generic arm keeps its angle-only split, its segment
//     count, its per-segment `ctxFor` suppression and every lowered byte
//     exactly as they are; `classifyGenericArgumentSegments`' `text` and
//     `whole` values are UNCHANGED (bug 0204 cell l3 is a lock).
//   - A sibling helper in the same region identifies, for an argument-list
//     interior, the innermost BRACKET group (`[…]`) that the angle-only comma
//     split CUTS. A `{…}` group is derivable (`ObjectType`, grammar.md:101 /
//     :109) and is NOT this class; a `[…]` group derives from none of
//     grammar.md:90–:102's six `Type` alternatives, so it is text no `Type`
//     production can accept.
//   - That group's SOURCE TEXT is pushed ONCE into the caller's `unspellable`
//     sink, where the shared decline `isUnspellableTextRefusable` finds it
//     refusable and each position emits its own registered row (bug 0059's sink
//     idiom: one shared decline, per-position emission).
//   - LAST RESORT, so no landed count moves: the group is pushed only when this
//     argument list's own segment recursion earned NO REFUSAL — measured
//     through the SHARED decline `isUnspellableTextRefusable` over what that
//     recursion contributed, not through the sink's raw length, because the
//     property preserved is one refusal per construct (§Fix (c)(2)) and a sink
//     entry the decline rejects earns none. That is what keeps
//     `array<enum["a", "b"], ???>` (bug 0204 cell l2) and
//     `array<enum["a", "b"], Cat +>` at exactly ONE refusal — the refusal the
//     whole segment beside the group already earned — while
//     `pair<{a: string}, enum["x", "y"]>`, whose brace-carrying sibling entry
//     the decline rejects, still draws the group's one refusal (cells b17,
//     b18, c9, c10). It is an AUTHORIZED under-refusal of bug 0204 residual
//     2's class, stated here rather than discovered later.
//
// `src/parser/schema-declarations.ts`'s `checkInlineEnumForm` anchored match is
// NOT touched and `theta/parse/inline-enum`'s reach at DEPTH does NOT change —
// group (d) cell d4 is that fence: the BARE spelling keeps drawing
// `inline-enum` exactly once, and since bug 0162 §Fix route (a) that includes
// the `params:` position, which now draws this row too for the bare top-level
// spelling rather than the generic text refusal.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end with inert offline seams) plus
// three shipped seams called directly (`splitTopLevel`,
// `classifyGenericArgumentSegments`, `lowerTypeExpr`). An integration tier
// could add nothing: the subject is which diagnostics a load emits, which bytes
// a type expression lowers to, and whether the shipped drop gate's two
// properties hold — all fully determined before any host or session exists.
// A live tier is strictly weaker for the same reason bug 0204's witness states:
// the refusal un-registers the theta, so a live drive observes only an absent
// slash command and cannot distinguish this refusal from any other load error.
// The registration consequence is therefore reached the way the sibling unit
// locks reach it (tests/generic-argument-shredded-group-refusal.test.ts's group
// (k), tests/params-scalar-nontype-text-refusal.test.ts): by evaluating the two
// properties `hasLoadParseError`
// (src/extension/production-composition.ts) reads — error severity and the
// `theta/parse/` / `theta/load/` namespaces — over the diagnostics the fixture
// actually emitted, plus the frontmatter collapse. One additive live H8a cell
// (cell 60, tests/live/live-production-acceptance.test.ts) covers the real
// discovery→registration path on top of this.
//
// NO SILENT SKIPPING: every registry lookup asserts the row is present before
// using it, every fixture builder THROWS naming the unmet precondition when a
// type text cannot be embedded in the position's fixture, every fixture reader
// THROWS naming the absent intermediate when a declaration, a frontmatter block
// or a lowered `params:` document is missing, and no cell is
// `.skip`/`.todo`/`.only`. A broken fixture can never read as a pass.

// ===========================================================================
// The registered codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

const SCHEMA_REFUSAL = "theta/parse/schema-type-not-expression";
const PARAMS_REFUSAL = "theta/load/params-type-not-expression";
const INLINE_ENUM = "theta/parse/inline-enum";
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const ARITY = "theta/parse/generic-arity-mismatch";
const UNRESOLVED_NAMED_TYPE = "theta/parse/unresolved-named-type";

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
// The seven §Reproduction positions, and their fixtures.
// ===========================================================================

/** The three positions that thread the `LowerCtx.unspellable` refusal sink. */
type SinkPosition = "field" | "alias" | "params";
const SINK_POSITIONS: readonly SinkPosition[] = ["field", "alias", "params"];

/** The four positions bug 0124's bracket-tolerant decline already admits. */
type AnnotationPosition = "let" | "fnparam" | "fnret" | "query";
const ANNOTATION_POSITIONS: readonly AnnotationPosition[] = [
  "let",
  "fnparam",
  "fnret",
  "query",
];

/** `Cat` for the rows whose text names it, so no unresolved-name diagnostic enters. */
const CAT_DECL = "schema Cat { a: string }\n";

/** The declaration each sink position refuses at — what `<X>` / `<param>` renders. */
const DECL_NAME: Record<SinkPosition, string> = { field: "S", alias: "X", params: "f" };

/**
 * The YAML scalar the `params:` fixture spells the type text as. §Reproduction
 * writes `f: 'T'`, which cannot carry a `T` containing an apostrophe — the
 * single-quoted spelling `array<enum['a', 'b', 'c']>` is one of the bug's own
 * in-class rows, and embedding it single-quoted yields an unrelated
 * `theta/load/malformed-frontmatter-yaml` (bug 0263) from the broken YAML
 * rather than this bug's verdict. A type text carrying BOTH quote forms has no plain scalar spelling
 * at all, so this THROWS naming that precondition rather than emitting a
 * fixture whose diagnostics belong to the quoting.
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
      `diagnostic the fixture drew would belong to the quoting rather than to bug 0217's ` +
      `verdict. Add a block-scalar spelling before adding such a row`,
  );
}

/** The §Reproduction fixture for one position, with `T` substituted. */
function fixture(
  position: SinkPosition | AnnotationPosition,
  typeSource: string,
  withCat: boolean,
): string {
  const cat = withCat ? CAT_DECL : "";
  switch (position) {
    case "field":
      return `${cat}schema S {\n  f: ${typeSource}\n}\nlet x = 1\n`;
    case "alias":
      return `${cat}schema X = ${typeSource}\nlet x = 1\n`;
    case "params":
      return `---\nmode: prompt\nparams:\n  f: ${paramsScalar(typeSource)}\n---\n${cat}let x = 1\n`;
    case "let":
      return `${cat}let x: ${typeSource} = 1\n`;
    case "fnparam":
      return `${cat}fn f(p: ${typeSource}): integer { 1 }\nlet x = 1\n`;
    case "fnret":
      return `${cat}fn f(): ${typeSource} { 1 }\nlet x = 1\n`;
    case "query":
      return `${cat}let r = @<${typeSource}>\`hi\`\n`;
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
 * every way a fixture can fail to reach the lowering: a fixture whose
 * declaration never parsed would assert a verdict for the wrong reason.
 */
function read(
  label: string,
  position: SinkPosition | AnnotationPosition,
  typeSource: string,
  withCat = false,
): Read {
  const src = fixture(position, typeSource, withCat);
  const doc = parseDoc(src, "bug0217.theta");
  if (position === "field" || position === "alias") {
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
      `${label}: the fixture declares a \`params:\` block, so its lowered schema must be ` +
        `present for the field's fragment to be readable; frontmatter present: ` +
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

/** The ONE refusal a sink position draws for an illegal type text. */
function oneRefusal(position: SinkPosition): readonly string[] {
  return position === "params" ? [paramsRefusal("f")] : [schemaRefusal(DECL_NAME[position])];
}

// The type texts the groups reuse, spelled once.
const E2 = 'array<enum["a", "b"]>';
const E3 = 'array<enum["a", "b", "c"]>';
const E3_SQ = "array<enum['a', 'b', 'c']>";
const E2_NESTED = 'array<array<enum["a", "b"]>>';
const E2_IN_OBJECT = 'array<{a: enum["a", "b"]}>';
const E2_UNION = 'array<enum["a", "b"]> | null';
const E2_TWO_ARGS = 'array<enum["a", "b"], integer>';
const E1 = 'array<enum["a"]>';
const E2_JUNK_ARG = 'array<enum["a", "b"], ???>';
const E2_CAT_ARG = 'array<enum["a", "b"], Cat +>';
const E2_BARE = 'enum["a", "b"]';
const E2_BRACE_ROOT = '{a: enum["a", "b"]}';
const T3 = "array<{a: string, b: integer, c: boolean}>";
const T3_JUNK_ARG = "array<{a: string, b: integer, c: boolean}, ???>";
const T3_JUNK_SHARD = "array<{a: Cat +, b: integer, c: boolean}>";
const T3_UNION_JUNK = "array<{a: string, b: integer, c: boolean} | Cat +>";
const LEGAL = 'array<"a" | "b">';
// A DERIVABLE whole brace-group argument beside the cut bracket group: the
// sibling contributes a sink entry the SHARED decline
// (`isUnspellableTextRefusable`) REJECTS, so it earns no refusal of its own and
// must not suppress the group's. `pair` is an unknown constructor, so the
// arity rule has nothing to say about it and the sink refusal is the only
// diagnostic in play; `array` with two arguments draws
// `theta/parse/generic-arity-mismatch` from its own walk instead, which every
// position's own precedence rule keeps ALONE.
const PAIR_BRACE_SIBLING = 'pair<{a: string}, enum["x", "y"]>';
const ARRAY_BRACE_SIBLING = 'array<{a: string}, enum["x", "y"]>';
/** A bracket group the source never closes — group (h)'s authorized under-refusal. */
const UNBALANCED = 'array<enum["a", "b">';

// ===========================================================================
// (a) THE SPLIT AND THE CLASSIFICATION DO NOT MOVE — FENCE, GREEN in both
// directions. §Fix (c)(1); bug 0204 cell l3 restated over bug 0217's interiors.
//
// Route §Fix (b)(2) adds a SIBLING helper beside
// `classifyGenericArgumentSegments`; it does not change the classification, and
// it does not become a second splitter. These cells are the lock on that, and
// the tripwire on a route that instead widens the split to `"angle-and-brace"`
// (bug 0204 §Fix (b)(1), rejected there because it reds bug 0164's landed cells
// d6/d7). Neither nesting mode tracks BRACKET depth today, which is why
// `enum["a", "b"]` cuts identically in both — and it must keep cutting
// identically, because the remedy is a refusal, not a re-split.
// ===========================================================================

describe("bug 0217 (a) — the split and the segment classification are byte-untouched", () => {
  /** id, interior, `"angle"` segments, `"angle-and-brace"` segments, wholeness. */
  const INTERIOR_ROWS: ReadonlyArray<
    readonly [string, string, readonly string[], readonly string[], readonly boolean[]]
  > = [
    [
      "a1",
      'enum["a", "b"]',
      ['enum["a"', '"b"]'],
      ['enum["a"', '"b"]'],
      [false, false],
    ],
    [
      "a2",
      'enum["a", "b"], ???',
      ['enum["a"', '"b"]', "???"],
      ['enum["a"', '"b"]', "???"],
      [false, false, true],
    ],
    [
      "a3",
      'enum["a", "b"], integer',
      ['enum["a"', '"b"]', "integer"],
      ['enum["a"', '"b"]', "integer"],
      [false, false, true],
    ],
    [
      "a4",
      '{a: enum["a", "b"]}',
      ['{a: enum["a"', '"b"]}'],
      ['{a: enum["a", "b"]}'],
      [false, false],
    ],
    [
      "a5",
      "{a: string, b: integer, c: boolean}",
      ["{a: string", "b: integer", "c: boolean}"],
      ["{a: string, b: integer, c: boolean}"],
      [false, false, false],
    ],
    ["a6", 'enum["a"]', ['enum["a"]'], ['enum["a"]'], [true]],
    [
      "a7",
      'enum["a", "b"], Cat +',
      ['enum["a"', '"b"]', "Cat +"],
      ['enum["a"', '"b"]', "Cat +"],
      [false, false, true],
    ],
    ["a8", '"a" | "b"', ['"a" | "b"'], ['"a" | "b"'], [true]],
  ];

  for (const [id, interior, angle, angleAndBrace, wholeness] of INTERIOR_ROWS) {
    it(`FENCE (${id}): \`${interior}\` splits and classifies identically`, () => {
      const label = `${id} (${JSON.stringify(interior)})`;
      expect(
        splitTopLevel(interior, ","),
        `${label}: route §Fix (b)(2) threads a REFUSAL for a cut group that derives from no ` +
          `\`Type\` alternative (grammar.md:90–:102); it does not move the split. ` +
          `\`splitTopLevel\`'s \`"angle"\` default is what \`lowerTypeExpr\`'s generic arm reads ` +
          `and it is byte-untouched (§Fix (c)(1): every lowered byte stays). A red here means ` +
          `the split was widened instead — bug 0204 §Fix (b)(1), whose cost is bug 0164's ` +
          `landed cells d6/d7`,
      ).toEqual([...angle]);
      expect(
        splitTopLevel(interior, ",", "angle-and-brace"),
        `${label}: the brace-aware mode every other reader of an argument list uses is unmoved ` +
          `too. Note a4 versus a5: the brace-aware mode already keeps a \`{…}\` group whole and ` +
          `still cuts the \`[…]\` group inside it, which is precisely why the remedy cannot be a ` +
          `nesting-mode change`,
      ).toEqual([...angleAndBrace]);
      const classified = classifyGenericArgumentSegments(interior);
      expect(
        classified.map((segment) => segment.text),
        `${label}: the classification exists only to MARK the segments \`splitTopLevel\`'s ` +
          `\`"angle"\` default already produces — same order, same trim, same non-empty filter, ` +
          `same length. Bug 0204's cell l3 is a lock and this is its restatement over bug ` +
          `0217's interiors: a divergence here is a second splitter`,
      ).toEqual(splitTopLevel(interior, ","));
      expect(
        classified.map((segment) => segment.whole),
        `${label}: a segment is whole in the source iff both delimiting comma boundaries sat at ` +
          `\`{}\`/\`[]\` depth 0 and its own groups balance. Route §Fix (b)(2) adds a SIBLING ` +
          `helper and leaves these verdicts alone; a red here is the classification being ` +
          `repurposed rather than complemented`,
      ).toEqual([...wholeness]);
    });
  }

  // -------------------------------------------------------------------------
  // The direct seam on `findCutBracketGroupText` itself (route §Fix (b)(2)'s
  // sibling helper, src/parser/params.ts, beside `classifyGenericArgumentSegments`
  // / `withoutUnspellableSink`): the interior→group-text mapping, the
  // left-extension over the preceding identifier run, and the innermost-group
  // choice when brackets nest. FENCE in both directions — this helper's
  // contract, not the classification's.
  // -------------------------------------------------------------------------

  /** id, interior, expected `findCutBracketGroupText` result, why. */
  const CUT_GROUP_ROWS: ReadonlyArray<readonly [string, string, string | undefined, string]> = [
    [
      "a9",
      'enum["a", "b"]',
      'enum["a", "b"]',
      "the base case: the cut `[…]` group, extended left over the `enum` identifier run that " +
        "immediately precedes its `[`",
    ],
    [
      "a10",
      '{a: enum["a", "b"]}',
      'enum["a", "b"]',
      "the enclosing `{…}` is derivable (`ObjectType`, grammar.md:101/:109) and is never the " +
        "innermost open frame at the cut, so it is not returned — only the bracket-rooted " +
        "group is",
    ],
    [
      "a11",
      'enum["a", "b"], integer',
      'enum["a", "b"]',
      "a whole segment beside the cut group (`integer`) does not change which group the helper " +
        "names — the last-resort GATING on that segment's own contribution is " +
        "`pushCutBracketGroupAsLastResort`'s job, not this helper's",
    ],
    [
      "a12",
      "{a: string, b: integer, c: boolean}",
      undefined,
      "no `[…]` group at all: the only cut group is the derivable `{…}`, which this helper " +
        "never returns (bug 0204's admissions stay admissions)",
    ],
    [
      "a13",
      'enum["a"]',
      undefined,
      "no top-level comma inside the bracket list, so nothing is cut — one whole segment, no " +
        "group for this helper to name (the HEAD refusal on this row comes from the catch-all, " +
        "not from this helper)",
    ],
    [
      "a14",
      '"a" | "b"',
      undefined,
      "a literal union with no bracket group anywhere",
    ],
    [
      "a15",
      "integer, integer",
      undefined,
      "two whole primitive segments, no group of any kind",
    ],
  ];

  for (const [id, interior, expected, why] of CUT_GROUP_ROWS) {
    it(`FENCE (${id}): findCutBracketGroupText(\`${interior}\`) is ${JSON.stringify(expected)}`, () => {
      expect(
        findCutBracketGroupText(interior),
        `${id} (${JSON.stringify(interior)}): ${why}. This is the direct seam on route §Fix ` +
          `(b)(2)'s sibling helper: it identifies the innermost \`[…]\` group the angle-only ` +
          `split cuts and returns the author's own bytes, from the group's \`[\` extended left ` +
          `over the preceding identifier run through the matching \`]\` — never the bare ` +
          `bracket pair and never a derivable \`{…}\` group`,
      ).toBe(expected);
    });
  }

  it("FENCE (a16): the innermost bracket group is returned when brackets nest", () => {
    const interior = 'outer[inner["a", "b"]]';
    expect(
      findCutBracketGroupText(interior),
      "a16: the cut comma's innermost currently-open frame is the INNER `[`, not the outer " +
        "one — the inner frame's closing bracket is reached and popped before the outer " +
        "frame's is, so the first (and only) group this helper records is already the " +
        "innermost one. A route that instead walked outward from the first `[` would return " +
        "the outer `outer[inner[\"a\", \"b\"]]`, which is not the construct the author wrote " +
        "at the point the split actually cuts",
    ).toBe('inner["a", "b"]');
  });
});

// ===========================================================================
// (b) THE SINK — the group the author wrote reaches it exactly ONCE.
// RED for the in-class rows, FENCE for every bug 0204 row.
//
// This is the mechanism cell for route §Fix (b)(2). What must appear in
// `LowerCtx.unspellable` is the SOURCE TEXT of the innermost `[…]` group the
// angle-only split cut, taken from the group's `[` extended LEFT over the
// immediately preceding identifier run through the matching `]` — so
// `enum["a", "b"]`, the construct the author wrote, and not the bare
// `["a", "b"]` and not either manufactured piece (`enum["a"` / `"b"]`). And it
// appears only as a LAST RESORT: when the argument list's own segment recursion
// already contributed an entry the SHARED decline would REFUSE (b8, b9, b12)
// nothing is pushed, which is what holds those rows at exactly ONE refusal. An
// entry that decline rejects is not a refusal and suppresses nothing (b17, b18).
// ===========================================================================

describe("bug 0217 (b) — the cut bracket group reaches the refusal sink once", () => {
  /** id, source, expected sink contents, RED?, why. */
  const SINK_ROWS: ReadonlyArray<readonly [string, string, readonly string[], boolean, string]> = [
    [
      "b1",
      E2,
      ['enum["a", "b"]'],
      true,
      "the base in-class row: the split cuts the `[…]` group, so the group the author wrote is " +
        "pushed once and each position emits its own registered row",
    ],
    [
      "b2",
      E3,
      ['enum["a", "b", "c"]'],
      true,
      "three items cut into three pieces; still ONE group, so still ONE entry — the item count " +
        "is not a discriminator (§Expected bullet 2)",
    ],
    [
      "b3",
      E3_SQ,
      ["enum['a', 'b', 'c']"],
      true,
      "the single-quoted list: the quote form is not a discriminator either, and the entry is " +
        "the author's bytes verbatim",
    ],
    [
      "b4",
      E2_NESTED,
      ['enum["a", "b"]'],
      true,
      "the comma sits at angle depth 1 for the OUTER list, so the outer segment is whole and " +
        "recurses WITH the sink; the inner generic arm is the one that cuts the group " +
        "(§Expected bullet 3: nesting depth is not a discriminator)",
    ],
    [
      "b5",
      E2_IN_OBJECT,
      ['enum["a", "b"]'],
      true,
      "the cut group is the INNERMOST bracket group: the enclosing `{…}` is derivable " +
        "(`ObjectType`, grammar.md:101) and is not this class, so the entry names the `enum[…]` " +
        "and not the object",
    ],
    [
      "b6",
      E2_UNION,
      ['enum["a", "b"]'],
      true,
      "a union arm — `lowerTypeExpr`'s union arm hands the generic arm the same interior, so " +
        "the arm's own recursion pushes the group once",
    ],
    [
      "b7",
      E2_TWO_ARGS,
      ['enum["a", "b"]'],
      true,
      "the whole `integer` segment beside the group contributes NOTHING to the sink (it lowers " +
        "to a primitive), so the last-resort push fires and the row refuses once",
    ],
    [
      "b8",
      E2_JUNK_ARG,
      ["???"],
      false,
      "bug 0204's cell l2 is a LOCK: `???` is a whole segment of the same cut list and it " +
        "already contributed, so the last-resort push does NOT fire and the count stays at one. " +
        "This is the authorized under-refusal §Fix (b)(2) states rather than discovers",
    ],
    [
      "b9",
      E2_CAT_ARG,
      ["Cat +"],
      false,
      "the same last-resort rule with author-written junk beside the group: one entry, one " +
        "refusal, unchanged from HEAD",
    ],
    [
      "b10",
      E1,
      ['enum["a"]'],
      false,
      "no top-level comma inside the bracket list, so nothing is cut, the single segment is " +
        "whole and keeps the sink — HEAD's own entry, and it must not become two (§Fix (c)(2): " +
        "one refusal per construct)",
    ],
    [
      "b11",
      E2_BARE,
      ['enum["a", "b"]'],
      false,
      "the bare spelling reaches the trailing catch-all as ONE fragment the author wrote; no " +
        "split manufactured it and no generic arm is involved",
    ],
    [
      "b12",
      T3_JUNK_ARG,
      ["???"],
      false,
      "bug 0204's cell l1 is a LOCK: the cut group is a derivable `{…}`, so no group is ever " +
        "pushed here; the entry is the whole `???` segment's own",
    ],
    [
      "b13",
      T3,
      [],
      false,
      "bug 0204's central admission: a cut `{…}` group is derivable (`ObjectType`, one of " +
        "grammar.md:90–:102's six alternatives), so it is NOT this class and the sink stays empty",
    ],
    [
      "b14",
      T3_JUNK_SHARD,
      [],
      false,
      "bug 0204 cell h1's authorized under-refusal: the junk `Cat +` sits inside the " +
        "brace-rooted piece, the cut group is derivable, and the row stays silent",
    ],
    [
      "b15",
      T3_UNION_JUNK,
      [],
      false,
      "bug 0204 cell l4's authorized under-refusal, likewise unmoved",
    ],
    ["b16", LEGAL, [], false, "the legal literal-union spelling cuts nothing at all"],
    // b17 FLIPPED under bug 0282 0.280.0's flip authority: `pair` is outside
    // `GENERIC_ARITY` and `Ident`-shaped, so `lowerTypeExpr`'s
    // constructor-head gate now refuses it and RETURNS before the
    // best-effort loop and `pushCutBracketGroupAsLastResort` ever run, so the
    // sink stays EMPTY (measured directly: a fresh sink handed to
    // `lowerTypeExpr` over this text carries nothing, and "pair" lands on
    // `unresolved` instead). It was chosen as an "unknown constructor"
    // specifically because arity had nothing to say about it — bug 0282's
    // gate now does.
    [
      "b17",
      PAIR_BRACE_SIBLING,
      [],
      false,
      "FLIPPED (bug 0282 0.280.0): the constructor-head gate refuses the HEAD before this list's " +
        "own recursion reaches either argument, so the sink that would otherwise carry the cut " +
        "bracket group beside the derivable brace argument never fills \u2014 the head's own refusal " +
        "is the construct's one refusal",
    ],
    [
      "b18",
      ARRAY_BRACE_SIBLING,
      ["{a: string}", 'enum["x", "y"]'],
      true,
      "the same argument list under the `array` constructor: two arguments to an arity-1 " +
        "constructor, so the lowering runs the same best-effort loop and reaches the same sink " +
        "contents (the position-level verdict differs \u2014 cell c10 \u2014 because `array`'s own arity " +
        "walk speaks first, which is a precedence rule and not a sink contract)",
    ],
  ];

  for (const [id, source, sink, red, why] of SINK_ROWS) {
    it(`${red ? "RED" : "FENCE"} (${id}): \`${source}\` pushes ${JSON.stringify(sink)}`, () => {
      const { ctx, sink: observed } = seamCtx();
      lowerTypeExpr(source, ctx);
      expect(
        observed,
        `${id} (lowerTypeExpr sink, ${source}): ${why}. GREEN here means the sink carries ` +
          `exactly the text a position may refuse; RED with an EMPTY sink is bug 0217's symptom ` +
          `(schemas.md:93 refuses \`enum[…]\` with no depth qualifier and nothing reaches the ` +
          `shared decline \`isUnspellableTextRefusable\`), while RED with a MANUFACTURED ` +
          `fragment (\`enum["a"\`, \`"b"]\`) means a route re-judged a piece instead of the ` +
          `group the author wrote`,
      ).toEqual([...sink]);
    });
  }
});

// ===========================================================================
// (c) THE IN-CLASS ROWS — RED at all three sink positions. §Reproduction (a),
// §Expected bullets 1–3.
//
// Each row's text carries an inline `enum[…]` somewhere inside a generic
// argument. `schemas.md:93` refuses the construct with NO depth qualifier and
// `grammar.md:105` makes the grammar "otherwise identical in every position",
// so the honest disposition is ONE refusal per position, in the code that
// position already draws for the bare spelling's siblings — never a new code
// (DIAG-2, diagnostic-shape.md:72).
// ===========================================================================

const IN_CLASS_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ["c1", E2, "the base spelling: two items, one top-level comma inside the bracket list"],
  ["c2", E3, "three items — §Expected bullet 2: the item count is not a discriminator"],
  ["c3", E3_SQ, "single-quoted items: the quote form is not a discriminator either"],
  ["c4", E2_NESTED, "two generic levels — §Expected bullet 3: depth is not a discriminator"],
  ["c5", E2_IN_OBJECT, "inside a derivable `{…}` inside a generic argument: the bracket group is still the illegal unit"],
  ["c6", E2_UNION, "through a union arm, which hands the generic arm the same interior"],
  // c7 (`array<enum["a", "b"], integer>`) is EXCLUDED from this generic table by bug
  // 0236's landing: that fix makes `parseGeneric` count the two arguments the
  // source spells (the `enum[…]` group as one, `integer` as the other), so the
  // declaration's OWN walk now carries an error-severity `generic-arity-mismatch`
  // diagnostic before this sink is even consulted. `code-registry-parse.md`'s
  // `schema-type-not-expression` row's precedence sentence ("a field or
  // declaration that already carries an error-severity diagnostic from its own
  // walk … keeps that diagnostic alone and draws no refusal") then suppresses
  // THIS row's push, not because the sink is empty but because the position never
  // reaches it. See the dedicated block below.
  // c9 is asserted separately (below), OUTSIDE this loop: PERMITTED-NOT-
  // REQUIRED under bug 0282 0.280.0's flip authority. `pair` is outside
  // `GENERIC_ARITY` and `Ident`-shaped, so `lowerTypeExpr`'s constructor-head
  // gate now refuses it before this position's own last-resort push ever
  // runs. MEASURED before/after codes at the three `SINK_POSITIONS`, all
  // still exactly one refusal (the count claim below is unweakened):
  //   - field:  `theta/parse/schema-type-not-expression` -> `theta/parse/unresolved-named-type`
  //   - alias:  `theta/parse/schema-type-not-expression` -> `theta/parse/unresolved-named-type`
  //   - params: `theta/load/params-type-not-expression`  -> `theta/parse/unresolved-named-type`
  // The head's own refusal is the construct's one refusal (this row's own
  // registered cover rule), so the derivable brace argument beside the cut
  // bracket group still earns none of its own — only the CODE naming that
  // one refusal moved.
];

const C9_TYPE_SOURCE = PAIR_BRACE_SIBLING;
const C9_WHY =
  "a derivable whole brace-group argument (`{a: string}`) sits BESIDE the cut bracket group: " +
  "it contributes a sink entry the shared decline rejects, so it earns no refusal of its " +
  "own, and the group must still draw the construct's one refusal \u2014 the last-resort gate " +
  "reads the refusable contribution, not the sink's raw length";

describe("bug 0217 (c) — a nested inline `enum[…]` draws its position's refusal", () => {
  for (const [id, typeSource, why] of IN_CLASS_ROWS) {
    for (const position of SINK_POSITIONS) {
      it(`RED (${id}, ${position}): \`${typeSource}\` refuses once`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource);
        expect(
          r.lines,
          `${label}: ${why}. schemas.md:93 states the rule with no depth qualifier ("\`enum\` is ` +
            `top-level only — there is no inline \`enum["a", "b"]\` form") and ` +
            `grammar.md:90–:102 closes \`Type\` over six alternatives carrying no bracket form, ` +
            `so this input must draw EXACTLY ONE refusal here — ` +
            `\`${position === "params" ? PARAMS_REFUSAL : SCHEMA_REFUSAL}\`, the code this ` +
            `position already draws for the bare spelling's siblings (no code is minted, ` +
            `DIAG-2). GREEN means route §Fix (b)(2) pushed the cut bracket group into the ` +
            `refusal sink and this position emitted its own row. RED with \`[]\` is bug 0217's ` +
            `symptom exactly: \`lowerTypeExpr\`'s angle-only split cut the group, both pieces ` +
            `recursed through \`withoutUnspellableSink\`, and the sink the three positions read ` +
            `stayed empty — so input the spec refuses in terms loads clean. RED with TWO ` +
            `refusals means a route judged the manufactured pieces instead of the group. ` +
            `Observed: ${JSON.stringify(r.lines)}`,
        ).toEqual([...oneRefusal(position)]);
        expect(
          r.gateCount,
          `${label}: and the refusal must be error-severity in one of the two namespaces ` +
            `\`hasLoadParseError\` (src/extension/production-composition.ts) reads, so the ` +
            `theta does not register with a schema that asserts nothing`,
        ).toBe(1);
      });
    }
  }

  for (const position of SINK_POSITIONS) {
    it(`RED (c9, ${position}): \`${C9_TYPE_SOURCE}\` refuses once, now naming the head`, () => {
      const label = `c9 (${position}, ${C9_TYPE_SOURCE})`;
      const r = read(label, position, C9_TYPE_SOURCE);
      expect(
        r.lines,
        `${label}: ${C9_WHY}. FLIPPED under bug 0282 0.280.0's flip authority: \`pair\` is outside ` +
          `\`GENERIC_ARITY\` and \`Ident\`-shaped, so \`lowerTypeExpr\`'s constructor-head gate ` +
          `now refuses it before this position's own last-resort push (which produced ` +
          `${position === "params" ? PARAMS_REFUSAL : SCHEMA_REFUSAL} at HEAD) ever runs — the ` +
          `refusal now names the head, \`theta/parse/unresolved-named-type\`, instead. Still ` +
          `EXACTLY ONE refusal: the head's own refusal is the construct's one refusal, so the ` +
          `derivable brace argument beside the cut bracket group still earns none of its own. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([line(UNRESOLVED_NAMED_TYPE, [["<name>", "pair"]])]);
      expect(
        r.gateCount,
        `${label}: and the refusal must be error-severity in one of the two namespaces ` +
          `\`hasLoadParseError\` (src/extension/production-composition.ts) reads, so the ` +
          `theta does not register with a schema that asserts nothing`,
      ).toBe(1);
    });
  }

  // c7 and c8 — POST-0236 CONTRACT for `array<enum["a", "b"], integer>`, an
  // arity-1 constructor over the two arguments the source spells. Before bug
  // 0236's fix, `parseGeneric` truncated the list to one argument (the `[`
  // was never consumed, so the group's own comma was read as the argument
  // separator), which is why an earlier version of this file expected the
  // sink refusal (c7) and asserted NO arity diagnostic (c8): the declaration's
  // own walk had nothing to say, so `theta/parse/schema-type-not-expression` /
  // `theta/load/params-type-not-expression` was the whole verdict. Bug 0236
  // makes the parser count what the source spells, so the declaration's own
  // walk now raises `generic-arity-mismatch` — an ARITY POSITION rule, not a
  // type-text refusal — and `code-registry-parse.md`'s precedence sentence
  // ( "a field or declaration that already carries an error-severity
  // diagnostic from its own walk … keeps that diagnostic alone and draws no
  // refusal") means that diagnostic REPLACES the sink push rather than sitting
  // beside it. A red on c7 reporting the sink refusal instead of the arity
  // line is bug 0236 regressing (the parser truncated the list again); a red
  // on c8 with the arity code ABSENT is the same regression from the other
  // face. Bug 0124's `annotationSourceIsNotTypeExpression` is untouched by
  // either row — this pair measures a POSITION's OWN walk, not that decline.
  const ARITY_ARRAY_TWO = line(ARITY, [
    ["<ctor>", "array"],
    ["<expected>", "1"],
    ["<actual>", "2"],
  ]);

  for (const position of SINK_POSITIONS) {
    it(`RED (c7, ${position}): \`${E2_TWO_ARGS}\` draws its own arity diagnostic, not the sink refusal`, () => {
      const label = `c7 (${position}, ${E2_TWO_ARGS})`;
      const r = read(label, position, E2_TWO_ARGS);
      expect(
        r.lines,
        `${label}: bug 0236 fixed \`parseGeneric\` to count the two arguments this source ` +
          `spells (the bracket group as one, \`integer\` as the other), so \`array\` (arity 1) ` +
          `over-applied to two is the declaration's own arity violation, and ` +
          `\`code-registry-parse.md\`'s precedence sentence keeps it ALONE — it is the same ` +
          `precedence that already suppressed this push for the \`Result\`-carrier neighbour at ` +
          `HEAD. A red reporting \`${position === "params" ? PARAMS_REFUSAL : SCHEMA_REFUSAL}\` ` +
          `instead is bug 0236 UNfixed: the list truncated back to one argument, the arity rule ` +
          `read as satisfied, and this sink's last-resort push fired again. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([ARITY_ARRAY_TWO]);
      expect(
        r.gateCount,
        `${label}: still error-severity in a namespace \`hasLoadParseError\` reads, so this ` +
          `input does not register either way`,
      ).toBe(1);
    });
  }

  for (const position of SINK_POSITIONS) {
    it(`FENCE (c8, ${position}): \`${E2_TWO_ARGS}\` draws its own arity diagnostic`, () => {
      const label = `c8 (${position}, ${E2_TWO_ARGS})`;
      const r = read(label, position, E2_TWO_ARGS);
      expect(
        r.codes.includes(ARITY),
        `${label}: bug 0236 (§Fix (b)) requires the arity row to fire whether or not an ` +
          `argument derives from \`Type\` — \`parseGeneric\` now counts the two arguments this ` +
          `source spells, so \`array\`'s own arity check is violated and this position's walk ` +
          `carries \`${ARITY}\` before the sink is ever consulted. A red reporting \`false\` is ` +
          `bug 0236 regressing: the count truncated back to one and the arity rule read as ` +
          `satisfied. Observed codes: ${JSON.stringify(r.codes)}`,
      ).toBe(true);
    });
  }

  // The same argument list as c9 under the `array` constructor: the sink reaches
  // the identical contents (cell b18), and the POSITION still draws the arity
  // diagnostic ALONE, because `array` applied to two arguments fails its own
  // walk and every one of the three positions keeps a diagnostic from that walk
  // alone rather than adding the sink refusal beside it (the precedence rule
  // both refusing rows state). FENCE, and the boundary of what the last-resort
  // gate can be observed to change: it decides what reaches the sink, never
  // which of two competing rows a position emits.
  for (const position of SINK_POSITIONS) {
    it(`FENCE (c10, ${position}): \`${ARRAY_BRACE_SIBLING}\` draws its arity diagnostic alone`, () => {
      const label = `c10 (${position}, ${ARRAY_BRACE_SIBLING})`;
      const r = read(label, position, ARRAY_BRACE_SIBLING);
      expect(
        r.codes,
        `${label}: two arguments to the arity-1 \`array\` is a fault of the declaration's own ` +
          `walk, and both refusing rows state the precedence: a field or declaration already ` +
          `carrying an error-severity diagnostic from its own walk keeps that diagnostic and ` +
          `draws no text refusal. So the cut bracket group reaching the sink (cell b18) changes ` +
          `nothing here — one \`${ARITY}\` and nothing else. A red with the refusal beside it ` +
          `means the last-resort push started competing with a position rule instead of feeding ` +
          `the sink; a red with \`[]\` means the arity walk stopped speaking. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([ARITY]);
      expect(
        r.gateCount,
        `${label}: and the one diagnostic is error-severity in a namespace \`hasLoadParseError\` ` +
          `reads, so this input does not register either way`,
      ).toBe(1);
    });
  }
});

// ===========================================================================
// (d) THE LANDED TRUE REFUSALS AND THE LOCKS — FENCE, GREEN in both directions.
// §Fix (c)(2), (c)(4); bug 0204 cells g1/g2, l1, l2.
//
// Every row here already refuses at HEAD with exactly ONE diagnostic. §Fix
// (c)(2) is explicit: "One refusal per construct: a route must not turn
// `array<enum["a"]>`'s single refusal into two." d4 is additionally the fence
// proving `checkInlineEnumForm`'s anchored match (`/^\s*enum\s*\[/`,
// src/parser/schema-declarations.ts:289) was NOT extended to depth — the BARE
// spelling keeps `theta/parse/inline-enum` and the nested spelling in group (c)
// draws the position's own row instead, which is route §Fix (b)(2) and not
// §Fix (b)(1).
// ===========================================================================

describe("bug 0217 (d) — the refusals that stand, stand, and stand exactly once", () => {
  /** id, text, needs `Cat`, the code the two schema positions draw, why. */
  const KEPT: ReadonlyArray<readonly [string, string, boolean, "schema" | "enum", string]> = [
    [
      "d1",
      E1,
      false,
      "schema",
      "the comma-free list: nothing is cut, the single segment is whole and keeps the sink, and " +
        "the refusal is HEAD's own. §Fix (c)(2) forbids turning it into two",
    ],
    [
      "d2",
      E2_JUNK_ARG,
      false,
      "schema",
      "bug 0204's cell l2, a LOCK: `???` is a whole argument of the same cut list, so it earns " +
        "the one refusal and the last-resort group push does not fire",
    ],
    // d3 (`array<enum["a", "b"], Cat +>`) is EXCLUDED from this generic table by
    // bug 0236's landing, for the same reason c7 is: `parseGeneric` now counts
    // the two arguments this source spells, `array` (arity 1) over-applied to
    // two is its own arity violation, and `code-registry-parse.md`'s
    // precedence sentence keeps that diagnostic ALONE rather than beside the
    // sink push. See the dedicated block below.
    [
      "d4",
      E2_BARE,
      false,
      "enum",
      "the BARE spelling — `checkInlineEnumForm`'s anchored match owns it at the two schema " +
        "positions and is NOT touched, so `theta/parse/inline-enum` keeps exactly its current " +
        "reach and fires exactly once. Bug 0162 §Fix route (a) wires the same recogniser over " +
        "`params:`'s own top-level text, so this position draws the SAME row rather than the " +
        "generic text refusal, and this cell is what distinguishes route §Fix (b)(2) from " +
        "route §Fix (b)(1) across all three positions",
    ],
    [
      "d5",
      E2_BRACE_ROOT,
      false,
      "schema",
      "the brace-rooted root reaches the trailing catch-all as ONE fragment the author wrote, " +
        "so it refuses at HEAD and must keep refusing once",
    ],
    [
      "d6",
      T3_JUNK_ARG,
      false,
      "schema",
      "bug 0204's cell l1, a LOCK: the cut group is derivable, the whole `???` segment earns " +
        "the refusal",
    ],
  ];

  for (const [id, typeSource, withCat, schemaCode, why] of KEPT) {
    for (const position of SINK_POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` keeps ONE refusal`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource, withCat);
        const expected =
          schemaCode === "enum"
            ? [line(INLINE_ENUM, [])]
            : position === "params"
              ? [paramsRefusal("f")]
              : [schemaRefusal(DECL_NAME[position])];
        expect(
          r.lines,
          `${label}: ${why}. This row refuses at HEAD, so a red here is route §Fix (b)(2) ` +
            `over-firing (two refusals for one construct) or dropping a landed refusal — both ` +
            `barred by §Fix (c)(2). Observed: ${JSON.stringify(r.lines)}`,
        ).toEqual(expected);
        expect(
          r.gateCount,
          `${label}: and it still blocks registration exactly once (\`hasLoadParseError\`)`,
        ).toBe(1);
      });
    }
  }

  // d3 (`array<enum["a", "b"], Cat +>`) — POST-0236 CONTRACT. `Cat +` beside the
  // group does not change the argument COUNT: `array` still receives two
  // arguments (the group, and `Cat +`), so bug 0236's fixed `parseGeneric`
  // draws the same arity-1-over-two violation as c7's, and
  // `code-registry-parse.md`'s precedence sentence keeps it alone in place of
  // the sink push. A red reporting the sink refusal instead is the same
  // regression c7 and c8 measure — the parser truncating the list back to one
  // argument. This is not bug 0124's `annotationSourceIsNotTypeExpression`
  // territory (that decline concerns the four ANNOTATION-side positions, group
  // (f), not this SINK position's own arity walk).
  for (const position of SINK_POSITIONS) {
    it(`RED (d3, ${position}): \`${E2_CAT_ARG}\` draws its own arity diagnostic, not the sink refusal`, () => {
      const label = `d3 (${position}, ${E2_CAT_ARG})`;
      const r = read(label, position, E2_CAT_ARG, true);
      const arityArrayTwo = line(ARITY, [
        ["<ctor>", "array"],
        ["<expected>", "1"],
        ["<actual>", "2"],
      ]);
      expect(
        r.lines,
        `${label}: two arguments to arity-1 \`array\` (the group, and \`Cat +\`) is the ` +
          `declaration's own arity violation post-0236, and the registered precedence keeps it ` +
          `ALONE. A red reporting \`${SCHEMA_REFUSAL}\` / \`${PARAMS_REFUSAL}\` instead means ` +
          `\`parseGeneric\` truncated the list again and the last-resort sink push fired in the ` +
          `arity row's place. Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([arityArrayTwo]);
      expect(
        r.gateCount,
        `${label}: still error-severity in a namespace \`hasLoadParseError\` reads, so this ` +
          `input does not register either way`,
      ).toBe(1);
    });
  }
});

// ===========================================================================
// (e) BUG 0204'S DERIVABLE ADMISSIONS AND THE FROZEN LOWERED BYTES — FENCE,
// GREEN in both directions. §Fix (a), §Fix (c)(1), §Fix (c)(3).
//
// §Fix (a): "No route re-refuses a fragment the split manufactured out of a
// DERIVABLE group." A `{…}` group is one of grammar.md:90–:102's six `Type`
// alternatives (:101, admitted "in any `Type` position" at :109), so bug 0204's
// admissions are untouched — and the two authorized under-refusals it recorded
// (h1, l4) stay recorded rather than being silently repaired here.
//
// The byte rows are §Fix (c)(1) in full: cell a24 of bug 0204's witness pins
// `array<enum["a", "b"]>` → `{}` and that cell must stay green UNTOUCHED — a
// refusal does not need the fragment to change, and any route that moves these
// bytes is widening the split (bug 0204 §Fix (b)(1), whose cost is bug 0164's
// landed cells d6/d7).
// ===========================================================================

describe("bug 0217 (e) — bug 0204's admissions and every lowered byte are unmoved", () => {
  const ADMITTED: ReadonlyArray<readonly [string, string, boolean, string]> = [
    ["e1", T3, false, "bug 0204's central admission — the three-field inline object as a generic argument"],
    ["e2", T3_JUNK_SHARD, true, "bug 0204 cell h1's authorized under-refusal: the junk sits inside the brace-rooted piece, the cut group is derivable, silence is deliberate"],
    ["e3", T3_UNION_JUNK, true, "bug 0204 cell l4's authorized under-refusal, likewise deliberate"],
    ["e4", LEGAL, false, "the legal literal-union spelling schemas.md:93 points authors AT — it must never refuse"],
  ];

  for (const [id, typeSource, withCat, why] of ADMITTED) {
    for (const position of SINK_POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` stays clean`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource, withCat);
        expect(
          r.lines,
          `${label}: ${why}. §Fix (a) is explicit that no route re-refuses a fragment the split ` +
            `manufactured out of a DERIVABLE group, and §Fix (c)(3) keeps bug 0204's witness ` +
            `groups (b), (c), (h) and (l) green. A red here means route §Fix (b)(2)'s ` +
            `"enclosing group derives from no \`Type\` alternative" test admitted a \`{…}\` ` +
            `group into the illegal class — which is a regression of bug 0204's whole fix. ` +
            `Observed: ${JSON.stringify(r.lines)}`,
        ).toEqual([]);
      });
    }
  }

  /** id, source, the bytes `lowerTypeExpr` lowers it to. §Fix (c)(1). */
  const LOWERED: ReadonlyArray<readonly [string, string, unknown]> = [
    ["e5", E2, {}],
    ["e6", E3, {}],
    ["e7", E3_SQ, {}],
    ["e8", E2_NESTED, { type: "array", items: {} }],
    ["e9", E2_IN_OBJECT, {}],
    ["e10", E2_UNION, { anyOf: [{}, { type: "null" }] }],
    ["e11", E2_TWO_ARGS, {}],
    ["e12", E1, { type: "array", items: {} }],
    ["e13", E2_JUNK_ARG, {}],
    ["e14", E2_CAT_ARG, {}],
    ["e15", E2_BARE, {}],
    ["e16", E2_BRACE_ROOT, {}],
    ["e17", T3, {}],
    ["e18", T3_JUNK_ARG, {}],
    ["e19", T3_JUNK_SHARD, {}],
    ["e20", T3_UNION_JUNK, {}],
    ["e21", LEGAL, { type: "array", items: { type: "string", enum: ["a", "b"] } }],
  ];

  for (const [id, source, lowered] of LOWERED) {
    it(`FENCE (${id}): \`${source}\` lowers to unchanged bytes`, () => {
      const { ctx } = seamCtx();
      expect(
        lowerTypeExpr(source, ctx),
        `${id} (lowerTypeExpr, ${source}): §Fix (c)(1) freezes every lowered byte, and bug ` +
          `0204's cell a24 pins \`${E2}\` → \`{}\` specifically. This report asks for a ` +
          `DIAGNOSTIC, not a stricter fragment — what an admitted generic argument lowers to is ` +
          `bugs 0164 / 0039 / 0184's subject (§Non-goals). A red here is a route widening the ` +
          `split rather than threading a refusal`,
      ).toEqual(lowered);
    });
  }
});

// ===========================================================================
// (f) THE FOUR ANNOTATION-SIDE POSITIONS — FENCE, GREEN in both directions.
// §Fix (c)(5), §Non-goals ("Bug 0124's bracket decline").
//
// THIS GROUP IS THE BLAST-RADIUS PROOF. Bug 0124's
// `annotationSourceIsNotTypeExpression` (src/parser/type-layer-checks.ts)
// admits any source carrying a `[` BEFORE it consults the same sink, so the
// `let` annotation, `fn` parameter, `fn` return and `@<T>` query positions never
// refused the BARE spelling either — their silence pre-dates bug 0204 and is
// explicitly out of scope. Every expected value below is HEAD's own
// measurement, so any movement here is route §Fix (b)(2) narrowing bug 0124's
// decline, which §Non-goals forbids.
//
// `LETMM` (`theta/parse/let-rhs-type-mismatch`) is the `let` position's own RHS
// gate answering the `= 1` initialiser, present on every row whose annotation
// that position ADMITS — including the legal `array<"a" | "b">` — and absent on
// the three rows whose annotation the `let` position does not admit at all.
// ===========================================================================

describe("bug 0217 (f) — the four annotation-side positions do not move", () => {
  /** id, text, needs `Cat`, whether the `let` position's RHS gate fires. */
  const ANNOTATION_ROWS: ReadonlyArray<readonly [string, string, boolean, boolean]> = [
    ["f1", E2, false, true],
    ["f2", E3, false, true],
    ["f3", E3_SQ, false, true],
    ["f4", E2_NESTED, false, true],
    ["f5", E2_IN_OBJECT, false, true],
    ["f6", E2_UNION, false, true],
    // f7 (`array<enum["a", "b"], integer>`) and f10 (the same shape with `Cat +`
    // beside the group) are EXCLUDED from this generic table by bug 0236's
    // landing. §Fix (c)(5)'s claim was about bug 0124's
    // `annotationSourceIsNotTypeExpression` DECLINE, which never judged a `[`
    // and is untouched here; it was never about the ARITY line, which is a
    // property of `parseGeneric`'s own count and fires at every `Type`
    // position alike, annotation-side included. Bug 0236 makes that count the
    // two arguments this source spells, so `array` (arity 1) now draws its own
    // violation at these positions too — the arity POSITION rule, not a
    // type-text refusal, so bug 0124's decline is not narrowed by it. See the
    // dedicated block below.
    ["f8", E1, false, true],
    ["f9", E2_JUNK_ARG, false, true],
    ["f11", E2_BARE, false, false],
    ["f12", E2_BRACE_ROOT, false, false],
    ["f13", T3, false, true],
    ["f14", T3_JUNK_ARG, false, true],
    ["f15", T3_JUNK_SHARD, true, true],
    ["f16", T3_UNION_JUNK, true, true],
    ["f17", LEGAL, false, true],
  ];

  for (const [id, typeSource, withCat, letMismatch] of ANNOTATION_ROWS) {
    for (const position of ANNOTATION_POSITIONS) {
      it(`FENCE (${id}, ${position}): \`${typeSource}\` keeps its §Reproduction (a) codes`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource, withCat);
        const expected = position === "let" && letMismatch ? [LET_MISMATCH] : [];
        expect(
          r.codes,
          `${label}: §Fix (c)(5) holds the four annotation-side positions out of scope — bug ` +
            `0124's \`annotationSourceIsNotTypeExpression\` admits ANY source carrying a \`[\` ` +
            `before it consults the refusal sink, so these columns are pre-existing silence and ` +
            `not bug 0217's subject. ${
              position === "let"
                ? letMismatch
                  ? "The one expected code is this position's own RHS gate answering the `= 1` " +
                    "initialiser, which the legal `array<\"a\" | \"b\">` draws too — not a " +
                    "type-text refusal."
                  : "This annotation is not admitted here at all, so even the RHS gate is silent."
                : "This position never reaches `lowerTypeSource`, so nothing route §Fix (b)(2) " +
                  "does to the sink can reach it."
            } A red here means the fix narrowed bug 0124's decline, which §Non-goals forbids. ` +
            `Observed: ${JSON.stringify(r.lines)}`,
        ).toEqual(expected);
      });
    }
  }

  // f7 and f10 — POST-0236 CONTRACT. `array<enum["a", "b"], integer>` (f7) and
  // `array<enum["a", "b"], Cat +>` (f10) now count TWO arguments at every
  // position, annotation-side included: `generic-arity-mismatch` is emitted by
  // `walkType`'s generic arm off `parseGeneric`'s own argument list, which is
  // not gated by bug 0124's `annotationSourceIsNotTypeExpression` decline at
  // all — that decline concerns a DIFFERENT refusal
  // (`annotation-type-not-expression`) at a DIFFERENT test (whether the
  // source is a theta type expression), asked once, upstream of the type
  // parse this arity line comes from. So a red here is bug 0236 itself, not a
  // narrowing of bug 0124's decline: it means `parseGeneric` truncated the
  // list back to one argument and the arity rule read as satisfied. The `let`
  // row's ORDER is load-bearing — the arity line first, ahead of that
  // position's own RHS mismatch — mirroring bug 0236's own control ordering
  // (§Reproduction (b)).
  const ARITY_ANNOTATION_ROWS: ReadonlyArray<readonly [string, string, boolean]> = [
    ["f7", E2_TWO_ARGS, false],
    ["f10", E2_CAT_ARG, true],
  ];
  const arityArrayTwo = line(ARITY, [
    ["<ctor>", "array"],
    ["<expected>", "1"],
    ["<actual>", "2"],
  ]);

  for (const [id, typeSource, withCat] of ARITY_ANNOTATION_ROWS) {
    for (const position of ANNOTATION_POSITIONS) {
      it(`RED (${id}, ${position}): \`${typeSource}\` draws its own arity diagnostic at this annotation-side position too`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const r = read(label, position, typeSource, withCat);
        const expected =
          position === "let" ? [ARITY, LET_MISMATCH] : [ARITY];
        expect(
          r.codes,
          `${label}: bug 0236 fixed \`parseGeneric\` to count the two arguments this source ` +
            `spells, so \`array\`'s own arity check fires here exactly as it does at the sink ` +
            `positions (group (c)'s c7/c8, group (d)'s d3) — bug 0124's decline is untouched, ` +
            `because the arity line is not that decline's row. A red reporting \`[]\` (or, at ` +
            `\`let\`, the RHS-mismatch code alone) means the count truncated back to one and ` +
            `bug 0236 regressed. Observed: ${JSON.stringify(r.codes)}`,
        ).toEqual(expected);
      });
    }
  }

  it("FENCE (f18): the `let` position's row is the RHS gate's, rendered from the registry", () => {
    const label = `f18 (let, ${E2})`;
    const r = read(label, "let", E2);
    expect(
      r.lines,
      `${label}: the code alone could be a stand-in, so this cell renders the whole line from ` +
        `the registry (DIAG-4, diagnostic-shape.md:74). \`parseType\`'s captured text is ` +
        `normalised, so \`<expected>\` renders without the spaces the source spells. The row ` +
        `names the INITIALISER mismatch, never the type text — which is exactly why §Fix (c)(5) ` +
        `holds this position out of scope`,
    ).toEqual([
      line(LET_MISMATCH, [
        ["<name>", "x"],
        ["<expected>", 'array<enum["a","b"]>'],
        ["<actual>", "integer"],
      ]),
    ]);
  });
});

// ===========================================================================
// (g) THE REGISTRATION OBSERVABLE — RED for the in-class rows, FENCE for the
// two derivable controls. §Reproduction (b)'s registration table.
//
// The cost is not the missing diagnostic, it is the registered schema: a
// `params:` field declared `array<enum["a", "b"]>` lowers `properties.f = {}` —
// a fragment that validates EVERY value — and the theta registers with the
// author's enumeration constraining nothing. Reached the way bug 0204's group
// (k) reaches it: through the two properties `hasLoadParseError`
// (src/extension/production-composition.ts) reads, plus the frontmatter
// collapse.
// ===========================================================================

describe("bug 0217 (g) — an illegal type does not register a schema that asserts nothing", () => {
  /** id, text, the permissive fragment HEAD registers today. */
  const REGISTERED_TODAY: ReadonlyArray<readonly [string, string, unknown]> = [
    ["g1", E2, {}],
    ["g2", E3, {}],
    ["g3", E3_SQ, {}],
    ["g4", E2_NESTED, { type: "array", items: {} }],
    ["g5", E2_IN_OBJECT, {}],
    ["g6", E2_UNION, { anyOf: [{}, { type: "null" }] }],
    ["g7", E2_TWO_ARGS, {}],
  ];

  for (const [id, typeSource, fragment] of REGISTERED_TODAY) {
    it(`RED (${id}): \`params: f: ${typeSource}\` does not register`, () => {
      const label = `${id} (params registration, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        r.gateCount,
        `${label}: §Reproduction (b)'s registration table measures ZERO error-severity ` +
          `\`theta/parse/\` / \`theta/load/\` codes here, which is exactly what ` +
          `\`hasLoadParseError\` reads, so the theta REGISTERS. Under route §Fix (b)(2) the cut ` +
          `bracket group reaches the sink and this position emits ` +
          `\`${PARAMS_REFUSAL}\` once, so the count is 1. RED with 0 is bug 0217's symptom: ` +
          `input the spec refuses in terms (schemas.md:93) registers. ` +
          `Observed: ${JSON.stringify(r.lines)}`,
      ).toBe(1);
      expect(
        r.frontmatterPresent,
        `${label}: and the whole frontmatter is withheld, so the theta is absent from the ` +
          `registry rather than degraded — the same collapse the CONTROL \`${E1}\` and the bare ` +
          `\`${E2_BARE}\` already produce at this position (§Reproduction (b)). RED with ` +
          `\`true\` means the frontmatter survived, i.e. the refusal never fired, and the field ` +
          `registered the assert-nothing fragment ${JSON.stringify(fragment)} that HEAD lowers ` +
          `— a value the author declared as an enumeration validated against nothing`,
      ).toBe(false);
    });
  }

  const REGISTRATION_FENCES: ReadonlyArray<readonly [string, string, unknown, string]> = [
    [
      "g8",
      T3,
      {},
      "bug 0204's own live-and-unit admission: the derivable three-field inline object " +
        "registers, with the permissive `{}` its two-segment split already produced " +
        "(§Non-goals: what an admitted argument lowers to is bugs 0164 / 0039 / 0184's)",
    ],
    [
      "g9",
      LEGAL,
      { type: "array", items: { type: "string", enum: ["a", "b"] } },
      "the legal literal-union spelling registers AND lowers a real constraint — the shape " +
        "schemas.md:93 tells authors to write instead of an inline enum, which is what makes " +
        "the refusal above a redirection rather than a loss of expressiveness",
    ],
  ];

  for (const [id, typeSource, fragment, why] of REGISTRATION_FENCES) {
    it(`FENCE (${id}): \`params: f: ${typeSource}\` keeps registering`, () => {
      const label = `${id} (params registration, ${typeSource})`;
      const r = read(label, "params", typeSource);
      expect(
        r.gateCount,
        `${label}: ${why}. A red here is route §Fix (b)(2) over-refusing a derivable group ` +
          `(§Fix (a), §Fix (c)(3)). Observed: ${JSON.stringify(r.lines)}`,
      ).toBe(0);
      expect(
        r.frontmatterPresent,
        `${label}: and its frontmatter survives, so the theta is in the registry`,
      ).toBe(true);
      expect(
        loweredF(label, r),
        `${label}: with the bytes §Fix (c)(1) freezes`,
      ).toEqual(fragment);
    });
  }
});

// ===========================================================================
// (h) THE UNCLOSED BRACKET GROUP — FENCE, GREEN in both directions. An
// AUTHORIZED under-refusal, stated here rather than discovered.
//
// `array<enum["a", "b">` writes a bracket group the source never closes. The
// interior reaching `lowerTypeExpr`'s generic arm is `enum["a", "b"`, whose
// bracket frame is still open when the scan ends, so
// `findCutBracketGroupText` records no frame and returns `undefined`: the
// helper returns the construct the AUTHOR wrote, and an unclosed group has no
// known extent to name. §Fix names two routes and both are about a CUT, CLOSED
// bracket group; neither addresses malformed bracket nesting, so this input
// stays with the positions' own capture-level rows. Those rows are not silent
// everywhere, which is why this cell measures all seven positions rather than
// asserting a blanket `[]`: the alias arm refuses the whole captured arm, and
// the `let` position draws its own `let-without-initialiser` because the
// unbalanced `>` swallows the `= 1`.
// ===========================================================================

const LET_NO_INIT = "theta/parse/let-without-initialiser";

describe("bug 0217 (h) — an unclosed bracket group is an authorized under-refusal", () => {
  it("FENCE (h1): `array<enum[\"a\", \"b\">` keeps every position's own disposition", () => {
    expect(
      findCutBracketGroupText('enum["a", "b"'),
      "h1: the matching `]` is REQUIRED. The bracket frame is still open when the scan ends, so " +
        "no frame is recorded and the helper names nothing — there is no construct to name when " +
        "its extent is unknown. A red here means the helper started guessing an unclosed " +
        "group's end, which would push text the author never delimited into the refusal sink",
    ).toBe(undefined);
    const { ctx, sink } = seamCtx();
    lowerTypeExpr(UNBALANCED, ctx);
    expect(
      sink,
      "h1: so nothing reaches the shared decline from this input, and the under-refusal is the " +
        "helper's stated boundary rather than a discovered gap (§Fix addresses a cut, CLOSED " +
        "bracket group only)",
    ).toEqual([]);

    const expected: Record<SinkPosition | AnnotationPosition, readonly string[]> = {
      field: [],
      alias: [SCHEMA_REFUSAL],
      params: [],
      let: [LET_NO_INIT],
      fnparam: [],
      fnret: [],
      query: [],
    };
    for (const position of [...SINK_POSITIONS, ...ANNOTATION_POSITIONS]) {
      const label = `h1 (${position}, ${UNBALANCED})`;
      const r = read(label, position, UNBALANCED);
      expect(
        r.codes,
        `${label}: each position keeps exactly what its own capture-level rows say about an ` +
          `unbalanced type text, and bug 0217 adds nothing to any of them. The alias arm refuses ` +
          `the whole captured arm through the catch-all (the capture is the author's own bytes, ` +
          `no split manufactured it); the \`let\` position's \`${LET_NO_INIT}\` is that ` +
          `position's own report that the unbalanced \`>\` swallowed the \`= 1\`; the \`schema\` ` +
          `field type, \`params:\` and the three remaining annotation positions admit it. That ` +
          `\`params:\` admission is the authorized under-refusal in full: the field lowers the ` +
          `assert-nothing \`{}\` and the theta registers, exactly as it did before bug 0217's ` +
          `fix. A red here means the fix reached malformed bracket nesting, which no route in ` +
          `§Fix authorizes. Observed: ${JSON.stringify(r.lines)}`,
      ).toEqual([...expected[position]]);
    }

    const label = `h1 (params registration, ${UNBALANCED})`;
    const r = read(label, "params", UNBALANCED);
    expect(
      r.frontmatterPresent,
      `${label}: and the registration consequence is stated too — the frontmatter survives, so ` +
        `the theta is in the registry with a field that validates every value. This is the ` +
        `authorized half of bug 0217's own symptom, bounded to a bracket group the source never ` +
        `closes`,
    ).toBe(true);
    expect(
      loweredF(label, r),
      `${label}: with the permissive fragment the generic arm's catch-all lowers for it`,
    ).toEqual({});
  });
});
