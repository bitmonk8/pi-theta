---
id: pending
title: "FreePhaseTurn's `text` field cites provider-error-mapping.ts:358 for its `rawResponse?` twin, but that file is only 265 lines long"
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/query-tool-loop.ts:99-105
  - src/binder/provider-error-mapping.ts:1-265
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# FreePhaseTurn's `text` field cites provider-error-mapping.ts:358 for its `rawResponse?` twin, but that file is only 265 lines long

## Observation
The `tool_use` arm of `FreePhaseTurn`'s optional `text` field carries a
comment justifying its optionality by pointing at a sibling field in
`provider-error-mapping.ts`, anchored `provider-error-mapping.ts:358`.
`src/binder/provider-error-mapping.ts` is currently 265 lines long in total,
so line 358 does not exist in the file.

## Evidence
`src/runtime/query-tool-loop.ts:99-105`:
```ts
export type FreePhaseTurn =
  | {
      readonly kind: "tool_use";
      readonly batch: readonly ToolCallRequest[];
      // ERR-19's biconditional (queryerror-variants.md:151/:211):
      // `raw_response` carries the text the model emitted alongside a
      // terminating tool-use block, `null` on a pure tool-use turn. Optional
      // (mirrors provider-error-mapping.ts:358 `rawResponse?: string | null`)
      // because a driver surfaces it "when available" — the loop only reads
      // this member off the LAST consumed tool_use turn, at exhaustion.
      readonly text?: string | null;
    }
```

`wc -l src/binder/provider-error-mapping.ts` → `265`, confirming line 358 is
past end-of-file.

The `rawResponse?: string | null` field the comment describes is currently at
`src/binder/provider-error-mapping.ts:224`:
```ts
  /** The final malformed assistant text for `raw_response`, when available. */
  readonly rawResponse?: string | null;
```

## Why this is a problem
The citation's job is to let a reader jump to the `provider-error-mapping.ts`
declaration this field's optionality is said to mirror. Line 358 is past the
end of the 265-line file, so following it lands nowhere — the cited file has
shrunk since the comment was written and the line number was never
refreshed. The field itself (`rawResponse?: string | null`) still exists, just
134 lines earlier than cited.

## Suggested direction (non-binding, optional)
Update the citation to the current line (224), or drop the raw line number in
favour of a symbol reference that survives future edits to the cited file.

## False-positive check
- `wc -l src/binder/provider-error-mapping.ts` → 265 lines total; line 358 is
  beyond end-of-file.
- `grep -n "rawResponse?: string | null" src/binder/provider-error-mapping.ts`
  → single hit at line 224, confirming the field the comment describes still
  exists, just at a different line than cited.
- `git log --oneline -- src/binder/provider-error-mapping.ts` shows the file
  was rewritten after this comment was likely written
  (`1ec8b63f quality: qw20260917154546 fix d9/src__binder__provider-error-mapping.ts`),
  the same drift mechanism a sibling finding on a different citation into the
  same file documents (see the already-filed
  `provider-error-mapping-citation-beyond-eof` finding on
  `production-theta-producer.ts`, a distinct citation site into the same
  now-shrunk file).

## Triage
<!-- triage appends its note below this line -->
