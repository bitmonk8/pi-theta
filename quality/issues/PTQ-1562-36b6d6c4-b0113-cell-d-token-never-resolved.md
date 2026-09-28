---
id: PTQ-1562
title: "Bug 0113's 0.126.0 fix record cites its live witness as H8a `CELL-D`, but 36b6d6c4 landed the cell as \"cell 62 (bug 0113)\" and no test title or comment contains `CELL-D` for it"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0113-listtree-glob-universe-swallow-silent.md:955-960
  - docs/bugs/0113-listtree-glob-universe-swallow-silent.md:976-984
  - tests/live/live-production-acceptance.test.ts:1325-1328
  - tests/live/live-production-acceptance.test.ts:1384-1430
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0113's 0.126.0 fix record cites its live witness as H8a `CELL-D`, but 36b6d6c4 landed the cell as "cell 62 (bug 0113)" and no test title or comment contains `CELL-D` for it

## Observation
The `## Fix (0.126.0)` section of bug 0113 names its live H8a leg by the token `CELL-D` in two places: the Gates line and Verification (D). No test title or comment in `tests/live/live-production-acceptance.test.ts` contains `CELL-D`, and the token has never been in that file's history. The fix commit 36b6d6c4 added the cell as `describe("H8a-T — cell 62 (bug 0113): …")`. Its commit message and the CHANGELOG entry both say "H8a cell 62". The record was rewritten in the same commit and kept the pre-merge lane token, so the live-witness pointer has never resolved as written.

## Evidence
Claim side, `docs/bugs/0113-listtree-glob-universe-swallow-silent.md:955-960` (Gates):
```
- Gates: witness `tests/discovery-glob-universe-enumeration-failure.test.ts`
  19/19 (10 cells RED before the fix, `Observed diagnostics=[]`); full default
  suite `326 files / 5966 tests passed` (fork baseline 325/5947 — delta is
  exactly this witness); `npx tsc -p . --noEmit` clean; `npm run lint` clean;
  H9a both acceptance files 11/11 real-run; H8a `CELL-D` green, red-proven both
  directions.
```
`:976-984` (Verification (D)):
```
  (C) `npm run lint` and `npm run typecheck` clean. (D) Live: both H9a
  acceptance files run for real, 11/11, no permitted-code allow-list needed
  changing (neither fixture crosses a denied glob path, so the code is not
  newly emitted there); one additive H8a cell `CELL-D` witnesses the warning
  arriving on the `theta-system-note` channel through the real composition
  root, provoked ACL-free and platform-neutrally by planting a regular file
  where the glob's static-prefix root would be (`fs.readdir` rejects
  `ENOTDIR`), red-proven by neutralising the emission and restored byte-exact.
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:1325-1328`:
```
// cell 62 — bug 0113: both `listTree` copies swallowed every `readdir`
// rejection, so a denied subtree (or a denied static-prefix ROOT) under a
// settings `thetaPaths` glob's universe silently shrank that universe with no
// diagnostic on any channel (docs/bugs/0113-listtree-glob-universe-swallow-
```
`:1384-1385`:
```
describe("H8a-T — cell 62 (bug 0113): a settings thetaPaths glob whose static-prefix root cannot be enumerated warns on the theta-system-note channel (Convention: live-host acceptance)", () => {
  it("cell 62: registers the precondition control, and the theta-system-note channel carries the glob-universe unreadable-source warning naming settings entry index 0, through the real discovery→registration path", async () => {
```
The cell plants a regular file at `.pi/g` (`writeFileSync(join(workspace.cwd, ".pi", "g"), "not a directory\n", …)`) with `thetaPaths: ["g/**/*.theta"]`. At `:1420-1428` it asserts that some system note includes `unreadableSourceFragment('settings:"g/**/*.theta"')`. That is the ENOTDIR provocation and channel observable that Verification (D) describes.

