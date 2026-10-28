---
id: PTQ-1718
title: TypeNode documentation points below to helpers extracted into type-walk.ts.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/type-grammar.ts:237-242
  - src/parser/type-grammar.ts:345-349
  - src/parser/type-grammar.ts:112-114
  - src/parser/type-walk.ts:100-107
  - src/parser/type-walk.ts:260-268
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# TypeNode documentation points below to helpers extracted into type-walk.ts.

## Observation
Two comments on `TypeNode` in `type-grammar.ts` direct readers below to `walkType` and `inlineObjectFieldKeys`. Both function declarations live in `type-walk.ts`, and `type-grammar.ts` imports and re-exports `walkType`. These same-file pointers survived the extraction of the diagnostic walker.

## Evidence

`src/parser/type-grammar.ts:237-242`:
```ts
       * `fieldNames` is NOT `theta/parse/duplicate-inline-field-name`'s key.
       * That rule (`walkType`'s `object` arm, below) compares the entries
       * `interiorSource` (below) splits into — the same tokenisation
       * `hoistInlineObjectType` (params.ts) and `lowerInlineObject`
       * (body-type-lowering.ts) key their `properties` / `required` writes on,
       * so the rule agrees with what is lowered BY CONSTRUCTION rather than by
```
The stale pointer here is to `walkType`'s arm, not the separate reference to the `interiorSource` field.

`src/parser/type-grammar.ts:345-349`:
```ts
       * is the author's spelling. `theta/parse/duplicate-inline-field-name` derives its comparison key
       * from this field alone (`inlineObjectFieldKeys`, below):
       * `splitTopLevel(interiorSource, ",", "angle-and-brace")` (`./params`),
       * keyed on each entry's raw pre-colon text (`topLevelColon`, `./params`)
       * after `trim()` — no unquoting, no normalisation.
```

Current module boundary, `src/parser/type-grammar.ts:112-114`:
```ts
import { walkType } from "./type-walk";

export { GENERIC_ARITY, walkType } from "./type-walk";
```

Current declarations, `src/parser/type-walk.ts:100-107`:
```ts
function inlineObjectFieldKeys(interiorSource: string): string[] {
  const keys: string[] = [];
  for (const entry of splitTopLevel(interiorSource, ",", "angle-and-brace")) {
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const key = entry.slice(0, colon).trim();
```

`src/parser/type-walk.ts:260-268`:
```ts
function walkType(
  node: TypeNode,
  isRoot: boolean,
  position: TypePosition,
  rules: TypeCheckRules,
  site: TypeCheckSite,
  out: Diagnostic[],
): void {
  switch (node.kind) {
```

## Why this is a problem
Under the simplicity-and-cruft principle, positional references to code no longer present in the file are extraction residue. Neither pointer can locate its target below the comment in `type-grammar.ts`; the import already establishes that the walker lives elsewhere. This is a source-comment locator mismatch, not an objection to the extraction or the live checks.

## Suggested direction (non-binding, optional)
Make these helper locators describe their current module rather than their former same-file position.

## False-positive check
- Ran `rg -n '\b(walkType|inlineObjectFieldKeys)\b' src/parser/type-grammar.ts src/parser/type-walk.ts`: 28 matching lines. Ran `rg -n '^function (walkType|inlineObjectFieldKeys)\(' src/parser/type-grammar.ts src/parser/type-walk.ts`: two matching lines, both declarations in `type-walk.ts`, at 100 and 260. The former module has imports, uses, and comments, not local definitions of these helpers.
- Ran `git log -3 --oneline -S 'function walkType(' -- src/parser/type-grammar.ts src/parser/type-walk.ts` and `git show --format=short --stat 768c1edd`: `768c1edd` extracted the walker into `type-walk.ts`. Ran `git show 768c1edd^:src/parser/type-grammar.ts | grep -nE 'function (walkType|inlineObjectFieldKeys)\(|arm, below|Keys`, below'`: before that extraction the pointers were at 291 and 399 and the declarations were below them at 1333 and 1493.
- PTQ-1095 concerns the header's diagnostic roster, not these `TypeNode` locators. PTQ-1246 concerns different pointers in `type-text-split.ts`. This report makes no deadness or unused-export claim; tests and dynamic access cannot make the referenced declarations local to this file.

## Triage
verdict: confirmed — both stale “below” locators reproduce at type-grammar.ts:238/:346, while the only helper declarations are in type-walk.ts:100/:260; all excerpts and the 28-hit reference search reproduce, and commit 768c1edd moved the helpers without retargeting these comments; this is mechanical D2 extraction residue, distinct from PTQ-1095’s header roster and PTQ-1246’s type-text-split.ts pointers, with no matching tracked finding found (triage: claude-opus-5-5)
