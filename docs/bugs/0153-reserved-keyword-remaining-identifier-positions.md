# Bug 0153 — `docs/spec_topics/lexical.md:20` makes any of 32 reserved spellings "in identifier position" `theta/parse/reserved-keyword-as-identifier` and the registered *Trigger* (`code-registry-parse.md:21`) names no position at all, but bug 0148's fix (0.81.0) closed the `fn` parameter name only, so `for string in xs`, `par for string in xs`, `schema S { let: string }`, a `params:` field `let: string`, `enum E { let }`, `import { let }` and `import { a as let }` each report `[]`, bind the keyword verbatim into the AST — and, at the `params:` face, into the lowered JSON Schema's `properties` and `required` — and register, while at the same `for` position four of the 32 spellings do fire and name the WRONG token: `for let in xs { 1 }` draws the code against `'in'` @5:9-5:11

- **Status:** open. Residual 2 of the bug 0148 fix (0.81.0, `751fa708`),
  recorded in that fix's report (`.pi/tmp/fixes/0148-report.md` §Residuals 2
  and 4) and in 0148's own `## Fix (0.81.0)` record, §Fix (b) items 1, 2, 3, 5
  and 6, each dispositioned **OUT** and pinned by an over-reach tripwire row.
  §Fix is constraint-pinned, not settled: the emission site per position, the
  predicate shape at the `params:` face (which has no token), and the
  disposition of the three misfire faces are left to the run with their
  consequences enumerated. Ordering: nothing blocks this report from starting.
  Two of the six positions collide with open
  [0149](./0149-field-name-case-positions-unenforced.md), which is being fixed
  concurrently under the OTHER rule at the SAME two sites — whichever lands
  second at the schema-field-name or `params:`-field-name position rebases its
  witness rows. Seven tripwire cells bug 0148 shipped
  (`tests/fn-param-name-reserved-keyword.test.ts` rows `e4`, `e4p`, `e5`, `e6`,
  `e8`, `e9a`, `e9b`) red by construction on any fix here and must be retaken,
  not worked around; row `e14` reds on any repair of the misfire face.
