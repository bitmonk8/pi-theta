---
id: pending
title: Commit 401a425b flipped b0406 cells W5 and W7, yet bug 0406's fix record still cites them as pinning theta-side names and the literal `undefined`
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0406-object-typed-params-misclassified-string.md:201-202
  - tests/b0406-object-typed-params-misclassified-string.test.ts:178-195
  - tests/b0406-object-typed-params-misclassified-string.test.ts:265-274
  - tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts
  - tests/b0423-imported-schema-bare-render-wire-names.test.ts
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Commit 401a425b flipped b0406 cells W5 and W7, yet bug 0406's fix record still cites them as pinning theta-side names and the literal `undefined`

## Observation
Two Residuals in 0406's `## Fix (0.404.0)` name committed cells as pins for shipped behaviour:
- Residual 1: "renders the literal text `undefined` (pinned by `b0406` W7 as documented behaviour)".
- Residual 2: "renders theta-side names …; pinned by `b0406` W5".

Commit `401a425b` (fix bug-0422 / 0423 / 0427, v0.435.0–0.437.0) re-pointed both cells, and its message calls them "Enumerated flip: b0406 W7" and "Enumerated flip: b0406 W5". Today W5 asserts that wire names render through the LOAD-phase sidecar carry. W7 asserts a LOAD refusal (the theta does not register). The record has not been edited since its fix commit `8f29983e` and carries no note of the flip.

## Evidence
Claim side (docs/bugs/0406-object-typed-params-misclassified-string.md:201-202, re-read before filing):
```
  1. Imported-schema field invisibility (parent Rec A): at parse an imported `.thetalib` schema's fields are unknown (sync FS-free parser), so `opaque-object` admits any `.Ident` chain and refuses no imported-field typo; a walked-off imported field (`${p.typo}`) renders the literal text `undefined` (pinned by `b0406` W7 as documented behaviour). Filing candidate for the next hunt.
  2. Imported-schema bare `${author}` renders theta-side names (no outbound sidecars available at parse); pinned by `b0406` W5. Same class as (1).
```
The cells as they were at the fix commit: `git show 8f29983e:tests/b0406-object-typed-params-misclassified-string.test.ts | grep -n "W5:\|W7:"` gives
```
128:  it("W5: imported-schema bare `${author}` renders compact JSON with theta-side names", () => {
177:  it("W7: imported-schema walked-off `${author.typo}` renders the literal `undefined`", () => {
```
The cells at HEAD (tests/b0406-object-typed-params-misclassified-string.test.ts:178-179, :195):
```
  // W5 — bug 0423 flip (route (a) LOAD-phase sidecar carry). A bare `${author}`
  // off an imported schema with a wire rename (`name as "FullName"`) must render
  ...
  it("W5: imported-schema bare `${author}` renders wire names via the LOAD-phase sidecar carry", async () => {
```
tests/b0406-object-typed-params-misclassified-string.test.ts:265-274:
```
  // W7 — bug 0422 flip (route (a) LOAD refusal). Parse behaviour is DELIBERATELY
  // unchanged: at parse the imported-schema field step is still admitted
  // opaquely (the parse-only branch below stays true), so the old
  // `renders undefined` residual persists AT PARSE. The flip re-points W7 at the
  // LOAD outcome: after import resolution the now-known `.thetalib` field set
  // `{name, role}` is re-walked, and the walked-off `typo` draws the phase=load
  // sibling `theta/load/system-interp-bad-field` so the theta does NOT register.
  // RED at the fork: the load pass emits zero error diagnostics and the theta
  // registers clean (no load-phase revalidation exists yet).
  it("W7: imported-schema walked-off `${author.typo}` refuses at LOAD (theta does not register)", async () => {
```
The flipping commit (`git log -1 --format=%B 401a425b`): "0422 … Enumerated flip: b0406 W7." / "0423 … Enumerated flip: b0406 W5."

Searches run this session:
- Scan of every `it()`/`describe()` add/remove after each witness's creation commit, across the 28 in-shard witness files: `b0406` changed in `401a425b` (4 changed title lines: the W5 and W7 pairs above).
- `git log --format="%h %ad %s" -- docs/bugs/0406-object-typed-params-misclassified-string.md` → last touched `8f29983e` (2026-09-04, the fix commit). `401a425b` did not edit the record.
- `grep -c "0422\|0423\|401a425b" docs/bugs/0406-object-typed-params-misclassified-string.md` → 0. The record has no forward note of the flip.

## Why this is a problem
Each residual names a committed cell as the pin for a stated behaviour. Both cells now assert the opposite outcome. A reader who follows "pinned by `b0406` W7" finds a load-refusal cell, not a "renders `undefined`" cell. A reader who follows "pinned by `b0406` W5" finds a wire-name cell, not a theta-side-name cell. This is the same pin-flipped-without-a-note pattern already filed for other records in this wave.

## Suggested direction (non-binding, optional)
Add a dated forward note to residuals 1 and 2 recording that `401a425b` (bugs 0422/0423) flipped W7 and W5. The current witnesses for the resolved behaviour are `tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts` (load refusal) and `tests/b0423-imported-schema-bare-render-wire-names.test.ts` (wire-name render).

## False-positive check
- Both cells still exist under the labels W5/W7. What decayed is what they pin, not their presence. That is confirmed by the before/after titles and by the in-file comments "bug 0423 flip" / "bug 0422 flip".
- Sibling records in the shard: `grep -rn "b0406" docs/bugs/{038*,039*,040[3-9]*,0410*}.md` excluding 0406, filtered for W5/W7 → 0 hits. Only 0406 carries these pins.
- The designated follow-up records exist and describe the flip: docs/bugs/0422-…md:277 ("W7 flipped to the load refusal") and docs/bugs/0423-…md:216 ("`tests/b0406-*.test.ts` W5 flipped theta-side→wire bytes"). This corroborates that the flip was deliberate and happened after 0406 was written.
- None of the pending candidates cites 0406 or `401a425b`.
- This is not citation form: the cell labels resolve. What no longer holds is the claimed pinned behaviour.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. Every excerpt and search reproduces. 0406.md:201-202 cites `b0406` W7 as pinning "renders the literal text `undefined`" and W5 as pinning "theta-side names". At 8f29983e those were the W5/W7 titles (:128/:177). At HEAD, W5 (:195) asserts wire names via the LOAD-phase sidecar carry and W7 (:274) asserts a LOAD refusal (`theta/load/system-interp-bad-field`). The 401a425b message says "Enumerated flip: b0406 W7" and "…W5". 0406 was last touched by 8f29983e and has 0 hits for 0422/0423/401a425b. 0422.md:277 and 0423.md:216 record the flips. No cell pins the stated observables any more: the residual behaviours were fixed, and tests/b0422-*/b0423-* witness the opposite. So this is not a mechanical re-point; the repair (a dated forward note or reworded residuals) is wording for a human. This matches the sibling ruling on qw…-d10-01-76489c61. No other intake/issue carries 401a425b. The candidate had no `## Triage` heading, so triage added it (triage: claude-opus-5-5)
