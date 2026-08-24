# Bug 0127 — The `array.join` gate's **element** test rejects an element type the `TypeEnv` cannot resolve as "not `string`", while the same gate's **receiver** test defers on an unresolvable `named`: `fn f(xs: array<Nope>): string { xs.join(",") }` is an error-severity `theta/parse/non-string-array-join` and `fn f(xs: Nope): string { xs.join(",") }` is `[]`; the class the element arm refuses holds five reachable spellings, including a `.thetalib`-imported element name and the bare `[].join(",")`, and no spec sentence decides which disposition an unresolvable element is owed

- **Status:** fixed (0.255.0). §Fix was settled by operator ruling (fifteenth
  set, ruling 2) as **route (c)**; the two normative sentences landed on
  `docs/spec_topics/type-system.md` line 48 and the record is
  `## Fix (0.255.0)` at the end of this document. The body above is preserved as
  filed. No ordering dependency on another open report. One coordination
  constraint is binding —
  [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) is **fixed
  (0.72.0)** and its 36-cell witness now pins the current disposition at both
  levels (`tests/fn-param-alias-unfolded-at-gates.test.ts:492–509` row `b12`,
  `:511–528` row `b13`, `:698–713` row `e1`, `:715–723` row `e2`), so any route
  here updates those rows deliberately rather than breaking them incidentally.
- **Sev/Diff estimate:** S4/D3 — the element arm's reject sits inside its
  registered *Trigger* read literally and fails loudly at the offending span, so
  nothing is silently lost and no value is wrong, which is the
  unadjudicated-wording band; D3 because the disposition is adjudicated in-run,
  it lands a same-commit `docs/spec_topics/expressions.md` sentence (and, on one
  route, a DIAG-2 *Trigger* determination), and every route deliberately moves
  pinned rows in bug 0089's witness.
