---
id: PTQ-1406
title: subagent-return-depth-refusal.test.ts and subagent-root-binder-model-exempt.test.ts each retype the same launchRealSubagentChild/childExit/driveWatchedSubagentChild/reapSubagentChildren scaffold, plus the identical CHILD_MODEL_PROVIDER/CHILD_MODEL_ID pair, above tests/helpers/real-subagent-spawn.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-return-depth-refusal.test.ts:213-214
  - tests/subagent-return-depth-refusal.test.ts:1040-1082
  - tests/subagent-root-binder-model-exempt.test.ts:148-149
  - tests/subagent-root-binder-model-exempt.test.ts:349-414
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# subagent-return-depth-refusal.test.ts and subagent-root-binder-model-exempt.test.ts each retype the same launchRealSubagentChild/childExit/driveWatchedSubagentChild/reapSubagentChildren scaffold, plus the identical CHILD_MODEL_PROVIDER/CHILD_MODEL_ID pair, above tests/helpers/real-subagent-spawn.ts

## Observation
Both files import the same primitives from `tests/helpers/real-subagent-spawn.ts` (`requireRealSubagentPathsFor`, `realExecutableHost`, `launchRealSubagentChild`, `childExit`, `driveWatchedSubagentChild`, `reapSubagentChildren`). Above that shared boundary, each file independently declares the identical pair of constants `CHILD_MODEL_PROVIDER = "anthropic"` / `CHILD_MODEL_ID = "claude-fable-5"`, and each file's per-root/per-row driver function repeats the same sequence: `mkdtempSync`+`mkdirSync` a scratch tree, write fixtures in a loop, `realExecutableHost()`, call `launchRealSubagentChild` with `provider: CHILD_MODEL_PROVIDER, model: CHILD_MODEL_ID`, guard `!launch.ok`, capture `childExit`, call `driveWatchedSubagentChild` with a watchdog literal, and reap in a `finally` via `reapSubagentChildren([{ kill: () => child.kill(), exited }])`.

## Evidence

`tests/subagent-return-depth-refusal.test.ts:213-214`:
```ts
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";
```

`tests/subagent-root-binder-model-exempt.test.ts:148-149`:
```ts
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";
```

