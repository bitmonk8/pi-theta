---
id: PTQ-1317
title: division-result-type-number-invoke.test.ts hand-rolls runProductionLoad while already importing sibling helpers from the same canonical module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/division-result-type-number-invoke.test.ts:1
  - tests/division-result-type-number-invoke.test.ts:140-176
  - tests/helpers/production-load-harness.ts:88-136
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# division-result-type-number-invoke.test.ts hand-rolls runProductionLoad while already importing sibling helpers from the same canonical module

## Observation
`tests/division-result-type-number-invoke.test.ts` imports `assertNoStemIsASuffix`, `theta`, `invokeCaller`, and `diagnosticLineReaders` from `./helpers/production-load-harness` (line 1), the same module that also exports `runProductionLoad` and its `LoadOutcome` type. Instead of importing `runProductionLoad`, the file declares its own local `LoadOutcome` interface and its own local `async function runProductionLoad(cwd)` (lines 140-176) that builds an equivalent fake `pi`/`ctx` pair, interposes `process.stderr.write`, calls `discoverAndComposeFixtures`, and reshapes the result into `{registered, notifications, diagnosticLines}` — the identical shape and sequence the imported module's own exported `runProductionLoad` already produces.

## Evidence
`tests/division-result-type-number-invoke.test.ts:1` (already importing from the module that also exports the canonical helper):
```ts
import { assertNoStemIsASuffix, theta, invokeCaller, diagnosticLineReaders } from "./helpers/production-load-harness";
```

`tests/division-result-type-number-invoke.test.ts:140-176` (the local reimplementation, re-read immediately before filing):
```ts
async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
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
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  };
}
```

`tests/helpers/production-load-harness.ts:88-136` (the canonical helper, same `pi`/`ctx` member set, same stderr interposition, same `{registered, notifications, diagnosticLines}` reshape, plus a `fixtures` field the local copy omits):
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
    sendMessage: opts.sendMessage ?? ((): void => {}),
    sendUserMessage: (): void => {},
    registerMessageRenderer: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    ...(opts.registryTools !== undefined ? { getAllTools: () => opts.registryTools } : {}),
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: opts.hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  ...
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
    fixtures,
  };
}
```

## Why this is a problem
The file's own comment block states this file "copies the fixture-load harness SHAPE from `tests/invoke-arg-type-mismatch-wired.test.ts` (read, not modified)" rather than importing the shared helper — but `production-load-harness.ts`'s header already documents that its purpose is to centralise exactly this repeated shape ("Several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function"). This file both imports four other symbols from that same module and re-derives a fifth (`runProductionLoad`) by hand, so the duplication is not a case of the helper being unavailable or unknown to the author — it is imported from in the same import statement's module path.

## Suggested direction (non-binding, optional)
The local `LoadOutcome`/`runProductionLoad` pair could be replaced by importing `runProductionLoad` (and `LoadOutcome`) from `./helpers/production-load-harness` alongside the four symbols already imported from it; the canonical export additionally returns `fixtures`, which this file does not otherwise need but would not have to construct itself.

## False-positive check
Gate-pin check: `division-result-type-number-invoke.test.ts` does not match `*gate*.test.ts` or the named gate kin — not applicable. Recording-double check: the local `notifications`/`chunks` arrays are plain recording doubles, not a MUST-NOT witness under scrutiny here — the finding is about the surrounding harness function being reimplemented, not the recording double's legitimacy. docs/bugs/ signature search: `grep -rl "division-result-type-number-invoke" docs/bugs/` returns nothing — no documented correct-reason red covers this shape. coverage-matrix/bug-doc citation search: `grep -rl "division-result-type-number-invoke" docs/reference/coverage-matrix.md docs/bugs/*.md` returns nothing; no rename/merge/delete of a matrix-cited test is proposed — the observation is about setup duplication, not the test's identity or its coverage. This does not drift into coverage: the claim is that code that exists (the local `runProductionLoad`) reimplements an available, already-imported-from helper, not that a test is missing.

## Triage
verdict: confirmed — independently re-verified: the local `LoadOutcome`/`runProductionLoad` reproduce verbatim at tests/division-result-type-number-invoke.test.ts:134-176 and the canonical export at tests/helpers/production-load-harness.ts:88-136 (same pi/ctx member set, same stderr interposition, same reshape; the canonical is a strict superset adding `fixtures`), line 1 already imports four sibling exports from that module, and `grep -l "async function runProductionLoad" tests/*.test.ts` shows this is one of only two un-migrated copies left; the file is green (vitest 4/4) and D7 boilerplate/copy-paste-fixture in tests/ with no carve-out binding. Dedupe: no open issue in quality/issues cites this file; the site was one of resolved PTQ-0210's five, whose fix migrated only one site, and the sibling leftover (invoke-arg-type-mismatch-wired) was accepted and fixed as PTQ-1031 on identical grounds — this is the same class for a still-untracked site, not a duplicate. Correction on record: the candidate's docs/bugs grep claim is wrong (6 bug docs cite the file: 0142, 0146, 0152, 0180, 0183, 0332) but none pins a correct-reason red and no rename/merge/delete is proposed, so nothing turns on it (triage: claude-fable-5-1)
