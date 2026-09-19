---
id: PTQ-0703
title: slsh5-invoke-cascade-chain-suffix.test.ts and subagent-child-hash-refusal-e2e.test.ts hand-roll the mkdtemp/mkdir/settings-write/rmSync workspace lifecycle that production-load-harness.ts's plantThetaWorkspace/disposeWorkspace already centralise
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/slsh5-invoke-cascade-chain-suffix.test.ts:236-249
  - tests/slsh5-invoke-cascade-chain-suffix.test.ts:268-271
  - tests/subagent-child-hash-refusal-e2e.test.ts:60-83
  - tests/helpers/production-load-harness.ts:117-144
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# slsh5-invoke-cascade-chain-suffix.test.ts and subagent-child-hash-refusal-e2e.test.ts hand-roll the mkdtemp/mkdir/settings-write/rmSync workspace lifecycle that production-load-harness.ts's plantThetaWorkspace/disposeWorkspace already centralise

## Observation
Both `tests/slsh5-invoke-cascade-chain-suffix.test.ts` (its `beforeAll`) and
`tests/subagent-child-hash-refusal-e2e.test.ts` (its `beforeEach`) mint a
temp project directory with `mkdtempSync(join(tmpdir(), <prefix>))`, create
its `.pi/theta` subdirectory with `mkdirSync(..., { recursive: true })`,
write one or more `.theta` fixture files into it, write a minimal
`.pi/settings.json` of `"{}"`, and — in their teardown — `rmSync` the
directory recursively. `tests/helpers/production-load-harness.ts` already
exports `plantThetaWorkspace(dirPrefix, fixtures, settingsJson)` and
`disposeWorkspace(workspaceDir)`, built for exactly this same
`discoverAndComposeFixtures`-driving plant/dispose sequence — the module's
own header names this exact lifecycle ("`mkdtemp` a project root, `mkdir`
its `.pi/theta`, a per-fixture write loop, an optional `.pi/settings.json`
write, and an `afterAll` recursive removal") as the half it centralised
because "several test files independently redeclared" it. Both reviewed
files drive `discoverAndComposeFixtures` directly and import neither export.

## Evidence
`tests/slsh5-invoke-cascade-chain-suffix.test.ts:236-249`:
```ts
beforeAll(async () => {
  // `realpathSync` on the workspace root so the planted paths are already in the
  // post-`realpath` form SLSH-5 pins (the OS temp dir is a symlink on some
  // hosts, and a fix routing through the `FileSystem.realpath` seam would
  // otherwise disagree with these expectations for an unrelated reason).
  workspaceDir = realpathSync(mkdtempSync(join(tmpdir(), "theta-bug0088-")));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(thetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  // A present, minimal settings file pins the fixture's settings read.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
```

`tests/slsh5-invoke-cascade-chain-suffix.test.ts:268-271`:
```ts
afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
```

`tests/subagent-child-hash-refusal-e2e.test.ts:60-83` (the same shape,
`beforeEach`/`afterEach` instead of `beforeAll`/`afterAll`):
```ts
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0005-hashref-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  // A subagent-mode callee the parent would have marshalled a closure hash for.
  writeFileSync(
    join(dir, "code-review.theta"),
    "---\nmode: subagent\n---\n@`review`\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "helper.theta"),
    "---\nmode: subagent\n---\n@`help`\n",
    "utf8",
  );
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  restoreEnv();
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

`tests/helpers/production-load-harness.ts:117-144` (the canonical
`plantThetaWorkspace`/`disposeWorkspace`, re-read verbatim immediately before
filing):
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

Search: `grep -n "production-load-harness" tests/slsh5-invoke-cascade-chain-
suffix.test.ts tests/subagent-child-hash-refusal-e2e.test.ts` — 0 hits in
either file.

## Why this is a problem
Both reviewed files perform the identical four-step plant (`mkdtemp` a
project root, `mkdir` its `.pi/theta`, a per-fixture write loop, an optional
`.pi/settings.json` write) and the identical one-step dispose (a
conditional, recursive `rmSync`) around their own drive of the real
`discoverAndComposeFixtures`, and `tests/helpers/production-load-harness.ts`
already exports exactly this pair, built for this exact call
(`disposeWorkspace`'s own `workspaceDir !== undefined` guard is
byte-identical to `slsh5-invoke-cascade-chain-suffix.test.ts`'s own inline
`afterAll` guard). Each file's own settings-write carries the same
"hermeticity, not noise suppression" rationale the helper's docstring states
for the same write.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `plantThetaWorkspace`/
`disposeWorkspace` already perform this same plant/dispose pair around
`discoverAndComposeFixtures`; each file's own `beforeAll`/`beforeEach` could
call `plantThetaWorkspace` for its own fixture list before running its own
subsequent dispatch/verification logic, and its teardown could call
`disposeWorkspace(workspaceDir)` — an observation about the existing export
surface, not a design for the change.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin; neither cited block is a pinned count or inventory assertion.
- Recording-double carve-out: not applicable — the cited lines are
  directory/file-lifecycle setup, not a fake recording calls to back a
  "never called" witness.
- docs/bugs/ signature search: docs/bugs/0088-slsh5-chain-suffix-never-
  emitted.md and the RFC-0005/RFC-0006 hash-verification narrative both
  exist as this pair's own spec anchors; neither names a rationale for
  keeping the workspace-plant sequence local, and neither file's cells are a
  documented correct-reason red (both files' own header comments describe
  themselves as pinning fixed/shipped behaviour, not a red-by-design fork).
- coverage-matrix/bug-doc citation search: `grep -rn
  "slsh5-invoke-cascade-chain-suffix\|subagent-child-hash-refusal-e2e"
  docs/reference/coverage-matrix.md docs/bugs/*.md` — no hits beyond each
  file's own bug-0088/RFC-0005 narrative; this finding proposes no merge,
  rename, or deletion of either file or any test in it, only that the
  repeated plant/dispose pair could call the existing helper exports instead
  of re-deriving them.
- Overlap check against resolved/filed items: `quality/resolved/PTQ-0361-
  workspace-scaffold-duplicated.md` names
  `tests/subagent-child-hash-refusal-e2e.test.ts`'s inline `beforeEach` only
  as unfiled "pattern context" for a DIFFERENT canonical helper
  (`tests/helpers/compose-workspace-harness.ts`'s `finishWorkspace`, which
  wraps `composeExtensionInstance`/`makeHost`, a different production entry
  point) — it does not cite `production-load-harness.ts`'s
  `plantThetaWorkspace`/`disposeWorkspace` (the `discoverAndComposeFixtures`
  family both reviewed files actually drive) at all, and does not name
  `tests/slsh5-invoke-cascade-chain-suffix.test.ts` anywhere. `grep -rl
  "plantThetaWorkspace\|disposeWorkspace" quality/intake/*.md
  quality/resolved/*.md` confirms neither of these two files is cited
  against this specific helper by any existing finding.
- Coverage-drift check: this finding is about a repeated setup/teardown
  definition, not a missing test path; every plant/dispose block cited is
  exercised by its own file's currently-passing tests.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (slsh5:236-249/268-271, hash-refusal:60-83, helper:117-144); grep of production-load-harness|plantThetaWorkspace|disposeWorkspace in both reviewed files → 0 hits while the helper is live (100+ importers) and its header names this exact mkdtemp/mkdir/write-loop/settings/rmSync lifecycle as the half PTQ-0312 centralised; slsh5's THETAS is already {stem,text}[] (structurally PlantedThetaFile[]) and its realpathSync wrap composes over the helper's return, so nothing load-bearing is lost; no gate/recording-double/correct-reason-red carve-out applies and no test is merged/renamed/deleted; dedupe holds — PTQ-0312 covers b0297/conformance/arg-mismatch only, PTQ-0361 names hash-refusal solely as out-of-scope pattern context for the different finishWorkspace helper and never names slsh5, PTQ-0225/0343 cover different scaffold pieces (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
