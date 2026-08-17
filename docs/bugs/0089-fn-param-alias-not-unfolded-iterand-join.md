# Bug 0089 — An alias-typed `fn` parameter stays opaque to the two structural gates that never unfold it: `schema L = array<string>` + `fn f(xs: L) { for x in xs { … } }` draws a false `theta/parse/non-array-iterand`, and `schema L = array<integer>` + `xs.join(",")` loses its `theta/parse/non-string-array-join`

- **Status:** fixed (0.72.0). §Fix was settled — unfold both gates' input
  through the exported `unfoldAlias` before the `kind` test.
- **Kind:** defect. Six type classifiers read a static type at a checking
  boundary. Four resolve a `named` type through the `TypeEnv` and continue on
  the alias right-hand side (TYPE-11); two test `type.kind` on the raw type and
  take an alias's `named` shape as final. The divergence is bidirectional: the
  `for` / `par for` iterand gate rejects a program the spec admits, and the
  `array.join` element gate drops a rejection the spec requires.
- **Related:**
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md)
    (fixed 0.55.0) — the same two gates, reached through the `let` route. Its
    fix records the declared annotation in TYPE-11-transparent form
    (`type-layer-checks.ts:591–594`), which closes that route, and exports
    `unfoldAlias` (`type-compat.ts:155`) for the reuse. Its §Fix *Residuals*
    item (ii) (`:263–268`) records the `fn`-parameter route as out of that
    report's scope, states that `checkForIterand` and the join gate were
    deliberately left unmodified, and names the two-of-six measurement this
    report reproduces. The `let`-route controls below are green because of that
    fix.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
    (open) — the same `fn` boundary, a disjoint check. 0050 is the
    **caller** side: `checkFnArgCompat` (`type-compat.ts:452`) has no `src/`
    caller, so an argument's static type is never checked against the declared
    parameter type. This report is the **body** side: the parameter type is
    recorded and consulted, and two gates in the body misread it. Neither fix
    touches the other's code — wiring `checkFnArgCompat` at the call site leaves
    both reproductions below unchanged, and unfolding at the two gates leaves
    `fn-arg-type-mismatch` unemitted.
  - [0033](./0033-body-level-schema-alias-unsupported.md) (fixed 0.45.0) —
    established the three-way `TypeEnv` classification (`object-schema`,
    `alias`, head-only) that `unfoldAlias` reads. This report is about
    consumption sites that do not read it.
- **Affected** (every citation verified at HEAD `2eafbf10`, 0.55.0):
  - **The parameter record** — `walkFn`,
    `src/parser/type-layer-checks.ts:667–673`. `:671` sets the body scope entry
    to `annotationToCompatType(p.type) ?? { kind: "named", name: p.type }` —
    the raw declared type. `annotationToCompatType` (`:455–477`) returns
    `{ kind: "named", name: text }` for any non-primitive, non-`array<…>`,
    non-union source (`:476`), so `xs: L` records `named L` whatever `L`
    declares. No `TypeEnv` is consulted at this line, and none is available:
    `walkFn` holds `this.env` but does not use it here.
  - **Gate 1 — `checkForIterand`**, `src/parser/control-flow.ts:51–66`. `:55`
    is `if (iterand.type.kind === "array") { return undefined; }`; `:61` emits
    `theta/parse/non-array-iterand`; `:64` renders the message through
    `displayType`. The function takes no `TypeEnv`, and its input type
    `ForIterand` (`:39–41`) carries only `type`, so no unfolding is reachable
    from inside it. Two call sites, both passing an un-unfolded type: the `for`
    statement arm (`type-layer-checks.ts:612–620`, call at `:613`) and the
    `par for` expression arm (`:1081–1092`, call at `:1084`).
  - **Gate 2 — the `array.join` element gate**, `src/parser/type-layer-checks.ts:1222`,
    inside `checkMethodCall` (`:1217–1241`):
    `if (e.method === "join" && targetType.kind === "array")`. `checkArrayJoin`
    (`src/runtime/stdlib-array.ts:100–124`) is called from inside that guard and
    nowhere else — `rg -n "checkArrayJoin" src/` returns the definition, the
    import at `type-layer-checks.ts:84`, the call at `:1223`, and one comment —
    so a `named` receiver never reaches the element test at `:107–109`.
    `this.env` is in scope at `:1222` and is used twelve lines later
    (`:1234`, `classifyReceiver`).
  - **The four classifiers that do apply TYPE-11**, all reached from the same
    `named L` parameter record:
    - `classifyOperand` (`type-layer-checks.ts:113–141`) — `case "named"`
      `:129–139`, resolves through `resolveNamed` and recurses on `decl.rhs`
      at `:138`.
    - `classifyReceiver` (`:160–183`) — `case "named"` `:172–181`, recursing
      at `:180`.
    - `classifyIndexReceiver` (`type-compat.ts:366–392`) — `case "named"`
      `:380–390`, recursing at `:389`.
    - `checkCompatible` (`type-compat.ts:139–145`) — unfolds both operands at
      `:144` through `unfoldAlias` (`:155–172`), which walks the alias chain to a
      non-alias form and leaves an object-schema `named` (TYPE-10) and an
      unresolvable `named` intact.
  - **The loop-variable element derivation** keys on the same raw shape and so
    fails alongside gate 1: `type-layer-checks.ts:1113–1120` binds the `par for`
    variable to `iterandType.element` when `iterandType.kind === "array"` and to
    `named "unknown"` otherwise (`:1117–1119`), and
    `src/parser/static-type-inference.ts:269–274` does the same in the
    whole-program typing pass. An alias iterand therefore also erases the
    body's loop-variable type (reproduction group (d)).
  - **The registration consequence** — `parseDiscoveredTheta`
    (`src/extension/production-composition.ts:1928`) drops a theta carrying any
    error-severity `theta/parse/*` diagnostic at `:1941`
    (`hasLoadParseError`, `:1894–1900`). `theta/parse/non-array-iterand` is
    `E` severity (`control-flow.ts:60`).
  - **The absent runtime backstop for gate 2** — `src/runtime/stdlib-array.ts:66–67`
    evaluates `join` as `receiver.join(args[0] as string)`, with the comment at
    `:63–65` stating the parse-time `checkArrayJoin` precondition "guarantees a
    `string` element type, so no implicit conversion happens here".
