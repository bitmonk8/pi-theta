---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: division-result-type-number-invoke.test.ts's F1 (ii) names say the invoke-arg-mismatch code moves withheld → fires; the bodies prove it stays withheld or never check it
lens: D7                     # D2 | D7 — the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - tests/division-result-type-number-invoke.test.ts:79-80
  - tests/division-result-type-number-invoke.test.ts:345-355
  - tests/division-result-type-number-invoke.test.ts:356-370
  - tests/division-result-type-number-invoke.test.ts:373-384
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# division-result-type-number-invoke.test.ts's F1 (ii) names say the invoke-arg-mismatch code moves withheld → fires; the bodies prove it stays withheld or never check it

## Observation
The file declares `CODE = "theta/parse/invoke-arg-type-mismatch"` as "the row
under test" (79-80). Its `describe(...)` block for class (ii) (345) is named
"a non-numeric `/` argument at a param matching the operands' own type moves
withheld → fires", and the `divstr` cell inside it (356) is titled "...now
fires...". The block's own in-body comment (346-355) records that bug 0332
supersedes this class: both planted callers now refuse at an earlier
PARSE-time gate, under a different code, before either ever reaches the sink
CODE measures. The `divstr` cell's own second assertion then proves CODE is
empty (`linesForCode("divstr", CODE)` equals `[]`), and the `substr` control
cell (373-384), titled "...stays withheld...", never queries CODE in either
direction.

## Evidence
tests/division-result-type-number-invoke.test.ts:79-80 — the row this file
declares itself to be testing:
```ts
/** The row under test. */
const CODE = "theta/parse/invoke-arg-type-mismatch";
```

tests/division-result-type-number-invoke.test.ts:345-355 — the describe name
and its own comment recording that the transition it names is superseded:
```ts
describe("bug 0142 F1 (ii) — a non-numeric `/` argument at a param matching the operands' own type moves withheld → fires", () => {
  // Bug 0332 SUPERSEDES this class at both cells: `"a" / "b"` and `"a" - "b"`
  // now refuse at PARSE (`theta/parse/non-numeric-arithmetic-operands`) before
  // either planted caller ever reaches `checkInvokeStaticResolution` and the
  // `collectProvableArgTypes` mirror this class measures — the withheld →
  // fires transition for `/` and the stays-withheld control for `-` both
  // become moot once neither operand pair survives to that sink. The subject
  // each cell probes ('what does the invoke-arg sink do with this argument')
  // is superseded by 'does this caller load at all', which is what these two
  // cells now pin: both callers flip from loading clean to a LOAD refusal
  // carrying the new code, and neither registers.
```

tests/division-result-type-number-invoke.test.ts:356-370 — `divstr`'s title
says CODE "now fires"; its own second `expect` proves CODE, not
`ARITHMETIC_CODE`, is absent:
```ts
  it('divstr: `invoke("./cstr.theta", "a" / "b")` at a `string` param now fires — bug 0332: refuses at PARSE instead', () => {
    expect(
      linesForCode("divstr", ARITHMETIC_CODE).some((line) =>
        line.includes(arithmeticMessage("/", "string", "string")),
      ),
      `bug 0332's gate must refuse this caller's \`"a" / "b"\` argument at parse, before the invoke-arg-type-mismatch mirror this class used to measure is ever reached. Lines for this caller: ${JSON.stringify(linesFor("divstr"))}`,
    ).toBe(true);
    expect(
      linesForCode("divstr", CODE),
      `a caller refused at parse must not also reach the invoke-arg sink this class measures. Lines for this caller: ${JSON.stringify(linesFor("divstr"))}`,
    ).toEqual([]);
    expect(
      outcome.registered,
      "a parse-refused caller must not register",
    ).not.toContain("divstr");
```

tests/division-result-type-number-invoke.test.ts:373-384 — `substr`'s title
says it "stays withheld"; its body never calls `linesForCode(..., CODE)` at
all:
```ts
  it('substr (control): `invoke("./cstr.theta", "a" - "b")` at the same param stays withheld — bug 0332: refuses at PARSE instead', () => {
    expect(
      linesForCode("substr", ARITHMETIC_CODE).some((line) =>
        line.includes(arithmeticMessage("-", "string", "string")),
      ),
      `bug 0332's gate covers \`-\` too, so the control that used to stay withheld at the invoke-arg sink now refuses one seam earlier, at parse. Lines for this caller: ${JSON.stringify(linesFor("substr"))}`,
    ).toBe(true);
    expect(
      outcome.registered,
      "a parse-refused caller must not register — this control no longer reaches the runtime AJV net it used to defer to",
    ).not.toContain("substr");
  });
