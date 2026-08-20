# Bug 0175 — The literal sublanguage's `ExprParser.parse()` requires no end of input, so a `params:` default whose LEADING expression is a literal is admitted with everything after it discarded: `integer = 1 2` binds `1`, `string = "a" "b"` binds `"a"`, `array<integer> = [1] x` binds `[1]`, `S = { a: 1 } x` binds `{a: 1}` and `integer = 0x10` binds `16` — a hex form `lexical.md` refuses as `theta/parse/unsupported-feature` — each on a theta that loads with zero diagnostics, behind a `default=1 2` prompt token and a `p=1 (default)` success echo, while `integer = -1x`, `integer = 1x` and `integer = 1_000` recover `NaN` and are refused by the post-default-merge AJV hook one binder model call late

- **Status:** fixed (0.144.0). Residual 2 of the bug 0166 fix (0.91.0, commit `b4b96503`),
  recorded there as `## Fix (0.91.0)` *Residuals* item 2 and in that fix's own
  report (`.pi/tmp/fixes/0166-report.md:297–302`), where the round-1 reviewer
  probed `integer = -1x` and found it loading clean and typing `integer`. §Fix
  is constraint-pinned, not settled: it names four candidate emission points
  with their measured blast radii, the DIAG-2 question the residue's own shape
  raises (the registered row's *Trigger* claims some residues and not others),
  and the mirror contract between the position's two readers that every route
  carries. Ordering: nothing blocks this report from starting, but one route is
  gated —
  [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) is
  open against `checkLiteralSublanguage`'s `node === undefined` fail-open arm
  (`src/parser/literal-sublanguage.ts:62–64`), and a route here that signals
  residue by making `ExprParser.parse()` return `undefined` lands its refusal in
  exactly that arm and refuses nothing (§Fix (b)). Either that route is taken
  only after 0165 closes the arm, or the residue signal is not `undefined`.
- **Sev/Diff estimate:** S1/D3 — S1 because nineteen measured spellings load
  with zero diagnostics and then, under a declared half whose lowered fragment
  admits the recovered value, bind a value the author did not write, end to end
  through the real `runBinder`: `p: 'integer = 1 2'` binds `1`,
  `p: 'string = "a" "b"'` binds `"a"`, `p: 'boolean = true false'` binds `true`,
  `p: 'array<integer> = [1] x'` binds `[1]`, and `p: 'integer = 0x10'` binds
  `16` — a hexadecimal form `lexical.md:28` assigns to
  `theta/parse/unsupported-feature`, which the same bytes do draw in body
  position — each behind a binder system prompt whose line advertises the whole
  residue-carrying span after `default=` and a success echo reporting the
  truncated value; D3 because the parser under change backs three module entry
  points, one of them (`isBareObjectLiteral`) serving a different position, the
  natural residue signal collides with bug 0165's open fail-open arm, the
  registered row's *Trigger* claims the residue for some spellings and not
  others (a DIAG-2 decision), and bug 0166 made the agreement of this position's
  two readers a witnessed invariant that any route must preserve.
- **Kind:** defect — the implementation admits inputs the specification's own
  production set does not derive, and the value that reaches body scope is then
  a truncation or a re-reading of the recorded source. Four elements, each
  measured at HEAD `b4b96503`.
  1. *The parse stops at the first token that cannot continue the expression and
     discards the rest.* `ExprParser.parse()`
     (`src/parser/literal-sublanguage.ts:278–283`) returns `parseTernary()`'s
     node without testing `this.peek() === undefined`, and every loop below it
     breaks on a token it cannot use — `parseBinary` on a non-`punct` token or a
     `punct` with no precedence (`:305–311`), `parsePostfix` likewise
     (`:333–365`). So a residue that could extend the expression is consumed and
     judged (`{ a: 1 } + 1` draws `theta/parse/default-not-literal`), and a
     residue that could not is dropped: `checkLiteralSublanguage` returns `[]`
     for `1 2`, `"a" "b"`, `true false`, `null null`, `[1] x`, `{ a: 1 } x`,
     `-1x`, `1x`, `1.5x`, `0x10`, `0b101`, `1_000`, `1 foo(2)`, `1 ${x}`,
     `` 1 @`q` ``, `-5 # trailing`, `1;`, `-1)`, `-1]`, `-1 true` and
     `"a" junk here` (measured, §Reproduction (b)). `Literal`
     (`docs/spec_topics/grammar.md:14`) and `PrimitiveLit` (`:20–24`) derive none
     of them.
  2. *The compat reader types the leading literal, so the field acquires a static
     type from a fragment of its own source.* `defaultLiteralStaticType`
     (`:673`) runs the same parser and hands the node to `primitiveLiteralType`
     (`:696`), which reads the primitive off the NODE's span, not the field's:
     `1 2` types as `integer`, `"a" "b"` as `string`, `true false` as `boolean`,
     `[1] x` as `array` of `integer` (measured). That is what routes
     `string = 1x` to `theta/parse/params-default-type-mismatch` with `expected
     string, got integer` — a type-mismatch verdict on a form the position's
     grammar does not derive, whose `<actual>` names the type of two of the four
     source characters.
  3. *The invocation-time recovery re-reads the same bytes with a different
     tokeniser and discards its refusals.* `#recoverDeclaredDefaults`
     (`src/extension/production-theta-producer.ts:1240`) parses the recorded
     default with `parseExpressionSource` (`src/parser/theta-document.ts:1169`),
     which lexes through the real theta lexer with an inert `emitDiagnostic`
     (`:1175`). The theta lexer folds a digit/letter/underscore tail INTO the
     number token and reports `theta/parse/unsupported-feature`
     (`src/lexer/lexer.ts:605–629`), keeping the full text on the token
     (`:627`); that diagnostic is dropped here, and `evaluatePureExpression`'s
     `case "number"` returns `Number(expr.text)` (`:5888–5889`). So `0x10`
     recovers `16` and `0b101` recovers `5` where the sublanguage read `0`, while
     `1x`, `1.5x` and `1_000` recover `NaN`. For every other spelling the two
     parsers agree on the leading expression and both drop the residue, so the
     recovered value is the leading literal.
  4. *Whether anything catches it depends on the declared type, and for twenty-two
     measured pairings nothing does.* The post-default-merge AJV hook bug 0066
     wired (`#mergeDeclaredDefaults`, `:1203`, through
     `fillDefaultsAndRevalidate`, `src/binder/defaulting.ts:117`) validates the
     merged args, so the three `NaN` rows are refused at invocation
     (`/p must be integer`) — one binder model call late, naming the merged
     value's JSON type rather than the source's form. Every row whose truncated
     value satisfies the lowered fragment binds and runs (measured,
     §Reproduction (e)).
- **Related:**
  - **0166** —
    [`0166-unary-minus-default-admits-non-numeric-literal.md`](./0166-unary-minus-default-admits-non-numeric-literal.md),
    **fixed (0.91.0)**, the filing origin. **Boundary.** Its class is unary `-`
    over a NON-numeric literal (`-true`, `-"x"`, `-null`); this report's operand
    is numeric and the fault is the residue. Its fix narrowed
    `firstNonLiteral`'s and `primitiveLiteralType`'s `neg` arms through one
    shared `isNumericLiteralOperand` (`src/parser/literal-sublanguage.ts:493`),
    which moves no row here: `-1x`'s operand IS `-1`'s operand, so the arm admits
    and the residue is judged by nothing (measured post-fix, §Reproduction (b)).
    The separating observable is the operand: every row of 0166's class carries
    a `neg` node whose operand is a non-numeric literal, every row here parses to
    a node the sublanguage admits and leaves tokens behind it. Its round-1
    reviewer found this row and its `## Fix (0.91.0)` *Residuals* item 2 hands
    the filing to the parent. Its §Fix (d) measured the module-wide route this
    report's §Fix (b) re-measures.
  - **0165** —
    [`0165-empty-params-default-literal-admitted-and-never-bound.md`](./0165-empty-params-default-literal-admitted-and-never-bound.md),
    **open** (`- **Status:** open.` at HEAD `b4b96503`). **Boundary, and one
    route's gate.** 0165 owns the default source that parses to **no node**
    (`""`, whitespace-only): `ExprParser.parse()` returns `undefined` and
    `checkLiteralSublanguage` returns `[]` at `:62–64` before `firstNonLiteral`
    runs, nothing is recovered at invocation, and the body reads `null`. This
    report owns a source that parses to a node AND leaves tokens behind it: the
    node is judged and admitted, a static type is established, and a value is
    recovered and filled for every row. The separating observable is the parse:
    `parse()` yields `undefined` for 0165's rows and a node plus unconsumed
    tokens for every row here. The two meet at one point — the `undefined`
    channel is 0165's fail-open arm, so a route here that signals residue by
    returning `undefined` from `parse()` inherits that hole (§Fix (b)(f)).
    Whichever lands second rebases onto the other's hunks in the same function.
  - **0042** —
    [`0042-schema-decl-same-line-residue-silent.md`](./0042-schema-decl-same-line-residue-silent.md),
    **fixed (0.52.0)**, the same defect one position over and the registered
    precedent for the remedy. It owns same-line residue after a grammatically
    complete `schema X = …` right-hand side (`schema X = Cat Cat`,
    `schema X = string "junk"`, `schema X = array<integer> 42`), which now draws
    `theta/parse/malformed-alias-rhs` — a registered row whose *Trigger* spells
    a *Same-line residue* clause with a boundary-token enumeration
    (`docs/spec_topics/diagnostics/code-registry-parse.md:89`). That row governs
    the TYPE half of a declaration; the `params:` field's DEFAULT half, the one
    position the literal sublanguage owns, has no equivalent. §Fix (c) is that
    row's shape applied here.
  - **0124** —
    [`0124-parsetype-trailing-punctuation-leniency.md`](./0124-parsetype-trailing-punctuation-leniency.md),
    **open**, the sibling leniency at the three non-schema `Type` positions
    (`integer--`, `integer%`), where the capture JOINS the trailing punctuation
    into the annotation instead of dropping it. Same family — a capture that
    does not require its input to end — and disjoint on the position and the
    disposition: 0124's positions keep the junk and lose seven type-layer
    refusals, this position discards the junk and keeps a value. Neither fix
    reaches the other's capture (`parseType` versus this module's `ExprParser`).
  - **0059** —
    [`0059-params-scalar-nontype-text-recorded-and-permissive.md`](./0059-params-scalar-nontype-text-recorded-and-permissive.md),
    **fixed (0.86.0)**, the type-half refusal and the suppression guard every
    route here must leave intact (`src/parser/params.ts:349`; the third
    precedence rule of `code-registry-load.md:19`). Its cell f1
    (`tests/params-scalar-nontype-text-refusal.test.ts:1075`,
    `pick one = or two`) pins a junk type half at exactly one diagnostic with the
    default-side checks suppressed, and its cell f2 (`:1087`,
    `string = totally junk`) pins the one-directionality — that row's default
    half is already refused because its LEADING node is an identifier, and its
    message interpolates `totally` alone, the residue `junk` never appearing.
    Both cells constrain every route below.
  - **0066** —
    [`0066-ajv-verdict-discarded-unreachable-enforcement.md`](./0066-ajv-verdict-discarded-unreachable-enforcement.md),
    **fixed (0.88.0)**, this report's substrate. Two of its shipped seams frame
    the measurements: `defaultLiteralStaticType` / `primitiveLiteralType`
    (`src/parser/literal-sublanguage.ts:673`, `:696`), the load-time compat gate
    that makes `string = 1x` loud, and the post-default-merge AJV hook, which is
    what makes the three `NaN` rows loud at invocation instead of silent.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/parser/literal-sublanguage.ts` grew 741 → 767 lines at bug 0166 with
    the insertion at `:493`, so every pre-0.91.0 citation into it below that
    point is shifted by 26; `src/parser/params.ts` is 1226 lines and
    `src/extension/production-theta-producer.ts` 6165 at this HEAD. Every
    volatile position below is named by symbol beside its line.
- **Affected** (every citation re-verified against the tree at HEAD `b4b96503`,
  v0.91.0; symbols named beside lines):
  - **The parser that does not require end of input.** `ExprParser` (`:256`),
    its `parse()` (`:278–283`, the whole defect: an emptiness test and then
    `return this.parseTernary()`), `parseBinary`'s break arms (`:305–311`),
    `parsePostfix`'s (`:333–365`), `parsePrimary` (`:386`), `parseArray`
    (`:437`) and `parseObjectBody` (`:454`), which terminate on their closing
    bracket and leave the cursor wherever it stands. `tokeniseExpr` (`:122`) and
    its numeric scan (`:207–215`), which accepts only `[0-9]`, `.`, `e`, `E` —
    so `0x10` tokenises as the number `0` followed by the identifier `x10` and
    `1_000` as `1` followed by `_000`.
  - **The three entry points that run it.** `checkLiteralSublanguage` (`:54`),
    its `parse()` call (`:61`), its `node === undefined` fail-open arm (`:62–64`,
    bug 0165's subject), its `firstNonLiteral` call (`:65`) and its
    `theta/parse/default-not-literal` emission with the offending span
    interpolated (`:69–78`); `defaultLiteralStaticType` (`:673`) and its design
    note (`:633–672`), `primitiveLiteralType` (`:696`), `flatArrayStaticType`
    (`:726`), `literalPrimitiveOf` (`:754`); `isBareObjectLiteral` (`:90–95`),
    whose verdict is `node.kind === "object"` with no residue test (`:94`).
    `LiteralPosition` is the single value `"default"` (`:40`).
  - **The position that runs two of them.** `parseParams`
    (`src/parser/params.ts:154`): the bug-0059 type-half suppression guard
    (`:349`), the raw-newline refusal (`:353`), the `checkLiteralSublanguage`
    call (`:363`), the one-diagnostic-per-field precedence guard (`:375–377`),
    the `paramsDeclaredCompatType` / `defaultLiteralStaticType` pairing
    (`:378–381`), the `checkParamsDefaultCompat` call (`:386`) and the error gate
    (`:399`).
  - **The compat sink.** `paramsDeclaredCompatType`
    (`src/parser/type-compat.ts:733`) and `checkParamsDefaultCompat` (`:779`),
    which emits `theta/parse/params-default-type-mismatch` for `string = 1x`.
  - **The record and the render.** `splitParamValue`
    (`src/parser/frontmatter.ts:636`), which records the default half verbatim
    after a trim — measured `defaultSource` `"1 2"`, `"[1] x"`, `"0x10"` — and
    `hasDefault: defaultSource !== undefined` (`:796`); `BypassParamsField`'s
    `defaultSource` contract, "verbatim from the `params:` scalar"
    (`src/binder/binder-envelope.ts:174–180`); `binderPromptParamField`
    (`src/extension/production-theta-producer.ts:633`);
    `renderBinderParamLine` (`src/binder/binder-system-prompt.ts:168`) and
    `buildBinderSystemPrompt` (`:285`), which put the recorded source after
    `default=` verbatim — measured `p (integer) default=1 2` and
    `p (integer) default=0x10`; `classifyBinderBypass`
    (`src/binder/binder-envelope.ts:204`), which returns `binder` for every
    fixture here, so the model call is unconditional.
  - **The invocation seam.** `runBinder`
    (`src/extension/production-theta-producer.ts:685`), the system-prompt build
    (`:767`), the merge call (`:870`), the verdict routing (`:877`) and the
    success echo (`:885`); `#mergeDeclaredDefaults` (`:1203`);
    `#recoverDeclaredDefaults` (`:1240`), its `splitParamDefaultSource` call
    (`:1272`, the function at `:5673`), the `parseExpressionSource` null-skip
    (`:1276`) and the `evaluatePureExpression` fill (`:1280`);
    `evaluatePureExpression` (`:5886`) and its `case "number": return
    Number(expr.text)` (`:5888–5889`); the synthetic-`null`-left unary arm
    (`:6126–6127`); `parseExpressionSource`
    (`src/parser/theta-document.ts:1169–1180`) and its inert `emitDiagnostic`
    (`:1175`); the theta lexer's abutting-tail arm (`src/lexer/lexer.ts:605–629`,
    the `theta/parse/unsupported-feature` push at `:620–626` and the full-text
    token at `:627`); `fillDefaultsAndRevalidate`
    (`src/binder/defaulting.ts:117`); `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:90`).
  - **The other consumer of the same parser, and why the tolerance does not
    reach it today.** `isBareObjectLiteral`'s only `src/` importer is
    `src/runtime/tool-call.ts` (`:59`), which reads it in the Pi-tool argument
    SHAPE arm (`:226–227`). That arm is gated on
    `input.argumentSource !== undefined`, and **no `src/` caller of
    `checkToolCallArguments` supplies `argumentSource`**: the whole-document walk
    passes only `positionalCount` for the arity arm
    (`src/parser/theta-document.ts:5595–5615`) and states why — the shape arm
    "is gated on an `argumentSource` this walk never supplies (it owns AST
    nodes, not source text), so it is structurally unreachable from here" — and
    keeps its own AST-based shape test instead (`:5399–5405`); the two
    `invoke-static-checks.ts` call sites (`:1030`, `:1122`) pass
    `staticResolution` / `schemaFieldStaticTypes` and no source text. So the
    tolerance is latent, not live, on that path: `isBareObjectLiteral("{ a: 1 }
    x")` is `true` (measured, §Reproduction (b)), but nothing in production asks
    it. It is a blast-radius fact for §Fix (b), not a second live defect.
  - **The committed cells a fix must not red.**
    `tests/e2e-s1-grammar-literal-sublang.test.ts:27` (`-5`), `:35`
    (`Severity.High`), `:44` (`a.b.c`) and `tests/type-grammar.test.ts:132`
    (`a + b`), `:150` (`{ k: f(x) }`) — five fixed sources, none carrying
    residue. `tests/binder-param-line-newline-normalisation.test.ts:850`, `:902`
    call `checkLiteralSublanguage` on rendered default literals and assert no
    `default-not-literal`. `tests/params-default-unary-minus-non-numeric-refusal.test.ts`
    group C (`:605–652`, cells c1–c8 refused-and-untyped, c9–c11
    admitted-and-typed) is the mirror-contract witness bug 0166 proved genuinely
    reds; its group D controls (`:659–730`) pin `integer = -1`, `number = -1.5`,
    `integer = -1.5` and `checkLiteralSublanguage("-5", …)`.
    `tests/params-default-type-compat.test.ts:396` (cell b2, `integer = -1.5`)
    pins the unary-minus decimal at exactly one `theta/parse/integer-narrowing`.
    `tests/params-scalar-nontype-text-refusal.test.ts:1075` (cell f1) and
    `:1087` (cell f2, whose expected message interpolates `totally` and not
    `totally junk`). `tests/params-default-string-literal-raw-newline.test.ts:797–812`
    pins `isBareObjectLiteral`'s four verdicts; `tests/tool-calls.test.ts:171–184`
    drives `checkToolCallArguments` over eight accepted `argumentSource` values
    and `:208` over `args`. None of those sources carries trailing residue
    (read).
  - **Direct callers, counted at HEAD.** `checkLiteralSublanguage` has exactly
    one production caller (`src/parser/params.ts:363`) and eight direct test call
    sites in four files (three in `e2e-s1-grammar-literal-sublang.test.ts`, two
    in `type-grammar.test.ts`, two in
    `binder-param-line-newline-normalisation.test.ts`, one helper at
    `params-default-unary-minus-non-numeric-refusal.test.ts:599`).
    `defaultLiteralStaticType` has one production caller
    (`src/parser/params.ts:381`) and two direct test call sites
    (`params-default-unary-minus-non-numeric-refusal.test.ts:634`, `:647`).
    `isBareObjectLiteral` has one production importer
    (`src/runtime/tool-call.ts:59`) and one direct test call site
    (`params-default-string-literal-raw-newline.test.ts:809`).
  - **Spec.** `docs/spec_topics/grammar.md:9` (the one position and the
    is-literal check), `:14` (the closed `Literal` production set), `:20–24`
    (`PrimitiveLit`), `:48` (*Forbidden inside a literal*), `:51` (the numeric
    carve-out clause); `docs/spec_topics/lexical.md:28` (*Number literals* —
    "Decimal only", "No hex / octal / binary forms and no underscore separators
    in theta 1.0 (those forms surface as `theta/parse/unsupported-feature`)");
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults — the
    admitted set, the violation set, and the fill-before-AJV sentence);
    `docs/spec_topics/diagnostics/code-registry-parse.md:48`
    (`theta/parse/default-not-literal` — *Trigger* and *Message*), `:49`
    (`theta/parse/params-default-type-mismatch` — the decided-set partition and
    the two precedence rules), `:27` (`theta/parse/unsupported-feature`), `:89`
    (`theta/parse/malformed-alias-rhs` — the *Same-line residue* clause);
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`theta/load/params-type-not-expression` and its third precedence rule);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4);
    `docs/spec_topics/binder/binder-bypass-and-envelope.md:142`
    (*Default-literal rendering*);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:9`
    (fill-if-absent), `:11` (the named post-default-merge AJV hook);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
    Reference mirrors: `docs/reference/grammar.md:127` ("No hex/octal/binary and
    no underscore separators (→ `theta/parse/unsupported-feature`)"), `:539`
    ("operators other than unary `-` on a numeric literal"),
    `docs/reference/frontmatter.md:102`.
  - **Corpus census, run at HEAD.** 35 `.theta` / `.thetalib` files in the
    working tree (the 34 bug 0166's census counted plus the untracked
    `.pi/theta/smoke.theta`), 21 of them under `docs/`; 17 declare `params:`;
    exactly one `params:` default exists anywhere — `count: number = 3` in
    `tests/live/acceptance/fixtures/acc-params-binder.theta` — and it carries no
    trailing residue. No file in the tree is in the newly-refused set of any
    route below, so `tests/committed-fixture-parse-gate.test.ts` never meets one.
- **Observed at:** v0.91.0 (`b4b96503`). Offline, deterministic, provider-free:
  one scratch vitest probe with four sections over the shipped load path
  `parseThetaDocument` through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the
  shipped `checkLiteralSublanguage` / `defaultLiteralStaticType` /
  `isBareObjectLiteral` / `parseExpressionSource` seams, the production
  `AjvSchemaValidator` (`src/seams/schema-validator.ts`) built with the shipped
  content-addressing, and the real `ProductionThetaProducer.runBinder` driven
  through `createProductionProducerDeps` with the off-session pi-ai `complete()`
  mocked and an in-memory `FileSystem` backing default recovery (the harness
  pattern of
  `tests/params-default-unary-minus-non-numeric-refusal.test.ts:793–1015`).
  Every value below is that probe's output verbatim; the probe was written, run
  and deleted.

## Summary

The literal sublanguage's parser has no end-of-input requirement.
`ExprParser.parse()` returns whatever `parseTernary()` built and never asks
whether tokens remain, so a default RHS is judged on its LEADING expression
alone. When that expression is a literal, `checkLiteralSublanguage` returns `[]`
and `defaultLiteralStaticType` reports the leading literal's primitive — for
sources the grammar does not derive.

Twenty-four spellings are admitted at HEAD (§Reproduction (b)). The residue takes
every shape: a second literal (`1 2`, `"a" "b"`, `true false`, `null null`), an
identifier (`-1x`, `"a" junk here`), a call (`1 foo(2)`), an interpolation
(`1 ${x}`), a query template (`` 1 @`q` ``), stray punctuation (`1;`, `-1)`,
`-1]`), a comment-like tail (`-5 # trailing`), and residue after a container
(`[1] x`, `{ a: 1 } x`). The fence is precise and is what makes this a residue
defect rather than a general leniency: residue the parser CAN use is consumed
and judged, so `{ a: 1 } + 1` still draws `theta/parse/default-not-literal`.

