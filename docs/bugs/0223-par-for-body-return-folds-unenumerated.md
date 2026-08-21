# Bug 0223 — CTRL-4 enumerates three `par for` body restrictions and does not name `return`, while the runtime FOLDS a body `return` into that iteration's `Ok` value: `return <expr>` inside a `par for` body loads with zero diagnostics and produces the element rather than exiting the enclosing `fn` or theta, which `return.md`'s first sentence and RET-1 state unconditionally — the identical statement inside a plain `for` body does exit, so one keyword carries two control-flow meanings discriminated only by which loop encloses it

- **Status:** fixed (0.170.0) — §Fix route (a) ENUMERATE-AND-REFUSE, recorded in
  §Fix (0.170.0) below. Filed as bug
  [0118](./0118-nested-fn-result-return-defers-to-runtime-panic.md)'s §Fix
  (0.162.0) *Residuals* item 1, which pins the shipped parse-side disposition in
  both directions and states that "whether a `par for` body should carry its own
  return regime is a CTRL-4 spec question this fix deliberately does not
  answer". Re-measured at HEAD for this filing, not copied: the residual records
  the parse verdict and names the fold; the runtime fold's observable value, its
  divergence from the plain-`for` spelling, and its reach across a nested loop
  boundary are measured here for the first time. §Fix is constraint-pinned, not
  settled — two routes are named and neither is chosen. No ordering dependency:
  nothing blocks this and it blocks nothing.
- **Sev/Diff estimate:** S2/D2 — S2 because a written `return <expr>` in a
  `par for` body loads with zero diagnostics on any channel (§Reproduction A, B,
  G, I, J, K) and then means the opposite of what `docs/spec_topics/return.md:3`
  and RET-1 (`:19`) state: measured, the enclosing scope is not exited and the
  loop's tail continues (I yields `42`, the statement after the loop), where the
  same statement in a plain `for` body exits with `1` (H). No data is corrupted
  and no diagnostic is falsified — the divergence is a silently different value
  and control path for a shape the corpus never enumerates. D2 because the
  runtime side is one `switch` arm (`src/runtime/statement-executor.ts:1266–1269`)
  and the parse side is one already-present, already-non-emitting `case "return"`
  in the CTRL-4 body scan (`src/parser/theta-document.ts:4675–4679`), so either
  route is a small edit; the cost is the adjudication and its coordination — the
  refuse route mints a code and inherits bug
  [0200](./0200-par-codes-missing-from-sharded-registry.md)'s open question about
  which sharded registry page hosts a `par-*` row, and either route flips or
  extends the five cells 0118 pinned (`tests/par-for.test.ts:1059`, `:1086`,
  `:1117`, `:1148`, `:1169`).
