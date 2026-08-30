# Bug 0324 — a non-`integer`-typed `par for max` operand loads with zero diagnostics and the clause is silently ignored at runtime: the static sink surfaces only the `integer-narrowing` verdict and drops `incompatible`, and the runtime read substitutes the 64 throttle for any non-number value, so `max "abc"` / `max true` / `max null` / `max w` (`w: string`) / `max s["k"]` (union-typed) all fan out unthrottled against CTRL-2's "at most `max n` iterations are in flight"

- **Status:** fixed (0.312.0).
- **Sev/Diff estimate:** S2/D2 — S2 on "silent permissive acceptance /
  author intent dropped with zero diagnostics": the author's stated width
  bound is discarded at BOTH layers (no load-time refusal, no runtime
  diagnostic, no clamp to anything derived from the operand), and the loop
  runs at the full 64-wide default the `max` clause exists to lower —
  against rate limits or resource bounds the author explicitly tried to
  set. The input class is broad: any typo or wrong-variable read that
  lands a non-integer type in the operand (`max flag`, `max name`,
  `max cfg` — all one-token mistakes). D2 because the static half is a
  one-verdict addition at an existing sink (the `incompatible` arm beside
  the handled `integer-narrowing` arm) plus a code choice; the runtime
  half is a disposition decision (diagnose vs clamp) on an existing
  branch.
- **Kind:** defect — two elements, each measured end-to-end through the
  production parser and executor at `ee681f7b`:
  1. *The rule.* `control-flow.md:72` (CTRL-2): "When the optional `max`
     clause is present, at most `max n` iterations are in flight; `n` is
     any `integer`-typed expression, evaluated once at loop entry, and
     `max` only *lowers* the in-flight width." A `string` / `boolean` /
     `null` / union-typed operand is not an `integer`-typed expression,
     so the stated operand contract excludes it; every sibling integer
     sink in the type layer refuses an incompatible operand with a
     diagnostic (and this very sink refuses the *narrowing* class:
     `max 2.5` draws `theta/parse/integer-narrowing`, measured).
  2. *The static drop.* The `par-for` arm's `max` check
     (`src/parser/type-layer-checks.ts:3144–3158`) computes
     `checkCompatible(typeOf(max), integer)` and surfaces exactly one
     verdict: `if (r === "integer-narrowing")`. The `incompatible`
     verdict falls through with no diagnostic. Measured (production
     `parseThetaDocument`, zero diagnostics each):
     `max "abc"`, `max true`, `max null`,
     `let w = "abc"` + `max w`, and
     `schema S { a: number, b: string }` + `max s["a"]` (object-index
     static type = union `number|string`, union-left decision →
     `incompatible`). Control: `max 2.5` → `integer-narrowing@1:36`.
  3. *The runtime substitution.* `evalParFor`'s width read
     (`src/runtime/statement-executor.ts:1394–1396`) is
     `typeof maxResult.value === "number" ? Math.floor(maxResult.value) :
     PAR_FOR_THROTTLE` — a non-number runtime value silently substitutes
     **64**, the no-clause default, i.e. the one value the clause cannot
     mean ("`max` only *lowers*"). Measured with a gated effect host over
     5 elements: `max "abc"` → peak in-flight 5 (unthrottled);
     `let w = true` + `max w` → peak 5; control `max 2` → peak 2.
- **Related:**
  - 0142 / 0152 (fixed) — gave `/` and `%` their correct `number` static
    type, which is what routes `max 2.5`-class operands into the
    *narrowing* verdict this sink does handle; this report is the
    remaining verdict class at the same sink.
  - 0224 (fixed) — made the identifier walk descend `par for` (so `max`
    operand identifiers resolve at all); this is the type-admissibility
    layer above it.
  - 0118 (fixed) — `max f` (a `fn` name) draws `function-as-value`; that
    refusal is value-category, not type, and does not cover these classes.
  - [0325](./0325-nan-max-zero-workers-fabricated-ok-null-array.md) — a NaN-valued `max` reaches the runtime
    width arithmetic through this bug's static admission and yields a
    fabricated all-`Ok(null)` array; distinct mechanism (zero-worker
    hole-filling), filed separately.
  - [0326](./0326-max-zero-negative-silently-raised-to-one.md) — integer-*valued* edge classes (`max 0`,
    negative) of the same clause; spec-gap posture, different branch
    (`Math.max(1, …)` floor), filed separately.
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `src/parser/type-layer-checks.ts:3141–3159` — the `par-for` arm's
    `max` sink; only the `integer-narrowing` verdict is surfaced.
  - `src/runtime/statement-executor.ts:1388–1396` — the width resolve;
    non-number → `PAR_FOR_THROTTLE` (`:1210`, 64).
  - `docs/spec_topics/control-flow.md:72` (CTRL-2) — the operand contract
    and the at-most-`n` sentence.
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, deterministic: the
  production whole-file parser (`parseThetaDocument`) for the static
  half; the production executor (`executeBody`) driven through a
  `StatementEvalHost` seam harness modelled on `tests/par-for.test.ts`
  (`ParForHost` pattern: gated `runEffect`, in-flight peak counter) for
  the runtime half.

