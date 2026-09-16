---
id: PTQ-0359
title: b0328 and b0331 each reimplement the discoverAndComposeFixtures fake ExtensionAPI/ExtensionContext host that tests/helpers/production-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0328-root-closure-hash-marshalled.test.ts:99-134
  - tests/b0331-root-winner-preempt.test.ts:135-182
  - tests/helpers/production-load-harness.ts:31-72
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# b0328 and b0331 each reimplement the discoverAndComposeFixtures fake ExtensionAPI/ExtensionContext host that tests/helpers/production-load-harness.ts already exports

## Observation
tests/b0328-root-closure-hash-marshalled.test.ts declares a private
`makeDiscoveryHost`/`runDiscovery` pair: a fake `ExtensionAPI`/`ExtensionContext`
sized to `discoverAndComposeFixtures`, with `ui.notify` calls recorded into a
`notifications` array. tests/b0331-root-winner-preempt.test.ts declares its own
private `runLoad`, building an overlapping fake `pi`/`ctx` pair around the same
`discoverAndComposeFixtures` call (plus its own `stderr` capture via
`vi.spyOn`). tests/helpers/production-load-harness.ts already exports
`runProductionLoad`/`LoadOutcome`, whose own header states it was built because
"several test files independently redeclared the same `LoadOutcome` shape and
the same `runProductionLoad` function... This module centralises" that read.
Neither b0328 nor b0331 imports it; both re-derive the same fake host locally
instead.

## Evidence

tests/b0328-root-closure-hash-marshalled.test.ts:99-113 (`makeDiscoveryHost`'s
`pi` half — every method name, order and body matches the canonical helper's
six-method core, plus one extra no-op, `getAllTools`):
```ts
function makeDiscoveryHost(cwd: string): {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notifications: string[];
} {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
  } as unknown as ExtensionAPI;
```

