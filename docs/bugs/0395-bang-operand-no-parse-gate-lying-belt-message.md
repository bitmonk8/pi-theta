# Bug 0395 — Unary `!` on a statically-RESOLVABLE non-boolean has no parse gate despite §Truthiness naming `!` a boolean position: `let n = 5` / `!n` loads clean and aborts mid-run at the bug-0369 belt with a message asserting "the boolean-position type gate deferred" — a gate that never judged the operand, while the same operand under `if` is refused at load

- **Status:** open.
- **Kind:** defect against the §Truthiness parse rule, plus one lying
  diagnostic. `docs/spec_topics/expressions.md:61` (as amended by bug 0369's
  fix): "Only `true` and `false` are accepted in boolean position (`if`,
  `while`, `&&`, `||`, **`!`**, ternary condition). Using a non-boolean … is
  `theta/parse/non-boolean-condition`." The parse layer implements that
  refusal for five of the six listed positions and not for `!`; the runtime
  belt then fires on the resolvable operand with a message written for the
  deferred case only.
- **Related:**
  - 0369 (fixed 0.350.0) — added `!` to the spec's boolean-position list and
    belted `!` at runtime on both hosts. Its fix record's spec edit
    ("§Truthiness — `!` added to the boolean-position list") created the parse
    obligation this report measures as unimplemented; its §Fix scope was the
    RUNTIME disposition for deferred operands ("the parse gates' deferral on
    unresolvable operands — correct and kept"), and no witness cell pins the
    resolvable `!` spelling at parse.
  - 0332 (fixed 0.299.0) — the precedent that when the spec states an operand
    constraint at parse, a runtime-only belt is the wrong layer for the
    resolvable spelling ("the spec places the constraint at parse … a
    runtime-only belt lets the theta load and run to the first offending
    evaluation rather than refusing at load").
  - [0308](./0308-snk-h-fabricates-last-tool-respond-on-reachable-null.md)
    (fixed 0.335.0) — the one-mechanism precedent for this report's shape: a
    diagnostic whose message asserts a premise a second path defeats, filed
    and fixed as ONE bug with the false-message facet co-shipped, not split
    out.
  - Candidate runtime-belts-3/01 (unary `-`): the OTHER unary operator, whose
    gap is two layers deep (no gate AND no belt); `!`'s is one (no gate,
    lying belt message).
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/runtime/expression-evaluator.ts:566` — `export type BooleanPosition =
    "if" | "while" | "ternary-condition" | "&&" | "||"` — no `!` member; the
    docstring above it (`:561-564`) enumerates the same five, contradicting
    the spec's six-position list.
  - `src/parser/type-layer-checks.ts:3081-3092` — `walkExpr`'s binary arm
    dispatches `checkBooleanPosition` for `&&`/`||` (and the ternary arm at
    `:3070`); the parser models `!` as a binary (`op === "!"`), and no branch
    of the dispatch matches it, so the operand of `!` is never judged.
  - `src/runtime/statement-executor.ts:657-668` (`requireBoolean` →
    `BooleanPositionKindDefectError`) and the pure host's `!` arm
    (`src/extension/production-theta-producer.ts:7903-7911`) — the 0369 belt
    that catches the un-gated operand at runtime. Its message (probed):
    "internal defect: a boolean-position operand (condition, '&&', '||', or
    '!') requires a boolean, got number; a non-boolean value reached the
    runtime **after the boolean-position type gate deferred** (bug 0369)" —
    for the resolvable rows the gate did not defer; it never ran.
- **Observed at:** 0.382.0 (d63c5148), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`.

| # | Source (body) | Parse | Runtime |
|---|---|---|---|
| D1 | `let n = 5` / `let b = !n` / `b` | `[]` | `THREW BooleanPositionKindDefectError: … got number; … after the boolean-position type gate deferred (bug 0369)` |
| D4 | `let s = "x"` / `let b = !s` / `b` | `[]` | same, `got string` |
| D2 (control) | `let n = 5` / `if n { null }` / `null` | `["theta/parse/non-boolean-condition"]` | — |
| D3 (control) | `fn f(c) { !c }` / `f(0)` | `[]` (correct deferral) | same belt throw — correct for the LAUNDERED case |

## Expected behaviour

- `expressions.md:61`: `!` is a boolean position; a resolvable non-boolean
  operand is `theta/parse/non-boolean-condition` at load, exactly as D2's `if`
  spelling is. D1/D4 should be parse-refusals, not clean loads that abort at
  first evaluation through the `theta/runtime/internal-error` surface —
  `error-model.md` frames that surface as one no theta expression "causes",
  and a fully-typed `!5` is an ordinary authoring mistake, not an internal
  defect (the bug 0131 argument at the fn-arity position).
- Diagnostic honesty: the belt message's "after the boolean-position type gate
  deferred" clause must be true when rendered. For D1/D4 it asserts a judgement
  event that never occurred (the operand was `integer`/`string`, fully
  resolvable; the gate simply has no `!` arm).

## Actual behaviour / root cause

Bug 0369's fix wrote `!` into the spec's position list and belted both hosts'
runtime arms, but the parse-side dispatch was never extended: the
`BooleanPosition` union and `walkExpr`'s condition-position arms predate the
fix and still enumerate five positions. The belt, written for the deferred
class its report measured, hard-codes the deferral narrative into its message,
so the resolvable class it now also catches renders a false provenance.

## Why it matters

The theta loads, registers, and runs to the first `!` evaluation — possibly
after committed effects (queries sent, tools run; the no-rollback contract) —
then aborts with an "internal defect" framing that sends the author to the
wrong layer (a runtime/interpreter bug) for a static typo the sibling
spellings catch at load. Impact class 4 (diagnostics that lie: wrong layer,
wrong code, false message clause), with a load-vs-run timing hazard on the
committed-effects side.

## Non-goals

- The laundered-`!` runtime belt (D3) — bug 0369's, correct and untouched;
  only its message's deferral clause needs to stop asserting a falsehood once
  the resolvable class is gated (or be reworded to cover both).
- The `&&`/`||`/`if`/`while`/ternary parse gates — correct (D2).
- Unary `-` — sibling report in this batch, different rule family.

## Fix

1. Add `"!"` to `BooleanPosition` and dispatch `checkBooleanPosition` for the
   unary-`!` node in `walkExpr`'s binary arm (keyed on `op === "!"`,
   mirroring the 0367 `unary` marker discipline; judge `e.right` only — the
   synthetic `null` left must not be judged). `checkCompatible`'s existing
   `unknown` deferral keeps D3's laundered class flowing to the belt.