Three dispositions follow, all measured end to end at HEAD:

- **Loads clean, binds the truncated value.** `integer = 1 2` binds `1`,
  `string = "a" "b"` binds `"a"`, `boolean = true false` binds `true`,
  `array<integer> = [1] x` binds `[1]`, `S = { a: 1 } x` binds `{a: 1}`, and
  `integer = -1 true`, `= 1 foo(2)`, `` = 1 @`q` ``, `= 1 ${x}`, `= -5 #
  trailing`, `= 1;` and `= null null` each bind their leading literal. The
  binder system prompt advertises the whole span (`default=1 2`) and the success
  echo reports the truncation (`p=1 (default)`).
- **Loads clean, binds a value neither reader of the source read.**
  `integer = 0x10` binds `16` and a permissive declared half binds `5` for
  `0b101`. The sublanguage read `0` and typed `integer`; the recovery's theta
  lexer read one number token `0x10`, raised
  `theta/parse/unsupported-feature` — `lexical.md:28`'s row for hex forms — into
  an inert sink, and `Number("0x10")` produced `16`. The same bytes in body
  position (`let v = 0x10`) draw that diagnostic and the theta does not load.
- **Loads clean, refused at invocation.** `integer = -1x`, `integer = 1x` and
  `integer = 1_000` recover `NaN` by the same route (`Number("1x")`), spend one
  binder model call, and fail the post-default-merge AJV hook with
  `theta /<name>: argument binding produced invalid args — /p must be integer`.
  Under a declared half whose fragment admits any number they bind `NaN`, which
  `JSON.stringify` renders `null`.

