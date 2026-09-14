---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: invoke-static-checks.ts's four checkImported* routes each independently re-run the whole-file collectLocalBinderNames walk over the same importing body
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1566
  - src/extension/invoke-static-checks.ts:1731
  - src/extension/invoke-static-checks.ts:1830
  - src/extension/invoke-static-checks.ts:1931
  - src/extension/import-static-checks.ts:1470-1473
  - src/extension/import-static-checks.ts:1483-1486
  - src/extension/import-static-checks.ts:1496-1499
  - src/extension/import-static-checks.ts:1510-1513
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/invoke-static-checks.ts # D8 only: the exemption key
wave: qw20260914091051
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# invoke-static-checks.ts's four checkImported* routes each independently re-run the whole-file collectLocalBinderNames walk over the same importing body

## Observation
`checkImportedFnCallArgs`, `checkImportedSchemaCtorFields`,
`checkImportedEnumVariantAccess` and `checkImportedNonCtorTypeNames` each open
with an identical call, `collectLocalBinderNames(importingBody,
paramsFieldNames)`, over the SAME `importingBody` their single caller
(`checkThetaImports`, `import-static-checks.ts`) always passes as
`input.body`, with a `paramsFieldNames` array that caller also rebuilds
identically at each of the four call sites. `collectLocalBinderNames` is
documented at its own declaration (`../parser/type-layer-checks.ts:606-627`)
as "A whole-file over-approximation of every name a LOCAL binder can bind,
anywhere in `body` … Recursive over every statement, block and expression the
grammar admits, a nested `fn` body included" — i.e. a full recursive AST walk,
not a cheap lookup. This is a second instance of the exact shape PTQ-0319
already filed against this file's `collectCallSites` calls in these same four
functions; that finding's evidence and its ratified fix are both scoped to
`collectCallSites` alone and say nothing about `collectLocalBinderNames`,
which is a different function, defined in a different module, called with
the same redundant shape.

## Evidence

**The four identical calls (verified at the current line numbers,
`invoke-static-checks.ts`):**

`:1560-1568` (`checkImportedFnCallArgs`):
```ts
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedFns: ReadonlyMap<string, ImportedFnCallee>,
): Diagnostic[] {
  if (importedFns.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
```

`:1731` (`checkImportedSchemaCtorFields`):
```ts
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
```

`:1830` (`checkImportedEnumVariantAccess`):
```ts
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
```

`:1931` (`checkImportedNonCtorTypeNames`):
```ts
  const shadowedNames = collectLocalBinderNames(importingBody, paramsFieldNames);
```

**The facility's own documented cost — `../parser/type-layer-checks.ts:606-627`
(quoted for the cost-shape claim; this file is outside this shard's review
scope, cited only for its own self-description):**
```ts
/**
 * A whole-file over-approximation of every name a LOCAL binder can bind,
 * anywhere in `body`: the frontmatter `params:` field wire names
 * (`paramsFieldNames`), every `let` name, every `for` / `par for` loop
 * variable, every `match`-arm pattern binding, and every `fn` parameter name —
 * including an UNANNOTATED one. Recursive over every statement, block and
 * expression the grammar admits, a nested `fn` body included.
```

**The caller passes the identical `importingBody` and rebuilds the identical
`paramsFieldNames` expression at each of the four call sites —
`import-static-checks.ts:1470-1473, 1483-1486, 1496-1499, 1510-1513`:**
```ts
    ...checkImportedFnCallArgs(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedFns,
```
```ts
    ...checkImportedSchemaCtorFields(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedSchemas,
```
(the `checkImportedEnumVariantAccess` and `checkImportedNonCtorTypeNames`
calls at 1496 and 1510 repeat the same `input.body` /
`(input.frontmatter?.params?.fields ?? []).map((f) => f.wireName)` pair a
third and fourth time.)

No cache keyed on `importingBody` sits between these four functions and
`collectLocalBinderNames`: each function's own local scope holds no map or
memo, and `collectLocalBinderNames` is a bare exported function with no
caching inside it either (confirmed by reading its full body).

