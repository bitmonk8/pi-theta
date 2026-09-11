---
id: PTQ-0204
title: Two drain-state.ts functions carry a JSDoc paragraph their own body's inline comment restates almost verbatim
lens: D2                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/drain-state.ts:66-83
  - src/extension/drain-state.ts:99-118
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# Two drain-state.ts functions carry a JSDoc paragraph their own body's inline comment restates almost verbatim

## Observation
Two of `drain-state.ts`'s seven exported functions carry a JSDoc paragraph
immediately followed, inside the function body, by an inline comment that
states the same rule again in near-identical words: `evalShutdownShortCircuitWithReadFailover`
(the read-failure fail-safe) and `resolveSlashDispatch` (the arm-(a) registry
lookup). The file's other five functions (`shuttingDownNote`, `supersededNote`,
`routeDrainStateArm`, `shouldShortCircuitShutdown`,
`resolveSlashDispatchWithReadFailover`) each state their rule once.

## Evidence
src/extension/drain-state.ts:66-83 — doc (66-75) and the inline comment
opening the same function's body (79-83):
```ts
/**
 * The `session_shutdown` handler-entry `readDrainState` read with its per-call
 * `try`/`catch` fail-safe (PIC-31): on a successful read the short-circuit
 * predicate {@link shouldShortCircuitShutdown} is evaluated; on a read-side
 * throw the catch arm treats the read as the steady-state tuple
 * `(false, undefined)` — equivalently, as if the predicate had NOT fired — so
 * the handler proceeds into the full five-sub-step teardown rather than
 * stranding resources.
 */
export function evalShutdownShortCircuitWithReadFailover(
```
```ts
  // PIC-31 read-failure fail-safe: on a read-side throw treat the read as the
  // steady-state tuple `(false, undefined)` — equivalently, as if the predicate
  // had NOT fired — so the handler proceeds into the full five-sub-step teardown
  // rather than short-circuiting and stranding every resource it must release.
  // The read may throw an arbitrary shape, so the catch is broad.
```
Both state: read-side throw → treat as `(false, undefined)` → "equivalently,
as if the predicate had NOT fired" → proceeds into "the full five-sub-step
teardown" rather than "stranding" resources — the same four clauses in the
same order, the middle clause word-for-word identical.

src/extension/drain-state.ts:99-118 — doc (99-106) and the inline comment at
the arm-(a) branch of the same function (116-118):
```ts
/**
 * Resolve a `/<name>` dispatch through the drain-state contract: route the
 * snapshot through the two-arm enumeration, then — on arm (a) — look the slash
 * name up in the registry entry table. A hit dispatches the theta; a miss returns
 * the fixed superseded note (registration-steps.md#superseded-entry-dispatch), a
 * sub-case of arm (a) that introduces no third `readDrainState` arm.
 */
export function resolveSlashDispatch(
```
```ts
  // Arm (a) dispatch: look the slash name up in the registry entry table. A hit
  // dispatches the theta; a miss (a dropped, superseded entry) returns the fixed
  // superseded note — a sub-case of arm (a), not a third arm (PIC-30).
```
Both state: look the slash name up in the registry entry table → a hit
dispatches the theta → a miss returns the fixed superseded note → "a sub-case
of arm (a)" → not a third arm — the same five clauses in the same order.

## Why this is a problem
Each pair states its rule twice with no independent fact added between the
two statements: the inline comment adds no case, citation, or consequence the
JSDoc above it lacks (compare the file's other doc comments — e.g.
`shouldShortCircuitShutdown` at :53-61, `resolveSlashDispatchWithReadFailover`
at :126-134 — each of which states its predicate exactly once, with no body
restatement). A reader must diff the two texts to confirm they still agree,
and a future change to either rule (the fail-safe outcome, the arm-(a)
lookup) can be made in one location and silently stop matching the other.
This repository has confirmed the same shape twice before in this exact file
and its sibling
(`quality/resolved/PTQ-0105-route-drain-state-arm-doc-duplicate.md`,
`quality/resolved/PTQ-0111-tripwire-doc-restatement-duplicates.md`); PTQ-0105's
own triage note explicitly observed this file's `evalShutdownShortCircuitWithReadFailover`
pair without filing it ("the FP-check side-claim … is false … but that
neither refutes the finding nor creates a dupe").

## Suggested direction (non-binding, optional)
For each pair, keep one statement of the rule (the JSDoc, since it also
carries the `{@link}` cross-reference and the registry citation) and drop or
shorten the inline restatement to whatever the surrounding code does not
already make obvious.

## False-positive check
- Read all seven exported functions' doc comments in the file
  (`shuttingDownNote` :26-29, `supersededNote` :31-37, `routeDrainStateArm`
  :39-51, `shouldShortCircuitShutdown` :53-64,
  `evalShutdownShortCircuitWithReadFailover` :66-92, `resolveSlashDispatch`
  :99-124, `resolveSlashDispatchWithReadFailover` :126-148): only the two
  cited functions pair a JSDoc paragraph with a body-level restatement, so
  this is not a file-wide documentation convention.
- Duplicate-filing check: `grep -rl "evalShutdownShortCircuitWithReadFailover\|resolveSlashDispatch" quality/resolved quality/issues` —
  the only hit is `PTQ-0105-route-drain-state-arm-doc-duplicate.md`, whose
  finding and fix are scoped to `routeDrainStateArm`'s own two-paragraph
  JSDoc (now collapsed to one paragraph, confirmed at :39-45 in the current
  file) and whose triage note names but does not file the
  `evalShutdownShortCircuitWithReadFailover` pair; neither this candidate's
  functions nor its line ranges are covered by that fix.
- Git-history check: `git log -p -L66,92:src/extension/drain-state.ts` and
  `git log -p -L99,124:src/extension/drain-state.ts` show both JSDoc
  paragraphs were authored first, against a `V9m-T` stub body (`void read;
  return true;` / `void snapshot; void registry; return { kind: "dispatch",
  … }`), and the inline restatement was added in the same commit (`V9m`,
  `c1f11bbe`) that replaced the stub with the real logic — the duplication
  therefore dates to the function's original implementation rather than a
  later drift, and (per the point above) was not applied to the file's other
  five functions.
- Reference search: both functions are exported and used in production
  (`factory.ts` imports and calls both), so this is not a dead-code claim;
  the observation is confined to the doubled prose.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpts byte-match at cited lines (fail-safe pair's middle clause verbatim; arm-(a) pair's five clauses in the same order), the file's other 5 functions carry no such body-level restatement, git blame (c1f11bbe) shows both doc and inline text landed together replacing the V9m-T stub, and neither PTQ-0105 (fixed, scoped to routeDrainStateArm's own paragraph, now collapsed to one at :39-45) nor PTQ-0111 (session-swap-tripwire.ts) covers these functions/lines, so not a dupe. (triage: claude-opus-5)
