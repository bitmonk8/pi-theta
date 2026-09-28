---
id: PTQ-1631
title: Bug 0338's fix record counts "5 belt cells" whose revert-witness reds B1/*///% + A1, but commit d224287a (bug 0345) re-pinned four of them to parse-only load-refusal cells that never reach the belt, and 0338 carries no note
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md:292-297
  - docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md:308-311
  - tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:46-72
  - tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:225-250
  - tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:292
  - tests/b0345-interpolation-operand-checks-at-parse.test.ts:505-522
  - docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md:332-336
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0338's fix record counts "5 belt cells" whose revert-witness reds B1/*///% + A1, but commit d224287a (bug 0345) re-pinned four of them to parse-only load-refusal cells that never reach the belt, and 0338 carries no note

## Observation
Bug 0338 (Status: fixed (0.311.0)) records its witness as "5 belt cells + 5 controls". It says neutering the belt "reds exactly B1/`*`/`/`/`% + A1". Commit d224287a (bug 0345, v0.317.0, 2026-08-31) re-pinned the four interpolation cells, B1, Op*, Op/ and Op%. They now call `parseOnly(src)` and assert the load-time code `theta/parse/non-numeric-arithmetic-operands`. The witness file's own header now says these cells "no longer witness the belt itself". Of the five cells 0338 credits as belt witnesses, only A1 still drives the belt. The 0338 record's last commit is its own fix commit, d7089572 (2026-08-30), and it contains no mention of 0345.

## Evidence
Claim side (re-read immediately before filing):

`docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md:292-297`:
```
- **Gates (verbatim):**
  - Witness: `npx vitest run tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts`
    — 10 passed (5 belt cells + 5 controls). Revert-witness: neutering the belt
    reds exactly B1/`*`/`/`/`% + A1 for the silent-NaN reason; restore → green.
  - Full suite: `npm test` — 486 files / 9622 tests passed (fork baseline
    485/9612 + the new witness file's 10 cells; no existing test flipped).
```

`docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md:308-311`:
```
- **Verification:** SOLID. Witness reds-on-neuter / greens-on-restore (obl. 1);
  full suite 486/9622 (obl. 2); live b0341live green as non-regression on the
  pure-host path, no acceptance cell owed for a registration-inert belt (obl. 3);
  typecheck + lint clean (obl. 4).
```

Evidence side. The witness file header at HEAD, `tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:67-72`:
```
//   B1/Op*/Op//Op% RE-PINNED (bug 0345): the operand `s` is statically
//                        resolvable, so the interpolation now refuses at LOAD
//                        with `theta/parse/non-numeric-arithmetic-operands`
//                        instead of reaching this file's belt at render — these
//                        cells no longer witness the belt itself, only the
//                        load-time refusal bug 0345 adds in front of it.
```

The four cells, `tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:232-240`:
```
  for (const [id, src, expectedMessage] of interpRows) {
    it(`RE-PINNED (${id}): refuses at LOAD with theta/parse/non-numeric-arithmetic-operands (bug 0345, was a runtime belt observable)`, () => {
      const doc = parseOnly(src);
      const errors = doc.diagnostics.filter((d) => d.severity === "error");
      expect(
        errors.map((d) => d.code),
        ...
      ).toEqual([NON_NUMERIC_ARITHMETIC_OPERANDS_CODE]);
```
Each cell asserts only on the parse result. None drives the render or the belt. Neutering the belt therefore cannot red them.

Per-instance check of the five cells credited as belt witnesses at :294-295:
- B1 (`-`): re-pinned. The row sits in `interpRows` (:227) and runs through the `parseOnly` loop above.
- Op `*`: re-pinned (row at :228).
- Op `/`: re-pinned (row at :229).
- Op `%`: re-pinned (row at :230).
- A1: still a belt cell. The header at :52-54 reads "LOUD FRAMED abort BEFORE callee load", and the `it('RED (A1): …')` at :292 is unchanged by d224287a.

Commit attribution:
- `git log --format="%h %ad %s" --date=short -- tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts` lists `d224287a 2026-08-31 fix(bug-0345): …`. `git show d224287a -- <that file>` rewrites the four `it(\`RED (${id}): loud framed abort, no NaN prompt sent …\`)` cells into the `RE-PINNED` parse-only form. It also deletes `assertNoNaNPromptSent`.
- The d224287a commit message says: "Flips exactly per the doc's enumeration (0122 a11/f4, four b0338 cells)."
- The flip is recorded only on the 0345 side, at `docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md:332-336`: "the four statically-resolvable interpolation cells (`let s = "a"` / `${s <op> 1}`) re-pinned from a runtime-belt observable to a load refusal (§Fix constraint 3, pre-authorized); A1 (withheld param → defers), numeric controls, and B3 untouched."
- `git log --format=%h -- docs/bugs/0338-…md` → d7089572, 4181047c. The record has not been touched since its fix. `grep -c "0345" docs/bugs/0338-…md` → 0.

An equivalent witness exists for the interpolation belt path. `tests/b0345-interpolation-operand-checks-at-parse.test.ts:505-522`, "PARITY (5b): the deferred arithmetic reaches the bug 0338 belt — loud framed abort, no prompt sent", drives `fn f(x) { @\`v=${x - 1}\` } / f("a")` through `driveInterp` and asserts `assertFramesToInternalError` plus `probe.sent` equal to `[]`. It covers the `-` operator only.

## Why this is a problem
0338's Gates and Verification lines are its only evidence that the belt works. They name five cells that neuter-to-red, but at HEAD four of those cells are parse-gate witnesses for bug 0345. Neutering the belt would now red only A1. The record's cell count and revert list still describe a witness shape the file no longer has. The surviving interpolation-path belt witness sits in another bug's file, and nothing in 0338 points to it. The house practice of dated coordination notes on flipped records (used, for example, in 0329's note at :196 for 0379's re-anchoring) was not applied here.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0338. It would record d224287a's re-pin of B1/Op*/Op//Op%, name A1 as the surviving in-file belt witness, and name `tests/b0345-interpolation-operand-checks-at-parse.test.ts` PARITY (5b) as the interpolation-path belt witness.

## False-positive check
- Test titles: `git grep -nE "(it|describe)\(.*(belt)" -- tests ':!tests/live' | grep -i "interp\|0338\|pure-host\|backstop"` gives 6 hits: the b0338 RE-PINNED cell (:233), b0345 RED (3) (:236), b0345 PARITY (5b) (:505) and (5c) (:525), b0365 PH3 (:491) and b0367 GROUP R-PURE (:344). Of these, only b0345 (5b) drives the 0338 arithmetic belt on an interpolation. (5c) is the 0368 belt.
- Filenames: `git grep -ln "0338" -- tests ':!tests/live'` gives 6 files (b0325, b0338, b0345, b0368, b0369, b0392). b0345 holds the only interpolation-belt drive for the 0338 arithmetic operators.
- Honesty-marker check: 0338 has no "pending"/superseded marker for these cells, and `grep -c "0345"` on the record is 0. The flip is documented only in 0345's record and in the test header.
- Pending candidates: `grep -ln "d224287a" quality/intake/*` → 0. No same-sha filing exists. Record 0122 is also affected by d224287a but is outside this shard.
- Scope: this concerns the evidence chain only. The belt code and the 0345 re-pin are not questioned.

## Triage
verdict: questionable — decay verified; the record's wording is a human's to change. 0338:292-297 credits "5 belt cells" / neuter reds "B1/`*`/`/`/`% + A1". At HEAD the four B1/Op cells in tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts are `RE-PINNED (…)` parseOnly load-refusal cells (:225-250), rewritten by d224287a (`-RED (${id}): loud framed abort…` → `+RE-PINNED`). Only `RED (A1)` (:292) still drives the belt. The 0338 record has not changed since d7089572 (grep 0345 → 0), and the flip is recorded only in 0345:332-336. The only interpolation-path equivalent, tests/b0345-interpolation-operand-checks-at-parse.test.ts "PARITY (5b): the deferred arithmetic reaches the bug 0338 belt…", covers `-` only and not `*`/`/`/`%`. So there is no unambiguous one-to-one re-point, and the repair is a new coordination note, which is authoring, not a mechanical re-point. No same-sha filing in intake/issues (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0345 (0.317.0)

Commit d224287a (bug 0345 fix, v0.317.0) re-pinned four of the five belt cells this record counts as revert-witness reds: the B1 star, slash and percent cells in tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts are now RE-PINNED parse-only load-refusal cells (the operand checks fire at parse), and only RED (A1) still drives the runtime belt. The interpolation-side PARITY (5b) cell in tests/b0345-interpolation-operand-checks-at-parse.test.ts covers the minus operator only. The wording above stands as a dated record; current disposition: docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md.
