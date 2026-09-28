---
id: PTQ-1667
title: "Bug 0235's Status `fixed (0.189.0) — discharged by bug 0231's fix` claims all three faces closed, including the over-applied `array<{a b: integer}, string>` arity refusal and the walked `void` tail, on a parent-gate measurement at fe3c53cf, and names no witness; no default-suite test carries a face-2 or face-3 row"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0235-malformed-inline-field-truncates-generic-argument-list.md:3-22
  - docs/bugs/0235-malformed-inline-field-truncates-generic-argument-list.md:580-584
  - docs/bugs/0235-malformed-inline-field-truncates-generic-argument-list.md:302-331
  - tests/generic-argument-bracket-group-truncation.test.ts:651-657
  - tests/generic-argument-inline-field-key-rules.test.ts:450-451
  - tests/generic-argument-bracket-group-truncation.test.ts:358-360
  - tests/type-grammar.test.ts:33
  - docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:737-739
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0235's Status `fixed (0.189.0) — discharged by bug 0231's fix` claims all three faces closed, including the over-applied `array<{a b: integer}, string>` arity refusal and the walked `void` tail, on a parent-gate measurement at fe3c53cf, and names no witness; no default-suite test carries a face-2 or face-3 row

## Observation
Bug 0235 is Status `fixed (0.189.0)` through a discharge note added by the docs-only commit 978d8d22. The note says bug 0231's route "closed all three faces" and lists per-row outcomes:
- Element 1: a1/a2/a9/a11–a15 → `[]`;
- Element 2: c1/c3/c5/c6/c7/c9/c10 "all draw `array … got 2/3`";
- Element 3: d1 "draws `void-in-non-return-position` identical to control d2".

The only evidence named is "parent-gate adjudication, measured at `fe3c53cf`". The one file path in the note, `.pi/tmp/fixes/0235-report.md`, is gitignored (`.gitignore:32:.pi/tmp/`), so it is not in the tracked tree, and it is cited for the not-covered bracket-group class. The record has no `## Fix (…)` section and no Witness line. Its own §Fix (f) required "Fresh inline witnesses for every row of §Reproduction" and required that `tests/type-grammar.test.ts` group V2a-T "gain the malformed-argument cells". Neither landed. Two sibling witnesses assert face 1: `Result<{a b: integer}, string>` now draws only the raw-key refusal, with no false `ARITY(1)`. No default-suite test contains a face-2 row (an over-applied `array` whose first argument is a malformed interior) or a face-3 row (`Result<{a b: integer}, void>`).

## Evidence
Claim side (re-read just before filing), `docs/bugs/0235-malformed-inline-field-truncates-generic-argument-list.md:3-15`:
```
- **Status:** fixed (0.189.0) — discharged by bug 0231's fix; see the note
  below. Originally: open, blocking on
  [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md), which
  names the same `break` at `type-grammar.ts:694`–`:696`: its route selection
  decides whether the rows here still stand (§Fix (d)).

> **Discharged by bug 0231's fix (0.189.0)** — parent-gate adjudication,
> measured at `fe3c53cf`: 0231's route 1 (`skipMalformedEntry()` + resync at
> the next depth-0 comma) closed all three faces. Element 1: a1/a2/a9/a11–a15
> → `[]`, a10 → `got 3` (true count). Element 2: c1/c3/c5/c6/c7/c9/c10 all
> draw `array … got 2/3`. Element 3: d1 draws `void-in-non-return-position`
> identical to control d2. Lowerings e1–e3 byte-identical (0204 invariant
> intact). The `theta-document.ts:5942`–`:5944` peel-count-agreement claim is
```
`:20-22`: `> which neither of this report's §Fix routes reaches; the peel claim remains` / `> false for that class only. Evidence: \`.pi/tmp/fixes/0235-report.md\`` / `> §Residuals 1 (pre-measured table).`

The record's own witness requirement, `:580-584`:
```
**(f) Locks.** Fresh inline witnesses for every row of §Reproduction, as whole
ordered unfiltered `toEqual` lists with every *Message* through `parseRegistry`
/ `registryMessage` (DIAG-4). The pinned bytes are:
`tests/type-grammar.test.ts` group `V2a-T` (`:58–:83`), bug 0044's arity
witness, whose two cells must stay green and gain the malformed-argument cells;
```
The rows claimed closed are at `:302-331`: (c) c1 `schema T = array<{a b: integer}, string>` … c10, and (d) d1 `let x: Result<{a b: integer}, void> = 1`.

