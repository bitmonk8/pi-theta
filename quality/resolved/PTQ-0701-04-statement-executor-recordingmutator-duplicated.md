---
id: PTQ-0701
title: statement-executor.test.ts's RecordingMutator class is redeclared byte-identical (modulo one parameter name) in six other test files with no tests/helpers/ home
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/statement-executor.test.ts:179-196
  - tests/effectful-statement-host.test.ts:145-162
  - tests/tool-calls-off-surface-live-wiring.test.ts:182-199
  - tests/b0307-empty-template-parity.test.ts:110-127
  - tests/b0307-value-position-query-err-binds.test.ts:129-146
  - tests/b0351-value-position-query-success-binds-ok.test.ts:156-173
  - tests/b0387-block-expr-tail-query-consumption.test.ts:171-188
sites: 7
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# statement-executor.test.ts's RecordingMutator class is redeclared byte-identical (modulo one parameter name) in six other test files with no tests/helpers/ home

## Observation
`tests/statement-executor.test.ts` declares a `class RecordingMutator
implements CommittedConversationMutator` with a `readonly calls: string[]`
log and five methods (`truncate`/`rewrite`/`replace`/`remove`/
`injectCompensatingTurn`) that each push a labelled string onto `calls`. Six
other test files (`effectful-statement-host.test.ts`,
`tool-calls-off-surface-live-wiring.test.ts`,
`b0307-empty-template-parity.test.ts`,
`b0307-value-position-query-err-binds.test.ts`,
`b0351-value-position-query-success-binds-ok.test.ts`, and
`b0387-block-expr-tail-query-consumption.test.ts`) each declare the identical
class — same field, same five method bodies — differing from
`statement-executor.test.ts`'s copy only in the parameter name used inside
the four surface-id methods (`surfaceId` vs `id`). No `tests/helpers/` module
exports this class.

