---
id: PTQ-0100
title: conversation-drive's header narrates a production pi.on cancel-forwarding subscription, but subscribePromptModeCancelForwarding has no production caller and no production module subscribes the five PIC-18 events
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/conversation-drive.ts:3-6
  - src/runtime/conversation-drive.ts:22-28
  - src/runtime/conversation-drive.ts:120-143
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# conversation-drive's header narrates a production pi.on cancel-forwarding subscription, but subscribePromptModeCancelForwarding has no production caller and no production module subscribes the five PIC-18 events

## Observation
The module header of `src/runtime/conversation-drive.ts` says the module owns
three things: the PIC-17 install-vector computation, "the process-global
`pi.on` cancel-forwarding subscription", and the PIC-53 trailing-turn
extraction. Its PIC-18 bullet states in present tense that "the driver
observes the five turn-lifecycle events through the factory-captured
`ExtensionAPI` `pi.on`". The first and third owned pieces are
production-consumed (`computeActiveSetInstall`, `extractTrailingTurnText`);
the subscription piece is not: `subscribePromptModeCancelForwarding` is called
only by one test file, no production module subscribes the five lifecycle
events for cancel-forwarding, and git history shows the function was never
production-wired since its introducing leaf.

## Evidence
src/runtime/conversation-drive.ts:3-6 (the ownership sentence):
```
// This module owns the PIC-17 active-set install-vector computation, the
// process-global `pi.on` cancel-forwarding subscription, and the untyped-query
// trailing-turn `Ok(string)` extraction
// (pi-integration-contract/conversation-drive.md):
```

src/runtime/conversation-drive.ts:22-28 (the present-tense driver claim):
```
//   - PIC-18 prompt-mode turn-lifecycle event subscription: the driver observes
//     the five turn-lifecycle events through the factory-captured `ExtensionAPI`
//     `pi.on`, process-global with no per-session origin marker, and uses them
//     ONLY to forward the active invocation's captured signal into the V17a
//     `thetaAbort` controller — never to resolve query completion.
```

src/runtime/conversation-drive.ts:120-124 (the subscription entry point):
```ts
export function subscribePromptModeCancelForwarding(
  eventApi: PromptModeEventApi,
  getActiveInvocation: () => ActiveInvocationSignals | undefined,
): void {
```

Reference searches (exact commands and hits):
- `grep -rln "subscribePromptModeCancelForwarding" src/ extensions/ tools/
  tests/` → src/runtime/conversation-drive.ts (definition) and
  tests/conversation-drive.test.ts (:341, :358). Zero production callers.
- Module importers: `grep -rn 'from "../runtime/conversation-drive"\|from
  "./conversation-drive"' src/` → production-theta-producer.ts:147 (imports
  `extractTrailingTurnText`, `computeActiveSetInstall`, `CallableSetInstall`
  per its :144-146 import list) and prompt-transport-mapping.ts:66
  (`extractTrailingTurnText`). Neither imports the subscription or its types.
- Five-event subscription elsewhere: `grep -rn '"agent_end"\|"tool_result"\|
  "tool_call"' src/` (excluding this module and cancellation-core) → one hit,
  prompt-tool-loop-governor.ts:119 `pi.on("tool_call", ...)`, which is
  tool-loop governance, not cancel-forwarding; `grep -rn "message_update\|
  turn_end" src/` outside this module → zero hits.
- Git intent: `git log --oneline -S "subscribePromptModeCancelForwarding" --
  src/` → two commits, `d7f25778 V9c-T` (tests + seam) and `68139757 V9c`
  (implementation); no later commit wired or unwired a production caller.

## Why this is a problem
Stale narration over a production-orphaned surface: the header claims the
module owns a subscription "the driver" performs, but no driver exists — the
production cancel path forwards `ctx.signal` directly at the handler level
(`forwardSlashCommandCancel` / `deriveChildThetaAbort`, cancellation-core.ts,
both production-imported by the producers), and nothing in src/ registers the
five-event cancel-forwarding handlers this module builds. A reader auditing
how a prompt-mode abort reaches `thetaAbort` is pointed at a subscription that
production never installs. This is the claim/current-code mismatch class
already filed for other modules (ceiling-arbitration's "consults this seam",
cancellation-core's "substrate shared by the four owning sites"), at a module
those findings do not cover.

## Suggested direction (non-binding, optional)
State the subscription half's actual status in the header (a test-witnessed
seam production does not currently install, with the production cancel path
named), or wire the production driver through it if PIC-18 is meant to be
live; choosing between those is the fix stage's call, and whether the missing
wiring is itself a defect is a correctness question outside this lens.

## False-positive check
- Deadness is NOT claimed: tests/conversation-drive.test.ts calls the function
  (:341, :358) and asserts the five registrations and the forward-on-abort
  behaviour, so under the witness-test rule the code is alive; the finding is
  scoped to the header's production-consumption narration.
- Dynamic access: no string-keyed or re-exported route to the function —
  `grep -rn "subscribePromptMode" src/ extensions/ tools/` finds only the
  definition; there is no barrel re-exporting conversation-drive.
- Sibling symbols checked so the claim is precise: `PROMPT_MODE_LIFECYCLE_EVENTS`,
  `PromptModeEventApi`, `ActiveInvocationSignals`, `PromptModeLifecycleEvent`
  are likewise referenced only by this module and its test — no production
  consumer reaches the subscription surface through any of them.
- Checked that PIC-18 cancel-forwarding is not realised under another name:
  grep for the five event literals across src/ (results above) shows no other
  subscription set; production forwarding is the direct-signal route
  (`forwardSlashCommandCancel` production callers:
  production-theta-producer.ts, theta-composition-producer.ts).
- Overlap check: no already-filed finding cites conversation-drive.ts
  (searched the intake list for the path — zero hits).

## Triage
verdict: confirmed — header :3-6 and the PIC-18 bullet :22-26 are verbatim (blame d7f25778, untouched since introduction) while subscribePromptModeCancelForwarding (:120-144) has zero production callers (only tests/conversation-drive.test.ts:341/:358; no barrel in src/runtime, no re-export from runtime-root.ts or extensions/index.ts, no string-keyed route, and siblings PROMPT_MODE_LIFECYCLE_EVENTS/PromptModeEventApi/ActiveInvocationSignals/PromptModeLifecycleEvent are likewise module+test only) and no src/ module registers the five events (only other five-literal hit is prompt-tool-loop-governor.ts:119 "tool_call" round-bounding; production forwards via forwardSlashCommandCancel at production-theta-producer.ts:2082/:5784 and theta-composition-producer.ts:458, and the agent_end trigger is transcript-poll derived at :5865-5869, not pi.on — even tests/extension-factory-harness.test.ts:254 hand-rolls its own pi.on("agent_end") to witness PIC-18); filed as narration cruft not deadness, in D2 scope per the confirmed checkpointed-for-loop sibling; two non-refuting imprecisions recorded: "no driver exists" overstates (the production prompt-mode driver does exist at production-theta-producer.ts:5602-5680, it merely installs no pi.on lifecycle handlers), and the overlap check's "zero hits" is wrong (qw20260907202646-d2-02 cites this same file at :13-17/:51-59) though that is the distinct PIC-17 install-vector claim on non-overlapping lines, so not a duplicate; bug 0416 named this seam an explicit non-goal, so no tracked issue covers it (triage: claude-opus-5)
