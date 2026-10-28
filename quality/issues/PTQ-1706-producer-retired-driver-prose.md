---
id: PTQ-1706
title: production-theta-producer.ts still describes the removed off-session subagent-fn query driver.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:1013-1022
  - src/extension/production-theta-producer.ts:1028-1035
  - src/extension/production-theta-producer.ts:1074-1085
  - src/extension/production-theta-producer.ts:1100-1103
  - src/extension/production-theta-producer.ts:1229-1237
  - src/extension/production-theta-producer.ts:1057-1064
sites: 5
fix_scope: module
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# production-theta-producer.ts still describes the removed off-session subagent-fn query driver.

## Observation
Five comment blocks in the query-construction path describe live and off-session query drivers as current collaborators. They assign the off-session driver a held conversation, a repair path, and respond-tool servicing. The implementation constructs `LivePromptQueryModel` and delegates repair to that model; its adjacent RFC 0012 comment explicitly states that the sibling driver is gone. The off-session forced respond dispatch remains part of the live driver's operation and is not the removed sibling described by these comments.

## Evidence
Stale collaborator description, `src/extension/production-theta-producer.ts:1013-1022`:
```ts
    // Bug 0010 (QRY-14 step 2): the typed query's respond-turn machinery —
    // the PIC-44-registered one-shot respond tool, the theta-resolved respond
    // model with auth/signal threading, the QRY-15 template, and the
    // early-respond capture host. Built for BOTH drivers (increment D): the
    // live driver forces the respond dispatch off-session after its
    // session-driven free phase; the off-session driver (`subagent fn`) runs
    // the same two-phase shape over its HELD conversation. Only the degraded
    // arm (`lowered === undefined`) builds no context.
    const respond =
      lowered !== undefined ? this.#buildRespondTurnContext(lowered, deps) : undefined;
```

Stale two-driver explanation, `src/extension/production-theta-producer.ts:1028-1035`:
```ts
    // WHY two text shapes (bug 0010): the restored two-phase path — live AND
    // off-session (increment D) — opens its free phase with the RENDERED QUERY
    // TEMPLATE BODY ONLY (QRY-14 step 1 — no JSON-only instruction, no inlined
    // schema; the shape is conveyed by the respond tool's parameters and the
    // QRY-15 template instead). The fused typed-aware text REMAINS only for
    // the degraded arm (`lowered === undefined`: an unlowerable annotation),
    // where the old fused-turn + text-parse fallback keeps typed behaviour
    // total.
```

Stale repair arm and its current implementation, `src/extension/production-theta-producer.ts:1074-1085`:
```ts
    //  - OFF-SESSION TYPED (increment D): the same restart over the HELD
    //    conversation — the QRY-12 follow-up joins it as a user message, the
    //    free-phase tool loop re-runs with a fresh budget, then a fresh forced
    //    respond dispatch terminates the attempt.
    // Only `#buildTypedValidation` consults this closure, and it is built only
    // when `lowered !== undefined` — which implies `respond !== undefined`, so
    // no respond-less (degraded) follow-up drive is reachable. Untyped queries
    // build no validation collaborator at all.
    const driveFollowUp = (
      prompt: string,
    ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> =>
      liveModel.driveRepairAttempt(prompt);
```

Stale two-driver budget explanation, `src/extension/production-theta-producer.ts:1100-1103`:
```ts
    const config: QueryToolLoopConfig = {
      // Bug 0010: the restored two-phase path — live AND off-session
      // (increment D) — runs its free phase under the REAL
      // `tool_loop.max_rounds` cap (CIO-4). The `typed ? 0` collapse SURVIVES
```

Stale method header, `src/extension/production-theta-producer.ts:1229-1237`:
```ts
  /**
   * Bug 0010 (QRY-14 step 2): assemble the typed query's `RespondTurnContext`
   * — register (or cache-hit) the synthesised respond tool, resolve the
   * respond model, and close over auth / AJV / the early-respond capture
   * slot. Shared by BOTH drivers (increment D): the live driver arms the
   * capture host around its session turns; the off-session driver services
   * respond-tool calls itself over its held conversation and never arms it.
   */
  #buildRespondTurnContext(
```

Current driver construction and explicit retirement statement, `src/extension/production-theta-producer.ts:1057-1064` (supporting evidence, not another stale-comment occurrence):
```ts
    const liveModel = new LivePromptQueryModel(
      this.#buildLiveModelOptions(deps, queryText, activeTools, maxRounds, respond),
    );
    // RFC 0012 §10 (D4): the live driver is the ONLY query driver. The
    // off-session sibling that served the in-process `subagent fn` body is
    // gone with that path — a `subagent fn` body now runs in its own child,
    // whose queries are that child's live turns.
    const model: QueryModelDriver = liveModel;
```

## Why this is a problem
This is stale collaborator narration: the five blocks document a driver and execution arm removed from the production path, while the current construction and repair delegation expose only the live driver. In particular, the method header still assigns respond-tool servicing to an absent collaborator. The mismatch is between the prose and the implementation, not an objection to either the live two-phase mechanism or its off-session forced respond dispatch.

## Suggested direction (non-binding, optional)
Align these collaborator descriptions with the current single-driver path while retaining the distinction between live free-phase turns and off-session forced respond dispatch.

## False-positive check
- Reference search: `rg -n 'OffSessionQueryModel|offSessionComplete' src extensions tools tests` returned zero hits. This checks identifier mentions, including quoted/string-keyed references and re-exports; no declaration is being proposed for deletion.
- Current-path check: the construction at lines 1057-1064 and repair delegation at lines 1082-1085 explicitly use `LivePromptQueryModel`; the five counted prose occurrences are all quoted above.
- Intent/history check: `git log --oneline -S 'off-session sibling that served' -- src/extension/production-theta-producer.ts` identifies `89faa7c5`. `git show --stat 89faa7c5 -- src/extension/production-theta-producer.ts` records RFC 0012 step 7, explicitly naming removal of `OffSessionQueryModel` and `offSessionComplete` and stating that `#resolvePromptQuery` always builds `LivePromptQueryModel`. These comments are not placeholders for restoring that driver.
- Existing-report check: `rg -l 'no cross-invocation mutable|holds only its injected|off-session sibling that served|Shared by BOTH drivers|Built for BOTH drivers' quality/intake quality/issues quality/resolved --glob '*.md'` returned zero files before filing. PTQ-1540 concerns dated bug-record witness pointers, not these current production-code collaborator descriptions; no change to those records or their witnesses is proposed here.
- Test reachability is not used as a deadness argument. The surviving off-session forced respond dispatch is expressly excluded from the observation.

## Triage
verdict: confirmed — All five comment excerpts reproduce and describe the sibling driver removed by 89faa7c5; current construction and repair delegation use only LivePromptQueryModel, and OffSessionQueryModel/offSessionComplete have zero references across src/extensions/tools/tests. The surviving off-session forced respond dispatch is distinct; no existing report tracks these production comments (PTQ-1540 concerns dated bug-record witnesses). (triage: claude-opus-5-5)
