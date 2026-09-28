---
id: pending
title: "Bug 0142's 0.80.0 fix record says `1 % 0` \"still reads `integer`\" and `let n: integer = 1 % 0` \"is still `[]`\" (cells `t9` and `b8`), but 35b718cc (bug 0152) retook both cells to assert `number` and `integer-narrowing`, and 0142 has no note recording this"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0142-division-result-type-not-number.md:1200-1205
  - tests/division-result-type-number.test.ts:285-308
  - tests/division-result-type-number.test.ts:700-753
  - docs/bugs/0152-modulo-zero-result-type-not-number.md:1233-1235
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0142's 0.80.0 fix record says `1 % 0` "still reads `integer`" and `let n: integer = 1 % 0` "is still `[]`" (cells `t9` and `b8`), but 35b718cc (bug 0152) retook both cells to assert `number` and `integer-narrowing`, and 0142 has no note recording this

## Observation
The "Pinned dispositions / non-goals, each measured as NOT moved and witnessed" block in bug 0142's `## Fix (0.80.0)` names cells `t9` and `b8` of `tests/division-result-type-number.test.ts` as the witnesses that `%` by a literal zero does not move. Commit 35b718cc (bug 0152, v0.187.0) rewrote both cells so they assert the opposite disposition. `t9` now expects `NUMBER_READING`, and the `b8` row now expects an `integer-narrowing` hit. The 0142 record has not been edited since its fix commit (4d072c83), so the pin now points at cells that assert the reverse of what the record says they witness. Bug 0152's own record says it chose to leave 0142 unchanged.

## Evidence
Claim side, `docs/bugs/0142-division-result-type-not-number.md:1200-1205`:
```
- **Pinned dispositions / non-goals, each measured as NOT moved and witnessed:**
  - **`%` by a literal zero does not move.** `1 % 0` still reads `integer` and
    `let n: integer = 1 % 0` is still `[]` — cells `t9` and `b8`. §Non-goals'
    reason is honoured: it is a different sentence whose static decidability
    depends on the divisor's *value*, and this run developed no new evidence
    changing its standing.
```

Evidence side, `tests/division-result-type-number.test.ts:285-308` (cell `t9`, excerpt):
```
  it("t9: `1 % 0` reads `number` — RETAKEN by bug 0152", () => {
    // RETAKEN. This cell pinned the OPPOSITE reading while bug 0142's own
    // §Non-goals left the disposition open: ...
    expect(
      reading("1 % 0\n", "t9"),
      "t9 — RETAKEN by bug 0152 route A: a literal integer-zero divisor widens the `%` result to `number` (expressions.md:234). ...",
    ).toBe(NUMBER_READING);
```
`tests/division-result-type-number.test.ts:700-753` (the `b8` row, excerpt):
```
  it("b3, b4, b9 must NOT move; b8 RETAKEN by bug 0152", () => {
    ...
    // b8 is RETAKEN. It pinned `let n: integer = 1 % 0` as SILENT while bug
    // 0142's §Non-goals left the `%`-by-literal-zero disposition open — ...
    // so this row now draws the `integer-narrowing` its `1.5` control (b2
    // above) has always drawn, anchored on the same `let` statement.
    ...
        if (!cell.startsWith("b8 ")) {
          return `${cell} -> []`;
        }
        ...
          hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n")),
```
The flipping commit: `git show 35b718cc -- tests/division-result-type-number.test.ts` shows `-  it("t9: \`1 % 0\` does NOT move — §Non-goals", ...` → `+  it("t9: \`1 % 0\` reads \`number\` — RETAKEN by bug 0152", ...`, `-    ).toBe(INTEGER_READING);` → `+    ).toBe(NUMBER_READING);`, and `-  it("b3, b4, b8, b9: the rows at this sink that must NOT move", ...` → `+  it("b3, b4, b9 must NOT move; b8 RETAKEN by bug 0152", ...`.

Retaking record, `docs/bugs/0152-modulo-zero-result-type-not-number.md:1233-1235`:
```
- **Discharge notes appended:** none. Bug 0142's own record is unchanged; its
  two pinned cells were retaken in its witness file, which is what those cells
  were written for (§Fix (d)).
```

