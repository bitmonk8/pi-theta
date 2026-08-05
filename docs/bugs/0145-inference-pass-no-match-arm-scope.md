# Bug 0145 — `StaticTypeInferencePass` has no arm-scope concept: `#typeExpr`'s `case "match"` (`static-type-inference.ts:237–241`) types every arm body in the ENCLOSING scope, so an arm body's read of its own pattern binder resolves to a same-named outer binding's record — six registered `E`-severity rows then refuse spec-legal thetas (`let x = 1` + `let m: string = match "hi" { x => x }` reports `expected string, got integer` where the binding is `"hi"`), three more keep the right code and name the outer binding's type in the `<type>` placeholder, and the same record returned BY IDENTITY poisons the outer binding through `unprovableBindings`, withholding a true `fn-arg-type-mismatch`

- **Status:** open. §Fix is not settled: two routes are enumerated with their
  consequences and the constraints are pinned, but the disposition — and the
  question of what static type an arm binder carries, which the type layer today
  deliberately declines to answer — is left to the run. No ordering dependency
  blocks it. The coordination surface is bug 0050's committed witness: cell
  u13e of `tests/fn-arg-type-mismatch-wired.test.ts` (`:2694–2724`) pins group
  (a) below in both directions and names both of this report's fix routes as
  its flip conditions, so any fix here reds that cell by design (§Fix (d)).
- **Sev/Diff estimate:** S2/D3 — six registered `E`-severity codes refuse
  programs the runtime executes correctly (measured: `"hi"`, `"hia"`, `["hi"]`,
  `{"s":"hi"}` returned by the identical sources with the shadowed outer
  binding removed), and `E`-severity `theta/parse/*` denies registration
  (`hasLoadParseError`, `src/extension/production-composition.ts:2045–2052`), so
  the input is noisily refused rather than silently mis-run; three further rows
  emit the right code with the wrong type named. No measured silent acceptance
  is attributable to this channel — with no same-named outer binding every sink
  defers, so a shadow can only ADD a refusal (§Actual behaviour, *the deferral
  floor*). D3 because the pass has no scope parameter to thread at the arm
  (`typeOf`'s `bindings` is the caller's map, `static-type-inference.ts:182–188`),
  the fix must first adjudicate what type an arm binder gets — the type layer
  records it WITHHELD on purpose (`recordWithheldBinders`,
  `type-layer-checks.ts:1181–1187`) and the pass would have to agree — the
  alternative route re-keys a marking channel bug 0050 built on object identity,
  and the change lands on the substrate three other open reports cite.
