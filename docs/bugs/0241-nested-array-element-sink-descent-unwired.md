# Bug 0241 — `grammar.md`'s fourth sink bullet, recursive descent into an array-typed sink's element, is unwired at all three type-layer routes: `let xs: array<array<A | B>> = [[A { a: 1 }, B { b: "x" }]]`, the same literal at an `fn` parameter, and the same literal at a constructor field each draw `theta/parse/array-no-common-type` on the INNER literal and do not register, while their one-level-flat twins load clean

- **Status:** fixed (0.208.0). Filed as bug
  [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md)'s
  `## Fix (0.193.0)` *Residuals* item 1 (`:874`): "The recursive-descent sink is
  unwired at every route, and this report's §Expected is falsified for row f3
  … a symmetric pre-existing gap, not filed here — a sibling orchestrator
  wiring the fourth bullet should wire all three routes at once." Independently
  re-measured at HEAD `30c0cb67` (v0.197.0) for this filing; no row below is
  copied from that record. **Ordering:** no report blocks this one. Bugs 0156
  (0.193.0), 0157 (0.180.0) and 0195 (0.190.0) are fixed and shipped; their
  witnesses are LOCKS (§Fix constraint 4), and 0156's paired boundary cell
  (`tests/fn-param-sink-array-literal.test.ts:646`) is the pinning byte this
  report authorises to move.
- **Sev/Diff estimate:** S2/D3 — S2 because the failure is a noisy refusal of
  conformant input rather than silence: a program the spec admits
  (`grammar.md:221` + `expressions.md:228`, rule 3) is refused with an
  error-severity code at all three routes and does not register
  (§Reproduction A1–A5), and a genuine element violation one level down is
  reported under the wrong row — `array-no-common-type` instead of rule 1's
  `array-element-type-mismatch` naming the offending element (A6 against its
  flat twin B4). The nested homogeneous mismatch is NOT silent: the outer
  level's structural `⊑` catches it (C1–C3), so no unchecked-constraint S1
  claim is made here. D3 because the fix touches one shared relation from three
  dispatch positions in `src/parser/type-layer-checks.ts` under pinned-byte
  coordination with three sibling witnesses (0156's 28 cells including the
  paired boundary cell, 0157's 28, 0158's 26) and must settle the
  double-reporting question C1–C3 raise against bug 0129's two-code law.
