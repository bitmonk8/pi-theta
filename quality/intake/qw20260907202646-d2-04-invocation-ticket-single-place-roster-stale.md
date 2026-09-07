---
id: pending
title: "#openInvocationTicket is documented as the single place the registry-side setup runs and two docs enumerate two registration choke points, while #spawnSubagentFnSession runs a third inline copy"
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1977-1980
  - src/extension/production-theta-producer.ts:1989-1996
  - src/extension/production-theta-producer.ts:554-561
  - src/extension/production-theta-producer.ts:567-572
  - src/extension/production-theta-producer.ts:3126-3142
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# #openInvocationTicket is documented as the single place the registry-side setup runs and two docs enumerate two registration choke points, while #spawnSubagentFnSession runs a third inline copy

## Observation
`#openInvocationTicket` performs the active-invocation registry-side setup: the
resolver-capture construction of a `disposeBarrier`, the five-field
`ActiveInvocationEntry` with its `IdSource`-minted `invocationId`, and the
`add`. Four doc passages describe that setup as centralised in this one helper
and enumerate two registering choke points (`bindPromptConversation` /
`spawnSubagentConversation`). `#spawnSubagentFnSession` runs a second, inline
copy of the same sequence — same barrier construction, same five fields, same
`add`, plus the same `#trackForwardingSources` push — without going through the
helper, and is not named in any of the four passages.

## Evidence
src/extension/production-theta-producer.ts:1977-1980 — `beginInvocation`'s doc
calls the helper "the single place the registry-side setup runs":

```ts
   * ticket to the bind, so the entry's span covers the binder window too, not
   * only the body window the bind used to open on its own. Delegates to
   * `#openInvocationTicket`, which stays the single place the registry-side
   * setup runs so `invocationId` keeps minting through the producer's PIC-20
   * `IdSource` seam.
```

src/extension/production-theta-producer.ts:1989-1996 — the helper's own doc
names its sharers as `beginInvocation` plus "the bind methods below":

```ts
  /**
   * The registry-side half of the dispatch-site setup sequence
   * (active-invocation-registry.md §"Registry contract"): the
   * `Promise.withResolvers()` construction, the five-field entry (its
   * `invocationId` minted through the PIC-20 `IdSource` seam), and the
   * `Set.add`. Shared by `beginInvocation` (the pre-binder slash entry point)
   * and the bind methods below, whose own insertion becomes a no-op reuse of an
   * already-open ticket once one was handed in via `bindInput.invocationTicket`.
```

src/extension/production-theta-producer.ts:554-561 — the `activeInvocations`
field doc enumerates two choke points and four invocation types:

```ts
   * REAL entries. Each `bindPromptConversation` / `spawnSubagentConversation`
   * choke point registers one `ActiveInvocationEntry` here (covering all four
   * invocation types: top-level prompt/subagent + nested prompt/subagent
   * callees via `#driveCallee`). Absent on non-production harnesses, in which
   * case the choke points register nothing (the `?.` no-ops) — the pre-B1
   * behaviour.
```

src/extension/production-theta-producer.ts:567-572 — the `forwardingSignals`
field doc repeats the same two-choke-point roster and locates the detach in
`finishInvocation`:

```ts
   * at shutdown time. Each `bindPromptConversation` / `spawnSubagentConversation`
   * choke point pushes one `ForwardingSignalSource` per invocation-scoped
   * forward (the bind-time `ctx.signal` forward; the derived-child parent-invoke
   * listener) and splices+detaches them in `finishInvocation`, so only a
   * still-in-flight-at-shutdown invocation leaves entries for sub-step 5.
```

src/extension/production-theta-producer.ts:3126-3142 — the third choke point,
inside `#spawnSubagentFnSession`, running the sequence inline:

```ts
    // Decision 6 / Increment B1: register the in-flight invocation so the
    // factory's `session_shutdown` teardown operates on it; settle the barrier on
    // dispose (there is no child exit to observe on the in-process path).
    const activeInvocations = this.#input.activeInvocations;
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      disposeBarrier,
      shutdownReason: undefined,
      theta: overriddenTheta.slashName,
      invocationId: root.idSource.newInvocationId(),
    };
    activeInvocations?.add(entry);
    const detachForwarding = this.#trackForwardingSources(forwardingSources);
```

Search: `grep -n "activeInvocations?.add" src/extension/production-theta-producer.ts`
→ 2016 (inside `#openInvocationTicket`) and 3141 (inside
`#spawnSubagentFnSession`). `grep -n "#trackForwardingSources"` → 1838
(declaration), 2195 (`bindPromptConversation`), 2512
(`spawnSubagentConversation`), 3142 (`#spawnSubagentFnSession`). The
`#spawnSubagentFnSession` copy detaches in `dispose` (3147-3157), not in a
`finishInvocation`.

## Why this is a problem
Four doc passages state a centralisation and a roster the code contradicts:
"the single place the registry-side setup runs" has a second place, and "each
`bindPromptConversation` / `spawnSubagentConversation` choke point" is three
choke points, the third of which (a `subagent fn` session) is not one of the
"four invocation types" the `activeInvocations` doc enumerates either. A reader
auditing which in-flight invocations `session_shutdown` sub-steps 2/3/5 can
reach — the exact question these docs exist to answer — is told the answer is
`#openInvocationTicket` and gets an incomplete set. Mechanically the two
sequences are the same eight statements with one difference (the fn-session
copy has no `finish` closure and settles/removes from `dispose`). `git blame`
dates the inline copy to `4866d4d2` (2026-07-24, RFC 0006 v0.9.0) and the
"single place" sentence to `d62be25e` (2026-08-20, bug 0074 v0.125.0), so the
centralisation claim was written a month after the second copy existed.

## Suggested direction (non-binding, optional)
Either route `#spawnSubagentFnSession`'s registration through
`#openInvocationTicket` so the claim holds, or widen the four passages to name
the third choke point and its `dispose`-time removal.

## False-positive check
- Enumerated every registration site: `grep -n "ActiveInvocationEntry = {"` →
  2009 and 3134; `grep -n "activeInvocations?.add"` → 2016 and 3141;
  `grep -n "activeInvocations?.remove"` → 2026 and 3152. Two, not one.
- Enumerated every forwarding-sink push site: `grep -n "#trackForwardingSources"`
  → declaration 1838 plus call sites 2195, 2512, 3142. Three, not two.
- Verified `#spawnSubagentFnSession` is production-reachable, not harness-only:
  it is wired as `spawnSubagentFnSession` on all three
  `EffectfulStatementHostDeps` records this producer builds (2151, 2478, 3122),
  and `createEffectfulStatementHost` consumes it for the RFC-0001
  `subagent fn` spawn.
- Verified the claim is about narration, not dead code: both registry
  sequences run on live paths; nothing here is unreachable.
- Checked already-filed intake for this topic: the wave's producer findings on
  file cover line-citation drift, `isObjectValue`'s caller roster,
  `enumDeclaringPath`'s boundary count, `ExecuteBodyDeps` optionality rationale,
  and `ConversationBinding.effectHostDeps`; none mentions
  `#openInvocationTicket`, `activeInvocations` or `forwardingSignals`.
- Git intent: `git blame -L 1989,2003` → `d62be25e` (2026-08-20, "fix(bug-0074):
  move the slash-dispatch registry insertion ahead of the binder await —
  v0.125.0"); `git blame -L 3126,3142` → `4866d4d2` (2026-07-24, "feat:
  child-process theta execution (RFC 0006) — v0.9.0"). The doc post-dates the
  second copy, so this is a claim written past the code rather than drift from
  a later edit.

## Triage