- **Kind:** defect — implementation, against two written sentences and one
  in-tree discipline that is already correct one layer up. Four elements:
  1. **An arm body's read resolves to the wrong binding.**
     `docs/spec_topics/expressions.md:168` types the identifier pattern:
     "anything; binds the value to `x`". `:53` names "a `match` pattern binding"
     among the constructs that bind locals, and `:51` states the resolution
     consequence: "Local bindings (1) shadow everything else lexically, the same
     as in Rust or TypeScript." The runtime implements exactly that —
     `evalMatch` evaluates the selected body in `env.child()` with every pattern
     binding defined (`src/runtime/statement-executor.ts:1124–1128`), and an
     identifier pattern binds the scrutinee whatever its value
     (`src/runtime/match-result.ts:177–179`). `#typeExpr`'s `case "match"`
     (`src/parser/static-type-inference.ts:237–241`) maps every arm body through
     the caller's `bindings` map unchanged, so `x` inside the arm reads the
     enclosing `x`'s record.
  2. **Six registered `E`-severity rows refuse spec-legal thetas.** Measured in
     §Reproduction (b), each against a control differing by one line — the outer
     `let` the refused construct does not mention:
     `theta/parse/let-rhs-type-mismatch`, `theta/parse/match-arm-type-mismatch`,
     `theta/parse/mixed-plus-operands`,
     `theta/parse/array-element-type-mismatch`,
     `theta/parse/object-field-type-mismatch`,
     `theta/parse/integer-narrowing`. All six carry `E`
     (`docs/spec_topics/diagnostics/code-registry-parse.md:54`, `:75`, `:36`,
     `:40`, `:46`, `:24`), so none of these thetas registers.
  3. **Three rows keep the right code and name the wrong type.**
     `theta/parse/non-boolean-condition`, `theta/parse/non-array-iterand` and
     `theta/parse/unknown-method` fire correctly on a `match` whose value is a
     string, and render `integer` — the enclosing binding's type — into the
     `<type>` placeholder DIAG-4 (`diagnostic-shape.md:74`) makes normative
     (§Reproduction (c)). Their controls miss two of the three emissions
     entirely.
  4. **The type layer already holds the arm scope, and the two channels
     disagree on one node.** `matchArmScope`
     (`src/parser/type-layer-checks.ts:1202–1214`) exists and is used for the
     arm-body WALK (`:1972`) and for `provableArgType`'s reduction (`:1686`),
     both added by bug 0050's fix. `checkMatchArmTypes` on the same node reads
     the arm bodies through the enclosing `bindings` (`:1961`), byte-unchanged
     by that fix. Measured (§Reproduction (d)): the read of `x` INSIDE an arm
     body defers, and the same read taken as the `match`'s own type reports
     `on type integer` — one source line, two answers.
  Element 4 also produces a withheld TRUE positive rather than a false one:
  `typeOf(match)` returns the outer binding's record BY IDENTITY, the
  `let`-marking guard adds that shared object to `unprovableBindings`, and the
  outer binding reads unprovable for the rest of the walk (§Reproduction (a)).
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the origin. Its round-7 review classified this channel
    and its §Fix (0.77.0) *Residuals* names the filing: "the marking-channel
    identity leak is bug 0145's root". That fix built `matchArmScope` and scoped
    the type-layer walk and `provableArgType` with it, which closed the false-`E`
    consequences AT THE FN-ARG SINK; it did not change the inference pass, so
    every sink that reads `typeOf(match)` directly still resolves arm bodies
    outer-scope. **This is not 0050's defect and closing it as one would be
    wrong**: 0050's subject is a registered row with no caller, and its fix
    wired that caller. The proof they are disjoint is cell u13e, which pins
    group (a)'s `[]` as a deliberate deferral inside 0050's adjudicated withhold
    discipline and states the two flip conditions — "the day the inference pass
    types arm bodies in an arm scope, or the day the marking guard keys on
    something other than the rhs type object's identity" — which are this
    report's §Fix routes 1 and 2.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the sibling
    binder class. There the plain `for` variable is not bound with its element
    type; this report's binder is a `match` pattern name. **The positions are
    disjoint and neither fix reaches the other**: 0126's fix decides what the
    type layer records for a loop variable, this one decides which scope the
    inference pass evaluates an arm body in, and a `match` arm body is not a
    loop body. They compose in one direction only — measured (§Reproduction
    (d3)), an arm binder shadowing a `for` variable draws nothing, because the
    `for` variable is already recorded WITHHELD
    (`type-layer-checks.ts:1102`, bug 0050) and the arm binder's shadow reads
    that withheld twin instead of a typed record. 0126's own citations predate
    0.77.0 and have shifted (bug 0134's class); its `walkStmt` `for` arm is at
    `type-layer-checks.ts:1071–1104` at this HEAD.
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **open**, the spelling-mint substrate family and the same file. Its subject
    is `#typeExpr`'s `case "member"` (`static-type-inference.ts:242–244`), which
    mints `named <fieldname>`; the arm here is two lines above it. The two are
    distinguished by which half of the `ident` arm's `??` runs: 0136 is about the
    value the pass FABRICATES when nothing resolves, this report is about the
    record it RESOLVES when something same-named does. One row of §Reproduction
    (d6) sits on the boundary — a `schema` whose name matches the binder's
    spelling is adopted as the arm's type — and is cited here only as the class
    marker; the schema-name collision is 0136's adjudication.
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **open**, the
    `#commonType` erasure family. `#commonType` (`static-type-inference.ts:341–352`)
    is the function that returns the leaked record: with one arm its `find`
    answers `candidates[0]`, the outer binding's own object. 0081's claim is that
    the reduction never forms a union and falls back to the first candidate;
    this report's claim is about the SCOPE the candidates were computed in, which
    is upstream of that reduction and unaffected by whether it unions. Both fixes
    touch `#commonType`'s neighbourhood; whichever lands second rebases (§Fix (d)).
  - [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md) —
    **open**, the adjacent `match`-pattern report. Its subject is which patterns
    BIND (a capitalised bare pattern binds where the spec says it names a
    declaration); this report's subject is what a binder's read TYPES to once it
    binds. A fix there changes the set of names `collectPatternBinderNames`
    (`type-layer-checks.ts:657–679`) sees, which changes which sources reach this
    defect without changing the defect.
  - [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) —
    **open**, the withheld sentinel's own faces. Route 1 below extends the
    sentinel's reach into the inference pass, so its spellability contract binds
    a fix here (§Fix (c)).
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)**. Its §Affected enumerates the five `#typeExpr` arms that
    mint a `named` from an author-chosen name. The `case "match"` arm is **not**
    among them and mints nothing; it is a scope defect, not a mint defect.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
    and binding on §Fix (c)'s corpus sweep:
    `tests/committed-fixture-parse-gate.test.ts` filters `.theta` only.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The defect site** — `src/parser/static-type-inference.ts:237–241`, the
    `case "match"` arm of `#typeExpr` (declared `:197`):

    ```ts
      case "match":
        return this.#commonType(
          node.arms.map((arm) => this.#typeExpr(arm.body, env, bindings)),
          env,
        );
    ```

    `bindings` is passed through unchanged. `arm.pattern` is not read.
  - **The pass has exactly one scope-extension point, and it is the other
    binder-bearing arm.** `case "par-for"` (`:263–294`) builds `inner = new
    Map(bindings)` and records the loop variable's element type (`:280–281`)
    before typing the body tail in it (`:282–285`). The `match` arm is the only
    other `Expr` arm whose sub-expressions execute under a binding the node
    itself introduces, and it has no equivalent.
  - **The identity return that carries the record out.** `case "ident"`
    (`:211–216`) returns `bindings.get(node.name)` — the map's own object, not a
    copy — when the name is recorded. `#commonType` (`:341–352`) returns
    `candidates.find(...)` or `candidates[0]` (`:351`), both of which are that
    same object for a single-arm `match`. Nothing between them clones.
  - **The public seam, whose `bindings` is the caller's.**
    `StaticTypeInferencePass.typeOf` (`:182–188`) forwards to `#typeExpr`
    verbatim; the type layer delegates through
    `src/parser/type-layer-checks.ts:924–927`.
  - **The module header states the posture this arm does not satisfy.**
    `static-type-inference.ts:20–24`: "nodes whose static type is not resolvable
    past the parser's static view … are assigned a `named` reference type — the
    same shape the `⊑` engine treats as `"unknown"`". An arm binder's read is
    neither resolvable (its value's type is the scrutinee's, which the pass never
    consults) nor treated as unresolvable — it is resolved to a different
    binding.
  - **The arm scope that exists one layer up, and its two users.**
    `matchArmScope` (`type-layer-checks.ts:1202–1214`) copies `bindings` and
    records every pattern binder WITHHELD through `recordWithheldBinders`
    (`:1181–1187`), whose sentinel name is `WITHHELD_BINDER_TYPE_NAME`
    (`:387`, the string `"<withheld>"`). Its doc comment (`:1189–1201`) states
    the contract in terms: "the walk of an arm body and `provableArgType`'s
    reduction over arm bodies both resolve it through here — the two disagreeing
    about which binding an arm body reads is the scope mismatch this exists to
    close." Users: `walkExpr`'s arm walk (`:1972`) and `provableArgType`'s
    `case "match"` (`:1686`, through `isProvenReduction`'s `armScopes`
    parameter, `:1886–1900`).
  - **The one reader on that node that does NOT use it** —
    `type-layer-checks.ts:1958–1966`, `walkExpr`'s `case "match"`:

    ```ts
      case "match":
        this.diagnostics.push(
          ...checkMatchArmTypes({
            armTypes: e.arms.map((arm) => this.typeOf(arm.body, bindings)),
    ```

    `bindings`, not `this.matchArmScope(arm.pattern, bindings)`. Six lines below,
    the walk uses the arm scope for the same bodies.
  - **`checkMatchArmTypes`** — `src/parser/match-result.ts:165–194`. `sink` is
    `undefined` at the sole call site (`type-layer-checks.ts:1962`), so the
    function always takes the LUB branch (`:187–193`) and never the sink branch
    (`:176–185`); `leastUpperBound` (`:214–238`) returns `undefined` when no arm
    type covers all the others, and that is the
    `theta/parse/match-arm-type-mismatch` emission (`:191`, `mismatchDiagnostic`
    at `:197–205`). An `"unknown"` compatibility answer does not block a
    candidate (`:218–222`), which is why the controls are silent.
  - **The marking channel, and its single read site.**
    `unprovableBindings` is declared at `type-layer-checks.ts:906`. `walkStmt`'s
    `let` arm resolves `rhsType = this.typeOf(stmt.init, bindings)` (`:947`),
    computes `initUnprovable` PRE-set (`:1019–1020`), and marks the RECORDED
    OBJECT on the unprovable branch: `this.unprovableBindings.add(rhsType)`
    (`:1052`). The sole read is `provableArgType`'s `ident` arm (`:1793–1802`):
    `bindings.get` then `this.unprovableBindings.has(recorded) ? undefined :
    recorded`. Its effect is hit-becomes-withhold and nothing else, which is what
    bounds group (a) to a deferral.
  - **The runtime the parse is judging.** `evalMatch`
    (`src/runtime/statement-executor.ts:1091–1129`): the selected arm's bindings
    are installed into `env.child()` (`:1124–1127`) and only then is the body
    evaluated (`:1128`). `matchPattern`'s `case "identifier"`
    (`src/runtime/match-result.ts:177–179`) binds the scrutinee value under the
    pattern's name unconditionally.
  - **The binder classes the pattern grammar admits.**
    `collectPatternBinderNames` (`type-layer-checks.ts:657–679`) binds for
    `identifier` (`:659–661`), `constructor` (`:662–664`), `object`
    (`:665–669`) and `array` (`:670–674`); wildcard and literal bind nothing
    (`:675–677`). All four measured (§Reproduction (b17), (e)).
  - **The sink that is NOT reachable through this channel.**
    `collectProvableArgTypes` (`src/extension/invoke-static-checks.ts:484–570`)
    is the extension-layer twin; its `case "match"` (`:500–505`) reduces over arm
    bodies with an **empty** bindings map (`:558`, "EMPTY bindings map, so even a
    `let`-bound name is nominal here"), so no outer record is resolvable there
    and the invoke sink cannot leak.
  - **The registration consequence.** `hasLoadParseError`
    (`src/extension/production-composition.ts:2045–2052`) returns true for any
    error-severity `theta/load/*` or `theta/parse/*`; call sites `:1329`,
    `:1749`, `:1933`. Every code in §Reproduction (b) and (c) is `E`, so a theta
    drawing one does not register.
  - `docs/spec_topics/expressions.md:168` — the Identifier pattern row, "binds
    the value to `x`"; `:174` — the lowercase-binds / capitalised-names
    disambiguation (bug 0141's subject); `:180` — *Arm syntax*, the common-upper-
    bound rule and the `match-arm-type-mismatch` sentence; `:46` and `:51` —
    identifier resolution order and "Local bindings (1) shadow everything else
    lexically"; `:53` — "a `match` pattern binding … bind[s] locals".
  - `docs/spec_topics/type-system.md:27` — the positions the `⊑` relation
    governs; `:48` — *Unresolvable operands*, the deferral the controls exhibit
    and that any fix preserves; `:50` — TYPE-9.
  - `docs/spec_topics/control-flow.md:13` — the `for` iterand contract (row c3).
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the ten rows this
    report touches, all `E`: `:24` (`integer-narrowing`), `:34`
    (`non-boolean-condition`), `:36` (`mixed-plus-operands`), `:40`
    (`array-element-type-mismatch`), `:46` (`object-field-type-mismatch`), `:54`
    (`let-rhs-type-mismatch`), `:63` (`unknown-method`), `:64`
    (`non-array-iterand`), `:75` (`match-arm-type-mismatch`), `:116`
    (`fn-arg-type-mismatch`). Mirrors without a *Trigger* column:
    `docs/reference/diagnostics.md:70`, `:80`, `:82`, `:86`, `:92`, `:100`,
    `:109`, `:110`, `:124`, `:165`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:71` — DIAG-1; `:72` —
    DIAG-2 (the registry is closed; a *Trigger* change lands in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative).
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:9–21` — category 1,
    whose rule (`:13`) is "Render the Theta static type". Group (c)'s renderings
    are well-formed under that rule and name the wrong type, so the defect is the
    value interpolated, not the form.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9`
    — the loads-cleanly predicate. Group (b) and group (c)'s c1/c5 sources load
    cleanly WITHOUT the shadowing line and are refused WITH it, so they are
    inside GOV-15's input set only in their control form; a fix moves them in the
    permissive direction (§Fix (c)).
  - **Existing coverage.** `tests/fn-arg-type-mismatch-wired.test.ts` — bug
    0050's witness, 84 cells, green at HEAD (`npx vitest run` measured). Cell
    u13e (`:2694–2724`) over fixture `U13E_ARM_IDENTITY_MARKING` (`:890–892`)
    is group (a) row a1, asserted `[]`, with the mechanism and both flip
    conditions written into its comment. Cell u13r (`:2726–2760`) pins the
    sentinel render shapes. Two further cells drive a shadowing arm binder — u12b
    (`:2110–2125`, fixture `:786–787`) through the walk and u12c
    (`:2127–2144`, fixture `:788–789`) through the reduction — with u12pb
    (`:806–807`) as the non-shadowing differentiator. **All three assert the
    fn-arg sink only**, and u12b's own comment cites `walkExpr`'s `match` arm at
    `type-layer-checks.ts:1958–1974` — the block whose `armTypes` line this
    report measures. `rg -n 'match .* \{ [a-z]+ =>' tests/` returns four files at
    HEAD and no other cell in them binds a name an enclosing binding also holds.
    **No test anywhere covers group (b), (c), (d) or (e)**, and no test asserts
    `checkMatchArmTypes`'s behaviour under shadowing at all.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Parse rows through the production `parseThetaDocument` over
  the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`), frontmatter
  `---\nmode: prompt\n---`, a trailing expression supplying the final value.
  Runtime rows through `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, the harness shape
  `tests/non-object-receiver-gate.test.ts:186–292` establishes. Scratch vitest
  files under `tests/`, written, run, deleted; `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

`#typeExpr` assigns a static type to every expression node. Its `case "match"`
arm maps each arm body through the caller's `bindings` map with no modification
(`static-type-inference.ts:239`). A `match` arm introduces bindings — the
pattern's binders — and the arm body executes under them. The pass never
constructs that scope, so for

```
let x = 1
let m = match "hi" { x => x }
```

the arm body's `x` reads the enclosing `let x = 1`'s record and the `match` types
as `integer`. At runtime the identifier pattern binds the scrutinee
(`match-result.ts:177–179`) and the body evaluates in a child environment
carrying it (`statement-executor.ts:1124–1128`), so `m` is `"hi"` — measured.

The type layer already builds the arm scope. `matchArmScope`
(`type-layer-checks.ts:1202–1214`), added by bug 0050's fix, records every
pattern binder as a WITHHELD entry, and two readers use it: the arm-body walk
(`:1972`) and `provableArgType`'s reduction (`:1686`). The third reader on the
same node — `checkMatchArmTypes`, six lines above the walk — passes the
enclosing `bindings` (`:1961`), and every check elsewhere that asks for the
`match` expression's own type reaches `#typeExpr` directly. The divergence is
measurable on one source line: `match "hi" { x => x.frobnicate() }` reports
nothing (the walk, arm-scoped), and `match "hi" { x => x }.frobnicate()` reports
`unknown method 'frobnicate' on type integer` (the pass, enclosing-scoped).

**Six registered `E`-severity rows refuse programs the runtime executes.** Each
measured against a control differing by one line — the outer `let` the refused
construct does not mention: `let-rhs-type-mismatch` (`expected string, got
integer` where the binding is `"hi"`), `match-arm-type-mismatch` (on two arms
that both evaluate to strings), `mixed-plus-operands` (`integer and string` for
`"hi" + "a"`), `array-element-type-mismatch` and its `let-rhs` companion (for
`["hi"]` against `array<string>`), `object-field-type-mismatch` (for `{"s":
"hi"}` against `{ s: string }`), and `integer-narrowing` (`cannot narrow number
to integer` for a string value). All six carry `E`, so `hasLoadParseError`
(`production-composition.ts:2045–2052`) denies registration and none of these
thetas loads.

**Three more rows are right about the code and wrong about the type.**
`non-boolean-condition`, `non-array-iterand` and `unknown-method` fire correctly
on a `match` whose value is a string, and render `integer` — the enclosing
binding's type — into the `<type>` placeholder. Two of their three controls miss
the emission entirely.

**The leak is by object identity, which reaches one more sink.** `#commonType`
returns `candidates[0]` for a single-arm `match` (`:351`) and the `ident` arm
returns the map's own object (`:214–215`), so `typeOf(match)` IS the outer
binding's recorded `CompatType`. `walkStmt`'s `let` arm marks an unprovable
initialiser by that object's identity (`type-layer-checks.ts:1052`), and
`provableArgType` correctly withholds here because ITS reduction is arm-scoped —
so the shared object enters `unprovableBindings` and the outer binding reads
unprovable for the rest of the walk. `let x = 1` + `let m = match "hi" { x => x
}` + `let r = g(x)` for `g(s: string)` therefore draws nothing where a true
`fn-arg-type-mismatch` stands. This half is bounded to a deferral —
`unprovableBindings` has one read site and its only effect is
hit-becomes-withhold — and is pinned by bug 0050's cell u13e as a deliberate
withheld true positive with both of this report's fix routes named as its flip
conditions.

## Reproduction

Offline, at `3efdb4ac`. Parse rows: the production `parseThetaDocument` through
`parseDoc` (`tests/helpers/e2e-s1.ts:39`), with `---\nmode: prompt\n---\n`
prepended. Each cell is the whole diagnostic list in emission order, unfiltered,
with the emission's line:column. Runtime rows: the production executor harness
named in §Observed at.

### (a) The marking channel — a withheld true positive

Every row carries the prologue `fn g(s: string): number { 1 }`.

| # | source after the prologue | diagnostics |
|---|---|---|
| a1 | `let x = 1` / `let m = match "hi" { x => x }` / `let r = g(x)` | `[]` |
| a2 | `let x = 1` / `let r = g(x)` — control, no `match` | `fn-arg-type-mismatch` @6:11: `fn 'g' argument 0 ('s') type mismatch: expected string, got integer` |
| a3 | `let m = match "hi" { w => x }` — non-shadowing binder | same code and message @7:11 |
| a4 | `for x in ["a"] { let r = 1 }` — the `for`-binder variant | same @7:11 |
| a5 | `let flag = true` / `let m = flag ? x : x` | same @8:11 |
| a6 | `let m = [x][0]` | same @7:11 |
| a7 | a1 plus a second `let r2 = g(x)` | `[]` |
| a8 | `let r0 = g(x)` BEFORE the `match`, then a1's body | one emission @6:12 only |

a1 is bug 0050's committed cell u13e. a3–a6 are the direction controls: a
non-shadowing binder, the `for` binder class, and two composite reductions whose
type is also an outer record by identity all keep the emission, so the leak is
confined to a shadowing `match` binder. a7 shows the poisoning persists for the
rest of the walk; a8 shows it starts at the marking statement, not before it.

### (b) Six registered rows refusing a spec-legal theta

Each pair differs by one line — the outer `let`, which the refused construct
does not mention.

| # | source | diagnostics |
|---|---|---|
| b1 | `let x = 1` / `let m: string = match "hi" { x => x }` | `let-rhs-type-mismatch` @5:1: `let binding 'm' initialiser type mismatch: expected string, got integer` |
| b2 | control (outer `let` removed) | `[]` |
| b3 | `let x = 1` / `let m = match "hi" { x => x, "b" => "z" }` | `match-arm-type-mismatch` @5:9 |
| b4 | control | `[]` |
| b5 | `let x = 1` / `let s = match "hi" { x => x } + "a"` | `mixed-plus-operands` @5:9: `'+' has mixed operand types: integer and string` |
| b6 | control | `[]` |
| b7 | `let x = 1` / `let xs: array<string> = [match "hi" { x => x }]` | `let-rhs-type-mismatch` @5:1 (`expected array<string>, got array<integer>`); `array-element-type-mismatch` @5:25 (`at index 0: expected string, got integer`) |
| b8 | control | `[]` |
| b9 | `schema P { s: string }` / `let x = 1` / `let p = P { s: match "hi" { x => x } }` | `object-field-type-mismatch` @6:16: `field 's' on schema 'P' type mismatch: expected string, got integer` |
| b10 | control | `[]` |
| b11 | `let x = 1.5` / `let m: integer = match "hi" { x => x }` | `integer-narrowing` @5:1: `cannot narrow number to integer` |
| b12 | control | `[]` |
| b13 | `let x = 1` / `let m: string = match "hi" { x => x + "a" }` — composite arm body | `let-rhs-type-mismatch` @5:1 |
| b14 | `let x = 1` / `let m = match "hi" { x => match "b" { "a" => x, _ => "z" }, "q" => "w" }` | `match-arm-type-mismatch` @5:9 |
| b15 | `fn f(x: integer): string { let m: string = match "hi" { x => x }  m }` / `let r = f(1)` | `let-rhs-type-mismatch` @4:28 |
| b16 | control (parameter renamed `y`) | `[]` |
| b17 | `let x = 1` / `let m: string = match Ok("a") { Ok(x) => x, Err(e) => "z" }` | `let-rhs-type-mismatch` @5:1; `match-arm-type-mismatch` @5:17 |
| b18 | control | `[]` |

b13 shows a composite arm body carries the erased read outward. b14 shows a
nested `match` reaching the outer LUB row. b15/b16 show a function parameter is
as good a shadowed outer as a `let`. b17 shows the constructor pattern's binder
behaves identically and that two rows can fire on one source.

### (c) Three rows with the right code and the wrong type

| # | source | diagnostics |
|---|---|---|
| c1 | `let x = 1` / `if match "hi" { x => x } { let z = 1 }` | `non-boolean-condition` @5:4: `condition must be boolean; got integer` |
| c2 | control | `[]` |
| c3 | `let x = 1` / `for y in match "hi" { x => x } { y }` | `non-array-iterand` @5:10: `'for' expects array<T> after 'in'; got integer` |
| c4 | control | `non-array-iterand` @4:10: `'for' expects array<T> after 'in'; got x` |
| c5 | `let x = 1` / `let m = match "hi" { x => x }.frobnicate()` | `unknown-method` @5:9: `unknown method 'frobnicate' on type integer` |
| c6 | control | `[]` |

The `match` in each row evaluates to `"hi"`. A string is not a boolean
(`code-registry-parse.md:34`), not an `array<T>` (`control-flow.md:13`), and has
no `frobnicate` member (`:63`), so all three codes are owed. Each names
`integer`, the type of a binding the construct does not read. c2 and c6 miss the
owed emission; c4 emits it and renders the binder's own spelling, which is bug
0136's family.

### (d) The two channels on one node, and what does not leak

| # | source | diagnostics |
|---|---|---|
| d1 | `let x = 1` / `let m = match "hi" { x => x.frobnicate() }` | `[]` — the WALK, arm-scoped |
| d2 | `let x = 1` / `let m = match "hi" { x => x }.frobnicate()` | `unknown-method` @5:9: `on type integer` — the PASS, enclosing-scoped |
| d3 | `for x in [1] { let m: string = match "hi" { x => x } }` | `[]` |
| d4 | `let x = "s"` / `let m: string = match "hi" { x => x }` | `[]` |
| d5 | `let x = 1` / `let m: string = match "hi" { _ => "z" }` | `[]` |
| d6 | `schema xs = array<integer>` / `let m: string = match "hi" { xs => xs }` | `schema-case-mismatch` @4:8; `let-rhs-type-mismatch` @5:1: `expected string, got xs` |
| d7 | frontmatter `params: topic: string` / `let m: integer = match 7 { topic => topic }` | `[]` |
| d8 | control for d7 | `[]` |

d1 against d2 is the divergence in one pair: the same identifier read under the
same pattern, judged by the walk and by the pass, gives a deferral and a verdict.
d3 shows the leak needs a TYPED outer record — a `for` variable is already
recorded WITHHELD (`type-layer-checks.ts:1102`), so the arm binder's shadow hits
that twin. d4 is the *deferral floor* in its benign direction: when the outer
record happens to satisfy the position, the check passes for the wrong reason and
the observable matches the control. d5 confirms a pattern binding nothing takes
`matchArmScope`'s identity branch (`:1208–1210`) and changes nothing. d6 marks
the boundary with bug 0136: with no same-named binding the read mints the
binder's spelling, and a declaration matching it resolves. d7/d8 show a
frontmatter `params:` field is not in `bindings` at all
(`type-layer-checks.ts:1780–1782`), so it cannot be the shadowed outer.

### (e) The other two binder classes

| # | source | diagnostics |
|---|---|---|
| e1 | `let a = 1` / `let m: string = match ["s"] { [a] => a }` | `let-rhs-type-mismatch` @5:1: `expected string, got integer` |
| e2 | control | `[]` |
| e3 | `schema P { a: string }` / `let a = 1` / `let m: string = match (P { a: "s" }) { P { a } => a }` | `let-rhs-type-mismatch` @6:1: `expected string, got integer` |
| e4 | control | `[]` |

Array and object pattern binders enter `collectPatternBinderNames`
(`type-layer-checks.ts:670–674`, `:665–669`) and leak identically at parse. Their
top-level runtime disposition on a non-`Result` scrutinee is a `MatchError`
(`theta/runtime/match-error`, `expressions.md:178`) — measured, and a separate
matter this report does not claim; e1 and e3 are cited for the parse verdict
only.

### (f) The runtime, and the committed corpus

Each row is the control source of the pair above it, executed — the refused
variants do not register, so the value they would have produced is measured on
the source they differ from by one line.

| # | source | parse | run |
|---|---|---|---|
| f1 | b2 (`let m: string = match "hi" { x => x }`) | `[]` | `"hi"` |
| f2 | b4 (two arms) | `[]` | `"hi"` |
| f3 | b6 (`+ "a"`) | `[]` | `"hia"` |
| f4 | b8 (array element) | `[]` | `["hi"]` |
| f5 | b10 (object field) | `[]` | `{"s":"hi"}` |
| f6 | b18 (`Ok(x)` pattern) | `[]` | `"a"` |
| f7 | b16 (parameter control) | `[]` | `"hi"` |
| f8 | c2 (condition) | `[]` | success, `"t"` |
| f9 | c6 (method call) | `[]` | THREW: `unknown string stdlib member: frobnicate` |
| f10 | `let x = 1` / `let m = match "hi" { x => x }` / `x` | `[]` | `1` |

f1–f7 establish that each refused row's value satisfies the position the parse
rejected it for. f8 shows the condition row is not a runtime failure either way.
f9 is the disposition `expressions.md:122` assigns to c6's input — a parse
refusal — arriving as a runtime throw instead, which is bug 0136's subject and is
recorded here only as the control's cost. f10 confirms the outer binding is
unchanged by the `match`: the scope-map channel does not leak outward, and what
leaks in group (a) is the marking.

**Committed corpus.** All 34 tracked `.theta` / `.thetalib` files parsed through
the real `parseThetaDocument`: 33 clean, one seeded-invalid
(`tests/fixtures/h7b-invalid/malformed.theta`). Four files contain a `match`
(`docs/examples/handle-error.theta:12`,
`docs/examples/fan-out-reviews.theta:29`,
`docs/examples/configure-tool-loop.theta:8`,
`tests/live/acceptance/fixtures/acc-match-queryerror.theta:7`); **no committed
pattern binder shadows an enclosing binding**, so the corpus blast radius of any
fix is zero. That bounds the corpus half of §Fix (c)'s sweep; it does not
discharge GOV-15, because group (b)'s controls load cleanly today.

## Expected behaviour

**An arm body reads its own binder.** `expressions.md:168` states what an
identifier pattern does — "anything; binds the value to `x`" — and `:53` names a
`match` pattern binding among the constructs that bind locals. `:51` states the
consequence for resolution: "Local bindings (1) shadow everything else lexically,
the same as in Rust or TypeScript." Under that rule the `x` in `match "hi" { x =>
x }` denotes the arm's binder, never the enclosing `let x = 1`. The runtime is
already conformant: `evalMatch` installs the selected arm's bindings into a child
environment before evaluating the body
(`statement-executor.ts:1124–1128`). A static pass that resolves the same
identifier to a different binding is judging a different program.

**The type layer says so in its own comment.** `matchArmScope`'s doc comment
(`type-layer-checks.ts:1189–1201`) states the contract this report measures a
violation of: the arm-body walk and `provableArgType`'s reduction "both resolve
it through here — the two disagreeing about which binding an arm body reads is
the scope mismatch this exists to close." `checkMatchArmTypes` reads the same
bodies six lines away and does not go through it, and neither does any other
consumer of `typeOf`.

**Each refused row sits outside its own registered *Trigger*.**
`code-registry-parse.md:54`'s trigger for `let-rhs-type-mismatch` is an
initialiser "static type that is not compatible with" the annotation; b1's
initialiser produces `"hi"`, which is compatible with `string`. `:75`'s trigger
for `match-arm-type-mismatch` is "a `match` arm's body type is not assignable to
the common type of the other arms"; b3's arms produce `"hi"` and `"z"`. `:36`,
`:40`, `:46` and `:24` read the same way against b5, b7, b9 and b11. Every one of
these is `E`, so the theta does not register — `expressions.md:180`'s
common-upper-bound rule is being applied to types no arm has.

**The deferral the controls exhibit is the correct posture and must survive.**
`type-system.md:48` skips a parse-time check "when either side of a
compatibility check is past the parser's static view". Rows b2, b4, b6, b8, b10,
b12, b16, b18, e2 and e4 are that rule working: with no same-named enclosing
record the arm body's read is unresolvable and every sink defers. The type layer
made that explicit rather than accidental in 0.77.0 by recording every arm binder
WITHHELD (`recordWithheldBinders`, `:1181–1187`) instead of leaving it to miss.
A fix here brings the pass into the same posture; it does not have to answer what
type an arm binder carries in order to stop answering with a different binding's.

**GOV-15 is engaged in the permissive direction only.** Group (b) and rows c1/c5
load cleanly in their control form and are refused in their shadowed form. A fix
removes refusals from inputs that do not load cleanly today, so those inputs are
outside GOV-15's promise set (`source-language-stability.md:9`) and the removal
owes no carve-out. The two rows that ADD nothing and the one that changes a
rendered string (c3) are the whole observable-(b) surface, and the corpus sweep
above measures zero committed inputs in it.

## Actual behaviour / root cause

**One line, and no scope.** `#typeExpr`'s `case "match"`
(`static-type-inference.ts:237–241`) maps `arm.body` through the `bindings`
parameter it was called with. `arm.pattern` is never read, and the pass has no
function that turns a pattern into a scope. The adjacent binder-bearing arm does
have one: `case "par-for"` (`:263–294`) copies the map, records the loop
variable's element type (`:280–281`), and types the body tail in the copy
(`:282–285`). The `match` arm is the only other arm whose sub-expressions run
under a binding the node introduces.

