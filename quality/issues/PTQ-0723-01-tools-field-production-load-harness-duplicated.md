---
id: PTQ-0723
title: tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal reimplement the canonical production-load harness instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-field-shape-refusal.test.ts:666-748
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:654-723
  - tests/helpers/production-load-harness.ts:1-60
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal reimplement the canonical production-load harness instead of importing it

## Observation
Both in-scope files declare a private `interface LoadOutcome`, a private
`async function runProductionLoad(cwd): Promise<LoadOutcome>` that builds a
fake `ExtensionAPI`/`ExtensionContext` pair around `discoverAndComposeFixtures`,
and a `beforeAll`/`afterAll` pair that plants a temp `.pi/theta/` workspace per
row and removes it — the same shape, same variable names, same field names.
`tests/helpers/production-load-harness.ts` already exports `LoadOutcome`,
`runProductionLoad`, `plantThetaWorkspace` and `disposeWorkspace` built for
exactly this purpose; its header states it exists because "several test files
independently redeclared the same `LoadOutcome` shape and the same
`runProductionLoad` function". Neither in-scope file imports it.

## Evidence
`tests/tools-field-shape-refusal.test.ts:666-676` (the local `LoadOutcome` and
`PRODUCTION_ROWS`, elided):
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}
```

`tests/tools-field-shape-refusal.test.ts:705-726` (the local `runProductionLoad`):
```ts
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

`tests/tools-field-shape-refusal.test.ts:729-748` (the local plant/dispose
`beforeAll`/`afterAll`):
```ts
beforeAll(async () => {
  for (const row of PRODUCTION_ROWS) {
    const workspaceDir = mkdtempSync(join(tmpdir(), `theta-bug0104-${row.stem}-`));
    workspaces.push(workspaceDir);
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    writeFileSync(join(projectThetaDir, `${row.stem}.theta`), row.text, "utf8");
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
    outcomes.set(row.stem, await runProductionLoad(workspaceDir));
  }
});

afterAll(() => {
  for (const dir of workspaces) {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

`tests/tools-field-zero-entry-scalar-refusal.test.ts:680-701` — the same
`runProductionLoad` body, only the `mkdtemp` prefix differing
(`theta-bug0206-` vs `theta-bug0104-`; verified by `diff` of the two ranges,
zero substantive lines differ aside from that literal and comment text):
```ts
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

`tests/helpers/production-load-harness.ts:1-38` — the canonical export this
duplicates (header plus signature):
```ts
// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210), plus the temp
// discovery-workspace plant/dispose lifecycle every caller drives it through
// (PTQ-0312).
...
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
```
and `plantThetaWorkspace(dirPrefix, fixtures, settingsJson?)` /
`disposeWorkspace(workspaceDir)`, which together replace the `mkdtempSync` /
`mkdirSync` / per-fixture `writeFileSync` loop / settings-file write /
`rmSync` sequence both in-scope files repeat inline.

## Why this is a problem
The same fake-host construction, `LoadOutcome` field set and temp-workspace
plant/dispose sequence appears twice, byte-for-byte apart from a `mkdtemp`
prefix literal, inside the two files this review scope covers, while a module
built and named for exactly this purpose (`tests/helpers/production-load-
harness.ts`, whose own header cites this exact redeclaration pattern as its
reason for existing) sits unimported by both. A change to the fake `pi`/`ctx`
shape `discoverAndComposeFixtures` expects, or to the plant/dispose lifecycle,
needs a matching edit in both files rather than flowing through the shared
export.

## Suggested direction (non-binding, optional)
Both files' local `LoadOutcome`/`runProductionLoad` declarations and their
`beforeAll`/`afterAll` plant/dispose loops name the same shared home the
helper's own header already points at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or named gate kin; not
  applicable.
- Recording-double check: `runProductionLoad`'s `pi`/`ctx` fakes are a
  from-scratch stub host, not a MUST-NOT-witness recording double; not
  applicable.
- docs/bugs/ signature search: bug 0104 and bug 0206 are both `Status: fixed`
  (verified: `docs/bugs/0104-...md` and `docs/bugs/0206-...md` both state
  "Status: fixed"); the tests pass at HEAD (`npx vitest run
  tests/tools-field-shape-refusal.test.ts` — 37/37 pass), so this is not a
  documented correct-reason red and not a bug routing note.
- coverage-matrix/bug-doc citation search: `grep -rn
  "tools-field-shape-refusal\|tools-field-zero-entry-scalar-refusal"
  docs/reference/coverage-matrix.md docs/bugs/` — both files are named in their
  own respective bug docs (0104, 0206) as the witness file, but no cited cell
  label is touched, moved, or renamed by this finding; the finding proposes
  only that the harness declarations import the existing helper, leaving every
  test body, name and assertion untouched.
- This claim is duplication of test harness code between two files that
  exist and are in scope, not a coverage gap; no assertion is made about
  missing tests.

## Triage
verdict: confirmed — independently re-verified: both files declare a private `LoadOutcome` (666-671 / 654-659) and a byte-identical `runProductionLoad` (705-726 / 680-701) plus the same inline mkdtemp/mkdir/writeFileSync/settings.json/rmSync plant-dispose loop (729-748 / 703-723), differing only in the `theta-bug0104-`/`theta-bug0206-` prefix and comment text; neither imports tests/helpers/production-load-harness.ts (grep: 0 hits), whose exported `LoadOutcome` is a strict superset of the only two fields the tests read (`registered` ×12, `notifications` ×13) and whose `plantThetaWorkspace`/`disposeWorkspace` cover the inline lifecycle; both files were added 2026-08-20/21 and were never migrated by the PTQ-0210/0240/0259/0312/0358 consolidations, none of which cite either file (not a duplicate); neither is a gate test, neither appears in docs/reference/coverage-matrix.md, and bugs 0104/0206 are both `Status: fixed` — D7 copy-paste-double class with a mechanical dedupe (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
