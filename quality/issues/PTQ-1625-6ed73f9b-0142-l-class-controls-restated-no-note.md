---
id: PTQ-1625
title: "Bug 0142's 0.80.0 fix record cites `L1c`–`L4c` as proving the non-numeric `/` flip is \"keyed to the operator and not to the operand kinds\" and says each L-row \"is `[]` with the arm removed\", but 6ed73f9b (bug 0332) re-pinned all four `-` controls to assert the arithmetic-operand refusal, and 0142 has no note recording this"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0142-division-result-type-not-number.md:1211-1213
  - docs/bugs/0142-division-result-type-not-number.md:1122-1130
  - tests/division-result-type-number.test.ts:969-995
  - tests/division-result-type-number.test.ts:1011-1020
  - tests/division-result-type-number.test.ts:1038-1047
  - tests/division-result-type-number.test.ts:1074-1085
  - docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md:201-206
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0142's 0.80.0 fix record cites `L1c`–`L4c` as proving the non-numeric `/` flip is "keyed to the operator and not to the operand kinds" and says each L-row "is `[]` with the arm removed", but 6ed73f9b (bug 0332) re-pinned all four `-` controls to assert the arithmetic-operand refusal, and 0142 has no note recording this

## Observation
Bug 0142's `## Fix (0.80.0)` cites cells `L1c`/`L2c`/`L3c`/`L4c` as witnesses under "Pinned dispositions / non-goals, each measured as NOT moved and witnessed". The claim is that `-` keeps the operand-common widening, which proves the L-class flip is keyed to the operator. When 0142 shipped, each control asserted `toEqual([])` because `-`'s common type stayed compatible with the annotation. Commit 6ed73f9b (bug 0332, v0.299.0) re-pinned all four controls. Each now asserts a `theta/parse/non-numeric-arithmetic-operands` refusal on the `-` spelling, reached before the sink the control measured. The same commit added that refusal to L1–L4 themselves, so the record's "Each is `[]` with the arm removed" no longer describes those cells. The 0142 record has not been edited since 4d072c83.

## Evidence
Claim side, `docs/bugs/0142-division-result-type-not-number.md:1211-1213`:
```
  - **`-`, `*` and `%` keep the operand-common widening** — cells `t2`, `t3`,
    `t4`, `a10`–`a12`, `b4`, with `L1c`/`L2c`/`L3c`/`L4c` proving the L-class
    flip is keyed to the operator and not to the operand kinds.
```
`docs/bugs/0142-division-result-type-not-number.md:1122-1130`:
```
  - **A whole class of non-numeric-operand divisions now refuses at the direct
    sinks**, named nowhere in this document and now pinned as cells L1–L4 with
    `-` controls: `let s: string = "a" / "b"` and
    `let b: boolean = true / false` draw `let-rhs-type-mismatch`; a `string`
    schema field drawn from `"a" / "b"` draws `object-field-type-mismatch`;
    `let xs: array<string> = ["a" / "b"]` draws `let-rhs-type-mismatch` +
    `array-element-type-mismatch`. Each is `[]` with the arm removed. All are
    spec-correct — `"a" / "b"` evaluates to `NaN`, which is a `number` — and
    every code is already registered and `E`, so no registry row moves.
```

Evidence side, `tests/division-result-type-number.test.ts:969-995` (L1 / L1c, excerpt):
```
    ).toEqual([
      hit(LET_RHS_CODE, letRhsMessage("s", "string", "number"), letRange(doc, "s")),
      hit(ARITHMETIC_CODE, arithmeticMessage("/", "string", "string"), letInitRange(doc, "s")),
    ]);
    // Bug 0332: `-`'s reduction is still the operands' own common type
    // (`literal string`, `⊑ string`) — L1c's ORIGINAL subject — but the
    // operator now ALSO clears its own numeric-operand gate first, so the
    // control that used to prove "the flip is keyed to the operator, not the
    // operand kinds" by staying silent now proves it by drawing the SAME
    // refusal `-`'s own spelling earns everywhere else in this fix.
    const control = parse('let s: string = "a" - "b"\ns\n');
    ...
    ).toEqual([hit(ARITHMETIC_CODE, arithmeticMessage("-", "string", "string"), letInitRange(control, "s"))]);
```
`:1011-1020` (L2c): `` `L2c (control) — bug 0332: \`-\` over a non-numeric pair now refuses at parse. …` `` `).toEqual([hit(ARITHMETIC_CODE, arithmeticMessage("-", "boolean", "boolean"), letInitRange(control, "b"))]);`
`:1038-1047` (L3c): `` `L3c (control) — bug 0332: \`-\` over a non-numeric pair now refuses at parse. …` `` `).toEqual([hit(ARITHMETIC_CODE, arithmeticMessage("-", "string", "string"), objectFieldRange(control, "s"))]);`
`:1074-1085` (L4c):
```
    const control = parse('let xs: array<string> = ["a" - "b"]\nxs\n');
    ...
      `L4c (control) — bug 0332: \`-\` over a non-numeric pair now refuses at parse, anchored on the inner binary node. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(ARITHMETIC_CODE, arithmeticMessage("-", "string", "string"), arithmeticOpRange(control, "-")),
    ]);
```
Pre-image in the flipping commit: `git show 6ed73f9b -- tests/division-result-type-number.test.ts` removes four `L1c`…`L4c (control) — \`-\`'s reduction is the operands' own common type … which stays \`⊑ …\`` messages, each followed by `-    ).toEqual([]);`.

