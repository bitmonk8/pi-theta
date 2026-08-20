# Bug 0074 — The `ActiveInvocationRegistry` entry is inserted after the awaited binder step, not at slash-command handler entry: a `session_shutdown` landing inside the binder window finds no entry, so sub-step 2 never aborts that invocation, sub-step 3 never awaits it, and the theta proceeds into its body after the whole five-sub-step teardown has returned

- **Status:** fixed (0.125.0).
- **Kind:** defect — insertion-site placement diverges from the registry
  contract's explicit "before any awaitable work". The slash-dispatch entry
  point creates `thetaAbort` and attaches the `ctx.signal` forwarding listener
  at handler entry (`src/extension/theta-composition-producer.ts:357–358`), then
  `await`s the binder (`:389`) — up to three LLM calls per HC3-d — and only
  afterwards binds the conversation (`:398`), which is where the registry
  `add` happens (`src/extension/production-theta-producer.ts:1521–1530`,
  `:1758`, `:2260`). The window between handler entry and insertion is one
  binder round trip wide.
- **Related:**
  - 0022 (fixed, 0.29.0) — a late-completing `session_start` compose tail doing
    registration work against an invalidated runtime. Same hazard class
    (post-teardown work on a dead extension instance), different actor
    (compose tail vs. a dispatched invocation) and different mechanism (missing
    zero-touch suppression vs. a late registry insertion).
  - 0024 (fixed, 0.36.0) — a slash name bound to a superseded drained registry.
    Adjacent: 0024 is about *dispatch* resolving to a dead generation; this is
    about a *dispatch already past the gate* becoming invisible to teardown.
  - Candidate 01 in this batch — the same registry entry's other unreachable
    obligation (the per-invocation clean-cancel note). Independent mechanisms;
    an invocation caught by this bug would not draw that note even after 01 is
    fixed, because it holds no entry.
- **Affected:**
  - `src/extension/theta-composition-producer.ts:357` (`createThetaAbort()`),
    `:358` (`forwardSlashCommandCancel`), `:389`
    (`await deps.runBinder(...)` — the awaitable work), `:398–401` (the bind
    that finally inserts), `:433–441` (the `finally` that removes).
  - `src/extension/production-theta-producer.ts:1521–1536` (prompt-bind
    insertion — "The entry is added LAST"), `:1758` (subagent bind), `:2260`
    (invoke spawn site); `:655–700` (`runBinder`, the awaited step — a genuine
    off-session provider call on the non-bypass path, `:693` onward).
  - `src/extension/session-shutdown.ts:448` (sub-step 2 iterates
    `activeInvocations.snapshot()` — a snapshot of an empty set for an
    invocation still in its binder window), `:465` (sub-step 3 awaits the same
    empty entry list).
  - `src/extension/factory.ts:628–655` (`drainGatedHandler`: the PIC-29 arm-(a)
    gate is read once at handler entry and then `await outcome.theta.run(...)`
    — the gate cannot re-fire for a dispatch already in flight).
- **Observed at:** `0.52.0` (`d06daae3`). Offline; scratch vitest over the real
  `composeThetaFixture.run` dispatch path and the real `runSessionShutdown`
  handler, with the binder step parked on a deferred to model its real duration.

## Summary

The registry contract fixes both the sites and the timing of insertion:
"**Insertion** happens at slash-command handler entry, `tool.execute(...)`
adapter entry, and `invoke` spawn-site entry, **before any awaitable work**",
and the *Dispatch-site setup wrap* enumerates the setup sequence each site must
perform inside one `try`/`catch` — `new AbortController()`, the
`Promise.withResolvers()` construction, **the registry-`Set.add` insertion**,
and the forwarding-listener attach.

The implementation splits that sequence across an `await`. At slash-command
handler entry `composeThetaFixture.run` performs two of the four steps
(`createThetaAbort()`, `forwardSlashCommandCancel`) and then awaits the binder.
The `Promise.withResolvers()` construction and the `Set.add` happen inside
`bindPromptConversation` / `spawnSubagentConversation`, which run only after the
binder resolves. The producer's own comment at
`production-theta-producer.ts:1512` and `:1531` states the intent — "The entry
is added LAST — this method is synchronous and cannot throw between here and the
return" — which holds *within the bind method* and says nothing about the
binder await that precedes it.