- **Kind:** defect — implementation only. `docs/spec_topics/grammar.md:214–221`
  and `docs/reference/grammar.md:461–471` both state the four-bullet sink set
  and both are correct as written; no spec sentence changes.
  1. **The nested literal reaches the sink-LESS check.** All three wired
     dispatches hand `checkArrayLiteral` the sink for ONE array node — the
     outer literal. `checkArrayLiteral`
     (`src/parser/type-layer-checks.ts:2082`) maps `typeOf` over
     `array.elements` and pushes `checkCommonType`
     (`src/parser/type-compat.ts:581`); it never inspects whether an element is
     itself an array literal and never passes the sink's element type down. The
     inner literal is then reached by `walkExpr`'s `case "array"` (`:2791`),
     whose `skipArray` guard names the OUTER node alone, so it takes the
     sink-less route `checkArrayLiteral(e, undefined, bindings)` (`:2793`) —
     `checkCommonType`'s `sink === undefined` arm, the only place
     `theta/parse/array-no-common-type` is minted (`type-compat.ts:622–:631`).
  2. **The outer level does not substitute for the descent.** Under a union
     element sink the inner literal has no common type, so its inferred type
     supports no outer verdict: A1's whole diagnostic list is the single inner
     refusal, with no `theta/parse/let-rhs-type-mismatch` beside it. Where the
     inner literal IS homogeneous the outer level's structural `⊑` does report
     (C1–C3), but at the outer index and the outer range — `expected array<A>,
     got array<B>` at index 0 — never naming the offending inner element as
     rule 1 prescribes (`expressions.md:226`).
  3. **The three routes agree, so the defect is one mechanism, not three.**
     The binding annotation (`:1406`, dispatch `:1425`), the `fn` parameter
     (`checkFnCallArgs` `:2320`, dispatch `:2398` — bug 0156's fresh path) and
     the constructor field (`checkObjectField` `:2265`, dispatch `:2293`) all
     produce byte-identical `array-no-common-type` messages on their inner
     literals (A1/A2/A3), and all three flat twins load clean (B1/B2/B3).
- **Related:**
  - [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) —
    **fixed (0.193.0)**, the origin. It wired the second sink bullet (the `fn`
    parameter type at a call site) at `checkFnCallArgs`, which is why route A2
    exists at all, and recorded this class as *Residuals* item 1 together with
    the disclosure that its own §Expected sentence "Rows f2–f5 should report
    `[]`" is FALSE for row f3. **Not a duplicate:** that report is closed on the
    parameter-sink bullet; its witness cell "the nested boundary"
    (`tests/fn-param-sink-array-literal.test.ts:646`) pins the present
    `array-no-common-type` at the argument AND binding routes deliberately, and
    that pin is what a report is needed to move. Its 28-cell witness is a LOCK
    apart from that cell.
  - [0157](./0157-alias-vs-concrete-sink-spelling-code-divergence.md) —
    **fixed (0.180.0)**, the landed law for the three dispatches: each unfolds
    its sink (TYPE-11) before classifying it and keeps the RAW type for the
    whole-value message, so an alias-spelled sink admits on the same footing as
    an inline one. A descent must inherit that shape rather than re-decide it;
    §Reproduction A5 measures the alias spelling of the nested sink. Its
    28-cell witness `tests/alias-sink-array-element-check.test.ts` is a LOCK.
  - [0195](./0195-control-flow-empty-array-iterand-claim-false.md) —
    **fixed (0.190.0), route (a)**, the adjudication that corrected the sink
    pages. Its §Non-goals (`:610–:618`) measures this class as row m3 and
    states the filing condition met here: "no open report owns the fact that a
    written, in-scope `array<A | B>` element sink does not reach a nested
    literal … If route (a) is taken, row m3 needs its own filing." Route (a)
    was taken. Rows m1/m3 of its §(d) table (`:375`, `:376`) are that
    measurement; m3 is §Reproduction A1 and must flip with this fix. Its
    26-cell witness `tests/for-empty-array-iterand-adjudication.test.ts` carries
    no m1/m3 cell — the two rows live in the document alone — but its cell m2
    (`:293–:298`) pins §Reproduction C1's two codes and is a LOCK subject to
    §Fix constraint 3.
  - [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md) —
    **fixed (0.181.0)**, the LUB discipline behind `commonType`
    (`src/parser/type-compat.ts:682`), which the sink-less arm consults. Its
    26-cell witness `tests/match-fn-return-lub-dominating-discipline.test.ts`
    is a LOCK; no route here edits `commonType` or its callers.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) —
    **fixed (0.171.0)**, the two-code law governing whether a whole-value
    verdict and an element verdict may both stand at one position. Rows C1–C3
    are that law at the nested level and constrain the fix (§Fix constraint 3).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Every citation here is
    symbol-named beside its line number and verified at HEAD `30c0cb67`.
