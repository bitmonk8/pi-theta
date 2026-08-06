# Bug 0152 — `#typeBinary` carries a per-operator arm for `/` and none for `%`, so `1 % 0` types as `integer` against `expressions.md:232`'s "because `NaN` is a `number`, an `integer % 0` result widens to `number`": `let n: integer = 1 % 0`, `fn g(n: integer)` called as `g(1 % 0)`, an `integer`-declared schema field, an `array<integer>` element and a `par for … max` all load with zero diagnostics, the theta registers and runs, the runtime binds `NaN` into each of those positions, and `provableArgType` certifies `integer` as PROVEN — measured by rendering `got integer` at a sink that does fire

- **Status:** open. §Fix is constraint-pinned, not settled: the DECIDABILITY
  SCOPE is an in-run adjudication with three routes enumerated below
  (literal-zero divisor only; constant-folded zeros; provably-zero bindings),
  each with its own GOV-15 and witness consequences, and no route is selected
  here. No ordering dependency blocks it. Bug
  [0142](./0142-division-result-type-not-number.md) is **fixed (0.80.0)** and is
  this report's origin, not its prerequisite: 0142's §Non-goals measured this
  neighbour, excluded it by name, and its fix pinned the current reading as
  witness cells `t9` and `b8` of `tests/division-result-type-number.test.ts`.
  Those two cells are the coordination surface — they red on any fix here, by
  construction, and must be retaken rather than worked around.
- **Sev/Diff estimate:** S1/D3 — `NaN` reaches an `integer`-annotated `let`
  binding, an `integer`-annotated `fn` parameter, an `integer`-declared schema
  field, an `array<integer>` element and the `par for … max` operand with no
  diagnostic on any channel and no runtime net (measured, §Reproduction (h));
  the theta registers through the shipped composition root (§Reproduction (r));
  and the type layer certifies `integer` as a *proof* rather than deferring,
  measured by the `got integer` it renders at a sink that fires (a17, a21). The
  failure shape is the one 0142 carried at S1. Two facts bound the realised
  benefit and neither changes the shape: the committed corpus contains **zero**
  `%` operators of any kind (§Reproduction (g)), and modulo by a literal zero is
  a constant-`NaN` expression, so the input class is small. D3 because §Fix is
  not settled — the decidability scope needs an in-run adjudication whose routes
  differ in what they flip, what new capability they require and what they leave
  measurably silent — and because closing it edits two pinned cells in a witness
  file another report shipped, plus a second sub-decision (whether the
  extension-layer collector mirrors) that 0142 had to take for `/` and that
  recurs here in a value-keyed form.
