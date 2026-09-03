# Bug 0367 — A binary `-` whose left operand is the literal `null` is indistinguishable in the AST from unary minus, so `let x = null - 3` loads clean and evaluates to `-3`: the bug-0332 parse gate's synthetic-null carve-out exempts it, both runtime hosts negate the right operand, and `null - "a"` / `null - null` silently bind `NaN` / `0` — while `null * 3` is correctly refused

- **Status:** fixed (0.378.0).
- **Sev/Diff estimate:** S2/D2 — S2 rather than S1 only because the input class
  requires the literal spelling `null` as the left operand of `-` (a computed
  `null` behind a binding takes the belted path and throws loudly), so the
  reach is narrower than the sibling silent-value classes; within that class it
  is fully silent: zero diagnostics at parse, a fabricated `-3` / `NaN` / `0`
  at runtime on both evaluation hosts, and the author's binary subtraction is
  reinterpreted as an operation they did not write. D2 because the fix must
  first make the parser distinguish an authored `null` left operand from the
  synthetic placeholder (`nullExpr`) unary minus mints — a small AST/marker
  change — and then remove the carve-outs at one parse site and two runtime
  sites in lockstep.
- **Kind:** defect against the operator operand rule, rooted in a parser
  fidelity gap (two distinct source programs produce one AST).
  `docs/spec_topics/expressions.md:236` §"Other arithmetic": "`-`, `*`, `/`,
  `%` accept only numeric operands; any other operand pairing — for instance a
  `string`, `boolean`, **`null`**, … — is
  `theta/parse/non-numeric-arithmetic-operands`." A binary `-` with a `null`
  left operand is squarely inside that refusal set; the implementation instead
  evaluates it as unary negation of the right operand.
- **Related:**
  - 0332 (fixed 0.299.0) — minted the `-`/`*`/`/`/`%` parse gate
    (`checkArithmeticOperands`) whose synthetic-null carve-out this report's
    input class rides through. Its §Non-goals excludes **unary** `-`
    semantics; this report is not about unary `-` — it is about a spelled
    *binary* `-` being misclassified as unary.
  - 0338 (fixed 0.311.0) — mirrored 0332's runtime belt into the pure host;
    the mirrored belt inherits the same pre-belt unary short-circuit, so both
    hosts negate before the belt can see the pair.
  - 0084 (fixed 0.71.0) — the `--`-absorption precedent for "the parser builds
    a program the author did not write, with zero diagnostics".
- **Affected** (verified at af476df2, v0.347.0):
  - `src/parser/theta-document.ts:4387-4398` — `parseUnary`'s `-`/`!` arm:
    "Model unary as a binary with a synthetic `null` left so the AST union
    stays closed", via `nullExpr(op.range)` (`:5842-5845`), which returns
    `{ kind: "null", range }` — the **same node kind** the literal `null`
    parses to (`:4555`). Nothing marks the synthetic node, so
    `binary(-, null, 3)` is one AST for both `-3` and `null - 3`.
  - `src/parser/type-layer-checks.ts:3095-3103` — `walkExpr`'s binary arm
    gates arithmetic with `ARITHMETIC_OPS.has(e.op) && !(e.op === "-" &&
    e.left.kind === "null")`: the carve-out (correct for genuine unary nodes)
    necessarily also exempts the authored `null - x` pairing, so
    `checkArithmeticOperands` never judges it.
  - `src/runtime/statement-executor.ts:1021-1026` — `evalBinary`: `if (expr.op
    === "-" && expr.left.kind === "null")` evaluates only the right operand and
    returns `-(right.value as number)` — no numeric belt on this path (the
    0332 `BinaryNonNumericError` belt sits in `applyBinaryScalar`, which this
    early return bypasses), so `null - "a"` → `NaN` and `null - null` → `-0`
    (rendered `0`).
  - `src/extension/production-theta-producer.ts:7467-7469` —
    `evaluateBinaryExpression`'s identical carve-out on the pure host
    (interpolations, invoke/callable arguments): `if (op === "-" &&
    leftExpr.kind === "null") return -(evaluatePureExpression(rightExpr, env)
    as number)` — equally before the 0338 belt.
- **Observed at:** 0.347.0 (af476df2), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

