// Bug 0220 — a `void`-returning `fn` whose tail expression is a bare `@`-query
// draws `theta/parse/void-in-non-return-position` at the QUERY's range, for a
// `void` the author wrote only at the one position the grammar admits it
// (docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md).
//
// `SchemaSinkRewriter`'s `fn` arm (src/parser/query-schema-resolve.ts) builds the
// QRY-2 `fn-return` sink frame from `annotationToInferred(stmt.returnType)`. The
// adapter chain — `annotationToCompatType` (src/parser/type-layer-checks.ts),
// whose `PRIMITIVE_NAMES` set does not contain `void`, then `compatToInferred`'s
// `named` arm, which admits any plain identifier — carries `void` through as
// `{ kind: "named", name: "void" }`. `inferQuerySchema`'s `fn-return` case
// (src/parser/query-schema-inference.ts) hands that frame's type to a query in
// tail or `return`-operand position, and `resolveQuery` writes it back through
// `serializeInferred`, so `QueryExpr.schema` is the string `"void"`. `walkExpr`'s
// `query` arm (src/parser/theta-document.ts) then re-walks that propagated text
// with `parseTypeExpression(…, "value", …)`, and `type-grammar.ts`'s `void` case
// admits the keyword only at `position === "return"` on a root, so the walk
// pushes an error-severity diagnostic at the query's range. The `fn` return
// slot's OWN walk passes `"return"` and is correctly silent, which is why the
// same body with a non-query tail loads.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:89 — `ReturnType ::= Type | "void"`,
//     "function-/theta-return position only; `void` is admitted here and nowhere
//     else". `fn f(): void` writes `void` at exactly that position.
//   - docs/spec_topics/grammar.md:105 and the
//     `theta/parse/void-in-non-return-position` row of
//     docs/spec_topics/diagnostics/code-registry-parse.md — the *Trigger* is a
//     CLOSED position list: a `let` annotation, a schema or `params:` field, a
//     generic argument (`array<void>`, `Result<void, E>`), an `invoke<void>`
//     annotation, a type ascription, or a union arm. A query's INFERRED response
//     schema is not on it, and no source position in the subject rows is.
//   - docs/spec_topics/functions.md FN-4 (#fn-4) — "An explicit `void` return
//     type still discards any tail expression value silently". A tail expression
//     under a `void` return is discarded, not type-checked against `void`.
//   - docs/spec_topics/query/query-forms.md QRY-2 (#qry-2) and the sink list at
//     :32 — a sink is "a position whose declared type can supply the schema";
//     `void` supplies no value type. :35 gives the fallback: "If no sink encloses
//     the query and no explicit ascription is present, the query is untyped
//     (returns `string`)" — so the affected query's `QueryExpr.schema` is null,
//     the same value the non-tail (`let`-bound) and opaque-position rows carry.
//   - docs/spec_topics/query/query-forms.md QRY-3 (#qry-3) — an author-written
//     `@<Schema>` ascription always supplies the schema. `@<void>`hi`` is
//     author-written `void` at a type ascription, which IS on the registry row's
//     list, so it keeps its diagnostic.
//
// WHAT THIS FILE LOCKS. Whole ordered lists in BOTH observable channels, for
// every row: `doc.diagnostics` rendered `<severity> <code> @ <start>-<end>` in
// emission order, and every `QueryExpr.schema` in traversal order (plus
// `schemaFromLetAnnotation` / `ascriptionWritten` for the two rows whose IDENTITY
// is that marker). One channel alone cannot pin the repair: `QueryExpr.schema` is
// a wire input downstream lowering and typed dispatch read, so a route that
// silenced the diagnostic while leaving `"void"` in the field would ship `void`
// as a response-schema name, and a route that emptied the field for every
// propagated annotation would break typed dispatch invisibly to the diagnostic
// list.
//
// THE SUBJECT ROWS (red at HEAD, green after the fix): v1 (bare query tail), v10
// (both branches of an `if`/`else` tail — the emission is a property of the sink,
// not of one tail node), v14 (the same `fn` also called, so the value is
// consumed), v22 (an explicit `return` operand, the sink's second position). Each
// asserts an EMPTY diagnostic list and `schema === null`.
//
// THE CONTROLS THAT MAKE A WRONG ROUTE RED (green at HEAD and after):
//   - the `Ghost`-return row (group (e)) — `walkExpr`'s `query` arm is the SOLE
//     emitter of `theta/parse/unresolved-named-type` for a propagated annotation,
//     and `fn f(): Ghost { 1 }` draws none. A route that silences the arm
//     wholesale for propagated text reds here.
//   - the `string`-return row (group (f)) — `schema === "string"`. A route that
//     starves the schema slot, or declines the `fn`-return sink generally rather
//     than for the `void` keyword at a root, reds here.
//   - the author-written ascription (v9) and bug 0093's landed direct-`let` route
//     (v6), each keeping its own single line and its provenance flag: a route
//     keyed on "the author did not write this text" must not swallow either.
//   - the nested / parameter / schema-field `void` rows (group (d)) — the written
//     `void` there is genuinely illegal at its own site, so those lines are
//     recorded exactly as measured, root-only repair or not.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, driven through `parseDoc`
// (tests/helpers/e2e-s1.ts) — the shipped load path wrapped in the standard inert
// `parseDeps` double, the harness the bug doc's §Reproduction used. The
// observables are a parse-time diagnostic list and a parsed-node field; an
// integration or live tier would add a session round-trip that can assert neither
// the diagnostic list nor the resolved `QueryExpr.schema` more sharply, and the
// error-severity diagnostic means the affected theta never reaches a runtime at
// all.
//
// WHOLE ORDERED LISTS, NEVER `.some` / `.toContain`: the claim is an ABSENCE in
// one channel and an exact value in the other, so both directions have to be
// reachable off one assertion.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. Every
// asserted code is looked up in the registry first, so a renamed or removed row
// reds by naming the registry rather than by a silently-unreachable expectation.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// ===========================================================================
// The codes under assertion, checked against the registry before use (DIAG-2).
// ===========================================================================

