---
id: PTQ-1585
title: "Bug 0242's 0.215.0 fix record cites witness groups (N) and (O) as pinning the reserved-key shapes UNCHANGED, off-Trigger `single-line-if` included. 53cd0d86 (bug 0249) rewrote 17 of those boundary cells, N1–N5, O1–O3/O5–O7 and six (S) rows, and added no note to 0242's record"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md:626-642
  - docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md:535-543
  - tests/reserved-keyword-misfire-faces.test.ts:561-573
  - tests/reserved-keyword-misfire-faces.test.ts:580-610
  - tests/reserved-keyword-misfire-faces.test.ts:659-736
  - tests/reserved-keyword-misfire-faces.test.ts:800-870
  - docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md:822
  - docs/bugs/0248-malformed-escaping-tools-entry-containment-unwitnessed.md:572-602
sites: 17
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0242's 0.215.0 fix record cites witness groups (N) and (O) as pinning the reserved-key shapes UNCHANGED, off-Trigger `single-line-if` included. 53cd0d86 (bug 0249) rewrote 17 of those boundary cells, N1–N5, O1–O3/O5–O7 and six (S) rows, and added no note to 0242's record

## Observation
`docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md` is `fixed (0.215.0)`. Its *Residuals* 1 and 2 say that witness group `(N)` pins `schema S { p: { fn: string } }` "UNCHANGED … including the off-Trigger emission", and that group `(O)` "pins it unchanged". Row `O7` is said to keep "its HEAD list, misfire included". Commit `53cd0d86` (bug 0249, v0.240.0) rewrote those cells in `tests/reserved-keyword-misfire-faces.test.ts`. The (N) describe block now reads "now draws the parser-leaf refusal (bug 0249)". N1–N5, O1–O3 and O5–O7 now assert the refusal and/or drop `single-line-if`. O7 now asserts a "recovery-shape change". Six (S) rows, a boundary group the record lists beside (N)/(O), were rewritten too. The 0242 record has not been touched since its fix commit `679870ca`, carries no reference to 0249, and bug 0249's record says "Discharge notes appended: none."

## Evidence
Claim side, `docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md:626-642` (re-read before filing):
```
  1. **Nested inline-object field keys have no parser-leaf backstop.**
     `schema S { p: { fn: string } }` is refused today only by the lexer's
     off-Trigger `theta/parse/single-line-if`, and the other 28 reserved
     spellings at that key position are admitted at HEAD and still are. The
     shape is therefore pinned UNCHANGED (group `(N)`), including the
     off-Trigger emission, because silencing it would turn a refused source
     into an admitted one. Closing it properly needs a parser-leaf refusal at
     the inline-object field name — a candidate follow-up filing, outside this
     report's subject (`grammar.md` `ObjectType` / "Field names are
     identifiers").
  2. **The same gap at the typed object-literal expression.**
     `let x = [schema T { a: "s", fn: 1 }]` is likewise refused only by the
     lexer's `single-line-if`; group `(O)` pins it unchanged for the same
     reason. Row `O7` additionally pins the accepted cost of anchoring the
     declaration arm: a `schema` / `enum` declaration that does NOT start a
```
`:535-543` (the witness description) names "the boundary groups (N), (O), (P), (M), (S) described under Residuals".

Evidence side, `tests/reserved-keyword-misfire-faces.test.ts` (opened):
- `:561` `describe("0242 (N) — a field key inside a nested inline object type now draws the parser-leaf refusal (bug 0249)", …)`, then `:562-563` "RETAKEN under bug 0249 §Fix constraint 1's amended enumeration: N1-N5 were pinned to the off-Trigger `single-line-if` emission because no parser leaf refused a reserved key".
- `:580` N1, `:587` N2, `:593` N3, `:602` N4: "… now reports the declaration-ranged refusal alone". `:610` N5: "… now gains the refusal beside its type-mismatch verdict".
- `:800` O1, `:816` O2, `:827` O3: "now reports extra-field and the refusal, dropping single-line-if (bug 0249)". `:841` O5: "dropping single-line-if (bug 0249)". `:852` O6: "keeps single-line-if AND gains the refusal (bug 0249)". `:870` O7: "re-parses as a bare literal whose field is `schema` (bug 0249, recovery-shape change)".
- `:659` S1, `:675` S2, `:690` S4, `:707` S5, `:719` S6, `:736` S8: each "… dropping single-line-if (bug 0249)".

That is 5 + 6 + 6 = 17 cells, which matches the fix commit's "17 rows of 0242's misfire witness retaken".

