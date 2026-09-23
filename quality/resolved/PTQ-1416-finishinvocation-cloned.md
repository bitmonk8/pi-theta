---
id: PTQ-1416
title: finishInvocation idempotent cleanup closure duplicated in prompt and subagent conversation bindings
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:2475-2481
  - src/extension/production-theta-producer.ts:2597-2603
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923023517
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# finishInvocation idempotent cleanup closure duplicated in prompt and subagent conversation bindings

## Observation
`src/extension/production-theta-producer.ts` constructs a conversation binding for both prompt-mode (`bindPromptConversation`) and subagent-mode (`spawnSubagentConversation`). Each binding creates an idempotent `finishInvocation` closure that detaches forwarding signal sources and finishes the shared invocation ticket. The two closures are byte-identical except for their local variable name.

## Evidence

Location 1 — `bindPromptConversation`, lines 2475-2481:

```typescript
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      ticket.finish();
    };
```

Location 2 — `spawnSubagentConversation`, lines 2597-2603:

```typescript
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      ticket.finish();
    };
```

Diff verdict: identical. The four-line closure body is a byte-identical copy; only the surrounding comments and the binding context differ. No clone-map group id applies (`clone-scan map` reports no groups for this file).

## Why this is a problem
This is load-bearing duplication. The closure implements a shared lifecycle invariant: a conversation binding can be torn down exactly once, its forwarding sources must be detached to avoid leaking listeners on the shared emission sink, and the active-invocation ticket must be finished. If one copy is changed (for example, to omit `detachForwarding()`, to call `ticket.finish()` before detaching, or to remove the idempotency guard) and the other is not, prompt-mode and subagent-mode invocations will diverge in cleanup behavior. Leaked forwarding sources or a double-finished ticket can break session-shutdown ordering and the execution-status bus's child-node bookkeeping.

## Suggested direction (non-binding, optional)
The natural shared home is a small module-level helper in `src/extension/production-theta-producer.ts` that accepts `finished`, `detachForwarding`, and `ticket` and returns the idempotent closure. Both `bindPromptConversation` and `spawnSubagentConversation` would use it. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/extension/production-theta-producer.ts` has `(no clone groups)` in the provided clone-scan map.
- Both copies live: `bindPromptConversation` is the prompt-mode binding entry point; `spawnSubagentConversation` is the subagent-mode binding entry point.
- Dead-code check: both closures are returned in the binding object and are invoked from `drive()` `finally` blocks and defensive callers.
- Deliberate-mirror check: no comment claims the two binding modes intentionally implement cleanup differently; both cite the same ticket/finishing contract.
- Not tests/: both locations are production code under `src/extension`.
- Not generated: hand-authored TypeScript.
- Already-filed check: no existing D4 issue cites these two `finishInvocation` closures; the related subagent-root/fn parallel intake (qw20260922211400-d4-01) concerns child-side envelope drives, not the parent-side binding cleanup closures.

## Triage
verdict: confirmed — both excerpts reproduce one line up (2474-2479 in bindPromptConversation, 2596-2601 in spawnSubagentConversation) and the clone is in fact 8 byte-identical lines (`const detachForwarding = this.#trackForwardingSources(forwardingSources); let finished = false;` plus the closure), hand-diffed identical since clone-scan map re-run reports `(no clone groups)` for the file (below its threshold); both copies live — each is returned in the binding object (2485, 2639) and called from drive `finally` blocks and `binding.finishInvocation?.()` sites (2783, 2843, 3302, 3540, 3887, 5137, 5207); the stated breakage is real, not incidental — the #trackForwardingSources doc (1998, 2165) pins the same detach-once/finish-once contract for both bindings; not a duplicate — PTQ-1168/1188/1288 (resolved) and PTQ-1285 are D9 breakdown inventories that list finishInvocation as a phase, none files the cross-binding clone; note for the fixer: the suggested helper cannot take `finished` as a parameter (it is a by-value local) — a private method owning the flag and returning the closure is the mechanical dedupe (triage: claude-fable-5-1)
