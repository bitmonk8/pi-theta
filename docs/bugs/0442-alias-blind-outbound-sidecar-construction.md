# Bug 0442 — Outbound sidecar construction is alias-blind everywhere except the direct param position: `xs: 'array<A>'` over `schema A = Cat` and a body-schema field typed by an alias (`pet: A`) both render `Cat`'s `as` renames theta-side, while `p: A` translates

- **Status:** open.
- **Sev/Diff estimate:** S2/D1 — theta-side names silently reach the child's
  system prompt on registering documents, and the trigger is the exact
  refactor aliases exist for (naming a type once and reusing it): swapping
  `array<Cat>` for `array<A>` silently flips every rendered element key while
  `p: A` alone keeps translating — a one-spelling divergence inside one
  document; never a WRONG wire name. D1: the alias arms are already carried
  (`FrontmatterBodyTypes.aliasArms`, bug 0427) and the resolution loop
  already exists in `toSystemParamType`'s 1-arm dispatch — the fix is a
  mechanical alias-chase (with the existing cycle guard) at the two blind
  sites (`namedSchemaOf` / the BFS root refusal).
- **Kind:** defect — same normative sentences as bugs 0407/0424/0427:
  `docs/spec_topics/query/query-escapes-stringification.md:26–27` (the
  `array<T>` and Schema-typed-object rows render "with wire-name translation
  applied recursively") and `:36` ("the theta-side names an author writes
  never appear in the rendered prompt"), applied to `system:` by `:16` and
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`;
  `docs/spec_topics/schemas.md:60` (an alias "composes with every shape from
  the type grammar … and references to other named types" — the alias IS the
  type it names, not a distinct opaque kind). The QRY-18 value-driven note's
  untranslated carve-outs (`query-escapes-stringification.md:35`) are
  union-arm/opaque-value clauses and do not reach these STATIC container
  rows. The disposition is a DELIBERATE shipped residual, recorded twice:
  bug 0427 §Fix (0.437.0) residual 1 (round-1 R2: "`array<Alias>` element
  sidecars render theta-side names (an alias-blind `buildOutboundSidecars`
  for the array element): a pre-existing 0407-class wire-name gap …
  Filing candidate in the 0406-residual pattern") and the
  `buildOutboundSidecars` doc comment ("A reachable schema that is itself
  head-only/alias (`fields === undefined`) gets no sidecar entry; the runtime
  walk finds none for it and leaves that nested value theta-side"). This
  report is the designated filing, widened by the alias-typed-FIELD face the
  residual note did not enumerate.
- **Related:**
  - 0427 (fixed 0.437.0) — the parent: taught `toSystemParamType`'s DIRECT
    named-type position to dispatch on `aliasArms` (1 arm → recurse), which
    is why `p: A` and `p: L` (alias-of-array) translate; its residual 1 is
    this report. Every other consumer of schema names stayed alias-blind.
  - 0424 (fixed 0.430.0) — built the BFS these sites feed; its
    fields-undefined skip (`frontmatter.ts:912–914`) is the mechanism that
    silently drops the alias hop inside the walk.
  - 0407 (fixed 0.405.0) — the wire-name-gap class calibration.
  - [bug 0441](./0441-inline-object-embedded-schema-refs-not-descended.md) — sibling blindness in `namedSchemaOf`
    (inline-object type sources); disjoint input class, same helper.
  - [bug 0443](./0443-union-alias-spellings-drop-arm-translation.md) — the union-position faces of the same
    alias blindness (`p: 'A | B'`, `p: UU`); separate report because the
    machinery is the union arm builder / the 2+-arm alias route, not the
    sidecar BFS.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/frontmatter.ts:858–875` — `namedSchemaOf` returns any name
    present in `schemas` — alias declarations included (`collectBodyTypes`
    maps every `schema` statement's name, with `fields === undefined` for the
    alias form) — but performs no alias resolution, so the name it returns
    for `A` is one `buildOutboundSidecars` then refuses.
  - `src/parser/frontmatter.ts:904–906` — `buildOutboundSidecars`'s root
    refusal: `schemas.get(rootSchema) === undefined` → `undefined`; an
    alias root (`array<A>`'s unwrapped element) yields NO sidecars at all.
  - `src/parser/frontmatter.ts:912–914` — the BFS skip: an alias name pushed
    as a field's `refTarget` contributes no sidecar entry, so the runtime
    hop (`wire-translation.ts:618–621`) re-enters `sidecars.get("A")` →
    `undefined` and the nested value walks rename-less.
  - `src/parser/frontmatter.ts:1180–1193` — the `array<...>` param arm:
    `buildOutboundSidecars(namedSchemaOf(element, …))` (`:1187`) is the
    `array<A>` entry path.
  - `src/parser/frontmatter.ts:1220–1249` — the alias dispatch that DOES
    resolve (aliasArms, 1 arm → recurse with `aliasChain` guard) — reached
    only from the direct `NamedType` param position; none of the three sites
    above consults it.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt`; scratch vitest run and deleted.

## Summary

Bug 0427 taught exactly one position — a `params:` field whose type source
IS the alias name — to resolve alias arms before classifying. The sidecar
construction walk consults none of that: `namedSchemaOf` happily returns an
alias name (aliases live in the same `schemas` map), and
`buildOutboundSidecars` then refuses it (`fields === undefined`), yielding
no sidecars (array-element position) or a silently dropped hop (BFS field
position). The result is a spelling divergence inside one mechanism:
`p: A` translates (0427), `p: L` over `schema L = array<Cat>` translates
(0427's 1-arm recursion reaches the array arm), but `xs: 'array<A>'` and a
schema field `pet: A` render every `Cat` rename theta-side, on documents
with zero diagnostics.

## Reproduction

At 401a425b, offline, `parseDoc` → `renderSystemPrompt`. Body declares
`schema Cat { kind as "K": "cat", name as "N": string }` and
`schema A = Cat` (row 2 adds `schema Outer { pet: A, top as "T": string }`):

| params | `system:` | render input | observed | expected wire form |
|---|---|---|---|---|
| `xs: 'array<A>'` | `'P: ${xs}'` | `{xs: [{kind:"cat",name:"Tom"}]}` | `P: [{"kind":"cat","name":"Tom"}]` | `P: [{"K":"cat","N":"Tom"}]` |
| `p: Outer` | `'P: ${p}'` | `{p: {pet: {kind:"cat",name:"Tom"}, top:"y"}}` | `P: {"pet":{"kind":"cat","name":"Tom"},"T":"y"}` | `P: {"pet":{"K":"cat","N":"Tom"},"T":"y"}` |

Zero error diagnostics on both rows. Row 2 shows the two-faces shape: the
root's own rename (`top` → `"T"`) IS applied while the alias-hop field is
not — one rendered prompt carrying both translated and untranslated keys.
The inconsistency is per-path, exactly bug 0424's row-1 shape: on the same
HEAD, `system: 'A ${p} B ${p.pet}'` over row 2's declarations renders

```
A {"pet":{"kind":"cat","name":"Tom"},"T":"y"} B {"K":"cat","N":"Tom"}
```

— the SAME nested record spelled theta-side in the first slot and wire-side
in the second, because the per-field recursion
(`frontmatter.ts:1264–1271`) classifies the FIELD's own type through the
alias-resolving direct-name dispatch while the enclosing sidecar walk does
not.
Controls on the same HEAD (all translate, scratch-verified green):
`p: A` → `{"K":"cat","N":"Tom"}` (0427 W3 class);
`p: L` over `schema L = array<Cat>` → `[{"K":"cat","N":"Tom"}]`;
`xs: 'array<Cat>'` (no alias) → `[{"K":"cat","N":"Tom"}]` (b0407 class);
`pet: Cat` (no alias) → translated (b0424 class).

## Expected behaviour

- `query-escapes-stringification.md:26–27, 36` as quoted under **Kind** —
  the values are Schema-typed at every relevant depth and the rows'
  translation clauses are unconditional.
- `schemas.md:60`: `schema A = Cat` is the type `Cat` one step removed;
  no sentence grades the rendering guarantee down for the alias spelling.
  The AJV boundary already treats them identically (the alias lowers
  concretely since bug 0033), so the wire contract for `array<A>` is
  `properties.K` / `properties.N` — the names the render then withholds.
- Internal consistency: bug 0427's own fix rationale ("naming the union via
  an alias must not change its render", `frontmatter.ts:1253`) states the
  design intent this class still violates one position over: naming an
  ELEMENT or FIELD type via an alias changes its render.

## Actual behaviour / root cause

Alias resolution landed in exactly one consumer. `toSystemParamType`'s
direct-name dispatch resolves `aliasArms` (`frontmatter.ts:1220–1249`); the
three sidecar-construction sites classify by `namedSchemaOf` +
`schemas.get(...) !== undefined` and never consult `aliasArms`:

1. array-element position (`:1187` → `:904–906` root refusal → no sidecars);
2. BFS field position (`:924` records `refTarget: "A"`, `:912–914` skips the
   alias when dequeued, so the runtime hop finds `sidecars.get("A") ===
   undefined` and walks rename-less);
3. transitively, any alias chain (`schema A2 = A`) at either position.

One nuance on row 2's mixed-prompt face: the translated `${p.pet}` leg
exists only post-0427 — pre-0427 the direct alias position rendered
`[object Object]` (0427's own row-3 face) — so 0427's fix is what surfaced
the inconsistency; only the array face (`xs: 'array<A>'`) renders
byte-identically pre/post 0427.

## Why it matters

- Aliases are the spec's naming/reuse mechanism; factoring `array<Cat>`
  params into a named `schema A = Cat` (or reusing an alias a library
  convention established) is an ordinary additive refactor that silently
  flips every rendered element key on this surface while every other
  surface (AJV validation, the direct param position, the query surface's
  brand-driven walk) keeps treating the alias as transparent.
- Row 2's mixed prompt actively teaches the model two naming conventions
  for sibling fields of one object.

## Non-goals

- Union positions of the same blindness (`p: 'A | B'` arm skip, `p: UU`
  bare terminal) — [bug 0443](./0443-union-alias-spellings-drop-arm-translation.md).
- `array<UU>` (alias-of-UNION as element) — [bug 0444](./0444-array-of-union-element-renames-dropped.md)'s
  union-element ground; a fix here that alias-chases into a union RHS must
  coordinate with that report's arm-pick machinery.
- Inline-object-embedded schema refs — [bug 0441](./0441-inline-object-embedded-schema-refs-not-descended.md).
- Genuinely head-only schemas (no body, no arms) — refused at declaration;
  unreachable in a registering document (bug 0427's pinned disposition).
- A WRONG wire name never renders; any fix keeps that.

## Fix

Resolve alias chains at the classification seam. Options:

- (a) **Widen `namedSchemaOf`**: give it `bodyTypes` (or the `aliasArms`
  map) and, when the matched name has `fields === undefined`, follow a
  SINGLE-arm alias RHS (re-entering itself, so `array<A2>` → `A2` → `A` →
  `Cat` and `schema L2 = array<Cat>` chains work) with a seen-set guard
  mirroring `aliasChain`; return the terminal object-schema name. Multi-arm
  RHS returns `undefined` (union ground — candidates /03 and /04). One
  helper edit covers both blind positions because both funnel through it;
  the BFS field loop's `refTarget` then names a real object schema and the
  existing per-`$defs` machinery does the rest. Recommended.
- (b) **Resolve at `buildOutboundSidecars`**: keep `namedSchemaOf` dumb and
  make the BFS/root treat a fields-undefined name with a 1-arm alias RHS as
  its resolved target (rewriting the `refTarget` before recording it).
  Equivalent coverage, but the resolution then lives in two places once the
  union builders (candidate /03) need it too.

Constraints: the `aliasChain`/seen guard must terminate on pure-alias cycles
(refused at declaration, backstop only — the 0427 F1 lesson: do not park
sentinels in the shared `resolving` shell map); rename-free aliases stay
byte-identical; `b0424` (6), `b0427` (incl. R1a–R1c cycle cells), `b0407`,
`b0406` witnesses stay green; both probe rows flip in the same commit as
new witnesses. Sequencing: fix together with [bug 0441](./0441-inline-object-embedded-schema-refs-not-descended.md)
— both reports widen `namedSchemaOf`, and separate fixers produce a
signature conflict in the same helper.

## Provenance

Designated filing: bug 0427 §Fix (0.437.0) residual 1 (round-1 R2, "Filing
candidate in the 0406-residual pattern"); the field face additionally
documented in the `buildOutboundSidecars` doc comment
(`frontmatter.ts:892–896`). Probed fresh at 401a425b with scratch vitest
`tests/scratch-render-sidecars-6.test.ts` (rows C2a–C2b red; controls C4,
C5 green; deleted). Alias presence in the `schemas` map verified by code
read of `collectBodyTypes` (`theta-document.ts`, `stmt.name → stmt.fields`
for every schema statement).
