# Bug 0332 — Spelled binary `-`, `*`, `/`, `%` on non-numeric operands parse clean and evaluate to silent JS-coerced values against `expressions.md` §"Other arithmetic" ("accept only numeric operands"): `let x = "a" - "b"` binds `NaN`, `let x = [1] - [2]` binds `-1`, `let x = true - false` binds `1` — zero diagnostics on any channel

- **Status:** fixed (0.299.0).
- **Sev/Diff estimate:** S1/D3 — S1 because the parse layer admits an operand
  pairing the spec refuses and the runtime binds a silent wrong value on the
  production evaluation path (`NaN` for string operands, and plausible small
  integers for array/boolean operands: `[1] - [2]` → `-1`, `true - false` →
  `1`), with no diagnostic at parse, none at evaluation; D3 because the fix
  needs a DIAG-2 registry adjudication (mint a numeric-operand row vs widen an
  existing one) with same-commit spec edits AND pinned-byte coordination
  against four sibling witnesses whose cells rely on these operands parsing
  clean (0142, 0152, 0050, 0314 — enumerated in §Fix).
- **Kind:** defect against the operator operand rule.
  `docs/spec_topics/expressions.md` §"Other arithmetic" (`expressions.md:234`):
  "`-`, `*`, `/`, `%` accept only numeric operands." No parse check enforces
  that constraint for the spelled binary forms: `walkExpr`'s `case "binary"`
  arm gates `&&`/`||` (boolean position), `+` (`checkPlusOperands`), and the
  ordering operators (`checkOrderingOperands`) only — `-`/`*`/`/`/`%` fall
  through with no operand check. The runtime then coerces both operands to
  `number` unconditionally.
- **Related:**
  - [0314](./0314-compound-assign-non-numeric-silent-zero.md)
    (fixed 0.293.0) — the compound-assignment sibling. Its fix desugars
    `x <op>= e ≡ x = x <op> e`, routes `+=`'s implied `+` through the existing
    `theta/parse/mixed-plus-operands` check, and makes `-=`/`*=`/`/=`/`%=` over
    a non-number operand throw a runtime `CompoundNonNumericError` (framed to
    `theta/runtime/internal-error`). Its `## Fix` §Residuals names this spelled
    binary surface as the unfiled sibling and defers it: the compound path's
    runtime throw is "the belt; a future parse gate for the spelled binaries
    is its brace." This report owns that surface.
  - [0166](./0166-unary-minus-default-admits-non-numeric-literal.md)
    (fixed 0.91.0) — the same admission for **unary** `-` on a non-numeric
    literal in the `params:` default sublanguage, where `-true` binds `-1` and
    `-"x"` binds `NaN`. This report is the binary-arithmetic analogue in
    expression position.
  - [0142](./0142-division-result-type-not-number.md) (fixed 0.80.0) and
    [0152](./0152-modulo-zero-result-type-not-number.md) (fixed 0.187.0) — the
    `#typeBinary` per-operator result-type arms for `/` and `%`. Their witness
    tables use `"a" / "b"`, `true / false`, and `"a" - "b"` as parse-clean
    result-type probes and controls; a parse-time operand gate flips those
    cells (§Fix enumerates them).
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md)
    (fixed 0.138.0) — its cell **b4** now pins the two-code set
    `[theta/parse/mixed-plus-operands, theta/parse/reassign-rhs-type-mismatch]`
    for a mixed `+` reassignment (0314 ratification A-1). A numeric-operand
    gate for `-`/`*`/`/`/`%` does not touch b4 (it is `+`-only), but shares the
    diagnostic-registry surface a new row would extend.
