# Bug 0166 — `firstNonLiteral`'s unary-minus arm tests only that the operand is a `literal`, so the `params:`-default sublanguage admits `-` on a string, boolean or `null` literal against `PrimitiveLit ::= … | "-" NUMBER`: twenty-one declared-type pairings load with zero diagnostics, and because both readers of the position agree the operand's own type is the default's type while the invocation-time recovery evaluates unary `-` as JS numeric negation, `p: 'integer | boolean = -true'` binds `-1`, `p: 'Count = -"x"'` binds `NaN` and `p: 'number | null = -null'` binds `-0` behind a `default=-true` prompt token and a `p=-1 (default)` success echo — while the same admission routes `integer = -true` to `theta/parse/params-default-type-mismatch` (a type-mismatch code for a form the grammar does not derive) and nine other pairings to a post-default-merge AJV refusal one binder model call late

- **Status:** fixed (0.91.0). Residual 1 of the bug 0066 fix (0.88.0, commit `94e81974`),
  recorded there as `## Fix (0.88.0)` *Residuals* item 1
  (`0066-…md:820–823`) and surfaced by that fix's round-2 review
  (`:798–801`). §Fix is constraint-pinned, not settled: it names four candidate
  emission points with their measured blast radii, the DIAG-2 route question the
  registered row raises, and the mirror contract between the position's two
  readers that every route carries. Ordering: nothing blocks this report from
  starting.
  [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) is
  open against the same function and the same per-field default loop — its
  subject is `checkLiteralSublanguage`'s `node === undefined` fail-open arm
  (`src/parser/literal-sublanguage.ts`, the early return before
  `firstNonLiteral`), this report's is `firstNonLiteral`'s `neg` arm — so the two
  spellings are disjoint on one measured observable (0165's rows produce no node
  at all, every row here produces a `neg` node whose operand is a literal) and
  whichever lands second rebases onto the other's hunks.
- **Sev/Diff estimate:** S1/D3 — S1 because six measured spellings load with zero
  diagnostics and then bind a value the author never wrote, end to end through
  the real `runBinder`: `p: 'integer | boolean = -true'` binds `p = -1` with the
  success echo `p=-1 (default)`, `p: 'Count = -"x"'` binds `NaN`, and
  `p: 'number | null = -null'` binds `-0` while the echo renders `0` — each
  behind a binder system prompt whose own line advertises `default=-true` /
  `default=-"x"` / `default=-null`, so prompt, echo and binding disagree with the
  source on a path with no diagnostic on any surface; D3 because the fix has to
  move two readers of the same bytes in step (the is-literal check and bug 0066's
  `primitiveLiteralType`, whose design note pins the mirror deliberately), it
  changes which registered code fires for inputs that already emit one, and the
  registry's own *Trigger* wording for both rows is part of the decision.
- **Kind:** defect — the implementation admits an input the specification's own
  production set does not derive, and the two verdicts downstream of that
  admission then disagree with the source in three different ways. Four elements,
  each measured at HEAD `94e81974`.
  1. *The is-literal check admits `-` on any primitive literal.*
     `firstNonLiteral`'s `neg` arm (`src/parser/literal-sublanguage.ts`, the
     `case "neg"` at `:494–496`) returns `undefined` — admitted — whenever
     `node.operand.kind === "literal"`. The `ExprParser`'s `literal` node kind is
     one kind for string, number, boolean and `null` spans
     (`literalPrimitiveOf`, `:728`, reads which primitive off the span), so the
     arm's own comment — "Unary `-` is admitted only on a numeric literal"
     (`:495`) — describes a restriction the code does not apply.
     `checkLiteralSublanguage` returns `[]` for `-true`, `-false`, `-"x"`,
     `-'x'`, `-null` and `- true`, and for those forms nested inside array and
     object literals (measured, §Reproduction (b)).
     `PrimitiveLit ::= STRING | NUMBER | "-" NUMBER | BOOLEAN | NULL`
     (`docs/spec_topics/grammar.md:20–24`) derives none of them.
  2. *The 0066 compat reader mirrors the admission, so a non-numeric operand
     gets a static type.* `primitiveLiteralType`
     (`src/parser/literal-sublanguage.ts:672`) recurses through a `neg` node into
     its operand and types the operand's own span, so
     `defaultLiteralStaticType("-true")` is `{kind:"literal",typesAs:"boolean"}`
     and `defaultLiteralStaticType('-"x"')` is `…"string"` (measured). That
     mirror is deliberate — the design note above it (`:664–670`) states the two
     readers of these bytes must not disagree — and it is what routes
     `integer = -true` to `theta/parse/params-default-type-mismatch` with
     `expected integer, got boolean`: a type-mismatch verdict on a form that has
     no type at this position because the grammar does not admit it.
  3. *The invocation-time recovery evaluates the same bytes as numeric
     negation.* The body parser models unary `-` as
     `binary("-", null, operand)` (`src/parser/theta-document.ts:3455–3469`) and
     `evaluateBinaryExpression`'s synthetic-`null`-left arm
     (`src/extension/production-theta-producer.ts:6066–6068`) returns
     `-(value as number)`. So `#recoverDeclaredDefaults` recovers `-1` for
     `-true`, `-0` for `-false` and `-null`, and `NaN` for `-"x"` (traced;
     cross-witnessed on the body path by
     `tests/fn-arg-type-mismatch-wired.test.ts:1806–1820` over
     `src/runtime/statement-executor.ts:834–839`). The value that reaches body
     scope is a number for every spelling in this class, whatever the operand
     was.
  4. *Whether that number is refused depends on the declared type, and for six
     measured pairings it is not.* The post-default-merge AJV hook bug 0066
     wired (`#mergeDeclaredDefaults`,
     `src/extension/production-theta-producer.ts:1199`, through
     `fillDefaultsAndRevalidate`, `src/binder/defaulting.ts:117`) validates the
     merged args, so `boolean = -true` is refused at invocation
     (`/p must be boolean`) — one binder model call late, with the wrong subject
     named. A declared type whose lowered fragment admits a number accepts the
     coerced value silently: `integer | boolean`, `number | boolean`,
     `number | null`, `integer | null`, and every deferring declared type that
     lowers to a numeric fragment (`schema Count = number`). Those bind
     (measured, §Reproduction (e)).
- **Related:**
  - **0066** —
    [`0066-ajv-verdict-discarded-unreachable-enforcement.md`](./0066-ajv-verdict-discarded-unreachable-enforcement.md),
    **fixed (0.88.0)**, the filing origin and this report's substrate. Its round-2
    review flagged the admission as a pre-existing find (`:798–801`) and its
    *Residuals* item 1 hands the filing to the parent (`:820–823`). Two of its
    shipped seams frame this report: `defaultLiteralStaticType` /
    `primitiveLiteralType` (`src/parser/literal-sublanguage.ts:650`, `:672`),
    whose neg arm mirrors the is-literal verdict by design, and the now-wired
    post-default-merge hook, which is what makes nine of the pairings here loud
    at invocation instead of silent. Its registered row
    `theta/parse/params-default-type-mismatch`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:49`) enumerates the
    decidable default shapes as "a string / number / boolean / `null` literal (a
    unary-`-` numeric literal included)"; `-true` is a unary-`-` **boolean**
    literal, so the row fires today on an input its own *Trigger* enumeration
    does not name (§Fix (e)(1)).
  - **0165** —
    [`0165-empty-params-default-literal-admitted-and-never-bound.md`](./0165-empty-params-default-literal-admitted-and-never-bound.md),
    **open.** **Boundary.** Same file, same one-caller position, disjoint
    spelling: 0165 owns the default source that parses to **no node**
    (`""`, whitespace-only), refused by nothing because
    `checkLiteralSublanguage` returns before `firstNonLiteral` runs; this report
    owns a source that parses to a `neg` node whose operand **is** a literal and
    is therefore judged and admitted. The separating observable is the parse:
    `ExprParser.parse()` yields `undefined` for 0165's rows and a node for every
    row here. 0165's rows also recover nothing at invocation
    (`parseExpressionSource("")` is `null`) while every row here recovers and
    fills a value. Its `string = ` shape is pinned as a load-time deferral by
    cell c7 of `tests/params-default-type-compat.test.ts:444`.
  - **0163** —
    [`0163-params-default-type-compat-unchecked-at-load.md`](./0163-params-default-type-compat-unchecked-at-load.md),
    **fixed (0.88.0)**, discharged by bug 0066's fix in the same commit. It owns
    a default the sublanguage admits whose value is incompatible with the declared
    type, and the load-time compat gate that discharged it is what this report's
    element 2 rides. The distinction: 0163's
    rows are legal literals in the wrong type (`integer = "xyzzy"`), these are
    not literals of the position's grammar at all, which is why routing them
    through a type-mismatch code names the wrong defect.
  - **0102** —
    [`0102-params-default-string-literal-raw-newline-admitted.md`](./0102-params-default-string-literal-raw-newline-admitted.md),
    **fixed (0.75.0)**, the sibling default-RHS rule in the same per-field loop
    (`hasRawNewlineInStringLiteral`, `src/parser/literal-sublanguage.ts:606`,
    called from `src/parser/params.ts:353`). It reaches a neg spelling only when
    a string span carries a raw line break — `p: 'string = -"a<LF>b"'` draws
    `theta/parse/literal-newline-in-string` (measured, §Reproduction (f)) — and
    it does not look at the operator. Every fixture in this report is
    single-line, so that rule is silent on all of them.
  - **0059** —
    [`0059-params-scalar-nontype-text-recorded-and-permissive.md`](./0059-params-scalar-nontype-text-recorded-and-permissive.md),
    **fixed (0.86.0)**, the type-half refusal and the suppression guard every
    route here must leave intact (`src/parser/params.ts:349`; the third
    precedence rule of `code-registry-load.md:19`). Measured:
    `p: 'lol wut = -true'` draws exactly one diagnostic
    (`theta/load/params-type-not-expression`), with the default-side checks
    suppressed. Junk text on the default half was already refused before that fix
    and is unrelated to this class: `-true` is not junk text, it parses and it is
    admitted on its own terms.
  - **0050** —
    [`0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md`](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md),
    **fixed (0.77.0)**, the body-position twin of the typing question and the
    reason this report's frame stops at the `params:` default. Its witness pins
    that a body `-true` reads as `boolean` statically
    (`src/parser/static-type-inference.ts:311–317`, unary `-` types as its
    operand) while evaluating to `-1`, and that the `fn`-argument sink therefore
    WITHHOLDS on it (cells u10 / u10b,
    `tests/fn-arg-type-mismatch-wired.test.ts:1789`, `:1806`). Body code is not a
    literal-sublanguage position and §Non-goals keeps it out of frame; the shared
    convention is named in §Fix (e)(2) so no route changes it by accident.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/parser/params.ts` is 1226 lines and
    `src/extension/production-theta-producer.ts` 6105 lines at this HEAD, and
    open reports insert into both, which is why every volatile position below is
    named by symbol beside its line.
