---
id: pending
title: Fix records 0007, 0010, 0012 and 0014 name off-session witnesses (tests/off-session-two-phase.test.ts, tests/off-session-transport-classification.test.ts, blankHelperQuerySchema) that 89faa7c5 deleted, and none of the four records carries a discharge note
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0007-off-session-error-stop-swallowed-as-ok-empty.md:62-66
  - docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md:124-131
  - docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md:155-160
  - docs/bugs/0012-untyped-off-session-mid-abort-transport-not-cancelled.md:85-97
  - docs/bugs/0014-empty-typed-query-annotation-silent-unvalidated-bind.md:102-107
  - tests/typed-two-phase-live.test.ts:298
  - tests/typed-two-phase-live.test.ts:1398
sites: 5
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260927213122
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-27
---

# Fix records 0007, 0010, 0012 and 0014 name off-session witnesses (tests/off-session-two-phase.test.ts, tests/off-session-transport-classification.test.ts, blankHelperQuerySchema) that 89faa7c5 deleted, and none of the four records carries a discharge note

## Observation
Four fixed-Status records name, in their `## Fix` sections, witnesses that sat in two default-suite files: `tests/off-session-two-phase.test.ts` and `tests/off-session-transport-classification.test.ts`. Commit `89faa7c5` ("rfc 0012 step 7") deleted both files. Its message says: "RETIRED: off-session-two-phase, off-session-transport-classification, … (they drove the removed OffSessionQueryModel …)". The same commit removed the seam those witnesses drove (`OffSessionQueryModel`, `offSessionComplete`): at HEAD, `src/` has 0 hits for either name. No file under `tests/` has either name. The named `(l-off)` cell and the `blankHelperQuerySchema` seam appear nowhere in `tests/`, and the `(p1)` tag appears only on unrelated cells in other suites (for example tests/annotation-nontype-text-refusal.test.ts:2032). None of the four records says the witnesses or the seam were retired. Superseded records elsewhere in the store do say so, for example 0003:70 "### Discharge note — bug 0072 (0.65.0)".

## Evidence
**Site 1 (claim side):** docs/bugs/0007-off-session-error-stop-swallowed-as-ok-empty.md:62-66. This is the record's only named witness.
```
arm (`driveStreamedUserTurn`), the binder classification, and the
child-process envelope path are untouched. Fixture:
`tests/off-session-transport-classification.test.ts` (eight classification
cells plus two green controls over a mocked `@earendil-works/pi-ai/compat`
`complete()`).
```

**Site 2 (claim side):** docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md:124-131. Two of the nine regression-surface files no longer exist.
```
Regression surface: `tests/typed-two-phase-live.test.ts`,
`tests/off-session-two-phase.test.ts`, `tests/typed-repair-two-phase.test.ts`,
`tests/typed-query-provider-gate.test.ts`,
`tests/query-tool-loop-noncompliance.test.ts`,
`tests/query-followup-render-initial.test.ts`, plus re-pinned cells in
`tests/prompt-provider-field-derivation.test.ts`,
`tests/off-session-transport-classification.test.ts`, and
`tests/binder-inference-provider-mapping.test.ts` (overflow alias keys). The
```

**Site 3 (claim side):** docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md:155-160. This is the residual's pin.
```
  schema-validation collaborator is built, so the text-parsed payload binds
  **unvalidated** (the CIO-3 depth walk still runs in the loop; AJV does not).
  Pinned by the degraded-arm regression cells in
  `tests/typed-two-phase-live.test.ts` and
  `tests/off-session-two-phase.test.ts`; WHY comments sit at the two
  `forcedRespondTurn` degraded arms and the `maxRounds` collapse in
```

