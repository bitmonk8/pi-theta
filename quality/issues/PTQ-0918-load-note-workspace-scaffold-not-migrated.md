---
id: PTQ-0918
title: load-phase-pre-eval-routing.test.ts and load-warning-delivery.test.ts hand-roll the mkdtemp/mkdir/rmSync workspace lifecycle already exported as plantThetaWorkspace/disposeWorkspace from the same module they import from
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/load-phase-pre-eval-routing.test.ts:1-5
  - tests/load-phase-pre-eval-routing.test.ts:31-42
  - tests/load-warning-delivery.test.ts:2-11
  - tests/load-warning-delivery.test.ts:355-367
  - tests/helpers/production-load-harness.ts:112-153
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# load-phase-pre-eval-routing.test.ts and load-warning-delivery.test.ts hand-roll the mkdtemp/mkdir/rmSync workspace lifecycle already exported as plantThetaWorkspace/disposeWorkspace from the same module they import from

## Observation
Both `tests/load-phase-pre-eval-routing.test.ts` and
`tests/load-warning-delivery.test.ts` already import `GOOD_THETA`,
`BAD_THETA`, `makeShippedHarness`, and `RecordedNote` from
`tests/helpers/production-load-harness.ts`. That same module also exports
`plantThetaWorkspace` (mkdtemp a workspace, mkdir its `.pi/theta`, write one
file per fixture, optionally write `.pi/settings.json`) and
`disposeWorkspace` (a guarded `rmSync(dir, { recursive: true, force: true })`
tolerating an unset directory). Neither test file imports either function;
both instead declare their own `beforeEach`/`afterEach` pair that performs
the identical `mkdtempSync`/`mkdirSync`/`rmSync` sequence by hand.

## Evidence

`tests/load-phase-pre-eval-routing.test.ts:1-5` (the import line, the two
sibling exports absent from it):
```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GOOD_THETA, BAD_THETA, makeShippedHarness as makeHarness, type RecordedNote } from "./helpers/production-load-harness";
```

`tests/load-phase-pre-eval-routing.test.ts:31-42` (the hand-rolled
lifecycle):
```ts
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-v4e-load-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });
```

`tests/load-warning-delivery.test.ts:2-11` (the import line, same two
sibling exports absent):
```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { GOOD_THETA, BAD_THETA, makeShippedHarness, type RecordedNote } from "./helpers/production-load-harness";
```

`tests/load-warning-delivery.test.ts:355-367` (the same lifecycle shape,
differing only in the `mkdtemp` prefix):
```ts
let workspace: string;
let thetaDir: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "theta-bug0013-"));
  thetaDir = join(workspace, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});
```

`tests/helpers/production-load-harness.ts:112-153` (the exported functions
neither file imports; `disposeWorkspace`'s body is byte-for-byte what both
`afterEach` blocks above inline):
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

Exact search: `grep -n "mkdtempSync(join(tmpdir()" tests/load-phase-pre-eval-routing.test.ts tests/load-warning-delivery.test.ts` → one hit per file, at the cited `beforeEach` blocks; `grep -n "plantThetaWorkspace\|disposeWorkspace" tests/load-phase-pre-eval-routing.test.ts tests/load-warning-delivery.test.ts` → 0 hits in either file.

## Why this is a problem
`tests/helpers/production-load-harness.ts`'s own header states it exists
because "several test files independently redeclared … the temp-workspace
lifecycle WRAPPED around that call — `mkdtemp` a project root, `mkdir` its
`.pi/theta`, a per-fixture write loop, … and an `afterAll` recursive
removal — so `plantThetaWorkspace` / `disposeWorkspace` centralise that
half too." Both files in this scope already import three other exports
(`GOOD_THETA`, `BAD_THETA`, `makeShippedHarness`) from this exact module —
the import edge to the module already exists — yet each still carries its
own copy of the lifecycle the module's own header names as the second half
of what it was extracted to centralise. `disposeWorkspace`'s body is the
exact `rmSync(workspaceDir, { recursive: true, force: true })` guard both
files' `afterEach` blocks inline directly.

