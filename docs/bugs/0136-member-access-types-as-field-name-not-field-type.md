# Bug 0136 — `#typeExpr`'s `case "member"` (`static-type-inference.ts:242–244`) types every member access as `{ kind: "named", name: node.field }` — the field's *name*, not its declared type — so eight registered `E`-severity checks stop firing on `p.field` for a schema-typed `p` while a ninth, `theta/parse/non-array-iterand`, refuses the spec-legal `for y in p.xs` outright; the same arm types `Enum.Variant` as the *variant* name against `schemas.md:97`'s "statically typed as `Enum`", and any schema whose name matches the fabricated spelling is silently adopted as the expression's type, so the erasure is also a wrong-type

- **Status:** open. §Fix is not settled: three routes are enumerated with their
  consequences and the constraints are pinned, but the disposition — and the
  spec adjudication it rests on — is left to the run. No ordering dependency
  blocks it; the coordination constraints on adjacent open reports are in
  §Fix (f).
- **Sev/Diff estimate:** S1/D3 — eight registered `E`-severity codes are
  unreachable on one of the most common expressions in the language while the
  theta registers and reaches the runtime (measured: `theta/runtime/internal-error`,
  `array<integer>.join(",")` returning `"1,2"`, `1.5` out of an
  `integer`-annotated binding), and the same fabrication refuses a spec-legal
  `for y in p.xs` at `E` severity and silently adopts an unrelated schema's type
  through a collision that needs no ill-cased declaration; D3 because the fix
  must resolve the receiver's declaration rather than change one `kind` test,
  the enum-variant half is a defect against a *written* sentence while the field
  half rests on an indirect one, the absent-field and non-object-receiver
  dispositions each need their own adjudication, GOV-15 is engaged in the
  addition direction, and bug 0125's group (f) tripwires and bug 0089's witness
  must be updated deliberately if touched.
- **Kind:** defect — implementation, against one written sentence and one
  indirect one, plus a spec silence the fix must close. Four elements, carrying
  different standing:
  1. **The enum-variant half violates a written sentence.**
     `docs/spec_topics/schemas.md:97` states the static type outright: "A
     specific variant is referenced as `Enum.Variant` … The expression evaluates
     to the variant's underlying string value … but **is statically typed as
     `Enum`**." The arm types it as the *variant* name. Measured (§Reproduction
     (c)): with `enum Color { Red }` beside `schema Red = array<integer>` — two
     declarations no diagnostic objects to — `Color.Red.join(",")` draws
     `theta/parse/non-string-array-join`, and the control without `schema Red`
     draws nothing. Enum variant names and schema names share one PascalCase
     namespace (`docs/spec_topics/lexical.md:15`), so this collision needs no
     ill-formed input and the theta it refuses is spec-legal.
  2. **Eight registered checks are unreachable at a position they are written
     for.** `docs/spec_topics/type-system.md:48` states when a parse-time check
     may be skipped: "when either side of a compatibility check is past the
     parser's static view", with two named examples (a binding whose RHS depends
     on an unregistered Pi-tool schema; an `invoke` against a callee that
     produced `theta/load/callee-has-errors`). A read of a declared field on a
     declared object schema is neither: the declared `CompatType` sits in the
     `TypeEnv` the pass is already handed, on the `object-schema` declaration's
     own `fields` record (`src/parser/type-compat.ts:82–87`,
     `src/parser/type-layer-checks.ts:458–472`). The deferral is unlicensed by
     `:48`.
  3. **A spec-legal program is refused.** `docs/spec_topics/control-flow.md:13`
     admits `for x in xs` for any `array<T>` iterand. Measured: `for y in p.xs`
     over a field declared `array<string>` draws an `E`-severity
     `theta/parse/non-array-iterand`, and an `E`-severity `theta/parse/*` denies
     registration (`hasLoadParseError`,
     `src/extension/production-composition.ts:2045`). Its message renders the
     *field identifier* in a `<type>` position (`got xs`), which
     `docs/spec_topics/diagnostics/placeholder-rendering-a.md:13–21` does not
     admit — its rule enumerates primitives, literals, unions, arrays, named
     schemas / enums / aliases, `Result`, and inline object types, and a field
     name is none of them.
  4. **No sentence states the static result type of `obj.field` directly.**
     `docs/spec_topics/expressions.md:9`'s *Member access* bullet states runtime
     panics only. The neighbouring *Indexed access* bullet (`:10`) states the
     object-index result type and closes with the clause that forecloses the
     fabricated reading — "an author wanting the per-field declared type uses
     member access (`obj.fieldName`)" — but that clause's subject is `obj[k]`,
     not `obj.field`. `docs/reference/grammar.md:337` lists "member access `a.b`"
     among the supported forms and states no result type;
     `docs/reference/type-system.md` mentions neither. **The dotted-member result
     type for the field case is a spec silence**, and pinning it is part of this
     report's deliverable. The enum case (element 1) is not silent.
- **Related:**
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)**, the class. Its §Affected enumerates "the five `#typeExpr`
    arms that mint a `named` type from an author-chosen name", naming "a member
    read's field name" second and citing the same line (`:244` there and here).
    Its row t8 (`schema S { a: number }` + `let s = S { a: 1 }` +
    `let r = s.toString + 1`) drives this exact arm. **It does not own this
    defect and closing it as a duplicate would be wrong.** 0038's subject is the
    *record*: `collectTypeEnv` built the `TypeEnv` as a plain `{}`, so twelve
    `Object.prototype` own property names resolved as declarations, and its fix
    was `Object.create(null)` plus an own-key-guarded `resolveNamed`
    (`type-compat.ts:104–106`) at eight read sites. That closed the
    *prototype-supplied* answers; it left every arm minting a `named` from an
    author-chosen name, because minting the name was not its finding. This
    report's subject is that the name minted at one of those arms is the wrong
    name — the field, not the field's type — and that the `TypeEnv` already
    holds the right answer. The two are disjoint by measurement: 0038's fix is
    in the tree and every row of §Reproduction below is measured after it.
    0038's residual (iii) is a live constraint here: `enum` declarations are
    still absent from the `TypeEnv` (`collectTypeEnv` matches
    `stmt.kind === "schema"` only, `type-layer-checks.ts:314`), which is why
    §Fix (b)'s enum route restores the spec'd type and still defers.
  - [0125](./0125-index-element-narrowing-not-alias-unfolded.md) — **fixed
    (0.76.0)**, the report that fenced this route and the source of the
    measurement. Its fix unfolded the *index*-element derivation one arm below
    this one (`static-type-inference.ts:248–249`). Its §Non-goals declines the
    member route in terms — the `fn`-return rows g2/g3 record the same shape
    ("`#typeExpr`'s `case \"call\"` types a call by its callee name and never
    reads the declared return type") — and its fix record residual 3 states the
    finding this report files, with the concrete control that separates them.
    **This is not 0125's defect**, and the proof is that its concrete control is
    equally silent: `schema L = array<string>` + `schema P { xs: L }` and
    `schema P { xs: array<string> }` both report `[]` on the same body
    (§Reproduction (a)), so the alias is not what is lost. 0125's own witness
    rows d1, d2 and d6 pin the neighbouring object-index silence.
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **fixed
    (0.72.0)**, the alias-unfolding family. Four sites now read an unfolded
    operand (`control-flow.ts:69`, `type-layer-checks.ts:1427`, `:1186`,
    `static-type-inference.ts:275`), and 0125 added the fifth. **This report is
    not a sixth site of that family**: unfolding cannot help when the operand is
    a fabricated name rather than an alias — `unfoldAlias(named "xs", env)`
    returns `named "xs"` unchanged unless a *schema* named `xs` exists, which is
    element 1's collision, not a repair. Its witness
    (`tests/fn-param-alias-unfolded-at-gates.test.ts`, 36 cells) carries the
    tripwire rows a fix here must not move blindly (§Fix (f)).
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the same
    *shape* at a different position, and the closest report. There a plain
    `for`'s loop variable is never written into the type-layer's `bindings` map
    (`type-layer-checks.ts:679–692` makes the scope copy at `:689` and never
    writes to it), so `#typeExpr`'s `ident` arm (`:215`) falls back to
    `{ kind: "named", name: node.name }` — the variable's own identifier. The
    three consequences are the same three measured here: registered `E`-severity
    checks unreachable, a false `theta/parse/non-array-iterand` on a spec-legal
    nested `for`, and silent adoption of an unrelated schema's type when a
    declaration shares the spelling. **The positions are disjoint and neither
    fix reaches the other.** 0126's fix writes one entry into the walk's
    `bindings` map; this one changes what `#typeExpr` returns for a `member`
    node, which no `bindings` entry can supply because a member read is not a
    name. The two compose: measured (§Reproduction (d)), `for y in Color.Red`
    with `schema Red = array<string>` reports `[]` — this defect admits the
    iterand and 0126 then loses the loop variable, so `y.frobnicate()` is silent
    for a second, independent reason. A fix to either alone leaves that row
    silent. 0126's §Expected behaviour proposes the disposition this report's
    §Fix (a) route 1 mirrors — derive the type from the declaration rather than
    from the identifier — and its §Fix records the same GOV-15 posture, the same
    `placeholder-rendering-a.md` render obligation and the same schema-name
    collision question, so the two adjudications should agree.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, the
    third position with the same shape. There `parseType` folds trailing
    punctuation into the annotation text, `annotationToCompatType`'s fallback
    (`type-layer-checks.ts:503`) maps it to `{ kind: "named", name: text }`, and
    "seven registered type-layer codes stop firing while
    `theta/parse/non-array-iterand` fires falsely with the junk text rendered
    into its message". Disjoint cause (an annotation the lexer mis-captures
    against an expression arm that fabricates), identical downstream mechanism.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, and [0084](./0084-increment-decrement-check-dead.md) — **fixed
    (0.71.0)**. The "registered row, unreachable input" precedents. In both, a
    registered `E`-severity row's *Trigger* is accurate and no input reaches the
    emitter; 0084 shipped the wire-the-caller disposition. Eight rows are in that
    state here for the member-read input class, and unlike those two the emitters
    are live for every other spelling of the same operand.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**. It
    null-prototyped `collectSchemaFields` (`type-layer-checks.ts:458–472`) and
    own-key-guarded its lookup at `:994`. That record is the exact one a fix here
    reads (`NamedDecl`'s `fields`, `type-compat.ts:82–87`), so the guard is
    already in place and must be reused, not re-derived. 0031's GOV-15 posture is
    one of the three precedents §Fix (e) cites.
  - [0102](./0102-params-default-string-literal-raw-newline-admitted.md) —
    **fixed**. The third GOV-15 precedent: a fix that makes currently-clean
    programs refuse, discharged through a committed-corpus sweep and a real H9a
    run rather than by assumption.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
    and binding on §Fix (e). `tests/committed-fixture-parse-gate.test.ts` filters
    `.theta` only and cannot witness either committed `.thetalib`. One of the two
    it cannot see, `docs/examples/personas.thetalib`, holds the single committed
    member read whose receiver is an object schema declared in the same file
    (§Reproduction (g)) — the corpus's only GOV-15-reachable site.
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md) —
    **open**, the `join` element gate. Its subject is what `checkArrayJoin` does
    with an *unresolvable element*; here the whole receiver is unresolvable, so
    the guard at `type-layer-checks.ts:1428` is never entered and `checkArrayJoin`
    is never called. Disjoint; a fix here makes `checkArrayJoin` reachable from a
    new input class (a member read that now narrows to `array<T>`), which is the
    gate firing on a *resolvable* element and inside its registered trigger.
