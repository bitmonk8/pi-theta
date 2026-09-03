# Bug 0402 — A laundered fractional / NaN / Infinity number under `slice`'s `integer` parameters silently JS-truncates on both hosts (`f([1,2,3], 1.5)` → `[2,3]`, `0 % 0` → the full copy, `1 / 0` → `[]`), while the byte-identical direct spelling is parse-refused and the identical value under INDEX position panics `theta/runtime/index-out-of-bounds`

- **Status:** fixed (0.400.0).
- **Kind:** defect — the runtime evaluates a value the signature excludes by
  JS coercion, against `expressions.md:122`'s twice-stated "never a JS-coerced
  runtime value", and against the runtime integrality discipline the sibling
  INDEX position already enforces (`expressions.md:10`, bug 0365's fix).
- **Sev/Diff estimate:** S1/D1 — S1: silent wrong values with zero
  diagnostics (the 0392/0393/0394 impact class; author intent `slice(1.5)`
  yields data as if the author wrote `slice(1)`); D1: the 0394 kind belt
  (`assertStdlibArgumentKinds`) is the natural site — one integrality
  conjunct on the existing `"integer"` arm, both hosts in lockstep for free
  (the belt lives in the shared stdlib evaluators).
- **Related:**
  - 0394 (fixed 0.397.0) — parent surface. Its belt checks `"integer"` args
    by `typeof arg !== "number"` only (kind, not value); its witness rows
    cover string/boolean/null/array values under `integer` descriptors,
    never a fractional/non-finite number. This is the adjacent input class
    with its own mechanism (integrality vs `typeof` kind).
  - 0365 (fixed 0.357.0) — the same value class (`xs[1.5]`, `xs[0 / 0]`) at
    INDEX position; its fix makes the index path panic
    `index-out-of-bounds`, which is the asymmetry half this report measures.
    Its §Non-goals fence covers the static index gate only, not stdlib
    args, and its §Pinned dispositions scope the `Number.isInteger` belt to
    the index position ("only the feeders close, which here are the two
    host index arms, now belted") — making this report the sibling sink of
    the same rule.
  - 0392 (fixed 0.387.0) — the laundered-value family precedent (spelled
    refused / laundered silently coerced).
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `src/runtime/stdlib-string.ts:87–108` — `assertStdlibArgumentKinds`; the
    `"integer"` arm (`:98–100`) admits any `typeof arg === "number"`,
    including `1.5`, `NaN`, `±Infinity`.
  - `src/runtime/stdlib-array.ts:73` — `slice` signature
    `{ min: 1, max: 2, params: ["integer", "integer"] }` (the only member
    with `integer` descriptors).
  - `src/runtime/stdlib-array.ts:123–124` — `case "slice": return
    receiver.slice(args[0] as number, args[1] as number | undefined)` — JS
    `Array.prototype.slice` applies ToIntegerOrInfinity: `1.5` → `1`,
    `NaN` → `0`, `Infinity` → length.
  - `src/parser/stdlib-arg-diagnostics.ts:192–201` — the parse side maps the
    `"integer"` descriptor to `{ kind: "prim", name: "integer" }`, so a
    resolvable `number`-typed argument is refused (TYPE-2 one-way) — the
    direct spelling never reaches the runtime seam.
- **Observed at:** v0.398.0 (`c2c25d81`), offline — parse probes via
  `parseThetaDocument`, runtime probes via the b0394 harness shape
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`); scratch file deleted.

## Summary

`slice(start, end?)` is declared `(start: integer, end?: integer)` on both
`array<T>` (`expressions.md:111`) and nothing else in the stdlib takes an
`integer`. The parse layer enforces the declaration exactly: a resolvable
`number`-typed argument (`[1, 2, 3].slice(1.5)`) draws
`theta/parse/stdlib-arg-type-mismatch` because `number ⋢ integer` (TYPE-2).
The runtime layer — the bug-0394 kind belt — checks only
`typeof arg === "number"`, so the same value laundered through an
unannotated `fn` parameter reaches `Array.prototype.slice` raw and is
JS-coerced (ToIntegerOrInfinity): fractional values truncate, `NaN` becomes
`0`, `Infinity` becomes the length. The body binds a silently wrong array
with zero diagnostics on both evaluation hosts (the belt is shared).
`expressions.md:122` closes its stdlib-argument discipline with "never a
JS-coerced runtime value" — twice — and the sibling INDEX position
(`expressions.md:10`) prescribes and implements a runtime panic for exactly
this value class ("a fractional or `NaN` index"), so the divergence is
positional, not doctrinal: one read panics, the adjacent read coerces.

`NaN`/`Infinity` are reachable in-model without laundering tricks:
`expressions.md:236` legalises `0 / 0`, `n / 0`, and `n % 0` as
`NaN`/`±Infinity`-producing, non-panicking arithmetic.

## Reproduction

Parse gate (direct spelling — the refusal that makes the laundered path an
asymmetry):

```theta
let a = [1, 2, 3].slice(1.5)
```

→ `[theta/parse/stdlib-arg-type-mismatch]` (probe S6).

Runtime (laundered through an unannotated `fn` param; prompt-mode fixture,
executor host via `executeBody`):

```theta
fn f(xs, a) { xs.slice(a) }
let out = f([1, 2, 3], 1.5)
out
```

| Probe | argument | observed |
|---|---|---|
| S7 | `1.5` | `outcome=success value=[2,3]` (1.5 → 1) |
| S8 | `0 % 0` (`NaN`) | `outcome=success value=[1,2,3]` (NaN → 0, full copy) |
| S9 | `1 / 0` (`Infinity`) | `outcome=success value=[]` |
| S10 (control) | `1` | `outcome=success value=[2,3]` |
| S11 (contrast) | `fn g(xs, i) { xs[i] }` / `g([1, 2, 3], 1.5)` | throws `IndexOutOfBoundsPanic: index out of bounds: 1.5 not in 0..3` |

No note, no diagnostic, no belt on S7–S9: the value is bound and flows on.

## Expected behaviour

- `expressions.md:111` — `slice(start, end?)` signature
  `(start: integer, end?: integer): array<T>`.
- `expressions.md:122` — "A call on a LISTED member whose positional-argument
  list does not match the member's signature above is … — never a JS-coerced
  runtime value." Bug 0394's §Fix record establishes this sentence as the
  normative anchor for laundered arguments at runtime ("expressions.md
  §methods' 'never a JS-coerced runtime value' is the sentence the fix makes
  hold").
- `expressions.md:10` — the sibling discipline: "At runtime an array index
  that is not an integer in `0..arr.length` (a fractional or `NaN` index, …)
  panics with `theta/runtime/index-out-of-bounds`". A fractional `slice`
  start is the same author error one call-shape over.
- `type-system.md:36` (TYPE-2) — `integer ⊑ number` one-way; `1.5` is not an
  `integer` in any reading the spec admits.

Expected: the laundered fractional/non-finite argument aborts loudly (the
0394 belt pattern — `StdlibMethodArgumentKindDefectError` →
`theta/runtime/internal-error`, or a registered rejection), never a silently
truncated slice.

## Actual behaviour / root cause

`assertStdlibArgumentKinds` (`stdlib-string.ts:98–100`) implements the
`"integer"` descriptor as `typeof arg !== "number"` — a KIND check that admits
every IEEE-754 double. `evaluateArrayMember`'s slice arm
(`stdlib-array.ts:123–124`) then forwards the raw value into
`Array.prototype.slice`, whose ToIntegerOrInfinity coercion truncates. Both
hosts share the evaluators, so executor and pure host coerce identically.
The parse gate (`stdlib-arg-diagnostics.ts:192–201`) asks `checkCompatible`
about `prim integer` and refuses `number` — so the only inputs reaching the
runtime seam are laundered ones, exactly the class the belt exists for.

## Why it matters

Impact class 1: author intent is silently rewritten. `slice(n)` where `n`
was computed (`len / 2`, a model-supplied count, a `%`-derived offset) yields
a plausible-looking but wrong slice; `NaN` (from any `x % 0` / `0 / 0`
upstream) yields the FULL copy, which downstream code cannot distinguish
from a deliberate whole-array slice. The identical mistake at index position
panics with a registered code — an author who learns theta's discipline from
`xs[i]` is actively misled at `xs.slice(i)`.

## Non-goals

- The parse-side gate is correct and untouched (it already refuses resolvable
  `number` under `integer`).
- `end`-argument handling beyond the same integrality conjunct (S7–S9 drive
  `start`; `end` shares the descriptor and the fix site).
- The `"element"`/`"string"`/`"array"` descriptors (0394-settled semantics).
- Negative INTEGRAL starts (`slice(-1)`) — documented JS semantics
  (`expressions.md:111` "negative indices count from the end").

## Fix

Extend the `"integer"` arm of `assertStdlibArgumentKinds` to
`typeof arg !== "number" || !Number.isInteger(arg)` (Number.isInteger
excludes fractional, `NaN`, and `±Infinity` in one predicate), keeping the
existing `StdlibMethodArgumentKindDefectError` → internal-error belt route.
One line, both hosts in lockstep, no new registry row (the 0394 belt-law
precedent). Alternative — a dedicated registered rejection mirroring
`index-out-of-bounds`'s wording — gives a nicer message but needs a DIAG-2
adjudication; the belt is proportionate first. Trigger-column widening of
whatever the belt routes to should name the integrality case (DIAG-2
same-commit obligation, per the 0392/0393 precedent).

## Provenance

fix-residuals-4 sweep over bugs 0386–0401: 0394's §Fix pinned the shipped
`"integer"→typeof number` mapping; verified the fractional/non-finite class
was never adjudicated there (witness rows are wrong-KIND only) nor in 0365
(index position only). Probes S6–S11 run at `c2c25d81`
(`tests/scratch-fr4-residuals.test.ts`, deleted). Dup check: README index
carries no stdlib-argument integrality report; `docs/bugs/0365` §Non-goals
and `docs/bugs/0394` §Pinned dispositions read in full.

## Fix (0.400.0)

- What shipped (settled §Fix — extend the 0394 kind belt with one integrality
  conjunct; belt-law straight case, NO new registry row):
  - `src/runtime/stdlib-string.ts` — `assertStdlibArgumentKinds`'s `"integer"`
    arm widened from `typeof arg !== "number"` to
    `typeof arg !== "number" || !Number.isInteger(arg)`. `Number.isInteger`
    excludes fractional, `NaN`, and `±Infinity` in one predicate while admitting
    negative integers and `-0` (§Non-goals guard). The existing
    `StdlibMethodArgumentKindDefectError` message and its
    `surfaceUnexpectedThrow` → `theta/runtime/internal-error` route are
    unchanged — no new error class, no message change, no new registry row. Both
    hosts move in lockstep because the belt lives in the shared stdlib
    evaluator (`evaluateArrayMember`, reached by the executor
    `applyStdlibMethod` and the pure-host `evaluateStdlibMethod`). The `slice`
    signature `["integer", "integer"]` covers BOTH `start` and `end`.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md` — the §Fix
    same-commit DIAG-2 obligation: one additive `Also …` clause on the
    `theta/runtime/internal-error` row's *Trigger* cell naming the integrality
    rejection (a non-integral `number` reaching the runtime kind belt under an
    `integer` descriptor; the parse-time `theta/parse/stdlib-arg-type-mismatch`
    check refuses only statically-resolvable mismatches, and a statically-
    `integer`-typed operand can still evaluate non-integral at runtime —
    `n % m`, runtime-zero `m`). Message/Code/Sev/Phase/Spec-rule cells
    byte-identical; no new row; `docs/reference/diagnostics.md` untouched (it
    transcribes Code/Sev/Phase/Message only, none changed).
  - `tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts` (new) — the
    witness (9 cells), mirroring the b0394 harness: executor FLIPs S7/S8/S9
    (`1.5`→[2,3], `0 % 0`/NaN→[1,2,3] full copy, `1 / 0`/Infinity→[]), the
    `end`-arg FLIP S12 (`2.5`→[1,2], proving the optional `end` shares the
    descriptor + fix site), the pure-host FLIP S13 (interpolation renders + sends
    the truncated text at HEAD), and controls K1–K4 including the negative-
    integral guards K3 (`slice(-1)`→[3]) / K4 (`slice(-2,-1)`→[2]).
- Gates: witness 9/9 green; full default suite 571 files / 10440 tests green
  (one run showed `tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts`
  timing out under 16-lane parallel load — green isolated 7/7, touches zero of
  this surface: recorded load noise, not a regression; a later full run was
  571/571 clean); `npx tsc --noEmit` clean; `npm run lint` clean; adjacent live
  cell `tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts` green (5.3s
  real `pi -p` turn over the same stdlib-arg dispatcher surface).
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`) — FINDINGS: F1 (spec,
  blocking) the Trigger clause's causal tail misdescribed the emission
  conditions (the belt also fires with no parse deferral, e.g.
  `[1,2,3].slice(4 % y)` with runtime-zero `y`); residuals R1 (witness cited
  pre-fix line coords), R2 (pre-existing 0394 belt message imprecision, OUT OF
  SCOPE per §Fix "no message change"). Code/tests/fidelity/house-rules clean;
  the 0394-tension adjudicated: the widening extends 0394's open-ended trigger,
  it does not flip it. Fixer round (`bug-fix-fixer`) reworded F1 (doc prose) and
  R1 (witness comment) — no executable line. Round 2 (`bug-fix-reviewer-fast`)
  — CLEAN.
- Verification: SOLID (`bug-fix-verifier`). (1) Revert-witness: neutralising
  the `Number.isInteger` conjunct reds the 5 FLIP rows naming their coerced HEAD
  values (S7 [2,3], S8 [1,2,3], S9 [], S12 [1,2], S13 sent ["v=[2,3]"]),
  controls K1–K4 stay green; restored byte-exact, witness 9/9 green. (2) Full
  suite 571/571 green. (3) tsc + lint exit 0. (4) Live: runtime belt changes no
  registration/load/drive outcome for any input class; adjacent b0315 cell run
  by the orchestrator.
- Residuals:
  1. (prose) The pre-existing `StdlibMethodArgumentKindDefectError` message
     (`src/runtime/runtime-panics.ts`, 0394-shipped) says "did not reject this
     laundered-receiver site", which is imprecise for the non-laundered
     emission paths this fix newly admits (e.g. a resolvable receiver with a
     runtime-non-integral arg). Explicitly OUT OF SCOPE — the §Fix pins "no
     message change". Code-side twin of the round-1 F1 wording; follow-up sweep
     material, per the 0394 residual-3 precedent.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: extends the 0394 kind belt, does not weaken
  or flip it (no new registry row; the `internal-error` open-ended trigger still
  covers the belt — the added clause is an example, not a closure change). The
  parse-side gate untouched (still refuses resolvable `number` under `integer`);
  negative integral starts admitted (K3/K4 byte-identical); the
  `"element"`/`"string"`/`"array"` descriptors and the 0365 index-position belt
  untouched; correct-kind integer calls byte-identical.
