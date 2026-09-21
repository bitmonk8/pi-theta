---
id: pending
title: wire-form-outbound.ts redeclares encodePointerSegment identically to the export of schema-lowering.ts, a module it already imports
lens: D8
status: intake
verdict: pending
locations:
  - src/runtime/wire-form-outbound.ts:12-14
  - src/parser/schema-lowering.ts:665-668
  - src/runtime/wire-form-depth-walk.ts:45-47
sites: 2
fix_scope: cross-module
d8_class: reimplemented
d8_host: src/runtime/wire-form-outbound.ts#encodePointerSegment
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# wire-form-outbound.ts redeclares encodePointerSegment identically to the export of schema-lowering.ts, a module it already imports

## Observation
`src/runtime/wire-form-outbound.ts` declares and exports `encodePointerSegment`, an RFC 6901 JSON Pointer segment escaper. `src/parser/schema-lowering.ts` already exports a function of the same name with a byte-identical body, and `wire-form-outbound.ts`'s first import statement is from that very module. `src/runtime/wire-translation.ts` then imports the redeclared copy from `wire-form-outbound.ts` (line 90), so the duplicate export has downstream consumers of its own. A third in-shard copy, the private `escapePointerToken` in `src/runtime/wire-form-depth-walk.ts:45-47`, has the same body under a different name.

## Evidence
The facility's own location — `src/parser/schema-lowering.ts:665-668`, exported, with 3 importer modules per the grep below:

```ts
/** Encode an RFC 6901 JSON Pointer segment (`~`→`~0`, `/`→`~1`). */
export function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
```

The reimplementation — `src/runtime/wire-form-outbound.ts:8-14`, in a file whose import list already names `../parser/schema-lowering`:

```ts
import { type SchemaSidecar } from "../parser/schema-lowering";
import { isResultValue, type ThetaValue } from "./value";

/** Encode an RFC 6901 JSON Pointer segment (`~`→`~0`, `/`→`~1`). */
export function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
```

The in-shard private copy — `src/runtime/wire-form-depth-walk.ts:45-47`:

```ts
/** RFC-6901 JSON Pointer reference-token escaping: `~` → `~0`, `/` → `~1` (mirrors `depth-walk.ts`'s own escaping). */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}
```

Feature-for-feature comparison: all bodies are the identical two-`replace` expression; every call site (schema-lowering.ts:628; system-param-types.ts:135,231,295; import-system-template-patch.ts:384; wire-form-outbound.ts:111; wire-translation.ts:395; wire-form-depth-walk.ts:81) passes a string key/segment and interpolates the result into a JSON Pointer — no site needs anything the canonical export does not provide.

Search used: `grep -rn "escapePointerToken\|encodePointerSegment" src/` — 23 hits, of which the declaration sites are schema-lowering.ts:666 (exported), wire-form-outbound.ts:12 (exported, this filing), wire-form-depth-walk.ts:45, depth-walk.ts:133, enum-tag-carriage.ts:52, subagent-wire-form.ts:95 (the last three are outside this shard and are routed to D4 as a private-copy clone group, not counted here).

## Why this is a problem
The RFC 6901 escaping rule now has two independent exported definition sites, and one of them lives in a module that already imports from the other's home. A change to the escaping rule (or a bug fix to it) made at one export does not reach consumers of the other: `wire-translation.ts` resolves the copy in `wire-form-outbound.ts`, while `system-param-types.ts` and `import-system-template-patch.ts` resolve the copy in `schema-lowering.ts`. Nothing in either file's header claims the redeclaration is deliberate; `wire-form-outbound.ts:5` describes its copy only as one of "the two shared stateless helpers", without noting the parser-side export it shadows.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `wire-form-outbound.ts` could import `encodePointerSegment` from `../parser/schema-lowering` (already in its import list) and re-export it for `wire-translation.ts`, deleting its local body; `wire-form-depth-walk.ts` could do the same for its private `escapePointerToken`. Whether the runtime→parser import direction is acceptable for a value (not just a type) import is not verified here; if it is not, the helper's single home may belong in a leaf module instead.

## False-positive check
- Reference search: grep above; every declaration and call site listed; no dynamic/string-keyed access to either symbol found.
- Exemption check: D8 exemptions for this lens name only `src/discovery/discovery-walk.ts#enumerateDirectory` and `src/extension/production-theta-producer.ts#firstAdmittingArmProperties` — neither host matches.
- Pending-candidate check: no filed issue or intake candidate names pointer-segment escaping (searched issue list for "pointer"/"escape" — no hit).
- Spec check: schema-subset.md fixes the RFC 6901 escaping rule itself, not the number of definition sites; consolidating drops no spec-required behaviour.
- D2-precedent check: both exports are alive with live importers, so no dead-export claim is made; the finding is one-facility-two-homes, not cruft.
- Deliberate-seam check: wire-form-outbound.ts:1-6's header explains why the helpers live there for the inbound/outbound split, but states no reason for redeclaring rather than importing the parser-side export it duplicates; depth-walk.ts's copy predates the split and is private.

## Triage
verdict: questionable — accounting verified: all three excerpts byte-exact at the cited lines (schema-lowering.ts:665-668 exported, wire-form-outbound.ts:11-14 exported, wire-form-depth-walk.ts:45-47 private); grep reproduces 6 declaration sites and every listed call site (schema-lowering 628; system-param-types 135/231/295; import-system-template-patch 384; wire-form-outbound 111; wire-translation 395 via the wire-form-outbound import at line 90); the canonical export covers every need (identical two-replace body, all callers pass a string segment into a pointer template); a runtime→parser VALUE import already exists (inbound-boundary.ts:22 imports buildInboundTranslationPlan from schema-lowering), so the direction concern is moot; no D8 exemption for either host; no spec clause fixes the number of definition sites; not a duplicate — PTQ-1171 (resolved) created wire-form-outbound.ts and its "re-exported or duplicated" note concerned wire-translation's copy, not schema-lowering's, and the escapePointerToken private clones (depth-walk/enum-tag-carriage/subagent-wire-form/wire-form-depth-walk) were routed to D4 (REVIEW_LOG:552) but have no filed issue; which module is the single home is a design decision for a human ruling (triage: claude-fable-5-1)
