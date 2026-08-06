# Bug 0148 — `docs/spec_topics/lexical.md:20` reserves 32 keywords and makes any one of them "in identifier position" `theta/parse/reserved-keyword-as-identifier`, a code whose registered *Trigger* (`code-registry-parse.md:21`) names no position at all, but its lexer enforcer is `checkName`'s keyword arm (`lexer.ts:819–828`) reached through three keyword adjacencies (`:876–886`) and bug 0139's parser-leaf emission guards itself on `pTok.kind === "ident"` (`theta-document.ts:2191`), so `fn h(let: string): number { 1 }` reports `[]` — 31 of the 32 keywords are silent at the `fn` parameter name, the token binds as the parameter name verbatim, and the theta registers and runs

- **Status:** open. Residual 1 of the bug 0139 fix (0.79.0, `d11aef29`),
  recorded in that fix's report (`.pi/tmp/fixes/0139-report.md:285–293`) and
  as sub-question (a′) of its §Fix (0.79.0): "the reserved-keyword arm is NOT
  closed". No ordering dependency: this report's site is `parseFn`'s parameter
  loop, which no open report pins bytes in.
- **Sev/Diff estimate:** S1/D2 — `lexical.md:20`'s sentence is unqualified and
  the registered *Trigger* names no position, so `fn h(let: string)` is an
  input the spec refuses that emits no diagnostic, passes `hasLoadParseError`
  and runs (S1's "inputs accepted that the spec refuses … with no diagnostic,
  declared constraints not enforced"). The harm is bounded and stated as
  bounded in §Why it matters: no value is corrupted, no verdict is wrong, and
  the committed corpus contains zero instances (§Reproduction (f)). Two
  consequences beyond a refused spelling are measured: the accepted parameter
  is **unreadable** — a bare keyword in value position takes the `null` path
  (`theta-document.ts:3543–3546`, `:3605`), so the slot the declaration opens
  can never be named by the body (§Reproduction (d), rows d6–d8) — and the
  spelling is rendered back to the author inside another code's message
  (`fn 'h' argument 0 ('let') type mismatch`, row c4). D2 because the emission
  is one predicate at a branch point bug 0139 already opened
  (`theta-document.ts:2191`), the registry needs no edit — the *Trigger* is
  position-free and the *Message* is already rendered byte-exact at the three
  enforced adjacencies — and the corpus sweep is measured zero; not D1 because
  §Fix leaves the site and the disposition of six other silent identifier
  positions to the run, and a GOV-15 discharge plus a witness are owed.
- **Kind:** defect — implementation, against a written sentence and its
  registered *Trigger*. Three elements.
  1. **The rule is written with no position qualifier.**
     `docs/spec_topics/lexical.md:20` lists 32 reserved spellings — `let`,
     `mut`, `fn`, `if`, `else`, `for`, `in`, `while`, `break`, `continue`,
     `return`, `match`, `schema`, `enum`, `import`, `export`, `from`, `as`,
     `by`, `invoke`, `true`, `false`, `null`, `Ok`, `Err`, `Result`, `string`,
     `number`, `integer`, `boolean`, `array`, `void` — and states the
     consequence without a scope list: "Using one of these in identifier
     position is `theta/parse/reserved-keyword-as-identifier`". The registry
     row (`docs/spec_topics/diagnostics/code-registry-parse.md:21`) carries the
     same shape: *Trigger* "Reserved keyword used in an identifier position".
     `docs/reference/grammar.md:80–86` restates the list under the same code.
     A `fn` parameter name is an identifier position — `FnParam ::= Ident ":"
     Type` (`docs/reference/grammar.md:254`,
     `docs/spec_topics/grammar.md:140`). Measured,
     `fn h(let: string): number { 1 }` reports `[]`.
  2. **The lexer enforcer reaches three adjacencies.** `checkName`
     (`src/lexer/lexer.ts:814–851`) tests the keyword arm first
     (`:819–828`), bails for a non-`ident` (`:829–831`), then tests the first
     letter (`:832–850`). Its dispatch (`:876–886`) calls it at exactly three
     token adjacencies: the identifier after `let` (skipping `mut`), after
     `fn`, and after `schema` / `enum`. A parameter name's predecessor is `(`
     or `,`, so no call reaches it — the same shape bug 0139 named for the
     case rule.
  3. **Bug 0139's parser-leaf fix reimplemented the third stage only.**
     `parseFn`'s parameter loop captures the token at
     `src/parser/theta-document.ts:2184` and guards the new
     `binding-case-mismatch` emission on `pTok.kind === "ident"` (`:2191`).
     Keywords lex as `kind: "keyword"` (`lexer.ts:677`,
     `reserved.has(value) ? "keyword" : "ident"`; measured at row c1), so the
     guard excludes them by construction. That guard is correct for the case
     code, whose *Trigger* reads "**Identifier** in a binding / parameter /
     fn-name / field-name position" (`code-registry-parse.md:19`) — and it is
     exactly what leaves the keyword arm unimplemented at the position, since
     `reserved-keyword-as-identifier`'s subject is a token that is by
     construction not an identifier.
- **Related:**
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **fixed
    (0.79.0)**, the origin and the same position. Its §Reproduction row d1
    measures this cell and its §Non-goals bullet
    "`theta/parse/reserved-keyword-as-identifier` at the parameter position"
    states it as "a bonus to state, not a claim this report makes". Its §Fix
    (a) asked the run to "state which"; the run stated it, and stated it
    closed **out**: sub-question (a′), "the reserved-keyword arm is NOT
    closed — a different registered code under a different spec sentence
    (`lexical.md:20`), and closing it would widen the GOV-15 sweep to a second
    input class for no witness row." That decision stands as recorded; this
    report is the follow-up it names. Its shipped witness
    (`tests/fn-param-name-case.test.ts:72–77`) declares the position
    "OUT OF SCOPE, deliberately unrowed", so a fix here adds the first rows
    that can red on it. **0139's fix does not close this and re-running it
    would not**: measured `[]` both at `3efdb4ac` (0139's §Reproduction d1)
    and at `d11aef29` (row a1 below).
  - [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md) —
    **open**, and the closest sibling: its §Fix (a) half 2 is "the reserved
    keyword in pattern position", the same code under the same sentence
    (`lexical.md:20`) and the same *Trigger* (`code-registry-parse.md:21`), at
    the `match` pattern binder. **The two are disjoint and neither fix reaches
    the other**: 0141's site is `parsePattern`'s tail arm, whose
    `ident` / `keyword` branch and identifier return are at
    `theta-document.ts:3902` and `:3954` at this HEAD; this report's site is
    `parseFn`'s parameter loop at `:2184–2203`. Row e7 measures the pattern
    position silent, unchanged. Two coordination facts: whichever fix lands
    second inherits the other's answer to "where is this code emitted from",
    and a fix here inserts lines above `:3902`, shifting 0141's citations
    again (see 0134). 0141's own §Fix (b) route 1 contemplates
    `binding-case-mismatch` at a pattern head and calls that a DIAG-2 *Trigger*
    edit; no *Trigger* edit is in question here, which is the difference
    between the two reports' deliverables.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, the precedent that settles the site question's
    principle. It wired `reserved-keyword-as-identifier` at *type* positions
    from a parser leaf — `lowerTypeExpr`'s atom section, recording on a second
    sink that "each of the four callers renders as
    `reserved-keyword-as-identifier`"
    (`tests/reserved-keyword-type-position.test.ts:53–58`) — so the code
    already has parser-leaf emitters beside the lexer's three adjacencies and
    adding a fourth breaks no architectural rule. Measured live: row e11
    (`schema X { f: let }`) and row e12 (a `params:` right-hand side `let`)
    both fire, which is 0044's fix. Its four callers do **not** include the
    `fn` parameter's *type* slot or a `let` ascription — rows e9 and e10 are
    silent — but that is 0044's family (a `Type` position), not this
    report's; see §Non-goals.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, sharing `checkName` and nothing else. Its subject is a
    *lowercase* `NamedType` at a **reference** position under `lexical.md:15`,
    and its deliverable is an adjudication because
    `schema-case-mismatch`'s *Trigger* (`code-registry-parse.md:20`) names
    declaration positions only. This report owes no adjudication: its code's
    *Trigger* names no position, so the implementation is what moves. If a fix
    here lands at the parser leaf it edits no `lexer.ts` line and induces no
    drift in 0051's citations; if it lands in `contextualDiagnostics` it does.
    Citation drift to be aware of when reading 0051, unchanged since 0139
    recorded it: it cites the `schema` / `enum` adjacency as
    `lexer.ts:873–874`; at this HEAD `:873–874` is the template-body /
    keyword guard and the adjacency is `:885–886`.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    citation-drift class this fix will feed. Bug 0139's own +19-line insertion
    at `theta-document.ts:2185` already shifted every citation below it: 0141's
    `:3883` / `:3935` now read `:3902` / `:3954`, and its `:3522–3527` now
    reads `:3541–3546` (all three verified below). A fix here inserts at the
    same place and shifts them again. 0139's fix record pins this as the
    adjudicated do-not-fix class: "disclosed, not chased".
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — **open**, and
    the prior record of the schema-**field-name** sibling. Its §Non-goals
    bullet (`:533–541`) is scoped to the *casing* half of that position
    ("`schema Cat { Kind: \"cat\" }` loads clean at HEAD"), not the keyword
    half. Row e5 measures the keyword half (`schema S { let: string }`) silent
    and unclaimed by any report. Not filed here (§Non-goals).
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, named to
    keep §Reproduction (c)'s reading honest: rows c5 and c6 call the pin's
    `h` with zero and two arguments and draw nothing, which is 0131's subject
    and not evidence about the parameter's name. The type check that *does*
    fire (row c4) is what shows the parameter is a first-class parameter
    downstream.
- **Affected** (every citation verified at HEAD `d11aef29`, 0.79.0):
  - **The spec rule** — `docs/spec_topics/lexical.md:20`, the reserved-keyword
    paragraph: the 32 spellings, the sentence "Using one of these in identifier
    position is `theta/parse/reserved-keyword-as-identifier`", the separate
    reservation of the discard `_`, and the `array` / `Result` carve-out that
    makes those two reachable "in type position" only. `:13` — the identifier
    grammar `[A-Za-z_][A-Za-z0-9_]*` and "The **first letter's case is
    enforced** by the parser". `:16` — the lowercase-first bullet, bug 0139's
    rule and not this one. `:3` — every rule on the page applies to `.theta`
    and `.thetalib` alike.
  - **The registered row** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:21`.
    `theta/parse/reserved-keyword-as-identifier`, severity `E`, namespace
    `parse`. *Trigger*: "Reserved keyword used in an identifier position" —
    no position list, unlike `:19`'s four-entry enumeration for the case code.
    *Message*: `reserved keyword '<keyword>' cannot be used as an identifier`.
    Mirror without a *Trigger* column: `docs/reference/diagnostics.md:67`.
  - **The lexer enforcer** — `src/lexer/lexer.ts:810–916`
    (`contextualDiagnostics`), called once at `:125`. `checkName`
    (`:814–851`): the keyword arm at `:819–828`, the non-`ident` bail at
    `:829–831`, the first-letter test at `:832–833`, the
    `binding-case-mismatch` emission at `:834–841`, the
    `schema-case-mismatch` emission at `:842–850`. The **dispatch** is
    `:876–886`: `let` with the `mut` skip at `:876–882`, `fn` NAME at
    `:883–884`, `schema` / `enum` NAME at `:885–886`. Three positions;
    `rg -n 'checkName' src/lexer/lexer.ts` returns four hits — the definition
    at `:814` and those three calls. Unchanged since 0.71.0
    (`git log -1 -- src/lexer/lexer.ts` → `9fe13534`), so bug 0139's fix
    touched none of it.
  - **The token classification that decides the guard** —
    `src/lexer/lexer.ts:676–680`, `kind: reserved.has(value) ? "keyword" :
    "ident"` at `:677`, against the 32-member set `reservedKeywords()` returns
    (`:159–166`, doc comment `:152–158`). Measured at row c1: the parameter
    slot of `fn h(let: string)` lexes `keyword:"let"`.
  - **The scope note predicting this** — `src/lexer/lexer.ts:806–808`:
    "full identifier-position coverage (**every reserved word in every
    identifier slot**) is a parser-leaf obligation; the lexer core enforces the
    positions its closed Tests obligations name." The clause names this
    report's class in terms. The module header (`:82–84`) lists
    "the reserved-keyword-as-identifier rule" among what the lexer enforces,
    without naming which positions.
  - **The parse site, and the guard that excludes the keyword** —
    `src/parser/theta-document.ts:2151` (`parseFn`), parameter loop
    `:2171–2213`. `:2184` is `const pTok = this.advance();`; `:2185–2190` is
    the comment bug 0139 added, which states the guard's provenance ("The
    predicate and the `ident` guard mirror `checkName`'s binding arm");
    `:2191` is `if (pTok.kind === "ident") {`; `:2192–2193` is the first-letter
    predicate; `:2194–2202` is the `binding-case-mismatch` emission;
    `:2209` is `params.push({ name: pTok.text, type: pType });`. The token,
    its `kind` and its `range` are all in hand at `:2191` — the branch point
    a keyword arm needs, already written.
  - **The per-parameter diagnostic precedent, in the same loop** —
    `src/parser/theta-document.ts:2172–2183`, the `mut`-on-parameter check:
    `const mutTok = this.advance()` (`:2175`), `checkMutModifier` with
    `{ position: "fn-param" }` and `mutTok.range` (`:2176–2179`), push
    (`:2180–2182`). It is also why `mut` is the one reserved word of the 32
    that is not silent at this position (row b2) and why its recovery binds
    two junk parameters (row e13).
  - **The `FnParam` node** — `src/parser/theta-document.ts:409–412`, `name`
    and `type`, no range. The keyword's text is stored verbatim as the
    parameter name: measured at row c2,
    `params: [{ "name": "let", "type": "string" }]`, structurally identical
    to the `x` control (row c3).
  - **The downstream consumer that renders the name back to the author** —
    `theta/parse/fn-arg-type-mismatch`, row c4:
    `fn 'h' argument 0 ('let') type mismatch: expected string, got integer`.
    The control with a conformant parameter (row c4′) differs only in the
    quoted name.
  - **The value-position path that makes the binding unreadable** —
    `src/parser/theta-document.ts:3541–3546`, the comment naming
    "the keyword-in-value-position `null` path … mirroring the other reserved
    keywords that reach here", and `:3605`, `parseAtom`'s `return null` for any
    token the atom section did not classify. Rows d6–d8 measure the
    consequence: a body that names the keyword parameter answers `null`, with
    no diagnostic, on a `fn` whose declared return type is `string`.
  - **The registration consequence** —
    `src/extension/production-composition.ts:2047–2054`
    (`hasLoadParseError`) drops a theta carrying any `error`-severity
    `theta/load/*` or `theta/parse/*` diagnostic. Measured directly at rows
    d1–d4: the pin is `false` (registers) and 0139's now-enforced `P` spelling
    is `true` (does not). Bug 0139's doc cites this function at `:2045`, which
    was correct at `3efdb4ac`; bug 0137's fix (0.78.0) shifted it +2.
  - **The runtime the keyword parameter reaches** —
    `src/runtime/statement-executor.ts:416` (and its twin at `:503`),
    `scope.defineLocal((fn.params[i] as FnDecl["params"][number]).name,
    arg.value, false)`. Binding is positional and name-blind, so the argument
    binds under the keyword spelling — into a slot no expression can read.
    Row d5 runs the pin end to end and answers `"body"`.
  - **Existing coverage of the code, and of this gap: asymmetric.**
    `tests/lexer-core.test.ts:164–175` is the code's only positional witness —
    `let match = 1`, asserting the code and the registry message.
    `tests/reserved-keyword-type-position.test.ts` is bug 0044's shipped
    witness for the *type* positions (`:138` defines the code constant;
    `:689–697` pins the registry *Message*; `:1129` an `@<T>` cell).
    `tests/subagent-fn.test.ts:404–421` and `tests/par-for.test.ts:175–183`
    assert the code does **not** fire for the contextual keywords `subagent`,
    `with` and `par`. **No test asserts the `fn` parameter position for this
    code in either direction**, and bug 0139's witness excludes it explicitly
    (`tests/fn-param-name-case.test.ts:72–77`), so the fix's own witness is
    the first.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15's
    three observables; `:9` — the loads-cleanly predicate ("emits no diagnostic
    of effective severity `error`"), which every §Reproduction (a) defect row
    satisfies today; `:25` — the diagnostic-registry carve-out and the sentence
    that dispositions this fix: "a DIAG-2 *trigger* change is dispositioned by
    the same principle, in-scope as an addition for inputs newly brought into
    the code's emission set".
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the
    registry is closed; adding, removing, or changing a code's trigger is a
    spec change). `:74` — DIAG-4 (the *Message* column is normative). Neither
    is edited by the fix this report describes: the code exists, its *Trigger*
    is position-free, and its *Message* is already rendered byte-exact at the
    three enforced adjacencies (rows a15–a21).
- **Observed at:** `0.79.0` (HEAD `d11aef29`). Offline, deterministic; no live
  model, no provider. Parse rows through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---` and a trailing `1` supplying the final
  value, so the source under test is line 4; the `.thetalib` row passes
  `path = "lib.thetalib"` with no frontmatter. Token rows through `lexSrc`
  (`:50`). Runtime rows through `parseThetaDocument` →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`,
  the harness shape `tests/non-object-receiver-gate.test.ts:221–292`
  establishes. Three scratch vitest files, run on the outputs quoted below,
  then deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug
  document are unmodified by this filing.

## Summary

`lexical.md:20` reserves 32 spellings and states, without a scope list, that
using one "in identifier position" is
`theta/parse/reserved-keyword-as-identifier`. The registered *Trigger*
(`code-registry-parse.md:21`) is the same shape: "Reserved keyword used in an
identifier position", naming no position. A `fn` parameter name is an
identifier position by the grammar (`FnParam ::= Ident ":" Type`).

Nothing enforces it there. The code's lexer implementation is `checkName`'s
keyword arm (`src/lexer/lexer.ts:819–828`), reached through a dispatch that
scans for keyword tokens and inspects the identifier that follows
(`:876–886`) — `let` / `let mut`, `fn` NAME, `schema` / `enum` NAME. A
parameter name follows `(` or `,`, so no call reaches it. Bug 0139's fix
opened a parser-leaf emission in `parseFn`'s parameter loop for the *case*
rule, and guarded it on `pTok.kind === "ident"` (`theta-document.ts:2191`).
Keywords lex as `kind: "keyword"` (`lexer.ts:677`), so the guard excludes
them. The guard is right for the case code, whose *Trigger* says "**Identifier**
in a … parameter … position"; it is also why the keyword arm has no
implementation at this position.

Measured at this HEAD: `fn h(let: string): number { 1 }` reports `[]`. So do
31 of the 32 reserved spellings at the same slot — the exception is `mut`,
which the loop's modifier check consumes before the name is read (row b2), and
which draws a diagnostic about the modifier rather than the identifier. The
unannotated, multi-parameter, trailing-comma, `subagent fn`, `.thetalib` and
call-site forms are all silent too. The controls fire: `let match = 1`,
`let let = 1`, `let mut match = 1`, `fn match()`, `fn let()`, `schema Ok` and
`enum Result` each draw the code with the registry message. The discriminator
between a firing position and a silent one is which keyword precedes the
identifier, not which rule governs it.

The parse binds the keyword as the parameter name verbatim —
`params: [{ "name": "let", "type": "string" }]` — and the theta registers
(`hasLoadParseError` is `false`) and runs. Nothing downstream is corrupted: the
argument binds positionally, and the fn-arg type check fires normally, quoting
the reserved spelling back in its message. What the binding cannot do is be
read: a bare reserved word in value position takes `parseAtom`'s `null` path
(`theta-document.ts:3543–3546`, `:3605`), so a body naming the parameter
answers `null` with no diagnostic even where the declared return type is
`string`.

The parameter position is not the only silent identifier position, and this
rule's silent set is larger than the case rule's, because `lexical.md:20`
bounds itself by no position list where `:16` names four. Measured silent
below: the schema field name, the `params:` frontmatter field name, the `enum`
variant name, the `for` / `par for` variable, the `match` pattern binder
(bug 0141's claim), and both `import` specifier binding forms. Measured
firing: the schema-body field type and the `params:` field type, which bug
0044 wired from a parser leaf in 0.54.0.

## Reproduction

Offline, deterministic, at `d11aef29`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---` and a trailing `1` except where noted, so
the source under test sits on line 4. Each cell is the whole diagnostic list in
emission order, unfiltered, with each range as
`line:col-line:col`.

### (a) The defect, and the controls that show the code is live elsewhere

| # | source | diagnostics |
|---|---|---|
| a1 | `fn h(let: string): number { 1 }` | `[]` |
| a2 | `fn h(string: string): number { 1 }` | `[]` |
| a3 | `fn h(Ok: string): number { 1 }` | `[]` |
| a4 | `fn h(Err: string): number { 1 }` | `[]` |
| a5 | `fn h(Result: string): number { 1 }` | `[]` |
| a6 | `fn h(match: string): number { 1 }` | `[]` |
| a7 | `fn h(a: string, let: string): number { 1 }` | `[]` |
| a8 | `fn h(let: string,): number { 1 }` | `[]` |
| a9 | `fn h(let): number { 1 }` | `[]` |
| a10 | ``subagent fn s(let: string) { @`hi` }`` | `[]` |
| a11 | `.thetalib`: `fn t(let: string): string { "a" }` | `[]` |
| a12 | `fn h(let: string): number { 1 }` + `let z = h("a")` + `z` | `[]` |
| a13 | **control** `fn h(x: string): number { 1 }` | `[]` |
| a14 | **control** `fn h(P: string): number { 1 }` | `theta/parse/binding-case-mismatch`: `binding name must start with a lowercase letter or _` @4:6-4:7 |
| a15 | **control** `let match = 1` | `theta/parse/reserved-keyword-as-identifier`: `reserved keyword 'match' cannot be used as an identifier` @4:5-4:10 |
| a16 | **control** `let let = 1` | same code, `'let'` @4:5-4:8 |
| a17 | **control** `let mut match = 1` | same code, `'match'` @4:9-4:14 |
| a18 | **control** `fn match(): number { 1 }` | same code, `'match'` @4:4-4:9 |
| a19 | **control** `fn let(): number { 1 }` | same code, `'let'` @4:4-4:7 |
| a20 | **control** `schema Ok = string` | same code, `'Ok'` @4:8-4:10 |
| a21 | **control** `enum Result { A }` | same code, `'Result'` @4:6-4:12 |

a1 is the report's witness: grammar-conformant in shape
(`FnParam ::= Ident ":" Type` with the annotation present), one rule violated,
nothing reported. a7 shows the silence is per-parameter and survives a
conformant first parameter. a8–a12 show a trailing comma, a missing annotation,
the `subagent` modifier, the `.thetalib` route and a call site change nothing.
a14 is the sharpest control: **the same loop iteration** now emits bug 0139's
case code for `P` and nothing for `let`. a15–a21 are the three enforced
adjacencies, which prove the code, its message and its `E` severity are live at
this HEAD and that only the position differs.

### (b) The whole reserved list at the same position

All 32 spellings of `lexical.md:20` substituted into
`fn h(<keyword>: string): number { 1 }`:

```
@@ n1 silent count=31 :: ["let","fn","if","else","for","in","while","break",
   "continue","return","match","schema","enum","import","export","from","as",
   "by","invoke","true","false","null","Ok","Err","Result","string","number",
   "integer","boolean","array","void"]
@@ n2 non-silent count=1 :: ["mut → [\"theta/parse/mut-on-immutable-context |
   'mut' is not permitted in this binding position | 4:6-4:9\"]"]
```

| # | source | diagnostics |
|---|---|---|
| b1 | 31 of 32 keywords at the parameter name | `[]` |
| b2 | `fn h(mut: string): number { 1 }` | `theta/parse/mut-on-immutable-context`: `'mut' is not permitted in this binding position` @4:6-4:9 |
| b3 | `fn h(mut let: string): number { 1 }` | the same single diagnostic, @4:6-4:9 — and nothing about `let` |

b2 is not an exception to the defect. `mut` is consumed by the loop's modifier
check (`theta-document.ts:2172–2183`) before the name is read, so the emitted
code is about the modifier position, not the identifier; row e13 shows what the
parameter list becomes. b3 is the same fixture with a real name after the
modifier: the modifier is reported, the reserved name is not.

### (c) The parse binds the keyword as the parameter name

| # | probe | result |
|---|---|---|
| c1 | `lexSrc` token kinds for a1, first 20 | `… keyword:"fn", ident:"h", punct:"(", keyword:"let", punct:":", keyword:"string", punct:")" …`; lexer diagnostics `[]` |
| c2 | a1's parsed `fn` statement | `{"kind":"fn","name":"h","params":[{"name":"let","type":"string"}],"returnType":"number", …}` |
| c3 | **control** `fn h(x: string)` parsed | `{… "params":[{"name":"x","type":"string"}] …}` — identical but for the name |
| c4 | `fn h(let: string): number { 1 }` + `let z = h(1)` + `z` | `theta/parse/fn-arg-type-mismatch`: `fn 'h' argument 0 ('let') type mismatch: expected string, got integer` @5:11-5:12 |
| c4′ | **control** the same with `x` | identical but for the quoted name: `argument 0 ('x')` |
| c5 | a1 + `let z = h()` + `z` | `[]` |
| c6 | a1 + `let z = h("a","b")` + `z` | `[]` |

c1 confirms the mechanism named in §Kind element 3: the parameter slot carries
`kind: "keyword"`, which `theta-document.ts:2191`'s guard excludes. c2/c3 show
the token's text is stored verbatim as the parameter name and the AST is
otherwise the control's. c4 shows the parameter is first-class downstream —
the fn-arg type check binds it positionally, judges it against its annotation,
and renders the reserved spelling back to the author inside another registered
code's message. c5 and c6 draw nothing, which is bug
[0131](./0131-in-document-fn-call-arity-unchecked.md)'s subject and not
evidence about the name.

### (d) Registration, and what the binding can and cannot do

| # | probe | result |
|---|---|---|
| d1 | `hasLoadParseError` for a1 | `false` — **registers** |
| d2 | **control** `fn h(P: string)` (0139's now-enforced spelling) | `true` — does not register |
| d3 | **control** `fn h(x: string)` | `false` |
| d4 | **control** `let let = 1` | `true` |
| d5 | run `fn h(let: string): string { "body" }` + `h("q")` | `codes []`; `{"outcome":"success","result":{"present":true,"value":"body"}}` |
| d6 | run `fn h(string: string): string { string }` + `h("q")` | `codes []`; value `null` |
| d7 | run `fn h(Ok: string): string { Ok }` + `h("q")` | `codes []`; value `null` |
| d8 | **control** run `fn h(x: string): string { x }` + `h("q")` | `codes []`; value `"q"` |
| d9 | **control** run `fn h(x: string): string { string }` + `h("q")` | `codes []`; value `null` |
| d10 | **control** `fn h(x: string): string { nope }` | `theta/parse/unknown-identifier`: `unknown identifier 'nope'` @4:27-4:31 |
| d11 | run `fn h(string: string): integer { 7 }` + `h("q")` | `codes []`; value `7` |
| d12 | `fn h(let: string): string { let }` | `theta/parse/let-without-initialiser`: `let binding '}' has no initialiser` @4:29-4:34 |

d1 with d5 is the S1 cell: the spelling the spec refuses loads, registers and
runs. d6/d7 against d8 are the unreadability pair — the argument binds
positionally into a slot the body cannot name, and the read answers `null`
against a declared `string` return with no diagnostic. **The `null` is not
caused by the parameter**: d9 is the same read with a conformant parameter and
answers `null` too, because a bare reserved word in value position takes
`parseAtom`'s unclassified path (`theta-document.ts:3543–3546`, `:3605`).
d10 is the contrast that shows the silence is specific to keywords — an
*identifier* that resolves to nothing draws `unknown-identifier`
(`code-registry-parse.md:61`), whose *Trigger* correctly does not range over a
keyword. d11 shows the function is otherwise fully functional with a dead
parameter. d12 is `let` specifically: the body's `let` is taken as a statement
head, so this one spelling produces an unrelated diagnostic rather than
silence.

### (e) The other identifier positions — the bound on the class

`lexical.md:20` carries no position list, so every identifier position is in
its scope. Measured, one row each:

| # | source | diagnostics | disposition |
|---|---|---|---|
| e1 | `fn h(let: string): number { 1 }` | `[]` | **claimed here** |
| e2 | `let match = 1` / `fn match()` / `schema Ok` / `enum Result` | fires (a15–a21) | enforced |
| e3 | `export fn let(): number { 1 }` | `reserved-keyword-as-identifier` `'let'` @4:11-4:14 (beside `import-missing-from-clause`) | enforced via the `fn` adjacency |
| e4 | `for string in xs { 1 }` and `par for string in xs { 1 }` | `[]` | unclaimed |
| e5 | `schema S { let: string }` | `[]` | unclaimed; 0046's §Non-goals covers the *casing* half of this position only |
| e6 | frontmatter `params:` field named `let` | `[]` | unclaimed |
| e7 | `let r = match v { match => 1 }` | `[]` | **claimed by [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md)** §Fix (a) half 2 |
| e8 | `enum E { let }` and `enum E { Ok }` | `[]` | unclaimed |
| e9 | `import { let } from "./lib.thetalib"` and `import { a as let } from "./lib.thetalib"` | `[]` | unclaimed |
| e10 | `fn h(x: let): number { 1 }` and `let a: let = 1` | `[]` | 0044's family (a `Type` position), unclaimed |
| e11 | `schema X { f: let }` | `reserved-keyword-as-identifier` `'let'` @4:1-4:20 | enforced by 0044's fix |
| e12 | frontmatter `params:` field type `let` | `reserved-keyword-as-identifier` `'let'` @4:6-4:9 | enforced by 0044's fix |
| e13 | `fn h(mut: string)` parsed param list | `params: [{"name":":","type":""},{"name":"string","type":""}]` | recovery artefact of the `mut` modifier check, unfiled |
| e14 | `for let in xs { 1 }` | `reserved-keyword-as-identifier` **`'in'`** @5:9-5:11 | misfire: the lexer's `let`-adjacency reads the token after the for-variable; unfiled |

e1 against e2 is the report's claim in one line: same code, same sentence,
different position, opposite behaviour. e4–e9 bound the class — **this report
claims none of them**, and e7 is another report's (§Non-goals). e11/e12
against e10 show that 0044's parser-leaf callers cover the schema-body and
`params:` field *types* but not a `fn` parameter type or a `let` ascription;
that is 0044's family and orthogonal to the name slot. e13 and e14 are recorded
as measurements of adjacent machinery, not as claims: e14 in particular emits
the code at the wrong token, naming `in` where the offending identifier is
`let`.

### (f) The committed corpus — the GOV-15 baseline

All 34 tracked `.theta` and `.thetalib` files scanned for a `fn` parameter
whose name is one of `lexical.md:20`'s 32 reserved spellings:

```
@@ corpus files=34 reserved-param hits=[]
```

Zero. **Measured GOV-15 blast radius against the committed corpus: zero.**
That bounds the corpus half of the sweep; it does not discharge GOV-15, because
§Reproduction (a)'s programs load cleanly today and would refuse after a fix
(§Fix (c)).

## Expected behaviour

**The sentence is written, unqualified, and its scope is every identifier
position.** `docs/spec_topics/lexical.md:20`:

> **Reserved keywords.** Cannot be used as identifiers: `let`, `mut`, `fn`,
> `if`, `else`, `for`, `in`, `while`, `break`, `continue`, `return`, `match`,
> `schema`, `enum`, `import`, `export`, `from`, `as`, `by`, `invoke`, `true`,
> `false`, `null`, `Ok`, `Err`, `Result`, `string`, `number`, `integer`,
> `boolean`, `array`, `void`. Using one of these in identifier position is
> `theta/parse/reserved-keyword-as-identifier`.

`fn h(let: string)` uses one in an identifier position. The measured
disposition is `[]`.

**The registry agrees and names no position, so no adjudication is owed.**
`code-registry-parse.md:21`'s *Trigger* is "Reserved keyword used in an
identifier position". Under DIAG-2 (`diagnostic-shape.md:72`) the registry is
closed and a *Trigger* is a spec-level statement of which inputs a code fires
on; the implementation fires on a strict subset of the registered set. That is
the implementation moving to match a normative rule, not a rule being widened.
This report's *Trigger* is **weaker-scoped than bug 0139's** in a way that
strengthens the claim: 0139 had to argue that "parameter" was one of the four
positions its *Trigger* enumerated, and this one enumerates none.

**The grammar makes the position an identifier position.**
`FnParam ::= Ident ":" Type` (`docs/reference/grammar.md:254`,
`docs/spec_topics/grammar.md:140`). `lexical.md:20` states the mechanism the
reservation serves — "keeping them reserved is what stops them matching
`NamedType ::= Ident`" — and `Ident` is the same terminal in both productions.

**A conformant implementation reports, for
`fn h(let: string): number { 1 }`:** exactly one
`theta/parse/reserved-keyword-as-identifier`, severity `E`, message
`reserved keyword 'let' cannot be used as an identifier` byte-exact per DIAG-4
with the keyword interpolated, its range covering the parameter-name token
(@4:6-4:9 for the pin's fixture), and no other diagnostic. The theta does not
register (`hasLoadParseError`,
`production-composition.ts:2047–2054`).

**What stays silent:** every conformant spelling — `x`, `_p`, `_` (bug 0139's
witness rows a14–a16, which must not move); the contextual keywords
`subagent`, `with` and `par`, which are not reserved and whose
non-firing is already pinned (`tests/subagent-fn.test.ts:404–421`,
`tests/par-for.test.ts:175–183`); and every position in §Reproduction (e) the
fix declares out of scope, whichever those are (§Fix (b)).

**What must not change:** bug 0139's case emission at the same slot (rows a14,
d2), the three enforced adjacencies (a15–a21), 0044's type-position emissions
(e11, e12), and every type-layer verdict — the fix adds a lexical diagnostic
and touches no judgement.

## Actual behaviour / root cause

**One lexer enforcer, three adjacencies.** `checkName`
(`src/lexer/lexer.ts:814–851`) is position-agnostic and tests three things in
order:

```ts
if (name.kind === "keyword") {
  diagnostics.push({
    severity: "error",
    code: "theta/parse/reserved-keyword-as-identifier",
    file,
    range: name.range,
    message: `reserved keyword '${name.text}' cannot be used as an identifier`,
  });
  return;
}
if (name.kind !== "ident") {
  return;
}
const first = name.text[0] ?? "";
```

(`:819–832`.) Everything positional lives in the caller, and the caller is a
keyword scan (`:876–886`) whose three branches each name an identifier that is
the immediate successor of a keyword token. A parameter name's predecessor is
`(` or `,` — punctuation — so the shape of the scan, not an omitted branch, is
what excludes it. `lexer.ts` is unchanged since 0.71.0, so bug 0139's fix
left this half exactly as it was.

**The parser leaf reimplemented the third stage and guarded out the first.**
`parseFn`'s loop (`src/parser/theta-document.ts:2184–2203`) now reads:

```ts
const pTok = this.advance();
// … The predicate and the `ident` guard mirror `checkName`'s binding arm
// (lexer.ts) so the rule keeps one spelling across every position it
// is enforced at.
if (pTok.kind === "ident") {
  const first = pTok.text[0] ?? "";
  const isUpper = first >= "A" && first <= "Z";
  if (isUpper) {
    this.diagnostics.push({ … code: "theta/parse/binding-case-mismatch" … });
  }
}
```

The comment is accurate about what it mirrors: `checkName`'s **binding arm** —
stage three. Stages one and two have no counterpart here. The guard is not an
oversight against the case code; it is required by it. `binding-case-mismatch`'s
*Trigger* reads "**Identifier** in a binding / parameter / fn-name /
field-name position" (`code-registry-parse.md:19`), so a non-identifier token
reaching the loop through error recovery must not draw it — bug 0139's fix
record states exactly that, and pins `fn h(3: string)` → `[]` as the case it
protects. The consequence is that the one token kind the keyword code exists
for is the one kind the guard removes.

**Keywords are keyword tokens at that slot, not identifiers.**
`src/lexer/lexer.ts:676–680` classifies a scanned word as
`reserved.has(value) ? "keyword" : "ident"` against the 32-member set at
`:159–166`. Row c1 measures the pin's parameter slot as `keyword:"let"`, with
zero lexer diagnostics. Nothing between the scanner and `:2191` reclassifies
it.

**The shortfall is documented at the lexer function.** `:806–808`: "full
identifier-position coverage (**every reserved word in every identifier slot**)
is a parser-leaf obligation; the lexer core enforces the positions its closed
Tests obligations name." Bug 0139 discharged that obligation at this position
for the case rule and stated the keyword arm out of scope; the note's own
clause still names this class.

**Nothing downstream compensates.** The token's text becomes the parameter name
(`:2209`), `FnParam` (`:409–412`) stores it, the fn-arg type check reads it
positionally and quotes it (row c4), and
`statement-executor.ts:416` binds it name-blind. `hasLoadParseError`
(`production-composition.ts:2047–2054`) has nothing to act on, so the theta
registers and runs (rows d1, d5).

**The one thing that does behave differently from the case defect is the
read.** A bare reserved word in value position is not classified by
`parseAtom`'s keyword section and falls to `return null` (`:3605`) — the path
the `Ok` / `Err` comment at `:3541–3546` names for "the other reserved keywords
that reach here". So the accepted declaration opens a parameter slot whose
value no expression can name: rows d6/d7 answer `null` on a `string`-declared
return with zero diagnostics. Row d9 shows this is the value-position path's
behaviour and not the parameter's — but the parameter is what makes the slot
exist, and no diagnostic anywhere tells the author the two are unrelated.

## Why it matters

- **A spelling the spec refuses loads, registers and runs.**
  `fn h(let: string): number { 1 }` emits no `E`, so `hasLoadParseError`
  admits it (`production-composition.ts:2047–2054`) and the body executes
  (row d5). `lexical.md:20` and `code-registry-parse.md:21` both say it is a
  parse error, and neither qualifies by position.
- **The harm is bounded and should be stated as bounded.** No value is
  corrupted, no check is skipped, and no diagnostic is wrong: the argument
  binds positionally, the fn-arg type check fires correctly (row c4), and the
  committed corpus contains zero instances (§Reproduction (f)). What is lost is
  the invariant.
- **The declaration opens a slot nothing can read.** The one consequence beyond
  a refused spelling: a body naming the keyword parameter answers `null`
  (rows d6, d7) against a declared `string` return, with no diagnostic. An
  author who writes `fn h(string: string): string { string }` gets a function
  that compiles, registers, runs, and returns `null` — and the two codes that
  would ordinarily catch a bad read, `unknown-identifier` (row d10) and this
  report's own, both decline.
- **The reserved spelling is rendered back to the author as a parameter name.**
  `fn 'h' argument 0 ('let') type mismatch: expected string, got integer`
  (row c4). A registered diagnostic quotes a reserved keyword in the role the
  spec says it cannot hold.
- **The enforced/unenforced split is invisible from the spec.** An author who
  writes `let match = 1` is told; an author who writes `fn h(match: string)` is
  not. The discriminator in the implementation is which keyword precedes the
  identifier.
- **The gap is 31 spellings wide at one position and seven positions wide
  overall.** §Reproduction (b) measures 31 of 32 silent at the parameter, and
  (e) measures six more identifier positions silent, one of them another
  report's. A fix that closes one and leaves the others unstated leaves the
  class half-closed without saying so.
- **No test can red on it.** `tests/lexer-core.test.ts:164–175` pins the `let`
  adjacency and `tests/reserved-keyword-type-position.test.ts` pins bug 0044's
  type positions. Bug 0139's shipped witness declares this position
  "OUT OF SCOPE, deliberately unrowed"
  (`tests/fn-param-name-case.test.ts:72–77`). No test asserts it in either
  direction.

## Non-goals

- **The `match` pattern binder.**
  [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md)'s §Fix (a)
  half 2 claims it in terms: "the reserved keyword in pattern position …
  governed by `lexical.md:20` and the registered *Trigger* at
  `code-registry-parse.md:21`". Row e7 measures it silent here for
  completeness of the class bound. Do not fold it in; the two sites are
  disjoint (`parsePattern`'s tail at `theta-document.ts:3954` against
  `parseFn`'s loop at `:2184–2203`) and each report's witness is its own.
- **The schema field name, the `params:` frontmatter field name, the `enum`
  variant name, the `for` / `par for` variable, and both `import` specifier
  binding forms.** Rows e4–e6, e8, e9 measure all of them silent. They are
  entries in the same sentence and the same *Trigger*, unclaimed by any report
  at this HEAD, and a fix should state whether it closes them (§Fix (b)) — but
  this report's claim, its witness and its Sev/Diff estimate are scoped to the
  `fn` parameter name. Bug 0046's §Non-goals (`:533–541`) covers the *casing*
  half of the field-name position only and is unaffected either way.
- **A keyword at a `Type` position that 0044's four callers do not reach.**
  Rows e10 (`fn h(x: let)`, `let a: let = 1`) are silent while e11/e12 (a
  schema-body field type, a `params:` field type) fire. That asymmetry belongs
  to
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)'s
  family — a `Type` position governed by `NamedType ::= Ident` — not to the
  identifier slot this report claims. Unfiled at this HEAD.
- **The lowercase-first case rule at the same slot.**
  [0139](./0139-fn-parameter-name-case-rule-unenforced.md), fixed in 0.79.0.
  Row a14 measures it firing. A fix here must not move it, must not
  re-implement it, and must not change its range or ordering.
- **The `mut` recovery artefact.** Row e13:
  `fn h(mut: string)` binds `[{"name":":"},{"name":"string"}]` because the
  loop's modifier check consumes the `mut` before the name is read. It is
  adjacent machinery, produces its own registered code, and is unfiled and
  unclaimed here. A fix must not change what row b2 reports.
- **The `let`-adjacency misfire at a `for` variable.** Row e14:
  `for let in xs { 1 }` emits the code against `'in'` — the token after the
  for-variable — because the lexer's dispatch treats any `let` keyword token as
  a `let`-statement head. Recorded as a measurement; unfiled, and not closed by
  either §Fix option below.
- **In-document `fn` call arity.** Rows c5 and c6 draw nothing for `h()` and
  `h("a","b")`. That is
  [0131](./0131-in-document-fn-call-arity-unchecked.md)'s subject.
- **The missing parameter-type annotation.** Row a9 (`fn h(let)`) is
  non-conformant twice over against
  `FnParam ::= Ident ":" Type`. The pin is a1 precisely so the keyword claim
  stands independent of it. Bug 0139's residual 3; unfiled.

## Fix

Emit `theta/parse/reserved-keyword-as-identifier` when a `fn` parameter name is
one of `lexical.md:20`'s 32 reserved spellings, severity `error`, the registry
*Message* with the keyword interpolated
(`reserved keyword '<keyword>' cannot be used as an identifier`), ranged on the
parameter-name token. No registry edit: the code exists
(`code-registry-parse.md:21`), its *Trigger* names no position and so already
covers this one, its *Message* is unchanged, and
`docs/reference/diagnostics.md:67` mirrors it without a *Trigger* column. DIAG-2
and DIAG-4 are both satisfied without touching a table.

**(a) Where the check lands.** Two sites; the run picks and records why.

- **`parseFn` (`src/parser/theta-document.ts:2184–2203`).** The branch point
  already exists: `:2191`'s `if (pTok.kind === "ident")` becomes a
  classification in `checkName`'s own order — `pTok.kind === "keyword"` emits
  the reserved code and stops, otherwise the existing `ident` arm runs
  unchanged. The token, its `kind` and its `range` are in hand; the
  `checkMutModifier` precedent sits eleven lines earlier in the same loop
  (`:2172–2183`); `subagent fn` is reached for free because `parseFn` serves
  both (row a10); and the `.thetalib` route is the same call (row a11). This is
  the site the lexer's scope note hands the obligation to (`lexer.ts:806–808`:
  "a parser-leaf obligation") and it edits no `lexer.ts` line, so it induces
  zero citation drift in bug docs 0051 (`lexer.ts:873–874`) and 0135
  (`lexer.ts:842–849`). Bug 0044's fix already emits this code from parser
  leaves (`tests/reserved-keyword-type-position.test.ts:53–58`), so the
  precedent for a non-lexer emitter is shipped.
- **`contextualDiagnostics` (`src/lexer/lexer.ts:876–886`).** A fourth branch
  means scanning forward from the `fn` keyword to `(`, then walking to `)`
  while skipping type annotations that contain `<`, `,` and `|` — a walk that
  duplicates parsing the parser already does. Bug 0139's fix record pins this
  alternative rejected for its own emission on the same grounds and because it
  shifts the `lexer.ts` citations 0051 and 0135 hold. Choosing it here reopens
  that disposition and must say so.

Whichever site is chosen, the fix states its interaction with bug 0139's case
emission at the same slot: `checkName`'s order is keyword-first with an early
`return`, so a parameter name is never both a keyword and a case violation, and
the two arms are mutually exclusive by construction. Row a14 must be unchanged
byte for byte.

**(b) Which identifier positions the fix closes.** `lexical.md:20` bounds
itself by no position list, so the sentence covers all of them and
§Reproduction (e) measures six more silent. A fix closing the `fn` parameter
alone is admissible and is what this report's witness requires. If it closes
more, two constraints bind: **the `match` pattern binder is bug 0141's claim**
(row e7) and must not be taken without coordinating with that report, and each
additional position widens the GOV-15 sweep to another input class needing its
own corpus measurement and its own rows. Either way §Fix states the disposition
of the other six explicitly, because leaving it unstated makes the next reader
re-derive §Reproduction (e) — the failure mode bug 0139's §Fix (b) named and
avoided.

**(c) The GOV-15 discharge.** The fix turns a class of currently-clean programs
into refusals. `source-language-stability.md:25` dispositions a *Trigger*-set
change "as an addition for inputs newly brought into the code's emission set",
the carve-out-covered arm, admissible within theta 1.x. This fix does not edit
the *Trigger* — it brings the implementation onto a *Trigger* that already
covers the position — so the same reasoning applies a fortiori: affected inputs
gain a code's emission and observe no change to any code they already emit.
Two obligations remain, neither dischargeable by assumption:

1. **Re-run the committed-corpus sweep** rather than trusting §Reproduction
   (f)'s count, and walk `.thetalib` explicitly:
   [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) is open, so
   `tests/committed-fixture-parse-gate.test.ts` filters `.theta` only and the
   two committed `.thetalib` files are invisible to the shipped gate. One of
   them, `docs/examples/personas.thetalib:7`, is one of the corpus's four
   parameter-bearing `fn` declarations.
2. **Record the addition in the release notes** as a GOV-15 carve-out-covered
   code addition, with the input class named: `.theta` / `.thetalib` files
   declaring a `fn` parameter whose name is one of the 32 reserved spellings.

**(d) Constraints the fix preserves**, each with a witness row above:

- **Bug 0139's case emission is unmoved.** Row a14 keeps its code, its message
  and its range @4:6-4:7; row d2 keeps `hasLoadParseError = true`. The 19 rows
  of `tests/fn-param-name-case.test.ts` stay green.
- **The three enforced adjacencies are unmoved.** Rows a15–a21, including the
  `let mut` skip (a17) and both `schema` / `enum` arms (a20, a21).
- **0044's type-position emissions are unmoved.** Rows e11 and e12.
- **The contextual keywords keep parsing.** `subagent`, `with` and `par` are
  not in `reservedKeywords()` (`lexer.ts:159–166`), and
  `tests/subagent-fn.test.ts:404–421` and `tests/par-for.test.ts:175–183`
  already assert the code does not fire for them. A fix reusing that set rather
  than minting a second list keeps this true by construction.
- **`mut` at the parameter position is unchanged.** Row b2 keeps
  `mut-on-immutable-context` alone, and row b3 keeps it alone as well until the
  fix's own arm adds the reserved code for the `let` after the modifier — pin
  which of the two b3 becomes, in order, rather than leaving it to fall out.
- **Every parameter in a list is checked.** Rows a7 (second parameter) and a8
  (trailing comma) — the loop must not stop at the first parameter or
  mis-handle the trailing `,`, and a7's diagnostic must range on the second
  parameter's own token.
- **No type-layer verdict moves.** Row c4 keeps `fn-arg-type-mismatch` with the
  new code appended; the fix adds a lexical diagnostic and reaches no
  judgement.
- **The out-of-scope positions stay silent.** Whichever of §Reproduction (e)'s
  rows §Fix (b) declares out, they become over-reach tripwires — rows that red
  if enforcement widens past what was decided. Row e7 in particular protects
  bug 0141's claim.

**(e) Witness — offline, provider-free.** Every row settles inside one
`parseDoc` call except (d)'s runtime cells. The natural home is a new file
beside `tests/fn-param-name-case.test.ts`, or an added `describe` inside it
with its header's "OUT OF SCOPE, deliberately unrowed" block
(`:72–77`) rewritten, since that sentence becomes false. Whole-list ordered
`toEqual` over unfiltered `doc.diagnostics` on every row, per that file's
existing shape, and every expected message read from the registry through its
`registryMessage` helper rather than copied, per DIAG-4
(`diagnostic-shape.md:74`) — the interpolated `<keyword>` slot makes a copied
string especially brittle here. Required rows: a1 (the pin, range asserted on
the parameter-name token @4:6-4:9) and a2–a12 as the spelling, form and route
coverage; the (b) sweep reduced to at least four spellings spanning the
lowercase, PascalCase and primitive-name groups (`let`, `Ok`, `string`,
`match`); a13–a21 as the must-not-move controls; b2 and b3 as the `mut`
interaction with its order pinned; c4 as the downstream-verdict row; d1 and d2
as the registration pair; and whichever of e4–e10 §Fix (b) leaves out, as
over-reach tripwires. One range assertion on a7's second parameter, since a
diagnostic ranged on the declaration head would pass every code-only check. No
live tier is required by the parse rows; a registration cell modelled on bug
0139's additive H8a cell in `tests/live/live-production-acceptance.test.ts` is
the natural end-to-end proof that the theta stops registering, and is
registration-only, so it spends zero tokens.

## Provenance

- **Origin:** bug 0139's fix (0.79.0, `d11aef29`), residual 1
  (`.pi/tmp/fixes/0139-report.md:285–293`), restated in that document's §Fix
  (0.79.0) as sub-question (a′): "The reserved-keyword arm is NOT closed.
  `fn h(let: string)` stays silent — a different registered code under a
  different spec sentence (`lexical.md:20`), and closing it would widen the
  GOV-15 sweep to a second input class for no witness row. Measured `[]` after
  the fix → residual 1." The measurement predates the fix as row d1 of that
  report's §Reproduction and its §Non-goals bullet, which called it "a bonus to
  state, not a claim this report makes". This report adds what the residual does
  not state: that the *Trigger* names no position at all, so no adjudication is
  owed and the claim is stronger than 0139's; the exact branch point the guard
  at `theta-document.ts:2191` creates and why that guard is correct for the code
  it guards; the token-kind measurement that proves the exclusion; the full
  32-spelling sweep at the position (31 silent, `mut` special-cased); the
  binding, registration and runtime consequences, including the unreadable-slot
  pair d6/d8 and its d9 control; the downstream message that quotes the
  reserved spelling; the six other silent identifier positions with their
  claimed / unclaimed disposition and bug 0044's two firing ones; and the
  committed-corpus GOV-15 baseline for this input class.
- **Evidence:** three scratch vitest files at `d11aef29` — parse and lex rows
  through `parseDoc` / `lexSrc` (`tests/helpers/e2e-s1.ts:39`, `:50`) driving
  the shipped `parseThetaDocument` and `lexTheta`; runtime rows through
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`,
  the harness shape at `tests/non-object-receiver-gate.test.ts:221–292`;
  every cell of groups (a)–(f) measured and quoted verbatim above; written,
  run, deleted. The corpus sweep in (f) enumerates
  `git ls-files -- '*.theta' '*.thetalib'` (34 files) and scans each `fn`
  declaration's parameter list against `reservedKeywords()`'s 32 members.
- **Implementation, at `d11aef29`:** `src/lexer/lexer.ts:125` (the call site),
  `:159–166` (`reservedKeywords`, the 32-member set), `:676–680` (the
  keyword / ident classification, the ternary at `:677`), `:806–808` (the scope
  note), `:810–916` (`contextualDiagnostics`), `:814–851` (`checkName`; the
  keyword arm `:819–828`, the non-`ident` bail `:829–831`, the first-letter
  test `:832–833`, the two case emissions `:834–841` and `:842–850`),
  `:876–886` (the three-position dispatch);
  `src/parser/theta-document.ts:409–412` (`FnParam`), `:2151` (`parseFn`),
  `:2172–2183` (the `mut` check), `:2184` (the token capture), `:2185–2190`
  (bug 0139's comment), `:2191` (the `ident` guard), `:2192–2202` (the case
  emission), `:2209` (the push), `:3541–3546` (the keyword-in-value-position
  comment), `:3605` (`parseAtom`'s unclassified `return null`), `:3902` and
  `:3954` (bug 0141's pattern-tail arm, at their post-0139 lines);
  `src/parser/params.ts:35`, `:441` (the parser leaf that reuses
  `reservedKeywords()`); `src/runtime/statement-executor.ts:416`, `:503`
  (positional binding); `src/extension/production-composition.ts:2047–2054`
  (`hasLoadParseError`).
- **Corpus, at `d11aef29`:** `docs/spec_topics/lexical.md:3`, `:13`, `:16`,
  `:20`; `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:21`,
  `:61`; `docs/reference/diagnostics.md:65`, `:67`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`;
  `docs/reference/grammar.md:80–86` (the reserved list under this code), `:247`,
  `:253`, `:254`; `docs/spec_topics/grammar.md:138–140`, `:143` (the prose that
  governs the parameter list), `:107` (the `array` / `Result` type-position
  carve-out); `docs/spec_topics/functions.md:20` (FN-1, the surface form).
- **Tests, at `d11aef29`:** `tests/lexer-core.test.ts:164–175` (the code's only
  positional witness, at the `let` adjacency);
  `tests/reserved-keyword-type-position.test.ts:29–32`, `:53–58`, `:138`,
  `:689–697`, `:1129` (bug 0044's type-position witness);
  `tests/fn-param-name-case.test.ts:72–77` (bug 0139's witness declaring this
  position out of scope); `tests/subagent-fn.test.ts:404–421` and
  `tests/par-for.test.ts:175–183` (the contextual-keyword non-firing guards).
  No test asserts the `fn` parameter position's behaviour for this code in
  either direction.
