---
id: pending
title: "bindParamsInbound's doc comment cites theta-composition-producer.ts:102 for paramBindingsFrom, but the function sits at :96 and its call to bindParamsInbound sits at :104"
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/inbound-boundary.ts:138-145
  - src/extension/theta-composition-producer.ts:96-104
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# bindParamsInbound's doc comment cites theta-composition-producer.ts:102 for paramBindingsFrom, but the function sits at :96 and its call to bindParamsInbound sits at :104

## Observation
`bindParamsInbound`'s doc comment in `inbound-boundary.ts` traces a filled
default's arrival at this boundary through "`paramBindingsFrom`
(`src/extension/theta-composition-producer.ts:102`)". Today `paramBindingsFrom`
is declared at line 96, and its own call into `bindParamsInbound` — the thing
the sentence is actually pointing a reader toward — is at line 104. Line 102
today is the `if (args === undefined) {` guard inside the function, unrelated
to either the declaration or the call.

## Evidence
`src/runtime/inbound-boundary.ts:138-145`:
```ts
 * A theta with no `params:` has no lowered document to plan against, so its
 * record is projected unchanged. A filled default DOES arrive here: the
 * merged `args` `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`)
 * produces are exactly what `paramBindingsFrom`
 * (`src/extension/theta-composition-producer.ts:102`) hands this function,
 * defaulted fields included, and for a value in WIRE form this pass is what
 * re-tags a named-enum position / re-brands a schema-typed one.
 * `runtime-value-model.md:37` states the same mechanism: a default projected
```

`src/extension/theta-composition-producer.ts:96-104` (the actual function and
its call into `bindParamsInbound`):
```ts
function paramBindingsFrom(
  theta: ThetaCompositionInput,
  args: Readonly<Record<string, unknown>> | undefined,
  schemaValidator: Pick<SchemaValidator, "compile"> | undefined,
): ReadonlyMap<string, ThetaValue> | undefined {
  if (args === undefined) {
    return undefined;
  }
  return bindParamsInbound({
    params: args,
```

`grep -n "function paramBindingsFrom\|bindParamsInbound(" src/extension/theta-composition-producer.ts`
returns exactly two hits in that file: the declaration at line 96 and the call
at line 104 — no `paramBindingsFrom`-related content at line 102.

## Why this is a problem
The citation is meant to let a reader jump straight to the caller that hands
`bindParamsInbound` a filled default. Line 102 today is an unrelated early-return
guard three lines into the function body, not the declaration and not the call
the sentence is illustrating. `git log -p` on this file shows the citation was
`:99` at an earlier revision (itself already inexact for a declaration at a
different line then) and was bumped to `:102` in a later edit that also missed
the mark — the number has drifted at least twice as the file grew without the
comment being re-checked against the function it names.

## Suggested direction (non-binding, optional)
Point the citation at the call site that actually hands the value
(`theta-composition-producer.ts:104`), or drop the line number and name only
the function symbol, which needs no renumbering as the file grows.

## False-positive check
- `grep -n "function paramBindingsFrom\|bindParamsInbound(" src/extension/theta-composition-producer.ts`
  → declaration at 96, call at 104; no other match.
- Read lines 96-112 of `theta-composition-producer.ts` in full: confirmed line
  102 is `if (args === undefined) {`, an early-return guard with no relation to
  `bindParamsInbound`.
- `git log -p --follow -- src/runtime/inbound-boundary.ts` on this comment
  line: shows the cited line number was `:99` before a later edit changed it to
  the current `:102`, i.e. the citation has been hand-adjusted before and still
  does not match the function's current declaration (:96) or its
  `bindParamsInbound` call (:104).
- Checked this wave's other filed citation-drift finding on the same function
  (`qw20260920183643-d2-06-parambindingsfrom-call-site-citation-stale.md`):
  that finding is about a DIFFERENT citation, in `production-theta-producer.ts`,
  pointing at `theta-composition-producer.ts:527` for the call (now at :585);
  this finding is about the citation in `inbound-boundary.ts` pointing at
  `:102` for the declaration (now at :96) — a disjoint location and a disjoint
  cited line, not a re-file of the same fact.

## Triage
<!-- triage appends its note below this line -->
