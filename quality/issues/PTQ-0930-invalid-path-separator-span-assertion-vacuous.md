---
id: PTQ-0930
title: "\"fires at the offending span\" test only asserts d?.range is truthy, never that the range names the backslash's position"
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/literals-and-paths.test.ts:181-193
  - tests/literals-and-paths.test.ts:52-54
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "fires at the offending span" test only asserts d?.range is truthy, never that the range names the backslash's position

## Observation
`tests/literals-and-paths.test.ts`'s `theta/parse/invalid-path-separator`
test is named "a backslash path separator fires at the offending span". Its
body drives `validatePathLiteral` with a single whole-literal `range` (the
file's own `span()` helper, documented two lines above as "A throwaway
1:1–1:2 span for the parse-context seam calls") and, after checking the
diagnostic's code and message, closes with `expect(d?.range, "the diagnostic
is located at the offending span").toBeDefined()`. `toBeDefined()` passes for
any truthy `range` value — including the same throwaway whole-literal span
handed in as input — so the assertion cannot distinguish a diagnostic located
at the backslash's own position from one that merely echoes the input
literal's span back unchanged.

## Evidence

`tests/literals-and-paths.test.ts:181-193` (re-read immediately before
filing):
```ts
  it("theta/parse/invalid-path-separator: a backslash path separator fires at the offending span", () => {
    const diags = validatePathLiteral(
      { value: "lib\\mod.theta", range: span() },
      "invoke",
      "test.theta",
    );
    const d = diags.find((x) => x.code === "theta/parse/invalid-path-separator");
    expect(d, "theta/parse/invalid-path-separator").toBeDefined();
    expect(d?.message).toBe(
      "invalid path separator: backslash in path literal",
    );
    expect(d?.range, "the diagnostic is located at the offending span").toBeDefined();
  });
```

`tests/literals-and-paths.test.ts:52-54` — the file's own characterisation of
the `range` value this test hands `validatePathLiteral` as `literal.range`:
```ts
/** A throwaway 1:1–1:2 span for the parse-context seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

## Why this is a problem
The test's own name promises a check that the diagnostic "fires at the
offending span" — i.e. that its `range` names the backslash's position
within `"lib\\mod.theta"`, distinct from the literal's own whole-value span.
The only assertion touching `range` is `toBeDefined()`, which passes for
literally any non-`undefined`/non-`null` value: a diagnostic whose `range`
equals the input `span()` unchanged, a diagnostic whose `range` points at the
wrong character, and a diagnostic whose `range` correctly names the
backslash's offset would all pass this line identically. A reader following
the title would expect the test to fail if the range were wrong; mechanically
it cannot — no comparison is made against any expected line/column value or
even against a value distinct from the input `span()`.

## Suggested direction (non-binding, optional)
Asserting `d?.range` against a specific expected line/column (or at minimum
against a value distinct from the input `span()`) is the comparison the
test's own title already claims to make.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or a named kin;
  not a pinned-count/inventory assertion.
- Recording-double check: `d?.range` is not a recording double backing a
  "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "invalid-path-separator\|literals-and-paths" docs/bugs/*.md`
  → 0 hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "literals-and-paths"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of the test — only that its span assertion be
  made to actually check what its title claims — so no citation is affected.
- Coverage-drift check: this finding does not claim a missing test or an
  untested code path; `validatePathLiteral`'s actual range-computation
  behaviour (whether it echoes the whole-literal span or computes a
  sub-span) is a production-code question outside D7's scope — the finding
  is confined to the test assertion's inability to discriminate either way.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/literals-and-paths.test.ts:181-193 and :52-54; the title and the assertion's own message both claim location ("at the offending span") yet the only range check is `expect(d?.range).toBeDefined()`, which — `Diagnostic.range` being optional (src/diagnostics/diagnostic.ts:43) — witnesses only "located-site, not file-only" and passes for any range value whatsoever, so a wrong-location regression cannot be caught: D7 misleading-name / non-discriminating-assertion class, same shape as confirmed PTQ-0249/0565/0784/0791 (title claims X, body never checks X), all sites under tests/, not a gate file, no recording double, 15/15 green (not a documented red), no merge/rename/delete proposed, not tracked elsewhere (grep `literals-and-paths|invalid-path-separator` across quality/issues + intake → only this file); two corrections for the fixer: production echoes `literal.range` by design (src/lexer/literals.ts:80,82-89 — `PathLiteral` carries no sub-span and the comment defines the offending span as the literal's range), so the right pin is `toEqual(span())` and the direction's "distinct from the input span()" alternative would red against correct behaviour; and the stated docs/bugs grep returns 3 hits (0253:346, 0320:277, 0325:197), not 0, though none cites this test as a red witness so the carve-out does not apply (triage: claude-fable-5-1)
