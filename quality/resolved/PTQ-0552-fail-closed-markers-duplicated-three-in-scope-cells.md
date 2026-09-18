---
id: PTQ-0552
title: The FAIL_CLOSED_MARKERS constant and its doc comment are restated verbatim in three in-scope live cells
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/reserved-keyword-key-field-boundary-live-cell.test.ts:143-148
  - tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts:103-108
  - tests/live/pattern-field-integer-narrowing-live-cell.test.ts:120-125
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The FAIL_CLOSED_MARKERS constant and its doc comment are restated verbatim in three in-scope live cells

## Observation
Three of the ten files in this review's scope each declare a module-local constant named `FAIL_CLOSED_MARKERS`, holding the identical three-element tuple `["returned Err:", "cancelled", "aborted"]`, preceded by an identical four-line doc comment (modulo one clause naming which drive's outcome the check gates). Each site then filters a drive's `systemNotes` against the tuple and asserts the filtered list is empty as its "the drive ended clean" check.

## Evidence
`tests/live/reserved-keyword-key-field-boundary-live-cell.test.ts:143-148`:
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * control's drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts:103-108`:
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * sibling drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/pattern-field-integer-narrowing-live-cell.test.ts:120-125`:
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * sibling drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

Each declaration is followed by an identically-shaped filter/assert pair, e.g. `pattern-field-integer-narrowing-live-cell.test.ts:193-201`:
```ts
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0234: the `integer`-spelled sibling's drive must end clean — " +
          "a fail-closed `theta-system-note` here means the narrowing check " +
          "broke the admitted `integer`-under-`integer` production at " +
          "runtime. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
```

## Why this is a problem
The same three literal strings and the same rationale comment are authored three separate times inside this review's ten-file scope alone. Neither `tests/helpers/` nor `tests/live/harness.ts` exports a `FAIL_CLOSED_MARKERS`-shaped constant or a "filter systemNotes for the fail-closed markers" helper for these three files to import instead; each site independently retyped the tuple.

## Suggested direction (non-binding, optional)
A shared constant (and, if useful, the filter-and-assert pairing itself) under `./harness` or `tests/helpers/` is the natural home the three sites already converge on by copying the same tuple and rationale; that is an observation about where the duplication already points, not a design for the shared shape.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or the named gate kinds; not applicable. Recording-double check: `FAIL_CLOSED_MARKERS` gates a positive "the drive ended clean" assertion, not a MUST-NOT-call witness on a recording double; not applicable. docs/bugs/ signature search: grepped `docs/bugs/` for `FAIL_CLOSED_MARKERS` — no hits; not a documented correct-reason red. coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for the three file names — no citation by name; no merge/rename/delete is proposed. A companion filing (`qw20260917154546-d7-90-fail-closed-markers-constant-duplicated.md`) already covers the identical topic for a disjoint set of six other live-cell files; verified none of those six overlap with the three files cited here (`grep` of that file's `locations:` block against these three paths — no match), so this is a distinct, non-duplicate instance of the same recurring pattern.

## Triage
verdict: confirmed — all three excerpts reproduce verbatim at the cited lines (key-field-boundary:143-148, object-pattern-head:103-108, integer-narrowing:120-125) each followed by a live filter/`.toEqual([])` assert (:233-238, :175-182, :193-201); repo grep finds `FAIL_CLOSED_MARKERS` module-locally redeclared in 25 tests/live cells and exported nowhere — tests/live/harness.ts:351-356 only names the three endings in the `systemNotes` doc prose and tests/helpers/ has no marker tuple or filter helper, so each copy is retyped boilerplate (D7 copy-paste class); no gate/recording-double/bug-signature carve-out applies and no merge/rename/delete is proposed (bug docs 0219/0234/0249 cite the files only as witnesses); not tracked in open/resolved, and intake sibling d7-90 covers a verified-disjoint six-file set under the wave's per-shard split convention (cf. PTQ-0311/0313 registry-oracle instances) (triage: claude-fable-5-1)
