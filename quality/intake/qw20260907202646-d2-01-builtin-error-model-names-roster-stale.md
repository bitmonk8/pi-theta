---
id: pending
title: withBuiltinErrorModelNames' doc says it is reused "at each of the four call sites" and names "the four new captures"; five production call sites read it
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:8398-8411
  - src/parser/theta-document.ts:9104-9109
  - src/parser/theta-document.ts:9224-9229
  - src/parser/theta-document.ts:9273-9278
  - src/parser/theta-document.ts:9707-9712
  - src/parser/theta-document.ts:9884-9889
  - src/parser/theta-document.ts:7576-7580
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# withBuiltinErrorModelNames' doc says it is reused "at each of the four call sites" and names "the four new captures"; five production call sites read it

## Observation
`withBuiltinErrorModelNames` widens the whole-file `NamedType` universe with the
builtin error-model names. Its doc block states the reuse argument in terms of a
fixed count — "at each of the four call sites", "one fact instead of four", "the
four new captures" — and a second doc block, on `queryResponseAnnotation`,
enumerates the same roster as four captures ("the `let`, `fn` parameter, `fn`
return and `invoke<Type>` captures"). The function is called from five places in
this file today; the fifth is the `Result<T, E>` error-side resolution at the
query annotation, which `queryResponseAnnotation`'s own doc mentions two
sentences later as a sibling of the four it lists.

## Evidence
src/parser/theta-document.ts:8402-8410 — the two count claims in the doc block:

```ts
 * `BUILTIN_VALUE_NAMES` above — clause (iv)(1)). Reusing that constant rather
 * than a literal at each of the four call sites is what keeps the admission
 * one fact instead of four: an APPLIED `Result` is never tested as an atom
 * (`lowerTypeExpr`'s generic-application arm reads a `ctor` name structurally,
 * never through the identifier-resolution arm), so admitting it here is inert
 * for that spelling; an UNAPPLIED `Result` reaches the atom arm instead and is
 * the reserved-keyword class `theta/parse/reserved-keyword-as-identifier`
 * reports at every capture (bug 0277 §Fix route (a)) — `QueryError` is the
 * only name the four new captures ever resolve as a `NamedType`.
```

`grep -n "withBuiltinErrorModelNames(refs.typeNames)" src/parser/theta-document.ts`
returns five hits — 9107, 9227, 9276, 9710, 9887. The five call sites:

src/parser/theta-document.ts:9104-9108 (the `let` annotation capture):

```ts
          const letReservedKeywords: string[] = [];
          const letUnresolved = collectUnresolvedNamedTypes(
            s.annotation,
            withBuiltinErrorModelNames(refs.typeNames),
            letReservedKeywords,
```

src/parser/theta-document.ts:9224-9228 (the `fn` parameter-type capture):

```ts
            const paramReservedKeywords: string[] = [];
            const paramUnresolved = collectUnresolvedNamedTypes(
              p.type,
              withBuiltinErrorModelNames(refs.typeNames),
              paramReservedKeywords,
```

src/parser/theta-document.ts:9273-9277 (the `fn` return-type capture):

```ts
          const returnReservedKeywords: string[] = [];
          const returnUnresolved = collectUnresolvedNamedTypes(
            s.returnType,
            withBuiltinErrorModelNames(refs.typeNames),
            returnReservedKeywords,
```

src/parser/theta-document.ts:9707-9711 (the `invoke<T>` ascription capture):

```ts
          const invokeReservedKeywords: string[] = [];
          const invokeUnresolved = collectUnresolvedNamedTypes(
            e.returnSchema,
            withBuiltinErrorModelNames(refs.typeNames),
            invokeReservedKeywords,
```

src/parser/theta-document.ts:9883-9888 — the fifth reader, the `E` side of a
`Result<T, E>` query annotation:

```ts
          if (errorModelAnnotation !== undefined) {
            const errorModelReservedKeywords: string[] = [];
            const errorModelUnresolved = collectUnresolvedNamedTypes(
              errorModelAnnotation,
              withBuiltinErrorModelNames(refs.typeNames),
              errorModelReservedKeywords,
            );
```

src/parser/theta-document.ts:7576-7580 — the sibling roster in
`queryResponseAnnotation`'s doc, which lists four captures and then names the
fifth reader's own arm two clauses later:

```ts
 * protects is the BUILTIN `QueryError`, by the same builtin error-model
 * admission the `let`, `fn` parameter, `fn` return and `invoke<Type>`
 * captures carry (`withBuiltinErrorModelNames`) — not the argument slot: the
 * `"query"` arm resolves names in `args[1]` beside the response part it reads
 * from this function (bug 0273 §Fix), so an undeclared head written there is
```

## Why this is a problem
The doc blocks are the roster a reader uses to decide whether a change to
`withBuiltinErrorModelNames` is safe, and the roster is short by one. A reader
auditing "which captures admit `QueryError`" from these comments enumerates four
and misses the `Result<T, E>` error-side capture at the query annotation — the
one capture whose whole purpose is to resolve `QueryError`. `git log -S
"queryErrorModelAnnotation" -- src/parser/theta-document.ts` shows the fifth
reader landed with `bb7546e0 fix(bug-0273)`, after the doc block was written for
bug 0262's four captures, so the count is a leftover of the earlier state rather
than a distinct claim.

## Suggested direction (non-binding, optional)
State the roster without a hard-coded cardinal, or add the `Result<T, E>`
error-side capture to both enumerations so the two doc blocks agree with the
five call sites.

## False-positive check
- Identifier search across production and tests:
  `grep -rn "withBuiltinErrorModelNames" src extensions tools tests --include=*.ts`
  → the definition (8412), five call sites (9107, 9227, 9276, 9710, 9887), one
  prose mention in this file's `queryResponseAnnotation` doc (7578), and two
  comment mentions in tests (b0273-…test.ts:285, live-production-acceptance.test.ts:14639).
  No test calls it directly, so no test-only-caller question arises.
- String-keyed / dynamic access: `grep -rn "\"withBuiltinErrorModelNames\"" src
  extensions tools tests --include=*.ts` → no hits.
- Re-exports: the function is module-private (no `export` keyword at 8412) and
  `src/parser` has no barrel file (`ls src/parser` shows only leaf modules), so
  no re-export can add a call site.
- Not a deadness claim: all five call sites are live production code; only the
  two doc rosters are stale.
- Git intent: `git log -S "queryErrorModelAnnotation" --oneline --
  src/parser/theta-document.ts` → `bb7546e0 fix(bug-0273): resolve the E argument
  of Result<T,E> at the query capture`, confirming the fifth reader post-dates
  the "four" wording.

## Triage
