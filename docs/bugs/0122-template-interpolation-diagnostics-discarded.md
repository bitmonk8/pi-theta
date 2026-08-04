# Bug 0122 — Every parse- and type-phase diagnostic raised for the expression inside a `@`-query `${…}` interpolation is discarded: the whole-document parser never parses the interpolation, `parseExpressionSource` returns `Expr | null` and drops its `BodyParser`'s `diagnostics` array, and the load-time interpolation walk reports only `match` and a nested `@`-query — so eight registered codes cannot fire inside `${…}`, and the interpolation instead renders a silently truncated expression into the prompt or panics at runtime under an uncoded `Error`; lex-phase codes are unaffected

- **Status:** open. §Fix is not settled: this report exists to pin the
  disposition and the emission site before any code lands. No ordering
  dependency —
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) is
  **fixed (0.69.0)** and owns the one load-time route a fix would host
  (`checkQueryInterpolationResults`), and
  [0084](./0084-increment-decrement-check-dead.md) is **fixed (0.71.0)** and
  supplies one of the eight measured codes. Neither blocks. One coordination
  constraint, in §Fix (e): 0079's "ONE emission site" invariant is asserted
  cell-by-cell in `tests/interpolated-result-gate.test.ts`.
- **Sev/Diff estimate:** S1/D3 — S1 because inputs
  `docs/spec_topics/expressions.md:25–40` refuses are accepted with zero
  diagnostics at any severity on a production path, and
  the interpolation then renders a *different* expression than the author wrote
  into the prompt text sent to the model (measured: `${c = 1}` renders the value
  of `c`, `${1 === 1}` renders `1`, `${1 + "a"}` renders the JS concatenation
  `1a` that `theta/parse/mixed-plus-operands` exists to refuse); D3 because the
  disposition, the locatable range and the DIAG-2 *Trigger* question are all
  adjudicated in-run, the discard sits on a helper with four call sites across
  three subsystems, and any newly-reachable code is assessed against the H9a
  gates.
