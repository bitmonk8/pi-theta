---
id: pending
title: "#openInvocationTicket hand-rolls the Promise.withResolvers() construction its own doc-comment names, via a noop-initialized mutable resolver escape"
lens: D8
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:2124-2127
  - src/extension/cap-race.ts:25-28
  - src/extension/session-shutdown.ts:326-329
sites: 3
fix_scope: cross-module
d8_class: reimplemented
d8_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#openInvocationTicket
wave: qw20260922150013
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# #openInvocationTicket hand-rolls the Promise.withResolvers() construction its own doc-comment names, via a noop-initialized mutable resolver escape

## Observation
`#openInvocationTicket` builds a promise whose resolver must escape the executor by declaring a mutable `let settleDispose` initialized to a noop function, then reassigning it inside `new Promise((resolve) => { … })`. Its own doc-comment (production-theta-producer.ts:2111-2112) calls this "the `Promise.withResolvers()` construction". The same idiom is hand-rolled in two sibling extension modules (`cap-race.ts`, `session-shutdown.ts` — outside this shard's manifest but in the same `src/extension/` subsystem). `Promise.withResolvers()` is a standard built-in available on every engine the package admits.

## Evidence
Facility: `Promise.withResolvers()` — ECMAScript 2024 (`ES2024.Promise` lib), shipped in Node.js 22.0.0; the repo pins `"engines": { "node": ">=22.19.0" }` (package.json:43-45), so every admitted runtime provides it (verified in-session: `typeof Promise.withResolvers === "function"`). The tsconfig already cherry-picks an ES2024 sub-lib (`"lib": ["ES2022", "ES2024.Collection"]`, tsconfig.json:6) for `Map.groupBy`-era built-ins; `ES2024.Promise` is not yet in the list, which is the only thing keeping the typing out.

Site 1 — src/extension/production-theta-producer.ts:2124-2127 (re-read before filing):
```ts
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
```
Doc-comment on the same function, 2110-2112:
```
   * The registry-side half of the dispatch-site setup sequence
   * (active-invocation-registry.md §"Registry contract"): the
   * `Promise.withResolvers()` construction, the five-field entry (its
```

Site 2 — src/extension/cap-race.ts:25-28:
```ts
  let resolveCap: () => void = (): void => {};
  const capRace = new Promise<void>((resolve) => {
    resolveCap = resolve;
  });
```

Site 3 — src/extension/session-shutdown.ts:326-329:
```ts
  let resolveRace: () => void = (): void => {};
  const race = new Promise<void>((resolve) => {
    resolveRace = resolve;
  });
```

Search used: `let (settle|resolve|reject)\w* *(:|=)` across src/ — 11 hits, of which exactly these 3 are the resolver-escape idiom (the others are unrelated locals like `resolvedCwd`, `settled` booleans). `withResolvers` appears nowhere in src/ except the site-1 doc-comment.

Feature-for-feature: each site needs exactly `{ promise, resolve }` — a void promise plus an externally callable resolver. `Promise.withResolvers<void>()` returns `{ promise, resolve, reject }`; no site uses a reject path, no site depends on the noop initializer being callable before the executor runs (the executor runs synchronously, so the noop is never invoked — it exists only to satisfy definite-assignment).

## Why this is a problem
A facility the pinned runtime provides (engines floor ≥22.19.0, facility since 22.0.0) is re-derived by hand three times, each copy carrying a mutable binding and a dead noop function whose sole purpose is to appease definite-assignment analysis — extra moving parts (a reassignable closure variable per site) for a job the built-in does as one expression. Site 1's own doc-comment already describes the code in terms of the built-in it does not use, so the prose and the code name the same concept two different ways.

## Suggested direction (non-binding, optional)
Unproven hypothesis: adding `ES2024.Promise` to the tsconfig `lib` list (the same cherry-pick pattern already used for `ES2024.Collection`) would let all three sites collapse to `const { promise, resolve } = Promise.withResolvers<void>();`. Whether any repo-level lib-pinning rule forbids that addition has not been checked; the fix stage owns that call.

## False-positive check
- Exemption check: the D8 exemption on this file is `#firstAdmittingArmProperties` (reimplemented) — a different host key; this filing's host is `#openInvocationTicket`. Not silenced.
- Duplicate check: no PTQ or pending intake file names `withResolvers` (searched the filed-issue roster); PTQ-0341/PTQ-1016 cover the cap-timer duplication between sites 2 and 3 but not this resolver-escape idiom, and this filing's root cause (built-in reimplemented) is distinct from theirs (harness/logic duplication).
- Availability check: `node -e "typeof Promise.withResolvers"` → `function`; engines pin `>=22.19.0` verified at package.json:43-45; the only gap is the tsconfig lib typing, stated as fact above.
- D2-precedent check: no threaded-but-unread seam, no spec-named enumeration involved; no docs/spec_topics/ clause pins the promise-construction mechanics (active-invocation-registry.md §"Registry contract" names the construction but not its spelling — the site's own comment already uses the built-in's name).
- Behaviour check: the noop initializer is unreachable (Promise executors run synchronously), so no behaviour is dropped by the built-in; no site reads the resolver before construction completes.

## Triage
verdict: questionable — accounting verified: all three excerpts reproduce byte-exact at production-theta-producer.ts:2125-2127, cap-race.ts:25-27, session-shutdown.ts:326-328 (doc-comment naming `Promise.withResolvers()` real at :2112); the stated search re-run gives 11 hits with exactly those 3 resolver-escape sites (the other 8 are `settled`/`resolved*` locals), and `withResolvers` appears in src/ only in that comment; facility check holds — every site consumes only `{ promise, resolve }` of a `Promise<void>`, none reads the noop initializer (executor runs synchronously) or a reject path, and `Promise.withResolvers<void>()` covers all of it on the pinned runtime (engines `>=22.19.0` at package.json:43-45, `typeof Promise.withResolvers === "function"` on installed Node v24.16.0); the tsconfig gap independently reproduced via tsc (TS2550 with the repo's `["ES2022","ES2024.Collection"]` lib, clean once `ES2024.Promise` is added) and the repo has no lib-pinning rationale — PTQ-0320 (resolved) added `ES2024.Collection` under exactly this pattern; spec check clear: active-invocation-registry.md §Registry contract says "the `Promise.withResolvers()` construction (or equivalent)", so the swap drops no required behaviour; sole D8 exemption on the file is `#firstAdmittingArmProperties`, a different host; not a duplicate of PTQ-0341/PTQ-1016 (cap-timer harness duplication, not the resolver idiom); one uncounted fourth copy of the same idiom exists at src/runtime/subagent-isolation.ts:178-181 (`let resolveExit!: () => void;` definite-assignment form, missed by the filing's `(:|=)` regex) — noted for the fixer, does not refute the accounting; per the D8 rule the simpler shape (tsconfig lib add + 3-4 site collapse) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
