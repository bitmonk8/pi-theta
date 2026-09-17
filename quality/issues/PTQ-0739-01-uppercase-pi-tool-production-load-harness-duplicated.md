---
id: PTQ-0739
title: uppercase-pi-tool-name-refusal.test.ts reimplements the shared production-load workspace plant/dispose + host double instead of importing tests/helpers/production-load-harness.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/uppercase-pi-tool-name-refusal.test.ts:373-399
  - tests/uppercase-pi-tool-name-refusal.test.ts:401-417
  - tests/helpers/production-load-harness.ts:56-95
  - tests/helpers/production-load-harness.ts:123-152
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# uppercase-pi-tool-name-refusal.test.ts reimplements the shared production-load workspace plant/dispose + host double instead of importing tests/helpers/production-load-harness.ts

## Observation
`tests/uppercase-pi-tool-name-refusal.test.ts` declares its own local
`runProductionLoad(cwd)` (a fake, no-UI `ExtensionAPI`/`ExtensionContext` pair
driving `discoverAndComposeFixtures`, returning `{registered, notifications}`)
and its own `beforeAll`/`afterAll` temp-workspace plant/dispose sequence
(`mkdtempSync` a project root, `mkdirSync` its `.pi/theta`, a per-fixture
write loop, a `.pi/settings.json` write, an `afterAll` `rmSync`).
`tests/helpers/production-load-harness.ts` already exports `runProductionLoad`,
`plantThetaWorkspace`, and `disposeWorkspace` performing the identical
sequence — its own header states this centralisation exists precisely because
"several test files independently redeclared the same `LoadOutcome` shape and
the same `runProductionLoad` function… wrapped around that call" (PTQ-0210,
PTQ-0312). This file imports neither.

## Evidence
`tests/uppercase-pi-tool-name-refusal.test.ts:375-386` (the local host
double's `pi` object; byte-for-byte the same member set as the canonical
helper's, plus one extra `getAllTools` stub):
```ts
const pi = {
  getFlag: (): undefined => undefined,
  getCommands: (): readonly unknown[] => [],
  sendMessage: (): void => {},
  sendUserMessage: (): void => {},
  getActiveTools: (): readonly string[] => [],
  setActiveTools: (): void => {},
  getAllTools: (): readonly unknown[] => [{ name: UPPER_TOOL }],
} as unknown as ExtensionAPI;
```

`tests/uppercase-pi-tool-name-refusal.test.ts:401-417` (the plant/dispose
lifecycle, identical in shape to `plantThetaWorkspace`/`disposeWorkspace`):
```ts
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0108-"));
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

`tests/helpers/production-load-harness.ts:60-68` (the canonical `pi` double
this file's local `pi` object mirrors, member-for-member):
```ts
const pi = {
  getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
  getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
  sendMessage: (): void => {},
  sendUserMessage: (): void => {},
  getActiveTools: (): readonly string[] => [],
  setActiveTools: (): void => {},
} as unknown as ExtensionAPI;
```

`tests/helpers/production-load-harness.ts:123-141` (`plantThetaWorkspace`,
the identical plant lifecycle):
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
```

`tests/helpers/production-load-harness.ts:148-152` (`disposeWorkspace`, the
identical dispose lifecycle):
```ts
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

## Why this is a problem
The whole temp-workspace plant/dispose sequence (`mkdtempSync` → `mkdirSync`
`.pi/theta` → per-fixture `writeFileSync` loop → optional
`.pi/settings.json` write → `rmSync` teardown) is written out a second time
in this file with no structural difference from `plantThetaWorkspace` /
`disposeWorkspace`, and the fake `pi`/`ctx` host double driving
`discoverAndComposeFixtures` is copied field-for-field from the canonical
`runProductionLoad`, with one field (`getAllTools`) added on top. A change to
either shared sequence (e.g. widening `LoadOutcome` to also capture
`diagnosticLines`, which the canonical helper already does and this file's
local copy does not) has to be hand-applied here separately.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `plantThetaWorkspace` /
`disposeWorkspace` pair covers this file's workspace lifecycle as-is; its
`runProductionLoad` covers everything but the `getAllTools` stub this file's
scenario needs.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and is not one of
  the named gate kinds; not a census/pin gate.
- Recording-double check: `runProductionLoad`'s `notifications` array and the
  local `pi`/`ctx` double are not a "never called" MUST-NOT witness in this
  finding's cited lines; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "production-load-harness\|plantThetaWorkspace" docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md` → 0 hits; the bug doc's own §Method section describes this file's Group (B) tier by what it drives (`discoverAndComposeFixtures` over a real on-disk workspace), not by which module supplies the double, so nothing there pins the local reimplementation over the shared helper.
- coverage-matrix/bug-doc citation search: `docs/reference/coverage-matrix.md` cites no line ranges inside this file (`grep -n "uppercase-pi-tool-name-refusal" docs/reference/coverage-matrix.md` → 0 hits); the bug doc's own witness list names this file as "the offline witness" as a whole file, not any `it()`/`describe()` name this finding touches. This finding proposes no merge, rename, or deletion of any test.
- Coverage check: this finding is about a repeated setup SEQUENCE that exists in the file today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines; tests/uppercase-pi-tool-name-refusal.test.ts imports node:fs/discoverAndComposeFixtures directly and nothing from tests/helpers/production-load-harness (grep → 0 hits); the local `pi`/`ctx` double matches the helper's six members field-for-field with only `getAllTools` added (helper has no such option, 0 hits, so the dedupe is a mechanical ProductionLoadOptions widening the filing discloses), and the beforeAll/afterAll plant/dispose differs from plantThetaWorkspace/disposeWorkspace only by the hard-coded "{}" settings argument; not a gate file, positive (toContain) witness not a MUST-NOT double, bug-doc 0108 and coverage-matrix greps → 0 hits; PTQ-0210/0240/0259/0312/0358 each cite other files, none this one (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
