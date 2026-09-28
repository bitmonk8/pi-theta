---
id: PTQ-1593
title: Bug 0211's fix record names its live H8a witness "CELL-C", a label commit e0873e53 never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell 76")
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md:830-836
  - docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md:848-851
  - docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md:917-918
  - tests/live/live-production-acceptance.test.ts:12529-12531
  - tests/live/live-production-acceptance.test.ts:12566-12567
  - tests/live/live-production-acceptance.test.ts:12570-12571
  - tests/live/live-production-acceptance.test.ts:12616-12637
  - CHANGELOG.md:4013-4014
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0211's fix record names its live H8a witness "CELL-C", a label commit e0873e53 never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell 76")

## Observation
The `## Fix (0.150.0)` section of bug 0211 names its live witness three times by the label `CELL-C`: once in "What shipped", once in the live H8a gate result ("`CELL-C` green in 363 ms"), and once in Verification (3) ("The live path is exercised end to end by `CELL-C`"). The token `CELL-C` does not appear anywhere in `tests/` today. The live cell the record describes is in the named file under the label "cell 76" (`describe("H8a-T — bug 0211 (cell 76): …")`). The fix commit `e0873e53` wrote that cell with the `cell 76` label and wrote `CELL-C` into the record in the same commit. At that commit the test file carried `Bug 0211 (cell 76)` and no `CELL-C`. The cell's own `NOTE (cell 76): the parent renumbers cells at merge` indicates `CELL-C` was a lane-local placeholder the record kept. CHANGELOG.md's 0.150.0 entry names the witness "H8a cell 76". The cell is a `tests/live/**` witness and is not gate-proven.

## Evidence
Claim side, re-read just before filing.

`docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md:830-836`:
```
  - `tests/live/live-production-acceptance.test.ts` — tail-appended H8a cell
    `CELL-C`: a `.theta` whose import specifier list is missing a separator
    against a resolvable planted `.thetalib` does not register, its
    comma-separated sibling does, and the `theta-system-note` channel carries
    `<code>: <message>` with the message read from the registry.
    Registration-only, zero model turns. Additive only — no existing cell edited,
    reworded, reordered or renumbered.
```
`docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md:848-851`:
```
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Tests 1 failed | 73 passed
    (74)`; `CELL-C` green in 363 ms, and every import / export cell in the file
    green (bug 0100's cell 67, bug 0101's cell 71). The one red is the
```
`docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md:917-918`:
```
  (`git diff --stat` empty) and green. (3) The live path is exercised end to end
  by `CELL-C`, run for real, plus both H9a files. (4) Typecheck and lint clean.
