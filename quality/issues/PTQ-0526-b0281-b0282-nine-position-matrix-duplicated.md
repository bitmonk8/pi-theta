---
id: PTQ-0526
title: the nine-position `Position`/`POSITIONS`/`cells`/`expectMatrix` fixture-and-assertion table is duplicated byte-for-byte between b0281 and b0282
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:312-426
  - tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:227-342
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# the nine-position `Position`/`POSITIONS`/`cells`/`expectMatrix` fixture-and-assertion table is duplicated byte-for-byte between b0281 and b0282

## Observation
tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts and
tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts each
declare their own `Position` interface, a 56-line `POSITIONS` array
enumerating the same nine type-reference fixtures (`query-T-head`,
`query-E-arg`, `fn-return`, `fn-param`, `let-annot`, `invoke-ascr`,
`schema-field`, `schema-alias`, `params-field`), a `cells` function
projecting a spelling list across `POSITIONS`, and an `expectMatrix` function
asserting captures/codes/lines/registration over the resulting probe list.
The `POSITIONS` array bodies are confirmed byte-identical by `diff` across the
full 56 lines; `expectMatrix`'s body is confirmed byte-identical; `Position`
and `cells` differ only in a doc-comment wording and one added ternary in
`cells`'s `head` computation (`b0282` also strips a leading `<` test that
`b0281` does not need because its own spellings always contain `<`). Neither
file imports this table from the other or from any `tests/helpers/` module;
`tests/helpers/` holds no module exporting a `Position`/`POSITIONS`/`cells`/
`expectMatrix` bundle.

## Evidence

tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:328-334
— the start of the `POSITIONS` array:
```ts
const POSITIONS: readonly Position[] = [
  {
    id: "query-T-head",
    build: (sp) => theta(`query-T-head (${sp})`, `let r = @<${sp}>\`q\`\n"ok"`),
    decls: [],
    at: "6:9",
  },
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:244-250
— the same nine-entry array, same start:
```ts
const POSITIONS: readonly Position[] = [
  {
    id: "query-T-head",
    build: (sp) => theta(`query-T-head (${sp})`, `let r = @<${sp}>\`q\`\n"ok"`),
    decls: [],
    at: "6:9",
  },
```

Exact search: `diff <(sed -n '328,383p' tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts) <(sed -n '244,299p' tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts)`
→ 0 differences over the full 56-line array (all nine `Position` object
literals, in the same order, with the same `id`, `build`, `decls` and `at`
values).

tests/b0281-...:403-408 and tests/b0282-...:319-324 — `expectMatrix`, body
confirmed byte-identical by the same `diff`:
```ts
function expectMatrix<T extends { position: Position; row: LoadRow }>(
  probes: readonly T[],
  codesFor: (p: T) => readonly string[],
  linesFor: (p: T) => readonly string[],
  registers: (p: T) => boolean,
): void {
  for (const position of POSITIONS) {
```

tests/b0281-...:386-396 and tests/b0282-...:302-312 — `cells`, differing only
in the `head` line (`diff` output quoted): b0281's `head:
spelling.slice(0, spelling.indexOf("<"))` versus b0282's `head:
spelling.includes("<") ? spelling.slice(0, spelling.indexOf("<")) : spelling`
— the rest of the function, including the `POSITIONS.flatMap` structure and
the returned object shape, is byte-identical:
```ts
function cells(spellings: readonly string[]): {
  position: Position;
  spelling: string;
  head: string;
  row: LoadRow;
}[] {
  return POSITIONS.flatMap((position) =>
    spellings.map((spelling) => ({
      position,
      spelling,
```

## Why this is a problem
This is the "Boilerplate duplication" class, distinct in kind from the
generic `LoadRow`/`registered` load-harness duplication (filed separately):
here the duplicated unit is the bug-family-specific "nine type-reference
positions" fixture table and its matrix-assertion driver — a 56-line data
table plus two functions, together spanning roughly 115 lines per file,
reproduced with at most a two-line difference between the two sibling files.
Both files' own header comments describe the nine positions as "the seam"
every one of the nine reference positions shares (`parseTypeExpression` /
`lowerTypeExpr`), so the table encodes a fact about the grammar rather than
about either bug individually, and the near-total byte-identity across two
independently-maintained copies is the shape this table takes when a new
sibling file is started from the previous one's file.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts is the already-established shared module
for this bug-report family's harness pieces (b0282 imports its
`LoadRow`/`registered`/`expectCaptured` bundle from it); the
`Position`/`POSITIONS`/`cells`/`expectMatrix` bundle is the same family's
fixture-and-matrix layer sitting one level above that module's exports and
could join it or a sibling module the same family already relies on.

## False-positive check
- Gate-pin: both files match `*gate*.test.ts` by filename, but this finding
  claims no pinned count or inventory of `POSITIONS` itself is wrong or
  should shrink/grow — the nine-entry count is unchanged by this claim, which
  is only that the entries and driver code are duplicated rather than shared;
  the census/pin carve-out therefore does not apply to the claim being made.
- Recording-double: `cells` and `expectMatrix` build and assert over
  already-parsed `LoadRow` values; neither is a fake that records a call to
  witness a "never called" assertion. Not applicable.
- docs/bugs/ signature search: docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md
  Status "fixed (0.277.0)"; docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md
  Status "fixed (0.280.0)". `npx vitest run
  tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts
  tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts` →
  25 passed (14 + 11) at HEAD; neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0281-applied-reserved-generic-head-gate-at-nine-positions\|b0282-unknown-applied-generic-head-gate-at-nine-positions"
  docs/reference/coverage-matrix.md` → 0 hits. bug 0282's own document cites
  three `it()` blocks inside b0281's test file by name in its witness list
  (lines 650–652, group (D)); this finding cites none of those three blocks —
  its evidence is the `Position`/`POSITIONS`/`cells`/`expectMatrix` module-scope
  declarations that sit above and outside every `describe`/`it` body — and
  proposes no merge, rename, or deletion of any cited `it()`, so that pin is
  unaffected.
- Coverage check: the claim is entirely about a repeated fixture-table-and-
  driver DEFINITION, not a missing test path; every function and array entry
  cited is exercised by the tests in its own file (25/25 passing).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `diff` of b0281:328-383 vs b0282:244-299 is empty (56-line POSITIONS table byte-identical), and the full 312-426 vs 227-342 ranges differ only in two doc-comment wordings, one `cells` head ternary, and the trailing section marker; `expectMatrix` is byte-identical; the nine-position table (`query-T-head`…`params-field`) greps to exactly these two files and no tests/helpers/ module exports a Position/POSITIONS/cells/expectMatrix bundle; not a duplicate (PTQ-0206/0207/0219/0228/0409 cover the LoadRow/registered/expectRows layer, none names this table); carve-outs cleared — both bugs fixed (0.277.0 / 0.280.0), 25/25 green, 0 coverage-matrix hits, and bug 0282's witness list cites b0281 `it()` blocks that a module-scope fixture hoist neither merges, renames nor deletes; gate filename is incidental since no pinned count is challenged (triage: claude-fable-5-1)
