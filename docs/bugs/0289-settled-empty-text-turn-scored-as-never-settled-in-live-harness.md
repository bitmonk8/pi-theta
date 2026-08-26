# Bug 0289 — A live H8a drive's on-session turn can terminate normally carrying a `thinking` part and an EMPTY `text` part (spec-legal `Ok("")` under PIC-51b/PIC-53); the harness scores that settled turn as "the LAST user turn's reply never settled" (`tests/live/harness.ts:426`) and cell 89 reds even though a real turn ran, because the discriminator's sentinel can land in the thinking part

- **Status:** fixed (0.286.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the defect is confined to live
  test infrastructure (production binding is spec-correct here) but denies the
  live suite a stable green and keeps cell 89 under AGENTS.md §"documented
  correct-reason reds", the register bugs 0283 and 0286 were filed in. D2
  because the fix surface is two test files with no production or spec change,
  but its verification runs against a stochastic live cell and one candidate
  element (a bounded same-session re-ask) touches the drive path itself.
- **Kind:** test-infrastructure defect, two parts — (1) a misreport: a settled
  turn with empty text is reported as an unsettled turn; (2) a non-robust
  drive discriminator: the sentinel is demanded in `text` while the model may
  place its arithmetic in `thinking` and emit no text.
- **Affected** (every citation re-derived at HEAD `aa715848`):
  - `tests/live/harness.ts:404`–`:428` — `waitForLastTurnSettled`, the poll
    bug 0287 §Fix item 3 added:
    - `:409` — `for (let attempt = 0; attempt < ASSISTANT_TURN_POLL_BOUND; attempt++)`.
    - `:394`–`:395` — `ASSISTANT_TURN_POLL_INTERVAL_MS = 40`,
      `ASSISTANT_TURN_POLL_BOUND = 375` (≈ 15 000 ms).
    - `:421`–`:427` — the expiry `failLoudly`. **`:426` is the misreport**:
      `` `turn's reply never settled into the transcript within ${boundMs}ms ` ``.
      There is no branch that distinguishes "no assistant entry after the last
      user turn" from "an assistant entry that terminated normally and carries
      an empty text part".
  - `tests/live/harness.ts:460`–`:471` — `lastTurnSettled`.
    `:467` — `if (collectAssistantTexts(afterLastUser).some((text) => text.length > 0))`
    is the only assistant-side accept clause: settledness is defined as
    *non-empty text*, so a normally-terminated empty-text turn never satisfies
    it and the poll runs to its bound. The clause's own justification
    (`:441`–`:447`) covers a different shape — "an assistant entry can be
    thinking-only or thinking+toolCall with **no text part at all**" — not the
    observed shape, which has a `text` part whose text is `""`.
  - `tests/live/harness.ts:514`–`:539` — `collectAssistantTexts` pushes every
    `text` string including `""`. Hence the expiry message's
    `${assistantTextCount}` counts the empty part as an "assistant text part",
    which is why the observed failure reads "2 assistant text part(s) … never
    settled" — internally contradictory as a report.
  - `tests/live/live-production-acceptance.test.ts:14727`–`:14757` — cell 89's
    declared-`E` twin: a typed query (`471 + 133`), `let n = 306 + 218`, and a
    final untyped discriminator query interpolating `n`.
    `:14736` — `DECLARED_E_SENTINEL_CELL_89 = "865"`.
  - `tests/live/live-production-acceptance.test.ts:14846` — the drive:
    `await driveSlashCaptureTurn(handle, "/b0273livegood")`.
  - `tests/live/live-production-acceptance.test.ts:14852`–`:14858` — the
    sentinel assertion over `turn.text` alone. `thinking` never reaches
    `turn.text`, so a thinking-only reply reds here for a run in which the
    theta's arithmetic did reach the prompt.
  - `src/runtime/conversation-drive.ts:202`–`:232` — `extractTrailingTurnText`
    omits the `thinking` array and yields `""` for such a turn. Spec-correct,
    not the defect.
  - `docs/spec_topics/pi-integration-contract/conversation-drive.md:16` —
    PIC-51b: "A trailing `assistant` message that is present but carries no
    text is **not** case (ii): it is classified by its `stopReason` under (i),
    so an empty-text turn on a normal boundary still reaches PIC-53's `Ok("")`
    (the pure tool-use turn)." PIC-53, same line: "A final turn that produced
    no assistant text (a pure tool-use turn) yields the empty string."
- **Observed at:** HEAD `aa715848` (bug 0288's fix merging concurrently as
  v0.285.0). Live evidence measured in the bug-0288 fix lane
  (`C:/UnitySrc/pi-theta-lane-q`, branch `lane/q-0288`, forked at `aa715848`),
  quoted from `.pi/tmp/fixes/0288-report.md` (byte-identical copies in the lane
  worktree and in the main repo). No live test was run by this writer.
- **Scope:** the two live test surfaces above. Every exposed multi-query live
  cell inherits part (1) through `driveSlashCaptureTurn`; only cell 89 is
  witnessed. Single-query cells cannot reach the misreport for the reason at
  issue: their single reply is the drive's whole text and an empty one already
  reds their own assertion.

## Summary

The live H8a harness treats "assistant text is non-empty" as the definition of
"the drive's last turn settled" (`tests/live/harness.ts:467`). The model can end
a turn normally — `stopReason: "stop"` — with a `thinking` part and a `text`
part whose text is empty. That turn is settled and its value is spec-legal
`Ok("")` under PIC-51b/PIC-53. The harness polls it for 15 000 ms and then fails
loudly saying "the LAST user turn's reply never settled into the transcript"
(`:426`), which is false: the reply settled, emptily.

Two distinct defects follow. (1) The failure text names a state the transcript
contradicts, so every red carrying it is unattributable without a transcript
dump — the condition that consumed the bug-0288 lane's live budget. (2) Cell 89
reds even when a real turn ran, because its discriminator demands the sentinel
`865` in `turn.text` while the model may compute it inside `thinking` and emit
no text — the model-behaviour-robustness class bug 0243 established for drive
prompts.

## Reproduction

Offline (code reading): follow a transcript slice whose trailing entry is
`{role:"assistant", stopReason:"stop", partKinds:["thinking","text"], textLen:0}`
through `lastTurnSettled` (`tests/live/harness.ts:460`): `lastUserIndex` is the
second query's user entry; `collectAssistantTexts(afterLastUser)` yields
`[""]`; `.some((text) => text.length > 0)` is false; no `theta-system-note`
follows; the function returns false for every one of the 375 polls, and
`:421` reports "never settled".

Live (measured in the bug-0288 lane; not re-run here). A scratch probe drove
cell 89's body and dumped the appended `SessionManager` slice at `prompt()`
resolution and again 15 s later. **1 of 5 drives** reproduced the shape; its
final entry, unchanged after 15 s (verbatim from
`.pi/tmp/fixes/0288-report.md`):

```
{"type":"message","role":"assistant","stopReason":"stop","hasStopReason":true,
 "textLen":0,"partKinds":["thinking","text"]}
```

versus the healthy shape in the other 4 drives (`stopReason:"stop"`,
`textLen:3`). The lane's own reading of it, verbatim:

> So on the red: query 2's user entry is present, its run **started, streamed and
> terminated on a NORMAL `stop` boundary**, and the model emitted a `thinking` part
> plus a `text` part whose text is EMPTY — permanently. There is no expiry, no
> unstarted turn, no swallowed send, and no hang.

Cell 89 in the same lane, with bug 0288's producer fix in place: **run 1 GREEN,
run 2 RED**, the red verbatim:

```
AssertionError: driveSlashCaptureTurn("/b0273livegood") precondition unmet: the appended
transcript slice held 2 user turn(s), 2 assistant text part(s) and no theta-system-note
entry, and the LAST user turn's reply never settled into the transcript within 15000ms (bug 0287).
 ❯ waitForLastTurnSettled tests/live/harness.ts:421:3
```

The lane records that this is "byte-for-byte the pre-fix signature the bug
document quotes in §Reproduction (a)" and that `prompt()` itself resolved in
31.7 s. The run-2 transcript was not dumped, so run 2 is a signature match, not
a proven instance; the proven instance is the probe drive above.

## Expected behaviour

1. A drive whose last on-session turn terminated normally with empty text is
   reported as what it is. Any failure text names the true state — settled,
   text empty, thinking present — never "never settled".
2. Cell 89 discriminates a real run from a degraded plain-prompt run without
   depending on the model choosing to put its answer in `text` rather than in
   `thinking`, and without weakening what it proves: the sentinel `865` must
   still be computed from the theta's own `n` and reach observable text.

## Actual behaviour / root cause

`lastTurnSettled` (`tests/live/harness.ts:460`–`:471`) has three accept
clauses: no user entry at all (`:465`), non-empty assistant text after the last
user entry (`:467`), a system note after it (`:470`). A settled empty-text turn
matches none. Bug 0287 chose the non-empty demand deliberately — accepting any
trailing assistant entry would return the EARLIER turn's reply as the drive's
text, the divergence 0287 documents — so the predicate is not wrong about what
it must reject; it is wrong about how it reports the rejection, and it conflates
"not yet arrived" with "arrived empty". Both live under one boolean.

Downstream, `collectAssistantTexts` (`:514`) counts the empty part, so the
expiry message reports "2 assistant text part(s) … never settled" — the report
carries the evidence that refutes it.

On the cell side, `turn.text` is built from `collectAssistantTexts(appended).join("")`
(`:377`), and `thinking` is not a `text` part anywhere in that walk. The
sentinel assertion (`:14854`) therefore reads a channel the model is free to
leave empty. Bug 0243 established the counterpart discipline for the outbound
half (drive prompts must not be shaped so the model refuses); this is the
inbound half (drive observables must not assume where the model puts its
answer).

Production is not implicated. `extractTrailingTurnText`
(`src/runtime/conversation-drive.ts:202`) omits `thinking` and yields `""`, and
PIC-51b routes an empty-text normal-boundary turn to PIC-53's `Ok("")`
(`docs/spec_topics/pi-integration-contract/conversation-drive.md:16`). Making
that shape a loud producer failure would contradict the spec, as the bug-0288
lane found when its review round 1 forced `isSettledTurnEnding` to accept any
trailing `assistant` message regardless of text.

## Attribution — the fourth cell-89 subject

Cell 89 has now produced four filed subjects: 0286 (the discriminator answered
the intermediate value `524`), 0287 (the whole-drive text accumulator dropped a
later turn's stream), 0288 (silent start-poll expiry / swallowed send), and this
one.

Re-attributable to this mechanism:

- Nothing retroactively, on evidence. Only one red is proven to be this
  mechanism: the bug-0288 lane's 5-drive transcript probe (1 of 5).

Not separably attributable:

- **Bug 0287's post-fix live batches** — `.pi/tmp/fixes/0287-report.md`:
  `.pi/tmp/b0287-post-1..5.log` = ✓✓✓✗✗ and `.pi/tmp/b0287-final-1..5.log` =
  ✓✗✗✗✓, the reds carrying "the new loud precondition message, not a content
  mis-attribution". That message is exactly the string this mechanism produces
  **and** exactly the string 0288's silent expiry produces. No transcript was
  dumped for any of those five reds, so how many were this mechanism versus
  0288's is not attributable retroactively. It is not recoverable from the logs
  either: the two states differ only in the presence and text length of the
  trailing assistant entry, which the message does not print.

Cannot be re-attributed:

- **Bug 0286's reds** (4-for-4, `turn.text === "524"`): non-empty text carrying
  a wrong number. This mechanism yields empty text for the last turn, so the
  signatures are disjoint.
- **Bug 0287's pre-fix reds** (`streamed text: "604"`): before 0287, the drive
  read a `text_delta` accumulator, so a thinking-only second turn would have
  contributed nothing and presented identically to the accumulator drop. The
  pre-fix signature cannot separate the two, but 0287's mechanism was
  independently proven (`userTexts` showed the second query rendered and was
  sent while its stream was lost), so those reds are attributed as filed.
- **Bug 0288's static holes** (P1/P2/P3/P4/P6) are proven by its offline
  witness, which reds at HEAD for its own reasons. This document does not
  disturb them; it removes 0288's single-cause premise for the live signature
  only.

Going forward the states are separable: 0288's fix mints named phase-expiry
`TransportError` messages for a genuinely unstarted or unsettled turn, so a
post-0.285.0 cell-89 red is either that named diagnostic (0288's class) or the
harness bound (this class) — provided the harness stops printing "never settled"
for both.

## Why it matters

- The live suite has no stable green: cell 89 stays under AGENTS.md
  §"documented correct-reason reds", and every future change to the drive path
  is verified against a cell that reds for a reason unrelated to the change.
- Each red costs a transcript-probe campaign to attribute, because the failure
  text asserts a state the transcript contradicts. That is the direct cost paid
  in the 0287 and 0288 lanes.
- The misreport is contagious: `driveSlashCaptureTurn` is the shared reader for
  every exposed multi-query live cell, so any of them can produce a false
  "never settled" red.

## Non-goals

- **The model's thinking-only behaviour.** Whether a provider emits an empty
  `text` part beside a `thinking` part on a normal stop boundary is provider
  side. This document does not propose detecting, suppressing or configuring
  it.
- **Accepting empty text as success.** No candidate below admits `""` as a
  passing drive result, and none removes or weakens the sentinel demand. A
  drive that produced no observable answer must still red — with a truthful
  message.
- **The production binding.** `Ok("")` for an empty-text normal-boundary turn
  is PIC-51b/PIC-53 behaviour and stays. Changing it is a spec change, out of
  scope.
- **Bug 0287's read design.** Reading the settled `SessionManager` slice rather
  than an event window stays; only the classification of one slice shape
  changes.
- **`docs/spec_topics/**` and `docs/plan_topics/**`.** Untouched.

## Fix

Two test surfaces. Element (a) is mandatory; element (b) is one bounded choice
between two candidates, adjudicable in-lane on measured evidence; element (c)
is the standing non-goal above.

**(a) Classify a settled-but-empty turn distinctly (mandatory).**
`lastTurnSettled` (`tests/live/harness.ts:460`) becomes a classifier rather
than a boolean — three outcomes over the post-last-user slice: *pending* (no
assistant entry and no note), *settled-with-text*, *settled-with-empty-text-
after-thinking* (a trailing assistant entry exists, contributes only empty text
parts, and terminated on a normal boundary). `driveSlashCaptureTurn` returns on
the first two exactly as today; on the third it stops polling and lets the
cell's own assertions run, or fails loudly naming the true state. The expiry
message at `:421`–`:427` never says "never settled" for a slice that holds a
trailing assistant entry; it prints the trailing entry's `stopReason` and its
per-part text lengths so the next red is attributable from the log alone.
`collectAssistantTexts` stays byte-compatible (bug 0287's offline lock asserts
it exports `""`-inclusive texts); the new classifier is exported so an offline
witness can drive it on synthetic slices.

**(b) Make cell 89's drive robust to a thinking-only reply (one of two).**
Both candidates preserve the assertion: `865` must be computed from the
theta-rendered `n` and reach observable text.

- **b1 — one bounded same-session re-ask.** When the classifier reports
  settled-with-empty-text, the drive re-issues the same query once through the
  same production path on the same session (a real turn, not a replay), and the
  cell asserts over the union of turn texts. Exactly one retry; a second empty
  settle fails loudly with the classification from (a). Decided by: whether a
  re-ask can be issued from the harness without reaching into production
  internals (bug 0287's §Non-goal boundary) — the harness holds
  `handle.session`, so a re-ask is a second `prompt()`-level drive, not a
  producer call. If a re-ask cannot be expressed without a producer-internal
  dependency, b1 falls.
- **b2 — a discriminator form measured to elicit non-empty text.** Reshape the
  final query's prompt so a text reply is the task (bug 0243's discipline:
  task-framed, no verbatim-echo demand), and measure the elicitation rate
  before adopting. Decided by: an N≥20 probe of the candidate prompt against
  the pinned model recording `textLen` per drive. Adopt only if zero
  empty-text settles are observed; otherwise b2 falls back to b1.

If b1 is chosen the change is harness-side and
`tests/live/live-production-acceptance.test.ts` stays byte-frozen at **14864
lines** (bug 0287's §Fix pin). If b2 is chosen that file must change and the
pin yields for the prompt-body constant only; the line count is then re-pinned
in the fix record. Prefer b1 for that reason unless its probe evidence fails.

**(c) Non-goal**, per §Non-goals: the model's thinking-only behaviour and any
acceptance of empty text as a passing result.

**Ordering.** This fix lands after bug 0288's producer fix (v0.285.0), which
supplies the named phase-expiry diagnostics that make the two live states
separable. See [0288](./0288-multi-query-prompt-drive-completes-without-the-second-querys-reply.md).

### Verification

- **Offline witnesses (the gate).** New cells over the exported classifier on
  synthetic `SessionManager` slices: a pending slice, a settled-with-text
  slice, a settled-empty-text-after-thinking slice, and a slice whose trailing
  assistant entry is thinking-only with no `text` part at all. Each must be RED
  before the fix (today all four collapse to "not settled" and, on expiry, to
  the "never settled" message). One cell asserts the expiry message text does
  not contain "never settled" when a trailing assistant entry exists.
- **Bug 0287's offline lock stays green.**
  `tests/b0287-live-harness-assistant-text-reader.test.ts` (5 cells) is
  untouched and passes, including its `["604", "865"]` two-turn cell.
- **Bug 0288's offline witness stays green.**
  `tests/b0288-prompt-turn-completion-witness.test.ts` (7 cells, arriving with
  v0.285.0) is untouched and passes.
- **No behaviour hole.** `npm test`, `npm run typecheck`, `npm run lint` clean.
  Single-query live cells are not edited.
- **Live decision rule.** Cell 89 green in 8 consecutive runs under the live
  lock, each recorded with its log path. **Falsifier:** if any of the 8 runs
  reds and the red does NOT carry the new settled-with-empty-text
  classification — a bare "never settled", or 0288's named phase-expiry
  diagnostic, or a non-resolving `prompt()` — this document's mechanism is not
  the remaining cause and the residual is re-filed rather than absorbed. A red
  that DOES carry the new classification after a bounded re-ask (b1) is this
  mechanism recurring past its own bound and is likewise re-filed, not
  absorbed. Fewer than 8 runs, or other cells substituted for cell 89, do not
  discharge the rule.
- **Exposure sweep.** The exposed multi-query siblings
  (`inline-object-field-name-case-live-cell.test.ts`,
  `b0251live-tolerated-junk-carrier-live-cell.test.ts`,
  `inline-object-stray-close-token-live-cell.test.ts`) run once post-fix to
  show the new classification adds no stall.

## Fix (0.286.0)

- What shipped: `tests/live/harness.ts` — element (a): the private
  `lastTurnSettled` boolean becomes the exported classifier `classifyLastTurn`
  over the post-last-user slice (`pending` | `settled-with-text` with its
  `via: "no-user-turn" | "assistant-text" | "system-note"` reason, bug 0287's
  three accept clauses preserved verbatim in meaning and order |
  `settled-with-empty-text` carrying the trailing entry's
  `TrailingAssistantShape` — `stopReason`, `partKinds`, per-part
  `textLengths`), and every failure text names the true state: the
  "never settled" wording survives only where no trailing assistant entry
  exists, an expiry over a still-streaming trailing entry prints its shape,
  and the bound-expiry empty-settle ending reports the observed `isIdle` and
  drops the "turn ended" claim when the run is still in flight. Element (b) =
  **b1**, adjudicated in-lane: the harness already holds `handle.session`, so
  the re-ask is a `prompt()`-level drive on the same session with no
  producer-internal dependency — b1 stands and b2's line-pin break is
  unnecessary. `waitForLastTurnSettled` becomes the exported
  `captureSettledTurn(deps, entriesBefore, slashInvocation)` with injected
  `getEntries` / `prompt` / `isIdle` / `sleep`; on a settled-with-empty-text
  classification observed while the session is IDLE and the boundary is normal
  it re-issues the LAST user text EXACTLY ONCE through the real production
  path and reads the union of turn texts, while a second consecutive empty
  settle, a non-normal boundary and an unre-askable slice each fail loudly
  with the element-(a) classification. `driveSlashCaptureTurn` keeps its
  signature and delegates. `collectAssistantTexts` is byte-untouched (bug
  0287's lock), `tests/live/live-production-acceptance.test.ts` is byte-frozen
  at 14864 lines, and `src/**`, `docs/spec_topics/**`, `docs/plan_topics/**`
  are untouched — element (c)'s non-goals hold: no empty text is ever accepted
  as a passing result and the sentinel `865` is still model-computed from the
  theta-rendered `n` and still read out of observable text.
- Gates: witness `tests/b0289-settled-empty-text-turn-classification.test.ts`
  10/10 green (RED at HEAD: 7 cells failing loudly on the absent
  `classifyLastTurn`/`captureSettledTurn` seam, then 2+1 added by review
  rounds 2 and 3); full default suite 462 files / 9428 tests green (baseline
  461/9418 plus the 10 witness cells); `npx tsc --noEmit` clean; `npm run
  lint` clean; `wc -l tests/live/live-production-acceptance.test.ts` = 14864;
  `tests/fixtures/h7a/permitted-codes.json` byte-unchanged (blob
  `a4a8da04…`); bug 0287's offline lock 5/5 and bug 0288's offline witness 7/7
  green, unedited.
- Review: 3 rounds — round 1 (deep) three `correctness` findings: F1 the b1
  re-ask could fire mid-run, where `AgentSession.prompt()` throws "Agent is
  already processing" (the trailing assistant entry and its `stopReason` are
  appended at `message_end` mid-run), F2 `toolUse`/`tool_use` would classify
  an in-flight tool turn as settled, F3 the post-loop expiry branched on a
  STALE classification and could still emit "never settled" for a slice
  holding a trailing assistant entry; the round also rebutted the
  orchestrator's slice-growth concern on pi-source evidence (the re-ask's user
  entry is appended inside the awaited run). Round 2 (deep, routed deep
  because round 1 raised correctness) verified F1/F2/F3 resolved by the idle
  gate, the boundary doc and the fresh post-loop classification, and raised
  one minor `correctness` finding: the post-loop empty-settle ending asserted
  "the turn ended" without consulting `isIdle`. Round 3 (fast) CLEAN, no
  escalation.
- Verification: VERIFIED. (i) The witness reds without the fix in both
  directions — collapsing the classifier's trailing-entry branch reds 6 of 10
  cells, removing the re-ask reds 4 of 10 — and `git hash-object
  tests/live/harness.ts` is identical before and after each neutralisation
  (`a2c0df56…`), so no half-reverted state shipped. (ii) Default suite
  462/9428 green. (iii) Live decision rule discharged by the orchestrator
  under the shared live lock: cell 89 GREEN in 8 CONSECUTIVE runs
  (`.pi/tmp/b0289-live-1.log` … `-8.log`, each `Tests 1 passed | 89 skipped`,
  10.1–19.2 s), zero reds, so the falsifier never fired; the exposure sweep
  ran the three exposed multi-query siblings once post-fix
  (`.pi/tmp/b0289-live-sweep.log`, 3 files / 4 tests green, no stall).
  (iv) Lint and typecheck clean.
- Residuals: (1) `src/extension/production-theta-producer.ts:5069`–`:5070`
  cites "its own `lastTurnSettled`, `tests/live/harness.ts:460`" and calls the
  harness BYTE-FROZEN; that symbol is now `classifyLastTurn` and the harness
  is no longer frozen. `src/**` is out of this fix's scope, the citation gate
  does not red on it (full suite green), and the producer's own behaviour is
  unaffected — comment-only follow-up for whoever next edits that file.
  (2) The 8/8 green tally is measured over runs in which the empty-settle
  shape may not have occurred at all (it reproduced in 1 of 5 probe drives in
  the bug-0288 lane); the b1 re-ask path's live exercise is therefore not
  proven by these 8 runs, only its non-interference. Its logic is locked
  offline by the 10-cell witness.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the production binding stays — `Ok("")`
  for an empty-text normal-boundary turn is PIC-51b/PIC-53 behaviour and no
  production or spec file was touched; b2 (discriminator reshape) was NOT
  adopted, so bug 0287's 14864-line pin on
  `tests/live/live-production-acceptance.test.ts` still holds; the model's
  thinking-only behaviour is untouched and undetected.
- **Pin yield (2026-08-26, bug 0290 fix 0.287.0).** This §Fix's lock enumeration
  named no cell-side assertion that counts rendered queries exactly, so the
  bounded re-ask (element (b1)) red four such live cells; bug 0290 closes that
  gap by exposing the re-ask as `DrivenTurn.reAskCount` and re-keying those
  assertions to `1 + reAskCount` under a byte-identity constraint. The 10-cell
  witness `tests/b0289-settled-empty-text-turn-classification.test.ts` stays
  green and byte-unedited.

## Related

- [0288 — a multi-query prompt drive completes without the second query's reply](./0288-multi-query-prompt-drive-completes-without-the-second-querys-reply.md)
  — fixed (0.285.0). Its lane proved this mechanism and could not discharge its
  own live rule because of it; its §Fix residual 1 is this document. This fix
  lands after it.
- [0287 — `driveSlash`'s whole-drive text accumulator drops a later turn's stream](./0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md)
  — fixed (0.284.0). Its landed `waitForLastTurnSettled` / `lastTurnSettled`
  read is the surface amended here; its non-empty-text demand is kept, its
  reporting of the rejection is not.
- [0286 — live cell 89's drive discriminator answers the intermediate value](./0286-live-cell-89-drive-discriminator-answers-intermediate-value.md)
  — fixed (0.283.0). The first cell-89 subject; its signature is disjoint from
  this one.
- [0243 — verbatim-echo drive sentinels read as prompt injection](./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md)
  — fixed (0.220.0). The precedent for model-behaviour-robust drive
  discriminators; element (b) applies its discipline to the reply channel.
- [0273 — propagated `Result` error-side unresolved name silent](./0273-propagated-result-error-side-unresolved-name-silent.md)
  — fixed (0.267.0). Cell 89's subject, which stays green throughout: the
  registration refusal and the twin's registration are unaffected.

## Provenance

Twentieth session continuation. Filed from bug 0288's fix lane STOP verdict —
its §Fix→Verification falsifier fired on live run 2 of 8 and the lane re-filed
the residual rather than absorbing the red. All live evidence quoted verbatim
from `.pi/tmp/fixes/0288-report.md` (identical copies at
`C:/UnitySrc/pi-theta/.pi/tmp/fixes/0288-report.md` and
`C:/UnitySrc/pi-theta-lane-q/.pi/tmp/fixes/0288-report.md`) and the batch
records from `.pi/tmp/fixes/0287-report.md`; no live test was run by this
writer. All source and spec citations re-derived at HEAD `aa715848`.
