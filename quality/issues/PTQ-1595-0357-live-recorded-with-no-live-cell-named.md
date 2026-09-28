---
id: PTQ-1595
title: Bug 0357's fix record says "live recorded" but names no live cell, log, or session anywhere in the record
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0357-doc-comment-field-variant-anchors-refused.md:314-316
  - docs/bugs/0357-doc-comment-field-variant-anchors-refused.md:303-310
  - tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts:1-11
  - tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts:125-126
  - docs/plan_topics/coverage-matrix.md:139
sites: 1
fix_scope: localized
d10_class: memory-evidence
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0357's fix record says "live recorded" but names no live cell, log, or session anywhere in the record

## Observation
Bug 0357 (Status: fixed 0.356.0) closes its Verification line with "live recorded". Nothing in the record says what was recorded. The Gates list names only the offline witness, the full default suite, typecheck and lint. No `tests/live/…` cell, log path, session path or dated live run appears anywhere in the 344-line record. The only `tests/live/` string in the record is a fixture-directory census entry at `:220`. A matching live cell exists in the tree and landed in the fix commit: `tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts` (added in `e0586b1c`). The record never cites it. The only place that names it is CHANGELOG.md, which is corroboration only. So the record's live claim has nothing citable behind it.

## Evidence
Claim side, `docs/bugs/0357-doc-comment-field-variant-anchors-refused.md:314-316` (verbatim):
```
- Verification: SOLID — witness reds when the body-interior pass is neutered and
  greens byte-exact on restore; full suite green; live recorded; lint+typecheck
  clean.
```
The Gates list the claim would draw on, `:303-310`, names no live run:
```
- Gates:
  - Witness: `npx vitest run tests/b0357-doc-comment-field-variant-anchors.test.ts`
    → 24/24 (RED 8/24 at the fork, incl. the four canonical-example misplaced
    verdicts + the 0-runnable registration flips; GREEN after).
  - Full default suite: `npx vitest run` → 531 files / 10044 tests passed.
  - Typecheck `npm run typecheck` and lint `npm run lint`: clean.
```
Uncited in-tree witness, `tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts:1-11` (opened):
```
// H9a live acceptance — bug 0357: a `///` doc comment above a schema FIELD, an
// enum VARIANT, or a `subagent fn` is one of the five eligible anchors
// (descriptions.md §Placement; grammar.md §`///` placement), yet the pre-fix
// `scanDocComments` classified the anchor by the next line's leading WORD
// against only `schema`/`enum`/`fn`, so a field/variant `///` drew
// `theta/parse/doc-comment-misplaced` (E) and the theta failed to register.
// (docs/bugs/0357-doc-comment-field-variant-anchors-refused.md)
//
// This file proves the registration OUTCOME flip END-TO-END through the real
// `pi -p` binary: a theta whose schema carries a field `///` and whose enum
// carries a variant `///` must REGISTER and drive a real turn.
```
and `:125-126`: `describe("H9a live — bug 0357 field/variant doc-comment registration through the real \`pi -p\`", …` / `it("registers the field+variant \`///\` theta and drives its turn end-to-end", …`.
`git log --diff-filter=A --format="%h %ad %s" -- tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts` → `e0586b1c … fix(bug-0357): … — v0.356.0`, the same commit that wrote the Fix record.

Searches run in this session, one per representation:
- Bug-doc Witness/live lines: `grep -c "tests/live/" docs/bugs/0357-doc-comment-field-variant-anchors-refused.md` → 1 hit, `:220` (`tests/live/acceptance/fixtures/` in the committed-corpus census, not a witness). `grep -ciE "\blive\b" docs/bugs/0357-…md` → 2 hits: `:220` (same) and `:315` (the claim). `rg -n "session|\.log|\.pi/tmp" docs/bugs/0357-…md | wc -l` → 0.
- Test filenames: `find tests/live -iname "*0357*"` → 1 file, `tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts`.
- Test titles/bodies: `rg -l "0357" tests/live` → 1 file, the same cell (its describe title at `:125` names bug 0357).
- Coverage matrix: `rg -n "0357" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → 1 hit, `docs/plan_topics/coverage-matrix.md:139` (`cka-9`). It names only the offline `tests/b0357-doc-comment-field-variant-anchors.test.ts` and `tests/b0358-…` files, not the live cell.
- AGENTS.md gate names: `rg -c "0357" AGENTS.md` → 0 hits.
- CHANGELOG (corroboration only): `rg -n "b0357-doc-comment-anchor-registration" CHANGELOG.md docs | wc -l` → 1 hit, CHANGELOG.md:1683. It names the cell as "the NEW bespoke H9a acceptance cell … red-proven at fork, green under the lock". No file under `docs/` names it.

## Why this is a problem
"live recorded" is a verified-live assertion with no citable evidence in the record that makes it. The house format in the neighbouring records names the live cell by path (0344 `:292`, 0345 `:325` and 0346 `:368` each name a `tests/live/acceptance/…` path in their Fix sections). No honesty marker ("pending live verification") qualifies this one. The evidence is real but reachable only through an out-of-surface CHANGELOG entry, so a reader of the bug record cannot follow the live claim to its witness. The uncited cell is also a `tests/live/**` witness, so it is not gate-proven, and the bare phrase hides that limit too.

## Suggested direction (non-binding, optional)
Name `tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts` at the "live recorded" claim, the way the sibling records cite their H9a cells. The in-tree witness makes this a mechanical re-point.

## False-positive check
- Read the whole Fix (0.356.0) section (`:285-332`), the header, and Provenance (`:334-344`). No live path, log or session is named anywhere.
- Covered each representation with the searches above: bug-doc lines, test filenames, test titles/bodies, coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration only). The only live evidence found is the uncited cell, and its only citation is CHANGELOG.
- Confirmed the cell exists, targets this bug's subject (field+variant `///` registration through real `pi -p`), and landed in the fix commit `e0586b1c`. The claim is therefore true-but-uncited, not fabricated, and this filing does not say otherwise.
- Not an honesty-marker filing: the record carries no "pending live" marker; "live recorded" is an unmarked positive claim.
- No gate enforces citation form here: no pointer exists to check.

## Triage
verdict: confirmed — every stated search reproduced: the bug 0357 record has 1 `tests/live/` hit (:220, a fixture census), 2 `live` hits (:220 and the :315 "live recorded" claim) and 0 session/log/.pi/tmp hits; its Gates (:303-310) list only the offline witness, the full suite, typecheck and lint; coverage-matrix cka-9 (:139) names only the offline b0357/b0358 files; AGENTS.md has 0 hits; the only citation of the cell is CHANGELOG.md:1683. Sibling records 0344:292, 0345:325 and 0346:368 each cite their H9a cell by path. My own searches (find/rg over tests/live, docs/reference/coverage-matrix.md, quality/intake and quality/issues) found no other witness and no duplicate. The verified witness exists in the tree and landed in fix commit e0586b1c: tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts, describe "H9a live — bug 0357 field/variant doc-comment registration through the real `pi -p`", it "registers the field+variant `///` theta and drives its turn end-to-end". The fix is to cite that cell at the :315 claim, a mechanical re-point with no rewording (triage: claude-opus-5-5)
