# Bug 0199 — `walkStmt`'s `let` arm marks `unprovableBindings` with the object `typeOf(stmt.init)` returned (`type-layer-checks.ts:1134–1143`, the `initUnprovable` branch), and for a member-read initialiser that object is BORROWED — the one-per-parse declared-field `CompatType` `collectSchemaFields` builds (`:830`) and bug 0190's `declaredFieldType` hands back by reference (`static-type-inference.ts:372`) — so one `let zs = m.xs` off an ERASED receiver silences the true `theta/parse/fn-arg-type-mismatch` that a LATER `let ws = q.xs` over a proven `q: P` owes at `hs(ws)`: measured `[]`, where deleting the `let zs` line emits `expected array<string>, got array<integer>`; the mark is scope-free, crosses `fn` boundaries into top-level statements, and lands on a primitive declared field as readily as on a whole array

- **Status:** fixed (0.120.0). §Fix was constraint-pinned rather than settled —
  three routes with their measured costs, the run adjudicating which object the
  withhold is keyed by against one measurement that decides the cheapest route's
  shape (§Reproduction (e1)). **Route 1 shipped**; see `## Fix (0.120.0)`.
  Ordering: this report's own claim that it "blocks nothing" was falsified in the
  fix run — it shares witness cell `u13e` with open bug
  [0145](./0145-inference-pass-no-match-arm-scope.md), whose §Fix (d) reserved
  that cell's restatement, and the fix discharges 0145's §Reproduction group (a);
  both are recorded in `## Fix (0.120.0)`. Bug
  [0194](./0194-unprovable-marking-by-object-identity-shared-alias-element.md)
  (fixed 0.113.0) already shipped the loop arms' remedy, so the mechanism a fix
  here extends is in the tree (`bindLoopElement`, `type-layer-checks.ts:1330–1346`)
  rather than to be designed. A fix here also **flips cell `d6`** of
  `tests/loop-element-withhold-binding-scoped.test.ts:1086–1109` (with its
  control `d6ctl`, `:1111–1126`), which pins this defect's end state as a BOUND;
  the flip is this report's to authorise, because 0194's `## Fix (0.113.0)`
  installed `d6` for that purpose and named the `let` arm out of its own scope.
