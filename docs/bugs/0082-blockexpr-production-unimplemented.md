# Bug 0082 — The `BlockExpr` production has no AST node: a `{ … }` block expression in `match`-arm-body or `let`-RHS position is parsed as a bare object literal and refused with `theta/parse/bare-object-literal`, so the escape hatch `theta/parse/statement-in-arm-body`'s own message directs authors to does not exist

- **Status:** fixed (0.191.0).
- **Kind:** defect. `grammar.md:118` and `:150` define `BlockExpr` and admit it
  as an `ArmBody`; expressions.md §"Arm syntax" and the
  `theta/parse/statement-in-arm-body` message both direct the author to it. No
  `Expr` variant models it, so the shipped parser reads the braces as an object
  literal and rejects.
- **Related:**
  - [0016](../../../docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md)
    (fixed 0.22.0) part B added the second `theta/parse/bare-object-literal`
    emission site and the shared message builder this report's diagnostic comes
    from. Same code, different trigger: 0016 was about a bare `{ … }` in
    *argument* position genuinely being a bare object literal; here the `{ … }`
    is a block expression and is not an object literal at all.
  - [0006](../../../docs/bugs/0006-leading-bracket-glued-as-index-access.md)
    (fixed 0.13.0) is the same family — a bracket form the grammar defines
    being consumed by the wrong production — at the statement-boundary layer.
- **Affected** (citations verified at HEAD `d06daae3`):
  - `export type Expr` (`src/parser/theta-document.ts:316–335`) — the closed
    expression node union, 19 arms: `IdentExpr`, `NumberExpr`, `StringExpr`,
    `BoolExpr`, `NullExpr`, `ArrayExpr`, `BinaryExpr`, `TernaryExpr`,
    `TryExpr`, `CallExpr`, `InvokeExpr`, `QueryExpr`, `MemberExpr`,
    `IndexExpr`, `ObjectExpr`, `MatchExpr`, `ResultCtorExpr`,
    `MethodCallExpr`, `ParForExpr`. There is no block-expression arm.
  - `bareObjectLiteralDiagnostic` (`:4842`) is the sole message builder; the
    structural walk emits it at `:6102` (`checkObjectExpr`, `:6090`) whenever
    `e.typeName === null` and the position is not the sole-Pi-tool-argument
    carve-out.
  - `tryConsumeArmBodyStatement` (`:3616`) — the arm-body statement guard —
    tests only for a leading `if` / `for` / `while` / `let` / `break` /
    `continue` / `return` keyword or a bare assignment (`:3617–3634`). A
    leading `{` is none of those, so the guard declines and the arm body falls
    through to ordinary expression parsing, which reads `{` as an
    `ObjectExpr`.
  - `executeBlock` (`src/runtime/statement-executor.ts:1517`) already
    implements the runtime semantics a `BlockExpr` needs — statements then a
    tail value — for `StmtBlock` and `FnBody`. Nothing routes an expression
    position to it.
- **Observed at:** 0.52.0 (`d06daae3`), offline, through the production
  whole-file parser (`parseThetaDocument`), reading the aggregated
  diagnostics.

## Summary

grammar.md gives `ArmBody ::= Expr | BlockExpr` and prints a worked example of
the block form. The parser has no block-expression node: `{` in expression
position produces an `ObjectExpr` with `typeName === null`, and the structural
walk refuses it as a bare object literal. The same happens on the `let` RHS,
the other position `grammar.md:114` names as expression-position. The result is
that the documented remedy for `theta/parse/statement-in-arm-body` — a
diagnostic whose message says "wrap statements in a block expression { ... }" —
is itself a parse error.

## Reproduction

Parse-only, through `parseThetaDocument`. The source is
`docs/spec_topics/grammar.md:155–164`'s own example, wrapped in minimal
frontmatter:

```theta
---
mode: prompt
---
let result = Ok(1)
let out = match result {
  Ok(s)  => s,
  Err(e) => {
    let mut count = 0
    count += 1
    2
  },
}
out
```

Observed diagnostics — exactly one:

```
severity: error
code:     theta/parse/bare-object-literal
message:  bare object literal not permitted in this position; name the schema (Schema { ... })
```

Second position, `let`-RHS:

```theta
---
mode: prompt
---
let x = {
  let y = 1
  y + 1
}
x
```

Observed: the same single `theta/parse/bare-object-literal`.

