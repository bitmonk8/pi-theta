# Bug 0208 — An invocation still in flight at the sub-step-3 `SHUTDOWN_AWAIT_CAP_MS` deadline is named in the `theta/runtime/reload-teardown-timeout` `<list>` AND later draws `theta/runtime/cancelled-by-session-shutdown` from its own `finally` with a fully stamped reason, so the "never both" mutual-exclusion clause — whose only carve-out is the sub-step-2 stamp-throw residual gap — is violated and that carve-out's `"<unreadable>"` discriminator is spoofed

- **Status:** fixed (0.137.0).
- **Sev/Diff estimate:** S4/D3 — both emitted rows are individually
  conforming and the open question is which side of the spec's never-both
  clause moves, but deciding it needs in-run adjudication against a
  spec-pinned five-field entry that cannot carry a deadline signal.
- **Kind:** defect — a spec-mandated mutual exclusion between two diagnostic
  rows does not hold, and the pair the spec reserves as the discriminator for
  one named residual gap is produced by an ordinary stamped path.
- **Affected:**
  - `src/extension/session-shutdown.ts` — `runSessionShutdown` sub-step 2
    (the `for (const entry of entries)` loop that writes
    `entry.shutdownReason = capturedReason` before
    `entry.thetaAbort.abort(abortReason)`): it stamps EVERY entry in the
    `activeInvocations.snapshot()`, with no knowledge of which entries will
    still be in flight at the deadline.
  - `src/extension/session-shutdown.ts` — `runBoundedDisposeAwait`, the
    sub-step-3 deadline path: on `timerFired && inFlight.size > 0` it emits
    `reloadTeardownTimeoutDiagnostic(stillInFlight, elapsed)` through
    `emitTeardownDiagnostic`, naming each still-in-flight entry as
    `/<theta>:<invocationId>`.
  - `src/extension/session-shutdown.ts` — `emitCancelledBySessionShutdownNote`
    (the emission shipped by bug 0073's fix in 0.130.0): it keys on nothing but
    the entry handed to it, and its caller's predicate is
    `entry.shutdownReason !== undefined`.
  - `src/extension/production-theta-producer.ts` —
    `ProductionThetaProducer.#emitCleanCancelNote` and its two call sites:
    `#openInvocationTicket`'s `finish` closure and `#spawnSubagentFnSession`'s
    `dispose`. Both run inside the once-only `finished` guard and both fire
    whenever `shutdownReason` is set, whether the barrier settled before or
    after the deadline.
  - `src/runtime/active-invocation-registry.ts` — the five-field
    `ActiveInvocationEntry` `{ thetaAbort, disposeBarrier, shutdownReason,
    theta, invocationId }`, which carries no deadline signal.
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md`
    §[Session-swap behaviour for in-flight invocations](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#session-shutdown-semantics),
    rule **Per-invocation operator visibility (clean-cancel path)** — the
    never-both clause and its single EXCEPT arm.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md`
    §[`cancelled-by-session-shutdown` mutual exclusion](../spec_topics/diagnostics/code-registry-runtime.md#cancelled-by-session-shutdown-mutual-exclusion)
    — the restated clause plus the operator-tooling consumer guidance.
  - `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md`
    §[*Accepted theta 1.0 residual gap — sub-step-2 stamp-throw case*](../spec_topics/pi-integration-contract/session-only-degraded-state.md#substep-2-stamp-throw-residual-gap)
    — the only carved-out case, and the owner of the dual-appearance
    discriminator semantics.
- **Observed at:** `0.131.0` (`03c05b85`). Offline scratch vitest over the real
  `createProductionProducerDeps` producer, the real `composeThetaFixture.run`
  DRIVE seam and the real `runSessionShutdown` against the SAME
  `ActiveInvocationRegistry`, with a `FakeClock` advanced past
  `SHUTDOWN_AWAIT_CAP_MS` while the body stayed parked. No provider, no
  filesystem, no watcher.
- **Related:**
  - [0073](./0073-cancelled-by-session-shutdown-never-emitted.md) — fixed
    (0.130.0). Wired the per-invocation clean-cancel emission; this report is
    residual 1 of its fix record (review round-1 finding F1), disposed there as
    an accepted residual and filed here for adjudication.
  - [0074](./0074-registry-insertion-after-binder-await.md) — fixed (0.125.0).
    Moved registry insertion to handler entry behind the
    `ActiveInvocationTicket` seam and pinned the entry at five fields; that pin
    is the constraint a deadline-signal fix runs into.

## Summary

Sub-step 2 of `runSessionShutdown` stamps `entry.shutdownReason` on every entry
in the registry snapshot. Sub-step 3 then awaits the entries' `disposeBarrier`s
under `SHUTDOWN_AWAIT_CAP_MS` and, at the cap, emits one
`theta/runtime/reload-teardown-timeout` naming each entry still in flight. An
entry named in that `<list>` still carries the stamp, so when its own `finally`
eventually runs, `#emitCleanCancelNote`'s predicate
(`entry.shutdownReason !== undefined`) is true and the invocation also emits
`theta/runtime/cancelled-by-session-shutdown`.

Both spec sites state the exclusion as "never both", with one EXCEPT arm: the
sub-step-2 stamp-throw residual gap, where the stamp threw, `abort()` was
skipped, the entry therefore misses the deadline, and `shutdownReason` is unset
so the note's `details.event.reason` is the literal `"<unreadable>"`. The
code-registry row makes that dual appearance load-bearing: it is the signal that
"discriminates the sub-step-2 stamp-throw path from the other two"
`"<unreadable>"` causes, and consumers "SHOULD treat the appearance of an
invocation in both surfaces on the same shutdown as a residual-gap signal".

The measured path produces the same dual appearance with
`details.event.reason: "reload"` — a successful stamp, a successful abort, and a
barrier that simply settled after the cap. So the pair appears where the spec
says it cannot, and an operator or tool applying the documented discriminator
reads a residual-gap stamp-throw where none occurred.

## Reproduction

Offline scratch vitest at `03c05b85`
(`tests/scratch-post-deadline-dual-surface.test.ts`, run and deleted). The
harness shapes are `tests/cancelled-by-session-shutdown-note.test.ts`'s
(`createProductionProducerDeps` + the real DRIVE seam + the real
`runSessionShutdown` over one shared registry, `executeBody` mocked so the body
parks on a deferred) with the parked-clock control of
`tests/active-invocation-binder-window.test.ts`. The one change from bug 0073's
clean-cancel cells: the body is NOT released before the await; the `FakeClock`
is advanced past the cap first, so the entry is still in flight at the deadline.

```ts
const run = composeThetaFixture(promptTheta(), deps).run("", driveCtx());
await tick();                                   // registry.size() === 1
const entry = registry.snapshot()[0];

const done = runSessionShutdown({ reason: "reload" }, shutdownDeps(registry, clock));
setTimeout(() => clock.advance(5000), 0);       // cap fires, entry still in flight
await done;                                    // surface 1 emitted here

releaseBody();                                 // the invocation's own finally
await run;                                     // surface 2 emitted here
```

Observed, verbatim:

```
=== SURFACE 1 (teardown sink) ===
{"severity":"error","code":"theta/runtime/reload-teardown-timeout","message":"reload teardown timed out after 5000ms; 1 invocation(s) still in flight: /demo:11111111-2222-3333-4444-555555555555","hint":"5000"}
=== SURFACE 2 (clean-cancel sink) ===
{"severity":"error","code":"theta/runtime/cancelled-by-session-shutdown","message":"theta /demo cancelled by session shutdown (reload)","details":{"event":{"reason":"reload","theta":"demo","invocation_id":"11111111-2222-3333-4444-555555555555"}}}
=== wire notes ===
{customType:theta-system-note content:"theta /demo cancelled" display:true details:{"event":{}}}
{customType:theta-system-note content:"theta /demo cancelled by session shutdown (reload)" display:false details:{"event":{"reason":"reload","theta":"demo","invocation_id":"11111111-2222-3333-4444-555555555555"}}}
registry.size() 0 shutdownReason reload
```

The same `invocation_id` (`11111111-2222-3333-4444-555555555555`) appears in the
timeout `<list>` and in the clean-cancel row's `details.event`, on one
`session_shutdown` event. `shutdownReason` is `"reload"`, not `"<unreadable>"`,
so the stamp did not throw and sub-step 2's `abort()` was not skipped.

## Expected behaviour

- `session-shutdown-semantics.md`
  §[Session-swap behaviour for in-flight invocations](../spec_topics/pi-integration-contract/session-shutdown-semantics.md#session-shutdown-semantics),
  **Per-invocation operator visibility (clean-cancel path)**: "An invocation
  either emits `cancelled-by-session-shutdown` (cleanly cancelled within the
  window) or contributes to the single `theta/runtime/reload-teardown-timeout`
  `<list>` of sub-step 3 (still in flight at the deadline), never both … EXCEPT
  on the *Accepted theta 1.0 residual gap — sub-step-2 stamp-throw case* above,
  where an affected invocation MAY both contribute to the
  `reload-teardown-timeout` `<list>` (because sub-step 2's `abort()` was
  skipped) AND later emit `cancelled-by-session-shutdown` from this rule".
  The same rule widens the emission precondition to a post-deadline settle only
  "on the *Accepted theta 1.0 residual gap — sub-step-2 stamp-throw case*", and
  pins that on that arm `entry.shutdownReason` "carries the literal
  `"<unreadable>"` sentinel per the residual-gap paragraph".
- `code-registry-runtime.md`
  §[mutual exclusion](../spec_topics/diagnostics/code-registry-runtime.md#cancelled-by-session-shutdown-mutual-exclusion)
  restates the clause and adds the consumer contract: "Operator-tooling
  consumers SHOULD treat the appearance of an invocation in both surfaces on the
  same shutdown as a residual-gap signal, not as a contract violation." The same
  row uses the dual appearance to discriminate: "the affected invocation's dual
  appearance in the `theta/runtime/reload-teardown-timeout` `<list>` of the same
  `session_shutdown` event … discriminates the sub-step-2 stamp-throw path from
  the other two". The row's own trigger column scopes the code to an invocation
  whose "`disposeBarrier` settled cleanly inside the `SHUTDOWN_AWAIT_CAP_MS`
  window".
- `session-only-degraded-state.md`
  §[*Accepted theta 1.0 residual gap — sub-step-2 stamp-throw case*](../spec_topics/pi-integration-contract/session-only-degraded-state.md#substep-2-stamp-throw-residual-gap)
  scopes the carve-out to "a sub-step-2 per-entry stamp throw (frozen/proxied
  entry, write-rejecting setter, OOM during property assignment)", where "the
  `thetaAbort.abort()` call for the affected entry is **skipped**, leaving that
  invocation un-cancelled by the handler".

So a stamped, aborted invocation whose barrier settles after the cap must
produce exactly one of the two surfaces, and the dual appearance must occur only
with `details.event.reason === "<unreadable>"`.

## Actual behaviour / root cause

Three mechanisms compose:

1. Sub-step 2 stamps unconditionally. The loop walks the whole
   `activeInvocations.snapshot()` and writes `capturedReason` onto every entry;
   nothing distinguishes an entry that will settle inside the window from one
   that will not, because that is not yet known.
2. Sub-step 3's deadline path emits its `<list>` from `inFlight`, and leaves the
   entries alone otherwise: `runBoundedDisposeAwait` returns
   `{ timedOut: true, deadline }` without clearing, marking or removing the
   stamp on the entries it just named.
3. The per-invocation `finally` keys only on the stamp. `#emitCleanCancelNote`
   returns early on `entry.shutdownReason === undefined` and otherwise calls
   `emitCancelledBySessionShutdownNote(entry, { channel, sink })`. There is no
   time or deadline input at that site, and bug 0073 §Fix constraint 2 pins the
   predicate to the stamp rather than to `signal.aborted`.

The result is not a duplicated row (each row is emitted once, and each is
individually conforming) but a pair the spec declares impossible outside one
degraded case. Because the carve-out hangs the stamp-throw discriminator on
exactly that pair, the reachable path also inverts the discriminator's meaning:
a consumer following the code-registry guidance classifies a healthy
slow-teardown invocation as a stamp-throw residual, and the sentinel that is
supposed to accompany it (`"<unreadable>"`) is absent — the only remaining
signal that the classification is wrong.

Bug 0073's fix record disposed this as residual 1 and states the measurement
made at its verification: "No evidence it is reachable in the default suite or
in an ordinary `pi -p` run (checked at verification)." This report does not
extend that measurement; the probe above shows the path is reachable in a
harness that keeps an invocation parked across the cap, and says nothing about
how often a real theta does so.

## Why it matters

- The never-both clause is a contract two spec pages state and a third
  restates. As implemented it does not hold, so a consumer written against it
  must handle a case the spec says cannot occur.
- The carve-out's discriminator is spoofed. `code-registry-runtime.md` names the
  dual appearance as the signal that separates the sub-step-2 stamp-throw
  `"<unreadable>"` cause from the throwing-access and snapshot-failure causes,
  and notes it survives a swallowed `console.error` when the other
  discriminators do not. A path that produces the same pair with a
  fully-captured reason removes that guarantee.
- The disagreement is not resolvable at the emission site. Both surfaces are
  emitted by code each of whose local behaviours the spec pins: sub-step 2's
  unconditional stamp, the deadline `<list>`, and the stamp-keyed predicate.
  Which of the three (or the prose) moves is undecided, which is why this is
  filed rather than fixed.
- Bounded: cancellation itself is unaffected. Sub-step 2 aborts, the theta
  unwinds, the barrier settles, the registry drains, and both rows carry
  correct content. The defect is confined to the operator-visibility channel
  and to the spec clause governing the pair.

## Fix

Not decided. Two routes, both named in bug 0073's fix record as the only ones
compatible with the surrounding pins:

1. **Spec carve-out.** Extend the never-both clause's EXCEPT arm from the
   sub-step-2 stamp-throw case to any post-deadline settle of a stamped entry,
   at all three sites that state or restate it
   (`session-shutdown-semantics.md` §Per-invocation operator visibility,
   `code-registry-runtime.md`
   §[mutual exclusion](../spec_topics/diagnostics/code-registry-runtime.md#cancelled-by-session-shutdown-mutual-exclusion),
   and the `cancelled-by-session-shutdown` row's trigger column, which today
   scopes the code to a barrier that "settled cleanly inside the
   `SHUTDOWN_AWAIT_CAP_MS` window"). This route must also re-pin the
   stamp-throw discriminator, because a widened arm makes the dual appearance
   ambiguous; the `details.event.reason === "<unreadable>"` sentinel is the
   candidate that survives, and the co-emitted teardown-handler rows
   (`theta/host/session-shutdown-pinned-constant-unreadable` /
   `theta/host/session-shutdown-reason-unknown`) are already the other two
   causes' discriminators.
2. **Sanctioned deadline channel.** Give the per-invocation `finally` a way to
   know it settled after the cap, and suppress (or re-code) one of the two
   surfaces. No such channel exists today.

Constraints on either route:

- The five-field `ActiveInvocationEntry`
  (`{ thetaAbort, disposeBarrier, shutdownReason, theta, invocationId }`) is
  spec-pinned and must not gain a sixth field
  (`src/runtime/active-invocation-registry.ts` module contract; the pin is
  restated in bug 0074's fix record and honoured by bug 0073's, which left both
  the entry and `ActiveInvocationTicket` unwidened). Route 2 therefore needs
  either a spec change to the entry shape or a channel outside the entry — the
  `ActiveInvocationTicket` seam bug 0074 introduced is the existing
  producer-side seam a deadline signal could ride.
- A window or elapsed-time check at the emission site is excluded: bug 0073
  §Fix constraint 2 pins the predicate to `entry.shutdownReason !== undefined`
  and forbids deriving it from `signal.aborted` or equivalent, so a local time
  test at `#emitCleanCancelNote` would contradict it.
- `sendSystemNote` MUST NOT be invoked from the teardown handler
  (`active-invocation-registry.md` §Edge cases), so the clean-cancel row cannot
  be moved into sub-step 3 where the deadline is known.
- Any new or re-scoped diagnostic code carries the DIAG-2 closed-registry
  obligation (registry row plus the spec edits in the same commit). Route 1 is
  a prose-only change if it re-pins the discriminator without a new row.
- The witness must drive the post-deadline arm, not the clean-cancel arm:
  `tests/cancelled-by-session-shutdown-note.test.ts` deliberately never
  advances its `FakeClock`, so none of its five cells reaches this path. A new
  cell advancing past `SHUTDOWN_AWAIT_CAP_MS` with the body still parked is the
  shape the §Reproduction probe used.

## Provenance

- Spec read at `03c05b85`:
  `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md`
  §Session-swap behaviour for in-flight invocations (sub-step 2 stamp-then-abort,
  sub-step 3 bounded await, **Per-invocation operator visibility (clean-cancel
  path)** and its never-both clause);
  `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md`
  §*Accepted theta 1.0 residual gap — sub-step-2 stamp-throw case*
  (anchor `substep-2-stamp-throw-residual-gap`);
  `docs/spec_topics/diagnostics/code-registry-runtime.md`, the
  `theta/runtime/cancelled-by-session-shutdown` and
  `theta/runtime/reload-teardown-timeout` rows (anchor
  `cancelled-by-session-shutdown-mutual-exclusion`);
  `docs/spec_topics/pi-integration-contract/active-invocation-registry.md`
  (entry shape, `shutdownReason` purpose, §Edge cases);
  `docs/spec_topics/diagnostics/diagnostic-shape.md`
  §session-shutdown-details-conventions.
- Implementation read at `03c05b85`: `src/extension/session-shutdown.ts`
  (`cancelledBySessionShutdownReason`,
  `cancelledBySessionShutdownDiagnostic`, `reloadTeardownTimeoutDiagnostic`,
  `emitTeardownDiagnostic`, `emitCancelledBySessionShutdownNote`,
  `runSessionShutdown` sub-step 2, `runBoundedDisposeAwait`);
  `src/extension/production-theta-producer.ts`
  (`#emitCleanCancelNote`, `#openInvocationTicket`, `#spawnSubagentFnSession`);
  `src/runtime/active-invocation-registry.ts`;
  `src/extension/capability-probe.ts` (`SHUTDOWN_AWAIT_CAP_MS`).
- Tests inspected: `tests/cancelled-by-session-shutdown-note.test.ts` (bug
  0073's five cells — the `FakeClock` is never advanced, so the cap cannot
  fire and no cell reaches the post-deadline arm),
  `tests/active-invocation-binder-window.test.ts` (bug 0074's parked-binder
  pattern and its clock control).
- Mechanical repro: offline scratch vitest
  (`tests/scratch-post-deadline-dual-surface.test.ts`, run at `03c05b85` and
  deleted) driving the real producer bind through the real DRIVE seam and the
  real `runSessionShutdown`, with the `FakeClock` advanced past the cap while
  the body stayed parked. Both surfaces quoted verbatim in §Reproduction.
- Origin: bug 0073's fix record §Fix (0.130.0), review round 1 finding F1 /
  residual 1 (*Post-deadline dual surface*).

## Fix (0.137.0)

- Route chosen: **§Fix route 1 (spec carve-out)**, prose-only, no `src/` change.
  Route 2 (sanctioned deadline channel) is rejected: it is new runtime channel
  work, the five-field `ActiveInvocationEntry` is spec-pinned against a sixth
  field (bug 0074), the emission predicate is pinned by bug 0073 §Fix constraint
  2, and `sendSystemNote` MUST NOT be invoked from the teardown handler — so
  route 2 needs a spec change to a pinned structure. The implementation is
  correct as measured (both rows individually conforming, cancellation
  unaffected); the never-both prose was over-tight.
- What shipped:
  - `session-shutdown-semantics.md` §Per-invocation operator visibility — the
    opening precondition's post-deadline arm widens to any entry sub-step 2
    processed, with the stamp-throw case retained as a named sub-arm; the
    single `"<unreadable>"`-sentinel claim splits into two arms (ordinary
    post-deadline settle carries the handler-captured reason, only the
    stamp-throw sub-arm carries the sentinel); the never-both EXCEPT arm widens.
  - `code-registry-runtime.md` `cancelled-by-session-shutdown` row — Trigger
    scope widens to a settle inside *or* after the `SHUTDOWN_AWAIT_CAP_MS`
    window; the three-`"<unreadable>"`-cause discriminator re-pins off the dual
    surface onto the co-emitted host row *and the value that row reports*; the
    `<a id="cancelled-by-session-shutdown-mutual-exclusion">` clause widens and
    its consumer guidance is corrected.
  - `code-registry-runtime.md` `reload-teardown-timeout` row — the restated
    EXCEPT arm widens; consumer guidance corrected identically.
  - `placeholder-rendering-b.md` `<reason>` bullet — the same discriminator
    re-pin. No placeholder added or removed; the table stays closed.
  - `session-only-degraded-state.md` residual-gap paragraph — the `<list>`
    appearance is not exclusive to the gap; the composite
    (`details.event.reason === "<unreadable>"` + absence of both
    `"<unreadable>"`-reporting `theta/host/*` rows) is stated as *sufficient
    evidence*, not a necessary signature.
  - `tests/post-deadline-dual-surface.test.ts` — new conformance lock on the
    post-deadline arm (bug 0073's five cells never advance their `FakeClock`,
    so none reaches it). Bug 0073's witness is untouched.
- Discriminator re-pin, precisely: the throwing-access cause co-emits
  `theta/host/session-shutdown-reason-unknown` whose `details.observed` is
  itself `"<unreadable>"`; the snapshot-failure cause co-emits
  `theta/host/session-shutdown-pinned-constant-unreadable`; the sub-step-2
  stamp-throw cause is the arm whose per-invocation row carries the sentinel
  while neither of those two sentinel-reporting rows is co-emitted. A
  `reason-unknown` row carrying any other observed value does not disqualify
  the stamp-throw arm — the event-level classification and the per-entry write
  failure are independent axes. Where they coincide the stamp throw is not
  operator-distinguishable; that is recorded in-corpus as an accepted theta 1.0
  residual on the same footing as the residual gap itself.
- Gates: witness `tests/post-deadline-dual-surface.test.ts` — `Test Files 1
  passed (1) / Tests 1 passed (1)`, green on arrival (a conformance lock
  re-deriving §Reproduction at HEAD, byte-identical including the `5000ms`
  *elapsed* value). Full default suite — `Test Files 332 passed (332) / Tests
  6088 passed (6088)`, run clean twice by the orchestrator (the 0207 comment
  sweep rides along). `npm run typecheck` — clean, no output. `npm run lint` —
  clean, no output. `wc -l` unchanged on all four amended spec files
  (44 / 138 / 29 / 33); line endings preserved (`session-shutdown-semantics.md`
  CRLF, the other three LF). `git status --porcelain src/` empty.
- Review: 3 rounds.
  - Round 1 (`bug-fix-reviewer`): four findings. F1 `spec` blocking — the first
    re-pin asserted the stamp-throw cause "co-emits **neither** host row", which
    is falsifiable because `session-shutdown-reason-unknown` also fires for an
    unknown-but-*readable* reason; fixed by keying on the row's reported value
    and recording the compound-case residual. F2 `prose` — five new occurrences
    of the STYLE-banned `simply`; removed. F3 `prose` — edit-history narration
    in normative prose; de-narrated. F4 `prose` — a duplicated parenthetical;
    de-duplicated.
  - Round 2 (`bug-fix-reviewer-fast`): two findings, `recommend-deep-review`.
    F1 `correctness` — `classifyShutdownReason` and both `theta/host/*` rows are
    unwired in production; dispositioned as a pre-existing out-of-lane src
    defect (residual 1 below), no prose change. F2 `spec` — two cross-reference
    labels named "the disambiguation paragraph" for an anchor marking the
    mutual-exclusion clause; relabelled, no new anchor.
  - Round 3 (`bug-fix-reviewer`, deep per the fast round's escalation): CLEAN.
    It audited and upheld the round-2 F1 disposition on all four grounds, and
    enumerated the discriminator's reachable states to show the three arms
    partition them. Two non-blocking prose residuals (2 and 3 below).
- Verification: SOLID.
  - The witness is not vacuous: prose-only, so nothing to revert — instead all
    three signals it asserts were neutralised in `src/` and each red for its own
    reason (surface 2 via `#emitCleanCancelNote`'s call in
    `#openInvocationTicket`'s `finish`; surface 1 via the
    `reloadTeardownTimeoutDiagnostic` emission in `runBoundedDisposeAwait`; the
    discriminator via sub-step 2's stamp), each restored byte-exactly
    (`production-theta-producer.ts` `f9e44c35…`, `session-shutdown.ts`
    `c46d4559…`, both matching `git rev-parse HEAD:<path>`), `git status
    --porcelain src/` empty, witness re-run GREEN.
  - Full default suite green (332 / 6088).
  - Live: none owed — the fix alters no runtime observable (`src/` clean). The
    DIAG-4 check is discharged by inspection: neither row's Message-template
    column changed (both byte-identical), and `tests/code-registry.test.ts`
    sources expectations through `registryMessage`, which reads `row.message`
    only and never the Trigger column. DIAG-2 mirror: `docs/reference/
    diagnostics.md` renders these rows as `Code | Sev | Phase | Message
    template` and states that Trigger columns "live on the spec registry pages
    and are not restated here", so no same-commit mirror edit is owed;
    `git diff -- docs/reference/` is empty.
  - Lint and typecheck clean.
- Residuals:
  1. **Both `"<unreadable>"`-reporting host rows are unwired in production.**
     `classifyShutdownReason` (`src/extension/unknown-reason-rule.ts`) has zero
     callers outside its defining module; `SessionShutdownDeps.inventory`
     (`src/extension/session-shutdown.ts`) is declared and never read;
     `src/extension/factory.ts` passes `inventory: undefined`. So
     `theta/host/session-shutdown-reason-unknown` and
     `theta/host/session-shutdown-pinned-constant-unreadable` cannot fire in the
     shipped extension, and two of the discriminator's three arms are vacuous
     against current `src/`. Pre-existing, unrelated to this fix, and out of
     this lane's scope (docs-only). The pre-fix prose already hung those two
     causes on the same rows (`git show HEAD:` of both files confirms), so this
     fix introduces no new reliance on unreachable behaviour, and it moves the
     stamp-throw cause off a *wired but spec-incorrect* signal onto a
     spec-correct one. Needs its own bug report against the wiring.
  2. **"widened" as a relative qualifier** — the amended prose names the clause
     "the widened … EXCEPT clause" at all four sites. The term predates this
     change in the corpus (it already appeared in
     `session-shutdown-semantics.md`'s "widened opening precondition") and it
     serves as the cross-site name for the clause, but it is meaningful only
     relative to the narrower prior form. Follow-up prose material.
  3. **"That discriminator is co-emission of a `theta/host/*` row…"** —
     `code-registry-runtime.md`, the swallow-loss passage. For the stamp-throw
     arm the discriminating signal is the *absence* of co-emission, so the
     phrasing is loose; the load-bearing conclusion (a swallowed write costs
     disambiguation between all three causes uniformly) is correct.
  4. **Full-suite load flakes.** Under the verifier's full-suite run
     `tests/production-tools-load-resolution.test.ts` failed with `Hook timed
     out in 10000ms` and `tests/inbound-union-arm-dispatch.test.ts` with a
     child-process `{ code: 1 }` vs `{ code: 0 }`; both passed in isolation
     (50/50 and 19/19) and both of the orchestrator's own full-suite runs were
     332/6088 fully green. Neither file is touched by this fix.
- Discharge notes appended: `docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md`
  (under residual 1, *Post-deadline dual surface* — the accepted residual this
  bug closes).
- Pinned dispositions / non-goals: the five-field `ActiveInvocationEntry` stays
  unwidened; the emission predicate stays `entry.shutdownReason !== undefined`
  (bug 0073 §Fix constraint 2); no elapsed-time or window test is added at
  `#emitCleanCancelNote`; no new diagnostic code and no new placeholder — the
  DIAG-2 registry and the placeholder table stay closed; `docs/bugs/**` prose
  quoting the pre-fix clause is left as filed (bug reports are historical
  records). Per this lane's instruction, `package.json`, `CHANGELOG.md` and
  `docs/bugs/README.md` are untouched and the version reads `0.137.0` until the
  batch merges as one version.
