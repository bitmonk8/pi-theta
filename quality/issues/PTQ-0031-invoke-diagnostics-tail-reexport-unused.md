---
id: PTQ-0031
title: invoke-diagnostics.ts re-exports five type-compat names (checkCompatible, displayType, CompatType, TypeEnv, CompatSite) that no file imports through it
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/invoke-diagnostics.ts:644-648
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# invoke-diagnostics.ts re-exports five type-compat names (checkCompatible, displayType, CompatType, TypeEnv, CompatSite) that no file imports through it

## Observation
The last statement block of src/parser/invoke-diagnostics.ts re-exports two
values and three types from `./type-compat`, with a comment saying consumers
"(and the V15f-T tests) reference one import site". No file in the repository
imports any of those five names from invoke-diagnostics; every importer of the
module names only its own checkers, codes, message builders, hints, and
`InvokeArgSlot`. The V15f-T test file the comment names imports the three types
directly from type-compat.

## Evidence
src/parser/invoke-diagnostics.ts:644-648 — the re-export tail:

```ts
// Re-export the compatibility helpers the checkers compose with, so consumers
// (and the V15f-T tests) reference one import site. Kept as type-only for the
// model types and value for the relation helpers.
export { checkCompatible, displayType };
export type { CompatType, TypeEnv, CompatSite };
```

Importer census — grep `from ".*invoke-diagnostics"` across src/, extensions/,
tools/, tests/ (8 hits, all enumerated):

- src/extension/production-composition.ts:136 — `checkCalleeHasErrors, checkInvokeExtension`
- src/extension/subagent-fn-static-checks.ts:36 — `checkCalleeHasErrors`
- src/extension/invoke-static-checks.ts:77-83 — `checkFnCallArity, checkInvokeArity, checkInvokeCall, checkCalleeHasErrors, type InvokeArgSlot`
- src/parser/callable-set.ts:37 — `checkInvokeExtension`
- src/parser/type-layer-checks.ts:105 — `checkFnCallArity, checkInvokeReturnType`
- tests/b0362-case-variant-invoke-cycle-edge.test.ts:11 — `CALLEE_HAS_ERRORS_CODE`
- tests/invoke-diagnostics.test.ts:4-24 — codes, hints, message builders, checkers
- tests/subagent-fn.test.ts:82-85 — `CALLEE_HAS_ERRORS_CODE, calleeHasErrorsMessage, checkCalleeHasErrors`

None names `checkCompatible`, `displayType`, `CompatType`, `TypeEnv`, or
`CompatSite`. The named beneficiary imports them elsewhere —
tests/invoke-diagnostics.test.ts:3:

```ts
import type { CompatSite, CompatType, TypeEnv } from "../src/parser/type-compat";
```

## Why this is a problem
A re-export nothing imports through — the named D2 smell "re-export files
nothing imports through" applied to a re-export block. Its stated purpose (one
import site for consumers and the V15f-T tests) is contradicted by the current
code: the enumerated import census shows zero uses of the alias path, and the
test the comment cites goes to `type-compat` directly. Git shows the block is
unrevised scaffolding from the tests-task commit (`74755f5a V15f-T`); no later
commit added a consumer.

## Suggested direction (non-binding, optional)
Delete the two re-export statements and their comment; the module's own imports
of `checkCompatible` and `displayType` (used by the checkers) are unaffected,
and existing importers already reference type-compat directly where they need
the model types.

## False-positive check
- Import census: grep `from ".*invoke-diagnostics"` over src/, extensions/,
  tools/, tests/ — 8 hits, each import list read in full (cited above); zero
  name the five re-exported symbols.
- Namespace/dynamic import: grep `import \* as` filtered for invoke-diagnostics
  — 0 hits; grep `require(.*invoke-diagnostics` — 0 hits.
- Re-export chains: grep `export .* from ".*invoke-diagnostics"` — 0 hits, so
  no barrel forwards the alias path.
- Test-only-caller check: not even tests import through the alias path (the
  V15f-T test imports the types from type-compat, :3), so the witness-test
  carve-out does not protect it — the re-export is unreached everywhere.
- Git-history intent: `git log -S 'export { checkCompatible, displayType }'` on
  the file — single commit `74755f5a` (V15f-T tests-task).
- Distinctness check: the module's own USE of `checkCompatible`/`displayType`
  (imported at :61-68, called in checkers) is alive and untouched by this
  finding; only the tail re-export block at :644-648 is claimed dead.

## Triage
verdict: confirmed — excerpt verbatim at :644-648; independent multiline-aware scan of src/, tests/, tools/, extensions/, config/, skills/ finds 0 imports of the five names through invoke-diagnostics (all 8 importers read in full; no namespace/require/dynamic import, no `export * from`, no string-keyed access), the named V15f-T test imports the types from type-compat at :3, and `git log -S` shows the block unrevised since 74755f5a. (triage: claude-opus-5)
