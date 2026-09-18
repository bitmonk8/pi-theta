---
id: PTQ-1065
title: The three-expect echoed-sentinel-cardinality block is retyped identically three times inside typed-query-wire-shapes.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/typed-query-wire-shapes.test.ts:225-238
  - tests/live/typed-query-wire-shapes.test.ts:302-315
  - tests/live/typed-query-wire-shapes.test.ts:474-487
sites: 3
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The three-expect echoed-sentinel-cardinality block is retyped identically three times inside typed-query-wire-shapes.test.ts

## Observation
`tests/live/typed-query-wire-shapes.test.ts` contains three `it()` blocks
(the enum-root cell, the nested-`$ref` cell, and the canonical-slug cell).
Each one, after computing its own `echoed` array
(`turn.userTexts.filter((text) => text.includes(sentinel))`), runs the
identical sequence of three `expect()` calls — a lower-bound check, an
upper-bound check tied to `turn.reAskCount`, and a byte-identity check via
`new Set(echoed).size` — with byte-identical failure-message text in all
three occurrences.

## Evidence

`tests/live/typed-query-wire-shapes.test.ts:225-238` (enum-root cell):
```ts
      expect(
        echoed.length,
        `at least one and at most ${1 + turn.reAskCount} rendered follow-up query must carry ` +
          `the sentinel; observed userTexts=${JSON.stringify(turn.userTexts)}`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        echoed.length,
        `at least one and at most ${1 + turn.reAskCount} rendered follow-up query must carry ` +
          `the sentinel; observed userTexts=${JSON.stringify(turn.userTexts)}`,
      ).toBeLessThanOrEqual(1 + turn.reAskCount);
      expect(
        new Set(echoed).size,
        `every sentinel-carrying occurrence must be byte-identical (the bounded re-ask ` +
          `re-issues the last user text verbatim; a distinct second query is a real leak, ` +
          `not a re-ask) — observed echoed=${JSON.stringify(echoed)}`,
      ).toBe(1);
```

`tests/live/typed-query-wire-shapes.test.ts:302-315` (nested-`$ref` cell) —
the identical nine-line, three-`expect()` block, byte-for-byte, re-read
immediately before filing.

`tests/live/typed-query-wire-shapes.test.ts:474-487` (canonical-slug cell) —
the same block again, byte-for-byte, re-read immediately before filing.

Exact search: `grep -n "echoed.length\|new Set(echoed).size"
tests/live/typed-query-wire-shapes.test.ts` → 9 hits (3 occurrences × 3
`expect()` calls each), at exactly the three line ranges cited above.

## Why this is a problem
The same three-assertion cardinality/identity check on the `echoed` array
— itself documented once, in the first occurrence's preceding comment, as
the bug-0290 bounded-re-ask accommodation — is retyped whole into the second
and third `it()` blocks with no comment repeating the rationale (the reader
is pointed back to "see the enum-root cell above" in both later occurrences'
one-line comments, rather than the check being shared). A change to the
re-ask accommodation's bounds or to the identity check's rationale has to be
applied at three sites inside this one file to stay consistent.

## Suggested direction (non-binding, optional)
A single local helper taking `turn` and `sentinel` and returning the
`echoed` array after running the three assertions is the natural
consolidation the file's own repeated "see the enum-root cell above"
comments already point toward.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: `echoed`/`turn.userTexts` are read off a real
  driven turn's deterministic outbound-render channel, not a call-recording
  double backing a MUST-NOT-called witness; not applicable.
- docs/bugs/ signature search: `grep -rl "echoed.length"  docs/bugs/*.md` →
  0 hits; `docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md`
  and the bug-0290/bug-0099 references this file's own comments cite
  describe rationale for the check's bounds, not for keeping three copies of
  it.
- coverage-matrix/bug-doc citation search: `grep -n "typed-query-wire-shapes"
  docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion
  of any `it()`/`describe()` is proposed — only that the repeated
  three-assertion block could be a local helper — so the citation carve-out
  does not bind.
- Prior-finding overlap check: `grep -rl "typed-query-wire-shapes"
  quality/intake/*.md quality/issues/*.md quality/resolved/*.md` → 0 hits
  before this filing.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: the three 14-line `expect()` blocks at :225-238/:302-315/:474-487 are byte-identical (mktemp sed-range extracts share md5 dde400e1; the enclosing :218-238 vs :299-315 diff differs only in the preceding comment, :299-315 vs :471-487 diff is empty), the `echoed.length|new Set(echoed).size` grep returns exactly the 9 cited hits, no helper in tests/helpers/ or tests/live/harness.ts covers this shape (harness.ts only populates `reAskCount`; the only other consumer, live-production-acceptance.test.ts:9845, uses the distinct exact-form `toHaveLength(1 + turn.reAskCount)`), and the class is D7 boilerplate duplication inside tests/live/ with no gate-pin or recording-double carve-out; two of the candidate's FP-check greps do NOT reproduce as stated but neither refutes it — `echoed.length` in docs/bugs/ hits 0290 (1, not 0), whose §Fix (b) cites these three cells as the edited sites and whose Residual 3 records this very repetition as an acknowledged leftover ("a shared helper is not owed by §Fix" — scoping the fix, not ruling the copies must stay; the proposed helper returns `echoed` so the per-cell `echoed[0]` wire-value assertions and the file's `it()`s are untouched, so the bug-doc witness carve-out does not bind), and the quality overlap grep hits PTQ-0546 (resolved) plus same-wave qw20260918202006-d7-03 (2, not 0), both of which cover the console.error spy-gate block in other live cells, not this root cause (0 quality files mention `echoed`/`reAskCount`) — not a duplicate (triage: claude-fable-5-1)
