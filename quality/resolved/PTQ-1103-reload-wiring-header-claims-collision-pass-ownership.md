---
id: PTQ-1103
title: reload-wiring.ts header claims to own the session_start collision pass that production never calls
lens: D2                     # D2 | D4 | D7 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/reload-wiring.ts:1-19
  - src/extension/reload-wiring.ts:417-464
  - src/extension/production-composition.ts:653-677
  - src/extension/production-composition.ts:840-843
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# reload-wiring.ts header claims to own the session_start collision pass that production never calls

## Observation
The module header of `reload-wiring.ts` lists, among the things "this module
owns", "the `session_start` cross-format collision pass over the
`pi.getCommands()` snapshot, treated read-only-by-convention (PIC-39)" — with
no caveat that this is test-only. The function that implements that pass in
this module, `dropCollidingThetas` (backed by the fixed three-source
`COLLISION_SOURCE_SET`), is never imported by `production-composition.ts`,
which instead implements its own, materially different PIC-39/PIC-69
collision-and-exclusion pass (`readPiOwnedCommands`, an own-registration
exclusion ledger, `RESERVED_COMMAND_NAMES`, and a five-source priority
resolution chain) inline.

## Evidence
`src/extension/reload-wiring.ts:1-19` (header claim):
```ts
// V9b / V9b-T — registration steps and reload-wiring seams.
//
// This module owns the load-pass and watcher-time wiring named in the V9b leaf:
//   - the `ThetaRegistry` (a `Map<slashName, parsedTheta>`) and the
//     build-aside-then-publish registry swap (PIC-36);
//   - the `session_start` cross-format collision pass over the
//     `pi.getCommands()` snapshot, treated read-only-by-convention (PIC-39);
```

`src/extension/reload-wiring.ts:417-435` (the module's own collision pass,
never imported elsewhere):
```ts
const COLLISION_SOURCE_SET: ReadonlySet<string> = new Set([
  "prompt",
  "extension",
  "skill",
]);
...
export function dropCollidingThetas(
```

`src/extension/production-composition.ts:653-661` (production's own,
independent collision-pass documentation — note the different mechanism,
`excludeOwnedNames`/PIC-69, absent from `reload-wiring.ts`'s pass entirely):
```ts
  * `excludeOwnedNames` (registration-steps.md#pic-69) is this extension
  * instance's own-registration LEDGER — every slash name it has EVER passed to
  * `pi.registerCommand` — not the live `ThetaRegistry`'s keys: Pi exposes no
  * `pi.unregisterCommand`, so a name a prior pass registered and a later
  * collision then dropped from the registry is still reported back by
  * `pi.getCommands()` and must still be excluded. Consulted on EVERY pass that
```

`src/extension/production-composition.ts:840-843` (the actual call site
composing the Pi-owned name set the shipped collision resolution reads —
`dropCollidingThetas` does not appear in this file at all):
```ts
   const piOwnedNames = [
     ...readPiOwnedCommands(pi, excludeOwnedNames),
     ...RESERVED_COMMAND_NAMES.map((name) => ({ name })),
   ];
```

Exact search: `grep -rn "dropCollidingThetas" src` → 1 hit, the declaration
site itself (`reload-wiring.ts:435`); `grep -rn "dropCollidingThetas" tests` →
1 hit (`tests/registration-reload-wiring.test.ts:125`, the unit test driving
the function directly). No file under `src/` imports `dropCollidingThetas`.

## Why this is a problem
The header states, without qualification, that this module owns the
`session_start` collision pass — but the shipped `session_start` composition
(`production-composition.ts`) resolves collisions through its own separate
logic and never reaches `dropCollidingThetas`. A reader following the header's
claim to find "the" production PIC-39 collision pass lands on a function that
is reachable only from its own unit test, while the actual wired behaviour
(with its distinct PIC-69 exclusion-ledger semantics) lives, undocumented from
this header's perspective, in a different file. This is the header
miscounting its own module's collaborators/callers, which the brief calls out
as in-scope even where the underlying code is otherwise deliberate.

## Suggested direction (non-binding, optional)
A direction only: qualify the header bullet (e.g. "an earlier / test-only
cross-format collision pass; the shipped `session_start` composition
implements PIC-39/PIC-69 collision resolution itself in
`production-composition.ts`") so the ownership claim matches what is actually
wired into production.

## False-positive check
- Searched `dropCollidingThetas` across `src/` and `tests/`: exactly one
  production-side declaration (reload-wiring.ts:435) and one test-side call
  (tests/registration-reload-wiring.test.ts:125); no `src/` import.
- Searched `production-composition.ts` for any import from `./reload-wiring`
  (production-composition.ts:205-208): only `createModelReferenceMatcher` and
  `ThetaRegistry`/`ParsedTheta` are imported — `dropCollidingThetas` is not
  among them.
- Confirmed `production-composition.ts` implements its own, independently
  documented collision/exclusion mechanism (PIC-69 ledger, `RESERVED_COMMAND_NAMES`,
  `readPiOwnedCommands`) rather than delegating to `dropCollidingThetas`.
- This is not a dead-code claim (the function is called by its own test, a
  legitimate witness caller) — the finding is scoped to the header's
  ownership claim being wrong about what production wiring actually uses.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header at reload-wiring.ts:6-7 claims ownership of the session_start PIC-39 collision pass, but re-run reference hunt shows dropCollidingThetas has zero src/ callers/re-exports (only tests/registration-reload-wiring.test.ts), while the shipped pass is readPiOwnedCommands (production-discovered-theta.ts:187, PIC-69 ledger) + RESERVED_COMMAND_NAMES composed at production-composition.ts:840-843; stale ownership roster, mechanically evidenced, not tracked elsewhere (PTQ-0106 was stub narration) (triage: claude-fable-5-1)