```
Search: within the 373-384 span, `CODE)` (the bare row-under-test constant)
occurs 0 times — only `ARITHMETIC_CODE` and `outcome.registered` are read.

## Why this is a problem
"Withheld → fires" and "stays withheld" are both statements about CODE, the
file's own declared "row under test" (80). When this class was authored (bug
0142, v0.80.0 — docs/bugs/0142-division-result-type-not-number.md's §Fix
names this file "the companion that pins the MIRROR at the invoke sink"), the
claim was accurate: CODE moved from withheld to firing for `/` while staying
withheld for `-`. Bug 0332 (v0.299.0) moved both planted callers to an
earlier parse-time refusal; docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md:211-213
lists this exact file among its enumerated flips ("the `invoke(.... "a" / "b")`
and `"a" - "b"` planted thetas … currently load clean, flip to a load
refusal"), and the in-body comment at 346-355 states the supersession
outright. The two cell titles, however, were left reading their pre-0332
meaning. Read today, `divstr`'s own second `expect` proves the title's claim
false for CODE — it is asserted empty, not firing — and `substr`'s cell
contains no assertion about CODE in either direction, so "stays withheld" in
its title is not something this cell's body examines either way. A reader
who trusts either title to mean "this is where CODE's disposition is pinned"
is misled: that disposition is now decided by the earlier gate the describe
block's own comment names, and only the first `expect` in each cell (against
`ARITHMETIC_CODE`) does any pinning.

## Suggested direction (non-binding, optional)
The in-body comment at 346-355 already states the current, accurate framing
("both callers flip from loading clean to a LOAD refusal carrying the new
code, and neither registers"); the two cell titles and the describe name are
the only text in this block still worded in the pre-0332 "withheld → fires" /
"stays withheld" terms that comment supersedes.
docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md:211
cites this file's path and its planted-fixture line numbers, not these
`describe`/`it` string literals, so a rename would not touch that citation's
own wording.

## False-positive check
- Gate-pin check: `tests/division-result-type-number-invoke.test.ts` does not
  match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the census/pin carve-out does not apply.
- Recording-double check: `outcome.registered` / `linesForCode` read a
  recording double's captured stderr/registration output, and the
  `.not.toContain(...)` assertions in both cells are legitimate MUST-NOT
  witnesses over that double. This finding does not challenge those
  witnesses; it is confined to the mismatch between each cell's title text
  and what the CODE-specific assertion (or its absence) establishes.
- docs/bugs/ signature search: `grep -n "division-result-type-number-invoke"
  docs/bugs/*.md` hits docs/bugs/0142 (origin, Status "fixed (0.80.0)", names
  this file as new witness) and docs/bugs/0332 (Status "fixed (0.299.0)",
  lines 211-213, listing this file's two planted thetas as a required
  disposition flip). Neither doc discusses or defends the cell titles'
  wording as a documented correct-reason red; `npx vitest run
  tests/division-result-type-number-invoke.test.ts` passes 4/4 at HEAD, so
  this is not a red/disabled test.
- coverage-matrix/bug-doc citation search: `grep -n
  "division-result-type-number-invoke" docs/reference/coverage-matrix.md` →
  0 hits. docs/bugs/0332 cites the file path and its planted-fixture line
  numbers (`:171`, `:172` in the fixture table), not the `describe`/`it`
  string literals, so no citation pins these specific titles; this finding
  proposes no merge, rename, or delete, only observes the name/body mismatch.
- Coverage-drift check: the claim is confined to this existing block's
  existing names versus what its existing assertions verify; it does not
  allege a missing test path or propose a new test.
- Bug-vs-D7 check: the shipped behaviour under test (both callers now refuse
  at the earlier arithmetic-operand gate) is correct and intentional per bug
  0332's fix; nothing here alleges wrong runtime behaviour, only a stale name
  in test code.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — both `it()` titles already append a "bug 0332: refuses at PARSE instead" correction and sit under a comment (346-355) that fully documents the supersession, and the identical pattern (a "stays WITHHELD"-style title whose `allHits` assertion flips from `[]` to a live `ARITHMETIC_CODE` hit, left with zero title annotation) recurs in `division-result-type-number.test.ts`'s sibling `aStr`/`aStr (control)` cells from the same commit (6ed73f9b) — a repeated same-commit authorial choice across companion files, not an isolated defect, so a human should rule on whether/how to rename across the whole family (triage: claude-opus-5)