Searches (all run this session):
- `git log --oneline -S"RETAKEN by bug 0152" -- tests/division-result-type-number.test.ts` → 1 commit, `35b718cc fix(bug-0152): ... — v0.187.0`.
- `git log --oneline -- docs/bugs/0142-division-result-type-not-number.md` → 2 commits (4d072c83 the fix, 4032f3c1 the filing). The record has not been touched since 0.80.0.
- `grep -c '0152' docs/bugs/0142-division-result-type-not-number.md` → 0. The record never mentions the retaking bug.
- `grep -c 'RETAKEN' tests/division-result-type-number.test.ts` → 8.
- Coverage matrix / AGENTS.md: `grep -c '0142' docs/reference/coverage-matrix.md` → 0, `grep -c '0142' AGENTS.md` → 0. No other representation carries this pin.
- CHANGELOG (corroboration only): `CHANGELOG.md:3465` `## [0.187.0]` and `:3469` "Bug 0152 — `%` by a static-zero integer divisor now draws …".

## Why this is a problem
The record frames `t9`/`b8` as the witnesses for "`%` by a literal zero does not move". A reader who follows the pointer finds both cells asserting that it does move (`number`, `integer-narrowing`). So the chain from claim to evidence now proves the opposite of the claim. This house records such retakes on the superseded record with a dated coordination or discharge note: 0142's sibling 0145 carries `## Note (2026-09-02, 0.350.0)` for its re-anchored f8, and 0143 carries a dated note for its re-anchored live cell. 0142 has no such note. The other bullets in the same block (`c17`/`c18`/`h5`, `t10`/`aPlus`/`b9`) still resolve as stated (`:931-948` asserts `["c17 -> []", "c18 -> []"]`), so the decay is limited to this bullet.

## Suggested direction (non-binding, optional)
Add a dated note to 0142 saying that 35b718cc (bug 0152 route A, v0.187.0) retook `t9` and `b8`, and that the `%`-by-literal-zero disposition is now bug 0152's. Its witness is `tests/modulo-zero-result-type-number.test.ts`, which exists in the tree.

## False-positive check
- Representations covered: bug-doc Fix-section pins (0142:1200-1205 quoted); test file name (`tests/division-result-type-number.test.ts` exists); test titles (`t9` and `b3, b4, b9 … b8` `it()` strings, before and after, via `git show 35b718cc`); coverage-matrix rows (0 hits for 0142); AGENTS.md gate names (0 hits, not a gate claim); CHANGELOG (corroboration only).
- Not an honesty marker: the bullet sits under "each measured as NOT moved and witnessed", in present tense ("still reads", "is still"), and carries no pending/superseded qualifier.
- Not already filed: no pending candidate or PTQ in the brief's list names 0142 or 35b718cc.
- Truth is not adjudicated here. Only the pointer's resolution is in question. The equivalent current witness for 0152's disposition, `tests/modulo-zero-result-type-number.test.ts`, exists (`ls` succeeded).

## Triage
verdict: questionable — decay verified, but no equivalent re-point can repair it. 0142:1200-1205 reproduces verbatim. At HEAD, t9 (test :285-308) asserts `.toBe(NUMBER_READING)` and the `b3, b4, b9 must NOT move; b8 RETAKEN by bug 0152` row (:700-753) expects an integer-narrowing hit for b8. `git show 35b718cc` shows both flips (INTEGER_READING→NUMBER_READING; b8 dropped from the must-not-move title). Every stated search reproduces: -S RETAKEN→35b718cc only; 0142 log = 4d072c83 and 4032f3c1; 0152 in 0142 = 0; RETAKEN = 8; 0142 in coverage-matrix and AGENTS = 0; tests/modulo-zero-result-type-number.test.ts exists. The cells were rewritten, not deleted, and the claim's own wording ("still reads `integer`") is now inverted. The one named witness, tests/modulo-zero-result-type-number.test.ts, pins the opposite disposition, so it is no equivalent for this claim. The repair is a supersession note or a reword, not a mechanical re-point. 0152's record deliberately declined a note (0152:1233-1235, §Fix (d) :972-981), so whether to add one is a human's call. Not a duplicate: the lexicographically-first of three intake files citing 35b718cc; d10-02-6ed73f9b (L1c–L4c, 6ed73f9b) and d10-02-0151-0152 (GOV-15 sweep) have different root causes; no PTQ tracks it (triage: claude-opus-5-5)
