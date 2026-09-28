---
id: PTQ-1597
title: "Bug 0158's 0.181.0 fix record names its live H8a witness \"CELL-E2\" four times, including the gate filter `-t \"CELL-E2\"`, but 515b3a3f landed the cell as \"bug 0158 … (cell 86)\" and no test in the tree carries CELL-E2"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md:1010-1015
  - docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md:1022-1026
  - docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md:1046-1048
  - docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md:1080-1085
  - tests/live/live-production-acceptance.test.ts:13972-13978
  - tests/live/live-production-acceptance.test.ts:14060-14061
  - CHANGELOG.md:3563-3569
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0158's 0.181.0 fix record names its live H8a witness "CELL-E2" four times, including the gate filter `-t "CELL-E2"`, but 515b3a3f landed the cell as "bug 0158 … (cell 86)" and no test in the tree carries CELL-E2

## Observation
The `## Fix (0.181.0)` section of bug 0158 names its live H8a leg by the token `CELL-E2` in four places:
- the "What shipped" entry;
- the live gate command, `-t "CELL-E2"` → "1 passed / 85 skipped";
- Verification item (3);
- Residual 3, which says "every `CELL-E2` occurrence in the file sits in a parenthesised form".

`tests/live/live-production-acceptance.test.ts` contains no `CELL-E2`, and the token has never appeared in the history of any file under `tests/`. The fix commit 515b3a3f added the cell as `describe("H8a-T -- bug 0158: … (cell 86) …")`. Its message says "H8a cell 86 (was CELL-E2, 4 parenthesized tokens renamed …)", so the four tokens were renamed at merge while the record kept them. As written, the gate filter selects no test in the named file. The witness exists as "cell 86".

## Evidence
Claim side (re-read just before filing), `docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md:1010-1015`:
```
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a live
    cell (CELL-E2): through the real production composition root, the
    heterogeneous `match` still refuses registration under its registered
    *Trigger* while the dominating-arm twin registers and drives to normal
    completion (empty `systemNotes` plus a sentinel built from the match
    result). No existing cell touched.
```
`:1022-1026`:
```
  `npm run lint` clean. Live: `npx vitest run --config
  config/vitest/vitest.live.config.ts
  tests/live/live-production-acceptance.test.ts -t "CELL-E2"` → 1 passed / 85
  skipped, run twice under the live lock (the second after a sentinel rename,
  see residual 3).
```
`:1046-1048`:
```
  the verifier's and the orchestrator's runs). (3) Live: no pre-existing cell
  drove a heterogeneous `match`; the new CELL-E2 cell was run for real under
  the live lock. (4) typecheck and lint clean. (5) §Common obligations
```
`:1080-1085`:
```
  3. **The live cell's sentinel was renamed after its first green run.** The
     original sentinel embedded the cell token in a longer string
     (`CELL-E2-DOM-1`), which is not a strip-safe placement; it is now
     `THETA-MATCH-DOM-1` and every `CELL-E2` occurrence in the file sits in a
     parenthesised form. The cell was re-run for real under the live lock
     after the rename and passed.
```