- **Kind:** defect against `docs/spec_topics/expressions.md:3` read with
  [DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1)
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:71`). `:3` states the same
  grammar applies inside `${...}` interpolations; DIAG-1 entitles tests to
  "assert on the specific code at every documented diagnostic site". Eight
  registered codes are documented for forms `:25–40` names, fire at let-RHS
  level, and cannot fire inside `${…}`. The report is **not** a claim that 0084
  regressed anything: the `${c--}` observable is byte-unchanged across that fix
  (§Provenance), so this is a pre-existing silence 0084's work surfaced.
- **Related:**
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, the
    origin. Its fix wired `theta/parse/increment-decrement` into `parseUnary`
    and `parsePostfix`; residual (ii) of its §Fix record (`:230–235`) states that
    `${c--}` stays silent, that the hook nonetheless fires, that
    `parseExpressionSource` "discards diagnostics by pre-existing design", that
    the control `${c - -}` is equally silent, and that the observable is
    byte-unchanged by that fix and outside its four measured positions —
    "surfaced for filing by the operator" (`:243–244`). This report is that
    residual, generalised from the one operator to the whole parse- and
    type-phase surface.
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the route a fix would reuse and the constraint it must
    respect. Its §Fix (a) added `TypeLayerWalk.walkExpr`'s `query` arm driving
    `checkQueryInterpolationResults` (`src/parser/type-layer-checks.ts:1271`),
    which re-lexes each interpolation with `lexQueryTemplate` + `parseExpressionSource`
    and emits `theta/parse/interpolated-result` once per offending interpolation
    from **ONE emission site**. That is the only load-time route in the tree
    that inspects an interpolated expression's *type*; it classifies
    `Result`-ness only. Its fix record also pins the range question this report
    inherits: `QueryTemplatePart` carries no per-interpolation offsets and
    `QueryExpr` carries only `template` plus the whole `range`, so the enclosing
    `@`-query's range is the only locatable site.
  - [0102](./0102-params-default-string-literal-raw-newline-admitted.md) —
    **open**, and the report that fenced this question by name. Its §Non-goals:
    "**`parseExpressionSource` discarding `lex.diagnostics`.** The function
    returns `Expr | null` and drops the lexer's diagnostics for every caller …
    whether the function should surface diagnostics at all is a separate
    question this report does not open." This report opens it, scoped to the
    `@`-query interpolation surface. 0102's own surface is the `params:` default
    RHS, which reaches `parseExpressionSource` through a different caller
    (`src/extension/production-theta-producer.ts:1240`) and is guarded there by
    `theta/parse/default-not-literal` (measured below), so the two input classes
    are disjoint.
  - [0116](./0116-question-unwrapped-interpolation-renders-null.md) — **open**,
    the same surface one layer down. There the interpolation *parses* and the
    pure evaluator has no `try` arm, so `${r?}` renders `null`; here the
    interpolation's parse diagnostic never leaves the parser. Its §Affected
    cites the same helper as `src/parser/theta-document.ts:1148–1159`; at this
    HEAD the function body is `:1149–1160` and the docstring `:1138–1148`, so
    that citation is one line low. Disjoint mechanisms, one position.
  - [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) —
    **open**, the third open report on the interpolation position, at the render
    classifier. Adjacent, not overlapping: it concerns what a *parsed*
    interpolation renders.
  - [0085](./0085-empty-template-warning-dead.md) — **open**, the family for the
    second discarded channel this report measures. `lexQueryTemplate`'s own
    `diagnostics` array is read by none of its three callers, so
    `theta/parse/illegal-template-escape` and
    `theta/parse/unterminated-template` are unreachable at load (measured).
    0085 is the same shape on the same file for `theta/parse/empty-template`
    (`emptyTemplateWarning` has no `src/` caller). §Non-goals fences those two
    rows out of this report's subject; §Notes flags them.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, the constraint-pinned §Fix posture this report mirrors, and the
    dead-enforcement family's template.
  - [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) and
    [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, the
    other two filings from bug 0084's residual list ((iii) `match`-pattern
    position, (iv) `parseType` trailing-punctuation leniency). Each is a distinct
    *position* at which registered parse/type codes stop firing; this report is
    the interpolation position. Disjoint code sites — `parsePattern` and
    `parseType` against `parseExpressionSource` and the two interpolation walks
    — and none of the three depends on another's disposition.
- **Affected** (every citation verified at HEAD `36540b09`, 0.71.0):
  - `src/parser/theta-document.ts:1149–1160` — **the discard.**
    `parseExpressionSource(source: string): Expr | null` lexes with the real
    `lexTheta` behind a no-op system-note channel (`:1150–1157`), constructs a
    `BodyParser` (`:1158`) and returns `parser.parseSingleExpression()`
    (`:1159`). `parser.diagnostics` is never read. There is no overload, no
    out-parameter and no result wrapper: the parser's diagnostics are
    unreachable to every caller by signature.
  - `src/parser/theta-document.ts:1138–1148` — the docstring, and the precise
    scope of the design note it states: "Lex diagnostics are discarded here: a
    well-formed theta's interpolation already lexed as part of the whole-file
    body, and a malformed one degrades to `null` at the call site" (`:1144–1147`).
    The stated rationale is **true for the lex channel** — measured below, lex
    diagnostics inside `${…}` do surface, through the whole-file lex — and says
    nothing about the parser's channel, for which the "already lexed as part of
    the whole-file body" argument has no analogue: the whole-file *parser* never
    parses the interpolation.
  - `src/parser/theta-document.ts:1649` — `public readonly diagnostics: Diagnostic[] = []`
    on `BodyParser`. The array the interpolation's diagnostics land in, and the
    same field the whole-document parse reads from its own `BodyParser` (`:788`).
  - `src/parser/theta-document.ts:3105–3107` — `parseSingleExpression()`, whose
    body is `return this.parseExpression()`. **No end-of-input check.** A source
    whose prefix parses returns that prefix and the remaining tokens are
    dropped, which is the truncation half of the defect.
  - `src/parser/theta-document.ts:4391–4476` — `parseQuery`, the reason no
    whole-document parse diagnostic exists to begin with. Its body loop
    (`:4451–4453`) advances over every token between the backticks collecting
    only `.text`; the verbatim template is then recovered by slicing the raw
    body text between the backtick token bounds (`:4463–4469`) and the returned
    node carries `schema`, `template` and `range` only (`:4470–4475`). The
    interpolation's tokens exist and are consumed as raw material; they are
    never handed to `parseExpression`.
  - `src/parser/theta-document.ts:6473–6478` — `walkExpr`'s `query` arm, whose
    comment states the blind spot in terms: "A `@`-query's `${…}`
    interpolations are captured verbatim, so a `match` or nested `@`-query
    inside one is invisible to the whole-document walk above; re-lex and inspect
    them here".
  - `src/parser/theta-document.ts:6537–6582` — `checkQueryTemplateInterpolations`,
    the load-time interpolation walk (docstring `:6526–6536`).
    `lexQueryTemplate(e.template)` (`:6542`, `.parts` only),
    `parseExpressionSource(part.exprSource)` (`:6546`), the unparsable arm
    (`:6547–6567`) and the AST scan (`:6568`). Its two `out.push` calls
    (`:6555–6564`, `:6570–6579`) both emit `theta/parse/unsupported-feature` at
    `range: e.range` (`:6559`, `:6574`) and nothing else.
  - `src/parser/theta-document.ts:6591–6609` — `firstForbiddenInterpolationToken`.
    Its reported set is **exactly two members**: `keyword`/`match` → `"match"`
    (`:6601–6602`) and `punct`/`@` → `"@-query template"` (`:6604–6605`);
    every other token falls through to `null` (`:6608`). Its docstring
    (`:6584–6590`) records why the scan is safe for those two and only those
    two: "`match` is a reserved keyword and `@` a punct, so a token match is
    unambiguous (never a string-literal false positive)". `:6617–6631` —
    `firstForbiddenInterpolationForm`, the AST twin, whose set is the same two
    (`e.kind === "match"` `:6618`, `e.kind === "query"` `:6621`).
  - `src/parser/type-layer-checks.ts:1271–1298` — `checkQueryInterpolationResults`,
    bug 0079's ONE emission site, reached from `walkExpr`'s `query` arm
    (`:1191–1193`). Same two-call route: `lexQueryTemplate(e.template)`
    (`:1275`, `.parts` only) then `parseExpressionSource(part.exprSource)`
    (`:1279`). It classifies `Result`-ness (`interpolationIsResult`, `:1288`)
    and reads nothing else off the parsed node; its one push carries
    `range: e.range` (`:1293`). Its docstring (`:1260–1270`) records the range
    constraint verbatim. This is the natural host for a fix: it already holds
    `this.diagnostics`, `this.file` and `e.range`.
  - `src/lexer/lexer.ts:320–331` — the template-body state machine's own
    statement of the lex/parse asymmetry: "A `${...}` interpolation temporarily
    leaves prose for normal code lexing (comments ARE valid inside `${...}`),
    tracked by `interpDepth`". `:377–390` enters the interpolation and resumes
    code lexing; `:715–727` restores prose on the `}` that returns
    `interpDepth` to 0. Consequence, measured: lex-phase codes inside `${…}`
    reach `doc.diagnostics` through the ordinary whole-file lex.
  - `src/lexer/lexer.ts:415–425` — the `theta/parse/block-comment` push, the
    lex-phase code measured firing inside `${…}`; `:175` — `twoCharOperators()`,
    which after bug 0084 lexes `--`/`++` as one `punct` token (measured inside a
    template: the token stream for `@`x ${c--}`` carries `punct:$`, `punct:{`,
    `ident:c`, `punct:--`, `punct:}`).
  - `src/render/query-render.ts:157–267` — `lexQueryTemplate`, the second
    discarded channel. `QueryTemplatePart` (`:132–134`) carries `kind` plus
    `value`/`exprSource` and **no offsets**; `QueryTemplateLexResult`
    (`:141–146`) carries `parts`, `diagnostics` and `terminated`. The
    `theta/parse/illegal-template-escape` push is `:207–211`; the
    `theta/parse/unterminated-template` push is `:258–264`; the return is
    `:266`. All three callers read `.parts` and ignore `.diagnostics`
    (`theta-document.ts:6542`, `type-layer-checks.ts:1275`,
    `production-theta-producer.ts:5627`).
  - `src/extension/production-theta-producer.ts:5626–5637` — `renderQueryText`,
    the production render: `lexQueryTemplate(expr.template)` (`:5627`) then
    `stringifyInterpolation` per interpolation part (`:5634`).
    `:5657–5683` — `stringifyInterpolation`, whose first statement is
    `parseExpressionSource(source)` (`:5658`) and whose `null` arm returns the
    literal string `"null"` (`:5662`). This is the third `parseExpressionSource`
    caller and the one whose output reaches the model.
  - `src/extension/production-theta-producer.ts:1240` — the fourth caller, the
    `params:` default RHS (bug 0102's surface). Out of scope: measured, that
    position is guarded by `theta/parse/default-not-literal` before the render
    ever runs.
  - `src/parser/system-interpolation.ts` — the `system:` frontmatter
    interpolation surface, which does **not** route through
    `parseExpressionSource`. It applies its own restricted bare-identifier-path
    grammar and emits `theta/parse/system-interp-not-path` (code constant `:56`,
    push `:334`) for a body outside it, so the QRY-18 sentence binding `system:`
    to the same stringification rule is not part of this blind spot.
  - `docs/spec_topics/expressions.md:3` — "Theta expressions are a bounded
    subset of TypeScript. **The same grammar applies wherever an expression is
    expected**: the RHS of `let`, `if` / `match` scrutinees, function arguments,
    and inside `${...}` template interpolations." The sentence that makes this a
    violation rather than an unspecified silence.
  - `docs/spec_topics/expressions.md:19` — the `Supported forms` entry for query
    templates: "`${...}` inside them takes any expression listed above".
    `:25` — the `## Not supported` heading; `:27` — "(Parse error —
    `theta/parse/unsupported-feature` unless a more specific code below
    applies.)"; `:29` (assignment in expression position), `:31` (arrow
    functions and callback-taking higher-order methods), `:32` (spread / rest),
    `:35` (`===` / `!==`), `:36` (bitwise), `:37` (increment / decrement),
    `:39` (nested template strings inside a `${...}` interpolation), `:40`
    (query templates and `match` inside `${...}` — the only two members of that
    list the interpolation walk reports).
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18: "A
    `${expr}` interpolation **evaluates `expr` per the Expression Sublanguage**
    and renders the result into the prompt text
    by the **Theta static type** of the expression — *not* by JavaScript's
    default `String(...)`, whose `[object Object]` and comma-joined-array
    defaults would silently corrupt prompts without any diagnostic for the
    author." (The source links *Expression Sublanguage* to `../expressions.md`.)
    The rule the measured `${1 + "a"}` → `x 1a` render defeats.
    `:12` — QRY-17, the escape set and the two template-lex codes; `:14` — the
    stringification heading; `:16`'s table rows fix the per-type rendering, and
    its last row is bug 0079's.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:71` — **DIAG-1**: "Every
    author-visible diagnostic emitted by the runtime MUST carry a code from the
    registry below. Emitting an unregistered code is a defect; tests are
    entitled to assert on the specific code at every documented diagnostic
    site." `:72` — DIAG-2 (the registry is closed; a *Trigger* change is a spec
    change landing in the same commit). `:74` — DIAG-4 (the *Message* column is
    normative). `:44–46` — the located-site classification, which fixes
    `theta/parse/*` rows as **Located** — both `file` and `range` — the
    constraint behind §Fix (b).
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the eight rows this
    defect makes unreachable inside `${…}`: `:27` (`unsupported-feature`, Phase
    `parse`), `:29` (`assignment-as-expression`, `parse`), `:33`
    (`increment-decrement`, `parse`), `:36` (`mixed-plus-operands`, `type`),
    `:38` (`non-indexable-receiver`, `type`), `:61` (`unknown-identifier`,
    `parse`), `:63` (`unknown-method`, `parse`), `:77`
    (`question-on-non-result`, `type`). The lex-phase row that does fire inside
    `${…}` is `:23` (`block-comment`). The two rows of the second discarded
    channel are `:68` (`illegal-template-escape`, `lex`) and `:69`
    (`unterminated-template`, `lex`). Bug 0079's row is `:72`
    (`interpolated-result`, `type`).
  - `docs/reference/frontmatter.md:256–265` — the user-facing mirror of the
    interpolation contract: "A `${...}` inside a `@`...`` query template
    contains a Theta expression from the expression sublanguage" (which the
    source links to `./grammar.md#expression-sublanguage`).
    `docs/reference/diagnostics.md`
    — the *Message* mirror, which carries no *Trigger* column (`:73`
    `unsupported-feature`, `:79` `increment-decrement`, `:121`
    `interpolated-result`), so a *Trigger* widening does not reach it.
  - `tests/e2e-s1-expr-diagnostics.test.ts:114–130` — the two cells covering the
    interpolation walk's whole reported set (`match` inside an interpolation
    `:115–121`, a nested `@`-query inside one `:123–129`), and `:155–171` — the
    two malformed-source cells covering `firstForbiddenInterpolationToken`.
    Together these are the entire committed coverage of diagnostics inside an
    interpolation.
  - `tests/interpolated-result-gate.test.ts` — bug 0079's witness (22 cells) and
    the coordination surface: `assertGateFired` (`:281–309`) asserts exactly one
    diagnostic carries the 0079 code, and `assertGateFiredWith` (`:357–382`)
    asserts the **whole** `diagnostics` array equals one row. A route that adds
    a second diagnostic to any of those fixtures reds that assertion.
  - `tests/increment-decrement-wiring.test.ts` — bug 0084's witness (25 cells).
    Its cell s5 (`:379`) pins `--` inside `@`-template **prose** as accepted,
    which stays correct under every route here (prose is not an interpolation);
    `:52` names s5–s7 as the three lexical contexts where the pair is data.
  - `tests/fixtures/h7a/permitted-codes.json` — the H9a note-content allowlist,
    11 entries, all `theta/load/*`, `theta/runtime/*` or `theta/host/*`; it
    lists **no** `theta/parse/*` code. `tests/live/acceptance/harness.ts:479`
    — `ACCEPTANCE_STDERR_ALLOWLIST`, which ships **empty** under the
    measured-baseline empty-capture gate (`assertStderrClean`, `:534–546`).
  - **Test coverage of this defect: none.** No test asserts that any of the
    eight codes fires inside a `${…}`, and none pins the silence either. The
    committed corpus is unaffected: a sweep of all 34 committed
    `.theta`/`.thetalib` files finds 37 interpolations, none containing a
    rejected form and none whose parse is truncated (measured below).