**The record travels out by identity.** The `ident` arm (`:211–216`) returns
`bindings.get(node.name)` — the map's own `CompatType` object. `#commonType`
(`:341–352`) either returns a member of `candidates` found by `find` (`:345–350`)
or `candidates[0]` (`:351`); with one arm both are that object. So for a
single-arm `match` whose body is a bare binder read, `typeOf(match) ===
bindings.get(name)` is true, not merely equal.

**Two consequences follow from that one fact, and they run in opposite
directions.**

1. **Every sink that reads `typeOf(match)` judges against the outer binding's
   type.** `walkStmt`'s `let` arm (`type-layer-checks.ts:947`) feeds
   `checkLetRhsCompat`; `walkExpr`'s `match` arm feeds `checkMatchArmTypes`
   (`:1961`); the boolean, iterand, plus-operand, array-element, object-field and
   method-receiver gates each reach the same seam. Groups (b) and (c) are that
   list, measured. The verdict is not a deferral: `literal integer` is a
   perfectly resolvable operand, so `checkCompatible` answers `compatible` or
   `incompatible` and the row fires.
2. **The marking guard keys on the object, so the outer binding is poisoned.**
   `walkStmt`'s `let` arm computes `initUnprovable` before recording the binding
   (`:1019–1020`) and, on the unprovable branch, adds `rhsType` — the shared
   object — to `unprovableBindings` (`:1052`). `provableArgType`'s `case "match"`
   (`:1671–1688`) is arm-scoped and therefore withholds correctly: the arm-scoped
   read hits the withheld twin, `isProvenReduction` (`:1886–1900`) returns false,
   and the reduction is unproven. Both halves are individually right and their
   composition is not: the object marked as an unprovable READ of `m` is also the
   recorded TYPE of `x`, and `provableArgType`'s `ident` arm (`:1793–1802`) reads
   `unprovableBindings` by identity. Group (a) is the result.

