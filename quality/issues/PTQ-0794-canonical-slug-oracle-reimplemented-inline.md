---
id: PTQ-0794
title: binder-param-line-newline-normalisation.test.ts hand-computes the canonical-slug-oracle formula inline instead of importing the existing tests/helpers/canonical-slug-oracle.ts helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/binder-param-line-newline-normalisation.test.ts:260-278
  - tests/helpers/canonical-slug-oracle.ts:9-16
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# binder-param-line-newline-normalisation.test.ts hand-computes the canonical-slug-oracle formula inline instead of importing the existing tests/helpers/canonical-slug-oracle.ts helper

## Observation
`tests/helpers/canonical-slug-oracle.ts` exports `slugOfCanonicalForm(canonical)`
(`createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)`) and
`inlineDefName(canonical)` (`` `__inline_${slugOfCanonicalForm(canonical)}` ``) as
the independent, non-SUT oracle for the `__inline_<slug>` naming scheme.
`tests/binder-param-line-newline-normalisation.test.ts` does not import this
module; it re-spells the identical two-step computation inline as module-scope
constants (`AB_SLUG`, `AB_INLINE`) built from a hand-written `AB_CANONICAL`
string, using `node:crypto`'s `createHash` directly.

## Evidence
`tests/helpers/canonical-slug-oracle.ts:9-16`:
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

`tests/binder-param-line-newline-normalisation.test.ts:260-278` (re-read
immediately before filing):
```ts
const AB_FRAGMENT = {
  type: "object",
  properties: { a: { $ref: "#/$defs/Triage" }, b: { type: "integer" } },
  required: ["a", "b"],
  additionalProperties: false,
};

/**
 * `AB_FRAGMENT`'s hand-written canonical form: keys sorted by Unicode code
 * point and no insignificant whitespace (schema-subset.md:99–:101).
 */
const AB_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"},"b":{"type":"integer"}},"required":["a","b"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 hex characters, lowercased. */
const AB_SLUG = createHash("sha256").update(AB_CANONICAL, "utf8").digest("hex").slice(0, 16);

/** The synthesised `$defs` key R1c / R2 / N1 all hoist their inline object under. */
const AB_INLINE = `__inline_${AB_SLUG}`;
```

`AB_SLUG`'s expression is byte-identical to `slugOfCanonicalForm`'s body with
`canonical` substituted for `AB_CANONICAL`; `AB_INLINE`'s expression is
byte-identical to `inlineDefName`'s body with the same substitution. Exact
search: `grep -n "canonical-slug-oracle" tests/binder-param-line-newline-normalisation.test.ts`
→ 0 hits — the file's import list (lines 1-20) carries no reference to the
helper module.

## Why this is a problem
The exact two-step SHA-256/truncate/prefix computation this file needs
already exists as a named, exported, independently-maintained oracle
function pair in `tests/helpers/canonical-slug-oracle.ts` (itself minted to
close PTQ-0410's five-file duplication of the same formula). This file
restates the formula a sixth time under different names (`AB_SLUG`,
`AB_INLINE`) rather than calling `inlineDefName(AB_CANONICAL)`, so a change to
the oracle's hash algorithm, digest encoding, or truncation length would not
propagate to this file's copy.

## Suggested direction (non-binding, optional)
Importing `inlineDefName` (and `slugOfCanonicalForm` if the intermediate slug
value is asserted separately) from `./helpers/canonical-slug-oracle` in place
of the local `AB_SLUG`/`AB_INLINE` computation is the natural fit, given the
helper already exists for exactly this formula.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and matches none of
  the named gate kin; `AB_SLUG`/`AB_INLINE` are not a pinned count or
  inventory.
- Recording-double check: not applicable — `AB_SLUG`/`AB_INLINE` are static
  derived values used in positive `toEqual` assertions, not a recording
  double backing a "never called" witness.
- docs/bugs/ signature search: `grep -rl "AB_SLUG\|AB_INLINE\|AB_CANONICAL" docs/bugs/*.md`
  → 0 hits; no documented correct-reason red cites this constant.
- coverage-matrix/bug-doc citation search: `grep -n "binder-param-line-newline-normalisation" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that a private constant computation could call
  an already-existing helper — so no citation is disturbed.
- Coverage check: the claim is about a repeated formula, not a missing test
  path; `AB_SLUG`/`AB_INLINE` are exercised by every assertion that reads
  them in this file.
- Overlap check: `grep -rl "AB_SLUG\|AB_CANONICAL\|AB_INLINE" quality/` → 0
  hits before this filing; PTQ-0410 (resolved) names five sibling files
  (`annotation-root-brace-union-lowering.test.ts`,
  `inline-object-nested-lowering.test.ts`,
  `params-brace-union-rhs-lowering.test.ts`,
  `params-inline-object-lowering.test.ts`,
  `schema-slug-canonical-form-mints.test.ts`) plus a `union-generic-arm-lowering.test.ts`
  renamed variant, but does not name this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (canonical-slug-oracle.ts:9-16 exports slugOfCanonicalForm/inlineDefName; binder-param-line-newline-normalisation.test.ts:271-278 declares AB_CANONICAL/AB_SLUG/AB_INLINE with AB_SLUG's expression byte-identical to slugOfCanonicalForm's body and AB_INLINE's to inlineDefName's), the file imports createHash at :1 and has 0 hits for `canonical-slug-oracle`, AB_INLINE is live (read at :732/:734/:737/:877/:880), both locations under tests/, D7 boilerplate/copy-paste-helper class; stated searches reproduce (docs/bugs 0 hits, coverage-matrix 0 hits, quality/ 0 prior hits for the constants), no gate/recording-double/red-test carve-out, no merge/rename/delete proposed, and the file's "schemaSlug deliberately NOT imported" banner concerns the production SUT not the test-only oracle (same ruling as PTQ-0410/PTQ-0665); not a duplicate — the inline copy dates from 125d3691 (2026-08-03, v0.61.0) and predates the helper's minting in c79a9039 (PTQ-0410, 2026-09-17), PTQ-0665's fix (cc0a8fe7) migrated only its two cited files and left this file's slug block untouched, and same-wave d7-02 cites the disjoint union-generic-arm-lowering.test.ts, so this is a residual reimplements-existing-helper filing per the PTQ-0665/0228/0240 precedent; the filing's "sixth time" gloss is understated (grep `digest("hex").slice(0, 16)` → 10 tests/ files still carry local copies) but sites: 1 is scope-honest (triage: claude-fable-5-1)
