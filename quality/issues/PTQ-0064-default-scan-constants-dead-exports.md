---
id: PTQ-0064
title: DEFAULT_SCAN_PACKAGES, DEFAULT_SCAN_PACKAGES_MAX_FILES, and DEFAULT_SCAN_PACKAGES_TIMEOUT_MS are exported but nothing outside package-discovery.ts imports them
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/package-discovery.ts:72-75
  - src/discovery/package-discovery.ts:674-682
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# DEFAULT_SCAN_PACKAGES, DEFAULT_SCAN_PACKAGES_MAX_FILES, and DEFAULT_SCAN_PACKAGES_TIMEOUT_MS are exported but nothing outside package-discovery.ts imports them

## Observation
`package-discovery.ts` declares three built-in bound defaults as `export
const`. Each constant is read exactly once, inside the same module, as the
`??` fallback in `discoverPackageThetas`. No other module in `src/`,
`extensions/`, or `tools/` imports any of the three names, and no test file
imports them either — the export modifiers publish surface that has no
consumer anywhere in the repository.

## Evidence
src/discovery/package-discovery.ts:72-75 — the exported declarations:
```ts
/** Built-in bound defaults (DISC-6 upper bounds, not target performance). */
export const DEFAULT_SCAN_PACKAGES = true;
export const DEFAULT_SCAN_PACKAGES_MAX_FILES = 2000;
export const DEFAULT_SCAN_PACKAGES_TIMEOUT_MS = 2000;
```

src/discovery/package-discovery.ts:674-682 — the only reads, all
module-internal:
```ts
  const thetasSettings = settings.theta ?? {};
  const scanPackages = thetasSettings.scanPackages ?? DEFAULT_SCAN_PACKAGES;
  if (!scanPackages) {
    // The walk is skipped wholesale: no root is scanned, no read is issued.
    return { thetas, diagnostics, roots: [...roots] };
  }
  const maxFiles = thetasSettings.scanPackagesMaxFiles ?? DEFAULT_SCAN_PACKAGES_MAX_FILES;
  const timeoutMs = thetasSettings.scanPackagesTimeoutMs ?? DEFAULT_SCAN_PACKAGES_TIMEOUT_MS;
```

Search: `grep -rn -w <name> src extensions tools tests` for each of the three
names — hits only in `src/discovery/package-discovery.ts` (the declaration and
the one internal read each; 2 hits per name, 6 total). Search:
`grep -rn "package-discovery"` across `src`, `extensions`, `tools`, `tests` —
the only importers are `src/extension/production-composition.ts:116`
(`discoverPackageThetas`) and eight test files importing
`discoverPackageThetas` / `type PackageDiscoveryInput` /
`type PackageDiscoveryResult`; none names the constants.

## Why this is a problem
Dead export surface, proven dead: the constants themselves are alive (the two
internal `??` reads), but the `export` modifiers reach nothing — no import in
`src/`, `extensions/`, `tools/`, or `tests/`, no namespace (`import * as`)
import of the module, no re-export barrel over `src/discovery/`, and no
string-keyed access. An exported name advertises a cross-module contract;
publishing three that nothing consumes makes the module's real API surface
larger than its actual one.

## Suggested direction (non-binding, optional)
Drop the `export` modifiers so the three defaults become module-private
constants; nothing else changes.

## False-positive check
Reference searches run: word-boundary grep for each of the three identifiers
across `src/`, `extensions/`, `tools/`, `tests/` (only the six in-module hits
cited above); import-line search for `package-discovery` across the same
trees (importers listed above, none naming the constants); namespace/star
import and re-export search (`import * as`, `export *`, `require(`) across
the repo filtered for discovery modules — zero hits; string-keyed/dynamic
access search for `DEFAULT_SCAN` across `*.ts`/`*.json`/`*.md` under `src`,
`extensions`, `tools`, `tests` — zero hits outside the module. Tests-only
caller rule considered: not applicable — no test references the names at
all. Checked the already-filed corpus: `grep -rln "DEFAULT_SCAN"
quality/intake quality/TRIAGE_LOG.md` — no match.

## Triage
verdict: confirmed — reproduced: `git grep DEFAULT_SCAN` over all tracked files yields only the 3 declarations (src/discovery/package-discovery.ts:73-75) and 3 in-module reads (:676,:681,:682); no importer, no `import * as`/`export *`/barrel over src/discovery, no dynamic access, no docs/test/config reference, and the sole published entry (extensions/index.ts) re-exports only src/extension/factory (triage: claude-opus-5)