- **Observed at:** `0.71.0` (HEAD `36540b09`). Offline, deterministic; no live
  model, no provider. Five scratch vitest files driving the real
  `parseThetaDocument`, the real `parseExpressionSource` / `lexQueryTemplate` /
  `lexTheta`, and the real prompt-mode production binding
  (`createProductionProducerDeps` + `executeBody`) against the session double
  bug 0079's witness establishes — the rendered turn is read off
  `pi.sendUserMessage`. Written, run, deleted.

## Summary

An expression inside a `@`-query `${…}` interpolation is subject to the same
grammar as an expression anywhere else (`expressions.md:3`), and the forms
`expressions.md:25–40` refuses each carry a registered diagnostic code. Inside
`${…}` none of them fires. Measured at HEAD, thirteen sources that draw a
diagnostic at `let`-RHS level draw **zero diagnostics of any severity** inside
an interpolation, across eight distinct registered codes.

Three mechanisms compose. The whole-document parser never parses an
interpolation: `parseQuery` advances over the tokens between the backticks
collecting only their text and recovers the template as a verbatim string slice
(`theta-document.ts:4451–4453`, `:4463–4469`), so no diagnostic can arise there.
The two
load-time routes that *do* parse the interpolation —
`checkQueryTemplateInterpolations` (parse layer) and 0079's
`checkQueryInterpolationResults` (type layer) — both call
`parseExpressionSource`, whose signature is `Expr | null`
(`theta-document.ts:1149–1160`): the `BodyParser` it drives collects diagnostics
into `parser.diagnostics` (`:1649`) and that array is never read by anyone. And
the parse-layer walk's own reported set is exactly two members —
`match` and a nested `@`-query (`:6591–6609`) — so it catches the two forms
`expressions.md:40` names and nothing else on the list.

The lex phase is **not** affected, and the distinction is load-bearing. The
whole-file lexer leaves template prose and resumes ordinary code lexing inside
`${…}` (`lexer.ts:320–331`, `:377–390`), so `theta/parse/block-comment`,
`theta/parse/literal-newline-in-string` and `theta/parse/illegal-escape` all
surface from inside an interpolation. `parseExpressionSource`'s docstring states
the discard as a deliberate choice and gives a rationale that holds for exactly
that channel — "a well-formed theta's interpolation already lexed as part of the
whole-file body" (`:1144–1146`). The parser's channel has no such analogue and no
stated rationale.

The consequence is not only a missing diagnostic. `parseSingleExpression`
(`:3105–3107`) applies no end-of-input check, so a source whose *prefix* parses
yields that prefix and the rest is dropped: measured, `${c = 1}` renders the
value of `c`, `${1 === 1}` renders `1`, `${1 & 2}` renders `1`. The prompt
therefore carries the value of an expression the author did not write, with
nothing on any channel recording the substitution. Where the truncated
expression is still evaluable but ill-typed the render proceeds and defeats the
QRY-18 rule directly — `${1 + "a"}` renders `x 1a`, the JavaScript-style
coercion `theta/parse/mixed-plus-operands` exists to refuse. Where it is not
evaluable the drive aborts under an uncoded JavaScript `Error` (`${s.frobnicate()}`
→ `Error: unknown string stdlib member: frobnicate`), which is a phase shift out
of the parse pass rather than a diagnostic.

