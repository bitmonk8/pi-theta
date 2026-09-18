---
id: PTQ-0596
title: Both generic-argument-* files redeclare the Cell/expectGroup whole-map diagnostic-comparison harness found in eleven further sibling files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/generic-argument-bracket-group-truncation.test.ts:373-394
  - tests/generic-argument-inline-field-key-rules.test.ts:333-354
  - tests/brace-and-angle-annotation-junk-refusal.test.ts:319-328
sites: 3
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# Both generic-argument-* files redeclare the Cell/expectGroup whole-map diagnostic-comparison harness found in eleven further sibling files

## Observation
Both files in scope declare an identical `Cell` interface (`cell`, `src`,
`path?`, `expected: readonly Exp[]`) and an `expectGroup(cells, why)` function
that builds two `Record<string, string[]>` maps keyed by `${c.cell} :: ${c.src}`
— one from driving `lines(c.src, c.path ?? "test.theta")`, one from
`renderAll(c.expected)` — and asserts them equal in one `expect(...).toEqual`
call. The function body is byte-identical between the two files in scope. The
same `expectGroup` name and near-identical whole-map-comparison body recur,
independently declared with no shared import, in at least eleven further test
files, none of which is `tests/generic-argument-*`. No `tests/helpers/`
module exports this comparison harness.

## Evidence
tests/generic-argument-bracket-group-truncation.test.ts:373-394:
```ts
/** One diagnostic-list cell. */
interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string | undefined;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and the subject-versus-control
 * agreement claims are only meaningful against whole lists compared together.
 */
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${c.src}`;
    actual[key] = lines(c.src, c.path ?? "test.theta");
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}
```

tests/generic-argument-inline-field-key-rules.test.ts:333-354 — the
`expectGroup` body is byte-identical (reverified: both bodies read `const key
= \`${c.cell} :: ${c.src}\`; actual[key] = lines(c.src, c.path ?? "test.theta");
expected[key] = renderAll(c.expected); expect(actual, why).toEqual(expected);`
verbatim); only the `Cell.path` field's optional-modifier spelling
(`string | undefined` vs bare `string`) and the doc-comment wording differ:
```ts
interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly path?: string;
  readonly expected: readonly Exp[];
}

function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${c.src}`;
    actual[key] = lines(c.src, c.path ?? "test.theta");
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}
```

tests/brace-and-angle-annotation-junk-refusal.test.ts:319-328 — same name,
same two-map-then-toEqual shape, differing only in the key's `JSON.stringify`
wrap and the driver call's arity:
```ts
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${JSON.stringify(c.src)}`;
    actual[key] = lines(c.src);
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}
```

Pattern-wide search: `grep -n "function expectGroup" tests/*.test.ts` finds
the declaration in 13 files total: the two in scope, plus
`brace-and-angle-annotation-junk-refusal.test.ts`,
`escaped-quote-inline-field-name-refusal.test.ts`,
`inline-object-empty-entry-slot-refusal.test.ts`,
`inline-object-empty-field-type-truncation.test.ts`,
`inline-object-keyless-entry-refusal.test.ts`,
`inline-object-malformed-entry-resync.test.ts`,
`inline-object-stranded-entry-refusal.test.ts`,
`inline-object-stray-close-token-split.test.ts`,
`inline-object-type-source-capture.test.ts`,
`inline-object-wire-name-rename-refusal.test.ts`, and
`unterminated-literal-params-type-refusal.test.ts`.

## Why this is a problem
`expectGroup` is not domain logic specific to bug 0236 or bug 0233; it is a
generic whole-map diagnostic-comparison driver over a `Cell` shape that
recurs, under the same name and the same two-map-then-`toEqual` structure, in
at least 13 independently-authored files. `tests/helpers/e2e-s1.ts` already
centralises this project's shared parse-driver plumbing (`parseDoc`,
`diagLines`), which both files in scope already import, but no
`tests/helpers/` module exports a `Cell`/`expectGroup` pair, so each of the 13
files re-derives the same ordered whole-list comparison oracle independently.

## Suggested direction (non-binding, optional)
A shared `Cell`/`expectGroup` pair, parameterised by the driver function
(`lines`) each file already defines over `parseDoc`, would sit naturally
beside `tests/helpers/e2e-s1.ts`'s existing `diagLines`/`diagCodes` exports.

## False-positive check
- Gate-pin: neither in-scope file, nor the third file cited, matches
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double: `expectGroup` compares two already-built plain-object maps
  via `toEqual`; it records no calls and backs no "never called" assertion,
  so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "expectGroup" docs/bugs/0236*
  docs/bugs/0233*` → 0 files. Neither bug document states a rationale for
  redeclaring this comparison harness locally rather than sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-bracket-group-truncation\|generic-argument-inline-field-key-rules"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion, only to where
  the comparison-driver function is defined.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every copy is exercised by the tests in its own
  file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines (bracket-group:373-395, inline-field-key-rules:333-356, brace-and-angle:319-328), `diff` of the two in-scope expectGroup bodies is empty, `grep -l "function expectGroup" tests/*.test.ts` → exactly the 13 files named, every copy is the same two-Record-then-`expect(actual, why).toEqual(expected)` shape (variants only in key spelling and `lines()` arity), no tests/helpers/* exports Cell/expectGroup (e2e-s1.ts stops at diagLines/diagCodes/expectDiagnosticRow), both suites 19/19 green; carve-outs hold (no gate file, no recording double, coverage-matrix 0 hits, `expectGroup` absent from docs/bugs/); not tracked by any PTQ (0205 is the diagLines/diagCodes half, since fixed), and the same-wave sibling d7-02-inline-object-empty-parse-harness was ruled duplicate deferring to this filing as the carrier — D7 boilerplate-duplication class; note for the fixer that each copy also depends on a per-file local `Exp`/`renderAll` (e.g. bracket-group:272/340) which a shared harness must take as a parameter or move alongside (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