Searches (all run this session):
- `git show 53cd0d86 -- tests/reserved-keyword-misfire-faces.test.ts | grep "^[-+].*it(\|describe("` → the (N) describe title replaced, and N1–N5, S1/S2/S4/S5/S6/S8, O1/O2/O3/O5/O6/O7 each replaced from "keeps single-line-if …" / "keeps the verdict it has today" to the texts above.
- `git blame -s` on the describe line `:561` and the 17 title lines → all `53cd0d861` (18 of 18).
- `grep -c 'it("[NOS][0-9]*:.*\(now \|bug 0249\)' tests/reserved-keyword-misfire-faces.test.ts` → 17.
- `grep -c "0249" docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md` → 0.
- `git log --format=%h 53cd0d86..HEAD -- docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md | wc -l` → 0. `git show 53cd0d86 --stat --format= | grep -c "0242"` → 0. The flipping commit did not edit the record.
- `docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md:822`: "- **Discharge notes appended:** none."

## Why this is a problem
Residuals 1 and 2 are the record's evidence that the out-of-subject reserved-key shapes are fenced at their HEAD verdicts. A reader who follows `group (N)` / `group (O)` / `O7` now finds cells asserting the parser-leaf refusal and a changed recovery shape, the opposite of "pinned UNCHANGED … including the off-Trigger emission". The house practice for a sibling fix that moves a record's witness is a dated coordination note in the moved record: `grep -l "^### Coordination note" docs/bugs/*.md | wc -l` → 12. In this shard, 0248 `:572-602` carries one for bug 0268's flip of its D2/D4 cells. 0242 itself records appending such a note to bug 0153 (`:585`). 0249's authority for the retake is on 0249's record. The 0242 record's pointers do not lead to it.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0242's record that names `53cd0d86` / bug 0249 and the 17 retaken cells (N1–N5, O1–O3, O5–O7, S1/S2/S4/S5/S6/S8), states that Residuals 1 and 2 are closed by 0249, and states that (P), (M), S3/S7 and the subject groups are unmoved.

## False-positive check
- Pin existence: every cited row id is still present by `it(` title. This is a changed-assertion decay, not a missing cell.
- Representations covered:
  - (1) Bug-doc Witness/Fix lines: 0242 quoted; `grep -c -i "coordination note"` in the 0242 record → 1, the `:585` note about 0153, not about 0249.
  - (2) Test file names and it()/describe() titles: the witness file, read at the cited lines, plus blame.
  - (3) Coverage-matrix rows: `grep -c "0242\|misfire-faces" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0.
  - (4) AGENTS.md gate names: `grep -c "0242\|0249" AGENTS.md` → 0.
  - (5) CHANGELOG, corroboration only: `CHANGELOG.md:2818` says "Seventeen rows of 0242's misfire witness retaken under the recorded parent adjudication". It confirms the flip, and it is not in the record.
- Other filings: `grep -rl "53cd0d86\|206e0da9\|66892f19" quality/intake quality/issues`, run before filing → 0 files.
- (P) and (M), the other residual groups (Residuals 3 and 4), are not among the cells changed in `53cd0d86`'s diff, so they are not listed.
- I did not dispute whether 0249's retake was right. The authority for it is recorded on 0249's record.

## Triage
verdict: confirmed — reproduced: 0242:626-642 Residuals 1/2 say groups (N)/(O) pin the shapes "UNCHANGED … including the off-Trigger emission" and that O7 keeps "its HEAD list, misfire included". In tests/reserved-keyword-misfire-faces.test.ts the describe at :561 ("0242 (N) — … now draws the parser-leaf refusal (bug 0249)") and the 17 rows N1-N5 (:580-610), S1/S2/S4/S5/S6/S8 (:659-736) and O1/O2/O3/O5/O6/O7 (:800-870) are all blamed to 53cd0d861 (18/18), and they now assert the refusal, drop single-line-if, or (O7) a recovery-shape change. The 17-row grep → 17, grep 0249 in the 0242 record → 0, and the record has had no commits since 679870ca. 53cd0d86's --stat leaves the 0242 record untouched, and 0249:822 says "Discharge notes appended: none". Nothing was deleted, so this is a retake, not a deletion. The equivalent is unambiguous and verified: 0249's record, whose Origin (:543) cites 0242 Residuals 1 and 2 and whose :485-490 lists exactly these seventeen rows (CHANGELOG:2818 agrees). The fix is a mechanical dated coordination note in 0242 pointing to 53cd0d86/0249 (the house shape, 12 records carry one, e.g. 0248:572) with the Residuals wording left alone. There is no other filing on 53cd0d86 in intake/ or issues/ (triage: claude-opus-5-5)