- **Affected** (every citation verified at HEAD `7c8833cd`, 0.76.0):
  - **The defect site** — `src/parser/static-type-inference.ts:242–244`, the
    `case "member"` arm of `#typeExpr` (declared `:197`):

    ```ts
      case "member":
        // A field / enum-variant access: nominal reference to the field name.
        return { kind: "named", name: node.field };
    ```

    Three lines, no `env` read, no receiver read. `env` is a parameter of
    `#typeExpr` (`:199`) and is threaded to every recursive call, so the
    environment is in scope: the gap is that the arm never consults it.
  - **The comment states the conflation.** `:243` names both cases — "A field /
    enum-variant access" — and returns one value for both. `node.field` is the
    field name in the first case and the *variant* name in the second, and
    neither is a type.
  - **The module header records the intended posture, which this arm does not
    satisfy.** `static-type-inference.ts:20–24`: "nodes whose static type is not
    resolvable past the parser's static view (identifiers, member / index / call
    results, `Ok`/`Err`) are assigned a `named` reference type — the same shape
    the `⊑` engine treats as `\"unknown\"` and defers to the runtime AJV safety
    net." A member read of a declared field on a declared object schema **is**
    resolvable, and the value returned is not inert: it is a lookupable name.
  - **The reach of that one line — the whole-program pass and every type-layer
    check.** `static-type-inference.ts:182–188` is the public
    `typeOf(node, env, bindings)` seam, which is `#typeExpr` verbatim (`:187`);
    `:94` is the recording walk. `src/parser/type-layer-checks.ts:573–575`
    delegates the checker-side `typeOf` to it. Every check that asks for the type
    of a member access — or of a `let` binding, condition, operand, iterand or
    receiver whose expression is one — reads `:244`'s answer.
  - **The answer the `TypeEnv` already holds.** `NamedDecl`'s `object-schema`
    variant carries `fields?: Readonly<Record<string, CompatType>>`
    (`src/parser/type-compat.ts:82–87`); `collectTypeEnv` writes it at
    `src/parser/type-layer-checks.ts:323–326` from `collectSchemaFields`
    (`:458–472`, null-prototyped per bug 0031, mapping each field's
    `typeSource` through `annotationToCompatType`); `declaredFieldsOf`
    (`:1008–1016`) is the type-layer's existing own-key-guarded reader, through
    `resolveNamed` (`type-compat.ts:104–106`). The declared field type is one
    guarded lookup from the arm.
  - **The eight erased consumers**, each measured in §Reproduction (b) with a
    control that fires on the same body:
    - `checkMemberAccess` (`type-layer-checks.ts:1468–1481`) — classifies the
      receiver at `:1473` and returns early on `"unknown"` (`:1474–1478`);
      `pushUnknownMethod` at `:1485–1496`.
    - `checkMethodCall` (`:1417–1458`) — the `join` guard at `:1427–1428`
      requires `unfoldedTarget.kind === "array"`; the A2 allow-list classifies
      at `:1448` and returns early on `"unknown"` (`:1449–1451`).
    - `checkIndex` (`:1391`) through `classifyIndexReceiver`
      (`type-compat.ts:366`) and `checkIndexReceiver`
      (`src/runtime/expression-evaluator.ts:615`).
    - `checkPlusOperands` (`type-layer-checks.ts:1505`) through
      `classifyOperand` (`:127`).
    - `checkLetRhsCompat` (`type-compat.ts:387`) and its `integer-narrowing`
      arm, through `checkCompatible` (`:144`), which answers `"unknown"` for an
      unresolvable operand.
    - The condition check and the array-literal element sink, reached from the
      same `typeOf` seam.
  - **`classifyReceiver`** — `type-layer-checks.ts:166–188`. Its `named` arm
    (`:178–187`) resolves through `resolveNamed` and returns `"unknown"` when
    the name is absent (`:180–182`). `named "xs"` is absent, so every A2 gate
    defers. The same function answers `"object"` for an object-schema `named`,
    which is why an object-schema-typed field also defers (§Reproduction (e)).
  - **The one consumer that does not defer, and therefore reports falsely** —
    `checkForIterand`, `src/parser/control-flow.ts:64–81`. It unfolds at `:69`
    and admits only `kind === "array"` (`:70`); anything else, resolvable or
    not, emits (`:74–80`) with `got ${displayType(type)}` at `:79`. A fabricated
    `named` is not an array, so a legal iterand is refused. `walkStmt`'s
    `case "for"` calls it at `type-layer-checks.ts:680–684`; `walkExpr`'s
    `case "par-for"` gate is the same shape.
  - **The render** — `displayType`, `src/parser/type-compat.ts:318–333`:
    `case "named"` returns `type.name` verbatim (`:324–325`). That is how the
    field identifier `xs` and the variant identifier `Red` reach a DIAG-4
    *Message*.
  - **`unfoldAlias`** — `src/parser/type-compat.ts:147–172`, exported at `:155`.
    Its header comment states the two bounds a fix inherits: an object-schema
    `named` stays nominal (TYPE-10) and an unresolvable `named` stays `named`
    "so the relation reports `\"unknown\"` and the runtime AJV safety net
    applies". The walk terminates because `collectTypeEnv` omits a
    cycle-participating declaration (`:157–163`).
  - **The routes into the arm, all measured equivalent** (§Reproduction (e), (f)):
    an object-schema-typed `fn` parameter (`walkFn`'s record,
    `type-layer-checks.ts:739`); a `let` bound to a constructor call; a `let`
    with an object-schema annotation (`walkStmt`'s `let` arm, `:642`, bug 0083's
    record); an alias of an object schema; and a nested member read. Every one
    reaches `named <fieldname>`.
  - **The registration consequence, in both directions.**
    `src/extension/production-composition.ts:2045` (`hasLoadParseError`) drops
    any theta carrying an `error`-severity `theta/load/*` or `theta/parse/*`
    diagnostic. All eight erased codes are `E`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:24`, `:34`, `:36`,
    `:38`, `:40`, `:43`, `:54`, `:63`), so an illegal theta registers; the falsely
    emitted `theta/parse/non-array-iterand` (`:64`) is `E` too, so a legal one
    does not.
  - **The runtime it registers into.** `src/runtime/stdlib-string.ts:105` — the
    `evaluateStringMember` dispatcher's `default` arm throws a plain `Error`;
    `src/runtime/runtime-panics.ts:496` (`surfaceUnexpectedThrow`) maps it onto
    `docs/spec_topics/errors-and-results/error-model.md:74`'s
    `theta/runtime/internal-error`. Measured in §Reproduction (h1).
    `src/runtime/stdlib-array.ts:100` — `checkArrayJoin`, the parse-time
    precondition `join`'s implementation asserts and this defect removes (h2).
  - **The absent-field bound, which is spec'd and must not move.**
    `src/runtime/runtime-panics.ts:221` (`assertKeyPresent`) and `:331`
    (`evaluateMemberAccess`) implement `docs/spec_topics/expressions.md:9`'s
    `theta/runtime/missing-object-key`. Measured (h5): `p.zzz` on
    `schema P { s: string }` parses clean and panics with that code at runtime,
    which is the specified disposition, not a second defect.
  - `docs/spec_topics/schemas.md:95–97` — *Variant access*, the written sentence
    element 1 measures against. `docs/spec_topics/expressions.md:22` — "Enum
    variant access: `Enum.Variant`" in the supported-forms list.
  - `docs/spec_topics/expressions.md:9` — the *Member access* bullet (runtime
    panics only). `:10` — the *Indexed access* bullet: the object result-type
    sentence, its closing member-access clause, and the array result-type
    sentence bug 0125 added. `:101` — `string` is not indexable. `:108` — the
    `array<T>` `join` row. `:118–119` — `keys()` / `values()`. `:122` —
    "Anything not on this list is `theta/parse/unknown-method` **rather than a
    runtime failure**."
  - `docs/spec_topics/type-system.md:48` — *Unresolvable operands*; `:52` —
    TYPE-10; `:54` — TYPE-11.
  - `docs/spec_topics/lexical.md:15` — the first-letter case rule: PascalCase for
    "`schema` names, `enum` names, `enum` variant names", lowercase-first for
    "schema field names". This is what bounds the field-name collision and what
    leaves the variant-name collision unbounded.
  - `docs/spec_topics/control-flow.md:13` — the `for` iterand contract.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — every row cited, all
    `E`: `:24` (`integer-narrowing`), `:34` (`non-boolean-condition`), `:36`
    (`mixed-plus-operands`), `:38` (`non-indexable-receiver`), `:40`
    (`array-element-type-mismatch`), `:43` (`non-string-array-join`), `:54`
    (`let-rhs-type-mismatch`), `:63` (`unknown-method`), `:64`
    (`non-array-iterand`), `:89` (`unknown-variant`, the one variant-position
    check that does work), `:20` (`schema-case-mismatch`).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:71` — DIAG-1; `:72` —
    DIAG-2; `:74` — DIAG-4.
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:13–21` — the
    `<type>` placeholder rule; `:19` renders named schemas, enums and aliases
    "by their theta-side identifier".
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9` —
    the loads-cleanly predicate; `:25` — the diagnostic-registry carve-out.
  - `docs/reference/grammar.md:337–341` — the user-facing mirror of the
    expression forms; `:337` names member access and states no result type;
    `:339` carries bug 0125's array-index clause. `:538` — "member access other
    than `Enum.Variant`" in the literal-sublanguage exclusion list.
  - **Test coverage of this defect: none.** No committed test drives a member
    read in any checked position. `rg -n 'for [a-z]+ in [a-z]+\.[a-z]' tests/
    src/ docs/` returns three hits, all prose (`tests/ctor-declaration-order.test.ts:451`
    is a comment; the other two are bug documents). No test asserts the
    `got <fieldname>` render. Bug 0125's 51-row witness
    (`tests/index-element-alias-unfolded.test.ts`) reaches the member arm only
    through its rows d1/d2/d6, which drive the *object-index* spelling and
    assert its silence. Bug 0089's 36-cell witness reaches it not at all.
