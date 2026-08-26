# Bug 0325 — a NaN-valued `par for max` operand yields `width = NaN`, which evades the `Math.max(1, …)` floor and spawns ZERO workers, and the join's `results[index] ?? makeOk(null)` hole-filler then fabricates a full `array<Result>` of `Ok(null)` — the loop returns one `Ok(null)` per input element with the body never executed once and zero diagnostics anywhere

- **Status:** open.
- **Sev/Diff estimate:** S2/D1 — S2 on "silent wrong values": the loop's
  entire value is fabricated (every element reports success with `null`
  where the body's computed result belongs), the body's effects — the
  work the loop exists to do — never dispatch, and nothing at load time,
  run time, or in the value itself marks the fabrication; a consumer
  `match`ing elements sees `Ok` and proceeds. Not S1 only because the
  currently-demonstrated route in runs through candidate 01's static
  admission, so the class needs a non-integer-typed operand landing NaN.
  D1 because both mechanism lines are single-expression fixes
  (`Number.isFinite` guard on the width; drop the `??` hole-filler in
  favour of a loud invariant failure).
- **Kind:** defect — the fabrication mechanism is implementation-only;
  three elements, measured end-to-end at `ee681f7b`:
  1. *The rules.* `control-flow.md:74` (CTRL-3): "The value is
     `array<Result<T, QueryError>>` … element `i` corresponds to input
     element `i`" — each element is the *outcome of iteration `i`*, and
     CTRL-5 enumerates the closed ways an element becomes `Err`;
     "iteration never ran at all, loop completed anyway" is on no arm of
     either rule. `control-flow.md:72` (CTRL-2): "`max` only *lowers* the
     in-flight width" — lowering below every iteration while still
     completing with a full value satisfies no reading.
  2. *The width arithmetic.* `src/runtime/statement-executor.ts:1394–
     1396`: `Math.floor(NaN)` = NaN; `Math.max(1, Math.min(NaN, 64))` =
     NaN — the `Math.max(1, …)` floor, whose purpose is exactly to keep
     at least one worker alive, is NaN-evaded. `:1446`
     `Math.min(NaN, n)` = NaN; the spawn loop `for (i = 0; i < NaN; …)`
     runs zero times; `Promise.all([])` resolves immediately.
  3. *The hole-filler.* `:1478` `collected[index] = results[index] ??
     makeOk(null)` converts every never-written slot into `Ok(null)`.
     With zero workers, that is ALL slots: the loop yields
     `[Ok(null), …]` of full input length.
  4. *Reachability at this HEAD.* Through candidate 01's dropped
     `incompatible` verdict: a two-field schema's object-index reads as
     the union of field types (`expressions.md:10`), the union is
     `incompatible` with `integer`, the sink drops the verdict, and the
     program loads with zero diagnostics; the field value is NaN via
     `1 % 0`, which is a legal runtime *value*, not a panic —
     `expressions.md:232` ("because `NaN` is a `number`, an
     `integer % 0` result widens to `number`"; post-0152 typing) and the
     `NaN == NaN` refinement (`expressions.md:57`) both treat NaN as a
     first-class number.
- **Related:**
  - [0324](./0324-max-non-integer-silently-unthrottled.md) — supplies the demonstrated static admission
    route; fixing 01 alone does NOT retire this report (next bullet).
  - Independent residual: the `?? makeOk(null)` join (`:1478`) masks ANY
    future under-spawn or index-claim defect as a successful loop —
    it converts a broken scheduling invariant ("every index was claimed
    and written") into fabricated successes instead of a loud failure.
    The invariant is otherwise airtight today (synchronous index
    claiming, workers drain to `n`), which is exactly why the filler is
    dead code on every healthy path and only ever executes when
    something is already wrong.
  - 0152 (fixed) — established `1 % 0`'s `number` typing and NaN-value
    (non-panic) runtime semantics this reproduction leans on.
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `src/runtime/statement-executor.ts:1394–1396` — width arithmetic,
    NaN-permeable.
  - `src/runtime/statement-executor.ts:1446` — `workerCount` inherits
    NaN; zero spawns.
  - `src/runtime/statement-executor.ts:1476–1479` — the `?? makeOk(null)`
    fabrication at the CTRL-3 join.
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, deterministic:
  production `parseThetaDocument` (zero diagnostics) + production
  `executeBody` over a `StatementEvalHost` seam harness
  (`tests/par-for.test.ts` pattern) whose pure evaluator implements the
  documented scalar semantics (`%` by zero → NaN) and whose `runEffect`
  records dispatches.

## Summary

A `max` operand evaluating NaN turns the worker-pool size into NaN. Zero
workers spawn, `Promise.all([])` settles at once, and the join back-fills
every result slot with `Ok(null)`. The loop reports complete success —
one `Ok(null)` per input element — while none of the body's effects ever
dispatched. At this HEAD the input class is spec-legal source that loads
with zero diagnostics.

## Reproduction

```theta
schema S { a: number, b: string }
let s = S { a: 1 % 0, b: "x" }
let r = par for f in [1, 2, 3] max s["a"] { invoke("./c.theta", f) }
r
```

- Production parse: diagnostics `[]` (the union-typed `s["a"]` operand is
  `incompatible` with `integer` and the sink drops that verdict —
  candidate 01).
- Execution (effect host recording every `runEffect` dispatch):
  - final value: `[Ok(null), Ok(null), Ok(null)]` (all three elements
    `isResultValue`, all `ok: true`, all `value: null`);
  - effects dispatched: **none** (`started` log empty);
  - no panic, no loop-level `Err`, no diagnostic, no system note.

Mechanism confirmation (arithmetic, no harness needed):
`Math.max(1, Math.min(Math.floor(NaN), 64))` → NaN;
`Math.min(NaN, 3)` → NaN; `0 < NaN` → false.

## Expected behaviour

CTRL-3's element-`i`-is-iteration-`i` correspondence
(`control-flow.md:74`) makes each element the outcome of a *run*
iteration; CTRL-5 closes the `Err` arms (body `Err`, `?` propagation,
per-element cancellation, ERR-20 panic downgrade). A width the runtime
cannot interpret must not complete the loop with fabricated outcomes:
admissible dispositions are a loud failure (loop-level `Err` /
`internal-error`-class panic naming the width), or — if the width
arithmetic is hardened first — never reaching a non-finite width at all.
A full-success value with zero iterations run is prescribed by nothing.

## Actual behaviour / root cause

Two independent lines compose:
1. `statement-executor.ts:1394–1396` — the width clamp uses
   `Math.max`/`Math.min`, both of which propagate NaN, so the ≥1 floor
   holds for every number EXCEPT the one class that needs it most.
2. `statement-executor.ts:1478` — the join treats an unwritten slot as
   `Ok(null)` instead of an invariant violation. With NaN width every
   slot is unwritten; the fabrication is total and shape-perfect
   (correct length, correct `Result` envelopes), so downstream consumers
   have no signal.

## Why it matters

This is the area's worst observable class: the loop *lies about having
done the work*. A review fan-out returns "all clean" (`Ok(null)` per
finding) having reviewed nothing; a write fan-out reports success having
written nothing. Because the value is shape-correct, even a defensive
consumer checking `isResultValue`/`ok` per element proceeds on the
fabrication.

## Non-goals

- The static admission of the union-typed operand is candidate 01; this
  report stands on the runtime mechanism and would remain (as the
  `??`-masking residual and the NaN-permeable clamp) after 01 is fixed.
- `Infinity` is not in this class: `Math.min(Infinity, 64)` = 64, so an
  Infinity-valued max runs at the throttle (candidate 01's silent-ignore
  class, not zero workers).
- No claim about `for` (sequential): it has no width arithmetic.

## Fix

Preferred, both lines:
1. Guard the width: `Number.isFinite(requested)` (or
   `Number.isInteger`) before the clamp; non-finite → the same
   disposition chosen for candidate 01's runtime arm (fail loudly or
   clamp to 1 with a diagnostic).
2. Replace `results[index] ?? makeOk(null)` with an invariant check
   that fails loudly (an `internal-error`-class throw naming the index),
   so any future scheduling defect surfaces instead of fabricating
   successes. Tradeoff: none on healthy paths — the filler is
   unreachable when the pool invariant holds, which is precisely why it
   should not exist as a value-producing arm.

## Provenance

Bug-hunt area `parfor-semantics`, worktree `C:/UnitySrc/pi-theta-hunt` at
`ee681f7b` (v0.287.0). Probe: scratch vitest file (production parser +
executor, seam host per `tests/par-for.test.ts`); scratch file deleted
after filing.
