---
id: PTQ-0108
title: ConversationBinding.effectHostDeps is written at both production bind sites but read by nothing since the RFC-0006 child-process drive removed its consumer
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/theta-composition-producer.ts:239-249
  - src/extension/production-theta-producer.ts:2211-2213
  - src/extension/production-theta-producer.ts:2696-2698
sites: 3
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ConversationBinding.effectHostDeps is written at both production bind sites but read by nothing since the RFC-0006 child-process drive removed its consumer

## Observation
`ConversationBinding` (theta-composition-producer.ts) declares an optional
`effectHostDeps` field documented as the raw host deps a `subagent fn` spawn
"hands … back to the calling body's effectful host". Both production bindings
(prompt-mode and subagent-mode, production-theta-producer.ts) populate it with
`effectHostDeps: hostDeps`. No code anywhere reads the field: the `subagent fn`
path resolves its spawn seam through the executor host's own deps
(`baseDeps.spawnSubagentFnSession` / `active().spawnSubagentFnSession` in
effectful-statement-host.ts), never through the binding. Git history shows the
field's two reads existed when RFC 0001 introduced it and were deleted by the
RFC 0006 child-process commit, which left the declaration and both writers
behind.

## Evidence
Declaration — src/extension/theta-composition-producer.ts:239-249:

```ts
  /**
   * RFC 0001 (`subagent fn`): the raw `EffectfulStatementHostDeps` used to build
   * `executeDeps.host`. A `subagent fn`'s production spawn seam
   * (`spawnSubagentFnSession`) spawns a fresh isolated session by re-binding the
   * enclosing theta under the resolved session config and hands these
   * session-scoped resolvers back to the calling body's effectful host so the
   * body's `@`-queries / calls / invokes route through the spawned session
   * (FN-6 isolation). Present on the production binds; absent on non-production
   * harnesses that never drive a `subagent fn`.
   */
  readonly effectHostDeps?: EffectfulStatementHostDeps;
```

Writer 1 — src/extension/production-theta-producer.ts:2211-2213 (prompt-mode
binding):

```ts
      // RFC 0001 (`subagent fn`): expose the session-scoped effect resolvers so a
      // `subagent fn` spawn can re-bind them for a fresh isolated session.
      effectHostDeps: hostDeps,
```

Writer 2 — src/extension/production-theta-producer.ts:2698 (subagent-mode
binding): `effectHostDeps: hostDeps,`.

Reader search — `grep -rn "effectHostDeps" src/ tests/ extensions/ tools/`
returns exactly 8 hits: the declaration (:249), the two writers (:2213, :2698),
and five comment-only mentions (production-theta-producer.ts:2251, :2255,
:2444, :2710; effectful-statement-host.ts:635). String-keyed access search
(`"effectHostDeps"`, `'effectHostDeps'`, `[.effectHostDeps.]`) returns zero
hits. No test constructs or reads the field.

The actual `subagent fn` spawn flow reads the seam off the executor host deps,
not the binding — src/runtime/effectful-statement-host.ts:644:

```ts
        const seam = active().spawnSubagentFnSession ?? baseDeps.spawnSubagentFnSession!;
```

Git history — `git grep -n "\.effectHostDeps" 645bcb02 -- src/` (the RFC 0001
commit that introduced the field) shows two reads
(production-theta-producer.ts:1956, :1963); the same search at 4866d4d2
("feat: child-process theta execution (RFC 0006)") and at HEAD returns nothing.

## Why this is a problem
Dead code proven dead: a field written at every production construction site
and read by no code, no test, and no dynamic access. The reads that justified
it were removed by the RFC 0006 child-process drive (the parent no longer
re-binds a `subagent fn` through the binding; the seam travels inside
`executeDeps.host`'s own deps), so the field, its two writers, their
explanatory comments, and the doc paragraph describing a routing that no longer
exists are leftovers of the retired in-process wiring. The stale doc also
misleads: it claims the spawn seam "hands these session-scoped resolvers back"
through this field, which the current flow contradicts.

## Suggested direction (non-binding, optional)
Drop the `effectHostDeps` field from `ConversationBinding` together with the
two `effectHostDeps: hostDeps` writes and the comments that describe the
retired routing; the `EffectfulStatementHostDeps` type import in
theta-composition-producer.ts goes with it if nothing else uses it.

## False-positive check
- Reference searches: `grep -rn "effectHostDeps" src/ tests/ extensions/
  tools/` (8 hits, all declaration/writer/comment — listed above); string-keyed
  and bracket-access searches (zero hits); spread/generic-consumption search
  (`...binding`, `Object.entries(binding`, `Object.keys(binding`) — zero hits
  on `ConversationBinding` values.
- Test-only-caller check: no test references the field at all, so this is not
  a witness-protected surface — it is unread everywhere.
- Git intent check: introduced with readers in 645bcb02 (RFC 0001); readers
  deleted in 4866d4d2 (RFC 0006); no later commit re-added a reader.
- Confirmed the live `subagent fn` path works without it: the spawn seam is
  installed directly on the executor host deps
  (production-theta-producer.ts:2151-2152, :2478-2479) and consumed at
  effectful-statement-host.ts:629-644.

## Triage
verdict: confirmed — reproduced: `effectHostDeps` has exactly 8 hits in src/ (decl :249, writes :2213/:2698, 5 comments), zero reads/dynamic access/test uses, and git confirms the two `binding.effectHostDeps` reads at 645bcb02 were deleted by RFC-0006 (4866d4d2) and never re-added; the live spawn seam is read off the host deps at effectful-statement-host.ts:644 (triage: claude-opus-5)
