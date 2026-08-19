# Bug 0194 — `unprovableBindings` (`type-layer-checks.ts:906`) keys its withhold by OBJECT IDENTITY while a `TypeEnv` alias's right-hand side is ONE object shared by every use of that alias, so a single unprovable `for a in p.xs` over `schema L = array<integer>` marks the alias's element and suppresses the true `theta/parse/fn-arg-type-mismatch` a LATER `for b in ys { g(b) }` over a provable `ys: L` emits — measured `[]`, where deleting or reordering the earlier loop emits the `E`; the plain `for` arm (`:1110–1116`) and the `par for` arm (`:2065–2080`) mark through the same set and poison each other in both directions

- **Status:** fixed (0.113.0) — §Fix route 1 (copy on mark), at both loop arms
  in one commit through a shared helper. §Reproduction was re-derived at the
  fix's baseline as §Fix (e) requires: bug
  [0190](./0190-fn-arg-sink-withholds-provable-member-reads.md) landed first
  (0.111.0) and every fixture below stopped poisoning, so the witness is built
  on the unprovable-and-array-typed shapes that remain. See `## Fix (0.113.0)`.
- **Sev/Diff estimate:** S1/D3 — a registered `E`-severity refusal whose
  *Trigger* the input satisfies is withheld on every channel and the theta
  registers, which is S1's "inputs accepted that the spec refuses … with no
  diagnostic"; D3 because §Fix needs in-run adjudication across three routes,
  the `par for` arm must move in lock-step (measured: the arms poison each
  other), and the change adds `E` emissions to programs that load cleanly today
  against two pinned witnesses.
- **Kind:** defect — implementation. One element: the key the withhold channel
  uses. `unprovableBindings` is a `Set<CompatType>` (`:906`) and its only read
  is `this.unprovableBindings.has(recorded)` in `provableArgType`'s `ident` arm
  (`:1819`), so the channel is JavaScript object identity. It has four writers.
  `recordWithheldBinders` (`:1200–1202`) mints the object it marks, so identity
  is exact there. The two loop arms (`:1115`, `:2079`) mark
  `unfoldAlias(iterandType, this.env).element` (`:1112`, `:2067–2068`): for an
  alias iterand that object belongs to the `TypeEnv`, is created once per parse
  at `collectTypeEnv:333`, and is handed back by reference to every caller of
  `unfoldAlias` (`type-compat.ts:169`), so the mark lands on the alias rather
  than on the loop variable. The `let` arm (`:1052`) marks whatever `typeOf`
  returned for the initialiser, which is a borrowed object for a member read —
  measured inert today, because no other binding records that same object
  (§Reproduction (d) row 5). The failure direction is one-way: the set's only
  read can withhold an emission and can never produce one, so this is a withheld
  true positive, never a false `E`.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, and the owner of the machinery. Its fix wired
    `checkFnArgCompat` behind `provableArgType` and introduced both identity
    sets and the posture this defect inherits: `provableArgType` returning
    `undefined` "can only suppress an emission"
    (`type-layer-checks.ts:1627–1629`). That posture is what makes this defect
    admissible in direction and invisible in practice — the suppressed
    diagnostic leaves no trace. The suppressed code is 0050's own row.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **fixed (0.107.0)**,
    the origin. Its §Fix ordered the `par for` arm's marking "mirrored" into the
    plain `for` arm, and the shipped arm mirrors it verbatim (`:1107–1116`
    against `:2070–2080`). The behaviour is **pre-existing in the `par for`
    arm**, not introduced by 0126; 0126 gave it a second, more commonly written
    entry point. Its §Fix *Residuals* item 4 records this defect and asks for a
    filing covering both arms. Its witness cell `e4`
    (`tests/plain-for-loop-variable-element-type.test.ts:1402–1410`) pins the
    marking's existence and is a constraint on every route below.
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **fixed
    (0.72.0)**, the alias-transparency family. It established TYPE-11 unfolding
    at the iterand gate and at the `par for` element derivation, which is the
    step that puts the env's own object in the loop arms' hands. Its fix is
    correct and this report does not contend with it: the defect is what the
    marking does with the unfolded object, not the unfolding.
  - [0190](./0190-fn-arg-sink-withholds-provable-member-reads.md) — **open**,
    disjoint in subject, adjacent in reachability. Its subject is
    `provableArgType`'s shared `member` / `method-call` arm (`:1821–1836`)
    returning `undefined` unconditionally. Every unprovable iterand this report
    measured roots in that arm — directly (`p.xs`), through an unannotated `let`
    that launders one (`let zs = p.xs`), or inside a composite that contains one
    (`flag ? ys : p.q`, `p.grid[0]`). Measured non-member unprovable iterands
    (a `call`, an `invoke`) do not reach the marking at all, because their
    static type is a nominal minted from the callee and does not unfold to an
    array. So 0190 landing first NARROWS this report's measured input set
    without touching its mechanism — §Fix (e) states the coordination.
