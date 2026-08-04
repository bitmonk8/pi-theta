# Bug 0063 — Two `<construct>` values the parser emits — `stray '<t>' in statement position` (`theta-document.ts:1757`) and `schema fields must be comma-separated` (`:2598`) — are absent from the closed token-name table that `placeholder-rendering-a.md` §3 makes the whole rendering vocabulary of `theta/parse/unsupported-feature`, and the closed table predates both emission sites by two months at its current path

- **Status:** open. §Fix states two dispositions with the constraints that hold
  either way, and a recommendation; the choice is not made here.
- **Kind:** defect — a closed normative surface over-states the implementation,
  in two elements.
  1. *The rendering vocabulary is closed and does not contain the emitted
     values.* `placeholder-rendering-a.md:50` directs the renderer of
     `<construct>` to "Use the closed token-name table below", `:52–68` is that
     table (15 rows), and `:5` states that it "carr[ies] the same GOV-7 / GOV-8
     governance posture as the category-to-placeholder map itself". Two
     emission sites in `src/parser/theta-document.ts` render `<construct>`
     values that are in no row: `stray '<t>' in statement position` (`:1757`)
     and `schema fields must be comma-separated` (`:2598`). Both are reachable
     from ordinary source text (§Reproduction F1, F2).
  2. *The omission is not a drafting lag.* The closed table shipped on
     2026-05-06 (`61ea1a5e`, then `spec_topics/diagnostics.md`); both tails
     shipped on 2026-07-13 (`d23c22be`, then `src/parser/loom-document.ts`), by
     which date the table stood at its current path with the same 15 rows.
     The emissions were added against a closed table and the table was not
     amended with them.
