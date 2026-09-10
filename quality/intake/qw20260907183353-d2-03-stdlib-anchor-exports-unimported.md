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
verdict: questionable — all six facts reproduce exactly, but un-imported diagnostic-anchor exports are the repo norm (12/19 _HINT exports in src/, plus FN_ARITY_TOO_FEW/TOO_MANY_CODE and fnArity*Message in the header-named mirror invoke-diagnostics.ts, all have zero external refs) and the doc comments make these the citable source for code-registry-parse.md:153-154, so the anchor is convention-preference across ~16 unsurveyed sibling sites rather than proven cruft; a human should rule (triage: claude-opus-5)
verdict: questionable — independently reproduced: six exports at :41/:44/:52/:65/:76/:80 consumed only in-module (:144-148/:178-188/:207-217), sole module importer type-layer-checks.ts:95, no `export *`/re-export/dynamic import, the only external identifier hit is the local re-declaration at b0315live:64 (b0315-stdlib-arg-surface.test.ts:59-60 and b0439:343 likewise pin literals, not imports), and git pickaxe places all six only in creation commit 52712fb3 with no importer ever added or removed — so this is neither a leftover (PTQ-0154) nor an outlier (PTQ-0150): my survey finds 13/22 exported `_HINT`, 7/32 `_CODE` and 5/21 `*Message` anchors in src/parser with zero external refs, the explicitly-mirrored invoke-diagnostics.ts carries the identical un-imported 6-anchor FN_ARITY shape (:86/:89/:179/:192/:220/:224 → :516-532), and the repo's own *Diagnostic message anchors* rule (recovered from 31ff0603) directs tests to the registry rather than module constants, so the anchor is a convention-level export-surface preference spanning ~4 modules rather than proven cruft; a human should rule (triage: claude-opus-5)
verdict: questionable — re-ran every check myself rather than trusting the two prior notes: excerpts byte-exact, sole importer is type-layer-checks.ts:100 today (5-line drift, content exact), and word-boundary greps across src/, tests/, tools/, extensions/ confirm zero external refs to any of the six beyond the b0315live literal re-declaration, with no `export *`, namespace import, or dynamic access; but the anchor overclaims uniqueness — my own count finds 13 of 22 exported `_HINT` constants in src/ have zero external refs, and invoke-diagnostics.ts's FN_ARITY_TOO_FEW/TOO_MANY_CODE + fnArityTooFewMessage/fnArityTooManyMessage + FN_ARITY_TOO_FEW/TOO_MANY_HINT sextet (:85/:88/:178/:191/:219/:223, consumed only at :513-529) is a structurally exact sibling with zero external refs too, under the pervasive *Diagnostic message anchors* rule (cited in 40+ files) that deliberately routes witness tests to the registry instead of these constants — a documented convention, not PTQ-0150's proven narrower-shape outlier; a human should rule (triage: claude-opus-5)