Enumeration on the flipping record, `docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md:201-206`:
```
1. `tests/division-result-type-number.test.ts` (bug 0142) — the b-table rows
   `"string  / string "` (`"a" / "b"`) and `"boolean / boolean"`
   (`true / false`) currently assert the `number` reading; cells L1/L1c,
   L2/L2c, L3/L3c, L4/L4c currently assert a downstream sink code for
   `"a" / "b"` / `true / false` and `[]` for the `"a" - "b"` controls; the
   `g("a" / "b")` / `g("a" - "b")` pair (`:1051`, `:1062`) likewise. All flip
```

Searches (all run this session):
- `git log --oneline -- tests/division-result-type-number.test.ts` → 9 commits. Among them `6ed73f9b fix(bug-0332): parse-time numeric-operand gate for spelled -,*,/,% — v0.299.0` is the one whose diff carries the `L1c`–`L4c` `toEqual([])` removals quoted above.
- `grep -c '0332' tests/division-result-type-number.test.ts` → 22.
- `grep -c '0332' docs/bugs/0142-division-result-type-not-number.md` → 0.
- `git log --oneline -- docs/bugs/0142-division-result-type-not-number.md` → 2 commits (4d072c83, 4032f3c1). No note was appended after 0.80.0.
- Coverage matrix / AGENTS.md: `grep -c '0142' docs/reference/coverage-matrix.md` → 0, `grep -c '0142' AGENTS.md` → 0.
- CHANGELOG (corroboration only): `grep -n "0332\b" CHANGELOG.md` → hits at `:1497`, `:1551` and `:1732` that describe later bugs referring to "the 0332 parse gate" and "the bug-0332 belt".

## Why this is a problem
The record cites `L1c`–`L4c` for one observable: `-` over the same operands stays silent at the sink because its operand-common widening is kept. At HEAD all four controls refuse before that sink is reached, so the cited cells no longer show the widening the bullet names. The "Each is `[]` with the arm removed" sentence describes L1–L4 cells that now also carry an arm-independent `ARITHMETIC_CODE` hit. The test file restates the subject in its own comments, but the fix record stays un-noted. A reader who follows 0142's pointer finds controls whose asserted observable contradicts the bullet's wording. The house pattern for this situation is a dated note on the superseded record (0145's `## Note (2026-09-02, 0.350.0)`, 0143's dated note), and 0142 has none.

## Suggested direction (non-binding, optional)
Add a dated note to 0142 recording that 6ed73f9b (bug 0332, v0.299.0) re-pinned L1–L4 and L1c–L4c onto `theta/parse/non-numeric-arithmetic-operands`, which moved the controls' evidence from silence to a same-code refusal. The same commit superseded `aStr` and the invoke companion's `divstr`/`substr` (`tests/division-result-type-number-invoke.test.ts:208-235`). Those are in the same class but are not cited as present-tense pins in 0142, so they are listed here only for the note's completeness.

## False-positive check
- Representations covered: bug-doc Fix-section pins (0142:1122-1130 and :1211-1213 quoted); test file name (exists); test titles and assertion messages (`L1`–`L4` `it()` strings and the `L1c`–`L4c` control messages, current and pre-image via `git show 6ed73f9b`); coverage-matrix rows (0 hits); AGENTS.md gate names (0 hits); CHANGELOG (corroboration only).
- Distinct from filing d10-01 of this shard: that finding concerns `t9`/`b8` flipped by 35b718cc (bug 0152). This one concerns `L1c`–`L4c` flipped by 6ed73f9b (bug 0332). The two have different commits and different cited cells.
- Not an honesty marker: the bullet sits under "each measured as NOT moved and witnessed" and carries no qualifier.
- Not already filed: no PTQ or pending candidate in the brief names 0142 or 6ed73f9b.
- The other cells this bullet cites (`t2`, `t3`, `t4`, `a10`–`a12`, `b4`) still assert `-`/`*`/`%` over numeric operands keeping `integer` (`:257` "t2, t3, t4: … keep the operand-common `integer`", `:544` "a10, a11, a12, aPlus … stay silent"). Only the L-controls clause is decayed.

## Triage
verdict: questionable — decay verified, but no equivalent re-point can repair it. 0142:1122-1130 and :1211-1213 reproduce verbatim. At HEAD, tests/division-result-type-number.test.ts:968-1087 (describe "bug 0142 F3 — a non-numeric `/` operand pair flips the direct sinks too", its L1–L4 its) has each L1c–L4c control asserting an ARITHMETIC_CODE `-` hit, and each L1–L4 cell asserting an extra arm-independent ARITHMETIC_CODE `/` hit. So neither "`[]` controls proving the widening" nor "Each is `[]` with the arm removed" still holds. `git show 6ed73f9b` removes the four `L1c…L4c … stays ⊑ …` / `toEqual([])` pairs. 0332:201-206 enumerates the flip. Every stated search reproduces: the test log has 9 commits including 6ed73f9b; the 0142 log is 4d072c83 and 4032f3c1; 0332 appears 22 times in the test file and 0 times in 0142; 0142 appears 0 times in coverage-matrix and AGENTS.md. The cells were re-pinned, not deleted (no D-filter deletion), so the fix is a supersession note or a reword of the record, which is a human's call. Not a duplicate: no other intake file or PTQ tracks 6ed73f9b (d10-01 names it only in its triage note, and its root cause is 35b718cc/t9/b8) (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0142-division-result-type-not-number.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0332 (0.299.0)

Commit 6ed73f9b (bug 0332 fix, v0.299.0) restated the L-class controls this record cites as [] proof that the non-numeric slash flip is keyed to the operator: L1c to L4c in tests/division-result-type-number.test.ts now each assert a parse-time arithmetic-operand hit for the minus arm, and L1 to L4 assert an extra arm-independent hit for the slash. The [] observable is gone. The Fix (0.80.0) wording above stands as a dated record; current disposition: docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md.
