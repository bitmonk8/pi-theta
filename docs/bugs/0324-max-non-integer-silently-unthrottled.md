# Bug 0324 — a non-`integer`-typed `par for max` operand loads with zero diagnostics and the clause is silently ignored at runtime: the static sink surfaces only the `integer-narrowing` verdict and drops `incompatible`, and the runtime read substitutes the 64 throttle for any non-number value, so `max "abc"` / `max true` / `max null` / `max w` (`w: string`) / `max s["k"]` (union-typed) all fan out unthrottled against CTRL-2's "at most `max n` iterations are in flight"

- **Status:** open.
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

## Provenance

Bug-hunt area `parfor-semantics`, worktree `C:/UnitySrc/pi-theta-hunt` at
`ee681f7b` (v0.287.0). Probes: scratch vitest file driving
`parseThetaDocument` (static classes + control) and `executeBody` with a
gated `StatementEvalHost` (peak-in-flight measurement), modelled on
`tests/par-for.test.ts`; scratch file deleted after filing.
