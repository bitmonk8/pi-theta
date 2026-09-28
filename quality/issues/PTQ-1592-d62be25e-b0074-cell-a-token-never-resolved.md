---
id: PTQ-1592
title: "Bug 0074's 0.125.0 fix record cites its live witness as `CELL-A` with the command `-t \"CELL-A\"`, but d62be25e landed the cell as \"bug 0074 cell 61\" and no test title contains `CELL-A`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0074-registry-insertion-after-binder-await.md:371-372
  - docs/bugs/0074-registry-insertion-after-binder-await.md:384-386
  - docs/bugs/0074-registry-insertion-after-binder-await.md:399-401
  - docs/bugs/0074-registry-insertion-after-binder-await.md:427-431
  - tests/live/live-production-acceptance.test.ts:10572-10573
  - tests/live/live-production-acceptance.test.ts:10644-10662
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0074's 0.125.0 fix record cites its live witness as `CELL-A` with the command `-t "CELL-A"`, but d62be25e landed the cell as "bug 0074 cell 61" and no test title contains `CELL-A`

## Observation
The `## Fix (0.125.0)` section of bug 0074 names its live H8a leg by the token `CELL-A` at four places, including a filter command `-t "CELL-A"` recorded as `1 passed | 60 skipped`. No test title or comment anywhere under `tests/` contains `CELL-A`, and that token has never been in `tests/live/live-production-acceptance.test.ts` in any commit. The fix commit d62be25e added the cell as `describe("H8a-T — bug 0074 cell 61: …")`, and its commit message says "H8a cell 61". The record, written in the same commit, kept the pre-merge token, so the pointer and the recorded command have never resolved as written.

## Evidence
Claim side, `docs/bugs/0074-registry-insertion-after-binder-await.md:371-372`:
```
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a cell
    (`CELL-A`), no existing assertion touched.
```
`:384-386`:
```
  - Live: `tests/live/acceptance/` — `Test Files 2 passed (2) / Tests 11 passed
    (11)` (the 11/11 fork baseline). `tests/live/live-production-acceptance.test.ts`
    — 61/61 including `CELL-A`; `-t "CELL-A"` alone `1 passed | 60 skipped`.
```
`:399-401`:
```
  - Live coverage of the fixed path: both H9a acceptance files green (11/11);
    `CELL-A` red-proven in both directions under the same neutralisation (RED
    carried only the `bind_echo` success note, "the binder ran to completion
```
`:427-431` (Residual 3):
```
  3. `CELL-A` completes in ~1.2 s, i.e. the forwarded abort lands at the
     pre-call `binder-call` checkpoint rather than mid-round-trip. It still
     discriminates the defect (its neutralised run went red with the binder
     having run to completion); the genuinely mid-await window is what the
     offline witness parks on.
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:10572-10573`:
```
describe("H8a-T — bug 0074 cell 61: session_shutdown racing a live off-session binder call cancels it instead of letting it complete post-teardown", () => {
  it("a session_shutdown fired immediately after dispatch lands the cancelled-binder note, never the bind_echo success note", async () => {
```
`:10644-10662` asserts a non-empty `argument binding cancelled` note list ("…so sub-step 2 aborted nothing and the binder ran to completion instead") and an empty `Running /b74livebinder` success list. That matches the red message the record quotes at `:400-401`.

Searches (run this session):
- `grep -rn "CELL-A" tests/ | wc -l` → 0 (test-title / token representation, which also covers `-t "CELL-A"` matching nothing).
- `git log --oneline -S'CELL-A' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0 (the token was never in the file's history).
- `git log --oneline -S'bug 0074 cell 61' -- tests/live/live-production-acceptance.test.ts` → d62be25e (the 0.125.0 fix commit added the cell under its numbered title).
- `git show d62be25e -- docs/bugs/0074-registry-insertion-after-binder-await.md | grep -c "^+.*CELL-A"` → 4 (the stale token was written in the same commit).
- `grep -n 'describe("H8a-T — bug 0074' tests/live/live-production-acceptance.test.ts` → 1 hit, `:10572`.
- Test filenames: the offline witness `tests/active-invocation-binder-window.test.ts` exists (`ls`; cells (a), (b), (c) at `:155`, `:169`, `:183`), so only the live leg's pointer is affected.
- Coverage matrix / AGENTS.md gate names: this record's live leg cites neither; not applicable.
- CHANGELOG (corroboration only): `grep -n "CELL-A\|cell 61\|cell 64" CHANGELOG.md` → `:4411` "H8a cell 61 (live `session_shutdown` racing a real binder…"; no `CELL-A` hit.

## Why this is a problem
The record's live-verification claims ("61/61 including `CELL-A`", "`-t "CELL-A"` alone `1 passed | 60 skipped`", "`CELL-A` red-proven in both directions") point at a name no test carries. The command as recorded selects zero tests today, so the chain from claim to evidence breaks at the pointer even though an equivalent cell exists. The witness is a tests/live/** cell, so it exists but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point the four `CELL-A` mentions and the `-t` filter at the landed title "bug 0074 cell 61".

## False-positive check
- Representations covered: bug-doc Gates/Verification/Residual lines (four sites quoted); test file names (the offline witness file exists; the live file exists); test titles (`grep -rn "CELL-A" tests/` → 0, and the numbered `describe` found at `:10572`); coverage-matrix rows (none cited); AGENTS.md gate names (not a gate claim); CHANGELOG (corroboration, `:4411`).
- Not a later rename: `-S'CELL-A'` over the live file's history returns no commit, so the token never landed. d62be25e wrote both the numbered cell and the token-bearing record.
- `docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md:734` also mentions a `CELL-A`. That is a different record outside this shard and is not relied on here.
- No pending candidate among the listed ones cites bug 0074's live-cell token.

## Triage
verdict: confirmed — decayed pointer verified, and the equivalent is unambiguous. `CELL-A` appears 4× in docs/bugs/0074-registry-insertion-after-binder-await.md (:372, :386 incl. the `-t "CELL-A"` filter, :400, :427). It appears 0× under tests/ and 0× in the live file's history (`git log -S'CELL-A'` → no commits). d62be25e added the record text and the cell together, and the cell was already titled "bug 0074 cell 61" at that sha (its :10144). So the token never resolved; no commit deleted anything (--diff-filter=D on the live file → none). The witness is tests/live/live-production-acceptance.test.ts, describe "H8a-T — bug 0074 cell 61: session_shutdown racing a live off-session binder call cancels it instead of letting it complete post-teardown" (:10572), it "a session_shutdown fired immediately after dispatch lands the cancelled-binder note, never the bind_echo success note" (:10573). It is the only `bug 0074` describe in the file, and its assertions at :10644-10662 match the RED message the record quotes. Re-point the four mentions and the -t filter to the "bug 0074 cell 61" title substring. The offline witness tests/active-invocation-binder-window.test.ts exists. The CHANGELOG entry (:4411) also calls it cell 61. No same-sha or same-record filing exists in intake/issues. Note: this candidate was filed without a `## Triage` heading, so triage added the heading (triage: claude-opus-5-5)
