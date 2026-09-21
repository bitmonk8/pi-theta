---
id: pending
title: parseParams runs six sequential phases (sink setup, per-field type pass, collision emission, ordering check, per-field default pass, schema assembly) in one 352-LOC body
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/params.ts:158-509
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/params.ts#parseParams
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# parseParams runs six sequential phases (sink setup, per-field type pass, collision emission, ordering check, per-field default pass, schema assembly) in one 352-LOC body

## Observation
`parseParams` (src/parser/params.ts:158-509, 352 LOC, strong band) parses a `params:` block: it lowers each field's type RHS, emits slug-collision diagnostics, enforces the non-trailing-default ordering rule, checks each default against the literal sublanguage and declared-type compatibility, and assembles the lowered AJV schema. The phases communicate through append-only sinks declared at the top.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| sink setup | 163-192 | 30 | writes diagnostics, bodyTypeMap, properties, required, defs, inlineCanonical, inlineFragments, slugCollisions, collisionSites, typeRefused |
| per-field type pass loop | 193-324 | 132 | reads bodyTypeMap; writes diagnostics, properties, required, defs, inlineCanonical, inlineFragments, slugCollisions, collisionSites, typeRefused |
| slug-collision emission | 326-336 | 11 | reads collisionSites; writes diagnostics |
| non-trailing-default ordering | 338-356 | 19 | reads fields; writes diagnostics, seenDefault |
| per-field default pass loop | 358-491 | 134 | reads fields, typeRefused, defaultCompatEnv; writes diagnostics |
| lowered-schema assembly | 493-509 | 17 | reads diagnostics, properties, required, defs |

src/parser/params.ts:326-336 (phase boundary — the collision phase reads only what the type pass appended):

```ts
  for (const collision of collisionSites) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/schema-slug-collision",
      file: site.file,
      range: collision.range,
      message: `schema-slug collision on slug ${collision.slug}: two distinct inline schemas hash alike`,
    });
  }
```

The default pass (358-491, 134 LOC) reads only `fields`, `typeRefused`, and `site`, and appends to `diagnostics` — a two-value seam.

## Why this is a problem
Strong band (352 LOC ≥ 200): presumption of breakdown, not filed only on a strong concrete reason. Reasons considered and defeated: (a) single algorithm with shared local state — the type-pass loop does share ~9 locals internally, but six of them are already bundled in the existing `LowerCtx` state object (built at 202-212), and the natural phase boundaries thread far fewer: the ordering check reads only `fields`; the default pass reads only `fields` + `typeRefused` + `site`; the collision phase reads only `collisionSites` — under the 6-local bar at every seam; (b) closed-enumeration dispatch — the body is a phased pipeline, not a switch mirroring a spec set; (c) spec-cited ordered critical section (strong) — diagnostics must appear in source order, but each phase appends whole arrays in phase order, so a helper returning `Diagnostic[]` interleaves nothing observable; (d) no exemption, no measured cost, no reverted split, not generated.

## Suggested direction (non-binding, optional)
Hypotheses, unproven. Seam A: the per-field default pass (358-491) -> `checkParamsDefaults(fields, typeRefused, site): Diagnostic[]` (hypothesis) — 134 LOC, no exported symbols moved, no external importers, one call back from the host. Seam B: the per-field type pass loop body (193-324) -> `lowerParamsField(field, lowerCtx, site)` returning its diagnostics plus the refusal verdict (hypothesis) — ~130 LOC, state already carried by the existing LowerCtx plus the collision-site attribution. Seam C: the ordering check (338-356) -> `checkTrailingDefaults(fields, site)` (hypothesis) — 19 LOC, pure.

## False-positive check
Band: strong per the authoritative map (352 LOC). Reasons-considered list recorded above with defeating evidence. Exemptions check: no D9 key for src/parser/params.ts#parseParams in quality/exemptions.json. Generated-code check: hand-written. Spec-mirror check: the doc comment (117-157) enumerates the codes raised, but they are raised across separate phases, not as arms of one spec-named closed switch. Ranges re-read before filing (158-509 in full).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces parseParams at 158-509 / 352 LOC / strong band (FN strong ≥ 200); every cited excerpt matches at the cited lines; the phase inventory is real (type-pass loop 193-324, collision emission 326-336, ordering check 338-356, default pass 358-491, assembly 493-509 — the "sink setup" row is declarations, not a concern, but five distinct phases remain); the shared-locals reason does not defeat it since the cross-phase seams thread ≤3 values each (collisionSites; fields; fields+typeRefused+site) and the type-pass state is already carried by LowerCtx (bodyTypeMap, defs, inlineCanonical, inlineFragments, slugCollisions, unspellable); the doc's "source order" claim is per-phase append order so a Diagnostic[]-returning helper preserves it; no exemption row for params.ts in quality/exemptions.json; no prior D9 issue on this function (sibling intake d9-01 is the file-level host, a distinct root cause) — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map gives parseParams 158-509 / 352 LOC, FN strong band ≥ 200, no params.ts/parseParams key in quality/exemptions.json; all six inventory ranges match the source (type-pass loop 193-324, collision loop 326-335 excerpt byte-exact, ordering check 338-356, default pass 358-491, assembly 493-509 — the sink-setup row is declarations, leaving five distinct concerns); the ≥ 6-shared-locals reason was checked and does not apply — the six cross-phase values (diagnostics, properties, required, defs, collisionSites, typeRefused) are all type-pass outputs consumed downstream, each seam threads ≤ 3 inputs, and the fieldDiagStart/defaultDiagStart slice gates only inspect same-iteration pushes so a Diagnostic[]-returning helper keeps the phase-append order the doc calls source order; not spec-mirror dispatch, not generated; d9-01 is the module-level host (distinct root cause), PTQ-1118 is a D4 clone on hoistNestedDefs, no D9 issue cites parseParams — the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified with a uniform +1 line drift since filing: size-scan map (manifest = src/parser/params.ts) reports parseParams 159-510 / 352 LOC / band strong (FN strong ≥ 200), `export function parseParams(` at 159 and closing brace at 510; phase boundaries re-pinned at 164-193 declarations, 194-325 type-pass loop, 327-336 collision loop (excerpt byte-exact at 327-335), 339-357 ordering check, 377-492 default pass, 494-510 assembly — five real sequential concerns once the declarations row is discounted; the ≥ 6-shared-locals reason does not defeat it since the six cross-phase values (diagnostics, properties, required, defs, collisionSites, typeRefused) are all type-pass outputs and each downstream seam reads ≤ 3 of them, with the fieldDiagStart/defaultDiagStart slice gates inspecting only same-iteration pushes so a Diagnostic[]-returning helper preserves the phase-append order the doc calls source order; not a spec-table switch, not generated, no `params` key in quality/exemptions.json, git log shows no reverted split; hoistNestedDefs has since moved to schema-defs.ts (commit 71af3b5b) so no D4 overlap remains, sibling d9-01 is the module-level host and d9-03 is lowerTypeExpr — distinct root causes; the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
