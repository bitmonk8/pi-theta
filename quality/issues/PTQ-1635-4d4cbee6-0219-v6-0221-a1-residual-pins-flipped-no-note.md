---
id: PTQ-1635
title: "Bugs 0219 and 0221 cite witness cells v6 and a1 as pinning `schema R { b: integer }` / `R { a: 1 }` silent with \"r-arm\", but commit 4d4cbee6 (bug 0226) re-fixtured v6 and flipped a1 to a refusal, and neither record carries a note"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0219-reserved-keyword-object-pattern-head-parses-clean.md:611-618
  - docs/bugs/0219-reserved-keyword-object-pattern-head-parses-clean.md:666-669
  - docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md:603-611
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:625-652
  - tests/object-pattern-head-unresolved-refusal.test.ts:338-366
  - docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md:750-757
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bugs 0219 and 0221 cite witness cells v6 and a1 as pinning `schema R { b: integer }` / `R { a: 1 }` silent with "r-arm", but commit 4d4cbee6 (bug 0226) re-fixtured v6 and flipped a1 to a refusal, and neither record carries a note

## Observation
Bug 0219's `## Fix (0.156.0)` *Residuals* 1 and bug 0221's `## Fix (0.167.0)` *Residuals* 1 each cite a witness cell as pinning the same measured residual: `schema R { b: integer }` with the pattern `R { a: 1 }` over a `Q`-constructed value draws `[]` and answers `"r-arm"`. 0219 cites cell v6 and 0221 cites cell a1. Commit 4d4cbee6 ("fix(bug-0226): … — v0.176.0") changed both cells. It re-fixtured v6 in `tests/reserved-keyword-object-pattern-head-refusal.test.ts` to `schema R { a: integer }`, with the in-cell comment saying the original `R { b: integer }` "now draws `theta/parse/extra-object-field`". It flipped a1 in `tests/object-pattern-head-unresolved-refusal.test.ts` to "[DISCHARGED by bug 0226]", which now asserts that `extra-object-field` refusal. Bug 0226's own record says the discharge is noted but also that "No sibling bug document's prose was edited by this fix". Neither 0219 nor 0221 was in 4d4cbee6's diff, neither has been edited since, and neither mentions 0226.

## Evidence
Claim side, `docs/bugs/0219-reserved-keyword-object-pattern-head-parses-clean.md:611-618` (re-read before filing):
```
  1. **Element 2, narrowed.** `R { a: 1 }` selecting on a `Q`-constructed value
     survives: measured post-fix, `schema Q { a: integer }` /
     `schema R { b: integer }` / `let d = Q { a: 1 }` /
     `match d { R { a: 1 } => "r-arm", _ => "other" }` answers `"r-arm"` with
     `[]` diagnostics (witness cell v6). The reserved-head half of the class is
     closed, so what remains is a *declared-name* interchangeability, not a
     reserved-word silence. Unclaimed by any report; §Non-goals states why this
     run does not take it.
```
The same record's 0221 discharge note, `:666-669`, restates this residual as surviving:
```
- §Fix (0.156.0) *Residual* 1 (element 2, narrowed to declared-name
  interchangeability) — **survives**, as bug 0221's own record's residual 1: a
  DECLARED head whose declaration cannot carry the listed fields still selects
  its arm, because `parsePattern` holds no schema field bodies.
```
`docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md:603-611`:
```
  1. **§Expected behaviour 3 (row A1) is NOT closed.** A DECLARED head whose
     declaration cannot carry the listed fields — `schema R { b: integer }`
     with the pattern `R { a: 1 }` — stays silent and still answers `"r-arm"`
     over a `Q`-constructed value. Evidence: cell `a1`, which pins the `[]` and
     the `"r-arm"` value as a measured residual, and says so in terms. The
     field-set half needs the resolved declaration's field bodies, which
     `parsePattern` does not hold; carrying them would mean the
     `checkObjectExpr` descent §Fix (a) names, i.e. an edit at a site a
     concurrent lane owns. Unclaimed by any report.
```

