---
id: PTQ-1019
title: the `array` arity-1-over-2 registry line is built from the same literal three times inside nested-inline-enum-generic-argument-refusal.test.ts
lens: D7
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:781-785
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:967-971
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:1163-1167
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the `array` arity-1-over-2 registry line is built from the same literal three times inside nested-inline-enum-generic-argument-refusal.test.ts

## Observation
`tests/nested-inline-enum-generic-argument-refusal.test.ts` renders the same
registered `theta/parse/generic-arity-mismatch` line — `array`, expected `1`,
actual `2` — through three independent calls to `line(ARITY, [...])` with the
identical three-entry substitution array, once as a module-scope `const`
inside the `(c)` describe block, once recomputed inside a `for`-loop body
inside the `(d)` describe block, and once again as a module-scope `const`
inside the `(f)` describe block. No shared constant or helper backs any of
the three.

## Evidence
`tests/nested-inline-enum-generic-argument-refusal.test.ts:781-785` (inside `describe("bug 0217 (c) …")`):
```ts
  const ARITY_ARRAY_TWO = line(ARITY, [
    ["<ctor>", "array"],
    ["<expected>", "1"],
    ["<actual>", "2"],
  ]);
```

`tests/nested-inline-enum-generic-argument-refusal.test.ts:967-971` (inside `describe("bug 0217 (d) …")`, re-declared inside the body of a `for (const position of SINK_POSITIONS)` loop, so it is re-evaluated once per iteration):
```ts
      const arityArrayTwo = line(ARITY, [
        ["<ctor>", "array"],
        ["<expected>", "1"],
        ["<actual>", "2"],
      ]);
```

`tests/nested-inline-enum-generic-argument-refusal.test.ts:1163-1167` (inside `describe("bug 0217 (f) …")`):
```ts
  const arityArrayTwo = line(ARITY, [
    ["<ctor>", "array"],
    ["<expected>", "1"],
    ["<actual>", "2"],
  ]);
```

Exact search: `grep -n "line(ARITY" tests/nested-inline-enum-generic-argument-refusal.test.ts` returns exactly these three hits, no others. `grep -rn "generic-arity-mismatch\|GENERIC_ARITY\|arityMessage\|arityLine" tests/helpers/*.ts` returns no hit — no `tests/helpers/` module exports a builder for this registry line.

## Why this is a problem
The same four-line substitution literal for the one registered arity message this file exercises (`array` over-applied to 2 arguments against arity 1) is retyped three times in one file rather than declared once. The middle copy (:967-971) is additionally declared inside the loop body it is used in, so it is rebuilt on every one of the loop's iterations rather than being hoisted once like the other two copies in the same file. A change to the placeholder set this registry row carries would need the identical hand-edit applied in three places within this one file to stay in sync, with nothing surfacing a copy left behind.

## Suggested direction (non-binding, optional)
The two module-scope copies (:781-785, :1163-1167) already show the shape a single file-scope constant would take; the loop-body copy (:967-971) already sits beside a `for` loop that could read the same constant instead of rebuilding it once per iteration.

## False-positive check
- Gate-pin check: `tests/nested-inline-enum-generic-argument-refusal.test.ts` does not match `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing cited here is a pinned count or corpus inventory.
- Recording-double check: `line(ARITY, [...])` builds an expected message string for a positive `toEqual` assertion; it is not a recording double backing a "never called" MUST-NOT witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "ARITY_ARRAY_TWO\|arityArrayTwo" docs/bugs/*.md` returns 0 hits; no documented correct-reason red names this literal.
- coverage-matrix/bug-doc citation search: `grep -n "nested-inline-enum-generic-argument-refusal" docs/reference/coverage-matrix.md` returns 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` cell — only that the three identical literal declarations could be one.
- Prior-filing search: `grep -rl "ARITY_ARRAY_TWO\|arityArrayTwo" quality/issues quality/intake quality/resolved` returns no hit before this filing.
- Coverage-drift check: this claim is about a repeated literal-construction expression that exists three times today; every cited copy is already exercised by its own file's passing tests, and no claim is made that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/nested-inline-enum-generic-argument-refusal.test.ts:781-785 / :967-971 (inside the `for (const position of SINK_POSITIONS)` body) / :1163-1167; `grep -n "line(ARITY"` returns exactly those three hits; `line` is the imported `registryErrorLine` from tests/helpers/registry-oracle.ts, whose exports (`arrayElementMessage`, `letRhsMessage`, `fnArgMessage`, …) include no pre-bound `generic-arity-mismatch` builder; file is not a gate kin, uncited by docs/reference/coverage-matrix.md or docs/bugs/, and no `it()` is merged/renamed; not a duplicate — PTQ-0638 (fixed)/0861/0880/0951 cite this file only for the `registryMessageOf`/`line` reader and sink harness, none for this literal. One correction to the filing's coverage-drift check: the :1163 `arityArrayTwo` has ZERO readers (`awk 'NR>1167 && /arityArrayTwo/'` is empty — the (f) loop asserts `r.codes` against `[ARITY, LET_MISMATCH]`/`[ARITY]`, and eslint ignores tests/), so that copy is a pasted-and-never-wired redeclaration, which strengthens rather than refutes the triplication; fix is one hoisted file-scope constant read at :802 and :979 and deletion of the dead third copy (triage: claude-fable-5-1)
