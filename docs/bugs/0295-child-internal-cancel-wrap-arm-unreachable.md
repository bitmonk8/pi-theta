# Bug 0295 — the child-internal arm of cancellation.md's two-arm invoke rule is unreachable: `runInvokeEffect` passes every callee-returned `kind: "cancelled"` through bare (`effectful-statement-host.ts:433`), so a subagent callee that aborts ITSELF (its tool code calls `ctx.abort()`) surfaces to a non-cancelled parent as bare `Err(cancelled)` — the shape the spec reserves for "the parent's own signal fired first" — and an unhandled propagation renders `theta /<parent> cancelled` for a parent nobody cancelled, instead of `Err(invoke_callee, inner: { kind: "cancelled" })`

- **Status:** fixed (0.337.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the input class is narrow (a
  callee that cancels itself from its own tool code, with the parent's
  signal quiet) but the wrongness is a terminal-outcome misclassification:
  the parent's trichotomy arm flips from Failure (`Err(invoke_callee)`, the
  SLSH-3 `returned Err` note) to Cancelled (the SLSH-4 `theta /<name>
  cancelled` note), telling the user THEIR invocation was cancelled when it
  was not, and a parent `match` cannot distinguish "my user pressed Esc"
  from "my callee gave up" — the exact distinction the spec's two-arm rule
  exists to carry. Not S2: the arm needs a self-aborting callee, which no
  shipped theta does, but `ctx.abort()` is a documented tool-code surface
  (the overridden `ExtensionContext` member whose body calls
  `thetaAbort.abort()`), so the class is authorable. D2 because the parent
  has the discriminator in hand (`deps.signal.aborted` at the wrap seam /
  `thetaAbort.signal.aborted` in the subagent drive), so the fix is a
  signal-gated wrap at one line — but it shares the seam with candidate 04's
  provenance question and should be adjudicated with it.