- **Affected** (every citation verified against the tree at HEAD `30c0cb67`,
  v0.197.0 — `package.json:3`; symbol-named per bug 0134's adjudication):
  - **The relation that would carry the descent** —
    `TypeLayerWalk.checkArrayLiteral` (`src/parser/type-layer-checks.ts:2082`),
    whose body is `array.elements.map((e) => this.typeOf(e, bindings))`
    (`:2087`), the withheld-binder guard (`:2093–:2095`) and one
    `checkCommonType` push (`:2096–:2103`). It takes `sink: CompatType |
    undefined` and never recurses.
  - **Dispatch 1, the binding annotation** — the `let` arm's
    `sinkedArrayOf(stmt, annotation)` (`:1406`, helper declared `:2113`, TYPE-11
    unfold `:2120`), the sunk check at `:1425`, and the walk's skip of that one
    node at `:1430` (`sunkArray === null ? null : sunkArray.node`).
  - **Dispatch 2, the `fn` parameter type** — `checkFnCallArgs` (`:2320`, doc
    `:2310–:2319`), bug 0156's landed shape: per matched index the TYPE-11
    unfold `:2396` and, under the two-sided `array`/`array` guard `:2397`,
    `this.checkArrayLiteral(arg, unfolded.element, bindings)` (`:2398`) with the
    argument recorded in the returned `ReadonlySet<Expr>` (`:2399`). Consumed
    once by `walkExpr`'s `case "call"` (`:2846`, call `:2851`, per-argument walk
    `:2853`).
  - **Dispatch 3, the constructor field** — `checkObjectField` (`:2265`), the
    TYPE-11 unfold `:2291` and the dispatch `:2292–:2294`, returning the node so
    `checkObjectFields` (`:2142`) passes it as `skipArray`.
  - **The sink-less route the nested literal takes** — `walkExpr`'s
    `case "array"` (`:2791`): `if (e !== skipArray) { this.checkArrayLiteral(e,
    undefined, bindings) }` (`:2792–:2794`), then
    `for (const el of e.elements) { this.walkExpr(el, bindings, flow) }`
    (`:2795–:2797`) — the recursion that reaches the inner literal, with the
    fourth argument omitted, which is where a descent would be supplied.
  - **The two codes and where each is minted** — `checkCommonType`
    (`src/parser/type-compat.ts:581`): the `sink !== undefined` arm
    (`:592–:613`) mints `theta/parse/array-element-type-mismatch` naming the
    first failing branch index (`:600–:610`); the sink-less arm (`:615–:631`)
    consults `commonType` (`:682`) and mints
    `theta/parse/array-no-common-type` (`:622–:631`).
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:43`
    (`theta/parse/array-element-type-mismatch`, *Trigger* "Array literal element
    does not type-check against the surrounding sink's element type") and `:44`
    (`theta/parse/array-no-common-type`, *Trigger* "… elements have no common
    type **and no sink to narrow against**"). Rows A1–A5 write a sink and draw
    `:44` anyway, so each emission sits outside its own registered *Trigger*;
    removing them NARROWS an emission set onto its registered sentence and
    engages no DIAG-2 edit. Message-only mirror: `docs/reference/diagnostics.md`.
  - **The contract** — `docs/spec_topics/grammar.md:214–221`, §"`array<T>`
    literal type-sink rule": "The sink set is exhaustive", fourth bullet
    (`:221`) "The element type of an array-typed sink that this literal is
    itself an element of (recursive descent)." Prose mirror:
    `docs/reference/grammar.md:461–471` ("the element type of an array-typed
    sink this literal is an element of (recursive)"). Rules:
    `docs/spec_topics/expressions.md:226` (rule 1, element-wise `⊑` under an
    in-scope sink) and `:228` (rule 3, two named schemas yield `array<A | B>`
    "only if some sink in scope expects a union"). The sink definition:
    `docs/spec_topics/glossary.md:67`.
  - **The registration gate** — `hasLoadParseError`
    (`src/extension/production-composition.ts:2220`, consulted `:1502`,
    `:1924`, `:2108`): any error-severity `theta/load/` or `theta/parse/` code.
    Every (A) row draws one, so none of those thetas registers.

## Reproduction

Zero model turns, no provider contacted. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines of frontmatter) parsed through
the shipped whole-document entry point `parseThetaDocument`
(`src/parser/theta-document.ts`), wrapped by `parseDoc`
(`tests/helpers/e2e-s1.ts:39`). `diags` is the whole unfiltered list in
emission order. `[]` means the theta registers (`hasLoadParseError`,
`src/extension/production-composition.ts:2220`). Every body is prefixed by the
two declarations `schema A { a: integer }` and `schema B { b: string }`; rows
naming `C` add `schema C { c: boolean }`. `/` = newline.

### (A) The class — a written, in-scope element sink does not reach the nested literal

| row | source under test | diags |
| --- | --- | --- |
| A1 binding annotation | `let xs: array<array<A \| B>> = [[A { a: 1 }, B { b: "x" }]]` / `xs` | `error theta/parse/array-no-common-type @7:32-7:58: array elements have no common type; annotate the binding with array<A \| B> or use a single schema` |
| A2 `fn` parameter (bug 0156's route) | `fn f(xs: array<array<A \| B>>): integer { 1 }` / `let y = f([[A { a: 1 }, B { b: "x" }]])` / `y` | `error theta/parse/array-no-common-type @8:12-8:38: <same message>` |
| A3 constructor field | `schema S { items: array<array<A \| B>> }` / `let s = S { items: [[A { a: 1 }, B { b: "x" }]] }` / `s` | `error theta/parse/array-no-common-type @8:21-8:47: <same message>` |
| A4 one level deeper | `let xs: array<array<array<A \| B>>> = [[[A { a: 1 }, B { b: "x" }]]]` / `xs` | `error theta/parse/array-no-common-type @7:40-7:66: <same message>` |
| A5 alias-spelled element sink | `schema L = array<A \| B>` / `let xs: array<L> = [[A { a: 1 }, B { b: "x" }]]` / `xs` | `error theta/parse/array-no-common-type @8:21-8:47: <same message>` |
| A6 a genuine element violation under the nested union sink | `let xs: array<array<A \| B>> = [[A { a: 1 }, C { c: true }]]` / `xs` | `error theta/parse/array-no-common-type @7:32-7:59: <same message>` |

A1–A3 are the three routes. Each reports exactly ONE diagnostic — the inner
literal's sink-less refusal — with no outer-level code beside it, so the outer
dispatch neither narrows the inner literal nor judges it. A4 shows the gap is
not depth-1-specific. A5 shows it is not the alias spelling bug 0157 settled:
the sink unfolds at the outer level and the inner literal is still refused. A6
is the misattribution row: `C` violates the declared `A | B` element type and
is never named; the whole inner literal draws the no-sink row instead. Compare
B4.

### (B) The flat twins — the same sinks, one level up, admit

| row | source under test | diags |
| --- | --- | --- |
| B1 binding annotation | `let xs: array<A \| B> = [A { a: 1 }, B { b: "x" }]` / `xs` | `[]` |
| B2 `fn` parameter | `fn f(xs: array<A \| B>): integer { 1 }` / `let y = f([A { a: 1 }, B { b: "x" }])` / `y` | `[]` |
| B3 constructor field | `schema S { items: array<A \| B> }` / `let s = S { items: [A { a: 1 }, B { b: "x" }] }` / `s` | `[]` |
| B4 A6's violation, flat | `let xs: array<A \| B> = [A { a: 1 }, C { c: true }]` / `xs` | `error theta/parse/array-element-type-mismatch @7:24-7:51: array element type mismatch at index 1: expected A \| B, got C` |

B1–B3 are rule 3 in force at the three wired sinks: the same two schemas, the
same union, admitted. B4 is rule 1 in force at the same position: the offending
element is named by index and by type. A1–A3 and A6 are those four rows with
one `array<…>` wrapped around sink and literal alike.

### (C) The nested homogeneous mismatch is reported — at the outer level, by the outer rule

| row | source under test | diags |
| --- | --- | --- |
| C1 binding annotation | `let xs: array<array<A>> = [[B { b: "x" }]]` / `xs` | `error theta/parse/let-rhs-type-mismatch @7:1-7:43: let binding 'xs' initialiser type mismatch: expected array<array<A>>, got array<array<B>>`, `error theta/parse/array-element-type-mismatch @7:27-7:43: array element type mismatch at index 0: expected array<A>, got array<B>` |
| C2 `fn` parameter | `fn f(xs: array<array<A>>): integer { 1 }` / `let y = f([[B { b: "x" }]])` / `y` | `error theta/parse/fn-arg-type-mismatch @8:11-8:27: fn 'f' argument 0 ('xs') type mismatch: expected array<array<A>>, got array<array<B>>`, `error theta/parse/array-element-type-mismatch @8:11-8:27: array element type mismatch at index 0: expected array<A>, got array<B>` |
| C3 constructor field | `schema S { items: array<array<A>> }` / `let s = S { items: [[B { b: "x" }]] }` / `s` | `error theta/parse/object-field-type-mismatch @8:20-8:36: field 'items' on schema 'S' type mismatch: expected array<array<A>>, got array<array<B>>`, `error theta/parse/array-element-type-mismatch @8:20-8:36: array element type mismatch at index 0: expected array<A>, got array<B>` |

These three rows bound the report: a homogeneous inner literal of the wrong
element type is caught by the outer level's structural `⊑`, at index 0 of the
OUTER literal and at the outer range, naming `array<A>` / `array<B>` rather
than the inner element. No value is admitted unchecked in this shape, which is
why no S1 claim is made. A route that adds an inner-level rule-1 emission here
must settle whether a third code stands beside these two (§Fix constraint 3).

### (D) Controls that must not move

| row | source under test | diags |
| --- | --- | --- |
| D1 conformant nested, binding | `let xs: array<array<A>> = [[A { a: 1 }]]` / `xs` | `[]` |
| D2 conformant nested, `fn` parameter | `fn f(xs: array<array<A>>): integer { 1 }` / `let y = f([[A { a: 1 }]])` / `y` | `[]` |
| D3 conformant nested, constructor field | `schema S { items: array<array<A>> }` / `let s = S { items: [[A { a: 1 }]] }` / `s` | `[]` |
| D4 conformant nested, primitives | `let xs: array<array<string>> = [["a", "b"]]` / `xs` | `[]` |
| D5 empty inner literal | `let xs: array<array<A>> = [[]]` / `xs` | `[]` |

D5 is bug 0195's row m1 re-measured: an empty inner literal draws nothing today
and must still draw nothing after the descent lands — the descent supplies a
sink, and a sunk empty literal has no branch to fail.

## Expected behaviour

`docs/spec_topics/grammar.md:221` declares the element type of an array-typed
sink to be a sink for the literals that are its elements, and calls the
four-bullet set exhaustive. Under that bullet, A1–A5 are the three wired sinks
one level down and each must report `[]` and register, exactly as B1–B3 do. A6
must report `theta/parse/array-element-type-mismatch` naming index 1 and
`expected A | B, got C` — rule 1 (`expressions.md:226`) at the inner level, the
verdict B4 gives for the same violation flat. `theta/parse/array-no-common-type`
must not be minted at any position where a sink is in scope, which is what its
registered *Trigger* already says (`code-registry-parse.md:44`, "and no sink to
narrow against").

## Actual behaviour / root cause

`checkArrayLiteral` (`src/parser/type-layer-checks.ts:2082`) judges one level:
it types each element with `typeOf`, hands the list and the sink to
`checkCommonType` (`src/parser/type-compat.ts:581`), and stops. No caller and
no callee passes the sink's element type to an element that is itself an array
literal. The three dispatches each mark exactly one node as sunk — `:1425` +
the `skipArray` at `:1430`, `:2398` + the `ReadonlySet<Expr>` consumed at
`:2851`, `:2293` + the returned node — so `walkExpr`'s `case "array"` (`:2791`)
sees the inner literal with `skipArray` unset and routes it to
`checkArrayLiteral(e, undefined, bindings)` (`:2793`). In that call
`checkCommonType`'s sink-less arm asks `commonType` for a dominating member,
two distinct named schemas have none (TYPE-10 nominality), and
`theta/parse/array-no-common-type` is minted (`type-compat.ts:622–:631`) at the
inner literal's own range — the ranges in A1–A6.

The outer level cannot cover for it. Under a union element sink the inner
literal's own type is unresolvable, so the outer `⊑` withholds and A1's list is
the single inner refusal. Where the inner literal is homogeneous the outer `⊑`
does decide (C1–C3), but as a whole-value judgement at the outer index.

## Why it matters

Programs the spec admits are refused, at all three sinks, with an
error-severity code: an `array<array<A | B>>` binding, parameter or field
cannot be initialised with a nested literal of two schemas at all, and the
whole theta fails to register (`hasLoadParseError`). The workaround is to lift
each inner literal into its own annotated `let`, which the sink bullet exists
to make unnecessary.

The refusal also sits outside its own registered *Trigger*: `:44` fires only
"with no sink to narrow against", and A1–A5 write one. A reader reconciling
`grammar.md`'s exhaustive four-bullet set against the diagnostic gets a
contradiction with no report to point at — the condition bug 0195 §Non-goals
left open for row m3.

Finally, a real violation is reported under the wrong row (A6 against B4): the
element that breaks the declared element type is not named, so the message
directs the author to annotate a binding that is already annotated.

## Fix

Wire `grammar.md:221`'s fourth bullet by making the element sink descend, at
all three routes at once, through the one relation they share. In
`checkArrayLiteral` (`src/parser/type-layer-checks.ts:2082`), when a sink is in
scope, unfold it (TYPE-11, `unfoldAlias`) and — for each element that is itself
an array literal and whose unfolded sink is `array` — judge that element
against the sink's element type by the same call, recursively, and mark it so
`walkExpr`'s `case "array"` (`:2791`) does not re-judge it sink-less. Placing
the descent in the shared relation rather than in the three dispatches is what
keeps the routes symmetric: none of `:1425`, `:2398` or `:2293` needs a new
argument, and no fourth position can drift.

Constraints:

1. **Inherit bug 0157's landed shape, do not re-decide it.** The descent
   unfolds before classifying and keeps the RAW sink for any whole-value
   message, exactly as the three dispatches do at `:1469`/`:2291`/`:2396`. Row
   A5 is the measurement; 0157's 28-cell
   `tests/alias-sink-array-element-check.test.ts` is a LOCK.
2. **Inherit bug 0156's skip discipline.** Every node the descent judges must
   reach `walkExpr`'s array arm as a skipped node, or A1–A3 keep their
   diagnostic from the second, sink-less judgement — the failure mode 0156 §Fix
   constraint 2 names. 0156's 28-cell
   `tests/fn-param-sink-array-literal.test.ts` is a LOCK apart from its paired
   boundary cell at `:646`, which this fix flips at both routes together (the
   cell's own comment states the symmetry it asserts).
3. **Settle the code count at rows C1–C3 explicitly.** Those rows already draw
   two codes; a descent that also emits rule 1 at the inner level would make
   three. Bug 0129's two-code law
   ([0129](./0129-empty-object-field-type-draws-two-diagnostics.md)) governs the
   disposition and the run states which it takes, with C1–C3 pinned by cell
   either way. No new registry code is minted in either disposition — both
   emissions are existing rows.
4. **No DIAG-2 edit.** Removing A1–A5's emissions narrows
   `theta/parse/array-no-common-type` onto its registered *Trigger* and adds no
   emission site for `theta/parse/array-element-type-mismatch` beyond what
   `:43` already covers. `docs/spec_topics/diagnostics/code-registry-parse.md`
   and the DIAG-2 baseline
   (`tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json`) stay
   untouched; the corpus gates
   (`registry-closed-set-corpus-gate`, `committed-fixture-parse-gate`) stay
   green.
5. **No spec edit.** `grammar.md:214–221`, `docs/reference/grammar.md:461–471`
   and `expressions.md:222–228` state the intended behaviour already. The fix
   makes the implementation match them; a route that instead deletes the fourth
   bullet is a GOV-15 source-language change and is not this report's route.
6. **Flip bug 0195's row m3.** That report's §(d) table states A1's current
   disposition as row m3 (`docs/bugs/0195-control-flow-empty-array-iterand-claim-false.md:376`)
   and D5's as row m1 (`:375`), both as recorded facts. Row m3's stated
   disposition must be corrected by this fix and row m1 must not move; cell m2
   of `tests/for-empty-array-iterand-adjudication.test.ts` (`:293–:298`) is C1
   and moves only under constraint 3. Bug 0158's 26-cell `tests/match-fn-return-lub-dominating-discipline.test.ts` is
   a LOCK; `commonType` (`src/parser/type-compat.ts:682`) and its LUB
   discipline are not edited.
7. **Boundaries that must not move.** The `for` iterand is not a sink and does
   not become one (`grammar.md:223`, bug 0195's adjudication); the imported
   `.thetalib` callee still supplies no parameter sink (bug 0138); the method
   call, `.theta`-callable and `invoke` argument positions are unmoved (bug
   0137); the ternary at an argument position is unmoved (bug 0155). Rows
   D1–D5 are the silence controls.

## Provenance

Filed from bug 0156's `## Fix (0.193.0)` *Residuals* item 1 (`:874`) and bug
0195's §Non-goals row m3 (`:610–:618`), both of which record the class and
neither of which claims it. Every row in §Reproduction was measured at HEAD
`30c0cb67` (v0.197.0) with scratch probes over `parseDoc`
(`tests/helpers/e2e-s1.ts:39`), run and deleted; every citation was checked
against the tree at that HEAD.