- **Kind:** spec gap, disposition open. Neither arm is a defect against a
  sentence the corpus carries. The element arm's reject is inside
  `docs/spec_topics/diagnostics/code-registry-parse.md:43`'s *Trigger* read
  literally ("an array whose element type is not `string`") and inside
  `docs/spec_topics/expressions.md:108` read literally ("Element type must be
  `string`"); neither names resolvability. The receiver arm's defer is inside
  `code-registry-parse.md:63`'s *Trigger*, which is scoped to "a built-in type",
  and the `join` row itself sits in the `*array<T>*` member table
  (`expressions.md:103`), whose rows presuppose an `array<T>` receiver. What the
  corpus does not carry is the sentence deciding what an element type the parser
  cannot resolve is owed. The one general deferral rule
  (`docs/spec_topics/type-system.md:48`) is scoped to "either side of a
  compatibility check", and the closed check-site list at `:27` does not include
  the `join` element precondition — so it does not reach this site, and the
  element arm does not violate it. The adjudication is this report's deliverable.
- **Related:**
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **fixed
    (0.72.0)**, the origin. Its §Fix unfolded both levels of this gate through
    `unfoldAlias` and pinned the *receiver*-level asymmetry as a constraint to
    preserve (`:334–336`: "An unresolvable `named` keeps its current disposition
    at each gate — reject at gate 1, defer at gate 2 (group (e) rows 1–2)"), with
    the measurement at `:183–184`. Its §Non-goals (`:294–296`) declines the
    unresolvable-`named` dispositions in terms. Its §Fix record repeats the
    pin twice (`:459–461` "an unresolvable `named` keeps its asymmetric
    disposition"; `:546–549` "the unresolvable-`named` asymmetry — reject at
    gate 1, defer at gate 2 — is preserved deliberately, not incidentally").
    **The element level is not in any of those statements**: they name the
    receiver-level pair only. 0089 reached the element level in its review round
    1, which unfolded the element to stop a false `E` load failure on
    `schema E = string` / `schema L = array<E>`, and the code comment that
    landed with it asserts the element disposition without a spec anchor
    (`src/parser/type-layer-checks.ts:1434–1436`: "TYPE-10 bounds it: an
    object-schema `named` element comes back unchanged and stays non-string, **as
    does an unresolvable one**"). That sentence is what this report asks the
    corpus to state or to reverse.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) —
    **fixed (0.55.0)**, which owns the empty-literal element type this report's
    fifth spelling comes from. `#commonType`
    (`src/parser/static-type-inference.ts`) returns `named "unknown"` for an
    empty candidate list, and 0083's §Affected already records the consequence
    (`:43–45`: "`checkArrayJoin` … admits only a `string` primitive or a
    `string`-typed literal element … `unknown` is neither"). 0083's fix closed
    the *annotated* route — its row `b1`
    (`tests/let-annotation-recorded-binding-type.test.ts:148–154`) pins
    `let e: array<string> = []` then `e.join(",")` as `[]`, and that holds at
    HEAD. The **un-annotated** route is not in 0083's §Fix or its three
    residuals (`:259–271`), and is measured refusing below.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) —
    **fixed (0.38.0)**, which built the position list this report's diagnostic
    gap comes from. `theta/parse/unresolved-named-type`'s registered positions
    (`code-registry-parse.md:90`) are the `params:` right-hand side, the `@<T>`
    query annotation, a `schema` body field type, the right-hand side of a
    `schema X = …`, and an object-constructor name. **A `fn`-parameter
    annotation and a `let` annotation are not among them**, which is why the
    measured rows below carry no diagnostic naming the unresolvable element,
    while the two rows that route the same name through an alias right-hand
    side carry one.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, adjacent and not blocking. It records that no `NamedType`
    *reference* position distinguishes a lowercase head, which is what makes the
    synthesised `named "unknown"` sentinel shadowable by a declaration; measured
    below, the shadowing declaration is itself error-severity, so no program
    loads through it. 0051 does not touch this gate and its §Fix does not change
    any row here.
  - [0125](./0125-index-element-narrowing-not-alias-unfolded.md) and
    [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the other two
    residuals of the same 0089 fix, filed alongside this one and disjoint from
    it. 0125 owns the index-element derivation in
    `src/parser/static-type-inference.ts`; 0126 owns `walkStmt`'s `case "for"`
    body scope. Neither reaches `checkArrayJoin` or the receiver guard at
    `type-layer-checks.ts:1428`, and neither changes a row measured here. Listed
    so the three residuals of `a3b30ed3` are navigable as a set.
  - [0113](./0113-listtree-glob-universe-swallow-silent.md) — **open**, the
    posture this report mirrors: a residual whose §Fix is constraint-pinned
    because the deferring fix stated that the disposition must be pinned before
    it is coded.
- **Affected** (every citation verified at HEAD `552b4ace`, 0.72.0):
  - `src/runtime/stdlib-array.ts:100–124` — **the element arm**.
    `checkArrayJoin`'s signature is `(elementType: CompatType, site: CompatSite)`
    (`:100–103`): it takes no `TypeEnv`, and the module imports none
    (`:26` imports `displayType`, `CompatType` and `CompatSite` from
    `../parser/type-compat`). The decision is `:107–109`:
    `elementType.kind === "prim" && elementType.name === "string"` or
    `elementType.kind === "literal" && elementType.typesAs === "string"`.
    `:110–112` returns `undefined` for those two shapes; `:115–123` emits
    otherwise, at `severity: "error"` (`:116`) with code
    `theta/parse/non-string-array-join` (`:117`) and the element rendered through
    `displayType` (`:120–122`). There is no `named` arm and no resolution step,
    so the function cannot distinguish a `named` the `TypeEnv` resolves to a
    non-`string` from a `named` it cannot resolve at all: both fall to `:115`.
  - `src/parser/type-layer-checks.ts:1417–1459` — `checkMethodCall`, the sole
    caller (`rg -n "checkArrayJoin" src/` at HEAD returns five hits: the
    definition at `stdlib-array.ts:100` and one comment there at `:64`, the
    import at `type-layer-checks.ts:90`, one comment there at `:1433`, and the
    call at `:1437`). `:1421`
    reads the receiver's static type; `:1427` computes
    `unfoldAlias(targetType, this.env)`; `:1428` is the **receiver** test
    `e.method === "join" && unfoldedTarget.kind === "array"`; `:1437` passes
    `unfoldAlias(unfoldedTarget.element, this.env)` — the element unfolded in its
    own right, added by bug 0089's review round 1 so that
    `schema E = string` / `schema L = array<E>` does not draw a false rejection.
  - `src/parser/type-layer-checks.ts:1429–1436` — the comment that asserts the
    element disposition. `:1434–1436` reads "TYPE-10 bounds it: an object-schema
    `named` element comes back unchanged and stays non-string, as does an
    unresolvable one." TYPE-10 (`type-system.md:52`) supports the object-schema
    half; the corpus carries no sentence for the second.
  - `src/parser/type-layer-checks.ts:1445–1451` — the **receiver**-side comment
    and its arm: "A statically-unresolvable receiver defers to the runtime safety
    net (no diagnostic)" (`:1446–1447`), then
    `classifyReceiver(unfoldedTarget, this.env)` at `:1448` and the
    `kind === "unknown"` early return at `:1449–1451`. The comment cites no spec
    sentence, and for `join` on an unresolvable receiver there is no AJV check to
    be the safety net either.
  - `src/parser/type-layer-checks.ts:166–189` — `classifyReceiver`. Its `named`
    arm (`:178–187`) returns `"unknown"` when `resolveNamed` finds no declaration
    (`:180–181`). This is the only place in the method-call path where an
    unresolvable name is recognised as such, and it runs **after** the element
    arm has already emitted.
  - `src/parser/type-compat.ts:155–172` — `unfoldAlias`. `:164–170` walks while
    `current.kind === "named"` and returns `current` unchanged when
    `resolveNamed` yields `undefined` or a non-alias (`:166–168`). Its own doc
    comment states the property (`:151–153`): "an unresolvable `named` (past the
    parser's static view) stays `named` so the relation reports `"unknown"` and
    the runtime AJV safety net applies". So the element reaching `checkArrayJoin`
    at `:1437` is byte-identical to the declared spelling, and the function has
    no way to ask why.
  - `src/parser/type-compat.ts:104–106` — `resolveNamed`, the `Object.hasOwn`
    lookup that decides resolvability; `:254`, `:258`, `:268` — the three arms
    inside `decide` that return `"unknown"` for an unresolvable `named`. Those
    arms are the `⊑` machinery's implementation of `type-system.md:48`.
    `checkArrayJoin` has no counterpart, and is not reached through `decide`.
  - `src/parser/type-layer-checks.ts:302–331` — `collectTypeEnv`, which decides
    what "unresolvable" means in practice. It iterates body statements and
    registers only `stmt.kind === "schema"` (`:315`), so an `enum` declaration
    (`src/parser/theta-document.ts:630`) never enters the env; and an alias
    participating in a cycle is omitted at `:318`
    (`rhs !== undefined && !cyclic.has(stmt.name)`). Imported symbols are absent
    for a third reason: all three `collectTypeEnv` call sites pass body
    statements only (`type-layer-checks.ts:226`,
    `src/parser/query-schema-resolve.ts:81`,
    `src/extension/invoke-static-checks.ts:747`), and no import machinery
    touches a `TypeEnv` at all (`rg -n "TypeEnv" src/parser/imports.ts
    src/extension/import-static-checks.ts` returns nothing).
  - `src/runtime/stdlib-array.ts:63–67` — the absent runtime backstop. The
    `join` case is `receiver.join(args[0] as string)` (`:66–67`) and the comment
    above it (`:63–65`) states the reason: "The parse-time `checkArrayJoin`
    precondition guarantees a `string` element type, so no implicit conversion
    happens here." Nothing at runtime re-checks the element type, so a deferring
    disposition has no second phase to defer *to*.
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`,
    which selects any `error`-severity `theta/load/*` or `theta/parse/*`
    diagnostic; `:2079` — `parseDiscoveredTheta`; `:2092` — the drop. The element
    arm's code is `E` (`stdlib-array.ts:116`), so every refusing row below is a
    theta that does not register.
  - `docs/spec_topics/expressions.md:103` — the `*array<T>*` stdlib table label;
    `:108` — the `join` row, quoted in §Expected behaviour; `:71` — the
    section heading; `:73` — its only scoping sentence, "A small stdlib is
    exposed on the primitive composite types", which says nothing about a
    receiver whose type is not statically known.
  - `docs/spec_topics/expressions.md:214` — the corpus's one explicit
    disposition for a name the importing file's parse cannot resolve: "A name
    imported from a `.thetalib` always resolves at this position — the importer's
    parse holds neither the imported symbol's field bodies nor its kind — so the
    field-set checks above do not run and the construction is not checked here."
    This is the constructor position, not an element position.
  - `docs/spec_topics/expressions.md:220` — "`[]` is the empty array; its element
    type is inferred from context (binding annotation, parameter type, or
    surrounding constructor field)", and `:222–224`, the common-type rules and
    their first sink case. No
    disposition is given for `[]` with no context, which is the fifth spelling
    below.
  - `docs/spec_topics/expressions.md:236` — the ordering operators, which admit
    "two `string` operands" and reject "an operand whose type is `boolean`,
    `null`, an enum, a union, an object schema, or `array<T>`". This lists an
    enum type as not `string` for operator purposes, so the `enum` spelling below
    reaches an answer the corpus supports — through the unresolvable path rather
    than through any enum rule.
  - `docs/spec_topics/type-system.md:27` — the closed compatibility check-site
    list ("the RHS of a typed `let`, a function-argument slot, an `invoke<T>`
    return annotation, the common type of `match` arms or ternary branches, an
    `array<T>` element against its sink, the `+` operator's mixed-numeric case, a
    frontmatter `params:` default, or a schema-constructor field value against
    its declared field type"). The `join` element precondition is not on it; the
    `array<T>` entry is the array-literal sink, which `:222–224` owns.
  - `docs/spec_topics/type-system.md:48` — the *Unresolvable operands* paragraph,
    the only general deferral rule in the corpus, scoped to "either side of a
    compatibility check" and predicated on "the runtime AJV check is the safety
    net"; `:29` — the operational definition that makes AJV the runtime reading;
    `:52` — TYPE-10; `:54` — TYPE-11.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:43` — the
    `theta/parse/non-string-array-join` row. *Trigger*: "`arr.join(...)` invoked
    on an array whose element type is not `string`." *Message*:
    `array.join requires a string element type; got array<<element>>`. The
    *Trigger* names resolvability nowhere. `:63` — the
    `theta/parse/unknown-method` row, *Trigger* "Method or property accessed on a
    built-in type that the theta 1.0 stdlib does not expose", the sentence the
    receiver-side defer sits inside. `:64` — the
    `theta/parse/non-array-iterand` row, the iterand gate's. `:90` — the
    `theta/parse/unresolved-named-type` row and its five registered positions.
    `:20` — the `theta/parse/schema-case-mismatch` row, `E` severity.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a *Trigger* change is a spec change landing in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative; a reword is deferred to
    theta 2.0). `docs/reference/diagnostics.md:89` — the *Message* mirror, which
    carries no *Trigger* column.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15, whose
    observable (b) is the "ordered diagnostic-code sequences" every route here
    moves for the inputs it touches.
  - `docs/spec_topics/schemas.md:93` — "theta 1.0 enums carry **string values
    only**", and the would-be lowering `{type:"string", enum:[]}`. Read against
    `expressions.md:236` this is why the `enum` spelling is the one refusal in
    the class whose answer the corpus independently supports.
  - `docs/spec_topics/imports.md:50` — `theta/parse/import-unknown-symbol`, which
    fires "after the resolved `.thetalib` file's own parse completes". So an
    imported name that survives that check names a real declaration, and the
    element arm still refuses it.
  - **Test coverage of the current disposition: two rows, one spelling.**
    `tests/fn-param-alias-unfolded-at-gates.test.ts:492–509` (`b12`) pins the
    undeclared-name element as rejecting with `got array<Nope>`, and `:511–528`
    (`b13`) pins the cycle participant. Both are bug 0089's, both assert the
    exact aggregated code list with `toEqual`, and `b12`'s own comment states the
    reasoning this report questions: "here the receiver IS an `array`, the gate
    runs, and the unresolvable element fails the `string` test". `:698–713`
    (`e1`) and `:715–723` (`e2`) pin the receiver-level pair. **No row covers the
    imported-symbol, `enum`, or empty-literal spellings**, and the direct seam
    tests `tests/expression-stdlib-array.test.ts:76` and `:83` pass concrete
    `prim` types only, so no test exercises `checkArrayJoin` with a `named`
    element at all.
- **Observed at:** `0.72.0` (HEAD `552b4ace`, parent of nothing; the 0089 fix
  `a3b30ed3` is its parent). Offline, deterministic; no live model, no provider.
  Scratch vitest calling `parseDoc` (`tests/helpers/e2e-s1.ts`, which wraps the
  production `parseThetaDocument`) on each source and printing the aggregated
  `code` and `message` lists; written, run, deleted. Every row below is from one
  such run at that commit with a clean tree.

## Summary

The `array.join` element-type precondition is decided at two levels, by two
`kind` tests, and they treat a name the `TypeEnv` cannot resolve in opposite
ways.

The **receiver** test (`src/parser/type-layer-checks.ts:1428`) admits only
`kind === "array"`. An unresolvable `named` receiver is not an `array`, so the
whole `join` branch is skipped and nothing is reported. The **element** test
(`src/runtime/stdlib-array.ts:107–109`) admits only a `prim` `string` or a
`string`-typing literal. An unresolvable `named` element is neither, so it falls
through to an `error`-severity `theta/parse/non-string-array-join` and the theta
does not register (`src/extension/production-composition.ts:2092`).

Measured at HEAD, with `Nope` undeclared in both:

```
fn f(xs: array<Nope>): string { xs.join(",") }
  → ["theta/parse/non-string-array-join"]   "… got array<Nope>"    [element: REJECTS]
fn f(xs: Nope): string { xs.join(",") }
  → []                                                             [receiver: DEFERS]
```

Five spellings reach the element arm's refusal, and they are not one input
class in intent: an undeclared name, a `.thetalib`-imported name, an `enum`
name, an alias-cycle participant, and the synthesised `named "unknown"` an
empty array literal with no sink types as. The refusal is uniform across all
five because the only thing they share is what `unfoldAlias` reports about
them — nothing. `checkArrayJoin` receives a `CompatType` and no `TypeEnv`
(`stdlib-array.ts:100–103`), so it is structurally incapable of asking why a
`named` did not unfold.

Two of the five bound the disposition from opposite sides. `array<Color>` for
`enum Color { red, green }` is refused, and `expressions.md:236` lists an enum
type as not `string` for operator purposes, so the answer is one the corpus
supports — reached, however, through the unresolvable path rather than through
any enum rule. Against that, `array<E>` for a `.thetalib`-imported `E` is
refused, and if the library declares `schema E = string` then under TYPE-11 the
element type **is** `string` and `expressions.md:108` owes no diagnostic. The
importer's parse holds nothing about `E` — `code-registry-parse.md:90` states
that it holds "neither the imported symbol's field bodies nor its kind" — so the
parser cannot distinguish that program from the one whose library declares
`schema E = integer`. It refuses both.

No spec sentence decides the class. `expressions.md:108` and the registry
*Trigger* at `code-registry-parse.md:43` are total over element types and name
resolvability nowhere, so the reject is admissible under them but not mandated
by them. The corpus's one general deferral rule
(`type-system.md:48`) is scoped to "either side of a compatibility check", the
closed check-site list at `:27` omits the `join` element precondition, and
`checkArrayJoin` correspondingly decides structurally rather than through
`checkCompatible` — so that rule does not reach this site and the element arm
does not violate it. The receiver arm's defer rests on a different ground again:
the `join` row sits in the `*array<T>*` member table (`expressions.md:103`),
whose rows presuppose an `array<T>` receiver, and `unknown-method`'s *Trigger*
(`:63`) is scoped to "a built-in type".

The asymmetry predates bug 0089 and is unchanged by it. 0089's §Fix pinned only
the *receiver*-level pair — its constraint (`:334–336`) and its two fix-record
restatements (`:459–461`, `:546–549`) all name gate 1 against gate 2, never the
two levels of gate 2. The element level entered 0089 through its review round 1,
which unfolded the element to stop a false refusal of
`schema E = string` / `schema L = array<E>`, and the comment that landed with it
asserts the disposition without a spec anchor
(`type-layer-checks.ts:1434–1436`). Row `b12` now pins the behaviour so it
cannot drift silently; a fix here updates that pin deliberately.

## Reproduction

Offline, at `552b4ace`. Scratch vitest calling `parseDoc`
(`tests/helpers/e2e-s1.ts`) with `---\nmode: prompt\n---` prepended to each
source, printing the whole aggregated `code` list and `message` list, unfiltered
and in emission order. `JOIN(T)` is

```
fn f(xs: T): string {
  xs.join(",")
}
1
```

and `ITER(T)` the same signature with `for x in xs { x }` as the body. The
trailing `1` supplies the theta's final value. Every row is from one run.

### The asymmetry — two levels of one gate, one undeclared name

```
@@ element   JOIN("array<Nope>")
   codes :: ["theta/parse/non-string-array-join"]
   msgs  :: ["array.join requires a string element type; got array<Nope>"]
@@ receiver  JOIN("Nope")
   codes :: []
@@ iterand   ITER("Nope")                        [0089 group (e) row 1, for contrast]
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got Nope"]
```

Rows 2 and 3 are bug 0089's group (e) rows 2 and 1, reproduced unchanged
sixteen versions on. Row 1 is the level 0089 did not pin in §Fix.

### The two controls, so the gate is known to be live

```
@@ JOIN("array<string>")                                             [must stay silent]
   codes :: []
@@ JOIN("array<integer>")                       [the registered trigger population]
   codes :: ["theta/parse/non-string-array-join"]
   msgs  :: ["array.join requires a string element type; got array<integer>"]
```

### The five spellings that reach the element arm's refusal

```
@@ 1 undeclared name          JOIN("array<Nope>")
   codes :: ["theta/parse/non-string-array-join"]     "… got array<Nope>"
@@ 2 imported name            import { E } from "./p.thetalib"  +  JOIN("array<E>")
   codes :: ["theta/parse/non-string-array-join"]     "… got array<E>"
@@ 3 enum name                enum Color { red, green }  +  JOIN("array<Color>")
   codes :: ["theta/parse/non-string-array-join"]     "… got array<Color>"
@@ 4 alias-cycle participant  schema A = B / schema B = A  +  JOIN("array<A>")
   codes :: ["theta/parse/type-alias-cycle","theta/parse/non-string-array-join"]
   msgs  :: ["type-alias cycle: A → B → A","… got array<A>"]
@@ 5 empty literal, no sink   [].join(",")
   codes :: ["theta/parse/non-string-array-join"]     "… got array<unknown>"
```

Spellings 1–4 are names absent from the `TypeEnv` for three different reasons:
undeclared, never registered (`collectTypeEnv` takes only `schema`
statements, `type-layer-checks.ts:315`, and no import path touches a `TypeEnv`),
and omitted as a cycle participant (`:318`). Spelling 5 is the synthesised
sentinel `#commonType` returns for an empty candidate list — `unknown` is not a
type the grammar spells (`rg -n "unknown" docs/spec_topics/grammar.md` returns
nothing), so the message names a type the author cannot have written.
Spelling 5's annotated twin is green, and stays green: `let e: array<string> = []`
then `e.join(",")` reports `[]`, which is bug 0083's row `b1`.

### The same five names at the receiver level, where the gate defers

```
@@ JOIN("Nope")                                                   codes :: []
@@ import { E } … + JOIN("E")                                     codes :: []
@@ enum Color { red, green } + JOIN("Color")                      codes :: []
@@ schema A = B / schema B = A + JOIN("A")
   codes :: ["theta/parse/type-alias-cycle"]        [the cycle only; the gate is silent]
```

One HEAD, one gate, one set of names: at the receiver position each is silent,
at the element position each refuses.

### The imported element, at every other position on the same symbol

```
@@ import { E } … + fn f(xs: array<E>) { xs.length }               codes :: []
@@ import { E } … + fn f(xs: array<E>) { for x in xs { x } }       codes :: []
@@ import { E } … + fn f(xs: array<E>) { xs.includes("a") }        codes :: []
@@ import { E } … + fn f(xs: array<E>): string { xs.join(",") }
   codes :: ["theta/parse/non-string-array-join"]     "… got array<E>"
```

`join` is the only `array<T>` member with an element-type precondition, so it is
the only position on this symbol that refuses. If the library declares
`schema E = string`, the element type is `string` under TYPE-11 and
`expressions.md:108` owes nothing — and the refusal is `E` severity, so the theta
does not register.

### The author is told nothing about the unresolvable name at these positions

```
@@ fn f(xs: array<Nope>) { 1 }                     [name unused, no join]
   codes :: []
@@ JOIN("array<Nope>")
   codes :: ["theta/parse/non-string-array-join"]           [one code, not two]
@@ schema L = array<Nope>  +  JOIN("L")            [same name via an alias RHS]
   codes :: ["theta/parse/unresolved-named-type","theta/parse/non-string-array-join"]
   msgs  :: ["unresolved named type 'Nope'","… got array<Nope>"]
@@ schema E2 = Nope        +  JOIN("array<E2>")    [same name via an alias RHS]
   codes :: ["theta/parse/unresolved-named-type","theta/parse/non-string-array-join"]
```

`theta/parse/unresolved-named-type`'s five registered positions
(`code-registry-parse.md:90`) include the right-hand side of a
`schema X = …` and exclude a `fn`-parameter annotation, so the diagnostic that
names the actual fault appears only when the author happens to route the name
through an alias. Written directly, the sole report is the `join` rejection,
whose *Fix hint* column reads "Map elements to strings first; no implicit type
conversion in theta 1.0" — advice that does not repair the program.

### The `let` route reaches the same disposition, so this is not `fn`-specific

```
@@ let e: array<Nope> = []   +   e.join(",")
   codes :: ["theta/parse/non-string-array-join"]     "… got array<Nope>"
```

### Declaring the name flips the row, which locates the decision precisely

```
@@ schema Nope = string  +  JOIN("array<Nope>")                   codes :: []
@@ schema unknown = string  +  [].join(",")
   codes :: ["theta/parse/schema-case-mismatch"]
   msgs  :: ["schema name must start with an uppercase letter"]
```

The first row is 0089's `b5` in another spelling: nothing about the element
changes except that `unfoldAlias` can now walk it. The second shows the
synthesised sentinel is shadowable in the `TypeEnv` — the `join` rejection
disappears — and that no program loads that way, because
`theta/parse/schema-case-mismatch` is itself `E` (`code-registry-parse.md:20`).

### The dispositions any route must leave alone

```
@@ schema P { a: string }  +  JOIN("array<P>")     [TYPE-10, 0089 row b11]
   codes :: ["theta/parse/non-string-array-join"]     "… got array<P>"
@@ schema P { a: string }  +  JOIN("P")
   codes :: ["theta/parse/unknown-method"]        "unknown method 'join' on type P"
@@ fn f(xs: array<Nope>) { xs.frobnicate() }
   codes :: ["theta/parse/unknown-method"]  "unknown method 'frobnicate' on type array<Nope>"
```

The first is TYPE-10: an object-schema `named` comes back from `unfoldAlias`
unchanged and is not `string`. The third establishes the structural fact the
whole report turns on — the *receiver* of `array<Nope>` is a concrete `array`, so
`classifyReceiver` returns `"array"` and the `unknown-method` allow-list runs.
Only the element is unresolvable.

## Expected behaviour

The anchor is `docs/spec_topics/expressions.md:108`, the `join` row of the
`*array<T>*` stdlib table:

> Concatenates elements with `sep`. Element type must be `string`; non-string
> element types are `theta/parse/non-string-array-join` (no implicit type
> conversion in theta 1.0)

and the registered *Trigger*, `code-registry-parse.md:43`:

> `arr.join(...)` invoked on an array whose element type is not `string`.

Neither sentence names resolvability. Two readings follow, and which governs is
the adjudication this report owes.

**Reading A — an unresolvable element type is a "non-string element type"; the
current reject is correct.** Four supports:

1. Both sentences are total over element types. "Element type must be `string`"
   states a condition for admission, so admission requires establishing
   `string`; an element the parser cannot resolve does not establish it. A
   carve-out has to be read in, and neither sentence carries one.
2. The corpus's one general deferral rule does not reach this site.
   `type-system.md:48` is scoped to "either side of a **compatibility check**",
   and the closed check-site list at `:27` does not include the `join` element
   precondition — its `array<T>` entry is "an `array<T>` element against its
   sink", the array-literal rule `expressions.md:222–224` owns. The
   implementation matches: `checkArrayJoin` decides structurally
   (`stdlib-array.ts:107–109`) and is never reached through `checkCompatible` or
   `decide`, which is where the `"unknown"` arms live
   (`type-compat.ts:254`, `:258`, `:268`).
3. `:48`'s posture is predicated on a second phase — "the parse-time check is
   skipped and the runtime AJV check is the safety net", against `:29`'s
   operational definition. The `join` element has no second phase: the runtime
   performs `Array.prototype.join` unconditionally on the stated ground that the
   parse-time precondition already held (`stdlib-array.ts:63–67`). Deferring at
   the element level therefore produces the implicit conversion `:108` forbids,
   reported at neither phase — the consequence bug 0089's §Why it matters item 3
   measured for `array<integer>`.
4. The receiver arm's defer is not evidence of a resolvability policy, so it is
   not evidence against this reading. The `join` row sits inside the
   `*array<T>*` member table (`expressions.md:103`), whose rows presuppose a
   receiver of type `array<T>`; an unresolvable `named` is not statically one, so
   the row's applicability is unestablished rather than its condition unmet.
   `unknown-method`'s *Trigger* is likewise scoped to "a built-in type"
   (`code-registry-parse.md:63`). The two arms answer two questions — does this
   row apply, and is this row's condition met.

**Reading B — an element the parser cannot resolve is owed a defer, as the
receiver is.** Three supports:

1. The corpus's one explicit disposition for a name the importing file's parse
   cannot resolve says the check does not run. `expressions.md:214`: "A name
   imported from a `.thetalib` always resolves at this position — the importer's
   parse holds neither the imported symbol's field bodies nor its kind — so the
   field-set checks above do not run and the construction is not checked here."
   Measured, the constructor position behaves that way. The element position does
   not, on the same class of name.
2. Reading A refuses at least one program the spec admits. Measured: with
   `import { E } from "./p.thetalib"`, `array<E>.join(",")` is refused at `E`
   severity. If the library declares `schema E = string` the element type **is**
   `string` under TYPE-11 (`type-system.md:54`) and `:108` owes no diagnostic.
   The importer cannot tell — `code-registry-parse.md:90` states its parse holds
   neither the symbol's field bodies nor its kind — so Reading A refuses the legal
   and the illegal member of that pair alike.
3. `:48`'s posture, if not its letter, is the corpus's stated attitude to an
   operand past the parser's static view, and the `⊑` machinery implements it
   with explicit arms (`type-compat.ts:254`, `:258`, `:268`). The element arm is
   the one type test in the method-call path with no such arm.

**Neither reading governs the whole class, which is why this is unadjudicated
rather than a defect.** The class is not homogeneous, and the parser cannot
partition it:

- Under Reading A the `enum` spelling reaches an answer the corpus independently
  supports (`expressions.md:236` lists an enum type as not `string` where two
  `string` operands are required, and `schemas.md:93` fixes enum values as
  strings without making the type a `string`), while the imported spelling is a
  measured refusal of a program the spec admits.
- Under Reading B the imported spelling loads as the spec admits, while the
  `enum` and empty-literal spellings lose the only check there is — and there is
  no runtime phase to catch them, so `array<Color>.join(",")` and
  `[].join(",")` would stringify by host coercion with nothing reported at either
  phase.

Whichever way it lands, one clarifying sentence is owed, and this report asks for
it: at `expressions.md:108`, or beside `:103`, or in the *Unresolvable operands*
paragraph at `type-system.md:48` extended past `⊑` sites. It must say (a) whether
an element type the parser cannot resolve is inside "non-string element type",
and (b) what makes the receiver position's silence correct — the row-applicability
ground of Reading A's point 4 is stated nowhere, and `expressions.md:73`, the
only scoping sentence the member-table section carries, does not supply it. A
third question is owed on either route: whether the author is entitled to a
diagnostic naming the unresolvable element at all, given that
`unresolved-named-type`'s five registered positions
(`code-registry-parse.md:90`) exclude the two annotations these rows use.

## Actual behaviour / root cause

**The element arm has no resolvability arm and cannot have one as written.**
`checkArrayJoin` (`src/runtime/stdlib-array.ts:100–124`):

```ts
export function checkArrayJoin(
  elementType: CompatType,
  site: CompatSite,
): Diagnostic | undefined {
  const isString =
    (elementType.kind === "prim" && elementType.name === "string") ||
    (elementType.kind === "literal" && elementType.typesAs === "string");
  if (isString) {
    return undefined;
  }
  return { severity: "error", code: "theta/parse/non-string-array-join", … };
}
```

The predicate is a two-shape allow-list. Every other `CompatType` shape — `array`,
`object`, `union`, and `named` in all its variants — falls to the emission. The
signature takes no `TypeEnv` and the module imports none (`:26`), so the function
cannot distinguish `named Nope` from `named P` for `schema P { a: string }` from
`named "unknown"`: all three are one branch. This is the same structural
incapacity bug 0113 records for `listTree` — a function that cannot answer the
question it is being asked, because the input that would answer it is not a
parameter.

**By the time the element is tested, resolvability has already been read once
and discarded.** `checkMethodCall` (`src/parser/type-layer-checks.ts:1417–1459`)
runs three steps in order:

1. `:1427` — `unfoldAlias(targetType, this.env)`. For a receiver that is
   `array<Nope>` this is a no-op: the receiver is already `kind === "array"`.
2. `:1428` — the receiver test. It passes, so the element arm runs.
3. `:1437` — `checkArrayJoin(unfoldAlias(unfoldedTarget.element, this.env), …)`.
   `unfoldAlias` walks while `current.kind === "named"` and returns `current`
   unchanged when `resolveNamed` yields `undefined` (`type-compat.ts:166–168`).
   So it **has** established that `Nope` is unresolvable, and it reports that
   fact by returning the input byte-identical — a signal `checkArrayJoin` cannot
   read, because "unchanged" and "resolved to a non-`string`" are the same value
   shape.

`classifyReceiver` (`:166–189`) is the one place in this path that names
unresolvability as such: its `named` arm returns `"unknown"` when `resolveNamed`
finds nothing (`:180–181`), and `:1449–1451` turns that into a silent return.
That runs at `:1448` — **after** the element arm has already pushed its
diagnostic at `:1442`. The information the element arm lacks is computed eleven
lines below it, for a different purpose.

**The two arms' asymmetry is structural, not incidental.** The receiver arm is a
*guard*: `kind === "array"` admits, anything else skips, so an unrecognised
receiver shape **defers**. The element arm is a *predicate*: two shapes admit,
anything else emits, so an unrecognised element shape **rejects**. This is the
same guard-against-predicate inversion bug 0089 identified between its two
gates, one level down and inside a single gate. Bug 0089's fix made both arms
TYPE-11-transparent, which changed which inputs reach each arm without changing
either arm's polarity.

**The class the element arm refuses is assembled by three unrelated mechanisms.**
`collectTypeEnv` (`:302–331`) registers only `stmt.kind === "schema"` (`:315`),
so an `enum` (`src/parser/theta-document.ts:630`) is absent by omission; a cycle
participant is dropped at `:318`, which `unfoldAlias`'s doc comment records as
the bound on its own termination (`type-compat.ts:157–163`); imported symbols
are absent because all three call sites pass body statements only and no import
code touches a `TypeEnv`. The synthesised `named "unknown"` is absent because it
was never a declaration. Four causes, one observable, one disposition — and the
disposition is taken by a function that knows about none of them.

**No runtime phase exists to defer to.** `stdlib-array.ts:63–67` states the
contract in terms: "The parse-time `checkArrayJoin` precondition guarantees a
`string` element type, so no implicit conversion happens here", followed by
`receiver.join(args[0] as string)`. There is no element check at runtime and no
AJV validation of an array's elements at a `join` call. So the deferral posture
`type-system.md:48` describes — skip the parse check, let AJV catch it — has no
second half at this site, which is the strongest single argument against
Reading B and is not stated anywhere in the spec.

**The refusal is a load failure, not a warning.** The code is `E`
(`stdlib-array.ts:116`), `hasLoadParseError`
(`src/extension/production-composition.ts:2045–2052`) selects any
`error`-severity `theta/parse/*`, and `parseDiscoveredTheta` drops the theta at
`:2092`. Every refusing row in §Reproduction is a slash command that does not
register.

**The author's repair path is not named by the diagnostic they get.** Measured:
at the `fn`-parameter and `let`-annotation positions the sole diagnostic is the
`join` rejection, because `unresolved-named-type`'s five registered positions
(`code-registry-parse.md:90`) do not include either. The rejection's message
renders the unresolvable name as though it were a known non-`string` type
(`array.join requires a string element type; got array<Nope>`), which is exactly
the registry template with `<element>` interpolated, so it is DIAG-4-correct and
still does not say that `Nope` resolves to nothing. Routing the same name
through an alias right-hand side adds the diagnostic that does
(`unresolved named type 'Nope'`), which makes the informativeness of the report
depend on a spelling choice with no bearing on the fault.

## Why it matters

- **A measured spec-legal program does not register.** With
  `import { E } from "./p.thetalib"` and the library declaring
  `schema E = string`, `array<E>.join(",")` is `array<string>.join(",")` under
  TYPE-11 and `expressions.md:108` owes no diagnostic. Measured, it draws
  `theta/parse/non-string-array-join` at `E` severity and the theta is dropped.
  Every other position on the same symbol is silent — `.length`, `.includes(…)`,
  the iterand gate — so the author sees one member of the stdlib table refuse an
  imported element type and the rest accept it.
- **`[].join(",")` does not register.** Two tokens, no elements, no conversion
  possible, and the reported element type is `unknown` — a name the type grammar
  does not spell. The annotated twin `let e: array<string> = []` then
  `e.join(",")` loads, so the difference between loading and not is whether a
  sink is in scope for a literal that has nothing to sink.
- **The corpus asserts the disposition only in a code comment.**
  `src/parser/type-layer-checks.ts:1434–1436` states that an unresolvable
  element "comes back unchanged and stays non-string" as an extension of TYPE-10.
  TYPE-10 (`type-system.md:52`) covers the object-schema half and says nothing
  about the unresolvable half. A behaviour asserted in a comment and pinned in a
  test, with no sentence behind it, is what DIAG-2 and the registry's *Trigger*
  column exist to prevent.
- **One gate answers the same class two ways, and the distinguishing principle
  is unwritten.** Measured on one HEAD: four names at the receiver position are
  silent and the same four at the element position refuse. Reading A's
  row-applicability ground for that split is defensible and appears nowhere in
  the corpus; `expressions.md:73`, the member-table section's only scoping
  sentence, does not supply it.
- **The informativeness of the refusal depends on an irrelevant spelling
  choice.** `array<Nope>` written in a `fn` parameter draws one diagnostic;
  the same element reached through `schema L = array<Nope>` draws two, the second
  naming `Nope` as unresolved. The five registered positions of
  `unresolved-named-type` (`code-registry-parse.md:90`) are what select between
  them, and neither the *Fix hint* nor the *Message* of the code the author does
  get points at the actual repair.
- **Both directions engage GOV-15 observable (b).**
  `docs/spec_topics/governance/source-language-stability.md:5` promises identical
  ordered diagnostic-code sequences across theta 1.x for a file that loads
  cleanly. Deferring at the element level makes five currently-refused programs
  load, and rejecting at the receiver level makes currently-clean programs refuse
  (measured `[]` today for `JOIN("Nope")`, `JOIN("E")` and `JOIN("Color")`). The
  second direction is the one GOV-15 governs, and it is the reason the receiver
  arm cannot be moved without the adjudication.
- **The class will grow silently.** `collectTypeEnv` decides membership as a
  side effect of what it registers (`:315`, `:318`). Any future declaration form
  it does not register — or any further synthesised sentinel — joins the refused
  class with no edit to this gate and no diagnostic distinguishing it, exactly as
  `enum` and `named "unknown"` did.

## Non-goals

- **The receiver-level pair bug 0089 pinned.** Reject at the iterand gate, defer
  at the join gate for an unresolvable `named` (0089's group (e) rows 1–2,
  `:183–184`) is that report's constraint and this report measures it unchanged.
  Whether it *should* move is inside §Fix route (b); the pin itself is not
  reopened here, and nothing in this report asserts it is wrong.
- **Whether an empty literal with no sink should have an element type at all.**
  `expressions.md:220` sources it "from context (binding annotation, parameter
  type, or surrounding constructor field)" and gives no disposition for the
  no-context case; `#commonType`'s `named "unknown"` for an empty candidate list
  is bug 0083's subject. This report measures what the join gate does with the
  resulting value, not how the value is derived.
- **`unresolved-named-type`'s five-position list.** Whether a `fn`-parameter or
  `let` annotation should be a sixth position is bug 0028's built list and bug
  0051's adjacent gap. This report cites the exclusion as the reason its rows
  carry one diagnostic rather than two; widening the list is a separate
  adjudication and would not by itself decide what the join gate does.
- **A resolvable element that is not a `prim` `string`.** `array<P>` for an
  object schema (TYPE-10, pinned by 0089's row `b11`), `array<array<string>>`,
  and an alias of a string-literal union (measured:
  `schema Sev = "low" | "high"` with `array<Sev>` refuses, rendering
  `got array<"low" | "high">`) are all resolvable, so `unfoldAlias` reaches a
  non-`named` form and the question this report asks does not arise. Whether a
  union whose arms are all `string` satisfies "Element type must be `string`" is
  a distinct input class and is not adjudicated here.
- **The iterand gate.** `checkForIterand` is a separate `kind === "array"` test
  in a separate file with its own registered code
  (`code-registry-parse.md:64`), fixed by bug 0089 and cited here only as the
  contrast row.
- **`pushUnknownMethod`'s raw render.** Bug 0089 deliberately keeps the declared
  type at `type-layer-checks.ts:1457` so `unknown method '…' on type L` names
  what the author wrote. Untouched by anything here.
- **Runtime behaviour of the refused programs.** They do not register
  (`production-composition.ts:2092`), so no value is produced. What the runtime
  would do if they did is §Fix route (a)'s problem, not an observable today.

## Fix

**Not settled. This report exists to pin the spec disposition first.** Bug
0089's §Fix pinned the receiver-level pair and did not reach the element level;
the element disposition currently rests on a code comment
(`src/parser/type-layer-checks.ts:1434–1436`) and two witness rows. Three routes
are open. They are not equally cheap and they are not equally safe, and this
report decides none of them.

**(a) Defer at the element level, matching the receiver level.** `checkArrayJoin`
gains a `TypeEnv` (or its caller pre-tests resolvability at
`type-layer-checks.ts:1437` and skips the call), so a `named` the env cannot
resolve returns `undefined` instead of a diagnostic. Consequences:

- The imported-element program loads, which is what Reading B's point 2 requires.
- Five currently-refused programs load, including `[].join(",")` and
  `array<Color>.join(",")` for an `enum`. Each then reaches
  `stdlib-array.ts:66–67`, which joins unconditionally with no element check, so
  a non-`string` element is stringified by host coercion — the implicit
  conversion `expressions.md:108` states theta 1.0 does not perform, reported at
  neither phase. That is the cost `:48`'s AJV predicate does not cover here,
  and a route that takes it owes a sentence saying so.
- `expressions.md:108` needs the carve-out sentence, because the *Trigger* at
  `code-registry-parse.md:43` read literally still covers the input. Under
  DIAG-2 (`diagnostic-shape.md:72`) a *Trigger* narrowing is a spec change
  landing in the same commit, with its `docs/reference/` mirrors updated — here
  `docs/reference/diagnostics.md:89`, which carries no *Trigger* column and so is
  unaffected. DIAG-4 (`:74`) forbids rewording the *Message*, and no
  reword is needed: the code stops firing for this class rather than rendering
  differently.
- Rows `b12` and `b13` move from a one-code list to `[]` and
  `["theta/parse/type-alias-cycle"]`. Both are `toEqual` assertions on the exact
  aggregated list, so the update is deliberate and visible.

**(b) Keep the element reject and amend the receiver level to match.** The
receiver arm's guard at `:1428` gains an unresolvable-`named` case that reports
rather than skipping. Consequences:

- Three measured currently-clean programs refuse (`JOIN("Nope")`,
  `JOIN("E")` for an imported `E`, `JOIN("Color")` for an `enum`), which is
  GOV-15's governed direction
  (`governance/source-language-stability.md:5`, observable (b)) and needs the
  registry carve-out reasoning stated for the inputs it touches.
- It needs a code. `non-string-array-join`'s *Trigger* is "an array whose element
  type is not `string`" (`code-registry-parse.md:43`) and an unresolvable
  receiver is not an array at all, so this route either widens that *Trigger* or
  mints a row — a DIAG-2 addition with its own mirror in
  `docs/reference/diagnostics.md`. It also collides with
  `unknown-method`'s *Trigger* (`:63`, scoped to "a built-in type"), which is
  what makes the receiver silent for **every** member rather than for `join`
  alone: a route that reports at `join` only leaves `.length`, `.includes(…)` and
  `.frobnicate()` silent on the same receiver, which is a new inconsistency in
  place of the current one.
- Rows `e2` and 0089's constraint at `:334–336` move. That constraint is stated
  as a preservation requirement, so this route reverses a decision 0089 recorded
  deliberately and must say so.

**(c) Keep both and document the asymmetry as intended.** No code changes; the
spec gains the two sentences §Expected behaviour names — an element type the
parser cannot resolve is a "non-string element type", and the member table's rows
apply only to a receiver statically known to be an `array<T>`. Consequences:

- Cheapest, and it is the only route that changes no observable, so GOV-15 is not
  engaged in either direction.
- It ratifies the measured refusal of the imported-element program, so it owes an
  answer to Reading B's point 2 — either that the program is not in fact legal, or
  that refusing it is an accepted cost with a stated reason. `expressions.md:214`
  is the nearest precedent and it points the other way, so the sentence has to
  distinguish the element position from the constructor position on some ground
  other than "the check exists here".
- It leaves the author's repair path unnamed, so it probably pairs with a
  determination on the third question in §Expected behaviour (whether
  `unresolved-named-type` is owed at these positions) even though that list is
  bug 0028's and bug 0051's.

**Constraints every route satisfies.**

- **Bug 0089's witness moves deliberately, not incidentally.**
  `tests/fn-param-alias-unfolded-at-gates.test.ts` is a 36-row `toEqual` witness
  with five separately-proved neutralisations. Rows `b12` (`:492–509`) and `b13`
  (`:511–528`) pin the element-level disposition and rows `e1` (`:698–713`) and
  `e2` (`:715–723`) the receiver-level pair. Route (a) moves `b12`/`b13`; route
  (b) moves `e2`; route (c) moves neither. Whichever moves, the row's comment is
  rewritten to cite the new sentence, because both rows currently justify
  themselves by restating the mechanism.
- **`unfoldAlias` keeps returning an unresolvable `named` intact.**
  `src/parser/type-compat.ts:166–168`, documented at `:151–153`. Four other
  consumers depend on it — the three `decide` arms (`:254`, `:258`, `:268`) and
  `classifyReceiver`'s `named` arm (`type-layer-checks.ts:180–181`) — so the
  transparency must not be changed to *resolve* the unresolvable. Any
  resolvability test belongs at the join call site or inside `checkArrayJoin`
  with an env, not in `unfoldAlias`.
- **A cycle participant behaves as an unresolvable name.** `collectTypeEnv`
  omits it (`type-layer-checks.ts:318`), and `unfoldAlias`'s termination argument
  rests on that omission (`type-compat.ts:157–163`). Row `b13` and 0089's group
  (e) row 5 pin it. A route that keys on "resolvable" therefore also decides the
  cycle case, and must state which of `["theta/parse/type-alias-cycle"]` and
  `["theta/parse/type-alias-cycle","theta/parse/non-string-array-join"]` is
  correct rather than letting it fall out.
- **The synthesised `named "unknown"` sentinel is in or out of the class
  explicitly.** It is shadowable in the `TypeEnv` (measured:
  `schema unknown = string` removes the join rejection, at the cost of an
  `E`-severity `theta/parse/schema-case-mismatch`, `code-registry-parse.md:20`),
  so a route that keys on resolvability alone gives an
  author-declaration-sensitive answer for the empty-literal case. Whether the
  sentinel is treated as an unresolvable name or as its own shape is a decision,
  not a detail.
- **DIAG-2 and DIAG-4.** Any *Trigger* change lands in the same commit as the
  code (`diagnostic-shape.md:72`), with the `docs/reference/` mirrors updated —
  `docs/reference/diagnostics.md:89` carries the *Message* only and takes no
  *Trigger* edit. The *Message* is normative and stays byte-exact (`:74`); no
  route needs a reword, because each changes whether the code fires rather than
  what it says.
- **GOV-15 is engaged in whichever direction makes a currently-clean program
  refuse.** `governance/source-language-stability.md:5`, observable (b). Route
  (b) is that direction and needs the diagnostic-registry carve-out reasoning
  recorded for the inputs it touches. Route (a) moves the sequence the other way
  for five spellings, which the same carve-out covers. Route (c) moves nothing.
- **The two silence controls stay silent.** `JOIN("array<string>")` reports `[]`
  and `let e: array<string> = []` then `e.join(",")` reports `[]` (bug 0083's row
  `b1`, `tests/let-annotation-recorded-binding-type.test.ts:148–154`). Both are
  required after any route.
- **The registered trigger population keeps rejecting.**
  `JOIN("array<integer>")` and `array<P>` for an object schema (0089's `b11`,
  `:473–490`) must keep reporting `theta/parse/non-string-array-join` with their
  own rendered element names, whichever route lands.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseThetaDocument` call over a source string, so the harness is the
existing `parseDoc` (`tests/helpers/e2e-s1.ts`) and the shape is
`tests/fn-param-alias-unfolded-at-gates.test.ts` extended rather than a new
mechanism. Required: the five refusing spellings and their receiver-level twins
paired on one HEAD; the imported-element rows at all four positions on one
symbol, which is what reds if a route narrows to the `fn`-parameter spelling
only; the `let`-route row, which is what reds if a route keys on the parameter
record; the two silence controls; the registered-trigger controls; and the
`schema Nope = string` row, which pins that declaring the name is what flips the
disposition. Exact aggregated code lists with `toEqual`, never a containment
matcher, and every asserted message sourced from the registry's *Message* column
per DIAG-4, as the 0089 witness already does. No live test is implicated: the
whole subject settles at parse time, and the shipped H8a cell 0089 added drives
the iterand gate, not this one.

## Provenance

- Origin: the bug 0089 fix (0.72.0, commit `a3b30ed3`). Its own residuals
  flagged this element-level disposition as one for an operator eye rather than
  a filed defect, on the grounds that it predates the fix, is unchanged by it,
  and is now pinned by row `b12` so it cannot drift silently. That flag lives in
  the run's fix report under `.pi/tmp/`, which `.gitignore:26` excludes from the
  tree; the committed trace is 0089's §Fix (0.72.0) — the constraint at
  `:334–336`, the *Bounds asserted, not assumed* sentence at `:460–461`, and the
  *Pinned dispositions / non-goals* paragraph at `:546–549`, all three of which
  name the receiver-level pair only — plus witness rows `b12` and `b13`. This
  report adds what none of those record: the measured five-spelling class the
  element arm refuses, the imported-element row and its three silent siblings on
  one symbol, the `[].join(",")` row, the receiver-level twins of all four
  declared spellings on one HEAD, the absent `unresolved-named-type` at these two
  annotation positions against its presence via an alias right-hand side, the
  two readings of `expressions.md:108` with the argument between them, the
  finding that neither reading governs the whole class, and the three §Fix routes
  with their constraints.
- Spec: `docs/spec_topics/expressions.md:71` (the section heading), `:73` (its
  scoping sentence), `:103` (the `*array<T>*` table label), `:108` (the `join`
  row — the anchor), `:214` (the imported-name constructor deferral), `:220`
  and `:222–224` (array construction and the common-type rules), `:236` (the
  ordering operators, where an enum type is not `string`);
  `docs/spec_topics/type-system.md:27` (the closed check-site list), `:29` (the
  operational definition), `:48` (*Unresolvable operands*), `:52` (TYPE-10),
  `:54` (TYPE-11); `docs/spec_topics/schemas.md:93` (enums carry string values
  only); `docs/spec_topics/imports.md:50`
  (`theta/parse/import-unknown-symbol`); `docs/spec_topics/grammar.md` (no
  `unknown` type atom — `rg -n "unknown"` returns nothing);
  `docs/spec_topics/diagnostics/code-registry-parse.md:20`
  (`schema-case-mismatch`, `E`), `:43` (`non-string-array-join`), `:63`
  (`unknown-method`), `:64` (`non-array-iterand`), `:90`
  (`unresolved-named-type` and its five positions);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15). User-facing mirror: `docs/reference/diagnostics.md:89`.
- Implementation evidence at `552b4ace`: `src/runtime/stdlib-array.ts:26` (the
  import, no `TypeEnv`), `:63–67` (the runtime `join` case and its stated
  precondition), `:100–124` (**`checkArrayJoin`** — the signature `:100–103`, the
  predicate `:107–109`, the admit `:110–112`, the emission `:115–123` with
  severity at `:116` and code at `:117`);
  `src/parser/type-layer-checks.ts:90` (the import), `:166–189`
  (`classifyReceiver`, the unresolvable arm `:180–181`), `:226` (a
  `collectTypeEnv` call site), `:302–331` (`collectTypeEnv`, the `schema`-only
  registration `:315`, the cycle omission `:318`), `:1417–1459`
  (**`checkMethodCall`** — the receiver unfold `:1427`, the receiver test
  `:1428`, the element comment `:1429–1436`, the `checkArrayJoin` call
  `:1437–1440`, the receiver-defer comment `:1445–1447`, the `"unknown"` return
  `:1449–1451`, the raw render `:1457`);
  `src/parser/type-compat.ts:104–106` (`resolveNamed`), `:147–154`
  (`unfoldAlias`'s doc, the unresolvable sentence `:151–153`), `:155–172`
  (`unfoldAlias`, the termination note `:157–163`, the walk `:164–170`),
  `:254`, `:258`, `:268` (`decide`'s three `"unknown"` arms);
  `src/parser/theta-document.ts:630` (the `enum` statement kind);
  `src/parser/query-schema-resolve.ts:81` and
  `src/extension/invoke-static-checks.ts:747` (the other two `collectTypeEnv`
  call sites, both body-statements-only);
  `src/extension/production-composition.ts:2045–2052` (`hasLoadParseError`),
  `:2079` (`parseDiscoveredTheta`), `:2092` (the drop).
- Test evidence at `552b4ace`:
  `tests/fn-param-alias-unfolded-at-gates.test.ts:473–490` (`b11`, the TYPE-10
  bound), `:492–509` (`b12`, the undeclared element), `:511–528` (`b13`, the
  cycle participant), `:698–713` (`e1`), `:715–723` (`e2`);
  `tests/let-annotation-recorded-binding-type.test.ts:148–154` (bug 0083's `b1`,
  the annotated empty literal, green at HEAD);
  `tests/expression-stdlib-array.test.ts:76`, `:83` (the only direct
  `checkArrayJoin` seam calls — concrete `prim` types, no `named` element).
- Reproduction: four scratch vitest files at `552b4ace` over the real
  `parseThetaDocument` through `parseDoc` — the two-level asymmetry and its
  controls, the five refusing spellings and their receiver-level twins, the
  imported symbol at four positions, the `let` route, the empty-literal rows,
  the alias-RHS diagnostic contrast, the `schema Nope = string` and
  `schema unknown = string` flips, and the TYPE-10 and `unknown-method` bounds.
  Run on the outputs quoted above, then deleted. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Coordination note — bug 0125 (0.76.0)

Appended by the bug 0125 fix; nothing above is altered. **Note only — this
report is untouched and stays open.**

Bug [0125](./0125-index-element-narrowing-not-alias-unfolded.md) changed one
line in `src/parser/static-type-inference.ts` and touched no file this report
names. Its pin holds: `tests/fn-param-alias-unfolded-at-gates.test.ts` is
byte-unchanged and green at 36/36, so bug 0089's row `b12` is intact.

One interaction is worth recording, because 0125 makes this report's gate
reachable from a new input class. 0125's row c3 —
`schema L = array<array<integer>>` with `fn f(xs: L): string { xs[0].join(",") }`
— now reaches `checkArrayJoin` at all, because the index read narrows to
`array<integer>` instead of the sentinel `named "index"`, and reports
`theta/parse/non-string-array-join`. That is the element gate firing on a
*resolvable* element, which is inside its registered trigger and is not this
report's subject. The unresolvable-element deferral this report prosecutes is
unchanged in both directions.

## Re-derivation note — 0.255.0 (2026-08-23), at HEAD `8dd418b9` (0.246.0)

Appended by a re-derivation pass. **Note only — nothing above is altered, no
code, test or spec file is touched, and this report stays `open` with §Fix
still unsettled.** `docs/bugs/README.md` is untouched.

**Verdict: the subject face survives intact and is NOT mooted.** Every row of
§Reproduction was re-measured at this HEAD through the same harness (`parseDoc`,
`tests/helpers/e2e-s1.ts`, over the production `parseThetaDocument`), in one
scratch vitest file, written, run and deleted. Twenty-seven rows; twenty-six
reproduce byte-identically in code list and message list. One drifted, in the
report's favour — see *Measured drift* below.

### Per-element probe table (re-measured, this HEAD)

`JOIN(T)` is `fn f(xs: T): string { xs.join(",") }` with the `mode: prompt`
frontmatter prepended and a trailing `1`, exactly as §Reproduction defines it.

| # | Input | Codes at this HEAD | vs §Reproduction |
|---|---|---|---|
| A1 | `JOIN("array<Nope>")` — element | `["theta/parse/non-string-array-join"]`, `… got array<Nope>` | same |
| A2 | `JOIN("Nope")` — receiver | `[]` | same |
| A3 | `ITER("Nope")` — iterand | `["theta/parse/non-array-iterand"]`, `'for' expects array<T> after 'in'; got Nope` | same |
| C1 | `JOIN("array<string>")` | `[]` | same (silence control holds) |
| C2 | `JOIN("array<integer>")` | `["theta/parse/non-string-array-join"]`, `… got array<integer>` | same (trigger control holds) |
| S1 | undeclared — `JOIN("array<Nope>")` | `["theta/parse/non-string-array-join"]`, `… got array<Nope>` | same |
| S2 | imported — `import { E } from "./p.thetalib"` + `JOIN("array<E>")` | `["theta/parse/non-string-array-join"]`, `… got array<E>` | same |
| S3 | enum — `enum Color { red, green }` + `JOIN("array<Color>")` | `["theta/parse/non-string-array-join"]`, `… got array<Color>` | same |
| S4 | cycle — `schema A = B` / `schema B = A` + `JOIN("array<A>")` | `["theta/parse/type-alias-cycle","theta/parse/non-string-array-join"]` | same |
| S5 | empty literal — `[].join(",")` | `["theta/parse/non-string-array-join"]`, `… got array<unknown>` | same |
| R2 | receiver, imported — `JOIN("E")` | `[]` | same |
| R3 | receiver, enum — `JOIN("Color")` | `[]` | same |
| R4 | receiver, cycle — `JOIN("A")` | `["theta/parse/type-alias-cycle"]` | same |
| P1 | imported `array<E>` + `.length` | `[]` | same |
| P2 | imported `array<E>` + `for x in xs` | `[]` | same |
| P3 | imported `array<E>` + `.includes("a")` | `[]` | same |
| D1 | `fn f(xs: array<Nope>): integer { 1 }` | `[]` | same |
| D2 | `schema L = array<Nope>` + `JOIN("L")` | `["theta/parse/unresolved-named-type","theta/parse/non-string-array-join"]` | same |
| D3 | `schema E2 = Nope` + `JOIN("array<E2>")` | `["theta/parse/unresolved-named-type","theta/parse/non-string-array-join"]` | same |
| L1 | `let e: array<Nope> = []` + `e.join(",")` | `["theta/parse/non-string-array-join"]`, `… got array<Nope>` | same |
| F1 | `schema Nope = string` + `JOIN("array<Nope>")` | `[]` | same (declaring the name still flips it) |
| **F2** | `schema unknown = string` + `[].join(",")` | `["theta/parse/schema-case-mismatch","theta/parse/non-string-array-join"]` | **DRIFTED** — the join rejection no longer disappears |
| B1 | `schema P { a: string }` + `JOIN("array<P>")` | `["theta/parse/non-string-array-join"]`, `… got array<P>` | same (TYPE-10 bound holds) |
| B2 | `schema P { a: string }` + `JOIN("P")` | `["theta/parse/unknown-method"]`, `unknown method 'join' on type P` | same |
| B3 | `fn f(xs: array<Nope>) { xs.frobnicate() }` | `["theta/parse/unknown-method"]`, `unknown method 'frobnicate' on type array<Nope>` | same |
| B4 | `schema Sev = "low" \| "high"` + `JOIN("array<Sev>")` | `["theta/parse/non-string-array-join"]`, `… got array<"low" \| "high">` | same (§Non-goals row) |
| B5 | `let e: array<string> = []` + `e.join(",")` | `[]` | same (bug 0083's `b1` silence control holds) |

All five refusing spellings, all four receiver-level twins, both silence
controls, both trigger controls and all three bound rows are unchanged. Bug
0089's witness `tests/fn-param-alias-unfolded-at-gates.test.ts` is byte-unchanged
and green at 36/36, so rows `b11`/`b12`/`b13`/`e1`/`e2` are intact.

### Measured drift — the sentinel is no longer shadowable (row F2)

§Fix's constraint *"The synthesised `named "unknown"` sentinel is in or out of
the class explicitly"* rested on the measurement that `schema unknown = string`
removes the join rejection, making a resolvability-keyed route
author-declaration-sensitive for the empty-literal case. **That measurement no
longer holds.** `resolveNamed` (`src/parser/type-compat.ts`) now carries a
read-seam uppercase-first fence — a name whose first character is not `A`–`Z`
resolves to no declaration, whatever the env holds — landed for bug 0038's
`__proto__` witness and deliberately placed at the read seam rather than at
`collectTypeEnv`'s write seam. So the lowercase sentinel `unknown` is
unresolvable by construction and cannot be shadowed. **Consequence for §Fix:**
that constraint's *reason* is discharged. The sentinel is still a decision — it
remains in the refused class under every route, and route (a) would make
`[].join(",")` load — but it is no longer author-declaration-sensitive, so the
argument against keying a route on resolvability alone is one weaker.

### Corpus movement since the filing — two sentences that narrow, neither settles

1. **`docs/spec_topics/type-system.md:48`** now ends: *"The `for` iterand's
   `array<T>` precondition and `join`'s element precondition are not on the
   check-site list above, are not compatibility checks and are outside this
   paragraph, and take their own dispositions."* Landed by
   [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) (fixed,
   0.185.0). This **ratifies Reading A's point 2 in the corpus** — the report's
   scoping argument is now a spec sentence rather than a reading — and it kills
   Reading B's point 3 as a *letter* argument. It settles nothing else: "take
   their own dispositions" names no disposition. 0144's own fix record states
   the boundary in terms (§*Coordination*, agreement 1): *"0127 stays open and
   its subject is not fixed … this record decides nothing about them … 0127 is
   the wider question — whether a non-`⊑` precondition gate owes the same
   deferral — and remains entirely open."*
2. **`docs/spec_topics/expressions.md:222`** now states the no-context empty
   literal's disposition: *"it types as `array<unknown>` and draws no
   diagnostic; consumers of that element defer under Type System — Type
   compatibility (Unresolvable operands)."* Landed by
   [0195](./0195-control-flow-empty-array-iterand-claim-false.md). Read against
   sentence 1 this is consistent but uncomfortable: `join`'s element
   precondition is expressly outside *Unresolvable operands*, so it is not one
   of the deferring consumers, and row S5 (`[].join(",")` refusing) is
   admissible. 0195's own record reaches the same conclusion — *"Bug 0127's
   fifth spelling … 0127 is owed no note."* Any route (a) landing must
   nonetheless reconcile these two sentences explicitly, because a reader
   arriving at `expressions.md:222` is pointed at a paragraph that disclaims the
   site.

Also adjacent: [0179](./0179-array-sink-refuses-unresolvable-value-type.md) is
now **fixed (0.104.0)** and its record leaves *"the must-agree-with-0127 clause
… open"*. Three landed fixes have now deliberately routed around this
adjudication rather than making it.

### Citation drift (record only — §Affected and §Provenance are NOT rewritten)

Every cited construct still exists; the line numbers moved. Symbol-form map at
this HEAD: `checkArrayJoin` is `src/runtime/stdlib-array.ts:100` (unmoved;
predicate `:107–109`, emission `:115–123`), its `displayType` import
`src/runtime/stdlib-array.ts:26` (unmoved), the runtime `join` case
`src/runtime/stdlib-array.ts:67`; `checkMethodCall`'s join branch is
`src/parser/type-layer-checks.ts:3411–3462` (was `:1417–1459`) — receiver unfold
`src/parser/type-layer-checks.ts:3421`, receiver test
`src/parser/type-layer-checks.ts:3422`, element comment
`src/parser/type-layer-checks.ts:3423–3437`, `checkArrayJoin` call
`src/parser/type-layer-checks.ts:3441`, receiver-defer comment
`src/parser/type-layer-checks.ts:3449–3451`, the `"unknown"` return
`src/parser/type-layer-checks.ts:3453`, the raw render
`src/parser/type-layer-checks.ts:3461`; `classifyReceiver` is
`src/parser/type-layer-checks.ts:206` (was `:166`); `collectTypeEnv` is
`src/parser/type-layer-checks.ts:400` (was `:302`); the `checkArrayJoin` import
is `src/parser/type-layer-checks.ts:100` (was `:90`); `resolveNamed` is
`src/parser/type-compat.ts:146` (was `:104`), `unfoldAlias`
`src/parser/type-compat.ts:226` (was `:155`), `decide`'s `"unknown"` arms
`src/parser/type-compat.ts:291`, `src/parser/type-compat.ts:318`,
`src/parser/type-compat.ts:352`; `hasLoadParseError` is
`src/extension/production-composition.ts:2360` (was `:2045`),
`parseDiscoveredTheta` `src/extension/production-composition.ts:2394` (was
`:2079`); `expressions.md`'s imported-name constructor deferral is
`docs/spec_topics/expressions.md:216` (was `:214`) and the array-literal rule
`docs/spec_topics/expressions.md:222` (was `:220`);
`code-registry-parse.md`'s `non-string-array-join` row is
`docs/spec_topics/diagnostics/code-registry-parse.md:46` (was `:43`),
`unknown-method` `docs/spec_topics/diagnostics/code-registry-parse.md:70` (was
`:63`), `unresolved-named-type`
`docs/spec_topics/diagnostics/code-registry-parse.md:112` (was `:90`);
`type-system.md`'s TYPE-10 is `docs/spec_topics/type-system.md:54` (was `:52`)
and TYPE-11 `docs/spec_topics/type-system.md:56` (was `:54`);
`docs/reference/diagnostics.md`'s mirror row is `docs/reference/diagnostics.md:92`
(was `:89`). Bug 0089's witness rows are unmoved:
`tests/fn-param-alias-unfolded-at-gates.test.ts:474` (`b11`),
`tests/fn-param-alias-unfolded-at-gates.test.ts:493` (`b12`),
`tests/fn-param-alias-unfolded-at-gates.test.ts:512` (`b13`),
`tests/fn-param-alias-unfolded-at-gates.test.ts:699` (`e1`),
`tests/fn-param-alias-unfolded-at-gates.test.ts:716` (`e2`).

**Two substantive citation corrections.** (i) `unresolved-named-type`'s
registered position list is now **six**, not five:
`docs/spec_topics/diagnostics/code-registry-parse.md:112` adds a `match`
object-pattern head. A `fn`-parameter annotation and a `let` annotation are
still absent, so every §Reproduction row's one-diagnostic outcome and §Why it
matters' spelling-sensitivity finding stand unchanged; only the count in the
prose is stale. (ii)
[0051](./0051-lowercase-named-type-reference-positions-silent.md) is no longer
**open** — it is discharged as superseded (no version), by the `resolveNamed`
case fence above. §Related's characterisation of it as "open, adjacent and not
blocking" is stale in status only; its cited content (that the sentinel was
shadowable) is exactly what row F2 measures as reversed.

### One behavioural addition since the filing, inside the gate

`checkMethodCall` now withholds the element verdict when the element is read out
of a WITHHELD binder — `containsWithheldBinderType(joinElement)` guards the
`checkArrayJoin` call at `src/parser/type-layer-checks.ts:3439–3444` — on the
stated ground that the predicate "refuses every non-`string` element including
an unresolvable one, so it cannot defer on a withheld read by itself". This is a
*withhold*, not a *resolvability* arm: it keys on binder provenance, not on
whether the `TypeEnv` resolves the element. It touches no row above — none of
the twenty-seven inputs reads through a withheld binder — and it decides nothing
here. It does establish precedent that a caller-side pre-test skipping
`checkArrayJoin` is an accepted shape, which is route (a)'s named mechanism
(*"its caller pre-tests resolvability … and skips the call"*), so route (a) is
cheaper to implement than the filing recorded.

### STOP — the route is not adjudicated, and this pass is not entitled to adjudicate it

§Fix is *"Not settled. This report exists to pin the spec disposition first."*
It offers routes (a), (b) and (c), states that they are "not equally cheap and
they are not equally safe", and decides none. Nothing landed since the filing
forces one: sentence 1 above strengthens Reading A's scoping argument without
answering Reading A's or Reading B's substantive question, and the two remaining
live tensions — the imported-element program that TYPE-11 makes legal and this
gate refuses at `E` severity, and the empty-literal pointer at
`docs/spec_topics/expressions.md:222` into a paragraph that disclaims the site —
are exactly the tensions §Expected behaviour records as undecided.

Each route is disqualified from bounded self-adjudication on its own terms:

- **(a)** moves bug 0089's `toEqual` witness rows `b12` and `b13` from a refusal
  to `[]` / `["theta/parse/type-alias-cycle"]`. That is witness-weakening, and
  it lands a carve-out sentence at `docs/spec_topics/expressions.md:108` plus a
  DIAG-2 *Trigger* narrowing at
  `docs/spec_topics/diagnostics/code-registry-parse.md:46`.
- **(b)** makes three measured currently-clean programs refuse (GOV-15's
  governed direction), reverses bug 0089's §Fix constraint, and either widens a
  *Trigger* or mints a registry row.
- **(c)** changes no observable but lands two normative spec sentences that
  ratify the disposition — a spec-meaning change by construction, and one whose
  §Fix text already records that it "owes an answer to Reading B's point 2",
  which no landed sentence supplies.

All three are spec-meaning-changing; (a) is additionally witness-weakening. The
operator question this pass would have asked, stated for the record:

> **Which of routes (a), (b) or (c) governs?** Equivalently: is an element type
> the parser cannot resolve inside "non-string element type"
> (`docs/spec_topics/expressions.md:108` /
> `docs/spec_topics/diagnostics/code-registry-parse.md:46`), given that
> `docs/spec_topics/type-system.md:48` now expressly places `join`'s element
> precondition outside the corpus's one general deferral rule while naming no
> disposition in its place; and if it is, on what ground is the receiver
> position's silence correct?

No code, test or spec file was modified by this pass. `git status --short` lists
this document alone.

## Fix (0.255.0)

Settled by operator ruling, quoted verbatim as the spec authority for this
record:

> **OPERATOR RULING (fifteenth set, ruling 2): 0127 = route (c). The shipped
> two-level asymmetry at join is INTENDED and becomes normative: the element
> precondition JUDGES AND REFUSES provably-unresolvable element types
> (rationale: elements are what join consumes — a provably-broken element list
> is a provable author error even where the receiver as a whole defers), while
> the receiver keeps the general Unresolvable-operands defer rule. Zero
> behaviour change; two normative spec sentences land it; this completes
> type-system.md:48's 'take their own dispositions' clause (bug 0144) by naming
> the disposition, and discharges open bug 0179's must-agree-with-0127 clause
> (append a dated coordination note to 0179's doc saying so, version 0.255.0).
> Routes (a) — defer on elements, weakening 0089's b12/b13 — and (b) — judge
> the receiver, refusing three clean programs — are REJECTED.**

- **What shipped:**
  - `docs/spec_topics/type-system.md` line 48 — the two normative sentences,
    appended IN PLACE to the existing single-line *Unresolvable operands*
    paragraph. Sentence 1 names the element disposition (`join`'s element
    precondition "takes the judging disposition"; an element type the parser
    provably cannot resolve — a `named` no visible declaration defines, as
    distinct from a read whose type is merely withheld — is a non-`string`
    element type and is refused as `theta/parse/non-string-array-join`, with
    the ruling's rationale stated). Sentence 2 names the receiver disposition
    (the receiver is outside that judgement and keeps this paragraph's
    deferring disposition, so the two levels are asymmetric by rule). The
    bug-0144 clause "…and take their own dispositions." is preserved verbatim
    and completed, not displaced.
  - `tests/join-element-unresolvable-disposition.test.ts` — new conformance
    oracle, 23 cells, in the shape of
    `tests/for-empty-array-iterand-adjudication.test.ts`.
  - **Nothing else.** `src/` is byte-untouched, so the fix changes no
    observable — which is route (c)'s defining property.

- **Every page and line touched, enumerated:**
  | File | Position | Change |
  |---|---|---|
  | `docs/spec_topics/type-system.md` | line 48 (the *Unresolvable operands* paragraph) | two sentences appended in place; file still 57 lines, `1 insertion(+), 1 deletion(-)`, **zero line shift** |
  | `tests/join-element-unresolvable-disposition.test.ts` | new file | the witness |
  | `docs/bugs/0127-join-element-gate-does-not-defer-on-unresolvable-element.md` | `Status:` line + this record | the fix record |
  | `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md` | appended coordination note | discharges its must-agree-with-0127 clause |

  Deliberately NOT touched, each with its reason:
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — **no registry cell
    edit, and none is entailed.** `theta/parse/non-string-array-join`'s
    registered *Trigger* ("`arr.join(...)` invoked on an array whose element
    type is not `string`.") is total over element types and already covers the
    refusal the ruling ratifies; `theta/parse/unknown-method`'s *Trigger*
    already scopes the receiver silence. No *Message* moves, so DIAG-4 is not
    engaged, and no *Trigger* moves, so DIAG-2 entails no mirror edit in
    `docs/reference/diagnostics.md`. Cell A4 of the witness pins both
    *Trigger*s byte-exact and reds if a later pass reaches for the registry.
  - `docs/spec_topics/expressions.md` — the `join` member row (line 108) and
    the empty-literal sentence (line 222) are byte-unchanged and pinned by cell
    A5. The reconciliation of line 222's "consumers of that element defer under
    … (*Unresolvable operands*)" with the new refusal is the bug-0144 clause
    already on `docs/spec_topics/type-system.md` line 48: `join`'s element
    precondition is expressly OUTSIDE that paragraph, so `join` is not one of
    the deferring consumers. Behaviourally pinned by witness row E5
    (`[].join(",")` refuses, rendering `array<unknown>`) against row S2
    (`let e: array<string> = []` then `e.join(",")` is silent).
  - `docs/reference/type-system.md` lines 73–75 — the user-facing mirror still
    reads "…and take their own dispositions." That sentence stays TRUE, so no
    divergence is introduced; only the mirror is less complete than the spec.
    Extending it would insert 3–4 wrapped lines at line 75 and shift every
    later line of a page that ten open and fixed bug documents cite by line
    (`docs/reference/type-system.md:76–80`, `:83`, `:90`, `:93–97`, `:111`,
    `:113`, `:115–119`, `:143–158` are all live citations). The shift hazard
    outweighs the completeness gain for a page no gate binds to the spec.
    Recorded as residual 1.
  - `src/parser/type-layer-checks.ts` — the element comment that asserted the
    disposition without a spec anchor is now backed by
    `docs/spec_topics/type-system.md` line 48, but is left byte-unchanged so
    the fix owes no live run. Residual 2.
  - `tests/fn-param-alias-unfolded-at-gates.test.ts` — byte-unchanged
    (`git hash-object` = `git rev-parse HEAD:<path>` =
    `6aa14fe9fe444e08618762143f23abb66cc666d0`), 36/36 green. Rows `b12` and
    `b13` KEEP their refusal values: route (a) is rejected, so no value
    changes. The comment-only restatement was checked for and found **not
    owed**: neither row's comment claims the disposition is unsettled — `b12`
    reads "this disposition is the one the gate already reached and must keep"
    and `b13` reads "fails the `string` test exactly as b12's undeclared name
    does" — both restate the mechanism and assert the shipped disposition,
    which the ruling ratifies. §(C) of the new oracle reads those two blocks'
    bytes and reds if either `toEqual` value moves, which is the same
    protection a rewritten comment would have documented, made testable.

- **The ruling discharged clause by clause:**
  1. *"0127 = route (c)"* — routes (a) and (b) are not taken: no `src/` byte
     moved, no witness value moved, no registry row moved.
  2. *"the element precondition JUDGES AND REFUSES provably-unresolvable
     element types"* — sentence 1, cell A1 (red at the old bytes), and witness
     rows E1–E6 (undeclared name, alias-cycle participant, imported
     `.thetalib` name, `enum` name, unsunk `[]` sentinel, `let`-annotation
     route), each a whole-list `toEqual`.
  3. *"rationale: elements are what join consumes …"* — carried verbatim in
     sense inside sentence 1's `because` clause.
  4. *"while the receiver keeps the general Unresolvable-operands defer rule"*
     — sentence 2, cell A2 (red at the old bytes), and witness rows R1–R4
     (`JOIN("Nope")`, imported `JOIN("E")`, `enum` `JOIN("Color")`, cycle
     `JOIN("A")` → the cycle code alone).
  5. *"Zero behaviour change"* — `git diff --stat -- src/` is empty; all 21
     non-prose cells pass at the OLD bytes as well as the new (the verifier's
     neutralisation run), which is what proves the change is prose-only.
  6. *"two normative spec sentences land it"* — exactly two, on one line of one
     page.
  7. *"completes type-system.md:48's 'take their own dispositions' clause"* —
     cell A3 pins that clause's survival; the new sentences follow it in the
     same paragraph and name the disposition it defers.
  8. *"discharges open bug 0179's must-agree-with-0127 clause"* — dated
     coordination note appended to
     `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md`, version
     `0.255.0`. That document's `Status:` is untouched.
  9. *"Routes (a) and (b) are REJECTED"* — §(C) of the oracle reds if route (a)
     is ever taken (it asserts bug 0089's `b12`/`b13` `toEqual` refusal
     expectations are still in that file's bytes); §(B) rows R1–R4 red if route
     (b) is ever taken.

- **Gates** (all re-run by the orchestrator, not taken on report):
  - Witness, at the OLD bytes: 2 failed and 21 passed of 23 — A1 and A2 red,
    each naming `docs/spec_topics/type-system.md` and quoting the missing
    sentence. At the new bytes: 23 passed of 23.
  - Full default suite: `npm test` → 427 test files passed of 427, 9063 tests
    passed of 9063, 0 failed.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean, no output.
  - `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) —
    clean, no output.
  - `tests/citation-symbol-form-gate.test.ts` — 3 of 3 green; the pinned
    residual of 415 unattributable bare-`:NN` continuations did not rise.
  - `wc -l docs/spec_topics/type-system.md` → 57, unchanged.
  - **Live: none owed, none run.** `src/` is byte-untouched. The live lock was
    never acquired and no foreign lock was touched.

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) returned **clean, no
  findings**, having re-derived the two sentences against
  `containsWithheldBinderType` and the `checkArrayJoin` guard in
  `src/parser/type-layer-checks.ts`, `classifyReceiver`'s `"unknown"` arm, and
  `checkArrayJoin`'s two-shape allow-list in `src/runtime/stdlib-array.ts`;
  confirmed the `docs/spec_topics/expressions.md` line 222 reconciliation;
  confirmed every §(B) row is a whole-list `toEqual` with messages sourced from
  the registry *Message* column per DIAG-4; and confirmed the fail-loud
  preconditions (missing corpus file, missing registry row, missing paragraph,
  missing `it(` block each throw naming the unmet precondition — no skips).

- **Verification:** verdict **SOLID**, all four obligations discharged.
  (1) The witness genuinely reds: the verifier wrote the HEAD bytes of
  `docs/spec_topics/type-system.md` back by plain file write (never
  `git checkout`, never `git restore`), hash-verified
  `8cfc310cf74627be2697c81b59dbd707c07cd1b6` against
  `git rev-parse HEAD:<path>`, ran RED (2 failed, 21 passed), restored the
  fixed bytes and hash-verified `e46c79d18c086e267f39f5cb261c828374dd16c3`,
  then ran GREEN (23 of 23). It also stated which cells red under each rejected
  route, so the pins are not vacuous. (2) Full suite 427 of 427 files, 9063 of
  9063 tests. (3) No live owed — `git diff --stat -- src/` empty,
  `git status --short` names no `src/` path; none run, no lock touched.
  (4) Typecheck and lint clean.

- **Residuals:**
  1. `docs/reference/type-system.md` lines 73–75 still say `join`'s element
     precondition "takes its own disposition" without naming it. Not false,
     only incomplete. Deferred on the line-shift hazard evidenced above (eight
     distinct line-cited ranges into that page below line 75). A future pass
     that rewraps that page can carry the mirror sentence in the same commit.
  2. `src/parser/type-layer-checks.ts`'s element comment still asserts the
     disposition citing TYPE-10 rather than the new sentence. Left untouched to
     keep `src/` byte-clean and the fix live-free; the assertion it makes is now
     corpus-backed, so the comment is under-cited rather than wrong.
  3. `theta/parse/unresolved-named-type`'s registered position list still
     excludes a `fn`-parameter annotation and a `let` annotation, so an author
     hitting these rows is told the element is not `string` and is not told the
     name resolves to nothing. That is the third question §Expected behaviour
     records; it belongs to bug 0028's position list, not to this adjudication,
     and route (c) does not decide it.
  4. §Affected and §Provenance above still carry the line numbers measured at
     `552b4ace`. The full symbol-form remap is in the *Citation drift* section
     of the re-derivation note above; the body was deliberately not rewritten.
  5. Lane protocol: no `package.json` bump, no `CHANGELOG.md` entry, no
     `docs/bugs/README.md` index edit, and no commit were made by this pass.
     The version placeholder `0.255.0` above and in the 0179 note is literal and
     is resolved by the integrating pass.

- **Discharge notes appended:**
  `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md` — dated
  coordination note discharging its must-agree-with-0127 clause.

- **Pinned dispositions / non-goals:** the synthesised `named "unknown"`
  sentinel is **in** the refused class explicitly (sentence 1's "a `named` that
  no visible declaration defines" reaches it, and the `resolveNamed`
  uppercase-first fence makes it unresolvable by construction — see the
  re-derivation note's row F2). An alias-cycle participant is likewise **in**,
  and its aggregated list stays
  `["theta/parse/type-alias-cycle","theta/parse/non-string-array-join"]` (row
  E2). A read whose type is merely WITHHELD is **out**, matching the
  `containsWithheldBinderType` guard. The receiver-level pair bug 0089 pinned
  is unmoved. The iterand gate keeps its own disposition — the bug-0144 clause
  names it alongside `join`'s element precondition, and this ruling names only
  the latter.

### Coordination note — bug 0262's reference-position widening (2026-08-24)

Bug [0262](./0262-unresolved-named-type-silent-at-nine-reference-positions.md)
emits `theta/parse/unresolved-named-type` at the `let` annotation, the `fn`
parameter type, the `fn` return type and the `invoke<T>` ascription. Three
oracle cells of this report's witness and its §(C) byte-pin move.

**What changed in `tests/join-element-unresolvable-disposition.test.ts`.** The
three cells are rows of the `ROWS` table, run by §(B) as `B/<id>`:

- `B/E1` (row `id: "E1"`, line 312 of that file), source
  `fn f(xs: array<Nope>): string { xs.join(",") }`. Old codes:
  `[JOIN_CODE]`. New codes, at line 331 of that file:
  `["theta/parse/unresolved-named-type", JOIN_CODE]`, with
  `JOIN_CODE = "theta/parse/non-string-array-join"`. The row's `element: "Nope"`
  is unchanged, so §(B)'s DIAG-4 message check still reads
  `array.join requires a string element type; got array<Nope>` off the join
  refusal.
- `B/E6` (row `id: "E6"`, line 368), source
  `let e: array<Nope> = []` + `e.join(",")`. Old codes: `[JOIN_CODE]`. New, at
  line 380: `["theta/parse/unresolved-named-type", JOIN_CODE]`, `element:
  "Nope"` unchanged. E1 and E6 now carry the identical two-code pattern, which
  is what that pair exists to compare.
- `B/R1` (row `id: "R1"`, line 387), source
  `fn f(xs: Nope): string { xs.join(",") }`. Old codes: `[]`. New, at line 407:
  `["theta/parse/unresolved-named-type"]` — one code, and it is not
  `theta/parse/non-string-array-join`.

Rows `E2`–`E5`, `R2`–`R4`, `S1`, `S2`, `T1`, `T2` and `D1` are byte-identical to
HEAD.

**Why.** The operator ruling (sixteenth set), clause (i), names these cells:

> subject-adjacent cells — 0130's let-silence row, 0045's invoke<T>
> no-name-walk control, 0127's three oracle cells, 0089's b12/b13 … — FLIP
> old→new under this ruling, each with a dated coordination note appended to the
> owning bug doc

and states the ground as a generalisation of this report's own ruling:

> This generalizes the 0127 ruling's own distinction — a provably-unresolvable
> WRITTEN name is a provable author error and is judged at the position it is
> written; a type merely withheld / past the parser's static view keeps the
> deferring disposition everywhere it holds today.

**This report's disposition is subsumed, not reversed.** The subject is the
element/receiver asymmetry at `array.join`: the element test judges and refuses
an element type the parser provably cannot resolve, the receiver test defers on
an unresolvable `named` receiver. Both hold, measured. At `B/E1` and `B/E6` the
join gate still runs and still refuses the element on its own terms — the join
code is the second member of each new pair, not a replacement. At `B/R1` the
join gate still never runs — no `theta/parse/non-string-array-join` appears —
so the receiver deferral is intact; the single new code comes from the `fn`
parameter capture, upstream of any `join`-specific gate. The widening changes the
INPUT CLASS reaching this report's gate, by refusing the written head at the
position it is written; it moves neither this report's Trigger nor its verdict.

**§(C)'s pin was rewritten, and remains a tripwire.** §(C)
(`describe("bug 0127 (C) …")`, line 572 of
`tests/join-element-unresolvable-disposition.test.ts`) reads bug
[0089](./0089-fn-param-alias-not-unfolded-iterand-join.md)'s witness file bytes
and asserts that its `b12` block still carries a literal expectation string.
That string was rewritten, at line 576 of
`tests/join-element-unresolvable-disposition.test.ts`, from
`.toEqual(["theta/parse/non-string-array-join"]);` to
`.toEqual(["theta/parse/unresolved-named-type", "theta/parse/non-string-array-join"]);`
— bug 0089's new `b12` bytes — under the ruling's instruction that the two files
"flip … coherently together". The pin still discriminates route (a): route (a)
would delete `theta/parse/non-string-array-join` from that expectation, and that
code is still one of the bytes the pin demands, so a route that defers on an
unresolvable element still reds here. `b13`'s pinned string
(`.toEqual(["theta/parse/type-alias-cycle", "theta/parse/non-string-array-join"]);`,
line 581) is byte-identical to HEAD.

**The corpus sentence carries a dated requalification.** The same change-set
appends a blockquote to `docs/spec_topics/type-system.md`, at line 52 of that
file: `> **Requalification (2026-08-24, v0.266.0).**` — the version resolved
at the merge pass. It states that the element-judging sentence is
subsumed, not reversed, by bug 0262's widening; that a `named` element type the
author WROTE at one of the ten reference positions and that resolves to no
visible declaration is refused upstream before reaching the element check; that
the input class named by the sentence is unreachable through those routes rather
than judged differently by them; that an element type reached past the parser's
static view still reaches the element check and keeps the judging disposition;
and that the receiver clause and the rest of the paragraph are unaffected. The
element-judging sentence and the receiver clause themselves are byte-verbatim
against HEAD inside the *Unresolvable operands* paragraph, which now sits at line
50 of that file, one sentence having been inserted above it at line 48.

**Measured.** `npx vitest run
tests/join-element-unresolvable-disposition.test.ts` at the current tree: 23 of
23 cells pass. Status unchanged (**fixed (0.255.0)**).