One pairing is refused at load: `string = 1x` draws
`theta/parse/params-default-type-mismatch: param 'p' default type mismatch:
expected string, got integer` — an incompatibility verdict whose `<actual>` is
the type of the first character of a source the grammar does not derive.

## Reproduction

Offline, deterministic, at HEAD `b4b96503`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`; the shipped
`checkLiteralSublanguage`, `defaultLiteralStaticType`, `isBareObjectLiteral` and
`parseExpressionSource`; a real `AjvSchemaValidator`; and the real `runBinder`
with the off-session `complete()` mocked. Each fixture is a `mode: prompt` theta
whose `params:` block declares `topic: string` (required) and one defaulted field
`p` — the shape that forces the binder path.

### (a) The subject row and its neighbours at load

`diags` is the whole diagnostic list for the file, rendered
`<severity> <code>: <message>`.

| `params:` right-hand side | `diags` |
| --- | --- |
| `integer = -1x` | `[]` |
| `integer = 1x` | `[]` |
| `integer = 1 2` | `[]` |
| `integer = 0x10` | `[]` |
| `string = 1x` | `["error theta/parse/params-default-type-mismatch: param 'p' default type mismatch: expected string, got integer"]` |
| `integer = -1` (control) | `[]` |

Every silent row records the residue-carrying span verbatim (`defaultSource`
`"-1x"`, `"1 2"`, `"0x10"`), sets `hasDefault: true`, leaves `required` as
`["topic"]`, reports `defaultedFields: ["p"]` and lowers `{"type":"integer"}`.
The refused row withholds the lowered document (`parseParams`'s error gate).

### (b) The three readers of the same bytes

`check` is `checkLiteralSublanguage(source, "default", site)`; `static` is
`defaultLiteralStaticType(source)`; `bare` is `isBareObjectLiteral(source)`;
`body` is the node `parseExpressionSource(source)` returns.

```
-1x            check []   static {literal, integer}          bare false  body binary(-, null, number "1x")
1x             check []   static {literal, integer}          bare false  body number text="1x"
-1 x           check []   static {literal, integer}          bare false  body binary
1.5x           check []   static {literal, number}           bare false  body number text="1.5x"
0x10           check []   static {literal, integer}          bare false  body number text="0x10"
0b101          check []   static {literal, integer}          bare false  body number text="0b101"
0o17           check []   static {literal, integer}          bare false  body number text="0o17"
1_000          check []   static {literal, integer}          bare false  body number text="1_000"
1 2            check []   static {literal, integer}          bare false  body number text="1"
-1 2           check []   static {literal, integer}          bare false  body binary
"a" "b"        check []   static {literal, string}           bare false  body string "a"
true false     check []   static {literal, boolean}          bare false  body bool true
null null      check []   static {literal, null}             bare false  body null
[1] x          check []   static {array, element integer}    bare false  body array
{ a: 1 } x     check []   static undefined (object defers)   bare TRUE   body object
1 foo(2)       check []   static {literal, integer}          bare false  body number text="1"
"a" junk here  check []   static {literal, string}           bare false  body string "a"
-1 true        check []   static {literal, integer}          bare false  body binary
-5 # trailing  check []   static {literal, integer}          bare false  body binary
1;             check []   static {literal, integer}          bare false  body number text="1"
-1)            check []   static {literal, integer}          bare false  body binary
-1]            check []   static {literal, integer}          bare false  body binary
1 @`q`         check []   static {literal, integer}          bare false  body number text="1"
1 ${x}         check []   static {literal, integer}          bare false  body number text="1"
-1             check []   static {literal, integer}          bare false  body binary        (control)
1              check []   static {literal, integer}          bare false  body number        (control)
{ a: 1 } + 1   check [default-not-literal: … offending sub-expression: { a: 1 } + 1]        (fence)
```

The fence row identifies the boundary exactly: a `+` can extend the expression,
so `parseBinary` consumes it and the whole source becomes a `binary` node that
`firstNonLiteral` refuses. Every admitted row above ends at a token no loop in
the parser can use, and the parser stops there without complaint.

### (c) Load-time verdicts, decidable declared types

`lowered` is `properties.p` of the lowered document, absent where the load is
refused.

| `params:` right-hand side | `diags` | `lowered` |
| --- | --- | --- |
| `integer = -1x` | `[]` | `{"type":"integer"}` |
| `integer = 1x` | `[]` | `{"type":"integer"}` |
| `integer = 0x10` | `[]` | `{"type":"integer"}` |
| `integer = 0b101` | `[]` | `{"type":"integer"}` |
| `integer = 1_000` | `[]` | `{"type":"integer"}` |
| `number = 1.5x` | `[]` | `{"type":"number"}` |
| `integer = 1 2` | `[]` | `{"type":"integer"}` |
| `boolean = true false` | `[]` | `{"type":"boolean"}` |
| `string = "a" "b"` | `[]` | `{"type":"string"}` |
| `array<integer> = [1] x` | `[]` | `{"type":"array","items":{"type":"integer"}}` |
| `integer = -1 true` | `[]` | `{"type":"integer"}` |
| `integer = 1 foo(2)` | `[]` | `{"type":"integer"}` |
| `integer = 1 ${x}` | `[]` | `{"type":"integer"}` |
| ``integer = 1 @`q` `` | `[]` | `{"type":"integer"}` |
| `string = 1x` | `params-default-type-mismatch` (`expected string, got integer`) | withheld |
| `integer = -1` (control) | `[]` | `{"type":"integer"}` |

The one refusal is the compat relation over the LEADING literal's type, not a
verdict on the residue: `integer = 1x` is silent and `string = 1x` is refused
over the same default bytes.

### (d) Load-time verdicts, deferring declared types — all silent

| `params:` right-hand side | body declaration | `diags` | `lowered` |
| --- | --- | --- | --- |
| `Count = -1x` | `schema Count = number` | `[]` | `{"$ref":"#/$defs/Count"}` |
| `Sev = 1x` | `enum Sev { A, B }` | `[]` | `{"$ref":"#/$defs/Sev"}` |
| `S = { a: 1 } x` | `schema S { a: integer }` | `[]` | `{"$ref":"#/$defs/S"}` |

The declared half answers `"unknown"` against the empty `TypeEnv`, so the compat
gate declines by design and the is-literal check is the only load-time judge of
the default's form.

### (e) The end-to-end drive — real `runBinder`, scripted envelope

The binder returns `{kind:"ok", args:{topic:"hello"}}` — the defaulted field
omitted, exactly as the system prompt instructs. `prompt token` is read off the
captured binder call's `Parameters:` block. Every row spent exactly one binder
model call.

**Bound, with a value the source does not spell:**

| `params:` right-hand side | prompt token | merged `args` | echo |
| --- | --- | --- | --- |
| `integer = 1 2` | `default=1 2` | `{topic:"hello", p:1}` | `Running /…: topic=hello, p=1 (default)` |
| `string = "a" "b"` | `default="a" "b"` | `{topic:"hello", p:"a"}` | `topic=hello, p=a (default)` |
| `boolean = true false` | `default=true false` | `{topic:"hello", p:true}` | `topic=hello, p=true (default)` |
| `array<integer> = [1] x` | `default=[1] x` | `{topic:"hello", p:[1]}` | `topic=hello, p=[1] (default)` |
| `S = { a: 1 } x` | `default={ a: 1 } x` | `{topic:"hello", p:{a:1}}` | `topic=hello, p={1, …} (default)` |
| `integer = 0x10` | `default=0x10` | `{topic:"hello", p:16}` | `topic=hello, p=16 (default)` |
| `integer = -1 true` | `default=-1 true` | `{topic:"hello", p:-1}` | `topic=hello, p=-1 (default)` |

The same drive under a permissive declared half
(`integer | number | string | boolean | null`), which reveals the recovered value
where a narrow fragment would refuse it: `0x10` → `16`, `0b101` → `5`, `1 2` →
`1`, `1 foo(2)` → `1`, `1 ${x}` → `1`, `` 1 @`q` `` → `1`, `1;` → `1`,
`-5 # trailing` → `-5`, `"a" junk here` → `"a"`, `null null` → `null`, and
`-1x` / `1x` / `1_000` / `1.5x` → `NaN` (echoed `p=NaN (default)`, serialised
`{"topic":"hello","p":null}`).

