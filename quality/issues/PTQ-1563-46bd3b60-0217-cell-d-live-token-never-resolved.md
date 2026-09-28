---
id: PTQ-1563
title: "Bug 0217's 0.148.0 fix record cites its live witness only as H8a `CELL-D`, but 46bd3b60 landed the cell as \"bug 0217 cell 74\" and no test title contains `CELL-D`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md:671-674
  - docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md:693-695
  - tests/live/live-production-acceptance.test.ts:12369-12370
  - tests/live/live-production-acceptance.test.ts:12438-12439
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:168
  - tests/live/live-production-acceptance.test.ts:10385-10388
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0217's 0.148.0 fix record cites its live witness only as H8a `CELL-D`, but 46bd3b60 landed the cell as "bug 0217 cell 74" and no test title contains `CELL-D`

## Observation
The `## Fix (0.148.0)` section of bug 0217 names its live H8a leg in two places, the Gates list and Verification (iii), and both times uses only the lane token `CELL-D`. The record never names the live test file (`grep -c 'live-production-acceptance'` over the record → 0). No test title or comment under `tests/` contains `CELL-D`, and the token has never been in `tests/live/live-production-acceptance.test.ts`. The fix commit 46bd3b60 landed the cell as `describe("H8a-T — bug 0217 cell 74: …")`. Its own commit message says "H8a cell 74 (was CELL-D, red-proven)", but the record it rewrote in the same commit kept the token. A later chore commit, 03657762 ("four more stale lane-token references repaired"), rewrote the matching `CELL-D` comment in the offline witness `tests/nested-inline-enum-generic-argument-refusal.test.ts:168`. It changed the comment to "cell 60", which is bug 0164's cell (`tests/live/live-production-acceptance.test.ts:10385-10388`), not 0217's cell 74. It did not touch the record.

## Evidence
Claim side, `docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md:671-674` (Gates; re-read before filing):
```
  - Live H8a `CELL-D`, run for real, BOTH directions: green
    (`Tests 1 passed | 73 skipped (74)`), RED under neutralisation with the
    pre-fix signature (`Registered: ["d217livectl","d217livelegal","d217livenested"]`
    — the nested-`enum[…]` theta registers), green again after exact restoration.
```
`:693-695` (Verification (iii)):
```
  each lever. (ii) Default suite green, no stochastic-red class hit. (iii) Live
  `CELL-D` red-proven in both directions under the live lock, plus H9a 11/11 for
  real. (iv) `typecheck` and `lint` clean. The verifier's own finding was the
```

Equivalent witness, `tests/live/live-production-acceptance.test.ts:12369-12370`:
```
// cell 74 — bug 0217: a `params:` field whose right-hand side carries an inline
// `enum[…]` inside a generic argument does not register, live.
```
`:12438-12439`:
```
describe("H8a-T — bug 0217 cell 74: a params: field carrying an inline enum[…] inside a generic argument does not register, live (Convention: live-host acceptance)", () => {
  it('does not register a theta whose params: field declares array<enum["a", "b"]>, while its legal array<"a" | "b"> sibling still registers, through the real discovery\u2192registration path', async () => {
```
The cell plants the stems `d217livectl`, `d217livelegal` and `d217livenested` (`:12446`, `:12452`, `:12459`), which are the three names in the record's quoted RED signature.

