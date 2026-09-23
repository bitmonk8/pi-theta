---
id: PTQ-1312
title: composeHost/composeAndDispatch real-factory-over-recording-pi harness is near-identically redeclared in three files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-run-card.test.ts:598-680
  - tests/execution-status-supersession.test.ts:190-282
  - tests/execution-status-trace-wiring.test.ts:50-131
sites: 3
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# composeHost/composeAndDispatch real-factory-over-recording-pi harness is near-identically redeclared in three files

## Observation
Three files in scope each declare a local async function (`composeHost` in
two files, `composeAndDispatch` in the third) that: builds a `commands` map
plus a `sessionStartHandlers` array, constructs an inline recording `pi`
object with the identical member set (`registerFlag`, `registerMessageRenderer`,
`registerEntryRenderer`/`appendEntry`, `registerCommand` pushing into the
`commands` map, an `on` that only captures `session_start` handlers, `getFlag`,
`getCommands` mapping the commands map back to `{ name, source: "extension" }`,
`sendMessage`, `sendUserMessage`), constructs an inline `ctx` object with
`cwd`/`mode`/`hasUI`/`modelRegistry.getAvailable` returning the same one-model
array/`ui.notify`, wires a `deps.composeInstance` that forwards into
`composeExtensionInstance` with a fresh `FakeFileWatcher`/`FakeClock`, calls
`createThetaExtension(deps)(pi)`, then awaits every captured `session_start`
handler, and finally returns a `dispatch`/lookup helper that throws
`` `precondition unmet: /${name} never registered …` `` when the command is
absent. All three occurrences are byte-for-byte identical in this scaffold,
diverging only in the few fields each test actually varies (whether
`appendEntry` records, whether `runCardView`/`latchStatusBus` is forwarded,
extra `getActiveTools`/`setActiveTools`/`getAllTools` no-ops in the
trace-wiring copy).

## Evidence