Evidence side (what exists):
- Face 1, witnessed:
  - `tests/generic-argument-bracket-group-truncation.test.ts:651-657` (0236's d5): comment "The inline-object carrier's own false `ARITY(1)` is gone (bug 0235, discharged)", `src: theta("let x: Result<{a b: integer}, string> = 1")`, `expected: [NOTIDENT("a b")]`.
  - `tests/generic-argument-inline-field-key-rules.test.ts:450-451` (0233's f2): the same source, `expected: [NOTIDENT("a b")]`.
- Not a face-2/3 witness: `tests/generic-argument-bracket-group-truncation.test.ts:358-360` (a13), labelled "the inline-object control (bug 0235 discharged, bug 0231 landed)", uses the well-formed `Result<{a: integer}, string>`, which was never broken.
- `tests/type-grammar.test.ts:33` `describe("V2a-T — generic-type arity (theta/parse/generic-arity-mismatch)", …`. `rg -n '\{a\sb|\{a as' tests/type-grammar.test.ts` → **0** hits, so no malformed-argument cells were added.
- `docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:737-739` is 0231's only 0235 statement, and it states a cursor contract, not a witness: "**For bug 0235:** at the resync site the cursor stops ON a depth-0 `}` or `>` without consuming it, and otherwise one token past this interior's next depth-0 `,`; it never lands mid-entry."
- 0231's fix commit adds no 0235 cells: `git show --name-only --format= fe3c53cf | grep tests` → `tests/inline-object-malformed-entry-resync.test.ts`, `tests/inline-object-wire-name-rename-refusal.test.ts` and 0231's live pair. The resync witness's only generic-arity cells, b2/b2c (`:338-344`), put the over-applied `array<string, integer>` inside a field of a bare interior, not a malformed interior as an argument of the enclosing generic.

Searches (all run in this session), one per representation:
- Test bodies, face 1 and 2 shape: `rg -n '(array|Result)<\{[a-z]+ [a-z]+: [a-z<>]+\}, ' tests` → **2** hits, both `Result<{a b: integer}, string>` (the face-1 cells above).
- Test bodies, any brace interior as a non-last generic argument: `rg -n '(array|Result)<\{[^}]*\}, [a-z{]' tests | wc -l` → **18**. Filtering those through `rg -v '\{a: |\{a b: integer\}, string|\{ éLan'` leaves **0**. So every hit is one of three kinds: a well-formed `{a: …}` interior; one of the two face-1 cells; or 0233's d6 lowering call `lowerQueryResponseSchema("Result<{ éLan: string }, string>", …)` (`tests/generic-argument-inline-field-key-rules.test.ts:572`), which asserts a lowering and not an arity or `void` diagnostic.
- Test bodies, face 2 exact: `rg -n 'array<\{a\sb: integer\}, ' tests` → **0**.
- Test bodies, face 3 exact: `rg -n '\{a\sb: integer\}, void' tests` → **0**. `rg -n 'integer\}, void>' tests` → 2 hits, both the well-formed `Result<{a: integer}, void>` (`tests/generic-argument-bracket-group-truncation.test.ts:571`, `:589`).
- Test bodies, the a2 rename spelling: `rg -n 'Result<\{a as .w.: integer\}, ' tests` → **0**.
- Test bodies, template-built fixtures: `rg -n '(array|Result)<\$\{[^}]*\}, ' tests | wc -l` → **5**, none of them 0235's. They are b0262 r8, b0274 F1/E9, bug 0237's r4 (`{a: , Zs: string}`) and an unresolved-annotation cell.
- Test titles and comments: `rg -n '0235' tests` → **3** hits, all comments (`generic-argument-bracket-group-truncation.test.ts:358`, `:653`, and `inline-object-empty-field-type-truncation.test.ts:945`, which disclaims 0235's frame).
- Test filenames: `find tests -iname '*0235*' | wc -l` → 0. `find tests -iname '*malformed-inline-field*' | wc -l` → 0. `find tests -iname '*truncates*' | wc -l` → 0.
- Bug-doc witness lines: the record has no `## Fix (` section. `rg -n 'tests/' docs/bugs/0235-malformed-inline-field-truncates-generic-argument-list.md | wc -l` → 23, all pre-fix lock/affected lists or §Fix constraints, none presented as the discharge's witness.
- Coverage matrix / AGENTS.md: `rg -c '0235' docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md AGENTS.md` → no output (0 in each).
- CHANGELOG (corroboration only): `rg -n '0235' CHANGELOG.md` → 1 hit, :3446 "(recorded for bug 0235)", inside another entry.
- Evidence path: `git ls-files .pi/tmp | wc -l` → 0. `git check-ignore -v .pi/tmp/fixes/0235-report.md` → `.gitignore:32:.pi/tmp/`.

## Why this is a problem
Every other fixed record in this shard names a witness file that asserts its claimed observables, and this record's own §Fix (f) specified one. The discharge instead rests its per-row claims on a one-off measurement at a sha. Its only file citation points outside the tracked tree. For faces 2 and 3 (the over-applied `array` refused for arity, and the `void` tail walked) nothing in the default suite would red if the behaviour regressed. The "closed all three faces" wording is therefore stronger than the citable evidence, which covers face 1 only, through two sibling reports' cells.

## Suggested direction (non-binding, optional)
Either name the existing face-1 cells (0236's d5, 0233's f2) in the discharge note and narrow its wording to what they cover, or route the face-2/face-3 rows to a witness so the note can cite it.

## False-positive check
- Representations covered: bug-doc witness lines (0235 and 0231's 0235 mention), test bodies (six shaped `rg` searches, including template-built fixtures), test titles and comments (`rg '0235'`), test filenames (three `find` shapes), coverage-matrix rows (both files), AGENTS.md gate names, CHANGELOG (corroboration), and the cited `.pi/tmp` path's tracked status. Each is stated above with its hit count.
- Witnesses opened: 0236's d5 and a13 cells, 0233's f2 cell, the V2a-T arity group, and 0231's resync witness b2/b2c.
- This is not the honesty-marker case: the record does not mark faces 2/3 as pending. It states them closed.
- This filing does not adjudicate whether faces 2 and 3 behave correctly today. It is filed only because the record's claim has no citable witness.
- Not already filed: `grep -rlE "docs/bugs/023[2-9]" quality/intake quality/issues quality/resolved` finds only the 6184e7c3 0159/0160 filing and resolved D7 test-harness items. None cites 0235's Status or discharge.

## Triage
verdict: questionable — the claim and every stated search reproduce: 0235 :3-22 discharge note, §Fix (f) at :580-584, V2a-T has 0 malformed cells, the face-2 exact search returns 0, face-3 returns 0, the 18→0 filter holds, `.pi/tmp` is gitignored, and fe3c53cf adds no 0235 cells. My own searches also found no face-2/3 witness. `array<\{[^}]*\}\s*,` minus well-formed interiors gives 0; 0231 (D) d1–d4 and 0237 (C) c1–c5 are all single-argument `array<SUBJECT>`; resync b2/b2c nest the arity inside a field; no it()/describe() titles, filenames, coverage-matrix rows or AGENTS.md entries mention it. Face 1 is witnessed: generic-argument-bracket-group-truncation.test.ts cell "d5 NO-MOVE bug 0233's raw-key row at the brace carrier" and generic-argument-inline-field-key-rules.test.ts cell "f2 Result argument, boundary named and not claimed". Faces 2 and 3 are genuinely unwitnessed, so fixing the record means rewording "closed all three faces" or adding new witnesses. That is a human's ruling (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (unwitnessed-claim). APPEND EXACTLY the following block at the very end of docs/bugs/0235-malformed-inline-field-truncates-generic-argument-list.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The discharge above (closed all three faces by the bug 0231 fix) is cell-witnessed for face 1 only (the d5 NO-MOVE cell in tests/generic-argument-bracket-group-truncation.test.ts and the f2 boundary cell in tests/generic-argument-inline-field-key-rules.test.ts). Faces 2 and 3 (the over-applied arity refusal spellings) have no witness cell, filename, title, coverage-matrix row or gate anywhere in the tree; their closure rests on the shared-path reasoning in the bug 0231 record, not on cells.
