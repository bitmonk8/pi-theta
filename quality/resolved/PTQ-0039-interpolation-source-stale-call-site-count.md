---
id: PTQ-0039
title: parseInterpolationSource's doc comment says parseExpressionSource has "four" residue-drain-free call sites; there are now five
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:1895-1896
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parseInterpolationSource's doc comment says parseExpressionSource has "four" residue-drain-free call sites; there are now five

## Observation
`parseInterpolationSource`'s doc comment closes with a claim about its sibling
`parseExpressionSource`: "its other four call sites do not want the residue
drain." The count was correct when the comment was written (the bug-0122 fix)
and is stale today: `parseExpressionSource` has five production call sites. A
fifth call site was added later in type-layer-checks.ts and the comment's
count — which asserts a property of every enumerated caller — was not
re-verified.

## Evidence
src/parser/theta-document.ts:1895-1896:

```ts
 * the expression — not only the expression's own emitters — has a chance to
 * draw a diagnostic before it is discarded. `parseExpressionSource` itself is
 * untouched: its other four call sites do not want the residue drain.
```

Current production call sites of `parseExpressionSource` (search:
`grep -rn "parseExpressionSource(" src` excluding the definition — 5 hits):

- src/extension/production-theta-producer.ts:1612
- src/extension/production-theta-producer.ts:7712
- src/parser/theta-document.ts:8305 (`checkParamsDefaultNames`)
- src/parser/type-layer-checks.ts:3383
- src/parser/type-layer-checks.ts:3434

At commit 09cb77a1 ("fix(bug-0122): surface template-interpolation parse
diagnostics"), which introduced this sentence, the same search over that tree
yields exactly four call sites (production-theta-producer.ts ×2,
theta-document.ts ×1, type-layer-checks.ts ×1); the fifth —
type-layer-checks.ts:3434, inside `checkQueryInterpolationOperands` — arrived
later.

## Why this is a problem
Historical narration drift: the comment enumerates the function's caller set
by count to assert that each of those callers deliberately declines the
residue-drain behaviour. With the count wrong, a maintainer auditing
residue-drain coverage (exactly what this sentence exists for) cannot trust
the sentence — it silently excludes the newest caller from the stated
"do not want the residue drain" judgement, which nobody has recorded for it.

## Suggested direction (non-binding, optional)
Restate the claim without a hardcoded count (e.g. "its existing call sites do
not want the residue drain"), or re-verify and update the number.

## False-positive check
- Counted call sites in current src/ (5, listed above with paths and lines);
  excluded the function's own definition and comment mentions; tests also call
  it but the sentence's subject is the production caller set that pre-existed
  parseInterpolationSource, which was and is src-side.
- Alternate reading check: "its other four call sites" cannot mean "four of
  its call sites besides some fifth already counted" — parseInterpolationSource
  does not call parseExpressionSource (it drives
  parseSingleExpressionWithResidue on its own BodyParser), so "other" contrasts
  with parseInterpolationSource itself, and the sentence claims the totality of
  parseExpressionSource's callers.
- Git verification: `git log -S "its other four call sites"` → 09cb77a1;
  `git grep -c "parseExpressionSource(" 09cb77a1 -- src` → 4 call sites plus
  the definition, confirming the count was accurate when written and went
  stale when type-layer-checks.ts gained its second call.
- Confirmed no filed wave candidate cites src/parser/theta-document.ts.

## Triage
verdict: confirmed — re-grepped src/: parseExpressionSource has 5 call sites today (production-theta-producer.ts:1619,7780; theta-document.ts:8305; type-layer-checks.ts:3383,3434) vs 4 at 09cb77a1 where the sentence was written, the fifth added by d224287a's checkQueryInterpolationOperands, so the present-tense "other four call sites" at theta-document.ts:1896 is stale historical narration in src/ (triage: claude-opus-5)
