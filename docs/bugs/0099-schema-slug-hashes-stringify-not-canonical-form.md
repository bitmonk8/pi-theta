# Bug 0099 — `respondSchemaSlug` hashes `JSON.stringify(lowered)` where schema-subset.md §Canonical schema hash step 2 pins a keys-sorted canonical form, so every name it mints (`__theta_respond_<slug>`, `__theta_bind_<slug>`) reads insertion-order keys and JS number syntax: one lowered fragment carries two slugs in one build — `81e7d0e308042785` at the respond mint, `abb2fcd8521f6115` at the `__inline_` mint, which does implement the recipe — while the production AJV validator-cache key is the whole JSON string with no digest at all

- **Status:** open. §Fix is constraint-pinned, not settled: two routes are
  stated (move the implementation to the recipe; move the recipe to the
  implementation), with the constraints each must satisfy. The choice is not
  made here.
- **Kind:** defect, three elements on one recipe. schema-subset.md `:98–107`
  defines one canonical schema hash — input the lowered fragment, canonical
  form with object keys sorted by Unicode code point and numeric `const` /
  `enum` literals rendered by BNDR-4 / BNDR-5, SHA-256, first 16 lowercase hex
  — and `:108` names the four synthesised-name forms it mints into. The tree
  carries two mints and one cache key against that one recipe:
  1. *`respondSchemaSlug` hashes the emitted serialisation, not the canonical
     form.* `src/runtime/typed-query-validation.ts:347–348` is
     `createHash("sha256").update(JSON.stringify(lowered))`. `JSON.stringify`
     walks own-property insertion order and uses `Number.prototype.toString`,
     so the digest reads the emission order the lowering happens to have
     produced and the JS number syntax, not the sorted keys and the pinned
     numeric rendering of step 2. Two of the four synthesised names are minted
     from it (`__theta_respond_<slug>`, `__theta_bind_<slug>`).
  2. *The PIC-44 registration cache stores stringify bytes under the name
     "canonical-form bytes".*
     `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:9`
     requires the cache to store "the canonical-form bytes alongside the
     registered name so the equality check is a byte comparison";
     `src/extension/production-theta-producer.ts:2620` stores
     `JSON.stringify(lowered)`. The comparison at
     `src/runtime/tool-registration.ts:281` is therefore between two emitted
     serialisations, and the `theta/runtime/registration-cache-collision` hint
     (`:297`) reports those bytes.
  3. *The per-query validator-cache key is not a slug.*
     `docs/spec_topics/pi-integration-contract/host-interfaces-services.md:46`
     (PIC-11) keys that cache "by the schema slug of the lowered per-query
     schema document (per Canonical schema hash)". The production wiring
     `src/extension/production-composition.ts:308–311` returns
     `{ slug: JSON.stringify(schema), canonicalBytes: JSON.stringify(schema) }`
     — no digest, no truncation, the whole JSON document used as the map key
     and interpolated into the `theta/runtime/validator-cache-collision`
     message (`src/seams/schema-validator.ts:133`).
