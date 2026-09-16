---
id: PTQ-0373
title: invoke-static-checks.ts's four checkImported* functions each hand-duplicate the shadowedNames arm-1-outranks-arm-3 guard
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1890-1896
  - src/extension/invoke-static-checks.ts:2033-2045
  - src/extension/invoke-static-checks.ts:2131-2145
  - src/extension/invoke-static-checks.ts:2231-2243
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260916045442
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# invoke-static-checks.ts's four checkImported* functions each hand-duplicate the shadowedNames arm-1-outranks-arm-3 guard

## Observation
`checkImportedFnCallArgs`, `checkImportedSchemaCtorFields`, `checkImportedEnumVariantAccess`
and `checkImportedNonCtorTypeNames` (the four sibling checks `checkThetaImports` runs over an
importing theta's body, per `import-static-checks.ts`) each open their per-node loop with the
identical guard: extract the candidate name, test it against the caller-supplied
`shadowedNames` set, and `continue` on a hit, citing expressions.md's "Identifier resolution"
rule that a locally-bound name (arm 1) outranks import resolution (arm 3). Each of the four
comments explicitly names at least one sibling function as applying "the same test," so the
four are documented as one rule, written out four times.

## Evidence

**checkImportedFnCallArgs — invoke-static-checks.ts:1890-1896:**
```ts
  for (const call of callExprs) {
    if (shadowedNames.has(call.callee)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a call of a locally-bound name is never an imported-`fn` call at this
      // site — the same test `checkFnCallArgs`'s `shadowedNames` arm applies.
      continue;
    }
```

**checkImportedSchemaCtorFields — invoke-static-checks.ts:2033-2045:**
```ts
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (shadowedNames.has(typeName)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a constructor of a locally-bound name never denotes the imported
      // schema at this site — the same test `checkImportedFnCallArgs`
      // applies to its call sites.
      continue;
    }
```

**checkImportedEnumVariantAccess — invoke-static-checks.ts:2131-2145:**
```ts
  for (const access of memberExprs) {
    if (access.target.kind !== "ident") {
      // Only a bare `Ident.field` denotes a possible imported-enum variant
      // access; a member off any other expression shape names no import
      // binding at all.
      continue;
    }
    const enumName = access.target.name;
    if (shadowedNames.has(enumName)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a member access of a locally-bound name never denotes the imported
      // enum at this site — the same test `checkImportedSchemaCtorFields`
      // applies to its constructor sites.
      continue;
    }
```

**checkImportedNonCtorTypeNames — invoke-static-checks.ts:2231-2243:**
```ts
  for (const ctor of objectExprs) {
    if (ctor.typeName === null) {
      // A bare `{ … }` object literal names no schema at all; this route
      // judges named constructor sites only.
      continue;
    }
    const typeName = ctor.typeName;
    if (shadowedNames.has(typeName)) {
      // expressions.md §"Identifier resolution": arm (1) outranks arm (3), so
      // a constructor of a locally-bound name never denotes the imported
      // binding at this site — the same test `checkImportedSchemaCtorFields`
      // applies to its own constructor sites.
      continue;
    }
```

**Diff verdict: renamed-only.** All four follow the identical shape — extract a candidate
name (`call.callee` / `ctor.typeName` / `access.target.name` / `ctor.typeName`), test it
against `shadowedNames`, `continue` with a comment that (a) cites "expressions.md
§'Identifier resolution': arm (1) outranks arm (3)" verbatim, (b) states which import-kind
noun is refused ("a call" / "a constructor" / "a member access" / "a constructor"), and (c)
names a sibling function as applying "the same test." Nothing here diverges — all four
encode the identical precondition with the identical control-flow shape.

**Clone-map group G030** (79 tokens, renamed-only(1)) mechanically caught the second and
fourth excerpts above (`invoke-static-checks.ts:2026-2046` / `:2224-2244` — the map's own
window starts a few lines earlier, at each function's parameter list) — re-verified at those
exact spans, unchanged. The first and third excerpts (`checkImportedFnCallArgs`,
`checkImportedEnumVariantAccess`) carry the identical `shadowedNames.has(...)` guard but sit
behind a differently-shaped preceding line (a bare `call.callee` read and an
`access.target.kind !== "ident"` check, versus the other two's `ctor.typeName === null` +
`typeName` assignment), which is almost certainly why the mechanical scanner's token window
did not pair them with the G030 pair — found instead by reading, per this review's mandate to
hunt duplication the scanner's window can miss. A repo-wide `grep -n "shadowedNames.has("
src/extension/invoke-static-checks.ts` returns exactly these four hits and no others.

## Why this is a problem
All four copies exist to enforce one spec clause — expressions.md's identifier-resolution arm
ordering — over four different declaration kinds (imported `fn`, `schema`, `enum`, and
non-brace-constructible names). This is load-bearing, not incidental: if the rule changes
(a new arm inserted between (1) and (3), or a change to what counts as a "locally-bound
name" — the very thing `collectLocalBinderNames` computes) and the change reaches one copy
but is missed on another, the four sibling checks would silently disagree about which callee
names are shadowed — a name legitimately shadowed for one declaration kind would still be
treated as importable for a sibling kind, producing an inconsistent, un-spec'd false emission
for one and a missed one for another. This is not a hypothetical risk class in this exact
function family: this file's own history already centralised two other pieces of these same
four functions' shared state for the identical reason — `PTQ-0325` (fixed) centralised the
`wireName`-list expression each of the four is called with, and `PTQ-0330` (fixed) centralised
the `collectLocalBinderNames` walk that BUILDS the `shadowedNames` set these four functions
now receive as a parameter. This guard is the remaining piece of that same family that still
duplicates the CONSUMPTION of that shared set, four times, by hand.

## Suggested direction (non-binding, optional)
The natural shared home (hypothesis) is a small module-private predicate inside
`invoke-static-checks.ts` — e.g. a one-line `isShadowedImportName(name, shadowedNames)` — that
all four call in place of the inline `shadowedNames.has(name)` check; if `PTQ-0370`'s ratified
move of these four functions into a new sibling module (`invoke-imported-checks.ts`) lands
first, that new module is an equally natural home for the one predicate. Named as an
observation, not a design.

## False-positive check
- All four excerpts re-read verbatim at the cited lines immediately before filing.
- Clone-map group G030 re-verified at its own cited spans (`2026-2046`, `2224-2244`); both
  match the second and fourth excerpts above exactly.
- `grep -n "shadowedNames.has(" src/extension/invoke-static-checks.ts` returns exactly four
  hits (1891, 2040, 2139, 2238) — no fifth copy, no missed occurrence.
- All four copies are live: each function's sole caller is `checkThetaImports`
  (`import-static-checks.ts`), already confirmed live via production-composition.ts by this
  same file's prior D4/D8 filings (`PTQ-0325`, `PTQ-0330`, `PTQ-0370`) — not a D2 dead-copy
  concern.
- Not tests/, not generated: all four sites are in `src/extension/invoke-static-checks.ts`,
  hand-authored production code with no `@generated`/`DO NOT EDIT` marker.
- Not a spec-repeated normative vector: expressions.md states the identifier-resolution arm
  ordering once; the four sites are four independent CODE invocations of that one rule, not
  four independent spec citations of four different facts.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for
  `shadowedNames`, `checkImportedSchemaCtorFields`, `checkImportedNonCtorTypeNames`, and "arm
  (1) outranks arm (3)" — hits are `PTQ-0050` (dead export, unrelated), `PTQ-0176` (stale
  header roster, unrelated), and `PTQ-0304`/`PTQ-0319`/`PTQ-0325`/`PTQ-0330`/`PTQ-0334`/
  `PTQ-0351`/`PTQ-0370` (D8/D9 size, redundant-walk, and misplacement claims on this same
  four-function family) — none targets this specific per-call guard's duplication; not a
  re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four excerpts verified verbatim at cited lines; clone-scan.mjs reproduces G030 (79 tokens, renamed-only(1)) at exactly 2026-2046/2224-2244, and the other two sites (checkImportedFnCallArgs, checkImportedEnumVariantAccess) independently diffed to the identical shadowedNames.has(name)+"arm(1) outranks arm(3)" guard, missed by the scanner only because a differing preceding line breaks its token window, as claimed; all four call sites are live via checkThetaImports (production-composition.ts:1456,3366); distinct root cause from the same-family fixed PTQ-0325 (call-site argument dedupe) and PTQ-0330 (shared-walk dedupe) and from open PTQ-0370 (placement) — this is the first filing on the consumption-side guard itself (triage: claude-opus-5)
