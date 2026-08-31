# Bug 0345 — `walkExpr`'s `case "query"` runs only `checkQueryInterpolationResults` and returns without descending into the interpolation expression, so no operand check reaches a `${…}` expression at parse: `checkArithmeticOperands`, `checkPlusOperands`, and `checkOrderingOperands` are all absent from interpolation position — `${"a" + 1}` renders `a1` and `${"b" < 1}` renders `false` into the prompt with zero diagnostics, and `${"a" - 1}` parses clean where the byte-identical `let x = "a" - 1` refuses at load

- **Status:** fixed (0.317.0).
- **Sev/Diff estimate:** S1/D2 — S1 because `${a + b}` and `${a < b}` over
  operand pairings the spec refuses render a silently JS-coerced value into a
  user-visible prompt with no diagnostic on any channel (`${"a" + 1}` → `a1`,
  `${"b" < 1}` → `false`), where the byte-identical `let` RHS draws
  `theta/parse/mixed-plus-operands` / `theta/parse/non-orderable-operands`; the
  spelled-arithmetic silent-value sub-case is already belted loud at runtime by
  bug 0338, leaving there a load-vs-run refusal-timing divergence rather than a
  silent value. D2 because the fix is a localized descent — route the
  interpolation expression through `walkExpr` from the query arm — within the
  parser subsystem with no new registry row, but it flips bug 0122's pinned
  residual-1 interpolation cells, so it carries sibling-witness coordination.
- **Kind:** defect against the operator operand rules on the interpolation
  parse path. QRY-18
  (`docs/spec_topics/query/query-escapes-stringification.md#qry-18`): a
  `${expr}` interpolation "evaluates `expr` per the Expression Sublanguage",
  so the Expression-Sublanguage operand rules govern interpolation position —
  `docs/spec_topics/expressions.md` §"`+` operator" (`expressions.md:232`,
  mixed operands are `theta/parse/mixed-plus-operands`), §"Other arithmetic"
  (`expressions.md:236`, non-numeric operands are
  `theta/parse/non-numeric-arithmetic-operands`), and §"Ordering comparisons"
  (`expressions.md:240`, a non-`{numeric,numeric}`/non-`{string,string}` pair
  is `theta/parse/non-orderable-operands`). `walkExpr`'s `case "query"` enforces
  none of them: it calls `checkQueryInterpolationResults` (Result-ness only)
  and returns, never handing the interpolation expression to the binary arm
  that runs the three operand checks.
