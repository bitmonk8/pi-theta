---
id: pending
title: QRY-18 outbound wire-name translation of an interpolated container is performed by two unrelated walkers — `stringifyInterpolatedValue`'s sidecar-driven `translateOutbound` arm (reached only from the `system:` render) and `query-interpolation.ts`'s brand+env-driven `translateInterpolationOutbound` (the `@`-template route, which bypasses the shared arm) — and four bug records (0407, 0423, 0424, 0425) re-solved on the sidecar side rules the brand side already implemented
lens: D1
status: intake
verdict: pending
locations:
  - src/render/query-render.ts:455-469
  - src/runtime/query-interpolation.ts:102-120
  - src/runtime/query-interpolation.ts:171-222
  - src/runtime/wire-form-outbound.ts:44-46
  - src/runtime/wire-form-outbound.ts:61-112
  - src/parser/system-prompt-render.ts:86-92
sites: 4
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# QRY-18 outbound wire-name translation of an interpolated container is performed by two unrelated walkers — `stringifyInterpolatedValue`'s sidecar-driven `translateOutbound` arm (reached only from the `system:` render) and `query-interpolation.ts`'s brand+env-driven `translateInterpolationOutbound` (the `@`-template route, which bypasses the shared arm) — and four bug records (0407, 0423, 0424, 0425) re-solved on the sidecar side rules the brand side already implemented

## Observation
`stringifyInterpolatedValue` (src/render/query-render.ts) is documented as the shared QRY-18 renderer for both interpolation surfaces; its `array`/`object` arm applies outbound wire-name translation through `translateOutbound` (src/runtime/wire-form-outbound.ts, sidecar-driven: renames read from `SchemaSidecar.wireNames`, nesting followed through `refTargets`) when the caller's `InterpolationType` carries `sidecars` + `rootDef`. The `@`-template route (`stringifyInterpolation` in src/runtime/query-interpolation.ts) derives its type from the runtime value (`interpolationTypeOf`, which never mints `sidecars`), runs a different translator — `translateInterpolationOutbound`, brand-driven (`schemaTagOf` → `env.resolveSchema`, with a `typeHint` fallback) — and returns `JSON.stringify(lowered)` directly, so the shared arm's translation branch is never entered from the query route. The only src producers of a sidecar-bearing `InterpolationType` are the `system:` construction sites (`toInterpolationType`, `unionArmObjectType`, `import-system-template-patch.ts`). The bug records for the `system:` side (0407 → 0423/0424/0425) each cite the query side's brand-driven walker as the already-correct contrast, and each landed its fix on the sidecar walker instead.

## Evidence

Way A — the shared arm, sidecar-driven. src/render/query-render.ts:455-469:
```ts
    case "array":
    case "object": {
      // Compact `JSON.stringify` (no pretty-printing) with outbound wire-name
      // translation applied recursively. When the sidecars / root `$defs` are
      // supplied, lower theta-side names to wire before serialising; otherwise
      // `JSON.stringify` already collapses enum values to their bare wire form.
      const lowered =
        type.sidecars !== undefined && type.rootDef !== undefined
          ? translateOutbound({
              value,
              sidecars: type.sidecars,
              rootDef: type.rootDef,
            })
          : value;
      return { ok: true, text: JSON.stringify(lowered) };
```
src/runtime/wire-form-outbound.ts:44-46 and 61-66 (the walker behind it):
```ts
export function translateOutbound(input: OutboundTranslationInput): unknown {
  return lowerOutbound(input.value, input.sidecars.get(input.rootDef), "", input.sidecars);
}
```
```ts
function lowerOutbound(
  value: ThetaValue,
  sidecar: SchemaSidecar | undefined,
  pointer: string,
  sidecars: ReadonlyMap<string, SchemaSidecar>,
): unknown {
  const refTarget = sidecar?.refTargets?.find((rt) => rt.pointer === pointer)?.defName;
```
Its sole src caller feeding sidecars is the `system:` render, src/parser/system-prompt-render.ts:86-92:
```ts
    const effectiveType =
      part.valueDriven && part.unionArms !== undefined
        ? (unionArmObjectType(value, part.unionArms) ?? interpolationTypeOf(value))
        : part.valueDriven
          ? interpolationTypeOf(value)
          : part.type;
    const rendered = stringifyInterpolatedValue(value, effectiveType);
```

