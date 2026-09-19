---
id: PTQ-0850
title: typeenv-prototype-names.test.ts's driveComposePass reimplements the mkdtemp/plant/dispose workspace lifecycle and fake-host pi/ctx pair tests/helpers/production-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typeenv-prototype-names.test.ts:697-741
  - tests/helpers/production-load-harness.ts:1-17
  - tests/helpers/production-load-harness.ts:56-77
  - tests/helpers/production-load-harness.ts:123-142
sites: 1                     # count of occurrences cited in Evidence (the one in-scope copy, against the one canonical helper)
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# typeenv-prototype-names.test.ts's driveComposePass reimplements the mkdtemp/plant/dispose workspace lifecycle and fake-host pi/ctx pair tests/helpers/production-load-harness.ts already exports

## Observation
`tests/helpers/production-load-harness.ts` exports `plantThetaWorkspace`
(`mkdtemp` a workspace, `mkdir` its `.pi/theta/`, write one file per fixture,
optionally write `.pi/settings.json`), `disposeWorkspace` (the matching
recursive `rmSync`), and `runProductionLoad` (a fake, no-UI
`ExtensionAPI`/`ExtensionContext` pair sized to `discoverAndComposeFixtures`)
— created, per its own header, because "[s]everal test files independently
redeclared" this exact plant/dispose lifecycle and fake-host/load-driving
function. `tests/typeenv-prototype-names.test.ts`'s local `driveComposePass`
helper performs the same sequence inline: `mkdtempSync` under `os.tmpdir()`,
a hand-built `.pi/theta` `mkdirSync`, a `writeFileSync` loop over its three
fixture files, a hand-built `pi`/`ctx` pair with the identical member set,
one `discoverAndComposeFixtures` call, a reshape into
`{registered, notifications}`, and a `finally`-block `rmSync` — without
importing the helper.

## Evidence
`tests/typeenv-prototype-names.test.ts:697-741`:
```ts
async function driveComposePass(mcrashBody: string, why: string): Promise<LoadProbe> {
  const workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0038-"));
  try {
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    writeFileSync(join(projectThetaDir, "actl.theta"), FM + "@`hi`\n", "utf8");
    writeFileSync(join(projectThetaDir, "zctl.theta"), FM + "@`bye`\n", "utf8");
    writeFileSync(join(projectThetaDir, "mcrash.theta"), FM + mcrashBody, "utf8");

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
      cwd: workspaceDir,
      hasUI: true,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string, _type: "error"): void => {
          notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;

    const pass = discoverAndComposeFixtures(pi, ctx);
    await expect(pass, `${why}\n  ...`).resolves.toBeDefined();
    const fixtures: readonly ThetaFixture[] = await pass;
    return {
      registered: fixtures.map((f) => f.slashName),
      notifications,
    };
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

`tests/helpers/production-load-harness.ts:1-17` (the module's own statement
of why it exists):
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
// that call — `mkdtemp` a project root, `mkdir` its `.pi/theta`, a
// per-fixture write loop, an optional `.pi/settings.json` write, and an
// `afterAll` recursive removal — so `plantThetaWorkspace` / `disposeWorkspace`
// centralise that half too.
```

`tests/helpers/production-load-harness.ts:56-77` (the canonical fake-host
`pi`/`ctx` pair, same member set the reviewed file's `driveComposePass`
reproduces):
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

`tests/helpers/production-load-harness.ts:123-142` (`plantThetaWorkspace`,
the exact mkdtemp/mkdir/write-loop sequence the reviewed file's
`driveComposePass` reproduces by hand for its three fixture files):
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
```

Import search: `grep -n "helpers/production-load-harness"
tests/typeenv-prototype-names.test.ts` → 0 hits; the file imports
`discoverAndComposeFixtures` directly from `../src/extension/
production-composition` and `type { ThetaFixture }` from
`../src/extension/factory`, never the workspace-lifecycle helper.

## Why this is a problem
`tests/helpers/production-load-harness.ts` was created specifically because
several test files independently redeclared this exact
mkdtemp/mkdir/write-loop/dispose lifecycle wrapped around a fake-host
`discoverAndComposeFixtures` call, and it names `plantThetaWorkspace`/
`disposeWorkspace`/`runProductionLoad` as the centralised replacement. The
reviewed file's `driveComposePass` performs the identical sequence — a temp
dir under `os.tmpdir()`, a `.pi/theta` subdirectory, a per-fixture
`writeFileSync` loop, a `pi`/`ctx` fake host with the same member set
(`getFlag`, `getCommands`, `sendMessage`, `sendUserMessage`,
`getActiveTools`, `setActiveTools`, `ctx.cwd`, `ctx.modelRegistry`,
`ctx.ui.notify`), one `discoverAndComposeFixtures` call, and a
`finally`-block `rmSync` — without importing any of the three exports.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` already exports
`plantThetaWorkspace`/`disposeWorkspace` for the mkdtemp/mkdir/write/rmSync
sequence `driveComposePass` hand-builds, and the fake-host construction
`runProductionLoad` performs is the same shape `driveComposePass`'s own
`pi`/`ctx` literals reproduce; both are the existing, purpose-built home for
this helper's setup and teardown.

