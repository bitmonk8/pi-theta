# Bug 0438 — A laundered finite non-integral `par for max` operand ≥ 1 is silently `Math.floor`ed into the in-flight width (`max f(2.5)` → width 2, zero diagnostics) — the only silent cell in CTRL-2's runtime width matrix, whose every sibling class (`0.5`, `0`, NaN, `±Infinity`, non-number) is loud and whose direct spelling is parse-refused

- **Status:** fixed (0.417.0).
- **Sev/Diff estimate:** S4/D2 — S4: the observable divergence is bounded (the
  loop's collected values, ordering, and effects are all correct; only the
  scheduling width is silently rewritten from the author's stated bound), the
  0326 calibration for exactly this shape; D2: the fix needs one DIAG-2
  adjudication — which registered code owns the finite-non-integral-≥1 class,
  since folding it into `theta/runtime/par-max-non-integer` falsifies that
  row's registered message (`'par for' max operand is not a finite number` is
  false of `2.5`) — plus one branch edit at a single seam.
- **Kind:** spec gap with a hazardous implementation disposition. CTRL-2
  (`docs/spec_topics/control-flow.md:72`) prescribes runtime dispositions for
  exactly three operand-value classes — non-`number` and non-finite
  (`par-max-non-integer`), and "a finite `integer` operand that resolves below
  1" (`par-max-non-positive`; the registry row widens this to "a finite
  `number` value whose floor is below 1", `code-registry-runtime.md:22`) — and
  declares "`n` is any `integer`-typed expression". A finite non-integral
  value whose floor is ≥ 1 satisfies none of the three triggers and has no
  prescribed disposition anywhere; the implementation silently truncates it
  JS-style (`Math.floor`), the disposition the 0365/0402 integrality
  progression removed from every other integer-semantics runtime sink.
- **Related:**
  - 0326 (fixed 0.343.0) — the `< 1` half of the same finite-number branch;
    its §Fix **Residual 2** records this exact class as unowned: "the broader
    deferred-path `Math.floor` of finite non-integers (`2.5` → 2, silent) is
    undocumented since 0324/0325 — pre-existing gap, out of this bug's scope."
    This report is that follow-up, now measured and filed.
  - 0324 (fixed 0.312.0) / 0325 (fixed 0.313.0) — the non-number and
    non-finite classes on the sibling `else` branch; their fixes pinned the
    "integer-valued clamp arithmetic (`Math.max`/`Math.min`/`Math.floor`)
    untouched" (0324 §Coordination note), leaving the fractional-≥1 class
    unadjudicated between the three fixes.
  - 0402 (fixed 0.400.0) — the integrality doctrine at the stdlib `slice`
    seam: a laundered fractional under an `integer` descriptor aborts loudly
    (`Number.isInteger` conjunct in `assertStdlibArgumentKinds`). Its §Fix
    perimeter claim ("`slice` … the only member with `integer` descriptors")
    is confirmed at v0.415.0 by the three signature tables
    (`stdlib-string.ts:155`, `stdlib-array.ts:68` (`slice` `["integer", "integer"]` at `:73`), `stdlib-object.ts:119`), so
    the stdlib-method surface proper is closed and `par for max` is the first
    integer-semantics runtime sink beyond it that still JS-truncates.
  - 0365 (fixed 0.357.0) — the same value class at INDEX position panics
    `theta/runtime/index-out-of-bounds`; the sibling-sink asymmetry half.
  - 0392 (fixed 0.387.0) — the spelled-refused / laundered-silently-coerced
    family precedent (probe A5 vs A1 below is that exact shape).
