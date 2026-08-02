# Bug 0062 — The closed trailing-trigger row at `grammar.md:204` omits the bare `=` that `trailingTriggers()` implements: `let x =`, `x =` and `schema X =` continue onto the next line at HEAD, the same section's own `let x =\n\n  foo` example depends on that continuation, and `docs/reference/grammar.md:576–578` asserts the two sets match

- **Status:** open. §Fix as settled — two table rows on each of two grammar
  pages plus one prose clause; no `src/`, registry, or test change.
- **Kind:** spec-doc defect — a normative closed table under-states the
  implemented trigger set. Not an implementation defect: the lexer's behaviour
  is the one the section's own worked example and three in-tree surfaces
  depend on, and changing it is a GOV-15 breaking change (§Fix). The
  under-statement is internally inconsistent as well as incomplete: the closure
  sentence at `grammar.md:199` declares the set closed, and the example at
  `:210` exercises a trigger the closed table does not list.
- **Related:**
  [0042](./0042-schema-decl-same-line-residue-silent.md) — the filing origin.
  Its §Fix (0.52.0) *Residuals* item (iii) (`:512–514`) records this omission
  as pre-existing and out of that fix's frame; this report is that curation.
  [0033](./0033-body-level-schema-alias-unsupported.md) — the fix (0.45.0) that
  built the alias-arm keyword stop (`src/parser/theta-document.ts:2380–2394`)
  *because* `schema X =` swallows the boundary newline, and whose witness file
  carries six fixtures whose mechanism is this trigger
  (`tests/schema-alias-union-decl.test.ts:283–288`, `:1269–1273`).
  [0049](./0049-grammar-member-access-head-covers-bracket-indexing.md) — the
  other open `docs/spec_topics/grammar.md` defect; its constraint 3 pins an
  in-place one-line rewrite at `:54`, so neither report's edit moves the
  other's line anchors.
  [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
  — the class precedent: a one-cell spec reconciliation with no behavioural,
  registry, or test surface (fixed 0.47.0).
- **Affected** (citations at HEAD `9c961f7f`, 0.52.0):
  - The defective row: `docs/spec_topics/grammar.md:204` — "| Trailing binary
    or ternary operator | the line ends with one of `+ - * / % == != < <= > >=
    && \|\| ? :` | `let x = a +\n  b` |". Fifteen operator texts, no `=`.
  - The closure that makes the omission normative: `:199` — "A statement
    implicitly continues across one or more newlines when, and only when, one
    of the **continuation triggers** below holds at the boundary. The trigger
    set is closed."
  - The example inside the same section that the closed table does not license:
    `:210` — "`let x =\n\n  foo` is one statement equivalent to `let x = foo`."
    Its only candidate trigger is the trailing `=`.
  - The implementation the row under-states: `src/lexer/lexer.ts:173–178` —
    `trailingTriggers()` returns the fifteen tabled texts plus `"="` (`:176`),
    sixteen in all;
    its doc comment (`:167–172`) names the divergence outright, "plus the
    binding `=` the spec's own worked example (`let x =\n\n foo` is one
    statement) treats as an incomplete-statement continuation trigger". Applied
    at `:732` / `:737–738` / `:754` (`swallow = depth > 0 || isTrailing(prev)
    || isLeading(next)`).
  - The mirror, same omission: `docs/reference/grammar.md:119` — "| Trailing
    binary/ternary operator | line ends with one of `+ - * / % == != < <= > >=
    && \|\| ? :` |"; its closure at `:113–114` ("The trigger set is closed:")
    and its copy of the unlicensed example at `:129`.
  - The mirror's false implementation-confirmation claim:
    `docs/reference/grammar.md:576–578` — "Implementation confirmation:
    reserved-keyword set in `src/lexer/lexer.ts:152` matches the spec list
    byte-for-byte; `src/lexer/lexer.ts` trailing/leading continuation-trigger
    sets match the closed trigger table." The reserved-keyword half holds
    (`lexer.ts:152–160`); the trailing half does not.
  - The prose enumeration that repeats the closed set:
    `docs/spec_topics/lexical.md:22` — "open `(` / `{` / `[`, a trailing binary
    or ternary operator, a trailing comma, or a leading binary or ternary
    operator on the next non-blank line. The continuation-trigger set is closed
    and is normatively tabulated in [Grammar Appendix — Newline
    continuation](./grammar.md#newline-continuation)" — followed by the same
    `let x =\n\n  foo` example.
  - Not affected — the leading-trigger row. `grammar.md:206` /
    `docs/reference/grammar.md:121` state the leading set as "one of the
    operators above", and `leadingTriggers()` (`lexer.ts:185–189`) omits `=`
    deliberately, its comment reading "`=` is not a leading trigger". Measured:
    a line-leading `=` closes the statement (§Reproduction, second probe).
    The row is correct as written and constrains the fix (§Fix).
  - Not affected — the other three rows. The open-bracket row (`:203`), the
    trailing-comma row (`:205`, whose "(inside any open `(` / `[` / `{`)"
    qualifier is measured: a depth-0 trailing `,` closes the statement) and the
    `?`-carve-out paragraph (`:208`) all match the implementation.
  - Not affected — `docs/spec_topics/expressions.md:147`. It restates
    continuation informally ("A binary or ternary operator at the *end* of a
    line continues the statement to the next line") and claims no closure, so
    it under-describes rather than contradicts. It moves under no disposition.
  - Not affected — the diagnostics registry. No code is added, removed,
    renamed or retriggered; `theta/parse/let-without-initialiser`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:53`) keeps its row.
- **Observed at:** `0.52.0` (HEAD `9c961f7f`). Text read from the files;
  behaviour established by two offline parse/lex probes through the shipped
  front end (`lexTheta` / `parseThetaDocument` via `tests/helpers/e2e-s1.ts`).
  No model, no live provider, no file written.

## Summary

`grammar.md` §Newline continuation tabulates four continuation triggers and
declares the set closed (`:199`). `trailingTriggers()` implements the tabled
fifteen operator texts and one more: `"="` (`lexer.ts:176`). A line ending in
a bare `=` therefore continues onto the next line in every position the token
appears in — `let x =`, `x =` / `x +=`, and `schema X =` — and the table says
it does not.

The omission is visible inside the section that carries it. `:210`'s worked
example, `let x =\n\n  foo` is one statement, continues across two newlines
behind a trailing `=`; no row of the table above it licenses that. The same
example appears at `docs/reference/grammar.md:129` and
`docs/spec_topics/lexical.md:22`, under the same closed enumerations.

In-tree reliance on the implemented trigger is measured: the alias-arm keyword
stop 0033 built for `schema X =` (`src/parser/theta-document.ts:2380–2394`,
`:1477`) and eight default-gate cells across three test files, one of them the
lexer's own blank-line witness for `:210`'s example
(`tests/lexer-core.test.ts:259–263`). No committed `.theta` or `.thetalib`
ends a line in `=`.

## Reproduction

Read the table at HEAD `9c961f7f`. Verbatim, with line numbers:

```text
docs/spec_topics/grammar.md
197  ## Newline continuation
199  Statements are separated by newlines. A statement implicitly continues across one or more newlines when, and only when, one of the **continuation triggers** below holds at the boundary. The trigger set is closed.
201  | Trigger | Position | Example |
202  |---|---|---|
203  | Open bracket without a matching close | the line ends with an unmatched `(` / `[` / `{` | `let x = [\n  1, 2, 3\n]` |
204  | Trailing binary or ternary operator | the line ends with one of `+ - * / % == != < <= > >= && \|\| ? :` | `let x = a +\n  b` |
205  | Trailing comma | the line ends with `,` (inside any open `(` / `[` / `{`) | `f(a,\n  b)` |
206  | Leading binary or ternary operator | the next non-blank line begins with one of the operators above | `let x = a\n  + b` |
210  **Blank lines do not break a continuation.** When any of the four triggers holds, the parser continues across one or more newlines regardless of how many of those newlines are blank. `let x =\n\n  foo` is one statement equivalent to `let x = foo`. …
```

The token list the lexer implements:

```text
src/lexer/lexer.ts
167  /**
168   * Operator texts that, as the *trailing* token of a line, trigger newline
169   * continuation: the binary / ternary set from grammar.md §Newline continuation,
170   * plus the binding `=` the spec's own worked example (`let x =\n\n foo` is one
171   * statement) treats as an incomplete-statement continuation trigger.
172   */
173  function trailingTriggers(): ReadonlySet<string> {
174    return new Set([
175      "+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "&&", "||",
176      "?", ":", "=",
177    ]);
178  }
```

**Probe 1 — what a trailing `=` does.** One command, offline, no file written
(`tests/helpers/e2e-s1.ts` wraps the shipped `lexTheta` / `parseThetaDocument`
with inert seams). `/` marks a source newline:

```console
$ npx tsx -e "import {parseDoc, lexSrc} from './tests/helpers/e2e-s1.ts'; const N=String.fromCharCode(10); const cases=[['A let x = / 1','let x ='+N+'1'+N],['B let x = / / 1','let x ='+N+N+'1'+N],['C x = / 5','let mut x = 0'+N+'x ='+N+'5'+N],['D schema X = / string','schema X ='+N+'string'+N],['E let x = a / let','let x = a'+N+'let y = 2'+N],['F let x = 1 + / 2','let x = 1 +'+N+'2'+N],['G let x = / let y','let x ='+N+'let y = 2'+N]]; for (const [label,src] of cases){const d=parseDoc(src); const seps=lexSrc(src).tokens.filter((t)=>t.kind==='stmt-sep').length; const last=d.body.statements[d.body.statements.length-1]; const rhs=last?.init ?? last?.value ?? null; console.log(label.padEnd(22),'stmt-sep='+seps,'stmts='+JSON.stringify(d.body.statements.map((s)=>s.kind)),'rhs='+(rhs?rhs.kind+'('+(rhs.text??rhs.name??'')+')@line'+rhs.range.start.line:(last?.arms?'arms='+JSON.stringify(last.arms):'null')),'diags='+JSON.stringify(d.diagnostics.map((x)=>x.code)));}"
A let x = / 1          stmt-sep=1 stmts=["let"] rhs=number(1)@line2 diags=[]
B let x = / / 1        stmt-sep=1 stmts=["let"] rhs=number(1)@line3 diags=[]
C x = / 5              stmt-sep=2 stmts=["let","reassign"] rhs=number(5)@line3 diags=[]
D schema X = / string  stmt-sep=1 stmts=["schema"] rhs=arms=["string"] diags=[]
E let x = a / let      stmt-sep=2 stmts=["let","let"] rhs=number(2)@line2 diags=["theta/parse/unknown-identifier"]
F let x = 1 + / 2      stmt-sep=1 stmts=["let"] rhs=binary()@line1 diags=[]
G let x = / let y      stmt-sep=1 stmts=["let","let"] rhs=number(2)@line2 diags=["theta/parse/let-without-initialiser"]
```

Reading the rows:

- **A** — `let x =` then `1` on the next line is **one** statement binding `x`
  to the number `1` at line 2, with zero diagnostics. The lexer emitted no
  `stmt-sep` at the boundary.
- **B** — a blank line between them changes nothing: `:210`'s worked example,
  reproduced.
- **C** — the same at a reassignment (`x =`; `x +=` behaves identically, the
  lexer emitting `+` then `=` and the trailing token being `=`). The two
  `stmt-sep`s are the two line breaks the trigger does not span.
- **D** — the same at an alias head: `schema X =` captures `string` from the
  next line as its single arm.
- **E** — the spec-conformant contrast. A line ending in a bare identifier is
  no trigger: two `stmt-sep`s, two statements, and `a` resolves as an ordinary
  unknown identifier.
- **F** — the tabled trigger `+` for comparison; identical continuation shape
  to A.
- **G** — the parser's own re-split. Where the next line heads a statement the
  parser severs the over-joined line and the `let x =` prefix draws
  `theta/parse/let-without-initialiser` — the disposition the table as written
  predicts for **A**, reached here by a different severing route.

**Probe 2 — the trailing/leading boundary, per token.** `a <p>` then `b` on the
next line, counting `stmt-sep`s:

```console
$ npx tsx -e "import {lexSrc} from './tests/helpers/e2e-s1.ts'; const N=String.fromCharCode(10); for (const p of ['=','+','-','>','?',':','&&','!','.',',','@','|']) { const s=lexSrc('a '+p+N+'b'+N).tokens.filter((t)=>t.kind==='stmt-sep').length; console.log(('a '+p).padEnd(6),'stmt-sep='+s, s===1?'continued':'closed'); }"
a =    stmt-sep=1 continued
a +    stmt-sep=1 continued
a -    stmt-sep=1 continued
a >    stmt-sep=1 continued
a ?    stmt-sep=1 continued
a :    stmt-sep=1 continued
a &&   stmt-sep=1 continued
a !    stmt-sep=2 closed
a .    stmt-sep=2 closed
a ,    stmt-sep=2 closed
a @    stmt-sep=2 closed
a |    stmt-sep=2 closed
```

`=` continues exactly as the six tabled operators do. The depth-0 `,` closes,
matching `:205`'s parenthetical. The leading direction is separately measured
and matches the table: `let x = a` then `= b` closes (2 `stmt-sep`s) while
`+ b` continues (1).

**Corpus reliance.** No committed source ends a line in `=`:

```console
$ git ls-files "*.theta" "*.thetalib" | wc -l
34
$ git ls-files "*.theta" "*.thetalib" | xargs rg -n "=[ \t]*$"
(no matches)
```

Test sources are the reliance. Nine literal `=\n` occurrences across three
files (`rg -nF '=\n' tests/`, excluding untracked scratch files), backing eight
cells:

```text
tests/lexer-core.test.ts:261             lex("let x =\n\n  foo")            — 1 cell (:259–263)
tests/schema-alias-union-decl.test.ts:292, :334, :389–392                   — 6 cells
tests/schema-alias-rhs-malformed.test.ts:301                               — 1 cell (:1323)
```

Their comments name the mechanism and cite this section:
`tests/schema-alias-union-decl.test.ts:284–286` — "`>` and `=` are trailing
newline-continuation triggers (lexer.ts `trailingTriggers`; grammar.md
§"Statement termination & newline continuation")"; `:1336` — "The `=` is itself
a trailing trigger, so the arm capture starts ON the next statement".

## Expected behaviour

- `docs/spec_topics/grammar.md:199` — the continuation-trigger set is closed
  and the table below it is the enumeration. A closed enumeration lists every
  trigger the implementation fires on.
- `docs/spec_topics/lexical.md:22` — the same set, stated as prose, "closed and
  … normatively tabulated" at the grammar table. The two agree.
- `docs/spec_topics/grammar.md:210` and its two copies
  (`docs/reference/grammar.md:129`, `lexical.md:22`) — `let x =\n\n  foo` is
  one statement. An example inside a normative section is licensed by a row of
  that section's own table.
- `docs/reference/grammar.md:576–578` — the trailing and leading
  continuation-trigger sets in `src/lexer/lexer.ts` match the closed trigger
  table.
- The implemented behaviour stands: `let x =`, `x =`, `x +=` and `schema X =`
  continue across the newline (§Reproduction A–D). It is what the section's own
  example describes, what `leadingTriggers()`'s asymmetry is written against
  (`lexer.ts:182–183`), and what eight default-gate cells and the alias-arm
  keyword stop depend on.

## Actual behaviour / root cause

The table lists fifteen operator texts in its trailing row. `trailingTriggers()`
returns those fifteen and `"="`. `leadingTriggers()` returns the fifteen
alone. So the trailing row under-states its set by one token and the leading
row is exact, and the divergence is confined to that one cell on each of the
two grammar pages plus the prose enumeration at `lexical.md:22`.

The root cause is a taxonomy gap, not an oversight in the implementation. `=`
is not a binary or ternary operator in this grammar: the nine-level operator
table at `expressions.md:128–138` does not carry it, and binding and
reassignment are statement forms (`bindings.md:10`). The row that would have
carried it is headed "Trailing binary or ternary operator", so a trigger that
is neither had no row to sit in. The lexer's doc comment (`lexer.ts:167–172`)
records exactly this, deriving `=` from the worked example instead of from the
table, and the parser repeats the derivation twice (`theta-document.ts:1477`,
`:2380–2394`) — three code sites citing a rule the cited table does not state.

`lexical.md:22` shows the same seam from the other side. Its lead clause is a
rationale that fits `=` — a statement continues "only when the parser cannot
otherwise close it", and `let x =` cannot be closed — but the enumeration that
follows it is closed and lists four items, none of them `=`, and the sentence
then defers normativity to the grammar table. The rationale covers the case;
neither enumeration does.

Nothing mechanically compares the two. The closing gate ingests
`docs/spec_topics/` (`tools/closing-gate/live-corpus.js:123`, `:146`; consumed
by `tests/live-corpus-release-gate.test.ts:145`), but its recognisers key on
`theta/` codes, `MUST`, REQ-IDs and registry table rows — none of which this
row carries — and no test or tool opens either grammar page as a file. The
`docs/reference/grammar.md:576–578` line is a hand-written confirmation that
the sets match, and it is the one artefact that would have caught the
divergence had it been re-derived.

## Why it matters

- **A closed set that is not closed.** `:199` states the enumeration is
  exhaustive, so an author reading it concludes that `let x =` ends a statement
  and draws `theta/parse/let-without-initialiser`. At HEAD it binds the next
  line's expression with zero diagnostics (§Reproduction A). The reader has no
  way to detect the gap from the table.
- **The section contradicts itself.** `:210`'s example is one statement only
  because of the missing trigger. A reader who trusts the table reads the
  example as unreachable; a reader who trusts the example reads the table as
  not closed. `docs/reference/grammar.md:129` and `lexical.md:22` reproduce the
  contradiction on two further pages.
- **A reference claim is false.** `docs/reference/grammar.md:576–578` asserts
  the lexer's trailing set matches the table. It does not, and the assertion is
  the corpus's own confirmation step.
- **Three code sites and eight test cells already rely on the unstated rule.**
  `theta-document.ts:2380–2394` explains the alias-arm keyword stop by the
  `schema X =` continuation; two test files carry the derivation in comments
  citing this section. Each is a correct claim about the implementation that
  the cited spec text does not support.
- **The cost of correcting it is bounded and measured.** Two table cells on
  each of two pages and one prose enumeration; no `src/` byte, no registry row,
  no test, and no line-number drift (§Fix).

## Fix

**Add `=` to the trailing row on both grammar pages and to the prose
enumeration, in place.** The row count stays four, so `:210`'s "any of the four
triggers" stays true and no line moves on either page.

**1. `docs/spec_topics/grammar.md:204`** — the *Trigger* and *Position* cells
gain the token, the *Example* cell gains the worked spelling:

```text
| Trailing binary or ternary operator, or `=` | the line ends with one of `+ - * / % == != < <= > >= && \|\| ? :`, or with the binding / assignment / alias-head `=` | `let x = a +\n  b`; `let x =\n  1` |
```

**2. `docs/spec_topics/grammar.md:206`** — the leading row's referent is
re-pinned in the same edit. It currently reads "one of the operators above",
which after edit 1 would read onto `=` and widen the leading set, which
`leadingTriggers()` (`lexer.ts:185–189`) does not implement and which
§Reproduction measures as closing the statement:

```text
| Leading binary or ternary operator | the next non-blank line begins with one of the binary or ternary operators above (`=` is trailing-only) | `let x = a\n  + b` |
```

**3. `docs/reference/grammar.md:119` and `:121`** — the same two edits in the
mirror's two-column form, in the same commit. The mirror's closure sentence
(`:113–114`) and its four following bullets (`:123–136`) are unchanged.

**4. `docs/spec_topics/lexical.md:22`** — the prose enumeration gains the same
item: "a trailing binary or ternary operator, a trailing `=`, a trailing
comma, …". The sentence's normative deferral to the grammar table, its
`let x =\n\n  foo` example and its `single-line-if` tail are unchanged.

**The implementation side is fixed by GOV-15.** Removing `"="` from
`trailingTriggers()` is deferred to theta 2.0 and cannot land in theta 1.x.
`let x =\n1` emits no diagnostic at any severity (§Reproduction A), so it is
inside the [GOV-15 loads-cleanly
set](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
(`:9`), and the removal changes both observable (a) — `x` no longer binds `1` —
and observable (b) — a `theta/parse/let-without-initialiser` emission appears
where there was none (`:5`). Neither recognised carve-out reaches it: the
ceiling-set carve-out (`:13`) is keyed to hard-runtime-ceiling changes, and the
diagnostic-registry carve-out (`:25`) covers edits to the registry under
DIAG-2/3/4, which this is not — no row, code, severity or *Trigger* moves, and
the divergence is in the lexer's token set. The measured reliance points the same
way: eight default-gate cells across three test files, the alias-arm keyword
stop 0033 built on the `schema X =` continuation, and the worked example on
three pages.

**Pinned bytes that move.** Seven cells and one clause: `grammar.md:204`
(*Trigger*, *Position*, *Example*), `:206` (*Position*),
`docs/reference/grammar.md:119` (*Trigger*, *Position*), `:121` (*Position*),
and the enumeration clause inside `lexical.md:22`.

**Pinned bytes that do not move.**

- The fifteen operator texts in every row on both pages. They match
  `trailingTriggers()` and `leadingTriggers()` exactly and are re-verified in
  §Reproduction.
- `grammar.md:199` (the closure sentence), `:203`, `:205`, `:208` (the `?`
  carve-out — "In both operator rows" survives the reworded head), `:210`
  (including "any of the four triggers", still four rows, and the two
  examples), `:212`.
- `docs/reference/grammar.md:110`, `:113–114`, `:118`, `:120`, `:123–136`, and
  `:576–578` — the implementation-confirmation claim needs no edit; the row
  edit is what makes it true.
- Every line count: `grammar.md` stays 223 lines, `docs/reference/grammar.md`
  578, `lexical.md` 28. All edits are in-place cell or clause rewrites, so
  every inbound `path:line` citation survives — measured: 34 distinct
  `grammar.md:<n>` anchors at or below the page's 223 lines across `src/`,
  `tests/`, `tools/` and `docs/`, including `:216` (×5) and `:220` (×2) below
  the table, and 8 distinct `lexical.md:<n>` anchors including `:22` itself
  (×2, both in
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)).
- `src/lexer/lexer.ts`, `src/parser/theta-document.ts`, and every test file.
  The lexer's doc comment at `:167–172` states a true fact about the code and
  needs no edit; it may be re-anchored to the row instead of the example, which
  is optional and changes no behaviour.

**DIAG-2/3/4 are not engaged.** No code is added, removed, renamed or
retriggered, and no *Message* is reworded
(`docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`).
`theta/parse/let-without-initialiser` (`code-registry-parse.md:53`) keeps its
row and its trigger; the table edit changes which inputs reach it only in the
sense that it documents the reach they already have.

**Gate behaviour is re-proved, not assumed.** The closing gate reads
`docs/spec_topics/` whole (`tools/closing-gate/live-corpus.js:123`, `:146`;
hard-failed by `tests/live-corpus-release-gate.test.ts:145`). Both edited spec
lines carry no `theta/` code, no `MUST` and no REQ-ID; `grammar.md` carries no
`GRAM-N` anchor at all, and the table is not a diagnostics-registry table, so
every recogniser is structurally inert over the change. A resolution
demonstrates that on the diff rather than asserting it.

**No test witness is owed.** The behaviour the rows describe is already pinned:
`tests/lexer-core.test.ts:236–270` holds one cell per table row plus the two
blank-line cells, and `:259–263` is the trailing-`=` cell — it asserts one
statement group for `let x =\n\n  foo` and cites this section. The fix makes
that cell's citation accurate; it needs no edit. A prose-matching assertion
over the table would invert DIAG-4's direction for expected strings
(`diagnostic-shape.md:74`).

**Ordering.** Independent of [0049](./0049-grammar-member-access-head-covers-bracket-indexing.md),
the other open defect on this page: its constraint 3 pins an in-place one-line
rewrite at `grammar.md:54`, above the table, so neither edit moves the other's
anchors. Neither report blocks the other.

## Non-goals

- **Rewriting the trigger taxonomy.** The fix names `=` inside the existing
  trailing row rather than promoting it to a fifth row. A fifth row adds a
  line, drifts the seven `grammar.md:216` / `:220` citations below the table,
  and forces `:210`'s count phrase from four to five — cost with no gain in
  what the table states.
- **The `?` carve-out.** `:208`'s ternary-head-only rule and the postfix-`?`
  boundary it points at are correct and out of scope; they were settled by
  [0005](./0005-subagent-fn-return-annotation-misparse.md) and
  [0015](./0015-postfix-question-swallows-keyword-free-ternary-stmt.md).
- **`expressions.md:147`.** It restates continuation informally and claims no
  closure, so it is not defective. Widening it is a separate editorial question.
- **A spec/implementation consistency gate.** Nothing mechanically compares
  `lexer.ts`'s trigger sets against the table, which is why the divergence
  survived; building such a gate is out of scope, as is the parallel
  vocabulary-consistency gap recorded by
  [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
  §Fix (0.47.0) *Residuals* (ii).

## Provenance

- Origin: the bug 0042 fix (0.52.0, HEAD `9c961f7f`) — §Fix *Residuals* item
  (iii) ([0042](./0042-schema-decl-same-line-residue-silent.md)`:512–514`):
  "`grammar.md` §Newline continuation's closed trailing-trigger table omits the
  bare `=` the lexer implements; pre-existing, and no clause of this fix relies
  on it." Recorded again in that fix's report with the same disposition
  (unfiled, one-cell spec reconciliation). This report is that filing.
- Spec: `docs/spec_topics/grammar.md:197` (the section heading and the
  `#newline-continuation` anchor), `:199` (the closure sentence), `:201–206`
  (the table), `:204` (the defective row), `:206` (the leading row), `:208`
  (the `?` carve-out), `:210` (the blank-line rule, its count phrase and its
  `let x =` example), `:212` (no semicolon escape, no continuation marker);
  `docs/spec_topics/lexical.md:9` (no line-continuation marker, linking the
  same anchor), `:22` (the prose enumeration and its copy of the example);
  `docs/spec_topics/expressions.md:147` (the informal restatement), `:124` and
  `:128–138` (§Operator precedence — the nine levels, no `=`);
  `docs/spec_topics/bindings.md:10` (`let` requires an initialiser);
  `docs/spec_topics/diagnostics/code-registry-parse.md:53`
  (`theta/parse/let-without-initialiser`), `:87` (the `malformed-alias-rhs`
  row, which links this anchor and turns on the trailing-trigger case);
  `docs/spec_topics/schemas.md:62` (the owning alias sentence, same link and
  same dependence);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15 and its (a)/(b)/(c) observables), `:9` (the loads-cleanly
  predicate), `:13` (the ceiling-set carve-out) and `:25` (the
  diagnostic-registry carve-out), neither reaching this change.
- Mirror: `docs/reference/grammar.md:110` (the section), `:113–114` (the
  closure), `:116–121` (the table), `:119` (the defective row), `:121` (the
  leading row), `:129` (the example), `:576–578` (the false
  implementation-confirmation claim); `docs/reference/coverage-matrix.md:48`
  (grammar coverage recorded "complete").
- Implementation: `src/lexer/lexer.ts:152–160` (`reservedKeywords`, the half of
  the confirmation claim that holds), `:167–172` (the doc comment naming the
  divergence), `:173–178` (`trailingTriggers`, `"="` at `:176`), `:185–189`
  (`leadingTriggers`, no `=`), `:721–729` (`collapseContinuations`' contract),
  `:732`, `:737–738`, `:754` (the swallow decision);
  `src/parser/theta-document.ts:764–770` (the lexer as the statement-joining
  witness), `:1477` (the trailing `=` / `>` derivation), `:2380–2394` (the
  alias-arm keyword stop, built on the `schema X =` continuation).
- Tests read, none changed: `tests/lexer-core.test.ts:234–270` (one cell per
  row plus the two blank-line cells; `:259–263` is the trailing-`=` cell);
  `tests/schema-alias-union-decl.test.ts:283–288`, `:292`, `:333–334`,
  `:389–392`, `:1269–1273`, `:1335–1342` (0033's six fixtures and their
  mechanism comments); `tests/schema-alias-rhs-malformed.test.ts:301`, `:1323`,
  `:1337`; `tests/whole-program-parser.test.ts:37`;
  `tests/postfix-question-ternary-statement-boundary.test.ts:745`.
- Tooling read, none changed: `tools/closing-gate/live-corpus.js:123`, `:146`;
  `tests/live-corpus-release-gate.test.ts:145`.
- Verification at HEAD `9c961f7f` (0.52.0): every citation above read from the
  tree; two offline probes through `tests/helpers/e2e-s1.ts` (quoted verbatim
  in §Reproduction, plus the leading-`=` measurement); the committed-source
  sweep for a line-final `=` over all 34 `.theta` / `.thetalib` files (no
  matches); the `rg -nF '=\n' tests/` reliance sweep (9 occurrences, 3 files,
  8 cells); the inbound-citation sweeps for `grammar.md:<n>`,
  `reference/grammar.md:<n>` and `lexical.md:<n>`; and a sweep of `tests/`,
  `tools/` and `src/` for any file read of either grammar page (none — every
  hit is a comment citation). No scratch file left in the tree; no file
  modified other than this report.
