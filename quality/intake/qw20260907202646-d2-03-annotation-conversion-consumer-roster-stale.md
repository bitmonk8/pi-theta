---
id: pending
title: annotationToCompatType's doc enumerates "four consumers besides the let-annotation site" and closes on "the five", while twelve production call sites read it, four of them outside the enumeration
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:907-938
  - src/parser/type-layer-checks.ts:1557-1561
  - src/parser/type-layer-checks.ts:1352-1363
  - src/parser/type-layer-checks.ts:2147
  - src/parser/type-layer-checks.ts:2674
  - src/extension/invoke-static-checks.ts:1451
sites: 6
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# annotationToCompatType's doc enumerates "four consumers besides the let-annotation site" and closes on "the five", while twelve production call sites read it, four of them outside the enumeration

## Observation
`annotationToCompatType`'s doc comment says its consumer set is closed at
"four consumers besides the `let`-annotation site", lists them as four bullets,
and closes "Widening any of the five is separate work". A second comment at the
`let` arm repeats the count ("see that function's own comment for why those
four are held"). The repository has twelve production call sites of the
function across three modules. Four of them are not covered by any bullet: the
frontmatter `params:` binding seed (`paramsFieldBindings`), the `subagent fn`
return-annotation conversion (`checkSubagentReturnAnnotation`), the same-file
`fn`-call parameter conversion (`checkFnCallArgs`), and the imported-library
`fn`-call parameter conversion (`checkImportedFnCallArgs`).

## Evidence
src/parser/type-layer-checks.ts:907-938 — the count claim and the four bullets
(bullet bodies elided to stay inside the excerpt limit; the four bullet heads
and the closing sentence are verbatim):

```ts
 * Bug 0130 §Fix (f): this function's OWN behaviour is unchanged — it never
 * mints `CompatType`'s `object` arm. That is deliberate, not an oversight: its
 * four consumers besides the `let`-annotation site each carry another bug's
 * LANDED bound on the inline-object direction, and widening this shared
 * conversion would move all of them at once.
 *
 *   - `collectSchemaFields` (→ `theta/parse/object-field-type-mismatch`) and
 *   - `invoke-static-checks.ts`'s callee `params:` argument check
 *   - `query-schema-resolve.ts`'s `checkLetMismatch` and `compatToInferred`
 *   - the alias-RHS conversion (`collectTypeEnv`, below) and the `fn`-param
 *     binding seed (`walkFn`'s parameter loop) both read a declared type in a
 *
 * Widening any of the five is separate work; `letAnnotationToCompatType`
 * below is the ONLY caller authorised to mint an `object` arm, at the `let`
 * annotation site alone.
```

src/parser/type-layer-checks.ts:1557-1561 — the count restated at the `let` arm:

```ts
          // Bug 0130 §Fix (a): the `let`-annotation-only conversion, the ONLY
          // call site authorised to mint TYPE-8's `object` arm for a
          // well-formed inline object type. Every other reader of an
          // annotation source keeps calling `annotationToCompatType`
          // (see that function's own comment for why those four are held).
```

Unenumerated consumer 1 — src/parser/type-layer-checks.ts:1352-1363, the
frontmatter `params:` field seed:

```ts
function paramsFieldBindings(
  fields: readonly ParamsFieldSource[],
): Map<string, CompatType> {
  const bindings = new Map<string, CompatType>();
  for (const field of fields) {
    bindings.set(
      field.name,
      annotationToCompatType(field.typeSource) ?? { kind: "named", name: field.typeSource },
    );
  }
  return bindings;
}
```

Unenumerated consumer 2 — src/parser/type-layer-checks.ts:2147, inside
`checkSubagentReturnAnnotation` (declared :2132):

```ts
    const annotation = annotationToCompatType(returnType);
```

Unenumerated consumer 3 — src/parser/type-layer-checks.ts:2674, inside
`checkFnCallArgs`'s matched-parameter loop:

```ts
      const paramType = annotationToCompatType(p.type);
```

Unenumerated consumer 4 — src/extension/invoke-static-checks.ts:1451, inside
`checkImportedFnCallArgs` (declared :1373), which converts a library `fn`'s
parameter annotation under `libraryEnv`/`importerEnv` rather than the bullet's
"callee `params:` argument check … under a deliberately EMPTY `TypeEnv`":

```ts
      const paramType = annotationToCompatType(param.type);
```

## Evidence — the full call-site census
`grep -rn "annotationToCompatType(" --include=*.ts src extensions tools`
(excluding `letAnnotationToCompatType` hits) returns 13 lines; one
(type-layer-checks.ts:1329) is inside a doc comment, leaving 12 call sites:
invoke-static-checks.ts:819, :1146, :1451; query-schema-resolve.ts:651, :652,
:699; type-layer-checks.ts:439, :891, :1359, :2051, :2147, :2674. Bullet 1
covers :891, bullet 2 covers :819 and :1146, bullet 3 covers :651/:652/:699,
bullet 4 covers :439 and :2051. The four listed above are covered by no bullet.

## Why this is a problem
The comment is an explicit, closed enumeration used to justify a behavioural
hold ("widening this shared conversion would move all of them at once", "any of
the five"). The set it enumerates is not the set the code has: a reader
reasoning about what a change to this conversion touches, or auditing which
positions inherit bug 0130's inline-object bound, is handed a roster that omits
a third of the call sites — including the `params:` seed, which
`bindLoopElement`'s own comment at :1897-1900 independently names as one of the
three single-`CompatType`-per-parse producers. `git log -S "four consumers besides" -- src/parser/type-layer-checks.ts`
shows the sentence entering at `09eeec4e` (bug-0130, v0.160.0); the four
uncovered sites are visible in the current file and were not added to it.

## Suggested direction (non-binding, optional)
Either state the roster as "the consumers that carry a landed inline-object
bound" and name which call sites those are, or drop the count and keep the
behavioural statement; comment-only.

## False-positive check
- Call-site census run exactly as quoted above, over src/, extensions/, and
  tools/; the doc-comment-only hit at :1329 was excluded by reading the line.
- Test callers were listed separately (`grep -rn "annotationToCompatType(" --include=*.ts tests`
  → 29 total hits repo-wide including tests) and are NOT counted as consumers
  in this finding; the claim under review is about production consumers, and no
  deadness is asserted anywhere here.
- Sibling-name check: `letAnnotationToCompatType` hits were filtered out so the
  count is not inflated by the `let`-only converter, whose "ONLY caller
  authorised to mint an `object` arm" claim is accurate (one call site,
  type-layer-checks.ts:1564).
- Enclosing-function identification: `checkSubagentReturnAnnotation` (:2132),
  `checkFnCallArgs` (:2600, matched-parameter loop at :2662-2674), `checkImportedFnCallArgs`
  (invoke-static-checks.ts:1373) confirmed by reading each declaration.
- Duplicate check: `grep -rn "annotationToCompatType" quality/intake/` → only
  qw20260907183353-d2-04-annotation-inferred-brace-guard-subsumed, which cites
  query-schema-resolve.ts:691-719 for a subsumed pre-guard and
  type-layer-checks.ts:981-1008 for `convertAnnotation`'s return shapes — not
  this doc comment or its roster.

## Triage