- **Affected** (every citation verified at HEAD `5c9104ab`, 0.107.0):
  - `src/parser/type-layer-checks.ts:906` — **the channel**,
    `private readonly unprovableBindings = new Set<CompatType>()`. `:893–905` —
    its doc comment, which states the identity contract and its warrant:
    "`bindings.get(name)` returns the exact object the recording arm stored, so
    identity is the channel back to an erasure a name lookup alone cannot see",
    and "a false identity hit only withholds, never fabricates an emission". The
    warrant holds for a minted object and fails for a borrowed one.
  - `src/parser/type-layer-checks.ts:1110–1116` — **defect site 1**,
    `walkStmt`'s `case "for"`. `:1110` `const unfolded = unfoldAlias(iterandType,
    this.env)`; `:1112` `const elementType = unfolded.element`; `:1113`
    `inner.set(stmt.variable, elementType)`; `:1114–1116` marks `elementType`
    when `this.provableArgType(stmt.iterand, bindings)` is `undefined`. `:1089`
    — the scope copy the record lands in. `:1117–1118` — the non-`array`
    fallback (`recordWithheldBinders`), which is not this defect's path.
  - `src/parser/type-layer-checks.ts:2065–2080` — **defect site 2**,
    `walkExpr`'s `case "par-for"`, identical in the part that matters: `:2065`
    unfolds, `:2067–2068` takes `iterandType.element`, `:2069` records it,
    `:2070–2080` marks it on the same condition. `:2071–2078` — the comment
    stating the intent the identity key defeats: "`inner.set` stores the exact
    object `#typeExpr`'s `ident` arm returns for `e.variable`, so object
    identity carries the erasure". True of the loop variable; the object is not
    the loop variable's.
  - `src/parser/type-layer-checks.ts:1810–1819` — **the only read**,
    `provableArgType`'s `ident` arm: `const recorded = bindings.get(expr.name)`,
    then `return this.unprovableBindings.has(recorded) ? undefined : recorded`.
    `:1786` — the arm's start. `:1671` — `provableArgType`; `:1646–1670` — its
    doc comment.
  - `src/parser/type-layer-checks.ts:1592–1644` — `checkFnCallArgs`, the only
    consumer that emits. `:1625` reads `provableArgType`; `:1626–1631` skips the
    row on `undefined` with the comment "withholding here can only suppress an
    emission"; `:1632–1642` is the emission that does not happen. `:2004` —
    `walkExpr`'s `call` arm, its only caller.
  - `src/parser/type-layer-checks.ts:1019–1020`, `:1043–1053` — the `let` arm's
    laundering, the third writer and the transitivity route: an unannotated
    `let c = b` over a poisoned `b` marks the `let`'s own recorded type, so the
    erasure propagates past the loop body (§Reproduction (c)).
  - `src/parser/type-layer-checks.ts:1198–1204` — `recordWithheldBinders`, the
    fourth writer. It mints its object at `:1200` and marks it at `:1202`, so
    its identity key is sound; it is cited as the contrast, not as a defect.
  - `src/parser/type-layer-checks.ts:328–357` — **why the object is shared**,
    `collectTypeEnv`. `:333` calls `annotationToCompatType` ONCE per alias
    declaration; `:345` stores the result as `env[stmt.name] = { kind: "alias",
    rhs }`. One `CompatType` per alias per parse. `:786–800` —
    `collectSchemaFields`, the same one-object-per-field construction for an
    object schema's declared field types.
  - `src/parser/type-layer-checks.ts:810–832` — `annotationToCompatType`. Every
    return allocates (`:826` `{ kind: "array", element: … }`, `:829`, `:831`);
    nothing is interned. This is why two inline `array<integer>` annotations do
    NOT collide (§Reproduction (d) row 1) and one alias does.
  - `src/parser/type-layer-checks.ts:235–260` — `checkTypeLayer`. `:241` builds
    the env once; `:249–257` constructs one `TypeLayerWalk` over it; `:258`
    walks the whole body. `unprovableBindings` is per-parse instance state
    (`:903–904`), so a mark taken in one `fn` is visible in every later
    statement of the document (§Reproduction (c)).
  - `src/parser/type-compat.ts:155–172` — `unfoldAlias`. `:169`
    `current = decl.rhs` returns the env's object **by reference**; there is no
    copy at any point on the path. `:104–106` — `resolveNamed`.
  - `src/parser/type-compat.ts:461–489` — `checkFnArgCompat`, the emitter that
    is never reached: `:471–474` returns `[]` for `"compatible"` / `"unknown"`,
    `:478–488` builds the `E`. `:139` — `checkCompatible`; `:327` —
    `displayType`.
  - `src/extension/production-composition.ts:2214–2221` — `hasLoadParseError`:
    any error-severity `theta/parse/*` blocks registration. Call sites `:1496`,
    `:1918`, `:2102`, `:2261`. This is what the suppressed diagnostic would have
    triggered.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:120` — the suppressed
    row, `theta/parse/fn-arg-type-mismatch`, severity `E`. Its *Trigger* is
    satisfied in every particular by the measured input, and it states the
    consequence of the miss in terms: "Always parse-time: top-level `fn`
    declarations are hoisted and always statically resolvable, so no runtime
    AJV safety net applies."
  - `docs/spec_topics/type-system.md:27` — the closed list of positions `⊑`
    governs, which includes a function-argument slot; `:50` — TYPE-9, which
    routes that slot to `theta/parse/fn-arg-type-mismatch`; `:54` — TYPE-11,
    alias transparency; `:48` — *Unresolvable operands*, the deferral licence
    and the only sentence that could authorise the silence.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15 and
    its observable (b), the ordered diagnostic-code sequence; `:9` — the
    loads-cleanly predicate; `:25` — the *Diagnostic-registry carve-out*.
  - `tests/plain-for-loop-variable-element-type.test.ts:1402–1410` — cell `e4`,
    bug 0126's pin of the marking. Its fixture is `schema P { xs: array<integer>
    }` — an INLINE field type, not an alias — so the object it marks is that
    field's own element and is shared with nothing. `e4` is therefore
    insensitive to this defect and stays green under every route below, while
    reddening for any route that deletes the marking.
  - `tests/member-access-declared-field-type.test.ts:961`, `:1070–1082` — row
    `x11`, bug 0190's in-tree pin of the `member`-arm withholding that supplies
    this report's unprovable iterands.
  - `tests/fn-arg-type-mismatch-wired.test.ts` — bug 0050's witness for the
    suppressed row; no cell in it drives two loops over one alias.
  - **Test coverage of this defect: none.** No test in the tree names this
    behaviour, and no cell drives two loops over one alias. Six test files hold
    both an `array`-typed alias declaration and a loop, and are the surface a
    fix re-derives: `tests/fn-param-alias-unfolded-at-gates.test.ts`,
    `tests/index-element-alias-unfolded.test.ts`,
    `tests/let-annotation-recorded-binding-type.test.ts`,
    `tests/member-access-declared-field-type.test.ts`,
    `tests/plain-for-loop-variable-element-type.test.ts`, and
    `tests/live/live-production-acceptance.test.ts`.
  - **Committed corpus: unaffected, measured.** Of the 34 committed `.theta` /
    `.thetalib` files, none declares an alias schema of any shape, and exactly
    one contains a loop — `docs/examples/fan-out-reviews.theta`, a `par for` at
    `:19` and a plain `for` at `:28`, neither iterand an alias. No committed
    file satisfies the precondition.
- **Observed at:** `0.107.0` (HEAD `5c9104ab`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts`). Written,
  run, deleted.

## Summary

`unprovableBindings` (`src/parser/type-layer-checks.ts:906`) is a
`Set<CompatType>` whose membership test is object identity
(`:1819`). `recordWithheldBinders` marks an object it minted one line earlier
(`:1200–1202`), and identity is the correct key for that writer. The two loop
arms mark `unfoldAlias(iterand).element` (`:1112`, `:2067–2068`). When the
iterand is an alias of `array<T>`, that element object is the `TypeEnv`'s:
`collectTypeEnv`
builds one `CompatType` per alias declaration per parse (`:333`, `:345`) and
`unfoldAlias` returns it by reference (`type-compat.ts:169`). The mark therefore
lands on the ALIAS, and every later binding that reads its element gets the same
object back and tests positive.

Measured, with `schema L = array<integer>` and `schema P { xs: L }`:

```
fn f(p: P, ys: L) {
  for a in p.xs { let z = a }     // unprovable iterand → marks L's element
  for b in ys { g(b) }            // provable iterand → same element object
}
                                  → []
```

Delete the first loop and the second emits
`error theta/parse/fn-arg-type-mismatch :: fn 'g' argument 0 ('s') type
mismatch: expected string, got integer`. Swap the two loops and it emits. The
second loop's own iterand is a proof in every route the code takes to it; what
withholds the judgement is a mark taken by an unrelated statement over an
unrelated binding.

Three properties make the suppression hard to attribute. It is
**order-dependent** — only loops after the marking one are affected. It reaches
**the whole document** — `unprovableBindings` is per-parse instance state
(`:903–904`) and one `TypeLayerWalk` covers the body (`:249–258`), so the mark
crosses `fn` boundaries and reaches top-level statements. And it is
**silent** — the only read is `provableArgType`'s `ident` arm, whose `undefined`
makes `checkFnCallArgs` skip the row (`:1626–1631`), so nothing is emitted on
any channel at any severity.

The failure direction is the admissible one. The set is read once, the read
feeds withholding decisions only, and `checkFnArgCompat` is the sole emitter
downstream — so a spurious identity hit removes a true positive and can never
fabricate a false `E`. Exactly one registered code is reachable through the
channel, `theta/parse/fn-arg-type-mismatch`; the sibling typed-`let` sink reads
the map by VALUE (`containsWithheldBinderType`) and is measured unmoved
(§Reproduction (d) row 4).

Both arms mark through the same set, so they poison each other: a plain `for`
suppresses a later `par for` and a `par for` suppresses a later plain `for`.
The channel and both its identity sets are bug 0050's (0.77.0), and the `par
for` arm's marking predates bug 0126 — 0126's fix record states it as
pre-existing at that baseline. 0126's fix mirrored the marking into the plain
`for` arm verbatim, as its settled §Fix ordered, and recorded the consequence as
*Residuals* item 4.

## Reproduction

Offline at `5c9104ab`. Every row is one `parseThetaDocument` call over a source
string with frontmatter `mode: prompt`; the trailing `1` supplies the theta's
final value. `→` lists the whole `diagnostics` array in emission order,
unfiltered. `[CTL]` marks a control. `MISMATCH` abbreviates
`error theta/parse/fn-arg-type-mismatch :: fn 'g' argument 0 ('s') type
mismatch: expected string, got integer`.

Every row shares this preamble unless stated otherwise:

```
schema L = array<integer>
schema P { xs: L }
fn g(s: string) { 1 }
```

### (a) The suppression and its two controls

```
fn f(p: P, ys: L) {
  for a in p.xs { let z = a }
  for b in ys { g(b) }
  1
}
  → []