- **Observed at:** 0.55.0 (`2eafbf10`), offline, through the production
  whole-file parser (`parseThetaDocument`), reading the aggregated diagnostic
  codes and messages.

## Summary

A `fn` parameter's declared type is recorded raw. For a type-alias schema
(`schema L = array<string>`) the record is an opaque `named L`. Four of the six
classifiers that read it resolve the name through the `TypeEnv` and continue on
the alias right-hand side; the iterand gate and the `array.join` element gate
test `type.kind` directly and treat `named L` as a non-array. TYPE-11 makes `L`
and `array<string>` the same type, so both gates reach the wrong answer, in
opposite directions: iterating an alias-typed parameter is rejected, and joining
one is not checked.

The `let` route through the same two gates was closed in 0.55.0 by recording the
annotation in TYPE-11-transparent form (bug 0083). The `fn`-parameter route was
excluded from that fix's scope and is unchanged.

## Reproduction

Parse-only, through `parseThetaDocument`, with `---\nmode: prompt\n---`
prepended to each source. Aggregated diagnostic codes. Two body shapes recur;
each row names the shape and the declarations that precede it. `ITER` is

```
fn f(xs: <T>) {
  for x in xs {
    x
  }
}
1
```

and `JOIN` is

```
fn f(xs: <T>): string {
  xs.join(",")
}
1
```

with `<T>` the declared parameter type given per row. The trailing `1` supplies
the theta's final value.

**(a) The iterand gate rejects a spec-legal program.**

| Source | Observed | Expected |
| --- | --- | --- |
| `schema L = array<string>` + `ITER` with `<T>` = `L` | `["theta/parse/non-array-iterand"]`, message `'for' expects array<T> after 'in'; got L` | `[]` |
| `ITER` with `<T>` = `array<string>` | `[]` | `[]` (control — the same body without the alias) |
| `schema L = array<string>` <br> `let e: L = ["a"]` <br> `for x in e {` <br> `x` <br> `}` <br> `1` | `[]` | `[]` (control — the `let` route, closed by 0083) |
| `schema L = array<string>` + `ITER` with `<T>` = `L` and `for` replaced by `par for` | `["theta/parse/non-array-iterand"]` | `[]` — the second `checkForIterand` call site |
| `schema M = array<string>` <br> `schema L = M` <br> + `ITER` with `<T>` = `L` | `["theta/parse/non-array-iterand"]`, message `… got L` | `[]` — nested aliases unfold under TYPE-11 |
| `schema P {` <br> `a: string` <br> `}` <br> + `ITER` with `<T>` = `P` | `["theta/parse/non-array-iterand"]` | same code — TYPE-10 keeps an object schema nominal and non-iterable |
| `ITER` with `<T>` = `string` | `["theta/parse/non-array-iterand"]` | same code (control — the registered trigger) |

**(b) The join element gate loses a spec-required rejection.**

| Source | Observed | Expected |
| --- | --- | --- |
| `schema L = array<integer>` + `JOIN` with `<T>` = `L` | `[]` | `["theta/parse/non-string-array-join"]` |
| `JOIN` with `<T>` = `array<integer>` | `["theta/parse/non-string-array-join"]`, message `array.join requires a string element type; got array<integer>` | same (control — the same body without the alias) |
| `schema L = array<integer>` <br> `let e: L = [1]` <br> `e.join(",")` | `["theta/parse/non-string-array-join"]` | same (control — the `let` route, closed by 0083) |
| `schema L = array<string>` + `JOIN` with `<T>` = `L` | `[]` | `[]` — the right disposition, reached by skipping the gate rather than passing it |

**(c) The four classifiers that unfold, over the same parameter record.** Each
fires, which establishes that the parameter type resolves and that the two gates
above are the outliers rather than the boundary being blind. Each source ends
with a `1` statement.

