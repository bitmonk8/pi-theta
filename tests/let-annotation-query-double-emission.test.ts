// Bug 0093 — a `let` annotation over a bare-query initialiser is type-checked at
// two sites, so one written type draws two diagnostics
// (docs/bugs/0093-let-annotation-query-position-double-emission.md).
//
// `parseLet` copies the annotation text onto the query so the runtime lowers it
// as the response schema (src/parser/theta-document.ts:2156–2168, the direct arm
// at :2158 and the `?`/`try` inner-operand arm at :2166). The copy is verbatim
// and unmarked, so the whole-document walk reaches that one text twice:
// `walkStatement`'s `let` arm (`parseTypeExpression(s.annotation, "value", …)`,
// :6985) and `walkExpr`'s `query` arm (`parseTypeExpression(responseAnnotation,
// "value", …)`, :7512). Both take the default rule set, so every rule the walk
// owns at position `"value"` doubles at that one position.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/code-registry-parse.md:91 — `empty-schema-body`'s
//     *Trigger* is a condition on the source: "An empty inline object type
//     (`{}`) in any `Type` position, at any nesting depth." ``let r: {} = @`hi` ``
//     satisfies it once. :62 (`generic-arity-mismatch`), :63
//     (`void-in-non-return-position`) and :99 (`unresolved-named-type`) are the
//     other rows this file's fixtures reach; each is written once.
//   - docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md:212 —
//     §Fix *Multiplicity*: "One diagnostic per occurrence, in source order, no
//     dedup". Its next sentences record this position as the exception and its
//     *Residuals* item (i) (:291) leaves it unfiled; bug 0093 files it, so the
//     contract applies here rather than the exception.
//   - docs/spec_topics/query/query-forms.md:15 (QRY-2) and :27 (QRY-3) — the
//     binding annotation is a type SINK supplying the query's response schema,
//     overridden by an explicit `@<Schema>` ascription. One annotation supplies
//     one schema; nothing makes it a second occurrence of the type in source.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:65 — multi-error
//     reporting: the whole collected list reaches the author in one
//     `pi.sendMessage` per file, with `details.diagnostics` carrying the same
//     structured array. Both entries are therefore author- and tooling-visible,
//     which is why the count is an observable and not an internal detail.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, driven through `parseDoc`
// (tests/helpers/e2e-s1.ts) — the shipped load path wrapped in the standard
// inert `parseDeps` double, the harness the bug doc's own §Reproduction used.
// The observable is a parse-time diagnostic list and a parsed-node field; an
// integration or live tier would add a session round-trip that can assert
// neither the count nor the preserved `QueryExpr.schema` value more sharply.
//
// WHOLE ORDERED LISTS, NEVER `.some` / `.toContain`: the claim is a COUNT, so
// both directions have to be reachable off one assertion. A repair that drops
// the occurrence entirely reds on a missing line, and one that collapses the
// two-written-occurrence control (group (d)) reds on that row.
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

const EMPTY_BODY = "theta/parse/empty-schema-body";
const ARITY = "theta/parse/generic-arity-mismatch";
const VOID_POS = "theta/parse/void-in-non-return-position";
const UNRESOLVED = "theta/parse/unresolved-named-type";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

for (const code of [EMPTY_BODY, ARITY, VOID_POS, UNRESOLVED, LET_RHS]) {
  expect(
    registryMessage(REGISTRY, code) as string | undefined,
    `bug 0093: ${code} has no row in docs/spec_topics/diagnostics/code-registry-parse.md — ` +
      "the code this file counts emissions of is unregistered, so every expectation below " +
      "names a code the tree no longer emits (DIAG-2)",
  ).toBeTypeOf("string");
}

// ===========================================================================
// Fixtures. Every body fixture carries `mode: prompt` frontmatter so no
// `theta/load/missing-mode` noise is present, puts the statement under test on
// line 4, and ends `let a = 1` + `a` so the theta carries a tail expression —
// the shape the bug doc's §Reproduction measured.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` on line 4, followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose body is a multi-line block starting on line 4. */
function blockBody(lines: readonly string[]): string {
  return `${FM}${lines.join("\n")}\n${TAIL}`;
}

// ===========================================================================
// Rendering. The count claim needs the RANGES: the two entries of a doubling
// pair are byte-identical in severity, code and message and differ only in
// range (the statement's, then the query expression's), so a rendering that
// dropped the range could not tell a collapsed pair from a duplicated one.
// ===========================================================================

