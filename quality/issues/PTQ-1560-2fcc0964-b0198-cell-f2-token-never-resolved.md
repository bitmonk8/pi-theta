---
id: PTQ-1560
title: "Bug 0198's 0.192.0 fix record names its six new witness cells by the title-token `CELL-F2`, but no test in the tree carries that token and the landing commit 2fcc0964 never added it; the cells sit under the describe `bug 0198 — the BND-3 transport row …`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0198-binder-bnd3-note-drops-provider-text-on-overflow-classification.md:832-839
  - docs/bugs/0198-binder-bnd3-note-drops-provider-text-on-overflow-classification.md:844-848
  - tests/binder-forced-tool-dispatch.test.ts:1018-1030
  - tests/binder-forced-tool-dispatch.test.ts:1057-1148
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0198's 0.192.0 fix record names its six new witness cells by the title-token `CELL-F2`, but no test in the tree carries that token and the landing commit 2fcc0964 never added it; the cells sit under the describe `bug 0198 — the BND-3 transport row …`

## Observation
Bug 0198 is fixed (0.192.0). Its `## Fix (0.192.0)` "What shipped" list names the witness as six new cells in `tests/binder-forced-tool-dispatch.test.ts`, located by "(title-token `CELL-F2`)". The token `CELL-F2` does not appear anywhere under `tests/`. It was not in that file at the fix commit either: the only commit in history whose diff contains the string is 2fcc0964, and it adds the string to the bug document only. So the pointer is not a later rename. It has never resolved as stated. The six cells do exist and the default suite (green at this wave's head) runs them. They are grouped under `describe("bug 0198 — the BND-3 transport row carries the classifier's own message whenever it is non-empty", …)` at `:1018`, and none of their titles carries a `CELL-` prefix.

## Evidence
**Claim side:** `docs/bugs/0198-binder-bnd3-note-drops-provider-text-on-overflow-classification.md:832-839`:
```
  - `tests/binder-forced-tool-dispatch.test.ts` — six new witness cells
    (title-token `CELL-F2`) and the ONE pre-authorized committed-cell flip
    (§Fix constraint 5): the 0011-lineage cell keeps its subject (the
    `onResponse`-captured 400 reaches the classifier, two calls, `bound: false`)
    and changes only its expected note; its banner and the file's header entry
    are rewritten to the current reason. `TRANSPORT_FALLBACK_NOTE` stays — two
    of the new cells assert it as the no-text fallback. No other cell touched.
```
The Gates entry relies on the same cells, at `:844-848`:
```
  - Witness: neutralising the selection back to the old expression reds exactly
    three cells (the flipped 0011 cell and the two new provider-text cells),
    each on `Received: "…provider transport failure)"` against the expected
    provider text; restoring gives `Tests 24 passed (24)`. Restoration proved
    exact by `git hash-object` → `f28d378f0a6c528657056bbbd5aabf6cdff7c2f0`
```

**Evidence side (the equivalent witness):** `tests/binder-forced-tool-dispatch.test.ts:1018`, `:1030`, `:1057`, `:1079`, `:1105`, `:1127`, `:1148`:
```
describe("bug 0198 — the BND-3 transport row carries the classifier's own message whenever it is non-empty", () => {
  it("the live anthropic overflow errorMessage with no onResponse capture reaches the note", async () => {
  it("length terminator with NO errorMessage still renders the fixed no-text fallback", async () => {
  it("length terminator WITH an errorMessage renders that text, not the fallback", async () => {
  it("a transport classification with an EMPTY message still renders the fixed fallback", async () => {
  it("non-perturbation: a CAPTURED 500 renders the provider text byte-identically", async () => {
  it("non-perturbation: the same 5xx bytes with NO capture render identically", async () => {
```
That is six `it(` cells, matching the record's "six". The flipped 0011-lineage cell is at `:769` (`it("classifier: onResponse-captured HTTP status reaches the classifier — anthropic 400 overflow signature renders the classifier's message", …)`). `grep -cE '^\s*(it|test)(\.each)?\(' tests/binder-forced-tool-dispatch.test.ts` → 24, matching "Tests 24 passed (24)".

Searches (run in this session):
- `grep -rn "CELL-F2" tests | wc -l` → 0
- `grep -c "CELL-" tests/binder-forced-tool-dispatch.test.ts` → 0 (no `CELL-` token convention in the file)
- `git show 2fcc0964 -- tests/binder-forced-tool-dispatch.test.ts | grep -c "CELL-"` → 0 (the fix commit's own test diff adds no such token)
- `git show 2fcc0964:tests/binder-forced-tool-dispatch.test.ts | grep -c "CELL-F2"` → 0
- `git log --all --oneline -S "CELL-F2"` → 1 commit, `2fcc0964`, which adds the string to the bug document only
- `git show 2fcc0964 -- tests/binder-forced-tool-dispatch.test.ts | grep -nE "^\+.*\b(it|describe)\("` → the seven additions listed above (one describe, six new `it`s) plus the rewritten `:769` cell

## Why this is a problem
A witness pointer that is a title-token is only useful if `-t <token>` or a grep for it finds the cells. `CELL-F2` finds nothing, so a reader following the record to its witness gets zero hits even though the witness exists and is green. This is the decayed-pointer class, in its never-resolved form: the record's locator for its own witness has never matched the tree.

## Suggested direction (non-binding, optional)
Re-point the parenthetical at the describe title `bug 0198 — the BND-3 transport row carries the classifier's own message whenever it is non-empty` (`tests/binder-forced-tool-dispatch.test.ts:1018`), or give the six cells the stated token. The claim itself does not change.

## False-positive check
- Representations covered, each with its own search: test titles/bodies (`grep -rn "CELL-F2" tests` → 0; `grep -rnE '(it|describe)\("[^"]*bug 0198' tests` → 1, the describe at `:1018`); test file names (`find tests -iname "*cell-f2*" -o -iname "*cellf2*" | wc -l` → 0); bug-doc Witness lines (`grep -rln "CELL-F2" docs/` → 1, the 0198 record itself); coverage matrix (`grep -n "CELL-F2\|0198" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → 0); AGENTS.md gate names (`grep -n "CELL-F2" AGENTS.md | wc -l` → 0); CHANGELOG, corroboration only (`grep -n "CELL-F2" CHANGELOG.md | wc -l` → 0; the 0198 entry at `CHANGELOG.md:3392` names no token).
- I checked history, not just the current tree: `git log --all -S "CELL-F2"` shows the token was never in any test file. So this is not a rename that a later commit reverted or moved.
- The record has no later note re-pointing the token: `git log --oneline -- docs/bugs/0198-…md` → 2 commits (filing f455a166, fix 2fcc0964).
- This does not overlap pending filings: no pending candidate or resolved issue cites record 0198's `CELL-F2` (`grep -rln "CELL-F2" quality/ | grep -v qw20260928081617-d10-01-2fcc0964 | wc -l` → 0, i.e. no hit other than this filing). The resolved PTQ-1515 mentions 0198 about classifier-message sanitisation, which is a behaviour topic, not this pointer.
- This is not citation form: the gates cover symbol/grammar/import-anchor form, not whether a witness token resolves.

## Triage
verdict: confirmed — decayed pointer reproduces: 0198.md:832-833 cites six witness cells by title-token `CELL-F2`, and that token has 0 hits in tests/. `git log --all -S CELL-F2` returns only 2fcc0964, and that commit's test diff contains no `CELL-` string. The unambiguous equivalent exists: tests/binder-forced-tool-dispatch.test.ts:1018, describe "bug 0198 — the BND-3 transport row carries the classifier's own message whenever it is non-empty". It holds exactly the six `it`s 2fcc0964 added: "the live anthropic overflow errorMessage with no onResponse capture reaches the note", "length terminator with NO errorMessage still renders the fixed no-text fallback", "length terminator WITH an errorMessage renders that text, not the fallback", "a transport classification with an EMPTY message still renders the fixed fallback", "non-perturbation: a CAPTURED 500 renders the provider text byte-identically", "non-perturbation: the same 5xx bytes with NO capture render identically". The file has 24 cells, matching the Gates line. The fix is a mechanical re-point of the parenthetical. No same-sha filing: sibling -02 tracks 89faa7c5, a different pointer. The candidate had no `## Triage` heading, so triage added it (triage: claude-opus-5-5)
