---
id: PTQ-1072
title: Thirteen tests/live cells still redeclare FAIL_CLOSED_MARKERS locally instead of importing the canonical export tests/helpers/live-transcript.ts already provides
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts:177-181
  - tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts:123-124
  - tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts:113-114
  - tests/live/b0306live-imported-enum-wire-live-cell.test.ts:115-116
  - tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts:108-109
  - tests/live/b0387live-block-tail-query-consumption-live-cell.test.ts:118-122
  - tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts:99-108
  - tests/live/b0481live-fable51-typed-query-degraded-live-cell.test.ts:92-93
  - tests/live/blockexpr-production-live-cell.test.ts:146-150
  - tests/live/inline-object-stray-close-token-live-cell.test.ts:161-165
  - tests/live/object-pattern-head-field-set-live-cell.test.ts:122-126
  - tests/live/object-pattern-head-unresolved-live-cell.test.ts:109-113
  - tests/live/withheld-binder-provenance-live-cell.test.ts:183-187
  - tests/helpers/live-transcript.ts:6-11
sites: 13
fix_scope: cross-module
d4_class: clone
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Thirteen tests/live cells still redeclare FAIL_CLOSED_MARKERS locally instead of importing the canonical export tests/helpers/live-transcript.ts already provides

## Observation
`tests/helpers/live-transcript.ts:11` exports `FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const`, created by the fix for PTQ-0771/PTQ-0552 specifically so that live cells asserting "the drive ended clean" would import one shared tuple instead of retyping it. Nine of the cells those two filings originally cited (b0191live, b0244live, b0251live, b0252live, b0256live, b0257live, reserved-keyword-key-field-boundary, reserved-keyword-object-pattern-head, pattern-field-integer-narrowing) now do import it. Thirteen further `tests/live/*.test.ts` files still declare their own module-local `FAIL_CLOSED_MARKERS` constant with the identical rationale doc comment and, in twelve of the thirteen, the byte-identical three-string tuple; none of the thirteen imports `tests/helpers/live-transcript.ts`.

## Evidence
Exact search: `grep -rn "const FAIL_CLOSED_MARKERS = \[" tests/live/*.test.ts` (plus a follow-up multi-line grep for the one wrapped declaration) → exactly these 13 hits, none of which import `../helpers/live-transcript`; a companion `grep -n "live-transcript" <file>` on each of the 13 returns 0 hits for the `FAIL_CLOSED_MARKERS` symbol (`b0481live` imports only `countOnSessionRespondCalls` from that module, confirming the module is already a known, reachable import target for that file and the marker tuple was still not drawn from it).

`tests/helpers/live-transcript.ts:6-11` (the canonical export, re-read immediately before filing):
```ts
export { collectSystemNotes } from "./recording-system-note-channel";

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). A
 * successful drive must produce none of them.
 */
export const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts:123-124` (one of twelve identical-tuple copies):
```ts
/** The fail-closed markers a top-level theta drive lands on the `theta-system-note` channel. */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```
consumed at `:224`: `FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker))`, the same filter/`.toEqual([])` shape PTQ-0771/PTQ-0552 already cite.

`tests/live/object-pattern-head-field-set-live-cell.test.ts:122-126` (doc comment wording matches the resolved PTQ-0552 copies verbatim):
```ts
/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * sibling drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;
```

`tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts:99-108` (the one divergent copy, a superset tuple with a fourth binder-specific marker prepended — the same drift shape PTQ-0783 already documents for `b0480live`'s copy):
```ts
 * The fail-closed markers a top-level binder failure lands on the
 * `theta-system-note` channel. A successful bind produces none of them; the
 * pre-fix openai-responses drive landed `argument binder unavailable`.
 */
const FAIL_CLOSED_MARKERS = [
  "argument binder unavailable",
  "returned Err:",
  "cancelled",
  "aborted",
] as const;
```

The remaining nine identical-tuple copies (`b0263live:181`, `b0305live:114`, `b0306live:116`, `b0342live:109`, `b0387live:122`, `b0481live:93`, `blockexpr-production-live-cell.test.ts:150`, `inline-object-stray-close-token-live-cell.test.ts:165`, `withheld-binder-provenance-live-cell.test.ts:187`) were each re-read individually and reproduce the identical `const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;` line.

## Why this is a problem
This is the same duplication root cause PTQ-0771, PTQ-0552, and PTQ-0783 already confirmed and fixed for ten other sites — a canonical, already-exported constant exists in this review's own scope (`tests/helpers/live-transcript.ts`), at least one of the thirteen files (`b0481live`) already imports a different symbol from that exact module, and yet all thirteen still carry their own retyped copy of the tuple and its rationale comment. PTQ-0771's own "Why this is a problem" predicted the drift risk directly ("a fourth marker string added to the fail-closed vocabulary at one site would not propagate to the other five"); `b0417live`'s copy is exactly that drift, one file over from `b0480live`'s already-fixed instance, and it too failed to converge on the shared export once the canonical location existed.

## Suggested direction (non-binding, optional)
Importing `FAIL_CLOSED_MARKERS` from `tests/helpers/live-transcript.ts` in the twelve identical-tuple files, and importing-and-extending it in `b0417live` the same way the fixed `b0480live` copy already does, is the natural fold the now-existing canonical export already points these thirteen files at.

## False-positive check
- Gate-pin check: none of the thirteen files match `*gate*.test.ts` or the named gate kinds; the cited lines are a literal marker-tuple constant, not a pinned count or inventory.
- Recording-double check: `FAIL_CLOSED_MARKERS` gates a positive "the drive ended clean" assertion consumed via `.filter(...).toEqual([])`, not a MUST-NOT-call witness on a recording double; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "FAIL_CLOSED_MARKERS" docs/bugs/*.md` → 0 hits; none of the thirteen bug numbers (0263, 0303, 0305, 0306, 0342, 0387, 0417, 0481) documents this duplication as a correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0263live\|b0303live\|b0305live\|b0306live\|b0342live\|b0387live\|b0417live\|b0481live\|blockexpr-production-live-cell\|inline-object-stray-close-token-live-cell\|object-pattern-head-field-set-live-cell\|object-pattern-head-unresolved-live-cell\|withheld-binder-provenance-live-cell" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename, or deletion of any test, only that the already-exported constant could be imported instead of retyped.
- Duplicate/overlap check: read `quality/resolved/PTQ-0552-fail-closed-markers-duplicated-three-in-scope-cells.md`, `quality/resolved/PTQ-0771-fail-closed-markers-constant-duplicated.md`, and `quality/resolved/PTQ-0783-fail-closed-markers-duplicated-b0480.md` in full — their combined ten cited sites (`b0191live`, `b0244live`, `b0251live`, `b0252live`, `b0256live`, `b0257live`, `reserved-keyword-key-field-boundary`, `reserved-keyword-object-pattern-head`, `pattern-field-integer-narrowing`, `b0480live`) are disjoint from all thirteen files cited here (checked by name against each finding's `locations:` block); also grepped `quality/issues/*.md` and `quality/intake/*.md` for `FAIL_CLOSED_MARKERS` — the only hits (`PTQ-0622`, `PTQ-0755`, `PTQ-0759`, `PTQ-0762`, `PTQ-0780`, `PTQ-1062`) either reference the already-fixed PTQ-0552/0771/0783 rows in their own fix-attempt logs or cover unrelated fixture/precondition scaffolds in a disjoint file set, none of them the thirteen files or line ranges cited here.
- Coverage-drift check: this finding is about a duplicated constant declaration existing today alongside a proven-reachable import target (`b0481live` already imports a sibling symbol from the same module); it makes no claim about any untested path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `grep -rn "const FAIL_CLOSED_MARKERS" tests/ src/ extensions/ tools/` → 1 canonical export at tests/helpers/live-transcript.ts:11 plus exactly 14 tests/live declarations, of which b0480live is the PTQ-0783 import-and-extend form (`...DRIVE_FAIL_CLOSED_MARKERS`) and the other 13 are the candidate's set; every excerpt reproduces verbatim at the cited lines (b0303:123-124/:224, object-pattern-head-field-set:122-126, b0417:99-108 four-string superset, b0263:177-181, withheld:183-187, and the identical three-string line at b0305:114, b0306:116, b0342:109, b0387:122, b0481:93, blockexpr:150, stray-close-token:165, opf-unresolved:113); `grep -c live-transcript` is 0 in 12 of the 13 and 1 in b0481live (only `countOnSessionRespondCalls`, :66), while `grep -rl "import.*FAIL_CLOSED_MARKERS" tests/live` returns exactly the 10 files PTQ-0552/0771/0783 already migrated — disjoint from all 13 here; all 14 consumers use the same `FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker))` filter shape; no carve-out binds (no *gate* file, positive clean-drive assertion not a recording-double negative witness, `FAIL_CLOSED_MARKERS` → 0 hits in docs/bugs/, the 13 stems → 0 hits in docs/reference/coverage-matrix.md); dedupe: PTQ-0780 is the filter+expect scaffold in live-production-acceptance.test.ts (different file, different block), PTQ-0762 cites b0303/b0305/b0306 at :131-151 for the composeCodesOf guard (different lines/root cause), PTQ-1062 cites the already-migrated b0244/b0252/b0256/b0257 quartet; no open or resolved row carries these 13 sites, so this is a fresh D7 boilerplate-duplication carrier whose fix is a mechanical import migration (plus import-and-extend for b0417live mirroring b0480live) (triage: claude-fable-5-1)
