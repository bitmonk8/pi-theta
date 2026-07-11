# Cancellation lens — hardening findings

Lens: **CANCELLATION semantics** (the third terminal outcome). This is largely a
**SOURCE-INSPECTION** lens — `runProbe` cannot inject a mid-turn `AbortSignal`
into a live drive, so the cancelled terminal outcome, the loop-iter / binder-call
checkpoints, and the race rules cannot be live-reproduced. Every finding is
tagged `live-repro` or `source-inspection`. One negative live probe bounds the
search (`session-cancellation.test.ts`).

Spec read: `docs/spec_topics/cancellation.md` (Signal source, Forwarding,
Granularity, CNCL-1…6, Surfacing), `docs/reference/errors-and-results.md`
(terminal outcomes, `CancelledError`, ERR-13), `docs/reference/discovery-cli.md`
(SNK-f). Deduped against `tests/hardening/SUMMARY.md`,
`tests/hardening/cli-findings/SUMMARY.md`, and all `session-findings/*.md`
(notably DISCO-1 binder-model-unwired, DISCO-2 watcher-unwired, SNOTE-1 top-level
err-note fix `fe3594c4`).

## Dominant defect class (unchanged): unwired cancellation modules

Same shape the campaign keeps finding — a spec-mandated module is fully
implemented + unit-tested but has **no production caller** in the shipped
composition (`production-loom-producer.ts` / `statement-executor.ts` /
`effectful-statement-host.ts`). Grep evidence below (callers searched across all
`src/**`, excluding the defining module and comments/imports):

| exported symbol | module | production caller? |
|---|---|---|
| `runCancellableSequence` | cancellation-core.ts | **yes** — statement-executor.ts:342,413 |
| `makeCancelledError` | cancellation-core.ts | **yes** — production-loom-producer.ts, effectful-statement-host.ts, subagent-isolation.ts, prompt-transport-mapping.ts |
| `runInvokeChild` | invoke-cancellation.ts | **yes** — effectful-statement-host.ts:232,277 |
| `renderTopLevelErrNote` (SNK-f) | err-note-render.ts | **yes** — production-loom-producer.ts:510 |
| `createLoomAbort` | cancellation-core.ts | **no** |
| `forwardSlashCommandCancel` | cancellation-core.ts | **no** |
| `abortForAgentEnd` | cancellation-core.ts | **no** |
| `forwardToolExposedCancel` | cancellation-core.ts | **no** |
| `deriveChildLoomAbort` | cancellation-core.ts | **no** |
| `routeToolCallLateSettlement` (CNCL-1/2/3) | cancellation-core.ts | **no** |
| `attachSwallowingHandler` (swallow rule) | cancellation-core.ts | **no** |
| `routeAbandonableSettlement` | cancellation-core.ts | **no** |
| `runCheckpointedForLoop` (loop-iter checkpoint) | checkpoint-granularity.ts | **no** (unused — but the loop-iter checkpoint is now WIRED inline in `statement-executor.ts` `executeWhile`/`executeFor`; see CANCEL-1 FIXED) |
| `runCheckpointedBinderCall` (binder-call checkpoint) | checkpoint-granularity.ts | **no** |
| `runBinderCallWithCancellation` (in-flight binder) | binder/binder-cancellation.ts | **no** |
| `handleNoRollbackTerminalEvent` (ERR-13) | no-rollback.ts | **no** (upheld by construction — see CANCEL-2) |

Grep used: `grep -rn <symbol> src --include=*.ts` minus the defining file /
comment lines / import lines.

---

## CANCEL-1 — [FIXED] the `loop-iter` cancellation checkpoint was unwired; a compute-bound `for`/`while` loop was not cancellable

**Tag:** source-inspection.
**Verdict:** **FIXED** (Phase 2, maintainer decision 4, loop-iter facet).

