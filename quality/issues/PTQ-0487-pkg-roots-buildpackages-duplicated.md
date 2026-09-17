---
id: PTQ-0487
title: PKG_ROOTS and buildPackages are redeclared byte-identically in discovery-root-enumeration-failure.test.ts and discovery-tree-walk-lstat-failure.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-root-enumeration-failure.test.ts:258-268
  - tests/discovery-root-enumeration-failure.test.ts:288-295
  - tests/discovery-tree-walk-lstat-failure.test.ts:199-209
  - tests/discovery-tree-walk-lstat-failure.test.ts:225-232
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# PKG_ROOTS and buildPackages are redeclared byte-identically in discovery-root-enumeration-failure.test.ts and discovery-tree-walk-lstat-failure.test.ts

## Observation
Both files independently declare a module-scope `PKG_ROOTS` constant (the
five installed-package roots `packageRoots`, src/discovery/package-discovery.ts,
enumerates, registered as empty directories) and a `buildPackages(spec)`
helper that constructs a `FakeFileSystem` seeded with `PKG_ROOTS` merged with
the spec's own `dirs`. The `PKG_ROOTS` object body and the `buildPackages`
function body are byte-identical between the two files; only the doc
comment's cited production line range differs (`:232-242` in one file,
`:226-246` in the other), which is itself evidence the two copies drifted
independently rather than being kept in sync.

## Evidence
`tests/discovery-root-enumeration-failure.test.ts:258-268`:
```ts
/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts:232-242), registered as empty
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

`tests/discovery-tree-walk-lstat-failure.test.ts:199-209` — the same object,
same keys, same order, only the doc comment's cited production line range
differs:
```ts
/** The five installed-package roots `packageRoots` enumerates
 *  (src/discovery/package-discovery.ts:226-246), registered as empty
 *  directories so a root's absence never contributes an incidental rejection
 *  to a package cell's diagnostic set. */
const PKG_ROOTS: Record<string, readonly string[]> = {
  "/project/.pi/npm": [],
  "/project/.pi/git": [],
  [NM]: [],
  "/home/theta/.pi/agent/npm": [],
  "/home/theta/.pi/agent/git": [],
};
```

`tests/discovery-root-enumeration-failure.test.ts:288-295` (`buildPackages`):
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

`tests/discovery-tree-walk-lstat-failure.test.ts:225-232` — byte-identical:
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

Exact search re-run immediately before filing: `grep -n "const PKG_ROOTS"
tests/discovery-root-enumeration-failure.test.ts
tests/discovery-tree-walk-lstat-failure.test.ts` → one hit per file (line 262
and line 203 respectively — the excerpts above start at the doc comment
immediately above each declaration). `grep -n "^function buildPackages"` on
the same two files → one hit per file (line 288 and line 225). A repo-wide
`grep -rl "const PKG_ROOTS" tests --include="*.test.ts"` returns 5 files total
(these two, plus `tests/b0461-source-failure-descriptor-form.test.ts`,
`tests/discovery-glob-universe-enumeration-failure.test.ts`, and
`tests/settings-glob-disc5-matcher.test.ts`); this finding is scoped to the
two files inside the current review's file list and does not evidence the
other three.

## Why this is a problem
The same five-entry object literal and the same four-line `FakeFileSystem`
constructor wrapper are typed out twice rather than declared once. Neither
file's comment credits the other as a source, and the one place the two
copies differ — the doc comment's citation of the production
`packageRoots` line range — has already drifted (`232-242` vs `226-246`),
which is the observable symptom of two independently-maintained copies of the
same fixture rather than one shared definition.

## Suggested direction (non-binding, optional)
Both files already import `FakeFileSystem` from `./helpers/fake-file-system`;
a shared `tests/helpers/` export for "the five installed-package roots,
registered empty" plus the one `buildPackages`-shaped constructor wrapper
would be the natural home for these two pieces, as a hypothesis only.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `PKG_ROOTS`/`buildPackages` build a static fixture
  input, not a call-recording double backing a "never called" witness; not
  applicable.
- docs/bugs/ signature search: both files are cited by name in multiple
  docs/bugs/ witness lists (`docs/bugs/0075-symlinked-root-classified-wrong-type.md:303`,
  `docs/bugs/0076-existing-root-enumeration-failure-silent.md:257`,
  `docs/bugs/0113-listtree-glob-universe-swallow-silent.md:182,198,257,745,766,835,878`,
  `docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md:107`,
  `docs/bugs/0461-source-failure-descriptor-category-text.md:200,205`,
  `docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:355`); all
  cited bugs are Status fixed and `npx vitest run
  tests/discovery-root-enumeration-failure.test.ts
  tests/discovery-tree-walk-lstat-failure.test.ts` passes 17/17 and 11/11 at
  HEAD, so neither is a documented correct-reason red. This finding proposes
  no merge, rename, or deletion of either file or any `it()`/`describe()` in
  them — only that the `PKG_ROOTS`/`buildPackages` fixture declarations are
  duplicated — so the witness-list citations are unaffected.
- coverage-matrix/bug-doc citation search: `grep -n
  "discovery-root-enumeration-failure\|discovery-tree-walk-lstat-failure"
  docs/reference/coverage-matrix.md` → 0 hits; neither file is cited there.
- Coverage check: the claim is about a repeated fixture DEFINITION, not a
  missing test path; each copy is exercised by its own file's tests.
- Prior-finding overlap check: a search of quality/intake/ and
  quality/resolved/ for `PKG_ROOTS` returns no prior finding.
  `qw20260917154546-d7-03-b0461-ancestors-mergedirs-quintupled.md` (pending,
  same wave) cites `ancestors`/`mergeDirs`/`ReaddirDenied`/`codeError` in
  these same two files at disjoint line ranges (226-249 and 303-336 in
  discovery-root-enumeration-failure.test.ts); it does not cite `PKG_ROOTS`
  or `buildPackages`, so this is a distinct, uncited pair of duplicated
  symbols in the same file family, not a re-file of that candidate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `PKG_ROOTS` (discovery-root-enumeration-failure.test.ts:262-268 / discovery-tree-walk-lstat-failure.test.ts:203-209) and `buildPackages` (:288-295 / :225-232) are byte-identical module-scope copies whose only divergence is the doc comment's drifted `packageRoots` citation (`232-242` vs `226-246`; the production function now sits at src/discovery/package-discovery.ts:214-234, so both are stale); `grep -rn "const PKG_ROOTS" tests` and `"^function buildPackages" tests` each return the same 5 files including these two; both copies are live (each file's tests call `buildPackages`), neither file is a gate/pin test, neither is in coverage-matrix.md, no merge/rename/delete of any cell is proposed so bug-doc witness lists are unaffected; not a duplicate — same-wave sibling qw20260917154546-d7-03-b0461-ancestors-mergedirs-quintupled.md cites only ancestors/mergeDirs/ReaddirDenied at disjoint ranges (226-249, 303-336) and resolved PTQ-0255/PTQ-0396 cover different helpers in different files; D7 copy-paste-fixture class, mechanical dedupe (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
