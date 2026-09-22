---
id: pending
title: LivePromptQueryModel.#driveUserVisibleTurn sequences the pre-send gate, model refusal, governor arming, gate/window deps construction, send, three poll phases, a bounded idle race, and two finally unwinds in one 330-LOC body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/live-prompt-query-driver.ts:715-1044
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/live-prompt-query-driver.ts#LivePromptQueryModel.#driveUserVisibleTurn
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# LivePromptQueryModel.#driveUserVisibleTurn sequences the pre-send gate, model refusal, governor arming, gate/window deps construction, send, three poll phases, a bounded idle race, and two finally unwinds in one 330-LOC body

## Observation

`#driveUserVisibleTurn` (src/extension/live-prompt-query-driver.ts:715-1044) is 330 LOC — strong band for a function. It issues one streamed user-visible turn: it gates on session idleness, refuses an unresolvable `model:`, arms the tool-loop governor, builds the active-set-gate and model-window dep objects, arms the respond capture slot, sends, then walks the bug-0288 start/end/settle poll ladder with a bounded `waitForIdle` race, and unwinds listeners/governor in two `finally` blocks.

## Evidence

Step inventory (phases, ranges, LOC, locals each phase reads/writes — the seam cost):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| pre-send idle gate | 716-741 | 26 | writes gateCleared; expiry record |
| model-resolution refusal | 742-758 | 17 | reads #queryModelRef/#queryModel; writes #transportFromThrow |
| governor arm | 759-767 | 9 | reads bound; governor state |
| install vector + turn boundary | 768-785 | 18 | writes install, turnStart |
| thetaAbort→ctx.abort teardown listener | 786-816 | 31 | writes onThetaAbortTeardown, teardownSignal |
| gate/window deps construction | 817-854 | 38 | writes activeSetGateDeps, modelWindowDeps (object literals reading only `this.#` fields) |
| capture arm + abort short-circuit + send | 855-898 | 44 | writes capture, window; writes #transportFromThrow on sync throw |
| start-poll + cancel forward + fast path | 899-936 | 38 | reads turnStart; writes startCleared |
| end-poll + bounded waitForIdle race + abort leg | 937-995 | 59 | writes endCleared, idleSettled, idleBoundTimer, onSettleAbort |
| settle-poll + agent_end abort synthesis | 996-1013 | 18 | reads turnStart; writes settleCleared |
| capture snapshot + refused-window Err + outer finally | 1014-1043 | 30 | reads capture, window; writes #earlyRespond, #transportFromThrow, #exhaustion |

Excerpt of the self-contained race sub-step (955-958):

```ts
          let idleBoundTimer: TimerHandle | undefined;
          const idleBound = new Promise<void>((resolve) => {
            idleBoundTimer = this.#clock.setTimeout(() => resolve(), WAIT_FOR_IDLE_BOUND_MS);
          });
```

## Why this is a problem

Strong band: presumption of breakdown unless a strong concrete reason. Reasons considered: (a) spec-cited critical section — the body cites bug 0288 §Fix items 1/3/4 as an ordered send→start→end→settle sequence, but that ordering covers only the poll ladder (899-1013, ~115 LOC); the deps-construction blocks (817-854, 38 LOC of object literals reading only `this.#` fields — zero threaded locals as private-method extractions), the teardown-listener construction (786-816, needs only #promptCancelPropagated/#ctx), and the bounded `waitForIdle` race (937-995, three locals, one await, one result bit) are not steps whose extraction would interleave anything observable — each is entered and exited at a single point; (b) measured cost — none cited; (c) prior split reverted — none found (git log shows the body arrived whole via the PTQ-1150 move); (d) human ruling — no exemptions.json entry for this host. Shared-local threading is bounded: the poll ladder shares only turnStart and text; capture/window are confined to the callback and its tail.

## Suggested direction (non-binding, optional)

All hypotheses unproven. Seam A: bounded idle race (937-995) -> private `#awaitIdleBounded(): Promise<boolean>` (hypothesis) — ~59 LOC, 0 exported symbols, 0 external importers, cross-refs: #clock, #ctx, #thetaAbort. Seam B: gate/window deps builders (817-854) -> private `#activeSetGateDeps()` / `#modelWindowDeps()` (hypothesis) — ~38 LOC, 0 exports, cross-refs: `this.#` fields only. Seam C: teardown-listener attach/detach pair (786-816, 1037) -> private `#attachAbortTeardown(): () => void` (hypothesis) — ~31 LOC, 0 exports, cross-refs: #promptCancelPropagated, #ctx.

## False-positive check

Band check: 330 LOC per the wave map (not recounted). Reasons-considered list above with the evidence defeating each. Exemptions check: quality/exemptions.json has no entry for this host or file. Generated-code check: hand-written. Spec-mirror check: the bug-0288 sequence is honoured by the proposed seams (each sub-step remains a single call inside the unchanged ordered ladder; no observable step is reordered). Duplicate check: no prior finding names #driveUserVisibleTurn (grep over quality/{issues,intake,resolved}); PTQ-1210 targeted driveRepairAttempt (fixed, then-host production-theta-producer.ts).

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces `LivePromptQueryModel.#driveUserVisibleTurn — 715-1044 — 330 LOC — band strong` with no row for the host or file in quality/exemptions.json; all eleven step ranges open at the cited lines and the 955-958 race excerpt matches verbatim; the inventory's rows are real distinct concerns (idle gate, model refusal, governor bracket, teardown-listener bracket, two deps object literals reading only `this.#` fields, capture bracket + send, bug-0288 poll ladder, bounded three-leg race, refused-window Err) not one concern split by adjectives; reasons-considered list holds — the bug-0288 §Fix ordering covers only the ladder (899-1013) and the three proposed seams each enter/exit at one point, no measured cost, no reverted split (git log: body arrived whole via the PTQ-1150 move, later touched only by two D8 fixes), and the one candidate concrete reason (single algorithm with ≥ 6 shared locals) does not clearly apply: the ~6 cross-phase locals (turnStart, bound, install, teardownSignal/onThetaAbortTeardown, capture, window) are acquire/release bracket handles for the two `finally` unwinds rather than algorithmic state, and each proposed seam threads ≤ 1 of them; noted for the ruling: 163 of the 330 lines are comments (≈167 code LOC, which alone would sit in the justify band), so the human should weigh code density before ratifying any seam; not a duplicate — sibling intake d9-03 is the file-level host (`live-prompt-query-driver.ts`, band justify), PTQ-1210 targeted driveRepairAttempt and PTQ-0118 only cites this method's contract (triage: claude-fable-5-1)
