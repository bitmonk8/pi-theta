---
id: PTQ-0240
title: b0297-bind-model-nonscalar-production-load.test.ts reimplements the canonical runProductionLoad fake host instead of importing tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0297-bind-model-nonscalar-production-load.test.ts:107-141
  - tests/helpers/production-load-harness.ts:21-54
sites: 1
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0297-bind-model-nonscalar-production-load.test.ts reimplements the canonical runProductionLoad fake host instead of importing tests/helpers/production-load-harness.ts

## Observation
tests/b0297-bind-model-nonscalar-production-load.test.ts declares its own
private `LoadOutcome` interface and `async function runProductionLoad(cwd):
Promise<LoadOutcome>`, building a fake `ExtensionAPI`/`ExtensionContext` pair
and calling the real `discoverAndComposeFixtures`. `tests/helpers/production-load-harness.ts`
already exports a `LoadOutcome`/`runProductionLoad` pair built for exactly
this purpose (created to fix PTQ-0210, a prior finding about this same
function being copied across five other files). The fake `pi` object literal
in the reviewed file's local copy is byte-identical to the canonical helper's;
its `ctx` differs only in the one field this specific bug's scenario needs
(`modelRegistry.getAvailable()` returning one fake model instead of an empty
array) and in dropping the notification/diagnostic-line capture this file
does not use.

## Evidence
tests/b0297-bind-model-nonscalar-production-load.test.ts:107-110 — the local
`LoadOutcome`, a narrowed subset of the canonical one:
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
}
```

tests/b0297-bind-model-nonscalar-production-load.test.ts:115-123 — the local
`runProductionLoad`'s signature and fake `pi`, byte-identical (same six
methods, same order, same bodies, same cast) to the canonical helper's:
```ts
async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/b0297-bind-model-nonscalar-production-load.test.ts:124-137 — the local
`ctx`, differing from the canonical helper only in the `modelRegistry`
literal (a fake available model instead of an empty array) and in `ui.notify`
being a bare no-op instead of a recording push:
```ts
  const ctx = {
    cwd,
    // One available model with NO `strictCapable` field: with the indicator
    // exposed on no available model, a resolved reference takes the probe's
    // silent-admit branch (bug 0475) and still registers, so the
    // settings-fallback path the offender would take pre-fix is an admitting
    // path.
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [{ provider: "test", id: "binder" }],
    },
    ui: {
      notify: (): void => {},
    },
  } as unknown as ExtensionContext;
```

tests/b0297-bind-model-nonscalar-production-load.test.ts:139-140 — the call
and reshape, a subset of the canonical helper's final reshape:
```ts
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName) };
```

tests/helpers/production-load-harness.ts:21-26 — the canonical, already-built
`LoadOutcome`:
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
}
```

tests/helpers/production-load-harness.ts:35-45 — the canonical
`runProductionLoad`'s signature and fake `pi`, whose six methods, order,
bodies, and cast are byte-identical to the reviewed file's own copy quoted
above:
```ts
export async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
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

tests/helpers/production-load-harness.ts:46-54 — the canonical `ctx`,
differing from the reviewed file's own copy only in the `modelRegistry`
literal and the `ui.notify` body:
```ts
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

Exactly one file in the whole `tests/` tree imports the canonical helper
(`grep -rl "production-load-harness" tests --include="*.test.ts"` →
`tests/arg-mismatch-diagnostic-count-by-surface.test.ts` only), while `grep -rl
"async function runProductionLoad\|function runProductionLoad" tests
--include="*.test.ts"` returns 20 files carrying their own local copy,
including this one.

## Why this is a problem
`tests/helpers/production-load-harness.ts`'s own header states its purpose:
"Several test files independently redeclared the same `LoadOutcome` shape and
the same `runProductionLoad` function... This module centralises" that
read. `git log` shows this helper module was added on 2026-09-11 (the fix for
PTQ-0210), a date after `tests/b0297-bind-model-nonscalar-production-load.test.ts`
was added (2026-09-01) — so at authoring time no canonical helper existed to
import. Today, one now exists in the tree, exporting the identical
function name over a fake `pi` object confirmed byte-identical to the
reviewed file's own copy, yet the reviewed file's local `runProductionLoad`
was not migrated to it; it remains a private, independently-typed
reimplementation of the same fixture the canonical helper was built to hold.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` already exports a `runProductionLoad`
whose `pi` half this file's own copy matches byte-for-byte; the one behavioural
difference this file's scenario needs — a `ctx.modelRegistry.getAvailable()`
that reports one fake model rather than none — is the one input the canonical
helper does not yet let a caller vary.

## False-positive check
- Gate-pin check: `tests/b0297-bind-model-nonscalar-production-load.test.ts`
  does not match `*gate*.test.ts` or the named kin.
- Recording-double check: `runProductionLoad`'s fake `pi`/`ctx` are ordinary
  no-op/return-value doubles, not a MUST-NOT-called witness; this finding is
  about the fixture's construction being copied, not about a negative
  assertion built on top of it.
- docs/bugs/ signature search: `docs/bugs/0297-bind-context-nonscalar-silently-registers.md`
  is **Status: fixed (0.330.0)** and pins this file as "a composition-level
  offline witness (3 cells)" and `npx vitest run
  tests/b0297-bind-model-nonscalar-production-load.test.ts → 3/3`; it does not
  discuss or require any particular implementation of the fake host, so no
  documented correct-reason red applies. The file is fully green at HEAD (3/3).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0297-bind-model-nonscalar-production-load" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any test —
  only that an internal fixture function could be imported rather than
  redefined — so no witness-list citation is disturbed.
- Distinct from PTQ-0210 (already fixed): that finding covered five OTHER
  files (`tests/arg-mismatch-diagnostic-count-by-surface.test.ts`,
  `tests/invoke-arg-type-mismatch-wired.test.ts`,
  `tests/division-result-type-number-invoke.test.ts`,
  `tests/invoke-arg-array-literal-provable.test.ts`,
  `tests/modulo-zero-result-type-number.test.ts`), none of which is
  `tests/b0297-bind-model-nonscalar-production-load.test.ts`, and predates the
  canonical helper's existence. This finding's subject is the now-existing
  canonical helper's non-adoption by a file not among those five — a
  copy-paste-fixture claim the "cite the canonical helper when it exists"
  class names directly, not a re-litigation of the boilerplate-duplication
  claim PTQ-0210 already settled.
- Scope: only `tests/b0297-bind-model-nonscalar-production-load.test.ts` is in
  this wave's review scope; `tests/helpers/production-load-harness.ts` is cited
  solely as the existing canonical counterpart, and the 20-file/1-file search
  counts are cited solely as pattern context, not as additional reviewed
  locations.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — pi/ctx excerpts and line numbers verified byte-exact in both files, git dates confirm b0297 (2026-09-01) predates the canonical helper (2026-09-11, PTQ-0210's fix commit, which migrated only one of its five sites), PTQ-0210's five distinct sites and docs/bugs/0297's green 3/3 status both check out, and this is in-scope D7 copy-paste-fixture/double duplication with no false-positive carve-out applying (triage: claude-opus-5)
