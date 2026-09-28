---
id: PTQ-1626
title: Bug 0140's fix record says witness row g9 pins `par for` as outside the identifier walk's reach, but commit 844d6533 (bug 0224) flipped g9 to assert refusals inside `par for` and 0140 carries no note of it
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0140-bare-schema-reference-value-position-silent.md:997-1003
  - tests/type-name-as-value-refusal.test.ts:1654-1711
  - docs/spec_topics/diagnostics/code-registry-parse.md:99
  - docs/bugs/0224-identifier-walk-never-descends-par-for.md:749
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0140's fix record says witness row g9 pins `par for` as outside the identifier walk's reach, but commit 844d6533 (bug 0224) flipped g9 to assert refusals inside `par for` and 0140 carries no note of it

## Observation
Bug 0140's `## Fix (0.122.0)` residual 2 says `par for` is outside the identifier-resolution walk's reach. It gives the measurement `par for x in [1] { Zzz }` → `[]` and says the gap is "Pinned by witness row g9 and stated in the registry row as a REACH fact". Today g9 in `tests/type-name-as-value-refusal.test.ts` asserts the reverse: inside a `par for`, the walk emits `theta/parse/type-as-value` and `theta/parse/unknown-identifier`. The registry row no longer states the reach exception either. Commit `844d6533` ("fix(bug-0224): the identifier walk descends par for bodies — v0.164.0") restated g9 and edited the row. 0140's record has no note of that change.

## Evidence
Claim side: `docs/bugs/0140-bare-schema-reference-value-position-silent.md:997-1003` (re-read immediately before filing):
```
  2. **`par for` is outside the walk's REACH entirely.** Measured:
     `par for x in [1] { Zzz }` → `[]` where the plain-`for` control draws
     `unknown-identifier`; the iterand and the `max` operand escape too. That
     is bug 0118's subject (the same absent `par for` arm on the structural
     walk) and is pre-existing — this fix neither introduces nor widens it.
     Pinned by witness row g9 and stated in the registry row as a REACH fact,
     not as a rule this row makes.
```

Evidence side, current tree: `tests/type-name-as-value-refusal.test.ts:1654` and `:1689-1694`:
```
  it("(g9): identifier resolution DESCENDS a `par for`, so everything inside one is judged (reach gap closed — bug 0224)", () => {
  ...
    expectCodes(
      "g9 (par for reach, closed by bug 0224)",
      doc,
      [TYPE_AS_VALUE, UNKNOWN_IDENT, UNKNOWN_IDENT, NON_ARRAY_ITERAND, UNKNOWN_IDENT],
```
The fixture includes `let b = par for y in [1] { Zzz }`. g9 now pins `unknown-identifier` for that line, where 0140's residual measures `[]`.

Pre-flip state: `git show 844d6533^:tests/type-name-as-value-refusal.test.ts`, line 1733: `it("GREEN (g9): identifier resolution never descends a \`par for\`, so nothing inside one is judged", () => {`, with `expectCodes("g9 (par for non-reach)", doc, [NON_ARRAY_ITERAND], ...)`. That is the pin 0140 describes.

The registry half of the pointer is gone too. `git show 844d6533 -- docs/spec_topics/diagnostics/code-registry-parse.md` removes the `type-as-value` Trigger's clause that the walk "never descends the construct, so nothing a `par for` spells … is judged by this row or by `theta/parse/unknown-identifier`". It adds "a `par for` iterand or `max` operand" to the judged positions. The current row at `code-registry-parse.md:99` lists "a `par for` iterand or `max` operand" among the positions it judges and states no reach exception.

Flipping commit: `git log --format='%h %ad %s' --date=short -S "reach gap closed" -- tests/type-name-as-value-refusal.test.ts` → 1 hit: `844d6533 2026-08-21 fix(bug-0224): the identifier walk descends par for bodies — v0.164.0`. Its message reads: "g9 of type-name-as-value-refusal RESTATED under this doc's own authority … 0118 residual 2 + arrangement-2 charge discharged (note appended)". `git show --stat 844d6533` touches `docs/bugs/0118-…` and `docs/bugs/0224-…` but no `docs/bugs/0140-…` file.

