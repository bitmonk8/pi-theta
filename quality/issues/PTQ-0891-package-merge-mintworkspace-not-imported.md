---
id: PTQ-0891
title: e2e-s6-package-merge.test.ts hand-rolls the HOME/USERPROFILE mint-redirect-restore sequence that its own imported helper module already exports as mintWorkspace
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s6-package-merge.test.ts:36-73
  - tests/helpers/package-merge-e2e-harness.ts:157-176
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# e2e-s6-package-merge.test.ts hand-rolls the HOME/USERPROFILE mint-redirect-restore sequence that its own imported helper module already exports as mintWorkspace

## Observation
`tests/e2e-s6-package-merge.test.ts` imports `makeHarness` from
`./helpers/package-merge-e2e-harness` (line 5) but not that same module's
`mintWorkspace` export. Its own `beforeEach` mints a temp dir with
`mkdtempSync`, saves `process.env.HOME`/`USERPROFILE`, redirects both into
the temp dir, and its `afterEach` restores the two saved values and
`rmSync`s the dir — the same mint/redirect/restore sequence `mintWorkspace(prefix)`
in the same helper module already performs and returns as a
`{ cwd, dispose }` pair (that helper additionally redirects
`PI_CODING_AGENT_DIR`, a third env var this file does not read or need to
avoid).

## Evidence
tests/e2e-s6-package-merge.test.ts:36-73 (re-read immediately before
filing):
```ts
describe("S6 — composition-root package two-stage merge", () => {
  let workspace: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-s6-pkgmerge-"));
    // Redirect os.homedir() so the global package roots resolve under the empty
    // workspace (deterministic — no real ~/.pi/agent scan).
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    process.env.HOME = workspace;
    process.env.USERPROFILE = workspace;
    ...
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    rmSync(workspace, { recursive: true, force: true });
  });
```

tests/helpers/package-merge-e2e-harness.ts:157-176 (the exported
`mintWorkspace`, in the same module this file already imports `makeHarness`
from):
```ts
export function mintWorkspace(prefix: string): PackageMergeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  const savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = cwd;
  process.env.USERPROFILE = cwd;
  process.env.PI_CODING_AGENT_DIR = join(cwd, ".pi", "agent");
  return {
    cwd,
    dispose: (): void => {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      if (savedUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedUserProfile;
      if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}
```
Every statement in `e2e-s6-package-merge.test.ts`'s `beforeEach`/`afterEach`
pair (mint under `tmpdir()`, save `HOME`/`USERPROFILE`, redirect both into
the minted dir, and on teardown conditionally delete-or-restore each and
`rmSync` the dir) matches the `HOME`/`USERPROFILE` half of `mintWorkspace`/
`dispose()` statement-for-statement; the only substantive difference is the
mint prefix string and that this file keeps `cwd`/dispose logic inlined as
local `let`s instead of receiving them from the helper's returned
`{ cwd, dispose }` pair, and that it does not also redirect
`PI_CODING_AGENT_DIR`.

## Why this is a problem
This is the "Boilerplate duplication" class. `tests/helpers/package-merge-e2e-harness.ts`
already exports `mintWorkspace` specifically to centralise this
mint/redirect/restore sequence; three sibling files
(`tests/b0462-package-identity-dedup.test.ts:50`,
`tests/b0462-package-merge-priority-adjudication.test.ts:62`,
`tests/b0463-package-source-disc3-validation.test.ts:62`) already call it as
`mintWorkspace("theta-b0462-")` / `mintWorkspace("theta-b0463-")`. This file
sits in the same helper-module family — it already imports the module's
other export (`makeHarness`) for this same test file — yet restates the
workspace-redirect half of the sequence locally rather than calling the
helper it already depends on for the harness half.

## Suggested direction (non-binding, optional)
This file's `beforeEach`/`afterEach` could call
`mintWorkspace("theta-s6-pkgmerge-")` and read `cwd`/`dispose()` from its
return, mirroring how the three sibling b0462/b0463 files already consume it
from the same helper module.