- **Affected** (verified at `04579e12`, v0.415.0):
  - `src/runtime/statement-executor.ts:1873` — the finite-number branch
    admits every finite IEEE-754 double (`Number.isFinite`), with no
    integrality test.
  - `src/runtime/statement-executor.ts:1880` — `const requested =
    Math.floor(maxResult.value)`: the silent JS-style truncation (`2.5` → 2).
  - `src/runtime/statement-executor.ts:1894-1896` — the `requested >= 1` arm
    sets `width` with no `emitDiagnostic` call — the only silent arm of the
    width resolution; both its siblings (`:1881-1893` non-positive,
    `:1897-1911` non-number/non-finite) emit.
  - `docs/spec_topics/control-flow.md:72` (CTRL-2) — the three-class runtime
    disposition matrix that leaves finite-non-integral-≥1 unprescribed.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:21-22` — the two
    `par-max-*` Trigger cells, neither of which covers the class.
  - Single seam: `evalParFor` is the only width-resolution site (the
    `par-max-*` codes appear nowhere else in `src/`); both theta modes reach
    it through `executeBody`.
- **Observed at:** v0.415.0 (`04579e12`), offline — production prompt-mode
  harness (`parseThetaDocument` → `createProductionProducerDeps` with a
  capturing `emitDiagnostic` → `bindPromptConversation` → `executeBody`), the
  b0402 witness shape; scratch file deleted.

## Summary

`evalParFor`'s width resolution handles the `max` operand in two branches:
finite numbers are `Math.floor`ed and, when the floor is below 1, clamped up
to 1 with `theta/runtime/par-max-non-positive`; everything else (non-number,
NaN, `±Infinity`) clamps to 1 with `theta/runtime/par-max-non-integer`. A
finite non-integral value whose floor is ≥ 1 — `2.5`, `63.9` — takes the
remaining arm: `Math.floor` silently rewrites it and the loop schedules at
the truncated width with zero diagnostics on any channel. The direct
spelling `max 2.5` is parse-refused (`theta/parse/integer-narrowing`), so
the class is reachable only through the deferred/`unknown` static path (an
unannotated `fn`'s return value, the same laundering every belt bug in the
0392–0402 family measures) — exactly the situation the runtime half of
CTRL-2's enforcement exists for, and the one place it is silent. Every
adjacent value class in the same matrix is loud: `0.5` (floor 0) draws
`par-max-non-positive`, `0 % 0` and `1 / 0` draw `par-max-non-integer`, `0`
draws `par-max-non-positive`. The 0365→0402 progression established that a
fractional value reaching an integer-semantics runtime sink is diagnosed,
never silently truncated; this is the remaining sink on the other side of
that rule.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding with
`emitDiagnostic` captured. Parse error-diagnostics `[]` in every row except
A5.

| # | Source (body) | Observed |
|---|---|---|
| A1 | `fn f(x) { x }` / `let out = par for i in [1, 2, 3] max f(2.5) { i }` / `out` | `outcome=success value=[Ok(1),Ok(2),Ok(3)]`, **runtime diagnostics `[]`** — silent; width = `Math.floor(2.5)` = 2 (`statement-executor.ts:1880,1895`) |
| A3 | same shape, `max f(0.5)` | success, runtime diagnostics `[theta/runtime/par-max-non-positive]` — the sub-1 fractional is LOUD |
| A2 | `let z = 0` / `max f(z % z)` (NaN) | success, `[theta/runtime/par-max-non-integer]` — loud |
| D4 | `let z = 0` / `max f(1 / z)` (Infinity) | success, `[theta/runtime/par-max-non-integer]` — loud |
| D3 | `max f(0 - 0)` (0) | success, `[theta/runtime/par-max-non-positive]` — loud |
| A4 (control) | `max f(2)` | success, runtime diagnostics `[]` — the correct-integer class is rightly silent |
| A5 (contrast) | direct `max 2.5` | parse `[theta/parse/integer-narrowing: cannot narrow number to integer]` — the spelled form never reaches the runtime seam |

A2/A3/D3/D4 double as the spy-liveness control: the same capturing
`emitDiagnostic` that records their codes records nothing for A1, so A1's
silence is a real absence, not an unwired channel.

## Expected behaviour

- `docs/spec_topics/control-flow.md:72` (CTRL-2): "`n` is any
  `integer`-typed expression" — `2.5` is not an `integer` under any reading
  the spec admits (`type-system.md` TYPE-2, `integer ⊑ number` one-way).
- The same CTRL-2 sentence prescribes loud runtime dispositions for the
  deferred path's other value classes ("a non-`number` or non-finite value …
  emits `theta/runtime/par-max-non-integer`"; "a finite `integer` operand
  that resolves below 1 … emits `theta/runtime/par-max-non-positive`") — the
  clause family exists precisely so the deferred path is never silent
  (0324/0325/0326).
- The integrality rule the corpus settled at the sibling sinks:
  `expressions.md:10` (a fractional index panics) and the 0402 belt
  (`stdlib-string.ts:103`, a fractional under an `integer` descriptor aborts
  loudly). No spec sentence licenses `Math.floor` as a silent disposition
  anywhere in the language.

Expected: the finite-non-integral-≥1 operand is diagnosed (whatever width
disposition is adjudicated), never a silent truncation.

## Actual behaviour / root cause

`evalParFor` (`statement-executor.ts:1873-1896`): the number branch gates on
`Number.isFinite` only. `Math.floor(maxResult.value)` (`:1880`) truncates a
fractional operand; the `requested >= 1` arm (`:1894-1896`) computes
`width = Math.max(1, Math.min(requested, PAR_FOR_THROTTLE))` and emits
nothing. The two diagnosing arms surround it: floor < 1 → `:1887`
(`par-max-non-positive`), non-number/non-finite → `:1905`
(`par-max-non-integer`). The class was never adjudicated: 0324 fixed the
non-number substitution, 0325 the NaN/Infinity evasion, 0326 the sub-1
clamp, and 0326's Residual 2 explicitly recorded the `2.5 → 2` silent floor
as a pre-existing gap out of its scope. The registry rows
(`code-registry-runtime.md:21-22`) confirm neither code's Trigger covers a
finite non-integral value whose floor is ≥ 1.

## Why it matters

Impact class 1 by mechanism (silent permissive acceptance: the author's
stated width bound is rewritten with zero diagnostics), bounded to S4 by
consequence (values/effects correct; only concurrency differs — the 0326
calibration). The inconsistency is user-visible and pedagogically hostile:
an author whose computed width evaluates to `0.5` gets a loud error
diagnostic, while `2.5` — the same authoring mistake one unit over — is
silently accepted; `max` is the one numeric-argument position left in the
language where a laundered fractional does not produce a diagnostic. It also
breaks the belt-law uniformity the 0392–0402 family established
(spelled-refused ⇒ laundered-loud), which the next perimeter sweep will
otherwise re-derive from scratch.

## Non-goals

- The `< 1` classes (integral and fractional) — 0326's fix, correct and
  loud; probe A3/D3 pin them.
- The non-number / non-finite classes — 0324/0325's fixes, correct and loud;
  probes A2/D4 pin them.
- The parse-side gates (`non-integer-max`, `integer-narrowing`) — correct
  (probe A5); only the deferred runtime path is in scope.
- The 64 throttle and the `max`-only-lowers principle — untouched by any fix
  option below (flooring and clamping both lower).
- The stdlib-method `integer` descriptors — closed by 0402 (verified: `slice`
  is still the only member with `integer` params at v0.415.0).

## Fix

Honesty note: 0326 §Fix Residual 2 frames this class as a DOCUMENTATION
gap — "the broader deferred-path `Math.floor` of finite non-integers
(`2.5` → 2, silent) is undocumented since 0324/0325 — pre-existing gap,
out of this bug's scope" — while this report escalates it to a missing
runtime diagnostic. That escalation is argued from CTRL-2 and the
0365/0402 doctrine, not from the residual; the residual pre-adjudicates
nothing, so the options below are genuinely open (option 3 is the
residual's documentation-only reading, and its rejection is this report's
argument, not a prior adjudication).

Options:

1. **Widen `par-max-non-integer` to the whole non-integral class** (recommended):
   in the number branch, test `Number.isInteger(maxResult.value)` and route a
   finite non-integral value to the existing `par-max-non-integer` emission
   with the clamp-to-1 disposition its row prescribes. Requires a DIAG-2
   message rewording (the registered message says "is not a finite number",
   false of `2.5` — e.g. "is not a finite integer", which stays true of every
   current trigger member) plus the Trigger-cell and CTRL-2 sentence edits,
   same-commit. Keeps the code space closed; makes the code's own name
   (`non-integer`) finally match its trigger. Tradeoff: `2.5` clamps to 1
   rather than flooring to 2 — strictly more conservative, consistent with
   "unintelligible as a width" treatment of its NaN sibling.
2. **Keep the floor, add the diagnostic**: emit (either code, or a minted
   `par-max-non-integral`) while still running at `floor(value)`. Preserves
   today's width behaviour for anyone depending on it; costs either a
   message/trigger contortion (the clamp-to-1 sentence in both existing rows
   is then false for this class) or a new registry row (heavier DIAG-2, and
   the 0326 precedent minted a row for less).
3. **Do nothing at runtime, document the floor** — rejected: contradicts the
   0365/0402 integrality doctrine and leaves the loud/silent inconsistency
   between `0.5` and `2.5`.

Constraints any fix must satisfy: correct-integer operands byte-identical
(probe A4); the `< 1` and non-finite emissions unchanged (A2/A3/D3/D4); no
change to the 64 throttle; deferred-path-only (parse gates untouched).

## Provenance

stdlib-belt-perimeter sweep at `04579e12` (v0.415.0): enumerated every
stdlib member signature (`STRING_MEMBER_SIGNATURES`,
`ARRAY_MEMBER_SIGNATURES`, `OBJECT_MEMBER_SIGNATURES`) — `slice` confirmed
the only `integer`-descriptor member and belted (0402) — then swept the
remaining author-value integer-semantics runtime sinks (`rg "Math\.(floor|
trunc|round|ceil)" src/`): the only hit on an author-supplied value is
`evalParFor`'s width floor. Probes A1-A5/D3/D4 run via
`tests/scratch-belt-perimeter.test.ts` (deleted). Dup check: README index
lines for 0324/0325/0326 and their reports read in full — 0326 §Fix
Residual 2 records this class as unowned; no filed report and no sibling
hunt candidate (`.pi/bug-hunt/candidates/*`) owns it; main-tree
`docs/bugs/` identical to the pinned worktree at filing time. Sibling
candidate: `[bug 0439](./0439-kind-belt-message-lies-on-non-laundered-paths.md)` (belt message wording at
the 0402 seam, found in the same sweep).

