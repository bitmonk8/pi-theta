# Bug 0144 — `decide` answers `named ⊑ array<…>` structurally at `type-compat.ts:212–217`, before the `resolveNamed` arms at `:249–269` ever run, so an argument whose declared type the `TypeEnv` cannot resolve is judged **incompatible** rather than deferred at the `fn`-argument sink bug 0050 wired: `fn g(xs: array<integer>)` + `let v: Zz = [1]` + `g(v)` draws an `E`-severity `theta/parse/fn-arg-type-mismatch … expected array<integer>, got Zz` and does not register, while the executor hands `g` the fitting `[1]`; the same refusal reaches a well-formed multi-file program through an imported `.thetalib` type name, and no corpus sentence pins the disposition — `type-system.md:31`'s closed-list preamble reads for the emission, `:48` and TYPE-9's "both operands statically resolvable" parenthetical read against it

- **Status:** fixed (0.185.0). §Fix was not settled at filing: this report existed
  to pin the disposition before any code lands. The disposition is now
  adjudicated and written into the corpus — see §Fix (0.185.0) at the foot of this
  document. The behavioural half had already landed at 0.104.0 (bug 0179); this
  fix ships the corpus sentence and the witness. No ordering dependency blocks it. Two
  coordination constraints are binding and are stated in §Fix (e): bug 0050's
  84-cell witness (`tests/fn-arg-type-mismatch-wired.test.ts`, green at HEAD)
  pins the sink's neighbouring dispositions, and
  [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md) is
  **open** with the same refuse-vs-defer question at a different sink, so the
  two adjudications must agree or state why they differ.
- **Sev/Diff estimate:** S2/D3 — an `E`-severity refusal denies registration to
  a program whose runtime value fits the parameter (measured: `g` receives
  `[1]`), and the refusal fires at the offending span with a template-exact
  message, so nothing is silently accepted and no value is wrong; the reachable
  input class needs an annotation the `TypeEnv` cannot resolve, which includes
  a `.thetalib`-imported type name in an otherwise well-formed multi-file
  program. D3 because §Fix needs an in-run adjudication between two corpus
  sentences, any route lands on `decide`'s arm order — the single relation every
  `⊑` sink shares (`type-system.md:27`) — and it moves rows in bug 0050's
  witness under the same question 0127 has open.
