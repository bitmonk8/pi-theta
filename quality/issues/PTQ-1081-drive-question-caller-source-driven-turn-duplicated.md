---
id: PTQ-1081
title: The DRIVE_QUESTION constant, the CALLER_SOURCE fixture and the healthy-control driven-turn assertion block are duplicated verbatim between the b0267 and b0270 live cells
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:148-163
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:362-378
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:159-174
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:408-424
sites: 2
fix_scope: module
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The DRIVE_QUESTION constant, the CALLER_SOURCE fixture and the healthy-control driven-turn assertion block are duplicated verbatim between the b0267 and b0270 live cells

## Observation
`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`
and `tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts`
each declare a byte-identical `DRIVE_QUESTION` string constant, a
byte-identical `CALLER_SOURCE` fixture (including its doc comment) built
from that constant, and — at the end of the healthy-control half of the same
`it()` — a byte-identical (apart from one comment line-wrap) three-assertion
block that drives the caller and checks `driven.userTexts` and
`driven.systemNotes`. Neither file imports this shared content from the
other or from any `tests/helpers/` or `tests/live/harness.ts` module.

## Evidence

`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:148-163`:
```ts
const DRIVE_QUESTION = "What is 263 plus 514? Answer with the number only.";

/**
 * The caller, identical in both workspaces: `mode: prompt`, one `tools:`
 * `.theta` entry naming the subagent-mode callee, and one `@`…`` query so the
 * healthy half has a real turn to drive.
 */
const CALLER_SOURCE = [
  "---",
  "mode: prompt",
  "tools:",
  `  - ./${CALLEE_STEM}.theta as callee`,
  "---",
  `let r = @\`${DRIVE_QUESTION}\`?`,
  "r",
  "",
].join("\n");
```

`tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:159-174`
(byte-identical to the excerpt above, including the doc comment):
```ts
const DRIVE_QUESTION = "What is 263 plus 514? Answer with the number only.";

/**
 * The caller, identical in both workspaces: `mode: prompt`, one `tools:`
 * `.theta` entry naming the subagent-mode callee, and one `@`…`` query so the
 * healthy half has a real turn to drive.
 */
