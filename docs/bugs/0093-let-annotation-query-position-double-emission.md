# Bug 0093 — A `let` annotation over a bare-query initialiser is type-checked at two sites: `parseLet` copies the annotation text into `QueryExpr.schema`, and both the `let` arm (`theta-document.ts:5911`) and the query arm (`:6372`) run `parseTypeExpression` over it, so ``let r: {} = @`hi` `` emits `theta/parse/empty-schema-body` twice for one written `{}` — rule-independently, for every check the walk owns at that position

- **Status:** open. §Fix is constraint-pinned: three candidate routes with the
  constraints each has to satisfy, no route selected.
- **Kind:** defect — spurious duplicate diagnostics. One occurrence in source,
  two entries in the document's diagnostic list. The duplication is a property
  of the check-site topology, not of any one rule: every check the type-grammar
  walk owns at position `"value"` doubles at this position, and a check added
  to that walk later doubles with them. It predates
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)'s fix
  (0.57.0), which added the fourth member to the set that doubles here: the
  arity proxy below doubles identically, and that fix touches no part of the
  arity check.
- **Related:**
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)
    (fixed 0.57.0) — origin. Its §Fix (0.57.0) *Multiplicity* clause
    (`:212–220`) settles "one diagnostic per occurrence, in source order, no
    dedup" for `theta/parse/empty-schema-body` and records this position as the
    exception, recorded rather than repaired; *Residuals* item (i) (`:284–286`)
    leaves it unfiled. This report files it. The honest record is
    `tests/inline-empty-object-type.test.ts` cell g3 (`:839–901`), which
    asserts the two-line list and its arity-proxy control; that cell inverts
    with any fix here.
  - [0014](./0014-empty-typed-query-annotation-silent-unvalidated-bind.md)
    (fixed) — the in-tree precedent for a targeted carve-out at the second
    site. The query arm already withholds one emission for one input: an empty
    annotation (`e.schema === ""`) is skipped because that code owns the
    interior "and a second diagnostic here would double up"
    (`src/parser/theta-document.ts:6353–6356`).
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
    (fixed 0.38.0) — its §Fix residual (iii) (`:338–349`) owns the
    self-identical `theta/parse/let-rhs-type-mismatch` that sits between the
    two arity lines in §Reproduction's proxy (`expected array<string,integer>,
    got array<string,integer>`). Different mechanism (static-type inference
    over the propagated text), same fixture; unchanged here.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)
    (fixed 0.54.0) — bounds one repair route. The query arm passes `"value"`
    and its comment (`src/parser/theta-document.ts:6363–6370`) records that
    `"schema-feeding"` here would widen `theta/parse/result-in-schema-position`'s
    trigger, which that report's §Fix blast-radius clause forbids. A fix that
    re-homes the second walk must not change its `TypePosition`.
- **Affected** (citations verified at HEAD `9ea93511`, 0.57.0):
  - `src/parser/theta-document.ts:1964–1980` — `parseLet`'s propagation, the
    construction of the compound position. The guard (`:1970`) requires an
    initialiser and a non-empty annotation; the direct arm copies the
    annotation text onto the query (`:1971–1973`) and the `?` arm copies it
    onto the `try`'s inner query operand (`:1974–1979`). The copy is verbatim
    text and records nothing that distinguishes it from an author-written
    `@<T>` ascription.
  - `src/parser/theta-document.ts:5909–5913` — check site 1, `walkStatement`'s
    `let` arm. `parseTypeExpression(s.annotation, "value", { file, range:
    s.range })` at `:5911`; the range is the whole `let` statement. The
    initialiser walk follows at `:5914–5916`, so this site's diagnostics push
    first.
  - `src/parser/theta-document.ts:6342–6388` — check site 2, `walkExpr`'s
    `query` arm. Guard at `:6360`, the `Result` peel at `:6361`
    (`queryResponseAnnotation`, defined `:5018`, doc comment `:4985–5017`),
    `parseTypeExpression(responseAnnotation, "value", { file, range: e.range })`
    at `:6371–6373`, and name resolution at `:6374–6385`. The arm's own comment
    (`:6348–6359`) states that `parseLet`'s direct propagation and
    `resolveQuerySchemas`' inference both write into `QueryExpr.schema` before
    this walk runs, "so every route to a schema-bearing query converges on this
    one check" — including the route that has already been checked at site 1.
  - `src/parser/type-grammar.ts:97`, `:108–123`, `:412–492` — the shared walk.
    Both sites take the default rule set `"all"` (`:112`) and position
    `"value"`. Three of the four checks fire at that position:
    `void-in-non-return-position` (`:421–437`), `generic-arity-mismatch`
    (`:441–449`) and `empty-schema-body` (`:467–477`, constructed at `:474`).
    `result-in-schema-position` (`:450–460`) requires
    `position === "schema-feeding"` and fires at neither site.
  - `src/parser/query-schema-resolve.ts:518–527` and `:530–557` — why the
    doubling is confined to the direct-let propagation. `annotationToInferred`
    returns `undefined` for a brace-rooted annotation (`:523–525`) and
    `compatToInferred` returns `undefined` for any shape the `InferredSchema`
    model cannot carry (`:544–555`), so the QRY-2 indirect sinks either leave
    `QueryExpr.schema` null or rewrite the text; §Reproduction measures both.
  - `tests/inline-empty-object-type.test.ts:810–902` — group (g), the
    multiplicity lock. g3 (`:839–901`) carries the six-row table this report
    re-derives and states the doubling "belongs to the annotation-propagation
    mechanism" (`:898–899`).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:86`, `:58`, `:59`,
    `:90` — the rows the two sites emit from: `empty-schema-body` (whose
    *Trigger* was widened to "An empty inline object type (`{}`) in any `Type`
    position, at any nesting depth" by 0045), `generic-arity-mismatch`,
    `void-in-non-return-position`, and `unresolved-named-type`, whose closed
    position list names the `@<T>` query annotation and not the `let`
    annotation.
- **Observed at:** 0.57.0 (`9ea93511`). Offline, deterministic, provider-free:
  seven scratch vitest probes driving `parseThetaDocument` through `parseDoc`
  (`tests/helpers/e2e-s1.ts`, the shipped load path with the standard inert
  `parseDeps` double), reading `doc.diagnostics` and the parsed body's
  `QueryExpr.schema`; deleted after the rows below were recorded.
- **Scope:** parse-time diagnostics of one document. No lowering, no runtime
  and no wire surface changes with the count — both entries are error severity,
  so the theta does not load either way.

## Summary

`parseLet` copies a `let` annotation onto a bare-query initialiser so the
runtime lowers it as the query's response schema (QRY-2's binding-annotation
sink). The copy is verbatim and unmarked. The whole-document walk then reaches
that one text twice: `walkStatement`'s `let` arm walks `s.annotation`, and
`walkExpr`'s `query` arm walks `e.schema`. Both call `parseTypeExpression` with
position `"value"` and the default rule set.

