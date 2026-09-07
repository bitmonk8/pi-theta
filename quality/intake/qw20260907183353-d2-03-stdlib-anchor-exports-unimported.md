---
id: pending
title: stdlib-arg-diagnostics.ts exports six code/message/hint anchors that nothing anywhere imports
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/stdlib-arg-diagnostics.ts:41
  - src/parser/stdlib-arg-diagnostics.ts:44
  - src/parser/stdlib-arg-diagnostics.ts:52-59
  - src/parser/stdlib-arg-diagnostics.ts:65-73
  - src/parser/stdlib-arg-diagnostics.ts:76-77
  - src/parser/stdlib-arg-diagnostics.ts:80-81
sites: 6
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# stdlib-arg-diagnostics.ts exports six code/message/hint anchors that nothing anywhere imports

## Observation
The module exports two diagnostic-code constants, two message-builder functions, and two hint constants alongside `checkStdlibMethodCall`. The only import of this module anywhere in the repository is `checkStdlibMethodCall` (src/parser/type-layer-checks.ts:95). The six anchors are consumed solely inside the module by `checkStdlibMethodCall` itself; their `export` surface reaches nothing — not src/, not extensions/, not tools/, and not tests/. The one test that asserts on the arity code re-declares the string as its own local constant instead of importing the export.

## Evidence
src/parser/stdlib-arg-diagnostics.ts:41-44 — the two exported codes:
```
export const STDLIB_ARITY_MISMATCH_CODE = "theta/parse/stdlib-arity-mismatch";

/** `theta/parse/stdlib-arg-type-mismatch` (code-registry-parse.md; bug 0315). */
export const STDLIB_ARG_TYPE_MISMATCH_CODE = "theta/parse/stdlib-arg-type-mismatch";
```
src/parser/stdlib-arg-diagnostics.ts:52-59, :65-73 — the two exported message builders (`stdlibArityMismatchMessage`, `stdlibArgTypeMismatchMessage`); :76-81 — the two exported hints (`STDLIB_ARITY_MISMATCH_HINT`, `STDLIB_ARG_TYPE_MISMATCH_HINT`).

Sole import of the module anywhere (`grep -rn 'from ".*stdlib-arg-diagnostics"'` over the whole repo):
```
src/parser/type-layer-checks.ts:95: import { checkStdlibMethodCall } from "./stdlib-arg-diagnostics";
```
The only external mention of any anchor name (`grep -rn "STDLIB_ARITY\|STDLIB_ARG_TYPE\|stdlibArity\|stdlibArgType"` over src/, tests/, tools/, extensions/) outside this module is a local re-declaration, not an import — tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts:64:
```
const STDLIB_ARITY_MISMATCH_CODE = "theta/parse/stdlib-arity-mismatch";
```
Internal consumption is complete inside the module: :144-148, :178-188, :207-217 build the diagnostics from the codes, builders and hints.

## Why this is a problem
Dead export surface: an export nothing imports through is unreachable public API. The symbols themselves are alive (used by `checkStdlibMethodCall` in the same file), so the cruft is precisely the six `export` modifiers, which advertise an anchor-import contract no consumer took up. The sibling anchor module in the same directory shows the pattern these exports were presumably written for actually being used — tests/system-interpolation.test.ts:3-17 imports that module's codes and messages directly — while here the one witness test re-declares the literal locally, leaving the export surface with zero importers.

## Suggested direction (non-binding, optional)
Either de-export the six anchors (keeping them module-internal), or have the witness test import them instead of re-declaring the code string — whichever the repo's diagnostic-anchor convention prefers.

## False-positive check
- Reference searches: `grep -rn 'from ".*stdlib-arg-diagnostics"'` across the repo → one hit (type-layer-checks.ts:95, `checkStdlibMethodCall` only). `grep -rn "STDLIB_ARITY|STDLIB_ARG_TYPE|stdlibArity|stdlibArgType"` across src/, tests/, tools/, extensions/ → only this module plus the live test's local `const` re-declaration (b0315live-stdlib-arg-refusal.test.ts:64), which does not import.
- Re-export check: `grep -rn "export \*" src` → no barrel re-exports exist anywhere in src/, so nothing re-exports these names.
- Dynamic access check: the constants are top-level module bindings, not object properties; no string-keyed access path to a module export exists in the repo (no `import(...)` of this module found).
- Test-only-caller rule: does not apply — not even tests import these six exports; the code bodies remain alive through their internal callers, so this finding names only the export modifiers, not the declarations.

## Triage
