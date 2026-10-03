# Bug 0513 — `StaticTypeInferencePass` types every call expression as `named(<callee>)`, a nominal minted from the callee's NAME, never the callee's declared return type: a call-tailed `fn` body contributes an unresolvable nominal to FN-3 inference, so `return-no-common-type`, the annotated `subagent fn` boundary check, the cross-file `invoke<T>` payload check, the typed-`let` sink and the boolean-position check all defer on a call whose declared return type is in the same file

- **Status:** open — filed 2026-10-03 as residual 3 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix
  (0.496.0)` Residuals item 3). The defect predates that fix; the fix's
  structural tail promotion makes it reachable from every multi-statement
  `FnBody` / `ParForBody` / `BlockExpr` that ends in a bare call.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S1/D3 — S1: an annotation-less `fn` whose `return 1`
  and call tail `g()` (`fn g(): string`) share no common upper bound loads
  with no diagnostic, while the same body with tail `"a"` draws FN-3's
  `return-no-common-type`; a `subagent fn sf(): Item` whose tail calls a
  `string`-returning fn draws no `invoke-return-type-mismatch` (measured,
  table below). D3: the fix changes the static type of every call-typed
  position (return inference, typed `let`, boolean position, the subagent
  and cross-file boundary checks), needs a callee-return table injected at
  three `StaticTypeInferencePass` construction sites, and newly reaches bug
  0512's spurious `return-no-common-type` unless 0512 lands first.
- **Blocks on:** [0512](./0512-return-contributions-count-stmtblock-tails.md).
  With 0512 open, a `StmtBlock` call tail counted as a return contribution
  changes from a deferring nominal to a real type (`Observed` row G1).
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/parser/static-type-inference.ts:420-434` — `#typeValue`'s
    `case "call"` (the switch opens at `:341`, class at `:125`). A callee in
    the RFC 0011 `runtimeToolSuccessTypes` map answers a
    `Result<…, QueryError>` nominal (`:426-432`); every other call answers
    `{ type: { kind: "named", name: node.callee }, members: undefined }`
    (`:433`). The pass has no input that carries a user `fn`'s return
    annotation: its deps are `checkCompatible`, `enumNames` and
    `runtimeToolSuccessTypes` (`:125-134`).
  - `src/parser/type-compat.ts:311-312, 338-339, 372-386` — a `named` type
    that `resolveNamedRef` cannot resolve in the schema-only `TypeEnv` makes
    `checkCompatible` answer `"unknown"`. A user `fn` name is lowercase-first
    and every `TypeEnv` entry is uppercase-first, so `named(<callee>)` for a
    same-file `fn` always answers `"unknown"`.
  - `src/parser/functions.ts:345-357` — `computeLub` treats an `"unknown"`
    answer as non-blocking, so a `named(<callee>)` contribution never makes
    FN-3 inference fail; `resolveReturnType` (`:255`) emits
    `theta/parse/return-no-common-type` (`:307`) only when `computeLub`
    returns `undefined` (`:297-299`).
  - Readers of the call type through FN-3 inference
    (`src/parser/type-layer-walk.ts`):
    - `:855` `collectReturnContributions` and `:900-908` `contributionOf` —
      a call tail or `return` operand contributes
      `{ kind: "plain", type: this.typeOf(expr, …) }`.
    - `:767-777` — an annotation-less `fn`'s inference and its
      `return-no-common-type` push.
    - `:802-847` — `checkSubagentReturnAnnotation`; the doc comment
      (`:793-798`) names an "unresolved-call tail — a `named` reference past
      the parser's static view" as a deferring case, and the inferred
      payload reaches `checkInvokeReturnType` at `:838-845`.
    - `:959` — `inferFinalValuePayload`, read by `inferCalleeReturnPayload`
      (`src/parser/type-layer-checks.ts:429-441`), which returns `undefined`
      for any payload containing a `named` node (`:436`); the cross-file
      `invoke<T>` leg calls it from `resolveCalleeReturnType`
      (`src/extension/production-composition.ts:3074`, call at `:3086`).
  - Direct readers of the call type: the typed-`let` RHS
    (`src/parser/type-layer-walk.ts:276`) and `checkBoolean` (`:979-989`).
    `#typeParFor` (`src/parser/static-type-inference.ts:555`) renders a
    call-tailed `par for` body's element as `Result<<callee>, QueryError>`.
  - The gap is already documented at two other readers:
    - `src/parser/type-layer-interpolation.ts:299-320` — `isCertainResultNode`
      reads `walk.fnReturns` because "a `call` types as its callee's bare
      NAME, so an annotated `Result` return is invisible past the call site"
      (`:303-304`).
    - `src/parser/type-layer-provable.ts:147-170` — `provableArgType`'s
      `call` arm withholds because "The operand a sound judgement needs is
      the callee's declared RETURN type, which the substrate does not carry
      to this position" (`:153-155`).
  - The return annotations are already collected per parse:
    `buildTypeLayerWalk` (`src/parser/type-layer-checks.ts:361`) builds
    `fnReturns` from `collectFnReturnAnnotations` (`:373`, defined `:602`,
    which skips annotations that are no type expression) and `fnDecls`
    (`:374`), and hands both to `TypeLayerWalk`, but constructs the pass at
    `:367` without them.
