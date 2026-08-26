# Bug 0290 — Live cells that assert an EXACT count of rendered queries red when bug 0289's bounded same-session re-ask fires: `captureSettledTurn` re-issues the LAST user text verbatim (`tests/live/harness.ts:633`), so a sentinel-carrying query appears TWICE in `userTexts` and `toBe(1)` / `toHaveLength(1)` fail on a drive that behaved per contract

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 because the defect is confined to live
  test infrastructure (production binding and the re-ask itself are
  contract-correct) while denying the live suite a stable green: four cells
  red nondeterministically, once per run in which the model's first settled
  reply is empty. D2 because three of the four exposed cells take pure
  assertion edits, but the fourth sits in
  `tests/live/live-production-acceptance.test.ts`, byte-frozen at 14864 lines
  by bug 0287 §Fix and re-pinned by bug 0289 §Fix, and `DrivenTurn` exposes no
  re-ask indicator, so the fix must either export one from the harness or
  amend a standing pin.
- **Kind:** test-infrastructure defect — a broken premise in cell assertions:
  "exactly one rendered query" was a valid invariant before 0.286.0 and is
  now a 1..2 range whose second element is byte-identical to the first.
- **Affected** (every citation re-derived at HEAD `013f09ac`, v0.286.0):
  - `tests/live/harness.ts:582`–`:696` — `captureSettledTurn`, bug 0289 §Fix
    elements (a) and (b1).
    - `:624` — `const lastUserText = collectUserTexts(appended).at(-1);` — the
      re-ask payload is the LAST user text of the appended slice, read back
      out of the transcript.
    - `:632`–`:633` — `reAskIssued = true; await deps.prompt(lastUserText);` —
      the re-issue, verbatim, through `deps.prompt`, i.e. the real
      `handle.session.prompt` seam (`:378` in `driveSlashCaptureTurn`). No
      text is appended, prefixed or marked; the second user entry's bytes
      equal the first's.
    - `:439`–`:444` — `NORMAL_STOP_BOUNDARIES` (`stop`, `end_turn`, `toolUse`,
      `tool_use`) — the boundaries eligible for the re-ask, gated on
      `deps.isIdle()` at `:606`.
    - `:699`–`:705` — `capturedTurn` builds `userTexts` from
      `collectUserTexts(appended)` over the WHOLE appended slice, so both
      occurrences reach the caller.
    - `:311`–`:345` — `DrivenTurn` carries `text`, `userTexts`, `systemNotes`
      and nothing else: `reAskIssued` is loop-local to `captureSettledTurn`
      and is not observable by any cell.
  - `tests/live/typed-query-wire-shapes.test.ts:233`–`:238` — bug 0028
    enum-root cell: `turn.userTexts.filter((text) => text.includes(sentinel))`
    then `.toBe(1)` on `echoed.length`.
  - `tests/live/typed-query-wire-shapes.test.ts:297`–`:302` — bug 0028
    nested-`$ref` cell: same shape, `.toBe(1)`.
  - `tests/live/typed-query-wire-shapes.test.ts:456`–`:461` — bug 0099
    canonical-slug cell: same shape, `.toBe(1)`. This is the witnessed red.
    All three drive through `driveWithin` (`:87`–`:116`) →
    `driveSlashCaptureTurn` (`:114`), the canonical-slug cell through
    `driveCapturingToolCalls` (`:356`–`:372`, `:367`) which delegates to the
    same call.
  - `tests/live/live-production-acceptance.test.ts:9843`–`:9855` — bug 0188
    parent cell: drives `driveSlashCaptureTurn(handle, "/b188liveparent")` and
    asserts `expect(turn.userTexts, …).toHaveLength(1)` over the WHOLE array,
    not a sentinel filter. Same exposure; this file is byte-frozen at 14864
    lines.
  - `docs/bugs/0289-settled-empty-text-turn-scored-as-never-settled-in-live-harness.md`
    §Fix (0.286.0) — the lock enumeration: `collectAssistantTexts`
    byte-untouched (bug 0287's lock), `live-production-acceptance.test.ts`
    byte-frozen at 14864, `src/**`, `docs/spec_topics/**`,
    `docs/plan_topics/**` untouched, the 10-cell offline witness
    `tests/b0289-settled-empty-text-turn-classification.test.ts`, the sentinel
    non-weakening non-goal. The enumeration names no cell-side count
    assertion: the class of cells whose assertion counts rendered queries
    exactly was missed.
- **Observed at:** HEAD `013f09ac`, v0.286.0, full live suite at the final
  tip. Evidence: `.pi/tmp/fix-open-bugs/live-full-v0286.log:106`–`:107` and
  `:360`–`:361`.
- **Scope:** live cells reached through `driveSlashCaptureTurn` /
  `captureSettledTurn` whose assertion pins an exact occurrence count over
  `userTexts`. Four cells, enumerated above. Cells that join `userTexts` and
  assert `toContain`, that assert `toEqual([])` (absence), or that read
  `userTexts[0]` are not exposed: a re-ask appends an identical entry at the
  END and introduces no new sentinel. `tests/live/hardening/**` reads
  `userTexts` through `probe-harness.ts:382` (`collectUserTexts` over the
  appended slice, no `captureSettledTurn` call), so no hardening probe is
  exposed by this mechanism.

## Summary

Bug 0289's fix gave `captureSettledTurn` a bounded same-session re-ask: when
the drive's last turn settles with empty text on a normal boundary while the
session is idle, the harness re-issues the LAST user text exactly once through
`handle.session.prompt` (`tests/live/harness.ts:624`, `:633`). The re-issued
text is byte-identical to the original — it is read straight back out of the
transcript — and the returned `DrivenTurn.userTexts` is built over the whole
appended slice (`:699`–`:705`), so the same rendered query appears twice.

Four live cells assert that exactly one rendered query carries their sentinel
(`toBe(1)` over a filter) or that exactly one user turn was rendered at all
(`toHaveLength(1)`). Those assertions encode a pre-0.286.0 invariant. The
legitimate post-fix range is 1..2, with the second occurrence byte-identical
to the first. When the re-ask fires the cell reds while the drive behaved
exactly as bug 0289's contract specifies.

The count still carries a property worth keeping: it proves no SECOND DISTINCT
query leaked into the drive. That property survives as an identity constraint
over the occurrences; the cardinality alone does not.

## Reproduction

Offline, at HEAD `013f09ac`:

```
rg -n "toBe\(1\)|toHaveLength\(1\)" tests/live/typed-query-wire-shapes.test.ts \
   tests/live/live-production-acceptance.test.ts
sed -n '618,634p' tests/live/harness.ts
```

`tests/live/harness.ts:624` reads `collectUserTexts(appended).at(-1)` and
`:633` re-sends it unmodified; `capturedTurn` (`:699`) returns
`collectUserTexts(appended)` over the slice that now holds both entries. The
four assertions above pin a count of 1 over that array.

Live witness, quoted from `.pi/tmp/fix-open-bugs/live-full-v0286.log:107`
(bug 0099 canonical-slug cell, `tests/live/typed-query-wire-shapes.test.ts`,
18042 ms):

```
exactly one rendered follow-up query must carry the sentinel; observed
userTexts=["A production database was permanently deleted with no backup and
the service is fully down. Classify the severity as either low or high.",
"Status line: THETA-canonical-slug cell-CANON <<high>>. What is 218 plus 639?
Answer with the number only.","Status line: THETA-canonical-slug cell-CANON
<<high>>. What is 218 plus 639? Answer with the number only."]:
expected 2 to be 1
```

The two sentinel-carrying entries are byte-identical. The isolated re-run of
the same file is green 3/3 (`.pi/tmp/fix-open-bugs/live-v0286-rerun.log`,
`3 tests`, 47709 ms) — the re-ask did not fire there. The red is therefore
conditional on the model's first settled reply being empty, which the fix
record for 0289 measured at roughly 1 in 5 probe drives.

## Expected behaviour

A drive whose settled-but-empty first reply triggers the one permitted re-ask
passes its cell. The cell still fails if a SECOND DISTINCT query reaches the
session, and still fails if no sentinel-carrying query is rendered at all.

## Actual behaviour / root cause

`captureSettledTurn` re-sends the last user text verbatim and returns both
occurrences. `DrivenTurn` exposes no signal that a re-ask happened, so a cell
cannot distinguish "one rendered query, re-asked once" from "two rendered
queries" by cardinality. The four cells read cardinality, so they red on the
first case.

Root cause is a premise break, not a defect in the re-ask: the re-ask is
verbatim by construction (`:624` reads the transcript entry it re-sends), and
bug 0289 §Fix chose the `prompt()`-level seam precisely so the re-issue goes
through the real production path — which means it lands in the transcript and
therefore in `userTexts`. What was missed is the cell-side class: the §Fix
lock enumeration covers `collectAssistantTexts`, the 14864-line freeze, the
`src/**` / spec / plan non-touch and the sentinel non-weakening non-goal, and
names no assertion that counts rendered queries.

## Why it matters

The live suite has no stable green while any exposed cell can red for a
contract-correct drive. A red carrying "expected 2 to be 1" is
indistinguishable at a glance from a real double-emission regression (the
class bug 0093 covers on the note channel), so the signal that would catch a
genuine second query is degraded in both directions: the false red trains
readers to dismiss it, and dismissing it hides the true one.

## Fix

Two elements.

(a) Expose the re-ask on the harness result. `captureSettledTurn`'s
`reAskIssued` is loop-local (`tests/live/harness.ts:597`, `:632`); promote it
to a counted field on `DrivenTurn` (`:311`–`:345`) populated by `capturedTurn`
(`:699`–`:705`). `DrivenTurn` is additive-only here: no existing field changes
shape, so cells that do not read the new field are unaffected. This is what
lets the bug 0188 cell at
`tests/live/live-production-acceptance.test.ts:9855` keep an exact assertion
(`toHaveLength(1 + turn.reAskCount)`) — a one-token edit inside a file whose
14864-line pin the fix must preserve, verified with
`wc -l tests/live/live-production-acceptance.test.ts`.

(b) Per exposed sentinel-filtered cell
(`tests/live/typed-query-wire-shapes.test.ts:233`–`:238`, `:297`–`:302`,
`:456`–`:461`), accept the 1..2 range under an IDENTITY constraint: at least
one occurrence, and every sentinel-carrying occurrence byte-identical to the
first (`new Set(echoed).size === 1`). That preserves what the count proved —
no second DISTINCT query leaked — while admitting the verbatim re-ask. The
existing `echoed[0]` wire-value assertions stay unchanged, and the failure
message states the identity requirement and prints the observed array, so a
real leak reds with both texts visible.

Constraints the fix holds:

- No sentinel weakening. Every `SENTINEL`/wire-value `toMatch` stays as
  written; a drive that renders no sentinel-carrying query still reds.
- Single-query semantics preserved: a distinct second query fails element (b)
  on the identity constraint and fails element (a)'s count at the 0188 cell.
- The offline locks of bugs 0287, 0288 and 0289 stay green and unedited —
  including `tests/b0289-settled-empty-text-turn-classification.test.ts`,
  which must be extended, not relaxed, if `DrivenTurn` gains a field.
- `tests/live/live-production-acceptance.test.ts` stays at 14864 lines.
- `src/**`, `docs/spec_topics/**` and `docs/plan_topics/**` are untouched:
  this is a test-infrastructure fix.

Verification: the bug 0099 canonical-slug cell green, run repeatedly until at
least one run's transcript shows two identical sentinel-carrying entries (the
re-ask path exercised, not merely not-fired) — the same measurement gap bug
0289 §Fix residual 2 records. **Falsifier:** a red produced by planting TWO
DISTINCT sentinel-carrying texts must still fail the identity constraint; if
it passes, the fix has removed the leak detector and this report is re-filed.

