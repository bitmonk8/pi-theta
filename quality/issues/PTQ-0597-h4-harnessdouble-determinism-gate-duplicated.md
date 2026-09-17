---
id: PTQ-0597
title: response-programming-surface.test.ts's harnessDouble() and determinism-gate test body are duplicated byte-for-byte (apart from names) in modeled-behaviour-surface.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/response-programming-surface.test.ts:24-26
  - tests/response-programming-surface.test.ts:52-65
  - tests/modeled-behaviour-surface.test.ts:28-30
  - tests/modeled-behaviour-surface.test.ts:56-69
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# response-programming-surface.test.ts's harnessDouble() and determinism-gate test body are duplicated byte-for-byte (apart from names) in modeled-behaviour-surface.test.ts

## Observation
tests/response-programming-surface.test.ts (H4b) and
tests/modeled-behaviour-surface.test.ts (H4c) each declare their own
module-scope `harnessDouble()` function, and each declares a determinism-gate
`it(...)` whose body constructs two harness doubles, scripts them with an
identical local scripting function, and asserts same-instance replay equality
plus cross-instance equality against the first run's transcript. The two
`harnessDouble` functions are byte-identical; the two determinism-gate test
bodies are identical statement-for-statement, differing only in the local
script-function name (`scriptAllCategories` vs `scriptModeledCategories`) and
the test title's wording ("replays the same scripted inputs…" vs "…scripted
modeled inputs…").

## Evidence
tests/response-programming-surface.test.ts:24-26:
```ts
function harnessDouble() {
  return loadExtension({ fixtures: [] }).double;
}
```

tests/modeled-behaviour-surface.test.ts:28-30 — byte-identical:
```ts
function harnessDouble() {
  return loadExtension({ fixtures: [] }).double;
}
```

tests/response-programming-surface.test.ts:52-65:
```ts
  it("replays the same scripted inputs to the same observable transcript on every run", () => {
    const first = harnessDouble();
    scriptAllCategories(first);
    const runA = first.driveResponses();
    const runB = first.responses.drive();
    // Same instance, replayed: byte-identical observable transcript.
    expect(runB).toEqual(runA);

    // A second, independently-constructed harness double with the identical
    // script yields the identical transcript (cross-instance determinism).
    const second = harnessDouble();
    scriptAllCategories(second);
    expect(second.driveResponses()).toEqual(runA);
  });
```

tests/modeled-behaviour-surface.test.ts:56-69 — same statement sequence,
only the script-function name and title text differ:
```ts
  it("replays the same scripted modeled inputs to the same transcript on every run", () => {
    const first = harnessDouble();
    scriptModeledCategories(first);
    const runA = first.driveResponses();
    const runB = first.responses.drive();
    // Same instance, replayed: byte-identical observable transcript.
    expect(runB).toEqual(runA);

    // A second, independently-constructed harness double with the identical
    // script yields the identical transcript (cross-instance determinism).
    const second = harnessDouble();
    scriptModeledCategories(second);
    expect(second.driveResponses()).toEqual(runA);
  });
```

Exact search: `grep -rn "function harnessDouble" tests/*.ts` → 2 hits (these
two files only). `grep -rn "same-instance, replayed: byte-identical observable
transcript" tests/*.ts` (the shared comment text) → 2 hits, same two files.
The third file in this H4 family, tests/extension-factory-harness.test.ts
(H4a), carries no `harnessDouble` function and no matching determinism-gate
test body (`grep -n "determinism" tests/extension-factory-harness.test.ts` →
0 hits).

## Why this is a problem
The `harnessDouble()` wrapper and the "construct two doubles, script them
identically, assert same-instance and cross-instance transcript equality"
determinism-gate body are restated statement-for-statement across the two
files, varying only in the name of the locally-defined scripting function
and the test title's wording. Neither piece is exported from
`./harness/index` or any `tests/helpers/` module for the two files to share.

## Suggested direction (non-binding, optional)
`./harness/index` (or a `tests/helpers/` module) exporting `harnessDouble()`
and a `assertDeterministicReplay(double, scriptFn)` helper parameterised by
each file's own scripting function is the natural home the two independent
copies already converge on.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin;
  the cited lines are a harness-loader wrapper and a determinism-check test
  body, not a pinned count or inventory assertion.
- Recording-double check: `harnessDouble()` returns the scripting/drive
  surface from `loadExtension`; it is not itself a recording double backing
  a MUST-NOT-called witness — the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "response-programming-surface\|modeled-behaviour-surface"
  docs/bugs/*.md` → 0 hits; neither file is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "response-programming-surface\|modeled-behaviour-surface"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that the
  shared wrapper/body could be imported from one place.
- Coverage check: the claim is entirely about a repeated harness-wrapper and
  test-body DEFINITION; both files' determinism cells pass at HEAD under the
  current duplicated form, so this is not a coverage-gap claim.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: harnessDouble() bodies at response-programming-surface.test.ts:24-26 and modeled-behaviour-surface.test.ts:28-30 diff byte-identical; the determinism-gate bodies at :52-65 / :56-69 diff to only the it() title once the script-function name is normalised; `function harnessDouble` greps to exactly these two tests/ files (0 hits in src/extensions/tools) and tests/harness/index.ts exports only SessionDouble/response-program types/LoadedExtension/loadExtension, so no shared home exists yet; H4a has no determinism test; neither file is a *gate* kin, a negative-witness recording double, a docs/bugs signature, or a coverage-matrix citation, and no it()/describe() is merged/renamed/deleted; both files pass at HEAD (22/22); no open/resolved/rejected PTQ tracks this root cause — in-scope D7 boilerplate/copy-paste duplication with a mechanical dedupe (triage: claude-fable-5-1)