/**
 * Each diagnostic as `<severity> <code> @ <start>-<end>`, in emission order. A
 * range-less diagnostic (the located-site classification admits file-only and
 * location-less ones) would render no range to compare, so its absence is
 * asserted rather than defaulted — a silent placeholder would let a collapsed
 * pair read as a pass.
 */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => {
    const range = d.range;
    expect(
      range,
      `bug 0093: ${d.code} arrived with no range, so the two entries of a doubling pair — ` +
        "which differ ONLY in range — cannot be distinguished at this position",
    ).toBeDefined();
    const r = range as NonNullable<typeof range>;
    return (
      `${d.severity} ${d.code} @ ${r.start.line}:${r.start.column}` +
      `-${r.end.line}:${r.end.column}`
    );
  });
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src, "bug0093.theta"));
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

/**
 * `QueryExpr.schema` of every query in the parsed body, in traversal order —
 * read after `resolveQuerySchemas` has run, the way the bug doc's QRY-2 table
 * reads it. The field is the single source of truth downstream lowering and
 * typed dispatch consume, so its VALUE is asserted beside the counts: a repair
 * that removed the doubling by starving that field would break lowering
 * silently, and group (g) reds on it instead.
 */
function querySchemas(src: string): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (record.kind === "query") found.push(record.schema);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parseDoc(src, "bug0093.theta").body as unknown);
  return found;
}

// ===========================================================================
// (a) THE SUBJECT — one occurrence of an empty inline object in a `let`
// annotation over a bare-query initialiser draws ONE `empty-schema-body`
// (code-registry-parse.md:91's *Trigger* is satisfied once; 0045:212's
// one-per-occurrence contract, whose exception this bug files).
// RED at HEAD: every row carries a second, expression-ranged copy.
// ===========================================================================

describe("bug 0093 (a) — the propagated annotation is one occurrence", () => {
  it("RED a1: the direct, `?`, `mut` and `Result`-peel spellings each draw ONE line", () => {
    // The `Result` row is the case where the two sites check DIFFERENT text:
    // site 1 walks `Result<{}, QueryError>` and descends into the `{}`, site 2
    // walks the peeled `{}` (`queryResponseAnnotation`,
    // src/parser/theta-document.ts:5821). Text equality between the sites is
    // therefore no usable key, and the surviving line is the statement-ranged
    // one — `walkStatement` pushes before descending into the initialiser
    // (:6985 precedes the initialiser walk).
    expectTable(
      [
        ["direct", body("let r: {} = @`hi`"), [at(EMPTY_BODY, "4:1-4:18")]],
        ["question", body("let r: {} = @`hi`?"), [at(EMPTY_BODY, "4:1-4:19")]],
        ["mut", body("let mut r: {} = @`hi`"), [at(EMPTY_BODY, "4:1-4:22")]],
        [
          "result-peel",
          body("let r: Result<{}, QueryError> = @`hi`"),
          [at(EMPTY_BODY, "4:1-4:38")],
        ],
        ["nested-generic", body("let r: array<{}> = @`hi`"), [at(EMPTY_BODY, "4:1-4:25")]],
      ],
      "a1 — one written `{}` must draw one line. A RED row carrying a second, expression-ranged " +
        "copy is the double emission bug 0093 owns: `parseLet` propagated the annotation onto " +
        "the query and both walk arms checked it. A row carrying NO line means the repair " +
        "withheld the occurrence itself rather than its duplicate",
    );
  });

  it("RED a2: the doubling follows the annotation into `fn` and `if` bodies", () => {
    // The position is the statement's, not the document's top level: a repair
    // keyed on nesting depth would leave these two rows doubled.
    expectTable(
      [
        [
          "in-fn",
          blockBody(["fn f() {", "  let r: {} = @`hi`", "  r", "}"]),
          [at(EMPTY_BODY, "5:3-5:20")],
        ],
        [
          "in-if",
          blockBody(["if true {", "  let r: {} = @`hi`", "  r", "}"]),
          [at(EMPTY_BODY, "5:3-5:20")],
        ],
      ],
      "a2 — the count must not depend on the enclosing block. A RED row is the same double " +
        "emission as a1 measured one nesting level in; the `if` body spans lines because a " +
        "single-line `if` body is `theta/parse/single-line-if`",
    );
  });
});

// ===========================================================================
// (b) RULE INDEPENDENCE — the count is decided by check-site topology, not by
// any one rule, so `generic-arity-mismatch` (code-registry-parse.md:62) and
// `void-in-non-return-position` (:63) double identically. Each proxy carries
// its NON-QUERY control, which emits once at HEAD and must stay byte-identical:
// that contrast is what places the defect at the propagation and not in the
// rule.
// RED at HEAD: the query rows. GREEN and unchanged: the non-query controls.
// ===========================================================================

