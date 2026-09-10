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
verdict: questionable — the redundancy reproduces (I re-derived it and fuzzed 4129 brace-leading inputs through both routes: zero divergence, guard removal is output-identical), but the "general gate subsumed the special case, and the special case was left behind" anchor is refuted by `git log -L 691,700:src/parser/query-schema-resolve.ts` — the guard and `compatToInferred`'s identifier regex entered in the SAME commit 72272a20, byte-identical to HEAD, so there is no supersession or vestige, and the guard's stated reason (`annotationToCompatType` maps `{ a: string }` to `named`) is still factually true, not expired; docs/bugs/0130 §Fix (f):935-946 already names both the `named` arm and this `startsWith("{")` guard as stating the same reason and records a held disposition, and 0093:73-77/:322, 0220:40, 0222:81-85 each cite the guard by name, leaving a taste-level belt-and-braces call a human should rule (triage: claude-opus-5)
verdict: questionable — the mechanical core reproduces on my own re-verification (all three excerpts byte-match after a 33-line drift from 96303cc3; `convertAnnotation` under `mintInlineObjects:false` returns only union/array/prim/named, and a vitest harness I ran over 1818 brace-leading inputs found zero divergence between guarded and unguarded routes, every result `undefined`), but the anchor that would make this cruft rather than belt-and-braces is refuted: `git blame` puts the guard (:724-733) and the `named`-arm regex (:743-752) in the SAME commit 72272a20, so nothing was "subsumed" or "left behind"; the guard's stated reason is literally true at HEAD (`annotationToCompatType("{ a: string }")` → `{kind:"named"}`, a hold documented at type-layer-checks.ts:907-938); and the guard has been consciously examined and kept by bug 0097 §residual 4 ("left alone") and bug 0130 §Fix (f) (both comments named as expiring only under a widening that was held), with 0093:322/0220:40 citing its behaviour — what remains is a born-redundant defensive short-circuit whose removal is a taste call (cf. confirmed PTQ-0005, a structural in-function implication whose candidate stated the history correctly), so a human should rule (triage: claude-opus-5)
verdict: questionable — independently re-verified end-to-end: all three excerpts content-match at HEAD (7-22 line drift) and a vitest fuzz I ran (20,000 random + 12 hand-picked brace-leading inputs) against the real exported `annotationToCompatType` shows zero divergence between the guarded and unguarded routes, so the redundancy is real; but the anchor fails — my own `git blame` places the guard (:704-713) and `compatToInferred`'s identifier regex (:723-732) in the SAME commit 72272a20, each comment stating its own self-sufficient rationale with no cross-reference, and docs/bugs/0097 §residual 4 ("confirmed out of this class... and left alone") plus 0130 §Fix (f) ("both state the current mis-read as their reason", held) show this exact overlap was subsequently examined twice more and deliberately kept, not decayed — a taste-level consolidation call for a human, concurring independently with the two prior passes on file (triage: claude-opus-5)
verdict: questionable — independently reproduced: excerpts content-match at HEAD (annotationToInferred :704-713, compatToInferred's named arm :716-732, convertAnnotation :988-1015) and my own 250,011-case fuzz of brace-leading inputs through a faithful reimplementation of both routes found zero divergence, so "removing it changes no output for any input" holds; but `git blame` on both cited ranges resolves to the SAME commit 72272a20 (the commit that created query-schema-resolve.ts as a new file), so "the general gate subsumed the special case, and the special case was left behind" is not a real supersession — nothing predates anything here; docs/bugs/0097 §residual 4 names this exact guard by line and rules it "[c]onfirmed out of this class ... and left alone", and docs/bugs/0130 §Fix (f) separately names the guard and the named-arm regex together as comments that would expire only under a held widening — two independent, on-record examinations that chose to keep the redundancy, not oversight — so this is a taste-level belt-and-braces call for a human, agreeing with all three prior passes (triage: claude-opus-5)
verdict: questionable — independently re-verified from scratch: all three excerpts content-match at HEAD (13-22 line drift) and a vitest fuzz I ran against the real exported `annotationToCompatType` (200,000 random brace-leading strings + 13 hand-picked edge cases, guarded route vs. a byte-faithful reimplementation of `compatToInferred`) found zero divergence, so the redundancy is mechanically real; but the "left behind" anchor is false — my own `git blame -L` on both cited ranges resolves to the SAME commit 72272a20, so the guard was never superseded by a later gate, and docs/bugs/0097's Residuals item 4 ("Confirmed out of this class ... and left alone"), 0130 §Fix (f) (names this guard and the named-arm regex together as a HELD consumer of the unwidened conversion, fixed at 0.160.0 without touching either), plus 0093/0220/0222's citations show four separate, on-record investigations examined this exact overlap and knowingly kept it — so this is a taste-level belt-and-braces call for a human, concurring with all four prior passes (triage: claude-opus-5)