Consequence: for the duration of the binder call the invocation is running, has
a live `thetaAbort`, and holds no registry entry. A `session_shutdown` delivered
in that window iterates an empty snapshot: sub-step 2 aborts nothing, sub-step 3
awaits nothing and cannot name the invocation in `reload-teardown-timeout`,
sub-step 5 detaches nothing for it. The teardown handler returns, Pi calls
`ExtensionRuntime.invalidate(...)`, and the theta then binds its conversation
and executes its body against the torn-down instance.

## Reproduction

Offline, scratch vitest at `d06daae3` (run and deleted). Real
`createProductionProducerDeps` producer reached through a `Proxy` that overrides
only `runBinder` with a parked one (a class instance, so `this` must stay the
original — hence the proxy rather than a spread); real
`composeThetaFixture.run`; real `runSessionShutdown` over the same shared
`ActiveInvocationRegistry` the producer was constructed with.

```ts
const registry = new ActiveInvocationRegistry();
const base = createProductionProducerDeps({ pi, root, modelRegistry, activeInvocations: registry });
const deps = new Proxy(base, { get: (t, p) => p === "runBinder" ? parkedBinder : bind(t, p) });
//   parkedBinder: captures input.thetaAbort, awaits a deferred, returns { bound: true, args: {} }

const run = composeThetaFixture(promptTheta(), deps).run("", driveCtx());
await tick();                                     // binder dispatched, still in flight

await runSessionShutdown({ reason: "reload" }, shutdownDeps(registry, new FakeClock(), log));

releaseBinder();
await run;
```

Observed:

```
during the binder await:
  registry.size()                    0        (spec: 1 — the entry spans the invocation)
  thetaAbortSeen                     defined  (the invocation owns a live controller)

after runSessionShutdown returned (all five sub-steps done):
  thetaAbortSeen.signal.aborted      false    (sub-step 2 had nothing to abort)
  executeBody calls                  0

after releaseBinder():
  executeBody calls                  1        (the theta body ran post-teardown)
  thetaAbortSeen.signal.aborted      false
  registry.size()                    0
  pi.sendMessage:  [ { customType: "theta-system-note",
                       content: "theta /demo cancelled", ... } ]
```

The last line is the harness's own `fail`-outcome surface, not a cancellation:
the signal never aborted. The load-bearing observations are
`registry.size() === 0` while the invocation is in flight, `aborted === false`
after a completed teardown, and `executeBody` running afterwards.

Control, same harness with the binder left alone (the committed
`tests/active-invocation-wiring.test.ts` shape): with the *body* parked instead
of the binder, `registry.size() === 1` and sub-step 2 does abort the entry — the
entry does span the body window. The gap is exactly the binder window.

## Expected behaviour (what the spec says)

- `docs/spec_topics/pi-integration-contract/active-invocation-registry.md`,
  *Registry contract*: "**Insertion** happens at slash-command handler entry,
  `tool.execute(...)` adapter entry, and `invoke` spawn-site entry, **before any
  awaitable work**."
- Same page, *Dispatch-site setup wrap*: "Each of the three insertion sites MUST
  wrap the pre-evaluation setup sequence — `new AbortController()` for
  `thetaAbort`, the `Promise.withResolvers()` construction (or equivalent) that
  yields the entry's `disposeBarrier` promise and its closure-held resolve
  handle, the registry-`Set.add` insertion, the per-entry-point
  `source.addEventListener('abort', …)` attach … — in a `try`/`catch` whose
  `catch` arm routes the captured throw or rejection through the
  **runtime-defect surface**". The sequence is one wrapped block; the
  implementation runs steps 1 and 4 at handler entry and steps 2 and 3 after an
  await.
- Same page, intro: "The runtime maintains the registry **in lock-step with
  each theta invocation**" and "Concurrent theta invocations therefore each
  carry one entry; the registry is the structure the teardown handler iterates."
- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:10`,
  sub-step 2: "**For every entry** in the `ActiveInvocationRegistry` … call
  `thetaAbort.abort(reason)`" — so that (`:11`) "subagent provider connections,
  in-flight queries, and child invokes drain before Pi's
  `ExtensionRuntime.invalidate(...)` runs" (`cancellation.md`, the
  `session_shutdown` trigger paragraph).
- `docs/spec_topics/cancellation.md`, §Forwarding: the `session_shutdown`
  handler "iterates the `ActiveInvocationRegistry` on `/reload`, `/new`, fork,
  or quit and aborts every entry's `thetaAbort`".
- The binder is inside the cancellable envelope by construction:
  `cancellation.md` §Granularity lists "immediately before issuing the
  slash-command argument binder's LLM call" as a checkpoint, and §Surfacing
  gives the cancelled binder its own system note — so an abort is *expected* to
  reach an invocation that is inside its binder call. The registry is the only
  channel by which `session_shutdown` can deliver that abort.
- `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` HC3-d bounds the window
  at "3 binder LLM calls per slash invocation", i.e. up to three provider round
  trips.

## Actual behaviour / root cause

`composeThetaFixture.run` (`theta-composition-producer.ts:346–500`) is the
slash-command handler body. Its ordering at HEAD:

```
:357   const thetaAbort = createThetaAbort();          // setup step 1
:358   forwardSlashCommandCancel(thetaAbort, ctx.signal);  // setup step 4
:389   const binderResult = await deps.runBinder({...});   // AWAITABLE WORK
:398   const binding = mode === "subagent" ? await spawnSubagentConversation(...)
                                           : bindPromptConversation(...);
                                            // setup steps 2+3 happen in here