Searches (run this session):
- Test titles / tokens: `grep -rnw 'CELL-D' tests/ | wc -l` → 0.
- Live file history: `git log --oneline -S'CELL-D' -- tests/live/live-production-acceptance.test.ts | wc -l` → 0. The token was never in the file.
- Same-commit origin: `git show 46bd3b60 -- docs/bugs/0217-nested-inline-enum-in-generic-argument-draws-nothing.md | grep -c '^+.*CELL-D'` → 2. The numbered title: `grep -n 'describe("H8a-T — bug 0217 cell 74' tests/live/live-production-acceptance.test.ts | wc -l` → 1.
- Record never repaired: `git log --oneline 46bd3b60..HEAD -- docs/bugs/0217-…md` → 1 commit (766e4c8d, bug 0282's appended coordination note). `grep -n 'CELL-D' docs/bugs/0217-…md` still returns `:671` and `:694`.
- Test file names: `grep -rn 'bug 0217\|0217' tests/live/*.ts | grep -c describe` → 1. The only live 0217 describe is cell 74 above.
- Coverage matrix / AGENTS.md gate names: `grep -nw 'CELL-D\|CELL-B2' docs/reference/coverage-matrix.md AGENTS.md | wc -l` → 0.
- CHANGELOG (corroboration only): `grep -nw 'CELL-D\|CELL-B2' CHANGELOG.md | wc -l` → 0. `grep -n 'cell 74' CHANGELOG.md` → `:4042` "H8a cell 74 (red-proven)".

## Why this is a problem
The record's two live-verification claims ("Live H8a `CELL-D`, run for real, BOTH directions" and "Live `CELL-D` red-proven in both directions") point at a name no test carries. The record also names no file, so a reader or a `-t` filter following the pointer finds nothing in a file that holds dozens of numbered H8a cells. An equivalent cell exists, so the claim→evidence chain breaks only at the pointer. That cell is under `tests/live/**`: it exists, but the preflight gate does not prove it.

## Suggested direction (non-binding, optional)
Point both `CELL-D` mentions at "cell 74 (bug 0217)" in `tests/live/live-production-acceptance.test.ts`.

## False-positive check
- Representations covered: bug-doc Gates/Verification lines (both sites quoted); test file names (the live file exists, and only one live describe mentions 0217); test titles and tokens (`CELL-D` → 0 in `tests/`, the numbered describe found at `:12438`); coverage-matrix rows and AGENTS.md gate names (0 hits); CHANGELOG (corroboration, `:4042`).
- Not a later rename: `-S'CELL-D'` over the live file's history returns nothing, and 46bd3b60's message records the renumbering ("was CELL-D"). 03657762 then rewrote the offline witness comment's copy of the token (`git show 03657762 -- tests/nested-inline-enum-generic-argument-refusal.test.ts` → one removed line carrying the `CELL-D` token and one added line reading "(cell 60, tests/live/live-production-acceptance.test.ts)"), which shows the house treats unresolved lane tokens as repairable pointers. That test comment now names cell 60 (bug 0164's), so it is a test-comment pointer and is left to routing. It is not part of this record's claim.
- The other pins in the record resolve: the offline witness `tests/nested-inline-enum-generic-argument-refusal.test.ts` exists, cells b17/b18/c9/c10/h1 are present in it, and `tests/generic-argument-shredded-group-refusal.test.ts` carries a24/g3/g4/l4. Only the live leg is affected.
- No existing candidate cites 46bd3b60 as its root sha. The 0113 filing mentions 46bd3b60 only as an unrelated `-S` hit.

## Triage
verdict: confirmed — CELL-D does not resolve: 0217 :671 and :694 are its only uses, grep -rnw CELL-D tests/ returns 0, -S CELL-D on the live file returns 0 commits, and the record never names the live file (0 hits). 46bd3b60 added both CELL-D lines (2) while its own message says "H8a cell 74 (was CELL-D, red-proven)", and the only later commit to touch the record is 766e4c8d. The single equivalent is unambiguous and verified: tests/live/live-production-acceptance.test.ts describe "H8a-T — bug 0217 cell 74: a params: field carrying an inline enum[…] inside a generic argument does not register, live (Convention: live-host acceptance)" at :12438. It is the only live describe that cites 0217, and it plants d217livectl/d217livelegal/d217livenested, the record's RED signature. The fix is a mechanical re-point of both mentions to that cell. Not a duplicate: no intake file or PTQ takes 46bd3b60 as its root sha, since the 0113 filing only lists it as a -S hit. Also noted but outside this filing: :495 cites CELL-B2, and the test comment at nested-inline-enum-generic-argument-refusal.test.ts:168 now says cell 60, which is bug 0164's cell (triage: claude-opus-5-5)
