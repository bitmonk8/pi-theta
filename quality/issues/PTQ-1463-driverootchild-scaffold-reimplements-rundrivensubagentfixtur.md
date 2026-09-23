---
id: PTQ-1463
title: inbound-union-arm-dispatch.test.ts's plantThetas/driveRootChild/dropScratch scaffold reimplements the canonical runDrivenSubagentFixtureCell helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inbound-union-arm-dispatch.test.ts:1219-1220
  - tests/inbound-union-arm-dispatch.test.ts:1276-1342
  - tests/inbound-union-arm-dispatch.test.ts:1344-1359
  - tests/helpers/real-subagent-spawn.ts:172-213
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# inbound-union-arm-dispatch.test.ts's plantThetas/driveRootChild/dropScratch scaffold reimplements the canonical runDrivenSubagentFixtureCell helper

## Observation
`tests/inbound-union-arm-dispatch.test.ts` imports the low-level primitives `requireRealSubagentPathsFor`, `realExecutableHost`, `launchRealSubagentChild`, `childExit`, `driveWatchedSubagentChild`, `reapSubagentChildren` from `tests/helpers/real-subagent-spawn.ts`, then hand-assembles its own `mkdtempSync`+`mkdirSync`+write-fixtures / `realExecutableHost()` / `launchRealSubagentChild` / launch-guard / `childExit` / `driveWatchedSubagentChild` / `try…finally reapSubagentChildren` shell across three local functions (`plantThetas`, `driveRootChild`, `dropScratch`). The same helper module already exports `runDrivenSubagentFixtureCell`, whose own header describes exactly this sequence — "scratch-dir → fixture-write → launch-guard → watchdog-drive → try/finally-reap shell shared by the real-subagent integration cells" — built from the identical five primitives, but this file's three local functions are not built on top of it.

## Evidence
`tests/inbound-union-arm-dispatch.test.ts:1219-1220`:
```ts
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";
```

`tests/inbound-union-arm-dispatch.test.ts:1276-1301` (scratch-dir/launch-guard/watchdog-drive/reap shell, hand-assembled):
```ts
async function driveRootChild(input: {
  readonly scratchDir: string;
  readonly thetaDir: string;
  readonly slug: string;
  readonly params?: string;
}): Promise<ChildDrive> {
  requireRealSubagentPaths();

  const host: ExecutableHost = realExecutableHost();
  const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
    slug: input.slug,
    thetaDirs: [input.thetaDir],
    provider: CHILD_MODEL_PROVIDER,
    model: CHILD_MODEL_ID,
    cwd: input.scratchDir,
    controlPlaneEnv: {
      [SUBAGENT_PARAMS_ENV]: input.params,
      [SUBAGENT_PARAMS_FILE_ENV]: undefined,
    },
    host,
  });
  if (!launch.ok) {
```

`tests/inbound-union-arm-dispatch.test.ts:1326-1334` (the try/finally watchdog-drive/reap half of the same shell):
```ts
  try {
    ({ result, killedByWatchdog } = await driveWatchedSubagentChild(
      child, join(input.thetaDir, `${input.slug}.theta`), emitDiagnostic, 60_000,
    ));
  } finally {
    await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }]);
  }
```

`tests/inbound-union-arm-dispatch.test.ts:1344-1359` (the scratch-dir plant/drop pair, also hand-assembled):
```ts
function dropScratch(scratchDir: string): void {
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // The child's cwd may still be releasing; the OS temp sweeper owns the rest.
  }
}

/** One discovery root, holding the fixtures a cell's root theta resolves `./` against. */
function plantThetas(files: Readonly<Record<string, string>>): {
  readonly scratchDir: string;
  readonly thetaDir: string;
} {
  const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0172-face2-"));
  const thetaDir = join(scratchDir, "thetas");
  mkdirSync(thetaDir, { recursive: true });
```

`tests/helpers/real-subagent-spawn.ts:172-213` (the canonical helper covering the identical five-primitive sequence):
```ts
export async function runDrivenSubagentFixtureCell(input: {
  readonly tmpPrefix: string;
  readonly fixtures: Readonly<Record<string, string>>;
  readonly rootSource: string;
  readonly provider: string;
  readonly model: string;
  readonly watchdogMs: number;
  readonly body: (outcome: DrivenSubagentFixtureOutcome) => Promise<void> | void;
}): Promise<void> {
  const scratchDir = mkdtempSync(join(tmpdir(), input.tmpPrefix));
  const thetaDir = join(scratchDir, "thetas");
  mkdirSync(thetaDir, { recursive: true });
  for (const [name, source] of Object.entries(input.fixtures)) {
    writeFileSync(join(thetaDir, name), source);
  }
  writeFileSync(join(thetaDir, "top.theta"), input.rootSource);

  const host: ExecutableHost = realExecutableHost();

  const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
    slug: "top",
    thetaDirs: [thetaDir],
    provider: input.provider,
    model: input.model,
    cwd: scratchDir,
    host,
  });
  if (!launch.ok) {
    throw new Error(`launch failed: ${JSON.stringify(diagnostics)}`);
  }
  const child = launch.child;

  const exitPromise = childExit(child);

  try {
    const { result, killedByWatchdog } = await driveWatchedSubagentChild(
      child, join(thetaDir, "top.theta"), emitDiagnostic, input.watchdogMs,
    );
    await input.body({ result, killedByWatchdog, diagnostics, exitPromise });
  } finally {
    await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);
  }
}
```

