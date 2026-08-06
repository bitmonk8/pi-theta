# Bug 0156 — `expressions.md:220` names the parameter type among an array literal's sinks and rule 3 (`:226`) admits two named object schemas "only if some sink in scope expects a union", but no `fn`-parameter sink is ever supplied at a call site: `fn f(xs: array<A | B>): integer { 1 }` + `f([A { a: 1 }, B { b: "x" }])` draws `theta/parse/array-no-common-type` at `E` and the theta does not register, where the binding-annotation and constructor-field spellings of the identical union both load clean — `checkFnCallArgs` resolves the callee's parameter type at `type-layer-checks.ts:1601` and never hands it to `checkArrayLiteral`, whose `call`-arm invocation at `:1947` is reached with `skipArray` defaulted to `null`, so the refusal fires outside its own registered *Trigger* ("… and no sink to narrow against")

- **Status:** open. Residual **R2** of the bug 0081 fix (0.83.0, commit
  `5de8d78a`), recorded in that fix's report (`.pi/tmp/fixes/0081-report.md`
  §Residuals R2) and in 0081's own `## Fix (0.83.0)` record residual 2. The
  class is **strictly narrower** than 0081 framed it: 0081's §Why-it-matters
  item 2 ("the parameter type that should supply the sink is ignored") is
  corrected by its own fix record, and witness cell r6
  (`tests/array-ternary-common-type-union.test.ts:558–579`) pins the
  narrowing. §Fix is constraint-pinned, not settled: the consultation point is
  named and both measured consequences of supplying the sink are enumerated,
  but which code a *mismatched* element draws at an argument position once a
  sink is in scope is left to the run. **Ordering:** nothing blocks this report
  from starting. Both halves of its substrate have landed —
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
  **fixed (0.77.0)** built the call-site parameter resolution and
  [0081](./0081-array-ternary-common-type-never-unions.md) **fixed (0.83.0)**
  built the LUB — which is the sequencing 0081 §Fix constraint 5 asked for
  ("the two are best sequenced together so the argument type is resolved
  once"). It neither blocks nor is blocked by
  [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md)
  (concurrent filing, 0081 facet (b) — the ternary `checkCommonType` caller,
  filed at this same HEAD): that report's subject
  needs a DIAG-2 *Trigger* adjudication and this one needs none (§Kind element
  2), and the two touch disjoint arms of `walkExpr`.
- **Sev/Diff estimate:** S2/D3 — **S2**, not S1: the input is refused *loudly*,
  with an `E`-severity diagnostic at the literal, so nothing is silent and no
  value is corrupted; the scale's "conformant input noisily refused" is the
  exact shape. Aggravating, and measured: the refusal is outside the row's own
  registered *Trigger* (§Kind element 2), the theta does not register at all
  (row a1), and the workaround the *Message* itself prescribes ("annotate the
  binding with `array<A | B>`") names a binding that does not exist at an
  argument position — the author must introduce one (row f1). Mitigating: the
  class is bounded to rule-3 elements under a union-typed parameter, zero
  committed `.theta`/`.thetalib` files contain it (§Reproduction (h)), and the
  primitive half is already closed. **D3**, not D2: the change is confined to
  one file (`src/parser/type-layer-checks.ts`) and needs no new registry row, but
  §Fix is unsettled by construction — supplying the sink puts rule 1 in force
  at the argument position, which measurably changes the code for a *mismatched*
  element (row e3) and adds a second `E` line to three cells pinned by 0081's
  fix in a 2960-line sibling witness (rows g1–g3), which is
  [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s open class;
  that is the scale's "in-run adjudication … with pinned-byte coordination
  against sibling witnesses". A route that consults the parameter type only for
  rule 3's union-sink gate avoids those consequences and would come in at D2;
  choosing between them is the run's, not this report's.
- **Kind:** defect — implementation, against a written sentence, and outside
  the emitting row's own registered *Trigger*. Two elements.
  1. **A sink the spec enumerates is never supplied.**
     `docs/spec_topics/expressions.md:220` lists an array literal's context
     sinks as "binding annotation, **parameter type**, or surrounding
     constructor field", and `:226` (rule 3) makes a union sink the condition
     under which two distinct named object schemas admit: they yield
     `array<A | B>` "only if some sink in scope expects a union". The sink set
     the implementation applies at an array literal is binding-annotation
     (`type-layer-checks.ts:982`) and constructor-field (`:1560`) only. The
     `call` arm (`:1987–1990`) runs `checkFnCallArgs` and then walks each
     argument with `walkExpr`'s fourth parameter omitted, so the array arm at
     `:1946–1948` sees `skipArray === null` and calls
     `checkArrayLiteral(e, undefined, bindings)` — sink `undefined`, whatever
     the callee declares.
  2. **The refusal fires outside its registered *Trigger*, so closing it
     engages no DIAG-2 edit.** The row
     (`docs/spec_topics/diagnostics/code-registry-parse.md:41`) reads
     *Trigger* "Array literal whose elements have no common type **and no sink
     to narrow against**". Under `fn f(xs: array<A | B>)` a sink is in scope by
     `expressions.md:220`'s own list, so row a1's emission is outside that
     sentence. Removing it NARROWS an emission set onto its registered
     *Trigger* — the posture 0081's fix record states for this same row — and
     needs no registry-table change under
     [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)
     (`diagnostic-shape.md:72`). This is the axis on which the report is
     disjoint from bug 0155, whose facet cannot be closed without widening the
     same row's *Trigger*.
- **Related:**
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **fixed
    (0.83.0)**, the filing origin and the report that narrowed this class.
    Its facet (d) was filed as "the `fn`-parameter sink is not applied at a
    call site" over the whole heterogeneous-literal set; its fix closed the
    part that never needed a sink, because a primitive heterogeneous literal
    now computes a union LUB of its own (`commonType`, `type-compat.ts:656`).
    Witness cell r6 (`tests/array-ternary-common-type-union.test.ts:558–579`)
    is the pin, and its comment states the residual in this report's terms
    verbatim: "What this leaves of facet (d) is the strictly smaller class
    'elements with no LUB under a union-typed parameter' — `fn f(xs: array<A |
    B>)` with `f([A{…}, B{…}])`, where rule 3 refuses and only a supplied sink
    could admit. The 0081 doc's §Why-it-matters item 2 overstates the remaining
    gap; this cell is where that is measured." That cell, and cells r4/r5/r7
    (`:731`, `:743`, `:790`) — the two working sinks and rule 3's sink-less
    refusal — are re-measured here at HEAD (rows b1, b2, c1, d1) rather than
    reused, and all four hold.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the call-site substrate. Its fix wired
    `checkFnCallArgs` (`type-layer-checks.ts:1575`), which resolves the
    callee's declared parameter type through `annotationToCompatType(p.type)`
    (`:1601`) and judges the argument against it (row e1). That resolution is
    the value this report's fix must hand to `checkArrayLiteral`; the
    infrastructure exists on both sides of 0081 §Fix constraint 5 now. 0050's
    §Related already stated the pairing from its side: facet (d) is "the mirror
    image at the same boundary … Same call site, opposite direction (argument
    checking vs. sink supply); a fix for one does not give the other."
  - [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md) —
    **open**, concurrent filing, 0081 facet (b): the ternary `checkCommonType`
    caller. **Disjoint from this report and requiring no edit here.** That facet cannot be closed without widening
    `code-registry-parse.md:41`'s *Trigger* past "**Array literal**", which is
    a DIAG-2 adjudication; this report's input is an array literal already
    inside the *Trigger*'s subject and its fix only removes an emission the
    *Trigger*'s own sink clause already excludes. The two also do not meet in
    code: 0155's subject is `walkExpr`'s `ternary` arm
    (`type-layer-checks.ts:1910`), this report's is the `call` arm (`:1986`).
    Measured boundary: a ternary written at the same argument position under
    the same union-typed parameter draws nothing today (row e5), and this
    report claims no change to it (§Non-goals).
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    the coordination §Fix constraint 3 names. Its subject is two `E`-severity
    lines for one written mistake. The binding position already answers a
    mismatched element with two codes (row e4: `let-rhs-type-mismatch` and
    `array-element-type-mismatch`) where the argument position answers with one
    (row e2). A fix that supplies the parameter sink wholesale makes the
    argument position match the binding position's two-code shape at rows
    g1–g3 — the same pattern 0129 is adjudicating, and the same pattern 0081's
    fix needed an operator authorization to ship at cells f4/f6 of
    `tests/index-element-alias-unfolded.test.ts`.
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) — **open**, the
    same call site's imported half. `checkFnCallArgs` returns on
    `this.importedSymbols.has(e.callee)` (`type-layer-checks.ts:1582`) before
    any parameter type is resolved, so an imported callee has no parameter
    types to supply as a sink either. Whatever route 0138 takes for carrying
    imported parameter types decides, for free, whether the sink this report
    asks for reaches imported callees; neither report's fix reaches the other's
    claim. §Non-goals leaves the imported half with 0138.
  - [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — **open**,
    and **no overlap**, checked against its §Related and its own subject. 0130
    is about an *inline object type* in a `let` annotation converting to an
    unresolvable pseudo-`named` reference, so `theta/parse/let-rhs-type-mismatch`
    declines at the `let` position; its sites are `annotationToCompatType`'s
    inline-object arm and `checkLetRhsCompat`. This report's annotations are
    *named* object schemas inside `array<A | B>`, which `annotationToCompatType`
    converts (row e1 proves the parameter type resolves and renders), and its
    site is the argument position's missing sink. 0130's §Related names 0095,
    0045, 0083, 0115, 0129 and 0124 and does not reach this call site; neither
    report's fix moves the other's rows.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for the positional drift a fix here induces
    in `src/parser/type-layer-checks.ts` citations. §Fix constraint 5 records
    the line-pin discipline that bounds it.
- **Affected** (every citation verified at HEAD `5de8d78a`, 0.83.0):
  - **The spec sentences** — `docs/spec_topics/expressions.md:220`, the sink
    list ("binding annotation, parameter type, or surrounding constructor
    field"); `:222`, the rules' scope line; `:224` (rule 1), the in-scope-sink
    discipline and `theta/parse/array-element-type-mismatch`; `:225` (rule 2),
    the computed LUB; `:226` (rule 3), the union-sink condition and its
    fallback code. Mirror: `docs/reference/type-system.md:83–95`, the same
    three rules ("two different named schemas yield `array<A | B>` only under a
    union sink"). `docs/spec_topics/type-system.md:27` lists "a
    function-argument slot" among the positions `⊑` governs;
    [TYPE-9](../spec_topics/type-system.md#type-9) (`:50`) names the same slot
    as reporting `theta/parse/fn-arg-type-mismatch`.
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:41`,
    `theta/parse/array-no-common-type`, severity `E`, namespace `type`,
    *Trigger* "Array literal whose elements have no common type and no sink to
    narrow against.", *Message* `array elements have no common type; annotate
    the binding with array<A | B> or use a single schema`. `:116`,
    `theta/parse/fn-arg-type-mismatch`, the row 0050 wired. Mirror without a
    *Trigger* column: `docs/reference/diagnostics.md:87`. No input below needs
    a *Message* edit and no *Trigger* needs widening (§Kind element 2).
  - **The three call sites of `checkArrayLiteral`, two of which supply a sink**
    — `src/parser/type-layer-checks.ts:1426–1448`, `checkArrayLiteral(array,
    sink, bindings)`: it maps the elements to types (`:1431`), withholds on a
    withheld binder (`:1437–1439`), and pushes `checkCommonType`'s verdict
    (`:1441–1447`).
    - Binding annotation: `:982`, `this.checkArrayLiteral(stmt.init,
      annotation.element, bindings)` inside the typed-`let` arm, with `:987`
      passing `this.sinkedArrayOf(stmt, annotation)` (`:1456–1468`) as the
      walk's `skipArray` so the sunk literal is not re-checked sink-less.
    - Constructor field: `:1560`, `this.checkArrayLiteral(value,
      declared.element, bindings)` inside `checkObjectField`, whose returned
      node becomes `skipArray` at `:1502` and is passed at `:1504`.
    - `fn` argument: **absent.** `:1986–1991` is the `call` arm —
      `this.checkFnCallArgs(e, bindings)` then `for (const arg of e.args) {
      this.walkExpr(arg, bindings, flow); }`. `walkExpr`'s fourth parameter is
      `skipArray: Expr | null = null` (`:1903–1908`), so every array argument
      reaches `:1946–1948` with `e !== skipArray` true and is checked with
      `sink` `undefined`.
  - **Where the parameter type is already resolved** —
    `src/parser/type-layer-checks.ts:1575`, `checkFnCallArgs`. Its resolution
    ladder is total over `e.callee`: local shadowing returns at `:1576`,
    imported symbols at `:1582` (bug 0138's claim), a non-`fn` callee at
    `:1590`; the surviving path takes `matchedCount = Math.min(e.args.length,
    fn.params.length)` (`:1598`) and, per index, `const paramType =
    annotationToCompatType(p.type)` (`:1601`) — the exact `CompatType` a sink
    needs, discarded after `checkFnArgCompat` (`:1616`) unless the argument is
    unprovable (`:1608–1613`). `annotationToCompatType` is at `:810`.
  - **The LUB that decides rule 3** — `commonType`
    (`src/parser/type-compat.ts:656–677`), 0081's shipped three-clause function:
    a dominating branch (`:664–672`), else `undefined` when any branch is an
    object branch (`:673–675`, rule 3), else `{ kind: "union", arms: branches }`
    (`:676`). `isObjectBranch` at `:698–704`. `checkCommonType` (`:555`) tests
    it at `:592` and raises the code at `:596–605` only when `sink === undefined`
    — the sunk arm at `:566–587` never reaches it.
  - **The inference counterpart** —
    `src/parser/static-type-inference.ts:353–358`, `#commonType`, delegating to
    the same `commonType` with the rule-3 `?? candidates[0]` fallback at `:357`;
    the array-element call at `:218` and the ternary call at `:227`. **This file
    is line-pinned at 378 by eleven open reports** (0019, 0090, 0115, 0126,
    0130, 0136, 0140, 0142, 0145, 0146, 0152) per 0081's fix record; §Fix
    constraint 5 carries the pin forward.
  - **The witnesses a fix here coordinates with** —
    `tests/array-ternary-common-type-union.test.ts` (881 lines, 21 cells): r4
    (`:731`) the binding-annotation sink, r5 (`:743`) the constructor-field
    sink, r6 (`:558`) this report's narrowing pin, r7 (`:790`) rule 3's
    sink-less refusal with the registry *Message* asserted, r7b (`:822`) the
    alias-spelled twin. `tests/fn-arg-type-mismatch-wired.test.ts` (2960
    lines): r4 (`:958`), u3 (`:1324`) and u4 (`:1339`) are the three cells that
    pass an array literal to a declared `array<number>` parameter and assert
    exactly one code — rows g1–g3 below. All three were re-pinned by 0081's
    fix.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is **34** files,
    of which exactly two contain a `[` at all:
    `docs/examples/ralph-inline.theta:22` (`tools: [read, bash]`, a frontmatter
    tools list rather than an expression-position array literal) and
    `docs/examples/fan-out-reviews.theta:9–13` (`let targets = [ … ]`, three
    `string` elements, homogeneous and sink-less — it admits through
    `commonType`'s dominating-branch clause and draws nothing). Zero array
    literals sit at an argument position and zero are heterogeneous, so no
    committed theta draws `theta/parse/array-no-common-type` at all. (0081's
    fix record states "the only multi-element bracket in the corpus is
    `docs/examples/ralph-inline.theta:22`"; re-measured here,
    `fan-out-reviews.theta` is a second one. That record's conclusion — zero
    heterogeneous array literals — is unaffected.) GOV-15: a fix here only
    removes an emission, so no committed theta's diagnostic sequence changes;
    the
    [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
    (`source-language-stability.md:25`) is not engaged at all, because no
    registry row is edited (§Kind element 2).
- **Observed at:** `0.83.0` (HEAD `5de8d78a`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---` on lines 1–3 so the source under test
  begins on line 4. Diagnostic lists are the whole unfiltered `doc.diagnostics`
  in emission order, each range rendered `line:col-line:col`. "Registers" is
  `doc.frontmatter !== null` together with a zero error-severity diagnostic
  count — the load gate at
  `src/extension/production-composition.ts:1562` is
  `const registered = !diagnostics.some((d) => d.severity === "error")`. Three
  scratch vitest files, run on the outputs quoted below, then deleted; `src/`,
  `tests/`, `docs/bugs/README.md` and every other bug document are unmodified
  by this filing.

## Summary

`expressions.md:220` lists the sinks an array literal's element type may be
inferred from: "binding annotation, **parameter type**, or surrounding
constructor field". Rule 3 (`:226`) makes a union sink the sole admission
condition for elements that have no least upper bound: two distinct named
object schemas "yield `array<A | B>` only if some sink in scope expects a
union; otherwise it is `theta/parse/array-no-common-type`".

Two of the three sinks are wired. The parameter type is not. `checkFnCallArgs`
(`type-layer-checks.ts:1575`) resolves the callee's declared parameter type at
`:1601` and uses it to judge the argument as a whole, then the `call` arm walks
each argument with `walkExpr`'s `skipArray` left at its `null` default
(`:1903–1908`, `:1986–1991`), so every array argument reaches `:1946–1948` and
is checked with `sink` `undefined`. Under `fn f(xs: array<A | B>): integer { 1
}`, the call `f([A { a: 1 }, B { b: "x" }])` is therefore judged sink-less and
refused: one `E`-severity `theta/parse/array-no-common-type` at the literal, and
the theta does not register. The identical union spelled at either wired sink —
`let xs: array<A | B> = [A { a: 1 }, B { b: "x" }]`, or the same literal as a
constructor field of `schema S { xs: array<A | B> }` — loads with zero
diagnostics.

The class is what remains of bug 0081's facet (d) after its fix, and it is
strictly smaller than 0081 framed it. A heterogeneous **primitive** literal no
longer needs a sink at all: `commonType` (`type-compat.ts:656`) computes a union
LUB, so `fn f(xs: array<string | null>)` + `f(["a", null])` and
`fn f(xs: array<number | string>)` + `f([1, "a"])` both load clean with no sink
supplied. Only rule 3's no-LUB case still depends on a sink, and only the
parameter position fails to supply one.

The refusal is outside the emitting row's own *Trigger*
(`code-registry-parse.md:41`: "… and **no sink to narrow against**"), so
removing it narrows an emission set onto its registered sentence and engages no
DIAG-2 edit. The consultation point is the one the substrate already built:
0050's `checkFnCallArgs` has the parameter type in hand at `:1601`, and 0081 §Fix
constraint 5 asked for exactly this sequencing — "the two are best sequenced
together so the argument type is resolved once". Both have now landed.

## Reproduction

Offline, deterministic, at HEAD `5de8d78a`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`. Each cell
is the whole diagnostic list in emission order, unfiltered. Frontmatter
`---\nmode: prompt\n---` occupies lines 1–3; the quoted source begins on line 4.

### (a) The pin — a union-typed parameter, rule-3 elements, no other sink

```
schema A { a: integer }
schema B { b: string }
fn f(xs: array<A | B>): integer { 1 }
let y = f([A { a: 1 }, B { b: "x" }])
```

| # | diagnostics | registers |
|---|---|---|
| a1 | `error theta/parse/array-no-common-type @7:11-7:37: array elements have no common type; annotate the binding with array<A \| B> or use a single schema` | **no** |

The same shape with a discriminated-union alias as the parameter's element
type, which removes any question about the union's declaration form:

```
schema A { kind: "a", a: integer }
schema B { kind: "b", b: string }
schema U by kind = A | B
fn f(xs: array<U>): integer { 1 }
let y = f([A { kind: "a", a: 1 }, B { kind: "b", b: "x" }])
```

| # | diagnostics | registers |
|---|---|---|
| a2 | `error theta/parse/array-no-common-type @8:11-8:59: array elements have no common type; annotate the binding with array<A \| B> or use a single schema` | **no** |

### (b) The working sinks — the identical union at the two wired positions

| # | source (line 4 onward) | diagnostics | registers |
|---|---|---|---|
| b1 | `schema A { a: integer }` / `schema B { b: string }` / `let xs: array<A \| B> = [A { a: 1 }, B { b: "x" }]` | `[]` | yes |
| b2 | `schema A { a: integer }` / `schema B { b: string }` / `schema S { xs: array<A \| B> }` / `let s = S { xs: [A { a: 1 }, B { b: "x" }] }` | `[]` | yes |
| b3 | b1's discriminated-union twin: `schema U by kind = A \| B` / `let xs: array<U> = [A { kind: "a", a: 1 }, B { kind: "b", b: "x" }]` | `[]` | yes |
| b4 | the constructor-field sink reached **inside** an argument: `schema S { xs: array<A \| B> }` / `fn f(s: S): integer { 1 }` / `let y = f(S { xs: [A { a: 1 }, B { b: "x" }] })` | `[]` | yes |

b1 and b2 are §Reproduction rows 4/5 of bug 0081, re-measured here rather than
reused. b4 isolates the defect to the *argument* position rather than to
argument *nesting*: a constructor-field sink one level inside an argument still
narrows.

### (c) The narrowing — a literal with an LUB of its own needs no sink

| # | source | diagnostics | registers |
|---|---|---|---|
| c1 | `fn f(xs: array<string \| null>): integer { 1 }` / `let y = f(["a", null])` | `[]` | yes |
| c2 | `fn f(xs: array<number \| string>): integer { 1 }` / `let y = f([1, "a"])` | `[]` | yes |
| c3 | `let x = ["a", null]` — no sink anywhere | `[]` | yes |
| c4 | `fn f(xs: array<A \| B>): integer { 1 }` / `let y = f([A { a: 1 }, A { a: 2 }])` | `[]` | yes |
| c5 | `fn f(xs: array<A \| B>): integer { 1 }` / `let y = f([B { b: "x" }])` | `[]` | yes |
| c6 | `fn f(xs: array<A \| B>): integer { 1 }` / `let y = f([])` | `[]` | yes |

c1 is bug 0081's §Reproduction row 6 and its witness cell r6, re-measured at
this HEAD: it admits because the literal computes `string | null` under rule 2,
**not** because a parameter sink is consulted. c3 is the same literal with no
parameter at all, and answers identically. c4 and c5 admit for the same reason
one clause earlier — `commonType`'s dominating-branch clause. c6 has fewer than
two branches, so `checkCommonType` returns before the LUB is computed
(`type-compat.ts:592`). Together these bound the claim: the parameter sink is
observably absent only where rule 3 is the deciding clause.

### (d) The sink-less rule-3 control — the refusal that is correct

| # | source | diagnostics | registers |
|---|---|---|---|
| d1 | `schema A { a: integer }` / `schema B { b: string }` / `let x = [A { a: 1 }, B { b: "x" }]` | `error theta/parse/array-no-common-type @6:9-6:35: array elements have no common type; annotate the binding with array<A \| B> or use a single schema` | **no** |
| d2 | `fn f(xs): integer { 1 }` / `let y = f([A { a: 1 }, B { b: "x" }])` — unannotated parameter | `error theta/parse/array-no-common-type @7:11-7:37: …` | **no** |

d1 is rule 3 doing its job: no sink is in scope, so the refusal is inside the
row's *Trigger*. It is bug 0081's witness cell r7 and must not move. d2 is the
boundary on the other side: an unannotated parameter supplies nothing for
`annotationToCompatType` to convert (`type-layer-checks.ts:1601–1606` skips the
index), so d2's refusal is correct too.

### (e) The call site already resolves the parameter type

| # | source | diagnostics |
|---|---|---|
| e1 | `fn f(xs: array<string>): integer { 1 }` / `let y = f([1, 2])` | `error theta/parse/fn-arg-type-mismatch @5:11-5:17: fn 'f' argument 0 ('xs') type mismatch: expected array<string>, got array<integer>` |
| e2 | `fn f(xs: array<string>): integer { 1 }` / `let y = f(["a", 1])` | `error theta/parse/fn-arg-type-mismatch @5:11-5:19: fn 'f' argument 0 ('xs') type mismatch: expected array<string>, got array<string \| integer>` |
| e3 | `fn f(xs: array<A>): integer { 1 }` / `let y = f([A { a: 1 }, B { b: "x" }])` | `error theta/parse/array-no-common-type @7:11-7:37: …` |
| e4 | e2's binding twin: `let xs: array<string> = ["a", 1]` | `error theta/parse/let-rhs-type-mismatch @4:1-4:33: let binding 'xs' initialiser type mismatch: expected array<string>, got array<string \| integer>` **and** `error theta/parse/array-element-type-mismatch @4:25-4:33: array element type mismatch at index 1: expected string, got integer` |
| e5 | `fn f(x: A \| B): integer { 1 }` / `let y = f(true ? A { a: 1 } : B { b: "x" })` | `[]` |

e1 and e2 render the resolved parameter type in the *Message*, which is direct
evidence that `annotationToCompatType(p.type)` (`:1601`) produces the exact
`CompatType` a sink needs; nothing further has to be built to consult it. e3 is
the second face of the same omission and the one that makes §Fix a route
choice: rule 1 (`expressions.md:224`) says an element failing an in-scope sink
is `theta/parse/array-element-type-mismatch` "naming the offending element", and
the argument position answers with the sink-**less** code instead. e4 is the
binding position's answer to e2's shape — two `E` lines, 0129's class — and is
what the argument position would start producing if the sink were supplied
wholesale. e5 is the ternary at the same argument position: it draws nothing,
because no ternary reaches `checkCommonType` at all; that is bug 0155's facet
and this report claims no change to it.

### (f) Where the refusal reaches, and what the author must do instead

| # | source | diagnostics |
|---|---|---|
| f1 | the workaround: `fn f(xs: array<A \| B>): integer { 1 }` / `let xs: array<A \| B> = [A { a: 1 }, B { b: "x" }]` / `let y = f(xs)` | `[]` |
| f2 | the union parameter at index 1 of two: `fn f(n: integer, xs: array<A \| B>): integer { 1 }` / `let y = f(1, [A { a: 1 }, B { b: "x" }])` | `error theta/parse/array-no-common-type @7:14-7:40: …` |
| f3 | one nesting level: `fn f(xs: array<array<A \| B>>): integer { 1 }` / `let y = f([[A { a: 1 }, B { b: "x" }]])` | `error theta/parse/array-no-common-type @7:12-7:38: …` |
| f4 | the call inside an `fn` body: `fn f(xs: array<A \| B>): integer { 1 }` / `fn g(): integer { f([A { a: 1 }, B { b: "x" }]) }` | `error theta/parse/array-no-common-type @7:21-7:47: …` |
| f5 | two calls: `let y = f([A { a: 1 }, B { b: "x" }])` / `let z = f([A { a: 2 }, B { b: "y" }])` | the code twice, `@7:11-7:37` and `@8:11-8:37` |
| f6 | a method-call argument: `let s = "ab"` / `let y = s.split([A { a: 1 }, B { b: "x" }])` | `error theta/parse/array-no-common-type @7:17-7:43: …` |
| f7 | an `invoke` argument: `let y = @sub([A { a: 1 }, B { b: "x" }])` | `error theta/parse/unresolved-named-type @6:9-6:13: unresolved named type 'sub'` **and** `error theta/parse/array-no-common-type @6:14-6:40: …` |

f1 is the workaround the *Message* prescribes, and its cost: the author must
introduce a binding that the program did not otherwise need, at the one position
where `expressions.md:220` promises the parameter type would have served. f6 and
f7 measure the same refusal at the method-call and `invoke` argument positions,
whose sinks belong to other rows (§Non-goals).

### (g) The three pinned sibling cells a wholesale sink would move

Cells of `tests/fn-arg-type-mismatch-wired.test.ts`, re-measured at HEAD by
parsing each cell's own fixture:

| # | cell | source | diagnostics at HEAD |
|---|---|---|---|
| g1 | r4 (`:958`) | `fn g(xs: array<number>): number { 1 }` / `let r = g(["a"])` | `error theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('xs') type mismatch: expected array<number>, got array<string>` |
| g2 | u3 (`:1324`) | `fn g(xs: array<number>): number { 1 }` / `let r = g([1, "a"])` | `… expected array<number>, got array<integer \| string>` |
| g3 | u4 (`:1339`) | `fn g(xs: array<number>): number { 1 }` / `let r = g(["a", null])` | `… expected array<number>, got array<string \| null>` |

Each asserts exactly one code. Supplying the parameter type to
`checkArrayLiteral` puts rule 1 in force at these three literals, which adds
`theta/parse/array-element-type-mismatch` beside the code each cell pins — the
shape row e4 measures at the binding position. All three were re-pinned by
0081's fix.

### (h) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → **34** files. A scan for `[` across
all 34 returns hits in exactly two:

| # | file | occurrence | disposition |
|---|---|---|---|
| h1 | `docs/examples/ralph-inline.theta:22` | `tools: [read, bash]` | a frontmatter tools list, not an expression-position array literal |
| h2 | `docs/examples/fan-out-reviews.theta:9–13` | `let targets = [ "docs/guide.md", "docs/tutorial.md", "docs/STYLE.md", ]` | an expression-position array literal, three `string` elements, homogeneous and sink-less — it admits through `commonType`'s dominating-branch clause and draws nothing |

No committed theta passes an array literal as a `fn` argument and none is
heterogeneous, so no committed theta draws `theta/parse/array-no-common-type`
and none draws the diagnostic a fix here removes. 0081's fix record states "the
only multi-element bracket in the corpus is `docs/examples/ralph-inline.theta:22`";
h2 is a second one. That record's conclusion — zero heterogeneous array
literals — is unaffected.

## Expected behaviour

`docs/spec_topics/expressions.md:220` — "`[]` is the empty array; its element
type is inferred from context (binding annotation, **parameter type**, or
surrounding constructor field)." The parameter type is one of the three sinks
by name, on the same footing as the two that are wired.

`docs/spec_topics/expressions.md:226` (rule 3) — "Object schemas do not unify
implicitly — an array containing two different named schemas yields
`array<A | B>` **only if some sink in scope expects a union**; otherwise it is
`theta/parse/array-no-common-type`." Under `fn f(xs: array<A | B>)` a sink in
scope expects exactly that union, so row a1's literal is inside the sentence's
admitting half. Its mirror, `docs/reference/type-system.md:93–95`, states the
condition without the enumeration: "two different named schemas yield
`array<A | B>` only under a union sink".

Rows a1 and a2 should therefore report `[]` and register, on the same footing as
b1 and b2, whose sinks carry the identical union. Rows f2–f5 should report `[]`
for the same reason.

Row d1 does not move: no sink is in scope there, so rule 3's refusal stands —
`docs/spec_topics/expressions.md:226` is the only sink-less rejection the array
rules prescribe, and 0081's fix left it exactly where the spec puts it. Row d2
does not move: an unannotated parameter declares no type to be a sink. Rows
c1–c6 do not move; they already admit, and for a reason that is one clause
earlier than any sink.

Rule 1 (`:224`) governs what happens once a sink IS in scope: "every element
must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
`theta/parse/array-element-type-mismatch` naming the offending element." Row e3
is that case — `B { b: "x" }` under an `array<A>` sink — and reports the
sink-less code instead. Which code it should draw once the parameter sink is
consulted, and whether that code arrives beside `theta/parse/fn-arg-type-mismatch`
or instead of it, is §Fix constraint 3's subject rather than a settled
consequence of the two sentences above.

## Actual behaviour / root cause

The sink set applied at an array literal is enumerated by the three call sites
of `checkArrayLiteral` (`src/parser/type-layer-checks.ts:1426`), and the
argument position is not one of them.

1. **Binding annotation** — `:982`, inside the typed-`let` arm:
   `this.checkArrayLiteral(stmt.init, annotation.element, bindings)`, guarded on
   `stmt.init.kind === "array" && annotation.kind === "array"`. The subsequent
   walk at `:987` passes `this.sinkedArrayOf(stmt, annotation)` (`:1456–1468`)
   as `skipArray`, so the sunk literal is not re-judged sink-less.
2. **Constructor field** — `:1560`, inside `checkObjectField`:
   `this.checkArrayLiteral(value, declared.element, bindings)`, guarded on
   `value.kind === "array" && declared.kind === "array"`, returning the node
   that becomes `skipArray` at `:1502` and is passed to the walk at `:1504`.
3. **Every other array literal** — `:1946–1948`, `walkExpr`'s `array` arm:
   `if (e !== skipArray) { this.checkArrayLiteral(e, undefined, bindings); }`.
   The sink is the literal `undefined`.

`walkExpr` declares `skipArray: Expr | null = null` as its fourth parameter
(`:1903–1908`). The `call` arm (`:1986–1991`) omits it:

```ts
case "call":
  this.checkFnCallArgs(e, bindings);
  for (const arg of e.args) {
    this.walkExpr(arg, bindings, flow);
  }
  return;
```

So an array argument takes route 3 with `sink === undefined`, whatever the
callee declares. `checkCommonType` (`src/parser/type-compat.ts:555`) then runs
its sink-less arm — `commonType(branches, env, checkCompatible) !== undefined`
at `:592` — and `commonType` (`:656`) answers `undefined` for row a1's branches
at its rule-3 gate (`:673–675`), because `isObjectBranch` (`:698`) is true of
both `A` and `B` (`named` resolving to an `object-schema` declaration, TYPE-10)
and no branch dominates the other. The row is raised at `:596–605`.

Nothing about the parameter type is unavailable at that moment.
`checkFnCallArgs` (`:1575`) has already run on the same node, one statement
earlier in the same arm, and has resolved it: `const paramType =
annotationToCompatType(p.type)` (`:1601`). Rows e1 and e2 render that value in
the `fn-arg-type-mismatch` *Message* (`expected array<string>`), so it is a
well-formed `CompatType` of exactly the shape `checkArrayLiteral`'s `sink`
parameter takes — `{ kind: "array", element }`, whose `element` is the union
rule 3 asks about. `checkFnCallArgs` discards it after `checkFnArgCompat`
(`:1616`), and for row a1 it withholds even that judgement: `provableArgType`'s
`array` arm (`:1691–1704`) requires `isProvenReduction(expr.elements,
reduced.element, bindings)` (`:1701`), and `reduced.element` is what
`#commonType`'s rule-3 fallback answers (`static-type-inference.ts:357`,
`?? candidates[0]`) — `A`, which `B { b: "x" }` is not `⊑` under TYPE-10. The
reduction is unproven, the fn-argument judgement is withheld, and a1 therefore
carries one diagnostic rather than two.

The two consequences visible in §Reproduction follow directly. Rows a1/a2/f2–f5
are refused because rule 3's admitting condition is evaluated against a sink set
that structurally cannot contain the parameter type. Row e3 draws the sink-less
code where rule 1 prescribes the element code, because the same omission means
the check never learns there was a sink to fail against.

## Why it matters

- **Source the spec's own rule admits is refused at `E`, and the theta does not
  register.** Row a1 is the exact shape rule 3's admitting clause describes — two
  different named schemas with a union sink in scope — and it is refused. The
  refusal is a load refusal: `production-composition.ts:1562` registers a theta
  only when no diagnostic is error-severity.
- **The emission is outside its own registered *Trigger*.**
  `code-registry-parse.md:41` conditions the row on "no sink to narrow
  against". A reader of the registry cannot predict row a1 from the row.
- **The workaround the *Message* prescribes is unavailable at the position that
  needs it.** The rendered text is "annotate the binding with `array<A | B>`".
  At an argument position there is no binding; the author must add one (row f1)
  purely to carry an annotation the callee already declares. This is the one
  clause of bug 0081 §Why-it-matters item 2 that survives its fix.
- **The same union admits or refuses according to where it is written.** b1
  (binding), b2 (constructor field) and b4 (constructor field nested inside an
  argument) all load; a1 does not. `expressions.md:220` puts all three sinks in
  one list, so the discontinuity is not predictable from the spec.
- **A second, differently-shaped defect rides on the same omission.** Row e3
  reports `theta/parse/array-no-common-type` where rule 1 (`:224`) prescribes
  `theta/parse/array-element-type-mismatch` "naming the offending element". The
  author of `fn f(xs: array<A>)` called with `[A {…}, B {…}]` is told the
  elements have no common type — true, but not the reason the call is wrong, and
  the suggested remedy (annotate a binding with `array<A | B>`) would not make
  the call legal.
- **The cost of closing it is bounded and measured.** Zero committed
  `.theta`/`.thetalib` files pass an array literal as an argument (§Reproduction
  (h)), and the fix's coordination surface is three cells in one sibling witness
  (rows g1–g3) plus 0129's open two-code class.

## Non-goals

- **The ternary half of the common-type rule**, and the DIAG-2 *Trigger*
  adjudication it needs. That is bug 0081's facet (b), filed concurrently as
  [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md). Row e5
  measures a ternary at this report's own argument position drawing
  nothing; that silence is 0155's, not this report's, and no fix here may
  wire a ternary caller. This report needs no *Trigger* edit (§Kind element 2)
  and takes no position on whether 0155's facet warrants one.
- **Heterogeneous primitive literals at any position.** Closed by bug 0081's
  fix in 0.83.0: rows c1, c2 and c3 load today because `commonType` computes
  their union, with no sink consulted. A fix here must leave them at `[]` and
  must not re-derive their admission through a sink.
- **Rule 3's sink-less refusal.** Row d1 must keep drawing
  `theta/parse/array-no-common-type` with the registered *Message* verbatim; it
  is bug 0081's witness cell r7 and the tripwire proving the union arm is gated
  on branch kinds rather than applied blanket. Row d2 (unannotated parameter) is
  the same disposition reached for a different reason.
- **The imported-`.thetalib` callee.** `checkFnCallArgs` returns at
  `type-layer-checks.ts:1582` before resolving any parameter type for an
  imported symbol, so no sink can be supplied there either. That half of the
  call site is [0138](./0138-imported-thetalib-fn-arg-route-deferred.md)'s
  claim; a fix here reaches same-file callees only, and must say so rather than
  silently inherit 0138's deferral.
- **The method-call, `.theta`-callable and `invoke` argument positions.** Rows
  f6 and f7 show the same refusal at `s.split([A {…}, B {…}])` — a stdlib
  method call, judged by `checkMethodCall` (`type-layer-checks.ts:2290`) — and
  at `@sub([A {…}, B {…}])`, whose row `theta/parse/invoke-arg-type-mismatch`
  is open as [0137](./0137-invoke-arg-type-mismatch-unreachable.md). A
  `.theta`-callable call's arguments carry a third row,
  `theta/parse/tool-arg-type-mismatch` (`code-registry-parse.md:115`). None of
  those sinks is claimed here: §Fix's consultation point is `checkFnCallArgs`,
  whose resolution ladder returns before any of them (`:1576`, `:1582`,
  `:1590`).
- **Argument-count checking.** `checkFnCallArgs` iterates
  `Math.min(e.args.length, fn.params.length)` (`:1598`); an excess argument has
  no parameter and therefore no sink. Arity is a different row and no fix here
  changes the bound.
- **A *Message* reword or a new registered code.** DIAG-4 defers wording to
  theta 2.0, and both candidate rows' *Messages* are unplaceholdered on this
  input class.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-layer-checks.ts`; that is bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Fix

Not settled. The constraints below are pinned; the run selects the route and
states its choice with the consequence it accepts.

1. **Supply the callee's parameter type as the array-literal sink at
   `checkFnCallArgs`, resolving the argument type once.** The consultation point
   is `src/parser/type-layer-checks.ts:1575`, which already computes
   `annotationToCompatType(p.type)` at `:1601`; the sink `checkArrayLiteral`
   takes is that value's `element` when its `kind` is `"array"` and the argument's
   `kind` is `"array"` — the same two-sided guard the typed-`let` arm uses at
   `:981` and `checkObjectField` uses at `:1559`. This is the sequencing 0081
   §Fix constraint 5 named: "the `fn`-parameter sink must be supplied at call
   sites … the same call-site boundary bug 0050 reports as uncalled; the two are
   best sequenced together so the argument type is resolved once." Both have
   landed, so the resolution exists on both sides and must not be duplicated: the
   fix reads the parameter type the existing ladder already produced rather than
   re-resolving it beside `checkFnArgCompat`.
2. **The sunk literal must not also be judged sink-less.** `walkExpr`'s
   `skipArray` is a single `Expr | null` (`:1903–1908`), but the `call` arm
   invokes `walkExpr` once per argument (`:1989`), so each invocation can pass
   its own argument's skip with no signature widening — the shape
   `checkObjectField` already uses at `:1502–1504`. Without this, a literal that
   passes the sink check is immediately re-checked at `:1947` with `undefined`
   and rows a1/a2 keep their diagnostic.
3. **State which code a mismatched element draws once a sink is in scope, and
   whether it arrives beside or instead of `theta/parse/fn-arg-type-mismatch`.**
   This is the adjudication, and it is what makes the route a choice rather than
   a mechanical wiring:
   - *Route A — supply the sink wholesale.* Rule 1 (`expressions.md:224`) then
     governs the argument position exactly as it governs the two wired sinks.
     Row e3 changes code from `theta/parse/array-no-common-type` to
     `theta/parse/array-element-type-mismatch`, which is what rule 1 prescribes;
     and rows g1–g3 — cells r4/u3/u4 of
     `tests/fn-arg-type-mismatch-wired.test.ts`, re-pinned by 0081's fix — each
     gain `theta/parse/array-element-type-mismatch` beside the
     `fn-arg-type-mismatch` they pin, reproducing at the argument position the
     two-line shape row e4 measures at the binding position. That is
     [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s open
     class, and 0081's fix needed an operator authorization to ship the same
     pattern at two cells of `tests/index-element-alias-unfolded.test.ts`. A run
     taking this route re-pins g1–g3 with the code ORDER read off the pre-edit
     failure output, records 0129's authority to re-pin them again, and appends a
     disclosure note to 0129.
   - *Route B — consult the parameter type only for rule 3's union-sink gate.*
     The narrow reading of `expressions.md:226`: the parameter type answers "is
     a sink in scope that expects a union", nothing more. Rows a1/a2/f2–f5 admit;
     row e3 keeps `theta/parse/array-no-common-type`; g1–g3 do not move and no
     second `E` line appears anywhere. Cost: `expressions.md:220`'s sink list and
     rule 1 stay unimplemented at the parameter position, so this report's e3
     face survives as a residual that must be filed rather than closed.
   - Whichever route is taken, rows d1 and d2 keep their diagnostic, rows
     c1–c6 and b1–b4 keep `[]`, and row e5 does not move.
4. **No registry edit, and prove it rather than assume it.** The emission being
   removed is outside `code-registry-parse.md:41`'s own *Trigger* ("… and no sink
   to narrow against"), so the change narrows an emission set onto its registered
   sentence and engages no DIAG-2 change. If route A is taken, confirm that
   `theta/parse/array-element-type-mismatch`'s *Trigger* covers an element judged
   against a parameter-supplied sink before emitting it there — the row is the
   one rule 1 names, and no widening should be needed, but the reading is stated
   rather than presumed. GOV-15: zero committed thetas draw the removed
   diagnostic (§Reproduction (h)), and the direction is removal-only under route
   B and removal-plus-addition under route A.
5. **Line-count discipline.** `src/parser/static-type-inference.ts` is at
   **378** lines and eleven open reports cite it by line (0019, 0090, 0115, 0126,
   0130, 0136, 0140, 0142, 0145, 0146, 0152); 0081's fix record makes keeping it
   at 378 an operator-mandated invariant, so a route that touches the inference
   pass carries that constraint. The natural route does not touch it — the sink
   is a checker-side concern and `#commonType`'s rule-3 `?? candidates[0]`
   fallback (`:357`) stays as 0081 left it. `src/parser/type-layer-checks.ts` is
   at **2531** lines; 0081's fix preserved that number but records that the file
   "was not previously under a stated pin", so growth there is admissible and its
   induced citation drift is 0134's class.
6. **The witness.** Offline, provider-free, through `parseThetaDocument`, with
   every asserted *Message* read from the registry
   ([DIAG-4](../spec_topics/diagnostics/diagnostic-shape.md#diag-4),
   `diagnostic-shape.md:74`) and a loud precondition per absence cell so none can
   pass while measuring nothing — the shape
   `tests/array-ternary-common-type-union.test.ts` already uses. It must red
   without the fix at rows a1 and a2, and it must carry rows d1, d2, c1, c3, e5,
   b1 and b2 as green controls, because each is a direction the fix must not
   move. A live H8a admission cell mirroring 0081's `b81livegood` /
   `b81livebroken` pair is the way to prove the registration half of row a1
   through the real composition root, and its refusal control must be d1 so the
   harness is proven able to detect a refusal.

## Provenance

- Spec: `docs/spec_topics/expressions.md:220`, `:222`, `:224`, `:225`, `:226`;
  `docs/reference/type-system.md:83–95`; `docs/spec_topics/type-system.md:27`,
  `:50` (TYPE-9); `docs/spec_topics/diagnostics/code-registry-parse.md:41`,
  `:116`; `docs/reference/diagnostics.md:87`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4);
  `docs/spec_topics/governance/source-language-stability.md:25`
  (diagnostic-registry carve-out).
- Implementation: `src/parser/type-layer-checks.ts:981–982`, `:987`,
  `:1426–1448`, `:1456–1468`, `:1502–1504`, `:1559–1560`, `:1575–1627`
  (`:1576`, `:1582`, `:1590`, `:1598`, `:1601`, `:1608`, `:1616`),
  `:1654`, `:1691–1704` (`:1701`), `:1903–1908`, `:1945–1948`, `:1986–1991`,
  `:2290` (`checkMethodCall`), `:810` (`annotationToCompatType`);
  `src/parser/type-compat.ts:555–606`, `:592`, `:656–677`, `:673–675`,
  `:698–704`; `src/parser/static-type-inference.ts:218`, `:227`, `:353–358`;
  `src/extension/production-composition.ts:1562`.
- Witnesses: `tests/array-ternary-common-type-union.test.ts:558–579` (cell r6,
  the narrowing pin), `:731` (r4), `:743` (r5), `:790` (r7), `:822` (r7b);
  `tests/fn-arg-type-mismatch-wired.test.ts:958` (r4), `:1324` (u3), `:1339`
  (u4); `tests/helpers/e2e-s1.ts:39` (`parseDoc`).
- Prior reports read in full for duplicate separation and cross-reference:
  0081 (including its `## Fix (0.83.0)` record), 0050, 0130, 0138, 0129, 0134.
- Origin: `.pi/tmp/fixes/0081-report.md` §Residuals **R2**, and 0081's
  `## Fix (0.83.0)` residual 2 — evidence banked there, observables re-derived
  here rather than reused.
- Observations: three throwaway vitest parse probes at `5de8d78a`
  (33 sources across §Reproduction (a)–(g)), deleted after the run.