Ordering: this fix builds on 0.286.0 (`tests/live/harness.ts` as bug 0289 left
it) and does not block on any open report.

## Related

- [0289 — settled-empty-text turn scored as "never settled" in the live harness](./0289-settled-empty-text-turn-scored-as-never-settled-in-live-harness.md)
  — fixed (0.286.0). Owns the bounded re-ask (`§Fix` element (b1)). This
  report is its residual interaction: the re-ask is contract-correct and the
  §Fix lock enumeration missed the class of cell assertions that count
  rendered queries exactly.
- [0099 — schema slug hashes stringify, not canonical form](./0099-schema-slug-hashes-stringify-not-canonical-form.md)
  — owns the subject of the witnessed cell (the canonical-form slug). That
  subject is untouched here: the cell's `toolNames` assertion
  (`tests/live/typed-query-wire-shapes.test.ts:445`–`:450`) passed in the same
  run that red on the count.
- [0287 — `driveSlash`'s whole-drive text accumulator drops a later turn's stream](./0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md)
  — fixed (0.284.0). Source of the 14864-line pin on
  `tests/live/live-production-acceptance.test.ts` that constrains element (a).
- [0093 — `let` annotation query-position double emission](./0093-let-annotation-query-position-double-emission.md)
  — the genuine double-emission class this report's identity constraint keeps
  detectable, scored on the note channel by
  `tests/live/let-annotation-query-double-emission-live-cell.test.ts:205`–`:212`.

## Provenance

Filed in the twentieth session continuation of the fix-open-bugs loop, from the
final-tip full live run at HEAD `013f09ac` (v0.286.0). Live evidence quoted
from `.pi/tmp/fix-open-bugs/live-full-v0286.log` and
`.pi/tmp/fix-open-bugs/live-v0286-rerun.log`; no live run was performed by this
writer. All source citations re-derived offline at that HEAD.
