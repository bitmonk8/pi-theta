---
id: pending
title: Bug 0451's Live line credits tests/live/double-session-start-live.test.ts with confirming delivery of the rerouted factory notes, but the cell never reads the repeat-start note and asserts the drain-state note is absent
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0451-factory-lifecycle-notes-bypass-fallback-chain.md:203-205
  - tests/live/double-session-start-live.test.ts:314-392
  - tests/live/double-session-start-live.test.ts:425-439
  - src/extension/factory.ts:799-817
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0451's Live line credits tests/live/double-session-start-live.test.ts with confirming delivery of the rerouted factory notes, but the cell never reads the repeat-start note and asserts the drain-state note is absent

## Observation
Bug 0451 moved two factory lifecycle notes (the repeat-`session_start` supersession note and the drain-state dispatch-refusal note) onto `sendSystemNote`. Its `Live:` line says the live cell `tests/live/double-session-start-live.test.ts` "asserts note-channel observables, confirming the rerouted `sendSystemNote` delivery works on a live host". Residual 1 then leans on "the live cell above" as coverage for the production option-1 injection. The cell does run the repeat-start pass (a second `bindExtensions`). But none of its five assertions reads the repeat-start note's content, and the one assertion that concerns the drain-state note requires that note to be ABSENT. The only note the cell requires to be present is the watcher's structural-change note, which is sent from `installHotReload` and not from either factory site that 0451 rerouted.

## Evidence
Claim, `docs/bugs/0451-factory-lifecycle-notes-bypass-fallback-chain.md:203-205` (verbatim, re-read before filing):
```
- Live: `tests/live/double-session-start-live.test.ts` green under the campaign live lock — it drives the factory's `session_start` supersession pass (the rewired repeat-start note site) and asserts note-channel observables, confirming the rerouted `sendSystemNote` delivery works on a live host. Happy-path note delivery is byte-identical to the fork; the fix engages only on a host `pi.sendMessage` throw (a fault path not reproducible live), so no other live-visible outcome changes.
- Residuals:
  1. The production option-1 injection (`systemNoteChannel: sink.currentChannel`) has no dedicated offline behavioural witness; covered by the full suite + b0435 (drives the real `buildSystemNoteDeps` channel) + `cancelled-by-session-shutdown-note.test.ts` (real producer channel) + the live cell above.
```

The rerouted site, `src/extension/factory.ts:799-817`, sends this content:
```
      if (repeatStartWithoutShutdown) {
        // Bug 0451: route the repeat-start supersession note through the
        ...
        const channel = resolveNoteChannel();
        if (channel !== undefined) {
          sendSystemNote(
            {
              content:
                "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation",
              display: true,
```

The live cell: `grep -n "expect" tests/live/double-session-start-live.test.ts` gives 7 lines. Line 74 is the vitest import and line 347 is a comment, so there are five assertions:
- :327: `handle.command(SURVIVING_SLASH_NAME)` `.toBeDefined()` (a registration read).
- :351: `collisionNotes` (the second bind's notes filtered to `COLLISION_CODE`) `.toStrictEqual([])`.
- :368: `shuttingDownNotes` (notes containing `theta /greetlive: extension shutting down`, the drain-state note) `.toStrictEqual([])`, which is an absence assertion.
- :386: `outbound` `.toContain(OUTBOUND_SENTINEL)` (the outbound-render channel).
- :433: `quiesceLines` (console.error) `.toStrictEqual([])`.

The second bind's notes are collected at :341-342 (`rebindNotes = collectSystemNotes(...slice(entriesBeforeSecondBind))`). They are filtered only for `COLLISION_CODE` (:344-345), and otherwise appear only inside a failure message (:356). The only presence requirement on a note is the warm-up precondition at :241-255 / :286-297, and it looks for the `theta watcher: … file(s) added or removed` structural note. Per the cell's own header (:102-107), that note is "delivered via `sendSystemNote` inside `installHotReload`", not by a factory lifecycle site.

Searches (run this session):
- `grep -rln "superseding prior hot-reload generation" tests/live | wc -l`: 0. No live file asserts the repeat-start note content.
- `grep -rn "repeat session_start" tests/live | wc -l`: 0.
- `grep -rn "superseding prior hot-reload generation" tests | wc -l`: 4. All four are offline (tests/b0371-tripwire-trip-sites-wired.test.ts, tests/b0401-informational-notes-omit-details.test.ts, tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts, tests/helpers/watch-arming-harness.ts, from `grep -c … -r tests`).
- `grep -n "double-session-start\|H8a\|repeat-start" docs/plan_topics/coverage-matrix.md`: 0 hits. No matrix row names this cell for the repeat-start note.

## Why this is a problem
The Live line reads as host-level proof that the rerouted note reaches the transcript ("confirming the rerouted `sendSystemNote` delivery works on a live host"). The cited cell proves something narrower: the repeat-start pass runs on a live host without a collision note, without a shutting-down note at dispatch, and without a leaked watcher. If the rerouted repeat-start note were silently dropped, the cell would stay green. For example, if `resolveNoteChannel()` returned `undefined` at :807, the `if` skips the send. Residual 1 inherits the same overstatement when it counts "the live cell above" as coverage for the unwitnessed option-1 injection. Also, the cell is a tests/live/** witness, so it is not gate-proven. Evidence is weaker than the wording.

## Suggested direction (non-binding, optional)
Reword the Live line and Residual 1 to what the cell actually shows: the supersession pass on the rewired tree runs live without regressing the 0021/0024 observables. It should not claim that rerouted-note delivery is confirmed. Alternatively, add a presence assertion on the repeat-start note to a live cell and cite that.

## False-positive check
- Opened the whole assertion set of tests/live/double-session-start-live.test.ts (all 7 `expect` lines listed above, plus the `failLoudly` warm-up precondition) and confirmed none reads the repeat-start content.
- Confirmed the drain-state note (`SHUTTING_DOWN_NOTE`, :119) is asserted only for absence (:368-377).
- Representations covered: the bug-doc Witness/Live lines in 0451 (the offline witness tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts exists and is not challenged here); test file names and bodies (the three greps above over tests/ and tests/live); coverage-matrix rows (0 hits); AGENTS.md gate names (none carries a live gate for this note); CHANGELOG (not consulted as proof).
- Checked the sibling records that cite the same cell. 0454:238-240 claims only that `sendSystemNote` "still delivers system notes end-to-end", and the warm-up structural note (sent via `sendSystemNote`) supports that, so 0454 is not filed. 0453:211 records "Live: not run" honestly, so it is not filed.
- I did not adjudicate whether the fix is correct. Only the strength of the live claim is at issue.

## Triage
verdict: questionable — accounting verified: 0451:203-205 says the live cell "asserts note-channel observables, confirming the rerouted `sendSystemNote` delivery works", but tests/live/double-session-start-live.test.ts has five assertions (:327 registration toBeDefined, :351 collision notes [], :368 drain-state SHUTTING_DOWN_NOTE [] (absence only), :386 outbound toContain, :433 quiesce lines []). The only note it requires to be present is the installHotReload structural watcher note (:241-255). The factory.ts:807-817 repeat-start content appears in 0 tests/live files; its 4 test hits are all offline. The claimed matrix path docs/plan_topics/ does not exist, but docs/reference/coverage-matrix.md also has no row for this cell. Rewording the Live line and Residual 1 is a human ruling (overstated-strength is never confirmed) (triage: claude-opus-5-5)
