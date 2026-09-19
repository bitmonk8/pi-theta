---
id: PTQ-1045
title: discovery-glob-universe-enumeration-failure.test.ts still redeclares PKG_ROOTS and buildPackages that PTQ-0487's fix centralised into tests/helpers/fake-file-system.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-glob-universe-enumeration-failure.test.ts:227-236
  - tests/discovery-glob-universe-enumeration-failure.test.ts:257-263
  - tests/helpers/fake-file-system.ts:392-411
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# discovery-glob-universe-enumeration-failure.test.ts still redeclares PKG_ROOTS and buildPackages that PTQ-0487's fix centralised into tests/helpers/fake-file-system.ts

## Observation
`tests/helpers/fake-file-system.ts` exports a `PKG_ROOTS` constant (the five
installed-package roots `packageRoots` enumerates, registered as empty
directories) and a `buildPackages(spec)` function that constructs a
`FakeFileSystem` seeded with `PKG_ROOTS` merged with the spec's own `dirs`.
`tests/discovery-glob-universe-enumeration-failure.test.ts` declares its own
module-scope `PKG_ROOTS` constant with the same five keys and empty-array
values, and its own `buildPackages(spec)` function whose body is the same
`FakeFileSystem` constructor wrapper, rather than importing either from
`./helpers/fake-file-system` — which the file already imports five other
symbols from (`FakeFileSystem`, `ReaddirDeniedFileSystem`, `ancestors`,
`mergeDirs`, `discoveryInput`).

## Evidence
`tests/helpers/fake-file-system.ts:392-411` (canonical export, re-read
immediately before filing):
```ts
/** The five installed-package roots `packageRoots`
 *  (`src/discovery/package-discovery.ts`) enumerates, registered as empty
 *  directories so a root's absence never contributes an incidental `readdir`
 *  rejection to a package cell's diagnostic set. */
export const PKG_ROOTS: Record<string, readonly string[]> = {
  "/project/.pi/npm": [],
  "/project/.pi/git": [],
  "/project/node_modules": [],
  "/home/theta/.pi/agent/npm": [],
  "/home/theta/.pi/agent/git": [],
};

/** Build a package fixture with all five scan roots present, initially empty. */
export function buildPackages(spec: Pick<FakeFileSystemOptions, "dirs" | "files">): FakeFileSystem {
  return new FakeFileSystem({
    homedir: "/home/theta",
    cwd: "/project",
    dirs: mergeDirs(PKG_ROOTS, spec.dirs ?? {}),
    files: spec.files ?? {},
  });
}
```

