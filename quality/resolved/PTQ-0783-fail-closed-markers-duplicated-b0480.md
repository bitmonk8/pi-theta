---
id: PTQ-0783
title: b0480live redeclares the FAIL_CLOSED_MARKERS constant already duplicated across 23 other live cells
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0480live-responses-typed-query-live-cell.test.ts:107-113
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917204232
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0480live redeclares the FAIL_CLOSED_MARKERS constant already duplicated across 23 other live cells

## Observation
`tests/live/b0480live-responses-typed-query-live-cell.test.ts` declares a
module-local `FAIL_CLOSED_MARKERS` constant and then filters a drive's
`turn.systemNotes` against it to assert the drive ended clean. The same
constant name, the same first three literal marker strings
(`"returned Err:"`, `"cancelled"`, `"aborted"`), and the same
filter/`toEqual([])` consumption shape are independently redeclared in at
least 23 other `tests/live/*.test.ts` files, two disjoint subsets of which
(6 files, 3 files) are already confirmed as this exact D7 duplication class
in `quality/issues/PTQ-0771-fail-closed-markers-constant-duplicated.md` and
`quality/issues/PTQ-0552-fail-closed-markers-duplicated-three-in-scope-cells.md`.
Neither of those two filings' `locations:` lists cites `b0480live`, and its
own copy is a superset variant (four markers instead of three, adding
`"does not support forced tool-use"`), so this is a disjoint, previously
uncited instance of the same already-tracked root cause.

## Evidence
`tests/live/b0480live-responses-typed-query-live-cell.test.ts:107-113`
(re-read immediately before filing):
```ts
/** Every fail-closed ending of a top-level drive lands on the note channel. */
const FAIL_CLOSED_MARKERS = [
  "returned Err:",
  "does not support forced tool-use",
  "cancelled",
  "aborted",
] as const;
```
consumed at `tests/live/b0480live-responses-typed-query-live-cell.test.ts:199-203`:
```ts
      expect(
        turn.systemNotes.filter((note) => FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker))),
        "the typed drive ended fail-closed on the openai-responses model. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
```

Exact search: `grep -rln "FAIL_CLOSED_MARKERS = \[" tests/live/*.ts` returns
23 files repo-wide, including `b0480live-responses-typed-query-live-cell.test.ts`
(neither `b0106live-cofire-refusal-live-cell.test.ts` nor
`b0248live-nested-malformed-escape-live-cell.test.ts`, this review's other
two files, ever drives a turn and so neither declares this constant).
`grep -n "locations:" -A9 quality/issues/PTQ-0771-fail-closed-markers-constant-duplicated.md quality/issues/PTQ-0552-fail-closed-markers-duplicated-three-in-scope-cells.md` shows their combined 9 cited sites do not include `b0480live`.

## Why this is a problem
The three-marker vocabulary and the filter/assert shape that consumes it are
restated independently at this site exactly as PTQ-0771 already documents for
six other sites and PTQ-0552 for three more: `tests/live/harness.ts` (the
module every one of these files already imports from) exports neither the
constant nor a helper that filters `systemNotes` against it, so each file,
including this one, retypes its own copy. This site additionally shows the
predicted drift PTQ-0771's own "Why this is a problem" section names directly
("a fourth marker string added to the fail-closed vocabulary at one site
would not propagate to the other five"): `b0480live`'s copy already carries a
fourth marker (`"does not support forced tool-use"`) that the other 23+
copies do not.

## Suggested direction (non-binding, optional)
As PTQ-0771 already observes, the natural home for this constant is
`tests/live/harness.ts`, alongside `driveSlashCaptureTurn`, which already
reads the same `theta-system-note` channel internally; a shared constant
there would also let a file that needs the fourth marker extend one shared
list instead of carrying its own divergent copy.

## False-positive check
- Gate-pin check: `b0480live-responses-typed-query-live-cell.test.ts` does not
  match `*gate*.test.ts` or the named gate kinds; not applicable.
- Recording-double check: `FAIL_CLOSED_MARKERS` gates a positive "the drive
  ended clean" assertion, not a MUST-NOT-call witness on a recording double;
  not applicable.
- docs/bugs/ signature search: `grep -rl "FAIL_CLOSED_MARKERS" docs/bugs/*.md`
  returns no hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0480live-responses-typed-query-live-cell" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of any test — only that the constant could live once in the already-imported harness module.
- Duplicate-filing check: read both `quality/issues/PTQ-0771-fail-closed-markers-constant-duplicated.md` and `quality/issues/PTQ-0552-fail-closed-markers-duplicated-three-in-scope-cells.md` in full; their combined `locations:` (9 files) do not include `b0480live-responses-typed-query-live-cell.test.ts`, and PTQ-0771's own triage note records the wider pattern spans 25 tests/live cells of which only 9 are cited across the two confirmed filings — this finding cites the disjoint tenth site the two existing filings do not, following the same per-shard disjoint-site convention their own triage notes record (cf. PTQ-0552 confirmed as distinct from PTQ-0771 on identical grounds).
- Not a coverage claim: the site already performs the equivalent fail-closed check; the observation is that its declaration is an independently retyped copy of an already-tracked constant.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: the declaration reproduces at tests/live/b0480live-responses-typed-query-live-cell.test.ts:107-113 (four-marker variant) and is live-consumed by the filter/`.toEqual([])` assert at :199-203; `grep -rln "FAIL_CLOSED_MARKERS = \[" tests/live/*.ts` returns 23 files, the identifier is exported nowhere (0 hits in src/extensions/tools/tests outside tests/live; tests/live/harness.ts only names the endings in `systemNotes` doc prose at :353), so this copy is retyped boilerplate (D7 copy-paste class) and its extra `"does not support forced tool-use"` marker is the drift PTQ-0771 predicted (one nit: b0417live:104-109 also carries its own divergent fourth marker `"argument binder unavailable"`, so "the other 23+ copies do not" is off by one — immaterial); location under tests/, not a *gate* file, no recording double, no red test, docs/bugs grep for the constant → 0, coverage-matrix cite → 0, docs/bugs/0480 cites the file only as a witness and no it()/describe() change is proposed; not a duplicate: neither PTQ-0771 (6 sites) nor PTQ-0552 (3 sites) lists this file and both are already minted/open so folding at acceptance is unavailable, and same-wave sibling d7-01 tracks the unrelated regex `failureNotes` scaffold — an uncited additional site of a tracked duplication is a distinct row under store precedent (PTQ-0629/0692 parforhost fifth/sixth site, PTQ-0643 fourth copy, PTQ-0552 vs PTQ-0771); fix alongside those two rows, noting the shared list must admit this site's fourth marker (triage: claude-fable-5-1)
