---
id: PTQ-0955
title: b0308's InertCheckpoint class re-implements the canonical SEAM_NOOP_CHECKPOINT constant
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0308-snk-h-null-last-tool.test.ts:136-141
  - tests/helpers/invoke-seam-scaffold.ts:36-42
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0308's InertCheckpoint class re-implements the canonical SEAM_NOOP_CHECKPOINT constant

## Observation
`tests/b0308-snk-h-null-last-tool.test.ts` declares a local `InertCheckpoint` class implementing the `Checkpoint` seam interface with a `before()` method that immediately resolves. `tests/helpers/invoke-seam-scaffold.ts` already exports `SEAM_NOOP_CHECKPOINT`, a `Checkpoint`-typed constant whose `before()` method does exactly the same thing (immediately resolves, ignoring its arguments). The scaffold file's own header states its purpose is to centralise this exact no-op triple because it was found byte-for-byte identical across several `executeBody`-driving bug-witness files. `SEAM_NOOP_CHECKPOINT` is already imported and used by 31 call sites across `tests/*.ts`, including `tests/helpers/par-for-harness.ts`, which is itself imported by three of the other files in this same review scope (b0324, b0325, b0326).

## Evidence
`tests/b0308-snk-h-null-last-tool.test.ts:136-141`:
```ts
/** A no-op `Checkpoint` — cell (C) does not assert on the checkpoint stream. */
class InertCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}
```

`tests/helpers/invoke-seam-scaffold.ts:36-42`:
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Both implement the identical `Checkpoint` interface (`src/seams/checkpoint.ts:21-24`, `before(kind: CheckpointKind, site: CheckpointSite): Promise<void>`) with the identical behaviour: ignore both arguments, return an immediately-resolved promise. `grep -rn "SEAM_NOOP_CHECKPOINT" tests/*.ts` returns 31 hits across the test suite; `grep -rn "InertCheckpoint" tests/*.ts` returns hits only inside this one file (its declaration and its single use at `:150`, `new InertCheckpoint()`, in cell (C)'s `runUntypedQueryLoop` call).

## Why this is a problem
The scaffold module's own stated purpose (`tests/helpers/invoke-seam-scaffold.ts:5-13`) is to hold exactly this no-op seam shape so that "a file that needs them can import rather than retype them." `InertCheckpoint` is a second, locally-typed re-implementation of the same no-op `Checkpoint` the scaffold already exports and that the review-scope siblings (via `par-for-harness.ts`) already import.

## Suggested direction (non-binding, optional)
`tests/b0308-snk-h-null-last-tool.test.ts` could import `SEAM_NOOP_CHECKPOINT` from `tests/helpers/invoke-seam-scaffold.ts` in place of declaring and instantiating `InertCheckpoint`.

## False-positive check
- Recording-double carve-out: `InertCheckpoint` records nothing and is never asserted against — it is a pure no-op stand-in, not a MUST-NOT witness. Carve-out does not apply.
- Gate-pin carve-out: file name does not match `*gate*.test.ts` or any named gate kin; not applicable.
- docs/bugs/ signature search: `grep -n "InertCheckpoint" docs/bugs/0308-snk-h-fabricates-last-tool-respond-on-reachable-null.md` — 0 hits; the class is not cited as a documented correct-reason-red witness shape.
- coverage-matrix/bug-doc citation search: `grep -n "InertCheckpoint" docs/reference/coverage-matrix.md` — 0 hits. This finding does not propose renaming, merging, or deleting a cited test — it proposes replacing a local double with an import, leaving the test's behaviour and name unchanged.
- Coverage drift check: this finding does not claim any path is untested; it is about an existing double's re-implementation, not about missing coverage.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/b0308-snk-h-null-last-tool.test.ts:136-141 and tests/helpers/invoke-seam-scaffold.ts:36-42, both satisfy the same `Checkpoint.before(kind, site): Promise<void>` contract (src/seams/checkpoint.ts:21-24) with byte-equivalent behaviour (ignore args, `Promise.resolve()`); `grep -rn SEAM_NOOP_CHECKPOINT tests/*.ts` = 31 hits reproduces and `InertCheckpoint` appears nowhere in src/, extensions/, tools/ or any other test — only its declaration at :137 and its single use (at :175, not the :150 the filing states — non-refuting drift, content matches) as the `checkpoint` argument to `runUntypedQueryLoop(checkpoint: Checkpoint, …)`, so the swap is a mechanical import with no behaviour change; the scaffold constant is already consumed outside `executeBody` drivers (tests/helpers/par-for-harness.ts:16,106, imported by in-scope b0324/b0325/b0326), so the header's stated purpose covers this use; docs/bugs/0308 cites the file by cell letters only and coverage-matrix → 0 hits for `InertCheckpoint`, no gate/recording-double/failLoudly carve-out touched, file passes at HEAD (4/4); dedupe: the only store entries touching this file are PTQ-0775 (tests/live b0308 sibling, `driveOnce`) and resolved PTQ-0714 (this file's `FakePi`), and none of the 11 open SEAM_NOOP_CHECKPOINT issues cite b0308 — D7 copy-paste-double in tests/ only (triage: claude-fable-5-1)