- **Observed at:** `0.76.0` (HEAD `7c8833cd`). Offline, deterministic; no live
  model, no provider. Parse rows through the production `parseThetaDocument` over
  the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`); runtime rows
  through `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, the harness shape
  `tests/non-object-receiver-gate.test.ts:221–292` establishes, with a throw
  framed through `surfaceUnexpectedThrow`. One scratch vitest file under a
  gitignored directory, run on the outputs quoted below, then deleted. `src/`,
  `tests/`, `docs/bugs/README.md` and every other bug document are unmodified by
  this filing.

## Summary

`#typeExpr` assigns a static type to every expression node. Its `case "member"`
arm returns `{ kind: "named", name: node.field }` — a nominal type spelled with
the *field identifier*. For `p.xs` where `p: P` and `schema P { xs: array<string> }`,
the static type of the expression is `named "xs"`, not `array<string>`.

The declared answer is one guarded lookup away. `collectTypeEnv` records every
object schema's field-type record on its `NamedDecl`
(`type-layer-checks.ts:323–326`, `type-compat.ts:82–87`), the type layer already
reads it through `declaredFieldsOf` (`:1008–1016`) for the constructor-field
check, and `env` is a parameter of `#typeExpr`. The arm consults neither.

`named "xs"` resolves to no declaration, so every consumer that classifies a
`named` through the `TypeEnv` answers `"unknown"` and defers — the correct
posture for an operand genuinely past the parser's static view
(`type-system.md:48`) and the wrong one here. Measured against a directly-typed
control on the same body, **eight registered `E`-severity codes stop firing**:
`unknown-method`, `mixed-plus-operands`, `non-indexable-receiver`,
`integer-narrowing`, `non-string-array-join`, `let-rhs-type-mismatch`,
`non-boolean-condition`, `array-element-type-mismatch`. The theta registers
(`hasLoadParseError` has nothing to act on) and reaches the runtime: measured,
`p.s.frobnicate()` aborts with `theta/runtime/internal-error: internal error:
unknown string stdlib member: frobnicate`, `p.xs.join(",")` on an
`array<integer>` field returns `"1,2"` by JS coercion, and a `number` field
delivers `1.5` out of an `integer`-annotated binding.

**One consumer does not defer, and refuses instead.** `checkForIterand`
(`control-flow.ts:64–81`) admits only `kind === "array"`, so a fabricated name
is rejected: `for y in p.xs` over a field declared `array<string>` draws
`theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got xs`,
`E`-severity, registration denied, where the identical loop over a directly
typed binding is silent. `par for` behaves the same. The message renders a field
identifier in a `<type>` placeholder, which `placeholder-rendering-a.md:13–21`
does not admit.

**The fabricated name is lookupable, so the erasure is also a wrong-type.**
`unfoldAlias`, `classifyReceiver` and `decide` all resolve a `named` against the
`TypeEnv`, so a *declaration whose name matches the fabricated spelling* is
adopted as the expression's type. For a field the collision needs
`schema xs = …`, which draws `theta/parse/schema-case-mismatch` (`E`) and denies
registration — bounded, like bug 0125's `named "index"` collision. For an
**enum variant** it is not bounded: `lexical.md:15` puts enum variant names and
schema names in one PascalCase namespace, so `enum Color { Red }` beside
`schema Red = array<integer>` is two well-formed declarations, and measured,
`Color.Red.join(",")` draws `non-string-array-join` where the control draws
nothing, `let m: integer = Color.Red` draws `let-rhs-type-mismatch: … got Red`,
`Color.Red + "x"` draws `mixed-plus-operands: … Red and string`, and
`Color.Red[0]` draws `non-indexable-receiver: … got Red`. All four are `E` and
all four refuse a spec-legal theta. In the other direction the collision
*removes* a correct rejection: `for y in Color.Red` with `schema Red = array<string>`
reports nothing where the control reports `non-array-iterand`.

The enum half is a defect against a written sentence. `schemas.md:97`:
"`Enum.Variant` … is statically typed as `Enum`." The arm types it as the
variant.

## Reproduction

Offline, at `7c8833cd`. Parse rows: the production `parseThetaDocument` through
`parseDoc` (`tests/helpers/e2e-s1.ts:39`), with `---\nmode: prompt\n---\n`
prepended and a trailing `1` supplying the theta's final value. `codes` is the
whole aggregated `diagnostics` code list, unfiltered. Runtime rows: the
production executor harness named in §Observed at.

### (a) The reported shape, and the control that separates it from bug 0125

```
@@ a1  schema L = array<string> / schema P { xs: L } / fn f(p: P) { let y = p.xs[0]  y.frobnicate() }
   codes :: []
@@ a2  schema P { xs: array<string> } / fn f(p: P) { let y = p.xs[0]  y.frobnicate() }   [concrete control]
   codes :: []
@@ a3  fn f(xs: array<string>) { let y = xs[0]  y.frobnicate() }                         [0125 control]
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type string"]
@@ a4  schema P { xs: array<string> } / fn f(p: P) { p.xs[0].frobnicate() }
   codes :: []
```

**a2 is the key row.** The concrete-field control is as silent as the alias one,
so the alias is not what is lost and bug 0125's fix does not reach here — its
own §Non-goals and fix record say so. a3 is that fix working: with the array
reaching the index arm directly, the element narrows and the method gate fires.
a4 shows the loss is not an artifact of the intervening `let`.

### (b) The check inventory on `p.field` — eight codes erased

Each row's member-read case against a directly-typed-binding control carrying the
same operand type in the same position.

```
@@ b1  unknown-method:              schema P { s: string } / fn f(p: P) { p.s.frobnicate() }
   codes :: []
@@ b2  [control]:                   fn f() { let y: string = "a"  y.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type string"]
@@ b3  mixed-plus-operands:         schema P { s: string } / fn f(p: P): string { p.s + 1 }
   codes :: []
@@ b4  [control]:                   fn f(): string { let y: string = "a"  y + 1 }
   codes :: ["theta/parse/mixed-plus-operands"]
   msgs  :: ["'+' has mixed operand types: string and integer"]
@@ b5  non-indexable-receiver:      schema P { s: string } / fn f(p: P) { p.s[0] }
   codes :: []
@@ b6  [control]:                   fn f() { let y: string = "a"  y[0] }
   codes :: ["theta/parse/non-indexable-receiver"]
   msgs  :: ["indexed access requires an array<T> or object receiver; got string"]
@@ b7  integer-narrowing:           schema P { n: number } / fn f(p: P) { let m: integer = p.n  m }
   codes :: []
@@ b8  [control]:                   fn f() { let y: number = 1.5  let m: integer = y  m }
   codes :: ["theta/parse/integer-narrowing"]
   msgs  :: ["cannot narrow number to integer"]
@@ b9  non-string-array-join:       schema P { xs: array<integer> } / fn f(p: P): string { p.xs.join(",") }
   codes :: []
@@ b10 [control]:                   fn f(): string { let y: array<integer> = [1]  y.join(",") }
   codes :: ["theta/parse/non-string-array-join"]
   msgs  :: ["array.join requires a string element type; got array<integer>"]
@@ b11 unknown-method, memberless:  schema P { n: integer } / fn f(p: P) { p.n.nope }
   codes :: []
@@ b12 [control]:                   fn f() { let y: integer = 1  y.nope }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'nope' on type integer"]
@@ b13 let-rhs-type-mismatch:       schema P { s: string } / fn f(p: P) { let m: integer = p.s  m }
   codes :: []
@@ b14 [control]:                   fn f() { let y: string = "a"  let m: integer = y  m }
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 'm' initialiser type mismatch: expected integer, got string"]
@@ b15 non-boolean-condition:       schema P { s: string } / fn f(p: P): integer { if p.s { 1 } else { 2 } }
   codes :: []
@@ b16 [control]:                   fn f(): integer { let y: string = "a"  if y { 1 } else { 2 } }
   codes :: ["theta/parse/non-boolean-condition"]
   msgs  :: ["condition must be boolean; got string"]
@@ b17 array-element-type-mismatch: schema P { s: string } / fn f(p: P) { let xs: array<integer> = [p.s]  xs }
   codes :: []
@@ b18 [control]:                   fn f() { let y: string = "a"  let xs: array<integer> = [y]  xs }
   codes :: ["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]
   msgs  :: ["let binding 'xs' initialiser type mismatch: expected array<integer>, got array<string>",
             "array element type mismatch at index 0: expected integer, got string"]
```

Eight distinct registered codes, every one `E`. Each control establishes the
check is live for the operand type; each member-read row establishes it does not
reach that operand through a field read.

### (c) The ninth code, fired falsely on a spec-legal program

```
@@ c1  schema P { xs: array<string> } / fn f(p: P) { for y in p.xs { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got xs"]
@@ c2  [control]:                   fn f() { let y: array<string> = ["a"]  for z in y { z } }
   codes :: []
@@ c3  schema P { xs: array<string> } / fn f(p: P) { par for y in p.xs { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got xs"]
@@ c4  [control]:                   fn f() { let y: array<string> = ["a"]  par for z in y { z } }
   codes :: []
@@ c5  schema L = array<string> / schema P { xs: L } / fn f(p: P) { for y in p.xs { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got xs"]
@@ c6  schema Q { xs: array<string> } / schema P { q: Q } / fn f(p: P) { for y in p.q.xs { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got xs"]
@@ c7  schema P { xs: array<string> } / let p = P { xs: ["a"] } / for y in p.xs { y }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got xs"]
```

`theta/parse/non-array-iterand` is `E`, so none of c1, c3, c5, c6, c7 registers.
Each is admitted by `control-flow.md:13` — the iterand is declared `array<string>`
in each. The message renders the field identifier `xs` in a `<type>` position.
c7 shows the refusal does not need a `fn` parameter.

The same disposition on a *non*-array field is right by code and wrong by
message:

```
@@ c8  schema P { s: string } / fn f(p: P) { for y in p.s { y } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got s"]
@@ c9  [control]:                   fn f() { let y: string = "a"  for z in y { z } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got string"]
```

### (d) The fabricated name resolves — the erasure is a wrong-type

The lookupable-name half, in both directions. Field names are lowercase-first
and schema names uppercase-first (`lexical.md:15`), so a *field* collision needs
an ill-cased declaration and never registers:

