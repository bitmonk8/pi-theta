---
id: PTQ-1768
title: subagent-fn-extension-tool-dispatch-e2e.test.ts reimplements the shared workspace fixture lifecycle twice.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:78-89
  - tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:114-123
  - tests/helpers/production-load-harness.ts:301-325
  - tests/helpers/production-load-harness.ts:332-336
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# subagent-fn-extension-tool-dispatch-e2e.test.ts reimplements the shared workspace fixture lifecycle twice.

## Observation
The parent-leg and no-rung-leg fixtures each create a temporary project directory, create its `.pi/theta` directory, write `fncall.theta` from `PARENT_FNCALL`, and recursively remove the project at teardown. Those four fixture operations are repeated twice, differing only in the root variable and temporary-directory prefix. `tests/helpers/production-load-harness.ts` already exports `plantThetaWorkspace` and `disposeWorkspace` for this fixture lifecycle, including the `.theta` extension default. The reviewed file imports neither helper; the parent-leg block additionally constructs its host and loads the fixtures, which are not part of the repeated operations.

## Evidence
Counted occurrence 1 — `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:78-89`:

```ts
beforeAll(async () => {
  parentDir = mkdtempSync(join(tmpdir(), "theta-subfn-exttool-parent-"));
  const dir = join(parentDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fncall.theta"), PARENT_FNCALL, "utf8");
  parentHost = new FakeParentHost(parentDir, MY_TOOL_SCHEMA);
  parentFixtures = await discoverAndComposeFixtures(parentHost.pi, parentHost.ctx);
});

afterAll(() => {
  rmSync(parentDir, { recursive: true, force: true });
});
```

Counted occurrence 2 — `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:114-123`:

```ts
  beforeAll(() => {
    noRungDir = mkdtempSync(join(tmpdir(), "theta-subfn-exttool-norung-"));
    const dir = join(noRungDir, ".pi", "theta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "fncall.theta"), PARENT_FNCALL, "utf8");
  });

  afterAll(() => {
    rmSync(noRungDir, { recursive: true, force: true });
  });
```

Canonical fixture builder — `tests/helpers/production-load-harness.ts:301-315`:

```ts
export function plantThetaWorkspace(
  dirPrefix: string,
  fixtures: readonly PlantedThetaFile[],
  settingsJson?: string,
): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), dirPrefix));
  try {
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    for (const fixture of fixtures) {
      writeFileSync(
        join(projectThetaDir, `${fixture.stem}.${fixture.ext ?? "theta"}`),
        fixture.text,
        "utf8",
      );
```

Its return path — `tests/helpers/production-load-harness.ts:316-325`:

```ts
    }
    if (settingsJson !== undefined) {
      writeFileSync(join(workspaceDir, ".pi", "settings.json"), settingsJson, "utf8");
    }
    return workspaceDir;
  } catch (error) {
    // The caller cannot dispose a workspace that failed before it was returned.
    disposeWorkspace(workspaceDir);
    throw error;
  }
```

Canonical teardown — `tests/helpers/production-load-harness.ts:332-336`:

```ts
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

These are exactly two counted local fixture-lifecycle implementations; the helper is the comparison, not a third occurrence. `rg -n 'plantThetaWorkspace|disposeWorkspace' tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` returns zero hits. All excerpts were re-read immediately before filing.

## Why this is a problem
This is the D7 copy-paste-fixture class: the existing shared fixture builder already expresses both local directory layouts and file writes, but the test spells out its filesystem fixture mechanics twice instead. The repeated portions maintain their own directory layout, filename construction, encoding, and removal options alongside the canonical implementation. The distinction between the two hosts does not distinguish these fixture operations: both write the same named file from the same source constant. This observation concerns duplicated test-fixture code, not teardown failure behavior, process isolation, suite composition, or missing tests.

## Suggested direction (non-binding, optional)
The existing home for these fixture operations is `tests/helpers/production-load-harness.ts`, through its `plantThetaWorkspace` and `disposeWorkspace` exports.

## False-positive check
- **Gate-pin:** neither counted block is a census or inventory gate; the excerpts create on-disk discovery fixtures, not expected counts.
- **Recording-double:** the counted operations are directory creation, file writing, and teardown, not negative witnesses recorded by `FakeParentHost`. The host and its assertions are not the subject of this finding.
- **docs/bugs/ signature search:** `rg -n 'subagent-fn-extension-tool-dispatch-e2e|REGISTERS with zero diagnostics|refuses with theta/load/extension-tool-unreachable naming the tool|PIC-64 inline-body context' docs/bugs docs/reference/coverage-matrix.md` found references in bug documents 0183 and 0207. Their opening status sections identify both as fixed comment/composition-root attribution reports, not a documented red or a rationale for separate workspace-fixture implementations. No claim about a failing test is made here.
- **Coverage-matrix/bug-doc citation search:** the same search found no coverage-matrix entry. The bug-document references were inspected; this finding proposes no merge, rename, or deletion of any test or suite, including the cited file's witnesses.
- **Existing-report check:** references to this test file in `quality/issues`, `quality/resolved`, and `quality/intake` were searched. Prior reports cover its parent-host double, no-rung host, executable host, note filter, and comment attribution; none covers these two workspace blocks. PTQ-0904 concerns the same helper migration in three different test files, not this file.
- **History intent check:** `git log -4 --oneline -- tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` and `git show 31a0af18 -- tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` were inspected. That helper-migration diff extracts host doubles and the note filter while leaving these fixture blocks; it does not document a reason for their separate filesystem implementations.
- **Scope/coverage:** all finding locations are under `tests/`. Both existing tests and their different host behaviors remain outside the claim; no additional test, assertion, execution path, or suite-tier change is requested. The filing is about fixture duplication only.

## Triage
verdict: confirmed — Both cited setup/teardown blocks reproduce and duplicate the same temporary-root, .pi/theta/fncall.theta write, and recursive removal lifecycle already covered by plantThetaWorkspace/disposeWorkspace; neither helper is imported. This is tests-only D7 copy-paste fixture duplication, with no carve-out or prescribed-shape exemption; PTQ-0904 covers different files and the prior host-double findings cover different blocks. (triage: claude-opus-5-5)
