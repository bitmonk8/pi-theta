---
id: PTQ-0087
title: Nine line-numbered citations in type-compat.ts doc comments point at unrelated lines in their target files (lexer.ts, frontmatter.ts, theta-document.ts, type-grammar.ts, type-system.md, code-registry-parse.md)
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-compat.ts:129
  - src/parser/type-compat.ts:134
  - src/parser/type-compat.ts:135
  - src/parser/type-compat.ts:138
  - src/parser/type-compat.ts:139
  - src/parser/type-compat.ts:140
  - src/parser/type-compat.ts:314
  - src/parser/type-compat.ts:1099
sites: 9
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Nine line-numbered citations in type-compat.ts doc comments point at unrelated lines in their target files (lexer.ts, frontmatter.ts, theta-document.ts, type-grammar.ts, type-system.md, code-registry-parse.md)

## Observation
The `resolveNamed` doc block (type-compat.ts:118-146), `decide`'s TYPE-10
comment (:314), and the `enumVariantType` doc (:1099) anchor their claims with
`file:line` citations. Nine of those citations no longer land on the text they
name: the cited lines now hold unrelated code or a different registry row,
while the named text lives 2-800 lines away in each target.

## Evidence
src/parser/type-compat.ts:127-140 — the `resolveNamed` doc's citation cluster:
```
 * `lexical.md:15` requires PascalCase for a `schema`/`enum`/type-like
 * binding, and the lexer's refusal (`theta/parse/schema-case-mismatch`,
 * src/lexer/lexer.ts:842–849) is a contextual diagnostic, not a parse
...
 * static check — type-system.md:48's unresolvable-operand deferral is the
 * correct disposition, and code-registry-parse.md:59's "where the RHS type
 * is statically resolvable" qualifier already excludes it. The predicate is
 * re-derived from the name's first character rather than shared, matching
 * the lexer's own type-position test (src/lexer/lexer.ts:833) and the other
 * local re-derivations in this tree (src/parser/frontmatter.ts:898,
 * src/parser/theta-document.ts:2559,3065, src/parser/type-grammar.ts:1087).
```
Current targets:
- lexer.ts:842-849 holds statement-separator swallowing (`const swallow =
  depth > 0 || ...`); the `theta/parse/schema-case-mismatch` emission is at
  lexer.ts:1094-1102 (`code: "theta/parse/schema-case-mismatch"` at :1097).
- lexer.ts:833 is a bare `}` in the newline loop; the lexer's case test is
  `const isUpper = first >= "A" && first <= "Z";` at lexer.ts:1085.
- frontmatter.ts:898 is a doc comment about wire-name sidecars; the one
  `isUpper` re-derivation in that file is at frontmatter.ts:1653-1654.
- theta-document.ts:2559 is a doc comment on `typeSource` capture and :3065
  is query-annotation propagation; the two `isUpper` re-derivations are at
  theta-document.ts:3444-3445 and :4025-4026.
- type-grammar.ts:1087 is the `interiorSource` slicing comment; the
  re-derivation is at type-grammar.ts:1598-1599.
- type-system.md:48 is the paragraph "A written `NamedType` head that
  resolves to no declaration..." (refused upstream); the "Unresolvable
  operands." deferral paragraph the comment names is type-system.md:50.
- code-registry-parse.md:59 is the `theta/parse/let-without-initialiser` row;
  the "where the RHS type is statically resolvable" qualifier is in the
  `theta/parse/let-rhs-type-mismatch` row at code-registry-parse.md:62.

src/parser/type-compat.ts:314 — `decide`'s TYPE-8 arm comment:
```
  // schema ctor) still falls through to the `sub.kind !== "object"` refusal
  // below — TYPE-10's cross-form rule (type-system.md:52): an inline-object
```
type-system.md:52 is the 2026-08-24 requalification blockquote; TYPE-10 (the
cross-form rule, "A named-schema value is **not** `⊑` an inline object type")
is at type-system.md:58.

src/parser/type-compat.ts:1099 — `enumVariantType` doc:
```
 * treats an unresolvable `named "Color"` (deferred, `type-system.md:48`),
```
Same drift as above: the deferral paragraph is type-system.md:50.

## Why this is a problem
Historical narration, mechanically falsified: each citation was written to let
a reader verify a cross-module claim (where the case rule is enforced, where
the deferral is specified, which registry row's qualifier applies), and every
one of the nine now points at unrelated content — a reader following
lexer.ts:842-849 finds newline swallowing instead of the case refusal, and one
following type-system.md:48 finds the upstream-refusal paragraph whose
disposition is the opposite of the cited deferral. This is the same decay this
wave has already cataloged per-module for other files
(qw20260907183353-d2-01-producer-line-citations-drifted,
-d2-02-composition-line-citations-drifted, -d2-09-params-registry-line-
citations-drifted, -d2-10-note-channel-doc-line-citations-drifted); none of
those findings cites type-compat.ts.

## Suggested direction (non-binding, optional)
Re-point the nine citations at the current lines or replace the raw line
numbers with stable anchors (function names, registry code names, spec
section anchors), as the sibling citation-drift findings suggest for their
modules.

## False-positive check
- Every drifted target re-verified against current code: grep for
  `schema-case-mismatch` in lexer.ts (:1097 only emission); grep `>= "A"` in
  lexer.ts (:1085), frontmatter.ts (:1654), theta-document.ts (:3445, :4026),
  type-grammar.ts (:1599); sed of type-system.md:46-54 (paragraph order:
  :48 written-NamedType refusal, :50 Unresolvable operands, :52
  requalification, TYPE-10 at :58); sed of code-registry-parse.md:57-63
  (:59 let-without-initialiser, :62 let-rhs-type-mismatch with the quoted
  qualifier).
- Accurate citations in the same doc blocks were checked and are NOT claimed:
  `lexical.md:15` (PascalCase bullet) and
  `source-language-stability.md:5` (GOV-15, cited at type-compat.ts:310) both
  land on the named text.
- Duplicate check: no already-filed citation-drift finding lists any
  type-compat.ts location (the four sibling findings cover
  production-theta-producer, composition, params, note-channel files; the
  import-separator and param-line-tokenise ones cover imports/params).
- Not a behavior claim: only the comments' pointers are at issue; the code
  beneath them (`resolveNamed`'s fence, `decide`'s arms, `enumVariantType`)
  is live and correct per its tests.

## Triage
verdict: confirmed — all nine drifted citations reproduce independently (lexer.ts:842-849 is stmt-sep swallowing not the case refusal at :1094-1102/:1097; lexer.ts:833 is a bare `}` not the case test at :1085; frontmatter.ts:898, theta-document.ts:2559/:3065, type-grammar.ts:1087 are unrelated comments/code with the `isUpper` re-derivations at :1654, :3445/:4026, :1599; spec_topics/type-system.md:48 is the upstream-refusal paragraph not the :50 deferral, :52 is the 2026-08-24 requalification blockquote inserted after this comment was written (v0.266.0 > the block's v0.262.0 touch) with TYPE-10 at :58; code-registry-parse.md:59 lacks the "statically resolvable" qualifier, which is at :62), the two citations disclaimed as accurate (lexical.md:15, source-language-stability.md:5) do land, no other intake finding cites these type-compat.ts lines, and the sole slip is naming :59 the let-without-initialiser row (that is :61; :59 is tool-arg-not-object-literal) which leaves the claim intact (triage: claude-opus-5)