- **Kind:** spec gap, disposition open. The implementation is uniform and
  measured; what the corpus lacks is the sentence deciding which verdict an
  unresolvable operand against a structural target is owed. Three elements:
  1. **The engine decides without evidence.** `decide`'s array arm
     (`src/parser/type-compat.ts:212–217`) returns `"incompatible"` for any
     `sub` that is not an `array`, including a `named` the `TypeEnv` does not
     resolve, and it runs before the two `resolveNamed`-guarded arms
     (`:253–256`, `:267–269`) that answer `"unknown"` for exactly that operand.
     The verdict is therefore a function of the operand's *shape*, not of any
     fact about the value.
  2. **Two corpus sentences read opposite ways, and neither is scoped to this
     sink.** `docs/spec_topics/type-system.md:31` — "The list is closed for
     V1 — anything outside it that the parser cannot decide statically is
     reported as a type mismatch … unless the position is one where a runtime
     AJV check is documented as the safety net" — reads **for** the emission,
     and the row's own registry entry states no net applies
     (`docs/spec_topics/diagnostics/code-registry-parse.md:116`: "Always
     parse-time … so no runtime AJV safety net applies"). Against it:
     `type-system.md:48` (*Unresolvable operands*) skips the check when "either
     side of a compatibility check is past the parser's static view", and
     TYPE-9 (`:50`), the rule that registers this row by name, qualifies it
     "(`T₁ ⋢ T₂`, **both operands statically resolvable**)". The adjudication
     is this report's deliverable.
  3. **The registry is not uniform across the two wired TYPE-9 sinks.** The
     `let`-site row carries the qualifier in its own *Trigger* — "where the RHS
     type is statically resolvable" (`code-registry-parse.md:54`) — so the
     sibling's emission on the same operand (§Reproduction (d)) is outside its
     registered *Trigger*. The `fn`-site row (`:116`) carries no such qualifier.
     Whichever colour is chosen, one of the two rows is edited or one of the two
     implementations moves.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the origin. Its round-8 review recorded this as residual
    R3 and its §Fix record lists it among the residuals to file ("the
    annotated-unresolvable structural refusal tension"). **This is not a defect
    in that fix.** The 0050 commit (`3efdb4ac`) does not touch
    `src/parser/type-compat.ts` — `decide`'s arm order dates to the engine's
    introduction (`b4b8f42b`, where the array arm is `:181` and the
    `resolveNamed` arms `:222`/`:236`) and was already in that order at bug
    0031's fix (`8ae94691`). What 0050 did was route a new sink into a
    byte-frozen engine, which made a pre-existing disposition observable at a
    position it had never been observable at. Its own §Fix records the posture
    this report tests: "`checkFnArgCompat` unchanged — its `"unknown"` deferral
    is the spec's."
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md) —
    **open**, and the closest report: the same refuse-vs-defer question, a
    different sink, a different mechanism. There `checkArrayJoin`
    (`src/runtime/stdlib-array.ts:100–123`) takes no `TypeEnv` at all and so
    *cannot* distinguish an unresolvable element from a resolvable non-`string`
    one; the refusal is an incapacity. Here `decide` **is** handed the `env`
    (`type-compat.ts:180`) and holds two arms that would answer `"unknown"`; the
    refusal is an arm-order consequence, and the same engine call defers when
    the target is a primitive, a union of primitives, or a `named`
    (§Reproduction (b)). The two also differ in what the registry says: 0127's
    element arm sits inside its *Trigger* read literally
    (`code-registry-parse.md:43` names no resolvability), while this row's
    governing rule (TYPE-9) carries the resolvability parenthetical in the same
    sentence that registers it. Both reports ask for one adjudication about
    unresolvable operands; a decision here that does not also settle 0127 leaves
    the corpus with two answers.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, the input class that reaches this sink. A `NamedType` at a
    *reference* position draws no diagnostic when it resolves to nothing:
    `theta/parse/unresolved-named-type`'s registered *Trigger*
    (`code-registry-parse.md:90`) enumerates five positions and a `let`
    annotation is not among them. Measured, `let v: Zz = [1]` alone is `[]`
    (§Reproduction (e) row e6) and `let v: zz = [1]` draws no case diagnostic
    either (e2). 0051 owns whether such an annotation should be refused at the
    annotation; this report owns what happens downstream when it is not. The two
    fixes do not overlap and neither closes the other: refusing the annotation
    removes some spellings from the class, and leaves the imported-name spelling
    (e4) — which 0051 does not touch — reaching this sink unchanged.
  - [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — **open**,
    the same operand class at the opposite verdict. An inline object type in an
    annotation converts to an unresolvable pseudo-`named`
    (`annotationToCompatType`'s final arm,
    `src/parser/type-layer-checks.ts:831`), and 0130's subject is that the
    `let`-RHS check therefore **declines to fire** against it. Measured here,
    the same value refuses against a structural target and defers against a
    `named` one (§Reproduction (b) rows b7–b9), so the two reports are the two
    halves of one operand's behaviour. 0130 §Affected already records the
    mechanism at a third sink — `invoke-static-checks.ts:807–881`, whose
    comment states that "a structurally-decidable slot such as `array<Named>`
    still rejects a non-array argument". Its citation of the `let` arm's record
    as `type-layer-checks.ts:640–643` is pre-0050 and is `:1021–1024` at HEAD
    (bug [0134](./0134-params-shift-induced-stale-citations.md)'s class); this
    report does not edit it.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) —
    **fixed**, and the reason the operand exists. The `let` arm records the
    *declared* type rather than the initialiser's inferred one
    (`type-layer-checks.ts:1021–1024`), so an unresolvable annotation is what a
    later identifier read returns. Without that record the argument would read
    `array<integer>` from `[1]` and no row here would fire.
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) — **open**, the
    imported-symbol half of the *callee* route: `checkFnCallArgs` returns on
    `importedSymbols.has(e.callee)` (`type-layer-checks.ts:1582`). Disjoint from
    this report, which reaches the sink through an imported *type name* at an
    annotation with a same-file callee (§Reproduction (e) row e4). A fix to 0138
    widens the callee set and therefore widens this report's reach; neither fix
    closes the other.
  - [0137](./0137-invoke-arg-type-mismatch-unreachable.md) — **open**. The
    `invoke` argument row is unreachable at HEAD, so the third TYPE-9-adjacent
    argument sink cannot exhibit this disposition yet. Measured: the `invoke`
    spelling of the reported source is `[]` (§Reproduction (b) row b12). Wiring
    it lands this question at a fourth position, which is why §Fix (e) names the
    ordering.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**,
    cited only for the baseline: `decide`'s arm order is unchanged since before
    that fix.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The defect site** — `src/parser/type-compat.ts:210–217`, `decide`'s TYPE-7
    arm:

    ```ts
      // TYPE-7 — element-wise covariance on arrays: `array<T₁> ⊑ array<T₂>` iff
      // `T₁ ⊑ T₂`.
      if (sup.kind === "array") {
        if (sub.kind !== "array") {
          return "incompatible";
        }
        return decide(unfoldAlias(sub.element, env), unfoldAlias(sup.element, env), env);
      }
    ```

    `:213–215` is the verdict this report is about. `env` is a parameter of
    `decide` (`:180`) and is in scope; the arm does not consult it.
  - **The arms that would defer, and that this one precedes** —
    `type-compat.ts:253–264` (TYPE-10, `named` target: `:254–256` answers
    `"unknown"` when `resolveNamed` returns `undefined`, `:258–260` the same for
    the source side) and `:267–269` (a `named` source against a non-`named`,
    non-`union` target: `"unknown"` when unresolvable). Both run only after
    `:212` and `:222` have declined.
  - **The TYPE-8 arm is code-shaped but not reachable from theta source** —
    `type-compat.ts:222–225` gives a non-`object` source `"incompatible"`
    against an `object` target, on the same pattern. No site in `src/`
    constructs a `CompatType` with `kind: "object"`: `annotationToCompatType`
    maps an inline object type to a `named` carrying the raw text
    (`type-layer-checks.ts:831`), and `#typeExpr` mints no `object` either
    (`rg -n 'kind: "object"'` over every file importing `CompatType` returns the
    type declaration at `type-compat.ts:62` and one unrelated `Expr` narrowing
    at `type-layer-checks.ts:1485`). Measured: an inline-object annotation
    against a byte-identical inline-object parameter **defers**
    (§Reproduction (b) row b9). Statements pairing TYPE-7 and TYPE-8 as the
    structural pair — including the in-tree comment at
    `type-layer-checks.ts:957–962` and bug 0050's witness header at
    `tests/fn-arg-type-mismatch-wired.test.ts:2342–2348` — are correct about the
    code and describe one reachable arm, not two.
  - **Three in-tree doc comments state the deferral the arm does not deliver.**
    `type-compat.ts:177–178` — `decide`'s own header: "Returns `\"unknown\"`
    when an operand is an unresolvable `named` reference past the parser's
    static view." `:151–153` — `unfoldAlias`'s header: an unresolvable `named`
    "stays `named` so the relation reports `\"unknown\"` and the runtime AJV
    safety net applies." `:447` — `checkFnArgCompat`'s header: the report fires
    "when the argument's static type is not `⊑` the matched parameter's declared
    type (both statically resolvable)". `checkLetRhsCompat` carries the fourth
    (`:397`) and names the spec paragraph at its deferral arm (`:413–414`).
  - **The emitter** — `type-compat.ts:452–480` (`checkFnArgCompat`). `:462`
    calls `checkCompatible`; `:463–465` is the deferral arm, unreachable for
    this operand class; `:469–479` is the emission, `:475–477` the DIAG-4
    message. `checkCompatible` (`:139–145`) unfolds both operands
    (`unfoldAlias`, `:155–172`) and delegates to `decide`.
  - **The caller bug 0050 wired** — `type-layer-checks.ts:1575–1627`
    (`checkFnCallArgs`). `:1576` / `:1582` / `:1591` are the three callee arms
    that return; `:1601` converts the parameter annotation; `:1608` takes the
    argument's *proven* type; `:1615–1625` calls the emitter.
  - **The proof channel that decides which arguments reach the sink** —
    `type-layer-checks.ts:1654` (`provableArgType`) and `:1886–1901`
    (`isProvenReduction`). The `ident` arm (`:1769–1803`) returns the recorded
    binding type; `:1895–1899` requires each contributing arm to be
    `"compatible"` with the reduction, which an unresolvable `named` never is
    (`decide` answers `"unknown"` for it against itself). That is why a bare
    identifier read reaches the sink and every composite built from one — an
    array literal, a ternary, a `match` — withholds (§Reproduction (c)).
  - **Where the operand is recorded** — `type-layer-checks.ts:1021–1024`, the
    `let` arm's `bindings.set(stmt.name, annotation === undefined ? rhsType :
    unfoldAlias(annotation, this.env))` (bug 0083's record), and `:1216–1220`,
    `walkFn`'s parameter scope, which records
    `annotationToCompatType(p.type) ?? { kind: "named", name: p.type }`. Both
    reach the sink (§Reproduction (e) rows e1 and e5).
  - **The in-tree comment that already names the mechanism** —
    `type-layer-checks.ts:957–965`, in the `let` arm: "an annotation of
    `array<T>` or of an inline object type is decided STRUCTURALLY by `decide`
    (TYPE-7 / TYPE-8, before its `resolveNamed` arms), so the deferral an
    unresolvable name earns against a primitive annotation is unavailable
    against a structural one". The next sentence records the principle this
    report tests: "The declared type is still RECORDED below — an annotation is
    the author's own claim about the position, and the runtime AJV net is what
    judges the value that arrives."
  - **A fourth sink with the same arm and a stated intent** —
    `src/extension/invoke-static-checks.ts:807–827`. The expected side is
    deliberately evaluated under an empty `TypeEnv` (`:827`) so that "a `named`
    expected type is unresolvable, so `checkCompatible` answers `\"unknown\"`
    and the site defers", while "a structurally-decidable slot such as
    `array<Named>` still rejects a non-array argument without this pass needing
    to know what `Named` denotes" (`:815–822`). That sentence licenses a
    structural refusal when the **argument** is a concrete non-array. It does
    not reach the case here, where the argument is itself unresolvable.
  - **The registration consequence** —
    `src/extension/production-composition.ts:2045–2052` (`hasLoadParseError`):
    any error-severity `theta/load/*` or `theta/parse/*` denies registration.
    `theta/parse/fn-arg-type-mismatch` is `E` (`code-registry-parse.md:116`), so
    every refusing row below is a theta that does not load.
  - **The runtime the refusal is about** —
    `src/runtime/statement-executor.ts`'s `let` arm evaluates the initialiser
    and defines the binding; nothing reads `stmt.annotation` and nothing
    validates against it, so the value that reaches `g` is the initialiser's.
    Measured directly (§Reproduction (f)).
  - `docs/spec_topics/type-system.md:27` — the check-site enumeration naming "a
    function-argument slot"; `:29` — *Operational definition*, "the parser is
    required to recognise the structural cases enumerated below without falling
    back to it"; `:31` — the closed-list preamble, quoted in §Expected
    behaviour; `:48` — *Unresolvable operands*; `:50` — TYPE-9, which registers
    both wired rows and carries the "both operands statically resolvable"
    parenthetical; `:52` — TYPE-10; `:54` — TYPE-11.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:116` — the
    `fn-arg-type-mismatch` row: a *Trigger* with no resolvability qualifier and
    the sentence "Always parse-time: top-level `fn` declarations are hoisted and
    always statically resolvable, so no runtime AJV safety net applies". `:54` —
    the `let-rhs-type-mismatch` row, whose *Trigger* **does** carry the
    qualifier ("where the RHS type is statically resolvable"). `:64` —
    `non-array-iterand`; `:90` — `unresolved-named-type`, whose *Trigger*
    enumerates the five positions it fires at (a `let` annotation is not one)
    and states the imported-symbol deferral. All four are `E`. Mirrors without a
    *Trigger* column: `docs/reference/diagnostics.md:165`, `:100`, `:110`, `:139`.
  - `docs/spec_topics/expressions.md:214` — the corpus's one explicit
    disposition for a name the importing file's parse cannot resolve: "A name
    imported from a `.thetalib` always resolves at this position — the
    importer's parse holds neither the imported symbol's field bodies nor its
    kind — so the field-set checks above do not run and the construction is not
    checked here." Stated for the constructor position, not for an annotation.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, the closed
    registry and the same-commit *Trigger* rule; `:74` — DIAG-4, the normative
    *Message* column.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9`
    — the loads-cleanly predicate; `:25` — the diagnostic-registry carve-out.
  - **Existing coverage: the disposition is unpinned.** Bug 0050's witness
    `tests/fn-arg-type-mismatch-wired.test.ts` is 84 cells, green at HEAD. Its
    `d1` / `d2` cells (`:1112`, `:1126`, fixtures `:681–682`) pin the
    **parameter**-side deferral — `fn g(n: Nope)` called `g("s")` emits nothing
    — and d2's comment states the reason: "an unresolved named type is not a
    proof of incompatibility; type-system.md:48 skips the check rather than
    guessing". No cell drives the argument side against a structural parameter,
    and `rg` finds no test anywhere asserting the string `got Zz` or any
    equivalent. The one in-tree note is the witness header at `:2337–2348`,
    which records the mechanism as a hazard for the withheld-binder channel, not
    as a pinned author-facing disposition.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Parse rows through the production `parseThetaDocument` over
  the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`), frontmatter
  `---\nmode: prompt\n---`, a trailing final value. Runtime rows through
  `parseThetaDocument` → `createProductionProducerDeps` → `bindPromptConversation`
  → `executeBody`, the harness shape `tests/non-object-receiver-gate.test.ts:221–292`
  establishes. Scratch vitest files under `tests/`, run on the outputs quoted
  below, then deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other
  bug document are unmodified by this filing.

## Summary

`checkFnArgCompat` asks `checkCompatible(argType, paramType, env)` and defers on
`"unknown"` (`type-compat.ts:462–465`). For an argument whose declared type the
`TypeEnv` cannot resolve, that deferral is unreachable whenever the parameter is
`array<…>`: `decide`'s array arm (`:212–217`) tests only `sub.kind !== "array"`
and returns `"incompatible"`, and it runs before the two arms that consult
`resolveNamed` (`:253–256`, `:267–269`).

Measured, `fn g(xs: array<integer>): number { 1 }` + `let v: Zz = [1]` +
`let r = g(v)` — with nothing named `Zz` declared anywhere — reports
`theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('xs') type mismatch:
expected array<integer>, got Zz`. The code is `E`, so `hasLoadParseError`
(`production-composition.ts:2045–2052`) denies registration and the theta does
not load. Executed through the production executor, the same body succeeds and
`g` receives `[1]` — a value that satisfies `array<integer>`. Removing the
annotation leaves an identical program that loads clean.

**The verdict is a function of the target's shape, not of any fact about the
value.** The identical argument defers against a primitive parameter, against a
union of primitives, against a named schema, against an inline-object parameter,
and against an unresolvable parameter — every target whose arm consults the
environment. It refuses against `array<…>`, against an alias of `array<…>`, and
against a union of `array<…>` only when no other arm answers `"unknown"` first.
Nothing about `Zz` differs across those rows.

**The disposition is HEAD-uniform, and it predates the sink.** The `let`-RHS
sibling gives the identical verdict on identical operands: `let v: Zz = [1]` +
`let s: array<integer> = v` reports `let-rhs-type-mismatch … got Zz`, and the
`for` iterand gate reports `non-array-iterand … got Zz` on the same binding. The
0050 commit (`3efdb4ac`) does not touch `type-compat.ts`; the arm order dates to
the engine's introduction (`b4b8f42b`).

**The reachable input class is wider than an undeclared name.** The argument must
be a bare identifier — every composite built from an unresolvable read withholds
at `isProvenReduction` (`type-layer-checks.ts:1895–1899`) — bound by an
annotation `annotationToCompatType` maps to an unresolvable `named`. Four
spellings reach it, measured: a name nothing declares, a lowercase name (bug
0051's class, no diagnostic at either position), an `enum` name (enums never
enter the `TypeEnv`), and **a type name imported from a `.thetalib`**. The last
is a well-formed multi-file program: `import { E } from "./p.thetalib"` +
`let v: E = [1]` + `g(v)` is refused at `E` severity, where the same file with a
local `schema E = array<integer>` is clean. `expressions.md:214` states the
corpus's one explicit disposition for exactly that class of name — the check
does not run.

**No cell pins either colour.** Bug 0050's 84-cell witness pins the
*parameter*-side deferral and cites `type-system.md:48` as its reason; the
argument side against a structural parameter is untested. Every tracked `.theta`
and `.thetalib` in the corpus parses with zero diagnostics at HEAD (34 files), so
the corpus half of the GOV-15 sweep is zero.

## Reproduction

Offline, at `3efdb4ac`. `codes` and `msgs` are the whole aggregated diagnostic
list in emission order, unfiltered.

### (a) The reported shape and its controls

```
@@ a1  fn g(xs: array<integer>): number { 1 } / let v: Zz = [1] / let r = g(v) / r
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('xs') type mismatch: expected array<integer>, got Zz"]
@@ a2  [control] the same body, annotation removed
   codes :: []
