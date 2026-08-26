# Bug 0287 — The live H8a harness's `driveSlash` accumulates streamed assistant text only for as long as the outer `prompt()` is pending, so a multi-turn drive intermittently returns an EARLIER turn's text alone: cell 89's `turn.text` was exactly `"604"` (the first typed query's answer) while `turn.userTexts` proved the second query rendered and was sent

- **Status:** fixed (0.284.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the defect is in verification
  scaffolding, not in shipped behaviour, but it produces live reds that
  mis-attribute to whatever fix is in flight and it hid the true mechanism of
  bug 0286 across three sessions. D2 because the change is to the harness's
  async completion contract and its verification runs against a stochastic
  observable (repeated live cell-89 runs), not a deterministic offline
  assertion.
- **Kind:** test-infra defect — a whole-drive stream accumulator whose lifetime
  is the outer `prompt()` promise rather than the drive's last model turn.
- **Affected** (every citation re-derived at HEAD `91f88cbc`, v0.283.0, i.e.
  after bug 0286's merge):
  - `tests/live/harness.ts:399`–`:418` — `driveSlash`, the accumulator under
    test:
    - `:403` — `let text = "";`, one accumulator for the WHOLE drive.
    - `:404`–`:411` — the subscription; `:408` is `text += inner.delta` for
      `message_update` / `text_delta` events only.
    - `:413` — `await session.prompt(slashInvocation);`.
    - `:415` — `unsubscribe();` in the `finally`.
    - `:417` — `return { text };`.
  - `tests/live/harness.ts:336`–`:351` — `driveSlashCaptureTurn`, which pairs
    that `text` with two channels read AFTER `prompt()` resolves, off the
    settled in-memory `SessionManager` (`:340` entry count before, `:345` the
    appended slice, `:348`–`:349` `collectUserTexts` / `collectSystemNotes`;
    the readers are `:361`–`:376` and `:383`–`:397`). The asymmetry is the
    defect: those two channels cannot lose a late entry, `text` can.
  - `tests/live/harness.ts:292`–`:297` — `driveSlashCaptureText`, the same
    accumulator exposed without a `SessionManager` handle.
  - `tests/live/live-production-acceptance.test.ts:14749`–`:14758` — cell 89's
    declared-`E` twin, TWO on-session `@`-queries in one `mode: prompt` body:
    `:14754` typed (`What is 471 plus 133?`, answer `604`), `:14755`
    `let n = 306 + 218`, `:14756` the untyped discriminator over `${n}`
    (answer `865`).
  - `tests/live/live-production-acceptance.test.ts:14846` — the drive;
    `:14853`–`:14858` — the assertion on `turn.text`, with `turn.userTexts` in
    its failure message since 0286 (`:14857`).
  - `src/extension/production-theta-producer.ts:4779`–`:4786` — the documented
    fire-and-forget property of the send: `pi.sendUserMessage` "schedules a
    fresh agent run but returns before that run installs its active-run
    handle", and `ctx.waitForIdle()` "resolves immediately while no run is
    active". Send at `:4833`; bounded start poll at `:4838`
    (`TURN_START_POLL_BOUND = 1000`, `:4893`); end poll at `:4854`
    (`TURN_END_POLL_BOUND = 60000`, `:4896`).
  - `src/extension/production-theta-producer.ts:4609`–`:4617` — a typed query's
    forced respond turn dispatches OFF-SESSION, so a typed query's on-session
    streamed text is its free-phase turn's, not its answer's.
  - `tests/live/hardening/probe-harness.ts:355`–`:364` — the same event-stream
    accumulator shape (`assistantText`) in the hardening probe harness.
- **Observed at:** HEAD `40eb97ff` plus bug 0286's uncommitted lane edit
  (lane worktree `C:/UnitySrc/pi-theta-lane-o`, branch `lane/o-0286`), against
  the live provider; the same edit is now merged as `91f88cbc`, v0.283.0, and
  the harness code is byte-identical across that merge (0286 touched only
  `tests/live/live-production-acceptance.test.ts` and its own bug doc).
- **Blocks on:** nothing. Bug 0286 is fixed (0.283.0) and its diagnostic is the
  instrument this report depends on.

## Summary

`driveSlash` returns the assistant text it accumulated from `text_delta` events
between `session.subscribe` (`tests/live/harness.ts:404`) and the
`unsubscribe()` in the `finally` of `await session.prompt(...)` (`:415`). A
prompt-mode theta with two `@`-queries drives two on-session model turns inside
that one `prompt()`; each turn is scheduled by `pi.sendUserMessage`, which
returns before the run it schedules installs its active-run handle
(`src/extension/production-theta-producer.ts:4779`–`:4786`).

In a measured run of cell 89, `turn.text` was exactly `"604"` — the first
(typed) query's answer — while `turn.userTexts` carried both rendered queries,
including the discriminator body with the theta-computed `524`. The second
turn's stream contributed nothing to the accumulator, so the assertion at
`tests/live/live-production-acceptance.test.ts:14858` red on a drive whose
outbound render is provably correct.

The two settled-transcript channels of the same `DrivenTurn` (`userTexts`,
`systemNotes`) are read after `prompt()` resolves and are unaffected. Only
`text` depends on event timing.

## Reproduction

All live evidence below was **captured by bug 0286's fix lane, quoted here
verbatim, and not re-run by this writer**. Source citations are this writer's
own, offline at HEAD `91f88cbc`.

The drive, post-0286 (`tests/live/live-production-acceptance.test.ts:14749`–`:14758`):

```
---
mode: prompt
---
schema Nope { a: number }
let a: Result<integer, Nope> = @`What is 471 plus 133? Answer with the number only.`
let n = 306 + 218
@`A computation produced the value ${n}. What is that value plus 341? Answer with the number only.`
```

Three distinct numbers after 0286: `604` (typed query's answer), `524`
(theta-computed, rendered into the discriminator), `865` (the sentinel, the
discriminator's answer).

(a) The witness. Lane report
`C:/UnitySrc/pi-theta-lane-o/.pi/tmp/fixes/0286-report.md` (copy at
`.pi/tmp/fixes/0286-report.md` if the lane is removed), POST-EDIT run 1, under
the live lock, command
`npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "cell 89"`:

```
AssertionError: the declared-`E` twin's drive did not answer the task question
over the value rendered into the discriminator's prompt body (524 + 341 = 865)
-- streamed text: "604"; userTexts: ["What is 471 plus 133? Answer with the
number only.","A computation produced the value 524. What is that value plus
341? Answer with the number only."] (cell 89): expected false to be true
 ❯ tests/live/live-production-acceptance.test.ts:14858:9
```

`turn.text` is the first query's answer alone. The discriminator's rendered
body is present in `userTexts` with the correct `524`, so the second query was
computed, rendered and sent. `turn.systemNotes` was empty (the preceding
assertion at `:14847`–`:14852` passed), so the drive ended normally.

(b) The same session's run table, verbatim:

| run | when | result |
|---|---|---|
| PRE-EDIT 1 | 22:22:04 | **PASS** — `Tests 1 passed | 89 skipped (90)`, 13442ms |
| PRE-EDIT 2 | 22:22:32 | **PASS** — 12636ms |
| POST-EDIT 1 | 22:37:20 | **RED** at `:14858:9` (above) |
| POST-EDIT 2 (deciding re-run) | 22:37:46 | **PASS** — 18679ms |

No code change between POST-EDIT 1 and 2. The lane recorded the outcome as
"1 red / 1 green" and carried it as its Residual 1: "**Cell 89 remains a
stochastic-mode cell after this fix**".

(c) The lane's own attribution, Residual 2, verbatim:

```
The evidence points instead at the discriminator turn's `text_delta` stream not
always landing in `driveSlash`'s whole-drive `text` accumulator
(`tests/harness.ts:390`–`:417`) in a two-query prompt-mode drive. That is where
the residual flake lives, and removing the collision cannot close it.
```

(The path/line in that quote is `tests/live/harness.ts:399`–`:418` at HEAD —
see §Corrections below.)

(d) Prior instances, re-framed. All three prior signatures are consistent with
this accumulator and were not distinguishable from provider drift before 0286
printed `userTexts`:

- `.pi/tmp/fix-open-bugs/RESUME.md:3` and `:634`–`:636` — the historical
  `cell-89 1-in-3` stochastic disposition, recorded as "drive sentinel is
  1-in-3 stochastic at its LAST assertion — registration assertions before it
  deterministic".
- Bug 0286 §Reproduction (a)–(d) — four consecutive reds with
  `streamed text: "524"`, including a cross-version probe at v0.281.0 code in
  `C:/UnitySrc/pi-theta-v281probe`. Pre-0286 the typed query's answer was ALSO
  `524`, so a `"524"` accumulator that dropped the second turn is
  indistinguishable from a model that stopped one step early. 0286's doc
  recorded exactly that measurement bound (§"What the logs do and do not
  localise": the message printed `turn.text` only, so "the captured evidence
  does not distinguish which of the drive's two queries produced the `524`").
- Bug 0286 §Reproduction (e) — the same cell green 2h31m earlier the same day,
  and green in earlier full runs: a race, not a version boundary.

## Expected behaviour

`driveSlash`'s returned `text` contains the assistant text of EVERY model turn
the drive ran, or the drive reports that it could not observe one. A cell
asserting the last turn's answer reds only when the model failed to give that
answer.

## Actual behaviour / root cause

Proven from the code at HEAD:

- `text` is a single accumulator for the whole drive (`harness.ts:403`), fed
  only while the subscription is live (`:404`–`:411`).
- The subscription's lifetime is exactly the pending `prompt()`
  (`:413`–`:415`). Nothing in `driveSlash` waits for any per-turn
  stream-settled signal, and nothing reconciles `text` against the settled
  transcript afterwards.
- Each `@`-query is a separate agent run: `pi.sendUserMessage` is
  fire-and-forget and returns before the run installs its active-run handle
  (`production-theta-producer.ts:4779`–`:4786`, send at `:4833`); the driver's
  wait for the run to become observably non-idle is BOUNDED at 1000 iterations × 10 ms ≈ 10 s (corrected at merge — the filed “1000 ms” misread the constant as milliseconds)
  (`:4838`, `:4893`), and `ctx.waitForIdle()` "resolves immediately while no
  run is active".
- The user turn is recorded in the transcript at send time, which is why
  `userTexts` carries a query whose reply is missing from `text`.
- For a typed query the answer-bearing forced respond turn is off-session
  (`:4609`–`:4617`), so the typed query's on-session stream is its free-phase
  turn — consistent with `"604"` reaching the accumulator.

Proven from the measurement: in run (a) the drive's second turn rendered and
was sent, ended without a fail-closed note, and contributed zero characters to
`text`, while the first turn's characters are all that `text` holds.

Not proven statically — the exact interleaving. Two mechanisms fit the
measurement and the code, and this report does not claim to discriminate them:

1. **Late delivery after unsubscribe.** The second query's run has not become
   observably non-idle within `TURN_START_POLL_BOUND` (≈10 s; corrected at merge), so the start
   poll expires, the end poll and `waitForIdle()` return at once, the theta
   finishes, the slash dispatch returns, `prompt()` resolves, `:415`
   unsubscribes, and the second turn's `text_delta` events then arrive with no
   subscriber attached.
2. **Delivery outside the observed event shape.** The second run's deltas are
   delivered under a shape the filter at `:405`–`:407` does not admit
   (`message_update` with `assistantMessageEvent.type === "text_delta"` is the
   only accepted path).

Both share the bound that matters: `text` is derived from events over a window
the harness does not close on a turn boundary, while every other channel of the
same `DrivenTurn` is derived from the settled transcript. The fix removes the
dependence rather than resolving which of (1) or (2) fires.

## Why it matters

Spurious live reds cost isolated re-run cycles under the live lock, and a
stochastic red at a protected cell is the mis-attribution hazard `AGENTS.md`
§"Expect documented correct-reason reds" exists to prevent.

Bug 0286 is the case study for the second cost. Its filed root cause —
"the drift is provider-side, in the drive model's handling of a chained numeric
task" — was the best reading of the evidence then available, because the
failure message printed `turn.text` only, and pre-0286 the dropped turn and a
truncated reply both produced the string `"524"`. Three sessions carried that
reading: the `cell-89 1-in-3` disposition, the four-red + cross-version-probe
filing, and 0286's own §"Actual behaviour / root cause". 0286's fix made the
values attributable (distinct numbers plus `userTexts` in the message) and the
next red named the accumulator within one run.

The cell's registration half is the live witness for bug 0273's fix. While the
drive half reds stochastically, that verdict is unreadable in run output.

## Non-goals

- **Bug 0286's landed edit.** The de-collided fixture and the `userTexts`
  diagnostic (`./0286-live-cell-89-drive-discriminator-answers-intermediate-value.md`,
  fixed 0.283.0) stay as merged. They removed a real hazard — a number that was
  a complete-looking answer at two places in one drive — and they are the
  instrument this report's attribution rests on. No revert, no re-collision.
- **Provider-side variance in genuinely refused or miscomputed replies.** Both
  remain real and separate: the injected-instruction refusal class
  (`./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md`) and
  arithmetic variance on a chained task. A drive whose model answers the wrong
  number must still red. This report does not weaken any assertion and does not
  add retries to any cell.
- **Cell 89's subject.** The registration half — offender refused with
  `theta/parse/unresolved-named-type`, twin registered
  (`./0273-propagated-result-error-side-unresolved-name-silent.md`, fixed
  0.267.0) — is untouched, as are the offender fixture and the refusal
  assertions.
- **`src/` behaviour.** The bounded start poll and the fire-and-forget send are
  the production drive contract; this report changes the harness's observation
  of it, not the contract.

### Exposure sweep (measured, `tests/live/**` at HEAD `91f88cbc`)

Exposure requires BOTH: an assertion reading a drive's accumulated text, AND a
driven body issuing ≥2 ON-SESSION model turns (≥2 `@`-queries in one
`mode: prompt` body; a `mode: subagent` callee's queries are off the user
session, and code-side arithmetic inside ONE query is not a turn boundary).

Exposed — 7 cells, each a typed/structured first query plus a second query
whose answer is the asserted sentinel:

| cell | fixture | assertion | expected |
|---|---|---|---|
| cell 89 | `live-production-acceptance.test.ts:14754`/`:14756` | `:14853`–`:14858` | `865` |
| b0229 | `escaped-quote-inline-rename-live-cell.test.ts:154`/`:157` | `:266`–`:270` | `1027` (`GOOD_EXPECTED`, `:143`) |
| b0228 | `inline-field-name-not-identifier-live-cell.test.ts:158`/`:161` | `:271`–`:274` | `1046` (`:147`) |
| b0154 | `inline-object-field-name-case-live-cell.test.ts:142`/`:145` | `:253`–`:258` | `1013` (`:131`) |
| b0160 | `inline-object-wire-name-rename-live-cell.test.ts:149`/`:152` | `:262`–`:265` | `1034` (`:138`) |
| b0176 | `quoted-inline-field-name-live-cell.test.ts:144`/`:147` | `:257`–`:260` | `1058` (`:131`) |
| b0231 | `inline-object-malformed-entry-resync-live-cell.test.ts:107`/`:111` | `:249`–`:253` | `857` (`CLEAN_SENTINEL`, `:96`; = `274 + 583`, the SECOND query's answer) |

b0231 is a cell 0286's sweep did not enumerate (its criterion was a shared
number, not a turn boundary).

Measured NOT exposed:

- `tests/live/hardening/session-convdrive.test.ts:107`/`:109` — 0286 listed this
  as a chained-second-step sibling. Its multi-query bodies are `mode: subagent`
  children (`:105`, `:116`, `:128`), the parent `drive.theta` issues ONE visible
  query (`:161`), and every assertion reads `userTexts` (`:168`, `:173`, `:175`).
  No exposure.
- `tests/live/hardening/session-promptstream.test.ts:60`–`:61` — two on-session
  queries, but dispatch is asserted on `userTexts` (`:76`–`:77`) and
  `assistantText` only non-empty (`:86`), which any one turn satisfies.
- The single-step compute-from-inline-value class 0286 enumerated —
  `b0274live-…:214`, `b0277live-…:190`, `b0278live-…:162`, `b0281live-…:194`,
  `b0282live-…:261`, `b0284live-…:248`, and
  `b0262live-unresolved-named-type-reference-position-live-cell.test.ts:157` —
  is ONE on-session query with the arithmetic chained in theta code
  (`let n = …`). Single-turn: no turn boundary inside the drive, no exposure.
- `b0146live-invoke-array-arg-live-cell.test.ts:167`–`:174` — the driven
  admitted caller `invoke`s a `mode: subagent` callee (`:137`–`:145`) and issues
  ONE on-session query (`:172`); the assertion at `:336`–`:340` is therefore
  single-turn.
- `tests/live/hardening/session-promptloop.test.ts:159` (`assistantText`
  contains `5193`) — one `@`-query whose multi-round tool loop runs inside a
  single agent run.
- `driveSlashCaptureText` callers `live-production-acceptance.test.ts:355`,
  `:423` (single-query drives) and `:10975`, `:11195` (cancellation drives,
  which assert on notes/cancellation, not on a later turn's answer).

Class bound: the same defect shape exists in
`tests/live/hardening/probe-harness.ts:355`–`:364` (`assistantText`), where no
current test asserts a later turn's answer content
(`recent-rfc-live-drives.test.ts:15` records "NOTHING asserts on
`assistantText`"). Any new multi-query probe test asserting reply content would
acquire the exposure.

## Fix

Make `driveSlash`'s text observable turn-complete: derive it from the settled
in-memory `SessionManager` after `prompt()` resolves, the same way `userTexts`
and `systemNotes` are already derived (`tests/live/harness.ts:340`–`:349`,
readers at `:361`–`:376` and `:383`–`:396`), per `AGENTS.md` §"Assert on real
observables, not on `prompt()` resolving" — read off the settled in-memory
`SessionManager`, not off racy events.

1. Add a `collectAssistantTexts(entries)` reader beside `collectUserTexts`
   (`tests/live/harness.ts:361`–`:376`): same walk, `message.role ===
   "assistant"`, string or text-part-array content. Mirror its doc-comment
   contract, including the deterministic-read claim.
2. Feed `DrivenTurn.text` from that reader over the appended slice
   `driveSlashCaptureTurn` already computes (`:345`), so a drive's text and its
   user turns come from the same settled snapshot. The field name, type and
   documented meaning ("streamed assistant text of the user session") stay;
   only its derivation changes, and its doc-comment at `:301` — plus the
   "streamed assistant text" phrase at `:329`–`:330` — must stop describing an
   event stream.
3. Close the drive on the last turn, not on `prompt()` resolving: before the
   read, wait — bounded, and failing loudly on expiry per `AGENTS.md` §"No
   silent skipping" — for the appended slice to carry an assistant entry after
   the LAST appended user entry. This is what makes the accumulation
   turn-complete for every turn of the drive, and it fails with a named
   precondition instead of returning a silently short string.
4. `driveSlashCaptureText` (`:292`–`:297`) takes an `AgentSession`, not a
   handle, so it cannot read the transcript. Route its four callers through a
   handle-taking form, or keep the event path for it alone and document that it
   is single-turn-only. Adjudicable in lane.

Adjudicable in lane (record the choice and its evidence in the fix record):

- Whether item 3's wait is a bounded poll on the entry slice, or a reuse of an
  existing idle/settled signal the session already exposes.
- Whether the bounded expiry throws or surfaces as a named field on
  `DrivenTurn` that cells assert against.
- Whether the same treatment lands on `probe-harness.ts:355`–`:364` in this fix
  or is recorded as a follow-on (no current probe test asserts reply content).

Constraints:

- No change to what any cell proves. No assertion weakened, no sentinel moved,
  no retry added, no fixture edited — including the 7 exposed cells above,
  which stay byte-untouched.
- Every currently-green live cell stays green, and the offline gate
  (`npm test`, `npm run typecheck`, `npm run lint`) stays clean.
- `tests/live/live-production-acceptance.test.ts` holds at **14864 lines**
  (`wc -l` at HEAD), as bugs 0283 and 0286 held it; many docs cite it by line.
  This fix has no reason to touch that file at all.

Verification:

1. Cell 89 under the live lock, the command in §Reproduction (a). Decision
   rule: **5 consecutive greens** with no intervening edit. Fewer than 5, or
   any red whose message shows a rendered later query in `userTexts` with its
   answer absent from the streamed text, means the fix is not settled.
2. Red direction, per `AGENTS.md` §"Verify both directions": with the fix in
   place, point the discriminator's `${n}` at a literal the model will not
   answer with, confirm the red returns, restore byte-exact
   (`git hash-object`-verified).
3. At least one of the 7 exposed cells above run green post-fix, to show the
   new derivation carries a structured first query's drive text too.
4. The full live suite at the next opportunity, with cell 89 and the 6 sibling
   cells green in the run log.

## Related

- `./0286-live-cell-89-drive-discriminator-answers-intermediate-value.md`
  (fixed 0.283.0) — **corrects-relation.** 0286 owns the fixture collision and
  the failure-message diagnosability, both fixed; this report owns the race.
  0286's §"Actual behaviour / root cause" and its §Provenance provider-drift
  verdict are superseded by this attribution; they were the best reading of the
  evidence then available, and 0286's own fix is what made the numbers
  attributable.
- `./0283-live-binder-declines-bare-free-text-argument-h8a-0165-cell.md`
  (fixed 0.279.0) — a different live red at the same file: binder-stage, a
  needs-more-info verdict before any body dispatch. It is also the precedent
  for editing a protected live cell under a filed report and for holding the
  file's line count.
- `./0273-propagated-result-error-side-unresolved-name-silent.md`
  (fixed 0.267.0) — the vehicle: cell 89 exists as its live witness, and its
  registration half is green throughout.
- `./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md` — the
  drive-discriminator shape rule the exposed fixtures already follow; separate
  failure class, unchanged by this fix.
- `./0165-empty-params-default-literal-admitted-and-never-bound.md` — the bug
  whose live cell 0283 red at: the precedent that a red in a live cell can be a
  scaffolding defect while the cell's own subject stays fixed, which is the
  reading applied here.

## Provenance

Filed in the twentieth `/fix-open-bugs` session, from bug 0286's Residual 2,
at HEAD `91f88cbc` (v0.283.0 — 0286's merge). The live evidence is bug 0286's
fix lane's, quoted from
`C:/UnitySrc/pi-theta-lane-o/.pi/tmp/fixes/0286-report.md` (POST-EDIT 1 red,
the four-run table, Residuals 1 and 2); the prior 1-in-3 disposition is
`.pi/tmp/fix-open-bugs/RESUME.md:3`, `:634`–`:636`; the four-red and
cross-version-probe logs are quoted through bug 0286's §Reproduction. Source
citations, the mechanism reading and the exposure sweep are this writer's own,
offline at HEAD. No live test was run by this writer.

## Fix (0.284.0)

- What shipped: `tests/live/harness.ts` — `driveSlash`'s whole-drive text is
  no longer accumulated from raw stream events: a new
  `collectAssistantTexts` reads every assistant turn's text off the settled
  in-memory `SessionManager` after the drive fully settles (the AGENTS.md
  observables pattern), so a later turn's stream can no longer be dropped by
  event-window timing. Thinking-only assistant entries are excluded (measured
  in the lane's pre-review corrective round — they defeated the first accept
  condition). Turn-completeness holds by construction.
- Tests: `tests/b0287-live-harness-assistant-text-reader.test.ts` (offline,
  5 cases) locks `collectAssistantTexts` — RED 5/5 pre-fix
  (`collectAssistantTexts is not a function`), green post-fix, red direction
  re-proved and restored byte-exact by the verifier.
- Gates: default suite 460 files / 9411 green; typecheck clean; lint clean;
  `tests/live/live-production-acceptance.test.ts` held at 14864 lines;
  `tests/fixtures/h7a/permitted-codes.json` byte-identical; `src/` and
  `tests/live/hardening/probe-harness.ts` untouched.
- Live (lane, under the shared lock): pre-fix red reproduced 3/3 (streamed
  `"604"` with both queries in `userTexts`); post-fix cell 89 across two
  batches: ✓✗✗✗✓ and ✓✓✓✗✗; sanity subset green (b0154 + b0282, 2 files/4
  tests; b0251 + inline-object-stray-close-token, 2/2, no stall).
- Review: 1 pre-review corrective round (measured) + round 1 deep (1
  correctness: branch-C bind-echo short-circuit; 1 prose) + fixer + round 2
  fast CLEAN. Verifier: no finding against the shipped diff; declared NOT
  SOLID *as closure* because this document's original verification rule (five
  consecutive cell-89 greens) is unreachable by a harness-side fix alone.
- **Scope adjudication at the merge gate (parent, recorded).** The lane's
  post-fix measurement falsified this document's single-cause premise: with
  observation turn-complete by construction, cell 89 still reds ~40–60% — the
  SECOND on-session query's reply genuinely never settles into the session
  (loud named-precondition failure), and twice `session.prompt()` did not
  resolve within 180 s. That residual is a PRODUCTION-side drive-contract
  defect (`src/`), which §Non-goals fences out of this report. This
  document's subject — the harness accumulator dropping a later turn's
  stream — is discharged by construction and locked offline; the original
  live verification rule is superseded (its premise measured false), and the
  residual is re-owned by bug 0288 (filed this session), whose closure — not
  this document's — owns cell 89's stable green.
- Residuals: (1) cell 89 remains red-prone until bug 0288 lands — do not
  attribute its reds to code changes; the failure text names the unsettled
  second reply. (2) `probe-harness.ts` shares the old read shape with no
  current assertion on it — untouched per §Fix constraints. (3) The filed
  "1000 ms" readings of `TURN_START_POLL_BOUND` were corrected in place at
  merge (1000 iterations × 10 ms ≈ 10 s), matching the lane's measurement.
- Discharge notes appended: none owed (0286 already records the attribution
  chain; 0288 records the re-owning).
- **Pin yield (2026-08-26, bug 0290 fix 0.287.0).** The 14864-line freeze on
  `tests/live/live-production-acceptance.test.ts` HOLDS across bug 0290 §Fix
  element (a)'s one-token edit at the bug 0188 cell
  (`.toHaveLength(1)` → `.toHaveLength(1 + turn.reAskCount)`): the file is
  still 14864 lines, and no other line in it changed.
