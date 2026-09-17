---
id: PTQ-0705
title: subagent-fn.test.ts redeclares the no-op Checkpoint and CommittedConversationMutator that tests/helpers/invoke-seam-scaffold.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-fn.test.ts:739-751
  - tests/helpers/invoke-seam-scaffold.ts:31-50
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-fn.test.ts redeclares the no-op Checkpoint and CommittedConversationMutator that tests/helpers/invoke-seam-scaffold.ts already exports

## Observation
`tests/subagent-fn.test.ts` declares a module-local `NOOP_CHECKPOINT: Checkpoint` constant and a `NoopMutator` class implementing `CommittedConversationMutator`, both used to drive `executeBody` in the file's runtime harness section. `tests/helpers/invoke-seam-scaffold.ts` already exports `SEAM_NOOP_CHECKPOINT` and `SEAM_NOOP_MUTATOR` with the identical no-op bodies, and its own header states this "no-op triple" was extracted specifically because it recurred byte-for-byte across several `executeBody`-driving files. `subagent-fn.test.ts` does not import that module.

## Evidence

`tests/subagent-fn.test.ts:739-751`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

`tests/helpers/invoke-seam-scaffold.ts:31-50` — the canonical export, byte-identical bodies (object literal vs. class syntax is the only structural difference):
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

/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};
```

Every one of `NoopMutator`'s five methods (`truncate`, `rewrite`, `replace`, `remove`, `injectCompensatingTurn`) has an empty body identical to `SEAM_NOOP_MUTATOR`'s corresponding property, and `NOOP_CHECKPOINT.before()` is the identical single-statement `Promise.resolve()` body as `SEAM_NOOP_CHECKPOINT.before()`.

## Why this is a problem
`tests/helpers/invoke-seam-scaffold.ts`'s own header names the reason for its existence: the no-op `Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator` triple was "byte-for-byte identical across several `executeBody`-driving invoke/code-call bug-witness files" before being centralised. `tests/subagent-fn.test.ts` is itself an `executeBody`-driving file (its runtime harness section drives `executeBody` directly, per `execDeps`) and independently carries the same two no-op seams the module was built to hold, without importing it.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts`'s exported `SEAM_NOOP_CHECKPOINT` and `SEAM_NOOP_MUTATOR` already cover this shape; importing them in place of the local `NOOP_CHECKPOINT`/`NoopMutator` declarations is the direction the module's own stated purpose points toward. This finding does not propose merging, renaming, or deleting any test in `tests/subagent-fn.test.ts` — only relocating the two duplicated no-op declarations.

## False-positive check
- Gate-pin check: `tests/subagent-fn.test.ts` does not match `*gate*.test.ts` or any named kin; not applicable.
- Recording-double check: neither `NOOP_CHECKPOINT` nor `NoopMutator` records calls for a "never called" MUST-NOT assertion — both are inert stand-ins whose methods are never asserted on; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "subagent-fn.test.ts" docs/bugs/*.md` returns citations of other line ranges in this file (e.g. `:1581-1614`, `:308-323`, `:404-421`) for unrelated fixture shapes; none cites lines 739-751 or names `NOOP_CHECKPOINT`/`NoopMutator` as a witness artefact.
- coverage-matrix citation search: `grep -n "subagent-fn.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies two duplicated no-op double declarations, leaving the file's tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-fn.test.ts:739-751 and tests/helpers/invoke-seam-scaffold.ts:31-50 with byte-identical method bodies (class vs object-literal syntax only); the file has no import of invoke-seam-scaffold (grep 0 hits) while driving the real executeBody via execDeps (line 888-897: `checkpoint: NOOP_CHECKPOINT`, `mutator: new NoopMutator()`) plus three more NOOP_CHECKPOINT passes at 1527/1580/1599; NoopMutator is never extended/instanceof'd/asserted on so the recording-double carve-out does not apply; stated searches reproduce (docs/bugs cite :308/:404/:1581-1614 for an in-memory FileSystem shape, not these declarations; coverage-matrix 0 hits; not a gate test); the scaffold's header names this exact executeBody-driving no-op pair as its reason to exist, and resolved PTQ-0301/PTQ-0344 (same pattern, different files b0295/b0347) set the per-file precedent — this file is a distinct location, not a duplicate (triage: claude-fable-5-1)