- **Related:**
  [0042](./0042-schema-decl-same-line-residue-silent.md) — the filing origin.
  Its §Non-goals (`:368–379`) records this mismatch as "pre-existing at both
  emission sites and unfiled", and its §Fix (0.52.0) *Residuals* (iv)
  (`:514–517`) reads: "The `stray '<t>' in statement position` and `schema
  fields must be comma-separated` tails remain absent from
  `placeholder-rendering-a.md` §3's closed table (§Non-goals); this fix coined
  no third tail, choosing a new code instead." That fix registered
  `theta/parse/malformed-alias-rhs` rather than coin a third tail, and states
  why (`:406–409`): "`unsupported-feature` would need a third freeform tail in
  the closed `<construct>` table of `placeholder-rendering-a.md` §3, which is a
  GOV-7 / GOV-8 table edit that would also have to reconcile the two tails
  already emitted unlisted". This report holds that reconciliation.
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) — the
  same over-statement class, inverted. There a registered row carries a
  *Trigger* no input satisfies; here an emission the implementation produces is
  covered by no cell of a closed table. Both leave a reader of the closed
  surface unable to derive what the implementation reports.
  [0062](./0062-grammar-trailing-trigger-table-omits-equals.md) — the sibling
  filing from the same 0042 residual list (item (iii)), and the same class at a
  different table: `grammar.md`'s closed trailing-trigger table omits the bare
  `=` the lexer implements. Its §Fix is settled as a spec-side table edit that
  changes no implementation byte — the shape recommended below.
  [0036](./0036-missing-object-key-bare-key-rendering.md) — the precedent that a
  placeholder-category rule binds the emission site: its category-5 `<key>`
  divergence was fixed (0.41.0) by routing the one site through the conformant
  renderer, no spec amendment. That route is unavailable here: the conformant
  category-3 renderer takes a free string (§Affected), so it constrains nothing.
- **Affected** (every citation verified at HEAD `9c961f7f`, 0.52.0):
  - **The closed surface** —
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:43` (the §3
    heading), `:45` (the placeholder list: `<construct>` in
    `theta/parse/unsupported-feature`), `:50` (the rule sentence that closes the
    vocabulary), `:52–68` (the table: header, separator and 15 rows), `:70–73`
    (the test vectors), `:5` (the GOV-7 / GOV-8 posture sentence), `:7` (the
    §Closure paragraph over the eight categories).
  - **The registry row** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:27`
    (`theta/parse/unsupported-feature`, E, parse, *Message*
    `unsupported syntactic feature: <construct>`), mirrored at
    `docs/reference/diagnostics.md:73`. The reference corpus carries the row but
    no copy of the token table: `rg -n "token-name" docs/reference/` is empty,
    and `rg -n "arrow function" docs/reference/` returns only the prose list at
    `grammar.md:325–327`, which is a *Not supported* enumeration, not a
    rendering table. A row addition is therefore a single-page spec edit.
  - **Emission site 1** — `src/parser/theta-document.ts:1749–1761`, the
    no-progress arm of `parseForms` (`:1721`). `:1751` restricts the emission to
    a `punct` token; `:1757` is the interpolation
    `` `unsupported syntactic feature: stray '${stray.text}' in statement position` ``;
    `:1743–1748` is the rationale, citing `lexical.md` §"Statement terminators".
    The token text is spliced verbatim, and `src/lexer/lexer.ts:701–702` emits a
    `punct` token for any character no earlier lexer arm consumes, so the value
    of `<t>` is an open set (§Reproduction).
  - **Emission site 2** — `src/parser/theta-document.ts:2585–2601`, the comma
    rule of `parseSchemaObjectBody` (`:2522`, called once, from `:2364`).
    `:2589–2590` is the boundary test (an `ident` or `keyword` where a `,` is
    required); `:2597–2598` is the fixed string
    `unsupported syntactic feature: schema fields must be comma-separated`;
    `:2576–2584` is the rationale, quoting the grammar
    (`SchemaShape ::= "{" Field ("," Field)* ","? "}"`).
  - **The conformant renderer, unused and unconstraining** —
    `src/diagnostics/placeholder.ts:128–146`. `ConstructPlaceholder`'s
    `construct` arm declares `token: string` (`:133`), and `renderConstruct`
    (`:140–146`) returns it unchanged. `rg -n "renderConstruct" src/` returns
    one line — `:140`, the definition — so no production path routes through it,
    and the type admits any string. Both emission sites format their message
    inline instead.
  - **The pins that carry the current strings** (§Fix enumerates their
    disposition): `tests/schema-alias-rhs-malformed.test.ts:702` and `:1212`,
    which substitute each tail into the registry template through
    `registryMessage` (`:203–204`), with the comment at `:699–701` — "The
    `<construct>` tail is rendered by the emission site, not by the closed
    placeholder table (bug doc §Non-goals)";
    `tests/schema-alias-union-decl.test.ts:2406` (the literal string);
    `tests/fix1-parser-structural.test.ts:10–25` (code plus field recovery, no
    string assertion).
  - **The governing rules** —
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, the closed
    registry), `:74` (DIAG-4, the *Message* column normative, renderers emit it
    "character-for-character with placeholders interpolated");
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
    whose observable-(c) normalisation list names "the category-8 host-derived
    freeform tails" and no category-3 rendering), `:9` (the loads-cleanly
    predicate), `:25` (the diagnostic-registry carve-out).
- **Observed at:** `0.52.0` (`9c961f7f`). Offline, deterministic, no live model:
  scratch vitest driving `parseThetaDocument` through `tests/helpers/e2e-s1.ts`
  (the shipped front end with inert seams) over the fixtures below, reading
  `doc.diagnostics`, `doc.body.statements` and each `SchemaDecl`'s `fields`;
  written, run, deleted. Supporting evidence from `rg` over `src/`, `tests/`,
  `docs/` and from read-only `git log`.

## Summary

`placeholder-rendering-a.md` §3 gives `<construct>` one rendering rule: use the
closed token-name table. The table has 15 rows, all naming deferred or
non-Theta constructs (`arrow function`, `spread`, `typeof`, `bitwise <op>`, …).

The parser emits two `<construct>` values that are in no row:

- `stray '<t>' in statement position`, from the statement loop's no-progress arm
  (`theta-document.ts:1757`), where `<t>` is the offending punctuation token
  spliced verbatim;
- `schema fields must be comma-separated`, from the object-body comma rule
  (`:2598`).

Both fire on ordinary input — a line beginning with `|`, and a schema body whose
fields are separated by newlines instead of commas — and both are
error-severity, so those files are outside GOV-15's loads-cleanly set
(`source-language-stability.md:9`). The rendered strings are already frozen:
DIAG-4 makes the *Message* column normative, GOV-15 binds category-3 renderings
byte-identically (its normalisation list covers only category-8 tails), three
test cells in two files assert on the strings themselves, and a fourth asserts
the code.

The table is not stale relative to the code by accident of ordering. It shipped
on 2026-05-06 with these 15 rows; both emissions shipped on 2026-07-13.

## Reproduction

All fixtures share the four-line frontmatter prelude below, so body line 1 is
file line 5. Driven through `parseDoc` (`tests/helpers/e2e-s1.ts`) at HEAD
`9c961f7f`; output transcribed verbatim.

```text
---
description: probe
mode: subagent
---
```

**F1 — a punctuation token in statement position.** Body: `| 1`

```text
error theta/parse/unsupported-feature: unsupported syntactic feature: stray '|' in statement position @5:1-5:2
stmts []
```

**F2 — a schema body whose fields are newline-separated.** Body:

```text
schema S {
  a: string
  b: integer
}
let x = 1
```

```text
error theta/parse/unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated @7:3-7:4
stmts ["schema:S","let:x"]
fields ["a: string","b: integer"]
```

**F3 — the same defect on one line.** Body: `schema S { a: string b: integer }`
plus `let x = 1`

```text
error theta/parse/unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated @5:22-5:23
stmts ["schema:S","let:x"]
fields ["a: string","b: integer"]
```

**F4 — control, the comma present.** Body: the F2 body with a `,` after
`a: string`

```text
stmts ["schema:S","let:x"]
fields ["a: string","b: integer"]
```

Both fields survive in F2 and F3, as `:2583–2584` intends; the diagnostic is the
whole of the disposition.

**The `<t>` parameter is an open set.** 37 spellings were probed in statement
position; 26 distinct `<t>` values were rendered:

| Probed | Rendered `<t>` |
|---|---|
| `\|` `&` `)` `}` `]` `,` `:` `=` `>` `<` `*` `/` `%` `+` `.` `?` `^` `~` `#` `$` | the character itself |
| `==` `!=` `<=` `>=` `&&` `\|\|` | the two-character token itself |
| `=>` `?.` `??` `===` `!==` `<<` `>>` `++` `...` | decomposed into two or three emissions over the tokens the lexer produces (`=>` → `stray '='` + `stray '>'`) |
| `--` | none — `-- 1` parses as double negation |
| `\` | `theta/parse/stray-backslash` instead (`code-registry-parse.md:16`) |

`<t>` is not restricted to ASCII or to the grammar's operator set:
`§ 1`, `€ 1` and `± 1` each render `stray '§'` / `stray '€'` / `stray '±'`, and
`😀 1` renders **two** diagnostics whose `<t>` values are the input's unpaired
UTF-16 surrogates. `src/lexer/lexer.ts:701–702` is why: any character reaching
that line becomes a `punct` token carrying its own text.

**Table membership at HEAD** (`placeholder-rendering-a.md:54–68`, 15 rows, in
file order): `arrow function`, `spread`, `optional chaining`,
`nullish coalescing`, `strict equality`, `bitwise <op>`, `comma operator`,
`nested template`, `new`, `typeof`, `instanceof`, `delete`, `void`, `yield`,
`await`. One row is already parametrised — `bitwise <op>` carries the inline
gloss "where `<op>` is the source token verbatim" (`:59`).

**Emission-site census.** `rg -n 'code: "theta/parse/unsupported-feature"' src/`
returns 11 sites; their `<construct>` values are:

| Site | `<construct>` rendered | In the table |
|---|---|---|
| `theta-document.ts:1757` | `stray '<t>' in statement position` | no — **subject** |
| `theta-document.ts:2598` | `schema fields must be comma-separated` | no — **subject** |
| `lexer.ts:613` | the offending numeric text verbatim (`0x1F`, `1_000`) | no |
| `lexer.ts:687` | `';' (semicolons are not part of the grammar)` | no |
| `theta-document.ts:2147` | `fn parameter list must be parenthesised` | no |
| `theta-document.ts:3200` | `ternary '?' without ':' after its consequent` | no |
| `theta-document.ts:4198` | `dynamic invoke path (runtime-computed)` | no |
| `theta-document.ts:4303` | `backtick template in value position (query templates must be @-prefixed)` | no |
| `theta-document.ts:6344` | `match` / `@-query template` + ` inside ${...} interpolation` | no |
| `theta-document.ts:6359` | the same tail via the AST walk | no |
| `schema-subset-gate.ts:77` | the rejected JSON-Schema keyword verbatim | no |

No site produces any of the 15 cells. The other nine tails are outside this
report's subject (§Non-goals); they are recorded here because they bound the
class and because a fix shaped as a general rule discharges them too.

**Corpus census of the two strings.** At HEAD, `rg --fixed-strings "stray '"
docs/spec_topics/` is empty and
`rg --fixed-strings "schema fields must be comma-separated" docs/` matches only
[0042](./0042-schema-decl-same-line-residue-silent.md) (`:164`, `:373`, `:564`).
`rg --fixed-strings "in statement position" docs/spec_topics/` matches
`code-registry-parse.md:87` and `schemas.md:62` — both landed by 0042's fix and
both describe a *statement disposition* ("keeps the disposition it already had
in statement position"), not a rendered `<construct>` value. Neither tail exists
anywhere in the spec corpus as a rendering.

**History.** Read-only `git log`:

| When | Commit | What |
|---|---|---|
| 2026-05-06 | `61ea1a5e` | §3, its rule sentence and the 15-row closed table land in `spec_topics/diagnostics.md`, together with the sentence giving the table the registry's own governance posture |
| 2026-06-04 | `f5e89f4f` | the size-cap shard moves §3 to `docs/spec_topics/diagnostics/placeholder-rendering-a.md` |
| 2026-07-13 | `d23c22be` | both emission sites land in `src/parser/loom-document.ts` (`git show d23c22be -- src/` carries both message lines) |

`git show d23c22be:docs/spec_topics/diagnostics/placeholder-rendering-a.md`
contains the closed table with the same 15 rows, so the table was in force at
its current path when the two tails were written. `git log -G "stray '" -- src/`
returns two commits: `d23c22be` (introduction) and `9c961f7f` (0042's fix, which
touched the doc comment at `:1570` only, not the message).

## Expected behaviour

- §3 admits exactly one rendering rule for `<construct>`: "Use the closed
  token-name table below" (`placeholder-rendering-a.md:50`). A value that is in
  no row is not a rendering the rule produces.
- The table is normative, not indicative. `:5` puts it under the same GOV-7 /
  GOV-8 posture as the category-to-placeholder map, and `:7` classifies changes
  to the placeholder surface as spec-versioned breaking changes. A closed
  surface that the implementation steps outside of is either wrong about its
  extent or wrong about being closed.
- DIAG-4 (`diagnostic-shape.md:74`) makes the *Message* column normative and
  requires tests to source expected strings from it. A test can source the frame
  `unsupported syntactic feature: <construct>` and nothing else; the value it
  must substitute is what §3 owns. `tests/schema-alias-rhs-malformed.test.ts:702`
  and `:1212` do exactly that and supply the tail from the emission site, which
  its own comment records (`:699–701`).
- GOV-15 (`source-language-stability.md:5`) binds observable (c) byte-identically
  except for the sub-fields its normalisation list names — per-invocation
  identifiers, wall-clock-derived values, and "the category-8 host-derived
  freeform tails". Category 3 is not on that list, so both rendered strings are
  frozen bytes for the lifetime of theta 1.x, whether or not the table names
  them.
- The two constructs at issue are within reach of a rule. `<t>` needs a
  parametrised cell of the kind `bitwise <op>` already uses (`:59`); the
  comma-separator message is a fixed string.

## Actual behaviour / root cause

1. **Both sites format the message inline.** `:1757` builds the string by
   template interpolation and `:2597–2598` by a literal; neither consults the
   table, and no code path can. The conformant renderer
   (`placeholder.ts:140–146`) takes `token: string` and returns it unchanged, so
   the closed vocabulary has no representation in the implementation — the
   contrast with category 5, where `renderSourceDerived` implements the quoting
   predicate the rule states and 0036's fix routed the site through it.
   `renderConstruct` has no production caller either
   (`rg -n "renderConstruct" src/` → one line).
2. **The registered code is the general escape hatch, and its own comments say
   so.** `theta-document.ts:3191–3193`, at the ternary site: "Reuses the closed
   registry's unsupported-feature code (DIAG-2: the registry is closed; a new
   code is a spec change)." The comment states the trade: the code is already
   registered, so a new parse-time refusal lands on it with no registry edit.
   §3's closure is the constraint that trade crosses, and it sits on a
   different page from the registry and is not restated on the row —
   `code-registry-parse.md:27` names only "A theta 1.0-deferred or non-Theta
   syntactic construct … appears in source" and points at
   [Expressions — Not supported](../spec_topics/expressions.md), not at §3.
3. **Nothing in the tree tests a `<construct>` value against the table.**
   `tests/placeholder-rendering.test.ts:93–97` is the only category-3 test; it
   asserts that `renderConstruct` echoes the token it is handed
   (`"arrow function"` → `arrow function`), which holds for any string. No
   test or tool compares an emitted value to the table.
4. **No emission and no cell meet.** The census above shows 11 emission sites
   and zero of the 15 cells produced. This report's subject is the pair 0042
   named; the unemitted cells are §Non-goals.

Root cause: the table was closed on a page the emitting code neither reads nor
is checked against, and each subsequent parse-time refusal reused
`theta/parse/unsupported-feature`, whose registration was already in place,
supplying a tail written for the site rather than drawn from §3.

## Why it matters

- **A closed surface that over-states the implementation cannot be read as
  closed.** DIAG-1 entitles tests to assert on the emission at every documented
  site, and DIAG-4 makes the rendered string normative. An author, a test writer
  or a second implementation deriving the emitted string for F1 or F2 from §3
  derives nothing — the rule points at a table with no applicable row.
- **A second implementation cannot derive these two strings.** §3 exists so that
  "two conformant implementations produce byte-identical strings … for the same
  source defect" (`:5`). For F1 and F2 the byte sequences are pinned by this
  implementation and by three test cells in two files, and are recoverable from
  neither the registry row nor §3.
- **Both inputs are ordinary.** A newline-separated schema body (F2) is the
  shape the comma rule exists to catch — its own comment calls the alternative
  "silent data-shape corruption" (`:2578–2579`) — and a stray punctuation token
  (F1) is what every severed-residue path in the parser lands on; three bug
  documents quote it as observed behaviour
  ([0015](./0015-postfix-question-swallows-keyword-free-ternary-stmt.md) `:94`,
  [0033](./0033-body-level-schema-alias-unsupported.md) `:286–287`,
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)
  `:310–311`).
- **The mismatch has already deflected a fix.** 0042 refused
  `theta/parse/unsupported-feature` for the malformed alias right-hand side
  partly because a third tail would need this table edit (`:406–409`), and took
  a new registered code instead. The next site facing the same choice faces it
  with the same unresolved surface.
- **The two strings are GOV-15-frozen either way.** Category-3 renderings are
  outside GOV-15's normalisation list, so the bytes are already promised for
  theta 1.x. The spec either describes them or contradicts them; leaving them
  undescribed does not keep the option open.

## Fix

Not yet decided. The question is whether the closed table acquires the two
values the implementation renders, or the two sites stop rendering
`<construct>` values at all. The constraints below hold either way.

**Constraint 1 — the two sites are one surface, not two.** Any disposition
covers both `:1757` and `:2598` in the same commit. Fixing one leaves §3 in the
same state for the other, and 0042's residual names them as a pair.

**Constraint 2 — `<t>` is unbounded and must be described by a rule, not
enumerated.** `lexer.ts:701–702` makes the token text an open set over
characters (§Reproduction: `§`, `€`, `±`, and unpaired surrogates from an astral
character). A cell that lists tokens is wrong on arrival; a parametrised cell in
the shape of `bitwise <op>` (`:59`, "where `<op>` is the source token verbatim")
is the form that holds.

**Constraint 3 — no rendered byte moves under a spec-only edit, and every
rendered byte moves under a re-route.** GOV-15 binds category-3 renderings
byte-identically (`source-language-stability.md:5`). Adding rows changes no
observable; changing the emitted code or message changes observables (b) and (c)
for every input in §Reproduction, which puts the change under the
diagnostic-registry carve-out (`:25`) as an addition for the new code and a
removal for `unsupported-feature` on those inputs — the disposition 0042 used.

**Constraint 4 — the pins are rewritten in place, never deleted.** The cells
that carry the current strings are
`tests/schema-alias-rhs-malformed.test.ts:702` (`stray '|' …`, with the
explanatory comment `:699–701`) and `:1212` (`schema fields …`),
`tests/schema-alias-union-decl.test.ts:2406` (`stray '|' …`, a literal), and
`tests/fix1-parser-structural.test.ts:11–25` (code plus the two-field recovery,
no string assertion). Under disposition 1 the first two stop being an exception
to DIAG-4 and their comment is rewritten to cite the table; under disposition 2
all four move — the three string cells to the new codes' *Message* columns, the
fourth to the new code. Neither outcome may be reached by deleting a cell, and `tests/fix1-parser-structural.test.ts`'s field-recovery assertion
(`:21–24`) stays as the pin that the diagnostic is the whole disposition.

**Disposition 1 — add two rows to the closed table (recommended).** A
same-commit spec edit at `placeholder-rendering-a.md:52–68` that legitimises
existing emissions:

- *Row A.* Construct: a punctuation token in statement position that begins no
  statement or expression form. Token name: `stray '<t>' in statement position`,
  with the inline gloss "where `<t>` is the source token verbatim", mirroring
  `bitwise <op>`. The row states the `punct`-only restriction (`:1751`), since
  an `ident` / `keyword` / literal in the same position starts a form and is
  silent.
- *Row B.* Construct: a schema object body whose fields are not comma-separated.
  Token name: `schema fields must be comma-separated`. Fixed string, no
  parameter.
- *What else moves.* Nothing. `docs/reference/` has no copy of the table
  (`rg -n "token-name" docs/reference/` empty), the registry row's *Message* is
  unchanged so DIAG-4 is not engaged (`diagnostic-shape.md:74` defers rewording
  to theta 2.0 — this is not a rewording), DIAG-2 is not engaged (no code is
  added, removed, renamed or re-triggered), and GOV-15 sees no observable move.
  The edit is governed by the GOV-7 / GOV-8 posture `:5` assigns the table; §3
  carries no `**DIAG-N.**` paragraph of its own (`rg -n "DIAG-" ` on the page is
  empty), so there is no REQ-ID to retire and re-add.
- *The cost, stated.* Row A widens the table's subject. The existing 15 rows and
  the §3 lead-in describe *node categories* ("the offending site is a whole node
  category with no single source-span anchor", `:50`); rows A and B describe
  well-formedness violations of Theta constructs. The lead-in moves with them or
  the table's own description becomes false.
- *Witness.* Offline, at the `parseThetaDocument` boundary: F1 across a
  table-driven set of `<t>` values, F2 and F3, F4 as the byte-unchanged control,
  each expected string composed from the registry template through
  `registryMessage` with the tail substituted from the §3 row rather than from
  prose — which is what makes the two existing cells conformant rather than
  excepted.

**Disposition 2 — re-route both emissions to new registered codes.** The 0042
model: `theta/parse/malformed-alias-rhs` was registered rather than a third tail
coined. Two new rows in `code-registry-parse.md` (no existing row fits — the 108
`theta/parse/*` codes carry no stray-token or missing-separator row; the only
"stray" row is `theta/parse/stray-backslash`, `:16`, scoped to a backslash byte),
mirrored in `docs/reference/diagnostics.md`, plus the owning normative sentence
for each — `lexical.md:22` §"Statement terminators" for the first, `schemas.md:17`
("Fields are comma-separated; the trailing comma is optional") for the second —
and their `docs/reference/` mirrors. Each site's `code` and `message` change;
`severity`, `range` and every other observable stay as they are. DIAG-2 covers
the additions; the removal of `unsupported-feature` from these inputs is the
same carve-out arm read in reverse (`source-language-stability.md:25`). The
`<construct>` table is untouched and both tails disappear from the emitted
vocabulary. The cost: two more rows in a registry already at 108 parse codes,
four test files to rewrite, and the class is unchanged — the other nine tails in
§Reproduction's census remain outside the table.

**Recommendation: disposition 1.** Three verified facts favour it. The strings
are already frozen by GOV-15 and pinned by three test cells in two files, so the
spec-only edit is the disposition that changes nothing an author observes, while
the re-route changes what every F1-shaped and F2-shaped input reports. The table
already carries the parametrised-cell form constraint 2 needs (`bitwise <op>`,
`:59`), so row A needs no new device. And the two sites do not present the
question DIAG-2 governs: the code they emit is registered, at the severity and
phase its row states; what is unregistered is the tail, which §3 owns.

**Verification either disposition records.** Re-run §Reproduction's fixture set
and the emission-site census (`rg -n 'code: "theta/parse/unsupported-feature"'
src/` → the count and the per-site tail); confirm the two subject rows of that
table are answered and that the other nine are unchanged; default suite,
`npm run lint` and `npm run typecheck` green. Under disposition 2, additionally
confirm that no committed `.theta` / `.thetalib` fixture emits either new code
before deciding whether `tests/fixtures/h7a/permitted-codes.json` needs amending
— 0042's fix report records that H9a's gate does score `theta/parse/*` codes
(bug [0047](./0047-h9a-code-gate-blind-to-host-namespace.md)).

## Non-goals

- **The other nine `<construct>` tails.** §Reproduction's census lists them with
  their sites. They are the same class and are unfiled; this report's subject is
  the pair 0042 named, and neither disposition discharges them unless it lands as
  a general rule. Recorded here to bound the class, not to file it.
- **The 15 table cells and the §3 test vector.** No emission site produces any
  listed token name, and §3's own vector fails: `let f = (x) => x + 1`
  (`:72`, "renders `unsupported syntactic feature: arrow function`") in fact
  renders four diagnostics — `unknown identifier 'x'` @5:10, `stray '='` @5:13,
  `stray '>'` @5:14, `unknown identifier 'x'` @5:16 — with statements
  `["let:f","expr"]`. That is
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s
  class — a normative claim no input satisfies — at a different surface. It
  needs its own adjudication over which of the 15 constructs theta detects as
  such, and adding rows A and B does not touch it.
- **`renderConstruct`'s absent production caller.** The category-3 renderer is
  exported, unit-tested and unreached
  ([0036](./0036-missing-object-key-bare-key-rendering.md)'s shape). Wiring it
  would require the emission sites to hand it a token, which is the same edit as
  disposition 1's row A plus a refactor; whether the placeholder module should
  own a closed `<construct>` union is a design question this report does not
  settle.
- **The general same-line statement permissiveness.** F1's emission fires only
  because a `punct` starts no form; `42 43` and `Cat Cat` load clean. That class
  is 0042's §Non-goal (`:339–346`) and is unchanged here.
- **The lexer's astral-character handling.** `😀 1` produces two diagnostics
  carrying unpaired UTF-16 surrogates. It is cited only as evidence that `<t>`
  is unbounded; whether the lexer should reject or combine surrogate pairs is a
  separate question against `lexical.md` §Encoding.
- **Rewording either tail.** Both strings are DIAG-4-normative once described,
  and a reword is deferred to theta 2.0 (`diagnostic-shape.md:74`). Disposition
  1 transcribes them byte-for-byte; disposition 2 replaces them with new rows'
  *Message* columns rather than editing them in place.

## Provenance

- **Origin:** the bug 0042 fix (commit `9c961f7f`, 0.52.0). Recorded three
  times as flagged-not-filed: `.pi/tmp/fixes/0042-report.md` §Residuals item 4 —
  "The two freeform `unsupported-feature` tails in this area remain absent from
  `placeholder-rendering-a.md` §3's closed `<construct>` table
  (`stray '<t>' in statement position`, `schema fields must be comma-separated`)
  — the bug doc's §Non-goals records this. This fix coined no third tail; it
  took a new code precisely to avoid the table edit. **Unfiled,
  pre-existing.**" — and in the shipped document at
  [0042](./0042-schema-decl-same-line-residue-silent.md) §Non-goals (`:368–379`)
  and §Fix (0.52.0) *Residuals* (iv) (`:514–517`). This report is that filing;
  items (i) and (iii) of the same list are filed as
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) and
  [0062](./0062-grammar-trailing-trigger-table-omits-equals.md).
- **The closed surface:**
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5` (the GOV-7 / GOV-8
  posture of the category-3 table), `:7` (§Closure over the eight categories),
  `:43` (the §3 heading), `:45` (the placeholder list), `:50` (the rule
  sentence), `:52–68` (the table), `:59` (the parametrised `bitwise <op>` cell),
  `:70–73` (the test vectors); `placeholder-rendering-b.md:82–92` (§8's
  host-derived freeform-tail rule and the `<failure>` carve-out, the two places
  the corpus admits a non-tabulated tail — neither covers a
  theta-internally-constructed category-3 value).
- **The registry and its rules:**
  `docs/spec_topics/diagnostics/code-registry-parse.md:27` (the row), `:16`
  (`theta/parse/stray-backslash`), `:87` (`theta/parse/malformed-alias-rhs`, the
  row 0042 landed); `docs/spec_topics/diagnostics/diagnostic-shape.md:71`
  (DIAG-1), `:72` (DIAG-2), `:74` (DIAG-4); mirrors at
  `docs/reference/diagnostics.md:36–42` (the rules) and `:73` (the row).
- **The owning prose for the two defects:** `docs/spec_topics/lexical.md:22`
  (§"Statement terminators" — "statements are separated by newlines; semicolons
  are not part of the grammar"), cited by the emission site's own comment;
  `docs/spec_topics/schemas.md:17` ("Fields are comma-separated; the trailing
  comma is optional"), and the grammar production quoted at
  `theta-document.ts:2576`.
- **The implementation:** `src/parser/theta-document.ts:1721` (`parseForms`),
  `:1743–1748` (the rationale), `:1749–1761` (the no-progress arm), `:1757` (the
  message), `:1570` (0042's doc-comment description of the tail); `:2364` (the
  single call), `:2522` (`parseSchemaObjectBody`), `:2576–2584` (the rationale),
  `:2585–2601` (the comma rule), `:2597–2598` (the message); `:3191–3193` (the
  DIAG-2 escape-hatch comment); `src/lexer/lexer.ts:610–614`, `:683–688`,
  `:701–702`; `src/parser/schema-subset-gate.ts:70–78`;
  `src/diagnostics/placeholder.ts:128–146`.
- **The pins:** `tests/schema-alias-rhs-malformed.test.ts:203–204` (the
  `registryMessage` helper), `:699–701` (the comment recording the exception),
  `:702`, `:1212`; `tests/schema-alias-union-decl.test.ts:2406`;
  `tests/fix1-parser-structural.test.ts:10–25`;
  `tests/placeholder-rendering.test.ts:90–97` (the only category-3 test).
- **Governance:** `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15 and its normalisation list), `:9` (loads-cleanly), `:25` (the
  diagnostic-registry carve-out);
  `docs/spec_topics/governance/req-id-prefix-table-active-b.md:35` (GOV-7),
  `:49–61` (GOV-8, including the *Pure rewording* boundary);
  `docs/spec_topics/governance/req-id-prefix-table-active-a.md:69` (the
  `diagnostics/` → `DIAG` prefix row).
- **History:** `git log --format="%h %ad %s" --date=short -G "stray '" -- src/`
  (two commits: `d23c22be` 2026-07-13, `9c961f7f` 2026-08-02);
  `git log -S "schema fields must be comma-separated" -- src/` (`d23c22be`);
  `git show 61ea1a5e -- spec_topics/diagnostics.md` (2026-05-06 — the diff that
  adds §3, its rule sentence, the 15-row table and the sentence giving the table
  the registry's governance posture) and `git show --stat f5e89f4f` (2026-06-04
  — the shard that creates `placeholder-rendering-a.md`);
  `git show d23c22be:docs/spec_topics/diagnostics/placeholder-rendering-a.md`
  (the table, with its 15 rows, in force at the emissions' commit).
- **Verification at HEAD `9c961f7f` (0.52.0):** every citation above read from
  the tree; the emission-site census run as
  `rg -n 'code: "theta/parse/unsupported-feature"' src/`; the corpus census run
  as `rg --fixed-strings "stray '" docs/spec_topics/`,
  `rg --fixed-strings "in statement position" docs/spec_topics/` and
  `rg --fixed-strings "schema fields must be comma-separated" docs/`;
  `rg -n "renderConstruct" src/` and `rg -n "token-name" docs/reference/` both
  run and reported. Two scratch vitest files written under `tests/` (the first
  rewritten between runs), run, transcribed verbatim into §Reproduction, and
  deleted; no other file in the tree was written.

## Coordination note — bug 0084 landed (0.71.0)

Element 1's first emission site is the `parseForms` stray-punctuation recovery in
`src/parser/theta-document.ts`, whose `stray '<t>' in statement position` tail
this report holds the reconciliation for. Bug
[0084](./0084-increment-decrement-check-dead.md)'s fix (0.71.0) changes that
tail's *population*, not its presence: the byte-adjacent `++` / `--` pair is now
lexed as one token and consumed at the expression walk
(`parseUnary` / `parsePostfix`) by `checkIncrementDecrement`, so it never reaches
that recovery. Before 0.71.0 a statement-position `c++` rendered
`stray '+' in statement position` from that site — §Reproduction F1's own shape
with `+` as `<t>`; from 0.71.0 it draws `theta/parse/increment-decrement`
instead, and neither `'++'` nor `'--'` can ever appear as this tail's `<t>`.

This report's own defect is untouched. The tail is still emitted, still absent
from `placeholder-rendering-a.md` §3's closed table, and still reachable from
ordinary source text — §Reproduction F1's *fixture* is what needs re-deriving,
not its finding. 0084 settles nothing about what the construct row should say;
it records only that `++` no longer belongs in that row's population. Whichever
disposition is taken here, the set of `<t>` values the site can render is now
one entry smaller on the `+`-from-`++` route.