| Source | Observed | Classifier |
| --- | --- | --- |
| `schema L = array<string>` <br> `fn f(xs: L) {` <br> `xs.frobnicate()` <br> `}` | `["theta/parse/unknown-method"]` | `classifyReceiver` |
| `schema L = array<string>` <br> `fn f(xs: L): string {` <br> `xs + 1` <br> `}` | `["theta/parse/mixed-plus-operands"]` | `classifyOperand` |
| `schema S = string` <br> `fn f(s: S) {` <br> `s[0]` <br> `}` | `["theta/parse/non-indexable-receiver"]` | `classifyIndexReceiver` |
| `schema N = number` <br> `fn f(n: N) {` <br> `let m: integer = n` <br> `m` <br> `}` | `["theta/parse/integer-narrowing"]` | `checkCompatible` / `unfoldAlias` |

**(d) The loop variable loses its type alongside gate 1.** `PITER` is `ITER`
with `for` replaced by `par for` and the body statement `x` replaced by
`x.frobnicate()`.

| Source | Observed | Expected |
| --- | --- | --- |
| `schema L = array<string>` + `PITER` with `<T>` = `L` | `["theta/parse/non-array-iterand"]` | `["theta/parse/unknown-method"]` — the iterand is legal and `x` is a `string` |
| `PITER` with `<T>` = `array<string>` | `["theta/parse/unknown-method"]` | same (control) |
| `schema L = array<string>` <br> `let e: L = ["a"]` <br> `par for x in e {` <br> `x.frobnicate()` <br> `}` | `["theta/parse/unknown-method"]` | same (control — the `let` route) |

**(e) Boundary dispositions that must not change.**

| Source | Observed |
| --- | --- |
| `ITER` with `<T>` = `Nope` (undeclared) | `["theta/parse/non-array-iterand"]`, message `… got Nope` — an unresolvable `named` rejects at gate 1 |
| `JOIN` with `<T>` = `Nope` (undeclared) | `[]` — the same unresolvable `named` defers at gate 2 |
| `schema S = string` + `ITER` with `<T>` = `S` | `["theta/parse/non-array-iterand"]`, message `… got S` |
| `schema P {` <br> `a: string` <br> `}` <br> `schema Q = P` <br> + `ITER` with `<T>` = `Q` | `["theta/parse/non-array-iterand"]` — an alias of an object schema unfolds to a nominal, still non-iterable |
| `schema A = B` <br> `schema B = A` <br> + `ITER` with `<T>` = `A` | `["theta/parse/type-alias-cycle", "theta/parse/non-array-iterand"]` — a cycle participant is omitted from the `TypeEnv`, so it does not unfold |

Probe: throwaway vitest calling `parseDoc` (`tests/helpers/e2e-s1.ts`, which
wraps the production `parseThetaDocument`) on each source and printing
`.diagnostics.map(d => …)`; deleted after the run.

## Expected behaviour

- `docs/spec_topics/type-system.md:54` — TYPE-11: a `NamedType` whose
  declaration is a type-alias schema `schema X = R` "is **transparent** in `⊑`:
  on whichever side of a `T₁ ⊑ T₂` check it appears, it is replaced by its
  right-hand side `R` and the check re-evaluated, recursing through nested
  aliases until a non-alias form is reached". `L` declared `array<string>` is
  `array<string>`, in a parameter position as anywhere else.
- `docs/spec_topics/control-flow.md:13` — "The expression after `in` must have
  type `array<T>` for some `T`; iterating strings, objects, or numbers is
  `theta/parse/non-array-iterand`". An alias of `array<string>` has type
  `array<string>`, and is none of the three named populations. Group (a) row 1
  must load.
- `docs/spec_topics/diagnostics/code-registry-parse.md:64` — the registered
  *Trigger* for the code is "`for x in expr` where `expr` is not `array<T>`".
  Under TYPE-11 the reproduction's `expr` **is** `array<T>`, so the emission
  sits outside the registered trigger.
- `docs/spec_topics/expressions.md:108` (`array<T>` stdlib table, `join` row) —
  "Element type must be `string`; non-string element types are
  `theta/parse/non-string-array-join` (no implicit type conversion in theta
  1.0)". `L` declared `array<integer>` has a non-string element type, so
  group (b) row 1 must report the code.
- `docs/spec_topics/type-system.md:52` — TYPE-10 bounds the transparency: an
  object-schema `named` stays nominal, so group (a) row 6 and group (e) row 4
  keep rejecting.

## Actual behaviour / root cause

The parameter's declared type reaches both gates as an opaque `named L`, and
both gates decide on `type.kind` without consulting the `TypeEnv`.

`walkFn` records the raw annotation (`type-layer-checks.ts:671`). That record is
correct as a record — it is the declared type — and four consumers handle it,
because each resolves `named` through `resolveNamed` before deciding.
`checkForIterand` cannot: its input carries no `TypeEnv` (`control-flow.ts:39–41`),
so `:55` compares `"named" === "array"` and falls through to the emission at
`:61`. The join gate has `this.env` in scope but does not use it at `:1222`, so
`checkArrayJoin` is never called and the element type is never examined.

The two directions follow from which side of the gate the alias lands on:

- Gate 1 admits only `kind === "array"`, so an unrecognised shape **rejects**.
  An alias of an array is unrecognised, so a legal iterand is refused.
