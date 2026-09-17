---
id: PTQ-0720
title: tool-arg-shape-enforcement.test.ts redeclares tests/helpers/invoke-seam-scaffold.ts's span/no-op-checkpoint/no-op-mutator triple
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tool-arg-shape-enforcement.test.ts:341-343
  - tests/tool-arg-shape-enforcement.test.ts:397-401
  - tests/tool-arg-shape-enforcement.test.ts:403-409
  - tests/helpers/invoke-seam-scaffold.ts:31-35
  - tests/helpers/invoke-seam-scaffold.ts:44-50
  - tests/helpers/invoke-seam-scaffold.ts:54-56
sites: 3
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tool-arg-shape-enforcement.test.ts redeclares tests/helpers/invoke-seam-scaffold.ts's span/no-op-checkpoint/no-op-mutator triple

## Observation
tests/tool-arg-shape-enforcement.test.ts declares a local `span()`, a local
`NOOP_CHECKPOINT: Checkpoint`, and a local `NoopMutator` class implementing
`CommittedConversationMutator` with five no-op methods. Each is functionally
identical to the corresponding exported member of
tests/helpers/invoke-seam-scaffold.ts (`span`, `SEAM_NOOP_CHECKPOINT`,
`SEAM_NOOP_MUTATOR`), whose own header states it exists because this "no-op
triple" and `span()` "are byte-for-byte identical across several
`executeBody`-driving invoke/code-call bug-witness files".

## Evidence
tests/tool-arg-shape-enforcement.test.ts:341-343 (`span`):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/helpers/invoke-seam-scaffold.ts:54-56 (`span`, byte-identical):
```ts
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/tool-arg-shape-enforcement.test.ts:397-401 (`NOOP_CHECKPOINT`):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

tests/helpers/invoke-seam-scaffold.ts:31-35 (`SEAM_NOOP_CHECKPOINT`, same
shape and body):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

tests/tool-arg-shape-enforcement.test.ts:403-409 (`NoopMutator`):
```ts
class NoopMutator implements CommittedConversationMutator {
  truncate(_surfaceId: string): void {}
  rewrite(_surfaceId: string): void {}
  replace(_surfaceId: string): void {}
  remove(_surfaceId: string): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

tests/helpers/invoke-seam-scaffold.ts:44-50 (`SEAM_NOOP_MUTATOR`, the same
five no-op methods declared as a const object rather than a class):
```ts
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};
```

## Why this is a problem
tests/helpers/invoke-seam-scaffold.ts's own header names this exact triple
("pure scaffolding — inert stand-ins for seams the driven cell does not
itself exercise") as the reason the module exists: it was extracted because
several `executeBody`-driving files redeclared it. The in-scope file is a
further `executeBody`-driving file (it drives `executeBody` directly at
tests/tool-arg-shape-enforcement.test.ts's `executorDeps`) redeclaring the
same three no-op stand-ins rather than importing them.

## Suggested direction (non-binding, optional)
tests/helpers/invoke-seam-scaffold.ts is the already-existing natural home for
`span`/the no-op checkpoint/the no-op mutator; the file's own
`NoopMutator`-as-a-class spelling is the only structural difference from the
helper's const-object spelling, and both satisfy the same
`CommittedConversationMutator` interface.

## False-positive check
Gate-pin carve-out: filename does not match `*gate*.test.ts` or the named
gate kin — does not apply. Recording-double carve-out: none of `span`,
`NOOP_CHECKPOINT`, or `NoopMutator` record calls for a MUST-NOT assertion —
all three are inert stand-ins, not recording doubles — does not apply.
docs/bugs/ search: grepped docs/bugs/ for "tool-arg-shape-enforcement" and
"invoke-seam-scaffold" — no hits. coverage-matrix/bug-doc citation search:
grepped docs/reference/coverage-matrix.md and docs/bugs/*.md for this file's
name — no citation pins this scaffold block against consolidation. No
coverage claim is made.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: span()/NOOP_CHECKPOINT/NoopMutator at tests/tool-arg-shape-enforcement.test.ts:341-343/397-401/403-409 match the excerpts verbatim and are body-for-body identical to tests/helpers/invoke-seam-scaffold.ts:54-56/31-35/44-50 (class-vs-const and `_surfaceId` parameter names only), all three are live (span feeds the six AST builders at :346-366; checkpoint/mutator feed executorDeps() at :477/:479 into four real executeBody drives at :500/:513/:526/:545 — exactly the no-op ExecuteBodyDeps scaffold the helper's header says it exists to supply), the file imports nothing from tests/helpers/ while the helper's importers are exactly b0295/b0347/b0349, NoopMutator is only `new NoopMutator()`'d and never asserted on (not a recording double), not a *gate* file, coverage-matrix 0 hits, bug 0003 fixed (0.16.0), 18/18 vitest green — same per-file copy-paste-fixture shape ratified in PTQ-0244/0301/0344 and same-wave confirmed siblings d7-111-03 (par-for-body-return-refusal) / d7-145-02 (subagent-fn), a different file so not a duplicate; one FP-check claim is false and corrected on record: docs/bugs cites this test file in 7 docs (0003/0016/0106/0131/0142/0146/0150), not 0, but none cite :341-343 or :397-409 and an import dedupe merges/renames/deletes no it(), so the witness-list carve-out does not apply; fixer notes: the file (111834a5, 2026-07-26) predates the helper (f593d10e, 2026-09-12) and is absent from its header roster, NOOP_CHECKPOINT at :397 is also consumed by the producer-level block at :559 that confirmed sibling d7-140-02 covers, and tests/helpers/tool-call-dispatch-harness.ts:51/81 exports an identical span()/NOOP_CHECKPOINT (no mutator) for the createProductionProducerDeps→executeBody path this file's second layer uses — coordinate the import home with that fix (triage: claude-fable-5-1)