The parser lowers unary minus to `binary(-, <synthetic null>, operand)` where
the synthetic placeholder is byte-identical in kind to a parsed literal
`null`. Every consumer that must special-case unary minus therefore keys on
`left.kind === "null"` — the 0332 parse gate's carve-out and both runtime
hosts' unary arms — and every one of them necessarily also captures the
authored program `null - x`. The result: `let x = null - 3` loads with zero
diagnostics (its sibling `null * 3`, which has no unary homograph, is
correctly refused) and evaluates to `-3`; `null - "a"` binds `NaN` and
`null - null` binds `0`, both silently, both bypassing even the 0332/0338
runtime belts because the unary short-circuit returns before the belt runs.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding.

| # | Source (body) | Parse | Runtime |
|---|---|---|---|
| C1 | `let x = null - 3` / `x` | `[]` | `outcome=success value=-3` |
| C2 | `let x = null - "a"` / `x` | `[]` | `outcome=success value=NaN` (JSON `null`) |
| C5 | `let x = null - null` / `x` | `[]` | `outcome=success value=0` (`-0`, normalised in rendering) |
| C4 (control) | `let x = null * 3` / `x` | `["theta/parse/non-numeric-arithmetic-operands"]` | — |
| C3 (control) | `let x = "a" - 1` / `x` | `["theta/parse/non-numeric-arithmetic-operands"]` | — |

C4 is the discriminating control: the identical `null` operand under `*` — an
operator with no unary homograph — draws the registered refusal, proving the
carve-out (not operand classification) is the mechanism.

## Expected behaviour

`docs/spec_topics/expressions.md:236` names `null` explicitly in the refusal
set for `-`: `null - 3` is `theta/parse/non-numeric-arithmetic-operands`, as
`null * 3` already is. No reading of the spec admits evaluating a spelled
binary subtraction as negation of its right operand. Unary `-3` (and `-x`)
must keep its current semantics unchanged.

## Actual behaviour / root cause

One AST node shape serves two source programs. `nullExpr` (synthetic) and the
literal `null` both produce `{ kind: "null" }`, so downstream consumers cannot
distinguish "the parser inserted this placeholder" from "the author wrote
`null`". The 0332 gate's exemption comment (`type-layer-checks.ts:3097-3102`)
documents the intent — "a synthetic-null unary node must not reach
`checkArithmeticOperands`" — but the predicate it can write (`e.left.kind ===
"null"`) is wider than the intent. Both runtime unary arms share the predicate
and sit before their hosts' numeric belts, so the misclassified pairing also
evades the 0332/0338 loud-throw discipline: `-(null)` → `-0` and `-("a")` →
`NaN` are computed and bound.

## Why it matters

The class is narrow but fully silent and value-corrupting: an author (or a
generator emitting theta) writing `null - x` — e.g. a mistaken "null-minus"
default or a template slot that degraded to the literal `null` — gets `-x`
instead of a load-time refusal, and the sign-flipped number flows onward as a
plausible value. It is also a latent trap for every future consumer that must
special-case unary minus: the parser offers no way to do it correctly. The
same homograph currently makes the static layer type `null - x` as `x`'s
type, so no secondary check catches it either.

## Non-goals

- Unary `-` on non-numeric operands (`-"a"` spelled with a genuine unary) —
  0332's recorded non-goal, a separate surface. This report's fix will,
  incidentally, make it expressible to belt that path later, but does not
  require it.
- The `!` unary form — `!` is not a binary operator, so no homograph exists.

## Fix

Make the synthetic placeholder distinguishable, then drop the wide predicate:

1. Mark the unary production: the binary node minted at
   `theta-document.ts:4395-4400` carries `unary: true`. No grammar change;
   the AST union stays closed. Caution against the alternative (a
   `synthetic: true` flag on every `nullExpr` mint): `nullExpr` has 15
   call sites and 14 are error-recovery fillers (`:2451`, `:2475`,
   `:4262`, `:4691`, `:5250`, …), so marking the mint would also brand
   recovery nulls and widen the change's blast radius — mark the one
   unary binary node instead.
2. `type-layer-checks.ts:3095` — carve out only the marked node, so the
   authored `null - x` reaches `checkArithmeticOperands` and draws
   `theta/parse/non-numeric-arithmetic-operands` (C1/C2/C5 become load
   failures, matching C4).
3. Both runtime unary arms (`statement-executor.ts:1021`,
   `production-theta-producer.ts:7467`) key on the same node marker; an
   authored `null` left operand then falls through to the belted binary path
   (`BinaryNonNumericError`), which is the correct laundered-path disposition.

Constraints: genuine unary minus (`-3`, `-x`, `- (a + b)`) stays
byte-identical on both hosts; C3/C4 controls unchanged; no new diagnostic code
(the registered row already covers the pairing).

## Provenance

Found by reading `evalBinary`'s unary detection against `parseUnary`'s
synthetic-null comment during the runtime-exec-2 re-sweep at af476df2 (the
"can two source programs share this AST?" question), then confirming the parse
gate's carve-out at `type-layer-checks.ts:3095`. All five rows probed offline
through the production executor harness before filing. Scratch probes deleted.

## Fix (0.378.0)

- What shipped:
  - `src/parser/theta-document.ts` — `BinaryExpr` gains an optional `unary?:
    boolean` marker; `parseUnary`'s `-`/`!` mint sets `unary: true` (§Fix step
    1). `nullExpr` itself is left unflagged — its 14 error-recovery call sites
    stay unbranded, as §Fix cautions.
  - `src/parser/type-layer-checks.ts` — the `walkExpr` arithmetic carve-out is
    re-keyed `ARITHMETIC_OPS.has(e.op) && e.unary !== true`, so an authored
    `null - x` reaches `checkArithmeticOperands` and draws
    `theta/parse/non-numeric-arithmetic-operands` (§Fix step 2). The separate
    `checkInterpolationOperands` carve-out is deliberately left keyed on
    `left.kind === "null"` — §Fix's one-parse-site scope.
  - `src/runtime/statement-executor.ts` — `evalBinary`'s unary arm keys on
    `expr.unary === true`; an authored `null` left falls through to
    `applyBinaryScalar`'s bug-0332 belt (`BinaryNonNumericError`) (§Fix step 3).
  - `src/extension/production-theta-producer.ts` — `unary` is threaded into
    `evaluateBinaryExpression`; its unary arm keys on the marker, so an authored
    `null` left falls through to the bug-0338 belt (§Fix step 3).
  - `src/parser/static-type-inference.ts` — comment-only: the stale runtime
    predicate cited in `#typeBinary`'s mirror comment updated to the marker
    (collateral of the producer edit; the wide static-layer detector stays).
