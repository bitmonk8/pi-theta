---
id: pending
title: Commit 6184e7c3 (bug 0233) removed the generic-argument carve-out and flipped the witness cells bug records 0159 (d3, F1) and 0160 (the array<{a as "w": string}> boundary cell g4) name as its locks, and neither record carries a note
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0159-inline-field-name-stop-masks-duplicate.md:783-787
  - docs/bugs/0160-inline-object-wire-name-rename-unparsed.md:1029-1034
  - docs/bugs/0160-inline-object-wire-name-rename-unparsed.md:947-949
  - tests/inline-object-duplicate-field-name.test.ts:688-709
  - tests/inline-object-field-name-comparison-key.test.ts:864-901
  - tests/inline-object-wire-name-rename-refusal.test.ts:576-582
  - docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md:656-668
  - docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md:753
  - docs/bugs/0227-non-ascii-inline-object-field-name-admitted.md:643-659
  - docs/bugs/0227-non-ascii-inline-object-field-name-admitted.md:583-591
  - docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:729-733
  - docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:658-661
  - tests/inline-object-field-name-case.test.ts:995-1021
  - tests/live/inline-object-field-name-case-live-cell.test.ts:267-321
  - tests/inline-object-malformed-entry-resync.test.ts:453
  - tests/live/inline-object-malformed-entry-resync-live-cell.test.ts:124-134
  - tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts:146-155
  - docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:564-565
  - docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:201
  - docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md:616-617
  - tests/unterminated-literal-params-type-refusal.test.ts:279-290
sites: 5
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Commit 6184e7c3 (bug 0233) removed the generic-argument carve-out and flipped the witness cells bug records 0159 (d3, F1) and 0160 (the array<{a as "w": string}> boundary cell g4) name as its locks, and neither record carries a note

## Observation
Bug 0159's `## Fix (0.93.0)` says the generic-argument carve-out is "intact and load-bearing" and names cells d3 and F1 as the cells that red when `!insideGenericArgument` is dropped, with "cell d3 is the lock". Bug 0160's `## Fix (0.172.0)` Verification names the `array<{a as "w": string}>` boundary cell (g4 in its witness) as the one cell that reds when the carve-out is removed. Commit `6184e7c3` (fix(bug-0233), v0.196.0) removed `insideGenericArgument` from `walkType` and its call sites. It re-pinned all three cells from silence to refusal, each now naming bug 0233 as the authority. At HEAD, d3, F1 and g4 assert the opposite of what both records cite them as locking. `grep -rn insideGenericArgument src` returns 0 hits. Neither record mentions 0233 (0 hits in each), and 0233's own record says "Discharge notes appended: none."

## Evidence
**Claim side, record 0159**, `docs/bugs/0159-inline-field-name-stop-masks-duplicate.md:783-787` (re-read before filing):
```
- **The generic-argument carve-out and the closing-brace gate are intact and
  load-bearing**, proven by neutralisation: dropping `!insideGenericArgument`
  makes `array<{a: integer, a: string}>` fire (cells d3 and F1 red). The
  comparison runs where the LOWERING splits, not over every brace group; cell d3
  is the lock, as §Fix route (a) requires.
```
**Claim side, record 0160**, `docs/bugs/0160-inline-object-wire-name-rename-unparsed.md:1029-1034`:
```
- **Verification** — SOLID. (1) The witness reds for the right reason in the
  neutralisation direction and in two of the three probe directions, each red
  set derived in advance: full neutralisation reds exactly the 16 cells across
  five files whose expectation names the new row and nothing else; removing the
  generic-argument carve-out reds exactly the `array<{a as "w": string}>`
  boundary cell; rendering the raw key instead of the capture reds **all 22**
```
with the gate it locks stated at `:947-949`: "Both gates inherited byte-for-byte from the two neighbours (`closingBraceSpelled`, withheld under `insideGenericArgument` — the neighbours' lowering-grounded reason, …".

