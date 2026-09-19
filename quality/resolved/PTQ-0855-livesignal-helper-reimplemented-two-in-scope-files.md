---
id: PTQ-0855
title: tool-calls-execute-lowering.test.ts and tool-calls-off-surface-live-wiring.test.ts each redeclare liveSignal() despite two existing exported equivalents under tests/helpers/
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tool-calls-execute-lowering.test.ts:47-50
  - tests/tool-calls-off-surface-live-wiring.test.ts:50-53
  - tests/helpers/typed-query-harness.ts:25-27
  - tests/helpers/scripted-typed-query-harness.ts:42-44
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tool-calls-execute-lowering.test.ts and tool-calls-off-surface-live-wiring.test.ts each redeclare liveSignal() despite two existing exported equivalents under tests/helpers/

## Observation
Both tests/tool-calls-execute-lowering.test.ts and
tests/tool-calls-off-surface-live-wiring.test.ts — sibling files in this
review's scope — declare a local, byte-identical `liveSignal(): AbortSignal`
function returning `new AbortController().signal`, each preceded by its own
one-line doc comment. Two modules under tests/helpers/ already export a
function of the same name and identical one-line body:
tests/helpers/typed-query-harness.ts and
tests/helpers/scripted-typed-query-harness.ts.

## Evidence
tests/tool-calls-execute-lowering.test.ts:47-50:
```ts
/** A never-aborted signal for the checkpoint-presence and value arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

tests/tool-calls-off-surface-live-wiring.test.ts:50-53:
```ts
/** A never-aborted signal for the settled / value arms. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

tests/helpers/typed-query-harness.ts:25-27 (already exported):
```ts
export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

tests/helpers/scripted-typed-query-harness.ts:42-44 (already exported,
byte-identical body):
```ts
export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

Exact search: `grep -n "function liveSignal" tests/*.test.ts
tests/helpers/*.ts` → 15 hits total; of these, exactly the two files cited
above sit inside this review's five-file scope, and both bodies match the two
`tests/helpers/` exports character-for-character.

## Why this is a problem
The one-line `liveSignal()` body — `new AbortController().signal` returned to
stand in for a signal that never fires — is already exported from two
separate tests/helpers/ modules, and both in-scope files re-type the same
function under the same name and the same one-statement body rather than
importing either existing export. Neither in-scope file's local copy adds any
file-specific behaviour beyond the doc comment wording.

## Suggested direction (non-binding, optional)
Importing `liveSignal` from tests/helpers/typed-query-harness.ts (already the
export tests/helpers/typed-query-harness.ts itself re-exports
`SEAM_NOOP_CHECKPOINT` from, so the two in-scope files' broader seam imports
already point at a compatible helper cluster) is the natural fit for both
sites.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or a named gate
  kin; not applicable — no pinned count or inventory is involved.
- Recording-double carve-out: `liveSignal()` is a plain value constructor,
  not a recording double backing a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -rl "liveSignal" docs/bugs/` → 0 hits;
  no documented correct-reason-red names this function.
- coverage-matrix/bug-doc citation search: `grep -n
  "tool-calls-execute-lowering\|tool-calls-off-surface-live-wiring"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` block, only that the
  two local functions could import an already-exported equivalent.
- Coverage-drift check: this finding is about scaffolding already present in
  two passing test files; it makes no claim that any behaviour or path is
  untested. Note: the wider repository carries at least 13 further
  file-local `liveSignal()` re-declarations outside this review's scope
  (routing note only, not filed here).

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines (tests/tool-calls-execute-lowering.test.ts:47-50, tests/tool-calls-off-surface-live-wiring.test.ts:50-53, tests/helpers/typed-query-harness.ts:25-27, tests/helpers/scripted-typed-query-harness.ts:42-44) and a scratch sed-extract diff of the three bodies after stripping `export` is empty; both local copies are live (5 and 7 `liveSignal()` call sites respectively) and neither file imports the helper export (the typed-query-harness export is consumed by 6 other test files, so it is a real canonical); stated searches reproduce (`function liveSignal` → 15 hits; docs/bugs/ `liveSignal` → 0; coverage-matrix cite of either file → 0); both locations under tests/, D7 copy-paste-fixture class, no gate/recording-double/red-test carve-out applies; PTQ-0492/0511/0690 cite these files for different helpers (RecordingCheckpoint, SpyCompensator, cancellation-race wrapper) and PTQ-0574 / sibling d7-02-scripted concern the typed-query substrate and the helper-to-helper mirror, not these two sites — fix is a mechanical import swap (triage: claude-fable-5-1)
