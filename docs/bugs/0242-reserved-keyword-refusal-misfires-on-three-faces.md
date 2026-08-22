# Bug 0242 — Three lexer-side faces range a diagnostic on a token the author wrote correctly: `for let in xs { 1 }` draws `theta/parse/reserved-keyword-as-identifier` against `'in'` @5:9-5:11 beside the correct one against `'let'`, `schema S { let as "w": string }` and `import { let as x }` draw it against `'as'`, and `schema S { fn: string }` / `enum E { fn }` / `import { fn }` / `import { a as fn }` draw `theta/parse/single-line-if` — "single-line body not permitted; wrap in { ... }" — at a position that has no body, hint and all

- **Status:** open. Filed as residual 1 of the bug
  [0153](./0153-reserved-keyword-remaining-identifier-positions.md) fix
  (0.194.0), recorded in that fix's report
  (`.pi/tmp/fixes/0153-report.md` §Residuals 1: "**The three misfire faces are
  NOT repaired** (§Fix (c) route (i), taken deliberately) … Repair requires
  narrowing `src/lexer/lexer.ts`, which shifts open bugs 0051's and 0135's
  citations — unfiled, and a candidate follow-up report") and in 0153's own
  `## Fix (0.194.0)` record, which owns the disposition: "§Fix (c): **route
  (i)** at all three misfire faces — the lexer's pre-existing adjacency
  diagnostics (`'in'`, `'as'`) and the `controlHeads` scan's `single-line-if`
  are left standing beside the new correct diagnostic, and the resulting
  ordered lists are pinned". Every row below is re-measured at HEAD `30c0cb67`
  (v0.197.0), not copied from that record. **Ordering:** no report blocks this
  one. 0153, 0148, 0149 and 0044 are all fixed and shipped; their witness rows
  are the pinning bytes this report authorises to move (§Fix constraint 1).
- **Sev/Diff estimate:** S2/D3 — S2 on the sharpest face: at `schema S { fn:
  string }`, `enum E { fn }`, `import { fn }` and `import { a as fn }` the
  emitted code is `theta/parse/single-line-if` with the registered *Hint*
  "Wrap the body in `{ ... }`" (`code-registry-parse.md:23`) at a field name,
  a variant name and an import specifier — none of which has a body — so the
  author is handed a wrong code and an unactionable hint beside the correct
  refusal ("wrong diagnostic code/text, spurious duplicate diagnostics"). The
  two `reserved-keyword-as-identifier` faces are the same class one step
  milder: the second diagnostic carries the right code and the wrong subject
  and range, naming `in` (a `ForStmt` terminal, `grammar.md:272`) and `as` (an
  `ImportSpec` terminal, `grammar.md:36`; a wire-rename keyword,
  `schemas.md:23`) as identifiers the author may not use. No face is S1: every
  measured input is already refused for the correct reason by 0153's landed
  emissions, so nothing is admitted that the spec refuses, and no legal input
  draws any of the three (§Reproduction (D), ten controls returning `[]`). D3
  because repair edits `src/lexer/lexer.ts`, which 0148 and 0153 both held
  blob-identical (`17f6e1d710ebe4b9c3350130aaa86585f9d4bd45`, still the blob at
  HEAD) precisely because open bugs
  [0051](./0051-lowercase-named-type-reference-positions-silent.md) and
  [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) hold
  citations in it; because the route is unsettled between contextual-keyword
  discrimination and per-face carve-outs (§Fix); and because the fix must
  retake ordered whole-list rows in four shipped witness files (208 cells,
  §Fix constraint 1) with pinned-byte coordination against three closed
  reports.
- **Kind:** defect — implementation. Three faces, two mechanisms, one cause:
  `contextualDiagnostics` (`src/lexer/lexer.ts:810`) judges positions by token
  adjacency over a flat token stream, with no grammar context.
  1. **The `in` face.** The dispatch has three arms — the token after `let`
     past the `mut` skip (`:876`), after `fn` (`:883`), after `schema` /
     `enum` (`:885`) — each calling `checkName`, whose keyword arm (`:819`)
     pushes `theta/parse/reserved-keyword-as-identifier` ranged on that token
     (`:822–:826`). A `for` or `par for` iteration variable spelled `let`,
     `fn`, `schema` or `enum` puts a dispatch head in the variable slot, so
     `k+1` is the grammar's own `in` and the arm names it.
  2. **The `as` face.** The same three arms, with `k+1` landing on the `as` of
     a schema wire-rename (`schemas.md:23`) or an `import` / `export` alias
     (`grammar.md:36–37`).
  3. **The `single-line-if` face.** A fourth scan (`:889`) keys on
     `controlHeads` (`:812`, the set `if` / `for` / `while` / `fn`) and walks
     forward for a `{` before the next `stmt-sep`. A schema field name, an
     enum variant name or an import specifier spelled with one of those four
     words has no `{` after it on that logical line, so `:904–:910` pushes
     `theta/parse/single-line-if` ranged on the name.
  The registry makes each emission a contradiction of its own row. *Trigger*
  is "the canonical condition" (`diagnostic-shape.md` column legend), and
  `theta/parse/single-line-if`'s is "`if` / `for` / `while` / `fn` body is not
  a braced block (e.g. `if (x) stmt`)" (`code-registry-parse.md:23`) — no
  measured input in §Reproduction (C) has a body of any kind.
  `theta/parse/reserved-keyword-as-identifier`'s is "Reserved keyword used in
  an identifier position" (`:21`), and `in` at `ForStmt ::= "for" Ident "in"
  Expr StmtBlock` (`grammar.md:272`) and `as` at `ImportSpec ::= Ident ("as"
  Ident)?` (`:36`) are grammar terminals, not identifier positions.
  DIAG-1's located-site classification (`diagnostic-shape.md:44`, the
  *Located* category `:46`) makes the
  `range` the emission site's own token span; at all three faces it is another
  token's.
- **Related:**
  - [0153](./0153-reserved-keyword-remaining-identifier-positions.md) —
    **fixed (0.194.0)**, the origin. Its §Fix (c) took route (i) at all three
    faces deliberately and pinned the resulting two- and three-element lists
    (rows `m1`, `m6`, `m8`, `w1`, `w4`, `w7`, `x10`, the seven 32-spelling
    sweeps including `s1`). **Not a duplicate:** that report is closed on the
    six identifier positions it opened, and its pins are what a report is
    needed to move. Its 76-cell witness
    (`tests/reserved-keyword-remaining-identifier-positions.test.ts`) and its
    live cell
    (`tests/live/reserved-keyword-remaining-positions-live-cell.test.ts`) are
    LOCKS apart from the misfire rows (§Fix constraint 1).
  - [0148](./0148-reserved-keyword-fn-parameter-position-silent.md) —
    **fixed (0.81.0)**, the `fn` parameter-name position and the first report
    to hold `src/lexer/lexer.ts` blob-identical. Its witness
    `tests/fn-param-name-reserved-keyword.test.ts` (44 cells) carries row
    `e14`, which 0153 retook to the two-element misfire list and which inverts
    on any repair here.
  - [0149](./0149-field-name-case-positions-unenforced.md) — **fixed
    (0.82.0)**, the case rule at the schema-field and `params:` positions,
    sharing two sites with 0153. Disjoint subject; its witness
    `tests/schema-field-name-case.test.ts` (46 cells) is a LOCK.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, the owner of the shared builder
    `reservedKeywordAsIdentifierDiagnostic`
    (`src/parser/theta-document.ts:6222`) that all five parser-leaf emissions
    call. Disjoint subject (TYPE slots); its witness
    `tests/reserved-keyword-type-position.test.ts` (42 cells) is a LOCK.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, holding citations in `contextualDiagnostics` (its
    `lexer.ts:873–874` names the `schema` / `enum` arm, at `:885–:886` at
    HEAD). Disjoint defect, same function; whichever lands second re-measures
    the other's rows.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) —
    **open**, holding `lexer.ts:842–849` (the `schema-case-mismatch` push in
    `checkName`, accurate at HEAD). Disjoint defect, same function; same
    rebase pairing.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Every citation here
    is symbol-named beside its line number and verified at HEAD `30c0cb67`.
- **Affected** (every citation verified against the tree at HEAD `30c0cb67`,
  v0.197.0 — `package.json:3`; symbol-named per bug 0134's adjudication):
  - **The misfiring recogniser** — `contextualDiagnostics`
    (`src/lexer/lexer.ts:810`, doc `:799–:809`), called once from `lexTheta`
    (`:125`). Its scope note (`:806–:808`) states the boundary it is written
    to: "full identifier-position coverage (every reserved word in every
    identifier slot) is a parser-leaf obligation; the lexer core enforces the
    positions its closed Tests obligations name."
    - `checkName` (`:814`), keyword arm `:819–:827`, pushing
      `theta/parse/reserved-keyword-as-identifier` ranged on `name.range`.
    - The three adjacency arms in the token walk: `let` (`:876–:882`, with the
      `mut` skip at `:878–:881`), `fn` (`:883–:884`), `schema` / `enum`
      (`:885–:886`).
    - The `controlHeads` set (`:812`) and its forward scan (`:889–:912`),
      pushing `theta/parse/single-line-if` at `:904–:910` ranged on `t.range`
      — the head token itself, which at these faces is the name.
    - The template-body suppression (`:863–:871`) is the only context
      distinction the function makes today.
  - **Blob-frozen by two shipped fixes.** `git hash-object src/lexer/lexer.ts`
    = `git rev-parse HEAD:src/lexer/lexer.ts` =
    `17f6e1d710ebe4b9c3350130aaa86585f9d4bd45`; bug 0148 §Fix and bug 0153
    §Fix (c) each assert that digest before and after, on the ground that
    bugs 0051 and 0135 hold citations in the file.
  - **The correct emissions the misfires accompany** — all six landed by 0153,
    none of them defective, listed because any repair must leave them
    unmoved:
    - `parseFor` (`src/parser/theta-document.ts:2380`), guard `:2420`,
      emission `:2421–:2423`; `parseParFor` (`:4902`), guard `:4930`,
      emission `:4931–:4933`; each carrying the `mut`-recovery discriminator
      (`:2418–:2419`, `:4928–:4929`).
    - `parseSchemaObjectBody` (`:2975`), field-NAME arm `:3047`, emission
      `:3060–:3062`; the name-admitting disjunction is `:2993`.
    - `parseEnumVariants` (`:3149`), arm `:3198`, emission `:3199–:3201`.
    - `parseImportExport` (`:3299`), SOURCE arm `:3350`, emission
      `:3351–:3353`; ALIAS arm `:3374`, emission `:3375–:3381`.
    - `extractParsedParams` (`src/parser/frontmatter.ts:726`), keyword arm
      `:778`, keyed on `RESERVED_KEYWORDS` (`:478`, `= reservedKeywords()`).
      This is the one face with no misfire (§Reproduction (E)) — it reads a
      YAML scalar key, so no token adjacency reaches it.
    - The shared builder `reservedKeywordAsIdentifierDiagnostic`
      (`src/parser/theta-document.ts:6222`).
  - **The registry rows the emissions contradict** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:21`
    (`theta/parse/reserved-keyword-as-identifier`, *Trigger* "Reserved keyword
    used in an identifier position", *Hint* "—") and `:23`
    (`theta/parse/single-line-if`, *Trigger* "`if` / `for` / `while` / `fn`
    body is not a braced block (e.g. `if (x) stmt`)", *Hint* "Wrap the body in
    `{ ... }`").
  - **The grammar the misfired tokens belong to** —
    `docs/reference/grammar.md:272` (`ForStmt ::= "for" Ident "in" Expr
    StmtBlock`), `:273` (`ParForExpr`), `:36–:37` (`ImportSpec` / `ExportSpec`
    `::= Ident ("as" Ident)?`), `docs/spec_topics/schemas.md:23` (the
    `as "WireName"` clause).
  - **Witnesses that pin the current behaviour** (all green at HEAD, 208
    cells): `tests/reserved-keyword-remaining-identifier-positions.test.ts`
    (76), `tests/fn-param-name-reserved-keyword.test.ts` (44),
    `tests/schema-field-name-case.test.ts` (46),
    `tests/reserved-keyword-type-position.test.ts` (42).
- **Observed at:** HEAD `30c0cb67`, v0.197.0 (`package.json:3`). Measured by
  scratch vitest probes through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the
  real `parseThetaDocument` over the real production parse deps.

## Summary

`contextualDiagnostics` in `src/lexer/lexer.ts` decides identifier positions by
looking at the token after `let`, `fn`, `schema` or `enum`, and decides
single-line bodies by looking for a `{` after `if`, `for`, `while` or `fn`.
Neither test knows what production the token sits in. When one of those eight
words is used as a NAME — a `for` variable, a schema field, an enum variant, an
import specifier — the scans fire against the wrong token: the grammar's `in`,
the grammar's `as`, or the name itself under a body rule with no body.

Bug 0153's fix (0.194.0) added the correct parser-leaf refusal at all six
positions and left these three faces standing under its §Fix (c) route (i),
pinning the resulting multi-diagnostic lists. This report's subject is the
misfires themselves. At HEAD every measured misfire arrives beside the correct
diagnostic, so no input is admitted that the spec refuses; the harm is a second
error naming a token the author wrote correctly, and — at the `single-line-if`
face — a wrong code carrying a hint the author cannot act on.

The partition is exact and narrow: at each of eight source shapes 4 to 7 of the
32 reserved spellings draw a misfire beside the correct refusal, 24 to 28 draw
the correct refusal alone, and the `params:` field-name face misfires for none
of the 32.

## Reproduction

Every row is one scratch-probe run's output verbatim: `parseDoc(src)` and
`doc.diagnostics` unfiltered, in emission order, rendered
`<severity> <code> @<line>:<col>-<line>:<col>: <message>`. All sources carry
the three-line prompt frontmatter `---\nmode: prompt\n---\n` unless the row
says otherwise, so body line 1 is source line 4.

### (A) The `in` face — the `for` and `par for` iteration variable

| # | source (body) | diagnostics |
|---|---|---|
| A1 | `let xs = [1]` + `for let in xs { 1 }` + `1` | `error theta/parse/reserved-keyword-as-identifier @5:5-5:8: reserved keyword 'let' cannot be used as an identifier`, `error theta/parse/reserved-keyword-as-identifier @5:9-5:11: reserved keyword 'in' cannot be used as an identifier` |
| A2 | same, `for fn in xs { 1 }` | `… @5:5-5:7: … 'fn' …`, `… @5:8-5:10: … 'in' …` |
| A3 | same, `for schema in xs { 1 }` | `… @5:5-5:11: … 'schema' …`, `… @5:12-5:14: … 'in' …` |
| A4 | same, `for enum in xs { 1 }` | `… @5:5-5:9: … 'enum' …`, `… @5:10-5:12: … 'in' …` |
| A5 | same, `par for let in xs { 1 }` | `… @5:9-5:12: … 'let' …`, `… @5:13-5:15: … 'in' …` |
| A6 | same, `for let in xs {` / `1` / `}` (braced over lines) | `… @5:5-5:8: … 'let' …`, `… @5:9-5:11: … 'in' …` |
| A7 | same, `for mut let in xs { 1 }` | `error theta/parse/mut-on-immutable-context @5:5-5:8: 'mut' is not permitted in this binding position`, `… @5:9-5:12: … 'let' …`, `… @5:13-5:15: … 'in' …` |
| A8 | `.thetalib`, `fn a(): number {` / `let xs = [1]` / `for let in xs { 1 }` / `1` / `}` | `… @3:5-3:8: … 'let' …`, `… @3:9-3:11: … 'in' …` |
| A9 | `let xs = [1]` + `for match in xs { 1 }` + `1` (non-head keyword) | `… @5:5-5:10: … 'match' …` — one diagnostic |
| A10 | `let xs = [1]` + `for return in xs { 1 }` + `1` (non-head keyword) | `… @5:5-5:11: … 'return' …` — one diagnostic |
| A11 | `let xs = [1]` + `for let xs { 1 }` + `1` (no `in`) | `… @5:5-5:8: … 'let' …` — one diagnostic |

A9–A11 isolate the mechanism: the misfire needs a dispatch head in the
variable slot (A9, A10) and an `in` at `k+1` (A11).

### (B) The `as` face — a wire-rename and an import/export alias clause

| # | source (body) | diagnostics |
|---|---|---|
| B1 | `schema S { let as "w": string }` + `1` | `… @4:12-4:15: … 'let' …`, `… @4:16-4:18: … 'as' …` |
| B2 | `import { let as x } from "./lib.thetalib"` + `1` | `… @4:10-4:13: … 'let' …`, `… @4:14-4:16: … 'as' …` |
| B3 | `export { let as x } from "./lib.thetalib"` + `1` | `… @4:10-4:13: … 'let' …`, `… @4:14-4:16: … 'as' …` |
| B4 | `schema S { schema as "w": string }` + `1` | `… @4:12-4:18: … 'schema' …`, `… @4:19-4:21: … 'as' …` |
| B5 | `import { fn as x } from "./lib.thetalib"` + `1` (both faces at once) | `error theta/parse/single-line-if @4:10-4:12: single-line body not permitted; wrap in { ... }`, `… @4:10-4:12: … 'fn' …`, `… @4:13-4:15: … 'as' …` — three diagnostics |

### (C) The `single-line-if` face — a name in `controlHeads`

| # | source (body) | diagnostics |
|---|---|---|
| C1 | `schema S { fn: string }` + `1` | `error theta/parse/single-line-if @4:12-4:14: single-line body not permitted; wrap in { ... }`, `… reserved-keyword-as-identifier @4:12-4:14: … 'fn' …` |
| C2 | `schema S { if: string }` + `1` | `single-line-if @4:12-4:14`, `reserved … 'if' @4:12-4:14` |
| C3 | `schema S { for: string }` + `1` | `single-line-if @4:12-4:15`, `reserved … 'for' @4:12-4:15` |
| C4 | `schema S { while: string }` + `1` | `single-line-if @4:12-4:17`, `reserved … 'while' @4:12-4:17` |
| C5 | `enum E { fn }` + `1` | `single-line-if @4:10-4:12`, `reserved … 'fn' @4:10-4:12` |
| C6 | `import { fn } from "./lib.thetalib"` + `1` | `single-line-if @4:10-4:12`, `reserved … 'fn' @4:10-4:12` |
| C7 | `import { a as fn } from "./lib.thetalib"` + `1` | `single-line-if @4:15-4:17`, `reserved … 'fn' @4:15-4:17` |
| C8 | `schema S { let: string }` + `1` (contrast, not in `controlHeads`) | `… 'let' @4:12-4:15` — one diagnostic |

Both diagnostics carry the identical range at every C row; the two codes differ
and only one names the rule the source breaks.

### (D) Controls — no legal input draws any of the three

Each reports `[]`: `for x in xs { 1 }`; `let r = par for y in ys max 2 { 1 }`;
`schema S { a as "w": string }`; `schema S { a as "let": string }` (a reserved
spelling as a WIRE name is legal — it is a string, not an identifier);
`schema S { a: string }`; `import { a } from "./lib.thetalib"`;
`import { a as b, c as d } from "./lib.thetalib"`; `fn g(): number { 1 }`;
`enum E { A, B }`; `let x: array<string> = []`. `schema S { "fn": string }`
reports `theta/parse/empty-schema-body` alone — the quoted key is not a field,
and no misfire attaches.

### (E) The partition over all 32 reserved spellings, at eight shapes

Each cell is the count of the 32 spellings of `docs/spec_topics/lexical.md:20`
(read from `reservedKeywords()`, `src/lexer/lexer.ts`) that draw the named
outcome, the spelling under test substituted into the shape.

| shape | correct refusal ALONE | misfiring spellings | outside both |
|---|---|---|---|
| `for <kw> in xs { 1 }` | 27 | 4 name `'in'`: `let`, `fn`, `schema`, `enum` | 1: `mut` draws `theta/parse/mut-on-immutable-context` alone |
| `par for <kw> in xs { 1 }` | 27 | 4 name `'in'`: `let`, `fn`, `schema`, `enum` | 1: `mut`, as above |
| `schema S { <kw>: string }` | 28 | 4 draw `single-line-if`: `fn`, `if`, `for`, `while` | 0 |
| `enum E { <kw> }` | 28 | 4 draw `single-line-if`: `fn`, `if`, `for`, `while` | 0 |
| `import { <kw> } from …` | 27 | 4 draw `single-line-if`: `fn`, `if`, `for`, `while` | 1: `as` draws `theta/parse/import-malformed-specifier-list` |
| `import { a as <kw> } from …` | 27 | 4 draw `single-line-if`: `fn`, `if`, `for`, `while` | 1: `as`, as above |
| `schema S { <kw> as "w": string }` | 25 | 4 name `'as'`: `let`, `schema`, `enum`, `fn`; 4 draw `single-line-if`: `fn`, `if`, `for`, `while` (`fn` in both, three diagnostics) | 0 |
| `import { <kw> as x } from …` | 24 | the same 4 + 4, `fn` in both | 1: `as`, as above |
| `params:` key `<kw>: string` | 32 | 0 | 0 |

The `params:` row is the control on the cause: that face reads a YAML scalar
key with no token stream, so no adjacency scan reaches it. The two `mut` cells
and the four `as` cells are pre-existing recoveries owned elsewhere — 0153's
`mut`-recovery discriminator and bugs 0100/0211's malformed-specifier-list
respectively — and are not this report's subject.

### (F) The committed corpus

`rg` over every committed `*.theta` / `*.thetalib` for `for (let|fn|schema|
enum) in`, for `(let|fn|schema|enum) as `, and for `{ (fn|if|for|while) [:,}]`
returns nothing. No shipped fixture reaches any of the three faces, so the fix
moves no corpus row and `tests/committed-fixture-parse-gate.test.ts` is
unaffected.

## Expected behaviour

1. `for let in xs { 1 }` reports the reserved-keyword refusal against `let` at
   `5:5-5:8` and nothing else. `in` is a `ForStmt` terminal
   (`grammar.md:272`), not an identifier position, so
   `code-registry-parse.md:21`'s *Trigger* does not hold of it.
2. `schema S { let as "w": string }`, `import { let as x }` and
   `export { let as x }` report the refusal against the NAME and nothing else.
   `as` is an `ImportSpec` / `ExportSpec` terminal (`grammar.md:36–37`) and the
   wire-rename keyword (`schemas.md:23`).
3. `schema S { fn: string }`, `enum E { fn }`, `import { fn }` and
   `import { a as fn }` report the refusal against the name and no
   `theta/parse/single-line-if`. That row's *Trigger* is a body that is not a
   braced block (`code-registry-parse.md:23`); a field name, a variant name
   and an import specifier have no body, and its *Hint* "Wrap the body in
   `{ ... }`" names an edit that does not apply.
4. Every row in §Reproduction (D) keeps `[]`, and the 28-of-32 columns of
   §Reproduction (E) keep the single correct refusal they draw today.
5. The genuine subjects of both misfiring codes are unmoved: `if (x) 1`,
   `for x in xs 1`, `fn f() 1` keep `theta/parse/single-line-if`, and a
   reserved spelling in a genuine identifier position keeps
   `theta/parse/reserved-keyword-as-identifier`.

## Actual behaviour / root cause

`contextualDiagnostics` (`src/lexer/lexer.ts:810`) runs over a flat token list
with one piece of context — a backtick toggle suppressing query-template bodies
(`:863–:871`). Everything else is adjacency.

**The `in` and `as` faces.** The walk fires `checkName(k+1)` whenever the token
at `k` is `let` (`:876`, past the `mut` skip), `fn` (`:883`), `schema` or
`enum` (`:885`). Those four words are dispatch HEADS, and each is also one of
the 32 reserved spellings, so a source that puts one of them in a NAME slot
puts a head where the scan expects a declarator. `for let in xs` gives `k` =
`let` and `k+1` = `in`; `schema S { let as "w": … }` and `import { let as x }`
give `k+1` = `as`. `checkName`'s keyword arm (`:819`) then reports the token it
was handed, which is the grammar's terminal. The arm is correct in isolation —
it fires at every position it is CALLED at; the defect is that the caller
computes the position by counting tokens.

**The `single-line-if` face.** The fourth scan (`:889`) asks a different
question of the same stream: for any token in `controlHeads` (`:812`), is there
a `{` before the next `stmt-sep`? A schema body, an enum body or an import
clause containing `fn`, `if`, `for` or `while` as a name has no `{` after that
word on the logical line, so `:903` finds `braced === false` and `:904–:910`
pushes `theta/parse/single-line-if` ranged on the name. Nothing in the scan
distinguishes a header from a name.

The function's own doc comment records the boundary it was written to
(`:806–:808`): identifier-position coverage is "a parser-leaf obligation", and
the lexer "enforces the positions its closed Tests obligations name". Bug
0153's fix discharged that obligation at all six remaining positions from
parser leaves (§Affected) and left this function untouched under its §Fix (c)
route (i) — deliberately, because bugs 0051 and 0135 hold citations in the file
and both fixes assert the blob digest. The result is the doubled and
misattributed output measured above: two enforcers answering the same source,
one from the grammar and one from adjacency.

## Why it matters

- **The `single-line-if` face states a rule the source does not break and
  prescribes an edit that does not apply.** `schema S { fn: string }` draws
  "single-line body not permitted; wrap in { ... }" against a field name; the
  registered *Hint* tells the author to add braces to a body that does not
  exist. The correct diagnostic sits beside it with a different code and the
  identical range, so the two are indistinguishable by location.
- **The two reserved-keyword faces accuse a correct token.** `for let in xs`
  reports that `in` "cannot be used as an identifier" when `in` is the
  grammar's own keyword in that production and the author had no alternative
  spelling. Deleting it does not clear the diagnostic; renaming the variable
  does.
- **The output is not a stable contract.** Four to seven of 32 spellings at
  eight shapes produce two or three diagnostics where the rest produce one,
  and 0153's
  witness pins each list as an ordered whole (`toEqual` over unfiltered
  `doc.diagnostics`), so any consumer reading the list — the
  `theta-system-note` renderer's multi-error block
  (`diagnostic-shape.md:63`), an LSP integration, a test — sees the doubling.
- **It is a registry-faithfulness defect, not only a UX one.** Both emissions
  fire outside their registered *Trigger*, which DIAG-2 makes a spec-level
  property of the row (`diagnostic-shape.md:72`).

## Non-goals

- Changing `theta/parse/single-line-if`'s or
  `theta/parse/reserved-keyword-as-identifier`'s registered *Trigger*,
  *Message*, *Hint* or severity. Both rows are correct as written; the
  emissions do not match them. DIAG-3 defers any rename to theta 2.0.
- Re-opening the six identifier positions bug 0153 closed. All six emissions
  stay, unchanged, ranged as they are today.
- The `mut`-recovery discriminator (`theta-document.ts:2418`, `:4928`) and its
  witness rows `m11`–`m14`. Correct at HEAD, measured unchanged (§Reproduction
  A7).
- Bug 0051's and bug 0135's own defects. This report moves lines in the file
  they cite; it does not fix or restate either subject.
- The `match`-binder position (bug 0141, fixed 0.146.0) and bug 0044's TYPE
  slots.

## Fix

Constraint-pinned, not settled. The route is an in-run adjudication between two
named alternatives, and both edit `src/lexer/lexer.ts`.

**Route A — contextual discrimination in `contextualDiagnostics`.** Teach the
three adjacency arms and the `controlHeads` scan enough context to tell a
declarator header from a name. The minimum discriminators the measurements
support: for the `in` / `as` faces, require the token at `k+1` to be
`ident`-kind before `checkName` reports it as a name, or require the token at
`k-1` not to be one of the openers that mark a name slot (`for`, `par for`,
`{`, `,`, `as`); for the `single-line-if` face, suppress the scan when the
`controlHeads` token itself sits at a name slot. Consequence: one function
serves both rules, the doubling disappears at every shape at once, and the 28
correct columns are untouched. Cost: `checkName`'s `ident` guard interacts with
the case rules bugs 0051 and 0135 own, so their rows must be re-measured in the
same run.

**Route B — per-face carve-outs.** Three narrow suppressions keyed on the
offending shape, leaving the scans' structure alone. Consequence: smaller
diff, each face independently revertible. Cost: three predicates instead of
one, no shared invariant, and the next name slot added to the grammar
reintroduces the class.

Route C — repairing this from the parser leaves, leaving the lexer
blob-identical — is refuted by the measurements: the misfiring diagnostics are
pushed by `contextualDiagnostics` before any parser leaf runs, and the parser
cannot withdraw them. This is what forced 0153 §Fix (c) to route (i).

Constraints on any route:

1. **Pinned bytes to move, and bytes not to.** The following rows pin the
   current misfire lists as ordered whole lists and MUST be retaken in place,
   not deleted or weakened:
   `tests/reserved-keyword-remaining-identifier-positions.test.ts` rows `m1`,
   `m6`, `m8`, `w1`, `w4`, `w7`, `x10` and the seven 32-spelling sweeps
   (including `s1`, which states the 27/4/1 partition at the `for` face); and
   `tests/fn-param-name-reserved-keyword.test.ts` row `e14`. Everything else in
   those two files, all of `tests/schema-field-name-case.test.ts` (bug 0149)
   and all of `tests/reserved-keyword-type-position.test.ts` (bug 0044) is a
   LOCK: 208 cells green at HEAD, and the count must be 208 green after.
2. **The lexer blob assertion is what changes.** Bugs 0148 and 0153 each assert
   `src/lexer/lexer.ts` = `17f6e1d710ebe4b9c3350130aaa86585f9d4bd45` before and
   after. This fix breaks that digest by design and must say so in its record.
   Bug 0051's `lexer.ts:873–874` and bug 0135's `lexer.ts:842–849` shift; both
   are open, both stay unedited under bug 0134's do-not-chase adjudication, and
   the record names the new positions so the next run re-derives.
3. **No registry change.** DIAG-2 is not engaged: no code is added, removed,
   re-namespaced or re-triggered. Both rows keep their *Trigger*, *Message*,
   *Hint* and severity verbatim; the fix makes the emissions match the rows
   that already exist.
4. **The genuine subjects must red on over-reach.** The witness carries
   must-not-move rows for real single-line bodies (`if (x) 1`, `for x in xs 1`,
   `while (x) 1`, `fn f() 1`) and for reserved spellings at genuine identifier
   positions, so a suppression that swallows either fails.
5. **Witness form.** Every assertion is a whole-list ordered `toEqual` over
   unfiltered `doc.diagnostics`, and every expected message is read from the
   registry through `parseRegistry` / `registryMessage` with the `<keyword>`
   slot filled (DIAG-4), matching the idiom of the file being retaken.
   Required cells: A1–A11, B1–B5, C1–C8, the controls of (D), the nine
   partition rows of (E) as ordered whole lists, and the `.thetalib` route
   (A8).
6. **No live cell is owed.** Every measured input is refused at severity `E`
   today and stays refused after; no registration outcome changes. Bug 0153's
   live cell
   (`tests/live/reserved-keyword-remaining-positions-live-cell.test.ts`)
   asserts registration denial at the `params:` and `for`-variable faces, which
   this fix leaves unmoved — it is a LOCK, and running it once is a check, not
   a new obligation.
7. **Corpus.** Zero committed fixtures reach any face (§Reproduction F), so no
   baseline entry and no fixture edit is owed;
   `tests/committed-fixture-parse-gate.test.ts` and
   `tests/registry-closed-set-corpus-gate.test.ts` stay green unchanged.

## Provenance

- **Origin:** bug 0153's fix report `.pi/tmp/fixes/0153-report.md` §Residuals
  item 1 — "**The three misfire faces are NOT repaired** (§Fix (c) route (i),
  taken deliberately) … All pinned as ordered whole lists (`m1`, `m6`, `m8`,
  `w1`–`w7`, retaken `e14`). Repair requires narrowing `src/lexer/lexer.ts`,
  which shifts open bugs 0051's and 0135's citations — unfiled, and a candidate
  follow-up report." Bug 0153's `## Fix (0.194.0)` record owns the disposition
  and is cited above.
- **Ownership check performed before any probe.** `rg -l` over `docs/bugs/`
  for `single-line-if` returns 0044, 0062, 0093, 0105, 0139, 0151, 0153, 0225;
  for `reserved-keyword-as-identifier`, the reserved-rule family 0044, 0148,
  0149, 0153, 0219. Every document whose subject is one of these two codes'
  emission sites is **fixed** — 0044 (0.54.0), 0093 (0.155.0), 0139 (0.79.0),
  0148 (0.81.0), 0149 (0.82.0), 0151 (0.163.0), 0153 (0.194.0), 0219 (0.156.0),
  0225 (0.168.0) — and 0062 is a grammar-table subject. The two open documents
  citing `src/lexer/lexer.ts`'s `contextualDiagnostics`, 0051 and 0135, claim
  the CASE rule at reference positions and the index sentinel respectively;
  neither claims a misfire face. No document claims this subject.
- **Re-measured at HEAD `30c0cb67` (v0.197.0), not copied.** The residual names
  three faces; the measurement states what each does. It adds rows the residual
  does not: the exact partition at eight shapes (§Reproduction E, 4 to 7 of 32
  at each token face and 0 of 32 at the `params:` face), the three-diagnostic
  compound at `import { fn as x }` (B5), the two non-head controls that isolate
  the mechanism (A9, A10), the ten legal-input controls (D), the legal
  reserved WIRE name `schema S { a as "let": string }`, and the empty corpus
  (F). One statement in 0153's §Reproduction (d) does not reproduce as written
  at HEAD: rows w4–w7 there list `theta/parse/single-line-if` alone, which was
  the pre-fix reading; at HEAD each carries the correct refusal beside it.
- **Measurement:** scratch vitest probes (filenames containing `scratch`),
  written, run and deleted. A case-insensitive sweep of `git status --short`
  and of `tests/` and `tests/live/` at exit reports no scratch file of this
  filing's in the tree; twelve `scratch-*` files belonging to concurrent
  sibling filings (0238, 0239, 0241 and three untagged) remain and are not
  this report's. Zero model turns, no provider contacted.
- **Lock counts taken at HEAD:** `npx vitest run
  tests/reserved-keyword-remaining-identifier-positions.test.ts
  tests/fn-param-name-reserved-keyword.test.ts
  tests/schema-field-name-case.test.ts` → `Tests 166 passed (166)`;
  `npx vitest run tests/reserved-keyword-type-position.test.ts` →
  `Tests 42 passed (42)`. Total 208.
- **Not verified end to end:** nothing in §Reproduction is inferred — every
  diagnostic cell is that run's output verbatim through the real
  `parseThetaDocument`. The live cell was not run (offline filing); its LOCK
  status is asserted from its content and from bug 0153's recorded green.
