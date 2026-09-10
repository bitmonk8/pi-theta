---
id: PTQ-0184
title: load-pre-eval.ts states twice that its routing surface is "the surface the watcher-time reload cause (ERR-7, V4g) reuses", but no reload-path module has ever imported it — V4g shipped its own router and today's ERR-7 emit in hot-reload.ts calls emitDiagnosticBatch directly
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/load-pre-eval.ts:3-7
  - src/extension/load-pre-eval.ts:101-104
  - src/extension/hot-reload.ts:194-199
sites: 3
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# load-pre-eval.ts states twice that its routing surface is "the surface the watcher-time reload cause (ERR-7, V4g) reuses", but no reload-path module has ever imported it — V4g shipped its own router and today's ERR-7 emit in hot-reload.ts calls emitDiagnosticBatch directly

## Observation
The module header of `load-pre-eval.ts` describes the load-time routing
surface it owns and adds "This is the surface the watcher-time reload cause
(ERR-7, `V4g`) reuses." The method comment inside `routePreEvalFailure`
repeats it: "the single routing surface all seven load-time causes … share,
and the surface the watcher-time reload cause (ERR-7, `V4g`) reuses."
`routePreEvalFailure` and `createLoadFailurePreEvalRouter` have exactly one
production importer, `production-composition.ts`; `hot-reload.ts` — where
ERR-7 is emitted — imports nothing from this module and routes ERR-7 through
`emitDiagnosticBatch([diagnostic], deps.channel)`. Git history shows the V4g
commit (5d7aa1b9, 2026-07-01) created a separate `reload-pre-eval.ts` with its
own `createReloadFailurePreEvalRouter` calling `emitDiagnosticBatch`, and that
module was later deleted as superseded (c63941b3). `routePreEvalFailure` has
never appeared in any src file other than the two named.

## Evidence
src/extension/load-pre-eval.ts:3-7 — the header claim:

```ts
// Owns the load-time pre-evaluation failure routing surface: each of the seven
// load-time pre-eval failure causes is routed onto the `theta-system-note`
// channel with `triggerTurn:false`, never becoming an evaluation outcome and
// producing no final value. This is the surface the watcher-time reload cause
// (ERR-7, `V4g`) reuses.
```

src/extension/load-pre-eval.ts:101-104 — the method-body repeat:

```ts
      // fires a turn and never becomes an evaluation outcome — this is the
      // single routing surface all seven load-time causes (ERR-1…ERR-6,
      // ERR-16) share, and the surface the watcher-time reload cause (ERR-7,
      // `V4g`) reuses. The `cause` discriminant is carried for callers /
```

src/extension/hot-reload.ts:194-199 — the shipped ERR-7 route, which does not
go through this module:

```ts
  // ERR-7 emit: a watcher-time rebuild failure routes onto the
  // `theta-system-note` channel (`triggerTurn:false`) rather than a toast, per
  // package-and-settings.md §"Watcher-time reload failures".
  const emitErr7 = (diagnostic: Diagnostic): void => {
    emitDiagnosticBatch([diagnostic], deps.channel);
  };
```

Importer census — `grep -rn "load-pre-eval" --include=*.ts src extensions tools tests`
(excluding the module itself) → src/extension/production-composition.ts:175
(import), tests/pre-evaluation-failures.test.ts:18 (import), and comment-only
mentions in tests/b0435-fallback-diagnostic-reentry.test.ts:35. `grep -n
"load-pre-eval\|routePreEvalFailure\|PreEvalFailure" src/extension/hot-reload.ts`
→ 0 hits.

