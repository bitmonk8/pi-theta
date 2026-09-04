# Bug 0424 — A `system:` bare-container render translates only the root schema's own field renames: a nested body-schema field's `as` rename renders theta-side, so one template renders the same nested object two ways — `${p}` yields `{"inner":{"deep":"x"}}` while `${p.inner}` yields `{"D":"x"}`

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — theta-side names silently reach the child's
  system prompt against the recursive-translation rule, with an
  internal-inconsistency face (two spellings of one value in ONE rendered
  prompt) that actively teaches the model contradictory key names; never a
  WRONG wire name (theta-side only), which holds it at S2. D2: the recursive
  translation machinery already exists (`translateOutbound`'s per-`$defs`
  `$ref` recursion) — the fix is feeding the construction site real sidecar
  maps instead of the flat one-entry stub, plus the collision adjudication
  round-1 F2 deferred.
- **Kind:** defect — `docs/spec_topics/query/query-escapes-stringification.md:26–27`
  prescribes, for BOTH container rows, compact `JSON.stringify` "with
  wire-name translation applied **recursively**", and `:34` states "the
  theta-side names an author writes never appear in the rendered prompt";
  applied to `system:` by `:16` and
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`.
  The implementation translates depth 0 only. The disposition is a DELIBERATE
  shipped residual: bug 0407 round-1 review finding F2 (nested-sidecar
  wire-key collision → silent WRONG wire name) was resolved by flattening
  `buildOutboundSidecars` to the root schema, and 0406 §Fix residual 3 /
  0407 §Fix residual 1 both designate the flat form a "filing candidate".
  This report is that filing.
- **Related:**
  - [0407](./0407-system-interp-object-render-skips-wire-translation.md)
    (fixed 0.405.0) — the parent: wired root-flat sidecars; its residual 1 is
    this report. Its round-1 F2 is the constraint any fix must re-satisfy:
    a NAIVE nested map (all depths smashed into one flat wire-key namespace)
    collides two same-spelled wire names at different depths and translates
    with the wrong schema's map — silent WRONG wire name, worse than today.
  - [0080](./0080-keys-values-construction-order-not-declaration-order.md)
    (fixed 0.70.0) — established the outbound QRY-18 walk on the query
    surface is brand-driven and recursive; the query-surface control for the
    same nested value translates every depth
    (`translateInterpolationOutbound`, `production-theta-producer.ts:7642–7690`
    recurses arrays at `:7654` and object fields at `:7690`).
  - [bug 0423](./0423-imported-schema-bare-render-theta-side-names.md) and /04 — sibling wire-translation gaps
    on this surface (imported schemas; union arms), disjoint mechanisms.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/frontmatter.ts:869–901` — `buildOutboundSidecars` builds a
    ONE-entry sidecar map for the root schema whose field inputs all carry
    `type: { kind: "other" }` and `pointer: /properties/<wire>` — no `$ref`
    targets — so the translation walk can never recurse past depth 0. The
    header comment (`:860–868`) documents the flattening and names this
    residual.
  - `src/runtime/wire-translation.ts:593–…` — `translateOutbound` /
    `lowerOutbound` DO support nested translation ("Per-`$defs` sidecars
    keyed by `$defs` name, for recursion through `$ref`",
    `:159–163`); the capability is starved, not missing.
  - `src/parser/frontmatter.ts:1020–1027` — the field-recursion loop gives
    each schema-typed FIELD its own full `SystemParamType` (with that
    schema's own sidecars), which is why a one-step-longer path translates:
    the inconsistency between `${p}` and `${p.inner}` is built at this seam.
  - `src/parser/frontmatter.ts:914–933` — `inlineObjectType` produces no
    sidecars at all, so a body-schema field nested inside an inline-object
    param is untranslated on the bare render the same way.
- **Observed at:** v0.415.0 (04579e12). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt`; scratch vitest run and deleted.

## Summary

`buildOutboundSidecars` carries only the root schema's own flat renames. Any
rename one level down — a schema-typed field's own `as` clauses, in a
schema param, an `array<Schema>` param, or an inline-object param — renders
theta-side on a bare-container interpolation. Because the parse-time field
walk builds each schema-typed field a full type of its own (with that
schema's sidecars), the SAME nested object translates when the author's path
is one step longer: a single template containing both `${p}` and
`${p.inner}` renders the same field as `"deep"` in the first slot and `"D"`
in the second — two spellings of one field in one system prompt.

## Reproduction

At 04579e12, offline. Body declares:

```theta
schema Inner { deep as "D": string }
schema Outer { inner: Inner, top as "T": string }
```

| params | `system:` | render input | observed |
|---|---|---|---|
| `p: Outer` | `'A ${p} B ${p.inner}'` | `{p: {inner: {deep: "x"}, top: "y"}}` | `A {"inner":{"deep":"x"},"T":"y"} B {"D":"x"}` |
| `team: array<Outer>` | `'T ${team}'` | `{team: [{inner: {deep: "x"}, top: "y"}]}` | `T [{"inner":{"deep":"x"},"T":"y"}]` |
| `p: '{inner: Inner}'` | `'I ${p}'` | `{p: {inner: {deep: "x"}}}` | `I {"inner":{"deep":"x"}}` |

All rows load with zero diagnostics. Row 1 shows both faces at once: the
root's own rename (`top` → `"T"`) IS applied inside `${p}` while the nested
`deep` is not — and `${p.inner}` renders the same nested record wire-named
(`{"D":"x"}`). Expected wire form of row 1:
`A {"inner":{"D":"x"},"T":"y"} B {"D":"x"}`.

## Expected behaviour

- `query-escapes-stringification.md:26–27`: both container rows render "with
  wire-name translation applied **recursively**" — the adverb is the rule;
  depth-0-only translation contradicts it in terms.
- `:34`: "the theta-side names an author writes never appear in the rendered
  prompt." `deep` is an author-written theta-side name; the wire contract's
  name for that member is `D` (the lowered schema `Outer`'s `$defs.Inner`
  carries `properties.D`, which is what a typed response must emit).
- `frontmatter-fields-b-and-templates.md:46`: same rendering regardless of
  surface — the query template `${p}` over the same branded value translates
  every depth (brand-driven walk, `production-theta-producer.ts:7654, 7690`).

## Actual behaviour / root cause

`buildOutboundSidecars` (`frontmatter.ts:869–901`) emits one sidecar for the
root schema whose every field input is `type: { kind: "other" }` — a leaf, no
`$ref` target — so `translateOutbound`'s `$ref` recursion
(`wire-translation.ts:159–163` mechanism) has nothing to descend through.
The flattening is deliberate (round-1 F2: a flat MERGED map of all depths
would let two same-spelled wire names at different depths collide and
resolve the wrong schema's rename, a silent WRONG wire name), but the chosen
remedy discards the nested renames instead of keying them per-`$defs`. The
per-field recursion at `:1020–1027` independently gives each schema-typed
field its own complete sidecars, producing the `${p}` vs `${p.inner}`
inconsistency.

## Why it matters

- The system prompt teaches the model key names for context objects whose
  typed-response contract (the lowered, wire-named schema) uses different
  names one level down — and row 1 shows one prompt can carry BOTH spellings
  of the same field, an actively contradictory instruction with zero
  diagnostics.
- The depth of a rename is not an authoring signal: schemas are factored for
  reuse, and nesting an existing renamed schema under a wrapper silently
  un-translates its renames on this surface while the query surface keeps
  translating them.

## Non-goals

- A WRONG wire name never renders — the flattening guarantees theta-side or
  correct, and this report keeps that constraint on any fix.
- Imported-schema renames (no data at parse) — candidate
  system-templates-2/02.
- Union-arm renames — [bug 0425](./0425-union-of-schemas-arm-renames-dropped.md).
- The query-template surface — conforms (brand-driven recursive).

## Fix

Build REAL per-`$defs` sidecars at the construction site: `parseFrontmatter`
has `collectBodyTypes`' schema field lists including each field's
`typeSource`; emit, per reachable body schema, a `SchemaSidecar` whose
schema-typed fields carry their `$ref` target (the referenced schema's
`$defs` name) instead of `{ kind: "other" }`, and pass the full map — this is
exactly the shape `translateOutbound` already consumes on the runtime path,
so the F2 collision cannot recur (lookup is per-`$defs`, not one flat
namespace). The inline-object arm needs the same treatment for its
schema-typed fields (a minted def name or direct field descent).
Alternative: the brand-driven render route (candidate /02 §Fix (b)) covers
this class for BRANDED values in one mechanism, but plain records bound by
the invoke path carry no brand, so the sidecar route is the only one that
covers every binding path. Constraints: rename-free renders byte-identical;
`b0407` W1/W2 and `b0406` W5/W7 pins that stay true must stay green, and the
row-1 bytes flip in the same commit as a new witness.

## Provenance

Designated filing: bug 0406 §Fix (0.404.0) residual 3 and bug 0407 §Fix
(0.405.0) residual 1 ("Filing candidate"), both recording the round-1 F2
flattening. Probed fresh at 04579e12 with scratch vitest
`tests/scratch-system-templates-2.test.ts` (rows C03a–C03c; deleted).
Renderer-capability contrast by code read of `translateOutbound` /
`OutboundTranslationInput` (`wire-translation.ts:155–165, 593`).