```
The same record's sibling pins resolve as written. `bug 0100's cell 67` is at `:11268` and `bug 0101's cell 71` is at `:11904` of the live file. Only this record's own cell is named by a placeholder.

Evidence side (the equivalent witness, opened):

`tests/live/live-production-acceptance.test.ts:12529-12531`:
```
// Bug 0211 (cell 76) — a separator-degenerate `import { a b }` specifier list
// (imports.md §"Re-exports" :62–65, `"{" ImportSpec ("," ImportSpec)* ","? "}"`
// requires a `,` between two specifiers) is silently recovered into the SAME
```
`tests/live/live-production-acceptance.test.ts:12566-12567`:
```
// NOTE (cell 76): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
```
`tests/live/live-production-acceptance.test.ts:12570-12571`:
```
describe("H8a-T — bug 0211 (cell 76): a separator-degenerate import specifier list is refused, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose import specifier list is missing a separator, while its comma-separated sibling registers, and the theta-system-note channel carries the refusal, through the real discovery\u2192registration path", async () => {
```
`tests/live/live-production-acceptance.test.ts:12616-12637` asserts what the record claims: the missing-separator theta is unregistered (`handle.command("b211livemissing")` → `toBeUndefined()`, `registeredNames()` `not.toContain("b211livemissing")`), and a `theta-system-note` carries `malformedSpecifierListFragment()`. A preceding control requires the comma-separated sibling `b211livectl` to register.

`CHANGELOG.md:4013-4014` (corroboration only): `` `tests/import-specifier-separator-production-required.test.ts` (68 cells, `` / `39 red pre-fix) + H8a cell 76 (red-proven).`

Searches run in this session, one per representation:
- Test bodies and titles: `rg -n --fixed-strings "CELL-C" tests | wc -l` → 0.
- Test filenames: `git ls-files tests | grep -i -- "CELL-C" | wc -l` → 0.
- History: `git log --oneline -S'CELL-C' -- docs/bugs/0211-…md` → `e0873e53` (the fix commit). `git show e0873e53:tests/live/live-production-acceptance.test.ts | grep -n 'CELL-C\|Bug 0211 (cell\|bug 0211 (cell'` → only `12347:// Bug 0211 (cell 76)` and `12388:describe("H8a-T — bug 0211 (cell 76): …`, with no `CELL-C`. `git log --oneline -S'CELL-C' -- tests` → `799a2846` (added) and `16ed0290` (removed). Both belong to an unrelated bug-0206-era comment naming `tests/live/tools-field-shape-refusal-live-cell.test.ts` (`git show 16ed0290` hunk in `tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts`), not this cell.
- Bug-doc witness lines: `grep -n 'CELL-C' docs/bugs/0211-*.md` → 3 hits (831, 850, 918), all claim-side.
- Coverage matrices: `rg -c --fixed-strings "CELL-C"` on `docs/reference/coverage-matrix.md` and on `docs/plan_topics/coverage-matrix.md` → 0 and 0. `0211` and `cell 76` also return 0 on both.
- AGENTS.md gate names: `rg -c --fixed-strings "CELL-C" AGENTS.md` → 0.
- CHANGELOG: `rg -c --fixed-strings "CELL-C" CHANGELOG.md` → 0. The 0.150.0 entry names "H8a cell 76".

## Why this is a problem
A witness pointer has to resolve as written. The record's live evidence (What shipped, the H8a gate line, and Verification (3)) is keyed to a label no revision of the test file carried for this cell. A search for the stated name finds nothing, or, in history, an unrelated 0206-era comment. This is the same lane-token-left-unresolved class other shards filed in this wave, for example 0119's `CELL-B2` at `78a6560c`.

## Suggested direction (non-binding, optional)
Re-point the three `CELL-C` mentions to `H8a-T — bug 0211 (cell 76)` in `tests/live/live-production-acceptance.test.ts`, the label CHANGELOG 0.150.0 already uses.

## False-positive check
- Representations covered, one search each (commands and counts above): test bodies and titles, test filenames, bug-doc witness lines, both coverage matrices, AGENTS.md gate names, and CHANGELOG (corroboration only).
- Git history: the record and the cell landed together in `e0873e53` with divergent labels. The one historical `CELL-C` in `tests/` (`799a2846` → `16ed0290`) names a different file and bug, so it is not a renamed form of this cell.
- The equivalent witness exists and asserts every observable the record lists: the degenerate sibling is unregistered, the comma control registers, and the system note carries the registry fragment. It is `tests/live/**`, so it is not gate-proven. It was not run.
- Not a citation-FORM gate subject: no gate reads bug-doc cell labels.
- Not a duplicate: no pending or filed candidate names bug 0211 or `e0873e53` (checked against the supplied list).

## Triage
verdict: confirmed — the pointer does not resolve: `CELL-C` appears 3 times in bug 0211 (:831, :850, :918) and 0 times in tests/, test filenames, both coverage matrices, AGENTS.md and CHANGELOG; the only historical `CELL-C` in tests/ (799a2846→16ed0290) is an unrelated 0206-era comment. There is exactly one equivalent, and it is unambiguous: e0873e53 wrote the record and the cell together, and the cell has only ever been labelled `cell 76` (`git show e0873e53:…` finds no `CELL-C`). That witness is tests/live/live-production-acceptance.test.ts, describe "H8a-T — bug 0211 (cell 76): a separator-degenerate import specifier list is refused, live (Convention: live-host acceptance)" (:12570), and it asserts every observable the record lists (control b211livectl defined, b211livemissing undefined and unregistered, system note carries malformedSpecifierListFragment()). CHANGELOG 0.150.0 also names it "H8a cell 76". The fix is a mechanical re-point of the three mentions, with the wording otherwise untouched. No other intake file or PTQ tracks e0873e53 or this pointer. The candidate had no ## Triage heading, so triage added one (triage: claude-opus-5-5)
