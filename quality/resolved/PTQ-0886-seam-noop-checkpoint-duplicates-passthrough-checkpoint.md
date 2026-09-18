---
id: PTQ-0886
title: invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT and fixture-dispatch-harness.ts's PassthroughCheckpoint are two independent immediately-resolving Checkpoint doubles
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/helpers/invoke-seam-scaffold.ts:30-36
  - tests/helpers/fixture-dispatch-harness.ts:148-152
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT and fixture-dispatch-harness.ts's PassthroughCheckpoint are two independent immediately-resolving Checkpoint doubles

## Observation
`tests/helpers/invoke-seam-scaffold.ts` exports `SEAM_NOOP_CHECKPOINT`, a
`Checkpoint` object literal whose `before()` returns `Promise.resolve()`
immediately, documented as the seam stand-in for call sites that do not
themselves exercise the checkpoint. `tests/helpers/fixture-dispatch-
harness.ts` independently exports `PassthroughCheckpoint`, a `Checkpoint`
class whose `before(_kind, _site)` also returns `Promise.resolve()`
immediately, with no other members. Both are inert, always-resolving
`Checkpoint` doubles serving the same "the checkpoint is not under test here"
role, declared independently under `tests/helpers/`.

## Evidence
`tests/helpers/invoke-seam-scaffold.ts:30-36`:
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/fixture-dispatch-harness.ts:148-152`:
```ts
export class PassthroughCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}
```

Both conform to the same `Checkpoint` interface (`before(kind, site):
Promise<void>`) and both are observationally identical: every `before()` call
on either resolves immediately with no side effect and no recorded state.
`grep -rn "class PassthroughCheckpoint\|const SEAM_NOOP_CHECKPOINT"
tests/helpers/` returns exactly these two declarations, one per file.

## Why this is a problem
Both modules sit side by side under `tests/helpers/`, and `fixture-dispatch-
harness.ts` even documents itself as centralising exactly this kind of
dispatch scaffolding (its header cites PTQ-0225/PTQ-0403 as the reason it
exists). A caller reaching for "a Checkpoint double that just resolves" has
two independently-typed, functionally-identical answers to choose between
depending on which helper file it happens to already import, rather than one
canonical no-op double.

## Suggested direction (non-binding, optional)
One of the two could be dropped in favour of the other — e.g. `fixture-
dispatch-harness.ts`'s `PassthroughCheckpoint` callers could import
`SEAM_NOOP_CHECKPOINT` from `invoke-seam-scaffold.ts` instead, or vice versa
— so a single canonical no-op `Checkpoint` double exists under `tests/helpers/`.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: neither double records any call or backs a
  "never called" witness — both are pure pass-through stand-ins for a
  positive execution path, not a MUST-NOT-witness recording double; the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "PassthroughCheckpoint\|SEAM_NOOP_CHECKPOINT" docs/bugs/` → 0 hits; no documented correct-reason red cites either declaration.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-seam-scaffold.ts\|fixture-dispatch-harness.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block or of either helper file — only that one no-op double be reused in place of the other — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about two repeated no-op DOUBLE
  definitions; every caller of either double already reaches an equivalent
  pass-through, and no behaviour path is claimed untested.
- Overlap check: `grep -rl "PassthroughCheckpoint" quality/intake quality/issues quality/resolved` finds only the resolved `PTQ-0403-active-invocation-dispatch-scaffolding-duplicated.md`, whose fix minted `PassthroughCheckpoint`/`rootWith`/`noopPi` into `fixture-dispatch-harness.ts` from two `tests/*.test.ts` files — it does not mention `SEAM_NOOP_CHECKPOINT` or `invoke-seam-scaffold.ts`. `grep -rl "SEAM_NOOP_CHECKPOINT" quality/` finds only unrelated same-wave findings about `SEAM_NOOP_MUTATOR`/`SEAM_NOOP_SINK` reimplementations in other test files, none comparing it to `PassthroughCheckpoint`. This is the first filing to cite this specific pair.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/helpers/invoke-seam-scaffold.ts:32-36 and tests/helpers/fixture-dispatch-harness.ts:148-152, both implement src/seams/checkpoint.ts:21-23 `before(kind, site): Promise<void>` with a bare `Promise.resolve()` and no state, so they are observationally identical; the `class PassthroughCheckpoint|const SEAM_NOOP_CHECKPOINT` grep returns exactly these two declarations, docs/bugs 0 and coverage-matrix 0 both reproduce; both are live (PassthroughCheckpoint `new`-ed in 6 test files, SEAM_NOOP_CHECKPOINT imported by 15+ files and re-exported by typed-query-harness.ts:23) with no `instanceof`/identity dependence, so either is a drop-in for the other; git shows SEAM_NOOP_CHECKPOINT landed 2026-09-12 (f593d10e) and PassthroughCheckpoint was minted 2026-09-17 (8bad24ba, PTQ-0403's fix), i.e. a second canonical no-op double was created when one already existed under tests/helpers/; both locations under tests/, D7 copy-paste-double class, neither file is gate kin, both are discarding not recording doubles, no it()/describe() merge/rename/delete proposed. Not a duplicate: resolved PTQ-0403 minted the class and never mentions invoke-seam-scaffold; PTQ-0492 is the *recording* checkpoint; PTQ-0738/0603/0650/0655/0705 are per-test-file un-migrated copies; same-wave d7-01 and d7-02 triage notes already ruled this pair a distinct root cause. Fix is a mechanical import substitution at 6 call sites plus one deletion (triage: claude-fable-5-1)
