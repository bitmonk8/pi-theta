# Session-semantics hardening — lens: PROMPT-MODE tool_loop.max_rounds (ceiling #2)

Probe file: `tests/hardening/session-promptloop.test.ts` (2 probes; both green
after the Phase-4 STAGE-B fix). Live model: the harness-resolved provider model.
Each live drive retries once on transport/429.

Scope: PROMPT mode's `tool_loop.max_rounds` enforcement — the surface reachable
only after QTL-4 (prompt-mode tools now install) exposed pi's NATIVE agentic
tool loop to the loom's callable set. QTL-4's fix let the model call `tools:`
entries during a prompt-mode query; STAGE B now BOUNDS that native loop to
`max_rounds` so ceiling #2 (`tool_loop_exhausted`) is reachable in prompt mode.

Dedupe: QTL-4 (`cli-findings/queries-toolloop.md`) was the PROMPT-mode
`setActiveTools([])` under-permission (fixed Phase 3a); STL-2
(`session-findings/subagent-toolloop.md`) was the SUBAGENT twin (fixed Phase 4
STAGE A by owning the loop). This file is the PROMPT-mode round-cap, enforced by
a different mechanism: pi's native streaming turn is bounded through pi's
extension hooks (no re-implemented streaming).

## Summary

| id | verdict | one-line |
|---|---|---|
| PL-1 | **FIXED** | prompt-mode `tool_loop.max_rounds` did not bound pi's NATIVE agentic tool loop — every prompt-mode query streamed via `pi.sendUserMessage` + `waitForIdle` (SLSH-2 / Phase 3a) and pi ran its internal tool loop UNBOUNDED, so ceiling #2 (`tool_loop_exhausted`) was unreachable for any `max_rounds >= 1` (prompt twin of STL-2, hook-based mechanism). **Fixed** (Phase 4 STAGE B, maintainer decisions 5=A' + 5b=hook-based) by bounding the native loop through pi's extension hooks: a `PromptToolLoopGovernor` registered once on the host `pi` counts tool-use ROUNDS via `before_provider_request` round boundaries and BLOCKS (`tool_call` -> `{ block: true, reason: "tool_loop_exhausted" }`) any round beyond `max_rounds`; on exhaustion the query surfaces `Err(QueryError { kind: "tool_loop_exhausted", rounds: max_rounds, last_tool_name })` per ceiling #2 / ERR-19 |

Bug-verdict count: **0** open + **1** FIXED (PL-1, Phase 4 STAGE B).

---

## PL-1 — [FIXED] prompt-mode `tool_loop.max_rounds` did not bound pi's native agentic tool loop; ceiling #2 unreachable for `max_rounds >= 1`

