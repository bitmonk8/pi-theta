# Bug 0137 — `theta/parse/invoke-arg-type-mismatch` is a registered `E`-severity row whose sole emitter `checkInvokeArgTypes` (`invoke-diagnostics.ts:205`) is reached only from `checkInvokeCall` (`:398`), and `checkInvokeCall` has no caller anywhere in `src/`: `invoke("./callee.theta", 1)` at a `params: x: string` callee loads clean and registers, where the identical mistype through the `.theta`-callable form draws `theta/parse/tool-arg-type-mismatch` and through a plain `fn` call draws `theta/parse/fn-arg-type-mismatch` — the invoke-row twin of bug 0050's defect, split out of its fix by name

- **Status:** fixed (0.78.0). The family's disposition taken — the caller
  wired at the invoke-literal arm through `checkInvokeCall`. All four §Fix
  sub-questions settled in the run and recorded in §Fix (0.78.0).
- **Sev/Diff estimate:** S1/D2 — a declared `params:` constraint is unenforced
  at the position `invocation.md:38`, `type-system.md:52` and
  `docs/reference/discovery-cli.md:240–241` all put it: four measured mistyped
  `invoke` sites register with zero diagnostics on any channel, and the same
  mistake through either sibling call form is refused at load, so enforcement
  diverges by call spelling alone (softened, not erased, by the child-side
  marshalled-params validator on the subagent arm —
  `subagent-params.ts:233–251`, not measured here, §Non-goals). D2 because the wiring point already resolves
  the callee (`invoke-static-checks.ts:729`), the next loop of the same function
  already implements every soundness discipline the fix needs
  (`collectProvableArgTypes`, the empty callee-annotation env, arity-before-type)
  for the same data, and no registry row moves; the named extra work is
  widening `CalleeArityField` to carry the param name and one GOV-15 addition
  sweep.
