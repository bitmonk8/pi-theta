# Bug 0307 — A value-position query failure (`let r = @`…``, no `?`) aborts the whole theta body at the bind site instead of binding `Err(QueryError)`: the author's downstream `match r` handler is dead code, the theta terminates with the raw error, and the same `runQueryEffect` path binds `empty_template` errors as values while aborting on every other `QueryError`

- **Status:** open (candidate; found in bug-hunt at HEAD `bc52da38`, v0.287.0).
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
