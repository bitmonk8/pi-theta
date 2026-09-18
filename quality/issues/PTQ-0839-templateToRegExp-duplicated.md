---
id: PTQ-0839
title: templateToRegExp is a byte-identical five-line helper redeclared in four test files, two in this review's scope
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-glob-universe-enumeration-failure.test.ts:186-191
  - tests/discovery-root-enumeration-failure.test.ts:164-169
  - tests/discovery-tree-walk-lstat-failure.test.ts:100-105
  - tests/load-warning-delivery.test.ts:117-122
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# templateToRegExp is a byte-identical five-line helper redeclared in four test files, two in this review's scope

## Observation
`tests/discovery-glob-universe-enumeration-failure.test.ts` and
`tests/discovery-root-enumeration-failure.test.ts` (both in this review's
scope) each declare, at module scope, a byte-identical `templateToRegExp`
function: it escapes regex metacharacters in a registry Message template and
widens every `<placeholder>` slot to `.+`, returning a whole-string `RegExp`
used to match a diagnostic message whose exact descriptor spelling the spec
leaves open. The same five-line body recurs, byte-identical, in two further
files outside this review's file list (`tests/discovery-tree-walk-lstat-failure.test.ts`
and `tests/load-warning-delivery.test.ts`). No module under `tests/helpers/`
exports this shape.

## Evidence
`tests/discovery-glob-universe-enumeration-failure.test.ts:186-191`:
```ts
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}
```

`tests/discovery-root-enumeration-failure.test.ts:164-169` — byte-identical:
```ts
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}
```

`tests/discovery-tree-walk-lstat-failure.test.ts:100-105` — byte-identical:
```ts
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}
```

`tests/load-warning-delivery.test.ts:117-122` — byte-identical:
```ts
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}
```

Exact search re-run immediately before filing: `grep -rn "^function templateToRegExp" tests/*.test.ts`
→ exactly 4 hits, at the 4 locations above; each function body diffed
line-by-line against the others shows zero byte difference (same regex
literals, same escaping order, same wrapping `^...$`).

## Why this is a problem
The same five-line "escape a registry Message template into a whole-string
matcher with `<placeholder>` slots widened" helper is retyped at module scope
in four files rather than composed once. Both in-scope files import
`loadRowMessage`/`interpolate` from the same `tests/helpers/registry-oracle`
module the template originates from, so the natural import surface for a
shared `templateToRegExp` already sits on each file's own import line;
neither composes from it because no such export exists there today.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already hosts `loadRowMessage` and
`interpolate`, the two functions every `templateToRegExp` call site pairs it
with; a sibling export for the placeholder-widened whole-string matcher sits
naturally beside them, as a hypothesis only.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this
  finding is about a helper-function definition site, not a pinned count or
  corpus inventory.
- Recording-double check: `templateToRegExp` builds a matcher from a static
  string; it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "templateToRegExp" docs/bugs/*.md`
  → 0 hits; no open bug document cites this identifier or a red matching its
  shape. `npx vitest run tests/discovery-glob-universe-enumeration-failure.test.ts
  tests/discovery-root-enumeration-failure.test.ts` passes 19/19 and 17/17 at
  HEAD, so neither in-scope file is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "discovery-glob-universe-enumeration-failure\|discovery-root-enumeration-failure\|discovery-tree-walk-lstat-failure\|load-warning-delivery"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any file or `it()`/`describe()` — only that
  the internal `templateToRegExp` helper could be composed from a shared
  export — so the citation carve-out does not bind.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; all four files are fully exercised at
  HEAD.
- Prior-finding overlap check: `grep -rl "templateToRegExp" quality/issues
  quality/intake` → 0 hits before this filing; no existing finding names this
  helper. This is a distinct root cause from PTQ-0588 (`ancestors`/`mergeDirs`/
  `ReaddirDenied`) and PTQ-0487 (`PKG_ROOTS`/`buildPackages`), which do not
  mention `templateToRegExp` in their location lists.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: `grep -rn "^function templateToRegExp" tests/*.test.ts` → exactly the 4 cited sites (:186/:164/:100/:117), sed-extracted six-line bodies diffed pairwise → zero byte difference; all four copies are live (1/2/1/3 `templateToRegExp(loadRowMessage(...))` call sites) and every file already imports `loadRowMessage`/`interpolate` from ./helpers/registry-oracle on line 1-2, so the shared-export direction is a mechanical import swap; both in-scope files pass 19/17 (36/36) at HEAD, none is a gate file, docs/bugs `templateToRegExp` → 0, coverage-matrix cites of the four stems → 0, no merge/rename/delete proposed, no recording-double witness — D7 boilerplate-duplication class, tests/ only; one imprecision for the fixer, not blocking: tests/helpers/compose-workspace-harness.ts:221-235 `normativeMessagePattern` already exports the same escape-then-widen idiom but takes (registry, code) and returns an UNANCHORED RegExp, so the anchored template→RegExp shape indeed has no export; not a duplicate — PTQ-0428/0477/0525/0561/0695 track redeclared `normativeMessagePattern` copies in disjoint files, PTQ-0632/0647/0487/0588 and same-wave d7-02-pkg-roots/d7-03-shippedharness/d7-09 cite these files for other helpers, and no open/resolved row names `templateToRegExp` (triage: claude-fable-5-1)