Evidence side, current tree. `tests/reserved-keyword-object-pattern-head-refusal.test.ts:633-642` (inside v6, `:625`):
```
    // WHY `R` declares `a: integer` (bug 0226 and its §Fix (c)(5) boundary,
    // per bug 0221 §Fix (c)(5)): the original fixture (`schema R { b: integer
    // }`) is bug 0226's own class — `R`'s listed field `a` is undeclared —
    // and now draws `theta/parse/extra-object-field`, which would break this
    // cell's SUBJECT (nominal dispatch stays unfixed: a declared, non-reserved
    // head still selects its arm over an unrelated value). Making the sibling
    // FIELD-COMPATIBLE (`R` declares the same field `Q` does, with a
    // compatible type) keeps the field list carryable — the interchangeability
    // boundary bug 0221 §Fix (c)(5) draws and bug 0226 does not claim — so
    // element 2's residual is preserved at its own, disjoint boundary.
```
with the fixture line `:646` `"schema R { a: integer }",`.

`tests/object-pattern-head-unresolved-refusal.test.ts:338` and `:356-365`:
```
  it("a1 [DISCHARGED by bug 0226]: a DECLARED head whose field set cannot carry the listed fields is now refused", async () => {
  ...
    await expectRefusedWrongArm(
      [
        "schema Q { a: integer }",
        "schema R { b: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [extraField("a", "R", patternRange(7, HEAD_COLUMN, "R { a: 1 }"))],
      "bug 0226 §Fix discharges bug 0221's recorded residual: a resolved head's listed fields are now judged against its declaration, so the wrong arm never reaches a registered theta",
    );
```
The flipping record, `docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md:750-757`:
```
- **Discharge notes appended:** bug
  [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md)'s
  `## Fix (0.167.0)` *Residuals* item 1 (the field-set half of its §Expected
  behaviour 3) is DISCHARGED here; its witness cell `a1`
  (`tests/object-pattern-head-unresolved-refusal.test.ts`) is flipped to the
  refusal and re-cited to this report. Bug 0219's cell `v6` keeps its element-2
  subject at a field-COMPATIBLE spelling. No sibling bug document's prose was
  edited by this fix.
```

Searches (run this session):
- Flipping commit: `git log --oneline -S'DISCHARGED by bug 0226' -- tests/object-pattern-head-unresolved-refusal.test.ts` → 4d4cbee6. `git log --oneline -S'schema R { a: integer }' -- tests/reserved-keyword-object-pattern-head-refusal.test.ts` → 4d4cbee6.
- Records untouched by it: `git show 4d4cbee6 --name-only --format= | grep -c '^docs/bugs/02\(19\|21\)'` → 0. `git log --oneline 4d4cbee6..HEAD -- docs/bugs/0219-…md docs/bugs/0221-…md | wc -l` → 0.
- No note in either record: `grep -c '0226' docs/bugs/0219-…md` → 0. `grep -c '0226' docs/bugs/0221-…md` → 0.
- Coverage matrix / AGENTS.md: `grep -rn 'object-pattern-head-unresolved-refusal\|reserved-keyword-object-pattern-head-refusal' docs/reference/coverage-matrix.md AGENTS.md | wc -l` → 0.
- CHANGELOG (corroboration only): `grep -n '0226' CHANGELOG.md` → `:3636` "**Bug 0226 — a resolved object-pattern head's field list is now checked**".

## Why this is a problem
Both records point at a cell as the evidence for a specific measured residual: "`R { b: integer }` … answers `"r-arm"` with `[]`". The cells no longer pin that. a1 now asserts the opposite verdict for the same spelling. v6 now asserts silence for a different spelling (`R { a: integer }`), and its own comment says the record's spelling draws `extra-object-field`. 0219's discharge note additionally states the residual "survives", which 0226 has since closed. A reader following either pointer finds a cell that contradicts the sentence citing it, and nothing in either record says why. This is the same cross-record re-pin class as the pending 844d6533/0140 and af108d2f/0124 candidates.

## Suggested direction (non-binding, optional)
Append a dated coordination note to each of 0219 and 0221 recording that 4d4cbee6 / bug 0226 closed the field-incompatible half. The note would say that a1 now pins the refusal and that v6 carries element 2 at the field-compatible `schema R { a: integer }` spelling. The landed records would otherwise stay unedited.

## False-positive check
- Representations covered: bug-doc Residuals lines in both records plus 0219's discharge note (quoted); test file names (both witness files exist); test titles (`a1 [DISCHARGED by bug 0226]` at `:338` and `v6 [element-2 residual]` at `:625`, found by grep); coverage-matrix rows and AGENTS.md gate names (0 hits); CHANGELOG (corroboration, `:3636`).
- Not an honesty marker: neither record's residual is marked as superseded or pending. Both state the silence as a present-tense measured fact backed by the named cell.
- Not a re-worded claim: the record sentences are unchanged since authoring. Only the cells they cite moved.
- The pointers resolve as names (both cells exist). The decay is in what they assert, so this is filed as decayed-pointer and not unwitnessed-claim.
- No existing candidate cites 4d4cbee6 (`grep -rl 4d4cbee6 quality/` → only this file), and no D10 candidate lists 0219 or 0221 (`grep -rl "0219-reserved\|0221-object" quality/` → only resolved PTQ-0645, a test-harness duplication finding, and the shard list).

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. Every excerpt and search reproduces. 0219:611-618 cites v6 and 0221:603-611 cites a1 for "`schema R { b: integer }` / `R { a: 1 }` → `[]` + "r-arm"", and 0219:666-669 says that residual "survives". At 4d4cbee6^, a1 was "[RESIDUAL, measured] … stays silent" (:485) and v6 used `schema R { b: integer }`. 4d4cbee6 touches both test files and neither record. At HEAD, a1 (:338) is "[DISCHARGED by bug 0226]" and asserts extra-object-field, and v6 (:625-652) now pins silence only for `schema R { a: integer }`. Both records have 0 hits for 0226 and 0 commits since. 0226:750-757 says no sibling prose was edited. Nothing was deleted: 0221's claim is superseded (the pin asserts the opposite), and 0219's cited spelling no longer matches its cell. The repair is a dated discharge note, not a mechanical re-point, matching the sibling flipped-no-note rulings. Not a duplicate: the other 4d4cbee6 intake file (d10-01, 0226's CELL-B live path) has a different root cause, and no PTQ tracks this (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). Two appends, nothing else; every existing line stays byte-identical. (1) APPEND at the very end of docs/bugs/0219-reserved-keyword-object-pattern-head-parses-clean.md:

### Coordination note — 2026-09-28, bug 0226 (0.176.0)

Commit 4d4cbee6 (bug 0226 fix, v0.176.0) re-fixtured witness cell v6 in tests/reserved-keyword-object-pattern-head-refusal.test.ts: the mismatched-field spelling this record cites (schema R with field b, matched as R with field a) is refused since bug 0226, and v6 now pins silence only for a field-matching spelling. The residual-survives wording above stands as a dated record; current disposition: docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md.

(2) APPEND at the very end of docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md:

### Coordination note — 2026-09-28, bug 0226 (0.176.0)

Commit 4d4cbee6 (bug 0226 fix, v0.176.0) flipped witness cell a1 in tests/object-pattern-head-unresolved-refusal.test.ts: it is now titled DISCHARGED by bug 0226 and asserts the extra-object-field refusal, superseding the silent r-arm pin this record cites. The wording above stands as a dated record; current disposition: docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md.
