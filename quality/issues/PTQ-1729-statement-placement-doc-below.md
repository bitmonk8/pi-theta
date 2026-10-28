---
id: PTQ-1729
title: runWholeDocumentChecks points below to the extracted statement-placement checker documentation.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:410-412
  - src/parser/theta-document.ts:103-103
  - src/parser/statement-placement.ts:30-42
  - src/parser/statement-placement.ts:63-67
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# runWholeDocumentChecks points below to the extracted statement-placement checker documentation.

## Observation
The whole-document checker orchestration tells readers to see `checkStatementPlacement`'s own doc block “below.” The checker is imported from `statement-placement.ts`, where its documentation and implementation now live. The call remains in the orchestration module, but the comment retains a local forward reference after the checker moved.

## Evidence
The forward reference, `src/parser/theta-document.ts:410-412`:

```ts
  // Bugs 0446/0447 §Fix Option 1 — see `checkStatementPlacement`'s own doc
  // block below.
  const statementPlacementDiags = checkStatementPlacement({ statements, tail: resolvedTail }, file);
```

The imported checker, `src/parser/theta-document.ts:103-103`:

```ts
import { checkStatementPlacement } from "./statement-placement";
```

The checker's own documentation now resides in `src/parser/statement-placement.ts:30-42`:

```ts
 * - `export … from` (bug 0446 §Fix Option 1, widening bug 0431's
 *   top-level-only `.theta` refusal to the same recursive reach a nested
 *   position needs):
 *   - `.theta` host: `theta/parse/export-in-theta` at ANY depth — top level
 *     included — reusing bug 0431's code/message/hint unchanged. A `.theta`
 *     file is never importable regardless of where the statement sits, so
 *     one code covers every depth.
 *   - `.thetalib` host: `theta/parse/export-not-top-level` at a NESTED
 *     position only. A `.thetalib` top-level export stays legal (imports.md
 *     §Re-exports); nothing is emitted there.
 * - `import … from` (bug 0447 §Fix Option 1, the import sibling): a NESTED
 *   position draws `theta/parse/import-not-top-level` in EITHER host — no
 *   host split, unlike the export form. A nested import is never resolved
```

Its definition, `src/parser/statement-placement.ts:63-67`:

```ts
export function checkStatementPlacement(block: Block, file: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const isThetaLib = file.endsWith(".thetalib");
  walkBlockForStatementPlacement(block, true, file, isThetaLib, diagnostics);
  return diagnostics;
```

Exact search: `grep -n 'checkStatementPlacement' src/parser/theta-document.ts` returns four hits: the import at 103, the forward-reference comment at 410, the call at 412, and another comment at 731 that already names `./statement-placement`. There is no local checker definition or its own doc block below the call.

## Why this is a problem
The orchestration comment has a dangling forward reference. It sends readers looking for the checker-specific rules later in the document module even though that documentation moved to a sibling module. This is stale extraction prose, not a concern about the live delegation.

## False-positive check
Read the document-module import, call, and later reference, and inspected the documentation and implementation in `statement-placement.ts`. Ran the exact search above to verify that no local definition remains. `git log --oneline -S 'function checkStatementPlacement' -- src/parser/theta-document.ts src/parser/statement-placement.ts` identifies `526562e2`; `git show 526562e2 -- src/parser/theta-document.ts` shows the checker and its documentation removed from the document module. No deadness claim is made about the checker or its call.

## Triage
verdict: confirmed — The four-hit search reproduces: theta-document.ts imports and calls the checker but has no local definition; its documentation lives in statement-placement.ts, and commit 526562e2 extracted it without updating “block below,” leaving a stale source-comment pointer distinct from the sibling “above” finding. (triage: claude-opus-5-5)
