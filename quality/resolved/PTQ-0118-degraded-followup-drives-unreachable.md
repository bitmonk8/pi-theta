---
id: PTQ-0118
title: driveFollowUp's two respond-less arms are gated on a condition its only consumer's construction excludes, leaving driveStreamedUserTurn and offSessionFollowUp with no reachable caller
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:3208-3209
  - src/extension/production-theta-producer.ts:3314-3335
  - src/extension/production-theta-producer.ts:3336-3350
  - src/extension/production-theta-producer.ts:7221-7229
  - src/extension/production-theta-producer.ts:7239-7244
  - src/extension/production-theta-producer.ts:7261-7399
sites: 4
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# driveFollowUp's two respond-less arms are gated on a condition its only consumer's construction excludes, leaving driveStreamedUserTurn and offSessionFollowUp with no reachable caller

## Observation
`#resolvePromptQuery` builds a four-arm `driveFollowUp` closure. Two arms
(`driveStreamedUserTurn(...)` and `offSessionFollowUp(...)`) are selected only
when `respond === undefined`. `respond` is constructed as
`lowered !== undefined ? … : undefined`, and the closure's only consumer —
`#buildTypedValidation`, which builds the `TypedQuerySchemaValidation` the
respond-repair loop calls `driveFollowUp` through — is itself built inside
`lowered !== undefined ? … : undefined`. Any invocation of `driveFollowUp`
therefore implies `lowered !== undefined`, which implies `respond !== undefined`,
so the two respond-less arms never execute. Both functions they call are
module-private and have no other call site.

## Evidence
src/extension/production-theta-producer.ts:3208-3209 — `respond` exists exactly
when `lowered` does:

```ts
    const respond =
      lowered !== undefined ? this.#buildRespondTurnContext(lowered, deps) : undefined;
```

src/extension/production-theta-producer.ts:3314-3335 — the four-arm closure; the
second and fourth arms require `respond === undefined`:

```ts
    const driveFollowUp = (
      prompt: string,
    ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> =>
      liveModel !== undefined && respond !== undefined
        ? liveModel.driveRepairAttempt(prompt)
        : liveModel !== undefined
          ? driveStreamedUserTurn({
              pi: deps.pi,
              ctx: deps.ctx,
              clock: root.clock,
              queryText: prompt,
              activeTools,
```

```ts
          : offModel !== undefined && respond !== undefined
            ? offModel.driveRepairAttempt(prompt)
            : offSessionFollowUp(deps.ctx.model, prompt);
```

src/extension/production-theta-producer.ts:3336-3350 — the closure's single
consumer, built under the same `lowered !== undefined` condition; its own inline
comment states the implication:

```ts
    const validation =
      lowered !== undefined
        ? this.#buildTypedValidation(
            expr,
            env,
            deps.theta,
            driveFollowUp,
            lowered,
            // F6: the QRY-12 follow-ups must name the REGISTERED respond tool
            // (collision-disambiguated when applicable), byte-equal to the
            // forced choice. Absent only on the (unreachable-here) respond-less
            // arm — lowered !== undefined implies respond !== undefined.
            respond?.toolName,
          )
        : undefined;
```

src/extension/production-theta-producer.ts:7221-7229 — the first unreachable
callee (11 lines including its doc):

```ts
async function offSessionFollowUp(
  model: Model<Api> | undefined,
  prompt: string,
): Promise<string | FollowUpDriveFailure> {
  const completion = await offSessionComplete(model, prompt);
  return completion.kind === "text"
    ? completion.text
    : { kind: "provider_failure", error: completion.error };
}
```

src/extension/production-theta-producer.ts:7239-7244 — the second unreachable
callee's doc asserts the caller that cannot fire:

```ts
 * Bug 0010 increment C: this is NO LONGER the typed repair drive — the live
 * typed path repairs through `LivePromptQueryModel.driveRepairAttempt` (the
 * QRY-14 ¶3 two-phase restart). The sole remaining caller is the DEGRADED
 * typed arm (`respond` context absent: an unlowerable annotation), whose
 * repair follow-ups still drive one streamed turn and text-parse its trailing
 * reply so typed behaviour stays total for unlowerable schemas.
```

src/extension/production-theta-producer.ts:7261-7399 — that callee's body, 139
lines (`async function driveStreamedUserTurn(deps: {` … its closing `}`),
re-implementing the whole pre-send gate / start poll / bounded `waitForIdle`
race / settle poll sequence.

