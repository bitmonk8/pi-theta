---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: The four checkImported* routes each re-walk a theta body invoke-static-checks.ts's own header calls "the one shared collection"
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:51-59
  - src/extension/invoke-static-checks.ts:152-164
  - src/extension/invoke-static-checks.ts:209-232
  - src/extension/invoke-static-checks.ts:1566
  - src/extension/invoke-static-checks.ts:1731
  - src/extension/invoke-static-checks.ts:1830
  - src/extension/invoke-static-checks.ts:1931
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/invoke-static-checks.ts
wave: qw20260914060226
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# The four checkImported* routes each re-walk a theta body invoke-static-checks.ts's own header calls "the one shared collection"

## Observation
This module's own header comment describes `checkImportedSchemaCtorFields`,
`checkImportedEnumVariantAccess` and `checkImportedNonCtorTypeNames`
(bugs 0429/0430/0448), together with `checkImportedFnCallArgs` (bug 0138),
as each "walking the importing theta's body through the one shared
collection" (singular). In the actual code, all four instead independently
call the module's own `collectCallSites(importingBody)` — the full-body AST
walk this same file's doc comment elsewhere says exists precisely so "a
second, independently written walker would [not] drift out of sync" (bug
0071) — building a fresh, unshared `CollectedCallSites` object each time.
For a theta whose imports trigger more than one of these four routes (e.g.
one library import used both to call an imported `fn` and to construct an
imported `schema`), the same body is walked once per route instead of once
in total.

## Evidence

**The documented architecture — invoke-static-checks.ts:152-164**
(the `CollectedCallSites` doc comment):
```ts
/**
 * The four call-shaped node kinds the shared walk (`walkCallSiteNodes`,
 * `../parser/theta-document.ts`) visits in ONE traversal: every `invoke(...)`
 * expression, every `CallExpr` — a `.theta`-callable-call CANDIDATE whose
 * callee is resolved against the caller's frozen callable set by
 * `resolveThetaCallableCallSites`, not by this walk — every `ObjectExpr`
 * constructor site (bug 0429) and every `MemberExpr` (bug 0430). One walk
 * keeps all four call surfaces in lockstep across this module,
 * `extension-tool-reachability.ts`, `subagent-fn-static-checks.ts` and
 * `collectClauseBearingCalls`: a second, independently written walker would
 * drift out of sync as the `Expr` / `Stmt` node shapes evolve (bug 0071).
 * `checkInvokeStaticResolution` therefore traverses a body once and feeds
 * every one of its check loops from that one result.
 */
```

**The specific claim for the four import-check routes —
invoke-static-checks.ts:51-59** (module header):
```
//   - bugs 0429 / 0430 / 0448 — `checkImportedSchemaCtorFields`,
//     `checkImportedEnumVariantAccess` and `checkImportedNonCtorTypeNames`,
//     wired from the same `checkThetaImports` site as bug 0138's check: an
//     imported-`.thetalib` constructor site's field set against the imported
//     `schema`'s declared fields, an imported `enum`'s member access against
//     its variant list, and a constructor whose imported head is not
//     brace-constructible (an `enum`, a `fn`, or an alias-form `schema`) —
//     each reusing an existing parse-time diagnostic row and walking the
//     importing theta's body through the one shared collection.
```

**The facility this describes — invoke-static-checks.ts:209-232**
(`collectCallSites`, abridged): each call builds a brand-new object and
performs a fresh full-body traversal:
```ts
function collectCallSites(body: ThetaBody): CollectedCallSites {
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [], objectExprs: [], memberExprs: [] };
  walkCallSiteNodes(body, (node) => {
    switch (node.kind) {
      case "invoke":
        out.invokeExprs.push(node);
        return;
      ...
```

**The fighting usage — four independent calls, one per route, none passed
or returned between the functions:**
- :1566, inside `checkImportedFnCallArgs`: `const { callExprs } = collectCallSites(importingBody);`
- :1731, inside `checkImportedSchemaCtorFields`: `const { objectExprs } = collectCallSites(importingBody);`
- :1830, inside `checkImportedEnumVariantAccess`: `const { memberExprs } = collectCallSites(importingBody);`
- :1931, inside `checkImportedNonCtorTypeNames`: `const { objectExprs } = collectCallSites(importingBody);`

