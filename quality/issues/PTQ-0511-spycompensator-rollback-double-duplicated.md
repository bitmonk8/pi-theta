---
id: PTQ-0511
title: A SpyCompensator RollbackCompensator recording double is redeclared byte-for-byte across three test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/invoke-cancellation-facets.test.ts:64-76
  - tests/query-tool-loop.test.ts:140-154
  - tests/tool-calls-execute-lowering.test.ts:90-102
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# A SpyCompensator RollbackCompensator recording double is redeclared byte-for-byte across three test files

## Observation
Each of the three files below declares its own class named `SpyCompensator implements RollbackCompensator`, preceded by the identical doc comment `/** A \`RollbackCompensator\` spy: records any forbidden compensating operation. */`, with all three of `RollbackCompensator`'s methods (`unwindSideEffect`, `appendCompensatingTurn`, `enumerateCompletedSideEffects`) each pushing an identically-shaped tagged string (`unwind:${id}`, `append:${turn.id}`, `enumerate:${effects.length}`) into a `calls: string[]` field. The three declarations are identical apart from blank-line spacing between methods. `tests/helpers/` holds no module exporting this double; each file re-derives it locally.

## Evidence
tests/invoke-cancellation-facets.test.ts:64-76:
```ts
/** A `RollbackCompensator` spy: records any forbidden compensating operation. */
class SpyCompensator implements RollbackCompensator {
  readonly calls: string[] = [];
  unwindSideEffect(id: string): void {
    this.calls.push(`unwind:${id}`);
  }
  appendCompensatingTurn(turn: CompensatingTurn): void {
    this.calls.push(`append:${turn.id}`);
  }
  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void {
    this.calls.push(`enumerate:${effects.length}`);
  }
}
```

tests/query-tool-loop.test.ts:140-154 (identical body, blank line between each method):
```ts
/** A `RollbackCompensator` spy: records any forbidden compensating operation. */
class SpyCompensator implements RollbackCompensator {
  readonly calls: string[] = [];

  unwindSideEffect(id: string): void {
    this.calls.push(`unwind:${id}`);
  }

  appendCompensatingTurn(turn: CompensatingTurn): void {
    this.calls.push(`append:${turn.id}`);
  }

  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void {
    this.calls.push(`enumerate:${effects.length}`);
  }
}
```

tests/tool-calls-execute-lowering.test.ts:90-102 — byte-identical to the first excerpt (`diff` on the two class bodies produces no output):
```ts
/** A `RollbackCompensator` spy: records any forbidden compensating operation. */
class SpyCompensator implements RollbackCompensator {
  readonly calls: string[] = [];
  unwindSideEffect(id: string): void {
    this.calls.push(`unwind:${id}`);
  }
  appendCompensatingTurn(turn: CompensatingTurn): void {
    this.calls.push(`append:${turn.id}`);
  }
  enumerateCompletedSideEffects(effects: readonly CommittedSideEffect[]): void {
    this.calls.push(`enumerate:${effects.length}`);
  }
}
```

Exact search: `grep -n "class SpyCompensator implements RollbackCompensator" tests/*.test.ts` → exactly these three files, one match each. A fourth file using the same interface, `tests/no-rollback.test.ts:99`, builds an inline object literal rather than this class, so it is not a fourth copy of this specific double. `ls tests/helpers/` (checked in full, 38 modules) shows no module named for, or exporting, a `RollbackCompensator` double.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the same recording double — a `RollbackCompensator` whose three methods each push a tagged string onto a shared `calls` array so a test can assert nothing was called — is hand-rolled three separate times under the same class name and the same doc comment rather than imported once. `tests/helpers/` is this suite's established home for shared fakes and recording doubles (`fake-clock.ts`, `spy-validator.ts`, `invoke-seam-scaffold.ts`'s `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR`, and 34 others), which is why the absence of a matching module here is observable: all three sites had to re-derive the identical class instead of importing it. The assertions each file drives against `spy.calls` (asserting `toEqual([])`, a MUST-NOT-called negative witness) are legitimate under the recording-double carve-out; this finding is about the class's own triplicated hand-written implementation, not about those assertions.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting a `SpyCompensator` (or extending the existing `invoke-seam-scaffold.ts`, which already exports the no-op `Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator` triad for this same test family) is the home the existing convention already points at; the fix stage owns the actual extraction.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or a kin pattern, and this finding does not touch a pinned count or inventory; not applicable.
- Recording-double carve-out: the carve-out exempts a recording double's negative-witness assertion ("never called") from being filed as an assertion that cannot fail; it does not exempt the double's own repeated hand-written implementation from the duplication class, which is what this finding cites. Checked and confirmed distinct — no assertion driven by any `spy.calls` read in any of the three files is cited or challenged here.
- docs/bugs/ signature search: `grep -rl "SpyCompensator" docs/bugs/*.md` → 0 hits; no documented correct-reason-red signature names this class.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-cancellation-facets\|query-tool-loop.test\|tool-calls-execute-lowering" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename, or deletion of any of the three files or any `it()`/`describe()`, only that the duplicated fixture class could be imported rather than re-derived.
- Prior-filing search: `grep -rl "SpyCompensator" quality/intake quality/resolved` → 0 hits before this filing; no existing finding covers this specific fixture (the sibling `RecordingCheckpoint` double in the same three files is already filed separately as qw20260917154546-d7-01-recordingcheckpoint-fixture-duplicated.md, which explicitly does not cite `SpyCompensator`).
- Coverage-drift check: the finding is about a fixture that exists in test code today and does not assert any behaviour path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three `class SpyCompensator implements RollbackCompensator` declarations reproduce at the cited lines (query-tool-loop's closing brace is at 155, one-line drift), `diff` of the extracted bodies shows copy 1 ≡ copy 3 byte-for-byte and copy 2 identical modulo blank lines, `grep` over tests/ yields exactly these 3 class sites (no-rollback.test.ts:99 is an inline literal), every copy is live (`new SpyCompensator()` in each file), no tests/helpers/ module (40 present) exports a compensator double, none of the files is a gate/live test or cited by docs/bugs or coverage-matrix.md, and `SpyCompensator` appears in no resolved/open PTQ — the in-wave RecordingCheckpoint sibling cites a distinct double; a clean copy-paste-double D7 filing whose fix is a mechanical extraction (triage: claude-fable-5-1)
