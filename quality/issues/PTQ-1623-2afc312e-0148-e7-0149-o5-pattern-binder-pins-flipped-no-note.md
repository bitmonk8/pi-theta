---
id: PTQ-1623
title: "Bug 0148's 0.81.0 fix record says row e7 \"pins [bug 0141's] claim still open\" at a silent `match` pattern binder, and bug 0149's 0.82.0 record says the pattern binder stays silent under row o5, but 2afc312e (bug 0141) rewrote both cells to assert a refusal and added no note to either record"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1039-1042
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1192-1194
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1209-1210
  - docs/bugs/0149-field-name-case-positions-unenforced.md:1404-1408
  - tests/fn-param-name-reserved-keyword.test.ts:818-831
  - tests/schema-field-name-case.test.ts:516-522
  - docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md:1069-1075
  - docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md:1083-1089
  - docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md:1105
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0148's 0.81.0 fix record says row e7 "pins [bug 0141's] claim still open" at a silent `match` pattern binder, and bug 0149's 0.82.0 record says the pattern binder stays silent under row o5, but 2afc312e (bug 0141) rewrote both cells to assert a refusal and added no note to either record

## Observation
Bug 0148's `## Fix (0.81.0)` cites row e7 of `tests/fn-param-name-reserved-keyword.test.ts` as a tripwire. It says e7 pins the `match` pattern binder silent, protecting open bug 0141's claim ("row e7 pins its claim still open"). Bug 0149's `## Fix (0.82.0)` cites row o5 of `tests/schema-field-name-case.test.ts` as pinning that "the `match` pattern binder stay[s] silent". Commit 2afc312e (fix(bug-0141), v0.146.0) rewrote both cells. e7 now asserts `[RESERVED]` and o5 now asserts one `theta/parse/capitalised-pattern-head` diagnostic. Both cell ids still resolve, but each asserts the opposite of the record's wording. Bug 0141's record lists both flips and says "Discharge notes appended: none". Neither 0148 nor 0149 has a post-fix note about bug 0141's delivery or the new code.

## Evidence
Claim side, `docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1039-1042`:
```
  4. **e7 — the `match` pattern binder.** OUT, and protected. It is bug 0141's
     §Fix (a) half 2 in terms; taking it would take another open report's
     deliverable without coordinating. Its site (`parsePattern`'s tail arm,
     now `:3931` / `:3983`) is untouched. Tripwire `e7`.
```
`:1192-1194`:
```
- **Discharge notes appended:** none. Bug 0044's family (a `Type` position) is
  untouched and its four emitters are byte-unchanged; bug 0141's
  `parsePattern` tail arm is untouched and row e7 pins its claim still open;
```
`:1209-1210`:
```
  (`ck1`–`ck3`); and the seven out-of-scope identifier positions (`e4`, `e4p`,
  `e5`, `e6`, `e7`, `e8`, `e9a`, `e9b`, `e10`).
```
Claim side, `docs/bugs/0149-field-name-case-positions-unenforced.md:1404-1408`:
```
- **Pinned dispositions / non-goals** — unchanged and re-measured after the
  fix: the `enum` variant name stays silent (row g2, `lexical.md:15`'s bullet
  and the other code); the `for` / `par for` variable and the `match` pattern
  binder stay silent (rows o4, o5 — `lexical.md:16`'s list contains neither and
  `type-layer-checks.ts` depends on the exclusion); the wire-name half stays
```

Witness today, `tests/fn-param-name-reserved-keyword.test.ts:818` and `:826-830` (`git blame -s -L 818,818` → 2afc312eb):
```
  it("e7: a `match` pattern binder spelled `match` draws bug 0141's reserved-keyword refusal, not this report's", () => {
...
    const doc = theta("let v = 1\nlet r = match v { match => 1 }\nr\n");
    expect(
      codesOf(doc),
      `the pattern binder's refusal is bug 0141's, from \`parsePattern\`'s tail arm, not this report's parameter-position rule; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
```
`git show 2afc312e -- tests/fn-param-name-reserved-keyword.test.ts` shows the prior form: `-  it("e7: a \`match\` pattern binder spelled \`match\` reports nothing — bug 0141's claim", () => {` … `-    ).toEqual([]);`.

`tests/schema-field-name-case.test.ts:516-521` (`git blame -s -L 509,523` → lines 516, 520 and 521 are 2afc312eb):
```
  it("o5: a `match` pattern binder `Q` draws only the pattern-head refusal, never this rule's codes", () => {
    const doc = theta("let v: integer = 3\nlet r = match v { Q => 1 }\nr\n");
    expect(
      rendered(doc),
      "a `match` pattern binder is not in lexical.md:16's list, so the sole code here is expressions.md's pattern-grammar refusal from `parsePattern`",
    ).toEqual([diag("error", PATTERN_HEAD, msg(PATTERN_HEAD, [["<name>", "Q"]]), 5, 19, 20)]);
```
The prior form, from the same `git show`, for the schema file: `-  it("o5: a \`match\` pattern binder \`Q\` reports nothing", () => {`.

