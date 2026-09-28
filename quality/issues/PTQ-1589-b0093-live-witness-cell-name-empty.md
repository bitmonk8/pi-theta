---
id: PTQ-1589
title: Bug 0093's fix record cites its live witness as "Live H8a cell ``", an empty identifier, and never names the live test file
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0093-let-annotation-query-position-double-emission.md:572-576
  - tests/live/let-annotation-query-double-emission-live-cell.test.ts:1-10
  - tests/live/let-annotation-query-double-emission-live-cell.test.ts:152-153
  - tests/live/let-annotation-query-double-emission-live-cell.test.ts:208-217
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0093's fix record cites its live witness as "Live H8a cell ``", an empty identifier, and never names the live test file

## Observation
`docs/bugs/0093-let-annotation-query-position-double-emission.md` §Fix (0.155.0) *Verification* item (3) claims a live H8a cell that is "green post-fix and red pre-fix … red-proved in both directions under the live lock". Its only pointer to that cell is an empty inline-code span (`` `` ``). The record contains no path to the live cell file (`grep -n "let-annotation-query-double-emission-live-cell"` over the record → 0 hits). The cell that matches the claim is `tests/live/let-annotation-query-double-emission-live-cell.test.ts`. The fix commit `85717fa8` added it, and it asserts the claimed count of exactly one `empty-schema-body` line.

## Evidence
Claim side, `docs/bugs/0093-let-annotation-query-position-double-emission.md:572-576` (re-read before filing):
```
  `unresolved-named-type`). (2) Full default suite green, 350/6980. (3) Live
  H8a cell `` green post-fix and red pre-fix with the pinned signature
  `expected 2 to be 1` over the two delivered
  `theta/parse/empty-schema-body` note lines — red-proved in both directions
  under the live lock. (3b) The H9a acceptance half ran green in full (2 files,
```

Evidence side, `tests/live/let-annotation-query-double-emission-live-cell.test.ts:1-3`:
```
// Bug 0093 — the `` live cell: a `let` annotation over a bare-query
// initialiser must reach the author's diagnostic batch ONCE
// (docs/bugs/0093-let-annotation-query-position-double-emission.md).
```
`:152-153`:
```
describe("bug 0093 — a propagated `let` annotation reaches the author's diagnostic batch once (Convention: live-host acceptance)", () => {
  it(": the theta whose body is `let r: {} = @`hi`` is refused, and the theta-system-note batch carries exactly ONE empty-schema-body line for it, through the real discovery→registration path", async () => {
```
`:208-217` (the assertion behind the record's `expected 2 to be 1` signature):
```
      expect(
        occurrences,
        ": the author-visible batch must carry exactly ONE empty-schema-body line for " +
          "the one written `{}`. A count of 2 is bug 0093's double emission surviving into " +
          ...
      ).toBe(1);
```

Searches (run this session):
- `grep -n "let-annotation-query-double-emission" docs/bugs/0093-…md` → 3 hits (:550, :649, :666). All three name the default-suite file `tests/let-annotation-query-double-emission.test.ts`, and none names the `-live-cell` file.
- `grep -rn "let-annotation-query-double-emission-live-cell" docs tests AGENTS.md CHANGELOG.md` → 3 hits: `docs/bugs/0290-…md:303`, `tests/live/empty-template-warning-registration-live-cell.test.ts:6` and `tests/live/schema-field-discard-recovery-live-cell.test.ts:16`. None is in the 0093 record, and none is in AGENTS.md or CHANGELOG.md.
- `grep -rn 'cell ``' docs/bugs | wc -l` → 1 (this record's :573 is the only one).
- `git log -p -- docs/bugs/0093-…md` → the `` H8a cell `` `` text is present as added in `85717fa8`, the fix commit, so the pointer was empty from the start.
- `git show --stat 85717fa8` → adds `...otation-query-double-emission-live-cell.test.ts | 218 ++++++++++`.

## Why this is a problem
Item (3) is the record's only host-level verification claim, and it includes a red-proof in both directions. The record gives no resolvable citation for it. An empty identifier cannot be looked up, and the record names no file path, so a reader or triage re-run following the record cannot tell which live test is claimed or check that it asserts the stated observable. The matching cell exists under `tests/live/**`, so the default preflight gate does not prove it. Even with a pointer, the claim is capped at "a live witness exists"; without one, the record offers no witness at all.

## Suggested direction (non-binding, optional)
Name `tests/live/let-annotation-query-double-emission-live-cell.test.ts` at :573 in place of the empty span. It self-identifies as bug 0093's live cell and carries the `.toBe(1)` count the record's `expected 2 to be 1` signature describes.

## False-positive check
- Representations enumerated and searched: (1) bug-doc Witness/Fix lines: the record's Fix section cites only the default-suite witness by path (3 hits above) and the empty span for the live cell; (2) test file names: `grep -rln "0093" tests/live` → 3 files. `let-annotation-query-double-emission-live-cell.test.ts` is the 0093 cell. `empty-template-warning-registration-live-cell.test.ts` and `unterminated-template-registration-live-cell.test.ts` only cite 0093 as a standalone-file precedent (:5 in each); (3) test titles: `grep -rnE "(it|describe)\(.*bug 0093" tests` → 9 hits, 7 `describe`s in `tests/let-annotation-query-double-emission.test.ts`, 1 `it` in `tests/inline-empty-object-type.test.ts:841`, and 1 `describe` in the live-cell file (:152); (4) coverage-matrix rows: `grep -c "0093" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0; (5) AGENTS.md gate names: the live-cell file name has no AGENTS.md hit (the combined grep above returns no AGENTS.md line); (6) CHANGELOG (corroboration only): `grep -n "Bug 0093" CHANGELOG.md` → :3748 (a coordination mention) and :3937 (the 0.155.0 entry). Neither is a witness path.
- The live file's own header uses the same empty token ("the `` live cell"). That explains how the record's span came to be empty, but it still does not resolve to a file. The span is not a stable identifier: the file's `it` title opens with a bare `:`, showing the same token blank.
- The default-suite witness (`tests/let-annotation-query-double-emission.test.ts`, 10 `it(` cells as the record states) is unaffected and out of this filing.
- No rename or delete exists to cluster by (the pointer never resolved). No gate checks `docs/bugs/**` witness pointers. Nothing was executed.

## Triage
verdict: confirmed — every stated search reproduces (3 record hits, all naming the default-suite file; 3 tree hits for the -live-cell file, none in 0093, AGENTS.md or CHANGELOG; 1 `cell ``` in docs/bugs; 9 bug-0093 describe/it titles; 0 coverage-matrix rows; 85717fa8 added the 218-line cell, and its message says the cell was "de-tokenized at merge"). Record :572-576 cites the live H8a cell only as an empty `` span. The witness exists: tests/live/let-annotation-query-double-emission-live-cell.test.ts, describe "bug 0093 — a propagated `let` annotation reaches the author's diagnostic batch once (Convention: live-host acceptance)" / it ": the theta whose body is `let r: {} = @`hi`` is refused, and the theta-system-note batch carries exactly ONE empty-schema-body line for it, through the real discovery→registration path", whose `.toBe(1)` count at :208-217 matches the `expected 2 to be 1` signature. The fix is a mechanical re-point at :573. No intake or PTQ duplicate found (triage: claude-opus-5-5)
