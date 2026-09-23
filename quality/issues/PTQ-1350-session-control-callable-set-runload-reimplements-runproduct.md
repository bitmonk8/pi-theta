---
id: PTQ-1350
title: session-control-callable-set.test.ts's local runLoad re-implements tests/helpers/production-load-harness.ts's runProductionLoad/plantThetaWorkspace/disposeWorkspace sequence
lens: D7
status: open
verdict: confirmed
locations:
  - tests/session-control-callable-set.test.ts:186-256
  - tests/helpers/production-load-harness.ts:81-131
  - tests/helpers/production-load-harness.ts:257-283
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# session-control-callable-set.test.ts's local runLoad re-implements tests/helpers/production-load-harness.ts's runProductionLoad/plantThetaWorkspace/disposeWorkspace sequence

## Observation
`tests/session-control-callable-set.test.ts` declares a local async function `runLoad` (lines 186-256) that hand-builds a temp discovery workspace with `mkdtempSync`/`mkdirSync`/`writeFileSync`, hand-builds a fake `pi`/`ctx` host sized to `discoverAndComposeFixtures`, interposes on `process.stderr.write` to capture the no-UI diagnostic mirror around one `discoverAndComposeFixtures` call, reshapes the result into `{fixtures, registered, notifications, diagnosticLines}`, and disposes the workspace with `rmSync` in a `finally`. `tests/helpers/production-load-harness.ts` exports the same sequence already split into `plantThetaWorkspace` (workspace mkdtemp/mkdir/write/settings-write), `runProductionLoad` (fake host + stderr interposition + `discoverAndComposeFixtures` call + the identical `LoadOutcome` reshape), and `disposeWorkspace` (teardown), each independently importable.

## Evidence
`tests/session-control-callable-set.test.ts:186-256`:
```ts
async function runLoad(
  files: Readonly<Record<string, string>>,
  hostOpts?: FakeHostOpts,
): Promise<LoadOutcome> {
  const workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0011-callable-set-"));
  try {
    const thetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    for (const [stem, text] of Object.entries(files)) {
      writeFileSync(join(thetaDir, `${stem}.theta`), text, "utf8");
    }
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
    ...
    let fixtures: readonly ThetaFixture[];
    try {
      fixtures = await discoverAndComposeFixtures(pi, ctx);
    } finally {
      process.stderr.write = write;
    }

    return {
      fixtures,
      registered: fixtures.map((f) => f.slashName),
      notifications,
      diagnosticLines: chunks.join("").split(/\r?\n/).filter((l) => l.length > 0),
    };
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```

`tests/helpers/production-load-harness.ts:81-131` (the canonical `runProductionLoad`, same fake-host member set, same stderr interposition, same `LoadOutcome` reshape):
```ts
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  ...
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
    fixtures,
  };
```

`tests/helpers/production-load-harness.ts:257-283` (the paired `plantThetaWorkspace`, doing the same mkdtemp/mkdir/write/settings-write the local `runLoad` inlines at its head):
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
```

## Why this is a problem
The helper module's own header states its reason for existing: "Several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function… The same files also independently redeclared the temp-workspace lifecycle WRAPPED around that call." The local `runLoad` in `session-control-callable-set.test.ts` is one more instance of exactly that redeclaration — same workspace mkdtemp/mkdir/write-loop/settings-write opening, same fake-host member set feeding `discoverAndComposeFixtures`, same `process.stderr.write` interposition-and-restore, same three-field `LoadOutcome` reshape, same `rmSync` teardown — differing only in an added `hostOpts` parameter used to selectively omit individual fake-host members (`ctxCompact`, `ctxGetContextUsage`, `piSetSessionName`, `piGetSessionName`), a variation `runProductionLoad`'s own `ProductionLoadOptions` shape does not currently carry but which the same file's own header text observes as an already-anticipated deviation surface ("the same files also independently redeclared… wrapped around that call").

## Suggested direction (non-binding, optional)
The shared shape already lives at `tests/helpers/production-load-harness.ts`; a caller needing per-member host-probe omission is the kind of variation that module's `ProductionLoadOptions` is built to grow.

## False-positive check
Gate-pin carve-out: not applicable — this file is a paired RFC-0011 red-test leaf, not a `*gate*.test.ts` census/pin file. Recording-double carve-out: not applicable — `runLoad`'s fake host is a value-returning double, not a negative-witness recorder. docs/bugs/ signature search: `grep -r "runLoad" docs/bugs/` returned no hits; this is not a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -rn "session-control-callable-set" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits — the file and its `runLoad` function are not pinned by name in either. Prior-filing search: `grep -rl "session-control-callable-set" quality/intake/` returned no hits before this filing. This claim is duplication of test scaffolding only; it does not propose a coverage change and does not touch production code.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim (test :186-256 `runLoad`, helper :81-131 `runProductionLoad`, :257-283 `plantThetaWorkspace`, `disposeWorkspace` at :289); the file imports node:fs/tmpdir/join/discoverAndComposeFixtures directly and nothing from tests/helpers/production-load-harness (grep → 0) while the helper is live (45 test-file importers); the mkdtemp/mkdir/write-loop/`"{}"` settings-write head and `rmSync` tail are byte-for-byte `plantThetaWorkspace(prefix, fixtures, "{}")`/`disposeWorkspace`, the stderr interposition and `{fixtures, registered, notifications, diagnosticLines}` reshape match `runProductionLoad`'s, and the file consumes only those four `LoadOutcome` fields; the one divergence is disclosed and mechanical — the local host adds the four RFC 0011 probe members (`pi.setSessionName/getSessionName`, `ctx.compact/getContextUsage`, plus an always-empty `getAllTools`) that `hostOpts` selectively omits, none of which `ProductionLoadOptions` carries (grep → 0), so the dedupe is the same option-widening shape PTQ-0739 (getAllTools) ratified; git dates confirm a fresh redeclaration not a pre-helper residual (file created c143c4a5 2026-09-16, helper 2594cd44 2026-09-11, plant/dispose 4c0cd0dc 2026-09-14); both locations under tests/, D7 boilerplate-duplication class, no carve-out binds (not a gate file; the fake host is a positive recorder; the RED posture cites RFC 0011 not a docs/bugs signature and the harness plumbing is not what reds; stated docs/bugs `runLoad` search actually hits 0276 but that doc does not name this file, and coverage-matrix → 0; no it()/describe() merge/rename/delete proposed); not a duplicate — quality/{issues,resolved} filings naming this file (PTQ-0465/0694/0698/0712/0740/0836/0887/1006) cover parseDeps/parseDoc/fm/callableSetOf/rootDouble, none the `runLoad` harness, and per the store's per-file convention (PTQ-0593/0669/0717/0722/0739/0850/0910/1031 each minted separately against this helper) this is a distinct mechanically-fixable root cause (triage: claude-fable-5-1)