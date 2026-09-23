---
id: PTQ-1481
title: pure-async-unification.test.ts and query-schema-transitive-defs.test.ts each redeclare a local NOOP_CHECKPOINT byte-identical to the exported SEAM_NOOP_CHECKPOINT
lens: D7
status: open
verdict: confirmed
locations:
  - tests/pure-async-unification.test.ts:99-103
  - tests/query-schema-transitive-defs.test.ts:242-246
  - tests/helpers/invoke-seam-scaffold.ts:66-70
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# pure-async-unification.test.ts and query-schema-transitive-defs.test.ts each redeclare a local NOOP_CHECKPOINT byte-identical to the exported SEAM_NOOP_CHECKPOINT

## Observation
`tests/helpers/invoke-seam-scaffold.ts` exports `SEAM_NOOP_CHECKPOINT`, a
`Checkpoint` whose `before()` resolves immediately, documented as the seam
double for call sites that don't put the checkpoint itself under test. Two
files in this review's scope — `tests/pure-async-unification.test.ts` and
`tests/query-schema-transitive-defs.test.ts` — each declare their own
module-scope `const NOOP_CHECKPOINT` with a byte-identical body instead of
importing the exported constant.

## Evidence

`tests/helpers/invoke-seam-scaffold.ts:66-70` (re-read immediately before
filing):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/pure-async-unification.test.ts:99-103` (re-read immediately before
filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/query-schema-transitive-defs.test.ts:242-246` (re-read immediately
before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Both local declarations match `SEAM_NOOP_CHECKPOINT`'s body field-for-field.
`tests/helpers/tool-call-dispatch-harness.ts:53` independently confirms this
is the module's established canonical import path: it imports the same
constant under a local alias (`import { SEAM_NOOP_CHECKPOINT as
NOOP_CHECKPOINT } from "./invoke-seam-scaffold";`), the identical pattern
both in-scope files could use instead of a local declaration.

## Why this is a problem
One `Checkpoint` double — an immediately-resolving `before()` — is typed
three times in the reviewed corpus alone (the two in-scope declarations plus
the re-exporting alias already used by `tool-call-dispatch-harness.ts`), all
tracing to the same 5-line body in `invoke-seam-scaffold.ts`.

## Suggested direction (non-binding, optional)
The natural home for both local declarations, as observation: import
`SEAM_NOOP_CHECKPOINT` (optionally aliased to `NOOP_CHECKPOINT`) from
`tests/helpers/invoke-seam-scaffold.ts`, the pattern
`tool-call-dispatch-harness.ts` already follows.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a census/pin
  naming pattern.
- Recording-double check: `NOOP_CHECKPOINT`/`SEAM_NOOP_CHECKPOINT` is a
  static value double, not a recording double asserting a MUST-NOT call; the
  carve-out for negative witnesses does not apply.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT" docs/bugs/*.md` →
  0 hits; neither file's documented correct-reason-red status (V20e-T /
  bug 0004) concerns this checkpoint double.
- coverage-matrix/bug-doc citation search: `grep -n "pure-async-unification\|
  query-schema-transitive-defs" docs/reference/coverage-matrix.md` → 0 hits.
  No merge, rename, or delete of any test is proposed — only that the two
  local `const` declarations could import the existing export.
- Prior-finding overlap check: `grep -rli "NOOP_CHECKPOINT" quality/resolved/*.md
  quality/issues/*.md` surfaces prior findings about other
  `noop-checkpoint`-shaped doubles (e.g. PTQ-1005, PTQ-1038, PTQ-0886, PTQ-0650)
  naming different files and different mutator/sink shapes; none cites
  `tests/pure-async-unification.test.ts` or
  `tests/query-schema-transitive-defs.test.ts` for this static `Checkpoint`
  constant.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce byte-exact at the cited lines (invoke-seam-scaffold.ts:66-70 `SEAM_NOOP_CHECKPOINT`, pure-async-unification.test.ts:99-103 and query-schema-transitive-defs.test.ts:242-246 each `const NOOP_CHECKPOINT: Checkpoint = { before(): Promise<void> { return Promise.resolve(); } }`), both locals are live (`rootWith(NOOP_CHECKPOINT)` at pure-async:116 and the typed-query drive in transitive-defs), the export is live (`grep -rl SEAM_NOOP_CHECKPOINT tests/` → 40 files) and tool-call-dispatch-harness.ts:52 already uses the `SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT` alias import; neither in-scope file imports from invoke-seam-scaffold; docs/bugs (0), coverage-matrix (0) searches reproduce, neither file is a gate, the double is a static value not a recording double, and no merge/rename/delete is proposed; not a duplicate — resolved PTQ-0432 mentions query-schema-transitive-defs only "for context" (its root cause is the six-piece typed-query substrate mirrored from e2e-s3, locations b0292/e2e-s3), PTQ-1015/1348/1384 cover the resolvePiTool and rootDouble doubles in pure-async, same-wave sibling d7-01 covers AST builders, and prior NOOP_CHECKPOINT filings (PTQ-0603/0650/1005/1038/0886) name other files; same class as those accepted precedents — in-scope D7 copy-paste double whose fix is a mechanical import swap (triage: claude-fable-5-1)
