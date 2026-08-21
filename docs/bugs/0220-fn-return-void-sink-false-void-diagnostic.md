# Bug 0220 — A `void`-returning `fn` whose tail expression is a bare `@`-query draws `theta/parse/void-in-non-return-position` at the query's range, where the same body with any non-query tail is silent: QRY-2's `fn`-return sink serialises the return annotation `void` into `QueryExpr.schema`, and `walkExpr`'s `query` arm re-walks that text at position `"value"`, so `fn f(): void { @`hi` }` is refused for a `void` the author wrote only at the one position `grammar.md:89` admits it

- **Status:** open. Recorded as bug
  [0093](./0093-let-annotation-query-position-double-emission.md) §Non-goals
  ("The false `void-in-non-return-position` at a QRY-2 `fn`-return sink") and
  left unfiled by that report's landed §Fix (0.155.0) *Residuals* item (i).
  Re-measured at HEAD `85717fa8` (v0.155.0) for this filing, not copied.
- **Sev/Diff estimate:** S2/D2 — S2 because legal input is refused with an
  error-severity diagnostic that names a source defect the author did not
  write: `fn f(): void { @`hi` }` draws the diagnostic and the theta does not
  load, while `fn f(): void { 1 }` and `fn f(): void { "x" }` are silent
  (§Reproduction (a) v1 versus v2, v13), and the refused `void` sits at the
  return position `grammar.md:89` admits and `code-registry-parse.md:63`'s
  closed position list excludes — a wrong diagnostic on a loadable program, not
  a missing check and not a runtime wrong answer. D2 because the sink text is
  produced by `resolveQuerySchemas` and consumed by one arm, so the change is
  one guard or one adapter arm with no registry edit
  (`code-registry-parse.md:63`'s *Trigger* already excludes the return
  position), but §Fix must also decide what `QueryExpr.schema` holds for such a
  query — the field is a wire input, `"void"` is currently written into it, and
  two committed cells (`tests/let-annotation-query-double-emission.test.ts` f1
  and f2) pin both the diagnostic and that value in both directions.
- **Kind:** defect — implementation, against `grammar.md:89`, `:105`,
  `code-registry-parse.md:63` and `functions.md:36` (FN-4). One written `void`
  at a return position; one error-severity diagnostic reported at a different
  range, for a position the author never wrote in.
- **Affected** (symbol-anchored, verified at HEAD `85717fa8`):
  - `src/parser/query-schema-resolve.ts:165–179` — the `fn` arm of
    `SchemaSinkRewriter`. A declared return type becomes the `fn-return` sink
    frame via `annotationToInferred(stmt.returnType)` (`:171`). No arm excludes
    `void`.
  - `src/parser/type-layer-checks.ts:865–886` — `annotationToCompatType`.
    `PRIMITIVE_NAMES` (`:101–:107`) holds `string`, `number`, `integer`,
    `boolean`, `null` and not `void`, so the text `"void"` falls to the nominal
    arm (`:886`) and becomes `{ kind: "named", name: "void" }`.
  - `src/parser/query-schema-resolve.ts:509–557` — the adapters. Their doc
    comment (`:509–:517`) names the object / union limit and no other.
    `annotationToInferred` declines only brace-rooted text (`:523`);
    `compatToInferred`'s `named` arm admits any plain identifier
    (`:544–:546`), and `"void"` is one, so the sink carries
    `{ kind: "named", name: "void" }`.
  - `src/parser/query-schema-inference.ts:151–194` — `inferQuerySchema`. The
    `fn-return` case (`:182–:188`) returns the frame's `returnType` for a query
    in tail position.
  - `src/parser/query-schema-resolve.ts:450–461` — `resolveQuery` writes the
    inferred schema back with `serializeInferred` (`:560–:568`), which renders
    the `named` shape as its name: `QueryExpr.schema === "void"`
    (§Reproduction (b)).
  - `src/parser/theta-document.ts:7464–7519` — `walkExpr`'s `query` arm, the
    emitting site. The guard at `:7482` admits any non-empty schema; bug 0093's
    route-2 withhold (`:7512`) keys on `e.schemaFromLetAnnotation === true`,
    which the inference route never sets, so
    `parseTypeExpression(responseAnnotation, "value", { file, range: e.range })`
    (`:7514–:7517`) runs over the propagated `"void"`.
  - `src/parser/theta-document.ts:250–256` — `QueryExpr.schemaFromLetAnnotation`
    and its doc comment, which scopes the marker to `parseLet` and names this
    defect as the reason the inference route must stay unmarked.
  - `src/parser/type-grammar.ts:734–:749` — the emitting rule. `void` is
    admitted only when `position === "return" && isRoot` (`:738`); the query
    arm passes `"value"`, so the walk pushes
    `theta/parse/void-in-non-return-position` at the query's range.
  - `src/parser/theta-document.ts:7082–:7088` — the `fn` return slot's own walk,
    `parseTypeExpression(s.returnType, "return", …)`. This is the site that
    owns the written occurrence, and it admits root `void` (v2 is silent).
  - `tests/let-annotation-query-double-emission.test.ts:385–:433` — group (f),
    bug 0093's blast-radius bound. Cell `GREEN f1` (`:398`) asserts the row
    `["fn-returns-void", voidSink, [at(VOID_POS, "5:3-5:8")]]` (`:406`) and its
    comment (`:399–:403`) records the emission as false and unfiled; cell
    `GREEN f2` (`:414`) asserts `"fn-returns-void": ["void"]` (`:429`).
