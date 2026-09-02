# Bug 0351 — A value-position query SUCCESS binds the raw payload instead of `Ok(payload)`: `let r = @<T>`…`` then `match r { Ok(v) …, Err(e) … }` MatchError-panics on the success path, and `let v = r?` aborts through the 0019 brand guard — the author's documented Result consumption is unusable exactly when the model answered correctly

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because both documented consumption forms
  of a `let`-bound query Result abort the theta on the SUCCESS path: the
  `Ok`/`Err` `match` panics `MatchError` (the raw payload matches neither
  ctor pattern) and the deferred `?` aborts with
  `theta/runtime/internal-error` naming bug 0019's gate gap. The failure path
  binds `Err(...)` correctly (bug 0307's fix), so a theta written per
  QRY-2/QRY-8 ("both forms return a `Result`") dies precisely when the query
  succeeds, with the recovery/consumption code dead. Both query forms are
  affected (typed live-confirmed; untyped rides the identical executor
  branch). D2 because the mechanical fix is the one-line `asResultValue`
  wrap the sibling consumption route already applies, but the change flips
  the value every downstream position observes, so committed cells that bind
  a succeeding query without `?` and consume the raw value must be found and
  moved, and the CONV-6 (bug 0017) fn-boundary wrap must stay distinct.
- **Kind:** implementation defect (statement executor, checkpointed-effect
  value-position arm) — the success-half follow-on to
  [0307](./0307-value-position-query-err-aborts-body-instead-of-binding.md).
  0307's own parent adjudication (verbatim): "a query effect in ANY value
  position evaluates to a Result VALUE"; its fix repaired the failure half of
  this arm and recorded the success and `cancelled` branches unchanged. The
  success and failure branches of the one arm now disagree about whether the
  effect's outcome is a `Result`.
- **Related:**
  - [0307](./0307-value-position-query-err-aborts-body-instead-of-binding.md)
    (fixed 0.298.0) — the parent: the same arm's FAILURE half. Its
    parent adjudication reads "a query effect in ANY value position evaluates
    to a Result VALUE and never aborts at the effect site"; its fix bound
    `makeErr(error)` on the failure branch and left the success branch
    unchanged (its record: "The success branch and the `cancelled` branch are
    unchanged"). Its witnesses (W1/W2) drive FAILING queries only; no cell
    pins the succeeding query's bound shape.
  - [0316](./0316-match-scrutinee-inline-composite-ok-wrapped.md) (fixed
    0.295.0) — the mirror over-wrap: `evalAsResult` bullet 1
    forged `Ok(...)` around non-effect inline composite scrutinees. Its fix
    split the wrap by caller; the effect-scrutinee wrap (`asResultValue`,
    statement-executor.ts:1254) is the conforming contrast this report
    measures against.
  - [0019](./0019-question-operand-bypasses-result-normalisation.md) (fixed
    0.31.0) — the `?` brand guard that turns consequence 2 into a loud abort
    instead of a silent misread.
  - [0017](./0017-ok-field-object-misclassified-as-result.md) / CONV-6 — the
    fn-call-boundary implicit-`Ok` wrap; any fix must wrap the QUERY effect's
    value without re-introducing 0316's non-effect forgery. Basis note:
    CONV-6 is a plan-era REQ-ID with no surviving spec sentence (0019 §Fix,
    `docs/bugs/0019-question-operand-bypasses-result-normalisation.md:299`);
    the load-bearing spec basis for this report is `query-forms.md:11`/`:21`
    (return types) plus QRY-8 (`query-failure-and-repair.md:9`).
- **Affected** (verified at `af476df2`):
  - `src/runtime/statement-executor.ts:974–976` — `evalExpr`'s
    checkpointed-effect arm, success branch:
    `if (result.ok) { return { flow: "value", value: result.value as ThetaValue }; }`
    — no `asResultValue`/`makeOk`. The failure branch of the same arm
    (`:995`) binds `makeErr(result.error)`.
  - `src/runtime/statement-executor.ts:1253–1254` — `evalAsResult` (direct
    `?` operand / direct `match` scrutinee): `asResultValue(result.value)` —
    the conforming wrap; `asResultValue` defined at `:1266–1268`.
  - `src/runtime/effectful-statement-host.ts:271–277` (typed `value` arm:
    `{ ok: true, value: decodeInbound(outcome.value) }`) and `:296` (untyped
    `text` arm: `{ ok: true, value: outcome.text }`) — both feed the raw
    payload/string into the arm above.
- **Observed at:** v0.347.0 (`af476df2`), LIVE (H8a `tests/live/harness.ts`,
  claude-sonnet-5, prompt mode), 3 drives across 2 runs, deterministic notes.

## Symptom

Live fixture 1 (`match` consumption), `tool_loop.max_rounds: 0`:

```theta
---
mode: prompt
tool_loop:
  max_rounds: 0
---
let r = @<{ note: string }>`Set the field "note" to the lowercase word ok.`
let out = match r {
  Ok(v) => "OKARM",
  Err(e) => "ERRARM",
}
out
```

The model calls the forced respond tool with `{"note":"ok"}` (a SUCCESS).
Observed `theta-system-note` (2 independent runs, byte-identical):

```
theta /qokbind aborted: MatchError: no arm matched {"note":"ok"}
```

The rendered scrutinee is the bare object — no `Ok(…)` wrapper (category-2
rendering would print `Ok({"note":"ok"})` for a branded `Result`), so the
binding holds the raw payload.

Live fixture 2 (`?` consumption): same query, then `let v = r?` / `v.note`.
Observed:

```
theta /qbindq aborted with internal error: internal defect: '?' operand evaluated to a non-Result value (an object with keys note); the parse-time ERR-18 operand gate (theta/parse/question-on-non-result) did not reject this site — a gate gap (bug 0019)
```

## Expected

- `query-forms.md` QRY-1/QRY-2: "Return type: `Result<string, QueryError>`" /
  "`Result<Schema, QueryError>`". A `let` binding binds the expression's
  value — the `Result`.
- `query-failure-and-repair.md` QRY-8: "A query never throws. Both forms
  return a `Result`".
- Bug 0307's parent adjudication (its fix record, verbatim): "a query effect
  in ANY value position evaluates to a Result VALUE".
- Expected behaviour: `r` binds `Ok({note:"ok"})`; fixture 1 takes the `Ok`
  arm (`"OKARM"`); fixture 2 unwraps to the payload and returns `"ok"`.

## Actual / mechanism

One arm, two dispositions. `evalExpr`'s checkpointed-effect arm serves every
value position (`let` initialiser, reassignment RHS, array element, object
field, fn-call argument). On failure it binds `makeErr(error)` (bug 0307);
on success it binds `result.value` RAW (`:974–976`) — the typed payload or
the untyped string, never `Ok(...)`. The sibling route `evalAsResult`
(direct `?` operand, direct `match @`…`` scrutinee) normalises through
`asResultValue` (`:1254`), so the same query in the two spellings yields
`Ok(payload)` (direct scrutinee) vs the bare payload (`let`-bound) — the
0307/0316 two-routes-disagree shape, now on the Ok side.

Downstream, the raw payload:

1. matches no `Ok(...)`/`Err(...)` pattern → `MatchError` panic
   (fixture 1);
2. fails `evalTry`'s 0019 brand guard → `theta/runtime/internal-error`
   abort (fixture 2);
3. incidentally "works" for an author who matches the raw payload shape or
   dot-reads it directly — code that breaks the day the binding is
   consumed per the documented contract.

## Impact

Impact class 2–3 (theta aborts; author handling dead). The canonical
"bind, then branch" shape from QRY-2's own examples is unusable: the
success path panics through both documented consumption forms while the
failure path binds correctly, inverting QRY-8. Because the abort is a
panic/internal-error (not an `Err`), no `Result`-level recovery can contain
it (QRY-21 posture), and a subagent-mode theta surfaces only the abort
note.

## Reproduction

Live (~3 s per drive, H8a): plant either fixture above via
`plantThetaWorkspace` + `bootShippedExtension`, drive
`driveSlashCaptureTurn(handle, "/qokbind")`, assert the note strings above
on `systemNotes`. Observed at `af476df2` live, harness
`tests/live/harness.ts`, 3/3 drives. Offline: scripted
`StatementEvalHost.runEffect` returning `{ ok: true, value: <payload> }`
for a query effect bound by `let` and matched `Ok/Err` by the next
statement — `executeBody` aborts `MatchError` where the direct-scrutinee
control (`match @`…`` { … }`) succeeds (the 0307 W3 control's mirror).

## Fix sketch

Wrap the success branch: `value: asResultValue(result.value as ThetaValue)`
at `statement-executor.ts:974–976`, exactly mirroring `evalAsResult:1254`.
Scope it to the checkpointed-EFFECT arm only (0316's non-effect scrutinee
rule untouched). Sweep committed cells binding a succeeding query without
`?` for raw-value consumption; `decodeInbound` composition
(`effectful-statement-host.ts:273–277`) is unaffected (wrap after decode).

Constraint — position-gate the wrap: an UNCONDITIONAL `asResultValue` at
`statement-executor.ts:974–976` double-wraps terminal/`return`/par-for
positions — the arm also serves the bare-tail path, whose success is
re-wrapped by `makeOk` downstream (e.g. `statement-executor.ts:1495`), so a
bare-tail query would return `Ok(Ok(payload))`. The wrap must be gated on
`!atTerminal`, exactly like 0307's `Err` split in the same arm (the failure
branch wraps `makeErr` only when `!atTerminal`, `:994–995`); the fix must
state which shape a bare tail / ``return @`q` `` yields.
