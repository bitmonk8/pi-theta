---
id: PTQ-1598
title: "Bug 0220's 0.169.0 fix record names its live witness as \"cell 83 (`CELL-B2`)\" and gates it with `-t \"CELL-B2\"`, but 5c700194 landed it as \"cell 84 (bug 0220)\"; cell 83 is bug 0222's, and no test title contains `CELL-B2`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:526-531
  - docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:537-540
  - docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:560-562
  - tests/live/live-production-acceptance.test.ts:13889-13890
  - tests/live/live-production-acceptance.test.ts:13725-13726
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0220's 0.169.0 fix record names its live witness as "cell 83 (`CELL-B2`)" and gates it with `-t "CELL-B2"`, but 5c700194 landed it as "cell 84 (bug 0220)"; cell 83 is bug 0222's, and no test title contains `CELL-B2`

## Observation
The `## Fix (0.169.0)` section of bug 0220 identifies its live H8a witness three times: What shipped ("new cell 83 (`CELL-B2`)"), the Gates live command (`-t "CELL-B2"` → `Tests 1 passed`) and Verification ("Live cell 83 green post-fix and red pre-fix"). The fix commit 5c700194 added the cell as `describe("cell 84 (bug 0220): …")`, and its CHANGELOG entry says "H8a cell 84". The cell numbered 83 in the same file is bug 0222's, added by af108d2f, an ancestor of 5c700194 that was already present at 5c700194's parent. So the record's number resolves to a different bug's cell. The token `CELL-B2` appears in no test title under `tests/`. Only the file-local constant `VOID_IN_NON_RETURN_CODE_CELL_B2` (underscore) keeps the lane letter. The recorded `-t "CELL-B2"` command therefore selects no cell. The record has not been edited since 5c700194.

## Evidence
Claim side, `docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:526-531` (What shipped; re-read before filing):
```
  - `tests/live/live-production-acceptance.test.ts` — new cell 83 (`CELL-B2`),
    H8a: the subject document registers through the shipped composition and
    drives a real turn, asserted on the `theta-system-note` channel (absence of
    the refusal note, whole-list equality) and the sentinel in the streamed
    text, not on `prompt()` resolving. `tests/live/permitted-codes.json`
    byte-untouched — the fix removes an emission and adds no code.
```
`:537-540` (Gates):
```
  (`eslint … "src/**/*.ts"`) → clean. Live `npx vitest run --config
  config/vitest/vitest.live.config.ts
  tests/live/live-production-acceptance.test.ts -t "CELL-B2"` → `Tests 1
  passed`, run under the shared live lock.
```
`:560-562` (Verification):
```
  green again. (2) Full default suite green, 358/7322. (3) Live cell 83 green
  post-fix and red pre-fix with the deterministic non-registration signature
  (the control theta registers, the subject does not), red-proved in both
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:13889-13890`:
```
describe("cell 84 (bug 0220): a root `void` fn-return sink supplies no QRY-2 sink, so the tail query registers and drives (Convention: live-host acceptance)", () => {
  it("registers and drives to normal completion with no void-in-non-return-position refusal note, where pre-fix the same document refused to register", async () => {
```
The cell the record's number actually resolves to, `:13725-13726`:
```
describe("H8a-T — bug 0222: the QRY-4 explicit-schema check withholds a refused `let` annotation, live (Convention: live-host acceptance)", () => {
  it("a `let` annotation array<integer--> refused by the parser draws the refusal alone on the theta-system-note channel, with no explicit-schema-mismatch warning beside it (cell 83)", async () => {
```