Control, same harness — a plain expression arm body parses clean:

```theta
let r = Ok(1)
let o = match r { Ok(s) => s, Err(e) => 0 }
o
```

Observed: `[]`.

Probe: throwaway vitest calling `parseThetaDocument` and collecting
`{code, severity, message}`; deleted after the run.

## Expected behaviour

- `docs/spec_topics/grammar.md:118` —
  `BlockExpr ::= "{" Stmt* Expr "}"   // expression-position; tail Expr
  required, value is the tail expression`.
- `:114` — "Theta distinguishes *expression-position blocks* (**the
  right-hand side of `let`**, `match`-arm bodies wrapped in `{ … }`, and any
  other position where a value is required) from *body blocks* … and from
  *statement-form control-flow blocks*".
- `:148–150` — `MatchArm ::= Pattern "=>" ArmBody`;
  `ArmBody ::= Expr | BlockExpr`.
- `:153–164` — "To execute statements before producing the arm's value, wrap
  them in a block expression:", followed by the worked example reproduced
  above.
- `docs/spec_topics/expressions.md:180` (§"Arm syntax") — "To execute
  statements before producing the arm's value, wrap them in a block expression
  `{ ... }` whose tail expression is the arm's value".
- `docs/reference/grammar.md:185`, `:257`, `:262` mirror all three.
- The `theta/parse/statement-in-arm-body` message the implementation itself
  emits (`src/parser/theta-document.ts:3640–3642`) reads: "match arm body must
  be an expression; **wrap statements in a block expression { ... }**".

## Actual behaviour / root cause

The expression grammar has no block form. `Expr`
(`src/parser/theta-document.ts:316`) enumerates 19 node kinds and none is a
block; the primary-expression parser therefore treats a leading `{` as the
start of an object literal in every expression position. `checkObjectExpr`
(`:6090`) sees `typeName === null` and, outside the sole-Pi-tool-argument
carve-out, pushes `bareObjectLiteralDiagnostic` (`:6102`).

`tryConsumeArmBodyStatement` (`:3616`) does not intervene: it fires on a
leading statement *keyword* or a bare assignment, and `{` is neither. So the
two arm-body dispositions the spec defines split into: bare statement →
`statement-in-arm-body` (implemented, witnessed green at
`tests/lexer-parser-diagnostics-production.test.ts:108`), wrapped statements →
`bare-object-literal` (should be admitted).

The runtime side is not the obstacle. `executeBlock`
(`src/runtime/statement-executor.ts:1517`) already produces a block's tail
value and is already the evaluator for `match` arm bodies' enclosing
constructs; `evalMatch` (`:1091`) evaluates the selected arm body through
`evalExpr`, which would dispatch a block node the same way it dispatches any
other. The gap is entirely in the parser's expression grammar.

## Why it matters

1. A documented language feature is unusable, and the diagnostic that exists to
   point authors at it points at another error. An author who writes
   `Err(e) => { let x = 1 \n x }` after being told to wrap statements in a
   block gets "bare object literal not permitted in this position; name the
   schema" — a message about a different construct that offers no path
   forward.
2. `match` arms are theta's only expression-level branching form, and arms are
   restricted to a single expression. Without the block form, an arm that needs
   any intermediate binding cannot be written at all: there is no `let` in
   expression position, no statement sequencing, and no `if` statement in arm
   position (that is `statement-in-arm-body`). The author's only recourse is to
   hoist the whole `match` into a `fn`.
3. The spec's own worked example does not parse. `docs/STYLE.md` requires
   non-trivial examples to be checked-in files that parse under the
   committed-fixture parse gate; this example lives only inline in
   `grammar.md`, which is why the gate never saw it.
4. The mis-parse is silent about its cause: one diagnostic, naming a construct
   the author did not write.

## Non-goals

- Not about `StmtBlock` (statement-form `if` / `while` / `for` bodies) or
  `FnBody`, both of which parse and execute correctly at this HEAD.
- Not about `theta/parse/statement-in-arm-body`, which fires correctly on its
  documented trigger.
- Not about `par for`'s block body, which has its own node (`ParForExpr`).
- Not a proposal to admit blocks in *additional* positions beyond the two
  `grammar.md:114` names.

## Fix

Options.

