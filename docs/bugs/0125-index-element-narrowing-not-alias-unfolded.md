# Bug 0125 — `#typeExpr`'s index-element derivation tests the raw target type, so an alias-typed array is admitted as an index receiver and then narrows to the sentinel `named "index"`: `schema L = array<string>` + `fn f(xs: L) { let y = xs[0]  y.frobnicate() }` reports nothing where the concrete-parameter control reports `unknown method 'frobnicate' on type string`, six registered error-severity codes stop firing on the element, and the erased `unknown-method` rejection reappears at runtime as `theta/runtime/internal-error` — the fourth site of bug 0089's TYPE-11 opacity, at a site its §Fix did not name

- **Status:** fixed (0.76.0). §Fix's code route is the one bug 0089 took at its
  three sites — apply the exported `unfoldAlias` before the `kind` test — and
  it shipped as written. §Fix (a) was adjudicated in run to disposition (1):
  the corpus gained the array-index result-type sentence, with its
  `docs/reference/grammar.md` mirror in the same commit. See §Fix (0.76.0).
- **Sev/Diff estimate:** S1/D2 — six registered error-severity codes stop
  firing on an alias-typed array's element, the theta registers, and measured
  at runtime a `number` reaches an `integer`-annotated binding (`1.5`) and
  `array<integer>.join(",")` returns `"1,2"` by JS coercion; D2 because the
  code route is one line in one file reusing the already-exported
  `unfoldAlias` with no registry row moving, and the single adjudication owed
  (whether the corpus must gain a sentence for the array-index result type)
  does not gate the code.
- **Kind:** defect, plus a documentation gap that bounds how it is stated.
  Defect: each of the six codes measured absent in §Reproduction (c) sits
  **inside** its own registered *Trigger* once TYPE-11 is applied —
  `docs/spec_topics/type-system.md:54` makes `L` declared `array<string>` the
  type `array<string>`, so the element read is a `string` and
  `docs/spec_topics/expressions.md:122` ("Anything not on this list is
  `theta/parse/unknown-method` **rather than a runtime failure**") is the
  disposition the implementation declines to deliver, measured instead as
  `theta/runtime/internal-error`. Gap: no sentence in
  `docs/spec_topics/expressions.md`, `docs/spec_topics/type-system.md`,
  `docs/reference/grammar.md` or `docs/reference/type-system.md` states the
  static result type of `arr[i]`. `expressions.md:10` states it for the
  **object** receiver only ("The static result type of `obj[k]` is the union of
  the receiver's declared field types"). The array case is left to the obvious
  reading of the `array<T>` constructor, which the implementation already
  applies at every non-alias spelling (§Reproduction (a) controls) — the alias
  spelling is the outlier. §Expected behaviour argues the reading; §Fix (a)
  decides whether the sentence is owed.
- **Two-part finding.** *Receiver admissibility* and *element narrowing* are
  separate code paths with opposite dispositions on the same input:
  - `classifyIndexReceiver` (`src/parser/type-compat.ts:366`) **does** unfold.
    Its `case "named"` arm (`:380–390`) resolves through the `TypeEnv` and
    recurses on the alias right-hand side at `:389`. Measured: `schema S =
    string` + `s[0]` reports `theta/parse/non-indexable-receiver`
    (§Reproduction (b1)), and `schema L = array<string>` + `xs[0]` is admitted
    (b3). Bug 0089's §Reproduction group (c) row 3 records the same, and its
    witness pins it (`tests/fn-param-alias-unfolded-at-gates.test.ts:587–601`,
    cell c3).
  - The *element narrowing* does **not** unfold.
    `src/parser/static-type-inference.ts:249` is
    `return target.kind === "array" ? target.element : { kind: "named", name: "index" }`
    over the raw `target` bound at `:248`. An alias-typed array therefore
    indexes legally at the first path and then types as the sentinel `named
    "index"` at the second, which no `TypeEnv` resolves, so every downstream
    check on the result defers.
- **Related:**
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **fixed
    (0.72.0)**, the parent, and the report this is a fourth site of. Its §Fix
    enumerated **three** unfolding sites and its fix shipped four: gate 1
    (`checkForIterand`, `src/parser/control-flow.ts:69–70`, which took a third
    `env: TypeEnv` parameter), gate 2's receiver and element (the `array.join`
    guard in `checkMethodCall`, `src/parser/type-layer-checks.ts:1427–1428` and
    the `checkArrayJoin` call at `:1437`), and the `par for` loop-variable
    element derivation in two files (`type-layer-checks.ts:1186–1194` and
    `static-type-inference.ts:275–279`). This report's site is the
    **index**-element derivation in the same `#typeExpr` switch as 0089's site
    3b, eight `case` arms above it, and is byte-unchanged by that diff. 0089's
    fix record names it as residual (i) with the measurement this report
    re-derives. Why it was missed is structural: 0089's §Fix enumerated sites
    by the *route* it was prosecuting (the `for` / `par for` iterand and the
    `array.join` receiver), and the index route reaches neither gate.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) —
    **fixed (0.55.0)**. It exported `unfoldAlias` (`type-compat.ts:155`) — the
    helper a fix here reuses — and closed the `let` route by recording the
    annotation in TYPE-11-transparent form (`type-layer-checks.ts:642`).
    Measured, that closure covers the index read too: `schema L =
    array<string>` + `let e: L = ["a"]` + `let y = e[0]` + `y.frobnicate()`
    reports `unknown-method` (§Reproduction (a3), (g1)). The alias-typed `fn`
    parameter, whose record stays raw at `type-layer-checks.ts:739`, is the
    remaining route — the same route 0089 prosecuted.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — **fixed (0.45.0)**.
    It established the three-way `TypeEnv` classification (`object-schema`,
    `alias`, head-only) that `unfoldAlias` (`type-compat.ts:155–172`) and
    `classifyIndexReceiver` both read. This report is about a consumption site
    that reads neither.
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
    — **fixed (0.48.0)**. Its §Affected enumerates the five `#typeExpr` arms
    that mint a `named` type "from an author-chosen name". The `named "index"`
    sentinel is a sixth `named` mint in the same switch whose name is
    **hard-coded**, which is what §Actual behaviour's sentinel-collision
    measurement turns on.
