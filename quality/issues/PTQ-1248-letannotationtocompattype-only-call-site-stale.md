---
id: PTQ-1248
title: letAnnotationToCompatType doc comment claims one call site while three production call sites exist
lens: D2
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
status: open
verdict: confirmed
locations:
  - src/parser/annotation-compat.ts:59-67
  - src/parser/theta-document.ts:2941-2947
  - src/parser/theta-document.ts:2963
  - src/extension/invoke-callee-arity.ts:33-35
date: 2026-09-22
---

# letAnnotationToCompatType doc comment claims one call site while three production call sites exist

## Observation
`letAnnotationToCompatType`'s doc comment in `annotation-compat.ts` states it
has exactly one caller — the `let`-annotation resolution inside `walkStmt`
(now `type-layer-walk.ts`'s `case "let"`) — and that every other consumer
keeps calling the sibling `annotationToCompatType`. Two other production
functions also call `letAnnotationToCompatType` directly: `theta-document.ts`'s
`buildRuntimeToolSuccessTypes` and `invoke-callee-arity.ts`'s
`buildComposePassSuccessTypes`. The `theta-document.ts` call site's own
comment explicitly labels itself "the second sanctioned TYPE-8 object-arm mint
site," contradicting the "ONLY call site" claim in the sibling file.

## Evidence
`src/parser/annotation-compat.ts:59-67`:
```
 * real field set. This is the ONLY call site switched to this function
 * (`walkStmt`'s `case "let"` annotation resolution); every other consumer
 * keeps calling `annotationToCompatType` for the reasons stated on its
 * comment above.
```

`src/parser/theta-document.ts:2941-2947`:
```
/**
 * RFC 0011 (seam sheet §0 C6): build the runtime-tool success-type map
 * (`presented name → CompatType`) from the frontmatter `tools:` list.
 * Each declared runtime tool's `successTypeSource` (from `RUNTIME_TOOL_SIGNATURES`)
 * is converted once through `letAnnotationToCompatType` — the second sanctioned
 * TYPE-8 object-arm mint site (bug 0130 flag F-3). GOV-15 inert: the returned
 * map is empty when the `tools:` list declares no runtime tool.
 */
```

`src/parser/theta-document.ts:2963`:
```
    const type = letAnnotationToCompatType(sig.successTypeSource);
```

`src/extension/invoke-callee-arity.ts:33-35`:
```
    const type = letAnnotationToCompatType(sig.successTypeSource);
    if (type !== undefined) {
      out ??= new Map();
```

Search: `grep -rn "letAnnotationToCompatType" src/ tests/` lists production
call sites at `type-layer-walk.ts:311` (the `let` case the comment names),
`theta-document.ts:2963`, and `invoke-callee-arity.ts:35` — three call sites,
not one.

## Why this is a problem
The comment states a factual count of call sites ("the ONLY call site") to
justify why widening `letAnnotationToCompatType`'s behaviour is safe to
reason about in isolation; the count is demonstrably false against the
current call graph, and the contradiction is visible from the sibling file's
own doc comment ("the second sanctioned … mint site"). A reader relying on
the annotation-compat.ts comment to judge the blast radius of a change to
this function undercounts by two call sites.

## Suggested direction (non-binding, optional)
Update the comment to name all sanctioned call sites (or point to a single
authoritative list) rather than asserting exclusivity that no longer holds.

## False-positive check
Ran `grep -rn "letAnnotationToCompatType" src/ tests/` to enumerate every
reference; confirmed two additional production callers beyond the one named
(`theta-document.ts:2963`, `invoke-callee-arity.ts:35`), each reached from a
non-test production function (`buildRuntimeToolSuccessTypes`,
`buildComposePassSuccessTypes`). The theta-document.ts comment at 2941-2947
independently corroborates that a second sanctioned site exists, so this is
not a misreading of test-only reachability.

## Triage
verdict: confirmed — excerpts verbatim at annotation-compat.ts:59-62, theta-document.ts:2942-2947/2963 and invoke-callee-arity.ts:35; my own grep across src/ extensions/ tools/ tests/ reproduces exactly three production call sites (type-layer-walk.ts:311, theta-document.ts:2963 in buildRuntimeToolSuccessTypes, invoke-callee-arity.ts:35 in buildComposePassSuccessTypes, plus one test caller), so "the ONLY call site … every other consumer keeps calling annotationToCompatType" is mechanically false — theta-document.ts:476-477 and :2946 themselves call theirs "the second sanctioned call site", and the same stale exclusivity recurs in the sibling comment at annotation-compat.ts:48-50 ("at the let annotation site alone") and type-layer-walk.ts:305-306; not a duplicate of resolved PTQ-0137, which fixed annotationToCompatType's consumer roster and explicitly recorded the letAnnotationToCompatType "ONLY caller" claim as accurate at the time (sole call, pre-RFC 0011) — the two runtime-tool sites landed later; frontmatter omits sites/fix_scope but that does not block evaluation (triage: claude-fable-5-1)