- **Spec:**
  - `docs/spec_topics/functions.md:26` (FN-3) — an annotation-less body's
    return type is the LUB under `⊑` of the tail-expression type and every
    `return expr` operand type; contributions with no common upper bound draw
    `theta/parse/return-no-common-type`.
  - `docs/spec_topics/functions.md:36` (FN-4) — an explicit `void` return
    type discards the tail value; the call yields `null`.
  - `docs/spec_topics/functions.md:44` (FN-5) — a function's final value is
    the value of its tail expression; a call tail's value is the callee's
    return value, of the callee's return type.
  - `docs/spec_topics/functions.md:62` — a `subagent fn`'s `): T` is
    validated against the inferred Ok payload: "a statically-resolvable
    incompatible payload is `theta/parse/invoke-return-type-mismatch`; an
    unresolvable one defers to the runtime boundary validation", and "the
    call site still receives `Result<T, QueryError>`".

## Symptom

```
fn g(): string { "a" }
fn f(n: number) { if n > 0 { return 1 }
  let z = 1
  g() }
f(1)
```

loads with no diagnostic. Replacing the tail `g()` with `"a"` draws
`theta/parse/return-no-common-type`. `f` has contributions `integer`
(`return 1`) and `string` (the value `g()` returns); FN-3 gives them no
common upper bound. The pass types the tail as `named("g")`, which is
`⊑`-unknown against `integer`, so `computeLub` picks `integer` and FN-3
inference succeeds.

The same substitution hides a resolvable mismatch at the `subagent fn`
boundary, at the cross-file `invoke<T>` payload, at a typed `let`, and at an
`if` condition.

## Observed (2026-10-03, main 0eb38a8a, 0.496.0)

Scratch script outside the tree, run with `vite-node`: production
`parseThetaDocument` over a `mode: prompt` body with inert parse deps, and
`inferCalleeReturnPayload` over a parsed body. Diagnostic codes listed:

| cell | body | codes |
|---|---|---|
| A1 | `fn g(): string { "a" }` / `fn f(n: number) { if n > 0 { return 1 }⏎ let z = 1⏎ g() }` | `[]` |
| A2 (control) | same `f`, tail `"a"` | `return-no-common-type` |
| E1 | A1 with no `let z = 1` (`}`-preceded tail, promoted before 0510) | `[]` |
| B1 | `schema Item { a: string }` / `fn g(): string {…}` / `subagent fn sf(): Item { let z = 1⏎ g() }` | `[]` |
| B2 (control) | same `sf`, tail `"a"` | `invoke-return-type-mismatch` |
| B3 | B1 single-form `subagent fn sf(): Item { g() }` | `[]` |
| C1 | `fn g(): string {…}` / `let x: integer = g()` | `[]` |
| C2 (control) | `let x: integer = "a"` | `let-rhs-type-mismatch` |
| F1 | `fn g(): string {…}` / `if g() { let q = 1 }` | `[]` |
| F2 (control) | `if "a" { let q = 1 }` | `non-boolean-condition` |
| G1 | `fn g(): string {…}` / `fn f(n: number) { if n > 0 { g() }⏎ n }` | `[]` |
| G2 (control) | same `f`, if-body `"s"` | `return-no-common-type` (bug 0512) |