## Fix (0.417.0)

- What shipped:
  - `src/runtime/statement-executor.ts` — §Fix option 1 (reuse the code): a
    new `else if (!Number.isInteger(maxResult.value))` arm, ordered AFTER the
    `requested < 1` (`par-max-non-positive`) arm and BEFORE the integer
    `else`, routes a finite non-integral operand whose floor is ≥ 1 (`2.5`,
    `63.9`) to the existing `theta/runtime/par-max-non-integer` with the
    clamp-to-1 disposition. Both `par-max-non-integer` emit sites now carry a
    shared `PAR_MAX_NON_INTEGER_MESSAGE` = `'par for' max operand is not a
    finite integer; in-flight width clamped to 1` (the old `is not a finite
    number` was false of `2.5`; `is not a finite integer` stays true of every
    trigger member). No new registry row/code; the 64 throttle and the
    integer path are byte-identical.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md` — the
    `par-max-non-integer` Trigger cell widened to the finite-non-integral-≥1
    class (and its parse-refused direct spelling); its Message cell reworded;
    the adjacent `par-max-non-positive` row's now-stale sibling
    cross-description repaired (review F2).
  - `docs/reference/diagnostics.md` — the reference message mirror updated to
    match the registry (DIAG-4).
  - `docs/spec_topics/control-flow.md` — CTRL-2's runtime-disposition
    sentence widened to the finite non-integral (floor ≥ 1) class (review
    F1).
  - `tests/b0438-par-max-fractional-width-silent-floor.test.ts` — the witness
    (FLIP A1/A1b + controls A2/A3/A4/bnd/D3/A5).
  - `tests/b0325-nan-infinity-max-zero-workers.test.ts` — the enumerated
    message-reword propagation: two `.toContain("not a finite number")`
    assertions and one header-comment quote → `not a finite integer` (intent
    unchanged; NaN/±Infinity still → `par-max-non-integer`, loud).
- Gates: witness `npx vitest run tests/b0438-…` → 8/8; full default suite
  `npx vitest run` → 589 files / 10552 tests green; `npm run typecheck`
  clean; `npm run lint` clean; live `b0324live-max-non-integer-load-refusal`
  → 1/1 through the real `pi -p` (lane witness, under the global live lock).
- Review: 2 rounds. R1 (deep) — 2 `spec` findings: F1 (CTRL-2 omitted the
  floor-≥1 qualifier, wrongly claiming `0.5`) and F2 (registry
  `par-max-non-positive` row's stale sibling cross-description) — both fixed.
  R2 (fast) — CLEAN (one prose residual, an awkward CTRL-2 clause order,
  copy-edited by the orchestrator).
- Verification: SOLID — witness reds with the new arm reverted (peak 2 / 5,
  want 1; silent) and greens restored byte-exact; full suite green (one
  isolated-green parallel-load timeout flake); typecheck + lint clean; tree
  reconciled, no stash.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `Math.floor(maxResult.value)` retained in
  the number branch — now a provable no-op (only integers reach the integer
  `else`), kept for a minimal diff and harmless. The `< 1` classes (`0.5`,
  `0`, negatives) stay on `par-max-non-positive` (§Non-goals; controls
  A3/D3). No new registry row — `par-max-non-integer` reused per option 1.
