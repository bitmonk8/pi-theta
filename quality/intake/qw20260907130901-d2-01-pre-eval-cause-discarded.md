---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: preEvalCauseOf computes a pre-eval cause discriminant whose only production consumer, routePreEvalFailure, discards it
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:342-371
  - src/extension/production-composition.ts:1674-1678
  - src/extension/load-pre-eval.ts:97-111
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# preEvalCauseOf computes a pre-eval cause discriminant whose only production consumer, routePreEvalFailure, discards it

## Observation
`preEvalCauseOf` (src/extension/production-composition.ts:342-371) is a ~30-line
prefix cascade mapping a diagnostic code to one of the seven
`PreEvalFailureCause` discriminants. Its single production call site is
`composeExtensionInstance`'s `emitLoadNoteGroup` (production-composition.ts:1674),
which passes the result as the first argument of
`routePreEvalFailure`. That router (src/extension/load-pre-eval.ts:97-111)
executes `void cause;` and delivers the note identically for every cause, so
the computed discriminant reaches zero readers in production. Its own doc
comment states the discriminant "is carried for caller / reload-integration
reuse rather than driving routing"; no such reuse exists — `routePreEvalFailure`
has exactly one caller in `src/**` and the reload path reuses the sink, not the
cause.

## Evidence
src/extension/production-composition.ts:342-353 (the cascade; continues to :371):

```ts
export function preEvalCauseOf(code: string): PreEvalFailureCause {
  if (code === "theta/load/host-incompatible") {
    return "capability-probe"; // ERR-1
  }
  if (code === "theta/load/binder-model-unresolved") {
    return "binder-model"; // ERR-4
  }
  if (
    code === "theta/load/extension-tool-unreachable" ||
    code === "theta/load/malformed-tool-entry" ||
    code === "theta/load/malformed-tools-field" ||
    code === "theta/load/unknown-tool" ||
```

src/extension/production-composition.ts:1674-1678 (the only production call site):

```ts
      preEvalRouter.routePreEvalFailure(preEvalCauseOf(diagnostic.code), {
        content: renderDiagnosticBatch([diagnostic]),
        display: true,
        details: { diagnostics: [diagnostic] },
      });
```

src/extension/load-pre-eval.ts:97-111 (the consumer voids the argument):

```ts
    routePreEvalFailure(cause: PreEvalFailureCause, note: SystemNote): void {
      // ... `cause` discriminant is carried for callers /
      // reload-integration reuse; every cause routes through the one delivery
      // path, so no per-cause branching is required here.
      void cause;
      sendSystemNote(note, deps.channel);
    },
```

Search counts (exact searches, whole repo, `*.ts`):
- `preEvalCauseOf` in `src/`: 2 hits — the definition (production-composition.ts:342)
  and the call site (production-composition.ts:1674). All other hits are in
  `tests/` and `docs/`.
- `routePreEvalFailure` in `src/`: 3 hits, all in load-pre-eval.ts (interface
  declaration :85, doc comment :89, implementation :97) plus the single caller
  at production-composition.ts:1674. No other `src/` caller exists.
- `void cause` in `src/`: 1 hit — load-pre-eval.ts:107.

## Why this is a problem
Speculative generality with a countable zero users: the value produced by
`preEvalCauseOf` at its only production call site flows into a parameter that
is explicitly voided, so the classification cannot influence routing, note
content, or any other observable — the note payload at :1675-1677 is built from
the diagnostic alone. The stated purpose ("carried for caller /
reload-integration reuse", production-composition.ts:333-335) names a reuse
that does not exist anywhere in `src/` (the hot-reload path shares the
`LoadDiagnosticSink`, not the cause; `routePreEvalFailure` has one caller). The
function is exercised as a pure function by `tests/pre-evaluation-failures.test.ts`,
whose own comment (:277-278) records that "`routePreEvalFailure` ... discards
its cause argument (`void cause;`)". Two maintenance rounds (bugs 0109, 0260)
widened the ERR-6 arm of a mapping whose output nothing reads — ongoing upkeep
cost for a production-inert taxonomy.

## Suggested direction (non-binding, optional)
Either give the discriminant a real reader (e.g., carry the cause on the routed
note) or collapse the router signature to the note alone and let the
spec-taxonomy documentation live where it is asserted (the test table / spec),
so the shipped path stops computing a value nothing consumes. The fix stage
owns the choice.

## False-positive check
- Reference search `preEvalCauseOf` across src/, extensions/, tools/, tests/:
  definition + one src call site; test imports in
  tests/pre-evaluation-failures.test.ts (direct pure-function assertions) — a
  test-only reader does not make the production computation live, and the
  finding is about the discarded production value, not about deleting the
  test-pinned function.
- Reference search `routePreEvalFailure` across the repo: single src caller
  (production-composition.ts:1674); test callers pass literal causes into the
  same voiding implementation.
- String-keyed/dynamic access: searched `"cause"` usage in load-pre-eval.ts and
  system-note-channel consumers — the note object built at :1675-1677 carries
  no cause field; nothing reads the discriminant downstream.
- Re-exports: `extensions/` contains no import of production-composition
  symbols (grep over extensions/ returned no matches); no re-export file
  forwards `preEvalCauseOf`.
- Intent check: the in-code doc (production-composition.ts:331-336) and bug
  0109/0260 records show the mapping is deliberately maintained as an "honest
  mapping"; deliberate maintenance is recorded here so triage can weigh it —
  it does not create a reader.

## Triage
verdict: questionable — mechanics reproduce (`void cause;` load-pre-eval.ts:107, sole src caller production-composition.ts:1682, zero hot-reload reuse), but preEvalCauseOf is production-called and deliberately witness-tested, and the unbranched cause parameter is an explicit settled §Non-goal in bugs 0109 and 0260, so the residual is a cosmetic design call a human should rule (triage: claude-opus-5)
