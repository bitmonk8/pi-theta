# Bug 0015 — After a postfix-`?` line, a keyword-free statement carrying a depth-0 ternary is swallowed by the ternary-head scan — silently when it is an expression statement

- **Status:** open
- **Kind:** defect — statement segmentation. The bug-0005 (b) fix restores the
  postfix-`?` statement boundary only when the next statement begins with a
  statement-only keyword; a keyword-free next statement (a reassignment or an
  expression statement) offers the bounded scan no stop token, so a depth-0
  ternary `:` inside that statement still classifies the preceding postfix `?`
  as a ternary head. Same family as 0005 (b) and 0006 (statement-boundary
  leaks).
- **Affected:** the `isTernaryHead` forward scan and its
  `STATEMENT_ONLY_KEYWORDS` stop set (`src/parser/theta-document.ts:2509`,
  `:1338`); the trailing-`?` newline-continuation trigger (`trailingTriggers`,
  `src/lexer/lexer.ts:173`). Aggravating co-factor: `parseTernary`
  (`src/parser/theta-document.ts:2556–2559`) recovers from a missing ternary
  `:` by fabricating a `null` alternate with no diagnostic, which is what
  makes the expression-statement cells fully silent.
- **Observed at:** `0.20.0` (parse-lint via `parseThetaDocument`).

## Summary

A statement whose line ends with the postfix error-propagation `?` must
terminate at the newline (grammar.md: the `?` continuation trigger "is the
**ternary head only**"). The 0005 (b) fix enforces this by stopping the
ternary-head disambiguation scan at a depth-0 statement-only keyword — proof
the scan crossed the swallowed boundary. Both keyword-free statement forms the
grammar admits defeat that proof:

- **Reassignment** (`x = expr`, `x += expr`, …) — a statement per grammar.md
  §"`let` form" — begins with an identifier.
- **Expression statements** (a bare call, a bare ternary, a discarded-value
  expression, the `ThetaBody` tail `Expr`) begin with expression material.

When such a statement follows a postfix-`?` line **and** contains a depth-0
ternary, the scan reads through it, meets that ternary's own `:` at depth 0,
and answers "ternary head". The postfix `?` becomes a ternary over the
swallowed statement. For a reassignment the leaked parse trips over the `=`
(illegal in expression position) and fails loudly at the wrong construct; for
an expression statement the whole next statement is legal consequent material,
`parseTernary` silently fabricates the missing alternate as `null`, and the
document parses with **zero diagnostics** while meaning a different program.

## Reproductions

All three programs are legal: each control cell (identical source minus the
trailing `?`) parses with zero diagnostics.

**(1) Reassignment with a ternary RHS — loud misparse, wrong construct.**

```theta
let mut x = 0
let c = true
let a = 1
let b = 2
let y = @`ping`?
x = c ? a : b
```

```
6:3 error theta/parse/unsupported-feature: unsupported syntactic feature: stray '=' in statement position
```

The `reassign` statement is gone from the AST. `y`'s initialiser lands as the
ternary `` @`ping` ? x : null `` (the reassignment *target* consumed as the
consequent, the alternate fabricated), the postfix `?`'s error propagation is
deleted, and `c ? a : b` is left over as a stray expression statement.
Compound operators (`x += c ? a : b`) fail the same way.

**(2) Bare ternary as the `ThetaBody` tail — silent misparse.**

```theta
let c = true
let y = @`ping`?
c ? 1 : 2
```

Zero diagnostics. The document parses as two `let` statements and **no tail
expression**: `y`'s initialiser lands as `` @`ping` ? (c ? 1 : 2) : null ``.
Three semantic changes, none signalled:

- the postfix `?` unwrap-or-early-return on the query is deleted (no `try`
  node; an `Err` no longer propagates);
- the entire next statement is absorbed as the consequent, with a fabricated
  `null` alternate for the outer ternary's missing `:`;
- the theta's final value becomes literal `null` (no tail expression —
  grammar.md §Blocks) instead of the ternary's value.

A call-headed ternary statement (`g() ? 1 : 2`) misparses identically. A blank
line between the two statements does not protect (continuation crosses blank
lines; same as 0005 (b)).

**(3) Mid-body expression statement — silent statement deletion.**

```theta
let c = true
let y = @`ping`?
c ? 1 : 2
let z = 3
z
```

Zero diagnostics. The control parses four statements plus tail
(`[let, let, expr, let]`, tail `z`); with the trailing `?` the `expr`
statement vanishes (`[let, let, let]`) — swallowed into `y`'s initialiser —
and the rest of the program parses normally around the deletion.

## Verified matrix (0.20.0, `parseThetaDocument`, top-level statements)

Preceding line `` let y = @`ping`? `` (treatment) vs `` let y = @`ping` ``
(control); next statement varies. "clean" = zero diagnostics and the expected
statement/tail shape.