## Evidence
`tests/statement-executor.test.ts:179-196` (in-scope copy, `surfaceId`
naming):
```ts
class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(surfaceId: string): void {
    this.calls.push(`truncate:${surfaceId}`);
  }
  rewrite(surfaceId: string): void {
    this.calls.push(`rewrite:${surfaceId}`);
  }
  replace(surfaceId: string): void {
    this.calls.push(`replace:${surfaceId}`);
  }
  remove(surfaceId: string): void {
    this.calls.push(`remove:${surfaceId}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
    this.calls.push(`inject:${surface.id}`);
  }
}
```

`tests/effectful-statement-host.test.ts:145-162` (identical apart from the
`id` parameter name):
```ts
class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(id: string): void {
    this.calls.push(`truncate:${id}`);
  }
  rewrite(id: string): void {
    this.calls.push(`rewrite:${id}`);
  }
  replace(id: string): void {
    this.calls.push(`replace:${id}`);
  }
  remove(id: string): void {
    this.calls.push(`remove:${id}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
    this.calls.push(`inject:${surface.id}`);
  }
}
```

`tests/tool-calls-off-surface-live-wiring.test.ts:182-199` — the same `id`
naming, re-read verbatim immediately before filing, byte-identical to the
effectful-statement-host excerpt above.

`tests/b0307-empty-template-parity.test.ts:110-127`,
`tests/b0307-value-position-query-err-binds.test.ts:129-146`,
`tests/b0351-value-position-query-success-binds-ok.test.ts:156-173`, and
`tests/b0387-block-expr-tail-query-consumption.test.ts:171-188` all carry the
same `id`-parameter body, confirmed identical to the excerpt above by direct
read of each site.

Exact search: `grep -rln "class RecordingMutator implements
CommittedConversationMutator" tests/*.test.ts` returns exactly these seven
files and no others. `grep -rl "RecordingMutator" tests/helpers/*.ts` returns
no hits — no `tests/helpers/` module exports this class under any name.

## Why this is a problem
The same five-method recording double is authored seven separate times
rather than once, with the only variation across all seven copies being a
single local parameter name. Each of the seven files independently owns the
"record every mutating call so an ERR-8/ERR-9 non-mutation assertion can
read `.calls`" contract; a change to `CommittedConversationMutator`'s method
signatures would need to be applied by hand in all seven bodies to keep them
in sync, and no single canonical declaration exists for a new caller to
import instead of authoring an eighth copy.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting this `RecordingMutator` shape (parallel
to the existing `tests/helpers/invoke-seam-scaffold.ts`, which already
centralises the no-op-variant `SEAM_NOOP_MUTATOR` for files that need no
call log) would give these seven files one declaration to import instead of
seven to keep in sync.

## False-positive check
- Recording-double carve-out: `RecordingMutator` records calls specifically
  to back each file's own ERR-8/ERR-9/ERR-10/ERR-12 "no committed surface
  mutation" MUST-NOT assertions (e.g. `tests/statement-executor.test.ts`'s
  own `expect(mutator.calls, ...).toEqual([])` cells) — those assertions
  themselves are legitimate negative witnesses and are not challenged here.
  This finding's claim is narrower: the CLASS DEFINITION is copy-pasted
  across seven files with no shared home, which the carve-out (for the
  legitimacy of the witness pattern) does not cover, mirroring the reasoning
  already accepted for this wave's b0307/b0387 AST-harness findings.
- Gate-pin carve-out: none of the seven files match `*gate*.test.ts` or the
  named gate kin.
- docs/bugs/ signature search: `grep -rl "RecordingMutator" docs/bugs/*.md` —
  0 hits; no documented correct-reason red names this class.
- coverage-matrix/bug-doc citation search: `grep -rn "RecordingMutator"
  docs/reference/coverage-matrix.md docs/bugs/*.md` — 0 hits; no test is
  cited by name for this class, so no merge/rename/delete proposal is
  implicated (and none is made here).
- Overlap check against this wave's own filings:
  `qw20260917154546-d7-02-b0307-ast-harness-duplicated.md` already cites the
  identical `RecordingMutator` body as part of a larger nine-piece bundle
  shared between the two b0307 files, and
  `qw20260917154546-d7-02-b0387-ast-executor-harness-duplicated.md` extends
  that to b0387 as a third member of the same clone family. This finding
  cites those same three sites again (as required by the evidence rule to
  name every counted occurrence) alongside four further, previously uncited
  sites this class also recurs in
  (`tests/statement-executor.test.ts` — this wave's own in-scope file — plus
  `tests/effectful-statement-host.test.ts` and
  `tests/tool-calls-off-surface-live-wiring.test.ts`), and narrows its root
  cause to the `RecordingMutator` class alone rather than the wider
  AST-builder bundle those two findings describe, since
  `tests/statement-executor.test.ts` does not share that file family's
  `span`/`stringExpr`/`letStmt`/`realEnv` naming shape.
- Coverage-drift check: this finding does not claim any behaviour is
  untested; it is scoped to the duplicated class definition alone, not to
  any of the seven files' distinct test bodies or the specific ERR-*
  assertions each file reads `.calls` through.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all seven copies start at exactly the cited lines (179/145/182/110/129/156/171, 18 lines each); extracting each class and diffing shows six byte-identical bodies and statement-executor's differing only in `surfaceId` vs `id` across the four surface-id methods, all against the same 5-method `CommittedConversationMutator` (src/runtime/terminal-outcomes.ts:57-68); every copy is live (`new RecordingMutator` 3×/1×/1×/1×/1×/1×/1×); no `tests/helpers/` export exists (0 hits) while invoke-seam-scaffold.ts:44 already homes the no-op sibling `SEAM_NOOP_MUTATOR`; in-scope D7 copy-paste-fixture class under tests/, no *gate* files, 0 docs/bugs and 0 coverage-matrix hits for the class name and helper extraction proposes no merge/rename/delete. Two FP-check inaccuracies corrected on record without changing the verdict: (1) the stated grep returns 9 files, not 7 — the two uncited hits (b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:345, composition-producer.test.ts:136) are a same-named 7-line NO-OP class with no `calls` field, a different shape already covered by the confirmed d7-02-composition-producer filing, so the seven recording copies are correctly counted; (2) only statement-executor.test.ts:609/637 actually reads `.calls` in an assertion — the other six never read it, which removes rather than triggers the negative-witness carve-out. Not a duplicate: TRIAGE_LOG's 2026-09-11 human ruling protects the src/ empty handlePartialTerminalOutcome body (D2), not this test-side class definition, and a helper extraction preserves that witness; same-wave siblings d7-02-b0307 and d7-02-b0387 (both confirmed) cover the wider AST bundle on three of these files and their triage explicitly named this filing as the disjoint RecordingMutator-only continuation adding statement-executor/effectful-statement-host/tool-calls-off-surface-live-wiring/b0351; no accepted PTQ cites the class (triage: claude-fable-5-1)
