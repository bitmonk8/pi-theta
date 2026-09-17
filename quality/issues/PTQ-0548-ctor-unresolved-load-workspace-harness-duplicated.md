---
id: PTQ-0548
title: ctor-unresolved-schema-name.test.ts's LOAD cell reimplements the mkdtemp/plant/dispose workspace lifecycle tests/helpers/production-load-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-unresolved-schema-name.test.ts:511-578
  - tests/helpers/production-load-harness.ts:1-20
  - tests/helpers/production-load-harness.ts:106-146
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# ctor-unresolved-schema-name.test.ts's LOAD cell reimplements the mkdtemp/plant/dispose workspace lifecycle tests/helpers/production-load-harness.ts already centralises

## Observation
`tests/helpers/production-load-harness.ts` exports `plantThetaWorkspace`
(mkdtemp a workspace, mkdir its `.pi/theta/`, write one file per fixture,
optionally write `.pi/settings.json`), `disposeWorkspace` (the matching
recursive `rmSync`), and `runProductionLoad` (a fake no-UI `pi`/`ctx` pair
sized to `discoverAndComposeFixtures`, with a `process.stderr.write`
interposition), created — per its own header — because "several test files
independently redeclared" this exact plant/dispose lifecycle and load-driving
function. `tests/ctor-unresolved-schema-name.test.ts`'s single `RED LOAD` test
reimplements the same lifecycle inline: `mkdtempSync`, a hand-built
`.pi/theta` `mkdirSync`, two `writeFileSync` calls, a hand-built
`ExtensionAPI`/`ExtensionContext` pair, a direct `discoverAndComposeFixtures`
call, and a `finally`-block `rmSync` — without importing the helper.

## Evidence
`tests/ctor-unresolved-schema-name.test.ts:511-578`:
```ts
describe("bug 0025 (5) load consequence — the production compose helper refuses the theta", () => {
  it("RED LOAD: discoverAndComposeFixtures drops the `Mystery { … }` theta and surfaces the registered message", async () => {
    const source = FM + "let m = Mystery { r: Ok(1) }\nm\n";
    const workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0025-"));
    try {
      const projectThetaDir = join(workspaceDir, ".pi", "theta");
      mkdirSync(projectThetaDir, { recursive: true });
      // A clean control theta: proves the discovery walk found the workspace,
      // so the not-registered assertion below can never pass vacuously.
      writeFileSync(
        join(projectThetaDir, "goodctl.theta"),
        "---\nmode: prompt\n---\n@`hi`\n",
        "utf8",
      );
      writeFileSync(join(projectThetaDir, "ctorunres.theta"), source, "utf8");

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
        cwd: workspaceDir,
        // ...
      } as unknown as ExtensionContext;

      const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
      const registered = fixtures.map((f) => f.slashName);
      // ... assertions ...
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
```

`tests/helpers/production-load-harness.ts:1-20` (the module's own statement of
why it exists):
```ts
// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210), plus the temp
// discovery-workspace plant/dispose lifecycle every caller drives it through
// (PTQ-0312).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, a `process.stderr.write` interposition that
// captures `makeLoadEmit`'s rendered diagnostic lines (the load's no-UI
// mirror) around one `discoverAndComposeFixtures` call, and a reshape of the
// result into `{registered, notifications, diagnosticLines}`. The same files
// also independently redeclared the temp-workspace lifecycle WRAPPED around
// that call — `mkdtemp` a project root, `mkdir` its `.pi/theta`, a
// per-fixture write loop, an optional `.pi/settings.json` write, and an
// `afterAll` recursive removal — so `plantThetaWorkspace` / `disposeWorkspace`
// centralise that half too.
```

`tests/helpers/production-load-harness.ts:106-146` (the exported
`plantThetaWorkspace`/`disposeWorkspace` pair, whose bodies match the reviewed
file's inline `mkdtempSync`/`mkdirSync`/`writeFileSync`-loop/`rmSync`
sequence):
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

`grep -n "helpers/production-load-harness" tests/ctor-unresolved-schema-name.test.ts`
→ 0 hits: the file imports only `../src/extension/production-composition`
(`discoverAndComposeFixtures` directly) and `./helpers/e2e-s1`, not the
workspace-lifecycle helper.

