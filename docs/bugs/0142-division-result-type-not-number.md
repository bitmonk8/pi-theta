# Bug 0142 — `#typeBinary`'s arithmetic arm reduces the two operands to a common type with no per-operator rule, so `3 / 2` types as `integer` against `expressions.md:232`'s "`/` always produces `number`": `fn g(n: integer)` called as `g(3 / 2)`, `let n: integer = 3 / 2`, an `integer`-declared schema field, an `array<integer>` element and a `par for … max` all load with zero diagnostics while the runtime binds `1.5`, and bug 0050's `provableArgType` discipline certifies the wrong type as PROVEN because its exactness test is taken against the same contradicted inference rule

- **Status:** fixed (0.80.0). The per-operator arm lands in `#typeBinary`
  exactly as §Fix prescribes, and §Fix (c)'s open sub-decision is settled as
  MIRROR — both recorded in §Fix (0.80.0), together with two places this
  document's own §Fix (a) summary understates what flips. No ordering
  dependency blocked it: bug
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) is
  **fixed (0.77.0)** and is this report's origin, not its prerequisite. §Fix
  names one coordination surface — 0050's witness
  (`tests/fn-arg-type-mismatch-wired.test.ts`) — and one open sibling,
  [0081](./0081-array-ternary-common-type-never-unions.md), which owns the
  reduction this arm calls into and whose fix does not reach the missing
  per-operator rule.
- **Sev/Diff estimate:** S1/D2 — a `number` value reaches an `integer`-annotated
  binding, an `integer`-annotated `fn` parameter, an `integer`-declared schema
  field and an `array<integer>` element with no diagnostic on any channel and no
  runtime net (measured: `1.5`, `Infinity`, `NaN`), and the type-layer certifies
  the claim as a *proof* rather than deferring; D2 because the spec sentence is
  written and unambiguous, the change is one arm of one `switch` in one file
  plus a witness, no registry row is added or edited, and the corpus blast
  radius is measured zero — the D-cost that remains is the GOV-15 addition
  discharge and deciding whether the extension-layer sibling
  `collectProvableArgTypes` moves in the same commit.
