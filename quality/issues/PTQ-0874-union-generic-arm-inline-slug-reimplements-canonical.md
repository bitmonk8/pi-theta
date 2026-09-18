---
id: PTQ-0874
title: union-generic-arm-lowering.test.ts hand-computes the __inline_<slug> formula inline instead of calling canonical-slug-oracle.ts's inlineDefName it already partially imports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/union-generic-arm-lowering.test.ts:1208-1210
  - tests/helpers/canonical-slug-oracle.ts:8-15
  - tests/union-generic-arm-lowering.test.ts:16
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# union-generic-arm-lowering.test.ts hand-computes the __inline_<slug> formula inline instead of calling canonical-slug-oracle.ts's inlineDefName it already partially imports

## Observation
`tests/helpers/canonical-slug-oracle.ts` exports `slugOfCanonicalForm(canonical)`
(`createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)`)
and `inlineDefName(canonical)` (`` `__inline_${slugOfCanonicalForm(canonical)}` ``)
as the independent oracle for the `__inline_<slug>` naming scheme.
`tests/union-generic-arm-lowering.test.ts` already imports two other
functions from this exact module (`compareCodePoint`, `refNames`) at its top
import block, but for group (i)'s hoisted-key fixture it does not import
`inlineDefName`; instead it re-spells the identical two-step computation
inline using `node:crypto`'s `createHash` directly, against a hand-written
`A_INT_CANONICAL` canonical-form string.

## Evidence
`tests/helpers/canonical-slug-oracle.ts:8-15`:
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

`tests/union-generic-arm-lowering.test.ts:1208-1210` (re-read immediately
before filing):
```ts
  const A_INT_CANONICAL =
    '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}';
  const A_INT_INLINE = `__inline_${createHash("sha256").update(A_INT_CANONICAL, "utf8").digest("hex").slice(0, 16)}`;
```

`tests/union-generic-arm-lowering.test.ts:16` (the same file's own import of
two sibling exports from the module that also exports `inlineDefName`):
```ts
import { compareCodePoint, refNames } from "./helpers/canonical-slug-oracle";
```

`A_INT_INLINE`'s expression is byte-identical to `` `__inline_${slugOfCanonicalForm(A_INT_CANONICAL)}` ``
— `inlineDefName(A_INT_CANONICAL)`'s own body with `canonical` substituted
for `A_INT_CANONICAL` — down to the `createHash("sha256")` /
`.update(..., "utf8")` / `.digest("hex")` / `.slice(0, 16)` chain and the
`__inline_` prefix.

## Why this is a problem
The exact two-step SHA-256/truncate/prefix computation this fixture needs
already exists as a named, exported oracle function pair
(`slugOfCanonicalForm`, `inlineDefName`) in a module this same file already
imports from for two other functions. The file restates the formula a second
time under a local constant (`A_INT_INLINE`) built with a direct
`node:crypto` call rather than calling `inlineDefName(A_INT_CANONICAL)`, so a
change to the oracle's hash algorithm, digest encoding, or truncation length
would not propagate to this file's inline copy even though the file's import
statement is one line away from the function that would have caught it.

## Suggested direction (non-binding, optional)
Adding `inlineDefName` to the existing `import { compareCodePoint, refNames }
from "./helpers/canonical-slug-oracle"` line and replacing the local
`A_INT_INLINE` computation with `inlineDefName(A_INT_CANONICAL)` would remove
the inline restatement.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and matches none of
  the named gate kin; `A_INT_CANONICAL`/`A_INT_INLINE` are fixture constants
  for a `toEqual` comparison, not a pinned count or inventory.
- Recording-double check: not applicable — both values are static derived
  strings used in a positive `toEqual` assertion, not a recording double
  backing a "never called" witness.
- docs/bugs/ signature search: `grep -rl "A_INT_CANONICAL\|A_INT_INLINE"
  docs/bugs/0043-union-nonprimitive-arm-lowers-permissive.md` → 0 hits; the
  bug doc gives no rationale for a file-local slug computation.
- coverage-matrix/bug-doc citation search: `grep -n
  "union-generic-arm-lowering" docs/reference/coverage-matrix.md` → 0 hits.
  docs/bugs/0043 cites this file by name and by its own cell ids (i1, i2,
  i3, ...) for behaviour, never for the `A_INT_INLINE` computation itself;
  this finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` — only that the existing helper's export be called in place
  of a local re-derivation — so no pinned citation is disturbed.
- Coverage check: the claim is about a repeated formula, not a missing test
  path; `A_INT_INLINE` is exercised by every group-(i) assertion that reads
  it (`HOISTED`, i1/i2/i3).
- Overlap check: `grep -rl "A_INT_CANONICAL\|A_INT_INLINE"
  quality/intake quality/issues quality/resolved` → 0 hits before this
  filing. The resolved `PTQ-0410-canonical-slug-oracle-quadruplet-duplicated.md`
  names this same file's OLD `compareCodePointLocal` copy (since replaced by
  the current `compareCodePoint` import at line 16) as a sixth sibling of a
  four-function duplication that predates `canonical-slug-oracle.ts`'s
  creation; the confirmed, open `qw20260918050411-d7-01-canonical-slug-oracle-reimplemented-inline.md`
  and its own overlap note (citing PTQ-0410) both name a different file
  (`tests/binder-param-line-newline-normalisation.test.ts`) for the same
  `slugOfCanonicalForm`/`inlineDefName` reimplementation shape and do not
  cite `tests/union-generic-arm-lowering.test.ts`; this is the first filing
  to cite this file's own `A_INT_CANONICAL`/`A_INT_INLINE` pair against the
  canonical export by name.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (canonical-slug-oracle.ts:8-15 exports slugOfCanonicalForm/inlineDefName; union-generic-arm-lowering.test.ts:1208-1210 declares A_INT_CANONICAL/A_INT_INLINE with A_INT_INLINE's expression byte-identical to inlineDefName's body inlined), the file imports createHash at :1 and compareCodePoint/refNames from the helper at :16 but not inlineDefName (grep `slugOfCanonicalForm|inlineDefName` in the file → 0), A_INT_INLINE is live (read at :1214 into HOISTED, asserted by i1/i2/i3), both locations under tests/, D7 boilerplate/copy-paste-helper class; stated searches reproduce (docs/bugs 0 hits, coverage-matrix 0 hits, quality/ 0 prior hits for the constants), not a gate file, no recording-double/red-test carve-out, no merge/rename/delete proposed, and the fixture's "not read off the implementation" comment concerns the production SUT not the test-only oracle (same ruling as PTQ-0410/PTQ-0665/d7-01); the :884 slugOf(fragment) is a distinct object-canonicalising routine so sites: 1 is scope-honest; not a duplicate — the inline copy dates from af7f932e (2026-08-02) and predates the helper's minting in c79a9039 (2026-09-17), and both fix commits that touched this file (c79a9039 migrated compareCodePoint, cc0a8fe7 added refNames) left the A_INT_INLINE line unchanged, while resolved PTQ-0410/PTQ-0665 and same-wave confirmed d7-01 cite disjoint files, so this is a residual reimplements-existing-helper filing per the PTQ-0665/0228/0240 precedent (triage: claude-fable-5-1)