`tests/discovery-glob-universe-enumeration-failure.test.ts:227-236` (the
redeclared constant, same five keys and empty-array values — `NM` is this
file's own local alias for `"/project/node_modules"`, defined at line 217):
```ts
/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts:226-246), registered as empty
 *  directories so a root's absence never contributes an incidental `readdir`
 *  rejection to a package cell's diagnostic set. */
const PKG_ROOTS: Record<string, readonly string[]> = {
  "/project/.pi/npm": [],
  "/project/.pi/git": [],
  [NM]: [],
  "/home/theta/.pi/agent/npm": [],
  "/home/theta/.pi/agent/git": [],
};
```

`tests/discovery-glob-universe-enumeration-failure.test.ts:257-263` (the
redeclared function — same `FakeFileSystem` constructor wrapper, only the
`homedir`/`cwd` values are drawn from this file's local `HOME`/`CWD`
constants, which equal the canonical's hard-coded `"/home/theta"`/`"/project"`):
```ts
function buildPackages(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(PKG_ROOTS, spec.dirs ?? {}),
    files: spec.files ?? {},
  });
}
```

Search re-run immediately before filing: `grep -n "^const PKG_ROOTS\|^function buildPackages" tests/discovery-glob-universe-enumeration-failure.test.ts`
→ exactly one hit each (lines 231, 257); the file's import block at
lines 26-32 (`FakeFileSystem`, `ReaddirDeniedFileSystem`, `ancestors`,
`mergeDirs`, `discoveryInput`) does not name `PKG_ROOTS` or `buildPackages`.

## Why this is a problem
`quality/resolved/PTQ-0487-pkg-roots-buildpackages-duplicated.md` (status:
fixed, confirmed) named the identical `PKG_ROOTS`/`buildPackages` pair as
duplicated in `tests/discovery-root-enumeration-failure.test.ts` and
`tests/discovery-tree-walk-lstat-failure.test.ts`, and its own evidence
section already noted a repo-wide `grep -rl "const PKG_ROOTS" tests` hit
`tests/discovery-glob-universe-enumeration-failure.test.ts` among "the other
three" files it explicitly declined to evidence because they sat outside
that review's file list. The fix landed by exporting `PKG_ROOTS` and
`buildPackages` from `tests/helpers/fake-file-system.ts` — the file in this
review's scope now imports `buildPackages` from that module (confirmed at
`tests/discovery-root-enumeration-failure.test.ts:21`) — but
`discovery-glob-universe-enumeration-failure.test.ts`, one of the three
files PTQ-0487 flagged as sharing the same declaration and left unfiled, was
never migrated to import the now-existing canonical pair; it still
redeclares both.

## Suggested direction (non-binding, optional)
Importing `PKG_ROOTS` and `buildPackages` from `./helpers/fake-file-system`
— the same import `tests/discovery-root-enumeration-failure.test.ts` already
uses for `buildPackages` — is the natural next step, since this file's local
`FakeSpec.errors` field is unused by any `buildPackages` call site in the
file (every `buildPackages(...)` call in this file passes only `dirs`/
`files`), matching the canonical signature's narrower
`Pick<FakeFileSystemOptions, "dirs" | "files">` parameter exactly.

## False-positive check
- Gate-pin check: `tests/discovery-glob-universe-enumeration-failure.test.ts`
  matches neither `*gate*.test.ts` nor the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: `PKG_ROOTS`/`buildPackages` build a static
  fixture input (installed-package roots), not a call-recording double
  backing a "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rl "discovery-glob-universe-enumeration-failure" docs/bugs/*.md`
  → docs/bugs/0078, 0113, 0207, 0461, all cited by behaviour/cell, not by
  the `PKG_ROOTS`/`buildPackages` declaration's line numbers; this finding
  proposes no merge, rename, or deletion of any `it()`/`describe()` in the
  file, only that the fixture declaration could be imported instead of
  redeclared, so those witness citations are unaffected.
- coverage-matrix/bug-doc citation search: `grep -n "discovery-glob-universe-enumeration-failure" docs/reference/coverage-matrix.md`
  → 0 hits.
- Coverage-drift check: the claim is about a repeated fixture DEFINITION
  that a sibling fix already extracted, not a missing test path; the local
  copy is live (8 `buildPackages(...)` call sites in this file, per the
  file's own package-side RED/control cells).
- Prior-finding overlap check: PTQ-0487's own evidence section explicitly
  names this file among the "other three" a repo-wide search hit but left
  unevidenced; `grep -rl "PKG_ROOTS" quality/issues quality/intake` finds no
  open or pending finding that already covers this file's copy. This is a
  distinct "not migrated" observation, not a re-litigation of PTQ-0487's
  now-fixed scope.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: canonical `export const PKG_ROOTS`/`export function buildPackages` sit at tests/helpers/fake-file-system.ts:396-402/:405-411 and the local copies at tests/discovery-glob-universe-enumeration-failure.test.ts:231-237/:257-263 exactly as excerpted; a mktemp diff of the local pair after resolving its `NM`/`HOME`/`CWD` aliases (`"/project/node_modules"`/`"/home/theta"`/`"/project"` at :206-217) against the canonical pair is empty, so the copies are value-identical; the file's import block (:26-32) names five helpers from `./helpers/fake-file-system` but neither `PKG_ROOTS` nor `buildPackages`; the local copy is live (`buildPackages` called at :769/:782/:811/:833/:857 — 5 sites, not the filing's 8) and every call passes only `dirs`/`files` (`betaFixture` :704-716 returns dirs/files; `errors` is read only by `build` at :253), so the canonical `Pick<FakeFileSystemOptions,"dirs"|"files">` signature fits without change; not a gate/pin file, coverage-matrix 0 hits, no it()/describe() merge/rename/delete proposed so bugs 0078/0113/0207/0461 witness citations are unaffected; not a duplicate — PTQ-0487 (fixed) explicitly scoped itself to root-enumeration/tree-walk-lstat and declined to evidence this file (its :96-101), and PTQ-0588/0899/0900/0839 mention the pair only to disclaim it; D7 copy-paste-fixture class, mechanical import swap. Fixer note: the same unmigrated pair persists in tests/b0461-source-failure-descriptor-form.test.ts:98/:106 and tests/settings-glob-disc5-matcher.test.ts:108/:130 (neither imports the canonical pair, neither tracked by an open row) — sweep them in the same fix (triage: claude-fable-5-1)