## Summary

CTRL-2 admits "any `integer`-typed expression" as the `max` operand. The
static sink computes the compatibility verdict but surfaces only the
`integer-narrowing` arm, so every *incompatible* operand type — string,
boolean, null, and any union — loads with zero diagnostics. At runtime the
width read treats any non-number operand value as "no clause" and runs at
the 64 throttle. The two layers compose into a total drop of the author's
stated bound: `par for f in findings max flag { invoke(…) }` (a
`boolean` read where a width variable was meant) loads clean, registers,
and fans out 64-wide.

## Reproduction

Static (production parser, each loads with `[]` diagnostics):

```theta
let r = par for f in [1, 2, 3] max "abc" { f }
r
```

likewise `max true`, `max null`, `let w = "abc"` + `max w`, and:

```theta
schema S { a: number, b: string }
let s = S { a: 1, b: "x" }
let r = par for f in [1, 2, 3] max s["a"] { f }
r
```

Control: `… max 2.5 …` draws `theta/parse/integer-narrowing` (so the sink
exists and fires for the one verdict it handles).

Runtime (executor + gated effect host, 5 elements, every effect held open
on a gate; peak in-flight measured after 30 microtask ticks):

```theta
par for f in [1, 2, 3, 4, 5] max "abc" { invoke("./c.theta", f) }
```

Observed peak in-flight: **5** (unthrottled — the clause contributed
nothing). Control `max 2`: peak **2**.

## Expected behaviour

- Static: an `incompatible` verdict at the `max` sink draws a diagnostic,
  exactly as the sibling `integer-narrowing` verdict does — CTRL-2's
  operand contract ("`n` is any `integer`-typed expression",
  `control-flow.md:72`) excludes these types. (Which code — a reused
  mismatch code or a dedicated one — is a fix-time choice; the registry
  currently names no `par`-specific type code, consistent with reusing
  the narrowing precedent of reusing existing codes at this sink.)
- Runtime: with the static gate in place, a non-number value can still
  arrive through the deferred (`unknown`-verdict) path; substituting the
  *maximum* width for an unintelligible operand inverts the clause's
  only granted power ("only *lowers*"). The defensive disposition must
  not exceed what the author could have meant — fail the loop, or clamp
  DOWN (width 1), or diagnose; any of these preserves intent better than
  64.

## Actual behaviour / root cause

`src/parser/type-layer-checks.ts:3144–3158`: the verdict switch handles
`integer-narrowing` only; `incompatible` (and `unknown`, by deferral
design) fall through silently. `src/runtime/statement-executor.ts:1394–
1396`: `typeof maxResult.value === "number"` guards the whole clause; the
else-arm is `PAR_FOR_THROTTLE` (64), i.e. the clause-absent width.

## Why it matters

The `max` clause exists to bound fan-out against external limits (rate
limits, provider concurrency, local process budgets — the spec's own
example is `max 8` over review invocations, `control-flow.md:64`). This
defect turns a one-token author mistake into a 64-wide burst with zero
diagnostics at load AND at run — the highest-impact silent class in this
area short of wrong values.

## Non-goals

- The `unknown`-verdict deferral (unresolvable operand types) is the
  documented type-layer posture and is not challenged here.
- `max 0` / negative integer values are candidate 03 (spec gap, different
  branch).
- NaN reaching the width arithmetic is candidate 02 (different mechanism
  and outcome), though it enters through this bug's static admission.

## Fix

