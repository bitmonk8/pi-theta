---
id: PTQ-1731
title: dispatchForcedRespondTurn rejects auth failures that dispatchFinalization returns as transport errors.
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/off-session-respond-dispatch.ts:239-249
  - src/extension/off-session-finalization.ts:137-145
  - src/extension/live-prompt-query-driver.ts:1367-1370
sites: 3
fix_scope: module
d6_class: posture-divergence
d6_anchor: pi-sdk-boundary
wave: qw20261028153325
reported_by: lens-d6-errorposture (openai/gpt-6.1-sol)
date: 2026-10-28
---

# dispatchForcedRespondTurn rejects auth failures that dispatchFinalization returns as transport errors.

## Observation
The ordinary forced-respond dispatcher awaits `respond.auth()` outside its provider-call catch, so a rejected auth resolution rejects the dispatch promise instead of returning a `ForcedRespondTurn`. The finalization dispatcher catches rejection of the same auth operation and returns a structured transport failure. For typed finalization, the live driver passes its existing respond context as the finalization context, including the same auth callback. This is a divergence in handling an auth-resolution rejection, not a comparison between missing optional credentials and a failed provider response.

## Evidence

**Divergent side — `src/extension/off-session-respond-dispatch.ts:239-249`:**

```typescript
  const model = respond.model;
  const provider = String(model.api);
  const tool: Tool = respondToolEntry(respond);
  const auth = await respond.auth();
  // Bug 0481: at most TWO dispatches — the forced one, plus ONE degraded
  // re-issue (toolChoice omitted) when the provider rejects forcing at the
  // MODEL level (`isForcedToolChoiceRejection` over the raw resolved-failure
  // errorMessage). Stateless across dispatches: a repair restart re-forces
  // first, exactly like a fresh query.
  let degraded = false;
  for (;;) {
```

**Structured-error sibling — `src/extension/off-session-finalization.ts:137-145`:**

```typescript
  async function attempt(): Promise<FinalizationTurn> {
    let auth: Awaited<ReturnType<FinalizationDispatchContext["auth"]>>;
    try {
      auth = await context.auth();
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — finalizer auth resolution failure
      void thrown;
      if (controller.signal.aborted || signal.aborted) return fail("cancelled");
      return fail("request authentication could not be resolved");
    }
```

The right-side anchor is `pi-sdk-boundary`, quoted verbatim at that catch: `// allow-broad-catch: pi-sdk-boundary — finalizer auth resolution failure`. The bounded-output-finalization clause in `docs/spec_topics/pi-integration-contract/conversation-drive.md#bounded-output-finalization` also states: “Finalization failure is an honest nonretryable recovery `transport` error (fixed prefix `query output finalization failed: `), never a schema-valid manufactured verdict.” The finding does not challenge that recovery posture or require its message on the ordinary path.

**Sibling relationship — `src/extension/live-prompt-query-driver.ts:1367-1370`:**

```typescript
    const context = this.#respond ?? this.#finalizationContext;
    if (context === undefined) return Promise.resolve(finalizationFailure(this.#provider, "no finalization dispatch context"));
    this.#finalizationResult = dispatchFinalization({ context, ...(this.#respond !== undefined ? { respond: this.#respond } : {}), evidence,
      query: this.#queryText, signal: this.#thetaAbort.signal, clock: this.#clock,
```

For a typed query, `context` is the existing `this.#respond`; mechanically both dispatchers invoke that object's auth callback before attempting `complete()`. The compared failure class is rejection of this shared asynchronous request-auth resolution, before provider response interpretation or business-payload validation can differ.

An isolated scratch probe at `/tmp/d6-auth-posture.PpK75V/probe.ts`, run with `./node_modules/.bin/vite-node /tmp/d6-auth-posture.PpK75V/probe.ts`, supplied the same callback throwing `Error("D6_AUTH_RESOLVER_REJECTED")` to both exported dispatchers. Exit status was 0: ordinary dispatch rejected with the original error object (`sameError: true`); finalization fulfilled with `{kind:"transport", error:{kind:"transport", message:"query output finalization failed: request authentication could not be resolved", http_status:null, provider:"openai-responses", retryable:false}}`. The callback ran twice, once for each path; neither reached provider dispatch. This probe demonstrates the posture difference, not a claim about an observed credential-store incident.

## Why this is a problem
The `pi-sdk-boundary` sibling keeps failure of request-auth resolution inside the dispatcher's structured query-error channel. Ordinary forced respond instead exits its `Promise<ForcedRespondTurn>` through rejection for the same operation, so consumers cannot handle that failure through the returned transport arm. Whether an auth rejection is a returned query failure or an exception consequently depends on whether the query is submitting its ordinary response or finalizing unavailable output, despite sharing the auth collaborator. This finding is about that exception-versus-error-value boundary, not the existence of authentication failures or the recovery-specific no-repair policy.

## False-positive check

- **EXST-9/PIC-73 class check:** Read EXST-9 in `docs/spec_topics/execution-status.md` and PIC-73 in `docs/spec_topics/pi-integration-contract/capability-probe.md`. Request-auth resolution is neither an execution-status sink/producer hook nor an optional UI/entry capability. The optional-presence rationale on `resolveRegistryAuth` concerns an absent `getApiKeyAndHeaders`, not rejection of an invoked callback; absence is not the compared case.
- **Allow-broad-catch token check:** The cited auth catch is annotated `pi-sdk-boundary` and acts on the rejection by returning transport. The ordinary auth await has no enclosing catch in its dispatcher. No unannotated broad catch or swallowed-error allegation is involved.
- **Stated-rationale check:** Read the comments at both sites, the optional-auth comment in the ordinary dispatch module, bug 0010's “Respond model + options” account, and bug 0500's “Unavailable output, conservatively” account. The recovery's one-shot/no-repair rationale explains its terminal transport policy, not why the same auth rejection would leave the ordinary dispatch result channel. Bug 0500 explicitly preserves the same model/registry-auth policy. `git log -5 --format='%h %s' -- src/extension/off-session-finalization.ts src/extension/off-session-respond-dispatch.ts` and blame of the cited auth lines identify the finalization addition in `e071eada` and the existing ordinary await in extraction commit `bd3d6b8e`; no intent to use exceptions for ordinary auth rejection is stated in these cited accounts.
- **Sibling-reality check:** The live-driver excerpt passes the existing typed respond object directly to finalization. The scratch probe invokes both current exported dispatchers with the same rejecting auth callback and observes different promise settlements before provider work. The comparison does not depend on the degraded/unlowerable-schema arm, a fabricated missing stop reason, or an impossible exhaustion state.
- **Duplicate check:** `rg -l --glob '!qw20261028153325-d6-01-forced-respond-auth-rejection.md' 'respond\.auth\(|request authentication could not be resolved|finalizer auth resolution failure' quality/intake quality/issues quality/resolved | wc -l` returned **0 matching files** in this session before filing.

## Triage
verdict: confirmed — Both dispatchers invoke the same typed respond auth callback, but the ordinary await at off-session-respond-dispatch.ts:242 escapes its catch while finalization catches rejection at :139-145 and returns transport, anchored by pi-sdk-boundary and the bounded-output-finalization clause. The rerun probe reproduced original-error rejection versus structured transport fulfillment; stated searches/history reproduced, no duplicate was found, and EXST-9, PIC-73 and the optional-auth rationale do not exempt callback rejection. (triage: claude-opus-5-5)
