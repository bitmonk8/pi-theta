---
id: PTQ-1569
title: Bug 0078's fix record names its H8a live witness as tests/live/discovery-cli-override-prefix-missing-source-cell-d2.test.ts and as "CELL-D2", neither of which has ever existed in the tree
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:315-321
  - docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:343-352
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:1-8
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:65-72
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:94-99
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:121-139
sites: 2
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0078's fix record names its H8a live witness as tests/live/discovery-cli-override-prefix-missing-source-cell-d2.test.ts and as "CELL-D2", neither of which has ever existed in the tree

## Observation
`docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md` §Fix (0.178.0) names its live witness twice. *Gates* calls it "live H8a `CELL-D2`", and *Verification* (D) gives it the path `tests/live/discovery-cli-override-prefix-missing-source-cell-d2.test.ts`. No file at that path exists, and no ref in git history has ever had one. No test file or test title in `tests/` contains the token `CELL-D2`. The fix commit `63122660` (v0.178.0) added the live cell as `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`, and that file is still present. The commit message says "standalone live cell (was CELL-D2, de-tokenized …)", so the cell was renamed before commit and both pins kept the pre-rename name. The pointer has never resolved.

## Evidence
Claim side, `docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:315-321` (re-read before filing):
```
- Gates: witness `tests/discovery-cli-entry-override-prefix.test.ts` 13/13
  (cells 1, 2, 3 RED before the fix, each observing
  `theta/load/unreadable-source` where `missing-source` is owed); full default
  suite `369 files / 7537 tests passed` (lane baseline 368/7524 at v0.175.0 — the
  delta is exactly this witness); `npx tsc -p . --noEmit` clean; `npm run lint`
  clean; live H8a `CELL-D2` 1/1 real run under the live lock, red-proven by
  neutralising the CLI arm's policy.
```
`docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:343-352`:
```
  clean. (D) Live: one additive standalone H8a cell,
  `tests/live/discovery-cli-override-prefix-missing-source-cell-d2.test.ts`,
  boots the real shipped extension with an override-prefixed `--theta` operand
  naming an absent path and asserts the `missing-source` note (and the absence of
  the `unreadable-source` one) on the `theta-system-note` channel off the settled
  `SessionManager`, bracketed by a registration precondition control. The
  provocation needs **no fault injection and no ACL** — strictly cleaner than
  0075's `fs.promises.lstat` patch — because `readThetaFlagPaths` carries the
  operand verbatim into the real CLI arm; disclosed in the cell header.
  Registration-only, no subagent child spawn, so no child pins are owed. Green,
```

Evidence side: the equivalent witness in the tree. `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:1-8`:
```
// H8a-T (bug 0078) — a `--theta` CLI operand whose FIRST character is a
// DISC-5 override prefix (`!`/`+`/`-`) carries no override meaning for the
// CLI source: it is a literal path, and when that literal path does not
// exist the CLI row's *Missing path* cell applies — `theta/load/missing-source`
// — through the real production composition root's `theta-system-note`
// channel, off the settled `SessionManager`.
//
// This is bug 0078's fix: the offline witness
```
`:65-72`: the `describe("H8a-T (bug 0078) — an override-prefixed --theta operand naming no path warns missing-source, not unreadable-source, on the theta-system-note channel (bug 0078)"` block and its single `it(`, which registers the precondition control and checks the missing-source warning. `:94-99`: the precondition control, `handle.command("b078ctl")` `.toBeDefined()`. `:121-139`: `collectSystemNotes(handle.sessionManager.getEntries())`, then `expect(notes.some((note) => note.includes(expectedMissing)), …).toBe(true)` and `expect(notes.some((note) => note.includes(bannedUnreadable)), …).toBe(false)`. These match record item (D) observable for observable.

Searches (run this session, repo root):
- `ls tests/live | grep -c "cell-d2"` → 0.
- `git ls-files 'tests/**' | grep -ci "cell-d2"` → 0.
- `git log --all --format=%h -- 'tests/live/discovery-cli-override-prefix-missing-source-cell-d2.test.ts' | wc -l` → 0 (no commit on any ref ever touched that path).
- `grep -rn "cell-d2\|CELL-D2" tests docs AGENTS.md CHANGELOG.md | wc -l` → 2, both in the record itself (`:320`, `:344`).
- `git show 63122660 --stat` → adds `tests/discovery-cli-entry-override-prefix.test.ts` and `...verride-prefix-missing-source-live-cell.test.ts | 200 +++++++`. `git log --follow --format=%h --diff-filter=R -- tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts | wc -l` → 0 (no later rename).
- `git log --oneline -S 'cell-d2.test.ts' -- docs/bugs/0078-…md` → `63122660` only, so the pin was written in the fix commit that shipped the differently named file.

