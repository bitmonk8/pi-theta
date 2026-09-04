# Bug 0444 — An `array<T>`-typed `system:` param whose ELEMENT is a union of renamed schemas renders every element theta-side: `xs: 'array<Cat | Dog>'` (and the alias spelling `array<UU>`) take the static array row with no sidecars, though the row's translation clause is unconditional

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — theta-side names silently reach the child's
  system prompt on registering documents; the static `array<T>` row's
  recursive-translation clause has no union carve-out (the QRY-18 value-driven
  note's untranslated classes are union-ARM and opaque-VALUE clauses — a
  static `array<union>` param matches neither), so unlike the spec-pinned
  `Cat | array<Cat>` array-arm case this class has no blessing sentence;
  never a WRONG wire name. D2 because the element position needs the
  bug-0425 arm-pick machinery (per-element!), not just a sidecar map — a
  design decision on where the pick runs (construction vs render) is owed.
- **Kind:** defect —
  `docs/spec_topics/query/query-escapes-stringification.md:26` (the
  `array<T>` row: compact `JSON.stringify` "with wire-name translation
  applied recursively") and `:36` ("the theta-side names an author writes
  never appear in the rendered prompt"), applied to `system:` by `:16` and
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`.
  The value-driven note (`:35`) does not govern this param: its subject is
  "a union-typed interpolation … and an opaque imported-`.thetalib`-schema
  interpolation" — `array<Cat | Dog>`'s static type is `array<T>`, which has
  its own table row, and the note's untranslated list ("An `array<T>` arm,
  an inline-object or imported-schema arm, and an opaque imported-schema
  object value") names union ARMS and opaque VALUES, not array ELEMENTS.
  Not a designated residual: bug 0425 residual 1 covers the array-ARM-of-a-
  union direction (`Cat | array<Cat>`, since spec-pinned by 0426); the dual
  — union-as-array-element — appears in no residual list and no spec
  sentence.
- **Related:**
  - 0425 (fixed 0.431.0) — built the whole-value arm pick
    (`unionArmObjectType`) this class needs per element; its residual 1 is
    the mirror-image direction (array arm inside a union), which bug 0426
    then pinned as untranslated spec-side. This report's class is the
    direction that pin does NOT reach. The position contrast, decisively:
    0425 R1's subject is `union{…, array<T>}` — an array ARM SOURCE of a
    UNION-typed param (value-driven row); this report's subject is
    `array<union>` — a union ELEMENT SOURCE of an ARRAY-typed param (static
    row, `namedSchemaOf` → `undefined`).
  - 0426 (fixed 0.432.0) — the spec wording that pins the neighbouring
    classes; cited to bound what is already adjudicated.
  - 0407 (fixed 0.405.0) — made `array<Schema>` (non-union element)
    translate; the asymmetry this report measures is against that fixed
    class.
  - [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md) — `array<A>` (1-arm alias element) is
    that report's ground; `array<UU>` (union alias element) is this one's,
    because resolving it terminates in a union needing the arm pick, not a
    sidecar map. Coordination: `array<UU>` needs BOTH /02's alias-chase AND
    this report's `elementArms` slot — landing this fix first leaves the
    `array<UU>` row red unless it alias-chases the element source itself;
    landing /02 first fixes only `array<A>`, never `array<UU>`.
  - [bug 0443](./0443-union-alias-spellings-drop-arm-translation.md) — the same union arms at the direct param
    position; a shared fix shape (thread `SystemUnionArm[]`) serves both.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/parser/frontmatter.ts:1180–1193` — the `array<...>` param arm:
    element classification is `namedSchemaOf(element, …)` (`:1187`), which
    returns `undefined` for a union source (`Cat | Dog`) and an alias name
    whose RHS is a union (`UU`) funnels into `buildOutboundSidecars`'s
    fields-undefined refusal (`:904–906`) — either way
    `{ kind: "array" }` with no sidecars.
  - `src/parser/system-interpolation.ts` — `SystemParamType`'s array kind
    carries only `sidecars`/`rootDef`, no arm list; the array
    `InterpolationType` (`toInterpolationType`, `:490–495`) likewise —
    there is no slot an element-level arm pick could read today.
  - `src/render/query-render.ts:416–430` — with `type.sidecars ===
    undefined` the array row serialises the theta-side value unchanged.
  - Contrast: `src/runtime/wire-translation.ts:628–636` — the array branch
    maps elements under ONE sidecar; even with sidecars supplied, a
    two-schema union element needs a per-element pick the walk does not
    have — the machinery gap is real, not just unwired.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt`; scratch vitest run and deleted.

## Summary

`array<Cat>` translates since bug 0407; a `Cat | Dog` param translates per
arm since bug 0425. Compose them — `array<Cat | Dog>` — and the element
classification (`namedSchemaOf`) recognises neither a union source nor a
union alias, so the param carries no translation data at all and every
element renders theta-side. The static `array<T>` row's translation clause
is unconditional; no value-driven carve-out reaches a static array param.
The same elements one position shallower (the bare union param) translate.
This is NOT bug 0425 residual 1: R1's subject is a UNION-typed param with an
array ARM (`Cat | array<Cat>`, value-driven row, spec-pinned untranslated by
0426); this class is an ARRAY-typed param with a UNION element (static
`array<T>` row, no pin). The side-by-side scratch cells make the split
decisive: C3a (`Cat | array<Cat>`, array value) is red-but-pinned; C3b
(`array<Cat | Dog>`) is red with no blessing sentence.

## Reproduction

At 401a425b, offline, `parseDoc` → `renderSystemPrompt`. Body declares
`schema Cat { kind as "K": "cat", name as "N": string }`,
`schema Dog { kind as "K": "dog", breed: string }` (row 2 adds
`schema UU = Cat | Dog`). Render input
`{xs: [{kind: "cat", name: "Tom"}]}`:

| params | observed | expected wire form |
|---|---|---|
| `xs: 'array<Cat | Dog>'` | `P: [{"kind":"cat","name":"Tom"}]` | `P: [{"K":"cat","N":"Tom"}]` |
| `xs: 'array<UU>'` | `P: [{"kind":"cat","name":"Tom"}]` | `P: [{"K":"cat","N":"Tom"}]` |

Zero error diagnostics on both rows. Controls on the same HEAD (green,
scratch-verified): `xs: 'array<Cat>'` → `[{"K":"cat","N":"Tom"}]` (b0407
class); `xs: 'array<array<Cat>>'` → `[[{"K":"cat","N":"Tom"}]]`;
`p: 'Cat | Dog'` with the element value → `{"K":"cat","N":"Tom"}` (b0425
class).

## Expected behaviour

- `query-escapes-stringification.md:26`: the `array<T>` row renders "with
  wire-name translation applied recursively" — no clause conditions the
  translation on the element type's shape, and `:36` bars the theta-side
  names outright.
- The element values are Schema-typed objects at runtime; the arm-resolution
  rule the corpus already states for union values (`:35` — brand, else exact
  field set + literal discriminator, else untranslated) is the natural
  per-element reading; a value matching no arm keeps untranslated bytes
  (never guess).
- The AJV lowering for `array<Cat | Dog>` constrains items against the
  wire-named arms (`properties.K` / `properties.N`), so the render again
  teaches names the contract refuses.

## Actual behaviour / root cause

`toSystemParamType`'s array arm has exactly one element classifier —
`namedSchemaOf` → `buildOutboundSidecars` (`frontmatter.ts:1186–1190`) —
which produces sidecars for object-schema elements only. A union element
yields `{ kind: "array" }` bare; the render's array row then has nothing to
translate with (`query-render.ts:420–430`). Deeper, the type model has no
slot for per-element arms: `SystemParamType`'s array variant and the array
`InterpolationType` carry a single `sidecars`/`rootDef` pair, and
`lowerOutbound`'s array branch maps every element under one sidecar
(`wire-translation.ts:628–636`) — a per-element pick point does not exist
yet. 0425 R1's mechanism is different in kind: there `buildSystemUnionArms`
DROPS an array arm source of a union-typed param; here the array-typed
param's element classifier never looks for a union at all — different
classifier, different missing machinery (an `elementArms` slot vs unwrapping
an arm source).

## Why it matters

- Arrays of discriminated unions are the ordinary "list of polymorphic
  records" idiom (the 0425 §Why-it-matters argument, one container out);
  widening `array<Cat>` to `array<Cat | Dog>` is the same
  backwards-compatible-looking change 0425 documented, silently flipping
  every rendered element key of the `Cat` values already flowing.
- The gap is invisible: zero diagnostics, plausible bytes, and the sibling
  spellings (bare union; non-union array) both translate, so the author has
  no reason to suspect this one.

## Non-goals

- The array-ARM-of-a-union direction (`Cat | array<Cat>` carrying an array
  value) — spec-pinned untranslated
  (`query-escapes-stringification.md:35`), bug 0425 residual 1 as
  adjudicated by bug 0426. Verified reproducing at this HEAD (scratch row
  C3a) and NOT filed, per that pin.
- Which element picks which arm under ambiguity — inherits bug 0425's
  R2/R3 pinned dispositions unchanged (never guess; untranslated on zero or
  ≥2 admitting arms).
- 1-arm alias elements (`array<A>`) — [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md).
- Imported elements (`array<Author>`) — [bug 0445](./0445-imported-renames-static-container-positions.md).

## Fix

Give the array element position the union machinery. Options:

- (a) **Element arms on the array type**: when the array ELEMENT source
  splits on top-level `|` (or alias-chases to a 2+-arm RHS), build
  `buildSystemUnionArms(elementArms, bodyTypes)` and carry them as
  `elementArms` on the array `SystemParamType`/`InterpolationType`; the
  render's array row (or `renderSystemPrompt` before it) maps elements
  through `unionArmObjectType` per element, translating picked elements and
  leaving unmatched ones untranslated. Mirrors 0425's shape exactly
  (never-guess preserved per element), contained in the same three files as
  0406–0408/0425. Recommended.
- (b) **Render-side value-driven elements**: mark union-element arrays
  value-driven and re-classify each element at render by runtime kind +
  arms. Converges with (a) at the render loop but gives up the static array
  row for these params (scalar elements of mixed unions would change row
  semantics) — larger blast radius, not recommended.

Constraints: single-schema `array<Cat>` stays on the existing one-sidecar
path byte-identically; `b0407` W2, `b0424` W2, `b0425` 9/9 stay green; a
heterogeneous element list translates each element independently (one
unmatched element must not un-translate its siblings — decide and witness
this explicitly); both probe rows flip in the same commit as witnesses.

## Provenance

Fresh composition find (wave-6 seed: `array<array<Schema>>` /
renamed-composition seams; the dual of designated seed 3, which 0426's spec
amendment closed). Probed at 401a425b with scratch vitest
`tests/scratch-render-sidecars-6.test.ts` (rows C3b, C2f red; controls C4,
C2d-control green; row C3a reproduced and set aside per the 0426 pin;
deleted). Spec wording read at `query-escapes-stringification.md:26, 35–36`
as amended by bug 0426 (0.432.0).
