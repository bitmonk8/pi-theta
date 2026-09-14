---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: patchSystemTemplateForImports bundles the value-driven validity walk with the static-container sidecar carry in one 303-line function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-system-template-patch.ts:72-374
  - src/extension/import-system-template-patch.ts:124-249
  - src/extension/import-system-template-patch.ts:250-370
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-system-template-patch.ts#patchSystemTemplateForImports # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260914091051
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# patchSystemTemplateForImports bundles the value-driven validity walk with the static-container sidecar carry in one 303-line function

## Observation
`src/extension/import-system-template-patch.ts` is 374 LOC (band exempt at the file level:
under 600). The file was created by `PTQ-0304`'s ratified Seam B (commit `6a68f58c`) as a
verbatim, single-block move of the `system:` template load-phase wire-rename patch out of
`checkThetaImports`. `patchSystemTemplateForImports` (72-374, 303 LOC, function band
strong) is 81% of the file and its only substantial declaration (1 src / 0 test importers
per the map). The move itself was ratified as "no logic edits" over the block moved
"whole" — the function's own internal shape was never independently assessed, because
inside `checkThetaImports` its 303 LOC were folded into that function's 1402-LOC total and
never separately crossed the 200-LOC function threshold in its own right.

## Evidence
The function's header comment (1-12) names one delivery ("re-walks each already-parsed
template PATH part … refusing a step that names no real field and … replacing the part's
`InterpolationType`"), but the body is two sequential loops over the same `originalParts`
array, gated by opposite readings of the same discriminant (`part.valueDriven`):

| concern | members | lines | LOC |
|---|---|---|---|
| shared setup (guard, `systemSourceFile`/`systemRange`/`paramTypeSourceByName`/`originalParts`) | — | 72-123 | 52 |
| bug 0422/0423 route (a) — path/rename validity walk over VALUE-DRIVEN parts, bare-param wire-rename patch | first `for (let partIndex...)` loop | 124-249 | 126 |
| bug 0445 route (a) — static-container sidecar carry (`array<Import>` face + nested body-schema face) over STATIC parts | second `for (let partIndex...)` loop, `appBodyTypes` | 250-370 | 121 |
| return | `return patchedParts;` | 371-374 | 4 |

Loop 1's guard admits only value-driven parts (124-127):
```ts
    for (let partIndex = 0; partIndex < originalParts.length; partIndex++) {
      const part = originalParts[partIndex] as SystemTemplatePart;
      if (part.kind !== "path" || part.valueDriven !== true) {
        continue;
      }
```
Loop 2's guard explicitly EXCLUDES value-driven parts (265-269 — the comment at 250 states
this in prose: "the STATIC container positions the bug-0423 bare-root valueDriven patch
above EXCLUDES"):
```ts
    const appBodyTypes = collectBodyTypes(input.body.statements, input.sourcePath).bodyTypes;
    for (let partIndex = 0; partIndex < originalParts.length; partIndex++) {
      const part = originalParts[partIndex] as SystemTemplatePart;
      if (part.kind !== "path" || part.valueDriven === true || part.segments.length !== 1) {
        continue;
      }
```
Both loops close over the same 5 setup bindings (`systemSourceFile`, `systemRange`,
`paramTypeSourceByName`, `originalParts`, `patchedParts`) plus 3 parameters
(`importedSchemaShapes`, `importedEnums`, `diagnostics`) — 8 shared bindings — but because
the loops act on disjoint, guard-partitioned subsets of `originalParts` and only compose
through the plain return value `patchedParts`, running them as two sequential statements
(`patchedParts = patchValueDrivenParts(...); patchedParts = patchStaticContainerParts(...,
patchedParts);`) changes nothing observable.

