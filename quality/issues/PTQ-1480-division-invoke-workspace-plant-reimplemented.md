---
id: PTQ-1480
title: division-result-type-number-invoke.test.ts hand-rolls the temp-workspace plant/teardown that the same imported module already exports as plantThetaWorkspace/disposeWorkspace
lens: D7
status: open
verdict: confirmed
locations:
  - tests/division-result-type-number-invoke.test.ts:1-9
  - tests/division-result-type-number-invoke.test.ts:135-146
  - tests/helpers/production-load-harness.ts:267-301
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# division-result-type-number-invoke.test.ts hand-rolls the temp-workspace plant/teardown that the same imported module already exports as plantThetaWorkspace/disposeWorkspace

## Observation
`tests/division-result-type-number-invoke.test.ts` imports directly from
`node:fs` (`mkdtempSync`, `mkdirSync`, `rmSync`, `writeFileSync`) and
`node:os`/`node:path`, and its `beforeAll`/`afterAll` hand-build a temp
`.pi/theta/` discovery workspace one `mkdirSync` + one `writeFileSync` loop +
one `.pi/settings.json` write at a time, then `rmSync`s it in `afterAll`.
`tests/helpers/production-load-harness.ts` — the same module this file
already imports `runProductionLoad`, `theta`, `invokeCaller`,
`assertNoStemIsASuffix` and `diagnosticLineReaders` from — exports
`plantThetaWorkspace(dirPrefix, fixtures, settingsJson)` and
`disposeWorkspace(workspaceDir)` performing the identical sequence
(`mkdtempSync` under the OS temp root, `mkdirSync` the `.pi/theta/`
subdirectory, one file per fixture, an optional `.pi/settings.json` write,
and a recursive `rmSync` on teardown).

## Evidence
`tests/division-result-type-number-invoke.test.ts:1-9` (re-read immediately
before filing) — the file's own imports, already reaching into the harness
module that exports the canonical plant/dispose pair, but not importing them:
```ts
import {
  assertNoStemIsASuffix, theta, invokeCaller, diagnosticLineReaders,
  runProductionLoad, type LoadOutcome,
} from "./helpers/production-load-harness";
import { PARSE_REGISTRY_PATH as REGISTRY_PAGE } from "./helpers/load-row-harness";
import { readRegistry, invokeArgMessage } from "./helpers/registry-oracle";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

`tests/division-result-type-number-invoke.test.ts:135-146` (re-read
immediately before filing) — the hand-rolled plant/dispose:
```ts
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0142-f1-"));
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

`tests/helpers/production-load-harness.ts:267-301` (re-read immediately
before filing) — the canonical export performing the identical sequence:
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
    if (settingsJson !== undefined) {
      writeFileSync(join(workspaceDir, ".pi", "settings.json"), settingsJson, "utf8");
    }
    return workspaceDir;
  } catch (error) {
    disposeWorkspace(workspaceDir);
    throw error;
  }
}

export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

Sibling file `tests/modulo-zero-result-type-number.test.ts` — the same
bug-0142-family invoke-arg sink measured through the same harness —
already calls `plantThetaWorkspace("theta-bug0152-", THETAS, "{}")` and
`disposeWorkspace(workspaceDir)` instead of reimplementing the sequence
(confirmed while reviewing this wave's neighbouring file).

## Why this is a problem
The file imports five other names from `production-load-harness.ts` in the
same import statement that could have carried `plantThetaWorkspace` and
`disposeWorkspace`, and a sibling file measuring the same diagnostic sink
through the same harness already uses the canonical pair. The hand-rolled
copy means a change to the canonical plant sequence (e.g. the `try`/dispose
guard in `plantThetaWorkspace` that cleans up a workspace that failed to
plant, which the local copy has no equivalent for) applies to one sibling and
silently not the other.

## Suggested direction (non-binding, optional)
Calling `plantThetaWorkspace`/`disposeWorkspace` in place of the inline
`mkdtempSync`/`mkdirSync`/`writeFileSync`/`rmSync` sequence is where the
file's own existing import line already points.

## False-positive check
Not a gate/pin file. Not a recording-double MUST-NOT witness. Searched
`quality/issues`, `quality/intake` for "plantThetaWorkspace" and for this
file's name — no existing filing addresses this specific site (the sibling
comparison was made while independently reading `modulo-zero-result-type-number.test.ts`
for this wave, not from a prior filing). Not a coverage claim: the file's own
assertions and its `LoadOutcome` observable are unaffected; only the
temp-workspace plumbing duplicated against an already-imported-from module is
observed.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (test :135-146 inline mkdtemp→mkdir→write-loop→settings "{}"→runProductionLoad→rmSync; helper :267-301 `plantThetaWorkspace`/`disposeWorkspace`), the file's :1-4 import already reaches production-load-harness for five sibling exports while `grep plantThetaWorkspace|disposeWorkspace|productionLoadSuite` in the file → 0 hits and the sibling modulo-zero-result-type-number.test.ts:3,1246,1251 already uses the canonical pair; `THETAS` is `readonly {stem,text}[]` (structurally `PlantedThetaFile[]`) and `assertNoStemIsASuffix` composes before the plant call, so the swap is mechanical; git blame dates the block to 4d072c83 (2026-08-06) before the helper landed (4c0cd0dc, 2026-09-14) and the PTQ-0210/PTQ-1317 migrations touched only `runProductionLoad` — a post-hoc residual, not a design choice; file green (vitest 4/4); D7 boilerplate-duplication class, all locations under tests/, no carve-out binds (not a gate file, real fs setup not a recording double, coverage-matrix cite → 0, docs/bugs 0142/0332 name the file only as witness with no mkdtemp/rmSync pin, no it()/describe() merge/rename/delete proposed); NOT a duplicate — PTQ-1317 (resolved) covered this file's `runProductionLoad` body only, PTQ-0312 names the file only as a PTQ-0210 migration target, PTQ-0904/1324/1088 cite other files (PTQ-1088's fixer note listed this file among six residual `rmSync` inliners but its `sites: 1` tracked only e2e-s5), and same-wave sibling d7-01 is the `assertRowSurfaceLive` helper; same class already accepted for the sibling site as PTQ-1324 (triage: claude-fable-5-1)
