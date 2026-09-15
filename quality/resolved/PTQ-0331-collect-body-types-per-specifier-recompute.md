---
id: PTQ-0331
title: checkThetaImports recomputes collectBodyTypes over the same resolved library once per schema-importing specifier in one import statement
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1228
  - src/extension/import-static-checks.ts:1246-1247
  - src/extension/import-static-checks.ts:1296
  - src/extension/import-static-checks.ts:1312
  - src/extension/import-static-checks.ts:1429-1441
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/import-static-checks.ts#checkThetaImports # D8 only: the exemption key
wave: qw20260914091051
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# checkThetaImports recomputes collectBodyTypes over the same resolved library once per schema-importing specifier in one import statement

## Observation
Inside `checkThetaImports`'s per-decl loop (`for (const decl of importDecls)`,
line 1228), the resolved library's parsed body (`parsed`, hence
`parsed.document.body.statements`) and `resolvedPath` are both fixed once per
`decl` (line 1246-1247) and do not vary across that decl's specifiers. The
inner loop (`for (const specifier of specifiers)`, line 1312) nonetheless
calls `collectBodyTypes(parsed.document.body.statements, resolvedPath)` fresh,
with no cache, every time a specifier's directly-matched declaration is a
`schema` (`if (schemaDecl !== undefined)`, line 1437) — so an `import { A, B }
from "./types.thetalib"` naming two schemas from the same library runs this
whole-library scan twice for byte-identical inputs, and a decl naming N
schemas runs it N times.

## Evidence

**The outer per-decl loop fixes `resolvedPath`/`parsed` once —
import-static-checks.ts:1228, 1246-1247:**
```ts
  for (const decl of importDecls) {
```
```ts
    const resolvedPath = load.resolvedPath;
    entryResolvedPaths.push(resolvedPath);
```

**The inner per-specifier loop, one iteration per imported name from the
SAME decl — import-static-checks.ts:1296, 1312:**
```ts
    const specifiers = decl.specifiers;
```
```ts
    for (const specifier of specifiers) {
```

**The recompute, inside the inner loop, gated only on this specifier's OWN
schema match (`schemaDecl`, itself re-found per specifier, but re-finding is
necessarily specifier-dependent — the redundancy below is not) —
import-static-checks.ts:1429-1441:**
```ts
      // Bug 0422 route (a): a direct schema match (`schemaDecl`, the find this
      // specifier's own decl loop already made above over
      // `parsed.document.body`) builds the real object shell for the
      // load-phase template revalidation below. `collectBodyTypes` over the
      // LIB's own body gives `toSystemParamType` the lib's own named-type set
      // (nested fields referencing another schema/enum IN THE SAME LIB
      // resolve; a nested import stays `opaque-object`, admitting further —
      // unchanged from the parse-time disposition for that deeper case).
      if (schemaDecl !== undefined) {
        const { bodyTypes: libBodyTypes } = collectBodyTypes(
          parsed.document.body.statements,
          resolvedPath,
        );
        importedSchemaShapes.set(
```

`collectBodyTypes` (`../parser/theta-document.ts:2208-2211`, cited for the
cost-shape claim only) takes exactly `(statements, file)` — the same two
values the per-decl scope already fixed — and its own doc comment describes
it as "Collect the whole-file named-type set" over the passed statements,
i.e. a fresh linear scan of the library's whole top-level declaration list on
every call. Grepping `collectBodyTypes(` in `import-static-checks.ts` returns
exactly one call site (the one quoted above); no cache keyed by
`resolvedPath` or by the statements array sits between the per-specifier loop
and this call.

## Why this is a problem
The value `collectBodyTypes` produces — the resolved library's whole
named-type set — is a pure function of `(parsed.document.body.statements,
resolvedPath)` alone; neither argument depends on `specifier`. The job at this
point in the loop is "build the imported-schema shape map for every schema
this decl imports," which needs the library's named-type set exactly once per
decl (or once per distinct resolved library across the whole pass); the code
instead pays that scan's full cost once per schema-carrying specifier. A
decl grouping several schema imports from one shared types library — an
ordinary way to write `import { Foo, Bar, Baz } from "./types.thetalib"` — pays
the identical scan two or three times over, growing linearly with the number
of schema specifiers sharing one decl rather than staying constant per
resolved library.