## Why this is a problem
The record's Status is `fixed (0.178.0)`. Its Verification item (D) is its only claim at host level: the fixed path runs through the real composition root and the real `theta-system-note` channel, and is red-proven. Both citations of that evidence (the path and the `CELL-D2` label) point at nothing. Anyone who follows the record, including a triage re-run, finds no file, so from the record alone the live claim cannot be told apart from an unrecorded one. The cell does exist under another name and asserts the claimed observables. Because it sits under `tests/live/**`, the default preflight gate (`vitest.config.ts` excludes `tests/live/**`) does not prove it. That caps claim (D) at "a live witness exists", even once the pointer is corrected. The default-suite witness `tests/discovery-cli-entry-override-prefix.test.ts` resolves as stated (13 `it(` cells) and is not affected.

## Suggested direction (non-binding, optional)
Re-point `:344` at `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`, the file `63122660` actually added. It self-identifies as bug 0078's H8a-T cell. At `:320`, replace the `CELL-D2` label with the same path.

## False-positive check
- Representations enumerated, one search each: (1) bug-doc Witness/Fix pins: `grep -rn "cell-d2\|CELL-D2" tests docs AGENTS.md CHANGELOG.md` → 2 hits, both in the record. (2) Test file names: `ls tests/live | grep -c "cell-d2"` → 0, `git ls-files 'tests/**' | grep -ci "cell-d2"` → 0, `grep -rln "0078" tests/live` → 1 file (`discovery-cli-override-prefix-missing-source-live-cell.test.ts`). (3) Test titles: `grep -rn "H8a-T (bug 0078)" tests` → 2 hits, both in that same file (header `:1`, describe title `:66`). No title anywhere carries `CELL-D2`. (4) Coverage-matrix rows: `grep -c "0078\|override-prefix" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0. (5) AGENTS.md gate names: `grep -n "0078\|override-prefix" AGENTS.md | wc -l` → 0. (6) CHANGELOG, corroboration only: `grep -n "0078\|override-prefix" CHANGELOG.md` → the 0.178.0 entry at `:3607-3615`, which says "a standalone live cell with no fault injection" and gives no path.
- History intent: no delete or rename of the stated path exists to cluster by, since it was never added. This is a pointer that never resolved, not one that decayed later. The same shape was filed this wave for bug 0092 (`qw20260928081617-d10-01-b0092-live-witness-path-never-existed.md`), which is a different record with a different sha, so this filing does not duplicate it.
- Not citation form: no gate checks `docs/bugs/**` witness paths. I did not adjudicate whether the claim is true, and I executed nothing.

## Triage
verdict: confirmed — every stated search reproduces: 0 cell-d2 files in tests/live or git ls-files, 0 commits on any ref touching the cell-d2 path, and the only 2 CELL-D2/cell-d2 hits are record :320 and :344. 63122660 --stat adds `...verride-prefix-missing-source-live-cell.test.ts` (200 lines), its message says "was CELL-D2, de-tokenized", there has been no later rename, and -S shows the pin was written in that same commit. The claimed observable's witness does exist, and there is exactly one: tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts, describe "H8a-T (bug 0078) — an override-prefixed --theta operand naming no path warns missing-source, not unreadable-source, on the theta-system-note channel (bug 0078)", it "(bug 0078) registers the precondition control, and the theta-system-note channel carries the literal-path missing-source warning naming the cli-flag descriptor — never unreadable-source — through the real discovery→registration path". It has the b078ctl precondition control, the missing-source toBe(true) check and the unreadable-source toBe(false) check, and bugs 0363/0461 already cite it by that path. The offline witness tests/discovery-cli-entry-override-prefix.test.ts resolves. Coverage-matrix and AGENTS.md hits: 0. The fix is a mechanical re-point at :320 and :344 with no rewording. Not a duplicate: the 0363 intake candidate that cites the same cell is an overstated-strength claim against a different record (triage: claude-opus-5-5)
