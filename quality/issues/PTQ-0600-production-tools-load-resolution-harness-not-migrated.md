---
id: PTQ-0600
title: production-tools-load-resolution.test.ts redeclares LoadOutcome/runProductionLoad and the plant/dispose workspace lifecycle tests/helpers/production-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-tools-load-resolution.test.ts:809-861
  - tests/helpers/production-load-harness.ts:1-20
  - tests/helpers/production-load-harness.ts:56-95
  - tests/helpers/production-load-harness.ts:106-137
sites: 1                     # count of occurrences cited in Evidence (the one in-scope copy, against the one canonical helper)
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# production-tools-load-resolution.test.ts redeclares LoadOutcome/runProductionLoad and the plant/dispose workspace lifecycle tests/helpers/production-load-harness.ts already exports

## Observation
tests/production-tools-load-resolution.test.ts declares its own module-scope
`LoadOutcome` interface, its own `async function runProductionLoad(cwd)`, and
its own inline `beforeAll`/`afterAll` temp-workspace plant/dispose pair
(`mkdtempSync` a project root, `mkdirSync` its `.pi/theta`, a per-fixture
`writeFileSync` loop, a `.pi/settings.json` write, an `afterAll` `rmSync`).
`tests/helpers/production-load-harness.ts` already exports a `LoadOutcome`
interface, a `runProductionLoad(cwd, opts)` function driving the same
`discoverAndComposeFixtures` production entry point over the same shape of
fake `pi`/`ctx` host, and a `plantThetaWorkspace`/`disposeWorkspace` pair
implementing the identical mkdtemp/mkdir/write-loop/settings-file/rmSync
lifecycle — the helper's own header states it was extracted because
"[s]everal test files independently redeclared the same `LoadOutcome` shape
and the same `runProductionLoad` function… The same files also independently
redeclared the temp-workspace lifecycle."

## Evidence
tests/production-tools-load-resolution.test.ts:809-861 (re-read immediately
before filing):
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
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-v20a-"));
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

tests/helpers/production-load-harness.ts:1-20 (header naming exactly this
redeclaration as its reason for existing):
```ts
// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210), plus the temp
// discovery-workspace plant/dispose lifecycle every caller drives it through
// (PTQ-0312).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, a `process.stderr.write` interposition that
// captures `makeLoadEmit`'s rendered diagnostic lines (the load's no-UI
// mirror) around one `discoverAndComposeFixtures` call, and a reshape of the
// result into `{registered, notifications, diagnosticLines}`. The same files
// also independently redeclared the temp-workspace lifecycle WRAPPED around
// that call…
```

tests/helpers/production-load-harness.ts:56-78 (the canonical `LoadOutcome`
producer, same fake-host shape and same `discoverAndComposeFixtures` call):
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

tests/helpers/production-load-harness.ts:106-137 (`plantThetaWorkspace` /
`disposeWorkspace`, the exact mkdtemp/mkdir/write-loop/settings/rmSync
lifecycle the in-scope file's `beforeAll`/`afterAll` reproduces inline):
```ts
export function plantThetaWorkspace(
  dirPrefix: string,
  fixtures: readonly PlantedThetaFile[],
  settingsJson?: string,
): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), dirPrefix));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const fixture of fixtures) {
    writeFileSync(
      join(projectThetaDir, `${fixture.stem}.${fixture.ext ?? "theta"}`),
      fixture.text,
      "utf8",
    );
  }
  if (settingsJson !== undefined) {
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), settingsJson, "utf8");
  }
  return workspaceDir;
}

export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

Import search: `grep -n "production-load-harness"
tests/production-tools-load-resolution.test.ts` → 0 hits; the file imports
only `discoverAndComposeFixtures` and a `ThetaFixture` type directly from
`src/`, plus `node:fs`/`node:os`/`node:path` primitives, never the helper.

## Why this is a problem
The helper module's own header names the exact shape this file reproduces —
"the same `LoadOutcome` shape and the same `runProductionLoad` function… the
temp-workspace lifecycle" — as the reason the module was extracted, and
exports `plantThetaWorkspace`/`disposeWorkspace` built from the identical
mkdtemp/mkdir/write-loop/settings-file/rmSync sequence this file's
`beforeAll`/`afterAll` block reimplements inline. The in-scope file's
`runProductionLoad` differs from the helper's only in omitting the
`opts`/`diagnosticLines`/`fixtures` fields this file never reads, and in
constructing its `pi`/`ctx` fake host with the identical member set
(`getFlag`, `getCommands`, `sendMessage`, `sendUserMessage`,
`getActiveTools`, `setActiveTools`, `ctx.cwd`, `ctx.modelRegistry`,
`ctx.ui.notify`) the helper's version already provides.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `plantThetaWorkspace` /
`disposeWorkspace` / `runProductionLoad` (its `LoadOutcome.registered` and
`.notifications` fields already cover everything this file reads from its
own `outcome`) name the existing home this file's local trio duplicates.

## False-positive check
- Gate-pin: `tests/production-tools-load-resolution.test.ts` does not match
  `*gate*.test.ts` or the named gate kin.
- Recording-double: `runProductionLoad`'s fake `pi`/`ctx` and the plant/
  dispose lifecycle are harness plumbing that lets the production compose
  pass run and records its outcome for inspection; they do not back a "never
  called" MUST-NOT witness, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rn "production-tools-load-resolution"
  docs/bugs/` → 0 hits; no open bug document cites this file's local harness
  as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-tools-load-resolution" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no rename, merge, or deletion of any
  `it()`/`describe()` in the file — every one of its ~40 `it()` bodies keeps
  reading `outcome.registered`/`outcome.notifications` exactly as today; only
  the three-piece harness that produces `outcome` is the observed
  duplication.
- Prior-finding overlap check: `grep -rn "production-tools-load-resolution"
  quality/intake/*.md` → 0 hits (this file). The four existing
  `production-load-harness.ts`-reimplementation findings in this wave
  (b0357/b0358, ctor-unresolved-schema-name, e2e-s5-package-discovery,
  modulo-zero-result-type-number) each cite a disjoint set of test files and
  none names `tests/production-tools-load-resolution.test.ts`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: all four excerpts reproduce verbatim at the cited lines (test.ts:809-861; harness.ts:1-20, 56-95, 106-137); the file imports no helper (grep 0 hits), never touches stderr/diagnosticLines/fixtures, and its local `PlantedTheta {stem,text}` is structurally assignable to the helper's `PlantedThetaFile`, so `plantThetaWorkspace("theta-v20a-", THETAS, "{}")` / `disposeWorkspace` / `runProductionLoad(cwd)` are drop-ins for the inline trio; the file was created 2026-07-04 (333351d0) before the helper (2026-09-11, 2594cd44) and its PTQ-0312 plant/dispose exports (2026-09-14, 4c0cd0dc) and its harness block was last touched 2026-08-20 — never migrated; none of resolved PTQ-0210/0240/0259/0312/0358/0359/0361 cite this file and sibling intake d7-02 (confirmed) is the same class at a different file, not a duplicate; the FP-check's "docs/bugs → 0 hits" is false (≈20 bug docs name the file, incl. fixed 0207 citing comment prose at :810/:839 and 0070-0072 recording historical additive-only fix accounting), but none pins the harness plumbing as a witness and no it()/describe() is renamed, merged or deleted — coverage-matrix 0 hits confirmed; in-scope D7 copy-paste-fixture class (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