```
@@ d1  schema xs = array<integer> / schema P { xs: string } / fn f(p: P): string { p.xs.join(",") }
   codes :: ["theta/parse/schema-case-mismatch","theta/parse/non-string-array-join"]
   msgs  :: ["schema name must start with an uppercase letter",
             "array.join requires a string element type; got array<integer>"]
@@ d2  [control] no collision:       schema P { xs: string } / fn f(p: P): string { p.xs.join(",") }
   codes :: []
@@ d3  schema xs = string / schema P { xs: integer } / fn f(p: P) { let m: integer = p.xs  m }
   codes :: ["theta/parse/schema-case-mismatch","theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["schema name must start with an uppercase letter",
             "let binding 'm' initialiser type mismatch: expected integer, got xs"]
@@ d4  [control]:                    schema P { xs: integer } / fn f(p: P) { let m: integer = p.xs  m }
   codes :: []
```

**Enum variant names carry no such bound.** `enum Color { Red }` beside
`schema Red = …` is two well-formed declarations — measured, the pair alone
reports nothing:

```
@@ d5  enum Color { Red } / schema Red = array<integer>                          [declarations only]
   codes :: []
@@ d6  enum Color { Red } / schema Red { a: string }                             [declarations only]
   codes :: []
```

and the collision then drives real checks in a theta that has no other defect:

```
@@ d7  enum Color { Red, Green } / schema Red = array<integer> / fn f(): string { Color.Red.join(",") }
   codes :: ["theta/parse/non-string-array-join"]
   msgs  :: ["array.join requires a string element type; got array<integer>"]
@@ d8  [control] no schema Red:      enum Color { Red, Green } / fn f(): string { Color.Red.join(",") }
   codes :: []
@@ d9  enum Color { Red } / schema Red = string / fn f() { let m: integer = Color.Red  m }
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 'm' initialiser type mismatch: expected integer, got Red"]
@@ d10 [control]:                    enum Color { Red } / fn f() { let m: integer = Color.Red  m }
   codes :: []
@@ d11 enum Color { Red } / schema Red = string / fn f() { Color.Red.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type Red"]
@@ d12 [control]:                    enum Color { Red } / fn f() { Color.Red.frobnicate() }
   codes :: []
@@ d13 enum Color { Red } / schema Red { a: string } / fn f() { Color.Red.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type Red"]
@@ d14 enum Color { Red } / schema Red = integer / fn f(): string { Color.Red + "x" }
   codes :: ["theta/parse/mixed-plus-operands"]
   msgs  :: ["'+' has mixed operand types: Red and string"]
@@ d15 [control]:                    enum Color { Red } / fn f(): string { Color.Red + "x" }
   codes :: []
@@ d16 enum Color { Red } / schema Red = string / fn f() { Color.Red[0] }
   codes :: ["theta/parse/non-indexable-receiver"]
   msgs  :: ["indexed access requires an array<T> or object receiver; got Red"]
@@ d17 [control]:                    enum Color { Red } / fn f() { Color.Red[0] }
   codes :: []
```

d7, d9, d11, d13, d14 and d16 are `E`-severity refusals of theta the spec admits.
d13 shows an *object* schema collides too, through `classifyReceiver`'s
`"object"` answer rather than through `unfoldAlias`. The collision also erases a
correct rejection:

```
@@ d18 enum Color { Red } / schema Red = array<string> / fn f() { for y in Color.Red { y.frobnicate() } }
   codes :: []
@@ d19 [control]:                    enum Color { Red } / fn f() { for y in Color.Red { y.frobnicate() } }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got Red"]
```

d18's iterand is an enum variant, which is not an `array<T>`; the unrelated
`schema Red` makes it look like one and the refusal disappears. Its body is
silent for the second, independent reason bug 0126 owns — the plain `for` binds
no loop variable — so `y.frobnicate()` reports nothing either.

The variant-existence checker is unaffected and answers correctly, which locates
the defect in the type arm rather than in variant resolution generally:

```
@@ d20 enum Severity { Low } / let s = Severity.Critical
   codes :: ["theta/parse/unknown-variant"]
   msgs  :: ["unknown variant 'Critical' on enum 'Severity'"]
```

### (e) Every route to a member read behaves identically

```
@@ e1  object-schema field:          schema Q { a: string } / schema P { q: Q } / fn f(p: P) { p.q.frobnicate() }
   codes :: []
@@ e2  [control] object param:       schema Q { a: string } / fn f(q: Q) { q.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type Q"]
@@ e3  nested member:                schema Q { s: string } / schema P { q: Q } / fn f(p: P) { p.q.s.frobnicate() }
   codes :: []
@@ e4  let-bound constructor:        schema P { s: string } / let p = P { s: "a" } / p.s.frobnicate()
   codes :: []
@@ e5  annotated let:                schema P { s: string } / let p: P = P { s: "a" } / p.s.frobnicate()
   codes :: []
@@ e6  alias of an object schema:    schema P { s: string } / schema Q = P / fn f(q: Q) { q.s.frobnicate() }
   codes :: []
@@ e7  object index [0125 non-goal]: schema P { s: string } / fn f(p: P) { let y = p["s"]  y.frobnicate() }
   codes :: []
```

e1 and e3 bound the loss: an object-schema-typed field defers because
`classifyReceiver` answers `"object"` for a resolvable object schema too, so the
observable is the same for a resolvable and an unresolvable answer. e4, e5 and
e6 show bug 0083's `let`-annotation record and TYPE-11 alias transparency both
deliver a usable receiver and the member arm discards it anyway. **e7 is the
neighbouring spelling of the same unmet obligation**: `expressions.md:10` states
the object-index result type and the implementation does not derive it either —
bug 0125's §Non-goals names that as its own report, and `:10`'s closing clause
routes an author wanting the per-field type to the member access this report
measures.

The absent-field case is spec'd and correct:

```
@@ e8  undeclared field:             schema P { s: string } / fn f(p: P) { p.zzz.frobnicate() }
   codes :: []
```

`expressions.md:9` assigns an absent theta-side name a runtime panic, not a parse
diagnostic; h5 below measures the panic. e8's parse silence is that disposition,
not a further defect — and it is the constraint §Fix (c) has to preserve.

### (f) The sibling `named`-mint arms, for contrast

Measured so the class is bounded and the neighbours are separated. These are
**not** this report's site:

```
@@ f1  call result:                  fn g(): array<string> { ["a"] } / for y in g() { y }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got g"]
@@ f2  method-call result:           let s: string = "a,b" / for y in s.split(",") { y }
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got split"]
@@ f3  free identifier:              for y in zzz { y }
   codes :: ["theta/parse/unknown-identifier","theta/parse/non-array-iterand"]
   msgs  :: ["unknown identifier 'zzz'","'for' expects array<T> after 'in'; got zzz"]
```

f1 is `#typeExpr`'s `case "call"` (`:252`), the route bug 0125's g2/g3 measured.
f2 is `case "method-call"` (`:262`); `split` is declared `(sep: string): array<string>`
by `expressions.md`'s stdlib table, and `code-registry-parse.md:64`'s own *Hint*
for the code it draws recommends `s.split(...)` as the remedy for this very
error. f3 is `case "ident"` (`:215`) on a genuinely free name, where the nominal
fallback is the documented posture (`type-system.md:48`) and the second code is
correct. All three are the same shape at different arms of the same switch; each
needs its own receiver-resolution source (`collectFnReturnAnnotations` for f1,
the stdlib signature table for f2) and none is fixed by resolving a field against
a schema. Named here because bounding the class is part of this report's
deliverable; not adjudicated here.

### (g) The committed corpus at HEAD — the GOV-15 baseline

All 34 tracked `.theta` and `.thetalib` files, each through the real
`parseThetaDocument`:

```
@@ every tracked .theta / .thetalib                                      codes :: []
@@ except tests/fixtures/h7b-invalid/malformed.theta   (seeded invalid)
   codes :: ["theta/parse/unsupported-feature","theta/parse/empty-schema-body",
             "theta/parse/schema-case-mismatch","theta/parse/unknown-identifier",
             "theta/parse/unknown-identifier"]
@@ TOTAL FILES :: 34
```

The corpus does contain member reads in checked positions —
`docs/examples/ralph-inline.theta:40` (`if status.done`),
`docs/examples/typed-return.theta:10` (`if s.confidence < 0.5`),
`docs/examples/typed-params-across-boundary.theta:17` (`if summary.word_count > 5000`),
`docs/examples/refine.theta:14` (`if verdict.good_enough`),
`docs/examples/fan-out-reviews.theta:30` (`review.file + ": " + review.summary`),
`docs/examples/handle-error.theta:18` (two interpolations),
`docs/examples/personas.thetalib:8` (three interpolations). Their receivers split
two ways. All but one are call results or `match`-pattern bindings, which are
unresolvable for reasons this report does not touch (§Reproduction (f), bug 0126).
The exception is `personas.thetalib`, whose `fn rate_strictness(a: Author)` reads
three fields off an object schema declared in the same file — the corpus's only
receiver a fix here resolves, and one bug 0132 records the committed-fixture
parse gate cannot see.

Its shape and the other checked shapes measured against their directly-typed
controls, both silent in both spellings:

```
@@ g1  personas shape:  schema Author { name: string, role: string, experience_years: integer }
                        fn rate(a: Author): Result<integer, QueryError> { @<integer>`… ${a.name} … ${a.role} … ${a.experience_years}y …`? }
   codes :: []
@@ g2  [control] three let-annotated locals in the same interpolation
   codes :: []
@@ g3  boolean field in an interpolation / g4 [control]                  codes :: []  /  []
@@ g5  literal-union field in an interpolation / g6 [control]            codes :: []  /  []
@@ g7  schema S { w: integer } / if s.w > 5000  /  g8 [control]          codes :: []  /  []
@@ g9  schema R { f: string, s: string } / r.f + ": " + r.s  /  g10 [control]  codes :: []  /  []
@@ g11 schema P { done: boolean, summary: string } / if p.done { p.summary }  /  g12 [control]  codes :: []  /  []
```

**Measured GOV-15 blast radius against the committed corpus: zero.** Every
checked member read in the corpus is either on a receiver a fix does not resolve,
or in a position whose directly-typed control is equally clean. That does not
discharge GOV-15 — §Reproduction (b)'s programs load cleanly today and would
refuse after a fix — it bounds the *corpus* half of the sweep (§Fix (e)).

### (h) The runtime the registering theta reaches

Same harness, executed. `parse` is the pass's code list; `run` is `executeBody`'s
outcome, or the diagnostic `surfaceUnexpectedThrow` frames a throw as.