**Status: FIXED** (Phase 4 STAGE B, maintainer decisions 5 = A', 5b = hook-based).
Prompt mode keeps pi's native streaming turn (SLSH-2, Phase 3a): every
non-short-circuit query streams via `LivePromptQueryModel` ->
`pi.sendUserMessage` + `ctx.waitForIdle`, with the loom's callable-set tools
installed per QTL-4. pi runs its internal agentic tool loop for that single turn;
the loom's `runUntypedQueryLoop` only ever observed round 0 -> terminating text,
so `tool_loop.max_rounds` never bounded the native rounds. The fix does NOT
re-implement streaming — it BOUNDS pi's loop through pi's extension hooks.

### Mechanism (hook API used)

- `pi.on("before_provider_request", handler)` — `BeforeProviderRequestEvent`
  fires once per model round (provider request); used to detect round
  boundaries.
- `pi.on("tool_call", handler)` — `ToolCallEvent` fires before each tool
  executes; the handler returns `ToolCallEventResult { block?: boolean;
  reason?: string }` to block a call with a reason.

`pi.on(...)` returns `void` (no per-registration unregister), so the handlers are
registered ONCE (lazily, on the first prompt-mode free-phase query drive) and
guarded by a per-drive "active" state the driver sets via `begin(maxRounds)`
immediately before `sendUserMessage` and clears via `end()` right after
`waitForIdle` settles (in a `finally`) — so the bound never affects unrelated
user turns or other queries. Prompt->prompt invokes and the body run strictly
sequentially, so at most one drive is active at a time.

A ROUND = one model turn issuing >= 1 tool call. The first `tool_call` after a
provider request opens a new round; sibling (parallel) calls in the same round
inherit that round's allow/block decision, so ROUNDS are counted, not individual
calls. When `roundsAllowed == max_rounds` and the model opens a further tool-use
round, the governor marks the query EXHAUSTED and blocks every call in that round
(and any later retry round). After the turn settles, an exhausted query is
represented as a synthetic single-call `tool_use` round so the enclosing
`runUntypedQueryLoop` reaches its canonical `max_rounds`-final branch and
surfaces `Err(ToolLoopExhaustedError { rounds: max_rounds, last_tool_name })`
(ERR-19) — NOT the model's blocked text. The typed-query forced-respond turn is
the exempt-routed terminator (FRNT-1) and is driven UNBOUNDED.

The resulting `Err` composes through the existing terminal/surface machinery
unchanged: at the slash boundary it emits the SNK-h note (SLSH-3 / SNOTE-1);
unhandled it fails the loom; via `?`/`match` it is catchable; across `invoke` it
wraps as `invoke_callee` (XMODE-1).

- **source:**
  - `src/extension/prompt-tool-loop-governor.ts` (new) — `PromptToolLoopGovernor`
    (`ensureRegistered` / `begin` / `end`, `before_provider_request` +
    `tool_call` handlers), `PromptToolLoopExhaustion`, `TOOL_LOOP_EXHAUSTED_REASON`.
  - `src/extension/production-loom-producer.ts` — producer field
    `#promptToolLoopGovernor`; `#resolvePromptQuery` arms the governor for the
    untyped free-phase turn and threads `governor`/`maxRounds` into
    `LivePromptQueryModel`; `LivePromptQueryModel` (`nextFreePhaseTurn`
    exhaustion path + `#exhaustionTurn`, `#driveUserVisibleTurn(bound)` begin/end
    wrap, `forcedRespondTurn` drives UNBOUNDED).
  - `src/extension/sdk-inventory.ts` — inventory the two new peer surfaces
    `ToolCallEvent` / `ToolCallEventResult`.

- **unit coverage:** `tests/prompt-tool-loop-governor.test.ts` (7 tests) — hook
  registration idempotence; N rounds under cap -> no block; a round beyond cap ->
  block + exhausted (`rounds == cap`, `last_tool_name` recorded); parallel calls
  count as one round; `max_rounds:1` vs a >=3-round chain; inert between drives;
  `max_rounds:0` blocks the first round.

- **live before/after** (`session-promptloop.test.ts`, `/ploop1`, prompt-mode
  `tools: read`, `tool_loop.max_rounds: 1`, the forced 3-file read chain
  `ch1 -> ch2 -> ch3` like STL-2):
  - **before:** the native loop absorbed all >=3 read rounds and reached
    `CHAINDONE777` (cap of 1 never fired; ceiling #2 unreachable).
  - **after:** `systemNotes = ["loom /ploop1 returned Err: tool-call loop
    exhausted after 1 rounds (last tool: read)"]` — the cap fired after round 1;
    the blocked `read` (ch2) returned `tool_loop_exhausted` to the model, which
    stopped and the turn terminated cleanly (no hang; `error: undefined`).
    `CHAINDONE777` never appears.
  - **control** (`/ploopdef`, SAME loom, default `max_rounds: 25`):
    `assistantText: "CHAINDONE777"`, no exhaustion note — the multi-round loop
    ran end-to-end and reached the final marker. A query finishing within the cap
    is UNAFFECTED.

- **regression:** `session-promptstream.test.ts` (SLSH-2 streaming) still green
  (`assistantText: "AAABBB"`, both queries stream); `session-binder.test.ts` (10
  probes) still green.

- **verdict: FIXED.** Same observable as QTL-4/STL-2 (ceiling #2 unreachable) but
  a distinct code path and mechanism: prompt-mode enforcement is achieved by
  bounding pi's native agentic loop through the `tool_call` interception +
  `before_provider_request` hooks, not by owning the loop (subagent STAGE A) and
  not by re-implementing streaming. `max_rounds` is now a real per-query bound in
  prompt mode; a query within the cap streams its normal result.

## Note on token discipline

PL-1 drives one live streamed turn whose read loop is real (>= 1 round then a
blocked round); the control drives one live turn that completes the >=3-round
chain. Both rest on deterministic observation (the SNK-h system note / the
sentinel `CHAINDONE777`) and a chain that provably requires >= 3 sequential
rounds, not on the model choosing to keep going.