[CTL] first loop deleted
fn f(p: P, ys: L) {
  for b in ys { g(b) }
  1
}
  → MISMATCH

[CTL] the two loops reordered
fn f(p: P, ys: L) {
  for b in ys { g(b) }
  for a in p.xs { let z = a }
  1
}
  → MISMATCH
```

The two controls isolate the cause to the mark and to its position in the walk.
The reordered control is the sharper one: the same three statements, the same
two loops, the same alias — only the order differs, and the order decides
whether a registered `E` is reported.

### (b) Both arms, both directions

```
par for first, plain for second
fn f(p: P, ys: L) {
  let r = par for a in p.xs { a }
  for b in ys { g(b) }
  1
}
  → []

plain for first, par for second
fn f(p: P, ys: L) {
  for a in p.xs { let z = a }
  let q = par for b in ys { g(b) }
  1
}
  → []

par for both
fn f(p: P, ys: L) {
  let r = par for a in p.xs { a }
  let q = par for b in ys { g(b) }
  1
}
  → []

[CTL] the par for judgement alone
fn f(p: P, ys: L) {
  let q = par for b in ys { g(b) }
  1
}
  → MISMATCH
```

One set, two writers: neither arm is the arm to fix.

### (c) Reach — how far one mark travels

```
across fn boundaries
fn f(p: P) { for a in p.xs { let z = a }   1 }
fn h(ys: L) { for b in ys { g(b) }   1 }
  → []

into top-level statements
fn poison(p: P) { for a in p.xs { let z = a }   1 }
let ys: L = [1, 2]
for b in ys { g(b) }
  → []
[CTL] the same two top-level statements without `fn poison`
  → MISMATCH

every later loop, not only the next
fn f(p: P, ys: L, zs: L) {
  for a in p.xs { let z = a }
  for b in ys { g(b) }
  for c in zs { g(c) }
  1
}
  → []

transitively, through an unannotated let inside the poisoned body
fn f(p: P, ys: L) {
  for a in p.xs { let z = a }
  for b in ys { let c = b   g(c) }
  1
}
  → []
[CTL] the same second loop alone
  → MISMATCH

through a nested alias chain (schema M = L, schema P { xs: M }, ys: M)
  → []
[CTL] the same second loop alone
  → MISMATCH

when the second loop's iterand is a let-bound local, not a parameter
fn f(p: P) {
  for a in p.xs { let z = a }
  let ys: L = [1, 2]
  for b in ys { g(b) }
  1
}
  → []

when the first loop's iterand is a let that laundered the member read
fn f(p: P, ys: L) {
  let zs = p.xs
  for a in zs { let z = a }
  for b in ys { g(b) }
  1
}
  → []

with a string alias and the mismatch in the other direction
(schema S = array<string>, schema P { xs: S }, fn g(n: integer))
  → []
[CTL] the same second loop alone
  → error theta/parse/fn-arg-type-mismatch :: fn 'g' argument 0 ('n') type
    mismatch: expected integer, got string
```

### (d) What the sharing does NOT reach

```
1. no alias — two inline annotations of the same shape
   schema P { xs: array<integer> }
   fn f(p: P, ys: array<integer>) {
     for a in p.xs { let z = a }
     for b in ys { g(b) }
     1
   }
     → MISMATCH
   `annotationToCompatType` allocates per call (`:826`), so the field's element
   and the parameter's element are different objects.

2. two PROVABLE loops over the same alias
   fn f(ys: L, zs: L) {
     for a in ys { let z = a }
     for b in zs { g(b) }
     1
   }
     → MISMATCH
   Sharing alone is inert; the mark is the ingredient.

3. an unprovable iterand whose element is not the alias's
   fn f(flag: boolean, ys: L) {
     for a in [flag ? 1 : "a"] { let z = a }
     for b in ys { g(b) }
     1
   }
     → MISMATCH
   The array literal's element is minted by the inference pass, so marking it
   marks nothing else.

4. the typed-`let` sink
   fn f(p: P, ys: L) {
     for a in p.xs { let z = a }
     for b in ys { let s: string = b }
     1
   }
     → error theta/parse/let-rhs-type-mismatch :: let binding 's' initialiser
       type mismatch: expected string, got integer
   That sink reads the map by VALUE (`containsWithheldBinderType`), not through
   `provableArgType`, so the identity channel does not reach it. Exactly one
   registered code is suppressed.

5. marking the alias's own `named` object rather than its element
   fn f(p: P, ys: L) {
     let zs = p.xs
     for b in ys { g(b) }
     1
   }
     → MISMATCH
   `let zs = p.xs` marks the shared FIELD type object (`named L`), which the
   later loop never reads: the loop takes the element out of the unfolded
   right-hand side. The channel is specifically the alias's element.
```

### (e) Which iterands reach the marking, and which do not

The marking needs an iterand that is unprovable AND whose static type unfolds to
an `array`. At HEAD both halves come from the same place.

```
member read                     for a in p.xs               → marks
member read laundered by a let  let zs = p.xs / for a in zs → marks
composite containing one        for a in (flag ? ys : p.q)  → marks
index off one                   for a in p.grid[0]          → marks
  (schema P { grid: array<L> })

user fn call                    fn mk(): L { [1] } / for a in mk()
  → error theta/parse/non-array-iterand :: 'for' expects array<T> after 'in';
    got mk
  → MISMATCH   (the later loop is unaffected)

invoke                          let r = invoke<L>("./other.theta") / for a in r
  → error theta/parse/non-array-iterand :: 'for' expects array<T> after 'in';
    got ./other.theta
  → MISMATCH   (the later loop is unaffected)
```

Every marking row is rooted in `provableArgType`'s shared `member` /
`method-call` arm (`:1821–1836`), which is bug 0190's subject. The two
non-marking rows are unprovable for a different reason (`:1837–1861`, the
`call` / `invoke` arm) and never reach the `unfolded.kind === "array"` branch,
because `#typeExpr` types a call as a nominal minted from the callee rather than
as the callee's declared return type.

**The two `non-array-iterand` renders above are not this report's subject.**
They render an author-chosen callee name and a `.theta` path into a `<type>`
placeholder, which is the `named "<own spelling>"` fallback family bug 0126's
§Non-goals and RFC 0008 name. Measured here so the attribution is on record;
not investigated, not filed by this report.

## Expected behaviour

`docs/spec_topics/type-system.md:27` lists a function-argument slot among the
positions the `⊑` relation governs, and `:50` (TYPE-9) routes a static failure
there to `theta/parse/fn-arg-type-mismatch`. The registry row
(`code-registry-parse.md:120`) is `E` and states that no runtime net backstops
it. In §Reproduction (a) the second loop's argument satisfies that *Trigger* in
every particular: `ys` is an annotated parameter of an alias declared
`array<integer>`, TYPE-11 (`type-system.md:54`) makes that alias its right-hand
side, the loop variable carries the element type per
`docs/spec_topics/control-flow.md`'s `for` paragraph as bug 0126 closed it, and
`g` declares a `string` parameter. Every iteration hands `g` an `integer`. The
diagnostic is owed.

The only sentence that could license withholding it is `type-system.md:48`,
*Unresolvable operands*: a parse-time check is skipped "when either side of a
compatibility check is past the parser's static view". Neither side is. The
parameter's declared type is author-written text this pass already parsed; the
alias is in the same file; and the identical program with the earlier loop
deleted reports the diagnostic from the same code path. A check that fires or
withholds depending on a statement elsewhere in the document is not the
deferral `:48` authorises — the paragraph conditions on the operands, and the
operands do not change between §Reproduction (a)'s three rows.

