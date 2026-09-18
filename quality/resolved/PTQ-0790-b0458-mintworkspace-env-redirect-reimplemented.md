---
id: PTQ-0790
title: b0458 hand-rolls the HOME/USERPROFILE/PI_CODING_AGENT_DIR mint-redirect-restore sequence that its own imported helper already exports as mintWorkspace
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0458-package-theta-pi-owned-collision.test.ts:49-86
  - tests/helpers/package-merge-e2e-harness.ts:144-176
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0458 hand-rolls the HOME/USERPROFILE/PI_CODING_AGENT_DIR mint-redirect-restore sequence that its own imported helper already exports as mintWorkspace

## Observation
tests/b0458-package-theta-pi-owned-collision.test.ts imports `makeHarness`
from `tests/helpers/package-merge-e2e-harness.ts` (line 30) but does not
import that same module's `mintWorkspace` export. Instead its `beforeEach`
mints a temp dir with `mkdtempSync`, saves `process.env.HOME` /
`USERPROFILE` / `PI_CODING_AGENT_DIR`, redirects all three into the temp
dir, and its `afterEach` restores the three saved values and `rmSync`s the
dir — the exact sequence `mintWorkspace(prefix)` in the same helper module
already performs and returns as a `{ cwd, dispose }` pair.

## Evidence
tests/b0458-package-theta-pi-owned-collision.test.ts:49-52,54-63,79-86 (the
local hand-rolled mint/redirect/restore, re-read immediately before filing):
```ts
  let workspace: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedAgentDir: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-b0458-"));
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.HOME = workspace;
    process.env.USERPROFILE = workspace;
    process.env.PI_CODING_AGENT_DIR = join(workspace, ".pi", "agent");
```
```ts
  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
    rmSync(workspace, { recursive: true, force: true });
  });
```

tests/helpers/package-merge-e2e-harness.ts:157-176 (the exported
`mintWorkspace`, same module b0458 already imports `makeHarness` from):
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
Every statement in b0458's `beforeEach`/`afterEach` pair (mint under
`tmpdir()`, save the three env vars, redirect all three into the minted
dir, and on teardown conditionally delete-or-restore each of the three and
`rmSync` the dir) matches `mintWorkspace`/`dispose()` statement-for-statement,
differing only in that b0458 keeps the mint prefix (`"theta-b0458-"`) and
the saved/workspace variables as local `let`s instead of receiving them from
the helper's returned `{ cwd, dispose }` pair.

## Why this is a problem
This is the "Boilerplate duplication" class. `tests/helpers/package-merge-e2e-harness.ts`
already exports `mintWorkspace`, minted specifically to centralise this
mint/redirect/restore sequence for the sibling b0462 (x2) and b0463 files,
which call it as `mintWorkspace("theta-b0462-")` / `mintWorkspace("theta-b0463-")`
(tests/b0462-package-identity-dedup.test.ts:50,
tests/b0462-package-merge-priority-adjudication.test.ts:62,
tests/b0463-package-source-disc3-validation.test.ts:62). b0458 sits in the
same helper-module family — it already imports the module's other export
(`makeHarness`) for the exact same test file — yet restates the workspace
half of the sequence locally rather than calling the helper it already
depends on for the harness half. A prior finding (resolved PTQ-0450) fixed
the `makeHarness`/`CapturedNote`/`Harness` half of this file's duplication
against the same helper module; the `mintWorkspace` half was left
unaddressed and remains duplicated today.

## Suggested direction (non-binding, optional)
b0458's `beforeEach`/`afterEach` could call `mintWorkspace("theta-b0458-")`
and read `cwd`/`dispose()` from its return, mirroring how b0462/b0463 already
consume it from the same helper module.

## False-positive check
- Gate-pin check: tests/b0458-package-theta-pi-owned-collision.test.ts does
  not match `*gate*.test.ts` or the named gate kin; no pinned count or
  inventory assertion is touched by this finding — only where the
  mint/redirect/restore sequence is defined.
- Recording-double check: `workspace` backs genuine fixture-planting
  (`mkdirSync`/`writeFileSync` under it) and real assertions on
  `harness.commands`/`harness.notes`; this finding does not contest any
  assertion, only that the temp-workspace construction/teardown code is
  duplicated rather than shared.
- docs/bugs/ signature search: docs/bugs/0458-package-theta-bypasses-pi-owned-collision-guard.md
  — Status fixed (0.446.0); both `it()`s in this file pass at HEAD, so this
  is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0458-package-theta-pi-owned-collision"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl
  "b0458-package-theta-pi-owned-collision.test.ts" docs/bugs/*.md` → only the
  bug's own doc. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only where the workspace-mint sequence is defined.
- Coverage check: the claim is about a repeated fixture-construction
  sequence, not a missing test path; both b0458 tests exercise it already.
- Prior-finding overlap check: resolved PTQ-0450
  (`quality/resolved/PTQ-0450-b0458-package-merge-harness-not-migrated.md`)
  covered only the `makeHarness`/`CapturedNote`/`Harness` trio for this same
  file and was fixed — b0458 now imports `makeHarness` from the helper
  (confirmed at line 30 of the current file). That fix did not touch the
  separate `mintWorkspace` sequence this finding cites, which remains
  duplicated; this is a distinct, still-open root cause, not a re-filing.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/b0458-package-theta-pi-owned-collision.test.ts:49-63/79-86 and tests/helpers/package-merge-e2e-harness.ts:157-176; the beforeEach/afterEach env block matches mintWorkspace/dispose() statement-for-statement (same three vars HOME/USERPROFILE/PI_CODING_AGENT_DIR, same delete-or-restore teardown, same rmSync), differing only in the prefix literal and local `let`s, so no load-bearing need is lost by importing; b0458 already imports makeHarness from that module (line 30) while `grep -rn mintWorkspace tests/` shows only b0462 x2 and b0463 as consumers, and `grep -rln "process.env.PI_CODING_AGENT_DIR = join" tests/` returns exactly b0458 and the helper, so this is the sole remaining hand-rolled copy of the three-var sequence; both under tests/, D7 boilerplate-duplication class; not a gate file, coverage-matrix 0 hits, docs/bugs/0458 is Status fixed and only cites the file as its own witness, 2/2 cells pass at HEAD (no correct-reason red), no recording-double contest; not a duplicate — resolved PTQ-0258 explicitly scoped b0458 out ("outside this review's scope"), resolved PTQ-0450 covered only the makeHarness/CapturedNote/Harness trio and its fix commit 3d7f510a did not touch the env block (diff shows only the import swap), and same-wave sibling d7-05 cites a different file (e2e-s6-package-merge) and is itself untriaged, so this earlier-indexed filing stands as canonical for its site; incidental note for the fixer: the file also redeclares `byCode` (line 45) which the helper exports at :134 — same import fixes both (triage: claude-fable-5-1)