## Why this is a problem
Dead code, proven dead. `driveStreamedUserTurn` and `offSessionFollowUp` are
module-private (no `export`), and their only textual call sites are the two
`driveFollowUp` arms above; those arms are guarded by `respond === undefined`
while the closure is only reachable when `respond !== undefined`. The two dead
functions carry ~150 lines including a full second copy of the turn-lifecycle
polling protocol (the copy bug 0288 §Fix item 5 deliberately brought "onto the
SAME turn-completion contract" as `LivePromptQueryModel.#driveUserVisibleTurn`),
plus `driveStreamedUserTurn`'s own doc paragraph asserting a caller roster the
code contradicts ("The sole remaining caller is the DEGRADED typed arm";
"Chosen over deleting it: this is the DEGRADED arm's only repair-follow-up
drive"). `git blame` puts the whole `driveFollowUp` ternary and the
`lowered !== undefined` gate on `validation` in one commit — `30492948`
(2026-07-27, bug 0010, v0.20.0) — so the arms were unreachable from the moment
they landed.

## Suggested direction (non-binding, optional)
Either collapse `driveFollowUp` to the two arms its consumer can actually reach
and drop the two functions, or — if the degraded (`lowered === undefined`) arm
is meant to repair at all — make that arm build a validation collaborator so the
existing drives have a consumer.

## False-positive check
- `grep -rn "driveStreamedUserTurn\|offSessionFollowUp" --include=*.ts src
  extensions tools tests`: outside this file the only hits are prose comments
  (`src/runtime/tool-registration.ts:17`,
  `tests/b0372-active-set-restore-protocol.test.ts:21,51`,
  `tests/typed-repair-two-phase.test.ts:10,823,839,1142`). No `import` of
  either name exists anywhere — both are declared with a bare `function`
  keyword, not `export function`, so no re-export or dynamic/string-keyed
  access can reach them. This is therefore not a test-only-reachable function
  being mistaken for dead; tests cannot reach them at all.
  `tests/typed-repair-two-phase.test.ts:823` itself calls it "the retired
  driveStreamedUserTurn mechanism".
- `grep -n "driveFollowUp" src/extension/production-theta-producer.ts`: the
  identifier appears at 3241 (comment), 3314 (declaration), 3342 (the single
  argument position), and 5454/6061/6367/7215/7256 (comments). The only value
  use is line 3342.
- `grep -rn "driveFollowUp" src/`: the consumer side is
  `src/runtime/typed-query-validation.ts:165` (the
  `TypedQueryValidationInput.driveFollowUp` member) and `:263`
  (`await this.#input.driveFollowUp(prompt)`) — reached only through
  `buildTypedQueryValidation`, whose only production caller in this file is
  `#buildTypedValidation` at 3338.
- Checked `#buildRespondTurnContext` cannot return `undefined`: its declared
  return type is `RespondTurnContext` (line 3426) with a single unconditional
  `return { … }`, so `respond !== undefined` holds whenever `lowered !==
  undefined`.
- Checked the degraded arm is otherwise alive: `this.#respond === undefined`
  IS reachable inside `LivePromptQueryModel.forcedRespondTurn` (5363) and
  `OffSessionQueryModel.forcedRespondTurn` (6296) — only the repair-follow-up
  path is unreachable, so `#completeFused` / `offSessionComplete` are not
  claimed dead here.
- Git intent: `git blame -L 3314,3346` → all structural lines `30492948`
  (2026-07-27, "fix(bug-0010): typed forced respond runs off-session via
  complete() with forced tool choice — v0.20.0"); the later blame entries on
  those lines (`4851f2e9`, `41ed1095`, `3742e17c`) only add arguments inside
  the already-unreachable call.
- Not a spec-mandated fail-closed branch: the arms are a repair-drive fallback,
  not a refusal; `#buildTypedValidation`'s own comment already labels the
  respond-less arm "unreachable-here".

## Triage
verdict: confirmed — re-verified independently: respond is non-optional whenever lowered exists (#buildRespondTurnContext returns `RespondTurnContext`, single unconditional return) and driveFollowUp's only consumer is #buildTypedValidation at 3338 inside `lowered !== undefined`, so the arms at 3320/3335 cannot fire; my own grep across src/ tests/ extensions/ tools/ finds no other call site, no export, no import and no dynamic/string-keyed access, leaving driveStreamedUserTurn (7261-7399, 139 lines) and offSessionFollowUp (7221-7229) dead — corroborated by the file's own "unreachable-here"/5391 residual note and tests/b0372's "NOT witnessed by a running cell" (triage: claude-opus-5)
