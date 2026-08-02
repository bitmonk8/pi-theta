# Bug 0089 — An alias-typed `fn` parameter stays opaque to the two structural gates that never unfold it: `schema L = array<string>` + `fn f(xs: L) { for x in xs { … } }` draws a false `theta/parse/non-array-iterand`, and `schema L = array<integer>` + `xs.join(",")` loses its `theta/parse/non-string-array-join`

- **Status:** open. §Fix is settled — unfold both gates' input through the
  exported `unfoldAlias` before the `kind` test.
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
