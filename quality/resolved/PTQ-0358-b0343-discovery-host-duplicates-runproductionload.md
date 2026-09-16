---
id: PTQ-0358
title: b0343's makeDiscoveryHost/runDiscovery reimplements the canonical runProductionLoad fake host instead of importing tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0343-proto-hash-carrier-row.test.ts:74-112
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# b0343's makeDiscoveryHost/runDiscovery reimplements the canonical runProductionLoad fake host instead of importing tests/helpers/production-load-harness.ts

## Observation
tests/b0343-proto-hash-carrier-row.test.ts declares a module-scope `LoadOutcome` interface, a `makeDiscoveryHost(cwd)` function that builds a fake `ExtensionAPI`/`ExtensionContext` pair sized to `discoverAndComposeFixtures`, and a `runDiscovery(cwd)` function wrapping the call and reshaping the result into `{registered, notifications}`. tests/helpers/production-load-harness.ts already exports the identical shape — a `LoadOutcome` interface and an `async function runProductionLoad(cwd, opts)` calling `discoverAndComposeFixtures` over a fake `pi`/`ctx` pair whose `pi` object is byte-identical to b0343's own (b0343 adds one extra `getAllTools` method) and whose `ctx`/notify-recording pattern matches structurally. b0343 does not import this helper; the block's own leading comment states it "mirrors b0328 / the e2e refusal harness" — crediting a sibling test file, not the canonical helper module that already exists for this exact purpose.

## Evidence

tests/b0343-proto-hash-carrier-row.test.ts:74-79 (re-read immediately before filing):
```ts
// ── Shared discovery harness (mirrors b0328 / the e2e refusal harness) ──

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}
```

tests/b0343-proto-hash-carrier-row.test.ts:81-95 — the fake `pi`, compare method-for-method against the canonical helper's own `pi` quoted below:
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

tests/b0343-proto-hash-carrier-row.test.ts:96-104 — the fake `ctx`:
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
```

tests/b0343-proto-hash-carrier-row.test.ts:105-112 — the return and `runDiscovery` wrapper:
```ts
  return { pi, ctx, notifications };
}

async function runDiscovery(cwd: string): Promise<LoadOutcome> {
  const host = makeDiscoveryHost(cwd);
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(host.pi, host.ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications: host.notifications };
}
```

tests/helpers/production-load-harness.ts:6-17 — the helper's own header, stating exactly this pattern is what it exists to end:
```ts
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, a `process.stderr.write` interposition that
// captures `makeLoadEmit`'s rendered diagnostic lines (the load's no-UI
// mirror) around one `discoverAndComposeFixtures` call, and a reshape of the
// result into `{registered, notifications, diagnosticLines}`. The same files
// also independently redeclared the temp-workspace lifecycle WRAPPED around
// that call — `mkdtemp` a project root, `mkdir` its `.pi/theta`, a
// per-fixture write loop, an optional `.pi/settings.json` write, and an
// `afterAll` recursive removal — so `plantThetaWorkspace` / `disposeWorkspace`
// centralise that half too.
```

tests/helpers/production-load-harness.ts:31-36 — the canonical `LoadOutcome`, a superset of b0343's own copy:
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
}
```

tests/helpers/production-load-harness.ts:56-63 — the canonical `pi`, byte-identical to b0343's own six methods/order/bodies/cast, apart from b0343's one extra `getAllTools` line:
```ts
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/helpers/production-load-harness.ts:64-72 — the canonical `ctx`, structurally identical to b0343's own (`modelRegistry.getAvailable()` defaulting to `[]`, `ui.notify` recording into an array):
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

Exact search: `grep -rln "from \"./helpers/production-load-harness\"" tests --include="*.test.ts"` → exactly two files (tests/arg-mismatch-diagnostic-count-by-surface.test.ts, tests/b0297-bind-model-nonscalar-production-load.test.ts); b0343 is not among them. `grep -n "function makeDiscoveryHost\|function runDiscovery" tests/b0328-root-closure-hash-marshalled.test.ts tests/b0343-proto-hash-carrier-row.test.ts` → one hit of each name in each file (b0328 is outside this wave's six-file scope and is cited only as the pattern context b0343's own comment names, not as an additional location).

## Why this is a problem
tests/helpers/production-load-harness.ts's own header states its purpose in the past tense — several files "independently redeclared" this exact fake-host/reshape pattern, and the module "centralises" it. b0343 was first committed 2026-08-31, eleven days before this helper was added (2026-09-11, per the helper's own `PTQ-0210` credit); at authoring time no canonical helper existed to import. Today one does, exporting a `pi` object byte-identical to b0343's own bar one extra method and a `ctx`/reshape pattern matching structurally, yet b0343's `makeDiscoveryHost`/`runDiscovery` were never migrated — the block remains a private, independently-typed re-derivation of the fixture the canonical helper already holds, credited in-file to a sibling test rather than to the module built to replace it.

## Suggested direction (non-binding, optional)
tests/helpers/production-load-harness.ts already exports a `runProductionLoad` whose fake `pi` matches b0343's own copy method-for-method; the one addition b0343's copy carries (`getAllTools`) is the only input the canonical helper does not yet let a caller vary.

## False-positive check
- Gate-pin check: tests/b0343-proto-hash-carrier-row.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are fake-host plumbing, not a pinned count or inventory assertion.
- Recording-double check: `makeDiscoveryHost`'s `notifications` array does back a MUST-NOT witness elsewhere in this same file (cell (C-admit) asserts `.not.toContain(PROTO_MISMATCH_MSG)`), but this finding does not claim that assertion cannot fail — it claims the fake host's own CONSTRUCTION is copy-pasted rather than imported, a distinct claim the negative-witness carve-out does not cover.
- docs/bugs/ signature search: docs/bugs/0343-proto-theta-root-name-silent-no-op-hash-carrier-write.md Status "fixed (0.320.0)". `npx vitest run tests/b0343-proto-hash-carrier-row.test.ts` → 5 passed (5) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0343-proto-hash-carrier-row" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0343-proto-hash-carrier-row" docs/bugs/*.md` → only its own bug document. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that the fake host could be imported rather than redeclared — so no citation is disturbed.
- Scope note: tests/b0328-root-closure-hash-marshalled.test.ts is outside this wave's six-file scope; it is cited only as the pattern context b0343's own comment already names (an equally unmigrated sibling copy), not as an additional reviewed location.
- Coverage check: this finding does not claim a missing test path; every cited function is exercised by b0343's own 5/5 passing tests (confirmed above). The claim is confined to a repeated fake-host DEFINITION now available for import, not to test behaviour or coverage.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt/line-cite reproduces exactly (pi block byte-identical to the canonical helper bar b0343's extra getAllTools, ctx structurally matching, both searches reproduce as stated), git dates confirm b0343 (2026-08-31) predates the PTQ-0210 helper (2026-09-11) and the block was never migrated since, and this is in-scope D7 copy-paste-fixture/double duplication matching the confirmed PTQ-0210/0240/0259 precedent for a file none of those cite (the FP-check's docs/bugs/*.md grep undercounts by one unrelated citation — bug 0329's cell C-drop, an assertion untouched by this finding's proposed fix — which doesn't change the outcome). (triage: claude-opus-5)