## Fix (0.208.0)

- What shipped:
  - `src/parser/type-layer-checks.ts` — `TypeLayerWalk.checkArrayLiteral` carries
    the descent and returns `ReadonlySet<Expr>`, the array nodes it judged under
    a sink (itself, plus the nested literals it reached). §Fix's one-relation
    route: none of the three dispatches gained an argument.
  - `src/parser/type-layer-checks.ts` — the descent unfolds (TYPE-11,
    `unfoldAlias`) before classifying and recurses with the unfolded sink's
    element type for each element whose kind is `array`; the RAW sink still
    renders every whole-value message (§Fix constraint 1, bug 0157's shape).
    Row A5 is the measurement.
  - `src/parser/type-layer-checks.ts` — the skip discipline widens from one node
    to a set: `walkExpr`'s fourth parameter is `sunkArrays: ReadonlySet<Expr>`
    defaulting to the module-scope empty `NO_SUNK_ARRAYS`, its `array` arm tests
    membership and rides the set down the element recursion, its `call` arm
    hands each argument walk the whole `sunkArgs` set, and `checkObjectField` /
    `checkObjectFields` carry a set instead of `Expr | null` (§Fix constraint 2,
    bug 0156's discipline). The binding arm still skips its own node where the
    check withholds on a withheld binder.
  - `src/parser/type-layer-checks.ts` — `markNestedArrayLiterals`, the
    withholding twin of the judging traversal: where this level's own
    `checkCommonType` reported, the nested literals are marked skipped WITHOUT
    being judged, so withholding means no verdict rather than a sink-less one.
    It follows the array-element chain alone; a literal inside an object-field
    value or a call argument keeps its own sink route (row F5).
  - `tests/nested-array-element-sink-descent.test.ts` — the witness, 26 cells:
    (A) rows A1–A6, (B) the flat twins B1–B4, (C) rows C1–C3 plus E1 at two
    codes, (D) the silence controls D1–D5, (E) anti-vacuity, (F) rows F1–F5, the
    refused-outer shapes constraint 3's disposition governs.
  - `tests/live/nested-array-element-sink-descent-live-cell.test.ts` — the H8a
    live cell: the nested-sink document registers through the real
    discovery/session_start path and drives to a pinned sentinel with no
    `array-no-common-type` on the `theta-system-note` channel, against a refused
    control that must still not register.
  - `tests/fn-param-sink-array-literal.test.ts` — the one authorised cell flip
    (§Fix constraint 2): bug 0156's paired boundary cell now asserts that the
    nested sink narrows at the argument route and the binding route alike, with
    a violation control at both routes proving the admission is not vacuous.
- The code count at rows C1–C3 (§Fix constraint 3), settled in-run: **one
  verdict per literal**. The descent judges an element only where the enclosing
  literal's own `checkCommonType` reported nothing; where that level has already
  refused the literal, an element verdict is DERIVED from re-reading the same
  text as conformant and withholds, which is bug 0129's landed law at one more
  position. Rows C1–C3 and E1 therefore keep exactly the two codes they draw
  today — no third — and bug 0195's cell m2
  (`tests/for-empty-array-iterand-adjudication.test.ts:293–298`) does not move.
  Withholding is not silence-by-omission: rows F1–F4 pin that the withheld
  nested literals draw nothing at all, rather than falling back to the sink-less
  row at a position where the sink is written and in scope.
- Gates: witness `npx vitest run tests/nested-array-element-sink-descent.test.ts`
  → 26 passed (26). Full default suite `npm test` → 389 files, 8073 tests, 0
  failed. `npm run typecheck` → rc 0, no output. `npm run lint` → rc 0, no
  output. Live, under the shared lock:
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/nested-array-element-sink-descent-live-cell.test.ts
  tests/live/fn-param-sink-array-literal-live-cell.test.ts
  tests/live/alias-sink-array-element-check-live-cell.test.ts` → the two adjacent
  cells green first attempt; the new cell drew one sentinel refusal (the model
  declined to echo the token, naming prompt injection) and was green on one
  isolated re-run with no edit between runs — the stochastic class, not a
  defect.
- Review: 2 rounds. Round 1 (deep) — one `correctness` blocker: on the
  refused-outer path the nested literals were returned unmarked and leaked to
  the sink-less arm, minting `array-no-common-type` where a sink is in scope, at
  all three routes and at depth 2; plus three prose/house-rule items (a false
  "Frozen" claim on `NO_SUNK_ARRAYS`, line-form citations into a file whose
  lines this diff moves, two banned words). All four fixed; the blocker became
  `markNestedArrayLiterals` and witness group (F). Round 2 (fast) — CLEAN, with
  one non-blocking test residual (below).
- Verification: SOLID. (1) Both halves witnessed in both directions by temporary
  local neutralisation, restored byte-exact (`git hash-object` equal each time):
  stubbing the judging descent reds A1–A6 with the documented signature
  (`expected [ 'theta/parse/array-no-common-type' ] to deeply equal []`, and A6's
  code swap), stubbing `markNestedArrayLiterals` reds F1–F4 with the leaked
  second code. (2) Default suite 389/8073 green. (3) Three live H8a cells run for
  real under the lock, all green. (4) Typecheck and lint rc 0.
- Residuals:
  1. **Row F5's isolation is incidental, not load-bearing.** The row pins that a
     call argument's own `array-no-common-type` survives inside a withheld
     enclosing array. `walkExpr`'s `case "call"` derives a fresh `sunkArgs` from
     `checkFnCallArgs` and discards the inbound set, so an over-marking
     `markNestedArrayLiterals` would not red F5. The end state the row asserts is
     true and worth pinning; the claim in its comment that the element chain is
     what confines the marking is defended by the call arm's reset rather than by
     the traversal. Evidence: round 2's mutation probe (over-marking through a
     `call` element's `args`) left F5 green.
  2. **One sentinel-refusal instance on the new live cell.** Captured name:
     sentinel refusal. First run refused to echo the token (12.9 s), isolated
     re-run green (1.8 s), no edit between. Recorded so a future red on this cell
     is classified before it is attributed.
  3. **`tests/match-fn-return-lub-dominating-discipline.test.ts:109` cites
     `type-layer-checks.ts:2652` for the `sink: undefined` match-arm site.** The
     citation was already stale before this change and this change moves the site
     further. Bug 0134's do-not-chase class; not chased, and that file is a LOCK
     witness this fix does not edit.
- Discharge notes appended: 0156 (*Residuals* item 1), 0195 (row m3).
- Pinned dispositions / non-goals: no DIAG-2 edit and no registry edit —
  `code-registry-parse.md` and `tests/fixtures/diag2/` are byte-untouched, and
  removing rows A1–A5's emissions narrows `theta/parse/array-no-common-type` onto
  its own registered *Trigger* (§Fix constraint 4). No spec edit (§Fix constraint
  5): `grammar.md`, `docs/reference/grammar.md` and `expressions.md` already state
  the behaviour. `src/parser/type-compat.ts` is untouched, so `commonType` and its
  LUB discipline are unmoved (§Fix constraint 6, bug 0158's LOCK). The `for`
  iterand, the imported `.thetalib` callee, the method call, the
  `.theta`-callable, the `invoke` argument and the ternary at an argument
  position are all unmoved (§Fix constraint 7); rows D1–D5 are the controls.