History — `git log --all --oneline -S "routePreEvalFailure" --name-only -- src`
lists only src/extension/load-pre-eval.ts and
src/extension/production-composition.ts. `git show 5d7aa1b9 --stat` (V4g)
touches CHANGELOG.md, README.md and src/extension/reload-pre-eval.ts only; the
last content of that file (`git show c63941b3^:src/extension/reload-pre-eval.ts`)
calls `emitDiagnosticBatch([diagnostic], deps.channel)` at :68 and mentions
neither `load-pre-eval` nor `routePreEvalFailure`. c63941b3 ("dead-code audit
— delete 4 superseded modules") removed it.

## Why this is a problem
Stale consumer claim. The header and method comment name a second consumer
(the V4g reload path) for this module's routing surface; the consumer never
existed — the V4g-T/V4e-T headers were written the same day (2026-07-01) and
V4g then built and later discarded its own router — and the current ERR-7
route bypasses this module entirely. The claim is the module's only stated
justification for being a shared "surface" rather than a single-caller
helper, so a reader assessing its role is pointed at a reuse that a grep
refutes.

## Suggested direction (non-binding, optional)
Remove the two V4g-reuse sentences (or replace them with the actual
relationship: ERR-7 uses `emitDiagnosticBatch` directly on the same channel
deps), so the module's stated consumers match its importers.

## False-positive check
- Reference search for the surface's names across src/, extensions/, tools/,
  tests/: `createLoadFailurePreEvalRouter` → production-composition.ts:173/:1724
  and tests/pre-evaluation-failures.test.ts; `routePreEvalFailure` →
  production-composition.ts:342 (comment)/:1730 and tests. No hot-reload,
  reload-wiring, or watcher-recovery reference. No `export *` or barrel
  re-exports the module (`grep -rn "export \* from" src` → none naming it).
- String-keyed/dynamic access: `grep -rn "routePreEvalFailure\|load-pre-eval"
  src/extension/hot-reload.ts src/extension/reload-wiring.ts
  src/extension/watcher-recovery.ts` → 0 hits.
- Considered the loose reading "surface = the theta-system-note channel": the
  sentence's subject is "the load-time pre-evaluation failure routing surface"
  the module "Owns", and :101-104 says "the single routing surface … share",
  i.e. `routePreEvalFailure`; the channel deps type is `SystemNoteChannelDeps`,
  owned by system-note-channel.ts, not this module.
- Git intent: the claim dates to f419ff13 (V4e-T, 2026-07-01), written before
  V4g landed; V4g (5d7aa1b9, same day) did not adopt it. Not a
  "was-true-then-drifted" case — a planned reuse that was never realised.
- Distinct from qw20260907130901-d2-01 (verdict questionable): that finding's
  root cause is the computed `cause` discriminant being voided; it cites the
  absence of reuse as supporting context for the parameter. This finding is
  about the module-header consumer claim at :3-7 (not cited there), which
  remains false independent of whether `cause` is kept or removed. Distinct
  from PTQ-0060 (:32-35 stub narration) and from
  qw20260910054544-d2-04 (the `sendSystemNote` mechanism wording).

## Triage
verdict: confirmed — every claim reproduces at HEAD: the three excerpts byte-match (:3-7, :101-104, hot-reload.ts:194-199); my own hunt finds `load-pre-eval` imported only by production-composition.ts:175 (plus tests) and `routePreEvalFailure`/`createLoadFailurePreEvalRouter`/`LoadPreEvalDeps` referenced by no reload-path file (hot-reload.ts, reload-wiring.ts, watcher-recovery.ts → 0 hits; no `export *` in src); `git log --all -S` over src/extensions/tools shows production-composition.ts as the only file ever to import the module; the V4g router (f1ae2ca0→5d7aa1b9, deleted c63941b3) called `emitDiagnosticBatch` directly and never mentioned `load-pre-eval`, and today's ERR-7 emit still does so at hot-reload.ts:198; the loose "surface = shared triggerTurn:false delivery" reading does not rescue the sentences because that shared path (`emitDiagnosticBatch` → `deliverOperatorNotePreferringEntry`, system-note-channel.ts:515/326) is V7d's, which this header itself separates from the routing the module "Owns" (:20-23), and :104-105 pins the intended reuse to a `cause`-carrying call of `routePreEvalFailure` that `PreEvalFailureCause` (:49-52, "ERR-7 … is not a member here") makes impossible by type — the mechanically-refuted consumer-claim class of PTQ-0035/0077/0086/0128/0160; blame puts both sentences at f419ff13/f701ba71 (2026-07-01), never revised when V4g landed or when c63941b3 deleted its router; distinct from PTQ-0060 (:32-35 stub paragraph), d2-04 (`sendSystemNote` mechanism wording) and confirmed d2-01 (voided `cause` parameter — its fix may rewrite :104-106 but leaves the header claim at :6-7 standing) (triage: claude-opus-5)
