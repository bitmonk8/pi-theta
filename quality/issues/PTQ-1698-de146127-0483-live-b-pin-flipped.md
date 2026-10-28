---
id: PTQ-1698
title: Bug 0483 still pins live cell B to the in-run oracle replaced by de146127.
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md:545-552
  - tests/live/b0483-host-recovery-live.test.ts:38-43
  - tests/live/b0483-host-recovery-live.test.ts:317-332
  - tests/b0483-host-recovery-ride.test.ts:1120-1160
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0483 still pins live cell B to the in-run oracle replaced by de146127.

## Observation
Bug 0483 identifies live cell B as the old-host in-run recovery witness requiring zero continuations and zero ride notes. Commit `de146127e98743430572de78ab8061fa5665c69e` converted that cell to require a continuation and a ride note on the upgraded host. The cell's comment explicitly records the retirement, but the bug record carries no coordination of that completed conversion. The old in-run shape remains witnessed by the default-suite unit cell, not by current live cell B.

## Evidence
- Claim, `docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md:545-552`, re-read immediately before filing:
  >   - `tests/live/b0483-host-recovery-live.test.ts` +
  >     `tests/live/fixtures/b0483-watchdog-mimic-extension.ts` — H8a, cell A
  >     (`retry.enabled` off, idle-recovery arm: one continuation, one `ride 1/3`
  >     note) and cell B (`retry.enabled` on, 0.80.10 in-run arm: zero
  >     continuations, zero ride notes; fails loudly on a ≥ 0.87 host — retire
  >     or convert it when the dev pin crosses 0.87, item (av)). At HEAD
  >     both red with `systemNotes=["theta /b0483rideidle cancelled"]` /
  >     `["theta /b0483rideinrun cancelled"]`; fixed tree 2/2 green.

- Conversion confirmation, `tests/live/b0483-host-recovery-live.test.ts:38-43`:
  ```ts
  //   B. `retry.enabled: true, baseDelayMs: 1`: current pi bails its post-run
  //      retry after an extension abort. Theta must still ride with exactly one
  //      continuation and one ride note, without depending on host retry being
  //      disabled. This replaces the retired pre-0.87 in-run-retry live cell
  //      (version-bump checklist item (av)); the historical in-run layouts remain
  //      covered by tests/b0483-host-recovery-ride.test.ts.
  ```

- Current live oracle, `tests/live/b0483-host-recovery-live.test.ts:323-332`:
  ```ts
      expectRodeThrough(turn, stem);
      expect(
        turn.continuationTexts,
        `core retry does not survive extension abort on this host; theta must continue once; ` +
          `userTexts=${JSON.stringify(turn.userTexts)}`,
      ).toEqual([PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT]);
      expect(
        turn.rideNotes,
        `exactly one PIC-78 ride note with core retry enabled; systemNotes=${JSON.stringify(turn.systemNotes)}`,
      ).toEqual([rideNote(stem, 1)]);
  ```
  The cell at `:317-321` is titled `(B) retry.enabled on: extension abort settles the host run; theta still sends exactly one continuation and one ride note, and the first query resolves Ok with 777` and enables retry. This is live-only evidence: its source exists, but this wave's default preflight does not prove its execution, and this review did not run it.

- Equivalent witness for the historical in-run layout, `tests/b0483-host-recovery-ride.test.ts:1120-1160`: cell `(2)` scripts an aborted error-stop, `retryRun`, a normally stopped assistant, then idle. Its assertions at `:1151-1155` are:
  ```ts
      expect(
        out.session.sends,
        "ZERO continuation sends: pi's own in-run retry already re-ran the turn",
      ).toEqual([QUERY_TEXT]);
      expectRideNotes(out.pi.notes, 0);
  ```
  This is default-suite, scripted-driver proof under the supplied green preflight, not replacement live-host proof.

- History search, run this session: `git log --format='%H %s' -G 'replaces the retired pre-0.87' -- tests/live/b0483-host-recovery-live.test.ts` returned one commit: `de146127e98743430572de78ab8061fa5665c69e`, `Upgrade Pi build SDK to 1.3.0 and surface blocked bug workflows`. Its diff was opened and changes cell B's continuation and ride-note expectations from empty lists to the singleton expectations quoted above.
- Coordination search, run this session: `rg -n 'de146127|2026-10-19|converted|retired pre' docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md | wc -l` returned `0`. The record was read through its ending; it contains the prospective retirement instruction, not a note recording this conversion and its proof-tier consequence.

## Why this is a problem
This is a flipped witness pin: the named live cell still exists but now proves a different recovery path with the opposite continuation/ride-note cardinalities. The prospective instruction to retire or convert it does not tell readers that the conversion happened. The historical in-run claim therefore cannot be discharged by the current live cell as stated, even though default-suite unit evidence for that layout remains.

## Suggested direction (non-binding, optional)
Preserve the release-era evidence and append dated coordination naming `de146127e98743430572de78ab8061fa5665c69e`, the converted retry-enabled live oracle, and unit cell `(2)` as the remaining scripted witness for the historical in-run layout.

## False-positive check
The live test and the unit equivalent were opened, including their actual assertions rather than just titles. The live comment expressly confirms retirement; the commit diff confirms the oracle flip. The complete bug record has no completed-conversion coordination; its pre-existing retirement instruction is acknowledged rather than treated as absent. This does not dispute the historical release run, ask to restore an obsolete live oracle, or claim a behavior regression. Live-only evidence was not treated as default-gate-proven. No tests were executed.

## Triage
verdict: confirmed — Both stated searches reproduce; de146127 and the live-cell comment explicitly confirm the oracle flip, the complete bug record has no conversion coordination, and no duplicate was found; no tests executed. Append verbatim heading "### Coordination note — 2026-10-19, bug 0483 (Pi SDK 1.3.0)" and paragraph "Commit de146127e98743430572de78ab8061fa5665c69e upgraded the Pi build SDK to 1.3.0 and converted cell B in tests/live/b0483-host-recovery-live.test.ts: with retry enabled, extension abort settles the host run and theta must send exactly one continuation and emit exactly one ride note. Unit cell (2), ‘in-run ride (pi ≤ 0.86 shape)’, in tests/b0483-host-recovery-ride.test.ts retains the historical zero-continuation, zero-ride-note oracle as scripted default-suite evidence, not current live-host proof. The wording above stands as a dated record; current disposition: docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md." (triage: claude-opus-5-5)