**Site 4 (claim side):** docs/bugs/0012-untyped-off-session-mid-abort-transport-not-cancelled.md:85-97. Two of the three named fix witnesses are gone.
```
Tests, written first and red at `1046f93a` for the documented reasons:

- `tests/off-session-two-phase.test.ts` **(p1)** — the (d12) mirror over the
  suite's untyped `subagent fn` fixture: `complete()` #1 flips `thetaAbort`
  mid-call and resolves `{ stopReason: "aborted", content: [] }`. Red as
  `outcome: "success"` with `Err(invoke_callee → transport "provider
  transport failure")` — the §Reproduction values verbatim; green as the
  CANCEL outcome with exactly one `complete()` (a defensive sticky-last text
  reply keeps any regressed post-abort round observable on both pins).
- `tests/off-session-two-phase.test.ts` **(l-off)** — the untyped (l)
  control: the same aborted-stop reply under a live (non-aborted) signal
  stays `Err(transport)` with the PIC-51 fallback shape. Green at HEAD,
  green after — the preserved distinction.
```
The third witness, `(p2)`, does resolve: tests/typed-two-phase-live.test.ts:1398 `describe("bug 0012 — live UNTYPED query: Esc during the streamed turn is the CANCEL outcome, never Ok(partial text) …`.

**Site 5 (claim side):** docs/bugs/0014-empty-typed-query-annotation-silent-unvalidated-bind.md:102-107. Half of the named re-pin seam is gone.
```
and the registry message reaches `ctx.ui.notify`). The (deg-live)/(deg-off)
residual pins re-pin to the diagnostic and KEEP the arm's original fused
single-shot assertion sets through a direct-construction seam
(`blankQuerySchema` / `blankHelperQuerySchema` blank a clean `@<string>`
twin's `QueryExpr` to `""` — the arm's only remaining entry — failing loudly
on fixture drift).
```
`blankQuerySchema` resolves at tests/typed-two-phase-live.test.ts:298 (`function blankQuerySchema(body: …`). `git grep -n "function blankHelperQuerySchema" 89faa7c5^ -- tests` returned `tests/off-session-two-phase.test.ts:490`, so the (deg-off) half lived in the deleted file.

**Searches run in this session:**
- `find tests -name "off-session-two-phase*" | wc -l`: 0
- `find tests -name "off-session-transport-classification*" | wc -l`: 0
- `rg -c -F "(l-off)" tests | wc -l`: 0 files
- `rg -l -F "blankHelperQuerySchema" tests | wc -l`: 0
- `git log --oneline --name-status --diff-filter=DR -3 -- tests/off-session-two-phase.test.ts`: `89faa7c5 … D tests/off-session-two-phase.test.ts`. The same command for `tests/off-session-transport-classification.test.ts` returned the same commit with `D`, not `R`, so the files were deleted, not renamed.
- `git grep -n "(p1)\|(l-off)" 89faa7c5^ -- tests/off-session-two-phase.test.ts`: the two cells at :1798 and :1847 before the deletion.
- `rg -c 'OffSessionQueryModel' src | wc -l`: 0. `rg -c 'offSessionComplete' src | wc -l`: 0.

## Why this is a problem
Each record's fix claim names a witness, and each pointer (Sites 1-5) no longer resolves as stated. No equivalent witness exists for Sites 1, 4 (`(p1)`/`(l-off)`), 5 (`blankHelperQuerySchema`) or the off-session halves of 2 and 3. The seam they pinned (`OffSessionQueryModel` / `offSessionComplete`) was removed in the same commit, so the cells were retired, not moved. A reader who follows 0007's only fixture, or 0012's `(p1)`/`(l-off)`, finds nothing. None of the records says so, which leaves e.g. 0012's Status wording ("the CANCEL terminal outcome on both untyped drivers") pointing at a driver and a witness that no longer exist. The store's own practice for superseded fix claims is a dated discharge note (0003:70 "### Discharge note — bug 0072 (0.65.0)"). These four records lack one.

## Suggested direction (non-binding, optional)
Add a discharge note to each record (0007, 0010, 0012, 0014) naming `89faa7c5` / RFC 0012 step 7 as the point where the off-session seam and its witnesses were retired. Keep the surviving live-driver witnesses the records already name (`tests/typed-two-phase-live.test.ts` `(p2)`, `blankQuerySchema`) as the current pins.

## False-positive check
- **Rename vs delete:** `git log --diff-filter=DR` shows `D`, not `R`, for both files. The commit message lists both as "RETIRED".
- **Successor by filename:** `find tests -name` for each basename returned 0. `rg --files tests | rg -i "0007|off-session"` returned only `tests/helpers/scripted-off-session-mock.ts` and `tests/live/off-session-overflow-classification.test.ts`. The latter's header is a bug-0182 forced-respond overflow cell, not the 0007 stop-reason classification cells or the 0012 `(p1)`/`(l-off)` cells.
- **Successor by title / cell tag:** `(l-off)` and `blankHelperQuerySchema` have 0 hits under tests/.
- **Historical-context exclusion:** I did not count citations of these files in Reproduction, Summary or Provenance sections that are dated to an "Observed at" HEAD (for example 0009:206-210, 0012:136, 0012:169, 0014:184). Only `## Fix` witness pointers are counted.
- **Already-filed topics:** none of the listed PTQ/intake files covers bug-doc witness decay for these records.
- **Gate check:** citation-form gates check citation grammar, not whether a cited test file exists. This is pointer decay, which no gate sees.

## Triage
verdict: questionable — decay verified: all five claim excerpts reproduce (0007:62-66, 0010:124-131/155-160, 0012:85-97, 0014:102-107); 89faa7c5 deleted tests/off-session-two-phase.test.ts and off-session-transport-classification.test.ts (git log --diff-filter=D; message lists both as RETIRED); blankHelperQuerySchema / OffSessionQueryModel / offSessionComplete have 0 hits in src/extensions/tools/tests (only a stale src/runtime/query-tool-loop.ts:411 comment mentions (p1)/(l-off)); none of the four records has a discharge note or 89faa7c5 mention; the live halves (blankQuerySchema :298, (p2) describe :1398) resolve. The seam was removed, so no equivalent exists for the off-session witnesses; rewording the records is a human's call (triage: claude-opus-5-5)
verdict: questionable — decay re-verified: all five claim excerpts reproduce; 89faa7c5 deleted both suites (message: "RETIRED: off-session-two-phase, …"); blankHelperQuerySchema/OffSessionQueryModel/offSessionComplete have 0 hits in src/extensions/tools/tests, and the (p1)/(l-off) tags survive only in stale comments (src/runtime/query-tool-loop.ts:411); none of 0007/0010/0012/0014 has a discharge note or cites 89faa7c5; blankQuerySchema (:298) and (p2) (:1398) resolve. The filing misses that typed-two-phase-live.test.ts:1460-1479 re-hosts some cells from the retired transport-classification suite, but only the bug-0182 respond-seat cells W2/W4/W6/W7, and its comment says the untyped free-phase seat 0007 pinned "no longer exists". So the equivalent is at best partial and ambiguous, and changing the records' wording is a human's call (triage: claude-opus-5-5)
