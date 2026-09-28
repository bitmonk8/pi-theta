---
id: pending
title: "Bug 0148's 0.81.0 fix record cites tripwire rows e4/e4p/e5/e6/e8/e9a/e9b as pinning silence and e14 as pinning the `'in'` misfire, and bug 0149's 0.82.0 record cites f6/f14/p4/p7/p8 as pinning both faces silent on a reserved spelling. 71409cac (bug 0153) rewrote all thirteen cells to assert `theta/parse/reserved-keyword-as-identifier` and added no note to either record"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1026-1046
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1155-1158
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1170-1185
  - docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1201-1210
  - docs/bugs/0149-field-name-case-positions-unenforced.md:1247-1250
  - docs/bugs/0149-field-name-case-positions-unenforced.md:1413-1415
  - tests/fn-param-name-reserved-keyword.test.ts:738-878
  - tests/fn-param-name-reserved-keyword.test.ts:929-970
  - tests/schema-field-name-case.test.ts:434-464
  - tests/schema-field-name-case.test.ts:752-793
  - docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md:1047-1056
  - docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md:1148-1150
sites: 13
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0148's 0.81.0 fix record cites tripwire rows e4/e4p/e5/e6/e8/e9a/e9b as pinning silence and e14 as pinning the `'in'` misfire, and bug 0149's 0.82.0 record cites f6/f14/p4/p7/p8 as pinning both faces silent on a reserved spelling. 71409cac (bug 0153) rewrote all thirteen cells to assert `theta/parse/reserved-keyword-as-identifier` and added no note to either record

## Observation
Bug 0148's `## Fix (0.81.0)` names rows e4, e4p, e5, e6, e8, e9a and e9b of `tests/fn-param-name-reserved-keyword.test.ts` as over-reach tripwires that pin those identifier positions silent. It also names row e14 as the pin for the lexer's `'in'` misfire. Bug 0149's `## Fix (0.82.0)` says rows f6, f14, p4, p7 and p8 of `tests/schema-field-name-case.test.ts` "pin both faces silent on a reserved spelling". Commit 71409cac (fix(bug-0153), v0.194.0) retook all thirteen cells to assert the firing `theta/parse/reserved-keyword-as-identifier` row. The cells still resolve by id, but each now asserts the opposite of what the record says it pins. Neither record has a note naming 0153 or the retake. 0148 contains 0 occurrences of `0153`. 0149's only two occurrences are in its pre-flip "no note owed" bullet. Bug 0153's own record says no discharge notes were appended to either document.

## Evidence
Claim side, bug 0148, `docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:1026-1033`, with `:1034-1045` continuing the same list through e5, e6, e8, e9a and e9b, each "Tripwire":
```
- **The disposition of the other silent identifier positions (§Fix (b)) — all
  seven OUT, each pinned as an over-reach tripwire row.** The fix closes the
  `fn` parameter NAME position alone, which is what this report's claim, its
  witness and its Sev/Diff estimate are scoped to.
  1. **e4 / e4p — the `for` and `par for` iteration variable.** OUT. Unclaimed
     by any report; row e14 measures the lexer's `let`-adjacency already
     misfiring at this position (naming `in`), so closing it here would land
     beside unfiled adjacent machinery. Tripwires `e4`, `e4p`.
```
`:1155-1156` (Verification):
```
  - Independently re-run: the corpus sweep (zero hits), the "no existing
    assertion changed" check, the seven tripwire positions still silent, and
```
`:1170-1176` and `:1183-1185` (Residuals 2 and 4):
```
  2. **The six unclaimed silent identifier positions** (§Fix (b) items 1, 2, 3,
     5, 6 above: the `for` / `par for` variable, the schema field name, the
     `params:` field name, the `enum` variant name, and both `import`
     specifier forms). Each is measured silent, each is inside
     `lexical.md:20`'s unqualified sentence and the position-free *Trigger*,
     and each is now pinned by a tripwire row that reds if enforcement widens
     without a decision. ...
  4. **Row e14's misfire is unchanged.** `for let in xs { 1 }` still emits the
     code against `'in'` rather than `let`, from the lexer's `let` adjacency.
     Pinned by a tripwire so it cannot move silently. §Non-goals, unfiled.
```
`:1201-1210` (Pinned dispositions):
```
- **Pinned dispositions / non-goals**, each with the witness row that reds if
  it moves: ... the `for`-variable misfire (`e14`);
  ... and the seven out-of-scope identifier positions (`e4`, `e4p`,
  `e5`, `e6`, `e7`, `e8`, `e9a`, `e9b`, `e10`).
```

