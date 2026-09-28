---
id: PTQ-1581
title: Fix record 0419's Verification reports "one chain-level live cell … green" but names no cell and points only to "(see fix report)", an artefact under the git-ignored .pi/tmp/ that the tree does not contain
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0419-b0366-header-asserts-reversed-belt-design.md:204-208
  - docs/bugs/0421-0389-shift-stale-cites-outside-0405-enumeration.md:276-281
  - .gitignore:32
  - CHANGELOG.md:1263
sites: 1
fix_scope: localized
d10_class: memory-evidence
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Fix record 0419's Verification reports "one chain-level live cell … green" but names no cell and points only to "(see fix report)", an artefact under the git-ignored .pi/tmp/ that the tree does not contain

## Observation
The Verification bullet of 0419's §Fix (0.426.0) states that a live cell ran green. It gives no cell path and no cell name. For the cell's identity it defers to "(see fix report)". No fix report for 0419 exists in the tracked tree. Such reports live under `.pi/tmp/`, which `.gitignore:32` excludes. `git ls-files .pi/tmp` returns 0 files. The local, untracked report itself says only "chain-level cell (see 0421 report)". A reader of the record cannot find the witness from anything citable in the repository. The sibling record 0421 does name a chain-level cell, `tests/live/nested-array-element-sink-descent-live-cell.test.ts`. The 0419 record does not cite 0421 for it.

## Evidence
Claim side, `docs/bugs/0419-b0366-header-asserts-reversed-belt-design.md:204-208` (re-read before filing):
```
- Verification: SOLID. Witness genuinely reds — reverting the header block to
  fork bytes turns cells B & C RED (A & D stay green), restore returns to the
  fixed diff. Targeted suite 15/15 green. Typecheck + lint clean. Live: one
  chain-level live cell (0419→0421→0436→0434) run under the global lock (see
  fix report) — green.
```

Searches, one per evidence representation (run in this session):
- Bug-doc Witness/Gates lines, where the record might name the cell: `grep -c "tests/live" docs/bugs/0419-b0366-header-asserts-reversed-belt-design.md` → 0. `rg -c "fix report" docs/bugs/0419-b0366-header-asserts-reversed-belt-design.md` → 1, the claim line itself.
- Test file names and titles tying a live cell to 0419: `rg -l "0419" tests/live | wc -l` → 0. `rg -n "b0419|bug 0419|0419" tests/live` → 0 hits.
- Coverage-matrix rows: `rg -c "0419" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 hits in both (rg exit 1).
- AGENTS.md gate names: `rg -c "0419" AGENTS.md` → 0 hits (rg exit 1).
- The "fix report" location: `git ls-files .pi/tmp | wc -l` → 0. `git check-ignore -v .pi/tmp/fix-open-bugs/reports-s34/0419-report.md` → `.gitignore:32:.pi/tmp/`.
- The phrase across fix records: `rg -n "chain-level" docs/bugs | wc -l` → 5. They are 0419:207, 0421:279, 0421:295, 0436:182 and 0436:196. Only 0421:279 names a path.

The one record naming the chain-level cell, `docs/bugs/0421-0389-shift-stale-cites-outside-0405-enumeration.md:276-281`:
```
- Gates: witness `b0421` gate RED at fork (11 RE-PIN cells; 3 SPEC-TRUTH green),
  GREEN after (14/14); targeted suite over the witness + all edited offline
  files + `citation-symbol-form-gate` (b0134) + `b0405` gate green;
  `npm run typecheck` clean; `npm run lint` clean; chain-level live cell
  `tests/live/nested-array-element-sink-descent-live-cell.test.ts` green under
  the global lock (real drive, 1/1). …
```
Corroboration only (out of surface): the 0419 entry at `CHANGELOG.md:1263` says "Live: the chain's `nested-array-element-sink-descent` cell 1/1 under the lock". `ls tests/live | grep nested-array-element` → `nested-array-element-sink-descent-live-cell.test.ts` (present).

## Why this is a problem
The record makes an unmarked "green" live claim. Its only pointer is to an artefact the repository does not carry. `.pi/tmp/` is git-ignored scratch, and the local copy there defers again to "0421 report". Nothing in the record is citable for the claim: no witness path, no tracked log, no dated record. That is the memory-evidence shape. The fix is comment-only and its offline witness (`tests/b0419-b0366-header-reversed-belt-design-gate.test.ts`, 4 `it()` cells) carries the actual proof. The live line is a supplementary claim that cannot be traced from the tree.

## Suggested direction (non-binding, optional)
Replace "(see fix report)" with the cell path that 0421:279 and the CHANGELOG entry name, `tests/live/nested-array-element-sink-descent-live-cell.test.ts`. As a `tests/live/**` cell it exists but is not gate-proven. Alternatively, drop the live line as not owed for a comment-only fix.

## False-positive check
- Confirmed that 0419 names no live path anywhere, including §Fix "What shipped", Gates, Verification and Residuals: `grep -c "tests/live"` → 0.
- Confirmed that the pointed-to "fix report" is not tracked: `git ls-files .pi/tmp` → 0 files, and `.gitignore:32` ignores `.pi/tmp/`. Its local untracked copy (`.pi/tmp/fix-open-bugs/reports-s34/0419-report.md:20`) says only "chain-level cell (see 0421 report)". The pointer is untraceable in-tree even through its own chain.
- Representations covered: bug-doc Witness/Gates lines (0419 and every "chain-level" mention across docs/bugs), test file names and titles under tests/live, both coverage-matrix files, AGENTS.md gate names, CHANGELOG (corroboration only).
- Not an honesty marker. The line states the cell ran "green" with no pending or deferred qualifier.
- No pending candidate cites 0419; the brief's pending list contains no 0419 entry.

## Triage
verdict: confirmed — every excerpt and stated search reproduces: 0419:204-208 says "(see fix report)" and names no cell; grep tests/live in 0419 → 0; rg 0419 in tests/live, both coverage matrices and AGENTS.md → 0; git ls-files .pi/tmp → 0; .gitignore:32 ignores .pi/tmp/; "chain-level" appears 5× in docs/bugs and only 0421:279 names a path; the untracked 0419 report only defers to "see 0421 report". The witness does exist in the tree and is unambiguous, because 0421:279-281 and CHANGELOG:1263 both name it: tests/live/nested-array-element-sink-descent-live-cell.test.ts, describe "bug 0241 live: the nested element sink admits its rule-3 literal so the theta registers and drives, while the nested element VIOLATION stays refused under rule 1" / it "registers the nested `array<array<A | B>>` binding and drives it to the live sentinel, …". So the fix is a mechanical re-point of "(see fix report)" to that path, a live cell rather than a gate. No duplicate among intake or PTQs (triage: claude-opus-5-5)
