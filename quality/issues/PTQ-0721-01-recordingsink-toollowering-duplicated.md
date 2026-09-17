---
id: PTQ-0721
title: A ToolLoweringSink recording double is redeclared in three in-scope test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tool-calls-execute-lowering.test.ts:80-88
  - tests/tool-calls-off-surface-live-wiring.test.ts:66-76
  - tests/tool-calls-off-surface-routing.test.ts:55-64
sites: 3
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# A ToolLoweringSink recording double is redeclared in three in-scope test files

## Observation
Three files in this review's scope each declare their own local `class RecordingSink implements ToolLoweringSink` to record `diagnostic()` and `systemNote()` calls for assertions. The declarations in `tool-calls-off-surface-live-wiring.test.ts` and `tool-calls-off-surface-routing.test.ts` are byte-identical (`diagnostics: Diagnostic[]`, `systemNotes: string[]`, two matching methods). The declaration in `tool-calls-execute-lowering.test.ts` records the same two channels into a single merged `emissions: string[]` array instead of two separate arrays, but exists for the identical purpose: witnessing which normative side-channel emissions a `ToolLoweringSink`-consuming function under test made.

## Evidence
tests/tool-calls-execute-lowering.test.ts:80-88
```ts
class RecordingSink implements ToolLoweringSink {
  readonly emissions: string[] = [];
  diagnostic(diag: Diagnostic): void {
    this.emissions.push(`diagnostic:${diag.code}`);
  }
  systemNote(message: string): void {
    this.emissions.push(`system-note:${message}`);
  }
}
```

tests/tool-calls-off-surface-live-wiring.test.ts:66-76
```ts
/** A `ToolLoweringSink` recording every normative side-channel emission. */
class RecordingSink implements ToolLoweringSink {
  readonly diagnostics: Diagnostic[] = [];
  readonly systemNotes: string[] = [];
  diagnostic(diag: Diagnostic): void {
    this.diagnostics.push(diag);
  }
  systemNote(message: string): void {
    this.systemNotes.push(message);
  }
}
```

tests/tool-calls-off-surface-routing.test.ts:55-64
```ts
/**
 * A `ToolLoweringSink` recording every normative side-channel emission so a test
 * can count diagnostics / system notes and assert on the emitted diagnostic
 * shape.
 */
class RecordingSink implements ToolLoweringSink {
  readonly diagnostics: Diagnostic[] = [];
  readonly systemNotes: string[] = [];
  diagnostic(diag: Diagnostic): void {
    this.diagnostics.push(diag);
  }
  systemNote(message: string): void {
    this.systemNotes.push(message);
  }
}
```

Exact search: `grep -rn "class RecordingSink" tests/` returns exactly 3 hits, all three inside this review's scope (no occurrence outside the scoped files).

## Why this is a problem
All three classes exist to satisfy the same `ToolLoweringSink` interface (`diagnostic(diag): void`, `systemNote(message): void`) imported from `../src/runtime/tool-call-execute`, for the same purpose: letting a test assert on which side-channel emissions a lowering/routing function made. Two of the three declarations are verbatim identical, including the doc comment wording ("recording every normative side-channel emission"), which is direct evidence the second file's author copied the shape from an existing sibling rather than importing a shared implementation. `tests/helpers/` already holds analogous single-purpose recording doubles for other seams (e.g. `tool-call-dispatch-harness.ts` centralises a shared production-driving harness for two sibling files with the stated rationale that each file "independently redeclared an identical" set of pieces) — the same shape of problem recurs here for `ToolLoweringSink`.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting one `RecordingToolLoweringSink` (with both a merged `emissions` view and, if still wanted, the split `diagnostics`/`systemNotes` arrays) would let all three files import one implementation instead of maintaining three copies in lockstep as the `ToolLoweringSink` interface evolves.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named gate kinds; not applicable.
- Recording-double carve-out: the carve-out protects the *use* of a recording double as a legitimate MUST-NOT witness, not the repeated *re-implementation* of an identical double across files — this finding is about the duplication of the implementation, not about the validity of using a recording double for negative witnesses.
- docs/bugs/ signature search: `grep -rl "RecordingSink\|ToolLoweringSink" docs/bugs/` returned no hits — no documented correct-reason red cites this class.
- coverage-matrix/bug-doc citation search: `grep -rl "RecordingSink\|ToolLoweringSink" docs/reference/coverage-matrix.md docs/bugs/` returned no hits — none of the three tests or classes are pinned by name in the coverage matrix or a bug doc's witness list.
- This finding does not propose any test should exist, be merged, or be deleted — it is scoped to the repeated hand-authored fixture code in the three cited files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (execute-lowering:80-88, live-wiring:67-76, routing:56-64); the two-array copies are byte-identical in class body and the `emissions` copy implements the same two-method `ToolLoweringSink` (src/runtime/tool-call-execute.ts:134-137) for the same recording purpose; `grep -rn "class RecordingSink"` across src/ extensions/ tools/ tests/ returns exactly those 3 hits; no shared recording sink exists in tests/helpers/ (invoke-seam-scaffold.ts exports only the discarding SEAM_NOOP_SINK, so PTQ-0244/0301/0344 cover a different double and PTQ-0190 is a D2 interface finding, not this duplication); no coverage-matrix or docs/bugs/ pin on the class or the three files; the tool-call-dispatch-harness.ts "redeclared an identical" rationale quoted is real (line 5) — in-scope D7 copy-paste-double, mechanical dedupe (triage: claude-fable-5-1)