const VOID_POS = "theta/parse/void-in-non-return-position";
const UNRESOLVED = "theta/parse/unresolved-named-type";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

for (const code of [VOID_POS, UNRESOLVED]) {
  expect(
    registryMessage(REGISTRY, code) as string | undefined,
    `bug 0220: ${code} has no row in docs/spec_topics/diagnostics/code-registry-parse.md — ` +
      "the code whose presence and absence this file pins is unregistered, so every " +
      "expectation below names a code the tree no longer emits (DIAG-2)",
  ).toBeTypeOf("string");
}

// ===========================================================================
// Fixtures. Every fixture carries `mode: prompt` frontmatter so no
// `theta/load/missing-mode` noise is present, starts the declaration under test
// on line 4 (so an `fn` body opens on line 5), and ends `let a = 1` + `a` so the
// theta carries a tail expression of its own — the shape the bug doc's
// §Reproduction measured.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is a block starting on line 4, plus the tail. */
function blockBody(lines: readonly string[]): string {
  return `${FM}${lines.join("\n")}\n${TAIL}`;
}

/** A `mode: prompt` theta whose body is the single statement `stmt` on line 4. */
function body(stmt: string): string {
  return blockBody([stmt]);
}

// ===========================================================================
// Rendering. The RANGE is load-bearing in both directions: the subject's whole
// defect is that the line sits at the query expression's range rather than at any
// range the author wrote type text in, and the adjacent rows of group (d) are
// distinguished from the subject only by their range (the declaration's own
// `4:1-6:2` versus the query's).
// ===========================================================================

/**
 * Each diagnostic as `<severity> <code> @ <start>-<end>`, in emission order. A
 * range-less diagnostic (the located-site classification admits file-only and
 * location-less ones) would render no range to compare, so its absence is
 * asserted rather than defaulted — a silent placeholder would let a
 * declaration-ranged line read as a query-ranged one.
 */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => {
    const range = d.range;
    expect(
      range,
      `bug 0220: ${d.code} arrived with no range, so a line at the QUERY's range — the ` +
        "defect — cannot be distinguished from one at the declaration's own range, which is " +
        "correct and out of scope",
    ).toBeDefined();
    const r = range as NonNullable<typeof range>;
    return (
      `${d.severity} ${d.code} @ ${r.start.line}:${r.start.column}` +
      `-${r.end.line}:${r.end.column}`
    );
  });
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src, "bug0220.theta"));
}

/** One rendered error line at one range. */
function at(code: string, range: string): string {
  return `error ${code} @ ${range}`;
}

/**
 * The whole ordered diagnostic list of every cell of a table, asserted in one
 * equality so a divergence names the row rather than stopping at the first one.
 */