2. Reword the belt message's provenance clause (e.g. "…reached the runtime
   without a parse refusal") or gate the "deferred" wording on actual
   deferral — one string, both hosts. Item 2 is independently necessary,
   not discharged by item 1: `checkInterpolationOperands`
   (`src/parser/type-layer-checks.ts:3446-3474`) fires only the
   plus/ordering/arithmetic operand checks and never judges boolean
   position, so `${!s}` over a resolvable string still reaches the belt and
   still renders the false "deferred" clause after item 1 lands.
3. No spec change needed: expressions.md:61 already prescribes exactly this.

Sequencing: [bug 0392](./0392-unary-minus-no-operand-discipline.md) (unary `-`) edits the same
`walkExpr` binary dispatch chain (`type-layer-checks.ts:3078-3108`) and both
hosts' adjacent unary arms — land the two fixes in a known order; whichever
lands second rebases the other's line citations.

Constraints: D2/D3 byte-identical; boolean-literal and boolean-typed `!`
operands stay clean; `if !c { … }` over resolvable booleans unchanged.

## Provenance

Found by diffing expressions.md:61's six-position list against the
`BooleanPosition` union during the runtime-belts-3 sweep at d63c5148 — the
0369 fix updated the sentence and the runtime, not the parse dispatch. All
four rows probed offline through the production executor harness before
filing. Scratch probes deleted.