**Status: WIRED.** `executeWhile` and `executeFor` in
`src/runtime/statement-executor.ts` now await the `loop-iter` checkpoint and
read `signal.aborted` immediately before each iteration (via the shared
`loopIterCheckpoint` helper, which stamps the site with `deps.file` +
the loop statement's source line). On an observed abort the loop unwinds with
the `cancel` terminal outcome, routed through `handlePartialTerminalOutcome`
like the other checkpointed-effect cancel paths. `ExecuteBodyDeps` gained a
`file` field to stamp the `CheckpointSite`; both production `executeDeps`
constructions (prompt + subagent) pass `loom.slashName`.

- **source pointer:** `src/runtime/statement-executor.ts` — `loopIterSite` /
  `loopIterCheckpoint`, called at the head of each `executeWhile` iteration and
  before each `executeFor` iteration; `ExecuteBodyDeps.file`.
  `src/extension/production-loom-producer.ts` — `file: loom.slashName` in both
  `executeDeps`. (The pre-existing `runCheckpointedForLoop` in
  `checkpoint-granularity.ts` does not fit the executor's loop shape — its
  `runIteration` returns `void` and cannot signal `break`/terminal flow — so
  the equivalent checkpoint was wired inline against the same Checkpoint/signal
  the executor already holds, per the finding's fix note.)
- **new unit test:** `tests/statement-executor.test.ts` — "CANCEL-1 — the
  loop-iter cancellation checkpoint fires per iteration and cancels on abort":
  (a) one `loop-iter` checkpoint fires per `for`/`while` iteration; (b) an abort
  observed at a loop-iter checkpoint drives the `cancel` terminal outcome and
  preempts the remaining iterations.
- CANCEL-1 is **not** live-reproducible via the harness (needs a real Esc / an
  injected mid-loop abort, and an unbounded compute loop would hang the
  harness); the deterministic `Checkpoint` seam unit test above is the
  verification substrate.

### Original finding (retained for provenance)

**repro (source).** `src/runtime/checkpoint-granularity.ts` exports
`runCheckpointedForLoop`, which awaits `checkpoint.before("loop-iter", site)` and
reads `signal.aborted` before each iteration. It has **no production caller**
(grep above). The shipped loop executors —
`src/runtime/statement-executor.ts` `executeWhile` (~line 665) and `executeFor`
(~line 713) — iterate with a bare `for (;;)` / `for (const … of plan)` and never
await a `loop-iter` checkpoint nor read `signal.aborted` at the iteration
boundary. The only cancellation inside a loop is whatever checkpointed
sub-expression (query / tool call / invoke) the body happens to contain, routed
through `runCancellableSequence`.

**expected.** cancellation.md §Granularity: "The interpreter checks the
cancellation signal at exactly these points … immediately before each iteration
of a `for` or `while` body". The clause has an explicit rationale: "a
compute-bound `for`/`while` body with no genuine `await` between iterations would
otherwise drain only the microtask queue and never return a turn to the event
loop, so the Pi-dispatched event that flips `loomAbort.signal.aborted` (a
macrotask) could not run and an Esc during such a loop would never land. The
runtime therefore yields one macrotask turn at each loop-iteration boundary
before reading the signal".

**observed.** No `loop-iter` checkpoint fires and no per-iteration signal read
occurs in the shipped executor. A compute-only loop body (arithmetic only, no
query/tool/invoke) has zero checkpoints, so a mid-loop Esc is never observed and
the loop runs to completion. This is exactly the case the spec's rationale calls
out as the reason the checkpoint must exist.

**why a bug.** The spec mandates the checkpoint *and* names the concrete failure
it prevents (an un-cancellable compute-bound loop). The implementation exists and
is unit-tested; only the wiring is missing — the campaign's dominant defect
class. Not live-reproducible: injecting the abort needs a real Esc / the
`Checkpoint` seam, and an unbounded compute loop would hang the harness.

---

## CANCEL-2 — the slash-command / `agent_end` forwarding into `loomAbort` is unwired; prompt-mode captures `ctx.signal` once

**Tag:** source-inspection.
**Verdict:** **bug** (prompt-mode Esc may never land), with a spec-contract note.

**repro (source).** cancellation.md §Signal source mandates a fresh
`loomAbort` `AbortController` per invocation whose `loomAbort.signal` — "never
`ctx.signal` directly" — is the single source every checkpoint gates on, with
`ctx.signal` forwarded *into* `loomAbort` from inside the runtime's own event
handlers (`forwardSlashCommandCancel`, and `abortForAgentEnd` for the
`agent_end` user-cancel trigger). Both `forwardSlashCommandCancel` and
`abortForAgentEnd` (and `createLoomAbort`) have **no production caller**.

The shipped prompt path (`production-loom-producer.ts:529`) instead does:

```
const signal = ctx.signal ?? new AbortController().signal;
```

i.e. it captures `ctx.signal` **once** at bind time and hands that object to the
executor / every checkpoint, with a **never-aborting** fallback when
`ctx.signal` is `undefined`.

**expected.** cancellation.md §Forwarding into `loomAbort`, slash-command entry:
"The runtime MUST tolerate `ctx.signal` being `undefined` at slash-command entry
— Pi documents `ctx.signal` as `undefined` in idle, non-turn contexts (which is
exactly when the slash-command handler fires) — and MUST NOT depend on its
truthiness for any pre-turn checkpoint … an aborted `ctx.signal` triggers
`loomAbort.abort()` … This is the path that makes Esc-during-`@`-query work
end-to-end."

**observed.** Because the slash-command handler fires in an idle, non-turn
context, `ctx.signal` is documented `undefined` at exactly that moment; the
`?? new AbortController().signal` fallback then pins a **never-aborting** signal
for the whole run. Even if `ctx.signal` is defined at capture, there is no
forwarding subscription and no `agent_end` user-cancel trigger, so a user Esc is
not routed into the captured signal. The reason-propagation contract (CNCL-4) is
also moot with no forwarder.

**why a bug.** The end-to-end "Esc during `@`-query" path the spec calls the
motivating case relies on the forwarding wiring that is absent; the single-shot
`ctx.signal` capture cannot observe an abort dispatched later. Not
live-reproducible (no injected Esc). Caveat: prompt-mode cancellation *could*
still land in the narrow case where `ctx.signal` is defined at capture *and* the
same object is later aborted by Pi — I could not confirm Pi's timing from the
loom side, so I hold the verdict at bug on the documented idle-entry case rather
than asserting total inertness.

---

## CANCEL-3 — the tool-call late-settlement discard (CNCL-1/2/3) and the swallowing-handler suppression are unwired

**Tag:** source-inspection.
**Verdict:** **bug** (race-safety obligation not enforced).

**repro (source).** `routeToolCallLateSettlement` (CNCL-1 no-rebind / CNCL-2
no-second-`Err` / CNCL-3 no-second-`RuntimeEvent`), `attachSwallowingHandler`,
and `routeAbandonableSettlement` in `cancellation-core.ts` all have **no
production caller** (grep above).

**expected.** cancellation.md §Race semantics — late-settlement discard: once a
`tool-call` checkpoint has surfaced `Err({kind:"code_tool", cause:"cancelled"})`,
"any later settlement of the underlying `execute()` Promise … is discarded" and
the runtime "MUST keep a swallowing handler attached to the underlying
`execute()` Promise (and … the `@`-query provider Promise and the `invoke`
callee's top-level execution Promise) for the lifetime of that Promise, so that a
late rejection … does not surface as a Node `unhandledRejection` process event".
The handler "MUST be attached at the same site that constructs the Promise,
before the first microtask boundary".

**observed.** No site attaches a construction-time swallowing handler and no site
routes a late tool-call settlement through the CNCL-1/2/3 discard. A late
rejection of an abandoned `execute()` / provider / invoke Promise after a
cancellation has surfaced therefore has no guarding `.catch`, so it can reach
Node's `unhandledRejection` channel (and a late resolve could double-emit).

**why a bug.** A spec-mandated race-safety obligation with an explicit
"attach before the first microtask boundary" requirement is entirely absent.
Impact is a probabilistic `unhandledRejection` / double-emit under mid-tool-call
cancellation. Not live-reproducible without the `Checkpoint` seam to land the
late settlement deterministically.

---

## CANCEL-4 — both binder-call cancellation checkpoints are unwired

**Tag:** source-inspection.
**Verdict:** **bug**, but subsumed by the deferred binder re-architecture (DISCO-1 / BND-1/BND-3).

**repro (source).** `runCheckpointedBinderCall` (the pre-call `binder-call`
checkpoint, checkpoint-granularity.ts) and `runBinderCallWithCancellation` (the
in-flight forwarding, `src/binder/binder-cancellation.ts`) both have **no
production caller** (grep above).

**expected.** cancellation.md §Granularity: "immediately before issuing the
slash-command argument binder's LLM call (and the signal is forwarded to the
binder model's provider invocation, so an abort observed *during* the binder call
also surfaces)". §Surfacing: a cancelled binder call produces the cancelled-binder
system note; the loom does not run.

**observed.** Neither binder checkpoint is wired. Consistent with prior findings
that the shipped binder runs as an ambient user-visible streamed turn
(`driveStreamedUserTurn`) that already ignores `bind_model:` / `looms.binderModel`
(DISCO-1) and leaks its raw envelope (BND-1/BND-3). An abort during binding is
not gated at the documented `binder-call` checkpoint and no cancelled-binder note
is synthesised by loom code.

**why a bug / why deferred.** Real gap, but it is entangled with the same
binder-turn-visibility re-architecture the prior passes flagged as needing a human
design decision (DISCO-1, BND-1/BND-3). Report, do not fix unsupervised. Not
live-reproducible.

---

## CANCEL-5 — `deriveChildLoomAbort` (downward-only derived child controller) and `forwardToolExposedCancel` are unwired

**Tag:** source-inspection.
**Verdict:** borderline.

**repro (source).** `deriveChildLoomAbort` and `forwardToolExposedCancel` have
**no production caller**. The invoke child receives the parent's `deps.signal`
directly for its `runInvokeChild` pre-dispatch checkpoint
(effectful-statement-host.ts:277) rather than a derived child controller.

**expected.** cancellation.md §`invoke(...)` entry: "the child constructs its own
`loomAbort` as a derived controller that aborts when the parent's signal aborts
but not vice versa". §Forwarding, tool-exposed entry: the `signal` passed to
`execute(...)` triggers `loomAbort.abort(signal.reason)`.

**observed.** No derived child controller and no tool-exposed forwarder are
constructed. Reusing the parent signal directly is *observably equivalent* for
the documented downward-only propagation on the invoke path (child aborts when
parent aborts; the child's own internal cancel already surfaces as an `Err`
envelope to the parent, so no upward propagation is introduced by sharing the
object). The tool-exposed-entry gap only matters for a `.loom` registered into
another loom's `tools:` — a niche surface.

**why borderline.** The invoke facet is behaviourally equivalent to the spec's
intent for the common case; the tool-exposed facet is a genuine gap but on a
narrow surface. Per the "ignore borderline" directive, recorded not pursued.
Not live-reproducible.

---

## Verified-conformant (bounds the search)

- **SNK-f cancel note routing (task 1) — source-inspection, conformant.** The
  prompt-mode surface returns `makeErr(makeCancelledError())` on the `cancel`
  outcome (`production-loom-producer.ts:610`; subagent counterpart :828). The
  slash-dispatch boundary `run` calls `binding.surface(execution)`, and on
  `!terminal.ok` calls `emitTopLevelErrNote`
  (`loom-composition-producer.ts:236` → `production-loom-producer.ts:506`),
  which routes through `renderTopLevelErrNote` → `renderLeafKindNote`. The
  `cancelled` arm (`err-note-render.ts:138`) returns exactly
  `` `loom /${loomName} cancelled` `` — no `returned Err:` prefix, matching
  SNK-f. The SNOTE-1 fix (`fe3594c4`) wired this end-to-end. Not live-repro (needs
  an injected abort to reach the `cancel` outcome).

- **CANCEL-6 — ERR-13 no-rollback (task 2) — source-inspection, conformant.** A
  committed side effect before a cancel stays committed. `runInvokeChild`
  (invoke-cancellation.ts) returns the completed callee's `committed` side effects
  on the `value` path and there is **no compensating/rollback path** in the
  runtime — `handleNoRollbackTerminalEvent` (no-rollback.ts) itself has no
  production caller, which *upholds* ERR-13 "by construction": nothing unwinds a
  committed effect. Matches errors-and-results.md ERR-13 ("Neither `?` nor a panic
  nor cancellation unwinds prior side effects").

- **Query / tool-call / invoke pre-dispatch checkpoints (task 3, 4) —
  source-inspection, conformant.** `runCancellableSequence`
  (statement-executor.ts:342,413) awaits `checkpoint.before(kind, site)` and reads
  `signal.aborted` before dispatching each `@`-query / tool-call / invoke effect;
  `runInvokeChild` (effectful-statement-host.ts:277) awaits
  `checkpoint.before("invoke", site)` and returns a `cancelled` outcome that
  skips the child spawn when `signal.aborted`. These three of the five documented
  checkpoints ARE wired. (The other two — `loop-iter`, `binder-call` — are not;
  CANCEL-1, CANCEL-4.)

- **CNCL-5 / CNCL-6 race semantics — source-inspection, conformant (in the wired
  runner).** `runCancellableSequence` retains every completed `Ok(v)` binding
  verbatim on a checkpoint-observed abort (never rewrites to `cancelled`, CNCL-5)
  and synthesises no top-level `cancelled` when the loop runs to completion in a
  pure tail (`synthesizedTopLevelCancelled: false`, CNCL-6). Correct *where the
  runner is used*; the loop-iter gap (CANCEL-1) is orthogonal.

- **No spurious cancel on a clean live run — LIVE-REPRO, conformant.**
  `session-cancellation.test.ts`: a compute-only `for x in [1,2,3] { sum += x }`
  loop followed by one `@`-query completes with a deterministic user-turn text
  (`SUM=6` via `turn.userTexts`), **no** `cancelled` system note (`turn.systemNotes`),
  and no thrown error. Confirms the never-aborting fallback signal
  (`ctx.signal ?? new AbortController().signal`) never spuriously flips a
  checkpoint and the loop runs all iterations. (1 live drive.)

---

## Summary

Bug-verdict findings: **3** open (`bug`) + **1** FIXED (CANCEL-1, Phase 2) + **1** (`borderline`, recorded not pursued).

Live-reproduced findings: **0 bug** (1 conformant negative live probe — no
spurious cancel).

Source-inspection bug findings (3 open + 1 FIXED):
1. **CANCEL-1** — **FIXED (Phase 2)** — `loop-iter` cancellation checkpoint now
   WIRED in `statement-executor.ts` `executeWhile`/`executeFor`; a compute-bound
   `for`/`while` loop is cancellable at the iteration boundary (unit test in
   `statement-executor.test.ts`).
2. **CANCEL-2** — slash-command / `agent_end` forwarding into `loomAbort`
   unwired; prompt-mode captures `ctx.signal` once (idle-entry → never-aborting),
   so Esc-during-`@`-query may never land.
3. **CANCEL-3** — tool-call late-settlement discard (CNCL-1/2/3) and the
   construction-time swallowing-handler suppression unwired (probabilistic
   `unhandledRejection` / double-emit under mid-tool-call cancel).
4. **CANCEL-4** — both binder-call cancellation checkpoints unwired (subsumed by
   the deferred DISCO-1 / BND-1/BND-3 binder re-architecture).

Borderline (1): **CANCEL-5** — derived child controller / tool-exposed forwarder
unwired (invoke facet behaviourally equivalent; tool-exposed facet niche).

Conformant (bounds the search): SNK-f cancel note routing, ERR-13 no-rollback
(CANCEL-6), the three wired pre-dispatch checkpoints, CNCL-5/6 in the wired
runner, and the live no-spurious-cancel probe.
