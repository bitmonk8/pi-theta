---
id: PTQ-1567
title: "Bug 0107's Status line and §Fix Residual 1 rest the hyphenated `.theta` default-name divergence on cell (D4) of tests/tools-entry-closed-grammar-lockstep.test.ts, \"now PINNED by a cell that reds when it closes\", but 87bad4f9 (bug 0253) deleted the (D4) describe and 0107 carries no note of it"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0107-tools-lockstep-witness-is-source-shape-gate.md:3-10
  - docs/bugs/0107-tools-lockstep-witness-is-source-shape-gate.md:748-754
  - docs/bugs/0107-tools-lockstep-witness-is-source-shape-gate.md:817-830
  - tests/tools-entry-closed-grammar-lockstep.test.ts:77-94
  - tests/tools-entry-closed-grammar-lockstep.test.ts:515-533
  - docs/bugs/0253-fallback-hyphenated-theta-default-name-diverges.md:347-353
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0107's Status line and §Fix Residual 1 rest the hyphenated `.theta` default-name divergence on cell (D4) of tests/tools-entry-closed-grammar-lockstep.test.ts, "now PINNED by a cell that reds when it closes", but 87bad4f9 (bug 0253) deleted the (D4) describe and 0107 carries no note of it

## Observation
Bug 0107 is `fixed (0.219.0)`. Its Status line says, in the present tense, that the hyphenated `.theta` default-name divergence "is now PINNED by a cell that reds when it closes". Its §Fix (0.219.0) Residual 1 names that cell as the evidence: "Evidence: the (D4) cell". Commit 87bad4f9 (`fix(bug-0253): … v0.222.0`) closed the divergence and deleted the `describe("Bug 0107 (D4) — the ONE pinned divergence …")` block from the witness file. It moved the cell into (D3), flipped to `belt-fired`, and rewrote the header's PINNED DIVERGENCE paragraph as "HYPHENATED STEMS AGREE TOO". The 0107 record got no discharge note (0253's §Fix: "Discharge notes appended: none"). So all three (D4) pins in 0107 point at a cell that no longer exists, and they describe as pinned a divergence the tree now asserts is closed.

## Evidence
Claim side, `docs/bugs/0107-tools-lockstep-witness-is-source-shape-gate.md:3-10` (Status):
```
- **Status:** fixed (0.219.0). §Fix was constraint-pinned with a recommendation:
  four dispositions were stated and (c) — replacing the two-regex blacklist with
  a whitelist requiring the scanned body to call `parseToolsEntry` — was
  recommended. The run settled (c) **composed with** (b) (the behavioural
  agreement cells over the producer drive, measured feasible in §Reproduction),
  additively: no existing cell was weakened. The name divergence measured here
  took §Fix constraint 4's second route — recorded rather than closed — and is
  now PINNED by a cell that reds when it closes. See §Fix (0.219.0).
```
`docs/bugs/0107-…md:748-754` (§Fix (0.219.0), What shipped):
```
    - **(D4) pinned divergence** (§Fix constraint 4, second route — recorded,
      not closed): for a hyphenated `.theta` entry the fallback's
      `thetaCallableName` keeps the hyphens while the resolver's
      `thetaDefaultName`, the parse gate's `toolCallableName` and
      `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §default name all
      map them to underscores. The cell pins the CURRENT state and reds when the
      divergence closes, forcing this record to be corrected in the same change.
```
`docs/bugs/0107-…md:817-830` (Residual 1):
```
  1. **The hyphenated `.theta` default-name divergence is recorded, not closed**
     ...
     this run's scope, which is tests-only. Evidence: the (D4) cell, and the
     verification probe showing that closing the divergence reds (D4) alone.
     Whoever closes it flips (D4) to `belt-fired`, moves it into (D3), and
     updates the file header's PINNED DIVERGENCE paragraph — the cell's own
     failure message says so.
