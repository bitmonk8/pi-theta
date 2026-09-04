# Bug 0443 — The alias spellings of a union of renamed schemas drop the bug-0425 arm translation: `p: UU` over `schema UU = Cat | Dog` carries no arms (renders theta-side) against QRY-18's own arm-pick clause, and `p: 'A | B'` over per-arm aliases is skipped by the arm builder — while the inline `p: 'Cat | Dog'` translates

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — theta-side names silently reach the child's
  system prompt on registering documents, and for the `p: UU` face the shipped
  bytes now DIVERGE from the QRY-18 value-driven note bug 0426 wrote to match
  bug 0425's landed behaviour (the note prescribes an arm pick through arms
  that name body object schemas directly — `UU`'s arms are exactly `Cat` /
  `Dog`); never a WRONG wire name. D2 because both fixes' machinery already
  exists in the same two files (`buildSystemUnionArms`; the `aliasArms`
  dispatch) — the fix is calling the former from the alias route and
  alias-chasing arm sources — but one adjudication is owed on how far the
  QRY-18 note's word "directly" was meant to reach.
- **Kind:** defect (the `p: UU` face) —
  `docs/spec_topics/query/query-escapes-stringification.md:28` routes a
  union-typed interpolation to the value-driven note, and `:35` prescribes:
  "wire-name translation runs only through a union arm that names a body
  object schema directly: the arm is selected by the value's schema brand …
  otherwise … by an **exact** theta-side field set plus any literal
  discriminator." `docs/spec_topics/schemas.md:60` makes the alias the type
  it names, so `p: UU`'s union arms ARE `Cat` and `Dog` — both naming body
  object schemas directly — yet the implementation threads no arms and the
  value renders untranslated. For the `p: 'A | B'` face the same sentence's
  "directly" is arguably satisfied only after one alias hop, so that face is
  filed as the internal-consistency sibling (same document, same union, three
  spellings, two behaviours) rather than a crisp letter-violation. The
  divergence is NOT a designated residual. Bug 0427 §Fix's pinned
  disposition reads verbatim: "2+-arm alias arm-rename translation is bug
  0425 (lane L4) — the discriminated-union terminal here carries NO
  arm-rename; the alias→union routing is CONSISTENT with L4's union-terminal
  mechanism (do not implement arm-rename here)." That is a scope-FORWARDING
  pin on 0427's own fix, not a disposition of the bytes: it hands the
  arm-rename obligation to 0425's ground, and the forwarded obligation was
  never discharged — `buildSystemUnionArms`'s only call site is
  `frontmatter.ts:1177`, the inline `|` split; the alias route never reaches
  it. 0427's WHY comment states "naming the union via an alias must not
  change its render" (`frontmatter.ts:1253`) — but the L4 (0425) mechanism
  threads arms for the inline spelling only, so naming the union via an alias
  DOES change its render for every renamed-arm union; neither 0425's nor
  0427's residual list records the composed gap.
