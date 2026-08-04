# Bug 0124 — `parseType` joins any trailing punctuation into the captured annotation string, so at the three `Type` positions outside a schema — a `let` annotation, an `fn` parameter type, an `fn` return type — `integer--`, `integer%`, `integer-`, `integer~` and eighteen further spellings load with zero diagnostics, `annotationToCompatType` maps each to an opaque `{kind:"named"}` type, and seven registered type-layer codes stop firing while `theta/parse/non-array-iterand` fires falsely with the junk text rendered into its message

- **Status:** open. §Fix is not settled: this report exists to pin the emission
  point and the registry disposition before any code lands. Two ordering
  constraints — [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md)
  (open, §Fix settled, landing in this tree at the time of writing) changes the
  signature of one of the two gates measured below, and
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) (open)
  owns the two `parseType` positions this report does not. Either 0061 lands
  first or the two fixes re-derive each other's rows over the shared capture
  (§Fix (e)).
- **Sev/Diff estimate:** S1/D3 — one trailing punctuation character silently
  removes seven registered error-severity rejections across the three
  annotation positions and the theta still registers, so declared constraints
  go unenforced with no diagnostic on any channel; D3 because the emission
  point, the terminator set and the DIAG-2 row are all adjudicated in-run, the
  capture is shared with 0061's and 0059's positions under pinned-byte
  coordination, and one measured gate's signature is changing under 0089.
- **Kind:** defect against `docs/spec_topics/grammar.md:90`–`:102` and `:105`
  read together with `docs/spec_topics/type-system.md:15`, plus a registry gap.
  `Type` is a closed production set, `grammar.md:105` states "The grammar is
  otherwise identical in every position", and `type-system.md:15` binds every
  annotation position to that one grammar. `integer--`, `integer%`, `integer.`,
  `--`, `--integer` and `thisisnotatype` are derivable from none of the six
  alternatives. Each is captured verbatim, recorded on the AST node, and
  consumed as a nominal type reference. No registered row covers the input at
  these positions — that absence is a DIAG-2 question this report pins and does
  not answer (§Fix (c)).

  The defect is the capture's **accepted-terminator set**, not any one operator.
  Bug [0084](./0084-increment-decrement-check-dead.md)'s fix (0.71.0) made `--`
  a single lexer token (`src/lexer/lexer.ts:175–177`) and wired
  `theta/parse/increment-decrement` at the two expression-walk hooks; the type
  positions were never in that fix's scope and are byte-unchanged by it. `--`
  is measured here beside twenty-one other trailers with the identical
  disposition, so nothing about the increment/decrement pair explains the
  silence and no `--`-specific change closes the class.
- **Related:**
  - [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) —
    **open, and the closest report; read the boundary before treating this as a
    duplicate.** 0061 owns the same capture at the other two positions it
    serves: a `schema X = …` alias arm and a `schema` body field type. Its frame
    is the **lowering**: junk text reaches `lowerTypeExpr`'s catch-all
    (`src/parser/params.ts`) and becomes the permissive `{}` in a JSON-Schema
    fragment, after which real AJV accepts every value. This report's frame is
    the **compatibility layer**: at the three positions that feed no
    `$defs` fragment, the same text reaches `annotationToCompatType`
    (`src/parser/type-layer-checks.ts:482–504`) and becomes an opaque
    `{kind:"named"}` `CompatType`, after which seven type-layer gates — the
    `⊑`-engine checks, the method / condition / index classifiers, and the
    `subagent fn` return check — decline. The two consequence mechanisms are disjoint,
    the two position sets are disjoint, and 0061 declines these positions **in
    terms**: its §Fix constraint 2 lists "the `value` / `return` positions
    (`let` annotations, `fn` parameter and return types)" among the surfaces
    that "reach `parseTypeExpression` but not `lowerTypeSource`", and its
    §Affected records their blast radius as one "this report does not measure
    and does not own". Both reports read `parseType`; only 0061 reads
    `lowerTypeSource`. **The schema-field row of the 0084 evidence bundle
    (`schema S { a: integer-- }`, zero diagnostics) is 0061's, not this
    report's**, and is reproduced below only as a cross-position control.
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
    **open**, the fourth position, and the third disjoint consequence. Non-type
    text arriving through a `params:` YAML scalar is recorded on
    `BypassParamsField.type` and rendered into the binder's `Parameters:` block.
    Measured here as a control: `params: p: integer--` records
    `fields[0].type = "integer--"` and lowers `properties.p = {}` with zero
    diagnostics. That position does not reach `parseType` at all — the
    frontmatter parser owns it (`src/parser/frontmatter.ts`) — so it is outside
    this report's mechanism as well as its scope.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, adjacent and disjoint. 0051 owns a **well-formed** lowercase
    `NamedType` at a reference position drawing no *case* diagnostic
    (`let a: nope = 3` observationally identical to `let a: Nope = 3`), and asks
    whether `grammar.md:98`'s "(PascalCase)" parenthetical is normative over
    references. Its input is an `Ident`; this report's input is not. Neither of
    0051's two dispositions reaches it: `let a: Cat-- = 3` is measured silent
    here and stays silent under either, because `Cat--` starts uppercase. 0051
    is nonetheless load-bearing on one shared fact — its §Affected already cites
    `annotationToCompatType`'s fallback as "no case test and no resolvability
    test", and quotes `unresolvedNamedTypeDiagnostic`'s closed five-position
    list, which is why the `let` and `fn` positions have no name walk to lose.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, and the precedent against the cheap registry route. 0044
    established that `theta/parse/unresolved-named-type` must not fire for text
    that is not an `Ident` (`grammar.md:98`), and its fix classified
    reserved-keyword spellings ahead of the resolution. `integer--` is likewise
    not an `Ident`, so widening that row to cover it would re-open exactly what
    0044 closed (§Fix (c)).
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — **fixed
    (0.38.0)**; owns the permissive-`{}` inventory at the `@<T>` and
    schema-field positions and the question of whether `{}` should ever be a
    lowering. This report reaches no lowering and does not reopen it.
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **open, §Fix
    settled, in flight.** 0089 owns how a **recorded** `fn` parameter type is
    *consumed* at two gates: `checkForIterand` and the `array.join` element
    test both read `type.kind` on the raw type, so an alias-typed parameter
    (`schema L = array<string>` + `fn f(xs: L)`) is misread. This report owns
    how the type is *captured*: the same two gates are measured below with a
    junk-suffixed annotation instead of an alias, and **0089's fix does not
    reach them.** Its fix unfolds through `unfoldAlias`
    (`src/parser/type-compat.ts:155–172`), which returns an unresolvable `named`
    intact (`:164–167`: `if (decl === undefined || decl.kind !== "alias")
    { return current; }`), and `array<string>--` resolves to no declaration.
    The two fixes are complementary and must not collide — 0089 is already
    changing `checkForIterand`'s signature in this working tree (it gains a
    `TypeEnv` parameter), which is the coordination constraint §Fix (e) states.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) —
    **fixed (0.55.0)**, and the reason the `let` position has consequences at
    all. That fix records the declared annotation as the binding's type
    (`type-layer-checks.ts:601–604`) so downstream uses consult it. It also
    exported `unfoldAlias`. Recording a junk annotation is what propagates the
    opacity past the `let` statement into every later use of the binding
    (§Reproduction group (d)).
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, and why the call site adds nothing here. `checkFnArgCompat` has no
    `src/` caller, so `f("x")` against `fn f(n: integer)` is silent already;
    measured below as a control pair that does not move.
  - [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) — **the
    sibling residual, and the sharpest contrast on framing.** 0123 is filed from
    the same bug 0084 residual list (item (iii)) and IS `--`-specific: a `--` in
    `match` pattern position is consumed by `parsePattern`'s one-token wildcard
    recovery and draws neighbouring codes instead of the registered one. That
    report's frame is one operator at one position because the mechanism is that
    operator's token meeting a wildcard recovery. This report's frame is twenty-two
    trailers at three positions because the mechanism is a stop set that contains
    none of them. The two do not overlap in code (`parsePattern` against
    `parseType`) and neither fix moves the other's rows.
  - [0122](./0122-template-interpolation-diagnostics-discarded.md) — the third
    sibling residual (item (ii)), a discarded-diagnostics defect inside a
    `@`-template `${…}` interpolation. Disjoint mechanism: there the diagnostics
    are raised and dropped, here none is raised.