- Gate 2 runs the element check only for `kind === "array"`, so an unrecognised
  shape **defers**. An alias of a non-string array is unrecognised, so an
  illegal join is admitted.

Bug 0083 fixed the `let` route by changing what is recorded, not what the gates
read: `:591–594` records `unfoldAlias(annotation, this.env)`, so the gates see
`array<string>` and answer correctly for a `let`. That fix explicitly declined
to modify the gates (0083 `:232–234`), because doing so would change the
`fn`-parameter route it did not own. The gates are therefore still the only two
of the six classifiers that do not apply TYPE-11, and the `fn` parameter is the
remaining route that reaches them with an alias.

The defect is pre-existing rather than introduced by 0083: the recording line at
`:671` is untouched by that fix, which changed only the `let` arm, and 0083's own
§Fix *Residuals* item (ii) (`:263–268`) records the same two reproductions
measured at `61806a3a` (0.54.0).

## Why it matters

1. Group (a) is a load failure, not a warning. `theta/parse/non-array-iterand`
   is `E` severity, and `parseDiscoveredTheta` drops any theta carrying an
   error-severity `theta/parse/*` diagnostic (`production-composition.ts:1941`),
   so the slash command never registers. The author's repair is to delete the
   alias from the signature — to stop using the language feature that TYPE-11
   defines.
2. The rejection is position-dependent, so the author has no consistent rule to
   apply. The same `schema L = array<string>` parameter resolves correctly at
   the four positions measured in group (c) and fails at the two measured in
   groups (a) and (b), with no diagnostic distinguishing the cases.
3. Group (b) removes the only check on the input. The runtime performs
   `Array.prototype.join` unconditionally (`stdlib-array.ts:66–67`), on the
   stated assumption that the parse-time precondition already held, so
   `array<integer>` elements are stringified by JS coercion — the implicit
   conversion `expressions.md:108` says theta 1.0 does not perform. Nothing is
   reported at either phase.
4. Group (d) compounds group (a): while the iterand diagnostic stands, the
   `par for` body's loop variable types as `unknown`, so every body check on it
   defers. A fix that unfolds only inside `checkForIterand` leaves this half
   open, because the element derivation is a separate `kind === "array"` test.
5. No existing test covers the route. Bug 0083's group (d)
   (`tests/let-annotation-recorded-binding-type.test.ts:206–275`) pins alias
   transparency at these two gates for `let` bindings only, and the four direct
   `checkForIterand` seam calls in `tests/control-flow.test.ts` (`:136`, `:148`,
   `:158`, `:171`) pass concrete types.

## Non-goals

- Not about the caller side of the `fn` boundary. Argument-to-parameter
  compatibility is bug 0050 and is unaffected either way.
- Not about `walkFn`'s record at `:671`. Recording the declared type raw is
  correct; the alternative — unfolding at the record, mirroring 0083's `let`
  arm — is rejected in §Fix.
- Not about the plain `for` statement's body scope. `walkStmt`'s `case "for"`
  (`type-layer-checks.ts:612–620`) binds no loop variable at all, so `ITER`
  with `<T>` = `array<string>` and the body statement replaced by
  `x.frobnicate()` reports nothing even with a concrete array parameter. That
  gap is independent of alias transparency and is not addressed here — which is
  why group (d) uses `par for`, the arm that does bind the variable.
- Not about the unresolvable-`named` dispositions in group (e), which differ
  between the two gates (reject vs. defer) for reasons predating this report.
  `unfoldAlias` leaves an unresolvable `named` intact, so a fix preserves both.
- Not about runtime behaviour of the iterand: the rejected programs never load,
  so no value is produced.

## Fix

Unfold the type at both gates through the exported `unfoldAlias`
(`type-compat.ts:155`) before the `kind` test, and at the element derivation
that shares the test.

1. **Gate 1.** Give `checkForIterand` the `TypeEnv` — either as a second field
   on `ForIterand` (`control-flow.ts:39–41`) or as a parameter — and apply
   `unfoldAlias` to `iterand.type` before `:55`, using the unfolded value for
   both the `kind` test and the `displayType` render at `:64`. Unfolding inside
   the function covers both call sites (`type-layer-checks.ts:613`, `:1084`),
   which already hold `this.env`.
2. **Gate 2.** At `type-layer-checks.ts:1222`, compute
   `unfoldAlias(targetType, this.env)` and test its `kind`, passing its
   `element` to `checkArrayJoin`. Reuse the same value for the
   `classifyReceiver` call at `:1234`, which unfolds internally and is
   unaffected by receiving a pre-unfolded type.
3. **The element derivation.** Apply the same unfolding at
   `type-layer-checks.ts:1117` and `static-type-inference.ts:271`, so a legal
   alias iterand binds the `par for` variable to the element type instead of
   `named "unknown"` (group (d)).

Unfolding at the gates rather than at the record (`:671`) is what keeps the fix
whole: the gates are the sites that misread the type, and every route that
reaches them — the `fn` parameter today, any future binder that records a raw
declared type — is covered at once. Unfolding at `:671` alone would fix the two
reproductions and leave the gates as the same two outliers.