function expectTable(
  cells: ReadonlyArray<readonly [string, string, readonly string[]]>,
  why: string,
): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const [label, src, want] of cells) {
    actual[label] = lines(src);
    expected[label] = [...want];
  }
  expect(actual, why).toEqual(expected);
}

interface QueryFacts {
  readonly schema: unknown;
  readonly marker: unknown;
  readonly asc: unknown;
}

/**
 * Every query in the parsed body, in traversal order, read AFTER
 * `resolveQuerySchemas` has run — the way the bug doc's §Reproduction (b) table
 * reads them. `schema` is the resolved response schema downstream lowering and
 * typed dispatch consume; `marker` is `schemaFromLetAnnotation` (bug 0093's
 * direct-`let` provenance flag, set by `parseLet` alone) and `asc` is
 * `ascriptionWritten` — the two flags that tell an author-written `void` from a
 * propagated one, and therefore the two a repair keyed on provenance must leave
 * exactly where they are.
 */
function queryFacts(src: string): QueryFacts[] {
  const found: QueryFacts[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (record.kind === "query") {
      found.push({
        schema: record.schema ?? null,
        marker: record.schemaFromLetAnnotation ?? null,
        asc: record.ascriptionWritten ?? null,
      });
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parseDoc(src, "bug0220.theta").body as unknown);
  return found;
}

/** Only the resolved response schemas, in traversal order. */
function querySchemas(src: string): unknown[] {
  return queryFacts(src).map((q) => q.schema);
}

/**
 * Only the two provenance flags, in traversal order. The schema value is left
 * out deliberately: it is the subject channel group (f) owns, and mixing it in
 * here would make this group red pre-fix for group (f)'s reason instead of
 * pinning the flags on their own.
 */
function queryFlags(src: string): Array<{ marker: unknown; asc: unknown }> {
  return queryFacts(src).map((q) => ({ marker: q.marker, asc: q.asc }));
}

// ===========================================================================
// The fixture set, named once and shared between the diagnostic and schema
// channels so both assert over the SAME source text.
// ===========================================================================

/** v1 — the subject: a bare query as the tail of a `void`-returning `fn`. */
const VOID_TAIL = blockBody(["fn f(): void {", "  @`hi`", "}"]);
/** v2 / v13 / v15 — the same `void` return with a non-query tail. */
const VOID_TAIL_NUMBER = blockBody(["fn f(): void {", "  1", "}"]);
const VOID_TAIL_STRING = blockBody(["fn f(): void {", '  "x"', "}"]);
const VOID_TAIL_INVOKE = blockBody(["fn f(): void {", '  invoke("./x.theta")', "}"]);
/** v7 — the same query, `let`-bound, so no sink encloses it. */
const VOID_LET_BOUND = blockBody(["fn f(): void {", "  let q = @`hi`", "  q", "}"]);
/** v11 — a `match` scrutinee is an opaque position; the outward walk stops. */
const VOID_MATCH_ARM = blockBody([
  "fn f(): void {",
  "  match 1 {",
  "    _ => @`hi`",
  "  }",
  "}",
]);
/** v10 — both branches of an `if`/`else` tail are in sink position. */
const VOID_IF_ELSE = blockBody([
  "fn f(): void {",
  "  if true {",
  "    @`hi`",
  "  } else {",
  "    @`ho`",
  "  }",
  "}",
]);
/** v22 — the sink's second position: an explicit `return` operand. */
const VOID_RETURN = blockBody(["fn f(): void {", "  return @`hi`", "}"]);
/**
 * v14 — v1 with the function actually called. The binder is `r`, not the doc's
 * `a`, because the shared tail already binds `a`; the measured lists are
 * identical either way.
 */
const VOID_TAIL_CALLED = blockBody(["fn f(): void {", "  @`hi`", "}", "let r = f()"]);
/** v4 — the schema-supplying control: a real value type at the same sink. */
const STRING_TAIL = blockBody(["fn f(): string {", "  @`hi`", "}"]);
/** v6 — bug 0093's landed direct-`let` route: author-written `void`, marker set. */
const LET_VOID = body("let r: void = @`hi`");
/** v9 — author-written `void` at a type ascription (QRY-3, on the registry list). */
const VOID_ASCRIPTION = blockBody(["fn f(): void {", "  @<void>`hi`", "}"]);
/** v16 / v16b — the propagated name the query arm alone resolves. */
const GHOST_TAIL = blockBody(["fn f(): Ghost {", "  @`hi`", "}"]);
const GHOST_TAIL_NUMBER = blockBody(["fn f(): Ghost {", "  1", "}"]);
/** v12 — `void` one level down inside a generic argument. */
const ARRAY_VOID_TAIL = blockBody(["fn f(): array<void> {", "  @`hi`", "}"]);
/** v17 — `void` as an `fn` parameter type, with a query at the call site. */
const PARAM_VOID = blockBody([
  "fn g(p: void) {",
  "  1",
  "}",
  "fn f(): string {",
  "  g(@`hi`)",
  "}",
]);
/** v21 — a `Result<…>` return type: the adapters decline, the sink is empty. */
const RESULT_VOID_TAIL = blockBody(["fn f(): Result<void, QueryError> {", "  @`hi`?", "}"]);
/** v18 / v18b — `void` as a schema field type, with and without a query. */
const SCHEMA_FIELD_VOID = blockBody(["schema S {", "  f: void", "}", "let r = S { f: @`hi` }"]);
const SCHEMA_FIELD_VOID_NUMBER = blockBody([
  "schema S {",
  "  f: void",
  "}",
  "let r = S { f: 1 }",
]);

// ===========================================================================
// (a) THE SUBJECT — a `void` return type supplies no QRY-2 sink, so a query in
// tail or `return`-operand position under one draws NOTHING. The author wrote
// `void` once, at the position grammar.md:89 admits and the registry row's closed
// position list excludes.
// RED at HEAD: every row carries a `void-in-non-return-position` at the QUERY's
// range.
// ===========================================================================

describe("bug 0220 (a) — a `void` return type is no sink and draws no diagnostic", () => {
  it("RED a1: the tail, `return`-operand, multi-branch and called spellings are silent", () => {
    // The four rows separate four candidate explanations. `tail` is the minimal
    // subject. `return-operand` proves the sink's second position behaves
    // alike, so a repair keyed on tail-expression position only would still red.
    // `if-else` emits TWICE at HEAD, proving the defect is a property of the sink
    // frame rather than of one tail node, so a repair that deduped per document
    // would leave one line. `called` proves the emission does not depend on the
    // function's value being discarded at the call site.
    expectTable(
      [
        ["tail", VOID_TAIL, []],
        ["return-operand", VOID_RETURN, []],
        ["if-else-branches", VOID_IF_ELSE, []],
        ["called", VOID_TAIL_CALLED, []],
      ],
      "a1 — a red row carrying `void-in-non-return-position` at the query's range IS bug 0220: " +
        "`SchemaSinkRewriter`'s `fn` arm made the root `void` return annotation into a sink " +
        "frame, `resolveQuery` serialised it into `QueryExpr.schema`, and `walkExpr`'s `query` " +
        "arm re-walked that text at position `\"value\"`, where the keyword is refused. The " +
        "author wrote `void` only at the return position, which the `fn` return slot's own " +
        "walk admits at `\"return\"` (see b1's non-query rows, silent at HEAD)",
    );
  });
});

// ===========================================================================
// (b) THE DISCRIMINATOR CONTROLS — what decides whether the document is refused
// is the tail being a bare QUERY, not the `void` annotation. These rows already
// load at HEAD and must keep loading.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0220 (b) — the same `void` return with no query in sink position", () => {
  it("GREEN b1: non-query tails, a `let`-bound query and an opaque position are silent", () => {
    // The first three rows place the written `void` at exactly the subject's
    // position with no query in tail position: the `fn` return slot's own walk
    // passes `"return"`, where a root `void` is admitted. `let-bound` and
    // `match-arm` keep the query and remove the SINK instead — a `let`
    // initialiser is not tail position, and query-forms.md:39's outward walk
    // stops at a `match` scrutinee — so the same query under the same `void`
    // return already draws nothing today. A red here means the repair moved a
    // position that was never defective.
    expectTable(
      [
        ["tail-number", VOID_TAIL_NUMBER, []],
        ["tail-string", VOID_TAIL_STRING, []],
        ["tail-invoke", VOID_TAIL_INVOKE, []],
        ["let-bound", VOID_LET_BOUND, []],
        ["match-arm", VOID_MATCH_ARM, []],
      ],
      "b1 — these five rows load at HEAD and pin the discriminator: with the same written " +
        "`void` return annotation, removing the query (first three) or removing the SINK " +
        "(last two) is already silent, so the diagnostic a1 witnesses comes from the sink " +
        "frame's propagated text and from nothing the author wrote",
    );
  });
});

