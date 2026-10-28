---
id: PTQ-1721
title: The host-loop read-back comment still describes its transcript as discarded.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-host-loop-dispatch.ts:552-554
  - src/extension/production-host-loop-dispatch.ts:29-32
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The host-loop read-back comment still describes its transcript as discarded.

## Observation
The comment above host-loop tool-result read-back calls the session transcript “discarded.” The module header instead states that the child's session is persisted as an operator log and that prompt-mode dispatch uses the user's live session. The read-back comment retains the earlier disposal description after the child-session policy changed.

## Evidence
The read-back comment applies its disposal description without a mode or sessionless-parent qualification.

`src/extension/production-host-loop-dispatch.ts:552-554`:
```ts
        // Read the appended toolResult back from the (discarded) transcript.
        const entries = host.ctx.sessionManager.getEntries();
        for (let i = entries.length - 1; i >= entriesBefore; i--) {
```

The same module documents the current session policy:

`src/extension/production-host-loop-dispatch.ts:29-32`:
```ts
// Costs (a fabricated turn + a temporary model switch) land in whichever
// session backs the dispatch, per PIC-64: the child's private
// session in subagent mode (persisted as an operator log, bug 0489); the user's live session in prompt
// mode (the stated, accepted cost of the zero-token code channel).
```

## Why this is a problem
This is historical narration left in a current-code explanation. The read-back comment says the transcript is discarded while the module's session-policy description explicitly says it is persisted or belongs to the user's live session. The mismatch concerns the explanation of the code, not the persistence mechanism or its deliberate fallback policy.

## Suggested direction (non-binding, optional)
Bring the read-back explanation into agreement with the module's current session policy.

## False-positive check
`rg -n 'discarded|persisted as an operator log' src/extension/production-host-loop-dispatch.ts` returns exactly two matching lines, the two descriptions quoted above. `git blame -L 552,552 src/extension/production-host-loop-dispatch.ts` dates the read-back comment to commit `22306e5d4`. `git log -2 --oneline -S 'persisted as an operator log' -- src/extension/production-host-loop-dispatch.ts` and `git show 1dd79e5e -- src/extension/production-host-loop-dispatch.ts` show bug 0489 changed the header from a discarded `--no-session` child session to a persisted operator log, leaving this read-back comment unchanged. A sessionless-parent fallback does not make an unconditional disposal description correct for the persisted-child and live-parent cases named by the header. No production behavior, test, or documentation change is alleged.

## Triage
verdict: confirmed — Both excerpts and all stated searches/history checks reproduce: commit 1dd79e5e replaced the discarded-child policy with persisted operator logs but left line 552 unchanged; production-composition.ts:1484-1486 wires the same read-back to live parent and child contexts, and subagent-spawn-regime.ts:601-605 carries the persisted child session path. This is mechanically demonstrated stale production commentary within D2, not a behavior change; no existing finding tracks this root cause. (triage: claude-opus-5-5)