const CALLER_SOURCE = [
  "---",
  "mode: prompt",
  "tools:",
  `  - ./${CALLEE_STEM}.theta as callee`,
  "---",
  `let r = @\`${DRIVE_QUESTION}\`?`,
  "r",
  "",
].join("\n");
```

`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:362-378`:
```ts
      const driven = await driveSlashCaptureTurn(control, `/${CALLER_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the caller's QRY-18 rendered template is the deterministic outbound-render channel; " +
          "its absence means the query never reached the provider, so no real model turn ran. " +
          "Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy caller must " +
          "end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await control.dispose();
      controlWorkspace.dispose();
    }
```

`tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:408-424`
(identical apart from one comment's line-wrap, `"the healthy caller " + "must
end with none."` instead of `"the healthy caller must " + "end with none."`,
re-verified with `diff` immediately before filing):
```ts
      const driven = await driveSlashCaptureTurn(control, `/${CALLER_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the caller's QRY-18 rendered template is the deterministic outbound-render channel; " +
          "its absence means the query never reached the provider, so no real model turn ran. " +
          "Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy caller " +
          "must end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await control.dispose();
      controlWorkspace.dispose();
    }
```

Exact search executed immediately before filing: `grep -n "DRIVE_QUESTION\|const CALLER_SOURCE" <each file>`
confirms one `DRIVE_QUESTION` declaration and one `CALLER_SOURCE` declaration
per file at the cited lines; `diff <(sed -n '362,378p' b0267…) <(sed -n
'408,424p' b0270…)` shows exactly the one comment-wrap difference quoted
above and no other divergence across the 17-line span.

## Why this is a problem
Both files' `CALLER_SOURCE` fixture, the `DRIVE_QUESTION` constant it is
built from, and the closing three-assertion "the registered caller RUNS"
block that drives the healthy-control caller and checks its `userTexts` and
`systemNotes` are typed out twice rather than shared. This is a distinct
duplication from the two functions already extracted into
`tests/helpers/live-diagnostic-oracle.ts` for this pair
(`renderedRows`/`rowsLocatedAt`/`requireNoteChannel` per the fixed `PTQ-0525`,
and the `CLEAN_STEM` vacuity guard per the fixed `PTQ-1024`): neither of
those fixes touched the arithmetic-question fixture or the driven-turn
assertion block, which remain hand-typed copies in both files. A change to
the shared drive question, the caller fixture's shape, or the driven-turn
assertion's rationale prose would need the identical edit applied
independently at both sites.

## Suggested direction (non-binding, optional)
`tests/helpers/live-diagnostic-oracle.ts` already hosts the shared fixture
builders and registration-assertion helpers these same two files import
(`liveRegistryMessagePattern`, `vacuityGuardTheta`,
`requireVacuityGuardRegistered`); a `promptCallerTheta(calleeStem, question)`
fixture builder and a `requireHealthyCallerDrive(handle, callerStem,
question)` assertion beside them is the shape these two files' identical
bodies already point at, not a new design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns; not applicable.
- Recording-double check: `driven.userTexts`/`driven.systemNotes` are read
  off a real, settled `SessionManager` drive result for a positive assertion
  ("the caller drives" / "ends with none"), not a call-recording double
  backing a "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -l "b0267live\|b0270live" docs/bugs/*.md`
  shows each file cited by its own numbered bug document (0267, 0270) by
  file name as that bug's live-cell witness; this finding proposes no merge,
  rename, or deletion of either file or its `it()` cell, only that the
  `DRIVE_QUESTION`/`CALLER_SOURCE`/driven-turn-assertion content is
  duplicated.
- coverage-matrix/bug-doc citation search: `grep -n "b0267live-callee-post-parse-errors\|b0270live-callee-tools-missing-theta-path"
  docs/reference/coverage-matrix.md` returns 0 hits; no cited witness line is
  disturbed.
- Overlap check: `grep -rl "DRIVE_QUESTION"` across `quality/issues/*.md
  quality/resolved/*.md quality/intake/*.md` before filing returned only
  `PTQ-1048` (resolved), whose location list names
  `b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts`,
  `b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts`
  and `b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts` — three
  files entirely disjoint from the two cited here, and its own evidence
  additionally cites `summand constants` and a `child source` shape this
  finding does not (the b0267/b0270 pair has no "summand" fixture and a
  different `CALLER_SOURCE`/`CALLEE_SOURCE` split). `PTQ-0525` and `PTQ-1024`
  (both resolved) cover this same file pair but a disjoint set of
  functions/fixtures (the registry-oracle reading block and the `CLEAN_STEM`
  vacuity guard respectively), confirmed by direct read of both resolved
  findings' Evidence sections, neither of which cites `DRIVE_QUESTION`,
  `CALLER_SOURCE`, or the closing driven-turn assertion block.
- Live-suite posture check: this finding does not touch either file's
  `requireLiveProvider()` precondition or its skip posture.
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated fixture/constant/assertion content inside
  tests that already exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the exact cited lines; mktemp sed-range diff shows b0267:148-163 ≡ b0270:159-174 byte-identical (DRIVE_QUESTION + CALLER_SOURCE incl. doc comment) and b0267:362-378 vs b0270:408-424 differing only at the one string-literal wrap on lines 11-12 (same runtime message), with the preceding 4-line "the registered caller RUNS" comment also identical; neither file imports any caller-fixture/driven-turn helper (both import only liveRegistryMessagePattern/renderedRows/rowsLocatedAt/requireNoteChannel/vacuityGuardTheta/requireVacuityGuardRegistered from live-diagnostic-oracle); in scope for D7 copy-paste fixture/boilerplate duplication in tests/live/; no carve-out binds (not a *gate* file; positive assertion over a real settled drive, not a recording double; no merge/rename/delete of the bug-0267/0270 witness cells; 0 coverage-matrix hits; failLoudly posture untouched); not a duplicate — `DRIVE_QUESTION|CALLER_SOURCE` across quality/{issues,resolved,intake} hits only resolved PTQ-1048 (b0271/b0275/b0280, disjoint files, computed-sum fixture), resolved PTQ-0525/PTQ-1024 cover this pair's registry-oracle and CLEAN_STEM guard only, open PTQ-1062/PTQ-1041 are different file cohorts, and no qw20260918220713 sibling touches these files. Accounting notes for the fixer: (1) the identical `DRIVE_QUESTION` literal also recurs in b0268live:115 and as `CONTROL_QUESTION` in unterminated-template-registration-live-cell:147 with prose-divergent QRY-18/systemNotes blocks (different fixture shape, so correctly not counted here but eligible for the same shared constant); (2) PTQ-1048's fix already landed `toolsChainRootSource`/`expectToolsChainTurn` in live-diagnostic-oracle.ts with this exact shape over a different (computed-sum) question — the natural fix is parameterising those rather than minting a parallel `promptCallerTheta`/`requireHealthyCallerDrive` pair (triage: claude-fable-5-1)
