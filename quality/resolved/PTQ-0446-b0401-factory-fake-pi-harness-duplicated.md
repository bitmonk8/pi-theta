---
id: PTQ-0446
title: b0401's makeFactoryHarness redeclares the fake-pi/subscription/fireSessionStart harness watcher-hot-reload-integration.test.ts and drain-gated-dispatch-integration.test.ts already carry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0401-informational-notes-omit-details.test.ts:288-322
  - tests/drain-gated-dispatch-integration.test.ts:69-109
  - tests/double-session-start-supersession.test.ts:169-215
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0401's makeFactoryHarness redeclares the fake-pi/subscription/fireSessionStart harness watcher-hot-reload-integration.test.ts and drain-gated-dispatch-integration.test.ts already carry

## Observation
`tests/b0401-informational-notes-omit-details.test.ts` declares its own `makeFactoryHarness()` — a fake `ExtensionAPI` (`registerFlag`/`registerMessageRenderer`/`registerCommand`/`on`/`getFlag`/`getCommands`/`sendMessage`/`sendUserMessage`), a `subscriptions` map, and a `fire`/`fireSessionStart` dispatcher — that reproduces the same fake-pi harness `tests/drain-gated-dispatch-integration.test.ts` builds in its own `makeHarness()`, which that file's own header comment states was itself "copied verbatim from `tests/watcher-hot-reload-integration.test.ts`". `tests/double-session-start-supersession.test.ts` carries a third near-identical copy. None of the three imports from the others or from a shared `tests/helpers/` module.

## Evidence

`tests/b0401-informational-notes-omit-details.test.ts:288-322` (`makeFactoryHarness`):
```ts
function makeFactoryHarness(): FactoryHarness {
  const commands = new Map<string, unknown>();
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    // Capture the RAW message object so `details` presence reflects the wire.
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: "/does/not/matter",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return { pi, notes, commands, fireSessionStart: () => fire("session_start") };
}
```

`tests/drain-gated-dispatch-integration.test.ts:69-109` (`makeHarness`, whose own file header at line 27-28 says it is "replicated the same way the watcher-hot-reload integration test does"):
```ts
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({ ... });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd: "/does/not/matter",
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };
```

`tests/double-session-start-supersession.test.ts:169-215` carries the same `commands`/`subscriptions`/`pi.registerFlag`/`registerMessageRenderer`/`registerCommand`/`on`/`getFlag`/`getCommands`/`sendUserMessage` shape and the same `cwd`/`hasUI`/`modelRegistry`/`ui` ctx object and `fire` loop, diverging only in tracking `registeredNames` and `userMessages` as extra observation arrays and taking `cwd` as a parameter.

The `registerFlag`/`registerMessageRenderer`/`registerCommand`/`on`/`getFlag`/`getCommands` block (six members, byte-identical apart from `sendMessage`'s payload-recording shape) and the `ctx` object (`cwd`/`hasUI`/`modelRegistry.getAvailable`/`ui.notify`, byte-identical in all three) and the `fire` closure (byte-identical in all three) are common to all three files.

## Why this is a problem
`tests/drain-gated-dispatch-integration.test.ts`'s own header comment records that its harness is "replicated the same way the watcher-hot-reload integration test does (its helpers are not exported)" — the repository's own test authors have twice now recognized this exact fake-pi/subscription/fire scaffolding as a copy at write time rather than exporting it. b0401 is a third, later copy of the same six-member fake-pi stub, ctx object, and dispatcher loop, again not imported from any of the two prior copies or from `tests/helpers/`.

## Suggested direction (non-binding, optional)
`tests/helpers/` is this suite's existing home for shared non-domain-specific test plumbing; a fake-pi-command-and-event-harness export living there is the home the drain-gated file's own comment already points at ("its helpers are not exported"), not a design for the extraction.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named kin; this finding is about where the fake-`ExtensionAPI`/subscription harness is defined, not a pinned count or inventory assertion.
- Recording-double check: the `sendMessage`/`registerCommand`/`on` capture calls so a later assertion can inspect what was dispatched — a positive-witness recorder, not a "never called" negative witness, so the recording-double carve-out does not apply (it is a re-implemented double, not a MUST-NOT witness).
- docs/bugs/ signature search: `grep -rl "b0401-informational-notes-omit-details\|drain-gated-dispatch-integration\|double-session-start-supersession" docs/bugs/` shows these three test file names are not the subject of any documented correct-reason-red; docs/bugs/0401-*.md Status is not "left red" — `npx vitest run tests/b0401-informational-notes-omit-details.test.ts` passes at HEAD (all controls/witnesses execute as scripted, none skipped).
- coverage-matrix/bug-doc citation search: `grep -n "b0401-informational-notes-omit-details\|drain-gated-dispatch-integration\|double-session-start-supersession" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` name — only that the local `makeFactoryHarness`/`makeHarness` pieces could be imported from a shared module.
- Coverage check: the claim is entirely about a repeated harness DEFINITION; every copy is exercised by the tests in its own file, so this is not a coverage-gap claim.

## Triage
verdict: confirmed — independently re-verified: b0401:288-322 and drain-gated:69-109 reproduce with the six-member fake-pi stub, ctx object and fire loop byte-identical (only sendMessage's recording shape differs), drain-gated's header (27-32, 62-66) really states it is "copied verbatim from tests/watcher-hot-reload-integration.test.ts … (its helpers are not exported)", and double-session-start:169-215 is near-identical (candidate slightly overstates it: its fire also takes a payload arg and its sendMessage drops details — still a copy); the only shared export, tests/helpers/watch-arming-harness.ts#makeHarness (PTQ-0363's extraction), returns just {pi, fireSessionStart} with a no-op sendMessage so cannot serve b0401's commands/notes capture; pattern is wider than filed (registerMessageRenderer stub → 54 tests/ files), coverage-matrix grep → 0 hits, docs/bugs grep actually hits 7 docs (not 0 as implied) but none is a left-red — all 3 files pass 18/18; no tracked PTQ cites any of the three files (PTQ-0363 is b0310/b0339 only); same-wave sibling d7-01-b0371-fake-pi-harness-duplicated (confirmed) also names drain-gated's copy, so the fix should be one shared extraction with it, not a duplicate under this store's per-copy-site convention (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