The author writes one type; the diagnostic list carries two lines:

```
let r: {} = @`hi`
  -> error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @ 4:1-4:18
     error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @ 4:13-4:18
```

The two entries differ only in range: the first locates the whole `let`
statement, the second the query expression.

The count is rule-independent. The arity proxy is the control that places it
outside `empty-schema-body`: ``let r: array<string, integer> = @`hi` `` draws
`generic-arity-mismatch` twice, with the arity check untouched by 0045's fix,
while the non-query control `let r: array<string, integer> = 1` draws it once.
`void-in-non-return-position` doubles the same way. Three single-emission
controls bound the position: `let r: {} = 1`, ``let r = @<{}>`hi` `` and
`let r: {} = invoke("./x.theta")` each draw one line.

The doubling requires both halves — the annotation text reaching
`QueryExpr.schema` unchanged, and the sink position running its own
type-grammar pass. Only `parseLet`'s direct propagation supplies both at HEAD.
The QRY-2 indirect sinks (`fn` return, call argument, constructor field) route
through the `InferredSchema` adapters, which decline the shapes that would
witness it, and emit once.

## Reproduction

Offline, deterministic, provider-free, at `9ea93511`. Every fixture is a whole
`.theta` source driven through `parseDoc`. The frontmatter is
`---\nmode: prompt\n---`, the statement under test is on line 4, and the body
ends `let a = 1` + `a` so the theta carries a tail expression. `diags` is
`doc.diagnostics` rendered `<severity> <code>: <message> @ <start>-<end>` in
emission order; the tables abbreviate the message, which is byte-identical to
the registry row in every row.

### The subject