```
@@ h1  schema P { s: string } / fn f(p: P) { p.s.frobnicate() } / let z = f(P { s: "a" }) / z
   parse :: []
   run   :: THREW :: theta/runtime/internal-error :: internal error: unknown string stdlib member: frobnicate
            (Error thrown at src/runtime/stdlib-string.ts:105)
@@ h2  schema P { xs: array<integer> } / fn f(p: P): string { p.xs.join(",") } / let z = f(P { xs: [1, 2] }) / z
   parse :: []
   run   :: outcome=success result={"present":true,"value":"1,2"}
@@ h3  schema P { n: number } / fn f(p: P): integer { let m: integer = p.n  m } / let z = f(P { n: 1.5 }) / z
   parse :: []
   run   :: outcome=success result={"present":true,"value":1.5}
@@ h4  [control] legal:  schema P { s: string } / fn f(p: P): string { p.s } / let z = f(P { s: "a" }) / z
   parse :: []
   run   :: outcome=success result={"present":true,"value":"a"}
@@ h5  schema P { s: string } / fn f(p: P) { p.zzz } / let z = f(P { s: "a" }) / z
   parse :: []
   run   :: THREW :: MissingObjectKeyPanic :: theta/runtime/missing-object-key :: missing object key: zzz
```

h1 is the disposition `expressions.md:122` names as the one this input does *not*
get. h2 is the implicit conversion `expressions.md:108` says theta 1.0 does not
perform and which `src/runtime/stdlib-array.ts`'s own comment asserts cannot
reach it. h3 is a `number` delivered out of an `integer`-annotated binding. h4 is
the control that shows the harness executes. h5 is the spec'd panic for an absent
field (`expressions.md:9`), correct and out of scope.

## Expected behaviour

**The enum half has a written answer.** `docs/spec_topics/schemas.md:97`:

> A specific variant is referenced as `Enum.Variant` (e.g., `Severity.High`). The
> expression evaluates to the variant's underlying string value (the explicit
> RHS, or the variant name verbatim when no RHS is given) but is statically typed
> as `Enum`.

`Color.Red` is statically typed `Color`. It is not typed `Red`, and nothing in
the corpus makes a variant's *name* a type at all — `lexical.md:15` admits
variant names into the PascalCase namespace as identifiers, and
`code-registry-parse.md:89` (`theta/parse/unknown-variant`) is the one check that
reads them, correctly (d20). Every row of §Reproduction (d)7–(d)19 is therefore a
defect against a written sentence, in both directions: `Color.Red` acquiring
`array<integer>` from an unrelated `schema Red` is not `Color`, and `Color.Red`
being admitted as an `array<string>` iterand is not `Color` either.

**The field half rests on one indirect sentence and one silence.** No sentence
states the static result type of `obj.field`. `expressions.md:9`'s *Member
access* bullet states runtime panics only. The neighbouring *Indexed access*
bullet (`:10`) states the object-index result type and closes:

> The static result type of `obj[k]` is the union of the receiver's declared
> field types … applied uniformly regardless of the index; an author wanting the
> per-field declared type uses member access (`obj.fieldName`).

That clause makes member access **the** construct that yields the per-field
declared type: it is the alternative the sentence offers to an author who does
not want the union. A reading on which `obj.fieldName`'s static type is a
fabricated name spelled like the field makes the offered alternative deliver
nothing at all, and makes the sentence's contrast between "the union of declared
field types" and "the per-field declared type" a contrast between one type and no
type. `docs/reference/grammar.md:337` lists member access among the supported
forms without a result type; `docs/reference/type-system.md` mentions neither
form.

The silence does not make the measured behaviour admissible, for four reasons
that do not depend on a missing sentence.

1. **The deferral is unlicensed.** `type-system.md:48` skips a check when an
   operand is "past the parser's static view", and names two examples that share
   a property: the information is genuinely absent at parse time. Here it is
   present — `collectTypeEnv` recorded it (`type-layer-checks.ts:323–326`), the
   type layer already reads it for the constructor-field check
   (`declaredFieldsOf`, `:1008–1016`), and `env` is a parameter of the arm that
   discards it. `static-type-inference.ts:20–24` states the fallback's own
   precondition — "nodes whose static type is **not resolvable** past the
   parser's static view" — and a declared field on a declared schema does not
   meet it.
2. **Each erased code sits inside its own registered *Trigger*.** In b1,
   `frobnicate` is a method "accessed on a built-in type that the theta 1.0
   stdlib does not expose" (`code-registry-parse.md:63`) and
   `expressions.md:122` states the disposition without qualification: "Anything
   not on this list is `theta/parse/unknown-method` **rather than a runtime
   failure**." Measured, the parse is clean and the runtime failure is what
   arrives (h1). The same argument runs for `:24`, `:34`, `:36`, `:38`, `:40`,
   `:43` and `:54` against b3–b18.
3. **The falsely emitted code sits outside its own trigger.**
   `theta/parse/non-array-iterand`'s registered *Trigger* (`:64`) is "`for x in
   expr` where `expr` is not `array<T>`". In c1, c3, c5, c6 and c7 the iterand
   *is* `array<string>`, declared. The emission is outside the row, which is the
   same fault bug 0089 prosecuted at its gate 1 and bug 0126 measures at the loop
   variable.
4. **The render is not admissible under any reading.**
   `placeholder-rendering-a.md:13–21` closes the `<type>` category over
   primitives, literals, unions, arrays, named schemas / enums / aliases,
   `Result`, and inline object types. `got xs` and `got s` render a field
   identifier; `lexical.md:15` requires a schema, enum or alias identifier to be
   uppercase-initial, so neither names anything a conformant declaration can be.
   `got Red` is worse: it renders a real identifier that names something other
   than what the message claims.

On the measured inputs, therefore:

- `p.xs` where `p: P` and `schema P { xs: array<string> }` has static type
  `array<string>`, and `p.s` where `s: string` has static type `string`, with
  TYPE-11 applying to the field's declared type as it does everywhere else
  (`type-system.md:54`) — so `schema L = array<string>` + `xs: L` supplies the
  same `array<string>` (a1, c5).
- b1–b18 report the code their control reports, with the control's message.
- c1–c7 report nothing, and the theta registers.
- c8 keeps `theta/parse/non-array-iterand` and its message becomes `got string`,
  matching c9 — `code-registry-parse.md:64`'s `got <type>` template, the same
  message move bug 0089's fix already made at its gate 1.
- `Color.Red` has static type `Color` (`schemas.md:97`), so d7–d19's collisions
  disappear in both directions: no declaration elsewhere in the file can change
  a variant access's type. `Color` itself is absent from the `TypeEnv`
  (`collectTypeEnv` matches `stmt.kind === "schema"` only; bug 0031's recorded
  non-goal, bug 0038 residual (iii)), so it resolves to nothing and the
  expression defers — which is `type-system.md:48`'s posture and is what d8, d10,
  d12, d15, d17 already measure.
- TYPE-10 holds: an object-schema-typed field (e1, e3) keeps its present
  disposition. `classifyReceiver` answers `"object"` for it either way.
- `type-system.md:48` holds where it applies: a receiver that resolves to no
  declaration, an object schema carrying no field record, and a field the schema
  does not declare (e8) all keep deferring, and e8's runtime panic (h5) is
  unchanged — `expressions.md:9` assigns it.
- No new code and no new registry row. Every code restored is registered and each
  is restored to an operand its *Trigger* already covers; the one code that stops
  firing for an input class (`:64` at c1–c7) is firing outside its own trigger
  there today.

## Actual behaviour / root cause

**Three lines decide, and they read neither the receiver nor the environment.**
`src/parser/static-type-inference.ts:242–244`:

```ts
      case "member":
        // A field / enum-variant access: nominal reference to the field name.
        return { kind: "named", name: node.field };
```

The arm ignores `node.target` entirely, so no receiver type is computed and no
`TypeEnv` lookup is attempted. It also ignores the distinction its own comment
draws: for a field access `node.field` is a field name, for an enum access it is
a variant name, and the arm returns the same shape for both.

**The declared type is in scope.** `#typeExpr`'s signature is
`(node, env, bindings)` (`:197–201`) and `env` reaches every other arm.
`collectTypeEnv` (`type-layer-checks.ts:302–330`) writes each object schema as
`{ kind: "object-schema", fields }` (`:323–326`) with `fields` built by
`collectSchemaFields` (`:458–472`), which maps each declared field's
`typeSource` through `annotationToCompatType` — "the same conversion a `let`
annotation gets, so a schema field and a `let` annotation resolve identically".
That record is what makes b1–b18's controls fire: the control's `let` annotation
travels the same conversion the field's declaration already travelled.

**The fabricated value is not inert.** `{ kind: "named", name: "xs" }` is
indistinguishable, to every consumer, from a `NamedType` the author wrote. Three
mechanisms act on it:

1. **`resolveNamed` finds nothing, so the check defers.**
   `classifyReceiver`'s `named` arm (`type-layer-checks.ts:178–187`) returns
   `"unknown"` when the name is absent (`:180–182`), and `checkMemberAccess`
   (`:1474–1478`) and `checkMethodCall` (`:1449–1451`) both return early on it.
   `checkCompatible` answers `"unknown"` for an unresolvable operand, so
   `checkLetRhsCompat` and its `integer-narrowing` arm defer. `classifyOperand`
   and `classifyIndexReceiver` do the same. That is eight codes.
2. **`checkForIterand` does not defer.** `src/parser/control-flow.ts:69–80`
   unfolds and then admits `kind === "array"` alone; anything else emits. An
   unresolvable name is not an array, so a legal iterand is refused. This is the
   one consumer whose contract is "admit exactly this shape" rather than
   "classify, and skip what does not classify", which is why one code moves in
   the opposite direction from the other eight.
3. **`resolveNamed` finds something when a declaration shares the spelling.**
   `unfoldAlias` (`type-compat.ts:155–172`) walks `while (current.kind === "named")`
   and steps to `decl.rhs` for an alias; `classifyReceiver` recurses the same
   way and answers `"object"` for an object schema; `decide` resolves both sides.
   So an unrelated `schema Red = array<integer>` becomes the type of
   `Color.Red`, and `displayType`'s `case "named"` (`:324–325`) then prints the
   collided identifier into the *Message*.

**The two collisions have different bounds, and only one is bounded.**
`lexical.md:15` requires schema names uppercase-first and field names
lowercase-first, so a field-name collision requires an ill-cased declaration:
d1 and d3 both carry `theta/parse/schema-case-mismatch` (`E`) beside the
fabricated result, and neither theta registers. The same rule puts enum **variant**
names in the *same* PascalCase namespace as schema names, and no check objects to
a variant and a schema sharing an identifier — d5 and d6 measure the declaration
pair alone reporting nothing. Every row of d7–d19 is therefore a theta whose only
defect is the one this report files.

