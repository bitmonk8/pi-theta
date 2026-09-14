---
id: PTQ-0074
title: Three code-line citations in theta-document.ts comments point at lines that now hold unrelated code
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:8150-8151
  - src/parser/theta-document.ts:8632-8635
  - src/parser/theta-document.ts:9524-9525
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three code-line citations in theta-document.ts comments point at lines that now hold unrelated code

## Observation
Three comments in src/parser/theta-document.ts cite code by file:line-range.
In all three the cited range no longer holds the referenced declaration or
block — the code moved (in this file or the cited file) and the hard-coded
line numbers were not updated. Each citation now sends a reader to an
unrelated declaration.

## Evidence
Site 1 — src/parser/theta-document.ts:8150-8151 (`StructuralRefs.bodyTypes`
doc):

```ts
   * The whole-file type-declaring name universe `collectBodyTypes` builds
   * (`FrontmatterBodyTypes`, frontmatter.ts:228–243): every body `schema` name
```

`FrontmatterBodyTypes` is declared at src/parser/frontmatter.ts:278-304
(`grep -n "export interface FrontmatterBodyTypes" src/parser/frontmatter.ts`
→ 278; the interface's closing `}` is line 304). frontmatter.ts:228-243 today
holds the tail of the `argumentHint` field doc and the head of
`FrontmatterParseResult` — a different interface.

Site 2 — src/parser/theta-document.ts:8632-8635 (inside `checkStructural`):

```ts
  // The alias/union declaration-graph checks (bug 0033 §Fix): scoped to
  // TOP-LEVEL declarations only, mirroring `collectBodyTypes` (the lowering
  // and `NamedType`-resolution set is top-level-only; a block-nested schema
  // decl brands nothing at runtime either —
  // src/runtime/lexical-environment.ts:383–389).
```

src/runtime/lexical-environment.ts:383-389 today holds the doc comment for
`parIterationBoundary` ("True iff this scope is a `par for` iteration's
per-iteration binding scope…") — nothing about schema registration. The
root-only registration the comment appeals to lives at
lexical-environment.ts:337-338 ("Registered top-level + imported `schema`
declarations — root only.") and :421 ("The root owns the fn / schema / enum /
import / callable registries").

Site 3 — src/parser/theta-document.ts:9524-9525
(`resolvePatternDeclaredFieldSet` doc, a same-file citation):

```ts
 * `checkPatternObjectFields`'s field-name check (bug 0226 §Fix). Mirrors
 * `checkObjectExpr`'s constructor-position classification (`:8342–:8375`)
```

`checkObjectExpr`'s constructor-position classification — `const declared =
refs.schemas.get(e.typeName);` through the final "resolves to no declaration
at all" arm — sits at src/parser/theta-document.ts:9462-9499 today. Lines
8342-8375 of this file hold `walkParamsDefaultNames`'s `member` arm (the
`params:` default `Enum.Variant` check), a different function.

Search used to enumerate the file's code-line citations:
`grep -n "\.ts:[0-9]" src/parser/theta-document.ts` (2 hits — sites 1 and 2)
plus `grep -nE "\(\`?:[0-9]+" src/parser/theta-document.ts` (3 hits; the two
at :6845/:6856 cite docs/spec_topics/expressions.md:46-49/:51, which were
verified against the current spec text and still hold). The three sites above
are every drifted code-line citation found.

## Why this is a problem
Historical narration drift: hard-coded line numbers assert where a referenced
declaration lives, and all three now point at unrelated code. A reader
following site 2 lands on the `par for` write-boundary doc while looking for
the schema-registration ground of a top-level-only scoping decision; a reader
following site 3 lands in the `params:`-default walk while trying to compare
the pattern-head classifier against its stated mirror. The citations actively
misdirect the audits they exist to support.

## Suggested direction (non-binding, optional)
Replace the line-range citations with stable anchors (declaration names /
doc-comment references, which all three comments already carry alongside the
numbers), or re-point the numbers.

## False-positive check
- Site 1: `grep -n "export interface FrontmatterBodyTypes"
  src/parser/frontmatter.ts` → 278; `sed -n '228,246p'` shows `argumentHint` /
  `FrontmatterParseResult` at the cited range.
- Site 2: `sed -n '376,394p' src/runtime/lexical-environment.ts` shows
  `fnActivationBoundary` / `parIterationBoundary` docs at the cited range;
  `grep -n "root only\|The root owns the fn"` locates the actual
  schema-registration ground at :337-338 and :421.
- Site 3: `grep -n "const declared = refs.schemas.get"
  src/parser/theta-document.ts` → 9462 (checkObjectExpr) and 9543
  (resolvePatternDeclaredFieldSet's own read); `sed -n '8342,8375p'` shows
  `walkParamsDefaultNames`'s member arm at the cited range.
- Alternate-reading check: none of the three citations is relative to some
  other file or a spec doc — sites 1-2 name their target file explicitly, and
  site 3's bare `:NNNN` form matches the same-file convention the two
  verified spec citations (`:46–49`, `:51`) use for their named doc.
- Not previously filed: the wave's already-filed drift findings cover
  production-theta-producer.ts, production-composition.ts, and params.ts
  citations; none cites these three sites.

## Triage
verdict: confirmed — re-verified all 3 excerpts verbatim and every pin wrong: FrontmatterBodyTypes is at frontmatter.ts:278-304 (brace at 304) not :228-243 (argumentHint/FrontmatterParseResult), lexical-environment.ts:383-389 holds the parIterationBoundary write-boundary doc not schema registration (actual ground :337/:421), and checkObjectExpr's classification is theta-document.ts:9462-9499 not :8342-8375 (walkParamsDefaultNames member arm); reproduced both stated searches exactly (2 `.ts:` hits, 1 bare 4-digit hit) so the 3 sites are every code-line citation in the file, independently refuted the doc-relative alternate reading (longest repo doc is 1827 lines) and confirmed the excluded expressions.md pins :44/:46-49/:51 still hold; no intake covers this citing file (type-compat's finding cites theta-document only as a target) — note git shows sites 2-3 were already wrong at their introducing commits, so those two were born wrong rather than decayed (triage: claude-opus-5)