**The deferral floor bounds the damage in one direction.** With no same-named
enclosing binding the arm body's read falls to the `ident` arm's `??` branch and
mints `{ kind: "named", name }`, which resolves to nothing and makes every sink
defer (`type-system.md:48`). A shadow therefore cannot turn a control's emission
into silence at the sinks of consequence 1 — there is no emission to remove —
which is why every row of group (b) has a silent control and why d4's benign
direction (an outer record that happens to satisfy the position) is
observationally identical to its control. Consequence 2 is the one place a
control's emission does disappear (a1 against a2), and it is bounded to a
deferral by `unprovableBindings` having exactly one read site whose only effect
is hit-becomes-withhold.

**The fix bug 0050 shipped closed the walk and not the pass.** `matchArmScope`
was introduced by that fix and wired into two readers — `walkExpr`'s arm walk
(`:1972`) and `provableArgType` (`:1686`). `checkMatchArmTypes`'s `armTypes`
mapping (`:1961`) is byte-unchanged, and the inference pass was not touched at
all. That asymmetry is what makes d1 and d2 disagree, and it is why group (b)'s
rows survive a fix that its own round-7 review recorded as moving sibling rows in
the deferral direction: the rows that moved are the ones whose operand comes
through the walk's `bindings` map, and a `match` expression's own type does not.