- **Observed at:** v0.155.0 (`85717fa8`). Offline, deterministic,
  provider-free: one scratch vitest probe driving `parseThetaDocument` through
  `parseDoc` (`tests/helpers/e2e-s1.ts`, the shipped parse path with the inert
  `parseDeps` double), printing `doc.diagnostics` and every `QueryExpr`'s
  `schema` / `schemaFromLetAnnotation` / `ascriptionWritten`; deleted after the
  rows below were recorded.
- **Scope:** parse-time diagnostics and the resolved `QueryExpr.schema` of one
  document. The diagnostic is error severity, so the affected theta does not
  load; no runtime or wire behaviour is measured here, because nothing that
  carries the defect reaches the runtime.

## Summary

QRY-2's `fn`-return sink (`query-forms.md:32`) supplies a bare query's response
schema from the enclosing function's declared return type. When that return type
is `void`, `annotationToInferred` accepts it — `void` is not in
`PRIMITIVE_NAMES`, so it converts to a nominal `named` reference and passes
`compatToInferred`'s identifier test — and `resolveQuery` writes the text
`"void"` into `QueryExpr.schema`.

`walkExpr`'s `query` arm then walks that text at position `"value"`, where
`type-grammar.ts:738` admits `void` at no depth. The document carries an
error-severity `theta/parse/void-in-non-return-position` at the query's range:

```
fn f(): void {
  @`hi`
}
  -> error theta/parse/void-in-non-return-position: 'void' is only permitted as a function or theta return type @ 5:3-5:8
```

The author wrote `void` once, in the return position `grammar.md:89` admits and
`code-registry-parse.md:63`'s closed position list excludes. The `fn` return
slot's own walk (`theta-document.ts:7085`) passes `"return"` and reports
nothing. The same body with a non-query tail — `1`, `"x"`, `invoke("./x.theta")`
— is silent, and so is the same query bound to a `let` inside the body rather
than sitting in tail position. One diagnostic, no occurrence.

Bug [0093](./0093-let-annotation-query-position-double-emission.md) reached the
same arm from `parseLet`'s direct propagation and fixed that route at 0.155.0
with a provenance marker (`schemaFromLetAnnotation`) that its §Fix deliberately
confined to `parseLet`; this route sets no marker and is unmoved.

## Reproduction

Offline, deterministic, provider-free, at `85717fa8` (v0.155.0). Every fixture
is a whole `.theta` source driven through `parseDoc`. The frontmatter is
`---\nmode: prompt\n---`, so the `fn` declaration starts on line 4 and its body
on line 5; each body ends `let a = 1` + `a` so the theta carries a tail
expression. `diags` is `doc.diagnostics` rendered
`<severity> <code>: <message> @ <start>-<end>` in emission order. `VOID` is
`theta/parse/void-in-non-return-position` with the message
`'void' is only permitted as a function or theta return type`, byte-identical to
`code-registry-parse.md:63` in every row.

### (a) The subject and its controls

