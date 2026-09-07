---
id: pending
title: BinderCallResult's completed-arm `callCount` is computed and returned but no consumer reads it
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/binder-cancellation.ts:44-55
  - src/binder/binder-cancellation.ts:143
  - src/extension/production-theta-producer.ts:1096-1106
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# BinderCallResult's completed-arm `callCount` is computed and returned but no consumer reads it

## Observation

`runBinderCallWithCancellation` returns a `BinderCallResult` whose `completed`
arm carries three fields: `kind`, `callCount`, and `outcome`. The driver
maintains a `callCount` local (it doubles as the `attemptIndex` argument passed
to `attempt`) and publishes its final value on the returned record. The only
production consumer of that record — `runBinder` in
`production-theta-producer.ts` — reads `phase.value.kind` and
`phase.value.outcome` and never `callCount`. The paired witness test
(`tests/binder-call-cancellation.test.ts`) asserts on `result.kind` and
`result.note` only. Across src/, extensions/, tools/ and tests/ there is no
read of this field on any `BinderCallResult` value.

## Evidence

src/binder/binder-cancellation.ts:44-55 — the declared field and its
doc-comment:

```ts
 *   - `completed` — the binder chain settled without an abort. `outcome` is the
 *     V11f most-recent-attempt outcome that flows to the normal binder surfacing
 *     / theta-start path, and `callCount` is the number of binder LLM calls
 *     issued (1 … {@link MAX_BINDER_LLM_CALLS}).
 */
export type BinderCallResult =
  | { readonly kind: "cancelled"; readonly note: string }
  | {
      readonly kind: "completed";
      readonly callCount: number;
      readonly outcome: BinderAttemptOutcome;
    };
```

src/binder/binder-cancellation.ts:143 — the sole write of the field:

```ts
    return { kind: "completed", callCount, outcome };
```

src/extension/production-theta-producer.ts:1096-1106 — the only production
consumer of the returned record; it reads `kind` and `outcome` only:

```ts
    if (phase.value.kind === "cancelled") {
      // In-flight abort: the provider observed the forwarded `options.signal`.
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "cancelled" }, binderInput.invocationTicket);
      return { bound: false };
    }
```

```ts
    const outcome = phase.value.outcome;
```

Search: `grep -rn "callCount" src extensions tools tests --include=*.ts`
returns 24 hits total. Eleven are the two driver implementations' own locals and
declarations (src/binder/binder-cancellation.ts:46, 53, 106, 120, 121, 143;
src/binder/retry-taxonomy.ts:254, 282, 289, 290, 302). Seven are
`result.callCount` reads in tests/binder-retry-taxonomy.test.ts (lines 27, 80,
91, 103, 115, 116, 128), all against `BinderRetryResult` returned by
`runBinderWithRetries` in retry-taxonomy.ts — a different type from a different
module. The remaining six are an unrelated local counter in
tests/reload-debounce.test.ts (lines 296, 298, 299, 334, 336, 337). Zero hits
read `callCount` off a `BinderCallResult`.

## Why this is a problem

Dead code, proven dead at the field level: the value is produced on every
`completed` return and read by nobody — not by production, not by a witness
test, so the "tests are legitimate callers" carve-out does not apply. The
doc-comment at :44-47 advertises a documented output contract ("`callCount` is
the number of binder LLM calls issued (1 … `MAX_BINDER_LLM_CALLS`)") that no
code depends on, which means the invariant it states is unenforced and a
reader auditing the retry-budget bound is pointed at a field that cannot
witness it. Note the `callCount` *local* at :106/:120/:121 is live — it is the
`attemptIndex` the driver passes into `attempt` — so only the published field
is unread.

## Suggested direction (non-binding, optional)

Either drop the field from the `completed` arm, or give it the consumer its
doc-comment implies (the retry-budget bound is currently asserted only against
`runBinderWithRetries`, the sibling driver production does not use).

## False-positive check

- Identifier search: `grep -rn "callCount" src extensions tools tests
  --include=*.ts` — 24 hits, every one classified above; none reads the field
  on a `BinderCallResult`.
- Destructuring / dynamic access: `grep -rnE "\{[^}]*callCount[^}]*\} *="`
  across src/, extensions/, tools/, tests/ — no destructuring read; no
  string-keyed access (`["callCount"]`) anywhere in the tree.
- Re-export check: `grep -rn "export \*" src extensions tools --include=*.ts`
  returns nothing — there are no export-star barrels, so no indirect re-export
  path can introduce another consumer.
- Consumer enumeration: the single import of `runBinderCallWithCancellation` in
  production is src/extension/production-theta-producer.ts:214; its one call
  site (:1079) feeds `phase`, whose only reads are :1096 and :1106.
- Test-only-caller check: tests/binder-call-cancellation.test.ts reads only
  `result.kind` (:142, :143, :196, :197) and `result.note` (:146, :200) — grep
  for `callCount` in that file returns zero hits — so the field is not
  test-reachable either.
- Git-history intent: `git log -S "callCount" -- src/binder/binder-cancellation.ts`
  resolves to 09e1740c ("V11j — in-flight binder-call cancellation forwarding
  (cka-43)"), the implementation commit that introduced the field; no later
  commit added a consumer.

## Triage
