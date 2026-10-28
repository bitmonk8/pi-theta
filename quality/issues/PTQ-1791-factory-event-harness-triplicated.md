---
id: PTQ-1791
title: The watchdog and result-channel tests repeat the same factory event harness three times.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-parent-watchdog-composition.test.ts:284-310
  - tests/subagent-parent-watchdog-composition.test.ts:391-413
  - tests/subagent-result-channel-factory.test.ts:28-55
sites: 3
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The watchdog and result-channel tests repeat the same factory event harness three times.

## Observation
Two scoped files contain three implementations of the same command/subscription recording and async event-dispatch harness over `makeIdleModelHost`. Each creates two maps, overrides `registerFlag`, `registerCommand`, `on`, and `getCommands`, and dispatches each subscribed handler with the captured context. The differences are the workspace argument, whether the context is returned, and the shipped-export cell's additional inert SDK members. The natural shared-harness home is `tests/helpers/`; this observation does not prescribe a helper interface or change which factory path each test exercises.

## Evidence
The count is three within this two-file pattern, not a repository-wide count. Exact search `rg -n 'const subscriptions = new Map<string, \(\(event: unknown, ctx: ExtensionContext\) => unknown\)\[\]>\(\);' tests/subagent-{parent-watchdog-composition,result-channel-factory}.test.ts` returned three hits: composition lines 285 and 391, and result-channel line 29. All three implementations are cited below.

`tests/subagent-parent-watchdog-composition.test.ts:284-298`:
```ts
  function makeFactoryHarness(): FactoryHarness {
    const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
    const commands = new Map<string, unknown>();
    const { pi: basePi, ctx } = makeIdleModelHost(workspace, false);
    const pi = {
      ...basePi,
      registerFlag: (): void => {},
      registerCommand: (name: string, options: unknown): void => {
        commands.set(name, options);
      },
      on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
        const list = subscriptions.get(event) ?? [];
        list.push(handler);
        subscriptions.set(event, list);
      },
```
`tests/subagent-parent-watchdog-composition.test.ts:299-310`:
```ts
      getCommands: (): { name: string; source: string }[] =>
        [...commands.keys()].map((name) => ({ name, source: "extension" })),
    } as unknown as ExtensionAPI;
    return {
      pi,
      fire: async (event, payload): Promise<void> => {
        for (const handler of subscriptions.get(event) ?? []) {
          await handler(payload, ctx);
        }
      },
    };
  }
```

`tests/subagent-parent-watchdog-composition.test.ts:391-405`:
```ts
      const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
      const commands = new Map<string, unknown>();
      const { pi: basePi, ctx } = makeIdleModelHost(workspace, false);
      const pi = {
        ...makeInertSdkMembers(),
        ...basePi,
        registerFlag: (): void => {},
        registerCommand: (name: string, options: unknown): void => {
          commands.set(name, options);
        },
        on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
          const list = subscriptions.get(event) ?? [];
          list.push(handler);
          subscriptions.set(event, list);
        },
```
`tests/subagent-parent-watchdog-composition.test.ts:406-413`:
```ts
        getCommands: (): { name: string; source: string }[] =>
          [...commands.keys()].map((name) => ({ name, source: "extension" })),
      } as unknown as ExtensionAPI;
      const fire = async (event: string, payload: Record<string, unknown>): Promise<void> => {
        for (const handler of subscriptions.get(event) ?? []) {
          await handler(payload, ctx);
        }
      };
```

`tests/subagent-result-channel-factory.test.ts:28-42`:
```ts
function makeHarness(cwd: string): Harness {
  const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();
  const commands = new Map<string, unknown>();
  const { pi: basePi, ctx } = makeIdleModelHost(cwd, false);
  const pi = {
    ...basePi,
    registerFlag: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
```
`tests/subagent-result-channel-factory.test.ts:43-55`:
```ts
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
  } as unknown as ExtensionAPI;
  return {
    pi,
    ctx,
    fire: async (event, payload): Promise<void> => {
      for (const handler of subscriptions.get(event) ?? []) {
        await handler(payload, ctx);
      }
    },
  };
}
```

## Why this is a problem
This is D7 boilerplate duplication: the same host bookkeeping and awaited-dispatch algorithm is maintained in three places, independently of the watchdog/channel assertions. The production-export cell's extra SDK members and the channel harness's exposed context do not change that duplicated algorithm. The duplication is in setup code that already exists, not in the number or placement of behavioral witnesses.

## False-positive check
- Gate-pin: neither scoped file is a census/inventory gate; no count or sanctioned re-derivation is challenged.
- Recording-double: recording registrations and subscriptions is legitimate. The finding concerns repeated implementations of that double, not the validity of MUST-NOT assertions.
- docs/bugs/ signature search: the combined file-name/title search in docs/bugs and coverage-matrix found bug 0493's watchdog witnesses and its inert-watchdog-seams note, not a documented red or a requirement to keep three host-bookkeeping implementations.
- Coverage-matrix/bug-doc citation search: `rg -n 'subagent-model-theta-tool|subagent-parent-watchdog|subagent-result-channel-factory|marshals the STORED|first compose dials|two session_start composes' docs/reference/coverage-matrix.md docs/bugs` found no coverage-matrix entry. Bug 0493 cites the watchdog file family and witness scenarios. No merge, rename, or deletion of those tests is proposed; the real-factory and shipped-export drives are not being conflated.
- Prior-filing check: file-name searches across quality/intake, quality/issues, and quality/resolved found PTQ-0513 (model/ctx fixture), PTQ-0570 (executable-host double), and PTQ-0904 (workspace lifecycle) for the result-channel file. Those extracted pieces are already imported here; none reports the residual command/subscription/fire blocks quoted above. The other candidate for this file concerns only the ordering boolean.
- History check: the watchdog files were introduced for bug 0493 (`d941f7df`) and adjusted in `9d2592ed`. The explicit shipped-export purpose is preserved; the duplication claim does not ask for a test double in place of that shipped closure.
- Coverage boundary: no missing tests, suite composition, or runtime-risk allegation forms the rationale. Only the three existing setup implementations are counted.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — All three excerpts and the three-hit search reproduce exactly: the same command/subscription maps, registration overrides, and awaited context-bound dispatch are duplicated in live test setup; the shipped-export SDK additions and exposed context/command diagnostics do not change that algorithm. This is D7 boilerplate duplication, not a challenge to recording witnesses or test placement; bug 0493 preserves the shipped-closure witness, and resolved PTQ-0513/0570/0904 cover different fixture layers without prescribing these repeated blocks. No existing filing tracks these sites' residual harness duplication. (triage: claude-opus-5-5)