**The invoke sink cannot reach any of it.** `collectProvableArgTypes`
(`invoke-static-checks.ts:490–570`) reduces over arm bodies with an empty
bindings map (`:558`), so no outer record is resolvable there. The class is
bounded to the in-layer sinks.

## Why it matters

- **Spec-legal thetas are refused at `E` and do not register.** Six registered
  rows, each measured against a control differing by one line, on programs whose
  values are `"hi"`, `"hia"`, `["hi"]` and `{"s": "hi"}`. `hasLoadParseError`
  (`production-composition.ts:2045–2052`) drops the theta, so the author has no
  runtime to check the claim against.
- **The refusal is caused by a line the message does not mention.** b1 says
  `let binding 'm' initialiser type mismatch: expected string, got integer`. The
  `integer` comes from `let x = 1` several lines up, which the `match` shadows.
  Removing that line makes the theta load; nothing in the diagnostic points at
  it.
- **Three messages name a type the operand does not have.** c1, c3 and c5 emit
  the right code for the right reason and identify the wrong offender. DIAG-4
  (`diagnostic-shape.md:74`) makes the *Message* normative, and category 1's rule
  (`placeholder-rendering-a.md:13`) is to "Render the Theta static type" — the
  rendering is well-formed and the type is another binding's.
- **Two static channels answer differently about one source line.** d1 defers on
  `x.frobnicate()` inside the arm; d2 reports on `x` as the arm's value. Both
  read the same identifier under the same pattern in the same document. An author
  cannot infer a rule from that pair, and neither can a reviewer deciding whether
  a new check should route through `typeOf` or through the walk.