Evidence side (the equivalent witness, opened), `tests/live/live-production-acceptance.test.ts:13972-13978`:
```
// Bug 0158 (cell 86) -- `#typeExpr`'s `case "match"` (static-type-inference.ts)
// routed a heterogeneous `match`'s arm-body types through the array/ternary
// union LUB `#commonType`, while the checker's own `checkMatchArmTypes` (via
// `leastUpperBound`, match-result.ts) stayed dominating-member-only and
// refuses the identical arm-type set with the registered `E`-severity
// `theta/parse/match-arm-type-mismatch`
// (docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md).
```
`tests/live/live-production-acceptance.test.ts:14060-14061`:
```
describe("H8a-T -- bug 0158: a heterogeneous `match` still refuses registration under its registered *Trigger*, while its dominating-arm twin registers and runs, live (cell 86) (Convention: live-host acceptance)", () => {
  it("refuses the heterogeneous `match` at registration and drives the dominating-arm twin to normal completion through the real discovery->registration->checkTypeLayer path (cell 86)", async () => {
```
`CHANGELOG.md:3563-3569` (corroboration only) ends the 0158 entry with "Witness `tests/match-fn-return-lub-dominating-discipline.test.ts` (26 cells, 8 red before) + H8a cell 86."

Searches (all run in this session):
- Test titles and bodies: `grep -rn "CELL-E2" tests | wc -l` → **0**. Case-insensitive, in the named file: `grep -ni "cell-e" tests/live/live-production-acceptance.test.ts | wc -l` → **0**.
- Underscore/camel spellings: `grep -rn "CELL_E2\|cellE2\|CELL_E\b\|cellE\b" tests | wc -l` → **0**.
- Test filenames: `find tests -iname "*cell-e*"` → 1 hit, `tests/invoke-prompt-cell-enum-return.test.ts`, which is unrelated.
- History: `git log --oneline -S"CELL-E2" -- tests` → **0 commits**. `git show 515b3a3f:tests/live/live-production-acceptance.test.ts | grep -c "CELL-E"` → **0**, so at the fix commit itself the file held no `CELL-E2`, parenthesised or otherwise. `git show 515b3a3f:tests/live/live-production-acceptance.test.ts | grep -n "cell 86"` → hits at :13974, :14068, :14069, :14100. `git show 515b3a3f:docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md | grep -c 'CELL-E2'` → 5.
- Fix-commit message: `git log -1 --format=%B 515b3a3f` contains "H8a cell 86 (was CELL-E2, 4 parenthesized tokens renamed, zero artifacts; run twice under lock in-lane)".
- Bug-doc witness lines: `grep -n "CELL-E" docs/bugs/0158-*.md` → 5 hits (:1011, :1024, :1047, :1082, :1083). :1082's `CELL-E2-DOM-1` is the historical sentinel spelling that the record itself says was replaced. The other four are the claim sites above.
- Coverage matrix: `grep -n "0155\|0157\|0158" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → **0**.
- AGENTS.md gate names: `grep -c "CELL-E\|CELL-B2" AGENTS.md` → **0**.
- CHANGELOG (corroboration): `grep -n "cell 85\|cell 86\|CELL-E\|CELL-B2\|alias-sink-array-element-check-live-cell" CHANGELOG.md` → :3569 "H8a cell 86", and no `CELL-E2`.

## Why this is a problem
Every live-evidence statement in the record resolves through a label the witness file does not carry and, per history, never carried. Re-running the gate verbatim selects no bug 0158 cell, so "1 passed / 85 skipped, run twice" cannot be reproduced from the pointer. Residual 3 also makes a claim about the file ("every `CELL-E2` occurrence in the file sits in a parenthesised form") that was already false at 515b3a3f, where the file held zero occurrences. The witness does exist as "cell 86" and asserts the observables the record describes: refusal of the heterogeneous `match` with the registered fragment, and the dominating twin driving to completion. That makes this a decayed pointer, not a missing witness. The cell is under `tests/live/**`, so it is not gate-proven. The record words it as a recorded live run, not as continuous verification.

## Suggested direction (non-binding, optional)
Re-point the four `CELL-E2` mentions to the landed label, "cell 86" (`describe("H8a-T -- bug 0158: … (cell 86) …")`), which CHANGELOG.md and the fix commit message already use.

## False-positive check
- Representations covered: bug-doc witness lines (grep over the record), test titles and bodies (`grep -rn` over `tests/` in hyphen, underscore and camel spellings, plus a case-insensitive grep over the named file), test filenames (`find tests -iname`), coverage-matrix rows (both matrix files), AGENTS.md gate names, and CHANGELOG entries (corroboration only). Each is stated above with its hit count.
- The equivalent witness was opened. The describe/it titles and header comment name bug 0158 and "cell 86", and the body asserts the refused-sibling fragment and a normal drive completion.
- Separate root cause, left unfiled: residual 3's sentinel `THETA-MATCH-DOM-1` is no longer in the file. `git log --oneline -S"THETA-MATCH-DOM" -- tests/live/live-production-acceptance.test.ts` → 515b3a3f and f3be3b4c (bug 0243's sentinel retirement), so a later commit changed that part. It is not part of this token-never-resolved finding.
- Not already filed: the same-pattern pending filings (b0100 `CELL-E`/af221903, b0101 `CELL-E2`/2565269d, b0119 `CELL-B2`/78a6560c) cite other records and commits. `grep -rl "CELL-B2\|CELL-E2\|\"CELL-E\"" quality/` shows no filing that cites 0158.
- Cluster key: the placeholder came from a rename at merge inside fix commit 515b3a3f, not from a deletion. No other record in this shard is affected by that commit (0155's `CELL-E` is 8cf9ea7d, filed separately).
- Not citation form: the pointer is a cell label and a test-name filter, not a `path:line`, and no citation gate reads `docs/bugs/**`.

## Triage
verdict: confirmed — reproduced: bug 0158's §Fix cites `CELL-E2` at :1011/:1024/:1047/:1083 (plus the historical sentinel `CELL-E2-DOM-1` at :1082); `grep -rn CELL-E2 tests` → 0, underscore/camel/case-insensitive → 0, `git log -S"CELL-E2" -- tests` → 0 commits, and 515b3a3f's live file had 0 `CELL-E` (the token never landed); the 515b3a3f message says "H8a cell 86 (was CELL-E2, 4 parenthesized tokens renamed…)"; no CELL-E2 in either coverage matrix or AGENTS.md; the one unambiguous equivalent is tests/live/live-production-acceptance.test.ts:14060 describe "H8a-T -- bug 0158: a heterogeneous `match` still refuses registration under its registered *Trigger*, while its dominating-arm twin registers and runs, live (cell 86) (Convention: live-host acceptance)" / it "refuses the heterogeneous `match` at registration and drives the dominating-arm twin to normal completion through the real discovery->registration->checkTypeLayer path (cell 86)" (the only `(cell 86)` describe, added by 515b3a3f, header comment :13972 names bug 0158; CHANGELOG :3569 says "H8a cell 86"); the fix is a mechanical re-point of the 4 tokens to "cell 86" with the wording left alone; 515b3a3f is not tracked by any other intake file or PTQ (the af221903/2565269d/8cf9ea7d/28c5c72b siblings cite other records); the filing had no `## Triage` heading, so triage added one (triage: claude-opus-5-5)
