# Bug 0012 — Untyped queries surface a mid-flight abort as `Err(TransportError)` off-session (and as `Ok(<partial text>)` live), never the specified `cancelled` outcome

- **Status:** open.
- **Kind:** defect — cancellation surfacing. The bug-0010 fix added
  signal-aware cancellation mapping to every **typed**-query surface (the
  `runTypedQueryLoop` F1 guards, the `dispatchForcedRespondTurn` pre-gate and
  aborted-precedence arm, `mapForcedTurnToRepairOutcome`, the repair-restart
  boundary guards); the **untyped** loop got none of them. An abort landing
  while an untyped query's free-phase provider call is in flight therefore
  surfaces as the wrong terminal outcome on both untyped drivers: the
  off-session driver (`subagent fn` body `@`-queries) classifies the
  pi-ai-resolved aborted-stop reply as `Err(TransportError)` — the residual
  bug 0010's Fix §Residuals records verbatim — and the live prompt-mode
  driver **discards** the PIC-51 probe's synthesised `Err(cancelled)` (its
  divert filter forwards only `kind: "transport"`) and extracts the torn
  turn's partial text as a successful `Ok(string)`, bypassing the ordering
  PIC-53 pins. The spec's closed success/fail/cancelled trichotomy names one
  correct surface for both: `Err(QueryError { kind: "cancelled", ... })` and
  the CANCEL terminal outcome.
- **Affected:** `runUntypedQueryLoop` (`src/runtime/query-tool-loop.ts:352`)
  — its transport arm (:394–399) and text arm (:400–403) return
  unconditionally, with no `signal.aborted` re-check after the turn resolves
  (contrast the three bug-0010 F1 guards in `runTypedQueryLoop`: the
  free-phase transport-arm guard :485–487, the free-phase → forced-respond
  boundary re-check :517–519, the forced-arm guard :560–562) — and the two
  untyped feeding drivers in `src/extension/production-theta-producer.ts`:
  `OffSessionQueryModel.nextFreePhaseTurn` / `#driveFreePhaseRound`
  (:4201/:4434 — the classified failure rides the transport arm
  unconditionally, :4464–4469, via `classifyOffSessionReply` :4799, whose
  non-normal-stop fold explicitly includes `"aborted"`), and
  `LivePromptQueryModel.nextFreePhaseTurn` (:3578 — probe :3625, the
  transport-only divert :3629–3631 drops the probe's `cancelled` verdict,
  text fall-through :3633). Consumer mapping unchanged:
  `runQueryEffect` (`src/runtime/effectful-statement-host.ts:249–260`)
  already maps the loop's `cancelled` outcome to `Err(cancelled)`; the loop
  never produces it mid-flight. Scope: every untyped `@`-query in a
  `subagent fn` body (both in-process hosts, `userVisible: false`) and every
  live prompt-mode untyped `@`-query; the subagent child inherits the live
  path. The typed loops, the live typed repair drive
  (`driveRepairAttempt` :3824–3826 forwards every failed probe verdict,
  cancelled included), and the off-session repair-restart guards
  (:4355/:4368/:4393/:4415) are correct since 0010 — contrast only.
- **Observed at:** `0.20.0` (HEAD `30492948`), repo-local SDK pin
  `@earendil-works/pi-ai` `~0.80.10`. Mechanical verification only (scripted
  `complete()` / session doubles — a classification divergence needs no live
  provider). Recorded as pre-existing and out of scope by the bug-0010 fix:
  "One pre-existing neighbour is out of scope and recorded for a future
  report: UNTYPED off-session queries retain the transport-not-cancelled
  mid-abort classification that this fix corrected for typed loops."

## Summary

