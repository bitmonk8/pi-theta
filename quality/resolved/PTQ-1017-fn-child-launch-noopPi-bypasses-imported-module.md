---
id: PTQ-1017
title: subagent-fn-child-launch.test.ts retypes noopPi instead of importing it from the module it already imports three siblings from
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-fn-child-launch.test.ts:99-101
  - tests/helpers/subagent-fn-child-regime.ts:172-174
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-fn-child-launch.test.ts retypes noopPi instead of importing it from the module it already imports three siblings from

## Observation
`tests/subagent-fn-child-launch.test.ts` imports `childRegimeRootDouble`, `driveSubagentFnEntry`, and `RecordingBus` from `./helpers/subagent-fn-child-regime` (line 33). That same module exports `noopPi(): ExtensionAPI` with the identical body this test file's own local `noopPi()` declares, character-for-character.

## Evidence

`tests/subagent-fn-child-launch.test.ts:99-101` (re-read immediately before filing):
```ts
function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}
```

`tests/helpers/subagent-fn-child-regime.ts:172-174` — the exported version from the module this file already imports three other names from:
```ts
export function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}
```

The two function bodies are byte-identical (same return type, same single expression, same cast).

## Why this is a problem
The import statement at line 33 shows the file already depends on `tests/helpers/subagent-fn-child-regime.ts` for three exports from this exact fixture family, one of which (`childRegimeRootDouble`) is declared 73 lines below `noopPi` in that same module. `noopPi` was retyped locally instead of being added to that same import list. A change to the `ExtensionAPI` no-op shape this double stands in for (e.g. a new tool-surface member the fake must also expose) is applied to the helper's export but not to this file's local copy unless both are hand-synchronised.

## Suggested direction (non-binding, optional)
Adding `noopPi` to the existing `./helpers/subagent-fn-child-regime` import list in place of the local declaration is the direction the file's own import of three siblings from the same module already points toward.

## False-positive check
- Gate-pin check: `subagent-fn-child-launch.test.ts` does not match `*gate*.test.ts` or a named gate kin; the cited lines are a fixture-double declaration, not a pinned count or inventory assertion.
- Recording-double check: `noopPi` is a pure inert stand-in (no recorded calls, no "never called" witness); it backs the file's positive `bindPromptConversation`/`executeBody` drives. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "noopPi" docs/bugs/` → 0 hits; no documented correct-reason red cites this function.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-fn-child-launch.test.ts" docs/reference/coverage-matrix.md` → 0 hits; `grep -rn "subagent-fn-child-launch.test.ts" docs/bugs/0479-frontmatter-model-ignored-session-model-drives-every-turn.md` cites this file only as a witness for the FN-7 model-collision tests, not for this fixture declaration. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block — only that the local double could be imported from the already-depended-on module.
- Coverage-drift check: the claim is about a repeated fixture-double DEFINITION inside an existing, passing test file; it makes no claim that any behaviour or path is untested.
- Prior-filing search: resolved `PTQ-0482` (a differently-shaped `noopPi`/`subagentTheta(tail)`/`childCtx` quartet duplicated between `tests/subagent-root-drive-wiring.test.ts` and `tests/subagent-visible-regime.test.ts`) notes, in its own triage FP-check, that `subagent-fn-child-launch.test.ts:107`(then) carries "a byte-identical `noopPi` copy" as an undercount observation on THAT filing — but that note was never itself filed as a finding against this file, and PTQ-0482's accepted scope is the other two files' quartet, not this file's bypass of its own already-imported module.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: the import of `childRegimeRootDouble, driveSubagentFnEntry, RecordingBus` from `./helpers/subagent-fn-child-regime` is at tests/subagent-fn-child-launch.test.ts:44 (the filing's "line 33" is a drift; the content matches), the local `function noopPi()` at :99-101 and the helper's `export function noopPi()` at tests/helpers/subagent-fn-child-regime.ts:172-174 reproduce verbatim and a mktemp diff (export keyword stripped) is empty; the local copy is live (7 `pi: noopPi()` call sites at :146/310/337/438/457/473/488) and the helper export is live (imported by subagent-root-drive-wiring and subagent-visible-regime), so swapping to the import is a mechanical dedupe with no behaviour change; git lineage explains the residue — the local copy landed 89faa7c5 (2026-09-15) and the helper export was minted 0ff0ccb3 (2026-09-18, the PTQ-0482 fix) without migrating this file; the stated searches reproduce (docs/bugs `noopPi` → 0, coverage-matrix → 0, bug 0479:186 cites the file only as an FN-7 witness), the file is not gate kin, no recording-double or red-test carve-out applies, no merge/rename/delete is proposed, and the suite passes 20/20 at HEAD; dedupe: PTQ-0482 (fixed) only noted this copy as an undercount aside, same-wave sibling d7-01 (confirmed) covers production-subagent-query-model.test.ts's identical residue and its triage explicitly scoped this file out, and no quality/issues or resolved row cites this file's `noopPi`; `sites: 1` is honest for the per-file import-already-present anchor (subagent-model-theta-tool.test.ts:235 carries a differently-shaped copy without `getAllTools` and imports nothing from the helper) (triage: claude-fable-5-1)
