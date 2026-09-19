---
id: PTQ-0978
title: b0379 redeclares runProductionLoad/LoadOutcome/workspace-plant-dispose instead of importing tests/helpers/production-load-harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0379-tools-entry-byte-match.test.ts:84-138
  - tests/helpers/production-load-harness.ts:35-61
  - tests/tools-derived-name-shape.test.ts:1-7
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0379 redeclares runProductionLoad/LoadOutcome/workspace-plant-dispose instead of importing tests/helpers/production-load-harness.ts

## Observation
`tests/b0379-tools-entry-byte-match.test.ts:84-138` declares its own `LoadOutcome` interface, its own `runProductionLoad(cwd)` function (a `pi`/`ctx` double sized to `discoverAndComposeFixtures`), and its own `loadWorkspace(thetas)` function that `mkdtemp`s a directory, writes a `.pi/theta/` fixture set plus a `.pi/settings.json`, calls the local `runProductionLoad`, and `rmSync`s the directory in a `finally`. `tests/helpers/production-load-harness.ts:35-61` already exports `runProductionLoad` with the identical `pi`/`ctx` double shape (plus `diagnosticLines` capture and options b0379 doesn't need), and exports `plantThetaWorkspace`/`disposeWorkspace` covering the identical mkdtemp/write/rmSync lifecycle. The file's own comment (`b0379-tools-entry-byte-match.test.ts:81-82`) says the doubles were "copied from tools-derived-name-shape.test.ts", but that file (`tests/tools-derived-name-shape.test.ts:1-7`) now imports `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace`/`LoadOutcome` from the canonical helper rather than declaring them locally.

## Evidence
`tests/b0379-tools-entry-byte-match.test.ts:81-138`:
```ts
// --- Shipped-composition load harness (pi/ctx doubles copied from ------------
// --- tools-derived-name-shape.test.ts) ---------------------------------------

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}

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
```

`tests/b0379-tools-entry-byte-match.test.ts:115-138` (the local plant/dispose lifecycle):
```ts
async function loadWorkspace(
  thetas: Readonly<Record<string, string>>,
): Promise<LoadOutcome> {
  const dir = mkdtempSync(join(tmpdir(), "b0379-"));
  try {
    const thetaDir = join(dir, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    for (const [name, text] of Object.entries(thetas)) {
      writeFileSync(join(thetaDir, name), text, "utf8");
    }
    writeFileSync(join(dir, ".pi", "settings.json"), "{}", "utf8");
    return await runProductionLoad(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

`tests/helpers/production-load-harness.ts:35-61` (the canonical `runProductionLoad`, same `pi`/`ctx` double shape, superset fields):
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  readonly diagnosticLines: readonly string[];
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
```

`tests/tools-derived-name-shape.test.ts:1-7` (the file b0379's own comment names as the copy source, now importing the canonical helper instead of declaring the doubles locally):
```ts
import { readRegistry } from "./helpers/registry-oracle";
import {
  disposeWorkspace,
  plantThetaWorkspace,
  runProductionLoad,
  type LoadOutcome,
} from "./helpers/production-load-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
```

## Why this is a problem
`tests/helpers/production-load-harness.ts:1-21` states it exists precisely because "several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function" plus "the temp-workspace lifecycle WRAPPED around that call". b0379 is exactly the shape that helper was written to absorb — its `runProductionLoad` is the same fake `pi`/`ctx` double, and its `loadWorkspace` re-implements the mkdtemp/mkdir/write-loop/settings-write/rmSync-in-finally lifecycle `plantThetaWorkspace`/`disposeWorkspace` already provide. The file's own attribution comment ("copied from tools-derived-name-shape.test.ts") is now stale: that source file migrated to the canonical helper, leaving b0379 as a copy of a copy that no longer exists at its cited origin.

## Suggested direction (non-binding, optional)
The natural home for this pi/ctx double and plant/dispose lifecycle is the existing `tests/helpers/production-load-harness.ts`, which b0379 does not currently import.

## False-positive check
Gate-pin: not a `*gate*.test.ts` file, no pinned-count carve-out applies. Recording-double carve-out: `runProductionLoad`'s `notify` capture is a positive-witness recorder (what registered/what notified), not a MUST-NOT-called negative witness, so the carve-out does not apply. docs/bugs/ signature search: `grep -rn "b0379" docs/bugs/` finds `docs/bugs/0379-tools-derived-name-judged-on-entry-spelling.md`, whose only mention of this test (line 228) is a witness-run citation ("`npx vitest run tests/b0379-tools-entry-byte-match.test.ts` -> 5 passed") — it pins the test's existence and pass count, not its internal harness plumbing; no correct-reason-red posture applies (the file is green). coverage-matrix/bug-doc citation search: `grep -rn "b0379-tools-entry-byte-match" docs/reference/coverage-matrix.md docs/bugs/*.md` finds the same single bug-doc witness-list citation and no coverage-matrix hit. This finding does not propose merging, renaming, or deleting the cited test — only that its internal `runProductionLoad`/`loadWorkspace` functions could import the canonical helper instead of redeclaring it, leaving the witnessed test names and pass count untouched.

## Triage
verdict: confirmed — all three excerpts reproduce verbatim at tests/b0379-tools-entry-byte-match.test.ts:81-138, tests/helpers/production-load-harness.ts:35-61 and tests/tools-derived-name-shape.test.ts:1-7; the local `runProductionLoad` is the canonical pi/ctx double minus the stderr interposition and options (canonical `LoadOutcome` is a strict superset, so `observed()` and every assertion survive unchanged), `loadWorkspace` is `plantThetaWorkspace("b0379-", …, "{}")` + `runProductionLoad` + `disposeWorkspace`-in-finally with only a `name.theta`→`{stem,text}` key split, and per-call plant/dispose is already the helper's own idiom (`composedRunnableCount`) so the one-workspace-per-cell constraint holds; `grep -rln "^async function runProductionLoad" tests/` lists this file among 16 local redeclarations, the stale "copied from tools-derived-name-shape" attribution is real (that file imports the helper at :1-7), file is green (5/5), docs/bugs/0379 :228 pins only the run/pass count and coverage-matrix has 0 hits (both searches reproduce), and no quality/issues, resolved or intake file cites b0379 for this harness (sibling intake d7-02 is a different root cause), so no duplicate (triage: claude-fable-5-1)