**Refused at the post-default-merge hook (`bound: false`, no echo, no body
run):**

| `params:` right-hand side | note on the `theta-system-note` channel |
| --- | --- |
| `integer = -1x` | `theta /…: argument binding produced invalid args — /p must be integer` |
| `integer = 1x` | `… — /p must be integer` |
| `integer = 1_000` | `… — /p must be integer` |

**Controls:** `integer = -1` binds `{topic:"hello", p:-1}` with echo
`p=-1 (default)`. Conformant sources are unchanged by this defect.

### (f) The same bytes in body position

`parseDoc` over a body `let v = <span>`:

```
let v = -1x      ["error theta/parse/unsupported-feature: unsupported syntactic feature: 1x"]
let v = 1x       ["error theta/parse/unsupported-feature: unsupported syntactic feature: 1x"]
let v = 0x10     ["error theta/parse/unsupported-feature: unsupported syntactic feature: 0x10"]
let v = 0b101    ["error theta/parse/unsupported-feature: unsupported syntactic feature: 0b101"]
let v = 1_000    ["error theta/parse/unsupported-feature: unsupported syntactic feature: 1_000"]
let v = 1.5x     ["error theta/parse/unsupported-feature: unsupported syntactic feature: 1.5x"]
```

The registered refusal for these forms exists and fires — in the position that
lexes with the theta lexer. The `params:` default position does not lex with it
at load, and the invocation-time recovery that does discards its diagnostics
(`parseExpressionSource`, `src/parser/theta-document.ts:1175`).

## Expected behaviour

- `docs/spec_topics/grammar.md:14`, `:20–24` — `Literal` and `PrimitiveLit` are a
  closed production set: `PrimitiveLit ::= STRING | NUMBER | "-" NUMBER |
  BOOLEAN | NULL`. A production derives a terminal string, not a prefix of one.
  No alternative derives `NUMBER NUMBER`, `STRING STRING`, `BOOLEAN BOOLEAN`,
  `ArrayLit Ident` or `NUMBER Ident`, and none of the container productions
  (`ArrayLit`, `BareObjectLit`, `NamedObjectLit`) admits a suffix after its
  closing bracket.
- `docs/spec_topics/grammar.md:9` — "the parser performs an 'is-literal' check
  after parsing the AST in that position. A failure is
  `theta/parse/default-not-literal`; the diagnostic names the offending
  sub-expression." The check is specified over the AST of the RHS, singular; a
  parse that covers part of the RHS and leaves the rest unexamined does not
  discharge it.
- `docs/spec_topics/grammar.md:51` (*Forbidden inside a literal*) — the
  forbidden set includes operators outside the unary-`-` carve-out, function and
  tool calls, `${...}` interpolation and `@`...`` query templates. Measured
  residues include a call (`1 foo(2)`), an interpolation (`1 ${x}`) and a query
  template (`` 1 @`q` ``): forms this list names, present in the RHS, admitted.
- `docs/spec_topics/lexical.md:28` (*Number literals*) — "Decimal only … No hex
  / octal / binary forms and no underscore separators in theta 1.0 (those forms
  surface as `theta/parse/unsupported-feature`)", mirrored at
  `docs/reference/grammar.md:127`. `NUMBER` is that lexical production, so
  `PrimitiveLit ::= NUMBER` derives neither `0x10` nor `1_000`, and the
  registered disposition for them is a refusal, not a value.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults) — "A
  param may declare a default with `field: type = literal`", the RHS "parsed by
  the **Theta literal sublanguage** … restricted to the production set
  normatively defined in [Grammar Appendix]". The RHS is the literal, whole; the
  sentence provides no reading under which a suffix is ignored.
- `docs/spec_topics/diagnostics/code-registry-parse.md:48` — the registered
  *Trigger* of `theta/parse/default-not-literal`: "A `params:` default RHS
  **contains a form outside** the [Theta literal sublanguage] (an operator other
  than the unary `-` carve-out for numeric literals, function call, identifier
  reference other than `Enum.Variant`, `${...}` interpolation, or `@`...``
  template)." For `-1x`, `0x10`, `[1] x`, `1 foo(2)`, `1 ${x}` and
  `` 1 @`q` `` the residue is one of the named forms and the RHS contains it, so
  the row claims those inputs as written. For `1 2`, `"a" "b"`, `true false` and
  `null null` the residue is a literal and the row does not name it — the
  DIAG-2 question §Fix (e)(1) puts to the run.
- `docs/spec_topics/diagnostics/code-registry-parse.md:49` — the *Trigger* of
  `theta/parse/params-default-type-mismatch` enumerates the default shapes this
  position decides: "a string / number / boolean / `null` literal (a unary-`-`
  numeric literal included) and a homogeneous array literal of them". `1x` is
  none of them, so the diagnostic measured for `string = 1x` is an emission the
  row's own *Trigger* does not describe. Its second precedence rule states where
  the input belongs: a default half that drew `theta/parse/default-not-literal`
  "keeps that diagnostic alone — this row does not run for either."
- `docs/spec_topics/binder/binder-bypass-and-envelope.md:142` (*Default-literal
  rendering*) — the `<literal>` after `default=` "MUST be the field's default
  value rendered in the [Theta literal sublanguage] surface syntax". The measured
  tokens `default=1 2`, `default=0x10` and `default=[1] x` are not sublanguage
  forms, and for every bound row the value the model was shown is not the value
  the body receives.
- `docs/spec_topics/binder/defaulting-system-note-echo.md:9` — "when the wire
  name is absent, the field takes its declared default". For the bound rows the
  field takes a prefix of its declared default, or a re-lex of it.
- `docs/spec_topics/governance/source-language-stability.md:9` — the
  loads-cleanly predicate. Every row in §Reproduction (b), (c), (d) and (e)
  satisfies it at HEAD, which puts a refusal in the diagnostic-registry
  carve-out's addition direction (`:25`) rather than outside GOV-15.

## Actual behaviour / root cause

**1. `parse()` has an emptiness test where an exhaustiveness test belongs.**

```ts
  parse(): ExprNode | undefined {
    if (this.peek() === undefined) {
      return undefined;
    }
    return this.parseTernary();
  }
```

(`src/parser/literal-sublanguage.ts:278–283`.) The `undefined` return means "no
expression at all" — bug 0165's arm. There is no third answer for "an expression
followed by tokens", so the caller cannot distinguish a whole RHS from a prefix
of one. Every descent below terminates on a token it cannot consume rather than
reporting it: `parseBinary` breaks when the next token is not a `punct` or
carries no precedence (`:305–311`), `parsePostfix` breaks on anything but `.`,
`(` and `[` (`:333–365`), and `parseArray` / `parseObjectBody` return at their
closing bracket (`:437`, `:454`). The cursor's final position is available —
`ExprParser` tracks `pos` (`:257`) — and is never read.