| Fixture | `diags` |
| --- | --- |
| ``let r: {} = @`hi` `` | `empty-schema-body @ 4:1-4:18`, `empty-schema-body @ 4:13-4:18` |
| ``let r: {} = @`hi`? `` | `empty-schema-body @ 4:1-4:19`, `empty-schema-body @ 4:13-4:18` |
| ``let mut r: {} = @`hi` `` | `empty-schema-body @ 4:1-4:22`, `empty-schema-body @ 4:17-4:22` |
| ``let r: Result<{}, QueryError> = @`hi` `` | `empty-schema-body @ 4:1-4:38`, `empty-schema-body @ 4:33-4:38` |
| ``let r: array<{}> = @`hi` `` | `empty-schema-body @ 4:1-4:25`, `let-rhs-type-mismatch @ 4:1-4:25`, `empty-schema-body @ 4:20-4:25` |
| ``fn f() { ↵ let r: {} = @`hi` ↵ r ↵ } `` | `empty-schema-body @ 5:3-5:20`, `empty-schema-body @ 5:15-5:20` |
| ``if true { ↵ let r: {} = @`hi` ↵ r ↵ } `` | `empty-schema-body @ 5:3-5:20`, `empty-schema-body @ 5:15-5:20` |

In the last two rows `↵` is a newline and the `let` is on line 5, indented two
spaces. The `if` body spans lines because a single-line `if` body is
`theta/parse/single-line-if` (`src/lexer/lexer.ts:900`).

The `Result` row is the case where the two sites check different text: site 1
walks `Result<{}, QueryError>` and descends into the `{}`; site 2 walks the
peeled `{}` (`queryResponseAnnotation`). One occurrence, two lines.

### Single-emission controls

| Fixture | `diags` |
| --- | --- |
| `let r: {} = 1` | `empty-schema-body @ 4:1-4:14` |
| ``let r = @<{}>`hi` `` | `empty-schema-body @ 4:9-4:18` |
| `let r: {} = invoke("./x.theta")` | `empty-schema-body @ 4:1-4:32` |
| ``let r: {} = @`hi` `` then `let s: {} = 1` (two statements) | `empty-schema-body` × 3 — two for the compound statement, one for the plain one |

A further control is the shape a fix must not collapse:

| Fixture | `diags` |
| --- | --- |
| ``let r: {} = @<{}>`hi` `` | `empty-schema-body @ 4:1-4:22`, `empty-schema-body @ 4:13-4:22` |

Two lines are correct there — the author wrote `{}` twice, and `parseLet` does
not propagate over an explicit ascription (`init.schema === null` fails at
`theta-document.ts:1971`). The codes match and the ranges differ, exactly as in
the defective rows.

### Rule independence — the arity and `void` proxies

`generic-arity-mismatch` and `void-in-non-return-position` are checks 0045's
fix did not touch. Both double at the same position:

| Fixture | `diags` |
| --- | --- |
| ``let r: array<string, integer> = @`hi` `` | `generic-arity-mismatch @ 4:1-4:38`, `let-rhs-type-mismatch @ 4:1-4:38`, `generic-arity-mismatch @ 4:33-4:38` |
| `let r: array<string, integer> = 1` | `generic-arity-mismatch @ 4:1-4:34`, `let-rhs-type-mismatch @ 4:1-4:34` |
| ``let r: array<string, integer> = @`hi`? `` | `generic-arity-mismatch @ 4:1-4:39`, `let-rhs-type-mismatch @ 4:1-4:39`, `generic-arity-mismatch @ 4:33-4:38` |
| ``let r: {a: void} = @`hi` `` | `void-in-non-return-position @ 4:1-4:25`, `void-in-non-return-position @ 4:20-4:25` |
| `let r: {a: void} = 1` | `void-in-non-return-position @ 4:1-4:21` |
| ``let r: void = @`hi` `` | `void-in-non-return-position @ 4:1-4:20`, `void-in-non-return-position @ 4:15-4:20` |

The `let-rhs-type-mismatch` line between the two arity lines renders
`expected array<string,integer>, got array<string,integer>`; it is
[0028](./0028-unresolved-annotation-silent-permissive-lowering.md) §Fix
residual (iii), emitted once, and it is not part of this subject.

