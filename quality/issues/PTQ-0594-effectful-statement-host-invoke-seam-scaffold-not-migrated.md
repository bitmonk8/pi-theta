---
id: PTQ-0594
title: effectful-statement-host.test.ts redeclares three invoke-seam-scaffold no-op exports instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/effectful-statement-host.test.ts:72-74
  - tests/effectful-statement-host.test.ts:118-121
  - tests/effectful-statement-host.test.ts:241-244
  - tests/helpers/invoke-seam-scaffold.ts:29-63
sites: 1
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# effectful-statement-host.test.ts redeclares three invoke-seam-scaffold no-op exports instead of importing them

## Observation
`tests/effectful-statement-host.test.ts` declares its own `span()` helper, its
own no-op `Checkpoint` (`NOOP_CHECKPOINT`), and its own no-op
`ToolLoweringSink` (`NOOP_SINK`), each byte-identical in body to an export of
`tests/helpers/invoke-seam-scaffold.ts` (`span()`, `SEAM_NOOP_CHECKPOINT`,
`SEAM_NOOP_SINK`) — a helper whose own header states it centralises "the
`SEAM_NOOP_CHECKPOINT` / `SEAM_NOOP_SINK` / `SEAM_NOOP_MUTATOR` no-op triple,
`span()` ... byte-for-byte identical across several `executeBody`-driving
invoke/code-call bug-witness files (bug 0294, bug 0295, bug 0347, bug 0349)."
The in-scope file does not import it.

## Evidence

`tests/effectful-statement-host.test.ts:72-74`:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

`tests/effectful-statement-host.test.ts:118-121`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/effectful-statement-host.test.ts:241-244`:
```ts
const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

`tests/helpers/invoke-seam-scaffold.ts:29-63` (the canonical exports, added
2026-09-12):
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

/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

## Why this is a problem
All three redeclared pieces — the throwaway `SourceRange` builder and the two
inert seam stand-ins the file's own `harness()` assembles into every
`ExecuteBodyDeps` it builds — are, per the helper's own header, exactly the
scaffolding it exists to hold once for every `executeBody`-driving file in
this lineage (it already names bug 0294/0295/0347/0349 as its migrated
importers). This file drives the same `executeBody`/
`createEffectfulStatementHost` seam and needs the identical inert stand-ins,
but reimplements them locally instead.

## Suggested direction (non-binding, optional)
The natural home for `span()`, `NOOP_CHECKPOINT`, and `NOOP_SINK` is the
existing `tests/helpers/invoke-seam-scaffold.ts` import surface; this file's
own `RecordingMutator` (a recording double, not a no-op) and its
`ScriptedCheckpoint` (cancellation-timing behaviour) are file-specific and
would stay local, matching how the helper's other importers already use it.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; no pinned inventory or census.
Recording-double check: `NOOP_CHECKPOINT`/`NOOP_SINK` are inert stand-ins, not
recording doubles witnessing a MUST-NOT-call — the file's separate
`RecordingMutator`/`RecordingQueryModel`/`RecordingToolCall`/
`RecordingInvokeChild` classes are legitimate recording doubles and are not
part of this claim. Bug-doc signature search: the file's own bug-0177 block
(the `ErrReturningInvokeChild` section) was read in full; it documents the
XMODE-1 wrap defect the trailing tests probe, not this scaffolding
duplication. Coverage-matrix / bug-doc citation search: `grep -rn
"effectful-statement-host"` across `docs/reference/coverage-matrix.md` and
`docs/bugs/*.md` found only bug 0177's own citation of this file as a
witness for the XMODE-1 wrap fix — no citation names `span()`/
`NOOP_CHECKPOINT`/`NOOP_SINK` specifically, so no rename/merge beyond what is
stated here is implied. git history: `tests/helpers/invoke-seam-scaffold.ts`
was added 2026-09-12 (qw20260912112713); `tests/effectful-statement-host.
test.ts` was added 2026-07-02, before the helper existed.

## Triage
<!-- pending -->
verdict: confirmed — independently reproduced: span()/NOOP_CHECKPOINT/NOOP_SINK at tests/effectful-statement-host.test.ts:72-74/118-122/241-244 diff byte-identical (modulo `export`/name) to tests/helpers/invoke-seam-scaffold.ts:54-56/31-35/38-41, the file has zero scaffold imports while b0295/b0347/b0349 already import the bundle, the file drives the real executeBody/createEffectfulStatementHost seam the helper header scopes itself to, NOOP_* are consumed only by harness() as inert stand-ins (not recording doubles), coverage-matrix has 0 hits and no bug doc names these helpers (one non-negating misattribution: the test file's sole bug-doc citation is 0322's line-drift note, not 0177), git dates reproduce (helper 2026-09-12 f593d10e, test 2026-07-02 fb387e9c), 8/8 vitest pass at HEAD, and resolved PTQ-0244/0301/0344 cover b0349/b0295/b0347 only — same shape, different file, mechanical import dedupe (triage: claude-fable-5-1)
