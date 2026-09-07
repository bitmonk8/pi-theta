---
id: pending
title: annotationToInferred's leading-brace pre-guard is subsumed by compatToInferred's identifier gate — removing it changes no output for any input
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/query-schema-resolve.ts:691-700
  - src/parser/query-schema-resolve.ts:710-719
  - src/parser/type-layer-checks.ts:981-1008
sites: 1
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# annotationToInferred's leading-brace pre-guard is subsumed by compatToInferred's identifier gate — removing it changes no output for any input

## Observation
`annotationToInferred` refuses any source whose trimmed text starts with `{` before calling `annotationToCompatType`, on the stated ground that the type parser "would mis-read it as a `named` reference". Directly below, `compatToInferred`'s `named` arm rejects every non-identifier name with an anchored regex, and its own comment claims exactly the inline-object case ("a non-identifier 'name' is really an inline object (`{a: string}`) … matching the top-level object/union limit"). For every `{`-leading input the two layers compute the same `undefined`; the pre-guard is a special case the general gate fully covers.

## Evidence
src/parser/query-schema-resolve.ts:691-700 — the pre-guard:
```
function annotationToInferred(source: string): InferredSchema | undefined {
  // An inline object type (`{ a: string }`) is not representable in
  // `InferredSchema`; `annotationToCompatType` would mis-read it as a `named`
  // reference, so guard it here (the query stays untyped at an indirect object
  // sink — the documented advanced-position limit).
  if (source.trim().startsWith("{")) {
    return undefined;
  }
  return compatToInferred(annotationToCompatType(source));
}
```
src/parser/query-schema-resolve.ts:710-719 — the subsuming gate:
```
    case "named":
      // `annotationToCompatType` maps any unrecognised text to `named`, so a
      // non-identifier "name" is really an inline object (`{a: string}`), a
      // union (`A|B`), or another shape `InferredSchema` cannot represent (e.g.
      // as an `array<T>` element). Reject anything that is not a plain schema
      // identifier so such sinks stay UNTYPED (schema null → `string`), matching
      // the top-level object/union limit.
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(type.name)
        ? { kind: "named", name: type.name }
        : undefined;
```
src/parser/type-layer-checks.ts:981-1008 — `convertAnnotation` (what `annotationToCompatType(src)` runs, with `mintInlineObjects: false`) has exactly four return shapes for non-empty text: a `union` of recursively converted arms (:988-992), an `array` (`^array<(.+)>$`, :994-997), a `prim` (exact `PRIMITIVE_NAMES` member, :999-1000), or the fallback `named` carrying the trimmed text verbatim (:1008). The doc at :907-908 confirms "it never mints `CompatType`'s `object` arm".

Exhaustive case analysis for a source whose trimmed text starts with `{`:
- `prim` is impossible (the text is not an exact primitive name) and `array` is impossible (the text does not start with `array<`).
- The `named` fallback carries text starting with `{`, which cannot match `^[A-Za-z_]…` — compatToInferred returns `undefined` (:717-719).
- A `union` (a top-level `|` inside the braces, since `splitTopLevelUnion` tracks `<…>` depth only — type-layer-checks.ts:972-975) maps through compatToInferred's `union` arm to `undefined` (query-schema-resolve.ts:724-728).
- An `undefined` conversion maps to `undefined` (query-schema-resolve.ts:704-706).
Every path yields the same `undefined` the guard returns.

## Why this is a problem
Redundant branch: the pre-guard duplicates a rejection the immediately downstream projection performs for the identical input class, so the branch's removal is output-identical over the whole input domain. Its comment additionally preserves a superseded justification — the "mis-read as a `named` reference" it fears is precisely what the `named` arm's regex was written to refuse (that arm's own comment names the inline-object case and the nested `array<T>`-element case the top-level guard can never see). The general gate subsumed the special case, and the special case was left behind.

## Suggested direction (non-binding, optional)
Delete the pre-guard and fold its "documented advanced-position limit" note into `compatToInferred`'s `named`-arm comment, which already states the same limit.

## False-positive check
- Enumerated `convertAnnotation`'s return arms under `mintInlineObjects: false` (type-layer-checks.ts:982-1008) and verified no arm can yield a `prim`, an `array`, an `object`, or an identifier-shaped `named` for `{`-leading text; verified `convertAnnotation` trims and never throws, so the guard is not a throw-shield.
- Checked all three `annotationToInferred` call sites (query-schema-resolve.ts:194 — `let` annotation; :261 — `fn` return type, reached only for non-empty, non-`void` text; :565 — `callArgFrame` for `param.type.length > 0`) — each passes raw annotation text; none depends on the guard firing before `annotationToCompatType` runs for a side effect (the conversion is pure).
- Edge inputs traced by hand: `{}`, `{ a: string }`, `{a: A} | null` (splitTopLevelUnion shreds at the brace-interior `|`, arms convert to `named "{a: A"` / `prim null`, union → undefined), leading-whitespace variants — all `undefined` on both routes.
- Duplicate check: qw20260907130901-d2-01-parse-generic-guard-subsumed concerns a different guard in a different module; no filed finding cites query-schema-resolve.ts's annotationToInferred.
- Not a behavior/bug claim: both routes agree today; the finding is the redundancy, not a divergence.

## Triage
