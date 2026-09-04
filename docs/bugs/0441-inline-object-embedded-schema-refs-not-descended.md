# Bug 0441 — A body schema reachable only through an inline-object-typed field is not descended by the outbound-sidecar BFS: `schema Outer { x: {y: Inner} }`, `p: '{x: {y: Inner}}'`, and `xs: 'array<{y: Inner}>'` all render `Inner`'s `as` renames theta-side on a bare `system:` container render

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — theta-side names silently reach the child's
  system prompt against the recursive-translation rule, on documents that
  register with zero diagnostics, and the same one-hop-longer inconsistency
  face as bug 0424 (a `${p.x}` path built by the per-field recursion carries
  the inline object's own field types, so a longer path can translate what
  the bare render does not); never a WRONG wire name (theta-side only), the
  0424 calibration. D2: the descent machinery (per-`$defs` sidecars, `$ref`
  recursion, the minted-`__inline` root device) all shipped in 0.430.0 — the
  fix is teaching the BFS classification step to look inside an
  inline-object type source, plus one adjudication on how to key the
  intermediate inline layer.
- **Kind:** defect — `docs/spec_topics/query/query-escapes-stringification.md:26–27`
  prescribes, for both container rows, compact `JSON.stringify` "with
  [wire-name translation] applied recursively", and `:36` states "the
  theta-side names an author writes never appear in the rendered prompt";
  applied to `system:` by `:16` and
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`.
  The QRY-18 value-driven note's untranslated carve-outs
  (`query-escapes-stringification.md:35`: "An `array<T>` arm, an
  inline-object or imported-schema arm, and an opaque imported-schema object
  value") are union-ARM and opaque-VALUE clauses — none reaches a static
  Schema-typed-object or `array<T>` row whose fields embed an inline object.
  The disposition is a DELIBERATE shipped residual: bug 0424 §Fix (0.430.0)
  residual 1 records exactly this class ("not descended by the BFS
  (`namedSchemaOf` matches only a bare schema name or `array<Schema>`) …
  Recorded in a WHY comment at the BFS classification site; filing
  candidate"). This report is that designated filing.
- **Related:**
  - 0424 (fixed 0.430.0) — the parent: its BFS descends schema-typed and
    `array<Schema>`-typed fields; residual 1 (round-1 review F2) is this
    report. Its F2-collision constraint (per-`$defs` lookup, never one flat
    wire-key namespace) binds any fix here too.
  - 0407 (fixed 0.405.0) — grandparent; established the sidecar route and
    the never-wrong-wire constraint this class keeps.
  - [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md) — sibling blindness in the same
    classification helper (`namedSchemaOf` returns alias names that
    `buildOutboundSidecars` then refuses); disjoint input class (aliases vs
    inline objects), same construction seam.
  - [bug 0444](./0444-array-of-union-element-renames-dropped.md) — the union-element face of the same
    array-arm classification (`array<Cat | Dog>`); a fix here that widens
    `namedSchemaOf` into a real element classifier should coordinate.
  - [bug 0445](./0445-imported-renames-static-container-positions.md) — same construction seam, disjoint input
    class (imported schemas in static container positions): the same
    "construction site starves a capable renderer" shape with a different
    data source.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/frontmatter.ts:858–875` — `namedSchemaOf` matches a bare
    schema name or `array<...>` (recursively) and nothing else; an
    inline-object type source (`{y: Inner}`) returns `undefined`.
  - `src/parser/frontmatter.ts:915–933` — the BFS field loop: a field whose
    `typeSource` is an inline object gets no `refTarget`, so the runtime walk
    never reaches `Inner`'s sidecar through it. The WHY comment at `:918–923`
    documents this residual verbatim.
  - `src/parser/frontmatter.ts:986–999` — `inlineObjectType`'s field loop:
    `refTarget = namedSchemaOf(fieldType, …)` (`:989`) is `undefined` for a
    nested inline-object field, so no root input and no merged sidecars are
    collected for `p: '{x: {y: Inner}}'`.
  - `src/parser/frontmatter.ts:1180–1193` — the `array<...>` param arm feeds
    the element source to `namedSchemaOf` (`:1187`); an inline-object element
    (`array<{y: Inner}>`) yields no sidecars at all.
  - `src/runtime/wire-translation.ts:612–663` — `lowerOutbound` is fully
    capable of the descent (per-position `refTargets`, `:618–621`); the
    capability is starved at construction, not missing — the 0424 shape.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt` (the spawn-site call pair); scratch vitest run and
  deleted.

## Summary

Bug 0424's fix made `buildOutboundSidecars` a transitive BFS, but the BFS
classifies a field's type with `namedSchemaOf`, which recognises only a bare
body-schema name or `array<Schema>` (recursively). A body schema referenced
one hop deeper — inside an inline-object type, in any of the three container
positions that carry sidecars — is invisible to the walk: no `refTarget` is
recorded, the runtime `lowerOutbound` walk finds no fragment to re-enter,
and the nested schema's `as` renames render theta-side on the bare container
render. All three spellings load with zero diagnostics.

## Reproduction

At 401a425b, offline, `parseDoc` → `renderSystemPrompt`. Body declares
`schema Inner { deep as "D": string }`; row 1 adds
`schema Outer { x: {y: Inner} }`:

| params | `system:` | render input | observed | expected wire form |
|---|---|---|---|---|
| `p: Outer` | `'P: ${p}'` | `{p: {x: {y: {deep: "v"}}}}` | `P: {"x":{"y":{"deep":"v"}}}` | `P: {"x":{"y":{"D":"v"}}}` |
| `p: '{x: {y: Inner}}'` | `'P: ${p}'` | `{p: {x: {y: {deep: "v"}}}}` | `P: {"x":{"y":{"deep":"v"}}}` | `P: {"x":{"y":{"D":"v"}}}` |
| `xs: 'array<{y: Inner}>'` | `'P: ${xs}'` | `{xs: [{y: {deep: "v"}}]}` | `P: [{"y":{"deep":"v"}}]` | `P: [{"y":{"D":"v"}}]` |

Zero error diagnostics on every row. Control on the same HEAD: the one-hop
shallower spellings (`schema Outer { y: Inner }`, `p: '{y: Inner}'`,
`array<Outer>`) all translate `deep` → `"D"` — pinned green by
`tests/b0424-*.test.ts` W1–W3.

## Expected behaviour

- `query-escapes-stringification.md:26–27`: both container rows render "with
  wire-name translation applied recursively" — the adverb does not stop at
  fields whose type is spelled inline.
- `:36`: "the theta-side names an author writes never appear in the rendered
  prompt." `deep` is an author-written theta-side name; the lowered contract
  for `Inner` carries `properties.D`, which is what a typed response must
  emit.
- The AJV boundary agrees: the `params:` lowering of an inline-object field
  hoists the embedded `Inner` reference concretely, so the wire shape the
  argument must satisfy uses `D` — the render then teaches the model `deep`.

## Actual behaviour / root cause

`namedSchemaOf` (`frontmatter.ts:858–875`) is the single classification
gate for every sidecar-construction position (BFS field loop `:924`,
inline-object field loop `:989`, array-element arm `:1187`), and it does not
parse inline-object type sources. A field typed `{y: Inner}` therefore
carries no `refTarget` (BFS), collects no root input (`inlineObjectType`),
or yields no sidecars at all (array arm). The WHY comment at `:918–923`
records the class deliberately. `lowerOutbound`'s per-position `refTargets`
recursion (`wire-translation.ts:618–621`) would translate the value if the
construction site supplied the hop.

## Why it matters

- The depth of a rename is not an authoring signal (the 0424 argument): an
  inline wrapper layer (`x: {y: Inner}`) is an ordinary structuring device,
  and adding one silently un-translates every rename beneath it while the
  one-hop control keeps translating.
- The system prompt teaches key names the typed-response contract refuses,
  with zero diagnostics on any channel.

## Non-goals

- A WRONG wire name never renders — theta-side or correct, the standing
  constraint any fix keeps.
- Alias-typed fields/elements — [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md) (sibling
  mechanism in the same helper).
- Union-typed array elements — [bug 0444](./0444-array-of-union-element-renames-dropped.md).
- Inline-object union ARMS (`p: '{a: X} | Cat'`) — spec-pinned untranslated
  by the QRY-18 value-driven note (`query-escapes-stringification.md:35`),
  bug 0426's adjudicated wording.

## Fix

Teach the classification step to descend an inline-object type source.
Options:

- (a) **Synthetic-def descent at the BFS**: when a field's `typeSource` is a
  single enclosing brace group, parse its interior (the `inlineObjectType`
  split already in the file) and mint a collision-free intermediate `$defs`
  name for the inline layer (the `__inline` device `inlineObjectType`
  already uses, made per-position unique), emitting a sidecar for it whose
  schema-typed fields carry their real `refTarget`s; the field's input then
  `refTarget`s the minted def. Handles arbitrary nesting depth uniformly in
  one mechanism, matches the runtime walk's existing per-`$defs` recursion,
  and keeps the F2 collision impossible (lookup stays per-def). Recommended.
- (b) **Pointer-extended inputs**: emit additional `SidecarFieldInput`s on
  the ENCLOSING schema's own sidecar with deeper pointers
  (`/properties/x/properties/y` carrying `refTarget: Inner`). Smaller
  surface (no minted defs), but `lowerOutbound` applies renames only at
  `pointer === ""` and hops only on exact pointer matches, so the enclosing
  sidecar's pointer table must be threaded through the inline layer's
  wire-named spelling — more delicate than (a), same result.

Constraints either way: rename-free renders stay byte-identical;
`b0424` W1–W3/G1/F3/F4 and `b0407`/`b0406` pins stay green; the minted
inline def names must not collide with author schemas (reuse
`inlineObjectType`'s reservation loop); the three probe rows flip in the
same commit as new witnesses.

## Provenance

Designated filing: bug 0424 §Fix (0.430.0) residual 1 ("filing candidate"),
recorded in the WHY comment at `src/parser/frontmatter.ts:918–923`. Probed
fresh at 401a425b with scratch vitest
`tests/scratch-render-sidecars-6.test.ts` (rows C1a–C1c; deleted).
Renderer-capability contrast by code read of `lowerOutbound`
(`wire-translation.ts:612–663`).
