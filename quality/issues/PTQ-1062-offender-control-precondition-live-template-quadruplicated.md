---
id: PTQ-1062
title: The OFFENDER/CONTROL/PRECONDITION registration-refusal live-cell scaffold is byte-identical across four in-scope test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:
  - tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:142-148
  - tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:177-182
  - tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:238-241
  - tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:192-198
  - tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:230-235
  - tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:285-288
  - tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:154-160
  - tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:192-197
  - tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:253-256
  - tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:162-168
  - tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:213-218
  - tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:274-277
sites: 4
fix_scope: cross-module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The OFFENDER/CONTROL/PRECONDITION registration-refusal live-cell scaffold is byte-identical across four in-scope test files

## Observation
Four files in this review's scope (`b0244live-…`, `b0252live-…`,
`b0256live-…`, `b0257live-…`) each declare the identical three-fixture
architecture by hand: a `PRECONDITION_STEM`/`CONTROL_STEM`/`OFFENDER_STEM`
constant triple, a `PRECONDITION_THETA` fixture of the fixed shape
`["---","mode: prompt","---","@\`What is <n1> plus <n2>? Answer with the
number only.\`",""].join("\n")`, an identical precondition-registration
`expect(handle.command(PRECONDITION_STEM), …).toBeDefined()` block whose
failure string is byte-identical across all four files, and an identical
`try { … } finally { await handle.dispose(); workspace.dispose(); }` close.
Each file also carries a `paramsTheta`-shaped fixture builder, the same
`FAIL_CLOSED_MARKERS` check, and the same arithmetic-oracle drive
(`driveSlashCaptureTurn` → `userTexts` contains the bound marker → `text`
contains the computed product/sum) — none of these carry a shared name, so
each is retyped from scratch per file. Search: `grep -l "PRECONDITION_STEM"
tests/live/*.test.ts` → 4 hits, all four in this review's scope (a further 4
files outside scope — `b0263live-…`, `inline-object-key-registration-denial-…`,
`inline-object-stray-close-token-…`, `reserved-keyword-key-field-boundary-…`
— share the same `OFFENDER_STEM` naming, so the pattern is wider than this
scope's four).

## Evidence

`tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:142-148`:
```ts
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
  "",
].join("\n");
```

`tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:154-160`
(byte-identical to the excerpt above):
```ts
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
  "",
].join("\n");
```

`tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:162-168`
(byte-identical again):
```ts
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
  "",
].join("\n");
```

`tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:192-198`
(same shape, different inline numbers):
```ts
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");
```

The precondition-registration assertion, byte-identical failure string, at
all four files:

`tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:177-182`:
```ts
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
```

`tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:230-235`
(byte-identical):
```ts
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
```

`tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:192-197`
(byte-identical):
```ts
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
```

`tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:213-218`
(byte-identical):
```ts
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
```

The `finally` close, byte-identical at all four files:

`tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:238-241`:
```ts
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
```

`tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:285-288`,
`tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:253-256`
and `tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:274-277`
each reproduce the same three lines verbatim.

## Why this is a problem
None of the four files import a shared function for the
precondition/registration/close scaffold; each retypes the same constant
literal, the same failure-message prose, and the same disposal sequence by
hand. A change to the scaffold's own contract (for example, the message
prose the precondition failure carries, or an added disposal step) needs the
identical hand-edit applied at four sites with nothing to signal a copy left
behind, as opposed to the `bootShippedExtension` / `plantThetaWorkspace` /
`requireLiveProvider` triple these same four files already import from the
shared `./harness` module.

## Suggested direction (non-binding, optional)
`tests/helpers/live-diagnostic-oracle.ts` already hosts shared live-cell
fixture builders and registration-assertion helpers used by two of this
review's other files (`b0259live-…`, `b0262live-…`, `b0267live-…`); a
`precondition`/`registrationControl`/`disposeAll`-shaped export there,
observed as the natural home rather than designed here, is where these four
files' identical scaffold already points.

## False-positive check
Gate-pin check: none of the four filenames matches `*gate*.test.ts` or its
named kin. Recording-double check: the scaffold plants fixtures and reads
registration state for a positive-precondition assertion, not a
call-recording double backing a "never called" witness, so the
negative-witness carve-out does not apply. docs/bugs/ signature search:
`grep -l "PRECONDITION_STEM" docs/bugs/*.md` → 0 hits; no bug document pins
this scaffold shape as a documented correct-reason duplicate. Live-suite
convention check: AGENTS.md's live-suite carve-out covers `failLoudly` on a
missing provider as the correct skip posture and stochastic-sentinel
avoidance (bug 0243's shape); it says nothing about a mandate to retype the
precondition/disposal scaffold per file, so this finding does not cross that
carve-out. coverage-matrix/bug-doc citation search: `grep -n
"b0244live-keyless-entry-params-refusal-live-cell\|b0252live-brace-and-angle-annotation-refusal-live-cell\|b0256live-stranded-entry-params-refusal-live-cell\|b0257live-empty-slot-params-refusal-live-cell"
docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge,
rename or deletion of any of the four files or their `it()` blocks, only that
the scaffold could be imported from one place. Prior-filing overlap check:
`grep -rl "PRECONDITION_STEM\|CONTROL_STEM\|OFFENDER_STEM"
quality/issues/*.md quality/resolved/*.md quality/intake/*.md` (before this
filing) returned no hits.

## Triage
verdict: confirmed — independently re-verified: every excerpt reproduces at the exact cited lines in all four files (PRECONDITION_THETA :142/:192/:154/:162, `handle.command(PRECONDITION_STEM)` :178/:231/:193/:214, `} finally {` :238/:285/:253/:274); mktemp sed-range diffs of the precondition assertion (b0244:177-182 vs b0257:213-218) and the fixture (b0244:142-148 vs b0256:154-160) are empty; the four files were added in four separate bug-fix commits (82f9ea05/65e119e4/206e0da9/a6816b96) and none imports tests/helpers/live-diagnostic-oracle.ts, whose existing `expectRegisteredControlThenAbsentSubject` (minted by the PTQ-0619 fix) maps one-to-one onto each cell's inline precondition-`toBeDefined()`/control-`toBeDefined()`/offender-`toBeUndefined()`+`not.toContain()` block and whose `promptTheta` builds the precondition fixture — so this is copy-paste fixture plus not-migrated boilerplate, D7 class; carve-outs re-run (no *gate* file, no recording double, docs/bugs grep 0, coverage-matrix grep 0, failLoudly posture untouched); no open issue tracks these four files' scaffold (PTQ-0619 is fixed and scoped to the three tools-field cells; PTQ-0767 is the subagent-mode fixture in three discovery cells) — but the candidate's own search does NOT reproduce as stated: `grep -l PRECONDITION_STEM tests/live/*.test.ts` → 13 files not 4, and the byte-identical precondition failure prose recurs in 37 tests/live cells, so `sites: 4` is an in-scope floor the fixer should widen from; two stale clauses to disregard: FAIL_CLOSED_MARKERS IS already the shared import (PTQ-0771 migrated these exact four files; only the filter shape is inline), and b0259live does not import the oracle (only b0262live/b0267live do) (triage: claude-fable-5-1)