Preferred: add the `incompatible` arm at the static sink (one diagnostic
push beside the existing narrowing push, reusing the sink's established
range and message discipline), and change the runtime else-arm from
`PAR_FOR_THROTTLE` to a fail-closed disposition (panic-free: clamp to 1
with a runtime diagnostic, or carry a loop-level `Err`) so the deferred
path cannot silently maximise. Alternative: static-only fix — smaller,
but leaves the deferred path silently unthrottled. Not yet decided which
runtime disposition the spec should state; any fix must keep `unknown`
deferring and must not disturb the narrowing verdict's existing code.

## Fix (0.312.0)

- **What shipped:**
  - `src/parser/type-layer-checks.ts` — the `par-for` `max` sink gains an
    `else if (r === "incompatible")` arm beside the existing `integer-narrowing`
    push, drawing the new dedicated code `theta/parse/non-integer-max` at
    `e.max.range` with message `'par for' max operand must be integer-typed;
    got <type>` (§Fix static half). `unknown` keeps deferring; the
    `integer-narrowing` verdict's code/message are byte-unchanged.
  - `src/runtime/statement-executor.ts` — `evalParFor`'s width resolve: the
    non-`number` else-branch now clamps `width = 1` and emits the new code
    `theta/runtime/par-max-non-integer` via the runtime-diagnostic channel
    (`ExecuteBodyDeps` gains an OPTIONAL `emitDiagnostic?` so the 21 existing
    constructors are not flipped). The `typeof === "number"` guard and the
    number-branch arithmetic are byte-unchanged (NaN → 0325; max 0/negative →
    0326) (§Fix runtime half).
  - `src/extension/production-theta-producer.ts` — the real `emitDiagnostic` is
    wired into both production `executeDeps` literals (prompt + subagent).
  - `docs/spec_topics/diagnostics/code-registry-parse.md`,
    `docs/spec_topics/diagnostics/code-registry-runtime.md` — DIAG-2 registry
    rows for the two new codes (same commit).
  - `docs/reference/diagnostics.md` — mirror rows for both new codes.
  - `docs/spec_topics/control-flow.md` CTRL-2 — one sentence stating both
    dispositions (load refusal for a statically-resolvable incompatible operand;
    runtime clamp-to-1 + diagnostic for a non-`number` value via the deferred
    path).
