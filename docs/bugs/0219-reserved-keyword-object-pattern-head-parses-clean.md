# Bug 0219 — A reserved keyword used as an OBJECT-pattern head in a `match` arm draws nothing: `Result { a: 1 }`, `Ok { a: 1 }`, `Err { a: 1 }`, `string { a: 1 }` and `let { a: 1 }` all parse clean, register, and match — where the same spellings written BARE (`Result =>`) each draw `theta/parse/reserved-keyword-as-identifier` at the very same position, so a following `{` decides whether a reserved word in pattern-head position is refused; and because the head spelling is dropped on the way to the runtime, `Err { }` selects its arm on an `Ok(1)` scrutinee and `R { a: 1 }` selects its arm on a `Q`-constructed value

- **Status:** fixed (0.156.0). Filed as bug
  [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md)'s named
  residual (§Fix (0.146.0) *Residuals*: "`Result { a: 1 }` in pattern position —
  a reserved keyword as an *object*-pattern head — is still silent. The
  `{`-gated arm sits above the tail and outside route 1's site; unclaimed by any
  report."). Re-measured at HEAD for this filing, not copied.
- **Sev/Diff estimate:** S1/D2 — S1 because input the spec refuses in terms is
  accepted with no diagnostic on any channel, the theta registers, and the
  author's arms do not select the value the theta produces: measured at HEAD,
  `match Ok(1) { Err { } => "err-arm", _ => "other" }` answers `"err-arm"` on a
  SUCCESS `Result` (§Reproduction (b) v7), and with `schema Q { a: integer }` and
  `schema R { b: integer }` both declared, `match Q { a: 1 } { R { a: 1 } =>
  "r-arm", _ => "other" }` answers `"r-arm"` (v6) — the reserved-word half is
  `lexical.md:20`'s sentence unenforced at a position whose bare sibling
  enforces it, and the wrong-arm half is `expressions.md:171`'s "object whose
  listed fields match" reading a head the runtime never receives. D2 because the
  reserved-word half needs no registry edit —
  `theta/parse/reserved-keyword-as-identifier`'s *Trigger*
  (`code-registry-parse.md:21`) carries no position qualifier — the change is one
  guard in one arm of `parsePattern` mirroring the ordering bug 0141 already
  landed twenty lines below it, and the corpus sweep is empty (§Reproduction
  (d): of the 34 committed `.theta` / `.thetalib` files, ZERO carry an
  object-pattern arm at all). Not D1 because the fix lands in `parsePattern`,
  the function bug [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md)'s
  routes also edit, and because §Fix must state where the head-resolution
  question (element 3) stops — that half is deliberately NOT settled here.
- **Kind:** defect — implementation, against two written sentences, in three
  elements, each measured at HEAD `e0873e53` (v0.150.0).
  1. **A reserved keyword heads an object pattern with no diagnostic.**
     `lexical.md:20` lists 32 reserved words — including `Result`, `Ok`, `Err`,
     `string` and `let` — and states "Using one of these in identifier position
     is `theta/parse/reserved-keyword-as-identifier`". The registered row's
     *Trigger* (`code-registry-parse.md:21`) is "Reserved keyword used in an
     identifier position." with no position qualifier. Measured:
     `Result { a: 1 }`, `Ok { a: 1 }`, `Err { a: 1 }`, `string { a: 1 }` and
     `let { a: 1 }` in pattern-head position each draw `[]`, while the same five
     spellings written bare in the same position each draw exactly that code
     (§Reproduction (a) rows a1–a6 versus b1/b2/b4). The discriminator is the
     following `{`.
  2. **The head spelling is dropped between the parse shape and the runtime, so
     an object pattern is a field-shape test only.** `PatternNode`'s doc comment
     (`src/parser/theta-document.ts:276`) says an object pattern's `typeName`
     "is retained for diagnostics but ignored by runtime dispatch" — measured, no
     diagnostic reads it anywhere, and `toRuntimePattern`
     (`src/runtime/statement-executor.ts:1143–:1147`) constructs the runtime
     object pattern from `fields` alone, because the runtime `Pattern` union
     declares no `typeName` at all (`src/runtime/match-result.ts:113–:116`).
     Consequence, measured: `R { a: 1 }` matches a value constructed as
     `Q { a: 1 }` (v6), and `Err { }` — zero listed fields, so the field loop is
     vacuous — matches any object-shaped `ThetaValue`, `Ok(1)` included (v7).
  3. **The head resolves against nothing, where the value position resolves.**
     `theta/parse/unresolved-named-type` (`code-registry-parse.md:99`) names a
     CLOSED five-position list, the fifth being "an object-constructor name
     (`Name { ... }`)"; a pattern head is not on it. Measured, the value
     position `let r = Zed { a: 1 }` draws
     `error theta/parse/unresolved-named-type: unresolved named type 'Zed'` and
     the pattern position `match 3 { Zed { a: 1 } => … }` draws `[]`
     (§Reproduction (a) c3 versus a8) — against `lexical.md:18`'s "an uppercase
     identifier refers to an existing schema, enum, or constructor in scope".
     This element is measured and RECORDED here, not settled: §Fix scopes the
     verdict to element 1 and holds element 3 open, because widening that closed
     list is a DIAG-2 *Trigger* edit on a row five positions already pin.
- **Affected** (every citation verified against the tree at HEAD `e0873e53`,
  v0.150.0 — `package.json:3`; symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication, since bug 0141's fix shifted this file by +20/+47 below its two
  insertion points and recorded no citation sweep):
  - **The defect site** — `src/parser/theta-document.ts:4259–4293`, the
    `{`-gated object arm inside `parsePattern`'s `ident` / `keyword` branch
    (branch test `:4247`, function declared `:4196`). The arm is entered on
    `this.isPunct("{")` alone, walks the field list, and returns
    `{ kind: "object", typeName: t.text, fields }` at `:4293`. It runs no
    first-letter test, no reserved-word test, and consults no declaration table —
    `parsePattern` takes no arguments and reads no parser state beyond the token
    cursor.
  - **The two refusals it sits ABOVE** — `:4303`
    (`reservedKeywordAsIdentifierDiagnostic`, bug 0141 §Fix route 1 half 2) and
    `:4310` (`capitalisedPatternHeadDiagnostic`, half 1), both in the tail arm
    that is only reached when neither lookahead-gated arm fired. The constructor
    arm above (`:4249–:4256`) is spelling-restricted to `Ok` / `Err` followed by
    `(`; the object arm is restricted to nothing but the `{`. So bug 0141's
    ordering — reserved before case, exactly one code — is intact for the bare
    head and unreached for the braced one.
  - **The dropped head** — `src/parser/theta-document.ts:276` (the
    retained-for-diagnostics doc comment), `src/runtime/statement-executor.ts:1143–:1147`
    (`toRuntimePattern`'s object arm, which omits `typeName`),
    `src/runtime/match-result.ts:113–:116` (the runtime `Pattern` object variant:
    `kind` and `fields` only) and `:202–:222` (`matchPattern`'s object arm — the
    value must be a non-array, non-null `object`, then every LISTED field must be
    present and match; unlisted fields are ignored, so an empty field list is a
    catch-all over every object-shaped value).
  - **The arm-scope binder that treats the fields as bindings** —
    `collectPatternBindings` (`src/parser/theta-document.ts:5042`, the object arm
    at `:5050–:5053`), seeded per arm at `:5378` and read again at `:6209`. The
    field-shorthand sugar (`:4279–:4283`) makes `{ attempts }` a same-named
    identifier pattern, per `expressions.md:171`.
  - **The spec the silence contradicts** — `docs/spec_topics/lexical.md:20` (the
    32-word reserved list and the named code), `:18` (the pattern
    disambiguation: an uppercase identifier REFERS to an existing schema, enum or
    constructor in scope), `:13` (the first-letter case rule is what makes
    pattern disambiguation work without additional grammar);
    `docs/spec_topics/expressions.md:171` (the Object/schema pattern row:
    "object whose listed fields match the inner patterns; unlisted fields are
    ignored"), `:174` (the disambiguation sentence and the `Ok` / `Err`
    reservation); `docs/spec_topics/grammar.md:148` (`MatchArm ::= Pattern
    "=>" ArmBody`).
  - **The registered rows** — `code-registry-parse.md:21`
    (`theta/parse/reserved-keyword-as-identifier`, *Trigger* with no position
    qualifier), `:22` (`theta/parse/capitalised-pattern-head`, bug 0141's
    addition, whose *Trigger* says in terms "it is not followed by `{`" — so the
    braced head is EXCLUDED by the landed row's own text, not overlooked by it),
    `:99` (`theta/parse/unresolved-named-type`'s closed five-position list).
  - **The registration gate** — `hasLoadParseError` in
    `src/extension/production-composition.ts` (any error-severity `theta/load/`
    or `theta/parse/` code). With `[]` diagnostics the fixtures pass it, which is
    why every §Reproduction (b) row reaches a value.
  - **The corpus** — no committed fixture reaches this class: of the 34 files
    `git ls-files -- '*.theta' '*.thetalib'` lists, `git grep -nE "\{[^}]*\} *=>"`
    matches ZERO, and the reserved-head spelling matches zero. Reachable from
    clean source, unreached by the corpus, so nothing reds today.
- **Observed at:** v0.150.0 (`e0873e53`, `package.json:3`), the fix commit for
  bug [0211](./0211-separator-degenerate-specifier-lists-parse-clean.md).
  Offline, deterministic, provider-free, zero model turns: two scratch vitest
  probes under `.pi/tmp/` (written, run, deleted) driving the REAL
  `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s `parseDoc`, and the
  REAL `executeBody` through the shipped production producer deps
  (`createProductionProducerDeps` + `bindPromptConversation`, the
  `tests/capitalised-bare-match-pattern-refusal.test.ts:280–326` harness shape).
  Every value below is that run's output verbatim.

## Summary

Bug 0141 closed the BARE capitalised and reserved `match` pattern head in
`parsePattern`'s tail arm. The tail arm is reached only when neither
lookahead-gated arm above it fired, and the object arm's gate is the bare
presence of a `{` (`theta-document.ts:4259`) — no spelling restriction, unlike
the `Ok(` / `Err(` constructor arm beside it. So one character of following
context decides whether `lexical.md:20`'s reserved-word sentence is enforced at
pattern-head position: `Result =>` is refused, `Result { a: 1 } =>` is not.

The braced head is not merely unrefused, it is discarded: the parse node keeps
`typeName` for diagnostics that do not exist, and `toRuntimePattern` drops it
before dispatch. An object pattern is therefore a pure field-shape test whose
head is decoration — which makes `Err { }` a catch-all that fires on `Ok(1)`,
and makes any declared schema name interchangeable with any other in pattern
position.

## Reproduction

Zero model turns, no provider contacted. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines of frontmatter). `RESERVED` is
`error theta/parse/reserved-keyword-as-identifier`, `CAPHEAD` is
`error theta/parse/capitalised-pattern-head`, `UNRESOLVED` is
`error theta/parse/unresolved-named-type`, `NOINIT` is
`error theta/parse/let-without-initialiser`, `BAREOBJ` is
`error theta/parse/bare-object-literal`.

### (a) Every diagnostic, in emission order

Rows a1–a9, d1, d2, e1 are `let r = match 3 { <pattern> => "x", _ => "y" }`;
rows b1–b4 are the same with a bare head; rows c1–c3 are the VALUE position
`let r = <head> { a: 1 }`.

| row | source under test | diagnostics |
| --- | --- | --- |
| a1 **IN-CLASS** | `Result { a: 1 } =>` | `[]` |
| a2 **IN-CLASS** | `Result { } =>` | `[]` |
| a3 **IN-CLASS** | `Ok { a: 1 } =>` | `[]` |
| a4 **IN-CLASS** | `Err { a: 1 } =>` | `[]` |
| a5 **IN-CLASS** | `string { a: 1 } =>` | `[]` |
| a6 **IN-CLASS** | `let { a: 1 } =>` | `[]` |
| a7 boundary | `p { a: 1 } =>` (lowercase head) | `[]` |
| a8 boundary | `Zed { a: 1 } =>`, `Zed` undeclared | `[]` |
| a9 CONTROL | `Zed { a: 1 } =>` with `schema Zed { a: integer }` | `[]` |
| b1 CONTROL, bare | `Result =>` | RESERVED |
| b2 CONTROL, bare | `Ok =>` | RESERVED |
| b3 CONTROL, bare | `Zed =>` | CAPHEAD |
| b4 CONTROL, bare | `string =>` | RESERVED |
| c1 CONTROL, value pos | `let r = Result { a: 1 }` | NOINIT, BAREOBJ |
| c2 CONTROL, value pos | `let r = string { a: 1 }` | NOINIT, BAREOBJ |
| c3 CONTROL, value pos | `let r = Zed { a: 1 }` | UNRESOLVED |
| d1 **IN-CLASS**, nested | `[Result { a: 1 }] =>` (array element) | `[]` |
| d2 **IN-CLASS**, nested | `Q { f: Result { a: 1 } } =>` (field value) | `[]` |
| e1 boundary | `{ a: 1 } =>` (bare object pattern) | `[]` |

Rendered verbatim, the CONTROL rows that refuse:

```
error theta/parse/reserved-keyword-as-identifier: reserved keyword 'Result' cannot be used as an identifier
error theta/parse/reserved-keyword-as-identifier: reserved keyword 'Ok' cannot be used as an identifier
error theta/parse/reserved-keyword-as-identifier: reserved keyword 'string' cannot be used as an identifier
error theta/parse/capitalised-pattern-head: capitalised pattern head 'Zed' names no pattern production
error theta/parse/unresolved-named-type: unresolved named type 'Zed'
```

The class boundary is exactly the following `{`: a1–a6 and b1/b2/b4 are the same
five reserved spellings at the same position, and only the braced half is
silent. Rows c1/c2 show the value position refusing the reserved head too, by a
different route (a reserved word is no `NamedObjectLit` head — `Result` lexes as
`keyword`, so it never reaches `parsePrimary`'s ident arm at `:3903` or its
`NamedObjectLit` gate at `:3917`, and the `{` then
reads as a bare object literal, which the language refuses); c3 shows the value
position resolving the head that the pattern position does not.

### (b) The value each in-class row produces

`schema Q { a: integer }` and `let d = Q { a: 1 }` head every row except v7; the
last statement is the `match` expression, so the body's value IS the selected
arm. Diagnostics `[]` on every row, `outcome=success` on every row.

| row | pattern arm | value |
| --- | --- | --- |
| v1 | `Result { a: 1 } => "result-arm"` | `"result-arm"` |
| v2 | `Ok { a: 1 } => "ok-arm"` | `"ok-arm"` |
| v3 | `Zed { a: 1 } => "zed-arm"`, `Zed` undeclared | `"zed-arm"` |
| v4 | `string { a: 1 } => "string-arm"` | `"string-arm"` |
| v5 | `Result { } => "empty-arm"` | `"empty-arm"` |
| v6 | `R { a: 1 } => "r-arm"`, with `schema R { b: integer }` declared | `"r-arm"` |
| v7 | `match Ok(1) { Err { } => "err-arm", _ => "other" }` | `"err-arm"` |
| v8 boundary | `q { a: 1 } => "lower-arm"` (lowercase head) | `"lower-arm"` |
| v9 CONTROL | `Q { a: 1 } => "q-arm"` (the legal spelling) | `"q-arm"` |
| v10 CONTROL, bare | `Result => "result-bare"` | `"result-bare"`, RESERVED |

v6, v7 and v10 are the three that matter. v6 and v7 are wrong values with no
diagnostic: a schema name the value was not constructed with selects the arm,
and an `Err`-headed empty pattern selects on a success. v10 produces its value
too — bug 0141's refusal is a diagnostic, not a node change — but the theta
carries an error-severity `theta/parse/` code and so fails `hasLoadParseError`,
which is the refusal. Rows a1–a9 carry no such code and register.

### (c) Why the runtime cannot see the head

`toRuntimePattern`'s object arm
(`src/runtime/statement-executor.ts:1143–:1147`) maps `fields` and nothing else,
because the runtime `Pattern` object variant declares `kind` and `fields` only
(`src/runtime/match-result.ts:113–:116`). `matchPattern`'s object arm (`:202`)
then tests object-ness and the listed fields. An empty field list therefore
matches every object-shaped `ThetaValue` — including a branded `Result`, which
is why v7's `Err { }` fires on `Ok(1)` and not by a Result-variant confusion:
the constructor arm's brand test (`isResultValue`, the bug 0017 rule) is never
consulted, because the pattern is not a constructor pattern.

### (d) The corpus sweep

`git ls-files -- '*.theta' '*.thetalib'` lists 34 files at HEAD. Four contain a
`match` (`docs/examples/configure-tool-loop.theta:8`,
`docs/examples/fan-out-reviews.theta:29`,
`docs/examples/handle-error.theta:12`,
`tests/live/acceptance/fixtures/acc-match-queryerror.theta:7`). `git grep -nE
"\{[^}]*\} *=>"` over the same list matches nothing: no committed fixture uses
an object pattern at all, reserved-headed or otherwise. A fix that makes this
class refuse reds no committed source. Per bug
[0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) the committed
gate filters `.theta` only, so the `.thetalib` half of this sweep is a scratch
probe, not a gate.

## Expected behaviour

1. `Result { a: 1 }`, `Ok { a: 1 }`, `Err { a: 1 }`, `string { a: 1 }`,
   `let { a: 1 }` — and every other spelling on `lexical.md:20`'s 32-word list —
   in `match` pattern-head position draw
   `theta/parse/reserved-keyword-as-identifier`, exactly once, at the head's
   range, as their bare siblings already do (§Reproduction (a) b1/b2/b4). The
   theta does not register.
2. The refusal fires at every depth the pattern grammar recurses: an array
   element and an object-pattern field value included (§Reproduction (a)
   d1/d2), since `parsePattern` is the same function at every depth.
3. Nothing changes for the legal spellings: `Q { a: 1 }` with `Q` declared
   (v9), the field shorthand `{ attempts }`, the bare object pattern
   `{ a: 1 }` (a1/e1's boundary), the lowercase head (a7/v8 — outside this
   report, see §Non-goals), and both landed bug 0141 refusals with their exact
   codes and counts (b1–b4).

## Actual behaviour / root cause

The `{`-gated arm (`theta-document.ts:4259`) is entered on the follower alone.
It is ABOVE the tail arm bug 0141 fixed, so neither the reserved-word guard
(`:4303`) nor the case guard (`:4310`) is reached, and the arm itself carries no
guard of its own. Bug 0141's route was deliberately confined to the tail — its
new row's *Trigger* says "it is not followed by `{`" — so this is an
acknowledged gap in a landed row's reach, not a regression: the braced spelling
was silent before 0141 and is silent after it.

The reserved half is enforced nowhere else either. `contextualDiagnostics`
(`src/lexer/lexer.ts`, the `:822` reserved emission) is scoped by its own doc
comment to declarator-name and control-header positions and records the
parser-leaf obligation; no parser leaf runs it at a pattern position. The type
layer never reads a pattern's `typeName`, and the runtime never receives it
(§Reproduction (c)).

## Why it matters

A theta that loads clean, registers, and answers with an arm the author's
pattern did not select is the S1 band verbatim. Two shapes reach it from clean
source: an author who writes `Err { }` (or `Err { kind: "x" }`) intending a
Result-variant test gets a catch-all that also fires on success, and an author
who mistypes or copies a schema name gets the wrong arm on a structurally
compatible value, because the head is decoration. Both are silent on every
channel — no diagnostic, no note, no gate — and both currently look identical
to the legal spelling in review.

## Fix

**Settled for element 1.** The verdict and the mechanism are decided: a
reserved keyword in `match` pattern-head position draws
`theta/parse/reserved-keyword-as-identifier` whether or not a `{` follows, and
the guard lands in `parsePattern`'s `{`-gated object arm. Elements 2 and 3 are
recorded, measured, and held open (§Non-goals) — no route below changes a
runtime dispatch or resolves a head against a declaration table.

### (a) The route

Add a reserved-word guard to the object arm
(`src/parser/theta-document.ts:4259–4293`), before the field walk, emitting
`reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file)` when
`t.kind === "keyword"` — the same builder, the same argument list and the same
`t.range` as the landed tail-arm emission at `:4303`. No registry addition: the
row's *Trigger* (`code-registry-parse.md:21`) carries no position qualifier, so
wiring it at a second position is implementation conformance, which is bug
0084's posture and half 2 of bug 0141's own route. The returned node is
unchanged — still `{ kind: "object", typeName: t.text, fields }`, with the
fields walked as today — for exactly bug 0141 §Fix route 1's reason: the refusal
is carried by the error-severity diagnostic that `hasLoadParseError` turns into
a registration denial, and dropping the node would strand the field binders that
`collectPatternBindings` (`:5042`) puts in the arm-body scope, drawing a second,
spurious `theta/parse/unknown-identifier` per field read.

Two sub-decisions the route states rather than discovers:

1. **The `Ok` / `Err` spellings draw the reserved code, not a
   constructor-shape diagnostic.** `Ok { a: 1 }` is not a malformed `Ok(p)`; it
   is a reserved word in a head position, which is the one sentence
   (`lexical.md:20`) that covers all five measured spellings uniformly. Minting
   a second code for the two Result spellings would split one construct across
   two rows.
2. **`theta/parse/capitalised-pattern-head` is NOT extended to the braced
   head.** Its *Trigger* excludes the braced case in terms, and `Ident { … }` IS
   an admitted production (`expressions.md:171`) — a capitalised head there names
   a real pattern form, so the row's own message ("names no pattern production")
   would be false. Widening it is a DIAG-2 *Trigger* edit on a row landed one
   version ago with 45 committed cells, for a verdict element 1 does not need.

### (b) Constraints every route carries

1. **Bug 0141's landed refusals keep their codes, counts and ranges.** Rows
   b1–b4 above are measured at HEAD and are locks: reserved-before-case
   ordering, exactly one code per bare head, and `capitalisedPatternHeadDiagnostic`
   unreached by any braced input. `tests/capitalised-bare-match-pattern-refusal.test.ts`'s
   45 cells stay green as written, including g1/g2 (the gated followers) and
   h1/h2 (the nested positions) — h2 in particular asserts an object-pattern
   FIELD VALUE, which §Reproduction (a) d2 shows is in this report's class at the
   head and must not have its field-value assertion moved.
2. **One diagnostic per construct.** A reserved braced head draws exactly one
   code, at the head's range, and never also a capitalised-head code — the same
   property bug 0141 established for the bare spelling, now at the second
   position.
3. **No lowered byte, no runtime dispatch, no AST shape moves.** The object
   pattern still carries `typeName`, `toRuntimePattern` still drops it, and
   `matchPattern`'s object arm is byte-identical. Element 2 is stated in this
   report so that it is not fixed by accident here.
4. **The legal and boundary spellings stay silent** — `Q { a: 1 }` with `Q`
   declared, `{ attempts }` shorthand, the bare object pattern `{ a: 1 }`, and
   the lowercase head `p { a: 1 }` (§Non-goals). A route that reds a9, e1, v8 or
   v9 is refusing more than element 1.
5. **GOV-15 discharge is a real sweep, not an assumption.** The change makes
   currently-clean programs refuse, so it carries §Reproduction (d)'s sweep over
   `git ls-files -- '*.theta' '*.thetalib'` (34 files, zero object-pattern arms),
   run rather than assumed, on the 0031 / 0084 / 0102 precedent bug 0141 §Fix (d)
   used for the same carve-out.
6. **Bug 0123's subject is untouched.** `parsePattern`'s one-token recovery tail
   (`:4358–:4360`) is byte-identical and its `--y` input keeps its exact
   two-code cascade; whichever of the two fixes lands second re-measures the
   other's rows in the same function.

## Non-goals

- **The dropped head at the runtime (element 2).** That
  `toRuntimePattern` discards `typeName` and `matchPattern` therefore matches
  `R { a: 1 }` against a `Q`-constructed value is measured here (§Reproduction
  (b) v6, (c)) and NOT fixed here: making an object pattern nominal is a
  language decision with an exhaustiveness and a schema-identity question behind
  it, and `expressions.md:171` describes the field-shape reading it currently
  implements. This report asks only that a reserved word be refused.
- **The unresolved head (element 3).** `Zed { a: 1 }` with `Zed` undeclared
  stays silent under §Fix. Refusing it means adding a sixth position to
  `theta/parse/unresolved-named-type`'s closed five-position list
  (`code-registry-parse.md:99`) — a DIAG-2 edit — and deciding what an imported
  or `enum`-declared head means at a pattern position. Measured and left for its
  own report.
- **The lowercase object-pattern head.** `p { a: 1 }` draws nothing (a7, v8).
  `lexical.md:18` assigns the binding reading to a lowercase identifier and
  `expressions.md:171`'s example head is capitalised, but no sentence names a
  lowercase head at this position, and bug 0141 declined the parallel question
  for the `for` variable. Unclaimed by this report.
- **Bug 0141's node-shape decision.** The identifier-pattern node stays as
  landed; nothing here revisits whether a refused pattern should become a
  wildcard.
- **Exhaustiveness, unreachable arms, and guards.** Out of scope, per
  `expressions.md:178` and `:176`.
- **Rest patterns inside an object pattern.** `{ kind, ...other }` is
  `theta/parse/rest-pattern-not-supported`'s business (`expressions.md:176`) and
  the arm's `tryConsumeRestPattern` call is untouched.

## Related

- [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md) — **fixed
  (0.146.0)**, the origin and the nearest neighbour. Its §Fix (0.146.0)
  *Residuals* names this class in one sentence and files nothing; this report is
  that filing. **It did not cause the defect** — the braced head was silent
  before it — but it created the asymmetry: by closing the tail arm it made the
  following `{` the discriminator, and its new row's *Trigger* excludes the
  braced case in terms. Its 45-cell witness
  (`tests/capitalised-bare-match-pattern-refusal.test.ts`) and its nine
  re-pinned protected witnesses are locks (§Fix (b)(1)). Its recorded +20/+47
  citation shift in `src/parser/theta-document.ts` is why every line number here
  is re-verified at HEAD and named beside its symbol.
- [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) — **open**,
  the same function. Its defect is `parsePattern`'s one-token recovery tail
  (`--y` in pattern position never drawing
  `theta/parse/increment-decrement`); this report's input never reaches that
  tail, since a `{`-followed head is recognised at `:4259`. **Disjoint defects,
  shared function, shared DIAG-2 shape of argument** (a registered *Trigger*
  with no position qualifier not firing at a pattern position). Coordination:
  whichever fix lands second rebases its citations and re-measures the other's
  rows; neither changes the other's verdict. 0123's cited `C.Red` row already
  re-measured once under 0141's fix.
- [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
  **fixed (0.77.0)**. Owns the withheld-binder machinery
  (`recordWithheldBinders`) that every pattern binder passes through, including
  an object pattern's field binders. Not reached: §Fix (b)(3) keeps the node and
  the binder set exactly as they are, so its cells keep the collision premise
  they test — the same posture bug 0141's fix took, which is why its `u9b` cell
  stayed green there.
- [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
  and binding on §Reproduction (d): the committed parse gate filters `.theta`
  only, so the `.thetalib` half of the sweep is a scratch probe.
- [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **open**, the other
  unenforced position in the shared lexer function. Cited for the enforcement
  site only: `contextualDiagnostics` is scoped to declarator-name and
  control-header positions and no parser leaf runs it at a pattern position.
  §Fix touches no lexer code, so a route there and this one do not collide.
- [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
  adjudicated do-not-chase class for positional drift, under which every
  citation here is symbol-named beside its line number.

## Provenance

Bug 0141's `## Fix (0.146.0)` *Residuals* and its fix report
(`.pi/tmp/fixes/0141-report.md`, *Residuals / notes* item R2) both name the
class in one line: "`Result { a: 1 }` in pattern position — a reserved keyword
as an *object*-pattern head — is still silent. The `{`-gated arm sits above the
tail and outside route 1's site; unclaimed by any report."

**Re-measured at HEAD `e0873e53` for this filing, not copied.** The residual's
single value reproduces (a1), and the measurement adds four things the residual
does not state:

- **The class is the whole reserved list, not `Result`.** `Ok`, `Err`, `string`
  and `let` are silent at the same position on the same input shape (a3–a6),
  while all four refuse bare (b1/b2/b4).
- **The discriminator is measured to be the following `{` alone**, not the
  spelling and not the field list: the empty-braced `Result { }` is as silent as
  `Result { a: 1 }` (a2), and the constructor arm above is spelling-restricted
  while the object arm is not.
- **The consequence is a wrong VALUE, not only a lost diagnostic.**
  `Err { } => "err-arm"` selects on `Ok(1)` (v7) and `R { a: 1 }` selects on a
  `Q`-constructed value (v6), because `toRuntimePattern` drops `typeName`
  (element 2, §Reproduction (c)). The residual records the silence and not the
  dispatch.
- **The head resolves against nothing**, where the value position draws
  `theta/parse/unresolved-named-type` on the same undeclared name (a8 versus
  c3) — element 3, recorded and scoped out of §Fix.

Also measured and not in the residual: the class reaches every recursion depth
(array element d1, object-pattern field value d2), the lowercase head is silent
too (a7, v8, held outside this report), and the corpus carries zero
object-pattern arms of any kind (§Reproduction (d)).

## Fix (0.156.0)

**Elements 2 and 3 settled by measurement, not widened.** §Fix left them
"recorded and held open"; this run measured both at HEAD `cc13ae0e` (v0.153.0)
before and after the guard and settles them as **out**, with the evidence that
makes the choice honest rather than assumed:

- **Element 2** (`toRuntimePattern` drops `typeName`) is unchanged and now has a
  narrower residual than the filing states. The S1 headline row v7
  (`match Ok(1) { Err { } => "err-arm", _ => "other" }` answering `"err-arm"`)
  is closed *as a reachable defect* — its head is reserved, so the theta now
  fails `hasLoadParseError` and never registers. What survives is the
  non-reserved half: v6 (`R { a: 1 }` selecting on a `Q`-constructed value, both
  schemas declared) still answers `"r-arm"` with `[]` diagnostics, measured
  post-fix. Making an object pattern nominal remains the language decision
  §Non-goals describes; residual 1 records the narrowed form.
- **Element 3** (a pattern head resolving against nothing) is unchanged:
  `Zed { a: 1 }` with `Zed` undeclared still draws `[]` post-fix, pinned as a
  boundary cell so a future route cannot close it by accident. Refusing it is
  still a sixth position on `theta/parse/unresolved-named-type`'s closed list
  (`code-registry-parse.md:99`), a DIAG-2 *Trigger* edit this run declines.

- **What shipped:**
  - `src/parser/theta-document.ts` — `parsePattern`'s `{`-gated object / schema
    pattern arm gains a reserved-word guard immediately inside
    `if (this.isPunct("{"))`, before the `{` is consumed and before the field
    walk: a head token of `keyword` kind pushes
    `reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file)` — the
    same builder, argument list and `t.range` as the tail arm's landed emission.
    §Fix (a) verbatim. The arm's comment states why the guard belongs here:
    unlike the `Ok(` / `Err(` constructor arm above it, this arm's gate is the
    following `{` alone, so without the guard one character of lookahead decided
    whether `lexical.md:20`'s reserved-word sentence was enforced at
    pattern-head position.
  - **Nothing else changed.** No registry row (`code-registry-parse.md` and
    `docs/reference/diagnostics.md` untouched — the row's *Trigger* carries no
    position qualifier, so a second call site is implementation conformance, bug
    0084's posture). No new code minted. `theta/parse/capitalised-pattern-head`
    is not extended to the braced head (§Fix (a) sub-decision 2). The returned
    node is still `{ kind: "object", typeName: t.text, fields }`, so the field
    binders still reach `collectPatternBindings`'s arm-body scope. The runtime
    is byte-identical: `src/runtime/statement-executor.ts` and
    `src/runtime/match-result.ts` are not in the diff (§Fix (b)(3)).
  - `tests/reserved-keyword-object-pattern-head-refusal.test.ts` — new, 54
    offline cells.
  - `tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts` — new,
    one standalone H8a cell.
- **Gates:** witness
  `npx vitest run tests/reserved-keyword-object-pattern-head-refusal.test.ts` →
  `Tests 54 passed (54)`; RED before the fix →
  `Tests 33 failed | 21 passed (54)`, every failure of the form
  `actual diagnostics: []` where `theta/parse/reserved-keyword-as-identifier` is
  expected. Full default suite `npm test` → `Test Files 350 passed (350)`,
  `Tests 7024 passed (7024)` (baseline before this work: 349 files / 6970
  tests). `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean.
  `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) clean.
  Live: `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts` →
  `1 passed`, red-proven in the other direction (below). GOV-15 sweep re-run,
  not assumed: `git ls-files -- '*.theta' '*.thetalib'` → 34 files,
  `git grep -nE "\{[^}]*\} *=>"` over them → zero matches, and
  `tests/committed-fixture-parse-gate.test.ts` → `36 passed (36)`, which is what
  discharges the corpus-wide claim (bug 0132 keeps the `.thetalib` half a probe,
  not a gate).
- **What the witness locks:** §Fix (a) (the code, at the head token's range, in
  the braced arm); §Fix (b)(2) by whole-list `toEqual` in every cell, so
  "exactly one code, never also a capitalised-head code" is observable and a
  third or a missing diagnostic reds; §Expected behaviour 1 extended from the
  five measured spellings to the whole 32-word list, partitioned by an oracle
  read off `lexical.md:20` (28 spellings reach this arm; `mut` is claimed by
  `parsePattern`'s `mut` guard and `true` / `false` / `null` by the literal arms
  above, and must NOT gain the code — pinned); §Expected behaviour 2 at both
  recursion depths (array element, object-pattern field value) plus a
  two-reserved-heads-in-one-pattern cell, so a route that suppressed the inner
  emission once an outer fired cannot stay green; §Expected behaviour 3 /
  §Fix (b)(4) boundaries (lowercase head, undeclared head, declared head, bare
  object pattern, `{ attempts }` shorthand, and `{ a, ...o }` keeping only
  `theta/parse/rest-pattern-not-supported`); §Fix (b)(1) bug 0141's four bare
  controls; §Fix (b)(6) bug 0123's `--y` cascade as measured at this tree; a
  DIAG-4 oracle reading the real registry page through `parseRegistry` /
  `registryMessage`; and the runtime rows — v7 now denies registration through a
  clause-for-clause mirror of `hasLoadParseError`, v6 and v9 pinning element 2's
  narrowed residual and the legal spelling unchanged.
- **Review:** 2 rounds, plus one pre-review correction round. Correction round
  (citation/comment/prose only, not a review round, numbering unaffected): the
  fix's own +11-line insertion staled 10 `src/parser/theta-document.ts`
  citations in the two witness files authored this run, and the new src comment
  cited a line in its own file; the citations were corrected to the current tree
  and the src self-citation replaced by a symbol anchor. Reason recorded: the
  citing documents at risk were this run's own witnesses, so the shift was
  self-inflicted rather than bug 0134's do-not-chase class. Round 1 (deep) — two
  findings, neither behavioural, none `correctness` / `fidelity` / `spec`: a
  live-cell header mixing two citation frames (`prose`), and no cell exercising
  two reserved constructs in one pattern (`test`). Both remedied by a light
  fixer round: the header recast to one frame, and cell `d3`
  (`Result { f: Ok { } }`) added with measured ranges and its red direction
  proved. Round 2 (fast) — CLEAN, one prose residual (an informal "today" for
  the pre-fix frame in a comment), since polished comment-only; polish verified
  by gate-diff, confirmation round skipped.
- **Verification:** SOLID. (1) The witness witnesses the defect: neutralising
  only the guard's four lines reds 33 of the 54 cells, every red carrying the
  pinned `actual diagnostics: []` signature, and the neutralised FULL suite reds
  nothing outside this fix's own witness (`1 failed | 349 passed (350)`);
  restore by writing the original content back is byte-exact (`git hash-object`
  → `d363bd78…` before and after, with no `git checkout` / `restore` / `stash`
  at any point) and the witness re-runs green. (2) Full default suite green at
  350 files / 7024 tests; four files red once under full-parallel worker
  contention (`invoke-arg-type-mismatch-wired`,
  `production-tools-load-resolution`, `theta-callable-call-arity` — hook
  timeouts — and `inbound-union-arm-dispatch` — child exit 1) and all four green
  in isolation, which is `AGENTS.md`'s documented contention class and touches
  no parser code. (3) Live, both directions, for real: green with the fix, and
  with the guard neutralised the same cell fails with the pre-fix signature —
  the reserved-braced-head theta REGISTERS
  (`Registered: ["celladeclaredhead","cellareservedhead"]`) when it must not —
  then byte-exact restore and green again. `tests/live/acceptance/` deliberately
  not run: this fix adds a call site of an existing builder and changes no
  lowering, feeding or registration mechanism, and the H8a cell already drives
  the real load path. (4) `npm run lint` and `npm run typecheck` clean. Also
  verified: every protected witness green as written and absent from
  `git status` (`capitalised-bare-match-pattern-refusal` 45/45,
  `match-pattern-increment-decrement` 28/28, the bug 0141 re-pinned siblings,
  both standalone live cells, `fn-arg-type-mismatch-wired*`).
- **H9a stderr gate:** no change, decided by inspection rather than assumption —
  `tests/fixtures/h7a/permitted-codes.json` carries no `theta/parse/` entry at
  all, and this fix mints no code: `theta/parse/reserved-keyword-as-identifier`
  was already registered and already firing at the bare-head site, so a second
  call site of the same code leaves the list's membership question static. The
  file is not in the diff.
- **Residuals:**
  1. **Element 2, narrowed.** `R { a: 1 }` selecting on a `Q`-constructed value
     survives: measured post-fix, `schema Q { a: integer }` /
     `schema R { b: integer }` / `let d = Q { a: 1 }` /
     `match d { R { a: 1 } => "r-arm", _ => "other" }` answers `"r-arm"` with
     `[]` diagnostics (witness cell v6). The reserved-head half of the class is
     closed, so what remains is a *declared-name* interchangeability, not a
     reserved-word silence. Unclaimed by any report; §Non-goals states why this
     run does not take it.
  2. **Element 3, unchanged.** `Zed { a: 1 }` with `Zed` undeclared draws `[]`
     post-fix (boundary cell), while the value position `let r = Zed { a: 1 }`
     draws `theta/parse/unresolved-named-type`. Unclaimed by any report.
  3. **The lowercase object-pattern head.** `p { a: 1 }` still draws `[]`
     (boundary cell), per §Non-goals. Unclaimed by any report.
  4. **Positional drift.** This change inserts 11 lines into
     `src/parser/theta-document.ts` at the object arm, so citations into that
     file below `:4258` shift by +11 — bug 0141's tail-arm emission is now
     `:4314`, the object arm's return `:4304`, the field-shorthand block
     `:4290–:4294`, `collectPatternBindings` `:5090`. The two witness files
     authored this run were corrected; **no sweep into any other file was
     performed** (bug 0134's adjudicated do-not-chase class), so §Affected's own
     citations above and bugs 0123's and 0141's remain at their filing frames.
  5. **Bug 0123's `--y` cascade re-measured, not re-verdicted.** Witness cell
     `z1` pins what `--y` in pattern position draws at this tree
     (`theta/parse/increment-decrement`), which is bug 0123's landed fix. §Fix
     (b)(6) is discharged: the recovery tail is outside the diff and
     byte-identical.
  6. **The four claimed spellings are a measured fact, not a rule.**
     `mut { a: 1 }` draws only `theta/parse/mut-on-immutable-context` and
     `true` / `false` / `null { a: 1 }` only `theta/parse/bare-object-literal`,
     because arms above `parsePattern`'s object arm claim those tokens. The cell
     pins the current partition; a future reordering of the arms would red it,
     which is the intent.
- **Discharge notes appended:** bug 0141 — its §Fix (0.146.0) *Residuals* item
  naming this class is discharged, and a note beneath its fix record says so.
- **Pinned dispositions / non-goals:** the runtime keeps dropping `typeName`
  (element 2); a pattern head still resolves against no declaration table
  (element 3); `theta/parse/capitalised-pattern-head` is NOT widened to the
  braced head, since `Ident { … }` is an admitted production and the row's own
  message would be false of it; no registry row and no normative sentence is
  edited; the lowercase head, exhaustiveness, unreachable arms, guards and rest
  patterns stay where §Non-goals leaves them.

## Discharge note — bug 0221 (0.167.0)

Bug [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md) closed
the non-reserved half of this arm: an `ident`-kind object-pattern head absent
from the whole-file declaration universe now draws
`theta/parse/unresolved-named-type` at the head's range, from the same site this
report's guard emits from.

- §Fix (0.156.0) *Residual* 2 (element 3, `Zed { a: 1 }` silent) — **closed**.
  Witness cell `n2` here is one of the two flips bug 0221 §Fix (c)(2)
  authorised.
- §Fix (0.156.0) *Residual* 3 (the lowercase object-pattern head) — **closed**.
  Witness cell `n1` here is the second authorised flip.
- §Fix (0.156.0) *Residual* 1 (element 2, narrowed to declared-name
  interchangeability) — **survives**, as bug 0221's own record's residual 1: a
  DECLARED head whose declaration cannot carry the listed fields still selects
  its arm, because `parsePattern` holds no schema field bodies.

Every other cell of this report's 54-cell witness is byte-identical and green;
`v6`'s diagnostic half did not flip, both its heads being declared.
