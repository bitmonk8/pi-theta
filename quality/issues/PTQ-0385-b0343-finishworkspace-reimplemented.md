---
id: PTQ-0385
title: b0343's workspace beforeEach/afterEach restates finishWorkspace's settings-write and dispose instead of calling it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0343-proto-hash-carrier-row.test.ts:80-92
  - tests/helpers/compose-workspace-harness.ts:117-131
  - tests/b0328-root-closure-hash-marshalled.test.ts:105-117
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:22
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:186-198
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0343's workspace beforeEach/afterEach restates finishWorkspace's settings-write and dispose instead of calling it

## Observation
tests/b0343-proto-hash-carrier-row.test.ts's `beforeEach` mints a temp
directory, creates its `.pi/theta` subdirectory, and writes a minimal
`.pi/settings.json`; its `afterEach` removes the directory with `rmSync`.
tests/helpers/compose-workspace-harness.ts already exports
`finishWorkspace(cwd)`, which performs the identical settings-file write
(same path, same `"{}"` body, same "hermeticity, not noise suppression"
rationale b0343's own comment echoes) and returns a `ComposeWorkspace`
handle whose `dispose()` performs the identical `rmSync` call. b0343 does
not import `finishWorkspace` or `ComposeWorkspace` — it imports nothing from
`tests/helpers/compose-workspace-harness.ts` at all. Two direct siblings in
the same bug cluster, tests/b0328-root-closure-hash-marshalled.test.ts and
tests/b0329-hash-mismatch-refuses-invocation.test.ts, both already import
and call `finishWorkspace` for this exact purpose; b0343's own comment
explicitly claims to match them ("hermeticity, not noise suppression,
matching the b0328 and e2e harnesses") while in fact not sharing the
mechanism that makes that claim true.

## Evidence

tests/b0343-proto-hash-carrier-row.test.ts:80-92 (re-read immediately before
filing — the full `beforeEach`/`afterEach` pair, no `finishWorkspace`
import anywhere in the file):
```ts
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0343-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read for hermeticity (an
  // ABSENT file is silent per package-and-settings.md §Failure modes), matching
  // the b0328 and e2e harnesses.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

tests/helpers/compose-workspace-harness.ts:117-131 (re-read immediately
before filing — the canonical export performing the identical two steps):
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

tests/b0328-root-closure-hash-marshalled.test.ts:105-117 (the direct
sibling b0343's own comment names, already calling the canonical helper for
the identical two steps):
```ts
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0328-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read (an ABSENT file is
  // silent per package-and-settings.md §Failure modes) — hermeticity, not noise
  // suppression, matching the e2e harness.
  composeWorkspace = finishWorkspace(workspaceDir);
});

afterEach(() => {
  composeWorkspace.dispose();
});
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:22 (the other direct
sibling already importing the same module):
```ts
import { finishWorkspace, makeHost, type ComposeWorkspace } from "./helpers/compose-workspace-harness";
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:186-198 (that sibling's
`beforeEach`/`afterEach`, also calling `finishWorkspace`/`.dispose()`):
```ts
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0329-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read (an ABSENT file is
  // silent per package-and-settings.md §Failure modes) — hermeticity, not noise
  // suppression, matching the sibling harnesses.
  composeWorkspace = finishWorkspace(workspaceDir);
});

afterEach(() => {
  restoreEnv();
  composeWorkspace.dispose();
});
```

## Why this is a problem
This is the "Copy-paste fixtures" class: `tests/helpers/compose-workspace-harness.ts`
already exports `finishWorkspace(cwd)`, built for exactly the
settings-write/dispose sequence b0343's `beforeEach`/`afterEach` restates by
hand. b0343 is not an isolated file working from an unfamiliar module — its
own comment names "the b0328 … harness" as the thing it is matching, and
b0328 (created two days before b0343, per `git log --follow`) together with
b0329 are both direct siblings in the same 0328/0329/0331/0343 bug cluster
that already import `finishWorkspace` from this exact module for this exact
purpose. The claimed parity ("matching the b0328 … harness") is textually
true (the written-out steps are identical) but mechanically false: b0328
reaches that behaviour through the shared function, b0343 reaches it by
re-deriving the same two operations locally.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts`'s `finishWorkspace(cwd)` already
performs the settings-write and returns a `dispose()` wrapping the identical
`rmSync` call; it is the export b0343's own two direct siblings in this bug
cluster (b0328, b0329) already import for this identical `beforeEach`/
`afterEach` pair.

## False-positive check
- Gate-pin check: tests/b0343-proto-hash-carrier-row.test.ts does not match
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are directory/file
  lifecycle setup, not a pinned count or inventory assertion.
- Recording-double check: not applicable — `finishWorkspace`/the local
  restatement build a temp-directory handle, not a call-recording double,
  and back no "never called" witness.
- docs/bugs/ signature search: docs/bugs/0343-proto-theta-root-name-silent-no-op-hash-carrier-write.md
  Status "fixed (0.320.0)"; docs/bugs/0328-root-callee-closure-hash-never-marshalled.md
  Status "fixed (0.306.0)"; docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md
  Status "fixed (0.322.0)". `npx vitest run
  tests/b0343-proto-hash-carrier-row.test.ts
  tests/b0328-root-closure-hash-marshalled.test.ts
  tests/b0329-hash-mismatch-refuses-invocation.test.ts` → 3 files, 18 tests,
  all passing at HEAD (verified 2026-09-16), so none is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0343-proto-hash-carrier-row" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` — only that the setup/teardown pair could call the
  already-existing export instead of restating its body.
- Overlap check against already-filed/resolved topics: PTQ-0361
  (workspace-scaffold-duplicated, fixed) covers this exact
  mkdtemp/mkdir/settings-write/rmSync sequence, but its cited `locations`
  are only tests/b0328-root-closure-hash-marshalled.test.ts:149-161 and
  tests/b0329-hash-mismatch-refuses-invocation.test.ts:185-198 (both now
  fixed, confirmed by direct read: both currently call `finishWorkspace`);
  it never cites tests/b0343-proto-hash-carrier-row.test.ts, and the
  resulting fix touched only b0328/b0329, leaving b0343's own
  never-migrated copy of the identical sequence unaddressed. PTQ-0299
  (plantworkspace-reimplements-finishworkspace, fixed) and PTQ-0358
  (b0343-discovery-host-duplicates-runproductionload, fixed) each cover a
  different scaffold piece in different files (a `plantWorkspace` tail in
  b0280, and b0343's now-removed `makeDiscoveryHost`/`runDiscovery` pair,
  confirmed absent from the current file) — neither names
  `finishWorkspace`/`ComposeWorkspace` against b0343's `beforeEach`/
  `afterEach`. No filed or resolved item cites this exact gap.
- Coverage-drift check: the claim is about a repeated setup/teardown
  DEFINITION, not a missing test path; every `beforeEach`/`afterEach` cited
  is exercised by its own file's currently-passing tests (18/18 confirmed
  above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all 5 citations reproduce verbatim (lines, docs status "fixed", 18/18 tests green, 0 coverage-matrix hits); b0343's beforeEach/afterEach has no finishWorkspace/ComposeWorkspace import while direct siblings b0328/b0329 already call it for the identical settings-write/dispose; PTQ-0361 (confirmed/fixed) migrated only b0328/b0329 and never cites b0343, so this is not a duplicate. (triage: claude-opus-5)