| Next statement | With trailing `?` | Control (no `?`) |
|---|---|---|
| `x = c ? a : b` (reassign, ternary RHS) | **misparse, loud** — `reassign` gone; `stray '='` at the next line; `y` init `` @`ping` ? x : null `` | clean (`reassign`) |
| `x += c ? a : b` (compound) | **misparse, loud** — same shape | clean (`reassign`) |
| `x = a` (reassign, no ternary) | clean — no depth-0 `:` before the next real boundary (`stmt-sep`/`eof`), scan answers postfix | — |
| `x = (c ? 1 : 2)` (ternary parenthesised) | clean — `:` at depth 1 | — |
| `f(c ? 1 : 2)` (call stmt, ternary argument) | clean — `:` at depth 1 | clean |
| `g() ? 1 : 2` (call-headed ternary stmt) | **misparse, silent** — zero diagnostics; stmt swallowed; `y` init `` @`ping` ? (g() ? 1 : 2) : null ``; tail lost | clean (tail `ternary`) |
| `c ? 1 : 2` (bare ternary tail) | **misparse, silent** — same shape | clean (tail `ternary`) |
| blank line, then `c ? 1 : 2` | **misparse, silent** — blank line does not protect | — |
| `c ? 1 : 2` mid-body, then `let z = 3` / `z` | **misparse, silent** — the `expr` statement deleted; rest parses | clean (`[let, let, expr, let]`) |
| `match v { 1 => "one", _ => "other" }` | clean — `match` heads an expression but carries no depth-0 `:` | clean |

Real multi-line ternaries — the trailing-`?` form (`let z = c ?` ␤ `1 :` ␤
`2`) and the leading-`?` form (`let z = c` ␤ `? 1` ␤ `: 2`) — parse correctly
today and must keep working under any fix.

At top level the exposure is exactly: the statement sharing the swallowed
boundary is keyword-free **and** contains a depth-0 `:` — in the statement
grammar that means an unparenthesised ternary at its top level (every other
`:` source in a keyword-free statement sits behind brackets, and `let`/`fn`
annotations are behind stop keywords since 0005 (b)); the next statement's own
`stmt-sep` bounds the scan otherwise. Statements headed by a stop keyword,
keyword-free statements whose ternary is bracketed, and `for`-headed
statements (the `for` keyword cannot start an expression, so the scan's
expression-lead gate answers postfix before scanning) are correctly segmented.
Inside a braced body the exposure is wider (verified mechanically, same
harness): no `stmt-sep` exists at bracket depth > 0 (the bug-0006 lexer
mechanism), so the scan crosses any run of statements not headed by a stop
keyword until the body's closing `}` — after a postfix-`?` line in a `fn`
body, `x = a` ␤ `c ? 1 : 2` misparses (stray `=`, `reassign` gone) even
though the boundary-sharing statement carries no ternary; the deciding `:`
sits two statements past the boundary.

## Expected behaviour (what the spec says)

- grammar.md §"Statement termination & newline continuation": "The `?` trigger
  is the **ternary head only**; the postfix error-propagation `?` is a
  complete-expression terminator (it desugars to `return Err(e)`) and never
  continues." Every misparsing cell violates this: the statement boundary
  after the trailing postfix `?` is not honoured.
- grammar.md §"`let` form": "Reassignment is a statement (`=`, `+=`, `-=`,
  `*=`, `/=`, `%=`)" — cell (1)'s next statement is a legal statement form.
- grammar.md §Blocks: `ThetaBody ::= Stmt* Expr?` — cell (2)'s bare ternary is
  a legal tail `Expr`; "A `FnBody`/`ThetaBody` with no tail expression has …
  final value literal `null`" is what makes the silent tail loss a semantic
  change.
- grammar.md §"Expression sublanguage": assignment in expression position is
  not supported — the leaked scan's ternary reading of cell (1) is not a legal
  parse of any program, yet it wins over the legal statement segmentation.

## Analysis

Three mechanisms compose:

1. **The lexer swallows the newline after any trailing `?`**
   (`trailingTriggers`, `src/lexer/lexer.ts`). By 0005 (b)'s analysis this is
   irreducible at the lexer: a real trailing ternary head and a postfix `?`
   are lexically identical up to the newline, so the parser must restore the
   boundary.
2. **`isTernaryHead` proves boundary-crossing only via keywords.** The scan
   walks forward for a depth-0 `:` before `eof`/`stmt-sep`, answering
   "postfix" early only at a depth-0 `STATEMENT_ONLY_KEYWORDS` member or an
   unmatched depth-0 closing bracket (the block-end stop; no help at top
   level). The set is keyword-based by construction (its doc comment closes
   it over the statement/declaration *heads*); a reassignment or expression
   statement has no head keyword, so nothing stops the scan before the next
   statement's own ternary `:` at depth 0 — the deciding `:` belongs to the
   wrong ternary.
   (The scan does not pair nested `?`s: in `` ? c ? 1 : 2 `` the `:` it
   accepts pairs with the *inner* `?`, not the one under test.)
