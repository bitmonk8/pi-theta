# Bug 0123 — A `--` in `match` pattern position never draws the registered `theta/parse/increment-decrement`: `parsePattern`'s one-token wildcard recovery consumes the operator token as a wildcard, so `match x { --y => 1, _ => 2 }` is refused under `theta/parse/statement-in-arm-body` **plus** a cascading `theta/parse/match-arm-type-mismatch` about a null-bodied phantom arm the parser itself invented, while the same recovery admits `[--y]`, `{ a: --y }` and a bare `--` pattern with zero diagnostics — bug 0084 wired the operator at two *expression*-walk hooks, and a pattern is not an expression

- **Status:** fixed (0.151.0). The adjudication this report was filed to deliver
  is recorded in §Fix (0.151.0): §Expected behaviour (1) resolves to Reading A
  and route (a) shipped. The three routes and the constraints below are left as
  filed — they are the reasoning the record decides against, not stale prose.
- **Sev/Diff estimate:** S2/D3 — the primary input fails loudly at `E` under
  the wrong code with a spurious second diagnostic, which is the S2 band
  verbatim ("wrong diagnostic code/text, spurious duplicate diagnostics"); D3
  because §Fix needs an in-run DIAG-2 *Trigger* adjudication and any code
  touches a recovery shared by every pattern sub-position under
  pinned-byte coordination against bug 0084's 25-cell witness and the lexer's
  two-character operator set.