- **Kind:** defect — the implementation collapses a spec'd two-arm rule to
  one arm. Elements at `bc52da38` (v0.287.0):
  1. *The rule.* `cancellation.md:66` (§Surfacing): "A child invoke whose
     signal aborts surfaces to the parent as `Err(QueryError { kind:
     "invoke_callee", inner: { kind: "cancelled", ... } })` **when the abort
     originated inside the child**, or directly as `kind: "cancelled"`
     **when the parent's own signal fired first**." Restated normatively in
     `error-model.md:35` (per-cause table, Cancellation row: "a
     child-internal abort wraps …; a parent-own-signal abort surfaces bare
     …").
  2. *The collapse.* `runInvokeEffect`'s wrap exempts `cancelled`
     unconditionally (`src/runtime/effectful-statement-host.ts:432–435`),
     with the comment "`cancelled` — cancellation is its own terminal
     outcome" — the parent-own-signal arm's rationale applied to both arms.
     No site consults the parent's signal to arbitrate.
  3. *The child-internal input exists and arrives distinguishable.* Under
     RFC-0006 a subagent-mode callee runs in its own child process with its
     own `thetaAbort`; the parent's abort reaches it only as a kill (PIC-66),
     which produces the NO-envelope path. An envelope-delivered
     `err: { kind: "cancelled" }` is therefore by construction the child's
     own abort (its tool code called the overridden `ctx.abort()`, which
     "itself calls `thetaAbort.abort()`" —
     `conversation-drive.md:16`), and the provider-error-mapping.md audit
     table pins exactly this carriage: `kind: "cancelled"` — "classified in
     the child (the child's own driver observes its thetaAbort) … envelope
     `err` arm" (`provider-error-mapping.md:43`). Measured at the seam: a
     fake child emitting
     `{"theta_result":{"v":1,"err":{"kind":"cancelled","message":"cancelled"}}}`
     then exiting 0, with the parent's `thetaAbort` NOT aborted, settles
     `driveSubagentChild` with the raw
     `{ ok: false, error: { kind: "cancelled", … } }`
     (`src/runtime/subagent-json-driver.ts:155`), which `runInvokeEffect`
     then passes through bare (`:433`).
  4. *The downstream note is the wrong row.* An unhandled bare
     `Err(cancelled)` at the parent's top level takes the per-kind
     `cancelled` row — `theta /<name> cancelled` — instead of SLSH-3's
     `returned Err: …` row with the SLSH-5 hop naming the callee; the
     operator reads a cancellation of the parent that never happened.
- **Related:**
  - **Candidate 04** (this hunt) — the `invoke_infra` half of the same
    exemption line; different governing rule (wrap-by-provenance) and
    different fix input (this one is arbitrable from the parent's own
    signal, which the seam already holds).
  - **0012** (fixed 0.25.0) — the sibling direction on the same surface:
    mid-flight aborts once surfaced as transport/Ok instead of cancelled.
    That fix built the signal-keyed guards this report's fix would mirror at
    the wrap seam.
  - **PIC-66 / 0002** — the kill-is-the-forward design that makes an
    envelope-delivered `cancelled` child-internal by construction.
- **Affected** (verified at `bc52da38`, v0.287.0):
  - `src/runtime/effectful-statement-host.ts:432–435` — the unconditional
    `cancelled` pass-through at the wrap seam (the parent's `deps.signal` is
    in scope for arbitration).
  - `src/runtime/subagent-json-driver.ts:155` — the envelope `err` arm's
    verbatim settle (correct in itself; the arbitration belongs to the wrap
    seam or here, not nowhere).
  - `src/runtime/statement-executor.ts:977–984`, `:1256–1258` — the
    executor's cancelled-effect mapping (`flow: "cancel"`), which handles the
    parent-own-signal arm correctly today: a parent whose OWN signal fired
    gets the bare cancelled outcome through the no-envelope/kill path, and
    nothing here changes that.
  - Spec: `docs/spec_topics/cancellation.md:66` (the two-arm rule);
    `docs/spec_topics/errors-and-results/error-model.md:35` (per-cause
    table); `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:43`
    (audit-table row pinning the envelope carriage of a child-classified
    `cancelled`).
- **Observed at:** v0.287.0 (`bc52da38`). Offline, deterministic,
  provider-free: one scratch vitest probe driving the shipped
  `driveSubagentChild` with a scripted `SubagentChildProcess` double
  (envelope `err` cancelled, exit 0, parent controller un-aborted); written,
  run, deleted. The wrap seam's pass-through is source-traced (the exemption
  is a two-token condition) and additionally exercised by the candidate-04
  probe on its sibling kind. Live-untested: a full live witness needs a
  subagent callee whose tool code calls `ctx.abort()`.

## Summary

The spec distinguishes two cancellations at an invoke boundary and gives each
its own surface: the parent's own abort (bare `kind: "cancelled"` — the
parent IS cancelled) and an abort that originated inside the child
(`invoke_callee { inner: cancelled }` — the parent is NOT cancelled; its
callee failed by cancelling itself, and the parent's `match` may recover).
The implementation ships only the first: `runInvokeEffect` passes every
callee-returned `cancelled` through bare, and no code path constructs
`invoke_callee { inner: { kind: "cancelled" } }` from a real drive.

The child-internal input class is real under RFC-0006: the child process has
its own `thetaAbort`, tool code running in the child can abort it via the
overridden `ctx.abort()`, and the child then emits its envelope with
`err: { kind: "cancelled" }` and exits cleanly — no parent kill involved.
The parent-side drive settles that error verbatim and the wrap seam
exempts it. The parent's `thetaAbort.signal.aborted` is `false` the whole
time — the discriminator the two-arm rule needs is available at the seam and
unread.

Consequence at the user surface: if the parent does not `match` the `Err`,
its top level ends `Err(cancelled)` and the boundary renders the SLSH-4
`cancelled` row — `theta /parent cancelled` — for an invocation neither the
user nor any signal of the parent's cancelled. With the spec'd wrap it would
render the SLSH-3 `returned Err` note with the hop suffix naming the callee.

## Reproduction

Offline, at `bc52da38`. Seam probe (scratch vitest, written, run, deleted):

1. Fake `SubagentChildProcess` (`onStdoutLine`/`onStderrLine`/`onExit`
   callbacks captured; `kill` recorded).
2. `driveSubagentChild({ child, thetaAbort: new AbortController(), calleePath,
   emitDiagnostic })`.
3. Emit one stdout line
   `{"theta_result":{"v":1,"err":{"kind":"cancelled","message":"cancelled"}}}`,
   then `onExit({ code: 0, signal: null })`.

Observed verbatim: parent controller `aborted: false`; drive result
`{"ok":false,"error":{"kind":"cancelled","message":"cancelled"}}`. Source
trace from there: `runInvokeEffect` (`effectful-statement-host.ts:432–435`)
returns that `Err` unchanged for `innerKind === "cancelled"` — no
`invoke_callee` construction site exists for a cancelled inner anywhere in
`src/` (`rg 'inner.*cancelled' src/` — no hits; the only such value in the
tree is a hand-built fixture in `tests/tool-calls.test.ts:374` exercising the
renderer).

## Expected behaviour

- `cancellation.md:66`: child-internal abort →
  `Err(QueryError { kind: "invoke_callee", inner: { kind: "cancelled", … } })`;
  parent-own-signal abort → bare `kind: "cancelled"`.
- `error-model.md:35`: same rule, per-cause table, verbatim.
- For the probe's input (envelope `err` cancelled, parent signal quiet), the
  parent must observe the wrapped shape; the bare shape is reserved for the
  parent-signal case (which today arrives via the PIC-66 kill →
  no-envelope → cancellation short-circuit path, and stays correct).

## Actual behaviour / root cause

The wrap seam discriminates by `kind` and treats `cancelled` as always
terminal-outcome-shaped ("cancellation is its own terminal outcome"). That is
the correct reading only when the abort is the parent's; for a
callee-internal abort the spec treats cancellation as the callee's failure
value, to be wrapped like any other callee-returned `Err`. The seam holds
the arbitration input (`deps.signal.aborted`; the subagent drive holds
`thetaAbort.signal.aborted` and already consults it for the no-envelope
path, `subagent-json-driver.ts:178`) and does not consult it here.

## Why it matters

- The parent-facing distinction is behavioural, not cosmetic: bare
  `cancelled` propagating unhandled ends the parent on the Cancelled arm of
  the trichotomy (SLSH-4 `theta /<name> cancelled`), while the wrapped form
  is an ordinary Failure the parent can `match`, recover from, or report
  with the callee named. A user reading `theta /parent cancelled` after
  pressing nothing gets a false account of their own session.
- The spec states the rule three times (cancellation.md, error-model.md's
  table, and the audit table's carriage row); a conformance test for the
  child-internal arm cannot be written green against this HEAD — the shape
  is unconstructable from any real drive.
- The arbitration is one signal read the adjacent code already performs for
  the no-envelope path, so the gap is not a design limitation.

## Non-goals

- The parent-own-signal arm (kill → no-envelope → cancellation
  short-circuit → bare `cancelled`) is correct and untouched.
- The pre-dispatch checkpoint abort (`runInvokeChild`'s pre-spawn check) is
  the parent's own signal by construction; bare is correct there.
- In-process `subagent fn` bodies share the invocation's controller, so the
  child-internal/parent distinction does not arise for them; their wrap of a
  `?`-propagated `cancelled` VALUE (`statement-executor.ts:611`) is a
  separate consistency question not claimed here.
- The `invoke_infra` half of the exemption line is candidate 04.

## Fix

Gate the exemption's `cancelled` arm on the parent's own signal at the wrap
seam: `innerKind === "cancelled" && deps.signal.aborted` → pass bare
(parent-own-signal arm); `innerKind === "cancelled"` with the signal quiet →
wrap via `surfaceThetaCallableCalleeFailure` (child-internal arm). The
envelope race where the child's cancelled envelope lands AFTER the parent's
abort (kill in flight) resolves to bare under this gate, which is the arm the
spec assigns ("the parent's own signal fired first"). Witness: the seam probe
above extended through `runInvokeEffect` (fake `InvokeChild`), one cell per
arm — the child-internal cell red at this HEAD (bare) and green wrapped; the
parent-aborted cell byte-identical before and after. Coordinate with
candidate 04's provenance mechanism if both land: the signal gate composes
with (and does not require) the provenance marker.

## Provenance

Error-classification bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at
`bc52da38` (v0.287.0). Surfaces read: `runInvokeEffect`
(`effectful-statement-host.ts`), `driveSubagentChild` /
`attachSubagentCancellation` (`subagent-json-driver.ts`), `runInvokeChild`
(`invoke-cancellation.ts`), the executor's cancelled-flow mappings
(`statement-executor.ts`); spec cancellation.md §Surfacing,
error-model.md per-cause table, provider-error-mapping.md audit table,
invocation.md §Failures. Probe: scratch fake-child drive, run and deleted;
result bytes verbatim.

## Fix (0.337.0)

- What shipped:
  - `src/runtime/effectful-statement-host.ts` (`runInvokeEffect` wrap seam) —
    the `cancelled` disjunct is signal-gated: `outcome.source === "boundary-minted"
    || (innerKind === "cancelled" && deps.signal.aborted)`. Parent signal ABORTED
    (parent-own-signal arm, including the envelope-after-abort race) → bare
    `cancelled`; signal QUIET (child-internal arm) → falls through to the existing
    `surfaceThetaCallableCalleeFailure` wrap + `recordInvokeHop`, surfacing
    `Err(invoke_callee, inner: { kind: "cancelled" })` with the SLSH-5 hop naming
    the callee (§Fix, verbatim). No new diagnostic code; the seam comment rewritten
    to WHY the gate is signal-based (not source-keyed), citing cancellation.md:66.
  - `tests/b0295-child-internal-cancel-wrap-arm.test.ts` (new) — the 7-cell witness
    (A child-internal wrap, B pre-dispatch bare, C race bare, D unhandled note names
    the callee, E parent match-ability, F ordinary non-cancelled wrap, G in-process
    subagent-fn control).
  - `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` — the (G)
    cancelled-exemption fence re-pinned from bare `cancelled` to the child-internal
    wrap `invoke_callee{inner:cancelled}` (quiet signal is the child-internal arm
    under the new gate). Pre-authorized by the 0294 record; strengthened, not
    weakened; cites both bugs. All other content byte-untouched.
- Gates: witness `npx vitest run tests/b0295-*.test.ts` → 7/7 green (revert→RED on
  A/D/E for the right reason→restore→GREEN; a source-only gate reds cell C, proving
  the gate must be signal-based); full default suite `npx vitest run` → 520 files /
  9877 tests green; `npm run typecheck` clean; `npm run lint` clean.
- Review: 1 round (`bug-fix-reviewer`, deep) — CLEAN, no correctness/fidelity/spec
  blocker; one non-blocking residual (R1, below). Loop converged at round 1.
- Verification: SOLID. Obl 1 (witness reds/greens on revert/restore + the signal-vs-
  source discriminator on cell C) — proven. Obl 2 (default suite 520/9877) — green.
  Obl 3 (live end-to-end) — the b0294 live cell drives the real AgentSession
  slash-dispatch through this exact wrap seam (invoke_callee wrap + SLSH-5 suffix)
  green under the cross-lane live-lock, with b0271live (depth-2 invoke) green; a
  bespoke self-aborting-callee live cell is not cheap (needs custom abort-calling
  tool code in a spawned child), so the invoke seam is proven live via these
  existing cells. Obl 4 (typecheck + lint) — clean.
- Residuals:
  1. (correctness — non-blocking, pre-adjudicated) The `.theta`-callable code-call
     leg (`runToolCallEffect`, theta-callable branch) still surfaces a child-internal
     `cancelled` bare — it constructs no `invoke_callee` wrapper and reads no signal.
     Pre-existing and adjudicated out of scope by bug 0088 (Residuals item 1); 0295
     §Fix scopes only `runInvokeEffect`. After 0295 the leg asymmetry now also covers
     the cancelled two-arm rule — follow-up filing material, not a defect of this fix.
  2. (doc discrepancy) The doc §"Why it matters" / §"Actual behaviour" claim that the
     wrap flips the top-level note to the SLSH-3 `returned Err:` row is inexact: the
     shipped `renderTopLevelErrNote` walks every `invoke_callee` wrapper to the leaf,
     and `theta-composition-producer.ts` routes every returned `!terminal.ok` through
     it, so a cancelled leaf renders SNK-f `theta /<name> cancelled` whether bare or
     wrapped. The wrap’s real behavioural effects are (1) the Err kind becomes
     `invoke_callee` → matchable by the parent (cell E), and (2) the SLSH-5 hop
     suffix naming the callee is appended (cell D). §Fix (the signal-gated wrap) is
     unaffected; the renderer is out of scope and untouched.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the parent-own-signal arm (kill → no-envelope →
  cancellation short-circuit → bare) byte-identical; the pre-dispatch checkpoint abort
  stays bare; in-process `subagent fn` bodies (shared controller) untouched;
  `statement-executor.ts` cancelled-flow mappings untouched; the `invoke_infra` half
  (0294) — its wrap rule, ledger hop, and closed set — untouched. No new author-string-
  keyed record (0343 N/A). No wire-format change. No spec amendment owed (the fix
  implements cancellation.md:66 / error-model.md:35 as written).
