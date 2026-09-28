---
id: PTQ-1664
title: Fix record 0416's Verification says "a corpus sweep confirms no unscoped harmless-cross-fire claim remains and the new anchors resolve", but names no command, hit count, log or gate, and none of the five b0416 witness cells asserts either half
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0416-pic18-closed-event-set-contradicted-by-governor.md:196-201
  - tests/b0416-pic18-governor-event-enumeration.test.ts:116-190
  - CHANGELOG.md:1371
sites: 1
fix_scope: localized
d10_class: memory-evidence
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0416's Verification says "a corpus sweep confirms no unscoped harmless-cross-fire claim remains and the new anchors resolve", but names no command, hit count, log or gate, and none of the five b0416 witness cells asserts either half

## Observation
0416's fix changed only the spec. It scoped PIC-18's "harmless cross-fire" sentence and bump-checklist item (ah) to the five cancellation-forwarding handlers, and added new anchors (bump item (at), the armed-window caveat). The Verification bullet then makes a corpus-wide claim: no unscoped harmless-cross-fire claim remains anywhere, and the new anchors resolve. It is discharged by "a corpus sweep" with no command, search shape, hit count, log path or gate named. The record's only named witness is `tests/b0416-pic18-governor-event-enumeration.test.ts`. Its five cells check that PIC-18 names the subscribed events, contains "block", contains "armed", and that the bump text contains "before_provider_request". No cell checks for unscoped harmless-cross-fire sentences, and no cell checks anchor resolution.

## Evidence
Claim side, `docs/bugs/0416-pic18-closed-event-set-contradicted-by-governor.md:196-201` (re-read before filing):
```
- Verification: VERIFIED. (1) revert-witness — reverting the PIC-18 widening +
  the bump item reds (B)/(C)/(D)/(E) (the spec text lacks the enumeration / role
  / caveat / audit) with (A) green, restored byte-exact and EOL-preserved,
  green; (2) full suite 10441/10441 green; (3) no live (doc-only, no drive-
  outcome change); (4) tsc exit 0, lint clean; a corpus sweep confirms no
  unscoped harmless-cross-fire claim remains and the new anchors resolve.
```

The named witness, `tests/b0416-pic18-governor-event-enumeration.test.ts:116-190`. All five cells, opened and read:
```
describe("b0416 (A) shipped-surface control — governor consumes a sixth pi.on event and a blocking tool_call handler", () => {
  it("ensureRegistered subscribes exactly before_provider_request + tool_call", () => {
describe("b0416 (B) PIC-18 enumerates every event the governor subscribes (RED at fork)", () => {
    expect(missing).toEqual([]);
describe("b0416 (C) PIC-18 describes the tool_call handler's blocking role (RED at fork)", () => {
    expect(pic18).toContain("block");
describe("b0416 (D) PIC-18 carries the armed-window session-scoping caveat (RED at fork)", () => {
    expect(pic18).toContain("armed");
describe("b0416 (E) the version-bump checklist audits before_provider_request (RED at fork)", () => {
    expect(bumpText).toContain("before_provider_request");
```
In this file, `rg -n -i "harmless.cross.fire" tests/b0416-pic18-governor-event-enumeration.test.ts` → 1 hit, and it is header comment line 24, not an assertion.

