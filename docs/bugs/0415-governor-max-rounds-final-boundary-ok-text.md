# Bug 0415 — The prompt-mode governor never fires CIO-4's `max_rounds`-final branch when the model terminates: an untyped query whose model uses exactly `max_rounds` tool rounds and then answers returns `Ok(text)` after an extra provider turn, where CIO-4 pins `Err(tool_loop_exhausted)` "before any further turn is issued" — and the production off-session sibling enforces exactly that

- **Status:** fixed (0.407.0).
- **Sev/Diff estimate:** S2/D3 — the author's hard round budget is silently exceeded by one provider turn (extra tokens, extra user-visible turn) and the pinned `Err` becomes `Ok(text)`, with a cross-driver Err/Ok flip on identical model behaviour; §Fix is undecided among three routes including a spec amendment, so an in-run adjudication is required.
- **Kind:** defect — implementation diverges from a stated rule (CIO-4's
  boundary disposition for untyped queries), with a cross-driver
  inconsistency: the two production query drivers give the same model
  behaviour opposite outcomes.
- **Related:**
  - 0327 (fixed 0.336.0) — `raw_response` on the untyped exhaustion path;
    same governor/loop seam, different obligation.
  - 0308 (fixed 0.335.0) — SNK-h `last_tool_name: null` at `max_rounds: 0`;
    the initialisation-exhaustion half of CIO-4, which IS correctly enforced
    (`query-tool-loop.ts:402` fires before any turn).
  - [bug 0416](./0416-pic18-closed-event-set-contradicted-by-governor.md) — same governor
    (`prompt-tool-loop-governor.ts`), distinct mechanism: its subject is
    PIC-18's closed event-consumption claim, not CIO-4 boundary disposition.
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `src/extension/prompt-tool-loop-governor.ts:172–186` — the only
    exhaustion trigger is a `tool_call` event in a round opened BEYOND the
    cap (`roundsAllowed >= maxRounds` at a round boundary). A provider round
    that emits no tool call sets nothing; `end()` reports
    `exhausted: false`.
  - `src/extension/production-theta-producer.ts:4993–5001, 5017` —
    `nextFreePhaseTurn` round 0 folds to the exhaustion turn only under
    `#exhaustion?.exhausted === true`; otherwise the settled turn returns
    `kind: "text"` and `runUntypedQueryLoop` binds `Ok(text)` at
    `query-tool-loop.ts:436–447` with `slotCount` still 0 (native rounds are
    invisible to the loop's accounting).
  - Contrast: `src/runtime/query-tool-loop.ts:396–405` — the in-loop
    accounting path checks `slotCount === config.maxRounds` at the round
    boundary BEFORE requesting the next turn, so the would-be terminating
    turn is never issued and the query is `Err(tool_loop_exhausted)`. This
    path is production for the off-session driver
    (`OffSessionQueryModel`, `production-theta-producer.ts:3117–3127`, the
    `subagent fn` in-process arm), which feeds real `tool_use` rounds to it.
- **Observed at:** v0.398.0 (`c2c25d81`). Offline, deterministic: unit probe
  over `PromptToolLoopGovernor` with a scripted
  `before_provider_request`/`tool_call` sequence, plus code-path citation of
  the fold; scratch probe (deleted).

## Summary

CIO-4 (`ceilings-3-and-4.md:42`) evaluates ceiling #2 "at the tool-call-round
boundary — after the round's tool calls have completed and the slot count has
been incremented … and before the next free-phase model turn is requested",
with the `max_rounds`-final branch (`slot_count == max_rounds`) surfacing
`Err(tool_loop_exhausted)` for untyped queries "before any further turn is
issued". The in-loop implementation does exactly this. The prompt-mode native
loop cannot: pi requests the next model turn itself, and the governor's only
lever is blocking `tool_call` events. So the governor marks exhaustion only
when the model ATTEMPTS a tool round beyond the cap. A model that uses its
last budgeted round and then terminates with text gets that extra provider
turn issued (user-visible, token-debited) and its answer bound as `Ok(text)`
— the boundary the spec pins as exhausted is silently permissive in prompt
mode, and strict in the off-session sibling.

## Reproduction

Offline, two halves:

1. Governor unit probe (`max_rounds: 1`):
   `begin(1)`; fire `before_provider_request`; fire `tool_call` (allowed);
   fire `before_provider_request`; model emits text (no `tool_call`); `end()`.
   Observed: `{ exhausted: false, slotCount: 1, rounds: 1 }`.
   Contrast run — second round fires `tool_call`: observed
   `{ block: true, reason: "tool_loop_exhausted" }` and
   `{ exhausted: true, lastToolName: "grep" }` (the only trigger).
2. Fold citation: with `exhausted: false`,
   `nextFreePhaseTurn(0)` (`production-theta-producer.ts:5017`) returns
   `kind: "text"`; `runUntypedQueryLoop` (`query-tool-loop.ts:436`) returns
   the text outcome at `slotCount: 0` — `Ok(text)`, no event, no note.

Same theta under the off-session driver (a `subagent fn` body query): after
the first real round, `slotCount === 1 === maxRounds` at
`query-tool-loop.ts:402` → `Err(tool_loop_exhausted after 1 round(s))`; the
terminating turn is never requested.

## Expected behaviour

`ceilings-3-and-4.md:42` (CIO-4): "the *`max_rounds`-final branch*
(`slot_count == max_rounds`: for untyped queries the runtime surfaces
`Err(QueryError { kind: "tool_loop_exhausted", … })` before any further turn
is issued". `query-tool-loop.md:48` (QRY-16): the cap "is a ceiling, not a
floor"; `query-tool-loop.md:71` (worked example): at slot count 2 = 2 "the
next turn issued is the forced respond turn" for typed — for untyped, the
Err. No spec text carves out a prompt-mode approximation; the STAGE-B
governor is implementation-only.

## Actual behaviour / root cause

The governor counts rounds by `tool_call` events gated on
`before_provider_request` boundaries and can only block tool executions
(`prompt-tool-loop-governor.ts:172–200`). "Exhausted" therefore means "the
model tried to tool past the cap", not "the budget is spent". The
CIO-4-mandated check at `slot_count == max_rounds` has no enforcement point:
the next provider turn has already been requested by pi's native loop by the
time the governor could know the round completed. The extra turn streams into
the user transcript; if it terminates, `Ok(text)` binds.

## Why it matters

Author intent (a hard round budget) is silently exceeded by one provider
round in every boundary-case drive — extra tokens, extra latency, an extra
user-visible turn — and the pinned `Err` outcome for "budget spent without a
terminating turn inside it" is replaced by a success. Cross-mode, the same
theta body flips between `Err(tool_loop_exhausted)` and `Ok(answer)`
depending on whether it runs as a prompt-mode query or inside a
`subagent fn`, with no diagnostic explaining the asymmetry. Conformance tests
written against CIO-4's letter cannot pass on the prompt path.

## Non-goals

- `max_rounds: 0` initialisation exhaustion — correctly enforced upstream by
  both loops before any turn (`query-tool-loop.ts:402`, 0 == 0); the
  governor is documented as consulted only for `max_rounds >= 1`
  (`production-theta-producer.ts:3068–3075`).
- The over-cap blocking path (model attempts round `max_rounds + 1`) —
  matches ERR-19 and SNK-h today, including `raw_response` threading (0327).
- The typed query's exempt forced respond turn — off-session, ungoverned by
  design.

## Fix (0.407.0)

- What shipped (parent-adjudicated route (b), settle-fold enforcement):
  - `src/extension/prompt-tool-loop-governor.ts` — new `lastAllowedToolName`
    snapshot field on `PromptToolLoopExhaustion`, recorded on the allowed-call
    path in `#onToolCall`; the block-only `lastToolName` is byte-unchanged. It
    supplies the ERR-19 `last_tool_name` for the CIO-4 `max_rounds`-final
    boundary where NO round was blocked.
  - `src/extension/production-theta-producer.ts` — `LivePromptQueryModel` settle
    fold: `#budgetConsumedWithoutBlock()` (untyped `#respond === undefined` AND
    `slotCount === maxRounds` AND `maxRounds > 0` AND not `exhausted`); the
    round-0 fold, gated `!thetaAbort.signal.aborted` (PIC-51 cancellation
    precedence), folds the untyped boundary to `Err(tool_loop_exhausted)` via the
    synthetic exhaustion round (raw_response = the discarded terminating text,
    `last_tool_name` = `lastAllowedToolName`); a round>0 re-check drives
    `runUntypedQueryLoop` to `slotCount == maxRounds` for `maxRounds > 1`.
    `#exhaustionTurn` is parameterised by tool name (over-cap path passes
    `lastToolName`, boundary passes `lastAllowedToolName`).
    `#emitUntypedBoundaryDiscardNote()` emits ONE informational
    `theta-system-note` (no `details`, bug 0401 law) witnessing the discarded-
    answer divergence. The off-session driver and typed forced-respond path are
    UNTOUCHED.
  - `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — a NON-normative
    implementation note appended to CIO-4 acknowledging the platform-forced sunk
    provider turn in prompt mode; the normative branch text is UNCHANGED.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — the
    closed informational-note enumeration widened four → five, adding the untyped
    `max_rounds`-final discard note (bug 0401's same-commit informational-note
    law).
- Gates: witness `tests/b0415-governor-max-rounds-final-boundary.test.ts` 5/5 —
  (A1)/(A2) prompt-mode boundary → `Err(tool_loop_exhausted)` (rounds ==
  max_rounds, last_tool_name = final budgeted round, raw_response = discarded
  text) and (B) the divergence note RED at fork → green; (C) within-cap control
  and (D) cross-driver off-session parity green both directions. Full default
  suite 571 files / 10436 tests green (isolated re-run law: the campaign's
  bug-0276 / production-tools-load-resolution timeouts are parallel-load noise,
  green isolated). `tsc -p tsconfig.json --noEmit` exit 0; `eslint src/**/*.ts`
  clean.
- Review: 2 rounds. R1 (`bug-fix-reviewer`, deep) — F1 `spec` (add the fifth
  note to runtime-event-channel.md's closed enumeration, same commit), F2
  `correctness` (gate the fold/note on `!thetaAbort.signal.aborted` so a
  cancellation landing at the boundary does not emit a false exhaustion note),
  F3 `test` (assert note-count == 1 on the multi-round path), plus a prose
  residual (`#exhaustionTurn` comment) — all applied by `bug-fix-fixer`. R2
  (`bug-fix-reviewer-fast`) — CLEAN.
- Verification: VERIFIED. (1) revert-witness — disabling the round-0 fold reds
  (A1)/(A2)/(B) with the exact bug signature (Ok(text) / no note), restored
  byte-exact, green; (2) full default suite 10436/10436 green; (3) live — the
  orchestrator ran `tests/live/hardening/session-promptloop.test.ts` (PL-1
  over-cap exhaustion + control) GREEN under the shared cross-worktree live
  lock; the exact-boundary fold is not deterministically forceable on a live
  model, so the offline scripted-governor witnesses carry that proof; (4) tsc
  exit 0, lint clean.
- Residuals:
  1. No dedicated cancellation-path witness cell for the F2 abort gate. The
     round>0 fold is unreachable under abort (`runUntypedQueryLoop`'s loop-top
     `signal.aborted` guard preempts it) and the round-0 gate is the only race
     site, closed by `!thetaAbort.signal.aborted`; defended by code-reading and
     the existing cancellation suites (b0288 etc.) staying green. A faithful
     mid-settle abort in the instant-settle witness harness is disproportionate
     / fragile. Non-blocking (test-coverage, not correctness).
  2. No deterministic live witness for the exact-boundary fold (a live model
     cannot be forced to use exactly `max_rounds` tool rounds then answer); the
     adjacent PL-1 live cell was run as witness with recorded WHY; the offline
     (A1)/(A2) cells carry the proof.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the off-session driver
  (`query-tool-loop.ts:396-405`) is UNTOUCHED (already letter-compliant); the
  typed forced-respond exemption, the `max_rounds: 0` initialisation-exhaustion
  path, and the over-cap blocking path (ERR-19 / SNK-h / bug 0327 raw_response)
  are unchanged. Parent adjudication: route (b) — route (a) is impossible (no pi
  hook vetoes a provider request at the pin), route (c) rejected (it loosens a
  HARD ceiling and forces the letter-compliant off-session driver to spend an
  extra turn). Version placeholder `0.407.0` per the parallel-lane brief (the
  parent substitutes at merge); package.json / CHANGELOG / README untouched, not
  committed in this lane.

## Provenance

- Spec measured against: `docs/spec_topics/hard-ceilings/
  ceilings-3-and-4.md:42` (CIO-4), `docs/spec_topics/query/
  query-tool-loop.md:48` (QRY-16), `:71` (worked example),
  `docs/spec_topics/slash-invocation.md` (SNK-h row semantics).
- Implementation: `src/extension/prompt-tool-loop-governor.ts:119–200`,
  `src/extension/production-theta-producer.ts:3068–3127, 4993–5017`,
  `src/runtime/query-tool-loop.ts:396–447`.
- Found by: prompt-drive-lifecycle bug-hunt (seed 2, governor budgets);
  governor unit probe + driver code-path contrast.
- Reconciliation with wave 1: the hard-ceilings sweep's
  "ceiling2-slot-accounting-cio4" clean entry read the in-loop path
  (`query-tool-loop.ts`) only; the prompt governor's CIO-4 disposition was
  never probed there. No contradiction with that clean list.