// ===========================================================================
// (c) THE AUTHOR-WRITTEN `void` POSITIONS — a type ascription (QRY-3) and a `let`
// annotation are both ON the registry row's closed position list, so each keeps
// exactly its one line. A repair keyed on "the author did not write this text"
// must key on `ascriptionWritten` / `schemaFromLetAnnotation`, both asserted in
// group (g), and not on "the annotation is spelled `void`".
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0220 (c) — an author-written `void` keeps its diagnostic", () => {
  it("GREEN c1: the ascription and the direct-`let` route each keep one line", () => {
    // `ascription`'s range spans the whole query INCLUDING `@<void>`, the text
    // the author wrote. `direct-let`'s range is the `let` STATEMENT's, which is
    // bug 0093's landed route-2 shape: the marker makes `walkExpr`'s `query` arm
    // withhold its type-grammar call, so the surviving line is the one
    // `walkStatement`'s `let` arm pushed before descending into the initialiser.
    expectTable(
      [
        ["ascription", VOID_ASCRIPTION, [at(VOID_POS, "5:3-5:14")]],
        ["direct-let", LET_VOID, [at(VOID_POS, "4:1-4:20")]],
      ],
      "c1 — a red here means the repair silenced a `void` the author DID write at a position " +
        "the registry row names (a type ascription, a `let` annotation). `direct-let` losing " +
        "its line, or gaining a second query-ranged one, additionally means bug 0093's landed " +
        "route-2 withhold was disturbed",
    );
  });
});