`result-in-schema-position` is the fourth check the walk owns and does not
appear at this position at all: it requires `position === "schema-feeding"`
(`type-grammar.ts:450–460`) and both sites pass `"value"`.

### The second site is the sole emitter of the name check

| Fixture | `diags` |
| --- | --- |
| ``let r: Ghost = @`hi` `` | `unresolved-named-type: unresolved named type 'Ghost' @ 4:16-4:21` |
| `let r: Ghost = 1` | `[]` |
| ``let r = @<Ghost>`hi` `` | `unresolved-named-type @ 4:9-4:21` |
| ``schema S { f: string }`` + ``let r: S = @`hi` `` | `[]` |

The single line in row 1 comes from `theta-document.ts:6383–6385`, in the arm
whose walk this report's second site belongs to. Site 1 runs no name
resolution, and the registry row's closed position list
(`code-registry-parse.md:90`) does not include the `let` annotation, which is
why row 2 is empty. A repair that drops the whole arm for propagated text
removes row 1's emission.

### The QRY-2 indirect sinks emit once

`QueryExpr.schema` is read off the parsed body after `resolveQuerySchemas`.

| Fixture | `QueryExpr.schema` | `diags` | Non-query control |
| --- | --- | --- | --- |
| ``fn f(): {} { @`hi` } `` | `null` | one `empty-schema-body` | identical |
| ``fn f(): array<string, integer> { @`hi` } `` | `null` | one `generic-arity-mismatch` | identical |
| ``fn f(): array<{}> { @`hi` } `` | `null` | one `empty-schema-body` | identical |
| ``fn f(p: {}) { 1 }`` then ``f(@`hi`)`` | `null` | one `empty-schema-body` | identical (`f(1)`) |
| ``schema S { f: {} }`` then ``S { f: @`hi` }`` | `null` | one `empty-schema-body` | identical (`S { f: 1 }`) |
| ``fn f(): string { @`hi` } `` | `"string"` | `[]` | identical |
| ``fn f(): Ghost { @`hi` } `` | `"Ghost"` | one `unresolved-named-type` | `[]` |
| ``fn f(): void { @`hi` } `` | `"void"` | one `void-in-non-return-position @ 5:3-5:8` | `[]` |

Rows 1–5 do not reach the second site at all: the inference declines the
annotation, `QueryExpr.schema` stays null, and the guard at
`theta-document.ts:6360` skips the walk. Rows 7–8 do reach it, and emit once
because the `fn` return site's own `parseTypeExpression` call
(`theta-document.ts:5992`) passes `"return"` and finds nothing to report for
those two texts. Row 8 is a false emission rather than a duplicate and is out
of scope here (§Non-goals).

## Expected behaviour

