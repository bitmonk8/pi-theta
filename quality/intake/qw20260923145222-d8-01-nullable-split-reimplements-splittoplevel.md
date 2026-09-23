---
id: pending
title: typeSourceIsNullable hand-rolls a nesting-blind `split("|")` while the already-imported type-text-split module's splitTopLevel provides the top-level union-arm split
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/frontmatter-params.ts:51-57
  - src/parser/frontmatter-params.ts:15
  - src/parser/type-text-split.ts:426-434
  - src/binder/binder-envelope.ts:204-215
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/parser/frontmatter-params.ts#typeSourceIsNullable
wave: qw20260923145222
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# typeSourceIsNullable hand-rolls a nesting-blind `split("|")` while the already-imported type-text-split module's splitTopLevel provides the top-level union-arm split

## Observation
`typeSourceIsNullable` (frontmatter-params.ts:52-57) answers "does this declared `params:` type carry a top-level `| null` arm" with a plain `String.prototype.split("|")`. The same file already imports from `./type-text-split` (line 15, `skipQuotedRegion`), the module that owns the codebase's canonical top-level union-arm split — `splitTopLevel(source, "|")` — which respects angle-bracket nesting and `"`/`'` string literals (via `splitTopLevelSegments`'s typed opener stack and quote tracking, type-text-split.ts:359-414). The doc comment on the hand-rolled function itself claims the top-level semantics ("a top-level `| null` arm") that only the facility delivers.

## Evidence
The hand-rolled split, frontmatter-params.ts:51-57:
```ts
/** Whether a lowered type expression is a nullable union (a top-level `| null` arm). */
function typeSourceIsNullable(typeSource: string): boolean {
  return typeSource
    .split("|")
    .map((arm) => arm.trim())
    .some((arm) => arm === "null");
}
```
The facility, in a module this file already imports (frontmatter-params.ts:15 `import { skipQuotedRegion } from "./type-text-split";`), type-text-split.ts:426-434:
```ts
export function splitTopLevel(
  source: string,
  separator: string,
  nesting: TypeSplitNesting = "angle",
): string[] {
  return splitTopLevelSegments(source, separator, nesting).filter(
    (segment) => segment.length > 0,
  );
}
```
Feature-for-feature against the site's stated need ("a top-level `| null` arm"):
- `array<a | null | b>`: naive split yields arms `["array<a ", " null ", " b>"]` — the middle arm trims to `"null"`, so `typeSourceIsNullable` answers true for a type with no top-level null arm. `splitTopLevel("array<a | null | b>", "|")` yields one arm (the whole application) — false.
- literal type `"a|null|b"`: naive split yields `[`"a`, `null`, `b"`]` — true. `splitTopLevelSegments` tracks quotes (type-text-split.ts:373-379) — false.

The flag's sole reader is `classifyBinderBypass` (binder-envelope.ts:204-215): `field.nullable !== true` inside the `field.type === "string"` guard, so the misclassification is masked at that one consumer today (a `type` of exactly `"string"` never splits to a `null` arm), but the wrong flag is stored on every `BypassParamsField` (frontmatter-params.ts:232 `nullable: typeSourceIsNullable(typeSource)`).

## Why this is a problem
A facility the file already depends on — the module's own canonical answer to "split a type expression at top level", built with a typed opener stack precisely because bare depth counters and naive splits misjudge nested unions (the bug 0238 comment at type-text-split.ts:366-371 records this) — is re-derived here as the weaker naive split, and the re-derivation's own doc comment claims semantics ("top-level") it does not have. The divergent values are computed and persisted on the parsed-params record for every field; only an incidental guard at the single current reader keeps them from being observed.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `splitTopLevel(typeSource, "|").some((arm) => arm === "null")` replaces the body one-for-one and makes the comment true. Not verified against any test pinning the current naive behaviour.

## False-positive check
- Exemption check: neither D8 durable exemption names this host; not in the already-filed list (grepped quality/ for `typeSourceIsNullable` — only PTQ-1146, a D9 breakdown filing on frontmatter.ts, mentions the file; no filing names this function).
- Spec check: no docs/spec_topics clause pins a nesting-blind nullable test; binder-envelope's §Binder bypass formula wants "not nullable", i.e. the top-level semantics the comment claims.
- Consumer search: `grep -n nullable src/` — the only reader of `field.nullable` is binder-envelope.ts:211; no dynamic/string-keyed access found.
- D2 precedent check: this is not a spec-mirroring conjunct or threaded seam being called dead; the flag stays, only its computation is at issue.

## Triage
verdict: questionable — accounting verified: excerpts reproduce (frontmatter-params.ts:51-57 naive `split("|")`, :15 imports `skipQuotedRegion` from ./type-text-split, :232 stores the flag; type-text-split.ts:426-434 `splitTopLevel` over the typed-opener/quote-tracking `splitTopLevelSegments`), the divergence reproduces by execution (`array<a | null | b>` and `"a|null|b"` → naive true, splitTopLevel false), the flag's sole reader is binder-envelope.ts:211 inside the `type === "string"` guard (grep `.nullable` across src/extensions/tools/tests: only that reader plus two tests whose inputs carry no `null` and pass either way), host not in quality/exemptions.json, no prior filing names the function (PTQ-1140 covered the sibling `splitParamValue` quote scanner), and the spec (binder-bypass-and-envelope.md:13 "nullable types go through the binder") wants the top-level semantics the doc comment claims, so no behaviour is dropped; one fixer note: `params:` values can be inline objects, so the facility call needs `nesting: "angle-and-brace"` (`{a: string | null | b}` is still true under the default "angle" nesting) — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: the excerpts are real (frontmatter-params.ts:51-57 does a plain `split("|")`, :15 imports from ./type-text-split, :232 stores the flag; type-text-split.ts:426-434 has splitTopLevel on top of the typed-opener/quote-tracking splitTopLevelSegments). I ran both on the cited inputs: `array<a | null | b>` and `"a|null|b"` give true for the naive split and false for splitTopLevel. The only src reader of `.nullable` is binder-envelope.ts:211, behind the `type === "string"` guard, and the two tests that assert it use inputs with no null. The host is not in exemptions.json. This is not a duplicate: resolved PTQ-1141 covers type-layer-checks.ts splitters and resolved PTQ-1146 is D9 placement. Spec binder/binder-bypass-and-envelope.md:13 ("nullable types go through the binder") asks for top-level semantics, so the facility drops no behaviour. The facility does need `"angle-and-brace"` nesting, since `{a: string | null | b}` still gives true under the default. The simpler shape is a design decision for a human ruling (triage: claude-opus-5-5)