Constraints any fix must satisfy, each with a witness in §Reproduction:

- An object-schema `named` and an alias of one stay non-iterable (TYPE-10):
  group (a) row 6 and group (e) row 4 keep reporting `non-array-iterand`.
  `unfoldAlias` returns an object-schema `named` unchanged, so this holds by
  construction.
- An unresolvable `named` keeps its current disposition at each gate — reject
  at gate 1, defer at gate 2 (group (e) rows 1–2) — and a cycle participant,
  which the `TypeEnv` omits, behaves as an unresolvable name (group (e) row 5).
- The registered trigger populations keep rejecting: a `string` iterand
  (group (a) row 7), an object-schema iterand (group (a) row 6), an alias of a
  `string` (group (e) row 3), and a concrete `array<integer>` join receiver
  (group (b) row 2).
- The `let` route stays green (group (a) row 3, group (b) row 3), so the fix
  composes with 0083's transparent record rather than duplicating it.
- The rejection message for a correctly-rejected alias renders the unfolded
  type: group (e) row 3 moves from `got S` to `got string`. That matches the
  registry template (`code-registry-parse.md:64`, `got <type>`) under TYPE-11.
  No committed fixture asserts the alias-name form — `rg -n "expects array<T>
  after" tests/ docs/` returns one assertion (`tests/control-flow.test.ts:143`,
  `got string` for a concrete `string`), two registry rows
  (`docs/reference/diagnostics.md:110`,
  `docs/spec_topics/diagnostics/code-registry-parse.md:64`), two comments, and
  one RFC prose line (`docs/rfcs/0008-match-binding-type-inference.md:26`).
- `tests/control-flow.test.ts` calls `checkForIterand` directly at `:136`,
  `:148`, `:158` and `:171`; a signature change updates those four calls.

The regression witness runs in both directions. Green: group (a) rows 1, 4, 5,
group (b) row 1, and group (d) row 1 report the expected codes. Red on a
neutralised fix: reverting the unfold at gate 1 reds group (a) rows 1, 4, 5;
reverting it at gate 2 reds group (b) row 1 alone; reverting only the element
derivation reds group (d) row 1 alone. All three neutralisations must be proved
separately, because the three sites are independent `kind === "array"` tests.

No spec, registry or `docs/reference/` edit follows.
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) holds: no new
code, no new row, no widened trigger. The fix narrows
`theta/parse/non-array-iterand` back to its registered trigger and restores
`theta/parse/non-string-array-join` at a receiver the registry already covers.

## Fix (0.72.0)

The settled §Fix implemented as written, at **four** unfolding sites across
three files — the three §Fix names, plus one the receiver unfold exposed. Two
review rounds, two fixer rounds, one verification round. Every citation below
is re-derived at the fix commit; the §Affected anchors above were taken at
`2eafbf10` (0.55.0) and several had drifted by position, substance intact.

**What shipped.**

- `src/parser/control-flow.ts` — **gate 1.** `checkForIterand` takes a third
  parameter `env: TypeEnv` and unfolds `iterand.type` through `unfoldAlias`
  before the `kind === "array"` test, using the same unfolded value for the
  `displayType` render. The parameter was chosen over §Fix's alternative of a
  second `ForIterand` field: a trailing `env` parameter is the module-wide
  convention (`unfoldAlias`, `classifyReceiver`, `classifyIndexReceiver`,
  `checkCompatible`), and `ForIterand` models the iterand, not the checking
  environment. Unfolding inside the function covers both call sites.
- `src/parser/type-layer-checks.ts` — **gate 2 and element derivation 3a.**
  `walkStmt`'s `case "for"` and `walkExpr`'s `case "par-for"` pass `this.env`
  to `checkForIterand`. `checkMethodCall` computes
  `unfoldAlias(targetType, this.env)` once into one local, tests its `kind` in
  the `join` guard, and reuses it for `classifyReceiver` — which unfolds
  internally and is unaffected by a pre-unfolded input. `pushUnknownMethod`
  deliberately keeps the raw `targetType`, so `unknown method '…' on type L`
  still names the declared type. `walkExpr`'s `par-for` arm unfolds the iterand
  again at its own site for the loop-variable element binding, independently of
  the gate.
- `src/parser/static-type-inference.ts` — **element derivation 3b.**
  `#typeExpr`'s `par-for` arm unfolds the iterand before its own
  `kind === "array"` test, so a legal alias iterand supplies the CTRL-3 value's
  element payload instead of `named "unknown"`.