- **Sev/Diff estimate:** S1/D3 — S1 on the letter bug 0148 was scored on, at
  six positions instead of one: `lexical.md:20`'s sentence carries no scope
  list and the registered *Trigger* names no position, so each measured row in
  §Reproduction (a) is an input the spec refuses that emits no diagnostic,
  passes `hasLoadParseError` and registers ("inputs accepted that the spec
  refuses … with no diagnostic, declared constraints not enforced"). The harm
  is wider than 0148's at one face and narrower at another, both measured.
  Wider: a `params:` field named `let` reaches the lowered JSON Schema handed
  to the binder and the provider as a property key
  (`properties.let`, `required: ["let"]`, `wireName: "let"` — row L1), and a
  body that reads its own declared param draws a wrong code with a mangled
  message (`theta/parse/let-without-initialiser`, `let binding '\n' has no
  initialiser` — row d3); a `schema` declared with a keyword field name cannot
  be constructed, and the attempt draws two wrong-subject diagnostics (row d5).
  Narrower: the `import` specifier's SOURCE slot can never resolve, because no
  `.thetalib` can export a keyword-spelled symbol — `fn let()`, `schema let`
  and `enum let` are each refused at `E` today (rows x1–x3) — so that half is
  grammatically reachable but semantically dead; the ALIAS slot
  (`import { a as let }`) is fully reachable and binds a keyword-spelled local.
  The committed corpus contains **zero** instances at any of the six positions
  (§Reproduction (i)). D3 for four measured reasons, each named in §Fix: the
  six positions sit at **six** parse sites in **two** modules with no shared
  branch point, against 0148's single branch point that bug 0139 had already
  opened; the `params:` face has no token at all — the name is a YAML scalar
  key, so the predicate is string membership in `reservedKeywords()` and the
  range must be sourced from `rangeOf(item.key, …)`, a different shape from
  every other face; three misfire faces need an in-run adjudication and one
  route into them edits `src/lexer/lexer.ts`, which 0148 deliberately left
  blob-identical (`17f6e1d7…`) because bugs 0051 and 0135 hold citations in it;
  and the fix must coordinate with 0149 at two shared sites while retaking
  seven pinned tripwire cells in a witness file another report shipped.
- **Kind:** defect — implementation, against a written sentence and its
  registered *Trigger*. Three elements.
  1. **The rule is written with no position qualifier, and the *Trigger*
     repeats that shape.** `docs/spec_topics/lexical.md:20` lists 32 reserved
     spellings — `let`, `mut`, `fn`, `if`, `else`, `for`, `in`, `while`,
     `break`, `continue`, `return`, `match`, `schema`, `enum`, `import`,
     `export`, `from`, `as`, `by`, `invoke`, `true`, `false`, `null`, `Ok`,
     `Err`, `Result`, `string`, `number`, `integer`, `boolean`, `array`,
     `void` — and states the consequence without a scope list: "Using one of
     these in identifier position is
     `theta/parse/reserved-keyword-as-identifier`". The registry row
     (`docs/spec_topics/diagnostics/code-registry-parse.md:21`) reads
     *Trigger* "Reserved keyword used in an identifier position", naming no
     position, where `:19`'s *Trigger* for the case code enumerates four.
     `docs/reference/grammar.md:80–88` restates the list under the same code.
     Each of the six positions below is an `Ident` terminal or a
     spec-named identifier: `ForStmt ::= "for" Ident "in" Expr StmtBlock`
     (`docs/reference/grammar.md:219`, `docs/spec_topics/grammar.md:126`),
     `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause? ParForBody`
     (`docs/reference/grammar.md:220`),
     `ImportSpec ::= Ident ("as" Ident)?` (`docs/reference/grammar.md:36`),
     "the field identifier" and "the theta identifier"
     (`docs/spec_topics/schemas.md:23`, `:34`), "Variant names are PascalCase
     identifiers" (`docs/spec_topics/schemas.md:78`), and `params:` fields
     "exposed as typed variables in the theta body"
     (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:57`).
     `lexical.md:3` applies every rule on that page to `.theta` and
     `.thetalib` alike.
  2. **Every enforcer reaches somewhere else.** The lexer half is `checkName`'s
     keyword arm (`src/lexer/lexer.ts:819–828`), reached by a dispatch
     (`:876–887`) with exactly three token adjacencies — the identifier after
     `let` (past the `mut` skip), after `fn`, and after `schema` / `enum`.
     Every one of the six positions is adjacent to punctuation (`{`, `,`), to
     `for` / `par for`, or — at `params:` — is not a token at all, so no call
     reaches any of them. Bug 0044's four
     parser-leaf emitters (`reservedKeywordAsIdentifierDiagnostic`,
     `src/parser/theta-document.ts:5117`, called at `:5875`, `:6294`, `:6587`)
     serve `Type` positions. Bug 0148's parser-leaf emission (`:2203–2210`)
     serves the `fn` parameter NAME and guards itself on `atParamStart`, a
     loop-local of `parseFn`. The five parse sites in the same module that own
     five of the six positions accept a `keyword`-kind token on the same
     predicate and test nothing:
     `parseFor` `:2136` and `parseParFor` `:4053` (`const variable =
     this.advance().text;`, no kind test at all), `parseSchemaObjectBody`
     `:2606–2607` (`kind === "ident" || kind === "keyword"`),
     `parseEnumVariants` `:2753` (the same disjunction),
     `parseImportExport` `:2865–2866` and `:2878–2879` (the same disjunction
     at both name slots). The sixth site is `extractParsedParams`
     (`src/parser/frontmatter.ts:710`), where the name is a YAML scalar key and
     no token exists.
  3. **At the `for` and `par for` positions the code is not silent — it
     misfires.** The lexer's dispatch keys on the keyword token, not on the
     statement, so `for let in xs { 1 }` reaches the `let` arm (`:876–882`),
     which inspects the token AFTER the loop variable and emits the code
     against `'in'` @5:9-5:11 (row m1). The same happens for `fn`, `schema` and
     `enum` at that position; the other 27 spellings are silent and `mut`
     draws `theta/parse/mut-on-immutable-context` instead. So the author who
     writes `for let in xs` is told the wrong identifier is at fault, and the
     author who writes `for string in xs` is told nothing.
- **Related:**
  - [0148](./0148-reserved-keyword-fn-parameter-position-silent.md) —
    **fixed (0.81.0)**, the origin, the same code, the same spec sentence, and
    the owner of the tripwire rows this report unpins. Its fix closed the `fn`
    parameter NAME position at `parseFn`'s parameter loop and dispositioned
    every other identifier position OUT with a named reason, each pinned by a
    row in `tests/fn-param-name-reserved-keyword.test.ts`. This report claims
    exactly the five §Fix (b) items 0148 recorded as "unclaimed by any report
    at this HEAD" (items 1, 2, 3, 5, 6), and adds the misfire face 0148
    recorded as §Residual 4. 0148's §Fix (a) site decision is this report's
    template: the parser leaf, not `contextualDiagnostics`, with
    `lexer.ts:806–808`'s scope note ("full identifier-position coverage — every
    reserved word in every identifier slot — is a parser-leaf obligation")
    naming this class in terms. **Coordination:** 0148's shipped witness holds
    seven rows asserting these positions silent (`e4`, `e4p`, `e5`, `e6`, `e8`,
    `e9a`, `e9b`, at `tests/fn-param-name-reserved-keyword.test.ts:821`, `:829`,
    `:837`, `:847`, `:868`, `:876`, `:884`) plus `e14` at `:932` pinning the
    misfire, and its file header (`:111–132`) records the disposition each row
    encodes. Every one of the seven asserts `codesOf(doc)` `toEqual([])` and
    reds the moment this report's emission lands; `e14` asserts the wrong
    subject verbatim (`reservedMsg("in")`, range `5:9-5:11`) and reds on any
    repair of the misfire. The rows are the coordination surface and must be
    retaken with the same whole-list discipline.
  - [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md) —
    **open**, and the owner of a seventh silent position this report does NOT
    claim: the `match` pattern binder. Its §Fix (a) half 2 is "the reserved
    keyword in pattern position", the same code under the same sentence, at
    `parsePattern`'s tail arm (`src/parser/theta-document.ts:3880`, the
    `ident`-or-`keyword` branch at `:3931` and the identifier return at
    `:3983`, the lines row `e7`'s own comment cites). Row `e7`
    (`tests/fn-param-name-reserved-keyword.test.ts:855`) protects that claim
    and is the file's load-bearing tripwire; this report's §Non-goals leaves
    it, and a fix here that turns `e7` green takes 0141's deliverable. Measured
    unchanged at this HEAD: `match v { match => 1 }` reports `[]` (row n1).
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, the family this report does NOT claim and the precedent
    that settles the site principle. It wired
    `reserved-keyword-as-identifier` at `Type` positions from a parser leaf, so
    the code already has four parser-leaf emitters beside the lexer's three
    adjacencies and a fifth through tenth break no architectural rule. Its
    emissions are measured live and unmoved: `schema X { f: let }` fires
    (row n3), a `params:` right-hand side `let` fires (row n4). Rows `e10`,
    `e11` and `e12` pin them. The NAME slot and the TYPE slot of one field are
    different rules' subjects; widening one must not reach the other.
  - [0149](./0149-field-name-case-positions-unenforced.md) — **open and being
    fixed concurrently**, the sibling at two of this report's six positions
    under the OTHER rule. It claims `theta/parse/binding-case-mismatch`
    (`lexical.md:16`) at the schema field name and the `params:` field name;
    this report claims `theta/parse/reserved-keyword-as-identifier`
    (`lexical.md:20`) at the same two positions plus four more. **Two rules,
    one position, three consequences.** (1) The two fixes edit the same two
    loops — `parseSchemaObjectBody`'s field loop and `extractParsedParams`'s
    field loop — so whichever lands second rebases both its own witness rows
    and the other's. (2) At the schema field name the two subject sets are
    disjoint by construction: the case code's subject is an uppercase-first
    `ident`, and the three uppercase reserved spellings `Ok` / `Err` /
    `Result` lex as `kind: "keyword"` (`lexer.ts:677`), so no `ident`-guarded
    case emission can reach a reserved spelling there. Measured:
    `schema S { Ok: string }` is silent today (§Reproduction (b)) and stays
    silent under a case fix. (3) At the `params:` field name the sets are NOT
    disjoint: the name is a YAML string with no token kind, so `Ok`, `Err` and
    `Result` are inside both rules' subjects at once. Whichever fix lands
    second must state which code `params: Ok: string` draws; both are silent
    at this HEAD (§Reproduction (b), row L2). 0149's H1 also names an inline
    object type's field name as its third face; this report does not measure
    that position and does not claim it. 0149 leaves this report's claim out in
    terms: its §Non-goals bullet
    "`theta/parse/reserved-keyword-as-identifier` at the field position"
    measures both shared positions silent and records "The field half is
    unfiled at this HEAD and is not claimed here either". This filing claims
    it.
  - [0100](./0100-production-excluded-import-export-spellings-parse-clean.md)
    — **open**, and the only other report whose §Fix writes into
    `parseImportExport`'s specifier loop. Its subject is four spellings the
    published `ImportDecl` / `ExportDecl` productions exclude (no braces, an
    empty list, an `as` with no trailing identifier), and its §Fix names the
    alias branch and the brace guard that has no else — the same lines this
    report's import face writes to. The two are behaviourally disjoint (0100's
    subjects are absent or non-identifier tokens; this report's is a
    `keyword`-kind token in a slot 0100 leaves populated) and share a code
    site, so whichever lands second rebases. 0100's `theta-document.ts`
    citations are stale at this HEAD (bug 0134's class); the verified lines are
    `parseImportExport` `:2850`, the brace guard `:2861`, the specifier loop
    `:2863–2915`, and the alias branch `:2874–2884`.
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) — **open**,
    touching the same function at its `validatePathLiteral` call, a disjoint
    region of it. No behavioural interaction; citation drift only.
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **fixed
    (0.79.0)**, the pattern precedent for the whole family: a rule written
    without a position list, an enforcer that is a three-adjacency lexer scan,
    and a fix that adds a parser-leaf emission at the position the scan cannot
    reach. It opened the branch point 0148 then used. No branch point exists at
    any of this report's six sites, which is the difficulty delta stated above.
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — **open**. Its
    §Non-goals bullet "Field-name casing enforcement" is the prior record of
    the schema-field position's CASE half; 0149's §Related supersedes that
    bullet's "unfiled" clause. Neither report claims the keyword half, which
    this one does.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) and
    [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) —
    **open**, and the reason `src/lexer/lexer.ts` is a constraint rather than a
    free surface. Both hold `lexer.ts` citations; 0148's fix kept the file
    blob-identical for exactly that reason. Any §Fix route here that narrows
    the lexer's adjacency dispatch to repair the misfire face shifts their
    citations (bug
    [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
    class).
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**.
    The committed-fixture parse gate is `.thetalib`-blind, so the corpus sweep
    in §Reproduction (i) walks `.thetalib` explicitly rather than relying on
    the gate.
- **Affected** (every citation verified at HEAD `1a214680`, 0.81.0):
  - **The spec rule** — `docs/spec_topics/lexical.md:20`, the reserved-keyword
    paragraph: the 32 spellings, the sentence "Using one of these in identifier
    position is `theta/parse/reserved-keyword-as-identifier`", the separate
    reservation of the discard `_`, and the `array` / `Result` carve-out.
    `:13` — the identifier grammar and "The **first letter's case is
    enforced** by the parser". `:15` — the PascalCase bullet, which names
    "`enum` variant names", the case half of this report's fifth position.
    `:16` — the lowercase-first bullet, which names "schema field names", the
    case half of the third position; bugs 0139 and 0149's rule, not this one.
    `:3` — every rule on the page applies to `.theta` and `.thetalib` alike.
  - **The registered row** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:21`.
    `theta/parse/reserved-keyword-as-identifier`, severity `E`, namespace
    `parse`. *Trigger*: "Reserved keyword used in an identifier position".
    *Message*: `reserved keyword '<keyword>' cannot be used as an identifier`.
    Mirror without a *Trigger* column: `docs/reference/diagnostics.md:67`.
    `:22` is the row the misfire face drags in at three positions:
    `theta/parse/single-line-if`, *Trigger* "`if` / `for` / `while` / `fn` body
    is not a braced block".
  - **The lexer enforcer and the shape of its blind spot** —
    `src/lexer/lexer.ts:810–916` (`contextualDiagnostics`). `checkName`
    (`:814–851`): the keyword arm at `:819–828`, the non-`ident` bail at
    `:829–831`, the first-letter tests at `:832–850`. The dispatch is
    `:876–887`: `let` with the `mut` skip at `:876–882`, `fn` NAME at
    `:883–884`, `schema` / `enum` NAME at `:885–886`. A **fourth** scan sits
    beside it at `:889–912`, keyed on `controlHeads` (`:812`, the set
    `if` / `for` / `while` / `fn`), which walks forward for a `{` before the
    next `stmt-sep` and emits `theta/parse/single-line-if` at `:904–910` when
    it finds none. That scan is what produces the second misfire face
    (§Reproduction (d)). The file is blob-identical to 0.71.0 (`9fe13534`) and
    to HEAD (`17f6e1d7…`); bug 0148's fix touched none of it.
  - **The token classification** — `src/lexer/lexer.ts:677`,
    `kind: reserved.has(value) ? "keyword" : "ident"`, against the 32-member
    set `reservedKeywords()` returns (`:159–166`). It is what makes
    `kind === "keyword"` exactly membership in `lexical.md:20`'s list, and what
    keeps the contextual keywords `par` / `with` / `subagent` outside it.
  - **The scope note handing this class to a parser leaf** —
    `src/lexer/lexer.ts:806–808`: "full identifier-position coverage (**every
    reserved word in every identifier slot**) is a parser-leaf obligation; the
    lexer core enforces the positions its closed Tests obligations name."
  - **The five parse sites in `src/parser/theta-document.ts`.**
    - `parseFor` (`:2122–2149`): the `mut` modifier check at `:2124–2135`
      (`checkMutModifier` with `{ position: "for-var" }`), then
      `const variable = this.advance().text;` at `:2136` — the loop variable is
      taken with no kind test of any sort, and the `for` node is built at
      `:2142–2148` with `variable` verbatim.
    - `parseParFor` (`:4038–…`): the same `mut` check at `:4041–4052`, the same
      `const variable = this.advance().text;` at `:4053`.
    - `parseSchemaObjectBody` (`:2589–2671`): `const nameTok = this.peek();` at
      `:2606`, `const isFieldName = nameTok.kind === "ident" || nameTok.kind
      === "keyword";` at `:2607`, the consume at `:2614`, the optional
      `as "WireName"` clause at `:2615–2631`, the `:` at `:2632–2636`, and
      `fields.push({ name: nameTok.text, … })` at `:2638–2642`. The token, its
      `kind` and its `range` are in hand from `:2606` — the branch point a
      keyword arm needs, already written, and the same lines bug 0149's fix
      edits.
    - `parseEnumVariants` (`:2710–2792`): the name capture at `:2753–2760`,
      again `t.kind === "ident" || t.kind === "keyword"`, pushing `t.text` into
      `names`, `currentName` and `variantDecls`.
    - `parseImportExport` (`:2850–…`): the specifier loop at `:2863–2915`.
      `isSymbolToken` at `:2865–2866` admits `ident` or `keyword` (excluding
      the text `as`); the source name is read at `:2868–2869`, the alias at
      `:2874–2884` on the same disjunction (`:2878–2879`), and
      `symbols.push(local)` at `:2892`. The loop already emits a registered
      per-specifier code onto `this.diagnostics` —
      `checkImportReservedSynthesisedName` at `:2903–2909` — so the emission
      precedent sits in the loop itself.
  - **The sixth site, which has no token** — `src/parser/frontmatter.ts:710`,
    `const name = String(item.key.value);` inside `extractParsedParams`'s
    `for (const item of paramsNode.items)` loop. The name is a YAML scalar key,
    so there is no `kind` to test and no token range; the loop's existing
    registered emission (`theta/load/params-type-not-expression`, `:725–731`)
    sources its range from `rangeOf((item.value ?? item.key), …)` at
    `:715–717`. `fieldInputs.push({ name, … })` at `:733–738` and
    `bypassFields.push({ wireName: name, … })` at `:739–746` carry the name
    forward.
  - **Where the accepted keyword lands** (all measured, §Reproduction (e)):
    the `for` node's `variable`, the `par-for` expression's `variable`, the
    `schema` node's `fields[].name`, the `enum` node's `variants[]` and
    `variantDecls[].name`, the `import` node's `symbols[]` and
    `specifiers[].local`, and — the widest — the `params:` block's
    `loweredSchema.properties`, `loweredSchema.required` and
    `fields[].wireName`.
  - **The value-position path that makes four of the six bindings unreadable**
    — `src/parser/theta-document.ts:3570–3574`, the comment naming "the
    keyword-in-value-position `null` path … mirroring the other reserved
    keywords that reach here", and `:3634`, `parseAtom`'s `return null` for any
    token the atom section did not classify.
  - **The registration consequence** —
    `src/extension/production-composition.ts:2047–2054` (`hasLoadParseError`),
    applied at `:2094`, drops a theta carrying any `error`-severity
    `theta/load/*` or `theta/parse/*` diagnostic. Every §Reproduction (a) row
    reports `[]`, so every one registers.
  - **Existing coverage: seven rows assert the gap OPEN.**
    `tests/fn-param-name-reserved-keyword.test.ts` (986 lines, 44 cells,
    bug 0148's shipped witness) holds the tripwire block at `:815–947` with
    `e4` `:821`, `e4p` `:829`, `e5` `:837`, `e6` `:847`, `e8` `:868`, `e9a`
    `:876`, `e9b` `:884` — each asserting `codesOf(doc)` `toEqual([])` — and
    `e14` `:932` asserting the misfire's code, its wrong subject
    (`reservedMsg("in")`) and its range (`5:9-5:11`). The file header records
    the disposition each row encodes at `:111–132`. `e7` `:855` protects bug
    0141's claim, `e10` `:892` and `e11`/`e12` `:905`/`:922` pin bug 0044's
    family, and `ck1`–`ck3` `:953–…` pin the contextual keywords. No test
    asserts any of the six positions in the firing direction.
  - `docs/spec_topics/governance/source-language-stability.md:25` — the
    diagnostic-registry carve-out that dispositions this fix as an addition
    ("in-scope as an addition for inputs newly brought into the code's emission
    set"), a fortiori because no *Trigger* is edited; `:9` — the loads-cleanly
    predicate every §Reproduction (a) row satisfies today.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2; `:74` —
    DIAG-4. Neither is engaged by an emission that moves onto a *Trigger*
    already covering the position.
- **Observed at:** `0.81.0` (HEAD `1a214680`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---` and a trailing `1` supplying the final
  value, so the source under test sits on line 4 (line 5 where a `let xs = [1]`
  precedes it); `.thetalib` rows pass `path = "lib.thetalib"` with no
  frontmatter. Diagnostic lists are the whole unfiltered `doc.diagnostics` in
  emission order, each range as `line:col-line:col`. **Measurement hygiene:** a
  sibling orchestrator fixing bug 0149 wrote an uncommitted prototype into
  `src/parser/theta-document.ts` and `src/parser/frontmatter.ts` mid-session.
  Every row below was re-measured against a copy of the tree whose
  `theta-document.ts`, `frontmatter.ts`, `params.ts` and `lexer.ts` were
  restored from `git show HEAD:<path>` and verified blob-identical to HEAD
  (`b8c3b089…`, `b692a982…`, `7609e189…`, `17f6e1d7…`), so no row carries
  sibling state. Three scratch vitest files, run on the outputs quoted below,
  then deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug
  document are unmodified by this filing.

## Summary

`lexical.md:20` reserves 32 spellings and states, without a scope list, that
using one "in identifier position" is
`theta/parse/reserved-keyword-as-identifier`. The registered *Trigger*
(`code-registry-parse.md:21`) is the same shape and names no position. Bug 0148
closed one position — the `fn` parameter name — and dispositioned the rest OUT
with tripwire pins. Six positions remain, pinned by seven tripwire rows: the
`for` iteration variable (`e4`), the `par for` iteration variable (`e4p`), the
schema field name (`e5`), the `params:` frontmatter field name (`e6`), the
`enum` variant name (`e8`), and the `import` / `export` specifier binding in
both its bare (`e9a`) and `as`-aliased (`e9b`) forms.

At each of the six, a reserved spelling loads with zero diagnostics and the
theta registers. The keyword binds verbatim: `{"kind":"for","variable":"string"}`,
`fields:[{"name":"let","typeSource":"string"}]`, `variants:["let"]`,
`symbols:["let"]`, `specifiers:[{"source":"a","local":"let"}]`. The `params:`
face carries furthest — `let: string` lowers to
`{"type":"object","properties":{"let":{"type":"string"}},"required":["let"],"additionalProperties":false}`,
the schema handed to the binder and the provider.

The gap is not uniform across the 32 spellings, and one position is not silent
at all. At the `for` and `par for` variable, 27 of 32 spellings are silent,
`mut` draws `theta/parse/mut-on-immutable-context` (the loop's own modifier
check consumes it before the name is read), and **four — `let`, `fn`, `schema`,
`enum` — fire the reserved code against the WRONG token**: `for let in xs { 1 }`
reports `reserved keyword 'in' cannot be used as an identifier` @5:9-5:11, where
the offending identifier is `let` @5:5-5:8. Those four are exactly the keywords
the lexer's three adjacency arms dispatch on; the dispatch keys on the keyword
token, not on the statement, so it reads past the loop variable and judges the
`in`. At the
schema field name, the `enum` variant name and both `import` specifier forms,
28 of 32 are silent and the other four — `fn`, `if`, `for`, `while` — draw
`theta/parse/single-line-if` from a fourth lexer scan that finds no `{` after
them. At the `params:` field name all 32 are silent, because the name never
becomes a token.

Two more wrong-subject faces follow from the same adjacency:
`schema S { let as "w": string }` and
`import { let as x } from "./lib.thetalib"` each report the code against
`'as'`, the token the `let` arm lands on.

The consequences past registration are measured and differ per position. A
`for` variable named `string` cannot be read — a bare reserved word in value
position takes `parseAtom`'s `null` path
(`theta-document.ts:3570–3574`, `:3634`). A `schema` field named `let` makes the
schema unconstructible: `S { let: "x" }` draws `extra-object-field` naming
`'"x"'` AND `missing-object-field` naming `'let'`, two diagnostics with the
wrong subject. A `params:` field named `let` cannot be read from the body
either, and the attempt draws `theta/parse/let-without-initialiser` with the
message `let binding '\n' has no initialiser`. An `import` specifier's SOURCE
slot is grammatically reachable but semantically dead — no `.thetalib` can
export a keyword-spelled symbol, since `fn let()`, `schema let` and `enum let`
are each refused at `E` — while the ALIAS slot binds a keyword-spelled local
that no expression can name.

## Reproduction

Offline, deterministic, at HEAD `1a214680`, against parser and lexer blobs
verified identical to HEAD. Harness: `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
over the shipped `parseThetaDocument`. Each cell is the whole diagnostic list
in emission order, unfiltered.

### (a) The six positions, one spelling each, with their conformant controls

Frontmatter `---\nmode: prompt\n---` on lines 1–3 except where the source is
itself frontmatter.

| # | source | diagnostics | registers |
|---|---|---|---|
| a1 | `let xs = [1]` + `for string in xs { 1 }` + `1` | `[]` | yes |
| a2 | `let xs = [1]` + `par for string in xs { 1 }` + `1` | `[]` | yes |
| a3 | `schema S { let: string }` + `1` | `[]` | yes |
| a4 | `---\nmode: prompt\nparams:\n  let: string\n---\n1\n` | `[]` | yes |
| a5 | `enum E { let }` + `1` | `[]` | yes |
| a6 | `import { let } from "./lib.thetalib"` + `1` | `[]` | yes |
| a7 | `import { a as let } from "./lib.thetalib"` + `1` | `[]` | yes |
| a8 | `export { a as let } from "./lib.thetalib"` + `1` | `[]` | yes |

Controls, same shapes with a conformant spelling — all `[]`, all register, so
no row above is explained by a harness that reports nothing:

| # | source | diagnostics |
|---|---|---|
| c1 | `let xs = [1]` + `for s in xs { 1 }` + `1` | `[]` |
| c2 | `let xs = [1]` + `par for s in xs { 1 }` + `1` | `[]` |
| c3 | `schema S { f: string }` + `1` | `[]` |
| c4 | `---\nmode: prompt\nparams:\n  f: string\n---\n1\n` | `[]` |
| c5 | `enum E { A }` + `1` | `[]` |
| c6 | `import { a } from "./lib.thetalib"` + `1` | `[]` |
| c7 | `import { a as b } from "./lib.thetalib"` + `1` | `[]` |

The controls that show the code is live on this HEAD — the three enforced
adjacencies plus bug 0148's now-closed position:

| # | source | diagnostics |
|---|---|---|
| k1 | `let let = 1` + `1` | `error theta/parse/reserved-keyword-as-identifier @4:5-4:8: reserved keyword 'let' cannot be used as an identifier` |
| k2 | `fn let(): number { 1 }` | `error … @4:4-4:7: reserved keyword 'let' cannot be used as an identifier` |
| k3 | `schema let { a: string }` + `1` | `error … @4:8-4:11: reserved keyword 'let' cannot be used as an identifier` |
| k4 | `enum let { A }` + `1` | `error … @4:6-4:9: reserved keyword 'let' cannot be used as an identifier` |
| k5 | `fn h(let: string): number { 1 }` (bug 0148, fixed) | `error … @4:6-4:9: reserved keyword 'let' cannot be used as an identifier` |

### (b) The whole reserved list at each position

All 32 spellings from `reservedKeywords()` (`lexer.ts:159–166`) at each
position, one file per spelling.

| position | silent | non-silent |
|---|---|---|
| `for` variable | **27/32** | `let`, `fn`, `schema`, `enum` → the reserved code naming `'in'`; `mut` → `mut-on-immutable-context` |
| `par for` variable | **27/32** | same five, same split |
| schema field name | **28/32** | `fn`, `if`, `for`, `while` → `single-line-if` |
| `params:` field name | **32/32** | none |
| `enum` variant name | **28/32** | `fn`, `if`, `for`, `while` → `single-line-if` |
| `import { <kw> }` | **28/32** | `fn`, `if`, `for`, `while` → `single-line-if` |
| `import { a as <kw> }` | **28/32** | `fn`, `if`, `for`, `while` → `single-line-if` |

The silent set at the `for` and `par for` variable is `if`, `else`, `for`,
`in`, `while`, `break`, `continue`, `return`, `match`, `import`, `export`,
`from`, `as`, `by`, `invoke`, `true`, `false`, `null`, `Ok`, `Err`, `Result`,
`string`, `number`, `integer`, `boolean`, `array`, `void`. The schema field
name, the `enum` variant name and both `import` specifier forms share a
different 28-member set: that one with `let`, `mut`, `schema` and `enum` added
and `if`, `for` and `while` removed. At the `params:` field name it is all 32.
The three uppercase spellings `Ok`, `Err` and `Result` are silent at every one
of the six — which is what makes them the overlap with bug 0149's rule at the
`params:` face, where no token kind separates the two subjects.

### (c) The misfire face at the `for` and `par for` variable

| # | source | diagnostics |
|---|---|---|
| m1 | `let xs = [1]` + `for let in xs { 1 }` + `1` | `error theta/parse/reserved-keyword-as-identifier @5:9-5:11: reserved keyword 'in' cannot be used as an identifier` |
| m2 | `let xs = [1]` + `for fn in xs { 1 }` + `1` | `error … @5:8-5:10: reserved keyword 'in' cannot be used as an identifier` |
| m3 | `let xs = [1]` + `for schema in xs { 1 }` + `1` | `error … @5:12-5:14: reserved keyword 'in' cannot be used as an identifier` |
| m4 | `let xs = [1]` + `for enum in xs { 1 }` + `1` | `error … @5:10-5:12: reserved keyword 'in' cannot be used as an identifier` |
| m5 | `let xs = [1]` + `for match in xs { 1 }` + `1` | `[]` |
| m6 | `let xs = [1]` + `par for let in xs { 1 }` + `1` | `error … @5:13-5:15: reserved keyword 'in' cannot be used as an identifier` |
| m7 | `let xs = [1]` + `for let xs { 1 }` + `1` (no `in`) | `[]` |
| m8 | `let xs = [1]` + `for let in xs {` / `1` / `}` + `1` (braced over lines) | `error … @5:9-5:11: reserved keyword 'in' cannot be used as an identifier` |
| m9 | `let xs = [1]` + `for mut let in xs { 1 }` + `1` | `error theta/parse/mut-on-immutable-context @5:5-5:8: 'mut' is not permitted in this binding position`, `error theta/parse/reserved-keyword-as-identifier @5:13-5:15: reserved keyword 'in' cannot be used as an identifier` |
| m10 | `.thetalib`, `fn a(): number {` / `let xs = [1]` / `for let in xs { 1 }` / `1` / `}` | `error … @3:11-3:13: reserved keyword 'in' cannot be used as an identifier` |

The misfire is **not `let`-specific**: it fires for exactly the four keywords
the lexer dispatch treats as declarator heads (`let` at `:876–882`, `fn` at
`:883–884`, `schema` / `enum` at `:885–886`). Row m5 shows a reserved word that
is not a head staying fully silent; row m7 shows the subject is the token after
the variable, not the head, since removing `in` removes the diagnostic. In
every misfiring row the true offender is the loop variable — `let` @5:5-5:8 in
m1 — and the diagnostic points at `in`, which the author wrote correctly.

### (d) Two more wrong-subject faces, and the `single-line-if` face

| # | source | diagnostics |
|---|---|---|
| w1 | `schema S { let as "w": string }` + `1` | `error theta/parse/reserved-keyword-as-identifier @4:16-4:18: reserved keyword 'as' cannot be used as an identifier` |
| w2 | `import { let as x } from "./lib.thetalib"` + `1` | `error … @4:14-4:16: reserved keyword 'as' cannot be used as an identifier` |
| w3 | `export { let as x } from "./lib.thetalib"` + `1` | `error … @4:14-4:16: reserved keyword 'as' cannot be used as an identifier` |
| w4 | `schema S { fn: string }` + `1` | `error theta/parse/single-line-if @4:12-4:14: single-line body not permitted; wrap in { ... }` |
| w5 | `enum E { fn }` + `1` | `error theta/parse/single-line-if @4:10-4:12: single-line body not permitted; wrap in { ... }` |
| w6 | `import { fn } from "./lib.thetalib"` + `1` | `error theta/parse/single-line-if @4:10-4:12: single-line body not permitted; wrap in { ... }` |
| w7 | `import { a as fn } from "./lib.thetalib"` + `1` | `error theta/parse/single-line-if @4:15-4:17: single-line body not permitted; wrap in { ... }` |
| w8 | `schema S { let: string }` + `1` (contrast) | `[]` |

Rows w1–w3 are the `let` arm again, landing on the `as` of a wire-rename or an
import alias. Rows w4–w7 are the fourth lexer scan (`:889–912`): a
`controlHeads` member with no `{` before the next `stmt-sep`. Both faces judge
a token the author wrote correctly, and both block registration for the wrong
reason.

### (e) What each accepted keyword binds

| # | source | bound |
|---|---|---|
| L1 | `---\nmode: prompt\nparams:\n  let: string\n---\n1\n` | `{"loweredSchema":{"type":"object","properties":{"let":{"type":"string"}},"required":["let"],"additionalProperties":false},"defaultedFields":[],"fields":[{"wireName":"let","type":"string","hasDefault":false,"nullable":false}]}` |
| L2 | `---\nmode: prompt\nparams:\n  f: string\n---\n1\n` (control) | the same with `f` |
| L3 | `let xs = [1]` + `for string in xs { 1 }` + `1` | `[{"kind":"let"},{"kind":"for","variable":"string"}]` |
| L4 | `let xs = [1]` + `let r = par for string in xs { 1 }` + `r` | `{"kind":"par-for","variable":"string",…}` |
| L5 | `schema S { let: string }` + `1` | `[{"kind":"schema","name":"S","fields":[{"name":"let","typeSource":"string"}],…}]` |
| L6 | `enum E { let }` + `1` | `[{"kind":"enum","name":"E","variants":["let"],"variantDecls":[{"name":"let"}],…}]` |
| L7 | `import { let } from "./lib.thetalib"` + `1` | `[{"kind":"import","path":"./lib.thetalib","symbols":["let"],"specifiers":[{"source":"let","local":"let",…}],…}]` |
| L8 | `import { a as let } from "./lib.thetalib"` + `1` | `[{"kind":"import","path":"./lib.thetalib","symbols":["let"],"specifiers":[{"source":"a","local":"let",…}],…}]` |

Row L1 is the widest consequence: the reserved spelling is a property key in
the JSON Schema the binder and the provider receive, and `wireName` carries it
onto the wire.

### (f) What the accepted binding can and cannot do

| # | source | diagnostics |
|---|---|---|
| d1 | `let xs = [1]` + `for string in xs { string }` + `1` | `[]` |
| d2 | `let xs = [1]` + `for s in xs { s }` + `1` (control) | `[]` |
| d3 | `---\nmode: prompt\nparams:\n  let: string\n---\nlet\n` | `error theta/parse/let-without-initialiser @6:1-7:1: let binding '\n' has no initialiser` |
| d4 | `---\nmode: prompt\nparams:\n  f: string\n---\nf\n` (control) | `[]` |
| d5 | `schema S { let: string }` + `S { let: "x" }` | `error theta/parse/extra-object-field @5:1-5:15: extra field '"x"' on schema 'S'`, `error theta/parse/missing-object-field @5:1-5:15: missing field 'let' on schema 'S'` |
| d6 | `schema S { f: string }` + `S { f: "x" }` (control) | `[]` |
| d7 | `enum E { let }` + `E.let` | `[]` |
| d8 | `enum E { A }` + `E.A` (control) | `[]` |

Row d1 is silent because a bare reserved word in value position takes
`parseAtom`'s `null` path, so the loop variable can never be named. Row d3 is
the same unreadability surfacing as a **wrong code with a mangled message**:
the body's `let` is taken as a `let` statement head and the diagnostic quotes a
newline as the binding name. Row d5 shows the declared field is
unconstructible, with both diagnostics naming the wrong subject.

### (g) Whether these positions can collide with a keyword at all

| # | source (`.thetalib`, no frontmatter) | diagnostics |
|---|---|---|
| x1 | `fn let(): number { 1 }` | `error theta/parse/reserved-keyword-as-identifier @1:4-1:7: reserved keyword 'let' cannot be used as an identifier` |
| x2 | `schema let { a: string }` | `error … @1:8-1:11: reserved keyword 'let' cannot be used as an identifier` |
| x3 | `enum let { A }` | `error … @1:6-1:9: reserved keyword 'let' cannot be used as an identifier` |
| x4 | `fn a(): number { 1 }` (control) | `[]` |
| x5 | `schema S { let: string }` (`.thetalib` route) | `[]` |
| x6 | `enum E { let }` (`.thetalib` route) | `[]` |
| x7 | `import { let } from "./o.thetalib"` + `fn a(): number { 1 }` | `[]` |
| x8 | `import { a as let } from "./o.thetalib"` + `fn b(): number { 1 }` | `[]` |

Every one of the six positions accepts a keyword by construction — rows a1–a8
and x5–x8 are the proof, and the `.thetalib` route behaves identically, as
`lexical.md:3` requires. One half is nonetheless semantically dead: an
`import` specifier's SOURCE name must match an export, and rows x1–x3 show a
`.thetalib` cannot declare a keyword-spelled `fn`, `schema` or `enum`, so
`import { let }` names a symbol nothing can supply. The ALIAS half is fully
live: row x8's `a` is a legitimate export and the local binding becomes `let`.

### (h) The tripwire rows that pin each position, and their flip conditions

Every row is in `tests/fn-param-name-reserved-keyword.test.ts`, bug 0148's
shipped witness, inside the `0148 (e)` block (`:815`) whose header states the
contract: "a reader finding one red should widen the fix's scope question
rather than the row".

| row | line | source | assertion | flips when |
|---|---|---|---|---|
| `e4` | `:821` | `for string in xs { 1 }` | `codesOf(doc)` `toEqual([])` | the `for` variable emits |
| `e4p` | `:829` | `par for string in xs { 1 }` | `codesOf(doc)` `toEqual([])` | the `par for` variable emits |
| `e5` | `:837` | `schema S { let: string }` | `codesOf(doc)` `toEqual([])` | the schema field name emits |
| `e6` | `:847` | `params:` + `let: string` | `codesOf(doc)` `toEqual([])` | the `params:` field name emits |
| `e8` | `:868` | `enum E { let }` | `codesOf(doc)` `toEqual([])` | the `enum` variant name emits |
| `e9a` | `:876` | `import { let } from "./lib.thetalib"` | `codesOf(doc)` `toEqual([])` | the bare specifier emits |
| `e9b` | `:884` | `import { a as let } from "./lib.thetalib"` | `codesOf(doc)` `toEqual([])` | the aliased specifier emits |
| `e14` | `:932` | `for let in xs { 1 }` | `codesOf` `[RESERVED]`, `messageFor` `reservedMsg("in")`, `soleRange` `5:9-5:11` | the misfire's subject, range or count changes |

Three rows in the same block are NOT this report's to flip: `e7` (`:855`, the
`match` binder — bug 0141's claim), `e10` (`:892`, a keyword in a `fn`
parameter's TYPE slot — bug 0044's family), and `e11` / `e12` (`:905`, `:922`,
bug 0044's two firing type positions, which must stay firing unchanged).

### (i) The committed corpus — the GOV-15 baseline

`git ls-files -- '*.theta' '*.thetalib'` → **34 files**, walked including
`.thetalib` because the shipped committed-fixture parse gate is
`.thetalib`-blind (open bug 0132).

| position | occurrences in the corpus | reserved spellings |
|---|---|---|
| `for` / `par for` variable | 2 (`docs/examples/fan-out-reviews.theta:19` `path`, `:28` `r`) | **0** |
| schema field name | 25 across 11 declarations | **0** |
| `params:` field name | 19 across 17 files | **0** |
| `enum` variant name | 0 declarations | **0** |
| `import` / `export` specifier | 3 (`docs/examples/import-thetalib.theta:7` `Author`, `rate_strictness`; `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7` `tagline`) | **0** |

No committed `.theta` or `.thetalib` changes disposition under any fix
described below.

## Expected behaviour

`lexical.md:20`'s sentence is unqualified and the registered *Trigger* names no
position, so at each of the six positions a reserved spelling draws exactly one
`theta/parse/reserved-keyword-as-identifier`, severity `error`, the registry
*Message* with the offending keyword interpolated, ranged on the **offending
name** — not on a neighbouring token and not on the enclosing declaration:

- `for let in xs { 1 }` → one diagnostic naming `'let'`, ranged on `let`
  (@5:5-5:8), replacing today's diagnostic naming `'in'` (@5:9-5:11).
- `for string in xs { 1 }` and `par for string in xs { 1 }` → one diagnostic
  naming `'string'`, ranged on the variable.
- `schema S { let: string }` → one diagnostic naming `'let'`, ranged on the
  field-name token. Rows `e11` / `e12` show the *type*-slot emission at this
  position ranges on the whole declaration because `SchemaFieldSource` carries
  no range; the name slot HAS a token range, so it is the range to use.
- `params: let: string` → one diagnostic naming `'let'`. This face has no
  token; the range comes from the YAML key node, as
  `theta/load/params-type-not-expression` already does in the same loop.
- `enum E { let }` → one diagnostic naming `'let'`, ranged on the variant token.
- `import { let } from …` and `import { a as let } from …` → one diagnostic
  naming `'let'`, ranged on the offending name token. Both statement kinds
  (`import` and `export … from`) are parsed by one function, so both are
  covered by one emission.

The conformant controls c1–c7 keep reporting `[]` and keep registering. Two
behaviours that are silent for a different reason keep theirs: `mut` at the
`for` and `par for` variable keeps `mut-on-immutable-context` ALONE
(§Reproduction (b)) because the loop consumes the modifier before the name is
read, and the contextual keywords `par`, `with` and `subagent` stay outside the
rule because they are absent from `reservedKeywords()`.

The three misfire faces are wrong today under the same sentence, since each
names a token the author wrote correctly. The expected end state is one
diagnostic per offending identifier at its own range, with no second
diagnostic drawn from an adjacency that read past it — but the route there is
a §Fix decision, not a settled expectation, because the two available routes
differ in whether `src/lexer/lexer.ts` is edited.

Registration follows from severity `E` with no further work:
`hasLoadParseError` (`production-composition.ts:2047–2054`) already refuses any
theta carrying an `error`-severity `theta/parse/*` diagnostic.

## Actual behaviour / root cause

**The enforcement surface is three token adjacencies plus a fourth scan, and
none of them is positional in the parser's sense.** `contextualDiagnostics`
(`src/lexer/lexer.ts:810–916`) walks the token stream once. Its `checkName`
worker (`:814–851`) is correct and complete for the rule: a `keyword`-kind
token draws the code and returns (`:819–828`), ahead of the non-`ident` bail
and the first-letter tests. Everything positional lives in the caller, and the
caller is a keyword scan with exactly three arms (`:876–887`):

```
if (t.text === "let")           → checkName(k+1 [+1 for `mut`], "binding")
else if (t.text === "fn")       → checkName(k+1, "binding")
else if (t.text === "schema" || t.text === "enum") → checkName(k+1, "type")
```

The scan asks "what token follows this keyword", not "what production is this
token in". Two consequences follow, and both are measured above.

**Consequence 1 — the six positions are unreachable.** A `for` variable follows
`for`; a schema field name follows `{` or `,`; a `params:` field name is not a
token at all; an `enum` variant name follows `{` or `,`; an `import` specifier
follows `{`, `,` or `as`. None is `k+1` from `let`, `fn`, `schema` or `enum`,
so no call is made and the position is silent. This is the same shape bug 0139
named for the case rule and bug 0148 named for this one; the difference is that
0139 and 0148 each had one position to close and this report has six.

**Consequence 2 — where a head keyword lands IN one of those positions, the
scan fires against the following token.** `for let in xs` puts `let` at the
variable slot; the scan sees a `let` token, calls `checkName(k+1)`, and `k+1`
is `in` — a keyword, so the keyword arm fires and names `in`. The same for
`fn`, `schema` and `enum` at that slot (rows m2–m4). The same mechanism
produces the `as` faces: `schema S { let as "w": string }` and
`import { let as x }` put `let` immediately before `as` (rows w1–w3). The
misfire is therefore not a bug in `checkName` — it is the scan's shape applied
to a position it was never given.

**Consequence 3 — a fourth scan drags an unrelated code in.** `:889–912` keys
on `controlHeads` (`:812`, the set `if` / `for` / `while` / `fn`) and walks
forward for a `{` before the next `stmt-sep`. A schema body, an enum body or an
import clause containing `fn`, `if`, `for` or `while` as a NAME has no `{`
after it on that logical line, so `theta/parse/single-line-if` fires at
`:904–910` ranged on the name (rows w4–w7). Four of the 32 spellings therefore
draw a wrong code at three of the six positions.

**Each of the six parse sites admits a keyword explicitly.** `parseFor`
(`:2136`) and `parseParFor`
(`:4053`) take the variable with `this.advance().text` and no kind test at all.
`parseSchemaObjectBody` (`:2607`), `parseEnumVariants` (`:2753`) and
`parseImportExport` (`:2865–2866`, `:2878–2879`) each admit the name on
`kind === "ident" || kind === "keyword"` — the disjunction exists so a keyword
CAN be a field, variant or specifier name, which is exactly the input
`lexical.md:20` refuses. `extractParsedParams` (`frontmatter.ts:710`) reads a
YAML scalar key, where no token kind exists to test.

**Bug 0148 closed one position and pinned the rest.** Its emission
(`theta-document.ts:2203–2210`) is guarded by `atParamStart`, a `parseFn`
loop-local, so it reaches no other site by construction. Its §Fix (b) recorded
all seven remaining positions with a disposition each, and its witness holds
the seven rows that keep this report's class visible. Nothing in that fix
changes any behaviour measured here: `lexer.ts` is blob-identical, and the six
sites are untouched.

**Why the `params:` face is structurally different.** At the other five sites
the offending thing is a token with a `kind` and a `range`. At `params:` it is
`String(item.key.value)` — a YAML scalar. Membership in `lexical.md:20`'s list
has to be tested against `reservedKeywords()` directly, and the range has to
come from `rangeOf(item.key, lineCounter, lineOffset)`, the pattern the loop's
existing `theta/load/params-type-not-expression` emission already uses
(`frontmatter.ts:715–717`, `:725–731`). That is what bug 0148 meant by "a
different lowering path, a different input class", and it is the one face where
this report's rule and bug 0149's rule share a subject: `Ok`, `Err` and
`Result` are uppercase-first identifier-shaped strings with no token kind to
separate them.

## Why it matters

- **Spellings the spec refuses load, register and run, at six positions.**
  Every row in
  §Reproduction (a) reports `[]`, passes `hasLoadParseError` and registers.
  `lexical.md:20`'s sentence carries no scope list and the registered *Trigger*
  names no position, so nothing in the corpus says these positions are exempt —
  the exemption exists only in the enforcer's shape.
- **The `params:` face reaches the wire.** Row L1 shows a reserved spelling
  becoming a property key in the lowered JSON Schema and a `wireName` on the
  bypass field. That schema is what the binder and the provider receive, so the
  refused spelling leaves the parser entirely.
- **Five of the six positions produce a wrong diagnostic for some spellings
  rather than none.** Rows m1–m4, m6, m8–m10 name `'in'` where the offender is
  the loop variable; rows w1–w3 name `'as'`; rows w4–w7 report a
  single-line-body error for a field, variant or specifier name. An author who
  writes `for let in xs` is sent to the wrong token, and one who writes
  `schema S { fn: string }` is told to brace a body that is already braced.
  Only the `params:` field name is silent for all 32 spellings.
- **Two positions declare a slot nothing can use.** A `for` variable named
  `string` is unreadable (row d1); a `params:` field named `let` is unreadable
  and the attempt draws a wrong code with a message quoting a newline as the
  binding name (row d3); a `schema` field named `let` makes the schema
  unconstructible and both resulting diagnostics name the wrong subject
  (row d5).
- **The enforced/unenforced split is invisible from the spec.** `let let = 1`,
  `fn let()`, `schema let`, `enum let` and `fn h(let: string)` are all refused
  (rows k1–k5); `for let in xs`, `schema S { let: … }`, `params: let:`,
  `enum E { let }` and `import { let }` are not. The discriminator is which
  keyword precedes the identifier, not which rule governs it.
- **Seven committed test rows currently assert the gap open.** Rows `e4`,
  `e4p`, `e5`, `e6`, `e8`, `e9a` and `e9b` pin `[]` at each position. They are
  tripwires by design — 0148 wrote them so enforcement cannot widen silently —
  but until this report is fixed they are also the record that no test can red
  on the defect.
- **The class is bounded and should be stated as bounded.** The committed
  corpus contains zero instances at every position (§Reproduction (i)); the
  `import` SOURCE slot is semantically dead (rows x1–x3); and at the `for`,
  `par for`, `enum`-variant and `import` faces the keyword stays inside the AST
  (rows L3, L4, L6, L7, L8) with no value corrupted. The `params:` face is the
  exception, and it is the one that reaches a provider.

## Non-goals

- **The `match` pattern binder.** Bug 0141's §Fix (a) half 2 claims this
  position for the same code under the same sentence, at `parsePattern`'s tail
  arm. Row `e7` protects it and stays green. Measured unchanged:
  `match v { match => 1 }` reports `[]` (row n1).
- **Keyword-at-`Type` positions.** Bug 0044's family, governed by
  `NamedType ::= Ident`. Its four shipped emitters
  (`theta-document.ts:5117`, called at `:5875`, `:6294`, `:6587`) reach the
  schema-body and `params:` field TYPES and must stay byte-unchanged; rows
  `e11` / `e12` pin them firing and `e10` pins the `fn` parameter's type slot
  silent. The NAME slot and the TYPE slot of one field are different rules'
  subjects.
- **The `fn` parameter name.** Bug 0148, fixed in 0.81.0. Its twelve `a`-rows
  and its `atParamStart` guard must keep their behaviour exactly; row k5 is the
  control.
- **The case rules at these positions.** `theta/parse/binding-case-mismatch`
  at the schema field name and the `params:` field name is bug 0149's claim,
  being fixed concurrently. `theta/parse/schema-case-mismatch` at the `enum`
  variant name (`lexical.md:15`, `schemas.md:78`) and any case rule at the
  `for` / `par for` variable or the `import` specifier are unclaimed and not
  claimed here; measured silent at this HEAD (`enum E { a }`, `for X in xs`,
  `par for X in xs`, `import { A }`, `import { a as B }` all report `[]`).
  Bug 0149's §Non-goals records the `enum`-variant case half in the same terms
  ("a real gap … unfiled at this HEAD and this report does not claim it") and
  its rows o4 / o5 record the `for` / `par for` variable as outside
  `lexical.md:16`'s list — conformant for the CASE rule, and silent about this
  one.
- **The `mut` recovery at the `for` and `par for` variable.** `for mut in xs`
  draws `mut-on-immutable-context` alone (§Reproduction (b)) because
  `parseFor` consumes the modifier before the name is read — the same recovery
  shape bug 0148 recorded at the `fn` parameter and guarded against with
  `atParamStart`. Row m9 pins the ordered pair when a real keyword follows the
  modifier. Repairing the recovery is not this report's subject.
- **The discard binding `_`.** `lexical.md:20` reserves it separately and by a
  different mechanism ("it is not a regular identifier").
- **An inline object type's field name.** Named as bug 0149's third face and
  not measured here.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `theta-document.ts` and `frontmatter.ts`; that is bug 0134's adjudicated
  do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects.

**(a) The site — one route per position, or one shared helper.**

- *Route 1 — per-position parser-leaf emissions, mirroring bug 0148's shape.*
  Six emissions: `parseFor` at `:2136`, `parseParFor` at `:4053`,
  `parseSchemaObjectBody` at `:2606–2614`, `parseEnumVariants` at `:2753`,
  `parseImportExport` at `:2868` and `:2881`, and `extractParsedParams` at
  `frontmatter.ts:710`. Each reads the token (or, at `params:`, the key string)
  already in hand, tests `kind === "keyword"` (or `reservedKeywords().has(name)`),
  and pushes the registry *Message* with the spelling interpolated, ranged on
  the name. Argument: it is bug 0148's shipped shape, it needs no new export,
  and each site already emits a registered code of its own (`checkMutModifier`
  in `parseFor` / `parseParFor`, `unsupported-feature` in
  `parseSchemaObjectBody`, `checkImportReservedSynthesisedName` in
  `parseImportExport`, `params-type-not-expression` in `extractParsedParams`).
  Cost: six near-identical predicates, and a seventh reader has to find them
  all.
- *Route 2 — one shared helper called from the six sites.*
  `reservedKeywordAsIdentifierDiagnostic` (`theta-document.ts:5117`) already
  exists for bug 0044's four `Type`-position callers and takes
  `(keyword, range, file)`. Reusing it makes the six NAME-position callers
  read like the four TYPE-position ones. Constraint: it is bug 0044's function
  with four pinned callers, and `frontmatter.ts` does not import from
  `theta-document.ts` today — the `params:` face either duplicates the shape or
  the helper moves to a module both can import. Whichever is chosen, rows
  `e11` / `e12` must stay byte-identical in behaviour.
- *Route 3 — widen the lexer's dispatch.* Rejected shape unless the run argues
  otherwise: the dispatch is an adjacency scan, which is what misfires in the
  first place; the `params:` face has no tokens and cannot be reached from
  there at all; and it edits `src/lexer/lexer.ts`, which bug 0148 kept
  blob-identical because bugs 0051 and 0135 hold citations in it.
  `lexer.ts:806–808` hands this class to a parser leaf in terms.

**(b) The `params:` face is a separate sub-decision.** It has no token, so the
predicate is string membership in `reservedKeywords()` (`lexer.ts:159–166`) and
the range is `rangeOf(item.key, lineCounter, lineOffset)`. The severity choice
follows the position, not the module: the code is `E` in the `theta/parse/`
namespace, and the sibling emission in the same loop is `theta/load/`. The run
must state which namespace this face emits under and why; `hasLoadParseError`
refuses on either, so registration does not decide it.

**(c) The misfire faces — three of them, and one route touches the lexer.**

1. *The `for` / `par for` face (rows m1–m4, m6, m8–m10).* Adding a parser-leaf
   emission at the variable does NOT remove the lexer's diagnostic, so
   `for let in xs { 1 }` would report **two** diagnostics — the correct one at
   `let` and the misfiring one at `in`. Routes: (i) accept two and pin the
   order; (ii) narrow the lexer's `let` / `fn` / `schema` / `enum` arms to skip
   a head that is itself in a `for` variable slot, which edits `lexer.ts` and
   shifts 0051's and 0135's citations; (iii) narrow the arms by requiring the
   `k+1` token to be `ident`-kind, which suppresses the misfire everywhere at
   once but also suppresses `let let = 1` (row k1) and is therefore refuted by
   that row. Route (iii) is measurable-false and is recorded here so it is not
   re-derived.
2. *The `as` face (rows w1–w3).* Same mechanism, same three routes, at the
   schema wire-rename clause and the import alias clause.
3. *The `single-line-if` face (rows w4–w7).* Independent of the reserved rule:
   `controlHeads` (`lexer.ts:812`) is a different scan and a different code. A
   fix that closes the schema-field, enum-variant and import-specifier
   positions leaves `schema S { fn: string }` reporting the new correct
   diagnostic AND `single-line-if`. The run states the resulting list and its
   order, or narrows the fourth scan — the same `lexer.ts` cost.

**(d) Which positions land together.** Three of the six sites are contested by
an open report and three are not.

- **Uncontested:** `parseFor`, `parseParFor` and `parseEnumVariants`. No open
  report's §Fix edits any of them. Bug
  [0126](./0126-plain-for-binds-no-loop-variable.md)'s `for`-loop subject is
  `type-layer-checks.ts`, not the parse site; bug 0149 cites
  `parseEnumVariants` only to exclude the variant position from its claim
  (its §Non-goals, "unfiled at this HEAD and this report does not claim it").
  These three can land in one commit.
- **Contested by 0149:** `parseSchemaObjectBody` and `extractParsedParams`,
  being edited concurrently under the case rule. Whichever fix lands second
  rebases the other's witness rows.
- **Contested by 0100:** `parseImportExport`'s specifier loop. Open bug
  [0100](./0100-production-excluded-import-export-spellings-parse-clean.md)'s
  §Fix refuses production-excluded spellings inside that loop, naming the
  alias branch and the guard that has no else — the same lines this report's
  import face writes to. Open bug
  [0101](./0101-from-bearing-reexport-materialises-nothing.md) touches the
  same function at its `validatePathLiteral` call, a disjoint region.

Splitting this report by contest — the three uncontested positions first, the
schema-field and `params:` faces after 0149 lands, the import face coordinated
with 0100 — is available and is the lower-coordination route; the run decides,
and records which.

**(e) Constraints that bind any route**, each with the row that reds if it
moves:

- Bug 0148's twelve `a`-rows and its `atParamStart` guard — the `fn` parameter
  emission does not move (row k5).
- Bug 0141's `parsePattern` tail arm is not approached; row `e7` stays green.
- Bug 0044's four emitters stay byte-unchanged; rows `e11` / `e12` stay firing
  with their current ranges, row `e10` stays silent.
- `mut` at the `for` variable keeps `mut-on-immutable-context` ALONE
  (§Reproduction (b)); a naive emission at `:2136` would fire on the recovery
  artefact, the same failure mode 0148's `atParamStart` guard exists to
  prevent.
- The contextual keywords `par`, `with` and `subagent` stay silent at every
  position — guaranteed by reading `kind === "keyword"` or
  `reservedKeywords()` rather than minting a second list (rows `ck1`–`ck3`).
- The conformant controls c1–c7 keep reporting `[]` and keep registering.
- Seven tripwire rows (`e4`, `e4p`, `e5`, `e6`, `e8`, `e9a`, `e9b`) invert;
  `e14` inverts if and only if the misfire is repaired. Each must be retaken
  with the same whole-list `toEqual` discipline, not deleted.

**(f) GOV-15.** `source-language-stability.md:25` dispositions this as an
addition under the diagnostic-registry carve-out, a fortiori because no
*Trigger* is edited — the implementation moves onto a *Trigger* that already
covers the position. Obligation 1 (corpus sweep, walking `.thetalib`
explicitly) is discharged by §Reproduction (i) at this HEAD and must be re-run
at fix time. Obligation 2 (release-notes record) names the newly refused input
classes, one per position closed. DIAG-2 is not engaged (no row added, removed
or re-triggered); DIAG-4 is satisfied by rendering the *Message* from the
registry.

**(g) Witness.** One offline, provider-free file on
`tests/fn-param-name-reserved-keyword.test.ts`'s shape: whole-list ordered
`toEqual` over unfiltered `doc.diagnostics` on every row, every expected
message read through `parseRegistry` / `registryMessage` with the `<keyword>`
slot filled (DIAG-4), `parseDoc` from `tests/helpers/e2e-s1.ts`. It must carry
the firing row and its range at each of the six positions, the whole
32-spelling sweep at each (the counts in §Reproduction (b) are the before
picture), the conformant control at each, the `.thetalib` route, the binding
rows L1 and L5–L8, the registration rows, and the misfire rows as they are
decided in (c). A live H8a registration-denial cell on the bug 0148 cell's
shape covers the composition root.

## Provenance

Filed from bug 0148's fix report (`.pi/tmp/fixes/0148-report.md`), §"Decisions
I settled" — the seven-row disposition table — and §Residuals 2 and 4, which
name this class and record it unfiled at HEAD `751fa708`: "Six unclaimed silent
identifier positions remain open … Each sits inside `lexical.md`'s unqualified
sentence and the position-free *Trigger*, each is measured silent, and each is
now pinned by a tripwire row that reds if enforcement widens without a
decision", and "Row e14's misfire is unrepaired. `for let in xs { 1 }` still
emits the code against `'in'` from the lexer's `let` adjacency."

Every citation in this document was verified against the tree at HEAD
`1a214680`. Bug 0148's fix inserted 29 lines at `theta-document.ts:2171` and
bug 0139's inserted 19 at the same place, so absolute citations below `:2171`
taken from documents written before `751fa708` are stale by up to +48; the line
numbers here are re-read at this HEAD and the symbol names are given alongside
them. `src/lexer/lexer.ts` is unchanged since `9fe13534` (0.71.0) and its
citations are stable.

Measurements: three scratch vitest files driving `parseDoc`
(`tests/helpers/e2e-s1.ts:39`), run against a copy of the tree whose
`src/parser/theta-document.ts`, `src/parser/frontmatter.ts`,
`src/parser/params.ts` and `src/lexer/lexer.ts` were restored from
`git show HEAD:<path>` and verified blob-identical to HEAD, because a sibling
orchestrator fixing bug 0149 held uncommitted prototype edits in two of those
files during the session. All three scratch files were deleted after the run.
No source file, test file, `docs/bugs/README.md` entry or other bug document is
modified by this filing.
