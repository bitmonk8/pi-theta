---
id: PTQ-0599
title: the planted-stem suffix-collision guard loop is duplicated byte-for-byte across five production-load test files, uncentralised by PTQ-0210's harness extraction
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:665-672
  - tests/division-result-type-number-invoke.test.ts:258-264
  - tests/invoke-arg-array-literal-provable.test.ts:442-449
  - tests/invoke-arg-type-mismatch-wired.test.ts:496-503
  - tests/modulo-zero-result-type-number.test.ts:1850-1856
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# the planted-stem suffix-collision guard loop is duplicated byte-for-byte across five production-load test files, uncentralised by PTQ-0210's harness extraction

## Observation
`tests/arg-mismatch-diagnostic-count-by-surface.test.ts`'s `beforeAll` runs a
loop over every planted fixture stem, asserting that no stem is a suffix of
another (because the per-caller diagnostic-attribution regex matches
`<separator><stem>.<ext>`, so a suffix pair would let one caller's diagnostic
satisfy or defeat another caller's exact-count assertion). The identical
seven/eight-line loop — same variable names (`stems`, `stem`, `shadowed`),
same `.filter((other) => other !== stem && other.endsWith(stem))` predicate,
same `expect(shadowed, ...).toEqual([])` — recurs verbatim in four sibling
files that each also drive `discoverAndComposeFixtures` over a planted
workspace. `tests/helpers/production-load-harness.ts` already centralises the
surrounding `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace`
harness these same five files share (per the resolved PTQ-0210, whose own
evidence already quoted this guard recurring at all five sites), but that
extraction did not carry the suffix-collision guard itself into the shared
module, so all five copies remain.

## Evidence

`tests/arg-mismatch-diagnostic-count-by-surface.test.ts:665-672`:
```ts
  for (const stem of stems) {
    const shadowed = stems.filter((other) => other !== stem && other.endsWith(stem));
    expect(
      shadowed,
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so ` +
        "per-caller diagnostic attribution below is ambiguous",
    ).toEqual([]);
  }
```

`tests/division-result-type-number-invoke.test.ts:258-264` (identical loop,
message string unwrapped onto one line rather than split with `+`):
```ts
  for (const stem of stems) {
    const shadowed = stems.filter((other) => other !== stem && other.endsWith(stem));
    expect(
      shadowed,
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so per-caller diagnostic attribution below is ambiguous`,
    ).toEqual([]);
  }
```

`tests/invoke-arg-array-literal-provable.test.ts:442-449` — byte-identical to
the first excerpt (`diff` produces no output).

`tests/invoke-arg-type-mismatch-wired.test.ts:496-503` — byte-identical to
the first excerpt.

`tests/modulo-zero-result-type-number.test.ts:1850-1856` — byte-identical to
the second (unwrapped-message) excerpt.

Exact search: `grep -rln "other.endsWith(stem)" tests/*.test.ts` → exactly
these five files, no others. `grep -n "suffix\|shadowed" tests/helpers/production-load-harness.ts` →
0 hits — the shared harness module that PTQ-0210 created for this same
five-file family does not export this guard.

## Why this is a problem
The same attribution-safety loop is typed out five times rather than pulled
into the `tests/helpers/production-load-harness.ts` module that already
centralises the surrounding harness for this exact file family. PTQ-0210's
own evidence section already quoted this guard recurring at all five of these
line ranges (as part of a larger duplicated `beforeAll` body), but its fix
extracted only `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace` —
confirmed by the current header comment of `production-load-harness.ts`,
which names only those three pieces as "centralise[d]" — leaving the
suffix-collision guard as a fifth uncentralised copy in each of the same five
files that harness now imports from.

## Suggested direction (non-binding, optional)
A `assertNoStemIsASuffix(stems)`-shaped export alongside `plantThetaWorkspace`
in `tests/helpers/production-load-harness.ts` is the natural home the five
byte-identical copies point at, consistent with that module's own stated
purpose of centralising the shared parts of this exact harness family.

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or the named
  gate kin; the cited lines are a fixture-attribution safety check, not a
  pinned count or inventory.
- Recording-double check: `shadowed` is a one-shot filter result asserted
  once per stem, not a recording double backing a MUST-NOT-called witness.
- docs/bugs/ signature search: `grep -rl "endsWith(stem)" docs/bugs/*.md` → 0
  hits; no documented correct-reason red covers this guard, and
  `tests/arg-mismatch-diagnostic-count-by-surface.test.ts` is fully green.
- coverage-matrix/bug-doc citation search: `grep -n
  "arg-mismatch-diagnostic-count-by-surface\|division-result-type-number-invoke\|invoke-arg-array-literal-provable\|invoke-arg-type-mismatch-wired\|modulo-zero-result-type-number"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the five files or any `it()`/
  `describe()` — only that the five identical guard loops could import a
  shared assertion — so no citation is affected.
- Coverage check: the claim is about a repeated safety-check DEFINITION, not
  a missing test path; the guard runs in every one of the five files'
  `beforeAll`.
- Overlap/duplicate check: PTQ-0210 (resolved, status fixed) already quoted
  this exact guard at these exact five files as part of its own evidence
  section, but its title, Observation and Suggested-direction are scoped to
  the `runProductionLoad` stderr-mirror function and the `pi`/`ctx` fake host
  — the guard loop sits OUTSIDE the `runProductionLoad` function body in all
  five files (it runs in each file's own `beforeAll`, before
  `runProductionLoad`/`plantThetaWorkspace` is ever called) and is not named
  in PTQ-0210's Suggested-direction paragraph; the current
  `tests/helpers/production-load-harness.ts` (re-read in full) confirms only
  `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace` were
  centralised, so this is a residual, uncentralised piece of the same family
  rather than a re-filing of PTQ-0210's own claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts sit at the cited lines and `diff` of the extracted ranges shows a/c/d byte-identical and b/e byte-identical (a↔b differ only in the `+`-wrapped vs single-line message), `grep -rl "other.endsWith(stem)"` across src/extensions/tools/tests hits exactly these five files and no tests/helpers module hosts the guard; D7 boilerplate-duplication in tests/ only, no gate-name/recording-double/docs-bugs (0 hits)/coverage-matrix (0 hits) carve-out applies, and not a duplicate — PTQ-0210's root cause was the runProductionLoad body (its fix migrated only arg-mismatch, so the candidate's "five files that harness now imports from" is inaccurate: 4/5 still inline runProductionLoad, and plant/dispose came from PTQ-0312 not PTQ-0210), PTQ-0312 explicitly set this guard aside as "unrelated", and the sibling intake d7-106-01 covers modulo-zero's harness/lifecycle, not the guard; the narrative slip does not touch the root cause, evidence, or anchor (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
