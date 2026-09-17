---
id: PTQ-0669
title: theta-callable-call-arity.test.ts re-derives runProductionLoad and the plant/dispose workspace lifecycle instead of importing tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/theta-callable-call-arity.test.ts:419-469
  - tests/helpers/production-load-harness.ts:27-100
sites: 1                     # count of occurrences cited in Evidence (the reviewed file's own re-derivation)
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# theta-callable-call-arity.test.ts re-derives runProductionLoad and the plant/dispose workspace lifecycle instead of importing tests/helpers/production-load-harness.ts

## Observation
`tests/theta-callable-call-arity.test.ts` declares its own module-scope
`interface LoadOutcome` (`registered`, `notifications`), its own `async
function runProductionLoad(cwd)` that builds a fake no-UI `ExtensionAPI`/
`ExtensionContext` pair and calls `discoverAndComposeFixtures`, and its own
`beforeAll`/`afterAll` pair that `mkdtempSync`s a workspace, `mkdirSync`s its
`.pi/theta`, writes one file per planted fixture, writes a `.pi/settings.json`,
calls the local `runProductionLoad`, and `rmSync`s the workspace on teardown.
`tests/helpers/production-load-harness.ts` already exports exactly this
shape — `runProductionLoad(cwd, opts)`, `plantThetaWorkspace(dirPrefix,
fixtures, settingsJson)`, and `disposeWorkspace(workspaceDir)` — built for
the stated purpose (per its own header) of centralising this exact
fake-host/plant/dispose sequence after "several test files independently
redeclared" it. `theta-callable-call-arity.test.ts` imports none of the
three.

## Evidence
tests/theta-callable-call-arity.test.ts:419-469 (re-read immediately before
filing):
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
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
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0071-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/helpers/production-load-harness.ts:27-100 — the canonical helper
already answering this exact shape (`LoadOutcome`, `runProductionLoad`,
`plantThetaWorkspace`, `disposeWorkspace`), including a fake `pi`/`ctx` sized
to the identical `discoverAndComposeFixtures` call:
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
  /** The composed fixtures the pass produced (discovery order), for callers that need more than `registered`. */
  readonly fixtures: readonly ThetaFixture[];
}
...
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

Exact search: `grep -n "production-load-harness" tests/theta-callable-call-arity.test.ts` → 0 hits; the file imports `discoverAndComposeFixtures` directly (line 15) rather than the helper wrapping it.

## Why this is a problem
`tests/helpers/production-load-harness.ts`'s own header states it exists
because "several test files independently redeclared the same `LoadOutcome`
shape and the same `runProductionLoad` function… The same files also
independently redeclared the temp-workspace lifecycle WRAPPED around that
call." `tests/theta-callable-call-arity.test.ts` performs exactly the
redeclaration the helper's header describes: the same fake no-UI
`ExtensionAPI`/`ExtensionContext` pair, the same
`mkdtemp`/`mkdir`/write-loop/optional-settings-write/`afterAll`-`rmSync`
lifecycle, and the same reshape into `{ registered, notifications }` (a
subset of the helper's `{ registered, notifications, diagnosticLines,
fixtures }`), instead of calling `plantThetaWorkspace` /
`runProductionLoad` / `disposeWorkspace`.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` already exports
`plantThetaWorkspace`, `runProductionLoad`, and `disposeWorkspace` sized to
this exact fake-host/workspace-lifecycle shape; it is the existing home the
module's own header already points at for this sequence.

## False-positive check
- Gate-pin check: `tests/theta-callable-call-arity.test.ts` does not match
  `*gate*.test.ts` or a named gate kin; the cited lines are fixture/harness
  construction, not a pinned count or inventory.
- Recording-double check: `notifications`/`registered` are legitimate
  recording arrays backing real assertions throughout the file; this finding
  challenges only where the construction code lives, not any assertion made
  against it.
- docs/bugs/ signature search: `grep -rl "theta-callable-call-arity" docs/bugs/*.md` → `docs/bugs/0071-theta-callable-call-arity-unchecked.md` names this file as its own regression-test witness, with no rationale for keeping the load harness file-local rather than importing the shared one.
- coverage-matrix/bug-doc citation search: `grep -n "theta-callable-call-arity.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the local `LoadOutcome`/`runProductionLoad`/plant-dispose block could be replaced by the existing helper's exports.
- Overlap check: `grep -rl "production-load-harness" quality/intake/*.md quality/resolved/*.md` → several hits, none naming `tests/theta-callable-call-arity.test.ts` as a site (each covers a disjoint file set).
- Coverage check: the claim is about a repeated harness DEFINITION already exercised by every cell in this file's own `beforeAll`; no coverage/untested-path claim is made.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (tests/theta-callable-call-arity.test.ts:419-469; tests/helpers/production-load-harness.ts:27-100) and `grep production-load-harness` in the test file → 0 hits; the local block is the exact fake-host + mkdtemp/mkdir/write-loop/settings-write/rmSync sequence the helper's header names as its reason to exist, the helper covers every need the file reads (only `outcome.registered` ×34 and `outcome.notifications` ×27 are consumed, both in the helper's `LoadOutcome`; local `PlantedTheta {stem,text}` is assignable to `PlantedThetaFile`; the `"theta-bug0071-"` prefix and `"{}"` settings map to `plantThetaWorkspace`'s `dirPrefix`/`settingsJson`), the test file predates the helper (f8364db1 2026-08-03 vs 2594cd44 2026-09-11) so it is an un-migrated redeclaration not a design choice, no D7 carve-out applies (not a gate test, no it()/describe() touched, absent from coverage-matrix, bug 0071 doc gives no file-local rationale), and no existing PTQ (0210/0240/0259/0312/0358 each cite disjoint files) or sibling intake candidate names this file for this root cause — mechanical dedupe with the same shape already ratified in PTQ-0240/0259/0358 (triage: claude-fable-5-1)
