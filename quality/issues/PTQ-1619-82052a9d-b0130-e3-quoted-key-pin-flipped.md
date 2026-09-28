---
id: PTQ-1619
title: "Bug 0130's fix record says the quoted-key spelling `{\"a\": string}` is \"measured and pinned silent\", but 82052a9d (bug 0176) re-pinned witness cell e3 to a `quoted-inline-field-name` refusal and 0130 carries no note of it"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md:1257-1260
  - docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md:1184-1186
  - tests/let-annotation-inline-object-compat.test.ts:629-643
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0130's fix record says the quoted-key spelling `{"a": string}` is "measured and pinned silent", but 82052a9d (bug 0176) re-pinned witness cell e3 to a `quoted-inline-field-name` refusal and 0130 carries no note of it

## Observation
Bug 0130's `## Fix (0.160.0)` *Residuals* item 4 names three grammar-admitted spellings that the strict interior parser declines. The first is a quoted key (`{"a": string}`), and the item says "Each is measured and pinned silent". The pin for the quoted key is cell `e3` of the record's named witness, `tests/let-annotation-inline-object-compat.test.ts`. At the fix commit `09eeec4e`, e3 asserted `toEqual([])` under the title "stays silent". Commit `82052a9d` (fix(bug-0176), v0.161.0) rewrote e3's title to "draws bug 0176's quoted-key refusal alone" and its expectation to one `theta/parse/quoted-inline-field-name` line. The 0130 record has no note of that commit: "0176" appears 0 times in it, and the commits that later touched the record (af108d2f/0222, 76489c61/0262) do not mention e3. The pin still exists, but it no longer asserts the silence the record says it pins.

## Evidence
Claim side, `docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md:1257-1260` (re-read before filing):
```
  4. **Grammar-admitted spellings the strict interior parser declines**, all in
     the SAFE direction (status-quo silence, never a wrong refusal): a quoted
     key (`{"a": string}`), an `as "WireName"` rename, a generic application in
     a field type (`Result<A, B>`). Each is measured and pinned silent.
```
The witness the record names, `:1184-1186`:
```
- Gates: witness `npx vitest run tests/let-annotation-inline-object-compat.test.ts`
  → `Test Files 1 passed (1) / Tests 51 passed (51)`; full default suite
  `npm test` → `Test Files 351 passed (351) / Tests 7035 passed (7035)`;
```