- Gates: witness `tests/b0367-null-left-binary-minus.test.ts` 15/15 green;
  `tests/b0332-*` controls 15/15 green (genuine unary byte-identical); full
  default suite green (2 timing-sensitive real-spawn files timed out under
  concurrent-lane load — both green isolated, off this surface: load noise);
  `npm run typecheck` clean; `npm run lint` clean.
- Live: `tests/live/b0367live-null-left-minus-refusal-live-cell.test.ts` (new
  H8a registration-only load-refusal cell, the bug-0115 precedent) — GREEN
  under the fix (1/1: authored `null - 3` absent from `registeredNames()`, the
  genuine unary-minus control present) and RED-proven with the parse gate
  neutralised (the authored theta registered). Run under the campaign live-lock.
- Review: 1 round. `bug-fix-reviewer` → FINDINGS: F1 `prose` (stale runtime-
  predicate citation in `static-type-inference.ts` mirror comment) fixed
  comment-only via `bug-fix-fixer-light`; R1 `test` non-blocking residual. No
  `correctness`/`fidelity`/`spec` finding. Comment-only polish verified by
  gate-diff; confirmation round skipped.
- Verification: `bug-fix-verifier` → SOLID. Witness both directions (green →
  neutralise all three predicates → C1/C2/C5/RS/RP red with the fork symptom
  [parse `[]`, `success value -3`, `sent=["v=-3"]`] → restore byte-exact →
  green). Full suite green modulo 2 off-surface load-noise timeouts (green
  isolated). Live satisfied-by-orchestrator. Lint + typecheck clean.
- Residuals: 1. R1 — the witness loud-throw rows (RS/RP) assert the framing
  surface (`surfaceUnexpectedThrow` → `theta/runtime/internal-error`, message
  `/^internal error: /`) rather than the specific `BinaryNonNumericError`
  template. Non-vacuous — the reverse-proof reds them at the fork and the
  paired marker controls (RSc/RPc) pin the discriminator — so tightening the
  message match is deferred as low-value.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: genuine unary `-` on non-numeric operands
  (spelled `-"a"`) stays bug-0332's non-goal, now merely expressible to belt
  later; an interpolation `${null - 3}` is refused at RUNTIME (pure-host belt),
  not at parse, per §Fix's one-parse-site scope; no new diagnostic code (the
  registered `theta/parse/non-numeric-arithmetic-operands` row already covers
  the pairing).
