# Bug 0126 — `walkStmt`'s `case "for"` (`type-layer-checks.ts:679–692`) walks the body with a copy of the enclosing scope and never binds the iteration variable, so nine registered `E`-severity type-layer codes cannot fire on the loop variable inside a plain `for` body even over a concrete `array<T>` iterand — the `par for` arm binds it at `:1188–1193` and reports all nine on the identical body — while the unbound variable types as a nominal reference naming its own identifier, which fires `theta/parse/non-array-iterand` falsely on a spec-legal nested `for` and silently adopts an unrelated schema's type when a schema shares its spelling

- **Status:** fixed (0.107.0). §Fix is settled and shipped; the record is
  §Fix (0.107.0) at the end of this report. The coordination constraints on
  adjacent open reports are in §Fix (f).
- **Sev/Diff estimate:** S1/D3 — nine registered error-severity type-layer
  rejections are unreachable inside every plain `for` body while the theta
  registers, and the same missing binding rejects a spec-legal nested `for`
  outright (`E`-severity, registration denied); D3 because the spec is silent
  on the loop variable's static type, the fix engages GOV-15 in the addition
  direction, the schema-name collision needs its own adjudication, and bug
  0089's `n1` tripwire and a 95-occurrence test sweep must be deliberately
  updated.
- **Kind:** defect — implementation, plus a spec silence the fix must close.
  Three elements, carrying different standing:
  1. **Nine registered checks are unreachable at a position they are written
     for.** `docs/spec_topics/type-system.md:27` lists the positions the `⊑`
     relation governs and `:48` states when a parse-time check may be skipped:
     "when either side of a compatibility check is past the parser's static
     view", with two named examples (a binding whose RHS depends on an
     unregistered Pi-tool schema; an `invoke` against a callee that produced
     `theta/load/callee-has-errors`). A plain `for` loop variable is neither: its
     type is `T` from a statically known `array<T>` iterand, which the `par for`
     arm derives from the same AST node. The deferral is therefore unlicensed by
     `:48`.
  2. **A spec-legal program is rejected.** `docs/spec_topics/control-flow.md:13`
     admits `for x in xs` for any `array<T>` iterand. Measured: a nested plain
     `for` over `array<array<string>>` draws an `E`-severity
     `theta/parse/non-array-iterand`, and an `E`-severity `theta/parse/*`
     denies registration (`hasLoadParseError`,
     `src/extension/production-composition.ts:2045–2052`). The message renders
     the loop variable's own identifier in a `<type>` position, which
     `docs/spec_topics/diagnostics/placeholder-rendering-a.md:13–21` does not
     admit — its category-1 rule enumerates primitives, literals, unions,
     arrays, named schemas / enums / aliases, `Result`, and inline object types,
     and a value binding's name is none of them.
  3. **The spec never states the loop variable's static type.**
     `control-flow.md:13` binds "the iteration variable as a fresh immutable
     local per iteration" and requires the iterand to "have type `array<T>` for
     some `T`" — it introduces `T` and never uses it for the variable. `:70`
     ("each iteration binds a fresh immutable loop variable"), `:76` ("the loop
     variable [is] readable"), `docs/spec_topics/bindings.md:30` and
     `docs/reference/grammar.md:455`, `:458` all say what the binding *is* and
     none says what type it *carries*. This is a spec silence about the loop
     variable's static type, not a violated sentence, and the report asks for
     the sentence.
- **Related:**
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **fixed
    (0.72.0)**, the origin. Its §Non-goals declined this gap in terms
    (`:288–293`: "`walkStmt`'s `case \"for\"` … binds no loop variable at all …
    That gap is independent of alias transparency and is not addressed here —
    which is why group (d) uses `par for`, the arm that does bind the
    variable"), and its §Fix *Residuals* item (ii) (`:530–534`) records the gap
    as **confirmed, not closed**. Its witness pins it with a tripwire row `n1`
    (`tests/fn-param-alias-unfolded-at-gates.test.ts:865–880`), so a fix here
    must deliberately update that row — see §Fix (d). 0089's 36-cell witness is
    also the blast-radius surface any fix re-derives.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, the
    same downstream mechanism from a different cause, and the closest report.
    There `parseType`'s trailing-punctuation leniency makes
    `annotationToCompatType` (`src/parser/type-layer-checks.ts:482`) return an
    opaque `{kind:"named"}`; here the type map holds no entry at all and
    `#typeExpr`'s `ident` arm synthesises the same shape
    (`src/parser/static-type-inference.ts:211–216`). Both consequences read
    "registered type-layer codes stop firing while `theta/parse/non-array-iterand`
    fires falsely with the unresolvable text rendered into its message". The
    causes are disjoint (an annotation capture against a missing `bindings.set`),
    the code lines are disjoint (`:482–504` against `:679–692`), and the input
    sets are disjoint (an annotated `let` / `fn` position against a `for` body
    over a well-formed annotation). No ordering constraint; the witness caution
    is in §Fix (f).
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, the same "registered row, unreachable input" shape.
    `theta/parse/fn-arg-type-mismatch`'s sole emitter `checkFnArgCompat`
    (`src/parser/type-compat.ts:452`) has no `src/` caller, so the row is
    unreachable from *every* input. **How this instance differs:** here each of
    the nine rows has a live, wired emitter that fires on the identical body
    under `par for` — the row is reachable, and only this one position cannot
    reach it. 0050's defect is a missing call; this one is a missing scope
    entry. Consequence for the measurement: `g(x)` inside a `for` body reports
    nothing, and that silence is 0050's, not this report's (§Reproduction (e)).
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, the
    same shape with the narrower GOV-15 precedent. `theta/parse/increment-decrement`
    was registered, unit-tested and unwired; the fix wired it at two
    expression-walk hooks and discharged GOV-15 "under the diagnostic-registry
    carve-out … the disposition 0031 recorded for the same class"
    (`:148–157`), noting that a trigger change with no registry edit is
    "strictly narrower" than 0031's code addition. **How this instance
    differs:** 0084's emitter had no caller anywhere and its fix added
    emissions only; this fix removes emissions too (the false nested-`for`
    rejection), so its GOV-15 argument runs in both directions — see §Fix (b).
    Measured here as a control: `x++` inside a plain `for` body *does* draw
    `theta/parse/increment-decrement`, because 0084's wiring is lexical and
    needs no type.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**,
    the precedent both 0084 and this report follow. Its §Kind records the GOV-15
    diagnostic-registry-carve-out disposition for a check whose closure makes
    previously clean-loading inputs draw a new `E`
    (`:366–373`, citing `source-language-stability.md:25`).
  - [0113](./0113-listtree-glob-universe-swallow-silent.md) — **open**, the
    posture this report mirrors: constraint-pinned §Fix, routes enumerated with
    consequences, nothing decided.
  - [RFC 0008](../rfcs/0008-match-binding-type-inference.md) — **draft**, the
    same "binding types as its own name" mechanism at the neighbouring binder.
    Its §Summary and §Motivation reproduce `theta/parse/non-array-iterand: … got
    v` for a `match` pattern variable (`:7–12`, `:26`) — the identical rendering
    this report measures for a `for` variable — and propose typing the binding
    from the scrutinee. It does not name the `for` loop variable and does not
    close this gap; the two share the `named "<own spelling>"` fallback at
    `static-type-inference.ts:211–216`.
  - [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) —
    **open**, and it already enumerates the defect. Its §Actual behaviour lists
    the three sites that write the `CompatType` map — "the `let` arm (`:591–594`),
    `fn` parameters (`:671`), and the comprehension loop variable (`:1115`)" —
    at pre-0.72.0 coordinates (now `:640`, `:739`, `:1188`). The plain `for`
    statement is absent from that list because it writes nothing. 0090's subject
    is the reassignment arm; this report's is the `for` arm. Disjoint lines, no
    ordering constraint.
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) —
    **open**, the reassignment arm's own missing check. Named because a
    reassignment inside a `for` body is silent for two independent reasons and
    the attribution matters: `x = "b"` draws nothing here, and that is 0115's
    surface plus the mutability gap recorded in §Non-goals.
- **Affected** (every citation verified at HEAD `552b4ace`, 0.72.0):
  - `src/parser/type-layer-checks.ts:679–692` — **the defect site**,
    `TypeLayerWalk.walkStmt`'s `case "for"`. `:680–684` runs the iterand
    admissibility gate; `:688` walks the iterand; `:689` copies the enclosing
    scope into `inner`; `:690` walks the body with it. There is no
    `inner.set(stmt.variable, …)` between `:689` and `:690`.
  - `src/parser/type-layer-checks.ts:1149–1195` — `walkExpr`'s `case "par-for"`,
    the arm that does bind. `:1186` derives
    `unfoldAlias(this.typeOf(e.iterand, bindings), this.env)`; `:1187` copies
    the scope; `:1188–1193` binds `e.variable` to `iterandType.element` when the
    unfolded iterand is an `array`, else to `{ kind: "named", name: "unknown" }`;
    `:1194` walks the body. `:1180–1185` is the comment stating why: "Bind the
    fresh immutable loop variable to the iterand element type so body checks
    resolve it". This is the shape the `for` arm omits.
  - `src/parser/type-layer-checks.ts:573–575` — `typeOf`, the seam every body
    check reads through: `this.pass.typeOf(expr, this.env, bindings)`.
    `:582–590` — `walkBlock`, whose doc comment states "`bindings` is this
    block's own scope: nested blocks receive a copy so inner `let`s do not leak
    outward".
  - `src/parser/type-layer-checks.ts:640` — the `let` arm's `bindings.set`;
    `:739` — `walkFn`'s per-parameter `fnScope.set`. The two other writers of the
    map, both of which the `for` arm's sibling positions rely on.
  - `src/parser/type-layer-checks.ts:554` — `class TypeLayerWalk`; `:482` —
    `annotationToCompatType`, bug 0124's subject and the source of the parameter
    types this report's iterands carry.
  - `src/parser/static-type-inference.ts:211–216` — `#typeExpr`'s `ident` arm:
    `bindings.get(node.name) ?? { kind: "named", name: node.name }`. **This is
    the code that decides what the unbound loop variable resolves to.** Absent
    from the scope map, `x` reads as `{ kind: "named", name: "x" }` — a nominal
    reference naming the loop variable's own identifier, not an `unknown`
    placeholder.
  - `src/parser/type-compat.ts:155–172` — `unfoldAlias`. `:164–170`: a `named`
    whose name resolves to no declaration, or to a non-alias declaration, is
    returned intact. So `named "x"` survives every gate as an unresolvable
    nominal — *unless* a declaration named `x` exists, in which case the loop
    variable adopts that declaration's type. `:104–106` — `resolveNamed`, the
    `Object.hasOwn` lookup that decides.
  - `src/parser/static-type-inference.ts:119–150` — `#walkStmt`, the
    whole-program pass's statement walk. Its signature is
    `(stmt, record, env)`: it carries **no** bindings map, so `case "for"`
    (`:147–149`) has nothing to bind into and records the body's statement-level
    expressions through the pass's binding-blind `noBindings`
    (`:89`, used at `:94`). `:263–292` — `#typeExpr`'s `par-for` arm, which
    *does* bind (`:281`, `inner.set(node.variable, elementType)`), because it
    needs the body tail type to build `array<Result<U, QueryError>>` per CTRL-3.
    **Finding: the two passes do not disagree.** The whole-program `infer` pass
    is binding-blind by design (`:84–88` states so), and the `par for` binding at
    `:281` is local to computing that expression's own value type; a plain `for`
    is a statement with no value, so this pass has no place to bind and none is
    owed. The gap is uniform: neither pass gives the plain-`for` loop variable a
    type, for two different structural reasons, and the one fix site is the
    type-layer walk.
  - `src/parser/theta-document.ts:4744–4749` — `walkIdentStmt`'s `case "for"`:
    `const inner = new Set(scope); inner.add(s.variable);`. The
    name-resolution scope **does** bind the loop variable, which is why
    `theta/parse/unknown-identifier` correctly stays silent on `x`.
  - `src/parser/theta-document.ts:5383–5388` — `walkCallSiteStmt`'s
    `case "for"`: `const inner = new Map(locals); inner.set(s.variable, { kind:
    "for", line: s.range.start.line });`. The callable-shadowing scope binds it
    too, which is what `theta/parse/shadowed-callable-call`'s `<binder>`
    placeholder renders. **Three walks visit a plain `for` body; two bind the
    variable in the same copy-then-set shape; the type-layer walk performs the
    copy and omits the set.**
  - `src/parser/control-flow.ts:64–82` — `checkForIterand`, the gate that fires
    falsely. `:69` unfolds; `:70–72` returns `undefined` for an `array`; `:74–80`
    emits `theta/parse/non-array-iterand`, with the `got ${displayType(type)}`
    render at `:79`. Given
    `named "x"` it renders `got x`.
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`:
    any error-severity `theta/load/*` or `theta/parse/*` blocks registration.
    Call sites `:1329`, `:1749`, `:1933`, `:2092`. This is why the false nested-`for`
    rejection is a load failure, not a warning.
  - `docs/spec_topics/control-flow.md:13` — the `for` paragraph. Quoted in full
    in §Expected behaviour; the sentence that would give the loop variable type
    `T` is absent. `:70` — `par for` reuses "the `for` iterand contract
    unchanged" and binds "a fresh immutable loop variable", with the same
    silence. `:76` — CTRL-4, "Outer bindings and the loop variable are
    readable". `:15` — CTRL-1, the iterand snapshot.
  - `docs/spec_topics/bindings.md:30` — "`for` iteration variables (`for x in xs
    { ... }` — `x` is a fresh immutable binding per iteration)", under
    *Immutable contexts*. States immutability, not type.
  - `docs/reference/grammar.md:455` — "The iteration variable is a fresh
    immutable local per iteration"; `:458` — "fresh immutable loop variable —
    CTRL-1". The user-facing mirror carries the same silence.
  - `docs/spec_topics/type-system.md:27` — the closed list of positions `⊑`
    governs; `:48` — *Unresolvable operands*, the deferral licence and its two
    named examples; `:29` — the *Operational definition* requiring the parser to
    "recognise the structural cases enumerated below without falling back to"
    AJV, "so that compatibility failures surface as parse errors at the offending
    source span rather than as runtime validation errors at a downstream call
    site"; `:50` — TYPE-9; `:52` — TYPE-10; `:54` — TYPE-11.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the nine rows this
    defect makes unreachable at this position, each with a *Trigger* the measured
    input satisfies: `:24` `theta/parse/integer-narrowing`, `:34`
    `theta/parse/non-boolean-condition`, `:36`
    `theta/parse/mixed-plus-operands`, `:37`
    `theta/parse/non-orderable-operands`, `:38`
    `theta/parse/non-indexable-receiver`, `:43`
    `theta/parse/non-string-array-join`, `:46`
    `theta/parse/object-field-type-mismatch`, `:54`
    `theta/parse/let-rhs-type-mismatch`, `:63` `theta/parse/unknown-method`.
    Plus `:64` `theta/parse/non-array-iterand`, the row that fires falsely, and
    `:61` `theta/parse/unknown-identifier`, the control that correctly stays
    silent. `:116` `theta/parse/fn-arg-type-mismatch` is bug 0050's and is
    unreachable from every position.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a *Trigger* change is a spec change landing in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative; a reword is a theta 2.0
    concern).
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:9`, `:11`, `:13–21`
    — category 1, *Static-type placeholders*. `<type>` is enumerated at `:11`
    and the closed rendering rule at `:13–21` admits primitives, literal
    sources, unions, `array<T>`, "Named schemas, enums, and type aliases by
    their theta-side identifier", `Result<T, E>` and inline object types. A loop
    variable's identifier is none of these.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15, whose
    observable (b) is the "ordered diagnostic-code sequences"; `:9` — the
    loads-cleanly predicate ("emits no diagnostic of effective severity
    `error`"); `:25` — the *Diagnostic-registry carve-out*, which dispositions
    "a DIAG-2 *trigger* change … as an addition for inputs newly brought into
    the code's emission set and as a removal for inputs taken out of it".
  - `tests/fn-param-alias-unfolded-at-gates.test.ts:865–880` — bug 0089's row
    `n1`, the tripwire. Its body asserts
    `codesOf(ITER("array<string>", "for", "x.frobnicate()"))` `.toEqual([])`
    under the comment "It reds if a fix widens beyond the unfolding sites and
    starts binding the plain `for` variable, which would be an unrequested
    behaviour change" (`:872–874`). `ITER` is defined at `:170–172`. The file is
    880 lines, 36 rows.
  - `tests/type-layer-diagnostics-production.test.ts:102–104` — `for x in 5`
    with a body reading `x`, the nearest existing plain-`for` body assertion; it
    asserts the *iterand* rejection and nothing about the body.
    `tests/control-flow.test.ts:141`, `:153`, `:163` — the three
    `non-array-iterand` cells, all with empty or `x`-free bodies.
  - **Test coverage of this defect: one tripwire, no witness.** `n1` above pins
    a single cell of the loss (`unknown-method`) as staying `[]`. No test in the
    tree asserts any of the other eight codes inside a plain `for` body, and no
    test drives a nested plain `for` over `array<array<T>>` in either direction.
  - `docs/examples/fan-out-reviews.theta:28–35` — the only committed `.theta` or
    `.thetalib` in the tree containing a `for` loop (`for r in reviews`, with a
    `match` on the loop variable). Measured clean today and clean under the
    binding simulation; see §Fix (c).
  - `tests/fixtures/h7a/permitted-codes.json` — the eleven-code H9a allow-list;
    it carries no `theta/parse/*` entry, so any newly-reachable parse code that
    reaches the acceptance capture is a red. `tests/acceptance-stderr-gate.test.ts:15`
    — the gate that reads it.
- **Observed at:** `0.72.0` (HEAD `552b4ace`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts`), the same
  harness bug 0089's witness uses. Written, run, deleted.

## Summary

`TypeLayerWalk.walkStmt`'s `case "for"`
(`src/parser/type-layer-checks.ts:679–692`) runs the iterand admissibility gate,
copies the enclosing scope into `inner` (`:689`), and walks the body with it
(`:690`). It never writes the iteration variable into that copy. `walkExpr`'s
`case "par-for"` in the same class performs the identical copy and then binds
(`:1187–1193`), deriving the element type from the same iterand node.

The result is an asymmetry on one body:

```
fn f(xs: array<string>) { for x in xs { x.frobnicate() } }
  → []
fn f(xs: array<string>) { par for x in xs { x.frobnicate() } }
  → error theta/parse/unknown-method :: unknown method 'frobnicate' on type string
```

The concrete `array<string>` parameter is not the variable: the element type is
statically known and the `par for` arm reports from it. Nine registered
`E`-severity type-layer codes behave this way — every one of them silent under
`for`, every one of them fired by `par for` on the identical body, and every one
of them fired by the `let`-binding control that supplies the same type directly.
The inventory is §Reproduction (a).

The loss is not a generic `unknown`. `#typeExpr`'s `ident` arm
(`src/parser/static-type-inference.ts:211–216`) returns
`bindings.get(node.name) ?? { kind: "named", name: node.name }`, so an unbound
loop variable reads as a nominal reference **naming its own identifier**. Two
consequences follow that a plain deferral would not have.

First, the identifier surfaces in a normative message and rejects legal code. A
nested plain `for` over `array<array<string>>` — admitted by
`control-flow.md:13` — draws `error theta/parse/non-array-iterand :: 'for'
expects array<T> after 'in'; got x`, and an error-severity `theta/parse/*` denies
registration (`production-composition.ts:2045–2052`). The `<type>` placeholder
renders a value binding's name, which category 1 of
`placeholder-rendering-a.md:13–21` does not admit.

Second, the name is looked up. `unfoldAlias` resolves a `named` through the
`TypeEnv` (`type-compat.ts:155–172`), so a loop variable whose spelling matches a
declared schema silently adopts that schema's type. Measured: `schema Q =
array<string>` with `for Q in xs` over `array<string>` accepts `Q.join(",")`,
which `par for` rejects; `schema Q = number` with `for Q in xs` over
`array<integer>` draws a false `theta/parse/integer-narrowing`, which `par for`
and the no-schema control both leave silent. Schema names must be uppercase
(`theta/parse/schema-case-mismatch`), so the collision requires an
uppercase-spelled loop variable — legal, and nothing warns.

This is bug 0089's §Non-goals gap, confirmed by that fix rather than closed.
0089 declined it explicitly and used `par for` for its own group (d) because
`par for` is the arm that binds; its §Fix *Residuals* item (ii) records the
confirmation, and its witness holds the gap still with tripwire row `n1`
(`tests/fn-param-alias-unfolded-at-gates.test.ts:865–880`). A fix here reds `n1`
by construction and must update it deliberately.

## Reproduction

Offline at `552b4ace`. Every row is one `parseThetaDocument` call over a source
string with frontmatter `mode: prompt`; the trailing `1` supplies the theta's
final value. `→` lists the whole `diagnostics` array in emission order,
unfiltered. `[CTL]` marks a control.

### (a) The inventory — nine codes, `for` against `par for` against `let`

Body shape: `fn f(xs: array<E>) { <kw> x in xs { <stmt> } }`, `<kw>` ∈
{`for`, `par for`}. The `let` control supplies the element type directly through
a typed binding, proving each checker fires on this harness at all.

```
1. unknown-method (method form)      E = array<string>   stmt = x.frobnicate()
   for      → []
   par for  → unknown method 'frobnicate' on type string
   [CTL] let y: string = "a" / y.frobnicate()
            → unknown method 'frobnicate' on type string

2. unknown-method (member form)      E = array<string>   stmt = x.field
   for      → []
   par for  → unknown method 'field' on type string
   [CTL] let y: string = "a" / y.field
            → unknown method 'field' on type string

3. mixed-plus-operands               E = array<string>   stmt = x + 1
   for      → []
   par for  → '+' has mixed operand types: string and integer
   [CTL]    → '+' has mixed operand types: string and integer

4. non-indexable-receiver            E = array<string>   stmt = x[0]
   for      → []
   par for  → indexed access requires an array<T> or object receiver; got string
   [CTL] let y: boolean = true / y[0]
            → indexed access requires an array<T> or object receiver; got boolean

5. integer-narrowing                 E = array<number>   stmt = let n: integer = x
   for      → []
   par for  → cannot narrow number to integer
   [CTL] let y: number = 1.5 / let n: integer = y
            → cannot narrow number to integer

6. non-string-array-join   E = array<array<number>>      stmt = x.join(",")
   for      → []
   par for  → array.join requires a string element type; got array<number>
   [CTL] let y: array<number> = [1] / y.join(",")
            → array.join requires a string element type; got array<number>

7. non-boolean-condition             E = array<string>   stmt = if x { }
   for      → []
   par for  → condition must be boolean; got string
   [CTL]    → condition must be boolean; got string
   (identical for `while x { }` and for the ternary `let z = x ? 1 : 2`)

8. non-orderable-operands            E = array<string>   stmt = x < 1
   for      → []
   par for  → '<' requires two numeric or two string operands; got string and integer

9. let-rhs-type-mismatch             E = array<string>   stmt = let n: integer = x
   for      → []
   par for  → let binding 'n' initialiser type mismatch: expected integer, got string

10. object-field-type-mismatch   E = array<string>   schema P { a: integer }
                                                     stmt = let p = P { a: x }
   for      → []
   par for  → field 'a' on schema 'P' type mismatch: expected integer, got string
```

Rows 1 and 2 are the same registry row (`code-registry-parse.md:63`) reached
through the method-call and member-access classifiers, so the distinct-code count
is **nine**: `unknown-method`, `mixed-plus-operands`, `non-indexable-receiver`,
`integer-narrowing`, `non-string-array-join`, `non-boolean-condition`,
`non-orderable-operands`, `let-rhs-type-mismatch`,
`object-field-type-mismatch`. **None of the nine reaches the position by any
other route** — the `for` column is `[]` for every row.

### (b) What the loop variable resolves to — the render says its own name

The nominal is directly observable, because `checkForIterand` renders the type it
decided on (`src/parser/control-flow.ts:79`).

```
fn f(xs: array<string>) { for x in xs { for y in x { } } }
  → error theta/parse/non-array-iterand :: 'for' expects array<T> after 'in'; got x

same body, loop variable renamed q
  → error theta/parse/non-array-iterand :: 'for' expects array<T> after 'in'; got q

fn f(xs: array<string>) { par for x in xs { for y in x { } } }   [CTL]
  → error theta/parse/non-array-iterand :: 'for' expects array<T> after 'in'; got string
```

The rendered text tracks the loop variable's spelling, which fixes the value as
`{ kind: "named", name: "<identifier>" }` and rules out an `unknown` placeholder.
The variable is nonetheless in scope for name resolution:

```
fn f(xs: array<string>) { for x in xs { x } }        → []
fn f(xs: array<string>) { for x in xs { z } }        → error theta/parse/unknown-identifier :: unknown identifier 'z'
fn f(xs: array<string>) { for x in xs { x++ } }      → error theta/parse/increment-decrement :: '++' operator is not supported
```

`unknown-identifier` staying silent on `x` and firing on `z` is
`walkIdentStmt`'s binding at `theta-document.ts:4744–4749`; `increment-decrement`
is bug 0084's lexical wiring, which needs no type. Only the type map is short.

### (c) The false rejection — a spec-legal nested `for` does not load

```
fn f(xs: array<array<string>>) { for x in xs { for y in x { } } }
  → error theta/parse/non-array-iterand :: … got x
fn f() { let xss: array<array<string>> = [["a"]] / for x in xss { for y in x { } } }
  → error theta/parse/non-array-iterand :: … got x
for x in [["a"]] { for y in x { } }                        [top level, no fn]
  → error theta/parse/non-array-iterand :: … got x
fn f(xs: array<array<array<string>>>) { for a in xs { for b in a { for c in b { } } } }
  → error … got a
    error … got b
fn f(xs: array<array<string>>) { for x in xs { let r = par for y in x { y } } }
  → error theta/parse/non-array-iterand :: … got x
fn f(xs: array<array<string>>) { let r = par for x in xs { for y in x { } 1 } }   [CTL]
  → []
fn f(xs: array<array<string>>) { for x in xs { 1 } }                             [CTL]
  → []
```

Every iterand above is an `array<T>` by `control-flow.md:13`. The rejection is
`E` severity, and `hasLoadParseError`
(`src/extension/production-composition.ts:2045–2052`) blocks registration on any
error-severity `theta/parse/*`, so the theta does not load. The two controls
isolate the cause: the outer `par for` binds `x` and the inner loop passes; a
plain `for` with no inner loop has no site that reads the variable's type.
Nesting depth `n` yields `n − 1` rejections.

### (d) The schema-namespace collision — the name is looked up

`unfoldAlias` (`type-compat.ts:155–172`) resolves a `named` through the
`TypeEnv`, so a loop variable spelled like a declared schema takes that schema's
type. Schema names must be uppercase, so the loop variable must be too.

```
schema Q = array<number>
fn f(xs: array<string>) { for Q in xs { Q.frobnicate() } }
  → error theta/parse/unknown-method :: unknown method 'frobnicate' on type Q
same, par for                                                        [CTL]
  → error theta/parse/unknown-method :: unknown method 'frobnicate' on type string
same, no schema Q declared                                           [CTL]
  → []

FALSE ACCEPT
schema Q = array<string>
fn f(xs: array<string>) { for Q in xs { Q.join(",") } }
  → []
same, par for                                                        [CTL]
  → error theta/parse/unknown-method :: unknown method 'join' on type string

FALSE REJECTION
schema Q = number
fn f(xs: array<integer>) { for Q in xs { let n: integer = Q } }
  → error theta/parse/integer-narrowing :: cannot narrow number to integer
same, par for                                                        [CTL]
  → []
same, no schema Q declared                                           [CTL]
  → []

schema Q = array<string>
fn f(xs: array<array<string>>) { for Q in xs { for y in Q { } } }
  → []
schema Q = string
fn f(xs: array<array<string>>) { for Q in xs { for y in Q { } } }
  → error theta/parse/non-array-iterand :: … got string
```

The last pair is the sharpest: one declaration elsewhere in the file, touching
neither loop, flips a nested `for` between loading and not loading, and the
diagnostic names a type the program never wrote at that position. The
false-accept row also shows the loss is not conservative — an unrelated
declaration can *admit* a call the element type forbids.

### (e) Silences that are not this defect

```
fn g(p: integer) { 1 }
fn f(xs: array<string>) { for x in xs { g(x) } }          → []
fn f(xs: array<string>) { for x in xs { x = "b" } }       → []
[CTL] fn f() { let y = 1 / y = 2 }
  → error theta/parse/immutable-rebinding :: cannot reassign immutable binding 'y'
```

`g(x)` is bug 0050: `theta/parse/fn-arg-type-mismatch`'s only emitter has no
`src/` caller, so that position is silent for every argument and a fix here does
not reach it. `x = "b"` is a mutability question, not a typing one — `bindings.md:30`
makes a `for` variable immutable and the control proves the check works for a
`let` — and it is out of scope (§Non-goals).

### (f) The committed corpus, measured

`docs/examples/fan-out-reviews.theta` is the only committed `.theta` or
`.thetalib` of the 34 in the tree that contains a `for` loop (`:28`,
`for r in reviews` over the `par for` result, with a three-arm `match` on the
loop variable). It parses clean today. Binding the variable is simulated by
running the same body under `par for`, the arm that already binds — measured on
the minimised shape with the outer mutation removed, since CTRL-4 forbids it:

```
schema Review { file: string, summary: string }
let reviews = par for path in ["a", "b"] max 2 { Review { file: path, summary: path } }
<kw> r in reviews {
  let line = match r {
    Ok(review) => review.file + ": " + review.summary,
    Err(QueryError { kind: "cancelled" }) => "a review was cancelled",
    Err(other) => "a review failed: " + other.kind,
  }
  let _u = line
}

for      → []
par for  → []
```

Both silent: CTRL-3's element renders as the nominal
`Result<Review, QueryError>`, which resolves to no declaration, so the `match`
arms defer either way. The one committed `for` loop in the tree is unaffected in
both directions. This does not discharge the sweep — see §Fix (c).

## Expected behaviour

The anchor is `docs/spec_topics/control-flow.md:13`:

> **`for` ... `in`** — iterates an array, binding the iteration variable as a
> fresh immutable local per iteration. The expression after `in` must have type
> `array<T>` for some `T`; iterating strings, objects, or numbers is
> `theta/parse/non-array-iterand` …

The sentence introduces `T`, binds the iterand to `array<T>`, and binds the
iteration variable as a local — and never says the local's type is `T`. Nothing
elsewhere supplies it: `:70` repeats "a fresh immutable loop variable" for
`par for`, `:76` says the loop variable is "readable", `bindings.md:30` says it
is immutable, and `docs/reference/grammar.md:455` / `:458` mirror the same two
facts. **This is a spec silence about the loop variable's static type**, and
closing it is the first thing this report asks for.

The silence is not neutral, because three sentences already constrain what may
fill it.

**1. `type-system.md:48` does not license the deferral.** The
*Unresolvable operands* paragraph permits skipping a parse-time check only "when
either side of a compatibility check is past the parser's static view", and its
two examples are a binding depending on an unregistered Pi-tool schema and an
`invoke` against a callee with `theta/load/callee-has-errors`. A plain `for` loop
variable is not past the static view: the iterand's type is what the
admissibility gate at `type-layer-checks.ts:680–684` has already read, and the
`par for` arm derives `T` from the same node twelve hundred lines later
(`:1186–1193`). Measured, `par for` and the `let` control both produce the
diagnostic. So whatever sentence fills the silence, the current behaviour is not
the one `:48` authorises.

**2. `type-system.md:29` states the purpose the silence defeats.** The
*Operational definition* requires the parser to recognise the enumerated
structural cases "without falling back to" AJV, "so that compatibility failures
surface as parse errors at the offending source span rather than as runtime
validation errors at a downstream call site". Inside a plain `for` body the
offending span produces nothing for nine of those cases.

**3. `control-flow.md:13`'s own admission is violated in the other
direction.** A nested `for` over `array<array<T>>` satisfies the sentence — the
inner iterand has type `array<T>` for `T` — and is rejected at `E` severity.
That half is not a silence; it is a divergence from the quoted sentence, and it
holds whatever the loop variable's declared static type turns out to be, because
no candidate answer makes the inner iterand a non-array.

The disposition the three constraints point at, stated so the adjudication has a
concrete proposal to accept or reject: **the loop variable's static type is the
iterand's element type `T`, under TYPE-11 transparency (an `array<T>` alias
supplies the same `T`), and a non-`array` iterand — already rejected by
`theta/parse/non-array-iterand` — leaves the variable with no resolvable type, at
which point `type-system.md:48` does apply and body checks defer.** That is
exactly what `par for` implements at `type-layer-checks.ts:1186–1193` and what
`control-flow.md:70` calls the "`for` iterand contract unchanged". Under it, on
the measured inputs:

- Each of §Reproduction (a)'s nine codes fires in the `for` column with the
  message its `par for` row carries, from the registry *Message* templates
  (DIAG-4, `diagnostic-shape.md:74`).
- §Reproduction (c)'s nested loops report nothing.
- §Reproduction (d)'s collision disappears in both directions: the variable's
  type comes from the iterand, so no declaration elsewhere in the file can
  change it.
- The `<type>` placeholder never renders a value binding's identifier, restoring
  `placeholder-rendering-a.md:13–21`.
- `theta/parse/unknown-identifier` and `theta/parse/increment-decrement` are
  unmoved (§Reproduction (b)), and a non-`array` iterand still draws
  `theta/parse/non-array-iterand` at the iterand's own span
  (`control-flow.md:13`).

Two things the disposition does **not** settle, and which §Fix pins instead: the
GOV-15 consequence of the nine new `E` emissions, and whether the
`{ kind: "named", name: "<identifier>" }` fallback at
`static-type-inference.ts:214–215` may keep synthesising a lookupable name for
any unbound identifier.

## Actual behaviour / root cause

**One missing statement.** `walkStmt`'s `case "for"`
(`src/parser/type-layer-checks.ts:679–692`):

```ts
case "for": {
  const diag = checkForIterand(
    { type: this.typeOf(stmt.iterand, bindings) },
    { file: this.file, range: stmt.iterand.range },
    this.env,
  );
  if (diag !== undefined) {
    this.diagnostics.push(diag);
  }
  this.walkExpr(stmt.iterand, bindings, flow);
  const inner = new Map(bindings);      // :689 — the scope copy
  this.walkBlock(stmt.body, inner, flow); // :690 — walked without the variable
  return;
}
```

`walkExpr`'s `case "par-for"` (`:1180–1194`) is the same shape with the write
present:

```ts
const iterandType = unfoldAlias(this.typeOf(e.iterand, bindings), this.env);
const inner = new Map(bindings);
inner.set(
  e.variable,
  iterandType.kind === "array"
    ? iterandType.element
    : { kind: "named", name: "unknown" },
);
this.walkBlock(e.body, inner, flow);
```

Both arms already hold the iterand node, the enclosing `bindings`, `this.env`
and a fresh scope copy. The `for` arm makes the copy and does not write to it, so
`inner` is an unnecessary allocation that exists only to be handed to
`walkBlock` unchanged.

**The map is the only channel.** Every body check reads its operand type through
`typeOf` (`:573–575`), which forwards the walk's `bindings` to
`StaticTypeInferencePass.typeOf`. The map has exactly three writers — the `let`
arm (`:640`), `walkFn`'s parameters (`:739`) and the `par for` arm (`:1188`) — so
a name absent from all three has no recorded type anywhere in the type layer.

**Absence is not neutral, because the fallback synthesises a type from the
name.** `#typeExpr`'s `ident` arm (`src/parser/static-type-inference.ts:211–216`):

```ts
case "ident":
  // A `let`-bound identifier resolves to its inferred type; a free
  // identifier is a nominal reference past the parser's static view.
  return (
    bindings.get(node.name) ?? { kind: "named", name: node.name }
  );
```

For an identifier that genuinely is free — an import, a `params:` field read
before the frontmatter pass, a name past the parser's view — a nominal
self-reference is the documented posture (`type-system.md:48`). For a loop
variable it is a category error: the name is a *value* binding, and it lands in
a *type* namespace. Two mechanisms then act on it.

`unfoldAlias` (`src/parser/type-compat.ts:155–172`) walks `while (current.kind
=== "named")` and calls `resolveNamed(env, current.name)` (`:104–106`,
`Object.hasOwn`). For `named "x"` with no declaration `x` the loop exits at
`:166–168` and the value survives as an unresolvable nominal, which is why the
nine checks defer and why they defer *silently* — the `⊑` engine answers
`"unknown"`, the documented AJV-safety-net path. But when a declaration named `Q`
exists, `:169` replaces the loop variable's type with that declaration's
right-hand side and the checks run against it. The loop variable and the schema
namespace share one string-keyed lookup, and nothing distinguishes them.

`displayType` renders the surviving nominal into the message. `checkForIterand`
(`src/parser/control-flow.ts:69–80`) unfolds, finds `kind !== "array"`, and emits
`got ${displayType(type)}` — the loop variable's identifier, in a `<type>`
placeholder whose closed rendering rule
(`placeholder-rendering-a.md:13–21`) has no case for it. This is also why the
rejection is a *false positive* rather than a deferral: the iterand gate has no
"unresolvable ⇒ skip" arm, so an unresolvable nominal is rejected, exactly as
bug 0089 recorded for the pre-0.72.0 alias case ("the `for` / `par for` iterand
gate rejects a program the spec admits").

**Two other walks over the same statement do bind it.** In
`src/parser/theta-document.ts`, `walkIdentStmt`'s `case "for"` (`:4744–4749`)
does `const inner = new Set(scope); inner.add(s.variable);`, and
`walkCallSiteStmt`'s (`:5383–5388`) does `const inner = new Map(locals);
inner.set(s.variable, { kind: "for", line: s.range.start.line });`. Both are the
copy-then-set shape the type-layer arm truncates. Their effects are measured in
§Reproduction (b): `unknown-identifier` correctly stays silent on the loop
variable, and `shadowed-callable-call`'s `<binder>` placeholder can name a
`for` binder. The loop variable is therefore a first-class binding in every
scope the parser maintains except the one that carries types.

**The whole-program pass is not a second disagreeing site.**
`StaticTypeInferencePass.infer` is binding-blind by construction: `:84–88`
documents it and `:89` builds the `noBindings` map every recorded node is typed
under. `#walkStmt`'s signature (`:119`) carries no bindings map at all, so its
`case "for"` (`:147–149`) has nowhere to write. `#typeExpr`'s `par-for` arm binds
at `:281` only because CTRL-3 makes a `par for` an expression whose value type
needs the body's tail type; a plain `for` is a statement with no value, so this
pass owes no binding. **Finding: the two passes do not disagree — the gap is
uniform, for two different structural reasons, and the type-layer walk is the
single fix site.** The type-layer walk is the pass that threads a binding scope
through the public `typeOf` seam (`:87–88` says so in terms), and it is the one
that omits the write.

**No post-condition exists.** `Map<string, CompatType>` has no expected
membership and `walkBlock` takes no per-statement contract, so a body walked
without its loop variable is indistinguishable from one whose loop variable is
genuinely untyped. The nine checks each answer "defer" for a reason that is
locally correct (`type-system.md:48`) and globally wrong.

## Why it matters

- **Nine registered `E`-severity rejections are unreachable at a position their
  *Trigger* prose covers.** Every row in §Reproduction (a) describes author
  input the measured program supplies. The registry is closed under DIAG-2, and
  a reader cannot distinguish these rows' reach from the same rows' reach two
  keywords away under `par for`. This is the "registered row, unreachable input"
  shape of bugs 0050 and 0084, narrowed to one syntactic position.
- **A spec-legal nested `for` does not load.** `E` severity, registration denied
  (`production-composition.ts:2045–2052`), on a program `control-flow.md:13`
  admits. The author's remedy is not discoverable from the message, which names
  the loop variable as though it were a type.
- **One unrelated declaration flips the disposition.** §Reproduction (d):
  adding `schema Q = string` elsewhere in the file makes a nested `for` over `Q`
  fail to load, and `schema Q = array<string>` makes it load. The collision
  needs an uppercase loop variable and nothing warns about the shadowing — no
  `theta/parse/*` code covers a value binding colliding with a type name.
- **The loss is silent and partial, so the theta registers.** In the nine-code
  direction the file loads, the slash command exists, and the checks that would
  have rejected the body report nothing on any channel — no code, no message, no
  severity. The failure moves to runtime AJV or to a `theta/runtime/*` panic at
  a downstream site, which `type-system.md:29` exists to prevent.
- **`for` is the ordinary form.** `par for` is theta 1.1, isolation-only,
  query-free in its body (CTRL-4) and value-producing; the sequential `for` is
  what `control-flow.md:17–28` and `:45–56` teach and what a body issuing `@`
  queries must use. The arm with the wider legitimate use is the unchecked one.
- **`array<array<T>>` is a normal shape.** The measured false rejection needs
  only a nested loop over a nested array — no alias, no unresolvable type, no
  authoring error.
- **The corpus asserts the gap rather than the behaviour.** The only test in the
  tree that touches it, bug 0089's `n1`
  (`tests/fn-param-alias-unfolded-at-gates.test.ts:865–880`), asserts `[]` and
  says so: "It reds if a fix widens beyond the unfolding sites and starts
  binding the plain `for` variable, which would be an unrequested behaviour
  change." The pin is doing its job — the gap cannot drift unnoticed — but until
  it is adjudicated the suite's stated expectation is the defect.

## Non-goals

- **`theta/parse/immutable-rebinding` on a `for` variable.**
  `bindings.md:30` makes a `for` iteration variable immutable, and `x = "b"`
  inside the body draws nothing where the `let` control draws the diagnostic
  (§Reproduction (e)). That check runs over a different scope — the reassignment
  arm delegates over "the real binding" at `theta-document.ts:2034`, not over
  the `CompatType` map — so it is a distinct defect with a distinct root cause.
  Measured here so the attribution is on record; not investigated and not
  adjudicated by this report.
- **`theta/parse/fn-arg-type-mismatch`.** Bug 0050's: the emitter has no `src/`
  caller, so `g(x)` is silent for every argument at every position. A fix here
  does not make it a tenth lost code and cannot restore it.
- **The reassignment arm's compatibility check.** Bug 0115's subject, and bug
  0090's adjudication of what type a reassigned `let mut` carries. Both read the
  same map; neither concerns the `for` arm's write.
- **`match` pattern-variable typing.** RFC 0008's proposal, the same
  `named "<own spelling>"` fallback at a different binder. This report does not
  contend for it and a fix here should not widen into it — but see §Fix (e) for
  why the fallback's shape is a shared question.
- **`#typeExpr`'s index-element derivation.**
  [0125](./0125-index-element-narrowing-not-alias-unfolded.md), filed from bug
  0089's §Fix *Residuals* item (i): `let y = xs[0]` on an alias-typed parameter
  loses the element narrowing and lands on the sentinel `named "index"`. A
  different derivation site, a different input class, unchanged either way.
  Named because it is the third element-derivation site in the same family — the
  `par for` arm (`type-layer-checks.ts:1186`), the typing pass's `par for` arm
  (`static-type-inference.ts:275`) and the index arm — and a fix here adds the
  fourth. Neither fix reaches the other's input class and neither orders the
  other.
- **`annotationToCompatType`'s leniency.** Bug 0124's subject. It supplies the
  parameter types this report's iterands carry; a well-formed `array<string>`
  annotation is not its input class.
- **Runtime behaviour.** In the nine-code direction the programs load and run
  today; in the false-rejection direction they never load, so no value is
  produced. No runtime path is measured or changed.
- **`par for`'s own dispositions.** The `par for` arm is the reference
  implementation here, not a subject. Its non-`array` fallback
  (`{ kind: "named", name: "unknown" }`, `:1192`) and its CTRL-3 element
  rendering are unchanged by any route below.

## Fix

**Not settled.** Two questions have to be answered before code lands — what
static type the loop variable carries (§Expected behaviour states the proposal;
`control-flow.md:13` must say it), and whether the resulting `E`-severity
additions are admissible within theta 1.x. (b) is the central constraint.

**(a) Route — where the binding goes.** Two shapes, same behaviour:

1. **Bind in place, mirroring the `par for` arm.** Insert the write between
   `type-layer-checks.ts:689` and `:690`, copying `:1186–1193` verbatim: derive
   `unfoldAlias(this.typeOf(stmt.iterand, bindings), this.env)`, and
   `inner.set(stmt.variable, …)` with `iterandType.element` when the unfolded
   iterand is an `array`, else the non-`array` fallback. **The unfold is not
   optional**: without it an alias-typed iterand supplies no element and the
   TYPE-11 transparency bug 0089 established at that exact line is lost for the
   `for` arm. Smallest diff; two arms then carry the same six lines twice, which
   is the drift that produced this defect.
2. **One helper for both arms.** Extract the derive-and-bind into a private
   method — `bindLoopVariable(variable, iterand, bindings)` returning the child
   scope — and call it from `:689` and `:1187`. Removes the possibility of the
   arms diverging again and puts the TYPE-11 unfold in one place. Cost: it
   touches the `par for` arm, which bug 0089's fix shipped four sites into and
   whose 36-cell witness pins; groups (d) and (s) of that witness must be re-run
   as-is and stay green, and `:1180–1185`'s comment must move with the code
   rather than be duplicated. A fix taking route 2 states that the `par for`
   arm's observable behaviour is byte-identical before and after, proved by that
   file passing unmodified except for `n1`.

Neither route touches `src/parser/static-type-inference.ts`: that pass is
binding-blind by construction (`:84–89`) and its `par for` binding at `:281`
serves its own value-type computation. A route that also edits it is widening
without a measured cause.

**(b) GOV-15 is engaged, in both directions, and the addition direction is the
constraint.** `source-language-stability.md:5` promises identical "ordered
diagnostic-code sequences" (observable (b)) across theta 1.x for any file that
loads cleanly under 1.0.0, and `:9`'s loads-cleanly predicate is "emits no
diagnostic of effective severity `error`". Both directions move that observable:

- **Additions.** Every §Reproduction (a) `for` row loads cleanly today and would
  gain an `E`. All nine codes are `E` in `code-registry-parse.md`, and an
  error-severity `theta/parse/*` denies registration
  (`production-composition.ts:2045–2052`). **Programs that load today would stop
  loading.** This is the *Diagnostic-registry carve-out* (`:25`) applied as an
  addition — "a DIAG-2 *trigger* change is dispositioned by the same principle,
  in-scope as an addition for inputs newly brought into the code's emission
  set" — which is the disposition bug 0031 recorded for a code addition
  (`0031:366–373`) and bug 0084 reused for a wiring change with no registry
  edit, on the stated ground that a trigger change with a byte-unchanged
  registry is "strictly narrower" (`0084:148–157`). A fix here follows that
  precedent chain or argues against it in terms; it does not invoke the carve-out
  silently.
- **Removals.** §Reproduction (c)'s nested loops emit an `E` today and would
  stop. Those inputs do **not** satisfy `:9`'s loads-cleanly predicate, so they
  are outside GOV-15's input set entirely, and the carve-out's removal arm
  covers the change for inputs taken out of the code's emission set. This
  direction is the safe one and a fix should say so rather than leave the
  bidirectionality implicit.
- **DIAG-2 (`diagnostic-shape.md:72`).** No code is added, removed or renamed,
  and no *Message* is reworded (DIAG-4, `:74`), so the registry stays
  byte-unchanged under route 1 or 2. Each of the ten *Trigger* cells must be
  re-read before that is asserted: all nine describe author input over static
  types, and `:64`'s (`for x in expr` where `expr` is not `array<T>`) becomes
  *more* accurate, since it stops firing where `expr` is an `array<T>`. Whether
  a byte-unchanged registry can invoke a carve-out named for registry edits is
  the question 0084 answered by analogy; a fix here either cites that answer or
  pins it properly.
- **Placeholder rendering.** `placeholder-rendering-a.md:13–21` is satisfied by
  construction once the variable carries the element type — the `<type>` slot
  stops rendering an identifier that names no type. No placeholder edit is owed;
  a fix records this as a discharge, not a change.

**(c) The committed-corpus sweep a GOV-15 addition requires.** Measured at
`552b4ace` and to be re-verified at the fix baseline:

- `git ls-files | grep -E '\.(theta|thetalib)$'` is 34 files; exactly one
  contains a `for` loop — `docs/examples/fan-out-reviews.theta:28`. Measured
  clean today, and clean under the `par for` binding simulation
  (§Reproduction (f)). No other committed `.theta` or `.thetalib`, and nothing
  under `tests/fixtures/`, contains a `for` loop at all.
- `tests/committed-fixture-parse-gate.test.ts` (34 cells) asserts zero
  diagnostics for every shipped `.theta`; it must stay 34/34 and is the
  mechanical form of the bullet above.
- **The test corpus is the real sweep.** 95 theta-source `for <ident> in`
  occurrences across 20 test files, concentrated in `tests/par-for.test.ts`
  (32), `tests/fn-param-alias-unfolded-at-gates.test.ts` (7),
  `tests/theta-callable-call-arity.test.ts` (6) and
  `tests/shadowed-callable-call.test.ts` (6). Any cell whose plain-`for` body
  reads the loop variable can move. A fix enumerates them and states each
  disposition; it does not weaken an assertion to accommodate a new emission
  (`AGENTS.md`, live-suite conventions).
- **Live.** `tests/live/live-production-acceptance.test.ts` and
  `tests/live/hardening/recent-rfc-live-drives.test.ts` and
  `tests/live/hardening/session-convdrive.test.ts` carry plain-`for` bodies in
  planted workspaces; a body that starts drawing an `E` stops registering and
  the cell's own precondition fails. Run before and after.

**(d) Bug 0089's witness and its `n1` tripwire — a deliberate update, not a
side effect.** `tests/fn-param-alias-unfolded-at-gates.test.ts:865–880` asserts
`codesOf(ITER("array<string>", "for", "x.frobnicate()"))` `.toEqual([])` and
says in its own comment (`:872–874`) that it "reds if a fix widens beyond the
unfolding sites and starts binding the plain `for` variable, which would be an
unrequested behaviour change". A fix here reds that row by construction. The
obligations:

- The row is **inverted, not deleted**: its subject stays the same input, and
  its new expectation is `["theta/parse/unknown-method"]` with the message its
  `par for` sibling (row `d1`) already carries.
- Its comment is rewritten to cite this report as the adjudication that made the
  widening requested, so the tripwire's history is legible.
- Every other row of that file's 36 stays byte-unchanged and green, which is what
  proves the fix did not disturb bug 0089's four unfolding sites. Groups (a) and
  (e) use plain `for` with bodies that do not read the loop variable (`ITER`'s
  default body is `x` alone) — verify rather than assume.
- The two other files carrying plain-`for` type-layer cells,
  `tests/type-layer-diagnostics-production.test.ts:102–104` and
  `tests/control-flow.test.ts:141`/`:153`/`:163`, assert iterand rejections over
  non-array iterands and read the variable only in the first; check each.

**(e) The `named "<identifier>"` fallback — decide whether it is in scope.**
Binding the loop variable closes this report's inputs, but
`static-type-inference.ts:214–215` keeps synthesising a lookupable type name from
any unbound identifier, and §Reproduction (d) shows what that costs when the two
namespaces collide. Three postures, and a fix must state which it takes:

1. **Out of scope.** Bind the loop variable and leave the fallback. The measured
   collision disappears for `for` variables (their type comes from the iterand)
   but remains for every other unbound identifier, including RFC 0008's `match`
   pattern variables, where `got v` is already documented (`RFC 0008:7–12`).
2. **Replace the fallback with a non-lookupable sentinel** for identifiers the
   walk knows are value bindings. The `par for` arm's existing non-`array`
   fallback (`{ kind: "named", name: "unknown" }`, `:1192`) is already safe by
   accident: `schema unknown` draws
   `theta/parse/schema-case-mismatch` (`E`) so the name can never be in a
   loading theta's `TypeEnv`. Whether to rely on that or to mint an explicit
   shape is a decision, not an implementation detail.
3. **File the collision separately** and pin it here as a measured non-goal.

Posture 1 is the narrowest and is consistent with this report's §Non-goals; it
leaves §Reproduction (d)'s mechanism live at other binders and the report must
not pretend otherwise.

**(f) Coordination with the open reports on the same surface.** No ordering
dependency blocks this fix, and two cautions apply:

- [0124](./0124-parsetype-trailing-punctuation-leniency.md) (open) measures the
  same nine-ish code family lost through `annotationToCompatType`'s opaque
  `{kind:"named"}` and the same false `non-array-iterand` with unresolvable text
  in its message. The causes are disjoint and neither fix reaches the other's
  input class, but a witness written here that uses a junk annotation, or one
  written there that uses a `for` body, will red on the other's landing. Each
  witness stays inside its own input class: well-formed annotations here,
  annotated non-`for` positions there.
- [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) (open)
  owns the `g(x)` silence. If 0050 lands first, `fn`-argument rows inside a
  `for` body become a tenth reachable code and this fix's sweep grows by that
  position; if it lands second, its own sweep must include `for` bodies. Neither
  ordering is required — the two fixes are independent — but whichever is second
  re-derives the joint row.
- [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) and
  [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) (both
  open) write and read the same `CompatType` map. 0090's §Actual behaviour
  enumerates the map's writers and will need this arm added; a fix here appends a
  coordination note rather than editing 0090's §Fix.

**(g) H9a and the acceptance gates.** Any newly-reachable code must be assessed
against the empty-capture stderr gate bug 0030 documents and against
`tests/fixtures/h7a/permitted-codes.json`, whose eleven entries carry no
`theta/parse/*` code — so a parse code that reaches an acceptance capture is a
red by construction. Two facts to establish rather than assume: whether any H9a
area's planted workspace contains a plain `for` body that reads the loop
variable, and whether the file's hash is unchanged before and after the real
runs (`a4a8da04209f90e13d815edd92c1fc682e2a2236` at the 0089 baseline; re-read at
the fix baseline). Unlike bug 0089's fix — which only removed emissions and was
therefore correct by construction here — this fix adds them, so the gate is a
live question.

**(h) Witness — offline, provider-free.** Every row of §Reproduction settles
inside one `parseThetaDocument` call over a source string, so the harness is
`tests/helpers/e2e-s1.ts`'s `parseDoc`, unmodified, as bug 0089's witness uses.
Required rows: the nine-code inventory with both its `par for` and `let` controls
(the controls are what make a red attributable to the `for` arm rather than to a
checker that stopped firing); the loop-variable render pair, which is the only
direct observable of what the variable resolves to; the nested-`for` group at
depths 2 and 3 plus the `par for`-outer and no-inner-loop controls; the four
collision rows of §Reproduction (d) with their no-schema controls, which red if
posture (e)(2) is taken and hold if (e)(1) is; §Reproduction (e)'s two
attribution rows, which must stay `[]` and cite 0050 and the mutability non-goal;
and §Reproduction (f)'s committed-corpus pair. Aggregated code lists asserted
with ordered whole-list equality, never a containment matcher; every expected
message sourced from the registry's *Message* column per DIAG-4. The fix's own
neutralisation proof is one byte edit — remove the `inner.set` — which must red
the inventory group and green the nested-`for` group, restored byte-exact and
hash-verified.

## Provenance

- Origin: the bug 0089 fix (0.72.0, commit `a3b30ed3`) and its §Residuals item
  2, which flagged this as a filing candidate: "`walkStmt`'s `case \"for\"`
  binds no loop variable at all, so `fn f(xs: array<string>) { for x in xs {
  x.frobnicate() } }` reports `[]` **even with a concrete array parameter**.
  Independent of alias transparency — which is exactly why group (d) uses `par
  for`. Row `n1` pins it as a tripwire, so a later fix that widens into it will
  red visibly." The bug 0089 document itself declines the gap at `:288–293`
  (§Non-goals) and records the confirmation at `:530–534` (§Fix *Residuals* item
  (ii)). This report adds what neither states: the nine-code inventory with its
  `par for` and `let` controls; what the loop variable resolves to, with the
  code that decides it and the render that proves it; the false `E`-severity
  rejection of a spec-legal nested `for` and its registration consequence; the
  schema-namespace collision in both the false-accept and false-rejection
  directions; the two other walks over the same statement that do bind the
  variable; the finding that the whole-program pass does not disagree and why;
  the spec silence on the loop variable's static type against the three
  sentences that constrain it; and the GOV-15 posture in both directions with
  the corpus and test sweeps it requires.
- Spec: `docs/spec_topics/control-flow.md:13` (the `for` paragraph — the anchor,
  and the silence), `:15` (CTRL-1), `:70` (`par for` reuses the contract), `:76`
  (CTRL-4, the loop variable readable), `:17–28` and `:45–56` (the taught
  sequential `for` examples); `docs/spec_topics/bindings.md:30` (`for`
  iteration variables immutable); `docs/spec_topics/type-system.md:27` (the
  positions `⊑` governs), `:29` (the *Operational definition* and the
  parse-error-at-the-offending-span purpose), `:48` (*Unresolvable operands* —
  the deferral licence this defect falls outside), `:50` (TYPE-9), `:52`
  (TYPE-10), `:54` (TYPE-11);
  `docs/spec_topics/diagnostics/code-registry-parse.md:24`, `:34`, `:36`, `:37`,
  `:38`, `:43`, `:46`, `:54`, `:63` (the nine lost rows), `:64` (the row that
  fires falsely), `:61` (`unknown-identifier`, the control), `:116`
  (`fn-arg-type-mismatch`, bug 0050's);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/diagnostics/placeholder-rendering-a.md:9`, `:11`,
  `:13–21` (category 1, the closed `<type>` rendering rule);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing mirrors: `docs/reference/grammar.md:455`, `:458` (the two
  loop-variable sentences); `docs/reference/diagnostics.md:70`, `:80`, `:82`,
  `:83`, `:84`, `:89`, `:109`, `:110` (the *Message* mirrors of the rows above,
  which carry no *Trigger* column).
- Implementation evidence at `552b4ace`:
  `src/parser/type-layer-checks.ts:679–692` (**the defect** — the gate at
  `:680–684`, the scope copy at `:689`, the body walk at `:690`, no write
  between), `:1149–1195` (the `par for` arm; the element derivation at `:1186`,
  the bind at `:1188–1193`, the comment stating the intent at `:1180–1185`),
  `:573–575` (`typeOf`), `:582–590` (`walkBlock`), `:640` (the `let` arm's
  `bindings.set`), `:739` (`walkFn`'s parameter write), `:554`
  (`class TypeLayerWalk`), `:482` (`annotationToCompatType`, bug 0124's);
  `src/parser/static-type-inference.ts:211–216` (**the `ident` fallback that
  decides what the unbound variable resolves to**), `:84–89` (`infer`'s
  binding-blind `noBindings`), `:119` (`#walkStmt`'s bindings-free signature),
  `:147–149` (its `case "for"`), `:263–292` (`#typeExpr`'s `par-for` arm, the
  bind at `:281`);
  `src/parser/type-compat.ts:104–106` (`resolveNamed`, the `Object.hasOwn`
  lookup), `:155–172` (`unfoldAlias`, the survive-intact arm at `:166–168` and
  the replace arm at `:169`);
  `src/parser/control-flow.ts:64–82` (`checkForIterand`, the unfold at `:69` and
  the `got ${displayType(type)}` render at `:79`);
  `src/parser/theta-document.ts:4744–4749` (`walkIdentStmt`'s `case "for"`,
  which binds), `:5383–5388` (`walkCallSiteStmt`'s, which binds), `:2034` (the
  reassignment arm's delegation, the §Non-goals mutability scope);
  `src/extension/production-composition.ts:2045–2052` (`hasLoadParseError`) and
  its call sites `:1329`, `:1749`, `:1933`, `:2092`.
- Test evidence at `552b4ace`:
  `tests/fn-param-alias-unfolded-at-gates.test.ts:865–880` (bug 0089's `n1`
  tripwire; `ITER` at `:170–172`; 880 lines, 36 rows),
  `tests/type-layer-diagnostics-production.test.ts:102–104`,
  `tests/control-flow.test.ts:141`/`:153`/`:163`,
  `tests/committed-fixture-parse-gate.test.ts` (34 cells),
  `tests/acceptance-stderr-gate.test.ts:15` and
  `tests/fixtures/h7a/permitted-codes.json` (eleven codes, no `theta/parse/*`),
  `docs/examples/fan-out-reviews.theta:28–35` (the one committed `for` loop).
- Related reports: [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md)
  (fixed 0.72.0, the origin),
  [0124](./0124-parsetype-trailing-punctuation-leniency.md) (open, the same
  downstream mechanism),
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) and
  [0084](./0084-increment-decrement-check-dead.md) (the registered-row /
  unreachable-input precedents),
  [0031](./0031-ctor-field-value-typing-unchecked.md) (the GOV-15
  diagnostic-registry-carve-out disposition),
  [0113](./0113-listtree-glob-universe-swallow-silent.md) (the
  constraint-pinned §Fix posture),
  [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) and
  [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) (the same
  `CompatType` map), [0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md)
  (the H9a stderr gate), and
  [RFC 0008](../rfcs/0008-match-binding-type-inference.md) (draft, the same
  `named "<own spelling>"` fallback at the `match` binder).

## Coordination note — bug 0125 (0.76.0)

Appended by the bug 0125 fix; nothing above is altered. **Note only — this
report is untouched and stays open.**

Bug [0125](./0125-index-element-narrowing-not-alias-unfolded.md) changed one
line in `src/parser/static-type-inference.ts` (`#typeExpr`'s `case "index"` arm
now unfolds its target through `unfoldAlias` before the `kind === "array"`
test). Two things this report depends on are unaffected:

- **Its pin holds.** `tests/fn-param-alias-unfolded-at-gates.test.ts` is
  byte-unchanged and green at 36/36, so bug 0089's row `n1` — the tripwire that
  pins this report's gap as staying `[]` — is intact.
- **Its citations are intact.** `src/parser/static-type-inference.ts` is 372
  lines before and after the 0125 fix, deliberately, so this report's citation
  of `static-type-inference.ts:275` (the `par for` element derivation) still
  resolves. `docs/reference/grammar.md` is likewise 610 lines before and after,
  so this report's `:455` / `:458` citations are unmoved.

## Coordination note — bug 0050 landed (0.77.0)

0050's fix binds the plain `for` variable in the body scope to a WITHHELD
sentinel twin (`recordWithheldBinders`, `src/parser/type-layer-checks.ts`) —
deliberately NOT the judged element type, which stays this report's territory
(and bug 0089's pinned non-goal; the n1 tripwire held byte-unchanged and
green through the fix). Two of this report's cited false-emission
observables are closed by that recording: the spec-legal nested `for` no
longer draws `theta/parse/non-array-iterand` falsely, and a schema sharing
the variable's spelling is no longer silently adopted (cells u13md / u13,
`tests/fn-arg-type-mismatch-wired.test.ts`). The core gap — the type-layer
codes still cannot fire on the loop variable — REMAINS: a withheld read
defers at every judgement sink. Cells u12e / u13me pin that deferral with
this report named as the flip condition.

## Fix (0.107.0)

- What shipped:
  - `src/parser/type-layer-checks.ts` — `TypeLayerWalk.walkStmt`'s `case "for"`
    records the loop variable in the body scope with the **TYPE-11-unfolded
    iterand's element type** when that iterand unfolds to an `array`
    (`unfoldAlias(iterandType, this.env)`, the derivation the `par for` arm
    already performs), and marks the record unprovable when the iterand is not
    itself a proof — the `par for` arm's own soundness discipline. A
    non-`array` iterand keeps bug 0050's `recordWithheldBinders` twin. The
    arm's comment is rewritten to the shipped rule, and
    `collectLocalBinderNames`'s doc comment no longer lists the loop variable
    among the classes this layer cannot type. One executable hunk, `+11/−1`.
  - `docs/spec_topics/control-flow.md` — the spec silence closed. The `for` …
    `in` paragraph states the loop variable's static type: the iterand's
    element type `T`, under TYPE-11 transparency, with a non-`array` iterand
    leaving it unresolvable so *Unresolvable operands* applies and body checks
    defer. The `par for` reuse enumeration gains the same item, scoped to the
    `array<T>` iterand, so the reference mirror is spec-backed. 78 lines before
    and after.
  - `docs/reference/grammar.md` — both loop-variable bullets mirror the rule,
    same commit.
  - `tests/plain-for-loop-variable-element-type.test.ts` — new, 53 cells at the
    `parseThetaDocument` boundary through `tests/helpers/e2e-s1.ts`'s
    `parseDoc`: the nine-code inventory with its `par for` and `let` controls,
    the render rows, the nested-`for` group, the collision rows with their
    no-schema twins, the attribution rows, the TYPE-11 and member-iterand rows,
    the withheld-fallback pins and the committed-corpus pair. Ordered
    whole-list `toEqual` on codes and messages; every message read from the
    registry by CODE through an oracle that throws on a shape change (DIAG-4);
    a loud binder-site precondition on every cell.
  - `tests/fn-param-alias-unfolded-at-gates.test.ts` — bug 0089's tripwire `n1`
    **inverted, not deleted** (§Fix (d)): same input, new expectation
    `["theta/parse/unknown-method"]` with the message its `par for` sibling
    `d1` carries, comment rewritten to cite this report as the adjudication.
    The other 35 rows' assertions are byte-unchanged and green.
  - `tests/fn-arg-type-mismatch-wired.test.ts` — bug 0050's 84-cell witness:
    `u9`, `u12e` and `u13me` flip from deferral to the fired true positive each
    named as its own flip condition; `u13r` is **re-pointed subject-preserving**
    onto an unannotated-`fn`-parameter binder so its `array<<withheld>>`
    assertion stays byte-identical and bug 0143 keeps its only in-tree pin. The
    narrative passages this fix falsified are rewritten to the shipped
    mechanism. No other cell's assertion moves.
  - `tests/live/live-production-acceptance.test.ts` — one **additive** H8a cell
    (the 45th): a plain-`for` body whose method call misuses the loop variable
    is refused registration through the real discovery→registration path,
    beside a precondition control that registers. Registration-only, zero model
    turns.
  - `tests/array-sink-unresolvable-deferral.test.ts`,
    `tests/index-element-alias-unfolded.test.ts` — comment-only citation
    corrections for the `+17` line shift.
  - Byte-unchanged, hash-verified: `src/parser/static-type-inference.ts`
    (§Fix (e) **posture 1** — the `ident`-arm fallback stays),
    `src/parser/control-flow.ts`, `src/parser/type-compat.ts`, the diagnostic
    registry and `docs/reference/diagnostics.md` (no code added, removed or
    renamed; no *Message* reworded), and
    `tests/fixtures/h7a/permitted-codes.json`
    (`a4a8da04209f90e13d815edd92c1fc682e2a2236`, re-verified after the real H9a
    run).
- Route settlement (§Fix (a)): **route 1**, bind in place. Route 2's shared
  helper is rejected on measurement, not preference — post-0050 the two arms'
  non-`array` fallbacks legitimately differ. §Non-goals pins the `par for`
  arm's `{ kind: "named", name: "unknown" }` as unchanged by any route, while
  the plain-`for` arm must keep the withheld twin, so a shared helper would
  need a discriminating parameter and would not remove the drift risk it exists
  to remove. The fallback choice is decisive and was measured both ways: the
  literal `par for` mirror reintroduces **this report's own defect** at the
  binder classes it does not own — `fn h(p) { for x in p { for y in x { } } }`
  draws a false `theta/parse/non-array-iterand :: … got unknown`, an `E`
  denying registration on a program that loads cleanly, with an internal
  sentinel rendered into a `<type>` slot. Witness pins g1 and g5 discriminate
  the two fallbacks; g6 pins the object-index-key sink.
- Re-derived baseline. §Reproduction was written at 0.72.0 and two later fixes
  moved it. **Bug 0050 (0.77.0)** already closed two of the three measured
  consequences: the false nested-`for` rejection and the schema-name adoption
  are `[]` at this baseline, because the loop variable is recorded as a
  withheld twin. The remaining subject, the nine codes, is unmoved and is what
  this fix closes. **Bug 0136 (0.106.0)** made a member iterand type as its
  declared field type, so `for y in p.xs` composes with this fix (witness row
  f2). §Reproduction (b)'s `got x` / `got q` renders no longer exist; the live
  pre-fix render observable is the composite `array<<withheld>>`, which becomes
  `array<integer>` at an unchanged code and range.
- §Fix (e) posture: **posture 1** (out of scope), discharged by measurement
  rather than asserted. All five §Reproduction (d) collision rows are decided
  by the iterand's element type: the false accept closes, the false rejection
  stays closed, and the nested-`for` flip is dead in both directions. No
  declaration elsewhere in the file can change a `for` variable's type. The
  mechanism remains live at the binders this report does not own, which is
  RFC 0008's and bug 0141's territory.
- GOV-15 (§Fix (b)), enumerated in every direction it moves:
  - **Observable (b), additions.** Nine codes become reachable on a plain-`for`
    loop-variable read whose iterand unfolds to `array<T>`: `unknown-method`
    (method and member forms), `mixed-plus-operands`,
    `non-indexable-receiver`, `integer-narrowing`, `non-string-array-join`,
    `non-boolean-condition`, `non-orderable-operands`,
    `let-rhs-type-mismatch`, `object-field-type-mismatch`. Two further input
    classes arrive by composition: `non-array-iterand` on a nested `for` whose
    outer element is not an array — a true positive its `par for` sibling
    already reports — and `theta/parse/fn-arg-type-mismatch`, whose emitter bug
    0050 wired in 0.77.0 and which this binding first makes reachable inside a
    `for` body. All are `E`, so affected programs stop registering
    (`hasLoadParseError`). This is the *Diagnostic-registry carve-out*
    (`source-language-stability.md:25`) in its addition arm, following the
    precedent chain **0031 → 0084**: 0031 recorded the disposition for a code
    addition, and 0084 reused it for a trigger change with a byte-unchanged
    registry on the ground that it is "strictly narrower". This fix is that
    same strictly-narrower shape and cites the chain rather than invoking the
    carve-out silently.
  - **Observable (b), removals: none at this baseline.** The removal direction
    the report anticipated — the false nested-`for` rejection — was discharged
    by bug 0050 in 0.77.0, and those inputs never satisfied `:9`'s
    loads-cleanly predicate anyway.
  - **Observable (c).** A `<type>` slot fed by a plain-`for` loop-variable read
    renders the element type where it rendered the withheld sentinel
    (`condition must be boolean; got array<integer>` for
    `got array<<withheld>>`), at an unchanged code and range. That is the
    `placeholder-rendering-a.md:13–21` **discharge**, not a change owed: the
    slot stops rendering an unspellable internal name and starts rendering a
    type category 1 admits. No placeholder edit is owed and none is made.
  - **Observable (a).** Unchanged — no runtime path is touched.
  - **Corpus.** 34 committed `.theta`/`.thetalib`; exactly one contains a plain
    `for` (`docs/examples/fan-out-reviews.theta`), measured clean before and
    after. `tests/committed-fixture-parse-gate.test.ts` is the corpus-wide
    discharge per `AGENTS.md`, and it is green.
- DIAG-2 / DIAG-4: the registry is byte-unchanged, and all ten *Trigger* cells
  were re-read against the shipped behaviour. Each stays true;
  `non-array-iterand`'s becomes strictly more accurate, since it stops firing
  where the iterand is an `array<T>`. No *Message* is reworded.
- Gates (verbatim):
  - Witness — `npx vitest run tests/plain-for-loop-variable-element-type.test.ts`
    → `Test Files  1 passed (1)` / `Tests  53 passed (53)`.
  - Full default suite — `npx vitest run --exclude "tests/scratch-*"` →
    `Test Files  312 passed (312)` / `Tests  5208 passed (5208)`. The
    committed-tree baseline before this fix was 311 files / 5155 tests; the
    delta is exactly the new witness.
  - Typecheck — `npx tsc -p tsconfig.json --noEmit` → clean.
  - Lint — `npm run lint` → clean.
  - H8a live — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Tests  45 passed (45)`.
  - H9a live — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/` → `Test Files  2 passed (2)` /
    `Tests  11 passed (11)`.
- Review: 3 rounds, converged clean.
  - Round 1 (deep) — 5 findings: `n1`'s registry row cited by a drifted line;
    seven `type-layer-checks.ts` citations falsified by the line shift; the
    `par for` grammar mirror asserting a typing rule the spec's own reuse
    enumeration omitted (`spec`); a ragged reflow; the witness grounding a
    contract on a fix-run scratch path. All fixed.
  - Round 2 (fast) — 1 `fidelity` finding: eleven narrative passages in bug
    0050's witness describing the retired withhold mechanism. Fixed, together
    with four more of the same species the fixer surfaced and two fixture
    identifiers naming a read that is now proven. A follow-on light round
    reframed the witness's colour ledger neutralisation-relatively and
    corrected three cells' mechanism claims, each verified against the code it
    cites.
  - Round 3 (deep) — **CLEAN**: no `correctness`, `fidelity` or `spec` finding.
    Three residuals, recorded below.
- Verification: SOLID, all four obligations discharged with quoted evidence.
  - Neutralisation — replacing the arm with its pre-fix single line reds the
    witness at **exactly** the 21 rows its own ledger calls fix-produced, with
    every regression pin staying green; `u9`, `u12e`, `u13me` and `n1` red as
    authorized. Dropping only the `unfoldAlias` reds exactly `f1`; dropping
    only the `unprovableBindings` marking reds exactly `e4`. Every restore
    verified byte-exact by blob hash. `u13r` correctly does **not** red: its
    re-pointed fixture holds no `for` loop, and the `for`-fed composite render
    it used to carry is pinned by witness row `b4`, which does red.
  - Full default suite green at 312/5208, committed-fixture parse gate green.
  - Live — the additive H8a cell was proven **both directions live**: with the
    fix neutralised the mis-typed caller registers
    (`Registered: ["b126livectl","b126liveforread"]`); restored, it does not.
    The real H9a run settled §Fix (g) by measurement — no `theta/parse/*` code
    reaches an acceptance capture, so `permitted-codes.json` needs no append
    and its blob is unchanged. Its one red was a documented stochastic
    sentinel-refusal on an unrelated bug-0025 fixture carrying no `for` loop:
    green in isolation and green on the clean re-run. The two planted
    hardening workspaces that read a plain-`for` loop variable
    (`recent-rfc-live-drives`, `session-convdrive`) were swept statically and
    are unmoved in both directions.
  - Lint and typecheck clean.
- Residuals:
  1. **Bug 0050's withheld gate has no pinning cell at two of its sinks.**
     Neutering `containsWithheldBinderType` at the typed-`let` RHS sink and at
     the `array.join` element sink leaves the whole suite green: this fix moved
     those gates' only load-bearing inputs onto a proven element. The gates are
     intact and correct; what is missing is a regression pin. Discriminating
     fixtures exist and were measured — `fn h(x) { let s = [x].join(",") }` and
     `fn h(x) { let s: integer = [x] }` are `[]` as shipped and emit
     `… got array<<withheld>>` with the gate neutered. Filing candidate against
     bug 0050's witness. **Discharged** by bug
     [0193](./0193-withheld-binder-gates-lost-last-pinning-cells.md), whose fix
     adds cells `u13mh` (the `array.join` element sink) and `u13mi` (the
     typed-`let` RHS sink) to `tests/fn-arg-type-mismatch-wired.test.ts`. Each
     gate was neutered independently against the full suite and reds exactly
     its own cell with the `… got array<<withheld>>` signature measured here.
  2. **Line-citation drift into `src/parser/type-layer-checks.ts`.** The file
     grows by 17 lines, so citations at line ≥1106 shift. The six citations in
     the three test files this change touches were re-derived and verified
     against the code they land on, and the file was deliberately held to
     exactly `+17` so those corrections stay exact; the remaining tree-wide
     citations — chiefly in `docs/bugs/**`, which pin their own HEADs by
     convention — are bug 0134's recorded class and are left as found. Two
     specific ones a later pass should take:
     `tests/fn-arg-type-mismatch-wired.test.ts`'s `u12` comment cites the arm
     as `:1071–1105` while narrating its pre-0050 behaviour, so the span and
     the prose must move together; and
     `tests/index-element-alias-unfolded.test.ts`'s `c3` comment cites the
     `join` guard's unfold at a signature line — wrong before this change and
     still wrong after, since the shift preserved its offset.
  3. **`docs/spec_topics/control-flow.md:13`'s empty-array claim measures
     false.** The byte-unchanged remainder of the edited line states that
     `for x in []` with no surrounding sink is
     `theta/parse/array-no-common-type`, "the same diagnostic that
     `let xs = []` raises in unannotated position"; both measure `[]` at this
     baseline. Untouched by this fix — the emission path is the common-type
     machinery — and adjacent to bugs 0081/0155. Filing candidate.
  4. **`unprovableBindings` marks by object identity, and a `TypeEnv` alias's
     element object is shared.** With `schema L = array<integer>` and
     `schema P { xs: L }`, an unprovable `for a in p.xs` marks the shared alias
     element, which then suppresses a true `fn-arg-type-mismatch` in a later
     `for b in ys { g(b) }` over a provable `ys: L`. The `par for` arm has the
     identical behaviour at this baseline, the settled §Fix ordered the marking
     mirrored, and the failure direction is the admissible one — a withheld
     true positive, never a false `E`. Filing candidate covering both arms.
     **Discharged in 0.113.0** by bug
     [0194](./0194-unprovable-marking-by-object-identity-shared-alias-element.md),
     which covers both arms in one commit through a shared
     `TypeLayerWalk.bindLoopElement`: each arm now records and marks a fresh
     twin of the element it would otherwise borrow, so a withhold applies to the
     one loop variable it was taken for. This item's own fixture stopped
     poisoning first — bug 0190 (0.111.0) made `p.xs` a proof — so 0194's
     witness is built on an erased receiver instead, and it closes the same
     suppression for `collectSchemaFields`' declared-field objects and
     `paramsFieldBindings`' seeded objects as well as for a `TypeEnv` alias's
     element. The `let` arm's own borrowed marking is unmoved and is recorded as
     0194's residual 1.
  5. **Orchestrator self-authorizations, recorded rather than left invisible.**
     (i) Cells `u9` and `u13r` moved although the fix brief named only `n1`,
     `u12e` and `u13me`. `u9`'s re-adjudication on this exact event is named in
     `u12e`'s and `u13me`'s own comments and in bug 0050's §Fix residuals, and
     `u13r`'s dissolution is named three times in bug 0143 — §Related,
     §Non-goals, and its ordering section: "If the plain `for` variable gains
     the iterand's element type, c1–c4 stop being withheld-binder rows". Both
     were treated as pre-authorized on that evidence rather than as new
     decisions, and `u13r` was re-pointed rather than flipped so its assertion
     stays byte-identical. (ii) After the clean round-3 review the orchestrator
     reflowed `collectLocalBinderNames`'s doc comment to net-zero growth —
     comment-only, no executable line, gates re-run green — so the file's total
     growth is exactly `+17` and every citation corrected during the review
     rounds resolves. Both are bounded and touch no assertion and no behaviour.
- Discharge notes appended: 0089 (its §Fix *Residuals* item (ii) recorded this
  gap as confirmed, not closed — now closed), 0090 (the `CompatType` map's
  writer list gains the `for` arm — note only, its §Fix untouched), 0143 (its
  group (c)'s plain-`for`-fed rows dissolve, exactly as its own ordering
  section predicted — note only).
- Pinned dispositions / non-goals: route 2 rejected on measurement, above.
  §Fix (e) posture 1 taken, and `src/parser/static-type-inference.ts` is
  byte-unchanged — its binding-blind `infer` pass owes no binding (§Fix (a)'s
  finding). The `par for` arm is untouched; its non-`array` fallback and its
  CTRL-3 element rendering are §Non-goals. `theta/parse/immutable-rebinding` on
  a `for` variable stays out (bug 0115 and the mutability non-goal; witness row
  e2 pins the silence). The reassignment arm's compatibility check stays out
  (bugs 0115/0090). `match` pattern-variable typing stays out (RFC 0008 and bug
  0145, named explicitly as out of scope). `annotationToCompatType`'s leniency
  stays out (bug 0124). The fn-argument sink's withholding on member reads
  stays out (bug 0190). No new diagnostic code, no registry row, no new
  placeholder.
