---
id: PTQ-0266
title: Cell `aStr`'s test name says `g("a" / "b")` "stays WITHHELD" against `n: integer`; its body (post bug 0332) now asserts a diagnostic fires for both the division and its `-` control
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/division-result-type-number.test.ts:79-82
  - tests/division-result-type-number.test.ts:1096-1097
  - tests/division-result-type-number.test.ts:1122-1131
  - tests/division-result-type-number.test.ts:1133-1141
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# Cell `aStr`'s test name says `g("a" / "b")` "stays WITHHELD" against `n: integer`; its body (post bug 0332) now asserts a diagnostic fires for both the division and its `-` control

## Observation
`tests/division-result-type-number.test.ts`'s cell `aStr` carries the title
(quoted verbatim below in Evidence): "aStr: `g("a" / "b")` stays WITHHELD
against `n: integer`, and so does its `-` control". The file's own header
manifest (lines 79-82) describes the same cell the same way: `g("a" / "b")`
"stays WITHHELD". The cell's body, however, asserts that both the division
fixture and its `-` control now produce exactly one diagnostic each
(`ARITHMETIC_CODE`, bug 0332's `theta/parse/non-numeric-arithmetic-operands`)
— the opposite of "withheld". The body's own comments state plainly that bug
0332 "supersedes this cell's own withhold measurement" and that both
fixtures "now flip from WITHHELD-silent to the new parse refusal," but the
`it(...)` title and the header manifest line were not updated to match.

## Evidence
tests/division-result-type-number.test.ts:79-82 — the file's own header
manifest, still describing the cell as staying withheld:
```ts
//   aStr        `g("a" / "b")` stays WITHHELD against an `n: integer` param
//               that a wrongly-admitted proof would mismatch, with the guard
//               that withholds it named, because that guard moves under this
//               fix.
```

tests/division-result-type-number.test.ts:1096-1097 — the `describe`/`it`
title, making the same "stays WITHHELD" claim for both the division and its
control:
```ts
describe("bug 0142 — the rows whose withholding must survive the fix", () => {
  it("aStr: `g(\"a\" / \"b\")` stays WITHHELD against `n: integer`, and so does its `-` control", () => {
```

tests/division-result-type-number.test.ts:1122-1131 — the division fixture:
the body's own comment (elided above this excerpt, at lines 1116-1121) states
the row "now flip[s] from WITHHELD-silent to the new parse refusal," and the
assertion proves exactly that — one `ARITHMETIC_CODE` diagnostic, not zero:
```ts
    const division = parse(G_INT + 'let r = g("a" / "b")\nr\n');
    expectDivisions(division, 1, "aStr");
    expect(
      argRange(division, "g", 0),
      "PRECONDITION (aStr): the argument node must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(division),
      `aStr — bug 0332: a non-numeric \`/\` pair now refuses at parse, ahead of the withhold this cell used to measure. Diagnostics: ${render(division)}`,
    ).toEqual([hit(ARITHMETIC_CODE, arithmeticMessage("/", "string", "string"), argRange(division, "g", 0))]);
```

tests/division-result-type-number.test.ts:1133-1141 — the `-` control, which
the title says "does" the same "stays WITHHELD" thing; the assertion proves
it now fires too:
```ts
    const control = parse(G_INT + 'let r = g("a" - "b")\nr\n');
    expect(
      argRange(control, "g", 0),
      "PRECONDITION (aStr control): the argument node must be reachable",
    ).toBeDefined();
    expect(
      allHits(control),
      `aStr (control) — bug 0332's gate covers \`-\` too, so the control is no longer inert against this operator; it now draws the identical refusal. Diagnostics: ${render(control)}`,
    ).toEqual([hit(ARITHMETIC_CODE, arithmeticMessage("-", "string", "string"), argRange(control, "g", 0))]);
  });
```

## Why this is a problem
A reader who scans this file's test names (or its own header manifest) to
learn what cell `aStr` verifies is told, in both places, that `g("a" /
"b")` and its `-` control "stay WITHHELD" against the `n: integer`
parameter — i.e., that neither draws a diagnostic. Reading the body instead
of the name proves the opposite for both fixtures: `allHits(division)` is
asserted to equal a one-element array carrying `ARITHMETIC_CODE`, and
`allHits(control)` is asserted to equal a one-element array carrying the
same code for the `-` spelling. This is not a subtle inference — the body's
own inline comments (1116-1121) narrate the exact same reversal ("Bug 0332
supersedes this cell's own withhold measurement... now flip from
WITHHELD-silent to the new parse refusal"), so the file already contains,
next to the stale title, the accurate description the title itself does not
carry. `docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md`
(lines 201-203) independently confirms the same fixtures (referenced there
as "the `g("a" / "b")` / `g("a" - "b")` pair") were a directed disposition
flip of this bug's own fix, not an accident. The title and header-manifest
line are the only places in this cell's text still worded in the pre-0332
"withheld" framing that both the body's own comments and bug 0332's doc say
no longer holds.

## Suggested direction (non-binding, optional)
The cell's own in-body comments (1116-1121) already state the current,
accurate framing ("now flip from WITHHELD-silent to the new parse refusal");
the `it(...)` title (1097) and the header-manifest line (79-82) are the only
text in this cell still worded in the superseded "stays WITHHELD" terms.
`docs/bugs/0142-division-result-type-not-number.md` (round-1 review, "F2
cell `aStr`") and `docs/bugs/0332-...md` (its enumerated sibling-witness
flips list) both cite this cell by its `aStr` label and by file path/line
numbers, not by this `it(...)` string literal, so a title edit would not
touch either citation's own wording — but any rename should be checked
against both before landing, since both name this cell.

## False-positive check
- Gate-pin check: `tests/division-result-type-number.test.ts` does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory.
- Recording-double check: `allHits(...)` reads `doc.diagnostics` off a real,
  freshly-parsed `ThetaDocument`, not a recording double's captured call log;
  the assertions are affirmative ("this diagnostic fires"), not a
  MUST-NOT-called negative witness, so the recording-double carve-out does
  not apply.
- docs/bugs/ signature search: `grep -n "aStr" docs/bugs/0142-division-result-type-not-number.md`
  hits the round-1 review entries (F2, "aStr re-parameterised to `n:
  integer` with its comment corrected") — a bug-0142-era fix to this cell's
  *comment*, predating bug 0332 and not a defence of the current title.
  `grep -n "division-result-type-number.test.ts"
  docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md`
  hits lines 201-203 and 294-296, both directing the assertion-level flip
  ("All flip to the new operand code" / "Enumerated sibling-witness flips")
  with no mention of, or rationale for, the title wording. Neither doc
  frames the current title as a documented correct-reason red, and `npx
  vitest run tests/division-result-type-number.test.ts` reproduces 44/44
  passing at HEAD (reverified during this review) — this is a green test,
  not a red one.
- coverage-matrix/bug-doc citation search: `grep -c
  "division-result-type-number.test.ts" docs/reference/coverage-matrix.md`
  → 0. The cell IS cited by its `aStr` label in
  `docs/bugs/0142-division-result-type-not-number.md` and in
  `docs/bugs/0332-...md`'s enumerated flips list — both cite the cell's
  behaviour and this file's path/line numbers, not the `describe`/`it`
  string literals. This finding does not itself propose a merge, rename or
  deletion; per the citation rule, any future rename of this cell must
  reconcile with both of those documents, which is stated explicitly above.
- Bug-vs-D7 check: the shipped behaviour under test (both fixtures now
  refuse at the arithmetic-operand gate) is correct and intentional per bug
  0332's fix, and is not in dispute here; the finding is confined to the
  stale "stays WITHHELD" wording in the title and header manifest versus
  what the body's own assertions and comments now establish.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four citations verified verbatim at the exact lines (header 79-82, title 1097, division assert 1122-1131, control assert 1133-1141); body and its own 1116-1121 comments prove ARITHMETIC_CODE now fires for both fixtures while the title/header still say "stays WITHHELD", bug 0332 docs (201-203, 294-296) confirm this was a deliberate assertion flip with no title update, suite reruns 44/44 green, and no D7 false-positive carve-out (gate-pin, recording-double, documented-red, coverage-matrix citation) applies (triage: claude-opus-5)
