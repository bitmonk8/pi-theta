# Bug 0050 — `theta/parse/fn-arg-type-mismatch` is registered with a Trigger no input can satisfy: its sole emitter `checkFnArgCompat` (`type-compat.ts:452`) has no caller in `src/`, so `fn f(x: P): number { 1 }` + `f(3)` reports nothing at parse and binds the argument unchecked at runtime

- **Status:** open. §Fix is constraint-pinned, not settled. Two dispositions
  are stated with their constraints — wire the caller, or retire the row under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) — and a
  recommendation; the choice is not made here.
- **Kind:** defect — implementation, in two elements that carry different spec
  standing.
  1. **A promised parse-time check does not run.**
     [TYPE-9](../spec_topics/type-system.md#type-9)
     (`docs/spec_topics/type-system.md:50`) states that a plain
     function-argument slot "reports `theta/parse/fn-arg-type-mismatch`" on a
     static failure, and `type-system.md:27` lists "a function-argument slot"
     among the positions the `⊑` relation governs. No parse path evaluates the
     relation at that position: `checkFnArgCompat`
     (`src/parser/type-compat.ts:452`) is the only site in the tree that emits
     the code, and it has no caller in `src/`.
  2. **The registry row describes behaviour the implementation does not have.**
     The row (`docs/spec_topics/diagnostics/code-registry-parse.md:113`) states
     a *Trigger* over author input ("passes an argument whose static type is
     not compatible with the matched parameter's declared type") and asserts
     that no runtime net backstops it ("Always parse-time … so no runtime AJV
     safety net applies"). The second half holds — the runtime binds the
     argument without validating it — so the position is unchecked in both
     phases. The registry is closed under DIAG-2, and a reader of it cannot
     distinguish this row from the two wired sibling rows in the same table.
- **Related:**
  [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
  the filing origin. Its §Fix (0.48.0) *Residuals* item (i) (`:214–217`), its
  §Non-goals bullet (`:698–705`) and its §Reproduction bullet (`:391–395`)
  record this gap and leave it unfiled; it is also why that report's t5 fixture
  (`fn f(x: constructor): number { x + 1 }` + `f(1)`) shows the engine throw and
  no argument diagnostic.
  [0031](./0031-ctor-field-value-typing-unchecked.md) — the same class at the
  neighbouring sink, fixed in 0.43.0: constructor field values ran no
  compatibility check, and the fix added the `theta/parse/object-field-type-mismatch`
  row (DIAG-2), threaded the declared types, and wired one call at the type-phase
  `object` arm. That row is one of the two siblings that fire here (§Reproduction
  c2), and its §Fix records the GOV-15 disposition this report reuses (`:354–358`).
  [0033](./0033-body-level-schema-alias-unsupported.md) — the precedent for the
  unwired-checker shape: three exported V5b checkers owning seven registry codes
  had no caller in `src/` until 0.45.0.
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
  the same family, fixed in 0.69.0 by the wire-the-caller disposition with no
  registry change: `theta/parse/interpolated-result` was registered with a
  Trigger nothing satisfied, and the fix added one emission site at the
  type-layer walk's `query` arm plus the runtime fallback the row's own Trigger
  already described. Recorded here as a route, not as a decision: that row's
  Trigger already covered both dispositions, whereas this report's two options
  (wire the caller, or retire the row under DIAG-2) remain open and unchosen.
- **Affected** (every citation verified at HEAD `b34aaa52`, 0.48.0):
  - **The sole emitter** — `checkFnArgCompat`, `src/parser/type-compat.ts:452–480`:
    doc comment `:444–451` ("TYPE-9 — a plain top-level `fn` argument slot"),
    the deferral arm `:463–465` (`"compatible"` or `"unknown"` → no
    diagnostic), the emitted code `:472`, the registered message `:475–477`.
    `rg -n "checkFnArgCompat" src/` returns exactly one line — `:452`, the
    definition. Outside `docs/`, the only other references are
    `tests/type-compat.test.ts:5` (import), `:23` (comment), `:268` (a direct
    call).
  - **The arm where the call belongs** — `TypeLayerWalk.walkExpr`,
    `src/parser/type-layer-checks.ts:1045–1050`. The `case "call": case
    "invoke":` arm walks the argument expressions and runs no check on them.
    Its neighbours in the same switch do call their checkers: `case
    "method-call"` (`:1034–1035`), `case "member"` (`:1041–1042`), `case
    "object"` (`:1051–1052`).
  - **The two wired siblings**, both emitters in the same file as
    `checkFnArgCompat` and both reached from the same walk:
    `checkLetRhsCompat` (`type-compat.ts:403`) is called at
    `type-layer-checks.ts:552` from `walkStmt`'s `let` arm (`:541`, `:543`);
    `checkObjectFieldCompat` (`type-compat.ts:500`) is called at `:948` from
    `checkObjectField` (`:939`). `type-layer-checks.ts`'s import block
    (`:53–64`) names both (`:56`, `:57`) and does not name `checkFnArgCompat`.
  - **The registry row** — `docs/spec_topics/diagnostics/code-registry-parse.md:113`.
    Severity `E`, phase `type`. It sits between `theta/parse/tool-arg-type-mismatch`
    (`:112`) and `theta/parse/invoke-return-type-mismatch` (`:114`).
  - **The mirrors** — `docs/reference/diagnostics.md:162` (the *Code* / *Sev* /
    *Phase* / *Message* transcription; the page states at `:3–9` that it
    transcribes those columns verbatim from the spec registry pages) and
    `docs/reference/type-system.md:64–69`, whose TYPE-9 summary names the site
    at `:66` ("a plain top-level `fn` argument → `theta/parse/fn-arg-type-mismatch`").
  - **The spec rules that promise the check** —
    `docs/spec_topics/type-system.md:27` (the check-site enumeration, which
    includes "a function-argument slot"), `:50` (TYPE-9, which names the code
    for that site), `:52` (TYPE-10, which routes a cross-form or
    cross-named-schema mismatch to "that site's own diagnostic
    (`theta/parse/let-rhs-type-mismatch`, `theta/parse/fn-arg-type-mismatch`,
    or `theta/parse/invoke-arg-type-mismatch`)"), and `:48` (the unresolvable-operand
    deferral the emitter already implements at `type-compat.ts:463–465`).
  - **The runtime, which does not backstop it** — `evalUserFnCall`
    (`src/runtime/statement-executor.ts:395–416`) checks arity only
    (`:401–403`, `ThetaFnArityError` at `:364–368`) and binds each evaluated
    argument with `scope.defineLocal(...)` (`:416`) with no validation; the
    second copy of the shape is `:494–503`, and the producer's synchronous pure
    path `evaluatePureFnCall` (`src/extension/production-theta-producer.ts:5808–5817`)
    is identical in this respect. This matches the row's own "no runtime AJV
    safety net applies", so the parse-time check is the only one the position
    was ever going to get.
  - **The signature data a wiring needs, all present.** `FnDecl.params`
    (`src/parser/theta-document.ts:460–463`) carries `FnParam { name, type }`
    (`:395–398`) with `type` the annotation text; `annotationToCompatType`
    (`src/parser/type-layer-checks.ts:454`) converts it, exactly as `walkFn`
    already does for the body scope (`:645–651`); `CallExpr` carries `callee`
    and `args` (`theta-document.ts:167–171`); `TypeLayerWalk.typeOf` (`:523`)
    types each argument; `this.env` is the whole-file `TypeEnv`
    (`collectTypeEnv`, `:294`, built by `checkTypeLayer` at `:217`).
    `resolveFnCall` (`src/parser/functions.ts:145`), the hoisted-`fn`
    resolution helper such a check would consult, likewise has no caller in
    `src/`.
  - **What the gate does not catch.** The closed-set reconciliation
    (`reconcileClosedSet`, `tools/code-registry/index.js:99`) reports a
    `registry-code-no-asserting-test` finding, so its predicate is whether a
    *test asserts the code* — and `tests/type-compat.test.ts:267–283` asserts
    it by calling the emitter directly. The gate runs over seeded fixtures
    under `test-fixtures/closing-gate/` (`tests/closing-gate.test.ts:15–26`),
    not over this corpus, and under either scope an unwired row with a
    direct-call unit test satisfies it.
  - **Not affected — callee name resolution.** An undeclared callee still
    reports `theta/parse/unknown-identifier` (§Reproduction c3), so the
    silence is confined to the argument-type judgement.
  - **Not affected — arity.** No registry row covers a plain `fn` call's
    argument count (the registry's arity rows are `theta/parse/invoke-arity-too-few`
    `:115` and `-too-many` `:116`, both `invoke`/`.theta`-callable), and the
    runtime throws `ThetaFnArityError`. Parse-time silence on arity is
    therefore not a registry mismatch.
- **Observed at:** `0.48.0` (`b34aaa52`). Offline and deterministic — no model,
  no live provider, no file written.
- **Fix ordering:** none. No open bug cites `src/parser/type-compat.ts` or
  `src/parser/type-layer-checks.ts` (`rg -ln "type-layer-checks|type-compat"
  docs/bugs/*.md` returns nine reports, all with `Status: fixed`).

## Summary

`theta/parse/fn-arg-type-mismatch` is a registered `E`-severity row whose
*Trigger* is a condition over author source text. The function that emits it,
`checkFnArgCompat`, is exported, unit-tested, and never called by shipped code.
The type-phase walk's `call` arm walks the argument expressions and checks
nothing about them, so every argument at a declared parameter position passes
without a compatibility judgement:

```
schema P { a: number }
fn f(x: P): number { 1 }
let r = f(3)
```

loads with zero diagnostics. So do a `string` under `n: number`, an `integer`
under `s: string`, an `array<string>` under `xs: array<number>`, a fractional
`number` under `n: integer`, and a `Q`-constructed value under `x: P` —
measured in §Reproduction. The runtime does not recover the check: it validates
arity and binds each argument value unchecked.

The two sibling sinks in the same emitter file do fire. `let v: P = 3` reports
`theta/parse/let-rhs-type-mismatch` and `P { a: "s" }` reports
`theta/parse/object-field-type-mismatch` — the same relation, the same env, the
same walk, one wired call each.

This was recorded three times inside bug 0038 (a residual, a §Non-goal, and a
§Reproduction bullet) as pre-existing and orthogonal to that fix, and left
unfiled. It is the reason 0038's t5 fixture reports its engine throw and no
argument diagnostic.

## Reproduction

Offline, deterministic, at HEAD `b34aaa52`. One command through the shipped
front end (`parseThetaDocument` via `tests/helpers/e2e-s1.ts:39`) plus one
direct call to the exported emitter. Every fixture is `mode: prompt`. No file
written.

```console
$ npx tsx -e "import {parseDoc} from './tests/helpers/e2e-s1.ts'; import {checkFnArgCompat} from './src/parser/type-compat.ts'; const FM='---\nmode: prompt\n---\n'; const rows=[['r1','schema P { a: number }\nfn f(x: P): number { 1 }\nlet r = f(3)\nr\n'],['r2','fn g(n: number): number { 1 }\nlet r = g(\"s\")\nr\n'],['r3','fn g(s: string): number { 1 }\nlet r = g(3)\nr\n'],['r4','fn g(xs: array<number>): number { 1 }\nlet r = g([\"a\"])\nr\n'],['r5','fn g(n: integer): number { 1 }\nlet r = g(1.5)\nr\n'],['r6','schema P { a: number }\nschema Q { b: string }\nfn f(x: P): number { 1 }\nlet v = Q { b: \"s\" }\nlet r = f(v)\nr\n'],['c1','schema P { a: number }\nlet v: P = 3\nv\n'],['c2','schema P { a: number }\nlet v = P { a: \"s\" }\nv\n'],['c3','let r = q(3)\nr\n']]; for (const [id,body] of rows) { const d=parseDoc(FM+body,'b.theta').diagnostics; console.log(id, d.length===0?'no diagnostic':d.map(x=>x.code+': '+x.message).join(' | ')); } const site={file:'b.theta',range:{start:{line:3,column:9},end:{line:3,column:13}}}; console.log('d1', checkFnArgCompat({fnName:'f',index:0,paramName:'x',paramType:{kind:'named',name:'P'},argType:{kind:'prim',name:'integer'},env:{P:{kind:'object-schema',fields:{a:{kind:'prim',name:'number'}}}},site}).map(x=>x.code+': '+x.message).join(' | '));"
r1 no diagnostic
r2 no diagnostic
r3 no diagnostic
r4 no diagnostic
r5 no diagnostic
r6 no diagnostic
c1 theta/parse/let-rhs-type-mismatch: let binding 'v' initialiser type mismatch: expected P, got integer
c2 theta/parse/object-field-type-mismatch: field 'a' on schema 'P' type mismatch: expected number, got string
c3 theta/parse/unknown-identifier: unknown identifier 'q'
d1 theta/parse/fn-arg-type-mismatch: fn 'f' argument 0 ('x') type mismatch: expected P, got integer
```

| # | fixture | static |
|---|---|---|
| r1 | `schema P { a: number }` + `fn f(x: P): number { 1 }` + `let r = f(3)` | none — loads |
| r2 | `fn g(n: number): number { 1 }` + `let r = g("s")` | none — loads |
| r3 | `fn g(s: string): number { 1 }` + `let r = g(3)` | none — loads |
| r4 | `fn g(xs: array<number>): number { 1 }` + `let r = g(["a"])` | none — loads |
| r5 | `fn g(n: integer): number { 1 }` + `let r = g(1.5)` | none — loads |
| r6 | `schema P {…}` + `schema Q {…}` + `fn f(x: P): number { 1 }` + `let v = Q { b: "s" }` + `let r = f(v)` | none — loads |
| c1 | `schema P { a: number }` + `let v: P = 3` | `theta/parse/let-rhs-type-mismatch` — the wired sibling sink |
| c2 | `schema P { a: number }` + `let v = P { a: "s" }` | `theta/parse/object-field-type-mismatch` — the wired sibling sink ([0031](./0031-ctor-field-value-typing-unchecked.md)) |
| c3 | `let r = q(3)` | `theta/parse/unknown-identifier: unknown identifier 'q'` |
| d1 | `checkFnArgCompat` called directly, `integer` argument against a declared `P` parameter | `theta/parse/fn-arg-type-mismatch: fn 'f' argument 0 ('x') type mismatch: expected P, got integer` |

r5 also fixes the narrowing direction: the emitter routes a `number → integer`
failure through the same code rather than through `theta/parse/integer-narrowing`
(`type-compat.ts:466–467`), and neither code appears.

r6 is the case TYPE-10 (`type-system.md:52`) names explicitly — two distinct
nominal schemas — and it is the one an AJV net could not recover even in
principle, since `Q { b: "s" }` does not validate against `P`.

c1 and c2 are the control: the relation, the `TypeEnv` and the walk are shared
with the silent rows, so what differs at the `fn`-argument position is the
absent call, not the engine.

d1 is the emitter answering correctly when called. The gap is the wiring.

**Reachability, bounded by grep rather than by fixture.** `rg -n
"checkFnArgCompat" src/` returns one line (`type-compat.ts:452`, the
definition), and `rg -n "fn-arg-type-mismatch" src/` returns four
(`type-compat.ts:446` doc comment, `:467` comment, `:472` the emitted code, and
`invoke-diagnostics.ts:87`, a comment on the invoke message base). The row's
*Trigger* covers "a same-file or imported `.thetalib` function call"; both
routes are closed by the same absence, so the imported-`.thetalib` route needs
no separate fixture.

## Expected behaviour

**The registry row states the promise.** `code-registry-parse.md:113`, *Trigger*
column, verbatim:

> A plain top-level `fn` call `f(args)` — a same-file or imported `.thetalib`
> function call that is neither an `invoke(...)` nor a `.theta`-callable call —
> passes an argument whose static type is not compatible with the matched
> parameter's declared type. Always parse-time: top-level `fn` declarations are
> hoisted and always statically resolvable, so no runtime AJV safety net
> applies.

*Message*: `fn '<name>' argument <i> ('<param>') type mismatch: expected
<expected>, got <actual>`. r1 satisfies the Trigger's condition in every
particular — a plain top-level `fn` call, an `integer` argument, a `P`-declared
parameter, both operands statically resolvable — and emits nothing.

**The type-system rules state it twice more.** `type-system.md:27` enumerates
the positions the `⊑` relation governs and includes "a function-argument slot".
[TYPE-9](../spec_topics/type-system.md#type-9) (`:50`) says each of its three
sites "reports its own parse-time diagnostic on a static failure (`T₁ ⋢ T₂`,
both operands statically resolvable)" and names this code for the `fn` slot.
[TYPE-10](../spec_topics/type-system.md#type-10) (`:52`) names it again as the
reporting site for a cross-form or cross-named-schema mismatch, "not deferred to
a runtime AJV failure" — the r6 shape.

**The deferral rule bounds the promise, and the emitter already implements it.**
[type-system.md §Unresolvable operands](../spec_topics/type-system.md#type-compatibility)
(`:48`) skips the check when either side is past the parser's static view.
`checkFnArgCompat` returns no diagnostic for `"unknown"` (`type-compat.ts:463–465`),
so an unannotated parameter or an unresolvable annotation defers by
construction — the same disposition c1's sink takes.

**DIAG-1 presupposes the sites exist.**
[DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1)
(`diagnostic-shape.md:71`) entitles tests to "assert on the specific code at
every documented diagnostic site". This site is documented in the registry row
(`code-registry-parse.md:113`) and in three type-system rules
(`type-system.md:27`, `:50`, `:52`), and cannot be asserted from source text.

**Two of TYPE-9's three sites are implemented.** The typed-`let` RHS reports
(c1) and the ternary/array machinery reports through
`theta/parse/array-element-type-mismatch` / `array-no-common-type`. The `fn`
slot is the third.

## Actual behaviour / root cause

1. **One emitter, zero callers.** `checkFnArgCompat`
   (`type-compat.ts:452–480`) computes `checkCompatible(argType, paramType,
   env)` and returns the registered diagnostic on an incompatible answer. It is
   exported and imported by exactly one file, `tests/type-compat.test.ts`. The
   shipped tree never calls it.

2. **The walk arm that would call it does nothing with the arguments.**
   `TypeLayerWalk.walkExpr` (`type-layer-checks.ts:1045–1050`):

   ```ts
   case "call":
   case "invoke":
     for (const arg of e.args) {
       this.walkExpr(arg, bindings, flow);
     }
     return;
   ```

   The recursion types and checks each argument *expression* on its own terms;
   nothing relates it to the callee's declared parameter. The adjacent arms —
   `method-call` (`:1034`), `member` (`:1041`), `object` (`:1051`) — each
   delegate to a checker.

3. **The callee's signature is never looked up.** `walkFn` (`:645–651`) reads
   `FnDecl.params` to seed the body scope, so the parameter annotations are
   available to the same walk; no structure carries them to the call site.
   `resolveFnCall` (`functions.ts:145`), whose doc comment describes resolving
   a call against "the file's hoisted top-level `fn` names", has no caller in
   `src/` either.

4. **Nothing downstream re-checks.** `evalUserFnCall`
   (`statement-executor.ts:395–416`) compares argument count against parameter
   count and binds each evaluated value with `defineLocal` — no type test, no
   AJV validation. The value flows into the body under a declared type it does
   not satisfy; whether that surfaces later depends on what the body does with
   it (r1's body ignores `x` entirely and returns `1`).

5. **The registry gate is satisfied by the unit test.**
   `tests/type-compat.test.ts:267–283` asserts the code and its registered
   message by calling the emitter with hand-built `CompatType`s. Under
   `reconcileClosedSet` (`tools/code-registry/index.js:99`) that is an
   asserting test, so the row is not reported as uncovered. No gate in the tree
   relates a registered code to a *reachable* emission.

6. **The same shape sits on two adjacent argument rows.**
   `theta/parse/invoke-arg-type-mismatch` is emitted only by
   `checkInvokeArgTypes` (`invoke-diagnostics.ts:205–233`, emission at `:221`),
   reached only from
   `checkInvokeCall` (`:398–415`), which has no caller in `src/` — the wired
   invoke path calls `checkInvokeArity` directly
   (`src/extension/invoke-static-checks.ts:298`).
   `theta/parse/tool-arg-type-mismatch` is emitted only inside
   `checkToolCallArguments` (`src/runtime/tool-call.ts:187`, emission at
   `:256`), which also has no caller in `src/` (the tool-call *shape* codes are
   emitted inline in `theta-document.ts:4635`). Both are bounded by grep, not
   by fixture; neither is filed here (§Non-goals).

## Why it matters

- **A declared parameter type carries no enforcement anywhere.** r1–r6 pass at
  parse and bind at runtime. An author who annotates `fn f(x: P)` gets no
  earlier failure than whatever the body does with a non-`P` value, and the
  registry row states that no runtime net exists at this position.
- **The registry over-states the implementation.** The row's *Trigger* is a
  condition over source text; no source text satisfies it. The registry is
  closed under DIAG-2 and read by tests, tooling and authors as the inventory
  of what the implementation reports.
- **Nominal typing widens what the silence admits.** TYPE-10 makes named
  schemas incompatible on name identity, so r6 (`Q`-constructed value into a
  `P` parameter) is a mismatch the parser is required to catch without AJV, and
  it loads clean.
- **The machinery the site needs already runs.** The emitter, the `⊑`
  relation, the `TypeEnv` and the walk are shared with `let-rhs` and
  `object-field`, which both fire (c1, c2), and the emitter answers correctly
  when called (d1). What is missing is the call and the callee resolution that
  precedes it.
- **It has been observed and passed over.** Bug 0038 recorded it three times
  (`:214–217`, `:391–395`, `:698–705`) as pre-existing and orthogonal, and it
  is the recorded reason that report's t5 fixture shows no argument diagnostic.

## Fix

Not yet decided. The question is whether the registered row acquires the
emission path it describes, or the corpus stops describing it.

**Disposition 1 — wire the caller (recommended).** Add one call in the
type-phase walk so the registered row fires on the input its Trigger names.

- *Where.* `type-layer-checks.ts:1045`'s `call` arm. The `invoke` label shares
  the arm and must not be swept in: `invoke` has its own row
  (`code-registry-parse.md:111`) and its own unwired emitter (§Actual behaviour
  item 6). Split the labels or gate on `e.kind === "call"`.
- *Callee resolution.* `CallExpr` is also the AST node for a `.theta`-callable
  call and a Pi-tool call, both of which the Trigger excludes. The check runs
  only when the callee resolves to a user `fn` — the parse-time counterpart of
  the runtime's `resolveUserFn` (`statement-executor.ts:377`), whose arms are
  a hoisted top-level `fn` and an imported `.thetalib fn`. `resolveFnCall`
  (`functions.ts:145`) is the existing helper for the first arm.
- *Operands.* Parameter type from `annotationToCompatType(p.type)` (`:454`),
  argument type from `this.typeOf(arg, bindings)` (`:523`), env `this.env`,
  site `{ file: this.file, range: arg.range }` so the diagnostic attaches to the
  argument rather than the whole call.
- *Deferral is already correct.* An unannotated parameter (`FnParam.type` is
  the empty string) and an annotation that names nothing declared both reach
  `"unknown"` and emit nothing (`type-compat.ts:463–465`,
  `type-system.md:48`). No change to the emitter is required.
- *Two scope questions the wiring settles, not assumes.* (a) **`subagent fn`
  calls.** `functions.md:50` states that a `subagent fn` "is identical to an
  ordinary `fn` in its parameter list, positional call form, and
  inferred-and-validated return type", and
  [FN-6](../spec_topics/functions.md#fn-6) (`:58`, `:61`) binds its parameters
  "positionally as for `fn` and `invoke`", so such a call is in the Trigger's
  letter, and no other check covers its arguments (`src/extension/subagent-fn-static-checks.ts:1–24`
  covers cycles and callee-has-errors only). (b) **The imported-`.thetalib`
  route.** The Trigger covers it; the check needs the imported `fn`'s
  signature and the declaring file's declarations, which `collectTypeEnv`
  (`:294`) does not carry across files. Deferring on an unresolved imported
  signature is admissible under `type-system.md:48`; silently dropping the
  route is not, because the Trigger names it.
- *DIAG-2.* Not engaged if the wiring leaves the *Trigger* prose accurate — no
  code is added, removed, renamed or re-triggered, and the *Message* is
  unchanged (DIAG-4, `diagnostic-shape.md:74`). If the wiring lands narrower
  than the Trigger (for example, same-file `fn` only, or ordinary `fn` only),
  the Trigger prose moves in the same commit, and a Trigger change is a DIAG-2
  spec change requiring the registry row, `docs/reference/diagnostics.md:162`
  and `docs/reference/type-system.md:66` to move with it.
- *GOV-15.* Engaged and covered. Inputs like r1–r6 load cleanly today
  (`source-language-stability.md:9`) and would gain an `E`, changing observable
  (b). That is the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`) applied as an addition for inputs newly brought into the code's
  emission set — the disposition
  [0031](./0031-ctor-field-value-typing-unchecked.md) recorded for the same
  class (§Fix (0.43.0), `:354–358`).
- *Blast radius.* Every plain `fn` call whose callee declares a parameter type
  starts being judged; arguments that pass silently today can become `E`
  diagnostics, and an `E` denies registration. The shipped example corpus
  bounds the doc-side radius: three `fn` declarations, all with annotated
  parameters (`docs/examples/personas.thetalib:7`,
  `docs/examples/ralph-inline.theta:21`, `docs/examples/refine-inline.theta:16`)
  and three plain-`fn` call sites — `docs/examples/import-thetalib.theta:9`
  (imported `.thetalib`), `docs/examples/ralph-inline.theta:39` and
  `docs/examples/refine-inline.theta:30` (same-file `subagent fn`). The
  `.theta`-callable calls at `docs/examples/ralph.theta:12` and
  `docs/examples/refine.theta:13` are outside the Trigger.
  `rg "fn [a-z_][A-Za-z0-9_]*\([^)]*:" tests/fixtures/` returns nothing, so no
  committed fixture declares a typed parameter. A wiring measures each of the
  three call sites before landing rather than predicting them.
- *Witness.* Offline and provider-free at the `parseThetaDocument` boundary:
  r1–r6 as expected-emission rows with the message sourced from the registry
  through `registryMessage` (DIAG-4), c1–c3 as byte-unchanged controls, one row
  per deferral arm (unannotated parameter, unresolvable annotation), one row per
  excluded callee kind (`invoke`, `.theta`-callable, Pi tool) asserting the
  code does *not* appear, and the three shipped example call sites measured.

**Disposition 2 — retire the row.** Remove `theta/parse/fn-arg-type-mismatch`
from the registry and the corpus, and delete the emitter with its unit test.
This is a DIAG-2 removal: the row at `code-registry-parse.md:113`, the mirror at
`docs/reference/diagnostics.md:162`, the TYPE-9 sentence naming the site
(`type-system.md:50` and its mirror `docs/reference/type-system.md:66`),
TYPE-10's reference to the code (`type-system.md:52`), and the
function-argument-slot entry in the check-site enumeration (`:27`) all move in
the same commit, since a check-site enumeration that lists a position with no
diagnostic re-opens this defect in a different form. GOV-15's carve-out covers a
removal on the inputs that previously emitted the code — here the empty set, so
no in-scope input observes a change. The consequence to state plainly: theta
1.x then defines no compatibility check at a plain `fn` argument, at parse or at
runtime, and TYPE-9 drops to two sites.

**Recommendation: disposition 1.** Three verified facts favour it. The promise
is stated in three normative places (`type-system.md:27`, `:50`, `:52`) plus the
registry row, so retirement is the larger corpus edit and removes a check the
type system's own enumeration wants. The two other sinks that share the emitter
file, the relation and the walk are already wired, and one of them
(`object-field`, [0031](./0031-ctor-field-value-typing-unchecked.md)) was added
in a 1.x minor under the same carve-out. The emitter exists, implements the
deferral rule, and is unit-tested green (d1) — the outstanding work is
resolution and one call, not design.

## Non-goals

- **The two adjacent unwired argument rows.**
  `theta/parse/invoke-arg-type-mismatch` (`checkInvokeArgTypes`,
  `invoke-diagnostics.ts:205`, reached only from the callerless
  `checkInvokeCall`, `:398`) and `theta/parse/tool-arg-type-mismatch`
  (`tool-call.ts:256`, inside the callerless `checkToolCallArguments`, `:187`)
  have the same shape. They are recorded here as measured by grep at HEAD,
  bounding the class; they are separate rows over separate positions with their
  own Triggers and their own resolution, and neither is filed by this report.
- **Parse-time arity for a plain `fn` call.** No registry row covers it, so its
  silence is a registry question, not a divergence. `f()` and `f(3, 4)` against
  a one-parameter `fn` load clean and throw `ThetaFnArityError`
  (`statement-executor.ts:364`) at runtime.
- **Widening the check beyond declared parameter types.** An unannotated
  parameter defers by the unresolvable-operand rule (`type-system.md:48`).
  Inferring a parameter type from the body or from call sites is not part of
  either disposition.
- **The return-type direction.** A `fn`'s `): T` annotation against its body's
  inferred type is a separate site with separate machinery
  (`resolveReturnType`, `functions.ts:267`; `checkSubagentReturnAnnotation`,
  `type-layer-checks.ts:703`) and is not touched here.
- **The lowercase reference-position case rule.** 0038's residual (ii) — a
  `NamedType` at a reference position is admitted with no case diagnostic
  (`let a: nope = 3` is silent) — bears on which annotation texts reach the
  engine at all, and is unchanged by either disposition. Filed separately as
  [0051](./0051-lowercase-named-type-reference-positions-silent.md); a `fn`
  parameter annotation is one of the reference positions that report covers, so
  a wiring here inherits whatever case rule that adjudication settles.

## Provenance

- **Origin:**
  [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
  §Fix (0.48.0) *Residuals* item (i) (`:214–217`): "`theta/parse/fn-arg-type-mismatch`
  stays unreachable — `checkFnArgCompat` … has no caller in `src/`, so a
  mistyped argument against a declared schema parameter is silent. Pre-existing,
  orthogonal, recorded as a §Non-goal and unchanged." The same fact is recorded
  at that report's §Reproduction (`:391–395`, in the not-affected-position list)
  and §Non-goals (`:698–705`), and in the fix record
  `.pi/tmp/fixes/0038-report.md` §"Residuals / notes" item (i). Those three
  citations name `type-compat.ts:436`; the 0038 fix itself inserted
  `resolveNamed` above the function, so at HEAD `b34aaa52` the definition is
  `type-compat.ts:452`.
- **Evidence:** the §Reproduction command, run at HEAD, output quoted verbatim;
  `rg -n "checkFnArgCompat" src/` (one line), `rg -n "fn-arg-type-mismatch"
  src/` (four lines), `rg -n "checkInvokeCall|checkInvokeArgTypes" src/`,
  `rg -n "checkToolCallArguments\(" src/`, `rg -n "resolveFnCall" src/`, and
  `rg -n "^\s*(subagent )?fn " docs/examples/`. A scratch vitest probe over
  `parseDoc` was written, run and deleted; its rows are reproduced by the
  single command above.
- **Implementation:** `src/parser/type-compat.ts` (`:90` `TypeEnv`, `:403`
  `checkLetRhsCompat`, `:444–451`, `:452–480` `checkFnArgCompat`, `:500`
  `checkObjectFieldCompat`), `src/parser/type-layer-checks.ts` (`:53–64`
  imports, `:217` `checkTypeLayer`, `:294` `collectTypeEnv`, `:454`
  `annotationToCompatType`, `:523` `typeOf`, `:552`, `:645–651` `walkFn`, `:703`,
  `:939`, `:948`, `:1034–1052`), `src/parser/functions.ts` (`:145`
  `resolveFnCall`, `:267` `resolveReturnType`), `src/parser/theta-document.ts`
  (`:167–171` `CallExpr`, `:395–398` `FnParam`, `:460–463` `FnDecl`, `:4635`),
  `src/parser/invoke-diagnostics.ts` (`:205`, `:398–415`),
  `src/runtime/tool-call.ts` (`:187`, `:256`),
  `src/runtime/statement-executor.ts` (`:364–368`, `:377`, `:395–416`,
  `:494–503`), `src/extension/invoke-static-checks.ts` (`:298`),
  `src/extension/subagent-fn-static-checks.ts` (`:1–24`),
  `src/extension/production-theta-producer.ts` (`:5808–5817`), all at
  `b34aaa52`.
- **Spec measured against:**
  [type-system.md](../spec_topics/type-system.md) (`:27` check-site
  enumeration, `:29` operational definition, `:48` unresolvable operands, `:50`
  TYPE-9, `:52` TYPE-10);
  [code-registry-parse.md:113](../spec_topics/diagnostics/code-registry-parse.md)
  (the row; `:9` column header, `:46` `object-field-type-mismatch`, `:54`
  `let-rhs-type-mismatch`, `:111` `invoke-arg-type-mismatch`, `:112`
  `tool-arg-type-mismatch`, `:115`–`:116` the invoke arity rows);
  [diagnostic-shape.md](../spec_topics/diagnostics/diagnostic-shape.md) (`:71`
  DIAG-1, `:72` DIAG-2, `:74` DIAG-4);
  [functions.md](../spec_topics/functions.md) (`:20` FN-1, `:50` the
  `subagent fn` equivalence sentence, `:58` and `:61` FN-6);
  [source-language-stability.md](../spec_topics/governance/source-language-stability.md)
  (`:5` GOV-15, `:9` loads-cleanly predicate, `:25` diagnostic-registry
  carve-out).
- **Mirrors:** `docs/reference/diagnostics.md:162` (message transcription;
  scope statement `:3–9`), `docs/reference/type-system.md:64–69` (TYPE-9
  summary, the site at `:66`).
- **Tests and tooling read, none changed:** `tests/type-compat.test.ts:5`,
  `:23`, `:267–283`; `tests/helpers/e2e-s1.ts:39`;
  `tools/code-registry/index.js:99`; `tests/code-registry.test.ts:86–125`;
  `tests/closing-gate.test.ts:15–26`;
  `tests/typeenv-prototype-names.test.ts:163`, `:553` (0038's recorded note on
  this row).

## Coordination note — bug 0084 landed (0.71.0)

Bug [0084](./0084-increment-decrement-check-dead.md) — cited in this report's
§Related as the adjacent member of the same dead-enforcement class — shipped
its fix in 0.71.0, and it is the first member of that class to be discharged by
*wiring* rather than by amending the promise. Its mechanism is recorded here
because it is the template this report's own disposition 1 would follow: the
emitter could not simply be called, because no token existed for it to be called
on, so the fix (i) taught the lexer to produce the token the emitter's input type
already described, and (ii) called the emitter at the expression walk, where
every position that accepts an expression funnels through, rather than at the
statement walk alone.

That second point is the transferable one. 0084's §Fix warned that
statement-position-only coverage would leave its `fn`-body row silent; hooking
`parseUnary` and `parsePostfix` covered statement, expression, loop-body and
`fn`-body positions with one pair of call sites. This report's defect is
otherwise untouched: 0.71.0 changed nothing in the argument-typing path, its
registered row, or its emitter, and settles nothing about the choice between
this report's two dispositions.

## Coordination note (0.72.0)

Bug [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) shipped in 0.72.0
and settles nothing here. It is the **body** side of the same `fn` boundary: an
alias-typed parameter's recorded type was misread by the `for` / `par for`
iterand gate and the `array.join` element gate, and its fix unfolds that type
through `unfoldAlias` at those gates. This report is the **caller** side.
`checkFnArgCompat` (`src/parser/type-compat.ts`) still has no `src/` caller
after 0.72.0 — verified by `rg` at that fix commit, which returns only its own
export — so an argument's static type is still never checked against the
declared parameter type, and this report's two dispositions remain unchosen.

The two fixes are disjoint in both directions, as this report's §Related
predicted: 0089's reproductions are unchanged by wiring `checkFnArgCompat`, and
`theta/parse/fn-arg-type-mismatch` is still unemitted after 0089. The one
transferable observation is that the parameter **record** — `walkFn`'s
`fnScope.set(p.name, annotationToCompatType(p.type) ?? …)` — was re-examined
during 0089 and deliberately left recording the declared type raw. Any fix here
reads that record, and it is TYPE-11-opaque by design, so a caller-side check
must apply the transparency itself.