This is bug 0084's residual (ii), generalised. The `${c--}` instance is one row
of the table below; the defect is the general discard.

## Reproduction

Offline, at `36540b09`. Frontmatter is `---`/`mode: prompt`/`---` throughout.
`diags` is the whole `parseThetaDocument(...).diagnostics` array, unfiltered.
`rendered` is the text handed to `pi.sendUserMessage` by the real prompt-mode
production binding (`createProductionProducerDeps().bindPromptConversation` +
`executeBody`) over the session double, which is the wire-facing observable —
the turn the model receives.

### The inventory — the same expression inside `${…}` and at `let`-RHS level

Each row is one body. The interpolated form is `let _ = @`…${<expr>}`` and the
control is `let _ = <expr>`, with the same prologue bindings.

```
                       inside ${…}   at let-RHS level                          rendered
c--                    []            theta/parse/increment-decrement            "count 5"
c++                    []            theta/parse/increment-decrement            "count 5"
c = 1                  []            theta/parse/assignment-as-expression       "x 5"
zzz                    []            theta/parse/unknown-identifier             "x null"
typeof 1               []            theta/parse/unknown-identifier             "x null"
s.frobnicate()         []            theta/parse/unknown-method                 THREW (below)
a.map(v => v)          []            theta/parse/unknown-method                 THREW (below)
                                     + theta/parse/unknown-identifier ×2
1 + "a"                []            theta/parse/mixed-plus-operands            "x 1a"
1 === 1                []            theta/parse/unsupported-feature            "x 1"
1 & 2                  []            theta/parse/unsupported-feature            "x 1"
o[0]  (o = 1)          []            theta/parse/non-indexable-receiver         THREW (below)
s?    (s = "a")        []            theta/parse/question-on-non-result         "x null"
s?.len (s = "a")       []            theta/parse/unknown-method                 "x null"
                                     + theta/parse/question-on-non-result
```

Eight distinct registered codes, every one `theta/parse/*` at severity `error`,
every one absent inside `${…}`.

The three `THREW` rows abort the drive after zero turns were sent:

```
s.frobnicate()   Error: unknown string stdlib member: frobnicate      sent=[]
a.map(v => v)    Error: unknown array stdlib member: map              sent=[]
o[0]             NonObjectReceiverError: non-object receiver:
                 cannot read [0] on a number                          sent=[]
```

The first two carry no theta code at all. The third is a registered runtime
panic standing in for a parse-time rejection the spec assigns to `type` phase
(`code-registry-parse.md:38`).

### What IS caught inside `${…}` — the lex phase and two forms

```
/* z */ c     theta/parse/block-comment: block comments are not supported
"abc  (unterminated)  theta/parse/literal-newline-in-string: literal newline in string literal
"a\q"         theta/parse/illegal-escape: illegal escape sequence: \q
match c { _ => 1 }    theta/parse/unsupported-feature: … match inside ${...} interpolation
@`y`          theta/parse/unsupported-feature: … @-query template inside ${...} interpolation
```

The first three fire because the whole-file lexer lexes the interpolation
interior as code (`lexer.ts:377–390`, stated at `:326–329`); each of these three
sources is refused at load, so no turn is rendered. The last two are the whole
reported set of
`firstForbiddenInterpolationToken` / `firstForbiddenInterpolationForm`. The
`match` row is the exact inverse of its control: `let d = match c { _ => 1 }` at
`let`-RHS level is silent (legal), and the same text inside `${…}` is refused —
which is what `expressions.md:40` prescribes and what proves the walk is
reachable and working for its two members.

### The controls that stay silent at both levels

```
c - -         []  /  []          "count 5"     legal: subtraction of a negation (bug 0084)
[...a]        []  /  []          "x [[1]]"     spread: silent at BOTH levels
1 == 1 ? 2 : 3  []  /  []        "x 2"         legal ternary
```

`c - -` is the control bug 0084 measured and is the reason the `--` row is not
a lexing question. `[...a]` is silent at `let`-RHS level too, so its silence is
a *different*, pre-existing gap against `expressions.md:32` and is fenced in
§Non-goals — it is not evidence for this report.

### The silence is position-independent

```
fn body            fn f(c: integer): string { @`x ${c--}` }         []
typed query        @<integer>`x ${c--}`                             []
two interpolations @`${c--} and ${zzz}`                             []
par for body       par for v in a { let _ = @`x ${v--}` }           theta/parse/par-query-in-body
```

Every route to a `QueryExpr` converges on the same two walks, so the silence
does not depend on where the query sits. The `par for` row is refused for an
unrelated reason (`@` against the enclosing conversation inside a `par for`
body), so it is not a counter-example.

### The truncation and rewriting — the interpolation renders a different expression

`parseSingleExpression` has no end-of-input check. Measured directly on
`parseExpressionSource`, with the parsed node's range end against the source
length:

```
"c--"            => ident        covers cols 1..1 of 3
"c = 1"          => ident        covers cols 1..1 of 5
"1 === 1"        => number       covers cols 1..1 of 7
"1 & 2"          => number       covers cols 1..1 of 5
"5 >> 1"         => number       covers cols 1..1 of 6
"c ?? 1"         => try          covers cols 1..4 of 6
"a?.b"           => member       covers cols 1..4 of 4
"a.map(v => v)"  => method-call  covers cols 1..13 of 13, args = [v, v]
"( "             => null         (the render's inert `null` arm)
```

`${c ?? 1}` becomes the `?` unwrap `c?`; `${a?.b}` becomes the member access
`a.b`; `${a.map(v => v)}` becomes a two-argument `map` call with the `=>`
dropped. Each is a form `expressions.md:31–36` lists as not supported, silently
rewritten into a form that is.

### The 0084 hooks do fire inside the interpolation

The pair is consumed, which distinguishes "the emitter ran and its diagnostic
was dropped" from "the tokens were left unconsumed":

```
"c-- + 1"    => binary(+, ident c, 1)   covers cols 1..7 of 7   (pair consumed)
"c - - + 1"  => ident c                 covers cols 1..1 of 9   (tokens abandoned)
"--c + 1"    => binary(+, ident c, 1)   left range starts col 3 (prefix consumed)
```

`c-- + 1` parses whole only if something consumed the `--`, which is bug 0084's
`parsePostfix` arm — the same arm that pushes the diagnostic. The whole-file
lexer confirms the token exists inside the template: for
`let _ = @`x ${c--}``, the stream carries `punct:@`, `` punct:` ``, `punct:$`,
`punct:{`, `ident:c`, `punct:--`, `punct:}`, `` punct:` ``, and
`lexTheta(...).diagnostics` is `[]`.

### The second discarded channel — `lexQueryTemplate`'s own diagnostics

```
@`bad \q escape`     []      (theta/parse/illegal-template-escape, QRY-17)
@`abc     (no closing backtick)   []   (theta/parse/unterminated-template, QRY-17)
@`literal \${x}`     []      control: \$ suppresses interpolation, correct
```

Both codes are produced by `lexQueryTemplate` (`query-render.ts:207–211`,
`:258–264`) and all three of its callers read `.parts` only. Additionally, the
callers pass `e.template`, which is the slice *between* the backticks, so the
lex never sees a closing backtick and `terminated` is `false` on every call —
measured, `lexQueryTemplate("count ${c--}")` returns
`diagnostics: [theta/parse/unterminated-template]`, `terminated: false` for a
well-formed template. Any route that surfaces the array wholesale emits that
code on every `@`-query in the corpus. §Fix (c) constraint.

### An adjacent surface that is guarded, and one that does not apply

```
params: n: integer = 5--    theta/parse/default-not-literal: params default RHS must be a
                            literal-sublanguage form; offending sub-expression: 5--
