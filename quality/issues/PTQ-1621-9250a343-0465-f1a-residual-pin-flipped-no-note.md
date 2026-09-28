---
id: PTQ-1621
title: Bug 0465's residual 1 still says cell F1-a pins first-wins with "no diagnostic minted", but commit 9250a343 (bug 0466) rewrote F1-a to assert the opposite and left no note in 0465
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0465-imported-annotation-vacuous-typed-query-validation.md:359-366
  - tests/b0465-imported-annotation-vacuous-validation.test.ts:759-800
  - src/extension/import-specifier-facts.ts:150-161
  - docs/bugs/0466-imported-alias-shadows-sibling-defs-collision.md:357-359
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0465's residual 1 still says cell F1-a pins first-wins with "no diagnostic minted", but commit 9250a343 (bug 0466) rewrote F1-a to assert the opposite and left no note in 0465

## Observation
Bug 0465's `## Fix (0.462.0)` Residuals item 1 says the alias-shadows-sibling face is resolved by deterministic first-wins with "no diagnostic minted", that `collectImportedTypeDecls`'s doc-comment documents this, and that "Cell `F1-a` pins the deterministic behaviour." Commit 9250a343 (`fix(bug-0466)`, v0.486.0) rewrote cell F1-a. It now asserts that the load pass **refuses** that shape with exactly one `theta/load/imported-type-name-collision` error. The same commit rewrote the doc-comment to describe the refusal. Bug 0465 has no note pointing at 0466 or at the re-pin. The witness pointer still names a cell called F1-a, but that cell now pins the opposite of what the record says.

## Evidence
Claim side — `docs/bugs/0465-imported-annotation-vacuous-typed-query-validation.md:359-366` (re-read before filing):
```
- Residuals:
  1. Face (a) — aliasing an import to the EXACT source name of one of its own
     same-lib transitive dependencies (`import { ReviewSummary as Detail }` where
     ReviewSummary references a sibling `schema Detail`): a genuine flat-`$defs`
     namespace collision with no clean resolution. Deterministic first-wins (the
     aliased entry claims the name, the sibling is dropped); documented in
     `collectImportedTypeDecls`'s doc-comment. Rare pathological authoring; no
     diagnostic minted. Cell `F1-a` pins the deterministic behaviour.
```

Evidence side — the cell today, `tests/b0465-imported-annotation-vacuous-validation.test.ts:759-760, 786-795`:
```
describe("bug 0466 (F1-a re-pin) — aliasing an import to the source name of its own same-lib sibling MUST refuse loudly, not drop the sibling silently", () => {
  it("F1-a: `import { ReviewSummary as Detail }` where ReviewSummary references a sibling `Detail` — the load pass refuses with `theta/load/imported-type-name-collision`", async () => {
...
    // RED at HEAD: the collision is a silent first-wins drop, so no diagnostic
    // under this code exists. GREEN after the fix: exactly one load-time refusal.
    const collisions = result.diagnostics.filter(
      (d) => d.code === "theta/load/imported-type-name-collision",
    );
    expect(
      collisions,
```
The cell before the flip, `git show 9250a343^:tests/b0465-imported-annotation-vacuous-validation.test.ts` lines 762-763:
```
describe("bug 0465 (F1-a) — DOCUMENTED RESIDUAL: aliasing an import to the source name of its own same-lib dependency", () => {
  it("F1-a: `import { ReviewSummary as Detail }` where ReviewSummary references a sibling `Detail` — first-wins gives the ALIAS the `Detail` name, deterministically", async () => {
```
The flipping commit: `git log --format='%h %ad %s' --date=short -S"F1-a re-pin" -- tests/b0465-imported-annotation-vacuous-validation.test.ts` → 1 hit: `9250a343 2026-09-20 fix(bug-0466): refuse imported alias/sibling $defs collision at load — v0.486.0`. Its commit message says: "re-pinned cell F1-a in tests/b0465-imported-annotation-vacuous-validation.test.ts".

The doc-comment the residual cites, now at `src/extension/import-specifier-facts.ts:150-160`, describes the refusal rather than first-wins:
```
 * Storage is first-wins PER NAME only among visits of the SAME declaration
 ...
 * revisit, so it is recorded in `collidedNames` for the caller to refuse with
 * `theta/load/imported-type-name-collision` (§Fix Option 2, SETTLED) rather
 * than silently letting the entry win the name and drop the sibling.
```