- `docs/spec_topics/diagnostics/code-registry-parse.md:86` — the *Trigger*
  under [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) is a
  condition on the source: "An empty inline object type (`{}`) in any `Type`
  position, at any nesting depth." ``let r: {} = @`hi` `` satisfies it once.
  The same holds for `generic-arity-mismatch` (`:58` — "A generic-type
  application whose type-argument count does not match…") and
  `void-in-non-return-position` (`:59` — "`void` keyword used in a `Type`
  position other than a function/theta return type"), each written once in the
  proxies above. The registry fixes triggers, severities and messages; it
  states no count, so the count contract has to come from elsewhere.
- [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) §Fix
  (0.57.0) *Multiplicity* (`:212–213`) is that contract for
  `empty-schema-body`: "One diagnostic per occurrence, in source order, no
  dedup: two sibling empties raise twice, one nested empty raises once." The
  compound position is named there as the exception, and cell g3 pins the
  exception rather than the contract.
- [QRY-2](../spec_topics/query/query-forms.md#qry-2) and
  [QRY-3](../spec_topics/query/query-forms.md#qry-3) — the binding annotation
  is a type *sink* that supplies the query's response schema; an explicit
  `@<Schema>` ascription overrides it. One annotation, supplying one schema.
  Nothing in the inference rules makes the annotation a second occurrence of
  the type in source.
- `docs/spec_topics/diagnostics/diagnostic-shape.md:65` — multi-error
  reporting: every parse pass collects all errors from the full file and the
  theta is rejected "with the complete list in one `pi.sendMessage` call per
  `.theta` file", with `details.diagnostics` carrying the same as a structured
  array. Both entries are therefore rendered to the author and are visible to
  any structured consumer.

Expected concretely: one occurrence of a refusable type in a `let` annotation
over a bare-query initialiser produces exactly one diagnostic for that
occurrence, whichever walk rule the type violates —
``let r: {} = @`hi` `` one `empty-schema-body`,
``let r: array<string, integer> = @`hi` `` one `generic-arity-mismatch`,
``let r: {a: void} = @`hi` `` one `void-in-non-return-position` — with the
single-emission controls and the two-written-occurrence control
(``let r: {} = @<{}>`hi` ``) unchanged, and the query arm's
`unresolved-named-type` for a propagated name preserved.

## Actual behaviour / root cause

**The propagation makes one text reachable from two walk arms.** `parseLet`
copies the annotation onto the query (`theta-document.ts:1971–1973`) or onto
the `try`'s inner query operand (`:1974–1979`). The `let` statement keeps its
own `annotation` field; the query gains a `schema` field holding the same
string. Nothing on either node records that the two are one occurrence.

**Both arms then run the same pass.** `walkStatement`'s `let` arm calls
`parseTypeExpression(s.annotation, "value", …)` (`:5911`) and `walkExpr`'s
`query` arm calls `parseTypeExpression(responseAnnotation, "value", …)`
(`:6372`) on the propagated text. `parseTypeExpression`
(`type-grammar.ts:108–123`) re-tokenises and re-parses its input on each call
and holds no state across calls, so the second call repeats the first's
verdict. Both callers take the default rule set (`:112`), so all three checks
reachable at `"value"` — `void-in-non-return-position`,
`generic-arity-mismatch`, `empty-schema-body` — are computed twice.

**The two entries differ in range.** Site 1 passes `{ file, range: s.range }`,
the whole `let` statement; site 2 passes `{ file, range: e.range }`, the query
expression. The rendered messages match character-for-character; the ranges
differ and nest. `walkStatement` pushes site 1's diagnostics before descending
into the initialiser (`:5909–5916`), so the statement-ranged line comes first.
Both reach `doc.diagnostics` (§Reproduction).

**The arm's existing carve-outs show the shape of the omission.** The query arm
already withholds an emission to avoid a double: an empty annotation is skipped
because 0014's `theta/parse/empty-query-annotation` owns that interior "and a
second diagnostic here would double up" (`:6353–6356`). It also peels
`Result<T, E>` down to its response part (`:6361`, `queryResponseAnnotation` at
`:5018`) precisely because `QueryExpr.schema` "is not always something the
author wrote at the `@<T>` position" (`:4989–4990`). The arm therefore knows
the propagated case exists and handles two of its consequences; the third — the
text having already been checked at the annotation site — is unhandled.

**The QRY-2 route does not reproduce it because its text does not survive
intact.** `annotationToInferred` declines a brace-rooted annotation
(`query-schema-resolve.ts:523–525`) and `compatToInferred` declines every shape
the `InferredSchema` model cannot carry (`:544–555`), so an indirect sink's
`{}`, `array<{}>` or mis-arity generic leaves `QueryExpr.schema` null
(§Reproduction). The plain identifier and primitive shapes do reach the arm,
and emit once because the sink's own pass reports nothing for them.

## Why it matters

1. One written type yields two identical message lines in the batch the author
   receives (`diagnostic-shape.md:65`), pointing at two ranges — the statement
   and the initialiser. The second line describes no second `{}`; an author
   reading it looks for a source defect that is not there.
2. The count is decided by check-site topology, not by any rule, so it is not
   reviewable per rule. 0045's fix added the fourth doubling check at this
   position while settling "one per occurrence, no dedup" for that rule, and
   the two statements were reconciled by recording the exception. Any further
   rule added to `walkType` or to the `"inline-object-shape"` set doubles here
   with no decision taken.
3. `tests/inline-empty-object-type.test.ts` g3 asserts the two-line list, so
   the tree's regression net now holds the duplicate as the expected output. A
   fix must invert that cell; until then, a change that removed the duplicate
   would red as a regression.
4. Structured consumers read `details.diagnostics` as an array
   (`diagnostic-shape.md:65`). A per-code count over that array reports two
   empty inline objects, two arity errors or two `void` misuses for one, and no
   field in the entries marks the pair as one occurrence.
5. The single-emission controls make the position inconsistent with itself: the
   same annotation over `1`, over `invoke(…)` or written at `@<{}>` produces
   one line. The author cannot predict the count from the source they wrote.

## Fix

Constraint-pinned. The repair is a change to the propagated-annotation re-walk,
which is the same code path that decides which rules run at the query arm; the
route is not settled here because each candidate moves a different observable.

**Candidate routes.**

1. **Dedupe at the propagation site.** `parseLet` stops handing the query a
   text that the annotation walk will also check — for example by carrying the
   propagated response schema in a field the structural walk does not check,
   leaving `QueryExpr.schema`'s checked slot for author-written `@<T>` text.
   Downstream consumers read `QueryExpr.schema` as the single source of truth
   for the resolved annotation (`theta-document.ts:6348–6353`,
   `query-schema-resolve.ts:10–19`), so this route has to keep that field's
   value unchanged for the lowering and typed-dispatch paths while changing
   what the walk reads.
2. **Skip the second walk for propagated text.** The query arm withholds its
   `parseTypeExpression` call (`:6371–6373`) when the schema arrived by
   propagation rather than from an `@<T>` ascription, which needs a provenance
   marker on `QueryExpr` that `parseLet` sets at both `:1972` and `:1978`. The
   arm's 0014 carve-out (`:6353–6356`) is the in-tree idiom for a withheld
   emission at this site.
3. **Dedupe at aggregation, keyed on code and range.** The document's
   diagnostic list drops later entries whose key matches an earlier one. At
   HEAD the two entries do not share a range (`4:1-4:18` versus `4:13-4:18`),
   so this key does not collapse them as written; the route needs either a
   shared range at the two sites or an occurrence key that survives the range
   difference.

**Constraints any route satisfies.**

- The query arm's name resolution keeps running for propagated text.
  ``let r: Ghost = @`hi` `` draws its single `unresolved-named-type` from
  `:6383–6385` alone, and the non-query control `let r: Ghost = 1` draws none
  (§Reproduction), because the registry row's closed position list
  (`code-registry-parse.md:90`) does not name the `let` annotation. Route 2
  withholds the type-grammar call only.
- The `TypePosition` at both sites stays `"value"`. Re-homing the walk to
  `"schema-feeding"` would newly fire `result-in-schema-position`, which the
  arm's comment (`:6363–6370`) forbids on 0044's blast-radius grounds.
- Text equality between the two sites is not a usable key. The `Result` peel
  (`:6361`) gives site 1 `Result<{}, QueryError>` and site 2 `{}` for one
  occurrence (§Reproduction).
- Two written occurrences keep two lines. ``let r: {} = @<{}>`hi` `` produces
  the same code at two different ranges and is correct; `parseLet` does not
  propagate there (`:1971`), which is the discriminator route 2 keys on.
- The `?` form is covered. ``let r: {} = @`hi`? `` doubles identically, so a
  marker set in `parseLet` is set on the `try`'s inner operand too (`:1978`).
- Emission order is decided by which site survives. Site 1 pushes before the
  initialiser walk (`:5909–5916`), so withholding site 2 leaves the
  statement-ranged line and withholding site 1 leaves the expression-ranged
  one. Whichever survives, its range is the one authors and tooling see; the
  expression range is the tighter of the two.
- The count settles for every rule the walk owns at the position at once —
  `empty-schema-body`, `generic-arity-mismatch` and
  `void-in-non-return-position` today, and any rule later added to `walkType`
  or to `"inline-object-shape"` (`type-grammar.ts:97`).
- No registry edit. No code is added, removed or re-triggered: each row's
  *Trigger* already describes a source condition satisfied once, and the fix
  changes how many times the implementation reports it. GOV-15's
  diagnostic-registry carve-out is not engaged, and no input moves between
  loading and not loading, since both entries are error severity on the same
  file.

**Pins that move with the fix.** `tests/inline-empty-object-type.test.ts` g3
(`:839–901`) inverts: its two-line rows for ``let r: {} = @`hi` `` and the
arity proxy become one-line rows, its three single-emission rows and its
non-query arity control stay byte-identical, and its comment (`:840–854`),
which records the doubling as observed and defers the repair, is rewritten to
record the repair. 0045 §Fix (0.57.0) *Multiplicity* (`:212–220`) and
*Residuals* item (i) (`:284–286`) are updated to point here.

**Test witness — unit, offline, provider-free.** Every row in §Reproduction is
one `parseDoc` call and one whole-list equality: the subject rows at one line
each, the arity and `void` proxies at one line each with their non-query
controls unchanged, the three single-emission controls, the
two-written-occurrence control at two lines, the `Ghost` row keeping its single
`unresolved-named-type`, the `Result` peel row, the `?` and `mut` spellings,
the nested-in-`fn` and nested-in-`if` placements, and the QRY-2 indirect-sink
table unchanged including `QueryExpr.schema`. Asserting whole ordered lists is
what makes both directions reachable: a fix that drops the occurrence entirely
reds on the missing line, and one that collapses the two-written-occurrence
control reds on that row.

## Non-goals

- **The self-identical `let-rhs-type-mismatch`.**
  ``let r: array<string, integer> = @`hi` `` and
  ``let r: array<string> = @`hi` `` report `expected <T>, got <T>` from
  `src/parser/static-type-inference.ts` typing a query as a `named` node
  holding the propagated text.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) §Fix
  residual (iii) (`:338–349`) owns it. It is emitted once and is unchanged
  here; it appears in this report only because it sits between the two arity
  lines.
- **The false `void-in-non-return-position` at a QRY-2 `fn`-return sink.**
  ``fn f(): void { @`hi` } `` emits one `void-in-non-return-position` at the
  query's range while `fn f(): void { 1 }` is silent (§Reproduction), because
  the inference writes `"void"` into `QueryExpr.schema` and the arm walks it at
  `"value"`. Same re-walk mechanism, different evidence class: a spurious
  emission at the one position the grammar admits `void`, not a duplicate.
  0044 records the silent control (`:428`). Unfiled and out of scope here; a
  route-2 marker keyed on `parseLet` alone does not reach it, since that text
  arrives from `resolveQuerySchemas`.
- **The `let` annotation running no name-resolution walk.** `let r: Ghost = 1`
  is silent (§Reproduction) and conforms to the closed position list of
  `unresolved-named-type` (`code-registry-parse.md:90`). Widening that row is a
  spec decision, not this repair.
- **Which site should own the rule set.** This report does not re-decide the
  `TypePosition` classification of the `let` annotation or of the `@<T>`
  ascription, nor which checks belong at either; it settles how many times one
  occurrence is reported.
- **The brace-rooted union-arm capture defect.** `let x: {} | null = 1` splits
  into unrelated diagnostics
  ([0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)
  §Non-goals). Unchanged; the fixtures here avoid that shape.

## Provenance

- Origin: [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)
  §Fix (0.57.0) *Multiplicity* (`:212–220`) and *Residuals* item (i)
  (`:284–286`), which record the position as emitting per check-site and leave
  it unfiled, and the honest record they point at,
  `tests/inline-empty-object-type.test.ts` g3 (`:839–901`).
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:58`, `:59`, `:60`,
  `:86`, `:90`; `docs/spec_topics/diagnostics/diagnostic-shape.md:65`
  (multi-error reporting), `:72` (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/query/query-forms.md:15` (QRY-2), `:27` (QRY-3), §"Schema
  inference algorithm"; `docs/spec_topics/grammar.md:109` (the inline-object
  rule whose implementation is the fourth doubling check).
- Implementation: `src/parser/theta-document.ts:1964–1980`, `:4985–5018`,
  `:5909–5916`, `:5990–5996`, `:6342–6388`; `src/parser/type-grammar.ts:97`,
  `:108–123`, `:412–492`; `src/parser/query-schema-resolve.ts:10–19`,
  `:518–557`.
- Observations: seven throwaway offline vitest probes at `9ea93511` over
  `parseDoc` (`tests/helpers/e2e-s1.ts`), deleted after the runs (the 0033 /
  0087 / 0092 precedent). Rows recorded: 20 in the first (diagnostic lists with
  ranges), 15 in the second (QRY-2 sinks and name-walk controls), 7 in the
  third (lists plus `QueryExpr.schema`), 10 in the fourth (codes plus
  `QueryExpr.schema`), 4 in the fifth (the `void` sink and its controls), 4 in
  the sixth (the `fn`-return sinks' non-query controls), 2 in the seventh (the
  call-argument and constructor-field sinks' `QueryExpr.schema`).
- Existing reports read for duplicate separation: 0014, 0028, 0044, 0045.