- **A true `fn-arg-type-mismatch` is withheld, and the row was wired for exactly
  that input.** a1 against a2: the argument is the integer `1`, the parameter is
  `string`, and bug 0050 shipped the emitter for that shape one release ago. The
  suppression is not local to the `match` — it persists to every later read of
  the outer binding (a7).
- **Nothing scores it.** Three cells drive a shadowing arm binder (u12b, u12c,
  u13e) and all three assert the fn-arg sink. No test drives one through any of
  the nine other registered rows, so a change to `#commonType`, to the marking
  guard, or to the arm walk moves groups (b)–(e) without reddening anything.

## Non-goals

- **What static type an arm binder should carry.** The type layer records every
  pattern binder WITHHELD (`recordWithheldBinders`,
  `type-layer-checks.ts:1181–1187`) — a deliberate refusal to answer, adopted by
  bug 0050 after its round-6 finding. Deriving a real type (an identifier
  pattern's binder is the scrutinee's type; a constructor pattern's is the
  payload's) is a strictly wider change with its own emission consequences. This
  report claims only that the pass must stop answering with a *different
  binding's* type; §Fix (a) route 1 takes the withheld posture because it is the
  one already adjudicated.
- **The spelling mint when nothing shadows.** d6's `got xs`, c4's `got x` and the
  silence of every control in group (b) come from the `ident` arm's `??` fallback
  minting a `named` from the identifier's own spelling. That is bug 0136's family
  and bug 0126's at the `for` position; a fix here does not touch it, and a fix
  there does not reach this.
- **Which patterns bind.** Bug 0141 owns the capitalised-bare-pattern question.
  Its fix changes the set of names `collectPatternBinderNames` reports; this
  report's defect is what happens to a name once it is reported.
- **`#commonType`'s reduction rule.** Bug 0081 owns the "one branch dominates,
  never the union LUB" finding at `static-type-inference.ts:341–352`. Rows b3,
  b14 and b17 draw `match-arm-type-mismatch` through `leastUpperBound`
  (`match-result.ts:208–235`), which is the same rule in the checker; whether
  that rule should union is 0081's question, and this report's rows are wrong
  under either answer because the arm types are wrong before the reduction runs.
- **Top-level array / object patterns on a non-`Result` scrutinee.** e1 and e3
  raise `theta/runtime/match-error` at runtime. Cited for their parse verdict
  only.
- **The `?`-operand and enum-variant readings of the same node.** Neither is
  reached by the arm scope.
- **`checkMatchArmTypes`'s `sink` parameter.** It is `undefined` at the only call
  site (`type-layer-checks.ts:1962`), so the sink branch (`match-result.ts:176–185`)
  is unreachable in production. That is a separate unwired-parameter question,
  not this defect; a fix here must not silently make it reachable.

## Fix

**Not settled.** Two routes close different amounts of the defect at different
costs, and cell u13e already names both. The report's deliverable is the
disposition plus the answer to (b).

**(a) The two routes.**

1. **Give the pass an arm scope.** Thread the arm's pattern binders into the map
   `#typeExpr` types the body under — the shape `case "par-for"` (`:280–281`)
   already uses at the only other binder-bearing arm. This closes groups (b),
   (c), (d2) and (e) at their source: the arm body's read no longer resolves to
   the outer record, so every sink returns to its control's verdict. It closes
   group (a) as a side effect, because the type the guard marks is then no longer
   the outer binding's object. Consequences to weigh: the pass currently takes no
   dependency on the withheld sentinel, so either it must import
   `WITHHELD_BINDER_TYPE_NAME`'s value from the type layer (a dependency
   direction the layering has so far avoided — `type-layer-checks.ts` imports the
   pass, not the reverse) or the two must agree on a shared constant with its own
   home; and the sentinel's spellability is bug 0143's open subject, so extending
   its reach inherits that adjudication.