- **Related:**
  - 0425 (fixed 0.431.0) — built the arm machinery (`buildSystemUnionArms`,
    `unionArmObjectType`); its §Fix threads arms only from the top-level `|`
    split, and its residual list (array-arm sources, record-shaped skipped
    arms, literal-less identical field sets) does not include alias arm
    sources or the alias-of-union spelling.
  - 0427 (fixed 0.437.0) — routed 2+-arm aliases to the bare
    `discriminated-union` terminal (its §Fix: "the discriminated-union
    terminal here carries NO arm-rename"), deferring arm renames to 0425's
    ground — which the 0425 fix does not reach for this spelling. Its
    original §Related had already flagged the constraint: "once an
    alias-union classifies as a union terminal, its render joins /04's
    rename question; the two fixes should agree." They do not.
  - 0426 (fixed 0.432.0) — wrote the QRY-18 union row + value-driven note
    the `p: UU` face now diverges from.
  - [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md) — the non-union positions of alias
    blindness (array element, schema field); disjoint machinery. Both fixes
    may share a 1-arm alias-chase helper — coordination, not merge; whoever
    lands first should export it.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/frontmatter.ts:1256–1261` — `toSystemParamType`'s 2+-arm
    alias route returns bare `{ kind: "discriminated-union" }` without
    calling `buildSystemUnionArms(arms, bodyTypes)` — the arms are IN HAND
    (`bodyTypes.aliasArms.get(s)`, `:1220`) and the builder is 180 lines up.
  - `src/parser/frontmatter.ts:1083–1090` — `buildSystemUnionArms` keeps an
    arm only when it is the DIRECT name of a body object schema
    (`schemas.has(s)` + `fields !== undefined`); an alias arm (`A`) passes
    the first test and is skipped by the second, with no `aliasArms` chase.
  - `src/parser/system-interpolation.ts:448–459` — the arms threading the
    bare terminal never receives, so `:457–458` emits the arm-less
    value-driven part and `renderSystemPrompt` (`:572–577`) has no
    `unionArms` to pick through.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt`; scratch vitest run and deleted.

## Summary

Bug 0425 gave the `system:` union terminal per-arm rename data with a
render-time arm pick; bug 0427 gave alias declarations a real classification.
Composed, the coverage has a hole neither residual list records: the
arm-threading runs ONLY from the inline top-level `|` split, and the alias
route mints the arm-less terminal. Three spellings of the same union of two
renamed schemas — inline `'Cat | Dog'`, alias-of-union `UU`, union-of-aliases
`'A | B'` — render the same conforming value two different ways in one
document: the inline spelling translates (`{"K":"cat","N":"Tom"}`), both
alias spellings render theta-side (`{"kind":"cat","name":"Tom"}`), all with
zero diagnostics.

## Reproduction

At 401a425b, offline, `parseDoc` → `renderSystemPrompt`. Body declares:

```theta
schema Cat { kind as "K": "cat", name as "N": string }
schema Dog { kind as "K": "dog", breed: string }
```

plus per row: `schema UU = Cat | Dog` (row 1), `schema A = Cat` /
`schema B = Dog` (row 2). Render input everywhere
`{p: {kind: "cat", name: "Tom"}}` — field-set-unique for `Cat`, literal
discriminator matching:

| params | observed | expected wire form |
|---|---|---|
| `p: UU` | `P: {"kind":"cat","name":"Tom"}` | `P: {"K":"cat","N":"Tom"}` |
| `p: 'A | B'` | `P: {"kind":"cat","name":"Tom"}` | `P: {"K":"cat","N":"Tom"}` |
| control `p: 'Cat | Dog'` | `P: {"K":"cat","N":"Tom"}` (b0425 W-class, green) | — |

Zero error diagnostics on all rows (the alias unions carry literal
discriminators, so no `missing-discriminator` fires).

## Expected behaviour

- `query-escapes-stringification.md:28` + `:35`: a union-typed interpolation
  whose resolved value is an object takes the Schema-typed-object row with
  the arm pick — brand first, else exact theta-side field set plus literal
  discriminator. For `p: UU` the union's arms are `Cat` and `Dog`
  (`schemas.md:60` — the alias is transparent), both body object schemas
  named directly; the value's field set uniquely matches `Cat`; the
  prescribed render is `{"K":"cat","N":"Tom"}`.
- Bug 0427's own design sentence (`frontmatter.ts:1253`: "naming the union
  via an alias must not change its render") — currently false for every
  renamed-arm union.
- Internal consistency across three spellings the spec presents as one
  construct (`schemas.md:50–60`; bug 0408 established the inline/alias
  render-parity argument this surface already accepted once).

## Actual behaviour / root cause

Two seams in series, one per face:

1. `toSystemParamType`'s 2+-arm alias route (`frontmatter.ts:1256–1261`)
   returns the bare terminal. The WHY comment defers arm renames to "bug
   0425's ground", but 0425's shipped call site is the inline `|` split
   (`:1172–1179`) — the alias route never reaches it.
2. `buildSystemUnionArms` (`:1083–1090`) requires each arm source to be a
   direct body-object-schema name; an alias arm has `fields === undefined`
   and is skipped without consulting `aliasArms`, so `'A | B'` yields zero
   arms and the caller keeps the bare shape.

With no `unionArms` on the part, `renderSystemPrompt` takes the plain
value-driven object row (`system-interpolation.ts:457–458, 572–577`) and
`stringifyInterpolatedValue` serialises theta-side
(`query-render.ts:420–430` class).

## Why it matters

- The natural refactor 0427 §Why-it-matters already argued — naming a union
  once (`schema UU = Cat | Dog`) instead of repeating `'Cat | Dog'` at each
  param — silently flips every rendered key of conforming values from wire
  to theta-side, teaching the model names the typed-response contract for
  the same union refuses.
- The `p: UU` face is a spec-vs-implementation divergence AGAINST the
  freshly-adjudicated QRY-18 note (0426, three review rounds): the note's
  arm-pick clause describes behaviour the alias spelling does not get, so
  either the bytes or the note must move — leaving both as-is re-opens the
  0426 class (normative text a second implementer cannot reproduce bytes
  from).

## Non-goals

- Which VALUES pick which arm (ambiguity, no-match, literal-less identical
  field sets) — bug 0425 R2/R3 pinned dispositions, untouched: the fix here
  reuses `unionArmObjectType` unchanged, so a value matching zero or two
  arms keeps today's untranslated bytes.
- Array-typed arm sources (`Cat | array<Cat>`) — spec-pinned untranslated
  (`query-escapes-stringification.md:35`, "An `array<T>` arm … form[s] no
  translating arm"), bug 0425 residual 1 as adjudicated by 0426.
- Non-union alias positions — [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md).
- Imported alias arms — the imported class is [bug 0445](./0445-imported-renames-static-container-positions.md)
  and bug 0423's ground.
- The `@`-query surface — brand-driven, conforms.

## Fix

Thread the existing arm machinery through both alias spellings:

- (a) **Alias route calls the builder** (face 1): in the 2+-arm dispatch
  (`frontmatter.ts:1256–1261`), return
  `buildSystemUnionArms(arms, bodyTypes)` threaded exactly as the inline
  split does (`:1176–1179`) — arms carrying renames translate, arm sources
  the builder skips keep the conservative fall-through. One call, no new
  mechanism; the render side needs nothing (the part-threading at
  `system-interpolation.ts:448–456` already handles arms).
- (b) **Alias-chase arm sources** (face 2): in `buildSystemUnionArms`
  (`:1083–1090`), when an arm source's `fields === undefined`, follow a
  1-arm `aliasArms` chain (seen-set guarded, the /02 helper if that lands
  first) to a terminal body object schema before the keep/skip decision; a
  multi-arm alias RHS inside an arm (union-in-union) stays skipped
  (conservative). This face should land WITH (a) or the three-spelling
  divergence just narrows rather than closes.
- Spec side: if the parent adjudication instead BLESSES the alias skips, the
  QRY-18 note's "directly" needs an explicit alias clause (0426's precedent:
  wording must let a second implementer derive the bytes) — but that route
  contradicts `frontmatter.ts:1253`'s stated intent and keeps the
  three-spelling divergence; not recommended.

Constraints: `b0425` 9/9 witnesses stay green (kept-arm behaviour, W5/R1
never-guess cells unchanged); `b0427` witnesses stay green (the alias union
still classifies `discriminated-union`); `b0408` G2/G3 unchanged;
rename-free alias unions stay byte-identical; both probe rows flip in the
same commit as new witnesses.

## Provenance

Fresh composition find (wave-6 seed: "unions of aliases" / new-machinery
seams). Probed at 401a425b with scratch vitest
`tests/scratch-render-sidecars-6.test.ts` (rows C2c, C2d red; C2d-control
green; deleted). The two fixes' non-meeting verified by code read:
`buildSystemUnionArms` call sites (`frontmatter.ts:1177` only) vs the alias
2+-arm return (`:1261`); QRY-18 note wording read at
`query-escapes-stringification.md:35` as amended by bug 0426 (0.432.0).
