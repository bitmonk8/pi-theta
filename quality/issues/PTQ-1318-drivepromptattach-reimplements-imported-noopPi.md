---
id: PTQ-1318
title: drivePromptAttach inlines the same sendMessage/getActiveTools/setActiveTools pi triple that this file's own noopPi() import already returns
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/prompt-value-harness.ts:186-190
  - tests/helpers/prompt-value-harness.ts:34
  - tests/helpers/prompt-value-harness.ts:51
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# drivePromptAttach inlines the same sendMessage/getActiveTools/setActiveTools pi triple that this file's own noopPi() import already returns

## Observation
`tests/helpers/prompt-value-harness.ts` imports `noopPi` from
`./call-with-clause-harness` and uses it once, inside `producer()`, as
`pi: noopPi()`. Further down the same file, `drivePromptAttach()` builds an
`ExtensionAPI` for its own `createProductionProducerDeps` call by retyping the
identical three-method object literal by hand instead of calling the already-
imported `noopPi()`.

## Evidence
`tests/helpers/prompt-value-harness.ts:34`:
```ts
import { noopPi } from "./call-with-clause-harness";
```

`tests/helpers/prompt-value-harness.ts:51` (`producer()`, using the import):
```ts
    pi: noopPi(),
```

`tests/helpers/prompt-value-harness.ts:186-190` (`drivePromptAttach()`,
retyping the same shape instead of calling the import):
```ts
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
```

`tests/helpers/call-with-clause-harness.ts:174-180` (the canonical helper the
inline literal duplicates, field-for-field and body-for-body):
```ts
export function noopPi(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}
```

## Why this is a problem
The three fields and their no-op bodies are identical between the inline
literal at line 186-190 and `noopPi()` at `call-with-clause-harness.ts:174-180`
(only the trailing `as unknown as ExtensionAPI` cast placement and explicit
return-type annotations on the arrow bodies differ). This is not merely two
files converging on the same shape (a pattern already tracked elsewhere as
PTQ-1008 for the cross-file `producer()` cases, which was resolved by wiring
both `producer()` exports to `noopPi()`) — it is the SAME file, already
importing `noopPi` and already using it four lines earlier, still hand-typing
the identical fixture a second time a hundred-odd lines later.

## Suggested direction (non-binding, optional)
`drivePromptAttach()`'s `pi:` field can reference the same already-imported
`noopPi()` its neighbour `producer()` uses.

## False-positive check
- Gate-pin check: `prompt-value-harness.ts` is not a `*gate*.test.ts` file or
  named gate kin; it is a `tests/helpers/` module.
- Recording-double check: the inline `pi` literal is an inert, no-op stand-in
  satisfying `createProductionProducerDeps`'s parameter shape for a positive
  execution path, not a recorder backing a MUST-NOT-be-called witness — the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "getActiveTools: () => \[\]" docs/bugs/` → 0 hits; no documented correct-reason red cites this literal.
- coverage-matrix/bug-doc citation search: `grep -n "drivePromptAttach\|prompt-value-harness" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test, only that the second inline literal reference the already-imported helper.
- Overlap check: `grep -rl "prompt-value-harness" quality/intake quality/resolved` surfaces PTQ-0862 (rootDouble/rootWith, a different field) and PTQ-1008 (the cross-file `pi` triple duplication between `prompt-value-harness.ts`'s `producer()` and `runtime-belt-probe-harness.ts`, already resolved — its own triage note records that `noopPi()` already existed at `call-with-clause-harness.ts:173-179` and that `producer()` should be wired to it, which the current code shows was done). Neither prior filing addresses this THIRD, still-unmigrated inline copy inside `drivePromptAttach()` in the same file that already imports and uses `noopPi()`; this is not a coverage claim — the cited site is live, exercised code.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `import { noopPi } from "./call-with-clause-harness"` is at tests/helpers/prompt-value-harness.ts:34, `pi: noopPi()` in producer() at :51, and the inline `pi: { sendMessage: () => {}, getActiveTools: () => [], setActiveTools: () => {} } as unknown as ExtensionAPI` in drivePromptAttach() at :186-190 all reproduce verbatim, as does `export function noopPi()` at call-with-clause-harness.ts:174-180 — the three members and no-op bodies are identical, differing only by return-type annotations, so swapping the literal for the already-imported `noopPi()` is a mechanical dedupe with no behaviour change (even the same PIC-17 explanatory comment is duplicated above both sites); drivePromptAttach is live (imported by 6 tests/ files), the file is a tests/helpers/ module (not gate kin), the `pi` is an inert positive-path stand-in (no recording-double carve-out), and the stated searches reproduce (docs/bugs `getActiveTools: () => \[\]` → 0, coverage-matrix `drivePromptAttach|prompt-value-harness` → 0); dedupe: PTQ-1008 (fixed) scoped itself to this file's producer() at then-:39-43 plus runtime-belt-probe-harness's two copies and its fix is what created the :34 import — it never cited drivePromptAttach; PTQ-0862 (root field), PTQ-0687 (the drivePromptAttach driver being triplicated in test files, now consolidated into this helper), and PTQ-0482/0986/1017 (subagent-fn-child-regime's separate noopPi) name different root causes, and no quality/issues or resolved row names this file's drivePromptAttach `pi` literal; `sites: 1` is honest for the same-file import-already-present anchor (triage: claude-fable-5-1)
