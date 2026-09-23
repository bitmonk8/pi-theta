---
id: PTQ-1374
title: the respond-tool execute result's joined-text-parts extraction is a named helper in one file and copy-pasted inline twice in the other
lens: D7
status: open
verdict: confirmed
locations:
  - tests/typed-repair-two-phase.test.ts:282-290
  - tests/typed-two-phase-live.test.ts:690-693
  - tests/typed-two-phase-live.test.ts:764-767
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# the respond-tool execute result's joined-text-parts extraction is a named helper in one file and copy-pasted inline twice in the other

## Observation
`tests/typed-repair-two-phase.test.ts` factors "join a respond-tool `execute`
result's text-typed content parts" into a named function, `executeResultText`.
`tests/typed-two-phase-live.test.ts` never declares or imports that function;
instead it writes the identical `.filter(...).map(...).join("")` expression
inline, verbatim, in two separate `it()` cells ((d1) and (d2)).

## Evidence

`tests/typed-repair-two-phase.test.ts:282-290`:
```ts
/** Read a respond-tool `execute` result's joined text parts. */
function executeResultText(result: unknown): string {
  const shaped = result as {
    readonly content?: ReadonlyArray<{ readonly type?: unknown; readonly text?: unknown }>;
  };
  return (shaped.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}
```

`tests/typed-two-phase-live.test.ts:690-693` (cell "(d1) early respond call: a VALID mid-turn execute captures..."):
```ts
    const resultText = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("");
```

`tests/typed-two-phase-live.test.ts:764-767` (cell "(d2) early respond call: an INVALID mid-turn execute resolves isError..."):
```ts
    const resultText = (result.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("");
```

Search performed: `grep -n "executeResultText\|\.filter((part) => part.type === \"text\""` against both files — one declaration + one call site in the repair file, two independent inline copies in the live file, zero imports of `executeResultText` in the live file.

## Why this is a problem
The same three-step `.filter/.map/.join` extraction over the same `{content}`
shape appears three times across the two files in scope: once factored as a
named helper (`tests/typed-repair-two-phase.test.ts:282-290`) and twice
inlined verbatim in the sibling file's two early-respond cells
(`tests/typed-two-phase-live.test.ts:690-693`, `:764-767`). The repair file's
own `invokeRespondExecute`/`executeResultText` pair already demonstrates that
this repository treats this exact respond-tool-result shape as
helper-worthy scaffolding; the live file's two cells reimplement the same
extraction inline instead of sharing it.

## Suggested direction (non-binding, optional)
The already-factored `executeResultText` (or an export of it from the shared
live-session harness module both files already import from) is the natural
shared home for the two inline copies.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are a result-shaping extraction helper/expression, not
  a pinned count or inventory assertion.
- Recording-double check: `executeResultText`/the inline expression reads a
  tool-execute result to feed a `toMatch(/recorded/i)` or `.length > 0`
  assertion on real returned text; it is not a recording double and carries
  no MUST-NOT witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "typed-repair-two-phase\|typed-two-phase-live" docs/bugs/` finds docs/bugs/0010 (both files listed as sibling regression suites, not a documented correct-reason red covering this duplication) plus 0012/0013/0014/0028/0099/0288/0291/0480 naming only `typed-two-phase-live.test.ts` for their own defects; both files pass at HEAD on the cells using this extraction.
- coverage-matrix/bug-doc citation search: `grep -n "typed-repair-two-phase\|typed-two-phase-live" docs/reference/coverage-matrix.md` finds no citation of specific line ranges inside either file's result-extraction code; no merge, rename, or deletion of any `it()`/`describe()` is proposed.
- Coverage check: the claim is about a duplicated extraction EXPRESSION, not a missing test path; all three sites' cells (r4 in the repair file, (d1)/(d2) in the live file) continue to pass under their current inline/factored form.

## Triage
verdict: confirmed — all three excerpts reproduce at the cited lines (1-line drift: helper at typed-repair-two-phase.test.ts:283-291, called once at :634; verbatim inline `.filter/.map/.join` at typed-two-phase-live.test.ts:690-693 and :764-767, no `executeResultText` declared/imported there); every copy is live (r4/(d1)/(d2) cells assert on the joined text); boilerplate-duplication class in tests/ only, no gate/recording-double/bug-doc-red/coverage-matrix carve-out applies; grep over quality/ finds no PTQ tracking executeResultText (PTQ-0519/0728/0729 cover the scripted-session harness, not this extractor); note the filing undercounts — a fourth near-identical copy exists at tests/respond-tool-wire.test.ts:923-931, which strengthens rather than refutes the clone (triage: claude-fable-5-1)
