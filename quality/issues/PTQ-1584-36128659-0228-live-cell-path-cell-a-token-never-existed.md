---
id: PTQ-1584
title: "Bug 0228's 0.179.0 fix record names its live H8a witness as tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts, but 36128659 added the file without the CELL-A token and that path has never existed"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0228-inline-object-type-source-token-join-corrupts-field-keys.md:872-876
  - tests/live/inline-field-name-not-identifier-live-cell.test.ts:1-6
  - tests/live/inline-field-name-not-identifier-live-cell.test.ts:138-139
  - tests/inline-object-type-source-capture.test.ts:129
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0228's 0.179.0 fix record names its live H8a witness as tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts, but 36128659 added the file without the CELL-A token and that path has never existed

## Observation
The `## Fix (0.179.0)` gates list of bug 0228 records a live H8a run against `tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts` ("1/1 passed (10.3 s)"). No file exists at that path, and no commit on any ref ever added one. The fix commit 36128659 added `tests/live/inline-field-name-not-identifier-live-cell.test.ts`. Commit 03657762 later repaired the same tokened filename inside a test comment and described it as "0228's de-tokenized live filename". The bug record was not in that commit and still carries the tokened path. The H9a sibling path on the next line resolves.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0228-inline-object-type-source-token-join-corrupts-field-keys.md:872-876`:
```
    preserved).
  - Live, run for real under the shared live lock: H8a
    `tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts`
    1/1 passed (10.3 s), H9a
    `tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts`
```

Evidence side, the equivalent witness (opened), `tests/live/inline-field-name-not-identifier-live-cell.test.ts:2-3` and `:138-139`:
```
// H8a live witness — bug 0228: at every `Type` position but `params:` the
// document rebuilds a type's source text by joining lexer token texts with no
...
describe("bug 0228 live: an inline field name spelling two identifiers is refused at registration, and the space-free sibling registers and drives", () => {
  it("does not register `let r: {a b: string} | null = null`, the theta-system-note channel carries theta/parse/inline-field-name-not-identifier naming the raw key `a b`, and `{ab: string}` still registers and drives to the live sentinel via `answer.ab`", async () => {
```
The already-repaired test comment, `tests/inline-object-type-source-capture.test.ts:129`:
```
// reach: tests/live/inline-field-name-not-identifier-live-cell.test.ts
```
(`git show 03657762` changes this line from `…/inline-field-name-not-identifier-CELL-A-live-cell.test.ts`. Commit message: "Three token-referencing comments rewritten onto real referents (… 0228's de-tokenized live filename …)".)

Searches (all run in this session):
- Path existence: `find tests -name "inline-field-name-not-identifier-CELL-A-live-cell.test.ts" | wc -l` → **0**. The unsuffixed file is present (237 lines).
- History, all refs: `git log --all --oneline -- tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts` → **0** commits. `git show --name-status --format= 36128659 | grep tests/live` → `A tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts`, `A tests/live/inline-field-name-not-identifier-live-cell.test.ts`.
- String history: `git log --all --oneline -S"CELL-A-live"` → 2 commits: 36128659 (introduced) and 03657762 (test-comment repair).
- Test filenames and bodies: `grep -rn -- "CELL-A-live-cell" tests | wc -l` → **0**.
- Bug-doc witness lines: `grep -rn -- "CELL-A-live-cell" docs | wc -l` → **1**, this record's :874. The unsuffixed path is cited in docs/bugs/0243 (:115, :460), 0286:252, 0287:273, 0384:192.
- Coverage matrix: `grep -c "0228" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → **0** / **0**.
- AGENTS.md gate names: `grep -c -- "CELL-A-live-cell" AGENTS.md` → **0**.
- CHANGELOG (corroboration only): `grep -c -- "CELL-A-live-cell" CHANGELOG.md` → **0**.

## Why this is a problem
The record's H8a live evidence points at a path that has never existed, so the recorded "1/1 passed (10.3 s)" cannot be traced back from its own pointer. The witness exists one de-tokenization away and asserts the record's observable: `{a b: string}` refused at registration with `inline-field-name-not-identifier` on the system-note channel, and the `{ab: string}` sibling driving. It sits under `tests/live/**`, so it is not gate-proven. The record words it as one recorded live run. Commit 03657762 already treated this tokened filename as a stale reference and fixed it in a test comment, but not in the record.

## Suggested direction (non-binding, optional)
Re-point the mention to `tests/live/inline-field-name-not-identifier-live-cell.test.ts`, the path 36128659 added and that 03657762 already uses in the test comment.

## False-positive check
- Representations covered: bug-doc witness lines (grep over docs), test filenames (`find tests -name`, `git log --all -- <path>`), test titles and bodies (`grep -rn tests`), coverage-matrix rows (both files), AGENTS.md gate names, and CHANGELOG (corroboration). Hit counts are above.
- The equivalent witness was opened, and its describe/it titles name bug 0228's observable.
- The pointer never resolved, so the cluster key is the fix commit 36128659. No other record in this shard cites this path.
- Not already filed: `grep -rl -- "CELL-A-live" quality/intake` → 0 files other than this one. The pending "cell-a" candidates (b0074, b0210) concern other records and commits.
- Not citation form: this is an unresolvable file path, not a line-anchor form issue.

## Triage
verdict: confirmed — decayed pointer verified and the equivalent is unambiguous: docs/bugs/0228:874 cites `tests/live/inline-field-name-not-identifier-CELL-A-live-cell.test.ts`, a path with 0 commits on any ref, so nothing deleted it (36128659 added `tests/live/inline-field-name-not-identifier-live-cell.test.ts` instead). `git log --all -S"CELL-A-live"` returns only 36128659 and 03657762, and 03657762 already repaired the same token at tests/inline-object-type-source-capture.test.ts:129. The CELL-A string has 0 hits in tests/ and 1 in docs/ (this record). Witness: tests/live/inline-field-name-not-identifier-live-cell.test.ts, describe "bug 0228 live: an inline field name spelling two identifiers is refused at registration, and the space-free sibling registers and drives". Its one it() asserts `{a b: string}` is refused with theta/parse/inline-field-name-not-identifier and `{ab: string}` drives via `answer.ab`. Bugs 0243, 0286, 0287 and 0384 already cite that path. The fix is a mechanical re-point with no rewording. There is no same-sha or same-record duplicate in intake/ or issues/. Note: the candidate had no `## Triage` heading, so triage added one (triage: claude-opus-5-5)