## False-positive check
- Gate-pin check: `tests/typeenv-prototype-names.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; the cited block is a
  setup/call/teardown sequence, not a pinned count or inventory assertion.
- Recording-double check: the `notifications` array and the fake `pi`/`ctx`
  record calls for later positive assertions about what was notified and
  registered, not a "never called" witness, so the negative-witness carve-out
  does not apply; this finding is about the duplicated plant/dispose/fake-host
  plumbing, not the recording behaviour itself.
- docs/bugs/ signature search: `grep -rl "typeenv-prototype-names"
  docs/bugs/` finds 14 hits (0038 and 13 others); none states a rationale for
  keeping `driveComposePass`'s workspace lifecycle and fake host local rather
  than using the shared harness — every citation concerns the type-layer
  behaviour under test, not this harness's own plumbing.
- coverage-matrix/bug-doc citation search: `grep -n "typeenv-prototype-names"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion, and no change
  to `driveComposePass`'s signature or its callers' call sites — only to
  where its setup/teardown/fake-host construction is defined.
- Coverage check: the claim is about a duplicated setup/teardown/fake-host
  DEFINITION that already has a canonical home, not a missing test path.
- Prior-finding overlap check: `grep -rl "typeenv-prototype-names"
  quality/intake/*.md quality/issues/*.md quality/resolved/*.md` finds only
  PTQ-0732 (a `diagLines(doc)` redeclaration against a different helper,
  `tests/helpers/e2e-s1.ts`) and the prior wave's shard-160 REVIEW_LOG entry
  (naming only the sibling file's `ajv()`/`slugOf` pattern as left-unfiled);
  neither names `driveComposePass` or `production-load-harness.ts`.
  `grep -rl "production-load-harness" quality/issues/*.md` finds PTQ-0600
  (`production-tools-load-resolution.test.ts`) and the resolved PTQ-0548
  (`ctor-unresolved-schema-name.test.ts`), each a disjoint single file; PTQ-0600's
  own triage note names four sibling instances in its own wave
  (b0357/b0358, ctor-unresolved-schema-name, e2e-s5-package-discovery,
  modulo-zero-result-type-number), none of which is
  `tests/typeenv-prototype-names.test.ts`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: all four excerpts reproduce at the cited lines (test.ts:697-741 bar an elided two-line `hasUI` comment and the long `expect` message; harness.ts:1-17, 56-77, 123-142), the file imports no helper (grep 0 hits) and `driveComposePass` has two live callers (:745, :771); the one divergence the filing under-reports — local `ctx.hasUI: true` vs the helper's omitted `hasUI` — is not load-bearing because `makeLoadEmit` (production-composition.ts:316-319) calls `ctx.ui.notify` for every error regardless of `hasUI`, which only gates the stderr mirror (:349) that `runProductionLoad` already interposes into `diagnosticLines`, so `plantThetaWorkspace("theta-bug0038-", [...3 fixtures])` / `runProductionLoad(cwd)` / `disposeWorkspace` preserve `registered` and `notifications` as drop-ins; file created 2026-08-01 (b34aaa52) before the helper (2026-09-11, 2594cd44) and its plant/dispose exports (2026-09-14, 4c0cd0dc) — never migrated; stated searches reproduce (docs/bugs 14 hits none pinning the plumbing, coverage-matrix 0, not a gate file, no it()/describe() change, notifications array is a positive-assertion recorder not a negative witness); per-file filings against this helper are tracked separately (PTQ-0600/0717/0722/0723/0739/0669/0635/0593/0517/0703, PTQ-0600's triage ruling a same-class sibling at a different file "not a duplicate") and none names this file or `driveComposePass`; in-scope D7 boilerplate-duplication class (triage: claude-fable-5-1)
