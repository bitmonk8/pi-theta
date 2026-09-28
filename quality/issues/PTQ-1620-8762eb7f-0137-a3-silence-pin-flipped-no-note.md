---
id: PTQ-1620
title: Bug 0137's fix record says witness cell a3 pins the array-literal invoke argument as a silence cell, but commit 8762eb7f (bug 0146) flipped a3 to an emission and 0137 carries no note of it
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0137-invoke-arg-type-mismatch-unreachable.md:837-851
  - tests/invoke-arg-type-mismatch-wired.test.ts:641-671
  - tests/invoke-arg-type-mismatch-wired.test.ts:304
  - docs/bugs/0146-invoke-arg-provable-set-withholds-true-positives.md:135
  - docs/bugs/0146-invoke-arg-provable-set-withholds-true-positives.md:1183
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0137's fix record says witness cell a3 pins the array-literal invoke argument as a silence cell, but commit 8762eb7f (bug 0146) flipped a3 to an emission and 0137 carries no note of it

## Observation
Bug 0137's `## Fix (0.78.0)` residual 1 says cells a3 (an array-literal `invoke` argument) and a4 (a typed-`let` read) "DEFER and stay silent; the witness pins them as silence cells". Residual 2 lists "an array literal" among the withheld true positives that "defer". Today cell a3 in `tests/invoke-arg-type-mismatch-wired.test.ts` asserts the reverse: the array literal reports `theta/parse/invoke-arg-type-mismatch` and its caller does not register. Commit `8762eb7f` ("fix(bug-0146): invoke-arg provable set gains the array arm — v0.228.0") made that flip. Neither the commit nor any later change added a note to 0137's record. Cell a4 still asserts silence, so half of the residual-1 pin still holds as written.

## Evidence
Claim side: `docs/bugs/0137-invoke-arg-type-mismatch-unreachable.md:837-851` (re-read immediately before filing):
```
- Residuals:
  1. **§Expected behaviour's a3/a4 sentence is wrong and was not applied.** The
     doc says "a1–a5 should report", but §Fix's binding soundness constraint
     routes emission through `collectProvableArgTypes`, whose `array` and
     `ident` arms both return `undefined`. a3 (`invoke("./cc.theta", ["a"])`)
     and a4 (a typed-`let` read) therefore DEFER and stay silent; the witness
     pins them as silence cells with the reason named. Confirmed empirically on
     the already-wired sibling arm before being encoded. §Fix governs; the two
     sentences cannot both hold.
  2. **Withheld true positives on the invoke arm** — an array literal, an
     `ident`, and the `index` / `par-for` shapes are provably mistyped at a
     primitive param yet defer, because `collectProvableArgTypes` bails on them
     for the sibling arm's own reasons. Flip condition: any widening of that
     function's arms lands emissions here automatically, since this arm reads
     it unchanged.
```

Evidence side, current tree: `tests/invoke-arg-type-mismatch-wired.test.ts:651-671` (fixture `a3arr` at `:304`, `invoke("./cc.theta", ["a"])?`):
```
describe("bug 0137 cells a3, a4 — a provable array literal reports, an identifier defers", () => {
  it("a3: an array literal at a `string` param reports `expected string, got array<string>` and un-registers its caller", () => {
    expect(
      outcome.notifications,
      ...
    ).toContain(invokeArgMessage(0, "x", "string", "array<string>", fill));
    expect(
      linesForCode("a3arr", CODE).length,
      ...
    ).toBeGreaterThan(0);
    expect(
      outcome.registered,
      ...
    ).not.toContain("a3arr");
```

Pre-flip state: `git show 8762eb7f^:tests/invoke-arg-type-mismatch-wired.test.ts`, line 815: `it("a3: an array literal at a \`string\` param draws no diagnostic and the caller registers", () => {` with `linesForCode("a3arr", CODE)` asserted `.toEqual([])`, which is the silence cell 0137 describes.

Flipping commit: `git log --format='%h %ad %s' --date=short -S 'un-registers its caller' -- tests/invoke-arg-type-mismatch-wired.test.ts` → 2 hits: `8762eb7f 2026-08-23 fix(bug-0146): invoke-arg provable set gains the array arm — v0.228.0` and `a314ac83 2026-08-05 fix(bug-0137) ...`. `git show 8762eb7f -- tests/invoke-arg-type-mismatch-wired.test.ts` shows the a3 `it` title and the `.toContain("a3arr")` → `.not.toContain("a3arr")` change. The commit message reads "a3 flipped to an emission under Fix (d) pre-authorization; a4 untouched. No discharge notes owed".

