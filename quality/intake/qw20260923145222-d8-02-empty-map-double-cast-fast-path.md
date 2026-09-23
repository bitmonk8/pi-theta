---
id: pending
title: buildRuntimeToolSuccessTypes carries an empty-map fast path whose only effect is one avoided Map allocation, purchased with an `as unknown as` double cast that mislabels a RuntimeToolName map as a CompatType map
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/lexical-call-sites.ts:195-214
  - src/parser/theta-document.ts:388-390
sites: 1
fix_scope: localized
d8_class: overbuilt
d8_host: src/parser/lexical-call-sites.ts#buildRuntimeToolSuccessTypes
wave: qw20260923145222
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# buildRuntimeToolSuccessTypes carries an empty-map fast path whose only effect is one avoided Map allocation, purchased with an `as unknown as` double cast that mislabels a RuntimeToolName map as a CompatType map

## Observation
`buildRuntimeToolSuccessTypes` (lexical-call-sites.ts:195-214, one src importer per the map) builds the presented-name → success-`CompatType` map from the frontmatter `tools:` list. When `runtimeToolPresentedNames` returns an empty map, an early return hands the caller that same `ReadonlyMap<string, RuntimeToolName>` object force-cast through `unknown` to `ReadonlyMap<string, CompatType>`. The general path below it (`const out = new Map(); for (...) {...} return out;`) already returns a correctly-typed empty map for an empty `presented`, so the branch's entire payoff is skipping one empty-`Map` allocation, once per document parse.

## Evidence
lexical-call-sites.ts:195-214 (re-read before filing):
```ts
export function buildRuntimeToolSuccessTypes(
  tools: readonly string[] | undefined,
): ReadonlyMap<string, CompatType> {
  const presented = runtimeToolPresentedNames(tools);
  if (presented.size === 0) {
    return presented as unknown as ReadonlyMap<string, CompatType>;
  }
  const out = new Map<string, CompatType>();
  for (const [name, canonical] of presented) {
```
Counted concept inventory: 1 special-case branch (:199-201) + 1 double type assertion (`as unknown as`, :200) beyond the general loop. Job statement: input — the raw `tools:` list (a handful of entries per theta at most; the function's own header says "GOV-15 inert: the returned map is empty when the `tools:` list declares no runtime tool", i.e. empty for every 1.0.0-clean file); output — a ≤`RUNTIME_TOOL_SIGNATURES.size`-entry map; call sites — exactly one, `theta-document.ts:390`, once per document parse. Deleting :199-201 leaves behaviour identical: the `for` loop over an empty map executes zero iterations and `out` is returned empty.

## Why this is a problem
Complexity disproportionate to the job: the branch exists only to reuse an empty `Map<string, RuntimeToolName>` object under a false type label, and the label is made safe only by the emptiness the guard just tested — a coupling the code states nowhere (no comment on the cast; the function header does not mention it). The saved cost is one empty-Map allocation per document parse. The double assertion is the type system's own escape hatch for conversions it would otherwise reject, deployed here to dodge a two-token constructor call, and it leaves a landmine: any future edit that loosens the `size === 0` guard returns wrongly-typed live entries with no compiler complaint.

## Suggested direction (non-binding, optional)
Unproven hypothesis: delete the early return (:199-201) and let the general path return the empty `out` map; or, if the allocation matters somewhere unmeasured, return a shared frozen empty map typed once. Not verified against any perf constraint.

## False-positive check
- Exemption check: neither D8 durable exemption names this host; no already-filed issue names `buildRuntimeToolSuccessTypes` (the D9 filings on lexical-call-sites.ts in the filed list — PTQ-1195 walkCallSiteExpr — concern other members).
- Rationale check (D2 precedent: a stated-rationale knob is a design decision): re-read :188-201 — the header comment covers RFC 0011/GOV-15 semantics only; no rationale is stated for the fast path or the cast.
- Spec check: no docs/spec_topics clause pins this function's allocation behaviour.
- Call-site check: `grep -rn buildRuntimeToolSuccessTypes src/` — one live call site (theta-document.ts:390) plus a doc mention (annotation-compat.ts:114); removing the branch demotes nothing to test-only reachability.

## Triage
verdict: questionable — accounting verified: excerpt verbatim at lexical-call-sites.ts:195-214, sole live caller theta-document.ts:110/:390 (my grep across src/ extensions/ tools/ tests/ finds no other; annotation-compat.ts:114 is a comment), `runtimeToolPresentedNames` (runtime-tools.ts:91-108) allocates a fresh Map per call so no shared-constant reuse justifies the branch, the `as unknown as` cast arrived uncommented in 27c267ed and moved verbatim in 336b8de4, no D8 exemption row names this host, no docs/spec_topics clause pins allocation, and resolved PTQ-1156/1166/1248/1264/1270/1418 mention the function only in D9 inventories/call-site rosters, not this fast path; whether to drop the branch or keep a typed shared empty map is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: excerpt matches lexical-call-sites.ts:195-214 exactly (one `size === 0` special case plus one `as unknown as` cast at :199-201, neither commented); my grep of src/ extensions/ tools/ tests/ finds one live caller (theta-document.ts:390, imported at :110), a comment mention at annotation-compat.ts:114, and no test callers; runtimeToolPresentedNames (runtime-tools.ts:91-108) builds a fresh Map each call, so the branch saves only one empty-Map allocation, and deleting it gives the same result because the loop runs zero times on an empty map; no D8 exemption row in quality/exemptions.json, and no spec clause pins this; resolved PTQ-1156/1166/1248/1264/1270/1418 name the function only in rosters or excerpts, so no duplicate; the harm is a latent type-lie hazard rather than a live defect, so whether to delete the branch is a design decision for a human ruling (triage: claude-opus-5-5)
