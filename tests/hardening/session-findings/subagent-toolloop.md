# Session-semantics hardening — lens: SUBAGENT MODEL-DRIVEN TOOL LOOPS + ceiling #2 (tool_loop_exhausted)

Probe file: `tests/hardening/session-subagent-toolloop.test.ts` (6 probes; all 6
green after the Phase-4 STAGE-A fix). Live model: the harness-resolved provider
model. Each live drive retries once on transport/429. Finding ids reuse the
probe ids: STL-2 and STL-6 were the two bugs (both now **FIXED**); STL-1/3/4/5
are the conformant probes recorded under Verified-conformant.

Scope: the surface reachable **only after the SUBAG-2 fix** (commit `a0dcf942`)
installed a subagent loom's `tools:` callable set into the spawned session's
`customTools`. Before SUBAG-2 the subagent model had NO tools; now it does, so
model-driven tool loops inside a spawned subagent conversation — and their
ceiling #2 cap (`tool_loop.max_rounds`) — are testable for the first time.

Dedupe: QTL-4 (`cli-findings/queries-toolloop.md`) was **PROMPT** mode (driver
forces `setActiveTools([])`); this file is **SUBAGENT** mode
(`spawnSubagentConversation` / `createSubagentQueryModel` — a different code
path). SUBAG-2 (`session-findings/subagent.md`) confirmed a **single** subagent
`read` works; this file tests **multi-round** loops and the ceiling. Not in
`SUMMARY.md`, `cli-findings/SUMMARY.md`, or the other per-lens `findings/` docs.

## Summary

| id | verdict | one-line |
|---|---|---|
| STL-2 | **FIXED** | a subagent's `tool_loop.max_rounds` did not bound the model's tool-call rounds — the spawned `AgentSession` ran its full agentic tool loop inside a single loom-level query round, so ceiling #2 (`tool_loop_exhausted`) was **unreachable for any `max_rounds ≥ 1`** (subagent twin of QTL-4, different mechanism). **Fixed** (Phase 4 STAGE A, maintainer decision 5 = A′) by re-architecting the subagent query driver to OWN the agentic loop: it now drives the private conversation one pi-ai `complete()` turn per free-phase round through `runUntypedQueryLoop`/`runTypedQueryLoop`, so `tool_loop.max_rounds` is enforced and ceiling #2 is reachable |
| STL-6 | **FIXED** | an **unhandled tail** (`@`…``, no `?`) `tool_loop_exhausted` breach in a subagent was surfaced across an `invoke` boundary as `cancelled`, masking the true leaf kind; the parent's `e.kind` read `"cancelled"` instead of `"invoke_callee"`/inner `tool_loop_exhausted`. **Fixed** by threading the effect-`Err` payload through the executor's `fail` flow so `BodyExecution.error` is set for an unhandled effect-`Err` terminal. |

Bug-verdict count: **0** open + **2** FIXED (STL-2, Phase 4 STAGE A; STL-6, Phase 2).

---

## STL-2 — [FIXED] a subagent `tool_loop.max_rounds` does not bound the model's tool rounds; ceiling #2 is unreachable for `max_rounds ≥ 1`

**Status: FIXED** (Phase 4 STAGE A, maintainer decision 5 = A′ full re-architecture).
The subagent query driver now OWNS the agentic tool loop. The pi SDK exposes no
per-turn tool-round cap and no round-by-round stepping — `AgentSession.prompt`
runs an opaque internal loop — so the old `driveSubagentTurn(session, prompt)`
driver (which ran the whole internal loop and returned the terminal `agent_end`)
could never enforce the loom's `max_rounds`. The rewritten
`SubagentQueryModel` (`src/extension/production-loom-producer.ts`) holds the
subagent's PRIVATE conversation and issues ONE pi-ai `complete()` turn per
free-phase round against the resolved subagent model, conveying the SUBAG-1
`system:` prompt and the SUBAG-2 callable-set tool schemas and threading
`loomAbort.signal`; each `tool_use` turn's calls are executed through the loom's
callable set (the same `resolvePiTool`/`execute` path used by code-driven calls)
and fed back as tool-result turns. The loop runs through the existing
`runUntypedQueryLoop`/`runTypedQueryLoop` machinery under
`config.maxRounds = loom.frontmatter.toolLoop?.maxRounds ?? 25`, so reaching the
cap surfaces `Err(QueryError { kind: "tool_loop_exhausted", rounds, last_tool_name })`
per ceiling #2 / CIO-4. The `AgentSession` spawn is retained for the PIC-40
model guard, PIC-9 dispose, and PIC-41 abort forwarding; the query path no
longer drives it.