- **Affected** (every citation verified at HEAD `552b4ace`, 0.72.0):
  - **The defect site** — `src/parser/static-type-inference.ts:245–250`, the
    `case "index"` arm of `#typeExpr` (declared `:197`). `:248` binds `const
    target = this.#typeExpr(node.target, env, bindings)`; `:249` tests
    `target.kind === "array"` on that raw value and falls back to
    `{ kind: "named", name: "index" }`. No `unfoldAlias` call appears in the
    arm. `env` is a parameter of `#typeExpr` and is passed to the recursive
    call on the same line above, so the environment is in scope: the gap is the
    missing call, not an unavailable `TypeEnv`.
  - **The reach of that one line — both the whole-program pass and every
    type-layer check.** `static-type-inference.ts:182–188` is the public
    `typeOf(node, env, bindings)` seam, which is `#typeExpr` verbatim (`:187`);
    `:94` is the recording walk. `src/parser/type-layer-checks.ts:573–575`
    delegates the checker-side `typeOf` to it (`return this.pass.typeOf(expr,
    this.env, bindings)`). Every type-layer check that asks for the type of an
    index expression, or of a `let` binding whose initialiser is one, reads
    `:249`'s answer.
  - **The receiver path that does unfold** —
    `src/parser/type-compat.ts:366–392` (`classifyIndexReceiver`): `case
    "array"` `:371`, the `named` arm `:380–390`, the `undefined` →
    `"unknown"` bail at `:382–384`, the TYPE-10 `object-schema` arm at
    `:385–387`, and the alias recursion at `:389`. Its two callers:
    `checkIndexReceiver` (`src/runtime/expression-evaluator.ts:615–634`, the
    classify at `:621`, the emission at `:625–633`) and `checkObjectIndex`
    (`src/runtime/stdlib-object.ts:63–87`, the classify at `:70`). Both are
    reached from `checkIndex` (`src/parser/type-layer-checks.ts:1391–1410`,
    calls at `:1397` and `:1401`), which reads the receiver type through the
    same `typeOf` seam at `:1395`.
  - **The message renders the raw receiver deliberately.**
    `checkIndexReceiver`'s template interpolates
    `displayCompatType(receiverType)` (`expression-evaluator.ts:630–632`;
    `displayCompatType` at `:640`) — the un-unfolded value, which is why b1
    renders `got S`. This mirrors `pushUnknownMethod`'s raw render, which bug
    0089's fix kept deliberately. A fix here does not change it.
  - **The route in** — `walkFn`, `src/parser/type-layer-checks.ts:735–741`.
    `:739` sets the body scope entry to `annotationToCompatType(p.type) ??
    { kind: "named", name: p.type }`. `annotationToCompatType`
    (`:482–504`) returns `{ kind: "named", name: text }` for any
    non-primitive, non-`array<…>`, non-union source (`:503`), so `xs: L`
    records `named L` whatever `L` declares. Recording the declared type raw is
    correct and is not this report's subject (§Non-goals).
  - **The route that is closed** — `walkStmt`'s `case "let"`,
    `src/parser/type-layer-checks.ts:642`: `annotation === undefined ? rhsType
    : unfoldAlias(annotation, this.env)`. Bug 0083's record. Measured green for
    the index read (a3, g1).
  - **The three sibling sites bug 0089 fixed**, all now carrying an unfolded
    input, and the contrast that makes this report a residual:
    `src/parser/control-flow.ts:69–70` (`const type = unfoldAlias(iterand.type,
    env)` then `type.kind === "array"`; the `env` parameter at `:67`; the
    emission at `:74–80`); `src/parser/type-layer-checks.ts:1427–1428` and
    `:1437` (`unfoldAlias(targetType, this.env)`, the `join` guard, and
    `checkArrayJoin(unfoldAlias(unfoldedTarget.element, this.env), …)`);
    `src/parser/type-layer-checks.ts:1186–1194` and
    `src/parser/static-type-inference.ts:275–279` (the `par for`
    loop-variable element derivations, each unfolding the iterand at its own
    site).
  - **The helper to reuse, not fork** — `unfoldAlias`,
    `src/parser/type-compat.ts:155–172`: exported at `:155`, walks the alias
    chain while `current.kind === "named"` (`:164`, stepping at `:169`), and
    returns the `named` unchanged when the name is absent from the `TypeEnv` or
    its declaration is not an alias (`:166–167`). The header comment at
    `:147–154` states the two bounds a fix inherits: an object-schema `named`
    stays nominal (TYPE-10) and
    an unresolvable `named` stays `named` so the runtime AJV net applies. The
    comment at `:157–163` records that the walk terminates because
    `collectTypeEnv` omits a cycle-participating declaration.
  - **The three raw-`CompatType` siblings the sweep found, scoped out here** —
    `src/parser/type-layer-checks.ts:620` (`stmt.init.kind === "array" &&
    annotation.kind === "array"`, routing a typed array literal to the
    annotation's element sink at `:621`), `:952–962` (`sinkedArrayOf`, the same
    `annotation` value at `:958`, passed at `:626`), and `:1050` (`value.kind
    === "array" && declared.kind === "array"` for a constructor field, the sink
    call at `:1051`). All three decide *sink routing*, not narrowing, and all
    three test a raw `CompatType`. They diverge under an alias annotation —
    §Reproduction (f) measures it — and are a separate report (§Notes).
  - **The registration consequence, inverted.**
    `src/extension/production-composition.ts:2045–2052` (`hasLoadParseError`:
    any `error`-severity `theta/load/*` or `theta/parse/*` diagnostic) and
    `:2079`, `:2092` (`parseDiscoveredTheta` drops such a theta). All six
    erased codes are `E` (`docs/spec_topics/diagnostics/code-registry-parse.md`
    `:24`, `:34`, `:36`, `:43`, `:54`, `:63`), so where 0089's gate-1 defect
    made a legal theta fail to register, this defect makes an **illegal** theta
    register.
  - **The runtime it registers into.** `src/runtime/stdlib-string.ts:105` —
    the `evaluateStringMember` dispatcher's `default` arm throws
    `new Error("unknown string stdlib member: " + member)`, a plain `Error`,
    not a `ThetaPanic`. `src/runtime/runtime-panics.ts:496`
    (`surfaceUnexpectedThrow`) maps it onto the runtime-defect surface, which
    is `docs/spec_topics/errors-and-results/error-model.md:74`'s
    `theta/runtime/internal-error`. Measured in §Reproduction (e1).
    `src/runtime/stdlib-array.ts:63–67` — `join` is `receiver.join(args[0] as
    string)` with the comment at `:63–65` stating that the parse-time
    `checkArrayJoin` precondition "guarantees a `string` element type, so no
    implicit conversion happens here". `checkArrayJoin` itself is
    `:100–124` (the element test at `:107–109`, the emission at `:115–123`).
  - **The sentinel's render path** — `displayType`,
    `src/parser/type-compat.ts:318–333`: `case "named"` returns `type.name`
    verbatim (`:324–325`). That is how the internal string `index` reaches a
    DIAG-4 *Message*, measured in §Reproduction (d7)–(d9) and (d11).
  - `docs/spec_topics/type-system.md:54` — TYPE-11, quoted in §Expected
    behaviour. `:52` — TYPE-10, the bound.
  - `docs/spec_topics/expressions.md:10` — the *Indexed access* bullet: the
    receiver rule, the object-index key rule, and the **object**-receiver
    static-result-type sentence. `:101` — `string` is not indexable. `:108` —
    the `array<T>` `join` row ("Element type must be `string`; non-string
    element types are `theta/parse/non-string-array-join` (no implicit type
    conversion in theta 1.0)"). `:122` — "Anything not on this list is
    `theta/parse/unknown-method` rather than a runtime failure."
  - `docs/reference/grammar.md:337–341` — the user-facing mirror of the
    indexed-access rule: receiver kind and index key type, no result type.
    `docs/reference/type-system.md` states no index result type either
    (`rg -n 'indexed access|index expression' docs/reference/type-system.md` →
    no match).
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — every row this
    report cites, all `E`: `:24`
    (`theta/parse/integer-narrowing`), `:34`
    (`theta/parse/non-boolean-condition`), `:36`
    (`theta/parse/mixed-plus-operands`), `:38`
    (`theta/parse/non-indexable-receiver`, the receiver path that already
    works), `:39` (`theta/parse/non-string-object-index`, likewise), `:40`
    (`theta/parse/array-element-type-mismatch`), `:41`
    (`theta/parse/array-no-common-type`), `:43`
    (`theta/parse/non-string-array-join`), `:54`
    (`theta/parse/let-rhs-type-mismatch`), `:63`
    (`theta/parse/unknown-method`), `:64`
    (`theta/parse/non-array-iterand`), `:100`
    (`theta/parse/type-alias-cycle`), `:20`
    (`theta/parse/schema-case-mismatch`).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the
    registry is closed; a trigger change is a spec change landing in the same
    commit); `:74` — DIAG-4 (the *Message* column is normative).
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:13–21` — the
    `<type>` placeholder rule; `:19` renders "Named schemas, enums, and type
    aliases by their theta-side identifier (no wire-name translation; the
    identifier shape is fixed by [Lexical — Identifiers])".
    `docs/spec_topics/lexical.md:15` requires an uppercase first letter for
    every schema name, so the rendered `index` names no spellable theta type.
  - `docs/spec_topics/errors-and-results/error-model.md:74` — the
    runtime-defect surface and `theta/runtime/internal-error`.
  - **Test coverage of this defect: none.** The only index cell in bug 0089's
    36-row witness is c3
    (`tests/fn-param-alias-unfolded-at-gates.test.ts:587–601`), which drives
    the receiver path (`schema S = string` + `s[0]`) and asserts nothing about
    the element type. Bug 0083's witness
    (`tests/let-annotation-recorded-binding-type.test.ts`, 19 cells) drives no
    index expression. `rg -l 'schema [A-Z][A-Za-z]* = array<' tests/` returns
    seven committed files; none of them indexes an alias-typed array.
- **Observed at:** `0.72.0` (HEAD `552b4ace`). Offline, deterministic; no live
  model, no provider. Parse rows through the production `parseThetaDocument`
  over the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`); runtime
  rows through `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, the harness shape
  `tests/non-object-receiver-gate.test.ts:221–292` establishes, with a throw
  framed through `surfaceUnexpectedThrow`. Four scratch vitest files, run on
  the outputs quoted below, then deleted.

## Summary

`#typeExpr`'s `case "index"` arm narrows an index read to the target's element
type when the target's `CompatType` has `kind === "array"`, and otherwise
returns the sentinel `{ kind: "named", name: "index" }`
(`static-type-inference.ts:249`). The test is applied to the raw target type.
Under TYPE-11 a type-alias schema `schema L = array<string>` **is**
`array<string>`, but its `CompatType` is `named L`, so the test fails and the
element type is replaced by a name no `TypeEnv` resolves.

The receiver check does not make the same mistake. `classifyIndexReceiver`
resolves a `named` through the `TypeEnv` and recurses on the alias right-hand
side (`type-compat.ts:389`), so an alias-typed array is *admitted* as an index
receiver and an alias of a `string` is *rejected* — both measured. The two
halves therefore disagree: the expression passes admissibility and then loses
its type.

Because the sentinel is an unresolvable `named`, every downstream check defers
by design (`type-system.md:48`, *Unresolvable operands*). Measured on an
alias-typed `fn` parameter, six registered error-severity codes stop firing on
the element — `unknown-method`, `integer-narrowing`, `let-rhs-type-mismatch`,
`non-string-array-join`, `mixed-plus-operands`, `non-boolean-condition` — each
against a concrete-parameter control that emits it. All six are `E`, so where
bug 0089's gate-1 defect stopped a legal theta from registering, this one lets
an illegal theta register: measured, `xs[0].frobnicate()` on an alias-typed
`array<string>` parses clean and aborts at runtime with
`theta/runtime/internal-error: internal error: unknown string stdlib member:
frobnicate` — the runtime failure `expressions.md:122` says this input is not.
`array<integer>` joined through an alias returns `"1,2"`, the implicit
conversion `expressions.md:108` says theta 1.0 does not perform, and a
`number` reaches an `integer`-annotated binding and emerges as `1.5`.

This is bug 0089's residual (i): the identical TYPE-11 opacity at a fourth
site of the same shape, in the same `#typeExpr` switch as 0089's site 3b and
unchanged by its diff. 0089's §Fix enumerated its sites by the route it
prosecuted — the `for` / `par for` iterand and the `array.join` receiver — and
the index route reaches neither gate.

Bug 0089's round-2 sweep concluded that `static-type-inference.ts:249` was the
**only** remaining `CompatType` sibling of `kind === "array"`. Re-run at HEAD,
that conclusion is **correct for narrowing and wrong as stated**: three further
raw-`CompatType` tests survive at `type-layer-checks.ts:620`, `:958` and
`:1050`. They route an array literal to an element sink rather than narrowing
anything, and they diverge under an alias annotation — measured in
§Reproduction (f). They are a separate report; this report's site is the only
remaining raw-`CompatType` **narrowing** site.

## Reproduction

Offline, at `552b4ace`. Parse rows: the production `parseThetaDocument` through
`parseDoc` (`tests/helpers/e2e-s1.ts:39`), with `---\nmode: prompt\n---\n`
prepended and a trailing `1` supplying the theta's final value. `codes` is the
whole aggregated `diagnostics` code list, unfiltered. Runtime rows: the
production executor harness named in §Observed at.

### (a) The defect, and the controls that establish the element type is derivable

```
@@ a1  schema L = array<string> / fn f(xs: L) { let y = xs[0]  y.frobnicate() }
   codes :: []
@@ a2  fn f(xs: array<string>) { let y = xs[0]  y.frobnicate() }            [control]
   codes :: ["theta/parse/unknown-method"]
   msg   :: unknown method 'frobnicate' on type string
@@ a3  schema L = array<string> / let e: L = ["a"] / let y = e[0] / y.frobnicate()
   codes :: ["theta/parse/unknown-method"]                        [control — 0083]
   msg   :: unknown method 'frobnicate' on type string
@@ a4  schema M = array<string> / schema L = M / fn f(xs: L) { let y = xs[0]  y.frobnicate() }
   codes :: []
@@ a5  schema L = array<string> / fn f(xs: L) { xs[0].frobnicate() }
   codes :: []
@@ a6  fn f(xs: array<string>) { xs[0].frobnicate() }                      [control]
   codes :: ["theta/parse/unknown-method"]
   msg   :: unknown method 'frobnicate' on type string
```

a2 and a6 establish that the derivation works for a concrete `array<string>`
with and without an intervening `let`; a3 establishes that bug 0083's
transparent `let` record already covers the index read. a4 adds a nested alias
chain, which TYPE-11 requires to unfold.

### (b) The receiver check *does* unfold — the other half of the finding

```
@@ b1  schema S = string / fn f(s: S) { s[0] }
   codes :: ["theta/parse/non-indexable-receiver"]
   msg   :: indexed access requires an array<T> or object receiver; got S
@@ b2  fn f(s: string) { s[0] }                                            [control]
   codes :: ["theta/parse/non-indexable-receiver"]
   msg   :: indexed access requires an array<T> or object receiver; got string
@@ b3  schema L = array<string> / fn f(xs: L) { xs[0] }
   codes :: []
@@ b4  schema T = string / schema S = T / fn f(s: S) { s[0] }
   codes :: ["theta/parse/non-indexable-receiver"]
   msg   :: indexed access requires an array<T> or object receiver; got S
```

b1 is bug 0089's group (c) row 3 re-measured; b4 adds the nested chain. b3 is
the pivot: the machinery that resolves b1's `named S` to a `string` resolves
b3's `named L` to `array<string>` and *admits* it, and then a1/a5 show the
element type is lost anyway. The
message renders the receiver as declared (`got S`), which is
`expression-evaluator.ts:630`'s deliberate raw render.

### (c) Six registered error-severity codes stop firing on the element

Each row's alias case against its concrete-parameter control.

