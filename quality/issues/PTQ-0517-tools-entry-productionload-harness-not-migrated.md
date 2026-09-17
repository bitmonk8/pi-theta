---
id: PTQ-0517
title: tools-derived-name-shape/tools-entry-closed-grammar/tools-entry-containment each re-declare production-load-harness.ts's runProductionLoad and workspace plant/dispose
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-derived-name-shape.test.ts:298-330
  - tests/tools-entry-closed-grammar.test.ts:286-318
  - tests/tools-entry-containment.test.ts:190-232
  - tests/helpers/production-load-harness.ts:1-160
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tools-derived-name-shape/tools-entry-closed-grammar/tools-entry-containment each re-declare production-load-harness.ts's runProductionLoad and workspace plant/dispose

## Observation
All three files declare an identical local `interface LoadOutcome { registered; notifications }`, an identical local `async function runProductionLoad(cwd)` that builds a fake, no-UI `ExtensionAPI`/`ExtensionContext` pair and calls the real `discoverAndComposeFixtures`, and an identical `beforeAll`/`afterAll` pair that `mkdtempSync`s a workspace, `mkdirSync`s its `.pi/theta`, writes fixtures into it, writes a minimal `.pi/settings.json`, and `rmSync`s the workspace afterward. `tests/helpers/production-load-harness.ts` exports `runProductionLoad`, `plantThetaWorkspace`, and `disposeWorkspace` solving exactly this, and its own header states it exists because "several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function." None of the three in-scope files imports it.

## Evidence
`tests/tools-derived-name-shape.test.ts:298-330`:
```ts
interface LoadOutcome {
  readonly registered: readonly string[];
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
```

`tests/tools-entry-closed-grammar.test.ts:286-318` — byte-identical to the
above (`diff <(sed -n '298,330p' tests/tools-derived-name-shape.test.ts)
<(sed -n '286,318p' tests/tools-entry-closed-grammar.test.ts)` produces no
output):
```ts
interface LoadOutcome {
  readonly registered: readonly string[];
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
```

`tests/tools-entry-containment.test.ts:190-230` carries the identical
`LoadOutcome`/`runProductionLoad` body (the fake `pi`/`ctx` block is
character-for-character the same as the two excerpts above), interleaved
with four extra file-local `let` declarations this file's extra cells need
(`outsideDir`, `outSpecDir`, `projectThetaDir`, `relSpec`, `junctionError`).

The three `beforeAll`/`afterAll` pairs share the same plant/dispose shape —
`tests/tools-derived-name-shape.test.ts:332-348`:
```ts
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0070-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(projectThetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```
`tests/tools-entry-closed-grammar.test.ts:320-336` reproduces this verbatim
except for the `mkdtemp` prefix (`"theta-bug0069-"`); `tests/tools-entry-containment.test.ts`'s `beforeAll` (236-441) performs the same
`mkdtempSync`/`mkdirSync`/write-loop/settings-write sequence for its own
workspace, wrapped around extra out-of-root-directory setup this file alone
needs.

`tests/helpers/production-load-harness.ts:1-160` — the canonical, already
centralising helper, whose header states its purpose directly:
```ts
// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210), plus the temp
// discovery-workspace plant/dispose lifecycle every caller drives it through
// (PTQ-0312).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, ...
```
its exported `runProductionLoad(cwd, opts)` builds the identical fake
`pi`/`ctx` pair (same six `pi` methods, same `ctx.cwd`/`modelRegistry`/`ui.notify`
shape) around the same `discoverAndComposeFixtures` call, and its exported
`plantThetaWorkspace(dirPrefix, fixtures, settingsJson)` performs the same
`mkdtempSync`/`mkdirSync`/write-loop/optional-settings-write sequence, paired
with an exported `disposeWorkspace(workspaceDir)` for the teardown half.

Exact search: `grep -n "production-load-harness\|import.*helpers" tests/tools-derived-name-shape.test.ts tests/tools-entry-closed-grammar.test.ts tests/tools-entry-containment.test.ts` → 0 hits in any of the three; none imports the helper module.

## Why this is a problem
The three in-scope files each carry their own copy of a fake-host/discovery-workspace harness that `tests/helpers/production-load-harness.ts` already exists to answer — its own header names exactly this symptom ("several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function") as its reason for existing. A future change to the fake host's shape (an added `pi` method `discoverAndComposeFixtures` starts requiring, a change to how `ctx.ui.notify` is wired) must be applied to all three copies by hand in addition to the helper, and a missed copy silently keeps testing against a stale fake host.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `runProductionLoad`, `plantThetaWorkspace`, and `disposeWorkspace` already solve the read/plant/dispose sequence each of the three files re-derives; it is the existing home the module's own doc comment already points at.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or its named kin; the cited lines are harness setup, not a pinned count or inventory assertion.
- Recording-double check: `runProductionLoad`'s `notifications` array records `ctx.ui.notify` calls for later `toContain`/`not.toContain` assertions on their content, not a "never called" MUST-NOT witness; the recording-double carve-out (a fake that records calls so a test can assert something was never called) does not shield re-implementing the SAME recording fake three times without the canonical helper — this finding is about the duplication of the fake/harness itself, not about the legitimacy of any single negative assertion built on it.
- docs/bugs/ signature search: `grep -rl "tools-derived-name-shape\|tools-entry-closed-grammar\.test\|tools-entry-containment" docs/bugs/*.md` → each of the three files' own bug docs (0070, 0069, 0110) names that file as its witness, as expected; none discusses or pins the `runProductionLoad`/workspace-plant scaffolding itself.
- coverage-matrix/bug-doc citation search: `grep -n "tools-derived-name-shape\|tools-entry-closed-grammar\|tools-entry-containment" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` cell — only that the local `LoadOutcome`/`runProductionLoad`/plant/dispose block in each of the three files could call the existing helper.
- Prior-finding overlap check: `grep -l "tools-derived-name-shape\|tools-entry-closed-grammar\|tools-entry-containment" quality/intake/*.md quality/resolved/*.md` before filing found only `qw20260917154546-d7-108-02-nested-tools-registry-oracle-reimplemented.md` (about a DIFFERENT re-derivation — the two-page `REGISTRY_TEXT` diagnostics-registry read in `tools-entry-containment.test.ts`, not `runProductionLoad`/workspace plant) and two resolved PTQ tickets about `production-composition.ts` source code, not tests. No prior filing names the `runProductionLoad`/`LoadOutcome`/workspace-plant duplication in these three specific files.
- Coverage-drift check: the claim is about a repeated harness DEFINITION each file already exercises through its own cells; no claim that any diagnostic path is untested.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: the LoadOutcome/runProductionLoad blocks reproduce at tools-derived-name-shape:298-330 and tools-entry-closed-grammar:286-318 (diff of the two ranges is empty) and at tools-entry-containment:190-231 (same function body, interleaved lets), each beforeAll/afterAll repeats the mkdtemp→mkdir .pi/theta→write-loop→settings.json→rmSync lifecycle plantThetaWorkspace/disposeWorkspace export; grep confirms none of the three imports tests/helpers/production-load-harness (6 importers, none of them), the tests read only outcome.registered/outcome.notifications which the helper's LoadOutcome supplies with identical default pi/ctx behaviour, docs/reference/coverage-matrix.md has 0 hits and bug docs 0069/0070/0110 describe the temp-workspace witness shape (which the helper preserves) without pinning the local scaffolding; not a duplicate — PTQ-0210/0240/0259/0312/0358 and intake sibling d7-155-01 each cite different files for this copy-paste-fixture class (triage: claude-fable-5-1)
