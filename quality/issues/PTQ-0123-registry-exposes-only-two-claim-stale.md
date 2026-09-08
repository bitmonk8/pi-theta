---
id: PTQ-0123
title: active-invocation-registry's header says the module "exposes only the entry shape and the registry container" and enumerates two members, while it also exports the ActiveInvocationTicket interface
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/active-invocation-registry.ts:3-19
  - src/runtime/active-invocation-registry.ts:38-68
  - src/extension/production-theta-producer.ts:2003-2016
  - src/extension/theta-composition-producer.ts:335-338
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# active-invocation-registry's header says the module "exposes only the entry shape and the registry container" and enumerates two members, while it also exports the ActiveInvocationTicket interface

## Observation
The module header of `src/runtime/active-invocation-registry.ts` opens with a
two-item bullet list of what the module owns (the five-field entry, the
`Set`-backed registry) and closes with "This module therefore exposes only the
entry shape and the registry container." The file has three top-level exports:
`ActiveInvocationEntry` (:30), `ActiveInvocationTicket` (:48), and
`ActiveInvocationRegistry` (:75). `ActiveInvocationTicket` is a four-member
interface that is neither the entry shape nor the registry container, and it is
a live production surface: `#openInvocationTicket` returns one and the
composition producer's `beginInvocation` seam is declared to return one.

## Evidence
src/runtime/active-invocation-registry.ts:3-19 — the enumeration and the
"exposes only" sentence:

```ts
// This module owns the extension-instance-scoped registry of in-flight theta
// invocations (active-invocation-registry.md §"Active invocation registry"):
//
//   - the five-field entry `{ thetaAbort, disposeBarrier, shutdownReason, theta,
//     invocationId }` (the `disposeBarrier` resolver is closure-scoped at the
//     producer's bind choke point, not a sixth field);
//   - the `Set`-backed registry whose iteration is **insertion order** (the V8
//     `Set` invariant the `session_shutdown` teardown handler relies on), with an
//     entry-count probe seam so tests assert on observable side effects rather
//     than the internal symbol (the registry name is internal).
//
// The dispatch-site setup and the per-invocation `finally` are owned by the
// producer's bind choke points (production-theta-producer.ts), which register
// and remove entries directly and settle each entry's `disposeBarrier` inline —
// subagent-mode teardown settles on observed child-process exit (RFC-0005), not
// on an in-process `AgentSession.dispose()`. This module therefore exposes only
// the entry shape and the registry container.
```

src/runtime/active-invocation-registry.ts:38-68 — the third export the sentence
does not admit (member docs elided; declaration lines verbatim):

```ts
export interface ActiveInvocationTicket {
  readonly settleDisposeBarrier: () => void;
  readonly finish: () => void;
  readonly invocationId: string;
  readonly theta: string;
}
```

src/extension/production-theta-producer.ts:2003-2016 — the ticket is a
production return type, not an unused declaration:

```ts
  #openInvocationTicket(theta: string, thetaAbort: AbortController): ActiveInvocationTicket {
    const activeInvocations = this.#input.activeInvocations;
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
```

src/extension/theta-composition-producer.ts:335-338 — the composition seam
declares the ticket as its return type:

```ts
  beginInvocation?(input: {
    readonly theta: ThetaCompositionInput;
    readonly thetaAbort: AbortController;
  }): ActiveInvocationTicket;
```

## Why this is a problem
Historical narration: the "exposes only the entry shape and the registry
container" sentence and the two-item bullet list were accurate for the module's
surface when they were written, and stopped being accurate when a third export
landed in the same file. `git log -S "exposes only" -- src/runtime/active-invocation-registry.ts`
returns one commit, `fda23a4b` ("feat: child-process subagent sessions (RFC
0005) — v0.8.0"); `git log -S "ActiveInvocationTicket" -- src/runtime/active-invocation-registry.ts`
returns one commit, `d62be25e` ("fix(bug-0074): move the slash-dispatch registry
insertion ahead of the binder await — v0.125.0"), i.e. the ticket was added
after the sentence and the sentence was not revised. A reader taking the header
at its word looks for the handle type elsewhere.

## Suggested direction (non-binding, optional)
Either extend the header's bullet list and closing sentence to admit the ticket
handle, or drop the "exposes only" clause; comment-only either way.

## False-positive check
- Export inventory: `grep -n "^export" src/runtime/active-invocation-registry.ts`
  → three hits (`ActiveInvocationEntry` :30, `ActiveInvocationTicket` :48,
  `ActiveInvocationRegistry` :75). The claim counts two.
- Reachability of the ticket: `grep -rn "\bActiveInvocationTicket\b" --include=*.ts src extensions tools`
  → production-theta-producer.ts:102 (import), :1473, :1985, :2003;
  theta-composition-producer.ts:60, :154, :218, :338, :454. It is not a dead
  export whose deletion would restore the sentence, and it is not test-only.
- Git intent: the two `git log -S` runs quoted above show the sentence predates
  the ticket export.
- Duplicate check: `grep -rl "active-invocation-registry.ts" quality/intake/`
  → no finding cites this file. The already-filed
  qw20260907202646-d2-04-invocation-ticket-single-place-roster-stale cites only
  production-theta-producer.ts lines and concerns a different claim (which
  helper performs the registry-side setup), not this module header's export
  enumeration.
- Behaviour: comment text only; no code, test, or tool reads these strings —
  `grep -rn "the entry shape and the registry container" src tests docs tools extensions`
  returns exactly one hit, src/runtime/active-invocation-registry.ts:19.

## Triage
verdict: confirmed — verified: `grep -n "^export"` gives three exports (:30, :48, :75) against the header's two-item list and "exposes only" sentence at :19; blame dates the sentence to fda23a4b (2026-07-24) and `ActiveInvocationTicket` to d62be25e (2026-08-20), and the ticket is live production surface (producer :1985/:2003, composition seam :338), not dead or test-only; distinct from d2-04, which targets the producer's "single place" roster. (triage: claude-opus-5)