Searches, one per evidence representation (run in this session):
- Bug-doc lines naming a sweep method: `grep -n -i "sweep\|rg \|grep" docs/bugs/0416-pic18-closed-event-set-contradicted-by-governor.md` → 1 relevant hit, the claim line 200 itself. A second hit at :35 matches the "rg " inside "model-arg depth", unrelated.
- Test file names: `ls tests | grep -i -E "harmless|cross-fire|crossfire|pic18|pic-18"` → 1, `b0416-pic18-governor-event-enumeration.test.ts`, whose five cells are quoted above.
- Test titles: `rg -n -i "harmless|cross-fire" tests | grep -E "(it|test|describe)\(" | wc -l` → 0. `rg -l -i "harmless.cross.fire" tests` → 1 file (b0416), header comment only.
- Anchor-resolution gates over the touched spec pages: `rg -l "version-bump-step2" tests` → 2 files (b0416, `tests/version-bump-gates.test.ts`). `rg -n "bump-checklist|<a id|anchor" tests/version-bump-gates.test.ts` → 0 hits.
- Coverage-matrix rows: `rg -c -i "harmless|cross-fire" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 hits in both (rg exit 1).
- AGENTS.md gate names: `rg -c -i "harmless|cross-fire|sweep" AGENTS.md` → 0 hits (rg exit 1).
- CHANGELOG (corroboration only): the 0416 entry at `CHANGELOG.md:1371` contains no "sweep" (`sed -n 1371p CHANGELOG.md | grep -o -i sweep | wc -l` → 0). It credits only the b0416 witness.

## Why this is a problem
The sentence asserts two things verified across the spec corpus: the absence of any unscoped "harmless cross-fire" claim, and the resolution of the new anchors. It gives only "a corpus sweep confirms". There is no search a reader or triage can re-run, no hit count, and no log path. No committed witness or gate covers either half: the five b0416 cells assert presence substrings in two pages, not corpus-wide absence or link resolution. That is an unmarked verification claim resting on an unrecorded act, the memory-evidence shape. The rest of the Verification bullet (revert-witness, suite, tsc/lint) is independently supported.

## Suggested direction (non-binding, optional)
Record the sweep's search command and hit count in the bullet, or pin the absence and anchor claims to a committed cell. Otherwise, qualify the sentence as an unrecorded reviewer check.

## False-positive check
- Read all five b0416 cells (A-E). None asserts the absence of an unscoped harmless-cross-fire sentence or checks anchor resolution. Their assertions are `toEqual([])` over subscribed-event names missing from PIC-18, and `toContain("block")`, `toContain("armed")` and `toContain("before_provider_request")`.
- Looked for a gate that would discharge anchor resolution on the two touched spec pages. The only other test reading `version-bump-step2` is `tests/version-bump-gates.test.ts`, with 0 anchor or `<a id` hits.
- Representations covered: bug-doc Witness/Gates/Verification lines, test file names, test titles (it/describe), coverage-matrix rows (both files), AGENTS.md gate names, CHANGELOG (corroboration only).
- Not an honesty marker. The line reads "confirms", with no pending qualifier. Truth of the claim is not adjudicated here, only its evidence chain.
- No pending candidate cites 0416; the brief's pending list contains no 0416 entry.

## Triage
verdict: questionable — the claim is real: 0416 bug doc :196-201 ends "a corpus sweep confirms no unscoped harmless-cross-fire claim remains and the new anchors resolve" and names no command, count or log. Every stated search reproduces (1 header-comment hit at b0416 :24; 1 filename; 0 titles; version-bump-step2 read by 2 tests; 0 hits in coverage-matrix/AGENTS.md; CHANGELOG :1371 has no "sweep"). My own searches (test filenames and titles for anchor/link/xref, closing-gate and citation-symbol-form-gate anchor logic, package.json lint/test scripts) find no witness for either half: citation-symbol-form-gate checks code-symbol cites and closing-gate checks REQ-ID/MUST anchoring, not markdown in-page anchors. The witnesses are genuinely absent, so the repair means adding a record/witness or rewording/qualifying the claim, which is a human's call. The file had no ## Triage heading, so triage added it (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (memory-evidence). APPEND EXACTLY the following block at the very end of docs/bugs/0416-pic18-closed-event-set-contradicted-by-governor.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The closing sentence above (a corpus sweep confirms no unscoped harmless-cross-fire claim remains and the new anchors resolve) was a manual sweep with no recorded command, hit count or log, and no gate checks in-page markdown anchors (the citation-symbol-form gate covers code-symbol cites; the closing gate covers requirement anchoring). It stands as an unrecorded manual observation, not a re-runnable discharge.