- **The fourth site, found by review round 1 and adjudicated into scope.**
  Unfolding only the receiver exposed `checkArrayJoin`'s own raw element test:
  `schema E = string` / `schema L = array<E>` / `fn f(xs: L): string { xs.join(",") }`
  flipped from `[]` at `36540b09` to a **false** error-severity
  `theta/parse/non-string-array-join`, so a spec-legal theta that loaded would
  have stopped registering. The `checkArrayJoin` call therefore passes
  `unfoldAlias(unfoldedTarget.element, this.env)`. This is inside the settled
  §Fix on the 0083 precedent, whose own review round 1 found the literal §Fix
  "regressed two spec-legal dispositions through an alias" and resolved it by
  applying TYPE-11 transparency. It is also DIAG-2-required: the registered
  trigger (`code-registry-parse.md:43`) is "an array whose element type is not
  `string`", and under TYPE-11 `array<E>` with `schema E = string` **has**
  element type `string`, so the emission sat outside its own registered
  trigger — the identical fault this report prosecutes gate 1 for.
  `checkArrayJoin` is a pure element predicate holding no `TypeEnv`, and has
  exactly one caller, so the transparency belongs at the call site. Because
  that one line serves every spelling of its input, the concrete-receiver
  (`array<E>`) and `let`-route spellings of the same element defect are healed
  with it — a consequence of putting the check inside its registered trigger,
  not a separate feature.

**How it composes with 0083 rather than duplicating it.** 0083 (0.55.0) closed
the `let` route by changing what is **recorded** — `walkStmt`'s `case "let"`
records `unfoldAlias(annotation, this.env)` — and deliberately left both gates
unmodified, because unfolding inside them would also have changed the
`fn`-parameter route it did not own. This fix changes what the gates **read**,
and leaves the `let` record untouched. Both routes now reach the same answer by
different means, and the `let`-route controls are green in both witnesses:
`tests/let-annotation-recorded-binding-type.test.ts` is byte-unchanged at
19/19, and rows a3, b3, b7 and d3 of the new witness re-assert the `let` route
from the `fn`-parameter side. §Fix's rejected route — unfolding at `walkFn`'s
parameter record — is untouched: recording the declared type raw is correct,
and the four classifiers that already resolve it (group (c)) prove the record
is not the fault.

**The re-derived pre-fix baseline.** Every row of §Reproduction groups (a),
(b), (c), (d) and (e) was re-measured at `36540b09` through the production
`parseThetaDocument`, sixteen versions after the `2eafbf10` observation.
**No drift**: all twenty-three rows reproduced their recorded codes and
messages exactly, including group (e) row 5's
`["theta/parse/type-alias-cycle", "theta/parse/non-array-iterand"]`. Three
observables the report did not record were measured and are now pinned: group
(e) row 4's message was `got Q`; group (c) row 1's was
`unknown method 'frobnicate' on type L`; and the §Non-goals plain-`for`
body-scope gap reports `[]` even for a concrete `array<string>` parameter.

**Deliberate observable changes, all pinned.** Group (e) row 3 moves from
`got S` to `got string` and row 4 from `got Q` to `got P`: gate 1 renders the
same value it tested, which is what `code-registry-parse.md:64`'s `got <type>`
template names under TYPE-11. The join gate's message likewise renders the
unfolded element (`got array<integer>` for `schema E = integer`), identically
across both receiver spellings. Group (e) row 5 is **unchanged** at `got A`: a
type-alias-cycle participant is omitted from the `TypeEnv` by `collectTypeEnv`,
so `unfoldAlias` leaves it intact and it behaves as an unresolvable name. The
corpus sweep `rg -n "expects array<T> after" tests/ docs/` was re-run at
`36540b09` and confirms no committed fixture asserts an alias-name form: one
assertion (`tests/control-flow.test.ts`, `got string` for a concrete `string`,
invariant here), two registry rows, two comments, and one RFC prose line.

**Bounds asserted, not assumed.** An object-schema `named` and an alias of one
stay non-iterable (TYPE-10). An unresolvable `named` keeps its asymmetric
disposition — reject at gate 1, defer at gate 2. The registered trigger
populations keep rejecting: a `string` iterand, an object-schema iterand, an
alias of a `string`, a concrete `array<integer>` join receiver. At the element
level the same three bounds hold: `array<P>` over an object schema,
`array<Nope>` over an undeclared name, and `array<A>` over a cycle participant
all keep emitting with their own rendered names.

**Gates.** Witness
`npx vitest run tests/fn-param-alias-unfolded-at-gates.test.ts` →
`Tests 36 passed (36)`. Full default suite `npm test` →
`Test Files 264 passed (264) / Tests 3857 passed (3857)`, against a
`9fe13534` baseline of 263 / 3821. `npx tsc -p tsconfig.json --noEmit` → exit
0, no output. `npm run lint` → exit 0, no output.
`tests/committed-fixture-parse-gate.test.ts` → 34/34, and identical under a
combined revert of all five neutralisations, so no shipped `.theta` fixture's
disposition moved; the two `.thetalib` files declare no type-alias schema and
neither `for`-iterates nor joins an aliased parameter.

**Five independent neutralisation proofs.** §Fix mandates three, because the
sites are independent `kind === "array"` tests; the fourth site added a fourth,
and gate 2 splits into receiver and element. Each was a targeted byte edit,
run, then restored byte-exact and hash-verified (`git stash` was never used).
Gate 1 alone → `a1`, `a4`, `a5` full, the message halves of `e3`/`e4`, **plus**
`d1` and `s1` full, because sites 3a/3b are observable only once gate 1 admits
the iterand. Gate 2's receiver alone → `b1` and `b9`, both full. Gate 2's
element alone → `b5`–`b8` full plus the message halves of `b9`/`b10`. Site 3a
alone → `d1` only. Site 3b alone → `s1`'s message half only, its code list
holding because an `array`-kind receiver has no `frobnicate` member whatever
the payload name says. A **combined** revert is demonstrably insufficient
evidence: under it `b5` passes for the wrong reason, the receiver guard bailing
out before the element predicate is reached.

