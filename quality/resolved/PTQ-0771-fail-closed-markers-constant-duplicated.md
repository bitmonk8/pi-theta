---
id: PTQ-0771
title: The FAIL_CLOSED_MARKERS constant and its doc comment are restated verbatim in six in-scope live cells
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0191live-enum-shadow-registration-live-cell.test.ts:159-163
  - tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:150-154
  - tests/live/b0251live-tolerated-junk-carrier-live-cell.test.ts:107-111
  - tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:203-207
  - tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:162-166
  - tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:170-174
sites: 6
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The FAIL_CLOSED_MARKERS constant and its doc comment are restated verbatim in six in-scope live cells

## Observation
Six of the ten files in this review's scope each declare a module-local
constant named `FAIL_CLOSED_MARKERS`, holding the identical three-element
tuple `["returned Err:", "cancelled", "aborted"]`, preceded by a doc comment
that is word-for-word identical (modulo one clause naming which half's drive
the check gates) across all six files. Each site then filters a drive's
`systemNotes` against this tuple and asserts the filtered list is empty as
its "the drive ended clean" check.

## Evidence
`tests/live/b0191live-enum-shadow-registration-live-cell.test.ts:159-163`:
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * CLEAN drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:150-154`:
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * control's drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/b0251live-tolerated-junk-carrier-live-cell.test.ts:107-111`:
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). A
 * successful bind must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts:203-207`,
`tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:162-166`
and `tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:170-174`
each carry the same declaration, re-read from each file: identical doc
comment wording ("The control's drive must produce none of them.") and the
identical `["returned Err:", "cancelled", "aborted"] as const` tuple.

Search: `grep -n "FAIL_CLOSED_MARKERS = \["` across the ten in-scope files
returns exactly 6 hits, one per file listed above; the remaining four
in-scope files (`b0106`, `b0138`, `b0146`, `b0248`) never drive a turn and so
never declare this constant.

## Why this is a problem
The three literal marker strings and the filter/assert shape that consumes
them
(`turn.systemNotes.filter((note) => FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)))`
then `.toEqual([])`) are restated independently at each of the six sites
rather than living in one place both `./harness` and `tests/helpers` already
serve as a home for other cross-cutting live-cell fixtures. None of the six
declarations references another; each is its own literal array, so a fourth
marker string added to the fail-closed vocabulary at one site would not
propagate to the other five.

## Suggested direction (non-binding, optional)
The natural home for this constant — as an observation, not a design — is
`tests/live/harness.ts`, alongside `driveSlashCaptureTurn` and
`classifyLastTurn`, which already read the same `theta-system-note` channel
for the same fail-closed determination internally.

## False-positive check
- Gate-pin check: none of the six files match `*gate*.test.ts` or the named
  gate kinds; not applicable.
- Recording-double check: not applicable — this is a literal marker-string
  constant used in a positive "ended clean" assertion, not a recording double.
- docs/bugs/ signature search: `grep -rl "FAIL_CLOSED_MARKERS"` under
  `docs/bugs/` returns no hits; no documented correct-reason-red cites this
  constant.
- coverage-matrix/bug-doc citation search: the finding proposes no merge,
  rename, or deletion of any test — only that the six identical declarations
  live once in the already-imported harness module — so the citation-pinning
  rule does not apply.
- Confirmed this stays a test-code-only observation: `tests/live/harness.ts`
  is itself a test-support module under `tests/`, not `src/`, `extensions/`,
  or `tools/`.
- Confirmed this is not a coverage claim: every site already performs the
  equivalent fail-closed check; the six copies are independently declared
  rather than shared.

## Triage
verdict: confirmed — all six excerpts reproduce verbatim (doc comment at :158-163, :149-154, :106-111, :202-207, :161-166, :169-174; one-line drift on the first), each followed by a live `systemNotes.filter(FAIL_CLOSED_MARKERS.some(...))`/`.toEqual([])` assert (:239, :237, :195, :284, :252, :273); repo grep shows the tuple module-locally redeclared in 25 tests/live cells and exported nowhere (tests/live/harness.ts only names the three endings in `systemNotes` doc prose at :353; tests/helpers/ has no marker tuple or filter helper), so each copy is retyped boilerplate (D7 copy-paste class); the four other shard-90 files (b0106/b0138/b0146/b0248) carry no declaration as stated; no gate/recording-double/bug-signature carve-out applies (docs/bugs grep: no hits; no merge/rename/delete proposed); not tracked in open/resolved, and intake sibling d7-02 (confirmed) covers a verified-disjoint three-file set with its triage note already recording d7-90 as a distinct instance under the wave's per-shard split convention (cf. PTQ-0311/0313/0404/0411 registry-oracle instances) (triage: claude-fable-5-1)
