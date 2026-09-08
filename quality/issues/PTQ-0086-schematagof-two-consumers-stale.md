---
id: PTQ-0086
title: SCHEMA_TAG's "Two consumers recover it" and rebuildInbound's "both `schemaTagOf` consumers" enumerate two consumers, while four modules read the schema tag today
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/value.ts:267-271
  - src/runtime/wire-translation.ts:374-376
  - src/extension/production-theta-producer.ts:7895
  - src/runtime/runtime-panics.ts:539
  - src/parser/system-interpolation.ts:723
  - src/runtime/wire-translation.ts:464-471
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SCHEMA_TAG's "Two consumers recover it" and rebuildInbound's "both `schemaTagOf` consumers" enumerate two consumers, while four modules read the schema tag today

## Observation
Two comments enumerate the consumers of the schema brand read back through
`schemaTagOf`: the `SCHEMA_TAG` declaration doc in value.ts says "Two
consumers recover it" (the QRY-18 interpolation render and the
`QuestionOperandDefectError` summariser), and a comment inside
`rebuildInbound` (wire-translation.ts) says "both `schemaTagOf` consumers"
naming the same two. `schemaTagOf` is called today from four modules — those
two plus `unionArmObjectType` in system-interpolation.ts (bug 0425) and
`rebuildUnderFirstAdmittingArm` in wire-translation.ts itself — so both
enumerations undercount.

## Evidence
src/runtime/value.ts:267-271 — the declaration-side roster:

```
 * **non-enumerable**, the posture {@link privateBrandOf} states. Two
 * consumers recover it: the QRY-18 interpolation render path, which needs
 * the declaring schema to apply outbound wire-name translation recursively,
 * and the `QuestionOperandDefectError` operand summariser
 * (`runtime-panics.ts`), which names the schema in its diagnostic text.
```

src/runtime/wire-translation.ts:374-376 — the second roster ("both"):

```
    // theta-side and already branded, and both `schemaTagOf` consumers (the
    // QRY-18 outbound render's `as` renames, the `QuestionOperandDefectError`
    // summariser's schema name) degrade silently once the brand is gone.
```

The actual consumer set. Search: `schemaTagOf` over all `*.ts` under src/,
extensions/, tools/ — call sites outside value.ts, exhaustively:

- src/extension/production-theta-producer.ts:7895 (`const brand =
  schemaTagOf(value);` inside `translateInterpolationOutbound` — claimed
  consumer 1);
- src/runtime/runtime-panics.ts:539 (`const schema = schemaTagOf(value);`,
  the operand summariser rendering `a '${schema}' schema object` — claimed
  consumer 2);
- src/parser/system-interpolation.ts:723 (`const brand = schemaTagOf(value);`
  inside `unionArmObjectType`, the bug-0425 discriminated-union arm pick —
  unlisted);
- src/runtime/wire-translation.ts:464-471 (unlisted, two reads in
  `rebuildUnderFirstAdmittingArm`):

```
  const priorTag = schemaTagOf(value as ThetaValue);
  const rebuilt = rebuildUnder(value, arm.defName, walk);
  if (
    priorTag !== undefined &&
    isPlainObject(rebuilt) &&
    schemaTagOf(rebuilt as ThetaValue) === undefined
  ) {
    brandSchemaValue(rebuilt as { [key: string]: ThetaValue }, priorTag);
  }
```

## Why this is a problem
Stale consumer-roster narration in the two places a reader is sent to learn
who depends on the brand: the declaration doc frames the tag's existence
around exactly two recoverers, and the rebuildInbound comment reasons about a
pass-through's safety from that same closed set ("both … degrade silently"),
so an audit of brand consumers stops two modules short. Git shows the
mismatch is decay: the "both" comment landed in e18b30e5 (bug 0067, v0.90.0)
when two consumers existed; the "Two consumers" text landed in ac4687db (bug
0172, v0.102.0) — the same commit that added wire-translation's own
`priorTag` reads — and the system-interpolation consumer landed in aec5e3b9
(bug 0425, v0.431.0); neither comment was updated.

## Suggested direction (non-binding, optional)
Refresh both enumerations to the current consumer set, or drop the hard count
and let the named examples stand as examples.

## False-positive check
- Reference search: `schemaTagOf` over `*.ts` in src/, extensions/, tools/,
  tests/ — every production call site outside value.ts is listed above (5
  sites, 4 modules); remaining hits are the declaration, doc references, and
  test comments. `SCHEMA_TAG` is module-private, so no dynamic/string-keyed
  access path exists (`grep "__thetaSchema"` finds only doc text and the
  symbol description).
- Verified the two claimed consumers are real and correctly named
  (translateInterpolationOutbound at producer:7861-7895; runtime-panics.ts
  :535-541 renders the schema name into the defect summary), so the finding
  claims undercount only.
- Git intent check: `git log -S "Two consumers recover it"` → ac4687db (bug
  0172); `git log -S "priorTag = schemaTagOf"` → ac4687db (same commit);
  `git log -S "schemaTagOf" -- src/parser/system-interpolation.ts` →
  aec5e3b9 (bug 0425); `git log -S 'both \`schemaTagOf\` consumers'` →
  e18b30e5 (bug 0067).
- Duplicate check: qw20260907130901-d2-02-wire-walk-line-citations-drifted
  covers only hard-pinned line numbers in wire-translation.ts and explicitly
  states "The prose claims themselves remain true"; this finding is a prose
  claim (a consumer count), a different root cause. No other filed finding or
  triage-log row names schemaTagOf's consumer roster.

## Triage
verdict: confirmed — both rosters reproduce verbatim at the cited lines (value.ts:267-271 "Two / consumers recover it", wire-translation.ts:374-376 "both `schemaTagOf` consumers"), and my own grep of `schemaTagOf` across src/, tools/, extensions/, tests/ finds 5 production call sites in 4 modules outside value.ts — producer:7895 (translateInterpolationOutbound, live from :7797), runtime-panics:539, plus the unlisted system-interpolation.ts:723 (unionArmObjectType, live from :606/:631, a brand-first union-arm pick that genuinely degrades to the structural fallback when the brand is gone) and wire-translation.ts:464/469 — with no alias, barrel re-export or `__thetaSchema` string-keyed path; in scope (the D2 brief names "historical narration comments") and not a duplicate of qw20260907130901-d2-02-wire-walk-line-citations-drifted (drifted line pins, prose held) or qw20260907202646-d2-01-rebuild-inbound-root-pointer-ternary-subsumed (same region, redundant `pointer === ""` re-test); the one misfire is non-load-bearing git colour — the value.ts text landed in 55fecbe8 (bug 0026, v0.33.0), not ac4687db, which never touched value.ts, which only makes the decay older (triage: claude-opus-5)