tests/execution-status-run-card.test.ts:610-644 (pi + ctx block):
```ts
  const sessionStartHandlers: ((event: unknown, ctx: ExtensionContext) => unknown)[] = [];
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerEntryRenderer: (): void => {},
    appendEntry: (customType: string, data: unknown): void => {
      appendCalls.push({ customType, data });
    },
    registerCommand: (name: string, commandOptions: unknown): void => {
      commands.set(name, commandOptions as { handler: never });
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
      }
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/execution-status-supersession.test.ts:199-217 (same block, only
`appendEntry` collapsed to a no-op and no destructured args):
```ts
  const sessionStartHandlers: ((event: unknown, ctx: ExtensionContext) => unknown)[] = [];
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerEntryRenderer: (): void => {},
    appendEntry: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => {
      commands.set(name, commandOptions as { handler: never });
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
      }
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/execution-status-trace-wiring.test.ts:55-77 (same block, with three
extra no-op members inserted):
```ts
  const sessionStartHandlers: ((event: unknown, ctx: ExtensionContext) => unknown)[] = [];
  let latchedBus: ExecutionStatusBus | undefined;
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerEntryRenderer: (): void => {},
    appendEntry: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => {
      commands.set(name, commandOptions as { handler: never });
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
      }
    },
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): unknown[] => [],
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

All three also repeat the identical `ctx` shape:
```ts
  const ctx = {
    cwd: options.cwd,
    mode: options.mode,
    hasUI: options.mode === "tui",
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [{ id: "claude-test", provider: "anthropic" }],
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
```
(execution-status-run-card.test.ts:632-639; execution-status-supersession.test.ts:219-226 —
the same object plus the `ui` block's three retirement-witness members added
locally; execution-status-trace-wiring.test.ts:82-89 verbatim), the identical
`createThetaExtension(deps)(pi)` + session_start-firing loop:
```ts
  createThetaExtension(deps)(pi);
  for (const handler of sessionStartHandlers) {
    await handler({ type: "session_start" }, ctx);
  }
```
(run-card.test.ts:664-667; supersession.test.ts:267-270; trace-wiring.test.ts:113-116,
verbatim in all three), and the identical dispatch-lookup precondition:
```ts
    dispatch: async (name, args): Promise<unknown> => {
      const command = commands.get(name);
      if (command === undefined) {
        // No silent skipping: an unregistered fixture is a harness fault.
        throw new Error(
          `precondition unmet: /${name} never registered (registered: ${[...commands.keys()].join(", ")})`,
        );
      }
      return command.handler(args, dispatchCtx());
    },
```
(run-card.test.ts:679-687; trace-wiring.test.ts:124-132, verbatim modulo
`dispatchCtx()` inlining; supersession.test.ts:264-266 inlines the same
lookup-and-throw for its one fixed `"demo"` command name rather than a
general `dispatch` method).

All three files already import from the same shared module,
`tests/helpers/production-load-harness.ts` (for `theta`, `plantThetaWorkspace`,
`disposeWorkspace`), and that module exports `makeShippedHarness` (lines
406-484), a "boot the real factory/composition with command … recorders"
helper whose `pi` (registerFlag/registerMessageRenderer/registerCommand
into a commands map/on capturing session_start handlers/getFlag/getCommands/
sendMessage/sendUserMessage) and `fireSessionStart` loop are the same shape as
the block quoted above.

## Why this is a problem
The same ~35-line recording-`pi` object, ~8-line `ctx` object, factory-boot
call, and session-start-firing loop is typed out fresh in three files under
review rather than declared once. Each of the three copies is a place a
future edit to the shared shape (e.g. a new required `pi` member) has to land
identically three times to keep the suites compiling against the same
`ExtensionAPI`/`ExtensionContext` types.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` harness naming this exact "real factory + recording
pi + session_start firing + registered-command dispatch, parameterised by
`ctx.mode` and any extra pi members a specific suite needs" shape is the
natural home the three call sites already point at — the sibling
`makeShippedHarness` helper in the module all three already import from is
the closest existing analogue.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the
  named gate kin; not applicable.
- Recording-double check: `appendCalls`/`envelopeLines`/`latchedBus` are
  legitimate recorders used for positive assertions (not a "never called"
  negative witness), so the recording-double carve-out does not apply to the
  duplicated scaffold itself.
- docs/bugs/ signature search: `grep -rl "composeHost\|composeAndDispatch"
  docs/bugs/` returned no matches — no documented correct-reason red pins
  this shape.
- coverage-matrix/bug-doc citation search: `grep -rn "execution-status-run-card\|execution-status-supersession\|execution-status-trace-wiring" docs/reference/coverage-matrix.md docs/bugs/*.md`
  returned no hits — none of the three test files, nor `composeHost`/
  `composeAndDispatch` by name, are cited by name in the coverage matrix or a
  bug doc's witness list, so no merge/rename/delete pin applies.
- This finding claims only that the setup code as written is duplicated
  three times in-scope; it does not claim any behaviour is untested or that
  a test should be added/removed (no coverage claim).

## Triage
verdict: confirmed — all three excerpts match the current files at the cited ranges (run-card.test.ts:598-688 composeHost, supersession.test.ts:190-282 composeAndDispatch, trace-wiring.test.ts:50-133 composeHost): the recording-`pi` member set (registerFlag/registerMessageRenderer/registerEntryRenderer/appendEntry/registerCommand→commands map/on capturing only session_start/getFlag/getCommands/sendMessage/sendUserMessage), the `ctx` block with the same one-model getAvailable, the `createThetaExtension(deps)(pi)` + session_start-firing loop and the `precondition unmet: /${name} never registered` lookup are verbatim across the three (diverging only in the acknowledged appendEntry recorder, three extra tool no-ops, the ui retirement recorders and the composeInstance forwarding tail), which is D7 boilerplate duplication / copy-paste fixture in tests/ only; all three already import from tests/helpers/production-load-harness.ts whose exported makeShippedHarness (406-484) has the same pi/ctx/boot/fireSessionStart shape; stated searches re-run — no docs/bugs/ hit for composeHost|composeAndDispatch, no coverage-matrix or bug-doc citation of the three files, none are gate tests; dedupe — no open/resolved PTQ cites these files (PTQ-1260 names only the run-card-renderer test as a D9 importer; PTQ-0715/0928/0792/0922 cover different harnesses), so the root cause is untracked; the fix is a mechanical hoist into a parameterised shared helper (triage: claude-fable-5-1)