tests/b0328-root-closure-hash-marshalled.test.ts:114-124 (the `ctx` half and
return — the same `cwd`/`modelRegistry.getAvailable`/`ui.notify`-recording
shape as the canonical helper's `ctx`):
```ts
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  return { pi, ctx, notifications };
}
```

tests/b0328-root-closure-hash-marshalled.test.ts:126-134 (`runDiscovery`, the
same discover-and-reshape call the canonical helper performs internally):
```ts
async function runDiscovery(cwd: string): Promise<LoadOutcome> {
  const host = makeDiscoveryHost(cwd);
  const fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
  return {
    fixtures,
    registered: fixtures.map((f) => f.slashName),
    notifications: host.notifications,
  };
}
```

tests/b0331-root-winner-preempt.test.ts:142-154 (`runLoad`'s `pi` half — the
same core six methods as the canonical helper, `getFlag`/`getCommands`
parameterised for this file's `--theta`-flag/Pi-owned-command scenario, plus
four extra no-ops):
```ts
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? thetaFlag : undefined),
    getCommands: (): readonly unknown[] => piOwnedCommands,
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    registerFlag: (): void => {},
    on: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
  } as unknown as ExtensionAPI;
```

tests/b0331-root-winner-preempt.test.ts:155-164 (the `ctx` half — same
`cwd`/`modelRegistry.getAvailable`/`ui.notify`-recording shape):
```ts
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

tests/b0331-root-winner-preempt.test.ts:172-179 (the same
`discoverAndComposeFixtures` call and reshape):
```ts
    const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
    return {
      registered: fixtures.map((f) => f.slashName),
      descriptionOf: (slug: string): string | undefined =>
        fixtures.find((f) => f.slashName === slug)?.description,
      notifications,
      stderr: stderrChunks.join(""),
    };
```

tests/helpers/production-load-harness.ts:50-63 (the canonical
`runProductionLoad`'s signature and `pi` half — the six methods both files'
copies above match):
```ts
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/helpers/production-load-harness.ts:64-72 (the canonical `ctx` half):
```ts
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

Search: `grep -rln "async function runProductionLoad\|function runProductionLoad\|function makeDiscoveryHost\|function runLoad\b" tests --include="*.test.ts"` → 26 files carry a local variant of this
`discoverAndComposeFixtures`-sized fake-host family; `grep -rl
"production-load-harness" tests --include="*.test.ts"` → exactly 3 files
import the canonical helper (tests/arg-mismatch-diagnostic-count-by-surface.test.ts,
tests/b0297-bind-model-nonscalar-production-load.test.ts,
tests/conformance/production-conformance.test.ts), none of which is
b0328 or b0331.

## Why this is a problem
`tests/helpers/production-load-harness.ts` exists specifically to hold this
fake `ExtensionAPI`/`ExtensionContext`-over-`discoverAndComposeFixtures` shape
(its own header names the exact redundancy class: "the same `LoadOutcome`
shape and the same `runProductionLoad` function"), and PTQ-0210/PTQ-0240/
PTQ-0259 already migrated three other callers to it. b0328's
`makeDiscoveryHost` and b0331's `runLoad` are two more, independent
re-derivations of the identical core (the same six-method `pi` stub, the
same `cwd`/`modelRegistry.getAvailable`/recording-`ui.notify` `ctx` stub, the
same `discoverAndComposeFixtures(pi, ctx)` call and reshape into a
`{registered, notifications}`-shaped record) that this review's own scope
confirms were never migrated: both files still declare their host locally,
and the canonical helper's three importers are all files outside this
review's five.

## Suggested direction (non-binding, optional)
tests/helpers/production-load-harness.ts already exports the `runProductionLoad`/
`ProductionLoadOptions` pair whose `pi` half both files' local copies match
almost verbatim; the two behavioural extras each file needs on top of it
(b0328's raw `fixtures` passthrough, b0331's flag/Pi-owned-command
parameterisation and `stderr` capture) are the inputs/outputs the canonical
helper does not yet expose a parameter for.

## False-positive check
- Gate-pin check: neither tests/b0328-root-closure-hash-marshalled.test.ts nor
  tests/b0331-root-winner-preempt.test.ts matches `*gate*.test.ts` or the
  named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); neither
  cited block is a pinned count or inventory assertion.
- Recording-double check: `notifications`/`stderrChunks` are ordinary
  recording arrays consumed to assert presence/absence of diagnostic content,
  not a MUST-NOT-called witness; this finding claims the fake host's
  DEFINITION is duplicated, not that any assertion built on it is unsound.
- docs/bugs/ signature search: docs/bugs/0328-root-callee-closure-hash-never-marshalled.md
  Status "fixed (0.306.0)"; docs/bugs/0331-theta-root-marshalling-flattens-source-priority.md
  Status "fixed (0.323.0)". Neither document discusses or requires any
  particular implementation of the fake host. `npx vitest run
  tests/b0328-root-closure-hash-marshalled.test.ts tests/b0331-root-winner-preempt.test.ts`
  → 2 files, 19 tests, all passing at HEAD, so neither is a documented
  correct-reason red. Other bug documents (0330, 0343, 0467 for b0328;
  0355, 0440, 0446, 0459, 0460, 0474 for b0331) cite these files only as
  regression witnesses ("stays green", pass counts, sibling-timeout noise),
  never as a rationale for the fake host's local shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0328-root-closure-hash-marshalled\|b0331-root-winner-preempt"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test file or `it()`/`describe()` — only
  that the internal fake-host function each file already has could import a
  shared implementation — so no witness-list citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0210 (fixed)
  migrated five different files to `runProductionLoad`; PTQ-0240 (fixed)
  migrated a sixth (b0297); PTQ-0259 (fixed) migrated a seventh
  (tests/conformance/production-conformance.test.ts); PTQ-0312 (fixed)
  covered the surrounding plant/dispose workspace lifecycle for three of
  those same files. None of the four names b0328 or b0331, and re-reading
  each of their own Evidence sections confirms their cited excerpts are
  different files entirely. This is not the `NOOP_CHECKPOINT`/`rootDouble`/
  `createProductionProducerDeps` trio PTQ-0209 already covers (that trio
  wraps `createProductionProducerDeps`, not `discoverAndComposeFixtures`, and
  neither b0328 nor b0331 declares a `rootDouble`/`NOOP_CHECKPOINT` of that
  shape for this seam).
- Coverage-drift check: the claim is about a repeated fake-host DEFINITION,
  not a missing test path; every method on both local copies is exercised by
  each file's own currently-passing tests (19/19 confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt and search reproduced exactly (byte-identical pi/ctx stubs in both files vs. the canonical helper, 26/3/0 grep counts, 19/19 green, both bug docs fixed with no host-shape requirement), no overlap with PTQ-0209/0210/0240/0259/0312 or the sibling same-wave b0343/workspace-scaffold filings, in-scope D7 copy-paste-fixture duplication (triage: claude-opus-5)
