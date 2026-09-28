---
id: PTQ-1561
title: "Bug 0150's 0.177.0 fix record says its live cell is \"tagged `CELL-C`\", but 300ee733 de-tokenized tests/live/fn-param-annotation-optional-live-cell.test.ts in the same commit and the token has never been in the file"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md:1009-1012
  - tests/live/fn-param-annotation-optional-live-cell.test.ts:7-9
  - tests/live/fn-param-annotation-optional-live-cell.test.ts:115-116
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0150's 0.177.0 fix record says its live cell is "tagged `CELL-C`", but 300ee733 de-tokenized tests/live/fn-param-annotation-optional-live-cell.test.ts in the same commit and the token has never been in the file

## Observation
The `## Fix (0.177.0)` What-shipped list in bug 0150 names the new live cell and says it is "tagged `CELL-C`". The file path it names exists. The file contains no `CELL-C` today, and it contained none at the fix commit 300ee733, which wrote both the file and the record. That commit's own message says the cell "was CELL-C, de-tokenized: 1 parenthesized + 2 comment tokens, zero artifacts". So the token was stripped from the test before commit, and the record kept the tag. The file's header still says the cell "carries a literal title token". Its `describe` title is "bug 0150 — a `fn` parameter with no type annotation is the blessed shape at live production load and drive", which carries no such token.

## Evidence
Claim side, `docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md:1009-1012` (re-read before filing):
```
  - `tests/live/fn-param-annotation-optional-live-cell.test.ts` — one live H8a
    cell (new), tagged `CELL-C`: the blessed shape registers, drives, and lands
    no `theta-system-note`, with a planted `binding-case-mismatch` theta proving
    the note channel is live so the absence cannot pass vacuously.
```

Evidence side, the equivalent witness (same path), `tests/live/fn-param-annotation-optional-live-cell.test.ts:7-9`:
```
// the bug 0104 / bug 0141 standalone-live-file precedent. This lane's parent
// renumbers the H8a sequence at merge, so the cell carries a literal title
// token rather than a numeric id from the existing sequence.
```
`:115-116`:
```
describe("bug 0150 — a `fn` parameter with no type annotation is the blessed shape at live production load and drive", () => {
  it("registers the unannotated-parameter theta, renders the value it computed, and lands NO theta-system-note (bug 0150)", async () => {
```
Commit 300ee733's message (from `git show 300ee733 --stat`) includes: "standalone live cell (was CELL-C, de-tokenized: 1 parenthesized + 2 comment tokens, zero artifacts)".

Searches (all run this session):
- Bug-doc mentions: `grep -n "CELL-" docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md` → 1 hit, `:1010`. The Gates and Verification lines call it "the new cell" and do not repeat the token.
- Test titles and tokens: `grep -rn "CELL-C" tests/ | wc -l` → 0.
- File history: `git log --oneline -S'CELL-C' -- tests/live/fn-param-annotation-optional-live-cell.test.ts | wc -l` → 0, so the token never entered the file's history. Also, `grep -c 'CELL-C'` over `git show <c>:tests/live/fn-param-annotation-optional-live-cell.test.ts` for each of the file's 9 commits (300ee733 … 901c0e79) → 0 every time.
- Same-commit authorship: `git show 300ee733 -- docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md | grep -c "^+.*CELL-C"` → 1.
- Test filenames: `ls tests/live/fn-param-annotation-optional-live-cell.test.ts` resolves. The offline witness `tests/fn-param-annotation-optional.test.ts` resolves, with cells a1–a5 (`:208`–`:280`), A1–A16 (`:368`–`:563`) and B1/B2/B3/B8/B9 (`:588`–`:657`), as the record names them. The stem the cell does carry is `cellcnoannot` (`grep -rn "cellcnoannot" tests/ | wc -l` → 3).
- Coverage matrix: this repository has no coverage-matrix doc cited by the record. `grep -rln "fn-param-annotation-optional" docs/ --include=*.md` → 7 bug docs, none a matrix.
- AGENTS.md gate names: the live leg is not a gate claim.
- CHANGELOG (corroboration only): `grep -n "CELL-C" CHANGELOG.md` → 0. The 0150 entry at `:3621` names the cell by its stem, "a standalone live cell (`fn-param-annotation-optional-live-cell`)".

## Why this is a problem
The record identifies its live-verification cell by a tag that no test carries, and it states the tag as fact ("tagged `CELL-C`"). The fix commit itself records that the tag was removed. Anyone trying `-t "CELL-C"`, or searching for the tag, selects nothing. The live cell is a tests/live/** witness: it exists, but the preflight gate does not prove it. Other shards in this wave filed the same stale lane-token shape for bug 0104 (590fc43e), which has a different sha. This record is not listed there.

## Suggested direction (non-binding, optional)
Re-point the What-shipped bullet at the file path and its landed `describe` title ("bug 0150 — a `fn` parameter with no type annotation is the blessed shape…"), dropping the `CELL-C` tag. This could be an appended dated note.

## False-positive check
- Representations covered:
  - bug-doc What-shipped/Gates/Verification lines (1 token hit);
  - test file names (both the live and offline files resolve);
  - test titles and tokens (`CELL-C` → 0 across tests/; the `describe`/`it` titles are quoted);
  - coverage matrix (none applies);
  - AGENTS.md gate names (not a gate claim);
  - CHANGELOG (corroboration: no token, the stem is named).
- Honesty markers: the record carries no "provisional"/"renumbered at merge" hedge on the tag. The test header's "parent renumbers … at merge" sentence is contradicted by the landed title, and by the commit message's "de-tokenized".
- Not a later rename: history `-S` shows the token was never committed in the file. The decay happened inside 300ee733.
- Not a form-gate matter: citation-symbol-form and the grammar-cite sweeps score `path:line`/symbol form, not whether a test-title token resolves.
- Not a duplicate: no pending candidate cites bug 0150. The 0104 CELL-C filing (590fc43e) is a different record and a different sha.

## Triage
verdict: confirmed — decay reproduces: bug 0150's What-shipped bullet at :1009-1012 is the only `CELL-` hit in the record and says the cell is "tagged `CELL-C`", but `grep -rn CELL-C tests/` → 0 and `git log -S CELL-C` on the live file → 0; all 9 of the file's commits (300ee733…901c0e79) hold 0 hits; 300ee733 added the tag to the doc (1 `+` line) and its commit message says "was CELL-C, de-tokenized". The equivalent is unambiguous and verified: tests/live/fn-param-annotation-optional-live-cell.test.ts, describe "bug 0150 — a `fn` parameter with no type annotation is the blessed shape at live production load and drive" / it "registers the unannotated-parameter theta, renders the value it computed, and lands NO theta-system-note (bug 0150)" (:115-116), so the fix is a mechanical re-point. No other intake file or PTQ cites 300ee733 or this record; the CELL-C filings for 0104/0103/0211 cover different records and shas. The only drift is the corroborating CHANGELOG stem cite, now at :3630, not :3621 (triage: claude-opus-5-5)
