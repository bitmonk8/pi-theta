# Bug 0307 — A value-position query failure (`let r = @`…``, no `?`) aborts the whole theta body at the bind site instead of binding `Err(QueryError)`: the author's downstream `match r` handler is dead code, the theta terminates with the raw error, and the same `runQueryEffect` path binds `empty_template` errors as values while aborting on every other `QueryError`

- **Status:** fixed (0.298.0).
- **Sev/Diff estimate:** S1/D2 — S1 because a spec-legal error-handling shape
  (`let r = @`…`` then `match r { Err(…) => recover }`) is silently defeated on
  every query failure class: the recovery arm never runs, the theta aborts with
  the raw `QueryError`, and nothing at load or parse warns the author. D2
  because the mechanism is one dispatch asymmetry between `evalExpr`'s effect
  arm and `evalAsResult`, but the fix needs an adjudication of where
  handledness is judged (error-model.md:10) and touches the executor's
  terminal-outcome accounting (STL-6 pins the bare-tail case as `fail`).
- **Kind:** implementation defect (runtime executor / query effect dispatch),
  with one spec-side ambiguity to adjudicate (when "consumed by a caller
  `match`" is decided).

## Symptom

A theta that binds a query result to a named `let` and handles the `Err` one
statement later never reaches its handler when the query fails. Live
(prompt mode, probe harness, claude-sonnet-5):

```theta
---
description: tlxzero
mode: prompt
tools: read
tool_loop:
  max_rounds: 0
---
let r = @`ZERO-CAP-PROBE what is 2 plus 2?`
let d = match r {
  Err(QueryError { kind: "tool_loop_exhausted", rounds, last_tool_name, raw_response }) => "EXH …",
  Err(e) => "OTHER…",
  Ok(_) => "OKGOT"
}
let _ = read({ path: "PROBE-….txt" })
d
```

loads clean, registers, and the drive settles with

```
theta /tlxzero returned Err: tool-call loop exhausted after 0 rounds (last tool: respond)
```

on the `theta-system-note` channel — the SLSH-3 top-level `Err` framing. The
`match` never ran (no arm value was produced), the code-side `read` after it
never dispatched, and the tail `d` never evaluated. The same shape with
`tool_loop.max_rounds: 1` against a ≥ 3-round read chain aborts identically
(`… exhausted after 1 rounds (last tool: read)`). Observed at HEAD `bc52da38`
live, probe harness (`tests/live/hardening/probe-harness.ts`), 2 runs each.

## Expected

- `query-failure-and-repair.md:9` (QRY-8): "A query never throws. Both forms
  return a `Result` … carrying a `QueryError` on failure."
- `errors-and-results/error-model.md:10`: an `Err`-class ceiling breach
  reaches the *fail* arm "only when the resulting `Err` is unhandled —
  propagated via `?` or returned, **not consumed by a caller `match`** and not
  discarded via `let _ = …`". The fixture's `Err` is consumed by a `match` one
  statement later; it is not propagated, returned, or discarded.
- `runQueryEffect`'s own `empty_template` arm implements exactly this reading
  for one variant (src/runtime/effectful-statement-host.ts:246–255): "``let r
  = @`\n` `` must bind `r` to that `Err` (a `match`/`?` then observes it) and
  the theta continues", returning `{ ok: true, value: makeErr(…) }`.

Expected behaviour: `r` binds `Err(ToolLoopExhaustedError{…})`, the `match`
takes its `Err` arm, the theta continues and succeeds.

## Actual

The body terminates at the `let` with the query's error as the theta's
terminal `Err`. Offline pin over the shared executor (same code path,
scripted host):

- `let r = <query effect failing with tool_loop_exhausted>` then
  `match r { Ok(_) => "OKGOT", Err(_) => "HANDLED" }` →
  `executeBody` outcome `fail`, error = the `ToolLoopExhaustedError`, no final
  value. The match never dispatches.
- Control (proves the assertion can green): the identical failing effect with
  the query **directly** as the match scrutinee
  (`match @`…`` { … }`) → outcome `success`, value `"HANDLED"`.

## Mechanism

Two consumption routes disagree about a failed query effect:

- `evalAsResult` (src/runtime/statement-executor.ts:1014–1092) — serves ONLY
  a direct `?` operand and a direct `match` scrutinee — lowers a non-cancel
  effect failure to a bound value: `{ flow: "value", value:
  makeErr(result.error) }` (`:1091`).
- `evalExpr`'s effect arm (src/runtime/statement-executor.ts:842–858) — serves
  every other value position: `let` initialiser (`case "let"`, `:1510`),
  reassignment RHS, `return` operand, fn-call argument, array element, object
  field — lowers the same failure to `{ flow: "fail", error }` (`:858`),
  which `terminalFlow` turns into the body's terminal `Err`.

`runQueryEffect` (src/runtime/effectful-statement-host.ts) feeds that arm
`{ ok: false, error }` for `tool_loop_exhausted` (`:291–292`), `transport`
(`:296`, and `:282` typed), and typed `validation`/`propagated` (`:277`) —
but `{ ok: true, value: makeErr(…) }` for `empty_template` (`:254`). So the
disposition of `let r = @…` on failure depends on WHICH `QueryError` variant
fired: `empty_template` binds; every other variant aborts the theta. Code-side
tool-call failures (`Err(CodeToolError)`) and invoke failures ride `ok: true`
as `Result` values and bind fine — queries are the only effect class with the
aborting arm.

The `flow: "fail"` comment (`:853–857`) frames the input as "an unhandled
non-cancel effect `Err` … in tail/statement position, no `?`, not caught by a
`match`" — the shape STL-6 pins (tests/statement-executor.test.ts:841–888).
A `let`-bound initialiser is not that shape: the binding exists precisely to
consume the `Result` later, and no parse diagnostic distinguishes the two
(QRY-19 rejects only the bare expression-statement; plain `let r = @…` loads
with zero diagnostics).

## Impact

Every spec-legal split of "query, then branch on the result" — including
computing with the `Err` fields (ERR-19 `rounds`/`last_tool_name`), retry
wrappers that inspect the error before re-querying, and any `match` over a
binding rather than over the query expression itself — silently loses its
error path. The theta aborts with the raw `QueryError` where the author wrote
recovery. Impact class: wrong outcome delivered (the author's handling code is
dead; only the note channel reveals it, with no hint the handler was skipped).

## Reproduction

Live: probe-harness fixture above (`max_rounds: 0` variant needs zero provider
turns for the failing query; the drive settles in ~300 ms). Offline: scripted
`StatementEvalHost` returning `{ ok: false, error:
ToolLoopExhaustedError }` for a query effect bound by `let` and matched by the
next statement; assert `executeBody(...)` outcome — observed `fail` carrying
`{"kind":"tool_loop_exhausted","message":"tool-call loop exhausted after 0
rounds","rounds":0,"last_tool_name":null,"raw_response":null}` where the
direct-scrutinee control yields `success`/`"HANDLED"`.

Live-confirmed: yes (2 fixtures × 2 runs, deterministic; the `max_rounds: 1`
variant additionally burns one real tool round before aborting).

## Related

- Bug 0012 — mid-abort classification on the same untyped path (different
  terminal-outcome defect, same effect arm).
- Bug 0019 — `?`-operand normalisation (the sibling consumption route this
  report's control uses).
- Bug 0316 — `evalAsResult` bullet-1's forged-`Ok` wrap on inline
  composite `match` scrutinees (same shared normaliser, disjoint arm:
  non-effect bullet-1 vs this report's checkpointed-effect arm).
- STL-6 (tests/statement-executor.test.ts:841) — the bare-tail pin the fix
  must not regress.
- error-model.md:10 — the handledness definition the fix should adjudicate
  (bind-then-match vs judge-at-effect).

## Fix (0.298.0)

- **Parent adjudication (verbatim):** handledness is judged AT CONSUMPTION per
  QRY-8's letter — a query effect in ANY value position evaluates to a Result
  VALUE and never aborts at the effect site; the fail arm fires only for
  UNHANDLED errors per error-model.md:10; the STL-6 bare-tail pin is PRESERVED
  (a bare tail `@`...`` whose Err reaches the return IS returned = unhandled =
  fail); cancellation still aborts; empty_template parity made UNIFORM across
  all QueryError variants; if error-model.md:10 needs a consumption-time
  clarifying sentence, it lands SAME COMMIT with docs/reference mirrors checked.
- **What shipped:**
  - `src/runtime/statement-executor.ts` — `evalExpr` gains a fourth param
    `atTerminal = false`; its checkpointed-effect arm now disposes a non-cancel
    failure by consumption-time position — a value position (`!atTerminal`)
    binds `{ flow: "value", value: makeErr(error) }` so a downstream `match`/`?`
    observes it, while a terminal/returning/discarding position keeps the
    `{ flow: "fail", error }` flow. `atTerminal=true` is set at the six terminal
    sites (`executeBlock` tail; `executeStatement` `expr`/`tool-call`/`query`/
    `invoke`/`return`) and forwarded through the position-carrying pass-throughs
    (`evalExpr` `match` → `evalMatch` arm body; `evalExpr` `ternary` taken
    branch). `let`/`reassign`/composite/operator sub-positions default `false`
    (value = bind). The success branch and the `cancelled` branch are unchanged;
    `evalAsResult` is byte-unchanged (the b0316 effect-scrutinee lock).
  - `src/runtime/effectful-statement-host.ts` — `runQueryEffect`'s
    `empty_template` arm rides `{ ok: false, error }` uniform with every other
    non-cancel `QueryError` variant (was the lone `{ ok: true, value: makeErr }`
    special case), so its disposition is position-driven, not per-variant.
  - `tests/b0307-value-position-query-err-binds.test.ts` (new) — executor
    witnesses over scripted-double `executeBody`: W1 (`let r = @`q``(fail) then
    `match r` → success/"HANDLED"), W2 (`let r = [@`q`]`(fail) → bound
    `[Err]`), and W3 guards (bare tail → fail; `return` → fail; direct
    `match @`q`` scrutinee → success).
  - `tests/b0307-empty-template-parity.test.ts` (new) — PART-2 parity over the
    real `createEffectfulStatementHost` with `renderedText:""`: bare-tail empty
    query → fail (uniform), value-position `let r`+`match` → bound/success.
  - `tests/live/acceptance/b0307live-value-position-query-err-binds.test.ts`
    (new, H9a) — end-to-end through real `pi -p`: an inner theta's
    value-position query fails with `tool_loop_exhausted` (`tool_loop.max_rounds:
    0`), the fix binds the Err, the in-body `match` recovers 42,
    `invoke<integer>` carries it, the probe drives `42 + 100` → stdout `142`.
  - `tests/b0316-…test.ts`, `tests/b0318-…test.ts` — comment-only citation
    line-number bumps for the `statement-executor.ts` lines this diff shifted.
- **Gates:** witness `npx vitest run tests/b0307-value-position-query-err-binds.test.ts
  tests/b0307-empty-template-parity.test.ts` → 7/7 green (W1/W2/W4-bare-tail flip
  green; W3 guards + W4 bind companion green); neutralise-and-restore proves
  W1/W2/W4-bare-tail red with the fix reverted (byte-exact restore, `git
  hash-object` before == after). Full default suite `npm test` → 476 files /
  9531 tests passed / 0 failed. `npm run typecheck` clean; `npm run lint` clean.
- **Review:** 1 round. R1 (`bug-fix-reviewer`): CLEAN — no correctness/fidelity/
  spec/house-rule/test/prose blocker; four non-blocking residuals (0.298.0
  placeholder is lane-correct; commit artifacts are the parent's; pre-existing
  third-party citation drift; live re-confirm owed to the orchestrator).
  `evalAsResult` confirmed byte-untouched; no landed test cell flipped.
- **Verification (`bug-fix-verifier`: SOLID):** (1) witness bidirectional —
  reverting the `!atTerminal` bind branch + the empty_template `ok:true` reds
  exactly W1/W2/W4-bare-tail, restore byte-exact (`git hash-object` matched),
  all 7 green; (2) full suite 9531 green, no landed cell flipped (STL-6,
  line-572, b0316 effect control 111 re-run green); (3) live cell run by the
  orchestrator under the cross-worktree lock → 1/1 passed (stdout `142`, sound
  discriminator), verifier confirmed the cell well-formed; (4) `typecheck` /
  `lint` clean.
- **Residuals:** none introduced by this fix. (Non-blocking, pre-existing:
  many `tests/**` files carry stale `statement-executor.ts:N` line citations
  that predate this fix — decay/ratchet per docs/STYLE.md; not owed here.)
- **Discharge notes appended:** none (no sibling bug doc required a coordination
  note; STL-6, b0316 effect control, 0295/0319 cancellation, 0298/0332 all
  preserved unchanged and are green in the default suite).
- **Pinned dispositions / non-goals:** error-model.md:10 needs NO clarifying
  sentence — its existing "only when the resulting `Err` is unhandled —
  propagated via `?` or returned, not consumed by a caller `match` and not
  discarded via `let _`" clause already covers value-position binding (a
  let-bound value is neither returned nor `?`-propagated), so no doc/reference
  mirror change was made. A `return @`q``/bare-tail `@`q`` Err stays `fail`
  (terminal = returned = unhandled). A non-effect Err VALUE at the tail (e.g.
  `let x = Err(e); x`) remains a `success` with final value `Err` — unchanged;
  the fix scopes only the checkpointed-effect disposition.
