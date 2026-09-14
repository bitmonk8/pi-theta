---
id: PTQ-0065
title: isObjectValue's doc-comment enumerates "the four runtime read entry points" routing through it, but a fifth production caller (matchPattern's object arm) has routed through it since bug 0317
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/value.ts:212-218
  - src/runtime/match-result.ts:212-217
  - src/runtime/statement-executor.ts:1480
  - src/extension/production-theta-producer.ts:8318
  - src/runtime/runtime-panics.ts:317
  - src/runtime/runtime-panics.ts:361
sites: 6                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# isObjectValue's doc-comment enumerates "the four runtime read entry points" routing through it, but a fifth production caller (matchPattern's object arm) has routed through it since bug 0317

## Observation
`isObjectValue`'s doc-comment closes with a caller roster: "the four runtime
read entry points route through [it] ahead of the object path, so a
classification change has one definition site rather than four", and it names
exactly four callers. Today five production call sites route through the
function: the four named ones plus `matchPattern`'s object arm in
`match-result.ts`, which bug 0317's fix (v0.296.0) added and which the comment
does not mention. The "rather than four" count and the four-entry enumeration
no longer describe the routing set.

## Evidence
src/runtime/value.ts:212-218 — the roster:

```
 * The single classification point the four runtime read entry points route
 * through ahead of the object path, so a classification change has one
 * definition site rather than four: `applyStdlibMethod`
 * (statement-executor.ts) and `evaluateStdlibMethod`
 * (production-theta-producer.ts) ahead of their `evaluateObjectMember` call;
 * the widened non-object guard in `evaluateIndexAccess` and the enum/`Result`
 * guard in `evaluateMemberAccess` (both runtime-panics.ts).
```

src/runtime/match-result.ts:212-217 — the fifth caller, inside `matchPattern`
(declared at :169), which reads pattern fields off the value below the guard:

```
      // Enum and Result carriers satisfy JS `typeof "object"` but carry no
      // field surface in the language's value model, so they must not take
      // the object/schema arm even though the typeof/null/array guard above
      // lets them through structurally.
      if (!isObjectValue(value)) {
        return false;
      }
```

The four enumerated callers all still exist: `applyStdlibMethod`
(src/runtime/statement-executor.ts:1472, guard at :1480),
`evaluateStdlibMethod` (src/extension/production-theta-producer.ts:8306, guard
at :8318), `evaluateIndexAccess` (src/runtime/runtime-panics.ts:274, guard at
:317), `evaluateMemberAccess` (src/runtime/runtime-panics.ts:357, guard at
:361). Search: `isObjectValue` over all `*.ts` under src/, extensions/,
tools/, tests/ — production call sites are exactly the five listed above (plus
the declaration and doc references).

## Why this is a problem
Stale caller-count narration: the comment's load-bearing claim is that the
classification has "one definition site rather than four", i.e. that the
roster is complete, so a reader auditing the classification's blast radius
stops at the four named read entry points and misses the pattern-match arm.
Git shows decay, not intent: the phrase landed in commit 5f0ca9cd (bug 0027,
v0.39.0) when four callers existed; the fifth caller landed in 7cc633af (bug
0317, v0.296.0) without the comment being updated.

## Suggested direction (non-binding, optional)
Refresh the enumeration to include `matchPattern`'s object arm (or restate the
sentence without a hard count, e.g. "the runtime surfaces that classify object
values route through this one definition site").

## False-positive check
- Reference search: `isObjectValue` across the repository (`grep -rn` over
  src/, extensions/, tools/, tests/; also a repo-wide pass) — production call
  sites: statement-executor.ts:1480, production-theta-producer.ts:8318,
  runtime-panics.ts:317, runtime-panics.ts:361, match-result.ts:216. Hits in
  `dist/` and `.pi/tmp/` are build artifacts/scratch copies, not sources; test
  hits are comments/witness references, not additional production callers.
- Verified each enumerated caller's enclosing function by declaration line so
  the finding claims omission only, not misattribution (declarations at
  statement-executor.ts:1472, production-theta-producer.ts:8306,
  runtime-panics.ts:274, runtime-panics.ts:357).
- Git intent check: `git log -S "four runtime read entry points"` → added
  5f0ca9cd (bug 0027, v0.39.0), never touched since; match-result.ts caller
  added 7cc633af (bug 0317, v0.296.0) per `git log --oneline -- 
  src/runtime/match-result.ts`.
- Duplicate check: the wave's filed value.ts finding
  (qw20260907130901-d2-01-value-model-stub-narration-stale) covers the module
  header's stub narration only; the filed citation-drift finding
  (qw20260907130901-d2-02-wire-walk-line-citations-drifted) covers pinned line
  numbers and states its prose claims remained true. Neither covers this
  roster. No triage-log rejection matches.

## Triage
verdict: confirmed — re-grepped `isObjectValue` across src/, extensions/, tools/, tests/: five production callers (statement-executor.ts:1480, production-theta-producer.ts:8318, runtime-panics.ts:317, :361, match-result.ts:216) against value.ts:212-218's four-caller roster, and `git show --stat 7cc633af` (bug 0317, v0.296.0) added the fifth without touching value.ts. (triage: claude-opus-5)
