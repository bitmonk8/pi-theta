---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: PackageDiscoveredTheta.source is a constant literal field written at one site and read by nothing
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/package-discovery.ts:54-59
  - src/discovery/package-discovery.ts:755
  - src/extension/production-composition.ts:679-684
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# PackageDiscoveredTheta.source is a constant literal field written at one site and read by nothing

## Observation
`PackageDiscoveredTheta` declares `source: "package"` — a single-member
literal type, so the field can only ever hold one value. It is written at the
one construction site in `discoverPackageThetas`. The sole production
consumer, `composeExtensionInstance`, maps the walk's results into
`DiscoveryInput.packageCandidates` reading `path`, `name`, and
`descriptorValue`; `source` is not read there or anywhere else, including
tests. The main discovery walk re-labels the candidates `source: "package"`
itself when it builds its own `SourcedCandidate`s.

## Evidence
src/discovery/package-discovery.ts:54-59 — the interface:
```ts
export interface PackageDiscoveredTheta {
  readonly name: string;
  readonly path: string;
  readonly source: "package";
  readonly descriptorValue: string;
}
```

src/discovery/package-discovery.ts:755 — the single write:
```ts
        thetas.push({ name: stem, path: abs, source: "package", descriptorValue: candidate.name });
```

src/extension/production-composition.ts:679-684 — the sole production
consumer reads the other three fields and drops `source`:
```ts
    packageCandidates: packageWalk.thetas.map((pkg) => ({
      path: pkg.path,
      stem: pkg.name,
      descriptorValue: pkg.descriptorValue,
    })),
```

Test consumers of `discoverPackageThetas` results (tests/package-discovery.test.ts,
tests/host-config-dir.test.ts, tests/settings-glob-disc5-matcher.test.ts,
tests/b0461-source-failure-descriptor-form.test.ts,
tests/discovery-glob-universe-enumeration-failure.test.ts,
tests/discovery-root-enumeration-failure.test.ts,
tests/discovery-tree-walk-lstat-failure.test.ts) were each searched for
`.source` reads: zero hits on package-walk values (host-config-dir's
`namedPackage` results are read via `.path` only, :413/:490).

## Why this is a problem
Vestigial field, proven on both axes the lens names: the value is invariant
(a one-member literal type — every instance carries `"package"` by
construction) and it is never read (the exhaustive consumer list above shows
the field dropped at the only mapping site and unasserted in every test that
touches the walk's results). The tag duplicates information the type name
already carries, and the downstream walk assigns its own `source: "package"`
label when it ingests these candidates (discovery-walk.ts:1286-1294), so
removing the field changes no observable output.

## Suggested direction (non-binding, optional)
Drop the `source` member from `PackageDiscoveredTheta` and the one write; the
priority-4 labeling already happens where the candidates enter
`discoverThetas`.

## False-positive check
Searched `PackageDiscoveredTheta` repo-wide — the type is produced only by
`discoverPackageThetas` and consumed at production-composition.ts:679-684 plus
the seven test files listed above. Searched each consumer file for `.source`
— no read on a package-walk value (tests/host-config-dir.test.ts's three
`.source` assertions at :271/:296/:478 are on `DiscoveredTheta` from
`discoverThetas`, via the separate `named` helper over `DiscoveredTheta[]`;
`namedPackage` results are read via `.path`). Searched for string-keyed access
(`["source"]`) and for `source: "package"` assertions in tests — none.
Test-only-caller rule considered: no test reads the field, so it is not
test-reachable production surface. The parallel `DiscoveredTheta.source` IS
read (tests assert it; the walk sets it per-source), so the deadness is
specific to the package-walk type, not the pattern.

## Triage