| # | Fixture (body) | `diags` |
| --- | --- | --- |
| v1 | ``fn f(): void { ↵ @`hi` ↵ }`` | `VOID @ 5:3-5:8` |
| v2 | `fn f(): void { ↵ 1 ↵ }` | `[]` |
| v13 | `fn f(): void { ↵ "x" ↵ }` | `[]` |
| v15 | `fn f(): void { ↵ invoke("./x.theta") ↵ }` | `[]` |
| v7 | ``fn f(): void { ↵ let q = @`hi` ↵ q ↵ }`` | `[]` |
| v14 | ``fn f(): void { ↵ @`hi` ↵ } `` + `let a = f()` | `VOID @ 5:3-5:8` |
| v4 | ``fn f(): string { ↵ @`hi` ↵ }`` | `[]` |
| v11 | ``fn f(): void { ↵ match 1 { ↵ _ => @`hi` ↵ } ↵ }`` | `[]` |

`↵` is a newline; the body is indented two spaces. v1's range `5:3-5:8` is the
query expression, not the `fn` statement. v2, v13 and v15 fix the discriminator:
the tail being a bare query, not the `void` annotation, decides whether the
document is refused. v7 is the sink-position control — a `let`-bound query is
not in tail position, no sink applies, and the same `void` return type draws
nothing. v11 is the opaque-position control (`query-forms.md:39`, a `match`
scrutinee stops the walk).

Verbatim, from the probe:

```
=== v1 fn-return void, query body
--- diags: [
 "error theta/parse/void-in-non-return-position: 'void' is only permitted as a function or theta return type @ 5:3-5:8"
]
--- queries: [{"schema":"void","marker":null,"asc":false}]
=== v2 fn-return void, non-query body (control)
--- diags: []
--- queries: []
```

The emission scales with the number of queries in sink position:

| # | Fixture (body) | `diags` |
| --- | --- | --- |
| v10 | ``fn f(): void { ↵ if true { ↵ @`hi` ↵ } else { ↵ @`ho` ↵ } ↵ }`` | `VOID @ 6:5-6:10`, `VOID @ 8:5-8:10` |

### (b) The sink text reaching the arm

`schema` is `QueryExpr.schema` read off the parsed body after
`resolveQuerySchemas`; `marker` is `schemaFromLetAnnotation`; `asc` is
`ascriptionWritten`.

| # | Fixture | `schema` | `marker` | `asc` |
| --- | --- | --- | --- | --- |
| v1 | ``fn f(): void { @`hi` }`` | `"void"` | `null` | `false` |
| v7 | ``fn f(): void { let q = @`hi` … }`` | `null` | `null` | `false` |
| v4 | ``fn f(): string { @`hi` }`` | `"string"` | `null` | `false` |
| v6 | ``let r: void = @`hi` `` | `"void"` | `true` | `false` |
| v9 | ``fn f(): void { @<void>`hi` }`` | `"void"` | `null` | `true` |
| v16 | ``fn f(): Ghost { @`hi` }`` | `"Ghost"` | `null` | `false` |

v6 is bug 0093's landed route: the marker is set, the arm withholds its
type-grammar call, and the single surviving `VOID @ 4:1-4:20` is the `let`
statement's own line — the author did write `void` at a `let` annotation, which
`code-registry-parse.md:63` names. v9 is the author-written ascription: `asc` is
`true`, no marker, and its `VOID @ 5:3-5:14` (the whole query including
`@<void>`) is correct — a type ascription is on the registry row's position
list. v16's `diags` is one
`error theta/parse/unresolved-named-type: unresolved named type 'Ghost' @ 5:3-5:8`,
emitted by the name-resolution loop of the same arm; `fn f(): Ghost { 1 }`
draws none.

### (c) Adjacent rows this report does not own

These carry a second line from the same re-walk, but the written `void` is
illegal at its own site too, so the extra line duplicates a true verdict rather
than inventing one. Recorded as measured, for the blast radius of any fix:

| # | Fixture | `diags` | `schema` |
| --- | --- | --- | --- |
| v12 | ``fn f(): array<void> { ↵ @`hi` ↵ }`` | `VOID @ 4:1-6:2`, `VOID @ 5:3-5:8` | `"array<void>"` |
| v17 | `fn g(p: void) { 1 }` + ``fn f(): string { g(@`hi`) }`` | `VOID @ 4:1-6:2`, `VOID @ 8:5-8:10` | `"void"` |
| v21 | ``fn f(): Result<void, QueryError> { ↵ @`hi`? ↵ }`` | `VOID @ 4:1-6:2` | `null` |
| v18 | `schema S { f: void }` + ``S { f: @`hi` }`` | `VOID @ 4:1-6:2` | `null` |
| v18b | `schema S { f: void }` + `S { f: 1 }` | `VOID @ 4:1-6:2` | (no query) |