- **Affected** (verified at HEAD, 52712fb3):
  - `src/parser/type-layer-checks.ts:3062`–`:3078` — `walkExpr`'s
    `case "binary"` arm: `&&`/`||` route to `checkBooleanPosition`, `+` to
    `checkPlusOperands` (`:3074`), the ordering operators to
    `checkOrderingOperands` (`:3075`). There is no arm for `-`/`*`/`/`/`%`, so
    a non-numeric operand pair under those operators draws no diagnostic.
  - `src/parser/static-type-inference.ts:524`–`:576` — `#typeBinary`: `/`
    types as `number` (`:551`), `%` over a static-zero integer divisor types
    as `number` (`:564`), and every other arithmetic pairing (including
    `-`/`*` and general `%` on strings/booleans) falls through to
    `#commonType` of the two operand types (`:568`). None of these arms
    inspects whether the operands are numeric; `"a" - "b"` types as `string`,
    `true - false` types as `boolean`, `"a" / "b"` types as `number`.
  - `src/runtime/statement-executor.ts:995`–`:1012` — `applyBinaryScalar`:
    the `-` (`:1005`), `*` (`:1007`), `/` (`:1009`), `%` (`:1011`) arms cast
    both operands `(left as number)`/`(right as number)` and apply the JS
    operator. A non-number operand is silently coerced by JS: string operands
    yield `NaN`; an array operand stringifies then coerces (`[1] - [2]` →
    `"1" - "2"` → `-1`); a boolean coerces to `0`/`1` (`true - false` → `1`).
    Unlike the compound path (bug 0314), this path throws nothing.

## Summary

The spelled binary operators `-`, `*`, `/`, `%` accept any operand types at
parse. `walkExpr`'s binary arm has no numeric-operand check for them, and
`#typeBinary` assigns each pairing a type (`number` for `/`, the operands'
common type for `-`/`*`/general `%`) without judging whether the operands are
numeric. At runtime `applyBinaryScalar` casts both operands to `number` and
applies the JS operator, so a non-numeric pair produces a silent JS-coerced
value: `NaN` for string operands (rendered JSON `null`), and a plausible small
integer for array or boolean operands. There is no diagnostic at parse and none
at evaluation. This is the expression-position sibling of bug 0314's
compound-assignment defect; 0314's fix added a runtime loud-throw for the
compound path but left this path unguarded, and its `## Fix` §Residuals defers
this surface to a future parse gate.

## Reproduction

Offline, deterministic. Each source is prefixed `---\nmode: prompt\n---\n` and
driven through the production prompt-mode binding
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`). Parse diagnostics are `[]` (clean)
in every row.

| # | Source (body) | Parse | Runtime |
|---|---|---|---|
| P1 | `let x = "a" - "b"` / `x` | `[]` | `outcome=success value=NaN` (JSON `null`) |
| P2 | `let x = "a" * "b"` / `x` | `[]` | `outcome=success value=NaN` (JSON `null`) |
| P3 | `let x = "a" / "b"` / `x` | `[]` | `outcome=success value=NaN` (JSON `null`) |
| P4 | `let x = "a" % "b"` / `x` | `[]` | `outcome=success value=NaN` (JSON `null`) |
| P5 | `let x = [1] - [2]` / `x` | `[]` | `outcome=success value=-1` |
| P6 | `let x = true - false` / `x` | `[]` | `outcome=success value=1` |
| P7 | `let x = true * true` / `x` | `[]` | `outcome=success value=1` |
| P8 | `let x = "a" - 1` / `x` | `[]` | `outcome=success value=NaN` (JSON `null`) |

No diagnostic is emitted on any channel for any row; every row runs to a
`success` value. P5–P7 are the highest-impact class: the coerced result is a
finite integer that reads as a legitimate computation.

## Expected behaviour

`docs/spec_topics/expressions.md` §"Other arithmetic": "`-`, `*`, `/`, `%`
accept only numeric operands." A spelled binary `-`/`*`/`/`/`%` whose operands
are not both numeric is refused at parse — the same disposition the ordering
operators already have (`theta/parse/non-orderable-operands`,
`expressions.md` §"Ordering comparisons") and the same disposition `+` has for
a mixed pair (`theta/parse/mixed-plus-operands`, §"`+` operator"). A
parse-clean statement must not bind a value the spec's operator rule forbids
computing.

## Actual behaviour / root cause

`walkExpr`'s `case "binary"` arm
(`src/parser/type-layer-checks.ts:3062`) enforces an operand rule for
`&&`/`||`, `+`, and the ordering operators only; `-`/`*`/`/`/`%` fall through
with no operand check. `#typeBinary`
(`src/parser/static-type-inference.ts:524`) assigns each arithmetic pairing a
static type — `number` for `/`, `number` for `%` over a static-zero integer
divisor, the operands' common type otherwise — without judging operand
numericity, so no downstream sink is guaranteed to catch the pairing (for
`-`/`*` on strings the result types as `string`, which flows into a `string`
sink unremarked). At runtime `applyBinaryScalar`
(`src/runtime/statement-executor.ts:995`) casts both operands to `number` and
applies the JS operator: string operands yield `NaN`; an array operand
stringifies and coerces (`[1] - [2]` → `-1`); a boolean coerces to `0`/`1`
(`true - false` → `1`). No throw occurs — this path does not share bug 0314's
`CompoundNonNumericError` belt, which lives only in `applyCompound`.