```
@@ c1  schema L = array<number> / fn f(xs: L) { let m: integer = xs[0]  m }
   codes :: []
@@ c2  fn f(xs: array<number>) { let m: integer = xs[0]  m }               [control]
   codes :: ["theta/parse/integer-narrowing"]
   msg   :: cannot narrow number to integer
@@ c3  schema L = array<array<integer>> / fn f(xs: L): string { xs[0].join(",") }
   codes :: []
@@ c4  fn f(xs: array<array<integer>>): string { xs[0].join(",") }         [control]
   codes :: ["theta/parse/non-string-array-join"]
   msg   :: array.join requires a string element type; got array<integer>
@@ c5  schema L = array<string> / fn f(xs: L): string { xs[0] + 1 }
   codes :: []
@@ c6  fn f(xs: array<string>): string { xs[0] + 1 }                       [control]
   codes :: ["theta/parse/mixed-plus-operands"]
   msg   :: '+' has mixed operand types: string and integer
@@ c7  schema L = array<string> / fn f(xs: L) { let m: integer = xs[0]  m }
   codes :: []
@@ c8  fn f(xs: array<string>) { let m: integer = xs[0]  m }               [control]
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msg   :: let binding 'm' initialiser type mismatch: expected integer, got string
@@ c9  schema L = array<string> / fn f(xs: L): integer { if xs[0] { 1 } else { 2 } }
   codes :: []
@@ c10 fn f(xs: array<string>): integer { if xs[0] { 1 } else { 2 } }      [control]
   codes :: ["theta/parse/non-boolean-condition"]
   msg   :: condition must be boolean; got string
@@ c11 schema L = array<array<string>> / fn f(xs: L) { let y = xs[0][0]  y.frobnicate() }
   codes :: []
@@ c12 fn f(xs: array<array<string>>) { let y = xs[0][0]  y.frobnicate() } [control]
   codes :: ["theta/parse/unknown-method"]
   msg   :: unknown method 'frobnicate' on type string
@@ c13 schema E = string / schema L = array<E> / fn f(xs: L) { let y = xs[0]  y.frobnicate() }
   codes :: []
@@ c14 schema E = string / fn f(xs: array<E>) { let y = xs[0]  y.frobnicate() }  [control]
   codes :: ["theta/parse/unknown-method"]
   msg   :: unknown method 'frobnicate' on type E
```