- **Related:**
  - [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) —
    **fixed (0.59.0)**, and the filing origin. Its §Fix *Residuals* (iv)
    (`:277–281`) records this report's subject: "`respondSchemaSlug` hashes
    `JSON.stringify(lowered)` rather than the key-sorted canonical form
    `schema-subset.md:99–105` defines, which is why emission order is
    contractual here at all. Unfiled and unchanged." That fix made
    `type`-before-`enum` emission order load-bearing (`:157–160`: "That order
    is contractual, not cosmetic … `type`-first is precisely what collapses the
    two spellings onto one slug"). Under the recipe as written, key order is
    irrelevant to the digest and no such contract would exist. Its residual (v)
    (`:281–285`) already records both key orders of the fixture this report
    re-derives (`type`-first `16d4106209c9ee70`, `enum`-first
    `1aae0990d53b3485`); the second value is the spec-recipe slug of the fixed
    emission, re-derived independently in §Reproduction.
  - [0054](./0054-inline-slug-merges-unchecked-across-mint-scopes.md) —
    **open**, the slug sibling, and disjoint from this report. 0054 is about
    *where* the §Schema-slug collision posture byte comparison runs — the
    `__inline_<slug>` fragments minted in three scopes meet at a `$defs` merge
    that dedups by name with no byte comparison. This report is about *what
    bytes* the hash and the comparison read. 0054's frame is the canonical mint
    (`schemaSlug`); this report's three elements are the stringify sites, which
    0054 does not touch. Neither fix orders before the other:
    0054 adds a comparison at merge sites, this one changes the serialiser
    those sites compare with. If both land, 0054's merge-site comparison
    inherits whichever bytes this report settles on.
  - [0097](./0097-params-brace-union-rhs-one-field-list.md) — **open**, and the
    source of the two-slug demonstration in §Reproduction. Its §Reproduction
    pins the mis-parsed `params:` fragment under `__inline_abb2fcd8521f6115`
    (`:280–284`); `tests/annotation-root-brace-union-lowering.test.ts:402–408`
    pins the byte-identical fragment under `respondSchemaSlug`
    `81e7d0e308042785`. The two values are the same fragment through the two
    recipes.
  - [0098](./0098-nonstring-literal-union-emission-unspecified.md) — **open**,
    and the reason the numeric row in §Reproduction is weaker evidence than the
    key-order rows. That report finds no step-3 emission rule covering a union
    of non-string literals, so the `{"enum":[1e-8,2]}` fragment this report
    hashes has no spelled bytes to hash. The key-order divergence does not
    depend on it: it is demonstrated on `schema-subset.md:80` (the enum /
    string-literal-union emission) and `:78` (the object emission), both
    spelled. Whichever emission 0098 settles on, the numeric clause of step 2
    (`:102`) still governs the resulting `enum` values.
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — **fixed
    (0.53.0)**. Its lock pins two `respondSchemaSlug` hex constants
    (`tests/union-generic-arm-lowering.test.ts:896`, `:898`), one of which
    moves under route A (§Fix).
  - [0010](./0010-typed-forced-respond-user-visible-no-toolchoice.md) —
    **fixed (0.20.0)**, the report that built `respondSchemaSlug` and its
    three-consumer rationale (`src/runtime/typed-query-validation.ts:340–346`).
- **Affected** (every citation verified at HEAD `0b1e20ab`, 0.59.0):
  - `src/runtime/typed-query-validation.ts:347–348` — **the frame.**
    `respondSchemaSlug`, one expression. Its doc comment (`:336–346`) calls the
    recipe "the same canonical-hash spirit as the schema-subset slug"; "spirit"
    is accurate and the bytes differ.
  - `src/runtime/typed-query-validation.ts:194–195` — the `TypedQueryValidator`
    constructor's slug and its default tool name
    (`"__theta_respond_" + this.#slug`).
  - `src/extension/production-theta-producer.ts:2617` — the respond-tool mint;
    `:2620` — the stored `canonicalFormBytes: JSON.stringify(lowered)`;
    `:2606–2610` — the in-tree statement that "the canonical-form bytes are
    `JSON.stringify(lowered)`".
  - `src/extension/production-theta-producer.ts:735` — the binder envelope's
    slug, `respondSchemaSlug(envelopeSchema)`; `:753` — `binderToolName(slug)`.
    `src/binder/binder-inference.ts:97–104` describes that slug as produced by
    "the same canonical-schema-hash recipe the typed-query
    `__theta_respond_<slug>` tool name uses"; both are the stringify recipe.
  - `src/extension/production-composition.ts:306–312` — the production
    `slugOf`, element 3.
  - `src/seams/schema-validator.ts:62–74` (`SchemaSlug` / `SchemaSlugFn`, whose
    comment at `:69–70` states "Production wiring supplies the canonical
    schema-hash recipe"), `:117` (the cache lookup), `:133` (the collision
    message that interpolates the key).
  - `src/runtime/tool-registration.ts:199–213` (`RegistrationEntry`), `:281`
    (the byte comparison), `:297` (the collision hint), `:308–313`
    (`contentAddressedName`, which splices the slug into
    `__theta_respond_<slug>` and `__theta_callee_<slug>__<tail>`).
  - `src/parser/schema-lowering.ts:43–56` (`LoweredJsonValue` /
    `LoweredObjectEntry`), `:65–94` (`canonicalForm`), `:103–120`
    (`compareCodePoint`), `:121–125` (`canonicalHash`), `:131–133`
    (`schemaSlug`) — **the conforming implementation that already exists.** It
    sorts keys by code point, emits no insignificant whitespace, delegates
    numeric `const` / `enum` rendering to `renderCanonicalNumber`
    (`src/render/canonical-number.ts:74–81`, BNDR-4 / BNDR-5, selected on the
    caller-supplied kind discriminator per `:66–72`) and leaves array order
    alone. Route A's shared function is this one.
  - `src/parser/params.ts:691–694` — `hoistInlineObjectType`'s `__inline_<slug>`
    mint, which calls `canonicalForm` and `schemaSlug`. This is the one of the
    four synthesised-name forms that follows the recipe; it is **not** a
    stringify site. Its `toLoweredJsonValue` bridge (`:772–806`) states the
    property explicitly at `:780–782`: "Object entries are walked in insertion
    order; `canonicalForm` sorts them by Unicode code point before hashing."
  - `src/parser/body-type-lowering.ts:100` (`lowerEnumToSchema`, `type` first),
    `:384` (the literal-union arm, `type` first), `:130–137`
    (`lowerObjectFields`, emitting `type`, `properties`, `required`,
    `additionalProperties`, then `$defs`) — the emission orders the stringify
    digest reads. None of them is sorted: `lowerObjectFields`'s order is the
    sorted order with its first and last swapped (`type` is emitted first and
    sorts last, `additionalProperties` is emitted last and sorts first), so
    every object fragment diverges.
  - `docs/spec_topics/schema-subset.md:94` (the recipe "is part of the on-disk
    and on-wire contract"), `:98` (step 1, input), `:99–105` (step 2, canonical
    form), `:106` (step 3), `:107` (step 4), `:108` (step 5, the four
    synthesised names), `:110` (the key-sorting-is-independent-of-emission-order
    note and its "reproducible" rationale), `:112` (§Schema-slug collision
    posture, which requires canonical-form bytes at each slug-keyed site).
    Route B rewrites `:99–105` and `:110`.
  - `docs/reference/schema-subset.md:198–206` (the mirrored recipe), `:222–224`
    (the mirrored independence note) — moves with route B.
  - Pinned hex constants that re-derive under route A:
    `tests/literal-union-string-enum-emission.test.ts:439`
    (`SEV_SLUG = "16d4106209c9ee70"` → `1aae0990d53b3485`; the comments at
    `:95` and `:433` carry the same value);
    `tests/union-generic-arm-lowering.test.ts:898`
    (`MIS_SLICED_ARRAY_SLUG = "4718677af1cfaad3"` → `5483e69d7515873a`;
    comments at `:87`, `:891`);
    `tests/annotation-root-brace-union-lowering.test.ts:408`
    (`MISPARSED_ROOT_SLUG = "81e7d0e308042785"` → `abb2fcd8521f6115`; comments
    at `:104`, assertion at `:813`).
  - Pinned hex constants that do **not** move:
    `tests/union-generic-arm-lowering.test.ts:896`
    (`PERMISSIVE_SLUG = "44136fa355b3678a"` — `{}` has no keys);
    `tests/literal-union-string-enum-emission.test.ts:97`, `:433`
    (`3738bdf57eb9ee93`, the pre-0055 bare `{"enum":[…]}` form, one key);
    `tests/inline-slug-name-reservation.test.ts:507` (`e39f064476c952aa`) and
    `tests/params-block-mapping-rhs-refusal.test.ts:742` (`6a8e2246094f0455`),
    both already derived from `canonicalForm`.
  - Test files that derive the name from the function rather than pinning it,
    and so stay green under either route:
    `tests/binder-forced-tool-dispatch.test.ts:662`,
    `tests/off-session-two-phase.test.ts:329`,
    `tests/off-session-transport-classification.test.ts:193`,
    `tests/typed-repair-two-phase.test.ts:228`.
  - Not affected: the `__theta_callee_<slug>__<post-rename-name>` form. Its
    name construction exists (`src/runtime/tool-registration.ts:311`) but no
    production site constructs a `kind: "callee"` `RegistrationEntry` at HEAD
    (`rg '"callee"' src/` finds only the type declaration at
    `src/runtime/tool-registration.ts:201` and the branch at `:310`), so that
    form is unminted and carries no bytes either recipe can move.
- **Observed at:** `0.59.0` (HEAD `0b1e20ab`). Offline, deterministic; no live
  model and no provider. Scratch vitest over `parseThetaDocument` (the shipped
  load path), `lowerQueryResponseSchema`, `respondSchemaSlug`, `canonicalForm`,
  `schemaSlug`, and a `node:crypto` oracle recomputed independently of both;
  written, run, deleted.

## Summary

schema-subset.md defines one canonical schema hash (`:98–107`) and names the
four synthesised-name forms it mints into (`:108`). Step 2 pins the hash input
to a *canonical form*: object keys sorted by Unicode code point, no
insignificant whitespace, numeric `const` / `enum` literals rendered by the
binder's BNDR-4 / BNDR-5 algorithm, array order untouched, RFC 8259 minimal
string escapes. `:110` gives the reason the sort exists — the emitted `$defs`
entry keeps theta-source field order while the digest does not depend on it, so
the digest is reproducible.

`src/parser/schema-lowering.ts` implements that recipe, and `__inline_<slug>`
uses it. `respondSchemaSlug`
(`src/runtime/typed-query-validation.ts:347–348`) does not: it hashes
`JSON.stringify(lowered)` over the in-memory fragment. `JSON.stringify` emits
own-property insertion order and `Number.prototype.toString` syntax, so the two
digests agree only when the fragment's emission order already equals its sorted
order and no numeric literal falls in the ranges where JS switches to
exponential notation. For the fragment shapes the lowering actually emits —
`{"type":"string","enum":[…]}` for an enum or string-literal union,
`{"type":"object","properties":…,"required":…,"additionalProperties":false}`
for an object, `{"type":"array","items":…}` for `array<T>` — insertion order is
never sorted order, so the divergence is the common case rather than the
corner.

Two of the four synthesised names are minted from the diverging function:
`__theta_respond_<slug>` (`src/extension/production-theta-producer.ts:2617`)
and `__theta_bind_<slug>` (`:735`, `:753`). `__inline_<slug>` uses the
conforming one, so the same lowered fragment carries two different slugs in one
build:
`{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],"additionalProperties":false}`
is `abb2fcd8521f6115` as a `$defs` key and `81e7d0e308042785` as a respond-tool
name. `__theta_callee_<slug>__<tail>` has no production mint at HEAD.

Two adjacent sites read the same wrong bytes. The PIC-44 registration cache
stores `JSON.stringify(lowered)` as its "canonical-form bytes"
(`src/extension/production-theta-producer.ts:2620`), so its byte-equality check
compares emitted serialisations. The production per-query validator-cache
`slugOf` (`src/extension/production-composition.ts:308–311`) skips steps 3 and
4 entirely and uses the JSON string itself as the map key.

Within one build every consumer of `respondSchemaSlug` agrees, so nothing
mis-dispatches today. What breaks is the property the recipe exists for: a
second implementation, a spec-derived fixture generator, or any replay of a
recorded provider payload computes different names from the same lowered
schema. The cost is already visible in the tree — bug 0055 had to make
`type`-before-`enum` emission order contractual to collapse two spellings onto
one slug, a constraint the recipe as written makes unnecessary.

## Reproduction

Offline at HEAD `0b1e20ab`, 0.59.0. Probe output quoted; the two fragment
lines too long for the page are wrapped at column 78 with continuation
indented, and nothing else is altered. Each row loads
`---\nmode: prompt\n---\nlet r = @<T>\`hi\`\nr\n` through `parseThetaDocument`
for the diagnostics column, then lowers the same annotation through
`lowerQueryResponseSchema` and hashes the result twice: `impl slug` is
`respondSchemaSlug` (`src/runtime/typed-query-validation.ts:347`), `spec slug`
is `schemaSlug` over the canonical form (`src/parser/schema-lowering.ts:131`).
The `sanity oracle` line is an independent `node:crypto` SHA-256 over the two
printed byte strings of the last fragment; it reproduces both slugs.

### One lowered fragment, two digests

```
@@ literal-union  @<"low" | "high">
   diags     []
   emitted   {"type":"string","enum":["low","high"]}
   canonical {"enum":["low","high"],"type":"string"}
   impl slug 16d4106209c9ee70
   spec slug 1aae0990d53b3485
@@ object  @<{ status: "ok" | "degraded", summary: string }>
   diags     []
   emitted   {"type":"object","properties":{"status":{"type":"string","enum":["ok","degraded"]},
              "summary":{"type":"string"}},"required":["status","summary"],
              "additionalProperties":false}
   canonical {"additionalProperties":false,"properties":{"status":{"enum":["ok","degraded"],
              "type":"string"},"summary":{"type":"string"}},"required":["status","summary"],
              "type":"object"}
   impl slug 5d7d69a5e16ffc41
   spec slug 9fdc8409b8f563c6
@@ array  @<array<string>>
   diags     []
   emitted   {"type":"array","items":{"type":"string"}}
   canonical {"items":{"type":"string"},"type":"array"}
   impl slug d7a19ad6de43b74d
   spec slug 681004346c78d5f3
@@ num-small  @<0.00000001 | 2>
   diags     []
   emitted   {"enum":[1e-8,2]}
   canonical {"enum":[0.00000001,2]}
   impl slug cd442a2f8a5aa343
   spec slug 9ddfc87c59f526ab
@@ num-big  @<1000000000000000000000 | 2>
   diags     ["theta/parse/integer-literal-out-of-range"]
   emitted   {"enum":[1e+21,2]}
   canonical {"enum":[1000000000000000000000,2]}
   impl slug c2d56c82749d8b3d
   spec slug c50de9cf064df692
@@ permissive  @<Ghost>
   diags     ["theta/parse/unresolved-named-type"]
   emitted   {}
   canonical {}
   impl slug 44136fa355b3678a
   spec slug 44136fa355b3678a
@@ one fragment two mints
   {"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],
    "additionalProperties":false}
   __inline_  abb2fcd8521f6115
   respond    81e7d0e308042785
sanity oracle 81e7d0e308042785 abb2fcd8521f6115
```

Reading the rows:

- **Key order.** `literal-union`, `object` and `array` diverge on key order
  alone: no numeric literal, no exotic string. The literal-union row is bug
  0055's own fixture; the two values match the pair that report recorded at
  `:284–285`. The `object` row is the ordinary typed-query shape. The
  `permissive` row is the only object fragment that agrees, because `{}` has no
  keys to sort.
- **`type` before `enum`.** `{"type":"string","enum":[…]}` hashes
  `16d4106209c9ee70`; the canonical form sorts `"enum"` (U+0065) before
  `"type"` (U+0074) and hashes `1aae0990d53b3485`. Bug 0055's fix chose
  `type`-first to make the named-`enum` and alias-union spellings agree; under
  the recipe both orders hash alike and the choice would carry no bytes.
- **Object key order.** The emission order `type`, `properties`, `required`,
  `additionalProperties` (`src/parser/body-type-lowering.ts:130–137`) is the
  sorted order `additionalProperties`, `properties`, `required`, `type` with
  its first and last swapped. Every object fragment the lowering emits
  therefore diverges; with a `$defs` key present it sorts first (U+0024) and
  the emission puts it last.
- **Numeric rendering — live, not latent.** `0.00000001` is admitted at parse
  (`diags []`) and reaches the lowering as `1e-8`. `JSON.stringify` writes
  `1e-8`; step 2 requires the BNDR-5 fixed-point rendering `0.00000001`
  (`renderCanonicalNumber`, `src/render/canonical-number.ts:74–81`). That
  fragment's emission is itself unspecified — a union of non-string literals
  falls outside step 3's three literal rules, which is bug
  [0098](./0098-nonstring-literal-union-emission-unspecified.md)'s subject — so
  this row shows the numeric clause diverging on bytes the spec does not yet
  spell; the key-order rows above are on bytes it does (`:80`, `:78`). The
  large-magnitude case the recipe spells (`1e21 → 1000000000000000000000`) is
  **unreachable from source**: the `num-big` row raises
  `theta/parse/integer-literal-out-of-range` at lex
  (`src/lexer/lexer.ts:634–637`, per lexical.md `:28`, `|value| > 2^53 - 1`),
  so the fragment on that row exists only because the probe called the lowering
  directly. The two other cases the recipe names — `42.0 → 42` and `-0 → 0` —
  do **not** diverge: `parseLiteralArm`
  (`src/parser/body-type-lowering.ts:741–762`) routes both through `Number`,
  and `JSON.stringify` already writes `42` and `0`.
- **String escaping does not diverge.** `canonicalForm` implements the RFC 8259
  minimal-escape clause by calling `JSON.stringify` on the string
  (`src/parser/schema-lowering.ts:67–70`), and V8's `JSON.stringify` emits
  minimal escapes. Probed over `"a\u0007b"`, `"é"`, `"😀"`, `a"b` and `a\b`:
  byte-identical under both. Step 2's escaping clause is the one sub-rule the
  stringify recipe already satisfies.
- **Two mints, one fragment.** The last block hashes the fragment bug 0097
  pins (`:280–284`) and
  `tests/annotation-root-brace-union-lowering.test.ts:402–407` pins. As a
  `$defs` key it is `__inline_abb2fcd8521f6115` (canonical); as a respond-tool
  name it is `__theta_respond_81e7d0e308042785` (stringify). Both names are
  live in the same build.

### The validator-cache key is the whole document

`src/extension/production-composition.ts:308–311` returns the JSON string as
both `slug` and `canonicalBytes`, so for the `object` row above the production
`AjvSchemaValidator` cache key
(`src/seams/schema-validator.ts:117`) is the 173-character string
`{"type":"object","properties":{"status":…},"additionalProperties":false}` and
not `5d7d69a5e16ffc41` — nor `9fdc8409b8f563c6`. The cache still functions as a
cache (the key is injective over documents, so the byte comparison at `:123`
can never fail and `theta/runtime/validator-cache-collision` is unreachable
through this wiring), but it is not the slug PIC-11 names, and the collision
message at `:133` would interpolate a whole schema document where it says
`slug`.

## Expected behaviour

One recipe, one output. schema-subset.md `:98–107` defines the canonical schema
hash; `:108` names the four forms that mint from it; `:94` states that the
recipe is part of the on-disk and on-wire contract. A given lowered fragment
therefore has exactly one slug, and any implementation of the spec computes the
same 16 hex characters from the same fragment.

Concretely, for the fragments in §Reproduction:

- `{"type":"string","enum":["low","high"]}` → canonical form
  `{"enum":["low","high"],"type":"string"}` → slug `1aae0990d53b3485`, and the
  respond tool is `__theta_respond_1aae0990d53b3485`.
- The `object` row → `9fdc8409b8f563c6`.
- `@<0.00000001 | 2>` → canonical form `{"enum":[0.00000001,2]}` →
  `9ddfc87c59f526ab`.
- The two-mint fragment → `abb2fcd8521f6115` at both the `$defs` key and the
  respond-tool name.

`:110` states the invariant the sort buys: changing source-level field order
changes the emitted schema's property order but does not change the canonical
hash. At HEAD the second half does not hold for `__theta_respond_` /
`__theta_bind_`.

The two adjacent sites follow from the same recipe. PIC-44
(`tool-registration-lifetime.md:9`) requires the registration cache to store
canonical-form bytes; PIC-11
(`host-interfaces-services.md:46`) requires the per-query validator cache to be
keyed by the schema slug and to compare canonical-form bytes.

## Actual behaviour / root cause

`respondSchemaSlug` is one expression
(`src/runtime/typed-query-validation.ts:347–348`):

```ts
export function respondSchemaSlug(lowered: LoweredSchema): string {
  return createHash("sha256").update(JSON.stringify(lowered)).digest("hex").slice(0, 16);
}
```

`LoweredSchema` is `Readonly<Record<string, unknown>>`
(`src/seams/schema-validator.ts:14`) — a plain JS object, so `JSON.stringify`
walks own string keys in insertion order and renders numbers by
`Number.prototype.toString`. Steps 3 and 4 of the recipe are correct here
(SHA-256, first 16 hex, already lowercase). Step 2 is the whole divergence, and
of its four sub-rules exactly one is satisfied by accident:

| step 2 sub-rule | `JSON.stringify` |
| --- | --- |
| object keys sorted by Unicode code point | no — insertion order |
| no insignificant whitespace | yes — the one-argument form emits none |
| numeric `const` / `enum` by BNDR-4 / BNDR-5 | no — JS syntax, exponential at `\|v\| ≥ 1e21` and `\|v\| < 1e-7` |
| RFC 8259 minimal string escapes | yes |

The conforming implementation is already in the tree and is not a stub:
`canonicalForm` (`src/parser/schema-lowering.ts:65–94`) sorts entries with
`compareCodePoint` (`:103–120`, which iterates code points rather than UTF-16
units so astral keys order correctly), delegates numeric rendering to
`renderCanonicalNumber`, leaves array order alone, and escapes strings through
`JSON.stringify`. It reads a `LoweredJsonValue`
(`src/parser/schema-lowering.ts:43–50`) — an ordered-entry tree carrying an
explicit `integer` / `number` discriminator per numeric literal, which is what
BNDR-4 / BNDR-5 select on and what a plain JS object loses. `__inline_<slug>`
reaches it through `toLoweredJsonValue` (`src/parser/params.ts:784–806`), a
total bridge from the plain-object domain, and `hoistInlineObjectType` calls
both `canonicalForm` and `schemaSlug` (`:692–693`).

So the root cause is not a missing implementation. It is that the typed-query
seam predates it and was never routed through it: `respondSchemaSlug`'s own doc
comment (`:336–346`) claims "the same canonical-hash spirit as the
schema-subset slug", and `binderToolName`'s
(`src/binder/binder-inference.ts:97–102`) claims "the same
canonical-schema-hash recipe the typed-query `__theta_respond_<slug>` tool name
uses". The second sentence is true (both are `respondSchemaSlug`); the first is
false at the byte level.

Why the divergence is the common case rather than a corner: the recipe's sort
is total over keys, and none of the emitted key orders is sorted.
`lowerObjectFields` (`src/parser/body-type-lowering.ts:130–137`) writes `type`,
`properties`, `required`, `additionalProperties`, `$defs`; sorted order is
`$defs`, `additionalProperties`, `properties`, `required`, `type` — the exact
reverse. `lowerEnumToSchema` (`:100`) and the literal-union arm
(`:384`) write `type`, `enum`; sorted is `enum`, `type`. `array<T>` writes
`type`, `items`; sorted is `items`, `type`. Only single-key fragments
(`{"enum":[…]}`, `{"const":…}`, `{"$ref":…}`, `{"type":"string"}`) and `{}`
agree, which is why the pre-0055 bare `{"enum":["low","high"]}` form's slug
`3738bdf57eb9ee93` is stable across both recipes while the fixed
`{"type":"string","enum":[…]}` form's is not.

The 0055 interaction runs in the other direction. That fix chose
`type`-before-`enum` so the named-`enum` and alias-union spellings would hash
alike, and recorded the choice as contractual
(`docs/bugs/0055-…md:157–160`). That contract is a consequence of the
stringify recipe: under step 2 the two spellings hash alike whatever the
emission order, and the constraint disappears. The contract is recorded in the
report and in the witness header
(`tests/literal-union-string-enum-emission.test.ts:30`, "emits the spelled
bytes, `type` first"); `lowerTypeSource`'s doc comment
(`src/parser/body-type-lowering.ts:302–320`) states the emitted shape but not
the key-order rationale, so route A has no in-code note to retract at that
site.

Element 2 is the same bytes reaching the byte-equality check. PIC-44 asks for
canonical-form bytes so the check is a comparison rather than a
re-serialisation; `src/extension/production-theta-producer.ts:2620` supplies
`JSON.stringify(lowered)`. Because both sides of the comparison
(`src/runtime/tool-registration.ts:281`) are produced the same way, the check is
self-consistent and detects a genuine 64-bit collision correctly. It compares
the wrong artefact only in the sense that the stored bytes are not the ones the
slug is defined over.

Element 3 is a different failure. `slugOf`
(`src/extension/production-composition.ts:308–311`) never digests: it returns
the JSON string as the slug. The `SchemaSlugFn` seam comment
(`src/seams/schema-validator.ts:69–70`) states that "Production wiring supplies
the canonical schema-hash recipe", and production supplies no hash at all. Two
consequences follow from the key being injective over documents: the byte
comparison at `src/seams/schema-validator.ts:123` cannot fail, so
`theta/runtime/validator-cache-collision` is unreachable through this wiring
and the collision arm (`:126–136`) is dead; and the cache map is keyed on
strings whose length is the schema's, not 16.

## Why it matters

- **The recipe's stated purpose is cross-implementation reproducibility.**
  `docs/spec_topics/schema-subset.md:110` — "The hash sorts keys to make the
  digest reproducible"; `docs/reference/schema-subset.md:222–223` — "the hash
  sorts keys for reproducibility". A second implementation that reads the spec
  and implements step 2 mints `__theta_respond_1aae0990d53b3485` where this one
  mints `__theta_respond_16d4106209c9ee70`. Both are conformant readings of
  something; only one is a conformant reading of the spec.
- **The names are on the wire.** The respond-tool name is what the provider is
  forced to and what the QRY-12 / QRY-15 templates instruct the model to call
  (`docs/spec_topics/query/query-failure-and-repair.md:37`,
  `docs/spec_topics/query/query-tool-loop.md:37`), and the binder tool name is
  the forced tool of the binder inference call.
  `docs/spec_topics/schema-subset.md:94` states that the recipe "is part of the
  on-disk and on-wire contract — changing it is a breaking change for any
  cached artefact, fixture snapshot, or replayable provider payload". A
  recorded provider payload replayed against a spec-conformant implementation
  names a tool that does not exist.
- **Emission order silently moves slugs.** Any change to the order in which
  `lowerObjectFields`, `lowerEnumToSchema` or the literal-union arm writes
  their keys renames two of the four synthesised-name forms, with no test
  reading the fragment's *content* able to see it. Three hex constants in the
  test suite are the only guard
  (`tests/literal-union-string-enum-emission.test.ts:439`,
  `tests/union-generic-arm-lowering.test.ts:898`,
  `tests/annotation-root-brace-union-lowering.test.ts:408`), and they guard
  three fragments out of the reachable set. Bug 0055 had to notice this by hand
  and write the constraint down.
- **One fragment, two names, in one build.** `abb2fcd8521f6115` and
  `81e7d0e308042785` are the same schema. Any reasoning that treats "the schema
  slug" as a function of the fragment — the §Schema-slug collision posture's
  three-site list at `docs/spec_topics/schema-subset.md:114–116` does — is
  wrong at HEAD for two of those sites.
- **A dead collision arm.** Element 3 makes
  `theta/runtime/validator-cache-collision` unreachable in production. The code
  registry carries the row and `src/seams/schema-validator.ts:126–136`
  implements it; no production input can reach it while the key is the document
  itself.

## Fix

Constraint-pinned. Two routes; the choice is a spec-authority decision, not a
mechanical one.

**Route A — implement the canonical form.** One shared function serialises
every fragment that any slug is minted from, and every mint calls it.

- The function is `canonicalForm` / `schemaSlug`
  (`src/parser/schema-lowering.ts:65–94`, `:131–133`), unchanged; the work is
  routing, not writing a serialiser. `respondSchemaSlug` becomes
  `schemaSlug(toLoweredJsonValue(lowered))`, the registration cache's
  `canonicalFormBytes` becomes `canonicalForm(toLoweredJsonValue(lowered))`,
  and `slugOf` (`src/extension/production-composition.ts:308–311`) returns
  `{ slug: schemaSlug(v), canonicalBytes: canonicalForm(v) }`.
- `toLoweredJsonValue` (`src/parser/params.ts:784–806`) is the bridge and moves
  to a shared home. It currently lives beside its one caller and derives the
  numeric kind from `Number.isInteger` (`:791–794`), which is a
  value-integrality test where BNDR-4 / BNDR-5 select on the *declared* kind
  (`src/render/canonical-number.ts:66–72`). Its own comment (`:776–779`) states
  that no numeric `const` arises from a `params:` inline object today; at the
  typed-query root they do (`@<1 | 2>` lowers `{"enum":[1,2]}`), so the bridge
  needs either a real kind discriminator threaded from the lowering or a
  written-down statement that `Number.isInteger` is the discriminator for all
  reachable inputs. `42.0` and `1` are both `integer` under either reading and
  render identically, so this is a specification obligation, not an observed
  difference.
- Import direction: `src/parser/params.ts` already imports from
  `src/parser/schema-lowering.ts` (`params.ts:39–47`), and
  `body-type-lowering.ts` imports from `params.ts`. `src/runtime/` and
  `src/extension/` importing `src/parser/schema-lowering.ts` adds no cycle.
- Every stringify-derived slug moves. The pinned constants that re-derive are
  enumerated under **Affected** above: three move
  (`16d4106209c9ee70 → 1aae0990d53b3485`,
  `4718677af1cfaad3 → 5483e69d7515873a`,
  `81e7d0e308042785 → abb2fcd8521f6115` — the second and third derived by the
  same probe over the fragments those constants name,
  `{"type":"array","items":{}}` and the two-mint fragment in §Reproduction),
  four do not, four test files derive and stay green. `docs/bugs/0055-…md`'s `__theta_respond_16d4106209c9ee70`
  becomes stale and needs its §Fix record re-pinned by whichever change lands.
- The 0055 `type`-first contract is retired, not preserved: under step 2 the
  named-`enum` and alias-union spellings hash alike in either key order. The
  contract text is in `docs/bugs/0055-…md:157–160` and
  `tests/literal-union-string-enum-emission.test.ts:30`; the byte-equality
  cells that fix added stay green and stop being order-sensitive. The emission
  itself does not change — schema-subset.md `:80` still spells
  `{ "type": "string", "enum": [...] }` and `:110` still requires the emitted
  order to be independent of the hash.
- Breaking-change assessment. GOV-15
  (`docs/spec_topics/governance/source-language-stability.md:5`) closes its
  observable list at three: return values, ordered diagnostic-code sequences,
  and `theta-system-note` content strings. A synthesised tool name is in none
  of them and in none of the exclusions, so it is a third-bucket observable
  under GOV-15's own closed-list rule — by that rule, a divergence is a
  documentation defect against GOV-15 to be resolved by adding the observable
  to one of the two lists, not a departure from the release's equivalence
  promise. The binding statement is elsewhere:
  `docs/spec_topics/schema-subset.md:94` calls a recipe change "a breaking
  change for any cached artefact, fixture snapshot, or replayable provider
  payload". Route A is that change, made once, in the direction of the spec.
  Whether the slug appears in any `theta-system-note` content string — which
  would put it inside observable (c) — is the question to settle before
  landing.

**Route B — amend the recipe to the implementation.** Step 2 is redefined as
the emitted fragment's serialisation in emission order with JS-stringify
semantics.

- `docs/spec_topics/schema-subset.md:99–105` is rewritten: the key-sort clause
  is replaced by "keys in the emitted order fixed by the Lowering Algorithm",
  the numeric clause by the JS `Number.prototype.toString` rendering, and the
  array clause and the escaping clause stand.
- `:110` and its mirror `docs/reference/schema-subset.md:222–224` lose their
  subject and need rewriting rather than deleting: the paragraph's claim is
  that the hash is independent of emitted key order, which becomes false. The
  stated rationale — reproducibility — has to be restated for a recipe that
  depends on the emitting implementation's key order, or dropped.
- Emission order becomes normative for every fragment shape, not only the one
  bug 0055 pinned. The Lowering Algorithm's step 3 emission table
  (`docs/spec_topics/schema-subset.md:76–85`) currently fixes array element
  order explicitly (`:85`, *Array element order*) and says nothing about object
  key order; route B requires an equivalent *Object key order* clause covering
  `lowerObjectFields`, `lowerEnumToSchema`, the literal-union arm, the
  `array<T>` form, and the `$defs` position, or the recipe is underdetermined.
- `__inline_<slug>` moves instead: `src/parser/params.ts:692–693` and
  `src/parser/schema-lowering.ts:65–133` are the sites that would be rewritten,
  and the two canonical-derived constants
  (`tests/inline-slug-name-reservation.test.ts:507`,
  `tests/params-block-mapping-rhs-refusal.test.ts:742`) plus every
  `__inline_<hex>` in `docs/bugs/` — `0039`, `0040`, `0041`, `0045`, `0052`,
  `0053`, `0054`, `0055`, `0056`, `0058`, `0059`, `0060`, `0061`, `0097`,
  `0098` and this report — and in `docs/spec_topics/schema-subset.md`
  re-derive. The blast radius is larger than route
  A's, and `src/parser/schema-lowering.ts`'s entire `LoweredJsonValue` domain —
  which exists to carry the numeric-kind discriminator step 2 needs — becomes
  unnecessary.

**Constraints on either route.**

- The four synthesised-name forms stay byte-stable within a build: one
  function, called by every mint, so `__inline_`, `__theta_respond_`,
  `__theta_bind_` and (when it gains a production mint)
  `__theta_callee_` cannot disagree about one fragment. This is the property
  HEAD lacks.
- Element 3 is fixed either way and is not a route choice.
  `src/extension/production-composition.ts:308–311` must return the 16-hex slug
  of whichever recipe wins, not the serialisation. Fixing it makes
  `theta/runtime/validator-cache-collision` reachable again, which needs a
  witness that the collision arm (`src/seams/schema-validator.ts:126–136`)
  behaves — the seam already admits an injected fixed-slug function for exactly
  this (`src/seams/schema-validator.ts:70–72`).
- The §Schema-slug collision posture's byte comparisons
  (`docs/spec_topics/schema-subset.md:112`) compare the bytes the digest is
  taken over, at all three named sites. Route A moves the registration cache's
  stored bytes (`src/extension/production-theta-producer.ts:2620`) with the
  slug; route B leaves them and moves `hoistInlineObjectType`'s
  (`src/parser/params.ts:692`).
- The three doc comments that describe the recipe are corrected in the same
  change: `src/runtime/typed-query-validation.ts:336–346` ("the same
  canonical-hash spirit"), `src/binder/binder-inference.ts:97–102` ("the same
  canonical-schema-hash recipe"), and
  `src/extension/production-theta-producer.ts:2606–2610` ("the canonical-form
  bytes are `JSON.stringify(lowered)`").
- `docs/reference/schema-subset.md:198–206` mirrors the recipe and moves in
  lock-step with `docs/spec_topics/schema-subset.md:98–107`.
- Bug [0098](./0098-nonstring-literal-union-emission-unspecified.md) settles
  what a union of non-string literals emits. Its outcome changes which bytes
  the numeric clause of step 2 is applied to, not whether the clause is
  applied. Neither report blocks the other.

**Ordering.** Independent of bug 0054. 0054 adds a byte comparison at the
`$defs` merge sites; this report changes which bytes any comparison reads.
Whichever lands second inherits the other's decision without re-litigating it.

## Non-goals

- The emitted lowered fragment's key order. Both routes leave
  `lowerObjectFields`, `lowerEnumToSchema` and the literal-union arm emitting
  exactly the bytes they emit at HEAD; schema-subset.md `:76–85` governs the
  emission and is untouched. Route A makes that order stop mattering to the
  digest; route B makes it normative. Neither changes it.
- The 64-bit truncation. Step 4's `<1-in-10⁹` collision argument
  (`docs/spec_topics/schema-subset.md:107`) and the collision posture built on
  it (`:112–118`) are out of scope.
- The `__theta_callee_<slug>__<post-rename-name>` mint. That form has no
  production construction site at HEAD; giving it one is a separate change.
- The dedup and retention behaviour bug
  [0054](./0054-inline-slug-merges-unchecked-across-mint-scopes.md) owns.
- Which emission a union of non-string literals should have — 0055 §Fix
  residual (iii) (`:273–277`), filed as
  [0098](./0098-nonstring-literal-union-emission-unspecified.md). This report
  hashes whatever that position emits.

## Provenance

- Origin: bug
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) §Fix
  (0.59.0) *Residuals* (iv) (`:277–281`), recorded when that fix landed and
  left unfiled. This report files it, re-derives it at HEAD `0b1e20ab`, and
  adds what the residual does not state: the two adjacent sites (the PIC-44
  stored bytes and the production validator-cache key), the reachable numeric
  divergence and the unreachability of the large-magnitude one, the
  non-divergence of the escaping clause, the one-fragment-two-slugs
  demonstration against the conforming `__inline_` mint, and the enumeration of
  which pinned constants each route moves.
- Spec: `docs/spec_topics/schema-subset.md:94` (the recipe as on-disk/on-wire
  contract), `:98` (step 1), `:99–105` (step 2, canonical form), `:106` (step
  3), `:107` (step 4), `:108` (step 5,
  [§Synthesised names](../spec_topics/schema-subset.md#synthesised-names)),
  `:110` (key sorting independent of emission order; the reproducibility
  rationale), `:112–118`
  ([§Schema-slug collision posture](../spec_topics/schema-subset.md#schema-slug-collision-posture)),
  `:76–85` (Lowering Algorithm step 3 and *Array element order*), `:80` (the
  enum / string-literal-union emission), `:96`
  ([SUBS-2](../spec_topics/schema-subset.md#subs-2) — terminology only; the
  recipe itself is the unnumbered
  [§Canonical schema hash](../spec_topics/schema-subset.md#canonical-schema-hash)
  section at `:92–110`);
  `docs/spec_topics/binder/defaulting-system-note-echo.md` BNDR-4 / BNDR-5 /
  BNDR-6 (the numeric rendering step 2 borrows);
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:9`
  (PIC-44), `docs/spec_topics/pi-integration-contract/host-interfaces-services.md:46`
  (PIC-11's slug-keyed validator cache);
  `docs/spec_topics/query/query-failure-and-repair.md:37` (QRY-12),
  `docs/spec_topics/query/query-tool-loop.md:37` (QRY-15);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15 and its
  closed observable list); `docs/spec_topics/lexical.md:28` (the number-literal
  magnitude rules that make the large-magnitude numeric case unreachable);
  `docs/reference/schema-subset.md:198–206`, `:222–224` (the mirror).
- Implementation evidence at HEAD `0b1e20ab`:
  `src/runtime/typed-query-validation.ts:347–348` (the frame), `:336–346` (its
  doc comment), `:194–195` (the constructor's slug and default tool name);
  `src/extension/production-theta-producer.ts:735`, `:753` (the binder mint),
  `:2617`, `:2620`, `:2606–2610` (the respond mint and its stored bytes);
  `src/binder/binder-inference.ts:97–104`;
  `src/extension/production-composition.ts:306–312` (element 3);
  `src/seams/schema-validator.ts:14` (`LoweredSchema`), `:62–74`
  (`SchemaSlug` / `SchemaSlugFn`), `:117`, `:123`, `:126–136`;
  `src/runtime/tool-registration.ts:199–213` (`RegistrationEntry`), `:281`,
  `:297`, `:308–313`; `src/parser/schema-lowering.ts:43–56`
  (`LoweredJsonValue`), `:65–94` (`canonicalForm`), `:103–120`
  (`compareCodePoint`), `:121–125`, `:131–133`;
  `src/render/canonical-number.ts:24–81`; `src/parser/params.ts:39–47` (the
  import direction), `:686–694` (the conforming `__inline_` mint), `:772–806`
  (`toLoweredJsonValue`); `src/parser/body-type-lowering.ts:100`, `:130–137`,
  `:302–320`, `:378–392`, `:741–762`; `src/lexer/lexer.ts:634–637`;
  `src/parser/synthesised-names.ts:35` (the reserved-name pattern over all four
  forms).
- Probe: scratch vitest under `tests/`, written, run and deleted. It loaded
  each annotation through `parseThetaDocument` for the diagnostics column,
  lowered it through `lowerQueryResponseSchema`, and hashed the result through
  both `respondSchemaSlug` and `schemaSlug ∘ canonicalForm`, with a
  `node:crypto` oracle over the printed byte strings agreeing with both. Every
  hex value in this report was printed by a probe run; the two the
  §Reproduction block does not carry — `5483e69d7515873a` and the pre-0055
  `3738bdf57eb9ee93` — came from the same probe over the fragments named beside
  them. No hex is copied from another document without re-derivation.
- Absence checked rather than assumed: `rg '"callee"' src/` finds no production
  construction of a callee `RegistrationEntry`; `rg` over `tests/` for
  `[0-9a-f]{16}` and for `__theta_respond_<hex>` / `__theta_bind_<hex>` /
  `__inline_<hex>` name literals produced the two constant lists under
  **Affected**.