**Evidence side, the cells at HEAD:**
- `tests/inline-object-duplicate-field-name.test.ts:688` (d3): `it("RED d3 (generic argument interior, fixture H1) — bug 0233: \`array<{a: integer, a: string}>\` now draws the raw-key refusal at every depth", …`, with `:704-709` `expectList(body(\`schema S { p: array<${DUP}> }\`), [dupLine("a")], "d3 — bug 0233: the generic-argument gate is gone, …")`. At `e54338a7` (0159's fix commit) the same cell read `it("CONTROL d3 (generic argument interior, fixture H1): \`array<{a: integer, a: string}>\` stays silent at every depth"` (`git show e54338a7:tests/inline-object-duplicate-field-name.test.ts`, line 728).
- `tests/inline-object-field-name-comparison-key.test.ts:865` (F1): `it("F1: a nested reuse and an unclosed interior stay silent; a generic argument's interior is refused (bug 0233)"`, expected map `:887-888` `"generic argument": [dupLine("a")], "generic argument, nested": [dupLine("a")]`, message `:898-900` "F1 — bug 0233: the generic-argument gate is gone from `walkType`'s raw-key loop …". At `e54338a7` it was `it("CONTROL F1: a generic argument's interior, a nested reuse and an unclosed interior stay silent"` (line 841), with the message "`insideGenericArgument` and the spelled closing brace still decide WHETHER a body is compared at all".
- `tests/inline-object-wire-name-rename-refusal.test.ts:576-582` (g4):
```
    // the generic-argument gate this row inherited from bug 0052 is gone from
    // `walkType`'s raw-key loop, so the rename clause inside a generic
    // argument is now refused exactly as it is at any other position. The
    // LOWERING still never divides that interior into fields (CONTROL G3
    // below), which bounds the wire consequence, not whether the source is
    // judged.
    { cell: "g4", src: annotSrc('array<{a as "w": string}>'), expected: [REN("a")] },
```
  At `9eb410df` (0160's fix commit) it was `{ cell: "g4", src: annotSrc('array<{a as "w": string}>'), expected: [] }` (line 594).
- The flipping commit: `git show 6184e7c3 -- tests/inline-object-wire-name-rename-refusal.test.ts` shows the `- … expected: [] },` → `+ … expected: [REN("a")] },` hunk under `// g4 — RE-PINNED for bug 0233`. `git show --stat 6184e7c3` lists all three witness files (`inline-object-duplicate-field-name.test.ts | 47`, `inline-object-field-name-comparison-key.test.ts | 47`, `inline-object-wire-name-rename-refusal.test.ts | 38`) and no `docs/bugs/0159-*` or `docs/bugs/0160-*` file. `docs/bugs/0233-…md:656-668` names both witness files among the "Nine shipped witnesses re-pinned … each naming this report as the authority", and `:753` reads `- Discharge notes appended: none.`

Searches (run this session, repo root):
- `grep -rn "insideGenericArgument" src | wc -l` → 0.
- `grep -n "0233" docs/bugs/0159-inline-field-name-stop-masks-duplicate.md docs/bugs/0160-inline-object-wire-name-rename-unparsed.md | wc -l` → 0.
- `git log --format="%h %ad %s" --date=short -S "RED d3" -- tests/inline-object-duplicate-field-name.test.ts` → `6184e7c3 2026-08-22 fix(bug-0233): …` only.
- `grep -rl "6184e7c3" quality/ docs/bugs` → no intake file lists 0159 or 0160 under this sha. The only intake mention is `qw20260928081617-d10-03-e54338a7-0052-residual-pins-flipped-no-note.md:103`, which leaves 0052's d3 unfiled as a related sha.

## Why this is a problem
Both records say, in their verification wording, that a named witness cell locks the generic-argument carve-out. For 0159 the wording is present-tense: "intact and load-bearing", "cell d3 is the lock". A reader following either pin today finds a cell asserting a refusal inside a generic argument and naming another bug as its authority. The carve-out it supposedly locks no longer exists in `src/`. Both records carry appended notes for other later re-pins of the same witness files (0159 has the 0176 note at `:954`; 0160 has the 0229 discharge text in its Residuals item 1), so the house practice of recording a sibling's re-pin in the cited record is established. This root cause is the one it missed. Anyone taking d3/F1/g4 as the carve-out's lock, or re-running the cited neutralisation, gets a mismatch that the record does not explain.

## Suggested direction (non-binding, optional)
Append a dated note to 0159 and to 0160 recording that bug 0233 (v0.196.0, `6184e7c3`) removed the carve-out, and that cells d3/F1 and g4 are now RED refusal cells under 0233's authority. The equivalent witness for the removal is `tests/generic-argument-inline-field-key-rules.test.ts` (0233's own witness). Each record's statements stay as the dated fix-time record.

## False-positive check
- Checked each cited cell separately at HEAD and at its citing fix commit (d3 and F1 at `e54338a7`, g4 at `9eb410df`). All three were silence cells then and all three are refusal cells now. All three flips come from `6184e7c3`.
- Checked for an existing note: `grep -n "0233"` over both records → 0. Each record's appended notes are 0176 (0159 `:954-967`) and 0229/0154 (0160). None concerns the generic-argument gate.
- Checked for a same-sha filing: no pending intake cites 0159 or 0160 under `6184e7c3`. The e54338a7/0052 filing names 6184e7c3 only as left unfiled for record 0052, which is outside this shard, so this filing lists only its own shard's records.
- Records in this shard checked and not listed: 0161 mentions cell d3 only in its filing-time §Non-goals (`:516-519`, "silent by 0052's settled reading (its cell d3)"), which describes the tree at filing HEAD `f856fd33` and makes no verification claim. 0162, 0163 and 0164 do not cite these cells.
- Not citation form: no gate checks `docs/bugs/**` cell pins. I did not adjudicate whether either claim is true, and I executed nothing.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. Every excerpt and search reproduces. 0159:783-787 still says the carve-out is "intact and load-bearing" with "cell d3 is the lock" (d3/F1). 0160:947-949 and :1029-1034 cite the carve-out and its `array<{a as "w": string}>` boundary cell. At HEAD, d3 (inline-object-duplicate-field-name.test.ts:688-709), F1 (inline-object-field-name-comparison-key.test.ts:865-900) and g4 (inline-object-wire-name-rename-refusal.test.ts:582) assert refusal under bug 0233. At e54338a7 (:728, :841) and 9eb410df (:594) they were CONTROL/`expected: []`. `git show --stat 6184e7c3` touches all three witness files and neither record. `grep insideGenericArgument src` → 0, `grep 0233` over both records → 0, and 0233:753 says "Discharge notes appended: none". Nothing was deleted: the cells were re-pinned, and the carve-out they locked no longer exists, so there is no equivalent lock to re-point to. The repair is a new dated note about the removal (0233 / tests/generic-argument-inline-field-key-rules.test.ts, which exists), not a mechanical re-point; this matches the sibling flipped-no-note rulings. Same-sha: this is the earliest 6184e7c3 filing (d10-05 0227/0231 and 0232 come later; no PTQ exists), so it survives (triage: claude-opus-5-5)