No note on 0137: `grep -c "0146\|0\.228\|8762eb7f" docs/bugs/0137-invoke-arg-type-mismatch-unreachable.md` → 0. Bug 0146's record says, at `docs/bugs/0146-invoke-arg-provable-set-withholds-true-positives.md:1183`: "- **Discharge notes appended:** none." Its `:135` says the change "must not flip witness cells a3/a4 without retaking this report's decision", so the flip was authorised on 0146's record, but 0137's residual was never updated to match.

Equivalent current witness for the array-literal verdict: cell a3 itself, now an emission pin, plus `tests/invoke-arg-array-literal-provable.test.ts` (added by `8762eb7f`, 29 cells per its commit message).

## Why this is a problem
A witness pin in a fixed record has to resolve as stated. Residual 1 names cell a3 as a pin for silence. That cell now pins an emission, so a reader who follows the pointer finds the opposite of what the record says. Residual 2 lists "an array literal" as still deferring, and that verdict has also been reversed. This is the same class as the wave's other pinned-and-flipped filings: a later fix legitimately flips a cell that an earlier record cites, and the earlier record never gets a note.

## Suggested direction (non-binding, optional)
Append a dated note to 0137 saying that bug 0146 (0.228.0, `8762eb7f`) flipped cell a3 to an emission pin and removed the array literal from residual 2's withheld set, with a4 still a silence pin. The note can cite `tests/invoke-arg-array-literal-provable.test.ts` as the array-arm witness.

## False-positive check
- Cell identity: `grep -n "a3\|a4" tests/invoke-arg-type-mismatch-wired.test.ts` finds the single a3 fixture (`:304`, stem `a3arr`) and the single a3 `it` (`:652`). No second a3 cell pins silence.
- a4 still asserts silence (`:673-686`, `linesForCode("a4ident", CODE)` `.toEqual([])`, `.toContain("a4ident")`), so this filing covers a3 only. For a4 the residual still holds.
- Record note search: `grep -c "0146\|0\.228\|8762eb7f"` on 0137 → 0. 0146's own "Discharge notes appended: none" (`:1183`) confirms no note was written from the other side.
- Residual 2's "Flip condition" sentence anticipates a future flip. It does not record that one happened, and residual 1's "the witness pins them as silence cells" is an unconditional present-tense pointer.
- Pending candidates: no pending or filed candidate names `8762eb7f` or bug 0137's a3 cell. PTQ-0975/PTQ-1324 concern test-harness duplication in the array-literal file (D7), not this pointer.
- Tests were not run. The a3 assertion was read directly from the default-suite file, which the green preflight makes current.

## Triage
verdict: questionable — decay verified, but a re-point cannot fix it. 0137:837-851 (residual 1: a3/a4 "DEFER and stay silent; the witness pins them as silence cells"; residual 2 lists "an array literal" as deferring) reproduces verbatim. At HEAD, cell a3 (invoke-arg-type-mismatch-wired.test.ts:652-671, fixture `a3arr` at :304) asserts `.toContain(invokeArgMessage(…"array<string>"…))` and `.not.toContain("a3arr")`. `8762eb7f^` had "a3: … draws no diagnostic and the caller registers" with `.toEqual([])`. The `-S 'un-registers its caller'` search reproduces (8762eb7f, a314ac83). The 0146/0.228/8762eb7f grep on 0137 gives 0, and 0137's last commit is a314ac83. 0146:135 and :1183 ("Discharge notes appended: none") reproduce, and a4 still pins silence. The cell was rewritten, not deleted, and now pins the opposite verdict. The named witnesses (a3 now, tests/invoke-arg-array-literal-provable.test.ts) are the supersession, not an equivalent for the silence claim, so the repair is a dated supersession note or a reword, which is a human's call (same ruling as sibling pin-flipped filings 1ead931f/76489c61/35b718cc). No other intake/issue carries 8762eb7f. The candidate lacked a ## Triage heading, so triage added one (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0137-invoke-arg-type-mismatch-unreachable.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0146 (0.228.0)

Commit 8762eb7f (bug 0146 fix, v0.228.0) re-pinned witness cell a3 in tests/invoke-arg-type-mismatch-wired.test.ts: the array-literal invoke argument residuals 1 and 2 above cite as a DEFER/silence pin now asserts the invoke-arg type-mismatch emission (cell a4 still pins silence for its own spelling). The wording above stands as a dated record; current disposition: docs/bugs/0146-invoke-arg-provable-set-withholds-true-positives.md and tests/invoke-arg-array-literal-provable.test.ts.
