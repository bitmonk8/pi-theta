---
id: PTQ-1727
title: classifyInlineObjectEntry still locates projectRenderedParamType below lowerParamsFieldType in the lowering file.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/params-lowering.ts:662-671
  - src/parser/params-render.ts:1-10
  - src/parser/params-render.ts:103-110
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# classifyInlineObjectEntry still locates projectRenderedParamType below lowerParamsFieldType in the lowering file.

## Observation
The classifier’s header describes `projectRenderedParamType` as being below `lowerParamsFieldType`. The projection function is now implemented in `params-render.ts`, whose header states that ownership and whose import still consumes the classifier. The reference describes the former co-location rather than the current source location.

## Evidence
`src/parser/params-lowering.ts:662-671`:

```ts
/**
 * Classify one already-top-level-split inline-object entry as its
 * `{fieldName, fieldType}` pair, or `undefined` for exactly the shapes
 * `hoistInlineObjectType` (below) has always `continue`d over: no top-level
 * `:` (bug 0238's tolerated junk segment, `topLevelColon` returning `-1`), or
 * a colon whose name or type half trims empty. `hoistInlineObjectType` and
 * `projectRenderedParamType` (bug 0251 §Fix, below `lowerParamsFieldType`)
 * both call this rather than each keeping its own copy of the accept/reject
 * decision, so the rendered `Parameters:` line can never drop a different
 * entry set than the schema the same group lowers to.
```

`src/parser/params-render.ts:1-10`:

```ts
// V6b — the render-side projection of a `params:` field's declared type.
//
// This module owns `projectRenderedParamType` (bug 0251 §Fix): projecting a
// `params:` field's declared surface type to what the field's lowering
// (`lowerParamsFieldType`, params-lowering.ts) actually encoded, for the
// binder system prompt's `Parameters:` line. It mirrors
// `lowerParamsFieldType`'s own dispatch order and reuses the lowering
// family's own accept/reject decisions, so rendering and contract can never
// diverge.
import { classifyInlineObjectEntry, lowerLiteralSublanguage } from "./params-lowering";
```

`src/parser/params-render.ts:103-110`:

```ts
export function projectRenderedParamType(source: string): string {
  const s = source.trim();
  if (lowerLiteralSublanguage(s) !== undefined) {
    return source;
  }
  if (isSingleEnclosingBraceGroup(s)) {
    const projected = projectBraceGroup(s);
    return projected === s ? source : projected;
```

The exact search `rg -n 'projectRenderedParamType' src/parser/params-lowering.ts src/parser/params-render.ts` returns four hits: the stale comment at `params-lowering.ts:668` and the header, recursive call, and declaration at `params-render.ts:3`, `:49`, and `:103`.

## Why this is a problem
This is a stale cross-function locator after the rendering/lowering split. The collaborator itself remains live; the mismatch is the header’s instruction to find it below another function in the lowering module.

## False-positive check
Ran the exact symbol search recorded above and inspected the projection module's import and implementation. `git log -4 --oneline -- src/parser/params-lowering.ts` identifies extraction commit `bf57e617`; `git show bf57e617 --stat` shows both lowering and rendering files created. `git show bf57e617:src/parser/params-lowering.ts` retains the “below” locator, while `git show bf57e617:src/parser/params-render.ts` declares the function at line 103. PTQ-1259 concerns projection seams, not this locator; PTQ-1246 concerns different type-text helper locators. No export-removal, wrapper-removal, or deadness claim is made.

## Triage
verdict: confirmed — All excerpts and the four-hit symbol search reproduce; params-lowering.ts:668 still says projection is below lowerParamsFieldType, but the declaration is in params-render.ts:103. Commit bf57e617 extracted the two modules while retaining the formerly accurate locator (verified against its parent). This is production-comment cruft, not a naming or design complaint; PTQ-1246 covers different type-text-split locators and PTQ-1259 the extraction, with no duplicate found. (triage: claude-opus-5-5)