**2. Both default-position readers inherit the prefix.** `checkLiteralSublanguage`
(`:54`) walks `firstNonLiteral` over the node it got, so the verdict is about the
prefix; `defaultLiteralStaticType` (`:673`) runs the same parse and
`primitiveLiteralType` (`:696`) reads the primitive off the NODE's own span
(`literalPrimitiveOf`, `:754`), so the type is the prefix's. The two readers
agree — bug 0166's mirror contract holds — and they agree about a fragment. That
is why `string = 1x` draws a type-mismatch: the pairing at
`src/parser/params.ts:378–386` receives `string` and `integer` and reports an
incompatibility, with no reader in the chain having retained that two characters
of the source were never examined.

Even the refusals that do fire hide the residue: cell f2 of
`tests/params-scalar-nontype-text-refusal.test.ts:1087` pins
`string = totally junk` at a message interpolating `totally`, because the
offending node's span ends where the parse stopped.

**3. The tokenisers disagree about where a number ends.** This module's scanner
takes `[0-9.eE]` only (`:207–215`), so `0x10` is the number `0` plus the
identifier `x10` and `1_000` is `1` plus `_000`. The theta lexer folds the
abutting tail INTO the token and refuses it:

```ts
      // A digit/letter/underscore abutting the decimal literal is a reserved or
      // malformed numeric form — the theta 1.0-deferred hex (`0x`), octal (`0o`),
      // binary (`0b`), and underscore-separator (`1_000`) syntaxes all surface
      // here as `theta/parse/unsupported-feature` (lexical.md §"Number literals").
```

(`src/lexer/lexer.ts:605–608`; the diagnostic at `:620–626`, the token carrying
`fullText` at `:627`.) At invocation `#recoverDeclaredDefaults` (`:1240`) parses
the recorded default through `parseExpressionSource`
(`src/parser/theta-document.ts:1169–1180`), whose deps supply
`emitDiagnostic: () => {}` (`:1175`), so that refusal is discarded and the token
survives with its full text. `evaluatePureExpression`'s `case "number"` is
`Number(expr.text)` (`:5888–5889`), and JS reads `"0x10"` as `16`, `"0b101"` as
`5`, `"1x"` and `"1_000"` as `NaN`. The value bound is therefore not even the
literal the load-time reader typed.

**4. The runtime net catches only the values a lowered fragment rejects.**
`#mergeDeclaredDefaults` (`:1203`) compiles the lowered `params:` schema and
validates the merged args, and `runBinder` routes a non-`ok` classification to
`#emitBinderFailureNote` + `{bound: false}` before the echo (`:877`). `NaN`
fails `{"type":"integer"}`, so the three `NaN` rows stop before the body —
correctly, one binder call late, with a message about the merged value's JSON
type. Every truncated value that satisfies its fragment passes:
`fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:127–132`) records the
field as default-supplied, the echo tags it `(default)` (`:885`), and
`paramBindingsFrom` (`src/extension/theta-composition-producer.ts:90`) projects
it into body scope.

**5. Nothing downstream can recover the source.** The parser records the
default's SOURCE text (`splitParamValue`, `src/parser/frontmatter.ts:636`) and
the render seam interpolates it verbatim (`binderPromptParamField` →
`renderBinderParamLine`), so the prompt says `default=1 2` while the merge says
`1`, and `default=0x10` while the merge says `16`. Each seam is correct for the
record it was handed; the record is of a form the position was not supposed to
admit.

## Why it matters

- **A theta binds a truncation of its own source, with no diagnostic on any
  surface.** Measured end to end through the real producer: `integer = 1 2`
  loads with `diags []`, takes the binder path and binds `p = 1`;
  `string = "a" "b"` binds `"a"`; `array<integer> = [1] x` binds `[1]`;
  `S = { a: 1 } x` binds `{a: 1}`. A body comparison, `match` or interpolation
  then runs against a value the author did not write, and the discarded text is
  reported nowhere.
- **A form the spec assigns to a registered refusal binds a number instead.**
  `integer = 0x10` binds `16` and `0b101` binds `5`, while `lexical.md:28` says
  hex, octal, binary and underscore forms "surface as
  `theta/parse/unsupported-feature`" — which they do in body position (measured,
  §Reproduction (f)). The same bytes are an error in one position and a silent
  value in another, and in the second the value is what a JS `Number()` call
  makes of them.
- **The model is grounded in one value and the body runs on another.** The
  binder system prompt's line says `default=1 2` / `default=0x10` — a token
  `binder-bypass-and-envelope.md:142` requires to be a literal-sublanguage
  rendering of the default value — and the success echo reports `p=1` / `p=16`.
  Prompt, echo and source disagree in one turn.
- **`NaN` is not a JSON value.** `-1x`, `1x`, `1_000` and `1.5x` recover `NaN`;
  under a declared half whose fragment admits a number they bind, and
  `JSON.stringify` renders the binding `null` (measured
  `{"topic":"hello","p":null}`). The theta drew no diagnostic.
- **Where the runtime net catches it, the cost is spent and the subject is
  wrong.** Three pairings fail at the post-default-merge hook after exactly one
  binder model call, reporting `argument binding produced invalid args — /p must
  be integer`. The author's defect is at load time in the source text; the
  report is at invocation time about a merged JSON document.
- **The one load-time refusal names the wrong defect and sits outside its own
  row's Trigger.** `string = 1x` draws `expected string, got integer` — an
  incompatibility verdict on a form the grammar does not derive, whose
  `<actual>` is the type of the leading character. `params-default-type-mismatch`'s
  *Trigger* (`code-registry-parse.md:49`) enumerates only literals and
  homogeneous arrays of them among the shapes it decides, and its own precedence
  rule says a default half refused by `theta/parse/default-not-literal` keeps
  that diagnostic alone.
- **The verdict for one source depends on a type the source never mentions.**
  `1x` is refused at load under `string`, refused at invocation under `integer`,
  and bound as `NaN` under `Count = number`. Three dispositions for one
  ill-formed spelling.
- **Every deferring declared type is silent by construction.** A `NamedType`, an
  alias, an inline object type and a literal-typed declared half all answer
  `"unknown"` against the empty `TypeEnv`, so the compat gate judges none of
  §Reproduction (d)'s rows and the is-literal check is the only load-time judge
  of the default's form. It admits.
- **The sibling type position already refuses this.**
  `theta/parse/malformed-alias-rhs` (`code-registry-parse.md:89`) was registered
  by [0042](./0042-schema-decl-same-line-residue-silent.md) for same-line residue
  after a complete `schema X = …` right-hand side, naming `schema X = string
  "junk"` and `schema X = array<integer> 42` explicitly. The two halves of a
  `params:` field therefore disagree about residue: the type half is refused, the
  default half is truncated.
- **No gate scores it.** The tree's only `params:` default is
  `count: number = 3` (census, §Affected), no committed direct
  `checkLiteralSublanguage` / `defaultLiteralStaticType` / `isBareObjectLiteral`
  call passes a residue-carrying source, and the 74-cell bug-0166 witness holds
  the `neg` arm only. The tolerance is unwitnessed in the direction that matters.

## Fix

Not settled. Four candidate emission points are pinned below with their measured
blast radii; the run selects one and states the evidence that decided it. Every
route carries the constraints in (e).

### (a) Require end of input at the two default-position entry points

Add one module-local predicate that reports whether a parse consumed every token
(the parser already tracks `pos`, `:257`), and have BOTH
`checkLiteralSublanguage` (`:54`) and `defaultLiteralStaticType` (`:673`) apply
it: the check emits `theta/parse/default-not-literal` naming the residue, the
compat reader returns `undefined`. Shared predicate, not copied — bug 0056's
mandate and the shape bug 0166's `isNumericLiteralOperand` (`:493`) already
takes.

- **It decides every row in the class at one site.** All twenty-four admitted
  spellings differ only in what the residue is, and none of them reaches
  `firstNonLiteral` with a node the walk can fault.
- **The blast radius is one production caller.**
  `src/parser/params.ts:363` and `:381`; `LiteralPosition` has the single value
  `"default"`. The eight committed direct `checkLiteralSublanguage` call sites
  and the two `defaultLiteralStaticType` ones pass no residue-carrying source
  (read, §Affected), so none flips.
- **`isBareObjectLiteral` does not move**, which is the difference from (b): the
  Pi-tool shape predicate keeps its four committed verdicts by construction.
- **It changes which code fires for one input that already emits one.**
  `string = 1x` flips from `theta/parse/params-default-type-mismatch` to
  `theta/parse/default-not-literal` through the precedence guard at
  `src/parser/params.ts:375–377` — the ordering `code-registry-parse.md:49`'s
  second precedence rule prescribes. No committed cell pins that row.
- **Open: what span the diagnostic names.** The existing *Message* interpolates
  "the offending sub-expression"; here the offence is what follows one. The
  route measures and states whether `<expr>` renders the residue (`x` for
  `-1x`), the whole RHS (`-1x`), or the first residual token, and holds DIAG-4
  by changing no *Message* column.

### (b) Require end of input inside `ExprParser.parse()`

Make the parser itself the judge, so all three entry points inherit the rule.

- **It lands in bug 0165's fail-open arm if the signal is `undefined`.**
  `checkLiteralSublanguage` returns `[]` when `parse()` yields `undefined`
  (`:62–64`) — the open subject of
  [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) — so
  a residue reported that way refuses nothing and moves the class from
  "admitted and typed" to "admitted and untyped", which also silences today's
  one load-time refusal. Admissible only with a distinct residue signal, or
  after 0165 closes that arm. Recorded so the route is rejected explicitly
  rather than by omission.