1. **Add a `BlockExpr` node.** Introduce `BlockExpr extends NodeBase { kind:
   "block"; body: Block }` to the `Expr` union, parse `{` in expression
   position as a block when the brace content is not a field list, and evaluate
   it through the existing `executeBlock`. Requires a disambiguation rule
   against `ObjectExpr`, since a bare `{ … }` is still
   `theta/parse/bare-object-literal` at every position where an object literal
   would have been intended.
2. **Disambiguate positionally.** Admit the block reading only at the two
   positions `grammar.md:114` enumerates (`match`-arm body, `let` RHS) and keep
   every other position's `bare-object-literal` behaviour unchanged. This
   sidesteps the general lookahead question: at those two positions a bare
   object literal is already an error, so reading `{` as a block cannot
   regress a currently-accepted program.
3. **Amend the spec** to delete `BlockExpr`. This contradicts three pages, the
   emitted `statement-in-arm-body` message, and leaves multi-statement arms
   unexpressible; recorded only for completeness.

Recommendation: option 2, implemented as option 1's node with a
position-gated parse. The tail-expression-required rule of `:118` gives a clean
error for a block with no tail, and the runtime already has the evaluator.

Constraints any fix must satisfy:

- A genuine bare object literal at a *non*-block position must keep drawing
  `theta/parse/bare-object-literal` from the shared builder (`:4842`) — the
  message must not drift (DIAG-4, and bug 0016's shared-builder invariant).
- `theta/parse/statement-in-arm-body` must keep firing for an *unwrapped*
  statement, so the two dispositions stay distinguishable.
- The block's value must be its tail expression, and a block with no tail
  expression in `BlockExpr` position must be an error, not the implicit `null`
  that `FnBody` / `StmtBlock` produce (`:118` vs `:119`/`:121`).

## Fix (0.191.0)

- What shipped:
  - `src/parser/theta-document.ts` — `BlockExpr { kind: "block"; body: Block }`
    added to the `Expr` union (§Fix option 1's node); `parseExpressionAtBlockSite`
    admits the block reading at exactly the two positions `grammar.md`
    §"Block expressions" names — a `let` / `let mut` initialiser and a `match`
    arm body (§Fix option 2's position gate) — with `looksLikeBlockAtBlockSite`
    reading the braces as an object literal iff the token after `{` is `}` or an
    ident/string immediately followed by `:`; `blockExprMissingTailDiagnostic`
    enforces the tail-required rule; `scanParForExpr` gained the `"block"` arm
    (with a copied `bodyLocals` set mirroring the runtime child scope) so the
    CTRL-4 par-for body restrictions still reach through a nested block.
  - `src/runtime/statement-executor.ts` — `evalExpr` routes `"block"` to the
    existing `executeBlock` in `env.child()`; `EvalResult` / `terminalFlow`
    carry the `return` / `break` / `continue` variants a block's own statements
    can produce.
  - `src/parser/static-type-inference.ts`, `src/parser/type-layer-checks.ts`,
    `src/extension/invoke-static-checks.ts` — a block's type is its tail's type,
    and every type-layer / call-site walk descends into the new node's body.
  - `src/extension/extension-tool-reachability.ts`,
    `src/extension/subagent-fn-static-checks.ts`,
    `src/parser/query-schema-resolve.ts`,
    `src/extension/production-theta-producer.ts` — the load-time reachability
    walk, the FN-6 cycle graph, Option-B query-schema resolution and the pure
    host each descend into a block body, so a call, a spawn edge, an `@`-query
    sink or a pure evaluation written inside a block is not silently invisible.
  - `docs/spec_topics/diagnostics/code-registry-parse.md`,
    `docs/reference/diagnostics.md` — the DIAG-2 registry row and its mirror for
    the new `theta/parse/block-expr-missing-tail` (E, parse, message
    `block expression must end in a tail expression`), placed adjacent to
    `theta/parse/statement-in-arm-body` so the two arm-body dispositions read
    together.
  - The three §Fix constraints hold: `bareObjectLiteralDiagnostic` and its
    message are untouched and every non-block position still draws it (including
    `let x = { a: 1 }` and `let x = {}`); `theta/parse/statement-in-arm-body`
    still fires for an unwrapped statement; a tail-less block is an error, never
    the implicit `null` `FnBody` / `StmtBlock` produce.
- Gates:
  - Witness run: `npx vitest run tests/blockexpr-production.test.ts` — RED at
    HEAD `1848fb65` (`Tests 10 failed | 7 passed (17)`, every red a
    `theta/parse/bare-object-literal` where the spec requires a clean parse or a
    `kind "object"` where `"block"` is required); GREEN after
    (`Tests 30 passed (30)`).
  - Full suite: `npm test` — baseline at HEAD `Test Files 375 passed (375)` /
    `Tests 7698 passed (7698)`; after `Test Files 376 passed (376)` /
    `Tests 7728 passed (7728)`. No pre-existing test flipped.
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean.
  - Lint: `npm run lint` — clean.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/blockexpr-production-live-cell.test.ts` —
    `Tests 1 passed (1)`, and red-direction proved with the parse site
    neutralised (`did not register … Registered: ["cellemaincontrol"]`) then
    restored byte-exact.
- Review: 2 rounds. Round 1 (deep) — six findings: four `correctness`
  (`scanParForExpr`, `extension-tool-reachability`, `subagent-fn-static-checks`
  and `query-schema-resolve` each had a `default:` arm that silently swallowed
  the new `"block"` kind) and two `prose` (a banned word in the new registry
  Remedy column; in-code comments citing a nonexistent "§Fix item 6/7"), plus
  two residuals, all fixed in one fixer round. Round 2 (fast) — CLEAN, no
  findings.
- Verification: verified.
  - Witness genuinely reds: five separate temporary neutralisations (both parse
    sites; the tail-required emission; the par-for `"block"` arm; the
    extension-tool and subagent-fn walker arms), each RED with quoted output and
    each restored byte-exact by writing the content back and matching
    `git hash-object` against the pre-edit hash.
  - Full default suite green (376 / 7728).
  - Live: a new H8a cell drives a real theta whose `let` RHS and `match` arm are
    both block expressions with statements before their tails, asserting real
    observables (registration off the settled `ExtensionRunner`, the fixture's
    arithmetic oracle in `userTexts`, no fail-closed `systemNotes`); the two
    nearest pre-existing H8a cells re-run green. H9a not run: the change is
    additive at two positions that previously always drew
    `bare-object-literal`, no committed fixture's disposition moves
    (`tests/committed-fixture-parse-gate.test.ts` 36/36 green), and no
    `permitted-codes.json` entry is implicated.
  - Lint and typecheck clean.
- Residuals:
  1. `rewriteExpr` in `src/parser/query-schema-resolve.ts` has no `"par-for"`
     arm, so an `@`-query inside a `par for` body skips Option-B schema
     resolution. Pre-existing, unrelated to the block node, found by the
     round-1 walker sweep and deliberately not touched.
  2. The block-arm tail rewrite in `query-schema-resolve.ts` passes the
     enclosing frames straight through with no labelled wrapper frame, where
     `"try"` and `"ternary"` prepend one for downstream message labelling.
     Functionally correct (witnessed by the typed-query-in-block cells);
     recorded as a labelling nicety, not a defect.
  3. `grammar.md`'s worked block-arm example still lives only inline and is
     therefore still outside the committed-fixture parse gate (§Why it matters
     item 3). The witness test now parses that exact source, but promoting the
     example to a checked-in fixture is a `docs/STYLE.md` obligation this fix
     did not take on.
  4. The bug doc's §Reproduction transcribes `grammar.md`'s example with an
     integer tail `2` where the spec page writes `"fallback"`; the witness
     fixture uses the doc's `2` so both arms are `integer`.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: §Non-goals holds unchanged — `StmtBlock`,
  `FnBody`, `theta/parse/statement-in-arm-body`'s own trigger and `ParForExpr`
  are untouched, and no third position admits the block reading. The `"block"`
  arm added to the par-for CTRL-4 scan is not an exception to the `par for`
  non-goal: it keeps the existing restrictions reaching a block *nested inside*
  a par-for body, and changes nothing about `ParForExpr` itself.

## Provenance

- Spec: `docs/spec_topics/grammar.md:112–124`, `:146–166`;
  `docs/spec_topics/expressions.md:180`;
  `docs/reference/grammar.md:185`, `:253–262`.
- Implementation: `src/parser/theta-document.ts:316–335`, `:3612–3668`,
  `:4834–4851`, `:6085–6105`; `src/runtime/statement-executor.ts:1091–1128`,
  `:1517–1543`.
- Existing reports read in full for duplicate separation: 0006, 0016.
- Observations: throwaway vitest parse probe at `d06daae3`, deleted after the
  run.
