---
id: PTQ-1394
title: named() theta-lookup helper is byte-identical across all three files in scope
lens: D7
status: open
verdict: confirmed
locations:
  - tests/discovery-glob-universe-enumeration-failure.test.ts:240-245
  - tests/discovery-root-enumeration-failure.test.ts:207-212
  - tests/discovery-tree-walk-lstat-failure.test.ts:162-167
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# named() theta-lookup helper is byte-identical across all three files in scope

## Observation
All three files under review declare a local `named(thetas, name)` helper whose body is `return thetas.find((t) => t.name === name);`. Two of the three (`discovery-glob-universe-enumeration-failure.test.ts` and `discovery-tree-walk-lstat-failure.test.ts`) type it with the identical union parameter type `readonly (DiscoveredTheta | PackageDiscoveredTheta)[]`; the third (`discovery-root-enumeration-failure.test.ts`) narrows it to `readonly DiscoveredTheta[]` because that file never calls `discoverPackageThetas` outside its own package-only `describe` block. The function body, name, and purpose are identical in all three.

## Evidence
tests/discovery-glob-universe-enumeration-failure.test.ts:240-245:
```
function named(
  thetas: readonly (DiscoveredTheta | PackageDiscoveredTheta)[],
  name: string,
): DiscoveredTheta | PackageDiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name);
}
```

tests/discovery-root-enumeration-failure.test.ts:207-212:
```
function named(
  thetas: readonly DiscoveredTheta[],
  name: string,
): DiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name);
}
```

tests/discovery-tree-walk-lstat-failure.test.ts:162-167:
```
function named(
  thetas: readonly (DiscoveredTheta | PackageDiscoveredTheta)[],
  name: string,
): DiscoveredTheta | PackageDiscoveredTheta | undefined {
  return thetas.find((t) => t.name === name);
}
```

## Why this is a problem
The identical five-line `.find` lookup by `name` is declared locally in each of the three files under review rather than once. The count is exact: three sites, each an exact duplicate of the same one-line body wrapped in the same signature shape (modulo the union-vs-single type narrowing driven by which discovery function the file also exercises).

## Suggested direction (non-binding, optional)
A single generic `named<T extends { name: string }>(items, name)` helper under `tests/helpers/` could serve all three call sites, as observation of the natural home rather than a design.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or a named gate kind; not applicable. Recording-double check: `named()` is a plain lookup over discovery results, not a recording double asserting a MUST-NOT-call witness; not applicable. docs/bugs/ signature search: `named()` is not itself a red or disabled test; the correct-reason-red carve-out does not apply. coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` and bug docs 0075/0076/0113 for `named(` by name — no citation found, so no pinned test is implicated by a shared-helper direction.

## Triage
verdict: confirmed — all three excerpts reproduce at the cited lines (glob-universe:240-245, root-enumeration:207-212, tree-walk-lstat:162-167; same `thetas.find((t) => t.name === name)` body, union-vs-single parameter type only), and the duplication is worse than filed: `tests/helpers/fake-file-system.ts:554` already exports `namedTheta(thetas, name)` with the identical body and every one of the three files already imports from `./helpers/fake-file-system` (lines 27, 25, 15) yet redeclares the lookup locally; the same local `named()` also recurs at discovery-cli-entry-override-prefix.test.ts:142, host-config-dir.test.ts:174/181 and package-discovery.test.ts:128 (out of this wave's scope but the same clone), so the fix is a mechanical import (widening `namedTheta` to accept `PackageDiscoveredTheta` where needed); no gate test, no coverage-matrix/bug-doc citation of `named(`, no existing PTQ row tracks this helper (triage: claude-fable-5-1)
