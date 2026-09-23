---
id: PTQ-1490
title: FakeSpec/build/THETA_BODY/MISSING_SOURCE/UNREADABLE_SOURCE fixture scaffold is typed out three times across the discovery-failure files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/discovery-glob-universe-enumeration-failure.test.ts:181-217
  - tests/discovery-root-enumeration-failure.test.ts:164-192
  - tests/discovery-tree-walk-lstat-failure.test.ts:101-133
sites: 3
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# FakeSpec/build/THETA_BODY/MISSING_SOURCE/UNREADABLE_SOURCE fixture scaffold is typed out three times across the discovery-failure files

## Observation
All three in-scope discovery-failure test files declare the same six pieces of fixture scaffolding independently: the `MISSING_SOURCE`/`UNREADABLE_SOURCE` code-string constants, the `HOME`/`CWD`/`NM` path constants, the `THETA_BODY` minimal-body string, a `FakeSpec` interface (`dirs`/`files`, plus `errors` in two of the three), and a `build(spec: FakeSpec): FakeFileSystem` function whose body is byte-identical across all three files (differing only by the presence of the `errors` line, absent in the tree-walk-lstat copy because that file's injection seam does not need it).

## Evidence
tests/discovery-glob-universe-enumeration-failure.test.ts:181-217:
```ts
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
...
const HOME = "/home/theta";
const CWD = "/project";
const SETTINGS_BASE = "/project/.pi";
const PREFIX_ROOT = "/project/.pi/g";
const DENIED_SUB = "/project/.pi/g/sub";
const NM = "/project/node_modules";

/** A body that parses far enough to register (the walk only reads bytes). */
const THETA_BODY = "mode: prompt\n---\n";
...
interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    errors: spec.errors ?? {},
  });
}
```

tests/discovery-root-enumeration-failure.test.ts:164-192 — the same six declarations, byte-identical `build` body:
```ts
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
...
const HOME = "/home/theta";
const CWD = "/project";
const NM = "/project/node_modules";

const THETA_BODY = "mode: prompt\n---\n";

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
  readonly errors?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
    errors: spec.errors ?? {},
  });
}
```

tests/discovery-tree-walk-lstat-failure.test.ts:101-133 — the same five declarations (no `errors` field), same `build` body minus the `errors:` line:
```ts
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
...
const HOME = "/home/theta";
const CWD = "/project";
const SETTINGS_BASE = "/project/.pi";
const PREFIX_ROOT = "/project/.pi/g";
const DENIED_SUB = "/project/.pi/g/sub";
const NM = "/project/node_modules";

const THETA_BODY = "mode: prompt\n---\n";

interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: mergeDirs(BASE, spec.dirs ?? {}),
    files: spec.files ?? {},
  });
}
```

Search re-run immediately before filing: `grep -n "^const MISSING_SOURCE\|^const UNREADABLE_SOURCE\|^const THETA_BODY\|^interface FakeSpec\|^function build" tests/discovery-glob-universe-enumeration-failure.test.ts tests/discovery-root-enumeration-failure.test.ts tests/discovery-tree-walk-lstat-failure.test.ts` → 5 hits per file, exactly the declarations quoted above, in all three files.

## Why this is a problem
The same six named pieces of fixture scaffolding — two diagnostic-code constants, three path constants, one body-string constant, one `FakeSpec` shape, and one `build` function whose executable body is identical in all three files — are declared from scratch three times rather than imported once. All three files already import shared symbols (`FakeFileSystem`, `ancestors`, `mergeDirs`, `DISCOVERY_BASE`, `namedTheta`) from `tests/helpers/fake-file-system.ts`, so the remaining `FakeSpec`/`build`/`THETA_BODY`/`MISSING_SOURCE`/`UNREADABLE_SOURCE` quintet is the part of the same harness that stayed local to each file instead of following the rest of the import.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export for "the discovery-failure `FakeSpec`/`build` fixture plus the `THETA_BODY`/`MISSING_SOURCE`/`UNREADABLE_SOURCE` constants" would be the natural home these three files already partially draw from, as observation rather than design.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; not applicable. Recording-double check: `build`/`FakeSpec` construct static fixture input (directories/files/errors), not a call-recording MUST-NOT-call double; not applicable. docs/bugs/ signature search: `grep -rln "discovery-glob-universe-enumeration-failure.test.ts\|discovery-root-enumeration-failure.test.ts\|discovery-tree-walk-lstat-failure.test.ts" docs/bugs/*.md` shows these files are witnesses for bugs 0075, 0076, 0113 — all cited by file name, not by the `FakeSpec`/`build`/constant names, so no pinned-by-citation identifier is touched; this finding proposes only a shared-helper direction, not a merge/rename/delete of any test. coverage-matrix citation search: `grep -n "discovery-glob-universe-enumeration-failure\|discovery-root-enumeration-failure\|discovery-tree-walk-lstat-failure" docs/reference/coverage-matrix.md` → 0 hits. Prior-finding overlap check: `grep -rl "FakeSpec" quality/issues quality/resolved quality/intake` found PTQ-0487 (PKG_ROOTS/betaFixture pair, disjoint symbols and disjoint line ranges from this finding), PTQ-0899 (b0440/b0461 pair, disjoint files), PTQ-0900 (BASE/NO_SETTINGS/input/byCode/named quartet in discovery-walk.test.ts / e2e-s5-disc-cli-settings.test.ts, disjoint files), and PTQ-1045 (PKG_ROOTS not-migrated, disjoint symbol) — none names `THETA_BODY`, `MISSING_SOURCE`, `UNREADABLE_SOURCE`, or this exact three-file `build`/`FakeSpec` clone.

## Triage
verdict: confirmed — independently re-verified: the stated grep reproduces exactly (5 hits per file at glob:181/182/196/203/211, root:164/165/176/178/186, tree-walk:101/102/116/123/128), the `build` bodies hash identically (296f2ac3) in glob and root and differ in tree-walk only by the absent `errors:` line, all three copies are live (47/47 tests green), none is a gate/pin file, coverage-matrix.md 0 hits, bugs 0075/0076/0113 cite the files by name only and no it()/describe() merge/rename/delete is proposed — D7 copy-paste-fixture class, mechanical dedupe. Not a duplicate: resolved PTQ-0899 named only b0440/b0461 (its fixer note flagged these siblings but its locations exclude them, same reasoning PTQ-1316 used against PTQ-0900), resolved PTQ-0588/0900/1316/1377/1045 cover ancestors/mergeDirs, NO_SETTINGS/byCode, DISCOVERY_BASE roots, expectUniverseFailure and PKG_ROOTS respectively, and same-wave sibling d7-08-02 cites disjoint assertion-tail ranges. Two corrections for the fixer: the filing's "a shared export would be the natural home" understates the situation — canonical homes ALREADY exist (`buildDiscovery(spec)` + `SETTINGS_HOME`/`SETTINGS_CWD` at tests/helpers/fake-file-system.ts:500-501/535-543, landed by PTQ-0899's fix; `THETA_BODY` exported at tests/helpers/discovery-scratch-harness.ts:35 and imported by b0440/b0461/b0486), so this is a not-migrated case (import swap: `buildDiscovery({ ...spec, dirs: mergeDirs(BASE, spec.dirs ?? {}) })`); and `BASE` binds differently — root aliases `DISCOVERY_BASE` directly (:17) while glob/tree-walk merge in `ancestors(DENIED_SUB)` (:201/:121) — so the "byte-identical body" is textual, not semantic, and a shared builder must take the base map as a parameter. Counts are understated: `^const MISSING_SOURCE`/`UNREADABLE_SOURCE` pair recurs in 8 test files and `interface FakeSpec` in 11 (grep tests/), so shape the shared export to absorb those siblings (triage: claude-fable-5-1)