`tests/subagent-return-depth-refusal.test.ts:1040-1082` (scratch tree, launch, guard, exit capture, watchdog drive):
```ts
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0187-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries({ ...FIXTURES, ...ROOTS })) {
        writeFileSync(join(thetaDir, name), source);
      }
      const host: ExecutableHost = realExecutableHost();
      const launched: { readonly kill: () => void; readonly exited: Promise<ChildExitInfo> }[] = [];
      try {
        const driveRoot = async (slug: string): Promise<RootOutcome> => {
          const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
            slug,
            thetaDirs: [thetaDir],
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            cwd: scratchDir,
            host,
          });
          if (!launch.ok) {
            throw new Error(
              `precondition unmet: the spawn of root '${slug}' failed, so nothing about the ` +
                `return boundary was observed — ${JSON.stringify(diagnostics)}`,
            );
          }
          const child = launch.child;
          const exited = childExit(child);
          launched.push({ kill: () => child.kill(), exited });
```
(the file's own `finally` at the tail of the same `it()` closes with `await reapSubagentChildren(launched, scratchDir);`).

`tests/subagent-root-binder-model-exempt.test.ts:349-414` (the same sequence, function-scoped instead of closure-scoped):
```ts
  const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
    slug: input.slug,
    thetaDirs: [input.thetaDir],
    provider: CHILD_MODEL_PROVIDER,
    model: CHILD_MODEL_ID,
    cwd: input.scratchDir,
    controlPlaneEnv: { ... },
    host: input.host,
  });
  if (!launch.ok) {
    return { ... launchFailure: launch.reason };
  }
  const child = launch.child;
  ...
  const exitPromise = childExit(child, (info) => { exit = info; });
  ...
  try {
    ({ result, killedByWatchdog } = await driveWatchedSubagentChild(
      child, join(input.thetaDir, `${input.slug}.theta`), emitDiagnostic, ROW_WATCHDOG_MS,
    ));
  } finally {
    await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }]);
  }
```
and the scratch-tree setup at `tests/subagent-root-binder-model-exempt.test.ts:438-454`:
```ts
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0178-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      mkdirSync(join(scratchDir, ".pi"), { recursive: true });
      writeFileSync(
        join(scratchDir, ".pi", "settings.json"),
        JSON.stringify({ theta: { binderModel: UNMATCHABLE_BINDER_MODEL } }),
        "utf8",
      );
      for (const row of DIRECT_ROWS) {
        writeFileSync(join(thetaDir, `${row.stem}.theta`), row.text, "utf8");
      }
      writeFileSync(join(thetaDir, `${TOP_STEM}.theta`), TOP_FIXTURE, "utf8");
      const host: ExecutableHost = realExecutableHost();
```

Search performed: `grep -n "CHILD_MODEL_PROVIDER\s*=\|CHILD_MODEL_ID\s*=" tests/subagent-return-depth-refusal.test.ts tests/subagent-root-binder-model-exempt.test.ts` — one declaration site per file (2 total), each paired with a `launchRealSubagentChild` call using both constants (2 usage sites, one per file).

## Why this is a problem
Both files sit one level above the same shared helper module (`tests/helpers/real-subagent-spawn.ts`) and both re-derive, by hand, the same scratch-directory-plus-launch-plus-watchdog-drive-plus-reap sequence and the same marshalled-model literal pair, differing only in the tmp-dir prefix string, the fixture map iterated, the watchdog millisecond literal, and (in one file) an extra `controlPlaneEnv` object passed through the identical call shape. A prior finding in this same wave (`qw20260922211400-d7-01-b0337-b0342-chain-fixture-scaffold-duplicated.md`) already names this exact scaffold shape — scratch-dir/fixture-write/launch-guard/exitPromise/reap wrapped around `tests/helpers/real-subagent-spawn.ts` — as retyped across two OTHER files (`b0337-theta-enum-identity-invoke.test.ts`, `b0342-forwarded-enum-subagent-chain.test.ts`); this filing cites the same root cause recurring at a distinct pair of sites not named there.

## Suggested direction (non-binding, optional)
A small helper in `tests/helpers/real-subagent-spawn.ts` that takes a fixture map, a slug, a watchdog bound, and the model provider/id pair, and returns the launched-driven-reaped outcome, is the natural next home both files' own near-identical sequences (and the b0337/b0342 pair already flagged) point toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; not applicable.
- Recording-double check: `diagnostics`/`emitDiagnostic` in both files is a recording double used for a launch-failure error message, not a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "scratchDir\|reapSubagentChildren\|CHILD_MODEL_PROVIDER" docs/bugs/0187*.md docs/bugs/0178*.md` — 0 hits; neither bug document pins this scaffold or the model constants as a witness artefact.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-return-depth-refusal\|subagent-root-binder-model-exempt" docs/reference/coverage-matrix.md` — 0 hits for either file. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` cell, only that the shared scaffold sequence and constant pair are a candidate for the existing helper module.
- Duplicate-topic check: the sibling wave finding `qw20260922211400-d7-01-b0337-b0342-chain-fixture-scaffold-duplicated.md` covers the identical class of duplication against a different file pair (`b0337-theta-enum-identity-invoke.test.ts`, `b0342-forwarded-enum-subagent-chain.test.ts`); this filing names the two files actually in this review's scope and cites them by their own line ranges rather than re-filing that pair.
- Coverage drift check: this finding does not claim a missing test or an untested path; both cited sequences are exercised by their respective files' passing integration cells.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at exactly the cited lines (CHILD_MODEL pair :213-214 / :148-149; bug0187 scratch-tree→realExecutableHost→launchRealSubagentChild→`!launch.ok` guard→childExit→driveWatchedSubagentChild(90_000)→batch reap at :1408; bug0178 driveDirect :349-414 with the same launch/guard/childExit/driveWatched(ROW_WATCHDOG_MS=120_000 at :177)/finally-reap sequence and scratch tree at :438-454); tests/helpers/real-subagent-spawn.ts exports only the primitives (:27-151) and no CHILD_MODEL_* constant, so both the constant pair and the composing shell sit above PTQ-0583's (fixed) call boundary; the stated greps reproduce (constant pair once per file; docs/bugs/0187*/0178* → 0 hits for scratchDir/reapSubagentChildren/CHILD_MODEL_PROVIDER; coverage-matrix → 0 hits for either stem); all locations under tests/, boilerplate-duplication class, neither a gate file, `diagnostics` is a launch-failure message double not a MUST-NOT witness, no cell merge/rename/delete proposed; not a duplicate — PTQ-0583 covered the PI_CLI_ENTRY/requirePath/launch constants and PTQ-0686 return-depth-refusal's unit driveChildRoot block (:726-868, disjoint), and neither file appears in the family head d7-01 (b0337/b0342, confirmed) nor in sibling d7-89-01 (inbound-enum-tag/nonfinite-return-refusal), so this is the next disjoint pair under the per-file-set precedent (PTQ-0759/1032/1077) that d7-01's note already anticipated by name. Accounting notes for the fixer, not changing the outcome: (1) `sites: 2` undercounts the constant pair — `CHILD_MODEL_PROVIDER|CHILD_MODEL_ID` is declared in 13 test files, none in a helper, so lift it once for all importers alongside d7-01's shell helper; (2) bug0178's driveDirect diverges more than the filing states — it returns a launch-failure record instead of throwing, records stdout/stderr line counts via onStdoutLine/onStderrLine, passes a `controlPlaneEnv` params carrier, and reaps per-row rather than batching — so the shared helper must accept a launch-failure policy and optional line taps or bug0178 keeps a thin local wrapper over it (triage: claude-fable-5-1)