```

Evidence side, current tree:
- `grep -c "(D4)" tests/tools-entry-closed-grammar-lockstep.test.ts` → 0.
- `grep -c "PINNED DIVERGENCE" tests/tools-entry-closed-grammar-lockstep.test.ts` → 0.
- `rg -l "Bug 0107 \(D4\)" tests` → 0 files.
- `git log --oneline -S "Bug 0107 (D4)" -- tests/tools-entry-closed-grammar-lockstep.test.ts` → `87bad4f9 fix(bug-0253): …` and `b9cf2f26 fix(bug-0107): …` (added by b9cf2f26, removed by 87bad4f9). `git show 87bad4f9 -- tests/tools-entry-closed-grammar-lockstep.test.ts` contains the line `-describe("Bug 0107 (D4) — the ONE pinned divergence: a hyphenated \`.theta\` default name", () => {`.
- `tests/tools-entry-closed-grammar-lockstep.test.ts:83-94` (the header that replaced PINNED DIVERGENCE):
```
// HYPHENATED STEMS AGREE TOO (bug 0253): a HYPHENATED `.theta` entry has ONE
// default name on both readers, because the fallback's default-name derivation
// calls the resolver's `thetaDefaultName` (`src/parser/callable-set.ts`) instead
// of holding a second implementation of the rule.
...
// (D3) cells over `- ./b0107-code-review.theta` and `- ./b0253-code-review.theta`
// hold that agreement: a second derivation reintroduced in the producer reds them
// while leaving every hyphen-free cell green.
```
- `tests/tools-entry-closed-grammar-lockstep.test.ts:515-533`: the equivalent cell now in (D3), `it("hyphenated \`.theta\`: \`- ./b0107-code-review.theta\` presents \`b0107_code_review\` on both readers — ", …)`, which asserts `.toBe("belt-fired")`. It pins agreement, the opposite of what 0107 says (D4) pins.
- `docs/bugs/0253-fallback-hyphenated-theta-default-name-diverges.md:347-353` (corroboration): "cell (D4) flipped to `belt-fired` and moved into (D3) … the (D4) describe gone, the file header's PINNED DIVERGENCE paragraph rewritten".
- `rg -n "0253" docs/bugs/0107-tools-lockstep-witness-is-source-shape-gate.md | wc -l` → 0. `grep -n "Discharged" docs/bugs/0107-…md` → 0 hits.

## Why this is a problem
0107's Status line is the record's current-tense claim, and its Residual 1 names the (D4) cell as the evidence for the residual's standing state. That pointer no longer resolves. Anyone following it finds no (D4) cell. The cell that took its place asserts the divergence is closed, so the residual stays "recorded, not closed" with nothing in the record saying it was discharged. The house form shows this can be done: 0109's Residual 1 has an appended "**Discharged (0.254.0) by [0260]…**" note. 0107's own (D4) text says the cell was built to force "this record to be corrected in the same change". The cell was deleted, and the record was not corrected.

## Suggested direction (non-binding, optional)
Append a discharge note under 0107's Residual 1, and retense the Status sentence, so both name bug 0253 / 87bad4f9. Re-point the witness at the (D3) cell `hyphenated \`.theta\`: \`- ./b0107-code-review.theta\` presents \`b0107_code_review\` on both readers` (tests/tools-entry-closed-grammar-lockstep.test.ts), which is the flipped (D4).

## False-positive check
- Test-title representation: `rg -l "Bug 0107 \(D4\)" tests` → 0; `grep -c "(D4)" tests/tools-entry-closed-grammar-lockstep.test.ts` → 0.
- Test-filename representation: the witness file exists (`ls tests/tools-entry-closed-grammar-lockstep.test.ts` → present), so the decay is the cell, not the file.
- Header-anchor representation: `grep -c "PINNED DIVERGENCE"` over the file → 0.
- Git history: `git log -S "Bug 0107 (D4)"` names 87bad4f9 as the removing commit, and its diff shows the describe deleted.
- Bug-doc representation: 0253's §Fix records the move. 0107 has 0 mentions of 0253 and no Discharged note.
- Coverage-matrix and AGENTS.md gate names: not applicable. The claim is a record-internal cell pin, not a matrix row or a gate. No gate checks bug-doc cell-name references (citation form is not at issue; this is pointer decay).
- CHANGELOG: not consulted as proof (corroboration only).
- Pending candidates: no existing filing cites 0107 or sha 87bad4f9.

## Triage
verdict: confirmed — decayed pointer verified: 0107 Status (:3-10), §Fix (D4) bullet (:748-754) and Residual 1 (:817-830) all pin the (D4) cell; tests/tools-entry-closed-grammar-lockstep.test.ts has 0 `(D4)` / 0 `PINNED DIVERGENCE` hits; `git log -S "Bug 0107 (D4)"` → added b9cf2f26, removed 87bad4f9, whose diff shows `-describe("Bug 0107 (D4) — the ONE pinned divergence…")`; 0107 has 0 `0253` / 0 `Discharged` hits. The equivalent exists and is unambiguous: in the same file, the (D3) cell it("hyphenated `.theta`: `- ./b0107-code-review.theta` presents `b0107_code_review` on both readers — ") at :515, asserting `belt-fired`. Its comment calls it "the cell 0107 pinned, flipped by bug 0253 §Fix step 3", and 0253 §Fix :347-353 says the same. Fix: append a Discharged (0.222.0) by 0253 / 87bad4f9 note re-pointing to that cell, 0107 house discharge-note shape. No same-sha duplicate in quality/intake or quality/issues (triage: claude-opus-5-5)
