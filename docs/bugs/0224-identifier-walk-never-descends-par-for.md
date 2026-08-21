# Bug 0224 — `checkUnknownIdentifiers`' scope-tracking walk carries no `par-for` arm, so every identifier a `par for` spells — its iterand, its `max` operand and everything in its body — is judged by nothing: `par for i in [1, 2] { Zzz }` loads with zero diagnostics and yields `[Ok(null), Ok(null)]` at run, where the plain-`for` spelling of the same body draws `theta/parse/unknown-identifier`

- **Status:** fixed (0.164.0). Filed as bug
  [0118](./0118-nested-fn-result-return-defers-to-runtime-panic.md)'s §Fix
  (0.162.0) *Residuals* item 2, which records the omission after that fix took
  its §Fix (c) arrangement 2 — the structural walk alone — and states that
  widening the identifier walk "changes which names a `par for` body resolves
  against … and needs its own measurements". Re-measured at HEAD for this
  filing, not copied.
- **Sev/Diff estimate:** S1/D2 — S1 because a name the spec refuses is accepted
  with no diagnostic on any channel and the run then produces wrong values
  rather than failing: an undeclared identifier and a declared `schema` / `enum`
  name both evaluate to `null` per iteration (§Reproduction R1, R2), arithmetic
  over that `null` yields a silently wrong number (R5: `Zzz + 1` → `Ok(1)`), a
  member read on it becomes that element's `Err(invoke_infra, cause:"panic")`
  naming only `.f` (R6), and an undeclared CALL callee becomes an
  `Err(invoke_infra, cause:"internal_error")` whose message blames a different
  gate — bug 0003's `theta/parse/tool-arg-not-object-literal` (R3). D2 because
  the change is one `case "par-for"` in one walk in one file, in the shape bug
  0118 landed for its sibling walk, minting no diagnostic code and adding no
  registry row; the coordination is bounded and named — cell g9 of
  `tests/type-name-as-value-refusal.test.ts` flips, and
  `theta/parse/type-as-value`'s registered *Trigger* loses the reach-gap
  paragraph it currently carries.
- **Kind:** defect — implementation, one traversal, measured at HEAD `c7c5d828`
  (v0.163.0, `package.json:3`).

  `expressions.md:44–:51` states identifier resolution as four arms and two
  refusals — `theta/parse/unknown-identifier` for a name matching no arm,
  `theta/parse/type-as-value` for a bare `schema` / `enum` name at a value
  position — with no exemption for any construct. `walkIdentExpr`
  (`src/parser/theta-document.ts:5434`), the recursion
  `checkUnknownIdentifiers` (`:5279`) drives, has no `case "par-for"`: the node
  falls into the `default` arm (`:5518–:5520`), whose comment enumerates
  "number / string / bool / null / query". So the construct's iterand, its `max`
  width operand and its whole body are never visited, and both refusals are
  silent for every name written anywhere inside a `par for`.
