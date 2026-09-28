---
id: pending
title: "Bug 0238's 0.218.0 fix record says witness cell W21 pins `let y: {a: integer, b > c, m: integer} = 1` at `[]` as a fence \"explicitly labelled unattributed\", but 65e119e4 (bug 0252) re-pinned W21 to `annotation-type-not-expression` under 0252's attribution and 0238 carries no note"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0238-stray-close-token-underflows-top-level-split.md:599-606
  - docs/bugs/0238-stray-close-token-underflows-top-level-split.md:675-683
  - docs/bugs/0238-stray-close-token-underflows-top-level-split.md:703-704
  - tests/inline-object-stray-close-token-split.test.ts:144-146
  - tests/inline-object-stray-close-token-split.test.ts:628-668
  - docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md:54-64
  - docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md:525-527
  - docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md:596
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0238's 0.218.0 fix record says witness cell W21 pins `let y: {a: integer, b > c, m: integer} = 1` at `[]` as a fence "explicitly labelled unattributed", but 65e119e4 (bug 0252) re-pinned W21 to `annotation-type-not-expression` under 0252's attribution and 0238 carries no note

## Observation
Bug 0238's `## Fix (0.218.0)` makes three statements about W21, the `let`-annotation row with a stray close token:
- it "stays `[]`" and is "pinned in the witness as a fence with that label";
- Residual 1 says "the witness pins it as a fence explicitly labelled unattributed" and attributes the silence to `type-layer-checks.ts`'s `splitTopLevelObjectFields` / `topLevelColonIndex`;
- the pinned-dispositions line ends "W21 unattributed".

At HEAD the W21 cell of `tests/inline-object-stray-close-token-split.test.ts` expects `[ANNOTATIONNOTEXPR("y")]`, is labelled "bug 0252's refusal", and says "BUG 0252 … OWNS THIS ROW". Commit 65e119e4 (fix(bug-0252), v0.225.0) made that change. Bug 0252's record states that 0238's Residual 1 attribution "is wrong, measured", and it records "Discharge notes appended: none". Bug 0238's record has 0 mentions of 0252, and its last commit is its own fix commit 98bddb7a. The pin that the record points readers to now asserts the opposite of what the record says it asserts.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0238-stray-close-token-underflows-top-level-split.md:599-606`:
```
- **Rows, after:** W2 `[]` with the fragment `{a, m}` — BYTE-IDENTICAL to W1's
  and sharing its slug; W3 `{a, m, n}`; W4 `{m}` rather than the permissive
  `p: {}`; W15 `{a, n → {m}}`, the nested object no longer cut in two and
  nothing promoted; W6/W8/W10/W12 each draw their control's single registered
  line; W22 draws `duplicate-inline-field-name`; W1, W13 (one line), W14, W16,
  W17, W18, W19, W20 byte-unmoved. W21 stays `[]` — the report's measured,
  explicitly UNATTRIBUTED non-goal, pinned in the witness as a fence with that
  label and claimed by nothing here.
```
`:675-683`:
```
  1. **The `let`-annotation structural type still declines behind a stray
     close token.** W21 (`let y: {a: integer, b > c, m: integer} = 1`) stays
     with an empty diagnostic list — no `let-rhs-type-mismatch`. The substrate
     is `type-layer-checks.ts`'s own `splitTopLevelObjectFields` /
     `topLevelColonIndex`, a SEPARATE untyped copy of this arithmetic that this
     fix does not touch. §Reproduction (D) measures the row and §Non-goals
     declines to attribute it; the witness pins it as a fence explicitly
     labelled unattributed. Not claimed, not repaired. A future report may
     claim that copy; it would be the same rule at a third site.
```
`:703-704`: `loads today newly refuses except through the four already-registered raw-key` / `rules; W21 unattributed.`

Evidence side, the witness at HEAD, `tests/inline-object-stray-close-token-split.test.ts`:
- `:144-146`: `//   - (P) W20/W21/W22, the \`let\`-annotation position. W20 GREEN, W21 now` / `//     ATTRIBUTED to bug 0252 and carrying that report's refusal (see the cell;` / `//     this report still attributes nothing there), W22 RED.`
- `:628`: `it("W20 FENCE and W21: the control refuses, and the subject's row is bug 0252's refusal ", …`
- `:640` and `:649-651`: `// W21 — THE FENCE IS NOW ATTRIBUTED, not deleted.` … `// BUG 0252` / `// (docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md)` / `// OWNS THIS ROW. Its cause is not the split at all: …`
- `:666-668`: `cell: "W21 let annotation, stray close token — bug 0252's refusal",` / `src: theta("let y: {a: integer, b > c, m: integer} = 1"),` / `expected: [ANNOTATIONNOTEXPR("y")],`

At 0238's fix commit the cell read differently: `git show 98bddb7a:tests/inline-object-stray-close-token-split.test.ts | grep -n "W21"` shows `:735` `it("W20 FENCE and W21 FENCE: … the subject's measured silence is pinned UNATTRIBUTED "` and `:757` `cell: "W21 let annotation, stray close token — UNATTRIBUTED non-goal"`. The flipping hunk is in `git show 65e119e4 -- tests/inline-object-stray-close-token-split.test.ts`: `-          expected: [],` → `+          expected: [ANNOTATIONNOTEXPR("y")],`, with the label changing from "UNATTRIBUTED non-goal" to "bug 0252's refusal".