// ===========================================================================
// (d) THE ADJACENT ROWS — a nested `void` (`array<void>`), a `void` PARAMETER
// type and a `void` SCHEMA FIELD are each illegal at their OWN site, and each
// site reports them. Bug 0220's subject is the ROOT return position only, so
// these lists are recorded exactly as measured, including the second,
// query-ranged copies of `array<void>` and the `void` parameter (bug 0220
// §Non-goals: a duplicated true verdict, not an invented one).
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0220 (d) — the nested, parameter and schema-field `void`s are unmoved", () => {
  it("GREEN d1: each own-site line stays, second copies included", () => {
    // `array-void` and `param-void` carry TWO lines: the declaration's own
    // `4:1-6:2` and the query arm's re-report at the query's range.
    // `result-void` and `schema-field-void` reach the arm with no schema at all —
    // the `Result<…>` and object shapes are the adapters' documented coverage
    // limit, so `QueryExpr.schema` stays null (group (f)) and the arm's
    // non-empty-schema guard skips the walk. `schema-field-void-number` shows
    // that row's single line is the DECLARATION's, present with no query at all.
    expectTable(
      [
        [
          "array-void",
          ARRAY_VOID_TAIL,
          [at(VOID_POS, "4:1-6:2"), at(VOID_POS, "5:3-5:8")],
        ],
        ["param-void", PARAM_VOID, [at(VOID_POS, "4:1-6:2"), at(VOID_POS, "8:5-8:10")]],
        ["result-void", RESULT_VOID_TAIL, [at(VOID_POS, "4:1-6:2")]],
        ["schema-field-void", SCHEMA_FIELD_VOID, [at(VOID_POS, "4:1-6:2")]],
        ["schema-field-void-number", SCHEMA_FIELD_VOID_NUMBER, [at(VOID_POS, "4:1-6:2")]],
      ],
      "d1 — a red here means the repair reached past the ROOT return position: it either " +
        "silenced a `void` that is genuinely illegal at its own site (a generic argument, an " +
        "`fn` parameter type, a schema field — all on the registry row's closed list), or it " +
        "changed which shapes the sink adapters admit",
    );
  });
});

// ===========================================================================
// (e) THE ARM'S OTHER WORK — `walkExpr`'s `query` arm is the SOLE emitter of
// `theta/parse/unresolved-named-type` for a propagated annotation: the registry
// row's closed five-position list does not name an `fn` return type, which is why
// the non-query control is silent. A route that withholds the whole arm for
// propagated text, rather than declining the sink for a root `void`, deletes this
// document's only diagnostic and reds.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0220 (e) — the query arm keeps its name resolution", () => {
  it("GREEN e1: a propagated unresolvable return type keeps its `unresolved-named-type`", () => {
    expectTable(
      [
        ["ghost-return", GHOST_TAIL, [at(UNRESOLVED, "5:3-5:8")]],
        ["ghost-return-non-query", GHOST_TAIL_NUMBER, []],
      ],
      "e1 — the first row's single line comes from the query arm alone. A red on it means the " +
        "repair silenced the arm wholesale for propagated text instead of declining the sink " +
        "for a root `void`, dropping the only diagnostic this document has for an unresolvable " +
        "declared return type. A red on the second row means the repair widened the registry " +
        "row's closed position list instead",
    );
  });
});