Way B — the `@`-template route, brand+env-driven, bypassing the shared arm. src/runtime/query-interpolation.ts:102-120:
```ts
  const type = interpolationTypeOf(value);
  const reach: NestedResultReach = { found: false };
  if (type.kind === "object" || type.kind === "array") {
    // QRY-18: a Schema-typed object / `array<T>` interpolation renders as compact
    // `JSON.stringify` with wire-name translation applied recursively. The
    // outbound pass rewrites every renamed field to its wire name at every
    // nesting level, driven by each object value's declaring-schema brand (with
    // the declared field type as a fallback for un-branded nested values); theta
    // code never sees a wire name, and the model never sees a theta-side name.
    const lowered = translateInterpolationOutbound(value, env, reach);
    if (!reach.found) {
      return JSON.stringify(lowered);
    }
    // ...
  }
  const rendered = stringifyInterpolatedValue(value, reach.found ? { kind: "result" } : type);
```
src/runtime/query-interpolation.ts:171-176 and 199-206 (the walker):
```ts
function translateInterpolationOutbound(
  value: ThetaValue,
  env: LexicalEnvironment,
  reach: NestedResultReach,
  typeHint?: string,
): unknown {
```
```ts
  const hintName = typeHint !== undefined ? identifierTypeSource(typeHint) : undefined;
  const brand = schemaTagOf(value);
  const schemaName =
    brand ?? (hintName !== undefined && env.resolveSchema(hintName) !== undefined ? hintName : undefined);
  const decl = schemaName !== undefined ? env.resolveSchema(schemaName) : undefined;
  const fields = new Map<string, { readonly wire: string; readonly type: string }>();
```
On the query route `stringifyInterpolatedValue` is reached with an `object`/`array` kind only when `reach.found` is true, and then the type is rewritten to `{ kind: "result" }`; the `translateOutbound` branch of the shared arm is therefore never entered from Way B.

Counts, both ways.
Callers of the shared renderer — `grep -rn "stringifyInterpolatedValue(" src --include=*.ts | grep -v "^\S*:\s*\(//\|\*\)"` → 4 hits:
```
src/parser/system-prompt-render.ts:65:          const renderedElem = stringifyInterpolatedValue(element, armType);
src/parser/system-prompt-render.ts:92:    const rendered = stringifyInterpolatedValue(value, effectiveType);
src/render/query-render.ts:436:export function stringifyInterpolatedValue(
src/runtime/query-interpolation.ts:120:  const rendered = stringifyInterpolatedValue(value, reach.found ? { kind: "result" } : type);
```
Translator entry points — `grep -rn "translateOutbound(\|translateInterpolationOutbound(" src --include=*.ts | grep -v "^\S*:\s*\(//\|\*\)"` → 6 hits:
```
src/render/query-render.ts:463:          ? translateOutbound({
src/runtime/query-interpolation.ts:111:    const lowered = translateInterpolationOutbound(value, env, reach);
src/runtime/query-interpolation.ts:171:function translateInterpolationOutbound(
src/runtime/query-interpolation.ts:183:    return value.map((element) => translateInterpolationOutbound(element, env, reach, elementHint));
src/runtime/query-interpolation.ts:219:    defineRecordField(result, wireKey, translateInterpolationOutbound(fieldValue, env, reach, field?.type));
src/runtime/wire-form-outbound.ts:44:export function translateOutbound(input: OutboundTranslationInput): unknown {
```
Producers of a sidecar-bearing `InterpolationType` (all on the `system:` side) — `grep -rn "sidecars: " src --include=*.ts | grep -i "interpolation\|armType\|kind: \"object\"\|kind: \"array\""` → 7 hits:
```
src/extension/import-system-template-patch.ts:426:        type: { kind: "object", sidecars: merged, rootDef: part.type.rootDef },
src/parser/system-interpolation.ts:161:  readonly sidecars: Extract<InterpolationType, { kind: "object" }>["sidecars"];
src/parser/system-interpolation.ts:496:        ...(type.sidecars !== undefined ? { sidecars: type.sidecars } : {}),
src/parser/system-interpolation.ts:502:        ...(type.sidecars !== undefined ? { sidecars: type.sidecars } : {}),
src/parser/system-param-types.ts:314:  return { kind: "object", fields: map, sidecars: merged, rootDef: rootName };
src/parser/system-param-types.ts:523:          return { kind: "array", sidecars: sc.sidecars, rootDef: sc.rootDef };
src/parser/system-param-types.ts:526:          return { kind: "array", sidecars: inline.sidecars, rootDef: inline.rootDef };
```