:419   ... executeBody / drive ...
:441   binding.finishInvocation?.();                    // removal
```

and the insertion itself, inside the bind:

```ts
// src/extension/production-theta-producer.ts:1526–1533
const disposeBarrier = new Promise<void>((resolve) => { settleDispose = resolve; });
const entry: ActiveInvocationEntry = {
  thetaAbort, disposeBarrier, shutdownReason: undefined,
  theta: theta.slashName, invocationId: root.idSource.newInvocationId(),
};
activeInvocations?.add(entry);
```

`runBinder` (`:655`) short-circuits synchronously on the two bypass classes (no
`params:` at `:660`, and the `classifyBinderBypass` arms at `:673`), so those
dispatches close the window to a microtask. Every theta with a genuine
non-bypass `params:` block takes the provider path from `:693` on, and the
window is a real off-session LLM round trip — up to three under HC3-d.

Sub-step 2 reads a snapshot (`session-shutdown.ts:448`), so it is a
point-in-time view: an entry inserted after the snapshot is not aborted even
though the loop is still running. Sub-step 3 awaits the same array, so the
invocation is also absent from `reload-teardown-timeout`'s `<list>` — the
operator sees a clean teardown with N-1 invocations while N were live.

The drain gate does not compensate. `drainGatedHandler`
(`factory.ts:628–655`) reads `readDrainState()` once at dispatch entry and then
`await outcome.theta.run(args, ctx)`; PIC-29's three-arm routing is a
pre-dispatch gate only, and PIC-30 forbids adding a fourth arm. Nothing
re-checks after the binder resolves.

The post-teardown continuation is fully live: the theta binds its conversation
against `ctx`, registers its per-query tools, drives turns, and emits system
notes through `pi.sendMessage` — on an extension instance whose watchers are
closed, whose `ThetaRegistry` is drained and tagged `"shutting-down"`, and whose
Pi runtime may already have been invalidated. That is the PIC-67 stale-`ctx`
surface bugs 0018 / 0022 were filed against, reached here through a different
door.

## Why it matters

- **`/reload` and `/new` do not cancel a theta that is inside its binder
  call.** The documented purpose of sub-step 2 — draining in-flight work before
  `ExtensionRuntime.invalidate(...)` — is defeated for an entire class of
  in-flight invocations. The theta then runs to completion (queries, tool calls,
  subagent child spawns) against a dead instance.
- **Subagent children spawned after teardown are orphans.** A subagent-mode
  theta whose binder window straddles the shutdown spawns its child *after*
  sub-step 3's bounded await has already returned. Nothing awaits that child's
  `disposeBarrier` and nothing kills it: the PIC-66 one-shot kill listener keys
  on `thetaAbort`, which sub-step 2 never fired. The child holds a provider
  connection past the session swap.
- **Teardown telemetry under-reports.** `reload-teardown-timeout` renders only
  registry entries; an invocation invisible to the registry cannot appear, so
  the diagnostic asserts a smaller in-flight set than reality.
- **The forwarding-listener detach at sub-step 5 is likewise skipped** for the
  affected invocation (its sources are published onto the shared sink by the
  same bind — `production-theta-producer.ts:1533`), so the listener attached at
  `:358` survives the teardown until the invocation's own `finally` runs.
- Bounded: the window is one binder inference (zero for the two bypass classes),
  and an operator-initiated Esc still works throughout (that path forwards
  through `ctx.signal`, which was wired at `:358`). Only the
  `session_shutdown`-driven abort — the one that travels exclusively through the
  registry — is lost.

## Non-goals

- The bind-side insertion code itself (`production-theta-producer.ts:1521–1546`
  and siblings) — the entry shape, id minting, and the span over the body window
  are conforming; `tests/active-invocation-wiring.test.ts` pins that span and
  stays green under any fix that only moves the insertion earlier.
- Sub-step 2's snapshot-then-iterate shape — the registry contract pins
  insertion-order iteration and per-entry isolation, both implemented.
- PIC-29/30/31 drain-state routing at `factory.ts:628` — conforming for
  *pre-dispatch* gating; this report does not propose a fourth arm or a
  mid-dispatch re-check (PIC-30 forbids the former).
- The binder's own cancellation plumbing
  (`src/binder/binder-cancellation.ts`, the `binder-call` checkpoint) — correct
  and, once an entry exists, is exactly what makes a sub-step-2 abort land
  during the binder call.
- Candidate 01's missing per-invocation note — independent.

## Fix

Not yet decided. Constraints any fix must satisfy:

1. Insertion must move to the three entry points the contract names, ahead of
   the first `await`. For the slash path that is `composeThetaFixture.run`
   immediately after `createThetaAbort()` (`:357`), before
   `await deps.runBinder` (`:389`).
2. The whole four-step setup sequence (controller, resolvers, `Set.add`,
   listener attach) must sit inside one `try`/`catch` routing to the
   runtime-defect surface, with the nested-`catch` rule for a throwing cleanup
   `thetaAbort.abort()` — currently no such wrap exists at the composition
   layer.
3. Removal stays where it is (`:441`, after `teardown()`), so the entry still
   spans the body window; `finishInvocation` must become reachable on the
   binder-short-circuit path (`:390–391` returns before `binding` exists, so
   today there is deliberately nothing to finish — after the move there will
   be).
4. `invocationId` is minted at insertion time through the `IdSource` seam
   (`active-invocation-registry.md`), so the mint moves with the insertion; the
   producer's `root.idSource` must be reachable from the composition layer, or
   the insertion must stay in the producer behind a new pre-binder entry point.
5. The registry is currently threaded into the producer, not into
   `composeThetaFixture`; a fix that inserts at the composition layer needs that
   handle plumbed, and must not double-insert with the existing bind-side
   `add`.
6. A regression cell must park the *binder* (not the body) and assert
   `registry.size() === 1` and `signal.aborted === true` after
   `runSessionShutdown` — the existing suite parks only the body and therefore
   cannot witness this.

## Provenance

- Spec measured against:
  `docs/spec_topics/pi-integration-contract/active-invocation-registry.md`
  (intro "in lock-step with each theta invocation"; *Registry contract* —
  Insertion "before any awaitable work", Removal, *Dispatch-site setup wrap*,
  Iteration order, *Per-mode concurrency invariants*);
  `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:10`
  (sub-step 2 "for every entry"), `:11` (sub-step 3 bounded await and its
  drain rationale), `:13` (sub-step 5 detach);
  `docs/spec_topics/cancellation.md` (§Forwarding — the `session_shutdown`
  trigger; §Granularity — the `binder-call` checkpoint; §Surfacing — the
  cancelled-binder note);
  `docs/spec_topics/pi-integration-contract/drain-state-contract.md:15`
  (PIC-29 pre-dispatch gate, PIC-30 no fourth arm);
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` (HC3-d: up to three
  binder LLM calls, i.e. the window's upper bound);
  `docs/spec_topics/pi-integration-contract/subagent.md` PIC-65/PIC-66 (the
  child kill listener that keys on `thetaAbort`).
- Implementation read at `d06daae3`:
  `src/extension/theta-composition-producer.ts:346`, `:357–358`, `:389`,
  `:398–401`, `:419`, `:433–441`;
  `src/extension/production-theta-producer.ts:655–700` (`runBinder` and its two
  bypass short-circuits), `:1512`, `:1521–1546`, `:1752–1775`, `:2255–2275`;
  `src/extension/session-shutdown.ts:448–465`, `:597`;
  `src/extension/factory.ts:628–655` (`drainGatedHandler`);
  `src/runtime/active-invocation-registry.ts:47–68`.
- Tests inspected: `tests/active-invocation-wiring.test.ts` (parks the *body*;
  witnesses the span over the body window and the sub-step-2 abort — green
  before and after any fix), `tests/session-shutdown.test.ts`,
  `tests/session-shutdown-wiring.test.ts`,
  `tests/e2e-s6-session-shutdown-real-teardown.test.ts`,
  `tests/binder-call-cancellation.test.ts` (binder checkpoint only). No
  committed cell drives a shutdown while an invocation is inside its binder
  window.
- Mechanical repro: scratch vitest
  (`tests/scratch-cancel-lifecycle.test.ts`, run at `d06daae3` and deleted);
  observed values quoted verbatim in §Reproduction.

## Fix (0.125.0)

- What shipped:
  - `src/runtime/active-invocation-registry.ts` — new exported
    `ActiveInvocationTicket` (`settleDisposeBarrier`, idempotent `finish`): the
    handle a completed dispatch-site insertion hands to the bind that continues
    the same invocation, so the bind reuses the entry instead of adding a second
    one (§Fix constraint 5).
  - `src/extension/production-theta-producer.ts` — `#openInvocationTicket`
    performs the registry-side setup steps (the `disposeBarrier` resolvers, the
    five-field entry with its `invocationId` minted through the PIC-20 `IdSource`
    seam, the `Set.add`) and returns the ticket; the new public
    `beginInvocation({ theta, thetaAbort })` is the pre-binder entry point
    §Fix constraint 4's second option names, keeping both the mint seam and the
    registry handle producer-side. `bindPromptConversation` and
    `spawnSubagentConversation` now take `bindInput.invocationTicket ??
    this.#openInvocationTicket(...)` and compose `finishInvocation` as
    `detachForwarding(); ticket.finish();`; the subagent teardown's
    `settleDisposeBarrier` is the ticket's. `#spawnSubagentFnSession` keeps its
    own insertion (out of scope).
  - `src/extension/theta-composition-producer.ts` — `composeThetaFixture.run`
    wraps the four setup steps as ONE block in its own `try`/`catch`
    (§Fix constraint 2): `createThetaAbort()` → `deps.beginInvocation?.(...)` →
    `forwardSlashCommandCancel(...)`, ahead of `await deps.runBinder(...)`
    (§Fix constraint 1). The catch runs the cleanup `thetaAbort?.abort()` inside
    a nested `try`/`catch` that drops its throw, finishes the ticket, then routes
    the originally captured throw to the runtime-defect surface. That surface is
    the newly extracted module-local `surfaceDispatchDefect`, the pre-existing
    top-level drive catch body moved verbatim so both routes frame one identical
    note. The ticket is threaded into the bind input and into the
    `driveSubagentRootRegime` input (whose `rootBindInput` spread makes the
    child-side bind reuse it). An outer `finally { invocationTicket?.finish(); }`
    finishes the moved entry on the binder-short-circuit and outer-catch paths
    (§Fix constraint 3); `finish` is idempotent, so the normal path still settles
    at `binding.finishInvocation()`'s documented moment and the `finally` is then
    a no-op. Removal stays where it was.
  - `tests/active-invocation-binder-window.test.ts` (new) — §Fix constraint 6's
    regression cells.
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a cell
    (`CELL-A`), no existing assertion touched.
- Gates:
  - Witness: `npx vitest run tests/active-invocation-binder-window.test.ts` —
    `Test Files 1 passed (1) / Tests 3 passed (3)`. RED at HEAD before the fix
    with the three symptom messages ("holds no registry entry … iterates an
    empty snapshot: expected +0 to be 1"; "returned without aborting the
    invocation parked in its binder window: expected false to be true"; "the
    theta body executed after the completed session_shutdown teardown: expected
    1 to be +0").
  - Full suite: `npm test` — `Test Files 326 passed (326) / Tests 5950 passed
    (5950)` (the 325/5947 fork baseline plus the three new cells).
  - `npm run typecheck` — clean, no output. `npm run lint` — clean, no output.
  - Live: `tests/live/acceptance/` — `Test Files 2 passed (2) / Tests 11 passed
    (11)` (the 11/11 fork baseline). `tests/live/live-production-acceptance.test.ts`
    — 61/61 including `CELL-A`; `-t "CELL-A"` alone `1 passed | 60 skipped`.
- Review: 1 round — `bug-fix-reviewer`: CLEAN, no finding in any category.
  Verdicts quoted per §Fix constraint, a walked double-insertion/leak proof over
  all nine dispatch paths, an arm-by-arm behaviour-preservation proof of the
  `surfaceDispatchDefect` extraction, and §Non-goals confirmed untouched. Its two
  residuals are recorded below.
- Verification: SOLID.
  - Witness reds for the right reason: neutralised by deleting the single
    `invocationTicket = deps.beginInvocation?.(...)` line (restoring the pre-fix
    ordering); 3/3 RED with the symptom messages, restored byte-exact
    (`git hash-object` `e1100ebaa723a95aa77bb77ee93de077ea443a16` before and
    after), 3/3 GREEN.
  - Full default suite green (326/5950).
  - Live coverage of the fixed path: both H9a acceptance files green (11/11);
    `CELL-A` red-proven in both directions under the same neutralisation (RED
    carried only the `bind_echo` success note, "the binder ran to completion
    instead").
  - Lint and typecheck clean.
- Residuals:
  1. The local `thetaAbort` in `composeThetaFixture.run` widened from
     `const thetaAbort = createThetaAbort()` to `let thetaAbort:
     AbortController | undefined`, because step 1 of the setup sequence now sits
     inside the wrap. `undefined` is unreachable past the wrap (the assignment is
     the wrap's first statement and every throw path returns), and the downstream
     optionality it relies on pre-dates this fix (`BinderRunInput.thetaAbort?`
     and `ConversationBindInput.thetaAbort?` are both optional at HEAD), but a
     future edit that made `undefined` reachable would let a bind mint a fresh
     controller against CANCEL-2's one-controller rule. Test cell (a) pins the
     invariant (`registry.snapshot()[0]?.thetaAbort === thetaAbortSeen()`), so
     such a regression reds rather than passing silently. The reviewer's named
     remedy, if a later change wants it tightened: extract the wrap into a
     module-local `openDispatchSetup(...)` returning
     `{ thetaAbort; invocationTicket? } | undefined`, then `if (setup ===
     undefined) return;` — non-optional past the wrap, no interface change.
  2. Insertion moved for the SLASH path only. The `tool.execute(...)` adapter and
     the `invoke` spawn site keep their bind-time insertion; §Fix constraint 1
     names the slash path concretely and §Affected / §Reproduction diagnose only
     the binder window. The nested-invoke pre-bind window is materially covered
     by the parent's own entry: a child's `thetaAbort` is derived downward from
     `parentSignal` (`deriveChildThetaAbort`), so a sub-step-2 abort of the
     parent cascades into a child whose entry does not yet exist.
  3. `CELL-A` completes in ~1.2 s, i.e. the forwarded abort lands at the
     pre-call `binder-call` checkpoint rather than mid-round-trip. It still
     discriminates the defect (its neutralised run went red with the binder
     having run to completion); the genuinely mid-await window is what the
     offline witness parks on.
  4. Stale `path:line` citations: this fix shifts line numbers inside
     `src/extension/theta-composition-producer.ts` and
     `src/extension/production-theta-producer.ts`, so pre-existing `path:line`
     citations into them (in `docs/bugs/*.md` and several committed test
     headers) drift. Disclosed, not chased — bug 0134 owns corpus-wide
     stale-citation drift. Every citation this fix ADDS names a symbol.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: §Non-goals is unchanged and was respected —
  the entry shape, the id minting, the removal site, sub-step 2's
  snapshot-then-iterate shape, `factory.ts`'s PIC-29/30/31 drain routing, and
  the binder's own cancellation plumbing are all untouched. No diagnostic code,
  registry row or `Trigger` was added or widened, so the DIAG-2 closed-registry
  obligation and H9a's empty-capture stderr gate need no edit (confirmed by the
  real H9a run: `tests/fixtures/h7a/permitted-codes.json` unchanged).