params: n: integer = 5      []                                                  [control]
```

The fourth `parseExpressionSource` caller (the `params:` default RHS,
`production-theta-producer.ts:1240`) is guarded upstream, so bug 0102's surface
does not share this input class. The `system:` interpolation surface uses
`src/parser/system-interpolation.ts`'s own restricted grammar and its own
`theta/parse/system-interp-*` codes, so QRY-18's sentence extending the
stringification rule to `system:` does not extend this defect there.

### Corpus census

A sweep over all 34 committed `.theta` / `.thetalib` files extracts every
`@`-template and re-lexes it: **37 interpolations**, of which **0** contain any
of `--`, `++`, `===`, `!==`, `?.`, `??`, `...`, `=>`, a bitwise operator or
`/*`, **0** fail to parse, and **0** are truncated (parsed range end equals
source end for every one). The GOV-15 blast radius inside the committed corpus
is empty for the syntactic classes; the type-phase classes
(`mixed-plus-operands`, `unknown-method`, `non-indexable-receiver`,
`question-on-non-result`) depend on binding types the sweep does not reconstruct
and are re-derived by whoever fixes this.

## Expected behaviour

The anchor is `docs/spec_topics/expressions.md:3`:

> Theta expressions are a bounded subset of TypeScript. The same grammar applies
> wherever an expression is expected: the RHS of `let`, `if` / `match`
> scrutinees, function arguments, and inside `${...}` template interpolations.

`:19` restates it from the query side ("`${...}` inside them takes any
expression listed above") and QRY-18 restates it again from the render side
("evaluates `expr` per the Expression Sublanguage"). `:25–27` then attaches a
diagnostic to the complement: the `Not supported` list is a *parse error* list,
`theta/parse/unsupported-feature` by default and a more specific registered code
where one exists. The list is not qualified by position, and `:40` — the one
entry that *is* position-qualified — qualifies in the opposite direction:
`match` and `@`-query templates are admitted at statement / `let`-RHS level and
refused inside `${...}`.

DIAG-1 (`diagnostic-shape.md:71`) supplies the enforcement standard: "Emitting
an unregistered code is a defect; **tests are entitled to assert on the specific
code at every documented diagnostic site**." A documented site whose diagnostic
is computed and then dropped is not a design choice under that sentence — it
defeats the entitlement, because no test can assert the code at that site by any
means. This is what separates the present report from an unspecified silence:
the eight codes are registered, their emitters run, and the emissions are
discarded between the emitter and the sink.

On the measured input, therefore:

- Each of the thirteen rows draws, inside `${…}`, the same registered code its
  `let`-RHS control draws, at the registered severity, with the registry's
  *Message* (DIAG-4).
- Each diagnostic is **Located** per `diagnostic-shape.md:44–46`'s located-site
  classification — a `theta/parse/*` row carries both `file` and `range`. The
  realisable range today is the enclosing `@`-query's, for the reason bug 0079's
  fix record states.
- The three `THREW` rows are refused at load instead of aborting a drive under
  an uncoded `Error`.
- `${1 + "a"}` does not render `x 1a`. QRY-18's whole premise is that a
  JavaScript coercion must not reach the prompt "without any diagnostic for the
  author".
- The lex-phase rows keep firing exactly as measured, and the two walk members
  (`match`, nested `@`-query) keep firing exactly once.
- The controls stay silent: `c - -`, a legal ternary, and every one of the 37
  committed interpolations.

What the spec does **not** state, and what §Fix must therefore pin: which pass
owns the emission, and what range a diagnostic carries when the offending token
is inside a verbatim template slice that carries no offsets. Both are answered
in-run.

## Actual behaviour / root cause

**The whole-document parse never parses an interpolation.** `parseQuery`
(`theta-document.ts:4391`) walks the tokens between the backticks with
`parts.push(this.advance().text)` (`:4451–4453`), then recovers the template by
slicing the raw body text between the backtick token bounds (`:4463–4469`). The
node it returns carries `schema`, `template` and `range` (`:4470–4475`). The
interpolation's tokens are consumed as text; `parseExpression` is never called
on them. Nothing is dropped here, because nothing is computed.

**The lexer, by contrast, does lex the interior — and that asymmetry is the
report's scope boundary.** `scanTokens`' template state machine leaves prose on
`${` and resumes ordinary code lexing until the matching `}`
(`lexer.ts:377–390`, `:715–727`), with the reason stated at `:326–329`. Every
lex diagnostic raised inside an interpolation therefore lands in the whole-file
`lex.diagnostics` and reaches `doc.diagnostics` — measured for
`block-comment`, `literal-newline-in-string` and `illegal-escape`. So the defect
is exactly the parse and type phases, and a fix that reached for the lexer would
be aiming at the wrong pass.

**`parseExpressionSource` cannot report by signature.** It lexes with the real
`lexTheta` behind three no-op seams, constructs a `BodyParser`, and returns
`parser.parseSingleExpression()` (`:1149–1160`). The `BodyParser` accumulates
into `public readonly diagnostics: Diagnostic[]` (`:1649`) — the same field the
whole-document parse reads off its own parser at `:788` — and that array is
unreachable to every caller because the return type is `Expr | null`. Its
docstring states the discard and justifies it for the lex channel only
(`:1144–1147`); the parser channel is dropped without a stated rationale, and
the rationale offered for the lex channel does not transfer, because the
whole-file *parser* never sees these tokens.

**The emitters do run.** Measured: `parseExpressionSource("c-- + 1")` returns a
`binary` node spanning the whole source, which requires something to have
consumed the `--` — bug 0084's `parsePostfix` arm, the same arm that pushes
`theta/parse/increment-decrement`. `parseExpressionSource("c - - + 1")` returns
a truncated `ident`, which is what an *unconsumed* token sequence looks like.
The difference is direct evidence that the hook fires and its diagnostic is
discarded, not that it is unreachable.

**The parse-layer walk's reported set is two members.**
`checkQueryTemplateInterpolations` (`:6537–6582`) re-lexes and re-parses each
interpolation and then asks one question of the result: does the subtree contain
a `match` or a nested `@`-query (`firstForbiddenInterpolationForm`, `:6617`)? On
an unparsable source it asks the token-level twin
(`firstForbiddenInterpolationToken`, `:6591`), whose two `return`s are `"match"`
(`:6602`) and `"@-query template"` (`:6605`) and whose fall-through is `null`
(`:6608`). Every other
entry on `expressions.md:25–40`, and every code the parser computed while
parsing, is outside both sets. The walk's own comment (`:6474–6477`) frames its
purpose as covering the two forms invisible to the whole-document walk, which is
what it does.

**The type layer descends only for `Result`-ness.** `TypeLayerWalk.walkExpr`'s
`query` arm (`type-layer-checks.ts:1191–1193`) drives
`checkQueryInterpolationResults` (`:1271`), bug 0079's ONE emission site. It
runs the identical two-call route (`lexQueryTemplate` `.parts`, then
`parseExpressionSource`) and reads exactly one property off the parsed node —
whether `interpolationIsResult` can prove it a `Result`. No other type check in
the pass descends into a `QueryExpr.template`, because the template is a
`string` on the AST: `mixed-plus-operands`, `unknown-method`,
`non-indexable-receiver` and `question-on-non-result` are computed over the
walked AST, and the interpolation's expression is not part of it. This is why
the four type-phase codes are absent for a *second* reason, independent of the
`parseExpressionSource` discard: even a diagnostics-returning
`parseExpressionSource` would not produce them, because nobody runs the type
checks over the returned node.

**No end-of-input check, so silence is accompanied by substitution.**
`parseSingleExpression` is `return this.parseExpression()` (`:3105–3107`).
Measured, `c = 1` yields `ident c` covering one column of five; `1 === 1` yields
`number 1` of seven; `c ?? 1` yields the `try` node for `c?`. The render then
evaluates the truncated node: `stringifyInterpolation`
(`production-theta-producer.ts:5657`) calls `parseExpressionSource` (`:5658`),
returns the literal `"null"` when it is `null` (`:5662`), and otherwise
evaluates and stringifies whatever came back. The prompt carries the value of an
expression the author did not write.

**Where the parsed node is ill-typed the render proceeds; where it is
unevaluable the drive aborts uncoded.** `${1 + "a"}` renders `x 1a`, which is
the JavaScript `+` semantics QRY-18's own preamble names as the failure mode the
type-driven rule exists to prevent. `${s.frobnicate()}` and `${a.map(v => v)}`
abort with a bare `Error` carrying no theta code, after zero turns were sent;
`${o[0]}` aborts with `NonObjectReceiverError`. All three are phase shifts out
of the parse pass, and two of them out of the registered-code surface entirely.

**A second channel is dropped at the same three call sites.**
`lexQueryTemplate` returns `{ parts, diagnostics, terminated }`
(`query-render.ts:266`), pushing into that array at `:207–211` and `:258–264`;
`theta-document.ts:6542`,
`type-layer-checks.ts:1275` and `production-theta-producer.ts:5627` each read
`.parts`. `theta/parse/illegal-template-escape` and
`theta/parse/unterminated-template` are pushed nowhere else in `src/`, so both
registered rows are unreachable at load — measured silent. Because the callers
pass the interior slice, `terminated` is always `false`, so every call already
carries one spurious `unterminated-template`; that is a trap for any fix that
forwards the array, and it is why §Non-goals fences those two rows rather than
folding them in.

**Reach.** One helper, four callers, three of which are on the interpolation
path: the parse-layer walk, the type-layer walk, and the production render. The
fourth (`params:` defaults) is guarded upstream. `parseQuery` is the only
producer of `QueryExpr`, so every interpolation in every position — body, `fn`
body, typed query, match arm, `par for` body — reaches exactly these three, and
the silence is position-independent (measured).

## Why it matters

- **An input the spec refuses loads clean, on a production path, with zero
  diagnostics.** Thirteen measured sources, eight registered codes. The theta
  registers, dispatches, and sends a turn.
- **The prompt carries an expression the author did not write.** `${c = 1}`
  renders the value of `c`; `${1 === 1}` renders `1`; `${c ?? 1}` becomes a `?`
  unwrap; `${a.map(v => v)}` becomes a two-argument call with the arrow
  dropped. The substitution is silent on every channel, and the author's only
  evidence is the model's reply to a prompt they cannot see.
- **QRY-18's stated purpose is defeated at one measured row.** `${1 + "a"}`
  renders `x 1a` — the JavaScript coercion the rule's own preamble says "would
  silently corrupt prompts without any diagnostic for the author".
- **Two rows leave the registered-code surface entirely.** `${s.frobnicate()}`
  and `${a.map(v => v)}` abort the drive with a bare JavaScript `Error`. DIAG-1
  requires every author-visible diagnostic to carry a registered code; these
  carry none, and they arrive at run time in place of a parse rejection.
- **The blind spot is exactly one construct wide and the whole surface deep.**
  Any diagnostic the parse or type phase can raise is unreachable inside
  `${…}`, including codes added later. A future check wired at the expression
  walk inherits the hole for free, as bug 0084's did.
- **The two members that are covered prove the hole is not a design intent.**
  `expressions.md:40`'s two forms are refused inside `${…}` by a walk built for
  that purpose; the other entries on the same list, in the same position, are
  not. There is no spec sentence distinguishing them.
- **DIAG-1's entitlement is unavailable at these sites.** No test can assert
  the code, because there is no channel on which it arrives — which is why the
  committed coverage of interpolation diagnostics is exactly the four cells
  covering the two forms the walk reports.
- **The committed corpus is clean, so nothing in the suite would notice a
  regression here either.** 37 interpolations, none affected.

## Non-goals

- **`theta/parse/illegal-template-escape` and `theta/parse/unterminated-template`.**
  Measured silent at load and produced only by `lexQueryTemplate`, whose
  `diagnostics` array all three callers ignore. These are *template*-lex rows,
  not interpolation-expression rows: the fix surface is the template lex and its
  `terminated`-is-always-false call convention, not `parseExpressionSource`.
  Same family as [0085](./0085-empty-template-warning-dead.md) (a `query-render.ts`
  emitter with no reachable route). Recorded here as measured evidence; a
  separate adjudication.
- **Spread inside `${…}`.** `${[...a]}` is silent, but so is `let _ = [...a]`
  at `let`-RHS level (measured). That is a pre-existing gap against
  `expressions.md:32` at the *body* level, reachable without any interpolation,
  and it is not evidence for this report. Whether `...` owes a diagnostic
  anywhere is a separate question.
- **What a *parsed* interpolation renders.** Bug
  [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) (nested
  `Result` in an interpolated container) and bug
  [0116](./0116-question-unwrapped-interpolation-renders-null.md) (`${r?}`
  renders `null`) both concern interpolations whose parse succeeds and whose
  *value* is wrong. Disjoint mechanisms on the same position.
- **The `params:` default RHS.** Bug
  [0102](./0102-params-default-string-literal-raw-newline-admitted.md)'s
  surface, and the fourth `parseExpressionSource` caller. Guarded by
  `theta/parse/default-not-literal` (measured), so it is not in this input
  class — but a fix that changes `parseExpressionSource`'s signature touches
  that call site, which §Fix (d) records.
- **The `system:` frontmatter interpolation.** A different grammar in a
  different module (`src/parser/system-interpolation.ts`) with its own
  `theta/parse/system-interp-*` rows. QRY-18 extends the stringification table
  there; it does not route through `parseExpressionSource`.
- **Retiring any of the eight rows.** Each has a live emitter and a reachable
  input at `let`-RHS level, so the DIAG-2 retirement disposition
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
  weighs for a wholly dead row does not apply to any of them.
- **Per-interpolation source ranges as an end in themselves.** Whether
  `QueryTemplatePart` should carry offsets is a question this report raises only
  as a §Fix option and does not settle.

## Fix

**Not settled. This report exists to pin the emission site, the range and the
DIAG-2 disposition first.** Five questions, and (e) is the coordination
constraint that bounds all of them.

**(a) Which pass owns the emission?** Three routes, with consequences.

1. **Surface the parser's diagnostics from `parseExpressionSource` and report
   them at the existing parse-layer walk.** Change the helper to return the
   parser's `diagnostics` alongside the node (a result object, or a second
   overload; the current signature has four callers), and have
   `checkQueryTemplateInterpolations` (`theta-document.ts:6537`) push them into
   `out` with the enclosing query's `file` and `range`. This is the smallest
   change that reaches the *parse*-phase codes, and it reaches them all at once
   — including codes wired later, which is what makes it the route that closes
   the class rather than an instance. Two costs. It does not reach the four
   **type**-phase codes at all: those are computed by `TypeLayerWalk` over the
   walked AST, and the interpolation's expression is not in it (§Actual
   behaviour), so `mixed-plus-operands`, `non-indexable-receiver`,
   `unknown-method` and `question-on-non-result` need route 3 regardless. And
   the diagnostics arrive with ranges computed against the *interpolation
   source*, whose line 1 column 1 is not a position in the file — every one must
   be relocated before it is emitted, which is (b).
2. **Extend `firstForbiddenInterpolationToken`'s reported set.** Add the
   remaining `expressions.md:25–40` tokens (`++`/`--`, `=`, `===`, the bitwise
   operators, `...`, `=>`, `?.`, `??`, `typeof` …) to the two-member scan at
   `theta-document.ts:6591–6609`. Cheap and local, and it inherits the existing
   emission shape and range verbatim. But it re-implements a token-level
   approximation of the grammar beside the parser that already decides the same
   questions correctly, it produces one code
   (`theta/parse/unsupported-feature`) where the registry assigns eight, and it
   cannot express any type-phase row. It also re-opens a hazard the current
   two-member set is deliberately free of: `match` is a keyword and `@` a punct,
   so the scan "cannot false-positive on string-literal contents" (`:6550–6552`,
   restated `:6587–6588`);
   `=` and `-` have no such property, and the scan runs over the token stream of
   a source that may contain string literals. Available as a fallback for the
   syntactic classes only.
3. **Have bug 0079's type-layer route collect and report generally.**
   `checkQueryInterpolationResults` (`type-layer-checks.ts:1271`) already
   re-lexes and re-parses every interpolation *inside the type-layer walk*, and
   already holds `this.diagnostics`, `this.file` and `e.range`. Running the
   pass's own expression checks over the parsed node there is the only route
   that reaches the four type-phase codes, and it reaches the parse-phase ones
   too if route 1 supplies them. The cost is 0079's ONE-emission-site invariant
   (see (e)) and the scope of "the pass's own checks": the type layer's checks
   are written against a `bindings` map for the enclosing scope, and an
   interpolation's scope is the enclosing statement's — this needs stating, not
   assuming.

Whichever route is taken, it must state what happens to an interpolation that
does **not** parse. Today `parseExpressionSource` returns `null`, the parse-layer
walk falls back to the token scan, and the render substitutes the literal
`"null"` (`production-theta-producer.ts:5662`). A route that reports on the
`null` path changes the disposition of `${( }` — measured silent today, rendered
as `x null`.

**(b) What range does the diagnostic carry?** `diagnostic-shape.md:44–46`'s
located-site classification fixes every `theta/parse/*` row as **Located** —
both `file` and `range`. Bug 0079 already answered this for the interpolation
position and its answer is the constraint: `QueryTemplatePart`
(`query-render.ts:132–134`) carries **no offsets** and `QueryExpr` carries only
`template` plus the whole `range`, so **the enclosing `@`-query's range is the
only locatable site today**, and both existing emitters use it
(`theta-document.ts:6559`/`:6574`, `type-layer-checks.ts:1293`). Two
consequences. Diagnostics produced inside the interpolation carry ranges in
`<interpolation>` coordinates (`theta-document.ts:1151`, `:1158` — the file name
the helper passes) and cannot be emitted as-is; they are either relocated to the
query's range, discarding their precision, or `QueryTemplatePart` gains offsets
and `lexQueryTemplate` starts recording them, which is a wider change with its
own witness obligations (and would let bug 0079's range assertion tighten — that
witness marks the exact assertion to narrow if per-interpolation spans ever
arrive). And several diagnostics from one interpolation, or from several
interpolations in one template, then collapse onto one range: the measured
`@`${c--} and ${zzz}`` is two offences at one location. Whether that is two
diagnostics or one must be stated.

**(c) The DIAG-2 obligation.** No new code is required by any route: all eight
rows exist. But every one of their *Triggers* is written in position-neutral
terms that a reader may or may not read as covering the interpolation — for
instance `increment-decrement` is "`++` or `--` operator used."
(`code-registry-parse.md:33`) and `assignment-as-expression` is "Assignment used
in expression position (e.g. `if (x = 1)`)" (`:29`). Read each row as written
before editing: bug 0084 read its own row and determined no widening was owed
for its four positions. If any row's *Trigger* is judged not to admit the
interpolation position, DIAG-2 (`diagnostic-shape.md:72`) requires the widening
to land in the same commit, with the `docs/reference/` mirrors:
`docs/reference/diagnostics.md` carries no *Trigger* column so a widening does
not reach it, while `docs/reference/frontmatter.md:256–265` is the user-facing
statement of what a `${...}` may contain and is the page that would need the
sentence. DIAG-4 (`:74`) forbids rewording any *Message*, and every one of the
eight renders correctly at the interpolation position as written. Route 2 would
additionally need `unsupported-feature`'s `<construct>` placeholder vocabulary
stated for each new token it names.

**(d) GOV-15 blast radius, and the two live gates.** Every affected input loads
cleanly today and would gain an `error`, which changes observable (b) for those
inputs — the same GOV-15 diagnostic-registry carve-out disposition bug 0084
discharged for its own wiring, and bug 0031 established. Measured, the committed
corpus is unaffected (37 interpolations, 0 flagged), so no committed fixture
reds. Two gates still need deciding by a real run, not by inspection.
`tests/fixtures/h7a/permitted-codes.json` lists no `theta/parse/*` code at all;
if no shipped fixture emits one it stays byte-unchanged, which is how bugs 0079
and 0084 both decided it. `ACCEPTANCE_STDERR_ALLOWLIST`
(`tests/live/acceptance/harness.ts:479`) ships empty under the measured-baseline
empty-capture gate, so any newly-reachable code path that could write to stderr
reds every H9a area; weakening that gate needs a re-recorded baseline, not a
preference. A signature change to `parseExpressionSource` also touches its
fourth caller (`production-theta-producer.ts:1240`, bug 0102's surface) alongside
`checkQueryInterpolationResults` and `stringifyInterpolation`, so the change is
typechecked across three subsystems even when its behaviour is confined to one.

**(e) Bug 0079's ONE emission site must stay one — and its witness asserts it
cell by cell.** `tests/interpolated-result-gate.test.ts`'s `assertGateFired`
asserts exactly one diagnostic carries `theta/parse/interpolated-result`, and
`assertGateFiredWith` asserts the **whole** `diagnostics` array equals a
single-row list. Every group-(a) fixture interpolates a `Result`-valued
expression, so a route that emits a second diagnostic for those same
interpolations reds those cells. Two consequences: the new emissions must not
overlap 0079's input class (a `Result`-valued interpolation is otherwise
well-formed, so under routes 1 and 3 it should draw nothing new), and if any
fixture's array grows, the change to that witness is a deliberate, argued edit
rather than a relaxation. Bug 0084's witness needs no change: its cell s5 pins
`--` inside template **prose**, which is not an interpolation and stays silent
under every route.

**The controls any route preserves.** Measured silent today and required silent
after: `${c - -}` (legal subtraction of a negation, bug 0084's own control); a
legal ternary; every one of the 37 committed interpolations; `--`/`++` inside
template prose, inside a `//` comment and inside a string literal (bug 0084's
GOV-15 guards, cells s5–s7); and `\${x}`, where `\$` suppresses the
interpolation entirely. Measured refused today and required refused after, with
the same code and count: the three lex-phase rows, and `match` / nested
`@`-query at exactly one diagnostic each.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseThetaDocument` call, or one prompt-mode drive over the session double
bug 0079's witness establishes, so the harness is
`tests/interpolated-result-gate.test.ts`'s drive plus
`tests/helpers/e2e-s1.ts`'s `parseDoc` — extended, not a new mechanism.
Required: the thirteen-row inventory with its `let`-RHS controls and its
rendered turns; the three uncoded-abort rows; the lex-phase rows that must keep
firing; the two walk members at exactly one diagnostic each; the truncation
table read off `parseExpressionSource`; the position sweep (`fn` body, typed
query, two interpolations in one template); every control above; and the corpus
census as a gate rather than a note. Expected messages sourced from the
registry's *Message* column per DIAG-4, as both sibling witnesses already do.

## Provenance

- Origin: the bug 0084 fix (0.71.0, commit `9fe13534`), residual (ii) of its own
  §Fix record — `docs/bugs/0084-increment-decrement-check-dead.md:230–235`:
  "`${c--}` inside a `@`-template interpolation stays silent — the hook fires,
  but `parseExpressionSource` discards diagnostics by pre-existing design and the
  load-time interpolation walk reports only `match` / `@`. Control `${c - -}` is
  equally silent and the pre-fix render degraded to `c` just as silently, so the
  observable is byte-unchanged by this fix and outside §Fix's four measured
  positions." `:243–244`: "All four are surfaced for filing by the operator; none
  is created or worsened here." This report is that filing, and adds what the
  residual does not
  state: the general scope (eight registered codes, thirteen measured rows), the
  lex/parse asymmetry that bounds it, the truncation half and the rendered turns,
  the type-layer's independent second reason, the position sweep, the corpus
  census, the second discarded channel, and the five §Fix questions with 0079's
  coordination constraint.
- The byte-unchanged claim across the 0084 fix is that report's measurement, not
  re-run here (it requires the pre-fix tree). Its mechanism is consistent with
  what is measured at HEAD: before 0084, `c--` lexed as `c`, `-`, `-`, and
  `parseExpressionSource("c - -")` returns `ident c` truncated at column 1
  (measured), which renders the value of `c` — the same `count 5` measured at
  HEAD for `${c--}`. The `${c - -}` control is re-measured here and is silent.
- Spec: `docs/spec_topics/expressions.md:3` (the same-grammar sentence — the
  anchor), `:19` (query templates take any supported expression), `:25`, `:27`
  (the `Not supported` list is a parse-error list), `:29`, `:31`, `:32`, `:35`,
  `:36`, `:37`, `:39`, `:40` (the individual entries, and the only
  position-qualified one);
  `docs/spec_topics/query/query-escapes-stringification.md:12` (QRY-17), `:14`,
  `:16` (QRY-18 and its table);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
  (DIAG-2), `:74` (DIAG-4), `:44–46` (the located-site classification);
  `docs/spec_topics/diagnostics/code-registry-parse.md:23`, `:27`, `:29`, `:33`,
  `:36`, `:38`, `:61`, `:63`, `:68`, `:69`, `:72`, `:77`. User-facing mirrors:
  `docs/reference/frontmatter.md:256–265`; `docs/reference/diagnostics.md:73`,
  `:79`, `:121`.
- Implementation evidence at `36540b09`:
  `src/parser/theta-document.ts:788` (the whole-document `BodyParser`),
  `:1138–1148` (the docstring and its lex-only rationale), `:1149–1160`
  (**`parseExpressionSource`** — the discard), `:1649`
  (`BodyParser.diagnostics`), `:3105–3107` (`parseSingleExpression`, no EOF
  check), `:3791–3815` (`consumeTrailingAssignment`, the
  `assignment-as-expression` push at `:3801–3807` whose diagnostic is dropped
  inside an interpolation), `:4391–4476` (`parseQuery`; the token walk
  `:4451–4453`, the verbatim slice `:4463–4469`, the returned node
  `:4470–4475`), `:6473–6478`
  (`walkExpr`'s `query` arm and its blind-spot comment), `:6537–6582`
  (`checkQueryTemplateInterpolations`), `:6591–6609`
  (`firstForbiddenInterpolationToken` — the two-member reported set),
  `:6617–6631` (`firstForbiddenInterpolationForm`);
  `src/parser/type-layer-checks.ts:1191–1193` (the `query` arm), `:1260–1270`
  (the range docstring), `:1271–1298` (`checkQueryInterpolationResults`, bug
  0079's ONE emission site, its push at `:1289–1295`);
  `src/lexer/lexer.ts:175` (`twoCharOperators`), `:320–331` (the template-body
  state machine and the interpolation carve-out), `:377–390` (entering `${`),
  `:415–425` (the `block-comment` push), `:715–727` (restoring prose);
  `src/render/query-render.ts:132–134` (`QueryTemplatePart`, no offsets),
  `:141–146` (`QueryTemplateLexResult`), `:157–267` (`lexQueryTemplate`;
  `:207–211` the illegal-escape push, `:258–264` the unterminated push, `:266`
  the return);
  `src/extension/production-theta-producer.ts:1240` (the `params:` caller),
  `:5626–5637` (`renderQueryText`), `:5657–5683` (`stringifyInterpolation`,
  `:5658` the parse, `:5662` the inert `"null"`);
  `src/parser/system-interpolation.ts:56` and `:334` (the `system:` surface's own
  code and its push).
- Test evidence at `36540b09`: `tests/e2e-s1-expr-diagnostics.test.ts:114–130`
  and `:155–171` (the whole committed coverage of diagnostics inside an
  interpolation — four cells, both walk members);
  `tests/interpolated-result-gate.test.ts` (bug 0079's witness; `assertGateFired`
  `:281–309`, `assertGateFiredWith` `:357–382`, the prompt-mode drive harness
  `:384–552`); `tests/increment-decrement-wiring.test.ts` (bug 0084's witness,
  25 cells; its prose/comment/string-literal guards are the GOV-15 controls);
  `tests/fixtures/h7a/permitted-codes.json` (11 entries, no `theta/parse/*`);
  `tests/live/acceptance/harness.ts:479` (`ACCEPTANCE_STDERR_ALLOWLIST`, empty),
  `:534–546` (`assertStderrClean`).
- Reproduction: five scratch vitest files at `36540b09` — the thirteen-row
  inventory with `let`-RHS controls, the rendered turn for each through the real
  prompt-mode production binding, the lex-phase and walk-member rows, the
  both-levels-silent controls, the position sweep, the truncation table read off
  `parseExpressionSource`, the pair-consumption evidence for the 0084 hooks, the
  whole-file token stream for an interpolation, the template-lex channel rows,
  the `params:` adjacent-surface row, and a census over all 34
  committed `.theta`/`.thetalib` files (37 interpolations, 0 flagged, 0
  truncated). The `system:` surface is the one claim read off the module rather
  than probed: `rg -l parseExpressionSource src/` returns exactly three files
  — `src/parser/theta-document.ts` (the definition),
  `src/parser/type-layer-checks.ts` (`:53`) and
  `src/extension/production-theta-producer.ts` (`:220`) — and
  `src/parser/system-interpolation.ts` is not among them.
  Run on the outputs quoted above, then deleted. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.