@@ a3  [control] the same body, `schema Zz = array<integer>` declared
   codes :: []
@@ a4  [control] direct literal argument:  let r = g([1])
   codes :: []
@@ a5  [control] direct mistyped literal:  let r = g("a")
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('xs') type mismatch: expected array<integer>, got string"]
@@ a6  arity 2, second slot:  fn g(a: integer, xs: array<integer>) / g(1, v)
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 1 ('xs') type mismatch: expected array<integer>, got Zz"]
```

a2 and a3 are the pair that isolates the cause: the three sources differ only in
whether the binding carries an annotation and whether that annotation resolves.
a4 and a5 establish the row is live and correct for a resolvable argument.

### (b) The target's shape decides — nine parameter types, one argument

Each row passes the same annotated-unresolvable binding. Only the parameter type
changes.

```
@@ b1  array<integer>            let v: Zz = [1]      → fn-arg-type-mismatch, "expected array<integer>, got Zz"
@@ b2  alias of array<integer>   schema L = array<integer> / fn g(xs: L)
                                                      → fn-arg-type-mismatch, "expected L, got Zz"
@@ b3  integer                   let v: Zz = 1        → []
@@ b4  string | integer          let v: Zz = 1        → []
@@ b5  string | array<integer>   let v: Zz = [1]      → []
@@ b6  P (object schema)         let v: Zz = [1]      → []
@@ b7  Qq (unresolvable)         let v: Zz = [1]      → []
@@ b8  { a: integer } (inline)   let v: Zz = 1        → []   [plus theta/parse/bare-object-literal on the initialiser]
@@ b9  { ok: boolean, label: string }, argument annotated with the SAME inline type
                                                      → []
@@ b10 array<Zz>, concrete fitting argument  fn g(xs: array<Zz>) / g([1])
                                                      → []
@@ b11 array<string>, annotation is an inline object type
       let v: { ok: boolean, label: string } = @`x`?  → fn-arg-type-mismatch,
                                  "expected array<string>, got {ok:boolean,label:string}"
@@ b12 invoke spelling:  let r = invoke<integer>("./c.theta", v)
                                                      → []   [bug 0137: the row is unreachable]