The property the machinery is meant to have, stated so a fix has a target:
**a withhold recorded for one binding applies to that binding only.** Both
`unprovableBindings` doc comments already assert it —
`type-layer-checks.ts:899–901` ("`bindings.get(name)` returns the exact object
the recording arm stored") and `:2076–2078` ("`inner.set` stores the exact
object … so object identity carries the erasure"). Both sentences are true of
what the loop arm STORES and false of what it MARKS: the stored object is the
alias's, so identity does not separate this loop variable from any other reader
of the same alias. Under the intended property, on the measured inputs:

- §Reproduction (a) row 1 emits the mismatch, identically to its two controls.
- §Reproduction (b)'s four rows emit it, in both arms and in both orders.
- §Reproduction (c)'s eight rows emit it.
- §Reproduction (d) is unchanged in all five rows — each is already correct.
- Cell `e4` stays `[]`: its loop variable is genuinely unprovable and its
  element object is shared with nothing.

## Actual behaviour / root cause

**The object the loop arm marks is not the object it means to mark.**
`walkStmt`'s `case "for"` (`:1110–1116`):

```ts
const unfolded = unfoldAlias(iterandType, this.env);
if (unfolded.kind === "array") {
  const elementType = unfolded.element;
  inner.set(stmt.variable, elementType);
  if (this.provableArgType(stmt.iterand, bindings) === undefined) {
    this.unprovableBindings.add(elementType);
  }
} else {
  this.recordWithheldBinders(inner, [stmt.variable]);
}
```

`walkExpr`'s `case "par-for"` (`:2065–2080`) is the same three steps over the
same objects. Both intend the mark to say "the type recorded for THIS loop
variable is not a proof". Both express it as "this `CompatType` object is not a
proof".

**Where the object comes from.** For an alias iterand the chain is three hops,
none of which copies:

1. `collectTypeEnv` (`:328–357`) runs once per parse (`checkTypeLayer:241`).
   For each `schema X = R` it calls `annotationToCompatType` exactly once
   (`:333`) and stores the result as `env[stmt.name] = { kind: "alias", rhs }`
   (`:345`). One object per alias declaration, for the whole parse.
2. `annotationToCompatType` (`:810–832`) allocates a fresh object on every
   return path (`:826`, `:829`, `:831`) and interns nothing — which is why two
   inline `array<integer>` annotations never collide (§Reproduction (d) row 1).
3. `unfoldAlias` (`type-compat.ts:155–172`) walks `while (current.kind ===
   "named")` and assigns `current = decl.rhs` (`:169`). It returns the env's own
   object by reference. There is no defensive copy anywhere on the path, and
   none is owed by its contract — `checkCompatible` (`:139`) only reads it.

So `unfolded.element` is a single object per alias per parse, and both loop arms
hand exactly that object to `Set.add`.

**Where the mark is read.** `provableArgType`'s `ident` arm (`:1810–1819`) is
the only reader:

```ts
const recorded = bindings.get(expr.name);
if (recorded === undefined) {
  return undefined;
}
return this.unprovableBindings.has(recorded) ? undefined : recorded;
```

A later `for b in ys` over a provable `ys: L` runs the same three hops, obtains
the same `unfolded.element`, and stores it as `b`'s recorded type. It takes no
mark of its own — `provableArgType(ys)` is defined, because `walkFn` records an
annotated parameter as a fresh `annotationToCompatType` object (`:1237`) that
nothing marked. But `bindings.get("b")` returns the alias's element, `has`
answers true, and the arm returns `undefined`. `checkFnCallArgs` then skips the
row at `:1626–1631` and `checkFnArgCompat` (`type-compat.ts:461`) is never
called.

**Why the blast radius is the document.** `unprovableBindings` is per-parse
instance state (`:903–904`) on a single `TypeLayerWalk` that
`checkTypeLayer:249–258` constructs once and walks the whole body with. Scope
copies (`new Map(bindings)`, `:1089`) bound the NAME's visibility; they do not
bound the SET, which has no scope at all. A mark taken inside one `fn` body is
therefore live for every statement the walk visits afterwards — later `fn`s,
later top-level statements — which §Reproduction (c) measures in both shapes.

**Why the direction is one-way.** The set's only read is the `ident` arm, and
its `undefined` reaches four consumers, all of which withhold: `checkFnCallArgs`
skips the row (`:1626`); the `let` arm's `initUnprovable` (`:1019–1020`) marks
MORE; the two loop arms' guards (`:1114`, `:2070`) mark more; and the composite
arms (`:1745–1749` arithmetic, `:1785` `try`, `:1880` `index`, `:1913`
`isProvenReduction`) each propagate `undefined` upward. No path turns a positive
`has` into an emission (`:1837–1861`, the `call` / `invoke` arm, is the fourth
unconditional withhold and behaves the same way). The defect can only remove a
true positive — never add a false one, never change a message, never change a
range.

**Why one code, not nine.** The identity channel serves `provableArgType` only.
The VALUE channel — the unspellable `WITHHELD_BINDER_TYPE_NAME` minted at
`:1200` and tested by `containsWithheldBinderType` — is what the sibling sinks
read, and it is untouched here because the loop arm records a real element type,
not the sentinel. §Reproduction (d) row 4 measures the consequence: the typed
`let` sink still emits `theta/parse/let-rhs-type-mismatch` on the poisoned loop
variable. `theta/parse/fn-arg-type-mismatch` is the whole loss.

**No post-condition exists.** `Set<CompatType>` carries no statement about where
its members came from, and nothing at either writing site asserts that the
object being marked was minted rather than borrowed. The two doc comments
(`:899–901`, `:2076–2078`) state the invariant in prose and no code checks it.

## Why it matters

- **A registered `E`-severity refusal is withheld and the theta registers.**
  §Reproduction (a) row 1 loads cleanly, the slash command is created, and the
  mistyped call is bound unchecked at runtime. The registry row itself states
  that no runtime AJV net covers this position
  (`code-registry-parse.md:120`), so the failure surfaces, if at all, as
  whatever the body does with a wrongly typed value.
- **Nothing is emitted on any channel.** Not a warning, not an info, not a
  note. The author sees a clean load. The only observable is the diagnostic that
  is absent, and its absence is indistinguishable from correct code.
- **The trigger is non-local and order-dependent.** The statement that causes
  the suppression is in a different loop, over a different binding, possibly in
  a different `fn`, and reordering two statements changes the verdict
  (§Reproduction (a) row 3, (c) rows 1–2). An author debugging the missing
  diagnostic has no reason to look at the earlier loop.
- **It grows with the codebase, monotonically.** One unprovable loop over an
  alias silences every later judged read of that alias's element in the file
  (§Reproduction (c) row 3). Adding an unprovable loop can only remove
  diagnostics from code that already existed below it.
- **It crosses the two arms.** Fixing the plain `for` arm alone leaves the
  `par for` arm marking the same shared objects (§Reproduction (b)), so a
  partial fix leaves the defect fully reachable through the other keyword.
- **The bound on exposure is real and should be stated.** The failure direction
  is admissible — a withheld true positive, never a false `E`, never a wrong
  message. One registered code is affected, not the nine the loop arm's binding
  serves. No committed `.theta` or `.thetalib` satisfies the preconditions
  (measured: 0 of 34 declare an array alias). And at HEAD every unprovable
  iterand that reaches the marking is rooted in bug 0190's `member` arm. What
  the defect costs today is the reliability of a check the author cannot see
  fail; what it costs later depends on how many unprovable-but-array-typed
  expression shapes the language grows.

## Non-goals

- **The withholding posture itself.** `provableArgType` returning `undefined`
  for a read the layer has not proven is bug 0050's settled discipline, stated
  at `:1627–1629` and re-derived by bug 0126's §Fix. This report does not
  contend with it: a loop variable taken off an unprovable iterand SHOULD be
  withheld. The defect is that the withhold also lands on loop variables taken
  off provable iterands. Cell `e4` pins the correct half and must stay green.
- **Bug 0190's member-arm withholding.** `provableArgType`'s shared `member` /
  `method-call` arm (`:1821–1836`) returning `undefined` unconditionally is a
  separate open report against a separate arm, with its own spec argument and
  its own witness. It is this report's reachability supplier, not its subject
  (§Fix (e)). Widening into it here would change which iterands are unprovable
  instead of what a mark applies to.
- **The `non-array-iterand` renders in §Reproduction (e).** `got mk` and
  `got ./other.theta` are the `named "<own spelling>"` fallback family
  (`static-type-inference.ts`'s `ident` and call arms), which bug 0126's
  §Non-goals and RFC 0008 hold. Measured here for attribution only.
- **`resultBindings`.** `:891` is the sibling identity set, fed at `:1041` with
  the `let` arm's own `rhsType`. It shares the identity mechanism and none of
  the measured inputs move it, because the loop arms do not write to it. A route
  that changes `unfoldAlias`'s aliasing contract (§Fix route 3) reaches it, and
  §Fix says so; no other route does.
- **The nine type-layer codes bug 0126 made reachable.** They read the map by
  value and are measured unmoved (§Reproduction (d) row 4). This report neither
  adds nor removes any of them.
- **Runtime behaviour.** The programs load and run today and would stop loading
  under a fix. No runtime path is measured or changed.

## Fix

**Not settled.** One question decides the route: what the withhold is keyed by.
Three answers, with different blast radii. Every route must satisfy (d) below,
and (e) is the coordination clause.

**(a) Route 1 — copy on mark.** At both arms, when the iterand is not a proof,
record and mark a fresh object instead of the env's:

```ts
const unproven = this.provableArgType(stmt.iterand, bindings) === undefined;
const elementType = unproven ? { ...unfolded.element } : unfolded.element;
inner.set(stmt.variable, elementType);
if (unproven) {
  this.unprovableBindings.add(elementType);
}
```

Consequence: the marked object is reachable from exactly one scope entry, which
is what both doc comments already claim. Smallest diff, no signature change, no
new state, and `unfoldAlias`'s contract is untouched. Cost: it makes the
recorded type a structurally-equal but non-identical twin of the alias's
element, so any consumer that compares recorded types by identity sees a
difference. The audit is bounded and enumerable: the file holds exactly two
identity comparisons over a `CompatType`, `unprovableBindings.has` (`:1819`) and
`resultBindings.has` (`:2228`), and the second is fed only at `:1041` from a
`let` RHS, which no route below touches. A shallow spread suffices, because only
the top-level object is ever looked up; nested identity is not consulted. A fix
taking this route states the audit and proves the twin is value-equal by
construction (§Reproduction (d) row 4 must stay unmoved).

**(b) Route 2 — key the withhold by BINDING, not by type object.** Replace the
`Set<CompatType>` with a per-scope record of which NAMES are unproven — either a
parallel `Set<string>` threaded beside `bindings`, or a wrapper value type in
the map. Consequence: the channel then means what its name says, and the class
of defect closes for every present and future writer rather than for the two
loop arms. `recordWithheldBinders` (`:1198–1204`) and the `let` arm's laundering
(`:1043–1053`) both convert mechanically. Cost: the largest diff and the one
with a live regression risk in the OTHER direction. `bindings` is
`Map<string, CompatType>` and is threaded through `typeOf` (`:925–927`) into
`StaticTypeInferencePass.typeOf`, so changing its value type crosses the pass
boundary; a parallel set avoids that but must be copied at every
`new Map(bindings)` site — the `for` arm (`:1089`), `par for` (`:2066`),
`walkOtherwise` (`:1159`, `:1161`), `walkFn` (`:1234`) and `matchArmScope`
(`:1228`) — and a missed copy leaks a mark past a scope exit, which is the same
bug pointed the other way. A fix taking this route enumerates the copy sites and
pins each with a cell.

**(c) Route 3 — remove the sharing at the source.** Have `collectTypeEnv` or
`unfoldAlias` hand back a per-call structure so no two readers of an alias share
an object. Consequence: closes the hazard for every identity-keyed consumer at
once, including `resultBindings`. Cost: the change lands in the shared
`type-compat` layer rather than in the walk that has the defect;
`unfoldAlias` is exported, is called from `checkCompatible` (`:139`) on every
compatibility question, and is reused across modules, so per-call allocation is
both a hot-path cost and a contract change for callers this report has not
audited. Route 3 is the widest and is recorded for completeness; routes 1 and 2
are the ones the evidence supports.

**(d) Constraints binding every route.**

1. **The `par for` arm moves in the same commit.** Measured (§Reproduction (b)),
   the two arms write to one set and suppress across each other in both
   directions. A fix landing at `:1110–1116` alone leaves the defect reachable
   at `:2065–2080` with an identical fixture. Unlike bug 0126's §Fix (a) route
   choice — where the two arms' non-`array` fallbacks legitimately differ — the
   marking step is byte-identical in both arms and has no discriminating
   parameter, so a shared helper is available here where it was not there.
2. **The marking survives.** Cell `e4`
   (`tests/plain-for-loop-variable-element-type.test.ts:1402–1410`) emits
   `expected string, got integer` if the marking is deleted. Its fixture is an
   inline `array<integer>` field, so its marked object is shared with nothing
   and it stays green under all three routes; a route that reds it has removed
   the withhold instead of re-keying it.
3. **GOV-15, addition arm.** Every §Reproduction (a)–(c) fixture loads cleanly
   today and would gain an `E`, and an error-severity `theta/parse/*` denies
   registration (`production-composition.ts:2214–2221`). That is observable (b)
   moving under the *Diagnostic-registry carve-out*
   (`source-language-stability.md:25`), in the same strictly-narrower shape as
   the 0031 → 0084 → 0126 chain: a *Trigger* becoming reachable at an input
   class with a byte-unchanged registry. No code is added, removed or renamed;
   no *Message* is reworded (DIAG-2 / DIAG-4).
4. **Observable (c) is unmoved.** No `<type>` placeholder changes: the emissions
   that appear are the registry's own template rendered over the element type
   the loop variable already carries.
5. **Corpus.** Measured: 0 of the 34 committed `.theta` / `.thetalib` files
   declare an alias schema, and only `docs/examples/fan-out-reviews.theta`
   contains a loop (`:19`, `:28`), over non-alias iterands.
   `tests/committed-fixture-parse-gate.test.ts` is the corpus-wide discharge per
   `AGENTS.md`.
6. **Witness.** No in-tree cell drives two loops over one alias, so the witness
   is new: the (a) triple, the (b) four-way arm matrix, the (c) reach rows
   (cross-`fn`, top-level, third loop, transitive `let`, nested alias chain,
   `let`-bound iterand, laundered iterand, string alias), and the (d)
   non-reaching rows as regression pins. The (d) rows are the ones that prove
   the route did not over-correct by removing the withhold.

**(e) Coordination with bug 0190 — no ordering constraint, a re-derivation
clause.** Every unprovable iterand that reaches the marking at HEAD is rooted in
`provableArgType`'s `member` / `method-call` arm (§Reproduction (e)), which is
bug 0190's subject. If 0190 lands first, `p.xs` becomes a proof and this
report's fixtures stop poisoning; the mechanism is untouched, but the
reproduction must be re-derived against whatever unprovable-and-array-typed
shapes remain, and the witness must be built on one of those. If this report
lands first, 0190's fix re-derives cell `e4` as its own §Fix already
anticipates, and none of this report's cells depend on the member arm's verdict
except through their fixtures. Whichever lands second re-measures; neither
blocks the other.

## Provenance

- **Origin:** the bug 0126 fix (commit `3d05fd46`, 0.107.0), §Fix *Residuals*
  item 4 in `docs/bugs/0126-plain-for-binds-no-loop-variable.md:1358–1365`:
  "**`unprovableBindings` marks by object identity, and a `TypeEnv` alias's
  element object is shared.** … an unprovable `for a in p.xs` marks the shared
  alias element, which then suppresses a true `fn-arg-type-mismatch` in a later
  `for b in ys { g(b) }` over a provable `ys: L`. The `par for` arm has the
  identical behaviour at this baseline, the settled §Fix ordered the marking
  mirrored, and the failure direction is the admissible one — a withheld true
  positive, never a false `E`. Filing candidate covering both arms."
- **The run report:** `.pi/tmp/fixes/0126-report.md` §"Residuals / notes" item 2,
  which adds the pre-existence finding in terms: "**The `par for` arm has the
  identical behaviour at HEAD** — pre-existing, not introduced here."
- **The machinery's owner:**
  `docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md`
  (fixed 0.77.0) — the wired sink, both identity sets, and the
  withholding-can-only-suppress posture this defect inherits.
- **The defect sites and the channel:** `src/parser/type-layer-checks.ts:906`
  (the set), `:893–905` (its identity contract), `:1110–1116` (the plain `for`
  marking), `:2065–2080` (the `par for` marking), `:1810–1819` (the only read),
  `:1592–1644` (`checkFnCallArgs`), `:1671` (`provableArgType`), `:1821–1836`
  (the `member` arm, bug 0190's), `:1019–1020` and `:1043–1053` (the `let` arm's
  laundering), `:1198–1204` (`recordWithheldBinders`), `:1089` (the scope copy),
  `:2004` (`walkExpr`'s `call` arm).
- **Why the object is shared:** `src/parser/type-layer-checks.ts:328–357`
  (`collectTypeEnv`), `:333`, `:345`, `:786–800` (`collectSchemaFields`),
  `:810–832` (`annotationToCompatType`), `:235–260` (`checkTypeLayer`);
  `src/parser/type-compat.ts:155–172` (`unfoldAlias`), `:169`, `:104–106`
  (`resolveNamed`).
- **The emitter and registration:** `src/parser/type-compat.ts:461–489`
  (`checkFnArgCompat`), `:139`, `:327`;
  `src/extension/production-composition.ts:2214–2221` (`hasLoadParseError`).
- **The spec:** `docs/spec_topics/type-system.md:27`, `:48`, `:50`, `:54`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:120`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.
- **The pins:** `tests/plain-for-loop-variable-element-type.test.ts:1402–1410`
  (cell `e4`); `tests/member-access-declared-field-type.test.ts:961`,
  `:1070–1082` (row `x11`); `tests/fn-arg-type-mismatch-wired.test.ts` (bug
  0050's witness for the suppressed row).
- **Measurement:** offline scratch vitest at HEAD `5c9104ab`, driving the real
  `parseThetaDocument` through `parseDoc` (`tests/helpers/e2e-s1.ts`).
  Thirty-three rows across §Reproduction (a)–(e), each with its control.
  Written, run, deleted.

## Fix (0.113.0)

- **What shipped**, keyed to §Fix:
  - **§Fix (a), route 1 — copy on mark, at both loop arms, through ONE shared
    helper.** `src/parser/type-layer-checks.ts`: a new private
    `TypeLayerWalk.bindLoopElement` resolves the iterand's proof verdict once,
    records the loop variable in the body scope, and marks it in
    `unprovableBindings` when the iterand is not a proof — recording and marking
    a fresh `{ ...element }` twin **iff** unproven, and the borrowed object
    itself otherwise. `walkStmt`'s `case "for"` (`unfolded.kind === "array"`
    branch) and `walkExpr`'s `case "par-for"` both call it; the `for` arm's
    non-`array` `recordWithheldBinders` fallback and the `par for` arm's
    `named "unknown"` element are unchanged. The marked object is now reachable
    from exactly one scope entry, which is what `unprovableBindings`' own doc
    comment already asserted and what the borrowed object made false.
  - **§Fix (d) constraint 1 — both arms, lock-step, one commit.** A shared
    helper rather than two edits: the marking step is byte-identical in both
    arms and has no discriminating parameter, and the arms write to the one set,
    so a fix at one arm alone leaves the defect reachable through the other
    keyword. Both call sites move in this commit.
  - **The `resultBindings` carry — required by route 1's own warrant, not a
    widening of it.** Route 1 stands or falls on the twin being a faithful
    stand-in for the object it copies, and identity-keyed membership is part of
    what that object carries. `bindLoopElement`'s unproven branch therefore
    inherits bug 0079's provenance across the copy —
    `if (this.resultBindings.has(element)) { this.resultBindings.add(recorded); }`
    — which restores the pre-fix verdict exactly and can add no emission,
    because it fires only where the copied object already carried the
    membership. Found by review round 1, measured at both ends (below).
  - **Route adjudication, with grounds.** Route 1 over route 2 (key the withhold
    by binding name/scope) and route 3 (uncopy the sharing at the source), on
    three grounds. (i) **The route-1 audit is complete and bounded, and it was
    re-verified rather than assumed:** all of `src/` holds exactly two
    `Set<CompatType>` and no `Map<CompatType, …>` — `unprovableBindings` (one
    read, `provableArgType`'s `ident` arm) and `resultBindings` (one read,
    `interpolationIsResult`'s `ident` arm) — and no other `CompatType` identity
    comparison exists anywhere. Both channels are accounted for at the marking
    site: the first is set explicitly, the second inherited. (ii) **Route 2's
    diff carries a false-`E` risk in the other direction.** A name-keyed
    withhold must be copied at every `new Map(bindings)` site *and* cleared at
    every `bindings.set` that rebinds a marked name; a missed copy leaks a mark
    past a scope exit (suppression), a missed clear withholds a proof
    (suppression), and a wrong clear manufactures an `E`. Route 1 needs neither
    invariant: the object it marks is the object the scope holds, by
    construction. (iii) **Route 3 was rejected as §Fix (c) frames it** —
    `unfoldAlias` is exported and called from `checkCompatible` on every
    compatibility question, so per-call allocation is a hot-path cost and a
    cross-module contract change over callers this report never audited.
  - **The `let` arm is a live suppression route at this baseline and is
    deliberately NOT in this fix.** Measured: with `schema P { xs: L }` and an
    erased `m`, `let zs = m.xs` marks the borrowed field object and a later
    `let ws = q.xs` over a proven `q` records the same object, so `hs(ws)`'s
    true `expected array<string>, got array<integer>` is withheld — deleting the
    `let zs` line restores it. Three grounds for the exclusion. (i) §Fix (d)
    constraint 1 names only the two LOOP arms as the lock-step obligation. (ii)
    §Non-goals pins `resultBindings` as unreached by routes 1/2 in terms, and
    the `let` arm's recorded object is that set's ONLY feed. (iii) Measured, a
    twin at that site BREAKS bug 0079: `let r = Ok(1)` / `let c = r` /
    `` @`x${c}` `` draws `theta/parse/interpolated-result` at this baseline
    *solely* because `c` and `r` share one object, so copying there withholds a
    registered `E` across a protected 49-cell family. Preserving it would need a
    provenance carry inside 0079's channel for a shape this report never
    measured. Cell `d6` pins the `let` arm's behaviour as a BOUND — unmoved,
    before and after — and residual 1 below carries the evidence.
  - **§Reproduction re-derived at the fix's baseline (§Fix (e)).** Bug 0190
    (0.111.0) made a member read of a declared field on a resolved object schema
    a proof, so **every fixture in §Reproduction (a)–(c) stopped poisoning**:
    `for a in p.xs` over an annotated `p: P` now emits the mismatch at the later
    loop, and so does the laundered `let zs = p.xs`. The witness is built on the
    shape that remains — an **erased receiver**, which is 0190's own
    receiver-proof obligation withholding: `let m = flag ? A { xs: [1] } :
    B { xs: ["a"] }` is not a proven reduction, so `m.xs` unfolds to an array
    while `provableArgType` withholds, and the marking fires. A composite
    containing one (`flag ? ys : m.xs`) reaches it too. Measured non-reaching,
    unchanged from §Reproduction (e): a user `fn` call and an `invoke`, whose
    static type is a nominal minted from the callee and never unfolds to an
    array.
  - **All THREE shared-object families reproduce and are closed.** (1) the
    `TypeEnv` **alias element** — `collectTypeEnv` calls
    `annotationToCompatType` once per alias declaration per parse and
    `unfoldAlias` returns it by reference (cells a1–a3, b1–b3, c1, c2, c5–c9);
    (2) the **declared-field object** — `collectSchemaFields` builds one
    `CompatType` per declared field per parse and bug 0190's
    `declaredFieldType` hands it back by reference, so an unprovable read off an
    erased receiver suppressed a later loop over ANOTHER proven receiver's same
    field, with no alias anywhere in the fixture (cell c3); (3) the
    **`params:`-seeded object** — bug 0192's `paramsFieldBindings` seeds one
    `CompatType` per `params:` field per parse (cell c4). Copy-on-mark is
    provenance-agnostic: it copies whatever object the arm was about to mark, so
    one helper closes all three, and the `walkFn`-seeded annotated `fn`
    `array<T>` parameter shape with it (measured).
  - **§Fix (d) constraint 2 — the marking survives.** Cell `e4` of
    `tests/plain-for-loop-variable-element-type.test.ts` was FLIPPED by bug 0190
    and now EMITS off a proven member iterand, so the doc's "`e4` stays `[]`" is
    stale; it is green under this fix, as is that file's group (g). The
    constraint's content is carried instead by cell `d5`: an unproven iterand's
    OWN loop variable is still withheld at the fn-arg slot (`[]`), which reds if
    the marking is deleted rather than re-keyed — verified by neutralisation.
  - **§Fix (d) constraint 3 — GOV-15 addition arm, enumerated.** Every program
    that newly gains an `E` is a two-loops-over-one-shared-element shape in one
    of the three families above, in any of the four arm orders; each loads
    cleanly at 0.112.0 and each newly draws `theta/parse/fn-arg-type-mismatch`,
    which `hasLoadParseError` turns into a registration denial. That is
    observable (b) moving under the *Diagnostic-registry carve-out*, in the
    strictly-narrower shape of the 0031 → 0084 → 0126 chain: a *Trigger*
    becoming reachable at an input class with a byte-unchanged registry. No code
    added, removed or renamed; no *Message* reworded (DIAG-2 / DIAG-4); `docs/`
    carries no registry or spec change in this commit.
  - **§Fix (d) constraint 4 — no false `E`.** The set's only read feeds
    withholding decisions, so re-keying a mark can only restore a suppressed
    true positive. The twin is value-equal by construction — every VALUE-channel
    reader (`containsWithheldBinderType`, `checkCompatible`, `displayType`)
    recurses structure — and the §Reproduction (d) rows are pinned unmoved, row
    4 included: the typed-`let` sink still emits
    `theta/parse/let-rhs-type-mismatch` on a poisoned loop variable, because it
    reads the map by VALUE (cell `d3`).
  - **§Fix (d) constraint 5 — corpus, re-measured.** 34 committed
    `.theta` / `.thetalib` files, **0** declaring an alias schema of any shape;
    one file contains a loop (`docs/examples/fan-out-reviews.theta`), over
    non-alias iterands. `tests/committed-fixture-parse-gate.test.ts` (36 cells,
    green) is the corpus-wide discharge per `AGENTS.md`; its own accounting is
    31 `.theta` + 2 `.thetalib` shipped plus one deliberately-invalid seeded
    fixture.
  - **§Fix (d) constraint 6 — the witness is new.**
    `tests/loop-element-withhold-binding-scoped.test.ts`, 30 cells, additive:
    the (a) suppression triple with BOTH controls (delete and reorder), the (b)
    four-way arm matrix (for→for is a1; par→for, for→par, par→par), the (c)
    reach rows (cross-`fn`, composite iterand, the declared-field family, the
    `params:` family, third-loop monotonicity, transitive unannotated `let`,
    nested alias chain, `let`-bound iterand, string alias in the reversed
    direction), the (d) fences (two provable loops, minted-literal element,
    typed-`let` sink, named-object-vs-element discrimination, `d5`'s withhold
    survival, `d6`'s `let`-arm bound), and the (e) group pinning the
    `resultBindings` carry in both arms with two controls. Whole ordered
    diagnostics arrays throughout, messages read from the registry (DIAG-4),
    ranges pinned on the (a) triple. Plus additive H8a live cell 50 in
    `tests/live/live-production-acceptance.test.ts`.

- **Gates** (each re-run by the orchestrator, not taken from a nested report):
  - *Witness*: `npx vitest run tests/loop-element-withhold-binding-scoped.test.ts`
    → `Tests 13 failed | 13 passed (26)` before the fix, every red the ABSENT
    `theta/parse/fn-arg-type-mismatch` (`Array []` against the expected code);
    `Tests 30 passed (30)` after.
  - *Full suite*: `npm test` → `Test Files 316 passed (316)`,
    `Tests 5345 passed (5345)`. Baseline 315 / 5315 plus the 30 new cells; no
    other file moved.
  - *Typecheck*: `npx tsc --noEmit -p tsconfig.json` → exit 0, no output.
  - *Lint*: `npm run lint` → exit 0, no output.
  - *Live, for real*: H8a cell 50 → `Tests 1 passed | 49 skipped (50)` (the 49
    are the `-t` filter, not a skip); both H9a acceptance files →
    `Test Files 2 passed (2)`, `Tests 11 passed (11)`, spawning the real `pi`
    binary in print mode. `tests/fixtures/h7a/permitted-codes.json` needed no
    append — the run decided it, and the `permittedCodesSubset` invariant held.

- **Blast-radius pre-measurement** (before the witness was written): the settled
  route was prototyped and the FULL suite run — 315 files / 5315 tests green,
  identical to baseline, zero reds. A vehicle sweep over every test fixture
  found no cell driving two SEQUENTIAL loops over one shared element; the tree's
  multi-loop fixtures are all NESTED, matching §Affected's "Test coverage of
  this defect: none". The one flip the pre-measurement MISSED is recorded as the
  review's own finding below — no in-tree cell drives that shape either.

- **Review**: 2 rounds.
  - *Round 1 (deep)*: SIX findings. **F1, correctness blocker** — the twin
    severed bug 0079's `resultBindings` provenance and DROPPED a registered `E`:
    measured at both ends, `let r = Ok(1)` / `let xs = [r]` /
    ``for b in xs { @`x${b}` }`` gave `[interpolated-result]` before the fix and
    `[]` with the un-remedied fix, because `commonType`'s single-candidate
    clause returns its candidate BY REFERENCE, so the array's element IS the
    object `resultBindings` holds. F2 — the helper's audit paragraph asserted
    what F1 falsified. F3 — the witness header cited five
    `type-layer-checks.ts:NNN` lines this commit moves; converted to
    symbol-only, the convention the 0126 and 0192 witnesses over this module
    keep. F4 — live cell 50's standing "documented correct-reason RED" banner
    was false at ship (green in its birth commit); reworded to a version-pinned
    past red-proof. F5 — `unprovableBindings`' field comment contradicted itself
    on its writers; now enumerates four. F6 — the WHY-mark rationale from the
    deleted `par for` inline comment was restored into the helper and the
    dangling "mirrors the `par for` arm" clause re-pointed.
  - *Round 2 (fast)*: CLEAN. No findings; one non-blocking prose residual
    (residual 4 below).

- **Verification**: PASS, four obligations, three neutralisations.
  - *The witness reds without the fix, and reds for the right reason*: (1a) the
    whole helper collapsed to pre-fix behaviour → 13 failed / 17 passed, exactly
    a1/b1–b3/c1–c9, groups (d) and (e) green; (1b) the `resultBindings` carry
    alone dropped → EXACTLY `e1` and `e2` red, everything else green, so the
    carry is load-bearing and not decoration; (1c) the marking deleted entirely
    → `d5` reds, the anti-over-correction pin. All three restorations byte-exact
    by blob hash (`f368133a…` pre, neutralised `9f22aaad…` / `d9ee8bb2…` /
    `2c632747…`, restored `f368133a…`), no `git stash`, no `git checkout`. The
    verifier corrected one orchestrator forecast on the record: group (e) does
    NOT red under (1a), because with no twin the recorded object IS the
    `resultBindings` member and membership is trivially preserved — the carry's
    necessity is observable only once a twin exists, which is what (1b)
    isolates.
  - *Full default suite green*: 316 files / 5345 tests.
  - *Live end-to-end exercise of the fixed path*: H8a cell 50 and both H9a
    acceptance files, all green, run for real; no live red, so no attribution
    was needed.
  - *Lint and typecheck*: exit 0 both, using the `package.json` definitions.
  - Protected families re-run explicitly and green: `interpolated-result-gate`
    (49), `plain-for-loop-variable-element-type` (53),
    `fn-arg-type-mismatch-wired` (87), `member-access-declared-field-type` (72),
    `params-declared-type-in-type-layer` (32), `committed-fixture-parse-gate`
    (36).

- **Residuals** (for the PARENT to file; no bug document is created here):
  1. **The `let` arm marks a BORROWED object too, and it is a live suppression
     route.** `walkStmt`'s `let` arm marks whatever `typeOf` returned for the
     initialiser, which for a member read is the declared-field object. Measured
     at this baseline with `schema L = array<integer>`, `schema P { xs: L }`,
     `schema B { xs: array<string> }`, `fn hs(a: array<string>)` and an erased
     `m`: `let zs = m.xs` then `let ws = q.xs` over a proven `q: P` then
     `hs(ws)` → `[]`, where deleting the `let zs` line →
     `error theta/parse/fn-arg-type-mismatch :: fn 'hs' argument 0 ('a') type
     mismatch: expected array<string>, got array<integer>`. Same class as this
     report, same admissible direction, different marking site, and a
     WHOLE-array object rather than an element. Cell `d6` pins it unmoved.
     **A fix there cannot copy the way this one does**: the `let` arm's recorded
     object is `resultBindings`' only feed, and measured, a twin there withholds
     `theta/parse/interpolated-result` on `let r = Ok(1)` / `let c = r` /
     `` @`x${c}` `` — so it needs the provenance carry this fix introduced at
     the loop arms, extended to the membership a `let` may itself mint. Not
     fixed: §Fix (d) constraint 1 and §Non-goals both scope this report to the
     two loop arms.
     **Discharged in 0.120.0** by bug
     [0199](./0199-let-arm-marks-borrowed-object-suppression.md), which takes the
     `let` arm as its subject and ships route 1 there: the arm resolves one
     `recorded` object — a `{ ...rhsType }` twin iff the initialiser is not a
     proof — and records, marks, MINTS and inherits off that one object, so the
     provenance carry this fix introduced at the loop arms is extended to the
     membership a `let` mints. **One sentence of this item is corrected by that
     measurement.** `let r = Ok(1)` / `let c = r` / `` @`x${c}` `` is a PROOF
     chain, not a marking pair: `provableArgType`'s `result-ctor` arm answers
     `typeOf`, so neither binding is `initUnprovable`, neither takes a twin, and a
     copy conditioned on that verdict never reaches the pair. The pair that DOES
     bind is a `call` to a `Result`-returning `fn` — `fn mk(): Result<integer,
     QueryError>`, `let r = mk()` / `let c = r` — where `isCertainResultNode`
     mints and the unconditional `call` withhold marks over ONE object, so a twin
     that re-points neither drops `theta/parse/interpolated-result` at both
     bindings and a twin that re-points only the mint drops it at `c`. This item's
     conclusion is unchanged and strengthened. Item 2 below is NOT discharged: the
     by-reference deeper source is untouched, and 0199 measures bug 0079's
     membership still travelling through an array literal and a ternary by
     reference, which a deep copy would sever.
  2. **`commonType`'s dominating-candidate clause returns its candidate BY
     REFERENCE, which is the deeper source.** It is how an array literal's
     element comes to be the very object a sibling binding recorded, and it is
     what made F1 reachable. This fix mitigates at the marking sites, which is
     §Fix routes 1/2's whole posture; the source itself is §Fix route 3's
     territory (`unfoldAlias`'s and the inference pass's aliasing contracts) and
     is untouched. One consequence is visible without any loop: a
     `let xs = flag ? [r] : ["a"]` over a `Result`-recorded `r` carries the
     membership through the composite. Not measured further, not filed here.
  3. **Three `theta/parse/*` codes have no row on the four sharded spec registry
     pages**: `par-query-in-body`, `par-shared-mutation`, `par-break-continue`,
     all three stated in `control-flow.md` prose under CTRL-4 and all three
     tabulated in `docs/reference/diagnostics.md`. Cell `e2` needs
     `par-query-in-body`'s *Message* for its whole-list assertion, so the
     witness reads the sharded pages first and falls back to
     `docs/reference/diagnostics.md` — whose own header declares that column
     normative under DIAG-4 — throwing loudly and naming both pages when
     neither carries the code. Pre-existing gap, disclosed, no `docs/` file
     touched.
  4. **A house-convention phrase in the live acceptance file names a no-op
     hook.** "through the real production composition root (`session_start →
     resources_discover → composeExtensionInstance → checkTypeLayer`)" appears
     byte-identically at 17 sites in
     `tests/live/live-production-acceptance.test.ts`, the new cell included;
     read as a literal call chain it is inaccurate, because `resources_discover`
     is registered as a no-op handler and the compose work runs inside the
     `session_start` handler. Pre-existing at 16 of the 17 sites; rewording one
     would leave the file inconsistent. Assertions are unaffected — they observe
     `bootShippedExtension`, not the comment. Reported, not swept (bug 0134's
     class).
  5. **Line-number citation drift from this commit, disclosed and not chased.**
     The fix adds 124 lines to `src/parser/type-layer-checks.ts`, so `path:line`
     citations at or after the `unprovableBindings` field shift. A sweep found
     roughly 303 such citations across about 54 files under `docs/bugs/`
     (`README.md` included) and ten test files. None was edited: chasing them is
     bug 0134's class, and the test files are protected witnesses. Citations
     below that field are unaffected. This document's own §Affected line numbers
     are stale in the same way, as its 0.107.0 baseline already made them.

- **Discharge notes appended**: bug 0126's §Fix *Residuals* item 4 (this
  report's origin) and bug 0192's §Fix *Residuals* item 1 (shared-element
  identity poisoning reaching `params:`-declared arrays). Neither status was
  flipped.

- **Pinned dispositions / non-goals**: the withholding posture itself (bug
  0050's, and correct — cell `d5` pins it); bug 0190's `member`-arm proof rule
  (this fix's reachability supplier, untouched); the `non-array-iterand` renders
  of §Reproduction (e) (the `named "<own spelling>"` fallback family, bug 0126's
  §Non-goals and RFC 0008); `resultBindings`' SEMANTICS (the carry inherits a
  membership, it never mints one — the `let` arm remains the sole judge of what
  is `Result`-valued); the nine type-layer codes bug 0126 made reachable (they
  read the map by VALUE and are measured unmoved); route 3.
