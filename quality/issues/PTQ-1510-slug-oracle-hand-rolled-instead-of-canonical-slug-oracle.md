---
id: PTQ-1510
title: params-block-mapping-rhs-refusal.test.ts hand-rolls the slug/inline-name oracle that tests/helpers/canonical-slug-oracle.ts already exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:222-231
  - tests/params-block-mapping-rhs-refusal.test.ts:245-257
  - tests/helpers/canonical-slug-oracle.ts:8-15
sites: 2
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# params-block-mapping-rhs-refusal.test.ts hand-rolls the slug/inline-name oracle that tests/helpers/canonical-slug-oracle.ts already exports

## Observation
`tests/helpers/canonical-slug-oracle.ts` exports `slugOfCanonicalForm(canonical)`
— `createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)` —
and `inlineDefName(canonical)` — `` `__inline_${slugOfCanonicalForm(canonical)}` ``
— as the independent test oracle for the §Canonical schema hash recipe.
`tests/params-brace-union-rhs-lowering.test.ts`, the sibling file in this same
review scope, imports both from that helper (its import line lists
`assertKeysSorted, inlineDefName, slugOfCanonicalForm, expectRefsClosed`) and
uses them for every one of its ten hand-written canonical forms.
`tests/params-block-mapping-rhs-refusal.test.ts` does not import
`tests/helpers/canonical-slug-oracle.ts` at all; instead it imports
`createHash` from `node:crypto` directly and re-derives the identical two-step
recipe inline, twice, for `G_SLUG`/`G_INLINE` and `MF_SLUG`/`MF_INLINE`.

## Evidence

tests/helpers/canonical-slug-oracle.ts:8-15
```ts
/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters. */
export function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
export function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}
```

tests/params-block-mapping-rhs-refusal.test.ts:222-231
```ts
/**
 * `G_FRAGMENT`'s hand-written canonical form: keys sorted by Unicode code point
 * — `additionalProperties` < `properties` < `required` < `type` — and no
 * insignificant whitespace (schema-subset.md:99–:101).
 */
const G_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"}},"required":["a"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 hex characters, lowercased. */
const G_SLUG = createHash("sha256").update(G_CANONICAL, "utf8").digest("hex").slice(0, 16);
```

tests/params-block-mapping-rhs-refusal.test.ts:245-257
```ts
/**
 * `MF_FRAGMENT`'s hand-written canonical form: keys sorted by Unicode code
 * point and no insignificant whitespace (schema-subset.md:99–:101).
 */
const MF_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"},"b":{"type":"integer"}},"required":["a","b"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 hex characters, lowercased. */
const MF_SLUG = createHash("sha256").update(MF_CANONICAL, "utf8").digest("hex").slice(0, 16);

/** The synthesised `$defs` key the fence's inline object hoists under. */
const MF_INLINE = `__inline_${MF_SLUG}`;
```

Search: `grep -n "createHash" tests/params-block-mapping-rhs-refusal.test.ts` → three hits, the import (line 4) and the two hand-rolled digest lines (231, 257). `grep -n
"canonical-slug-oracle" tests/params-block-mapping-rhs-refusal.test.ts` → no
hits. `grep -n "canonical-slug-oracle" tests/params-brace-union-rhs-lowering.test.ts`
→ one hit, the import line naming `slugOfCanonicalForm`/`inlineDefName` among
others.

## Why this is a problem
The two hand-rolled digest expressions in this file reproduce
`slugOfCanonicalForm`'s body character-for-character (same hash algorithm,
same encoding, same truncation length) and `` `__inline_${...}` `` reproduces
`inlineDefName`'s body character-for-character, with no import connecting the
two copies to the shared helper. The sibling file reviewed alongside this one
reaches the identical recipe through the shared helper instead. A change to
the recipe — the digest algorithm, the truncation length, or the `__inline_`
prefix — made in `tests/helpers/canonical-slug-oracle.ts` would not reach this
file's two inline computations.

## Suggested direction (non-binding, optional)
`tests/helpers/canonical-slug-oracle.ts` is already imported by the sibling
file in this same review scope for the identical recipe; it is where a reader
comparing the two files would look for this file's `G_SLUG`/`MF_SLUG`
computation too.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; not a census/pin gate.
- Recording-double check: `G_SLUG`/`MF_SLUG` are plain string derivations, not
  a recording double or a MUST-NOT-called witness.
- docs/bugs/ signature search: `grep -rn "G_SLUG\|MF_SLUG\|G_CANONICAL\|MF_CANONICAL\|6a8e2246094f0455" docs/bugs/*.md`
  finds bug 0041, 0059 and 0099 citing the resulting slug VALUE
  `__inline_6a8e2246094f0455`, never the `createHash` expression that computes
  it. Since `slugOfCanonicalForm` implements the identical algorithm, routing
  the computation through the helper would not change the cited value.
- coverage-matrix.md / bug-doc witness-list citation search: `grep -n
  "params-block-mapping-rhs-refusal" docs/reference/coverage-matrix.md`
  returns no hits.
- Coverage drift: this finding does not claim any input or behaviour is
  untested; both files already assert the identical slug outcomes, only the
  route to computing the expected value differs.

## Triage
verdict: confirmed — checked against the current code. canonical-slug-oracle.ts:8-15 exports slugOfCanonicalForm/inlineDefName as quoted. params-block-mapping-rhs-refusal.test.ts imports createHash at :4 and re-derives the same recipe at :231/:234 (G_SLUG/G_INLINE) and :257/:260 (MF_SLUG/MF_INLINE); it has 0 imports of canonical-slug-oracle, and both constants are used (e.g. :537-556, :615-633). The sibling params-brace-union-rhs-lowering.test.ts:20 imports both helpers. Both locations are under tests/, so this is D7 copy-paste-helper class. It hits no gate or recording-double carve-out, and no merge/rename/delete is proposed. The stated searches reproduce: docs/bugs hits 0041/0059/0099 cite only the slug value, and coverage-matrix has 0 hits. Not a duplicate: the resolved slug-oracle filings PTQ-0665/0794/0874/1352/1386 and PTQ-0651 (registry oracle) cite other files or root causes, so this is leftover work under the PTQ-0665/0794 precedent. (triage: claude-opus-5-5)
