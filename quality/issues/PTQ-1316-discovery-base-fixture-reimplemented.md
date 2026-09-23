---
id: PTQ-1316
title: Discovery root/base fixture constants reimplemented locally in two files despite a canonical export the third file in scope already imports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/discovery-glob-universe-enumeration-failure.test.ts:187-190
  - tests/discovery-glob-universe-enumeration-failure.test.ts:201-204
  - tests/discovery-tree-walk-lstat-failure.test.ts:99-102
  - tests/discovery-tree-walk-lstat-failure.test.ts:113-116
  - tests/discovery-root-enumeration-failure.test.ts:14-25
  - tests/helpers/fake-file-system.ts:525-532
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Discovery root/base fixture constants reimplemented locally in two files despite a canonical export the third file in scope already imports

## Observation
`tests/helpers/fake-file-system.ts` exports `DISCOVERY_GLOBAL_ROOT`, `DISCOVERY_PROJECT_ROOT`, and `DISCOVERY_BASE` (the `mergeDirs(ancestors(...), ancestors(...))` composition of the two roots' ancestor chains). `tests/discovery-root-enumeration-failure.test.ts` imports all three under local aliases `GLOBAL_ROOT`, `PROJECT_ROOT`, `BASE`. The other two files in this review's scope — `tests/discovery-glob-universe-enumeration-failure.test.ts` and `tests/discovery-tree-walk-lstat-failure.test.ts` — instead declare byte-identical local constants and a byte-identical `mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT), ancestors(DENIED_SUB))` composition rather than importing the canonical export and merging in the one extra ancestor chain their fixture set needs.

## Evidence
tests/helpers/fake-file-system.ts:525-532 (the canonical export):
```
export const DISCOVERY_GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
export const DISCOVERY_PROJECT_ROOT = "/project/.pi/theta";
...
export const DISCOVERY_BASE = mergeDirs(ancestors(DISCOVERY_GLOBAL_ROOT), ancestors(DISCOVERY_PROJECT_ROOT));
```

tests/discovery-root-enumeration-failure.test.ts:14-25 (imports the canonical export):
```
import {
  FakeFileSystem,
  ReaddirDeniedFileSystem,
  ancestors,
  mergeDirs,
  buildPackages,
  packageInput,
  DISCOVERY_BASE as BASE,
  DISCOVERY_GLOBAL_ROOT as GLOBAL_ROOT,
  DISCOVERY_PROJECT_ROOT as PROJECT_ROOT,
  discoveryInput as input,
} from "./helpers/fake-file-system";
```

tests/discovery-glob-universe-enumeration-failure.test.ts:187-190, :201-204 (redeclares the same values instead of importing them):
```
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const SETTINGS_BASE = "/project/.pi";
...
const BASE = mergeDirs(
  ancestors(GLOBAL_ROOT),
  ancestors(PROJECT_ROOT),
  ancestors(DENIED_SUB),
);
```

tests/discovery-tree-walk-lstat-failure.test.ts:99-102, :113-116 (the same redeclaration, byte-identical to the glob-universe file's):
```
const GLOBAL_ROOT = "/home/theta/.pi/agent/theta";
const PROJECT_ROOT = "/project/.pi/theta";
const SETTINGS_BASE = "/project/.pi";
...
const BASE = mergeDirs(
  ancestors(GLOBAL_ROOT),
  ancestors(PROJECT_ROOT),
  ancestors(DENIED_SUB),
);
```

## Why this is a problem
The three string literals (`GLOBAL_ROOT`, `PROJECT_ROOT`) and the `mergeDirs`/`ancestors` composition that derives `BASE` from them are typed out identically in two of the three files under review, while the third file in the very same review scope demonstrates that a canonical, importable version of exactly this value already exists and composes cleanly with one extra `ancestors(DENIED_SUB)` call. The duplication is not an incidental coincidence of independently-chosen fixture values — it is the same named concept (the two conventional discovery roots' ancestor chains) typed out by hand twice.

## Suggested direction (non-binding, optional)
The two redeclaring files could import `DISCOVERY_GLOBAL_ROOT`/`DISCOVERY_PROJECT_ROOT`/`DISCOVERY_BASE` the same way the third file in scope already does, and merge in their own extra `ancestors(DENIED_SUB)` chain on top of the canonical `DISCOVERY_BASE`, as observation rather than design.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or the named gate kinds; not applicable. Recording-double check: no recording double is involved; not applicable. docs/bugs/ signature search: the discrepancy is a fixture-declaration duplication, not a red test, so no docs/bugs/ correct-reason-red search applies. coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` and the bug docs referenced in these files' headers (0075, 0076, 0113) for the constant names `GLOBAL_ROOT`/`PROJECT_ROOT`/`BASE` and found no citation by name of these local declarations — the finding proposes no rename/merge/delete of a cited test, only pointing at an already-duplicated set of literal constants. Confirmed the claim is about existing test code (D7, not coverage): no coverage gap is asserted.

## Triage
verdict: confirmed — independently re-verified: canonical `DISCOVERY_GLOBAL_ROOT`/`DISCOVERY_PROJECT_ROOT`/`DISCOVERY_BASE` exports sit at tests/helpers/fake-file-system.ts:525-532 exactly as excerpted; tests/discovery-glob-universe-enumeration-failure.test.ts:188-189/:201-205 and tests/discovery-tree-walk-lstat-failure.test.ts:100-101/:113-117 redeclare the same two literals and a `mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT), ancestors(DENIED_SUB))` composition (byte-identical to each other, canonical two-chain BASE plus one extra chain), while their `./helpers/fake-file-system` import blocks (:20-27, :15) name ancestors/mergeDirs/buildPackages/packageInput but none of the three exports; tests/discovery-root-enumeration-failure.test.ts:14-25 imports all three under the same aliases; both copies live (3 files / 47 tests green), none is a gate/pin file, coverage-matrix.md 0 hits for either file, docs/bugs 0075/0076/0113 cite no GLOBAL_ROOT/PROJECT_ROOT/BASE by name, and no it()/describe() merge/rename/delete is proposed — D7 copy-paste-fixture class, mechanical import swap. Not a duplicate: resolved PTQ-0900 landed the DISCOVERY_BASE export and its sweep migrated six siblings (discovery-invalid-extension, discovery-symlinked-root-classification, discovery-walk, e2e-s5-disc-cli-settings, settings-glob-disc5-matcher, discovery-root-enumeration-failure) but named neither of these two files; resolved PTQ-0588/1037/1045 cover ancestors/mergeDirs bodies, ShippedHarness and PKG_ROOTS/buildPackages in the glob-universe file, not these roots. Fixer note: the same `GLOBAL_ROOT`/`PROJECT_ROOT` literal pair also persists unmigrated at tests/b0440-cross-source-shadow-descriptor-form.test.ts:55-56 and tests/b0461-source-failure-descriptor-form.test.ts:74-75 (grep `^const GLOBAL_ROOT = "/home/theta/.pi/agent/theta"` → 4 files) — sweep them in the same fix (triage: claude-fable-5-1)
