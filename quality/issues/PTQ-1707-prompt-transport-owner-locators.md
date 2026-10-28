---
id: PTQ-1707
title: prompt-transport-mapping still locates extracted collaborators in production-theta-producer.
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/prompt-transport-mapping.ts:71-79
  - src/runtime/prompt-transport-mapping.ts:88-98
  - src/extension/off-session-respond-dispatch.ts:90-95
  - src/extension/live-prompt-query-driver.ts:159-164
  - src/extension/live-prompt-query-driver.ts:834-839
  - src/extension/production-theta-producer.ts:29-42
  - src/extension/live-prompt-query-driver.ts:1506-1506
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# prompt-transport-mapping still locates extracted collaborators in production-theta-producer.

## Observation
Two ownership comments in `prompt-transport-mapping.ts` still point to `production-theta-producer.ts`: one identifies the off-session normal-stop-reason constant there, and the other locates `LivePromptQueryModel.#driveUserVisibleTurn` there. The constant is defined in `off-session-respond-dispatch.ts`, while the class and its private drive method are defined in `live-prompt-query-driver.ts`. The producer retains an import and re-export facade, but neither implementation resides there.

## Evidence
The first ownership locator, `src/runtime/prompt-transport-mapping.ts:71-79`:

```ts
/**
 * PIC-51b's normal-terminator set for the prompt-mode (on-session) probe. Same
 * concept as `production-theta-producer.ts`'s off-session
 * `OFF_SESSION_NORMAL_STOP_REASONS` (pi-ai's `"stop"`/`"toolUse"` plus the
 * spec's `"end_turn"`/`"tool_use"` spellings) — duplicated rather than
 * imported because this runtime module sits below the extension layer that
 * const lives in. Exported for the host-recovery settle classifier
 * (`classifyHostRecoverySettle`), whose `"recovered"` arm keys on the same
 * normal boundary.
```

The second locator, `src/runtime/prompt-transport-mapping.ts:88-98`:

```ts
// --- Bug 0288 §Fix items 1/2/4 — turn-lifecycle bound-expiry messages -------
//
// Every bound the on-session prompt-mode turn drive waits on
// (production-theta-producer.ts `LivePromptQueryModel.#driveUserVisibleTurn`)
// must fail loudly on expiry rather than let the drive walk out and bind a
// value from a turn that was never observed to run or settle (bug doc P1/P2).
// The registry is closed (DIAG-2), so this reuses the PIC-50/PIC-51
// `TransportError` shape with a FIXED NAMED message per phase instead of
// minting a new diagnostic code. Each stem is a plain exported string so a
// caller (and a test) can check a synthesised message was built from it
// without hardcoding the bound value the message reports.
```

The constant's definition, `src/extension/off-session-respond-dispatch.ts:90-95`:

```ts
const OFF_SESSION_NORMAL_STOP_REASONS: ReadonlySet<string> = new Set([
  "stop",
  "end_turn",
  "toolUse",
  "tool_use",
]);
```

The class definition, `src/extension/live-prompt-query-driver.ts:159-164`:

```ts
class LivePromptQueryModel implements QueryModelDriver {
  readonly #pi: LivePromptQueryPi;
  readonly #ctx: LivePromptQueryCtx;
  readonly #clock: Clock;
  readonly #queryText: string;
  readonly #readMessages: () => readonly Message[];
```

Its method definition, `src/extension/live-prompt-query-driver.ts:834-839`:

```ts
  async #driveUserVisibleTurn(bound: boolean, text: string = this.#queryText): Promise<void> {
    this.#endedOnCapturedRecovery = false;
    this.#readFinalizationEvidence = undefined;
    this.#lostFinalOutput = false;
    this.#acceptedMessages = [];
    this.#transportFromThrow = undefined;
```

The retained facade, `src/extension/production-theta-producer.ts:29-42`:

```ts
import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import {
  LivePromptQueryModel,
  resolveRegistryAuth,
  RESPOND_TOOL_DESCRIPTION,
  RESPOND_CAPTURED_TEXT,
  RESPOND_REPEAT_TEXT,
  respondToolExecuteResult,
  type ActiveRespondCapture,
  type RespondTurnContext,
  type RespondToolExecuteResult,
} from "./live-prompt-query-driver";
export * from "./live-prompt-query-driver";
import {
```

The constant's intermediate re-export, `src/extension/live-prompt-query-driver.ts:1506-1506`:

```ts
export { OFF_SESSION_NORMAL_STOP_REASONS, resolveRegistryAuth } from "./off-session-respond-dispatch";
```

## Why this is a problem
This is D2's stale ownership prose after extraction: the file locators retain the former implementation host rather than the files containing the referenced constant and private method. Following the cited producer file reaches an import/re-export boundary instead of the implementation the comments describe. The layer-direction rationale and the transport behavior are not challenged.

## False-positive check
- Current definitions and facade: ran `rg -n 'OFF_SESSION_NORMAL_STOP_REASONS|class LivePromptQueryModel' src/extension/production-theta-producer.ts src/extension/live-prompt-query-driver.ts src/extension/off-session-respond-dispatch.ts`. Its five matching lines identify the constant definition/use/export in off-session-respond-dispatch, the class definition in live-prompt-query-driver, and the latter module's constant re-export. Inspected the producer import/export block separately; the facade remains valid and is explicitly acknowledged above. This is not a missing-export or dead-code claim.
- Private-method location: inspected `live-prompt-query-driver.ts:834-839` and searched `driveUserVisibleTurn` in the producer and driver; the method implementation is in the driver, not in the named producer file.
- Git-history intent: `git show 475e62db -- src/extension/production-theta-producer.ts` shows the class and constant removed from the producer during extraction; `git show --stat bd3d6b8e` and `git log --oneline -S 'const OFF_SESSION_NORMAL_STOP_REASONS' -- src/extension/live-prompt-query-driver.ts src/extension/off-session-respond-dispatch.ts` identify the subsequent off-session extraction. The filing concerns the retained locators, not the deliberate extraction or layer boundary.
- Existing-finding check: searched `prompt-transport-mapping\.ts|PROMPT_MODE_NORMAL_STOP_REASONS|turn-lifecycle bound-expiry` across quality/issues, quality/intake and quality/resolved before filing. Reviewed the matching prior stale-narration report PTQ-0072: it concerned the former claim that implemented helpers were inert stubs at the module header, not these collaborator locators. The other matching reports concern runtime behavior or separate narration. The brief's already-filed topics do not name these two locators.

## Triage
verdict: confirmed — Both comments still name the former implementation host: OFF_SESSION_NORMAL_STOP_REASONS is defined in off-session-respond-dispatch.ts:90 and #driveUserVisibleTurn in live-prompt-query-driver.ts:834; excerpts, five-hit search, and extraction history reproduce, and the producer's re-export facade does not supply either implementation. PTQ-0072 concerns different header prose; no duplicate found. (triage: claude-opus-5-5)
