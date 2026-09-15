---
id: PTQ-0361
title: b0328 and b0329 hand-roll the identical mkdtemp/mkdir/settings-write workspace beforeEach that compose-workspace-harness.ts's finishWorkspace already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0328-root-closure-hash-marshalled.test.ts:149-161
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:185-198
  - tests/helpers/compose-workspace-harness.ts:117-131
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# b0328 and b0329 hand-roll the identical mkdtemp/mkdir/settings-write workspace beforeEach that compose-workspace-harness.ts's finishWorkspace already centralises

## Observation
tests/b0328-root-closure-hash-marshalled.test.ts's `beforeEach` mints a temp
directory, creates its `.pi/theta` subdirectory, and writes a minimal
`.pi/settings.json`, with an `afterEach` that removes the directory.
tests/b0329-hash-mismatch-refuses-invocation.test.ts's `beforeEach`/`afterEach`
pair is the same sequence, differing only in the `mkdtemp` prefix string and
one word of the accompanying comment. tests/helpers/compose-workspace-harness.ts
already exports `finishWorkspace(cwd)`, which performs the identical
settings-file write (with the identical "hermeticity, not noise suppression"
rationale) and returns a `dispose()` closure wrapping the identical `rmSync`
call — and b0329 already imports a *different* export (`makeHost`) from that
very module, without also drawing `finishWorkspace` for this half.

## Evidence

