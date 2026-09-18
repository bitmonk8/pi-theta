---
id: PTQ-0593
title: e2e-s5-package-discovery-composition-root.test.ts redeclares a same-named runProductionLoad instead of importing tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s5-package-discovery-composition-root.test.ts:46-62
  - tests/helpers/production-load-harness.ts:26-54
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# e2e-s5-package-discovery-composition-root.test.ts redeclares a same-named runProductionLoad instead of importing tests/helpers/production-load-harness.ts

## Observation
`tests/e2e-s5-package-discovery-composition-root.test.ts` declares its own
local `async function runProductionLoad(cwd)` that builds a fake, no-UI
`ExtensionAPI`/`ExtensionContext` pair (`getFlag`, `getCommands`,
`sendMessage`, `sendUserMessage`, `getActiveTools`, `setActiveTools`,
`modelRegistry.getAvailable`, `ui.notify`) and calls the real
`discoverAndComposeFixtures(pi, ctx)`, returning the registered slash names.
`tests/helpers/production-load-harness.ts` already exports a function of the
identical name, `runProductionLoad(cwd, opts)`, built for exactly this
purpose (its own header: "the shipped composition root's discovery/compose
pass over `cwd` through a fake, no-UI host") with the same six-member `pi`
double in the same order and the same `ctx` shape, extended with configurable
options and a stderr-diagnostic capture the in-scope file does not need. The
in-scope file's own `runProductionLoad` returns a strict subset of the
canonical helper's `LoadOutcome.registered` field and could call the
canonical helper and read `.registered` directly; instead it re-derives the
fake host from scratch under the same function name.

## Evidence
tests/e2e-s5-package-discovery-composition-root.test.ts:42-62 (re-read
immediately before filing):
```ts
/**
 * Drive the PRODUCTION COMPOSE HELPER over a real on-disk workspace with an
 * empty model registry (no live model). Returns the registered slash names.
 */
async function runProductionLoad(cwd: string): Promise<readonly string[]> {
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return fixtures.map((f) => f.slashName);
}
```

tests/helpers/production-load-harness.ts:26-54 (re-read immediately before
filing; the exported canonical helper of the identical name):
```ts
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
    getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
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

The six `pi` member names (`getFlag`, `getCommands`, `sendMessage`,
`sendUserMessage`, `getActiveTools`, `setActiveTools`) appear in the identical
order in both declarations; the `ctx` shape (`cwd`, `modelRegistry.getAvailable`,
`ui.notify`) matches too, simplified to fixed no-op returns in the in-scope
file rather than the canonical helper's configurable `opts`-driven ones.

## Why this is a problem
The in-scope file's local function carries the same name as the exported
canonical helper (`runProductionLoad`) and reconstructs the same fake-host
shape the canonical helper already builds — every field the in-scope file
reads off the result (`fixtures.map((f) => f.slashName)`) is already exposed
as `LoadOutcome.registered` by the canonical helper. A change to the fake
`ExtensionAPI`/`ExtensionContext` shape `discoverAndComposeFixtures` expects
(a new member the production composition root reads) must be hand-applied in
both places; today only the canonical helper's call sites would pick it up.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `runProductionLoad` already
returns everything the in-scope file's local function computes (via
`.registered`), and the file's own `plant`/`beforeAll` fixture-planting logic
does not otherwise depend on the local function's shape — the canonical
helper is the already-built substitute this file's local declaration has no
counterpart reason to duplicate.

## False-positive check
- Gate-pin check: `tests/e2e-s5-package-discovery-composition-root.test.ts`
  does not match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `registered` backs positive delivery assertions
  (`expect(registered).toContain("greet-e2e-s5")`, `.not.toContain(...)`,
  `.toHaveLength(1)`), not a MUST-NOT witness needing the recording-double
  carve-out — this finding targets the redeclared harness, not the validity
  of those assertions.
- docs/bugs/ signature search: `grep -rn
  "e2e-s5-package-discovery-composition-root" docs/bugs/*.md` hits
  docs/bugs/0076, 0183, 0207 (each discussing stale comments in this file,
  none discussing or sanctioning the local `runProductionLoad` redeclaration
  or citing a reason it must not import the helper).
- coverage-matrix/bug-doc citation search: `grep -n
  "e2e-s5-package-discovery-composition-root.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. The file IS named in
  docs/bugs/0076/0183/0207's own text (discussing unrelated stale-comment
  findings against this same file), but none of those citations concerns the
  harness this finding targets, and this finding proposes no merge, rename,
  or deletion of the file or any `it()`/`describe()` inside it.
- Coverage check: the claim is about a repeated harness DEFINITION (the same
  function name, reconstructing a subset of an already-exported helper's
  return shape), not a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (test :46-62, harness :26-54); the local double is the same six `pi` members in the same order plus the same `ctx` shape, and its return equals `LoadOutcome.registered` under the helper's defaults (`getFlag`→undefined, `getCommands`→[], `getAvailable`→[]), so `runProductionLoad(cwd).registered` is a drop-in; coverage-matrix 0 hits, bugs 0076/0183/0207 name the file only for stale-comment findings and 0207's non-goals do not sanction the local redeclaration; not a gate test; no existing PTQ cites this file (PTQ-0210/0240/0259/0312/0358 each target other files, per-file precedent) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