## Suggested direction (non-binding, optional)
Unproven hypothesis: hoist the `collectBodyTypes` call to run once per
resolved `decl` (or memoize it in a `Map` keyed by `resolvedPath`, mirroring
this same function's existing `parseCache`/`moduleScopeCache` idiom a few
hundred lines earlier in this file) and read the cached `libBodyTypes` inside
the per-specifier loop instead of recomputing it. A human confirms no
per-specifier variation was intended (this review's own reading found none:
`toSystemParamType(specifier.source, libBodyTypes, new Map())`, the one
consumer, varies only its first argument, `specifier.source`).

## False-positive check
Grepped `collectBodyTypes(` in `import-static-checks.ts`: exactly one call
site (1438-1441), confirming the redundancy is temporal (the same textual
call executed repeatedly across loop iterations) rather than several distinct
call sites. Read the surrounding ~250 lines of `checkThetaImports` to confirm
`resolvedPath` and `parsed` are decl-scoped (assigned once per outer-loop
iteration, at 1246 and 1255, both above the inner `for (const specifier of
specifiers)` at 1312) and are never reassigned inside the inner loop. Checked
for an existing cache: this file already memoizes `parseThetaLib` results via
`parseCache` and library `TypeEnv`s via a sibling function's own
`libraryEnvCache` (`../invoke-static-checks.ts`, a different function) — no
equivalent cache wraps this specific `collectBodyTypes` call, so this is not
an already-solved case read incorrectly. Checked for a stated rationale:
the comment at 1429-1436 explains WHAT `collectBodyTypes` is for and why it is
scoped to the lib's own body (so nested same-lib references resolve); it does
not state a reason the call must repeat per specifier, so the D2/D8
rationale-stated-knob carve-out does not apply. This host function
(`checkThetaImports`) already carries an open/ratified D9 breakdown history
(`PTQ-0304`, ratified for one seam — the `system:` template patch extraction,
since landed as `import-system-template-patch.ts` — with two further seams
explicitly deferred); this filing is a distinct claim about a specific
redundant computation inside the per-specifier loop, not a restatement of the
function's overall size or phase count, and is cross-referenced here as that
distinct claim. No `docs/spec_topics/` clause requires re-deriving the
library's named-type set once per specifier — schema-subset.md's
"transitively imported" language (which this same per-decl block also serves,
via `collectImportedTypeDecls`) is silent on whether the underlying scan may be
shared — so no `challenges_spec` applies.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: resolvedPath/parsed are const per decl (1246/1255) and never reassigned across the inner specifier loop (1312-1447); the sole collectBodyTypes call site in this file (1438-1441, grep-confirmed unique) fires once per schema-matching specifier on byte-identical (parsed.document.body.statements, resolvedPath) args, with no wrapping cache (parseCache/moduleScopeCache here, and invoke-static-checks.ts's libraryEnvCache memoizes a different function); imports.md's grammar (`("," ImportSpec)*`) makes N>1 schema specifiers per decl an ordinary, spec-legal form, not a contrived edge case; the PTQ-0304 cross-reference checks out (Seam B ratified/landed as import-system-template-patch.ts, Seams A/C — including this per-specifier loop — explicitly deferred, so this is a distinct claim); no D8 exemption on this host and no docs/spec_topics clause pins the per-specifier repeat — D8 caps an accurate accounting at questionable, hoisting/memoizing collectBodyTypes per decl is a human design call (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): compute once per resolved library. Inside checkThetaImports' per-specifier loop (import-static-checks.ts, the per-decl loop over one import statement's specifiers), collectBodyTypes for a resolved library is computed the first time a schema-importing specifier of that statement needs it and reused for the statement's remaining specifiers (a local Map keyed by the resolved library path, scoped to the import statement - no module-level cache, no cross-statement sharing). Output identical; tests unchanged. Runs after the D9 lane on import-static-checks.ts (host-lane rule); if PTQ (Seam A of checkThetaImports) has moved the loop into a helper by then, apply the same change inside the helper.