- **Kind:** defect — implementation, against a written sentence.
  `docs/spec_topics/expressions.md:232` states the rule twice in one paragraph
  ("`/` always produces `number`"; "`/` already produces `number` and is outside
  this rule") and
  `docs/spec_topics/future-considerations/model-changes-and-non-goals.md:14`
  restates it ("theta 1.0's `/` always produces `number`"). `#typeBinary`
  (`src/parser/static-type-inference.ts:298–332`) implements no per-operator
  rule at all: its arithmetic arm (`:323–331`) reduces the two operand types to
  their common type, so `integer ÷ integer` reads `integer`.
  - **The direction is a MISSED emission, not a false one.** Every diagnostic
    named below is one the checks are written to emit and do not. This is the
    opposite direction from the false-`E` family bug 0050's eight review rounds
    hunted, and it is why 0050's own discipline does not catch it: a proof
    predicate that withholds on doubt cannot withhold on a rule that is
    confidently wrong.
  - **The runtime is not a net and is not in question.** All three shipped `/`
    implementations are plain IEEE-754 division and refuse nothing —
    `src/runtime/statement-executor.ts:896`,
    `src/runtime/expression-evaluator.ts:520–523`,
    `src/extension/production-theta-producer.ts:6058`. The second carries the
    spec sentence in its own comment: "`/` always produces `number`; `n / 0` is
    `±Infinity`, `0 / 0` is `NaN`, neither panicking (expressions.md §\"Other
    arithmetic\")". The runtime implements the rule the inference pass does not.
  - **The registered row that most directly names the position is parse-only by
    its own *Trigger*.** `theta/parse/fn-arg-type-mismatch`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:116`): "Always
    parse-time: top-level `fn` declarations are hoisted and always statically
    resolvable, so no runtime AJV safety net applies." Measured (§Reproduction
    (h)), nothing downstream refuses the value either.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the filing origin and the report that made the defect
    reachable at a new sink. Its §Fix (0.77.0) *Residuals* line files this
    report by name in the 0137–0145 band ("`/`-produces-`number` unimplemented");
    the fix record (`.pi/tmp/fixes/0050-report.md` §"Residuals / notes" item 9)
    states it in full: "`#typeBinary` does not implement \"`/` always produces
    `number`\" — `3 / 2` reads `integer`, so `g(3 / 2)` against `n: integer` is
    silent where the runtime binds `1.5`. A MISSED emission, not a false one;
    closing it means changing the inference pass. Separate filing." **0050 did
    not touch the inference pass and closing this report is not a re-opening of
    it.** 0050's subject is which sink may *judge* a read; this report's subject
    is that one read is wrong. The two meet at `provableArgType`
    (`src/parser/type-layer-checks.ts:1654`), whose arithmetic `binary` arm
    (`:1739–1762`) tests the reduction's EXACTNESS against `#typeBinary`'s own
    answer — so where the inference rule contradicts the spec, the exactness
    test certifies the contradiction (§Actual behaviour). 0050's non-goals list
    is explicit that the reduction stays out.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, the owner of `+`. Its landed soundness lesson is what
    `provableArgType` re-applies in-layer, and `+` is the one arithmetic
    operator whose reduction IS its result type
    (`type-layer-checks.ts:1757–1760` states why). `+` is unaffected here and
    must stay unaffected: `expressions.md`'s `+` rule makes a both-`integer`
    pair produce `integer`, which the common-type reduction already gives.
    0072's `collectProvableArgTypes` (`src/extension/invoke-static-checks.ts:484`)
    is the one consumer of a `/` expression's type that does **not** route
    through `#typeBinary` — §Fix (c).
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **open**, the
    owner of `#commonType` (`static-type-inference.ts:341`), the function this
    arm calls. **Disjoint, and neither fix reaches the other.** 0081's subject is
    that the reduction never unions — that a set with no common upper bound falls
    back to `candidates[0]`. Here the reduction is working exactly as designed:
    both operands are `integer`, `integer` is their common type, and the answer
    is still wrong because the operator's result type is not a function of its
    operands' common type at all. Measured (§Reproduction (t)): `3 / 2` and
    `3 - 2` produce byte-identical `CompatType` values, and only one of them is
    the spec's answer. A fix here adds a per-operator rule ahead of the call; a
    fix there changes what the call returns for heterogeneous candidates. They
    compose without conflict, and 0050's discharge note already records that its
    sink withholds wherever 0081's erasure is live.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) and
    [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **open**, the two other reports against `#typeExpr` arms at HEAD. Both are
    *erasures*: an arm mints a `named` that resolves to nothing, every consumer
    that classifies it answers `"unknown"`, and the checks defer. **This report
    is the opposite failure at the same pass**: the arm answers with a
    resolvable, concrete, checkable type that is not the spec's, so no consumer
    defers and every consumer decides wrongly. Disjoint arms
    (`:245–250` and `:242–244` against `:298–332`), disjoint mechanism, and no
    shared line. 0136's `static-type-inference.ts:242–244` citation is still
    correct at this HEAD.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**. Cited for one
    interaction only: a `/` result read back out of a plain `for` loop variable
    is silent for 0126's reason as well, so a fix here does not make that row
    fire. No coordination is owed; the positions do not overlap.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The defect site** — `src/parser/static-type-inference.ts:323–331`, the
    tail of `#typeBinary` (declared `:298`):

    ```ts
        // Arithmetic narrows the operands to their common type through the `⊑`
        // engine (e.g. `integer + number` narrows to `number`).
        return this.#commonType(
          [
            this.#typeExpr(left, env, bindings),
            this.#typeExpr(right, env, bindings),
          ],
          env,
        );
    ```

    `op` is a parameter of the function (`:299`) and is read twice above — for
    the synthetic-`null`-left unary shapes (`:311–318`) and for the
    result-fixed boolean set (`:319–322`). It is not read again. Every operator
    that reaches this line — `+`, `-`, `*`, `/`, `%` — gets one rule.
  - **What the spec assigns each of those five.**
    `docs/spec_topics/expressions.md:232` gives `-` and `*` the operand-common
    rule this line implements, gives `%` that rule for a non-zero divisor, and
    takes `/` out of it. Measured (§Reproduction (t)), the four operators that
    reach this line with two `integer` literals produce the identical
    `CompatType`; for `/` that is a defect and for `-` and `*` it is correct.
  - **`#commonType`** — `static-type-inference.ts:341`. For two identical
    candidates it returns the FIRST one verbatim, so the static type of `3 / 2`
    is the static type of the literal `3`: `{ kind: "literal", typesAs: "integer" }`
    (§Reproduction (t)).
  - **The dispatch** — `static-type-inference.ts:224–225`, `#typeExpr`'s
    `case "binary"`. `:182–188` is the public `typeOf(node, env, bindings)`
    seam; `src/parser/type-layer-checks.ts:925–926` delegates the checker-side
    `typeOf` to it. `rg -c 'typeOf\(' src/` returns 39 line-hits, of which 37 are
    in the parser layer behind that one seam and two are the extension-layer
    sibling below.
  - **The module header states the fallback posture this defect is not.**
    `static-type-inference.ts:18–24`: "Composite nodes (binary / ternary /
    `match` / array) narrow to a common type through the injected `V2b` `⊑`
    engine". The narrowing is what the header describes and what ships; the
    per-operator override the spec requires for `/` is absent from both.
  - **The sinks that read the wrong answer**, each measured in §Reproduction with
    a control that fires on the same body:
    - `checkLetRhsCompat` (`src/parser/type-compat.ts:403`) and its
      `integer-narrowing` arm (`:417–425`), called from `walkStmt`'s `let` arm
      (`type-layer-checks.ts:970`) on the type read at `:947`.
    - `checkFnArgCompat` (`type-compat.ts:452`), called from `checkFnCallArgs`
      (`type-layer-checks.ts:1575`, the emission site bug 0050 wired) at `:1616`,
      on the argument type taken at `:1608`. Its comment (`:467–468`) records
      that a `number ⊑ integer` narrowing "is equally a mismatch here; TYPE-9
      routes both through fn-arg-type-mismatch", which is why control a3
      reports `fn-arg-type-mismatch` and not `integer-narrowing`.
    - `checkObjectFieldCompat` (`type-compat.ts:500`), called at
      `type-layer-checks.ts:1548`.
    - The array-element sink (`type-compat.ts:577`), reached from
      `type-layer-checks.ts:1431`.
    - The `par for … max` integer sink — `type-layer-checks.ts:2023–2040`,
      whose own comment says "The `max` operand is an integer sink: a
      fractional / `number` operand narrows to the existing
      `theta/parse/integer-narrowing` diagnostic."
    - The index-element narrowing (`static-type-inference.ts:245–250`, bug
      0125's fix), through which a `/` result stored in an array literal reaches
      a typed `let`.
  - **The proof discipline that certifies the wrong answer** —
    `provableArgType`, `src/parser/type-layer-checks.ts:1654`, and its
    arithmetic `binary` arm at `:1739–1762`. `:1741` reads the pass's reduction;
    `:1742` requires `isProvenReduction` (`:1886`) — every operand itself proven
    and `⊑` the reduction; `:1761` admits the reduction when
    `classifyOperand(reduced, this.env) === "numeric"`
    (`classifyOperand` is `:123–152`). For `3 / 2` all three tests pass: both
    operands are literals whose "read IS its value's type" (`:1659–1664`), each
    is `⊑` `integer`, and `integer` is numeric. The predicate answers
    `integer` — a proof, not a deferral. The arm's own comment (`:1745–1755`)
    already names `/` among the operators for which "the result type is fixed by
    the operator" and cites the same spec paragraph; it uses that fact only to
    *withhold* on a non-numeric reduction, never to *supply* the fixed type.
  - **The one consumer outside the seam** —
    `collectProvableArgTypes`, `src/extension/invoke-static-checks.ts:484`, the
    `.theta`-callable / tool-argument sink bug 0072 shipped. Its arithmetic arm
    (`:530–537`) does not call `pass.typeOf` on the binary node at all: it
    returns the UNION of the operand type sets, so `3 / 2` yields `{integer}`
    there for a reason unrelated to `#typeBinary`. Its comment at `:532–536`
    states the bound: over-approximating is safe because `kindsDisjoint`
    (`src/runtime/tool-call.ts:385`) reconciles `integer` and `number`, "so a
    division's non-integral result cannot turn a withheld verdict into a fired
    one". That reconciliation is what keeps this sink from misfiring today, and
    it is why a fix at `#typeBinary` alone leaves the sink's answer unchanged.
  - **The runtime, in all three implementations** —
    `src/runtime/statement-executor.ts:882` (`applyBinaryScalar`), `:896` (the
    `/` case, `(left as number) / (right as number)`);
    `src/runtime/expression-evaluator.ts:520–523`, whose comment quotes the spec
    sentence; `src/extension/production-theta-producer.ts:6058`. None validates
    the quotient against any annotation, and no AJV path stands between a `/`
    result and an `integer`-annotated binding, parameter or field (measured,
    §Reproduction (h)).
  - **The registration consequence.**
    `src/extension/production-composition.ts:2045` (`hasLoadParseError`) drops a
    theta carrying an `error`-severity `theta/load/*` or `theta/parse/*`. The
    four codes that do not fire are all `E`
    (`code-registry-parse.md:24` `integer-narrowing`, `:40`
    `array-element-type-mismatch`, `:46` `object-field-type-mismatch`, `:116`
    `fn-arg-type-mismatch`), so the affected theta **registers and runs**. This
    is the material difference from bugs 0135 and 0136, whose measured rows all
    carry an `E` from another source.
  - **Spec.** `docs/spec_topics/expressions.md:230` — the *Other arithmetic*
    heading; `:232` — the paragraph carrying both statements of the rule.
    `docs/spec_topics/future-considerations/model-changes-and-non-goals.md:14` —
    the restatement. `docs/spec_topics/type-system.md:27` — the closed list of
    positions the `⊑` relation governs, which names five of the sinks measured
    here ("the RHS of a typed `let`, a function-argument slot, … the common type
    of `match` arms or ternary branches, an `array<T>` element against its sink,
    … a schema-constructor field value against its declared field type"); `:36`
    — TYPE-2, the one-way `integer ⊑ number` widening the arm's own comment
    cites; `:48` — *Unresolvable operands*, the deferral rule, which does **not**
    apply here because both operands are literals; `:50` — TYPE-9, which routes
    the typed-`let` and `fn`-argument failures.
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2; `:74` —
    DIAG-4. `docs/spec_topics/governance/source-language-stability.md:5` —
    GOV-15; `:9` — the loads-cleanly predicate; `:25` — the diagnostic-registry
    carve-out and its addition arm.
  - **No user-facing mirror states the rule.** `docs/reference/grammar.md:129`
    gives the *literal*-level rule ("A literal with no fractional/exponent part
    is `integer`; otherwise `number`. `integer` widens to `number`; the reverse
    is `theta/parse/integer-narrowing`") and states no operator result type;
    `docs/reference/type-system.md` states none either. A fix therefore edits no
    `docs/reference/` page.
  - **Test coverage of this defect: none, and no committed test drives `/` at
    all.** A scan of every `tests/*.test.ts` for a `/` binary operator in a theta
    source returns zero hits (`src/` carries no `*.test.ts`). No test in the tree
    asserts the static type of any division. The nearest coverage,
    `tests/fn-arg-type-mismatch-wired.test.ts` (bug 0050's 84-cell witness),
    exercises the sink this defect passes through and contains no `/` cell.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Parse and raw-type rows through the production
  `parseThetaDocument`, frontmatter `---\nmode: prompt\n---`, with a trailing
  expression supplying the theta's final value; raw-type rows additionally
  construct `StaticTypeInferencePass` over the shipped `checkCompatible` and
  read `typeOf` on the body tail. Runtime rows through `parseThetaDocument` →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`, the
  harness shape `tests/non-object-receiver-gate.test.ts:221–292` establishes.
  Corpus row: `parseThetaDocument` over all 34 tracked `.theta` / `.thetalib`
  files with an AST walk for `{ kind: "binary", op: "/" }`. Two scratch vitest
  files, run on the outputs quoted below, then deleted. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

`docs/spec_topics/expressions.md:232` fixes the result type of `/` without
qualification: "`/` always produces `number` (no integer-division operator in
theta 1.0)". The same paragraph gives `-`, `*` and `%` the operand-common
`integer ⊑ number` widening and closes by naming `/` as outside the rule it
states for the other three.

`#typeBinary` (`src/parser/static-type-inference.ts:298–332`) implements the
widening and not the exception. After two operator tests — the synthetic-`null`
unary shapes (`:311–318`) and the boolean-result set (`:319–322`) — every
remaining operator falls to one line (`:323–331`) that reduces the two operand
types to their common type. `op` is never read again. Measured: `3 / 2`,
`3 - 2`, `3 * 2` and `3 % 2` all read `{ kind: "literal", typesAs: "integer" }`.
The static type of `3 / 2` is the static type of the literal `3`.

The answer is not an inert fallback. It is `integer` — concrete, resolvable,
and `⊑ integer` — so no consumer defers and every consumer decides on it.
Measured against a `1.5`-literal control on the same body, **five sinks stop
firing**: the typed `let` (`integer-narrowing`), the `fn` argument slot
(`fn-arg-type-mismatch`), the schema-constructor field (`integer-narrowing`),
the `array<integer>` element (`integer-narrowing` +
`array-element-type-mismatch`) and the `par for … max` operand
(`integer-narrowing`). All are `E`, so `hasLoadParseError` has nothing to act
on and the theta registers.

**The runtime is not a net.** All three shipped `/` implementations are plain
IEEE-754 division; one of them
(`src/runtime/expression-evaluator.ts:520–523`) carries the spec sentence in its
comment. `fn-arg-type-mismatch`'s registered *Trigger*
(`code-registry-parse.md:116`) says so outright: "Always parse-time … so no
runtime AJV safety net applies." Measured: `fn g(n: integer): number { n }` +
`g(3 / 2)` binds `1.5` to `n` and returns it; `let n: integer = 3 / 2` holds
`1.5`; `S { n: 3 / 2 }` on `schema S { n: integer }` stores `1.5`;
`let n: integer = 1 / 0` holds `Infinity` and `0 / 0` holds `NaN`. Every one
parses with zero diagnostics.

**The proof discipline bug 0050 shipped certifies the wrong type.**
`provableArgType` (`type-layer-checks.ts:1654`) exists to withhold
`checkFnCallArgs`'s judgement wherever the pass's read is not a proof of the
runtime value's type. Its arithmetic `binary` arm applies three tests
(`:1739–1762`): the reduction is read from the pass, `isProvenReduction`
requires every operand proven and `⊑` that reduction, and `classifyOperand`
requires the reduction numeric. `3 / 2` passes all three — two proven `integer`
literals, each `⊑ integer`, and `integer` is numeric — so the predicate returns
`integer` as a **proof**. The discipline tests whether the claimed type is
exact *under the inference rules*; the inference rule is the thing that
contradicts the spec, so exactness certifies the contradiction. The arm's own
comment (`:1745–1755`) already names `/` among the operators whose "result type
is fixed by the operator" and cites `expressions.md` §"Other arithmetic" — it
uses that fact to withhold on a non-numeric reduction and never to supply the
fixed type.

The defect is bounded to `integer ÷ integer`. A `number` operand widens through
the same reduction and every measured control fires: `g(3.0 / 2)` draws
`fn-arg-type-mismatch`, `let n: integer = 3.0 / 2` draws `integer-narrowing`.

## Reproduction

Offline, at `3efdb4ac`. Parse rows: the production `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---`, trailing expression as the final value.
`codes` / `msgs` are the whole aggregated `diagnostics` lists, unfiltered.
Runtime rows: the production executor harness named in §Observed at.

### (t) The raw inference read

`StaticTypeInferencePass.typeOf` on the body tail, over an empty `TypeEnv`.
`vs-integer` is `checkCompatible(t, { kind: "prim", name: "integer" }, env)`.

```
@@ t1  3 / 2    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t2  3 - 2    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t3  3 % 2    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t4  3 * 2    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t5  3.0 / 2  raw={"kind":"literal","typesAs":"number"}   display=number   vs-integer=integer-narrowing
@@ t6  1 / 0    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t7  1 / 3    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t8  4 / 2    raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
```

t1 against t2/t3/t4: four operators, one answer. `expressions.md:232` assigns
t2 and t4 that answer and assigns t1 `number`. t5 is the widening working — a
`number` operand makes the reduction `number`, which is also the spec's answer
for `/`, reached for the wrong reason. t6 is `Infinity` typed `integer`; t7 is
the non-terminating quotient; t8 is the exactly-divisible case, which the spec
types `number` too — the rule is on the operator, not on the values.

### (a) The `fn`-argument sink

```
@@ a1  fn g(n: integer): number { 1 } / let r = g(3 / 2) / r
   codes :: []
@@ a2  [control] let r = g("a")
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got string"]
@@ a3  [control] let r = g(1.5)
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ a4  fn g(n: number): number { 1 } / let r = g(3 / 2)          [spec-correct param]
   codes :: []
@@ a5  let r = g(4 / 2)                                          [exactly divisible]
   codes :: []
@@ a6  let q = 3 / 2 / let r = g(q)                              [via unannotated let]
   codes :: []
@@ a7  let q: integer = 3 / 2 / let r = g(q)                     [via annotated let]
   codes :: []
@@ a8  let r = g(3.0 / 2)                                        [control: number operand]
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ a9  let r = g(1 / (3 / 2))
   codes :: []
@@ a10 let r = g(3 - 2)                                          [control: spec says integer]
   codes :: []
@@ a11 let r = g(3 % 2)                                          [control: spec says integer]
   codes :: []
@@ a12 let r = g(3 * 2)                                          [control: spec says integer]
   codes :: []
@@ a13 let r = g(1 / 0)
   codes :: []
```

a2 and a3 establish the check is live and reaches this argument position;
a3 is the exact diagnostic a1 is owed. a8 bounds the defect to
`integer ÷ integer`. a10–a12 are the three operators whose silence is correct.
a7 shows the annotation does not repair the read — the recorded binding type is
the author's `integer` claim, which the annotation makes true by fiat while the
runtime value is `1.5`.

### (b) The typed-`let` sink

```
@@ b1  let n: integer = 3 / 2 / n
   codes :: []
@@ b2  [control] let n: integer = 1.5 / n
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b3  let n: number = 3 / 2 / n                                 [spec-correct annotation]
   codes :: []
@@ b4  [control] let n: integer = 3 - 2 / n                      [spec says integer]
   codes :: []
@@ b5  [control] let n: integer = 3.0 / 2 / n
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b6  [control] let n: integer = 3.0 - 2 / n
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b7  let n: integer = 1 / 0 / n
   codes :: []
```

**b1 is the answer to the wired let-rhs sibling's disposition: nothing is
emitted.** `checkLetRhsCompat` is reached (b2, b5 and b6 fire from the same
call site on the same shape) and answers `compatible`, because
`checkCompatible({literal integer}, {prim integer})` holds. b7 puts `Infinity`
into an `integer` binding with no diagnostic.

### (c) The other sinks that read `/`'s type

```
@@ c1  schema S { n: integer } / let s = S { n: 3 / 2 } / s
   codes :: []
@@ c2  [control] let s = S { n: 1.5 }
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ c3  let xs: array<integer> = [3 / 2] / xs
   codes :: []
@@ c4  [control] let xs: array<integer> = [1.5] / xs
   codes :: ["theta/parse/integer-narrowing","theta/parse/array-element-type-mismatch"]
   msgs  :: ["cannot narrow number to integer",
             "array element type mismatch at index 0: expected integer, got number"]
@@ c5  let xs = [3 / 2] / let m: integer = xs[0] / m
   codes :: []
@@ c6  [control] let xs = [1.5] / let m: integer = xs[0] / m
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ c7  fn g(n: integer): number { 1 } / let r = g(true ? 3 / 2 : 1) / r
   codes :: []
@@ c8  [control] let r = g(true ? 1.5 : 1)
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ c9  fn g(n: integer): number { 1 } / let r = g(match 1 { 1 => 3 / 2, _ => 1 }) / r
   codes :: []
@@ c10 [control] let r = g(match 1 { 1 => 1.5, _ => 1 })
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ c11 fn g(n: integer): number { 1 } / let r = g(-(3 / 2)) / r
   codes :: []
@@ c12 [control] let r = g(-1.5)
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ c13 let xs = [1, 2] / par for x in xs max 3 / 2 { x }
   codes :: []
@@ c14 [control] par for x in xs max 1.5 { x }
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ c15 let xs = [3 / 2, 1] / let ys: array<integer> = xs / ys
   codes :: []
@@ c16 [control] let xs = [1.5, 1] / let ys: array<integer> = xs / ys
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
```

Every pair separates by one token. c5/c6 show the wrong type surviving bug
0125's index-element narrowing; c7–c12 show it surviving the ternary, `match`
and unary-negation reductions unchanged; c13 is a registered integer sink whose
own comment names the diagnostic it does not draw.

One neighbouring position is silent in **both** directions and is therefore not
attributable here:

```
@@ c17 fn g(): integer { 3 / 2 } / let r = g() / r
   codes :: []
@@ c18 [control] fn g(): integer { 1.5 } / let r = g() / r
   codes :: []
```

The `fn`-return annotation is checked at no parse seam for any initialiser
form, so c17 measures that gap and not this one — §Non-goals.

### (g) The committed corpus at HEAD

All 34 tracked `.theta` and `.thetalib` files, each through the real
`parseThetaDocument`, AST-walked for `{ kind: "binary", op: "/" }`:

```
@@ CORPUS TOTAL FILES :: 34 :: files with a '/' binary operator :: 0
```

**Measured GOV-15 blast radius against the committed corpus: zero.** No shipped
example, fixture or `.thetalib` divides. This bounds the corpus half of the
sweep; it does not discharge GOV-15, because every §Reproduction row above loads
cleanly today and would refuse after a fix (§Fix (d)).

### (h) The runtime the registering theta reaches

Same harness, executed. `parse` is the pass's code list; `run` is
`executeBody`'s outcome and final value.

```
@@ h1  fn g(n: integer): number { n } / let r = g(3 / 2) / r
   parse :: []      run :: outcome=success value=1.5      isInt=false
@@ h2  let n: integer = 3 / 2 / n
   parse :: []      run :: outcome=success value=1.5      isInt=false
@@ h3  [control] fn g(n: integer): number { n } / let r = g(4 / 2) / r
   parse :: []      run :: outcome=success value=2        isInt=true
@@ h4  schema S { n: integer } / let s = S { n: 3 / 2 } / s.n
   parse :: []      run :: outcome=success value=1.5      isInt=false
@@ h5  fn g(): integer { 3 / 2 } / let r = g() / r
   parse :: []      run :: outcome=success value=1.5      isInt=false
@@ h6  let n: integer = 1 / 0 / n
   parse :: []      run :: outcome=success value=Infinity isInt=false
@@ h7  let n: integer = 0 / 0 / n
   parse :: []      run :: outcome=success value=NaN      isInt=false
@@ h8  [control] let n: number = 3 / 2 / n
   parse :: []      run :: outcome=success value=1.5      isInt=false
```

h1 is the row bug 0050's fix record predicted: the argument binds to an
`integer`-annotated parameter and the parameter holds `1.5`. h3 shows the
runtime is not rounding — the divergence is per-value, so the same source is
correct for some inputs and corrupt for others. h6 and h7 are the two IEEE-754
non-finite results `expressions.md:232` names, both landing in an `integer`
binding. h8 is the spec-correct annotation, which produces the identical value —
the runtime never differed.

## Expected behaviour

**The sentence is written and unqualified.** `docs/spec_topics/expressions.md:232`:

> `-`, `*`, `/`, `%` accept only numeric operands. Binary `-` and `*` produce
> `integer` when both operands are `integer` and widen to `number` when either
> operand is `number` … `/` always produces `number` (no integer-division
> operator in theta 1.0; see [Future Considerations](./future-considerations.md)).

The same paragraph closes by naming `/` as outside the widening rule it states
for the others: "`/` already produces `number` and is outside this rule."
`docs/spec_topics/future-considerations/model-changes-and-non-goals.md:14`
restates it as the reason there is no truncating-division operator: "theta 1.0's
`/` always produces `number`; there is no dedicated truncating-division
operator." The rule is on the operator. It does not consult the operands, and it
has no exception for an exactly-divisible pair (t8, h3).

`typeOf(3 / 2)` is therefore `number`, and each measured row is owed the
diagnostic its control draws:

| row | owed | registered at |
|---|---|---|
| a1 | `theta/parse/fn-arg-type-mismatch`: `… expected integer, got number` | `code-registry-parse.md:116` |
| b1, b7 | `theta/parse/integer-narrowing`: `cannot narrow number to integer` | `:24` |
| c1 | `theta/parse/integer-narrowing` | `:46` routes it (`checkObjectFieldCompat`) |
| c3 | `theta/parse/integer-narrowing` + `theta/parse/array-element-type-mismatch` | `:24`, `:40` |
| c13 | `theta/parse/integer-narrowing` | `:24` |

Every code is already registered, already emitted from the same call site on the
`1.5`-literal control, and already carries the exact *Message* the fix produces.
**No registry row is added, removed, or edited, and no *Trigger* changes.** Each
row's *Trigger* is written over the static type — `integer-narrowing` is
"`number` value used where `integer` is expected" (`:24`), `fn-arg-type-mismatch`
is "an argument whose static type is not compatible with the matched parameter's
declared type" (`:116`) — so the inputs are inside the triggers as written and
the implementation is what does not meet them. This is DIAG-2-untouched, the
posture bug 0050's fix took ("the wiring lands at the Trigger's full letter, so
DIAG-2 is not engaged").

**The deferral rule does not license the silence.** `type-system.md:48` skips a
check "when either side of a compatibility check is past the parser's static
view", naming two examples that share one property: the information is absent at
parse time. Here both operands are numeric literals in the source text, the
operator is a token, and the result type is a constant function of the operator
alone. Nothing is past the parser's view. The pass answers confidently and
answers wrong — which is why no consumer takes the `"unknown"` branch and why
`provableArgType` calls it a proof.

**The runtime already implements the rule.**
`src/runtime/expression-evaluator.ts:520–523` divides and comments "`/` always
produces `number`; `n / 0` is `±Infinity`, `0 / 0` is `NaN`, neither panicking
(expressions.md §\"Other arithmetic\")". The two phases disagree about the same
sentence, and the phase that is wrong is the one that decides whether the theta
loads.

## Actual behaviour / root cause

**One line, four operators, one rule.** `#typeBinary`
(`static-type-inference.ts:298–332`) tests `op` twice and then stops:

```ts
    if (left.kind === "null") {
      if (op === "!") { return { kind: "prim", name: "boolean" }; }
      if (op === "-") { return this.#typeExpr(right, env, bindings); }
    }
    // Comparison and logical operators statically produce a boolean.
    if (BOOLEAN_BINARY_OPS.has(op)) {
      return { kind: "prim", name: "boolean" };
    }
    // Arithmetic narrows the operands to their common type through the `⊑`
    // engine (e.g. `integer + number` narrows to `number`).
    return this.#commonType([...], env);
```

`BOOLEAN_BINARY_OPS` (`:363`) is the eight comparison and logical operators.
Everything else — `+`, `-`, `*`, `/`, `%` — reaches `#commonType`. The comment
describes the TYPE-2 widening accurately and completely; the widening is the
correct rule for three of those five and the wrong rule for `/`. There is no
place in the function where a per-operator result type could have been dropped:
the shape is a single fallthrough, so the absence is structural rather than a
missing case in an enumeration.

**`#commonType` returns an operand's own type object.** For `[litInt, litInt]`
its `find` (`:341`) succeeds on the first candidate, so `3 / 2` carries the type
of the literal `3` — `{ kind: "literal", typesAs: "integer" }` (t1). The
`literal` kind is not weaker than `prim` for any consumer measured here:
`checkCompatible` decides it through the same primitive relation
(`decidePrimitive`, `type-compat.ts:300–312`) and `classifyOperand`
(`type-layer-checks.ts:123–152`) classifies `literal` and `prim` identically as
`"numeric"`. The claim is fully load-bearing.

**Nothing downstream can recover.** `type-system.md:48`'s deferral is keyed on a
type the `TypeEnv` cannot resolve; `integer` resolves. So:

- `checkLetRhsCompat` (`type-compat.ts:403`) takes neither its
  `"compatible" | "unknown"` early return for the wrong reason nor its
  `integer-narrowing` arm (`:417–425`) — `checkCompatible(integer, integer)` is
  `compatible` and the function returns `[]` on the correct branch for an
  incorrect input (b1).
- `checkFnArgCompat` (`type-compat.ts:452`) likewise returns `[]` at `:464`.
- `checkObjectFieldCompat` (`:500`), the array-element sink (`:577`) and the
  `par for … max` gate (`type-layer-checks.ts:2023–2040`) each take the same
  branch.

Every one of those functions is correct given its input. The single wrong value
is the input.

**The proof discipline agrees with the wrong rule by construction.**
`provableArgType`'s arithmetic `binary` arm (`type-layer-checks.ts:1739–1762`):

```ts
        const reduced = this.typeOf(expr, bindings);
        if (!this.isProvenReduction([expr.left, expr.right], reduced, bindings)) {
          return undefined;
        }
        …
        return expr.op === "+" || classifyOperand(reduced, this.env) === "numeric"
          ? reduced
          : undefined;
```

`isProvenReduction` (`:1886`) asks whether each operand is itself proven and
`checkCompatible(armType, reduced, env) === "compatible"`. For `3 / 2` the
operands are literals, whose arm states "A literal's read IS its value's type"
(`:1659–1664`), and each is `⊑ integer`. `classifyOperand(integer)` is
`"numeric"`. All three tests pass and the predicate answers `integer`.

**The discipline is testing the wrong proposition, and its own comment says
so.** The predicate's contract (`:1629–1653`) is that `typeOf` is "a PROOF of
`expr`'s runtime value type", and the mechanism it guards against is
`#commonType`'s two lossy reductions — unknown-blessing and the
`?? candidates[0]` fallback. Both are reductions from a candidate SET, so the
test is an *exactness* test over that set: does the reduced answer describe every
arm. It cannot detect a rule that is uniformly wrong on a set of one distinct
type. The arm's comment at `:1745–1755` states the missing half:

> `isProvenReduction` tests the reduction's EXACTNESS, not the operator's
> ADMISSIBILITY, so a same-typed pair of proven non-numeric operands passes it —
> and for `-`, `*`, `/`, `%` the result type is fixed by the operator:
> expressions.md §"Other arithmetic" gives those four `integer` or `number` for
> every input (NaN included, which is a `number`) …

The paragraph names `/` and cites the paragraph that takes `/` out of the
widening. It uses that fact in one direction only — to WITHHOLD when the
reduction is non-numeric (`"a" / "b"` reduces to `string`, so the arm returns
`undefined`) — and never to SUPPLY the fixed type when the reduction is numeric
and wrong. That asymmetry is exactly the missed-emission direction: bug 0050's
eight review rounds were all false-`E` findings, and a predicate tuned to
suppress false emissions has no arm that produces one.

**The extension-layer sibling reaches the same answer by a different route.**
`collectProvableArgTypes` (`invoke-static-checks.ts:484`) does not call
`typeOf` on the binary node: its arithmetic arm (`:530–537`) unions the operand
sets, so `3 / 2` yields `{integer}` there whatever `#typeBinary` returns. Its
comment (`:532–536`) records the bound that keeps it from misfiring:
`kindsDisjoint` (`tool-call.ts:385`) reconciles `integer` with `number`, "so a
division's non-integral result cannot turn a withheld verdict into a fired one".
The sink is safe in the false-`E` direction and, like the parser layer, blind in
the missed-emission direction.

**The runtime is uniform and correct.** Three implementations
(`statement-executor.ts:896`, `expression-evaluator.ts:520–523`,
`production-theta-producer.ts:6058`), all plain IEEE-754 division, none
validating against an annotation. The value that arrives at an
`integer`-annotated position is whatever JS produced (h1–h7).

## Why it matters

- **A `number` reaches an `integer`-annotated position with no diagnostic on any
  channel.** Four positions measured: a `fn` parameter (h1), a `let` binding
  (h2), a schema-constructor field (h4), and an `array<integer>` element (c3).
  The annotation is the author's declared constraint and it is not enforced in
  either phase.
- **The theta registers and runs.** All four missed codes are `E`, so
  `hasLoadParseError` (`production-composition.ts:2045`) has nothing to act on.
  Bugs 0135 and 0136 both bound their exposure by observing that every affected
  input already carries an `E` from another source; this one has no such bound.
- **`Infinity` and `NaN` land in `integer` bindings.** `let n: integer = 1 / 0`
  is `Infinity` and `0 / 0` is `NaN` (h6, h7), both silent. `expressions.md:232`
  names both as `/`'s specified non-finite results and the reason they are
  `number`.
- **The divergence is per-value, so it is not reproducible from the source
  alone.** `g(4 / 2)` binds `2` and `g(3 / 2)` binds `1.5` (h3 against h1) from
  the same static type at the same call site. A theta correct on its test inputs
  corrupts on others.
- **The type-layer reports a proof, not a deferral.** `provableArgType` exists
  to withhold where the read is not trustworthy. Here it certifies. A reviewer
  reading the predicate's contract has no signal that the certified type is
  wrong, and the one comment that names `/`'s fixed result type sits three lines
  from the return that ignores it.
- **The two phases disagree about one sentence.** The runtime comments the rule
  and implements it; the inference pass does neither. A reader of either half
  alone concludes the rule is implemented.
- **Nothing in the suite scores it.** No committed test drives a `/` binary
  operator in any theta source, and no test asserts the static type of a
  division. The defect could not have been caught by regression and cannot red
  today.

## Non-goals

- **`%` by a literal zero.** `expressions.md:232` states a second widening the
  same arm misses: "because `NaN` is a `number`, an `integer % 0` result widens
  to `number`". Measured — `1 % 0` reads `{ kind: "literal", typesAs: "integer" }`,
  `let n: integer = 1 % 0` reports `[]`, and the runtime binds `NaN`. **Not
  filed at HEAD.** It is excluded here because it is a different sentence with a
  different shape: `/`'s rule is a constant function of the operator, while
  `%`'s depends on the divisor's *value* and is statically decidable only for a
  literal
  `0` (or a binding provably `0`), which makes its disposition an adjudication
  this report does not carry. A fix must state whether it moves.
- **`fn`-return-annotation checking.** `fn g(): integer { 3 / 2 }` is silent
  (c17), but so is `fn g(): integer { 1.5 }` (c18): no parse seam checks a
  `fn` body's tail against its return annotation for any initialiser form. That
  gap is measured here and not claimed here. A fix to this report leaves c17
  silent.
- **The common-type reduction itself.** `#commonType`'s unknown-blessing and
  `?? candidates[0]` fallback belong to bug
  [0081](./0081-array-ternary-common-type-never-unions.md). This report adds a
  rule *ahead of* the call and changes nothing inside it.
- **`+`.** Bug [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) owns
  the `+` operand rules, and `+`'s result type is its operands' common type by
  `expressions.md`'s own `+` rule — the one arithmetic operator for which this
  line is right by construction (`type-layer-checks.ts:1757–1760` records why).
  A fix must not touch it.
- **The `literal` versus `prim` distinction in `CompatType`.** `3 / 2` carries a
  `literal` type because `#commonType` returns an operand's own object. Every
  consumer measured here treats `literal` and `prim` identically, so the
  distinction is not a defect and is not addressed.
- **The runtime.** All three `/` implementations match the spec. No runtime
  change is in scope, and adding a runtime narrowing check at an annotated
  position is a different report (a spec silence: no sentence puts a runtime net
  at any of these four positions, and `code-registry-parse.md:116` states its
  absence for one of them as intended).

## Fix

**Settled by the spec sentence.** `#typeBinary` gains a per-operator arm for `/`
ahead of the common-type reduction, returning `{ kind: "prim", name: "number" }`
unconditionally:

```ts
    // expressions.md §"Other arithmetic": `/` always produces `number`,
    // whatever the operands — there is no integer-division operator in
    // theta 1.0, and an exactly-divisible pair is not an exception.
    if (op === "/") {
      return { kind: "prim", name: "number" };
    }
    // Arithmetic narrows the operands to their common type through the `⊑`
    // engine (e.g. `integer + number` narrows to `number`).
    return this.#commonType([...], env);
```

The arm sits after the `BOOLEAN_BINARY_OPS` gate (`:319–322`) — `/` is not in
that set — and before `#commonType` (`:325`). The synthetic-`null`-left unary
block above it (`:311–318`) is unreachable for `/`, which has no unary form.
`{ kind: "prim", name: "number" }` renders as `number` through `displayType`,
which is the token controls a3, a8, b2, b5 and c4 already produce, so every
owed *Message* is byte-identical to a string the tree emits today.

**(a) What the one arm closes, and what it does not.** Every sink in
§Reproduction (a), (b) and (c) reads through the single `typeOf` seam
(`static-type-inference.ts:182–188` → `type-layer-checks.ts:925–926`), so one
arm supplies all of them. Verify each row flips, rather than assuming it:

- a1 → `fn-arg-type-mismatch`. `provableArgType` still returns a proof, by a
  different route: `reduced` becomes `prim number`, `isProvenReduction` holds
  (each `literal integer` is `⊑ prim number`), and `classifyOperand(number)` is
  `"numeric"`, so `:1761` admits it and `checkFnArgCompat` reports
  `expected integer, got number`.
- b1, b7 → `integer-narrowing` through `checkLetRhsCompat`'s `:417` arm.
- c1 → `integer-narrowing` through `checkObjectFieldCompat`.
- c3 → `integer-narrowing` + `array-element-type-mismatch`.
- c5, c7, c9, c11, c13, c15 → the reduction now carries `number` through the
  index-element, ternary, `match`, negation, `max` and array-common-type paths;
  each is measured separately because each has its own narrowing step.
- a4, a5 (as `number`), b3, h8 stay clean; a10–a12 and b4 stay clean, and their
  staying clean is the proof the arm did not widen `-`, `*` or `%`.

**(b) The rows that must NOT move.** Each has a witness above:

- **`"a" / "b"` stays withheld.** Today `provableArgType` withholds at `:1761`
  because the reduction is `string`; after the fix it withholds one line
  earlier, at `isProvenReduction` (`literal string` is not `⊑ prim number`).
  The observable is unchanged — measured today, both `g("a" / "b")` and the
  `g("a" - "b")` control report `[]` — but the *guard* that withholds changes,
  which a witness must pin so a later edit to either guard cannot silently drop
  the row.
- **`-`, `*`, `%` keep the widening.** a10, a11, a12, b4, t2, t3, t4 are the
  pins. A route that moves the rule into a per-operator table must reproduce the
  widening for those three exactly.
- **`+` is untouched** (bug 0072, §Non-goals).
- **`type-system.md:48`'s deferral survives.** No row here involves an
  unresolvable operand, and the arm adds no `TypeEnv` read, so the deferral
  posture is structurally unreachable from this change.

**(c) Whether `collectProvableArgTypes` moves in the same commit.** The
extension-layer sink (`invoke-static-checks.ts:484`) computes a `/`
expression's type set by unioning the operand sets (`:530–537`), not by calling
`pass.typeOf` on the binary node, so the one arm does not reach it: it continues
to answer `{integer}` for `3 / 2`. Today that is safe in the direction that
matters — its comment (`:532–536`) records that `kindsDisjoint`
(`tool-call.ts:385`) reconciles `integer` with `number`, so the over-approximation
cannot turn a withheld verdict into a fired one — and it stays safe after the
fix. Two dispositions, and the fix states which it takes: mirror the operator
rule there (returning `[pass.typeOf(expr, env)]` for `/`, the shape the arm
already uses for the result-fixed boolean operators at `:528`), which narrows the
set and makes disjointness provable for a division against a `string`-only
schema field; or leave it, and record in the comment that the two layers now
disagree about `/`'s type and why that is safe. The function's own header states
the invariant at stake — it "mirrors `#typeExpr` / `#typeBinary` shape for shape,
so a collected member can never render differently from the type the pass itself
assigns" (`:474–478`) — which argues for mirroring.

**(d) GOV-15.** The change makes currently-clean programs refuse, so it is an
ADDITION under the diagnostic-registry carve-out
(`source-language-stability.md:25`): "a code **addition** (DIAG-2) is in-scope
for inputs that did not previously emit the added code". Discharge as bugs 0031,
0084, 0102 and 0050 did — by measurement, not prediction:

- Re-run the committed-corpus sweep. Measured at HEAD: 34 tracked
  `.theta` / `.thetalib` files, **zero** containing a `/` binary operator
  (§Reproduction (g)). Re-measure rather than cite; and note bug
  [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — the
  committed-fixture parse gate filters `.theta` only, so the sweep is a scratch
  probe over `git ls-files -- '*.theta' '*.thetalib'`, the method 0079 / 0095 /
  0125 / 0050 used.
- No registry row is added, removed or edited, and no *Trigger* changes: every
  owed code is registered, `E`, and already emitted from the same call site on
  the `1.5` control. DIAG-2 is not engaged and DIAG-4's *Message* strings are
  unchanged. Confirm by blob hash on
  `docs/spec_topics/diagnostics/code-registry-parse.md` and both
  `docs/reference/` mirrors.
- `docs/reference/` states no operator result type
  (`grammar.md:129` is the literal-level rule only), so no user-facing page
  changes.

**(e) Coordination.** One surface: bug 0050's witness,
`tests/fn-arg-type-mismatch-wired.test.ts` (84 cells). It contains no `/` cell —
verified — so the fix does not red it; the witness is named because it owns the
`checkFnCallArgs` sink and because a `/` cell belongs beside its arithmetic
cells rather than in isolation. Bug 0081's fix and this one compose without
conflict (§Related). Bugs 0135 and 0136 touch other arms of the same file and
share no line with `#typeBinary`; whichever lands second rebases on line
positions only.

**Witness — offline, provider-free.** Every parse row settles inside one
`parseThetaDocument` call and every runtime row inside one `executeBody`, so the
harness is `tests/fn-arg-type-mismatch-wired.test.ts` extended or a new file on
its shape: registry-sourced expected messages via `registryMessage` (DIAG-4), a
loud precondition per row so an absence cell cannot pass while measuring
nothing. Required rows: all of (t), so the four-operators-one-answer measurement
is pinned and a later per-operator table cannot regress `-`, `*` or `%`; a1–a13
and b1–b7 with their controls; c1–c16 with their controls, each of which
exercises a distinct narrowing step; c17/c18 pinned as the unrelated silence
they are (§Non-goals), so a fix here is not credited with them; the corpus sweep;
and the runtime rows h1, h2, h4, h6, h7 with h3 and h8 as controls — the runtime
half must be witnessed because the parse-time refusal is the only defence and a
witness that pins only the diagnostic would not red if the refusal were later
removed. One further row is owed that no group above supplies: an assertion that
`typeOf` on a `/` node is `number` **regardless of the operands' types**, driven
from a table of operand pairs, so a fix that special-cases two `integer`
literals rather than the operator reds. No live tier applies: nothing on this
path crosses a provider, and every observable is determined inside one parse or
one offline execution.

## Provenance

- **Origin:** the bug 0050 fix (0.77.0). Its §Fix (0.77.0) *Residuals* line
  files this report in the 0137–0145 band as "`/`-produces-`number`
  unimplemented"; the fix record (`.pi/tmp/fixes/0050-report.md` §"Residuals /
  notes" item 9) states the finding, the measured vector (`g(3 / 2)` against
  `n: integer`, runtime `1.5`), the direction ("A MISSED emission, not a false
  one"), and the scope ("closing it means changing the inference pass"), which
  bug 0050 deliberately did not touch. Its review round 4 reached the adjacent
  question from the other side — nine false-`E` routes including `g("6" / "2")`
  — and closed them by withholding, which is why `provableArgType`'s arithmetic
  arm cites `expressions.md` §"Other arithmetic" and still returns the
  contradicted reduction.
- **What this report adds beyond that residual:** the raw-inference measurement
  (group (t)) showing `/`, `-`, `*` and `%` produce one identical `CompatType`;
  the four further silent sinks (typed `let`, schema-constructor field,
  `array<integer>` element, `par for … max`) with their controls; the four
  reduction paths that carry the wrong type unchanged (index element, ternary,
  `match`, negation); the runtime measurements including `Infinity` and `NaN`
  in `integer` bindings; the per-value divergence (h1 against h3); the
  precise account of why the `provableArgType` discipline certifies the claim;
  the `collectProvableArgTypes` route that does not go through `#typeBinary`
  and the `kindsDisjoint` bound on it; the corpus sweep; the `%`-by-zero
  neighbour, measured and excluded; and the `fn`-return-annotation control pair
  that separates c17 from this defect.
- **Evidence:** two scratch vitest files at `3efdb4ac`, driving the shipped
  `parseThetaDocument`, `StaticTypeInferencePass.typeOf` and the production
  `executeBody` harness; every cell of groups (t), (a), (b), (c), (g) and (h)
  measured and quoted verbatim above; written, run, deleted.
- **Spec, at `3efdb4ac`:** `docs/spec_topics/expressions.md:230` (the *Other
  arithmetic* heading), `:232` (both statements of the rule, and the `-` / `*` /
  `%` widening rules the same paragraph gives);
  `docs/spec_topics/future-considerations/model-changes-and-non-goals.md:14`;
  `docs/spec_topics/type-system.md:27` (the `⊑` check-site list), `:36`
  (TYPE-2), `:48` (*Unresolvable operands*), `:50` (TYPE-9);
  `docs/spec_topics/diagnostics/code-registry-parse.md:24`, `:40`, `:46`,
  `:116` (the four rows that do not fire);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15), `:9` (the loads-cleanly predicate), `:25` (the diagnostic-registry
  carve-out); `docs/reference/grammar.md:129` (the literal-level rule, the
  closest user-facing statement, which states no operator result type).
- **Implementation, at `3efdb4ac`:** `src/parser/static-type-inference.ts:18–24`
  (the module header's posture), `:182–188` (the `typeOf` seam), `:224–225` (the
  `binary` dispatch), `:298–332` (`#typeBinary`; `:311–318` the unary shapes,
  `:319–322` the boolean set, `:323–331` the defect), `:341` (`#commonType`),
  `:363` (`BOOLEAN_BINARY_OPS`);
  `src/parser/type-layer-checks.ts:123–152` (`classifyOperand`), `:925–926` (the
  `typeOf` delegate), `:947` / `:970` (the typed-`let` sink), `:1431` (the
  array-element sink), `:1548` (the object-field sink), `:1575` / `:1608` /
  `:1616` (`checkFnCallArgs`, bug 0050's emission site), `:1654`
  (`provableArgType`; its contract `:1629–1653`, its literal arm `:1659–1664`),
  `:1739–1762` (its arithmetic `binary` arm, with the comment naming `/` at
  `:1745–1755` and the `+` carve-out at `:1757–1760`), `:1886`
  (`isProvenReduction`),
  `:2023–2040` (the `par for … max` integer sink);
  `src/parser/type-compat.ts:300–312` (`decidePrimitive`), `:403` / `:417–425`
  (`checkLetRhsCompat`), `:452` / `:467–468` (`checkFnArgCompat`), `:500`
  (`checkObjectFieldCompat`), `:577` (the array-element emission);
  `src/extension/invoke-static-checks.ts:474–478` (the shape-for-shape
  invariant), `:484` (`collectProvableArgTypes`), `:530–537` (its arithmetic
  arm); `src/runtime/tool-call.ts:385` (`kindsDisjoint`);
  `src/runtime/statement-executor.ts:882` / `:896`,
  `src/runtime/expression-evaluator.ts:520–523`,
  `src/extension/production-theta-producer.ts:6058` (the three `/`
  implementations); `src/extension/production-composition.ts:2045`
  (`hasLoadParseError`).
- **Coverage:** none. No `tests/*.test.ts` drives a `/` binary operator in a
  theta source, and `src/` carries no `*.test.ts`. Bug 0050's witness
  `tests/fn-arg-type-mismatch-wired.test.ts` exercises the `checkFnCallArgs`
  sink this defect passes through and contains no `/` cell.

## Fix (0.80.0)

- **What shipped** — one per-operator arm, mirrored once, and two witnesses. No
  registry edit, no runtime edit, no `docs/reference/` edit:
  - `src/parser/static-type-inference.ts` (+6/−0) — `#typeBinary` gains the arm
    §Fix prescribes, byte-for-byte including its comment: after the
    `BOOLEAN_BINARY_OPS` gate (`/` is not in that set) and before the
    `#commonType` call,
    `if (op === "/") { return { kind: "prim", name: "number" }; }`. The
    synthetic-`null`-left unary block above it is unreachable for `/`, which has
    no unary form. `op` is now read three times instead of twice; the reduction
    below it is untouched, so `+`, `-`, `*` and `%` reach it exactly as before.
  - `src/extension/invoke-static-checks.ts` (+21/−7) — **§Fix (c) is settled as
    MIRROR.** `collectProvableArgTypes`'s `binary` arm gains the same rule in
    `#typeBinary`'s own dispatch order — after the synthetic-`null` unary `-`
    arm, after the `!` / `BOOLEAN_BINARY_OPS` arm, before the arithmetic
    `collectArmUnion` — returning `[pass.typeOf(expr, env)]`, the shape the
    result-fixed boolean arm one block above already uses. The arithmetic arm's
    own comment is corrected in the same hunk (comment-only, no logic change):
    it cited "a division's non-integral result" as the example of a safe
    over-approximation, which is false about code division no longer reaches; it
    now names `+` / `-` / `*` / `%` and ties the `kindsDisjoint` reconciliation
    to `%`'s `NaN` widening, the operator that still relies on it.
  - `tests/division-result-type-number.test.ts` — new, 43 cells, offline and
    provider-free, on bug 0050's witness shape. Every expected *Message* read
    through `registryMessage` (DIAG-4); a loud precondition per absence cell
    (`expectDivisions` asserts the fixture actually contains the division whose
    silence is being measured, so an absence cell cannot pass while measuring
    nothing).
  - `tests/division-result-type-number-invoke.test.ts` — new, 4 cells, the
    companion that pins the MIRROR at the invoke sink through the shipped
    composition root, using the fixture-load harness shape of
    `tests/invoke-arg-type-mismatch-wired.test.ts` (read, never modified).
  - `tests/live/live-production-acceptance.test.ts` (+173/−0) — one additive H8a
    registration-denial cell on the bug 0139 cell's shape: `b142livebroken`
    (`let n: integer = 3 / 2`) is denied registration end-to-end through the
    real production composition root while `b142livegood`
    (`let n: number = 3 / 2`) and the `b142livectl` control both register, with
    the `theta-system-note` channel read off the settled in-memory
    `SessionManager` naming the registry-sourced rejection.
  - Byte-unchanged, blob-verified before and after:
    `docs/spec_topics/diagnostics/code-registry-parse.md`
    (`ea50c54e991e237cb6bd123ecd32ea5ce1cad00d`), `docs/reference/diagnostics.md`
    (`e9d8d2b4…`), `docs/reference/grammar.md` (`2bb79a99…`),
    `docs/reference/type-system.md` (`0d7aba1b…`),
    `docs/reference/coverage-matrix.md` (`4deff331…`), and
    `tests/fixtures/h7a/permitted-codes.json` (`a4a8da04…`, decided by the real
    H9a run, not predicted). `src/parser/type-layer-checks.ts` is untouched, as
    §Non-goals requires: `provableArgType`'s withholding of `"a" / "b"` moves
    from the `classifyOperand` numeric test to `isProvenReduction` as a
    CONSEQUENCE of the arm, and the observable is unchanged.

- **Blast-radius pre-measurement, before any test was written** (the discipline
  the stopped bug 0139 run established — "no test asserts this" is not "no test
  reds on this"). Three measurements at HEAD `d11aef29`:
  1. `git ls-files -- '*.theta' '*.thetalib'` → 34 files; an AST walk for
     `{ kind: "binary", op: "/" }` through the real `parseThetaDocument` found
     **zero**. The operator's untracked `.pi/theta/smoke.theta` carries `/` only
     inside a frontmatter description STRING, not as an operator.
  2. The whole default suite run WITH a prototype of both arms applied: **zero**
     existing tests red.
  3. Bug 0050's witness does contain `/` cells after all — cell `u10d` drives
     `g("6" / "2")` — so this document's §Affected claim that "a scan of every
     `tests/*.test.ts` for a `/` binary operator in a theta source returns zero
     hits" is WRONG. The cell does not red (its parameter is `n: number`, and
     the row is withheld before and after), which is why measurement 2 held; the
     claim was still false when written.

- **Gates**, each re-run by the orchestrator independently of every nested
  report:
  - Witness, RED before: `tests/division-result-type-number.test.ts`
    `24 failed | 15 passed (39)` at HEAD, every failure naming the missed
    emission or the wrong `typeOf` answer. GREEN after, at 43 cells:
    `Test Files 1 passed (1) / Tests 43 passed (43)`; with the companion,
    `Test Files 2 passed (2) / Tests 47 passed (47)`.
  - Full default suite: `Test Files 274 passed (274) / Tests 4195 passed (4195)`.
  - Protected files, explicit: `fn-arg-type-mismatch-wired` 84,
    `invoke-arg-type-mismatch-wired` 40, `fn-param-name-case` 19 —
    `Tests 143 passed (143)`, no assertion edited in any of them.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean, no output.
  - `npm run lint` (`eslint … "src/**/*.ts"`) — clean, no output.
  - Live H8a: `tests/live/live-production-acceptance.test.ts`
    `Tests 23 passed (23)` (22 before this fix). Live H9a:
    `tests/live/acceptance/` `Tests 11 passed (11)`.

- **Review** — 2 rounds, closed CLEAN, plus one comment-only polish pass.
  - Round 1 (deep): FINDINGS ×4, all category `test`; no `correctness`,
    `fidelity` or `spec` finding. F1 the MIRROR was witnessed by zero tests
    (reverting its hunk left the whole suite green); F2 cell `aStr` could not red
    under the guard-drop it claimed to pin — at `n: number` a dropped
    `isProvenReduction` still answers `[]`; F3 the non-numeric-operand flips at
    the direct sinks were unwitnessed; F4 cell `b3` lacked the `expectDivisions`
    precondition its own file header claims for every absence cell. All four
    fixed: the 4-cell invoke companion, `aStr` re-parameterised to `n: integer`
    with its comment corrected, four new L-cells with `-` controls, and the
    missing precondition.
  - Round 2 (fast): **CLEAN**, no escalation, no deep-review recommendation. Two
    non-blocking residuals raised (below).
  - Polish (comment-only): the witness's file-level manifest omitted the L group
    from both its cell table and its RED/GREEN sentence. Folded in. Verified by
    gate-diff — 43 `it(` cells unchanged, every edited line `//`-prefixed — so
    no confirmation review round was dispatched.

- **Verification** — verdict SOLID, four obligations:
  1. The witnesses genuinely red, proven per arm. Removing the `#typeBinary` arm
     → `28 failed | 15 passed (43)`, matching the file's own documented pre-fix
     RED enumeration. Removing the collector arm → `2 failed | 2 passed (4)` in
     the companion, `divint` stuck rendering `got integer` and `divstr` still
     withheld, both `-` controls unmoved. Both restores blob-hash-verified
     against `213ebc2d…` and `abe4c63e…`.
  2. Full default suite green, 274/4195; protected files 84/40/19 unmoved.
  3. A real end-to-end live test exercises the fixed path: the new H8a cell, run
     for real, green (23/23), and proven RED with the `#typeBinary` arm
     neutralised (the broken theta "registered anyway" alongside its sibling and
     control) then green again after a hash-verified restore. H9a 11/11 — one
     first-pass red in `ctor-unresolved-load-refusal.test.ts` was exit code
     `3221225794` (`0xC0000142`, a Windows child-spawn failure, not an
     application diagnostic) and cleared on an isolated re-run, so it is the
     documented stochastic class and not this change.
  4. `npm run typecheck` and `npm run lint` both clean.

- **§Fix (c) — the sub-decision this document left to the run: MIRROR.**
  Rationale, in order. (1) `collectProvableArgTypes`' own header states the
  invariant at stake — it "mirrors `#typeExpr` / `#typeBinary` shape for shape,
  so a collected member can never render differently from the type the pass
  itself assigns" — and leaving the collector would have falsified that
  invariant in the very commit that created the divergence, trading a clean
  invariant for a documented exception. (2) The measured delta is bounded and is
  the spec's own answer: at the invoke and `.theta`-callable sinks a `/`
  argument's `<actual>` rendering moves `integer` → `number`, and a
  non-numeric-operand division at a parameter matching the operands' type moves
  withheld → fires. Both measured empirically in both directions, not predicted.
  (3) That second class is **not introduced by the mirror** — the settled
  `#typeBinary` arm alone already produces it at the direct parser sinks (rows
  L1–L4 below), so leaving the collector would have made the two layers disagree
  about the same program. (4) Neither delta touches bug 0146's pinned cells:
  a3/a4 (array-literal and typed-`let`-ident withholds) and u1/u2/u3 (union
  `<actual>` rendering) are disjoint from the `/` arm, and that witness stays
  40/40. Bug 0146's own §Related anticipated this move and pre-stated its bound
  ("that arm is not one of the four this report names, and narrowing it makes
  disjointness *more* provable, so it can only add emissions").

- **What flips that §Fix (a)'s summary list does not name**, all measured after
  the fix and all witnessed:
  - **a5 fires.** §Fix (a) reads "a4, a5 (as `number`) … stay clean", but
    §Expected behaviour states the rule "has no exception for an
    exactly-divisible pair (t8, h3)", and the settled code shape returns before
    either operand is typed and cannot consult values. `g(4 / 2)` at
    `n: integer` draws `fn-arg-type-mismatch: expected integer, got number`. The
    code shape governs; §Fix (a)'s summary line is the imprecision.
  - **h3's parse half moves with it.** §Reproduction (h) labels h3 a control and
    records `parse :: []`. Its VALUE half is a genuine control (`2`,
    `isInteger=true`, unchanged); its parse half now fires, for a5's reason.
  - **a6, a9, a13 flip** and are absent from §Fix (a)'s list: a quotient
    laundered through an unannotated `let` (the binding records the
    initialiser's inferred type, so it is a proof), a nested quotient, and
    `g(1 / 0)`.
  - **a7 flips at a different position than group (a) suggests.**
    `let q: integer = 3 / 2` then `g(q)` draws `integer-narrowing` on the
    **`let`**, and the `g(q)` argument slot stays silent — the annotation makes
    the recorded binding type `integer` by fiat, so the slot reads the author's
    claim. The document's mechanism note for a7 is right; the diagnostic's
    position is not where the group implies.
  - **A whole class of non-numeric-operand divisions now refuses at the direct
    sinks**, named nowhere in this document and now pinned as cells L1–L4 with
    `-` controls: `let s: string = "a" / "b"` and
    `let b: boolean = true / false` draw `let-rhs-type-mismatch`; a `string`
    schema field drawn from `"a" / "b"` draws `object-field-type-mismatch`;
    `let xs: array<string> = ["a" / "b"]` draws `let-rhs-type-mismatch` +
    `array-element-type-mismatch`. Each is `[]` with the arm removed. All are
    spec-correct — `"a" / "b"` evaluates to `NaN`, which is a `number` — and
    every code is already registered and `E`, so no registry row moves.
  - **`t5`'s raw `CompatType` shape moves**
    `{"kind":"literal","typesAs":"number"}` → `{"kind":"prim","name":"number"}`
    with no observable change: `displayType` is `number` either way and every
    consumer verdict is identical. §Non-goals excludes the `literal`/`prim`
    distinction, so the witness pins the projection (`displayType` plus the
    `checkCompatible` verdict) rather than the raw object.

- **GOV-15 (§Fix (d)) — discharged by measurement, not prediction.** The change
  makes currently-clean programs refuse, so it is an ADDITION under the
  diagnostic-registry carve-out (`source-language-stability.md:25`). The
  committed-corpus sweep was re-run at this HEAD over
  `git ls-files -- '*.theta' '*.thetalib'` — 34 files, **zero** carrying a `/`
  binary operator — as witness cell `g1`, which asserts both globs contribute
  (bug [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) leaves
  the committed-fixture parse gate blind to `.thetalib`, so the sweep names them
  explicitly rather than relying on that gate). No registry row is added,
  removed or edited and no *Trigger* changes: every code the fix newly emits —
  `integer-narrowing`, `array-element-type-mismatch`,
  `object-field-type-mismatch`, `fn-arg-type-mismatch`, `let-rhs-type-mismatch`,
  `invoke-arg-type-mismatch` — is already registered, already `E`, and already
  emitted from the same call site on the `1.5`-literal control. DIAG-2 is not
  engaged and DIAG-4's *Message* strings are unchanged, both confirmed by blob
  hash. The release notes name the input class.

- **Residuals** — for the parent to file; no bug document was created by this
  run.
  1. **The MIRROR reaches two further sinks that have no `/` witness.**
     `collectProvableArgTypes` has three consumers; the new companion pins only
     the `invoke` one. The `.theta`-callable arm
     (`theta/parse/tool-arg-type-mismatch`) and the Pi-tool
     provable-disjointness arm (`theta/parse/tool-arg-schema-conflict`) route
     through the identical shared function, so the arm reaches them by
     construction, but neither has a dedicated `/` cell —
     `tests/tool-calls.test.ts`, `tests/tool-arg-schema-conflict.test.ts` and
     `tests/tool-arg-shape-enforcement.test.ts` contain no `/` fixture. A
     coverage gap in code reviewed as correctness-clean, not a wrong behaviour.
     Natural home: bug
     [0146](./0146-invoke-arg-provable-set-withholds-true-positives.md)'s
     coverage pass, whichever route it takes.
  2. **`tests/fn-arg-type-mismatch-wired.test.ts`'s cell `u10d` comment is now
     stale for `/`.** It reads "all three read `string` before the guard";
     post-fix the `/` fixture reads `number` before the guard and withholds at
     `isProvenReduction` rather than at the numeric test. The ASSERTION is
     unchanged and still correct (the cell passes, 84/84); only the explanation
     is stale. The file is protected on this bug, so it was not touched.
  3. **`src/parser/type-layer-checks.ts`'s `provableArgType` arithmetic-arm
     comment is stale for `/`.** It reads "a same-typed pair of proven
     non-numeric operands passes it [`isProvenReduction`] — and for `-`, `*`,
     `/`, `%` the result type is fixed by the operator"; post-fix a same-typed
     non-numeric pair under `/` no longer passes `isProvenReduction`, because
     the reduction is `prim number`. §Non-goals keeps that file unedited, so this
     is recorded rather than repaired.
  4. **This document's §Affected "no committed test drives a `/` at all" claim
     is false** (measurement 3 above, cell `u10d`), and §Fix (a)'s flip list is
     incomplete in the five ways enumerated above. Both are corrected here
     rather than by rewriting the settled sections.

- **Discharge notes appended:**
  [0146](./0146-invoke-arg-provable-set-withholds-true-positives.md) — its
  §Related had 0142's §Fix (c) as an open disposition; it is now taken, and the
  note records the shipped shape, that a3/a4/u1/u2/u3 were verified unflipped
  (40/40), and that a route-2 fix there would supersede the mirror rather than
  conflict with it. No note is owed to
  [0081](./0081-array-ternary-common-type-never-unions.md) (it cites neither
  `#typeBinary` nor this report, and the arm sits ahead of the `#commonType`
  call it owns), nor to
  [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md) (none of
  its measurements references the collector's `/` arm).

- **Pinned dispositions / non-goals, each measured as NOT moved and witnessed:**
  - **`%` by a literal zero does not move.** `1 % 0` still reads `integer` and
    `let n: integer = 1 % 0` is still `[]` — cells `t9` and `b8`. §Non-goals'
    reason is honoured: it is a different sentence whose static decidability
    depends on the divisor's *value*, and this run developed no new evidence
    changing its standing.
  - **`fn`-return-annotation checking does not move.**
    `fn g(): integer { 3 / 2 }` and its `fn g(): integer { 1.5 }` control are
    both still silent — cells `c17`, `c18`, and the runtime companion `h5`.
    Pinned as the unrelated silence they are, so this fix is not credited with
    them.
  - **`-`, `*` and `%` keep the operand-common widening** — cells `t2`, `t3`,
    `t4`, `a10`–`a12`, `b4`, with `L1c`/`L2c`/`L3c`/`L4c` proving the L-class
    flip is keyed to the operator and not to the operand kinds.
  - **`+` is untouched** (bug 0072 owns it; `+`'s result type IS its operands'
    common type by construction) — cells `t10`, `aPlus`, `b9`.
  - **`#commonType` is untouched** (bug 0081) — the arm returns before the call.
  - **The runtime is untouched.** All three `/` implementations already match
    the spec; the witness pins the runtime VALUES (`1.5`, `2`, `Infinity`,
    `NaN`) alongside the parse refusals precisely so a later removal of the
    refusal cannot pass unnoticed.
  - **`type-system.md:48`'s deferral survives** — no row here has an
    unresolvable operand and the arm adds no `TypeEnv` read.
  - **Position-only citation drift induced in other documents is deliberately
    not repaired** (bug 0134's adjudicated class). The two edited source files
    shift line numbers for citations in several open bug documents and in the
    protected witness's comments; none was chased.
