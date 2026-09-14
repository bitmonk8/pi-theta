---
id: PTQ-0320
title: groupBy hand-rolls the Map-bucketing loop Map.groupBy already provides at this package's own Node floor
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-path-classify.ts:458-470
  - src/discovery/discovery-walk.ts:433
  - src/discovery/discovery-walk.ts:1031
  - src/discovery/discovery-walk.ts:1127-1128
  - package.json:44
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: reimplemented      # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/discovery/discovery-path-classify.ts#groupBy
wave: qw20260914060226
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# groupBy hand-rolls the Map-bucketing loop Map.groupBy already provides at this package's own Node floor

## Observation
`groupBy` (discovery-path-classify.ts:458-470) buckets an array into a
`Map<K, T[]>` keyed by a caller-supplied selector: for each item it computes
the key, then either opens a new one-element bucket or appends to the
existing one, preserving each bucket's own insertion order. This is the exact
contract of the standard `Map.groupBy(items, keyFn)` static method
(ECMAScript 2024 / V8 12.0), which has been available with no import and no
flag since Node.js 21.0.0. This package's own `engines.node` floor
(`package.json:44`) is `>=22.19.0` — two major Node releases past
`Map.groupBy`'s availability. `groupBy` is imported into discovery-walk.ts
and called at four sites (433, 1031, 1127, 1128), every one passing a plain
single-argument `(item) => key` selector — the exact shape `Map.groupBy`
takes.

## Evidence

**The reimplementation — discovery-path-classify.ts:458-470:**
```ts
export function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }
  return groups;
}
```

**The facility it reimplements** — `Map.groupBy`, ECMA-262 §Map.groupBy
(ES2024), a static method the JS engine provides natively (no import). Per
Node.js's own release notes it is unflagged since v21.0.0; this package's
floor is `>=22.19.0` (package.json:44: `"node": ">=22.19.0"`), confirmed
live on the review machine (`node --version` → `v24.16.0`).

**Feature-for-feature verification against the four call sites' real
needs** — every call site passes a one-argument `(item) => key` selector
over a plain array, e.g. discovery-walk.ts:1031:
```ts
const bySource = groupBy(candidates, (candidate) => candidate.source);
```
and :1127-1128:
```ts
const piOwnedByName = groupBy(piOwned, (command) => command.name);
const byName = groupBy(candidates, (candidate) => candidate.stem);
```
Ran the hand-rolled function and `Map.groupBy` side by side (`node -e`) over
four shapes matching these call sites' real data (empty array, one item,
five items across three keys, and case-variant string keys as
`resolveCaseCollisions`'s :433 call uses): every case produced the identical
`Map` — same key set, same per-bucket arrays in the same order, both
`instanceof Map`:
```
case 0 match: true a instanceof Map: true b instanceof Map: true
case 1 match: true a instanceof Map: true b instanceof Map: true
case 2 match: true a instanceof Map: true b instanceof Map: true
case 3 match: true a instanceof Map: true b instanceof Map: true
```
`Map.groupBy`'s callback signature is `(item, index) => key`; the hand-rolled
`keyOf: (item: T) => K` is a strict subset (every call site ignores the
index), so every existing call site's selector is already a valid
`Map.groupBy` callback with no rewrite.

## Why this is a problem
The insertion-order preservation, the bucket-append-vs-open branch, and the
`Map`-keyed-by-arbitrary-value semantics `groupBy` hand-rolls are exactly what
the native static method already guarantees by specification, at a Node
floor this package has already committed to (two majors past the method's
introduction). The hand-rolled version is a second, independently-maintained
implementation of that one guarantee: its 13 lines carry no domain-specific
behaviour beyond what `Map.groupBy` already does (this review's own
verification found zero divergence across every shape the four call sites
exercise), so they are a maintenance and reading surface for a job the
runtime already performs.

## Suggested direction (non-binding, optional)
Replace the four call sites' `groupBy(items, keyOf)` with
`Map.groupBy(items, keyOf)` and drop the local function. Unproven caveat:
this repository's `tsconfig.json` pins `"lib": ["ES2022"]`, which predates
`Map.groupBy`'s type declarations (ES2024) — the type checker would need a
`lib` bump (or a narrow `Map` augmentation) to see the method, even though
the runtime at the pinned `engines.node` floor already provides it. A human
decides whether that lib change is in scope here.

## False-positive check
Ran the hand-rolled `groupBy` and `Map.groupBy` against four inputs shaped
like the real call sites (empty, singleton, multi-bucket, case-variant keys)
via `node -e` and diffed the resulting `Map`s' `[...entries()]` — byte-identical
in every case, including bucket iteration order. Confirmed
`engines.node` (`package.json:44`) and the installed Node
(`node --version`) both postdate `Map.groupBy`'s Node 21.0.0 unflagged
release. Confirmed `groupBy`'s only production importer is
discovery-walk.ts (grep for `groupBy` across `src/`: the four call sites
above, plus the `import { … groupBy … } from "./discovery-path-classify"`
clause) — no other file defines or calls a same-named function, so this is
not a case of one of several already-reconciled copies (PTQ-0298, whose own
fix this function IS, unified the PRE-existing duplicate bucket-building
loops across discovery-walk.ts into this one `groupBy`; this filing is about
that unified function itself mirroring a native facility, a distinct claim
from PTQ-0298's duplication fix, not a re-file of it). `groupBy` is exported
but has no dedicated unit test (0 test importers per the structural map) —
its only production caller is discovery-walk.ts, so the D2 "MUST-NOT witness
test" carve-out does not apply (it is exercised by production code, not only
by a recording double). No `docs/spec_topics/` clause names this bucketing
algorithm's shape (it is an internal grouping utility, not a spec-pinned
enumeration or formula), so no `challenges_spec` applies.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — all 5 locations verified verbatim (groupBy at discovery-path-classify.ts:458-470, all 4 call sites, package.json:44's >=22.19.0 floor); Map.groupBy independently reproduced byte-identical to the hand-rolled loop on installed Node v24.16.0 across empty/singleton/multi-bucket/object-key/NaN-key inputs, same insertion order; size-scan map confirms groupBy is 13 LOC with 1/0 src/test importers reached from production discoverThetas (not dead, not test-only); the filing's own flagged tsconfig gap independently reproduced via tsc (TS2550, "lib" pinned to ES2022 predates Map.groupBy's ES2024 types, fixed by adding ES2024.Collection) and git history shows that pin is scaffold-era inertia, not a rationale-stated knob; not a duplicate of PTQ-0298 (that fixed the pre-existing 4-site loop duplication by creating this very function; this is a distinct claim against the unified function itself); no D8 exemption on record and no spec_topics clause governs this shape — accounting is accurate but per the D8 rule the simpler shape is a design decision for a human ruling, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): use the platform facility, and admit it to the compiler. tsconfig.json lib is ["ES2022"], which does not declare Map.groupBy (it is es2024.collection; the runtime floor Node >= 22.19 has it; TypeScript 5.9.3 ships lib.es2024.collection.d.ts) - add "ES2024.Collection" to lib (keep ES2022 as the base; no target change), then replace the four groupBy call sites (discovery-walk.ts :350 :948 :1044 :1045) with Map.groupBy(items, keyOf) and delete groupBy from discovery-path-classify.ts. Return shape Map<K, T[]> and insertion order are identical (triage reproduced it on Node 24). If tsc surfaces anything else from the wider lib, report it rather than fixing it in this lane. Triage precedent recorded: a reimplemented claim must verify the facility is admitted by tsconfig lib/target, not only by the Node floor.