pi-ai's `complete()` resolves an in-flight abort, it does not reject: the
per-API adapter folds an aborted stream into the same terminal `error` event
an actual provider failure takes, with the final `AssistantMessage` carrying
`stopReason: "aborted"` (`dist/api/anthropic-messages.js:561` handles
`"aborted"` and `"error"` in one arm; `StopReason` includes `"aborted"`,
`dist/types.d.ts:273`). So a mid-flight abort is observable only as a
resolved aborted-stop reply (off-session) or as the post-idle
`thetaAbort.signal.aborted` flag (live). The bug-0010 fix taught every typed
surface to tell that apart from a provider fault: a transport-shaped verdict
observed **with the theta signal aborted** is the cancellation and surfaces
the CANCEL terminal outcome; a transport verdict with a live signal stays
`Err(transport)` (both halves pinned: `tests/off-session-two-phase.test.ts`
(d12)/(d14)/(d15), `tests/typed-two-phase-live.test.ts` (l)/(m)).

`runUntypedQueryLoop` predates those guards and never received them. Its
checkpoints cover only the pre-dispatch and round-entry windows; once
`nextFreePhaseTurn` resolves, the transport and text arms return
unconditionally. Consequences, one per driver:

- **Off-session untyped** (`subagent fn` body): the aborted-stop reply routes
  through `classifyOffSessionReply` — whose contract comment names
  `"aborted"` among the stop reasons folded through the classifier — and
  comes back as the transport arm; the loop returns it as the query's
  `Err(TransportError { message: "provider transport failure", http_status:
  null, provider: <model.api>, retryable: false })`. Esc reads as a provider
  fault.