- **Code-choice adjudication (static, in-lane):** measured — every sibling
  integer-typed sink (`checkInvokeArgTypes`, `checkFnArgCompat`,
  `checkLetRhsCompat`, `checkObjectFieldCompat`) routes its `incompatible`
  verdict through a SINK-OWNED, position-naming code. No existing code carries a
  fidelity-true message for a `par-for` `max` operand (`integer-narrowing`'s
  "cannot narrow number to integer" is false for a string/boolean/null; every
  `*-type-mismatch` names a foreign position), and DIAG-4 makes the registry
  Message normative, so reuse would ship a false message. A NEW dedicated code
  is therefore genuinely required; naming follows the clause-position type-gate
  family (`non-boolean-condition`, `non-array-iterand`).
  `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged
  (`a4a8da04209f90e13d815edd92c1fc682e2a2236`; it holds no parse/parse-crafted
  codes) and the DIAG-2 closed-set gate is green.
- **Runtime disposition — PARENT ADJUDICATION (verbatim):** within the §Fix's
  panic-free constraint set {clamp-to-1 + runtime diagnostic, loop-level Err},
  the disposition is CLAMP DOWN TO WIDTH 1 + RUNTIME DIAGNOSTIC, with a
  same-commit CTRL-2 sentence in `docs/spec_topics/control-flow.md` stating it.
  Rationale on the record: loop-level Err has no CTRL-3-compatible shape (the
  loop's value is `array<Result>`; an every-element-Err would need a new CTRL-5
  arm); clamp-to-1 is the doc's own named conservative floor satisfying CTRL-2's
  "only lowers"; the 0332/0338 loud-throw belt precedent is expressly excluded by
  the §Fix's "panic-free" qualifier. The runtime code choice followed the same
  measure-then-decide procedure: no existing runtime code carries a fidelity-true
  message (`internal-error` mislabels an intelligible spec-stated clamp), so a
  NEW code `theta/runtime/par-max-non-integer` was minted with its DIAG-2 rows.
- **Gates:** witness `npx vitest run tests/b0324-max-incompatible-static.test.ts
  tests/b0324-max-non-number-runtime.test.ts` → 10/10 green (revert-and-restore
  proved 5 static cells red as `[]` and the runtime peak red as 5 with the fix
  neutralised, byte-exact restore by `git hash-object`). Full default `npm test`
  → 488 files / 9632 tests passed. `npm run typecheck` → exit 0.
  `npm run lint` → exit 0.
- **Review:** 2 rounds. R1 (`bug-fix-reviewer`): 3 findings + 1 residual, all
  prose/spec rewords, zero behavioural/assertion change (F1 CTRL-2 sentence
  overbroad; F2 a STYLE-banned filler word in a witness comment; F3
  runtime-witness comment misstated the route; R1 rotting file count). R2 (`bug-fix-reviewer-fast`): CLEAN, no
  correctness/fidelity/spec finding.
- **Verification:** verdict pass. (1) Witnesses genuinely witness — static arm
  and runtime clamp each reverted → red for the right reason, restored
  byte-exact (`git hash-object` match). (2) Full suite green (488/9632). (3)
  Live: `tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts`
  red-proven token-free (attribution guard reds offline with the arm
  neutralised) then GREEN under the shared live lock through the real `pi -p`
  (offender `max "abc"` refuses to register → REFUSED sentinel; control `max 2`
  registers and drives 263+514=777). (4) Lint + typecheck exit 0;
  permitted-codes byte-unchanged.
- **Residuals:**
  1. **Bug doc §Reproduction union cell is stale.** The doc (filed at v0.287.0)
     lists union-typed `s["a"]` (`number|string`) as drawing the `incompatible`
     verdict. At the lane fork (v0.311.0) the object-index union verdicts
     `unknown` and DEFERS (measured: production `parseThetaDocument` returns
     `[]`; `checkCompatible` verdict `unknown`). It falls under the bug's own
     §Non-goal ("the `unknown`-verdict deferral … is not challenged here") and
     the fix leaves it deferring; the offline static witness carries it as a
     DEFERRAL control (stays `[]`), not an incompatible-drawer.
  2. **Pre-review citation-churn correction (recorded).** Phase 2 additionally
     rewrote `path:line` citation comments across 46 test files (line shifts
     from adding a field near the top of the heavily-cited `statement-executor.ts`
     / interface). No gate required this — `statement-executor.ts` is not in bug
     0134's `CONVERTED_FILES` ratchet, and the sweep was incomplete/inconsistent.
     The orchestrator restored all 46 files byte-exact to HEAD
     (`git hash-object` == `git rev-parse HEAD:<path>`) and surgically reverted
     the one citation line inside `production-theta-producer.ts`, keeping only the
     legitimate fix surface (7 files + 3 witnesses); gates re-ran green.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the `unknown`-verdict deferral is
  preserved (untouched). NaN reaching the width arithmetic stays on the number
  branch untouched — handed off to [0325](./0325-nan-max-zero-workers-fabricated-ok-null-array.md).
  The integer-valued edge classes (`max 0` / negative, `Math.max(1, …)` floor)
  are untouched — [0326](./0326-max-zero-negative-silently-raised-to-one.md).

## Provenance

Bug-hunt area `parfor-semantics`, worktree `C:/UnitySrc/pi-theta-hunt` at
`ee681f7b` (v0.287.0). Probes: scratch vitest file driving
`parseThetaDocument` (static classes + control) and `executeBody` with a
gated `StatementEvalHost` (peak-in-flight measurement), modelled on
`tests/par-for.test.ts`; scratch file deleted after filing.

## Coordination note (2026-08-30)

Bug 0325's fix widened this bug's shared runtime code
`theta/runtime/par-max-non-integer` to also cover a non-finite `number`
value (`NaN`, `±Infinity`), not only a non-`number` value: the width guard
now reads `typeof === "number" && Number.isFinite(...)`, and both the
DIAG-2 Trigger/Message rows and the CTRL-2 sentence in
`docs/spec_topics/control-flow.md` were reworded to state the widened
class. The code itself is unchanged; this bug's static half
(`theta/parse/non-integer-max`) and the integer-valued clamp arithmetic
(`Math.max`/`Math.min`/`Math.floor`) are untouched.
