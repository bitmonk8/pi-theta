---
id: PTQ-0722
title: tools-entry-grammar-derivations-lockstep and tools-entry-message-line-break each reimplement the plant/dispose/runProductionLoad harness tests/helpers/production-load-harness.ts already exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:503-524
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:557-570
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:595-599
  - tests/tools-entry-message-line-break.test.ts:398-423
  - tests/tools-entry-message-line-break.test.ts:426-441
  - tests/tools-entry-message-line-break.test.ts:443-445
  - tests/helpers/production-load-harness.ts:1-121
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tools-entry-grammar-derivations-lockstep and tools-entry-message-line-break each reimplement the plant/dispose/runProductionLoad harness tests/helpers/production-load-harness.ts already exports

## Observation
Both in-scope files declare their own local `interface LoadOutcome`, their own
local `async function runProductionLoad(cwd: string)` that builds a fake
`pi`/`ctx` host and calls `discoverAndComposeFixtures`, and their own
`beforeAll`/`afterAll` pair that `mkdtempSync`s a workspace, `mkdirSync`s its
`.pi/theta` subdirectory, writes one file per planted fixture, writes an
`.pi/settings.json`, and `rmSync`s the workspace recursively on teardown.
`tests/helpers/production-load-harness.ts` already exports this exact shape —
`runProductionLoad`, `plantThetaWorkspace`, `disposeWorkspace` — with its own
header stating it was extracted because "Several test files independently
redeclared the same `LoadOutcome` shape and the same `runProductionLoad`
function." Neither in-scope file imports it.

## Evidence

`tests/tools-entry-grammar-derivations-lockstep.test.ts:503-524` (the fake host,
byte-identical `pi` object at 511-518):
```
async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const chunks: string[] = [];
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk): boolean => {
      chunks.push(String(chunk));
      return true;
    });
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
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
```

`tests/tools-entry-message-line-break.test.ts:398-416` (the same `pi` object,
byte-identical lines 400-407):
```
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
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:557-570` (plant loop):
```
beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0106-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(
      join(projectThetaDir, `${planted.stem}.theta`),
      planted.text,
      "utf8",
    );
  }
  // A minimal valid settings file pins the settings read to a known value; an
  // ABSENT one is silent, so this is hermeticity rather than noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
```

`tests/tools-entry-message-line-break.test.ts:426-440` (the same plant loop,
same comment):
```
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0105-"));
  projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(
      join(projectThetaDir, `${planted.stem}.theta`),
      planted.text,
      "utf8",
    );
  }
  // An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant pins the fixture's settings read rather than
  // suppressing noise.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:595-599` and
`tests/tools-entry-message-line-break.test.ts:443-445` (dispose):
```
afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
  ...
});
```

The canonical helper, `tests/helpers/production-load-harness.ts:1-121`, exports
`runProductionLoad(cwd, opts?)`, `plantThetaWorkspace(dirPrefix, fixtures,
settingsJson?)` and `disposeWorkspace(workspaceDir)` built to the identical
shape: same fake `pi`/`ctx` host object (`getFlag`, `getCommands`,
`sendMessage`, `sendUserMessage`, `getActiveTools`, `setActiveTools`,
`ctx.ui.notify` pushing to a `notifications` array), same `mkdtempSync` /
`.pi/theta` `mkdirSync` / per-fixture `writeFileSync` / optional
`settings.json` write / `rmSync` lifecycle, same `discoverAndComposeFixtures`
call. Its header states the extraction reason: "Several test files
independently redeclared the same `LoadOutcome` shape and the same
`runProductionLoad` function... The same files also independently redeclared
the temp-workspace lifecycle."

## Why this is a problem
Both in-scope files carry a full local re-derivation of a harness that already
lives at `tests/helpers/production-load-harness.ts`, itself created (per its
own header) specifically because this exact shape had been copy-pasted across
test files. The `pi` fake-host object literal is byte-identical between the
two in-scope files (lines 511-518 vs 400-407); the workspace-plant loop is
byte-identical apart from the temp-dir prefix and one prose comment (557-566 vs
426-435); the teardown is byte-identical apart from the extra group-(D)
workspace cleanup in the first file. Each in-scope file also separately
declares its own `interface LoadOutcome` shaped exactly like the helper's
exported `LoadOutcome`.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` is the natural home already
established by an existing extraction; both in-scope files' local
`runProductionLoad`/plant/dispose declarations are candidates to be replaced
by imports from it, adapting each file's stderr-mirror-vs-notification-array
needs to the helper's existing `notifications`/`diagnosticLines` split.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
patterns — not applicable. Recording-double check: the duplicated code is a
fake host plus a plant/dispose lifecycle, not a call-recording double used for
a MUST-NOT witness — not applicable. docs/bugs/ signature search: both files
are witnesses named in their own bug docs (0105-malformed-tool-entry-message-
embeds-raw-newline.md, 0106-tools-entry-grammar-derivations-outside-lockstep.md,
0248-malformed-escaping-tools-entry-containment-unwitnessed.md and others) —
none of those docs describe the harness duplication itself as a documented
correct-reason red; the reds they document are behavioural (grammar co-fire,
raw-newline message), unrelated to this finding. Coverage-matrix/bug-doc
citation search: `grep -rn` for both file names across
`docs/reference/coverage-matrix.md` and `docs/bugs/` shows both are cited by
name in multiple bug docs as witnesses — this finding does not propose to
merge, rename, or delete either test, only to source their harness setup from
the existing shared helper, so the citation pinning is respected. This claim
does not drift into coverage: no assertion is made about paths that should be
tested; only that the two files' own setup code duplicates an existing
helper's exported functions.

## Triage
verdict: confirmed — independently re-verified: both runProductionLoad bodies reproduce at lockstep:503-524 and line-break:398-416 with the six-method pi literal byte-identical to each other and to tests/helpers/production-load-harness.ts:64-71, both beforeAll/afterAll pairs repeat the mkdtemp→mkdir .pi/theta→write-loop→settings.json "{}"→rmSync lifecycle that plantThetaWorkspace/disposeWorkspace export, and neither file imports the helper (grep: 6 importers, neither of these); git dates confirm both tests (2026-08-23, 77592027/99bcfa9f) predate the PTQ-0210 helper (2026-09-11, 2594cd44) and were never migrated; both green (30/30, 32/32) so no documented-red carve-out, not a gate file, docs/bugs 0105/0106/0107/0248/0250/0253/0267/0268/0271/0275 cite it()-cells and behavioural reds, never the local scaffolding, coverage-matrix 0 hits; one overstatement noted — the lockstep file's LoadOutcome ({registered sorted, codes, lines, raw}) is a post-processed shape over the stderr mirror, not "shaped exactly like" the helper's, so its fix keeps a thin local MIRRORED-parse wrapper over the helper's diagnosticLines rather than a pure import swap (the direction paragraph already allows for this); not a duplicate — PTQ-0210/0240/0259/0312/0358 and same-wave intake d7-01-tools-entry/d7-152-02/d7-156-01/d7-163-01 each cite different files for this copy-paste-fixture class (triage: claude-fable-5-1)
