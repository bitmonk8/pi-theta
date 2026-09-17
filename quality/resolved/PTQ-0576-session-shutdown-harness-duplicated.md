---
id: PTQ-0576
title: e2e-s6-session-shutdown-real-teardown.test.ts's Harness/makeHarness/makeTheta triple is byte-identical to session-shutdown-wiring.test.ts's
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s6-session-shutdown-real-teardown.test.ts:42-108
  - tests/session-shutdown-wiring.test.ts:43-104
  - tests/forwarding-detach-wiring.test.ts:88-141
  - tests/active-invocation-wiring.test.ts:192-245
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# e2e-s6-session-shutdown-real-teardown.test.ts's Harness/makeHarness/makeTheta triple is byte-identical to session-shutdown-wiring.test.ts's

## Observation
`tests/e2e-s6-session-shutdown-real-teardown.test.ts` declares a `Harness`
interface (`pi`, `subscriptions`, `fireSessionStart`, `fireSessionShutdown`),
a `makeHarness()` function building a fake `ExtensionAPI`/`ExtensionContext`
pair with a `session_start`/`session_shutdown` subscription table, and a
`makeTheta(slashName): ParsedTheta` builder. `tests/session-shutdown-wiring.test.ts`
declares the identical `Harness` interface, an identical `makeHarness()`
body, and a byte-identical `makeTheta`. `tests/forwarding-detach-wiring.test.ts`
and `tests/active-invocation-wiring.test.ts` (both out of this review's
scope) declare the same shape under the name `FactoryHarness`/
`makeFactoryHarness()` plus the same `makeTheta`, and each carries a comment
naming the other as the shape it mirrors ("mirrors active-invocation-wiring"
/ "mirrors session-shutdown-wiring"). No module under `tests/helpers/`
exports this triple; all four files redeclare it independently.

## Evidence
tests/e2e-s6-session-shutdown-real-teardown.test.ts:42-108 (re-read
immediately before filing):
```ts
interface Harness {
  readonly pi: ExtensionAPI;
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(reason: SessionShutdownEvent["reason"]): Promise<void>;
}

function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
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
```

tests/session-shutdown-wiring.test.ts:43-63 (re-read immediately before
filing; the identical interface and the opening of the identical function):
```ts
interface Harness {
  readonly pi: ExtensionAPI;
  readonly subscriptions: Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(reason: SessionShutdownEvent["reason"]): Promise<void>;
}

function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
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
```

tests/e2e-s6-session-shutdown-real-teardown.test.ts:93-108 (the return tail
and `makeTheta`, byte-identical to session-shutdown-wiring.test.ts:93-108):
```ts
  return {
    pi,
    subscriptions,
    fireSessionStart: () => fire("session_start", { type: "session_start" }),
    fireSessionShutdown: (reason) =>
      fire("session_shutdown", { type: "session_shutdown", reason }),
  };
}

function makeTheta(slashName: string): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run: async (): Promise<void> => {},
  };
}
```

tests/forwarding-detach-wiring.test.ts:88-141 (the `FactoryHarness` /
`makeFactoryHarness` variant, its own comment naming the mirrored file, plus
the same `makeTheta` body):
```ts
// --- factory-level scaffolding (mirrors active-invocation-wiring) ------------

interface FactoryHarness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
  fireSessionShutdown(reason: SessionShutdownEvent["reason"]): Promise<void>;
}

function makeFactoryHarness(): FactoryHarness {
  const commands = new Map<string, unknown>();
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
```
```ts
function makeTheta(slashName: string): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run: async (): Promise<void> => {},
  };
}
```

tests/active-invocation-wiring.test.ts:192-245 carries the same
`FactoryHarness`/`makeFactoryHarness`/`makeTheta` block with its own
reciprocal comment "mirrors session-shutdown-wiring" (verified by direct
read: the function bodies at 201-238 match forwarding-detach-wiring.test.ts's
character-for-character apart from the file being 151 vs 65 lines away from
its own `makeTheta`).

