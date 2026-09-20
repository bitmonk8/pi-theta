---
id: pending
title: createProductionSubagentWire's returned openWire function never reads its `request` argument
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-result-channel.ts:176-206
  - src/runtime/subagent-launcher.ts:986-993
  - src/runtime/subagent-launcher.ts:1033
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# createProductionSubagentWire's returned openWire function never reads its `request` argument

## Observation
`createProductionSubagentWire` returns a function typed to accept two
parameters, `prepared` and `request: SubagentLaunchRequest`, matching the
`SubagentPlacementDeps.openWire` seam's declared shape. The returned
implementation renames the second parameter to `_request` and never reads it
anywhere in the function body — every field the body needs (`env`,
`presentation`, `entry`) comes from `prepared` alone.

## Evidence
`src/extension/production-result-channel.ts:176-183` (signature and unread parameter):
```ts
export function createProductionSubagentWire(
  deps: ProductionSubagentWireDeps,
): (
  prepared: Extract<PreparedSubagentLaunch, { ok: true }>,
  request: SubagentLaunchRequest,
) => Promise<OpenedSubagentWire> {
  return async (prepared, _request): Promise<OpenedSubagentWire> => {
```

`src/extension/production-result-channel.ts:183-206` (the full body — every
reference is to `prepared`/`deps`, none to `_request`):
```ts
    const token = deps.mintSecret();
    const nonce = deps.mintSecret();
    const channel = await openResultChannel({
      server: deps.server,
      clock: deps.clock,
      token,
      nonce,
      silenceBudgetMs: deps.silenceBudgetMs ?? RESULT_CHANNEL_SILENCE_BUDGET_MS,
    });
    const document: SubagentLaunchFileDocument = {
      v: LAUNCH_FILE_VERSION,
      nonce,
      controlPlane: projectLaunchFileControlPlane(prepared.env),
      channel: { port: channel.port, token },
      presentation: prepared.presentation,
      entry: prepared.entry,
    };
```

The seam contract this implements, `src/runtime/subagent-launcher.ts:986-993`:
```ts
  readonly openWire?: (
    prepared: Extract<PreparedSubagentLaunch, { ok: true }>,
    request: SubagentLaunchRequest,
  ) => Promise<OpenedSubagentWire>;
```

The sole call site threading `request` into it, `src/runtime/subagent-launcher.ts:1033`:
```ts
     wire = await deps.openWire(prepared, request);
```

`createProductionSubagentWire` is the only production implementation of
`openWire` (search: `openWire:` / `openWire =` across `src/**/*.ts` finds one
producer wiring site, `src/extension/production-theta-producer.ts:2776`,
which threads `this.#input.subagentOpenWire` — itself built by
`createProductionSubagentWire` — into this same seam). Every test double
implementing `openWire` (`tests/subagent-exec-placement.test.ts:309`,
`tests/subagent-placement-seam.test.ts:217,263,284`) likewise ignores or
destructures only `prepared`, never `request`.

## Why this is a problem
`SubagentLaunchRequest` (`src/runtime/subagent-launcher.ts:736`) carries
distinct fields (`argv`, `cwd`, `parentEnv`, per-launch control-plane
carriage) not reducible to `prepared`. The seam's only production
implementation, and every present test double, discards this parameter
entirely, so the second argument is dead weight on the one function that
consumes it: nothing in the current tree reads `request` at the `openWire`
call boundary.

## Suggested direction (non-binding, optional)
If no planned implementation of `openWire` needs `request`, the parameter
could be dropped from the `openWire` seam type and its single call site;
otherwise leaving it named `_request` (as done here) is the seam's existing
acknowledgment that it is presently unread.

## False-positive check
Searched `openWire:` and `openWire =` across `src/**/*.ts` and `tests/**/*.ts`
— found the one production implementation
(`createProductionSubagentWire`) and four test doubles, none of which reads
`request`. Searched `_request` and `request` inside the function body
(`production-result-channel.ts:182-206`) — no reference. Confirmed the single
call site (`subagent-launcher.ts:1033`) is the only place `deps.openWire` is
invoked (`grep -n "deps.openWire" src/runtime/subagent-launcher.ts` → one
hit). Not test-only-reachable: the parameter is unread by the shipped
production closure itself, not merely by a test caller.

## Triage
<!-- triage appends its note below this line -->
