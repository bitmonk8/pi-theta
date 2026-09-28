---
id: PTQ-1574
title: Bug 0210's fix record names its live H8a witness "CELL-A", a label commit cea6665f never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell cell 69")
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md:734-743
  - docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md:762-773
  - tests/live/live-production-acceptance.test.ts:11474-11483
  - tests/live/live-production-acceptance.test.ts:11576
  - tests/live/live-production-acceptance.test.ts:11610-11611
  - tests/live/live-production-acceptance.test.ts:11649
  - tests/live/live-production-acceptance.test.ts:11738
  - CHANGELOG.md:4233-4234
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0210's fix record names its live H8a witness "CELL-A", a label commit cea6665f never wrote into tests/live/live-production-acceptance.test.ts (the cell landed as "cell cell 69")

## Observation
The `## Fix (0.136.0)` section of bug 0210 names its live witness three times by the label `CELL-A`: once in the Verification live bullet ("`cell CELL-A` in `tests/live/live-production-acceptance.test.ts`"), and twice in Residual 1 (the live measurement, and the "a successor fix must update that cell" pin). The token `CELL-A` does not appear anywhere in `tests/`. The live cell that record describes is in the named file under the label "cell cell 69" (`describe("H8a-T -- bug 0210 (cell cell 69): …")`). The fix commit `cea6665f` added that cell with that label and added the `CELL-A` text to the record in the same commit, and `git log -S'CELL-A'` over the test file returns no commits, so the token never resolved. The cell's own header says `cell 69` is a "DELIBERATE TOKEN" the parent lane renumbers at merge. CHANGELOG.md's 0.136.0 entry names the witness "H8a cell 69". Separately, bug 0212's fix commit `e3470433` later flipped that cell's asserted message from the refusal Residual 1 quotes to `b0210-marker=hello`. Residual 1 anticipated that flip ("a successor fix must update that cell"), so the flip is not what this filing is about. The cell is a `tests/live/**` witness and is not gate-proven.

## Evidence
Claim side, re-read just before filing.

`docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md:734-743`:
```
  (3) Live: one additive H8a cell (`cell CELL-A` in
  `tests/live/live-production-acceptance.test.ts`) drives a real spawned subagent
  child over §Reproduction site (a)'s own fixture — `mode: subagent`, `system:`
  interpolating `${__proto__}`, a single non-defaulted `__proto__: string` param,
  so the single-string bypass is taken — and asserts on the deterministic
  `userTexts` channel. Red-proven both directions live: post-fix the real child's
  real intake refusal is `subagent marshalled params failed schema validation:
  must NOT have additional properties` (the key reached the marshalled payload,
  which is site (a2)'s claim), pre-fix it is `invoke<string> return value failed
  validation` (the key never reached it and the child bound an empty params map).
```
`docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md:762-773`:
```
     configuration (`src/seams/schema-validator.ts:112`) and live through cell
     `CELL-A`, whose real spawned child hit exactly that message. Consequence: a
     ...
     report covers it (searched `docs/bugs/*.md` for the message and for
     `__proto__`). Cell `CELL-A`'s asserted message is a pin on this defect: a
     successor fix must update that cell.
```

Evidence side (the equivalent witness, opened):

`tests/live/live-production-acceptance.test.ts:11474-11483`:
```
// Bug 0210 (Phase 4 verification, cell cell 69) -- the two `params:`
// record-write sites in `spawnSubagentConversation`
// (`production-theta-producer.ts`, sites (a1)/(a2)) reach a REAL spawned
// subagent child.
//
// DELIBERATE TOKEN, NOT A NUMBER: this cell's identifier carries the literal
// token `cell 69` everywhere a cell number would otherwise go. The parent lane
// renumbers it at merge time (this worktree is a verification lane over a
// shared file several sibling lanes are extending concurrently); do not
// assign it a number here.
```
`tests/live/live-production-acceptance.test.ts:11576`: `function b0210CellALiveKidTheta(): string {`. The fixture is the one the record describes (`mode: subagent`, `system: | intro ${__proto__} outro`, `params: __proto__: string`). The only surviving trace of "CellA" is this helper name.

`tests/live/live-production-acceptance.test.ts:11610-11611`:
```
describe("H8a-T -- bug 0210 (cell cell 69): the spawnSubagentConversation params marshalling record-write site (a2) reaches a REAL spawned subagent child, live", () => {
  it("the marshalled JSON the real child's real intake validates against carries the __proto__ key, the child binds it and the parent's invoke<string> resolves Ok with the bound value, spending one real model turn", async () => {
```
`tests/live/live-production-acceptance.test.ts:11649` (the current assertion, flipped by `e3470433`): `).toEqual(["Reply with the single word OK. b0210-marker=hello"]);`

`tests/live/live-production-acceptance.test.ts:11738`: a second cell also carries the `cell 69` token (`describe("H8a-T — bug 0204 (cell 70, cell 69): …")`). A reader who re-points by number alone will therefore hit an ambiguous match. `bug 0210` is the distinguishing title substring.

`CHANGELOG.md:4233-4234` (corroboration only): `(17 cells) + H8a cell 69 (real child, \`__proto__\`-keyed params intake,`.

Searches run in this session, one per representation:
- Test bodies and titles: `rg -n --fixed-strings "CELL-A" tests | wc -l` → 0.
- Test filenames: `git ls-files tests | grep -i -- "CELL-A" | wc -l` → 0.
- History: `git log --oneline -S'CELL-A' -- tests/live/live-production-acceptance.test.ts` → 0 commits. `git log --oneline -S'b0210CellALiveKidTheta' -- tests/live/live-production-acceptance.test.ts` → `cea6665f` (the fix commit). `git log --oneline -S'cell CELL-A' -- docs/bugs/0210-…md` → `cea6665f`. `git show cea6665f:tests/live/live-production-acceptance.test.ts | grep -n 'H8a-T -- bug 0210\|cell cell'` → the title was already `bug 0210 (cell cell 69)` at the fix commit.
- Bug-doc witness lines: `grep -n 'CELL-A' docs/bugs/0210-*.md` → 3 hits (734, 763, 772), all claim-side.
- Coverage matrices: `rg -c --fixed-strings "CELL-A"` on `docs/reference/coverage-matrix.md` and on `docs/plan_topics/coverage-matrix.md` → 0 and 0. `b0210` and `cell 69` also return 0 on both.
- AGENTS.md gate names: `rg -c --fixed-strings "CELL-A" AGENTS.md` → 0.
- CHANGELOG: `rg -c --fixed-strings "CELL-A" CHANGELOG.md` → 0. The 0.136.0 entry names "H8a cell 69".

## Why this is a problem
A witness pointer has to resolve as written. This one names a cell label that no revision of the test tree has ever carried. A reader cannot find the live evidence behind the record's Verification (3) and Residual 1 by searching for its stated name. The pin in Residual 1 is also the hand-off 0212 relied on ("Cell `CELL-A`'s asserted message is a pin on this defect: a successor fix must update that cell"), and it points at nothing. This is the same lane-token-left-unresolved class other shards filed in this wave, for example 0119's `CELL-B2` at `78a6560c`.

## Suggested direction (non-binding, optional)
Re-point the three `CELL-A` mentions to the cell as it exists, `H8a-T -- bug 0210 (cell cell 69)` in `tests/live/live-production-acceptance.test.ts`. Use the `bug 0210` title substring for disambiguation, because bug 0204's cell also carries `cell 69`. A note pointing to 0212's flip of the asserted message (`e3470433`) would keep the quoted refusal legible as history.

## False-positive check
- Representations covered, one search each (commands and counts above): test bodies and titles, test filenames, bug-doc witness lines, both coverage matrices, AGENTS.md gate names, and CHANGELOG (corroboration only).
- Git history: `CELL-A` never entered the test file. The record and the cell landed together in `cea6665f` with divergent labels, so this is a pointer that never resolved rather than a later rename.
- The equivalent witness exists and asserts the observable the record describes: a real spawned child over site (a)'s fixture, asserted on `turn.userTexts`. Its asserted value was flipped by `e3470433` under 0212's authority, as 0210's Residual 1 itself anticipated. That flip is not filed.
- It is a `tests/live/**` cell, so it is not gate-proven. It was not run.
- Not a citation-FORM gate subject: no gate reads bug-doc cell labels.
- Not a duplicate: no pending or filed candidate names bug 0210 or `cea6665f` (checked against the supplied list, including the `d10-*-cell-*-token-never-resolved` filings, which cover 0073/0074/0100–0119/0155/0158/0175).

## Triage
verdict: confirmed — decayed pointer verified and the equivalent is unambiguous: `CELL-A` appears 3× in docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md (:734, :763, :772) and 0× under tests/ (rg → 0; `git log -S'CELL-A'` on the live file → no commits), and cea6665f added both the record text and the cell, with the cell already titled `bug 0210 (cell cell 69)` at that sha (so this is a token that never resolved, and no commit deleted anything); the witness is tests/live/live-production-acceptance.test.ts describe "H8a-T -- bug 0210 (cell cell 69): the spawnSubagentConversation params marshalling record-write site (a2) reaches a REAL spawned subagent child, live" (:11610, the only `describe(.*bug 0210`; fixture b0210CellALiveKidTheta :11576), which drives a real spawned child over site (a)'s `__proto__` fixture and asserts on userTexts; re-point by the `bug 0210` title substring, because bug 0204's cell (:11738) also carries `cell 69`; its asserted message is now `b0210-marker=hello` after 0212's e3470433, which Residual 1 anticipated; no same-sha or same-record duplicate in intake/issues (the 0204/0074/0228 CELL-* filings cover other records and shas) (triage: claude-opus-5-5)