Searches (run this session):
- Test titles / tokens: `grep -rnw "CELL-D" tests/ | wc -l` → 0.
- History of the live file: `git log --oneline -S'CELL-D' -- tests/live/live-production-acceptance.test.ts` → 0 commits. The token was never in this file. (`git log -S'CELL-D' -- tests/` → 3 commits: 46bd3b60, eceeaf11 and 03657762. All three belong to bugs 0217/0145/0075 and touch other files' comments, not this cell.)
- Landing: `git log --oneline -S "cell 62 — bug 0113" -- tests/live/live-production-acceptance.test.ts` → 36b6d6c4, the 0.126.0 fix commit.
- Same-commit origin: `git show 36b6d6c4 -- docs/bugs/0113-listtree-glob-universe-swallow-silent.md | grep -c "^+.*CELL-D"` → 2.
- Numbered title: `grep -n 'describe("H8a-T — cell 62' tests/live/live-production-acceptance.test.ts | wc -l` → 1 (`:1384`).
- Test file names: the offline witness `tests/discovery-glob-universe-enumeration-failure.test.ts` exists (`ls`) with 19 `it(` cells (`grep -cE '^\s*it\(' …` → 19), so only the live leg's pointer is affected.
- Coverage matrix / AGENTS.md gate names: `grep -nw "CELL-D\|CELL-B" docs/reference/coverage-matrix.md AGENTS.md | wc -l` → 0. Not cited there.
- CHANGELOG (corroboration only): `grep -nw "CELL-D\|CELL-B" CHANGELOG.md | wc -l` → 0. `:4396` reads "H8a cell 62 (real discovery→registration path, red-proven both directions)".

## Why this is a problem
The record's two live-verification claims ("H8a `CELL-D` green, red-proven both directions" and "one additive H8a cell `CELL-D` witnesses the warning…") point at a name no test carries. `tests/live/live-production-acceptance.test.ts` holds dozens of numbered H8a cells, so a reader or a `-t` filter following the pointer finds nothing. The claim→evidence chain breaks at the pointer even though an equivalent cell exists. The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point both `CELL-D` mentions at the landed title "cell 62 (bug 0113)".

## False-positive check
- Representations covered: bug-doc Gates/Verification lines (both sites quoted); test file names (both the offline and the live file exist); test titles and tokens (`grep -rnw "CELL-D" tests/` → 0, numbered `describe` found at `:1384`); coverage-matrix rows and AGENTS.md gate names (0 hits); CHANGELOG (corroboration, `:4396`).
- Not a later rename: `-S'CELL-D'` over the live file's history returns no commit. 36b6d6c4 wrote both the numbered cell and the token-bearing record.
- House precedent: 03657762 "four more stale lane-token references repaired", and bug 0115's commit a602655b notes its token was "de-tokenized at merge". Unresolved lane tokens are treated as repairable pointers, and this one was missed.
- No pending candidate in the list cites bug 0113. PTQ-1037 (shipped-harness not migrated, glob-universe) is a D7 test-code filing on a different subject.
- Out of scope, noted only: the cell's `it` title says "naming settings entry index 0", but its assertion matches `settings:"g/**/*.theta"`. That is a test-title matter for D7.

## Triage
verdict: confirmed — the decayed pointer reproduces. docs/bugs/0113-listtree-glob-universe-swallow-silent.md:959 (Gates, "H8a `CELL-D` green, red-proven both directions") and :979 (Verification (D), "one additive H8a cell `CELL-D` witnesses…") name a token that nothing in tests/ carries: `grep -rnw CELL-D tests/` gives 0, and `git log -S'CELL-D'` on the live file gives 0 commits. The only -S hits under tests/ are 03657762/eceeaf11/46bd3b60, which belong to other bugs. 36b6d6c4 wrote both the 2 `+…CELL-D` record lines and the cell. Its commit message and CHANGELOG.md:4396 both say "H8a cell 62". The one unambiguous equivalent is verified: tests/live/live-production-acceptance.test.ts:1384, describe "H8a-T — cell 62 (bug 0113): a settings thetaPaths glob whose static-prefix root cannot be enumerated warns on the theta-system-note channel (Convention: live-host acceptance)". It plants a regular file at .pi/g (ENOTDIR) with thetaPaths ["g/**/*.theta"] and asserts unreadableSourceFragment('settings:"g/**/*.theta"') on a system note, which matches the Verification (D) description. The fix is a mechanical re-point of both mentions to "cell 62" with the wording otherwise untouched. It is live-only (tests/live/**). No other intake file or PTQ tracks 36b6d6c4. The 0116 CELL-B filing (f7dd18a7) is a different sha. Form note: the candidate had no ## Triage heading, so one was added here (triage: claude-opus-5-5)
