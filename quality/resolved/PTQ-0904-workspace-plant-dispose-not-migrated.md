---
id: PTQ-0904
title: three subagent test files hand-roll the mkdtemp/mkdir/write-loop/rmSync workspace lifecycle that tests/helpers/production-load-harness.ts's plantThetaWorkspace/disposeWorkspace already centralise
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-placement-load-refusal.test.ts:29-46
  - tests/subagent-result-channel-factory.test.ts:73-82
  - tests/subagent-root-registration-refusal-envelope.test.ts:309-335
sites: 3
fix_scope: cross-module
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# three subagent test files hand-roll the mkdtemp/mkdir/write-loop/rmSync workspace lifecycle that tests/helpers/production-load-harness.ts's plantThetaWorkspace/disposeWorkspace already centralise

## Observation
Each of the three files, in its own `beforeAll`/`afterAll` (or
`beforeEach`/`afterEach`), independently performs the same four/one-step
sequence: `mkdtempSync(join(tmpdir(), <prefix>))` to mint a project root,
`mkdirSync(join(root, ".pi", "theta"), { recursive: true })`, a per-fixture
`writeFileSync(...".theta"...)` loop (or single write), an optional
`writeFileSync(join(root, ".pi", "settings.json"), ...)`, and on teardown
`rmSync(root, { recursive: true, force: true })`. `tests/helpers/production-
load-harness.ts` exports `plantThetaWorkspace(dirPrefix, fixtures,
settingsJson)` and `disposeWorkspace(workspaceDir)`, whose own header states
they exist because "several test files independently redeclared" exactly
this sequence. None of the three files imports either export.

## Evidence
tests/subagent-placement-load-refusal.test.ts:29-46:
```ts
beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0012-placement-load-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "worker.theta"), ["---", "mode: subagent", "---", '"ok"', ""].join("\n"), "utf8");
  writeFileSync(
    join(dir, "inline.theta"),
    ["---", "mode: prompt", "---", "subagent fn step(x: string): string { x }", 'step("a")', ""].join("\n"),
    "utf8",
  );
  writeFileSync(join(dir, "plain.theta"), ["---", "mode: prompt", "---", '"hello"', ""].join("\n"), "utf8");
  // The explicit selection under test: a backend nobody has registered.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), JSON.stringify({ theta: { subagentPlacement: "herdr" } }), "utf8");
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/subagent-result-channel-factory.test.ts:73-82:
```ts
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "theta-rfc0012-channel-factory-"));
  const dir = join(workspace, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "clean.theta"), ["---", "mode: subagent", "---", '"ok"', ""].join("\n"), "utf8");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});
