# Bug 0073 — The per-invocation clean-cancel note `theta/runtime/cancelled-by-session-shutdown` is constructed by a function with no production caller: a `session_shutdown` that cancels an in-flight theta emits nothing on the per-invocation channel, and the operator's only signal is the generic SLSH-4 `theta /<name> cancelled` note

- **Status:** fixed (0.130.0).
- **Kind:** defect — a diagnostic the spec makes mandatory on a reachable path
  is never emitted. `cancelledBySessionShutdownDiagnostic`
  (`src/extension/session-shutdown.ts:242`) builds the pinned row (code,
  message, `details.event: { reason, theta, invocation_id }`) exactly as
  specified, and nothing in `src/` calls it. The per-invocation `finally` the
  spec names as the emission site (`finishInvocation`,
  `src/extension/production-theta-producer.ts:1538` / `:1768`, run from
  `src/extension/theta-composition-producer.ts:441`) detaches listeners,
  settles `disposeBarrier` and removes the registry entry, and emits no
  diagnostic. `entry.shutdownReason` — the field the spec creates solely to
  carry the handler-captured reason into that `finally`
  (`src/runtime/active-invocation-registry.ts:33`) — is written by sub-step 2
  (`src/extension/session-shutdown.ts:452`) and read by no production code.
- **Related:**
  - 0023 (fixed, 0.34.0) — same shape one layer up: bootstrap diagnostics
    constructed and dropped because the production composition omitted their
    seams. Different surface (bootstrap vs. per-invocation teardown) and
    different mechanism (omitted seam wiring vs. an uncalled constructor);
    0023's fix did not touch the teardown path.
  - 0013 (fixed, 0.24.0) — load-phase warnings dropped by both production
    sinks. Same class (a specified diagnostic that never reaches an operator),
    different phase.
  - 0021 / 0034 (fixed) — `session_start` / supersession lifecycle. Adjacent
    file, unrelated mechanism; neither touches sub-step 2's per-invocation
    visibility counterpart.
- **Affected:**
  - `src/extension/session-shutdown.ts:49` (`CANCELLED_BY_SESSION_SHUTDOWN_CODE`),
    `:242–262` (`cancelledBySessionShutdownDiagnostic` — the conforming builder,
    zero callers in `src/`), `:334` (the `NestedShapeEmission.code` union that
    admits the code), `:357–405` (`emitNestedShapeDiagnostic`, whose `entry`
    member exists only for this row's three-token construction-site fallback —
    also zero callers in `src/`), `:448–458` (sub-step 2: stamps
    `shutdownReason`, aborts, emits nothing), `:465` (sub-step 3's bounded
    await, whose sibling `reload-teardown-timeout` IS emitted at
    `:626–629` — the contrast).
  - `src/extension/production-theta-producer.ts:1521–1546` (prompt bind: entry
    construction + `finishInvocation`), `:1758–1775` (subagent bind),
    `:2260–2275` (invoke spawn site) — none reads `entry.shutdownReason` or
    emits a note.
  - `src/extension/theta-composition-producer.ts:433–441` (the per-invocation
    `finally` that calls `binding.teardown?.()` then
    `binding.finishInvocation?.()`).
  - `src/runtime/active-invocation-registry.ts:33` (`shutdownReason`, the
    spec-pinned channel with no reader).
- **Observed at:** `0.52.0` (`d06daae3`). Offline; scratch vitest over the real
  producer bind driven through the real `composeThetaFixture.run` DRIVE seam
  and the real `runSessionShutdown` handler (the harness pattern of
  `tests/active-invocation-wiring.test.ts`). No provider, no filesystem, no
  watcher.

## Summary

`session-shutdown-semantics.md`'s **Per-invocation operator visibility
(clean-cancel path)** rule requires that, for each `ActiveInvocationRegistry`
entry whose `disposeBarrier` settles inside the `SHUTDOWN_AWAIT_CAP_MS` window,
"the cancellation path inside that invocation's own `finally` block emits
exactly one `theta/runtime/cancelled-by-session-shutdown` (E, runtime) note on
`theta-system-note` with `display: false`". The row is registered
(`docs/spec_topics/diagnostics/code-registry-runtime.md:38`), its `details.event`
shape is pinned field-by-field
(`docs/spec_topics/diagnostics/diagnostic-shape.md:52`), and the whole
`shutdownReason` field on the registry entry exists to carry the handler-captured
`event.reason` string into that `finally`.