`inferCalleeReturnPayload` over a callee body `fn g(): string { "a" }⏎ let
z = 1⏎ g()` returns `undefined` (deferred); over `let z = 1⏎ "a"` it returns
`{ kind: "prim", name: "string" }`.

E1 (`}`-preceded, `forcedLineStart`) and B3 (single form) are the shapes
that had a structural call tail before 0510 (0510 §Root cause), so the
defect predates 0510. 0510 adds every multi-statement call-tailed `FnBody`,
`ParForBody` and `BlockExpr` (A1, B1) to the reach.

The 0510 witness (`tests/b0510-block-trailing-call-tail.test.ts`) pins the
non-call side. P9 (`:732-737`, object tail, no
`invoke-return-type-mismatch`), Q8 (`:739-745`, ternary-of-queries tail
resolves both schemas to `Item`) and S1 (`:747-754`, schema-name tail draws
`type-as-value`) show a promoted non-call tail reaching inference with its
real type. No witness cell pins a call tail's inferred type.

## Expected (spec citations)

A call to a same-file `fn` with a written return annotation `T` has static
type `T` (FN-5: the call's value is the callee's return value). A call to a
`void` fn has the `null` literal type (FN-4). A call to a `subagent fn`
annotated `): T` has the type `Result<T, QueryError>`
(functions.md:62). Then:

- A1 draws `theta/parse/return-no-common-type`, as A2 does (FN-3).
- B1 and B3 draw `theta/parse/invoke-return-type-mismatch`, as B2 does
  (functions.md:62: the payload is statically resolvable).
- C1 and F1 draw the same codes as C2 and F2.
- `inferCalleeReturnPayload` over the call-tailed callee returns `string`.

A call whose callee has no written annotation, is imported, is a
`.theta`-callable or Pi tool, or names a local binding keeps the deferring
nominal: its return type is past the single-file parse's static view.

## Actual (implementation citations)

`#typeValue`'s `case "call"` (`static-type-inference.ts:433`) answers
`named(node.callee)` for every non-runtime-tool callee. `checkCompatible`
answers `"unknown"` for that unresolvable nominal (`type-compat.ts:311-312,
338-339, 372-386`). Every reader then defers:

- `computeLub` (`functions.ts:345-357`) accepts the `"unknown"`, so FN-3
  inference never fails on a call contribution (A1, E1).
- `checkInvokeReturnType` gets an unknown payload
  (`type-layer-walk.ts:838-845`) (B1, B3).
- `inferCalleeReturnPayload` drops a payload containing a `named` node
  (`type-layer-checks.ts:436`).
- The typed-`let` sink (`type-layer-walk.ts:276`) and `checkBoolean`
  (`:979-989`) defer (C1, F1).

The runtime AJV net catches the `subagent fn` and `invoke<T>` boundary
mismatches at run time. Nothing catches A1: `f` returns `1` or `"a"` with no
check.

## Root cause

`StaticTypeInferencePass` has no access to user `fn` return annotations. It
is constructed at `type-layer-checks.ts:367`,
`src/extension/invoke-static-checks.ts:682` and
`src/extension/invoke-imported-checks.ts:196` with `checkCompatible`,
`enumNames` and (at the first two) `runtimeToolSuccessTypes` only. The
annotation table `collectFnReturnAnnotations` builds goes to `TypeLayerWalk`
(`type-layer-checks.ts:373, 384`), whose readers
(`isCertainResultNode`, `type-layer-interpolation.ts:312-320`) consult it
around the pass. The pass's `call` arm therefore falls back to a nominal
keyed on the callee's spelling. Two readers already document the gap and
withhold around it (`type-layer-interpolation.ts:303-304`,
`type-layer-provable.ts:153-155`).

## Fix direction