- **Affected** (every citation re-verified against the tree at HEAD `94e81974`,
  v0.88.0; symbols named beside lines):
  - **The admitting arm.** `firstNonLiteral`
    (`src/parser/literal-sublanguage.ts:490`), its `case "neg"` (`:494–496`) and
    the comment stating the numeric restriction (`:495`), its `case "literal"`
    (`:492–493`), and its container recursion for arrays (`:500–507`) and objects
    (`:508–515`) through which the same admission reaches nested positions. The
    `ExprNode` `neg` shape (`:100`) and the `parseUnary` production that mints it
    for any operand (`:319–331`). Its one caller in the module is
    `checkLiteralSublanguage` (`:54`, the `firstNonLiteral` call at `:65`),
    whose diagnostic is `theta/parse/default-not-literal` with the offending span
    interpolated (`:70–78`). `LiteralPosition` is the single value `"default"`
    (`:40`).
  - **The mirrored reader.** `defaultLiteralStaticType`
    (`src/parser/literal-sublanguage.ts:650`) and its design note (`:610–649`,
    the decided-set and deferral paragraphs); `primitiveLiteralType` (`:672`),
    its `neg` recursion (`:676–678`) and its own note pinning the mirror
    (`:664–670`); `flatArrayStaticType` (`:700`), which carries the same
    admission into flat array defaults; `literalPrimitiveOf` (`:728`), where one
    `literal` node kind is resolved to `string` / `boolean` / `null` /
    `integer` / `number` off its span.
  - **The position that runs both.** `parseParams` (`src/parser/params.ts:154`):
    the `required` decision keyed on `defaultSource` alone (`:277–279`), the
    cross-field ordering rule (`:300–312`), the empty compat `TypeEnv`
    (`:337`), the per-field default loop (`:338–394`) with the bug-0059
    type-half suppression guard (`:349`), the raw-newline refusal (`:353`), the
    `checkLiteralSublanguage` call (`:363`), the one-diagnostic-per-field
    precedence guard (`:375–377`), the `paramsDeclaredCompatType` /
    `defaultLiteralStaticType` pairing (`:378–381`), the
    `checkParamsDefaultCompat` call (`:386`), the error gate (`:399–402`) and the
    lowered document (`:404–415`).
  - **The compat sink.** `paramsDeclaredCompatType`
    (`src/parser/type-compat.ts:733`), whose `named` fallthrough (`:764`) is what
    makes a `NamedType`, alias, inline-object or literal-typed declared half
    defer; `checkParamsDefaultCompat` (`:779`), its `"compatible" | "unknown"`
    silence (`:787–790`) and its two emissions — `theta/parse/integer-narrowing`
    (`:791–803`) and `theta/parse/params-default-type-mismatch` (`:804–815`).
  - **The record and the render.** `splitParamValue`
    (`src/parser/frontmatter.ts:636`), which records the default half verbatim
    after a trim, and `hasDefault: defaultSource !== undefined` (`:796`);
    `binderPromptParamField` (`src/extension/production-theta-producer.ts:629`),
    which mints `{kind:"default", literal: field.defaultSource}` (`:633–636`);
    `renderBinderParamLine` (`src/binder/binder-system-prompt.ts:168`) and
    `buildBinderSystemPrompt` (`:285`), which put the recorded source after
    `default=` verbatim — measured `p (integer | boolean) default=-true` and
    `p (Count) default=- true`; `classifyBinderBypass`
    (`src/binder/binder-envelope.ts:204`), which returns `binder` for every
    fixture here, so the model call is unconditional.
  - **The invocation seam.** `runBinder`
    (`src/extension/production-theta-producer.ts:681`), the merge call (`:866`),
    the verdict routing added by bug 0066 (`:873–876`) and the success echo
    (`:881`); `#mergeDeclaredDefaults` (`:1199`), which now compiles and
    validates whenever a lowered `params:` schema exists (`:1221–1223`);
    `#recoverDeclaredDefaults` (`:1236`), its `splitParamDefaultSource` call
    (`:1268`), the `parseExpressionSource` null-skip (`:1272–1275`) and the
    `evaluatePureExpression` fill (`:1276`); `evaluateBinaryExpression`'s
    synthetic-`null`-left unary arm (`:6066–6068`);
    `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:117`), its
    fill-if-absent loop (`:127–132`) and the AJV call over the merged document
    (`:151`); `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:90`), which projects each
    merged entry into body scope.
  - **Spec.** `docs/spec_topics/grammar.md:9` (the sublanguage's one position and
    the is-literal check), `:14` (the closed `Literal` production set), `:20–24`
    (`PrimitiveLit`, whose third alternative is `"-" NUMBER` with the comment
    "unary minus on a numeric literal counts as a literal"), `:48` (*Forbidden
    inside a literal*), `:51` ("Operators other than the unary `-` carve-out for
    numeric literals");
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults — "A
    param may declare a default with `field: type = literal`", "Primitive
    literals (including unary-`-` on numeric literals)", the violation set and
    the fill-before-AJV sentence);
    `docs/spec_topics/expressions.md:232` (§Other arithmetic — "`-`, `*`, `/`,
    `%` accept only numeric operands");
    `docs/spec_topics/diagnostics/code-registry-parse.md:48`
    (`theta/parse/default-not-literal` — *Trigger* and *Message*), `:49`
    (`theta/parse/params-default-type-mismatch` — the decidable/deferral
    partition and the two precedence rules), `:24`
    (`theta/parse/integer-narrowing`);
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`theta/load/params-type-not-expression` and its third precedence rule);
    `docs/spec_topics/type-system.md:50` (TYPE-9's four-site enumeration naming
    the `params:`-default site), `:54` (TYPE-11 alias transparency, which is why
    a `schema Count = number` declared half defers at load and enforces at AJV);
    `docs/spec_topics/binder/binder-bypass-and-envelope.md:123` (the requirement
    token), `:142` (*Default-literal rendering* — the `<literal>` "MUST be the
    field's default value rendered in the [Theta literal sublanguage] surface
    syntax");
    `docs/spec_topics/binder/defaulting-system-note-echo.md:7` (defaults filled
    before AJV validation), `:9` (fill-if-absent), `:11` (the named
    post-default-merge AJV hook);
    `docs/spec_topics/binder/determinism-cancellation-failure.md:35` (the
    AJV-on-`args` class), `:52` (its rendered row);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
    Reference mirrors restating the numeric bound:
    `docs/reference/grammar.md:539` ("operators other than unary `-` on a numeric
    literal"), `docs/reference/frontmatter.md:102` ("primitives (incl. unary-`-`
    on numerics)"), `docs/reference/diagnostics.md:94`, `:95`.
  - **The committed cells a fix must not red.**
    `tests/e2e-s1-grammar-literal-sublang.test.ts:26–32` asserts
    `checkLiteralSublanguage("-5", …)` draws no `default-not-literal` — the
    carve-out's positive control. `tests/params-default-type-compat.test.ts:396`
    (cell b2, `integer = -1.5`) pins the unary-minus **decimal** at exactly one
    `theta/parse/integer-narrowing`, and its label states the premise ("the
    sublanguage admits it"); `:395` and `:397` are the same direction's positive
    and element-level rows. That file's deferral table (`:425–460`, cells c1–c13)
    and refusal table carry no unary-minus row, so no cell there covers the
    class. `tests/params-scalar-nontype-text-refusal.test.ts` cell f1 (`:1075`, through
    `expectTextRefused`, `:312–319`) pins the bug-0059 suppression at one
    diagnostic, and cell f2 (`:1087`) pins the guard's one-directionality.
    `tests/binder-param-line-newline-normalisation.test.ts:850`, `:902` call
    `checkLiteralSublanguage` on rendered default literals and assert `[]`; no
    literal in that file carries a unary `-` (grepped).
  - **Direct callers, counted at HEAD.** `checkLiteralSublanguage` has exactly
    one production caller (`src/parser/params.ts:363`) and seven committed direct
    test call sites in three files —
    `tests/e2e-s1-grammar-literal-sublang.test.ts:27`, `:35`, `:44` and
    `tests/type-grammar.test.ts:132`, `:150` (five fixed sources: `-5`,
    `Severity.High`, `a.b.c`, `a + b`, `{ k: f(x) }`) plus
    `tests/binder-param-line-newline-normalisation.test.ts:850`, `:902` (a
    rendered literal, `defaultLiteralOf`, `:526`).
    `defaultLiteralStaticType` has one production caller
    (`src/parser/params.ts:381`) and no direct test caller; it is exercised only
    through `parseParams`.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; 17 declare `params:`; exactly one committed default exists —
    `count: number = 3` in
    `tests/live/acceptance/fixtures/acc-params-binder.theta` — and it carries no
    unary `-`. No committed `.theta` / `.thetalib` in the repository (including
    the 21 under `docs/`) spells a `= -` default, so
    `tests/committed-fixture-parse-gate.test.ts` never meets one and no
    committed fixture is in the newly-refused set of any route below.
- **Observed at:** v0.88.0 (`94e81974`). Offline, deterministic, provider-free:
  three scratch vitest probes over the shipped load path `parseThetaDocument`
  through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the shipped
  `checkLiteralSublanguage` / `defaultLiteralStaticType` /
  `hasRawNewlineInStringLiteral` / `parseExpressionSource` seams, the production
  `AjvSchemaValidator` (`src/seams/schema-validator.ts`) built with the shipped
  content-addressing, and the real `ProductionThetaProducer.runBinder` driven
  through `createProductionProducerDeps` with the off-session pi-ai `complete()`
  mocked and an in-memory `FileSystem` backing default recovery (the harness
  pattern of `tests/binder-post-merge-ajv-enforcement.test.ts:363–517`);
  written, run, deleted. Every value below is those runs' output verbatim over a
  tree `git status --short --untracked-files=no` reported clean at `94e81974`.

## Summary

`firstNonLiteral`'s `neg` arm admits unary `-` whenever its operand parses to a
`literal` node. That node kind covers string, number, boolean and `null` spans
uniformly, so `-true`, `-false`, `-"x"`, `-'x'`, `-null` and `- true` all pass
the is-literal gate, as do the same forms nested in array and object literals.
The grammar admits `"-" NUMBER` only (`grammar.md:22`), and the arm's own comment
says so.

Bug 0066's `primitiveLiteralType` reads the same bytes and mirrors the admission
deliberately — its design note requires the two readers of the position not to
disagree — so `-true` acquires the static type `boolean` and `-"x"` the static
type `string`. That produces three dispositions from one admission, all measured
at HEAD:

- **Refused at load with a type-mismatch code.** `integer = -true` draws
  `theta/parse/params-default-type-mismatch: param 'p' default type mismatch:
  expected integer, got boolean`; `integer = -null` the same with `got null`.
  The theta does not register, but the diagnostic names an incompatible type
  where the defect is a form the position's grammar does not derive, and the row
  fires on an input its own *Trigger* enumeration does not name (it names "a
  unary-`-` numeric literal").
- **Loads clean, refused at invocation.** Nine measured pairings —
  `boolean = -true`, `string = -"x"`, `null = -null`,
  `array<boolean> = [-true]`, `boolean | null = -true`, `"a" | "b" = -true`,
  `{ a: boolean } = -true`, `Sev = -true` and `S = { a: -true }` — load with zero
  diagnostics, spend one binder model call, and fail at the post-default-merge
  AJV hook (`theta /<name>: argument binding produced invalid args — /p must be
  boolean`). The refusal is correct-but-late and names the merged value's type,
  not the source's form.
- **Loads clean, binds a value the author never wrote.** The recovery evaluates
  unary `-` as JS numeric negation (`-(value as number)`), so the filled value is
  `-1` for `-true`, `-0` for `-false` and `-null`, and `NaN` for `-"x"`. When the
  declared type's lowered fragment admits a number, AJV accepts and the theta
  runs: `integer | boolean = -true` binds `-1`, `integer | null = -null` and
  `number | null = -null` bind `-0`, and under an alias-declared
  `schema Count = number` all three of `-true`, `- true` and `-"x"` bind (`-1`,
  `-1`, `NaN`). The binder system prompt advertises `default=-true`, the success
  echo renders `p=-1 (default)` — and for `-0` the echo renders `0` while the
  bound value is `-0`.

## Reproduction

Offline, deterministic, at HEAD `94e81974`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`; the shipped
`checkLiteralSublanguage`, `defaultLiteralStaticType`,
`hasRawNewlineInStringLiteral` and `parseExpressionSource`; a real
`AjvSchemaValidator`; and the real `runBinder` with the off-session `complete()`
mocked. Each fixture is a `mode: prompt` theta whose `params:` block declares
`topic: string` (required) and one defaulted field `p` — the shape that forces
the binder path.

### (a) The four subject rows at load

`diags` is the whole diagnostic list for the file, rendered
`<severity> <code>: <message>`.

| `params:` right-hand side | `diags` |
| --- | --- |
| `integer = -true` | `["error theta/parse/params-default-type-mismatch: param 'p' default type mismatch: expected integer, got boolean"]` |
| `string = -"x"` | `[]` |
| `integer = -null` | `["error theta/parse/params-default-type-mismatch: param 'p' default type mismatch: expected integer, got null"]` |
| `integer = -1` (control) | `[]` |

The two silent rows record `defaultSource` `-"x"` / `-1`, `hasDefault: true`,
`required: []`, `defaultedFields: ["p"]`, and lower `{"type":"string"}` /
`{"type":"integer"}`. The two refused rows withhold the lowered document
(`parseParams`'s error gate). The admission is therefore not uniformly silent at
this HEAD — bug 0066's compat gate makes the `integer`-declared pair loud — which
is why the split below is measured pairing by pairing rather than by default
spelling.

### (b) The two readers of the same bytes

`check` is `checkLiteralSublanguage(source, "default", site)`; `staticType` is
`defaultLiteralStaticType(source)`; `body` is the shape
`parseExpressionSource(source)` returns.

```
-true       check []                       staticType {literal, boolean}   body binary op=- left=null right=bool
-false      check []                       staticType {literal, boolean}   body binary op=- left=null right=bool
-"x"        check []                       staticType {literal, string}    body binary op=- left=null right=string
-'x'        check []                       staticType {literal, string}    body binary op=- left=null right=string
-null       check []                       staticType {literal, null}      body binary op=- left=null right=null
- true      check []                       staticType {literal, boolean}   body binary op=- left=null right=bool
-1          check []                       staticType {literal, integer}   body binary op=- left=null right=number
-1.5        check []                       staticType {literal, number}    body binary op=- left=null right=number
[-true]     check []                       staticType {array, element {literal, boolean}}
[-true,-false] check []                    staticType {array, element {literal, boolean}}
{a: -true}  check []                       staticType undefined (object defers)
--1         check [default-not-literal: … offending sub-expression: --1]     staticType undefined
-[1]        check [default-not-literal: … offending sub-expression: -[1]]     staticType undefined
-{a: 1}     check [default-not-literal: … offending sub-expression: -{a: 1}]  staticType undefined
-Sev.A      check [default-not-literal: … offending sub-expression: -Sev.A]   staticType undefined
!true       check [default-not-literal: … offending sub-expression: !true]    staticType undefined
-true + 1   check [default-not-literal: … offending sub-expression: -true + 1] staticType undefined
```

`hasRawNewlineInStringLiteral` is `false` for every row above. The refused rows
identify the arm's bound precisely: the operand must be a `literal` node, so a
second `-`, an array, an object and an `Enum.Variant` are all rejected, and
`- true` (whitespace between operator and operand) is admitted because the
tokeniser does not care. The admission is not confined to the top level: it rides
`firstNonLiteral`'s array and object recursion.

### (c) Load-time verdicts, decidable declared types

Each row is one `params:` field. `lowered` is `properties.p` of the lowered
document, absent where the load is refused.

| `params:` right-hand side | `diags` | `lowered` |
| --- | --- | --- |
| `boolean = -true` | `[]` | `{"type":"boolean"}` |
| `string = -"x"` | `[]` | `{"type":"string"}` |
| `null = -null` | `[]` | `{"const":null}` |
| `integer \| boolean = -true` | `[]` | `{"type":["integer","boolean"]}` |
| `number \| boolean = -true` | `[]` | `{"type":["number","boolean"]}` |
| `number \| null = -null` | `[]` | `{"type":["number","null"]}` |
| `integer \| null = -null` | `[]` | `{"type":["integer","null"]}` |
| `boolean \| null = -true` | `[]` | `{"type":["boolean","null"]}` |
| `array<boolean> = [-true]` | `[]` | `{"type":"array","items":{"type":"boolean"}}` |
| `array<boolean> = [-true, true]` | `[]` | `{"type":"array","items":{"type":"boolean"}}` |
| `integer \| boolean = -false` | `[]` | `{"type":["integer","boolean"]}` |
| `integer = -true` | `params-default-type-mismatch` (`expected integer, got boolean`) | withheld |
| `integer = -null` | `params-default-type-mismatch` (`expected integer, got null`) | withheld |
| `number = -true` | `params-default-type-mismatch` (`expected number, got boolean`) | withheld |
| `number \| null = -false` | `params-default-type-mismatch` (`expected number \| null, got boolean`) | withheld |
| `integer \| null = -true` | `params-default-type-mismatch` (`expected integer \| null, got boolean`) | withheld |
| `array<number> = [-true]` | `params-default-type-mismatch` (`expected array<number>, got array<boolean>`) | withheld |
| `integer = -1` (control) | `[]` | `{"type":"integer"}` |
| `number = -1.5` (control) | `[]` | `{"type":"number"}` |
| `integer = -1.5` (control) | `integer-narrowing` (`cannot narrow number to integer`) | withheld |

The partition is exactly the compat relation over the mirrored static type: the
row is refused at load when the operand's own primitive is `⋢` the declared type
and silent when it is `⊑` it. Nothing anywhere asks whether the operand was
numeric — `integer | boolean = -true` is silent and `integer | null = -true` is
refused over the same default bytes, because the first union has a `boolean` arm
and the second does not.

### (d) Load-time verdicts, deferring declared types — all silent

| `params:` right-hand side | body declaration | `diags` | `lowered` |
| --- | --- | --- | --- |
| `Sev = -true` | `enum Sev { A, B }` | `[]` | `{"$ref":"#/$defs/Sev"}`, `Sev` = `{"type":"string","enum":["A","B"]}` |
| `Count = -true` | `schema Count = number` | `[]` | `{"$ref":"#/$defs/Count"}`, `Count` = `{"type":"number"}` |
| `Count = -null` | `schema Count = number` | `[]` | same |
| `Count = -"x"` | `schema Count = number` | `[]` | same |
| `Flag = -true` | `schema Flag = boolean` | `[]` | `{"$ref":"#/$defs/Flag"}`, `{"type":"boolean"}` |
| `S = -true` | `schema S { a: boolean }` | `[]` | `{"$ref":"#/$defs/S"}` |
| `S = { a: -true }` | `schema S { a: boolean }` | `[]` | same |
| `S = S { a: -true }` | `schema S { a: boolean }` | `[]` | same |
| `"a" \| "b" = -true` | — | `[]` | `{"type":"string","enum":["a","b"]}` |
| `{ a: boolean } = -true` | — | `[]` | `{"$ref":"#/$defs/__inline_bd65845ea038dcc3"}` |

Every declared half here answers `"unknown"` against the empty `TypeEnv`
(`paramsDeclaredCompatType`'s `named` fallthrough, or an object/literal shape),
so the compat gate declines by design and the only judge left is the runtime.

### (e) The end-to-end drive — real `runBinder`, scripted envelope

The binder returns `{kind:"ok", args:{topic:"hello"}}` — the defaulted field
omitted, exactly as the system prompt instructs. `prompt token` is read off the
captured binder call's `Parameters:` block. Every row spent exactly one binder
model call.

**Bound, with a value the source does not spell:**

| `params:` right-hand side | prompt token | merged `args` | echo |
| --- | --- | --- | --- |
| `integer \| boolean = -true` | `default=-true` | `{topic:"hello", p:-1}` | `Running /…: topic=hello, p=-1 (default)` |
| `number \| null = -null` | `default=-null` | `p` is `-0` | `topic=hello, p=0 (default)` |
| `integer \| null = -null` | `default=-null` | `p` is `-0` | `topic=hello, p=0 (default)` |
| `Count = -true` | `default=-true` | `{topic:"hello", p:-1}` | `topic=hello, p=-1 (default)` |
| `Count = - true` | `default=- true` | `{topic:"hello", p:-1}` | `topic=hello, p=-1 (default)` |
| `Count = -"x"` | `default=-"x"` | `p` is `NaN` | `topic=hello, p=NaN (default)` |

**Refused at the post-default-merge hook (`bound: false`, no echo, no body
run):**

| `params:` right-hand side | note on the `theta-system-note` channel |
| --- | --- |
| `boolean = -true` | `theta /…: argument binding produced invalid args — /p must be boolean` |
| `string = -"x"` | `… — /p must be string` |
| `null = -null` | `… — /p must be equal to constant` |
| `array<boolean> = [-true]` | `… — /p/0 must be boolean` |
| `boolean \| null = -true` | `… — /p must be boolean,null` |
| `{ a: boolean } = -true` | `… — /p must be object` |
| `S = { a: -true }` | `… — /p/a must be boolean` |
| `"a" \| "b" = -true` | `… — /p must be equal to one of the allowed values; /p must be string` |
| `Sev = -true` | `… — /p must be equal to one of the allowed values; /p must be string` |

**Controls:** `integer = -1` binds `{topic:"hello", p:-1}` with echo
`p=-1 (default)`; `boolean = true` binds `p: true` with echo `p=true (default)`.
Both are conformant sources and are unchanged by this defect.

The split is one predicate: the coerced number is bound when the lowered fragment
admits a number and refused otherwise. Real AJV over each lowered document
confirms it directly — `{"type":["number","boolean"]}` accepts `-1`, `-0` and
`NaN`; `{"type":"number"}` accepts all three; `{"type":"integer"}` accepts `-1`
and `-0` and refuses `NaN`; `{"type":"boolean"}`, `{"type":"string"}`,
`{"const":null}` and the enum / object fragments refuse all three.

### (f) Boundary rows — the neighbouring rules

```
p: 'lol wut = -true'            diags ["error theta/load/params-type-not-expression: …"]   (exactly one; 0059 suppression holds)
p: | string = -"a<LF>b"         diags ["error theta/parse/literal-newline-in-string: …"]   (0102's rule, on the span)
p: 'boolean = -true' + q: string diags ["error theta/parse/non-trailing-default: …"]
p: 'integer = --1'              diags ["error theta/parse/default-not-literal: … --1"]
p: 'array<integer> = -[1]'      diags ["error theta/parse/default-not-literal: … -[1]"]
p: 'Sev = -Sev.A'               diags ["error theta/parse/default-not-literal: … -Sev.A"]
```

The type-half refusal keeps the default-side checks suppressed at one diagnostic
for a field whose type half is junk, and 0102's raw-newline rule reaches a neg
default only through the string span it already owns. Neither rule reaches the
single-line non-numeric spellings.

## Expected behaviour

- `docs/spec_topics/grammar.md:20–24` — the production set is closed and
  spells the operator's operand:
  `PrimitiveLit ::= STRING | NUMBER | "-" NUMBER | BOOLEAN | NULL`, with the
  inline comment on the third alternative, "unary minus on a numeric literal
  counts as a literal". There is no `"-" BOOLEAN`, `"-" STRING` or `"-" NULL`
  alternative, and `Literal` (`:14`) has no other arm that derives one.
- `docs/spec_topics/grammar.md:51` (*Forbidden inside a literal*) — "Operators
  other than the unary `-` carve-out for numeric literals (no `+`, no `&&`, no
  comparison, no ternary)." The carve-out is stated with its operand restriction
  in the same clause, and `:9` states the mechanism: "the parser performs an
  'is-literal' check after parsing the AST in that position. A failure is
  `theta/parse/default-not-literal`; the diagnostic names the offending
  sub-expression."
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults) —
  "Primitive literals (including unary-`-` on numeric literals), `null`, array
  literals, bare-key object literals … are all admitted. Operators, function
  calls, identifier references other than `Enum.Variant`, `${...}` interpolation,
  and `@`...`` query templates are not; violations are
  `theta/parse/default-not-literal`". The parenthetical is the same numeric
  bound, and the sentence puts the remaining operators in the violation set.
- `docs/reference/grammar.md:539` and `docs/reference/frontmatter.md:102` — the
  two reference mirrors restate it ("operators other than unary `-` on a numeric
  literal"; "primitives (incl. unary-`-` on numerics)"), so the numeric bound is
  the documented contract on every surface an author reads.
- `docs/spec_topics/expressions.md:232` (§Other arithmetic) — "`-`, `*`, `/`,
  `%` accept only numeric operands." The operator itself is specified for numeric
  operands, so no reading of `-true` yields a boolean value: the runtime's
  `-(value as number)` produces a number for it, measured `-1`.
- `docs/spec_topics/diagnostics/code-registry-parse.md:48` — the registered
  *Trigger* of `theta/parse/default-not-literal`: "A `params:` default RHS
  **contains a form outside** the [Theta literal sublanguage] (operator, function
  call, identifier reference other than `Enum.Variant`, `${...}` interpolation,
  or `@`...`` template)." A unary `-` on a boolean, string or `null` literal is
  an operator outside the sublanguage's own carve-out, so this row's stated
  trigger set claims the input as written, and its *Message* interpolates a
  sub-expression that exists (`-true`). This is the difference from bug 0165,
  whose input the same row's *Trigger* does not claim.
- `docs/spec_topics/diagnostics/code-registry-parse.md:49` — the *Trigger* of
  `theta/parse/params-default-type-mismatch` enumerates the default-literal
  shapes the position decides: "a string / number / boolean / `null` literal (a
  unary-`-` numeric literal included) and a homogeneous array literal of them".
  A unary-`-` **boolean** literal is not in that enumeration, so the diagnostic
  measured for `integer = -true` in §Reproduction (a) is an emission the row's
  own *Trigger* does not describe. The same row's second precedence rule states
  where the input belongs: "a field whose default half already drew
  `theta/parse/literal-newline-in-string` or `theta/parse/default-not-literal`
  keeps that diagnostic alone — this row does not run for either."
- `docs/spec_topics/binder/binder-bypass-and-envelope.md:142` (*Default-literal
  rendering*) — the `<literal>` after `default=` "MUST be the field's default
  value rendered in the [Theta literal sublanguage] surface syntax — the same
  notation accepted on the RHS of `params:` defaults." The measured tokens
  `default=-true`, `default=- true` and `default=-"x"` are not sublanguage forms,
  so the prompt line is unspellable in the notation its own contract names; and
  where the theta binds, the value the model was shown (`-true`) is not the value
  the body receives (`-1`).
- `docs/spec_topics/binder/defaulting-system-note-echo.md:9` — "when the wire
  name is absent, the field takes its declared default". For the six bound rows
  the field takes a numeric negation of its declared default instead.
- `docs/spec_topics/governance/source-language-stability.md:9` — the
  loads-cleanly predicate. Every fixture in §Reproduction (c) (the silent rows),
  (d) and (e) satisfies it at HEAD, which puts a refusal in the
  diagnostic-registry carve-out's addition direction (`:25`) rather than outside
  GOV-15.

## Actual behaviour / root cause

**1. One node kind, four primitives.** The module's `ExprParser` emits a single
`literal` node kind for every primitive span; which primitive it was is recovered
later by reading the span (`literalPrimitiveOf`,
`src/parser/literal-sublanguage.ts:728`, keyed on the leading byte and the
digit-only test). `firstNonLiteral`'s `neg` arm tests the kind and nothing else:

```ts
    case "neg":
      // Unary `-` is admitted only on a numeric literal.
      return node.operand.kind === "literal" ? undefined : node;
```

The comment states the grammar's rule; the expression implements a weaker one.
`parseUnary` (`:319–331`) builds a `neg` node for any operand, so the arm is the
only place the restriction could be applied at this position, and every
non-numeric primitive operand reaches it as a `literal`. The container arms
(`:500–515`) recurse without re-deciding, which is how `[-true]` and
`{a: -true}` inherit the admission.

**2. The second reader mirrors it, by design.** `primitiveLiteralType` (`:672`)
was added by the bug-0066 fix and takes the same test:

```ts
  if (node.kind === "neg") {
    return node.operand.kind === "literal" ? primitiveLiteralType(node.operand, source) : undefined;
  }
```

Its note (`:664–670`) explains why it must: a second reader of the same bytes
that disagreed with the is-literal verdict would refuse forms the position admits
or type forms it rejects. Given the shipped admission, `-true` types as
`boolean` — the operand's own primitive, sign discarded. `parseParams` then pairs
that with the declared half (`src/parser/params.ts:378–386`) and
`checkParamsDefaultCompat` (`src/parser/type-compat.ts:779`) emits
`theta/parse/params-default-type-mismatch` when the relation fails and nothing
when it holds or is unresolvable. That is the whole load-time partition measured
in §Reproduction (c) and (d): the pairing decides the verdict, and no reader in
the chain has retained the fact that an operator was applied.

**3. The value is a number regardless.** At invocation
`#recoverDeclaredDefaults` (`src/extension/production-theta-producer.ts:1236`)
re-reads the field scalar, splits the same `=`, and parses the default with the
BODY parser, which models unary `-` as a binary with a synthetic `null` left
operand (`src/parser/theta-document.ts:3461–3469`). `evaluateBinaryExpression`
(`:6066–6068`) has the matching arm:

```ts
  if (op === "-" && leftExpr.kind === "null") {
    return -(evaluatePureExpression(rightExpr, env) as number);
  }
```

so the recovered `defaultValue` is `-1` for `-true`, `-0` for `-false` and
`-null`, and `NaN` for `-"x"` — JS numeric negation of a coerced operand. The
same arm exists on the body path (`src/runtime/statement-executor.ts:834–839`)
and is already witnessed there by cell u10b of
`tests/fn-arg-type-mismatch-wired.test.ts:1806–1820`, which records the value as
`-1` "while the read claims `boolean`". The static read and the runtime value
disagree by construction, and this position is where the disagreement crosses
into a bound parameter.

**4. The runtime net catches some of it.** `#mergeDeclaredDefaults` (`:1199`)
now compiles the lowered `params:` schema and validates the merged args
unconditionally — bug 0066's fix — and `runBinder` routes a non-`ok`
classification to `#emitBinderFailureNote` + `{bound: false}` before the echo
(`:873–876`). So the nine pairings in §Reproduction (e)'s second table stop
before the body, correctly, one binder call late, with a message about the merged
value's JSON type. The six in the first table pass: an
`["integer","boolean"]` type list admits `-1` as much as `true`, a
`["number","null"]` list admits `-0`, and an alias-declared
`schema Count = number` admits all three coerced
values including `NaN` (measured: `NaN` validates against `{"type":"number"}` in
the shipped AJV build). For those,
`fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:127–132`) records the
field as default-supplied, the echo tags it `(default)`, and `paramBindingsFrom`
(`src/extension/theta-composition-producer.ts:90`) projects the number into body
scope under the declared name.

**5. Nothing downstream can recover the source.** The record the parser keeps is
the default's SOURCE text (`splitParamValue`, `src/parser/frontmatter.ts:636`),
and the render seam interpolates it verbatim
(`binderPromptParamField` → `renderBinderParamLine`), so the prompt says
`default=-true` while the merge says `-1`. The `-0` rows diverge once more at the
render: the echo prints `p=0` because the runtime value model normalises `-0` to
`0` on render, while the bound value is `-0`. Every seam here is behaving
correctly for the record it was handed; the record is of a form the position was
not supposed to admit.

## Why it matters

- **A theta binds a value its source does not spell, with no diagnostic on any
  surface.** Measured end to end through the real producer:
  `p: 'integer | boolean = -true'` loads with `diags []`, takes the binder path,
  and binds `p = -1`; `p: 'Count = -"x"'` binds `NaN`; `p: 'number | null =
  -null'` binds `-0`. A body `match p { … }`, comparison or interpolation then
  runs against a number where the source wrote a boolean, a string or `null`.
- **`NaN` is not a JSON value.** `Count = -"x"` binds `NaN`, which
  `JSON.stringify` renders as `null` (measured) — so the same binding is a number
  in body scope and `null` across any boundary that serialises the args as JSON.
  The theta that produced it drew no diagnostic.
- **The model is grounded in one value and the body runs on another.** The
  binder system prompt's own line says `default=-true`
  (`binder-bypass-and-envelope.md:142` requires that token to be a
  literal-sublanguage rendering of the default value), and the success echo
  reports `p=-1 (default)`. Prompt, echo and source disagree in one turn.
- **Where the runtime net catches it, the cost is already spent and the subject
  is wrong.** Nine pairings fail at the post-default-merge hook after exactly one
  binder model call (measured), with `argument binding produced invalid args —
  /p must be boolean`. The author's defect is at load time in the source text;
  the report is at invocation time about a merged JSON document.
- **The load-time refusals that do fire name the wrong defect and sit outside
  their own row's Trigger.** `integer = -true` draws `expected integer, got
  boolean` — an incompatibility verdict on a form the grammar does not derive —
  and `theta/parse/params-default-type-mismatch`'s *Trigger*
  (`code-registry-parse.md:49`) enumerates only "a unary-`-` numeric literal"
  among the unary shapes it decides. The registry's own precedence rule says a
  default half refused by `theta/parse/default-not-literal` keeps that diagnostic
  alone, which is the ordering the missing refusal would restore.
- **The verdict for one source depends on a type the source never mentions.**
  `-true` is refused at load under `integer`, refused at invocation under
  `boolean`, and bound under `integer | boolean`. Three dispositions for one
  ill-formed spelling, decided by the declared half.
- **Every declared type that defers is silent by construction.** A `NamedType`,
  an alias, an inline object type and a literal-typed declared half all answer
  `"unknown"` against the empty `TypeEnv` (by design — bug 0066's documented
  deferral), so the load-time compat gate judges none of the ten pairings in
  §Reproduction (d). For them the is-literal check is the only load-time judge of
  the default's form, and it admits.
- **The arm's own comment already states the rule it does not enforce**
  (`literal-sublanguage.ts:495`), and three documents state it normatively
  (`grammar.md:22`, `:51`, `frontmatter-fields-a.md:60`), plus two reference
  mirrors. The divergence is between the code and every written description of
  it, including its own.
- **No gate scores it.** No committed `.theta` / `.thetalib` spells a `= -`
  default (census: one committed default in 34 files, `count: number = 3`), the
  only committed unary-minus cell is `integer = -1.5`
  (`tests/params-default-type-compat.test.ts:396`, a numeric row), and none of
  the seven committed direct `checkLiteralSublanguage` calls passes a non-numeric
  neg source. The arm is unwitnessed in the direction that matters.

## Fix

Not settled. Four candidate emission points are pinned below with their measured
blast radii; the run selects one and states the evidence that decided it. Every
route carries the constraints in (e), including the mirror contract in (e)(2) —
the position's two readers must agree after the change as they agree now.

### (a) Narrow `firstNonLiteral`'s `neg` arm to a numeric-literal operand

Admit `neg` only when the operand is a `literal` whose span is numeric — the test
`literalPrimitiveOf` already performs (`literal-sublanguage.ts:728`: a span that
is neither quote-led nor `true` / `false` / `null` types as `integer` or
`number`) — and return the `neg` node as
the offending sub-expression otherwise, so `checkLiteralSublanguage` emits
`theta/parse/default-not-literal` with the span already measured for `-[1]` and
`--1` (§Reproduction (b)).

- **It decides every row in the class at one site.** Top-level, array-element
  and object-field-value spellings all flow through this arm
  (`:494–496`, `:500–515`), and the whitespace form `- true` with them.
- **The blast radius is one production caller.**
  `src/parser/params.ts:363`; `LiteralPosition` has the single value `"default"`.
  Seven committed direct test calls in three files, of which `-5`
  (`tests/e2e-s1-grammar-literal-sublang.test.ts:27`) is the carve-out's positive
  control and must stay green; the other six pass no unary source.
- **It changes which code fires for two inputs that already emit one.**
  `integer = -true` and `integer = -null` flip from
  `theta/parse/params-default-type-mismatch` to
  `theta/parse/default-not-literal`, because the precedence guard at
  `src/parser/params.ts:375–377` stops the compat check once the default half has
  drawn an error. That flip is the ordering
  `code-registry-parse.md:49`'s second precedence rule prescribes, and no
  committed cell pins those two rows (`tests/params-default-type-compat.test.ts`
  carries no unary-minus non-numeric row) — the route states it as an intended
  consequence and adds cells for it.
- **It must move `primitiveLiteralType` in step.** See (e)(2): leaving the compat
  reader admitting a non-numeric operand while the is-literal check refuses one
  breaks the invariant that note pins, even though the precedence guard would
  hide it at this position today.

### (b) Narrow only the compat reader (`primitiveLiteralType`)

Return `undefined` from `primitiveLiteralType`'s `neg` arm
(`literal-sublanguage.ts:676–678`) unless the operand's span is numeric.

- **It does not reach the defect.** The is-literal check still admits, so every
  silent row in §Reproduction (c), (d) and (e) stays silent — and the two rows
  that are loud today (`integer = -true`, `integer = -null`) go silent as well,
  moving them from the wrong-code class into the binding class. Measured
  consequence, recorded so the route is rejected explicitly rather than by
  omission.
- **It is the mirror half of (a), not an alternative to it.** Taken together with
  (a) it keeps the two readers in agreement; taken alone it is a strict
  regression.

### (c) Refuse at the type/compat layer with a new registered code

Have `parseParams` detect a non-numeric unary-minus default and emit a new
registered code for the form.

- **It duplicates a row that already claims the input.**
  `theta/parse/default-not-literal`'s *Trigger* (`code-registry-parse.md:48`)
  covers an operator outside the sublanguage, and its *Message* interpolates the
  offending sub-expression, which exists here. A new row would need a DIAG-2
  registration plus the `docs/reference/diagnostics.md` mirror for a defect the
  existing row already describes.
- **It reports the form at the wrong stage.** The registry's *Phase* for
  `default-not-literal` is `parse` and for `params-default-type-mismatch` is
  `type`; the defect is that the RHS is not a literal of this sublanguage, which
  is a parse-stage fact independent of the declared half. Recorded and
  disfavoured; the route must argue the phase if it takes it.

### (d) Restrict the `neg` production in the module's `ExprParser`

Have `parseUnary` (`literal-sublanguage.ts:319–331`) mint a `neg` node only over
a numeric literal and something else (an `unknown` / `unary-other` node) over
anything else.

- **Its blast radius is the module's whole parser, not the check.** The same
  `ExprParser` backs `isBareObjectLiteral` (`:90`), which the Pi-tool argument
  shape check consumes (`src/runtime/tool-call.ts`), and `defaultLiteralStaticType`
  (`:650`). A route here enumerates every consumer and states why the node-shape
  change is safe for each, where (a) touches one predicate.
- **It changes the diagnostic's span.** The offending sub-expression is
  currently the `neg` node's own span (`-true`); a different node shape reports a
  different span, which is DIAG-4-relevant only in the interpolated `<expr>` but
  is author-visible. Measure before choosing.

### (e) Constraints every route carries

1. **The registry row and the DIAG-2 question.**
   `theta/parse/default-not-literal`'s *Trigger* (`code-registry-parse.md:48`)
   claims "a form outside the [Theta literal sublanguage] (operator, …)", and the
   sublanguage's own carve-out is numeric-only (`grammar.md:51`), so the row
   admits the refusal without a *Trigger* edit — unlike bug 0165's input. The
   open question the run must answer, not skip: whether to state the carve-out's
   numeric bound inside the *Trigger* parenthetical anyway (a DIAG-2 spec change
   landing in the same commit, `diagnostic-shape.md:72`, with the
   `docs/reference/diagnostics.md:94` mirror), and whether
   `theta/parse/params-default-type-mismatch`'s decided-set enumeration
   (`:49`, "a unary-`-` numeric literal included") needs the same treatment now
   that its non-numeric emission stops. The *Message* columns do not move
   (DIAG-4, `:74`).
2. **The mirror contract between the position's two readers.**
   `primitiveLiteralType`'s design note (`literal-sublanguage.ts:664–670`)
   records that the compat reader shares this module's tokeniser precisely so it
   "can never disagree with the is-literal verdict", and bug 0066's `## Fix
   (0.88.0)` states the same intent. Whichever way the admission moves, both
   readers move together and the route says so in the code comments, because the
   current agreement is what makes today's behaviour internally consistent (an
   admitted form has a type) rather than merely wrong. A third reader —
   `src/parser/static-type-inference.ts:311–317`, unary `-` types as its operand
   in BODY positions — is deliberately out of frame (§Non-goals) and must not be
   edited in passing: cells u10 / u10b of
   `tests/fn-arg-type-mismatch-wired.test.ts:1789`, `:1806` pin its consequences.
3. **The one-diagnostic-per-field precedence rules stay as they are.**
   `parseParams`'s bug-0059 type-half suppression (`src/parser/params.ts:349`;
   `code-registry-load.md:19`, third precedence rule) and its default-half guard
   (`:375–377`; `code-registry-parse.md:49`, second precedence rule) both bound
   this position to one diagnostic per field. Measured cells that hold them:
   `p: 'lol wut = -true'` at exactly one
   `theta/load/params-type-not-expression` (§Reproduction (f)), and cell f1 of
   `tests/params-scalar-nontype-text-refusal.test.ts:1075` (the count assertion
   inside `expectTextRefused`, `:312–319`).
   A new refusal belongs behind both guards, not ahead of them.
4. **The numeric controls keep their exact verdicts.** `integer = -1` loads
   clean, records `-1`, renders `default=-1` and binds `-1`; `number = -1.5`
   loads clean; `integer = -1.5` draws exactly one
   `theta/parse/integer-narrowing` (cell b2,
   `tests/params-default-type-compat.test.ts:396`); `checkLiteralSublanguage("-5",
   …)` returns no `default-not-literal`
   (`tests/e2e-s1-grammar-literal-sublang.test.ts:26–32`); and a flat array
   default keeps its `flatArrayStaticType` element typing (cell b3,
   `array<integer> = [1.5]` at exactly one `theta/parse/integer-narrowing`,
   `tests/params-default-type-compat.test.ts:397`). All five are measured at HEAD
   and are the over-refusal fence.
5. **GOV-15.** Every silent row in §Reproduction (c), (d) and (e) loads cleanly
   at HEAD (`source-language-stability.md:9`) and would stop loading. That is the
   diagnostic-registry carve-out's addition direction (`:25`), admissible within
   a 1.x minor for the inputs newly brought into the emission set — so the fix
   enumerates that set (`-` over a string, boolean or `null` literal, at the top
   level, as an array element and as an object field value, under decidable and
   deferring declared halves alike, with and without intervening whitespace)
   rather than leaving it to be discovered. The census in §Affected found no
   committed fixture in it.
6. **No consumer moves.** `renderBinderParamLine`
   (`src/binder/binder-system-prompt.ts:168`), `binderPromptParamField`
   (`src/extension/production-theta-producer.ts:629`),
   `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:117`),
   `#mergeDeclaredDefaults` (`src/extension/production-theta-producer.ts:1199`)
   and `evaluateBinaryExpression`'s unary arm (`:6066–6068`) are each correct
   given a well-formed record. Refusing the declaration removes the record.
   [0102](./0102-params-default-string-literal-raw-newline-admitted.md)'s witness
   (`tests/params-default-string-literal-raw-newline.test.ts`) and
   [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)'s
   (`tests/binder-param-line-newline-normalisation.test.ts`) hold bytes at this
   position and are re-read, not moved.
7. **Test witness — unit, offline, provider-free, plus one drive tier.** The
   load-time half is `parseDoc` cells: the refusal table over the six admitted
   spellings (`-true`, `-false`, `-null`, `-"x"`, `-'x'`, `- true`) at the three
   nesting positions, under a decidable and a deferring declared half, each at
   exactly one diagnostic with the registry-sourced *Message*; the code flip for
   `integer = -true` / `integer = -null`; the five controls in (e)(4); the two
   precedence rows in (e)(3). The runtime half re-drives the six bound rows of
   §Reproduction (e) through the `binder-post-merge-ajv-enforcement.test.ts`
   harness to show them refused at load rather than bound — the observable that
   makes this S1 — and keeps one conformant numeric default binding as the
   over-fire fence.

### (f) Ordering

Nothing blocks this report from starting.

## Fix (0.91.0)

**Settled route: §Fix (a) + (b) TOGETHER**, plus one DIAG-2 *Trigger*
clarification. §Fix left the emission point constraint-pinned rather than
settled and required the run to select one and state the evidence.

*The evidence that decided it.* The route was prototyped and the FULL default
suite run before any test was written (the mandatory blast-radius
pre-measurement): **293 files / 4756 tests green, zero reds**, `tsc` clean,
`lint` clean. That confirms the doc's measured blast radius for (a) exactly —
`checkLiteralSublanguage` has ONE production caller (`parseParams`'s per-field
default loop) and `LiteralPosition` a single value `"default"`, so the seven
committed direct test call sites and the 47-cell whole-list witness in
`tests/params-literal-sublanguage-lowering.test.ts` are all unaffected. A
scratch probe over the prototype measured every row of §Reproduction (b)–(f)
and showed the class decided at one site: all six spellings refused at exactly
one diagnostic, at all three nesting positions, under decidable and deferring
declared halves alike, with all five (e)(4) controls and both (e)(3) precedence
rows keeping their exact verdicts. (b) taken alone is the strict regression the
doc measured and is implemented as (a)'s mirror half, not as an alternative —
§Fix (e)(2)'s contract. (c) was rejected because
`theta/parse/default-not-literal`'s *Trigger* already claims an operator outside
the sublanguage and its *Message* interpolates a sub-expression that exists
(measured: `-true`, `- true`, `-"x"`), so a new row would duplicate a row that
already describes the defect, at the wrong phase. (d) was rejected because
`parseUnary` also backs `isBareObjectLiteral`, whose consumer is
`src/runtime/tool-call.ts`, and because it moves the diagnostic's span; (a)
touches one predicate.

- **What shipped:**
  - `src/parser/literal-sublanguage.ts` — one new module-local predicate
    `isNumericLiteralOperand`, which reads a `neg` node's operand span through
    `literalPrimitiveOf` and admits it only as `integer` or `number`
    (`PrimitiveLit ::= … | "-" NUMBER`, grammar.md §"Theta literal
    sublanguage"). `firstNonLiteral`'s `neg` arm (§Fix (a)) narrows through it
    and returns the `neg` node itself as the offending sub-expression, so the
    refusal rides the existing `checkLiteralSublanguage` emission with the span
    already measured for `--1` and `-[1]`; `source` is threaded through
    `firstNonLiteral`, its two container recursions and its one caller.
    `primitiveLiteralType`'s `neg` arm (§Fix (b)) narrows through the SAME
    predicate, shared not copied — bug 0056's mandate — so the compat reader
    establishes no type for a form the is-literal check refuses. Both
    doc-comments state that the two readers move together, which is the
    mirror contract §Fix (e)(2) and `primitiveLiteralType`'s own design note
    require.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` —
    `theta/parse/default-not-literal`'s *Trigger* parenthetical now reads "an
    operator other than the unary `-` carve-out for numeric literals" in place
    of a bare "operator". One cell on one row; nothing else on the page moved.
- **The DIAG-2 questions of (e)(1), both answered.**
  - *(i) State the carve-out's numeric bound inside `default-not-literal`'s
    Trigger parenthetical?* **Yes — edited.** The row admits the refusal
    without the edit (its operative clause is "a form outside the [Theta literal
    sublanguage]", hyperlinked to the page that states the numeric bound at
    `grammar.md:22` and `:51`), so this is a precision edit that moves no input
    into or out of the emission set. Three things decided it: the row already
    spells its SIBLING carve-out inline ("identifier reference other than
    `Enum.Variant`"), so the unqualified "operator" was the odd one out in its
    own list; this fix is the moment the distinction becomes load-bearing,
    because six spellings at three nesting positions enter the row's emission
    set; and `primitiveLiteralType`'s shipped design note already reads the
    registry as the licence surface ("GOV-15 admits a code addition exactly on
    the inputs the row names"). Its governance disposition is neutral:
    `source-language-stability.md` §*Diagnostic-registry carve-out* dispositions
    a DIAG-2 *trigger* change "as an addition for inputs newly brought into the
    code's emission set and as a removal for inputs taken out of it", and this
    edit brings none and takes none — the code change is what moves them, and
    that movement is the carve-out's admissible ADDITION direction.
  - *(ii) Does `params-default-type-mismatch`'s decided-set enumeration need
    the same treatment?* **No — untouched.** Its enumeration already reads "a
    string / number / boolean / `null` literal (a unary-`-` **numeric** literal
    included)", which is exactly `defaultLiteralStaticType`'s decided set after
    the fix (measured: `undefined` for all six non-numeric neg spellings). The
    row was firing PAST its own registered *Trigger* for `integer = -true` /
    `integer = -null`; the fix resolves that by narrowing the CODE to the
    registered row rather than widening the row — the direction DIAG-2's closed
    registry prescribes. **This discharges the 0066-row Trigger-exactness item
    the operator assigned to this report; no separate filing exists or is
    needed.**
  - **DIAG-4 holds: no *Message* column moved anywhere.** Cell R1 of the
    witness pins `default-not-literal`'s Sev `E` / Phase `parse` / *Message*,
    and every expected message in the file is rendered from the registry
    oracle, never copied.
- **GOV-15 — the newly-refused set, enumerated (§Fix (e)(5)).** Unary `-`
  applied to a **string**, **boolean** or **`null`** literal — the six admitted
  spellings `-true`, `-false`, `-null`, `-"x"`, `-'x'` and the whitespace form
  `- true` — at the **top level**, as an **array element** (`[-true]`) and as an
  **object field value** (`{ a: -true }`), under a **decidable** declared half
  (`boolean`, `string`, `null`, `integer | boolean`, `boolean | null`,
  `array<boolean>`, `array<null>`, `array<string>`) and under a **deferring**
  one (a `schema` alias, an `enum` name, a schema name, an inline object type,
  a literal union, an array alias) alike. Each now draws exactly one
  `theta/parse/default-not-literal` and does not register. Two rows that already
  drew a diagnostic change WHICH code they draw: `integer = -true` and
  `integer = -null` move from `theta/parse/params-default-type-mismatch` to
  `theta/parse/default-not-literal`, the ordering `code-registry-parse.md`'s
  second precedence rule prescribes; four further pairings measured in
  §Reproduction (c) (`number = -true`, `number | null = -false`,
  `integer | null = -true`, `array<number> = [-true]`) flip the same way.
  **Census re-run at HEAD `d2cc1fca`** (the standing GOV-15 obligation, run
  independently by the orchestrator and again by the reviewer): 34 committed
  `.theta` / `.thetalib` files, 17 declaring `params:`, exactly one committed
  default — `count: number = 3` in
  `tests/live/acceptance/fixtures/acc-params-binder.theta` — and **zero** `= -`
  defaults anywhere, including the 21 files under `docs/`. No committed fixture
  is in the newly-refused set.
- **Gates** (each re-run independently by the orchestrator, not taken on
  report):
  - Witness RED before: `npx vitest run
    tests/params-default-unary-minus-non-numeric-refusal.test.ts` →
    `Tests  60 failed | 14 passed (74)`, every A/C row rendering `[]` where a
    refusal is due and every B row rendering
    `params-default-type-mismatch` where `default-not-literal` is due.
  - Witness GREEN after: `Tests  74 passed (74)`.
  - Full default suite: `npm test` → `Test Files  294 passed (294)`,
    `Tests  4830 passed (4830)` (293/4756 at base + the 74-cell witness − the
    file count is 294 because the witness is a new file).
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` → clean, no output.
  - Lint: `npm run lint` → clean, no output.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Tests  33 passed (33)`
    (32 → 33, additive; cell 31's `bind_model` pin and cell 32 untouched).
  - Live H9a, both files: `Tests  11 passed (11)` (10 + 1), and
    `tests/fixtures/h7a/permitted-codes.json` **byte-unchanged**, proven by the
    real run (`git hash-object` identical before and after,
    `a4a8da04…` = the HEAD blob) rather than assumed — the 0045/0052/0056/0067
    precedent held because no H9a fixture carries the trigger shape.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — **CLEAN**, zero findings,
  with independent re-verification of all eleven checks (fidelity to (a)+(b),
  the shared predicate, the out-of-frame third reader, the two precedence
  guards, all five over-refusal controls, the GOV-15 enumeration and its own
  census re-run, no consumer moves, the witness shape and its non-vacuity, the
  0165 boundary, house rules, and eight spot-checked citations). One
  **pre-review correction round** ran before it (citation/comment/prose only,
  3 hunks classified `comment` / `assertion-message` / `assertion-message`,
  zero `other`, gates re-run green, file line count 1083 → 1083): the fix grew
  `literal-sublanguage.ts` 741 → 767 lines, staling six `path:line` citations
  inside the new witness, which were re-anchored by symbol beside line per bug
  0134's adjudication. It is not a review round and did not consume the cap.
- **Verification:** **VERIFIED**, zero problems.
  - *The witness genuinely reds.* Two independent neutralisations, each a
    targeted byte edit restored byte-exact with both `git hash-object` values
    stated (`5003d7d8ae9f75037a4a2425f33f0e548a14391e` before and after each).
    (1) Neutralising the shared predicate to the pre-fix test reds 59 of 74,
    reproducing the documented signature verbatim — `f1` returns `registered
    and driven; bound=true; p=-1; binder calls=1` and `f6` `p=NaN`. (2)
    Neutralising ONLY `primitiveLiteralType`'s `neg` arm, leaving
    `firstNonLiteral` narrowed, reds exactly cells c1–c7 and nothing else —
    which proves §Fix (e)(2)'s mirror contract is WITNESSED rather than merely
    asserted, and that a route moving only one reader is caught.
  - *Full default suite green.* 294 / 4830, run twice (mid-verification and at
    the final tree state).
  - *An end-to-end live test exercises the fixed path, run for real.* H8a cell
    **33** added (additive-only append; a single `@@ -5019,0 +5020,237 @@`
    hunk). It plants three thetas in one real workspace through the shipped
    composition root: a precondition control, `p: 'boolean = -true'` which must
    NOT register (asserted on `registeredNames()` and on the
    `theta-system-note` channel read off the settled `SessionManager`, with the
    expected message rendered from the registry), and `p: 'integer = -1'` which
    must register AND bind through a real binder pass, echoing
    `Running /b166livenum: topic=hello, p=-1 (default)` with a committed body
    sentinel in `userTexts` and an empty fail-closed note set. Provider absence
    fails loudly via `requireLiveProvider`. Run for real twice — by the
    verifier and independently by the orchestrator — 33/33 both times, no red
    on either attempt, so none of the open live signatures (0064, 0065, the
    stochastic H9a stall, `0xC0000142`) needed splitting.
  - *Lint and typecheck pass.* Both clean, script names read from
    `package.json`.
  - Line pins re-measured: `src/parser/static-type-inference.ts` **378**
    (untouched — §Non-goal), `src/parser/functions.ts` **427**,
    `src/parser/type-layer-checks.ts` **2531**, `src/parser/type-compat.ts`
    untouched, `src/parser/params.ts` untouched.
- **Tests that lock it:**
  - `tests/params-default-unary-minus-non-numeric-refusal.test.ts` (new, 74
    cells) — group **A** (39 cells) the refusal table over six spellings × three
    nesting positions × decidable and deferring declared halves, each at exactly
    one diagnostic with the registry-sourced *Message*, plus per-field
    cardinality; group **B** (6) the code flip, asserting both the new code AND
    the absence of `params-default-type-mismatch`; group **C** (11) the mirror
    contract, the cell that reds if the two readers narrow apart; group **D**
    (6) the (e)(4) over-refusal fence; group **E** (3) the two (e)(3) precedence
    rows plus bug 0165's boundary row; group **F** (7) the runtime tier —
    the six §Reproduction (e) bound rows shown *refused at load* with
    `binderCalls: 0` through the real `runBinder` harness, against one
    conformant numeric default still binding `p = -1` with the `(default)` echo;
    group **R** (2) the DIAG-2/DIAG-4 registry row.
  - `tests/live/live-production-acceptance.test.ts` cell 33 — the live half.
- **Residuals:**
  1. **`string = -"a<LF>b"` now draws two parse diagnostics where it drew one.**
     Measured post-fix: `[theta/parse/literal-newline-in-string,
     theta/parse/default-not-literal]`. `parseParams` pushes the raw-newline
     refusal and the is-literal refusal as two unconditional pushes; only the
     compat row sits behind the one-diagnostic guard, and the registered second
     precedence rule binds only that row. The co-fire pre-exists for other
     inputs (`string = "a<LF>b" + 1`). The input drew an `E` at HEAD, so it is
     outside GOV-15's loads-cleanly input set entirely. Cell e2 pins the
     ordering and the mismatch row's absence and states why it pins no total
     count. No spec sentence is violated; recorded because §Reproduction (f)
     measured this row at one diagnostic.
  2. **`integer = -1x` loads clean and types `integer`** (probed by the round-1
     reviewer; pre-existing and unchanged by this fix — true of `1x` too). The
     module's `ExprParser` ignores trailing tokens after a parsed expression.
     The operand is numeric, so the row is outside this report's class; it
     neighbours bug 0165's fail-open territory. Evidence: the probe returns
     `check []`, `staticType {kind:"literal",typesAs:"integer"}`.
  3. **Two doc-side inaccuracies in this report, confirmed by the reviewer.**
     §Fix (e)(1) prescribes landing the *Trigger* edit "with the
     `docs/reference/diagnostics.md:94` mirror", and §Affected lists
     `docs/reference/diagnostics.md:94`, `:95` among the "reference mirrors
     restating the numeric bound". That page's tables are
     `| Code | Sev | Phase | Message |` at `:55`, `:175`, `:239` and `:281` —
     there is **no *Trigger* column**, and rows `:94`/`:95` carry no
     numeric-bound wording at all. So no mirror edit is possible or required for
     a *Trigger* change, and the numeric bound's reference mirrors are
     `docs/reference/grammar.md:539` and `docs/reference/frontmatter.md:102`
     only (both verified verbatim). Doc-was-wrong, in the 0056/0067 precedent;
     the shipped diff correctly leaves that page untouched.
- **Discharge notes appended:** bug **0066** (its registered row's
  Trigger-exactness item resolved here, per the operator's rider) and bug
  **0165** (it lands second and inherits a narrower `neg` arm it must not
  re-widen).
- **Pinned dispositions / non-goals:** unary `-` in BODY positions is bug 0050's
  witnessed territory and is untouched — `src/parser/static-type-inference.ts`
  is byte-identical at 378 lines and cells u10 / u10b of
  `tests/fn-arg-type-mismatch-wired.test.ts` stay green. What
  `-(x as number)` should yield for a non-numeric operand is not answered here.
  The empty / whitespace-only default is bug 0165's class:
  `checkLiteralSublanguage`'s `node === undefined` arm is byte-identical, cell
  c7 of `tests/params-default-type-compat.test.ts` stays green, and cell e3 of
  the new witness pins `p: 'string = '` still loading clean. Bug 0134's
  corpus-wide stale-citation class was disclosed and not chased: this fix
  shifted `literal-sublanguage.ts` positions cited by the CLOSED reports 0031,
  0049 and 0102 and by this report's own §Affected (which is pinned to its
  `94e81974` provenance); all of bug 0165's citations sit above the insertion
  point and are unaffected.
[0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) is open
against the same function's other silent arm and the same per-field default loop;
the classes are disjoint (§Related), so neither fix changes the other's verdicts
and whichever lands second rebases onto the other's hunks. If this report lands
first, a route there that closes the `node === undefined` arm inherits a narrower
`neg` arm and must not re-widen it; if 0165 lands first, the refusal added here
sits beside its new arm in the same function.

## Non-goals

- **Unary `-` in body positions.** `let x = -true` typing as `boolean`
  statically (`src/parser/static-type-inference.ts:311–317`) while evaluating to
  `-1` (`src/runtime/statement-executor.ts:834–839`) is
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s
  witnessed territory (cells u10 / u10b,
  `tests/fn-arg-type-mismatch-wired.test.ts:1789`, `:1806`) and is not a
  literal-sublanguage position. This report changes nothing there; (e)(2) records
  the shared convention only so no route edits it in passing.
- **What `-(x as number)` should yield for a non-numeric operand.**
  `expressions.md:232` restricts the operator's operands rather than specifying a
  coercion, and this report measures the coercion as the mechanism that turns an
  admitted form into a bound number. Whether the evaluator should panic instead
  is a separate question with a separate blast radius (both evaluators, every
  body position).
- **The empty and whitespace-only default.**
  [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md)'s
  class: no node, no recovered value, a `null` bind. Every row here produces a
  node, a static type and a filled value. Cell c7 of
  `tests/params-default-type-compat.test.ts:444` pins that row's load-time
  deferral and stays green.
- **Type-correct-but-incompatible defaults.** A conformant literal whose value is
  incompatible with the declared type is
  [0163](./0163-params-default-type-compat-unchecked-at-load.md)'s class, fixed
  at 0.88.0 by the same commit; its gate is what makes two rows here loud at
  load. This report does not widen or narrow that gate's decided set beyond the
  consequence recorded in (a).
- **Raw newlines inside a default string-literal span.**
  [0102](./0102-params-default-string-literal-raw-newline-admitted.md)'s class,
  fixed at 0.75.0; measured here only to show it still fires on
  `string = -"a<LF>b"` and is silent on the single-line spellings.
- **Junk text on either half of the `params:` scalar.**
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s class,
  fixed at 0.86.0. `-true` is not junk text: it parses, and the position admits
  it. The suppression guard that fix installed must keep suppressing
  ((e)(3)).
- **The post-default-merge hook's routing.** Bug 0066's fix settled it and this
  report relies on it: the nine loud-at-invocation rows are the hook working.
  Whether an invocation-time refusal should also re-report the source form is not
  proposed here.
- **The `-0` render normalisation.** The echo prints `p=0` for a bound `-0`
  (measured) because the runtime value model normalises `-0` on render
  (`tests/runtime-value-model.test.ts:88`). Recorded as a second divergence for
  the two `-null` rows, not as a request to change the renderer.
- **`{"const":null}` as the lowering of a `null`-declared param.** Measured for
  `null = -null` and unrelated to this class.

## Provenance

Filed as residual 1 of the bug 0066 fix (0.88.0, commit `94e81974`). That fix's
`## Fix (0.88.0)` block records the find twice — under *Review* as the round-2
flag ("`firstNonLiteral`'s neg arm admits `-true`/`-null`/`-"x"` against
grammar.md's `LiteralType ::= "-" NUMBER`; predates this fix; filed as a residual
by the parent", `0066-…md:798–801`) and under *Residuals* as item 1
(`:820–823`). Neither record covers what the admitted form does downstream; the
three-way disposition split (§Reproduction (a), (c), (d)), the coercion to a
number, the six bound rows and the prompt/echo divergence are new to this filing
and are what carry the severity.

Two citation corrections against that record, verified at HEAD: the production is
`PrimitiveLit` (`docs/spec_topics/grammar.md:20–24`, whose third alternative is
`"-" NUMBER`), not `LiteralType` — `LiteralType ::= STRING | NUMBER | BOOLEAN |
NULL` at `:102` is the TYPE-position production and carries no `-` alternative;
and the residual's implied "loads with zero diagnostics" holds only for the
pairings §Reproduction (c) and (d) measure silent — `integer = -true` and
`integer = -null` draw `theta/parse/params-default-type-mismatch` at HEAD through
the same fix's own load-time gate.

Independently re-derived at HEAD `94e81974` for this filing, not copied: three
scratch vitest probes — (1) load-time observables over `parseDoc` for every
declared-type × default pairing of §Reproduction (a), (c) and (d) plus the
`checkLiteralSublanguage` / `defaultLiteralStaticType` /
`hasRawNewlineInStringLiteral` / `parseExpressionSource` table of (b) and real
AJV verdicts over each lowered document for the coerced values; (2) the
end-to-end drive of §Reproduction (e) through the real
`ProductionThetaProducer.runBinder` with the off-session pi-ai `complete()`
mocked, an in-memory `FileSystem` backing default recovery, a capturing
`pi.sendMessage`, and the production `AjvSchemaValidator` — 17 rows drove a full
binder pass, each reporting `bound`, the merged `args`, the `theta-system-note`
channel contents, the binder-call count and the captured `Parameters:` line; (3)
the boundary and guard rows of §Reproduction (f), and a fourth short probe for
the two §Reproduction (c) mismatch messages the first pass did not capture.
Written, run, deleted. The corpus census was
re-run over `git ls-files` (34 `.theta` / `.thetalib`, 17 with `params:`, one
committed default, no `= -` default anywhere including the 21 files under
`docs/`), and the committed-cell inventory in §Affected was grepped over
`tests/` at HEAD.

Two things are read from source rather than asserted on directly, and are marked
as such in the text. The `-(value as number)` arm
(`src/extension/production-theta-producer.ts:6066–6068`) is quoted, not called —
it is module-private; its EFFECT is measured, because the drive reaches it through
`runBinder` and the coerced values in §Reproduction (e) are that drive's own
merged `args`. The body-scope projection (`paramBindingsFrom`,
`src/extension/theta-composition-producer.ts:90`) is traced: the drive stops at
`runBinder`'s return, and the projection copies each merged entry into scope
unchanged. The cross-witness for the coercion on the body path is a committed
cell, not a probe: `tests/fn-arg-type-mismatch-wired.test.ts:1806–1820` records
`-true` evaluating to `-1` over `src/runtime/statement-executor.ts:834–839`.

Every `src/`, `tests/`, spec, reference and bug-doc citation above was verified
against the tree at HEAD `94e81974`; the volatile positions in
`src/parser/params.ts` (1226 lines) and
`src/extension/production-theta-producer.ts` (6105 lines) are named by symbol
beside their line numbers, per bug 0134's adjudication.
