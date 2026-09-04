# Bug 0451 — The factory's two lifecycle notes bypass the channel's mandated fallback chain: a non-stale host throw on the drain-state refusal note propagates out of the slash handler (violating "the fallback never aborts the slash-command handler") and a throw on the repeat-`session_start` note is swallowed with zero fallback artefacts — no toast, no delivery-failed diagnostic, no terminal stderr line for either

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3: loud-but-wrong on the drain site (the
  refusal note is the ONLY user feedback for a slash dispatch during
  drain/supersession, and on a host throw the user gets neither the note
  nor a completed handler — the raw error rejects Pi's command dispatch),
  and silent loss of the repeat-start anomaly warning with no operator
  breadcrumb on the other. D2: the 0437 recipe applies (route through
  `sendSystemNote`), but the factory holds no channel deps — the
  extension-instance channel (or an equivalent) must be threaded through
  `ThetaExtensionDeps`/the compose wiring into two factory-scope sites, a
  seam addition rather than a call swap.
- **Kind:** defect — the spec pins the fallback chain for every note shape
  on the channel (`runtime-event-channel.md:132` is shape-agnostic; both
  notes are enumerated members of the channel's informational class at
  `:43`), and both emitters bypass it.
- **Related:**
  - 0437 (fixed 0.429.0) — §Fix (0.429.0) Residual 1 names this exact pair
    verbatim: "`factory.ts` carries two same-class raw informational sends
    (drain-state refusal; repeat-`session_start`) OUTSIDE 0437's
    adjudicated ten-site producer scope — a follow-up bug, not fixed
    here." This is that follow-up. Same spec paragraph, same defect class,
    disjoint sites.
  - 0401 (fixed 0.390.0) — gave both notes their details-ABSENT wire shape
    (the sites' comments cite it); the delivery mechanics were untouched,
    same as at 0437's producer sites.
  - 0435 (fixed 0.419.0) — fixed the chain these sites should ride
    (off-channel fallback `emitDiagnostic`), removing 0437's ordering
    obstacle: routing these two sites through the compose-instance channel
    no longer trades one violation for another.
  - 0018 (fixed 0.28.0) — built `sendSystemNote`'s chain + stale-ctx
    posture; a raw factory site can neither latch stale-dead nor
    distinguish stale from non-stale.
- **Affected** (verified at `401a425b`, v0.437.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:132`
    — "The `pi.sendMessage` call for `theta-system-note` is treated as
    best-effort … for every other note shape (which constructs no
    `RuntimeEvent`) it is the `pi.sendMessage` call only. If any of those
    steps throws, the runtime falls back in this order: …"; `:137` — "On a
    live runtime the fallback never aborts the slash-command handler…".
    `:43` — both notes are channel members: "the two factory lifecycle
    notes (the drain-state dispatch-refusal note and the repeat-start
    supersession note)". (Bug 0437's fix record cites the same mandate
    sentence at `:130`; at this pin it sits at `:132` — renumbered, not
    changed.)
  - `src/extension/factory.ts:694–704` — `drainGatedHandler`'s note arm:
    raw `pi.sendMessage({ customType: SYSTEM_NOTE_CHANNEL, content,
    display: true }, { triggerTurn: false })` with no try/catch, inside the
    async handler body `runGuardedSlashHandler(...)` returns to Pi's
    command dispatch.
  - `src/extension/session-swap-tripwire.ts:163–169` —
    `runGuardedSlashHandler` runs the guard then `return dispatch()`; a
    throw from the dispatch closure propagates to the caller (Pi).
  - `src/extension/factory.ts:758–772` — the repeat-start note: raw
    `pi.sendMessage` wrapped in `try { … } catch (e) { void e; }` — the
    throw is swallowed with no fallback step of any kind.
  - Conformant contrast: every producer note site
    (`production-theta-producer.ts`, ten sites post-0437) and the
    clean-cancel/watcher/load emitters route through `sendSystemNote`.
- **Observed at:** v0.437.0 (`401a425b`), offline, deterministic. Probe
  P1a/P1b (scratch `tests/scratch-note-channel-6.test.ts`, deleted) over
  the real factory (`createThetaExtension`) with the
  `tests/drain-gated-dispatch-integration.test.ts` harness plus a
  `pi.sendMessage` that throws on `theta-system-note`.

## Summary

Bug 0437 routed all ten of the producer's raw note sends through
`sendSystemNote`, restoring the `:132` fallback chain for the channel's
invocation-time traffic — and its fix record explicitly carved out the two
remaining same-class sites in `factory.ts` as a follow-up. At the pin both
still send raw:

- **Drain-state refusal note** (`factory.ts:696`): emitted inside the
  registered slash handler when `resolveSlashDispatchWithReadFailover`
  returns the shutting-down / superseded note. A non-stale `pi.sendMessage`
  throw propagates through `runGuardedSlashHandler` out of the async
  handler — the handler's promise rejects into Pi's command dispatch,
  violating `:137` verbatim, and no chain step runs (no toast despite
  `display: true`, no `theta/runtime/system-note-delivery-failed`, no
  `system-note delivery failed:` stderr line).
- **Repeat-start supersession note** (`factory.ts:761`): the try/catch
  swallows the throw (`void e`). The registration pass survives (the
  containment half of the intent), but the mandated chain is replaced by
  nothing: the anomaly warning ("repeat session_start without
  session_shutdown; superseding prior hot-reload generation") is lost with
  zero fallback artefacts.

Neither site can honour the stale posture either: a raw site has no
`SystemNoteChannelHealth`, so a stale-ctx throw at the drain site
propagates without the mark-dead latch (accidentally shaped like the
pinned unwind, but unlatched — the next dispatch re-touches the dead host),
and at the repeat-start site a stale throw is swallowed rather than
rethrown for quiesce.

## Reproduction

Offline (probe P1, deleted; harness copied from
`tests/drain-gated-dispatch-integration.test.ts` — fake `pi` capturing
`registerCommand` handlers, `ctx.ui.notify` recording, an `emitDiagnostic`
recorder threaded via `ThetaExtensionDeps.emitDiagnostic`, and a
`sendMessage` that throws `Error("scratch: host refused sendMessage
(non-stale)")` for `customType === "theta-system-note"`):

1. Boot `createThetaExtension` with a stub `composeInstance` returning a
   `ThetaRegistry` holding `/foo`; fire `session_start`; then
   `registry.drain()`; enable the throw; invoke the registered `/foo`
   handler.
   Observed: the handler promise REJECTS with
   `scratch: host refused sendMessage (non-stale)`; `ui.notify` calls:
   `[]`; delivery-failed diagnostics: `[]`; `console.error` lines
   containing `system-note delivery failed`: `[]`.
2. Boot the same harness; enable the throw; fire `session_start` a second
   time (repeat-start predicate fires, `factory.ts:758`).
   Observed: no rejection (swallowed), delivered notes `[]`, `ui.notify`
   `[]`, diagnostics `[]`, terminal lines `[]` — the note vanishes with
   zero artefacts.

Under `sendSystemNote` the same inputs return normally after walking the
chain (toast for `display: true`, delivery-failed diagnostic, latched
terminal line — the 0018/0437 suites pin the non-stale arm).

## Expected behaviour

`runtime-event-channel.md:132–137`: any synchronous `pi.sendMessage` throw
on this channel walks the chain — `ctx.ui.notify` when `display: true`,
then the `theta/runtime/system-note-delivery-failed` diagnostic, then the
latched terminal `console.error` — and "never aborts the slash-command
handler". The stale-ctx error is the one exception (mark-dead + rethrow),
which requires recognising staleness — impossible at a raw site.

## Actual behaviour / root cause

Both sites predate the chain's factory-reachable wiring and were left
outside 0437's adjudicated ten-site producer scope (the adjudication named
a three-file scope; `factory.ts` was not in it). The drain site sends raw
inside the handler; the repeat-start site substitutes a local swallow for
the chain. The factory holds no `SystemNoteChannelDeps` — the compose pass
builds the extension-instance channel (`production-composition.ts:677`)
after the factory body, and no seam threads it back to these two
factory-scope emitters.

## Why it matters

- The drain refusal note fires exactly when the system is in its most
  delicate window (shutdown, supersession, post-swap dispatch) — the same
  window in which host `sendMessage` failures are most plausible. There it
  converts a spec-shaped refusal into an unexplained command-level error
  with no breadcrumb.
- The repeat-start note exists to flag an anomalous host lifecycle
  (bug 0021); silently losing it on a host that is ALSO refusing
  `sendMessage` discards the two correlated signals of the same unhealthy
  host at once.
- 0437's fix record promises this follow-up; without a filed card the
  carve-out silently becomes permanent.

## Non-goals

- The notes' content templates and details-ABSENT wire shape (0401,
  pinned; both sites conform).
- The producer's ten chain-routed sites and the channel wirings (0437 /
  0435, fixed).
- The PIC-31 read-failover routing itself (`drain-state.ts` — arm
  selection is conformant; only delivery is at issue).
- The `session_shutdown`-time emitters (already chain-routed via
  `session-shutdown.ts`).

## Fix

Options:

1. Thread the extension-instance channel into the factory:
   `ExtensionInstanceWiring` (or `ThetaExtensionDeps`) gains the
   `SystemNoteChannelDeps` the compose pass already builds
   (`production-composition.ts:677`), and both sites call
   `sendSystemNote({ content, display: true }, channel)` (details-absent,
   preserving the 0401 wire contract). The drain site then also inherits
   the stale-dead latch + rethrow posture; the repeat-start site keeps its
   pass-survival property because the chain returns normally on non-stale
   failures and only rethrows stale (matching the drain-tail quiesce
   design). Recommended — it is the 0437 recipe.
2. A factory-local `SystemNoteChannelDeps` built over `pi` + the
   bootstrap sink's `emitDiagnostic` (the tier pattern,
   `production-composition.ts:4000–4041`) for these two sites only.
   Smaller thread, but forks a second channel instance with its own
   health latch on the same extension instance.

Witness both directions: fake host throwing non-stale on
`theta-system-note` → (a) the drain-note dispatch resolves (handler does
not abort) and the delivery-failed diagnostic reaches the off-channel
sink; (b) the repeat `session_start` leaves one delivery-failed artefact
rather than none. Red today: P1a's rejection and P1b's zero-artefact
observation above.

## Provenance

Seed 1 of the wave-6 brief (0437 §Fix Residual 1, verbatim designation).
Spec read: `runtime-event-channel.md:43,132–137`. Implementation read:
`factory.ts:620–800`, `session-swap-tripwire.ts:100–169`,
`drain-state.ts`, `production-composition.ts:640–690`. Probe P1 run at
`401a425b` (scratch deleted; outputs quoted). Dup check: README index;
0437/0435/0401/0018 read in full — 0437's residual names this pair as
unfiled follow-up work; no other report touches these sites' delivery.