## Why this is a problem
Function band strong (303 LOC, threshold 200) — the presumption of breakdown stands only
against a strong concrete reason. Reasons considered:
- Single algorithm with shared local state: concrete (8 shared bindings, over the "6 or
  more" bar) — sufficient for the justify band alone, but the strong band requires concrete
  PLUS one of four extras, and none applies here: (a) no spec-cited invariant makes this one
  critical section — the two loops run over disjoint, guard-partitioned subsets of
  `originalParts` (shown above) with no data or ordering dependency between them, so
  splitting them into two sequentially-called functions threading `patchedParts` as a
  return-and-reassign value would interleave nothing observable; (b) no measured-cost
  citation exists anywhere in the file; (c) `git log --oneline --follow --
  src/extension/import-system-template-patch.ts` shows exactly 1 commit (its creation) — no
  prior split was reverted; (d) `quality/exemptions.json` carries no entry for this host,
  and `PTQ-0304`'s ratification addressed only the cross-module move of the block as a
  whole ("Code moved verbatim … no logic edits"), never this function's own two-loop
  internal shape as its own threshold question.
- Closed-enumeration dispatch: the two "routes" (bug 0422/0423 vs bug 0445) are two
  sequential passes, not arms of one dispatch selected by a discriminant at one site.
- Data-only module/type family: the function is executable orchestration (two walks plus
  patches), not tables or type declarations.
- One grammar production family: not applicable — a load-phase compose-pass check, not a
  parser production.
- Generated code: no `@generated`/`DO NOT EDIT` marker (grepped).

## Suggested direction (non-binding, optional)
Unproven; the human ratifies the actual split.
- Seam A: split the two loops at their existing boundary (124-249 / 250-370) into two
  module-local functions taking the same setup bindings as explicit parameters and
  returning the (possibly still-`undefined`) patched-parts array, called in sequence by
  `patchSystemTemplateForImports` exactly where the two loops run today -> hypothesis names
  `patchValueDrivenParts` / `patchStaticContainerParts` - 0 exported symbols moved (both
  stay file-private), 0 external importers (src/tests); cross-references back into the
  host: both read `importedSchemaShapes`/`importedEnums`/`diagnostics` and the shared setup
  bindings, passed explicitly instead of closed over.

## False-positive check
Band: strong (function LOC 303, threshold 200). Reasons-considered: listed above with the
evidence that defeated each (disjoint guard-partitioned loops with no interleave hazard, no
measured cost, no reverted split, the on-record ruling covers only the cross-module move —
not this internal shape, not a closed dispatch, no type/table content, not a parser
production, no generated-code marker). Exemptions check: `quality/exemptions.json` grepped
for `import-system-template-patch.ts` — no entry. Generated-code check: grepped for
`@generated`/`DO NOT EDIT`/`autogenerated` — no hits. Spec-mirror check: the file's own
header cites bug 0422/0423/0450 (route a) and the body separately cites bug 0445 (route a)
as a DIFFERENT route over DIFFERENT template positions — two distinct bug citations, not
one spec clause naming a single combined procedure. Prior-finding check: grepped
`quality/issues` + `quality/resolved` + `quality/intake` for `patchSystemTemplateForImports`
and `import-system-template-patch` — the only hit is `PTQ-0304` (confirmed, fixed), which
ratified moving this block OUT of `checkThetaImports` as one unit and did not address the
resulting file's own function-level size, since that question did not exist before the move
(the block's 303 LOC were folded into `checkThetaImports`'s 1402-LOC total, never
separately at or over the 200-LOC function threshold in its own right).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces (size-scan confirms the file at 374 LOC/exempt and patchSystemTemplateForImports at 72-374/303 LOC/strong, 1 src/0 test importers; both cited loop excerpts match verbatim at 124-128/265-269; the loops are genuinely guard-partitioned on `part.valueDriven` over immutable `originalParts` with no ordering dependency; git log shows the single creation commit, no quality/exemptions.json entry, no generated-code marker, and the PTQ-0304 "no logic edits" quote is accurate) but the load-bearing "8 shared bindings, over the 6 or more bar" claim is wrong — only 4 (originalParts, paramTypeSourceByName, importedSchemaShapes, patchedParts) are actually referenced by both loops; systemSourceFile/systemRange/importedEnums/diagnostics are used exclusively inside the first loop (124-247, grep-confirmed absent from 250-370), putting the true count under the design doc's own ≥6-shared-locals bar for even a "concrete" reason — correcting this only weakens the keep-whole case further, so it doesn't refute the filing; D9 breakdown caps at questionable regardless, target shape is a human ruling (triage: claude-opus-5)