2. **Key the marking guard on something other than the recorded object's
   identity.** Give `walkStmt`'s `let` arm (`:1019–1020`, `:1052`) a marking key
   that distinguishes "this `let`'s own unprovable initialiser read" from "the
   object some other binding is recorded under". This closes group (a) alone and
   leaves groups (b)–(e) exactly as measured. Consequences: identity is load-
   bearing elsewhere for a deliberate reason — `resultBindings`
   (`:1024–1041`, bug 0079 §Fix (a)) keys the same way and its comment states why
   a name-keyed side table is wrong — so a new key must not become one; and the
   route leaves the pass judging arm bodies in the wrong scope, so it is a
   containment of one symptom rather than a fix.

Route 1 is the general change and route 2 the narrow one. Route 2 does not
subsume any part of route 1; route 1 subsumes route 2's observable.

**(b) The question route 1 must answer first: what does the arm binder resolve
to inside the pass?** Three answers, with different blast radii:

- **The withheld sentinel** (matching `matchArmScope`). Every sink returns to its
  control's verdict — measured, that is `[]` for groups (b) and (e), and
  `[]` / `got x`-shaped for group (c). This is the smallest step and the one the
  type layer has already adjudicated. It leaves c2, c4, c6 and b12 missing owed
  emissions, which is the deferral the controls already exhibit and not a new
  loss.
- **A nominal minted from the binder's spelling** (matching the `ident` arm's
  `??`). Observationally the same as the sentinel wherever no declaration shares
  the spelling, and adopts an unrelated declaration where one does — d6's shape,
  which is bug 0136's open defect. Rejected unless 0136 lands first.
- **The scrutinee's type for an identifier pattern** (and the payload's for a
  constructor pattern). The only route that turns c2/c4/c6 into emissions and b12
  into a `let-rhs-type-mismatch`. It engages GOV-15 in the ADDITION direction and
  needs its own witness at each of the nine rows; §Non-goals places it outside
  this report.

**(c) Constraints any route preserves**, each with a witness row above:

- **The controls stay silent.** b2, b4, b6, b8, b10, b12, b16, b18, e2 and e4 are
  `type-system.md:48`'s deferral. A route that makes an unrecorded binder
  resolvable to anything breaks them.
- **d4 stays silent for the RIGHT reason afterwards.** Today it passes because
  the outer record happens to satisfy the position. After a fix it must defer, not
  pass — an observationally identical cell whose mechanism changed, so its
  assertion needs the reason written into it.
- **d3 and d7 stay `[]`.** A `for` variable is already withheld
  (`type-layer-checks.ts:1102`) and a frontmatter `params:` field never reaches
  `bindings`; neither may become a leak path.
- **d5 stays `[]` and copies no map.** `matchArmScope`'s empty-name branch
  (`:1208–1210`) is the model: a wildcard or literal pattern binds nothing and
  must not allocate a scope.
- **The `par for` arm is unchanged.** `#typeExpr:280–281` records a real element
  type, not a withheld entry, and bug 0089's group (n) reds on binding a type to
  the plain `for` variable. A route that unifies the two binder arms must say so
  and carry that witness.
- **The invoke sink stays empty-mapped.** `invoke-static-checks.ts:558`'s empty
  `bindings` is deliberate; a fix must not thread a populated map there as a side
  effect of sharing a helper.
- **GOV-15 needs no carve-out in the removal direction**, and the corpus sweep
  measures zero affected committed files. Re-run it rather than assume it, and
  read [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) first —
  the committed-fixture gate does not walk `.thetalib`.
