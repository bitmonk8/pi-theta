---
id: PTQ-0513
title: subagent-result-channel-factory.test.ts's makeHarness pi/ctx object and AVAILABLE_MODEL constant duplicate production-result-channel.test.ts's fakeHost/ctx and AVAILABLE_MODEL near-verbatim
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-result-channel-factory.test.ts:21-84
  - tests/production-result-channel.test.ts:323-323
  - tests/production-result-channel.test.ts:346-374
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# subagent-result-channel-factory.test.ts's makeHarness pi/ctx object and AVAILABLE_MODEL constant duplicate production-result-channel.test.ts's fakeHost/ctx and AVAILABLE_MODEL near-verbatim

## Observation
Both files are RFC-0012 §3 siblings exercising the child's result channel
through `createThetaExtension`/`composeExtensionInstance`. Each declares a
module-scope `const AVAILABLE_MODEL = { id: "claude-test", provider:
"anthropic", api: "anthropic-messages" };` — byte-identical — and each builds
an `ExtensionContext` fake whose `model`/`isIdle`/`modelRegistry`/
`sessionManager`/`ui` fields are byte-identical apart from the `cwd` value and
the `hasUI` literal. `subagent-result-channel-factory.test.ts`'s `pi` fake is
a superset of `production-result-channel.test.ts`'s `pi` fake (it adds an
event-subscription/command-registration layer the other file's `on: (): void
=> {}` no-op does not need), but every field the two `pi` fakes share
(`getFlag`, `getCommands`, `sendMessage`, `sendUserMessage`,
`getActiveTools`, `setActiveTools`, `getAllTools`, `registerProvider`,
`unregisterProvider`, `setModel`) has the identical body.

## Evidence

tests/subagent-result-channel-factory.test.ts:21 (re-read immediately before filing):
```ts
const AVAILABLE_MODEL = { id: "claude-test", provider: "anthropic", api: "anthropic-messages" };
```

tests/subagent-result-channel-factory.test.ts:64-84 (the `ctx` and the shared `pi` fields, re-read immediately before filing):
```ts
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerProvider: (): void => {},
    unregisterProvider: (): void => {},
    setModel: (): Promise<boolean> => Promise.resolve(true),
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: false,
    model: AVAILABLE_MODEL,
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [AVAILABLE_MODEL],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
```

tests/production-result-channel.test.ts:323 (re-read immediately before filing):
```ts
const AVAILABLE_MODEL = { id: "claude-test", provider: "anthropic", api: "anthropic-messages" };
```

tests/production-result-channel.test.ts:346-374 (`fakeHost()`, re-read immediately before filing):
```ts
function fakeHost(): { pi: ExtensionAPI; ctx: ExtensionContext } {
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    registerProvider: (): void => {},
    unregisterProvider: (): void => {},
    setModel: (): Promise<boolean> => Promise.resolve(true),
    on: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: workspaceDir,
    hasUI: true,
    model: AVAILABLE_MODEL,
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [AVAILABLE_MODEL],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  return { pi, ctx };
}
```

Every line of the `ctx` object literal from `model:` through `ui: { notify:
(): void => {} }` is character-for-character identical between the two
files (7 of 9 lines), differing only in the `cwd`/`hasUI` values on the two
lines immediately preceding `model:`.

## Why this is a problem
Two independently-declared fixtures — the `AVAILABLE_MODEL` model-registry
row and the `ExtensionContext` fake surrounding it (`isIdle`,
`modelRegistry.getAvailable`/`find`, `sessionManager.getEntries`,
`ui.notify`) — are retyped verbatim in each file rather than shared. Both
files exist to drive the same production composition
(`composeExtensionInstance`) over the same result-channel seam for the same
RFC section, so a change to the `ExtensionContext` shape this harness
satisfies (a new required field, a different `modelRegistry` return shape)
has to be independently applied in both places to keep both files compiling
against the same production type.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports an `AVAILABLE_MODEL` fixture or
an `ExtensionContext` builder for this "one available model, idle, empty
session manager" shape; the two files' independently-arrived-at identical
`ctx` object is the observation that such a shared home is missing, not a
design for one.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited code is a fixture builder, not a pinned count or inventory.
- Recording-double check: `pi`/`ctx` here are static configuration fakes with
  no call recording backing a "never called" assertion; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "subagent-result-channel-factory.test.ts\|production-result-channel.test.ts" docs/bugs/*.md` → 0 hits; neither file is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-result-channel-factory.test.ts\|production-result-channel.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the identical `ctx`/`AVAILABLE_MODEL` fixture could be shared.
- Coverage check: the claim is about a repeated fixture DEFINITION, not a
  missing test path; each file's own tests exercise its own copy fully.
- Overlap check: `grep -rl "resolvingHost\|AVAILABLE_MODEL" quality/intake/*.md` → qw20260917154546-d7-02-resolvinghost-double-duplicated.md already cites both files' distinct `resolvingHost()`/`ExecutableHost` doubles (a different fixture, at different lines) as a separate duplication; that finding's locations do not include the `AVAILABLE_MODEL` constant or the `ctx`/`fakeHost`/`makeHarness` object this finding cites, so no already-filed candidate names this root cause.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce byte-for-byte at the cited lines (factory:21, 64-84; production:323, 346-374), the `model`/`isIdle`/`modelRegistry{getAvailable,find}`/`sessionManager`/`ui` ctx block and the AVAILABLE_MODEL literal are identical, both copies are live same-commit siblings (97e4ef27), and no shared home exists — tests/helpers/model-registry-fixture.ts exports only `model()`/`registryOf()` (a `ModelRegistrySurface` without `find`, no ctx) and compose-workspace-harness.ts's `makeHost` ctx carries no `model`/`isIdle`/`sessionManager`; D7 copy-paste-fixture class, no gate/recording-double/coverage-matrix/bug-doc carve-out applies, no tracked PTQ names these files or this fixture; note for the fixer: the identical `const AVAILABLE_MODEL` + `getAvailable: () => [AVAILABLE_MODEL]` ctx recurs in 4 files not 2 — also tests/subagent-placement-load-refusal.test.ts:25,~52-70 and tests/subagent-root-registration-refusal-envelope.test.ts:162,~255-265 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
