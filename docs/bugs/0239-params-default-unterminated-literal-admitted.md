# Bug 0239 — a `params:` default whose string literal never closes registers with zero diagnostics: `p: 'string = "abc'` lowers and records `defaultSource` `"abc`, the binder system prompt renders the malformed bytes `default="abc`, and the default recovery silently repairs them to `"abc"` — where the same bytes in the TYPE half (bug 0232, 0.188.0) and in body code are both refused

- **Status:** fixed (0.201.0)
- **Sev/Diff estimate:** S1/D2 — S1 because a theta registers carrying a
  default the source does not spell: `p: 'string = "abc'` reports `[]`, lowers
  `{"type":"object","properties":{"p":{"type":"string"}},"required":[],"additionalProperties":false}`
  and records `defaultSource` as the unterminated `"abc`
  (§Reproduction (a) row a1), which the two consumers of that field then read
  differently — the binder system-prompt line is
  `  p (string) default="abc` verbatim (§Reproduction (c) row c1) while the
  declared-default recovery parses the same bytes to the string value `abc`
  (row c2). No channel reports the malformed literal, and the byte-identical
  text in body code is refused (`theta/parse/unterminated-string`,
  §Reproduction (b) row b1). D2 because the predicate this needs already
  exists in two forms (`hasUnterminatedStringLiteral`, `params.ts:1687`, added
  by bug 0232; the lexer's own scan, `lexer.ts:526`–`:541`), the position
  already hosts three default-side guards to sit beside (`params.ts:385`,
  `:393`, `:403`), and the change is confined to one file — but the route must
  choose which registered code fires and must not move bug 0232's five-cell
  witness or the DIAG-2 brace boundary it pinned.
- **Kind:** defect — implementation. One admission, three observable faces.
  1. **Load admits it.** `splitParamValue` (`src/parser/frontmatter.ts:661`)
     cuts the RHS at the top-level `=` BEFORE the quote opens, so
     `typeSource` is `string` and `defaultSource` is `"abc`. Bug 0232's guard
     reads `field.typeSource` alone (`src/parser/params.ts:264`), so the
     unterminated literal is not in its input. The default-side guards that do
     see it — `hasRawNewlineInStringLiteral` (`:393`) and
     `checkLiteralSublanguage` (`:403`) — both admit: `tokeniseExpr`'s string
     arm (`src/parser/literal-sublanguage.ts:145`–`:158`) runs an unclosed span
     to end of text and pushes it as one well-formed `str` token.
  2. **The compat check is fed a repaired type.** `defaultLiteralStaticType`
     (`:706`) reads the same tokens and answers
     `{kind: "literal", typesAs: "string"}` for `"abc`, so bug 0163's
     load-time compatibility check (fixed 0.88.0) judges the field against a
     type the source never spelled. `p: 'string = "abc'` therefore passes, and
     `p: 'integer = "abc'` draws
     `theta/parse/params-default-type-mismatch: … expected integer, got
     string` — a mismatch report for a default that is not a literal at all
     (§Reproduction (a) rows a1, a6).
  3. **The two runtime consumers disagree about the value.**
     `binderPromptParamField` (`src/extension/production-theta-producer.ts:678`)
     hands `field.defaultSource` to the V11d requirement token verbatim, which
     `renderBinderParamLine` (`src/binder/binder-system-prompt.ts:256`) emits
     as `default="abc`; `#recoverDeclaredDefaults` (`:1400`–`:1404`) re-splits
     the same field and calls `parseExpressionSource`
     (`src/parser/theta-document.ts:1324`), which returns
     `{kind: "string", value: "abc"}` — the lexer's own
     `theta/parse/unterminated-string` is discarded by that entry point's
     no-op diagnostic sink. The model is shown malformed bytes; the merge
     binds a repaired value.
- **Related:**
  - [0232](./0232-unterminated-literal-params-type-drops-inline-fields.md) —
    **fixed (0.188.0)**, the origin. Its fix ORs `hasUnterminatedStringLiteral`
    (`params.ts:1687`) into the `theta/load/params-type-not-expression` guard
    (`:277`) over `field.typeSource`. Its fix report
    (`.pi/tmp/fixes/0232-report.md` §Residuals 1) records this shape as a
    candidate filing and names the cause: the splitter cuts at the `=` before
    the quote opens, so the predicate correctly answers `false` on the type
    half. That report's five-cell witness
    (`tests/unterminated-literal-params-type-refusal.test.ts`) and its two
    live files are locks here (§Fix (d)).
  - [0163](./0163-params-default-type-compat-unchecked-at-load.md) —
    **fixed (0.88.0)**, discharged by bug 0066's fix. It installed the
    load-time declared/default compatibility check this report's face 2 feeds
    a repaired type to. Its witness `tests/params-default-type-compat.test.ts`
    pins the mismatch cells and is a lock: rows a6 and a7 here draw that
    report's code today, and a fix that refuses the malformed literal FIRST
    changes which code those two spellings draw.
  - [0165](./0165-empty-params-default-literal-admitted-and-never-bound.md) —
    **fixed (0.92.0)**, the precedent for the shape this report needs: a
    default RHS the sublanguage's own production set does not derive is
    refused at the declaration position, ahead of the is-literal check, under
    `theta/parse/default-without-literal` (`params.ts:385`). Its witness
    `tests/params-default-empty-literal-refusal.test.ts` pins the empty case
    and must stay green.
  - [0102](./0102-params-default-string-literal-raw-newline-admitted.md) —
    **fixed (0.75.0)**, the precedent for the CODE choice: a lex-phase row
    (`theta/parse/literal-newline-in-string`) fires at the `params:` default
    position, and `code-registry-parse.md:13` states that reach in the row's
    own Trigger. `theta/parse/unterminated-string` (`:14`) is the neighbouring
    row with no such sentence. Its witness
    `tests/params-default-string-literal-raw-newline.test.ts` is a lock: the
    raw-newline case must keep drawing its own code, not a new one.
  - [0175](./0175-literal-sublanguage-parser-ignores-trailing-tokens.md) —
    **fixed (0.144.0)**, which made the is-literal check and the compat reader
    share one residue reader (`residueOf`, `literal-sublanguage.ts:530`) so
    the two can never disagree. This report's face 2 is the same
    mirror-contract obligation one level down: whatever refuses the
    unterminated span must be visible to BOTH readers.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for the positional drift any fix here induces in
    `src/parser/params.ts` citations.
- **Affected** (every citation verified at HEAD `30c0cb67`, 0.197.0; cited by
  symbol, the line numbers being 0134's class):
  - **The split** — `src/parser/frontmatter.ts`: `splitParamValue` (`:661`),
    its quote/depth scan and the top-level-`=` cut (`:686`–`:689`), and its
    call site in `extractParsedParams` (`:753`); the `defaultSource` carried
    onto the field inputs and the bypass field (`:844`, `:854`) and the
    `defaultedFields` push (`:858`).
  - **The guard that does not reach the default** — `src/parser/params.ts`:
    `hasUnterminatedStringLiteral` (`:1687`, bug 0232's predicate), its single
    caller over `field.typeSource` (`:264`), and the
    `theta/load/params-type-not-expression` push it feeds (`:277`–`:289`).
  - **The default-side guards that do see it and admit** — same file: the
    empty-RHS refusal `theta/parse/default-without-literal` (`:385`, bug
    0165's), `hasRawNewlineInStringLiteral(field.defaultSource)` (`:393`, bug
    0102's), `checkLiteralSublanguage(field.defaultSource, "default", …)`
    (`:403`), and the compat pair `paramsDeclaredCompatType` (`:418`) /
    `defaultLiteralStaticType` (`:421`) feeding `checkParamsDefaultCompat`
    (`:426`, bug 0163's).
  - **Why they admit** — `src/parser/literal-sublanguage.ts`: `tokeniseExpr`'s
    string arm (`:145`–`:158`), whose `while (i < n && source[i] !== quote)`
    loop (`:149`) terminates at end of text and whose `if (i < n) { i += 1; }`
    (`:155`–`:157`) is the only place a closing quote is consumed — an
    unclosed span becomes a `str` token indistinguishable from a closed one;
    `checkLiteralSublanguage` (`:54`); `hasRawNewlineInStringLiteral` (`:663`),
    which asks only whether a `str` token contains `\n`;
    `defaultLiteralStaticType` (`:706`). The doc block at `:655` already
    records the behaviour as intentional for ITS predicate ("a malformed span
    (an opening quote with no match) still terminates"), which is why nothing
    downstream re-asks the question.
  - **The position that does refuse** — `src/lexer/lexer.ts`: the string scan's
    two-arm end-of-span report (`:526`–`:541`),
    `theta/parse/literal-newline-in-string` when the stop byte is `\n` and
    `theta/parse/unterminated-string` (`:537`) at EOF.
  - **The consumers of the recorded bytes** —
    `src/extension/production-theta-producer.ts`: `binderPromptParamField`
    (`:672`) and its requirement token `{kind: "default", literal:
    field.defaultSource}` (`:678`); `#recoverDeclaredDefaults` (`:1368`), its
    second copy of the splitter `splitParamDefaultSource` (`:6096`), the call
    at `:1400` and the `parseExpressionSource` parse at `:1404`;
    `src/binder/binder-system-prompt.ts`: `renderBinderParamLine` (`:251`) and
    its `default=<literal>` interpolation (`:256`);
    `src/parser/theta-document.ts`: `parseExpressionSource` (`:1324`), whose
    lex deps discard diagnostics (`:1325`–`:1331`).
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:14`
    (`theta/parse/unterminated-string`, E, lex, "EOF reached while scanning a
    string literal", *Message* `unterminated string literal`, no `params:`
    sentence in its Trigger); `:13`
    (`theta/parse/literal-newline-in-string`, whose Trigger DOES name the
    `params:` default RHS); `:51` (`theta/parse/default-not-literal`); `:52`
    (`theta/parse/default-without-literal`); `:53`
    (`theta/parse/params-default-type-mismatch`);
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`theta/load/params-type-not-expression`, whose Trigger carries bug 0232's
    unterminated-literal narrowing and its precedence rule "a field refused by
    the text stage draws no default-RHS literal-sublanguage diagnostic … for
    the same field").
  - **The spec statements** — `docs/spec_topics/lexical.md:26` (§String
    literals: "EOF inside an unterminated string literal is
    `theta/parse/unterminated-string`");
    `docs/spec_topics/grammar.md:9` (§Theta literal sublanguage: "a strict
    subset of the expression grammar", "every literal is a legal Theta
    expression");
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults:
    `field: type = literal`, RHS parsed by the literal sublanguage).
    Mirror: `docs/reference/diagnostics.md`.
  - **The witness locks** —
    `tests/unterminated-literal-params-type-refusal.test.ts` (bug 0232's five
    cells, including the normative row E2 `{a: integer`, an unclosed BRACE
    with no unterminated literal, which stays admitted);
    `tests/live/params-unterminated-literal-live-cell.test.ts` and
    `tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`
    (0232's H8a and H9a acceptance pair, whose well-formed sibling drives a
    real turn); `tests/params-default-type-compat.test.ts` (0163's);
    `tests/params-default-empty-literal-refusal.test.ts` (0165's);
    `tests/params-default-string-literal-raw-newline.test.ts` (0102's);
    `tests/params-default-trailing-residue-refusal.test.ts` (0175's);
    `tests/params-defaults.test.ts`;
    `tests/params-inline-object-lowering.test.ts`;
    `tests/committed-fixture-parse-gate.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files; 17
    carry a `params:` block; `git grep -nE "= *[\"'][^\"']*$"` over them
    returns zero hits, so no committed source moves under any route in §Fix.
- **Observed at:** `0.197.0` (HEAD `30c0cb67`). Offline, deterministic; no live
  model, no provider. Rows (a) through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, fixture

  ```
  ---
  mode: prompt
  params:
    <row>
  ---
  "hi"
  ```

  Rows (b) the same fixture with no `params:` block and the row's line as the
  body. Diagnostic cells are the whole unfiltered `doc.diagnostics` in emission
  order rendered `<severity> <code>: <message>`; "registers" is the house
  definition (no error-severity `theta/parse/` or `theta/load/` code), so a
  `[]` cell registers by construction. Lowerings are
  `doc.frontmatter.params.loweredSchema` verbatim and `defaultSource` is
  `doc.frontmatter.params.fields[0].defaultSource`. Row (c) c1 calls the
  shipped `renderBinderParamLine` (`src/binder/binder-system-prompt.ts:251`)
  directly; c2 calls the shipped `parseExpressionSource`
  (`src/parser/theta-document.ts:1324`), the one the default recovery calls.
  Five scratch vitest files over those entry points, run on the outputs quoted
  below, then deleted.

## Summary

`splitParamValue` (`frontmatter.ts:661`) cuts a `params:` field's RHS at the
first top-level `=`. For `p: 'string = "abc'` the cut precedes the opening
quote, so the type half is the clean `string` and the whole malformation lands
in the default half. Bug 0232's fix asks `hasUnterminatedStringLiteral` of the
TYPE half only (`params.ts:264`), so it answers `false` and the field is not
refused there.

Nothing else asks. The three default-side guards all run on
`field.defaultSource` and all admit, because they share one tokeniser:
`tokeniseExpr`'s string arm (`literal-sublanguage.ts:145`–`:158`) runs an
unclosed span to end of text and emits it as a `str` token with no marker that
its quote never closed. `checkLiteralSublanguage` sees a well-formed literal
node; `hasRawNewlineInStringLiteral` sees no `\n`; `defaultLiteralStaticType`
types it `string`. The field registers with `required: []` and the recorded
default bytes `"abc`.

Downstream the same bytes are read twice and mean two different things. The
binder system prompt renders the requirement token from `defaultSource`
verbatim — `  p (string) default="abc` — so the model is asked to fill a field
whose stated default is not a literal. The declared-default recovery re-splits
the field, hands the bytes to `parseExpressionSource`, and gets the string
`abc`: that entry point's lex deps discard diagnostics, so the lexer's own
`theta/parse/unterminated-string` for exactly these bytes is dropped and the
malformed literal is silently repaired into the merged args.

The same bytes are refused everywhere else they can appear. In body code
`let a = "abc` draws `theta/parse/unterminated-string` at EOF and
`theta/parse/literal-newline-in-string` when a newline ends the span
(§Reproduction (b)); in the field's own type half — one character to the left
of the `=` — bug 0232 refuses them with
`theta/load/params-type-not-expression`.

## Reproduction

Offline, deterministic, at HEAD `30c0cb67`. Whole unfiltered diagnostic lists
in emission order. `LOWERED(x)` abbreviates
`{"type":"object","properties":{"p":x},"required":[],"additionalProperties":false}`.

### (a) The `params:` default half

| # | `params:` row | diagnostics | lowered `p` | recorded `defaultSource` |
|---|---|---|---|---|
| a1 | `p: 'string = "abc'` | `[]` | `{"type":"string"}` | `"abc` |
| a2 | `p: "string = 'abc"` | `[]` | `{"type":"string"}` | `'abc` |
| a3 | `p: 'string = "abc"'` (control) | `[]` | `{"type":"string"}` | `"abc"` |
| a4 | `p: 'string = "abc def # x'` | `[]` | `{"type":"string"}` | `"abc def # x` |
| a5 | `p: 'string = "abc\"'` (escaped quote, span still open) | `[]` | `{"type":"string"}` | `"abc\"` |
| a6 | `p: 'integer = "abc'` | `error theta/parse/params-default-type-mismatch: param 'p' default type mismatch: expected integer, got string` | — (refused) | — |
| a7 | `p: 'boolean = "true'` | `error theta/parse/params-default-type-mismatch: … expected boolean, got string` | — (refused) | — |
| a8 | `p: 'string \| null = "abc'` | `[]` | `{"type":["string","null"]}` | `"abc` |
| a9 | `p: '"x" \| "y" = "z'` | `[]` | `{"type":"string","enum":["x","y"]}` | `"z` |
| a10 | `p: '"x" \| "y" = "z"'` (control) | `[]` | `{"type":"string","enum":["x","y"]}` | `"z"` |
| a11 | `p: 'array<string> = ["a", "b'` | `[]` | `{"type":"array","items":{"type":"string"}}` | `["a", "b` |
| a12 | `p: '{a: string} = {a: "x'` | `[]` | `{"$ref":"#/$defs/__inline_968e40317188aebd"}` | `{a: "x` |
| a13 | `p: '{a as "w: integer}'` (bug 0232's type half, control) | `error theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression` | — (refused) | — |

Rows a1 and a3 are byte-neighbours differing in one closing quote and are
indistinguishable in every registered artefact except the recorded
`defaultSource`. Rows a6 and a7 are the only spellings that draw anything, and
they draw bug 0163's compatibility code computed over a repaired type — the
report is "got string", not "the literal does not close". Rows a9 and a10 show
that the literal-union declared type does not discriminate either: the
well-formed out-of-set `"z"` is admitted too, which is that check's own
disposition and not claimed here (§Non-goals). Row a13 is the same
malformation one character to the left of the `=`, refused since 0.188.0.

### (b) The same bytes in body code

| # | body line | trailing newline | diagnostics |
|---|---|---|---|
| b1 | `let a = "abc` | no | `error theta/parse/unterminated-string: unterminated string literal` |
| b2 | `let a = "abc` | yes | `error theta/parse/literal-newline-in-string: literal newline in string literal` |
| b3 | `let a = "abc"` | yes | `[]` |
| b4 | `fn f(): string { "abc }` | yes | `error theta/parse/literal-newline-in-string: literal newline in string literal` |

The lexer's string scan reports at both exits (`lexer.ts:526`–`:541`). The
`params:` default position reaches no lexer, and its own tokeniser has no
equivalent exit report.

### (c) What the recorded bytes become downstream

| # | call | result |
|---|---|---|
| c1 | `renderBinderParamLine({wireName:"p", type:"string", requirement:{kind:"default", literal:'"abc'}})` | `  p (string) default="abc` |
| c2 | `parseExpressionSource('"abc')` | `{"kind":"string","value":"abc","range":{"start":{"line":1,"column":1},"end":{"line":1,"column":5}}}` |
| c3 | `parseExpressionSource("'abc")` | `{"kind":"string","value":"abc", …}` |
| c4 | `parseExpressionSource('"abc"')` (control) | `{"kind":"string","value":"abc", …}` — the same node as c2 |

c1 is what the binder model is shown; c2 is what `#recoverDeclaredDefaults`
(`production-theta-producer.ts:1404`) parses and then evaluates and projects
into the merged args. c2 and c4 are identical, so the merged value for row a1
equals the merged value for its well-formed control a3 — the repair is total
and unreported.

### (d) Bounds

| # | probe | observable |
|---|---|---|
| d1 | `git ls-files -- '*.theta' '*.thetalib'` | 34 files; 17 carry a `params:` block; `git grep -nE "= *[\"'][^\"']*$"` over them → zero hits |
| d2 | `p: 'array<string> = ["a", "b"'` (unmatched BRACKET, every quote closed) | `[]`, lowered `{"type":"array","items":{"type":"string"}}`, `defaultSource` `["a", "b"` — a neighbouring admission this report does not claim (§Non-goals) |
| d3 | `defaultLiteralStaticType('"abc')` | `{"kind":"literal","typesAs":"string"}`, identical to `defaultLiteralStaticType('"abc"')` |

## Expected behaviour

`lexical.md:26` states that EOF inside an unterminated string literal is
`theta/parse/unterminated-string` and that a literal newline inside one is
`theta/parse/literal-newline-in-string`; string literals are single-line and
must close. `grammar.md:9` states that the literal sublanguage is "a strict
subset of the expression grammar" and that "every literal is a legal Theta
expression". `frontmatter-fields-a.md:60` writes the default form
`field: type = literal` with the RHS parsed by that sublanguage.

From that, one statement:

- **A `params:` default RHS carrying a string literal that never closes
  spells no literal, so it is refused and the theta does not register.** Rows
  a1, a2, a4, a5, a8, a9, a11 and a12 each report an error-severity diagnostic
  ranged on the field (corrected in the fix record below: the route selected
  raises a registry row whose normative *Message* carries no field placeholder,
  so the field is named by the diagnostic's range). Row a3's control and every other row of `tests/params-defaults.test.ts`
  are unchanged.
- **The refusal precedes the compatibility judgement.** Rows a6 and a7 report
  the malformed literal, not `expected integer, got string`: no declared type
  is compared against a type derived from bytes that spell no literal.
- **No consumer sees the malformed bytes.** With the theta unregistered, the
  binder prompt line of row c1 and the recovery parse of row c2 are both
  unreachable for this input.

Row d2 does not move: an unmatched bracket whose quotes all close is a
different malformation, and bug 0232's normative boundary (row E2 of its
witness — an unclosed brace with no unterminated literal stays admitted) is
the standing adjudication for that class.

## Actual behaviour / root cause

**The split puts the malformation where the 0232 guard does not look.**
`splitParamValue` (`frontmatter.ts:661`) scans for the first top-level `=`
outside brackets and outside a quoted span. In `string = "abc` the `=` is
reached before any quote opens, so the cut is clean: `typeSource` `string`,
`defaultSource` `"abc`. `parseParams` then asks
`hasUnterminatedStringLiteral(field.typeSource)` (`params.ts:264`) — bug 0232's
predicate, over the type half — which correctly answers `false`. The
`theta/load/params-type-not-expression` push at `:277`–`:289` therefore does not
fire, and it is the only place in the file that asks the question at all.

**The default-side guards share a tokeniser that cannot express the failure.**
`tokeniseExpr` (`literal-sublanguage.ts:145`–`:158`) opens a span at `"` or
`'`, advances to the matching quote or to end of text, and consumes the closing
quote only `if (i < n)`. Either way it pushes one `str` token. The three
readers each then ask a question the token cannot answer negatively:
`checkLiteralSublanguage` (`:54`) parses it as a `literal` node and finds no
non-literal sub-expression; `hasRawNewlineInStringLiteral` (`:663`) asks only
whether the token text contains `\n`, and `"abc` does not;
`defaultLiteralStaticType` (`:706`) types it `string` (row d3). The tokeniser's
own doc block (`:655`) records the run-to-end behaviour as deliberate for the
raw-newline predicate — the position where it is deliberate is not the position
that needed a closure check.

**The compat check inherits the repair.** Bug 0163's check
(`params.ts:418`–`:433`) pairs `paramsDeclaredCompatType(field.typeSource)`
with `defaultLiteralStaticType(field.defaultSource)`. Both halves answer, so
the check runs and decides on a value type derived from bytes that derive from
no production: `string` against declared `string` passes (row a1), `string`
against declared `integer` fails with a message about types (rows a6, a7). Bug
0175's mirror contract — the is-literal check and the compat reader must never
disagree — holds here in the wrong direction: they agree that `"abc` is a
string.

**Two runtime readers, two meanings.** `binderPromptParamField`
(`production-theta-producer.ts:678`) puts `defaultSource` into the V11d
requirement token unchanged, and `renderBinderParamLine`
(`binder-system-prompt.ts:256`) interpolates it after `default=` with only line
breaks normalised, producing `  p (string) default="abc` (row c1).
`#recoverDeclaredDefaults` (`:1368`) instead re-splits the field with its own
copy of the splitter (`splitParamDefaultSource`, `:6096`) and calls
`parseExpressionSource` (`theta-document.ts:1324`), whose lex deps install no-op
`sendMessage` / `notify` / `emitDiagnostic` sinks (`:1325`–`:1331`). The lexer
raises `theta/parse/unterminated-string` for those exact bytes (`lexer.ts:537`)
and the diagnostic is discarded; the token still carries the value `abc`, so
the parse returns a string node (row c2) that evaluates and projects into the
merged args identically to the well-formed control (row c4).

## Why it matters

- **A registered theta carries a default its source does not spell.** Row a1
  registers, is not in `required`, and every defaulted invocation that omits
  `p` binds a value assembled from an unterminated literal.
- **Nothing reports it on any channel.** No load diagnostic, no lex
  diagnostic (the one raised is discarded), no runtime note. The only trace is
  the recorded `defaultSource` bytes, which no user surface shows.
- **The one surface that does show them shows them malformed.** The binder
  system-prompt line reads `default="abc` (row c1) — author-controlled text
  presented to the model as a literal, differing from what the merge will
  actually bind.
- **The report that does fire is misdirected.** Rows a6 and a7 tell the author
  their default has the wrong TYPE. The default has no type; it has no closing
  quote.
- **The position is inconsistent with itself.** The same bytes are refused in
  the type half of the same field (row a13, since 0.188.0) and at every lexed
  position (rows b1, b2, b4). One character's difference in where the
  malformation sits decides whether the theta loads.
- **Closing it costs no committed source.** Row d1: zero committed theta files
  carry such a default.

## Non-goals

- **The unmatched-bracket / unmatched-brace default** (row d2). Every quote
  closes there; the construct is a container literal the source does not close,
  which the tokeniser and the is-literal check treat under their own rules. Bug
  0232's normative boundary (its witness row E2) keeps the analogous type-half
  spelling admitted, and no route here moves either.
- **The literal-union default that is out of set** (rows a9, a10). `"z"`
  against `"x" | "y"` is admitted today with every quote closed; that is bug
  0163's check's own disposition and is measured here only as the control that
  isolates the closure defect.
- **Bug 0232's type-half guard.** `hasUnterminatedStringLiteral`
  (`params.ts:1687`) and its call at `:264` are correct for their input; row
  a13 must keep drawing `theta/load/params-type-not-expression` and the
  five-cell witness must stay green.
- **`tokeniseExpr`'s behaviour for the raw-newline predicate.** Bug 0102's
  refusal reads `str` tokens and must keep reading them; a route that changes
  the tokeniser must leave `hasRawNewlineInStringLiteral`'s verdicts
  byte-identical (`literal-sublanguage.ts:663`), including for the multi-line
  container forms bug 0041's adjudication keeps admitted.
- **`parseExpressionSource`'s discarded diagnostics in general.** That entry
  point is shared by the interpolation and params-default-name walks
  (`theta-document.ts:7024`); whether it should surface lex diagnostics
  everywhere is not claimed here. This report claims the `params:` default
  position's own refusal.
- **The duplicated splitter.** `splitParamDefaultSource`
  (`production-theta-producer.ts:6096`) is a second copy of
  `splitParamValue`'s scan. It is cited as a consumer; unifying the two is not
  required by any route below.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/params.ts` — bug 0134's do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one,
states it, and corrects the prose the choice falsifies. All routes are confined
to the `params:` default position: no route changes what any lexed position
draws, and no route changes a lowered byte for a default that is admitted
today.

**(a) Where the closure question is asked.**

- *Route 1 — widen the existing predicate to the whole RHS.* Ask
  `hasUnterminatedStringLiteral` (`params.ts:1687`) of the field's whole
  recovered text rather than of `field.typeSource` alone (`:264`), so the
  question is asked before the split's boundary matters. The route must state
  what the field then draws: `theta/load/params-type-not-expression`'s
  *Message* names the "right-hand side", which for `p: 'string = "abc'` is
  accurate as written, but `code-registry-load.md:19`'s Trigger describes a
  TYPE-side judgement over fragments of a type expression, so the route must
  either extend that Trigger to the default half explicitly or take route 2.
  It must also keep the one-diagnostic-per-field precedence: a field refused
  here draws no default-side literal diagnostic, which is the precedence
  sentence already in that Trigger.
- *Route 2 — refuse at the default splitter's own position.* Leave `:264` as
  it is and add a guard beside the three default-side guards
  (`params.ts:385`/`:393`/`:403`), testing the default half for an unterminated
  span and refusing before `checkLiteralSublanguage` and before the compat
  pair. Bug 0165's `theta/parse/default-without-literal` guard at `:385` is the
  shape precedent — a declaration-form violation refused ahead of the
  is-literal check. The route must name the code: `theta/parse/unterminated-string`
  (`code-registry-parse.md:14`) is the registered row for these exact bytes and
  bug 0102 set the precedent for a lex-phase row firing at this position, but
  that row's Trigger carries no `params:` sentence where
  `literal-newline-in-string`'s (`:13`) does — so choosing it obliges the same
  Trigger amendment 0102 made, under DIAG-2, with the *Message* unchanged
  (DIAG-4). Choosing `theta/parse/default-not-literal` (`:51`) instead requires
  stating why bytes that spell no literal are a sublanguage SHAPE violation.
- *Route 3 — make the tokeniser's verdict available.* Record closure on the
  `str` token in `tokeniseExpr` (`literal-sublanguage.ts:145`–`:158`) and have
  `checkLiteralSublanguage` refuse an unclosed one, so the is-literal check and
  `defaultLiteralStaticType` move together and bug 0175's mirror contract is
  preserved by construction. This is the widest blast radius: `tokeniseExpr` is
  shared with `isBareObjectLiteral`, whose caller (`src/runtime/tool-call.ts`)
  reads a verdict on an unrelated position and needs the scanner byte-stable,
  and with `hasRawNewlineInStringLiteral`. The route must measure both.

**(b) Binding under every route.** Rows a1, a2, a4, a5, a8, a9, a11 and a12
draw exactly one error-severity diagnostic ranged on field `p`, and the theta does
not register. Rows a6 and a7 draw that same diagnostic INSTEAD of
`theta/parse/params-default-type-mismatch` — one diagnostic per offending
field, the precedence the position already keeps. Row a3, row a10, row d2 and
every cell of `tests/params-defaults.test.ts` are unchanged, as are rows b1–b4.

**(c) Reach.** The disposition holds for both quote characters (rows a1, a2),
for a default nested inside an array or object literal (rows a11, a12), for a
span left open by an escaped quote (row a5), and independently of the declared
type (rows a1, a6, a7, a8, a9).

**(d) Locks.** Fresh inline witnesses for every row of §Reproduction, as whole
ordered unfiltered `toEqual` lists with every *Message* through `parseRegistry`
/ `registryMessage` (DIAG-4). The pinned bytes are:
`tests/unterminated-literal-params-type-refusal.test.ts` (bug 0232's five
cells, including its normative row E2), which must stay green unchanged;
`tests/live/params-unterminated-literal-live-cell.test.ts` and
`tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`
(0232's live pair — a fix here touches the same `params:` refusal path they
drive through the real composition root and the real `pi -p` binary, so both
are re-run for real under the live lock);
`tests/params-default-type-compat.test.ts` (0163's — rows a6 and a7 change
which code they draw, and any cell of that file whose default carries an
unterminated literal is re-derived in the same change);
`tests/params-default-empty-literal-refusal.test.ts` (0165's),
`tests/params-default-string-literal-raw-newline.test.ts` (0102's) and
`tests/params-default-trailing-residue-refusal.test.ts` (0175's), whose codes
must not move; `tests/params-defaults.test.ts` and
`tests/params-inline-object-lowering.test.ts`, proven unmoved by hash;
`tests/committed-fixture-parse-gate.test.ts`, which discharges the corpus claim
of row d1.

**(e) Ordering.** No blocking dependency. This report is filed against a landed
fix (0232, 0.188.0) and every row above is measured with that fix in force.

## Fix (0.201.0)

- **Route selected (settled in-run, inside the constraints of the section
  above):** route 2 — refuse at the default splitter's own position, with the
  registered row `theta/parse/unterminated-string` (`code-registry-parse.md`'s
  row for exactly these bytes) and bug 0102's precedent for a lex-phase row
  firing at the `params:` default position. Route 1 (widening bug 0232's
  predicate to the whole RHS) was declined: it reports a DEFAULT-half
  malformation under a TYPE-side Trigger and puts the closure question ahead of
  bug 0102's raw-newline verdict, which the non-goals pin byte-identical. Route
  3 (recording closure on `tokeniseExpr`'s `str` token) was declined on blast
  radius: that scanner also answers `isBareObjectLiteral` for
  `src/runtime/tool-call.ts` and `hasRawNewlineInStringLiteral`, neither of
  which this report claims.
- **What shipped:**
  - `src/parser/params.ts` — one new guard in `parseParams`'s per-field DEFAULT
    loop, between bug 0102's `hasRawNewlineInStringLiteral` push and
    `checkLiteralSublanguage`: when no error-severity diagnostic has yet been
    emitted for this field's default (the existing `defaultDiagStart` slice) and
    `hasUnterminatedStringLiteral(field.defaultSource)` holds, it pushes
    `theta/parse/unterminated-string` at error severity ranged on the field and
    `continue`s. Bug 0232's predicate is reused unchanged and its type-half
    caller is untouched; the predicate is string closure, not container balance,
    so row d2 and bug 0232's normative unbalanced-BRACE boundary stay admitted.
    The `continue` is what makes rows a6 and a7 draw the malformed-literal
    refusal INSTEAD of bug 0163's compatibility code.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` (DIAG-2, same change)
    — the `theta/parse/unterminated-string` row: *Phase* `lex` → `lex, parse`;
    *Trigger* gains the `params:` default reach, the one-diagnostic-per-field
    precedence sentence, and the GOV-15 diagnostic-registry-carve-out sentence.
    *Message* and *Hint* unchanged (DIAG-4). Mirrored (Phase only) in
    `docs/reference/diagnostics.md` — the same package bug 0102's fix shipped
    for the neighbouring row.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (§Defaults) and
    `docs/reference/frontmatter.md` — the RHS must close every string literal it
    opens; one that never closes spells no `Literal` and is refused,
    `theta/parse/unterminated-string`, ranged on the offending field.
    `lexical.md` and `grammar.md` are unedited.
  - `tests/code-registry.test.ts` — ONE expectation, the sample row's *Phase*
    (`"lex"` → `"lex, parse"`), the mechanical mirror of the DIAG-2 amendment.
    Premeasured as the only flipped assertion in the entire default suite.
  - `tests/params-default-unterminated-literal-refusal.test.ts` — the witness:
    26 cells over the reproduction rows (the registry row; all thirteen (a) rows
    as whole ordered unfiltered `toEqual` triples with every *Message* read
    through `parseRegistry` / `registryMessage`; a drop-gate cell over the eleven
    refused rows; (b)'s four lexed rows; (c)'s four reader calls; (d2) and (d3);
    an anti-vacuity inventory cell).
  - `tests/live/params-default-unterminated-literal--live-cell.test.ts`
    (H8a) and
    `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts`
    (H9a) — the live pair mirroring bug 0232's shape at the default half.
- **Gates:** witness `26 passed (26)`; default suite `Test Files 388 passed
  (388)` / `Tests 8034 passed (8034)`; `npm run typecheck` clean (no output);
  `npm run lint` clean (no output). Live, run for real under the shared lock:
  the new H8a cell green (the offender does not register, the closed neighbour
  does, the `theta-system-note` channel carries the code), the new H9a
  acceptance file green in full (`Tests 2 passed (2)` — OFFENDER REFUSED, GOOD
  LOADED, and the print-mode code measurement), and bug 0232's own pair
  (`tests/live/params-unterminated-literal-live-cell.test.ts`,
  `tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`)
  re-run green as the fix section requires.
- **Review:** 2 rounds. Round 1 (deep) — one finding, `spec`: the §Defaults
  sentence claimed the diagnostic "names the field", which DIAG-4's bare
  *Message* cannot do; corrected to "ranged on the offending field". Round 2
  (fast) — clean, no findings, no escalation.
- **Verification:** PASS. (1) The witness reds for the right reason with the
  guard neutralised (11 red / 15 green — rows a1, a2, a4, a5, a6, a7, a8, a9,
  a11, a12 and the drop-gate cell, each showing `[]` plus a lowered schema plus
  the unterminated `defaultSource`), then byte-exact restoration
  (`git hash-object` identical before and after) and 26/26 green again. (2) The
  default suite is green. (3) Live end-to-end green as above. (4) Lint and
  typecheck clean. `tests/fixtures/h7a/permitted-codes.json` needs no change:
  the completed H9a run measured `[]` observed codes on both spawns, so
  `theta/parse/unterminated-string` does not reach the print-mode capture.
- **Locks preserved unchanged:**
  `tests/unterminated-literal-params-type-refusal.test.ts` (bug 0232's five
  cells including its normative row E2),
  `tests/params-default-type-compat.test.ts` (bug 0163 — green unmodified, so no
  cell of it carried an unterminated-literal default and the conditional
  re-derivation is discharged vacuously),
  `tests/params-default-empty-literal-refusal.test.ts` (bug 0165),
  `tests/params-default-string-literal-raw-newline.test.ts` (bug 0102),
  `tests/params-default-trailing-residue-refusal.test.ts` (bug 0175),
  `tests/params-defaults.test.ts`, `tests/params-inline-object-lowering.test.ts`
  and `tests/committed-fixture-parse-gate.test.ts` — all green, none edited. Row
  d1's corpus claim is discharged by that last gate.
- **Residuals:**
  1. The new H9a acceptance file's PROBE spawn asks the model to echo two fixed
     verdict tokens and is exposed to the sentinel-refusal class: it red once and
     then passed on identical bytes. Its query sits inside the offender/GOOD
     verdict path, so it was not rewritten here. A bounded remedy would restate
     those two verdicts as computed answers, the shape the CLEAN precondition now
     uses.
  2. Bug 0232's H9a acceptance file passed here, but its OFFENDER theta is
     non-bypass with no `bind_model:`, so that file's `OFFENDER REFUSED` is not
     uniquely attributable to `theta/load/params-type-not-expression`. Not this
     report's claim; noted for whoever next touches that file.
  3. Reproduction row a12's `$defs` slug is unobservable post-fix (the row is
     refused and the frontmatter is withheld); the witness carries it as
     documentation only.
- **Where the report was wrong:** the expected-behaviour and binding sentences
  asked for a diagnostic "naming the field".
  `theta/parse/unterminated-string`'s normative *Message* is the bare
  `unterminated string literal` with no placeholder and DIAG-4 defers wording
  changes to theta 2.0, so under the selected route the field is named by the
  diagnostic's RANGE. Both sentences are corrected above and the witness asserts
  the range property.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** unchanged — the unmatched bracket/brace
  default (row d2), the out-of-set literal-union default (rows a9, a10), bug
  0232's type-half guard, `tokeniseExpr`'s behaviour for the raw-newline
  predicate, `parseExpressionSource`'s discarded diagnostics in general, and the
  duplicated splitter.

## Provenance

Filed as the forward filing of bug
[0232](./0232-unterminated-literal-params-type-drops-inline-fields.md)'s fix
report (`.pi/tmp/fixes/0232-report.md` §Residuals 1), which records
`p: 'string = "abc'` as still admitted, names `splitParamValue`
(`src/parser/frontmatter.ts:661`) as the reason its predicate answers `false`,
and leaves the shape for a sibling filing. The same shape was raised in that
run's review round 1 as finding F1 (correctness, non-blocking).

Independently re-derived at HEAD `30c0cb67` (0.197.0): five scratch vitest
files over `parseDoc` (`tests/helpers/e2e-s1.ts`),
`doc.frontmatter.params.loweredSchema`, `renderBinderParamLine`
(`src/binder/binder-system-prompt.ts:251`), `parseExpressionSource`
(`src/parser/theta-document.ts:1324`), `defaultLiteralStaticType` and
`checkLiteralSublanguage` (`src/parser/literal-sublanguage.ts:706`, `:54`),
covering the thirteen `params:` rows of §Reproduction (a), the four body rows
of (b), the four downstream calls of (c) and the three bounds of (d); the
corpus census over `git ls-files -- '*.theta' '*.thetalib'`. All five scratch
files were deleted.

Three facts the 0232 report does not state, added by this measurement: the
compatibility check installed by bug 0163 runs on a type derived from the
malformed bytes and misreports the failure as a type mismatch for a
non-`string` declared type (rows a6, a7); the binder system prompt renders the
unterminated bytes verbatim to the model (row c1); and the declared-default
recovery repairs them to a well-formed string value because
`parseExpressionSource` discards the lexer's own
`theta/parse/unterminated-string` (rows c2, c4).

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.
