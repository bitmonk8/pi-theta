---
id: PTQ-0717
title: tool-arg-runtime-schema-validation.test.ts redeclares tests/helpers/production-load-harness.ts's runProductionLoad and workspace plant/dispose lifecycle
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tool-arg-runtime-schema-validation.test.ts:99-146
  - tests/helpers/production-load-harness.ts:31-108
  - tests/helpers/production-load-harness.ts:123-150
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# tool-arg-runtime-schema-validation.test.ts redeclares tests/helpers/production-load-harness.ts's runProductionLoad and workspace plant/dispose lifecycle

## Observation
tests/tool-arg-runtime-schema-validation.test.ts declares its own
`LoadOutcome`, `runProductionLoad`, and a `beforeAll`/`afterAll` pair that
`mkdtemp`s a project root, `mkdir`s `.pi/theta`, writes one fixture file plus a
minimal `.pi/settings.json`, and removes the directory afterward. This is the
same fake-host-plus-temp-workspace shape tests/helpers/production-load-harness.ts
exports as `runProductionLoad` / `plantThetaWorkspace` / `disposeWorkspace` —
whose own header states it exists because "several test files independently
redeclared the same `LoadOutcome` shape and the same `runProductionLoad`
function" plus "the temp-workspace lifecycle wrapped around that call". The
in-scope file is a further occurrence of that same redeclaration rather than
an importer of the helper.

## Evidence
tests/tool-arg-runtime-schema-validation.test.ts:99-129 (`LoadOutcome` +
`runProductionLoad`):
```ts
interface LoadOutcome {
  readonly registered: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
  readonly notifications: readonly string[];
}

let loadOutcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
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
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), fixtures, notifications };
}
```

tests/helpers/production-load-harness.ts:27-31, 58-95 (`LoadOutcome`'s
`registered`/`notifications`/`fixtures` fields, and the exported
`runProductionLoad`'s equivalent fake-host construction driving the same
`discoverAndComposeFixtures(pi, ctx)` call):
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  readonly diagnosticLines: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
}
...
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

tests/tool-arg-runtime-schema-validation.test.ts:131-146 (`beforeAll`/
`afterAll` workspace plant/dispose):
```ts
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b72-schema-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  writeFileSync(
    join(projectThetaDir, `${THREAD_STEM}.theta`),
    theta("---", "mode: prompt", "tools: read", "---", "@`hi`"),
    "utf8",
  );
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  loadOutcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/helpers/production-load-harness.ts:123-150 (`plantThetaWorkspace`,
`disposeWorkspace` — the same `mkdtemp` / `mkdir .pi/theta` / per-fixture write
/ optional `settings.json` write / `rmSync` sequence, generalised to a
`PlantedThetaFile[]` list and an explicit `dirPrefix` parameter):
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

## Why this is a problem
tests/helpers/production-load-harness.ts's own header states its reason for
existing is that "several test files independently redeclared" this exact
`LoadOutcome`/`runProductionLoad`/temp-workspace-lifecycle bundle. The in-scope
file redeclares the same bundle (its `runProductionLoad` omits only the
helper's stderr-mirror capture and options object, and its plant/dispose pair
omits only the helper's multi-fixture/extension generalisation) rather than
importing the already-centralised implementation.

## Suggested direction (non-binding, optional)
tests/helpers/production-load-harness.ts is the already-existing natural home
for this exact bundle; the file's own single-fixture write and
`THREAD_STEM`-specific naming are the locally-varying part the helper's
`PlantedThetaFile[]` parameter already accommodates.

## False-positive check
Gate-pin carve-out: filename is not `*gate*.test.ts` or named gate kin — does
not apply. Recording-double carve-out: `notifications` is a recording array
read for presence, not a MUST-NOT witness, and the finding targets the
declaration being duplicated rather than the recording pattern — carve-out
does not shield it. docs/bugs/ search: grepped for
"tool-arg-runtime-schema-validation" and "production-load-harness" under
docs/bugs/ — no hits. coverage-matrix/bug-doc citation search: grepped
docs/reference/coverage-matrix.md and docs/bugs/*.md for this file's name — no
hits, so no citation pins this file against consolidation. No claim of an
untested path is made.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four excerpts reproduce byte-exact at the cited lines (pi/ctx doubles identical to the helper's bar the options-object indirection and stderr mirror; beforeAll/afterAll is the helper's plantThetaWorkspace/disposeWorkspace sequence with one fixture + "{}" settings), the file imports nothing from tests/helpers/production-load-harness.ts, git dates confirm it (2026-08-04, 80fef716) predates the PTQ-0210 helper (2026-09-11, 2594cd44) and was never migrated, no resolved PTQ cites this file's load harness (PTQ-0210/0240/0259/0312/0358 name other files; PTQ-0238 covered this file's separate runtime-half dispatch harness at 227-411; sibling intake d7-149-04 covers callableSetOf), the test is green 9/9, and the FP-check's "no docs/bugs hits" claim is wrong (bugs 0072/0111/0187/0207 cite the file) but every cited doc is fixed and cites the header comment, callableSetOf or a runtime cell — none pins the load harness — so in-scope D7 copy-paste-double duplication with no carve-out applying (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