- **Kind:** defect — spec and implementation together, one element, measured at
  HEAD `c7c5d828` (v0.163.0, `package.json:3`).

  CTRL-4 (`docs/spec_topics/control-flow.md:76`, anchor
  [`#ctrl-4`](../spec_topics/control-flow.md#ctrl-4)) closes the `par for` body's
  restriction list at three items: an enclosing-conversation `@` query
  (`theta/parse/par-query-in-body`), assignment to an outer `let mut`
  (`theta/parse/par-shared-mutation`), and `break` / `continue`
  (`theta/parse/par-break-continue`). `return` appears nowhere in it, and no
  other rule in the corpus assigns a `par for` body a return regime. The
  Return Statement page states the unconditional rule instead: "`return expr`
  exits the enclosing function (or top-level theta) immediately, producing
  `expr` as the value of that scope" (`docs/spec_topics/return.md:3`; the
  user-facing mirror repeats it at `docs/reference/grammar.md:530`). The runtime
  does neither: `runParForIteration` folds `flow.kind === "return"` into
  `makeOk(flow.value)` through the same `switch` arm as a normal body completion
  (`src/runtime/statement-executor.ts:1266–1269`), so the `return` is consumed at
  the iteration boundary and its operand becomes that element's value. The
  contrast site is one function away: `executeFor` returns a `return` flow
  outward unchanged (`:1673`), which is how H exits and I does not.
- **Affected** (every citation verified against the tree at HEAD `c7c5d828`,
  v0.163.0; symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication, and because 0118's fix record records unswept
  `theta-document.ts` line drift as its own residual 5):
  - **The unenumerated rule** — `docs/spec_topics/control-flow.md:76`, CTRL-4
    (anchor `#ctrl-4`), inside the `par for` section (anchor `#par-for`, heading
    `:58–59`). Its restriction list is `par-query-in-body`,
    `par-shared-mutation`, `par-break-continue`; it names `return` in no clause.
    `:74` — CTRL-3, which defines the element value as "the body tail type
    (absent tail → `null`)" and mentions no other source for it. `:78` — CTRL-5,
    which does specify one non-tail element source: "a postfix `?` inside the
    body propagates to the iteration's result, not out of the loop".
  - **The rule the fold contradicts** — `docs/spec_topics/return.md:3` (the
    unconditional sentence), `:19` (RET-1: `return`'s operand is checked against
    the enclosing scope's declared return type, or participates in that scope's
    inferred return type), `:20` (RET-2, the bare-`return` rule the parse side
    already applies through the enclosing scope), `:22` (RET-3, the
    unreachable-code warning measured in C), `:23` — "The `?` operator's
    `Err`-arm desugaring is literally `return Err(e)`". Mirrors:
    `docs/reference/grammar.md:530` (the same unconditional sentence), `:543`
    (the same desugaring claim), `:285–286` — "`ParForBody` behaves as a
    `Result<T, QueryError>` scope: a postfix `?` inside it propagates to that
    iteration's element, not out of the loop", the closest text in the corpus to
    the measured fold, which names `?` and not `return`. `:267–269` — the
    `ParForExpr` / `MaxClause` / `ParForBody` productions.
  - **The runtime fold** — `runParForIteration`
    (`src/runtime/statement-executor.ts:1209`), the `switch (flow.kind)` at
    `:1266` whose `case "normal"` and `case "return"` share one body,
    `return { kind: "result", result: makeOk(flow.value), diagnostics }`
    (`:1268–1269`). `:1274–1276` — the separate `case "propagate"` that carries
    CTRL-5's `?` rule, so the `?` desugaring `return.md:23` states is not the
    mechanism this fold uses. `:1240–1259` — the ERR-20 iteration-boundary catch,
    the only body-boundary behaviour CTRL-5 does specify. `:1306` — `evalParFor`,
    the caller that collects the per-element results.
  - **The plain-`for` contrast** — `executeFor`
    (`src/runtime/statement-executor.ts:1639`): `:1667` swallows a `break`,
    `:1670` continues on `continue` / `normal`, and `:1673` returns any other
    flow — including `return` — outward. `:1490–1498` — the `case "return"` that
    mints the flow (`{ kind: "return", value: null }` bare at `:1492`, the valued
    form at `:1498`).
  - **The parse-side site an enumeration would use** — `scanParForStmt`
    (`src/parser/theta-document.ts:4595`), the CTRL-4 body scan reached from
    `emitParForBodyDiagnostics` (`:4573`) through `scanParForBlock` (`:4581`).
    Its `case "return"` (`:4675–4679`) walks the operand for nested query
    violations and emits nothing. The shape a refusal would copy is the
    `break` / `continue` arm four cases up (`:4622–4636`, the code at `:4630`),
    which is depth-discriminated by the scan's `loopDepth` parameter
    (`loopDepth === 0` at `:4627`) — measured relevant, because a `return`
    inside a nested plain `for` in the body still folds (K) where a `break`
    there is legal and targets the inner loop. `:4687` — `scanParForExpr`;
    `:4699–4706` — its nested-`par for` arm, which scans the inner iterand and
    `max` but not the inner body.
  - **The walk that decides the parse verdict today** — `walkExpr`
    (`src/parser/theta-document.ts:7413`), whose `case "par-for"`
    (`:7637–7648`) is bug 0118's §Fix (a) arm: it hands the body
    `{ ...scope, inLoop: true, topLevel: false }` (`:7647`), so `voidReturn`
    INHERITS from the enclosing scope. `:6426` — the `voidReturn` field of the
    walk context; `:6662`, `:6670` — the two whole-document entries that set
    `voidReturn: false`; `:7180` — the `fn` arm, the only site that sets it from
    an annotation (`s.returnType === "void"`); `:7187–7199` — `walkStatement`'s
    `case "return"`, which asks `checkBareReturn` only for the bare form
    (`:7188`, the call at `:7191`) and otherwise walks the operand (`:7197`).
    That inheritance is why
    D draws `theta/parse/bare-return-in-non-void` and A / B / G / I / J / K draw
    nothing.
  - **The bare-`return` predicate** — `checkBareReturn`
    (`src/parser/functions.ts:379–393`): `undefined` when
    `returnTypeIsVoid`, else `theta/parse/bare-return-in-non-void` with the
    registered message `missing return value` (`:389`, `:392`). Correct over its
    input; it is asked the enclosing scope's question, never a `par for` body's.
  - **The registry rows in play** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:85` (
    `theta/parse/bare-return-in-non-void`, Sev `E`, Phase `type`, *Trigger*
    "Bare `return` (no argument) in a function or theta whose return type is not
    `void`"), `:86` (`theta/parse/unreachable-code`, Sev `W`, Phase `parse`).
    Neither row mentions `par for`. `docs/reference/diagnostics.md:134`, `:135` —
    their mirrors; `:119–121` — the three `theta/parse/par-*` rows, which exist
    only on that mirror page; `:314–315` — the note recording that provenance,
    which is bug [0200](./0200-par-codes-missing-from-sharded-registry.md)'s
    subject and is the registry constraint a newly minted `par-*` code inherits.
  - **The cells that pin the shipped parse disposition** —
    `tests/par-for.test.ts:1058` (the describe), with the header comment at
    `:1035–:1056` that states the rule, names the runtime fold, cites
    `src/runtime/statement-executor.ts:1266–1269`, and declares this subject
    separate and undecided. The five cells: `:1059` (r24, bare `return` in a
    top-level `par for` body → `bare-return-in-non-void`), `:1086` (r25, the same
    inside a non-void `fn`), `:1117` (r26, silent inside a `fn(): void`),
    `:1148` (r27) and `:1169` (r28) — a valued `return` silent in both enclosing
    shapes. `:625`, `:649` — (r8) and its control, the RET-3 pair for a `return`
    inside a `fn` under a `par for`. All six are parse-only.
  - **Test coverage of the runtime fold: none.** No cell in the suite executes a
    `par for` whose body contains a `return`. The only `return`-bearing `par for`
    sources in `tests/` are the six parse cells above (measured:
    `rg -n "par for" -A 4 tests/**/*.ts` yields no other body `return`). The
    runtime `par for` group drives `executeBody` over tail-expression bodies
    only (`tests/par-for.test.ts:1529` onward).
  - **Committed corpus exposure: one file, no body `return`.**
    `docs/examples/fan-out-reviews.theta:19–21` is the only committed `.theta` /
    `.thetalib` containing a `par for` (measured: one file), and its body is a
    single `?`-bearing tail call. So no shipped source's load or value moves
    under either §Fix route.
  - **Adjacent locks a fix must not disturb** — bug
    [0140](./0140-bare-schema-reference-value-position-silent.md)'s cell g9
    (`tests/type-name-as-value-refusal.test.ts:1733`), which pins the identifier
    walk's `par for` non-reach as a REACH FACT and was held byte-unchanged
    through 0118's fix; and bug
    [0128](./0128-non-literal-by-field-loads-silently.md)'s witness
    (`tests/non-literal-by-field-refusal.test.ts`), a protected
    `theta-document.ts` citation holder in the same 0118 change.
- **Observed at:** `0.163.0` (HEAD `c7c5d828`). Offline, deterministic,
  provider-free: no live model, no network. One scratch vitest file over the
  real `parseThetaDocument` and the real tree-walking driver `executeBody`
  (`src/runtime/statement-executor.ts`), with a `StatementEvalHost` that
  evaluates only literals, the loop-variable identifier, arrays and arithmetic
  binaries and runs no effects — the `par for` fan-out, flow handling and
  element collection are the production code paths. Written, run, deleted;
  `src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
  unmodified by this filing.

## Summary

`par for`'s body-restriction list is closed at three items and `return` is not
one of them (`docs/spec_topics/control-flow.md:76`). Nothing else in the corpus
gives a `par for` body its own return regime, so the Return Statement page's
unconditional rule applies by default: `return expr` exits the enclosing
function or top-level theta immediately, producing `expr` as that scope's value
(`docs/spec_topics/return.md:3`, RET-1 at `:19`).

Measured, that is not what happens. A `return <expr>` anywhere under a `par for`
body loads with zero diagnostics, and at run the iteration boundary consumes it:
`runParForIteration` folds `flow.kind === "return"` into `makeOk(flow.value)`
through the same arm as a normal body completion
(`src/runtime/statement-executor.ts:1266–1269`). The operand becomes that
element's value, the rest of the body is skipped, and the enclosing scope is not
exited — the statement after the loop runs. The plain `for` spelling of the same
source does exit, because `executeFor` propagates the flow outward (`:1673`).
§Reproduction H and I are that pair: `for` yields `1`, `par for` yields `42`.

The parse side is silent for a consistent reason, not by omission. Bug 0118's
§Fix (a) gave the parse-phase structural walk a `par-for` arm that inherits the
enclosing scope's `voidReturn` (`src/parser/theta-document.ts:7647`), so RET-2's
bare-`return` question is asked against the enclosing `fn`'s annotation — which
is why a bare `return` in a `par for` body inside a `fn(): void` is admitted (D)
and the identical statement inside a non-void `fn` is refused. That verdict is
pinned in both directions by five cells (`tests/par-for.test.ts:1059`, `:1086`,
`:1117`, `:1148`, `:1169`) whose own header declares the return regime a
separate, undecided subject. The CTRL-4 body scan has an existing
`case "return"` that walks the operand and emits nothing
(`src/parser/theta-document.ts:4675–4679`).

Two texts already describe the fold's shape for a neighbouring construct and
neither reaches `return`. CTRL-5 (`control-flow.md:78`) and the grammar mirror
(`docs/reference/grammar.md:285–286`) both state that a postfix `?` in the body
propagates to the iteration's element rather than out of the loop; RET-1's own
closing clause states that `?`'s `Err` arm "desugars literally to
`return Err(e)`" (`return.md:23`, mirror `grammar.md:543`). Read together, those
three sentences imply the measured fold — yet the implementation reaches it
through a different flow kind (`case "propagate"`,
`statement-executor.ts:1274–1276`), no rule states it for a written `return`,
and the Return Statement page states the opposite. The corpus therefore supports
both readings and settles neither.

## Reproduction

Offline at `c7c5d828`. Each row is one `parseThetaDocument` call over the real
whole-file parser; the rows reporting a value additionally run `executeBody`
over the parsed body with a pure host (literals, the loop variable, arrays,
arithmetic). `diagnostics` is the whole unfiltered diagnostics array with each
entry's start line; `value` is `exec.result` verbatim. Frontmatter is absent
throughout.

### A `return <expr>` in a `par for` body loads clean

```theta
fn outer(): integer {
  let xs = par for i in [1, 2, 3] {
    return i * 10
  }
  1
}
let n = outer()
n
```

```
@@ A — as written (a `par for` in a NON-VOID `fn`)
   diagnostics :: []
@@ B — the same body at the top level (`let xs = par for i in [1, 2, 3] { return i * 10 }`)
   diagnostics :: []
@@ G — `return 7` in a `par for` body inside `fn outer(): integer`, loop value discarded
   diagnostics :: []
@@ F — CONTROL: `return i` inside a PLAIN `for` body inside `fn outer(): integer`
   diagnostics :: []
```

RET-1 admits the valued form at any enclosing scope, so the parse silence is
correct against the rule the walk applies; F shows it is the same silence the
legal spelling gets.

### The runtime folds the `return` into the iteration's value

```
@@ C — `return i * 10` first, then a tail `0`, at the top level
   diagnostics :: ["warning theta/parse/unreachable-code @3"]
   value       :: {"present":true,
                   "value":[{"ok":true,"value":10},{"ok":true,"value":20},
                            {"ok":true,"value":30}]}
@@ E — CONTROL: the same loop with `i * 10` as a TAIL EXPRESSION, no `return`
   diagnostics :: []
   value       :: byte-identical to C
```

The `return`'s operand is the element value and the body's tail is skipped —
RET-3 reports the skip as a warning (`unreachable-code`, `:22`), so the early
exit within the body is the specified part. The element values are
indistinguishable from the tail-expression control.

### The enclosing scope is not exited — and the plain `for` spelling does exit

```
@@ I — `let xs = par for i in [1, 2] { return i }` then a top-level `42`
   diagnostics :: []
   value       :: {"present":true,"value":42}
@@ H — CONTROL: `for i in [1, 2] { return i }` then a top-level `0`
   diagnostics :: []
   value       :: {"present":true,"value":1}
```

Same keyword, same position relative to its loop, two control-flow meanings: in
H the theta exits with the loop body's value and never evaluates its tail; in I
the theta's tail is the value and the `return` is invisible outside its
iteration. Nothing in the source distinguishes them but `par`.

### The fold reaches through nested blocks and through a nested loop boundary

```
@@ J — `return 5` inside an `if true { … }` in the body, body tail `9`
   diagnostics :: []
   value       :: [{"ok":true,"value":5},{"ok":true,"value":5}]
@@ K — `return j` inside a NESTED PLAIN `for j in [7]` in the body, body tail `9`
   diagnostics :: []
   value       :: [{"ok":true,"value":7},{"ok":true,"value":7}]
@@ L — CONTROL: `break` at the same position as K's enclosing statement (body depth 0)
   diagnostics :: ["error theta/parse/par-break-continue @2"]
```

K is the asymmetry against CTRL-4's nearest analogue. `break` / `continue` are
refused only at body depth 0 (`theta-document.ts:4627`) precisely because at
depth > 0 they target the inner loop and stay inside the iteration; a `return` at
depth > 0 does NOT stay inside the inner loop — it crosses it (`:1673`) and is
consumed at the `par for` boundary. So the depth rule CTRL-4 states for its one
enumerated control-flow keyword does not transfer.

### The bare form is judged by the enclosing scope

```
@@ D — `return` (bare) in a top-level `par for` body
   diagnostics :: ["error theta/parse/bare-return-in-non-void @2"]
   value       :: [{"ok":true,"value":null},{"ok":true,"value":null}]
```

RET-2's verdict is the enclosing scope's (the walk arm at
`theta-document.ts:7647` inherits `voidReturn`), and the runtime folds the
value-less `return` to `Ok(null)` regardless. This row is bug 0118's cell (r24)
re-measured; the `value` half is new here.

## Expected behaviour

Both candidate rules are stated in the corpus today, and they are incompatible.

**The Return Statement page**, unconditionally
(`docs/spec_topics/return.md:3`; mirror `docs/reference/grammar.md:530`):

> `return expr` exits the enclosing function (or top-level theta) immediately,
> producing `expr` as the value of that scope. `return` is a statement, not an
> expression.

RET-1 (`:19`) adds the typing consequence: the operand is checked against the
enclosing scope's declared return type, or participates in that scope's
inferred return type alongside the tail expression. Under this reading the
measured behaviour is wrong twice — the enclosing scope is not exited (I), and
the operand contributes to an element type rather than to the enclosing scope's
return type.

**CTRL-4** (`docs/spec_topics/control-flow.md:76`) closes the body's restriction
list at an enclosing-conversation query, outer-`let mut` assignment, and
`break` / `continue`. Under this reading a `return` in the body is admitted, and
CTRL-3 (`:74`) is then incomplete, because it derives the element value from
"the body tail type" alone while a body `return` supplies it too.

**CTRL-5** (`:78`) and the grammar mirror (`docs/reference/grammar.md:285–286`)
state the fold for the neighbouring construct: a postfix `?` propagates to the
iteration's element, not out of the loop. `return.md:23` and `grammar.md:543`
then state that `?`'s `Err` arm "desugars literally to `return Err(e)`". Chained,
those three sentences describe exactly the measured fold — but only for the
desugared spelling, and the implementation reaches the `?` case through a
distinct flow kind (`statement-executor.ts:1274–1276`), so no sentence covers a
written `return`.

Expected, on the rows §Reproduction reports:

- one rule governs a body `return`, stated where a reader looks for it — a
  clause of CTRL-4 (the list that closes the body's restrictions) and a clause
  of `return.md` (the page that states `return`'s unconditional meaning), in
  agreement;
- the same rule covers every depth §Reproduction exercises: directly in the body
  (B), inside a nested `if` (J), inside a nested plain `for` (K), and inside a
  `par for` nested in a `fn` (A, G) — CTRL-4's existing depth discrimination for
  `break` / `continue` does not transfer, so the rule must say what it does at
  depth > 0;
- the bare form's verdict is derived from the same rule as the valued form. Today
  the bare form's diagnostic comes from the ENCLOSING scope's annotation (D) and
  the valued form's value comes from the ITERATION — one statement judged by one
  scope and executed by another;
- CTRL-3's element-value sentence names every source of an element value that
  the chosen rule leaves reachable;
- a legal `par for` is unaffected: a body with no `return` keeps loading with
  zero diagnostics and keeps its tail-expression element values (E).

## Actual behaviour / root cause

**The iteration boundary consumes the flow.** `executeBlock` returns a
`{ kind: "return", value }` flow for a body `return`
(`src/runtime/statement-executor.ts:1490–1498`). `runParForIteration` (`:1209`)
switches on that flow (`:1266`) with `case "normal"` and `case "return"` sharing
one body: `makeOk(flow.value)` (`:1269`). The `return` therefore never leaves the
iteration, and its operand is indistinguishable from a tail expression's value
(§Reproduction C versus E). The neighbouring arms show the boundary's other
decisions are all deliberate and documented: `break` / `continue` fall to a
defensive `Ok(null)` with a comment naming the parser refusal (`:1270–1273`),
`propagate` carries CTRL-5's `?` rule (`:1274–1276`), `fail` and `cancel` carry
the rest of CTRL-5. `case "return"` is the one arm with no rule behind it.

**A plain `for` in the same position does the opposite.** `executeFor` (`:1639`)
swallows `break` (`:1667`), continues on `continue` / `normal` (`:1670`) and
returns every other flow outward (`:1673`). That single line is the whole
difference between §Reproduction H and I, and it is also why K folds: the
`return` propagates out of the nested plain `for` and lands at the `par for`
boundary, where it is consumed.

**The parse side asks the enclosing scope's question.** Bug 0118's §Fix (a) arm
(`src/parser/theta-document.ts:7637–7648`) hands the body
`{ ...scope, inLoop: true, topLevel: false }` — `voidReturn` inherits, matching
the `for` and `while` arms. `walkStatement`'s `case "return"` (`:7187–7199`) then
asks `checkBareReturn` (`src/parser/functions.ts:379–393`) with
`returnTypeIsVoid: scope.voidReturn` for the bare form only, and walks the
operand for the valued form. So the valued form asks no question at all (A, B,
G, I, J, K report `[]`) and the bare form inherits a verdict from a scope the
runtime will not return to (D).

**CTRL-4's own scan has the arm and emits nothing.** `scanParForStmt`
(`:4595`) is the parser's dedicated CTRL-4 body walk. Its `case "return"`
(`:4675–4679`) descends into the operand — so a query hidden in a `return`'s
operand is still `par-query-in-body` — and pushes no diagnostic. The
`break` / `continue` arm four cases up (`:4622–4636`) is the shape a refusal
would take, gated on `loopDepth === 0` (`:4627`). No third behaviour exists at
this site: the scan either refuses the statement or admits it silently.

**No test observes the fold.** The six `return`-bearing `par for` cells in the
suite are parse-only (`tests/par-for.test.ts:625`, `:649`, `:1059`, `:1086`,
`:1117`, `:1148`, `:1169`), and the runtime group drives tail-expression bodies
(`:1529` onward). The fold is described in a comment (`:1048–:1053`) and asserted
nowhere, so a change to `statement-executor.ts:1266–1269` reds nothing.

## Why it matters

- **One keyword, two control-flow meanings, no diagnostic and no rule.**
  §Reproduction H and I differ by the token `par` and disagree about which value
  the theta returns. Neither spelling draws anything on any channel, and the
  page a reader consults for `return` states the H behaviour without exception
  (`return.md:3`).
- **`for` → `par for` is a silent semantic change for any early-exit loop.** The
  documented idiom for an early exit is a `return` inside a `for` — the Return
  Statement page's own example is exactly that shape (`return.md:6–14`).
  Parallelising such a loop compiles clean and changes what the enclosing
  function returns: measured, the function's post-loop code runs and the
  `return`'s operand is buried in an element of the result array.
- **The bare form is judged by a scope the runtime never returns to.** D's
  refusal is computed from the enclosing `fn`'s annotation, while the value the
  statement actually produces belongs to the iteration. A `fn(): void` enclosure
  therefore admits a bare `return` whose measured effect is an `Ok(null)`
  element, not a void exit.
- **CTRL-4's depth rule does not transfer, so a reader cannot extrapolate.**
  `break` is legal at body depth > 0 because it stays inside the iteration; a
  `return` at the same depth crosses the inner loop and is consumed at the
  `par for` boundary (K). Any rule written for `return` must state its depth
  behaviour rather than inherit the neighbouring one.
- **CTRL-3 under-describes the element value.** It derives the element type from
  the body tail alone, while a body `return`'s operand supplies it too — so a
  body whose tail and whose `return` operands disagree in type has no stated
  element type. Measured only for uniform-type bodies here; the divergent case is
  unmeasured and named in §Non-goals.
- **The corpus supports both readings.** CTRL-5 plus RET-1's `?` desugaring
  clause implies the fold; `return.md:3` and RET-1's main clause deny it. A
  reader who reaches the fold by the first chain and a reader who reaches the
  exit by the second are both reading normative text.
- **Nothing reds if the fold changes.** No cell executes a body `return`, so the
  fold is unpinned in the direction that matters. The five parse cells pin the
  parse verdict only, and their own header records the runtime meaning as prose.

## Fix

**Constraint-pinned, not settled.** The defect is that no rule governs a body
`return` while the runtime already gives it a meaning. Two routes close that,
they differ in which of the two conflicting texts is preserved, and this report
chooses neither.

**(a) Enumerate-and-refuse.** CTRL-4 gains `return` as a fourth body
restriction, on the same ground as `break` / `continue` — a statement whose
documented meaning ("exits the enclosing function or top-level theta") has no
realisation across an iteration boundary. `return.md:3` and
`docs/reference/grammar.md:530` keep their unconditional wording, and the body
becomes a scope in which the statement is not written. The emission site exists:
`scanParForStmt`'s `case "return"` (`src/parser/theta-document.ts:4675–4679`)
takes the shape of the `break` / `continue` arm above it (`:4622–4636`). Costs
this route must pay:
  - a new error-severity `theta/parse/par-*` code, which engages DIAG-2 and
    inherits bug [0200](./0200-par-codes-missing-from-sharded-registry.md)'s open
    adjudication — the three existing `par-*` codes have rows only on the
    `docs/reference/diagnostics.md` mirror (`:119–121`, provenance note
    `:314–315`) and none on a sharded `code-registry-*.md` page. Whether the new
    row lands on the sharded page 0200 is arguing about, or beside the mirror
    rows, must be decided with 0200, not around it;
  - the depth question K forces: refuse at every depth, or only at body depth 0
    like `break`? K measures that a depth-1 `return` folds, so a depth-0-only
    gate would admit the folding case and refuse the equivalent one;
  - the interaction with RET-2 and RET-3. Today D draws
    `bare-return-in-non-void` from the enclosing scope and C draws
    `unreachable-code`; a refusal must state whether those fire beside it or are
    withheld as derived verdicts, with exact pass-wide counts per
    `(code, range)`;
  - the runtime arm becomes unreachable rather than wrong. `case "return"`
    (`src/runtime/statement-executor.ts:1266–1269`) then keeps its behaviour as
    a defensive fold, exactly as `case "break"` / `case "continue"` already do
    (`:1270–1273`), with a comment naming the parser gate.

**(b) Specify-the-fold.** CTRL-4 stays silent on `return`, and CTRL-3 plus
`return.md` are amended to state the measured meaning: inside a `par for` body,
`return expr` exits the ITERATION with `expr` as that element's `Ok` value, at
any nesting depth, crossing nested plain loops. This is the reading CTRL-5's `?`
sentence and `docs/reference/grammar.md:285–286` already imply, and it makes the
`?` desugaring claim (`return.md:23`) true rather than incidental. Costs this
route must pay:
  - `return.md:3`, RET-1 (`:19`) and the mirror `docs/reference/grammar.md:530`
    each acquire an exception clause. RET-1's typing half needs the operand
    checked against the ELEMENT type — meaning the body is a return scope of its
    own, which is a type-layer change, not only prose;
  - RET-2's verdict must move with it. A bare `return` in the body is currently
    judged against the enclosing annotation (D); under this route the body's own
    regime decides, so the `par-for` walk arm
    (`src/parser/theta-document.ts:7647`) stops inheriting `voidReturn` and the
    five cells 0118 pinned change verdict rather than merely gaining company;
  - CTRL-3's element-value sentence (`control-flow.md:74`) must name the second
    source and state the type rule when a body's `return` operands and its tail
    disagree.

**Constraints both routes hold.**
  - **Bug 0118's witness is the pinned baseline, and a flip must be deliberate.**
    `tests/par-for.test.ts:1059`, `:1086`, `:1117`, `:1148`, `:1169` pin the
    current parse verdict in both directions, and their header
    (`:1035–:1056`) pre-authorises a change by naming this subject as separate
    and undecided. Route (a) adds a code beside those verdicts; route (b) changes
    three of them. Either way the header comment is rewritten in the same
    change, since it states the shipped rule as the rule.
  - **The fold must acquire a runtime witness whichever route wins.** No cell
    executes a body `return` today. §Reproduction C / E / I / J / K are the
    minimum shape: the element values, the unreached tail, the enclosing scope's
    continuation, and the nested-loop crossing — asserted through `executeBody`,
    with the plain-`for` control (H) beside them so the discrimination cannot
    silently vanish.
  - **Bug 0140's cell g9 (`tests/type-name-as-value-refusal.test.ts:1733`) stays
    byte-unchanged.** It pins the identifier walk's `par for` non-reach as a
    reach fact; neither route widens that walk, so neither may disturb it. Bug
    0128's witness (`tests/non-literal-by-field-refusal.test.ts`) is the other
    protected `theta-document.ts` citation holder from the same 0118 change and
    must be re-verified unchanged if this fix edits that file.
  - **Citation drift is measured, not chased.** 0118's fix records unswept
    `theta-document.ts:<line>` drift as its residual 5; a parser edit here adds
    to it. Re-measure the citations inside the files this fix touches and record
    the rest, under bug
    [0134](./0134-params-shift-induced-stale-citations.md)'s adjudication.
  - **Blast radius is measured as zero on the committed corpus.**
    `docs/examples/fan-out-reviews.theta:19–21` is the only committed `par for`
    and its body carries no `return`, so no shipped source's load or value moves
    under either route. Confirm through
    `tests/committed-fixture-parse-gate.test.ts` rather than a scratch probe.

## Non-goals

- **CTRL-4's other three restrictions.** `par-query-in-body`,
  `par-shared-mutation` and `par-break-continue` all fire as specified
  (§Reproduction L for the third); their content is untouched here.
- **Where the three existing `par-*` rows belong.** That is bug
  [0200](./0200-par-codes-missing-from-sharded-registry.md)'s subject. This
  report depends on it only if route (a) mints a code.
- **The element type when a body's `return` operands and its tail expression
  disagree in type.** Unmeasured. It is a consequence of whichever route wins
  (route (a) removes the case; route (b) must state a rule) and is not evidence
  for either.
- **The identifier walk's `par for` omission** (0118 residual 2, pinned by 0140's
  g9). No identifier resolution runs in a `par for` body; nothing in this report
  depends on that, and neither route widens it.
- **ERR-20's iteration-boundary panic downgrade**
  (`src/runtime/statement-executor.ts:1240–1259`,
  `docs/spec_topics/control-flow.md:78`). It matches its spec and is cited only
  to show the boundary's other arms carry rules.
- **`break` with a value, and `break` / `continue` at body depth > 0.** The depth
  discrimination is cited as the analogue route (a) must decide against; its own
  correctness is not questioned.

## Fix (0.170.0)

Route (a) ENUMERATE-AND-REFUSE, operator-adjudicated. Route (b) is not taken:
`return.md:3`, RET-1's main clause and `docs/reference/grammar.md`'s mirror keep
their unconditional wording, and a `par for` body becomes a scope in which the
statement is not written. Premeasured before any edit: all twelve §Reproduction
rows reproduce byte-identically at this tree (parse halves and, through
`executeBody`, the fold values — C ≡ E, I = `42`, H = `1`, J = `[Ok 5, Ok 5]`,
K = `[Ok 7, Ok 7]`, D = `[Ok null, Ok null]`), so the adjudication's premise
holds and nothing here rests on the doc's older measurements.

- What shipped:
  - `src/parser/theta-document.ts` — `scanParForStmt`'s existing silent
    `case "return"` now pushes `theta/parse/par-return-in-body` (Sev `E`, phase
    `parse`, range = the `return` statement's range), before the pre-existing
    operand walk so a query nested in the operand still draws
    `par-query-in-body` after it; `loopDepth` is deliberately NOT consulted, so
    the refusal fires at every depth of the body's own statement tree (row K:
    a depth > 0 `return` crosses the inner plain loop and is consumed at the
    `par for` boundary, unlike `break`, so CTRL-4's depth gate does not
    transfer). The scan's `default` arm still does not descend into a nested
    `fn`, whose body is its own return scope — measured, and pinned by cell
    (b8) beside (r8).
  - `src/runtime/statement-executor.ts` — `runParForIteration`'s `case "return"`
    is split out of the shared `case "normal"` arm with an identical body and a
    comment naming the parser gate: the fold KEEPS its behaviour as a defensive
    arm, exactly as `case "break"` / `case "continue"` already do, and becomes
    unreachable from a fresh load. No behavioural change; 0118's pinned
    `par for` runtime cells are untouched.
  - `docs/spec_topics/control-flow.md` — CTRL-4 gains `return` as a fourth body
    restriction, stating the ground (no realisation across an iteration
    boundary), the every-depth reach with the explicit `break` / `continue`
    contrast, the nested-`fn` carve-out, the bare form's inclusion, and that
    RET-2 / RET-3 are NOT withheld beside it. CTRL-3 needs no edit: the refusal
    removes the second element-value source, leaving the body tail as the only
    one.
  - `docs/spec_topics/return.md` — RET-1 gains the reach clause: the enclosing
    function or top-level theta is never reached from inside a `par for` body,
    because a `return` written there is refused at parse (CTRL-4). RET-2 and
    RET-3 keep their wording; the page's opening sentence is deliberately
    unchanged.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — one new row (DIAG-2,
    same commit as the emission), inserted immediately after
    `theta/parse/break-with-value`. Its *Trigger* enumerates the valued and the
    bare spelling, the statement-tree reach with the nested-`fn` carve-out, the
    nested-`par for` single-emission fact, and the non-withholding of
    RET-2 / RET-3. *Message* is `'return' is not permitted inside a 'par for'
    body` — PLACEHOLDER-FREE by design, so the CLOSED placeholder table
    (`placeholder-rendering-a.md` / `-b.md`) needs no edit and no sub-rule is
    reused; those pages are byte-unchanged.
  - `docs/reference/diagnostics.md` — the mirror row after
    `par-break-continue`, and the Provenance note amended so it stays true: the
    three RFC-0003 legacy `par-*` codes remain mirror-only with bug
    [0200](./0200-par-codes-missing-from-sharded-registry.md) named open, while
    the fourth is registered on the sharded page and mirrored here.
  - `docs/reference/grammar.md` — the `par for` body-restriction list gains the
    fourth restriction with the statement-tree scoping; the `ParForBody` bullet
    records that a written `return` is not admitted while `?` keeps its stated
    propagation.
  - `docs/how-to/fan-out-in-parallel.md` — the fourth bullet, plus the two
    count-bearing phrases ("Three constructs" → four, "the three body parse
    errors" → four) and the new code in the Diagnostics reference bullet.
  - `tests/par-for-body-return-refusal.test.ts` (new, 22 cells) — the witness.
  - `tests/par-for.test.ts` — the five entailed flips, the group header rewritten
    (fold knowledge RESTATED, not deleted), the describe title retitled, and two
    count-bearing comment phrases corrected.
  - `tests/live/par-for-body-return-live-cell.test.ts` (new, H8a, token
    ``) — the registration observable.
  - `tests/loop-element-withhold-binding-scoped.test.ts` — one doc comment
    qualified to the three legacy `par-*` codes. No assertion touched.

- Registry shard placement, and WHY (bug 0200 rebases on exactly this): the row
  lands on `docs/spec_topics/diagnostics/code-registry-parse.md`, immediately
  after `theta/parse/break-with-value`, with a mirror row on
  `docs/reference/diagnostics.md` immediately after `par-break-continue`. Three
  grounds. (i) DIAG-2 closes the registry on the four sharded
  `code-registry-*.md` pages, so a newly minted code has no other lawful home;
  placing a fourth `par-*` row on the mirror alone would extend 0200's defect
  rather than avoid it. (ii) DIAG-4 makes the *Message* column the only message
  oracle, and the suite's `registryMessage` reader reads the sharded pages only
  — a mirror-only row is unreachable through it, which is why the three legacy
  `par-*` codes' cells assert counts instead of messages; the sharded row is
  what lets this fix's cells assert the message. (iii) The insertion point keeps
  the sharded page in the SAME relative order as the mirror (both rows sit after
  `break-with-value` / `par-break-continue`), so if 0200 decides the three
  legacy rows belong on the sharded page they land ahead of this row with no
  reordering, and if it decides otherwise this row is unaffected. This fix takes
  no position on where the legacy three belong — that stays 0200's subject, and
  the amended Provenance note says so.

- The bare `return` (doc row D) is IN CLASS. It is enumerated explicitly in the
  registry row's *Trigger* and in CTRL-4: the fold gives it `Ok(null)` at the
  iteration boundary while RET-2 judges it against the enclosing scope, so the
  one statement was judged by one scope and executed by another — the same
  defect as the valued form. Refusing it means (r24) / (r25) now carry the
  refusal BESIDE `bare-return-in-non-void` (nothing withheld) and (r26) — bare
  `return` in a `par for` body inside `fn(): void`, previously silent — now
  carries the refusal alone.

- Gates (verbatim):
  - witness RED (emission neutralised, restore proven byte-exact by
    `git hash-object` = `ebf1df705b4bb548e5f24b07a4b66ec37df0229d` both sides):
    `Test Files 2 failed (2) | Tests 16 failed | 101 passed (117)` — all 16
    reds are the missing `error theta/parse/par-return-in-body`;
  - witness GREEN: `Test Files 2 passed (2) | Tests 117 passed (117)`;
  - full offline suite: `Test Files 361 passed (361) | Tests 7424 passed
    (7424)` (fork baseline 360 / 7402; +1 file, +22 cells);
  - `npm run typecheck` → `tsc -p tsconfig.json --noEmit`, clean;
  - `npm run lint` → `eslint --no-error-on-unmatched-pattern "src/**/*.ts"`,
    clean;
  - live H8a, run for real under the mandatory lock (acquire → run → release in
    one command), BOTH directions: GREEN
    `Test Files 1 passed (1) | Tests 1 passed (1)`; RED with the emission
    neutralised — `a theta whose 'par for' body contains a 'return' registered …
    Registered: ["celleparcontrol","celleparreturn"]`; restored byte-exact and
    GREEN again;
  - committed-corpus claim discharged through the real gate:
    `tests/committed-fixture-parse-gate.test.ts` `36 passed (36)`.
    `docs/examples/fan-out-reviews.theta` is the only committed `par for` and
    its body carries no `return`, so no shipped source's load or value moves.

- GOV-15 growth: +1 registry row, enumerated. The addition is carve-out-covered
  by the [diagnostic-registry
  carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out):
  its in-scope input set is exactly the inputs that did not previously emit
  `theta/parse/par-return-in-body` — every `.theta` / `.thetalib` whose
  `par for` bodies contain no `return` statement, whose observables (a)/(b)/(c)
  are unchanged. Inputs that DO carry a body `return` gain the new code's
  emission (and lose registration, an `E`-severity consequence); they did not
  load cleanly-and-equivalently under any prior reading of the corpus, and the
  carve-out covers the appearance of the emission. No code is renamed, no
  namespace moves, no *Message* is reworded, so nothing here is deferred to
  theta 2.0.

- Review: 3 rounds. Round 1 (deep) — FINDINGS ×4: F1 [spec] the prose
  over-claimed "every nesting depth" (a `return` inside a nested `fn` in the
  body is correctly NOT refused, pinned by (r8)); F2 [test] three citations
  falsified by this diff's own line shifts; F3 [fidelity] five
  `code-registry-parse.md` citations inside the touched parser file shifted by
  the new row; F4 [prose] three count-bearing "three `par-*`" comment phrases.
  All four fixed, plus R1 (present-tense fold wording in the *Trigger*), and a
  carve-out witness cell (b8) added. Round 2 (fast) — one finding: the F3
  correction had mechanically shifted a citation that was ALREADY stale, so the
  four sites pointed at `import-name-collision` (`:123`) instead of the row
  whose partition sentence they cite, `import-malformed-specifier-list`
  (`:127`). Round 3 fixer corrected those four numbers; that round's diff is
  four comment characters, touches no executable line, and the gate re-run
  (suite, typecheck, lint) is green — polish verified by gate-diff, confirmation
  round skipped. The only executable line this fix adds to the parser is the
  emission block itself (verified by filtering the parser diff to non-comment
  additions).

- Verification: SOLID, no findings. Witness genuinely witnesses (neutralise →
  16 reds naming the missing code → restore proven byte-exact → 117 green).
  Full default suite green (361 / 7424). One end-to-end live test exercises the
  fixed path for real, in both directions, under the lock. Typecheck and lint
  clean. Protected locks hash-verified byte-identical to HEAD:
  `tests/type-name-as-value-refusal.test.ts` (bug 0140 cell g9),
  `tests/non-literal-by-field-refusal.test.ts` (bug 0128),
  `tests/committed-fixture-parse-gate.test.ts`,
  `tests/interpolated-result-gate.test.ts`,
  `tests/fixtures/h7a/permitted-codes.json`, `package.json`, `CHANGELOG.md`,
  `docs/bugs/README.md`. `permitted-codes.json` stays byte-untouched: the real
  live run plants synthetic sources and loads no committed fixture, so the new
  code is not reachable on a committed-fixture shape.

- Entailed flips enumerated for ratification (bug 0118's five pinned cells,
  pre-authorised by their own header, which names this subject "separate and
  undecided"):
  1. (r24) bare `return`, top-level `par for` body: `[bare-return-in-non-void]`
     → `[par-return-in-body, bare-return-in-non-void]`. Pins that the body
     refusal fires first and that RET-2's inherited verdict is not withheld
     beside it.
  2. (r25) the same inside `fn(): integer`: same flip. Pins that the refusal is
     independent of WHICH enclosing scope supplies the non-void annotation.
  3. (r26) bare `return` inside `fn(): void`: `[]` →
     `[par-return-in-body]`. Pins the bare form's membership: the body's own
     rule refuses it where RET-2 has nothing to say.
  4. (r27) `return 1` inside `fn(): void`: `[]` → `[par-return-in-body]`. Pins
     that the refusal is on the statement, indifferent to the operand, while
     the valued form still asks no bare-return question.
  5. (r28) `return 1` inside `fn(): integer`: `[]` → `[par-return-in-body]`.
     Pins that both enclosing annotations yield the same single refusal.
  The group header and describe title are rewritten in the same change (§Fix
  required it): the fold observation is RESTATED behind a load that no longer
  succeeds, citing `runParForIteration` by symbol and pointing at the new file's
  defensive-fold group — no fold knowledge is deleted.

- Residuals:
  1. **Citation drift this change causes is measured, not chased** (bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s adjudication;
     0118's residual 5 is the same class). The five
     `code-registry-parse.md` citations INSIDE the touched parser file were
     re-measured and corrected in place (and the round-2 finding above shows two
     of them were already stale at HEAD, so they are now correct rather than
     merely shifted). Shift map, measured from the diff hunks:
     `code-registry-parse.md` ≥73 → +1; `docs/reference/diagnostics.md`
     122–316 → +1 and ≥317 → +6; `docs/reference/grammar.md` ≥286 → +1, ≥521 →
     +3; `docs/how-to/fan-out-in-parallel.md` ≥62 → +8, ≥196 → +9;
     `src/parser/theta-document.ts` ≥4587 → +1, ≥4648 → +2, ≥4754 → +16;
     `src/runtime/statement-executor.ts` ≥1268 → +4. 207 further citation sites
     across `tests/` and `src/` fall under those shifts and are deliberately NOT
     swept; the enumeration lives in `.pi/tmp/fixes/0223-report.md` in this
     lane.
  2. **The element type when a body's `return` operands and its tail expression
     disagree** (§Non-goals) is removed as a live case rather than answered:
     route (a) makes the shape unwritable, so no rule is owed. Recorded because
     §Non-goals named it as a consequence of whichever route won.
  3. **The three RFC-0003 legacy `par-*` codes still have no sharded row.** Bug
     0200's subject, untouched here; this fix's row placement is the precedent
     it may follow but does not prejudge (see the placement note above).
  4. **`docs/rfcs/0003-parallel-fanout.md` is deliberately unedited** — an
     accepted RFC is a historical record, so its three-restriction enumeration
     is left as filed. CTRL-4 is the normative site and it is current.

- Discharge notes appended: bug 0118 — *Residuals* item 1 ("a `par for` body's
  `return` regime is not enumerated by the spec") is discharged; the note is
  appended to that document as "## Discharge note (bug 0223)", mirroring its
  existing 0224 note's shape. Its Status is unchanged.

- Pinned dispositions / non-goals: route (b) (specify-the-fold) is not taken and
  is not re-litigable by this record. CTRL-4's other three restrictions are
  untouched. `break` / `continue`'s depth discrimination is untouched — cited
  only as the analogue this rule departs from. ERR-20's iteration-boundary
  downgrade is untouched. The identifier walk's `par for` reach is bug 0224's
  and is not widened here; bug 0140's cell g9 is byte-unchanged.

## Related

- [0118](./0118-nested-fn-result-return-defers-to-runtime-panic.md) — **fixed
  (0.162.0)**, the origin. Its §Fix (a) created the walk arm whose inherited
  `voidReturn` produces the parse verdicts measured here, its §Fix (0.162.0)
  records the `voidReturn` decision with the fold as the countervailing fact,
  and its *Residuals* item 1 holds this subject. The five cells it added
  (`tests/par-for.test.ts:1059`, `:1086`, `:1117`, `:1148`, `:1169`) are this
  report's pinned baseline.
- [0200](./0200-par-codes-missing-from-sharded-registry.md) — **open**, the
  CTRL-4 registry-shard gap family. The three `par-*` codes have no row on any
  sharded `code-registry-*.md` page. A code minted by §Fix route (a) is a fourth
  member of that family and inherits the same shard adjudication; route (b) mints
  nothing and is independent of it.
- [0140](./0140-bare-schema-reference-value-position-silent.md) — **fixed
  (0.122.0)**. Its cell g9 (`tests/type-name-as-value-refusal.test.ts:1733`) pins
  the identifier walk's `par for` non-reach and was held byte-unchanged through
  0118's fix; §Fix keeps it so.
- [0128](./0128-non-literal-by-field-loads-silently.md) — **fixed (0.157.0)**.
  Its witness (`tests/non-literal-by-field-refusal.test.ts`) is the other
  protected `theta-document.ts` citation holder from 0118's change; named as a
  lock, not as a subject.
- [0134](./0134-params-shift-induced-stale-citations.md) — the citation-drift
  class this report's line numbers are read under, and the class a parser edit
  here extends (0118 residual 5).

## Provenance

- Origin: bug 0118's fix record (0.162.0), *Residuals* item 1 — "A `par for`
  body's `return` regime is not enumerated by the spec. `voidReturn` inherits,
  so a bare `return` in a `par for` body is judged against the ENCLOSING `fn`'s
  (or the theta's) return type … The runtime disagrees in principle:
  `runParForIteration` folds a body `return` into that ITERATION's
  `makeOk(flow.value)`, never into the enclosing `fn`'s return, and CTRL-4 …
  names `break` / `continue` / an enclosing-conversation query / shared mutation
  and not `return`". This report adds what the residual does not state: the
  fold's measured element values and its identity with a tail expression's (C, E);
  that the enclosing scope's post-loop code runs (I) where the plain-`for`
  spelling exits (H); that the fold reaches through a nested `if` (J) and crosses
  a nested plain `for` (K), which CTRL-4's depth rule for `break` does not; that
  the valued form draws nothing at any enclosing scope (A, B, G); that the corpus
  contains a chain of three sentences implying the fold and a fourth denying it;
  and that no test in the suite executes a body `return`, so the fold is unpinned.
- Spec: `docs/spec_topics/control-flow.md:58–59` (the `par for` section, anchor
  `#par-for`), `:74` (CTRL-3), `:76` (CTRL-4 — the anchor of this report),
  `:78` (CTRL-5); `docs/spec_topics/return.md:3` (the unconditional sentence),
  `:6–14` (the early-exit example), `:19` (RET-1), `:20` (RET-2), `:22` (RET-3),
  `:23` (the `?` desugaring);
  `docs/spec_topics/diagnostics/code-registry-parse.md:85`, `:86`. User-facing
  mirrors: `docs/reference/grammar.md:267–269`, `:285–286`, `:530`, `:543`;
  `docs/reference/diagnostics.md:119–121`, `:134`, `:135`, `:314–315`.
- Implementation evidence at `c7c5d828`:
  `src/runtime/statement-executor.ts:1209` (`runParForIteration`), `:1240–1259`
  (the ERR-20 catch), `:1266` (the flow switch), `:1268–1269` (the fold),
  `:1270–1273` (the defensive `break` / `continue` arm), `:1274–1276` (the `?`
  propagate arm), `:1306` (`evalParFor`), `:1490–1498` (the `return` flow),
  `:1639` (`executeFor`), `:1667`, `:1670`, `:1673` (the outward propagation);
  `src/parser/theta-document.ts:4510` (`parseParFor`), `:4573`
  (`emitParForBodyDiagnostics`), `:4581` (`scanParForBlock`), `:4595`
  (`scanParForStmt`), `:4622–4636` (its `break` / `continue` arm, the code at
  `:4630`, the depth gate at `:4627`), `:4675–4679` (its silent `return` arm),
  `:4687` (`scanParForExpr`), `:4699–4706` (the nested-`par for` arm), `:6426`
  (the walk context's `voidReturn`), `:6662`, `:6670` (the two top-level
  entries), `:7033` (`walkBlock`), `:7180` (the `fn` arm),
  `:7187–7199` (`walkStatement`'s `return` arm, the `checkBareReturn` call at
  `:7191`), `:7413` (`walkExpr`),
  `:7637–7648` (its `par-for` arm, the body context at `:7647`);
  `src/parser/functions.ts:379–393` (`checkBareReturn`).
- Test evidence at `c7c5d828`: `tests/par-for.test.ts:625`, `:649` (the RET-3
  pair), `:1035–:1056` (the header stating the shipped rule and naming this
  subject), `:1058` (the describe), `:1059`, `:1086`, `:1117`, `:1148`, `:1169`
  (cells r24–r28), `:1529` onward (the runtime group, tail-expression bodies
  only); `tests/type-name-as-value-refusal.test.ts:1733` (bug 0140's g9);
  `tests/non-literal-by-field-refusal.test.ts` (bug 0128's protected witness);
  `docs/examples/fan-out-reviews.theta:19–21` (the only committed `par for`).
- Reproduction: one scratch vitest file at `c7c5d828` — rows A–L over the real
  `parseThetaDocument` and, for the value rows, the real `executeBody` with a
  literal-and-identifier-only `StatementEvalHost` that runs no effects. Run on
  the outputs quoted above, then deleted. No file in the tree was written by the
  probe.
