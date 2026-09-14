---
id: PTQ-0325
title: checkThetaImports recomputes the identical params-field wireName-list expression four times instead of once, for four sibling shadowing checks
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1469-1476
  - src/extension/import-static-checks.ts:1482-1489
  - src/extension/import-static-checks.ts:1495-1502
  - src/extension/import-static-checks.ts:1509-1516
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260914091051
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# checkThetaImports recomputes the identical params-field wireName-list expression four times instead of once, for four sibling shadowing checks

## Observation
`checkThetaImports` (`src/extension/import-static-checks.ts:604-1727`) pushes
the results of four sibling imported-symbol-usage checks
(`checkImportedFnCallArgs`, `checkImportedSchemaCtorFields`,
`checkImportedEnumVariantAccess`, `checkImportedNonCtorTypeNames`) onto its
`diagnostics` array. Each of the four calls passes, as its third argument, the
byte-identical inline expression
`(input.frontmatter?.params?.fields ?? []).map((f) => f.wireName)`, written
out fresh each time rather than computed once and shared.

## Evidence
src/extension/import-static-checks.ts:1469-1476:
```ts
  diagnostics.push(
    ...checkImportedFnCallArgs(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedFns,
    ),
  );
```

src/extension/import-static-checks.ts:1482-1489:
```ts
  diagnostics.push(
    ...checkImportedSchemaCtorFields(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedSchemas,
    ),
  );
```

src/extension/import-static-checks.ts:1495-1502:
```ts
  diagnostics.push(
    ...checkImportedEnumVariantAccess(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedEnums,
    ),
  );
```

src/extension/import-static-checks.ts:1509-1516:
```ts
  diagnostics.push(
    ...checkImportedNonCtorTypeNames(
      input.body,
      input.sourcePath,
      (input.frontmatter?.params?.fields ?? []).map((f) => f.wireName),
      importedNonCtorNames,
    ),
  );
```

Diff verdict: **renamed-only** — the first two arguments
(`input.body`, `input.sourcePath`) and the third argument (the wireName-list
expression) are byte-identical across all four call sites; only the called
function's name and the fourth argument (the per-declaration-kind lookup
map/set: `importedFns` / `importedSchemas` / `importedEnums` /
`importedNonCtorNames`) vary.

Clone-map group **G025** (90 tokens, renamed-only(4)) cites this same repeated
shape as two 21-line windows, `import-static-checks.ts:1469-1489` and
`:1495-1516` — each window itself spans the tail of one call block plus the
whole of the next, so the map's two "sites" already span three of these four
blocks; re-reading the surrounding code shows the same wiring, byte-for-byte,
recurs a fourth time immediately below (block 4, cited above), which the map's
own window boundaries did not happen to pair against a neighbour. All four are
counted here.

`checkImportedFnCallArgs`'s own declaration (`invoke-static-checks.ts:1556`)
confirms the third parameter's role: `paramsFieldNames` feeds
`collectLocalBinderNames(importingBody, paramsFieldNames)`, which implements
"Shadowing outranks import resolution (expressions.md §'Identifier
resolution' arm (1) over arm (3))" per that function's own doc comment — i.e.
this is the SAME shadowing rule each of the four sibling checks must apply
identically. A global search
(`grep -rn "params?.fields ?? \[\]).map((f) => f.wireName)" src`) returns
exactly these four hits and no others anywhere in `src/`.

## Why this is a problem
The four sibling checks share one semantic precondition — a callee name bound
by a frontmatter `params:` field shadows an imported declaration of the same
name, per expressions.md's identifier-resolution arm ordering — and that
precondition is expressed as one specific derivation
(`params?.fields ?? [] → .map(f => f.wireName)`) written out four separate
times rather than computed once and passed to all four calls. This is
load-bearing, not incidental: if a future change to the wireName-derivation
rule (e.g. a filter, a different fallback, or a change to which field
identifies the binder name) is applied at one of these four call sites and
missed at the others — a realistic slip, since nothing marks the four as one
value — the four sibling checks would silently disagree about which names are
shadowed. A callee name legitimately shadowed for, say,
`checkImportedFnCallArgs`'s purposes would then still be treated as an
unshadowed imported symbol by `checkImportedEnumVariantAccess`, producing an
inconsistent, un-spec'd false emission or a missed one for one callee kind but
not its siblings — the "arm (1) over arm (3)" rule failing to hold uniformly
across the four declaration kinds it is meant to cover identically. The
comment above each of blocks 2–4 already states in prose that each is "the
same wiring shape as" the block before it, so the repetition is not
unnoticed — the code narrates the duplication without eliminating it.

## Suggested direction (non-binding, optional)
The natural shared home (hypothesis) is a single local binding inside
`checkThetaImports` itself — e.g. compute the wireName list once, above the
first of the four pushes, and pass that one reference into all four calls, so
a future change to the derivation is made in one place these four checks all
read from.

## False-positive check
- Re-verified the clone-map's G025 spans (`1469-1489`, `1495-1516`) against
  current file content immediately before filing; both match, and each
  window's own two component blocks match the excerpts above verbatim.
- Pattern search: `grep -rn "params?.fields ?? \[\]).map((f) => f.wireName)" src`
  returns exactly the four lines cited (1473, 1486, 1499, 1513) and no
  occurrence outside `import-static-checks.ts` — the duplication is fully
  contained in this one file/function, not spread thinner across the
  codebase.
- Both copies (all four) are live: each feeds a `diagnostics.push` inside the
  function `checkThetaImports` actually returns from, called by the
  production compose pass — not a dead branch (a D2 concern would not apply).
- Not a spec-repeated vector: expressions.md states the shadowing rule once;
  the four call sites are four independent code invocations of one derived
  value, not four independent spec citations of four different facts.
- Not tests/, not generated: `src/extension/import-static-checks.ts` is a
  hand-authored production module.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four call-site excerpts reproduce verbatim at the cited lines; `clone-scan.mjs map` reproduces G025 (90 tokens, renamed-only(4)) at exactly 1469-1489/1495-1516 (together the two windows already span all four blocks, contra the filing's own "three of four" framing, though all four sites are still correctly and independently cited/verified); the four checkImported* siblings (invoke-static-checks.ts:1556/1721/1820/1921) share the identical paramsFieldNames -> collectLocalBinderNames shadowing contract, and checkThetaImports is live via production-composition.ts:1205/2972 — a real, mechanical, in-scope clone, distinct root cause from PTQ-0319 and the sibling D8 filing (both target the callee-side collectCallSites/collectLocalBinderNames walk redundancy, not this call-site expression) (triage: claude-opus-5)