- **Affected** (every citation verified at HEAD `36540b09`, 0.71.0):
  - `src/parser/theta-document.ts:2944–3066` — **the defect site.**
    `parseType(stopAtFieldBoundary = false, stopAtWithClause = false,
    aliasArmBoundary = false)` is an *extent* function: the loop joins the
    current token's text unconditionally (`:3055`) and breaks only on a closed
    stop set. In the default mode the three positions this report owns use, that
    set is: `stmt-sep` (`:2968–2970`); a depth-0 `,` / `)` / `{` / `}` / `=`
    (`:3011–3021`); a depth-0 ident spelled `with` when `stopAtWithClause`
    (`:3022–3034`, the `fn` return slot, bug 0005 (a)); and — only when
    `stopAtFieldBoundary`, which no position this report owns passes — a
    value-ish token after a completed atom with no intervening `|`
    (`:3035–3045`). The three remaining stops are `aliasArmBoundary`-only and
    serve 0061's alias position alone: an `ALIAS_ARM_STOP_PUNCT` head
    (`:2972–2980`), a completed-arm `-` (`:2991–3000`), an arm-start
    `ALIAS_ARM_STOP_KEYWORDS` head or `{` (`:3001–3010`). `-`, `+`, `--`, `++`,
    `%`, `*`, `/`, `.`, `==`, `&&`, `||`, `?`, `!`, `:`, `|`, `~`, `^`, `@`,
    `#`, `$`, a string literal and a number literal are in **no** stop set at
    these three positions, so each joins the type source. No arm of the loop
    asks whether what it accumulated derives from `Type`. The function is a
    method on the parser class and `this.diagnostics` is in scope, so the
    incapacity is the stop set, not an unavailable sink.
  - `:3046–3054` — the depth counter, which increments on `<` / `(` / `[` and
    decrements on `>` / `)` / `]` with no floor and no balance check. A trailing
    `<` or `>` therefore takes the capture to a negative or unclosed depth and
    runs it past the parameter list, the body and the following statements
    (§Reproduction group (e)). Named here because a terminator-set change must
    state a disposition for it; not owned (§Non-goals).
  - **The three call sites this report owns**, all in default mode:
    - `:1963–1966` — the `let` annotation: `if (this.isPunct(":")) { …
      annotation = this.parseType(); }`. `LetStmt ::= "let" "mut"? Pattern (":"
      Type)? "=" Expr` (`grammar.md:77`).
    - `:2178–2181` — the `fn` parameter type: `pType = this.parseType()` inside
      the parameter loop, pushed as `{ name: pName, type: pType }` (`:2183`).
      `FnParam ::= Ident ":" Type` (`grammar.md:140`).
    - `:2198–2200` — the `fn` return type: `returnType = this.parseType(false,
      true)`. `FnDecl ::= "fn" Ident "(" FnParams? ")" (":" ReturnType)? FnBody`
      (`grammar.md:138`), `ReturnType ::= Type | "void"` (`:89`).
  - **The two call sites this report does not own** — `:2408`
    (`this.parseType(true, false, true)`, the alias right-hand side) and `:2581`
    (`this.parseType(true)`, the schema body field type). Both are
    [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)'s. They
    are cited because a change to the shared stop set moves them.
  - `src/parser/type-layer-checks.ts:474–504` — **the consumer that turns the
    junk into a type.** `annotationToCompatType(src)` (`:482`) trims (`:483`),
    returns `undefined` for empty (`:484–486`), splits a top-level union
    (`:488–494`), matches `/^array<(.+)>$/` (`:495–499`), matches
    `PRIMITIVE_NAMES` (`:500–502`) — and otherwise returns
    `{ kind: "named", name: text }` (`:503`). Its doc comment states the
    disposition (`:477–480`): "every other shape (a `NamedType`, an inline
    object type) resolves to a nominal `named` reference — the same shape the
    `⊑` engine treats as deferred." There is no well-formedness test and no
    resolvability test, so `integer--` is a `named` type named `integer--`.
  - `:601–604` — the `let` position's consumption: the annotation is converted
    once and used both for `checkLetRhsCompat` (`:605–615`) and as the recorded
    binding type (bug 0083). `:734–740` — `walkFn`; `:738` is
    `fnScope.set(p.name, annotationToCompatType(p.type) ?? { kind: "named",
    name: p.type })`, so the parameter's body-scope type is the junk either way
    and an `undefined` from the converter re-lands as `named`. `:768–769` and
    `:792–800` — `checkSubagentReturnAnnotation`, the only consumer of an `fn`
    return annotation as a `CompatType`; an ordinary `fn`'s return annotation is
    not compat-checked, which is why the return position's measured loss is
    confined to `subagent fn`.
  - **The gates that decline on an opaque `named`** — each measured losing its
    emission below: `checkLetRhsCompat` →
    `theta/parse/let-rhs-type-mismatch` and
    `theta/parse/array-element-type-mismatch`;
    `checkMethodCall` (`:1409–1433`, the `join` guard at `:1416`
    `if (e.method === "join" && targetType.kind === "array")`) →
    `theta/parse/non-string-array-join` and `theta/parse/unknown-method`;
    the condition and index-receiver classifiers →
    `theta/parse/non-boolean-condition` and
    `theta/parse/non-indexable-receiver`;
    `checkSubagentReturnAnnotation` → `theta/parse/invoke-return-type-mismatch`.
  - `src/parser/control-flow.ts:51–66` — **the one gate that fires, wrongly.**
    `checkForIterand` tests `iterand.type.kind === "array"` (`:55`) and
    otherwise emits `theta/parse/non-array-iterand` (`:61`) rendering the type
    through `displayType` (`:64`). For `array<string>--` the kind is `named`, so
    a declared array iterand is refused and the message reads `got
    array<string>--` — the captured junk in author-facing text. **This function
    is being changed by bug 0089 in this working tree** (it gains a `TypeEnv`
    parameter); the citation is HEAD's.
  - `src/parser/type-compat.ts:155–172` — `unfoldAlias`, 0089's instrument.
    `:164–167` returns an unresolvable `named` unchanged, which is the proof
    that 0089's fix leaves every row of §Reproduction group (c) exactly as
    measured.
  - `src/parser/type-grammar.ts:108–123` — **`parseTypeExpression`, the seam
    that owns the type grammar, runs over this exact text at all three
    positions, and reports nothing.** It tokenises, parses, returns `[]` when
    the parse yields no node (`:117–119`), and otherwise walks the node for its
    position rules only (`:121`). Three tolerances make the silence structural:
    `parse()` does not require the token stream to be consumed (`:253–256`);
    `parsePrimary` skips unexpected punctuation by design (`:295–297`, comment
    "Unexpected punctuation: skip it to stay tolerant"); and `parseUnion`
    (`:264–270`) and `parseObject` (`:342–376`, breaks at `:361` and `:375`)
    end their loops on a failed arm or field rather than failing the parse.
  - `src/parser/theta-document.ts:6039–6043` — the `let` position's call,
    `parseTypeExpression(s.annotation, "value", …)`; `:6113–6127` — the `fn`
    position's calls, `p.type` at `"value"` (`:6116`) and `s.returnType` at
    `"return"` (`:6122`). The seam is wired at every position this report owns;
    it is silent by construction, not by an omitted call.
  - `src/parser/theta-document.ts:4942–4963` — the doc comment on
    `unresolvedNamedTypeDiagnostic` (declared `:5029`), which states the
    registry's closed five-position list and names these positions as outside
    it: "a `let` annotation, an `fn` parameter type, a generic argument, a union
    arm and `invoke<Type>` (grammar.md §Type grammar) are outside it, so
    `let x: Nope = 1` resolves nothing and fires nothing." This is why the
    absorbed-junk suppression of that code is measurable only at the schema and
    `@<T>` positions, not here.
  - `src/parser/theta-document.ts:4400–4414` — the `@<T>` query annotation's
    **separate** capture: an inline depth loop joining every token to the
    closing `>`, with the same leniency and its own empty-interior rejection at
    `:4428–4437` (`theta/parse/empty-query-annotation`, bug 0014). Measured
    below as an adjacent row; not `parseType` and not owned here (§Non-goals).
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`,
    which tests error severity over `theta/load/*` and `theta/parse/*` only;
    `:1560–1562` — the registration gate (`const registered =
    !diagnostics.some((d) => d.severity === "error")`); `:1933–1935` and
    `:2092` — the two other drop tests. These inputs emit nothing, so every one
    of them registers and runs.
  - `src/lexer/lexer.ts:175–177` — `twoCharOperators`, which after bug 0084's
    fix (0.71.0) includes `++` and `--`. The pair therefore reaches `parseType`
    as one token; `parts.push(t.text)` at `theta-document.ts:3055` joins it
    whole, which is why the captured string is `integer--` and not
    `integer-` + `-`.
  - **Spec — the closed production set.**
    `docs/spec_topics/grammar.md:88–103` (the §Type grammar fence): `:89`
    `ReturnType ::= Type | "void"`, `:90–95` `Type`'s six alternatives, `:97`
    `PrimitiveType`, `:98` `NamedType ::= Ident`, `:99–100` `GenericType`,
    `:101` `ObjectType`, `:102` `LiteralType`. `:105` — the bare-`Type`
    position list ("`let` annotations, `fn` parameter types, schema field types,
    `params:` field types, generic type arguments, union arms, and
    `invoke<Type>` / type-ascription contexts") and the sentence "The grammar is
    otherwise identical in every position". `:77` (`LetStmt`), `:138`
    (`FnDecl`), `:140` (`FnParam`).
    `docs/spec_topics/type-system.md:15` — "The same type grammar applies in
    every type-annotation position: schema fields, frontmatter `params:`,
    `let x: T`, function parameters, and `@<T>`...`` explicit query schemas; the
    function- and theta-return position additionally admits the return-only
    `void` annotation."
  - **Spec — the registry rows assessed, none of which covers the input.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:33`
    (`theta/parse/increment-decrement`, *Trigger* "`++` or `--` operator used."
    — position-unqualified, and covering two of the twenty measured trailers);
    `:27` (`unsupported-feature`, whose `<construct>` renders from the closed
    table at `placeholder-rendering-a.md`); `:87` (`malformed-alias-rhs`, scoped
    to a `schema X = …` declaration and excluding the absorbed-operator case in
    its own text); `:90` (`unresolved-named-type`, whose *Trigger* is the closed
    five-position list quoted above and whose subject is a `NamedType`).
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`theta/load/params-type-not-expression`) — the corpus's only "not a theta
    type expression" row, and explicitly unavailable: "A scalar is admitted
    whatever text it carries: this row judges the node's shape, not its text — a
    scalar's disposition is the lowering's, not this row's."
  - **Spec — the rows whose emissions are lost or falsified**, cited for their
    normative *Message* text (DIAG-4): `code-registry-parse.md:34`
    (`non-boolean-condition`), `:38` (`non-indexable-receiver`), `:40`
    (`array-element-type-mismatch`), `:43` (`non-string-array-join`), `:54`
    (`let-rhs-type-mismatch`), `:63` (`unknown-method`), `:64`
    (`non-array-iterand`), `:117` (`invoke-return-type-mismatch`).
  - **Spec — governance.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
    (DIAG-2 — the registry is closed; a trigger change is a spec change landing
    in the same commit), `:74` (DIAG-4 — the *Message* column is normative and a
    reword is deferred to theta 2.0).
    `docs/spec_topics/governance/source-language-stability.md:9` (the GOV-15
    loads-cleanly predicate: no `E`-severity diagnostic), `:25` (the
    diagnostic-registry carve-out, whose in-scope input set is defined post-hoc
    over the inter-release diff and which covers a trigger change "as an
    addition for inputs newly brought into the code's emission set").
  - **Reference mirrors a fix must co-edit.** `docs/reference/grammar.md:176–205`
    (the §Type grammar mirror; `:179–191` the productions, `:194–205` the
    per-form rules); `docs/reference/type-system.md:22` ("The same type grammar
    applies in every annotation position"); `docs/reference/diagnostics.md:79`,
    `:80`, `:84`, `:86`, `:89`, `:100`, `:109`, `:110`, `:139`, `:166` (the
    *Message* mirrors of the rows above — the file carries no *Trigger* column,
    so a trigger widening does not reach it, while a new row does).
  - **Test coverage of this defect: none.** No test in the tree drives a
    junk-suffixed annotation at any of the three positions. `rg` over `tests/`
    for `integer--`, `integer%`, `string--` and `thisisnotatype` returns
    nothing. The adjacent witnesses that a fix must keep green are
    `tests/increment-decrement-wiring.test.ts` (bug 0084, 25 cells, none of
    them in type position) and the four cells 0061 §Fix constraint 7 already
    claims at the schema positions.
- **Observed at:** `0.71.0` (HEAD `36540b09`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through `tests/helpers/e2e-s1.ts` (the shipped load path with inert seams),
  `annotationToCompatType` and `parseTypeExpression` at their unit seams, and a
  `git ls-files` census over every committed `.theta` / `.thetalib` parsed
  through the same load path; written, run, deleted.

## Summary

`parseType` (`theta-document.ts:2944–3066`) answers *where does this annotation
end*, not *is this annotation a type*. It joins the current token's text
unconditionally and breaks only on a closed stop set that, at the three
positions this report owns, contains `stmt-sep`, a depth-0 `,` / `)` / `{` /
`}` / `=`, and (return slot only) `with`. Every arithmetic, comparison, logical,
ternary, member-access and stray punctuation token — and a string or number
literal — is outside that set, so it joins the captured string.

The captured string is then read as a type by
`annotationToCompatType` (`type-layer-checks.ts:482–504`), whose final arm
returns `{ kind: "named", name: text }` for anything it does not recognise
(`:503`). `integer--` therefore becomes a **named type called `integer--`** —
a nominal reference the `⊑` engine treats as deferred, resolvable against
nothing, and structurally indistinguishable from a forward reference to a schema
the author has not written yet.

Two consequences follow, both measured at HEAD.

**Seven registered error-severity rows stop firing.** One trailing punctuation
character on an otherwise correct annotation removes the rejection the
annotation existed to produce. `let a: integer = "x"` draws
`theta/parse/let-rhs-type-mismatch`; `let a: integer-- = "x"` draws nothing, and
so do `integer-` and `integer%`. The same substitution removes
`theta/parse/array-element-type-mismatch`, `theta/parse/unknown-method`,
`theta/parse/non-boolean-condition`, `theta/parse/non-indexable-receiver`,
`theta/parse/non-string-array-join` and — at a `subagent fn` return —
`theta/parse/invoke-return-type-mismatch`. Because bug 0083's fix records the
`let` annotation as the binding's type, the opacity propagates past the
declaring statement into every later use of the binding.

**One row fires falsely, with the junk in its message.**
`fn f(xs: array<string>--)` with `for x in xs` draws
`theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got
array<string>--`. The author declared an array; the parser captured a name; the
gate refuses the program and prints the capture.

Neither the capture nor the type layer nor the seam that owns the type grammar
reports the input. `parseTypeExpression` (`type-grammar.ts:108–123`) is wired at
all three positions and runs over the same text, but it is a *position-check*
pass: it returns `[]` for text it cannot parse and walks only for `void`,
generic arity and `Result`, and its parser is written not to require the token
stream to be consumed. Measured at its unit seam, `"integer--"` and
`"thisisnotatype"` both return `[]` at every position, while `"void--"` and
`"array<integer,integer>--"` return exactly what `"void"` and
`"array<integer,integer>"` return — the trailing junk changes nothing about
which rule fires, because the rule fired on the node the tolerant parser did
build and no arm inspects the remainder.

Registration has no other gate: `hasLoadParseError`
(`production-composition.ts:2045–2052`) tests error severity, these inputs
produce none, and the theta registers and runs.

## Reproduction

Offline at HEAD `36540b09`. Every fixture is `mode: prompt` frontmatter (or
`mode: subagent` where noted) plus the body shown, parsed through
`parseThetaDocument` via `tests/helpers/e2e-s1.ts`. `ann` is the `let`
statement's captured `annotation`, `pType` the `fn` parameter list's captured
`{name, type}` pairs, `ret` the captured `returnType`, `stmts` the top-level
statement kinds, `diags` the whole diagnostic list unfiltered.

### (a) The terminator boundary — twenty trailers, three positions, one disposition

Fixtures: `let a: integer<T> = 3`, `fn f(n: integer<T>): integer { 1 }` +
`let a = f(2)`, and `fn f(): integer<T> { 1 }` + `let a = f()`, with `<T>` each
trailer in turn. **Swallowed into the capture, zero diagnostics at all three
positions:**

```
trailer   captured annotation      let   param   ret
--        integer--                 []     []     []
++        integer++                 []     []     []
-         integer-                  []     []     []
+         integer+                  []     []     []
%         integer%                  []     []     []
*         integer*                  []     []     []
/         integer/                  []     []     []
.         integer.                  []     []     []
==        integer==                 []     []     []
&&        integer&&                 []     []     []
||        integer||                 []     []     []
?         integer?                  []     []     []
!         integer!                  []     []     []
:         integer:                  []     []     []
|         integer|                  []     []     []
~         integer~                  []     []     []
^         integer^                  []     []     []
@         integer@                  []     []     []
#         integer#                  []     []     []
$         integer$                  []     []     []
"x"       integer"x"                []     []     []
1         integer1                  []     []     []
```

Twenty-two spellings, sixty-six cells, one disposition. `--` is one of them and
is not distinguished by anything: it lexes as a single token after bug 0084's
fix (`lexer.ts:175–177`) and `parts.push(t.text)` (`:3055`) joins it whole.

**Not swallowed — the structural stop set, which ends the capture and then
breaks the enclosing statement instead of judging the annotation:**

```
@@ trailer `,`   let   ann "integer"  diags [let-without-initialiser,
                                             unsupported-feature "stray ','",
                                             unsupported-feature "stray '='"]
                 param ann n:"integer" ONE param, trailing comma absorbed, diags []
                 ret   diags [unsupported-feature "stray ','", bare-object-literal]
@@ trailer `)`   let   diags [let-without-initialiser, stray ')', stray '=']
                 param pType [["n","integer"]] ret=null
                       diags [stray ')', stray ':', bare-object-literal]
@@ trailer `}`   let   diags [let-without-initialiser, stray '}', stray '=']
                 param pType [["n","integer"],["}",""]]  diags []
                       — the `}` becomes a SECOND PARAMETER NAMED `}`, silently
@@ trailer `{`   param pType [["n","integer"],["{",""]]  diags []   (same shape)
@@ trailer `=`   param pType [["n","integer"],["=",""]]  diags []   (same shape)
@@ trailer `;`   all three: the trailer never joins; diags
                 [unsupported-feature "';' (semicolons are not part of the grammar)"]
@@ trailer `\`   all three: diags [stray-backslash]
```

The `;` and `\` rows are lexer-level rejections that would fire anywhere in the
file; neither is a judgement on the annotation. The `}` / `{` / `=` parameter
rows are the stop set behaving as designed followed by an unrelated silent
acceptance one layer out.

### (b) What the captured string contains, and what the type layer makes of it

`annotationToCompatType` at its unit seam:

```
"integer"                  -> {"kind":"prim","name":"integer"}
"integer--"                -> {"kind":"named","name":"integer--"}
"integer-"                 -> {"kind":"named","name":"integer-"}
"integer%"                 -> {"kind":"named","name":"integer%"}
"integer."                 -> {"kind":"named","name":"integer."}
"integer=="                -> {"kind":"named","name":"integer=="}
"integer?"                 -> {"kind":"named","name":"integer?"}
"integer|"                 -> {"kind":"named","name":"integer|"}
"integer~"                 -> {"kind":"named","name":"integer~"}
"integer^"                 -> {"kind":"named","name":"integer^"}
"string--"                 -> {"kind":"named","name":"string--"}
"boolean--"                -> {"kind":"named","name":"boolean--"}
"Cat--"                    -> {"kind":"named","name":"Cat--"}
"integer------"            -> {"kind":"named","name":"integer------"}
"array<integer>--"         -> {"kind":"named","name":"array<integer>--"}
"array<integer-->"         -> {"kind":"array","element":{"kind":"named","name":"integer--"}}
"integer -- "              -> {"kind":"named","name":"integer --"}
```

The `array<integer-->` row is the class one level down: the generic application
is recognised and the junk becomes its **element** type. The `integer -- ` row
shows the capture drops interior whitespace between tokens but the trim leaves
the pair, so a spaced spelling is the same named type.

Captured strings end to end, read off the AST:

```
@@ let a: integer-- = 3            ann "integer--"        diags []
@@ let a: --integer = 3            ann "--integer"        diags []
@@ let a: int--eger = 3            ann "int--eger"        diags []
@@ let a: integer--%% = 3          ann "integer--%%"      diags []
@@ let a: integer -- = 3           ann "integer--"        diags []
@@ let a: -- = 3                   ann "--"               diags []
@@ let a: this is not a type = 3   ann "thisisnotatype"   diags []
@@ let a: = 3                      ann ""                 diags []
@@ let mut a: integer-- = 3        ann "integer--"        diags []
@@ let a: integer-- | string = 3   ann "integer--|string" diags []
@@ let a: integer | string-- = 3   ann "integer|string--" diags []
@@ let a: { b: integer-- } = 1     ann "{b:integer--}"    diags []
@@ let a: { b: integer-- as "B" } = 1                     diags []
@@ let a: array<integer--> = [1]   ann "array<integer-->" diags []
@@ fn f(n: --): integer { 1 }      pType [["n","--"]]     diags []
@@ fn f(): -- { 1 }                ret "--"               diags []
@@ .thetalib: fn f(n: integer--): integer { 1 }           diags []
@@ subagent fn g(n: integer--): integer with { model: "x" } { 1 }
                                                          diags []
```

Leading, interior, doubled, spaced, bare, prose and empty spellings are all
silent, at both the `.theta` and `.thetalib` spellings and through the
`subagent fn` / `with` form.

### (c) The consequence — seven registered rows lost, one falsely fired

Each pair is the same program with and without the trailer. `[CTL]` is the
control that fires.

```
@@ let a: integer = "x"            [CTL] [let-rhs-type-mismatch: expected integer, got string]
   let a: integer-- = "x"                []
   let a: integer- = "x"                 []
   let a: integer% = "x"                 []
@@ let a: string = 3               [CTL] [let-rhs-type-mismatch: expected string, got integer]
   let a: string-- = 3                   []
@@ let a: boolean = 3              [CTL] [let-rhs-type-mismatch: expected boolean, got integer]
   let a: boolean-- = 3                  []
@@ let a: array<string> = [1]      [CTL] [let-rhs-type-mismatch: expected array<string>,
                                          got array<integer>,
                                          array-element-type-mismatch at index 0]
   let a: array<string>-- = [1]          []
@@ let a: integer = 3 / a.length   [CTL] [unknown-method: unknown method 'length' on type integer]
   let a: integer-- = 3 / a.length       []
@@ let a: integer = 3 / if a {…}   [CTL] [non-boolean-condition: condition must be boolean;
                                          got integer]
   let a: integer-- = 3 / if a {…}       []
@@ let a: integer = 3 / a[0]       [CTL] [non-indexable-receiver: … got integer]
   let a: integer-- = 3 / a[0]           []
@@ let a: array<integer> = [1] / a.join(",")
                                   [CTL] [non-string-array-join: … got array<integer>]
   let a: array<integer>-- = [1] / a.join(",")
                                         []
@@ let a: integer = 3 / let b: string = a
                                   [CTL] [let-rhs-type-mismatch: expected string, got integer]
   let a: integer-- = 3 / let b: string = a
                                         []
```

The last pair is the propagation: bug 0083's fix records the annotation as the
binding's type, so the opacity outlives the `let` statement.

The `fn` parameter position loses the same gates through the body scope
(`type-layer-checks.ts:738`):

```
@@ fn f(n: integer): integer { n.length }     [CTL] [unknown-method … on type integer]
   fn f(n: integer--): integer { n.length }         []
@@ fn f(n: integer): integer { if n {…} }     [CTL] [non-boolean-condition … got integer]
   fn f(n: integer--): integer { if n {…} }         []
@@ fn f(n: string): string { n[0] }           [CTL] [non-indexable-receiver … got string]
   fn f(n: string--): string { n[0] }               []
@@ fn f(xs: array<integer>): string { xs.join(",") }
                                              [CTL] [non-string-array-join … got array<integer>]
   fn f(xs: array<integer>--): string { xs.join(",") }
                                                    []
```

The `fn` return position loses one row, at a `subagent fn` — the only shape
whose return annotation is consumed as a `CompatType`
(`type-layer-checks.ts:768–769`):

```
@@ mode: subagent / subagent fn g(): integer { "x" }
                          [CTL] [invoke-return-type-mismatch: invoke<Schema> annotation
                                 incompatible with callee 'g' return type string]
   subagent fn g(): integer-- { "x" }                    []
   CONTROL, ordinary fn:  fn g(): integer { "x" }        []   — silent either way
```

And the one row that fires, wrongly, rendering the capture:

```
@@ fn f(xs: array<string>): integer { for x in xs { 1 } 1 }   [CTL] []
   fn f(xs: array<string>--): integer { for x in xs { 1 } 1 }
     [non-array-iterand: 'for' expects array<T> after 'in'; got array<string>--]
@@ let a: integer = 3 / for x in a { 1 }
     [non-array-iterand: … got integer]                       [CTL]
   let a: integer-- = 3 / for x in a { 1 }
     [non-array-iterand: … got integer--]
```

Both `non-array-iterand` rows fire; the difference is the message. The first
pair is a **false rejection** — the author declared `array<string>` — and both
put junk source text into an author-facing string. `unfoldAlias`
(`type-compat.ts:164–167`) returns an unresolvable `named` intact, so bug 0089's
fix leaves every row of this group exactly as measured.

### (d) The type-grammar seam over the same texts

`parseTypeExpression(<text>, <position>, site)` at its unit seam — the call all
three positions make (`theta-document.ts:6041`, `:6116`, `:6122`). Codes only:

```
text                        value                        return                  schema-feeding
"integer"                   []                           []                      []
"integer--"                 []                           []                      []
"integer++"                 []                           []                      []
"integer-"                  []                           []                      []
"integer+"                  []                           []                      []
"integer%"                  []                           []                      []
"integer."                  []                           []                      []
"integer=="                 []                           []                      []
"integer&&"                 []                           []                      []
"integer?"                  []                           []                      []
"integer!"                  []                           []                      []
"integer:"                  []                           []                      []
"integer|"                  []                           []                      []
"integer~"                  []                           []                      []
"integer^"                  []                           []                      []
"integer@"                  []                           []                      []
"integer#"                  []                           []                      []
"integer$"                  []                           []                      []
"integer1"                  []                           []                      []
"integer\"x\""              []                           []                      []
"--"                        []                           []                      []
"--integer"                 []                           []                      []
"int--eger"                 []                           []                      []
"thisisnotatype"            []                           []                      []
"Cat--"                     []                           []                      []
"Ghost--"                   []                           []                      []
"integer--|string"          []                           []                      []
"integer|string--"          []                           []                      []
"{b:integer--}"             []                           []                      []
"array<integer>--"          []                           []                      []
"void"                      [void-in-non-return-position] []                     [void-in-non-return-position]
"void--"                    [void-in-non-return-position] []                     [void-in-non-return-position]
"array<integer,integer>"    [generic-arity-mismatch]     [generic-arity-mismatch] [generic-arity-mismatch]
"array<integer,integer>--"  [generic-arity-mismatch]     [generic-arity-mismatch] [generic-arity-mismatch]
"Result<string,integer>--"  []                           []                      [result-in-schema-position]
```

Thirty-five texts × three positions. The seam is wired at all three and reports
nothing for any non-derivable source.

The last five rows are the proof that the seam runs and then declines to look at
what it did not consume: a trailing operator changes nothing about which
position rule fires. End to end:

```
@@ let a: void = 3      [void-in-non-return-position]
@@ let a: void-- = 3    [void-in-non-return-position]      — identical
@@ let a: array<integer, integer> = [1]     [generic-arity-mismatch]
@@ let a: array<integer, integer>-- = [1]   [generic-arity-mismatch]  — identical
@@ fn f(): void-- { }   []                                 — the return slot admits it
```

### (e) The `<` and `>` trailers — the capture runs past the statement

Named to bound the terminator question, not owned here (§Non-goals):

```
@@ fn f(n: integer<): integer { 1 } / let a = 1
   pType [["n","integer<):integer"],["{",""],["1",""],["}",""],["\n",""],
          ["let",""],["a",""],["=",""],["1",""],["\n",""]]
   ret null   stmts ["fn"]   diags []
   — the body, the return annotation and the whole following statement are
     absorbed into the parameter list; ZERO diagnostics
@@ fn f(n: integer>): integer { 1 } / let a = 1
   pType [["n","integer>):integer{1}"],…]   stmts ["fn"]   diags []
@@ fn f(): integer< { 1 }         ret "integer<{1}"   stmts ["fn"]   diags []
@@ let a: integer< = 3            ann "integer<=3"    diags [let-without-initialiser]
@@ let a: integer> = 3            ann "integer>=3"    diags [let-without-initialiser]
```

The mechanism is the unfloored depth counter (`:3046–3054`) plus the lexer's
trailing-trigger continuation, not the accepted-terminator set. The `let` rows
are loud; the two `fn` rows are silent and lose a whole statement. 0061
§Non-goals records the alias-position analogue as unfiled and out of its frame.

### (f) Positions measured and NOT owned here

```
@@ 0061's — schema S { a: integer-- }   fields [["a","integer--"]]   diags []
   the same twenty trailers, the same silence; `1` is the exception —
   schema S { a: integer1 }  draws [unresolved-named-type 'integer1'], because
   `integer1` IS Ident-shaped and the field position runs the name walk
   CONSEQUENCE (0061's frame, cited as contrast):
     schema S { a: integer }   / S { a: "x" }
       [CTL] [object-field-type-mismatch: field 'a' on schema 'S' type mismatch:
              expected integer, got string]
     schema S { a: integer-- } / S { a: "x" }        []
@@ 0061's — schema X = integer--        arms ["integer--"]           diags []
@@ 0059's — params: p: integer--
   fields [{"wireName":"p","type":"integer--","hasDefault":false,"nullable":false}]
   loweredSchema {"type":"object","properties":{"p":{}},"required":["p"],
                  "additionalProperties":false}                      diags []
   CONTRAST, the params: BLOCK form, which DOES have a recogniser:
     params: / p: / type: integer--
       [error theta/load/params-type-not-expression: 'params:' field 'p'
        right-hand side is not a theta type expression]
   — a node-SHAPE rejection (`code-registry-load.md:19`), not a text judgement
@@ the @<T> annotation (a SEPARATE capture, theta-document.ts:4400–4414)
   let r = @<Cat-->`hi`   query.schema "Cat--"   diags []
   CONTROL  let r = @<Ghost>`hi`   diags [unresolved-named-type 'Ghost']
            let r = @<Ghost-->`hi` diags []
   — the trailing junk SUPPRESSES a registered code at one of that row's own
     five positions; not `parseType`, so not this report's frame
@@ invoke<T> — no differential: invoke<P>, invoke<P-->, invoke<Ghost>,
   invoke<Ghost--> and invoke<integer--> are all silent, because that position
   has no name walk either (theta-document.ts:4942–4963)
@@ the call site (0050's) — fn f(n: integer): integer { 1 } / f("x") is silent
   at HEAD, and so is fn f(n: integer--): integer { 1 } / f("x")
```

### (g) Controls that must not move

```
@@ let a: integer = 3                    ann "integer"          diags []
@@ let a: array<integer> = [1]           ann "array<integer>"   diags []
@@ let a: integer | string = 3           ann "integer|string"   diags []
@@ let a: { b: integer } = 1             ann "{b:integer}"      diags []
@@ schema Cat { a: string } / let a: Cat = 3                    diags []
@@ fn f(n: integer): integer { 1 }       pType [["n","integer"]] diags []
@@ fn f(): integer { 1 }                 ret "integer"          diags []
@@ fn f(): void { }                      ret "void"             diags []
@@ fn f(): string with-clause form, subagent fn, .thetalib fn   diags []
```

### (h) Committed-corpus census

`git ls-files '*.theta' '*.thetalib'` at HEAD lists **34** files (32 `.theta`,
2 `.thetalib`). Parsed through the real load path they declare **10** `let`
annotations, **3** `fn` parameter types, **2** `fn` return types, **25** schema
field types and **0** alias arms. Judged against the six `Type` alternatives
(identifier or primitive, `array<…>`, `Result<…>`, brace-rooted, quoted or
numeric literal, and any `|`-separated combination of those), **0** are
offenders. No committed fixture is in this report's class, so none changes
disposition when a fix lands, and
`tests/committed-fixture-parse-gate.test.ts` never meets one of these inputs.

Reading the tables:

- **(a) is the whole defect.** Twenty-two trailers, three positions, one
  disposition. Nothing distinguishes `--` from `%` or `~`, which is why the
  frame is the accepted-terminator set and not the increment/decrement pair.
- **(b) locates the junk precisely.** It is inside the recorded annotation
  string, which is the only thing downstream consumers see. `annotationToCompatType`'s
  final arm converts every one of them into a nominal reference.
- **(c) is the cost.** Seven registered `E` rows stop firing; one fires with the
  junk in its message and, for a declared array, refuses a legal program.
- **(d) shows the component that owns the grammar is silent by construction.**
  It is wired at all three positions, runs over the same bytes, and reports its
  three position rules unchanged.
- **(e) bounds the terminator question.** `<` and `>` are legitimate `Type`
  punctuation whose depth handling is a separate mechanism; a stop-set change
  has to say what it does with them.
- **(f) is the duplicate separation, measured.** The schema-field row is 0061's
  and its consequence is a lowered `{}`; the `params:` row is 0059's and its
  consequence is a rendered binder line; the `@<T>` row is a different capture.
  This report's three positions produce a `CompatType`, which is a third
  mechanism.
- **(h) means the blast radius over the committed corpus is empty**, so the
  GOV-15 question is entirely about author files outside the tree.

## Expected behaviour

Defined for what the text must be; undefined for what happens when it is not.

- **The grammar closes the admitted set, and closes it identically at these
  three positions.** `grammar.md:90–95` gives `Type` as `PrimitiveType` |
  `NamedType` | `GenericType` | `ObjectType` | a union | `LiteralType`; `:89`
  gives `ReturnType ::= Type | "void"`; `:77` and `:140` put a bare `Type` in
  the `let` annotation and the `fn` parameter slots; `:105` lists all three
  among the bare-`Type` positions and adds "The grammar is otherwise identical
  in every position"; `type-system.md:15` states "The same type grammar applies
  in every type-annotation position". `integer--`, `integer%`, `--`,
  `--integer`, `int--eger` and `thisisnotatype` are derivable from none of the
  six alternatives, at any position.
- **`NamedType` is an `Ident`.** `grammar.md:98` is `NamedType ::= Ident`.
  `integer--` is not an `Ident`, so recording it as `{kind:"named",
  name:"integer--"}` asserts a production the grammar does not have. Bug 0044's
  fix (0.54.0) settled the same point for reserved-keyword text at the
  positions that resolve names: text that is not an `Ident` is not a
  `NamedType`, and treating it as one is a defect whatever the consequence.
- **No registered row covers the input.** Five rows were assessed at HEAD.
  `theta/parse/increment-decrement` (`code-registry-parse.md:33`) triggers on
  "`++` or `--` operator used", which is position-unqualified and therefore
  arguably already reaches `integer--` — but it reaches two of the twenty-two
  measured trailers, and its *Message* (`'<op>' operator is not supported`) and
  Hint (`Use count += 1 / count -= 1`) are false for `integer%`. `theta/parse/
  unresolved-named-type` (`:90`) triggers on "A `NamedType` that resolves to no
  declaration usable at the position it is written" and its *Trigger* names a
  closed five-position list that excludes all three positions here; `integer--`
  is not a `NamedType` on top of that. `theta/parse/malformed-alias-rhs` (`:87`)
  is scoped to a `schema X = …` declaration. `theta/parse/unsupported-feature`
  (`:27`) renders `<construct>` from the closed table at
  `placeholder-rendering-a.md`. `theta/load/params-type-not-expression`
  (`code-registry-load.md:19`) is the corpus's only "not a theta type
  expression" row and rules itself out in its own text: "A scalar is admitted
  whatever text it carries: this row judges the node's shape, not its text."
  The registry is closed (DIAG-2, `diagnostic-shape.md:72`), so the absence is a
  spec gap and the disposition is this report's deliverable.
- **What is not open.** Silence plus an opaque `named` type satisfies neither
  reading of the corpus. Either the text is refused with a registered code and
  the theta does not register, or it is admitted — and if it is admitted, some
  spec sentence has to say what a `let` annotation carrying `integer--` *means*,
  which no sentence does. The measured state instead converts a mistyped
  annotation into a silent, unresolvable nominal reference that suppresses seven
  rejections and falsifies an eighth. That is the third possibility no page
  contemplates.
- **A registered message must not carry unparsed source.**
  `theta/parse/non-array-iterand`'s *Message* is `'for' expects array<T> after
  'in'; got <type>` (`code-registry-parse.md:64`, mirrored
  `docs/reference/diagnostics.md:110`). `<type>` renders a type; `array<string>--`
  is not one. DIAG-4 makes the column normative, so a fix that leaves the
  capture reachable by `displayType` leaves a normative placeholder rendering
  non-type text.

## Actual behaviour / root cause

Four components see this text. One decides extent, one decides three position
rules, one converts anything to a nominal reference, and the last gates on
`kind`.

1. **The capture asks where, not what.** `parseType`
   (`theta-document.ts:2944–3066`) joins the current token unconditionally
   (`:3055`). At the three positions this report owns, its stop set is exactly
   `stmt-sep` (`:2968–2970`), a depth-0 `,` / `)` / `{` / `}` / `=`
   (`:3011–3021`) and — return slot only — a depth-0 `with` (`:3022–3034`, bug
   0005 (a)). The `stopAtFieldBoundary` value-token stop (`:3035–3045`) is
   passed only by the two schema positions, and the three
   `aliasArmBoundary` stops (`:2972–2980`, `:2991–3000`, `:3001–3010`) only by
   the alias position. Arithmetic, comparison, logical, ternary, member-access
   and stray punctuation are in no set at any position, and a string or number
   literal is stopped only in field-boundary mode. Nothing in the loop asks
   whether the accumulation derives from `Type`. The parser class holds
   `this.diagnostics`, so this is a missing judgement, not a missing sink.
2. **The seam that owns the grammar is a position-check pass.**
   `parseTypeExpression` (`type-grammar.ts:108–123`) is wired at all three
   positions (`theta-document.ts:6041`, `:6116`, `:6122`). It returns `[]` when
   its tolerant parser yields no node (`:117–119`) and otherwise walks for
   `void`, generic arity and `Result` only (`:121`). Three tolerances make that
   structural: `parse()` does not require the stream to be consumed
   (`:253–256`), `parsePrimary` skips unexpected punctuation by design
   (`:295–297`), and `parseUnion` / `parseObject` break out of their loops on a
   failed arm or field (`:264–270`, `:342–376`). `"void--"` therefore emits
   exactly what `"void"` emits.
3. **The converter maps anything to a nominal reference.**
   `annotationToCompatType` (`type-layer-checks.ts:482–504`) tries a top-level
   union split (`:488–494`), `/^array<(.+)>$/` (`:495–499`) and
   `PRIMITIVE_NAMES` (`:500–502`), then returns `{ kind: "named", name: text }`
   (`:503`). Its doc comment scopes that arm to "a `NamedType`, an inline object
   type" (`:477–480`) — forms the grammar admits whose resolution is deferred —
   and there is no test that the text is one of them. `integer--` fails the
   primitive set on the `-`, fails the array regex on the trailing bytes, and
   lands on `:503`. The one input the converter refuses is the empty string
   (`:484–486`), and even that refusal is absorbed: `walkFn` (`:738`) falls back
   to `{ kind: "named", name: p.type }`, so an unconvertible parameter
   annotation is a `named` type either way.
4. **The gates then decide on `kind`, and a `named` kind means defer.** A
   `named` type the `TypeEnv` cannot resolve is the shape the `⊑` engine treats
   as deferred, which is correct for a forward reference and wrong for junk. Six
   gates therefore decline (`checkLetRhsCompat`, the array-element check, the
   method-call arm at `:1409–1433`, the condition classifier, the index-receiver
   classifier, and `checkSubagentReturnAnnotation` at `:792–800`) and one
   proceeds on the false branch: `checkForIterand` (`control-flow.ts:51–66`)
   tests `kind === "array"` (`:55`), finds `named`, and emits with
   `displayType(iterand.type)` (`:64`) — printing the capture.
5. **Bug 0083's fix propagates the opacity.** The `let` annotation is recorded
   as the binding's type (`type-layer-checks.ts:601–604`), so a junk annotation
   is not confined to the declaring statement: every later use of the binding
   consults the opaque `named` type, which is why group (c)'s
   `let b: string = a` pair is silent.
6. **`unfoldAlias` cannot help, and bug 0089's fix therefore does not reach
   this.** `unfoldAlias` (`type-compat.ts:155–172`) walks the alias chain and
   returns the current type when the name resolves to nothing or to a non-alias
   (`:164–167`). `array<string>--` resolves to nothing, so unfolding is the
   identity and every row of group (c) is unchanged by 0089.
7. **Registration has no other gate.** `hasLoadParseError`
   (`production-composition.ts:2045–2052`) tests error severity over
   `theta/load/*` and `theta/parse/*`; the registration test is
   `!diagnostics.some((d) => d.severity === "error")` (`:1560`). These inputs
   emit nothing, so the theta registers and runs with its declared constraints
   unenforced.

The mechanism is one gap between four locally defensible decisions: a capture
whose job is extent, a check pass whose job is three position rules, a converter
whose fallback exists for deferred names, and gates that read `kind`. No
component is positioned to ask whether the author wrote a type.

## Why it matters

- **Seven registered rejections stop firing on a production path.** Measured:
  `let-rhs-type-mismatch`, `array-element-type-mismatch`, `unknown-method`,
  `non-boolean-condition`, `non-indexable-receiver`, `non-string-array-join` and
  `invoke-return-type-mismatch`. Each is an `E`-severity row whose whole purpose
  is to refuse the program at load; one trailing punctuation character on the
  annotation removes it, and the theta registers.
- **The trigger is a plausible typo, not an exotic input.** `integer--`,
  `integer-`, `integer%` and `integer.` are what a stray keystroke, a
  copy-paste from another language, or a half-deleted `array<…>` leaves behind.
  The author gets no signal at all; the annotation reads as accepted.
- **A declared array iterand is refused, and the message prints source.**
  `fn f(xs: array<string>--)` with `for x in xs` draws
  `non-array-iterand … got array<string>--`. The program is legal on the
  author's reading, the rejection names a type that does not exist, and DIAG-4
  makes the `<type>` placeholder's rendering normative.
- **The opacity outlives the annotation.** Because bug 0083's fix records the
  `let` annotation as the binding type, `let a: integer-- = 3` makes every later
  use of `a` unchecked — measured for a method call, a condition, an index and a
  second annotated binding.
- **`fn` parameters carry it into the whole body.** `walkFn` (`:738`) seeds the
  body scope from the annotation, so one junk parameter type disables the
  method, condition, index and join gates for every use of that parameter in the
  function.
- **The `--` sub-case is a wrong observable in a shipped fix's blast radius.**
  Bug 0084 (0.71.0) wired `theta/parse/increment-decrement` at the expression
  walk and recorded the type positions as still silent. Whichever way the
  registry question in §Fix is answered, `fn f(n: integer--)` currently
  contradicts a *Trigger* that reads "`++` or `--` operator used" without
  qualification (`code-registry-parse.md:33`) — and `integer%` shows that fixing
  only that contradiction leaves twenty spellings behind.
- **These inputs are inside the GOV-15 loads-cleanly set.** Every fixture in
  groups (a)–(c) loads with zero `E`-severity diagnostics
  (`source-language-stability.md:9`), so a later refusal is a stability question
  needing the [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`), whose in-scope input set is defined post-hoc over the diff.
- **Nothing in the suite scores it.** No test drives a junk-suffixed annotation
  at any of the three positions, and the census found zero committed fixtures in
  the class, so neither `tests/committed-fixture-parse-gate.test.ts` nor bug
  0084's 25-cell witness meets one of these inputs.

## Non-goals

- **The two schema `Type` positions.** A `schema` body field type and a
  `schema X = …` alias arm are bug
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)'s,
  together with the permissive-`{}` lowering and the AJV consequence that only
  those positions have. Group (f) measures them as contrast rows and claims
  nothing about their disposition. The shared capture is the coordination
  surface, stated in §Fix (e).
- **The `params:` position.** Non-type text through a `params:` scalar is bug
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s,
  including the recorded `BypassParamsField.type` and the binder `Parameters:`
  render. That position does not reach `parseType`.
- **The `@<T>` query annotation.** Its capture is the inline depth loop at
  `theta-document.ts:4400–4414`, a different site with its own registered
  empty-interior rejection (`theta/parse/empty-query-annotation`, bug 0014).
  Group (f) records that `@<Ghost-->` suppresses
  `theta/parse/unresolved-named-type` at one of that row's own five positions;
  the disposition of that suppression belongs with whoever owns that capture,
  not here.
- **Case at a reference position.** Whether a lowercase `NamedType` owes
  `theta/parse/schema-case-mismatch` is bug
  [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s. This
  report's inputs are not `Ident`s at all, and `Cat--` is measured silent under
  either of 0051's dispositions.
- **How a recorded parameter type is consumed at the iterand and join gates.**
  Bug [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md)'s, for an
  alias-typed parameter. This report measures the same two gates with a
  junk-suffixed annotation and shows 0089's fix does not move those rows;
  neither fix substitutes for the other.
- **The `<` / `>` capture over-run.** Group (e) measures a trailing `<` or `>`
  at a `fn` parameter or return slot absorbing the body and the following
  statement with zero diagnostics. The mechanism is the unfloored depth counter
  (`:3046–3054`) plus the lexer's trailing-trigger continuation, not the
  accepted-terminator set; 0061 §Non-goals records the alias-position analogue
  as unfiled and out of frame, and the same holds here. A terminator-set change
  must state its disposition (§Fix (f)) without owning it.
- **The silently-accepted junk parameter name.** `fn f(n: integer})` yields a
  second parameter named `}` with zero diagnostics (group (a)). The annotation
  capture stopped correctly; what accepts `}` as an `Ident` is the parameter
  loop at `:2164–2183`. Unfiled, and a different frame.
- **The trailing comma in a `fn` parameter list.** `fn f(n: integer,)` is
  admitted, and `grammar.md:139` (`FnParams ::= FnParam ("," FnParam)* ","?`)
  admits it. Not a defect; recorded so the group (a) row is not misread.
- **The unwired ordinary-`fn` return-type check.** `fn f(): integer { "x" }` is
  silent at HEAD (group (c) control), so the return position's junk costs
  nothing there. Why an ordinary `fn`'s return annotation is not compat-checked
  is a separate question; this report claims only the `subagent fn` loss.
- **The unreachable `checkFnArgCompat`.** Bug
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s.
  Group (f) measures the call-site pair unchanged in both directions.
- **Whether `{}` should ever be a lowering.** Bug
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory question, fixed at 0.38.0 for its own positions and not reopened.
- **`--` in `match` pattern position.** Bug
  [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md)'s, from the
  same residual list. A pattern is not a `Type` position and `parsePattern` is
  not `parseType`.
- **Diagnostics discarded inside a `@`-template interpolation.** Bug
  [0122](./0122-template-interpolation-diagnostics-discarded.md)'s, likewise
  from the same residual list.

## Fix

**Not settled. This report exists to pin the emission point and the registry
disposition before code lands.** Three routes are available, they are not
equivalent in blast radius, and the choice interacts with two open reports on
the same capture. Six questions have to be answered; (e) orders the work.

**(a) Route 1 — tighten `parseType`'s accepted terminator set and emit at the
capture.** The judgement lands where the junk is admitted
(`theta-document.ts:2944–3066`), the parser class already holds
`this.diagnostics`, and the refused set is exactly enumerable from group (a):
the twenty punctuation trailers, plus a string or number literal at the two
positions that do not pass `stopAtFieldBoundary`. Its cost is that `parseType`
is **shared**: the same function serves 0061's alias arm (`:2408`) and schema
field type (`:2581`), whose current dispositions 0061 §Fix constraint 7 already
claims as pins it intends to move
(`tests/schema-alias-rhs-malformed.test.ts:1267–1305`, `:1307–1316`;
`tests/schema-alias-union-decl.test.ts:2235–2241`, `:2409–2416`). A stop-set
change also has to decide the `<` / `>` rows of group (e), which no other route
touches. And a stop that merely *ends* the capture without emitting converts
silence into a different silence: group (a)'s `}` / `{` / `=` parameter rows are
what the existing structural stops already produce.

**(b) Route 2 — validate the captured string at the type layer.** Two
sub-points, and they differ:

1. **At `parseTypeExpression` (`type-grammar.ts:108–123`).** It already owns the
   grammar, already receives the `TypePosition` and the site, and is already
   wired at all three positions. Making it report non-derivability means
   removing the three tolerances — requiring `parse()` to consume the token
   stream (`:253–256`), replacing `parsePrimary`'s punct skip (`:295–297`) with
   a reported failure, and replacing the `parseUnion` / `parseObject` loop
   breaks (`:264–270`, `:342–376`). Its blast radius is **every** caller,
   including 0061's two schema positions (`theta-document.ts:5787`, `:6201`) and
   the `@<T>` response annotation (`:6503`), so this route cannot be scoped to
   this report's positions without a per-position switch.
2. **At `annotationToCompatType` (`type-layer-checks.ts:482–504`).** The
   narrowest surface, but note what `undefined` already means there: the `let`
   path treats it as "defer" (`:601–604`) and `walkFn` re-mints the junk as a
   `named` type (`:738`). Returning `undefined` for a non-derivable source
   therefore changes nothing observable unless the three consumption sites also
   change. A distinguished third answer, or a separate recogniser called beside
   the converter, is what this sub-route actually needs.

**(c) The registry question — DIAG-2, and it must be answered before code.**
Five rows were assessed against the measured input class (§Expected behaviour)
and none fits as written:

- `theta/parse/increment-decrement` (`code-registry-parse.md:33`) has a
  position-unqualified *Trigger* and so arguably already admits `integer--`, but
  it covers two of twenty-two spellings and its *Message* and Hint are false for
  the rest. Using it is what re-creates the operator-specific framing this report
  exists to reject.
- `theta/parse/unresolved-named-type` (`:90`) is wrong twice over: its *Trigger*
  names a closed five-position list excluding all three positions here, and
  `integer--` is not a `NamedType` (`grammar.md:98`) — the exact overreach bug
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s fix
  removed at 0.54.0.
- `theta/parse/malformed-alias-rhs` (`:87`) is scoped to a `schema X = …`
  declaration and its *Message* names "the declaration's line".
- `theta/parse/unsupported-feature` (`:27`) would need a new freeform tail in the
  closed `<construct>` table at
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md`, a GOV-7 / GOV-8
  table edit with its own reconciliation debt (bug 0063).
- `theta/load/params-type-not-expression` (`code-registry-load.md:19`) is the
  corpus's only "not a theta type expression" row and excludes itself by text
  ("this row judges the node's shape, not its text") as well as by phase and
  position.

So the disposition is a **new row** or a **widened *Trigger***, either way a
DIAG-2 operation landing in the same commit as the site it is raised from
(`diagnostic-shape.md:72`), dispositioned by GOV-15's diagnostic-registry
carve-out "as an addition for inputs newly brought into the code's emission set"
(`source-language-stability.md:25`) — so the *Trigger* prose **is** the post-hoc
in-scope set and must enumerate the refused spellings. The owning spec sentences
are `grammar.md:105` and `type-system.md:15`, with the `docs/reference/`
mirrors (`docs/reference/grammar.md:176–205`,
`docs/reference/type-system.md:22`, `docs/reference/diagnostics.md`) co-edited in
the same commit. DIAG-4 (`:74`) forbids rewording any existing *Message*.

**(d) Route 3 — accept the leniency and document it.** Available in principle
and expensive in text: it needs a sentence saying that a type annotation may
carry trailing text and what that text means, which contradicts `grammar.md:105`
("The grammar is otherwise identical in every position") and
`type-system.md:15`, and it would have to say what an opaque `named` type named
`integer--` denotes to the seven gates that currently defer on it. Recorded so
the adjudication is between three options rather than two; nothing in the corpus
currently supports it.

**(e) Ordering and coordination — binding.**

- **Bug [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) is landing in
  this working tree now**, and it changes `checkForIterand`'s signature
  (`control-flow.ts:51–66` gains a `TypeEnv`) plus the `array.join` guard's
  input (`type-layer-checks.ts:1416`). Both are gates this report measures. The
  two fixes do not overlap in behaviour — `unfoldAlias` returns an unresolvable
  `named` intact (`type-compat.ts:164–167`), so every row of group (c) is
  invariant under 0089 — but they collide in source. **0089 lands first**; this
  fix cites its post-fix signatures and re-derives group (c) at the 0089
  baseline rather than at `36540b09`.
- **Bug [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)
  shares the capture.** If route (a) is taken, `parseType`'s stop set is one
  object serving five positions and the two changes must not be written
  independently: either 0061 lands first and this fix extends its terminator
  judgement to the default mode, or this fix lands first and 0061 re-derives its
  §Reproduction over the tightened capture. If route (b) is taken the two fixes
  are on disjoint files and only their §Reproduction tables interact. **State
  which, before coding.** 0059 is a third reader of the same input class at a
  position that reaches neither surface; its §Fix chooses the lowering sink, so
  it does not order against this one.
- **Bug 0084's 25-cell witness must stay green.**
  `tests/increment-decrement-wiring.test.ts` pins `theta/parse/increment-decrement`
  at ten expression positions (r1–r10), three sibling controls (c1–c3), four
  accepted spellings including a `--` in `@`-template prose, a `//` comment and
  string literals (s1, s2, s5–s7), two byte-adjacency rows (s3, s4), two
  severity rows and two registry rows. None is in type position, so none should
  move; a fix that reaches into the lexer's `twoCharOperators`
  (`lexer.ts:175–177`) rather than the type positions would move s5–s7 and is
  wrong for that reason.

**(f) Constraints on any implementation.**

1. **Exactly one diagnostic per offending annotation, and no cascade.** An input
   that already draws a code keeps it and gains at most one: `let a: void-- = 3`
   keeps `void-in-non-return-position`,
   `let a: array<integer, integer>-- = [1]` keeps `generic-arity-mismatch`,
   and `let a: integer-- = 3` followed by `for x in a` must not produce both a
   refusal and the false `non-array-iterand`.
2. **The refused set is enumerated and the *Trigger* states it.** From group
   (a): the twenty punctuation trailers at all three positions, a string or
   number literal trailer at the `let` / parameter / return slots, and from
   group (b) the leading (`--integer`), interior (`int--eger`), doubled
   (`integer--%%`), spaced (`integer --`), bare (`--`) and prose
   (`thisisnotatype`) spellings, at the `.theta` and `.thetalib` spellings and
   through the `subagent fn` / `with` form, plus the same text one level down
   inside a generic argument (`array<integer-->`), a union arm
   (`integer-- | string`) and an inline object field (`{ b: integer-- }`).
3. **The empty annotation is a separate answer.** `let a: = 3` captures `""`,
   which `annotationToCompatType` already refuses (`:484–486`). A recogniser
   must state whether the empty capture is refused, admitted, or left as it is;
   the `@<T>` position's equivalent has its own registered row
   (`theta/parse/empty-query-annotation`, `theta-document.ts:4428–4437`) and
   this position has none.
4. **Controls keep their bytes.** Group (g): `integer`, `array<integer>`,
   `integer | string`, `{ b: integer }`, a resolved `NamedType`, `void` at the
   return slot, the `with`-clause form, the `subagent fn` form and the
   `.thetalib` spelling — at all three positions, byte-identical captured
   annotations and byte-identical diagnostic sequences.
5. **Per-position blast radius, stated and measured.** The two schema positions
   and the `params:` position must show byte-identical diagnostic sequences and
   byte-identical lowered documents after the change, or the change states which
   it moves and why. The `@<T>` and `invoke<T>` captures are separate sites
   (`theta-document.ts:4400–4414`) and are not claimed.
6. **The `<` / `>` disposition is stated, not silently changed.** Group (e)
   measures a trailing `<` or `>` at a `fn` slot absorbing the body and the
   following statement with zero diagnostics. A terminator-set change must say
   whether those rows move; if they do, they need their own pinned cells.
7. **The false message is fixed or recorded.** If the refusal denies
   registration, `non-array-iterand`'s `got array<string>--` becomes
   unreachable and the row is closed by construction; if the refusal is a
   warning, or if the gate still runs, `displayType` still prints unparsed
   source into a DIAG-4-normative *Message* and the fix must say so.
8. **GOV-15 and the H9a gates.** Files that load today stop loading, which is
   the diagnostic-registry carve-out's covered effect for the newly in-scope
   inputs (`source-language-stability.md:25`). The census in group (h) is the
   measured blast radius over the committed corpus and must be re-derived at the
   fix baseline rather than assumed: 34 files, **15** annotations at the three
   positions this report owns (10 `let`, 3 `fn` parameter, 2 `fn` return),
   beside 25 schema field types and 0 alias arms at 0061's, and zero offenders
   anywhere. A new `theta/parse/*`
   code un-registers the theta and is absent from
   `tests/fixtures/h7a/permitted-codes.json` (11 entries, none `theta/parse/*`);
   it stays absent unless a committed H9a fixture enters the class, since
   `parseSystemNoteCodes` (`tests/live/acceptance/harness.ts:463–466`) matches
   `theta/(?:load|parse|runtime)/[a-z0-9-]+` and so scores it. Separately, the
   H9a **empty-capture stderr gate** (bug 0030 §Fix,
   `ACCEPTANCE_STDERR_ALLOWLIST` at `harness.ts:479`, currently empty by a
   measured baseline) rejects every non-blank stderr line: a new code must not
   reach stderr on any of the ten H9a spawns, and the allowlist must not be
   populated reactively — that file's own comment (`:468–478`) forbids it.
9. **Test witness — offline, deterministic, provider-free.** Every row of
   §Reproduction settles inside one `parseThetaDocument`, one
   `annotationToCompatType` or one `parseTypeExpression` call, so the harness is
   `tests/helpers/e2e-s1.ts` and the two unit seams. Required: each spelling in
   constraint 2 refused with exactly one diagnostic at each of the three
   positions; group (c)'s seven loss pairs restored, each control and each
   refusal pinned; the false-`non-array-iterand` pair pinned in whichever
   direction the fix chooses; group (d)'s seam rows, which red if a tolerance is
   removed without a decision; group (g)'s controls byte-for-byte; group (f)'s
   cross-position rows byte-for-byte as the anti-widening fence against 0061's
   and 0059's positions; the census re-derived; and every expected message read
   from the registry's *Message* column at runtime rather than restated
   (DIAG-4), as `tests/increment-decrement-wiring.test.ts` already does.

## Provenance

- Origin: the bug [0084](./0084-increment-decrement-check-dead.md) fix
  (0.71.0, commit `9fe13534`), §Fix (0.71.0) residual (iv) (`:240–244`) and
  residual 4 of the local run artefact `.pi/tmp/fixes/0084-report.md`, left
  unfiled by that fix and marked "Filing candidate, scoped to `parseType`".
  The residual names three fixtures (`fn f(n: integer--)`, the return-type form,
  a schema field), two further probed trailers (`integer%`, `integer-`), and the
  conclusion this report's frame rests on: "this is generic pre-existing
  `parseType` leniency toward trailing punctuation in the captured annotation
  string, not specific to this pair, and not created or worsened here." This
  report files it and adds what the residual does not state: the full
  twenty-two-trailer boundary at three positions with the structural stop set
  measured against it; the leading, interior, doubled, spaced, bare, prose and
  empty spellings; the captured annotation strings verbatim; the
  `annotationToCompatType` conversion table and the opaque-`named` result; the
  seven registered rows measured lost with their controls; the false
  `non-array-iterand` emission and its message; the propagation past a recorded
  `let` binding and through an `fn` body scope; the `subagent fn` return row;
  the type-grammar seam's silence at all three positions with the three
  tolerance points that cause it; the `<` / `>` over-run; the duplicate
  separation against 0061, 0059 and the `@<T>` capture measured row by row; the
  committed-corpus census; and the three-route §Fix with the 0089 and 0061
  ordering constraints. Residuals (ii) and (iii) of the same list are filed
  separately as bugs
  [0122](./0122-template-interpolation-diagnostics-discarded.md) and
  [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md).
- Spec: `docs/spec_topics/grammar.md:77` (`LetStmt`), `:88–103` (the §Type
  grammar fence — `:89` `ReturnType`, `:90–95` `Type`, `:97` `PrimitiveType`,
  `:98` `NamedType ::= Ident`, `:99–100` `GenericType`, `:101` `ObjectType`,
  `:102` `LiteralType`), `:105` (the bare-`Type` position list and the
  one-grammar sentence), `:107` (the closed generic set and the
  `result-in-schema-position` scope), `:109` (§Inline object types), `:138`
  (`FnDecl`), `:139` (`FnParams`, the admitted trailing comma), `:140`
  (`FnParam`), `:143` (the `: ReturnType` optionality and the body check);
  `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
  position); `docs/spec_topics/schemas.md:17` (the field-type sentence, cited
  for 0061's boundary); `docs/spec_topics/functions.md:20` (FN-1), `:50` (the
  `subagent fn` return-type equivalence);
  `docs/spec_topics/bindings.md:36` (§Increment / decrement, the spec rule
  behind `theta/parse/increment-decrement`);
  `docs/spec_topics/diagnostics/code-registry-parse.md:27`
  (`unsupported-feature`), `:33` (`increment-decrement`), `:34`
  (`non-boolean-condition`), `:38` (`non-indexable-receiver`), `:40`
  (`array-element-type-mismatch`), `:43` (`non-string-array-join`), `:54`
  (`let-rhs-type-mismatch`), `:63` (`unknown-method`), `:64`
  (`non-array-iterand`), `:87` (`malformed-alias-rhs`), `:90`
  (`unresolved-named-type`), `:117` (`invoke-return-type-mismatch`);
  `docs/spec_topics/diagnostics/code-registry-load.md:19`
  (`params-type-not-expression`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/governance/source-language-stability.md:9` (the
  loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing mirrors: `docs/reference/grammar.md:176–205`;
  `docs/reference/type-system.md:22`; `docs/reference/diagnostics.md:79`,
  `:80`, `:84`, `:86`, `:89`, `:100`, `:109`, `:110`, `:139`, `:166`.
- Implementation evidence at `36540b09`:
  `src/parser/theta-document.ts:1963–1966` (the `let` annotation call),
  `:2164–2183` (the parameter loop; `:2180` the parameter-type call),
  `:2198–2200` (the return-type call), `:2408` and `:2581` (0061's two calls),
  `:2944–3066` (**`parseType`** — `:2954` `armComplete`, `:2962–2965` the
  leading-brace arm, `:2966` the loop, `:2968–2970` the `stmt-sep` stop,
  `:2972–2980` / `:2991–3000` / `:3001–3010` the three alias-only stops,
  `:3011–3021` the structural punct stop, `:3022–3034` the `with` stop,
  `:3035–3045` the field-boundary stop, `:3046–3054` the depth counter,
  `:3055` the unconditional join, `:3063` the `armComplete` update,
  `:3065` the return), `:3073` (`consumeInlineObjectType`),
  `:4400–4414` (the `@<T>` capture), `:4428–4437`
  (`theta/parse/empty-query-annotation`), `:4942–4963` (the five-position-list
  doc comment), `:5029` (`unresolvedNamedTypeDiagnostic`), `:6039–6043` /
  `:6113–6127` (the three `parseTypeExpression` calls this report owns),
  `:5787` / `:6201` / `:6503` (the other callers a seam change reaches);
  `src/parser/type-layer-checks.ts:94` (`PRIMITIVE_NAMES`), `:474–504`
  (**`annotationToCompatType`** and its doc comment; `:483` the trim, `:484–486`
  the empty refusal, `:488–494` the union split, `:495–499` the array match,
  `:500–502` the primitive match, `:503` the `named` fallback), `:601–604` (the
  `let` conversion), `:605–615` (`checkLetRhsCompat`), `:734–740` (`walkFn`;
  `:738` the parameter record), `:768–769` (the `subagent fn` return call),
  `:792–800` (`checkSubagentReturnAnnotation`), `:1409–1433` (`checkMethodCall`;
  `:1416` the `join` guard);
  `src/parser/control-flow.ts:44–66` (**`checkForIterand`** — `:55` the `kind`
  test, `:61` the code, `:64` the `displayType` render);
  `src/parser/type-compat.ts:155–172` (`unfoldAlias`; `:164–167` the
  unresolvable-`named` return);
  `src/parser/type-grammar.ts:108–123` (**`parseTypeExpression`**; `:117–119`
  the empty return, `:121` the position walk), `:229–232` (`TypeParser`),
  `:253–256` (`parse()`), `:258–272` (`parseUnion`), `:274–298` (`parsePrimary`;
  `:295–297` the tolerant punct skip), `:342–376` (`parseObject`; the breaks at
  `:361` and `:375`);
  `src/lexer/lexer.ts:175–177` (`twoCharOperators`, `++` / `--` after bug 0084);
  `src/extension/production-composition.ts:1560–1562` (the registration gate),
  `:1749` / `:1933–1935` / `:2092` (the other drop tests), `:2045–2052`
  (`hasLoadParseError`).
- Test evidence at `36540b09`: `tests/increment-decrement-wiring.test.ts` — bug
  0084's 25-cell witness, none of whose cells is in type position;
  `tests/fixtures/h7a/permitted-codes.json` — 11 entries, no `theta/parse/*`
  code; `tests/live/acceptance/harness.ts:463–466` (`parseSystemNoteCodes`),
  `:468–479` (the empty-capture stderr allowlist and its
  do-not-populate-reactively rule); `tests/committed-fixture-parse-gate.test.ts`
  (the zero-diagnostics walk over committed fixtures, none of which is in this
  report's class). **No test in the tree drives a junk-suffixed annotation at
  any of the three positions.**
- Reproduction: scratch vitest at `36540b09` — twenty-two trailers × three
  positions through the real load path with their captured annotations,
  statement kinds and full diagnostic lists; the structural-stop rows; eighteen
  captured-annotation rows including the leading, interior, doubled, spaced,
  bare, prose, empty, `let mut`, union-arm, inline-object, `as`-rename,
  generic-argument, `.thetalib` and `subagent fn` spellings; seventeen
  `annotationToCompatType` rows at its unit seam; fourteen consequence pairs
  across the `let`, `fn`-parameter and `subagent fn`-return positions; the two
  `non-array-iterand` pairs; thirty-five `parseTypeExpression` rows at three
  positions plus five end-to-end confirmations; the five `<` / `>` over-run
  rows; nine controls; the cross-position rows for 0061's two positions, 0059's
  scalar and block forms, the `@<T>` capture with its `Ghost` control pair, five
  `invoke<T>` rows and 0050's call-site pair; and a `git ls-files` census over
  every committed `.theta` / `.thetalib` parsed through the same load path. Run
  on the outputs quoted above, then deleted per scratch policy.
