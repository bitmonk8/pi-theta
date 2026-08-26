# Bug 0326 — CTRL-2 prescribes "at most `max n` iterations are in flight" and grants `max` only the power to *lower* the width, but gives `n ≤ 0` no disposition, and the runtime silently raises a zero or negative width to 1: `max 0` runs the loop 1-wide — the only operand class where the clamp increases the requested bound, with no diagnostic and no spec sentence licensing it

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because the observable divergence is
  bounded (the loop runs serially instead of refusing / not starting;
  results are correct, ordering is correct, no value is wrong) and the
  input class is an author writing or computing a non-positive width.
  The hazard is intent inversion at the margin: a computed
  `max slots` with `slots == 0` — "no capacity, admit nothing" — starts
  work anyway. D1 because the fix is one guard plus one spec sentence,
  whichever disposition is adjudicated.
- **Kind:** spec gap — the implementation and the spec fail jointly:
  1. *What the spec says.* `control-flow.md:72` (CTRL-2): "When the
     optional `max` clause is present, at most `max n` iterations are in
     flight" and "`max` only *lowers* the in-flight width." Both clauses
     are violated for `n = 0` as implemented: 1 iteration in flight
     exceeds "at most 0", and 1 > 0 is a raise, not a lowering. The
     clamp's other direction IS documented ("a `max` value exceeding the
     throttle clamps to it", same line; restated at
     `docs/reference/hard-ceilings.md:119` §`par for` width throttle) —
     the upward clamp at 1 appears in no spec or reference sentence.
  2. *What the spec fails to say.* No sentence gives `max 0` or a
     negative operand any disposition: not a load-time refusal (the
     operand contract is type-only — "any `integer`-typed expression"),
     not a runtime diagnostic, not a documented clamp. The class is
     statically admissible and reachable (a literal `0`, a negative
     literal, or any computed integer).
  3. *What the implementation does.* `src/runtime/statement-executor.ts:
     1396` — `width = Math.max(1, Math.min(requested, PAR_FOR_THROTTLE))`
     silently floors at 1. Measured: `max 0` and `max 0 - 3` over 5
     gated elements → peak in-flight exactly **1**, loop completes with
     the full 5-element result array; zero diagnostics at load and run.
- **Related:**
  - [0324](./0324-max-non-integer-silently-unthrottled.md) — the same clause's non-integer-*typed*
    classes (different branch: the `typeof` guard, substituting 64);
    this report is the integer-typed value-domain edge (the
    `Math.max(1, …)` floor, substituting 1). A joint adjudication of
    "what does an uninterpretable / degenerate width mean" would settle
    both.
  - [0325](./0325-nan-max-zero-workers-fabricated-ok-null-array.md) — NaN evades this same floor; fixing this
    gap with a value-domain check would fence NaN as a side effect if
    written as `requested >= 1` rejection rather than `Math.max`.
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `docs/spec_topics/control-flow.md:72` (CTRL-2) — at-most-`n` and
    only-lowers sentences; no `n ≤ 0` disposition.
  - `docs/reference/hard-ceilings.md:119–135` — documents the 64-clamp
    direction only.
  - `src/runtime/statement-executor.ts:1396` — the silent ≥1 floor.
  - `src/parser/type-layer-checks.ts:3141–3159` — the static sink checks
    type only (correctly, per the current spec text): no value-domain
    check for literal `0` / negative literals.
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, deterministic:
  production `parseThetaDocument` (zero diagnostics for `max 0`,
  `max -3`, `max 0 - 3`) + production `executeBody` with a gated
  `StatementEvalHost` (peak-in-flight measurement, 5 elements).

## Summary

`max 0` loads clean (it is an `integer`-typed expression), and at runtime
the width clamp raises it to 1. The author's stated bound — the one thing
CTRL-2 says `max` provides ("at most `max n` in flight") — is exceeded by
the implementation for exactly the non-positive value class, silently, in
the one direction the spec forbids ("only *lowers*"). Neither the spec
nor the reference documents any disposition for the class.

## Reproduction

Static (production parser): `let r = par for f in [1, 2, 3] max 0 { f }`
→ diagnostics `[]`; same for `max -3` and `max 0 - 3`.

Runtime (gated effect host, 5 elements, all effects held open; peak
in-flight sampled after 30 microtask ticks, then released):

```theta
par for f in [1, 2, 3, 4, 5] max 0 { invoke("./c.theta", f) }
```

Observed: peak in-flight **1**; after release the loop completes with all
5 `Ok` elements. `max 0 - 3`: peak **1**. Control `max 2`: peak **2**.
No diagnostic, note, or event distinguishes the `max 0` run from a
`max 1` run.

## Expected behaviour

One of (adjudication needed — the gap is that no rule picks one):
- **Refuse statically**: a non-positive *literal* operand draws a
  load-time diagnostic (cheap, but leaves computed widths to a runtime
  rule anyway);
- **Refuse at runtime**: `n ≤ 0` is a loop-level error (fail-closed
  reading of "at most 0 in flight" — the loop cannot legally complete
  unless the iterand is empty);
- **Define the clamp**: spec text states `max n` with `n < 1` clamps to
  1 (legalising the implementation) — the weakest option, since it
  codifies exceeding the author's stated bound and inverts a computed
  "zero capacity" into "serial execution".

Any fix must state the disposition in CTRL-2 (and mirror it in
`hard-ceilings.md`'s throttle section, which currently documents only
the upper clamp) so spec and implementation stop disagreeing about which
directions the clamp may move.

## Actual behaviour / root cause

`statement-executor.ts:1396` applies `Math.max(1, …)` unconditionally.
The floor exists to keep the worker pool alive (a zero-width pool would
strand the loop's promise: zero workers claim no index, yet — per
candidate 02 — the loop would *complete with fabricated values*, not
hang, which is worse). The implementation choice is defensible as
engineering; the divergence is that it is undocumented and contradicts
both quoted CTRL-2 clauses for the class.

## Why it matters

Computed widths make `0` an ordinary runtime value: `max free_slots`,
`max budget - used`, `max cfg.parallelism`. Each reaches 0 in normal
operation precisely when the author means "admit no work now"; the
runtime instead admits work serially with no signal. The at-most
guarantee is the clause's entire contract; an undocumented class where
the guarantee is silently broken is a trap on the clause's main use.

## Non-goals

- Non-integer-typed operands (candidate 01) and NaN (candidate 02) are
  filed separately; this report is confined to integer-typed,
  non-positive values.
- No claim that width-1 execution corrupts results — ordering (CTRL-3)
  and values were observed correct; the divergence is the admitted
  concurrency exceeding the stated bound.

## Fix

Not yet decided among the three dispositions above. Constraints any fix
must satisfy: computed operands must be covered (a static-literal-only
rule is insufficient); the disposition must be stated in CTRL-2 and
mirrored in `hard-ceilings.md`; and the chosen guard should be written
as a value-domain test (`requested >= 1`) rather than `Math.max`, which
would also fence candidate 02's NaN evasion at the same line.

## Provenance

Bug-hunt area `parfor-semantics`, worktree `C:/UnitySrc/pi-theta-hunt` at
`ee681f7b` (v0.287.0). Probes: scratch vitest file, production parser +
executor, gated seam host per `tests/par-for.test.ts`; scratch file
deleted after filing.
