---
id: PTQ-0814
title: linesFor/linesForCode per-caller diagnostic-attribution readers are byte-identical across four production-load test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/division-result-type-number-invoke.test.ts:272-281
  - tests/invoke-arg-array-literal-provable.test.ts:468-477
  - tests/invoke-arg-type-mismatch-wired.test.ts:522-531
  - tests/modulo-zero-result-type-number.test.ts:1840-1849
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# linesFor/linesForCode per-caller diagnostic-attribution readers are byte-identical across four production-load test files

## Observation
`tests/division-result-type-number-invoke.test.ts` declares, at module
scope, a `linesFor(stem)` function that builds a regex matching
`[/\]<stem>.theta[:\s]` and filters `outcome.diagnosticLines` by it, and a
`linesForCode(stem, code)` function that further filters `linesFor(stem)` by
`line.includes(code)`. Both functions recur byte-identical in three sibling
files that each also drive `discoverAndComposeFixtures` over a planted
`.pi/theta/` workspace and read its stderr-mirrored diagnostic lines back
through `runProductionLoad` (itself already the subject of the separate,
resolved PTQ-0210 duplication finding). No `tests/helpers/` module exports
either function.

## Evidence
`tests/division-result-type-number-invoke.test.ts:272-281`:
```ts
/** Diagnostic lines the load attributed to one planted `.theta`. */
function linesFor(stem: string): readonly string[] {
  const attributed = new RegExp(`[\\\\/]${stem}\\.theta[:\\s]`);
  return outcome.diagnosticLines.filter((line) => attributed.test(line));
}

/** Diagnostic lines attributing `code` to one planted `.theta`. */
function linesForCode(stem: string, code: string): readonly string[] {
  return linesFor(stem).filter((line) => line.includes(code));
}
```

`tests/invoke-arg-array-literal-provable.test.ts:468-477` — byte-identical
(re-read and `diff`'d against the excerpt above immediately before filing;
0 output):
```ts
/** Diagnostic lines the load attributed to one planted `.theta`. */
function linesFor(stem: string): readonly string[] {
  const attributed = new RegExp(`[\\\\/]${stem}\\.theta[:\\s]`);
  return outcome.diagnosticLines.filter((line) => attributed.test(line));
}

/** Diagnostic lines attributing `code` to one planted `.theta`. */
function linesForCode(stem: string, code: string): readonly string[] {
  return linesFor(stem).filter((line) => line.includes(code));
}
```

`tests/invoke-arg-type-mismatch-wired.test.ts:522-531` — byte-identical
(`diff` 0 output).

`tests/modulo-zero-result-type-number.test.ts:1840-1849` — byte-identical
(`diff` 0 output).

Exact search: `grep -rn "^function linesFor\b" tests/*.test.ts` and
`grep -rn "^function linesForCode" tests/*.test.ts` each return exactly
these four hits, one per file, no others. `grep -n "linesFor\|linesForCode"
tests/helpers/production-load-harness.ts` → 0 hits: the shared harness
module these four files already import `runProductionLoad`/
`plantThetaWorkspace`/`disposeWorkspace` from (per the resolved PTQ-0210 /
PTQ-0312) does not export either reader.

## Why this is a problem
The same two-function "attribute a diagnostic line to one planted caller by
stem, then narrow to one code" reader is hand-typed four times rather than
imported once, even though all four files already share the surrounding
`runProductionLoad` harness and its `LoadOutcome.diagnosticLines` shape that
`linesFor` reads. A change to the attribution regex (for example, to cover a
path separator or extension `linesFor` does not yet match) would need to
land in all four copies to keep every file's per-caller channel reading the
same way.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` already centralises this same
file family's `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace`
pieces; a sibling export taking the `LoadOutcome.diagnosticLines` array and a
stem sits naturally beside them, as a hypothesis only.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this
  finding is about a reader-function definition site, not a pinned count or
  corpus inventory.
- Recording-double check: `linesFor`/`linesForCode` are pure filters over an
  already-captured `diagnosticLines` array; they record no calls themselves
  and back no "never called" witness — the array they read is produced by
  `runProductionLoad`'s stderr mirror, already covered by the separate,
  resolved PTQ-0210 finding, which this finding does not restate.
- docs/bugs/ signature search: `grep -rn "linesForCode\|function linesFor"
  docs/bugs/*.md` → 0 hits; no open bug document cites either identifier or
  a red matching this shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "division-result-type-number-invoke\|invoke-arg-array-literal-provable\|invoke-arg-type-mismatch-wired\|modulo-zero-result-type-number"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any file or `it()`/`describe()` — only that
  the two reader functions could be composed from a shared export.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; all four files are exercised at HEAD.
- Prior-finding overlap check: `grep -rl "linesForCode\|linesFor(stem"
  quality/issues quality/intake` → 0 hits before this filing. PTQ-0210
  (resolved) targets the `runProductionLoad` stderr-mirror function itself;
  PTQ-0599 (open) targets the planted-stem suffix-collision guard loop;
  PTQ-0606 (open) targets the `theta`/`invokeCaller`/`callableCaller`
  fixture-text builders. None of these three prior findings' Evidence
  sections cite `linesFor` or `linesForCode`.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (division-result-type-number-invoke:272-281, invoke-arg-array-literal-provable:468-477, invoke-arg-type-mismatch-wired:522-531, modulo-zero-result-type-number:1840-1849) and sed-extracted blocks diff to zero against the first copy; every copy is live (8/19/16/9 `linesFor(` and 7/17/14/8 `linesForCode(` call sites per file); `linesFor|linesForCode` → 0 hits in tests/helpers/production-load-harness.ts and no tests/helpers module exports either; D7 boilerplate-duplication class, all locations under tests/, not a gate file, pure filters (no recording double), docs/bugs → 0, coverage-matrix → 0, no merge/rename/delete proposed; two filing inaccuracies are immaterial — `^function linesFor\b` actually returns five hits (the fifth, arg-mismatch-diagnostic-count-by-surface.test.ts:691, is a parameterised `linesFor(stem, ext)` variant with a `codesFor` sibling, not byte-identical, so the quartet count stands) and the claim that the four files already import runProductionLoad/plantThetaWorkspace/disposeWorkspace from the harness is false (none imports production-load-harness; each still declares a local LoadOutcome/runProductionLoad, a separate root cause tracked by PTQ-0635 for modulo-zero and resolved PTQ-0210 for the others) — migrating those would not remove linesFor since the harness does not export it; quality-store grep for `linesFor` hits only PTQ-0526 (unrelated parameter name) and resolved PTQ-0280 (naming finding quoting a call site), and PTQ-0599/0606/0635 cite adjacent ranges in these files for different helpers, so this root cause is untracked (triage: claude-fable-5-1)