The flipping commit's own ledger, `docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md:1072-1075`:
```
    `tests/fn-arg-type-mismatch-wired.test.ts` u13c, u13d, u13mb, u13mc (bug
    0050 §Fix (e)); `tests/fn-param-name-reserved-keyword.test.ts` e7;
    `tests/fn-param-name-case.test.ts` c2;
    `tests/schema-field-name-case.test.ts` o5, b3;
```
and `:1105`: `- **Discharge notes appended:** none.` `git show --stat 2afc312e` lists both test files. It lists no `docs/bugs/0148-*` or `docs/bugs/0149-*` file.

Searches run in this session:
- `grep -c "capitalised-pattern-head"` over both records → 0 and 0.
- `grep -c "0141" docs/bugs/0149-field-name-case-positions-unenforced.md` → 0.
- `grep -n "0141" docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md | grep -i "fixed\|deliver\|0.146"` → 0 hits (exit 1). `grep -n "0141"` on 0148 → 17 hits (`:81` through `:1193`); none post-dates the 0.81.0 fix section or records 0141 as fixed.
- `grep -n "^## \|^### "` over both records → the only post-fix sections are the 8e68a0d5 citation-drift correction notes (0148 `:843`, 0149 `:999`) and 0148's `:1212` bug 0274 e10 coordination note. None addresses e7 or o5.

## Why this is a problem
Both records use these rows as evidence of a silent position. 0148 goes further and presents e7 as protecting a claim "still open". Following either pointer lands on a cell that asserts a refusal: bug 0141's delivered emission at e7, and a new registered code at o5. 0148 already carries a dated coordination note for a comparable tripwire flip (`:1212`, bug 0274's e10). So these two flips are the records' unmarked divergences from their own witness wording, not a gap in house practice.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0148 and to 0149, in the shape of 0148's `:1212` note, naming 2afc312e / bug 0141 as the flip of e7 and o5. The note should state what each row now pins and that each record's own subject is unmoved.

## False-positive check
- Pin existence: both row ids are present by `it(` title. This is a changed-assertion decay, not a missing cell. Blame on the title lines gives 2afc312eb.
- Commit intent: 2afc312e's message lists "e7, c2, o5, b3, g4 under 0141's own authority" as flips. 0141's record (`:1083-1089`) says each row's premise is preserved (lexical.md:16's list does not reach a binder). This filing does not dispute that premise. The decayed wording is the records' "stay silent" and "pins its claim still open", not their rationale.
- 0149's b3 was also edited by 2afc312e, but 0149 cites b3 only as a face-2 case-code witness. That still holds (row b3 still asserts the key's case code). Not listed.
- Representations covered: bug-doc Fix/pinned-disposition lines in both records (quoted), test titles and assertions in both witness files (read at the cited lines, with prior forms from `git show`), post-fix note headings in both records (heading grep above), and the flipping record's ledger (0141 `:1069-1075`, `:1105`). CHANGELOG was not used.
- Other filings: `grep -rl "2afc312e" quality/intake quality/issues` → 0 files. `grep -l "0148-reserved\|0149-field-name" quality/intake/*.md quality/issues/*.md` → 0 files before this wave's filings.
- The eight other 0148 cells and five 0149 cells flipped by 71409cac (bug 0153) are a different commit and are filed separately (qw20260928081617-d10-01).

## Triage
verdict: questionable — decay verified: 0148 Fix (0.81.0) :1039-1042/:1192-1194/:1209-1210 and 0149 Fix (0.82.0) :1404-1408 cite e7/o5 as silent pins ('pins its claim still open', 'stay silent'). git blame puts both it() titles at 2afc312eb (fix(bug-0141), v0.146.0), and git show shows 'reports nothing'/toEqual([]) flipped to [RESERVED] and a PATTERN_HEAD diag. 2afc312e touched neither record (its stat lists only docs/bugs/README.md). 0141 :1072-1075 lists e7/o5 and :1105 says 'Discharge notes appended: none'. 0148/0149 have 0 capitalised-pattern-head hits and no post-fix note on e7/o5. No same-sha filing exists (d10-01 71409cac explicitly excludes e7/o5). But both cells still resolve by id and no silent-pin equivalent exists to re-point to, so the repair is a new dated coordination note, not a mechanical re-point: the record's wording is a human's to change. The candidate lacked a ## Triage heading, so triage added one (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). Two appends, nothing else; every existing line stays byte-identical. (1) APPEND at the very end of docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:

### Coordination note — 2026-09-28, bug 0141 (0.146.0)

Commit 2afc312e (bug 0141 fix, v0.146.0) flipped witness row e7 in tests/fn-param-name-reserved-keyword.test.ts from the silent pattern-binder pin cited above to the reserved-keyword refusal plus the capitalised-pattern-head diagnostic. The Fix (0.81.0) wording above stands as a dated record; current disposition: docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md.

(2) APPEND at the very end of docs/bugs/0149-field-name-case-positions-unenforced.md:

### Coordination note — 2026-09-28, bug 0141 (0.146.0)

Commit 2afc312e (bug 0141 fix, v0.146.0) flipped witness row o5 in tests/schema-field-name-case.test.ts from the silent pattern-binder pin cited above to the reserved-keyword refusal plus the capitalised-pattern-head diagnostic. The Fix (0.82.0) wording above stands as a dated record; current disposition: docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md.