Drift that already happened (the demonstrated cost). docs/bugs/0407-system-interp-object-render-skips-wire-translation.md:160-166 (the report's own §Fix):
```
Alternative with
a smaller seam: have `renderSystemPrompt` accept the brand-driven outbound
translator as a dep and reuse the producer's walk — one translation
implementation instead of two (the two-implementation drift is how this bug
arose).
```
and its shipped fix, :196: "the sidecar route was chosen over the brand-driven route (0407 §Fix's stated primary route, parent-minimal — zero `production-theta-producer.ts` hunks)". Its residuals :191-194 then became bugs 0424 (nested renames) and 0425 (union-arm renames), each citing the brand-driven walker as the already-correct control — docs/bugs/0424-nested-schema-renames-not-translated-bare-container.md:33-38:
```
    (fixed 0.70.0) — established the outbound QRY-18 walk on the query
    surface is brand-driven and recursive; the query-surface control for the
    same nested value translates every depth
    (`translateInterpolationOutbound`, `production-theta-producer.ts:7642–7690`
    recurses arrays at `:7654` and object fields at `:7690`).
```
docs/bugs/0425-union-of-schemas-arm-renames-dropped.md:5-9: "D2 because 0407 §Fix already named the union-arm threading route (a value-brand-keyed sidecar map, or the brand-driven translator) inside one subsystem — it was measured and not adopted, twice." docs/bugs/0423-imported-schema-bare-render-theta-side-names.md:174-175 likewise proposes routing "the `system:` render through the same brand-driven translator the query surface uses (`translateInterpolationOutbound`)".

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency (one QRY-18 render rule, one shared renderer whose translation arm only one of the two surfaces enters, two walkers with different lookup substrates) plus the cost cited above (four bug records re-solving on one walker what the other already did).

## Why this is a problem
The two surfaces owe each other consistency by the spec's own framing — bug 0407 §Summary: "the same value renders differently on the two surfaces the spec unifies under one table" — and by the shared renderer's contract (`stringifyInterpolatedValue` is what `renderSystemPrompt` calls "the **shared** canonical renderer … so the model sees one rendering of a given value regardless of surface", system-prompt-render.ts:33-40 and :50-52). Mechanically, a maintainer fixing a rename rule (nesting, array elements, union arms, imported schemas) fixes one walker and leaves the other; the record shows this happened in sequence — 0407 (system side renders theta-side names while the query side translates), 0424 (per-`$defs` recursion added to `lowerOutbound`; the brand walker already recursed), 0425 (arm pick added beside `stringifyInterpolatedValue`; the brand walker already resolves by `schemaTagOf`), 0423 (imported-schema renames). The shared arm's `translateOutbound` branch reads as the canonical path but is reached from exactly one surface, so a reader of query-render.ts alone infers the query route goes through it when it does not (the misread bug 0120 §Affected recorded: "no site in `src/` ever sets `sidecars` on an `InterpolationType`, so that arm is unentered in production", quoted in docs/bugs/0407-system-interp-object-render-skips-wire-translation.md:21-22).

## Suggested direction (non-binding, optional)
Unification hypothesis, unproven: one outbound walker reachable from both surfaces, with the lookup substrate (sidecar map vs. brand+env) supplied as an input rather than selected by which module the caller lives in. Note bug 0425's pinned disposition rules out the brand-driven walker as the sole substrate for the `system:` side ("invoke-path bindings are unbranded, so route (a)'s structural fallback is load-bearing"), so any unification would have to carry both substrates; whether that is smaller than the present two walkers is not shown here.

## False-positive check
- Injected clone map: no group covers this (query-render.ts, query-interpolation.ts and wire-form-outbound.ts list "(no clone groups)" in the injected clone map; the two walkers are mechanism-shaped — different lookup substrate, different recursion key — not token copies). The prior D4 candidate qw20260923023517-d4-01 was rejected as false-positive on a different pairing (inbound vs outbound), and its triage note states that "a `translateInterpolationOutbound` (env.resolveSchema) vs `lowerOutbound` (sidecar) parallel would need its own filing on its own evidence" (quality/TRIAGE_LOG.md:291) — this is that filing, on D1 evidence.
- D9-affinity check: not a wrong-home claim — both walkers sit in runtime/render modules beside their consumers; the finding is that two exist for one rule, not where either lives.
- D2-deadness check: both sides live — `translateOutbound` is entered from query-render.ts:463 with sidecars produced at the seven `system:` sites listed above; `translateInterpolationOutbound` is entered from query-interpolation.ts:111 on every `@`-template container interpolation (`renderQueryText` callers in src: `grep -rn "renderQueryText(" src --include=*.ts | grep -v "^\S*:\s*\(//\|\*\)"` → 4 hits: src/extension/production-theta-producer.ts:731, src/extension/production-theta-producer.ts:1006, src/extension/query-text-render.ts:52, and the definition at src/runtime/query-interpolation.ts:45).
- Export-style exemption: not applicable (divergent-solutions, not wide-surface).
- Prior filings: PTQ-1171 (D9, wire-translation.ts three walks) split `translateOutbound` out of wire-translation.ts and did not touch the query route; PTQ-1289 (D9) re-homed `translateInterpolationOutbound` from the producer to query-interpolation.ts and did not unify it; PTQ-0086 concerns `schemaTagOf` citations. None covered this site's two-walker structure. Bug 0407's shipped fix explicitly kept two implementations (a scope choice, "parent-minimal"), and bug 0425 pinned only that the brand walker alone is insufficient for the `system:` side — neither adjudicates that two walkers must remain.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.
- All excerpts re-read at HEAD immediately before filing; all searches run in this session with outputs pasted in full.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All six excerpts match at the cited lines. The four stated searches reproduce verbatim (4/6/7/4 hits, same lines). The query route does bypass the shared arm: query-interpolation.ts:111-114 returns JSON.stringify(lowered) directly, and :120 passes only {kind:"result"} when reach.found. clone-scan map shows no groups for query-render.ts or query-interpolation.ts. The cost is real: 0407:160-166 says "the two-implementation drift is how this bug arose", 0407:196 records the sidecar route as the pinned choice, 0424:33-38 and 0425:5-9 cite the brand-driven walker as the control, and 0423:174-175 proposes the brand route. No open PTQ or intake covers this root cause: the sibling d1-01 refTargets-keying and d1-02 enum-carrier filings are different causes, and PTQ-1171/1289 were moves only. The filing discloses 0425's pin that both substrates must survive (triage: claude-opus-5-5)