- **Related:**
  - [0122](./0122-template-interpolation-diagnostics-discarded.md)
    (fixed 0.149.0) — the report that added `walkExpr`'s `query` arm. Its §Fix
    routed only `checkQueryInterpolationResults` through the arm and explicitly
    **declined route 3 (type-layer descent)**, pinning the type-phase codes
    (`mixed-plus-operands` among them) as residual 1: measured absent from
    interpolation position, closing them is the declined route's job. Its
    witness `tests/interpolation-parse-diagnostics.test.ts` pins those cells
    (see §Fix flip candidates). This report owns closing residual 1's operand
    half.
  - [0332](./0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
    (fixed 0.299.0) — added `checkArithmeticOperands`, the arithmetic operand
    gate on the body-statement path. Its `## Fix (0.299.0)` §Residuals residual
    2 records this interpolation gap ("interpolation position ungated for all
    operand checks"); its dated 2026-08-30 discharge note closes residual 2's
    runtime half via bug 0338 and states the interpolation PARSE boundary
    "remains the pre-existing corpus-wide gate-boundary residual … out of
    0338's runtime-belt §Fix scope."
  - [0338](./0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md)
    (fixed 0.311.0) — belted the pure-host `evaluateBinaryExpression` so a
    non-number operand of spelled `-`/`*`/`/`/`%` in interpolation position now
    aborts loudly at runtime (`theta/runtime/internal-error`) instead of
    rendering `NaN`. §Non-goals bullet 3 defers this parse boundary explicitly:
    "Closing the interpolation parse boundary for all operand checks (routing
    the interpolation expression through `walkExpr`) is a broader, pre-existing
    corpus-wide concern." Its residual 1 names the same open item. The belt is
    this report's deferred-operand backstop and must stay green.
  - [0116](./0116-question-unwrapped-interpolation-renders-null.md)
    (fixed 0.128.0) and
    [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)
    (fixed 0.69.0) — the `?`-unwrap and `Result`-carrier interpolation-render
    dispositions. Neither owns the arithmetic / `+` / ordering operand checks
    this report measures.
- **Affected** (verified at HEAD, d7089572):
  - `src/parser/type-layer-checks.ts:3245`–`:3247` — `walkExpr`'s
    `case "query"`: calls `checkQueryInterpolationResults` (`:3246`) and returns
    (`:3247`); it does not re-enter `walkExpr` on the interpolation expression,
    so no operand check reaches a `${…}` expression.
  - `src/parser/type-layer-checks.ts:3080`–`:3103` — `walkExpr`'s
    `case "binary"`: dispatches `checkPlusOperands` (`:3092`),
    `checkOrderingOperands` (`:3094`), and `checkArithmeticOperands` (`:3103`).
    None runs on an interpolation expression — the `query` arm never routes the
    parsed interpolation expression back through here.
  - `src/parser/type-layer-checks.ts:3333`–`:3341` —
    `checkQueryInterpolationResults`: lexes the template (`lexQueryTemplate`,
    `:3337`) and parses each interpolation source (`parseExpressionSource`,
    `:3341`) only to classify its `Result`-ness; it invokes no operand check.
  - `src/parser/type-layer-checks.ts:3633` / `:3683` / `:3722` —
    `checkPlusOperands` / `checkOrderingOperands` / `checkArithmeticOperands`:
    the three operand checks, each firing only when both operands are
    statically resolvable and each unreachable from interpolation position.

## Summary

`walkExpr`'s `case "query"`
(`src/parser/type-layer-checks.ts:3245`–`:3247`) calls
`checkQueryInterpolationResults` and returns. It never descends into the
interpolation expression, and `checkQueryInterpolationResults`
(`:3333`) parses each interpolation source only to classify its `Result`-ness
— it never runs the operand checks the binary arm runs
(`:3080`–`:3103`): `checkPlusOperands` (`:3092`), `checkOrderingOperands`
(`:3094`), and `checkArithmeticOperands` (`:3103`). So every operand check is
absent from interpolation position. The measured net exposure post-bug-0338:

- **Spelled arithmetic — a refusal-timing divergence, no longer a silent
  value.** `${"a" - 1}` parses `[]` and, at render, throws the bug 0338
  belt (`BinaryNonNumericError`), which the producer's top-level surface frames
  as a `theta/runtime/internal-error` abort. The byte-identical `let x = "a" - 1`
  draws `theta/parse/non-numeric-arithmetic-operands` at load. Disposition is
  identical in kind (loud refusal) but differs in timing (run vs load) by
  position.
- **`+` and ordering — still wholly ungated, at parse and at runtime.**
  `${"a" + 1}` parses `[]` and renders `a1` (JS string concatenation);
  `${1 + "a"}` renders `1a`; `${"b" < 1}` parses `[]` and renders `false` (a JS
  boolean over mixed types). No belt covers these — bug 0338 belted only
  `-`/`*`/`/`/`%`. The byte-identical `let` RHS draws
  `theta/parse/mixed-plus-operands` / `theta/parse/non-orderable-operands`. The
  interpolation renders a silently JS-coerced value into the prompt — exactly
  the coercion QRY-18 exists to refuse — with no diagnostic on any channel.

## Reproduction

Offline, deterministic, through the production prompt-mode binding
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) driven against an in-memory
instant-settle session double (the
`tests/b0288-prompt-turn-completion-witness.ts` harness shape) that records the
prompt text handed to `pi.sendUserMessage`. Each source is prefixed
`---\nmode: prompt\n---\n`. Parse diagnostics are the recorded error-code
arrays.