- **live before/after** (`session-subagent-toolloop.test.ts`, `/capparent`,
  subagent `tools: read`, `tool_loop.max_rounds: 1`, forced 3-file read chain):
  - **before:** `OUTCOME[\n\n\nCHAINDONE777]` (cap-enforced: false,
    cap-absorbed: true — the ≥3-round chain completed under a cap of 1)
  - **after:** `OUTCOME[tool_loop_exhausted]` (cap-enforced: true,
    cap-absorbed: false — ceiling #2 fires after round 1)
- STL-1 control (default `max_rounds: 25`) still completes the chain and returns
  `CHAINDONE777`; SUBAG-1/SUBAG-2, XMODE-1 (crossmode), and CONV-6/STL-6
  (convdrive) still pass.

### Original finding (retained for provenance)

- **repro:**
  - Three chained files (each names the next → forces SEQUENTIAL read rounds):
    - `ch1.txt`: `STEP1 done. Next, read the file ch2.txt to continue.`
    - `ch2.txt`: `STEP2 done. Next, read the file ch3.txt to continue.`
    - `ch3.txt`: `STEP3 done. The final marker is CHAINDONE777. Stop; do not read any more files.`
  - `capchild.loom` (`mode: subagent`, `tools: read`, `tool_loop: { max_rounds: 1 }`),
    body: `` @`Read the file ch1.txt. Each file names the next file to read. Read exactly ONE file at a time, following the chain, until a file gives you a final marker token. Reply with EXACTLY that marker token and nothing else.` ``
  - `capparent.loom` (`mode: prompt`):
    ```
    let res = invoke<string>("./capchild.loom")
    let outcome = match res {
      Ok(v) => v,
      Err(e) => match e.kind { "invoke_callee" => e.inner.kind, _ => e.kind }
    }
    @`Repeat verbatim, nothing else: OUTCOME[${outcome}]`
    ```
  - drive `/capparent`. Control (probe STL-1): the SAME chain child with the
    **default** `tool_loop` (`max_rounds: 25`) returns `CHAINDONE777` (multi-round
    loop demonstrably runs end-to-end — see Verified-conformant).
- **expected:** `frontmatter.md` §`tool_loop` (FRNT-1): "`max_rounds` … bounds
  free-phase tool-call rounds per query", "applies independently to each query …
  and every query inside an `invoke`d callee (which uses the callee's own
  `tool_loop`)", "On exhaustion without a terminating turn:
  `Err(QueryError { kind: 'tool_loop_exhausted', ... })`." `hard-ceilings.md`
  ceiling #2 / CIO-4: reaching `max_rounds` without a terminating turn surfaces
  `Err(kind: "tool_loop_exhausted")`. There is **no subagent-mode carve-out**. A
  `≥3`-round chain under `max_rounds: 1` must exhaust after round 1 →
  `OUTCOME[tool_loop_exhausted]`.
- **observed** (deterministic parent `userTexts`, `turn.userTexts`):
  `"Repeat verbatim, nothing else: OUTCOME[\n\n\nCHAINDONE777]"` — the subagent
  completed the full ≥3-round read chain and returned the final marker; the cap of
  `1` never fired (`cap-enforced: false`, `cap-absorbed: true`). Reaching
  `CHAINDONE777` provably required reading `ch3` (name known only from `ch2`, whose
  name is known only from `ch1`) → ≥3 sequential tool rounds occurred under a cap
  of 1.
- **root cause (static, read-only):** the subagent query driver collapses the
  entire model tool loop into a single loom-level round.
  `spawnSubagentConversation` passes the loop config
  `maxRounds: … loom.frontmatter.toolLoop?.maxRounds ?? 25`
  (`production-loom-producer.ts:768`), but `SubagentQueryModel.nextFreePhaseTurn`
  (`production-loom-producer.ts:~1554`) drives ONE real `AgentSession` turn at
  `round === 0` — the spawned session's **own** agentic tool loop executes every
  `read` internally and returns `agent_end` — and hands back a terminating
  `{ kind: "text" }`. `runUntypedQueryLoop` (`query-tool-loop.ts:337`) therefore
  only ever observes round 0 → `text` → terminate and never re-consults
  `config.maxRounds`. The subagent's internal tool rounds are invisible to, and
  unbounded by, the loom's `tool_loop.max_rounds`. The only reachable ceiling #2
  on the subagent path is `max_rounds: 0` (immediate exhaustion at `slot 0 == 0`
  before any turn — see STL-3/STL-4 in Verified-conformant); for every
  `max_rounds ≥ 1` the cap is a no-op.
- **verdict: bug.** Same *observable* as QTL-4 (ceiling #2 unreachable) but a
  distinct code path and mechanism: QTL-4 is prompt-mode `pi.setActiveTools([])`;
  this is the subagent `AgentSession` absorbing every tool round inside one
  loom-level query round. A subagent author who sets `tool_loop.max_rounds` to
  bound a tool-hungry query gets no bound at all (short of `0`, which disables the
  query entirely). Not called out as intended in any user-facing doc; the spec
  makes `max_rounds` a per-query bound with no subagent exception.

---

## STL-6 — [FIXED] an unhandled tail `tool_loop_exhausted` breach was surfaced across `invoke` as `cancelled`, masking the true leaf kind

**Status: FIXED** (Phase 2, maintainer decision 6). The executor's control-flow
model had two Flow kinds for a terminal `Err`: `propagate` (from `?`, carried
`err`) and `fail` (a bare unhandled effect-`Err`, carried NO payload). On the
unhandled-tail path the effect's own `QueryError` was dropped, so
`BodyExecution.error` was unset and the subagent `surface` fell through to
`makeErr(makeCancelledError())`, fabricating a cancel. The fix threads the
effect-`Err` payload through the `fail` path (`EvalResult`/`Flow` `fail` now
carry the terminating `QueryError`; `executeBody` surfaces it as
`BodyExecution.error`), exactly as `propagate` does. The subagent and prompt
`surface`s now project `execution.error` for any `fail` outcome and reserve
`CancelledError` for a genuine `cancel` outcome only.

- **source:** `src/runtime/statement-executor.ts` (`EvalResult`/`Flow` `fail`
  variants carry `error`; `evalExpr` non-cancel branch, `terminalFlow`,
  `evalUserFnCall` `fail` arm, `executeBody` `fail` arm) +
  `src/extension/production-loom-producer.ts` (both `surface`s: `fail` projects
  `execution.error`, `cancel` alone yields `CancelledError`).
- **unit coverage:** `tests/statement-executor.test.ts` — "STL-6 — unhandled-tail
  effect Err carries its own error on the fail outcome" (prompt + subagent mode).
- **live before/after** (`session-subagent-toolloop.test.ts`, `/nqparent`):
  - **before:** `NQ[tl=cancelled empty=invoke_callee]` (masked-as-cancelled: true)
  - **after:** `NQ[tl=invoke_callee empty=invoke_callee]` (masked-as-cancelled: false)

### Original finding (retained for provenance)

- **repro:**
  - `tl0nq.loom` (`mode: subagent`, `tools: read`, `tool_loop: { max_rounds: 0 }`),
    body: `` @`Read the file ch1.txt and reply with its contents.` `` — a **bare
    tail query, NO `?`**. `max_rounds: 0` on an untyped query exhausts ceiling #2
    at query start (`slot 0 == max_rounds 0`) before any provider turn (0 tokens);
    the breach is left **unhandled** in tail position.
  - Control `emptynq.loom` (`mode: subagent`), body: `` @` ` `` — a bare tail
    empty-template (unhandled `validation`/`empty_template`, also 0 tokens).
  - `nqparent.loom` (`mode: prompt`):
    ```
    let r1 = invoke<string>("./tl0nq.loom")
    let r2 = invoke<string>("./emptynq.loom")
    let k1 = match r1 { Ok(_) => "ok", Err(e) => e.kind }
    let k2 = match r2 { Ok(_) => "ok", Err(e) => e.kind }
    @`Repeat verbatim, nothing else: NQ[tl=${k1} empty=${k2}]`
    ```
  - drive `/nqparent`.
- **expected:** `errors-and-results.md` §Terminal outcomes: an "`Err`-class
  breach … [reaches *fail*] when the `Err` is unhandled — … not consumed by a
  caller `match`, not discarded via `let _ = …`" — i.e. an unhandled ceiling-#2
  `tool_loop_exhausted` in tail position reaches the fail arm **as
  `tool_loop_exhausted`** (ERR-19: `kind: "tool_loop_exhausted"`). `invocation.md`
  XMODE-1 then wraps a callee-returned `Err` as `InvokeCalleeError { kind:
  "invoke_callee", inner }`, and the pass-through carve-out is only for
  `invoke_infra` / `cancelled` (`effectful-statement-host.ts:311`). So the parent
  should read `tl=invoke_callee` (leaf `tool_loop_exhausted`), exactly as the
  `?`-propagated form does (STL-3, conformant). The `cancelled` outcome is reserved
  for a real `AbortSignal` abort (errors-and-results §Cancelled) — none occurred.
- **observed** (deterministic parent `userTexts`):
  `"Repeat verbatim, nothing else: NQ[tl=cancelled empty=invoke_callee]"`. The
  **control crosses correctly** (`empty=invoke_callee`: the validation Err is a
  tail Result value, passed through and wrapped), but the ceiling-#2 breach is
  surfaced as **`tl=cancelled`** — the true `tool_loop_exhausted` kind is dropped
  and a `CancelledError` is fabricated. Contrast the `?`-propagated form (STL-3):
  `OUTCOME[kind=invoke_callee inner=tool_loop_exhausted rounds=0 last=null]` — the
  same child with `?` crosses with its true kind. So the masking is specific to the
  **unhandled-tail (no-`?`)** ceiling-#2 path.
- **root cause (static, read-only):** on the unhandled failing-tail path the
  executor produces `outcome === "fail"` but leaves the fail error unset for a
  ceiling-#2 breach, and the subagent `surface` fabricates a cancel:
  `if (execution.outcome === "fail" && execution.error !== undefined) return
  makeErr(execution.error); return makeErr(makeCancelledError())`
  (`production-loom-producer.ts` subagent `surface`). `runQueryEffect`'s untyped
  arm returns the breach as `{ ok: false, error: tool_loop_exhausted }`
  (`effectful-statement-host.ts:~200`), but on the unhandled-tail path that error
  is not threaded into `execution.error`, so `surface` falls through to the
  fabricated `cancelled`. `runInvokeEffect` then sees `innerKind === "cancelled"`
  and passes it through unwrapped (`effectful-statement-host.ts:311`) — the parent
  observes `cancelled`, not `invoke_callee`.
- **verdict: bug.** A parent `match`-ing on `e.kind == "cancelled"` would wrongly
  conclude the child was aborted when in fact it exhausted its tool-loop budget —
  a wrong-kind misclassification of a ceiling-#2 breach at the `invoke` boundary,
  and a loss of the ERR-19 payload (`rounds` / `last_tool_name`). The canonical
  `?`-propagated form is conformant (STL-3), which bounds the blast radius, but a
  bare tail query is a legal, documented form (see `convdrive.md` bare-tail
  probes), and `cancelled` has a specific reserved meaning the runtime here
  violates. Distinct from XMODE-1 (which is conformant on this lens — STL-3): the
  defect is upstream, in the subagent surface dropping the fail-arm error for an
  unhandled ceiling-#2 breach.

---

## Verified-conformant (recorded to bound the search — not findings)

- **Multi-round subagent tool loop works (SUBAG-2, extended).** `mrchild.loom`
  (`mode: subagent`, `tools: read`, default `tool_loop`) driven the same forced
  ≥3-round chain returns `CHAINDONE777` across the `invoke` boundary
  (`STL-1`-probe: `parent userTexts = "Say ok. MR=…CHAINDONE777"`,
  `chain-marker-received: true`). SUBAG-2 confirmed a single `read`; this confirms
  the model actually runs a **multi-round** tool loop inside the spawned session
  and its terminal answer crosses back. The loop **terminates cleanly** — no host
  hang (probe returns; no `turn.error`).
- **`max_rounds: 0` is the one reachable ceiling #2 on the subagent path, and its
  ERR-19 shape is correct.** An untyped `max_rounds: 0` subagent query exhausts at
  `slot 0 == 0` with **zero provider turns**; `?`-propagated and reached via
  `invoke<string>`, the parent reads
  `kind=invoke_callee inner=tool_loop_exhausted rounds=0 last=null` (`STL-3`) —
  XMODE-1 wrapping + ERR-19 (`rounds == max_rounds == 0`, `last_tool_name` null →
  rendered `null`) both correct.
- **SLSH-3 / SNK-h top-level note (0 tokens).** The same `max_rounds: 0` subagent
  invoked **directly by slash** (`/tl0direct`, tail `?`) emits exactly the SNK-h
  template on the user session's `loom-system-note` channel:
  `loom /tl0direct returned Err: tool-call loop exhausted after 0 rounds (last
  tool: respond)` — `last_tool_name` null renders the literal `respond`
  (`discovery-cli.md` SNK-h). (`STL-4`, `turn.systemNotes`.)
- **Ambient tools are not inherited by the subagent model.** A subagent declaring
  ONLY `tools: read`, asked to run `echo LEAKBASH` via a bash/shell tool, reports
  it has no such tool (`NIS=NOTOOL`) and the shell output `LEAKBASH` never appears
  (`STL-5`, parent `userTexts`; `leaked-bash-output: false`). A tool outside the
  installed callable set is correctly unavailable — `frontmatter.md` §`tools:`
  "The Pi session's ambient tools are **not** inherited" holds for the subagent
  model. (Distinct from the code-driven QTL-2 over-reach, which is the loom-code
  `<name>(...)` resolver, not the subagent model's callable set.)
- **Unhandled non-ceiling tail Err crosses `invoke` correctly.** A bare tail
  `validation`/`empty_template` Err (no `?`) surfaces to the parent as
  `invoke_callee` (`STL-6` control, `empty=invoke_callee`) — the Result-value
  tail is passed through and XMODE-1-wrapped as expected; only the ceiling-#2
  tail breach is mis-surfaced (STL-6).

## Note on token discipline

STL-4 is 0 tokens (max_rounds:0 short-circuits before any provider turn; the note
is emitted at the boundary). STL-1/2/3/5/6 each drive one live turn (the child
tool loops in STL-1/2/5 are real; the STL-3/6 children are 0-token max_rounds:0 /
empty-template, so only the parent's echo query burns a turn). Model-driven
looping is stochastic; both bug verdicts rest on deterministic parent `userTexts`
and a chain that *provably* requires ≥3 sequential rounds, not on the model
choosing to keep going.
