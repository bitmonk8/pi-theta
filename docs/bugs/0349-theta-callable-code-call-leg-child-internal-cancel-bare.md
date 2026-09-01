# Bug 0349 — the `.theta`-callable CODE-CALL leg never applies cancellation.md's two-arm rule: `runToolCallEffect`'s theta-callable branch returns the callee's top-level `Result` bare (`effectful-statement-host.ts:338`), so a subagent-mode `.theta` tool whose child aborts ITSELF (envelope `err: cancelled`, exit 0, caller signal quiet) surfaces to a non-cancelled caller as bare `Err(cancelled)` — the shape the spec reserves for "the parent's own signal fired first" — where `tool-calls.md:46` pins the SAME single error model as `invoke`; the sibling collapse 0295 (fixed 0.337.0) closed at the `runInvokeEffect` invoke seam, unclosed on the code-call leg

- **Status:** fixed (0.338.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the conformant child-internal
  shape (`invoke_callee { inner: cancelled }`) is unconstructable from any
  real code-call drive at this HEAD: the theta-callable branch returns the
  callee's `Result` bare for every kind, so a conformance test for the
  two-arm rule on this leg cannot be written green (a documented shape no
  code-call input can fire — the same verification-gap class as its sibling
  0295). The behavioural face is a terminal-outcome misclassification on a
  narrow authorable input: a subagent-mode `.theta` tool callee whose own
  tool code calls the overridden `ctx.abort()` with the caller's signal
  quiet reaches the caller as bare `Err(cancelled)`, so the caller's `match`
  cannot tell "my user cancelled me" from "my callee gave up", and an
  unhandled propagation ends the caller on the Cancelled arm for an
  invocation nobody cancelled. Not S2: it needs a self-aborting callee (no
  shipped theta does this) and the surfaced value is a loud `Err`, not a
  silently wrong value. D2 because the fix mirrors 0295's one-subsystem
  signal gate at this branch — but unlike the invoke seam the code-call leg
  wraps NO callee-returned `Err` today (see §Actual behaviour), so the fix
  must introduce the `surfaceThetaCallableCalleeFailure` wrap and hop where
  none exists, coordinated with the broader FN-5-pass-through disposition
  bug 0088 deferred (§Fix); bundling that broader wrap would raise it to D3.
- **Kind:** defect — a spec-required error model unapplied on one of the two
  legs that share it. Elements, source-traced at `41bc4698` (v0.337.0):
  1. *The rule, and its reach.* `cancellation.md:66` (§Surfacing) states the
     two-arm rule over an invoke boundary: "A child invoke whose signal
     aborts surfaces to the parent as `Err(QueryError { kind:
     "invoke_callee", inner: { kind: "cancelled", ... } })` **when the abort
     originated inside the child**, or directly as `kind: "cancelled"`
     **when the parent's own signal fired first**." `error-model.md:35`
     restates it as "the two-arm `invoke`-parent rule". The letter names
     "invoke", but the code-call leg is inside that rule's reach:
     `tool-calls.md:38` — "For a `.theta` callable, failures the callee
     returned cascade through the standard `InvokeCalleeError` variant (the
     call is, semantically, an `invoke`)"; `tool-calls.md:46` — a `.theta`
     callable call and `invoke(...)` "surface failures through the same
     `QueryError` variants … The two surfaces share a single error model".
     So the child-internal cancellation of a `.theta`-callable callee is
     spec'd to wrap as `invoke_callee { inner: cancelled }`, exactly as for
     `invoke`.
  2. *The leg wraps nothing.* `runToolCallEffect`'s theta-callable branch
     (`src/runtime/effectful-statement-host.ts:325–341`) drives the callee
     through the same `runInvokeChild` trampoline the invoke seam uses, then
     returns the driven outcome directly: `case "value": return { ok: true,
     value: invokeOutcome.result };` (`:337–338`). It reads neither
     `invokeOutcome.source` (the 0294 provenance discriminator) nor
     `deps.signal` (the 0295 two-arm discriminator), and calls
     `surfaceThetaCallableCalleeFailure` nowhere. Every callee-returned
     `Err` — cancelled or not — surfaces bare. The branch comment attributes
     the pass-through to FN-5 ("return the callee's typed top-level `Result`
     directly (FN-5)"), but FN-5 (`functions.md:44`) governs the *success*
     final value and, on failure/cancellation, defers the envelope shape to
     "[Errors and Results — QueryError variants] and [Cancellation]" — it
     does not license a bare Err.
  3. *The child-internal input exists and arrives distinguishable.* Under
     RFC-0006 a subagent-mode `.theta` tool callee runs in its own child
     process with its own `thetaAbort`; the caller's abort reaches it only
     as a kill (PIC-66 → the no-envelope path). An envelope-delivered
     `err: { kind: "cancelled" }` with the caller's signal quiet is by
     construction the child's own abort (its tool code called the overridden
     `ctx.abort()`). `runInvokeChild` (`src/runtime/invoke-cancellation.ts:154`)
     settles that as `{ kind: "value", result: Err(cancelled), source:
     "callee-returned" }`, which the code-call branch passes through bare at
     `:338`.
  4. *The invoke sibling is now fixed; this leg is not.* At `41bc4698` the
     `runInvokeEffect` wrap gate (`:453`) reads
     `outcome.source === "boundary-minted" || (innerKind === "cancelled" &&
     deps.signal.aborted)` — bug 0295's signal gate (fixed 0.337.0). The
     invoke seam now wraps a child-internal cancellation; the code-call leg
     30 lines above still returns it bare.
- **Related:**
  - [0295](./0295-child-internal-cancel-wrap-arm-unreachable.md)
    (fixed 0.337.0) — the sibling on the `runInvokeEffect` invoke seam: the
    identical two-arm collapse, closed with the `deps.signal.aborted` gate at
    `:453`. This report is that fix's §Fix Residuals item 1 — the same
    asymmetry surviving on the tool-position (code-call) leg. 0295's §Fix and
    its `b0295` / `b0294 (G)` fence cells are unchanged here.
  - [0347](./0347-subagent-leg-propagated-mintable-invoke-infra-stays-bare.md)
    (open) — the `invoke_infra` half of the same XMODE-1 wrap parity, on the
    subagent LEG of the invoke seam. Its Non-goals cede the `cancelled` arm
    to 0295; this report is that arm on the distinct code-call leg. Different
    seam (`runToolCallEffect`, not `runInvokeEffect` / `subagent-json-driver`).
  - [0294](./0294-callee-propagated-invoke-infra-unwrapped-misattributed.md)
    (fixed 0.326.0) — introduced the `outcome.source` provenance
    discriminator the invoke seam wraps by; the code-call leg reads neither
    `source` nor signal.
  - [0088](./0088-slsh5-chain-suffix-never-emitted.md)
    (fixed 0.205.0) — its §Fix (0.205.0) Residuals item 1 records this leg's
    pass-through ("the theta-callable branch of `runToolCallEffect` returns
    the callee's own `Result` through unchanged (FN-5) and constructs no
    `invoke_callee` wrapper") and excludes it from the SLSH-5 chain-suffix
    ledger *by scope adjudication*, not as a ruling that bare surfacing is
    intended. That deferral is the standing adjudication over this leg's
    wrap; it does not touch the cancelled two-arm rule and does not contest
    `tool-calls.md:38/46`.
  - [0012](./0012-untyped-off-session-mid-abort-transport-not-cancelled.md)
    (fixed 0.25.0) — the signal-keyed cancellation-classification guards this
    leg's fix mirrors.
- **Affected** (verified at `41bc4698`, v0.337.0):
  - `src/runtime/effectful-statement-host.ts:325–341` — `runToolCallEffect`'s
    theta-callable branch; `:337–338` returns the driven callee `Result`
    bare (no `source` read, no `deps.signal` read, no
    `surfaceThetaCallableCalleeFailure` wrap); `:339–340` the pre-dispatch
    cancelled arm (caller's own signal — bare is correct there). Contrast the
    invoke seam's post-0295 gate at `:453` and its wrap via
    `surfaceThetaCallableCalleeFailure` (`src/runtime/tool-call.ts:804`),
    which this branch does not call.
  - `src/runtime/invoke-cancellation.ts:121` (`runInvokeChild`), `:154` — the
    shared trampoline both legs drive through; it settles a callee-returned
    envelope as `{ kind: "value", result, source: "callee-returned" }`. The
    arbitration belongs to the consuming seam, which this leg omits.
  - Spec: `docs/spec_topics/cancellation.md:66` (the two-arm rule);
    `docs/spec_topics/errors-and-results/error-model.md:35` (per-cause table,
    "the two-arm `invoke`-parent rule"); `docs/spec_topics/tool-calls.md:38`
    ("the call is, semantically, an `invoke`"; failures cascade through
    `InvokeCalleeError`), `:46` ("share a single error model");
    `docs/spec_topics/functions.md:44` (FN-5 — success final value; defers
    the failure/cancellation envelope), `:67` (a subagent callee's
    cancellation surfaces "exactly as for an `invoke`d subagent-mode
    callee").
- **Observed at:** v0.337.0 (`41bc4698`). Offline, deterministic,
  provider-free: one scratch vitest probe drove the real `executeBody` over
  `createEffectfulStatementHost` with a `call` expr classified
  `theta-callable` and a `resolveCallAsInvoke` returning an `InvokeChild`
  double (drive resolves `{ source: "callee-returned", result:
  Err(cancelled) }`), caller `AbortController` un-aborted — the `b0295` seam
  harness pattern with a `call` expr in place of the `invoke` expr. Written,
  run, deleted. Live-untested: a full live witness needs a subagent-mode
  `.theta` tool whose tool code calls `ctx.abort()`.

## Summary

`cancellation.md`'s two-arm rule gives a child-internal abort and a
caller's-own abort distinct surfaces: `invoke_callee { inner: cancelled }`
(the caller is NOT cancelled; its callee cancelled itself, and the caller's
`match` may recover) versus bare `kind: "cancelled"` (the caller IS
cancelled). `tool-calls.md:38/46` pin that a `.theta`-callable call — "the
call is, semantically, an `invoke`" — surfaces failures through "the same
`QueryError` variants" and shares "a single error model" with `invoke`, so
the rule reaches the code-call leg.

The code-call leg ships only the bare arm. `runToolCallEffect`'s
theta-callable branch drives the callee through the shared `runInvokeChild`
trampoline and returns the driven `Result` directly, reading neither the
`outcome.source` provenance nor the caller's `deps.signal`, and wrapping
nothing. A child-internal `err: { kind: "cancelled" }` — by construction a
self-aborting subagent callee, since the caller's own abort arrives as a
kill (no-envelope) — reaches the caller as bare `Err(cancelled)`. The
caller's signal is quiet the whole time; the discriminator the rule needs is
in scope at the branch and unread. The invoke sibling was gated by bug 0295
(fixed 0.337.0) 30 lines below; this leg was not.

## Reproduction

Offline, provider-free, at `41bc4698`. Scratch vitest probe (written, run,
deleted) over the code-call seam: real `executeBody` driving one
`worker(...)` `call` tail through `createEffectfulStatementHost`, with
`classifyCall` → `"theta-callable"` and `resolveCallAsInvoke` → an
`InvokeChild` double whose `drive()` resolves `{ source: "callee-returned",
result: Err({ kind: "cancelled", message: "callee aborted itself" }) }`;
caller `AbortController` un-aborted.

Observed verbatim:

```
[0349] outcome= success present= true value.ok= false
[0349] surfaced kind= cancelled message= callee aborted itself
[0349] non-cancelled surfaced kind= code_tool
[0349] parent-own outcome= cancel present= false
```

- Row 1–2: a child-internal cancellation (caller signal quiet) surfaces to
  the caller as a body-tail value that is bare `Err(cancelled)` — not
  `Err(invoke_callee { inner: cancelled })`.
- Row 3: a callee-returned `code_tool` `Err` also surfaces BARE, not
  `invoke_callee` — the leg wraps no callee-returned failure at all
  (`tool-calls.md:38`), the FN-5-pass-through mechanism.
- Row 4: a caller-own abort before dispatch ends bare `cancel` (the
  pre-dispatch arm at `:339–340`) — correct and untouched.

## Expected behaviour

- `cancellation.md:66`: a child-internal abort →
  `Err(QueryError { kind: "invoke_callee", inner: { kind: "cancelled", … } })`;
  a caller's-own-signal abort → bare `kind: "cancelled"`.
- `tool-calls.md:38`: "For a `.theta` callable, failures the callee returned
  cascade through the standard `InvokeCalleeError` variant (the call is,
  semantically, an `invoke`)."
- `tool-calls.md:46`: the `.theta` callable call and `invoke(...)` "surface
  failures through the same `QueryError` variants … The two surfaces share a
  single error model."
- For the probe's input (envelope `err` cancelled, caller signal quiet), the
  caller must observe the wrapped shape; bare is reserved for the caller's
  own signal (row 4, which already arrives via the PIC-66 kill →
  no-envelope path and stays correct).

## Actual behaviour / root cause

`runToolCallEffect`'s theta-callable branch returns `invokeOutcome.result`
directly (`:338`). Unlike `runInvokeEffect`, it consults neither
`invokeOutcome.source` nor `deps.signal`, and constructs no
`InvokeCalleeError`. So the leg does not merely collapse the cancelled
two-arm rule — it applies none of the `invoke` error model on the value
path: every callee-returned `Err` surfaces bare, the cancelled kind among
them. The branch comment cites FN-5, but FN-5 (`functions.md:44`) governs the
success final value and defers the failure/cancellation envelope to the error
model and `cancellation.md`; `functions.md:67` states a subagent callee's
cancellation surfaces "exactly as for an `invoke`d subagent-mode callee". The
discriminator the cancelled arm needs (`deps.signal.aborted`, quiet for a
child-internal abort) is in scope at the branch, exactly as at the invoke
seam bug 0295 gated.

The standing adjudication over this leg's wrap is bug 0088's §Fix (0.205.0)
Residuals item 1, which excluded the leg's `invoke_callee` wrap from the
SLSH-5 chain-suffix ledger as a scope decision — "excluded here by
adjudication, not by oversight" — while recording the pass-through as a known
gap. That deferral neither adjudicates bare surfacing as intended nor
contests `tool-calls.md:38/46`; it defers the wrap, and the wrap is what
`tool-calls.md` requires.

## Why it matters

- The caller-facing distinction is behavioural: bare `cancelled` propagating
  unhandled ends the caller on the Cancelled arm of the trichotomy (the
  SLSH-4 `theta /<name> cancelled` note), while the wrapped form is an
  ordinary Failure the caller can `match`, recover from, or report with the
  callee named. A caller that invokes a `.theta` tool and reads its own
  cancellation, having pressed nothing and having its signal quiet, gets a
  false account.
- The surface diverges by call syntax for the identical program:
  `invoke("./worker.theta")` wraps the child-internal cancellation (post
  0295) while `worker(...)` after listing `./worker.theta` in `tools:`
  surfaces it bare — the exact divergence `tool-calls.md:46`'s "single error
  model" forbids.
- A conformance test for the child-internal arm on the code-call leg cannot
  be written green at this HEAD: the wrapped shape is unconstructable from any
  real code-call drive, so the two-arm rule is untested on this leg.

## Non-goals

- The caller's-own-signal arm (pre-dispatch abort → `:339–340` bare
  `cancel`) is correct and untouched.
- The invoke seam (`runInvokeEffect`, `:453`) is bug 0295's fixed subject and
  is not re-opened here.
- The `invoke_infra` wrap-parity gap on the subagent leg of the invoke seam
  is bug 0347.
- The SLSH-5 chain-suffix ledger on this leg is bug 0088's recorded scope
  exclusion; this report is about the surfaced `Err` shape (wrap vs bare),
  not the note's hop suffix.

## Fix

Apply the invoke seam's two-arm arbitration to the code-call leg's `value`
arm. In `runToolCallEffect`'s theta-callable branch, replace the bare
`return { ok: true, value: invokeOutcome.result }` (`:338`) with the same
provenance-and-signal decision `runInvokeEffect` makes at `:453`: a
`boundary-minted` outcome stays bare; a `callee-returned` `Err` wraps via
`surfaceThetaCallableCalleeFailure` (`src/runtime/tool-call.ts:804`) with the
call-site token as the SLSH-5 hop, and the `cancelled` kind is gated
`innerKind === "cancelled" && deps.signal.aborted` → bare (caller-own arm and
the envelope-after-abort race), signal quiet → wrap (child-internal arm). The
envelope race where the child's cancelled envelope lands after the caller's
abort resolves bare under the gate, as at the invoke seam.

This composes with — and its cancelled arm is scoped narrower than — the
broader disposition of whether the code-call leg should wrap ALL
callee-returned `Err`s per `tool-calls.md:38` (the FN-5 pass-through bug 0088
deferred): the minimal fix here is the cancelled two-arm gate; a coherent fix
wraps callee-returned failures on this leg generally, out of which the
cancelled two-arm rule falls. That broader-wrap decision is the one open
adjudication (whether existing callers rely on bare pass-through of
non-cancelled callee `Err`s) and, if bundled, raises the fix from D2 to D3.

Witness: the seam probe above extended to assert the surfaced kind per arm —
the child-internal cell (quiet signal) red at this HEAD (bare `cancelled`)
and green wrapped; the caller-own pre-dispatch cell byte-identical before and
after; a non-cancelled callee-`Err` control fixing the broader-wrap
expectation the fix lands.

## Provenance

Filed as bug 0295's §Fix (0.337.0) §Residuals item 1: the `.theta`-callable
code-call leg's `runToolCallEffect` branch surfaces a child-internal
`cancelled` bare, sharing the two-arm collapse 0295 closed at the
`runInvokeEffect` invoke seam. Surfaces read at `41bc4698` (v0.337.0):
`runToolCallEffect` and `runInvokeEffect`
(`src/runtime/effectful-statement-host.ts`), `runInvokeChild`
(`src/runtime/invoke-cancellation.ts`), `surfaceThetaCallableCalleeFailure`
(`src/runtime/tool-call.ts`); spec `cancellation.md` §Surfacing,
`error-model.md` per-cause table, `tool-calls.md` §Failures / §Relationship
with `invoke`, `functions.md` FN-5. Adjudication read in full: bug 0088 §Fix
(0.205.0) Residuals item 1 (the leg's FN-5 pass-through, excluded from the
SLSH-5 ledger by scope, not ruled intended). Ownership checked: `rg` over
`docs/bugs/` and README for the code-call / theta-callable cancelled surface
returns 0088 (fixed), 0295 (fixed), 0347 / 0294 / 0293 (invoke-seam siblings,
fixed/open but distinct seam), 0012 (fixed) — no open bug owns the
`runToolCallEffect` theta-callable leg's cancelled surfacing. Probe: scratch
`tests/scratch-0349-codecall-cancel.test.ts`, run and deleted; a sweep for
`scratch` / `0349` in `tests/` and `git status --short` shows no residue.

## Fix (0.338.0)

- What shipped:
  - `src/runtime/effectful-statement-host.ts` (`runToolCallEffect` theta-callable
    branch) — the `case "value"` arm now mirrors `runInvokeEffect`'s value arm:
    `result.ok` returns the callee's typed top-level `Result` directly (FN-5,
    byte-identical to the pre-0349 pass-through; NO INVCEIL-3 untyped-`null`
    discard — that discard is exclusive to the untyped-`invoke` seam); a
    callee-returned `Err` is gated `invokeOutcome.source === "boundary-minted" ||
    (innerKind === "cancelled" && deps.signal.aborted)` → bare (boundary-minted
    per 0294; caller-own cancel and the envelope-after-abort race per 0295),
    else wraps via `surfaceThetaCallableCalleeFailure` and records the SLSH-5 hop
    via `deps.recordInvokeHop` with `{ style: "theta_callable_bare",
    calleeNameToken: expr.range.start }` (the callee-name identifier token of the
    bare call). The pre-dispatch `case "cancelled"` arm is byte-identical. The
    branch's leading comment and the `recordInvokeHop` deps doc were rewritten:
    FN-5 governs only the success value, a callee-returned `Err` cascades through
    `InvokeCalleeError` (tool-calls.md:38/46), and the deps doc now names both
    hop producers.
  - `src/runtime/invoke-provenance-ledger.ts` (module header) — the "WHICH
    WRAPPERS CARRY A HOP" inventory now names THREE hop-producing sites (was
    two): the literal-`invoke` hop (`runInvokeEffect`), the `.theta`-callable
    code-call hop (`runToolCallEffect`'s theta-callable branch, `theta_callable_bare`),
    and the `subagent fn` callee site (`subagentCalleeError`). The stale
    FN-5-pass-through claim ("the code-side call constructs none") is removed.
    Comment-only, no behaviour change.
  - `tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts` (new) — the
    6-cell offline witness over the real `executeBody` / `createEffectfulStatementHost`
    with a `CallExpr` tail classified `theta-callable` and a `resolveCallAsInvoke`
    `InvokeChild` double: (A) child-internal cancelled (signal quiet) wraps
    `invoke_callee{inner:cancelled}` + hop; (B) caller-own pre-dispatch abort →
    bare `cancel`; (C) envelope-after-abort race (signal aborted at wrap time) →
    bare `cancelled`; (D) non-cancelled callee `code_tool` Err → general wrap +
    hop; (E) boundary-minted Err stays bare, no hop; (F) caller `match` on
    `invoke_callee` recovers.
  - `tests/live/err-note-render-record-error-field-live-cell.test.ts` (bug 0177
    live cell) — its exact-string note expectation was flipped from the pre-fix
    bare note to the SLSH-5-suffixed note (Residual 1). Pre-ratified incidental
    flip: the 0177 subject (record `kind` field → compact JSON `{"n":"x"}` at
    SNK-k) is preserved byte-exact in the note PREFIX; the fix only appends the
    spec-correct SLSH-5 suffix (` from <kid> invoked at <parent>:6`,
    slash-invocation.md:59) because the code-call leg now cascades through
    `invoke_callee`. Reconstructed deterministically in-body via `realpathSync`.
- Gates:
  - Witness: `npx vitest run tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts`
    → 6/6 green. Revert the value arm to the bare pass-through → cells A/D/F RED
    for the right reason (`expected 'cancelled'/'code_tool' to be 'invoke_callee'`;
    recovery `false`), B/C/E green; restore byte-exact (`git hash-object`
    round-trips) → 6/6 green.
  - Full offline suite: `npx vitest run` → 521 files / 9883 tests green (fork
    baseline 520/9877 + the new witness file's 6 cells; zero committed offline
    cells flipped).
  - Typecheck: `npm run typecheck` clean. Lint: `npm run lint` clean.
  - `tests/citation-symbol-form-gate.test.ts` → 3/3 green (RESIDUAL held at 415,
    not raised).
  - Live (under the cross-lane live-lock): the bug 0177 cell — the DIRECT live
    witness of the fix's Err-wrap path through `runToolCallEffect`'s theta-callable
    branch — GREEN 1/1, the reconstructed SLSH-5-suffixed note byte-matched the
    real note; the LPA "bug 0172 boundary 2" cell (the same branch's success
    value arm) GREEN 1/1.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — three findings: F1
  (0177 live-cell flip, test/blocker), F2 (ledger header stale FN-5 claim,
  house-rule/blocker), F3 (stale `:453` same-file citations + under-scoped
  `recordInvokeHop` deps doc, prose). All fixed by one `bug-fix-fixer` round.
  Round 2 (`bug-fix-reviewer-fast`) — CLEAN, no correctness/fidelity/spec
  finding; one cosmetic residual R1 (b0349 header `:453` narrative), resolved by
  an orchestrator comment-only polish (gate-diff verified, confirmation round
  skipped).
- Verification: SOLID. Obl 1 (revert → A/D/F RED for the right reason → restore
  byte-exact, hash-verified → GREEN 6/6) proven. Obl 2 (521/9883) green. Obl 3
  (end-to-end live: 0177 direct Err-wrap witness + 0172-b2 success arm both GREEN
  under the lock; a bespoke self-aborting-callee live cell is not cheap — same
  posture as 0295, which satisfied its live obligation via the 0294 live cell) —
  conclusive. Obl 4 (typecheck + lint) clean.
- Residuals:
  1. (pre-ratified incidental flip — disclosed) The bug 0177 live cell's
     exact-string note expectation was flipped from the bare note to the
     SLSH-5-suffixed note. This was NOT enumerated in premeasure — it is a
     LIVE-cell behavioural flip through the top-level note renderer, invisible to
     the offline suite and to the `tests/`-grep enumeration (which found zero
     offline flips). Subject-preservation: 0177's subject is the record-`kind`-field
     compact-JSON rendering at SNK-k, preserved byte-exact in the note prefix;
     the fix appends only the spec-correct SLSH-5 suffix. Flipped citing 0349 +
     slash-invocation.md §SLSH-5 + tool-calls.md:38; verified GREEN live under
     the lock. Adjudication valve check: (a) not triggered — 0177's subject is
     not the bare-pass-through disposition; (b) flip set = 1, under ~10; (c) no
     non-test `src/` consumer pattern-matches on bare callee-Err shapes from
     code-call results. Within the adjudication's pre-ratified incidental class.
  2. (comment-coherence, `src/`) `src/runtime/invoke-provenance-ledger.ts`'s
     module header was updated (comment-only, no behaviour) to name the third
     hop-producing site — required to keep the codebase truthful after the fix;
     no open bug owns it (0088 closed).
- Discharge notes appended: none. (Bug 0088 §Fix Residuals item 1's ledger
  exclusion for this leg is SUPERSEDED ON THE RECORD — its deferral was scope,
  not a ruling that bare surfacing is intended; recorded HERE, not by editing
  0088's closed fix record, per era-pinning.)
- Pinned dispositions / non-goals: the caller's-own pre-dispatch cancelled arm
  (`case "cancelled"`) byte-identical; the invoke seam (`runInvokeEffect`, bug
  0295) untouched; the `invoke_infra` wrap-parity on the subagent leg (bug 0347)
  untouched; no wire-format change; no spec amendment owed (the fix implements
  tool-calls.md:38/46, cancellation.md:66, error-model.md:35 as written); no new
  author-string-keyed record (0343 N/A).