- **Kind:** defect — implementation, against three written sentences and one
  registered *Trigger*. Three elements:
  1. **The registered row's sole emitter is unreachable.**
     `docs/spec_topics/diagnostics/code-registry-parse.md:114` registers
     `theta/parse/invoke-arg-type-mismatch` at `E` severity, phase `type`, with
     this *Trigger* verbatim:

     > `invoke(...)` argument does not type-check against the callee's declared
     > `params` schema (when the callee is statically resolvable).

     The condition is over author source text and over a callee the load pass
     already resolves. No source text reaches the emitter:
     `checkInvokeArgTypes` (`src/parser/invoke-diagnostics.ts:205`, emission
     `:219–230`) is called from exactly one place, `checkInvokeCall` (`:414`),
     and `checkInvokeCall` (`:398`) has no caller in `src/` at all.
  2. **The obligation the *Trigger* encodes is stated three times in the
     corpus, twice normatively.** `docs/spec_topics/invocation.md:38` —
     "Arguments bind positionally to the callee's `params:` in declaration
     order, with each argument type-checked against the param's declared
     schema. Type mismatches surface as `theta/parse/invoke-arg-type-mismatch`
     when the callee is statically resolvable … otherwise the runtime AJV check
     is the safety net." `docs/spec_topics/type-system.md:52` (TYPE-10) names
     the row among the three sites a cross-form or cross-named-schema mismatch
     is "reported at parse time on the offending site … **not deferred to a
     runtime AJV failure**". `docs/reference/discovery-cli.md:240–241` states
     it to authors: "Positional, in `params:` declaration order, each
     type-checked against the param's schema (the slash-boundary binder does
     not run)."
  3. **Enforcement diverges across three spellings of one mistake.** Measured
     (§Reproduction (b)): the same integer-under-`string` argument is refused
     at load through a `.theta`-callable call (`theta/parse/tool-arg-type-mismatch`,
     bug 0072's wiring) and through a same-file `fn` call
     (`theta/parse/fn-arg-type-mismatch`, bug 0050's 0.77.0 wiring), and
     admitted through `invoke(...)`. Arity on the *same* `invoke` surface is
     refused (§Reproduction (c)), so the gap is one check wide, not one surface
     wide.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the family precedent and the report that filed this one.
    Its §Actual behaviour item 6 measured this row's caller graph as part of
    bounding its own class: "`theta/parse/invoke-arg-type-mismatch` is emitted
    only by `checkInvokeArgTypes` … reached only from `checkInvokeCall`, which
    has no caller in `src/`". Its §Non-goals declined it in terms — "recorded
    here as measured by grep at HEAD, bounding the class; they are separate rows
    over separate positions with their own Triggers and their own resolution,
    and neither is filed by this report". Its fix then **deliberately split the
    `invoke` label out** of the new emission arm rather than sweeping it in, and
    left the reason in the tree at `src/parser/type-layer-checks.ts:1992–1996`:
    "`invoke` shares this arm's label with `call` in the grammar but not in the
    registry: it carries its own row (`theta/parse/invoke-arg-type-mismatch`)
    and its own, separately unwired emitter — a different open defect this walk
    does not fix." Its fix record names this filing by number. **Two dispositions
    it settled bind here**: retiring the row was rejected by the operator, and
    the argument type must be a PROVEN read, not an inferred one — all ten
    `correctness` findings across its eight review rounds were the same species,
    an unsound static read producing a false `E` against a well-typed program.
    **It does not reach this position**: its emission arm is `walkExpr`'s `call`
    case in the parser's type layer, and an `invoke` is a different AST arm at a
    different pass, against a callee in a different file that the type layer
    never opens.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, and the closest structural model. It wired the per-argument type
    check for the `.theta`-callable call surface into
    `checkInvokeStaticResolution`, in the loop directly after the block a fix
    here edits (`src/extension/invoke-static-checks.ts:797–881`). Everything the invoke arm
    needs already exists there for the same resolved callee: the shared
    `StaticTypeInferencePass` and whole-file `TypeEnv` built once per theta
    (`:747–748`), `collectProvableArgTypes` (`:484`) with its
    every-arm-incompatible discipline (`:844–856`), the empty
    callee-annotation `TypeEnv` that keeps a caller-local homonym from deciding
    a verdict about the callee's contract (`:827`), and the arity-before-type
    `continue` (`:791–796`). **Its subject was a different code on a different
    surface** — three `theta/parse/tool-arg-*` rows over Pi-tool and
    `.theta`-callable calls — and its fix touched no `invoke(...)` literal site,
    which §Reproduction (b) measures directly.
  - [0071](./0071-theta-callable-call-arity-unchecked.md) — **fixed (0.64.0)**.
    It carried `checkInvokeArity` onto the `.theta`-callable surface through the
    shared call-site walk; the invoke-literal arity arm it left in place
    (`invoke-static-checks.ts:725–741`) is the block that resolves the callee a
    fix here reads. Its witness `tests/theta-callable-call-arity.test.ts` is the
    harness shape §Reproduction uses. Arity, not type — disjoint check, shared
    resolution.
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, the
    other "registered row, no reachable input" precedent. It shipped the
    wire-the-caller disposition. Cited for the disposition, not the position.
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) —
    **open**, the mirror. There a compatibility obligation is stated in the spec
    (`bindings.md:12`) and **has no registry row at all**, so its fix needs a
    DIAG-2 adjudication first. Here the row exists, its *Trigger* is accurate,
    and the emitter is written and unit-tested — the two ends of the same
    family, and the reason this report needs no registry edit.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, and the
    ordering note it records does **not** extend to this report.
    `invocation.md:48` requires arity before per-argument type, and on this
    surface arity is already wired and already ordered first
    (`invoke-static-checks.ts:725–741` runs before any type block a fix adds;
    `checkInvokeCall:402–413` encodes the same order). 0131's subject is the
    in-document `fn` call, a position with no arity check and no registry row.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The registered row.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:114` — `E`, phase
    `type`, spec anchor *[Invocation — Argument binding]*, *Hint* `—`, *Message*
    `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`.
    Mirror without a *Trigger* column: `docs/reference/diagnostics.md:163`,
    byte-identical *Message*.
  - **The emitter.** `src/parser/invoke-diagnostics.ts:205–233`
    (`checkInvokeArgTypes`), emission `:219–230`, code constant `:59`. The
    constant has exactly two references in `src/` — its declaration and `:221`
    — so `:219–230` is the row's sole construction site (the other three
    references in the tree are `tests/invoke-diagnostics.test.ts:7`, `:84`,
    `:233`). The body is
    correct as written: it skips entirely on a non-resolvable callee (`:209–211`,
    `invocation.md:38`'s runtime-AJV arm) and defers per slot on a
    `checkCompatible` `"unknown"` (`:216–218`, `type-system.md:48`).
  - **The unreachable orchestrator.** `:398–415` (`checkInvokeCall`) — arity
    first (`:402–410`), returning early when arity fails, then the per-argument
    type check (`:414`). `rg -n "\bcheckInvokeCall\b" src/` returns one line,
    `:398`, its own declaration. The only other reference in the tree is
    `tests/invoke-diagnostics.test.ts:16` (import) and `:213` (call).
  - **The wired invoke path, and where the type check is absent.**
    `src/extension/invoke-static-checks.ts:649` (`checkInvokeStaticResolution`),
    the invoke-literal loop at `:674`, and its arity block at `:725–741`: it
    resolves the callee (`const arity = await deps.resolveCalleeArity(resolvedPath)`,
    `:729`), computes `providedCount` excluding the leading path literal
    (`:728`), calls `checkInvokeArity` (`:732`), and ends. No per-argument type
    check follows, and the loop iterates. `import { checkInvokeArity,
    checkCalleeHasErrors }` at `:50` is the module's whole import from
    `invoke-diagnostics` — `checkInvokeArgTypes` and `checkInvokeCall` are not
    imported here or anywhere else in `src/`.
  - **The sibling arm that already does this job for the other surface.**
    `:757` (the `.theta`-callable loop), `:771` (`checkInvokeArity`), `:791–796`
    (the arity-before-type `continue`), `:827` (`emptyCalleeAnnotationEnv`),
    `:828–881` (the per-slot loop: `annotationToCompatType` on the callee's
    verbatim `typeSource`, `collectProvableArgTypes`, the every-arm-incompatible
    test, `checkToolCallArguments`, first-mismatch-only `break`).
    `collectProvableArgTypes` is defined at `:484`.
  - **The data-shape gap.** `CalleeArityField` (`:358–361`) carries
    `typeSource` and nothing else; `resolveCalleeArity`
    (`src/extension/production-composition.ts:1316–1346`) builds it at `:1345`
    as `fields.map((field) => ({ typeSource: field.type }))`. The
    `.theta`-callable row's *Message* is `tool '<name>' argument type mismatch:
    expected <expected>, got <actual>` — no `<param>`, so 0072 never needed the
    field name. **This row's *Message* carries both `<i>` and `<param>`**
    (`code-registry-parse.md:114`), so the resolved shape must widen. `<i>`'s
    documented meaning is at `invoke-diagnostics.ts:86–87`: "the 0-based
    positional argument index".
  - **The registration consequence.**
    `src/extension/production-composition.ts:2045` (`hasLoadParseError`) drops
    any theta carrying an error-severity `theta/load/*` or `theta/parse/*`
    diagnostic. The row is `E`, so a mistyped site that fired would deny
    registration — which is what the two sibling surfaces measurably do
    (§Reproduction (b)) and this one does not.
  - **The rest of the module is wired; this row is the only hole.** Verified by
    `rg -n "\b<name>\b" src/` per export:
    `checkInvokeReturnType` → `src/parser/type-layer-checks.ts:1307`;
    `checkInvokeArity` → `invoke-static-checks.ts:732`, `:771`;
    `checkCalleeHasErrors` → `invoke-static-checks.ts:709`,
    `production-composition.ts:1505`, `src/extension/subagent-fn-static-checks.ts:256`;
    `checkInvokeExtension` (`:441`) has no caller either, **but its code is
    live** — `theta/parse/invoke-non-theta-extension` is emitted inline from
    `src/lexer/literals.ts:101`, so that is dead code with a reachable row, a
    different finding (§Non-goals). `checkInvokeArgTypes` is the only export
    whose code has no other emitter.
  - **The comment 0050's fix left at the split.**
    `src/parser/type-layer-checks.ts:1992–1996` — the `case "invoke"` arm of
    `walkExpr`, which walks the argument expressions and emits nothing, naming
    "its own, separately unwired emitter — a different open defect this walk
    does not fix". `:1592–1595` records the same boundary from the other side:
    a callee that is not a user `fn` returns early because each non-`fn` case
    "has its own owning diagnostic (`tool-arg-type-mismatch`,
    `invoke-arg-type-mismatch`, or `unknown-identifier`)".
  - **The coverage gate is satisfied without reachability.**
    `tests/invoke-diagnostics.test.ts:76–102` asserts the code, its `error`
    severity and its exact *Message* by calling `checkInvokeArgTypes` with
    hand-built `CompatType`s; `:212–236` asserts arity-before-type through
    `checkInvokeCall` the same way. `tools/closing-gate/index.js:701–710`
    (finding kind `registry-code-no-asserting-test`) scans test sources for
    asserted codes, so an asserting unit test clears the gate for a row no input
    can fire. No gate in the tree relates a registered code to a *reachable*
    emission.
  - `docs/spec_topics/invocation.md:20` — *Static resolution*, which names
    "argument-type checking ([Argument binding] below …)" as one of the three
    consumers of the per-load-pass parse cache. `:22` — the surface severity
    split and the sentence that scopes the runtime net: an unparseable
    `invoke(...)` callee is a **warning**, "static checks against that callee
    are skipped, and the runtime AJV check is the safety net **for the skipped
    checks**". `:38` — *Argument binding*. `:48` — arity before per-argument
    type. `:50–51` — the arity rows.
  - `docs/spec_topics/type-system.md:31` — the closed structural-case list,
    which names this row among the `theta/parse/*-type-mismatch` codes a case
    outside the list is reported as. `:48` — the unresolvable-operand rule the
    emitter's `"unknown"` arm already implements. `:50` (TYPE-9), `:52`
    (TYPE-10).
  - `docs/spec_topics/tool-calls.md:14` — §*Argument shape*, which fixes the
    invoke surface as the reference: a `.theta` callable's mismatch surfaces as
    `theta/parse/tool-arg-type-mismatch` when statically resolvable, "otherwise
    the runtime AJV check is the safety net … matching the
    non-statically-resolvable `invoke(...)` input-validation arm".
  - `docs/plan_topics/coverage-matrix.md:138` — row `cka-14` maps this code and
    five siblings to the retired `V15f` leaf, "un-anchored; GOV-22 residue".
    `docs/plan_topics/V15f-invoke-diagnostics.md:1` and
    `V15f-T-invoke-diagnostics.md:1` are both retired.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
    Every §Reproduction (a) row loads cleanly today, so the fix is in the
    carve-out's addition direction.
  - **Test coverage of this defect: none.** No test drives a mistyped
    `invoke(...)` argument through any load path.
    `tests/invoke-diagnostics.test.ts` exercises the emitter in isolation only.
    `tests/theta-callable-call-arity.test.ts` drives the shipped composition
    root over `invoke` sites, but only at wrong arity (`invtoofew`,
    `invtoomany`, `parinvoke`, `parmax`); every one of its invoke callers passes
    `params: x: string, y: string` and string arguments.
    `tests/tool-arg-parse-checks.test.ts` covers 0072's surface.
    `tests/fn-arg-type-mismatch-wired.test.ts:1151` names this row in a comment
    while pinning that the `fn` walk stays out of it.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Every row through the shipped composition root
  `discoverAndComposeFixtures` (`src/extension/production-composition.ts`) over
  a planted `.pi/theta/` discovery workspace in a temp directory, with the fake
  `pi` / `ctx` shape `tests/theta-callable-call-arity.test.ts:429–451`
  establishes. The two observables are the production ones: which slash names
  the root returned, and which error-severity messages reached `ctx.ui.notify`.
  One scratch vitest file, run on the outputs quoted below, then deleted.
  `src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
  unmodified by this filing.

## Summary

`theta/parse/invoke-arg-type-mismatch` is registered at `E` severity with a
*Trigger* that is a condition over author source text and a callee the load pass
already opens. The function that emits it, `checkInvokeArgTypes`, is exported,
unit-tested, correct, and reached from one place: `checkInvokeCall`. That
orchestrator has no caller in `src/` — `rg -n "\bcheckInvokeCall\b" src/` returns
its own declaration and nothing else. The row cannot fire.

The wired invoke path stops one step short. `checkInvokeStaticResolution`'s
invoke-literal loop (`invoke-static-checks.ts:674`) resolves the callee's
`params:` shape at `:729`, passes it to `checkInvokeArity` at `:732`, and moves
to the next site. The resolved shape it already holds carries each param's
verbatim declared type (`CalleeArityField.typeSource`, `:358–361`), and the next
loop in the same function performs exactly this check on exactly this data for
the `.theta`-callable surface.

Measured through the shipped composition root: `invoke("./callee.theta", 1)`
against a callee declaring `params: x: string` **registers with zero diagnostics
on any channel**. So do the boolean, array-literal and typed-`let`-integer
spellings of the same mistake, and the same call inside a `par for` body. The
identical mistype is refused at load through both sibling call forms — `ci(1)`
draws `tool 'ci' argument type mismatch: expected string, got integer` and
`g(1)` draws `fn 'g' argument 0 ('x') type mismatch: expected string, got
integer`, each un-registering its caller. Arity on the *same* invoke surface is
also refused (`invoke './cg.theta' passes too few arguments: expected 1
non-defaulted, got 0`). One check is missing from one arm; nothing else on the
surface is.

Three corpus sentences state the obligation. `invocation.md:38` assigns the
mismatch to this row when the callee is statically resolvable and offers the
runtime AJV net only for the case where it is not. TYPE-10
(`type-system.md:52`) names the row among the three sites at which a cross-form
mismatch is "reported at parse time on the offending site … not deferred to a
runtime AJV failure". `docs/reference/discovery-cli.md:240–241` tells authors
each argument is "type-checked against the param's schema".

The row satisfies the closing gate anyway. `tools/closing-gate/index.js:701–710`
reports a registry code with no *asserting test*;
`tests/invoke-diagnostics.test.ts:76–102` asserts the code by calling the
emitter directly with hand-built types. No gate in the tree relates a registered
code to a reachable emission, which is how the row survived from the retired
`V15f` leaf to HEAD.

## Reproduction

Offline, deterministic, at `3efdb4ac`. Each row is one planted `.theta` in a
temp `.pi/theta/` workspace loaded by `discoverAndComposeFixtures`. Every callee
declares `params:` with a single `x: string` field. `registered` is membership in
the returned fixture list; `notify` is the error-severity message the root
surfaced, verbatim, or `—` for none. Callee stems are distinct per caller because
`ctx.ui.notify` carries no caller attribution.

### (a) The reported shape — four mistyped `invoke` sites, all silent

```
@@ a1  invoke("./ca.theta", 1)                        [integer literal under string]
   registered :: YES     notify :: —
@@ a2  invoke("./cb.theta", true)                     [boolean literal under string]
   registered :: YES     notify :: —
@@ a3  invoke("./cc.theta", ["a"])                    [array literal under string]
   registered :: YES     notify :: —
@@ a4  let n: integer = 1 / invoke("./cd.theta", n)   [typed let binding under string]
   registered :: YES     notify :: —
@@ a5  par for a in ["a"] { invoke("./cj.theta", 1) } [inside a par for body]
   registered :: YES     notify :: —
@@ a6  [control] invoke("./ce.theta", "a")            [well-typed]
   registered :: YES     notify :: —
```

a1–a4 span the four argument shapes whose static type the parser decides without
consulting any declaration: a literal of each of three primitive/aggregate kinds,
and a binding whose type the author annotated. a5 places the same call in the
`par for` body arm bug 0071's walk already descends into. a6 is the control the
absence rows are read against: it registers for the right reason, so `registered
:: YES` in a1–a4 measures the missing check and not a broken workspace.

The message the registered row would produce for a1 is
`invoke argument 0 ('x') type mismatch: expected string, got integer`
(`code-registry-parse.md:114`, filled by `invokeArgTypeMismatchMessage`,
`invoke-diagnostics.ts:89–96`).

### (b) The same mistake through the two sibling call forms — both refused

```
@@ b1  tools: - ./ci.theta / ci(1)
   registered :: NO
   notify     :: tool 'ci' argument type mismatch: expected string, got integer
@@ b2  fn g(x: string): string { x } / let q = g(1)
   registered :: NO
   notify     :: fn 'g' argument 0 ('x') type mismatch: expected string, got integer
```

b1 is bug 0072's wiring on the `.theta`-callable surface; b2 is bug 0050's,
shipped in 0.77.0 at this HEAD. Both refuse the argument at load and un-register
the caller. a1 is the same integer argument at the same declared param type
against a callee of the same shape, and it registers. **Enforcement of a declared
`params:` type currently depends on which of three call spellings the author
chose.**

### (c) Arity on the same invoke surface — wired, and ordered first

```
@@ c1  invoke("./cf.theta", "a", "b")     [one param, two args]
   registered :: NO
   notify     :: invoke './cf.theta' passes too many arguments: expected at most 1, got 2
@@ c2  invoke("./cg.theta")               [one required param, zero args]
   registered :: NO
   notify     :: invoke './cg.theta' passes too few arguments: expected 1 non-defaulted, got 0
@@ c3  invoke("./ch.theta", 1, 2)         [too many AND mistyped]
   registered :: NO
   notify     :: invoke './ch.theta' passes too many arguments: expected at most 1, got 2
```

c1 and c2 establish that the invoke arm resolves the callee, reads its `params:`
counts and emits — so the callee resolution a type check needs is present and
working at this exact site. c3 carries both defects and reports arity alone,
which is `invocation.md:48`'s order; it also shows the ordering is already
satisfied structurally, since the block that would host a type check runs after
the arity block that `continue`s past it.

### (d) The spec'd deferral — unchanged and correct

```
@@ d1  invoke("./nosuch.theta", 1)        [callee resolves to no file]
   registered :: YES
   notify     :: —
   (warning surfaced: theta/load/callee-has-errors — callee './nosuch.theta' has
    errors; see related diagnostics)
```

`invocation.md:22` makes a literal `invoke(...)` against an unresolvable callee a
**warning**, with the parent registering and "static checks against that callee
… skipped". d1 is that disposition working. It is the input class the emitter's
own `:209–211` guard already handles, and the one a fix must leave alone.

## Expected behaviour

**The row's *Trigger* is accurate and a1 satisfies it.** The registered
condition (`code-registry-parse.md:114`) is "`invoke(...)` argument does not
type-check against the callee's declared `params` schema (when the callee is
statically resolvable)". In a1 the argument is the integer literal `1`, the
callee's declared `params` schema for slot 0 is `string`, and the callee is
statically resolvable by `invocation.md:20`'s definition — "a callee referenced
by a literal `invoke("./path.theta", ...)` … if the runtime can open, parse, and
lower the callee file during the calling theta's load pass" — which the arity
emission in c1/c2 proves the load pass does at this site. Every clause of the
*Trigger* holds and no diagnostic fires. This is the implementation failing to
meet a registered row, not a row overstating an intended behaviour: the row's
condition is a fact about source text and the source text has it.

**The runtime AJV net is offered for a different input class.**
`invocation.md:38` splits the two arms in one sentence: mismatches "surface as
`theta/parse/invoke-arg-type-mismatch` when the callee is statically resolvable
… **otherwise** the runtime AJV check is the safety net". `:22` scopes the net
the same way — it is the fallback "for the skipped checks" when a callee is
unparseable. `tool-calls.md:14` fixes the reading from the other surface, naming
the runtime `Err(InvokeInfraError { cause: "validation", ... })` arm as the one
that matches "the **non**-statically-resolvable `invoke(...)` input-validation
arm". A resolvable callee is not in that arm, so nothing in the corpus makes a1's
silence the specified disposition.

**TYPE-10 forecloses the deferral explicitly for one input class.**
`type-system.md:52`: a cross-form or cross-named-schema mismatch "is reported at
parse time on the offending site through that site's own diagnostic
(`theta/parse/let-rhs-type-mismatch`, `theta/parse/fn-arg-type-mismatch`, or
`theta/parse/invoke-arg-type-mismatch`; see TYPE-9), **not deferred to a runtime
AJV failure**". Two of those three rows are wired at HEAD (bug 0050 shipped the
second in 0.77.0); the third is this one. For the named-schema argument class,
deferral is refused by name.

**The author-facing reference states the check as a fact.**
`docs/reference/discovery-cli.md:240–241` describes argument binding as
"Positional, in `params:` declaration order, each type-checked against the
param's schema", and lists the arity codes immediately after as the parse-time
outcomes. An author reading it gets a check the implementation does not perform,
beside two codes it does.

**What a1–a5 should report.** Each draws one
`theta/parse/invoke-arg-type-mismatch` at the call site, `E` severity, with the
registered *Message* filled — for a1, `invoke argument 0 ('x') type mismatch:
expected string, got integer` — and `hasLoadParseError`
(`production-composition.ts:2045`) denies registration, matching b1 and b2. a6
and d1 stay exactly as measured.

## Actual behaviour / root cause

**One unreached call edge.** The emitter is correct and the orchestrator above
it is correct; the orchestrator is never called.

```ts
// src/parser/invoke-diagnostics.ts:398
export function checkInvokeCall(input: InvokeCallInput): Diagnostic[] {
  const { callee, staticallyResolvable, requiredCount, totalCount, args, env, site } =
    input;
  // Arity is checked BEFORE per-argument type (invocation.md §Argument arity).
  const arityDiags = checkInvokeArity({ … });          // :402
  if (arityDiags.length > 0) {
    return arityDiags;                                  // :411
  }
  // Arity is in range → run the per-argument type check.
  return checkInvokeArgTypes({ staticallyResolvable, args, env, site });  // :414
}
```

`:414` is the only reference to `checkInvokeArgTypes` in the tree outside its own
declaration and the unit test. `rg -n "\bcheckInvokeCall\b" src/` returns
`:398` alone.

**The wired path calls the arity half directly and stops.** The shipped invoke
arm (`invoke-static-checks.ts:725–741`) imports `checkInvokeArity` — not
`checkInvokeCall` — resolves the callee, emits arity, and ends the iteration:

```ts
      const providedCount = Math.max(0, invoke.args.length - 1);   // :728
      const arity = await deps.resolveCalleeArity(resolvedPath);   // :729
      if (arity !== undefined) {
        diagnostics.push(
          ...checkInvokeArity({ callee: invoke.path, staticallyResolvable: true,
            requiredCount: arity.requiredCount, totalCount: arity.totalCount,
            providedCount, site }),                                // :732
        );
      }
    }
```

`arity` already carries `fields`, "the callee's WHOLE `params:` list, in
declaration order" (`:369–375`), each entry holding the field's verbatim declared
type source. The value a type check needs is in scope at `:741` and discarded.

**The identical check exists in the next loop, on the other surface.** The
`.theta`-callable loop (`:757`) runs the same `resolveCalleeArity`, the same
`checkInvokeArity`, then `continue`s on an arity rejection (`:791–796`) and runs
a per-slot type check (`:828–881`) built on three disciplines the invoke arm
would inherit unchanged: `annotationToCompatType` over the callee's own
`typeSource`; an **empty** callee-annotation `TypeEnv` (`:827`) so a caller-local
homonym cannot decide a verdict about the callee's contract; and
`collectProvableArgTypes` (`:484`) with an emission condition that requires
**every** value the argument can take to be explicitly incompatible (`:844–856`),
so an argument past the parser's static view defers to the callee's runtime AJV
load. It emits through `checkToolCallArguments` because its row is
`theta/parse/tool-arg-type-mismatch`. The invoke arm's row is different, so the
emitter is different; nothing else about the shape changes.

**The split was deliberate and is recorded in the tree.** Bug 0050's fix wired
`theta/parse/fn-arg-type-mismatch` at `walkExpr`'s `call` arm and left the
`invoke` arm emitting nothing, with the reason inline
(`type-layer-checks.ts:1992–1996`): the two share a grammar label but not a
registry row, and the invoke row "carries … its own, separately unwired emitter
— a different open defect this walk does not fix". That position is also the
wrong one for the fix: the type layer runs inside one document's parse and never
opens a callee file, whereas the callee's `params:` are only available at the
load pass that `checkInvokeStaticResolution` runs in.

**Nothing detects the hole.** `tools/closing-gate/index.js:701–710` reports a
registry code no test *asserts*; `tests/invoke-diagnostics.test.ts:76–102`
asserts it against a hand-built `InvokeArgSlot`, and `:212–236` asserts
arity-before-type against a hand-built `checkInvokeCall` input. Both pass. The
row's provenance is `coverage-matrix.md:138` row `cka-14`, which maps it to the
retired `V15f` leaf and flags the whole group "un-anchored; GOV-22 residue" — so
no REQ-ID anchor scores its reachability either.

## Why it matters

- **A declared `params:` type is unenforced at the position three documents
  assign it.** a1–a5 register and dispatch. The author who wrote `x: string` and
  the author who passed `1` both get silence at load; whatever happens next
  happens after the invoke boundary, not before it.
- **Enforcement depends on call spelling.** The same integer under the same
  declared `string` param is refused through a `tools:` callable (b1) and through
  a same-file `fn` (b2) and admitted through `invoke(...)` (a1). An author
  refactoring a `tools:` entry into a literal `invoke` loses a load-time check
  with no diagnostic marking the loss.
- **The gap is one check wide, which makes it invisible from the outside.**
  Arity fires on this surface (c1, c2), in the right order (c3), rendering the
  same `<callee>` form. A site that reports arity correctly and says nothing
  about types reads as a site with well-typed arguments.
- **The registry over-states the implementation, and the closing gate agrees
  with the registry.** The row's *Trigger* describes source text no input
  satisfies, while `tools/closing-gate/index.js:701–710` marks it covered
  because a unit test asserts it. The registry is closed under DIAG-2 and read by
  tests, tooling and authors as the inventory of what the implementation
  reports.
- **TYPE-10's parse-time promise is two-thirds kept.** Of the three rows
  `type-system.md:52` names as the parse-time reporting sites that are "not
  deferred to a runtime AJV failure", `let-rhs-type-mismatch` and — since
  0.77.0 — `fn-arg-type-mismatch` fire. A named-schema argument crossing an
  `invoke` boundary is the remaining one.
- **The fix is cheaper here than at the sibling rows and gets cheaper the
  sooner it lands.** Bug 0072 already built and reviewed the soundness
  discipline on the adjacent arm of the same function, over the same resolved
  callee shape. That code is the fix's model while it is still adjacent.

## Non-goals

- **`checkInvokeExtension`'s dead body.**
  `invoke-diagnostics.ts:441–459` also has no `src/` caller, but its code
  `theta/parse/invoke-non-theta-extension` **is** reachable — emitted inline from
  `src/lexer/literals.ts:101`. That is dead code behind a live row, the opposite
  shape, and it is not filed here. Recorded as measured by `rg` at HEAD so the
  class is bounded: `checkInvokeArgTypes` is the only export in the module whose
  row has no other emitter.
- **Whether a runtime check catches the mistype today, and on which callee-mode
  arm.** Not measured: the offline load path is this report's whole evidence
  base. One seam exists and is named, not claimed —
  `src/runtime/subagent-params.ts:233–251` (`intakeChildParams`) validates
  marshalled params against the callee's `params:` schema child-side
  (`ParamsSchemaValidator`, `:214–219`) and refuses fail-closed with
  `Err(InvokeInfraError { cause: "validation" })`. Establishing
  the runtime disposition per cross-mode cell needs a live probe and belongs with
  whatever report claims it. It does not change this report's subject: the
  corpus assigns the *resolvable* case to parse time and TYPE-10 refuses the
  deferral by name.
- **The `invoke<Schema>` return-type row.**
  `theta/parse/invoke-return-type-mismatch` is wired
  (`type-layer-checks.ts:1307`) and out of scope.
- **The `.theta`-callable and Pi-tool argument surfaces.** Bug 0072's, fixed and
  measured green here (b1).
- **Arity at any position.** Wired on this surface (c1–c3); bug 0131 owns the
  in-document `fn` call position.
- **Widening the check beyond declared param types.** A callee param whose
  declared type does not resolve to a decidable `CompatType` defers by
  `type-system.md:48`, as it does on the sibling arm. Inferring a param type
  from the callee body is not part of this fix.

## Fix

The disposition is the family's: **wire the caller**. Bug 0084 shipped it, bug
0072 shipped it on the adjacent arm, bug 0050 shipped it in 0.77.0 after the
operator rejected retiring the row. No registry edit is needed — the *Trigger* is
accurate and the wiring lands at its full letter, so DIAG-2 is not engaged and
the DIAG-4 *Message* is unchanged.

**Where.** `src/extension/invoke-static-checks.ts`, the invoke-literal loop's
arity block (`:725–741`), immediately after the existing `checkInvokeArity`
push and gated on it producing nothing — mirroring the `.theta`-callable arm's
`continue` at `:791–796`, which is `invocation.md:48`'s order. The callee is
already resolved at `:729` and the loop already runs inside the shared call-site
walk (`:674`), so no new traversal and no new callee read is introduced (bug
0071 §Fix constraint 3).

**Soundness discipline — not optional, and already written.** Reuse the sibling
arm's three mechanisms verbatim over the same data: the shared
`StaticTypeInferencePass` and whole-file `TypeEnv` derived once per theta
(`:747–748`, bug 0072's constraint — never per call site); the empty
callee-annotation `TypeEnv` (`:827`) so the EXPECTED side is judged in the
callee's namespace and a caller-local homonym cannot decide it; and
`collectProvableArgTypes` (`:484`) with emission conditioned on **every** value
the argument can take being explicitly incompatible (`:844–856`). Bug 0050's
review record is the reason this is a constraint rather than a preference: all
ten of its `correctness` findings across eight rounds were one species — an
unsound static read at the new sink producing a false `E` against a well-typed
program.

**Four sub-questions the run settles:**

1. **The param name.** The row's *Message* carries `<param>`
   (`code-registry-parse.md:114`) and `CalleeArityField` carries only
   `typeSource` (`invoke-static-checks.ts:358–361`,
   `production-composition.ts:1345`). The sibling row has no `<param>`, so 0072
   never needed it. Widening `CalleeArityField` with the field name is the
   smallest route; the alternative is a second read of the callee's frontmatter,
   which duplicates a resolution the pass already performed. Whichever is taken,
   `resolveCalleeArity`'s two consumers must stay consistent.
2. **`<i>`'s base at this surface.** `invoke("./x.theta", a, b)` puts the path
   literal at `args[0]`, and `:728` already subtracts it for the arity count.
   `invoke-diagnostics.ts:86–87` documents `<i>` as "the 0-based positional
   argument index", and `checkInvokeArgTypes` derives it from the `args` array's
   own index (`:213`, `:225`). Slot `i` must therefore correspond to
   `invoke.args[i + 1]`, so the reported index counts param slots and not raw
   call arguments. State the reading; it is author-visible in every emitted
   message.
3. **Which emitter.** `checkInvokeArgTypes` is the registered row's emitter and
   takes `InvokeArgSlot[]` (`paramType` as a `CompatType`) plus a `TypeEnv`,
   which composes with the empty-env discipline directly. `checkInvokeCall`
   would additionally re-run arity that `:732` already ran. Calling
   `checkInvokeArgTypes` and leaving `checkInvokeCall` unreferenced makes the
   orchestrator dead code — decide whether it is removed with its unit test
   (`tests/invoke-diagnostics.test.ts:212–236`, which is the only in-tree
   assertion of arity-before-type at this seam) or kept and called.
4. **GOV-15, addition direction.** a1–a5 load cleanly today and refuse after the
   fix, so the diagnostic-registry carve-out
   (`source-language-stability.md:25`) is engaged and discharged by measurement,
   not assumption: re-run the committed-corpus sweep over every tracked `.theta`
   and `.thetalib`. Bug 0132 is binding on how — the committed-fixture parse
   gate does not walk `.thetalib`. `tests/theta-callable-call-arity.test.ts`'s
   four `invoke` callers all pass `string` arguments to `string` params, so they
   are expected to stay green; confirm rather than assume.

**Constraints, each with a witness row above:**

- **d1 stays as measured.** An unresolvable callee registers with a
  `theta/load/callee-has-errors` warning and no parse error
  (`invocation.md:22`). The emitter's `:209–211` guard already implements it;
  pass `staticallyResolvable: true` only on the arm that reached a resolved
  `arity`, as `invoke-static-checks.ts:734` already does for arity.
- **c3 keeps reporting arity alone.** `invocation.md:48`. The gate is the
  `arityDiags.length > 0` test, not an ordering convention.
- **a6 stays silent.** A well-typed argument draws nothing.
- **An argument past the parser's static view defers.** `type-system.md:48`.
  This is what `collectProvableArgTypes` returning `undefined` encodes on the
  sibling arm at `invoke-static-checks.ts:838–843`.
- **`<callee>` is not this row's placeholder.** The invoke *Message* names no
  callee — unlike the arity rows, which render the verbatim path literal on this
  surface (c1, c2) and the presented callable name on the other. No
  placeholder-rendering adjudication arises.

**Witness — offline, provider-free.** A new test file at the
`discoverAndComposeFixtures` boundary, on
`tests/theta-callable-call-arity.test.ts`'s harness shape: planted `.pi/theta/`
workspace, distinct callee stem per caller, assertions on the two production
observables (registered slash names, `ctx.ui.notify` messages), every expected
message sourced from the registry through `registryMessage`
(`tools/code-registry/index.js`) per DIAG-4 — never copied prose. Required rows:
all of (a) including the a6 control, both of (b) as the cross-surface pins,
(c1)–(c3) as the arity and ordering pins, and (d1) as the deferral pin, plus one
row per primitive param type in the other direction (a `string` argument at an
`integer` param) and one row whose argument is past the static view, asserting
silence. Each absence cell needs a loud precondition — a sibling cell proving the
same workspace produces the diagnostic — so no absence assertion can pass while
measuring nothing. No live tier applies: every observable settles inside one load
pass.

## Provenance

- **Origin:** the bug 0050 fix (0.77.0, HEAD `3efdb4ac`), which split the
  `invoke` label out of its new emission arm rather than sweeping it in, left
  the reason at `src/parser/type-layer-checks.ts:1992–1996`, and named this
  filing in its fix record's residual list. 0050 §Actual behaviour item 6 and
  §Non-goals had already measured the caller graph by `rg` and declined the row
  by name.
- **Evidence:** one scratch vitest file driving `discoverAndComposeFixtures`
  over a planted temp `.pi/theta/` workspace at `3efdb4ac`; twelve callers, ten
  callees; every cell of groups (a)–(d) measured and quoted verbatim above;
  written, run, deleted. Caller-graph facts re-derived at HEAD with
  `rg -n "\bcheckInvokeCall\b" src/` (one line: the declaration),
  `rg -n "\bcheckInvokeArgTypes\b" src/` (two lines: the declaration and
  `:414`), and one `rg` per export of `invoke-diagnostics.ts` to establish that
  this row is the module's only unreachable one.
- **Implementation, at `3efdb4ac`:**
  `src/parser/invoke-diagnostics.ts:59` (the code constant), `:89–96`
  (`invokeArgTypeMismatchMessage`, `<i>` documented at `:86–87`), `:169–176`
  (`InvokeArgSlot`), `:205–233` (`checkInvokeArgTypes`; the resolvability guard
  `:209–211`, the per-slot deferral `:216–218`, the emission `:219–230`),
  `:331–366` (`checkInvokeArity`), `:398–415` (`checkInvokeCall`; the arity call
  `:402`, the early return `:411`, the type call `:414`), `:441–459`
  (`checkInvokeExtension`, the other callerless export);
  `src/extension/invoke-static-checks.ts:50` (the module's imports from
  `invoke-diagnostics`), `:358–376` (`CalleeArityField` / `CalleeArity`), `:484`
  (`collectProvableArgTypes`), `:649` (`checkInvokeStaticResolution`), `:674`
  (the invoke loop), `:725–741` (the arity block and the gap; the
  `staticallyResolvable: true` at `:734`), `:747–748` (the
  shared pass and `TypeEnv`), `:757` (the `.theta`-callable loop), `:771` (its
  arity call), `:791–796` (its arity-before-type `continue`), `:827` (the empty
  callee-annotation env), `:828–881` (its per-slot type check);
  `src/extension/production-composition.ts:1316–1346` (`resolveCalleeArity`;
  the `fields` map `:1345`), `:1505` (`checkCalleeHasErrors`), `:2045`
  (`hasLoadParseError`); `src/parser/type-layer-checks.ts:1307`
  (`checkInvokeReturnType`, wired), `:1592–1595` and `:1992–1996` (0050's two
  boundary comments); `src/extension/subagent-fn-static-checks.ts:256`;
  `src/lexer/literals.ts:101` (the live inline emitter for
  `invoke-non-theta-extension`); `src/runtime/subagent-params.ts:214–219`
  (`ParamsSchemaValidator`) and `:233–251` (`intakeChildParams`, named in
  §Non-goals, unmeasured).
- **Spec:** `docs/spec_topics/diagnostics/code-registry-parse.md:114` (the row
  and its verbatim *Trigger*); `docs/reference/diagnostics.md:163` (the mirror);
  `docs/spec_topics/invocation.md:20`, `:22`, `:38`, `:48`, `:50–51`;
  `docs/spec_topics/type-system.md:31`, `:48`, `:50` (TYPE-9), `:52` (TYPE-10);
  `docs/spec_topics/tool-calls.md:14`;
  `docs/reference/discovery-cli.md:240–241`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.
- **Plan:** `docs/plan_topics/coverage-matrix.md:138` (row `cka-14`, the six
  un-anchored invoke codes mapped to `V15f`, "un-anchored; GOV-22 residue");
  `docs/plan_topics/V15f-invoke-diagnostics.md:1` and
  `docs/plan_topics/V15f-T-invoke-diagnostics.md:1`, both retired.
- **Tests:** `tests/invoke-diagnostics.test.ts:76–102` (the two unit cells that
  clear the coverage gate for an unreachable row), `:212–236` (the
  arity-before-type cell through `checkInvokeCall`);
  `tests/theta-callable-call-arity.test.ts` (the harness shape §Reproduction
  mirrors; its `invoke` callers exercise arity only);
  `tests/fn-arg-type-mismatch-wired.test.ts:1151` (0050's witness naming this
  row while pinning the `fn` walk out of it);
  `tools/closing-gate/index.js:701–710` (finding kind
  `registry-code-no-asserting-test`, the gate an asserting unit test satisfies);
  `tools/code-registry/index.js` (`parseRegistry` / `registryMessage`, the
  DIAG-4 message source a witness uses).
- **Citation correction against a sibling report (not applied — 0050 is not
  edited by this filing):**
  `docs/bugs/0050-…md:312–314` cites the direct `checkInvokeArity` call as
  `src/extension/invoke-static-checks.ts:298`. At `3efdb4ac` the invoke arm's
  call is `:732` and the `.theta`-callable arm's is `:771`; `:298` is inside
  `resolveThetaCallableCallSites` (`:285–301`) and carries no such call.
  Position drift of bug 0134's class; every other fact in that item verified
  correct.

## Fix (0.78.0)

- What shipped — the family's disposition, the caller wired, no registry edit:
  - `src/extension/invoke-static-checks.ts` (+174/−16) — the invoke-literal
    loop's arity block calls `checkInvokeCall` in place of its direct
    `checkInvokeArity` call, so arity still runs exactly once per site and
    `checkInvokeCall`'s own `arityDiags.length > 0` early return IS
    invocation.md §"Argument arity"'s ordering rather than a convention
    restated at the new sink. Two module helpers build its input:
    `buildInvokeArgSlot` (per param slot — expected side from the callee's
    verbatim `params:` type source through `annotationToCompatType`, actual
    side from `collectProvableArgTypes`, both judged under this arm's own
    EMPTY null-prototype callee-annotation `TypeEnv`, emission gated on EVERY
    member of the collected set answering `"incompatible"`) and
    `dedupeArgType` (one member per distinct `displayType` rendering, a
    `union` over the survivors when more than one remains, so `<actual>`
    carries the same `" | "`-joined spelling `renderCollectedTypes` produces
    on the sibling arm). `collectTypeEnv` / `StaticTypeInferencePass` moved
    above the invoke loop — a pure move keeping them once per theta for all
    three checks (bug 0072's constraint); the `.theta`-callable and Pi-tool
    loops are otherwise byte-unchanged.
  - `src/parser/invoke-diagnostics.ts` (+24/−11) — `InvokeArgSlot`'s
    `paramType` / `argType` widened to admit `undefined`, meaning the caller
    withheld a verdict for that slot, and `checkInvokeArgTypes` skips such a
    slot before `checkCompatible` runs. Additive: both existing unit cells
    pass concrete types and are unmodified. One subsumed doc-comment paragraph
    removed.
  - `src/extension/production-composition.ts` (+8/−6) — `resolveCalleeArity`'s
    existing `fields.map` also carries `name`, from `BypassParamsField`'s
    `wireName`. No second callee read.
  - `tests/invoke-arg-type-mismatch-wired.test.ts` — new, 1087 lines, 40 cells
    at the `discoverAndComposeFixtures` boundary over one planted `.pi/theta/`
    workspace; every expected message read from the registry through
    `registryMessage` (DIAG-4); every absence cell gated on
    `assertRowSurfaceLive`, a live positive control on two channels, so none
    can pass while measuring nothing.
  - `tests/live/live-production-acceptance.test.ts` (+227/−0) — one additive
    H8a cell modelled on the bug 0050 cell above it: the §Reproduction a1
    caller denies registration end-to-end through the real composition root
    while its compatible-argument sibling and the shared callee both register.
  - Byte-unchanged, verified: `tests/fixtures/h7a/permitted-codes.json` (the
    real H9a run decided it — the row is not reachable from the acceptance
    fixtures, whose one tracked `invoke` site passes zero arguments against a
    param-less callee), the registry row and its `docs/reference/diagnostics.md`
    mirror (the wiring lands at the *Trigger*'s full letter, so DIAG-2 is not
    engaged and the DIAG-4 *Message* is unchanged),
    `src/parser/type-layer-checks.ts` (the type layer never opens a callee
    file; §Fix rejects that position and its boundary comments still hold).
  - The four sub-questions, settled: **(1) param name** — `CalleeArityField`
    widened with `name`, the doc-named smallest route; the `.theta`-callable
    arm does not read it because its *Message* carries no `<param>`, and that
    is stated at the field. **(2) `<i>`'s base** — the reported index counts
    PARAM slots, not raw call arguments: slot `i` binds `invoke.args[i + 1]`,
    the path literal occupying `args[0]`. Pinned by witness cell a7 (`invoke
    argument 1 ('y')`). **(3) which emitter** — `checkInvokeCall`, REPLACING
    the direct `checkInvokeArity` call rather than being added beside it, which
    dissolves §Fix's stated objection (no arity is re-run), wires both
    callerless exports at once, and leaves `tests/invoke-diagnostics.test.ts`'s
    arity-before-type cell live and meaningful. The doc's pre-authorised
    removal of that cell was therefore NOT taken and no existing test changed.
    **(4) GOV-15** — re-measured, not cited: 34 tracked `.theta` / `.thetalib`
    files carry exactly one `invoke` site
    (`tests/live/acceptance/fixtures/acc-imports-invoke.theta`, zero arguments
    against a param-less callee), so the addition direction's blast radius is
    nil; `tests/theta-callable-call-arity.test.ts`'s four invoke callers pass
    `string` arguments to `string` params and stay green, as does the
    committed-fixture parse gate.
  - Withheld-slot encoding, and the route rejected: a fabricated sentinel
    `CompatType` for a withheld slot was rejected as UNSOUND — `decide`
    (`type-compat.ts`) tests `sup.kind === "array"` and `sup.kind === "object"`
    before its `sub.kind === "named"` branch, so a sentinel unresolvable
    `named` argument type at an `array<…>` or inline-object param answers
    `"incompatible"` and produces a false `E`. The widened `undefined`
    encoding makes the withheld case first-class instead.
- Gates: witness 40/40; `npm test` 271 files / 4129 tests (baseline at the
  pre-fix HEAD was 270 / 4089); `npx tsc -p tsconfig.json --noEmit` clean;
  `npm run lint` clean; H8a live 21/21 including the new cell; H9a acceptance
  11/11, no stochastic red in the shipping run; committed-corpus sweep clean.
- Review: 2 rounds. r1 (deep): one `prose` finding — a subsumed duplicate
  paragraph in `checkInvokeArgTypes`'s doc-comment; `correctness`, `fidelity`,
  `spec`, `house-rule` and `test` each returned CLEAN with the reasoning
  quoted, including a walk of `decide`'s branch order against every
  `collectProvableArgTypes` arm and an adversarial input list. r2:
  comment-only polish applying that one finding; the round's diff touched no
  executable line, so polish was verified by gate-diff and the confirmation
  round skipped.
- Verification: SOLID. The witness genuinely witnesses — the invoke arm's call
  reverted to the pre-fix `checkInvokeArity` shape reds 28 of 40 cells with the
  row absent and the mistyped caller registering, restored byte-exact by blob
  hash (`5caf3f3852439933acb06bde6d0b8acc8bfaaaa3` before and after, compared
  against the pre-neutralisation snapshot rather than the pre-fix `HEAD` blob),
  green 40/40 after. Full default suite green. The additive H8a cell proven
  both directions live: RED with the wiring neutralised (the mistyped caller
  registers), GREEN restored. Lint and typecheck clean. `git stash` was not
  used at any point.
- Residuals:
  1. **§Expected behaviour's a3/a4 sentence is wrong and was not applied.** The
     doc says "a1–a5 should report", but §Fix's binding soundness constraint
     routes emission through `collectProvableArgTypes`, whose `array` and
     `ident` arms both return `undefined`. a3 (`invoke("./cc.theta", ["a"])`)
     and a4 (a typed-`let` read) therefore DEFER and stay silent; the witness
     pins them as silence cells with the reason named. Confirmed empirically on
     the already-wired sibling arm before being encoded. §Fix governs; the two
     sentences cannot both hold.
  2. **Withheld true positives on the invoke arm** — an array literal, an
     `ident`, and the `index` / `par-for` shapes are provably mistyped at a
     primitive param yet defer, because `collectProvableArgTypes` bails on them
     for the sibling arm's own reasons. Flip condition: any widening of that
     function's arms lands emissions here automatically, since this arm reads
     it unchanged.
  3. **A site with two mistyped slots draws two diagnostics** on the invoke
     surface and one on the `.theta`-callable surface, because
     `checkInvokeArgTypes` has no first-mismatch `break` while the sibling arm
     stops at its first (it reuses `checkToolCallArguments` per call). The row
     is `E` either way, so registration is denied identically; the divergence
     is noted at the call site.
  4. **`buildInvokeArgSlot`'s `argExpr === undefined` arm is unwitnessed** —
     the caller derives its loop bound from the same `invoke.args`, so it
     cannot fire; kept as a withhold rather than an unchecked index read.
- Discharge notes appended: 0138, 0144.
- Pinned dispositions / non-goals: retiring the row stays rejected (the
  operator's 0050 decision). Inferring a param type from the callee body stays
  out. `src/parser/type-layer-checks.ts`'s `walkExpr` invoke arm stays the
  wrong position and is untouched. `checkInvokeExtension`'s dead body stays out
  (§Non-goals, bounded not filed). The runtime cross-mode disposition
  (`intakeChildParams`) stays unmeasured and out. Arity at any position stays
  out (wired here; bug 0131 owns the in-document `fn` call). d1 unchanged: an
  unresolvable callee still registers with a `theta/load/callee-has-errors`
  warning and no parse error, `staticallyResolvable: true` being passed only
  where a resolved `arity` was reached. c3 unchanged: a double-defect site
  reports arity alone. Induced position-only citation drift in files this fix
  shifted is bug 0134's adjudicated do-not-fix class and was not chased.