3. **`parseTernary` recovers silently from the missing `:`.** Having committed
   to the head reading, the parser consumes the swallowed statement as the
   consequent; when the outer ternary's `:` is absent it fabricates a `null`
   alternate without emitting a diagnostic. For expression statements this
   erases the last observable trace of the misparse — the document loads
   clean and runs a different program (no `Err` propagation, ternary dispatch
   on the un-unwrapped query result, final value `null`).

## Why it matters

- `` let y = @`…`? `` followed by keyword-free code is idiomatic top-level
  theta; a ternary tail or a `let mut` counter update after such a line is
  ordinary program shape, not an edge case.
- The expression-statement cells are **silent**: no diagnostic at load, a
  changed program at run — the postfix `?`'s failure propagation is deleted,
  a statement disappears, and the theta's final value degrades to `null`. The
  0005 (b) symptom at least failed loudly (`unknown identifier 'subagent'`).
- The reassignment cell fails loudly but at the wrong construct (`stray '='`
  on the next line), pointing the author away from the trailing `?` that
  caused it — the same misleading-diagnostic pattern as 0006.

## Options

1. **Pair depth-0 `?`s in the scan** (extend the boundary discipline —
   recommended direction): while scanning, treat a depth-0 `?` whose next
   token can start an expression as opening a nested ternary head; a depth-0
   `:` first pairs with the innermost open nested head; classify the `?` under
   test as a ternary head only on meeting a depth-0 `:` that pairs with *it*.
   Fixes every misparsing cell (in each, the deciding `:` pairs with the next
   statement's own `?`) and preserves the legal forms: both multi-line ternary
   continuations and the nested-consequent form `c ? d ? 1 : 2 : 3` keep their
   readings. Residual corner: an *inner postfix* `?` directly followed by an
   expression-lead token inside a real multi-line ternary arm (e.g.
   `c ?` ␤ `f()? - 1 : b`) would be miscounted as a nested head and the real
   ternary misread as postfix — the same irreducible head/postfix ambiguity
   class 0005 (b) named, narrowed from "every keyword-free statement with a
   ternary" to that corner.
2. **Extend the stop set with depth-0 assignment operators** (`=` and the
   compound forms; illegal in expression position per grammar.md): mechanical
   and safe, but covers only the reassignment cells — the silent
   expression-statement cells, the worse half of the defect, remain. At most a
   companion to option 1 or 3.
3. **Grammar-level line discipline (the 0006 direction):** make a trailing `?`
   at line end always postfix by removing `?` from the trailing-trigger set,
   keeping the leading-`?` / leading-`:` continuation forms for multi-line
   ternaries. Deterministic and lexer-only, but a breaking grammar change: the
   documented trailing-`?` ternary form (`let z = c ?` ␤ `1 : 2`) becomes two
   statements, requiring a grammar-table change, fixture rework, and a
   migration note. A scan-side "stop at a line break" variant is not viable:
   real multi-line ternaries legally place the consequent and the `:` on later
   lines.

Under any option, `parseTernary`'s missing-`:` recovery should emit a
diagnostic instead of silently fabricating a `null` alternate — it converts
future boundary leaks of this family from silent corruption into loud parse
errors.

## Provenance

- Spec measured against: `docs/reference/grammar.md` §"Statement termination &
  newline continuation", §"`let` form", §Blocks, §"Expression sublanguage".
- Matrix verified mechanically with `parseThetaDocument` at `0.20.0`
  (30492948) via a scratch harness (deleted after use); every cell above is
  reproduced from that run, including AST landing shapes and diagnostics.
  Triage re-verified every cell at `c15809cb` (same 0.20.0 tree, fresh
  harness, deleted after use): all reproduce exactly, including the `6:3`
  stray-`=` position and both multi-line ternary controls; the braced-body
  widening and the `for`-head expression-lead gate (the paragraph after the
  matrix) are from that run. Line refs pinned at the same tree.
- Origin: structural residual of the bug-0005 (b) fix — the bounded scan's
  only new stop condition is keyword-based (`STATEMENT_ONLY_KEYWORDS`,
  `src/parser/theta-document.ts`; its doc comment records why the set is
  closed over statement heads), so keyword-free statement forms were never
  protected. The candidate example `x = c ? a : b` is confirmed verbatim
  (reproduction (1)). No in-repo artifact records the residual; this report
  is the first.
- Kin: bug 0005 (b) (same swallowed boundary, keyword-headed next statement),
  bug 0006 (statement-boundary leak, misleading diagnostic at the wrong
  construct).
