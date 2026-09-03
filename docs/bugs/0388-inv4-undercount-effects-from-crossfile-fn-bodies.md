# Bug 0388 — an effect dispatched from inside a cross-file `fn` body counts against the bind-level invoke chain, not the executor-accumulated one, so a chain INV-4 caps at 32 runs to ~32×32 countable frames without a panic

- **Status:** open.
- **Sev/Diff estimate:** S2-3/D3 — no wrong value binds, but a normative hard
  ceiling (INV-4's 32-frame cap over "the active call chain") admits chains an
  order of magnitude past its bound: every render-side or effect-side countable
  frame reached from inside a cross-file `fn` body is counted from the chain as
  it stood at BIND time, discarding the fn-frame segment in between. Each
  segment still caps at 32 (no unbounded runaway), but the composed chain the
  spec defines — "the count of countable frames on the active call chain" —
  reaches ~1024 before any push sees 33. D3 because the honest fix threads the
  live executor chain (`ExecuteBodyDeps.invokeChain`) into the bind-scope
  effect resolvers (`StatementEvalHost` widening), which bug 0354's fix record
  itself scoped out as "a behavioural change beyond this fix's adjudicated
  scope, flagged for the parent".
- **Kind:** defect (implementation diverges from INV-4's chain definition).
- **Related:**
  - [0354](./0354-crossfile-thetalib-fn-frames-uncounted.md)
    — fixed (0.367.0). Its §Fix Residual 1 names this exact reverse direction
    ("*Fn-frames-then-effect undercount (F1, bounded).* An `invoke` /
    `@`-query / `subagent fn` dispatched from INSIDE a cross-file `fn` body
    counts from the bind-level chain, not the executor-accumulated
    `ExecuteBodyDeps.invokeChain`, because those effect resolvers are
    bind-scope closures… flagged for the parent"). No follow-up was filed;
    this report is it, with a mechanical witness. Index precedent for a
    residual-derived filing:
    [0259](./0259-unclosed-enum-variant-list-at-eof-loads-clean.md)
    was filed off 0245's fix-record residual ("worth its own filing").
  - 0016 / 0303 — the read-side scope/boundary parity precedents for the same
    bind-vs-executor seam.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/extension/production-theta-producer.ts:1869` (and the subagent twin
    `:2084`) — the per-drive `chain` is minted once at bind
    (`newInvokeChainAtDepth(subagentInboundInvokeDepth ?? 0)`), then closed
    over by the effect resolvers (`resolveQuery` at `:1928`, which renders
    interpolations via `renderQueryText(expr, env, chain)` at `:1939`, and the
    invoke/tool dispatch closures). These closures never see fn frames pushed
    after bind.
  - `src/runtime/statement-executor.ts:489-495` — `evalUserFnCall` accumulates
    cross-file fn frames into `bodyDeps.invokeChain` (bug 0354's fix), but
    that accumulated chain reaches only further `fn` calls and the pure-host
    twin; a query/invoke/subagent-fn effect inside the body dispatches through
    the bind-scope closures above.
- **Observed at:** v0.382.0 (d63c5148), offline scratch vitest reusing the
  committed b0354 `measure()` harness verbatim (real `parseThetaDocument`,
  real `checkThetaImports`, real `executeBody` through
  `createProductionProducerDeps().bindPromptConversation`, chain seeded via
  `subagentInboundInvokeDepth`); scratch deleted.

## Summary

Bug 0354 wired cross-file `.thetalib` `fn` frames into INV-4's counter on the
executor path and the pure-host render path — but the render/effect resolvers
are closures minted at BIND time over the bind-level chain. When a countable
frame is reached from INSIDE a cross-file `fn` body (a query whose
interpolation calls another cross-file `fn`, an `invoke`, a `subagent fn`
call), the push is counted from the chain as it stood before the fn segment,
so the frames between bind and dispatch vanish from the count. INV-4 defines
depth as "the count of countable frames on the active call chain"; the active
chain in the witness below carries 33 countable frames and no panic fires.

## Reproduction

Scratch vitest (deleted) — the committed b0354 harness's `measure()` copied
verbatim, two cells, seeded at depth 31 (`subagentInboundInvokeDepth: 31`, the
b0354-established proxy for 31 real invoke frames — the same per-chain counter):

- Fixtures: app imports `outer` from `olib.thetalib`; `olib` imports `vf` from
  `vlib.thetalib`; `outer`'s body is `let q = @`value ${vf(0)}`` then `7`;
  `vf(x) = x + 1`.
- Arithmetic: seed 31 + `app→outer` (cross-file frame 32, at cap, legal) +
  render-side `olib→vf` (cross-file frame 33 on the active chain) → INV-4
  prescribes `invoke chain depth exceeded: 33 > 32` during interpolation
  render, before any drive.

Observed:

| Cell | Shape | Expected (INV-4) | Observed |
|------|-------|------------------|----------|
| R1 | seed 31 → `outer()` → render `${vf(0)}` inside `outer`'s body | throw `InvokeDepthExceededPanic: invoke chain depth exceeded: 33 > 32` | throw `TypeError: pi.on is not a function` — the offline harness's query-DRIVE seam. The render completed UNCOUNTED and execution proceeded into the drive machinery. |
| R1-control | seed 31 → `f1()` → `f2()` (same arithmetic, all executor-path fn→fn frames) | same panic | throw `InvokeDepthExceededPanic: invoke chain depth exceeded: 33 > 32` — the fixed direction counts. |

The discrimination logic is the committed b0354 row-6 cell's own (its comment:
"the harness seam is reached ONLY because the render already completed
uncounted, which is exactly the defect") — inverted: row 6 proved the
top-level render counts; R1 proves the same render inside a cross-file fn body
does not. The control proves the arithmetic and harness are sound.

## Expected behaviour

`docs/spec_topics/invocation.md:85` (INV-4) and the paragraph below it:
"Depth is the count of *countable frames* on the active call chain, where a
countable frame is any direct `invoke(...)` call, any `.theta` callable call
dispatched through a `tools:` entry, any cross-file `.thetalib` `fn` call, or
any `subagent fn` call… The cap is breached when the runtime is about to push
a frame that would bring the count to 33… The counter is incremented before
the child frame begins executing." The active call chain in R1 is: 31 seeded
frames + `outer` + `vf` = 33 countable frames; the `vf` push must panic. The
spec defines one per-chain count — not per-segment counts stitched at bind
boundaries.

## Actual behaviour / root cause

The chain is carried in two disjoint lanes: (1) the bind-level `chain` closed
over by the effect resolvers (production-theta-producer.ts:1869/:1928/:1939),
and (2) the executor-accumulated `ExecuteBodyDeps.invokeChain`
(statement-executor.ts:489-495), which only fn calls and the pure-host twin
extend. A countable frame dispatched via lane (1) from inside a lane-(2)
segment counts from the stale bind-level value. The 0354 fix record names the
mechanism ("those effect resolvers are bind-scope closures") and the missing
piece ("Closing the reverse direction needs a `StatementEvalHost` widening —
thread the live chain into effect dispatch").

## Why it matters

INV-4's cap is the resource-exhaustion backstop and — normatively, per its
wire-carriage paragraph — "thereby also the **process-tree depth bound**". The
undercount composes: each invoke/subagent-fn level re-binds and costs 1 frame
on the persistent chain while up to 31 cross-file fn frames per level vanish,
so a legitimate-but-runaway mixed recursion (the exact case INV-4 says the
bound exists for) runs to the order of 1024 real frames before a panic. The
divergence also makes the panic's site arbitrary: the same 33-frame chain
panics or completes depending on whether the 33rd frame is reached through a
statement or through a render.

## Non-goals

- Intra-file `fn` recursion stays uncounted (NOCEIL-3/-4; 0354 §Non-goals).
- The two production `pushCountableFrame` sites and the 0354-landed
  executor/pure-host accounting — untouched and correct in their direction.
- Param / schema defaults evaluating chainless (0354 §Fix constraint 2).

## Fix

Not yet decided between: (a) the `StatementEvalHost` widening 0354's record
flags — thread the live `ExecuteBodyDeps.invokeChain` into effect dispatch so
`resolveQuery`/invoke/subagent-fn closures receive the CURRENT chain (the
faithful fix; touches the host seam signature); (b) narrow the seam to the
render path only (`renderQueryText` already takes a chain parameter — pass the
executor's accumulated chain at the fn-body call site), leaving invoke /
subagent-fn effect dispatch for a second step. Any fix must keep the
bind-level chain as the seed (INV-4 wire carriage across subagent processes)
and must not double-count the fn segment when both lanes are visible.
Constraint: the b0354 witness rows 1-7 must stay green (the counted direction
is behaviour-pinned).

## Provenance

Fix-residuals sweep over bugs 0351-0385: 0354 §Fix Residual 1 named this
direction, bounded it, and flagged it for the parent; no bug was filed. Probed
at d63c5148 with a scratch vitest (2 cells, table above) reusing the committed
b0354 harness; scratch deleted. Spec read: invocation.md INV-4 (all four
paragraphs). Implementation read: production-theta-producer.ts:1869-1939,
:2084, :2986, :6407; statement-executor.ts:489-495. Dup check: README index
carries no bind-scope / undercount report; 0354 is fixed and its record scopes
this direction out.