- **Affected** (every citation verified against the tree at HEAD `c7c5d828`;
  symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication, since bug 0118's fix inserted lines into this same file):
  - **The walk with the missing arm** — `walkIdentExpr`
    (`src/parser/theta-document.ts:5434`), whose `default` arm
    (`:5518–:5520`) absorbs a `par-for` node. Its statement sibling
    `walkIdentStmt` (`:5354`) has the plain-`for` arm that binds the loop
    variable before descending (`:5389–:5395`) and the closure-free `fn` arm
    (`:5396–:5405`); `walkIdentBlock` (`:5339`) is the block entry.
  - **The check and its context** — `checkUnknownIdentifiers` (`:5279`), whose
    doc comment states the three-way rule and the scope discipline, and
    `IdentWalkContext` (`:5217`) with its three fields (`roots`,
    `typeOnlyNames`, `declaredEnums`) — bug 0140's landed shape, which a
    `par-for` arm threads unchanged.
  - **The sink** — `emitUnknownIdentifier` (`:5303`), where the unconditional
    scope-shadow test runs first (`:5312`) and the two codes are pushed. No new
    emitter is needed: an arm that arrives here for a `par for` body's names
    draws both refusals from the sites that already exist.
  - **The roots fold** — `collectIdentRoots` (`:5138`), called twice at
    `:942–:946` (once whole, once over a `schema`/`enum`-free statement list),
    feeding the `checkUnknownIdentifiers` call at `:953`. Unchanged by this
    report: the gap is reach, not root membership.
  - **The two sibling walks that DO descend a `par for`, and the shape to
    mirror** — `walkCallSiteExpr`'s arm (`:6353–:6364`), whose comment names
    this gap in terms ("Reached explicitly (unlike the ident walk, which
    predates RFC 0003)") and which binds the per-iteration variable at `:6362`;
    and `walkExpr`'s arm (`:7637–:7648`, inside `walkExpr` at `:7413`) — bug
    0118's landed §Fix (a), which walks iterand, then `max`, then the body
    through `walkBlock` with `{ ...scope, inLoop: true, topLevel: false }`.
  - **The runtime that consumes the un-refused name** —
    `evaluatePureExpression`'s `ident` arm
    (`src/extension/production-theta-producer.ts:6366–:6369`): a name whose
    resolution arm is not `"local"` evaluates to `null`, with no throw and no
    diagnostic. The per-iteration boundary is
    `runParForIteration` (`src/runtime/statement-executor.ts:1209`), called at
    `:1384`, whose CTRL-5 downgrade (`:1205`) turns a later panic over that
    `null` into `Err(invoke_infra, cause:"panic")`.
  - **The LOCK this document's own authority flips** — cell g9 of
    `tests/type-name-as-value-refusal.test.ts:1733`, bug 0140's witness. It is
    a REACH FACT, pinned green: a declared name in a `par for` body, an
    undeclared name in the body, an undeclared iterand and an undeclared `max`
    operand each draw no identifier-resolution diagnostic, with a plain-`for`
    control proving the silence belongs to the construct. Its in-file comment
    names this report's class — "A PRE-EXISTING GAP IN THE WALK'S REACH, pinned
    so a later widening is DELIBERATE rather than incidental" — and assigns the
    gap to bug 0118. It holds verbatim at HEAD (measured: 62/62 passing), and
    the group header at `:1554–:1557` states the distinction it draws: g9 is
    "the one construct the walk never DESCENDS at all rather than a position it
    reaches and declines". **Fixing this report flips g9 under this
    document's authority**, and its subject is restated rather than deleted:
    the cell keeps its fixture and its plain-`for` control and asserts the
    refusals it currently asserts absent (§Fix (d)).
  - **The other pinned cell over the same subtree** —
    `tests/par-for.test.ts:506–:526`, bug 0118's cell (r2), which pins that a
    call to a nested `fn` in a `par for` body draws NO
    `theta/parse/unknown-identifier`. The file is green at HEAD (measured:
    69/69). Its `not.toContain` clause flips with g9 (§Fix (d)); the group
    comment at `:395–:397`, which cites `walkIdentExpr` as `:5371`, is stale by
    63 lines at HEAD and is corrected in the same commit.
  - **The registered rows** — `theta/parse/unknown-identifier`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:66`; Sev `E`, Phase
    `parse`, *Trigger* "Bare identifier in call or value position resolves to
    nothing in scope", which states no construct exemption) and
    `theta/parse/type-as-value` (`:89`), whose *Trigger* carries the reach gap
    as prose: "One construct sits outside this row's REACH rather than outside
    its rule … identifier resolution carries no `par for` arm and never
    descends the construct … That gap is pre-existing and is bug 0118's
    subject". `docs/reference/diagnostics.md:112` and `:138` mirror the Message
    column only, so no mirror edit follows from a *Trigger* change.
  - **The normative source** — `docs/spec_topics/expressions.md:44–:49` (the
    four resolution arms), `:51` ("No match is
    `theta/parse/unknown-identifier`" and the `type-as-value` sentence), `:53`
    (the shadowed-callable rule that names the `par for` variable among the
    locals arm (1) binds). `docs/spec_topics/control-flow.md:74` (CTRL-3),
    `:76` (CTRL-4's body restrictions), `:78` (CTRL-5's panic downgrade).
  - **The corpus datum** — exactly one committed fixture spells a `par for`:
    `docs/examples/fan-out-reviews.theta:19–:21`, whose body reads the loop
    variable `path` and calls `review_lens`, the callable name derived from the
    `tools:` entry `./review-lens.theta` (`:4–:5`). Both resolve, so the
    widening must leave it clean; that claim is discharged by
    `tests/committed-fixture-parse-gate.test.ts`, not by a scratch probe.
- **Observed at:** v0.163.0 (`c7c5d828`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns: three scratch vitest files
  (written, run, deleted) driving the real `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts`'s `parseDoc`, and — for the R rows — the real
  production prompt-mode binding (`createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`) over the
  `tests/interpolated-result-gate.test.ts` live-session double. Every value
  below is that run's output verbatim. No file in `src/`, `tests/`,
  `docs/bugs/README.md` or any other bug document was modified by this filing.

## Summary

Bug 0118 measured five traversals crossing a `par for` subtree and found two
that never arrive: the parse-phase structural walk and the identifier walk. Its
§Fix (c) offered both arrangements and its fix took arrangement 2 — widen the
structural walk alone — because the nested-`fn` refusal it owed did not need a
second code. `walkExpr` gained a `case "par-for"`
(`src/parser/theta-document.ts:7637`); `walkIdentExpr` (`:5434`) did not.

So at HEAD the identifier walk still has no `par-for` arm. The node falls into
the `default` arm (`:5518–:5520`) and the construct's iterand, `max` operand and
body are never visited. Both of the walk's refusals are therefore silent
throughout a `par for`: an undeclared name draws no
`theta/parse/unknown-identifier` and a declared `schema` / `enum` name used as a
value draws no `theta/parse/type-as-value`, in the body, in a nested block of
the body, in a `match` arm inside the body, in the iterand and in the `max`
operand. The plain-`for`, `while` and top-level spellings of the same shapes all
refuse.

The load-time silence is not the end of it. The production evaluator's `ident`
arm (`production-theta-producer.ts:6366`) answers `null` for a name that
resolves to no local, so the un-refused name becomes a value: the iteration
yields `Ok(null)`, `Zzz + 1` yields `Ok(1)`, a `.f` read yields that element's
`Err(invoke_infra, cause:"panic")` message "null member access: .f", and an
undeclared callee yields an `Err(invoke_infra, cause:"internal_error")` whose
text blames bug 0003's parse-time shape gate. A misspelling inside a `par for`
body is neither refused at load nor reported as a misspelling at run.

## Reproduction

Offline at `c7c5d828`, zero model turns. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines), so a body line numbered 4 is
the first source line. `diagnostics` is the whole unfiltered
`doc.diagnostics`. `UNKNOWN` is `error theta/parse/unknown-identifier`,
`TYPE-AS-VALUE` is `error theta/parse/type-as-value`.

### (A) The two refusals, inside a `par for` and outside it

| row | source under test | diagnostics |
| --- | --- | --- |
| A1 **IN-CLASS** | `let a = par for i in [1, 2] { Zzz }` | `[]` |
| A2 CONTROL, plain `for` | `for i in [1, 2] { Zzz }` | UNKNOWN `'Zzz'` |
| A3 CONTROL, top level | `let a = Zzz` | UNKNOWN `'Zzz'` |
| A4 CONTROL, `while` body | `while n > 2 { Zzz }` | UNKNOWN `'Zzz'` |
| B1 **IN-CLASS** | `schema P { a: number }` + `let a = par for i in [1, 2] { P }` | `[]` |
| B2 CONTROL, top level | `schema P { a: number }` + `let a = P` | TYPE-AS-VALUE `'P'` |
| B3 CONTROL, plain `for` | `schema P { a: number }` + `for i in [1, 2] { P }` | TYPE-AS-VALUE `'P'` |
| B4 **IN-CLASS**, enum | `enum E { A }` + `let a = par for i in [1, 2] { E }` | `[]` |
| C1 **IN-CLASS**, call position | `let a = par for i in [1, 2] { zzz(1) }` | `[]` |
| C2 CONTROL, top level | `let a = zzz(1)` | UNKNOWN `'zzz'` |

A1 and A2 differ by one word, and it is the whole reach gap. A2 and A3 verbatim:

```
error theta/parse/unknown-identifier: unknown identifier 'Zzz' @ 4:19-4:22
error theta/parse/unknown-identifier: unknown identifier 'Zzz' @ 4:9-4:12
```

B2 verbatim:

```
error theta/parse/type-as-value: type 'P' used as a value; a schema or enum declaration names a type, not a value @ 5:9-5:10
```

### (B) The extent of the silence, and what still fires

| row | source under test | diagnostics |
| --- | --- | --- |
| H4 | `par for i in [1, 2] { Zzz.f }` (member receiver) | `[]` |
| H5 | `par for i in [1, 2] { Zzz.len() }` (method receiver) | `[]` |
| H6 | `par for i in [1, 2] { for j in [1] { Zzz }` … `}` (nested block) | `[]` |
| H7 | `par for i in [1, 2] { match i { _ => Zzz } }` (match arm) | `[]` |
| H10 | `par for i in [1, 2] max Yyy { i }` (`max` operand) | `[]` |
| H11 | `par for i in [Zzz] { i }` (iterand element) | `[]` |
| H12 | `par for i in [1] { par for j in [1] { Zzz } }` (nested `par for`) | `[]` |
| H8 CONTROL | `par for i in [1, 2] { i }` (the loop variable) | `[]` |
| H1 | `fn f(): number { 1 }` + `par for … { f }` | `error theta/parse/function-as-value` |
| H2 | `enum E { A }` + `par for … { E.Zz }` | `error theta/parse/unknown-variant` |
| H3 | `par for read in [1, 2] { read({ path: "x" }) }`, `tools: [read]` | `error theta/parse/shadowed-callable-call` + `error theta/parse/bare-object-literal` |

H1 and H2 are bug 0118's landed structural-walk arm firing in the same subtree
(its cells (r7), (r22)); H3 is the call-site walk's arm, which names the loop
variable in its message ("resolves to the local par for variable at line 6").
So the silence is this one walk's, not the subtree's. H8 is the control that
constrains the fix: the loop variable resolves today and must keep resolving.

The one code that does cross the boundary from another traversal:
`let c = par for z in Zzz { z }` draws
`error theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got Zzz`
— the type layer's own iterand verdict, on a name identifier resolution never
judged.

### (C) Runtime — what the un-refused name becomes

Real production prompt-mode binding, `executeBody`'s final value verbatim. Every
row's `parse-errors` is `[]` and no text reached `pi.sendUserMessage`.

| row | source under test | value |
| --- | --- | --- |
| R1 | `par for i in [1, 2] { Zzz }` | `[{ok:true,value:null},{ok:true,value:null}]` |
| R2 | `schema P { a: number }` + `par for i in [1, 2] { P }` | `[{ok:true,value:null},{ok:true,value:null}]` |
| R5 | `par for i in [1, 2] { Zzz + 1 }` | `[{ok:true,value:1},{ok:true,value:1}]` |
| R6 | `par for i in [1, 2] { Zzz.f }` | `[{ok:false,error:{kind:"invoke_infra",cause:"panic",message:"null member access: .f"}}, …]` |
| R7 | `par for i in [1, 2] { Zzz.len() }` | `[{ok:true,value:null},{ok:true,value:null}]` |
| R3 | `par for i in [1, 2] { zzz(1) }` | both elements `{ok:false,error:{kind:"invoke_infra",cause:"internal_error", message:"internal defect: Pi tool 'zzz' call reached the runtime lowering with a non-object-literal first argument; the parse-time shape gate (theta/parse/tool-arg-not-object-literal) did not reject this call site — a gate gap (bug 0003)"}}` |
| R4 CONTROL | `par for i in [1, 2] { i }` | `[{ok:true,value:1},{ok:true,value:2}]` |

In R5 `null + 1` is `1` under the host's own arithmetic, so a misspelled name
produces a number and the run reports success. R6's message names the `.f` access and not the undefined receiver; R3's
message names a parse gate that has nothing to do with the fault. Interpolating
the resulting array into a top-level query was measured and is out of frame: it
raises `InterpolatedResultPanic` first, which is bug
[0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md)'s
`array<Result<…>>` subject, so no wire leak is claimed here.

## Expected behaviour

`expressions.md:44–:51` states four resolution arms and two refusals and names
no construct that is exempt. `theta/parse/unknown-identifier`'s registered
*Trigger* (`code-registry-parse.md:66`) is positional — "Bare identifier in call
or value position" — and a `par for` body, its iterand and its `max` operand
are such positions.

On the rows §Reproduction reports `[]`:

- A1, C1, H4, H5, H6, H7, H11 and H12 draw `theta/parse/unknown-identifier`
  once each, at the identifier's own range, with the registered Message; B1 and
  B4 draw `theta/parse/type-as-value` once each. H10 draws
  `theta/parse/unknown-identifier` for the `max` operand.
- Every judgement is the one the plain-`for` spelling already makes: the body is
  a block, the iterand and the `max` operand are expressions in the enclosing
  scope, and the per-iteration variable binds in the body's scope exactly as
  `walkIdentStmt`'s `for` arm (`:5389–:5395`) and `walkCallSiteExpr`'s `par-for`
  arm (`:6362`) already bind theirs.
- Nothing else in the subtree moves. H1's `function-as-value`, H2's
  `unknown-variant`, H3's `shadowed-callable-call` and `bare-object-literal`,
  and the type layer's `non-array-iterand` keep their exact codes, counts and
  ranges.
- H8 stays `[]`: the loop variable is resolution arm (1) (`expressions.md:46`,
  and `:53` names the `par for` variable among the locals it binds), so reading
  it draws nothing. So does the whole of
  `docs/examples/fan-out-reviews.theta:19–:21`.
- A name a `let` inside the body binds resolves for the reads that follow it,
  and a `match` pattern binding resolves inside its arm — the same
  block-local accumulation `checkUnknownIdentifiers`' doc comment states for
  every other block.

Once the arm exists, `theta/parse/type-as-value`'s *Trigger* no longer needs its
reach-gap paragraph: a `par for` body falls under the row's ordinary
position enumeration, and the `par for` variable's entry in the binder list
stops being the one entry whose mechanism the row has to except.

## Actual behaviour / root cause

**One switch, one missing case.** `walkIdentExpr`
(`src/parser/theta-document.ts:5434`) dispatches on `e.kind` and handles
`ident`, `call`, `binary`, `ternary`, `try`, `invoke`, `member`, `index`,
`method-call`, `object`, `array`, `result-ctor` and `match`. There is no
`par-for` case, so the node reaches the `default` (`:5518–:5520`) and returns —
the arm's own comment lists "number / string / bool / null / query", the leaves,
and a `par for` is not one. A `par for` arrives at `walkIdentExpr` as a `let`
initialiser (`walkIdentStmt`'s `let` arm), as an expression statement or as a
block tail, so all three spellings drop the whole subtree: iterand, `max` and
body.

**The absence is total, not partial.** Because the drop happens at the node, no
part of the subtree is reached by any deeper mechanism of this walk. That is why
H6 (a plain `for` nested inside the body), H7 (a `match` arm inside the body) and
H12 (a `par for` inside the body) are silent too: the outer `par for` is never
entered, so its children's arms never run. It is also why the silence is
symmetric across the two codes — both are pushed by `emitUnknownIdentifier`
(`:5303`), which is never called for these names.

**It is not the plain-`for` mechanism.** In A2 the loop variable enters the
block scope before the body is walked (`:5389–:5395`) and `emitUnknownIdentifier`'s
scope test (`:5312`) answers for it; the undeclared `Zzz` beside it is still
refused. Inside a `par for` nothing is tested at all, which is a different
disposition with a different fix.

**Two sibling walks disagree, and both record it.**
`walkCallSiteExpr`'s `par-for` arm (`:6353–:6364`) carries the comment "Reached
explicitly (unlike the ident walk, which predates RFC 0003)", naming this gap at
the site that does not have it. `walkExpr`'s arm (`:7637–:7648`) is bug 0118's
landed §Fix (a). The type layer descends as well (`type-layer-checks.ts:2692`),
which is where H's `non-array-iterand` comes from. So of the five traversals bug
0118 enumerated over this subtree, four now arrive and one does not.

**The runtime has no second gate.** `evaluatePureExpression`'s `ident` arm
(`production-theta-producer.ts:6366–:6369`) returns
`resolution.arm === "local" ? resolution.value ?? null : null` — a name bound
nowhere is `null`, silently, by the same expression that yields a real binding's
value. Nothing downstream distinguishes that `null` from an author-written
`null`: R1 and R2 collect it as `Ok(null)`, R5 adds to it, R7 calls a method on
it and gets `null` back, and only R6's member access raises — as
`NullMemberAccessPanic`, which CTRL-5's iteration boundary
(`statement-executor.ts:1205`, `runParForIteration` at `:1209`) downgrades to
that element's `Err(invoke_infra, cause:"panic")`. R3's callee takes the other
route: no callable registry holds `zzz`, so the call is lowered as a Pi tool and
fails on argument shape, producing a message that names bug 0003's parse gate.

## Why it matters

- **A name the spec refuses is accepted, and the program then computes with a
  value the author never wrote.** R5 turns a misspelling into `Ok(1)`. There is
  no diagnostic at load, no note at run, and no failure — the theta reports
  success.
- **The two failures that do surface name the wrong subject.** R6 says "null
  member access: .f" when the fault is the receiver's spelling. R3 says the
  parse-time shape gate `theta/parse/tool-arg-not-object-literal` did not
  reject a call site, when the actual fault is a callee that resolves through no
  arm of `expressions.md:44–:49`.
- **The gap is construct-shaped, so authors cannot predict it.** The same body
  refuses under `for` and is silent under `par for` (A1 / A2, B1 / B3), and
  inside one `par for` body some checks fire and others do not (H1, H2, H3
  fire; A1, B1, C1 do not). Nothing in the source distinguishes the two
  families.
- **Two registered rows are unenforceable in a whole construct.** Both
  `theta/parse/unknown-identifier` (`code-registry-parse.md:66`) and
  `theta/parse/type-as-value` (`:89`) state position-based triggers; neither can
  fire anywhere inside a `par for`. The second row currently carries a
  paragraph of prose to describe the hole rather than the rule.
- **The suite pins the hole green in two places.** Cell g9
  (`tests/type-name-as-value-refusal.test.ts:1733`) and cell (r2)
  (`tests/par-for.test.ts:506`) both assert the absence, deliberately, so no
  incidental widening can red there. They are the correct record of HEAD and the
  reason this report must name its own authority to flip them.

## Fix

**Constraint-pinned, not settled.** The refusals are owed; the scope rule for
the body and the exact emission counts are adjudicated in-run against the
measurements below.

### (a) `walkIdentExpr` gains a `case "par-for"`, in bug 0140's landed context shape

The arm walks the iterand and then the `max` operand in the ENCLOSING scope,
then the body through `walkIdentBlock` with a `new Set(scope)` copy that has the
per-iteration variable added — the two shapes already in the file:
`walkIdentStmt`'s `case "for"` (`:5389–:5395`) for the scope handling, and
`walkCallSiteExpr`'s `case "par-for"` (`:6353–:6364`) for the traversal order
and the variable binding at `:6362`. `IdentWalkContext` (`:5217`) is threaded
unchanged — the arm reads none of its three fields directly, and
`emitUnknownIdentifier` (`:5303`) stays the single sink, so no new emitter and
no new code. Order is load-bearing and asserted: iterand, then `max`, then body,
matching `walkExpr`'s arm (`:7637–:7648`).

A `par for` body is NOT closure-free: bug 0118's landed structural arm inherits
its scope (`{ ...scope, … }`), the call-site arm copies `locals`, and CTRL-4
(`control-flow.md:76`) states "Outer bindings and the loop variable are
readable". So the body inherits the enclosing scope copy, not
`walkIdentContext.roots` — the `fn`-body reseeding at `:5396–:5405` is
deliberately not the model here.

### (b) Pin every newly-reached emission, exactly

The widened arm brings both refusals into the subtree at once. Required, each
with an exact pass-wide unfiltered `doc.diagnostics` assertion and a real-parse
control at a position the walk already reaches: A1, C1, H4, H5, H6, H7, H10,
H11 and H12 for `theta/parse/unknown-identifier`; B1 and B4 for
`theta/parse/type-as-value`. Required to be UNCHANGED, with their counts: H1's
`function-as-value`, H2's `unknown-variant`, H3's pair, the type layer's
`non-array-iterand`, and H8 plus `docs/examples/fan-out-reviews.theta` staying
`[]`. State per code whether a newly-reached position produces one diagnostic or
two for the same `(code, range)` pair — H3's `shadowed-callable-call` is the row
to check first, since its own walk already judges the same name in the same
position.

The `discarded` site kind matters here and must be measured, not assumed:
`emitUnknownIdentifier`'s `site` parameter leaves a `typeOnlyNames` name silent
at a discarded expression-statement position (the no-op class of bugs 0033 /
0042), and a `par for` body's TAIL is not discarded — it is the element value
CTRL-3 collects (`control-flow.md:74`). Pin both: a bare declared name as the
body's tail refuses, and a bare declared name as a non-tail statement of the
body stays silent.

### (c) The registry *Trigger* edit is same-commit, and is a subtraction

`theta/parse/type-as-value` (`code-registry-parse.md:89`) loses the reach-gap
sentences — "One construct sits outside this row's REACH rather than outside its
rule … That gap is pre-existing and is bug 0118's subject" — and the `par for`
entry in its binder list stops carrying the "at every entry on this list but
`par for`" exception, because the mechanism now holds there too.
`theta/parse/unknown-identifier`'s row (`:66`) needs no edit: its *Trigger* never
stated the exemption. No row is added or removed, so DIAG-2 is not engaged; no
*Message* changes, so DIAG-4 is not engaged and
`docs/reference/diagnostics.md:112` / `:138` stay byte-unchanged.
`expressions.md` needs no edit either — `:51` and `:53` already state the rule
this fix implements.

### (d) The two pinned cells flip under this document's authority, subject restated

1. **Cell g9 of `tests/type-name-as-value-refusal.test.ts:1733`.** It is a
   deliberate REACH-FACT lock, byte-unchanged and green at HEAD (62/62), and its
   own comment authorises a DELIBERATE widening. This report is that authority.
   The flip is a restatement, not a deletion: g9 keeps its four-line fixture
   (declared name in the body, undeclared name in the body, undeclared iterand,
   undeclared `max` operand) and keeps its plain-`for` control, and now asserts
   `TYPE-AS-VALUE` for the declared name, `UNKNOWN` for the undeclared name, the
   iterand and the width operand, beside the surviving `non-array-iterand`. Its
   comment is rewritten to record that the reach gap is closed and by which
   report, so a future reader does not re-derive it. The group header at
   `:1554–:1557`, which describes g9 as "the one construct the walk never
   DESCENDS at all", is updated in the same commit; g1–g8 stay byte-identical
   and the bug 0126 / bug 0050 posture they pin is untouched — this fix adds
   reach, and changes nothing about what the walk does with a name it reaches.
2. **Cell (r2) of `tests/par-for.test.ts:506`.** Its `not.toContain("error
   theta/parse/unknown-identifier")` clause is bug 0118 §Fix (c) arrangement
   2's pin. After this fix the call to the refused nested `fn` also draws
   `unknown-identifier`, so the cell asserts BOTH codes and records that the
   second is now owed. Bug 0118's §Fix (c) admitted exactly this: "Either widen
   both in one commit with both sets of counts pinned, or widen the structural
   walk alone and record the ident walk's omission as a scoped residual". The
   group comment at `:395–:397` is corrected in the same commit — it cites
   `walkIdentExpr` as `:5371`, which is 63 lines stale at HEAD.
3. A discharge note is appended to bug 0118's fix record for *Residuals* item
   2, naming this report. Append-only, so no existing line moves.

### (e) Blast radius is premeasured before the witness is written

The corpus has exactly one committed `par for`
(`docs/examples/fan-out-reviews.theta:19–:21`), reading the loop variable and a
`tools:`-derived callable name — both in scope, so it must stay clean; the
claim is discharged by `tests/committed-fixture-parse-gate.test.ts`. Beyond
that, apply the §Fix (a) shape as a prototype and run the full default suite
BEFORE writing cells, as bug 0118 did: any `par for` in `tests/**` whose body
spells a name the walk now judges reds, and each such red is either a fixture
that was relying on the silence or a real defect the fixture was hiding. Neither
may be papered over by narrowing the arm.

### (f) Witness

`tests/type-name-as-value-refusal.test.ts` owns the `type-as-value` rows
(through g9's restatement) and `tests/par-for.test.ts` owns the rest, beside bug
0118's (r) group. Every expected Message is read from the registry at runtime
(DIAG-4). Red-prove in both directions: with the new arm neutralised to
`return;`, every positive cell reds and the unchanged-count cells stay green.

## Non-goals

- **`collectIdentRoots` (`:5138`) and its two calls (`:942–:946`).** The gap is
  reach, not root membership; the fold and both calls stay byte-identical.
- **What the walk does with a name it REACHES.** The three-way rule
  (`checkUnknownIdentifiers`' doc comment), the unconditional scope-shadow test
  (`:5312`), the `discarded`-site silence and the `Enum.Variant` receiver
  licence are bug 0140's settled posture and are not reopened; g1–g8 stay
  byte-identical.
- **The `${…}` interpolation non-site.** A template's interpolations are not
  identifier-resolution sites for this walk (bug 0140's cell g8 pins it), and a
  query in a `par for` body is `theta/parse/par-query-in-body` under CTRL-4
  anyway.
- **CTRL-4's own scan not descending into a `fn` declaration** — bug 0118's
  *Residuals* item 3, untouched here.
- **A `par for` body's `return` regime** — bug 0118's *Residuals* item 1,
  a CTRL-4 spec question; this report adds no `return` judgement.
- **The runtime's silent `null` for an unbound name**
  (`production-theta-producer.ts:6366`). Measured here as the reason the load
  gap has runtime consequences. Whether the evaluator should raise instead is a
  separate adjudication: after this fix no parse-clean program can reach that
  arm with an unbound name through a `par for`, so the change of subject would
  be defensive depth, not this repair.
- **Bug 0114's `array<Result<…>>` interpolation panic**, which blocked the
  wire-leak rows in §Reproduction (C) and is cited only as the reason no leak is
  claimed.
- **Line-number drift in citations outside the files this fix touches** — bug
  0134's adjudicated do-not-chase class. Bug 0118's *Residuals* item 5 already
  records nine stale `theta-document.ts:<line>` citations in test files from its
  own insertion; this fix corrects only the ones inside the files it edits.

## Related

- [0118](./0118-nested-fn-result-return-defers-to-runtime-panic.md) — **fixed
  (0.162.0)**, the origin. Its §Fix (c) offered two arrangements and its fix
  took arrangement 2, "the structural walk alone", leaving *Residuals* item 2:
  "The identifier walk's `par for` omission survives. `walkIdentExpr` still has
  no `par-for` arm, so no identifier-resolution code is drawn anywhere under a
  `par for` … Widening it changes which names a `par for` body resolves against
  — including the loop variable, which the call-site walk binds explicitly —
  and needs its own measurements." This report supplies those measurements.
  Its landed `walkExpr` arm and its (r)-group cells are this fix's substrate
  (§Fix (a), (d)).
- [0140](./0140-bare-schema-reference-value-position-silent.md) — **fixed**, the
  owner of the walk's current shape: `IdentWalkContext`, `typeOnlyNames`,
  `emitUnknownIdentifier`'s three-way rule and the `IdentSite` distinction. Its
  cell g9 (`tests/type-name-as-value-refusal.test.ts:1733`) is the pin this
  report's fix flips (§Fix (d)), and its registered *Trigger* prose at
  `code-registry-parse.md:89` is the text §Fix (c) subtracts.
- [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) —
  **open**, the reason §Reproduction (C)'s interpolation rows are out of frame.
  Disjoint: it governs how an `array<Result<…>>` renders, this report governs
  which names resolve.
- [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
  do-not-chase class under which every citation here is symbol-named beside its
  line number and re-verified at HEAD after bug 0118's insertions.

## Provenance

- Origin: bug 0118's §Fix (0.162.0) *Residuals* item 2, and its §Fix (c), which
  named the two arrangements and took the narrower one. Bug 0118's own
  §Non-goals had already scoped the identifier walk out ("this report measures
  only that the ident walk does not arrive"), and its §Fix (c) required the
  omission to be "recorded as a scoped residual naming the comment at
  `:5508–:5509`" — the `walkCallSiteExpr` comment now at
  `src/parser/theta-document.ts:6354`.
- Re-measured at HEAD `c7c5d828` for this filing, not copied. What the
  measurement adds to the residual's sentence:
  - **The silence covers `theta/parse/type-as-value` as well as
    `theta/parse/unknown-identifier`**, both of them at every depth of the
    subtree — a nested plain `for`, a `match` arm, a nested `par for`, a member
    or method receiver, the iterand and the `max` operand (§Reproduction A, B).
  - **The runtime consequence, measured**: `Ok(null)` per iteration, `Zzz + 1`
    → `Ok(1)`, `Err(invoke_infra, cause:"panic")` "null member access: .f" for
    a member read, and an `Err(… cause:"internal_error")` blaming bug 0003's
    parse gate for an undeclared callee (§Reproduction C). The residual records
    the load-time gap only.
  - **The three controls that locate the fault at the construct**: the same
    body under `for`, under `while`, and at the top level all refuse.
  - **What still fires in the subtree**: `function-as-value`,
    `unknown-variant`, `shadowed-callable-call` + `bare-object-literal`, and
    `non-array-iterand` — so the fix is one arm wide, and its counts are
    pinnable against four traversals that already arrive.
  - **The corpus and lock inventory**: one committed `par for`
    (`docs/examples/fan-out-reviews.theta:19`) which must stay clean, and two
    pinned cells that flip (g9 and (r2)), plus the stale `walkIdentExpr`
    citation in `tests/par-for.test.ts:395`.
- Reproduction: three scratch vitest files at `c7c5d828` — the parse matrix over
  the real `parseThetaDocument` via `tests/helpers/e2e-s1.ts`, the
  extent-and-boundary rows, and the production prompt-mode drive
  (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
  over the `tests/interpolated-result-gate.test.ts` live-session double). Run on
  the outputs quoted above, then deleted. Protected witnesses confirmed green
  and unmodified during the filing: `tests/type-name-as-value-refusal.test.ts`
  62/62, `tests/par-for.test.ts` 69/69.

## Fix (0.164.0)

- What shipped:
  - **§Fix (a) — `src/parser/theta-document.ts`:** `walkIdentExpr` gains
    `case "par-for"` (one 16-line hunk, inside the identifier walk's own
    region). It walks `e.iterand`, then `e.max` when non-null, in the passed
    ENCLOSING scope, then the body through `walkIdentBlock` with
    `const inner = new Set(scope); inner.add(e.variable)`. Traversal order
    (iterand → `max` → body) mirrors `walkCallSiteExpr`'s and `walkExpr`'s
    landed `par-for` arms and is asserted, not assumed. The body inherits a
    COPY of the enclosing scope rather than reseeding from `walkCtx.roots`,
    because CTRL-4 (`docs/spec_topics/control-flow.md:76`, verified verbatim at
    HEAD: "Outer bindings and the loop variable are readable") makes a `par for`
    body a non-closure-free block — the `fn` arm's whole-file reseeding is
    deliberately not the model. `IdentWalkContext` threads UNCHANGED;
    `emitUnknownIdentifier` stays the single sink; no new emitter, no minted
    code, no registry row added or removed. `collectIdentRoots` and both of its
    call sites are byte-identical, per §Non-goals.
  - **§Fix (b) — `tests/par-for.test.ts`:** an additive bug-0224 group of 26
    cells, each asserting the exact pass-wide unfiltered `doc.diagnostics` and
    each reading its expected Message from the registry at runtime (DIAG-4),
    with a top-level real-parse control per family: A1, C1, H4, H5, H6, H7,
    H10, H11, H12 for `theta/parse/unknown-identifier`; B1 and B4 for
    `theta/parse/type-as-value`; the emission-ORDER cell; the surviving
    `non-array-iterand` beside the new refusal, in measured order; and the
    unchanged-count controls H1 (`function-as-value`), H2 (`unknown-variant`),
    H3 (`shadowed-callable-call` + `bare-object-literal`), H8 (the loop
    variable stays `[]`) and the body-`let` / `match`-binder accumulation
    fences. The stale group comment at `:395` (which cited `walkIdentExpr` as
    `:5371`) is corrected in the same change, symbol-named.
  - **The two open questions §Fix (b) asked, MEASURED:** (i) no `(code, range)`
    pair doubles for H3 — the pair is `shadowed-callable-call @ 6:34-6:53` and
    `bare-object-literal @ 6:39-6:52`, distinct ranges, and the widened arm adds
    nothing because it binds the SAME per-iteration variable
    `walkCallSiteExpr`'s arm binds, so `emitUnknownIdentifier`'s unconditional
    scope test returns first; the cell asserts range-distinctness mechanically.
    (ii) a `par for` body's TAIL is a VALUE site, not `discarded`: a bare
    declared `schema` name as the tail draws `type-as-value`, the same name as a
    non-tail statement of the body stays silent, and an UNDECLARED name at that
    same non-tail position still draws `unknown-identifier` — so bug 0140's
    code-specific `discarded` licence carries into the newly-reached block
    unchanged, matching CTRL-3 (`control-flow.md:74`).
  - **§Fix (c) — `docs/spec_topics/diagnostics/code-registry-parse.md`:** the
    same-commit DIAG-2 *Trigger* edit on `theta/parse/type-as-value`. The
    "at every entry on this list but `par for`" exception loses its exception,
    and the whole reach-gap sentence group ("One construct sits outside this
    row's REACH … under a new exception to it.") is removed. The two positions
    the widened arm newly judges — a `par for` iterand and its `max` operand —
    are named in the EXPRESSION-level enumeration (not the statement-level one:
    CTRL-1, `control-flow.md:70`, states "Unlike `for`, `par for` is an
    expression"), because the row declares its own list exhaustive. One row,
    one line, file line count unchanged at 132. No *Message* changes, so DIAG-4
    is not engaged and `docs/reference/diagnostics.md` is BYTE-UNCHANGED
    (verified: it mirrors the Message column only). `code-registry-parse.md:66`
    (`unknown-identifier`) and `docs/spec_topics/expressions.md` are
    BYTE-UNCHANGED — `:44–:53` already state the rule this fix implements.
  - **§Fix (d)1 — `tests/type-name-as-value-refusal.test.ts` cell g9 RESTATED,
    never deleted.** It keeps its four-line fixture and its plain-`for` control
    and now asserts, in the MEASURED order, `type-as-value` for the declared
    body name `P`, `unknown-identifier` for the undeclared body name, the
    surviving `non-array-iterand` interleaved between `let c`'s own refusal and
    `let d`'s, and `unknown-identifier` for the `Yyy` width operand. Its
    comment is rewritten to record the reach gap as CLOSED and by which report.
    Three header sentences that asserted the now-false claim were updated: the
    group banner, the header sentence, and the `describe` title. g1–g8 are
    BYTE-IDENTICAL.
  - **§Fix (d)2 — `tests/par-for.test.ts` (r2) and (r3) flipped.** (r2)'s
    `not.toContain("error theta/parse/unknown-identifier")` inverts: the call to
    the FN-1-refused nested `fn` now draws the second code, which bug 0118
    §Fix (c) itself admitted would be owed. (r3) gains the same entry in its
    measured position while keeping its PRIMARY subject (CTRL-4's query refusal
    stays SINGLE).
  - **§Fix (d)3 — append-only discharge note** at the end of
    `docs/bugs/0118-…md`, recording *Residuals* item 2 and its §Fix (c)
    arrangement-2 standing charge as DISCHARGED by this report. Verified
    append-only (`@@ -999,3 +999,13 @@`, ten additions, zero deletions): no
    existing line moved and 0118's Status is unchanged.
  - **Live coverage — `tests/live/live-production-acceptance.test.ts` cell 82,
    additive at the file's end.** H8a, mirroring cell 81 (bug 0118's live cell)
    exactly: the shipped `createAgentSession` composition, real discovery, real
    `session.bindExtensions({})`, the registration gate, and the assertion on
    the `theta-system-note` MESSAGE read off the settled in-memory
    `SessionManager` with the message half read from the registry (DIAG-4). A
    `par for` body spelling an undeclared name fails to register; the
    loop-variable-only sibling registers; a precondition control in the same
    workspace proves the workspace and the discovery walk. Registration-only,
    so zero model turns; a missing provider fails loudly through
    `requireLiveProvider`, never skips.
  - **The doc's runtime measurements, for the record.** They are the reason this
    is S1 rather than a cosmetic reach gap and they are now unreachable through
    a parse-clean program: `Ok(null)` per iteration for an un-refused name (R1,
    R2), `Zzz + 1` → `Ok(1)` (R5), `Err(invoke_infra, cause:"panic")` "null
    member access: .f" for a member read (R6), and
    `Err(invoke_infra, cause:"internal_error")` blaming bug 0003's
    `theta/parse/tool-arg-not-object-literal` for an undeclared callee (R3).
    The evaluator's silent `null` arm
    (`src/extension/production-theta-producer.ts`, `evaluatePureExpression`'s
    `ident` arm) is UNTOUCHED — §Non-goals scopes it out, and after this fix no
    parse-clean program reaches it with an unbound name through a `par for`.
- Gates (verbatim):
  - Witness RED before the fix: `npx vitest run tests/par-for.test.ts
    tests/type-name-as-value-refusal.test.ts
    tests/interpolated-result-gate.test.ts` → `Test Files 3 failed (3)` /
    `Tests 18 failed | 222 passed (240)`, every red reporting
    `Observed: [] (NO DIAGNOSTIC OF ANY SEVERITY — the source loads clean)`.
    GREEN after: `Tests 240 passed (240)` (par-for 95/95,
    type-name-as-value-refusal 62/62, interpolated-result-gate 83/83).
  - Full default suite: `Test Files 357 passed (357)` / `Tests 7315 passed
    (7315)` (fork baseline 357 / 7289 + 26 added cells).
  - `npm run typecheck` → `tsc -p tsconfig.json --noEmit`, no output.
  - `npm run lint` → `eslint --no-error-on-unmatched-pattern "src/**/*.ts"`, no
    output.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts -t "cell 82"` →
    `Tests 1 passed | 81 skipped (82)`, real provider engaged, zero model turns.
    `tests/fixtures/h7a/permitted-codes.json` BYTE-UNTOUCHED (no H9a run
    claimed it reachable; the fixed path is a load-time parse refusal).
  - Corpus: `tests/committed-fixture-parse-gate.test.ts` 36/36 —
    `docs/examples/fan-out-reviews.theta`, the corpus's one committed
    `par for`, stays clean, and that gate (not a scratch probe) is the standing
    discharge.
- Review: 2 rounds. Round 1 (deep) — one blocking `spec` finding: the *Trigger*
  addition placed the `par for` iterand and `max` positions in the
  statement-level enumeration, contradicting CTRL-1's "`par for` is an
  expression"; plus one accepted non-blocking `prose` residual. Round 2 (fast)
  — CLEAN, with the F1 remedy verified word-by-word, the statement-level
  sentence confirmed byte-identical to HEAD, and the six-file scope confirmed.
- Verification: SOLID. (1) Witness reds on neutralisation — the arm's body
  replaced by a bare `return;` per §Fix (f) reds exactly the 18 cells (14
  bug-0224 positives + the four authorized flips) and leaves all 222 control
  cells GREEN, proving the drop is total rather than partial; restore proved
  byte-exact by `git hash-object` (`71de00c0…` before and after). (2) Full
  default suite 357 files / 7315 tests. (3) The live cell was proven in BOTH
  directions per AGENTS.md: with the arm neutralised, cell 82 REDS for the
  right reason (the offender `cellblivebad` registers, at the
  `toBeUndefined()` assertion); with the arm restored it passes. (4) typecheck
  and lint clean.
- **Authorized flips, enumerated for parent ratification (four cells):**
  1. `tests/type-name-as-value-refusal.test.ts` g9 — the doc's §Fix (d)1 named
     authority. RESTATED (fixture + plain-`for` control preserved), not
     deleted.
  2. `tests/par-for.test.ts` (r2) — the doc's §Fix (d)2 named authority; the
     `not.toContain` clause inverts.
  3. `tests/par-for.test.ts` (r3) — NOT named individually by the doc. Same
     mechanism as (r2): its fixture calls a nested `fn` `mk` declared in the
     `par for` body; the declaration is FN-1-refused and `collectFns` is
     top-level-only, so `mk()` resolves through no arm of
     `expressions.md:44–:49` and now draws `unknown-identifier`. Authorized by
     §Fix (e) ("any `par for` in `tests/**` whose body spells a name the walk
     now judges reds … Neither may be papered over by narrowing the arm") plus
     §Fix (d)2's restatement shape. PRIMARY subject preserved.
  4. `tests/interpolated-result-gate.test.ts` (h1) — same mechanism, two
     nested `fn`s (`mk`, `use`), so two added entries. Authorized on the same
     ground. Its other 82 cells are byte-green and no other line of that file
     moved.

  Blast-radius premeasurement (a prototype arm run against the FULL suite
  BEFORE any cell was written, per §Fix (e)) found EXACTLY these four reds and
  no others — zero unauthorized flips, zero collateral.
- Residuals:
  1. **One historical citation inside an edited file, accepted.** The new
     bug-0224 group comment in `tests/par-for.test.ts` and g9's rewritten
     comment both cite the PRE-fix coordinates of `walkIdentExpr`'s `default`
     arm (`:5518–:5520`), which the 16-line insertion moved to ~`:5534`. The
     claims are explicitly framed as the pre-fix measurement and are
     symbol-anchored, so a reader recovers; bug 0134's do-not-chase
     adjudication covers drift-by-insertion. Evidence: round-1 review residual
     R1, re-confirmed clean in round 2.
  2. **One stale citation left in place deliberately.** `tests/par-for.test.ts`
     (the comment block above the bug-0118 group) cites `walkExpr` as
     `src/parser/theta-document.ts:7350`; the symbol is at `:7413` at HEAD and
     its `par-for` arm at `:7653` after this insertion. It sits outside the
     `:395` correction this fix owed and chasing it would be bug 0134's
     forbidden sweep. Flagged for whoever next edits that comment block.
  3. **`registryMessageFor` cannot render `theta/parse/shadowed-callable-call`.**
     The helper uses a single `String.replace` and that row's Message carries
     `'<name>'` twice, so cell H3 asserts code + count + `(code, range)`
     distinctness instead of the rendered message. Every other new cell reads
     its Message from the registry. Evidence: the helper's body and the
     registry row at `code-registry-parse.md:67`; round-1 review judged the
     substitute adequate.
  4. **Line-number drift OUTSIDE the edited files.** The 16-line insertion at
     `walkIdentExpr` shifts every `src/parser/theta-document.ts:<line>`
     citation at or below it — bug 0134's adjudicated do-not-chase class, and
     bug 0118's *Residuals* item 5 already records the same class from its own
     insertion. Not chased.
- Discharge notes appended: `docs/bugs/0118-nested-fn-result-return-defers-to-runtime-panic.md`
  (its *Residuals* item 2 and its §Fix (c) arrangement-2 standing charge,
  append-only, Status unchanged).
- Pinned dispositions / non-goals: `collectIdentRoots` and its two call sites
  byte-identical; nothing changed about what the walk does with a name it
  REACHES (bug 0140's three-way rule, the unconditional scope-shadow test, the
  `discarded` silence, the `Enum.Variant` receiver licence — g1–g8
  byte-identical); the `${…}` interpolation non-site untouched; CTRL-4's own
  scan not descending into a `fn` declaration (bug 0118 *Residuals* item 3)
  untouched; a `par for` body's `return` regime (bug 0118 *Residuals* item 1)
  untouched — no `return` judgement added; the runtime's silent `null` for an
  unbound name untouched; bug 0114's `array<Result<…>>` interpolation panic
  untouched.
