---
id: PTQ-1599
title: "Bug 0073's 0.130.0 fix record cites its live witness as `CELL-A2`, runs `-t \"CELL-A2\"`, and says the cell's title carries that token, but f0917e35 landed the cell as \"bug 0073 cell 64\" and no test contains `CELL-A2`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md:389-390
  - docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md:404-411
  - docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md:433-437
  - docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md:497-499
  - tests/live/live-production-acceptance.test.ts:10816-10817
  - tests/live/live-production-acceptance.test.ts:10866-10885
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0073's 0.130.0 fix record cites its live witness as `CELL-A2`, runs `-t "CELL-A2"`, and says the cell's title carries that token, but f0917e35 landed the cell as "bug 0073 cell 64" and no test contains `CELL-A2`

## Observation
The `## Fix (0.130.0)` section of bug 0073 names its additive H8a live cell by the token `CELL-A2`. It records the filter command `-t "CELL-A2"` as `1 passed | 61 skipped`, cites `CELL-A2` as red-proven, and says in Residual 7 that the cell "carries the literal token `CELL-A2` in its title and header comment for the parent to renumber at merge". The fix commit f0917e35 landed the cell already renumbered, as `describe("H8a-T — bug 0073 cell 64: …")`, and its commit message says "H8a cell 64". No test title or comment under `tests/` contains `CELL-A2`, and the token has never been in the live file's history. The renumbering the residual anticipates did happen in the same commit, but the record's pointer, its command and its statement about the title were not updated to match.

## Evidence
Claim side, `docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md:389-390`:
```
  - `tests/live/live-production-acceptance.test.ts` — ONE additive H8a cell
    (token `CELL-A2`); no existing cell touched.
```
`:404-411`:
```
  - Live: `tests/live/acceptance/` — `Test Files 2 passed (2) / Tests 11 passed
    (11)` (the 11/11 fork baseline), every `assertStderrClean` empty-capture gate
    green. `tests/live/live-production-acceptance.test.ts -t "CELL-A2"` —
    `1 passed | 61 skipped`, the run printing the real structured row
    `{"severity":"error","code":"theta/runtime/cancelled-by-session-shutdown",
    "message":"theta /b73livecancel cancelled by session shutdown (reload)",
    "details":{"event":{"reason":"reload","theta":"b73livecancel",
    "invocation_id":"63487e23-fd1b-4563-a8d7-d12e158099fd"}}}`.
```
`:433-437`:
```
  - Live coverage of the fixed path: both H9a acceptance files green (11/11) and
    `CELL-A2` red-proven in both directions under the same neutralisation (RED:
    "no theta/runtime/cancelled-by-session-shutdown note for a session_shutdown
    raced against an in-flight prompt-mode drive (bug 0073) … Notes:
    ["theta /b73livecancel cancelled"]").
```
`:497-499` (Residual 7):
```
  7. **`CELL-A2` is a merge token, not a cell number.** The additive H8a cell
     carries the literal token `CELL-A2` in its title and header comment for the
     parent to renumber at merge.
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:10816-10817`:
```
describe("H8a-T — bug 0073 cell 64: a session_shutdown racing a live in-flight prompt-mode drive emits the per-invocation cancelled-by-session-shutdown note", () => {
  it("cell 64: the clean-cancel row lands on the theta-system-note channel, alongside the independent SLSH-4 cancelled note", async () => {
```
`:10866-10885` asserts a non-empty `theta /b73livecancel cancelled by session shutdown (` note list, with the failure message "no theta/runtime/cancelled-by-session-shutdown note for a session_shutdown raced against an in-flight prompt-mode drive (bug 0073)…" that the record quotes. It also asserts the SLSH-4 `theta /b73livecancel cancelled` note is present.

Searches (run this session):
- `grep -rn "CELL-A2" tests/ | wc -l` → 0 (test-title / header-comment representation; the `-t "CELL-A2"` filter therefore selects nothing).
- `git log --oneline -S'CELL-A' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0 (no `CELL-A*` token in the file's history).
- `git log --oneline -S'b73livecancel' -- tests/live/live-production-acceptance.test.ts` → f0917e35 only (the cell landed once, in the fix commit).
- `git show f0917e35 -- tests/live/live-production-acceptance.test.ts | grep -n "CELL\|cell 6"` → only numbered-cell lines (`cell 63` in a hunk header, `cell 64`, and a `cell 61` back-reference), no `CELL-A2`.
- `git show f0917e35 -- docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md | grep -c "^+.*CELL-A2"` → 5 (the token-bearing record lines were written in the same commit).
- `git log --all --oneline -S'CELL-A2'` → f0917e35 only (the token exists only in the record, never in a test).
- Test filenames: the offline witness `tests/cancelled-by-session-shutdown-note.test.ts` exists with cells (a)–(e) at `:290`, `:322`, `:346`, `:364`, `:401`, and `tests/post-deadline-dual-surface.test.ts` (cited in the Residual 1 discharge) exists at `:147-148`, so only the live leg's pointer is affected.
- Coverage matrix / AGENTS.md gate names: not cited by this leg; not applicable.
- CHANGELOG (corroboration only): `grep -n "CELL-A\|cell 61\|cell 64" CHANGELOG.md` → `:4325` "H8a cell 64 (a real in-flight drive raced by…"; no `CELL-A2` hit.

## Why this is a problem
Three live-verification statements and one factual statement about the test's title point at a token no test carries. The recorded command selects zero tests today, and Residual 7's "carries the literal token `CELL-A2` in its title and header comment" is contradicted by the landed title. Residual 7 is an honesty marker that the token was temporary. The marker itself is not the problem. The problem is that the Gates and Verification pointers still present `CELL-A2` as the way to reach the witness, and the renumbered name they needed is known and stable ("cell 64"). The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point the `CELL-A2` mentions and the `-t` filter at the landed title "bug 0073 cell 64".

## False-positive check
- Representations covered: bug-doc Gates/Verification/Residual lines (four sites quoted); test file names (offline witness and live file both exist); test titles and header comments (`grep -rn "CELL-A2" tests/` → 0; numbered `describe` found at `:10816`); coverage-matrix rows (none cited); AGENTS.md gate names (not a gate claim); CHANGELOG (corroboration, `:4325`).
- Not a later rename: the live file's history never held the token, and f0917e35 wrote both the numbered cell and the token-bearing record.
- Residual 7 is not being filed as a marker. It is quoted because its statement about the title is a checkable pointer claim that the tree contradicts.
- Distinct from the bug 0074 `CELL-A` filing in this wave: different record, different landing commit (d62be25e vs f0917e35).
- No pending candidate among the listed ones cites bug 0073's live-cell token.

## Triage
verdict: confirmed — decayed pointer reproduces. `CELL-A2` appears at bug 0073 :390, :406, :434 and :497-498. A search for CELL-A under tests/ returns 0 hits, the live file's history has no CELL-A token, and `git log --all -S CELL-A2` shows only f0917e35, which wrote the token 5 times in the record while landing the cell already numbered. The equivalent is unambiguous and verified: tests/live/live-production-acceptance.test.ts:10816 describe("H8a-T — bug 0073 cell 64: a session_shutdown racing a live in-flight prompt-mode drive emits the per-invocation cancelled-by-session-shutdown note") / :10817 it("cell 64: the clean-cancel row lands on the theta-system-note channel…"), whose failure message at :10873-10877 is the one the record quotes. It is the only "cell 64" hit under tests/. The fix is a mechanical re-point of the token and the -t filter to "bug 0073 cell 64". No other intake/issue cites f0917e35 or CELL-A2 (triage: claude-opus-5-5)