## Why this is a problem
For one composing theta whose imports exercise more than one of these four
routes (e.g. a `.thetalib` import used both to call an imported `fn` and to
construct an imported `schema` — an ordinary authoring pattern, not an edge
case), the identical whole-file recursive walk over the identical
`importingBody` runs once per route instead of once per theta. The job each
route needs is a single fact — "which names are locally shadowed in this
theta" — that depends on neither which import-check route is asking nor on
which of the four disjoint maps (`importedFns` / `importedSchemas` /
`importedEnums` / `importedNonCtorNames`) that route is judging against; the
four calls are pure repetitions of the same computation over the same input,
paid in full every time. This is the identical shape PTQ-0319 already named
for this file's `collectCallSites` calls in these same four functions — this
finding covers a second, textually adjacent instance
(`collectLocalBinderNames`, one line above each `collectCallSites` call at
1566/1731/1830/1931) that PTQ-0319's own evidence and ratified fix (share one
`CollectedCallSites` value; nothing about `collectLocalBinderNames`) do not
reach, so it survives once that fix lands.

## Suggested direction (non-binding, optional)
Unproven hypothesis: mirror PTQ-0319's own ratified shape — have
`checkThetaImports` compute `collectLocalBinderNames(input.body,
paramsFieldNames)` once and pass the resulting `ReadonlySet<string>` into
whichever of the four routes it calls, each taking it as a parameter instead
of recomputing it. A human confirms the four routes never need a
per-route-different `paramsFieldNames` (this review's own reading found the
caller passes the same expression at all four sites).

## False-positive check
Grepped `collectLocalBinderNames(importingBody` in `invoke-static-checks.ts`:
exactly 4 hits, at 1566/1731/1830/1931, one per `checkImported*` function,
each immediately followed by that function's own `collectCallSites` call (the
subject of the already-open PTQ-0319 — this filing is deliberately scoped to
the OTHER call, on the same lines' neighboring statement, to keep "one
finding, one root cause"). Read `collectLocalBinderNames`'s full declaration
in `../parser/type-layer-checks.ts` (outside this shard) to confirm its cost
is a real recursive walk and not a cheap memoized getter — quoted above
verbatim from its own doc comment. Grepped `import-static-checks.ts` for
`checkImportedFnCallArgs(` / `checkImportedSchemaCtorFields(` /
`checkImportedEnumVariantAccess(` / `checkImportedNonCtorTypeNames(`: each has
exactly one call site (1470/1483/1496/1510), confirming `checkThetaImports`
is the sole caller and always supplies the same `input.body`. Checked for a
stated rationale for recomputing rather than sharing: neither
`collectLocalBinderNames`'s own doc comment nor any of the four
`checkImported*` doc comments states a reason the shadow set must be rebuilt
per route (each explains WHY shadowing outranks import resolution, never why
it is recomputed four times), so the D2/D8 rationale-stated-knob carve-out
does not apply. No `docs/spec_topics/` clause requires four independent
walks — `expressions.md`'s "Identifier resolution" ranking that each function's
comment cites is silent on implementation shape — so no `challenges_spec`
applies. Distinct from PTQ-0319 (same four host functions, different
redundant call: `collectLocalBinderNames` vs. `collectCallSites`) and from
PTQ-0321/the D9 breakdown history on this file (a size/phase-count claim on
`checkInvokeStaticResolution`, a different function entirely) — this finding
names neither function's size, only the repeated computation.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — all citations verified verbatim (four independent `collectLocalBinderNames(importingBody, paramsFieldNames)` calls at invoke-static-checks.ts:1566/1731/1830/1931, each function's sole caller `checkThetaImports` passing the identical `input.body`/wireName expression at import-static-checks.ts:1470-1473/1483-1486/1496-1499/1510-1513, and the whole-file recursive-walk doc comment at type-layer-checks.ts:606-627, with no cache anywhere in the path); distinct root cause from PTQ-0319 (ratified fix covers only `collectCallSites`, silent on this function) and from PTQ-0321 (a different function's size claim); no D8 exemption or spec_topics clause covers this host/behaviour; accounting holds but D8 caps at questionable — sharing the walk is a human design decision (triage: claude-opus-5)