No note on 0140: `grep -c "0224\|0\.164\|844d6533" docs/bugs/0140-bare-schema-reference-value-position-silent.md` → 0. Bug 0224's own record at `docs/bugs/0224-identifier-walk-never-descends-par-for.md:749` says "Discharge notes appended: `docs/bugs/0118-nested-fn-result-return-defers-to-runtime-panic.md`". 0140 is not listed.

Equivalent current witness for the `par for` reach: g9 itself, now a refusal pin, plus bug 0224's additive cells in `tests/par-for.test.ts` (26 per the commit message).

## Why this is a problem
Residual 2 is a witness pointer in a fixed record, and both of its targets have flipped. Row g9 now pins refusals where the record says it pins silence. The registry row no longer states the REACH fact the record says it states. Following either pointer lands on the opposite claim. The flip itself was authorised on bug 0224's record, which is why this is a stale pointer in 0140 rather than an unauthorised change. The earlier record just never got the note.

## Suggested direction (non-binding, optional)
Append a dated note to 0140 saying that bug 0224 (0.164.0, `844d6533`) closed residual 2: g9 now pins the refusals inside `par for`, the registry row's reach clause is gone, and `tests/par-for.test.ts` carries the additive cells.

## False-positive check
- Cell identity: `grep -n "g9" tests/type-name-as-value-refusal.test.ts` finds one `it` (`:1654`) plus its labels and group comments. No second g9 cell pins silence.
- 0140's other residual pins still resolve as stated. g8 (`:1637`) still asserts `[]` for the `${…}` interpolation. g7 (`:1620`, imported symbol) and g6 (`:1602`, callable-set entry) are still silent cells. Only residual 2 is filed.
- 0140's gate line cites the witness `tests/type-name-as-value-refusal.test.ts`. The file exists (`test -e` OK) and is a default-suite file, so the green preflight covers it. Its stated counts were not re-derived by running tests.
- Record note search: `grep -c "0224\|0\.164\|844d6533"` on 0140 → 0. 0224's discharge list (`:749`) names 0118 only.
- Pending candidates: no pending or filed candidate names `844d6533` or bug 0140's g9.
- Tests were not run. Assertions were read directly from the committed files and from `git show` of the parent revision.

## Triage
verdict: questionable — decay verified: 0140:997-1003 residual 2 says g9 pins `par for` silence and the registry row states a REACH fact, but 844d6533 (bug 0224, v0.164.0; not a deleting sha, it flips the pin) restated g9 (tests/type-name-as-value-refusal.test.ts:1654 "(g9): identifier resolution DESCENDS a `par for`…", expects [TYPE_AS_VALUE, UNKNOWN_IDENT×2, NON_ARRAY_ITERAND, UNKNOWN_IDENT]; parent :1733 was "GREEN (g9): … never descends…" [NON_ARRAY_ITERAND]) and dropped the reach clause from code-registry-parse.md:99; 0140 has 0 hits for 0224/0.164/844d6533 and 0224:749 lists only 0118 for discharge notes. No witness for the claimed silence exists any more (the pin now asserts the opposite, so the claim is superseded, not re-pointable), and the repair is a supersession note, i.e. new wording on the record, which is a human ruling. No other intake/PTQ tracks 844d6533 for 0140; d10-04 only mentions it in passing (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0140-bare-schema-reference-value-position-silent.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0224 (0.164.0)

Commit 844d6533 (bug 0224 fix, v0.164.0) flipped witness row g9 in tests/type-name-as-value-refusal.test.ts: the identifier walk now DESCENDS par for bodies and g9 asserts refusals inside them, superseding the par-for-outside-reach silence residual 2 above records; the same commit dropped the reach clause from the code-registry-parse row. The wording above stands as a dated record; current disposition: docs/bugs/0224-identifier-walk-never-descends-par-for.md.