Claim side, bug 0149, `docs/bugs/0149-field-name-case-positions-unenforced.md:1247-1250`:
```
  remove. Rows f6, f14, p4, p7, p8 pin both faces silent on a reserved spelling
  and k6 pins which arm owns the input on a path this fix does not touch.
  `schema S { let: string }` and `params: Ok: string` therefore still load
  clean; that input class is unclaimed here (§Non-goals) and unmoved.
```
`:1413-1415`:
```
  that is not identifier-shaped stays outside the *Trigger* (row q2); and
  `theta/parse/reserved-keyword-as-identifier` at either field position stays
  unclaimed (rows f6, f14, p4, p7, p8).
```

Witness today. `git blame -s` attributes each of these `it(` title lines to 71409cac6: `tests/fn-param-name-reserved-keyword.test.ts` lines 744 (e4), 765 (e4p), 779 (e5), 797 (e6), 833 (e8), 848 (e9a) and 864 (e9b), and `tests/schema-field-name-case.test.ts` lines 434 (f6), 451 (f14), 752 (p4), 767 (p7) and 783 (p8). Samples:

`tests/fn-param-name-reserved-keyword.test.ts:744-745`, `:756-760`:
```
  it("e4: a `for` iteration variable named `string` draws bug 0153's refusal, ranged on the variable", () => {
    // RETAKEN by bug 0153
...
    const doc = theta("let xs = [1]\nfor string in xs { 1 }\n1\n");
    expect(
      codesOf(doc),
      `the \`for\` variable is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
```
`:779`, `:788-792` (e5; e6, e8, e9a and e9b have the same `).toEqual([RESERVED]);` shape at `:809-813`, `:839-843`, `:855-859` and `:871-875`):
```
  it("e5: a schema field NAME spelled `let` draws bug 0153's refusal, ranged on the name token", () => {
...
    const doc = theta("schema S { let: string }\n1\n");
    expect(
      codesOf(doc),
      `the schema field NAME is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