- **Live prompt-mode untyped**: the post-idle probe
  (`extractPromptModeQueryResult`) correctly synthesises `Err(cancelled)` —
  the PIC-51 cancellation short-circuit — but the driver forwards only
  `kind: "transport"` verdicts into the loop's transport arm; the cancelled
  verdict falls through to `{ kind: "text", text: <partial> }` and the loop
  terminates with `Ok(<partial text>)`. Esc reads as success carrying
  truncated data. The typed loop's own F1 boundary-guard comment documents
  exactly this driver behaviour ("the live driver's post-idle probe
  synthesises `cancelled`, which is not a transport verdict, so the turn
  still surfaces as `text`") — the typed loop re-checks the signal there;
  the untyped loop returns the text as the final value.

## Reproduction

Mechanical, on `0.20.0` (scratch vitest, mirrors of the committed bug-0010
cancellation cells; not committed — run and deleted).

**(p1) Off-session untyped — the (d12) mirror.** The
`tests/off-session-two-phase.test.ts` harness (mocked
`@earendil-works/pi-ai/compat` `complete()`, production
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`,
harness-owned `thetaAbort` threaded as the bind input) driving the suite's
untyped fixture:

```theta
---
mode: prompt
---
subagent fn helper(a: string) {
  let v = @`Ping`?
  v
}
let out = helper("x")
out
```

with `complete()` #1 scripted to flip `thetaAbort` mid-call and resolve
`{ stopReason: "aborted", content: [] }` (the d12 script, minus the respond
tool). Observed:

```
outcome:      "success"                     (spec: the CANCEL terminal outcome)
final value:  Err({ kind: "invoke_callee", …,
                inner: { kind: "transport",
                         message: "provider transport failure",
                         http_status: null,
                         provider: "anthropic-messages",
                         retryable: false } })
complete():   1 call
```

The typed twin under the identical script is pinned green at HEAD: (d12)
observes `outcome: "cancel"` with one `complete()`.

**(p2) Live untyped — the (m) mirror.** The
`tests/typed-two-phase-live.test.ts` harness (session double committing a
scripted trailing assistant message; `onMidTurn` plants an aborted per-turn
`ctx.signal`, which `#driveUserVisibleTurn`'s CANCEL-2 forwarding flips into
`thetaAbort` after the turn settles) driving `let v = @`Ping`?` / `v` with
the torn stream's trailing message `{ stopReason: "aborted", text: "partial
answer" }`. Observed:

```
outcome:      "success"
final value:  "partial answer"              (Ok — the torn turn's partial text)
complete():   0 calls; sendUserMessage: 1
```

The typed twin (m) is pinned green at HEAD: `outcome: "cancel"`, zero
post-abort dispatches.

## Expected behaviour (what the spec says)

- `docs/spec_topics/cancellation.md` §Surfacing, first arm: "An in-flight
  query whose signal aborts returns `Err(QueryError { kind: "cancelled",
  ... })`." The arm is unqualified — no typed/untyped split, no
  on-session/off-session split.
- Same page, edge cases: "An abort observed *during* an in-flight query,
  tool call, or `invoke` surfaces through the underlying provider's abort
  path as the corresponding `Err` variant per the **Surfacing** rules below,
  not through a pre-call checkpoint." The pre-dispatch checkpoint the untyped
  loop does implement covers a different window.
- `docs/spec_topics/errors-and-results/error-model.md` §Terminal outcomes
  ("the set is closed"), CANCEL arm: "**Cancelled.** An `AbortSignal` aborted
  a query, tool call, or `invoke` child mid-execution per Cancellation. No
  final value flows; the caller observes `Err(QueryError { kind:
  "cancelled", ... })` per the `CancelledError` variant." Both observed
  results violate it: (p1) surfaces the fail arm with the wrong variant;
  (p2) flows a final value.
- Same page, per-cause table, Cancellation row: a parent-own-signal abort
  surfaces "bare `kind: "cancelled"`" — (p1)'s harness aborts the parent's
  own `thetaAbort`, so not even the `invoke_callee` wrapper is expected,
  matching the typed (d12) pin.
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` PIC-51
  hang-handling: "The post-`waitForIdle` error-state probe runs
  unconditionally on resolution, but if `thetaAbort.signal.aborted` is true
  the runtime synthesises `Err(QueryError { kind: "cancelled" })` per
  Cancellation instead of reading session error state — even when Pi tore
  down cleanly". PIC-53 makes the ordering normative for the untyped
  `Ok(string)` extraction: it runs "only once the cancellation short-circuit
  (`thetaAbort.signal.aborted`, which synthesises `Err(QueryError { kind:
  "cancelled" })`) … ha[s] been passed — the extraction runs downstream of
  those branches and never reorders or bypasses them." (p2) is a bypass:
  the short-circuit fired and the extraction ran anyway.
- `docs/spec_topics/errors-and-results/queryerror-variants.md`,
  `CancelledError`: "Fires when an `AbortSignal` aborted a query, tool call,
  or invoke" — with `message` unconstrained; and
  `docs/spec_topics/functions.md` FN-5: "On failure … and on cancellation,
  NO final value flows."
- There is no untyped exemption anywhere in the above; the only
  reply-side-vs-signal-side distinction the spec machinery admits is the one
  the typed surfaces already implement (an aborted-stop reply under a
  **non-aborted** theta signal stays transport — pinned by
  `tests/typed-two-phase-live.test.ts` (l)).

## Actual behaviour / root cause

The mid-flight window — abort lands after the pre-dispatch checkpoint, while
`nextFreePhaseTurn` is in flight — per path, at HEAD:

| Path | Mid-flight abort surfaces as | Mechanism | Agrees? |
|---|---|---|---|
| live typed | CANCEL terminal outcome | `runTypedQueryLoop` F1 guards (:485–487, :517–519, :560–562); `dispatchForcedRespondTurn` pre-gate + aborted precedence (:4946, :5048) | yes — pinned (m)/(l) |
| off-session typed | CANCEL terminal outcome | same loop guards; repair-restart guards (:4355/:4368/:4393/:4415) | yes — pinned (d12)/(d14)/(d15) |
| **off-session untyped** | **`Err(TransportError)`** (fail arm) | aborted-stop reply → `classifyOffSessionReply` (:4799) folds every non-normal stop to transport → `#driveFreePhaseRound` :4464–4469 → `runUntypedQueryLoop` transport arm :394–399, **no signal re-check** | **no** — (p1) |
| **live untyped** | **`Ok(<partial text>)`** (success arm) | probe synthesises `Err(cancelled)` (:3625; `prompt-transport-mapping.ts:90–93`) → driver divert forwards only `kind === "transport"` (:3629–3631) → falls through to `{ kind: "text" }` (:3633) → `runUntypedQueryLoop` text arm :400–403, **no signal re-check** | **no** — (p2); worse in degree |

The loop arms, verbatim (`src/runtime/query-tool-loop.ts:394–403`):

```ts
    if (turn.kind === "transport") {
      // PIC-50/51: the free-phase provider turn failed at the transport layer.
      // Surface it as the untyped query's `Err(TransportError)` — never masked
      // as a terminating `Ok(text)`.
      return { kind: "transport", error: turn.error, rounds, committed };
    }
    if (turn.kind === "text") {
      // Terminating plain-text turn: this is the untyped query's final response.
      return { kind: "text", text: turn.text, rounds, committed };
    }
```

Contrast the typed loop two functions down, whose transport arm opens with
the F1 guard ("a free-phase turn that failed WHILE the theta signal is
aborted is the in-flight abort, not a provider fault — pi-ai RESOLVES an
abort as a `stopReason: "aborted"` reply that the off-session classifier
folds into the transport arm … `if (signal.aborted) return { kind:
"cancelled", committed };`") and whose post-free-phase boundary re-check
exists because "the live driver's post-idle probe synthesises `cancelled`,
which is not a transport verdict, so the turn still surfaces as `text`". The
divergence was created by the 0010 fix itself: the guards were written into
`runTypedQueryLoop` only, and the untyped loop kept the pre-0010 shape —
exactly the shape the (d12)/(m) cells document as the typed loop's pre-fix
defect.

The `"provider transport failure"` message in (p1) is the PIC-51 fallback:
the aborted-stop reply carries no `errorMessage`, the classifier's transport
fold produces an empty message, and `classifyOffSessionReply` substitutes the
fixed fallback — so the author-visible `Err` does not even mention an abort.

No committed test pins either wrong behaviour. The bug-0007 classification
suite (`tests/off-session-transport-classification.test.ts`) scripts
`"error"` / `"length"` / overflow-signature stops but no `"aborted"` cell;
`tests/query-tool-loop.test.ts` pins the untyped loop's cancellation only at
the pre-dispatch checkpoint (already-aborted signal → dispatch skipped);
`tests/prompt-transport-mapping.test.ts` pins the probe module's aborted arm
— the module is conforming; the defect is downstream of it. The bug-0010
cancellation cells ((d12)/(d14)/(d15)/(l)/(m)) are all typed. A fix moves no
committed pin.

## Why it matters

- **Wrong error kind, wrong terminal outcome.** Esc during a `subagent fn`
  body query surfaces the fail arm with `kind: "transport"`: an author
  `match` arm on `kind: "cancelled"` never fires, retry-on-transport logic
  retries a user cancellation, and the closed trichotomy's CANCEL arm is
  unreachable for untyped off-session queries.
- **The live path fabricates success.** Bug 0007's severity class, recreated
  on the cancellation path: `Ok(<partial text>)` from a torn stream binds,
  `?` unwraps it, and the theta continues on truncated data — with FN-5's
  "on cancellation, NO final value flows" and PIC-53's ordering both
  violated. In a `par for` fan-out over `subagent fn` workers, one Esc
  yields a mixture of fabricated transport errors — not one `cancelled`.
- **Downstream surfaces render the misclassification.** The `Err`-note
  renderer distinguishes the arms (`src/runtime/err-note-render.ts`): SNK-c
  renders `returned Err: transport — provider transport failure` where SNK-f
  renders the terse `<prefix> cancelled`; the top-level unhandled-`Err` note
  therefore blames the provider for a user action. On the runtime event
  channel the divergence is starker: `transport` is in the group-A
  always-log set while `cancelled` is deliberately excluded
  (runtime-event-channel.md: "user/operator-initiated and self-explanatory
  in context"; `GROUP_A_KINDS` / `NON_ALWAYS_LOG_KINDS`,
  `src/runtime/runtime-event-channel.ts:79/:88`) — so the specified
  no-event-on-Esc behaviour becomes an always-log occurrence wherever that
  channel is wired.
- **Same Esc, three different answers.** One abort landing during a theta
  that mixes query forms produces the CANCEL outcome (typed query),
  `Err(transport)` (untyped `subagent fn` query), and `Ok(partial)` (untyped
  live query) — the 0009 two-vocabularies problem, escalated to the outcome
  level.
- Bounded in degree: aborts observed at the pre-dispatch checkpoint or a
  round boundary are correctly `cancelled` on all paths (pinned), so the
  defect window is exactly one in-flight provider turn per query; and the
  typed paths — the common case for value-bearing queries — are correct
  since 0010.

## Options

1. **Mirror the bug-0010 typed guards in `runUntypedQueryLoop`**
   (recommended). Two guard sites, both surfacing through the loop's
   existing `{ kind: "cancelled", committed }` outcome (which
   `runQueryEffect` already maps to `Err(cancelled)` /
   `effectful-statement-host.ts:259–260`):
   - *transport arm* (:394, the analogue of `runTypedQueryLoop`:485–487):
     `if (signal.aborted) return { kind: "cancelled", committed };` before
     returning the transport outcome — fixes (p1), the off-session
     aborted-stop misclassification;
   - *text arm* (:400, the analogue of the typed free-phase →
     forced-respond boundary re-check :517–519, whose F1 comment already
     names the live driver's text-shaped mid-abort turns): the same guard
     before returning the text outcome — fixes (p2), the live `Ok(partial)`
     masking, by honouring the PIC-51/PIC-53 short-circuit the probe
     already computed.
   Keying both guards on the theta signal (not the stop reason) preserves
   the cell-(l) distinction — a reply-side `"aborted"` stop under a live
   signal stays `Err(transport)` — and stays inside CNCL-5: the text-arm
   guard fires before the query's `Ok` materialises to theta code, the same
   window the typed boundary guard and PIC-51's "even when `waitForIdle()`
   resolved cleanly" already resolve in favour of `cancelled`; a completed
   `Ok` bound before the abort is untouched. Neither driver changes.
   Fixtures: the (d12) mirror over the off-session suite's existing untyped
   fixture and an (m) mirror in the live suite — both harnesses already
   carry the cancellation machinery (`thetaAbort` threading, `onMidTurn`).
2. **Fix the drivers instead: widen `FreePhaseTurn` with a `cancelled`
   arm** so `LivePromptQueryModel` forwards the probe's verdict and
   `OffSessionQueryModel` maps aborted-stop-under-aborted-signal itself.
   Equivalent observable behaviour, but it moves the mapping to N drivers
   (live, off-session, and every scripted test driver implementing the
   seam) where option 1 states it once at the loop — the placement the
   0010 fix already chose for the typed case — and it widens a seam type
   consumed by the frozen scripted-driver suites. Not recommended.

## Non-goals

- The typed surfaces — `runTypedQueryLoop`'s three guards,
  `dispatchForcedRespondTurn`'s pre-gate and aborted-precedence arm,
  `mapForcedTurnToRepairOutcome`, the live and off-session repair-restart
  guards — correct since 0010; contrast only.
- `extractPromptModeQueryResult` / `prompt-transport-mapping.ts` — the
  module conforms (its aborted arm synthesises `Err(cancelled)` in the
  pinned order); the defect is the consumer discarding its verdict.
- `classifyOffSessionReply`'s transport fold for genuinely non-cancelled
  failures — bug-0007 behaviour, unchanged; and the reply-side
  `"aborted"`-stop-with-live-signal transport classification (cell (l)) —
  deliberate, preserved by both options.
- The untyped loop's pre-dispatch checkpoint and round-boundary guards
  (:360–364, :375–377) — correct; untouched.
- CNCL-5/CNCL-6 race semantics and the `Checkpoint` seam — unchanged.
- The degraded unlowerable-annotation arms — bug-0010 residual, recorded
  there.

## Provenance

- Origin: bug 0010's Fix §Residuals records the off-session half verbatim
  ("UNTYPED off-session queries retain the transport-not-cancelled mid-abort
  classification that this fix corrected for typed loops"); the guards this
  report mirrors cite "bug 0010 fix review, F1" at each site. Provenance
  chain: bug 0007 → bug 0009 → bug 0010 → its fix review (F1) → this
  report. The live-untyped `Ok(partial)` half was found during this
  report's verification: the F1 boundary-guard comment documents the live
  driver's text-shaped mid-abort turns, and the untyped loop's text arm has
  no counterpart guard.
- Spec measured against: `docs/spec_topics/cancellation.md` (§Surfacing,
  the in-flight edge case, CNCL-5), `docs/spec_topics/errors-and-results/
  error-model.md` (§Terminal outcomes, per-cause table Cancellation row),
  `docs/spec_topics/errors-and-results/queryerror-variants.md`
  (`CancelledError`), `docs/spec_topics/pi-integration-contract/
  conversation-drive.md` (PIC-51 hang-handling short-circuit, PIC-51b
  ordering, PIC-53 extraction ordering), `docs/spec_topics/query/
  query-failure-and-repair.md` (§Non-validation: `cancelled` as its own
  propagating variant), `docs/spec_topics/functions.md` (FN-5),
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md`
  (always-log set membership).
- Implementation: `src/runtime/query-tool-loop.ts` (:352, :360–364,
  :375–377, :394–403; typed contrast :436, :485–487, :517–519, :560–562),
  `src/extension/production-theta-producer.ts` (`LivePromptQueryModel`
  :3514, :3578, :3625–3633, :3824–3826, :3861; `OffSessionQueryModel`
  :4154, :4201, :4355/:4368/:4393/:4415, :4434, :4464–4469;
  `classifyOffSessionReply` :4756/:4799; `dispatchForcedRespondTurn`
  :4946/:5048; `mapForcedTurnToRepairOutcome` :4034),
  `src/runtime/effectful-statement-host.ts` (:249–260),
  `src/runtime/prompt-transport-mapping.ts` (:90–93),
  `src/runtime/err-note-render.ts` (:126, :140),
  `src/runtime/runtime-event-channel.ts` (:79, :88).
- pi-ai surface (at the `~0.80.10` pin): `dist/types.d.ts:273`
  (`StopReason` includes `"aborted"`), `dist/api/anthropic-messages.js:561`
  (aborted/error stops resolve through the terminal `error` event; the
  final-result promise has no reject path — the bug-0007 finding).
- Tests inspected: `tests/off-session-two-phase.test.ts`
  ((d12)/(d14)/(d15) — typed-only; the untyped fixture exists at (d9)),
  `tests/typed-two-phase-live.test.ts` ((l)/(m) — typed-only),
  `tests/off-session-transport-classification.test.ts` (no `"aborted"`
  cell), `tests/query-tool-loop.test.ts` (untyped pre-dispatch abort only),
  `tests/prompt-transport-mapping.test.ts` (module-level aborted arm —
  conforming), `tests/production-cancellation-wiring.test.ts` /
  `tests/checkpoint-granularity.test.ts` (checkpoint windows only). No
  committed cell pins either wrong behaviour.
- Mechanical repro: scratch vitest mirroring (d12) and (m) with untyped
  fixtures, run against HEAD `30492948` and deleted (observed values quoted
  in §Reproduction); the typed twins re-run green at HEAD in the same
  session.