v12 and v17 double: the nested `void` in `array<void>` and the `void` parameter
type are both refused at their own sites (a generic argument and an `fn`
parameter type, both on the registry row's list), and the query arm reports them
again at the query's range. v21 and v18 do not reach the arm — the `Result<…>`
and object shapes leave `QueryExpr.schema` null — and v18b shows the schema
field's line is the declaration's own, present with no query at all.

### Probe source

```ts
import { describe, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import type { ThetaDocument } from "../src/parser/theta-document";

function render(doc: ThetaDocument): string[] {
  return doc.diagnostics.map(
    (d) =>
      `${d.severity} ${d.code}: ${d.message} @ ${d.range.start.line}:${d.range.start.column}-${d.range.end.line}:${d.range.end.column}`,
  );
}

function querySchemas(doc: ThetaDocument): unknown[] {
  const out: unknown[] = [];
  const walk = (n: unknown): void => {
    if (n === null || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o["kind"] === "query") {
      out.push({
        schema: o["schema"] ?? null,
        marker: o["schemaFromLetAnnotation"] ?? null,
        asc: o["ascriptionWritten"] ?? null,
      });
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
    }
  };
  walk(doc.body);
  return out;
}

const FM = "---\nmode: prompt\n---\n";

const cases: Array<[string, string]> = [
  ["v1 fn-return void, query body", "fn f(): void {\n  @`hi`\n}\nlet a = 1\na"],
  ["v2 fn-return void, non-query body (control)", "fn f(): void {\n  1\n}\nlet a = 1\na"],
  // … v4, v6, v7, v9, v10, v11, v12, v13, v14, v15, v17, v18, v18b, v21
];

describe("scratch 0220", () => {
  it("prints", () => {
    for (const [label, body] of cases) {
      const doc = parseDoc(FM + body + "\n");
      console.log("=== " + label);
      console.log("--- diags: " + JSON.stringify(render(doc), null, 1));
      console.log("--- queries: " + JSON.stringify(querySchemas(doc)));
    }
  });
});
```

## Expected behaviour

- `docs/spec_topics/grammar.md:89` — `ReturnType ::= Type | "void"`, with the
  inline comment "function-/theta-return position only; `void` is admitted here
  and nowhere else". `fn f(): void` writes `void` at exactly that position.
- `docs/spec_topics/grammar.md:105` and
  `docs/spec_topics/diagnostics/code-registry-parse.md:63` — the row's *Trigger*
  is a closed position list: "a `let` annotation, schema or `params:` field,
  generic argument (`array<void>`, `Result<void, E>`), `invoke<void>`
  annotation, type ascription, or union arm". A query's inferred response schema
  is not on it, and no source position in v1 is on it.
- `docs/spec_topics/functions.md:36` (FN-4) — "An explicit `void` return type
  still discards any tail expression value silently and is the only way to
  signal that the function or theta intentionally produces no value." A tail
  expression under a `void` return is discarded, not typed against `void`.
- [QRY-2](../spec_topics/query/query-forms.md#qry-2) and the sink list
  (`query-forms.md:32`) — the sink is "a position whose declared type can supply
  the schema". `void` supplies no value type; `query-forms.md:35` states the
  fallback for a query with no usable sink: "the query is untyped (returns
  `string`)".

Expected concretely: ``fn f(): void { @`hi` }`` produces no diagnostic, matching
its non-query controls `fn f(): void { 1 }` and `fn f(): void { "x" }`; the
`void` return type serves as no sink, so the query is untyped exactly as in v7
and v11; ``fn f(): void { @<void>`hi` }`` keeps its diagnostic, since an
ascription is on the registry row's list; ``let r: void = @`hi` `` keeps its
single statement-ranged line from bug 0093's landed route; and
``fn f(): Ghost { @`hi` } ``'s `theta/parse/unresolved-named-type`, whose sole
emitter is this same arm, still fires.

## Actual behaviour / root cause

**`void` survives the sink adapters as a nominal type.**
`SchemaSinkRewriter`'s `fn` arm builds the sink frame from
`annotationToInferred(stmt.returnType)` (`query-schema-resolve.ts:171`). That
adapter declines only brace-rooted text (`:523`) and otherwise defers to
`annotationToCompatType`, whose `PRIMITIVE_NAMES` set
(`type-layer-checks.ts:101–:107`) does not contain `void`, so the text falls to
the nominal arm (`:886`) as `{ kind: "named", name: "void" }`.
`compatToInferred`'s `named` arm admits it because `void` matches the plain
identifier test (`query-schema-resolve.ts:544`). No layer between the return
annotation and the sink frame knows `void` is a return-only keyword.

**The sink writes the keyword into the query's schema slot.**
`inferQuerySchema`'s `fn-return` case (`query-schema-inference.ts:182–:188`)
returns that frame's type for a query in tail position, and `resolveQuery`
(`query-schema-resolve.ts:450–:461`) writes it back through
`serializeInferred` (`:560–:568`), which renders a `named` shape as its name.
`QueryExpr.schema` is therefore the string `"void"` (§Reproduction (b)).

**The structural walk re-checks that text at a position that refuses it.**
`walkExpr`'s `query` arm guards on the schema being non-empty
(`theta-document.ts:7482`) and calls
`parseTypeExpression(responseAnnotation, "value", { file, range: e.range })`
(`:7514–:7517`). `type-grammar.ts`'s `void` case admits the keyword only when
`position === "return" && isRoot` (`:738`), so the `"value"` call pushes the
diagnostic at the query's range.

**Bug 0093's landed withhold does not reach this route by construction.** The
arm's withhold keys on `e.schemaFromLetAnnotation === true` (`:7512`), a marker
`parseLet` sets at its two direct-propagation sites only; the `QueryExpr` field
doc comment (`:250–:256`) states that scoping and names this defect as the
reason for it. Text arriving from `resolveQuerySchemas` carries no marker, so
the call runs.

**The written occurrence's own site reports nothing, correctly.** The `fn`
return slot walks `s.returnType` at `"return"` (`:7082–:7088`), where root
`void` is admitted — which is why v2 is silent and why the only line in v1 is
the one describing a position the author did not write in.

## Why it matters

1. A program the grammar admits is refused. The diagnostic is error severity, so
   `fn f(): void { @`hi` }` does not load, while the same function with a
   non-query tail loads (§Reproduction (a) v1 versus v2, v13, v15). The author's
   only route to a discarded query tail under a `void` return is to add an
   ascription or bind the query to a `let` (v7).
2. The message names a position that does not exist in the source. "`void` is
   only permitted as a function or theta return type" is printed for a `void`
   written as a function return type. An author reading it looks for a second
   `void` in a `let` annotation, generic argument or ascription — the positions
   `code-registry-parse.md:63` lists — and finds none.
3. The range points at the query, not the annotation. Tooling reading
   `details.diagnostics` (`diagnostic-shape.md:65`) locates the defect at
   `5:3-5:8`, five columns of `@`hi``, where no type text appears at all.
4. `QueryExpr.schema` holds `"void"` for the affected query — the field
   downstream lowering and typed dispatch read as the resolved response schema
   (bug 0093 §Fix group (g)). The value is unreachable at HEAD only because the
   diagnostic stops the load; any repair that removes the diagnostic without
   deciding the field ships `void` as a response-schema name.
5. The tree's regression net holds the defect as expected output.
   `tests/let-annotation-query-double-emission.test.ts` f1 (`:398`) asserts the
   emission and f2 (`:414`) asserts `"void"` in the schema slot, both with
   whole-list equality, so a fix reds them and a silent regression the other way
   is caught.

## Fix

Constraint-pinned. Two sites can carry the repair — the sink adapters, which
decide whether a `void` return type produces a sink at all, and the query arm,
which decides whether propagated text is re-walked. The route is not settled
here, because the two move different observables: excluding `void` at the
adapter also changes `QueryExpr.schema` (`"void"` → `null`, the untyped
`string` path of `query-forms.md:35`), while withholding at the arm leaves
`"void"` in the field.

**Constraints any route satisfies.**

- The written occurrence's own sites keep their verdicts. The `fn` return slot
  admits root `void` (`theta-document.ts:7082–:7088`, v2 silent) and must stay
  silent; the nested and parameter positions keep the line they own today —
  `fn f(): array<void>` at `4:1-6:2` and `fn g(p: void)` at `4:1-6:2`
  (§Reproduction (c) v12, v17), and `schema S { f: void }` at `4:1-6:2` with or
  without a query in the constructor (v18, v18b).
- Bug 0093's landed route-2 shape keeps working unchanged. The marker
  `QueryExpr.schemaFromLetAnnotation`, set by `parseLet` at both propagation
  sites and read at `theta-document.ts:7512`, stays the discriminator for the
  direct-let route: ``let r: void = @`hi` `` keeps exactly one
  `VOID @ 4:1-4:20`, the statement-ranged line (§Reproduction (b) v6), and
  `tests/let-annotation-query-double-emission.test.ts` groups (a)–(e) stay
  byte-identical. A route that generalises the withhold to "any schema the
  author did not write" must leave the marker's own behaviour and its
  documented scoping (`theta-document.ts:250–:256`) intact, and must be keyed so
  that the direct-let case still yields the statement-ranged line rather than
  the query-ranged one.
- The author-written ascription keeps its diagnostic.
  ``fn f(): void { @<void>`hi` } `` has `ascriptionWritten === true` and draws
  `VOID @ 5:3-5:14` (§Reproduction (b) v9); a type ascription is on
  `code-registry-parse.md:63`'s position list. A route keyed on
  "not author-written" uses `ascriptionWritten`, which is `false` for both the
  inference and direct-let routes and `true` here.
- The arm's other work keeps running for propagated text. The query arm is the
  sole emitter of `theta/parse/unresolved-named-type` for a propagated
  annotation — ``fn f(): Ghost { @`hi` } `` draws exactly one at `5:3-5:8`
  (§Reproduction (b) v16) and `fn f(): Ghost { 1 }` draws none. A
  route at the arm withholds the `parseTypeExpression` call only, as bug 0093's
  fix does.
- The `TypePosition` at the arm stays `"value"`. Re-homing it to
  `"schema-feeding"` would newly fire `theta/parse/result-in-schema-position`,
  which the arm's own comment forbids on bug 0044's blast-radius grounds
  (`theta-document.ts:7485–:7492`).
- No registry edit. `code-registry-parse.md:63`'s *Trigger* already excludes the
  return position; the repair removes a report the implementation makes for a
  position the row does not name. GOV-15's diagnostic-registry carve-out is not
  engaged. One input moves from not-loading to loading —
  ``fn f(): void { @`hi` } `` — which is the subject.
- `QueryExpr.schema` for the affected query is decided explicitly, not left as
  a side effect. `"void"` at HEAD is a response-schema name no schema
  declaration can carry; `query-forms.md:35` names the alternative for a query
  with no usable sink ("untyped… returns `string`"). Whichever value the route
  produces, the fix states it and `tests/…-double-emission.test.ts` f2 records
  it.
- The multi-query and nested placements are covered. Both branches of an
  `if`/`else` tail under a `void` return emit today (§Reproduction (a) v10), so
  the fix is a property of the sink or the arm, not of a single tail node.

**Pins that move with the fix.**
`tests/let-annotation-query-double-emission.test.ts` group (f): cell
`GREEN f1` (`:398`) loses its `["fn-returns-void", voidSink, [at(VOID_POS,
"5:3-5:8")]]` row (`:406`) in favour of an empty list, its two other rows
(`fn-returns-empty-object`, `fn-returns-unresolvable-name`) stay byte-identical,
and the comment at `:399–:403` — which records this emission as false and
unfiled — is rewritten to record the repair. Cell `GREEN f2` (`:414`) changes
its `"fn-returns-void": ["void"]` entry (`:429`) to whatever value the route
settles, with the other two entries unchanged. Bug 0093 §Fix (0.155.0)
*Residuals* item (i) is a landed record and is not edited; a coordination note
appended to that report points here.

**Test witness — unit, offline, provider-free.** One `parseDoc` call per
fixture, whole-list equality on `doc.diagnostics` plus whole-list equality on
the parsed body's `QueryExpr.schema` values: the subject (v1) at zero
diagnostics; its four non-query controls (v2, v13, v15, v18b) and its
non-tail / opaque-position controls (v7, v11) unchanged; the multi-branch row
(v10) at zero; the `string`-return row (v4) unchanged with `schema === "string"`;
the author-written ascription (v9) keeping its one line; the direct-let row (v6)
keeping its one statement-ranged line and its marker; the adjacent rows (v12,
v17, v21, v18) with their own-site lines recorded exactly; and the propagated
`Ghost` row keeping its single `unresolved-named-type`. Asserting whole ordered
lists in both channels is what makes both directions reachable: a route that
silences the arm wholesale reds on the `Ghost` row, and one that starves the
schema slot reds on the `string`-return row.

## Non-goals

- **The duplicate lines at a nested or parameter `void`.**
  ``fn f(): array<void> { @`hi` } `` and `fn g(p: void)` called with a bare
  query each report the same written `void` twice (§Reproduction (c) v12, v17).
  The written occurrence there is genuinely illegal and its own site reports it;
  the second line is bug 0093's duplication mechanism at the inference route,
  not a false emission. Measured and recorded here as blast radius; not claimed.
- **Whether a `void` return type should be a QRY-2 sink at all.**
  `query-forms.md:32` lists "the declared return type of the enclosing
  function" without qualifying it, and FN-4 (`functions.md:36`) says the tail
  value is discarded. Which of the two readings governs is a §Fix constraint
  above (the `QueryExpr.schema` clause), not a spec change proposed here.
- **The `InferredSchema` model's coverage limits.** Object, union and
  `Result<…>` return types leave `QueryExpr.schema` null (§Reproduction (c) v21,
  v18) — the documented advanced-position limit recorded at
  `query-schema-resolve.ts:509–:517`. Unchanged.
- **`let-rhs-type-mismatch` at an object or union annotation.** Owned by
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) (open,
  constraint-pinned). That report's subject is the `⊑` check declining to fire
  at a `let` annotation; this one touches neither that check nor its
  `annotationToCompatType` conversion beyond citing where `void` lands in it.
  No claim is made on 0130's surface, and no ordering dependency exists in
  either direction.