describe("bug 0093 (b) — every rule the walk owns at `\"value\"` doubles alike", () => {
  it("RED b1: the arity proxy draws ONE line while its non-query control is unchanged", () => {
    // The arity rule is untouched by 0045's fix, so its doubling cannot be that
    // fix's doing. The control's second line is
    // `theta/parse/let-rhs-type-mismatch` — bug 0028 §Fix residual (iii),
    // emitted once, out of scope here (§Non-goals) and present only in the row
    // whose initialiser is a statically resolvable literal the array sink
    // decides instead of deferring on.
    expectTable(
      [
        [
          "query",
          body("let r: array<string, integer> = @`hi`"),
          [at(ARITY, "4:1-4:38")],
        ],
        [
          "query-question",
          body("let r: array<string, integer> = @`hi`?"),
          [at(ARITY, "4:1-4:39")],
        ],
        [
          "non-query-control",
          body("let r: array<string, integer> = 1"),
          [at(ARITY, "4:1-4:34"), at(LET_RHS, "4:1-4:34")],
        ],
      ],
      "b1 — a red on either query row is the double emission reaching a rule bug 0045's fix " +
        "never touched, which is what makes the defect the propagation's. A red on the " +
        "non-query control instead means the repair moved an emission bug 0093 does not own: " +
        "that row must stay byte-identical, its `let-rhs-type-mismatch` line included",
    );
  });

  it("RED b2: the `void` proxy draws ONE line while its non-query control is unchanged", () => {
    expectTable(
      [
        ["query-nested", body("let r: {a: void} = @`hi`"), [at(VOID_POS, "4:1-4:25")]],
        ["query-bare", body("let r: void = @`hi`"), [at(VOID_POS, "4:1-4:20")]],
        ["non-query-control", body("let r: {a: void} = 1"), [at(VOID_POS, "4:1-4:21")]],
      ],
      "b2 — the third rule reachable at position `\"value\"` must settle with the other two: " +
        "one occurrence, one line, with the non-query control unchanged. `result-in-schema-" +
        "position` is the fourth and reaches neither site, since both pass `\"value\"`",
    );
  });
});

// ===========================================================================
// (c) SINGLE-EMISSION CONTROLS — the positions that emit once at HEAD and must
// stay unchanged. They bound the subject: the same annotation over a non-query
// initialiser, over `invoke(…)`, or written at the `@<T>` ascription already
// draws one line, which is the inconsistency the author cannot predict from
// their source.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0093 (c) — the one-line positions stay one-line", () => {
  it("GREEN c1: the three single-emission controls are unchanged", () => {
    expectTable(
      [
        ["non-query", body("let r: {} = 1"), [at(EMPTY_BODY, "4:1-4:14")]],
        ["ascription-only", body("let r = @<{}>`hi`"), [at(EMPTY_BODY, "4:9-4:18")]],
        ["invoke", body('let r: {} = invoke("./x.theta")'), [at(EMPTY_BODY, "4:1-4:32")]],
      ],
      "c1 — a red here means the repair changed a position that was already correct: these " +
        "three supply only one of the two halves the doubling needs (annotation text reaching " +
        "`QueryExpr.schema`, and a sink position running its own type-grammar pass)",
    );
  });
});

// ===========================================================================
// (d) THE TWO-WRITTEN-OCCURRENCE CONTROL — the shape a repair must NOT
// collapse. The author wrote `{}` twice, so two lines are correct
// (0045:212's no-dedup clause), and `parseLet` does not propagate over an
// explicit ascription (src/parser/theta-document.ts:2158 requires
// `init.schema === null`) — which is exactly the discriminator a
// provenance-marker repair keys on.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0093 (d) — two written occurrences keep two lines", () => {
  it("GREEN d1: `let r: {} = @<{}>`hi`` stays TWO lines", () => {
    expectTable(
      [
        [
          "annotation-plus-ascription",
          body("let r: {} = @<{}>`hi`"),
          [at(EMPTY_BODY, "4:1-4:22"), at(EMPTY_BODY, "4:13-4:22")],
        ],
      ],
      "d1 — this row's two lines carry the same code at two different ranges, exactly as the " +
        "defective rows do, and are CORRECT. A red here means the repair deduped on code and " +
        "range shape instead of on provenance, and silenced a second `{}` the author wrote",
    );
  });
});

