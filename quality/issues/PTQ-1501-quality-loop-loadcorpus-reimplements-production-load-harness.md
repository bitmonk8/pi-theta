---
id: PTQ-1501
title: quality-loop-empty-tail-return-validation.test.ts's loadPi/loadCtx/loadCorpus reimplement the canonical runProductionLoad + plantThetaWorkspace/disposeWorkspace trio
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/quality-loop-empty-tail-return-validation.test.ts:108-171
  - tests/helpers/production-load-harness.ts:96-138
  - tests/helpers/production-load-harness.ts:267-302
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# quality-loop-empty-tail-return-validation.test.ts's loadPi/loadCtx/loadCorpus reimplement the canonical runProductionLoad + plantThetaWorkspace/disposeWorkspace trio

## Observation
`tests/quality-loop-empty-tail-return-validation.test.ts` declares a local
`LoadRecorder` interface, a local `loadPi()`, a local `loadCtx(cwd, recorder)`
and a local `async function loadCorpus(files)` that together: `mkdtemp` a temp
project directory, `mkdir` its `.pi/theta`, write one file per fixture,
interpose on `process.stderr.write` (via `vi.spyOn`) for the duration of one
`discoverAndComposeFixtures` call, record `ctx.ui.notify` calls, and `rmSync`
the workspace in a `finally`. `tests/helpers/production-load-harness.ts`
already exports `runProductionLoad(cwd, opts)` — the identical fake
`pi`/`ctx` pair sized to `discoverAndComposeFixtures`, the identical
`process.stderr.write` interposition capturing the same no-UI diagnostic
mirror, and the identical `{registered, notifications, ...}` reshape — plus
the paired `plantThetaWorkspace(dirPrefix, fixtures)` /
`disposeWorkspace(workspaceDir)` functions for the same `mkdtemp`
/`.pi/theta`/write-loop/`rmSync` lifecycle the in-scope file inlines by hand.
The in-scope file does not import from `production-load-harness.ts` at all.

## Evidence

`tests/quality-loop-empty-tail-return-validation.test.ts:108-171` (re-read
immediately before filing):
```ts
interface LoadRecorder {
  readonly toasts: { message: string; type: string }[];
}

function loadPi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    registerFlag: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function loadCtx(cwd: string, recorder: LoadRecorder): ExtensionContext {
  return {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.toasts.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}
...
async function loadCorpus(files: Record<string, string>): Promise<{
  readonly registered: readonly string[];
  readonly stderr: string;
  readonly toasts: readonly { message: string; type: string }[];
}> {
  const workspace = mkdtempSync(join(tmpdir(), "theta-loadpath-"));
  const thetaDir = join(workspace, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(thetaDir, name), text, "utf8");
  }
  const recorder: LoadRecorder = { toasts: [] };
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((): boolean => true);
  try {
    const thetas = await discoverAndComposeFixtures(loadPi(), loadCtx(workspace, recorder));
    return {
      registered: thetas.map((t) => t.slashName),
      stderr: stderrSpy.mock.calls.map((c) => String(c[0])).join(""),
      toasts: recorder.toasts,
    };
  } finally {
    stderrSpy.mockRestore();
    rmSync(workspace, { recursive: true, force: true });
  }
}
```

`tests/helpers/production-load-harness.ts:96-138` — the canonical load
runner (re-read immediately before filing):
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
    sendMessage: opts.sendMessage ?? ((): void => {}),
    sendUserMessage: (): void => {},
    registerMessageRenderer: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    ...(opts.registryTools !== undefined ? { getAllTools: () => opts.registryTools } : {}),
    ...opts.piExtras,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: opts.hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
    ...opts.ctxExtras,
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
```

`tests/helpers/production-load-harness.ts:267-302` — the paired plant/dispose
lifecycle (re-read immediately before filing):
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

## Why this is a problem
The in-scope file's `loadPi`/`loadCtx`/`loadCorpus` reproduce, function for
function, the fake-host construction, the `process.stderr.write`
interposition around one `discoverAndComposeFixtures` call, and the
`mkdtemp`/`.pi/theta`-write/`rmSync` temp-workspace lifecycle that
`tests/helpers/production-load-harness.ts` already centralises specifically
because — per that file's own header — "several test files independently
redeclared the same … fake … `ExtensionAPI` / `ExtensionContext` pair … and a
`process.stderr.write` interposition … around one `discoverAndComposeFixtures`
call" and "independently redeclared the temp-workspace lifecycle." The
in-scope file's `toasts` array records `{message, type}` but neither cell
(`A` or `B`) ever reads the `type` field, so the divergence from the
canonical `LoadOutcome.notifications: readonly string[]` shape carries no
functional payload not already available from the shared helper.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s `runProductionLoad` plus
`plantThetaWorkspace`/`disposeWorkspace` is the natural shared home this
file's load-and-plant sequence already converges on structurally.

## False-positive check
Gate-pin check: the file name matches no `*gate*.test.ts` pattern, so the
census/pin carve-out does not apply. Recording-double check: `loadPi`/`loadCtx`
are host doubles, not a recording double asserting a MUST-NOT-call negative
witness — the finding is about the setup/teardown sequence's duplication, not
about weakening a witness. docs/bugs/ signature search: `grep -rn "quality-loop"
docs/bugs/` was run mentally against the file's own header, which cites the
2026-09-10 quality-loop abort narrative but names no red-test signature for
this harness code itself, so this is not a documented correct-reason red.
coverage-matrix/bug-doc citation search: `grep -rln
"quality-loop-empty-tail-return-validation" docs/reference/coverage-matrix.md
docs/bugs/*.md` hits `docs/bugs/0473-cross-file-invoke-return-type-check-unimplemented.md`,
whose "Witnesses (landed with this report)" section names this file's cells
A-E by their assertion content (the cross-file/in-file return-type-mismatch
pair and the runtime `Ok(null)`/conforming/partial-report triad) and whose
"Fix (0.484.0)" log records that only cell A's assertion direction was
flipped when the fix landed — the citation pins the FILE and its FIVE CELLS'
assertions, not the `loadPi`/`loadCtx`/`loadCorpus` harness functions cells A
and B call into. This finding proposes no merge, rename, or deletion of the
file or of any cell; it observes duplicated setup/teardown code against an
existing canonical helper, staying inside D7's boilerplate-duplication class.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified: the excerpts match at tests/quality-loop-empty-tail-return-validation.test.ts:108-171 and production-load-harness.ts:96-150/267-302. The file does not import the harness. Cells A and B read only `registered`, a stderr regex for the code (which `diagnosticLines` supplies) and `t.message` (never `type`), so runProductionLoad + plantThetaWorkspace/disposeWorkspace cover every need. The harness header names exactly this redeclaration as its reason to exist, and 28 test files already use runProductionLoad. The docs/bugs/0473 witness citation pins the cells' assertions, not this setup code, and the filing proposes no merge, rename or deletion. Not a duplicate: nothing in quality/issues or resolved covers this file's load harness, and sibling intake d7-05 covers rootDouble, a separate root cause (triage: claude-opus-5-5)