## Suggested direction (non-binding, optional)
`disposeWorkspace(workspace)` is a drop-in replacement for each file's
`afterEach` body; each `it()`'s own `writeFileSync` calls could compose into
a `plantThetaWorkspace(prefix, fixtures)` call at the top of the test body
in place of the shared `beforeEach`, mirroring how other `tests/helpers/
production-load-harness.ts` callers already use it.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable — this finding is about a setup/teardown declaration,
  not a pinned count or corpus inventory.
- Recording-double check: `workspace`/`thetaDir` are plain filesystem paths,
  not a fake, double, or MUST-NOT recording witness; not applicable.
- docs/bugs/ signature search: `grep -n "load-phase-pre-eval-routing\|load-warning-delivery" docs/bugs/*.md` → 0 hits in either file's own bug doc citing this lifecycle as an intentional divergence. `npx vitest run tests/load-phase-pre-eval-routing.test.ts tests/load-warning-delivery.test.ts` → 12 passed (12) at HEAD; neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "load-phase-pre-eval-routing\|load-warning-delivery" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` in either file — only that the setup/teardown lines could call the already-imported-from module's own exports instead of restating their bodies.
- Coverage check: the claim is entirely about a repeated setup/teardown
  DEFINITION; every test in both files runs and passes against its own
  copy, so no test path is claimed missing.
- Prior-filing overlap check: resolved `PTQ-0632-01-shipped-harness-duplicated-load-phase-pre-eval.md`
  covers these same two files' `makeHarness`/`makeShippedHarness`,
  `RecordedNote`, and `GOOD_THETA`/`BAD_THETA` redeclaration (now fixed by
  both files importing from `production-load-harness.ts`) but its Evidence
  and locations never cite the `beforeEach`/`afterEach` lifecycle lines —
  that finding's own diff notes the returned-object shape and the fixture
  strings, not the workspace plant/dispose half. Open findings
  PTQ-0517/PTQ-0600/PTQ-0635/PTQ-0669/PTQ-0703/PTQ-0717/PTQ-0722/PTQ-0723/PTQ-0739
  each track this same "hand-rolled lifecycle vs. `plantThetaWorkspace`/
  `disposeWorkspace`" root cause in *other* files; none of their `locations:`
  lists cites `tests/load-phase-pre-eval-routing.test.ts` or
  `tests/load-warning-delivery.test.ts`, so this is a distinct file-pair
  instance of an already-recognised root cause, not a re-file. Resolved
  `PTQ-0890-disposeworkspace-duplicated-two-canonical-helpers.md` is a
  disjoint claim about two `tests/helpers/*.ts` files both exporting
  `disposeWorkspace`; it does not cite either test file here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts match verbatim at the cited lines (routing :1-5/:31-42, warning-delivery :2-11/:355-367, harness :112-153); `mkdtempSync(join(tmpdir()` → exactly one hit per file (:35, :360) and `plantThetaWorkspace\|disposeWorkspace` → 0 hits in both, while both files already import GOOD_THETA/BAD_THETA/makeShippedHarness/RecordedNote from the same module; `disposeWorkspace`'s body is the same `rmSync(_, { recursive: true, force: true })` both afterEach blocks inline; the helper landed 4c0cd0dc (2026-09-14) with a header naming this exact mkdtemp/mkdir/rmSync lifecycle as what it centralises, whereas both copies blame to 4a38a4bf (2026-07-13) / 1046f93a (2026-07-28) and were untouched by the PTQ-0632 fix 52753dea — unmigrated residuals, not a design choice; 12/12 tests pass at HEAD; D7 boilerplate-duplication class, all locations under tests/, no gate/recording-double/red-test carve-out, no it() merge/rename/delete proposed; not a duplicate — resolved PTQ-0632's routing :34-47 range was the GOOD_THETA/BAD_THETA fixtures not the lifecycle, PTQ-0839/0894/0258/0461 cite other lines of warning-delivery, and none of the open plant/dispose siblings (PTQ-0517/0600/0635/0669/0703/0717/0722/0723/0739/0850) cites either file; two immaterial filing inaccuracies noted for the record: PTQ-0890 is open in quality/issues/ (not resolved) but is a disjoint helper-vs-helper claim, and the docs/bugs grep has 4 hits (0013/0076/0113/0475) not 0, all cell witnesses that do not contest the setup/teardown (triage: claude-fable-5-1)
