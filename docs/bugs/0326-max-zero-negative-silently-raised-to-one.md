# Bug 0326 — CTRL-2 prescribes "at most `max n` iterations are in flight" and grants `max` only the power to *lower* the width, but gives `n ≤ 0` no disposition, and the runtime silently raises a zero or negative width to 1: `max 0` runs the loop 1-wide — the only operand class where the clamp increases the requested bound, with no diagnostic and no spec sentence licensing it

- **Status:** fixed (0.343.0).
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
  - `src/runtime/statement-executor.ts:1581` — the silent ≥1 floor.
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

`statement-executor.ts:1581` applies `Math.max(1, …)` unconditionally.
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

## Fix (0.343.0)

- **Disposition — PARENT ADJUDICATION (verbatim):** DEFINE-THE-CLAMP WITH A
  DIAGNOSTIC — the doc's option 3 hardened by the landed sibling law: 0324
  (non-number) and 0325 (non-finite) both clamp to 1 AND emit a runtime
  diagnostic through the `emitDiagnostic` channel; a runtime REFUSAL for n ≤ 0
  (the doc's option 2) would fork the degenerate-width taxonomy (NaN clamps but
  0 refuses is incoherent), and the doc's "weakest option" objection was written
  before the siblings landed the clamp+diagnose pattern — the trap was the
  SILENCE, which the diagnostic removes. Implemented as a VALUE-DOMAIN test at
  the width resolve on the already-finite number branch (after 0325's guard): if
  the floored value < 1 → width = 1 + emit diagnostic; the `Math.max` floor
  remains as belt on the ≥ 1 arm. Computed operands covered by construction (the
  test is at runtime on the resolved value). CODE CHOICE: the existing
  `theta/runtime/par-max-non-integer` row is DIAG-4-FALSE for this class (0 IS a
  finite number and an integer — both its name and its message lie here), so the
  DEDICATED sibling code `theta/runtime/par-max-non-positive` was minted (name
  per the clause-position family; message fidelity-true across {0, negatives}).
  STATIC HALF: NONE — the type gate stays type-only per 0324's landed split (a
  value-domain static rule cannot cover computed operands and the corpus has no
  value-domain static precedent at this sink); the omission is recorded.
- **What shipped:**
  - `src/runtime/statement-executor.ts` — `evalParFor`'s width resolve: the
    finite-`number` branch splits on the value domain — `if (requested < 1)`
    (`requested = Math.floor(maxResult.value)`) clamps `width = 1` and emits the
    new code `theta/runtime/par-max-non-positive` (message `'par for' max
    operand must be at least 1; in-flight width clamped to 1`) via the existing
    optional `deps.emitDiagnostic?.()` channel; the `>= 1` else-arm keeps the
    unchanged `Math.max(1, Math.min(requested, PAR_FOR_THROTTLE))` belt. The
    non-finite / non-`number` else-branch (0324/0325 `par-max-non-integer`) is
    byte-untouched. The width-resolve block-header comment was reconciled to name
    the UP-clamp exception (§Fix runtime half).
  - `docs/spec_topics/diagnostics/code-registry-runtime.md`,
    `docs/reference/diagnostics.md` — DIAG-2 registry row + mirror for the new
    code (Trigger: a finite `number` value whose floor is below 1, distinct from
    `par-max-non-integer`'s non-finite/non-`number` class).
  - `docs/spec_topics/control-flow.md` CTRL-2 — reconciles the "only *lowers*"
    clause (names the sub-1 floor as the single documented exception) and adds
    the n < 1 sentence naming `theta/runtime/par-max-non-positive`, firing
    whenever the resolved width is below 1 regardless of iterand emptiness.
  - `docs/reference/hard-ceilings.md` — `par for` width-throttle section mirrors
    the floor direction (UP-clamp to 1) beside the existing 64 upper-clamp.
  - `docs/how-to/fan-out-in-parallel.md` — the `max` bullet's unqualified "only
    *lowers*" claim reconciled with the same exception (review F1: this fix is
    the only clamp direction that RAISES the bound, so 0324/0325 correctly left
    this guide untouched while this fix must amend it).
  - `tests/b0326-max-non-positive-runtime.test.ts` — 8-cell offline witness
    (production `parseThetaDocument` + `executeBody` over a gated
    `StatementEvalHost`): A `max 0`, B computed `max 0 - 3`, H empty-iterand +
    `max 0` are the RED-at-fork witnesses (peak 1 + `par-max-non-positive`
    emitted once + pinned message); C `max 2`, D `max 1` boundary (proves `< 1`
    not `<= 1`), E non-number→`par-max-non-integer`, F NaN→`par-max-non-integer`,
    G `max 0` loads clean are controls.
