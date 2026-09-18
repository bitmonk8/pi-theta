---
id: PTQ-0964
title: watcher-hot-reload-integration.test.ts redeclares the waitFor poll helper already exported by the fake-file-watcher module it imports from
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/watcher-hot-reload-integration.test.ts:68-74
  - tests/helpers/fake-file-watcher.ts:108-114
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# watcher-hot-reload-integration.test.ts redeclares the waitFor poll helper already exported by the fake-file-watcher module it imports from

## Observation
tests/watcher-hot-reload-integration.test.ts declares a module-scope `async
function waitFor(cond, label)` that polls `cond()` up to 400 times, 5ms
apart, returning as soon as it is true, or throwing `timeout waiting for
${label}` once the bound is exhausted. `tests/helpers/fake-file-watcher.ts`
already exports a function of the identical name, signature, loop bound,
sleep interval, and throw message, byte-for-byte. The test file already
imports `FakeFileWatcher` from that exact module (`./helpers/fake-file-watcher`)
two lines below its own import block, but does not import `waitFor` from it.

## Evidence

tests/watcher-hot-reload-integration.test.ts:17 (the existing import of the
same module, for a different symbol):
```ts
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
```

tests/watcher-hot-reload-integration.test.ts:68-74 (re-read immediately
before filing):
```ts
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}
```

tests/helpers/fake-file-watcher.ts:108-114 (the canonical export, re-read
immediately before filing — byte-identical body apart from `export`):
```ts
export async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}
```

Exact search, repo-wide: `grep -rn "^async function waitFor\b\|^export async
function waitFor\b" tests/*.ts tests/helpers/*.ts` → 5 hits: the canonical
export at tests/helpers/fake-file-watcher.ts:108, this file's local copy at
:68, and three further local copies outside this review's scope
(tests/b0378-watch-root-case-variant-double-arming.test.ts:251,
tests/hot-reload-stale-ctx-replacement.test.ts:282 — which also already
imports `FakeFileWatcher` from the same module at its own line 75 — and
tests/quality-loop-empty-tail-return-validation.test.ts:235, whose signature
differs (generic `<T>`, a `budgetMs` parameter) and is not part of this
byte-identical group). The three byte-identical local copies
(tools-entry file in scope plus the two named outside it) share the exact
400×5ms bound and throw message with the canonical export.

## Why this is a problem
`tests/helpers/fake-file-watcher.ts` already exports this exact polling
function under the same name, and this file already opens that module for
`FakeFileWatcher`, so the shared helper is one import away rather than a
fresh declaration. A change to the poll bound or the timeout wording (e.g.
naming the condition differently in the thrown error) has to be applied to
this file's copy independently of the canonical export's, with nothing
tying the two together once they diverge.

## Suggested direction (non-binding, optional)
Adding `waitFor` to this file's existing `import { FakeFileWatcher } from
"./helpers/fake-file-watcher"` line and deleting the local declaration is the
shape the module's own export already offers.

## False-positive check
- Gate-pin check: tests/watcher-hot-reload-integration.test.ts is not a
  `*gate*.test.ts` file or a named kin; the cited lines are a bounded-poll
  utility, not a pinned count or inventory assertion.
- Recording-double check: `waitFor` polls a caller-supplied boolean
  condition; it is not a call-recording double and backs no "never called"
  witness.
- docs/bugs/ signature search: `grep -rl "watcher-hot-reload-integration"
  docs/bugs/*.md` → 0 hits; no documented correct-reason-red cites this file
  or names this helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "watcher-hot-reload-integration" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any `describe()`/`it()` — only that the local `waitFor` declaration could
  be replaced by the import the module already offers.
- Prior-finding overlap check: `grep -rli "watcher-hot-reload-integration"
  quality/issues/*.md quality/resolved/*.md quality/intake/*.md` → 0 hits.
  PTQ-0388 (fixed) and PTQ-0897 (open) cover the sibling `settle`/`norm`
  duplication in tests/b0339-package-source-watch-arming.test.ts and
  tests/b0312-out-of-root-thetalib-watch-closure.test.ts respectively —
  neither names tests/watcher-hot-reload-integration.test.ts or its `waitFor`
  copy, so this is a distinct site for the same duplicated-canonical-export
  root cause, not a re-file of either.
- Coverage-drift check: the claim is about a repeated function DEFINITION
  this file's own `it()` bodies already call via `fireReloadAndSettle` and
  direct `waitFor` calls; no claim that any watcher/reload path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce at watcher-hot-reload-integration:68-74 and fake-file-watcher:108-114 and a mktemp `diff` of the two bodies (export keyword stripped) is empty; the local copy is live (called at :116/:154/:188/:251 incl. via fireReloadAndSettle) and the file already imports FakeFileWatcher from the same module at :17, so the fix is a one-line import swap; git shows the local copy (df8c1980, 2026-07) predates the export (11820751, 2026-09) — a not-migrated residual; the b0378:251 and hot-reload-stale-ctx:282 copies also diff empty against the export (fold them at acceptance); three of the candidate's stated searches do not reproduce as written but none refutes the root cause — the declaration grep returns 6 hits not 5 (also b0409-omitted-defaulted-binds-default.test.ts:171, a generic <T>/budgetMs variant outside the byte-identical group), `grep -rl` over docs/bugs returns 5 files (0021/0310/0311/0470/0471) not 0 but these are witness citations of the file's it() cells and the filing proposes no merge/rename/delete so no carve-out applies, and the quality/ filename grep returns 5 resolved hits not 0 (PTQ-0630 covers this file's former :72-104 makeHarness, PTQ-0530's triage note names this file only as the diverged ancestor EXCLUDED from its b0311↔b0312 pair) — PTQ-0236/0388/0897 cover b0310/b0339/b0312's waitFor/settle, none cites this file, so distinct site, not a duplicate; coverage-matrix 0 hits; D7 boilerplate-duplication inside tests/, not a gate file or recording double (triage: claude-fable-5-1)
