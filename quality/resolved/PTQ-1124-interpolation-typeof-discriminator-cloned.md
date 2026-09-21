---
id: PTQ-1124
title: interpolation type-of discriminator mirrored in production theta producer
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/system-interpolation.ts:652-671
  - src/extension/production-theta-producer.ts:8155-8174
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# interpolation type-of discriminator mirrored in production theta producer

## Observation
`src/parser/system-interpolation.ts` defines `interpolationTypeOfValue` and `src/extension/production-theta-producer.ts` defines `interpolationTypeOf`. The two functions classify a runtime `ThetaValue` into an `InterpolationType` using the same `if`-chain order and the same returned discriminator objects. The system-interpolation copy's comment explicitly notes that it "mirrors `production-theta-producer.ts`'s `interpolationTypeOf` exactly."

## Evidence
`src/parser/system-interpolation.ts:652-671`:
```typescript
function interpolationTypeOfValue(value: ThetaValue): InterpolationType {
  if (typeof value === "string") {
    return { kind: "string" };
  }
  if (typeof value === "number") {
    return { kind: "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (isEnumValue(value)) {
    return { kind: "enum" };
  }
  if (Array.isArray(value)) {
    return { kind: "array" };
  }
  if (isResultValue(value)) {
    return { kind: "result" };
  }
  return { kind: "object" };
}
```

`src/extension/production-theta-producer.ts:8155-8174`:
```typescript
function interpolationTypeOf(value: ThetaValue): InterpolationType {
  if (typeof value === "string") {
    return { kind: "string" };
  }
  if (typeof value === "number") {
    return { kind: "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (isEnumValue(value)) {
    return { kind: "enum" };
  }
  if (Array.isArray(value)) {
    return { kind: "array" };
  }
  if (isResultValue(value)) {
    return { kind: "result" };
  }
  // A plain object schema value — compact JSON.
  return { kind: "object" };
}
```

Diff verdict: **identical** bodies aside from the function name and the trailing comment in the production-theta-producer copy. Not present in the supplied clone map (likely below the scanner token-window floor).

## Why this is a problem
The QRY-18 canonical stringification table must classify a given runtime value the same way regardless of whether it is rendered through the `system:` frontmatter path or the production query-template path. Two independent copies of the discriminator create drift risk: a new runtime kind, a reordering of the `Result` check, or a change to enum/array handling in one copy would silently break rendering parity.

## Suggested direction (non-binding, optional)
The natural shared home is `src/render/query-render.ts`, which already exports the `InterpolationType` type and the shared `stringifyInterpolatedValue` renderer. Moving the value-to-interpolation-type classifier into that module and importing it from both `parser/system-interpolation.ts` and `extension/production-theta-producer.ts` would give the two render paths one source of truth.

## False-positive check
- Re-read both cited spans immediately before filing; both functions are live production code.
- Searched `src/` for `function interpolationTypeOf` / `function interpolationTypeOfValue`; only these two definitions exist.
- Verified that `production-theta-producer.ts` already imports from `../render/query-render.ts`, and `system-interpolation.ts` already imports from `../render/query-render.ts`, so a shared export there is mechanically feasible.
- The "mirrors ... exactly" comment was verified; it states the fact of the mirror but does not give a rationale for why the logic cannot be shared.
- Not generated code; not in `tests/`.

## Triage
verdict: confirmed — both excerpts match at the cited lines; manual diff of the two bodies (comment excluded) is identical; both copies live (system-interpolation.ts:623,625 and production-theta-producer.ts:8000); not in clone-scan map, not a spec vector table, no exemption, no prior tracking of this root cause — mechanical dedupe (triage: claude-fable-5-1)
