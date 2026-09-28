---
id: PTQ-1575
title: "Bug 0075's 0.175.0 fix record names its live witness `tests/live/discovery-entry-lstat-failure-cell-d.test.ts` and token `CELL-D`, neither of which exists; cfa110b1 landed the cell as `discovery-entry-lstat-failure-live-cell.test.ts` with bug-0075 tags"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0075-symlinked-root-classified-wrong-type.md:303-308
  - docs/bugs/0075-symlinked-root-classified-wrong-type.md:319-321
  - docs/bugs/0075-symlinked-root-classified-wrong-type.md:327-337
  - tests/live/discovery-entry-lstat-failure-live-cell.test.ts:1-3
  - tests/live/discovery-entry-lstat-failure-live-cell.test.ts:73-80
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0075's 0.175.0 fix record names its live witness `tests/live/discovery-entry-lstat-failure-cell-d.test.ts` and token `CELL-D`, neither of which exists; cfa110b1 landed the cell as `discovery-entry-lstat-failure-live-cell.test.ts` with bug-0075 tags

## Observation
The `## Fix (0.175.0)` section of bug 0075 cites its live verification leg by a file path (`tests/live/discovery-entry-lstat-failure-cell-d.test.ts`) and by a cell token (`CELL-D`, twice). No file at that path exists in the tree or in any commit's history, and no test in `tests/` carries the token `CELL-D`. The commit that landed this fix, cfa110b1, added the live cell as `tests/live/discovery-entry-lstat-failure-live-cell.test.ts`, and its commit message records the rename ("was CELL-D, 3 parenthesized tokens renamed to bug-0075 tags, file renamed *-live-cell.test.ts"). The record in the same commit kept the pre-rename name and token. So the pointer is not a later deletion: it has never resolved as stated.

## Evidence
Claim side, `docs/bugs/0075-symlinked-root-classified-wrong-type.md:303-308` (Gates):
```
- Gates: witness `tests/discovery-tree-walk-lstat-failure.test.ts` 11/11 (cells
  1, 2, 3, 5, 7 RED before the fix, `Observed diagnostics=[]`); full default
  suite `367 files / 7501 tests passed` (fork baseline 366/7490 at v0.173.0 —
  the delta is exactly this witness); `npx tsc -p . --noEmit` clean;
  `npm run lint` clean; live H8a `CELL-D` 1/1 real run under the live lock,
  red-proven by neutralising the settings-side arm.
```
`:319-321` (Review):
```
  (fast) judged the new live cell: CLEAN, adjudicating the fault-injection
  provocation acceptable and reporting two lane-token placement residuals,
  both then made strip-safe (`(CELL-D)` parenthesized form).
```
`:327-337` (Verification (D)):
```
  --noEmit` and `npm run lint` clean. (D) Live: one additive standalone H8a
  cell, `tests/live/discovery-entry-lstat-failure-cell-d.test.ts`, boots the
  real shipped extension and asserts the warning arrives on the
  `theta-system-note` channel off the settled `SessionManager`, with the message
  half read from the registry row (DIAG-4) and the descriptor
  `settings entry index 0`; bracketed by a registration precondition control and
  a guard that the theta under the denied entry stays absent. Green, and
  red-proven by neutralising the settings-side arm. Registration-only, zero
  tokens, no subagent child spawn, so no child pins are owed. No H9a run and no
  `permitted-codes.json` decision: no new code and no severity change.
  No stochastic class was observed. Both `listTree` copies' at-rest blob hashes