**Direction of failure is not uniform.** Eight codes defer (silent, illegal theta
registers), one refuses (loud, legal theta denied), and the collision does both —
d7/d9/d11/d13/d14/d16 add an `E` where none is owed, d18 removes one that is. An
author reading the diagnostics cannot tell the three apart, because in the first
case there are none.

**The theta registers.** `hasLoadParseError`
(`src/extension/production-composition.ts:2045`) drops a theta carrying any
`error`-severity `theta/parse/*` diagnostic. With nothing emitted, nothing is
dropped. Measured (h1), the erased `unknown-method` reappears as a throw from
`evaluateStringMember`'s `default` arm (`src/runtime/stdlib-string.ts:105`), a
plain `Error`, which `surfaceUnexpectedThrow`
(`src/runtime/runtime-panics.ts:496`) frames onto the runtime-defect surface
(`error-model.md:74`) as `theta/runtime/internal-error` with the internal string
in its message. h2 and h3 do not fail at all: the join coerces and the `number`
flows out of an `integer`-annotated binding.

**Every route reaches the arm, so no spelling escapes.** §Reproduction (e)
measures five: an object-schema-typed `fn` parameter (`walkFn`'s record,
`type-layer-checks.ts:739`), a `let` bound to a constructor call, an annotated
`let` (bug 0083's transparent record, `:642`), an alias of an object schema
(TYPE-11), and a nested member read. The first four each deliver a receiver that
resolves; the arm discards it in all four. Bug 0083's closure of the `let` route
and bug 0089's and 0125's unfolding of four `kind` tests are all upstream of a
value this arm never reads.

**Why bug 0125 did not reach it.** 0125's subject was the `kind === "array"` test
one arm below, at `:249`, and its fix unfolds that arm's target. The member arm
is eight `case` labels above in the same switch and byte-unchanged by that diff.
Its §Non-goals fenced the route explicitly for the `fn`-return spelling (g2/g3:
"`#typeExpr`'s `case \"call\"` types a call by its callee name and never reads the
declared return type, so the alias is not what is lost there"), and the same
sentence holds here with `field` for `callee`. Its fix record recorded the
member measurement as residual 3 with the concrete control that proves the
separation. **The fence was correct:** a1 and a2 are both `[]`, so unfolding the
receiver would change nothing.

## Why it matters

- **Eight `E`-severity codes are unreachable on one of the language's most common
  expressions.** Measured §Reproduction (b), each against a control that emits it
  on the same body. Every theta that reads a field off a schema-typed value —
  which is what schemas exist for — loses every static check on the value read.
- **The theta registers and reaches the runtime.** Measured (h1),
  `p.s.frobnicate()` becomes `theta/runtime/internal-error: internal error:
  unknown string stdlib member: frobnicate` — a runtime-defect-surface code
  carrying an internal string, arriving on a session channel rather than at the
  offending source span, and the outcome `expressions.md:122` says this input
  does not get.
- **Two rows do not fail at all — values are corrupted instead.** h2 returns
  `"1,2"` from `array<integer>.join(",")`, the implicit conversion
  `expressions.md:108` says theta 1.0 does not perform. h3 delivers `1.5` from an
  `integer`-annotated binding. Both are silent successes.
- **A spec-legal `for` over an array-typed field is refused.** c1 and c3:
  `E`-severity `theta/parse/non-array-iterand`, registration denied, on a loop
  `control-flow.md:13` admits. Every spelling of the receiver produces it (c5,
  c6, c7). The workaround is to copy the field into a `let` first, i.e. to stop
  reading fields in iterand position.
- **An enum variant silently acquires an unrelated schema's type, in a theta with
  no other defect.** d5/d6 show the declaration pair is clean; d7, d9, d11, d13,
  d14 and d16 show six `E`-severity refusals that the same file without the
  schema does not draw; d18 shows the collision removing a correct refusal. The
  author has written two well-formed declarations and gets a diagnostic about
  neither.
- **`schemas.md:97` is a written sentence the implementation contradicts.** Not a
  silence, not an inference — "`Enum.Variant` … is statically typed as `Enum`".
- **Three user-facing messages name a type that cannot exist.** `got xs`, `got s`
  and `got Red` violate `placeholder-rendering-a.md:13–21`. The first two render
  a lowercase-first field identifier, which `lexical.md:15` forbids as a type
  name; the third renders a real identifier that names something the expression
  is not.
- **The failure is position-dependent, so there is no rule an author can apply.**
  The same `schema P { xs: array<string> }` behaves correctly as a constructor
  target, as a `let` annotation and as a `fn` parameter type; it loses its field
  types only when a field is read. Nothing in the diagnostics distinguishes the
  cases, because in the erasing cases there are none.
- **The corpus's own examples are on the boundary.** Seven committed `.theta`
  files and one `.thetalib` read fields in checked positions
  (§Reproduction (g)); all are clean today, and one — `personas.thetalib` — is
  clean for a reason bug 0132 records no offline test can currently observe.
- **Nothing in the suite scores it.** No committed test drives a member read in
  any checked position, and none asserts the `got <fieldname>` render. Bug
  0125's 51-row witness touches the member arm only through the object-index
  spelling.

## Non-goals

- **The object-index result type.** `expressions.md:10` states it — "the union of
  the receiver's declared field types" — and the implementation does not derive
  it (e7, and bug 0125's rows d1, d2, d6). That is a *specified* obligation
  unmet at a disjoint arm (`static-type-inference.ts:245–250`, whose else arm is
  the `named "index"` sentinel), reached by a disjoint input class, and it is the
  separate report bug 0125's §Non-goals names. The two are adjacent and a fix
  here must not land it by accident (§Fix (d)).
- **The `named "index"` sentinel and its `got index` render.** Bug 0125's §Fix
  (b) kept it deliberately and its fix record residual 1 carries the render leak.
  Unchanged in both directions here.
- **The `call` and `method-call` arms.** §Reproduction (f) measures both:
  `for y in g()` over `fn g(): array<string>` and `for y in s.split(",")` are
  each refused with the callee / method identifier rendered as a type. Same
  shape, different arms, and each needs a different resolution source — the
  declared return annotation (`collectFnReturnAnnotations`,
  `type-layer-checks.ts:343`) for the first, the stdlib signature table for the
  second. Not filed here; recorded so the class stays inventoried.
- **The `ident` arm's nominal fallback for a genuinely free name** (f3). That is
  `type-system.md:48`'s documented posture and is correct. Where it is *not*
  correct — an unbound loop variable — is bug 0126's subject.
- **`enum` declarations being absent from the `TypeEnv`.** `collectTypeEnv`
  matches `stmt.kind === "schema"` only (`type-layer-checks.ts:314`), so an
  `enum`-named annotation is unresolvable at every position. Bug 0031's recorded
  non-goal, restated by bug 0038 residual (iii). A fix here does not need it —
  typing `Color.Red` as `named "Color"` restores `schemas.md:97`'s answer and
  defers, which is what d8/d10/d12/d15/d17 already measure — but it bounds how
  much the enum half can recover, and §Fix (b) states that.
- **The absent-field disposition.** `p.zzz` on a schema that does not declare
  `zzz` parses clean (e8) and panics `theta/runtime/missing-object-key` at
  runtime (h5). `expressions.md:9` assigns that panic, so the parse silence is
  the specified behaviour. Whether the parse *should* also reject a statically
  absent field on a statically known schema is a separate widening at a separate
  position with its own registry question; it is not opened here, and §Fix (c)
  requires a fix to preserve the current disposition.
- **The plain `for` loop variable.** Bug 0126's subject
  (`type-layer-checks.ts:679–692`). Disjoint code, same shape; d18's body is
  silent for that reason as well as this one, and neither fix alone makes it
  report.
- **`walkFn`'s raw parameter record** (`type-layer-checks.ts:739`). Recording the
  declared type is correct, and bug 0089 rejected unfolding there in terms.
  e2 is the proof that the record resolves fine when a consumer resolves it.
- **`theta/runtime/internal-error`'s own behaviour.** h1's framing is correct for
  an unexpected throw (`error-model.md:74`). The defect is that the input reaches
  it.

## Fix

**Not settled.** Three code routes are available, and the choice turns on a spec
adjudication this report asks for rather than makes. Six questions; (a) gates the
corpus and (e) gates the release.

**(a) Which route, and what does the corpus owe?**

1. **Resolve the receiver and return the declared field's type.** In
   `#typeExpr`'s `case "member"`, compute the receiver type
   (`this.#typeExpr(node.target, env, bindings)`), unfold it through the exported
   `unfoldAlias` (`type-compat.ts:155`), and — when the result is a `named` whose
   declaration is an `object-schema` carrying a `fields` record with an own key
   `node.field` — return that field's `CompatType`, itself unfolded so an
   alias-typed field supplies the type it names (a1, c5). Everything else falls
   through to the present fallback. This is the route `expressions.md:10`'s
   closing clause names and the one bug 0126's §Expected behaviour proposes for
   its own position: derive the type from the declaration, not from the
   identifier. It restores all eight codes (b1–b18), removes the false refusals
   (c1–c7), and — with the enum sub-route of (b) — removes the collisions
   (d7–d19). Cost: it makes currently-clean programs refuse, which is (e); and
   it decides three sub-dispositions, (b), (c) and (d).
   **Corpus consequence.** The enum half is a defect against `schemas.md:97` and
   needs no spec edit. The field half is a silence, and disposition (1) here has
   the same two sub-options bug 0125's §Fix (a) faced: **(i)** add the sentence
   to `expressions.md:9`'s *Member access* bullet — the static result type of
   `obj.field` is the receiver's declared type for that field, TYPE-11 applying
   to the field's declared type as elsewhere — with its
   `docs/reference/grammar.md:337` mirror in the same commit; or **(ii)** leave
   the silence and rest on §Expected behaviour's four arguments. Bug 0125 took
   (i) on the ground that the written neighbouring sentence derives a result type
   from the receiver's declared shape, so reading the silence beside it as
   licence for a fabricated type makes the written sentence an exception rather
   than an instance. That ground is stronger here, because the written sentence
   names member access **by name** as the construct that yields the per-field
   declared type. DIAG-2 (`diagnostic-shape.md:72`) is not engaged by either
   sub-option — no code, severity or *Trigger* moves — but the same-commit rule
   for spec edits applies to (i).
2. **Defer explicitly, with a placeholder no declaration can spell.** Return a
   value that resolves to nothing under every lookup — the shape
   `#typeExpr`'s `par-for` arm already uses for an unresolvable element
   (`{ kind: "named", name: "unknown" }`, `:279`) — instead of `node.field`.
   This closes the wrong-type half completely: d1–d19's collisions all disappear,
   because no author-chosen name enters the type namespace. It closes nothing
   else: the eight codes stay erased (b1–b18 unchanged), the false
   `non-array-iterand` still fires (c1–c7 unchanged, with the message moving to
   whatever the placeholder renders), and `schemas.md:97` stays contradicted. It
   also inherits the sentinel problem bug 0125's §Fix (b) enumerated: a
   lowercase-initial placeholder is unspellable by a conformant schema
   (`lexical.md:15`) but still collides with an ill-cased declaration that enters
   the `TypeEnv` anyway, and an uppercase-initial one is spellable. Route 2 is
   strictly weaker than route 1 and is worth stating only as the fallback if (e)
   blocks route 1 for this release: it removes a wrong-type without adding a
   refusal, so its GOV-15 exposure is confined to the collision inputs, all of
   which are refusals today.
3. **Leave the arm and document the disposition.** This requires the corpus to
   say that a member read has no static type — contradicting
   `schemas.md:97` outright, and requiring `expressions.md:10`'s closing clause
   to be rewritten, since it offers member access as the way to get the per-field
   declared type. It also leaves c1–c7 refusing spec-legal programs, which no
   documentation disposes of: `control-flow.md:13` admits those loops. **Route 3
   is not viable for the enum half** and is recorded only so the space is
   complete.

**(b) The enum-variant sub-route — one arm, two cases.** The arm serves both
`obj.field` and `Enum.Variant`, and `schemas.md:97` answers the second directly:
the static type is `Enum`, i.e. `{ kind: "named", name: <enum name> }`, derived
from the receiver, not from `node.field`. Two facts bound what that buys.
`collectTypeEnv` records no `enum` (`type-layer-checks.ts:314`; bug 0031's
recorded non-goal, bug 0038 residual (iii)), so the enum name resolves to nothing
and the expression defers — which is `type-system.md:48`'s posture and is exactly
what d8, d10, d12, d15 and d17 measure today. So the enum sub-route **removes the
collision without adding a check**, and its whole observable is d7–d19 collapsing
onto their controls. A fix must state that, because a reader will expect
`schemas.md:97` compliance to make `let m: integer = Color.Red` report; it does
not, and making it report needs enums in the `TypeEnv`, which is a separate
change with its own registry question. The receiver test also needs a source for
"is this identifier an enum name": `collectTypeEnv` does not answer it, and
deriving it from the statement list is a new read the fix has to justify —
or the arm distinguishes the two cases structurally, if the AST does.

**(c) The absent-field disposition must not move.** `expressions.md:9` assigns a
theta-side name the receiver does not carry a runtime
`theta/runtime/missing-object-key` panic; e8 and h5 measure both halves. Under
route 1, a field absent from the `fields` record must therefore fall through to
the deferring branch, **not** report. Two further sub-cases fall the same way and
must be asserted rather than assumed: an `object-schema` `NamedDecl` whose
`fields` is `undefined` (the property is optional, `type-compat.ts:82–87`;
`collectSchemaFields` returns `undefined` for the alias and `by … = …` forms), and
a field whose `typeSource` `annotationToCompatType` declined. The record is
null-prototyped and its existing reader is own-key-guarded (bug 0031's
`Object.hasOwn` at `type-layer-checks.ts:994`, bug 0038's `resolveNamed` at
`type-compat.ts:104–106`); any new read reuses that guard rather than indexing
the record directly.

**(d) The object-receiver bound must not move.** e1, e3 and e7 are the pins. A
receiver that unfolds to an object-schema `named` stays nominal (TYPE-10,
`type-system.md:52`); a field whose *declared type* is an object schema returns
that object schema's `named`, at which point `classifyReceiver` answers
`"object"` and the A2 gates keep deferring — which is e1's present observable and
must stay it. A fix that instead reached for the union of declared field types
would pull `expressions.md:10`'s unimplemented object-index result type into
scope (e7), and that is the separate report bug 0125's §Non-goals names. This
arm must not be the place it lands by accident.

**(e) GOV-15 is engaged, and the sweep is owed in both directions.**
`docs/spec_topics/governance/source-language-stability.md:9`'s loads-cleanly
predicate selects inputs emitting no `E` today. **Every row of §Reproduction (b)
is such an input**, and route 1 makes each of them refuse. This is the addition
direction bugs [0031](./0031-ctor-field-value-typing-unchecked.md),
[0084](./0084-increment-decrement-check-dead.md) and
[0102](./0102-params-default-string-literal-raw-newline-admitted.md) each faced,
and the diagnostic-registry carve-out (`:25`) is what admits it: every code
restored is an existing registered row whose *Trigger* already covers the operand,
so no row is added, removed or re-triggered and DIAG-2 is not engaged. The
opposite direction is a strict widening and needs no carve-out: c1–c7 and
d7/d9/d11/d13/d14/d16 are programs that refuse today and would load.
Three obligations follow.
- **A committed-corpus sweep, both directions, over `.theta` *and* `.thetalib`.**
  §Reproduction (g) is the pre-fix half, measured: 34 tracked files, every one
  `[]` except the seeded-invalid `tests/fixtures/h7b-invalid/malformed.theta`.
  **`tests/committed-fixture-parse-gate.test.ts` cannot discharge it**: its walk
  filters `.theta` only and witnesses neither committed `.thetalib`
  ([0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md), open), and
  one of the two it cannot see — `docs/examples/personas.thetalib` — holds the
  corpus's only member read on a receiver route 1 resolves. The sweep therefore
  extends the walk in a scratch probe (the 0079/0095/0125 method) or waits on
  0132; either way the `.thetalib` half is measured, not assumed.
- **The H9a decision is taken by the real run, not by assumption** (the
  0079/0084/0102/0125 method). `tests/fixtures/h7a/permitted-codes.json` is
  byte-`a4a8da04209f90e13d815edd92c1fc682e2a2236` and holds no `theta/parse/*`
  code; nine become newly reachable, so if any H9a fixture drew one the file
  would need an append. Statically, no H9a or H7a fixture contains a member read
  at all (`rg` over `tests/fixtures/h7a/acceptance.theta` and
  `tests/live/acceptance/fixtures/` returns none), so the expected answer is *no
  append* — and it is still decided by running
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/`
  and reading `assertCodesSubsetOfPermitted`'s hard `.toEqual([])`. The
  **empty-capture stderr gate** (`assertStderrClean`, `tests/live/acceptance/harness.ts:534`,
  measured baseline `dd4f3d3b`: 0 bytes of stderr on all ten spawns) is orthogonal
  and rejects the delivery mechanism regardless of code, so a newly-reachable
  parse diagnostic that reaches stderr reds it even if the code is permitted.
- **A per-erased-code reachability statement.** Nine registry rows change
  reachability. Each needs its *Trigger* read as written before the fix ships:
  eight regain an input class their *Trigger* already covers, one (`:64`) loses an
  input class it never covered. `docs/reference/diagnostics.md` carries no
  *Trigger* column, so no mirror edit follows from the codes.

**(f) Coordination with the adjacent open and recently-fixed reports.** Five
constraints, each with a named artifact.
- **Bug 0125's witness must be updated deliberately if touched.**
  `tests/index-element-alias-unfolded.test.ts` (51 rows) pins the object-index
  route in its rows d1, d2 and d6, which drive a member-shaped receiver and
  assert silence; and its **group (f) tripwire rows** pin the present, diverging
  behaviour of the three sink-routing sites (`type-layer-checks.ts:620`, `:958`,
  `:1050`), **including f1's *false* `E`-severity rejection of a spec-legal
  binding**, so a fix that widens into them reds rather than passing silently.
  `tests/index-element-alias-runtime-disposition.test.ts` (5 rows) pins the
  registration decision for the index route.
- **Bug 0089's witness likewise.** `tests/fn-param-alias-unfolded-at-gates.test.ts`
  (36 cells) holds row `n1`, the tripwire bug 0126 must update, and cell c3
  (`:587–601`), the index-receiver pin. Neither should move for this fix; if one
  does, it moves on purpose and the record says why.
- **Bug 0126 shares three adjudications** — the loop-variable/field static type,
  the `placeholder-rendering-a.md` render obligation, and the schema-name
  collision — at a different position. The two should agree, and whichever lands
  second re-derives against the first. Neither blocks the other: d18 needs both.
- **Bug 0127 gains a new input class.** Route 1 makes `checkArrayJoin`
  (`src/runtime/stdlib-array.ts:100`) reachable from a member read that now
  narrows to `array<T>` (b9). That is the element gate firing on a *resolvable*
  element, inside its registered trigger and outside 0127's subject.
- **Bug 0124's inputs are unaffected in both directions.** Its fabricated names
  come from an annotation the lexer mis-captures, not from an expression arm;
  a fix here neither reaches nor is reached by it.

**Constraints any fix must satisfy**, each with a witness row above:

- **`unfoldAlias` is reused, not forked.** It is exported at
  `src/parser/type-compat.ts:155` and is the single construction point bug 0089's
  four sites, bug 0125's fifth and bug 0083's `let` record all share
  (`control-flow.ts:69`, `type-layer-checks.ts:642`, `:1186`, `:1427`, `:1437`,
  `static-type-inference.ts:248`, `:275`). A second unfolding helper would give
  TYPE-11 two implementations.
- **TYPE-10 holds.** An object-schema `named` and an alias of one stay
  non-narrowing: e1, e3, e6. This holds by `unfoldAlias`'s construction and must
  be asserted, not assumed.
- **An unresolvable `named` keeps deferring** (`type-system.md:48`), and a
  type-alias-cycle participant keeps its disposition — `collectTypeEnv` omits a
  cycle participant, so `unfoldAlias` leaves it intact.
- **Nested alias chains unfold** (c5), which TYPE-11 states in terms.
- **The absent-field and no-field-record cases defer** (§Fix (c)); e8 stays `[]`
  and h5 keeps panicking `theta/runtime/missing-object-key`.
- **The `<type>` render stops carrying a value identifier**, or the fix says it
  does not and names the rows that still produce one.
  `placeholder-rendering-a.md:13–21` read with `lexical.md:15` is the rule; c1,
  c8, d9 and d11 are the measured violations. `rg -n "got xs|got s'" tests/ docs/`
  returns no committed fixture asserting the field-identifier form, so the move
  reds nothing outside the new witness.
- **The deliberate message moves are c8 and the d-row disappearances.** c8's
  message becomes `got string`, matching c9 — `code-registry-parse.md:64`'s
  `got <type>` template under the declared field type, the same class of move bug
  0089 shipped at gate 1. d7/d9/d11/d13/d14/d16's code lists become their
  controls' (`[]`), and d18's becomes d19's.
- **One arm, both consumers — no per-consumer split.** This is one arm read
  through the public `typeOf` seam (`static-type-inference.ts:182–188`) by both
  the recording walk (`:94`) and the checker-side delegation
  (`type-layer-checks.ts:573–575`). One resolution serves both.

**Witness — offline, provider-free.** Every parse row settles inside one
`parseThetaDocument` call over `parseDoc` (`tests/helpers/e2e-s1.ts:39`), so the
harness is bug 0125's, extended. Required: (a) all four rows, a2 in particular,
which is what reds if a fix is mis-attributed to the alias route; (b) all
eighteen rows with the exact aggregated code list asserted by ordered whole-list
`toEqual` and every expected message read from the registry through
`parseRegistry` + `registryMessage` per DIAG-4 (the mechanism bug 0125's witness
established, `tests/brace-rooted-union-arm-capture.test.ts:110–152`'s precedent);
(c) all nine rows, which are the false-refusal half and red immediately if a fix
restores the types without removing the refusal; (d) all twenty rows, the
wrong-type record, with d5/d6 pinning that the declaration pair is clean and
d20 pinning the variant checker unmoved; (e) all eight rows as route bounds, e7
in particular as the object-index fence; (f) all three rows as sibling-arm
tripwires, so a fix that widens into `case "call"` or `case "method-call"` reds
rather than passing silently; and (g)'s corpus rows in whichever form 0132
leaves available. The runtime rows h1–h5 need the production executor harness
(`tests/non-object-receiver-gate.test.ts:221–292`); h1 and h2 are the two that
prove the fix removes a runtime outcome rather than merely adding a diagnostic,
and h5 is the bound §Fix (c) protects.

**Both directions.** Neutralising the fix must red exactly the rows that measure
it — every row of (b), (c) and (d) that moves — while leaving (e)1/(e)3/(e)7,
(f) and h5 green. A neutralisation that also reds (e)7 has widened into the
object-index arm; one that reds (f) has widened into a sibling arm; one that reds
h5 has changed the absent-field disposition. Each of the three is a stated bound,
so each is a distinguishable failure.

## Provenance

- **Origin:** the bug 0125 fix (0.76.0, commit `e7f73ccf`), residual 3 of
  `.pi/tmp/fixes/0125-report.md`: "A member-access index read loses its type in
  *both* spellings. Measured while re-deriving: `schema L = array<string>` +
  `schema P { xs: L }` + `fn f(p: P) { let y = p.xs[0]  y.frobnicate() }` reports
  `[]`, **and so does its concrete control** `schema P { xs: array<string> }` with
  the same body. Unchanged in both directions. Cause is disjoint: `#typeExpr`'s
  `case \"member\"` types a member access as `{ kind: \"named\", name: node.field }`
  — the field *name*, not the field *type* — so the alias is not what is lost …
  Bug 0038's `named`-mint class. **Fileable if the parent wants the member route
  covered; it is not this report's defect** (the concrete control is equally
  silent)." This report is that filing, and adds what the residual does not
  state: the eight-code erasure inventory with a directly-typed control per row,
  the false `theta/parse/non-array-iterand` on a spec-legal `for` over an
  array-typed field in five receiver spellings, the enum-variant half and its
  defect against the written `schemas.md:97`, the collision measured in both
  directions with the `lexical.md:15` argument for why the variant case is
  unbounded and the field case is not, the five equivalent routes to the arm, the
  runtime dispositions, the committed-corpus GOV-15 baseline, the separation from
  bugs 0038, 0125, 0089, 0126 and 0124, and the three §Fix routes with their
  constraints.
- **Evidence:** one scratch vitest file under a gitignored directory at
  `7c8833cd`, run in four rounds over `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  and the production executor (`parseThetaDocument` →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`), then
  deleted. All 4 (a)-rows, 18 (b)-rows, 9 (c)-rows, 20 (d)-rows, 8 (e)-rows,
  3 (f)-rows, the 34-file corpus sweep with its 13 shape probes, and 5 (h)-rows
  measured; outputs quoted verbatim above. No file in `src/`, `tests/` or
  `docs/bugs/` other than this one was written.
- **Implementation evidence at `7c8833cd`:**
  `src/parser/static-type-inference.ts` (`:20–24` the module header's
  resolvability precondition, `:94` the recording walk, `:182–188` the public
  `typeOf` seam, `:197–201` `#typeExpr`, **`:242–244` the defect site**, `:215`
  `ident`, `:249` `index` after bug 0125, `:252` `call`, `:254` `invoke`, `:256`
  `query`, `:258` `object`, `:260` `result-ctor`, `:262` `method-call`, `:279`
  the `par-for` element placeholder; 372 lines);
  `src/parser/type-layer-checks.ts` (`:166–188` `classifyReceiver`, `:196`
  `builtinMembers`, `:302–330` `collectTypeEnv` with the object-schema write at
  `:323–326` and the `schema`-only filter at `:314`, `:343` the `fn`-return
  annotation collector, `:458–472` `collectSchemaFields`, `:482–504`
  `annotationToCompatType` and its fallback at `:503`, `:573–575` the checker-side
  `typeOf`, `:642` the `let` arm (bug 0083), `:679–692` `walkStmt`'s `case "for"`
  (bug 0126), `:739` `walkFn`'s parameter record, `:994` bug 0031's own-key guard,
  `:1008–1016` `declaredFieldsOf`, `:1133–1135` the `member` walk hook,
  `:1180–1194` the `par for` binding arm, `:1391` `checkIndex`, `:1417–1458`
  `checkMethodCall` with the `join` guard at `:1427–1428` and the A2 classify at
  `:1448`, `:1468–1481` `checkMemberAccess`, `:1485–1496` `pushUnknownMethod`,
  `:1505` `checkPlusOperands`);
  `src/parser/type-compat.ts` (`:82–87` `NamedDecl`, `:90` `TypeEnv`, `:104–106`
  `resolveNamed`, `:147–172` `unfoldAlias` exported at `:155`, `:318–333`
  `displayType` with the `named` arm at `:324–325`, `:366` `classifyIndexReceiver`,
  `:387` `checkLetRhsCompat`);
  `src/parser/control-flow.ts` (`:64–81` `checkForIterand`, the unfold at `:69`,
  the `kind` test at `:70`, the message at `:79`);
  `src/runtime/stdlib-string.ts:105`; `src/runtime/stdlib-array.ts:100`
  (`checkArrayJoin`); `src/runtime/runtime-panics.ts:221` (`assertKeyPresent`),
  `:331` (`evaluateMemberAccess`), `:496` (`surfaceUnexpectedThrow`);
  `src/runtime/expression-evaluator.ts:615` (`checkIndexReceiver`);
  `src/extension/production-composition.ts:2045` (`hasLoadParseError`).
- **Spec measured against:**
  [Schemas — Variant access](../spec_topics/schemas.md#variant-access)
  (`schemas.md:95–97`, the written sentence);
  [Expressions](../spec_topics/expressions.md) (`:9` the *Member access* bullet,
  `:10` the *Indexed access* bullet and its closing member-access clause, `:22`
  enum variant access in the supported-forms list, `:101` `string` is not
  indexable, `:108` the `join` element rule, `:118–119` `keys()` / `values()`,
  `:122` the unknown-method disposition);
  [Type System](../spec_topics/type-system.md) (`:48` *Unresolvable operands*,
  `:52` TYPE-10, `:54` TYPE-11);
  [Control Flow](../spec_topics/control-flow.md) (`:13` the `for` iterand
  contract);
  [Lexical](../spec_topics/lexical.md) (`:15` the first-letter case rule);
  [Code registry — parse](../spec_topics/diagnostics/code-registry-parse.md)
  rows `:20`, `:24`, `:34`, `:36`, `:38`, `:40`, `:43`, `:54`, `:63`, `:64`,
  `:89`;
  [Diagnostic shape](../spec_topics/diagnostics/diagnostic-shape.md) (`:71`
  DIAG-1, `:72` DIAG-2, `:74` DIAG-4);
  [Placeholder rendering](../spec_topics/diagnostics/placeholder-rendering-a.md)
  (`:13–21`, `:19`);
  [Errors and Results](../spec_topics/errors-and-results/error-model.md) (`:74`
  the runtime-defect surface);
  [GOV-15](../spec_topics/governance/source-language-stability.md#gov-15)
  (`:5`, the loads-cleanly predicate `:9`, the diagnostic-registry carve-out
  `:25`). User-facing mirrors: `docs/reference/grammar.md:337–341`, `:538`;
  `docs/reference/type-system.md` (states no member-access result type).
- **Test evidence at `7c8833cd`:** `tests/index-element-alias-unfolded.test.ts`
  (bug 0125's 51-row witness; rows d1/d2/d6 pin the object-index silence, group
  (f) is the sink-routing tripwire set);
  `tests/index-element-alias-runtime-disposition.test.ts` (5 rows, the
  registration decision); `tests/fn-param-alias-unfolded-at-gates.test.ts` (bug
  0089's 36 cells; row `n1` is bug 0126's tripwire, cell c3 at `:587–601` the
  index-receiver pin); `tests/let-annotation-recorded-binding-type.test.ts` (bug
  0083's 19 cells); `tests/control-flow.test.ts:140` (the
  `theta/parse/non-array-iterand` unit cells, all over synthetic `CompatType`
  values, none through a member read); `tests/committed-fixture-parse-gate.test.ts`
  (the corpus gate, `.theta`-only — bug 0132);
  `tests/live/acceptance/harness.ts:534` (`assertStderrClean`, the empty-capture
  gate) and `tests/live/acceptance/noninteractive-acceptance.test.ts:115`
  (`assertCodesSubsetOfPermitted`); `tests/fixtures/h7a/permitted-codes.json`
  (11 codes, blob `a4a8da04209f90e13d815edd92c1fc682e2a2236`, no `theta/parse/*`
  entry). **No committed test drives a member read in a checked position.**

## Coordination note — bug 0050 landed (0.77.0)

Two of 0050's eight orchestrated-round review findings are this report's
substrate defect surfacing at the new fn-argument sink: the `member` /
`method-call` arms trusting a `named` type minted from a FIELD/METHOD name,
and the `call` arm trusting one minted from a CALLEE name. Both were closed
at the sink by WITHHOLDING (`provableArgType` refuses spelling-mints;
`tests/fn-arg-type-mismatch-wired.test.ts` cells u6–u8p), not by touching the
substrate — `classifyReceiver`, `checkMemberAccess` and
`StaticTypeInferencePass` are byte-unchanged by the 0050 fix. The substrate's
mints remain this report's to fix.