Evidence side. The pin at the fix commit, `git show 09eeec4e:tests/let-annotation-inline-object-compat.test.ts` lines 620-626:
```
  it("e3: `let x: {\"a\": string} = 1` stays silent — a quoted key is no `Ident`", () => {
    // The field name grammar is `Ident` (schemas.md's `Field` form, reused by
    // `ObjectType` per grammar.md:109), so a JSON-style quoted key is not one.
    expect(
      stmtDiags('let x: {"a": string} = 1'),
      "e3 — R2 declines a non-identifier key rather than treating `\"a\"` as a field name",
    ).toEqual([]);
```
The pin today, `tests/let-annotation-inline-object-compat.test.ts:629-643` (default suite, not under `tests/live/**`):
```
  it("e3: `let x: {\"a\": string} = 1` draws bug 0176's quoted-key refusal alone — a quoted key is no `Ident`", () => {
    ...
    // WHY THIS LIST MOVED (at the 0176 merge): bug 0176 §Fix route A refuses a
    // quoted inline field-name key at parse (`theta/parse/quoted-inline-field-name`),
    ...
    expect(
      stmtDiags('let x: {"a": string} = 1'),
      "e3 — R2 declines a non-identifier key rather than treating `\"a\"` as a field name",
    ).toEqual([
      line("error", "theta/parse/quoted-inline-field-name", [["<field>", '"a"']]),
    ]);
```
The flipping commit: `git show 82052a9d -- tests/let-annotation-inline-object-compat.test.ts` shows the one hunk `-  it("e3: … stays silent …` / `+  it("e3: … draws bug 0176's quoted-key refusal alone …`, and `-    ).toEqual([]);` / `+    ).toEqual([ line("error", "theta/parse/quoted-inline-field-name", …) ]);`. `git log --format="%h %ad %s" --date=short 09eeec4e..af108d2f -- tests/let-annotation-inline-object-compat.test.ts` returns exactly one commit, `82052a9d 2026-08-21 fix(bug-0176): …`. The blob moved from `4b9eb71c` at `09eeec4e` to `fbd79362` at `82052a9d` (`git rev-parse <c>:tests/let-annotation-inline-object-compat.test.ts`).

No note on the record:
- `grep -c "0176" docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md` → 0.
- `git log --format="%h %ad %s" --date=short -- docs/bugs/0130-…md` → 1451eb79 (filing), 85717fa8 (0093), 09eeec4e (0130 fix), af108d2f (0222), 76489c61 (0262). The 82052a9d commit does not touch the 0130 record. Its `--stat` lists the notes it appended (0045/0052/0154/0159/0160/0161), and 0130 is not among them.
- `grep -c "let-annotation-inline-object-compat\|0130" docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md` → 0. The 82052a9d commit message lists its re-pins as "f2/k2/A3/B1/D1/G2", with no e3.

## Why this is a problem
The record's residual says one set of spellings stays silent and cites the pin as evidence. The only pin for the quoted-key spelling has asserted a registered refusal since 82052a9d. So the claim→evidence chain for that spelling now runs to a cell that says the opposite ("status-quo silence, never a wrong refusal" against a refusal). A reader of 0130 cannot tell from the record that the spelling left its "SAFE direction" set. Nothing records who moved it. The cell's own comment carries the explanation, but the record does not.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0130 in the house shape of its 0222/0262 notes. It would record that cell e3 now pins bug 0176's `theta/parse/quoted-inline-field-name` refusal, while the R2 conversion decline (no `let-rhs-type-mismatch` line) still holds. The equivalent witness is cell e3 itself at `tests/let-annotation-inline-object-compat.test.ts:629-643`.

## False-positive check
- Pin identity: `grep -nE 'it\("e3' tests/let-annotation-inline-object-compat.test.ts` → 1 hit (:629), the only cell in the witness whose source is `{"a": string}`. `git show 09eeec4e:tests/let-annotation-inline-object-compat.test.ts | grep -n 'e3:'` → 1 hit (:620). So e3 is the pin for residual 4's quoted-key spelling at the fix commit.
- Cell is default-suite: the file is at `tests/` root. `vitest.config.ts:12` excludes only `tests/live/**`, so the current assertion is gate-proven at this wave's head.
- Supersession check: the record's later notes were read in full. The 0222 note (`:1290-1314`) and the 0262 note (`:1316-1367`) name cells c3 and c5 only. Neither mentions e3 or the quoted-key spelling. The 0262 note's "No other cell … moves" is scoped to its own diff.
- Not a gate-enforced citation form: the record cites the witness by path and the spelling by source text, not by bare `:NN`. The decay is in what the pin asserts, which `tests/citation-symbol-form-gate.test.ts` does not read (its header excludes `docs/bugs/**`).
- Duplicate check: no pending or filed candidate names `82052a9d` or bug 0130's e3. The same-wave filing `qw20260928081617-d10-03-f5862ab0-b0096-cell-6a-clean-load-pin-decayed.md` is the same class for a different record and sha.
- Claim truth not adjudicated: whether the quoted-key refusal is right is bug 0176's matter. This finding covers only the pin that the 0130 record cites.

## Triage
verdict: questionable — decay verified: 0130:1257-1260 says the quoted key `{"a": string}` is "pinned silent" (witness named at :1184-1186); at 09eeec4e cell e3 asserted `toEqual([])`, and 82052a9d (bug-0176, the only commit touching e3 since; it modified the cell, it did not delete it) re-pinned it to one `theta/parse/quoted-inline-field-name` line, now at tests/let-annotation-inline-object-compat.test.ts:629-643. `grep -c 0176` on 0130 gives 0, 82052a9d leaves the 0130 record untouched, and the 0176 record has 0 hits for 0130 or the witness. But no equivalent pin of the stated observable (silence) exists, because the spelling now refuses. So this is not a mechanical re-point: the claim itself is now untrue for this spelling, and amending or annotating the record's wording is a human's call. No PTQ tracks it, and the same-wave 82052a9d mention (d10-02-0176 overstated-strength) has a different root cause (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md (after the existing 0222 and 0262 notes), nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0176 (0.161.0)

Commit 82052a9d (bug 0176 fix, v0.161.0) re-pinned witness cell e3 in tests/let-annotation-inline-object-compat.test.ts: the quoted-key spelling this record calls measured and pinned silent now draws one theta/parse/quoted-inline-field-name refusal. The wording above stands as a dated record; current disposition: docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md.