The implementation builds the row correctly and never emits it. Every consumer
of `cancelledBySessionShutdownDiagnostic` is a test
(`tests/session-shutdown.test.ts:377`, `:393–394`). The three per-invocation
`finally` bodies in the production producer do listener detach, barrier settle
and registry removal only. The stamped `entry.shutdownReason` is dead on the
read side.

Net operator-visible effect of `/reload`, `/new`, `/fork`, `resume` or quit
against an in-flight theta: the invocation is aborted (sub-step 2 works), the
theta unwinds to the CANCEL terminal outcome, and the *only* note the operator
sees is the generic SLSH-4 `SNK-f` row `theta /<name> cancelled` — the same
bytes an Esc produces. The shutdown reason, the invocation id, and the fact that
a session swap (not the user) cancelled the run are all absent from the wire.
The mutual-exclusion contract the spec builds between this row and
`theta/runtime/reload-teardown-timeout` degenerates: the timeout row fires
(implemented, `session-shutdown.ts:597`), its clean-cancel counterpart never
does, so an operator sees output for the failure case and silence for the
success case.

## Reproduction

Offline, scratch vitest at `d06daae3` (run and deleted). Real
`createProductionProducerDeps` producer, real `composeThetaFixture` DRIVE seam,
real `runSessionShutdown`; the body is parked on a deferred so the invocation is
genuinely in flight when the shutdown fires, and released from a queued task so
its `disposeBarrier` settles inside sub-step 3's bounded await (the clean-cancel
path the rule scopes to).

```ts
const registry = new ActiveInvocationRegistry();
const deps = createProductionProducerDeps({ pi: recordingPi(log), root, modelRegistry, activeInvocations: registry });
executorHook.impl = async () => { await parked; return { outcome: "cancel", result: null }; };

const run = composeThetaFixture(promptTheta(), deps).run("", driveCtx());
await tick();                       // registry.size() === 1, entry in flight

setTimeout(() => releaseBody(), 0); // barrier settles inside the window
await runSessionShutdown({ reason: "reload" }, shutdownDeps(registry, new FakeClock(), log));
await run;
```

Observed:

```
entry.shutdownReason           "reload"            (sub-step 2 stamped it)
entry.thetaAbort.signal.aborted true               (sub-step 2 aborted it)
registry.size()                0                   (the finally removed it)

pi.sendMessage calls (1):
  { customType: "theta-system-note",
    content:  "theta /demo cancelled",
    display:  true,
    details:  { event: {} } }

teardown console.error sink:  []                   (no rows)
```

Grepping the combined sink transcript for `cancelled-by-session-shutdown`
yields nothing. The single delivered note is the SLSH-4 `SNK-f` top-level row,
`display: true` — not the specified `display: false` per-invocation note, which
carries `details.event.reason === "reload"`,
`details.event.theta === "demo"` and
`details.event.invocation_id === "11111111-2222-3333-4444-555555555555"`.

Static half, same HEAD:

```
$ rg -n "cancelledBySessionShutdownDiagnostic" src/
src/extension/session-shutdown.ts:242:export function cancelledBySessionShutdownDiagnostic(
$ rg -n "CANCELLED_BY_SESSION_SHUTDOWN_CODE" src/
src/extension/session-shutdown.ts:49
src/extension/session-shutdown.ts:252
src/extension/session-shutdown.ts:334
```

The only reader of `entry.shutdownReason` in `src/` is the builder at `:249`.

## Expected behaviour (what the spec says)

- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:19`,
  **Per-invocation operator visibility (clean-cancel path)**: "For each
  `ActiveInvocationRegistry` entry whose `disposeBarrier` settles (whether
  inside the `SHUTDOWN_AWAIT_CAP_MS` window of sub-step 3 … OR … after the
  deadline via a downstream cancellation…) — the cancellation path inside that
  invocation's own `finally` block emits exactly one
  `theta/runtime/cancelled-by-session-shutdown` (E, runtime) note on
  `theta-system-note` with `display: false`, `details.event.reason` carrying
  the handler-captured `event.reason` string". Same line: "The per-invocation
  `finally` reads this string from the entry's `shutdownReason` field (stamped
  by sub-step 2 … immediately before that entry's `thetaAbort.abort()` call) …
  `entry.shutdownReason` is the spec-pinned channel by which all four
  captured-value cases reach this emission site."
- Same line, mutual exclusion: "An invocation either emits
  `cancelled-by-session-shutdown` (cleanly cancelled within the window) or
  contributes to the single `theta/runtime/reload-teardown-timeout` `<list>` of
  sub-step 3 (still in flight at the deadline), never both — the per-invocation
  note is the operator-visibility counterpart to the timeout diagnostic."
- `docs/spec_topics/diagnostics/code-registry-runtime.md:38` registers the row
  and pins the emission site: "Emitted from the invocation's own `finally`
  block (not from the teardown handler), **exactly once per cleanly-cancelled
  invocation**", with message `theta /<name> cancelled by session shutdown
  (<reason>)`.
- `docs/spec_topics/diagnostics/diagnostic-shape.md:52`, *Runtime-constructed
  sibling carve-out*: "The runtime MUST include `details.event.theta` on every
  emission of `theta/runtime/cancelled-by-session-shutdown`" and "MUST include
  `details.event.invocation_id` on every emission", both sourced from the
  registry entry.
- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md:5`:
  "The `shutdownReason` field is `undefined` at insertion and is populated only
  by sub-step 2 … so the per-invocation `finally`'s
  `theta/runtime/cancelled-by-session-shutdown` emission … has a
  handler-captured-string channel".
- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:19`
  also pins the delivery chain and its terminal wrap: the note "routes through
  the standard `sendSystemNote` fallback chain (`pi.sendMessage` →
  `ctx.ui.notify` → `theta/runtime/system-note-delivery-failed` →
  `console.error`)", and a throw from that terminal `console.error` "MUST be
  swallowed and MUST NOT propagate out of the per-invocation `finally`".

## Actual behaviour / root cause

`runSessionShutdown` implements sub-step 2 as stamp-then-abort
(`src/extension/session-shutdown.ts:448–458`) exactly as pinned, so
`entry.shutdownReason` is populated and observable. Sub-step 3's bounded await
and its `reload-teardown-timeout` emission are implemented (`:465`, `:597–600`)
and reachable. The emission the spec places on the *other* side of that
mutual-exclusion pair was never wired:

| Surface | Builder | Production emitter | Fires? |
|---|---|---|---|
| `theta/runtime/reload-teardown-timeout` | `reloadTeardownTimeoutDiagnostic` (`:272`) | `runBoundedDisposeAwait` → `emitTeardownDiagnostic` (`:626–629`) | yes |
| `theta/host/session-shutdown-teardown-step-failed` | `teardownStepFailedDiagnostic` (`:220`) | `runIsolatedCall` (`:539`) | yes |
| `theta/runtime/cancelled-by-session-shutdown` | `cancelledBySessionShutdownDiagnostic` (`:242`) | — | **no** |

The per-invocation `finally` bodies are `finishInvocation` closures built at
each of the three registry-insertion sites:

```ts
// src/extension/production-theta-producer.ts:1538–1545 (prompt bind)
const finishInvocation = (): void => {
  if (finished) return;
  finished = true;
  detachForwarding();
  settleDispose();
  activeInvocations?.remove(entry);
};
```

`:1768` (subagent bind) and `:2260`+ (invoke spawn site) are the same shape.
None reads `entry.shutdownReason`, so none can distinguish a
`session_shutdown`-driven cancellation from an ordinary Esc, and none reaches a
`sendSystemNote` call.

`emitNestedShapeDiagnostic` (`:357`) carries the whole PIC-25/26 fallback
machinery for this row (the two-token `${code} ${detailsEventReason}` form and
the three-token `${code} ${entry.theta} <unreadable>` form whose `entry` member
exists for no other code) and is likewise uncalled in `src/`. The
`NestedShapeEmission.code` union at `:334` names
`RUNTIME_DEGRADED_CODE | CANCELLED_BY_SESSION_SHUTDOWN_CODE`; neither reaches
production through this function.

No committed test pins the absence: `tests/session-shutdown.test.ts:373–400`
calls the builder directly and asserts its shape, which is conforming. The gap
is that nothing in `src/` calls the builder.

## Why it matters

- **The specified operator signal for a session swap cancelling live work does
  not exist.** On `/reload`, `/new`, `/fork`, `resume` or quit with a theta in
  flight, the operator sees `theta /<name> cancelled` — byte-identical to an
  Esc — with no reason, no invocation id, and no indication that a session
  swap, not the user, ended the run. With concurrent siblings of the same theta
  (subagent-mode fan-out, `par for`), the per-invocation
  `details.event.invocation_id` the spec adds precisely so siblings are
  distinguishable is absent from every row.
- **Structured teardown telemetry is one-sided.** `reload-teardown-timeout`
  fires on the failure path; its clean-cancel counterpart never does. Operator
  tooling that keys on the documented mutual-exclusion pair sees only the
  pathological half, so a healthy teardown of ten in-flight invocations is
  indistinguishable from a teardown that cancelled none.
- **A spec-pinned data channel is dead.** `entry.shutdownReason` — the field the
  registry contract carries specifically so the reason survives into the
  per-invocation `finally` without a global or an `AbortSignal.reason` read — is
  written and never read. The four captured-value cases the Unknown-reason rule
  builds (closed-set member, `String(event.reason)`, throwing-access
  `"<unreadable>"`, snapshot-failure `"<unreadable>"`) are all unobservable, so
  the three-way `"<unreadable>"` disambiguation that
  `code-registry-runtime.md:38` documents for operators has no subject.
- Bounded: the cancellation itself is correct — sub-step 2 aborts, the theta
  unwinds through its checkpoints, `disposeBarrier` settles, the registry
  drains, and the SLSH-4 note reaches the user session. The defect is purely on
  the operator-visibility channel.

## Non-goals

- Sub-step 2's stamp-then-abort ordering, the per-entry isolation, and the
  synthesised CNCL-4 reason (`session-shutdown.ts:441–458`) — conforming;
  witnessed by the probe (`shutdownReason === "reload"`, signal aborted).
- `reload-teardown-timeout` and `session-shutdown-teardown-step-failed` — both
  emitted, both conforming; contrast only.
- The SLSH-4 `SNK-f` `theta /<name> cancelled` note — correct and required
  independently (`slash-invocation.md:44`); it is not a substitute for the
  per-invocation row and this report does not propose changing it.
- The `theta/host/session-swap-instance-survived` tripwire row
  (`armSessionSwapTripwireForReason`, `:521`) — separate rule, separate
  emission site, out of scope.
- The *Accepted theta 1.0 residual gap — sub-step-2 stamp-throw case* arm of
  the same rule: it is a sub-case of an emission that does not happen at all;
  once the emission exists, that arm needs its own fixture.

## Fix

Not yet decided in detail; the constraints any fix must satisfy are pinned:

1. The emission site is the **invocation's own `finally`**, not the teardown
   handler — `session-shutdown-semantics.md:19` says so explicitly, and the
   "`sendSystemNote` MUST NOT be invoked from the teardown handler" edge case
   (`active-invocation-registry.md`, *Edge cases*) forbids the alternative. In
   practice that is the three `finishInvocation` closures
   (`production-theta-producer.ts:1538`, `:1768`, `:2260`+), or the single
   `binding.finishInvocation?.()` call site in
   `theta-composition-producer.ts:441` if the note is lifted to the composition
   layer — the latter reaches only the top-level slash dispatch, so it would
   miss `invoke`-spawned and tool-adapter entries the registry also holds.
2. The trigger predicate is `entry.shutdownReason !== undefined` (equivalently:
   this invocation was aborted by sub-step 2), not `signal.aborted` — an Esc
   also aborts and must NOT draw the row.
3. Exactly once per cleanly-cancelled invocation: `finishInvocation` is already
   idempotent via its `finished` flag, so the emission belongs inside that
   guard.
4. Delivery is the standard `sendSystemNote` fallback chain with
   `display: false`, and the PIC-67 clause (c) stale-runtime rethrow applies
   unchanged.
5. `details.event` must be constructed as a fresh `{ reason, theta,
   invocation_id }` object with static property names (no spread) per
   `diagnostic-shape.md:52`'s *Runtime construction obligation*;
   `cancelledBySessionShutdownDiagnostic:249–261` already does exactly this and
   should be the single construction site.
6. `emitNestedShapeDiagnostic` (`:357`) is the PIC-25/26-conforming emitter for
   this row and should be the delivery wrap rather than a second, parallel one.

## Provenance

- Spec measured against:
  `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:10`
  (sub-step 2 stamp-then-abort), `:11` (sub-step 3 bounded await), `:19`
  (**Per-invocation operator visibility (clean-cancel path)** — the MUST, the
  `shutdownReason` channel, the mutual-exclusion pairing, the delivery chain);
  `docs/spec_topics/pi-integration-contract/active-invocation-registry.md:5`
  (entry shape, `shutdownReason` purpose, three insertion sites) and its *Edge
  cases* (`sendSystemNote` forbidden from the teardown handler);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:38` (row registration,
  message template, emission-site pin, mutual-exclusion clause), `:39`
  (`reload-teardown-timeout`, the implemented counterpart);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:42`, `:52` (`details.event`
  nesting, per-code value spaces, runtime-constructed sibling carve-out,
  runtime construction obligation);
  `docs/spec_topics/pi-integration-contract/unknown-reason-rule.md:4` (the four
  captured-value cases the `shutdownReason` channel carries);
  `docs/spec_topics/cancellation.md` §Forwarding (the `session_shutdown`
  trigger and its synthesised reason);
  `docs/spec_topics/slash-invocation.md:44` (SNK-f, the note that IS emitted).
- Implementation read at `d06daae3`:
  `src/extension/session-shutdown.ts:49`, `:220`, `:242–262`, `:272–292`,
  `:334`, `:357–405`, `:435–458`, `:465`, `:521`, `:539`, `:626–629`;
  `src/extension/production-theta-producer.ts:1521–1546`, `:1758–1775`,
  `:2260–2275`; `src/extension/theta-composition-producer.ts:433–441`;
  `src/runtime/active-invocation-registry.ts:27–37`;
  `src/extension/factory.ts:936–1073` (the handler wiring).
- Tests inspected: `tests/session-shutdown.test.ts:370–400` (builder-shape
  assertions only — the only consumers of the builder),
  `tests/active-invocation-wiring.test.ts` (registry span / cancel-in-flight /
  bounded-await — asserts no per-invocation note),
  `tests/e2e-s6-session-shutdown-real-teardown.test.ts` (factory-level teardown
  over the real registry — likewise silent on the note),
  `tests/session-shutdown-wiring.test.ts`. No committed cell asserts the note's
  presence or its absence.
- Mechanical repro: scratch vitest
  (`tests/scratch-cancel-lifecycle.test.ts`, run at `d06daae3` and deleted)
  driving the real producer bind through the real DRIVE seam and the real
  `runSessionShutdown`; observed sink transcript quoted verbatim in
  §Reproduction.

## Fix (0.130.0)

- What shipped:
  - `src/extension/session-shutdown.ts` — the emission the row never had:
    `emitCancelledBySessionShutdownNote(entry, { channel, sink })` builds the row
    through the pre-existing `cancelledBySessionShutdownDiagnostic` (§Fix
    constraint 5 — still the single `details.event` construction site, static
    property names, no spread), emits the structured console row through the
    pre-existing `emitNestedShapeDiagnostic` (§Fix constraint 6 —
    diagnostic-emission-isolation.md site class (b), no second parallel wrap),
    then delivers the `display: false` `theta-system-note` through
    `sendSystemNote` (§Fix constraint 4; the PIC-67 clause (c) rethrow is left
    untouched and uncaught). The `entry.shutdownReason ?? "<unreadable>"`
    substitution is hoisted into `cancelledBySessionShutdownReason` (PIC-25
    *Hoist obligation* single source of truth), and
    `emitNestedShapeDiagnostic`'s construction-throw arm is extracted into the
    shared `emitConstructionSiteFallback` so the two- and three-token PIC-26
    forms have ONE implementation. `createProductionEmissionSink` is the
    injected `console.error` / `JSON.stringify` sink.
  - `src/extension/production-theta-producer.ts` — `#emitCleanCancelNote`, called
    from BOTH per-invocation `finally` bodies (`#openInvocationTicket`'s `finish`
    closure, which after bug 0074 is the single slash/bind entry, and
    `#spawnSubagentFnSession`'s `dispose`), INSIDE the existing `finished`
    once-only guard (§Fix constraint 3) and after `settleDispose()` +
    `activeInvocations?.remove(entry)` so a PIC-67 rethrow can strand neither an
    unsettled barrier nor a live entry. The predicate is
    `entry.shutdownReason !== undefined`, never `signal.aborted` (§Fix
    constraint 2). Two new optional input members: `systemNoteChannel` (the
    extension-instance channel, so the note degrades and latches like every
    other system note) and `cleanCancelSink` (the class-(b) sink test seam).
    `ActiveInvocationEntry` keeps its five fields; `ActiveInvocationTicket` is
    unwidened.
  - `src/extension/production-composition.ts` — one property:
    `systemNoteChannel: systemNote` on the existing
    `createProductionProducerDeps({…})` call, passing the SAME
    `buildSystemNoteDeps` instance the rest of the pass uses.
  - `tests/cancelled-by-session-shutdown-note.test.ts` (new) — the five offline
    witness cells.
  - `tests/live/live-production-acceptance.test.ts` — ONE additive H8a cell
    (token `CELL-A2`); no existing cell touched.
- Gates:
  - Witness: `npx vitest run tests/cancelled-by-session-shutdown-note.test.ts` —
    `Test Files 1 passed (1) / Tests 5 passed (5)`. RED before the fix with the
    bug's own symptom on cells (a), (c), (d) and (e) ("session_shutdown
    cancelled an in-flight theta but no
    theta/runtime/cancelled-by-session-shutdown note reached the wire; the only
    rows are: {customType:theta-system-note content:"theta /demo cancelled"
    display:true} …: expected +0 to be 1").
  - Full suite: `npm test` — `Test Files 327 passed (327) / Tests 5957 passed
    (5957)` (the 326/5952 fork baseline plus the new file's five cells). A
    prototype of this design was measured against the full suite BEFORE the
    witness was written and flipped no existing cell.
  - `npm run typecheck` — clean, no output. `npm run lint` — clean, no output.
  - Live: `tests/live/acceptance/` — `Test Files 2 passed (2) / Tests 11 passed
    (11)` (the 11/11 fork baseline), every `assertStderrClean` empty-capture gate
    green. `tests/live/live-production-acceptance.test.ts -t "CELL-A2"` —
    `1 passed | 61 skipped`, the run printing the real structured row
    `{"severity":"error","code":"theta/runtime/cancelled-by-session-shutdown",
    "message":"theta /b73livecancel cancelled by session shutdown (reload)",
    "details":{"event":{"reason":"reload","theta":"b73livecancel",
    "invocation_id":"63487e23-fd1b-4563-a8d7-d12e158099fd"}}}`.
- Review: 2 rounds.
  - Round 1 (`bug-fix-reviewer`): two findings. F1 `spec` — the post-deadline
    dual-surface case (residual 1 below), disposed as an accepted residual
    because the only remedy needs a deadline signal the spec-pinned five-field
    entry cannot carry and any window check would contradict §Fix constraint 2;
    code unchanged. F2 `fidelity` — the producer built its own
    `SystemNoteChannelDeps` and so bypassed the instance `RendererGate`, which
    IS observable for a `display: false` note on a renderer-degraded instance;
    fixed. Plus two non-blocking residuals (3 and 4 below). Every other
    constraint walk came back clean, including a path-by-path once-only proof
    over bug 0074's `bound === false` short-circuit and child-regime arms.
  - Round 2 (`bug-fix-reviewer-fast`): CLEAN, no finding, no
    `recommend-deep-review`; one non-blocking test residual (4 below).
- Verification: SOLID.
  - Witness reds for the right reason: neutralised by deleting the single
    `this.#emitCleanCancelNote(entry)` call in `#openInvocationTicket`'s
    `finish`; 4/5 RED with the symptom messages (cell (b), the Esc negative
    control, correctly stayed green), restored byte-exact (`git hash-object`
    `8f2adc13b927b5bf7d911b7da88900bde93e3884` before and after, on both
    neutralisation passes), 5/5 GREEN.
  - Full default suite green (327 files / 5957 tests).
  - Live coverage of the fixed path: both H9a acceptance files green (11/11) and
    `CELL-A2` red-proven in both directions under the same neutralisation (RED:
    "no theta/runtime/cancelled-by-session-shutdown note for a session_shutdown
    raced against an in-flight prompt-mode drive (bug 0073) … Notes:
    ["theta /b73livecancel cancelled"]").
  - Lint and typecheck clean.
- Residuals:
  1. **Post-deadline dual surface.** Sub-step 2 stamps every in-flight entry, so
     an entry still in flight at the `SHUTDOWN_AWAIT_CAP_MS` deadline is named in
     the `theta/runtime/reload-teardown-timeout` `<list>` AND, when its own
     `finally` later runs, draws this row — the "never both" clause of
     session-shutdown-semantics.md §"Per-invocation operator visibility" and of
     the code-registry row's mutual-exclusion clause carve this out only for the
     stamp-throw residual gap, whose discriminator semantics this path therefore
     spoofs. Not fixable inside §Fix constraint 2 (the predicate is pinned) and
     not fixable without a deadline signal the spec-pinned five-field
     `ActiveInvocationEntry` cannot carry. No evidence it is reachable in the
     default suite or in an ordinary `pi -p` run (checked at verification).
     Recorded, not chased: a fix needs either a spec carve-out for the
     post-deadline-settle-of-a-stamped-entry case or a sanctioned deadline
     channel.
  2. **Two delivery channels.** `#emitCleanCancelNote` prefers the injected
     `systemNoteChannel` (production, wired at the composition root) and falls
     back to a channel built from `#input.pi` + `#input.emitDiagnostic` with an
     unreachable-by-construction no-op `ui.notify` for a `pi`-only harness — the
     bug doc's own §Reproduction shape, and the path witness cells (a)–(d)
     drive. The fallback carries no `RendererGate` and no
     `SystemNoteChannelHealth`, so on a fallback-wired instance a stale-ctx
     throw does not latch the channel dead for later notes (PIC-67 clause (c)'s
     rethrow still fires). Both paths are witnessed — cell (e) pins that
     production rides the injected channel and never the fallback.
  3. **Witness stderr noise.** Cells (a)–(c) leave `cleanCancelSink` absent, so
     they exercise the production default `createProductionEmissionSink` and
     write real structured rows to stderr during `npm test` (as does bug 0074's
     protected binder-window cell, which is untouchable). Deliberate: it keeps
     the default sink path witnessed. No assertion depends on stderr in the
     default suite.
  4. **Inert trap in cell (e).** Its `channel.ui.notify` throws by design, but
     `sendSystemNote` reaches that arm only after a `pi.sendMessage` throw or a
     degraded gate, neither of which the cell's mock produces — the trap is
     inert rather than load-bearing. The cell's real guards (`display === false`,
     the exact injected-channel / producer-`pi` partition, and the loud SLSH-4
     precondition) are independent and non-vacuous.
  5. **The second emission site has no offline witness.**
     `#spawnSubagentFnSession`'s `dispose` shares `#emitCleanCancelNote` with the
     ticket path, but reaching it needs a real child-spawn seam, which the
     offline tier cannot deliver; it is covered by call-site symmetry and by the
     shared helper, not by a cell of its own.
  6. **Stale `path:line` citations.** Every `path:line` citation in the sections
     above this record was already stale at this HEAD (bug 0074 moved all three
     files again), and this fix shifts `session-shutdown.ts`,
     `production-theta-producer.ts` and `production-composition.ts` further.
     Disclosed, not chased — bug 0134 owns corpus-wide stale-citation drift.
     Every citation this fix ADDS names a symbol.
  7. **`CELL-A2` is a merge token, not a cell number.** The additive H8a cell
     carries the literal token `CELL-A2` in its title and header comment for the
     parent to renumber at merge.
  8. **No permitted-codes edit.** The real H9a run captured empty stderr on every
     spawn (the new `console.error` row fires only when a `session_shutdown`
     stamps an in-flight entry, which no H9a fixture does), so
     `tests/fixtures/h7a/permitted-codes.json` is unchanged and needed no row —
     decided by the real run, as required.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: §Non-goals is unchanged and was respected —
  sub-step 2's stamp-then-abort ordering and synthesised CNCL-4 reason,
  `reload-teardown-timeout`, `session-shutdown-teardown-step-failed`, the SLSH-4
  `SNK-f` `theta /<name> cancelled` note (cell (a) asserts it stays on the wire),
  the `session-swap-instance-survived` tripwire, and the stamp-throw residual arm
  are all untouched. No diagnostic code, registry row or `Trigger` was added or
  widened — `theta/runtime/cancelled-by-session-shutdown` was already registered
  — so the DIAG-2 closed-registry obligation required no spec or
  `docs/reference/` edit. One bounded self-authorisation is on the record: the
  additive live cell's spec citation was rewritten from `path:line` to the row
  name (comment-only, zero assertions).