## Why it matters

An author who writes `total - discount` where one operand is a string (a
mis-typed binding, a query result not yet parsed to a number) gets `NaN`
silently threaded into prompts, tool arguments, and return values. The
array/boolean cases are worse: `[1] - [2]` binds `-1` and `true - false` binds
`1` — finite integers with no visible sign of coercion — so a slip that should
be a load failure instead produces a plausible-looking wrong number that flows
downstream undetected. This is the silent-wrong-value class: the spec refuses
the operand pairing, the implementation admits it, and the corrupted value
carries author intent that was dropped.

## Non-goals

- Unary `-` on non-numeric operands — covered for the `params:` default
  sublanguage by bug 0166; unary `-` in expression position is a separate
  surface not measured here.
- `+` on mixed operands and the ordering operators — already gated
  (`theta/parse/mixed-plus-operands`, `theta/parse/non-orderable-operands`).
- The compound-assignment forms `-=`/`*=`/`/=`/`%=` — their runtime disposition
  is bug 0314's `CompoundNonNumericError`; this report's fix interacts with
  them only through the desugar (see §Fix).

## Fix

A parse-time numeric-operand gate for the spelled binary `-`/`*`/`/`/`%`. The
spec places the constraint at parse ("accept only numeric operands",
`expressions.md:234`, phrased as the ordering operators' rule is), so the
refusal belongs there.

Add an arm to `walkExpr`'s `case "binary"`
(`src/parser/type-layer-checks.ts:3062`) that, for `-`/`*`/`/`/`%`, checks both
operand static types and refuses a pairing where either is not `number`/
`integer`. Mirror `checkOrderingOperands`'s shape (same file), including its
deferral on statically-unresolvable operands. The diagnostic code is a DIAG-2
adjudication:

- **Mint a numeric-operand row** (e.g. `theta/parse/non-numeric-arithmetic-operands`),
  parallel to `theta/parse/non-orderable-operands`
  (`docs/spec_topics/diagnostics/code-registry-parse.md`), with its
  same-commit spec Trigger and the `docs/reference/diagnostics.md` mirror row.
  This is the closest structural match — the ordering operators already have
  their own row rather than sharing `mixed-plus-operands`.
- **vs. widening `theta/parse/mixed-plus-operands`** — its Trigger was already
  widened once (for 0314's desugared `+=`) and its message is `+`-specific
  (`'+' has mixed operand types: <left> and <right>`), so extending it to
  `-`/`*`/`/`/`%` would render a `+`-worded message for a non-`+` operator.
  Weaker on that ground.

The runtime cast in `applyBinaryScalar`
(`src/runtime/statement-executor.ts:995`) becomes unreachable for non-numeric
operands behind the gate; a non-number reaching it should be a loud defect, not
a silent coercion (the disposition 0314 chose for `applyCompound`).

**Route (b) — runtime-only belt.** Extend `applyBinaryScalar` to throw a loud
error (as `applyCompound` does) instead of coercing. Weaker: the spec states
the constraint at parse, and a runtime-only belt lets the theta load and run to
the first offending evaluation rather than refusing at load — the same argument
0314 recorded for preferring the parse route where the spec places the check.

**Pre-authorized-by-enumeration collateral (for the fixing lane).** A
parse-time gate lands IN FRONT of the type-result and fn-arg cells that
sibling fixes pinned on these operands parsing clean. Each flips from its
current disposition to the new parse refusal:

1. `tests/division-result-type-number.test.ts` (bug 0142) — the b-table rows
   `"string  / string "` (`"a" / "b"`) and `"boolean / boolean"`
   (`true / false`) currently assert the `number` reading; cells L1/L1c,
   L2/L2c, L3/L3c, L4/L4c currently assert a downstream sink code for
   `"a" / "b"` / `true / false` and `[]` for the `"a" - "b"` controls; the
   `g("a" / "b")` / `g("a" - "b")` pair (`:1051`, `:1062`) likewise. All flip
   to the new operand code.
2. `tests/modulo-zero-result-type-number.test.ts` (bug 0152) — the `"a" - "b"`
   controls (`:1373`, `:1398`, `:1421`, `:1451`), currently `[]`, flip to the
   new operand code.
3. `tests/division-result-type-number-invoke.test.ts` (bug 0146) — the
   `invoke("./cstr.theta", "a" / "b")` and `"a" - "b"` planted thetas
   (`:171`, `:172`), currently load clean, flip to a load refusal.
4. `tests/fn-arg-type-mismatch-wired.test.ts` (bug 0050) — cells u10c
   (`g("a" - "b")`, `:2065`) and u10d (`"a" / "b"`, `"a" % "b"`, `"a" * "b"`),
   currently assert no `fn-arg-type-mismatch` because the operand reduces to a
   trusted type; they flip to the new operand code at the argument expression.
   Constants `U10_MINUS_STRINGS` / `U10_MUL_STRINGS` (`:820`, `:823`). (These
   cells' comments also cite `applyBinaryScalar` at `statement-executor.ts:967,
   :969` — stale; the arms are at `:1005`–`:1012` at HEAD.)
5. `tests/b0314-compound-assign-non-numeric.test.ts` (bug 0314) — cells P1b
   (`s -= "b"`) and X4 (`s %= "b"`) currently assert a RUNTIME LOUD THROW. If
   the fix wires the gate into the desugared reassign pair symmetrically with
   the way `+=` is already routed through `pushMixedPlusIfNeeded`
   (`src/parser/type-layer-checks.ts:1748`), P1b and X4 flip to PARSE
   refusals. Whether to extend the gate to the compound desugar or leave the
   compound path on its runtime throw is a fixing-lane decision; either way
   these two cells' disposition must be re-pinned.

Any fix must keep the numeric controls byte-identical: `3 / 2`, `3 - 2`,
`1 % 0`, and every other numeric arithmetic cell in the bug-0142/0152 tables
continue to load and type exactly as they do at HEAD.

## Provenance

Found by following bug 0314's `## Fix` §Residuals (the unfiled spelled-binary
sibling) against `walkExpr`'s binary arm and `applyBinaryScalar` at HEAD.
Reproduced offline through the production prompt-mode executor harness (the
`tests/b0314-compound-assign-non-numeric.test.ts` shape): all eight rows of
§Reproduction parsed with `[]` and ran to the recorded `success` values; the
runtime path was confirmed to throw nothing (no `CompoundNonNumericError`
belt), distinguishing it from the compound path. Scratch probe deleted.

## Fix (0.299.0)

**Route adjudication (parent-ratified, recorded verbatim).** ROUTE (a) — a
parse-time numeric-operand gate for spelled `-`, `*`, `/`, `%` binaries — with a
NEW dedicated DIAG-2 registry row, NOT a widening of
`theta/parse/mixed-plus-operands`. Rationale on the record: (1) bug 0315's
precedent (0.294.0) mints dedicated rows for distinct trigger classes; (2)
`mixed-plus-operands`' registered sentence is about `+`'s concat-vs-add operand
mixing — reusing it for numeric-only operators would ship a misleading message;
(3) a dedicated row names the operator and the offending operand type in one
message.

**In-lane DIAG-2 settlements (per registry conventions).**
- Code name: `theta/parse/non-numeric-arithmetic-operands` — matches the
  `non-<adjective>-operands` naming of the sibling rows
  `theta/parse/non-orderable-operands` and `theta/parse/mixed-plus-operands`; a
  dedicated row for a distinct trigger class per the 0315 precedent.
- Message: `'<op>' requires two numeric operands; got <left> and <right>` —
  reuses only admitted placeholders (`<op>` category 7, `<left>`/`<right>`
  category 1); no new placeholder coined, so the closed placeholder-rendering
  vocabulary needs no edit.
- Severity `E`, phase `type` (mirrors `mixed-plus-operands` /
  `non-orderable-operands`). Hint: `Use only numeric operands; convert
  explicitly before the operation.`

- **What shipped:**
  - `src/parser/type-layer-checks.ts` — `walkExpr`'s `case "binary"` routes
    spelled `-`/`*`/`/`/`%` (excluding the synthetic-`null` unary-`-` node) to
    the new `checkArithmeticOperands`, which mirrors `checkOrderingOperands`:
    refuses a statically-resolvable pairing where either operand is not
    numeric with `theta/parse/non-numeric-arithmetic-operands`, deferring on an
    unresolvable operand.
  - `src/runtime/statement-executor.ts` — `applyBinaryScalar`'s `-`/`*`/`/`/`%`
    arms gain a `BinaryNonNumericError` belt (plain `Error`, not a
    `ThetaPanic`; routes through `surfaceUnexpectedThrow` to
    `INTERNAL_ERROR_CODE`) for a non-number reaching them — the belt behind the
    gate for statically-invisible operands. `NaN` is a `number`, so `n % 0`
    and division by zero keep their spec non-panic behaviour. 0314's
    `CompoundNonNumericError` belt is untouched.
  - `docs/spec_topics/diagnostics/code-registry-parse.md`,
    `docs/reference/diagnostics.md` — the new registry row and its reference
    mirror (same-commit DIAG-2).
  - `docs/spec_topics/expressions.md` §"Other arithmetic" — names the code,
    parallel to §"Ordering comparisons".
  - `tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts` (new) —
    witness: G1–G8 parse-refusal rows, C1–C4 numeric controls, B1 runtime-belt
    row, N1a/N1b unary-`-`-not-gated controls (§Non-goals).
  - `tests/live/acceptance/b0332live-spelled-arithmetic.test.ts` (new) — H9a
    live: offender `"a" - "b"` refuses at load (invoke→Err), numeric control
    `7 - 2` registers and drives to `5 + 100 = 105` through the real `pi -p`.
  - Enumerated sibling-witness flips: `tests/division-result-type-number.test.ts`
    (0142), `tests/modulo-zero-result-type-number.test.ts` (0152),
    `tests/division-result-type-number-invoke.test.ts` (0146),
    `tests/fn-arg-type-mismatch-wired.test.ts` (0050 u10c/u10d + stale-cite fix).
- **Gates:** witness — with the gate/belt neutralized the b0332 rows red for the
  documented reason (G1–G8 parse clean `[]`; B1 silent `NaN`→`null`), restored
  byte-exact and green; full suite `npm test` = 477 files / 9547 tests passing;
  `npm run typecheck` clean; `npm run lint` clean; live H9a acceptance 1/1 pass
  under the shared live-lock; `permitted-codes.json` byte-unchanged (hash
  `a4a8da04` == HEAD), the new code absent from it.
- **Review:** 2 rounds. R1 (`bug-fix-reviewer`): 3 findings — F1 (registry
  Trigger falsely claimed a compound-desugar emission), F2 (belt covers the
  executor path only + an overclaiming comment), F3 (interpolation position
  ungated, pre-existing). R2 (`bug-fix-fixer-light`): F1 clause struck, F2
  comment corrected, plus an added unary-`-` control (R1 residual);
  polish verified by gate-diff, confirmation round skipped (prose/comment/test
  hunks only).
- **Verification:** SOLID. Witness reversibility proven both directions (gate
  and belt neutralized → red → restored byte-exact → green); default suite
  green; live discharged from handed evidence + read-only confirmation; lint +
  typecheck clean; tree clean, `git stash` empty, `tests/b0314` byte-exact to
  HEAD.
- **Residuals:**
  1. The pure-host evaluator `evaluateBinaryExpression`
     (`src/extension/production-theta-producer.ts`) still silently coerces a
     statically-DEFERRED non-numeric operand (a WITHHELD binder — e.g. an
     unannotated `fn` param) reaching the pure path via `invoke` arguments,
     `.theta`-callable call arguments, or a user-`fn` body pure-evaluated inside
     those positions. Witness: `fn f(a) { invoke("./c.theta", a - 1) }` /
     `f("x")` hands the child `NaN`, where the byte-identical `a - 1` as a
     let-RHS throws the belt. Out of this report's §Fix scope (names only
     `applyBinaryScalar`) and §Affected (names only `statement-executor.ts`).
     The V3a `expression-evaluator.ts` arithmetic arms are likewise unbelted
     but that evaluator has no `src/` callers. Evidence: review R1 finding F2.
  2. Query-template interpolation expressions are ungated for ALL operand
     checks (`+`, ordering, and now arithmetic): `let s = "a"` with template
     `{s - 1}` parses clean and renders `NaN` into the prompt
     (`checkQueryInterpolationResults` classifies only Result-ness, never hands
     the interpolation expression to `walkExpr`). Pre-existing corpus-wide gate
     boundary, not introduced here (§Affected/§Reproduction cover body
     statements only). Evidence: review R1 finding F3.
  - **Discharged 2026-08-30 by bug 0338** (fixed 0.311.0): residuals 1 and 2
    above are closed by the pure-host runtime belt added to
    `evaluateBinaryExpression`
    (`src/extension/production-theta-producer.ts`), which throws this report's
    exported `BinaryNonNumericError` on a non-number operand of `-`/`*`/`/`/`%`
    — mirroring `applyBinaryScalar` — so the statically-deferred `invoke` /
    `.theta`-callable argument (residual 1) and the `${…}` interpolation render
    (residual 2) both draw the loud framed `theta/runtime/internal-error`
    abort instead of a silent coerced value. The interpolation PARSE boundary
    (routing the interpolation expression through `walkExpr` for the `+` /
    ordering / arithmetic checks) is NOT closed by 0338 — it remains the
    pre-existing corpus-wide gate-boundary residual named in residual 2, out of
    0338's runtime-belt §Fix scope. Append-only note; residual text above
    unchanged.
- **Discharge notes appended:** none — the compound desugar was deliberately
  not wired, so `tests/b0314` and bug 0314's doc are untouched (no coordination
  note owed).
- **Pinned dispositions / non-goals:** the compound forms `-=`/`*=`/`/=`/`%=`
  are deliberately NOT routed through the parse gate — §Non-goals assigns them
  bug 0314's `CompoundNonNumericError` runtime disposition, and §Fix made the
  desugar wiring an explicit fixing-lane option ("or leave the compound path on
  its runtime throw"); wiring it would have flipped bug 0115 cells b5–b8, a
  red beyond the doc's enumerated collateral set. Unary `-` in expression
  position is NOT gated (§Non-goals; pinned by the N1 controls). Bug 0115 is
  untouched.
