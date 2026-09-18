---
id: PTQ-0942
title: inbound-boundary-theta-callable.test.ts retypes reportOf despite the canonical export PTQ-0709's fix landed at tests/helpers/subagent-fn-child-regime.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inbound-boundary-theta-callable.test.ts:181-190
  - tests/helpers/subagent-fn-child-regime.ts:145-153
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inbound-boundary-theta-callable.test.ts retypes reportOf despite the canonical export PTQ-0709's fix landed at tests/helpers/subagent-fn-child-regime.ts

## Observation
`tests/inbound-boundary-theta-callable.test.ts` declares a module-scope
`reportOf(value: unknown): Record<string, unknown>` function whose body —
narrow an `unknown` envelope payload to a plain object, throwing loudly with
a fixed wording when it is not one — is the same helper `tests/helpers/
subagent-fn-child-regime.ts` now exports under the same name, at
`tests/helpers/subagent-fn-child-regime.ts:145-153`. The file already
imports several helpers from `./helpers/real-subagent-spawn` (the fix
landed for the sibling PTQ-0583 finding), but does not import `reportOf`
from `tests/helpers/subagent-fn-child-regime.ts`.

## Evidence
`tests/inbound-boundary-theta-callable.test.ts:181-190`:
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
already-exported equivalent):
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

The two bodies are character-for-character identical (only the doc comment
differs: "Narrow the envelope's `Ok` payload…" vs "Shared reportOf fixture
for the child-regime witnesses."). Exact search run: `grep -n "reportOf"
tests/helpers/*.ts` → the one canonical export above, at
`tests/helpers/subagent-fn-child-regime.ts:146`. `grep -n "reportOf"
tests/inbound-boundary-theta-callable.test.ts` → the local declaration at
line 182 and its one call site at line 259.

## Why this is a problem
`tests/helpers/subagent-fn-child-regime.ts` already exports `reportOf` for
exactly this shape of fixture — narrowing a driven root's returned envelope
payload to the `R`-report object the test's assertions read fields off of —
and the resolved PTQ-0709 finding (`quality/resolved/PTQ-0709-…md`) that
created this export explicitly named
`tests/inbound-boundary-theta-callable.test.ts` among the "five siblings"
still carrying an independent, byte-identical copy at the time it was
written; that copy remains unmigrated in the file reviewed here.

## Suggested direction (non-binding, optional)
Importing `reportOf` from `tests/helpers/subagent-fn-child-regime.ts`,
alongside the `./helpers/real-subagent-spawn` imports this file already
takes for its other launch/drive/reap plumbing, is the path PTQ-0709's own
fix already established for the shared helper.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or a listed
  gate kin; not a pinned-count/inventory gate.
- Recording-double check: `reportOf` is a type-narrowing guard that throws
  loudly on a shape mismatch, not a recording double backing a "never
  called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "reportOf"
  docs/bugs/0172*.md docs/bugs/0337*.md` → 0 hits in either; neither bug
  document this file's own header cites (bug 0172, and bug 0337 by
  cross-reference) names `reportOf` as a pinned witness artefact.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-boundary-theta-callable" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` in it — only that the local `reportOf` import the
  already-exported, already-canonical helper — so no citation is affected.
- Duplicate-topic check: `grep -rl "reportOf" quality/issues quality/intake
  quality/resolved` → only the resolved `PTQ-0709-06-reportof-narrowing-
  helper-duplicated.md`, whose `locations` field names
  `tests/subagent-invoke-inbound-enum-tag.test.ts` and
  `tests/subagent-invoke-nonfinite-return-refusal.test.ts` only — neither is
  this review's in-scope file. PTQ-0709's own body lists this file among
  "five siblings" surfaced by its pattern-wide search but did not file it as
  a location, and its fix (evidenced by the now-existing canonical export at
  `tests/helpers/subagent-fn-child-regime.ts:146`, added after this file's
  last touch per `git log`) left this file's copy unmigrated — a distinct,
  unfiled "not migrated" instance of the same root cause at this file.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/inbound-boundary-theta-callable.test.ts:182-190 and tests/helpers/subagent-fn-child-regime.ts:146-154, mktemp `diff` of the extracted bodies (`export` stripped) is empty, the local copy is live (sole call at :259), the file imports nothing from subagent-fn-child-regime (imports at :84-98 are real-subagent-spawn/vitest/node/subagent-launcher only); `grep -rn reportOf src extensions tools tests` → exactly one export (:146), two importers (PTQ-0709's two files) and five remaining local copies incl. this one; coverage-matrix → 0, docs/bugs 0172/0337 → 0; D7 boilerplate-duplication in tests/ only, no gate/recording-double/red-test carve-out bites, no merge/rename/delete proposed; not a duplicate — fixed PTQ-0709's locations are only the two subagent-invoke-* files and the same-wave sibling d7-03 covers inbound-union-arm-dispatch + invoke-prompt-cell-enum-return, disjoint from this file; one FP-check inaccuracy noted for the record: the export landed cc0a8fe7 (2026-09-18 00:23) and this file was touched TWICE afterwards (0ff0ccb3 09:29, b2555372 10:54) without migrating — the opposite of "added after this file's last touch", which only strengthens the not-migrated claim (triage: claude-fable-5-1)
