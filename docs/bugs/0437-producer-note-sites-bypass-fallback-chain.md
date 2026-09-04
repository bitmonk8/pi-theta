# Bug 0437 — The producer's six invocation-time note emitters call `pi.sendMessage` raw, so the channel's mandated best-effort fallback never runs for them: a non-stale host throw on the SLSH-3/panic/echo/overflow/BNDR-9/binder-failure notes walks no `ctx.ui.notify`, emits no delivery-failed diagnostic, produces no terminal stderr line — it escalates through the internal-error surface into a second raw send whose repeat throw aborts the slash handler

- **Status:** fixed (0.429.0).
- **Sev/Diff estimate:** S2/D2 — S2: loud-but-wrong plus lost user-visible
  output on a modelled host failure: the invocation-outcome notes (the
  channel's most user-facing traffic) violate "the fallback never aborts
  the slash-command handler", and the echo case converts a SUCCESSFUL bind
  into a fabricated "aborted with internal error" framing before the
  handler dies. D2: multi-seam — six sites must route through
  `sendSystemNote` (or an equivalent guarded wrapper) with per-site
  `display`-aware fallback semantics; the channel machinery already exists.
- **Kind:** defect — the spec pins the fallback chain for every note shape
  on the channel; the producer bypasses it at six note emitters (seven raw
  `pi.sendMessage` calls — `#emitBinderFailureNote` sends at both `:1468`
  and `:1486`), plus one boundary-discard emitter and three gate wirings
  (below) in the same class.
- **Related:**
  - 0018 (fixed 0.28.0) — built `sendSystemNote`'s chain + stale-ctx
    posture; the watcher/load/clean-cancel emitters were all routed through
    it, the producer's inline sites never were.
  - 0383/0397/0398/0399/0400/0401 (fixed) — each touched these exact sites
    (details/content fixes) and preserved the raw-send delivery unexamined.
  - [bug 0435](./0435-fallback-diagnostic-step-reinvokes-sendmessage.md) — the sibling defect on the wirings
    that DO use the chain (step-2 re-entry); together they mean no
    invocation-time note on this channel currently has a conformant
    failure path. Ordering: land 04 FIRST — this report's fix routes the
    raw senders through `#input.systemNoteChannel`, the very channel whose
    fallback `emitDiagnostic` 04 fixes.
- **Affected** (verified at `04579e12`, v0.415.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:130`
    — "The `pi.sendMessage` call for `theta-system-note` is treated as
    best-effort … The best-effort fallback below covers synchronous throws
    from the always-log emission sequence: for group-A `details: { event }`
    notes this is `Clock.wallNow()` during `occurred_at` stamping and the
    `pi.sendMessage` call; **for every other note shape (which constructs
    no `RuntimeEvent`) it is the `pi.sendMessage` call only.** If any of
    those steps throws, the runtime falls back in this order: …" and `:135`
    — "On a live runtime the fallback never aborts the slash-command
    handler or the spawned subagent session."
  - Raw emission sites (each `this.#input.pi.sendMessage(…)` with no
    try/catch and no `sendSystemNote`), `src/extension/production-theta-producer.ts`:
    `:1199` (`#emitBinderEchoNote`, BND-1), `:1436`
    (`#emitCustomTypeUnsafeNote`, BNDR-9), `:1468`/`:1486`
    (`#emitBinderFailureNote`, group-A binder failures), `:1672`
    (`#emitNoParamsOverflowNote`, SLSH-1), `:1738` (`emitTopLevelErrNote`,
    SLSH-3/4/5 + group-A event), `:1763` (`emitPanicNote`, group-B panic —
    whose framing the fallback paragraph names explicitly: "For
    panic-routed notes, the original panic message MUST be included in the
    final-resort `console.error` log"). Six emitters, seven raw calls
    (`:1468` + `:1486` share one emitter).
  - Additional raw senders in the same class (neither enumerated above nor
    excluded — the `:130` mandate is shape-agnostic):
    `#emitUntypedBoundaryDiscardNote` (`production-theta-producer.ts:
    5134–5135`, raw `this.#pi.sendMessage`), and the three
    `ActiveSetGateDeps.emitSystemNote` wirings (`:4131`, `:5532`, `:7099`),
    each a raw send of a real note on the channel. Ten raw send sites
    total.
  - Escalation path: `src/extension/theta-composition-producer.ts:597–606`
    — the dispatch outer catch routes any throw (including a
    `pi.sendMessage` throw out of `emitTopLevelErrNote`) to
    `surfaceDispatchDefect` (`:621–660`), whose internal-error arm calls
    `deps.emitPanicNote` → the second raw send (`production-theta-
    producer.ts:1763`) → the repeat throw escapes `run()` past the
    `finally` (`:606–613`) to the host.
  - Conformant contrast in the same class: the clean-cancel note
    (`session-shutdown.ts:492`), watcher notes (`watcher-recovery.ts:165`),
    load/reload notes (`load-pre-eval.ts:110`, `hot-reload.ts:351`) — all
    `sendSystemNote`.
- **Observed at:** v0.415.0 (`04579e12`), offline, deterministic. Probe P3
  (scratch, deleted): the production producer built with a throwing
  `pi.sendMessage`.

## Summary

`sendSystemNote` implements the channel's normative failure containment —
toast (display-gated), delivery-failed diagnostic, latched terminal
stderr, stale-ctx quiesce — and the spec scopes that chain to every note
shape on the channel ("for every other note shape … it is the
`pi.sendMessage` call only"). The producer's six invocation-time emitters
never adopted it: each sends raw. On a non-stale synchronous host throw
(the exact input the chain exists for; the stale case has its own pinned
unwind-to-dispatch posture, which raw sending accidentally imitates —
but for EVERY throw, not just stale):

- the note is lost with zero fallback artefacts (no toast, no
  `theta/runtime/system-note-delivery-failed`, no
  `system-note delivery failed:` stderr line, no panic-message
  final-resort log);
- the throw unwinds into the dispatch outer catch, which mis-frames a
  host delivery failure as a theta runtime defect
  (`theta /<name> aborted with internal error: <sendMessage error>`) —
  for `emitTopLevelErrNote` this replaces the real SLSH-3 content; for the
  echo it fabricates an abort for a bind that SUCCEEDED;
- the framing note's own raw send then throws identically, and that second
  throw escapes `run()` — the slash handler aborts, violating `:135`
  verbatim.

## Reproduction

Offline (probe P3, deleted):

1. `createProductionProducerDeps({ pi: { sendMessage: () => { throw new
   Error("host sendMessage refused (non-stale)") } }, root: <double>,
   modelRegistry: <empty> })`. The `root` double MUST supply
   `clock.wallNow` (and `idSource.newInvocationId`):
   `emitTopLevelErrNote` stamps `occurred_at` via
   `this.#input.root.clock.wallNow()` before the send, so a clock-less
   double dies on a `TypeError`, not the host error.
2. `deps.emitTopLevelErrNote("demo", <TransportError leaf>)` → the call
   THROWS `host sendMessage refused (non-stale)` out to the caller
   (witnessed: `expect(…).toThrow`). Under `sendSystemNote` the same input
   returns normally after walking the chain (its non-stale arm is
   unit-pinned by the 0018-era suite).
3. `deps.emitPanicNote("theta /demo aborted: x", <match-error
   diagnostic>)` → same propagation (witnessed).
4. Escalation is source-traced (`theta-composition-producer.ts:597–660`):
   the outer catch's internal-error arm re-enters `emitPanicNote`, whose
   repeat throw has no remaining catch inside `run()`.

## Expected behaviour

`runtime-event-channel.md:130–135`: any synchronous `pi.sendMessage` throw
on this channel walks the chain — `ctx.ui.notify` when `display: true`,
then the delivery-failed diagnostic, then the latched terminal
`console.error` (which for panic notes MUST include the original panic
message) — and "never aborts the slash-command handler". The stale-ctx
error is the one exception (mark-dead + rethrow to dispatch), and even
that posture requires recognising staleness, which a raw site cannot.

## Actual behaviour / root cause

The producer's emitters were written against the bare `ExtensionAPI`
surface before the chain hardened around them (0018 built it for the
watcher path; 0073/0401-era work routed lifecycle and informational
emitters through it), and the recent fix ladder adjusted these sites'
payloads without touching delivery. The producer even holds a suitable
channel (`#input.systemNoteChannel`, used by the clean-cancel note) but
the six sites bypass it. Note `#input.systemNoteChannel`'s fallback
`emitDiagnostic` currently re-enters `pi.sendMessage` (candidate
note-details-matrix/04), so fixing this card by routing through that
channel as-wired would trade one defect for the other — the two fixes
compose.

## Why it matters

- These six notes are the channel's user-facing core: bind echo, SLSH-1,
  SLSH-3/4/5, panic framing, BNDR-9, binder failures. A host that starts
  refusing `sendMessage` (print-mode edge, session teardown races,
  host-side serialisation failure of `details`) turns every one of them
  into a handler abort with a fabricated internal-error story and no
  operator breadcrumb — the exact failure mode the chain was specified to
  contain.
- The panic path loses the spec-mandated final-resort stack breadcrumb
  ("the original panic message MUST be included in the final-resort
  `console.error` log"), which is unreachable from a raw site.

## Non-goals

- The stale-ctx posture (pinned; a raw throw happens to propagate like the
  stale rethrow, but without the mark-dead latch — fixing via
  `sendSystemNote` preserves the pinned stale behaviour).
- The notes' payloads/content (owned by the fixed 0383/0397–0401 ladder
  and candidates 01–03).
- The `#emitCleanCancelNote` path (already chain-routed) and the
  channel-wiring re-entry ([bug 0435](./0435-fallback-diagnostic-step-reinvokes-sendmessage.md)).

## Fix

> **§Fix amendment (0.429.0, doc-was-wrong-in-part — the 0362 pattern).**
> The settled §Fix below assumed "the channel machinery already exists"
> for all ten sites. That premise was false for the three INFORMATIONAL
> notes (binder-echo BND-1, no-params-overflow SLSH-1,
> untyped-boundary-discard): landed bug 0401 pinned a details-ABSENT wire
> as NORMATIVE for them, but `sendSystemNote`'s `SystemNote.details` was a
> REQUIRED field with no absent arm, so routing them unchanged would
> fabricate a `details` key and break the 0401 wire contract. Parent
> adjudication (resolution option 2): extend scope to
> `system-note-channel.ts` and make `SystemNote.details` (and the
> `SystemNoteSender` wire field) OPTIONAL, conditionally spreading the key
> so it is absent on the wire when undefined — the chain type widens to
> match the wire contract. All ten sites then route through the chain: the
> seven details-bearing ones byte-identical, the three informational ones
> details-absent. See the `## Fix (0.429.0)` record below.


Route the raw senders (the six emitters, the boundary-discard emitter,
and the three gate wirings) through `sendSystemNote` over the producer's
extension-instance channel (present at `#input.systemNoteChannel`;
fallback-`emitDiagnostic` fixed per candidate 04), preserving each site's
`display`/`content`/`details` bytes and `triggerTurn: false`. The group-A
sites additionally need the `Clock.wallNow()` guard the chain's preamble
assigns them (wrap the stamp + send, per `:130`). Alternative — a local
try/catch per site replicating the chain — rejected: it forks the chain's
latch/stale semantics six times. Witness both directions: producer with a
non-stale-throwing `pi.sendMessage` → each emitter returns normally, the
toast fires for `display: true` notes, the delivery-failed diagnostic
reaches the off-channel sink, and a run-level drive completes without the
handler aborting (red today: P3's `.toThrow` on both public emitters).
Sequencing: [bug 0435](./0435-fallback-diagnostic-step-reinvokes-sendmessage.md) lands first (see §Related).

## Fix (0.429.0)

- What shipped:
  - `system-note-channel.ts` — `SystemNote.details` and
    `SystemNoteSender.sendMessage`'s wire field made OPTIONAL; the one
    wire-write conditionally spreads `details` (absent when `undefined` →
    `"details" in <wire>` false); `normaliseDetailsFileSpelling` guarded for
    `undefined`. The closed four-arm `SystemNoteDetails` union is unchanged
    (absence is omission, not a new arm).
  - `production-theta-producer.ts` — all ten note sites routed through
    `sendSystemNote` over the extension-instance channel (`#systemNoteChannel()`
    / `LivePromptQueryModel#resolveSystemNoteChannel()`, the `#emitCleanCancelNote`
    resolution shape): seven details-bearing (custom-type-unsafe,
    binder-failure ×2, top-level-err, panic, three ActiveSetGate wirings)
    byte-preserving; three informational (binder-echo, no-params-overflow,
    untyped-boundary-discard) details-absent. Group-A sites wrap the
    `Clock.wallNow()`/id stamp in `#buildGroupAEventOrFallback`, reusing
    `sendSystemNote`'s containment (stale-ctx rethrown; no double send).
  - `production-composition.ts` — `buildSystemNoteDeps` (the second
    host-serialization adapter to the real wire) given the identical
    conditional-`details` spread, so informational notes reach the real host
    wire with `details` absent.
- Gates: witness `tests/b0437-producer-note-raw-send-fallback.test.ts` 5/5
  green (red-before verifier-confirmed by revert: raw-send host-throw
  propagation + informational bypass + group-A stamp escape); full default
  suite `npx vitest run` 592 files / 10565 tests green; `npm run typecheck`
  clean; `npm run lint` clean.
- Review: 2 rounds — round 1 (deep): correctness/fidelity/spec CLEAN, one
  test finding (group-A guard unwitnessed) + one prose finding (imprecise
  doc-comments), both fixed; round 2 (fast): CLEAN.
- Verification: SOLID — witness bites both reverts (raw-send → host-throw
  RED; group-A guard → clock RED; restored byte-exact, green); full suite
  green; lint+typecheck clean; protected invariants (b0401 details-absent,
  b0397/b0398/b0399 details-bearing byte contracts, b0435 chain) green. Live:
  `tests/live/err-note-render-record-error-field-live-cell.test.ts` (SLSH-3
  note delivery at the real slash-dispatch boundary through a real spawned
  subagent child — the rerouted `emitTopLevelErrNote` path) green under the
  global lock.
- Residuals:
  1. `factory.ts` carries two same-class raw informational sends (drain-state
     refusal; repeat-`session_start`) OUTSIDE 0437's adjudicated ten-site
     producer scope — a follow-up bug, not fixed here.
  2. `emitPanicNote`'s `details.diagnostics[].file` is now POSIX-normalised
     through the `sendSystemNote`/0268 funnel where the prior raw send bypassed
     it — a spec-conformance GAIN (diagnostic-shape.md pins POSIX separators on
     every host), an intended delta, not a break.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the stale-ctx rethrow posture, the notes'
  payloads/content (0383/0397–0401 ladder), the already-chain-routed
  clean-cancel note, and the 0435 channel-wiring re-entry remain out of scope.
- Bounded self-authorization (recorded): the adjudication named a three-file
  scope; the mandated `SystemNoteSender` widening is compiler-forced onto
  `production-composition.ts` (the second host-serialization adapter — required
  to honour the adjudication's own "`details` false on the wire" deliverable)
  and 13 test-double recording types (type-only `details?:` + read narrowing,
  zero assertion-meaning change). Every added edit is tsc-forced with a single
  correct realization and byte-neutral for pre-existing details-bearing
  traffic. Evidence: the adjudication's "on the wire" deliverable;
  `buildSystemNoteDeps`'s unconditional re-serialization (tsc TS2379); b0401's
  `producerWithCapture` never exercising `buildSystemNoteDeps`.

## Provenance

Seed-3/4 sweep over `rg "pi.sendMessage" src/extension/production-theta-
producer.ts` (19 hits triaged: 6 raw note emitters / 7 calls, 1 raw
boundary-discard emitter, 3 raw gate wirings — all counted above — 1
chain-routed clean-cancel, rest non-note). Spec read:
`runtime-event-channel.md:130–135`, `diagnostic-shape.md:20`,
`slash-invocation.md` SLSH-1/3. Implementation read: the six sites,
`theta-composition-producer.ts:520–660`, `system-note-channel.ts:256–411`,
`session-shutdown.ts:466–497`. Probe P3 run at `04579e12` (scratch
deleted). Dup check: README index; 0018/0030/0383/0397/0398/0399/0400/0401
read in full — every one treats payload or content, none the delivery
mechanics of these sites.
