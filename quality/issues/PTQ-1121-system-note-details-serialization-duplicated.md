---
id: PTQ-1121
title: System-note `details` serialization duplicated between factory-local and production channels
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/factory.ts:759-769
  - src/extension/production-composition.ts:4478-4488
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# System-note `details` serialization duplicated between factory-local and production channels

## Observation
The system-note `pi.sendMessage` serialization that implements bug 0401 ("informational notes omit `details` on the wire") exists in two places under `src/extension/`. The factory-local note channel built during `session_start` in `factory.ts` contains a block whose inline comment explicitly says it "Mirror[s] buildSystemNoteDeps's serialization". The mirrored source, `buildSystemNoteDeps` in `production-composition.ts`, contains the same conditional `details` spread. Both blocks are live and are reached by distinct note-channel paths.

## Evidence

`src/extension/factory.ts:759-769`:
```typescript
              // Mirror buildSystemNoteDeps's serialization: an informational
              // note (bug 0401) omits `details` on the wire entirely.
              pi.sendMessage(
                {
                  customType: message.customType,
                  content: message.content,
                  display: message.display,
                  ...(message.details !== undefined ? { details: message.details } : {}),
                },
                { triggerTurn: false },
              );
```

`src/extension/production-composition.ts:4478-4488`:
```typescript
        // Bug 0401: informational notes omit `details` on the wire, preserving
        // the details-absent contract (`"details" in note` === false) breaks
        // on the real host wire.
        pi.sendMessage(
          {
            customType: SYSTEM_NOTE_CHANNEL,
            content: message.content,
            display: message.display,
            ...(message.details !== undefined ? { details: message.details } : {}),
          },
          { triggerTurn: false },
        );
```

Diff verdict: renamed-only. The only material difference is the `customType` value: `message.customType` in the factory-local adapter versus `SYSTEM_NOTE_CHANNEL` in `buildSystemNoteDeps`. Clone-map group id: G072, 62 tokens.

## Why this is a problem
The bug 0401 contract is load-bearing. Consumers distinguish informational notes from notes that carry details by testing `"details" in note`; the wire shape must therefore omit the `details` key entirely when it is absent. If one copy is changed and the other is not, the same note content will serialize differently depending on whether it travels through the factory-local channel or the production-composition channel, breaking the wire contract. The `factory.ts` comment explicitly acknowledges that it is mirroring `buildSystemNoteDeps`, so the two copies are intended to stay in lock-step.

## Suggested direction (non-binding, optional)
The natural shared home is the system-note channel runtime module that already owns the channel contract. A single helper that owns the one serialization shape could be called by both the factory-local adapter and `buildSystemNoteDeps`.

## False-positive check
- Re-verified both copies at the cited line ranges; both are live code reached by active note-send paths.
- Searched `src/` for the conditional spread pattern `message.details !== undefined ? { details: message.details } : {}`: exactly these two occurrences, confirming the clone map is complete for this pattern.
- Git history (`git log -L`): `production-composition.ts` acquired the conditional spread in commit `3742e17c` (fix bug-0437); `factory.ts` acquired it in commit `daeb9a0a` (fix bug-0451/bug-0453). The duplication is real and the fix history shows the contract was maintained separately in both places.
- Not a spec-normative vector table; not tests; not generated.

## Triage
verdict: confirmed — independently re-verified: both code excerpts reproduce verbatim at the cited lines (factory.ts:759-769 sendMessage adapter inside `liveLocalNoteChannel`, production-composition.ts:4478-4488 inside `buildSystemNoteDeps`; the filing's production comment excerpt is slightly compressed but the code is byte-exact), `clone-scan.mjs map --files factory.ts` reports exactly G072 — 62 tokens — renamed-only at those two ranges, src/-wide grep for the conditional spread literal hits exactly these two src files (a third hit is tests/helpers/e2e-s1.ts:1000, out of D4 src scope), both copies are live (factory.ts:490 reads `liveLocalNoteChannel` as the `systemNoteChannel` fallback; `buildSystemNoteDeps` has three callers at production-composition.ts:928/2073/4729), git history confirms 3742e17c (bug-0437) and daeb9a0a (bug-0451/0453) as the respective origins, the stated breakage (bug 0401 `"details" in note` wire contract diverging per channel path) is mechanical and the factory comment explicitly declares lock-step intent; not a spec vector table; not a duplicate — PTQ-0326 covers the SYSTEM_NOTE_CHANNEL constant and PTQ-0643/0677 cover test-side recording doubles, no tracked row cites this serialization block; fixer note: system-note-channel.ts:419-427 `sendSystemNote` carries a third variant of the same shape (with `normaliseDetailsFileSpelling`) that a shared helper in that module could naturally absorb (triage: claude-fable-5-1)