- **No registry edit.** Every code involved is registered with an accurate
  *Trigger*; the rows fire on inputs outside it. DIAG-2 (`diagnostic-shape.md:72`)
  is not engaged, and no *Message* template changes, so DIAG-4 is not either.

**(d) Ordering and coordination.**

- **Bug 0050 is fixed and is not a prerequisite**, but its witness is the
  coordination surface. Cell u13e
  (`tests/fn-arg-type-mismatch-wired.test.ts:2694–2724`) asserts group (a) row
  a1's `[]` and names both routes as its flip conditions; either route reds it by
  design, and the cell must be restated with its reason rather than deleted. The
  file is 84 cells and green at HEAD.
- **Bug 0081 shares `#commonType`'s neighbourhood.** Route 1 changes the
  candidates that reach `:341–352`; 0081 changes what the function does with
  them. Neither presupposes the other, and whichever lands second rebases.
- **Bugs 0126, 0136 and 0141 share the substrate and none of the three proposes
  changing the `match` arm.** If this report takes route 1 the arm is touched and
  the four remain independent at the file level; the one place they meet is d6,
  whose disposition 0136 owns.
- **Bug 0143 binds route 1** if the withheld sentinel's value crosses into the
  pass.

**Witness — offline, provider-free.** Every row of §Reproduction (a)–(e) settles
inside one `parseDoc` call, so the harness is a new file on the shape of
`tests/fn-arg-type-mismatch-wired.test.ts`: same frontmatter, whole-list
`toEqual` on codes and messages, every expected message sourced from the registry
(DIAG-4) rather than copied, and loud range preconditions so no absence cell can
pass while measuring nothing. Required rows: all of (b) with its ten controls —
they are the fix's whole observable; all of (c), including c4, whose rendered
`got x` must be asserted unchanged so a route that closes this defect and leaves
the mint is visible as such; d1 and d2 as the divergence pair, asserted together
in one cell so a fix cannot close one and leave the other; d3, d4, d5 and d7 as
the non-leak controls, each carrying its reason; (e) for the array and object
binder classes; and (a) as it stands in u13e, restated. Group (f)'s runtime rows
belong in the witness too — the production executor harness
(`tests/non-object-receiver-gate.test.ts:186–292`) — because "the runtime returns
`"hi"`" is what makes the refusals false, and a parse-only witness cannot say so.
One further row no group above supplies: an assertion that `checkMatchArmTypes`'s
`armTypes` mapping and `walkExpr`'s arm walk resolve the same scope for the same
node, so a future reader added to that arm cannot silently take the enclosing map
again. No live tier applies: nothing on this path crosses a provider, and every
observable is determined inside one parse or one `executeBody`.

## Provenance

- **Origin:** the bug 0050 fix (0.77.0, commit `3efdb4ac`). Its round-7 review
  (`.pi/tmp/fixes/0050-review-round7.md` §R1) classified the marking-channel
  identity leak and reproduced rows L1–L5 plus the `L1-tern` / `L1-idx` direction
  controls, which are group (a)'s a1–a6 here; its §R2 recorded that
  `checkMatchArmTypes`'s arm-body reads "stay in the enclosing scope,
  byte-unchanged". Bug 0050's §Fix (0.77.0) *Residuals* names this filing: "the
  marking-channel identity leak is bug 0145's root". This report adds what those
  records do not state: groups (b), (c), (d) and (e) — the nine registered rows
  reached through `typeOf(match)` rather than through the marking channel, with
  their controls; the d1/d2 divergence pair; the runtime dispositions in group
  (f); the deferral-floor bound that classifies the whole channel as
  refusal-direction; the corpus sweep; and the two routes with their
  consequences and the (b) question route 1 must answer.
- **Evidence:** scratch vitest at `3efdb4ac` — parse rows through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  runtime rows through the production executor harness
  (`tests/non-object-receiver-gate.test.ts:186–292`). Every cell of groups
  (a)–(f) measured and quoted verbatim above; written, run, deleted. Row a1
  additionally reproduces as the committed cell u13e of
  `tests/fn-arg-type-mismatch-wired.test.ts`, which passes 84/84 at HEAD.
- **Implementation, at `3efdb4ac`:**
  `src/parser/static-type-inference.ts:20–24` (the module posture), `:182–188`
  (`typeOf`), `:197` (`#typeExpr`), `:211–216` (the `ident` identity return),
  `:237–241` (the defect site), `:242–244` (the `member` arm, bug 0136's),
  `:263–294` (`par-for`; the scope extension `:280–281`), `:341–352`
  (`#commonType`; the fallback `:351`);
  `src/parser/type-layer-checks.ts:387` (`WITHHELD_BINDER_TYPE_NAME`),
  `:657–679` (`collectPatternBinderNames`), `:906` (`unprovableBindings`),
  `:924–927` (the `typeOf` delegate), `:947` (the `let` RHS read), `:1019–1020`
  and `:1052` (the marking guard), `:1071–1104` (`walkStmt`'s `for` arm; the
  withheld record `:1102`), `:1181–1187` (`recordWithheldBinders`), `:1189–1214`
  (`matchArmScope` and its contract comment), `:1671–1688`
  (`provableArgType`'s `match` arm), `:1780–1782` (the `params:` note),
  `:1793–1802` (the `ident` arm's marking read), `:1886–1900`
  (`isProvenReduction`), `:1958–1974` (`walkExpr`'s `match` arm; the enclosing-
  scoped `armTypes` `:1961`, the arm-scoped walk `:1972`);
  `src/parser/match-result.ts:165–194` (`checkMatchArmTypes`; the sink branch
  `:176–185`, the LUB branch `:187–193`), `:197–205` (`mismatchDiagnostic`),
  `:214–238` (`leastUpperBound`);
  `src/runtime/statement-executor.ts:1091–1129` (`evalMatch`; the child scope
  `:1124–1127`, the body evaluation `:1128`);
  `src/runtime/match-result.ts:177–179` (the identifier pattern's bind);
  `src/extension/invoke-static-checks.ts:484–570` (`collectProvableArgTypes`;
  the `match` arm `:500–505`, the empty map `:558`);
  `src/extension/production-composition.ts:2045–2052` (`hasLoadParseError`).
- **Spec:** `docs/spec_topics/expressions.md:46`, `:51`, `:53`, `:168`, `:174`,
  `:178`, `:180`; `docs/spec_topics/type-system.md:27`, `:48`, `:50`;
  `docs/spec_topics/control-flow.md:13`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:24`, `:34`, `:36`, `:40`,
  `:46`, `:54`, `:63`, `:64`, `:75`, `:116`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71`, `:72`, `:74`;
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:9–21`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`. Mirrors:
  `docs/reference/diagnostics.md:70`, `:80`, `:82`, `:86`, `:92`, `:100`,
  `:109`, `:110`, `:124`, `:165`.