Each of these four functions is a top-level exported function with no
`CollectedCallSites` parameter — none can be receiving a caller-shared
result, and none passes its own result to a sibling. There is no single
collection object visible to more than one of these four functions anywhere
in this file.

## Why this is a problem
The module's own stated reason for centralising the walk in
`collectCallSites` — avoiding a second, independently-written traversal that
"would drift out of sync as the `Expr` / `Stmt` node shapes evolve" (bug
0071) — is about not re-deriving the walk's LOGIC, and that much holds (all
four routes call the one `collectCallSites` function rather than writing
their own switch-on-`node.kind` walker). But the header's stronger claim —
"walking the importing theta's body through the one shared collection" — is
false of the code as written: four independent invocations produce four
independent `CollectedCallSites` objects, each populating all four of its
arrays (`invokeExprs`, `callExprs`, `objectExprs`, `memberExprs`) via a full
`walkCallSiteNodes` pass, even though each consuming function destructures
only the one array it needs. `checkInvokeStaticResolution` (963-1471, in the
same file) is built the opposite way — it calls `collectCallSites` exactly
once (line 986) and threads that one `callSites` result through all three
of its own internal loops — showing the single-shared-walk shape the header
describes is both intended and already achieved elsewhere in this file, just
not carried through to the four `checkImported*` routes the header
describes in the same words.

## Suggested direction (non-binding, optional)
Have the call site that invokes these four routes (`checkThetaImports`,
`../extension/import-static-checks.ts` — outside this shard, not read for
this review) collect once and pass the shared `CollectedCallSites` (or just
the one array each route needs) into whichever of the four routes it calls,
mirroring `checkInvokeStaticResolution`'s own internal pattern. Named as a
hypothesis only; a human confirms `checkThetaImports`'s actual call pattern
before deciding whether all four routes are ever exercised for the same body
in one pass.

## False-positive check
Grepped every `collectCallSites(` occurrence in this file (7 hits: the
`collectInvokeExprs`/`collectThetaCallableCallSites` convenience wrappers at
195/304, the shared-and-correctly-reused call inside
`checkInvokeStaticResolution` at 986, and the four independent calls at
1566/1731/1830/1931 cited above) and read each of the four `checkImported*`
functions in full: none receives a `CollectedCallSites` parameter or a
pre-built array, confirming each call is a fresh, independent traversal.
This review did not open `../extension/import-static-checks.ts` (the
`checkThetaImports` call site the module's own header names as the wiring
point for all four routes) — that file sits outside this shard's manifest,
so whether production code ever invokes more than one of the four routes
for the same theta in the same pass is stated here as the module's own
header claim ("wired from the same … site as bug 0138's check"), not
independently confirmed; flagged per this review's brief rather than guessed
at. The core claim — that "the one shared collection" the header describes
does not exist as a single object visible to more than one of the four
functions — holds regardless of that external call pattern, since it is a
property of this file's own code. `checkImportedFnCallArgs` (1555-1678) is
already flagged for D9 breakdown (band justify, 124 LOC); this filing is a
distinct claim about redundant work shared with three OTHER, un-flagged
sibling functions (57/44/43 LOC each), not a restatement of that function's
own size. No `docs/spec_topics/` clause pins "one walk per body" as a
requirement with a specific number, but the module's own header and doc
comment (quoted above, both inside this shard) state it as this file's
adopted architecture, which is the documented intent this filing cites.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — every citation verified verbatim (header 51-59, CollectedCallSites doc 152-164, collectCallSites 209-236, four independent calls at 1566/1731/1830/1931), each of the four checkImported* functions confirmed to take no CollectedCallSites/shared parameter and to build its own via a fresh collectCallSites(importingBody) call, and import-static-checks.ts:1792-1847 (read despite the filing's own disclaimer) shows checkThetaImports invokes all four unconditionally on the same input.body every pass, so the redundant full-body walk is real whenever a theta's imports exercise more than one route; no D8 exemption recorded for this host and no docs/spec_topics clause requires four independent walks — accounting holds but D8 caps at questionable, a human rules whether to share the collection (triage: claude-opus-5)