- **It changes a second position's predicate.** `isBareObjectLiteral` (`:90–95`)
  would answer `false` for `{ a: 1 } x`, where it answers `true` today
  (measured). No production caller observes that: the shape arm it feeds is
  gated on an `argumentSource` no `src/` caller of `checkToolCallArguments`
  supplies (§Affected), and the whole-document walk keeps its own AST-based
  shape test (`src/parser/theta-document.ts:5399–5405`). The route must state
  that reachability finding rather than assume it, and re-read
  `tests/params-default-string-literal-raw-newline.test.ts:797–812` and
  `tests/tool-calls.test.ts:171–208`.

### (c) Register a code for default-side residue

Mirror `theta/parse/malformed-alias-rhs`'s *Same-line residue* clause
(`code-registry-parse.md:89`) at this position with a dedicated row.

- **It matches the corpus's own precedent** — bug 0042 settled exactly this
  question one position over, and a dedicated row can name the residue's first
  token the way that row names its boundary tokens.
- **It partitions one class by what the residue happens to be.**
  `default-not-literal`'s *Trigger* already claims `-1x`, `[1] x`, `1 foo(2)`,
  `1 ${x}` and `` 1 @`q` `` (the residue is a named form); a new row would take
  `1 2`, `"a" "b"`, `true false` and `null null` and leave the rest, or
  duplicate a row that already describes the defect. It also costs a DIAG-2
  registration plus the `docs/reference/diagnostics.md` row. Disfavoured on the
  partition, not on the precedent; the route must argue it if it takes it.

### (d) Align this module's numeric scan with the theta lexer's

Have `tokeniseExpr` (`:207–215`) fold an abutting digit/letter/underscore tail
into the number token as `src/lexer/lexer.ts:605–629` does.

- **It covers one family only.** `0x10`, `0b101`, `0o17`, `1_000`, `1x` and
  `1.5x` become one malformed token; `1 2`, `"a" "b"`, `true false`, `[1] x`
  and every other whitespace-separated residue stay admitted. Complementary to
  (a), not a substitute.
- **It raises which code is due.** `lexical.md:28` assigns those forms to
  `theta/parse/unsupported-feature`, a row this position never fires today.
  Emitting it here is a *Trigger*-scope question; emitting
  `default-not-literal` instead reports a lexical defect as a sublanguage one.
- **`tokeniseExpr` is shared.** `hasRawNewlineInStringLiteral` (`:629`) and
  `isBareObjectLiteral` (`:90`) both call it, and bug 0102's fix pinned it as
  "CALLED, never edited" for that reason (the doc-comment above `:629`). A route
  here re-measures both.

### (e) Constraints every route carries

1. **The registry row and the DIAG-2 question.**
   `theta/parse/default-not-literal`'s *Trigger* (`code-registry-parse.md:48`)
   claims a RHS that "contains a form outside the [Theta literal sublanguage]
   (an operator other than the unary `-` carve-out …, function call, identifier
   reference other than `Enum.Variant`, `${...}` interpolation, or `@`...``
   template)". Measured: for `-1x`, `0x10`, `[1] x`, `1 foo(2)`, `1 ${x}` and
   `` 1 @`q` `` the residue IS one of those forms, so the row admits the refusal
   unedited; for `1 2`, `"a" "b"`, `true false` and `null null` the residue is a
   literal and the row's enumeration does not name it. The run answers, and does
   not skip: whether to widen that parenthetical to name residue after a
   complete literal (a DIAG-2 *trigger* change landing in the same commit,
   `diagnostic-shape.md:72`, dispositioned by
   `source-language-stability.md:25` as an addition for the inputs newly brought
   into the emission set), or to take route (c). The *Message* columns do not
   move (DIAG-4, `:74`).
2. **The mirror contract between the position's two readers.**
   `primitiveLiteralType`'s design note (`literal-sublanguage.ts:633–672`,
   `:696`) records that the compat reader shares this module's tokeniser and
   parser precisely so it can never disagree with the is-literal verdict, and
   bug 0166 made that a WITNESSED invariant: group C of
   `tests/params-default-unary-minus-non-numeric-refusal.test.ts:605–652` reds
   if either arm narrows alone (proven by that fix's verification, which
   neutralised `primitiveLiteralType`'s arm alone and reproduced exactly cells
   c1–c7). A residue check that lands only in `checkLiteralSublanguage` leaves
   `defaultLiteralStaticType` typing a form the check refuses — invisible at
   this position today because the precedence guard stops the compat check, and
   still a break of the contract. Both readers move together, and the route says
   so in the code comments.
3. **The bug-0059 type-half suppression keeps suppressing.**
   `src/parser/params.ts:349` and the third precedence rule of
   `code-registry-load.md:19` bound a field whose type half is junk to one
   diagnostic. Cell f1 of `tests/params-scalar-nontype-text-refusal.test.ts:1075`
   (`pick one = or two`, whose default half is itself residue) pins the count at
   one, and cell f2 (`:1087`) pins the guard's one-directionality with a message
   interpolating `totally`. A new refusal belongs behind both guards, and behind
   the default-half guard at `:375–377`.
4. **The over-refusal fence.** These verdicts are measured at HEAD and must not
   move: `integer = -1` loads clean, records `-1`, renders `default=-1` and binds
   `-1`; `number = -1.5` loads clean; `integer = -1.5` draws exactly one
   `theta/parse/integer-narrowing` (cell b2,
   `tests/params-default-type-compat.test.ts:396`);
   `checkLiteralSublanguage("-5", …)` draws no `default-not-literal`
   (`tests/e2e-s1-grammar-literal-sublang.test.ts:27`); `a + b`, `{ k: f(x) }`
   and `{ a: 1 } + 1` stay refused with their current spans; group C and group D
   of the bug-0166 witness stay green; `isBareObjectLiteral`'s four committed
   verdicts stay as they are.
5. **GOV-15.** Every row in §Reproduction (b), (c), (d) and (e) loads cleanly at
   HEAD (`source-language-stability.md:9`) and would stop loading. That is the
   diagnostic-registry carve-out's addition direction (`:25`), so the fix
   ENUMERATES the newly-refused set rather than leaving it to be discovered: a
   default RHS whose parse leaves any token unconsumed, at the top level and as
   an array element or object field value, under decidable and deferring
   declared halves alike, with the residue being a literal, an identifier, a
   call, a template, a query template, stray punctuation, or a numeric tail
   folded by the theta lexer. The census in §Affected found no file in that set.
6. **No consumer moves.** `renderBinderParamLine`
   (`src/binder/binder-system-prompt.ts:168`), `binderPromptParamField`
   (`src/extension/production-theta-producer.ts:633`),
   `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:117`),
   `#mergeDeclaredDefaults` (`:1203`) and `evaluatePureExpression` (`:5886`) are
   each correct given a well-formed record. Refusing the declaration removes the
   record. Whether the recovery should honour the lexer diagnostics it currently
   discards is out of frame (§Non-goals).
7. **Test witness — unit, offline, provider-free, plus one drive tier.** The
   load-time half is `parseDoc` cells: the refusal table over the residue shapes
   at the three nesting positions, under a decidable and a deferring declared
   half, each at exactly one diagnostic with the registry-sourced *Message*; the
   code flip for `string = 1x`; the fence rows of (e)(4); the precedence rows of
   (e)(3); direct `checkLiteralSublanguage` / `defaultLiteralStaticType` cells
   holding the mirror contract for this class the way group C holds it for
   0166's. The runtime half re-drives the bound rows of §Reproduction (e)
   through the `runBinder` harness to show them refused at load with
   `binderCalls: 0` — the observable that makes this S1 — against one conformant
   numeric default still binding with the `(default)` echo.

### (f) Ordering

Nothing blocks this report from starting. One interaction is binding:
[0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) owns
`checkLiteralSublanguage`'s `node === undefined` arm (`:62–64`), which route (b)
would otherwise route this class into. If 0165 lands first, that arm refuses and
(b)'s cost disappears; if this report lands first, its residue signal must not be
`undefined`, and 0165's fix then sits beside it in the same function. Both fixes
edit `checkLiteralSublanguage`, so whichever lands second rebases onto the
other's hunks.

## Non-goals

- **The empty and whitespace-only default.**
  [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md)'s
  class: no node, no recovered value, a `null` bind. Every row here produces a
  node, a static type and a filled value. This report changes nothing about the
  `node === undefined` arm except to record that no route may hide in it.
- **Unary `-` over a non-numeric literal.**
  [0166](./0166-unary-minus-default-admits-non-numeric-literal.md)'s class,
  fixed at 0.91.0. Every row here has a numeric operand or no operator at all;
  the shared `isNumericLiteralOperand` predicate (`:493`) and the 74-cell
  witness stay as they are.
- **Whether the invocation-time recovery should honour the diagnostics it
  discards.** `parseExpressionSource` supplies an inert `emitDiagnostic`
  (`src/parser/theta-document.ts:1175`) as a pre-existing property of that
  helper, noted in
  [0084](./0084-increment-decrement-check-dead.md). This report measures the
  discard as the mechanism that turns `0x10` into `16`; whether the recovery
  should refuse a default whose re-parse raises an error is a separate question
  over a separate blast radius (every `parseExpressionSource` caller).
- **What `Number(expr.text)` should yield for a malformed numeric token.** The
  evaluator's `case "number"` (`:5888–5889`) is correct for a token the lexer
  accepted; this report measures it as the second reader that disagrees with the
  first.
- **Residue at the `Type` positions.**
  [0042](./0042-schema-decl-same-line-residue-silent.md) (fixed) owns the schema
  alias RHS and [0124](./0124-parsetype-trailing-punctuation-leniency.md) (open)
  owns the three `parseType` positions. Neither capture is this module's
  `ExprParser`; they are cited as precedent and boundary only.
- **The Pi-tool argument shape rule.** `isBareObjectLiteral`'s tolerance for
  residue is measured (`{ a: 1 } x` → `true`) and is not reachable from any
  production caller (§Affected), so no behaviour change is proposed there. It is
  a blast-radius fact for §Fix (b).
- **Junk text on either half of the `params:` scalar.**
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s class,
  fixed at 0.86.0. `1 2` is not junk text: it parses, and the position admits
  it. The suppression guard that fix installed must keep suppressing ((e)(3)).