- **Kind:** defect — implementation, against a written sentence.
  `docs/spec_topics/expressions.md:232` states the rule once, with its reason
  attached: "Modulo by zero (`n % 0`) likewise produces `NaN` and does not
  panic; because `NaN` is a `number`, an `integer % 0` result widens to
  `number`". `#typeBinary` (`src/parser/static-type-inference.ts:298–338`)
  implements the general `%` widening from the same paragraph and not the
  value-keyed carve-out: after the `/` arm bug 0142 added (`:323–328`), `%`
  falls to the operand-common reduction (`:329–337`), so `integer % integer`
  reads `integer` for every divisor including `0`.
  - **The direction is a MISSED emission, not a false one.** Every diagnostic
    named below is one the checks are written to emit and do not. A proof
    predicate that withholds on doubt cannot withhold on a rule that is
    confidently wrong.
  - **The distinctive shape against bug 0142, and why 0142 did not carry it.**
    `/`'s rule is a constant function of the operator: `#typeBinary`'s `/` arm
    returns before either operand is typed and consults nothing. `%`'s rule
    depends on the DIVISOR'S VALUE. The pass has the divisor's syntax, not its
    value: `NumberExpr` carries `text` and `numericType`
    (`src/parser/theta-document.ts:129–133`), the parser folds no constants, and
    `bindings` maps a name to a `CompatType`, never to a value. So the widening
    is statically decidable for a literal `0` divisor, decidable for a folded
    constant only if a folder is added, and decidable for a binding only if a
    provably-zero value channel is added. That choice is §Fix's adjudication and
    is what makes this a separate report rather than a second arm in 0142's.
  - **The non-zero `%` rows are correct and must not move.** The same paragraph
    gives `%` the operand-common widening for every other divisor: `3 % 2` reads
    `integer` and that is the spec's answer (t2, b4, a4, h3, h11). 0142's
    witness pins `3 % 2` as cell `t3`.
  - **The runtime is not a net and is not in question.** All three shipped `%`
    implementations are plain IEEE-754 remainder and refuse nothing —
    `src/runtime/statement-executor.ts:898–899`,
    `src/runtime/expression-evaluator.ts:524–526`,
    `src/extension/production-theta-producer.ts:6060–6061`. The second carries
    the spec's non-panic half in its own comment ("Modulo by zero is `NaN`, not
    a panic (expressions.md §\"Other arithmetic\")") and not the widening half.
  - **The registered row that most directly names the position is parse-only by
    its own *Trigger*.** `theta/parse/fn-arg-type-mismatch`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:116`): "Always
    parse-time: top-level `fn` declarations are hoisted and always statically
    resolvable, so no runtime AJV safety net applies." Measured
    (§Reproduction (h)), nothing downstream refuses the value either.
- **Related:**
  - [0142](./0142-division-result-type-not-number.md) — **fixed (0.80.0)**, the
    filing origin, the measured exclusion, and the model this report's §Fix
    follows. Its §Non-goals bullet "`%` by a literal zero" (`:722`) states the
    finding and the exclusion reason verbatim: "it is a different sentence with
    a different shape: `/`'s rule is a constant function of the operator, while
    `%`'s depends on the divisor's *value* and is statically decidable only for
    a literal `0` (or a binding provably `0`), which makes its disposition an
    adjudication this report does not carry. A fix must state whether it moves."
    Its fix record (`.pi/tmp/fixes/0142-report.md`, closing paragraph) confirms
    that run developed no new evidence moving it and names the pinning cells.
    **0142's own §Fix is the shape this one mirrors**, one difference apart: its
    arm returns `{ kind: "prim", name: "number" }` on the operator alone, this
    one has to test an operand. Its §Fix (c) — whether
    `collectProvableArgTypes` mirrors — is a settled precedent here, not an open
    question there: it settled as MIRROR, and the same sub-decision recurs below
    in a value-keyed form.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, the owner of `+`. `+` is unaffected here and must stay
    unaffected: `expressions.md`'s `+` rule makes a both-`integer` pair produce
    `integer`, which the common-type reduction already gives
    (`src/parser/type-layer-checks.ts:1757–1760` records why). Measured: t10
    (`3 + 2` reads `integer`). 0072's `collectProvableArgTypes`
    (`src/extension/invoke-static-checks.ts:505`) is the one consumer of a `%`
    expression's type that does **not** route through `#typeBinary` — §Fix (c).
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **open**, the
    owner of `#commonType` (`static-type-inference.ts:347`), the function the
    arithmetic tail calls. **Disjoint, and neither fix reaches the other.**
    0081's subject is that the reduction never unions — a candidate set with no
    common upper bound falls back to `candidates[0]`. Here the reduction works
    as designed: both operands are `integer`, `integer` is their common type,
    and the answer is still wrong because for a zero divisor the operator's
    result type is not a function of its operands' common type. Measured
    (§Reproduction (t)): `1 % 0`, `3 % 2`, `3 - 2`, `3 * 2` and `3 + 2` produce
    byte-identical `CompatType` values, and one of the five is not the spec's
    answer. A fix here adds a rule ahead of the call; a fix there changes what
    the call returns for heterogeneous candidates. They compose without
    conflict.
  - [0146](./0146-invoke-arg-provable-set-withholds-true-positives.md) —
    **open**. **No overlap.** 0146's subject is the four
    `collectProvableArgTypes` arms that return `undefined` (`array` literal,
    `ident`, `index`, `par-for`), which withhold true positives at the invoke
    sink. The `binary` arm is not among them, and this report's interaction with
    that function is the opposite one: the arm answers a set, and the set's
    single member is the wrong type (measured, §Reproduction (r): `1 % 0` at a
    `params: x: string` callee renders `got integer`). Narrowing it to `number`
    can only add emissions, which is the bound 0146's own §Related pre-stated
    for 0142's mirror.
  - [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md) —
    **open**. **No overlap.** 0147's subject is how many diagnostics one call
    site with two mistyped arguments draws on each of three call spellings. This
    report changes what one argument's type IS, not how many diagnostics a
    multi-argument site emits; every row measured here has one argument.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**. Cited for
    the citation-drift class only: 0142's fix shifted
    `src/parser/static-type-inference.ts` (+6 at `#typeBinary`) and
    `src/extension/invoke-static-checks.ts` (+14 net from
    `collectProvableArgTypes`'s `binary` arm onward). Every line number in this
    report is re-measured at HEAD `fb073780`, not carried over.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**.
    Cited for the corpus-sweep method only: the committed-fixture parse gate
    filters `.theta`, so the GOV-15 sweep below is taken over
    `git ls-files -- '*.theta' '*.thetalib'` rather than through that gate.
- **Affected** (every citation verified at HEAD `fb073780`, 0.80.0):
  - **The defect site** — `src/parser/static-type-inference.ts:329–337`, the
    tail of `#typeBinary` (declared `:298`), which `%` reaches:

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

    `op` is a parameter (`:299`) and is read three times above — for the
    synthetic-`null`-left unary shapes (`:311–318`), for the result-fixed
    boolean set (`:319–322`), and for `/` (`:323–328`, bug 0142's arm). It is
    not read again. `right` (`:301`) is read only to type it. Four operators
    reach this line — `+`, `-`, `*`, `%` — and get one rule.
  - **What the spec assigns those four.**
    `docs/spec_topics/expressions.md:232` gives `-`, `*` and `+` the
    operand-common rule this line implements, gives `%` that rule for a non-zero
    divisor, and carves `n % 0` out of it. Measured (§Reproduction (t)), all
    four produce the identical `CompatType` for two `integer` literals; for
    `1 % 0` that is a defect and for the rest it is correct.
  - **The arm that already exists for the neighbouring operator** —
    `static-type-inference.ts:323–328`, bug 0142's `/` arm, sitting between the
    boolean gate and the reduction. It is the placement §Fix reuses and the
    reason `3 / 2` now reads `{ kind: "prim", name: "number" }` (t7) while
    `1 % 0` still reads `{ kind: "literal", typesAs: "integer" }` (t1).
  - **`#commonType`** — `static-type-inference.ts:347`. For two identical
    candidates its `find` returns the FIRST verbatim, so the static type of
    `1 % 0` is the static type of the literal `1`:
    `{ kind: "literal", typesAs: "integer" }` (t1).
  - **The dispatch** — `static-type-inference.ts:224–225`, `#typeExpr`'s
    `case "binary"`. `:182–188` is the public `typeOf(node, env, bindings)`
    seam; `src/parser/type-layer-checks.ts:925–926` delegates the checker-side
    `typeOf` to it.
  - **The divisor's static representation, which bounds what a fix can decide.**
    `NumberExpr` (`src/parser/theta-document.ts:129–133`) carries `text: string`
    and `numericType: "integer" | "number"` — no parsed value. Parentheses are
    transparent: `parsePrimary` returns the inner expression (`:3578–3585`), so
    `1 % (0)` and `1 % 0` carry the same divisor node (t13 against t1). Unary
    minus is NOT transparent: `parseUnary` models it as a binary with a
    synthetic `null` left operand, so the divisor of `1 % -0` is a `binary`
    node, not a `NumberExpr` (t12, b11, h8). No constant folder runs at parse
    time (t11: `1 % (2 - 2)` reads `integer`; h7 binds `NaN`).
  - **The sinks that read the wrong answer**, each measured in §Reproduction
    with a control that fires on the same body:
    - `checkLetRhsCompat` (`src/parser/type-compat.ts:403`) and its
      `integer-narrowing` arm (`:417–428`), called from `walkStmt`'s `let` arm
      (`type-layer-checks.ts:970`) on the type read at `:947`.
    - `checkFnArgCompat` (`type-compat.ts:452`), called from `checkFnCallArgs`
      (`type-layer-checks.ts:1575`, the emission site bug 0050 wired) at
      `:1616`, on the argument type taken at `:1608`.
    - `checkObjectFieldCompat` (`type-compat.ts:500`), called at
      `type-layer-checks.ts:1548`.
    - The array-element sink (`type-compat.ts:573–582`), reached from
      `type-layer-checks.ts:1431`.
    - The `par for … max` integer sink — `type-layer-checks.ts:2023–2040`,
      whose own comment says "The `max` operand is an integer sink: a
      fractional / `number` operand narrows to the existing
      `theta/parse/integer-narrowing` diagnostic."
    - The index-element narrowing (`static-type-inference.ts:245–250`), through
      which a `%` result stored in an array literal reaches a typed `let` (b13,
      h10).
  - **The proof discipline that certifies the wrong answer** —
    `provableArgType`, `src/parser/type-layer-checks.ts:1654`, and its
    arithmetic `binary` arm at `:1739–1763`. `:1741` reads the pass's reduction;
    `:1742` requires `isProvenReduction` (`:1886`) — every operand itself proven
    and `⊑` the reduction; `:1761` admits the reduction when
    `classifyOperand(reduced, this.env) === "numeric"` (`classifyOperand` is
    `:123–152`). For `1 % 0` all three tests pass, so the predicate answers
    `integer` — a proof, not a deferral. **Measured directly** (a17): against a
    `string` parameter the argument slot fires and renders
    `expected string, got integer`, which only a returned proof can produce.
    The arm's own comment (`:1745–1755`) names `%` among the operators whose
    "result type is fixed by the operator" and cites the same spec paragraph
    including its `NaN` clause; it uses that fact only to *withhold* on a
    non-numeric reduction, never to *supply* the widened type.
  - **The one consumer outside the seam** — `collectProvableArgTypes`,
    `src/extension/invoke-static-checks.ts:505`. Its `binary` arm dispatches in
    `#typeBinary`'s own order: the synthetic-`null` `-` (`:534–537`), the
    `!` / `BOOLEAN_BINARY_OPS` set (`:538–550`), then **the `/` arm bug 0142's
    §Fix (c) mirrored** (`:551–563`, returning `[pass.typeOf(expr, env)]`), then
    the arithmetic union (`:564–572`). `%` reaches the union, so
    `collectProvableArgTypes(1 % 0)` is the union of the operand sets —
    `{integer}` — whatever `#typeBinary` answers. Measured at the invoke sink
    (§Reproduction (r)): `invoke("./cstr.theta", 1 % 0)` at a
    `params: x: string` callee renders `got integer`, identical to the `3 - 2`
    control, while the `3 / 2` control renders `got number`. The arm's comment
    (`:564–572`) now names `%` as the operator the safety bound rests on: the
    over-approximation is safe because `kindsDisjoint`
    (`src/runtime/tool-call.ts:385`) reconciles `integer` and `number`, "so
    `%`'s `NaN` widening (an `integer % 0` divisor, expressions.md §\"Other
    arithmetic\") cannot turn a withheld verdict into a fired one". The
    function's header states the invariant a `#typeBinary`-only fix would break
    (`:495–499`): it "mirrors `#typeExpr` / `#typeBinary` shape for shape, so a
    collected member can never render differently from the type the pass itself
    assigns".
  - **The runtime, in all three implementations** —
    `src/runtime/statement-executor.ts:882` (`applyBinaryScalar`), `:898–899`
    (the `%` case, `(left as number) % (right as number)`);
    `src/runtime/expression-evaluator.ts:490` (`evaluateBinary`), `:524–526`,
    whose comment states the non-panic half of the spec sentence;
    `src/extension/production-theta-producer.ts:6025`
    (`evaluateBinaryExpression`), `:6060–6061`. None validates the remainder
    against any annotation, and no AJV path stands between a `%` result and an
    `integer`-annotated binding, parameter or field (measured, §Reproduction
    (h)).
  - **The registration consequence, measured rather than inferred.**
    `src/extension/production-composition.ts:2047` (`hasLoadParseError`) drops a
    theta carrying an `error`-severity `theta/load/*` or `theta/parse/*`. The
    codes that do not fire are all `E` (`code-registry-parse.md:24`
    `integer-narrowing`, `:40` `array-element-type-mismatch`, `:46`
    `object-field-type-mismatch`, `:54` `let-rhs-type-mismatch`, `:114`
    `invoke-arg-type-mismatch`, `:116` `fn-arg-type-mismatch`), so the affected
    theta **registers and runs**: §Reproduction (r) loads a planted workspace
    through the shipped `discoverAndComposeFixtures` and `let n: integer = 1 % 0`
    registers beside the spec-correct `let n: number = 1 % 0` while the `1.5`
    control is dropped.
  - **Spec.** `docs/spec_topics/expressions.md:230` — the *Other arithmetic*
    heading; `:232` — the paragraph carrying the general `%` widening, the
    `n % 0` carve-out, and the safe-integer sentence that presupposes the
    carve-out. `docs/spec_topics/diagnostics/code-registry-runtime.md:43` —
    modulo by zero is deliberately outside the panic catalogue and "yield[s]
    IEEE-754 `Infinity` / `NaN` per the `number` rules in Expressions".
    `docs/spec_topics/type-system.md:27` — the closed list of positions the `⊑`
    relation governs, which names five of the sinks measured here; `:36` —
    TYPE-2, the one-way `integer ⊑ number` widening the spec sentence invokes by
    name; `:48` — *Unresolvable operands*, the deferral rule, which does **not**
    apply to a literal-`0` divisor; `:50` — TYPE-9, which routes the typed-`let`
    and `fn`-argument failures.
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2; `:74` —
    DIAG-4. `docs/spec_topics/governance/source-language-stability.md:5` —
    GOV-15; `:9` — the loads-cleanly predicate; `:25` — the diagnostic-registry
    carve-out and its addition arm.
  - **No user-facing mirror states `%`'s result type.**
    `docs/reference/grammar.md:129` gives the *literal*-level rule and states no
    operator result type; `:365` gives `%`'s precedence only;
    `docs/reference/diagnostics.md:267` and
    `docs/reference/errors-and-results.md:91` state the non-panic disposition,
    which a fix does not change. A fix therefore edits no `docs/reference/`
    page.
  - **Test coverage: the current reading is PINNED, in two cells, by bug 0142's
    own witness.**
    - `tests/division-result-type-number.test.ts:756–767`, cell `t9`, asserts
      `reading("1 % 0\n", "t9")` is `INTEGER_READING` (`"integer|compatible"`,
      `:613`) with the message "t9 — the `%`-by-literal-zero widening is out of
      scope; this row must read exactly as it does at this HEAD".
    - `:1131–1162`, the `b3, b4, b8, b9` cell, whose `b8` row (`:1139`) asserts
      `let n: integer = 1 % 0` produces `[]`, with the message "b3/b4/b8/b9 — a
      fix that reds any of these has widened past `/`. b8 in particular is the
      §Non-goals row whose disposition this report does not carry".
    Both red on any fix that implements the widening. Neither is a defect: they
    are 0142's record that the disposition was deliberately not taken. **A fix
    here retakes them; it does not route around them.**
    - The rest of the `%` coverage is runtime-only and stays green:
      `tests/e2e-s1-runtime-values.test.ts:70–74` ("modulo by zero yields NaN
      and does not panic") and `tests/expression-evaluator.test.ts:213–216`.
      `tests/fn-arg-type-mismatch-wired.test.ts:751` drives `g("6" % "2")` at
      an `n: number` parameter — a withheld row with a non-literal divisor, not
      a `% 0` cell.
- **Observed at:** `0.80.0` (HEAD `fb073780`). Offline, deterministic; no live
  model, no provider. Parse and raw-type rows through the production
  `parseThetaDocument` (house driver `parseDoc`, `tests/helpers/e2e-s1.ts`),
  frontmatter `---\nmode: prompt\n---`, with a trailing expression supplying the
  theta's final value; raw-type rows additionally construct
  `StaticTypeInferencePass` over the shipped `checkCompatible` and read `typeOf`
  on the body tail. Runtime rows through `parseThetaDocument` →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`, the
  harness shape `tests/division-result-type-number.test.ts` establishes.
  Registration and invoke-sink rows through the shipped
  `discoverAndComposeFixtures` over a planted `.pi/theta/` workspace, the
  harness shape `tests/division-result-type-number-invoke.test.ts` establishes.
  Corpus row: `parseThetaDocument` over all 34 tracked `.theta` / `.thetalib`
  files with an AST walk for `{ kind: "binary", op: "%" }`. One scratch vitest
  file, run on the outputs quoted below, then deleted; `git status --short` and
  `ls tests | grep -i scratch` both empty afterwards. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

`docs/spec_topics/expressions.md:232` gives `%` two rules in one paragraph. The
general one: "`%` follows the same `integer ⊑ number` widening: two `integer`
operands produce `integer`, and either operand being `number` widens the result
to `number`." The value-keyed carve-out, stated with its reason: "Modulo by zero
(`n % 0`) likewise produces `NaN` and does not panic; because `NaN` is a
`number`, an `integer % 0` result widens to `number`."

`#typeBinary` (`src/parser/static-type-inference.ts:298–338`) implements the
general rule and not the carve-out. Bug 0142 added a per-operator arm for `/`
(`:323–328`); `%` still falls through to the operand-common reduction
(`:329–337`), which reads two `integer` literals and returns the first verbatim.
Measured: `1 % 0`, `0 % 0`, `-1 % 0`, `1 % (0)`, `1 % (2 - 2)`, `1 % -0` and
`1 % 2 % 0` all read `{ kind: "literal", typesAs: "integer" }`, the same value
`3 % 2`, `3 - 2`, `3 * 2` and `3 + 2` read. The static type of `1 % 0` is the
static type of the literal `1`.

The answer is not an inert fallback. It is `integer` — concrete, resolvable and
`⊑ integer` — so no consumer defers and every consumer decides on it. Measured
against a `1.5`-literal control on the same body, **five sinks stop firing**:
the typed `let` (`integer-narrowing`), the `fn` argument slot
(`fn-arg-type-mismatch`), the schema-constructor field (`integer-narrowing`),
the `array<integer>` element (`integer-narrowing` +
`array-element-type-mismatch`) and the `par for … max` operand
(`integer-narrowing`). All are `E`, so `hasLoadParseError` has nothing to act on
and the theta registers — measured end to end through the shipped composition
root (§Reproduction (r)).

**The runtime is not a net.** All three shipped `%` implementations are plain
IEEE-754 remainder; one of them (`src/runtime/expression-evaluator.ts:524–526`)
carries the non-panic half of the spec sentence in its comment and not the
widening half. Measured: `let n: integer = 1 % 0` holds `NaN`;
`fn g(n: integer): number { n }` + `g(1 % 0)` binds `NaN` to `n` and returns it;
`S { n: 1 % 0 }` on `schema S { n: integer }` stores `NaN`;
`let xs: array<integer> = [1 % 0]` reads `NaN` back out at index 0. Every one
parses with zero diagnostics.

**The proof discipline certifies the wrong type, and the certification is
observable.** `provableArgType` (`type-layer-checks.ts:1654`) exists to withhold
`checkFnCallArgs`'s judgement wherever the pass's read is not a proof of the
runtime value's type. For `1 % 0` its three tests all pass and it returns
`integer`. Silence at an `integer` parameter cannot distinguish a proof from a
withhold, so the measurement is taken at a parameter both answers separate:
`fn g(s: string)` called as `g(1 % 0)` fires with
`expected string, got integer` (a17), and `let s: string = 1 % 0` fires
`let binding 's' initialiser type mismatch: expected string, got integer` (a21).
Both render the type the spec says is `number`, into an author-visible message.

**The defect is bounded to an `integer` divisor spelled `0`.** A `number`
operand widens through the same reduction and every measured control fires:
`g(1.0 % 0)` draws `fn-arg-type-mismatch`, `let n: integer = 1.0 % 0` draws
`integer-narrowing`, and `1 % 0.0` reads `number` because `0.0` is a `number`
literal. `3 % 2` reads `integer` and is correct.

## Reproduction

Offline, at `fb073780`. Parse rows: the production `parseThetaDocument` through
`parseDoc`, frontmatter `---\nmode: prompt\n---`, trailing expression as the
final value. `codes` / `msgs` are the whole aggregated `diagnostics` lists,
unfiltered. Runtime rows: the production executor harness named in §Observed at.

### (t) The raw inference read

`StaticTypeInferencePass.typeOf` on the body tail, over an empty `TypeEnv`.
`vs-integer` is `checkCompatible(t, { kind: "prim", name: "integer" }, env)`.

```
@@ t1  1 % 0                raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t2  3 % 2                raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t3  1.0 % 0              raw={"kind":"literal","typesAs":"number"}   display=number   vs-integer=integer-narrowing
@@ t4  1 % 0.0              raw={"kind":"literal","typesAs":"number"}   display=number   vs-integer=integer-narrowing
@@ t5  0 % 0                raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t6  -1 % 0               raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t7  3 / 2 (0142 fixed)   raw={"kind":"prim","name":"number"}         display=number   vs-integer=integer-narrowing
@@ t8  3 - 2                raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t9  3 * 2                raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t10 3 + 2                raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t11 1 % (2 - 2)          raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t12 1 % -0               raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t13 1 % (0)              raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t14 (1 % 0) + 1          raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t15 -(1 % 0)             raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
@@ t16 1 % 2 % 0            raw={"kind":"literal","typesAs":"integer"}  display=integer  vs-integer=compatible
```

t1 against t2 and t8–t10: five expressions, one answer, and `expressions.md:232`
assigns four of them that answer. t7 is bug 0142's shipped arm, present at this
HEAD, which is what makes the `%` gap a gap rather than a shared posture. t3 and
t4 bound the defect to an `integer` divisor spelled `0`: a `number` on either
side reaches `number` through the widening, which is also the spec's answer for
`n % 0`, reached for a reason that does not generalise. t11–t13 and t16 are the
decidability boundary §Fix has to pin: parentheses are transparent (t13 carries
the same divisor node as t1), unary minus is not (t12's divisor is a `binary`
node), and no constant folder runs (t11). t14 and t15 carry the wrong type
outward through `+` and unary negation.

### (b) The typed-`let` sink

```
@@ b1  let n: integer = 1 % 0
   codes :: []
   msgs  :: []
@@ b2  [ctl] let n: integer = 1.5
   codes :: ["error theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b3  [ctl] let n: integer = 1.0 % 0
   codes :: ["error theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b4  [ctl] let n: integer = 3 % 2
   codes :: []
   msgs  :: []
@@ b5  let n: number = 1 % 0
   codes :: []
   msgs  :: []
@@ b6  let n: integer = 0 % 0
   codes :: []
   msgs  :: []
@@ b7  let n: integer = 1 % (2 - 2)
   codes :: []
   msgs  :: []
@@ b8  let z = 0 / let n: integer = 1 % z
   codes :: []
   msgs  :: []
@@ b9  let z: integer = 0 / let n: integer = 1 % z
   codes :: []
   msgs  :: []
@@ b10 [ctl] let n: integer = 3 / 2 (0142)
   codes :: ["error theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b11 let n: integer = 1 % -0
   codes :: []
   msgs  :: []
@@ b12 let n: integer = true ? 1 % 0 : 1
   codes :: []
   msgs  :: []
@@ b13 let xs = [1 % 0] / let m: integer = xs[0]
   codes :: []
   msgs  :: []
@@ b14 let n: integer = 1 % 2 % 0
   codes :: []
   msgs  :: []
```

b2, b3 and b10 establish the check is live and reaches this position on this
shape; b3 is the exact diagnostic b1 is owed. b4 is the row whose silence is
correct. b5 is the spec-correct annotation. b8 and b9 are the provably-zero
binding, silent whether or not the binding is annotated. b12 and b13 carry the
wrong type through the ternary and index-element reductions.

### (a) The other parse sinks, and the two rows that show a proof was returned

`g` is `fn g(n: integer): number { 1 }` unless the row says otherwise.

```
@@ a1  g(1 % 0)
   codes :: []
   msgs  :: []
@@ a2  [ctl] g(1.5)
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ a3  [ctl] g(1.0 % 0)
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ a4  [ctl] g(3 % 2)
   codes :: []
   msgs  :: []
@@ a5  [ctl] g(3 / 2) (0142 fixed)
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('n') type mismatch: expected integer, got number"]
@@ a6  g(0 % 0)
   codes :: []
   msgs  :: []
@@ a7  fn g(n: number) g(1 % 0)
   codes :: []
   msgs  :: []
@@ a8  let q = 1 % 0 / g(q)
   codes :: []
   msgs  :: []
@@ a9  xs: array<integer> = [1 % 0]
   codes :: []
   msgs  :: []
@@ a10 [ctl] xs: array<integer> = [1.5]
   codes :: ["error theta/parse/integer-narrowing","error theta/parse/array-element-type-mismatch"]
   msgs  :: ["cannot narrow number to integer","array element type mismatch at index 0: expected integer, got number"]
@@ a11 schema S { n: integer } S { n: 1 % 0 }
   codes :: []
   msgs  :: []
@@ a12 [ctl] S { n: 1.5 }
   codes :: ["error theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ a13 par for max 1 % 0
   codes :: []
   msgs  :: []
@@ a14 [ctl] par for max 1.5
   codes :: ["error theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ a15 fn g(): integer { 1 % 0 }
   codes :: []
   msgs  :: []
@@ a16 [ctl] fn g(): integer { 1.5 }
   codes :: []
   msgs  :: []
@@ a17 fn g(s: string) g(1 % 0)  [proof probe]
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('s') type mismatch: expected string, got integer"]
@@ a18 [ctl] fn g(s: string) g(3 % 2)
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('s') type mismatch: expected string, got integer"]
@@ a19 [ctl] fn g(s: string) g(3 / 2)
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('s') type mismatch: expected string, got number"]
@@ a20 [ctl] fn g(s: string) g(1)
   codes :: ["error theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('s') type mismatch: expected string, got integer"]
@@ a21 let s: string = 1 % 0  [direct sink]
   codes :: ["error theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 's' initialiser type mismatch: expected string, got integer"]
@@ a22 [ctl] let s: string = 3 / 2
   codes :: ["error theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 's' initialiser type mismatch: expected string, got number"]
```

a2 and a3 establish the `fn`-argument check is live at this position; a3 is the
diagnostic a1 is owed. a8 shows the annotation-free `let` does not repair the
read. **a17 and a21 are the rows that separate a returned proof from a
withhold**: both fire, and both render `got integer` — a withheld read produces
no message at all, so the type layer is asserting `integer`, not deferring.
a19 and a22 are the same two positions on a `/` expression at this HEAD, which
render `got number` after bug 0142's fix. a15/a16 are silent in **both**
directions and are therefore not attributable here — the `fn`-return annotation
is checked at no parse seam for any initialiser form (§Non-goals).

### (h) The runtime the registering theta reaches

Same harness, executed. `parse` is the pass's code list; the rest is
`executeBody`'s outcome and final value.

```
@@ h1  let n: integer = 1 % 0 / n
   parse=[] outcome=success value=NaN isInt=false
@@ h2  fn g(n: integer): number { n } / g(1 % 0)
   parse=[] outcome=success value=NaN isInt=false
@@ h3  [ctl] let n: integer = 3 % 2 / n
   parse=[] outcome=success value=1 isInt=true
@@ h4  schema S { n: integer } / S { n: 1 % 0 }.n
   parse=[] outcome=success value=NaN isInt=false
@@ h5  let n: integer = 0 % 0 / n
   parse=[] outcome=success value=NaN isInt=false
@@ h6  [ctl] let n: number = 1 % 0 / n
   parse=[] outcome=success value=NaN isInt=false
@@ h7  let n: integer = 1 % (2 - 2) / n
   parse=[] outcome=success value=NaN isInt=false
@@ h8  let n: integer = 1 % -0 / n
   parse=[] outcome=success value=NaN isInt=false
@@ h9  let z = 0 / let n: integer = 1 % z / n
   parse=[] outcome=success value=NaN isInt=false
@@ h10 xs: array<integer> = [1 % 0] / xs[0]
   parse=[] outcome=success value=NaN isInt=false
@@ h11 [ctl] let n: integer = 5 % 3 / n
   parse=[] outcome=success value=2 isInt=true
```

h1, h2, h4 and h10 are `NaN` in an `integer`-annotated binding, an
`integer`-annotated `fn` parameter, an `integer`-declared schema field and an
`array<integer>` element. h3 and h11 show the runtime is not rounding — the
divergence is per-value, so the same source is correct for some divisors and
corrupt for others. h6 is the spec-correct annotation, which produces the
identical value: the runtime never differed. h7, h8 and h9 are the three
decidability-boundary rows, all `NaN`.

### (g) The committed corpus at HEAD

All 34 tracked `.theta` and `.thetalib` files, each through the real
`parseThetaDocument`, AST-walked for `{ kind: "binary", op: "%" }`:

```
@@ CORPUS TOTAL FILES :: 34 :: files with a '%' binary operator :: 0 (nodes 0) :: files with '/' :: 0
@@ hits :: []
```

**Measured GOV-15 blast radius against the committed corpus: zero.** No shipped
example, fixture or `.thetalib` uses `%` at all. This bounds the corpus half of
the sweep; it does not discharge GOV-15, because every §Reproduction row above
loads cleanly today and would refuse after a fix (§Fix (e)).

### (r) Registration, and the extension-layer collector

A planted `.pi/theta/` workspace loaded once through the shipped
`discoverAndComposeFixtures`. `cstr.theta` is a `mode: subagent` callee
declaring `params: x: string`; each `*int` stem is a caller passing one
expression to it.

```
@@ registered :: ["b152good","b152mod","cstr"]
@@ notifications :: ["cannot narrow number to integer",
                     "invoke argument 0 ('x') type mismatch: expected string, got number",
                     "invoke argument 0 ('x') type mismatch: expected string, got integer",
                     "invoke argument 0 ('x') type mismatch: expected string, got integer"]
@@ modint  invoke("./cstr.theta", 1 % 0)  ::  theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
@@ subint  invoke("./cstr.theta", 3 - 2)  ::  theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
@@ divint  invoke("./cstr.theta", 3 / 2)  ::  theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got number
```

`b152mod` is `let n: integer = 1 % 0`; it **registers**, beside the
spec-correct `b152good` (`let n: number = 1 % 0`). The `1.5` control
(`b152ctl`, `let n: integer = 1.5`) is dropped and supplies the single
`cannot narrow number to integer` notification. `modint` and `subint` render the
identical `<actual>`; `divint` renders `number` because bug 0142's §Fix (c)
mirror reaches `/` at this sink. The three callers are all dropped — the row is
`E` — so registration is measured on the `b152*` stems, not on them.

## Expected behaviour

**The sentence is written and carries its own reason.**
`docs/spec_topics/expressions.md:232`:

> `%` follows the same `integer ⊑ number` widening: two `integer` operands
> produce `integer`, and either operand being `number` widens the result to
> `number`. Division by zero produces IEEE-754 `Infinity` / `-Infinity` / `NaN`
> per JS semantics; it does not panic. Modulo by zero (`n % 0`) likewise
> produces `NaN` and does not panic; because `NaN` is a `number`, an
> `integer % 0` result widens to `number` — the same `integer ⊑ number` widening
> defined in [Type System — Type compatibility](./type-system.md#type-2)
> (TYPE-2).

The paragraph states a general rule and a value-keyed exception to it, in that
order, and the exception names its input class (`n % 0`) and its justification
(`NaN` is a `number`). The specific governs the general on the inputs it names.
The same paragraph's closing sentence depends on that reading: an `integer`-typed
result of `-`, `*`, `%` or unary `-` past the safe-integer bound "retains the
static `integer` type assigned by the operator's widening rule above rather than
widening to `number`" — a sentence that has work to do only because some `%`
results are not typed by the plain widening.

`typeOf(1 % 0)` is therefore `number`, and each measured row is owed the
diagnostic its control draws:

| row | owed | registered at |
|---|---|---|
| a1 | `theta/parse/fn-arg-type-mismatch`: `… expected integer, got number` | `code-registry-parse.md:116` |
| b1, b6 | `theta/parse/integer-narrowing`: `cannot narrow number to integer` | `:24` |
| a11 | `theta/parse/integer-narrowing` | `:46` routes it (`checkObjectFieldCompat`) |
| a9 | `theta/parse/integer-narrowing` + `theta/parse/array-element-type-mismatch` | `:24`, `:40` |
| a13 | `theta/parse/integer-narrowing` | `:24` |
| a17, a21 | the same codes they already draw, rendering `got number` | `:116`, `:54` |
| r/`modint` | `theta/parse/invoke-arg-type-mismatch` rendering `got number` | `:114` |

Every code is already registered, already emitted from the same call site on the
`1.5`-literal control, and already carries the exact *Message* a fix produces.
**No registry row is added, removed, or edited, and no *Trigger* changes.** Each
row's *Trigger* is written over the static type — `integer-narrowing` is
"`number` value used where `integer` is expected" (`:24`) — so the inputs are
inside the triggers as written and the implementation is what does not meet
them. DIAG-2 is not engaged.

**The deferral rule does not license the silence.** `type-system.md:48` skips a
check "when either side of a compatibility check is past the parser's static
view". For `1 % 0` both operands are numeric literals in the source text and the
operator is a token; nothing is past the parser's view. The pass answers
confidently and answers wrong, which is why no consumer takes the `"unknown"`
branch and why `provableArgType` calls it a proof (a17, a21).

**Which inputs the rule reaches is the open question, and it is a question about
the parser, not about the spec.** The spec sentence is about a *value*
(`n % 0`). The pass sees syntax. `1 % 0`, `0 % 0`, `1 % (0)` and `1 % 2 % 0`
carry a literal-`0` divisor node; `1 % -0` carries a unary-negation node;
`1 % (2 - 2)` carries an unfoldable expression; `let z = 0` + `1 % z` carries an
identifier. All seven produce `NaN` (h1, h5, h7, h8, h9, and b14's runtime
sibling). A fix decides how far down that list it reaches — §Fix.

**The runtime already implements the value half.**
`src/runtime/expression-evaluator.ts:524–526` comments "Modulo by zero is `NaN`,
not a panic (expressions.md §\"Other arithmetic\")" and returns the IEEE-754
remainder. The two phases agree about the value and disagree about its type, and
the phase that is wrong is the one that decides whether the theta loads.

## Actual behaviour / root cause

**One line, four operators, one rule.** `#typeBinary`
(`static-type-inference.ts:298–338`) tests `op` three times and then stops:

```ts
    if (left.kind === "null") {
      if (op === "!") { return { kind: "prim", name: "boolean" }; }
      if (op === "-") { return this.#typeExpr(right, env, bindings); }
    }
    // Comparison and logical operators statically produce a boolean.
    if (BOOLEAN_BINARY_OPS.has(op)) {
      return { kind: "prim", name: "boolean" };
    }
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

`BOOLEAN_BINARY_OPS` (`:369`) is the eight comparison and logical operators.
Everything else — `+`, `-`, `*`, `%` — reaches `#commonType`. The comment
describes the TYPE-2 widening accurately; the widening is the correct rule for
`+`, `-`, `*` and for `%` at every divisor except zero. **The `/` arm above it is
the shape the missing `%` arm would take, one difference apart: `/`'s test is on
`op` alone and `%`'s must also read `right`.** `right` is already in scope as a
parameter (`:301`) and is currently passed only to `#typeExpr`.

**`#commonType` returns an operand's own type object.** For `[litInt, litInt]`
its `find` (`:347`) succeeds on the first candidate, so `1 % 0` carries the type
of the literal `1` — `{ kind: "literal", typesAs: "integer" }` (t1). The
`literal` kind is not weaker than `prim` for any consumer measured here:
`checkCompatible` decides it through the same primitive relation
(`decidePrimitive`, `type-compat.ts:300`) and `classifyOperand`
(`type-layer-checks.ts:123–152`) classifies `literal` and `prim` identically as
`"numeric"`. The claim is load-bearing.

**Nothing downstream can recover.** `type-system.md:48`'s deferral is keyed on a
type the `TypeEnv` cannot resolve; `integer` resolves. So:

- `checkLetRhsCompat` (`type-compat.ts:403`) does not take its
  `integer-narrowing` arm (`:417–428`) — `checkCompatible(integer, integer)` is
  `compatible` and the function returns `[]` on the correct branch for an
  incorrect input (b1).
- `checkFnArgCompat` (`type-compat.ts:452`) likewise returns `[]` (a1).
- `checkObjectFieldCompat` (`:500`), the array-element sink (`:573–582`) and the
  `par for … max` gate (`type-layer-checks.ts:2023–2040`) each take the same
  branch (a11, a9, a13).

Every one of those functions is correct given its input. The single wrong value
is the input.

**The proof discipline agrees with the wrong rule by construction, and says so
in a message.** `provableArgType`'s arithmetic `binary` arm
(`type-layer-checks.ts:1739–1763`) reads the pass's reduction (`:1741`), requires
`isProvenReduction` (`:1742`, defined `:1886`) and admits a numeric reduction
(`:1761`). For `1 % 0` the operands are literals, whose arm states "A literal's
read IS its value's type" (`:1659–1664`), each is `⊑ integer`, and
`classifyOperand(integer)` is `"numeric"`. All three tests pass and the predicate
answers `integer`. Silence at an `integer` parameter is ambiguous between a proof
and a withhold; a17 removes the ambiguity by moving the parameter to `string`,
where the slot fires and interpolates `got integer` into the author-visible
message. a21 shows the same at the typed-`let` sink, which does not consult
`provableArgType` at all and reads the pass directly.

The arm's comment (`:1745–1755`) names the operator:

> `isProvenReduction` tests the reduction's EXACTNESS, not the operator's
> ADMISSIBILITY, so a same-typed pair of proven non-numeric operands passes it —
> and for `-`, `*`, `/`, `%` the result type is fixed by the operator:
> expressions.md §"Other arithmetic" gives those four `integer` or `number` for
> every input (NaN included, which is a `number`) …

The paragraph reaches the `NaN` clause and uses it in one direction only — to
WITHHOLD when the reduction is non-numeric — never to SUPPLY the widened type
when the reduction is numeric and the divisor is zero.

**The extension-layer sibling reaches the same answer by a different route, and
0142 already settled the corresponding question for `/`.**
`collectProvableArgTypes` (`invoke-static-checks.ts:505`) dispatches its `binary`
arm in `#typeBinary`'s own order and gained a `/` arm at `:551–563` returning
`[pass.typeOf(expr, env)]`. `%` falls past it to the arithmetic union
(`:564–572`), so a `%` expression's type set is the union of the operand sets —
`{integer}` for `1 % 0` — whatever `#typeBinary` answers. Measured
(§Reproduction (r)): `modint` renders `got integer`, byte-identical to the
`3 - 2` control, while `divint` renders `got number`. The arm's comment now
rests its safety argument on `%` specifically: `kindsDisjoint`
(`tool-call.ts:385`) reconciles `integer` and `number`, "so `%`'s `NaN` widening
(an `integer % 0` divisor, expressions.md §\"Other arithmetic\") cannot turn a
withheld verdict into a fired one". That is true today and is what keeps this
sink from misfiring; it is also the clause that stops being the operative bound
if the collector mirrors the rule (§Fix (c)).

**The runtime is uniform and correct.** Three implementations
(`statement-executor.ts:898–899`, `expression-evaluator.ts:524–526`,
`production-theta-producer.ts:6060–6061`), all plain IEEE-754 remainder, none
validating against an annotation. The value that arrives at an
`integer`-annotated position is whatever JS produced (h1–h10).

## Why it matters

- **`NaN` reaches an `integer`-annotated position with no diagnostic on any
  channel.** Four positions measured: a `let` binding (h1), a `fn` parameter
  (h2), a schema-constructor field (h4) and an `array<integer>` element (h10).
  The annotation is the author's declared constraint and it is not enforced in
  either phase.
- **The theta registers and runs**, measured through the shipped composition
  root rather than inferred: `let n: integer = 1 % 0` registers beside its
  spec-correct sibling while the `1.5` control is dropped (§Reproduction (r)).
  All missed codes are `E`, so `hasLoadParseError`
  (`production-composition.ts:2047`) has nothing to act on.
- **`NaN` is the one value in the language for which the widening is not a
  rounding concern but a kind change.** `Number.isInteger(NaN)` is `false` and
  every ordering comparison against it is `false`
  (`expressions.md` §"Ordering comparisons"), so an `integer`-annotated binding
  holding `NaN` fails the comparisons its annotation invites, silently.
- **The divergence is per-value, so it is not reproducible from the source
  alone.** `5 % 3` binds `2` and `1 % 0` binds `NaN` (h11 against h1) from the
  same static type at the same sink.
- **The type layer reports a proof, not a deferral, and prints it.**
  `provableArgType` exists to withhold where the read is not trustworthy. Here
  it certifies, and the certified type reaches an author-visible message as
  `got integer` (a17, a21) — a message asserting the type the spec calls
  `number`.
- **Two phases disagree about one sentence.** The runtime implements the value
  and comments the non-panic half; the inference pass implements neither half of
  the type rule. A reader of either half alone concludes the rule is
  implemented.
- **The current reading is pinned by a shipped witness, so the gap cannot close
  by accident.** `tests/division-result-type-number.test.ts` cells `t9`
  (`:756–767`) and `b8` (`:1131–1162`) assert the defective reading with
  messages saying the disposition was not taken. Anyone implementing the
  widening reds both and must retake the decision — which is what those cells
  are for, and what makes this report the place the decision is taken.

## Non-goals

- **`/`.** Bug [0142](./0142-division-result-type-not-number.md) owns it and is
  **fixed (0.80.0)**. `3 / 2` reads `{ kind: "prim", name: "number" }` at this
  HEAD (t7) and every `/` row measured here is a control, not a finding. A fix
  to this report does not touch `static-type-inference.ts:323–328`.
- **The non-zero `%` rows.** `3 % 2` reads `integer` and that is
  `expressions.md:232`'s answer (t2, b4, a4, a18, h3, h11). 0142's witness pins
  it as cell `t3`. A fix that moves any of them has widened past the carve-out.
- **`+`, `-`, `*`.** Bug
  [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) owns `+`, whose
  result type IS its operands' common type by `expressions.md`'s own `+` rule
  (`type-layer-checks.ts:1757–1760` records why). `-` and `*` carry the
  operand-common rule unconditionally. t8, t9, t10 are the pins.
- **`fn`-return-annotation checking.** `fn g(): integer { 1 % 0 }` is silent
  (a15), but so is `fn g(): integer { 1.5 }` (a16): no parse seam checks a `fn`
  body's tail against its return annotation for any initialiser form. That gap
  is measured here and not claimed here. A fix to this report leaves a15 silent.
  Bug 0142 measured the same pair for `/` (its cells c17 / c18 / h5) and reached
  the same conclusion.
- **The common-type reduction itself.** `#commonType`'s unknown-blessing and
  `?? candidates[0]` fallback belong to bug
  [0081](./0081-array-ternary-common-type-never-unions.md). This report adds a
  rule *ahead of* the call and changes nothing inside it.
- **The runtime.** All three `%` implementations match the spec, and
  `code-registry-runtime.md:43` puts modulo by zero deliberately outside the
  panic catalogue. No runtime change is in scope, and adding a runtime narrowing
  check at an annotated position is a different report (a spec silence: no
  sentence puts a runtime net at any of these positions, and
  `code-registry-parse.md:116` states its absence for one of them as intended).
- **The `literal` versus `prim` distinction in `CompatType`.** `1 % 0` carries a
  `literal` type because `#commonType` returns an operand's own object. Every
  consumer measured here treats `literal` and `prim` identically, so the
  distinction is not a defect and is not addressed. A fix returning
  `{ kind: "prim", name: "number" }` changes the raw shape with no observable
  consequence, as 0142's `t5` recorded for `/`.
- **The `1 % 0.0` and `1.0 % 0` rows.** Both already read `number` (t3, t4) —
  through the operand widening, not through the carve-out. They are controls
  that bound the defect and must not move.

## Fix

**Not settled. The rule is settled; its DECIDABILITY SCOPE is the adjudication
this report leaves to the run.** The shape is fixed by bug 0142's precedent:
`#typeBinary` gains a per-operator arm ahead of the common-type reduction,
between the `/` arm (`:323–328`) and the `#commonType` call (`:329`), returning
`{ kind: "prim", name: "number" }`. Unlike the `/` arm it must test an operand:

```ts
    // expressions.md §"Other arithmetic": `n % 0` is `NaN`, and because `NaN`
    // is a `number` an `integer % 0` result widens to `number`.
    if (op === "%" && <divisor is statically zero>(right)) {
      return { kind: "prim", name: "number" };
    }
```

The arm is unreachable for the synthetic-`null`-left unary shapes (`:311–318`) —
`%` has no unary form — and `%` is not in `BOOLEAN_BINARY_OPS` (`:369`).
`{ kind: "prim", name: "number" }` renders as `number` through `displayType`,
the token every measured control already produces, so each owed *Message* is
byte-identical to a string the tree emits today.

**(a) The route decision: what `<divisor is statically zero>` admits.** The
three routes are ordered by what they reach; each is a strict superset of the
one above. The fix takes one and states why, with both directions measured.

- **Route A — a literal-`0` divisor.** The test is on the divisor node: a
  `NumberExpr` (`theta-document.ts:129–133`) whose `numericType` is `"integer"`
  and whose `text` denotes zero. No new capability; the node is already a
  parameter of `#typeBinary`. Reaches t1, t5, t6, t13, t14, t15, t16, b1, b6,
  b12, b13, b14, a1, a6, a8, a9, a11, a13, a17, a21 and the runtime rows h1, h2,
  h4, h5, h10. **Leaves measurably silent:** `1 % -0`
  (t12, b11, h8 — the divisor is a `binary` negation node, not a literal),
  `1 % (2 - 2)` (t11, b7, h7) and the provably-zero binding (b8, b9, h9). Each
  binds `NaN` today and would continue to. The fix states that residual rather
  than leaving it to be discovered, and pins it with cells so a later route-B or
  route-C fix has a starting inventory. **Open sub-question this route must
  answer:** which `integer`-typed literal spellings denote zero. `0.0` and `0e0`
  are `numericType: "number"` and already widen through the reduction (t4), so
  the test ranges over `integer`-typed spellings only; whether the lexer admits
  any spelling other than `0` is a measurement the fix owes, and reading `text`
  versus `Number(text) === 0` is a decision it must state.
- **Route B — constant-folded zero divisors.** Adds a parse-time folder over
  literal arithmetic so `1 % (2 - 2)` reaches the arm. Reaches everything route A
  does plus t11 / b7 / h7. **Cost:** a folder is a new capability in the
  inference pass with its own correctness surface (overflow, `-0`, division
  results), it has no spec sentence requiring it, and it changes what "statically
  decidable" means for every other consumer that reads the pass. Nothing else in
  the tree folds constants today. If taken, `1 % -0` falls out of it as a
  side-effect, which is a reason to consider it and not a reason on its own.
- **Route C — provably-zero bindings.** Adds a value channel beside the type
  channel so `let z = 0` + `1 % z` reaches the arm (b8, b9, h9). **Cost:** the
  pass's `bindings` map is name → `CompatType`
  (`static-type-inference.ts:182–188`); there is no value channel, and adding one
  crosses into flow analysis (reassignment, loop variables, `match` arms). This
  is the route 0142's §Non-goals bullet named as the outer bound ("or a binding
  provably `0`"). It is enumerated here for completeness and its cost is not
  proportionate to the input class measured in (e).

**(b) The rows that must NOT move.** Each has a witness above:

- **`3 % 2` and every non-zero divisor keep the operand-common widening** — t2,
  b4, a4, a18, h3, h11, and bug 0142's own cell `t3`. This is the pin that a
  route which tests the operator rather than the divisor reds on.
- **`1.0 % 0` and `1 % 0.0` keep reading `number`** — t3, t4, b3, a3. They reach
  the answer through the reduction; an arm placed ahead of the reduction must
  return the same token for them, not a different one.
- **`+`, `-`, `*` are untouched** — t8, t9, t10, and §Non-goals.
- **`/` is untouched** — t7, a5, a19, a22, b10. Bug 0142's arm is not edited.
- **`type-system.md:48`'s deferral survives.** No row here involves an
  unresolvable operand, and route A adds no `TypeEnv` read.

**(c) Whether `collectProvableArgTypes` mirrors, in the same commit.** Bug
0142 settled the identical sub-decision for `/` as **MIRROR**, and its rationale
transfers: the function's header states that it "mirrors `#typeExpr` /
`#typeBinary` shape for shape, so a collected member can never render differently
from the type the pass itself assigns" (`invoke-static-checks.ts:495–499`), and
leaving the collector would falsify that invariant in the commit that creates the
divergence. Measured today, the divergence is observable
(§Reproduction (r): `modint` renders `got integer` where the pass would say
`number`). Two consequences the fix must carry if it mirrors:

- The mirror's shape is `[pass.typeOf(expr, env)]` for a zero-divisor `%`, the
  shape the `/` arm at `:551–563` already uses — this keeps one owner of the
  rule and avoids restating the divisor test in a second file. Placement is the
  same dispatch order: after the `/` arm, before `collectArmUnion` at `:572`.
- The arithmetic arm's comment (`:564–572`) currently justifies the
  over-approximation by naming `%`'s `NaN` widening as the case `kindsDisjoint`
  (`tool-call.ts:385`) reconciles. Once the zero-divisor case is collected
  exactly, that clause is about code the arm no longer reaches for that input and
  must be corrected in the same hunk — the same comment repair 0142 made when its
  `/` clause became false. If the fix does NOT mirror, the comment stays true and
  the two layers disagree about `1 % 0`; that disposition has to be stated in the
  comment too.

**(d) Two pinned cells to retake, in a witness another report shipped.**
`tests/division-result-type-number.test.ts` cell `t9` (`:756–767`) asserts
`1 % 0` reads `"integer|compatible"`, and the `b3, b4, b8, b9` cell
(`:1131–1162`) asserts `let n: integer = 1 % 0` produces `[]` — its `b8` row at
`:1139`. Both red on any route above. They are not defects and must not be
deleted: their comments record *why* the disposition was open, so the edit
replaces the pinned reading with the decided one and rewrites both messages to
name this report. The rest of that file — 43 cells — must stay green, which is
the proof the arm did not reach `/`, `-`, `*`, `+` or a non-zero `%`.
`tests/division-result-type-number-invoke.test.ts` (4 cells) is the companion the
collector mirror lands beside if §Fix (c) mirrors.

**(e) GOV-15.** The change makes currently-clean programs refuse, so it is an
ADDITION under the diagnostic-registry carve-out
(`source-language-stability.md:25`): "a code **addition** (DIAG-2) is in-scope
for inputs that did not previously emit the added code". Discharge by
measurement, not prediction:

- Re-run the committed-corpus sweep. Measured at this HEAD: 34 tracked
  `.theta` / `.thetalib` files, **zero** containing a `%` binary operator of any
  kind (§Reproduction (g)). Re-measure rather than cite; note bug
  [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — the
  committed-fixture parse gate filters `.theta` only, so the sweep is a scratch
  probe over `git ls-files -- '*.theta' '*.thetalib'`.
- No registry row is added, removed or edited, and no *Trigger* changes: every
  owed code is registered, `E`, and already emitted from the same call site on
  the `1.5` control. DIAG-2 is not engaged and DIAG-4's *Message* strings are
  unchanged. Confirm by blob hash on
  `docs/spec_topics/diagnostics/code-registry-parse.md` and both
  `docs/reference/` mirrors.
- `docs/reference/` states no operator result type
  (`grammar.md:129` is the literal-level rule; `:365` is precedence only), so no
  user-facing page changes.
- **One emission class the fix must measure in both directions and bound.** An
  arm placed ahead of the reduction returns before either operand is typed, so it
  answers `number` for a NON-NUMERIC left operand too: `"a" % 0` would read
  `number` where it reads `string` today. That is spec-correct — `"a" % 0`
  evaluates to `NaN` — and it mirrors the L1–L4 class bug 0142's fix discovered
  for `/` after its own §Fix failed to anticipate it. It is unmeasured at filing;
  the fix measures it at the direct sinks (typed `let`, schema field, array
  element) with `-` controls, rather than inheriting 0142's numbers.

**(f) Coordination.** Two surfaces, both named in (c) and (d):
`tests/division-result-type-number.test.ts` (edited, two cells) and
`tests/division-result-type-number-invoke.test.ts` (extended if the mirror
lands). Bug 0081's fix and this one compose without conflict (§Related); bug
0146's four withholding arms are disjoint from the `binary` arm and its witness
`tests/invoke-arg-type-mismatch-wired.test.ts` (40 cells) must stay unmoved, as
it did across 0142's mirror.

**Witness — offline, provider-free.** Every parse row settles inside one
`parseThetaDocument` call, every runtime row inside one `executeBody`, and every
registration row inside one `discoverAndComposeFixtures` load, so the harness is
`tests/division-result-type-number.test.ts` extended or a new file on its shape:
registry-sourced expected messages via `registryMessage` (DIAG-4), a loud
precondition per row so an absence cell cannot pass while measuring nothing.
Required rows: all of (t), so the one-answer-for-five-operators measurement is
pinned and a later edit cannot regress `+`, `-`, `*` or a non-zero `%`; b1–b14
and a1–a22 with their controls, including a17 and a21, which are the only rows
that separate a returned proof from a withhold and must therefore survive as the
rendering assertions `got integer` → `got number`; the runtime rows h1–h11,
because the parse-time refusal is the only defence and a witness pinning only the
diagnostic would not red if the refusal were later removed; the corpus sweep; and
the route's own residual rows (for route A: t12 / b11 / h8, t11 / b7 / h7,
b8 / b9 / h9) asserted as still-silent, so the scope taken is a measured fact
rather than an omission. One further row is owed that no group supplies: a
table-driven assertion over divisor spellings (`0`, `(0)`, `-0`, `2 - 2`, a
zero-valued binding, `0.0`) so the scope boundary is pinned from both sides. No
live tier applies: nothing on this path crosses a provider, and every observable
is determined inside one parse, one offline execution or one offline load.

## Provenance

- **Origin:** bug [0142](./0142-division-result-type-not-number.md)'s filing and
  fix. 0142 §Non-goals (`:722`) measured this neighbour — "`1 % 0` reads
  `{ kind: "literal", typesAs: "integer" }`, `let n: integer = 1 % 0` reports
  `[]`, and the runtime binds `NaN`" — and excluded it by name, stating the
  reason this report's §Kind restates: `/`'s rule is a constant function of the
  operator, `%`'s depends on the divisor's value. 0142's fix record
  (`.pi/tmp/fixes/0142-report.md`) confirms in its closing paragraph and in its
  pinned-dispositions list that the fix run "developed **no new evidence**
  changing its standing" and names the two cells that pin it (`t9`, `b8`).
- **What this report adds beyond that exclusion:** the raw-inference table across
  seven divisor spellings (t1, t5, t6, t11–t13, t16), which turns "decidable only
  for a literal `0`" from an assertion into a measured boundary; the four further
  silent sinks (`fn` argument, schema field, `array<integer>` element,
  `par for … max`) with their `1.5` controls; the two rows that prove the type
  layer returns a PROOF rather than withholding, and prints it (a17, a21) — the
  measurement 0142 made for `/` only by reasoning about `provableArgType`'s three
  tests; the ternary and index-element carriers (b12, b13); the runtime rows
  including `NaN` in four annotated positions; the registration outcome measured
  through the shipped composition root rather than inferred from
  `hasLoadParseError`; the `collectProvableArgTypes` measurement at the invoke
  sink showing the collector answers `integer` for `1 % 0` while it answers
  `number` for `3 / 2` post-0142; and the corpus sweep for `%`.
- **Evidence:** one scratch vitest file at `fb073780`, driving the shipped
  `parseThetaDocument`, `StaticTypeInferencePass.typeOf`, the production
  `executeBody` harness and `discoverAndComposeFixtures`; every cell of groups
  (t), (b), (a), (h), (g) and (r) measured and quoted verbatim above; written,
  run, deleted.
- **Spec, at `fb073780`:** `docs/spec_topics/expressions.md:230` (the *Other
  arithmetic* heading), `:232` (the general `%` widening, the `n % 0` carve-out,
  and the safe-integer sentence that presupposes it);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:43` (modulo by zero
  outside the panic catalogue); `docs/spec_topics/type-system.md:27` (the `⊑`
  check-site list), `:36` (TYPE-2), `:48` (*Unresolvable operands*), `:50`
  (TYPE-9); `docs/spec_topics/diagnostics/code-registry-parse.md:24`, `:40`,
  `:46`, `:54`, `:114`, `:116` (the six rows that do not fire, or fire with the
  wrong `<actual>`); `docs/spec_topics/diagnostics/diagnostic-shape.md:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out);
  `docs/reference/grammar.md:129` (the literal-level rule), `:365` (`%`'s
  precedence row); `docs/reference/diagnostics.md:267` and
  `docs/reference/errors-and-results.md:91` (the non-panic disposition, unchanged
  by a fix).
- **Implementation, at `fb073780`:** `src/parser/static-type-inference.ts:18–24`
  (the module header's posture), `:182–188` (the `typeOf` seam), `:224–225` (the
  `binary` dispatch), `:245–250` (the index-element narrowing), `:298–338`
  (`#typeBinary`; `:311–318` the unary shapes, `:319–322` the boolean set,
  `:323–328` bug 0142's `/` arm, `:329–337` the reduction `%` falls to), `:347`
  (`#commonType`), `:369` (`BOOLEAN_BINARY_OPS`);
  `src/parser/theta-document.ts:129–133` (`NumberExpr` carries text, not value),
  `:3578–3585` (parentheses are transparent), `:3513–3520` (the literal node);
  `src/parser/type-layer-checks.ts:123–152` (`classifyOperand`), `:925–926` (the
  `typeOf` delegate), `:947` / `:970` (the typed-`let` sink), `:1431` (the
  array-element sink), `:1548` (the object-field sink), `:1575` / `:1608` /
  `:1616` (`checkFnCallArgs`), `:1654` (`provableArgType`; its literal arm
  `:1659–1664`), `:1739–1763` (its arithmetic `binary` arm, with the comment
  naming `%` at `:1745–1755` and the `+` carve-out at `:1757–1760`), `:1886`
  (`isProvenReduction`), `:2023–2040` (the `par for … max` integer sink);
  `src/parser/type-compat.ts:300` (`decidePrimitive`), `:403` / `:417–428`
  (`checkLetRhsCompat`), `:452` (`checkFnArgCompat`), `:500`
  (`checkObjectFieldCompat`), `:573–582` (the array-element emission);
  `src/extension/invoke-static-checks.ts:495–499` (the shape-for-shape
  invariant), `:505` (`collectProvableArgTypes`), `:534–550` (the unary and
  boolean arms), `:551–563` (bug 0142's mirrored `/` arm), `:564–572` (the
  arithmetic arm whose comment now names `%`'s `NaN` widening);
  `src/runtime/tool-call.ts:385` (`kindsDisjoint`);
  `src/runtime/statement-executor.ts:882` / `:898–899`,
  `src/runtime/expression-evaluator.ts:490` / `:524–526`,
  `src/extension/production-theta-producer.ts:6025` / `:6060–6061` (the three `%`
  implementations); `src/extension/production-composition.ts:2047`
  (`hasLoadParseError`).
- **Coverage:** the static reading is pinned as the current (defective) one by
  `tests/division-result-type-number.test.ts:756–767` (cell `t9`) and
  `:1131–1162` (the `b3, b4, b8, b9` cell, `b8` row at `:1139`), both of which
  red on any fix here. The `%` runtime is covered and stays green:
  `tests/e2e-s1-runtime-values.test.ts:70–74`,
  `tests/expression-evaluator.test.ts:213–216`.
  `tests/fn-arg-type-mismatch-wired.test.ts:751` drives `g("6" % "2")` at an
  `n: number` parameter — a withheld row with no literal-zero divisor. No
  committed test asserts the static type of a `%`-by-zero expression as anything
  other than `integer`.