c11 shows the loss is not recovered by a second index: once the first read
types as the sentinel, the second falls into the same fallback. c14 is the
control that bounds the fix's depth — an alias *element* under a concrete
array already reports, because `classifyReceiver` unfolds internally and
`pushUnknownMethod` renders the declared name (bug 0089's fix). So a fix here
unfolds the *target*, not the element.

### (d) Bounds that must not move, and the sentinel's user-visible render

```
@@ d1  schema P { a: string } / fn f(p: P) { let y = p["a"]  y.frobnicate() }
   codes :: []
@@ d2  schema P { a: string } / schema Q = P / fn f(p: Q) { let y = p["a"]  y.frobnicate() }
   codes :: []
@@ d3  fn f(xs: Nope) { let y = xs[0]  y.frobnicate() }
   codes :: []
@@ d4  schema A = B / schema B = A / fn f(xs: A) { let y = xs[0]  y.frobnicate() }
   codes :: ["theta/parse/type-alias-cycle"]
   msg   :: type-alias cycle: A → B → A
@@ d5  schema P { a: string } / schema Q = P / fn f(p: Q) { p[0] }
   codes :: ["theta/parse/non-string-object-index"]
   msg   :: object index must be string; got integer
@@ d6  schema P { a: string } / fn f(p: P) { p[0] }                        [control]
   codes :: ["theta/parse/non-string-object-index"]
   msg   :: object index must be string; got integer
@@ d7  fn f(p: Nope) { for y in p[0] { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msg   :: 'for' expects array<T> after 'in'; got index
@@ d8  schema P { xs: array<string> } / fn f(p: P) { for y in p["xs"] { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msg   :: 'for' expects array<T> after 'in'; got index
@@ d9  schema L = array<string> / fn f(xs: L) { for y in xs[0] { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msg   :: 'for' expects array<T> after 'in'; got index
@@ d10 fn f(xs: array<string>) { for y in xs[0] { y } }                    [control]
   codes :: ["theta/parse/non-array-iterand"]
   msg   :: 'for' expects array<T> after 'in'; got string
@@ d11 schema L = array<array<string>> / fn f(xs: L) { par for y in xs[0] { y.frobnicate() } }
   codes :: ["theta/parse/non-array-iterand"]
   msg   :: 'for' expects array<T> after 'in'; got index
@@ d12 fn f(xs: array<array<string>>) { par for y in xs[0] { y.frobnicate() } }  [control]
   codes :: ["theta/parse/unknown-method"]
   msg   :: unknown method 'frobnicate' on type string
```

d3 and d4 are the dispositions a fix preserves: `unfoldAlias` leaves an
unresolvable `named` and a cycle participant (omitted from the `TypeEnv` by
`collectTypeEnv`) intact, so both keep deferring. d5/d6 confirm the object-index
key check is unaffected in either spelling.

d7–d9 measure a second, independent observable on the same line: the sentinel
name `index` reaches a DIAG-4 *Message* through `displayType`'s `case "named"`
(`type-compat.ts:324–325`). It is reachable with **no alias involved** (d7, d8),
so that half of the render is not this defect. What *is* this defect is d9
against d10: the same code with `got index` where the control renders `got
string`. d11 against d12 is the one row where the code itself flips — a legal
`par for` iterand is refused because the index read that supplies it lost its
type.

The sentinel is not spellable by a conformant schema:
`docs/spec_topics/lexical.md:15` requires an uppercase first letter, so
`schema index = …` is `theta/parse/schema-case-mismatch`. It is nonetheless
admitted to the `TypeEnv` in the same pass, so the collision is observable:

```
@@ d13 schema index = array<integer> / fn f(p: Nope): string { p[0].join(",") }
   codes :: ["theta/parse/schema-case-mismatch","theta/parse/non-string-array-join"]
   msg   :: array.join requires a string element type; got array<integer>
@@ d14 fn f(p: Nope): string { p[0].join(",") }                            [control]
   codes :: []
@@ d15 schema index = string / fn f(p: Nope) { let m: integer = p[0]  m }
   codes :: ["theta/parse/schema-case-mismatch","theta/parse/let-rhs-type-mismatch"]
   msg   :: let binding 'm' initialiser type mismatch: expected integer, got index
@@ d16 fn f(p: Nope) { let m: integer = p[0]  m }                          [control]
   codes :: []
```

The sentinel unfolds through the author's declaration and the fabricated type
drives real checks. Both rows also carry the `E`-severity
`schema-case-mismatch`, so neither theta registers — the collision is a
diagnostic-correctness observation, not a load hazard.

### (e) The runtime the registering theta reaches

Same harness, executed. `parse` is the pass's code list; `run` is
`executeBody`'s outcome, or the diagnostic `surfaceUnexpectedThrow` frames a
throw as.

```
@@ e1  schema L = array<string> / fn f(xs: L) { let y = xs[0]  y.frobnicate() } / let z = f(["a"]) / z
   parse :: []
   run   :: THREW panic=false
   diag  :: theta/runtime/internal-error :: internal error: unknown string stdlib member: frobnicate
@@ e2  fn f(xs: array<string>) { … same body … }                           [control]
   parse :: ["theta/parse/unknown-method"]
   (parse errors present — the theta would not register)
@@ e3  schema L = array<array<integer>> / fn f(xs: L): string { xs[0].join(",") } / let z = f([[1, 2]]) / z
   parse :: []
   run   :: outcome=success result={"present":true,"value":"1,2"}
@@ e4  fn f(xs: array<array<integer>>): string { … same body … }           [control]
   parse :: ["theta/parse/non-string-array-join"]
   (parse errors present — the theta would not register)
@@ e5  schema L = array<number> / fn f(xs: L) { let m: integer = xs[0]  m } / let z = f([1.5]) / z
   parse :: []
   run   :: outcome=success result={"present":true,"value":1.5}
```

e1 is the disposition `expressions.md:122` names as the one this input does
*not* get. e3 is the JS coercion `expressions.md:108` and
`stdlib-array.ts:63–65` both state does not happen. e5 is a `number` delivered
from an `integer`-annotated binding.

### (f) The sweep, re-run — and the three siblings it turns up

`rg -n 'kind === "array"' src/` at `552b4ace` returns **14** hits, the same
count bug 0089's round 2 recorded. Classified:

| Site | Value tested | Disposition |
| --- | --- | --- |
| `static-type-inference.ts:249` | raw `CompatType` (`#typeExpr` target) | **this report** |
| `type-layer-checks.ts:620` | raw `CompatType` (`let` annotation) | sink routing — diverges, see below |
| `type-layer-checks.ts:958` | raw `CompatType` (same annotation, `sinkedArrayOf`) | sink routing — diverges |
| `type-layer-checks.ts:1050` | raw `CompatType` (schema field's declared type) | sink routing — diverges |
| `control-flow.ts:70` | `unfoldAlias(iterand.type, env)` at `:69` | 0089 gate 1 |
| `type-layer-checks.ts:1428` | `unfoldAlias(targetType, this.env)` at `:1427` | 0089 gate 2 |
| `type-layer-checks.ts:1190` | `unfoldAlias(…)` at `:1186` | 0089 site 3a |
| `static-type-inference.ts:277` | `unfoldAlias(…)` at `:275` | 0089 site 3b |
| `type-compat.ts:212` | `decide`'s operands | unfolded by `checkCompatible` at `:144` and on every recursion (`:185`, `:199`, `:216`, `:236–237`) |
| `type-layer-checks.ts:620`, `:956`, `:1050` (the `stmt.init` / `value` conjunct) | `Expr` AST `kind` | not a type test |
| `statement-executor.ts:648`, `:978` | `Expr` AST `kind` | not a type test |
| `production-theta-producer.ts:5666` | `InterpolationType` (`interpolationTypeOf`, `:5760`) | not a `CompatType` |
| `type-layer-checks.ts:1184` | a comment | — |

`:620` and `:1050` each carry both conjuncts on one line and so appear twice;
`:956` is `sinkedArrayOf`'s `Expr` conjunct, whose `CompatType` conjunct is
`:958`. With those two counted once per conjunct the rows account for all
fourteen hit lines.

Three variants were swept so the inventory is not an artifact of one regex.
`rg -n 'kind !== "array"' src/` → three hits: `type-compat.ts:213` (inside
`decide`, unfolded), `theta-document.ts:1064` (`Expr` AST),
`query-schema-inference.ts:121` (`InferredSchema`, not a `CompatType`).
`rg -n 'case "array"' src/` → 34 hits; the `CompatType` switches among them
each carry their own `case "named"` arm (`classifyOperand`
`type-layer-checks.ts:131`, `classifyReceiver` `:172`, the name walker `:422`,
`displayType` `type-compat.ts:326`, `classifyIndexReceiver` `:371`), and the
rest switch over `Expr` AST nodes, lowered JSON-Schema fragments, or
`BuiltinReceiver` (`type-layer-checks.ts:200`).

**Correction to 0089's conclusion.** The three sink-routing sites are raw
`CompatType` tests and they diverge under an alias annotation:

```
@@ f1  schema U = array<string | integer> / let xs: U = ["a", 1]
   codes :: ["theta/parse/array-no-common-type"]
@@ f2  let xs: array<string | integer> = ["a", 1]                          [control]
   codes :: []
@@ f3  schema U = array<string> / let xs: U = ["a", 1]
   codes :: ["theta/parse/array-no-common-type"]
@@ f4  let xs: array<string> = ["a", 1]                                    [control]
   codes :: ["theta/parse/array-element-type-mismatch"]
   msg   :: array element type mismatch at index 1: expected string, got integer
@@ f5  schema U = array<string> / schema P { xs: U } / let p = P { xs: ["a", 1] }
   codes :: ["theta/parse/array-no-common-type"]
@@ f6  schema P { xs: array<string> } / let p = P { xs: ["a", 1] }          [control]
   codes :: ["theta/parse/array-element-type-mismatch"]
   msg   :: array element type mismatch at index 1: expected string, got integer
@@ f7  schema U = array<string> / let xs: U = []
   codes :: []
@@ f8  let xs: array<string> = []                                          [control]
   codes :: []
```

f1 against f2 is a **false** `E`-severity rejection of a spec-legal binding;
f3/f5 against f4/f6 are the wrong code for a real error. The mechanism is the
sink: with the raw-`CompatType` conjunct false (`annotation.kind` at `:620` /
`:958`, `declared.kind` at `:1050`), the element-sink calls at `:621` and
`:1051` are skipped and `walkExpr` runs the sink-less
`checkArrayLiteral(e, undefined, …)` (`:1101`). That is a distinct defect — routing, not narrowing — and belongs to
its own report (§Notes).

### (g) Routes that are *not* this defect

```
@@ g1  schema L = array<string> / let xs: L = ["a"] / let y = xs[0] / y.frobnicate()
   codes :: ["theta/parse/unknown-method"]
   msg   :: unknown method 'frobnicate' on type string
@@ g2  schema L = array<string> / fn g(): L { ["a"] } / let y = g()[0] / y.frobnicate()
   codes :: []
@@ g3  fn g(): array<string> { ["a"] } / let y = g()[0] / y.frobnicate()   [control]
   codes :: []
```

g1 confirms the `let` route is closed. g2 and g3 are identical, so the
`fn`-return route is out of reach of this defect for a different reason:
`#typeExpr`'s `case "call"` types a call as `{ kind: "named", name: callee }`
(`static-type-inference.ts:251–252`) and never consults the declared return
type, so the alias is not what is lost there. The measured route into this
defect is the alias-typed `fn` parameter's raw record
(`type-layer-checks.ts:739`) — the same route bug 0089 prosecuted.

## Expected behaviour

The anchor is `docs/spec_topics/type-system.md:54`:

> **TYPE-11.** Alias-schema transparency. A `NamedType` whose declaration is a
> type-alias schema `schema X = R` (the `=` form; see [Schema Declarations —
> Type-alias / union schema](./schemas.md#type-alias--union-schema)) is
> **transparent** in `⊑`: on whichever side of a `T₁ ⊑ T₂` check it appears, it
> is replaced by its right-hand side `R` and the check re-evaluated, recursing
> through nested aliases until a non-alias form is reached.

and its bound at `:52`:

> **TYPE-10.** Object-schema named types are nominal. A `NamedType` whose
> declaration is an object schema `schema X { ... }` … participates in `⊑` only
> through reflexivity against the same named schema, variant-to-union
> membership, and union widening / distribution.

**No sentence states the static result type of an array index.** The corpus
states it for the object receiver and no further. `docs/spec_topics/expressions.md:10`:

> The static result type of `obj[k]` is the union of the receiver's declared
> field types — the same element type [`values()`](#built-in-methods-and-properties)
> produces — applied uniformly regardless of the index; an author wanting the
> per-field declared type uses member access (`obj.fieldName`).

That bullet's array clauses cover the receiver kind ("the receiver `a` must be
an `array<T>` or an object value"), the index key type, the theta-side name
rule, and the two runtime panics — not the result type.
`docs/reference/grammar.md:337–341` mirrors the same three rules and no result
type. `docs/reference/type-system.md` mentions no index expression at all.
`docs/spec_topics/type-system.md` names no index site among its compatibility
check sites. **The array-index result type is a spec silence**, and stating
that is part of this report's deliverable.

The silence does not make the measured behaviour admissible, for three
reasons that do not depend on the missing sentence.

1. **Each erased code sits inside its own registered *Trigger*.** Under
   TYPE-11, `L` declared `array<string>` is `array<string>`; its element type
   is `string` by the `array<T>` constructor. So in a1, `frobnicate` is a
   method "accessed on a built-in type that the theta 1.0 stdlib does not
   expose" (`code-registry-parse.md:63`) and `expressions.md:122` states the
   disposition without qualification: "Anything not on this list is
   `theta/parse/unknown-method` **rather than a runtime failure**." Measured,
   the parse is clean and the runtime failure is what arrives (e1). The same
   argument runs for `:24`, `:34`, `:36`, `:43` and `:54` against c1–c10.
2. **The implementation already commits to the reading at every other
   spelling.** a2, a6, c2, c4, c6, c8, c10, c12 and c14 all narrow the index
   read to the element type; a3 and g1 do so through bug 0083's transparent
   `let` record, and that behaviour is pinned by a committed witness
   (`tests/let-annotation-recorded-binding-type.test.ts`, held byte-unchanged
   by 0089's fix). The alias-typed `fn` parameter is the single spelling that
   differs, with no sentence distinguishing it — which is the same structure
   bug 0089 prosecuted ("two of six classifiers").
3. **The object-receiver analogue is specified in the same bullet and the
   parallel is exact.** `expressions.md:10` derives the object result type
   from the receiver's declared shape. Reading the array case as *not*
   deriving from the receiver's declared element type requires the silence to
   carry a meaning opposite to the one sentence that is written.

On the measured input, therefore:

- `xs[0]` where `xs: L` and `schema L = array<string>` has static type
  `string`, and a1, a4, a5 report `theta/parse/unknown-method` with the message
  the control produces (`unknown method 'frobnicate' on type string`).
- c1–c10 report the code their control reports, with the control's message.
- c11's `xs[0][0]` narrows twice; c13's `array<E>` element narrows to `E`, at
  which point `classifyReceiver`'s own unfolding takes over and the render
  names the declared element, exactly as c14 measures today.
- d9 keeps `theta/parse/non-array-iterand` and its message becomes `got
  string`, which is `code-registry-parse.md:64`'s `got <type>` template under
  TYPE-11 — the same message move bug 0089's fix already made at gate 1.
  d11's code changes to `theta/parse/unknown-method`, matching d12.
- TYPE-10 holds: d1, d2 and d5, d6 are unchanged. An object-schema `named` and
  an alias of one keep their present dispositions.
- `type-system.md:48` (*Unresolvable operands*) holds: d3 and d4 stay silent.
- No new code and no new registry row. All six codes exist and each is
  restored to a receiver its registered trigger already covers.

## Actual behaviour / root cause

**One line decides, on the wrong value.**
`src/parser/static-type-inference.ts:245–250`:

```ts
      case "index": {
        // An element read narrows to the target's element type when the target
        // is statically an array; otherwise it is an unresolved reference.
        const target = this.#typeExpr(node.target, env, bindings);
        return target.kind === "array" ? target.element : { kind: "named", name: "index" };
      }
```

`target` is whatever the target expression's own arm produced. For an
alias-typed `fn` parameter that is `named L`, because `walkFn` records the
declared annotation raw (`type-layer-checks.ts:739`) and
`annotationToCompatType` maps any non-primitive, non-`array<…>`, non-union
source to `{ kind: "named", name: text }` (`:503`). `named L` is not `array`,
so the ternary takes its else arm.

**The else arm is a sentinel, not an approximation.** `{ kind: "named", name:
"index" }` names no declaration. Every consumer that resolves a `named`
through the `TypeEnv` finds nothing and defers — which is the correct posture
for a genuinely unresolvable operand (`type-system.md:48`) and the wrong
posture here, because the type *is* resolvable: it is the alias's element type.
The fallback converts a known type into an unknown one, and the deferral that
follows is by design at every downstream site.

**Admissibility and narrowing disagree.** The two paths read the same receiver
type and take opposite decisions on it:

| Path | Site | Alias handling |
| --- | --- | --- |
| Receiver admissibility | `classifyIndexReceiver`, `type-compat.ts:366`, `named` arm `:380–390`, recursion `:389` | resolves through the `TypeEnv`, recurses on the RHS (TYPE-11) |
| Element narrowing | `#typeExpr` `case "index"`, `static-type-inference.ts:249` | tests `kind` on the raw value |

So b3's `xs[0]` passes the gate that would have caught a non-array receiver,
and then a1/a5 lose the element type that gate had already resolved. The `env`
needed for the second decision is a parameter of the enclosing `#typeExpr` and
is passed to the recursive call on line `:248`.

**One line, two consumers.** `#typeExpr` is reached through the public
`typeOf(node, env, bindings)` seam (`static-type-inference.ts:182–188`), which
the whole-program recording walk uses (`:94`) and which
`type-layer-checks.ts:573–575` delegates the checker-side `typeOf` to. Every
row of §Reproduction (c) is a different checker asking that one seam for the
type of an index read, or for the type of a `let` binding whose initialiser is
one, and getting the sentinel.

**The six erased checks are each unreachable for the same reason.** Measured:
`checkMethodCall`'s A2 allow-list needs a concrete built-in receiver (a1, a4,
a5, c11, c13; the controls a2, a6, c12, c14 show it firing);
`checkCompatible` answers `"unknown"` for an unresolvable operand
(`type-compat.ts:177–178`), so
`checkLetRhsCompat`'s TYPE-9 route and its `integer-narrowing` arm both defer
(c1, c7); `checkPlusOperands` classifies an unresolvable operand `"unknown"`
(c5); the condition check likewise (c9); and gate 2's `join` guard requires
`unfoldedTarget.kind === "array"` (`type-layer-checks.ts:1428`) — `unfoldAlias`
returns the sentinel unchanged, so c3 never reaches `checkArrayJoin`. Bug 0089
unfolded that guard's input; it cannot help when the input is a fabricated
name rather than an alias.

**Direction of failure is uniform: defer.** The sentinel is an unresolvable
`named`, and every one of these sites treats an unresolvable operand as
"skip". So unlike bug 0089 — where gate 1 rejected and gate 2 deferred — this
defect has a single direction, and it is the silent one. The one exception is
d11, where the *iterand* gate admits only `kind === "array"` and therefore
rejects: a legal `par for` is refused because its iterand lost its type.

**The theta registers.** `hasLoadParseError`
(`production-composition.ts:2045–2052`) drops a theta carrying any
`error`-severity `theta/parse/*` diagnostic, and `parseDiscoveredTheta` applies
it at `:2092`. With no diagnostic emitted, nothing is dropped. Measured (e1),
the erased `unknown-method` reappears as a throw from
`evaluateStringMember`'s `default` arm (`stdlib-string.ts:105`), a plain
`Error`, which `surfaceUnexpectedThrow` (`runtime-panics.ts:496`) frames onto
the runtime-defect surface as `theta/runtime/internal-error` with the internal
string in its message. e3 and e5 do not even fail: the join coerces
(`stdlib-array.ts:67`, against the precondition its own comment at `:63–65`
asserts) and the `number` flows out of an `integer`-annotated binding.

**The sentinel is also a render leak, and that half is wider than this
defect.** `displayType`'s `case "named"` returns `type.name` verbatim
(`type-compat.ts:324–325`), so `index` reaches a DIAG-4 *Message* whenever the
fallback's value is rendered. `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19`
requires `<type>` to render a named schema, enum or alias "by their theta-side
identifier", whose shape `docs/spec_topics/lexical.md:15` fixes as
uppercase-initial. `index` is not one. Measured, `got index` is reachable with
no alias present (d7 unresolvable receiver, d8 object-schema receiver), so
closing the alias half leaves it reachable — see §Fix (b).

**The sentinel collides with a declaration that spells it.** `schema index =
array<integer>` is refused by `theta/parse/schema-case-mismatch`
(`code-registry-parse.md:20`, `lexical.md:15`) but still enters the `TypeEnv`,
so the fabricated name unfolds through the author's declaration: d13 draws a
`non-string-array-join` where the control (d14) draws nothing, and d15 draws a
`let-rhs-type-mismatch` where d16 draws nothing. Both rows also carry the
`E`-severity `schema-case-mismatch`, so no such theta registers; this is a
diagnostic-correctness observation bounding a fix's design space, not a load
hazard.

**Why 0089 missed it.** 0089's §Fix enumerated three sites, and its fix
shipped four, by the two routes it was prosecuting: the `for` / `par for`
iterand admissibility gate and the `array.join` receiver. An index read
reaches neither. Its round-1 review found the fourth site by *neutralising*
the receiver unfold and observing a new false emission — a technique that
finds sites downstream of the ones being changed, not sites in a disjoint
expression arm. Its round-2 sweep did look for siblings by regex and reached
this line, recording it as residual (i) rather than folding it in, on the
stated ground that it was outside the settled §Fix.

## Why it matters

- **Six error-severity codes stop firing on a production path.** Measured
  §Reproduction (c): `unknown-method`, `integer-narrowing`,
  `let-rhs-type-mismatch`, `non-string-array-join`, `mixed-plus-operands`,
  `non-boolean-condition`. Each is `E`
  (`code-registry-parse.md:63`, `:24`, `:54`, `:43`, `:36`, `:34`), and each
  has a concrete-parameter control that emits it on the same body. The author
  loses every static check on the element of an alias-typed array.
- **The theta registers and reaches the runtime.** `hasLoadParseError`
  (`production-composition.ts:2045–2052`) has nothing to act on, so the
  slash command is installed. Measured, the erased `unknown-method` becomes
  `theta/runtime/internal-error: internal error: unknown string stdlib member:
  frobnicate` (e1) — a runtime-defect-surface code carrying an internal string,
  arriving on a session channel rather than at the offending source span, and
  precisely the outcome `expressions.md:122` says this input does not get.
- **Two rows do not fail at all — values are corrupted instead.** e3 returns
  `"1,2"` from `array<integer>.join(",")`, the implicit conversion
  `expressions.md:108` says theta 1.0 does not perform and
  `stdlib-array.ts:63–65` asserts cannot reach it. e5 delivers `1.5` from an
  `integer`-annotated binding. Both are silent successes.
- **The failure is position-dependent, so no rule the author can apply.** The
  same `schema L = array<string>` resolves correctly as an index *receiver*
  (b3), as an iterand and a `join` receiver since bug 0089, and through a `let`
  binding since bug 0083 (a3, g1) — and loses its element type only at the
  `fn`-parameter index read (a1). Nothing in the diagnostics distinguishes
  the cases, because in the failing case there are none.
- **The repair the author will reach for is to stop using the feature.** The
  only local workaround is to write `array<string>` in the signature instead of
  `L`, i.e. to abandon the type-alias schema TYPE-11 defines — the same
  incentive bug 0089 recorded for its gate 1.
- **A legal `par for` is refused.** d11 against d12: the iterand gate admits
  only `kind === "array"`, so the sentinel is rejected and an
  `E`-severity `theta/parse/non-array-iterand` stops a spec-legal theta from
  registering. This defect is not purely permissive.
- **A user-facing message names a type that cannot exist.** `got index`
  (d7–d9, d11) violates `placeholder-rendering-a.md:19` read with
  `lexical.md:15`. The alias half of it (d9's `got index` where d10 renders
  `got string`) is this defect's.
- **Nothing in the suite scores it.** No committed test indexes an
  alias-typed array. Bug 0089's 36-row witness reaches the index expression
  once, at the receiver check (cell c3), and asserts nothing about the
  element.
- **The class is bounded, and the boundary is now measured.** §Reproduction (f)
  is the completeness argument: one remaining raw-`CompatType` narrowing site,
  plus three sink-routing siblings with their own measured divergence. Fixing
  this line does not leave an open-ended class behind.

## Non-goals

- **`walkFn`'s raw parameter record** (`type-layer-checks.ts:739`). Recording
  the declared type is correct, and bug 0089 rejected unfolding there in terms:
  the consumers that misread the record are the fault, and every route into
  them is covered by fixing the consumer. Reproduction (b3) is the proof that
  the record resolves fine when a consumer resolves it.
- **The object-receiver arm of the same line.** d1, d2 and d8 measure that an
  object receiver also falls to `named "index"`, with no alias involved, so
  `expressions.md:10`'s specified object result type ("the union of the
  receiver's declared field types") is not implemented at all. That is a
  *specified* obligation unmet, where this report's array case is a silence; it
  is reached by a disjoint input class (no alias, any object receiver) and is
  its own report. A fix here must not accidentally change d1/d2 — §Fix (c).
- **The three sink-routing siblings** (`type-layer-checks.ts:620`, `:958`,
  `:1050`), measured diverging in §Reproduction (f). Same TYPE-11 shape,
  different consequence (which of two array-literal checks runs), different
  file, and one of the two codes involved is a *false* rejection rather than a
  missing one. Named here because bounding the class is this report's
  deliverable; adjudicated elsewhere (§Notes).
- **The `named "index"` render leak's non-alias reach.** d7 and d8 are
  reachable with no alias, so they survive this fix and belong with the
  sentinel's disposition (§Fix (b)) or with the object-receiver report.
- **The `fn`-return route.** g2 and g3 are identical, so nothing about aliases
  is lost there: `#typeExpr`'s `case "call"`
  (`static-type-inference.ts:251–252`) types a call by its callee name and
  never reads the declared return type. A separate gap, untouched either way.
- **The caller side of the `fn` boundary.**
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s
  subject (`checkFnArgCompat` has no `src/` caller). Unaffected in both
  directions, as bug 0089 recorded.
- **The unresolvable-`named` and cycle-participant dispositions** (d3, d4).
  `unfoldAlias` leaves both intact; both keep deferring.
- **`theta/runtime/internal-error`'s own behaviour.** e1's framing is correct
  for an unexpected throw (`error-model.md:74`). The defect is that the input
  reaches it.

## Fix

**The code route is bug 0089's, applied a fourth time**: compute
`unfoldAlias(target, env)` at `src/parser/static-type-inference.ts:248–249` and
test the unfolded value's `kind`, returning its `element`. `env` is already a
parameter of `#typeExpr` and `unfoldAlias` is already imported into the file
(`static-type-inference.ts:30`). One line, one file, no new export, no new
code, no registry row.

**What is not settled** is what the else arm is *required* to be, and that has
to be pinned before the line changes, because the fix narrows the else arm's
input class without deciding its contents. Four questions; (a) is the one that
gates the corpus.

**(a) Does the corpus owe a sentence for the array-index result type?**
Measured above: no sentence states it. `expressions.md:10` states the object
case; the array clauses of the same bullet stop at the receiver kind and the
index key type. Two dispositions:

1. **Add the sentence** to `expressions.md:10`, beside the `obj[k]` sentence:
   the static result type of `arr[i]` is the receiver's element type, TYPE-11
   applying to the receiver as everywhere else. This makes this report a
   defect against a written rule and gives the witness a citation for every
   row of §Reproduction (a) and (c). Cost: a spec edit and its
   `docs/reference/grammar.md:337–341` mirror. DIAG-2
   (`diagnostic-shape.md:72`) is not engaged — no code, severity or *Trigger*
   moves — but the same-commit rule for spec edits applies.
2. **Leave the silence** and rest the fix on §Expected behaviour's three
   arguments: the erased codes sit inside their own registered triggers, the
   implementation already commits to the reading at every other spelling, and
   the object analogue in the same bullet forecloses the opposite reading.
   Cost: the witness's message assertions cite the registry rows rather than a
   rule page, which DIAG-4 requires anyway.

Disposition (1) is better supported on the same ground bug 0113's Reading A
rested on: the sentence that *is* written derives the result type from the
receiver's declared shape, and reading the neighbouring silence as licence for
a fabricated type makes that sentence an exception rather than an instance.
This report does not decide it — the fixer does, in run, and records which.

**(b) What becomes of the `named "index"` sentinel?** Unfolding removes the
alias input class from the else arm and leaves the arm reachable — measured d7
(unresolvable receiver) and d8 (object receiver). Three constraints on
whatever the arm keeps:

- It must keep **deferring** for an unresolvable receiver: d3, and the d14/d16
  controls, are the pins, and `type-system.md:48` is the rule.
- Its rendered form reaches a DIAG-4 *Message* through `displayType`
  (`type-compat.ts:324–325`), and `index` satisfies neither
  `placeholder-rendering-a.md:19` nor `lexical.md:15`. Fixing the render is not
  required by this report and is not forbidden by it; a fix that leaves `got
  index` reachable must say so, because d7/d8 will still produce it.
- It must not become a name an author can declare. d13 and d15 measure the
  present collision (`schema index = …` enters the `TypeEnv` despite
  `theta/parse/schema-case-mismatch`), so a replacement sentinel that is
  lowercase-initial inherits the same exposure and one that is
  uppercase-initial makes it *spellable*. Neither theta registers today, so
  this bounds the design rather than blocking it.

**(c) The object-receiver arm must not move.** d1, d2 and d5, d6 are the pins.
`unfoldAlias` returns an object-schema `named` unchanged (TYPE-10,
`type-compat.ts:147–154`), so an alias of an object schema still fails the
`kind === "array"` test and still falls to the else arm — which is what d2
already measures. A fix that instead reached for `classifyIndexReceiver`'s
three-way answer would pull `expressions.md:10`'s unimplemented object result
type into scope; that is the separate report named in §Non-goals, and this line
must not be the place it lands by accident.

**(d) The three sink-routing siblings are a separate change.** §Reproduction
(f) measures them diverging, and one of their two divergences is a *false*
`E`-severity rejection of a legal binding (f1 against f2), which is a sharper
symptom than this report's. They are in `type-layer-checks.ts`, a file this
fix does not touch, so the two changes are independent — but a fixer here must
not fold them in silently, because f1's disposition needs its own reading of
the `array<T>` literal type-sink rule (`docs/reference/grammar.md:400–407`).

**Constraints any fix must satisfy**, each with a witness row above:

- **`unfoldAlias` is reused, not forked.** It is exported at
  `src/parser/type-compat.ts:155` and is the single construction point bug
  0089's four sites and bug 0083's `let` record all share
  (`control-flow.ts:69`, `type-layer-checks.ts:642`, `:1186`, `:1427`, `:1437`,
  `static-type-inference.ts:275`). A second unfolding helper would give TYPE-11
  two implementations.
- **TYPE-10 holds.** An object-schema `named` and an alias of one stay
  non-narrowing and keep their present dispositions: d1, d2, d5, d6. This holds
  by `unfoldAlias`'s construction, and must be asserted, not assumed.
- **An unresolvable `named` keeps its disposition** (d3, and the d14/d16
  controls), and **a type-alias-cycle participant** keeps its (d4).
  `collectTypeEnv` omits a cycle-participating declaration, so
  `unfoldAlias` leaves it intact and it behaves as an unresolvable name — the
  same bound bug 0089's group (e) row 5 pinned.
- **Nested alias chains unfold** (a4), which TYPE-11 states in terms
  ("recursing through nested aliases until a non-alias form is reached").
- **The element is not unfolded here.** c13 must report; c14 shows the
  concrete-array spelling already does, with the declared element name in the
  message (`on type E`), because `classifyReceiver` unfolds internally and
  `pushUnknownMethod` renders the raw type. Unfolding the *element* at this
  line would change c14's message and is not this fix.
- **Bug 0089's witness stays green.**
  `tests/fn-param-alias-unfolded-at-gates.test.ts` → 36/36 at HEAD; its cell c3
  (`:587–601`) asserts the exact code list and message for the receiver path
  this fix does not touch.
- **Bug 0083's witness stays green and byte-unchanged.**
  `tests/let-annotation-recorded-binding-type.test.ts` → 19/19 at HEAD. a3 and
  g1 re-assert the `let` route from this report's side, so the two routes reach
  the same answer by different means, as they do for the iterand and join
  gates after 0089.
- **The deliberate message move is d9.** `got index` becomes `got string`, the
  same class of change bug 0089 shipped for its gate 1 (`got S` → `got
  string`), and `code-registry-parse.md:64`'s `got <type>` template is what
  requires it under TYPE-11. `rg -n 'got index' tests/ docs/ src/` at
  `552b4ace` returns **no match**, so no committed fixture or registry row
  asserts the sentinel form. d11's code list moves to match d12.
- **No DIAG-2 change is expected, and the expectation is verified.** The fix
  removes fabricated types and restores emissions; it adds no site. Every code
  it makes reachable again is registered and its *Trigger* already covers the
  receiver: `theta/parse/unknown-method` (`code-registry-parse.md:63`),
  `theta/parse/integer-narrowing` (`:24`), `theta/parse/let-rhs-type-mismatch`
  (`:54`), `theta/parse/non-string-array-join` (`:43`),
  `theta/parse/mixed-plus-operands` (`:36`),
  `theta/parse/non-boolean-condition` (`:34`). One code becomes *un*reachable
  for one input class — `theta/parse/non-array-iterand` (`:64`) at d11, whose
  registered trigger is "`for x in expr` where `expr` is not `array<T>`" and
  whose emission there is therefore outside its own trigger today, the same
  fault bug 0089 prosecuted at gate 1. `docs/reference/diagnostics.md` carries
  no *Trigger* column, so no mirror edit follows from the codes. The only spec
  edit in play is (a)'s optional sentence, which touches no registry row.
- **One line, both consumers — no per-consumer split.** Unlike bug 0089's sites
  3a and 3b, which were two separate `kind === "array"` tests in two files,
  this is one line read through the public `typeOf` seam
  (`static-type-inference.ts:182–188`) by both the recording walk (`:94`) and
  the checker-side delegation (`type-layer-checks.ts:573–575`). One unfold
  serves both. A witness row driving the recorded-types channel — the `par for`
  value's `Result<U, QueryError>` payload render, the channel bug 0089's group
  (s) used for its site 3b — is worth adding for coverage, but it is not a
  second site and a fix that omits it is not incomplete.

**Witness — offline, provider-free.** Every parse row settles inside one
`parseThetaDocument` call over `parseDoc` (`tests/helpers/e2e-s1.ts:39`), so
the harness is bug 0089's, extended. Required: §Reproduction (a) with its three
controls; (b) all four rows, which are the two-part finding and red immediately
if a fix moves the receiver path; (c) all fourteen rows, each asserting the
exact aggregated code list with `toEqual` and each asserted message sourced
from the registry's *Message* column per DIAG-4; (d) rows 1–12 as bounds, with
d9's and d11's post-fix values pinned, and d13–d16 as the collision record
(unchanged by the fix, since the sentinel keeps its name unless §Fix (b)
replaces it); and (f)'s eight rows as tripwires, so
a fix that widens into the sink-routing siblings reds rather than passing
silently. The runtime rows (e1, e3, e5) need the production executor harness
(`tests/non-object-receiver-gate.test.ts:221–292`); e1 and e3 are the two that
prove the fix removes a runtime outcome rather than merely adding a diagnostic,
and their post-fix disposition is that the theta stops registering.

**Both directions.** A single neutralisation suffices — this is one `kind`
test, unlike bug 0089's five independent ones — but it must be proved:
reverting the unfold reds (a) rows 1, 4, 5, every alias row of (c), and d9's
message and d11's code list, while leaving (b), (d) 1–6 and (f) green. A fix
whose neutralisation does not red (b) confirms the receiver path was never
touched.

## Fix (0.76.0)

- **What shipped:**
  - `src/parser/static-type-inference.ts` — §Fix's code route, verbatim.
    `#typeExpr`'s `case "index"` arm binds
    `unfoldAlias(this.#typeExpr(node.target, env, bindings), env)` and tests the
    **unfolded** value's `kind`, returning its `element`. One line, one file,
    the already-imported `unfoldAlias` reused not forked, no new export, no new
    helper, no registry row. The arm's two-line comment states the TYPE-11
    reason and the TYPE-10 bound; the file is 372 lines before and after, so no
    citation into it is staled.
  - `docs/spec_topics/expressions.md` — §Fix (a) **disposition (1)**, the
    adjudication this report assigned the fixer. The *Indexed access* bullet
    gained one sentence beside the `obj[k]` sentence: the static result type of
    `arr[i]` is `T` when the receiver is `array<T>`, and a type-alias-schema
    receiver is read through its right-hand side, linking
    [TYPE-11](../spec_topics/type-system.md#type-11) rather than restating it.
    **Why (1) over (2):** the sentence that *is* written derives the object
    result type from the receiver's declared shape, so reading the neighbouring
    array silence as licence for a fabricated type makes that sentence an
    exception rather than an instance — the ground bug 0113's Reading A rested
    on. It also gives every row of §Reproduction (a) and (c) a rule-page
    citation instead of resting on the registry triggers alone. The sentence
    states the array clause **only**: `expressions.md:10`'s object result type
    is a *specified* obligation the implementation does not meet (d1, d2
    measure it), and that is the separate report §Non-goals names.
  - `docs/reference/grammar.md` — the user-facing mirror, same commit (the
    same-commit rule for spec edits; DIAG-2 is **not** engaged — no code,
    severity or *Trigger* moves). The *Expression sublanguage* indexed-access
    parenthetical gained `array result type is `T`` between the receiver-kind
    and object-index clauses, folded into the existing line 339. The file is
    610 lines before and after.
  - `tests/index-element-alias-unfolded.test.ts` — **new**, 51 rows.
  - `tests/index-element-alias-runtime-disposition.test.ts` — **new**, 5 rows.
  - `tests/live/live-production-acceptance.test.ts` — **new H8a cell, +213/−0**,
    additive only.

- **§Fix (b) — the sentinel's disposition, and what stays reachable.** The
  `named "index"` sentinel is **kept unchanged**, and the else arm stays
  reachable. Unfolding removes only the alias input class from it. All three
  §Fix (b) constraints hold: an unresolvable receiver keeps **deferring**
  (`type-system.md:48`; rows d3, d14, d16 pin it, d4 pins the cycle
  participant); the sentinel is not a name an author can declare, because it is
  not renamed at all, so the d13/d15 collision is exactly as measured before
  and neither theta registers; and — stated explicitly, as §Fix (b)
  requires — **`got index` remains reachable**. Rows d7 (unresolvable receiver)
  and d8 (object-schema receiver) reach it with no alias involved and are
  pinned green in both directions, so the DIAG-4 render leak against
  `placeholder-rendering-a.md:19` read with `lexical.md:15` **survives this
  fix**. Fixing the render was neither required nor forbidden by this report;
  it is not done here, and residual 1 below carries it.

- **§Fix (c) — the object-receiver arm did not move.** `unfoldAlias` returns an
  object-schema `named` unchanged (TYPE-10), so an alias of an object schema
  still fails the `kind === "array"` test and still falls to the else arm.
  `classifyIndexReceiver`'s three-way answer was **not** reached for — the
  separate object-result-type report is not pulled into scope. Pins d1, d2, d5,
  d6 are green in both directions.

- **§Fix (d) — the three sink-routing siblings are untouched.**
  `src/parser/type-layer-checks.ts` is not in the diff. Group (f)'s eight rows
  pin `:620`, `:958` and `:1050`'s **present, diverging** behaviour — including
  f1's *false* `E`-severity rejection of a spec-legal binding — as tripwires, so
  a later fix that widens into them reds rather than passing silently.

- **The re-derived pre-fix baseline: zero drift.** Every row of §Reproduction
  (a), (b), (c), (d), (f) and (g) — 51 parse rows — and (e1), (e3), (e5) was
  re-measured at `1451eb79` through the production `parseThetaDocument` and the
  production executor, four commits after the `552b4ace` observation. All 54
  reproduced their recorded codes and messages **exactly**, including the two
  runtime observables this report's S1 rating turns on: e5 delivered `1.5` from
  an `integer`-annotated binding (`result={"present":true,"value":1.5}`) and e3
  returned `"1,2"` from `array<integer>.join(",")`
  (`result={"present":true,"value":"1,2"}`), the JS coercion `expressions.md:108`
  and `stdlib-array.ts:63–65` both say cannot happen. e1 threw
  `theta/runtime/internal-error: internal error: unknown string stdlib member:
  frobnicate` through `surfaceUnexpectedThrow`. Post-fix all three stop at
  parse and the theta does not register, so both runtime outcomes are removed
  rather than merely diagnosed.

- **The `kind === "array"` sweep, re-run — the family claim.** At the fix commit
  `rg -n 'kind === "array"' src/` returns **14** hits, the same count bug 0089's
  round 2 and this report's §Reproduction (f) recorded. Six are `CompatType`
  **narrowing** tests and **all six now test an unfolded operand**:
  `control-flow.ts:70` (0089 gate 1), `type-layer-checks.ts:1428` (gate 2),
  `:1190` (site 3a), `static-type-inference.ts:277` (site 3b),
  `type-compat.ts:212` (unfolded upstream by `checkCompatible` at `:144`), and
  `static-type-inference.ts:249` — **this fix**. Three are raw-`CompatType`
  **sink-routing** tests (`type-layer-checks.ts:620`, `:958`, `:1050`),
  untouched and separately reported. The rest are `Expr`-AST kinds
  (`:620`/`:956`/`:1050`'s other conjunct, `statement-executor.ts:648`, `:978`),
  an `InterpolationType` (`production-theta-producer.ts:5666`), and one comment
  (`type-layer-checks.ts:1184`). `rg -n 'kind !== "array"' src/` → 3, none a
  narrowing site. `rg -n 'unfoldAlias\(' src/` → **14**, one more than the 13
  this report measured; the increment is this fix's own call.
  **Conclusion: the alias-unfolding narrowing family is complete.** Bug 0089's
  round-2 conclusion that this line was the only remaining `CompatType` sibling
  was, as this report states, *correct for narrowing and wrong as stated* — and
  the narrowing half of it is now discharged.

- **GOV-15 discharge — the committed-corpus sweep.** Programs that load cleanly
  today could start refusing, so the whole shipped corpus was swept both
  directions. `tests/committed-fixture-parse-gate.test.ts` filters `.theta`
  only and cannot witness a `.thetalib` (bug 0132, open — **not** fixed here),
  so the walk was extended in a scratch probe (the 0079/0095 method) to every
  committed `.theta` **and** `.thetalib`, each run through the real `lexTheta`
  → `parseThetaDocument`. **35 files** (34 tracked plus the gitignored
  `.pi/theta/smoke.theta`). Pre-fix and post-fix row sets are **byte-identical**:
  every file yields `[]` except the seeded-invalid
  `tests/fixtures/h7b-invalid/malformed.theta`, whose six-code list is
  unchanged. No shipped `.theta` or `.thetalib` declares a type-alias schema
  over `array<T>` and indexes it, so the blast radius against GOV-15 is
  **zero** and no carve-out is owed. Probe deleted.

- **The H9a permitted-codes decision, taken by the real run.**
  `tests/fixtures/h7a/permitted-codes.json` is **byte-unchanged** at
  `a4a8da04209f90e13d815edd92c1fc682e2a2236`. Six codes become reachable from a
  new position, so the question was decided by the REAL H9a run and a transcript
  grep, never by assumption (the 0079/0084/0102 method): the required
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/acceptance/` run passed **11/11**, and
  `assertCodesSubsetOfPermitted` — a hard `.toEqual([])` gate — held at all ten
  real `pi -p` spawn sites; a supplementary scratch probe re-drove all nine
  areas and grepped the raw captured stdout+stderr, finding **zero** occurrences
  of any of the six codes (area (a) captured its exact 17-byte
  `ACC SENTINEL OK` sentinel, so the captures are genuine, not empty).
  Statically, no H9a fixture declares an alias of `array<T>`. **No append is
  owed.**

- **Gates.** Witness
  `npx vitest run tests/index-element-alias-unfolded.test.ts
  tests/index-element-alias-runtime-disposition.test.ts` →
  `Test Files 2 passed (2) / Tests 56 passed (56)`. Full default suite
  `npm test` → `Test Files 269 passed (269) / Tests 4005 passed (4005)`,
  against a `196e3082` baseline of 267 / 3949 (+2 files, +56 tests — exactly
  the two new witnesses; no existing file moved).
  `npx tsc -p tsconfig.json --noEmit` → exit 0, no output. `npm run lint` →
  exit 0, no output. Live: `tests/live/live-production-acceptance.test.ts` →
  **19/19** and `tests/live/acceptance/` → **11/11**, both on real runs; no
  bug-0064, bug-0065, ~180 s stall or bug-0102 `H9a-T (b)` sentinel signature
  appeared.

- **Review.** Two rounds, two fixer rounds, one verification round.
  Round 1 (deep) — FINDINGS, three, none `correctness`/`fidelity`/`spec`: F1
  `house-rule`, pre-fix-anchored "at HEAD"/"today" claims in test comments and
  failure labels that turn false on shipping; F2 `prose`, an `rg 'got index'`
  sweep claim the file itself falsified; F3 `test`, 38 expected messages copied
  as literals rather than read through the house `registryMessage` mechanism.
  Round 2 (fast) — CLEAN, one non-blocking `prose` residual: the rewritten F2
  sentence still misdescribed its match set. A `bug-fix-fixer-light` round
  corrected it; the round's diff is comment-only, gates re-run green, so the
  polish was verified by gate-diff and the confirmation round skipped.
  An orchestrator-directed correction round preceded review round 1 and is the
  reason the diff is line-count-neutral (see residual 4).

- **Verification.** SOLID; seven obligations, all discharged with quoted
  evidence. (1) A single targeted-byte-edit neutralisation reds **exactly**
  {a1, a4, a5, c1, c3, c5, c7, c9, c11, c13, d9, d11, e1, e3, e5} — 15 of 56 —
  and restores byte-exact (`f8e7f2bb…`); §Fix's "both directions" requirement is
  met, and (b), (d)1–6, (f) and (g) stay green under it, confirming the receiver
  path was never touched. (2) `npm test` 269/4005, no file moved. (3) The new
  additive H8a cell proves both directions live. (4) typecheck and lint clean.
  (5) GOV-15 sweep byte-identical across 35 files. (6) permitted-codes hash
  unchanged, decided by the real run. (7) The family claim confirmed on the
  re-run sweep. `git stash`, `git checkout` and `git restore` were used at no
  point; every neutralisation was a targeted byte edit restored byte-exact and
  blob-hash verified.

- **Deliberate observable changes, all pinned.** d9's message moves from `got
  index` to `got string` — `code-registry-parse.md:64`'s `got <type>` template
  under TYPE-11, the same class of move bug 0089 shipped at gate 1. d11's code
  list moves from `theta/parse/non-array-iterand` to
  `theta/parse/unknown-method`, matching its d12 control: a legal `par for` over
  an alias-typed array's element is no longer refused. c13 reports
  `unknown method 'frobnicate' on type E` — the **declared** element name —
  because the element is deliberately not unfolded here; unfolding it would move
  c14, which is not this fix. `rg -n 'got index' tests/ docs/ src/` at the fix
  commit matches only this fix's own d7/d8 rows and this report's measurements,
  so no committed fixture asserted the sentinel form and the move reds nothing
  else.

- **Tests.** `tests/index-element-alias-unfolded.test.ts` — 51 rows, offline,
  provider-free, through the production `parseThetaDocument` over the shared
  `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`). Groups (a), (b), (c) and
  (d) replay §Reproduction with d9's and d11's post-fix values pinned and
  d13–d16 as the collision record; group (f)'s eight rows are the sink-routing
  tripwires; group (g) pins the closed `let` route and the out-of-reach
  `fn`-return route. Every code assertion is an ordered whole-list `toEqual`,
  never a containment matcher. **DIAG-4 is satisfied mechanically, not by
  citation**: all 38 expected messages are read from the registry through
  `parseRegistry` + `registryMessage` with a `msg(code, fills)` helper that
  asserts row definedness and placeholder presence before substituting, so a
  reworded template reds by naming
  `docs/spec_topics/diagnostics/code-registry-parse.md` rather than by a bare
  string mismatch — the `tests/brace-rooted-union-arm-capture.test.ts:110–152`
  precedent. `tests/index-element-alias-runtime-disposition.test.ts` — 5 rows
  through the production executor (`parseThetaDocument` →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`),
  the harness shape `tests/non-object-receiver-gate.test.ts:221–292`
  establishes; e1/e3/e5 assert both halves — the exact code list and a local
  mirror of `hasLoadParseError` (module-private at
  `production-composition.ts:2045`, so it cannot be imported) — with x1/x2 as
  anti-vacuity controls that still register and still execute. **Live:** an
  additive registration-only H8a cell in
  `tests/live/live-production-acceptance.test.ts` (+213/−0, zero tokens, the
  0084/0089/0095/0102 precedent) plants an illegal alias-index caller beside a
  plain control and a legal alias-index sibling in one real workspace, boots the
  shipped extension, and asserts off the settled in-memory `SessionManager`'s
  entries — never off racy events, never on `prompt()` resolving — that the
  illegal caller does **not** register while both siblings do. Its direction is
  the inverse of 0089's cell: success here is non-registration. Both directions
  proved: neutralised, all three register; restored, the illegal one does not.
  **No existing test was modified.** `tests/fn-param-alias-unfolded-at-gates.test.ts`
  (36/36, rows `n1` and `b12` intact, which pin open bugs 0126 and 0127),
  `tests/let-annotation-recorded-binding-type.test.ts` (19/19),
  `tests/production-tools-load-resolution.test.ts`,
  `tests/control-flow.test.ts`, `tests/committed-fixture-parse-gate.test.ts`
  and the 0079/0080/0084/0095/0096/0102 witnesses are all byte-unchanged and
  green.

- **Residuals.**
  1. **The `named "index"` render leak survives, by design.** `displayType`'s
     `case "named"` returns `type.name` verbatim (`type-compat.ts:324–325`), so
     the internal string `index` still reaches a DIAG-4 *Message* whenever the
     else arm's value is rendered. Evidence: rows d7
     (`fn f(p: Nope) { for y in p[0] { y } }`) and d8 (`schema P { xs:
     array<string> }` + `for y in p["xs"] { y }`) both report
     `'for' expects array<T> after 'in'; got index` at the fix commit, with no
     alias involved, and are pinned green in both directions. `index` satisfies
     neither `placeholder-rendering-a.md:19` (a `<type>` renders a named schema,
     enum or alias by its theta-side identifier) nor `lexical.md:15` (which
     fixes that identifier as uppercase-initial), so the rendered type names
     something no conformant schema can be. §Fix (b) neither requires nor forbids
     closing this; it is not closed here, and it belongs with the sentinel's
     disposition or with the object-result-type report.
  2. **The sentinel/schema-name collision is unchanged.** `schema index = …`
     draws `theta/parse/schema-case-mismatch` yet still enters the `TypeEnv`, so
     the fabricated name unfolds through the author's declaration: d13 draws
     `non-string-array-join` where its d14 control draws nothing, and d15 draws
     `let-rhs-type-mismatch: … got index` where d16 draws nothing. Both rows
     also carry the `E`-severity `schema-case-mismatch`, so neither theta
     registers — a diagnostic-correctness observation, not a load hazard. The
     sentinel was not renamed, so the exposure is exactly as measured before.
  3. **A member-access index read loses its type in *both* spellings.**
     Measured while re-deriving §Reproduction: `schema L = array<string>` +
     `schema P { xs: L }` + `fn f(p: P) { let y = p.xs[0]  y.frobnicate() }`
     reports `[]`, **and so does its concrete control** `schema P { xs:
     array<string> }` + the same body. Unchanged in both directions by this fix.
     The cause is disjoint from this report: `#typeExpr`'s `case "member"`
     (`static-type-inference.ts:243–244`) types a member access as
     `{ kind: "named", name: node.field }` — the field *name*, not the field
     *type* — so the alias is not what is lost, exactly as §Non-goals records for
     the `fn`-return route (g2/g3). It is the same `named`-mint class bug 0038
     enumerates. Not filed here.
  4. **A bare schema name as an index receiver newly reports.** Measured: with
     `schema L = array<string>`, the source `L[0].frobnicate()` reports `[]`
     pre-fix and `["theta/parse/unknown-method"]` post-fix; likewise
     `schema Variant = array<string>` + `enum E { Variant }` +
     `E.Variant[0].frobnicate()`. `L` names a schema, not a value, so no legal
     program is refused — the change is refuse-before-runtime on input that was
     broken either way, and the identical mint collision already fires **today**
     at untouched sites (`let m: integer = L` reports
     `let-rhs-type-mismatch: … got L` through `checkCompatible`, which this fix
     does not touch). Bounded exactly like d13/d15, bug 0038's class, no witness
     row added.
  5. **Bug 0132 (open) is confirmed, not closed.**
     `tests/committed-fixture-parse-gate.test.ts`'s walk still filters `.theta`
     only and still cannot witness either committed `.thetalib`
     (`docs/examples/personas.thetalib`,
     `tests/live/acceptance/fixtures/acc-lib.thetalib`), and its anti-vacuity
     guard still depends on the gitignored `.pi/theta/smoke.theta`. This fix's
     GOV-15 sweep worked around both in a scratch probe rather than fixing the
     gate, as directed.
  6. **Position-only citation drift, pre-existing, left as found.** This
     report's §Reproduction (f) and §Provenance cite
     `src/parser/theta-document.ts:1064` for the `Expr`-AST `kind !== "array"`
     hit; at the fix commit it is `:1065`, shifted by the 0095 fix. This
     report's own §Affected anchors are pinned to `552b4ace` by the repository's
     convention. **This fix creates no shift-induced drift of its own**: see
     residual 7.
  7. **Zero line shift, deliberately.** The implementation's first pass grew the
     `case "index"` arm's comment from 2 lines to 5 (+3 in
     `static-type-inference.ts`) and rewrapped the `grammar.md` paragraph from 5
     lines to 6 (+1). Measured, that would have staled
     `docs/bugs/0126-plain-for-binds-no-loop-variable.md:813`'s citation of
     `static-type-inference.ts:275` — an **open** report this fix may not edit —
     and every citation into `docs/reference/grammar.md` at or beyond line 342,
     which spans fourteen bug documents including the open 0062, 0090, 0115,
     0119, 0120, 0121, 0123 and 0126, plus this report's own `:400–407`. Both
     files were therefore made line-count-neutral (372 and 610 lines, before and
     after), which also removed two unrelated test files from the diff whose
     only change had been chasing the shift. No citation anywhere in the corpus
     is staled by this fix.

- **Discharge notes appended:** 0089 (its §Residuals item (i) is this report —
  discharged; and its "only remaining `CompatType` sibling" claim adjudicated),
  0083 (the `unfoldAlias` export and the `let` route, both reused not
  duplicated), 0033 (the three-way `TypeEnv` classification `unfoldAlias`
  reads — note only), 0126 and 0127 (note only — their pins in
  `tests/fn-param-alias-unfolded-at-gates.test.ts` rows `n1` and `b12` are
  byte-unchanged and green).

- **Pinned dispositions / non-goals.** The `named "index"` sentinel keeps its
  name and its arm. `got index` stays reachable at d7/d8. `walkFn`'s raw
  parameter record (`type-layer-checks.ts:739`) stays raw — bug 0089 rejected
  unfolding there in terms, and b3 proves the record resolves fine when a
  consumer resolves it. The element is not unfolded at this line, so c14's
  `on type E` render is invariant. The three sink-routing siblings keep their
  measured divergence, tripwired by group (f). `expressions.md:10`'s object
  result type remains unimplemented and out of scope. `theta/parse/non-array-iterand`
  becomes *un*reachable for d11's input class, which is the point: its
  registered trigger is "`for x in expr` where `expr` is not `array<T>`", and
  under TYPE-11 that iterand **is** `array<T>`, so the emission sat outside its
  own trigger — the same fault bug 0089 prosecuted at gate 1.

## Provenance

- Origin: the bug 0089 fix (0.72.0, commit `a3b30ed3`), §Residuals item (i),
  which names this site and its measurement — "`#typeExpr`'s **index**-element
  derivation (`static-type-inference.ts`, the `target.kind === "array" ?
  target.element : named "index"` shape) has the identical TYPE-11 opacity at a
  site §Fix does not name, and is unchanged here" — and classes it
  "pre-existing and out of the settled scope". This report adds what the
  residual does not state: the two-part finding against `classifyIndexReceiver`
  with both halves measured; the six erased registry codes with per-row
  controls; the runtime disposition on three of them; the sentinel's DIAG-4
  render leak and its non-alias reach; the sentinel/schema-name collision; the
  corrected `kind === "array"` inventory with the three sink-routing siblings
  and their measured divergence; the spec-silence finding for the array-index
  result type against the written object-receiver sentence; the routes that are
  *not* this defect (`let`, `fn` return); and the four §Fix questions.
- Spec: `docs/spec_topics/type-system.md:52` (TYPE-10), `:54` (TYPE-11), `:48`
  (*Unresolvable operands*);
  `docs/spec_topics/expressions.md:10` (indexed access; the object-receiver
  result type), `:101` (`string` is not indexable), `:108` (the `array<T>`
  `join` row), `:122` (unknown members are a parse error "rather than a runtime
  failure"); `docs/spec_topics/lexical.md:15` (PascalCase for schema names),
  `:18` (`theta/parse/schema-case-mismatch`);
  `docs/spec_topics/errors-and-results/error-model.md:74` (the runtime-defect
  surface); `docs/spec_topics/diagnostics/code-registry-parse.md:20`, `:24`,
  `:34`, `:36`, `:38`, `:39`, `:40`, `:41`, `:43`, `:54`, `:63`, `:64`, `:100`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/diagnostics/placeholder-rendering-a.md:13–21`
  (the `<type>` rule; `:19` the named-type bullet). User-facing mirrors:
  `docs/reference/grammar.md:337–341` (indexed access), `:400–407` (the
  `array<T>` literal type-sink rule); `docs/reference/type-system.md` (no index
  result type); `docs/reference/diagnostics.md` (Message mirror, no *Trigger*
  column).
- Implementation evidence at `552b4ace`:
  `src/parser/static-type-inference.ts:30` (the `unfoldAlias` import), `:94`
  (the recording walk), `:182–188` (the `typeOf` seam), `:197` (`#typeExpr`),
  **`:245–250`** (the `index` arm; `:248` the raw bind, `:249` the defect),
  `:251–252` (the `call` arm, why the `fn`-return route is out of reach),
  `:275–279` (0089's site 3b);
  `src/parser/type-compat.ts:144` (`checkCompatible`'s unfold), **`:155–172`**
  (`unfoldAlias`; the bounds comment `:147–154`, the termination comment
  `:157–163`), `:180` (`decide`, whose unfolded recursions are at `:185`, `:199`,
  `:216`), `:212–213` (TYPE-7's array arm), `:236–237` (TYPE-8's field-operand
  unfolds), `:318–333` (`displayType`; `:324–325` the `named` render),
  **`:366–392`** (`classifyIndexReceiver`; `:371` array, `:380–390` the `named`
  arm, `:389` the alias recursion);
  `src/parser/type-layer-checks.ts:131` (`classifyOperand`'s array arm), `:172`
  (`classifyReceiver`'s), `:200` (`builtinMembers`, not a `CompatType`),
  `:422` (the name walker), `:482–504` (`annotationToCompatType`; `:503` the
  fallback), `:573–575` (the `typeOf` delegation), `:620–621` and `:626`
  (sink-routing sibling 1), `:642` (bug 0083's transparent `let` record),
  `:735–741` (`walkFn`; `:739` the raw record), `:931–944`
  (`checkArrayLiteral`), `:952–962` (sink-routing sibling 2; `:958`),
  `:1050–1051` (sink-routing sibling 3), `:1101` (the sink-less array check),
  `:1186–1194` (0089's site 3a), `:1391–1410` (`checkIndex`; `:1395` the
  receiver type, `:1397` and `:1401` the two checks), `:1427–1428` and `:1437`
  (0089's gate 2), `:1582` (an `Expr` child enumeration);
  `src/parser/control-flow.ts:67`, `:69–70`, `:74–80` (0089's gate 1);
  `src/runtime/expression-evaluator.ts:615–634` (`checkIndexReceiver`; `:621`
  the classify, `:630–632` the raw render), `:640` (`displayCompatType`);
  `src/runtime/stdlib-object.ts:63–87` (`checkObjectIndex`; `:70` the
  classify); `src/runtime/stdlib-array.ts:63–67` (the `join` evaluation and its
  precondition comment), `:100–124` (`checkArrayJoin`);
  `src/runtime/stdlib-string.ts:105` (the throwing `default` arm);
  `src/runtime/runtime-panics.ts:496` (`surfaceUnexpectedThrow`);
  `src/extension/production-composition.ts:2045–2052` (`hasLoadParseError`),
  `:2079`, `:2092` (`parseDiscoveredTheta`'s drop);
  `src/extension/production-theta-producer.ts:5666`, `:5760`
  (`interpolationTypeOf`, the non-`CompatType` sweep hit);
  `src/parser/query-schema-inference.ts:121` and
  `src/parser/theta-document.ts:1064` (the two non-`CompatType`
  `kind !== "array"` hits); `src/runtime/statement-executor.ts:648`, `:978`
  (the two `Expr`-AST hits).
- Sweep: `rg -n 'kind === "array"' src/` (14 hits),
  `rg -n 'kind !== "array"' src/` (3), `rg -n 'case "array"' src/` (34),
  `rg -n 'unfoldAlias\(' src/` (13), all at `552b4ace`, classified in
  §Reproduction (f). `rg -n 'got index' tests/ docs/ src/` → no match.
  `rg -l 'schema [A-Z][A-Za-z]* = array<' tests/` → seven committed files, none
  indexing an alias-typed array.
- Test evidence at `552b4ace`:
  `tests/fn-param-alias-unfolded-at-gates.test.ts` (bug 0089's witness, 36
  cells, 36/36; cell c3 at `:587–601` is the only index expression in it, and
  drives the receiver path);
  `tests/let-annotation-recorded-binding-type.test.ts` (bug 0083's witness, 19
  cells, 19/19; `:216`, `:229`, `:245`, `:254` are its alias rows, none an
  index read); `tests/helpers/e2e-s1.ts:39` (`parseDoc`);
  `tests/non-object-receiver-gate.test.ts:221–292` (the production executor
  harness shape the runtime rows reuse);
  `tests/live/live-production-acceptance.test.ts:1645`, `:1741` (bug 0089's
  additive registration-only live cell, the precedent if a live witness is
  wanted here).
- Reproduction: four scratch vitest files at `552b4ace` — fifty-two parse rows
  through the production `parseThetaDocument` over `parseDoc` (fifty-one quoted
  above; the unquoted row is `schema index = array<string>` with a `for`
  iterand, which adds nothing to d13–d16), and five rows through the production
  executor. Run on the outputs quoted above, then
  deleted. No file in `src/`, `tests/`, `docs/bugs/README.md` or any other bug
  document is modified by this filing.
