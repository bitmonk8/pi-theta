---
id: PTQ-0937
title: inbound-union-arm-dispatch.test.ts and invoke-prompt-cell-enum-return.test.ts both retype reportOf despite the canonical export PTQ-0709's fix landed at tests/helpers/subagent-fn-child-regime.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inbound-union-arm-dispatch.test.ts:1351-1359
  - tests/invoke-prompt-cell-enum-return.test.ts:264-272
  - tests/helpers/subagent-fn-child-regime.ts:145-153
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inbound-union-arm-dispatch.test.ts and invoke-prompt-cell-enum-return.test.ts both retype reportOf despite the canonical export PTQ-0709's fix landed at tests/helpers/subagent-fn-child-regime.ts

## Observation
Both `tests/inbound-union-arm-dispatch.test.ts` and
`tests/invoke-prompt-cell-enum-return.test.ts` declare a module-scope
`reportOf(value: unknown): Record<string, unknown>` function — narrow an
`unknown` envelope payload to a plain object, throwing loudly with the same
wording when it is not one — whose body is the same helper
`tests/helpers/subagent-fn-child-regime.ts` now exports under the same name.
Both in-scope files already import several helpers from
`./helpers/real-subagent-spawn` for their real-child-spawn plumbing, but
neither imports `reportOf` from `tests/helpers/subagent-fn-child-regime.ts`.
`git log` shows the canonical export landed in commit `cc0a8fe7` (2026-09-18
00:23, "quality: qw20260917204232 fix tests__p1" — the fix for the resolved
`PTQ-0709-06-reportof-narrowing-helper-duplicated` finding); both in-scope
files were subsequently touched by commit `b2555372` (2026-09-18 10:51,
"quality: qw20260918075903 fix tests__p3", which migrated their real-child
launch/watchdog/reap plumbing to `./helpers/real-subagent-spawn`) without
adopting the already-existing `reportOf` export.

## Evidence

`tests/inbound-union-arm-dispatch.test.ts:1351-1359` (re-read immediately
before filing):
```ts
/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — the ` +
        `fixture pair did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}
```

`tests/invoke-prompt-cell-enum-return.test.ts:264-272` (re-read immediately
before filing) — the same helper, differing only in one wrapped word
("fixture set" vs. "fixture pair"):
```ts
/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}
```

`tests/helpers/subagent-fn-child-regime.ts:145-153` (the canonical,
already-exported equivalent, byte-identical body):
```ts
/** Shared reportOf fixture for the child-regime witnesses. */
export function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}
```

Exact search run: `grep -rln "function reportOf" tests/*.ts` → 6 files total
(`b0337-theta-enum-identity-invoke.test.ts`, `b0342-forwarded-enum-subagent-chain.test.ts`,
`inbound-boundary-theta-callable.test.ts`, `inbound-union-arm-dispatch.test.ts`,
`invoke-prompt-cell-enum-return.test.ts`, and `tests/helpers/subagent-fn-child-regime.ts`
itself as the sole `export function reportOf`). `grep -n "import.*reportOf"
tests/inbound-union-arm-dispatch.test.ts tests/invoke-prompt-cell-enum-return.test.ts`
→ 0 hits in either file.

## Why this is a problem
Both cited files retype the identical narrowing helper that
`tests/helpers/subagent-fn-child-regime.ts` now exports under the same name
and with the same body — the export the resolved `PTQ-0709` finding's fix
created specifically to end this duplication. The two files reviewed here
are among the "five siblings" that finding's own search surfaced (as noted
in its triage record) but did not formally file as locations at the time;
the canonical export has since landed and a later commit touched both files'
surrounding real-spawn plumbing without completing the migration to it.

## Suggested direction (non-binding, optional)
Importing `reportOf` from `tests/helpers/subagent-fn-child-regime.ts`,
alongside the `./helpers/real-subagent-spawn` imports both files already
take for their launch/drive/reap plumbing, is the path `PTQ-0709`'s own fix
already established for this exact helper.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named kin; the
  cited lines are a type-narrowing helper declaration, not a pinned count or
  inventory.
- Recording-double check: `reportOf` is a type-narrowing guard that throws
  loudly on a shape mismatch, not a recording double backing a "never
  called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "reportOf" docs/bugs/0172*.md docs/bugs/0174*.md`
  → 0 hits in either; neither bug document (each file's own header subject)
  names `reportOf` as a pinned witness artefact.
- coverage-matrix/bug-doc citation search: `grep -n "inbound-union-arm-dispatch\|invoke-prompt-cell-enum-return"
  docs/reference/coverage-matrix.md` → 0 hits for either file. This finding
  proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` in them — only that each local `reportOf` import the
  already-exported, already-canonical helper — so no citation is affected.
- Duplicate-topic check: the resolved `PTQ-0709-06-reportof-narrowing-helper-duplicated.md`
  finding's `locations` field names only `tests/subagent-invoke-inbound-enum-tag.test.ts`
  and `tests/subagent-invoke-nonfinite-return-refusal.test.ts`; neither of
  this review's two in-scope files was filed as a location there (its
  triage note mentions `inbound-union-arm-dispatch.test.ts` only as a
  wording nuance in a pattern-wide search, not as a filed site, and does not
  mention `invoke-prompt-cell-enum-return.test.ts` at all). This finding is
  the residue left behind after that fix's canonical export landed, at two
  sites not previously filed.
- Coverage-drift check: this finding is about a duplicated helper
  declaration in files that already exist and already pass; it makes no
  claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/inbound-union-arm-dispatch.test.ts:1351-1359, tests/invoke-prompt-cell-enum-return.test.ts:264-272 and tests/helpers/subagent-fn-child-regime.ts:145-153; mktemp `diff` of the invoke-prompt copy vs the canonical export differs only in the doc-comment line and the `export` keyword (body byte-identical), and the union-arm copy additionally differs only in the wrap of one error-message word ("the fixture pair" vs "the fixture set"), a string nothing in tests/ asserts on; both local copies are live (sole call sites :1494 and :342) and neither file imports `reportOf` (only subagent-invoke-inbound-enum-tag :55 and subagent-invoke-nonfinite-return-refusal :98 do); `grep -rln "function reportOf" src/ extensions/ tools/ tests/` → the same 6 files with the helper as the sole `export function reportOf`; git claims reproduce (`-S'export function reportOf'` → cc0a8fe7 2026-09-18 00:23; b2555372 2026-09-18 10:51 touched both files, 68+/178−); both sites under tests/, D7 copy-paste-fixture class; carve-outs do not bite (neither file is a gate, `reportOf` is a narrowing guard not a recording double, docs/bugs 0172/0174/0337 → 0 hits for reportOf, coverage-matrix → 0 hits, no merge/rename/delete proposed); not a duplicate — resolved PTQ-0709's locations name only the two subagent-invoke files and its fix migrated only those, and no open PTQ mentions reportOf (same-wave intake d7-08 files the third leftover sibling, inbound-boundary-theta-callable, as a separate site — consider folding at acceptance); the stray `d4_class: clone` on a D7 filing is extraneous but does not block evaluation (triage: claude-fable-5-1)
