---
id: PTQ-1508
title: subagent-tool-admission.test.ts hand-rolls the mkdtemp/mkdir/write-loop/rmSync workspace lifecycle that production-load-harness.ts's plantThetaWorkspace/disposeWorkspace already centralise
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-tool-admission.test.ts:151-167
  - tests/helpers/production-load-harness.ts:301-336
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# subagent-tool-admission.test.ts hand-rolls the mkdtemp/mkdir/write-loop/rmSync workspace lifecycle that production-load-harness.ts's plantThetaWorkspace/disposeWorkspace already centralise

## Observation
`tests/subagent-tool-admission.test.ts` imports `callableSetOf`, `piToolNames`, `runProductionLoad`, and `theta` from `./helpers/production-load-harness` (line 1), but its `beforeAll`/`afterAll` independently re-derives the exact temp-workspace plant/dispose sequence that same module already exports as `plantThetaWorkspace(dirPrefix, fixtures, settingsJson)` / `disposeWorkspace(workspaceDir)`: `mkdtempSync` a project root, `mkdirSync` its `.pi/theta`, a per-fixture `writeFileSync` loop, an optional `.pi/settings.json` write, and on teardown a recursive `rmSync`. The file's own `THETAS` array already has exactly the `{ stem, text }` shape `plantThetaWorkspace`'s `PlantedThetaFile` parameter expects.

## Evidence
tests/subagent-tool-admission.test.ts:1-5 (the existing import from the module that also exports the lifecycle helpers):
```ts
import { callableSetOf, piToolNames, runProductionLoad, theta, type LoadOutcome } from "./helpers/production-load-harness";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
```

tests/subagent-tool-admission.test.ts:151-167 (re-read immediately before filing — the hand-rolled lifecycle):
```ts
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0005-admission-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir, { registryTools: FAKE_ALL_TOOLS });
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/helpers/production-load-harness.ts:301-336 (the canonical export, already imported for other names in the same in-scope file):
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
    }
    ...
```
and (production-load-harness.ts:328-336):
```ts
/**
 * Recursively remove a workspace `plantThetaWorkspace` created; a no-op when
 * `workspaceDir` is `undefined` (a `beforeAll` that never assigned it).
 */
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

`PlantedThetaFile` (production-load-harness.ts:287-292) requires exactly `{ stem, text, ext? }`, and the in-scope file's own `THETAS: readonly PlantedTheta[]` array (subagent-tool-admission.test.ts, `interface PlantedTheta { readonly stem: string; readonly text: string; }`) already carries that shape.

Search performed: `grep -c "mkdtempSync\|mkdirSync\|writeFileSync\|rmSync" tests/subagent-tool-admission.test.ts` → 6 hits, all inside the cited `beforeAll`/`afterAll` block; `grep -n "plantThetaWorkspace\|disposeWorkspace" tests/subagent-tool-admission.test.ts` → 0 hits (neither export is imported).

## Why this is a problem
The module docstring for `production-load-harness.ts` (lines 6-18) states this exact lifecycle — "several test files independently redeclared" the mkdtemp/mkdir/write-loop/settings-write/rmSync sequence — is why `plantThetaWorkspace`/`disposeWorkspace` were centralised. This in-scope file already imports four other names from that same module (`callableSetOf`, `piToolNames`, `runProductionLoad`, `theta`) but re-derives this fifth/sixth piece locally instead, reproducing the identical mkdtemp-prefix/`.pi/theta`-mkdir/per-fixture-write/settings-write/rmSync sequence the helper already performs, one call away.

## Suggested direction (non-binding, optional)
Adding `plantThetaWorkspace`/`disposeWorkspace` to the existing production-load-harness import is the natural way to point the file at the one definition the module's own docstring names as its reason for existing; the `THETAS` array and `FAKE_ALL_TOOLS`-carrying `runProductionLoad` call would stay local.

## False-positive check
- Gate-pin carve-out: `subagent-tool-admission.test.ts` does not match `*gate*.test.ts` or the named kin; the cited lines are a workspace lifecycle, not a pinned count or inventory assertion.
- Recording-double carve-out: not a recording double or negative witness; not applicable.
- docs/bugs/ signature search: `grep -rl "mkdtempSync" docs/bugs/*.md` → 0 hits; no documented correct-reason red covers this lifecycle in this file.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-tool-admission" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "subagent-tool-admission" docs/bugs/*.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test, only that the local lifecycle could call the already-exported helper.
- Prior-filing search: `grep -rl "subagent-tool-admission" quality/intake quality/resolved` → five resolved hits (PTQ-0712, PTQ-1031, PTQ-1355, PTQ-1358, PTQ-1467), all about different local re-declarations in this same file (`callableSetOf`, `LoadOutcome`, `theta`, the line-joiner, `piToolNamesOf`) that have since been fixed (the current file already imports `callableSetOf`, `piToolNames`, `theta` from the canonical module); none names the `mkdtemp`/`mkdir`/write-loop/`rmSync` workspace-plant/dispose sequence. `grep -rl "plantThetaWorkspace" quality/intake quality/resolved | xargs grep -l "subagent-tool-admission.test.ts"` → 0 hits (PTQ-0904 covers three different files: subagent-placement-load-refusal, subagent-result-channel-factory, subagent-root-registration-refusal-envelope — not this one).
- Coverage-drift check: the claim is about a repeated lifecycle-sequence DEFINITION, not a missing test path; the file's own tests already exercise every fixture it plants.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-checked against the current code. The test file's lines 151-167 still write the workspace by hand: mkdtemp, then mkdir `.pi/theta`, then a loop writing each `${stem}.theta`, then `settings.json` "{}", then rmSync. That is the same sequence `plantThetaWorkspace(dirPrefix, fixtures, settingsJson?)` / `disposeWorkspace` perform at production-load-harness.ts:301-336, and the harness's own header (lines 13-18) says those helpers exist to centralise this lifecycle. Line 1 already imports four other names from that module. Grep for plantThetaWorkspace or disposeWorkspace in the file finds nothing, and the node:fs calls appear only in this block. The local `PlantedTheta {stem,text}` has the same shape as `PlantedThetaFile`, so the swap is mechanical. This is the D7 boilerplate-duplication class, all under tests/, and no carve-out applies: it is not a gate file, the real fs setup is not a recording double, and it is not cited by coverage-matrix or docs/bugs. It is not a duplicate. The store hits for this file (PTQ-0712/1031/1355/1358/1467) are fixed and cover other helpers. PTQ-0960 (false-positive) was about runProductionLoad only. PTQ-0904/0703/1088 cite other files. No open quality/issues row names this file. It matches the per-file residual pattern already confirmed in PTQ-1324 and PTQ-1480 (triage: claude-opus-5-5)