## Provenance

- Origin: [0093](./0093-let-annotation-query-position-double-emission.md)
  §Non-goals, second item ("The false `void-in-non-return-position` at a QRY-2
  `fn`-return sink"), and that report's §Fix (0.155.0) *Residuals* item (i),
  which records it as unchanged and still unfiled after the direct-let route was
  repaired. The honest record it points at is
  `tests/let-annotation-query-double-emission.test.ts` group (f) cells f1
  (`:398`) and f2 (`:414`).
- Spec: `docs/spec_topics/grammar.md:89` (`ReturnType`), `:105` (the closed
  `void` position list); `docs/spec_topics/functions.md:36` (FN-4, discarded
  tail under `void`); `docs/spec_topics/query/query-forms.md:15` (QRY-2), `:27`
  (QRY-3), `:32` (the sink list), `:35` (untyped fallback), `:39` (opaque
  positions); `docs/spec_topics/diagnostics/code-registry-parse.md:63` (the
  emitted row); `docs/spec_topics/lexical.md:20` (`void` reserved).
- Implementation: `src/parser/theta-document.ts:250–256`, `:7082–:7088`,
  `:7464–:7519`; `src/parser/query-schema-resolve.ts:165–179`, `:450–461`,
  `:509–:568`; `src/parser/query-schema-inference.ts:151–194`;
  `src/parser/type-grammar.ts:95`, `:137`, `:734–:749`;
  `src/parser/type-layer-checks.ts:101–:107`, `:865–886`.
- Observations: one throwaway offline vitest probe at `85717fa8` over `parseDoc`
  (`tests/helpers/e2e-s1.ts`), run in three passes and deleted after the rows
  were recorded (the 0033 / 0087 / 0092 precedent). Rows recorded: 8 in the
  first pass (diagnostic lists plus `QueryExpr.schema` for the `void` sink, its
  `?` form, the direct-let subject and their controls), 9 in the second (the
  author-written ascription, the `if`/`else` and `match` placements,
  `array<void>`, the `void` parameter, the `Ghost` sink, and three non-query
  controls), 6 in the third (the schema-field sink, its non-query control,
  `Result<void, QueryError>`, and the untyped call-arg control).
- Existing reports read for separation: 0093, 0130, 0044, 0014.