// ===========================================================================
// (e) NAME RESOLUTION AT THE SECOND SITE — the query arm is the SOLE emitter of
// `unresolved-named-type` for a propagated name (its own resolution step,
// src/parser/theta-document.ts:7512's arm), and the registry row's closed
// position list (code-registry-parse.md:99) does not name the `let` annotation,
// which is why the non-query control is silent. A repair that drops the whole
// arm for propagated text removes an emission bug 0093 does not own.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0093 (e) — the second site keeps its name resolution", () => {
  it("GREEN e1: a propagated unresolvable name keeps its single `unresolved-named-type`", () => {
    expectTable(
      [
        ["propagated-name", body("let r: Ghost = @`hi`"), [at(UNRESOLVED, "4:16-4:21")]],
        ["non-query-control", body("let r: Ghost = 1"), []],
        ["ascription", body("let r = @<Ghost>`hi`"), [at(UNRESOLVED, "4:9-4:21")]],
      ],
      "e1 — the first row's single line comes from the query arm alone; a red on it means the " +
        "repair withheld the arm's name resolution along with its type-grammar pass, dropping " +
        "the only diagnostic this position has for an unresolvable propagated name. A red on " +
        "the second row means the repair widened the closed position list instead",
    );
  });
});

// ===========================================================================
// (f) THE QRY-2 INDIRECT SINKS — §Non-goals. An `fn`-return sink routes through
// the `InferredSchema` adapters, which decline the shapes that would witness
// the doubling (`QueryExpr.schema` stays null and the arm's guard skips the
// walk) or rewrite the text. Bug 0220 moved the `void` row: a root `void`
// return supplies no QRY-2 sink, so cells f1 and f2 are RED-titled to record
// that repair. The group's other rows remain the blast-radius bound — a
// repair wider than `parseLet`'s propagation moves them, and this group reds.
// ===========================================================================

describe("bug 0093 (f) — the indirect sinks are untouched", () => {
  const emptySink = blockBody(["fn f(): {} {", "  @`hi`", "}"]);
  const voidSink = blockBody(["fn f(): void {", "  @`hi`", "}"]);
  const ghostSink = blockBody(["fn f(): Ghost {", "  @`hi`", "}"]);

  it("RED f1: a root `void` fn-return sink now supplies no sink, so its query is untyped (bug 0220)", () => {
    // The `void` row was a FALSE emission rather than a duplicate (§Non-goals):
    // the inference wrote `"void"` into `QueryExpr.schema` and the arm walked it
    // at `"value"`. Bug 0220 owns and repairs that emission — a root `void`
    // return annotation supplies no sink — so the row now asserts an EMPTY list,
    // and the fixture stays here to keep the repair pinned in both directions.
    expectTable(
      [
        ["fn-returns-empty-object", emptySink, [at(EMPTY_BODY, "4:1-6:2")]],
        ["fn-returns-void", voidSink, []],
        ["fn-returns-unresolvable-name", ghostSink, [at(UNRESOLVED, "5:3-5:8")]],
      ],
      "f1 — a red here means the repair reached beyond `parseLet`'s propagation into the " +
        "`resolveQuerySchemas` inference route, which bug 0093 §Non-goals excludes",
    );
  });

  it("RED f2: the root-`void` sink's `QueryExpr.schema` is now null, not `\"void\"` (bug 0220)", () => {
    // The declining sink leaves the field null, so the second site's guard
    // skips it entirely — the reason the doubling is confined to the direct
    // propagation. Only the `Ghost` sink now reaches the arm carrying text;
    // the `void` sink declines and its schema is null.
    expect(
      {
        "fn-returns-empty-object": querySchemas(emptySink),
        "fn-returns-void": querySchemas(voidSink),
        "fn-returns-unresolvable-name": querySchemas(ghostSink),
      },
      "f2 — a red means the repair changed which indirect-sink annotations reach " +
        "`QueryExpr.schema`, moving the boundary that keeps the doubling confined to the " +
        "direct-let propagation",
    ).toEqual({
      "fn-returns-empty-object": [null],
      "fn-returns-void": [null],
      "fn-returns-unresolvable-name": ["Ghost"],
    });
  });
});

// ===========================================================================
// (g) THE PROPAGATED SCHEMA SURVIVES THE REPAIR. `QueryExpr.schema` is what
// downstream lowering and typed dispatch read as the resolved annotation
// (QRY-2's binding-annotation sink). Removing the duplicate diagnostic must not
// be achieved by starving that field: a query whose schema went missing lowers
// as an untyped one and the loss is invisible in the diagnostic list.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0093 (g) — the propagated annotation text is preserved", () => {
  it("GREEN g1: the subject and its `?` form still carry the propagated schema", () => {
    expect(
      {
        direct: querySchemas(body("let r: {} = @`hi`")),
        question: querySchemas(body("let r: {} = @`hi`?")),
      },
      "g1 — a red means the duplicate was removed by withholding the propagation itself: the " +
        "query no longer carries the annotation as its response schema, so QRY-2's binding " +
        "sink stopped supplying one and the typed two-phase respond loop lowers nothing",
    ).toEqual({ direct: ["{}"], question: ["{}"] });
  });
});
