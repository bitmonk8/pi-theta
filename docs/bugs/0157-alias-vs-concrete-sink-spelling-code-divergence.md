# Bug 0157 — The three array-literal sink dispatches classify the sink by raw `CompatType.kind` with no `unfoldAlias`, so an alias-spelled `array<T>` annotation or field type routes the literal down the sink-LESS `checkCommonType` path and one written mistake draws a different code set on each spelling: `schema U = array<string>` + `let xs: U = ["a", 1]` draws `theta/parse/let-rhs-type-mismatch` alone where the concrete twin draws that AND `theta/parse/array-element-type-mismatch` with the offending index, and `schema U = array<A | B>` + `let xs: U = [A { … }, B { … }]` is refused outright with `theta/parse/array-no-common-type` — whose *Trigger* reads "no sink to narrow against" — where the concrete twin loads

- **Status:** fixed (0.180.0). At filing, §Fix was constraint-pinned, not settled: the unfold-before-classify
  edit is one line at each of three dispatch sites, but its count consequence
  is open bug [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s
  class and the run must state which of the two reports settles it. No ordering
  dependency in either direction: both reports' subjects are stable at HEAD
  under either landing order, and §Fix (c) fixes what each owes the other.
  This report supersedes bug
  [0125](./0125-index-element-narrowing-not-alias-unfolded.md) §Reproduction
  (f) as the baseline for this defect — every value recorded there was measured
  before the bug 0081 fix and five of the eight rows have since moved.
- **Sev/Diff estimate:** S2/D3 — S2 on two measured faces, both inside "wrong or
  misleading failure": the alias spelling loses the element-position diagnostic
  and its index (f3/f5 against f4/f6, m1 against m2), and a spec-legal binding
  whose elements are two different named schemas is refused under the alias
  spelling and admitted under the concrete one (o1/o3 against o2/o4), with the
  refusal's *Remedy* line instructing the author to write the annotation they
  already wrote. Not S1: across the 34 cells below nothing is silently
  accepted — every cell whose concrete twin reports also reports under the
  alias spelling, every reported code is `E`, and `hasLoadParseError`
  (`src/extension/production-composition.ts:2047`) denies registration either
  way. D3 because §Fix needs an in-run adjudication it shares with 0129, and
  because closing it re-pins group (f) of
  `tests/index-element-alias-unfolded.test.ts` a second time — cells f4 and f6
  are already carrying an operator authorization from the bug 0081 fix.
- **Kind:** defect, two elements.
  1. *A diagnostic set that depends on the spelling of the sink, not on the
     mistake.* `docs/spec_topics/expressions.md:224` (rule 1) obliges the
     element check whenever "a type sink is in scope (binding annotation,
     parameter type, etc.)"; `docs/spec_topics/type-system.md:54` (TYPE-11)
     makes `U` declared `schema U = array<string>` the type `array<string>`
     wherever a `⊑` question is asked of it. A sink is therefore in scope in
     f3 and f5, and rule 1's obligation is unmet at both.
  2. *An emission outside its own registered Trigger.*
     `theta/parse/array-no-common-type`'s *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:41`) is "Array
     literal whose elements have no common type **and no sink to narrow
     against**". Rows o1, o3 and x1 each write a sink and each draw that code,
     so the emission sits outside the row as written. Under
     [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the
     registry is the closed authority for what the runtime emits — the same
     fault bug 0125's own fix record prosecutes at
     `theta/parse/non-array-iterand`.
- **Related:**
  - [0125](./0125-index-element-narrowing-not-alias-unfolded.md) — **fixed
    (0.76.0)**, the origin. Its §Reproduction (f) recorded these three sites as
    a separate report and never filed it; its §Fix (d) pinned their behaviour
    as tripwires; its §Fix §Residuals ("The three sink-routing siblings keep
    their measured divergence, tripwired by group (f)") is the
    recorded-not-filed item this report discharges. Its tail carries the
    discharge note bug 0081 appended. Two claims in that note are narrower than
    they read — see §Provenance.
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **fixed
    (0.83.0)**, the half-closure. Its computed-LUB union arm changed what the
    sink-less path answers once taken, closing f1's false `E` and relabelling
    f3/f5; it did not touch the routing (`src/parser/type-layer-checks.ts` is
    comment-only in its diff). Its fix report §Residuals R3 banks the evidence
    and directs whoever files this to re-derive rather than reuse.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    and coupled by consequence. f4 and f6 are instances of its class today (two
    `E` codes for one written mistake, count ungoverned by the corpus). The
    natural direction of this fix — route the alias spelling down the same
    element check — makes f3 and f5 draw two codes as well, doubling the
    instances 0129 adjudicates. §Fix (c) states what each report owes the
    other.
  - [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) —
    **open**, the adjacent half of the same `checkCommonType` sink parameter:
    there the `fn`-parameter sink is never supplied at all, on either spelling
    (cells p1/p2, o5/o6 below). Neither report's route needs the other's, and
    both touch `checkArrayLiteral`'s callers, so whichever lands second rebases
    onto the first's call shape.
  - [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md) —
    **open**, the sibling shape one axis over: there one written mistake draws a
    different NUMBER of same-code diagnostics on each of three call spellings;
    here one written mistake draws a different SET of codes on two spellings of
    one sink. Both rest on the same absent corpus sentence about intra-site
    diagnostic multiplicity, and 0129 owns the adjudication for both.
- **Affected** (every citation verified at HEAD `5de8d78a`, 0.83.0):
  - **The three dispatch sites** — `src/parser/type-layer-checks.ts`, 2531
    lines at HEAD. Bug 0125 recorded them at `:620`, `:958` and `:1050` against
    `552b4ace`; those positions are stale and the sites are re-anchored here by
    symbol.
    - `:981–983`, inside `walkStmt`'s `case "let"` (`walkStmt` at `:943`, the
      arm at `:945`) —
      `if (stmt.init.kind === "array" && annotation.kind === "array") { this.checkArrayLiteral(stmt.init, annotation.element, bindings); }`.
      `annotation` is `annotationToCompatType(stmt.annotation)` (`:810`),
      resolved at `:953–956`, and is never unfolded before the `kind` test.
    - `:1456–1467` — `sinkedArrayOf`, whose `annotation.kind === "array"`
      conjunct is `:1462`. Its return value is `walkExpr`'s `skipArray`
      argument, so a `null` here is what lets the sink-less check run a second
      time on the same node.
    - `:1559–1562`, inside `checkObjectField` (`:1535`) —
      `if (value.kind === "array" && declared.kind === "array") { this.checkArrayLiteral(value, declared.element, bindings); return value; }`.
      `declared` is the schema's raw declared field type, from
      `declaredFieldsOf` (`:1512`).
  - **The sink-less path they fall to** — `walkExpr`'s `case "array"` at
    `:1945–1948`, calling `this.checkArrayLiteral(e, undefined, bindings)` at
    `:1947`; `checkArrayLiteral` itself at `:1426–1448`, which forwards `sink`
    verbatim to `checkCommonType`.
  - **The two arms that then disagree** — `src/parser/type-compat.ts`, 704
    lines. `checkCommonType` at `:555`: the sunk arm `:566–587` mints
    `theta/parse/array-element-type-mismatch` at `:577` with the index `i`; the
    sink-less arm `:589–605` mints `theta/parse/array-no-common-type` at `:599`
    and is reachable **only** when `sink === undefined`, which is what makes
    every `array-no-common-type` in §Reproduction (b) a proof of the routing.
    `commonType` (the bug 0081 LUB) at `:656`.
  - **The alias transparency the same file already applies everywhere else** —
    `unfoldAlias` at `type-compat.ts:155`; `checkCompatible` at `:139` unfolds
    BOTH operands at `:144`, so `checkLetRhsCompat` (`:403`) and
    `checkObjectFieldCompat` (`:500`) — the outer checks that fire in f3 and f5
    — do see through `U`. `type-layer-checks.ts:1023` unfolds the same
    `annotation` value 42 lines below the `:981` test, to record the binding's
    declared type in TYPE-11-transparent form. The three dispatch sites are the
    only `CompatType` `kind === "array"` tests in either file that classify
    before unfolding: `rg -n 'kind === "array"' src/parser/type-layer-checks.ts
    src/parser/type-compat.ts` returns `:981`, `:1460`, `:1462`, `:1559`,
    `:2051`, `:2301` and `type-compat.ts:212`, of which `:1460` is an `Expr` AST
    test, `:2051` unfolds at `:2048`, `:2301` at `:2300`, and `:212` sits inside
    `decide`, whose operands `checkCompatible` unfolded at `:144`.
  - **The spec rules** — `docs/spec_topics/expressions.md:224`, rule 1 ("If a
    type sink is in scope (binding annotation, parameter type, etc.), every
    element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
    `theta/parse/array-element-type-mismatch` naming the offending element");
    `:226`, rule 3. `docs/spec_topics/type-system.md:54`, TYPE-11. Mirrors:
    `docs/reference/type-system.md:87–88` (rule 1), `:93` (rule 3), `:76–81`
    (TYPE-11).
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:40`
    (`theta/parse/array-element-type-mismatch`, `E`, *Message* `array element
    type mismatch at index <i>: expected <expected>, got <actual>`); `:41`
    (`theta/parse/array-no-common-type`, `E`, *Trigger* "Array literal whose
    elements have no common type and no sink to narrow against", *Remedy*
    "Annotate the binding with `array<A | B>` or use a single schema"); `:54`
    (`theta/parse/let-rhs-type-mismatch`); `:46`
    (`theta/parse/object-field-type-mismatch`). No row needs a *Message* edit
    for any cell below.
  - **The witness that pins the present behaviour** —
    `tests/index-element-alias-unfolded.test.ts` (1269 lines at HEAD), group
    (f) at `:1044–1206`: f1 `:1045`, f2 `:1059`, f3 `:1066`, f4 `:1083`, f5
    `:1123`, f6 `:1144`, f7 `:1186`, f8 `:1196`. Any fix here re-pins f3 and
    f5, and f4/f6 carry the bug 0081 operator authorization already.
  - **The corpus** — 34 committed `.theta` / `.thetalib` files; **zero**
    declare a type-alias schema over `array<T>`
    (`git ls-files '*.theta' '*.thetalib' | xargs rg -l 'schema [A-Z][A-Za-z0-9_]* = array<'`
    → no match), and the only committed array literals are
    `docs/examples/fan-out-reviews.theta:9` (three `string`s, unannotated) and
    `docs/examples/ralph-inline.theta:22` (a frontmatter tools list). GOV-15
    blast radius is zero in either direction.
- **Observed at:** HEAD `5de8d78a` (v0.83.0, the bug 0081 fix), Windows,
  Node 22. Every cell below re-derived for this filing through the production
  `parseThetaDocument` over `parseDoc` (`tests/helpers/e2e-s1.ts:39`) in one
  scratch vitest probe, run and deleted; `src/`, `tests/`, `docs/bugs/README.md`
  and every other bug document are unmodified by this filing.

## Summary

`expressions.md:224` makes the element check conditional on a type sink being
in scope. `type-system.md:54` (TYPE-11) makes a type-alias schema transparent:
`schema U = array<string>` makes `U` and `array<string>` the same type. Three
sites in `src/parser/type-layer-checks.ts` decide whether a sink is in scope by
testing a raw `CompatType`'s `kind` — `annotation.kind === "array"` at `:981`
and `:1462`, `declared.kind === "array"` at `:1559` — with no `unfoldAlias`
call. An alias-spelled annotation or field type has kind `named`, so all three
tests are false, `checkArrayLiteral` is called with `sink: undefined` from
`walkExpr`'s bare-array arm at `:1947`, and `checkCommonType` takes its
sink-less arm.

The consequence is that one written mistake draws a different code set on each
spelling of the same sink. `let xs: U = ["a", 1]` with `schema U =
array<string>` draws `theta/parse/let-rhs-type-mismatch` alone; the concrete
twin `let xs: array<string> = ["a", 1]` draws that code **and**
`theta/parse/array-element-type-mismatch: array element type mismatch at index
1: expected string, got integer`. The constructor-field pair behaves
identically with `theta/parse/object-field-type-mismatch` in the outer slot.
What the alias spelling loses is the element-position diagnostic and the index
it carries — the only output that names which element is wrong.

Where the elements are two different named schemas the divergence is a
refusal, not a relabelling. `schema U = array<A | B>` + `let xs: U = [A { a:
"x" }, B { b: "y" }]` draws `theta/parse/array-no-common-type` and does not
register; the concrete twin `let xs: array<A | B> = […]` reports `[]` and
loads. That code's *Trigger* is "Array literal whose elements have no common
type **and no sink to narrow against**", and its *Remedy* — "Annotate the
binding with `array<A | B>` or use a single schema" — instructs the author to
write exactly what they wrote, through the alias.

`checkCompatible` unfolds both its operands (`type-compat.ts:144`), so the
outer checks in the same statement do see through `U`; `type-layer-checks.ts`
itself unfolds the same `annotation` value at `:1023`, 42 lines below the
`:981` test, to record the binding type. The three dispatch sites are the only
`CompatType` `kind === "array"` tests in either file that classify before
unfolding.

This is the routing half of bug 0125's finding, which 0125 recorded and did not
file. The bug 0081 fix (0.83.0) closed the false `E` on the primitive-union row
by changing what the sink-less path answers, not by changing the routing.

## Reproduction

Offline, deterministic, at HEAD `5de8d78a`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`.
Frontmatter `---\nmode: prompt\n---` on lines 1–3 of every cell. Each cell
prints the whole diagnostic list in emission order, unfiltered, followed by
each diagnostic's rendered message. Output verbatim.

### (a) The eight rows bug 0125 recorded, re-derived

Every value below was measured for this filing. Five of the eight differ from
the values 0125 recorded.

```
@@ f1
   src   :: schema U = array<string | integer>
   src   :: let xs: U = ["a", 1]
   codes :: []
@@ f2 [control]
   src   :: let xs: array<string | integer> = ["a", 1]
   codes :: []
@@ f3
   src   :: schema U = array<string>
   src   :: let xs: U = ["a", 1]
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected U, got array<string | integer>
@@ f4 [control]
   src   :: let xs: array<string> = ["a", 1]
   codes :: ["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected array<string>, got array<string | integer>
   msg   :: theta/parse/array-element-type-mismatch => array element type mismatch at index 1: expected string, got integer
@@ f5
   src   :: schema U = array<string>
   src   :: schema P {
   src   ::   xs: U
   src   :: }
   src   :: let p = P { xs: ["a", 1] }
   codes :: ["theta/parse/object-field-type-mismatch"]
   msg   :: theta/parse/object-field-type-mismatch => field 'xs' on schema 'P' type mismatch: expected U, got array<string | integer>
@@ f6 [control]
   src   :: schema P {
   src   ::   xs: array<string>
   src   :: }
   src   :: let p = P { xs: ["a", 1] }
   codes :: ["theta/parse/object-field-type-mismatch","theta/parse/array-element-type-mismatch"]
   msg   :: theta/parse/object-field-type-mismatch => field 'xs' on schema 'P' type mismatch: expected array<string>, got array<string | integer>
   msg   :: theta/parse/array-element-type-mismatch => array element type mismatch at index 1: expected string, got integer
@@ f7
   src   :: schema U = array<string>
   src   :: let xs: U = []
   codes :: []
@@ f8 [control]
   src   :: let xs: array<string> = []
   codes :: []
```

f1/f2 no longer diverge: the bug 0081 union arm gives `["a", 1]` the type
`array<string | integer>`, which is `⊑ U`'s unfolded right-hand side, so the
sink-less path has nothing to refuse. f3/f4 and f5/f6 are the claim: one
written mistake, two code sets, the alias spelling missing
`array-element-type-mismatch` and its `<i>`. f7/f8 are the bound — an empty
literal has no element to route and agrees on both spellings.

### (b) The refusal face: elements that are two different named schemas

Rule 3's population, where the sink-less arm has something of its own to refuse.
Every cell carries the same two object-schema declarations ahead of the
subject line.

```
@@ o1 alias sink, object union
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: schema U = array<A | B>
   src   :: let xs: U = [A { a: "x" }, B { b: "y" }]
   codes :: ["theta/parse/array-no-common-type"]
   msg   :: theta/parse/array-no-common-type => array elements have no common type; annotate the binding with array<A | B> or use a single schema
@@ o2 concrete sink, object union [control]
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: let xs: array<A | B> = [A { a: "x" }, B { b: "y" }]
   codes :: []
@@ o3 alias field, object union
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: schema U = array<A | B>
   src   :: schema P {
   src   ::   xs: U
   src   :: }
   src   :: let p = P { xs: [A { a: "x" }, B { b: "y" }] }
   codes :: ["theta/parse/array-no-common-type"]
   msg   :: theta/parse/array-no-common-type => array elements have no common type; annotate the binding with array<A | B> or use a single schema
@@ o4 concrete field, object union [control]
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: schema P {
   src   ::   xs: array<A | B>
   src   :: }
   src   :: let p = P { xs: [A { a: "x" }, B { b: "y" }] }
   codes :: []
@@ x1 alias sink, single-schema element type
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: schema U = array<A>
   src   :: let xs: U = [A { a: "x" }, B { b: "y" }]
   codes :: ["theta/parse/array-no-common-type"]
   msg   :: theta/parse/array-no-common-type => array elements have no common type; annotate the binding with array<A | B> or use a single schema
@@ x2 concrete sink, single-schema element type [control]
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: let xs: array<A> = [A { a: "x" }, B { b: "y" }]
   codes :: ["theta/parse/array-element-type-mismatch"]
   msg   :: theta/parse/array-element-type-mismatch => array element type mismatch at index 1: expected A, got B
```

o1 and o3 are conformant sources refused: `A ⊑ A | B` and `B ⊑ A | B` by
TYPE-4/TYPE-5, so rule 1 admits both elements against `U`'s unfolded element
type, and the concrete controls o2 and o4 confirm the checker admits them when
it can see the sink. Both codes are `E`, so neither theta registers.

x1/x2 is the same routing on a real error: the concrete spelling names the
offending element and its index, the alias spelling reports a code whose
*Trigger* denies a sink exists and whose *Remedy* prescribes what the author
already wrote.

`theta/parse/array-no-common-type` is minted at `type-compat.ts:599`, on the
arm `checkCommonType` reaches only when `sink === undefined` (the guard at
`:566`). Its presence in o1, o3 and x1 is therefore a direct observation of the
routing, not an inference from it.

### (c) The index is not always 1, and the loss is not confined to primitives

```
@@ m1 alias sink, mismatch at index 2
   src   :: schema U = array<string>
   src   :: let xs: U = ["a", "b", 1]
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected U, got array<string | string | integer>
@@ m2 concrete sink, mismatch at index 2 [control]
   src   :: let xs: array<string> = ["a", "b", 1]
   codes :: ["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected array<string>, got array<string | string | integer>
   msg   :: theta/parse/array-element-type-mismatch => array element type mismatch at index 2: expected string, got integer
@@ s1 alias sink, nested array element
   src   :: schema U = array<array<string>>
   src   :: let xs: U = [["a"], [1]]
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected U, got array<array<string> | array<integer>>
@@ s2 concrete sink, nested array element [control]
   src   :: let xs: array<array<string>> = [["a"], [1]]
   codes :: ["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected array<array<string>>, got array<array<string> | array<integer>>
   msg   :: theta/parse/array-element-type-mismatch => array element type mismatch at index 1: expected array<string>, got array<integer>
@@ n1 nested alias sink
   src   :: schema V = array<string>
   src   :: schema U = V
   src   :: let xs: U = ["a", 1]
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msg   :: theta/parse/let-rhs-type-mismatch => let binding 'xs' initialiser type mismatch: expected U, got array<string | integer>
```

The repeated `string` arm in m1/m2's rendered `<actual>` is the bug 0081 fix's
pinned arms-verbatim disposition. It is present in both spellings, so it is not
part of this divergence, and it is out of scope here.

s1/s2 show the loss is not confined to primitive element types: the element
diagnostic the alias spelling drops names `expected array<string>, got
array<integer>` at index 1, which no part of s1's single outer message carries.

n1 shows the routing is not defeated by depth: TYPE-11 recurses through nested
aliases, and a two-hop alias behaves exactly as the one-hop f3.

### (d) Where the two spellings agree — the bounds a fix must not move

```
@@ w1 alias sink, integer/number widening
   src   :: schema U = array<number>
   src   :: let xs: U = [1, 2.5]
   codes :: []
@@ w2 concrete sink, integer/number widening [control]
   src   :: let xs: array<number> = [1, 2.5]
   codes :: []
@@ w3 alias sink, homogeneous legal
   src   :: schema U = array<string>
   src   :: let xs: U = ["a", "b"]
   codes :: []
@@ w4 concrete sink, homogeneous legal [control]
   src   :: let xs: array<string> = ["a", "b"]
   codes :: []
@@ z1 alias sink, unresolvable element
   src   :: schema U = array<string>
   src   :: fn f(p: Nope) {
   src   ::   let xs: U = ["a", p]
   src   ::   xs
   src   :: }
   src   :: 1
   codes :: []
@@ z2 concrete sink, unresolvable element [control]
   src   :: fn f(p: Nope) {
   src   ::   let xs: array<string> = ["a", p]
   src   ::   xs
   src   :: }
   src   :: 1
   codes :: []
```

z1/z2 also close the silent-acceptance question for the unresolvable-branch
population: the sunk arm skips an `unknown` branch (`type-compat.ts:570–572`)
and the sink-less arm treats it as non-blocking (`commonType` clause 1), so
neither spelling reports and neither is hiding a verdict the other would give.

### (e) Routes that are not this defect

```
@@ p1 fn param alias sink
   src   :: schema U = array<string>
   src   :: fn f(xs: U) {
   src   ::   1
   src   :: }
   src   :: f(["a", 1])
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msg   :: theta/parse/fn-arg-type-mismatch => fn 'f' argument 0 ('xs') type mismatch: expected U, got array<string | integer>
@@ p2 fn param concrete sink [control]
   src   :: fn f(xs: array<string>) {
   src   ::   1
   src   :: }
   src   :: f(["a", 1])
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msg   :: theta/parse/fn-arg-type-mismatch => fn 'f' argument 0 ('xs') type mismatch: expected array<string>, got array<string | integer>
@@ o5 fn param alias, object union
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: schema U = array<A | B>
   src   :: fn f(xs: U) {
   src   ::   1
   src   :: }
   src   :: f([A { a: "x" }, B { b: "y" }])
   codes :: ["theta/parse/array-no-common-type"]
   msg   :: theta/parse/array-no-common-type => array elements have no common type; annotate the binding with array<A | B> or use a single schema
@@ o6 fn param concrete, object union [control]
   src   :: schema A {
   src   ::   a: string
   src   :: }
   src   :: schema B {
   src   ::   b: string
   src   :: }
   src   :: fn f(xs: array<A | B>) {
   src   ::   1
   src   :: }
   src   :: f([A { a: "x" }, B { b: "y" }])
   codes :: ["theta/parse/array-no-common-type"]
   msg   :: theta/parse/array-no-common-type => array elements have no common type; annotate the binding with array<A | B> or use a single schema
@@ i1 inline-object annotation, array field
   src   :: let p: { xs: array<string> } = { xs: ["a", 1] }
   codes :: ["theta/parse/bare-object-literal"]
   msg   :: theta/parse/bare-object-literal => bare object literal not permitted in this position; name the schema (Schema { ... })
@@ i2 alias of inline object, array field
   src   :: schema U = { xs: array<string> }
   src   :: let p: U = { xs: ["a", 1] }
   codes :: ["theta/parse/bare-object-literal"]
   msg   :: theta/parse/bare-object-literal => bare object literal not permitted in this position; name the schema (Schema { ... })
@@ i3 inline-object param, array field
   src   :: fn h(p: { xs: array<string> }) {
   src   ::   1
   src   :: }
   src   :: 1
   codes :: []
```

**The `fn`-parameter sink is not one of the three sites and does not diverge.**
p1/p2 draw the same single code, and o5/o6 draw the same single code including
under rule 3, because that surface supplies no element sink at either spelling
— the argument-position array literal is always checked sink-less. o5/o6 are
open [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md)'s
subject (bug 0081 fix report §Residuals R2, facet (d)), not this report's; a fix
here must leave all four cells unmoved.

**Inline object types never reach these dispatches.** A bare `{ … }` in value
position is `theta/parse/bare-object-literal` (i1, i2), so an inline-object sink
has no array-literal value to route, whether written directly or through an
alias; i3 shows the annotation itself is legal and silent. Open
[0154](./0154-inline-object-type-field-name-rules-unenforced.md) shares the
inline-object surface and does not interact with any cell in this report.

### (f) Anti-vacuity

```
@@ h1 uppercase binding name
   src   :: let Xs = 1
   codes :: ["theta/parse/binding-case-mismatch"]
   msg   :: theta/parse/binding-case-mismatch => binding name must start with a lowercase letter or _
@@ h2 lowercase binding name [control]
   src   :: let xs = 1
   codes :: []
```

The harness reaches the checkers and reports, and reports nothing on the
conformant twin. No `[]` cell above is a harness that stopped measuring.

## Expected behaviour

`docs/spec_topics/expressions.md:224` states rule 1 in full:

> 1. If a type sink is in scope (binding annotation, parameter type, etc.),
>    every element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
>    `theta/parse/array-element-type-mismatch` naming the offending element.

The rule is written over the presence of a sink and over the sink's *element
type*. It says nothing about how the sink's type is spelled, and the spelling
is settled elsewhere — `docs/spec_topics/type-system.md:54`, TYPE-11:

> **TYPE-11.** Alias-schema transparency. A `NamedType` whose declaration is a
> type-alias schema `schema X = R` (the `=` form; …) is **transparent** in `⊑`:
> on whichever side of a `T₁ ⊑ T₂` check it appears, it is replaced by its
> right-hand side `R` and the check re-evaluated, recursing through nested
> aliases until a non-alias form is reached.

Rule 1's obligation *is* a `⊑` check whose right operand is `T_sinkElement`.
Computing that operand for a sink declared `U` requires replacing `U` with its
right-hand side first; `schema U = array<string>` makes `T_sinkElement` equal
`string`. So:

- **f3 must report `theta/parse/array-element-type-mismatch` at index 1**,
  naming the offending element, exactly as its f4 control does. Whether the
  outer `theta/parse/let-rhs-type-mismatch` accompanies it is 0129's question,
  not this one — but the element diagnostic is owed on both spellings or on
  neither, and f4 establishes it is owed.
- **f5 must report it likewise.** `declared` at
  `type-layer-checks.ts:1559` is the field's declared type; TYPE-11 makes the
  field declared `U` a field declared `array<string>`.
- **o1, o3 and x1 must not report `theta/parse/array-no-common-type`.** Rule 3
  (`expressions.md:226`) reads "an array containing two different named schemas
  yields `array<A | B>` only if some sink in scope expects a union; otherwise it
  is `theta/parse/array-no-common-type`", and the
  registered *Trigger* (`code-registry-parse.md:41`) requires "no sink to
  narrow against". A sink is in scope and expects the union in o1 and o3, so
  rule 1 applies and admits — the o2/o4 controls show what admission looks
  like. x1's sink is in scope and does not admit, so rule 1's own diagnostic is
  owed, as x2 shows.
- **f1/f2, f7/f8, w1–w4, z1/z2 must stay identical to each other**, which they
  already are.

The implementation applies TYPE-11 everywhere else on this statement:
`checkCompatible` unfolds both operands (`type-compat.ts:144`) before
`checkLetRhsCompat` and `checkObjectFieldCompat` decide, and
`type-layer-checks.ts:1023` unfolds the annotation to record the binding type
in transparent form. The three dispatch sites are the exception, and
§Reproduction shows an author can observe which of the two rules the checker
happened to reach.

## Actual behaviour / root cause

Three `kind` tests classify the sink before anything unfolds it.

1. `src/parser/type-layer-checks.ts:981` — `walkStmt`'s `case "let"`:
   ```ts
   if (stmt.init.kind === "array" && annotation.kind === "array") {
     this.checkArrayLiteral(stmt.init, annotation.element, bindings);
   }
   ```
   `annotation` came from `annotationToCompatType(stmt.annotation)`
   (`:953–956`), whose final arm (`:831`) mints `{ kind: "named", name: "U" }`
   for any source that is neither an `array<…>` nor a primitive name.
   `named !== "array"`, so no sunk check runs.
2. `:1462` — `sinkedArrayOf`'s `annotation.kind === "array"` conjunct. With it
   false the function returns `null`, so `walkExpr` receives no `skipArray`
   node and its `case "array"` arm at `:1945–1948` calls
   `this.checkArrayLiteral(e, undefined, bindings)` at `:1947`. This is the arm
   that actually produces the alias spelling's output.
3. `:1559` — `checkObjectField`'s `declared.kind === "array"`. Same shape, same
   result: the constructor-field value falls to the same sink-less arm through
   the `skipArray` return at `:1561`.

`checkArrayLiteral` (`:1426–1448`) forwards its `sink` parameter verbatim, so
`undefined` reaches `checkCommonType` (`type-compat.ts:555`). That function's
first statement is `if (sink !== undefined)` (`:566`): with a sink it walks the
branches and returns `theta/parse/array-element-type-mismatch` at the first
failing index (`:577`); without one it computes `commonType` (`:592`) and
returns `theta/parse/array-no-common-type` when there is none (`:599`). The two
arms answer different questions, and which one an author reaches is decided by
whether their annotation names a type or spells it.

What each face is then made of:

- **f3 / f5.** The bug 0081 union arm gives `["a", 1]` a common type
  (`string | integer`), so the sink-less arm returns nothing. The only
  diagnostic left is the outer check — `checkLetRhsCompat` / `checkObjectFieldCompat`,
  which unfold `U` through `checkCompatible` and correctly report the mismatch
  against `array<string>`. The element check never ran, so the index is lost.
  Before the bug 0081 fix these rows drew `theta/parse/array-no-common-type`
  instead; the routing did not change, the sink-less arm's answer did.
- **o1 / o3 / x1.** Rule 3 still refuses: `commonType` returns `undefined` when
  a branch is an object branch and none dominates (`type-compat.ts:673–675`,
  `isObjectBranch` at `:698`). The sink that would have admitted them was
  discarded three frames earlier.
- **f1.** The same routing, now harmless: the sink-less arm's answer happens to
  agree with the sunk arm's for two primitive branches under a union alias.

## Why it matters

1. **The diagnostic an author needs is the one the alias spelling drops.** For
   a literal with many elements, `let binding 'xs' initialiser type mismatch:
   expected U, got array<string | string | integer>` states that something in
   the literal is wrong; `array element type mismatch at index 2: expected
   string, got integer` states which. m1/m2 measure exactly that pair. The
   report quality an author gets depends on whether they factored the type into
   a `schema U = …` declaration — a refactor the language offers and this
   penalises.
2. **Conformant sources are refused for naming their type.** o1 and o3 are
   spec-legal by rule 1 and are denied registration by an `E`-severity code
   whose *Remedy* text tells the author to annotate with `array<A | B>` — which
   is what `U` is. An author following the printed remedy literally must
   un-factor the alias to make the theta load.
3. **An emission outside its registered *Trigger*.** `array-no-common-type`'s
   row says "no sink to narrow against"; o1, o3 and x1 each have one. DIAG-2
   makes the registry the closed authority on emissions, and bug 0125's own fix
   record prosecuted this same fault at `theta/parse/non-array-iterand`.
4. **The implementation disagrees with itself in one statement.** At `:981` the
   annotation is raw; at `:1023` the same value is unfolded to record the
   binding type; inside `checkLetRhsCompat` it is unfolded again. Three
   readings of one value, two of them transparent.
5. **Bounded blast radius, and it is bounded in both directions.** No committed
   `.theta` or `.thetalib` declares an alias over `array<T>`, so no shipped
   theta changes disposition under any fix here — and no shipped theta is
   currently refused by this defect either. The exposure is on author code, not
   on the corpus.

## Non-goals

- **Adjudicating 0129's multiplicity question.** Whether a second `E` may fire
  for a value an earlier code already refused is
  [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s
  deliverable. This report measures f4/f6 as they stand and states, in §Fix
  (c), the count consequence its own fix has. It does not settle the count, and
  it does not re-pin f4 or f6 on its own authority.
- **The per-surface count divergence.**
  [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md) owns the
  three argument-mismatch spellings and their differing counts. No cell here is
  one of its rows, and no route in §Fix touches `invoke-diagnostics.ts`,
  `invoke-static-checks.ts` or the `fn`-argument loop.
- **The `fn`-parameter sink**, open
  [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) (bug 0081
  fix report §Residuals R2, facet (d)). Cells p1/p2 and o5/o6 measure it as
  uniformly sink-less on both spellings: it is a missing sink, not a lost one.
  A fix here must leave all four cells unmoved. The two reports meet only at
  `checkCommonType`'s sink parameter, from opposite sides — 0156 supplies a sink
  that is never supplied, this report stops discarding one that is.
- **The ternary caller**, open
  [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md) (bug 0081
  fix report §Residuals R1), **and the `match`-arm / `fn`-return LUB
  disagreement**, open
  [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md) (R4).
  Both are about `checkCommonType`'s and `commonType`'s callers, not about how a
  sink is classified.
- **Inline object types.** Cells i1–i3 measure no interaction; open
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md) is unaffected
  in either direction.
- **The arms-verbatim rendering** of a computed union (`array<string | string |
  integer>` in m1/m2) — the bug 0081 fix's pinned disposition, identical on
  both spellings.
- **Citation drift.** `src/parser/type-layer-checks.ts` is pinned at 2531 lines
  by the bug 0081 fix precisely because open reports cite it by line; §Fix
  carries that constraint forward rather than treating drift as chaseable (bug
  0134's class).

## Fix

Not settled. The constraints below bind any route; the disposition of (c) is
the run's.

**(a) Unfold before classifying, at all three sites.** Each dispatch must test
the alias-unfolded value's `kind` and pass the unfolded value's `element` as
the sink:

- `type-layer-checks.ts:981` — classify `unfoldAlias(annotation, this.env)`,
  not `annotation`. The unfolded value already exists 42 lines below at
  `:1023`; hoisting one binding above the `checkLetRhsCompat` call serves both
  readers and adds no second unfolding.
- `:1462` — `sinkedArrayOf` must reach the same verdict as `:981` for the same
  `stmt` and `annotation`, or the literal is either checked twice or skipped
  entirely. The two tests must not be allowed to drift; the minimum is that
  `sinkedArrayOf` consumes the same unfolded value the `let` arm computed
  rather than re-deriving it.
- `:1559` — classify `unfoldAlias(declared, this.env)` in `checkObjectField`,
  and pass that value's `element`.

TYPE-10 must survive: `unfoldAlias` leaves an object-schema `named` and an
unresolvable `named` intact, so neither becomes an array sink. Cells w1–w4,
z1/z2, f7/f8, p1/p2, o5/o6, i1–i3 are the bound and must be unmoved.

**(b) The rendered `<expected>` on the outer codes.** f3 and f5 currently
render `expected U`. If (a)'s unfolding is hoisted in a way that also reaches
`checkLetRhsCompat` / `checkObjectFieldCompat`, those messages change to
`expected array<string>` — a DIAG-4-visible move on rows the registry gives no
*Trigger* text for and which no cell here claims. The route must state whether
`expected U` is preserved; preserving it is the smaller change and keeps the
alias name in front of the author.

**(c) The 0129 coordination — mandatory, and stated by whichever lands first.**
Routing f3 and f5 down the element check makes them draw two codes each, as f4
and f6 already do: the outer check fires independently of the sink dispatch
(measured — it fires in f3/f5 today with no sunk check running), and the sunk
check is additive. Instances of 0129's class therefore rise from two to four.
Consequences:

- If **this report lands first**, its fix record must disclose the increase to
  0129 in an append-only note, re-pin f3/f5 with the same explicit authority
  the bug 0081 fix used for f4/f6, and state that 0129's adjudication rules all
  four cells and may re-pin them.
- If **0129 lands first** and rules that the second code must not fire, this
  fix's element check must be gated the way 0129's ruling prescribes, and f4/f6
  will already carry that ruling's pinned values; §Fix (a) then changes f3/f5
  to whatever f4/f6 read at that point, not to today's two-code list.
- Neither report blocks the other from starting. The coupling is on the
  recorded outcome, not on the code.

**(d) Group (f) is re-pinned a second time.**
`tests/index-element-alias-unfolded.test.ts:1044–1206` belongs to fixed bug
0125 and its cells carry per-cell comments naming the present routing as a
tripwire. A fix here moves f3 and f5 (and, under (a), o1/o3's shape, which the
file does not yet cover). The route must: re-pin f3/f5 with
their new values; rewrite the group header comment at `:1031–1042` and the
three cell comments that assert the routing is unmoved — f1's at `:1046–1052`
("`type-layer-checks.ts:981`'s routing defect is unmoved"), f3's at
`:1067–1076`, f5's at `:1124–1131` ("`type-layer-checks.ts:1559`'s routing
defect … is unmoved"); add the rule-3 refusal cells (o1/o3/x1) that this report
measures and that group (f) never had; and leave f1/f2/f7/f8 byte-unchanged.
The bug 0081 fix's own sentence on f4/f6 — "0129's adjudication rules the class
and may re-pin this cell with its own authority" — must survive verbatim unless
0129 has already landed.

**(e) Line-count discipline on `src/parser/type-layer-checks.ts`.** The file is
2531 lines at HEAD and the bug 0081 fix held it there deliberately because open
reports cite it by line — this report cites `:981`, `:1023`, `:1426`, `:1456`,
`:1462`, `:1535`, `:1559`, `:1945`, `:1947`, and 0147 cites `:1599–1626`. Three
one-line edits can be made line-count-neutral; a route that cannot must
enumerate every citation it stales, in this report and in every other open one,
before landing.

**(f) Witness and gates.** The element diagnostic's presence must be asserted
through `registryMessage` against
`docs/spec_topics/diagnostics/code-registry-parse.md` (DIAG-4, the mechanism
`tests/index-element-alias-unfolded.test.ts` already uses), with ordered
whole-list `toEqual` on the codes. The witness must red without the fix, per
site: neutralise each of the three unfoldings independently and show which
cells red under each, so one site's coverage is not inferred from another's. GOV-15 needs no
carve-out — the corpus sweep above is zero in both directions — but must be
re-run at the fix commit over `.theta` **and** `.thetalib` (bug 0132's gate
still cannot see the latter).

## Provenance

Recorded, not filed, by bug 0125 (0.76.0, commit `e7f73ccf`): its
§Reproduction (f) classifies the three sites as "sink routing — diverges",
states "That is a distinct defect — routing, not narrowing — and belongs to its
own report", and its §Fix (d) pinned their behaviour as group-(f) tripwires so
a later fix widening into them would red. The tripwire fired at the bug 0081
fix (0.83.0, commit `5de8d78a`), which re-pinned five of the eight rows and
appended a discharge note to 0125. That fix's report banks the evidence as
§Residuals R3 and directs whoever files this to re-derive §Reproduction (f)
rather than reuse it.

Every cell above was re-derived for this filing at HEAD `5de8d78a` in one
scratch vitest probe over `parseDoc` (`tests/helpers/e2e-s1.ts:39`), run and
deleted; no value is copied from 0125 or from the bug 0081 fix report. Every
`src/`, `tests/`, spec and registry citation was re-verified against the tree
at HEAD.

**Two claims in the inherited record are narrower than they read**, and this
report is the correction:

1. Bug 0081 fix report §Residuals R3 — "the remaining divergence is only that
   the alias spelling reports the OUTER code where the concrete spelling
   reports the outer code AND the element code" — and the 0125 discharge note's
   "the divergence that remains is therefore only about WHICH code the alias
   spelling loses, not about a spec-legal binding being refused". True of the
   primitive-branch population both were measured on. False of rule 3's
   population: o1 and o3 are spec-legal bindings refused under the alias
   spelling and admitted under the concrete one (§Reproduction (b)). The false
   `E` was closed for f1's shape, not for the defect.
2. The 0125 discharge note's "expect a smaller, purely diagnostic-quality
   defect than this report measured". The diagnostic-quality face is real
   (f3/f5, m1, s1); the refusal face is not diagnostic quality — it denies
   registration to conformant source.

Bug 0125's own citations for these three sites (`type-layer-checks.ts:620`,
`:958`, `:1050`, pinned at `552b4ace`) are stale at this HEAD; the sites are
`:981`, `:1462` and `:1559`, re-anchored by symbol in §Affected. The bug 0081
fix corrected two of the three inside `tests/index-element-alias-unfolded.test.ts`'s
prose (`:620`→`:981`, `:1050`/`:1051`→`:1559`/`:1560`); the `sinkedArrayOf`
site was not among them and is re-anchored here for the first time.

Three sibling filings (0155, 0156, 0158) ran concurrently and held scratch probe
files under `tests/` during part of this measurement session
(`tests/scratch-0155-*.test.ts`, `tests/scratch-0158-*.test.ts`). Neither is
imported by any cell above and neither modifies `src/`; both are gone at the
close of this filing, and `git status --short` carries the four sibling bug
documents and nothing else.

## Fix (0.180.0)

**The route.** §Fix (a) as written — unfold before classifying, at all three
dispatches — with §Fix (b) resolved in favour of preserving `expected U`, and
§Fix (c) discharged in the "0129 lands first" direction (0129 landed at
0.171.0).

- What shipped:
  - `src/parser/type-layer-checks.ts` — the three sink dispatches classify the
    alias-unfolded value. `sinkedArrayOf` unfolds `annotation` before testing
    `kind` and answers `{ node, element }` (the unfolded element type) instead
    of a bare node; `walkStmt`'s `case "let"` arm computes that answer ONCE and
    consumes it both for the sunk `checkArrayLiteral` call and for `walkExpr`'s
    `skipArray` argument, so §Fix (a)'s no-drift constraint is met
    structurally rather than by convention — the two tests are now one test;
    `checkObjectField` unfolds `declared` before its `kind` test and passes the
    unfolded element. `checkLetRhsCompat` and `checkObjectFieldCompat` keep
    reading the RAW annotation / declared type, which is §Fix (b)'s smaller
    disposition: TYPE-11 makes the two the same type, only the rendering
    differs, and the rendering keeps the name the author wrote.
  - `tests/alias-sink-array-element-check.test.ts` — the new witness (28
    cells in six groups: the `let` route, the constructor-field route, the
    concrete twins, §Fix (a)'s bounds, TYPE-10's bound, anti-vacuity). Whole
    -list ordered `toEqual` on every cell; every message `toBe` against a
    `registryMessage` template read from
    `docs/spec_topics/diagnostics/code-registry-parse.md` (DIAG-4); no
    `toContain` on a message.
  - `tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts` —
    the standalone H8a live cell: the alias-spelled refusal reaches the
    `theta-system-note` channel off a settled `SessionManager` carrying the
    element diagnostic and its index, and the alias-union theta the defect
    refused now registers and drives one real turn to a pinned sentinel.
  - `tests/index-element-alias-unfolded.test.ts` — §Fix (d)'s second re-pin of
    fixed bug 0125's group (f). f3 and f5 re-pinned to the two-code ordered
    lists their concrete twins already drew, each strengthened with
    registry-sourced messages including the preserved `expected U`; the group
    header and the f1/f3/f5 cell comments no longer assert the routing is
    unmoved and cite the three sites BY SYMBOL; o1, o3 and x1 added as the
    rule-3 cells the group never had. f2, f4, f6, f7 and f8 are
    byte-unchanged (proven by per-block extraction against
    `git show HEAD:`). The file's RED/GREEN ledger paragraph on group (f) was
    corrected in the same commit because this fix falsifies it directly — its
    replacement claim (that neutralising bug 0125's own `#typeExpr` unfold
    does not touch group (f) either way) was verified, not assumed: no
    group-(f) cell contains an index expression, and the three sites call
    their own `unfoldAlias`.

**The count consequence — 0129's law, cited.** 0129 landed first and its record
states the law this report's §Fix (c) had to defer to:

> Where a construct's own position-rule walk has already drawn an
> `E`-severity diagnostic refusing that construct as ILL-FORMED, a row whose
> verdict is DERIVED from reading the same construct as a well-formed type
> withholds, and the refusal fires alone.

This run cites that clause and states no law of its own. **Agreement with
0129's boundary, re-verified at this tree:** the law does not reach f3/f4/f5/f6.
Both codes in each of those cells read a WELL-FORMED array literal against a
well-formed sink — the outer code's subject is the binding or the field, the
element code's subject is the offending index — so neither verdict is derived
from text an earlier row refused as ill-formed, and the law's discriminating
absence test does not even apply because no construct was refused. Re-derived
here: at HEAD f3 and f5 draw their outer code with NO sunk check running at all
(§Reproduction (a), reproduced verbatim in a scratch probe before any edit), so
the outer verdict is independent of the element check by measurement, not by
inference. **The element check therefore carries no gate**, exactly as 0129's
record prescribes, and the count stands at two per cell. Instances of the class
rise from two (f4/f6) to four (f3/f4/f5/f6), as §Fix (c) predicted; 0129's
adjudication rules all four and may re-pin them.

**DIAG-2 / DIAG-4 adjudication — no registry edit is owed, and none was made.**
`theta/parse/array-element-type-mismatch`'s *Trigger* ("Array literal element
does not type-check against the surrounding sink's element type") is
spelling-neutral and covers an alias-spelled sink under TYPE-11, so the widened
population needs no row edit. In the other direction this fix REMOVES
`theta/parse/array-no-common-type` emissions (o1, o3, x1) that sat OUTSIDE that
row's own registered *Trigger* ("… and no sink to narrow against") — bringing
the runtime INTO conformity with the closed registry rather than changing what
the registry says. Mirrors re-read and unfalsified:
`docs/spec_topics/expressions.md` rules 1 and 3,
`docs/reference/type-system.md`, `docs/reference/diagnostics.md`. Rule 3's
remaining violation on the `fn`-parameter surface (cells o5/o6) is open bug
0156's and is pinned unmoved by both witnesses.

- Gates (verbatim): witness
  `npx vitest run tests/alias-sink-array-element-check.test.ts` → 28 passed;
  re-pinned `npx vitest run tests/index-element-alias-unfolded.test.ts` → 54
  passed; full offline suite `npm test` → 370 files / 7587 tests passed;
  `npx tsc --noEmit -p tsconfig.json` → clean; `npm run lint` → clean; live
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/alias-sink-array-element-check-live-cell-CELL-B2.test.ts`
  → 1 passed, run for real under the live lock, green on the first attempt.
- Review: 1 deep round plus one comment-only polish round. Round 1 (deep) —
  clean on `correctness`, `fidelity` (code) and `spec`: the merged
  `sinkedArrayOf` verdict was case-analysed as neither double-checking nor
  skipping any input, the withheld-binder discipline was shown unmoved, and
  TYPE-10's bound was probed at the new call sites including four cyclic-alias
  shapes (`aliasCycleParticipants` omits cycle members from the env, so
  `unfoldAlias` stops at an unresolvable `named` — no hang, no throw, no new
  array sink). Four items raised and fixed: historical narration in seven
  introduced comment lines, six registry-line citations introduced wrong at
  this tree (`:40`/`:46`/`:54` → `:43`/`:49`/`:59`), a stale anti-vacuity row
  count (39-of-51 → 40-of-54, re-derived mechanically), and a `describe` title
  still asserting the superseded characterisation. The polish round's diff was
  gate-verified rather than re-reviewed: every hunk was comment, string or
  test-title only, and the suite, typecheck and lint re-ran green.
- Verification: verified. (1) Per-site red per §Fix (f), each unfolding
  neutralised independently and each restored by writing the content back and
  proven byte-identical with `git hash-object`
  (`ab190526c898219d04faa19ae3b04a6e34bc090a` before and after both cycles):
  neutralising `sinkedArrayOf`'s unfold reds 9 cells (f3′, m1′, s1′, n1′, o1,
  x1 and their group-(f) twins) with the document's own signature — the alias
  spelling losing `array-element-type-mismatch`, or drawing
  `array-no-common-type` where a sink is written; neutralising
  `checkObjectField`'s unfold reds exactly the 4 constructor-field cells (f5′,
  o3 and twins) and none of the first site's, so neither site's coverage is
  inferred from the other's. The `let`-arm dispatch and `sinkedArrayOf` are
  merged by this fix into one verdict and are reported as one site — they
  cannot disagree by construction. (2) Full offline suite green. (3) One H8a
  live cell run for real under the lock, green first attempt. (4) Lint and
  typecheck clean. GOV-15 re-run at the fix state over `.theta` AND
  `.thetalib`: zero committed files declare an alias over `array<` in either
  direction, so `tests/committed-fixture-parse-gate.test.ts` (green) witnesses
  nothing either way and `tests/fixtures/h7a/permitted-codes.json` is
  byte-untouched. GOV-15 direction: the o1/o3 population moves INTO the
  loads-cleanly set, which is admissible because those inputs draw an `E` at
  the baseline and are therefore outside GOV-15's input set; no
  previously-clean input becomes refused — the newly-supplied sink can only add
  `array-element-type-mismatch`, and four alias-spelled clean sources were
  probed to confirm it.
- Residuals:
  1. §Fix (e)'s line-count discipline is NOT held:
     `src/parser/type-layer-checks.ts` goes 3323 → 3332 lines (+9), the
     comment volume the three sites need to state why the outer checks read the
     raw value while the dispatches read the unfolded one. No citation sweep
     was performed (bug 0134's class), and none is owed as remediation: the
     file was 2531 lines when this report pinned it and is 3332 now, so every
     by-line citation of it in every open report — including this report's own
     §Affected — was already stale before this diff. Evidence: `wc -l` 3323
     before / 3332 after, and the eight-figure spread against the pinned 2531.
  2. The `fn`-parameter surface still supplies no element sink on either
     spelling (cells p1/p2, o5/o6, unmoved and pinned green in both
     witnesses). Open bug 0156's subject, untouched by this route.
  3. `tests/index-element-alias-unfolded.test.ts` f4/f6 still carry the
     filing-era sentence naming bug 0129 as open and as able to re-pin them.
     0129 has landed and read the class, leaving those cells exactly as they
     stood; the sentence is stale but §Fix (d) requires those two cells
     byte-unchanged, so the discharge is stated once in the group header
     instead. Evidence: the byte-identity extraction in the review round.
  4. One pre-existing stale citation in the same file (a `c3` comment citing
     `type-layer-checks.ts:1474–1475` for the `array.join` unfold guard) was
     already wrong at HEAD and was left alone — correcting it would be a
     citation sweep.
- Discharge notes appended: none. By lane rule no sibling bug document was
  edited; the coordination §Fix (c) requires is stated above, citing 0129's own
  record, and the increase from two to four instances of 0129's class is
  disclosed here rather than written into 0129's document.
- Pinned dispositions / non-goals: the arms-verbatim rendering of a computed
  union (`array<string | string | integer>` in m1/m2) is bug 0081's pinned
  disposition and is unmoved on both spellings. Bug 0147's argument-mismatch
  count divergence is untouched — no route here reaches
  `invoke-diagnostics.ts`, `invoke-static-checks.ts` or the `fn`-argument loop.
  Bugs 0154 (inline object types, cells i1–i3 unmoved), 0155 and 0158 (other
  callers of `checkCommonType` / `commonType`) are unmoved in either direction.
  TYPE-10's nominal bound is preserved: `unfoldAlias` leaves an object-schema
  `named`, an unresolvable `named` and a cycle participant intact, so none of
  them becomes an array sink.