## False-positive check
- Gate-pin check: `tests/e2e-s6-package-merge.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; no pinned count or inventory
  assertion is touched — only where the redirect sequence is defined.
- Recording-double check: `workspace` backs genuine fixture-planting
  (`mkdirSync`/`writeFileSync` under it) and real assertions on
  `harness.commands`/`harness.registrations`; this finding does not contest
  any assertion, only that the workspace-mint/redirect construction is
  duplicated rather than shared.
- docs/bugs/ signature search: `grep -rl "e2e-s6-package-merge.test.ts"
  docs/bugs/*.md` → `docs/bugs/0458-package-theta-bypasses-pi-owned-collision-guard.md`,
  `docs/bugs/0462-package-merge-bypasses-priority-adjudication.md`,
  `docs/bugs/0076-existing-root-enumeration-failure-silent.md` — each cites
  this file as a witness/gate for its own subject; none discusses or
  sanctions the local HOME/USERPROFILE redeclaration, and this finding
  proposes no merge, rename or deletion of the file or any `it()`/
  `describe()` inside it — only that the redirect construction could be
  imported instead of restated.
- coverage-matrix/bug-doc citation search: `grep -n
  "e2e-s6-package-merge.test.ts" docs/reference/coverage-matrix.md` → 0
  hits.
- Coverage check: the claim is about a repeated redirect-construction
  sequence, not a missing test path; the sequence is exercised by this
  file's own test (1/1 passing, confirmed by running
  `npx vitest run tests/e2e-s6-package-merge.test.ts`).
- Prior-finding overlap check: `grep -rl "mintWorkspace" quality/issues
  quality/resolved quality/intake` → only the same-wave sibling
  `qw20260918050411-d7-01-b0458-mintworkspace-env-redirect-reimplemented.md`,
  which covers `tests/b0458-package-theta-pi-owned-collision.test.ts` (a
  different file, also additionally redirecting `PI_CODING_AGENT_DIR`, not
  cited there) — this finding is a distinct site of the same helper-bypass
  root cause, not a re-filing.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/e2e-s6-package-merge.test.ts:36-73 and tests/helpers/package-merge-e2e-harness.ts:157-176; the beforeEach/afterEach block matches the HOME/USERPROFILE half of mintWorkspace/dispose() statement-for-statement (mkdtempSync under tmpdir, save both, redirect both, delete-or-restore both, rmSync), differing only in the prefix literal and local `let`s, and the helper's extra PI_CODING_AGENT_DIR redirect is a strict superset this file does not read, so importing loses no load-bearing need; the file already imports makeHarness from that module (line 5) while `grep -rln "process.env.USERPROFILE = " tests/` returns exactly b0458, this file and the helper, so sites: 1 is accurate (e2e-s6-description-registration mints via mkdtempSync but never redirects HOME/USERPROFILE); both locations under tests/, D7 boilerplate-duplication class; not a gate file, coverage-matrix 0 hits, docs/bugs 0076/0458/0462 cite the file only as their own witness and merely describe the redirect as method, 1/1 passes at HEAD (no correct-reason red), no recording-double contest; not a duplicate — resolved PTQ-0617 covered only this file's makeHarness copy and its fix commit 3d7f510a touched only the harness block and imports (env block unchanged) even though mintWorkspace already existed at 3d7f510a^:148, making this the named residual (same shape as confirmed residuals PTQ-0450/PTQ-0228/PTQ-0301); same-wave d7-01 was confirmed as canonical for the b0458 site only and its triage note explicitly names this file as a distinct site whose fix is a per-file import swap, not shared; the filing's overlap-check claim of a single `mintWorkspace` hit is inaccurate (resolved PTQ-0396 also matches) but immaterial since PTQ-0396 covers the b0462 promptTheta/plant fixture builders, not the env-redirect sequence (triage: claude-fable-5-1)