// ===========================================================================
// (f) THE SCHEMA CHANNEL — `QueryExpr.schema` is the resolved response schema
// downstream lowering and typed dispatch read, so the fix must DECIDE it rather
// than move it as a side effect. `void` supplies no value type, so the affected
// query has no usable sink and query-forms.md:35's fallback applies: untyped,
// `schema === null`, exactly the value the `let`-bound and opaque-position rows
// already carry.
// RED at HEAD on the subject rows, which hold the string `"void"`.
// ===========================================================================

describe("bug 0220 (f) — the affected query is untyped, not typed `void`", () => {
  it("RED f1: the subject rows resolve to null and the value-typed rows are unchanged", () => {
    expect(
      {
        tail: querySchemas(VOID_TAIL),
        "return-operand": querySchemas(VOID_RETURN),
        "if-else-branches": querySchemas(VOID_IF_ELSE),
        called: querySchemas(VOID_TAIL_CALLED),
        "let-bound": querySchemas(VOID_LET_BOUND),
        "match-arm": querySchemas(VOID_MATCH_ARM),
        "string-return": querySchemas(STRING_TAIL),
        "ghost-return": querySchemas(GHOST_TAIL),
        "array-void": querySchemas(ARRAY_VOID_TAIL),
        "param-void": querySchemas(PARAM_VOID),
        "result-void": querySchemas(RESULT_VOID_TAIL),
        "schema-field-void": querySchemas(SCHEMA_FIELD_VOID),
        "schema-field-void-number": querySchemas(SCHEMA_FIELD_VOID_NUMBER),
        "tail-number": querySchemas(VOID_TAIL_NUMBER),
      },
      "f1 — the four subject rows hold the string `\"void\"` at HEAD, a response-schema name no " +
        "schema declaration can carry; they must hold null, the untyped fallback the " +
        "`let-bound` and `match-arm` rows already show for a query with no sink. A red on " +
        "`string-return` (`\"string\"`) or `ghost-return` (`\"Ghost\"`) instead means the repair " +
        "starved the sink generally rather than declining a ROOT `void`, so typed dispatch " +
        "lowers nothing where the author declared a real return type. A red on `array-void` " +
        "(`\"array<void>\"`) means a nested `void` was caught by a root-only rule",
    ).toEqual({
      tail: [null],
      "return-operand": [null],
      "if-else-branches": [null, null],
      called: [null],
      "let-bound": [null],
      "match-arm": [null],
      "string-return": ["string"],
      "ghost-return": ["Ghost"],
      "array-void": ["array<void>"],
      "param-void": ["void"],
      "result-void": [null],
      "schema-field-void": [null],
      "schema-field-void-number": [],
      "tail-number": [],
    });
  });
});

// ===========================================================================
// (g) THE PROVENANCE FLAGS — the two fields that tell an author-written `void`
// from a propagated one. `schemaFromLetAnnotation` is set by `parseLet` at its
// two direct-propagation sites only (bug 0093's landed route) and
// `ascriptionWritten` marks an author-written `@<T>`; both are false/absent on
// the inference route this bug owns. A repair keyed on either must leave both
// exactly where they are, or group (c)'s surviving lines move.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0220 (g) — the provenance flags keep their scoping", () => {
  it("GREEN g1: the marker stays `parseLet`-only and the ascription flag author-only", () => {
    expect(
      {
        "direct-let": queryFlags(LET_VOID),
        ascription: queryFlags(VOID_ASCRIPTION),
        tail: queryFlags(VOID_TAIL),
      },
      "g1 — a red on `direct-let` or `ascription` means the repair changed which route owns a " +
        "`void` the author wrote, and group (c)'s single lines follow it. A red on `tail`'s " +
        "flags means the repair marked the INFERENCE route as author-written, which would " +
        "silence the propagated-text channel by provenance rather than by declining the sink — " +
        "and would reach every propagated annotation, not the `void` keyword",
    ).toEqual({
      "direct-let": [{ marker: true, asc: false }],
      ascription: [{ marker: null, asc: true }],
      tail: [{ marker: null, asc: false }],
    });
  });
});
