---
id: PTQ-1052
title: packageInput's single-line PackageDiscoveryInput wrapper is byte-identical in both in-scope package-side discovery test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-root-enumeration-failure.test.ts:221-223
  - tests/discovery-glob-universe-enumeration-failure.test.ts:281-283
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# packageInput's single-line PackageDiscoveryInput wrapper is byte-identical in both in-scope package-side discovery test files

## Observation
`tests/discovery-root-enumeration-failure.test.ts` and
`tests/discovery-glob-universe-enumeration-failure.test.ts` — both in this
review's scope, both driving `discoverPackageThetas` — each independently
declare a module-scope `packageInput(fs)` function with the identical
three-line body: construct a `PackageDiscoveryInput` from the passed `fs`, a
fresh `FakeClock`, and an empty `settings` object. Neither file imports the
other's declaration, and no module under `tests/helpers/` exports this
wrapper.

## Evidence
`tests/discovery-root-enumeration-failure.test.ts:221-223`:
```ts
function packageInput(fs: FileSystem): PackageDiscoveryInput {
  return { fs, clock: new FakeClock(), settings: {} };
}
```

`tests/discovery-glob-universe-enumeration-failure.test.ts:281-283` —
byte-identical:
```ts
function packageInput(fs: FileSystem): PackageDiscoveryInput {
  return { fs, clock: new FakeClock(), settings: {} };
}
```

Both files already import `FakeClock` from `./helpers/fake-clock` and
`type PackageDiscoveryInput` from `../src/discovery/package-discovery`
(confirmed at `tests/discovery-root-enumeration-failure.test.ts:11` and
`tests/discovery-glob-universe-enumeration-failure.test.ts:16`), so the
inputs to compose this wrapper from a shared export are already on each
file's import lines.

Search re-run immediately before filing: `grep -rn "^function packageInput" tests/*.test.ts`
→ 6 hits total: the two cited sites plus
`tests/b0461-source-failure-descriptor-form.test.ts:120`,
`tests/discovery-tree-walk-lstat-failure.test.ts:178`,
`tests/settings-glob-disc5-matcher.test.ts:143` (identical one-parameter,
three-line shape), and `tests/b0463-package-source-disc3-validation.test.ts:117`
(a differently-shaped multi-parameter overload) — this finding is scoped
only to the two byte-identical copies inside the current review's file
list and does not evidence the other four.

## Why this is a problem
The same three-line `PackageDiscoveryInput` construction wrapper — a fixed
`FakeClock`, an empty `settings` object, and the passed `fs` — is retyped at
module scope in both files rather than declared once, even though both
files already import every symbol the wrapper composes from
(`FakeClock`, `PackageDiscoveryInput`) on their own import lines.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-clock.ts` or a package-discovery-focused helper module
already used by both files (`tests/helpers/fake-file-system.ts`, which both
files import `buildPackages`-shaped fixtures from in the sibling PTQ-0487
lineage) is a natural home for a shared `packageInput` export, as a
hypothesis only.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` nor the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: `packageInput` builds a static input object; it
  records no calls and backs no "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rn "packageInput" docs/bugs/*.md` →
  0 hits; no open bug document cites this identifier or argues for keeping
  the two copies unshared.
- coverage-matrix/bug-doc citation search: `grep -n "discovery-root-enumeration-failure\|discovery-glob-universe-enumeration-failure" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` in either file — only that the wrapper's definition
  could be imported instead of redeclared.
- Coverage-drift check: the claim is entirely about a repeated three-line
  helper-function DEFINITION, not a missing test path; both copies are live
  (each file's package-side cells call `packageInput(fs)` repeatedly).
- Prior-finding overlap check: `grep -rl "packageInput" quality/issues quality/resolved quality/intake`
  → 0 hits before this filing; no existing finding names this identifier.
  This is a distinct root cause from PTQ-0487 (`PKG_ROOTS`/`buildPackages`)
  and from this same wave's `d7-02` finding (also `PKG_ROOTS`/`buildPackages`
  in `discovery-glob-universe-enumeration-failure.test.ts`), which cite a
  disjoint symbol pair at disjoint line ranges.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (mktemp sed-range diff empty, md5 94073d17 both), `FakeClock`/`type PackageDiscoveryInput`/`type FileSystem` are imported by both files (:11-15 / :14-25), each copy is live (6 `packageInput(` calls per file), `grep -rn "function packageInput" tests/` → the same 6 hits (5 byte-identical one-arg copies incl. b0461:120 / tree-walk-lstat:178 / settings-glob-disc5:143 which the filing names but scopes out, plus b0463:117's different multi-arg shape), no module under tests/helpers/ mentions `packageInput` or `PackageDiscoveryInput`, and the walk-side sibling `discoveryInput` already lives at tests/helpers/fake-file-system.ts:542 and is imported by both files as `input` — so this is a copy-paste fixture the PTQ-0487/0588/0900 hoists left behind; not a duplicate (`grep -rl packageInput quality/issues quality/resolved` → 0, and every prior row touching these two files names disjoint symbols); fixer should fold the other three identical copies into the same hoist (triage: claude-fable-5-1)
