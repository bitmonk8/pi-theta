---
id: PTQ-1324
title: invoke-arg-array-literal-provable.test.ts hand-rolls the mkdtemp/mkdir/write-loop/settings/rmSync workspace lifecycle that tests/helpers/production-load-harness.ts already centralises as plantThetaWorkspace/disposeWorkspace (or productionLoadSuite)
lens: D7
status: open
verdict: confirmed
locations:
  - tests/invoke-arg-array-literal-provable.test.ts:310-335
  - tests/helpers/production-load-harness.ts:251-292
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# invoke-arg-array-literal-provable.test.ts hand-rolls the mkdtemp/mkdir/write-loop/settings/rmSync workspace lifecycle that tests/helpers/production-load-harness.ts already centralises as plantThetaWorkspace/disposeWorkspace (or productionLoadSuite)

## Observation
The file's `beforeAll`/`afterAll` mints a temp project root with
`mkdtempSync`, creates `.pi/theta/`, writes one `.theta` file per fixture in
a loop, writes `.pi/settings.json`, calls `runProductionLoad`, and on
teardown `rmSync`s the root. `tests/helpers/production-load-harness.ts` —
which this same file already imports `runProductionLoad`,
`invokeArgPreconditions`, `diagnosticLineReaders`, `assertNoStemIsASuffix`,
`theta`, `invokeCaller`, `callableCaller` from — exports
`plantThetaWorkspace(dirPrefix, fixtures, settingsJson)` and
`disposeWorkspace(workspaceDir)` that perform exactly this sequence, and a
higher-level `productionLoadSuite(dirPrefix, fixtures, options)` that wraps
the whole `beforeAll`/`plant`/`runProductionLoad`/`afterAll`/`dispose`
sequence into the `beforeAll`/`afterAll` pair itself. Neither export is
imported or called in this file.

## Evidence
tests/invoke-arg-array-literal-provable.test.ts:310-335 (re-read immediately
before filing):
```ts
let outcome: LoadOutcome;
let workspaceDir: string;

beforeAll(async () => {
  // No stem may be a suffix of another: the per-caller channel filter matches
  // `<separator><stem>.theta`, so a suffix pair would let one caller's
  // diagnostic satisfy or defeat another caller's assertion.
  const stems = THETAS.map((t) => t.stem);
  assertNoStemIsASuffix(stems);

  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0146-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(projectThetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/helpers/production-load-harness.ts:251-292 (re-read immediately before
filing):
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

`THETAS` is already declared as `readonly PlantedTheta[]` with a `{ stem,
text }` shape (tests/invoke-arg-array-literal-provable.test.ts:170-171,
`interface PlantedTheta { readonly stem: string; readonly text: string; }`),
structurally identical to the helper's own `PlantedThetaFile` parameter
shape. Search performed: `grep -n "plantThetaWorkspace\|disposeWorkspace\|productionLoadSuite" tests/invoke-arg-array-literal-provable.test.ts` — 0 hits.

## Why this is a problem
The helper module's own header (tests/helpers/production-load-harness.ts:15,
"that call — `mkdtemp` a project root, `mkdir` its `.pi/theta`, a
per-fixture write loop, an optional settings write, `rmSync` on teardown —
were redeclared byte-for-byte in several test files") names exactly this
sequence as the reason the two exports exist. This file's `beforeAll`/
`afterAll` reproduces every step of `plantThetaWorkspace`/`disposeWorkspace`
by hand instead of calling them, so a change to the plant/dispose contract
(e.g. a different settings default, or the `try`/`catch` cleanup-on-plant-
failure `plantThetaWorkspace` already carries and this file's inline version
does not) must be hand-applied here separately from every file that already
calls the helper.

## Suggested direction (non-binding, optional)
`plantThetaWorkspace`/`disposeWorkspace` (or the higher-level
`productionLoadSuite`, which already wraps the identical `beforeAll`/
`runProductionLoad`/`afterAll`/`disposeWorkspace` shape used here) is an
existing candidate home for this file's setup/teardown; naming it is an
observation, not a design for this file's change.

## False-positive check
- Gate-pin carve-out: this file is not named `*gate*.test.ts` nor one of the
  named gate kin; the cited block is workspace lifecycle setup, not a
  pinned-count/inventory assertion.
- Recording-double carve-out: not applicable — the cited lines write files
  and load them, they do not record calls for a "never called" witness.
- docs/bugs/ signature search: `grep -rl "invoke-arg-array-literal-provable"
  docs/bugs/*.md` — the file is bug 0146's witness file (named in its own
  header), but no docs/bugs/*.md entry cites this `beforeAll`/`afterAll`
  block by name or excuses it from the shared helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "invoke-arg-array-literal-provable" docs/reference/coverage-matrix.md` —
  0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` in it, only that the existing plant/dispose helper
  exports are a candidate home for the hand-rolled setup/teardown.
- Overlap check: PTQ-0904 (resolved/fixed) covers the identical helper
  against three DIFFERENT files (subagent-placement-load-refusal,
  subagent-result-channel-factory, subagent-root-registration-refusal-
  envelope) and does not name this file. `grep -rl "theta-bug0146-"
  quality/` (this file's own `mkdtemp` prefix) returns no filed or resolved
  issue.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (test :310-335 inline mkdtemp→mkdir→write-loop→settings "{}"→runProductionLoad→rmSync; helper :251-292 `plantThetaWorkspace`/`disposeWorkspace`, `productionLoadSuite` at :303-325 with the identical "{}" settings default and even the same hermeticity comment), the file's :1-4 import already reaches production-load-harness for seven sibling exports while `grep plantThetaWorkspace|disposeWorkspace|productionLoadSuite` in the file → 0 hits; `THETAS` is `readonly {stem,text}[]` (structurally `PlantedThetaFile[]`) and the only extra step (`assertNoStemIsASuffix`) composes before the plant call, so the swap is mechanical; git blame dates the block to 8762eb7f (2026-08-23) before `plantThetaWorkspace` landed (4c0cd0dc, 2026-09-14) and the PTQ-0210 migration touched only `runProductionLoad` — a post-hoc residual, not a design choice; D7 boilerplate-duplication class, all locations under tests/, no carve-out binds (not a gate file, real fs setup not a recording double, coverage-matrix cite → 0, docs/bugs/0146 names the file only as witness and describes the harness shape without pinning the inline lifecycle, no it()/describe() merge/rename/delete proposed); NOT a duplicate — PTQ-0312 names this file only as a PTQ-0210 runProductionLoad migration target, PTQ-0904/0703/1088 cite other files (PTQ-1088's own triage note lists this file among six residual `rmSync` inliners not yet carried by any row), PTQ-0960 (false-positive) covered runProductionLoad only, and no open quality/issues row names invoke-arg-array-literal-provable; per the store's per-file residual convention (PTQ-0703/0904 confirmed beside resolved PTQ-0312) this is a distinct, mechanically-fixable root cause (triage: claude-fable-5-1)
