---
id: PTQ-1478
title: brace-and-angle-annotation-junk-refusal.test.ts redeclares the Exp/render/renderAll diagnostic-rendering trio its own header names as a mirror
lens: D7
status: open
verdict: confirmed
locations:
  - tests/brace-and-angle-annotation-junk-refusal.test.ts:171-228
  - tests/inline-object-stray-close-token-split.test.ts:192-255
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# brace-and-angle-annotation-junk-refusal.test.ts redeclares the Exp/render/renderAll diagnostic-rendering trio its own header names as a mirror

## Observation
`tests/brace-and-angle-annotation-junk-refusal.test.ts` declares a `msg`
function, an `Exp` interface (`severity`/`code`/`fills`), a `render(exp: Exp)`
function, and a `renderAll(exps)` function, with its own header comment
stating "Mirrors tests/inline-object-stray-close-token-split.test.ts (bug
0238's witness)" immediately above the block. That sibling file declares an
interface and two functions with byte-identical bodies. Neither file imports
these from `tests/helpers/`. The exact search `grep -rl "^function
renderAll" tests/*.test.ts` returns 10 files at HEAD, including both of
these.

## Evidence
tests/brace-and-angle-annotation-junk-refusal.test.ts:167-171,213-228:
```ts
// The diagnostic oracle — the registry's *Message* column (DIAG-4). Mirrors
// tests/inline-object-stray-close-token-split.test.ts (bug 0238's witness).
// ===========================================================================

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
...
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
...
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

tests/inline-object-stray-close-token-split.test.ts:210-215,251-255:
```ts
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
...
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

Exact search and count: `grep -rl "^function renderAll" tests/*.test.ts`
returns 10 files: `brace-and-angle-annotation-junk-refusal.test.ts`,
`inline-object-empty-entry-slot-refusal.test.ts`,
`inline-object-empty-field-type-truncation.test.ts`,
`inline-object-keyless-entry-refusal.test.ts`,
`inline-object-malformed-entry-resync.test.ts`,
`inline-object-stranded-entry-refusal.test.ts`,
`inline-object-stray-close-token-split.test.ts`,
`inline-object-type-source-capture.test.ts`,
`inline-object-wire-name-rename-refusal.test.ts`,
`unterminated-literal-params-type-refusal.test.ts`. Only the first and the
seventh (`inline-object-stray-close-token-split.test.ts`, the file this
review's scoped file's own comment names as the mirror) are cited here; the
remaining eight are outside this review's briefed scope and are named only to
state the exact search and its hit count.

## Why this is a problem
The `Exp`/`render`/`renderAll` trio's function bodies are character-for-
character identical between the two cited files, and the scoped file's own
header comment states the duplication outright ("Mirrors
tests/inline-object-stray-close-token-split.test.ts"), naming the sibling
file as the source of the repeated shape rather than a shared
`tests/helpers/` module.

## Suggested direction (non-binding, optional)
Observed as fact only: a `tests/helpers/` module holding the
`Exp`/`render`/`renderAll` trio is the shape both cited files' own comments
already point toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: `render`/`renderAll` render diagnostic expectations
  to strings, they do not record calls for a MUST-NOT witness; not a
  recording double.
- docs/bugs/ signature search: `grep -rn "0238\|0252" docs/bugs/*.md` locates
  `docs/bugs/0238-...md` and the 0252 report this scoped file implements;
  neither report's text pins the `Exp`/`render`/`renderAll` shape as a
  documented correct-reason artifact — both reports describe the diagnostic
  behaviour under test, not this rendering harness.
- coverage-matrix/bug-doc citation search: `grep -rn
  "brace-and-angle-annotation-junk-refusal\|inline-object-stray-close-token-split"
  docs/reference/coverage-matrix.md` returns no line naming either file's
  `Exp`/`render`/`renderAll` declaration by name, so no citation pins these
  functions' identity or position.
- Confirmed this is the same clone shape PTQ-1055 (resolved/fixed) already
  established for a different file pair
  (`generic-argument-bracket-group-truncation.test.ts` /
  `generic-argument-inline-field-key-rules.test.ts`); that fix did not touch
  either file cited here, so this is a distinct site pair of the same
  recurring shape, not a re-file of PTQ-1055's own cited locations.

## Triage
verdict: confirmed — independently re-verified: `interface Exp`/`render`/`renderAll` reproduce at brace-and-angle-annotation-junk-refusal.test.ts:180-184/221-227 and inline-object-stray-close-token-split.test.ts:213-217/252-258 (line drift ≤ 9 from the filed ranges), mktemp `diff` of the two sed-extracted 11-line trios is empty (byte-identical), both copies live (`expectGroupShared(..., renderAll)` at :266/:295, `render(REFUSE("y"))` at :709), `grep -l "^function renderAll" tests/*.test.ts` → exactly the 10 files named, clone-scan map lists no group (hand-diffed instead), not a gate file, no recording double, docs/bugs 0238/0252 and coverage-matrix greps → 0 rationale for a local copy — D7 boilerplate-duplication class; stronger than filed: tests/helpers/registry-oracle.ts:86-128 ALREADY exports `Exp`/`render`/`renderAll` (PTQ-1055's fix) wrapping `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/", …)` — the same anchor brace-angle's `msg` passes (stray-close's `msg` differs only in the failure-message path string) — and both files import `REGISTRY` from that very module at line 1-2, so the fix is deleting the local trio (+ `msg`) and widening the existing import; dedupe: resolved PTQ-1055 covered only the generic-argument pair, same-wave d7-01 covers stray-close + type-source-capture and its note explicitly excludes this brace-angle pair, and no open or resolved row cites brace-and-angle-annotation-junk-refusal.test.ts's trio — the brace-angle site is untracked (the shared stray-close site should land once with d7-01's fix) (triage: claude-fable-5-1)