```
`:929`, `:962-965` (e14; 71409cac first retook it, and 679870ca / bug 0242 later retook it again, per its own comment at `:930-935` and `:938`):
```
  it("e14: `for let in xs { 1 }` names `let` at its own range, and names nothing else", () => {
...
    expect(
      doc.diagnostics.map((d: Diagnostic) => d.message),
      `the sole diagnostic names the offending variable \`let\`, not the \`in\` the author had no choice about; diagnostics=${render(doc)}`,
    ).toEqual([reservedMsg("let")]);
```
`tests/schema-field-name-case.test.ts:434`, `:444-448` (f6; f14 `:460-463`, p4 `:760-764`, p7 `:777-780` and p8 `:789-792` each assert `diag("error", RESERVED_KEYWORD, …)`):
```
  it("f6: a reserved keyword at the field position now draws reserved-keyword-as-identifier (bug 0153)", () => {
...
    const doc = theta("schema S { let: string }\n");
    expect(
      rendered(doc),
      "bug 0153 (lexical.md:20) now refuses a keyword-shaped field name at declaration",
    ).toEqual([diag("error", RESERVED_KEYWORD, msg(RESERVED_KEYWORD, [["<keyword>", "let"]]), 4, 12, 15)]);
```

The retaking commit's own ledger, `docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md:1047-1050` and `:1053-1054`:
```
  - `tests/fn-param-name-reserved-keyword.test.ts` — the eight tripwire rows
    §Reproduction (h) names (`e4`, `e4p`, `e5`, `e6`, `e8`, `e9a`, `e9b`,
    `e14`) **retaken in place**, each strengthened from `toEqual([])` to the
...
  - `tests/schema-field-name-case.test.ts` — bug 0149's five coordination
    rows (`f6`, `f14`, `p4`, `p7`, `p8`) retaken to the firing rows, the
```
`:1148-1150`:
```
- **Discharge notes appended:** none. The sibling documents this fix rebases
  against (bug 0148's witness rows, bug 0149's coordination rows) are
  discharged by the retaken rows themselves, not by prose in those documents.
```
`git show --stat 71409cac` lists `tests/fn-param-name-reserved-keyword.test.ts` and `tests/schema-field-name-case.test.ts`. It lists no `docs/bugs/0148-*` or `docs/bugs/0149-*` file.

Searches run in this session:
- `grep -c "0153" docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md` → 0.
- `grep -n "0153" docs/bugs/0149-field-name-case-positions-unenforced.md` → 2 hits (`:1398`, `:1402`), both in the 0.82.0 "no note owed" bullet written before the flip.
- `grep -ci "retaken\|retake"` over both records → 0 and 0.
- `grep -n "^## \|^### "` over both records → 0148 ends with `## Coordination note (0.272.0) — cell e10's silence flipped to a refusal` (`:1212`), which covers bug 0274's e10 flip only. 0149's last heading is `## Fix (0.82.0)` (`:1115`). The only other post-fix headings are the 8e68a0d5 `### Correction note — citation drift` sections (0148 `:843`, 0149 `:999`), which cover `lexer.ts` line citations.

## Why this is a problem
Each record uses these row ids as proof that the out-of-scope positions stay pinned silent. The same cells now prove the opposite, so a reader who follows the pointer finds refusals where the record promised `[]`. The house practice for a flipped tripwire is shown in the same record: 0148's `:1212` dated coordination note for bug 0274's e10 flip, citing a "0165/0251 precedent". That note leaves the other eight flipped 0148 cells, and all five 0149 cells, with no note. Bug 0153's reason, "discharged by the retaken rows themselves", means the correction lives only in test comments. The two fix records' own witness sentences still point at the silent-pin reading.

## Suggested direction (non-binding, optional)
Append a dated coordination note to each record, in the shape of 0148's `:1212` note, that names 71409cac / bug 0153 and the cells it retook: the eight in 0148, with e14's later 0242 retake, and the five in 0149. Each record's subject rows (0148's a/b/c/d/ck rows, 0149's face-1/face-2 case rows) should be stated as unmoved.

## False-positive check
- Pin existence: every cited row id is still present by `it(` title in the witness files. This is a changed-assertion decay, not a missing cell. `git blame -s` on each title line gives 71409cac6, except e14 (679870caa, the later bug 0242 retake of the same cell 71409cac first flipped).
- Commit intent: `git show --stat 71409cac` confirms it edited both test files and neither record. Its message says "0148/0149 tripwire rows retaken and strengthened (e-rows, f6/f14/p4/p7/p8)".
- Stated no-note disposition: bug 0153 `:1148-1150` records the choice not to annotate. This filing does not dispute that choice for 0153. It records that the 0148/0149 witness claims no longer match their cells, and that the 0148 record annotates a comparable flip (e10).
- Representations covered: bug-doc Witness/Fix lines in 0148 and 0149 (quoted), test file names and it()/describe() titles (the two witness files, read at the cited lines), post-fix note headings in both records (heading grep above), and the retaking record's ledger (0153 `:1047-1056`, `:1148-1150`). CHANGELOG was not used.
- Other filings: `grep -l "0148-reserved\|0149-field-name" quality/intake/*.md quality/issues/*.md` → 0 files. `grep -rl "71409cac" quality/intake quality/issues` → 0 files.
- e7 and bug 0149's o5 were flipped by a different commit (2afc312e, bug 0141). They are left out here and filed separately.

## Triage
verdict: questionable — decay verified: 0148's Fix (0.81.0) (:1026-1045, :1155-1158, :1170-1185, :1201-1210) and 0149's Fix (0.82.0) (:1247-1250, :1413-1415) cite e4/e4p/e5/e6/e8/e9a/e9b/e14 and f6/f14/p4/p7/p8 as silent/misfire pins; git blame puts all 13 it() titles at 71409cac6 (e14 later at 679870caa, bug 0242), and each now asserts [RESERVED]/diag(RESERVED_KEYWORD); 0148 has 0 "0153" hits, 0149 has 2 (pre-flip no-note bullet :1398/:1402), and 71409cac touched neither record (0153 :1148-1150 chose "Discharge notes appended: none"). But the cells still resolve by id and no silent-pin equivalent exists to re-point to, so the repair is a dated coordination note (new prose that overrides 0153's recorded no-note disposition), not a mechanical re-point: the record's wording is a human's to change. No same-sha filing exists (the sibling d10-02 covers 2afc312e e7/o5 only). The candidate lacked a ## Triage heading, so triage added one (triage: claude-opus-5-5)