- **The post-default-merge hook's routing.** Bug 0066's fix settled it and this
  report relies on it: the three loud-at-invocation rows are the hook working.

## Provenance

Filed as residual 2 of the bug 0166 fix (0.91.0, commit `b4b96503`). That fix's
`## Fix (0.91.0)` block records it under *Residuals* item 2, and its fix report
records the same find with the reviewer's evidence
(`.pi/tmp/fixes/0166-report.md:297–302`): "**`integer = -1x` loads clean and
types `integer`** — pre-existing, unchanged by this fix (true of `1x` too). The
module's `ExprParser` ignores trailing tokens after a parsed expression. Probed
by the round-1 reviewer: `check []`, `staticType
{kind:"literal",typesAs:"integer"}`. The operand is numeric, so the row is
outside 0166's class". That record is one row and one observable.

**Taken from that record:** the two spellings `-1x` and `1x`, the mechanism
sentence ("ignores trailing tokens after a parsed expression"), and the class
boundary against 0166.

**Measured here at HEAD `b4b96503`, not copied:** the reviewer's two rows,
re-run and confirmed (`check []`, `staticType {kind:"literal",typesAs:"integer"}`
for both); the further nineteen admitted spellings and the `{ a: 1 } + 1` fence
of §Reproduction (b); `isBareObjectLiteral`'s verdict on a residue-carrying
object literal; the load-time tables (c) and (d); the whole end-to-end drive (e)
through the real `ProductionThetaProducer.runBinder` — every bound value, prompt
token, echo and system note; the body-position contrast (f); and the recovery's
two-tokeniser mechanism, including that `0x10` binds `16` and `0b101` binds `5`.
The severity rests on those measurements, not on the residual's row: the
residual recorded a load-time observable for a spelling that is refused at
invocation (`integer = -1x` fails AJV), while the S1 argument rests on the rows
that BIND — `1 2`, `"a" "b"`, `true false`, `[1] x`, `{ a: 1 } x`, `0x10` — none
of which the residual names.

One correction to the residual's framing, verified: it places the row as
neighbouring "bug 0165's fail-open territory". The neighbouring is real but the
classes are disjoint on a measured observable — 0165's sources yield no node and
recover no value, every source here yields a node, a static type AND a filled
value — and the contact point is narrower than the framing suggests: it is that
`parse()`'s `undefined` return is the only "not a whole expression" channel the
module has, which constrains one fix route (§Fix (b), (f)) rather than merging
the two classes.

The probe was a single scratch vitest file with four sections — the module-seam
table, the load-time tables, the body-position contrast, and the end-to-end
drive — written, run and deleted; no file remains. The evaluator arm
`Number(expr.text)` (`src/extension/production-theta-producer.ts:5888–5889`) and
the lexer's abutting-tail arm (`src/lexer/lexer.ts:605–629`) are quoted from
source, not called directly — both are module-private — and their EFFECT is
measured, because the drive reaches them through `runBinder` and the bound
values in §Reproduction (e) are that drive's own merged `args`. The corpus
census was re-run over the working tree, and the committed-cell inventory in
§Affected was grepped and read over `tests/` at HEAD.

Every `src/`, `tests/`, spec, reference and bug-doc citation above was verified
against the tree at HEAD `b4b96503`; the volatile positions in
`src/parser/params.ts` (1226 lines),
`src/extension/production-theta-producer.ts` (6165 lines) and
`src/parser/theta-document.ts` (7006 lines) are named by symbol beside their line
numbers, per bug 0134's adjudication.

## Fix (0.144.0)

Route **§Fix (a)** — require end of input at the two default-position entry
points. §Fix left the mechanism to the run, so the three rejected routes and the
ground for each rejection are recorded below, and so is the §Fix (e)(1) DIAG-2
answer and the span choice §Fix (a) left open.

- **What shipped:**
  - `src/parser/literal-sublanguage.ts` — one new `ExprParser.residualStart()`
    reads the cursor `pos` the parser already tracked and never consulted,
    returning the char offset of the first token `parse()` left unconsumed. One
    new module-local `residueOf(parser, source)` turns that offset into the
    trimmed residue span, or `undefined` when the parse consumed every token.
    Both default-position readers call that ONE helper — `checkLiteralSublanguage`
    emits the existing `theta/parse/default-not-literal` naming the residue,
    `defaultLiteralStaticType` returns `undefined` before it computes any
    primitive or array type. `ExprParser.parse()`, `isBareObjectLiteral` and
    `tokeniseExpr` are byte-untouched.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the *Trigger* of the
    EXISTING `theta/parse/default-not-literal` row gains a *Same-line residue*
    clause modelled on `theta/parse/malformed-alias-rhs`'s own (bug 0042's
    registered precedent, one position over), enumerating the newly-refused set,
    the leading-offence precedence, the residue-naming rule, and the disposition
    of the numeric forms `lexical.md` assigns to
    `theta/parse/unsupported-feature`. No new code, no new row, no new
    placeholder; the *Message*, *Remedy*, *Sev*, *Phase* and *Spec* columns are
    byte-identical (DIAG-4).
  - `src/parser/params.ts` — **not edited.** §Fix (e)(3) is discharged by
    construction rather than by a new guard: the refusal enters through the
    existing `checkLiteralSublanguage` call, which already sits behind bug 0059's
    type-half suppression and already feeds the error slice that `continue`s
    ahead of the compat pairing. Verified by reading the unedited per-field loop
    and witnessed by cell d8.
- **The §Fix (a) open question, answered.** The diagnostic's `<expr>` renders
  **the residue** — the source from the first unconsumed token's start to end of
  source, trimmed — not the whole RHS and not the first residual token alone.
  It is what the position's other residue row already does (`malformed-alias-rhs`
  names the boundary token), and it is the only rendering that names text no
  reader examined: `-1x` → `x`, `0x10` → `x10`, `1 2` → `2`, `[1] x` → `x`,
  `"a" junk here` → `junk here`, `-5 # trailing` → `# trailing`. The ordering is
  load-bearing and is commented as such: the residue test runs only where
  `firstNonLiteral` found no leading offence, so a source whose LEADING node is
  already non-literal keeps its own span — bug 0059 cell f2's `totally` and the
  four committed spans `a + b`, `a.b.c`, `{ a: 1 } + 1`, `f(x)` are unmoved.
- **The §Fix (e)(1) DIAG-2 answer.** The *Trigger* parenthetical is widened, not
  partitioned, and route (c) is declined: for `-1x`, `0x10`, `[1] x`, `1 foo(2)`,
  `1 ${x}` and `` 1 @`q` `` the row already claimed the input, so a dedicated row
  would either duplicate a row that already describes the defect or split one
  class by what its residue happens to be. Widening reuses the registered code
  and leaves the *Message* column alone, which is the addition direction
  `source-language-stability.md` dispositions for the registry carve-out.