| # | Surface | Source (body) | Parse | Runtime |
|---|---|---|---|---|
| i-interp | interpolation, arithmetic | `` @`v=${"a" - 1}` `` | `[]` | belt throws → framed `theta/runtime/internal-error` abort; no prompt sent |
| i-ctl | statement-level control | `let x = "a" - 1` / `x` | `[theta/parse/non-numeric-arithmetic-operands]` | — (refused at load) |
| ii-a | interpolation, `+` | `` @`v=${"a" + 1}` `` | `[]` | rendered prompt text `v=a1` (silent concatenation) |
| ii-b | interpolation, `+` | `` @`v=${1 + "a"}` `` | `[]` | rendered prompt text `v=1a` (silent concatenation) |
| ii-ctl | statement-level control | `let x = "a" + 1` / `x` | `[theta/parse/mixed-plus-operands]` | — (refused at load) |
| iii | interpolation, ordering | `` @`v=${"b" < 1}` `` | `[]` | rendered prompt text `v=false` (silent JS boolean) |
| iii-ctl | statement-level control | `let x = "b" < 1` / `x` | `[theta/parse/non-orderable-operands]` | — (refused at load) |
| num-ctl | interpolation, numeric | `` @`v=${1 + 2}` `` | `[]` | rendered prompt text `v=3` (byte-identical baseline) |

i-interp vs i-ctl is the refusal-timing divergence: the same operand pairing
refuses at load as a `let` RHS but at render as the interpolation. ii and iii
are the wholly-ungated surfaces: the interpolation admits and renders a
silently JS-coerced value the `let`-RHS control refuses at load. Scratch probe
(`b0345scratch` stem) written, run, and deleted; a case-insensitive sweep for
the stem left no source-tree residue (one stale entry remained in the
git-ignored `node_modules/.vite` vitest result cache).

## Expected behaviour

QRY-18 evaluates a `${expr}` interpolation "per the Expression Sublanguage", so
the operand rules of `expressions.md` §"`+` operator", §"Other arithmetic", and
§"Ordering comparisons" govern interpolation position. An interpolation
expression whose operands violate one of those rules must draw the same parse
diagnostic the byte-identical expression draws at `let`-RHS level —
`theta/parse/mixed-plus-operands`, `theta/parse/non-numeric-arithmetic-operands`,
or `theta/parse/non-orderable-operands` — refusing the theta at load rather than
rendering a JS-coerced value into the prompt. The spelled-arithmetic case must
draw its refusal at load like every other position, not defer to the bug 0338
runtime belt when the operands are statically resolvable. The disposition must
not depend on whether the expression sits in a `let` RHS or a `${…}`
interpolation.

## Actual behaviour / root cause

`walkExpr`'s `case "query"`
(`src/parser/type-layer-checks.ts:3245`) is:

```
case "query":
  this.checkQueryInterpolationResults(e, bindings);
  return;
```

It calls one checker and returns; it never re-enters `walkExpr` on the
interpolation expression. `checkQueryInterpolationResults` (`:3333`) lexes the
template (`lexQueryTemplate`, `:3337`), parses each interpolation source
(`parseExpressionSource`, `:3341`), and classifies only whether the parsed
expression is a `Result` — it invokes no operand check. So the three operand
checks the binary arm dispatches for a body-level expression —
`checkPlusOperands` (`:3092`), `checkOrderingOperands` (`:3094`), and
`checkArithmeticOperands` (`:3103`) — never run on an interpolation expression.
All three defer on statically-unresolvable operands (they mirror one another),
but a statically-resolvable mixed pair inside `${…}` is not deferred; it is
never examined.

At render, the interpolation evaluates on the pure host. For `-`/`*`/`/`/`%` the
bug 0338 belt in `evaluateBinaryExpression` now throws
`BinaryNonNumericError`, which propagates uncaught out of `executeBody` and the
producer's top-level surface frames as `theta/runtime/internal-error` — a loud
abort, but at render rather than load. For `+` and ordering there is no belt:
`"a" + 1` returns the JS concatenation `"a1"` and `"b" < 1` returns the JS
boolean `false`, and the QRY-18 renderer emits that value's text into the
prompt. No diagnostic is raised on any channel for the `+` and ordering cases.

## Why it matters