1. Inject a callee-return table into `StaticTypeInferencePass`, keyed by
   callee name. It holds the written return annotation and the `subagent`
   flag of every top-level same-file `fn` whose name no local binder
   shadows. Build it from the tables `buildTypeLayerWalk` already computes:
   `collectFnReturnAnnotations`, `collectTopLevelFns` and
   `collectLocalBinderNames` (`type-layer-checks.ts:373-379`); the last
   already receives the frontmatter `params:` names. Pass it at all
   three construction sites, each built from the body that site walks. The
   dep is required, like `enumNames`, so a missing wire fails at compile
   time.
2. In `#typeValue`'s `case "call"`, after the runtime-tool arm, answer by
   the table:
   - plain `fn`, annotation `void` → `{ kind: "literal", typesAs: "null" }`
     (FN-4; matches the runtime `discardForVoid`,
     `src/runtime/function-result.ts:64`);
   - plain `fn`, any other annotation → `annotationToCompatType(annotation)`
     (`src/parser/annotation-compat.ts:54`). A `Result<…>` annotation
     converts to an unresolvable `named` and keeps deferring;
   - `subagent fn`, annotation `T` → the nominal
     `named("Result<" + displayType(T) + ", QueryError>")`, the shape the
     runtime-tool arm uses (`:428-431`);
   - no table entry (annotation-less, imported, `.theta`-callable, Pi tool,
     unresolved, shadowed) → `named(node.callee)`, unchanged.

   `members` stays `undefined` on every branch, so
   `collectProvableArgTypes` and the argument-type checks behind it do not
   change. Inferring an annotation-less callee's return type needs a
   recursion guard. That is outside this fix.
3. Rewrite the comments that describe the gap
   (`type-layer-interpolation.ts:299-304`, `type-layer-provable.ts:147-170`,
   `type-layer-walk.ts:793-798`) to the shipped rule.

No new diagnostic code and no spec edit.

Constraints:
- Land after [0512](./0512-return-contributions-count-stmtblock-tails.md).
  While 0512 is open, G1's if-body call tail is counted as a return
  contribution. The fix turns that contribution from `named("g")` into
  `string`, so G1 would draw the spurious `return-no-common-type` that 0512
  measures for G2.
- Every 0510 witness cell stays green. P9, Q8 and S1 have non-call tails and
  read no call type. The RET-3 cells with a `pn(…)` tail
  (`tests/b0510-block-trailing-call-tail.test.ts:641-655`) pin only
  `unreachable-code`, and `pn`'s `number` annotation matches the enclosing
  `fn f(): number`. No cell's pinned value records this gap.
- The fix newly emits on previously-clean input at every call-typed
  position (A1, B1, B3, C1, F1). Audit each full-suite and
  `tests/committed-fixture-parse-gate.test.ts` flip against FN-3 / FN-4 /
  functions.md:62 and record it in the fix record.

Witness: parse cells A1, B1, B3, C1 and F1 draw the control's code, each red
at 0eb38a8a with `[]`. An `inferCalleeReturnPayload` cell returns `string`
for the call-tailed callee. Controls: an annotation-less callee, an imported
callee and a `Result`-annotated callee stay silent in the A1 shape; a
`subagent fn` callee in `let x: integer = sf()` stays silent (its
`Result<…, QueryError>` nominal defers); and a local binding that shadows a
`fn` name keeps the nominal.

## Repro (minimal, inline)

`.pi/theta/r.theta`:

```
---
mode: prompt
---
fn g(): string { "a" }
fn f(n: number) { if n > 0 { return 1 }
  let z = 1
  g() }
f(1)
```

Load it. Expected: `theta/parse/return-no-common-type` on `f`. Observed:
loads clean (Observed row A1). Replace `g()` with `"a"`: the diagnostic
fires (row A2).

## Related

- [0510](./0510-block-trailing-call-value-discarded.md) — parent fix; this
  report is its residual 3. The promoted call tail feeds static
  return-type inference this nominal, not the FN-3/FN-5 type.
- [0512](./0512-return-contributions-count-stmtblock-tails.md) — must land
  first (see `Blocks on`).
- [0511](./0511-qry19-stmtblock-tail-single-vs-multi.md) — sibling residual
  (residual 1); no shared mechanism.