The re-attributing record, `docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md`:
- `:59-62`: "**Its *Residuals* item 1 attributes its W21 row to `type-layer-checks.ts`'s `splitTopLevelObjectFields` / `topLevelColonIndex`; that attribution is wrong, measured**"
- `:525-526`: "bug 0238's W21 fence is re-attributed to this report's refusal rather than deleted."
- `:596`: `- Discharge notes appended: none.`

Searches (all run in this session):
- `grep -c "0252" docs/bugs/0238-stray-close-token-underflows-top-level-split.md` → **0**.
- `git log --format="%h %s" -- docs/bugs/0238-stray-close-token-underflows-top-level-split.md` → 98bddb7a (its own fix) and 5a663efd (filing). No later commit touched the record.
- `git log --format="%h %ad %s" --date=short -S "UNATTRIBUTED non-goal" -- tests/inline-object-stray-close-token-split.test.ts` → 65e119e4 (removal) and 98bddb7a (introduction).
- `grep -n "W21" docs/bugs/0238-*.md` → hits at :249, :259, :260, :403, :525, :604, :676 and :704. The three fix-section claims are quoted above. The others are §Reproduction/§Non-goals measurements at filing HEAD.
- Coverage matrix / AGENTS.md: `grep -c '0238' docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md AGENTS.md` → 0 / 0 / 0.

## Why this is a problem
A reader who follows bug 0238's record to its witness to confirm "W21 stays `[]` … claimed by nothing" finds a cell that asserts a refusal and is claimed by bug 0252. The record's Residual 1 still presents an attribution (the `type-layer-checks.ts` split copy) that the later record measured as wrong. The record also still presents as open ("A future report may claim that copy") a row that 65e119e4 closed. The re-pin was authorised and documented on 0252's side, but no discharge or correction note went back to 0238. As a result, 0238's pin no longer resolves to what it states. The same shape (a pin flipped by a later fix, with no note in the citing record) has been filed for other records under their flipping commits.

## Suggested direction (non-binding, optional)
Append a dated note to 0238 at its W21 statements (Rows-after, Residual 1, pinned dispositions). It should record that bug 0252 (0.225.0, 65e119e4) attributed and refused W21, so the witness now pins `theta/parse/annotation-type-not-expression`, and that 0252 measured the Residual-1 attribution as wrong.

## False-positive check
- Representations covered: bug-doc witness lines (0238's W21 mentions and 0252's cross-references), test titles and cell labels (the W21 `it`/`cell` strings at HEAD and at 98bddb7a), history (`git log -S` over the witness, and the record's own log), coverage-matrix rows, AGENTS.md gate names. CHANGELOG is not needed as corroboration here, since the flip is directly visible in the witness and its commit.
- The witness at HEAD was opened, as was the pre-flip version at 98bddb7a.
- This is not the honesty-marker case. 0238 does not mark W21 as pending; it asserts a specific pinned state (`[]`, labelled unattributed) that the pin no longer holds.
- Cluster key: flipping commit 65e119e4. No other record in this shard cites W21 or another cell that 65e119e4 changed. `git show --name-only --format= 65e119e4` also lists `tests/let-annotation-inline-object-compat.test.ts` (bug 0130 cells) and two files whose changes 0252's record calls comment-only (`generic-argument-shredded-group-refusal`, `query-annotation-nontype-text-refusal`). All are outside this shard's records.
- Not already filed: `grep -l '65e119e4' quality/intake/* quality/issues/*` → 0 files.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. 0238:599-606, :675-683 and :703-704 reproduce verbatim: W21 "stays `[]`", is pinned as an "explicitly labelled unattributed" fence, and is attributed to type-layer-checks' split copy. At HEAD the W21 cell (tests/inline-object-stray-close-token-split.test.ts:640-668, `it("W20 FENCE and W21: … bug 0252's refusal")`) expects `[ANNOTATIONNOTEXPR("y")]` and says "BUG 0252 … OWNS THIS ROW". `git show 65e119e4` flips `expected: []` → `[ANNOTATIONNOTEXPR("y")]` and the label from "UNATTRIBUTED non-goal" (98bddb7a:757). 0252:59-62 calls 0238's Residual 1 attribution "wrong, measured", and 0252:596 says "Discharge notes appended: none". Every stated search reproduces: 0 hits for 0252 in 0238; 0238's log is 98bddb7a and 5a663efd; -S finds 65e119e4 and 98bddb7a; W21 hits at :249/:259/:260/:403/:525/:604/:676/:704; 0238 has 0 hits in both coverage matrices and AGENTS.md; no other intake file or PTQ cites 65e119e4. However, the cell still resolves by id, and no pin exists anywhere for the stated observable (`[]`, unattributed). So the repair is a correction note that rewords or retracts the claim, not a mechanical re-point. This matches the sibling 'flipped-no-note' rulings in this wave (triage: claude-opus-5-5)
