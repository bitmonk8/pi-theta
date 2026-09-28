---
id: pending
title: Bug 0375's fix record says its live cell dispatches `/greetlive` "through the retained drain-state arm-(b) 'extension shutting down' path", but that cell asserts the arm-(b) note is absent and dispatches only before shutdown
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0375-excised-degraded-arm-persists.md:134
  - tests/live/double-session-start-live.test.ts:119
  - tests/live/double-session-start-live.test.ts:184
  - tests/live/double-session-start-live.test.ts:362-376
  - tests/live/double-session-start-live.test.ts:409-413
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0375's fix record says its live cell dispatches `/greetlive` "through the retained drain-state arm-(b) 'extension shutting down' path", but that cell asserts the arm-(b) note is absent and dispatches only before shutdown

## Observation
Bug 0375 (Status: fixed 0.380.0) collapsed the drain-state `DispatchArm` to `"dispatch" | "shutting-down"`. Its Verification item (3) says the adjacent live cell `tests/live/double-session-start-live.test.ts` covers "a `/greetlive` dispatch through the retained drain-state arm-(b) 'extension shutting down' path". The cell does dispatch `/greetlive` once. That dispatch runs on the live session before churn 1 and before `session_shutdown`, and the cell asserts that no `theta /greetlive: extension shutting down` note appears (`toStrictEqual([])`). After shutdown the cell dispatches nothing. So the live run never takes the arm-(b) path. It takes the `"dispatch"` arm and pins arm (b) as absent. The offline witness `tests/b0375-degraded-excision-witness.test.ts` exists and is not in question.

## Evidence
Claim side, `docs/bugs/0375-excised-degraded-arm-persists.md:134` (single line, verbatim):
```
- Verification: SOLID — (1) the witness reds when the four tracked files are reverted to HEAD (cells 1–3 red for the documented reasons, cell 4 green) then greens 4/4 after byte-exact restore (5/5 `git hash-object` match); (2) full default suite green; (3) live adjacent cell `tests/live/double-session-start-live.test.ts` green (a real `session_start → session_shutdown → dispose` and a `/greetlive` dispatch through the retained drain-state arm-(b) "extension shutting down" path — 0375 changes no registration/drive outcome); (4) `typecheck` + `lint` clean.
```