`${a + b}` and `${a < b}` over mixed operands render a silently corrupted value
into a user-visible prompt: `"a" + 1` becomes the literal text `a1` and
`"b" < 1` becomes `false`, with no author-visible sign that a value was coerced
and no diagnostic at parse or render. This is the exact JS coercion QRY-18 was
written to refuse ("`[object Object]` and comma-joined-array defaults would
silently corrupt prompts without any diagnostic for the author"), reached
through the operand rules it delegates to the Expression Sublanguage. The
spelled-arithmetic case no longer renders a silent value — bug 0338's belt
aborts it loudly — but it aborts at render instead of refusing at load, so an
author who moves an arithmetic expression from a `let` RHS into an
interpolation trades a load-time parse refusal for a runtime abort, and one who
moves a `+` or ordering expression trades a load-time refusal for a silent
wrong render.

## Non-goals

- The runtime belt on the pure-host `evaluateBinaryExpression` (bug 0338). It is
  this report's deferred-operand backstop for `-`/`*`/`/`/`%` and stays in
  place; the parse descent adds the load-time refusal in front of it, it does
  not remove the belt.
- The `?`-unwrap and `Result`-carrier interpolation-render dispositions (bugs
  0116, 0079) and `checkQueryInterpolationResults`' own Result-classification
  behaviour — unchanged; the descent runs alongside it, not instead of it.
- The QRY-18 stringification table for well-typed values (`array<T>` /
  Schema-typed object / enum wire-form rendering) — unchanged.
- The bare-path `${param}` / `${param.field}` form in the frontmatter `system:`
  field: its grammar restricts the expression to bare identifier paths, which
  carry no binary operator, so the operand checks have nothing to fire on there.
- Unary `-` in expression position — a §Non-goal in bugs 0332 and 0338
  (`walkExpr`'s binary arm already excludes the synthetic-`null` unary node from
  `checkArithmeticOperands`); not changed here.
- The compound-assignment forms `-=`/`*=`/`/=`/`%=` (bug 0314) — not an
  interpolation surface.

## Fix

Descend into the interpolation expression from `walkExpr`'s `case "query"` so
the three operand checks reach it, then let the existing binary arm do the
work. The natural shape parses each interpolation source (as
`checkQueryInterpolationResults` already does via `parseExpressionSource`) and
hands the parsed expression to `walkExpr` under the same `bindings`, so
`checkArithmeticOperands`, `checkPlusOperands`, and `checkOrderingOperands` —
and every other binary-arm and nested check — run on it. Bug 0338 calls this
descent "a superset of this fix"; bug 0122 records it as the declined "route 3
(type-layer descent)". No new registry row is minted: the three codes and their
spec sentences already exist.

Constraints the fix must hold:

- **Preserve `checkQueryInterpolationResults`.** Its `Result`-classification
  (INTERPOLATED_RESULT_CODE) and its "static where possible, runtime where not"
  posture (QRY-18's `Result` row) are unchanged. The descent runs in addition
  to it, not in place of it — do not double-emit for an interpolation that is
  both a `Result` and an operand violation without deciding the ordering
  deliberately.
- **Preserve QRY-18 render semantics** for every value that does not violate an
  operand rule: the numeric baseline `${1 + 2}` → `v=3` and every well-typed
  interpolation render byte-identically.
- **Keep bug 0338's belt witnesses green.** The belt remains the backstop for a
  statically-unresolvable non-number operand of `-`/`*`/`/`/`%` reaching the
  interpolation render; the parse descent only adds the load-time refusal for
  the statically-resolvable pairing that the belt currently catches at runtime.
  `tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts` cells stay green
  (its statically-resolvable arithmetic cells may flip from a runtime-belt
  observable to a load refusal — re-pin, do not weaken).
- **Deferral parity with the body-statement path.** The three checks defer on
  statically-unresolvable operands; the descent inherits that, so an
  interpolation over a withheld binder still reaches the runtime (belt for
  arithmetic; JS coercion for `+`/ordering, which the belt does not cover — the
  `+`/ordering runtime surface remains as-is, only the statically-resolvable
  parse refusal is added).

Measured flip candidates (the descent lands the parse refusal in front of cells
that currently pin interpolation silence or a coerced render):

- `tests/interpolation-parse-diagnostics.test.ts` (bug 0122) — cell (a11)
  pins `` @`x ${1 + "a"}` `` → `[]` as residual 1 (its `let`-RHS control draws
  `mixed-plus-operands`), and cell (f4) pins the render
  `` @`x ${1 + "a"}` `` → `RENDERED ["x 1a"]`. Both flip to the parse refusal
  `[theta/parse/mixed-plus-operands]` / a load refusal. Sibling cells in the
  same residual-1 group ((a9)–(a15)) are type-phase interpolation gaps the same
  descent closes; re-pin the arithmetic / `+` / ordering members, leave the
  non-operand members (`unknown-method`, `non-indexable-receiver`) to their own
  disposition.
- The numeric-control cells in `tests/b0338-*` and any interpolation-render
  test asserting a numeric baseline stay byte-identical.

Ordering dependency: none recorded in DECISIONS. The fix stands on the shipped
bug 0122 query arm and bug 0338 belt; both are landed.

## Provenance

Filed from bug 0338's `.pi/tmp/fixes/0338-report.md` §Residuals item 1, bug
0338's doc §Non-goals bullet 3 and §Fix (0.311.0) residual 1, and bug 0332's
doc §Residuals residual 2 with its dated 2026-08-30 discharge note (which
records the interpolation PARSE boundary as remaining open after 0338's runtime
belt). Reproduced offline at HEAD d7089572 (v0.311.0) through the production
prompt-mode binding: `${"a" - 1}` parsed `[]` and threw the bug 0338
`BinaryNonNumericError` belt at render, where `let x = "a" - 1` parsed
`[theta/parse/non-numeric-arithmetic-operands]`; `${"a" + 1}` parsed `[]` and
rendered `v=a1`, `${1 + "a"}` rendered `v=1a`, and `${"b" < 1}` parsed `[]` and
rendered `v=false`, where the `let`-RHS controls parsed
`[theta/parse/mixed-plus-operands]` and `[theta/parse/non-orderable-operands]`;
the numeric control `${1 + 2}` rendered `v=3`. The root cause was confirmed by
reading `walkExpr`'s `case "query"` (`src/parser/type-layer-checks.ts:3245`),
which calls `checkQueryInterpolationResults` and returns without re-entering
`walkExpr` on the interpolation expression, and `checkQueryInterpolationResults`
(`:3333`), which classifies only `Result`-ness. Ownership checked at HEAD: bugs
0122, 0332, and 0338 all record this parse boundary as a residual/non-goal and
are all fixed; no open bug owns the interpolation `walkExpr` query-arm operand
gap. Scratch probe deleted; case-insensitive sweep for its stem left no
source-tree residue.

## Fix (0.317.0)

- **What shipped:**
  - `src/parser/type-layer-checks.ts` — `walkExpr`'s `case "query"` now calls a
    new `checkQueryInterpolationOperands` AFTER the preserved
    `checkQueryInterpolationResults`, which parses each interpolation source (as
    the Result classifier already does via `parseExpressionSource`) and descends
    a new operand-only recursive walk `checkInterpolationOperands` over it,
    firing ONLY `checkPlusOperands` / `checkOrderingOperands` /
    `checkArithmeticOperands` (with the same synthetic-`null` unary-minus guard
    the binary arm uses) and recursing through `childExprs` to reach nested
    binaries; every pushed diagnostic is relocated to the enclosing query's
    `file`/`range` (QueryTemplatePart carries no per-interpolation offsets, the
    same location choice `checkQueryInterpolationResults` makes). The walk is
    OPERAND-SCOPED, not a full `walkExpr` re-entry: it runs no
    method-call/index/member/question check, so residual 1's non-operand half
    keeps its bug 0122 disposition. No new registry row (the three codes and
    their `expressions.md` spec sentences already exist).
  - `tests/b0345-interpolation-operand-checks-at-parse.test.ts` (new, offline) —
    the §Reproduction witnesses: mixed-`+`, ordering, statically-resolvable
    arithmetic (load refusal, no longer deferred to the bug 0338 belt), the
    numeric baseline `${1 + 2}` → `v=3`, withheld-binder deferral parity, the
    Result+operand co-existence ordering cell, top-level-`?` descent, refused-
    `match` no-bogus-row, and the par-for stated residual.
  - `tests/live/acceptance/b0345-interpolation-operand-refusal.test.ts` (new,
    live H9a) — offender `@`v=${1 + "a"}`` refuses registration through real
    `pi -p` (invoke→Err sentinel); numeric-interpolation control computes and
    drives a real turn (compute-from-inline-value).
  - `tests/interpolation-parse-diagnostics.test.ts` (bug 0122 witness) — the
    enumerated flips: cell (a11) `${1 + "a"}` and f4's `1 + "a"` render re-pinned
    from pinned silence to a load refusal; non-operand cells untouched.
  - `tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts` — the four
    statically-resolvable interpolation cells (`let s = "a"` / `${s <op> 1}`)
    re-pinned from a runtime-belt observable to a load refusal (§Fix constraint
    3, pre-authorized); A1 (withheld param → defers), numeric controls, and B3
    untouched.
  - `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json` — one
    sorted allowlist entry `theta/bug0345` for the new witness's fixture-path
    literal `/theta/bug0345.theta` (mirrors the `theta/bug0122` / `theta/bug0338`
    siblings; no diagnostic-code implication).
- **Deliberate double-emit ordering:** for an interpolation that is both a
  `Result` and an operand violation, `theta/parse/interpolated-result` precedes
  the operand code — `checkQueryInterpolationResults` stays first in the query
  arm and the operand descent is appended, so the descent runs IN ADDITION
  (§Fix constraint 1). Pinned by witness cell 6 with an order-sensitive assertion.
- **Gates (verbatim):** witness `npx vitest run tests/b0345-...test.ts` → 13
  passed; revert-of-the-descent-call → 7 of 13 red for the right reason
  (interpolation draws `[]` / drops the operand row), restored byte-exact
  (`git hash-object` = `a33a0e4c…`) → 13 passed. Full suite `npx vitest run` →
  494 files / 9674 tests passed. `npm run typecheck` clean; `npm run lint` clean.
  Live (under the shared lock) `… vitest.live.config.ts
  tests/live/acceptance/b0345-...test.ts` → 1 passed post-fix; reverted → the
  offline attribution guard reds in 11 ms with zero tokens, restored → 1 passed.
- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — findings F1
  (top-level `?` interpolation skipped the operand walk), F2 (refused `match`
  emitted a bogus operand row), F3 (par-for-in-interpolation not descended),
  F4 (two stale comments), R1/R2 (test hygiene); F1/F2/F4/R1/R2 fixed, F3
  recorded as a stated residual. Round 2 (`bug-fix-reviewer-fast`) — CLEAN.
- **Verification:** SOLID. Obligation 1 (witness reds on revert, greens on
  restore, hash byte-exact) discharged; obligation 2 (full suite 494/9674)
  discharged; obligation 3 (live end-to-end offender-refusal + numeric control,
  with a zero-token revert-red pair) discharged; obligation 4 (lint + typecheck
  clean) discharged.
- **Residuals:**
  1. Par-for-in-interpolation operand descent is NOT closed: `par for` is
     admitted in interpolation position but `checkInterpolationOperands` does
     not descend into its iterand/max/body (closing it requires replicating
     `walkExpr`'s par-for loop-variable scope handling, out of this fix's
     surface). A par-for-body operand violation still defers to the runtime
     (belt for spelled arithmetic; JS coercion for `+`/ordering), consistent
     with §Fix constraint 4's deferral posture. Pinned as a stated residual in
     the witness (`${par for x in ["a" - 1] { x }}` loads `[]`; its `let`-RHS
     control draws `non-numeric-arithmetic-operands`). No committed fixture or
     live theta exercises the shape (census gate green; live grep clean).
  2. Residual 1's NON-operand half at interpolation position (`unknown-method`,
     `non-indexable-receiver`, `question-on-non-result`) is explicitly NOT owned
     by this report and keeps its bug 0122 pinned disposition — the descent is
     operand-scoped by design (a full `walkExpr` re-entry would flip cells
     (a9)/(a10)/(a12)/(a14)/(a15), beyond the authorized set).
- **Discharge notes appended:** `docs/bugs/0122-...md` (dated 2026-08-31) —
  0122's declined route 3 (type-layer descent) is landed here for the operand
  checks; residual 1's operand half is closed, its non-operand half remains.
- **Pinned dispositions / non-goals:** §Non-goals stand — no unary-minus
  change, no compound-assign (0314), no `?`-unwrap/Result-render change
  (0116/0079), no QRY-18 stringification-table change, no frontmatter
  bare-path change. The bug 0338 belt stays the deferred-operand backstop
  (0332 Option-B and 0338 belt are landed law). No new registry row; the
  permitted-codes baseline is byte-unchanged.
