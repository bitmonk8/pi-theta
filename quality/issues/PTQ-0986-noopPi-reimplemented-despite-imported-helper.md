---
id: PTQ-0986
title: production-subagent-query-model.test.ts redeclares noopPi() locally though it already imports the identical export from subagent-fn-child-regime.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-subagent-query-model.test.ts:29
  - tests/production-subagent-query-model.test.ts:62-64
  - tests/helpers/subagent-fn-child-regime.ts:172-174
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-subagent-query-model.test.ts redeclares noopPi() locally though it already imports the identical export from subagent-fn-child-regime.ts

## Observation
`tests/production-subagent-query-model.test.ts` imports `bindInput` from
`./helpers/subagent-fn-child-regime` (line 29), but declares its own
module-scope `noopPi(): ExtensionAPI` function (lines 62-64) rather than
importing the `noopPi` the same helper module already exports (line 172-174
of `subagent-fn-child-regime.ts`). The two function bodies are byte-identical.

## Evidence

`tests/production-subagent-query-model.test.ts:29` (the existing import from the same module):
```ts
import { bindInput } from "./helpers/subagent-fn-child-regime";
```

`tests/production-subagent-query-model.test.ts:62-64` (the local redeclaration):
```ts
function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}
```

`tests/helpers/subagent-fn-child-regime.ts:172-174` (the exported original,
already reachable via the import on line 29's module):
```ts
export function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}
```

Exact search: `grep -n "^function noopPi\|^export function noopPi" tests/production-subagent-query-model.test.ts tests/helpers/subagent-fn-child-regime.ts` returns exactly these two declarations, one per file, with identical bodies.

## Why this is a problem
The in-scope file's own import statement (line 29) already opens
`./helpers/subagent-fn-child-regime`, the module that exports this exact
`noopPi` under the same name. Redeclaring it locally instead of adding it to
the existing import is not an instance of independent convergent design —
the module boundary is already crossed for a sibling export in the same
harness family (`bindInput`), so the friction the Copy-paste-fixture class
targets is absent here: nothing stood between this file and importing the
one it needed.

## Suggested direction (non-binding, optional)
Add `noopPi` to the existing `import { bindInput } from
"./helpers/subagent-fn-child-regime"` line and delete the local declaration.

## False-positive check
- Gate-pin carve-out: the file does not match `*gate*.test.ts` or a named gate
  kin; the cited lines are a fixture-double declaration, not a pinned count
  or inventory assertion.
- Recording-double carve-out: `noopPi()` returns an inert `ExtensionAPI`
  stub (a no-op `sendMessage`, an empty `getAllTools`), not a recording
  double backing a "never called" MUST-NOT witness; the carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "noopPi" docs/bugs/*.md` → 0 hits;
  no documented correct-reason red names this function.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-subagent-query-model" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` block, and does not touch any RED-pin or drive
  assertion in the file — only where the identical `noopPi` fixture is
  declared.
- Coverage check: the claim is about a duplicated fixture-function
  DEFINITION already reachable through an existing import in the same file;
  every test in the file exercises its own copy successfully at HEAD.
- Prior-filing search: `grep -rl "noopPi" quality/issues quality/intake
  quality/resolved` hits many results, but none names
  `production-subagent-query-model.test.ts` importing
  `subagent-fn-child-regime.ts` and re-declaring its export locally
  (the closest, resolved PTQ-0482, tracks a different four-function quartet
  shared between `subagent-root-drive-wiring.test.ts` and
  `subagent-visible-regime.test.ts`, and its own triage note observes — as an
  aside, not as its own filing — that `production-subagent-query-model.test.ts`
  and `subagent-fn-child-launch.test.ts` also carry a byte-identical `noopPi`,
  without citing the import-already-present angle this finding rests on).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `import { bindInput } from "./helpers/subagent-fn-child-regime"` is at tests/production-subagent-query-model.test.ts:29, the local `function noopPi()` at :62-64 and the helper's `export function noopPi()` at tests/helpers/subagent-fn-child-regime.ts:172-174 reproduce verbatim and a mktemp diff (export keyword stripped) shows the bodies byte-identical; the local copy has exactly one live caller (`pi: noopPi()` at :71), so swapping to the import is a mechanical dedupe; the stated searches reproduce (declaration grep → exactly the two cited lines; docs/bugs `noopPi` → 0; coverage-matrix → 0), the file is not a gate and passes 5/5 at HEAD; dedupe: PTQ-0482 (fixed) covered root-drive-wiring/visible-regime and only noted this file's copy as an aside, PTQ-0932 (fixed, commit 0da4cad7) migrated this file's `subagentTheta`/`bindInput` to the helper — which is what created the line-29 import — but left `noopPi` behind, and same-wave sibling d7-05 targets a different symbol (`RecordingCheckpoint`), so this residue is untracked; note the wider suite still carries 6 other `noopPi` declarations (3 helper-hosted, differently shaped, and byte-identical copies in subagent-fn-child-launch.test.ts:99 / subagent-model-theta-tool.test.ts:235) that this `sites: 1` filing correctly scopes out since its anchor is the import-already-present angle (triage: claude-fable-5-1)