**Tests.** `tests/fn-param-alias-unfolded-at-gates.test.ts` — 36 rows, offline,
through the production `parseThetaDocument` over the shared `parseDoc` harness.
Groups (a), (b), (c), (d) and (e) replay §Reproduction; `b5`–`b13` are the
element-level rows and their three bounds; group (s) is the sole witness for
site 3b, reached through the `par for` value's `Result<U, QueryError>` payload
render; `n1` pins the §Non-goals plain-`for` gap as staying `[]`, so a fix that
widened into it would red. Every row asserts the exact aggregated code list
with `toEqual`, never a containment matcher, and every asserted message carries
a registry citation (DIAG-4). `tests/control-flow.test.ts` — the four direct
`checkForIterand` seam calls gained the third argument, which §Fix
pre-authorized ("a signature change updates those four calls"); no assertion
was weakened, reworded, reordered or deleted, and the file is otherwise
byte-identical. **Live:** an additive registration-only H8a cell in
`tests/live/live-production-acceptance.test.ts` (+172/−0, zero tokens, the
0084 precedent) plants `schema L = array<string>` with
`fn f(xs: L) { for x in xs { … } }` in a real workspace beside a precondition
control, boots the shipped extension, and asserts the alias-typed caller
**registers** and that the `theta-system-note` channel read off the settled
`SessionManager` carries no `non-array-iterand` rejection. Both directions
proved: with gate 1 neutralised the control registers and the alias caller does
not; restored, it does. `tests/live/live-production-acceptance.test.ts` → 16/16
and `tests/live/acceptance/` → 11/11 on real runs.
`tests/fixtures/h7a/permitted-codes.json` is byte-unchanged
(`a4a8da04209f90e13d815edd92c1fc682e2a2236`) — this fix only removes emissions,
so it cannot add to H9a's empty-capture stderr gate, and the real runs confirm
it.

**No spec, registry or `docs/reference/` edit.** DIAG-2 held throughout: no new
code, no new row, no widened trigger. Both changes narrow an emission back
inside a trigger the registry already carries.

**Residuals.** (i) `#typeExpr`'s **index**-element derivation
(`static-type-inference.ts`, the `target.kind === "array" ? target.element :
named "index"` shape) has the identical TYPE-11 opacity at a site §Fix does not
name, and is unchanged here: `schema L = array<string>` with
`fn f(xs: L) { let y = xs[0]  y.frobnicate() }` reports `[]`, where the
concrete-parameter control reports `unknown method 'frobnicate' on type
string`. Pre-existing and out of the settled scope. (ii) The §Non-goals
plain-`for` body-scope gap is confirmed, not closed: `walkStmt`'s `case "for"`
binds no loop variable at all, so
`fn f(xs: array<string>) { for x in xs { x.frobnicate() } }` reports `[]` even
with a concrete array parameter. Row `n1` pins it as a tripwire.
(iii) `tests/let-annotation-recorded-binding-type.test.ts`'s group (d) comment
states that `checkForIterand` "is handed no `TypeEnv` to unfold with", which
this fix makes false. That file is 0083's witness and is held byte-unchanged,
so the comment is left as found. (iv) `rg` of the corpus for citations into the
three edited files found none staled by this fix's line shifts; the pre-existing
drift 0083 residual (iii) records is left as found.

**Discharge notes appended:** 0083 (its §Fix residual (ii) named this route as
out of scope and is now discharged), 0050 (same `fn` boundary, disjoint check —
note only), 0033 (the classification `unfoldAlias` reads).

**Pinned dispositions / non-goals.** The unresolvable-`named` asymmetry —
reject at gate 1, defer at gate 2 — is preserved deliberately, not
incidentally. `walkFn`'s parameter record stays raw. `checkFnArgCompat` still
has no `src/` caller, so 0050 is untouched in both directions.

## Provenance