```

b2 renders the alias's name and decides on its unfolded right-hand side —
`checkCompatible` unfolds both operands before `decide` sees them, so the render
and the verdict read different forms. b5 defers because TYPE-5 loops the target's
arms and `string` answers `"unknown"`, which outranks the array arm's
`"incompatible"` (`type-compat.ts:196–208`). b7 and b10 are the asymmetry stated
plainly: the same unresolvable name defers when it is the **target** and refuses
when it is the **source**, at the same sink, in the same call. b9 is sharper
still — the engine cannot prove an inline-object annotation compatible with a
byte-identical copy of itself, yet refuses it against an array. b11 uses the
annotation form the committed corpus carries
(`tests/live/acceptance/fixtures/acc-typed-inline.theta:14`); its verdict is
correct on the value, and it is reached without resolving anything.

### (c) Which argument expressions reach the sink

```
@@ c1  bare identifier:              g(v)             → fn-arg-type-mismatch
@@ c2  array literal:                g([v])           → []      [param array<array<integer>>]
@@ c3  let-bound array literal:      let w = [v] / g(w)  → []
@@ c4  ternary:                      g(true ? v : v)  → []
@@ c5  unresolvable call result:     fn h(): Zz { 1 } / let v = h() / g(v)  → []
```

Only c1 emits. `provableArgType` (`type-layer-checks.ts:1654`) proves a composite
through `isProvenReduction` (`:1886–1901`), which requires each contributing arm
to be `"compatible"` with the reduction — and `decide` answers `"unknown"` for an
unresolvable `named` against itself (`:253–256`), so the exactness test never
passes and the whole composite withholds. c5 withholds at the `call` arm, which
refuses a callee-name mint outright. The class is therefore exactly: **a bare
identifier read of a binding whose annotation is unresolvable**.

### (d) The HEAD-uniform siblings, on identical operands

```
@@ d1  let-rhs sibling:  let v: Zz = [1] / let s: array<integer> = v / s
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 's' initialiser type mismatch: expected array<integer>, got Zz"]
@@ d2  [control] prim target:  let s: integer = v      → []
@@ d3  [control] named target: schema P { a: integer } / let s: P = v  → []
@@ d4  iterand:  let v: Zz = [1] / for y in v { y }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got Zz"]
@@ d5  join receiver:  let v: Zz = ["a"] / let s = v.join(",")   → []
@@ d6  array element sink:  let v: Zz = 1 / let xs: array<integer> = [v] / xs  → []
@@ d7  object field sink:  schema P { a: integer } / let v: Zz = 1 / P { a: v }  → []
@@ d8  nested, let-rhs:  let v: Zz = [1] / let w: array<array<integer>> = [v] / w
   codes :: ["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]
   msgs  :: ["let binding 'w' initialiser type mismatch: expected array<array<integer>>, got array<Zz>",
             "array element type mismatch at index 0: expected array<integer>, got Zz"]
```

d1 is the row that makes this HEAD-uniform rather than 0050-introduced: the
`let`-RHS sink was wired before 0050 and gives the same verdict on the same
operands. d1's emission is nonetheless **outside its own registered *Trigger***,
which qualifies itself "where the RHS type is statically resolvable"
(`code-registry-parse.md:54`). d4 is the third route and is the one bug 0050's
witness already records as a hazard (`:2337–2341`). d5–d7 show the sinks that do
defer. d8 shows TYPE-7 recursion carrying the same verdict into a composite at
the `let` sink, where the fn-arg sink withholds (c2) — the two wired sinks
disagree on the composite even though they agree on the bare read.

### (e) The reachable annotation spellings

```
@@ e1  undeclared name:        let v: Zz = [1]                  → fn-arg-type-mismatch, "got Zz"
@@ e2  lowercase name:         let v: zz = [1]                  → fn-arg-type-mismatch, "got zz"
@@ e3  enum name:              enum E { A } / let v: E = [1]    → fn-arg-type-mismatch, "got E"
@@ e4  IMPORTED type name:     import { E } from "./p.thetalib" / let v: E = [1] / g(v)
   codes :: ["theta/parse/fn-arg-type-mismatch"]
   msgs  :: ["fn 'g' argument 0 ('xs') type mismatch: expected array<integer>, got E"]
@@ e5  fn parameter annotation: fn f(v: Zz): number { g(v) }    → fn-arg-type-mismatch, "got Zz"
@@ e6  [control] the annotation alone:  let v: Zz = [1] / v     → []
@@ e7  [control] alias RHS instead:     schema X = Qq / let v: X = [1] / v
   codes :: ["theta/parse/unresolved-named-type"]
   msgs  :: ["unresolved named type 'Qq'"]
@@ e8  [control] local declaration:  schema E = array<integer> / let v: E = [1] / g(v)   → []
@@ e9  imported name, let-rhs sibling:  let s: array<integer> = v                → let-rhs-type-mismatch, "got E"
@@ e10 imported name, iterand:          for y in v { y }                         → non-array-iterand, "got E"
@@ e11 imported name, prim param control:  fn g(n: integer) / let v: E = 1 / g(v) → []
@@ e12 `let mut`:              let mut v: Zz = [1]              → fn-arg-type-mismatch, "got Zz"
```

**e4 against e8 is the row that decides severity.** The two sources differ only
in where `E` is declared. Nothing in the importing file is ill-formed, and the
parser cannot tell what `E` denotes — `code-registry-parse.md:90` says so in
terms ("the importer's parse holds neither its field bodies nor its kind"). If
the library declares `schema E = array<integer>` the program is well-typed and it
is refused; if it declares `schema E = string` it is ill-typed and it is refused.
The refusal carries the same message either way. e6 and e7 are 0051's boundary:
the annotation position draws nothing, the alias right-hand side draws
`unresolved-named-type` — `:90`'s *Trigger* enumerates five positions and a `let`
annotation is not among them.

### (f) The runtime the refusal is about

Same parse, executed through the production executor.

```
@@ f1  the reported source, executed
   parse :: ["theta/parse/fn-arg-type-mismatch"]
   run   :: outcome=success result={"present":true,"value":1}
@@ f2  the value g actually receives:  fn g(xs: array<integer>): array<integer> { xs } / let v: Zz = [1] / g(v)
   parse :: ["theta/parse/fn-arg-type-mismatch"]
   run   :: outcome=success result={"present":true,"value":[1]}
@@ f3  [control] annotation removed
   parse :: []
   run   :: outcome=success result={"present":true,"value":1}
@@ f4  [control] the annotated binding is a real array:  let v: Zz = ["a","b"] / v.join(",")
   parse :: []
   run   :: outcome=success result={"present":true,"value":"a,b"}
```

f2 is the measurement the emission contradicts: the parameter binds `[1]`, which
satisfies `array<integer>`. f3 shows the executor's behaviour does not depend on
the annotation — the runtime `let` arm evaluates the initialiser and defines the
binding without reading `stmt.annotation`. The theta in f1 and f2 does not
register (`hasLoadParseError`), so the executor is reached here through the test
harness and not through the loader; what it measures is the value, not a
reachable production path.

### (g) The committed corpus at HEAD

All 34 tracked `.theta` and `.thetalib` files, each through the real
`parseThetaDocument`:

```
@@ every tracked .theta / .thetalib   codes :: []
@@ TOTAL FILES :: 34
```

Every annotated `let` in the corpus names a schema declared in the same file
(`Progress`, `Verdict`, `Review`, `Sentiment`, `Summary`, `Report`, `Reply`) and
resolves. The one exception is the inline object annotation at
`tests/live/acceptance/fixtures/acc-typed-inline.theta:14`, which is an
unresolvable `named` (b11's operand) and is never passed to a `fn`. **Measured
GOV-15 blast radius against the committed corpus: zero.** That bounds the corpus
half of the sweep only; §Reproduction (a) and (e) are programs that load cleanly
before 0.77.0 and do not load after.

## Expected behaviour

**Two corpus sentences read opposite ways, and this report does not pick between
them.**

**Reading A — the emission is correct.** `type-system.md:31`:

> The following hold without invoking AJV. The list is closed for V1 — anything
> outside it that the parser cannot decide statically is reported as a type
> mismatch (`theta/parse/*-type-mismatch` at the call site, e.g.
> `theta/parse/invoke-return-type-mismatch`, `theta/parse/invoke-arg-type-mismatch`,
> `theta/parse/array-element-type-mismatch`, `theta/parse/match-arm-type-mismatch`),
> unless the position is one where a runtime AJV check is documented as the
> safety net (e.g. an `invoke` against a callee that is not statically
> resolvable).

`named Zz ⊑ array<integer>` is outside the closed list; the parser cannot decide
it statically; and the exception clause requires the position to have a
documented AJV net. The `fn`-argument position states it has none —
`code-registry-parse.md:116`: "Always parse-time: top-level `fn` declarations are
hoisted and always statically resolvable, so no runtime AJV safety net applies."
`:29` reinforces the posture: "the parser is required to recognise the structural
cases enumerated below without falling back to [AJV], so that compatibility
failures surface as parse errors at the offending source span rather than as
runtime validation errors at a downstream call site." On this reading the engine
implements the spec, and what is wrong is that no cell says so.

**Reading B — the emission is owed a deferral.** `type-system.md:48`:

> **Unresolvable operands.** When either side of a compatibility check is past
> the parser's static view (e.g. an inferred binding whose RHS depends on a
> Pi-tool call whose registered schema is not visible at parse time, or an
> `invoke` against a callee that produced `theta/load/callee-has-errors`), the
> parse-time check is skipped and the runtime AJV check is the safety net.

`named Zz` is past the parser's static view by construction — that is what
`resolveNamed` returning `undefined` means. The paragraph is scoped to "either
side of a compatibility check", and a `fn`-argument slot is on the check-site
list at `:27`, so unlike bug 0127's `join` element the paragraph does reach this
position. TYPE-9 (`:50`), the rule that registers this row by name, is narrower
still and qualifies the failure in the same sentence:

> each reports its own parse-time diagnostic on a static failure (`T₁ ⋢ T₂`,
> both operands statically resolvable)

`Zz` is not statically resolvable, so the failure TYPE-9 describes has not
occurred. Three supports beyond the two sentences:

1. **The tree states Reading B four times.** `decide`'s own header —
   "Returns `\"unknown\"` when an operand is an unresolvable `named` reference
   past the parser's static view" (`type-compat.ts:177–178`) — is a description
   of behaviour the function does not have on this input. `unfoldAlias`'s header
   (`:151–153`), `checkFnArgCompat`'s (`:447`) and `checkLetRhsCompat`'s (`:397`)
   each repeat it. Four comments and one implementation disagree.
2. **The corpus's one explicit disposition for an unresolvable imported name
   defers.** `expressions.md:214`: "A name imported from a `.thetalib` always
   resolves at this position — the importer's parse holds neither the imported
   symbol's field bodies nor its kind — so the field-set checks above do not run
   and the construction is not checked here." Row e4 is that class of name, at a
   different position, refused.
3. **Reading A refuses the legal and the illegal member of a pair alike.** e4's
   library may declare `schema E = array<integer>` or `schema E = string`. The
   importer cannot tell; both draw the same `E`-severity refusal. A rule that
   cannot distinguish them is not deciding the question its message names.

**What both readings agree on**, each with a witness row:

- **b3–b7 keep deferring.** Whatever is decided for a structural target, the
  primitive, union, named-schema and unresolvable-target rows are `type-system.md:48`
  working, and no route may coarsen them.
- **a4, a5 and b10 keep their current verdicts.** A resolvable argument is judged
  on its type; a mistyped literal is refused; an unresolvable *parameter* defers
  (bug 0050's d1/d2 cells, which cite `:48` as their reason).
- **The two wired TYPE-9 sinks answer the same question the same way.** d1 and a1
  are the same operands at two sinks. A route that moves one and not the other
  needs to say why the `let` row's *Trigger* qualifier (`:54`) and the `fn` row's
  absence of one (`:116`) are a real distinction rather than an editing accident.
- **DIAG-4 is not engaged by the choice.** The *Message* templates at `:54`,
  `:64` and `:116` are emitted byte-exact today and stay so under either reading;
  what moves is which inputs draw a code, which is DIAG-2's *Trigger* question
  (`diagnostic-shape.md:72`).

**GOV-15 is engaged in the refusing direction and is not discharged by the
corpus sweep.** Every source in §Reproduction (a) and (e) loads cleanly before
0.77.0 — the row had no caller — and does not load at HEAD. The committed corpus
is clean in both releases (group (g)), which bounds the measured blast radius to
zero and does not bound the unmeasured one. A route that keeps the refusal owes
the carve-out reading at `source-language-stability.md:25`; a route that removes
it moves in the permissive direction and owes nothing.

## Actual behaviour / root cause

**One arm order, and it is the whole mechanism.** `decide`
(`type-compat.ts:180`) dispatches in a fixed sequence: union-source (`:182`),
union-target (`:196`), **array-target (`:212`)**, object-target (`:222`),
named-target (`:253`), named-source (`:267`), primitive-target (`:273`),
literal-target (`:285`). The two arms that consult `resolveNamed` are fifth and
sixth. The array arm is third and tests one predicate:

```ts
  if (sup.kind === "array") {
    if (sub.kind !== "array") {
      return "incompatible";
    }
```

A `named` is not an `array`, so it returns before any question about the name is
asked. `checkCompatible` (`:139–145`) has already unfolded both operands, and
`unfoldAlias` (`:155–172`) returns an unresolvable `named` unchanged by design —
its own comment (`:151–153`) says it does so "so the relation reports
`\"unknown\"`". The relation does not, because the arm that would report it never
runs.

**The verdict carries no evidence.** For every other operand shape the array arm
sees, `sub.kind !== "array"` is a fact about the value's type: a `prim`, a
`literal`, an `object`. For a `named` the parser cannot resolve, `sub.kind` is a
fact about the *representation the parser chose when it failed to resolve the
name*. `annotationToCompatType`'s final arm (`type-layer-checks.ts:831`) returns
`{ kind: "named", name: text }` for every annotation that is not a primitive, a
top-level union or an `array<…>` — an undeclared name, a lowercase name, an enum
name, an imported name, an inline object type and a `Result<…>` all land in the
same shape. The array arm reads that shape as "not an array" and refuses.

**The TYPE-8 half of the pair is not reachable.** The object arm (`:222–225`)
would refuse a `named` source against an inline-object target on the same
pattern, but nothing in `src/` constructs a `CompatType` with `kind: "object"` —
an inline object type in an annotation becomes a `named` carrying its raw text.
Row b9 measures the consequence: two byte-identical inline-object annotations
answer `"unknown"` against each other. Descriptions of the mechanism that pair
TYPE-7 and TYPE-8 (`type-layer-checks.ts:957–962`,
`tests/fn-arg-type-mismatch-wired.test.ts:2342–2348`) are accurate about the code
and name one reachable arm.

**The operand reaches the sink because an annotation is treated as a proof.** Bug
0083's fix made the `let` arm record the declared type rather than the
initialiser's inferred one (`type-layer-checks.ts:1021–1024`), with the reason
stated at `:957–965`: "an annotation is the author's own claim about the
position, and the runtime AJV net is what judges the value that arrives." Bug
0050's `provableArgType` treats that record as a proof at the `ident` arm
(`:1769–1803`) — only an *unannotated* `let` is ever marked unprovable
(`:1016–1020`) — so the author's unresolvable claim is what the sink judges.
`walkFn` records parameter annotations the same way (`:1216–1220`), which is row
e5.

**The proof channel bounds the class to a bare identifier.** `isProvenReduction`
(`:1886–1901`) requires `checkCompatible(armType, reduced, env) === "compatible"`
for every contributing arm. An unresolvable `named` against itself takes the
named-target arm and answers `"unknown"` (`:253–256`), so no composite containing
one is ever proven: rows c2, c3 and c4 withhold. The `call` arm withholds
separately (c5). The one expression form that reaches the sink is the identifier
read.

**The two wired sinks disagree on the composite.** The `let` arm gates its own
check on `containsWithheldBinderType(rhsType)` (`:966`), a predicate over the
withheld-binder sentinel only; an ordinary unresolvable `named` is not withheld,
so `[v]` reaches `checkLetRhsCompat` and TYPE-7 recursion refuses its element
(row d8, two codes). The fn-arg sink applies the stricter exactness test instead
and withholds the same expression (c2). Both behaviours follow from their own
stated discipline; they are not reconciled with each other.

**The bound.** `theta/parse/fn-arg-type-mismatch` is `E`
(`code-registry-parse.md:116`), so `hasLoadParseError`
(`production-composition.ts:2045–2052`) denies registration. Nothing measured
here lets a mistyped argument reach a running theta — the exposure is a refused
program, not an admitted one.

## Why it matters

- **A program whose value fits the parameter does not load.** f2 measures `g`
  receiving `[1]` against a declared `array<integer>`. The refusal is at `E`
  severity, so the file is not registered and no slash command exists for it.
- **The reachable class includes a well-formed multi-file program.** e4 is a
  single `import` away from e8, which is clean. The corpus's stated disposition
  for a name the importer cannot resolve (`expressions.md:214`,
  `code-registry-parse.md:90`) is that the check does not run.
- **The message names a type the parser has no information about.** `got Zz`
  reports a static type for a value whose static type the parser could not
  determine. The same string is produced whether `Zz` names an array in a library
  the parser cannot see, names nothing at all, or is a lowercase typo — and rows
  e1, e2, e3 and e4 are indistinguishable in the output.
- **Four in-tree comments describe the opposite behaviour.** `decide`'s header,
  `unfoldAlias`'s, `checkFnArgCompat`'s and `checkLetRhsCompat`'s each state that
  an unresolvable operand yields `"unknown"`. A reader of the engine is told the
  deferral holds; a reader of the arm order finds it does not.
- **The two wired TYPE-9 rows carry different *Trigger* text for the same
  question.** `:54` qualifies itself "where the RHS type is statically
  resolvable" and emits on an unresolvable RHS anyway (d1); `:116` carries no
  qualifier. One of the two is wrong whichever colour is chosen, and DIAG-2
  requires the *Trigger* edit in the same commit as the behaviour.
- **A previously-loading program stopped loading in 0.77.0.** The refusal
  appeared when 0050 wired the caller into a byte-frozen engine. The measured
  corpus blast radius is zero (group (g)); the unmeasured radius is every
  `.theta` outside this repository carrying the shape in §Reproduction (a).
- **The suite cannot red on either colour.** Bug 0050's 84 cells pin the
  parameter-side deferral (d1/d2) and nothing on the argument side against a
  structural parameter. A route that changes this verdict — or a later refactor
  that changes it accidentally — reds nothing.

## Non-goals

- **Whether an unresolvable annotation should be refused at the annotation.**
  That is [0051](./0051-lowercase-named-type-reference-positions-silent.md).
  Rows e6 and e7 measure the current boundary. Refusing the annotation would
  remove e1, e2 and e3 from this report's class and would leave e4 — an imported
  name that resolves by the registry's own rule (`code-registry-parse.md:90`) —
  reaching this sink unchanged.
- **The `join` element gate's disposition.**
  [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
  owns it. Row d5 shows the `join` *receiver* deferring on this report's operand,
  which is 0127's other arm; nothing here changes `checkArrayJoin`.
- **The inline-object annotation's conversion.**
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) owns whether
  `annotationToCompatType` should mint an `object` for `{ … }`. Rows b8, b9 and
  b11 are cited as evidence that the TYPE-8 arm is currently unreachable and that
  the operand class is wider than an undeclared name; the conversion is not this
  report's claim. A fix there makes the TYPE-8 arm reachable and lands this
  report's question at a second arm.
- **The `<withheld>` binder sentinel and its gates.** `containsWithheldBinderType`
  (`type-layer-checks.ts:409`) and the eight sites it gates are bug 0050's
  machinery for binder classes the walk cannot type. This report's operand is an
  ordinary unresolvable `named` and is not withheld; no row above involves the
  sentinel.
- **The composite disagreement between the two sinks** (c2 against d8). Recorded
  as measured. Reconciling `isProvenReduction`'s exactness test with the `let`
  arm's withheld-only gate is a change to bug 0050's soundness discipline, with
  its own justification.
- **Wiring the `invoke` argument row.** [0137](./0137-invoke-arg-type-mismatch-unreachable.md)
  owns it; row b12 is cited only to record that the third argument sink cannot
  exhibit this disposition at HEAD.

## Fix

**Not settled. This report exists to pin the disposition first.** Bug 0050's
§Fix already recorded the constraint a route here must respect —
"`checkFnArgCompat` unchanged — its `\"unknown\"` deferral is the spec's" — which
is true of the emitter and not of the engine behind it. Four questions have to be
answered, and (e) orders the work.

**(a) Which reading of `type-system.md` governs an unresolvable operand against
a structural target?** The two are quoted in §Expected behaviour. The answer is
the deliverable, and it must be written into the corpus in the same commit as any
code, because both sentences currently stand and neither is scoped to exclude the
other. The choice is not confined to this row: `decide` is the single relation
`type-system.md:27` names for every check site, so whichever colour is chosen
holds at the `let` sink (d1), the `invoke` sink once 0137 wires it, the
`.theta`-callable sink (`invoke-static-checks.ts:807–827`) and the array-element
sink (d8).

**(b) The routes, with their consequences.**

1. **Reorder `decide` so the resolvability arms run first.** Move the
   `resolveNamed` test for a `named` source ahead of the array and object arms
   (`type-compat.ts:212`, `:222`), so an unresolvable source answers `"unknown"`
   whatever the target's shape. Closes a1, d1, d4, d8 and every row of group (e)
   at one edit. Consequences to weigh: it changes the verdict at every sink the
   relation serves, including `invoke-static-checks.ts`, whose comment
   (`:815–822`) states the current behaviour as the reason its expected side is
   emptied rather than withheld — that comment expires and its posture must be
   restated. It also removes an `E` from inputs that are ill-typed at runtime
   (a8-shaped rows, where the annotated value does not fit), moving them to the
   runtime AJV net the fn-arg registry row says does not exist for this position
   (`:116`), so `:116`'s *Trigger* sentence is edited in the same commit under
   DIAG-2.
2. **Gate the fn-arg sink only.** Add a resolvability test at the caller
   (`type-layer-checks.ts:1608–1614`, beside the `provableArgType` withhold) or
   at the emitter (`type-compat.ts:462`), leaving `decide` untouched. Narrower,
   and it makes the two wired TYPE-9 sinks disagree — a1 defers while d1 keeps
   emitting on identical operands — which needs a stated reason, since `:54` is
   the row whose own *Trigger* carries the resolvability qualifier and `:116` is
   the row that does not.
3. **Keep the refusal and write it down.** Add the sentence to
   `type-system.md` that scopes `:48` away from a structural target, and edit
   TYPE-9's "both operands statically resolvable" parenthetical, which currently
   reads against the behaviour of the two rows it registers. This is the route
   that leaves e4 refused, so it also owes a disposition for the imported-name
   class against `expressions.md:214` — either a stated exception, or a
   resolvability channel the importer does not have. Under this route the four
   in-tree doc comments (`type-compat.ts:151–153`, `:177–178`, `:397`, `:447`)
   are corrected to match.
4. **Make the operand resolvable instead.** Out of scope here and named for
   completeness: an importer that could read `./p.thetalib`'s declarations would
   remove e4 from the class without answering the question, and would leave e1,
   e2, e3 and e5 unchanged.

**(c) What the registry work is, under each route.** Routes 1 and 2 change which
inputs draw `theta/parse/fn-arg-type-mismatch` (and, under route 1,
`let-rhs-type-mismatch` and `non-array-iterand`), which is a *Trigger* change:
DIAG-2 (`diagnostic-shape.md:72`) requires the edit in the same commit. The
`docs/reference/` mirrors carry the *Message* column and no *Trigger* column
(`docs/reference/diagnostics.md:165`, `:100`, `:110`), so a *Trigger* narrowing
does not reach them. No *Message* template moves under any route, so DIAG-4
(`:74`) is not engaged. Route 1 additionally reconciles `:54` and `:116`, whose
present *Trigger* texts differ on exactly this point.

**(d) Constraints any route preserves**, each with a witness row above:

- **b3–b7 stay silent.** The primitive, union, named-schema and
  unresolvable-target deferrals are `type-system.md:48` working. A route that
  makes an unresolvable operand resolvable — to anything — breaks them.
- **a4, a5 and b10 keep their verdicts**, and bug 0050's d1/d2 cells
  (`tests/fn-arg-type-mismatch-wired.test.ts:1112`, `:1126`) stay green: an
  unresolvable *parameter* defers, and that is the disposition 0050 pinned with
  `:48` named in the cell comment.
- **b2's render stays the parameter's declared spelling.** `expected L` is
  `displayType(paramType)` on the raw annotation while the verdict is taken on
  the unfolded form; a route touching the emitter must not collapse the two.
- **The `E` severity and the registration denial are unchanged for whatever
  keeps emitting.** No route downgrades the row to `W`; `hasLoadParseError`
  (`production-composition.ts:2045–2052`) is not in scope.
- **The corpus stays clean.** Group (g)'s 34-file sweep is re-run rather than
  assumed, and see [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)
  — the committed-fixture gate does not walk `.thetalib`, so two of the 34 are
  outside it.

**(e) Ordering and coordination.**

- **[0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
  asks the same question at a different sink and is open.** Whichever lands
  first states the general reading; the second cites it or states why its sink
  differs. 0127's own §Fix records that `type-system.md:48` does not reach its
  site because the `join` element precondition is not on `:27`'s check-site
  list — the `fn`-argument slot **is**, so a decision here is the narrower one
  and does not settle 0127 by itself.
- **Bug 0050's witness is the coordination surface.** 84 cells, green at HEAD.
  Its d1/d2 cells are the constraint above; its header narrative at `:2337–2348`
  states the mechanism this report measures and is rewritten by any route that
  changes it. New cells belong in that file: same harness, same
  registry-sourced message oracle, same whole-list assertions.
- **[0137](./0137-invoke-arg-type-mismatch-unreachable.md) and
  [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) widen the reach.**
  0137 wires a third argument sink into the same engine; 0138 widens this row's
  callee set to imported `.thetalib` functions, which is where row e4's class is
  most likely to appear in real source. Neither is a prerequisite; both should
  land after the disposition is written, or restate it.
- **[0130](./0130-let-rhs-type-mismatch-declines-object-union.md) makes the
  TYPE-8 arm reachable** if its route mints an `object`. A decision here that
  names only TYPE-7 leaves that arm to be decided again.

**Witness — offline, provider-free.** Every row of §Reproduction (a)–(e) and (g)
settles inside one `parseThetaDocument` call; group (f) needs the executor
harness `tests/non-object-receiver-gate.test.ts:221–292` establishes. Required
rows: (a) all six; (b) all twelve, since the point of the report is that the
target's shape alone decides; (c) all five, which pin the proof channel and
therefore the class boundary; (d) at minimum d1, d2, d4 and d8, so the sibling
sinks red together or deliberately do not; (e) all twelve, e4/e8 being the pair
that decides severity and e6/e7 the 0051 boundary; f2, which is the only row
stating what the value is; and the 34-file corpus sweep as a GOV-15 pin. One
further row is owed that no group supplies: an assertion that
`checkCompatible(named-unresolvable, T)` answers the same verdict for every
target shape `T`, so a future arm inserted ahead of the resolvability tests reds
without anyone remembering to add a target type. No live tier applies: nothing on
this path crosses a provider, and every observable is determined inside one parse.

## Provenance

- **Origin:** bug 0050's round-8 review, residual R3 (`.pi/tmp/fixes/0050-review-round8.md`),
  which located the arm order and recorded the disposition as HEAD-uniform,
  adjudicated-consistent and unpinned. 0050's §Fix record lists it among the
  residuals to file ("the annotated-unresolvable structural refusal tension") and
  states the pinned non-goal this report tests: "`checkFnArgCompat` unchanged —
  its `\"unknown\"` deferral is the spec's."
- **What this report adds beyond that residual:** the target-shape matrix
  (group (b), twelve rows) showing the verdict is decided by the target's kind
  and that the same name defers as a target and refuses as a source; the proof
  channel measurement (group (c)) bounding the class to a bare identifier read
  and the composite disagreement between the two wired sinks (c2 against d8);
  the annotation-spelling inventory (group (e)) including the imported
  `.thetalib` type name and its clean local-declaration control, which moves the
  class from "an annotation naming nothing declared" to "a well-formed
  multi-file program"; the finding that the TYPE-8 arm has no construction site
  and the b9 measurement that follows from it; the four in-tree doc comments
  that state the opposite behaviour; the *Trigger* asymmetry between
  `code-registry-parse.md:54` and `:116`; the runtime measurement (f2) of the
  value the parameter binds; and the 34-file corpus sweep.
- **Evidence:** scratch vitest over `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  driving the shipped `parseThetaDocument`, plus the production executor harness
  for group (f), at `3efdb4ac`; every cell quoted above measured and copied
  verbatim; written, run, deleted. `tests/fn-arg-type-mismatch-wired.test.ts` run
  at HEAD: 84/84 green.
- **Baseline check:** `git show b4b8f42b:src/parser/type-compat.ts` carries the
  array arm at `:181` and the two `resolveNamed` arms at `:222` / `:236`, so the
  order predates every fix cited here; `git show 8ae94691:src/parser/type-compat.ts`
  (bug 0031, 0.43.0) has the same order at `:190` / `:231` / `:245`. The 0050
  commit `3efdb4ac` does not modify `src/parser/type-compat.ts`
  (`git show --name-only`).
- **Implementation, at `3efdb4ac`:** `src/parser/type-compat.ts:139–145`
  (`checkCompatible`), `:147–172` (`unfoldAlias`; the header claim `:151–153`),
  `:174–179` (`decide`'s header; the claim `:177–178`), `:180` (`decide`),
  `:210–217` (TYPE-7; the verdict `:213–215`), `:219–247` (TYPE-8; the verdict
  `:222–225`), `:249–264` (TYPE-10; the deferrals `:254–256`, `:258–260`),
  `:266–269` (the `named`-source arm; the deferral `:268`), `:318`
  (`displayType`), `:394–442` (`checkLetRhsCompat`; the header `:397`, the
  deferral `:411–415`), `:444–480` (`checkFnArgCompat`; the header `:447`, the
  deferral `:462–465`, the emission `:469–479`);
  `src/parser/type-layer-checks.ts:810–832` (`annotationToCompatType`; the final
  arm `:831`), `:943–1030` (the `let` arm; the mechanism comment `:957–965`, the
  gate `:966`, the record `:1021–1024`), `:1216–1220` (`walkFn`'s parameter
  scope), `:1575–1627` (`checkFnCallArgs`; the imported-callee return `:1582`,
  the parameter conversion `:1601`, the proof `:1608`, the emission `:1615–1625`),
  `:1654` (`provableArgType`), `:1769–1803` (its `ident` arm), `:1886–1901`
  (`isProvenReduction`; the exactness test `:1895–1899`);
  `src/extension/invoke-static-checks.ts:807–827`;
  `src/extension/production-composition.ts:2045–2052`.
- **Spec, at `3efdb4ac`:** `docs/spec_topics/type-system.md:27`, `:29`, `:31`,
  `:48`, `:50`, `:52`, `:54`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:54`, `:64`, `:90`, `:116`;
  `docs/spec_topics/expressions.md:214`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`;
  `docs/reference/diagnostics.md:100`, `:110`, `:139`, `:165`.

## Discharge note — bug 0137 (0.78.0)

Appended by the bug 0137 fix; nothing above is altered. One premise is now
stale and its conclusion is strengthened — this report gains no obligation and
loses none.

§Related's 0137 item says "the `invoke` argument row is unreachable at HEAD, so
the third TYPE-9-adjacent argument sink cannot exhibit this disposition yet",
and forecasts that wiring it "lands this question at a fourth position".
[0137](./0137-invoke-arg-type-mismatch-unreachable.md) shipped the wiring in
0.78.0. The premise is stale; the forecast does not come true, for a reason that
outlives it.

The invoke arm's ACTUAL side is `collectProvableArgTypes`, which withholds every
expression shape that types as a `named` reference — `ident`, `member`, `call`,
`invoke`, `query`, `object`, `result-ctor`, `method-call`, `index`, `par-for`
and the `array` literal all return `undefined`, and `collectArmUnion`
propagates that withholding out of any composite containing one. A withheld
slot is passed to `checkInvokeArgTypes` with both sides absent and is skipped
before `checkCompatible` runs. So a `named` sub can never reach `decide` from
this sink, and the `named ⊑ array<…>` arm-order asymmetry this report measures
is structurally unreachable through `invoke(...)` — not merely unreached.

§Reproduction row b12's measurement (`let r = invoke<integer>("./c.theta", v)`
→ `[]`) is therefore unchanged at 0.78.0, but its bracketed reason is no longer
"the row is unreachable": the row now fires on this surface, and b12 is silent
because `v` is an `ident` whose value-type set the arm withholds. §Fix (e)'s
ordering item may drop `invoke` from the positions a route here must reconcile.

## Coordination note — bug 0179 landed (0.104.0)

**This report's measured observable inverted at 0.104.0; its subject stays
open.** [0179](./0179-array-sink-refuses-unresolvable-value-type.md) fixed the
same arm this report measures — `decide`'s TYPE-7 array arm now answers
`"unknown"` for a `named` sub `resolveNamed` cannot resolve, before the
non-`array` short-circuit — as a conformance change against
`type-system.md:48`, whose skip it reads as unconditional on the sink's kind.
Measured at that fix's HEAD, both sides:
`fn g(xs: array<integer>): integer { return xs.length }` + `let v: Zz = [1]` +
`g(v)` drew `theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('xs') type
mismatch: expected array<integer>, got Zz` before and draws **no diagnostic**
after; the same `v` at an `array<integer>` constructor field and at an
`array<integer>` typed `let` flipped identically. Bug 0050's 84-cell witness
stayed green throughout — its `:1120` describe covers the *parameter* side, not
the argument side this report names.

What is **not** decided by that fix, and remains this report's subject: the
corpus-level adjudication between `type-system.md:31`'s closed-list preamble
and `:48`, the `fn-arg-type-mismatch` row's own "no runtime AJV safety net
applies" gloss (`code-registry-parse.md:116`), and §Fix (e)'s binding clause
that any route here must agree with
[0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md).
0179's fix record states its `:48` reading and explicitly does not claim to
close this report. Status unchanged (**open**); re-derive §Reproduction at pick,
since the rows measuring the `fn`-argument sink now read clean.

## Fix (0.185.0)

**Route: adjudicate, and correct the corpus onto the registered *Trigger*.** The
deliverable §Fix (a) asked for — which reading of `type-system.md` governs an
unresolvable operand against a structural target — is settled as **Reading B**,
at every `⊑` check site on `type-system.md:27`'s list. §Fix (b)'s route 1 (the
`decide` reorder) had already landed at 0.104.0 as bug
[0179](./0179-array-sink-refuses-unresolvable-value-type.md)'s conformance fix,
so no code was wired and no executable line changed here; what shipped is the
sentence that route 1 owed and did not write, plus the witness §Fix's *Witness*
paragraph specifies. `src/` is byte-unchanged (`git hash-object
src/parser/type-compat.ts` = `git rev-parse HEAD:src/parser/type-compat.ts`).

- **THE ADJUDICATION, and the law it applies.** Bug
  [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md)'s landed
  *Trigger*-governs law (its `## Fix (0.174.0)`, "THE STATED LAW") is cited
  verbatim and not forked:
  > A registered *Trigger* is the normative statement of a code's emission set
  > (DIAG-2). Where a rule page's scope exceeds the registered *Trigger* of the
  > code it names, the *Trigger* governs and the rule page is corrected in the
  > same commit; no implementation may be wired to emit a code outside its
  > registered *Trigger*. Narrowing an emission set ONTO its registered
  > *Trigger* needs no registry edit (the 0084/0139 posture), but where the
  > *Trigger*'s TEXT presupposes the wider reading, that text is corrected in
  > the same commit as the narrowing.

  Applied here: `theta/parse/fn-arg-type-mismatch`'s registered *Trigger*
  (`code-registry-parse.md:136`) requires an argument "whose static type is not
  compatible with the matched parameter's declared type" — a POSITIVE `T₁ ⋢ T₂`
  verdict. An operand past the parser's static view reaches no such verdict, so
  the unresolvable-operand case is **outside** the registered *Trigger*.
  `type-system.md:31`'s closed-list preamble claimed a wider emission set than
  that *Trigger*; the *Trigger* governs and the page is corrected. The
  *Trigger*'s own text presupposed the wider reading ("Always parse-time … so no
  runtime AJV safety net applies", unqualified), so it is corrected too — late
  relative to the 0.104.0 narrowing, which is the debt this fix discharges.

  Two consequences the adjudication states explicitly, because §Expected
  behaviour's Reading A turns on them: the skip is **unconditional on the
  target's kind** (a structural target is a fact about the position, never
  evidence about the unresolvable operand), and it is **unconditional on whether
  the position documents a runtime AJV net of its own** — where a position
  documents none, emitting would emit outside the code's registered *Trigger*,
  which DIAG-2 forbids. Reading A's third support in §Expected behaviour ("a
  rule that cannot distinguish e4's legal and illegal member is not deciding the
  question its message names") is thereby the record's, not an argument against
  it.

- **What shipped:**
  - `docs/spec_topics/type-system.md:31` — the closed-list preamble gains a
    trailing sentence giving the *Unresolvable operands* paragraph precedence
    over its type-mismatch disposition when either side is past the parser's
    static view. Every existing clause is byte-identical, in particular the
    "unless the position is one where a runtime AJV check is documented as the
    safety net" exception (the 0163 clause below).
  - `docs/spec_topics/type-system.md:48` — the *Unresolvable operands*
    paragraph gains the adjudication: the skip is unconditional on the target's
    kind and on whether the position documents a runtime AJV net of its own,
    with the DIAG-2 rationale, plus the boundary sentence scoping the paragraph
    away from the non-`⊑` precondition gates. Line count unchanged (57).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:136` — the
    `theta/parse/fn-arg-type-mismatch` row's *Trigger* cell gains the
    statical-resolvability qualifier (mirroring the `let-rhs-type-mismatch`
    row's own at `:59`, the asymmetry §Kind element 3 named) and scopes its
    no-AJV-net sentence to the unresolvable-CALLEE case, reusing
    `type-system.md:50`'s verbatim wording. *Trigger* cell only: severity,
    phase, rule link, hint and the *Message* template are byte-identical, so
    DIAG-4 is not engaged. Row stays one physical line; line count unchanged
    (139).
  - `docs/reference/type-system.md:65` — the mirror's *Unresolvable operands*
    paragraph carries the same disposition, mirror-faithfully (224 → 231 lines).
    `docs/reference/diagnostics.md` carries no *Trigger* column and is not
    edited, exactly as §Fix (c) predicted.
  - `tests/unresolvable-operand-structural-target-adjudication.test.ts` — new
    29-cell offline witness (below).
  - `tests/array-ternary-common-type-union.test.ts`,
    `tests/fn-param-annotation-optional.test.ts` — comment and
    `expect()`-failure-message line citations into
    `docs/reference/type-system.md`, re-derived because this fix's mirror edit
    shifted that file down by 7 lines. No assertion moved; both files green
    before and after.
- **Witness — `tests/unresolvable-operand-structural-target-adjudication.test.ts`,
  29 cells, offline and provider-free**, discharging §Fix's *Witness* paragraph:
  (A) four corpus-conformance cells, one per edited prose target, plus two
  controls (the fn-arg *Trigger*'s positive-verdict wording, which is the law's
  hook, and the `let`-RHS row's existing qualifier, which is the model);
  (B) nineteen behaviour pins — a1, a3, a4, a5 (refusal control), b2, b3, b5,
  b7, b10, b11 (refusal control), e2, e3, **e4** (the imported `.thetalib` type
  name, the row §Reproduction (e) says decides severity) with its e8
  local-declaration control, e5, e12, the `array<integer>` constructor-field
  sink, d1 and d8; (C) two boundary pins, d4 and d5; (D) the shape-invariance
  row §Fix's *Witness* paragraph requires that no group supplies — the real
  `checkCompatible` answers `"unknown"` for an unresolvable `named` source
  against sixteen enumerated targets covering all six `CompatType` kinds, with a
  loud precondition on the enumeration's coverage; (E) f2 through the production
  executor — the body parses clean and `g` receives `[1]`, the measurement the
  old emission contradicted. Every diagnostic assertion is over the WHOLE
  unfiltered list, messages registry-sourced. No live tier applies and none was
  run: `src/` is untouched (the 0193/0205 precedent).
- **Gates:** witness RED before (4 (A) cells, each naming the file and the
  missing disposition), GREEN after (29/29). Full default suite `npx vitest run`
  → **376 files / 7727 tests passed**. `npm run typecheck` clean.
  `npm run lint` clean. Corpus GOV-15 discharged by
  `tests/committed-fixture-parse-gate.test.ts` (36 green), not by a scratch
  probe. Protected witnesses byte-unchanged and green:
  `fn-arg-type-mismatch-wired` 93, `array-sink-unresolvable-deferral` 21,
  `ternary-common-type-trigger-adjudication` 23,
  `match-fn-return-lub-dominating-discipline` 26,
  `array-ternary-common-type-union` 21.
- **Review:** 1 round. Round 1 (deep) — **CLEAN**, with evidence of a read diff
  (the reviewer independently measured the 0179 arm at
  `src/parser/type-compat.ts:218–226`, checked TYPE-10's "not deferred to a
  runtime AJV failure" sentence against the shipped disposition, spot-checked
  the `:48` claim that every code named for these sites registers a *Trigger*
  requiring a static failure against rows `:43`, `:59`, `:60`, `:85`, `:134`,
  `:137`, and verified every `path:line` in the new file resolves). Four
  residuals, all pre-existing and none introduced here — recorded below.
- **Verification:** **SOLID**, all four obligations discharged with quoted
  evidence. (1a) Each of the four prose edits was individually reverted to its
  pre-fix text and the matching (A) cell red naming the missing phrase; each
  file restored and proved byte-exact by `git hash-object`. (1b) The behaviour
  pins red destructively: reinstating bug 0179's pre-fix `decide` TYPE-7 arm
  order reds **12 of 29** cells — a1, b2, e2, e3, e4, e5, e12, the ctor-field
  sink, d1, d8, the (D) invariance row (six targets flipping to
  `"incompatible"`) and (E) f2 — each red naming the reinstated emission;
  `src/parser/type-compat.ts` restored byte-exact (`git hash-object` =
  `git rev-parse HEAD:…`) and clean in `git status`. (1c) d4 still refuses at
  the shipped tree and is stated correct. (2) 376 files / 7727 tests, delta 0.
  (3) No live run owed and none run — `git diff --name-only` and
  `git status --short` contain no `src/` path. (4) typecheck and lint clean.
- **Coordination — the three binding agreements this fix owed:**
  1. **[0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
     stays open and its subject is not fixed; the boundary is named.** The line
     is the `⊑` relation itself: this adjudication reaches exactly the check
     sites `type-system.md:27` enumerates, all of which are governed by
     `T₁ ⊑ T₂`. `join`'s element precondition is **not** one of them — 0127's
     own §Fix already records that `:48` does not reach its site for that
     reason — and neither is the `for` iterand's `array<T>` precondition. Both
     are refusal gates that ask a shape question directly rather than through
     the relation, so no `T₁ ⋢ T₂` verdict is in play and this record decides
     nothing about them. Measured at this HEAD and pinned as boundary cells:
     `for y in v { y }` over `let v: Zz = [1]` still draws
     `theta/parse/non-array-iterand … got Zz` (§Reproduction d4), and the
     `join` receiver still defers (d5). §Fix (e)'s clause that "a decision here
     is the narrower one and does not settle 0127 by itself" is honoured
     literally: 0127 is the *wider* question — whether a non-`⊑` precondition
     gate owes the same deferral — and remains entirely open.
  2. **[0163](./0163-params-default-type-compat-unchecked-at-load.md)'s gate is
     agreed with, not contradicted.** That report's reading — that
     `theta/parse/params-default-type-mismatch`'s registered *Trigger*
     (`code-registry-parse.md:53`) documents the runtime AJV safety net for its
     own unresolvable-operand deferrals, and thereby satisfies `:31`'s "unless
     the position is one where a runtime AJV check is documented as the safety
     net" clause at that position — is affirmed. It is in fact the precedent
     this record generalises: a registry *Trigger* is where a position's net (or
     its absence) is documented. Edit 1 therefore leaves `:31`'s exception
     clause byte-identical and only adds precedence for the unresolvable-operand
     case, which is the same disposition `:53` already spells out for itself;
     `:53` is byte-unchanged. No disagreement is raised, so 0163 is not
     reopened.
  3. **[0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s
     witness is untouched and green** (93 cells at this HEAD, grown from the 84
     §Fix (e) recorded). Its d1/d2 parameter-side deferral cells and its
     `:2337–2348` header narrative are byte-unchanged: this fix moved no
     behaviour, so the narrative's mechanism claim was already restated by 0179
     and needs no further edit here.
- **Residuals:**
  1. **The document's title, §Summary and §Reproduction describe the
     pre-0.104.0 observable and are preserved unedited.** The observable
     inverted at 0179 (the appended coordination note says so) and was
     re-derived at this HEAD before any work: a1, b2, b3, b7, b10, d1, d8, e2,
     e3, e5, e12 and the `array<integer>` constructor-field sink are all `[]`;
     only a5 (a resolvable mistyped literal), b11, d4 and e7 still refuse. The
     new witness pins the current truth cell-by-cell; the historical body is
     left as filed per the append-only convention.
  2. **The document's registry line citations have drifted** (bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s class, not edited
     here): `fn-arg-type-mismatch` is `code-registry-parse.md:136` (the document
     says `:116`), `let-rhs-type-mismatch` is `:59` (says `:54`),
     `non-array-iterand` is `:70` (says `:64`). The witness cites the HEAD
     numbers.
  3. **The (D) invariance cell's kind coverage is runtime-checked, not
     compile-checked.** Its precondition reds on under-coverage of the six
     `CompatType` kinds that exist today but would not red if a seventh kind
     were added. A `Record<CompatType["kind"], …>`-typed enumeration would move
     the check to the compiler. Recorded by review round 1 as non-blocking; the
     §Fix-required row is fully discharged for every kind that exists.
  4. **Three pre-existing stale citations, none introduced and none edited:**
     `tests/fn-param-annotation-optional.test.ts:71`, `:289`, `:304` cite the
     fn-arg row at `code-registry-parse.md:135` (it is `:136`; those assertions
     resolve the row by code string, not by line);
     `src/parser/type-compat.ts:257`'s comment cites TYPE-10 at
     `type-system.md:52` (it is `:54`); and `type-system.md:50`/`:52` carry a
     `code-registry-parse.md#code-registry` link whose anchor id does not exist
     in that file (2 occurrences, present at base).
- **Discharge notes appended:** none. No sibling document required an edit —
  0127, 0163, 0050, 0179 and 0130 are each cited from this record without being
  modified.
- **Pinned dispositions / non-goals:** every §Non-goals item stands unchanged.
  In particular the TYPE-8 arm is still unreachable and is not decided here
  (0130 owns the conversion that would reach it, and this record's `:48`
  sentence names the inline object type as a target kind so that a future
  reachable arm inherits the disposition rather than reopening it); the
  `<withheld>` binder sentinel is not involved; the composite disagreement
  between the two wired sinks (c2 against d8) is recorded, not reconciled; and
  bug 0051 still owns whether an unresolvable annotation should be refused at
  the annotation.