Pattern-wide search: `grep -n "^function makeTheta(slashName: string): ParsedTheta {" tests/*.test.ts` returns exactly these four files among the reviewed-plus-adjacent set (a fifth and sixth occurrence, `tests/drain-gated-dispatch-integration.test.ts` and sibling bug files, carry a *different* two-argument `makeTheta(slashName, run)` signature already covered by a separate finding this wave and are not counted here).

## Why this is a problem
`tests/forwarding-detach-wiring.test.ts` and `tests/active-invocation-wiring.test.ts`
each carry a comment naming the other as the file the block "mirrors," so
both authors already recognised the shape as shared at the time of writing;
neither imported it, and `tests/e2e-s6-session-shutdown-real-teardown.test.ts`
and `tests/session-shutdown-wiring.test.ts` independently arrived at the
byte-identical `Harness`/`makeHarness`/`makeTheta` form without a cross-
reference at all. A change to the fake-`pi` member set the real `factory.ts`
reads, or to the `fireSessionShutdown` firing shape, must be hand-applied in
four places today.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module hosts a "fake pi + session_start/session_shutdown
subscription table + minimal ParsedTheta" harness; the two self-naming
comment pairs already in the tree are the observation that a shared base for
this specific shape is missing, not a design for one.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kin; not applicable.
- Recording-double check: `subscriptions`/`commands` back genuine positive
  assertions in each file (e.g. entries aborted/stamped after
  `fireSessionShutdown`), not MUST-NOT witnesses — this finding targets the
  redeclared harness definition, not the validity of any assertion built on
  it.
- docs/bugs/ signature search: `grep -rln "mirrors active-invocation-wiring\|mirrors session-shutdown-wiring" docs/bugs/` → 0 hits; the mirroring comments exist only in the test files themselves, and neither names a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "e2e-s6-session-shutdown-real-teardown.test.ts\|session-shutdown-wiring.test.ts\|forwarding-detach-wiring.test.ts\|active-invocation-wiring.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any file or `it()`/`describe()` — only that
  the harness pieces could be imported rather than redeclared.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member of each file's double is exercised by that
  file's own tests.

## Triage
verdict: confirmed — independently re-verified: diff of e2e-s6:42-101 vs session-shutdown-wiring:43-102 (Harness+makeHarness) is empty, md5 of makeTheta is identical across all four files (e2e-s6:102, session-shutdown-wiring:104, forwarding-detach:139, active-invocation:243), diff of forwarding-detach:90-137 vs active-invocation:194-241 (FactoryHarness/makeFactoryHarness) is empty, and the Harness→FactoryHarness variant differs only by the exposed `subscriptions`, `sendUserMessage` and `on` formatting (renamed-only); the reciprocal "mirrors" comments sit at forwarding-detach:88 / active-invocation:192 as cited; `grep "^function makeTheta(slashName: string): ParsedTheta {" tests/*.test.ts` → exactly these 4 (the 4 two-arg makeTheta files are correctly excluded); no tests/helpers module fires session_shutdown (grep fireSessionShutdown|session_shutdown tests/helpers/ → 0; watch-arming-harness.ts exposes only pi+fireSessionStart over real composeExtensionInstance, not this composeInstance-stub shape); each file imports only ./helpers/fake-clock (+fixture-dispatch-harness); no gate files, coverage-matrix grep → 0, all 4 files green 18/18; not a duplicate — PTQ-0403 covers active-invocation-wiring's DISPATCH-side Checkpoint/rootWith/noopPi/promptTheta block (now fixture-dispatch-harness.ts), PTQ-0363 is b0310/b0339 only, and same-wave siblings d7-01-b0371/d7-01-b0401 cite the drain-gated/b0371/b0401/double-session-start copies of the fake-pi family, so under the store's per-copy-site convention this filing owns these four sites (fixer should share one extraction with them); shard-58's "documented mirroring convention" non-filing note is not a ruled carve-out — PTQ-0403 was confirmed with the same reciprocal comments; minor tolerated drift: session-shutdown-wiring's makeTheta ends at 111, not 104/108 (a doc-comment line at 103) (triage: claude-fable-5-1)