- **Sev/Diff estimate:** S1/D3 — S1 because a registered `E`-severity refusal
  whose *Trigger* the input satisfies in every particular is withheld on every
  channel and the theta registers: the row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:120`) states that no
  runtime AJV net backstops the function-argument position, an error-severity
  `theta/parse/*` is what denies registration
  (`production-composition.ts:2214–2221`), and §Reproduction (a) row 1 loads
  clean — the same observable class and the same code as 0194, at a different
  writer. D3 because §Fix needs in-run adjudication across three routes; because
  the marking site is entangled with bug 0079's `resultBindings` channel (the
  `let` arm is the only site that MINTS a membership, `:1132`, and the mint and
  the mark consume the SAME object, `:1143`), so the cheapest route must carry
  and re-point a second identity channel and is measured to drop a registered
  `E` if it does not (§Reproduction (e1)); because the deeper source —
  by-reference return from `#memberType` (`static-type-inference.ts:372`) and
  from `commonType`'s dominating-candidate clause (`type-compat.ts:673–681`) — is
  what 0079's own provenance mechanism depends on (§Reproduction (e4)), so the
  widest route cannot be taken without replacing that channel; and because the
  change adds `E` emissions to programs that load cleanly today and flips a
  committed witness cell.
- **Kind:** defect — implementation. One element: the object the mark lands on.
  `unprovableBindings` is a `Set<CompatType>` (`:997`) whose only read is
  `this.unprovableBindings.has(recorded)` in `provableArgType`'s `ident` arm
  (`:2009`), so the channel is JavaScript object identity. Its field comment
  (`:974–996`) states the warrant — "`bindings.get(name)` returns the exact
  object the recording arm stored, so identity is the channel back to an erasure
  a name lookup alone cannot see" — and enumerates four writers. Three keep it:
  `recordWithheldBinders` (`:1381`) marks the sentinel it mints, and the two loop
  arms mark a fresh twin since 0194 (`bindLoopElement:1338`). The fourth, the
  unannotated `let` arm (`:1143`), marks `rhsType` — whatever
  `typeOf(stmt.init)` returned (`:1038`). For a member read that is the receiver
  schema's declared-field object: `collectSchemaFields` builds exactly one
  `CompatType` per declared field per parse (`:830`, `:832`) and `#memberType`'s
  declared branch returns it, alias-unfolded, BY REFERENCE
  (`static-type-inference.ts:372`). The mark therefore lands on the field rather
  than on the binding, and every later binding that records the same field's type
  tests positive. The failure direction is one-way: the set's only read feeds
  withholding decisions (`checkFnCallArgs` skips its row, `:1809–1814`), so a
  spurious identity hit removes a true positive and can never fabricate a false
  `E`.
- **Related** (each status verified at HEAD):
  - [0194](./0194-unprovable-marking-by-object-identity-shared-alias-element.md)
    — **fixed (0.113.0)**, the origin and the same class. Its subject was the two
    LOOP arms marking `unfoldAlias(iterand).element`, a borrowed object for the
    same reason; its §Fix route 1 (copy on mark) shipped at both arms through the
    shared `bindLoopElement`, with a `resultBindings` provenance carry
    (`:1342–1344`) that review round 1 proved load-bearing. Its §Fix *Residuals*
    item 1 (`:1035–1052`) records this defect with the measurement this report
    re-derives, item 2 (`:1053–1061`) records the by-reference return as the
    deeper source, and its `## Fix (0.113.0)` carries the excluded-on-three-grounds
    adjudication that scoped it out. Cell `d6` of its witness is this report's
    in-tree pin.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the owner of the machinery. Its fix wired
    `checkFnArgCompat` behind `provableArgType`, introduced both identity sets,
    and established the posture this defect inherits: withholding at the sink
    "can only suppress an emission" (`:1809–1814`). The suppressed code is 0050's
    own row, and the posture is correct — the `let` arm SHOULD withhold its own
    unproven binding (§Reproduction (d7)).
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the sibling identity channel and this report's tightest
    constraint. `resultBindings` (`:972`) is keyed by object identity for the
    same stated reason, is MINTED only at this arm (`:1132`), and is read by
    `interpolationIsResult`'s `ident` arm (`:2458–2460`). Its 49-cell witness
    (`tests/interpolated-result-gate.test.ts`) is protected; the shape this
    report's routes touch — a binding that inherits the membership by sharing one
    object — has no cell in it (§Fix (d) constraint 4).
  - [0190](./0190-fn-arg-sink-withholds-provable-member-reads.md) — **fixed
    (0.111.0)**, and what turned this arm live. It made a member read of a
    declared field on a resolved object schema a PROOF
    (`provableArgType`'s `member` arm, `:2077–2079`, gated on the receiver being
    itself proven) and supplies the proven read through `declaredFieldType`
    (`static-type-inference.ts:205–212`), which returns the borrowed object. At
    0194's filing baseline (0.107.0) the arm returned `undefined` for every
    member read, so a victim `let ws = q.xs` was withheld on its own account and
    the leak was unobservable — 0194 measured the `let` arm INERT there. Its
    receiver-proof obligation is also what keeps the poisoner unprovable at HEAD:
    an erased ternary receiver is not a proven reduction, which is the shape
    §Reproduction uses. 0190's fix is correct and this report does not contend
    with it.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **fixed (0.107.0)**, the
    family's first filing surface. Its §Fix *Residuals* item 4 opened the
    object-identity line that produced 0194 and this report; its own witness cell
    `e4` (`tests/plain-for-loop-variable-element-type.test.ts`) is a loop-arm pin
    and is untouched here.
  - [0193](./0193-withheld-binder-gates-lost-last-pinning-cells.md) — **open**,
    and unrelated in subject: it is the verification-gap family over withheld
    binder gates, not the identity channel. Named so the adjacency is on record;
    no fixture, cell, or code path is shared with this report.
- **Affected** (every citation verified at HEAD `a7d15562`, 0.113.0.
  `src/parser/type-layer-checks.ts` is 2780 lines and any fix here moves its line
  numbers, so each site is named by SYMBOL beside its line):
  - `src/parser/type-layer-checks.ts` — `walkStmt`'s `case "let"` (`:1036`),
    **the defect site**. `:1038` `const rhsType = this.typeOf(stmt.init,
    bindings)` — the borrowed object arrives here. `:1110–1111` the
    `initUnprovable` verdict, `annotation === undefined && this.provableArgType(
    stmt.init, bindings) === undefined`, resolved before the `bindings.set` so a
    self-reference reads the outer binding. `:1112–1115` records
    `stmt.name` → `rhsType` for an unannotated `let`. `:1116`/`:1132` the
    `resultBindings` MINT (`isCertainResultNode(stmt.init)`), over the same
    `rhsType`. `:1134–1144` the marking branch and `:1143`
    `this.unprovableBindings.add(rhsType)` — the defect. The comment at
    `:1135–1142` states the intent the identity key defeats: the mark is for
    "`rhsType`, already bound to `stmt.name` above". True of what the arm
    RECORDS, false of what it MARKS whenever `typeOf` borrowed.
  - `src/parser/type-layer-checks.ts:997` — **the channel**,
    `private readonly unprovableBindings = new Set<CompatType>()`; `:974–996` its
    doc comment, which asserts the identity contract, enumerates the four
    writers, and already states the borrowed-object hazard for the two loop arms
    without extending the sentence to this one. `:972` and `:963–971` —
    `resultBindings`, the sibling identity set fed at `:1132`. These two are the
    only `Set<CompatType>` in `src/` and there is no `Map<CompatType, …>`
    (measured: a repository-wide grep returns `:972`, `:997` and one doc-comment
    mention at `:1291`), so exactly two identity channels consume what this arm
    records.
  - `src/parser/type-layer-checks.ts:2009` — **the only read**,
    `provableArgType`'s `ident` arm (`:1969`): `const recorded =
    bindings.get(expr.name)`, then `return this.unprovableBindings.has(recorded)
    ? undefined : recorded`. `:1854` — `provableArgType`.
  - `src/parser/type-layer-checks.ts:1775` — `checkFnCallArgs`, the only consumer
    that emits. `:1808` reads `provableArgType`; `:1809–1814` skips the row on
    `undefined` with the comment "withholding here can only suppress an
    emission"; `:1815–1825` is the emission that does not happen.
  - `src/parser/type-layer-checks.ts:2077–2079` — bug 0190's `member` /
    `method-call` arm: `provableArgType(expr.target) === undefined ? undefined :
    this.pass.declaredFieldType(expr, this.env, bindings)`. Both halves of this
    report's fixture come from here — the poisoner is withheld (erased receiver),
    the victim is proven (annotated receiver) and its proof IS the borrowed
    object. `:2080–2104` — the `call` / `invoke` arm, an unconditional withhold;
    `:2105–2114` — the `query` / `object` / `result-ctor` / `par-for` arm, which
    answers `this.typeOf(expr, bindings)` and so treats those four as proofs.
  - `src/parser/type-layer-checks.ts:1330–1346` — `bindLoopElement`, 0194's
    shipped remedy and the model a route here extends: `:1337` the verdict,
    `:1338` `const recorded: CompatType = unproven ? { ...element } : element`,
    `:1341` the mark on the twin, `:1342–1344` the `resultBindings` carry that
    inherits a membership onto the twin without minting one. Callers `:1203`
    (`walkStmt`'s `case "for"`) and `:2312` (`walkExpr`'s `case "par-for"`). The
    `let` arm has no equivalent, and its obligations are a superset: it MINTS
    into `resultBindings` as well as inheriting.
  - `src/parser/type-layer-checks.ts:2450` — `interpolationIsResult`; `:2458–2460`
    its `ident` arm, `this.resultBindings.has(type) ||
    this.isResultGenericType(type)`. `:2484–2493` — `isCertainResultNode`: a
    `result-ctor`, or a `call` to a `fn` whose written return annotation names a
    `Result`. The second form is BOTH minted here and unprovable at `:2080–2104`,
    which is what §Reproduction (e1) measures.
  - `src/parser/type-layer-checks.ts:822–843` — **why the object is shared**,
    `collectSchemaFields`: one `annotationToCompatType` call per declared field
    (`:830`), stored once (`:832`), for the whole parse. `:382` — its single call
    site in `collectTypeEnv` (`:361`). `:846` — `annotationToCompatType`, which
    allocates on every return path and interns nothing; that is why two DISTINCT
    schemas declaring the same field shape do not collide (§Reproduction (d3))
    and one schema read twice does.
  - `src/parser/static-type-inference.ts:359–376` — `#memberType`; `:372`
    `return { type: unfoldAlias(fields[node.field] as CompatType, env), declared:
    true }` — the borrowed object, returned by reference and alias-unfolded, so a
    field declared as an ALIAS of `array<T>` yields the `TypeEnv`'s own alias
    right-hand side (`type-compat.ts:169`) and an inline field type yields
    `collectSchemaFields`' own object. `:205–212` — `declaredFieldType`, 0190's
    proof supplier over the same call. `:267` — `#typeExpr`'s `case "member"`;
    `:235–240` — its `ident` arm, `bindings.get(node.name) ?? …`, which is how a
    later read gets the recorded object back.
  - `src/parser/static-type-inference.ts:434–439` — `#commonType`, whose
    `?? (candidates[0] as CompatType)` fallback (`:438`) returns a candidate by
    reference; `:241–247` the array-literal element derivation and `:250–257` the
    ternary, both of which route through it. `src/parser/type-compat.ts:665–686`
    — `commonType`; `:673–681` the dominating-candidate clause, which returns its
    candidate BY REFERENCE. This is the deeper source 0194 recorded as its
    residual 2, measured one step further here (§Reproduction (e4)).
  - `src/parser/type-compat.ts:155–172` — `unfoldAlias`; `:169` `current =
    decl.rhs`, the env's own object by reference. `:461–489` —
    `checkFnArgCompat`, the emitter that is never reached.
  - `src/parser/type-layer-checks.ts:263–290` — `checkTypeLayer`: `:269` builds
    the env once, `:280` constructs ONE `TypeLayerWalk`, `:289` walks the whole
    body. `unprovableBindings` is per-parse instance state, so a mark taken in
    one `fn` is live for every statement the walk visits afterwards
    (§Reproduction (c)). The scope copies — `:1154`, `:1160`, `:1180`, `:1246`,
    `:1248`, `:1411`, `:1417`, `:2309` — bound a NAME's visibility; the set has
    no scope at all (§Reproduction (c4)).
  - `src/parser/type-layer-checks.ts:442` — `containsWithheldBinderType`, the
    VALUE channel, read by the typed-`let` sink at `:1057`. It is untouched here,
    which is why the poisoned victim still draws
    `theta/parse/let-rhs-type-mismatch` (§Reproduction (d6)) and why exactly one
    registered code is suppressed.
  - `src/extension/production-composition.ts:2214–2221` — `hasLoadParseError`:
    any error-severity `theta/parse/*` blocks registration. Call sites `:1496`,
    `:1918`, `:2102`, `:2261`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:120` — the suppressed
    row, `theta/parse/fn-arg-type-mismatch`, severity `E`, whose *Trigger* the
    measured input satisfies and which states "no runtime AJV safety net
    applies". `:74` — `theta/parse/interpolated-result`, the `E` the cheapest
    route is measured to drop if it does not carry provenance.
  - `docs/spec_topics/type-system.md:27` — the closed list of positions `⊑`
    governs, a function-argument slot among them; `:50` — TYPE-9, which routes a
    static failure there to `theta/parse/fn-arg-type-mismatch`; `:48` —
    *Unresolvable operands*, the only deferral licence available; `:54` —
    TYPE-11, which makes an alias field type its right-hand side.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15 and its
    observable (b); `:9` — the loads-cleanly predicate; `:25` — the
    *Diagnostic-registry carve-out*.
  - `tests/loop-element-withhold-binding-scoped.test.ts:1086–1109` — cell `d6`,
    0194's pin of THIS defect as a bound, with `d6ctl` (`:1111–1126`) as its
    delete-control; the fixture preamble is `PRE_LET_ARM` (`:623–629`). The two
    cells are green in both directions today and are the cells a fix flips.
    `:1071` — cell `d5`, which pins the withhold's correct half (an unproven
    binding's own read stays withheld) and must stay green.
  - `tests/fn-arg-member-read-proof.test.ts:770–782` — cell `L2` (fixture
    `C_L2`, `:748`), bug 0190's BOUND for the same arm one binding on: `let v =
    m.s` off an erased receiver then `g(v)` is CLEAN, and must remain CLEAN. It
    is the closest in-tree cell to this report's poisoner and pins the half that
    is correct.
  - `tests/interpolated-result-gate.test.ts` — bug 0079's 49-cell witness. Its
    `(a1)`–`(a3)` rows pin a direct `Result` binding's interpolation; **no cell
    drives a binding that inherits the membership from another binding** (`let c
    = r`), which is the shape §Reproduction (e1)–(e3) measures and the shape a
    route must not sever.
  - `tests/loop-element-withhold-binding-scoped.test.ts` group `(e)`
    (`:1169–1213`) — 0194's four cells pinning the `resultBindings` carry at the
    loop arms. They stay green under every route below and are the precedent for
    the carry a `let`-arm route needs.
  - **Test coverage of this defect: cell `d6` and its control, and nothing
    else.** No cell asserts the emission this report says is owed; `d6` asserts
    the silence as a bound. Measured by a fixture-text sweep over
    `tests/*.test.ts` with `\n` escapes expanded: `d6` and `d6ctl` are the only
    cells that drive two unannotated `let`s off one declared field. Seven test
    files hold a ternary-or-`match` fixture whose arms are schema constructors —
    the poisoner shape — and are the surface a fix re-derives:
    `tests/array-ternary-common-type-union.test.ts`,
    `tests/fn-arg-member-read-proof.test.ts`,
    `tests/fn-arg-type-mismatch-wired.test.ts`, `tests/invocation-core.test.ts`,
    `tests/loop-element-withhold-binding-scoped.test.ts`,
    `tests/nested-control-in-pure-position.test.ts`, and
    `tests/live/live-production-acceptance.test.ts`.
  - **Committed corpus: unaffected, measured.** Of the 34 committed `.theta` /
    `.thetalib` files (`git ls-files`), **none contains a member read of any
    shape** — no `let` off a `receiver.field`, and no member access anywhere — so
    no committed file satisfies the precondition. Eleven declare a `schema`; none
    reads a field off one. `tests/committed-fixture-parse-gate.test.ts` is the
    corpus-wide discharge per `AGENTS.md`.
- **Observed at:** `0.113.0` (HEAD `a7d15562`, the 0194 fix commit). Offline,
  deterministic; no live model, no provider. Scratch vitest driving the real
  `parseThetaDocument` through the shared `parseDoc` harness
  (`tests/helpers/e2e-s1.ts:39`); 36 rows measured, the 31 recorded in
  §Reproduction (a)–(e) below plus five duplicates and shapes whose verdict adds
  nothing to a row already there. Written, run, deleted. Every `path:line` below
  was re-derived
  against the tree at this HEAD rather than copied from 0194's 0.107.0-baseline
  citations.

## Summary

`unprovableBindings` (`src/parser/type-layer-checks.ts:997`) is a
`Set<CompatType>` whose membership test is object identity (`:2009`). Three of
its four writers mark an object they own: `recordWithheldBinders` marks the
sentinel it mints (`:1381`), and both loop arms mark a fresh twin since bug 0194
(`bindLoopElement:1338`). The unannotated `let` arm marks `rhsType` — the object
`typeOf(stmt.init)` returned (`:1038`, `:1143`).

For a member-read initialiser that object is borrowed. `collectSchemaFields`
builds one `CompatType` per declared field per parse (`:830`, `:832`), and
`#memberType`'s declared branch returns it by reference, alias-unfolded
(`static-type-inference.ts:372`). So the mark lands on the FIELD. Every later
binding that records the same field's type — another unannotated `let` off a
proven receiver of the same schema — gets the same object back from
`bindings.get`, tests positive at `:2009`, and has its argument row skipped at
`:1809–1814`.

Measured, with `schema L = array<integer>`, `schema P { xs: L }`,
`schema B { xs: array<string> }` and `fn hs(a: array<string>)`:

```
fn f(flag: boolean, q: P) {
  let m = flag ? P { xs: [1] } : B { xs: ["a"] }   // erased receiver
  let zs = m.xs                                   // unprovable → marks P.xs
  let ws = q.xs                                   // proven → records P.xs
  hs(ws)
  1
}
                                                  → []
```

Deleting the `let zs` line emits `error theta/parse/fn-arg-type-mismatch :: fn
'hs' argument 0 ('a') type mismatch: expected array<string>, got
array<integer>`. Moving `hs(ws)` above the `let zs` line emits it. Removing the
erased receiver emits it. The victim's own read is a proof in every route the
code takes to it — bug 0190 (0.111.0) made a declared-field read off a proven
receiver provable, which is what turned this arm from inert into live: at 0194's
baseline the victim was withheld on its own account, so the leak had no
observable.

Three properties make the suppression hard to attribute, and they are 0194's:
it is **order-dependent** (only bindings after the marking one are affected), it
reaches **the whole document** (`unprovableBindings` is per-parse instance state
on the single `TypeLayerWalk` that `checkTypeLayer:280–289` walks the body with,
so the mark crosses `fn` boundaries, escapes nested block scopes, and reaches
top-level statements), and it is **silent** (the only read feeds withholding, so
nothing is emitted on any channel at any severity).

Two properties are this report's own. The marked object is a **whole declared
field type**, not a loop element, so it suppresses at whole-value argument slots
and does not reach a later loop's element (§Reproduction (d2)); and the shared
object need not be an array — a primitive declared field shares identically
(§Reproduction (b3)).

The failure direction is the admissible one. The set is read once, that read
feeds withholding decisions only, and `checkFnArgCompat` (`type-compat.ts:461`)
is the sole emitter downstream — so a spurious identity hit removes a true
positive and can never fabricate a false `E`, change a message, or change a
range. Exactly one registered code is reachable through the channel; the sibling
typed-`let` sink reads the map by VALUE (`containsWithheldBinderType`, `:442`)
and is measured unmoved (§Reproduction (d6)).

## Reproduction

Offline at `a7d15562`. Every row is one `parseThetaDocument` call over a source
string with frontmatter `mode: prompt`; the trailing `1` supplies the theta's
final value. `→` lists the whole `diagnostics` array in emission order,
unfiltered. `[CTL]` marks a control. `MISMATCH` abbreviates
`error theta/parse/fn-arg-type-mismatch :: fn 'hs' argument 0 ('a') type
mismatch: expected array<string>, got array<integer>`.

Rows share this preamble unless stated otherwise:

```
schema L = array<integer>
schema P { xs: L }
schema B { xs: array<string> }
fn hs(a: array<string>) { 1 }
```

### (a) The suppression and its three controls

```
a1  the subject
fn f(flag: boolean, q: P) {
  let m = flag ? P { xs: [1] } : B { xs: ["a"] }
  let zs = m.xs
  let ws = q.xs
  hs(ws)
  1
}
  → []

a2  the same, with the sink written as a binding (`let r = hs(ws)`)
  → []

a3 [CTL] the `let zs` line deleted
fn f(flag: boolean, q: P) {
  let m = flag ? P { xs: [1] } : B { xs: ["a"] }
  let ws = q.xs
  hs(ws)
  1
}
  → MISMATCH  @13:6-13:8

a4 [CTL] every statement kept, the victim moved above the poisoner
fn f(flag: boolean, q: P) {
  let m = flag ? P { xs: [1] } : B { xs: ["a"] }
  let ws = q.xs
  hs(ws)
  let zs = m.xs
  1
}
  → MISMATCH  @13:6-13:8

a5 [CTL] no erased receiver at all
fn f(q: P) {
  let ws = q.xs
  hs(ws)
  1
}
  → MISMATCH  @12:6-12:8
```

`a4` is the sharper control: the same five statements, the same declarations, the
same two member reads — only the order differs, and the order decides whether a
registered `E` is reported. The operands of the judged row are identical across
all four.

### (b) Which shared objects reach the mark

The mark lands on whatever `typeOf` returned. Three field shapes are measured;
none involves a loop, and one involves no alias and no array.

```
b1  a field declared as an ALIAS of array<integer>  (row a1's preamble)
    the shared object is the TypeEnv's alias right-hand side: `#memberType`
    returns `unfoldAlias(fields["xs"])` (static-type-inference.ts:372) and
    `unfoldAlias` returns `decl.rhs` by reference (type-compat.ts:169)
  → []                                                        (= a1)

b2  a field declared INLINE, one schema read twice — no alias anywhere
schema P { xs: array<integer> }
schema B { xs: array<string> }
fn hs(a: array<string>) { 1 }
fn f(flag: boolean, q: P) {
  let m = flag ? P { xs: [1] } : B { xs: ["a"] }
  let zs = m.xs
  let ws = q.xs
  hs(ws)
  1
}
  → []
[CTL] the `let zs` line deleted
  → MISMATCH  @12:6-12:8

b3  a PRIMITIVE declared field — the shared object is not an array
schema P { n: integer }
schema B { n: string }
fn gs(s: string) { 1 }
fn f(flag: boolean, q: P) {
  let m = flag ? P { n: 1 } : B { n: "a" }
  let zs = m.n
  let ws = q.n
  gs(ws)
  1
}
  → []
[CTL] the `let zs` line deleted
  → error theta/parse/fn-arg-type-mismatch :: fn 'gs' argument 0 ('s') type
    mismatch: expected string, got integer  @12:6-12:8
```

`b2` isolates `collectSchemaFields` as the sharing site independently of
aliases; `b3` shows the class is any declared field's `CompatType`, so the
suppression is not confined to array-typed arguments.

### (c) Reach — how far one mark travels

```
c1  across fn boundaries
fn poison(flag: boolean) {
  let m = flag ? P { xs: [1] } : B { xs: ["a"] }
  let zs = m.xs
  1
}
fn f(q: P) { let ws = q.xs   hs(ws)   1 }
  → []

c2  into top-level statements
fn poison(flag: boolean) { … let zs = m.xs … }
let q = P { xs: [1] }
let ws = q.xs
hs(ws)
  → []
[CTL] the same three top-level statements without `fn poison`
  → MISMATCH  @12:4-12:6

c3  every later binding, not only the next  (q: P, r: P)
  let zs = m.xs / let ws = q.xs / hs(ws) / let vs = r.xs / hs(vs)
  → []                                    (both sinks silent)

c4  the poisoner inside an `if` block, the victim after the block
  if flag { let zs = m.xs }
  let ws = q.xs
  hs(ws)
  → []
  The scope copy at `:1154` bounds the NAME; the set has no scope.

c5  the victim inside a nested block, the poisoner outside
  let zs = m.xs
  if flag { let ws = q.xs   hs(ws) }
  → []

c6  transitively, through an unannotated launder
  let zs = m.xs / let ws = q.xs / let vs = ws / hs(vs)
  → []

c7  a composite poisoner — one erased arm is enough
  let zs = flag ? m.xs : q.xs
  let ws = q.xs
  hs(ws)
  → []
```

### (d) What the mark does NOT reach

```
d1  an annotated fn parameter as the victim
fn f(flag: boolean, ys: L) { let m = … / let zs = m.xs / hs(ys) / 1 }
  → error theta/parse/fn-arg-type-mismatch :: fn 'hs' argument 0 ('a') type
    mismatch: expected array<string>, got L  @13:6-13:8
  `walkFn` records an annotated parameter as a fresh `annotationToCompatType`
  object, which nothing marked.

d2  a later LOOP over the same alias
fn f(flag: boolean, q: P, ys: L) { let m = … / let zs = m.xs /
                                   for b in ys { g(b) } / 1 }
  → error theta/parse/fn-arg-type-mismatch :: fn 'g' argument 0 ('s') type
    mismatch: expected string, got integer  @14:7-14:8
  The `let` arm marks the WHOLE array object; a loop records
  `unfoldAlias(iterand).element`, a different object. This is the axis that
  separates this defect from 0194's, in both directions.

d3  two DISTINCT schemas declaring the same field shape
schema P { xs: array<integer> } / schema Q { xs: array<integer> }
  poisoner off an erased `P`/`B`, victim off `q: Q`
  → MISMATCH  @14:6-14:8
  `annotationToCompatType` allocates per call, so the two fields are two objects.

d4  sharing alone, with no mark  (two PROVEN receivers of one schema)
fn f(p: P, q: P) { let zs = p.xs / let ws = q.xs / hs(ws) / 1 }
  → MISMATCH  @13:6-13:8
  The mark is the ingredient, not the sharing.

d5  a `call` initialiser as the poisoner
fn mk(): L { [1] }
fn f(q: P) { let zs = mk() / let ws = q.xs / hs(ws) / 1 }
  → MISMATCH  @16:6-16:8
  `#typeExpr` types a call as a nominal minted from the callee, so the marked
  object is private to that node even though the call is unprovable.

d6  the typed-`let` sink on the poisoned victim
  let zs = m.xs
  let ws: array<string> = q.xs
  → error theta/parse/let-rhs-type-mismatch :: let binding 'ws' initialiser type
    mismatch: expected array<string>, got array<integer>  @13:3-13:31
  That sink reads the map by VALUE (`containsWithheldBinderType`, `:1057`), so
  the identity channel does not reach it. Exactly one registered code is lost.

d7  the poisoner's OWN binding at the sink
  let zs = m.xs
  hs(zs)
  → []
  Correct, and not this report's subject: `m` is an unproven reduction, so
  `m.xs` is past the parser's static view and type-system.md:48 licences the
  deferral for THIS binding. Bug 0050's posture, pinned by cell `L2` of
  tests/fn-arg-member-read-proof.test.ts and cell `d5` of
  tests/loop-element-withhold-binding-scoped.test.ts.
```

### (e) The `resultBindings` fence — the channel a route must not sever

`resultBindings` (`:972`) is the second identity set. It is MINTED only at this
arm (`:1132`) and read by `interpolationIsResult`'s `ident` arm (`:2458–2460`).
`INTERP` abbreviates `error theta/parse/interpolated-result :: Result value
cannot be interpolated; unwrap with ? or match first`.

```
e1  a Result-returning fn call is BOTH minted and unprovable — the row that
    decides §Fix route 1's shape
fn mk(): Result<integer, QueryError> { Ok(1) }
fn f() {
  let r = mk()
  let c = r
  let out = @`x${c}`
  1
}
  → INTERP  @10:13-10:21
[CTL] `${r}` interpolated directly instead
  → INTERP  @9:13-9:21

    `mk()` satisfies `isCertainResultNode` (`:2484–2493`, a `call` whose written
    return names a `Result`) so `let r = mk()` MINTS the membership at `:1132`,
    and `provableArgType`'s `call` arm withholds unconditionally
    (`:2080–2104`) so the SAME object is marked at `:1143`. `let c = r` then
    sits on the marking branch too (its `ident` read hits `r`'s mark) and
    inherits the membership only because `c` and `r` share one object. A twin
    taken on that branch and not carried drops this `E`.

e2  the same, two hops on (`let d = c`, `${d}`)
  → INTERP  @11:13-11:21
    The carry must be transitive.

e3  the constructor pair
fn f() { let r = Ok(1)   let c = r   let out = @`x${c}`   1 }
  → INTERP  @7:13-7:21
    Read from the code, not from this row: `provableArgType`'s `result-ctor` arm
    answers `typeOf` (`:2105–2114`), so `let r = Ok(1)` takes NO mark and
    neither does `let c = r`; the pair is a proof chain. It therefore bounds an
    UNCONDITIONAL copy-on-record and not a copy-on-mark. The same case group's
    `object` member is measured a proof by (c2)'s control, where
    `let q = P { xs: [1] }` supports the later judged read.

e4  the deeper source, measured — a membership carried through a composite
fn f(flag: boolean) {
  let r = Ok(1)
  let xs = flag ? [r] : ["a"]
  for b in xs { let out = @`x${b}` }
  1
}
  → INTERP  @8:15-8:23
[CTL] the same without the ternary (`let xs = [r]`)
  → INTERP  @8:15-8:23

    `commonType`'s dominating-candidate clause returns its candidate BY
    REFERENCE (`type-compat.ts:673–681`) and `#commonType` falls back to
    `candidates[0]` the same way (`static-type-inference.ts:438`), so the
    array's element IS the object `resultBindings` holds for `r`, through the
    array literal and through the ternary. 0194's residual 2 recorded this
    without measuring it; the row is what makes any "stop sharing at the source"
    route (§Fix (c)) a change to bug 0079's mechanism.
```

## Expected behaviour

`docs/spec_topics/type-system.md:27` lists a function-argument slot among the
positions the `⊑` relation governs, and `:50` (TYPE-9) routes a static failure
there to `theta/parse/fn-arg-type-mismatch` "on a static failure (`T₁ ⋢ T₂`,
both operands statically resolvable)". The registry row
(`code-registry-parse.md:120`) is `E` and states that no runtime AJV net
backstops the position.

In §Reproduction (a) row 1 both operands are statically resolvable and the
*Trigger* is satisfied in every particular. `hs` declares `a: array<string>`
from an annotation this pass parsed. `ws` is an unannotated `let` whose
initialiser is a declared-field read off `q: P`, an annotated parameter of a
resolved object schema — the class bug 0190 (0.111.0) established as a proof, and
`P`'s field is declared `L`, which TYPE-11 (`:54`) makes `array<integer>`. So
`array<integer> ⋢ array<string>` at a governed position, and the diagnostic is
owed. The identical program with the `let zs` line deleted reports it from the
same code path (row a3).

The only sentence that could license the silence is `type-system.md:48`,
*Unresolvable operands*: the check is skipped "when either side of a
compatibility check is past the parser's static view". Neither side is, and the
paragraph conditions on the OPERANDS — which do not change across rows a1, a3,
a4 and a5. A check whose verdict depends on the presence and position of an
unrelated statement over an unrelated binding is not the deferral `:48`
authorises.

The property the machinery is meant to have is bug 0194's, restated at this
writer: **a withhold recorded for one binding applies to that binding only.**
`unprovableBindings`' own field comment already asserts it (`:974–996`:
"`bindings.get(name)` returns the exact object the recording arm stored"), and
the marking site's comment asserts it again (`:1135–1142`: the mark is for
"`rhsType`, already bound to `stmt.name` above"). Both sentences are true of
what the arm RECORDS and false of what it MARKS whenever `typeOf` borrowed —
which, since 0190, is every member read of a declared field. Under the intended
property, on the measured inputs:

- §Reproduction (a) rows a1 and a2 emit the mismatch, identically to their three
  controls.
- §Reproduction (b) rows b1–b3 emit theirs, in all three field shapes.
- §Reproduction (c) rows c1–c7 emit theirs — both sinks in c3.
- §Reproduction (d) is unchanged in all seven rows; each is already correct, d7
  included.
- §Reproduction (e) is unchanged in all six rows: every `INTERP` still emits.
- Cell `d6` of `tests/loop-element-withhold-binding-scoped.test.ts` flips from
  `[]` to the mismatch its own control `d6ctl` already asserts; cell `L2` of
  `tests/fn-arg-member-read-proof.test.ts` and cell `d5` of the 0194 witness stay
  green.

## Actual behaviour / root cause

**The object the arm marks is not the object it means to mark.** `walkStmt`'s
`case "let"` (`:1036`), unannotated path:

```ts
const rhsType = this.typeOf(stmt.init, bindings);
…
const initUnprovable =
  annotation === undefined && this.provableArgType(stmt.init, bindings) === undefined;
bindings.set(stmt.name, annotation === undefined ? rhsType : unfoldAlias(annotation, this.env));
if (annotation === undefined && this.isCertainResultNode(stmt.init)) {
  this.resultBindings.add(rhsType);
}
if (initUnprovable) {
  this.unprovableBindings.add(rhsType);
}
```

The intent is "the type recorded for THIS binding is not a proof". The
expression is "this `CompatType` object is not a proof".

**Where the object comes from.** For a member-read initialiser the chain is
three hops, none of which copies:

1. `collectSchemaFields` (`:822–843`) runs once per object-schema declaration
   inside `collectTypeEnv` (`:382`), which `checkTypeLayer` runs once per parse
   (`:269`). It calls `annotationToCompatType` exactly once per declared field
   (`:830`) and stores the result (`:832`). One `CompatType` per declared field
   per parse.
2. `#memberType` (`static-type-inference.ts:359–376`) resolves the receiver,
   guards the own-key lookup, and returns `unfoldAlias(fields[node.field], env)`
   with `declared: true` (`:372`). No copy. When the field's declared type is an
   alias, `unfoldAlias` (`type-compat.ts:155–172`) additionally hands back the
   `TypeEnv`'s own right-hand side (`:169`) — one object per alias declaration
   per parse — so the borrowed object may be the field's or the alias's.
3. `typeOf` (`:1016`) publishes that object as the initialiser's static type, and
   `bindings.set` (`:1112–1115`) records it as the binding's type.

`annotationToCompatType` (`:846`) allocates on every return path and interns
nothing, which is why two distinct schemas do not collide (§Reproduction (d3))
and one schema read twice does.

**Where the mark is read.** `provableArgType`'s `ident` arm (`:1969`, `:2009`) is
the only reader:

```ts
const recorded = bindings.get(expr.name);
if (recorded === undefined) { return undefined; }
return this.unprovableBindings.has(recorded) ? undefined : recorded;
```

A later `let ws = q.xs` over a proven `q: P` runs the same three hops and
obtains the same object. It takes no mark of its own — `provableArgType(q.xs)`
is defined, because bug 0190's `member` arm (`:2077–2079`) proves a
declared-field read off a proven receiver. But `bindings.get("ws")` returns the
field's object, `has` answers true, and the arm returns `undefined`.
`checkFnCallArgs` then skips the row (`:1809–1814`) and `checkFnArgCompat`
(`type-compat.ts:461`) is never called.

**Why 0190 turned this arm live.** Before 0.111.0 the `member` arm returned
`undefined` unconditionally, so the victim `let ws = q.xs` was itself
`initUnprovable`, marked its own recorded type, and was withheld at the sink on
its own account — the leak from the poisoner's mark had no observable, and 0194
measured the arm inert at that baseline (its §Affected, `:1035–1052`). 0190 made
the victim's read a proof without making the object it returns private, so the
poisoner's mark became the only thing withholding it.

**Why the blast radius is the document.** `unprovableBindings` is per-parse
instance state on the single `TypeLayerWalk` that `checkTypeLayer` constructs
(`:280`) and walks the whole body with (`:289`). Scope copies (`:1154`, `:1160`,
`:1180`, `:1246`, `:1248`, `:1411`, `:1417`, `:2309`) bound the NAME's
visibility; they do not bound the SET, which has no scope. A mark taken inside an
`if` block is live after the block (§Reproduction (c4)), inside one `fn` is live
in the next (c1), and inside a `fn` is live at top level (c2).

**Why the direction is one-way.** The set's only read is the `ident` arm, and its
`undefined` reaches consumers that all withhold: `checkFnCallArgs` skips the row
(`:1809`), this same `let` arm marks MORE (`:1111`), `bindLoopElement` marks a
twin (`:1337`), and the composite arms propagate `undefined` upward. No path
turns a positive `has` into an emission. The defect can only remove a true
positive.

**Why one code, not nine.** The identity channel serves `provableArgType` only.
The VALUE channel — the unspellable sentinel `recordWithheldBinders` mints,
tested by `containsWithheldBinderType` (`:442`) — is what the sibling type-layer
sinks read, and this arm records a real declared-field type rather than the
sentinel. §Reproduction (d6) measures the consequence: the typed-`let` sink still
emits `theta/parse/let-rhs-type-mismatch` on the poisoned binding.
`theta/parse/fn-arg-type-mismatch` is the whole loss.

**Why this arm is harder than the loop arms.** The object it records feeds a
SECOND identity channel it also mints into. `resultBindings` (`:972`) is bug
0079's provenance set: the `let` arm is the only site that mints a membership
(`:1132`), and for a `call` to a `Result`-returning `fn` the mint and the mark
consume the same object at the same site (`:1132` and `:1143`; measured,
§Reproduction (e1)). A binding that reads such a binding inherits the membership
by sharing the object, and that inheritance is what draws the registered
`theta/parse/interpolated-result` on `let c = r` (e1, e2). 0194's remedy at the
loop arms needed only to CARRY an inherited membership onto its twin (`:1342–1344`);
a remedy here must also re-point the MINT, or the very binding that mints loses
its membership.

**No post-condition exists.** `Set<CompatType>` carries no statement about where
its members came from, and nothing at this writing site asserts that the object
being marked was minted rather than borrowed. The two comments that state the
invariant (`:974–996`, `:1135–1142`) are prose, and no code checks them.

## Why it matters

- **A registered `E`-severity refusal is withheld and the theta registers.**
  §Reproduction (a) row 1 loads cleanly, the slash command is created
  (`hasLoadParseError`, `production-composition.ts:2214–2221`, sees nothing), and
  the mistyped call is bound unchecked at runtime. The registry row states that
  no runtime AJV net covers the position (`code-registry-parse.md:120`).
- **Nothing is emitted on any channel.** Not a warning, not an info, not a note.
  The only observable is the diagnostic that is absent, and its absence is
  indistinguishable from correct code.
- **The trigger is non-local, order-dependent, and scope-blind.** The statement
  that causes the suppression can be in another `fn` (c1), in a block that has
  already exited (c4), or after the declarations it poisons; reordering two
  statements changes the verdict (a4). An author debugging the missing diagnostic
  has no reason to look at the earlier `let`.
- **It grows with the codebase, monotonically.** One unprovable read of a field
  silences every later judged read of that same field in the document (c3), and
  adding such a read can only remove diagnostics from code that already existed
  below it.
- **The input class is wider than 0194's.** The marked object is a whole declared
  field type, so the suppression reaches whole-value argument slots rather than
  loop-element slots, and it reaches primitive fields (b3) and inline field
  declarations with no alias anywhere in the file (b2). Every object-schema field
  in a document is a channel.
- **The bound on exposure is real and should be stated.** The failure direction
  is admissible — a withheld true positive, never a false `E`, never a wrong
  message, never a wrong range. One registered code is affected; the value
  channel's sinks are measured unmoved (d6). No committed `.theta` or
  `.thetalib` satisfies the precondition (measured: 0 of 34 contain a member read
  of any shape). And the poisoner must be an unprovable read whose type is
  borrowed, which at HEAD means a member read off a receiver bug 0190's arm
  cannot prove.

## Non-goals

- **The two loop arms.** `walkStmt`'s `case "for"` and `walkExpr`'s
  `case "par-for"` mark through `bindLoopElement` (`:1330–1346`), which copies on
  mark and carries provenance. That is bug 0194's subject, fixed at 0.113.0, and
  §Reproduction (d2) measures that a `let`-arm mark does not reach a loop
  element. A route here may reuse 0194's helper shape; it does not change the
  helper's behaviour at the two loop arms, and 0194's witness group `(e)` must
  stay green.
- **The withholding posture itself.** `provableArgType` returning `undefined` for
  a read the layer has not proven is bug 0050's settled discipline, stated at
  `:1809–1814`. A binding taken off an unprovable member read SHOULD be withheld:
  §Reproduction (d7) is correct behaviour, and cells `L2`
  (`tests/fn-arg-member-read-proof.test.ts:770`) and `d5`
  (`tests/loop-element-withhold-binding-scoped.test.ts:1071`) pin it. The defect
  is that the withhold also lands on bindings taken off PROVEN reads.
- **Bug 0190's receiver-proof obligation.** The `member` arm withholding on an
  erased receiver (`:2077–2079`) is what keeps this report's poisoner unprovable.
  It is the reachability supplier, not the subject; widening into it would change
  which reads are unprovable instead of what a mark applies to.
- **`commonType`'s and `#memberType`'s by-reference return AS A CONTRACT.**
  Returning a candidate or a field type by reference (`type-compat.ts:673–681`,
  `static-type-inference.ts:372`, `:438`) is the deeper source, and §Fix (c)
  records it as a candidate route. It is not adopted here as the subject: bug
  0079's provenance mechanism DEPENDS on that aliasing (§Reproduction (e4)
  measures a membership travelling through an array literal and a ternary by
  reference), `commonType` is called on every narrowing question, and the callers
  of both functions have not been audited by this report. Its blast radius is its
  own question.
- **The type-layer codes that read the map by VALUE.** They are measured unmoved
  (d6). This report neither adds nor removes any of them.
- **Runtime behaviour.** The measured programs load and run today and would stop
  loading under a fix. No runtime path is measured or changed.

## Fix

**Not settled.** One question decides the route: what the withhold is keyed by at
this writer. Three answers, with different blast radii. Every route must satisfy
(d) below.

**(a) Route 1 — extend 0194's twin to this arm, with the provenance carry
extended to the membership the `let` itself MINTS.** Take a private object when
the initialiser is not a proof, record THAT object, and feed both identity
channels with it:

```ts
const initUnprovable =
  annotation === undefined && this.provableArgType(stmt.init, bindings) === undefined;
const recorded: CompatType =
  annotation === undefined ? (initUnprovable ? { ...rhsType } : rhsType) : unfoldAlias(annotation, this.env);
bindings.set(stmt.name, recorded);
if (annotation === undefined && this.isCertainResultNode(stmt.init)) {
  this.resultBindings.add(recorded);          // the MINT moves onto the twin
} else if (annotation === undefined && this.resultBindings.has(rhsType)) {
  this.resultBindings.add(recorded);          // an INHERITED membership is carried
}
if (initUnprovable) {
  this.unprovableBindings.add(recorded);
}
```

Consequence: the marked object is reachable from exactly one scope entry, which
is what both comments already claim (`:974–996`, `:1135–1142`). Smallest diff, no
signature change, no new state, and no contract in `type-compat` or the inference
pass moves. Costs and obligations, each measured:

1. **The `resultBindings` mint must move with the mark, and the inheritance must
   be carried.** §Reproduction (e1): for `let r = mk()` over a
   `Result`-returning `fn`, the mint (`:1132`) and the mark (`:1143`) consume ONE
   object, and `let c = r` sits on the marking branch and inherits the membership
   only by sharing. A twin that re-points neither drops
   `theta/parse/interpolated-result` at both bindings; a twin that re-points only
   the mint drops it at `c`. (e2) shows the carry must be transitive. (e3) is the
   contrast: the `Ok(1)` pair is a proof chain (`provableArgType`'s `result-ctor`
   arm answers `typeOf`, `:2105–2114`), so it is unreached by a copy conditioned
   on `initUnprovable` and reached by an unconditional copy-on-record — which is
   a correction to 0194's residual 1, whose sentence names only that pair.
2. **The audit is bounded and enumerable.** `src/` holds exactly two
   `Set<CompatType>` (`:972`, `:997`) and no `Map<CompatType, …>`; each has one
   read (`:2009`, `:2458–2460`), and both test the TOP-LEVEL object, so a shallow
   spread suffices. A fix taking this route states the audit and proves the twin
   value-equal by construction: every VALUE-channel reader
   (`containsWithheldBinderType`, `checkCompatible`, `displayType`) recurses
   structure.
3. **The annotated path must not move.** `:1110` short-circuits on
   `annotation === undefined`, so an annotated `let` reaches no proof obligation
   and takes no twin; `checkLetRhsCompat` already judged its initialiser and its
   recorded type is the annotation. Pin it.

**(b) Route 2 — key the withhold by BINDING rather than by type object.**
Replace the `Set<CompatType>` with a per-scope record of which NAMES are
unproven. Consequence: the channel then means what its name says, the class
closes for all four writers at once, and 0194's twins at the loop arms become
retirable. Cost: the largest diff and the only one that can fail in the OTHER
direction. A name-keyed withhold must be copied at every scope copy — `:1154`,
`:1160`, `:1180`, `:1246`, `:1248`, `:1411`, `:1417`, `:2309` — and cleared
wherever a marked name is rebound; a missed copy leaks a mark past a scope exit
(suppression), a missed clear withholds a proof (suppression), and a wrong clear
manufactures an `E` no reader is owed. `bindings` is `Map<string, CompatType>`
and is threaded into `StaticTypeInferencePass.typeOf`, so changing its value type
crosses the pass boundary; a parallel set avoids that and pays the copy
obligation instead. `resultBindings` is a separate question under this route: it
is a provenance channel, not a proof channel, and re-keying it by name is what
its own comment (`:963–971`, `:1117–1131`) argues against. A fix taking this
route enumerates the copy and clear sites and pins each with a cell.

**(c) Route 3 — remove the sharing at the source.** Have `#memberType`
(`static-type-inference.ts:372`), `#commonType` (`:438`) and `commonType`
(`type-compat.ts:673–681`) hand back per-call structures so no two readers share
an object. Consequence: closes the hazard for every identity-keyed consumer at
once, present and future. Cost: it lands in the shared inference and compatibility
layers rather than in the arm that has the defect; `commonType` is called on
every ternary, `match`, array-literal and arithmetic narrowing and `#memberType`
on every member read, so per-call allocation is a hot-path cost and a
cross-module contract change over callers this report has not audited. And it is
not conservative: §Reproduction (e4) measures bug 0079's provenance travelling
through an array literal and a ternary BY REFERENCE, so copying at the source
removes a registered `E` unless 0079's channel is replaced in the same commit.
Recorded for completeness; routes 1 and 2 are the ones the evidence supports.

**(d) Constraints binding every route.**

1. **The mark survives; only its object becomes private.** §Reproduction (d7) is
   correct behaviour and is pinned twice: cell `L2`
   (`tests/fn-arg-member-read-proof.test.ts:770–782`, bug 0190's bound) and cell
   `d5` (`tests/loop-element-withhold-binding-scoped.test.ts:1071`). A route that
   reds either has deleted the withhold instead of re-keying it.
2. **Cell `d6` flips under this report's authority.** `d6`
   (`tests/loop-element-withhold-binding-scoped.test.ts:1086–1109`) asserts
   `CLEAN` on §Reproduction (a) row a2's fixture and its reason names it as
   0194's residual territory; `d6ctl` (`:1111–1126`) already asserts the
   emission on the delete-control. A fix rewrites `d6` to assert the mismatch,
   keeps `d6ctl` byte-equal in verdict, and cites this report in the cell's
   reason — the shape bug 0197 uses for cell `C` of
   `tests/params-default-unresolvable-enum-variant.test.ts` under bug 0185's
   authority. No other cell in that file changes; groups (a)–(c) and (e) are
   0194's and must stay green.
3. **Bug 0079's witness stays green, and gains the shape it lacks.** All 49 cells
   of `tests/interpolated-result-gate.test.ts` must stay green. Measured: none of
   them drives a binding that inherits its membership from another binding, which
   is the exact shape route 1 endangers, so the witness for this fix carries
   §Reproduction (e1)–(e3) as new cells — both the marking-branch pair
   (`let r = mk()` / `let c = r`) and the proof-chain pair (`let r = Ok(1)` /
   `let c = r`), with their direct-interpolation controls.
4. **GOV-15, addition arm.** Every §Reproduction (a)–(c) fixture loads cleanly
   today and would gain an `E`, and an error-severity `theta/parse/*` denies
   registration (`production-composition.ts:2214–2221`). That is observable (b)
   moving under the *Diagnostic-registry carve-out*
   (`source-language-stability.md:25`), in the same strictly-narrower shape as
   the 0031 → 0084 → 0126 → 0194 chain: a *Trigger* becoming reachable at an
   input class with a byte-unchanged registry. No code is added, removed or
   renamed; no *Message* is reworded (DIAG-2 / DIAG-4). Observable (c) is
   unmoved — the emissions that appear are the registry's own template rendered
   over types the binding already carries.
5. **Corpus.** Measured: of the 34 committed `.theta` / `.thetalib` files, none
   contains a member read of any shape, so none can satisfy the precondition.
   `tests/committed-fixture-parse-gate.test.ts` is the corpus-wide discharge per
   `AGENTS.md`.
6. **Witness.** New, additive, beyond the `d6` rewrite: the (a) quadruple with
   all three controls and pinned ranges, the (b) three field shapes with their
   delete-controls, the (c) reach rows (cross-`fn`, top-level, second victim,
   block-scoped poisoner, block-scoped victim, transitive launder, composite
   poisoner), the (d) fences as regression pins (annotated-parameter victim,
   later loop, distinct schemas, sharing-without-mark, `call` poisoner,
   typed-`let` sink, the poisoner's own binding), and the (e) `resultBindings`
   rows from constraint 3. The (d) rows are what prove the route did not
   over-correct by removing the withhold; (e) is what proves it did not sever
   provenance.
7. **One arm, and no lock-step obligation.** Unlike 0194, whose two arms wrote to
   one set and poisoned each other, this defect has a single writer:
   §Reproduction (d2) measures that the `let` arm's mark does not reach a loop
   element and (d1) that it does not reach an annotated parameter. A fix at
   `:1134–1144` alone closes it.

## Fix (0.120.0)

- **What shipped**, keyed to §Fix:
  - **§Fix (a), route 1 — the private twin at the one remaining writer, with the
    provenance carry extended to the membership the `let` itself MINTS.**
    `src/parser/type-layer-checks.ts`: `walkStmt`'s `case "let"` resolves one
    `recorded: CompatType` — `{ ...rhsType }` when the initialiser is not a
    proof, the object `typeOf` returned when it is, `unfoldAlias(annotation,
    this.env)` when the `let` is annotated — and records, mints, inherits and
    marks off that single object. The `resultBindings` MINT
    (`isCertainResultNode`) moved onto `recorded`; a new `else if (annotation ===
    undefined && this.resultBindings.has(rhsType))` arm carries an INHERITED
    membership onto it, testing the pre-copy object because that is where the
    membership lives and adding the post-copy object because that is what
    `bindings.get(stmt.name)` will hand back; `unprovableBindings.add(recorded)`
    replaces the mark on the borrowed object. The marked object is now reachable
    from exactly one scope entry, which is what both field comments already
    claimed. Routes 2 and 3 were rejected on measurement: route 2's name-keyed
    channel was never needed once route 1 measured viable, and route 3 (copy at
    `#memberType` / `#commonType` / `commonType`) would sever bug 0079's
    by-reference provenance, which §Reproduction (e4) measures travelling through
    an array literal and a ternary.
  - **§Fix (a) obligation 2, the bounded audit, discharged.** `src/` holds
    exactly two `Set<CompatType>` (the two fields of `TypeLayerWalk`) and no
    `Map<CompatType, …>`, `WeakMap` or `WeakSet`. All four `.has()` sites — the
    two decision reads (`provableArgType`'s `ident` arm,
    `interpolationIsResult`'s `ident` arm) and the two write-side carry tests
    (`bindLoopElement`'s and this fix's) — test the TOP-LEVEL object only, so the
    shallow spread is value-equal by construction: `CompatType`
    (`type-compat.ts:55–65`) is a union of plain `readonly` data objects with no
    method, prototype state, `Map` or `Set`, and every VALUE-channel reader
    (`containsWithheldBinderType`, `checkCompatible`, `displayType`) recurses
    structure. The spread deliberately preserves NESTED references, which
    §Reproduction (e4) requires: a deep copy would sever the membership riding
    the array element.
  - **§Fix (a) obligation 3, the annotated path unmoved.** The `annotation ===
    undefined ?` short-circuit is byte-equal in effect to the pre-fix expression;
    an annotated `let` still records `unfoldAlias(annotation, this.env)`, takes no
    twin, and reaches no proof obligation. Pinned by the witness's rows d1 and d6.
  - **The four comments the change falsified were re-derived**, not merely left:
    `unprovableBindings`' field doc (its borrowed-object hazard sentence covered
    the two loop arms only and now covers all four writers), `resultBindings`'
    field doc (the `let` arm is the sole MINTER but no longer the sole writer of
    an inherited membership), the bug-0079 mint comment (why the two channels
    must agree on which object a binding recorded), and the bug-0050 mark comment
    (`recorded`, not `rhsType`, and why).
  - **§Fix (d)(2) — cell `d6` flipped under this report's authority.**
    `tests/loop-element-withhold-binding-scoped.test.ts` cell `d6` asserts the
    mismatch its own control `d6ctl` already asserts, located `@14:14-14:16`, with
    `sites` and fixture byte-identical and `d6ctl`'s verdict byte-equal. No other
    cell in that 30-cell file changed; groups (a)–(c),(e) and cell `d5` are bug
    0194's and are green.
  - **Cell `u13e` restated under this report's authority, citing bug 0145** — a
    cross-report collision the document did not know about; see *Residuals* item
    1 and *Discharge notes*. `tests/fn-arg-type-mismatch-wired.test.ts` cell
    `u13e` asserts `fn 'g' argument 0 ('s') type mismatch: expected string, got
    integer @7:11-7:12`, its `argRange` PRECONDITION byte-identical, its comment
    re-derived to name this report as the marking-guard flip authority and bug
    0145 as the owner of the REMAINING flip day (arm-scope typing). The other 86
    cells keep byte-identical assertions.
  - **§Fix (d)(6) — the witness.** New, additive:
    `tests/let-arm-withhold-binding-scoped.test.ts`, 32 rows over the real
    `parseThetaDocument` through `parseDoc`, messages sourced from the registry
    per DIAG-4, one loud PRECONDITION per row over binder AND judged-argument
    sites. (a) a1, a2 with a3ctl/a4ctl/a5ctl; (b) the alias, inline and primitive
    field shapes with b2ctl/b3ctl; (c) c1–c7 with c2ctl; (d) the seven fences
    d1–d7 as regression pins; (e) e1, e1ctl, e2, e3, e3ctl, e4, e4ctl. Twelve
    rows are fix-produced (a1, a2, b1–b3, c1–c7); the other twenty are green in
    both directions. It cites `src/` by SYMBOL only, so a later fix that moves
    `type-layer-checks.ts` line numbers cannot stale it.
  - **§Fix (d)(4) — GOV-15, addition arm, under the *Diagnostic-registry
    carve-out*** (`source-language-stability.md:25`). Observable (b) moves: inputs
    that load cleanly today acquire an error-severity `theta/parse/*` and so stop
    registering (`hasLoadParseError`). The registry page is byte-unchanged, no
    code is added, removed or renamed, and no *Message* is reworded (DIAG-2 /
    DIAG-4); observable (c) is unmoved, because the emissions that appear are the
    registry's own template rendered over types the binding already carried. This
    is the strictly-narrower *Trigger*-reachability shape of the 0031 → 0084 →
    0126 → 0194 chain. **The flip classes, enumerated from the mechanism** — a
    program flips iff it holds an unannotated `let` whose initialiser is BOTH
    unprovable and typed by an object `typeOf` borrowed, followed by a judged read
    of that same object:
    1. **The declared-field object** — `collectSchemaFields` builds one
      `CompatType` per declared field per parse, so a member read off an erased
      receiver and a later read off a proven receiver of the same schema share it
      (rows a1, a2, b2).
    2. **The `TypeEnv` alias right-hand side** — `unfoldAlias` hands back
      `decl.rhs` by reference, so a field declared as an alias shares the alias's
      own object rather than the field's (row b1). Neither class is confined to
      array-typed slots: a primitive declared field shares identically (row b3).
    3. **A composite reduction that returns one of its candidates by
      reference** — `commonType`'s dominating-candidate clause and `#commonType`'s
      single-candidate fallback, reached through a ternary or an array literal
      (row c7).
    4. **`#commonType`'s single-candidate return where a `match` ARM BODY IS ITS
      OWN BINDER** — the inference pass types an arm body in the enclosing
      bindings map, so `typeOf(match)` hands back a same-named OUTER binding's
      recorded object, the arm-scoped reduction correctly withholds, and the mark
      lands on the outer binding. This class was **not** enumerated by this
      document and was found by the fix run's blast-radius sweep; it is what cell
      `u13e` pins, and the class the parent adjudicated into this arm. Its
      poisoner needs no schema and no member read at all.
  - **§Fix (d)(1), (3), (5), (7) — nothing shipped, each verified.** (1) The
    withhold was RE-KEYED, not deleted: row d7 and cell `L2` of
    `tests/fn-arg-member-read-proof.test.ts` are green in BOTH directions. (3) All
    49 cells of `tests/interpolated-result-gate.test.ts` are green and the shape
    that witness lacks — a binding inheriting its membership from another binding
    — is carried by this witness's group (e). (5) `committed-fixture-parse-gate`
    (36 cells) is green, the corpus-wide discharge per `AGENTS.md`. (7) One arm:
    `bindLoopElement` and both of its call sites are byte-untouched.

- **Gates** (each re-run by the orchestrator, not taken on a nested report's
  word):
  - Witness, RED before: `npx vitest run` over the new witness and the two
    flipped files → `Test Files 3 failed (3)`, 14 failures, every one
    `actual diagnostics: []: expected [] to deeply equal [ … ]`.
  - Witness, GREEN after: the same three files → `Test Files 3 passed (3)` /
    `Tests 149 passed (149)` (32 / 30 / 87 cells).
  - Full default suite: `npm test` → `Test Files 322 passed (322)` /
    `Tests 5563 passed (5563)`. Pre-change baseline was 321 / 5531.
  - `npm run typecheck` → exit 0. `npm run lint` → exit 0.
  - Live H8a: the additive registration cell 57 of
    `tests/live/live-production-acceptance.test.ts` → 1 passed, 56 skipped, zero
    model turns; red-proven in the other direction (subject registers under a
    neutralised fix).
  - Live H9a, both files: `tests/live/acceptance/noninteractive-acceptance.test.ts`
    and `ctor-unresolved-load-refusal.test.ts` → `Test Files 2 passed (2)` /
    `Tests 11 passed (11)`, permitted-code criterion scored on the real run with
    **no append** to `tests/fixtures/h7a/permitted-codes.json`.

- **Review**: 1 round plus one bounded polish round. Round 1 (deep) —
  **CLEAN, no findings**; it re-verified route fidelity against the measured
  prototype token by token, re-ran the audit, proved the red path itself by
  reverse-applying the source hunks, and ran the live cell; it returned two
  non-blocking `prose` residuals. Polish round (light) — one of those two: a
  one-line fixture doc comment. Comment-only, gates re-run green, so the
  confirmation review round was skipped by the gate-diff rule.

- **Verification**: SOLID. (1) The tests witness the defect in both directions:
  with the `recorded` computation neutralised by a targeted byte edit, the whole
  tree reds `Test Files 3 failed | 319 passed (322)` / `Tests 14 failed | 5549
  passed (5563)` — exactly the twelve `RED` rows, cell `d6` and cell `u13e`,
  nothing else — and every PIN/CTL row including d7 and `L2` stays green;
  restored byte-exact and green again. (2) Full suite 322 / 5563 green. (3) Live:
  H8a cell 57 passed for real and was proven able to red; H9a 11/11 green across
  both files with no permitted-code append. (4) `typecheck` and `lint` exit 0.
  No `git stash` was used at any point; every neutralisation was a targeted byte
  edit restored and hash-verified.

- **Residuals** (for the PARENT to file; no bug document is created here):
  1. **This document's coverage census was FALSIFIED, and the miss was a
     cross-report collision.** §Affected states "Test coverage of this defect:
     cell `d6` and its control, and nothing else". Measured: cell `u13e` of
     `tests/fn-arg-type-mismatch-wired.test.ts` covers the same channel and the
     same writer at a fourth borrowing source (flip class 4 above). The sweep
     predicate was narrower than the defect — "two unannotated `let`s off one
     declared field" — and `u13e`'s poisoner is a `match` whose arm body IS its
     binder, needing no schema at all. The document came one step short of its own
     conclusion: `tests/fn-arg-type-mismatch-wired.test.ts` is among the seven
     files its §Affected already names as "the surface a fix re-derives". Because
     open bug 0145 §Fix (d) reserved that cell's restatement, the fix run stopped
     at the blast-radius gate and the restatement shipped only under an explicit
     parent adjudication.
  2. **This document's ordering claim was FALSIFIED.** §Status said "nothing
     blocks this report and it blocks nothing". It shares cell `u13e` with open
     bug 0145. Symmetrically, 0145 §Status's "No ordering dependency blocks it" is
     now incomplete: this fix discharges 0145's §Reproduction group (a), so 0145
     inherits a partly-discharged §Reproduction. Neither document's §Related named
     the other. §Status is corrected above and a coordination note is appended to
     0145.
  3. **Bug 0194's §Fix *Residuals* item 1 is discharged AND was corrected.** Its
     measurement re-derives byte-identically, but its sentence "a twin there
     withholds `theta/parse/interpolated-result` on `let r = Ok(1)` / `let c = r`"
     is false: `provableArgType`'s `result-ctor` arm answers `typeOf`, so that
     pair is a PROOF chain, takes no mark and no twin, and is unreached by a copy
     conditioned on `initUnprovable` (row e3). The pair that DOES bind is a `call`
     to a `Result`-returning `fn` (row e1). The residual's conclusion — that a
     route here needs the provenance carry extended to the membership a `let` may
     itself mint — is unchanged and strengthened. The discharge note carrying this
     correction is appended to 0194.
  4. **Bug 0194's §Fix *Residuals* item 2 stays open** and is recorded there. This
     fix does not close the by-reference deeper source: rows e4 and e4ctl measure
     bug 0079's provenance still travelling by reference through an array literal
     and a ternary, and that aliasing is load-bearing — a deep copy would sever
     it. §Fix (c) remains that question's territory.
  5. **Cell `d6ctl`'s title and reason still narrate the pre-fix state** in
     `tests/loop-element-withhold-binding-scoped.test.ts` ("restores the
     residual's verdict", "what makes d6's silence a suppression"). Left
     untouched deliberately: §Fix (d)(2) authorises changing `d6` and no other
     cell in that file, and the file narrates throughout from its 0194 filing
     baseline — cell `a1`'s title has been stale in the same way since 0.113.0, so
     retensing one cell would leave the file inconsistent. Bug 0134's class;
     needs an explicit authority extension.
  6. **Pre-existing `path:line` citation drift in
     `tests/fn-arg-type-mismatch-wired.test.ts`**, found and NOT chased: several
     citations in cells this run did not touch were already stale at HEAD. Only
     the citations this change itself invalidated were corrected, and only inside
     the four files this run owns. Bug 0134's class.
  7. **Orchestrator self-authorizations, recorded rather than left invisible.**
     (i) Three comment-only hunks in `tests/loop-element-withhold-binding-scoped.test.ts`
     beyond cell `d6` — the file header, the FIX-PRODUCED-vs-REGRESSION-PIN list,
     and the group-(d) header — because flipping `d6` made all three false, and
     `STYLE.md:28` ("Every claim is testable or is removed") does not permit
     shipping a file that contradicts itself. No assertion and no executable line
     is in those hunks. (ii) A bounded citation re-derivation of the ten
     `path:line` numbers this change moved, confined to the four test files this
     run already owns; every new number was verified by grep against the finished
     tree. (iii) One fixture doc comment in
     `tests/fn-arg-type-mismatch-wired.test.ts` that still called `u13e`'s fixture
     "the marking-channel deferral" after the cell was restated as the emission —
     one line, comment-only, the sibling clause about `U13R_NESTED_RENDER` left
     intact. Each is comment-or-citation-only, bounded to named lines, touches no
     assertion and no executable line, and each was gated by a full re-run of the
     default suite, `typecheck` and `lint`.

- **Discharge notes appended**: bug 0194's §Fix *Residuals* item 1 (this report's
  origin, discharged with its `Ok(1)`-pair correction), and a coordination note on
  bug 0145 recording that its §Reproduction group (a) is discharged while its
  group (b) is byte-unmoved. **Neither status was flipped — 0145 stays open**, its
  S2 subject intact.

- **Pinned dispositions / non-goals**: the two loop arms (bug 0194's, shipped at
  0.113.0 — `bindLoopElement` is behaviourally untouched); the withholding posture
  itself (bug 0050's, and correct — row d7 and cell `L2` pin it); bug 0190's
  receiver-proof obligation (this defect's reachability supplier, untouched);
  `commonType`'s and `#memberType`'s by-reference return AS A CONTRACT (the deeper
  source, §Fix (c), whose blast radius is its own question and which bug 0079's
  provenance depends on); the type-layer codes that read the map by VALUE
  (measured unmoved, row d6); routes 2 and 3; the arm-scope question (bug 0145's,
  still open); runtime behaviour (no runtime path is measured or changed).

## Provenance

- **Origin:** the bug 0194 fix run (commit `a7d15562`, 0.113.0), §Fix
  *Residuals* item 1 in
  `docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md:1035–1052`
  — "**The `let` arm marks a BORROWED object too, and it is a live suppression
  route.** … `let zs = m.xs` then `let ws = q.xs` over a proven `q: P` then
  `hs(ws)` → `[]`, where deleting the `let zs` line → `error
  theta/parse/fn-arg-type-mismatch …` … A fix there cannot copy the way this one
  does" — and *Residuals* item 2 (`:1053–1061`), the by-reference return of
  `commonType`'s dominating-candidate clause.
- **The run report:** `.pi/tmp/fixes/0194-report.md` §"The `let` arm —
  adjudicated OUT, and it is a live suppression route" (the three grounds for the
  exclusion and the `d6` bound) and §"Residuals / notes" items 1–2. Its
  §"For sibling orchestrators" note ordered every citation into
  `src/parser/type-layer-checks.ts` re-derived by SYMBOL after that commit's +124
  lines; every citation in this report was re-derived accordingly.
- **One correction to that origin, measured here.** Residual 1 states that a twin
  at this arm withholds `theta/parse/interpolated-result` on `let r = Ok(1)` /
  `let c = r`. That pair is a PROOF chain at HEAD — `provableArgType`'s
  `result-ctor` arm answers `typeOf` (`:2105–2114`) and the `ident` arm returns
  an unmarked recorded object (`:2009`) — so a twin conditioned on
  `initUnprovable`, which is the shape 0194's own `bindLoopElement` uses, does not
  reach it. The pair that DOES bind is a `call` to a `Result`-returning `fn`
  (§Reproduction (e1)): minted at `:1132` and marked at `:1143` over one object.
  The residual's conclusion — that a route here needs the provenance carry
  extended to the membership a `let` may itself mint — is unchanged and
  strengthened.
- **The machinery's owner:**
  `docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md`
  (fixed 0.77.0) — the wired sink, both identity sets, and the
  withholding-can-only-suppress posture.
- **The reachability supplier:**
  `docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md` (fixed
  0.111.0) — the `member`-arm proof rule and its receiver-proof obligation.
- **The sibling channel:**
  `docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md`
  (fixed 0.69.0) — `resultBindings`, `interpolationIsResult`, and the 49-cell
  witness.
- **The defect site and the channel:** `src/parser/type-layer-checks.ts:1036`
  (the arm), `:1038` (`rhsType`), `:1110–1111` (`initUnprovable`), `:1112–1115`
  (the record), `:1132` (the `resultBindings` mint), `:1134–1144` and `:1143`
  (the mark), `:997` and `:974–996` (the set and its contract), `:972` and
  `:963–971` (the sibling set), `:2009` and `:1969` (the only read), `:1854`
  (`provableArgType`), `:1775`, `:1808`, `:1809–1814`, `:1815–1825`
  (`checkFnCallArgs`), `:2077–2079` (0190's `member` arm), `:2080–2104` (the
  `call` / `invoke` withhold), `:2105–2114` (the `typeOf`-answering arm),
  `:1330–1346` (`bindLoopElement`), `:1203` and `:2312` (its callers), `:2450`
  and `:2458–2460` (`interpolationIsResult`), `:2484–2493`
  (`isCertainResultNode`), `:1381` (`recordWithheldBinders`), `:442` and `:1057`
  (the VALUE channel), `:263–290` (`checkTypeLayer`), and the scope copies
  `:1154`, `:1160`, `:1180`, `:1246`, `:1248`, `:1411`, `:1417`, `:2309`.
- **Why the object is shared:** `src/parser/type-layer-checks.ts:822–843`
  (`collectSchemaFields`), `:830`, `:832`, `:382`, `:361` (`collectTypeEnv`),
  `:846` (`annotationToCompatType`); `src/parser/static-type-inference.ts:359–376`
  (`#memberType`), `:372`, `:205–212` (`declaredFieldType`), `:235–240` (the
  `ident` arm), `:434–439` and `:438` (`#commonType`), `:241–247`, `:250–257`;
  `src/parser/type-compat.ts:155–172` and `:169` (`unfoldAlias`), `:665–686` and
  `:673–681` (`commonType`).
- **The emitter and registration:** `src/parser/type-compat.ts:461–489`
  (`checkFnArgCompat`); `src/extension/production-composition.ts:2214–2221`
  (`hasLoadParseError`), call sites `:1496`, `:1918`, `:2102`, `:2261`.
- **The spec:** `docs/spec_topics/type-system.md:27`, `:48`, `:50`, `:54`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:120`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.
- **The pins:** `tests/loop-element-withhold-binding-scoped.test.ts:1086–1109`
  (`d6`), `:1111–1126` (`d6ctl`), `:1071` (`d5`), `:623–629` (`PRE_LET_ARM`),
  `:1169–1213` (group `(e)`); `tests/fn-arg-member-read-proof.test.ts:770–782`
  (`L2`), `:748` (`C_L2`); `tests/interpolated-result-gate.test.ts` (49 cells);
  `tests/committed-fixture-parse-gate.test.ts` (the corpus discharge).
- **Measurement:** offline scratch vitest at HEAD `a7d15562`, driving the real
  `parseThetaDocument` through `parseDoc` (`tests/helpers/e2e-s1.ts:39`).
  Thirty-six rows measured, thirty-one recorded across §Reproduction (a)–(e),
  controls included. Written, run, deleted.
- Style authority: `docs/STYLE.md`.