```

Equivalent witness, `tests/live/discovery-entry-lstat-failure-live-cell.test.ts:1-3`:
```
// H8a-T (bug 0075) — an entry-level `lstat` rejection during a settings
// `thetaPaths` glob's universe walk warns on the `theta-system-note` channel
// through the real production composition root.
```
`:73-80`:
```
describe(
  "H8a-T (bug 0075) — a settings thetaPaths glob universe entry whose lstat rejects " +
    "warns on the theta-system-note channel (bug 0113 residual 1 / bug 0075 §Affected listTree site)",
  () => {
    it(
      "(bug 0075) registers the precondition control, and the theta-system-note channel carries the " +
        "entry-lstat unreadable-source warning naming the settings descriptor, through the real " +
        "discovery→registration path",
```
The file's header (read lines 1-90) describes the `fs.promises.lstat` patch for one path and the precondition control `b113entryctl`, which is what the record's Verification (D) and Residual 2 describe.

Searches (run this session):
- `git ls-files tests | grep -c "discovery-entry-lstat-failure-cell-d"` → 0 (filename representation).
- `git log --all --oneline -- '*discovery-entry-lstat-failure-cell-d*'` → 0 commits (the path never existed in history).
- `git ls-files tests | grep "discovery-entry-lstat-failure"` → 1 hit: `tests/live/discovery-entry-lstat-failure-live-cell.test.ts`.
- `grep -rn "CELL-D" tests/ | wc -l` → 0 (test-title / token representation).
- `grep -rln "bug 0075" tests/live` → 2 files: `discovery-entry-lstat-failure-live-cell.test.ts`, `discovery-symlinked-root-live-cell.test.ts` (the latter is the 0.195.0 half's cell, which the record cites correctly).
- `git log --oneline --diff-filter=AR -- tests/live/discovery-entry-lstat-failure-live-cell.test.ts` → cfa110b1 (added, the 0.175.0 fix commit itself).
- `git show cfa110b1 -- docs/bugs/0075-symlinked-root-classified-wrong-type.md | grep -n "cell-d"` → the record's `-cell-d.test.ts` line was added in the same commit.
- `grep -rn "discovery-entry-lstat-failure" docs/` → 4 hits: the one 0075 hit above, plus three in `docs/bugs/0461-source-failure-descriptor-category-text.md` (`:21`, `:208`, `:306`), all using the `-live-cell` name.
- CHANGELOG (corroboration only): `grep -n "lstat-failure" CHANGELOG.md` → `:3657-3658`, "a standalone live cell (`discovery-entry-lstat-failure-live-cell`)".

## Why this is a problem
The record's live-leg claim ("live H8a `CELL-D` 1/1", "(D) Live: one additive standalone H8a cell, `tests/live/discovery-entry-lstat-failure-cell-d.test.ts`") points at a path and a token that no reader can find in the tree. Someone following the chain from claim to evidence finds nothing at that path and nothing named `CELL-D`, even though the cell exists under another name. The landing commit's own message records the rename, so this is mechanically provable pointer decay, not a question about whether the claim is true. The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point the three citations at `tests/live/discovery-entry-lstat-failure-live-cell.test.ts` and its `(bug 0075)` title tag in place of `CELL-D`.

## False-positive check
- Representations covered: bug-doc Witness/Gates/Verification lines (the three 0075 sites quoted); test file names (`git ls-files` over tests/, and a history search with `--all`); test titles/tokens (`grep -rn "CELL-D" tests/` → 0; the `describe`/`it` titles of the equivalent file read directly); coverage-matrix rows (not applicable: this record cites no matrix row; `grep -rn "discovery-entry-lstat-failure" docs/` found no matrix hit); AGENTS.md gate names (not relevant: this is a live cell, not a gate discharge); CHANGELOG entries (corroboration: `:3657-3658` names the `-live-cell` file).
- Not a later deletion: the history search finds no commit that ever held the `-cell-d` path. cfa110b1 added both the renamed file and the stale citation.
- The record's other pointers were checked and resolve: `tests/discovery-tree-walk-lstat-failure.test.ts`, `tests/discovery-symlinked-root-classification.test.ts`, and `tests/live/discovery-symlinked-root-live-cell.test.ts` all exist (`git ls-files`).
- No pending candidate among the listed ones cites bug 0075's live-cell pointer.

## Triage
verdict: confirmed — the decayed pointer reproduces. docs/bugs/0075-symlinked-root-classified-wrong-type.md:307 (Gates, "live H8a `CELL-D` 1/1"), :321 (Review, "`(CELL-D)` parenthesized form") and :329 (Verification (D), `tests/live/discovery-entry-lstat-failure-cell-d.test.ts`) point at nothing. `git ls-files` shows 0 files matching -cell-d, `git log --all` on that path gives 0 commits, and `grep -rn CELL-D tests/` gives 0. cfa110b1 added the stale line itself (`git show` on the record puts `+…-cell-d.test.ts` at diff line 111), and its commit message records the rename ("was CELL-D … file renamed *-live-cell.test.ts"). The one unambiguous equivalent is verified: tests/live/discovery-entry-lstat-failure-live-cell.test.ts, added in cfa110b1 (`--diff-filter=AR`), describe "H8a-T (bug 0075) — a settings thetaPaths glob universe entry whose lstat rejects warns on the theta-system-note channel (bug 0113 residual 1 / bug 0075 §Affected listTree site)", it "(bug 0075) registers the precondition control, and the theta-system-note channel carries the entry-lstat unreadable-source warning naming the settings descriptor, through the real discovery→registration path". CHANGELOG.md:3657-3658 and docs/bugs/0461 :21/:208/:306 use the same -live-cell name. The fix is a mechanical re-point of the path and of both CELL-D tokens to the `(bug 0075)` tag, with wording untouched. It is live-only (tests/live/**). No other intake file or PTQ carries cfa110b1: the b0113 CELL-D filing is 36b6d6c4 and the b0108 filing is 185db9db, both different records. The candidate lacked a ## Triage heading, so triage added one (triage: claude-opus-5-5)