- **Gates:** witness `npx vitest run tests/b0326-max-non-positive-runtime.test.ts`
  → 8/8 green (revert-and-restore proved cells A/B/H red as absent-diagnostic
  with the `< 1` branch neutralised, controls green, byte-exact restore by
  `git diff`). Full default `npm test` → 525 files / 9914 tests passed (fork
  524/9906; +1 witness file / +8 cells, zero flips). `npm run typecheck` →
  exit 0. `npm run lint` → exit 0. `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged (`a4a8da04209f90e13d815edd92c1fc682e2a2236`; runtime codes are
  not members — 0324's two-code precedent held).
- **Review:** 2 rounds. R1 (`bug-fix-reviewer`): 2 findings + 2 residuals, all
  documentation-coherence, zero correctness/fidelity/test — F1 (how-to `only
  lowers` unqualified), F2 (width-resolve block-header comment unqualified), R1
  (pre-existing 0325 `emitDiagnostic` doc-comment drift — left as residual), R2
  (new-row Trigger said "finite integer" but the code catches finite-number
  flooring below 1). R1's F1/F2 + R2 fixed by one `bug-fix-fixer` round
  (comment + doc prose only, zero executable line). R2 (`bug-fix-reviewer-fast`,
  confirmation): CLEAN, no findings, no escalation.
- **Verification:** verdict SOLID. (1) Witness genuinely witnesses — the `< 1`
  branch reverted → A/B/H red for the right reason (absent diagnostic), controls
  green; restored byte-exact; 8/8 green. (2) Full suite 525/9914 green, b0324/
  b0325 fences among passing. (3) Live: bespoke `< 1` cell NOT owed — census
  found no live cell pins par-for WIDTH behaviour and the new diagnostic is
  offline-observable through the in-process `emitDiagnostic` channel; the
  designated max-family coverage
  `tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts` was run
  by the orchestrator under the shared live lock → 1/1 GREEN through real
  `pi -p` (registration + legal-width `max 2` drive unchanged), mirroring the
  0324/0325 disposition. (4) lint + typecheck exit 0; permitted-codes
  byte-unchanged.
- **Bounded self-authorizations (recorded):**
  1. **Witness typecheck narrowing.** The Phase-1 helper `okCount(value:
     ThetaValue)` was called with `exec.result.value` (typed `ThetaValue |
     undefined` per `FunctionResult`), reddening `npm run typecheck`. Widened the
     parameter to `ThetaValue | undefined` — TYPE-ONLY (annotations erase at
     runtime), the existing non-array guard already maps `undefined` to the `-1`
     sentinel, so zero assertion / zero behaviour change; the `.toBe(5)`
     assertions are unaffected. Bound: one file, one signature line. STOP valve
     honoured (no cell red, no further typecheck error).
  2. **F1 doc scope extension.** `docs/how-to/fan-out-in-parallel.md` is not in
     the parent adjudication's named doc set (CTRL-2 + hard-ceilings.md), but it
     asserted the unqualified "only *lowers*" claim this fix uniquely falsifies
     (UP-clamp). Prose-only, no assertion / no behaviour; exact file+lines named;
     routed through the review→fixer loop, not a silent edit. Evidence it is a
     new (not pre-existing) break: `git log` shows 0324/0325 never touched this
     file, correctly, because their clamps go DOWN (only-lowers stays true).
- **Residuals:**
  1. **`ExecuteBodyDeps.emitDiagnostic` doc comment under-inclusive (R1).**
     Enumerates only the 0324 non-number caller; already stale since 0325
     (NaN is `typeof number`) and now a third caller. Pre-existing 0325 drift,
     left untouched per the do-not-churn lesson; the field's stated purpose
     ("so the clamp is not silent") is true of all three callers. Non-blocking.
  2. **Deferred-path finite non-integer `< 1` documentation (R2 follow-up).** A
     deferred/`unknown`-typed operand evaluating to e.g. `0.5` floors to 0 and
     draws `par-max-non-positive`; the row Trigger now names "a finite `number`
     value whose floor is below 1" (accurate), but the broader deferred-path
     `Math.floor` of finite non-integers (`2.5` → 2, silent) is undocumented
     since 0324/0325 — pre-existing gap, out of this bug's scope.
- **DEVIATION (hard-rule breach by a phase agent, disclosed):** the
  `bug-fix-implementer` ran `git stash -k -u` while investigating the typecheck
  failure, violating the campaign's NO-`git stash` rule, then self-corrected in
  the same turn (`git stash pop`/`drop`). The orchestrator verified the final
  tree byte-intact (`git stash list` empty, `git status` = 6 modified + 1
  untracked witness, all gate re-runs green) — no work lost, but the breach is
  recorded per zero-tolerance policy. The implementer also transiently ran
  `unix2dos` on `code-registry-runtime.md` under a mistaken "docs are CRLF"
  premise; the repo is LF everywhere (`core.autocrlf=false`, no `.gitattributes`,
  `git ls-files --eol` → `i/lf w/lf`), the transient CRLF was reverted, and the
  committed diff is a clean content-only single-line addition (no EOL churn).
- **Discharge notes appended:** none (0324/0325 are CLOSED fix records — read,
  cited, not edited; the 0325 record's "stays 0326's territory" hand-off is
  answered by this record).
- **Pinned dispositions / non-goals:** the static type gate is untouched (static
  half = NONE; witness cell G pins `max 0` loads clean). The non-finite /
  non-`number` else-branch (`par-max-non-integer`, 0324/0325) is byte-untouched
  (witness cells E/F pin it). `max 1` and above stay legal with no diagnostic
  (witness cell D pins the `< 1` boundary).

## Provenance

Bug-hunt area `parfor-semantics`, worktree `C:/UnitySrc/pi-theta-hunt` at
`ee681f7b` (v0.287.0). Probes: scratch vitest file, production parser +
executor, gated seam host per `tests/par-for.test.ts`; scratch file
deleted after filing.