- Spec: `docs/spec_topics/type-system.md:52` (TYPE-10), `:54` (TYPE-11);
  `docs/spec_topics/control-flow.md:13`;
  `docs/spec_topics/expressions.md:108`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:43`
  (`non-string-array-join` row), `:64` (`non-array-iterand` row);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2);
  `docs/reference/diagnostics.md:110`.
- Implementation: `src/parser/control-flow.ts:39–41`, `:51–66`;
  `src/parser/type-layer-checks.ts:113–141`, `:160–183`, `:455–477`,
  `:591–594`, `:612–620`, `:667–673`, `:1081–1092`, `:1113–1120`,
  `:1217–1241`; `src/parser/type-compat.ts:139–145`, `:155–172`, `:366–392`;
  `src/parser/static-type-inference.ts:269–274`;
  `src/runtime/stdlib-array.ts:63–67`, `:100–124`;
  `src/extension/production-composition.ts:1894–1900`, `:1928`, `:1941`.
- Tests establishing the route is uncovered:
  `tests/let-annotation-recorded-binding-type.test.ts:206–275` (the `let`-route
  twin); `tests/control-flow.test.ts:136`, `:148`, `:158`, `:171` (direct seam
  calls with concrete types).
- Existing reports read in full for duplicate separation: 0083, 0050; skimmed
  0033.
- Observations: throwaway vitest parse probe over `tests/helpers/e2e-s1.ts` at
  `2eafbf10`, deleted after the run. The `61806a3a` (0.54.0) measurement
  establishing that both reproductions predate the 0.55.0 fix is quoted from
  bug 0083 §Fix *Residuals* item (ii) (`:263–268`); it was not re-run here.

## Discharge note — bug 0125 (0.76.0)

Appended by the bug 0125 fix; nothing above is altered.

**§Fix (0.72.0) *Residuals* item (i) is discharged.** The index-element
derivation it names — `#typeExpr`'s `case "index"` arm in
`src/parser/static-type-inference.ts`, the
`target.kind === "array" ? target.element : named "index"` shape — now binds
`unfoldAlias(this.#typeExpr(node.target, env, bindings), env)` and tests the
unfolded value's `kind`. This report's route applied a fourth time, one line,
`unfoldAlias` reused not forked, no registry row. The measurement the residual
recorded is closed: `schema L = array<string>` with
`fn f(xs: L) { let y = xs[0]  y.frobnicate() }` now reports
`unknown method 'frobnicate' on type string`, the same message its
concrete-parameter control produces. Filed and prosecuted as
[0125](./0125-index-element-narrowing-not-alias-unfolded.md).

**This report's "only remaining `CompatType` sibling" claim, adjudicated.**
Round 2's sweep concluded that `static-type-inference.ts:249` was the only
remaining `CompatType` sibling of `kind === "array"`. Re-run at the 0125 fix
commit, the sweep still returns 14 hits, and the conclusion is **correct for
narrowing and wrong as stated**: three further raw-`CompatType` tests survive at
`type-layer-checks.ts:620`, `:958` and `:1050`. They route an array literal to
an element sink rather than narrowing anything, and they diverge under an alias
annotation — 0125 §Reproduction (f) measures it, and one divergence (f1) is a
*false* error-severity rejection of a spec-legal binding. They are a separate
report and are untouched. With 0125 shipped, the alias-unfolding **narrowing**
family is complete: all six `CompatType` narrowing tests on `kind === "array"`
now read an unfolded operand — this report's four sites, `type-compat.ts:212`
(unfolded upstream by `checkCompatible`), and 0125's.

**This report's witness is byte-unchanged and green.**
`tests/fn-param-alias-unfolded-at-gates.test.ts` → 36/36 at the 0125 fix commit,
including cell c3 (the index receiver path, which 0125 does not touch) and the
tripwire rows `n1` and `b12` that pin open bugs 0126 and 0127. 0125's own
witness re-asserts the receiver path from its side (group (b)), so a fix that
reached for `classifyIndexReceiver`'s three-way answer instead of `unfoldAlias`
would have redded here rather than passing silently.

**Residual (ii) is untouched.** The §Non-goals plain-`for` body-scope gap is
still open and is now filed as
[0126](./0126-plain-for-binds-no-loop-variable.md). Row `n1` still pins it.
Residual (iii) is likewise untouched: this file stays byte-unchanged, so
`tests/let-annotation-recorded-binding-type.test.ts`'s group (d) comment is
still left as found.

## Discharge note — bug 0126 (0.107.0): §Fix *Residuals* item (ii) is closed

Appended by the bug 0126 fix; nothing above is altered. **Note only — this
report stays fixed (0.72.0) and its own subject is untouched.**

§Fix *Residuals* item (ii) recorded the plain-`for` body-scope gap as
*confirmed, not closed*: "`walkStmt`'s `case \"for\"` binds no loop variable at
all, so `fn f(xs: array<string>) { for x in xs { x.frobnicate() } }` reports
`[]` even with a concrete array parameter. Row `n1` pins it as a tripwire."

[0126](./0126-plain-for-binds-no-loop-variable.md) is the adjudication that
closed it. `walkStmt`'s `case "for"` now records the loop variable with the
TYPE-11-unfolded iterand's element type when the iterand unfolds to an
`array`, so that program reports
`error theta/parse/unknown-method :: unknown method 'frobnicate' on type string`
— the message this report's own group (d) `par for` row `d1` already carried.

Two consequences for this report's witness, both deliberate and recorded in
0126's §Fix (0.107.0):

- **Row `n1` is inverted, not deleted.** Its input is unchanged; its
  expectation is now `["theta/parse/unknown-method"]` with `d1`'s message, and
  its comment cites 0126 as the adjudication that made the widening requested.
  The tripwire did its job — the gap could not drift unnoticed, and its flip
  was a decision rather than an accident.
- **The other 35 rows are byte-unchanged in their assertions and green**, which
  is what proves 0126 did not disturb this fix's four unfolding sites. Groups
  (a) and (e) use plain `for` with bodies that do not read the loop variable,
  verified rather than assumed.

Residuals (i), (iii) and (iv) of this report are untouched.
