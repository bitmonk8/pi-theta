---
id: PTQ-0822
title: tool-calls-off-surface-live-wiring.test.ts reimplements SEAM_NOOP_CHECKPOINT and SEAM_NOOP_SINK as local NOOP_CHECKPOINT/NOOP_SINK despite importing sibling exports from the same helper module
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tool-calls-off-surface-live-wiring.test.ts:32-38
  - tests/tool-calls-off-surface-live-wiring.test.ts:55-59
  - tests/tool-calls-off-surface-live-wiring.test.ts:166-169
  - tests/helpers/invoke-seam-scaffold.ts:32-42
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tool-calls-off-surface-live-wiring.test.ts reimplements SEAM_NOOP_CHECKPOINT and SEAM_NOOP_SINK as local NOOP_CHECKPOINT/NOOP_SINK despite importing sibling exports from the same helper module

## Observation
tests/tool-calls-off-surface-live-wiring.test.ts imports `RecordingMutator`
and `RecordingSink` from `./helpers/invoke-seam-scaffold` at its top, but
declares its own local `NOOP_CHECKPOINT` (a `Checkpoint` whose `before()`
resolves immediately) and its own local `NOOP_SINK` (a `ToolLoweringSink`
whose two methods are no-ops) rather than importing the same module's already
exported `SEAM_NOOP_CHECKPOINT` and `SEAM_NOOP_SINK`, which are byte-identical
in implementation to the two local re-declarations.

## Evidence
tests/tool-calls-off-surface-live-wiring.test.ts:32-38 (the import that
already reaches into the same helper module):
```ts
import { RecordingMutator, RecordingSink } from "./helpers/invoke-seam-scaffold";
```
(this is the file's actual top-of-file import line, reproduced verbatim.)

tests/tool-calls-off-surface-live-wiring.test.ts:55-59 (the local
`NOOP_CHECKPOINT` re-declaration):
```ts
/** A no-op `Checkpoint` whose `before(...)` resolves on the microtask queue. */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

tests/tool-calls-off-surface-live-wiring.test.ts:166-169 (the local
`NOOP_SINK` re-declaration):
```ts
const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

tests/helpers/invoke-seam-scaffold.ts:32-42 (the same module's already
exported, byte-identical pair):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

Exact search: `grep -n "NOOP_CHECKPOINT\|NOOP_SINK" tests/tool-calls-off-surface-live-wiring.test.ts` → 12 hits, one declaration site each plus ten use sites; `grep -n "SEAM_NOOP_CHECKPOINT\|SEAM_NOOP_SINK" tests/helpers/invoke-seam-scaffold.ts` → 3 hits (one doc-comment mention, two `export const` declarations).

## Why this is a problem
The `Checkpoint`/`ToolLoweringSink` no-op pair this file needs already has an
exported home in the very module the file imports two of its four exports
from (`RecordingMutator`, `RecordingSink`), and the module's own header
comment states its purpose is to centralise "the no-op seam stand-ins
themselves" so that "a file that needs them can import rather than retype
them." The two local re-declarations are functionally and textually identical
to the module's own `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK` (`before()`
resolving a `Promise.resolve()`; `diagnostic()`/`systemNote()` both no-ops),
so this file re-derives, under new local names, exactly the pair the same
import statement could have picked up alongside `RecordingMutator`/
`RecordingSink`.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT` and `SEAM_NOOP_SINK as
NOOP_SINK` alongside the file's existing `RecordingMutator`/`RecordingSink`
import is the natural fit, since the module's own doc comment already
describes this as its intended usage pattern and other files in the tree
(e.g. tests/helpers/typed-query-harness.ts) already re-export
`SEAM_NOOP_CHECKPOINT` under a local alias for the same reason.

## False-positive check
- Gate-pin carve-out: the file name does not match `*gate*.test.ts` or a
  named gate kin; not applicable — no pinned count or inventory is involved.
- Recording-double carve-out: `NOOP_CHECKPOINT`/`NOOP_SINK` are discarding
  no-op stand-ins, not recording doubles backing a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT\|NOOP_SINK"
  docs/bugs/` → 0 hits; no documented correct-reason-red names either local
  constant.
- coverage-matrix/bug-doc citation search: `grep -n
  "tool-calls-off-surface-live-wiring" docs/reference/coverage-matrix.md` →
  0 hits; this finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` block, only that the two local constants could import the
  already-exported equivalents.
- Coverage-drift check: this finding is about scaffolding already present and
  already used in a passing test file; it makes no claim that any behaviour
  or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the import reproduces at tests/tool-calls-off-surface-live-wiring.test.ts:32 (cited 32-38, one-line drift), `NOOP_CHECKPOINT` at 55-59 and `NOOP_SINK` at 166-169 reproduce verbatim, and after a name-only substitution a scratch diff of each against tests/helpers/invoke-seam-scaffold.ts:32-36 `SEAM_NOOP_CHECKPOINT` / :39-42 `SEAM_NOOP_SINK` is empty (byte-identical bodies); both locals are live (12 hits in file: 2 declarations + 10 uses at 98/127/143/189/191/209/285/321/349/384); stated searches reproduce (helper 3 hits, docs/bugs 0, coverage-matrix 0) and the typed-query-harness.ts:23 `SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT` alias claim is real; the helper's header (lines 4-11) names exactly this centralisation intent; both locations under tests/, D7 copy-paste-fixture class, not a gate file, discarding no-ops (no recording-double carve-out), no merge/rename/delete proposed. Not a duplicate: the only PTQs citing this file are PTQ-0690 (cancellation race wrapper, session-control-adapters), PTQ-0701 (RecordingMutator, fixed) and PTQ-0721 (RecordingSink, fixed) — the latter two are why the import already exists, leaving this NOOP pair the un-migrated residual; none of the per-file invoke-seam-scaffold not-migrated PTQs (0594/0603/0613/0650/0655/0705/0720/0738/0778/0779) cite this file, and per-file filings are the store's established granularity; same-wave sibling d7-02 (liveSignal) and d7-03 (SEAM_NOOP_CHECKPOINT vs PassthroughCheckpoint) are distinct root causes. Stray `d4_class: clone` on a D7 filing is extraneous but non-blocking (PTQ-0690 precedent). Mechanical fix: two aliased imports, two deletions (triage: claude-fable-5-1)