Searches (run this session):
- Test titles / tokens: `grep -rn 'CELL-B2' tests/ | wc -l` → 0. `grep -rn 'CELL_B2' tests/live/live-production-acceptance.test.ts | wc -l` → 22: constant identifiers only, which `-t` does not match.
- Live file history: `git log --oneline -S'CELL-B2' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0. (`git log -S'CELL-B2' -- tests/` → 3 commits, 766e4c8d, 28c5c72b and dc0b6911, belonging to bugs 0282/0157/0156 and to other files.)
- Landing: `git log --oneline -S "(bug 0220)" -- tests/live/live-production-acceptance.test.ts` → 5c700194. Its added describe reads "cell 84 (bug 0220)". `grep -n 'describe("cell 84 (bug 0220)' tests/live/live-production-acceptance.test.ts | wc -l` → 1.
- Cell 83 predates the fix: `git show 5c700194^:tests/live/live-production-acceptance.test.ts | grep -n "(cell 83)"` → `:13596`, bug 0222's `it`. `git merge-base --is-ancestor af108d2f 5c700194` → ancestor.
- Same-commit origin: `git show 5c700194 -- docs/bugs/0220-…md | grep -c '^+.*CELL-B2'` → 2. Unrepaired since: `git log --oneline 5c700194..HEAD -- docs/bugs/0220-…md | wc -l` → 0.
- Test file names: `grep -rln '0220' tests/live/ | wc -l` → 1 (the acceptance file). No standalone live cell file exists for 0220.
- Coverage matrix / AGENTS.md gate names: `grep -nw 'CELL-D\|CELL-B2' docs/reference/coverage-matrix.md AGENTS.md | wc -l` → 0.
- CHANGELOG (corroboration only): `grep -n 'cell 84' CHANGELOG.md` → `:3746` "`tests/fn-return-void-query-sink.test.ts` (7 cells) + H8a cell 84."

## Why this is a problem
Each of the record's three live-verification claims points somewhere wrong. The number sends a reader to bug 0222's QRY-4 cell, which exercises a different subject (a refused `let` annotation, not a `void` fn-return sink). The token matches no test name, so the recorded `-t "CELL-B2"` gate cannot select the cell whose "Tests 1 passed" it reports. The equivalent cell exists, so the chain breaks at the pointer. That cell is under `tests/live/**`: it exists, but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Re-point the three mentions, including the `-t` filter, at "cell 84 (bug 0220)".

## False-positive check
- Representations covered: bug-doc What shipped / Gates / Verification lines (all three quoted); test file names (one live file mentions 0220); test titles and tokens (`CELL-B2` → 0 in `tests/`, `CELL_B2` constants only, the numbered describe found at `:13889`); coverage-matrix rows and AGENTS.md gate names (0 hits); CHANGELOG (corroboration, `:3746`).
- Not a later renumbering: 5c700194 added the describe as "cell 84" from the start (`git show 5c700194 -- tests/live/live-production-acceptance.test.ts` → `+describe("cell 84 (bug 0220): …`), and cell 83 was already bug 0222's at the parent.
- The offline witnesses the record names resolve: `tests/fn-return-void-query-sink.test.ts` exists with 7 `it(` cells, matching "new, 7 cells", and `tests/let-annotation-query-double-emission.test.ts` exists. Only the live leg is affected.
- The same bullet's "`tests/live/permitted-codes.json` byte-untouched" also names a path that is not in the tree. `git log --all -- tests/live/permitted-codes.json` → no commits, and the only tracked list is `tests/fixtures/h7a/permitted-codes.json`. That is recorded here only as context and is not counted as a site. It is not a witness pin.
- No existing D10 candidate cites 5c700194. The only hit under `quality/` (`grep -rl 5c700194 quality/`) is resolved PTQ-0747, a D7 registry-oracle finding that names the sha only as the fn-return-void-query-sink file's authoring commit.

## Triage
verdict: confirmed — decayed pointer reproduced: 0220:526-531, :537-540 and :560-562 name the live witness "cell 83 (`CELL-B2`)" / `-t "CELL-B2"` / "Live cell 83". `grep -rn CELL-B2 tests/` → 0; the 22 `CELL_B2` hits are identifiers, and none sits in a describe/it title; `git log -S'CELL-B2'` on the live file → 0 commits. Cell 83 is bug 0222's `it` at tests/live/live-production-acceptance.test.ts:13726, already present at 5c700194^ (:13596; af108d2f is an ancestor). 5c700194 added the witness as `describe("cell 84 (bug 0220): a root `void` fn-return sink supplies no QRY-2 sink, so the tail query registers and drives …")` / `it("registers and drives to normal completion with no void-in-non-return-position refusal note, where pre-fix the same document refused to register")` at :13889-13890. That is the only 0220 describe and the only "cell 84" in tests/live, and CHANGELOG:3746 corroborates it. The record is unedited since 5c700194. No intake/issue shares sha 5c700194; the other CELL-B2 filings (0119/78a6560c, 0204/e5d760bd, 0157/28c5c72b) cover other records. The unambiguous equivalent is verified, so the fix is a mechanical re-point of all three mentions, `-t` filter included (triage: claude-opus-5-5)
