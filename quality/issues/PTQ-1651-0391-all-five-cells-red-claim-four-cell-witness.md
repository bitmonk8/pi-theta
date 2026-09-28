---
id: PTQ-1651
title: Bug 0391's fix record claims "all 5 b0391 cells red pre-fix" but its witness file has held 4 cells since it was created, and one of them is a CONTROL that cannot red at the fork
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0391-slsh5-chain-suffix-native-backslash-paths.md:250-253
  - docs/bugs/0391-slsh5-chain-suffix-native-backslash-paths.md:266-272
  - tests/b0391-slsh5-chain-suffix-pathform.test.ts:117-168
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0391's fix record claims "all 5 b0391 cells red pre-fix" but its witness file has held 4 cells since it was created, and one of them is a CONTROL that cannot red at the fork

## Observation
The Gates block of 0391's `## Fix (0.394.0)` section says the callee mint's red direction was witnessed at fork by "all 5 b0391 cells red pre-fix". The witness `tests/b0391-slsh5-chain-suffix-pathform.test.ts` contains 4 `it()` cells. It has had 4 cells since fix commit `cc470f20`, which is the only commit that ever touched the file. The fourth cell is a CONTROL that asserts only on `canonicalizePath` output. `canonicalizePath` already existed before the fix, so this cell is green at the fork. The same record says so a few lines earlier ("the backslash-free CONTROL cannot red on POSIX"). The record's own test arithmetic also gives four new cells: 10307 baseline tests + the witness = 10311.

## Evidence
Claim side (docs/bugs/0391-slsh5-chain-suffix-native-backslash-paths.md:250-253, re-read before filing):
```
  - `tests/b0391-slsh5-chain-suffix-pathform.test.ts` — NEW offline witness;
    drives the real `src` units over a real `PiFileSystem` + temp dir. RED at
    fork for the path-form reason (`C:\u2026` vs `C:/…` on both mints and the
    rendered note); green after; the backslash-free CONTROL cannot red on POSIX.
```
docs/bugs/0391-slsh5-chain-suffix-native-backslash-paths.md:266-272:
```
  - Witnesses green; full default suite 557 files / 10311 tests (baseline
    556/10307 + the new witness), the only reds being the LANE-BRIEF
    parallel-load-flake family (`Hook/Test timed out`, off-surface, green on
    isolated re-run). `npm run typecheck` clean; `npm run lint` clean.
  - Verification: revert-red / restore-green proved byte-exact on the parent
    mint (inverse Edit; `git diff` shows only the landed change); the callee
    mint's red direction witnessed at fork (all 5 b0391 cells red pre-fix).
```
Evidence side, tests/b0391-slsh5-chain-suffix-pathform.test.ts (opened in full, :117-168). These are its only four cells:
```
118:  it("recordInvocationProvenance mints the parent path in the canonicalizePath form — ", async () => {
127:  it("the ledger mints the callee path in the canonicalizePath form — ", async () => {
140:  it("the rendered top-level err note interpolates both placeholders forward-slashed — ", async () => {
157:  it("CONTROL: the canonicalizePath form never carries a backslash on any host — ", async () => {
```
The CONTROL body (:157-167) calls only `canonicalizePath` and never touches either mint site:
```
    const canonicalParent = await canonicalizePath(fs, parentPath);
    const canonicalCallee = await canonicalizePath(fs, calleeAbsPath);
    expect(canonicalParent.includes("\\")).toBe(false);
    expect(canonicalCallee.includes("\\")).toBe(false);
```
Searches run this session:
- `grep -cE "^\s*it\(" tests/b0391-slsh5-chain-suffix-pathform.test.ts` → 4. The file has no `for`/`.each` loop that would generate more cells.
- `git show cc470f20:tests/b0391-slsh5-chain-suffix-pathform.test.ts | grep -cE "^\s*it\("` → 4 (the file at its fix commit).
- `git log --format="%h %s" -- tests/b0391-slsh5-chain-suffix-pathform.test.ts` → 1 commit (`cc470f20 fix(bug-0391) …`).
- `git show cc470f20^:src/runtime/invocation.ts | grep -n "export async function canonicalizePath"` → 1 hit (:142). The helper the CONTROL exercises existed before the fix, so the CONTROL is green at fork.

## Why this is a problem
The record reports a red-at-fork proof over five witness cells. The committed witness has four, and one of them is built to stay green at the fork. The recorded evidence supports at most three red cells out of four. The number in the verification sentence does not match any state of the witness file, so a reader cannot use it to re-check the red direction.

## Suggested direction (non-binding, optional)
Restate the count to match the committed witness: three mint/render cells red at fork, plus one CONTROL that is green at fork.

## False-positive check
Representations searched for a fifth b0391 cell or another witness the "5" could refer to:
- Test filenames: `ls tests tests/live tests/live/* | grep -c 0391` → 1 (`tests/b0391-slsh5-chain-suffix-pathform.test.ts`).
- Test titles: `grep -rnE "(it|describe)\(.*0391" tests --include=*.ts` → 1 hit (the witness's `describe` at :117).
- Files mentioning 0391: `grep -rln "0391" tests --include=*.ts` → 6 files: the witness; the compensating cells `tests/slsh5-invoke-cascade-chain-suffix.test.ts` and `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts`; and three live twins. The record lists all of these separately as compensating flips, not as "b0391 cells".
- Coverage matrices: `grep -c "0391" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 / 0.
- AGENTS.md gate names: `grep -c "0391" AGENTS.md` → 0.
- CHANGELOG (corroboration only): `grep -n "0391" CHANGELOG.md` → 1 entry (:1455). It says "Witnessed by `tests/b0391-slsh5-chain-suffix-pathform.test.ts` … red at fork on the path FORM at both mints + the rendered note". That is three reddable surfaces, and it gives no count of five.
- History: the witness file has one commit, so no cell was deleted after the fix.

## Triage
verdict: questionable — reproduced: 0391.md:272 says "all 5 b0391 cells red pre-fix", but tests/b0391-slsh5-chain-suffix-pathform.test.ts has 4 it() cells (grep → 4; no .each/loop/test() forms), and cc470f20 is the only commit touching the file (4 cells there too). The 4th cell (:157 "CONTROL: the canonicalizePath form never carries a backslash on any host") calls only canonicalizePath, which already existed at cc470f20^ (invocation.ts:142), so it is green at fork, as the record's own :253 admits. The record's arithmetic (10307→10311) also gives 4. My own searches found no fifth b0391 cell: 6 test files mention 0391 (the witness plus the compensating/live cells listed separately), with 0 hits in coverage-matrix.md and AGENTS.md, and no intake/PTQ duplicate. The witness exists but does not support the stated count, so the fix means rewording the record's verification claim, which is for a human to rule on (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (unwitnessed-claim, count). APPEND EXACTLY the following block at the very end of docs/bugs/0391-slsh5-chain-suffix-native-backslash-paths.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The Fix section above says all 5 b0391 cells red pre-fix. tests/b0391-slsh5-chain-suffix-pathform.test.ts has held 4 it() cells since it was created, and its CONTROL cell (canonicalizePath form never carries a backslash) exercises code that predates the fix commit and was green at fork, as this record itself notes in its suite arithmetic (10307 to 10311). Read the claim as: the 3 non-control b0391 cells red pre-fix, the control green throughout.
