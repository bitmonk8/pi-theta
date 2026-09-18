---
id: PTQ-1007
title: production-subagent-query-model.test.ts's RecordingCheckpoint reimplements the already-imported helper's NoopCheckpoint under a misleading name
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-subagent-query-model.test.ts:29
  - tests/production-subagent-query-model.test.ts:40-44
  - tests/helpers/subagent-fn-child-regime.ts:152-156
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-subagent-query-model.test.ts's RecordingCheckpoint reimplements the already-imported helper's NoopCheckpoint under a misleading name

## Observation
`tests/production-subagent-query-model.test.ts` declares a module-scope
`class RecordingCheckpoint implements Checkpoint` whose `before` method takes
underscore-prefixed (unused) `_kind`/`_site` parameters and does nothing but
`return Promise.resolve()` — it records no kind, no site, and exposes no
field any cell in the file reads back. `tests/helpers/subagent-fn-child-regime.ts`
— the same helper module this file already imports `bindInput` from (line
29) — exports a class with the byte-identical body under the honest name
`NoopCheckpoint`.

## Evidence

`tests/production-subagent-query-model.test.ts:29` (the existing import from
the same helper module):
```ts
import { bindInput } from "./helpers/subagent-fn-child-regime";
```

`tests/production-subagent-query-model.test.ts:40-44`:
```ts
class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}
```

`tests/helpers/subagent-fn-child-regime.ts:152-156` (the exported original,
byte-identical body, honestly named, already reachable via the import on
line 29's module):
```ts
export class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}
```

Search: `grep -n "RecordingCheckpoint\|checkpoint" tests/production-subagent-query-model.test.ts` shows exactly three lines total in the file: the class declaration (line 40), and its single use at `checkpoint: new RecordingCheckpoint()` (line 48, inside `rootDouble()`) — no field of the class is ever read, and no cell in the file asserts on any recorded kind or site.

## Why this is a problem
The class's name promises a recording double — the same convention seven
other files in this suite use for a `Checkpoint` implementation that
captures fired `kind`/`site` pairs for later assertion (resolved PTQ-0492) —
but this body records nothing: both parameters are underscore-discarded and
the method is a bare `Promise.resolve()`. A reader following the name into
this file, expecting to find a `kinds`/`sites` array asserted somewhere, finds
neither; the class is functionally identical to the `NoopCheckpoint` the file
already has import access to under its own, accurately-named export in
`subagent-fn-child-regime.ts` — the same module this file opens for
`bindInput` two lines above. Reimplementing an available, honestly-named
double under a name that claims a capability the copy does not have is both
the Copy-paste-fixture class (a fake re-implemented where a canonical helper
already exists and is already imported) and a name that would mislead a
reader auditing what this file's checkpoint double actually captures.

## Suggested direction (non-binding, optional)
Add `NoopCheckpoint` to the existing `import { bindInput } from
"./helpers/subagent-fn-child-regime"` line, delete the local
`RecordingCheckpoint` class, and use `new NoopCheckpoint()` at the one call
site — matching the name to the behaviour and removing the local copy.

## False-positive check
- Gate-pin carve-out: the file does not match `*gate*.test.ts` or a named
  gate kin; the cited lines are a fixture-double declaration, not a pinned
  count or inventory assertion.
- Recording-double carve-out: the carve-out exempts a recording double's
  NEGATIVE-witness ASSERTION ("never called") from being filed as
  unfalsifiable; it does not apply here because this class records nothing
  and backs no assertion at all — there is no negative witness to exempt.
- docs/bugs/ signature search: `grep -rl "RecordingCheckpoint"
  docs/bugs/*.md` → 0 hits; no documented correct-reason red names this
  class or explains why this file's copy performs no recording.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-subagent-query-model" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` block, and touches none of the file's PIC-59/PIC-66
  drive assertions — only where the (non-recording) checkpoint double is
  declared and named.
- Prior-filing search: `grep -rl "RecordingCheckpoint" quality/issues
  quality/intake quality/resolved` hits resolved PTQ-0492, which tracks a
  DIFFERENT, ACTUALLY-recording `RecordingCheckpoint` shape (kinds/sites
  arrays pushed to and later asserted) across seven other files; that
  ticket's own "Coverage-drift check" note explicitly distinguishes it from
  PTQ-0403's no-op double family. Neither ticket cites
  `production-subagent-query-model.test.ts`, and neither observes that this
  file's copy — despite being named for the recording shape — has the
  no-op body instead.
- Coverage check: the claim is about a duplicated, misleadingly-named
  fixture-class DEFINITION already reachable through an existing import in
  the same file; every test in the file passes at HEAD using the no-op
  behaviour it actually needs.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the helper import is at tests/production-subagent-query-model.test.ts:29, the local `class RecordingCheckpoint` at :40-44 and the helper's `export class NoopCheckpoint` at tests/helpers/subagent-fn-child-regime.ts:152-156 reproduce verbatim and a mktemp diff (name/export normalised) shows the bodies IDENTICAL; the in-file grep returns exactly the three cited lines (:35 type import, :40 declaration, :48 sole `new RecordingCheckpoint()` inside `rootDouble()`), so nothing reads a recorded kind/site and the name claims a capability the body lacks — both the copy-paste-double and misleading-name D7 classes on tests/-only locations; the stated searches reproduce (docs/bugs `RecordingCheckpoint` → 0, coverage-matrix → 0), the file is not a gate and passes 5/5 at HEAD, and the fix is a mechanical import swap (`NoopCheckpoint` is already consumed from this helper by subagent-visible-regime.test.ts:16); dedupe: PTQ-0492 (fixed) tracks the genuinely-recording kinds/sites shape across 7 other files and does not cite this file, and same-wave sibling d7-01 (confirmed) targets `noopPi` in this file and explicitly scopes `RecordingCheckpoint` out to this filing, so the root cause is untracked (triage: claude-fable-5-1)