Evidence side, `tests/live/double-session-start-live.test.ts:119`:
```
const SHUTTING_DOWN_NOTE = `theta /${SURVIVING_SLASH_NAME}: extension shutting down`;
```
`:184` (the file's only `it`):
```
  it("a second bindExtensions supersedes the prior generation: the surviving command is RE-OWNED (no collision note, no shutting-down note at dispatch) and no leaked watcher quiesces after shutdown", async () => {
```
`:362-376` (the single dispatch and its assertion; verbatim):
```
      // hot-reload pass can re-own the name behind this assertion's back.
      const turn = await driveSlashCaptureTurn(handle, `/${SURVIVING_SLASH_NAME}`);

      const shuttingDownNotes = turn.systemNotes.filter((note) =>
        note.includes(SHUTTING_DOWN_NOTE),
      );
      expect.soft(
        shuttingDownNotes,
        `dispatching /${SURVIVING_SLASH_NAME} on a LIVE session answered ` +
          `"${SHUTTING_DOWN_NOTE}": the re-bind pass never re-owned the ` +
          "surviving name, so its registered handler is still bound to the " +
          "superseded generation's DRAINED registry " +
          "(registration-steps.md #surviving-name-re-ownership). Notes from " +
          "this drive: " + JSON.stringify(turn.systemNotes),
      ).toStrictEqual([]);
```
`:409-413` (shutdown happens after the dispatch; nothing is dispatched afterwards):
```
      // Graceful shutdown then dispose: the harness emits `session_shutdown`
      // (reason "quit") — detaching the LATEST generation's watcher — then
      // invalidates the runtime via `session.dispose()`.
      await handle.dispose();
      handleDisposed = true;
```

Fix-time state: `git show 7879011d:tests/live/double-session-start-live.test.ts` (the bug-0375 fix commit) has the same single `driveSlashCaptureTurn` call (`:390`) followed by the `shuttingDownNotes` `.toStrictEqual([])` assertion (`:392-403`). The cell's disposition did not change after the record was written.

Searches run in this session:
- `grep -rn "extension shutting down" tests/live` → 2 hits, both in `double-session-start-live.test.ts` (`:38`, a header comment describing the pre-bug-0024 symptom, and `:119`, the constant used only in the absence assertion). No live cell asserts arm (b) present.
- `grep -rln "extension shutting down" tests --include=*.ts | grep -v tests/live` → 8 offline files (b0371-tripwire-trip-sites-wired, b0401-informational-notes-omit-details, b0451-factory-lifecycle-notes-fallback-chain, drain-gated-dispatch-integration, drain-state-contract, helpers/watch-arming-harness, rebind-self-collision-reownership, supersession-inflight-rebuild-quiesce). Arm (b) is covered offline, not live.
- `grep -rn "0375\|degraded-needs-reload" tests/live` → 0 hits.

## Why this is a problem
The record credits a live run with taking the retained arm-(b) path. The named cell exercises the opposite disposition: arm (b) not answering on a live session. So the live-host claim about the arm 0375 kept is unsupported as worded. This is overstated-strength: a live cell is cited as proof of a path it never enters, and in fact asserts is absent.

## Suggested direction (non-binding, optional)
Reword item (3) to what the cell shows: a live `session_start → session_shutdown → dispose` and a pre-shutdown `/greetlive` dispatch through the `"dispatch"` arm with no shutting-down note. Also say that arm (b) itself is witnessed offline (for example `tests/drain-state-contract.test.ts`, one of the 8 offline files above).

## False-positive check
- Read the cell's full `it` body (`:184-445`). There is exactly one `driveSlashCaptureTurn` call (`grep -n "driveSlashCaptureTurn(" tests/live/double-session-start-live.test.ts` → 1 hit, the call site at `:363`; the name otherwise appears only in the import at `:80`). It comes before churn 1 and before `handle.dispose()`.
- Arm (b) is the drain-state `"shutting-down"` arm whose note is `theta /<name>: extension shutting down` (the record's own wording pairs them). The cell's constant `SHUTTING_DOWN_NOTE` is that note, and the cell requires it absent.
- History: the cell was last shaped by bugs 0021/0024/0048/0311 and the RFC-0010 Phase 6 change (`git log -- tests/live/double-session-start-live.test.ts`). At the 0375 fix commit 7879011d it already asserted the absence, so this is not later decay.
- The record names no other live cell: `grep -n "tests/live" docs/bugs/0375-excised-degraded-arm-persists.md` → 1 hit (line 134).
- Not a claim about the fix's truth. The offline witness exists (4 `it` cells, `grep -c -E "^\s*(it|test)\s*\(" tests/b0375-degraded-excision-witness.test.ts` → 4). Only the live-path wording is at issue.

## Triage
verdict: questionable — accounting verified; rewording a record needs a human ruling. 0375.md:134 item (3) says the live cell sends `/greetlive` through arm (b), the "extension shutting down" path. But tests/live/double-session-start-live.test.ts has one `it` (:184). It makes one driveSlashCaptureTurn call (:363), before churn 1 and before handle.dispose() (:412). That call soft-asserts SHUTTING_DOWN_NOTE (:119) absent with toStrictEqual([]) (:365-376), and nothing is dispatched after shutdown. The fix commit 7879011d had the same shape (:390 call, :403 absence). tests/live has only the :38/:119 hits for "extension shutting down". Arm (b) is witnessed only offline (8 files reproduce, e.g. tests/drain-state-contract.test.ts). No other intake file or PTQ tracks this (triage: claude-opus-5-5)