Search run: `grep -rl 'CHILD_MODEL_ID = "claude-fable-5"' tests/*.test.ts` — 13 files hit, all reimplementing the same scratch-dir/launch/watchdog/reap shell around the same helper module's five primitives rather than the module's own `runDrivenSubagentFixtureCell` wrapper; `grep -n runDrivenSubagentFixtureCell tests/*.test.ts` shows zero callers of the exported helper anywhere in the suite.

## Why this is a problem
`tests/helpers/real-subagent-spawn.ts` exports `runDrivenSubagentFixtureCell` specifically to centralise the "mkdtemp scratch dir, write fixtures, launch with the three child pins, drive under a watchdog, reap on every path" sequence its own doc comment names as "shared by the real-subagent integration cells." This file imports the five lower-level primitives that helper is built from and re-derives the identical scratch-dir/launch-guard/watchdog-drive/reap-in-finally shell locally across `plantThetas`, `driveRootChild`, and `dropScratch`, rather than calling the canonical wrapper — the fake/harness-reimplemented-despite-canonical-helper shape.

## Suggested direction (non-binding, optional)
`runDrivenSubagentFixtureCell` (`tests/helpers/real-subagent-spawn.ts:172`) is the existing home for this shell; it does not currently accept a `controlPlaneEnv` override or an arbitrary `slug`, which this file's two multi-root cells need, so folding this file's usage in is not a pure call-site swap.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; the census/pin carve-out does not apply.
- Recording-double check: `driveRootChild`/`plantThetas`/`dropScratch` are scaffold/harness functions, not call-recording MUST-NOT-witness doubles; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: grepped `docs/bugs/0172*` for `runDrivenSubagentFixtureCell` / `driveRootChild` / `plantThetas` — no hits; not a documented correct-reason divergence.
- coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for `inbound-union-arm-dispatch` — no hits, so no citation pins this file's internal scaffold shape; this filing does not propose merging, renaming, or deleting any test.
- Confirmed via direct read that `runDrivenSubagentFixtureCell`'s body is the same five imported primitives in the same order (mkdtemp/mkdir/write, `realExecutableHost`, `launchRealSubagentChild`, launch-guard, `childExit`/watchdog-drive, `try/finally reapSubagentChildren`) that this file's three local functions independently re-derive.
- Checked `quality/issues/` for prior filings on this exact pair: `PTQ-1406` and `PTQ-1405-01` cite the same duplicated shell across other file pairs (`subagent-return-depth-refusal.test.ts`/`subagent-root-binder-model-exempt.test.ts`; `subagent-invoke-inbound-enum-tag.test.ts`/`subagent-invoke-nonfinite-return-refusal.test.ts`), but neither cites `tests/inbound-union-arm-dispatch.test.ts` or the unused `runDrivenSubagentFixtureCell` export, so this is a distinct, previously unfiled site.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all excerpts reproduce at exactly the cited lines (CHILD_MODEL pair :1219-1220; driveRootChild :1276-1342 with realExecutableHost→launchRealSubagentChild→`!launch.ok` throw→childExit→try driveWatchedSubagentChild(60_000)/finally reapSubagentChildren; dropScratch :1344-1350; plantThetas :1353-1364 mkdtemp/mkdir/writeFileSync loop) and the canonical `runDrivenSubagentFixtureCell` at tests/helpers/real-subagent-spawn.ts:172-213 composes the same five primitives in the same order; the 13-file `CHILD_MODEL_ID` grep reproduces; all locations under tests/, boilerplate-duplication class, not a gate file, `diagnostics` is a failure-message double not a MUST-NOT witness, no cell merge/rename/delete proposed, docs/bugs/0172* and coverage-matrix → 0 hits for the three local names; not a duplicate — the helper was landed by commit fac7d83b as the PTQ-1307 (b0337/b0342) family-head fix, whose note named union-arm-dispatch only as an uncited family member, and PTQ-1405 (enum-tag/nonfinite) and PTQ-1406 (return-depth/root-binder-model-exempt) are disjoint file sets, so under the per-file-set precedent (PTQ-0759/1032/1077/1405/1406) this is the family's next row. Two accounting corrections for the fixer, not changing the outcome: (1) the filing's "zero callers of runDrivenSubagentFixtureCell" is FALSE — b0337-theta-enum-identity-invoke.test.ts:558 and b0342-forwarded-enum-subagent-chain.test.ts:181 both call it since the 1307 fix; (2) as the filing's own direction concedes this is not a call-site swap — this file needs an arbitrary `slug` ("root"/"rootctl"), a `controlPlaneEnv` params carrier (same need PTQ-1406 recorded for bug0178), an exit-info capture via the childExit callback, and two drives against one planted dir (:1473/:1500 share `planted`), so the helper must grow those knobs (or a plant-once/drive-many split) before this file and 1405/1406 can migrate (triage: claude-fable-5-1)