- **Kind:** defect — a registered `E`-severity row whose *Trigger*
  (`docs/spec_topics/diagnostics/code-registry-parse.md:33`: "`++` or `--`
  operator used.") carries no position qualifier does not fire in a position
  where the operator token appears, and the input is refused instead under two
  neighbouring codes: `theta/parse/statement-in-arm-body`, whose message names a
  repair that does not apply (and which bug 0082 reports is unimplemented), and
  `theta/parse/match-arm-type-mismatch`, which reports a type relation between
  arm bodies the author never wrote. Both codes are registered, so DIAG-1
  (`diagnostic-shape.md:71`) is satisfied; the defect is which row fires. Three
  pattern sub-positions of the same recovery admit the token with **zero**
  diagnostics and silently change what the pattern matches.
- **Related:**
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, the
    parent. Its fix lexes the byte-adjacent pair as one `punct` token
    (`twoCharOperators`, `src/lexer/lexer.ts:175`) and calls the previously
    callerless `checkIncrementDecrement` from a prefix arm in `parseUnary`
    (`src/parser/theta-document.ts:3312–3330`) and an arm in `parsePostfix`'s
    suffix loop (`:3433–3447`). It **deliberately did not reach pattern
    position**, on the stated ground that pattern position is not an expression
    position, so neither hook is on the path; its fix record files this as
    residual (iii) (`docs/bugs/0084-increment-decrement-check-dead.md:235–239`)
    and dispositions it "surfaced for filing by the operator; none is created or
    worsened here" (`:243–244`). That disposition is not reopened: this report
    is the filing it names, and it does not ask 0084 to be re-fixed.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, the shape. Its §Actual behaviour names the class exactly: "a
    rejection with the right severity, the wrong code, the wrong count of
    diagnostics, and a Hint … that describes a repair which does not apply"
    (`:161–164`). Its coordination note records this instance as belonging to
    that shape rather than to 0084's (`:645–652`). **How this instance differs
    from the ones 0072 owns:** there the specified codes were unreachable from
    *every* input because `checkToolCallArguments` had no `src/` caller at all;
    here the emitter has two live callers and fires correctly in statement,
    expression, loop-body, `fn`-body, `match`-scrutinee and `match`-arm-body
    position (measured below) — the gap is positional, not a dead function. The
    second difference is the cascade's origin: 0072's duplicate came from one
    real argument position being reported twice, while here the second
    diagnostic is about a *phantom arm* the recovery synthesised.
  - [0082](./0082-blockexpr-production-unimplemented.md) — **open**. The repair
    the wrongly-emitted `theta/parse/statement-in-arm-body` message names
    ("wrap statements in a block expression `{ ... }`") has no AST node, so it
    is not merely inapplicable to `--y` — it is unimplemented for every input.
    That report owns the `BlockExpr` gap; this one owns which code fires on a
    pattern-position `--`. Disjoint fixes, one shared message.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, the family template: a registered parse code whose sole emitter
    has no `src/` caller. The contrast is the point — after 0084 the
    increment/decrement emitter is fully wired, so this report is not another
    dead-emitter instance but a reachability gap in one grammatical position.
- **Affected** (every citation verified at HEAD `36540b09`, 0.71.0):
  - `src/parser/theta-document.ts:3959–3961` — **the defect site**, the last
    three lines of `parsePattern` (declared `:3817`): `// Unrecognised: consume
    one token and treat as a wildcard to keep progress.` / `this.advance();` /
    `return { kind: "wildcard" };`. One unconditional token consumption, no
    diagnostic, and the returned node is indistinguishable from a `_` the author
    wrote.
  - `src/parser/theta-document.ts:3817–3962` — the whole of `parsePattern`. It
    recognises exactly the seven forms `expressions.md:165–172` enumerates:
    number (`:3834`), string (`:3838`), array (`:3842`), `true`/`false`/`null`
    (`:3856`, `:3860`, `:3864`), `Ok(…)`/`Err(…)` (`:3871`), `Ident { … }`
    (`:3880`), bare `{ … }` (`:3923`), `_` (`:3917`) and an identifier binding
    (`:3920`). Everything else falls to `:3959`.
  - `src/parser/theta-document.ts:3821–3831` — the `mut` arm of the same
    function: it calls `checkMutModifier({ position: "match-bind" })` and pushes
    the result. `parsePattern` therefore already emits a registry code scoped to
    this exact position, and `checkIncrementDecrement` is already imported into
    this file (`:58`). No structural barrier exists at the site.
  - `src/parser/theta-document.ts:3761–3782` — `tryConsumeRestPattern`, the
    precedent for rejecting an out-of-grammar pattern token *before* the
    fall-through: it matches three `.` puncts, emits
    `theta/parse/rest-pattern-not-supported` and consumes the form. Called first
    at `:3818`.
  - `src/parser/theta-document.ts:3621–3679` — `parseMatch`, the caller: the
    `parsePattern` call (`:3637`), the guard arm (`:3641–3651`), the two-token
    `=>` consumption (`:3653–3656`), the `tryConsumeArmBodyStatement` call
    (`:3659`), the `nullExpr` substitution when it returns true (`:3660–3662`),
    the unconditional `arms.push` (`:3663`) and the no-progress guard
    (`:3667–3670`). The guard is a termination backstop and is **not** what
    produces the cascade — the recovery makes progress.
  - `src/parser/theta-document.ts:3699–3752` — `tryConsumeArmBodyStatement`, the
    emitter of the first observed code. Its `assignHead` test (`:3711–3716`)
    fires on `ident` followed by a single `=` that is not `==` — which is what
    the `y` of `--y` plus the `=` of the unconsumed `=>` looks like. The push is
    `:3720–3728`; the consumption is `tryParseReassign()` (`:3750`). The pushed
    object carries no `hint` field, so the row's *Hint*
    (`code-registry-parse.md:55`) is never rendered even when the code is right.
  - `src/parser/type-layer-checks.ts:1111–1119` — the emitter of the second
    observed code: the `case "match":` arm passes
    `e.arms.map((arm) => this.typeOf(arm.body, bindings))` to
    `checkMatchArmTypes` with `sink: undefined` and the whole `match`
    expression's range as the site. The phantom arm's `null` body is one of
    those arm types.
  - `src/parser/match-result.ts:165–193` — `checkMatchArmTypes`; `:190–191`
    returns the mismatch when `leastUpperBound` (`:214–238`) finds no candidate;
    `:196–205` — `mismatchDiagnostic`, whose `range` is the site's, i.e. the
    `match` keyword.
  - `src/diagnostics/diagnostic.ts:107–123` — `assembleDiagnostics`, which sorts
    `(file, line, col)`. This is why the pair's order is stable and why the
    `type`-phase code prints *before* the `parse`-phase one: the mismatch's range
    is the `match` keyword, left of the arm.
  - `src/lexer/lexer.ts:175–177` — `twoCharOperators`, bug 0084's limb:
    `["==", "!=", "<=", ">=", "&&", "||", "++", "--"]`. This is what makes the
    byte-adjacent pair **one** `punct` token before `parsePattern` sees it;
    `:185–191` `trailingTriggers` and `:197–203` `leadingTriggers` exclude the
    pair, and `collapseContinuations` (`:742`) runs after scanning.
  - `src/parser/bindings.ts:179–192` — `checkIncrementDecrement`, the registered
    row's sole emitter: severity `error`, message `'<op>' operator is not
    supported`, hint ``Use `count += 1` / `count -= 1`.`` It takes only
    `{ op }` and a `{ file, range }` site, so it is callable from `parsePattern`
    unchanged.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:33` — the row under
    adjudication. *Trigger* verbatim: "`++` or `--` operator used." *Sev* `E`,
    *Phase* `parse`, *Spec rule* [Bindings — Increment / decrement], *Hint*
    "Use `count += 1` / `count -= 1`.", *Message* `'<op>' operator is not
    supported`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:55` — the
    `theta/parse/statement-in-arm-body` row (*Phase* `parse`), *Trigger* "A
    `match` arm body is a bare `if` / `for` / `while` / `let` / assignment
    statement."; `:75` — `theta/parse/match-arm-type-mismatch` (*Phase* `type`,
    *Hint* `—`), *Trigger* "A `match` arm's body type is not assignable to the
    common type of the other arms."
  - `docs/spec_topics/diagnostics/code-registry-parse.md:31` — the
    `theta/parse/mut-on-immutable-context` row, whose *Trigger* names "`match`
    pattern binding" explicitly. The registry does reach into this position when
    it means to, and `parsePattern` already emits it.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:29` — the
    `theta/parse/assignment-as-expression` row, whose *Trigger* is scoped
    "Assignment used in expression position". Together with `:31` this
    establishes the table's convention: a position-scoped row states its
    position in its own *Trigger* prose. Row `:33` states none.
  - `docs/spec_topics/bindings.md:36` — the rule the row points at: "`++` and
    `--` are `theta/parse/increment-decrement`. Use `count += 1` /
    `count -= 1`." Unqualified as to position.
  - `docs/spec_topics/expressions.md:25` (`## Not supported`), `:27` ("(Parse
    error — `theta/parse/unsupported-feature` unless a more specific code below
    applies.)") and `:37` ("- Increment / decrement (`++`, `--`)"). In pattern
    position neither the specific code nor `:27`'s default fires.
  - `docs/spec_topics/expressions.md:163–172` — **Pattern grammar (theta
    1.0)**, the closed table of seven forms (`:167` wildcard, `:168` identifier,
    `:169` literal, `:170` constructor, `:171` object/schema, `:172` array —
    "exact-length array; each slot matches its pattern"). No signed or
    operator-prefixed form appears. `:174` is the bind-versus-constructor
    disambiguation; `:176` names the two out-of-grammar forms that *do* have
    codes (`match-guard-not-supported`, `rest-pattern-not-supported`); `:180`
    (**Arm syntax**) is the arm-body-is-an-expression rule and the source of
    both observed codes.
  - `docs/spec_topics/grammar.md:145–166` — `## match arm body`: the
    `MatchArm ::= Pattern "=>" ArmBody` production (`:147–151`), the
    statement-is-not-an-arm-body rule (`:153`) and the
    `statement-in-arm-body` sentence (`:166`). `:82` scopes non-`match`
    `Pattern` to `_`-or-identifier and defers destructuring patterns to
    `expressions.md`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:65` — **Multi-error
    reporting**: "Every parse / type pass collects all errors from the full file
    … rather than fast-failing on the first error". `:24` — **Re-scan
    deduplication**, whose subject is repeat renders across reloads and which
    states "the renderer MUST NOT attempt to suppress duplicates". `:71`
    DIAG-1, `:72` DIAG-2, `:74` DIAG-4, `:80` the column legend ("*Trigger* is
    the canonical condition"). **There is no rule anywhere on this page
    requiring one diagnostic per mistake, and none permitting or forbidding a
    cascade** — searched for `cascad`, `duplicate`, `single diagnostic`,
    `first error` and `suppress`; those five lines are every hit.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out and
    its disposition of a *Trigger* change "as an addition for inputs newly
    brought into the code's emission set").
  - `docs/reference/diagnostics.md:79` — the mirror row (Code / Sev / Phase /
    Message only); `:8–9` states the *Trigger* / *Spec rule* / *Hint* columns
    are deliberately not restated there, so a *Trigger* amendment does not reach
    this page. `docs/reference/grammar.md:354` **does** carry the mapping
    ("`++`/`--` (`theta/parse/increment-decrement`)") and `:291–300` mirrors the
    pattern-grammar table; both are in scope for any Trigger or grammar edit.
  - `tests/increment-decrement-wiring.test.ts` — bug 0084's 25-cell offline
    witness (`npx vitest run tests/increment-decrement-wiring.test.ts` →
    `25 passed (25)` at this HEAD). Not one cell drives pattern position; its
    header enumerates the covered positions as statement, expression, loop body
    and `fn` body (`:43–57`). **Test coverage of this defect: none.** No test in
    the tree puts any punctuation in `match` pattern position; the only
    `parsePattern` fall-through exercise anywhere is bug 0082's block-expression
    work on the arm *body*.
  - `tests/fixtures/h7a/permitted-codes.json` — 11 codes, none of them
    `theta/parse/*`; `tests/live/acceptance/harness.ts:479`
    (`ACCEPTANCE_STDERR_ALLOWLIST`, ships empty) and `:489`
    (`acceptanceStderrOffenders`) are the H9a empty-capture gate any
    newly-reachable code is assessed against.
- **Observed at:** `0.71.0` (HEAD `36540b09`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through the shared harness `tests/helpers/e2e-s1.ts` (`parseDoc`), reading
  `document.diagnostics` and `document.body` unfiltered; written, run, deleted.

## Summary

`parsePattern` recognises the seven pattern forms `expressions.md:165–172`
enumerates and ends with an unconditional recovery: consume one token, return a
wildcard, emit nothing (`src/parser/theta-document.ts:3959–3961`). A `--` in
pattern position lands there. Bug 0084 made the byte-adjacent pair a single
`punct` token (`twoCharOperators`, `src/lexer/lexer.ts:175`) and wired
`checkIncrementDecrement` into `parseUnary` and `parsePostfix`; a `match`
pattern is parsed by neither, so the registered
`theta/parse/increment-decrement` cannot fire there.

What the author gets instead depends on what follows the operator. Six
sub-positions were measured and one of the six names the operator:

| pattern position | diagnostics at HEAD | what the parser built |
|---|---|---|
| `--y` (arm pattern) | `match-arm-type-mismatch` + `statement-in-arm-body` | 3 arms from 2 source arms; first body `null` |
| `y--` (arm pattern) | `match-arm-type-mismatch` + **`increment-decrement`** | 4 arms from 2; two bodies `null` |
| `--` alone (arm pattern) | **none** | `--` is a wildcard arm |
| `[--y]` (array element) | **none** | a 2-slot exact-length array pattern from a 1-slot source |
| `{ a: --y }` (field value) | **none** | field `a` bound to a wildcard, plus a phantom required field `y` |
| `Ok(--y)` (constructor inner) | `unknown-identifier` on `y` | `Ok(_)`, with `y` left outside the `)` |

The `--y` cascade is mechanical. The recovery eats the `--` and returns a
wildcard, leaving the cursor on `y`. `parseMatch`'s `=>` test (`:3653`) needs
`=` `>` at the cursor and finds `y`, so the arrow is not consumed; then
`tryConsumeArmBodyStatement`'s `assignHead` test (`:3711–3716`) sees an `ident`
followed by a single `=` — the `=` of the unconsumed `=>` — and reports the arm
body as a bare assignment statement (`:3722`), consuming `y =` and leaving `>`.
The arm is pushed with a `nullExpr` body (`:3660–3663`). The next loop turn
sends `>` back into `parsePattern`, which recovers it as a *second* wildcard
pattern whose body is the `1` the author wrote for the first arm. The type layer
then sees arm-body types `[null, integer, integer]`, finds no common upper bound
and reports `match-arm-type-mismatch` over the whole `match` expression
(`type-layer-checks.ts:1111–1119`, `match-result.ts:190–191`). One `--` produces
one extra arm, two diagnostics, and no mention of the operator.

Neither emitted code is unregistered, so DIAG-1 is satisfied, and no rule on
`diagnostic-shape.md` limits a mistake to one diagnostic — `:65` mandates the
opposite for genuine errors. The claim here is narrower: the second diagnostic
reports a type relation between arm bodies the author never wrote, because one
of the arms is the parser's own product.

`y--` is the asymmetric case. The identifier pattern parses, the `--` is left
over, the `=>` test fails again, `assignHead` is false (the cursor is on a
`punct`), and `parseExpression` reaches `parseUnary`'s prefix hook — so the
registered code **does** fire, with its Hint, from an *expression* hook reading
what the author wrote as a pattern, alongside the same mismatch cascade.

Three rows are silent, and those are the rows that change program meaning.
`-- => 1` loads clean with `--` acting as `_`. `[--y]` loads clean as a two-slot
pattern, and `expressions.md:172` makes array patterns exact-length, so the arm
now matches two-element arrays and binds `y` to the second element.
`{ a: --y }` loads clean as `{ a: _, y: y }`, requiring a field the author never
named. In all three the theta registers and runs.

## Reproduction

Offline at `36540b09`, 0.71.0. One scratch vitest file over the shared harness
`tests/helpers/e2e-s1.ts` — `parseDoc(src)` runs the real
`parseThetaDocument`. Every fixture is the prompt-mode frontmatter prelude
`---\nmode: prompt\n---\n` (source lines 1–3), then `let x = 1` (or
`let mut c = 1`), then the `match`-bearing line each `@@` row quotes, then a
tail expression `r` (or `c`). The quoted line is therefore always source line 5,
which is what every `5:<col>` below refers to. Diagnostics are the document's
whole `diagnostics` array, unfiltered, rendered `line:col severity code`; `arms`
is `body.statements[1].init.arms` with `range` keys stripped. Run, output quoted
verbatim, file deleted.

### The measurement — one `--`, two codes, neither about the operator

```
@@ let r = match x { --y => 1, _ => 2 }
   5:9   error theta/parse/match-arm-type-mismatch:
           match arm body type does not match the common type of the other arms
   5:21  error theta/parse/statement-in-arm-body:
           match arm body must be an expression; wrap statements in a block
           expression { ... }
   arms :: [{"pattern":{"kind":"wildcard"},"body":{"kind":"null"}},
            {"pattern":{"kind":"wildcard"},"body":{"kind":"number","text":"1"}},
            {"pattern":{"kind":"wildcard"},"body":{"kind":"number","text":"2"}}]
```

Three arms from two. `5:9` is the `match` keyword; `5:21` is the `y`. Neither
diagnostic carries a `hint` field, so neither row's *Hint* is rendered — the
`statement-in-arm-body` message names the block-expression repair inline, and
`match-arm-type-mismatch`'s registry *Hint* is `—` anyway.

**Order is stable.** Six repeat parses of the identical source, codes in array
order:

```
   run 0..5:  theta/parse/match-arm-type-mismatch | theta/parse/statement-in-arm-body
```

Stable by construction, not by luck: `assembleDiagnostics`
(`src/diagnostics/diagnostic.ts:107–123`) sorts `(file, line, col)`, and the
mismatch's range is the `match` keyword at column 9, left of the arm at column
21. The `type`-phase code therefore always prints before the `parse`-phase one.

### The pair does not depend on the arm bodies, the arm count, or the operator

```
@@ let r = match x { --y => 1, _ => 1 }      [both source bodies integer]
   match-arm-type-mismatch + statement-in-arm-body
@@ let r = match x { --y => "a", _ => "b" }  [both source bodies string]
   match-arm-type-mismatch + statement-in-arm-body
@@ let r = match x { --y => 1 }             [one arm, no catch-all]
   match-arm-type-mismatch + statement-in-arm-body
@@ let r = match x { ++y => 1, _ => 2 }      [the other operator]
   match-arm-type-mismatch + statement-in-arm-body
@@ let r = match x { -y => 1, _ => 2 }       [a single '-', not the pair]
   match-arm-type-mismatch + statement-in-arm-body
```

The source bodies are irrelevant because the phantom arm's `null` body is what
breaks the common upper bound. The last row bounds the defect honestly: the
recovery is indifferent to *which* punctuation it eats, so `--` is one member of
a larger input class (see §Non-goals).

### The registered code fires everywhere else in the same expression

```
@@ let r = match c { 1 => --c, _ => 2 }   [arm BODY]
   5:24  error theta/parse/increment-decrement: '--' operator is not supported
                                              [hint: Use `count += 1` / `count -= 1`.]
@@ let r = match --c { 1 => 1, _ => 2 }   [scrutinee]
   5:15  error theta/parse/increment-decrement: '--' operator is not supported
@@ c--                                    [statement position, bug 0084's r3]
   5:2   error theta/parse/increment-decrement: '--' operator is not supported
```

One `match` expression, three positions that draw the code and one that does
not. The difference is `parsePattern`, not the token.

### Postfix in pattern position: the right code plus the cascade

```
@@ let r = match x { y-- => 1, _ => 2 }
   5:9   error theta/parse/match-arm-type-mismatch
   5:20  error theta/parse/increment-decrement: '--' operator is not supported
                                              [hint: Use `count += 1` / `count -= 1`.]
   arms :: [{"pattern":{"kind":"identifier","name":"y"},"body":{"kind":"null"}},
            {"pattern":{"kind":"wildcard"},"body":{"kind":"null"}},
            {"pattern":{"kind":"wildcard"},"body":{"kind":"number","text":"1"}},
            {"pattern":{"kind":"wildcard"},"body":{"kind":"number","text":"2"}}]
```

Four arms from two. The operator is named — reached through `parseUnary`'s
prefix hook once `parseExpression` is entered on the leftover `--` — and the
mismatch still fires.

### The silent rows

```
@@ let r = match x { -- => 1, _ => 2 }
   <zero diagnostics>
   arms :: [{"pattern":{"kind":"wildcard"},"body":{"kind":"number","text":"1"}},
            {"pattern":{"kind":"wildcard"},"body":{"kind":"number","text":"2"}}]
@@ let r = match x { [--y] => 1, _ => 2 }
   <zero diagnostics>
   arms :: [{"pattern":{"kind":"array","elements":[{"kind":"wildcard"},
                                    {"kind":"identifier","name":"y"}]}, …}, …]
@@ let r = match x { { a: --y } => 1, _ => 2 }
   <zero diagnostics>
   arms :: [{"pattern":{"kind":"object","typeName":null,
              "fields":[{"name":"a","pattern":{"kind":"wildcard"}},
                        {"name":"y","pattern":{"kind":"identifier","name":"y"}}]}, …}, …]
@@ let r = match x { Ok(--y) => 1, _ => 2 }
   5:24  error theta/parse/unknown-identifier: unknown identifier 'y'
```

The first three load and run. `--` becomes `_`; a one-slot array pattern becomes
a two-slot exact-length pattern; an object pattern gains a required field named
after the operand. The constructor row is loud but reports the operand as an
unknown identifier, having recovered `--` as the constructor's inner pattern and
left `y` outside the closing `)`.

### The controls

```
@@ let r = match x { y => 1, _ => 2 }    [identifier pattern]      zero diagnostics
@@ let r = match x { _ => 1, _ => 2 }    [wildcard patterns]       zero diagnostics
@@ let r = match x { 1 => let z = 2, _ => 2 }   [a real bare statement in arm-body position]
   5:9   error theta/parse/match-arm-type-mismatch
   5:24  error theta/parse/statement-in-arm-body
```

The third control matters: a genuine bare statement in arm-body position
produces the *same pair of codes* as `--y`, because the `nullExpr` substitution
at `:3660–3662` is what breaks the common type there too. So the pair is not a
signature the author can use to tell the two mistakes apart.

### What bug 0084's token changed under `parsePattern`

The token stream did change. At HEAD the body of `match x { --y => 1, _ => 2 }`
lexes to `… punct:"{" punct:"--" ident:"y" punct:"=" punct:">" …` — one `punct`
whose text is `--`, from `twoCharOperators` (`src/lexer/lexer.ts:175`). Before
0084 the same bytes produced two `punct:"-"` tokens.

Both of 0084's parser arms are guarded by `incrementDecrementOp()`
(`src/parser/theta-document.ts:3297–3308`), which requires a single `punct`
token whose text is exactly `++` or `--`, and the lexer's pair branch requires
byte adjacency. A whitespace-separated `- -y` at HEAD therefore presents
`parsePattern` with exactly the pre-0084 token stream of `--y`, through
otherwise identical code (0084's `src/` diff is additive: `+63/−2`, both arms
new and guarded). That makes `- -y` a faithful proxy for pre-0084 `--y`, and it
measures differently:

```
@@ HEAD   let r = match x { --y  => 1, _ => 2 }
   match-arm-type-mismatch + statement-in-arm-body      [3 arms]
@@ PROXY  let r = match x { - -y => 1, _ => 2 }
   5:22  error theta/parse/unknown-identifier: unknown identifier 'y'   [4 arms;
         first body is binary '-' over a null left operand and ident y]
@@ HEAD   let r = match x { --  => 1, _ => 2 }      zero diagnostics   [2 arms]
@@ PROXY  let r = match x { - - => 1, _ => 2 }      match-arm-type-mismatch [4 arms]
@@ HEAD   let r = match x { y-- => 1, _ => 2 }      mismatch + increment-decrement
@@ PROXY  let r = match x { y- - => 1, _ => 2 }     match-arm-type-mismatch alone
@@ HEAD   let r = match x { [--y]  => 1, … }   zero diagnostics  [2-slot array pattern]
@@ PROXY  let r = match x { [- -y] => 1, … }   zero diagnostics  [3-slot array pattern]
```

**The recovery is unchanged; the observed diagnostics are not.** `parsePattern`
consumed one token as a wildcard and said nothing about the operator before
0084 and does so still — that is the equivalence 0084's residual (iii) and
0072's coordination note assert, and it holds. What those two notes do not say,
and what is measured above, is that the *token boundary* moved: the recovery
used to eat the first `-` and leave the second for the arm body, and now eats
the pair whole. Three of the four spellings changed their diagnostic set as a
result — `--y` from one `unknown-identifier` to the pair, `y--` gained the
registered code, and `-- => 1` went from one `E` to loading cleanly. The array
row's diagnostic set is unchanged (zero both ways) and its *pattern arity*
changed instead, from three slots to two.

No GOV-15 claim follows from this. The promise is keyed to what loads cleanly
under theta **1.0.0** (`source-language-stability.md:9`), and the proxy measures
0.70.0's behaviour, not 1.0.0's; 0084's own carve-out discharge covers the
inputs its §Fix measured, and pattern position was not among them. The point is
narrower and is about this report's framing: pattern position is not a surface
0084 left untouched. It is a surface whose observable 0084 changed, and whose
pre-fix observable its residual note records as equivalent when the diagnostic
sets differ.

## Expected behaviour

Two questions, one of which is the crux.

### (1) Is a pattern-position `--` inside the registered row's *Trigger*?

The *Trigger* verbatim (`code-registry-parse.md:33`): "`++` or `--` operator
used." The column legend calls *Trigger* "the canonical condition"
(`diagnostic-shape.md:80`), so this sentence is what decides whether
non-emission here is a defect at all.

**Reading A — the input is inside the trigger; non-emission is the defect.**

1. The sentence carries **no position qualifier**, and the table's own
   convention is to state position when position matters. Two rows on the same
   page prove it: `theta/parse/assignment-as-expression` (`:29`) is scoped
   "Assignment used in expression position", and
   `theta/parse/mut-on-immutable-context` (`:31`) enumerates "a function
   parameter, `for` iteration variable, or `match` pattern binding". Row `:33`
   names a lexeme and stops.
2. `:31` also settles that the registry reaches into this exact position, and
   `parsePattern` already emits it (`theta-document.ts:3821–3831`). So neither
   the spec nor the code treats pattern position as out of the diagnostics
   surface.
3. The row's *Spec rule* target is equally unqualified: `bindings.md:36` —
   "`++` and `--` are `theta/parse/increment-decrement`."
4. `expressions.md:37` lists increment/decrement among forms that are not
   supported **at all**, under a heading (`:25`) whose default disposition is
   `theta/parse/unsupported-feature` "unless a more specific code below applies"
   (`:27`). In pattern position neither the specific code nor the default
   fires, so the input escapes a rule stated twice.
5. At HEAD the lexer itself judges the bytes to be one operator token
   (`lexer.ts:175`). "Operator used" is satisfied by the token the author wrote;
   position changes where it was used, not what it is.

**Reading B — the input is outside the trigger; the row is expression-scoped.**

1. The row's *Hint* — "Use `count += 1` / `count -= 1`." — names a
   *reassignment statement*. `expressions.md:180` admits only an expression as
   an arm body and the pattern grammar (`:163–172`) admits no assignment
   anywhere, so the repair the row prescribes cannot be written in this
   position. A trigger whose prescribed repair is unavailable arguably does not
   reach here.
2. The unsupported-forms list is on the **Expression Sublanguage** page and is
   introduced as expression syntax; a pattern is a separate closed grammar with
   its own page section.
3. What the author actually did wrong is write a pattern that is not one of the
   seven forms — a grammar violation whose diagnosis is `--` being unrecognised,
   not `--` being an unsupported operator. The spec names dedicated codes for
   exactly two out-of-grammar pattern forms (`:176`: guards and rest patterns)
   and none for the general case, so the corpus is silent on what an
   unrecognised pattern token draws.

**Reading A is better supported**, on point 1 and point 2 together: the table
states position where position is load-bearing, this row states none, and the
neighbouring row proves `match` pattern position is inside the registry's reach
and inside `parsePattern`'s emission surface already. Reading B's strongest
point is real but is an argument about the *Hint*, not the *Trigger* — the
prescribed repair being unwritable in this position is a defect in what the row
says to do, not evidence that the operator was not used. It does mean Reading A
alone does not produce a good diagnostic: emitting the row here names the
operator and then prescribes `count -= 1` in a position where no assignment is
legal. §Fix (a) has to answer that.

Under Reading A, on the measured input, one diagnostic is owed:
`theta/parse/increment-decrement`, severity `error`, message
`'--' operator is not supported`, range the operator token — and the
`statement-in-arm-body` / `match-arm-type-mismatch` pair is a cascade from a
recovery that should not have produced the arm it reports on. Under Reading B a
*different* single diagnostic is owed and does not exist: no registered code
covers "this is not a pattern", so Reading B forces a DIAG-2 row addition or an
explicit spec sentence dispositioning an unrecognised pattern token.

### (2) Is the spurious second diagnostic a rule violation?

**No — and the report does not claim one.** `diagnostic-shape.md` carries no
single-diagnostic, no-cascade or de-duplication rule for a single pass: `:65`
requires the opposite ("collects all errors from the full file … rather than
fast-failing on the first error"), and `:24`'s deduplication sentence is about
repeat renders after a watcher reload and forbids the renderer suppressing
duplicates. Those are the only two lines on the page touching diagnostic
multiplicity.

What is nonetheless owed follows from `:75`'s own *Trigger* — "A `match` arm's
body type is not assignable to the common type of the **other arms**". The
measured `match x { --y => 1, _ => 2 }` has two arms, both with integer bodies;
the type layer reports a mismatch because it is shown three arms, one of which
the parser synthesised with a `null` body. The diagnostic is true of the AST and
false of the source, so it is out of its own trigger with respect to the file
the author wrote. That, not the count, is the defect in the second code.

Also owed under either reading: the pattern the parser builds must not silently
differ from the pattern the author wrote. `expressions.md:172` makes an array
pattern exact-length, so `[--y]` becoming a two-slot pattern changes which
runtime values the arm matches with no diagnostic on any channel; `{ a: --y }`
gaining a required field `y` does the same for object patterns; `--` becoming
`_` makes the arm a catch-all. `expressions.md:178` leaves exhaustiveness
unchecked and sends an uncovered scrutinee to a runtime `MatchError`, so a
pattern that matches the wrong shape is discovered — if at all — as a runtime
panic in a different file.

## Actual behaviour / root cause

**One unconditional token consumption with no diagnostic.**
`src/parser/theta-document.ts:3959–3961`:

```ts
    // Unrecognised: consume one token and treat as a wildcard to keep progress.
    this.advance();
    return { kind: "wildcard" };
```

The comment states the purpose: guarantee progress. The cost is that every
unrecognised token in pattern position becomes an *indistinguishable* wildcard —
no variant of `PatternNode` carries a range (`:249–259`), and the node carries no
marker and no diagnostic either, so nothing downstream can tell it from a `_`
the author typed. The positive recognition above it (`:3817–3958`) covers
exactly `expressions.md:165–172`'s seven forms, and `tryConsumeRestPattern`
(`:3761`,
called first at `:3818`) shows the alternative shape: match the out-of-grammar
form, emit its registered code, consume it, return.

**Pattern position is not on either of bug 0084's hooks.** The prefix arm is the
first statement of `parseUnary` (`:3312–3330`) and the postfix arm is inside
`parsePostfix`'s suffix loop (`:3433–3447`); both are reached only from
`parseExpression`. `parseMatch` calls `parsePattern` directly (`:3637`) and
reaches `parseExpression` only for the arm *body* (`:3662`) and, through
`parseHeaderExpression`, the scrutinee (`:3623`). Measured above: scrutinee and
arm body draw the code, the pattern does not. The emitter itself is one
`{ op, site }` call away — `checkIncrementDecrement` is already imported at
`:58` and already called twice in this file.

**The cascade is produced by the recovery's own leftovers, in four steps.**

1. `parsePattern` consumes `--`, returns `{ kind: "wildcard" }`. Cursor: `y`.
2. `parseMatch`'s arrow test (`:3653`) requires `=` then `>` at the cursor and
   finds `y`, so the `=>` is left unconsumed.
3. `tryConsumeArmBodyStatement`'s `assignHead` (`:3711–3716`) is `ident` with a
   following single `=` that is not `==`. The `y` and the arrow's `=` satisfy it
   exactly, so `theta/parse/statement-in-arm-body` is pushed at the `y`
   (`:3720–3728`) and `tryParseReassign` (`:3750`) consumes `y =`. The arm is
   pushed with `nullExpr` (`:3660–3663`).
4. The loop's next turn puts the arrow's orphaned `>` into `parsePattern`, which
   recovers *it* as a second wildcard — so the author's `1` becomes the body of
   an arm whose pattern is half of the arrow they wrote.

The type layer then receives `armTypes: [null, integer, integer]` from
`e.arms.map(...)` (`type-layer-checks.ts:1114`). `leastUpperBound`
(`match-result.ts:214–238`) needs a candidate every arm is `⊑`: `null` is not
covered by `integer` and `integer` is not covered by `null`, so no candidate
survives, `lub` is `undefined` and `mismatchDiagnostic` is returned
(`:190–191`) with the whole `match` expression's range. Both diagnostics are
therefore consequences of step 1, and the sort in `assembleDiagnostics`
(`src/diagnostics/diagnostic.ts:107–123`) fixes their order at
`(match keyword) < (arm)`.

**Why the same recovery is silent in the other sub-positions.** The
array-element loop (`:3845–3850`) and the object-field loops (`:3883–3910`,
`:3926–3953`) call `parsePattern` inside a `while` bounded by `]` or `}`, so a
recovered wildcard is a well-formed element or field value and the loop
continues — there is no leftover token to misread, and nothing checks arity or
field provenance. `-- => 1` is silent for the opposite reason: the recovery
consumes the whole pair, the arrow parses, and the arm is complete. A short
pattern list and a complete one are the same type; a synthesised wildcard and an
authored `_` are the same node. No post-condition exists anywhere to notice.

**The token boundary moved at 0084, and that is what selects the outcome.**
Measured in §Reproduction: with two `-` tokens the recovery ate one and left the
other inside the arm body, which produced `unknown-identifier` for `--y` and a
lone `match-arm-type-mismatch` for `--`; with one `--` token it eats the pair.
The recovery's *rule* is unchanged, its *input* changed, and the observable
changed with it — the diagnostic set in three of the four measured spellings, the
pattern arity in the fourth.

## Why it matters

- **The author is told the wrong thing twice.** `statement-in-arm-body`'s
  message says "wrap statements in a block expression `{ ... }`". There is no
  statement — and per bug [0082](./0082-blockexpr-production-unimplemented.md)
  the block expression it names is unimplemented, so following the instruction
  produces `theta/parse/bare-object-literal`. The registered row that names the
  operator and its repair exists, is implemented, is wired, and stays silent.
- **The second diagnostic is about source the author did not write.** The arm
  whose body type breaks the common type is the parser's own phantom arm. Its
  registry *Trigger* (`code-registry-parse.md:75`) speaks of "the other arms",
  and the count of arms it reports over is not the count in the file.
- **The pair is not diagnostic of the mistake.** A genuine bare statement in
  arm-body position (`1 => let z = 2`) produces the identical two codes at the
  identical severities, so an author cannot distinguish "you wrote a statement
  where an expression belongs" from "you wrote an operator where a pattern
  belongs".
- **Three spellings of the same mistake load and run.** `-- => 1` silently
  becomes a catch-all; `[--y]` silently becomes a two-slot exact-length pattern;
  `{ a: --y }` silently requires a field named `y`. Each changes which runtime
  values the arm matches, with `expressions.md:178` deferring the consequence to
  a `theta/runtime/match-error` raised elsewhere. These rows are silent
  acceptance of an input the spec refuses in two places (`bindings.md:36`,
  `expressions.md:37`), not a wrong-code complaint.
- **The position is reachable by ordinary editing.** A `match` arm is the one
  place a bare identifier is a *binding* rather than a use, so an author
  transplanting `--count` from a loop body into an arm, or pasting a JS `switch`
  arm, lands exactly here. The measured `-y` row shows the same recovery also
  swallows a leading `-`, so a negative-literal pattern reaches it too.
- **Nothing in the suite scores any of it.** Bug 0084's 25-cell witness covers
  statement, expression, loop-body and `fn`-body position and no pattern
  position; no test in the tree puts punctuation in a `match` pattern at all. A
  fix here has no existing red to turn green and no existing cell to protect it
  from regressing back.

## Non-goals

- **The general leniency of `parsePattern`'s fall-through.** Measured: a single
  `-`, and by construction any other unrecognised token, produces the identical
  pair. This report's subject is the increment/decrement operator, for which a
  registered row exists whose *Trigger* is under adjudication. Whether the
  fall-through owes a *general* out-of-grammar pattern diagnostic — and under
  which code, since none exists — is the wider question §Fix (b) touches and
  does not settle.
- **Whether `-1` is a legal pattern.** `match x { -1 => 1, _ => 2 }` measures as
  four arms and one `match-arm-type-mismatch`. The pattern grammar's Literal row
  (`expressions.md:169`) lists `"validation"`, `0`, `true`, `null` and no signed
  form, so whether a negative literal pattern is admissible is an unanswered
  spec question with its own input class. Not adjudicated here.
- **The missing `hint` field on `theta/parse/statement-in-arm-body`.** Measured:
  the diagnostic pushed at `theta-document.ts:3720–3728` carries no `hint`, so
  the row's *Hint* (`code-registry-parse.md:55`) never renders even when the
  code is correct. A separate defect at a separate site, and the message names
  the same repair inline, so it does not change this report's observable.
- **The `BlockExpr` gap.** Bug 0082's subject.
- **`theta/parse/match-arm-type-mismatch`'s own correctness.** Given three arm
  types including a `null`, `checkMatchArmTypes` behaves as
  `expressions.md:180` prescribes. The defect is the third arm's existence, not
  the check.
- **The `nullExpr` substitution for a consumed arm-body statement**
  (`theta-document.ts:3660–3662`). It makes a genuine `statement-in-arm-body`
  drag a `match-arm-type-mismatch` along with it — measured in the third
  control — which is a cascade of its own with its own input class. This report
  does not adjudicate it; a §Fix route that removes the phantom *arm* does not
  touch it.
- **Bug 0084's shipped disposition.** Its four measured positions, its adjacency
  rule (`c-- c` and `c --c` emit), its GOV-15 discharge and its choice to
  recognise the pair in the scanner are settled by its fix record and are not
  reopened. This report neither asks for those to change nor claims the fix was
  incomplete against its own §Fix.

## Fix

**Not settled.** The routes below are the candidates with their consequences;
the constraints after them are binding on all three. The adjudication owed
first is §Expected behaviour (1) — whether row `:33`'s *Trigger* admits this
input — because route (c) is only available if the answer is no.

**(a) Recognise the operator in `parsePattern` and emit the registered code.**
Test for a `punct` whose text is `++`/`--` before the fall-through — the shape
`tryConsumeRestPattern` (`:3761`) already uses for out-of-grammar patterns —
call `checkIncrementDecrement`, consume the token, and return. Consequences:
the operator is named at its own range with the registry *Message*; the
`statement-in-arm-body` cascade disappears in the `--y` spelling only if the
recovery also consumes the operand, because leaving `y` in place reproduces
steps 2–4 of the cascade verbatim; and the three silent spellings become loud.
Two open questions this route must answer, not implementation details:
1. **What does the recovery return, and what does it consume?** Returning a
   wildcard after emitting keeps the arm well-formed but makes `[--y]` a
   two-slot pattern that now also carries a diagnostic. Consuming operator *and*
   operand keeps `[--y]` a one-slot pattern, at the cost of a rule that the
   pattern parser discards an operand it did not otherwise recognise.
2. **The Hint is wrong here.** `Use count += 1 / count -= 1` prescribes an
   assignment, and no assignment is legal in pattern position
   (`expressions.md:163–172`). Emitting the row unchanged trades a message that
   names nothing for a hint that prescribes the impossible. The registry rules
   disposition a *Message* reword (DIAG-4, `diagnostic-shape.md:74`, deferred to
   theta 2.0) and a *Trigger* change (DIAG-2, `:72`, same-commit spec edit), and
   name **no** disposition for a *Hint* edit — DIAG-2's list is "a new code,
   removing a code, or changing a code's namespace, severity, or trigger", and
   the GOV-15 carve-out (`source-language-stability.md:25`) enumerates the same
   operations plus a rename and a *Message* reword. A position-aware hint, or a
   spec sentence saying the hint does not apply in pattern position, is
   therefore an unadjudicated sub-question this route inherits, not a settled
   procedure.

**(b) Suppress the cascading second diagnostic.** Leave the primary code
question aside and stop the recovery from manufacturing an arm. Consequences:
`match-arm-type-mismatch` stops reporting over arms that are not in the source;
the count of diagnostics for the measured input drops to one. Two sub-questions:
which mechanism — not synthesising an arm when the arrow was never consumed, or
excluding a `nullExpr` body from `armTypes` at
`type-layer-checks.ts:1114` — and, whichever is chosen, that the third control
(a genuine bare statement in arm-body position) is on the same path, so its
currently-shipped two-diagnostic output changes too. That is an observable for
an input this report does not own; §Non-goals fences the substitution
deliberately. This route alone leaves the author with
`statement-in-arm-body` and no mention of the operator, so it is a component of
a fix rather than a fix.

**(c) Treat pattern position as outside the registered *Trigger* and say so.**
If §Expected behaviour (1) resolves to Reading B, row `:33`'s *Trigger* gains a
position qualifier and the corpus states what an unrecognised pattern token
draws. Consequences: no `src/` change is owed for the *primary* code, but the
three silent spellings and the phantom-arm cascade remain defects with no
registered code to carry them, so this route forces either a DIAG-2 row addition
for out-of-grammar patterns or an explicit spec sentence dispositioning them as
wildcards. A *Trigger* narrowing is a DIAG-2 spec change landing in the same
commit, dispositioned by `source-language-stability.md:25` "as a removal for
inputs taken out of" the code's emission set — and measured, **no input is
currently taken out**, since the code never fires in pattern position today, so
the narrowing is documentation of the shipped behaviour rather than a change to
it. That is this route's one advantage and its whole weakness.

**Constraints — binding on every route.**

- **Bug 0084's two expression-walk hooks stay.**
  `src/parser/theta-document.ts:3312–3330` (the `parseUnary` prefix arm) and
  `:3433–3447` (the `parsePostfix` suffix-loop arm), with
  `incrementDecrementOp()` (`:3297–3308`) as their shared guard. Nothing here
  moves the statement, expression, loop-body or `fn`-body observable.
- **`tests/increment-decrement-wiring.test.ts` stays green and byte-unchanged.**
  25 cells, `25 passed (25)` at this HEAD. It pins *exactly one* diagnostic for
  each of r1–r10, the two whitespace spellings and the three lexical contexts as
  total silence, and the adjacency emissions `c-- c` / `c --c`. A route that
  emits from a new site must not add a second diagnostic to any of those inputs.
  Any pattern-position cell is **additive** — a new file, or a block appended to
  an existing one; that file is not rewritten.
- **The lexer surface does not move.** `twoCharOperators`
  (`src/lexer/lexer.ts:175–177`) keeps `++`/`--`; `trailingTriggers`
  (`:185–191`) and `leadingTriggers` (`:197–203`) stay byte-unchanged — that is
  bug [0062](./0062-grammar-trailing-trigger-table-omits-equals.md)'s surface
  and 0084's load-bearing ordering against `collapseContinuations` (`:742`). A
  fix here is a parser fix; recognition already happened.
- **DIAG-2 lands spec edits in the same commit.** Any *Trigger* change to row
  `:33`, any new row, and any *Hint* edit is a spec change under
  `diagnostic-shape.md:72`, with the GOV-15 disposition at
  `source-language-stability.md:25`. Mirrors: `docs/reference/diagnostics.md`
  carries no *Trigger* column by its own statement (`:8–9`), so a Trigger edit
  does not reach it; `docs/reference/grammar.md:354` carries the
  `++`/`--` → code mapping and `:291–300` the pattern-grammar table, and both do.
  A new code also lands a `docs/reference/diagnostics.md` row (`:79` is the
  existing one's).
- **`theta/parse/match-arm-type-mismatch`'s *Message* is DIAG-4-frozen** (`:74`)
  and correct for its real trigger. Route (b) changes when it fires, never what
  it says.
- **Assess any newly-reachable code against the H9a gates.** If a route makes a
  code reachable from a committed fixture or an acceptance theta, it is scored
  against `tests/fixtures/h7a/permitted-codes.json` (11 entries, no
  `theta/parse/*`) and the empty-capture stderr gate
  (`tests/live/acceptance/harness.ts:479` `ACCEPTANCE_STDERR_ALLOWLIST`, ships
  empty; `:489` `acceptanceStderrOffenders`). Decide it by a real acceptance
  run, as 0079 and 0084 did, not by inspection — and populate neither file
  reactively from a first red.
- **GOV-15.** Three measured inputs load cleanly today (`-- => 1`, `[--y]`,
  `{ a: --y }`) and would gain an `E` under routes (a) or (b), which is the
  diagnostic-registry carve-out applied as an addition
  (`source-language-stability.md:25`) — the disposition bug
  [0031](./0031-ctor-field-value-typing-unchecked.md) (**fixed, 0.43.0**)
  recorded and
  0084 reused. Re-verified at this HEAD: across all 34 committed
  `.theta`/`.thetalib` files the only post-frontmatter `--` or `++` is inside a
  `//` comment (`tests/live/acceptance/fixtures/acc-multi-source.theta:4`, the
  `--theta` CLI flag in prose), and no committed input holds a `match` pattern
  containing either operator — so the in-corpus blast radius is empty today. The
  sweep is re-derived at the fix's HEAD, not copied from here.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseDoc` call through `tests/helpers/e2e-s1.ts`, so the harness exists and
no new mechanism is needed. Required: the `--y` pair with its exact codes and
ranges; the arm-count observable (`arms.length` against the source's arm count,
which is what reds if a route emits the right code but leaves the phantom arm);
`y--`, `++y` and the single-`-` row; the three silent spellings, each asserting
the *pattern shape* and not only the diagnostic list, since silence is their
current observable; the constructor row; the scrutinee, arm-body and
statement-position rows as byte-unchanged controls proving the fix is positional;
the two legal-pattern controls; and the bare-statement control, whose output a
route (b) fix changes. Messages sourced from the registry's *Message* column per
DIAG-4, as `tests/increment-decrement-wiring.test.ts` already does through
`parseRegistry`/`registryMessage`.

## Provenance

- Origin: the bug 0084 fix (0.71.0, commit `9fe13534`), which measured this
  input and filed it twice without fixing it — its fix record residual (iii)
  (`docs/bugs/0084-increment-decrement-check-dead.md:235–239`, dispositioned
  "surfaced for filing by the operator; none is created or worsened here" at
  `:243–244`) and bug 0072's coordination note
  (`docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md:645–652`), which
  assigns it to 0072's shape rather than 0084's. This report is that filing and
  adds what neither note states: the full diagnostic set with ranges and the
  built AST for five pattern sub-positions, the four-step derivation of the
  cascade, the three silent spellings and what they change about matching, the
  order-stability mechanism, the bare-statement control that makes the pair
  non-diagnostic, the measured pre-0084 token-stream proxy showing the
  observable moved at 0084 even though the recovery did not, the *Trigger*
  adjudication with both readings argued, and the three §Fix routes with their
  constraints.
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:33` (the row under
  adjudication), `:29` and `:31` (the position-scoping convention, and the row
  that already reaches `match` pattern position), `:55` and `:75` (the two
  codes that fire instead); `docs/spec_topics/bindings.md:36` (the
  increment/decrement rule); `docs/spec_topics/expressions.md:25`, `:27`, `:37`
  (the unsupported-forms list and its default disposition), `:163–172` (the
  closed pattern grammar; `:172` array exactness), `:174`, `:176` (the two
  out-of-grammar pattern forms that have codes), `:178` (unchecked
  exhaustiveness), `:180` (**Arm syntax** — the common-type and
  arm-body-is-an-expression rules); `docs/spec_topics/grammar.md:82`,
  `:145–166` (the `MatchArm` production and the arm-body rule);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:24`, `:65` (the only two
  lines bearing on diagnostic multiplicity), `:71` (DIAG-1), `:72` (DIAG-2),
  `:74` (DIAG-4), `:80` (the column legend, "*Trigger* is the canonical
  condition"); `docs/spec_topics/governance/source-language-stability.md:5`,
  `:9`, `:25`. User-facing mirrors: `docs/reference/diagnostics.md:8–9`, `:79`;
  `docs/reference/grammar.md:279–300`, `:354`.
- Implementation evidence at `36540b09`:
  `src/parser/theta-document.ts:3817–3962` (**`parsePattern`**; the recovery at
  `:3959–3961`, the `mut` emission at `:3821–3831`, the array-element loop at
  `:3845–3850`, the constructor arm at `:3871–3878`, the two object-field loops
  at `:3883–3910` and `:3926–3953`), `:3761–3782`
  (`tryConsumeRestPattern`), `:3621–3679` (`parseMatch`; `:3637`, `:3653–3656`,
  `:3659–3663`, `:3667–3670`), `:3699–3752`
  (`tryConsumeArmBodyStatement`; `assignHead` at `:3711–3716`, the push at
  `:3720–3728`, `tryParseReassign` at `:3750`), `:3297–3308`
  (`incrementDecrementOp`), `:3312–3330` and `:3433–3447` (bug 0084's two
  hooks), `:58` (the `checkIncrementDecrement` import);
  `src/parser/bindings.ts:179–192` (`checkIncrementDecrement`);
  `src/parser/type-layer-checks.ts:1111–1119` (the `match` arm of the type
  walk); `src/parser/match-result.ts:165–193` (`checkMatchArmTypes`),
  `:196–205` (`mismatchDiagnostic`), `:214–238` (`leastUpperBound`);
  `src/diagnostics/diagnostic.ts:107–123` (`assembleDiagnostics`, the
  `(file, line, col)` sort); `src/lexer/lexer.ts:175–177`
  (`twoCharOperators`), `:185–191` (`trailingTriggers`), `:197–203`
  (`leadingTriggers`), `:742` (`collapseContinuations`). Bug 0084's `src/` diff
  read at `git show 9fe13534 -- src/` (`+63/−2`, additive, both parser arms
  guarded by `incrementDecrementOp()`) to establish that the whitespace
  spelling is a faithful pre-0084 token-stream proxy.
- Test evidence at `36540b09`: `tests/increment-decrement-wiring.test.ts`
  (bug 0084's 25-cell witness; positions enumerated at `:43–57`; `25 passed
  (25)` re-run at this HEAD; no pattern-position cell);
  `tests/helpers/e2e-s1.ts` (`parseDoc`, the reused harness);
  `tests/fixtures/h7a/permitted-codes.json` (11 entries, no `theta/parse/*`);
  `tests/live/acceptance/harness.ts:479`, `:489` (the empty-capture stderr
  gate). No test anywhere drives punctuation in `match` pattern position.
- Reproduction: one scratch vitest file at `36540b09`, twenty-two distinct
  fixtures over `parseDoc`, run in five passes: the `--y` measurement with
  ranges and its six repeat parses; four variants (both bodies integer, both
  string, single arm, `++y`); the single-`-` row; the arm-body, scrutinee and
  statement-position rows that draw the code; the postfix row; the four
  silent-or-loud sub-positions (`--` alone, `[--y]`, `{ a: --y }`, `Ok(--y)`);
  three controls (identifier pattern, wildcard patterns, a genuine bare
  statement); the negative-literal row; and the four proxy fixtures of the
  HEAD-versus-pre-0084 pairs. Plus one token dump of the `--y` body.
  Run on the outputs quoted above, then deleted. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Fix (0.151.0)

**Adjudication.** §Expected behaviour (1) resolves to **Reading A**: a
pattern-position `++` / `--` is inside row
`docs/spec_topics/diagnostics/code-registry-parse.md:34`'s *Trigger*. Reasons,
in the order they carry: the *Trigger* ("`++` or `--` operator used.") states no
position while the table states position wherever position is load-bearing
(`:30` `assignment-as-expression` scopes itself to "expression position", `:32`
`mut-on-immutable-context` enumerates "`match` pattern binding"); `:32` proves
`match` pattern position is inside the registry's reach and `parsePattern`
already emits it (the `mut` arm); the row's *Spec rule* target
(`bindings.md:36`) is equally unqualified. Reading B's strongest point — that
the row's *Hint* prescribes an assignment no pattern position admits — is an
argument about the *Hint*, not about whether the operator was used, and is
carried as residual (1) rather than acted on. Route **(a)** therefore ships and
this is **implementation conformance, not a DIAG-2 change**: no *Trigger*, no
*Hint*, no row addition, no `docs/` edit of any kind (bug 0084's posture, and
bug 0141 half 2's). Route (b) is declined: it is a component rather than a fix
by §Fix's own account, and the phantom-arm cascade dies here without touching
`type-layer-checks.ts` or `match-result.ts` because the recovery stops leaving a
leftover token. Route (c) is unavailable once Reading A holds.

- **What shipped:**
  - `src/parser/theta-document.ts` — one new arm at the tail of `parsePattern`,
    after every pre-existing arm (so `tryConsumeRestPattern`, the `mut` arm, the
    literal / array / constructor / object arms and bug 0141's two refusals all
    still run first) and immediately before the unrecognised-token fall-through.
    It guards on the existing `incrementDecrementOp()`, emits the registered
    `theta/parse/increment-decrement` through the existing
    `checkIncrementDecrement` **unchanged** (registry *Message* and *Hint*
    verbatim) at the operator token's range, consumes the operator, and then
    parses the **operand as the pattern** by recursing into `parsePattern` when
    the next token can begin a pattern (kind `number` / `string` / `ident` /
    `keyword`, or a `punct` `[` or `{`) — otherwise returning
    `{ kind: "wildcard" }`.
  - §Fix route (a) open question 1 is answered by that recursion: it keeps the
    arity the author wrote (`[--y]` stays a one-slot exact-length array pattern,
    `{ a: --y }` stays one field, `Ok(--y)` keeps its operand inside the
    parens), it preserves bug 0141's capitalised-head refusal on the operand
    (`--Y` draws both rows, column-ordered) where discarding the operand would
    have suppressed it, and it leaves no token for `parseMatch`'s `=>` test to
    misread — which is what manufactured the phantom arm and both cascade codes.
    The wildcard branch exists because a bare `--` has no operand: recursing
    there would consume the `=` of the arrow and rebuild the same cascade.
    Progress is guaranteed on every input because the operator token is always
    consumed before any recursion.
  - Nothing else. `src/lexer/lexer.ts`, `incrementDecrementOp`, bug 0084's two
    expression-walk hooks, `src/parser/type-layer-checks.ts`,
    `src/parser/match-result.ts` and every `docs/` file are byte-unchanged, and
    no line-citation sweep was performed anywhere (0134's class, forbidden this
    run — citations elsewhere that shift by the +37 insertion are an accepted,
    recorded consequence).
  - Observables this moves, all inside the diagnostic-registry carve-out
    (`source-language-stability.md:25`) as an **addition**: `--y` / `++y` in
    pattern position go from `match-arm-type-mismatch` +
    `statement-in-arm-body` over 3 arms to the single registered row over 2;
    the three formerly-silent spellings (`-- => 1`, `[--y]`, `{ a: --y }`) go
    from zero diagnostics to one, with honest arities; `Ok(--y)` goes from
    `unknown-identifier` on the operand to the registered row over `Ok(y)`;
    `--Y` and `[--Y]` gain the registered row beside bug 0141's
    `capitalised-pattern-head`. The GOV-15 corpus blast radius is empty,
    re-derived at this HEAD over `git ls-files -- '*.theta' '*.thetalib'` (34
    files; the only post-frontmatter `--` is the `--theta` CLI flag inside a
    `//` comment in `tests/live/acceptance/fixtures/acc-multi-source.theta:4`),
    and cell j1 parses all 34 and asserts zero emissions.
- **Gates:** witness `npx vitest run tests/match-pattern-increment-decrement.test.ts`
  → `Tests 28 passed (28)` (RED before the fix: `13 failed | 15 passed (28)`).
  Full default suite `npm test` → `Test Files 345 passed (345)`,
  `Tests 6642 passed (6642)`, no stochastic red observed. `npm run typecheck`
  (`tsc -p tsconfig.json --noEmit`) clean. `npm run lint`
  (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) clean. Live:
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/match-pattern-increment-decrement-live-cell.test.ts` →
  `1 passed`, and proven red-capable in the live direction (see Verification).
- **Review:** 1 round, deep. Round 1 — CLEAN, zero blocking findings, with
  three non-blocking residuals: two neighbouring-code control messages pinned
  as literals rather than registry-sourced (both verified byte-identical to
  their rows, and DIAG-4-frozen so they cannot drift silently green), the
  double-operator spelling `----y` still inflating the arm count, and one
  comment clause carrying a historical framing. The prose item was polished
  (comment characters only; executable lines byte-identical before and after,
  gates re-run green), so the confirmation round was skipped by gate-diff.
- **Verification:** SOLID. (1) The witness witnesses the defect: neutralising
  the whole new arm reds 13 of the 28 cells with the bug document's pinned
  signatures verbatim (`--y` drawing the cascade pair, `[--y]` drawing zero),
  and the restore is byte-exact (`git hash-object` identical before and after).
  (2) `npm test` 345/345 files, 6642/6642 tests. (3) Live: the new H8a cell run
  for real against a live model, green with the fix and RED with the arm
  neutralised (`Registered: ["cellb2arraydecrement","cellb2lowercase"]` — the
  `[--y]` theta registering is precisely the pre-fix observable), restored
  byte-exact and re-run green; no open `docs/bugs/` report matches that
  signature. (4) Typecheck and lint clean. Plus: the two protected witnesses
  (25 + 45) and the five sibling witnesses bug 0141 re-pinned (330 cells across
  seven files) all green and byte-unchanged.
- **Tests that lock it:**
  - `tests/match-pattern-increment-decrement.test.ts` (new, 28 cells) —
    §Witness's whole obligation. Every match-parsing cell asserts the **whole
    ordered** diagnostic list (severity, code, range, message, hint; the
    operative row's *Message* and *Hint* read from the registry per DIAG-4 as
    bug 0084's witness does) **and** `arms.length` against the authored arm
    count — the phantom-arm observable — **and** the built pattern shape.
    Groups: (r) four registry-oracle guards pinning the row's *Trigger*, Hint
    and Message byte-verbatim, so a `docs/` edit reds; (a) the primary `--y`
    row, including the single-arm spelling; (b) `++y`; (c) `y--` byte-unchanged;
    (d) the three formerly-silent spellings, each on its pattern shape;
    (e) `Ok(--y)` with no `unknown-identifier`; (f) the arm-body, scrutinee and
    statement-position controls proving the fix is positional; (g) the
    identifier and wildcard legal-pattern controls; (h) the two §Non-goal pins
    (the single `-` spelling and the genuine bare statement `1 => let z = 2`,
    both unchanged); (i) the bug 0141 interaction rows `--Y`, `[--Y]`, `Y--`;
    (j) the GOV-15 corpus sweep, failing loudly on an empty file list;
    (k) nested depth.
  - `tests/live/match-pattern-increment-decrement-live-cell.test.ts` (new, one
    H8a cell, title token `` — the parent renumbers at merge) — the
    registration denial end to end through the shipped composition root over a
    real `.pi/theta/` discovery walk, on the `registeredNames()` observable,
    `failLoudly` on an unmet precondition, child pins inherited from
    `tests/live/harness.ts`. Three fixtures: `[--y]` as the red-capable row
    (it registers pre-fix), the bare `--y` head as the report's primary input,
    and a lowercase `[y]` control asserted **present first** so the cell cannot
    pass vacuously.
  - No existing cell was flipped, weakened or rewritten. The witness is
    additive; `tests/increment-decrement-wiring.test.ts` and
    `tests/capitalised-bare-match-pattern-refusal.test.ts` are byte-unchanged.
- **Residuals:**
  - The registered row's *Hint* ("Use `count += 1` / `count -= 1`.") prescribes
    a reassignment statement, and no assignment is legal in pattern position
    (`expressions.md:163–172`), so in this position the row now names the
    operator correctly and then prescribes a repair the author cannot write.
    Shipped deliberately unchanged: §Fix records that DIAG-2's list ("a new
    code, removing a code, or changing a code's namespace, severity, or
    trigger") and the GOV-15 carve-out both disposition **no** *Hint* edit, so
    a position-aware hint is an unadjudicated registry-rule question, not an
    implementation detail. Evidence: cell r1 pins the Hint byte-verbatim from
    the registry; cell a1 asserts it reaches the author.
  - `----y` and `++--y` still inflate the arm count: the second operator is a
    `punct`, which is outside the adjudicated pattern-head set, so the
    recursion stops and the leftover reaches the expression walk. Measured:
    both operators draw the registered row and neither cascade code fires, but
    the input still builds 4 arms from 2. Prescribed by route (a) as
    adjudicated; no cell pins it.
  - `theta/parse/statement-in-arm-body`'s missing `hint` field
    (`theta-document.ts`, the push inside `tryConsumeArmBodyStatement`), the
    `nullExpr` substitution's own cascade on a genuine bare arm-body statement,
    the single `-` spelling, `-1` negative-literal patterns and the general
    leniency of `parsePattern`'s fall-through are all §Non-goals, all still
    open, and all pinned unchanged by cells (h) and (f).
  - Line-number citations elsewhere in the repository that point past
    `src/parser/theta-document.ts:4241` are shifted by the +37 insertion and
    were deliberately **not** swept (citation sweeps are forbidden this run).
- **Discharge notes appended:** none. Bug 0084's residual (iii) named this
  filing and is not reopened; bug 0082 and bug 0050 keep their subjects.
- **Pinned dispositions / non-goals:** bug 0084's four measured positions, its
  adjacency rule, its two hooks and its scanner choice are untouched; bug
  0141's tail-arm refusals, their ordering (reserved before case) and its
  identifier-node posture are preserved and now compose with this arm; route
  (b) and route (c) are declined on the record above; the *Hint* question and
  the `----y` arity are surfaced, not fixed.