## Why this is a problem
`tests/helpers/production-load-harness.ts` was created specifically because
"several test files independently redeclared" the exact
mkdtemp/mkdir/write-loop/dispose lifecycle around
`discoverAndComposeFixtures`, and it names `plantThetaWorkspace`/
`disposeWorkspace` as the centralised replacement for that half. The reviewed
file's `RED LOAD` cell performs the identical sequence — a temp dir under
`os.tmpdir()`, a `.pi/theta` subdirectory, a per-fixture `writeFileSync` loop,
a `discoverAndComposeFixtures` call over a hand-built fake host, and a
`finally`-block `rmSync` — without importing either export, and without any
stated reason (in the file's own extensive header commentary) that this
particular load-consequence cell needs a bespoke workspace lifecycle rather
than the shared one.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` already exports
`plantThetaWorkspace`/`disposeWorkspace` for exactly this
mkdtemp/mkdir/write/rmSync sequence, and `runProductionLoad` for the
fake-host/`discoverAndComposeFixtures`/stderr-mirror call this cell also
hand-builds; both are the existing, purpose-built home for this cell's setup
and teardown.

## False-positive check
- Gate-pin check: `tests/ctor-unresolved-schema-name.test.ts` does not match
  `*gate*.test.ts` or the named kin; the cited block is a temp-workspace
  setup/call/teardown sequence, not a pinned count or inventory assertion.
- Recording-double check: the `notifications` array and the fake `pi`/`ctx`
  record calls for later positive assertions about what was notified and
  registered, not a "never called" witness, so the negative-witness carve-out
  does not apply; this finding is about the duplicated plant/dispose plumbing,
  not the recording behaviour itself.
- docs/bugs/ signature search: `docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md`
  is an open bug whose `RED LOAD` cell is a documented correct-reason red
  (§Fix constraint 5, cited in the test's own header); the bug document states
  no rationale for keeping this cell's workspace lifecycle local rather than
  using the shared harness — the documented-red carve-out covers the
  assertion's RED disposition, not this harness-duplication claim.
- coverage-matrix/bug-doc citation search: `grep -n
  "ctor-unresolved-schema-name" docs/reference/coverage-matrix.md` → 0 hits.
  The file is cited by name in docs/bugs/0025 and docs/bugs/0028, both citing
  the `RED LOAD` cell's role as bug 0025's load-consequence witness, not its
  particular workspace-lifecycle statements; this finding proposes no change
  to the cell's name, assertions, or its role as that witness — only that its
  setup/teardown import the existing helper.
- Prior-finding search: `grep -rl "ctor-unresolved-schema-name"
  quality/intake quality/resolved` → only this wave's own scratch/shard
  listing and this same finding file; no other filed finding names this file.
- Coverage check: the claim is about a duplicated setup/teardown DEFINITION,
  not a missing test path; the `RED LOAD` cell's own assertions are unaffected
  by where its workspace plumbing is defined.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: the LOAD cell (tests/ctor-unresolved-schema-name.test.ts:511-578) and plantThetaWorkspace/disposeWorkspace (production-load-harness.ts:106-146) reproduce verbatim and the cell's mkdtemp→mkdir .pi/theta→writeFileSync×2→rmSync sequence is a drop-in for the helper's body; the file imports no helper (grep 0 hits), was created 2026-07-30 (c39e1c54) before the helper (2026-09-11) and the PTQ-0312 plant/dispose exports (2026-09-14, 4c0cd0dc) and was never migrated — the same in-scope D7 copy-paste-fixture class as confirmed PTQ-0240/0358/0359 for a file none of PTQ-0210/0240/0259/0312/0358/0359/0361 cite; the excerpt's elided `hasUI: true` only suppresses the stderr mirror runProductionLoad captures anyway and is irrelevant to plant/dispose; the FP-check misstates bug 0025 as open (it is fixed at 0.37.0, file green 24/24) and undercounts bug-doc citations (7 docs, incl. 0207 pinning the cell's titles, comment prose and its discoverAndComposeFixtures call at :548 — all untouched by a plant/dispose swap), neither of which changes the outcome; coverage-matrix 0 hits; sibling intake d7-03 is the same class at a different file (production-tools-load-resolution.test.ts), not a duplicate (triage: claude-fable-5-1)