The in-scope record for the flipping fix explicitly left 0465 untouched — `docs/bugs/0466-imported-alias-shadows-sibling-defs-collision.md:357-359`:
```
- **Discharge notes appended:** none (0465 §Residuals item 1 designated this
  parent filing; the linkage is recorded in §Related / §Provenance above and
  0465 is already fixed — no edit to its closed record).
```
Searches:
- `grep -n "0466\|superseded\|re-pin" docs/bugs/0465-imported-annotation-vacuous-typed-query-validation.md` → 1 hit (:334, an unrelated "re-pinned to the merged-inputs reality" about a comment). No forward pointer to 0466.
- `grep -rn "F1-a" docs/bugs --include=*.md -l` → 2 files (0465, 0466). No other record says the F1-a pin changed meaning.

## Why this is a problem
The residual cites a witness pin that no longer resolves as stated. A reader following 0465 to cell F1-a to confirm "no diagnostic minted" finds a cell asserting that exactly one error diagnostic is minted. The 0465 record therefore states current behaviour that the tree contradicts, and nothing in 0465 hands off to the record that changed it. The only link runs the other way (0466 → 0465), and it only helps someone who already started at 0466.

## Suggested direction (non-binding, optional)
Add a forward pointer at 0465 residual 1 saying it was discharged by bug 0466 (v0.486.0, commit 9250a343) and that cell F1-a now pins the `theta/load/imported-type-name-collision` refusal. The equivalent current witnesses are F1-a at `tests/b0465-imported-annotation-vacuous-validation.test.ts:759-800` and `tests/b0466-imported-alias-shadows-sibling.test.ts` cells (a)/(b)/(c). This re-points the pin; the historical 0.462.0 claim stays as written.

## False-positive check
- Pin resolution: opened the current F1-a cell (:759-800) and the pre-flip version (`git show 9250a343^:…` :762-763). The meaning flipped from first-wins/no diagnostic to refusal/one error.
- Flipping commit: identified with `git log -S"F1-a re-pin"` (1 hit, 9250a343); its `--stat` lists `tests/b0465-imported-annotation-vacuous-validation.test.ts | 81` and `docs/bugs/…0466…md | 74`, and does not touch 0465.
- Existing filings: `grep -rln "0465\|9250a343" quality/intake quality/issues` → 2 files (a D9 phases filing and PTQ-1551), and neither concerns this pin. None of the listed pending D10 candidates cites 0465.
- 0466's "no edit to its closed record" (:357-359) is a choice not to rewrite 0465's claims. A forward pointer re-points the citation and leaves the 0.462.0 wording intact.
- Not gate-enforced: this is a behaviour pin inside prose, not a citation-symbol form, so the citation-symbol-form / grammar-cite / b0456 gates do not see it.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. Every excerpt and search reproduces. 0465:359-366 (residual 1) says the alias/sibling collision is first-wins with "no diagnostic minted" and that "Cell `F1-a` pins the deterministic behaviour". At HEAD, F1-a (b0465-imported-annotation-vacuous-validation.test.ts:759-800, describe "bug 0466 (F1-a re-pin) …") asserts exactly one `theta/load/imported-type-name-collision` error. 9250a343^ shows the old "DOCUMENTED RESIDUAL … first-wins" titles. `git log -S"F1-a re-pin"` gives 1 hit (9250a343, v0.486.0). The collectImportedTypeDecls doc-comment (now import-specifier-facts.ts:150-161) describes the refusal. 0466:357-359 says "Discharge notes appended: none". 0465 has 0 "0466" hits and no commit after d03f7398 touches it. There is no same-sha filing in quality/intake/ or quality/issues/. The replacement witnesses do exist: F1-a, plus b0466-imported-alias-shadows-sibling.test.ts describes "bug 0466 (a)/(b)/(c)". But this is not a mechanical re-point. The pointer still resolves to the same cell, and it is the claim itself ("no diagnostic minted", first-wins) that has been superseded, so it needs a dated discharge note. That matches the sibling flipped-pin rulings. The candidate had no ## Triage heading, so triage added one (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0465-imported-annotation-vacuous-typed-query-validation.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0466 (0.486.0)

Commit 9250a343 (bug 0466 fix, v0.486.0) rewrote witness cell F1-a in tests/b0465-imported-annotation-vacuous-validation.test.ts: the alias/sibling collision residual 1 above records as deterministic first-wins with no diagnostic minted now refuses loudly with exactly one theta/load/imported-type-name-collision error (see also the bug 0466 (a)/(b)/(c) describes in tests/b0466-imported-alias-shadows-sibling.test.ts). The wording above stands as a dated record; current disposition: docs/bugs/0466-imported-alias-shadows-sibling-defs-collision.md.