- **Gates** (each re-run independently by the orchestrator, not taken from a
  nested report):
  - Witness RED before / GREEN after: `Tests 87 failed | 13 passed (100)` under
    full neutralisation of both guard sites, the 13 greens being exactly the
    declared GREEN set (the registry-row cell, group B's two object-leading
    cells, the nine group-D fence cells, the group-E control); reds naming this
    bug's own symptom (`expected [] to deeply equal [ … "offending
    sub-expression: o17" ]`, `expected { kind: 'literal', typesAs: 'integer' } to
    be undefined`, `expected 'registered and driven; bound=true; p=1; binder
    calls=1' to be 'refused at load'`). Restored blob-exact,
    `aaeec259c3ad35c0599fdda7325ac2f1c847bfe3` before and after; then
    `Tests 100 passed (100)`.
  - The §Fix (e)(2) mirror contract proved in isolation: neutralising
    `defaultLiteralStaticType`'s arm ALONE reds group B alone and nothing else
    (`Tests 24 failed | 76 passed (100)`, all 24 in group B), so the two readers
    cannot narrow apart silently — the invariant bug 0166 made witnessed.
  - Full default suite: `Test Files 339 passed (339)` / `Tests 6492 passed
    (6492)` — from 338 files / 6392 tests at the lane baseline `e5d760bd`; the
    +1 file and +100 cells are this report's witness.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean, exit 0, no
    output.
  - `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`)
    clean, no output.
  - LIVE H8a `CELL-B3`, run for real, BOTH directions: green with the fix
    (`Tests 1 passed | 70 skipped (71)`); RED under the fix's neutralisation with
    the pre-fix signature (`b175liverefused` registering — the residue-carrying
    default admitted, `theta/parse/default-not-literal did not fire`); RED in the
    OVER-refusal direction too, by making `residueOf` report residue for a parse
    that consumed everything, which fails the conformant `count: number = 3`
    sibling's precondition loudly (`the conformant \`count: number = 3\` sibling
    did not register`); green again after restoration, blob
    `aaeec259c3ad35c0599fdda7325ac2f1c847bfe3`. A cell that can red in only one
    direction would hide an over-refusal inside a passing control.
  - LIVE H9a, BOTH files, run for real: `Tests 1 passed (1)` and
    `Tests 10 passed (10)` — 11/11, the lane baseline. The empty-capture stderr
    gate and the permitted-code subset are asserted inside the harness on every
    scenario; no new stderr code surfaced, established by the real run.
  - The §Fix (e)(4) fence and the shared-guard chains re-run together by the
    round-1 reviewer: 9 files / 370 tests green — 0166's witness, 0102's
    `isBareObjectLiteral` group, 0059's cells f1/f2, `params-default-type-compat`
    cell b2, `e2e-s1-grammar-literal-sublang`, `type-grammar`, `tool-calls`,
    `binder-param-line-newline-normalisation`, and
    `tests/committed-fixture-parse-gate.test.ts`, which is what discharges the
    corpus-wide "no shipped source moves" claim.
- **Review:** 2 rounds, plus one charter-sanctioned pre-review correction round.
  - Correction round (comment-only, NOT a review round, round numbering
    unaffected): the implementation had chased shifted line-number citations into
    `src/binder/binder-system-prompt.ts`,
    `tests/params-default-unary-minus-non-numeric-refusal.test.ts` and
    `tests/params-default-unresolvable-enum-variant.test.ts`. Bug 0134 is the
    adjudicated DO-NOT-CHASE class for positional drift, and the edits also added
    the phrase "re-derived post-bug-0175" — a historical reference `CLAUDE.md`
    forbids in comments. All three restored byte-exact to HEAD, blobs
    `55a38463`, `81159268`, `e861c2b7` verified identical, and the gates re-run
    green afterwards.
  - Round 1 (`bug-fix-reviewer`, deep) — 3 findings, NO correctness, fidelity or
    spec blocker. F1 [house-rule]: `residueOf`'s block had been inserted between
    `isNumericLiteralOperand`'s doc-comment and its `function` line, orphaning
    the design note §Fix (e)(2) treats as the mirror-contract record, and its own
    comment said "above" of a function below it. F2 [house-rule]: historical
    references in the new test file's comments ("re-derived post-fix" ×15,
    "Before the fix:", "HEAD-after-fix", "today"). F3 [prose]: a working-tree
    census clause embedded in the normative *Trigger* cell — repository state at
    one commit, silently false as soon as any fixture gains a `params:` default.
    Round 1 also positively established, with quoted evidence, the residue-span
    correctness across every descent path (including `parseArray` /
    `parseObjectBody` leaving their own closing bracket unconsumed, so `[1 2]`
    reports `2]` and `{ a: 1 2 }` reports `2 }`), that `peek()` undefined ⇿ every
    token consumed so no skipped-yet-unreported token exists, that a residue can
    never trim to `""`, and that `docs/reference/diagnostics.md:94` needs no edit
    because that page's tables carry no *Trigger* column.
  - Fixer round 1 (`bug-fix-fixer-light`) closed all three and refused none:
    `residueOf` relocated below `isNumericLiteralOperand` as a pure move
    (signature and body byte-identical, both call sites untouched), the
    historical framing stripped without touching an assertion, an expected value,
    a cell name or a test title, and the census clause deleted while the GOV-15
    disposition sentence §Fix (e)(5) requires stands.
  - Round 2 (`bug-fix-reviewer-fast`) — **CLEAN**, no escalation, with its own
    `git hash-object` re-verification of the three do-not-chase files, a
    column-by-column check that only *Trigger* prose moved, and confirmation that
    the relocation crossed no use-before-declaration boundary (the module's
    existing convention is call-before-declare for its local helpers).
- **Verification** (`bug-fix-verifier` plus the orchestrator's own re-runs):
  **SOLID**, every obligation discharged with quoted evidence — the neutralise /
  RED / restore / GREEN cycle with matching blob hashes on the full lever and on
  the mirror-contract lever alone, the full default suite, the live H8a cell in
  BOTH directions and H9a 11/11 run for real, and typecheck / lint. Also
  established: no `.skip` / `.todo` / `.only` and no vacuous cell; the DIAG-4
  messages are read from the live registry pages through `parseRegistry` /
  `registryMessage` rather than restated, with a loud throw on a missing row; no
  existing test's assertions, fixtures, titles or expected values changed
  anywhere.
- **GOV-15 — the direction and the flip table, measured.** This fix only ADDS
  refusals; nothing newly loads. The premeasure at the lane baseline found no
  drift from §Reproduction (b): all twenty-four spellings were still admitted at
  `e5d760bd`, so no row of this report was discharged by the intervening churn.
  The corpus census re-run at the same commit: 34 committed `.theta` /
  `.thetalib` files, exactly ONE `params:` default anywhere —
  `count: number = 3` at `tests/live/acceptance/fixtures/acc-params-binder.theta`,
  carrying no residue — so `tests/committed-fixture-parse-gate.test.ts` never
  meets a newly-refused input. The flips:

  | spelling | before | after |
  | --- | --- | --- |
  | residue after a complete literal (`1 2`, `"a" "b"`, `true false`, `null null`) | loads clean, binds the leading literal | 1 × `default-not-literal` naming the residue, unregistered |
  | residue that is a named forbidden form (`-1x`, `1x`, `[1] x`, `1 foo(2)`, `1 ${x}`, `` 1 @`q` ``) | loads clean | 1 × `default-not-literal`, unregistered |
  | a numeric tail this module's scanner splits off (`0x10`, `0b101`, `0o17`, `1_000`, `1.5x`) | loads clean, recovers `16` / `5` / `NaN` through a second tokeniser | 1 × `default-not-literal`, unregistered |
  | stray punctuation or a comment-like tail (`1;`, `-1)`, `-1]`, `-5 # trailing`) | loads clean | 1 × `default-not-literal`, unregistered |
  | residue nested in a container (`array<integer> = [1 2]`, `S = { a: 1 2 }`) | loads clean | 1 × `default-not-literal`, naming `2]` / `2 }` |
  | `string = 1x` | 1 × `params-default-type-mismatch` (`expected string, got integer`) | 1 × `default-not-literal` — the ordering `code-registry-parse.md`'s second precedence rule prescribes |
  | `integer = null null` | 1 × `params-default-type-mismatch` (`expected integer, got null`) | 1 × `default-not-literal` |
  | a deferring declared half over residue (`Count = -1x`, `Sev = 1x`, `S = { a: 1 } x`) | loads clean, `$ref` lowered | 1 × `default-not-literal`, unregistered |
  | `integer = -1`, `number = -1.5`, `integer = -1.5`, `-5`, `[1, 2]`, `{ a: 1 }`, `Severity.High` | its current verdict | unchanged |
  | `a + b`, `a.b.c`, `{ a: 1 } + 1`, `{ k: f(x) }`, `string = totally junk` | its refusal and its span | span byte-identical |
  | `isBareObjectLiteral("{ a: 1 } x")` | `true` | `true` — unmoved by construction |

- **Rejected routes, on this run's own measurements.**
  - **(b), require end of input inside `ExprParser.parse()`** — rejected on a
    re-measured fact, not on the report's forecast. §Fix (b)(f) gated the route on
    bug 0165 closing `checkLiteralSublanguage`'s `node === undefined` fail-open
    arm. 0165 is now **fixed (0.92.0)**, but it closed the hole from ABOVE: the
    empty-default refusal became `theta/parse/default-without-literal` in
    `parseParams`, and the module's own `if (node === undefined) { return []; }`
    arm is still there and still fail-open. So a residue signalled as `undefined`
    would refuse nothing today, exactly as §Fix (b) warned. The route also moves
    `isBareObjectLiteral`'s verdict on `{ a: 1 } x` from `true` to `false`, and
    witness cell d7 pins that verdict precisely so the route cannot be taken by
    accident.
  - **(c), register a dedicated residue code** — rejected on the partition
    §Fix (c) itself raises: the existing *Trigger* already claims the majority of
    the class, so a new row would take `1 2`, `"a" "b"`, `true false` and
    `null null` and leave the rest, splitting one defect across two codes by what
    its residue happens to be.
  - **(d), align this module's numeric scan with the theta lexer's** — rejected
    as covering 6 of the 24 rows and touching a shared surface bug 0102 pinned
    "CALLED, never edited" in its own doc-comment. Route (a) subsumes its whole
    family for free: the split tail IS residue, so `0x10` refuses without
    `tokeniseExpr` moving a byte.
- **Residuals** (each with its evidence; the parent files any that warrant a
  report):
  1. **The refusal reports a sublanguage violation for a form the lexical spec
     assigns to `theta/parse/unsupported-feature`.** `integer = 0x10`,
     `= 0b101`, `= 0o17` and `= 1_000` now draw `default-not-literal` naming
     `x10` / `b101` / `o17` / `_000`, while `lexical.md` assigns those forms to
     `theta/parse/unsupported-feature` and body position still draws exactly
     that (measured, §Reproduction (f), unchanged by this fix). The theta no
     longer loads either way, so the S1 bind is gone; what remains is that the
     same bytes draw two different codes in two positions. §Fix (d) named this as
     a *Trigger*-scope question and the widened *Trigger* now states the
     disposition explicitly rather than leaving it to be discovered. Closing it
     properly means route (d) plus a decision about emitting
     `unsupported-feature` from this position — a separate blast radius over a
     shared tokeniser.
  2. **The invocation-time recovery still discards its lexer diagnostics.**
     `parseExpressionSource`'s inert `emitDiagnostic` is untouched, so the
     mechanism that turned `0x10` into `16` is intact for any default that
     reaches it. This fix removes every input that reached it via residue, but
     §Non-goals reserves the general question (every `parseExpressionSource`
     caller), and bug 0084 already records the discard.
  3. **`isBareObjectLiteral` remains residue-tolerant.**
     `isBareObjectLiteral("{ a: 1 } x")` is still `true`, deliberately — cell d7
     pins it. §Affected established the tolerance is latent, not live: the Pi-tool
     shape arm it feeds is gated on an `argumentSource` no `src/` caller of
     `checkToolCallArguments` supplies, and the whole-document walk keeps its own
     AST-based shape test. Re-verified unmoved by this fix. If that arm ever
     acquires a live caller, the tolerance becomes a defect there.
- **Discharge notes appended:** bug **0166** — its `## Fix (0.91.0)` *Residuals*
  item 2 is this report's filing origin, and now carries the discharge with the
  note that the class covers twenty-two spellings that residual did not name, and
  that its "neighbours bug 0165's fail-open territory" framing is superseded by
  the disjointness this report measured.
- **Pinned dispositions / non-goals.** `ExprParser.parse()`'s signature and the
  `node === undefined` fail-open arm are unmoved — route (b) is rejected on the
  record, and 0165 owns that arm. `tokeniseExpr` stays "CALLED, never edited"
  (bug 0102). `isBareObjectLiteral`'s four committed verdicts plus `{ a: 1 } x`
  → `true` are pinned by cell d7. `src/parser/params.ts` is unedited and bug
  0059's suppression guard keeps suppressing, witnessed by cell d8. The
  *Message* column of `theta/parse/default-not-literal` does not move (DIAG-4),
  and no new diagnostic code, registry row or placeholder was minted.
