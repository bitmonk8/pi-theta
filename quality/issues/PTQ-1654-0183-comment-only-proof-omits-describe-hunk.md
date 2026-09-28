---
id: PTQ-1654
title: Fix record 0183 says its production-conformance.test.ts diff is "one hunk, 8 insertions / 2 deletions … Zero executable bytes change", but the shipped diff has four hunks (11/5), one of which renames a describe title
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0183-production-conformance-comment-misnames-composition-root.md:181-185
  - docs/bugs/0183-production-conformance-comment-misnames-composition-root.md:213-216
  - docs/bugs/0183-production-conformance-comment-misnames-composition-root.md:162-167
  - docs/bugs/0183-production-conformance-comment-misnames-composition-root.md:219-224
  - tests/conformance/production-conformance.test.ts:205
sites: 2
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0183 says its production-conformance.test.ts diff is "one hunk, 8 insertions / 2 deletions … Zero executable bytes change", but the shipped diff has four hunks (11/5), one of which renames a describe title

## Observation
Bug 0183 has Status fixed (0.129.0). Its `## Fix (0.129.0)` section gives a "Comment-only" proof for `tests/conformance/production-conformance.test.ts`: a per-line `//` grep over `git diff` that "returns nothing", plus a comment-stripped byte-identity check, ending in "Zero executable bytes change". The Verification bullet repeats "the diff comment-only by two methods". The shipped fix commit `5a92a36c` changes that file in four hunks with 11 insertions and 5 deletions. One of those hunks renames the `describe` title at :205, which is an executable line. The same record says so elsewhere: "What shipped" (:165-167) and Residual 1 (:223) both call the `describe` title "the one executable-line hunk". The proof's "one hunk, 8 insertions / 2 deletions" matches only the header-comment hunk. So the evidence covers one hunk of the draft, and the wording presents it as the whole shipped file.

## Evidence
**Site 1 (claim side):** docs/bugs/0183-production-conformance-comment-misnames-composition-root.md:181-185
```
- **Comment-only:** one hunk, 8 insertions / 2 deletions, every `+`/`-` line a
  `//` line — `git diff -- <file> | grep -E '^[+-]' | grep -vE '^[+-]{3}' |
  grep -vE '^[+-]\s*//'` returns nothing (exit 1), and the file's
  comment-stripped form is byte-identical to `git show HEAD:<file>`'s. Zero
  executable bytes change.
```

**Site 2 (claim side):** docs/bugs/0183-production-conformance-comment-misnames-composition-root.md:213-216
```
- **Verification:** PASS — suite green; typecheck and lint green; the claim
  true by independent re-derivation; the diff comment-only by two methods
  (per-line `//` check and comment-stripped byte-identity). Red/green flip
  declared inapplicable on the record. No scratch file exists
