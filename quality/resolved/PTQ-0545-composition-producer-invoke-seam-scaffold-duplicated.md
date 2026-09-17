---
id: PTQ-0545
title: composition-producer.test.ts reimplements tests/helpers/invoke-seam-scaffold.ts's no-op checkpoint/sink/mutator/span quadruple instead of importing it
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/composition-producer.test.ts:86-88
  - tests/composition-producer.test.ts:125-142
  - tests/helpers/invoke-seam-scaffold.ts:28-53
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# composition-producer.test.ts reimplements tests/helpers/invoke-seam-scaffold.ts's no-op checkpoint/sink/mutator/span quadruple instead of importing it

## Observation
`tests/composition-producer.test.ts` declares its own module-scope
`span()` function, `NOOP_CHECKPOINT` constant, `NOOP_SINK` constant, and
`RecordingMutator` class. `tests/helpers/invoke-seam-scaffold.ts` already
exports the identical four constructs — `span()`, `SEAM_NOOP_CHECKPOINT`,
`SEAM_NOOP_SINK`, `SEAM_NOOP_MUTATOR` — built for exactly this purpose (an
inert `Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator`/
throwaway `SourceRange` quadruple for a file driving the real `executeBody`).
The reviewed file imports none of them.

## Evidence
tests/composition-producer.test.ts:86-88 — the reimplemented `span()`:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/composition-producer.test.ts:125-142 — the reimplemented checkpoint,
sink, and mutator:
```ts
/** A no-op `Checkpoint` (an already-resolved promise). */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

class RecordingMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

tests/helpers/invoke-seam-scaffold.ts:28-53 — the canonical exports, value-
for-value identical to the reviewed file's own copies above:
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

Search: `grep -rl "CommittedConversationMutator" tests --include="*.test.ts" | wc -l`
returns 26 test files carrying their own no-op-mutator construction against
the one canonical `tests/helpers/invoke-seam-scaffold.ts` export, of which
`tests/composition-producer.test.ts` is one that imports neither
`SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK`, `SEAM_NOOP_MUTATOR`, nor the
scaffold's `span()`.

## Why this is a problem
This is the copy-paste-fixture class: the reviewed file's `span()`,
`NOOP_CHECKPOINT`, `NOOP_SINK`, and `RecordingMutator` each rebuild a no-op
seam double whose exact shape and no-op bodies `tests/helpers/invoke-seam-
scaffold.ts` already exports under its own name. The scaffold module's own
header states its reason for existing: "the `SEAM_NOOP_CHECKPOINT` /
`SEAM_NOOP_SINK` / `SEAM_NOOP_MUTATOR` no-op triple, `span()`... are
byte-for-byte identical across several `executeBody`-driving invoke/code-call
bug-witness files"; the reviewed file's four local copies are one more
instance of the same shape the scaffold was extracted to collect.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports
`SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK`, `SEAM_NOOP_MUTATOR`, and `span()`
for the same driving-executeBody purpose this file uses its four local
copies for; naming that export is an observation about the file's own stated
scope, not a design for the change.

## False-positive check
- Gate-pin carve-out: `tests/composition-producer.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory that this
  finding touches.
- Recording-double carve-out: `RecordingMutator`'s methods are all no-ops
  with no call log read by any assertion in the file (`grep -n
  "RecordingMutator" tests/composition-producer.test.ts` shows only the
  declaration and the two `new RecordingMutator()` call sites) — it is not a
  MUST-NOT-called negative witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "composition-producer"
  docs/bugs/*.md` — 0 hits; no bug document pins this file's local
  `span`/`NOOP_CHECKPOINT`/`NOOP_SINK`/`RecordingMutator` block or excuses
  keeping it local. The file is presumed green at HEAD (V19e-T status),
  unrelated to this claim.
- coverage-matrix/bug-doc citation search: `grep -n "composition-producer"
  docs/reference/coverage-matrix.md` — hits exist naming the file as a whole
  (its own row), never the cited helper-shaped block; this finding proposes
  no merge, rename, or deletion of the file or any test in it, only that four
  internal no-op constructs could import the existing scaffold instead of
  redeclaring it.
- Reference/callers check: `tests/helpers/invoke-seam-scaffold.ts`'s four
  exports are live, in-use exports (its own header names bug 0294/0295/
  0347/0349 witness files as importers; PTQ-0244/PTQ-0301/PTQ-0344 confirm
  further importers), not a dead-code target being proposed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: tests/composition-producer.test.ts:86-88/125-142 match tests/helpers/invoke-seam-scaffold.ts:31-55 body-for-body (checkpoint/sink/span byte-identical modulo name/`export`/doc-comment; RecordingMutator is a stateless class with the same five no-op methods, instantiated twice at :275 and never read by any assertion, so the recording-double carve-out does not apply), the four constructs feed EffectfulStatementHostDeps→createEffectfulStatementHost→ExecuteBodyDeps at :244-281 (the scaffold's stated executeBody-driving purpose), the file imports nothing from tests/helpers/, no *gate* posture, 0 docs/bugs hits for `composition-producer.test` (the candidate's grep pattern also matched the src/ producer path — its literal counts are off but the substantive claim holds) and 0 coverage-matrix hits (candidate wrongly said hits exist; that removes rather than triggers a carve-out), stated mutator search yields 28 files not 26 (immaterial), and no existing PTQ covers this file — PTQ-0244/0301/0344 were scoped to b0349/b0295/b0347 and PTQ-0278 to the call-with-clause harness (triage: claude-fable-5-1)
