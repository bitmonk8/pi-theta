---
id: PTQ-0635
title: modulo-zero-result-type-number.test.ts hand-rolls runProductionLoad plus the plant/dispose workspace lifecycle instead of importing tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/modulo-zero-result-type-number.test.ts:1793-1843
  - tests/modulo-zero-result-type-number.test.ts:1858-1870
  - tests/helpers/production-load-harness.ts:26-137
sites: 1
fix_scope: localized           # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# modulo-zero-result-type-number.test.ts hand-rolls runProductionLoad plus the plant/dispose workspace lifecycle instead of importing tests/helpers/production-load-harness.ts

## Observation
`tests/modulo-zero-result-type-number.test.ts` declares its own module-scope
`LoadOutcome` interface, its own `async function runProductionLoad(cwd)` (a
fake no-UI `ExtensionAPI`/`ExtensionContext` pair, a `process.stderr.write`
interposition around one `discoverAndComposeFixtures` call, and a
`{registered, notifications, diagnosticLines}` reshape), and, inline inside
its own `beforeAll`/`afterAll`, the `mkdtempSync`/`mkdirSync`/per-fixture
`writeFileSync`/optional-settings-write plant sequence and the `rmSync`
recursive-removal dispose step. `tests/helpers/production-load-harness.ts`
already exports `runProductionLoad`, `plantThetaWorkspace` and
`disposeWorkspace` covering exactly this shape (its own header names this as
its reason for existing: "Several test files independently redeclared the
same `LoadOutcome` shape and the same `runProductionLoad` function… The same
files also independently redeclared the temp-workspace lifecycle"). The
reviewed file imports neither symbol; it re-derives both pieces locally.

## Evidence

`tests/modulo-zero-result-type-number.test.ts:1802-1843` — the locally
declared `runProductionLoad`:
```ts
async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
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
  };
}
```

`tests/helpers/production-load-harness.ts:44-96` — the exported equivalent
(re-read in full immediately before filing), same fake-host shape, same
`process.stderr.write` interposition, same reshape, parameterised by an
`opts` object whose defaults (`undefined`/`[]`/`[]`) match the reviewed
file's hardcoded values exactly, because none of this file's callers need a
non-default `thetaFlag`/`piOwnedCommands`/`availableModels`:
```ts
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
    getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

`tests/modulo-zero-result-type-number.test.ts:1858-1865` — the inline plant
sequence, inside `beforeAll`:
```ts
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0152-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(projectThetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
```

`tests/modulo-zero-result-type-number.test.ts:1868-1870` — the inline dispose:
```ts
afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

`tests/helpers/production-load-harness.ts:110-137` — the exported
`plantThetaWorkspace`/`disposeWorkspace` pair covering the identical
`mkdtempSync`→`mkdirSync`→per-fixture `writeFileSync`→optional
`settings.json` write→`rmSync` sequence:
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

Exact check: `grep -n "production-load-harness\|runProductionLoad" tests/modulo-zero-result-type-number.test.ts` shows only the one locally declared `async function runProductionLoad` and its one call site — no import of `tests/helpers/production-load-harness.ts` anywhere in the file's import block (lines 1-36).

## Why this is a problem
A canonical helper for exactly this shape — the fake no-UI host plus stderr
interposition (`runProductionLoad`) and the temp-workspace plant/dispose pair
(`plantThetaWorkspace`/`disposeWorkspace`) — already exists in
`tests/helpers/production-load-harness.ts`, created to centralise this same
harness after the resolved PTQ-0210 found it duplicated across five files,
one of which was this same file (PTQ-0210's own evidence cites
`tests/modulo-zero-result-type-number.test.ts:1830-1839`, the same
`process.stderr.write` interposition reproduced above at its current line
numbers). At HEAD, `tests/helpers/production-load-harness.ts` exports the
centralising module PTQ-0210's own "Suggested direction" called for, but this
file still carries its own private, near-identical copy of the fake host,
the stderr-capture mechanism, and the plant/dispose lifecycle rather than
importing that module, so a later change to any of those three pieces has to
be re-applied here by hand, unlike in the several sibling files that already
import from it.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `runProductionLoad`/
`plantThetaWorkspace`/`disposeWorkspace` already cover this file's `pi`/`ctx`
shape, stderr capture, and plant/dispose sequence with matching defaults;
importing them in place of the local re-declaration is the direction the
existing helper module already points at.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin; nothing cited is a pinned count or inventory assertion.
- Recording-double check: `notifications`/`chunks` are ordinary recording arrays used to assert presence of diagnostic output, not a MUST-NOT-called negative witness; the finding is about the harness construction being re-derived locally, not about the soundness of what it records.
- docs/bugs/ signature search: `grep -rl "runProductionLoad\|production-load-harness" docs/bugs/*.md` hits 0183 and 0207 (both status fixed, both about a stale docstring attribution inside this harness family, not about keeping a local copy); `docs/bugs/0152-modulo-zero-result-type-not-number.md` (this file's own bug doc) states no rationale for a private harness copy. `npx vitest run tests/modulo-zero-result-type-number.test.ts` passes in full at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "modulo-zero-result-type-number" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` name — only that the private `runProductionLoad`/plant/dispose code could import the existing helper module — so no citation is disturbed.
- Coverage check: the claim is about a repeated harness DEFINITION already centralised elsewhere, not a missing test path; every line cited is exercised by this file's own passing tests.
- Prior-finding overlap check: PTQ-0210 (resolved, fixed) named this exact file among five, citing only the `process.stderr.write` interposition snippet and the fake `pi` object as duplicated ACROSS FILES at the time; it did not claim (and its own evidence excerpt does not show) that a canonical helper module already existed for callers to import — this finding's claim is the later-arising one, that `tests/helpers/production-load-harness.ts` now exists (as PTQ-0210's own suggested direction anticipated) and this file was never migrated onto it. This wave's `qw20260917154546-d7-03-planted-stem-suffix-guard-quintupled.md` cites a disjoint code block in the same file (the suffix-collision loop inside `beforeAll`, lines 1850-1856) and explicitly scopes itself to that one uncentralised piece, not to `runProductionLoad` or the plant/dispose calls cited here. This wave's `qw20260917154546-d7-03-theta-fixture-builder-quartet-duplicated.md` cites a third, disjoint block in the same file (the `theta`/`invokeCaller` fixture-text builders, lines 1750-1762). None of the three prior/duplicate-adjacent findings cite the `runProductionLoad` function body or the plant/dispose calls cited here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all excerpts reproduce verbatim at the cited lines (test.ts:1793-1843, 1858-1870; harness.ts:26-137); `grep production-load-harness\|runProductionLoad` in the file yields only the local decl (:1802) and its one call (:1865); sed-extracted local body diffs against the helper only in the opts parameterisation (getFlag/getCommands/getAvailable, whose `undefined`/`[]`/`[]` defaults equal the local hardcodes) plus the helper's extra `fixtures` field, so it is a strict subset with a mechanical import-swap fix; plant/dispose block matches plantThetaWorkspace/disposeWorkspace shape exactly; not a gate test, 0 hits in coverage-matrix.md, docs/bugs hits (0183/0207) are fixed docstring items, 42/42 vitest green; NOT a duplicate: resolved PTQ-0210 rostered this file as site 5 but its fix commit 2594cd44 touched only arg-mismatch-diagnostic-count-by-surface (git show --stat), the sole quality commit since on this file (9ba6d1c3) was the theta-corpus swap, and PTQ-0312's claim that PTQ-0210 migrated all five is refuted at HEAD — nothing open tracks this residual, matching the confirmed PTQ-0240/0259/0358 pattern for un-migrated runProductionLoad copies; in-wave d7-03 siblings cite disjoint blocks (:1850-1856 suffix guard, :1750-1762 builders) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