tests/b0328-root-closure-hash-marshalled.test.ts:149-161 (full `beforeEach`/
`afterEach` pair):
```ts
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0328-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read (an ABSENT file is
  // silent per package-and-settings.md §Failure modes) — hermeticity, not noise
  // suppression, matching the e2e harness.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:185-198 (the same pair;
only the `mkdtemp` prefix and one comment word differ, plus this file's own
`restoreEnv()` call the env-sandbox finding PTQ-0343 already added):
```ts
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0329-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read (an ABSENT file is
  // silent per package-and-settings.md §Failure modes) — hermeticity, not noise
  // suppression, matching the sibling harnesses.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  restoreEnv();
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/helpers/compose-workspace-harness.ts:117-131 (the canonical
`finishWorkspace`, already exported from the module b0329 imports `makeHost`
from — the same settings-write rationale, word for word, and the same
`rmSync`-based dispose):
```ts
/**
 * Finish planting a temp compose workspace at `cwd`, once a caller has written
 * its own `.pi/theta/` (and optional `outside/`) fixture files there: write a
 * minimal valid settings file — an ABSENT settings file is silent
 * (package-and-settings.md §Failure modes), so the plant is hermeticity, not
 * noise suppression — and return the `ComposeWorkspace` handle.
 */
export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

The b0329 import that already reaches this same module, for its other half
(tests/b0329-hash-mismatch-refuses-invocation.test.ts:22, re-read immediately
before filing):
```ts
import { makeHost } from "./helpers/compose-workspace-harness";
```

Search: `grep -n "A minimal valid settings file pins the settings read"
tests/b0328-root-closure-hash-marshalled.test.ts
tests/b0329-hash-mismatch-refuses-invocation.test.ts` → one hit in each file,
at the lines quoted above; the near-identical "hermeticity, not noise
suppression" phrase (allowing for small wording variants such as "the
fixture's settings read") also recurs beyond this pair, e.g. in
tests/subagent-child-hash-refusal-e2e.test.ts's own inline `beforeEach` (out
of this wave's scope, cited only as pattern context).

## Why this is a problem
Both `beforeEach` blocks perform the exact same four steps in the exact same
order — `mkdtempSync` a project root, `mkdirSync` its `.pi/theta`,
`writeFileSync` a minimal `.pi/settings.json` (with the identical rationale
comment), and — in `afterEach` — `rmSync` the directory — and
`tests/helpers/compose-workspace-harness.ts` already exports a function
(`finishWorkspace`) built for exactly the settings-write/dispose half of this
sequence, using the identical rationale text. b0329 is not merely a file that
could adopt this helper: it already imports a sibling export (`makeHost`)
from the very same module for its host-double half, so the settings-write/
dispose half sitting beside it, unimported, is not an oversight of an
unfamiliar module — it is half a module already in scope for this file left
unshared.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts's `finishWorkspace(cwd)` already
performs the settings-write and returns a `dispose()` wrapping the identical
`rmSync` call; b0329 (already importing `makeHost` from this module) and
b0328 are both callers this same export already fits, modulo each file's own
`thetaDir` local variable naming.

## False-positive check
- Gate-pin check: neither tests/b0328-root-closure-hash-marshalled.test.ts nor
  tests/b0329-hash-mismatch-refuses-invocation.test.ts matches `*gate*.test.ts`
  or the named kin; neither cited block is a pinned count or inventory
  assertion.
- Recording-double check: not applicable — the cited lines are directory/
  file-lifecycle setup, not a fake that records calls to back a "never
  called" witness.
- docs/bugs/ signature search: docs/bugs/0328-root-callee-closure-hash-never-marshalled.md
  Status "fixed (0.306.0)"; docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md
  Status "fixed (0.322.0)". `npx vitest run
  tests/b0328-root-closure-hash-marshalled.test.ts
  tests/b0329-hash-mismatch-refuses-invocation.test.ts` → 2 files, 13 tests,
  all passing at HEAD, so neither is a documented correct-reason red. Neither
  bug document states a rationale for keeping the workspace-plant sequence
  local to each file.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0328-root-closure-hash-marshalled\|b0329-hash-mismatch-refuses-invocation"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test, `it()`, or `describe()` — only that
  the repeated `beforeEach`/`afterEach` pair could call the already-imported-
  from module's `finishWorkspace` instead of re-deriving its settings-write/
  dispose half — so no witness-list citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0213 (fixed)
  covers a *different* pair of files (b0275 and grandchild-callee-drop) and a
  *different*, larger harness (the full `makeHost`/`HostDouble` recording
  double plus `ComposeWorkspace`/`plantWorkspace`); PTQ-0312 (fixed) covers a
  different family (`plantThetaWorkspace`/`disposeWorkspace` in
  tests/helpers/production-load-harness.ts, wrapping `runProductionLoad`, not
  `composeExtensionInstance`/`makeHost`). PTQ-0343 (fixed) covers this same
  file pair's `savedEnv`/`setEnv`/env-restore lines, confirmed by direct
  re-read to be entirely disjoint from the `beforeEach`/`afterEach` lines
  cited here (the env-sandbox lines this finding's b0329 excerpt shows as
  `restoreEnv()` were the PTQ-0343 fix's own addition, left in place and
  unaffected by this claim). No existing filed or resolved item names
  `finishWorkspace` or this settings-write/`rmSync` pairing for b0328/b0329.
- Coverage-drift check: the claim is about a repeated setup/teardown
  DEFINITION, not a missing test path; every `beforeEach`/`afterEach` cited
  is exercised by its own file's currently-passing tests (13/13 confirmed
  above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — b0328:149-161, b0329:185-198, and compose-workspace-harness.ts:117-131 all reproduce verbatim; the mkdtemp/mkdir/settings-write/rmSync sequence matches finishWorkspace's body and rationale comment exactly, b0329 already imports the sibling `makeHost` export from that same module (confirmed, no `finishWorkspace` import in either file), both bug docs are fixed with 13/13 tests green at HEAD, coverage-matrix has 0 hits, and the overlap check against PTQ-0213/PTQ-0221/PTQ-0299/PTQ-0312/PTQ-0343 (each re-read) holds — all cover different files or a different scaffold piece (ComposeHost double, savedEnv/env-sandbox, or the production-load-harness family), leaving this mkdtemp/finishWorkspace instance unfiled. (triage: claude-opus-5)
