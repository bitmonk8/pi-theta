---
id: PTQ-1055
title: Both in-scope generic-argument-*.test.ts files declare an identical Exp/render/renderAll rendering trio with no shared tests/helpers/ export
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/generic-argument-bracket-group-truncation.test.ts:249-253
  - tests/generic-argument-bracket-group-truncation.test.ts:313-319
  - tests/generic-argument-inline-field-key-rules.test.ts:222-226
  - tests/generic-argument-inline-field-key-rules.test.ts:268-274
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both in-scope generic-argument-*.test.ts files declare an identical Exp/render/renderAll rendering trio with no shared tests/helpers/ export

## Observation
Both `tests/generic-argument-bracket-group-truncation.test.ts` and
`tests/generic-argument-inline-field-key-rules.test.ts` declare an identical
`Exp` interface (`severity`, `code`, `fills`), an identical `render(exp: Exp)`
function that renders `` `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}` ``,
and an identical `renderAll(exps: readonly Exp[])` function that maps
`render` over the list. Neither file imports these from a shared module; each
independently declares the same three names with byte-identical bodies. The
exact search `grep -rl "^function renderAll" tests/*.test.ts` returns 13
files, including these two.

## Evidence
tests/generic-argument-bracket-group-truncation.test.ts:249-253:
```ts
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
```

tests/generic-argument-bracket-group-truncation.test.ts:313-319:
```ts
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

tests/generic-argument-inline-field-key-rules.test.ts:222-226:
```ts
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
```

tests/generic-argument-inline-field-key-rules.test.ts:268-274:
```ts
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

Both files' `render`/`renderAll` pair is byte-identical, and both files'
`Exp` interface is byte-identical. The remaining 11 sites the exact search
above turned up
(`tests/brace-and-angle-annotation-junk-refusal.test.ts`,
`tests/escaped-quote-inline-field-name-refusal.test.ts`,
`tests/inline-object-empty-entry-slot-refusal.test.ts`,
`tests/inline-object-empty-field-type-truncation.test.ts`,
`tests/inline-object-keyless-entry-refusal.test.ts`,
`tests/inline-object-malformed-entry-resync.test.ts`,
`tests/inline-object-stranded-entry-refusal.test.ts`,
`tests/inline-object-stray-close-token-split.test.ts`,
`tests/inline-object-type-source-capture.test.ts`,
`tests/inline-object-wire-name-rename-refusal.test.ts`,
`tests/unterminated-literal-params-type-refusal.test.ts`) are outside this
review's scope and are named here only to size the pattern, not cited as
filed sites.

## Why this is a problem
`tests/helpers/e2e-s1.ts` already exports a generic `expectGroup<Exp>` and
`DiagnosticCell<Exp>` (used by both in-scope files as `expectGroupShared`),
which is the shared harness that consumes a caller-supplied `renderAll`-shaped
function — the type parameter is already generic over exactly this `Exp`
shape. The `Exp` interface and the `render`/`renderAll` pair that produce the
"expected" side of that comparison are declared independently in both
in-scope files (and, by the same search, in 11 further sibling files) with no
`tests/helpers/` module exporting either the interface or the two functions.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module could export the `Exp` interface and the
`render`/`renderAll` pair alongside the existing `expectGroup`/`DiagnosticCell`
generics, since every declared copy this search found is byte-identical.

## False-positive check
Gate-pin check: neither file is `*gate*.test.ts`; not applicable.
Recording-double check: `render`/`renderAll` are pure formatters, not
call-recording doubles; not applicable. docs/bugs/ signature search: both
files' own headers cite their respective bug reports
(`docs/bugs/0236-...md`, `docs/bugs/0233-...md`) for the parser defect under
test, not for this harness shape; no documented correct-reason-red covers a
duplicated formatter. Coverage-matrix/bug-doc citation search:
`grep -rn "renderAll\|interface Exp" docs/reference/coverage-matrix.md
docs/bugs/*.md` returns no hits naming these declarations, so no pinned-test
citation applies. This finding cites only the two in-scope files as filed
sites and states the wider 13-file pattern as a search-and-count, not as a
coverage claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce at the exact cited lines (bracket-group :249-253/:313-319, inline-field-key-rules :222-226/:268-274); mktemp `diff` of the sed-extracted `interface Exp`/`render`/`renderAll` block (11 lines) between the two files is empty, and their `msg` helpers hash identical too; both copies are live (`renderAll` passed to `expectGroupShared` at :347/:308); `grep -rl "^function renderAll" tests/*.test.ts` → exactly the 13 files named; no tests/helpers/* exports `Exp`/`renderAll` (e2e-s1.ts:311 only takes `renderAll` as a parameter; its `render` at :150 is an unrelated `ThetaDocument` renderer); docs/bugs + coverage-matrix greps → 0; no gate file, no recording double — D7 boilerplate-duplication class; dedupe: resolved PTQ-0596 fixed only `Cell`/`expectGroup` by parameterising `renderAll` (its triage note offered "take as a parameter or move alongside"; the fixer chose parameter), so the trio deliberately stayed per-file and is tracked by no open PTQ, while PTQ-0808/0997 cover only the `msg` body `render` closes over; same-wave intake siblings d7-05 and d7-19 restate this root cause on other cohort files and should fold into this first-numbered carrier; accounting nit: "every declared copy is byte-identical" holds for 10/13 cohort files — inline-object-{empty-entry-slot,keyless-entry,stranded-entry}-refusal inline the fill loop into `render` rather than calling `msg` — immaterial to the two filed sites; fixer note: a shared `render` must call `registryMessageOf` (load-row-harness.ts:60) rather than a per-file `msg`, so land alongside PTQ-0808's migration (triage: claude-fable-5-1)