```

**The same record acknowledging the executable hunk:** :162-167
```
  same file's four downstream repetitions (`:195–196`, the `describe` title,
  `:311` at HEAD; drifted from the doc's `:67`, `:189–190`, `:276`, `:305`
  citations) take the same substitution, naming the helper the production
  compose helper instead of the shipped composition root; the `describe` title
  is the one executable-line hunk §Fix item 1 authorizes ("moves reporter
  output and nothing else"). §Fix item 2's eight further files
```
and :223, "The `describe` title is the one authorized executable-line hunk."

**The shipped diff, checked in this session:**
- `git log --oneline -- docs/bugs/0183-…md`: 3 commits. `5a92a36c fix(bugs-0183,0186,0189): spec-prose corrections — v0.129.0` is the fix commit.
- `git show 5a92a36c --stat -- tests/conformance/production-conformance.test.ts`: `1 file changed, 11 insertions(+), 5 deletions(-)`. That is not "8 insertions / 2 deletions".
- `git show 5a92a36c -- tests/conformance/production-conformance.test.ts | grep -c "^@@"`: 4. That is not "one hunk".
- The record's own proof command, applied to the shipped commit: `git show 5a92a36c -- tests/conformance/production-conformance.test.ts | grep -E '^[+-]' | grep -vE '^[+-]{3}' | grep -vE '^[+-]\s*//'` returns 2 lines, not nothing:
```
-describe("V20g-T conformance — load-time surface through the shipped composition root", () => {
+describe("V20g-T conformance — load-time surface through the production compose helper", () => {
```
- tests/conformance/production-conformance.test.ts:205 at HEAD: `describe("V20g-T conformance — load-time surface through the production compose helper", () => {`
- The same non-comment filter over the other nine files the record says changed (division-result-type-number-invoke, e2e-s5-package-discovery-composition-root, prompt-mode-extension-tool-reach-e2e, subagent-fn-extension-tool-dispatch-e2e, theta-callable-call-arity, tools-derived-name-shape, tools-entry-closed-grammar, tools-entry-containment, live/live-production-acceptance), each checked separately: 0 non-comment lines in each. Those claims hold. Only this file's proof is overstated.

## Why this is a problem
The "Comment-only" bullet and the Verification bullet are the record's only evidence that the fix left the suite's executable surface alone. Rerun against the shipped commit, the evidence they cite (a per-line grep that "returns nothing" and a whole-file comment-stripped byte-identity) fails. Its hunk count and insertion/deletion count describe only the single header-comment hunk. The downstream-repetition edits that Residual 1 marks "Shipped", including the describe rename, are not in them. The record's Status line (:8-9, "No executable line moves except the one `describe` title") and "What shipped" already state the truth. So the discharge wording is contradicted by a weaker but correct statement in the same record. A reader who takes the proof at face value concludes that no reporter-visible title moved. The existing Correction note (:645, added at 0207's filing) fixes the count of downstream repetitions but not this proof.

## Suggested direction (non-binding, optional)
Scope the Comment-only bullet and the Verification bullet to the header hunk they measured, or restate them over the shipped diff: four hunks, 11/5, with every non-comment line being the authorized `describe` rename.

## False-positive check
- **Commit identity:** `git show 5a92a36c --stat` lists `tests/conformance/production-conformance.test.ts | 16 +++++++++++-----`, and the commit message names 0183 with "one doc-authorized describe-title rename". So this commit is the one the record describes.
- **Could "one hunk" be scoped to the header only?** The bullet opens "one hunk", but it then states file-level conclusions: "the file's comment-stripped form is byte-identical to `git show HEAD:<file>`'s" and "Zero executable bytes change". Verification restates them as "the diff comment-only". The describe rename falsifies both the whole-file byte-identity and "zero executable bytes".
- **Existing marker:** the Correction note at :645 was read in full. It addresses "four downstream repetitions" → three and does not touch the Comment-only proof.
- **Not a gate matter:** no citation-form gate reads fix-record proof wording. This is not 0134 positional drift, since no line number is at issue.
- **Existing filings:** `grep -l "0183" quality/intake/*.md quality/issues/*.md | wc -l` → 1, and that one file is this filing. No PTQ or pending candidate cites record 0183.
- **Truth not adjudicated:** whether a describe-title rename matters is not asserted here. Only the mismatch between the cited evidence and the wording is.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. 0183:181-185 claims "one hunk, 8 insertions / 2 deletions", a grep that "returns nothing" and "Zero executable bytes change", and :213-216 claims "the diff comment-only by two methods". But `git show 5a92a36c --stat` on production-conformance.test.ts gives 11(+)/5(-), the diff has 4 `@@` hunks, and the record's own non-`//` filter run on the shipped diff returns the describe-title rename pair (HEAD :205). The same record's :162-167 and :223 call that title the one executable-line hunk. No other intake or PTQ cites 0183 or 5a92a36c, and the :645 Correction covers only the repetition count (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0183-production-conformance-comment-misnames-composition-root.md (after the existing Correction), nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The diff-accounting sentences above (one hunk, 8 insertions / 2 deletions; a filter grep returning nothing; zero executable bytes change; comment-only by two methods) do not match the shipped commit: git show --stat gives 11 insertions / 5 deletions across 4 hunks in tests/conformance/production-conformance.test.ts, and the non-comment filter returns the describe-title rename pair — the same executable-line hunk this record itself names elsewhere. The fix remains comment-plus-title-only; the arithmetic and the returns-nothing claim are corrected as above.
