---
id: PTQ-1005
title: tool-call-dispatch-harness.ts and subagent-fn-child-regime.ts each retype the no-op Checkpoint that invoke-seam-scaffold.ts already exports as SEAM_NOOP_CHECKPOINT
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/tool-call-dispatch-harness.ts:125-129
  - tests/helpers/subagent-fn-child-regime.ts:152-156
  - tests/helpers/invoke-seam-scaffold.ts:38-44
sites: 2
fix_scope: module
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tool-call-dispatch-harness.ts and subagent-fn-child-regime.ts each retype the no-op Checkpoint that invoke-seam-scaffold.ts already exports as SEAM_NOOP_CHECKPOINT

## Observation
`tests/helpers/tool-call-dispatch-harness.ts` declares a module-scope `NOOP_CHECKPOINT` object literal whose `before()` immediately resolves. `tests/helpers/subagent-fn-child-regime.ts` declares a `NoopCheckpoint` class implementing the same `Checkpoint` interface with the identical `before()` body. `tests/helpers/invoke-seam-scaffold.ts` already exports `SEAM_NOOP_CHECKPOINT`, the same no-op `Checkpoint`, and a third file reviewed in this same wave — `tests/helpers/typed-query-harness.ts` — already imports and re-exports that exact canonical constant instead of retyping it.

## Evidence
`tests/helpers/tool-call-dispatch-harness.ts:125-129`:
```ts
export const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/subagent-fn-child-regime.ts:152-156`:
```ts
export class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}
```

`tests/helpers/invoke-seam-scaffold.ts:38-44` (the canonical export both bodies duplicate the behaviour of):
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Contrast, in the same review scope, `tests/helpers/typed-query-harness.ts:23`:
```ts
export { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
```
which imports the canonical constant under the same local alias
(`NOOP_CHECKPOINT`) rather than retyping it — the path both other in-scope
files bypass.

## Why this is a problem
Both `Checkpoint` implementations satisfy the identical `before(kind, site): Promise<void>` contract with the identical behaviour (ignore both arguments, resolve immediately, record nothing). `invoke-seam-scaffold.ts`'s own header states its purpose is to hold exactly this no-op seam so callers "import rather than retype" it. One file in this same review (`typed-query-harness.ts`) already does exactly that; the other two independently retype the identical no-op under two different local names and two different declaration styles (object literal vs. class).

## Suggested direction (non-binding, optional)
Both `tool-call-dispatch-harness.ts` and `subagent-fn-child-regime.ts` could import `SEAM_NOOP_CHECKPOINT` from `./invoke-seam-scaffold` the same way `typed-query-harness.ts` already does, in place of their own local declarations.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or a named gate kin; these are `tests/helpers/` modules, not census/pin tests.
- Recording-double check: neither `NOOP_CHECKPOINT` nor `NoopCheckpoint` records any call or backs a "never called" MUST-NOT witness — both are pure pass-through stand-ins for a positive execution path; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT\|NoopCheckpoint" docs/bugs/` → 0 hits; no documented correct-reason red cites either declaration.
- coverage-matrix/bug-doc citation search: `grep -n "tool-call-dispatch-harness\|subagent-fn-child-regime" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test file or `it()`/`describe()` block — only that two helper modules import an existing constant in place of a local retyping.
- Coverage-drift check: this finding is about a duplicated no-op double declaration inside existing, passing helper modules; it makes no claim that any behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/helpers/tool-call-dispatch-harness.ts:125-129, tests/helpers/subagent-fn-child-regime.ts:152-156 and tests/helpers/invoke-seam-scaffold.ts:38-44, and typed-query-harness.ts:26 (not :23 — non-refuting drift) does re-export `SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT`; all three implement src/seams/checkpoint `before(kind, site): Promise<void>` with a bare `Promise.resolve()` and no state, so either local double is a drop-in for the scaffold constant; both copies are live (NOOP_CHECKPOINT consumed at :143/:282 in-file and imported by tests/prompt-mode-extension-tool-dispatch.test.ts:53; NoopCheckpoint `new`-ed at :160 and by tests/subagent-visible-regime.test.ts:16,61) and both post-date the canonical (SEAM_NOOP_CHECKPOINT f593d10e 2026-09-12; tool-call-dispatch-harness.ts created 89faa7c5 2026-09-15; the NoopCheckpoint class was minted 0ff0ccb3 2026-09-18 by a quality fix wave) — the not-migrated/reimplemented class; docs/bugs (0) and coverage-matrix (0) greps reproduce, neither file is gate kin, both are discarding not recording doubles, no it()/describe() merge/rename/delete proposed, the three consumer files pass at HEAD (37/37); PTQ-0886 is resolved with SEAM_NOOP_CHECKPOINT as the surviving canonical (PassthroughCheckpoint no longer exists), so the target is settled. Not a duplicate: PTQ-0738's triage names tool-call-dispatch-harness's NOOP_CHECKPOINT only as a migration destination, same-wave d7-05-recordingcheckpoint and d7-09-child-env-scrub cite subagent-fn-child-regime.ts:152-156 as the canonical for test-file copies, and none of the ~11 open SEAM_NOOP_CHECKPOINT rows (PTQ-0603/0650/0655/0705/0738/0822/0844/0873/0955) name either helper's declaration. Two evidentiary notes for ticketing: `sites: 2` undercounts — subagent-fn-child-regime.ts:40 carries a THIRD inline retype (`checkpoint: { before: (): Promise<void> => Promise.resolve() }` inside childRegimeRootDouble, overlapping same-wave d7-05-childregime-rootdouble); and because NoopCheckpoint is a class `new`-ed by an external importer, the fix must keep an aliased re-export (or migrate subagent-visible-regime.test.ts:61) rather than a bare deletion — still mechanical (triage: claude-fable-5-1)