```

tests/subagent-root-registration-refusal-envelope.test.ts:309-335:
```ts
beforeAll(() => {
  // Bug 0474 §Residual: `runLoad` simulates a subagent CHILD in-process by
  // planting `PI_THETA_SUBAGENT_ROOT` + a real-ppid `PI_THETA_SUBAGENT_PARENT_PID`.
  // An ambient control plane on `process.env` (a `npm test` run from inside a
  // subagent child) authenticates by the same rule and preempts the planted
  // one, so scrub it for the whole file and restore it afterwards.
  ambientControlPlane = scrubAmbientControlPlane();
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0178-refusal-envelope-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  for (const fixture of THETAS) {
    writeFileSync(join(dir, `${fixture.stem}.theta`), fixture.text, "utf8");
  }
  writeFileSync(
    join(workspaceDir, ".pi", "settings.json"),
    JSON.stringify({ theta: { binderModel: UNMATCHABLE_BINDER_MODEL } }),
    "utf8",
  );
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
  if (ambientControlPlane !== undefined) {
    restoreAmbientControlPlane(ambientControlPlane);
    ambientControlPlane = undefined;
  }
});
```

The canonical helper, tests/helpers/production-load-harness.ts:117-144 (re-read
immediately before filing):
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

Search performed: `grep -n "plantThetaWorkspace\|disposeWorkspace"
tests/subagent-placement-load-refusal.test.ts tests/subagent-result-channel-
factory.test.ts tests/subagent-root-registration-refusal-envelope.test.ts` —
0 hits in all three files.

## Why this is a problem
`plantThetaWorkspace`'s parameter shape (`dirPrefix`, a `{stem, text, ext?}[]`
fixture list, an optional `settingsJson` string) already covers every one of
the three files' plant calls: a single-fixture write (result-channel-
factory), a three-fixture write with a settings write (placement-load-
refusal), and a loop over a pre-declared fixture array with a settings write
(root-registration-refusal-envelope). `disposeWorkspace`'s own
`workspaceDir !== undefined` guard is the same shape each file's own
teardown performs by hand. A change to the plant/dispose contract (e.g. a
different settings default, or an additional per-file `.pi` artefact) must
be hand-applied in three places instead of one.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s existing `plantThetaWorkspace`/
`disposeWorkspace` exports already generalise this exact plant/dispose pair;
naming them as an existing candidate home for these three files' setup is an
observation, not a design for any of the three files' change.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or the
  named gate kin; no cited block is a pinned count/inventory assertion.
- Recording-double carve-out: not applicable — the cited lines are
  directory/file-lifecycle setup, not a fake recording calls for a
  "never called" witness.
- docs/bugs/ signature search: `grep -rl "subagent-placement-load-refusal\|
  subagent-result-channel-factory\|subagent-root-registration-refusal-
  envelope" docs/bugs/*.md` — the third file is named by docs/bugs/0178,
  0183, 0207 and 0474 as a witness/mechanism citation, never as an excuse to
  keep its workspace-plant sequence local; the other two files are not named
  by any docs/bugs/*.md file.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-placement-
  load-refusal\|subagent-result-channel-factory\|subagent-root-
  registration-refusal-envelope" docs/reference/coverage-matrix.md` — 0
  hits. This finding proposes no merge, rename, or deletion of any of the
  three files or any `it()`/`describe()` in them, only that the repeated
  plant/dispose scaffolding could call the existing helper exports instead
  of re-deriving them.
- Overlap check: PTQ-0703 (open) covers the identical helper against a
  DIFFERENT file pair (`tests/slsh5-invoke-cascade-chain-suffix.test.ts`,
  `tests/subagent-child-hash-refusal-e2e.test.ts`) and does not name any of
  these three files. PTQ-0888 (open) and PTQ-0860 (open) both cite
  `tests/subagent-root-registration-refusal-envelope.test.ts` but target a
  disjoint code block in the same file — PTQ-0888 the
  `PI_THETA_SUBAGENT_ROOT`/`PARENT_PID` env plant/restore (lines 244-274,
  i.e. inside the `runLoad` function body, not the file-level
  `beforeAll`/`afterAll` this finding cites), PTQ-0860 the
  `noteLinesContaining` helper — neither cites the `beforeAll`/`afterAll`
  workspace-plant block. PTQ-0833 (open) covers a `runLoad`/`THETAS`
  duplication between two other files and its own triage note explicitly
  characterises `tests/subagent-root-registration-refusal-envelope.test.ts`'s
  `runLoad` as a "diverged option-bag variant" outside its scope, without
  citing this file's `beforeAll`/`afterAll` block. `grep -rl
  "theta-rfc0012-placement-load-\|theta-rfc0012-channel-factory-\|theta-
  bug0178-refusal-envelope-" quality/` (the three files' own `mkdtemp`
  prefixes) returns no filed or resolved issue.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (placement-load-refusal:29-46, result-channel-factory:73-82, root-registration-refusal-envelope:309-335, helper:117-144 with `disposeWorkspace` at :148); `grep plantThetaWorkspace|disposeWorkspace|production-load-harness` across the three files → 0 hits while the helper is live (104 test-file importers) and its header names this exact mkdtemp/mkdir/write-loop/settings/rmSync lifecycle as the half PTQ-0312 centralised; nothing load-bearing resists migration — each block writes only `.pi/theta/*.theta` plus an optional `.pi/settings.json`, no realpath wrap, envelope's `THETAS` is already `{stem,text}[]` (structurally `PlantedThetaFile[]`), the `beforeEach` remint and the `scrubAmbientControlPlane` interleave compose around the helper calls; stated searches reproduce (mkdtemp prefixes in quality/ → only this file, coverage-matrix → 0, docs/bugs 0178/0183/0207/0474 name the envelope file only as witness and no merge/rename/delete is proposed); all locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out; dedupe holds — PTQ-0703 (confirmed, open) is the same helper against slsh5/hash-refusal only, PTQ-0888/PTQ-0860 cite the envelope file's `runLoad` env block and `noteLinesContaining` respectively, PTQ-0833's triage note scopes the envelope file's `runLoad` out as a diverged variant and never cites its `beforeAll`/`afterAll`, PTQ-0890 is the helper-vs-helper `disposeWorkspace` clone, and same-wave siblings d7-07/d7-10 cite disjoint files — per the store's per-file residual convention (PTQ-0703 confirmed beside resolved PTQ-0312) this is a distinct, mechanically-fixable root cause (triage: claude-fable-5-1)
