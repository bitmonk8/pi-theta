# Bug 0102 — A raw newline inside a string literal is refused in theta body code and admitted at the `params:` default RHS: `p: string = "a<LF>b"` loads with zero diagnostics and registers, because `checkLiteralSublanguage` tokenises the default with its own scanner whose quoted-string loop carries no newline test where the lexer's loop terminates on one — and the three readers of the recorded `defaultSource` then disagree about what it denotes: the is-literal check treats the break as string content, the binder renders it as the `\n` escape that *Default-literal rendering* says preserves the value the source denotes, and the invocation-time default recovery re-lexes the same bytes and truncates the value to `a`; where the string sits inside an `ArrayLit` or an object literal the recovery also fabricates an element and a field the author never wrote

- **Status:** fixed (0.75.0). §Fix was settled on one approach — refuse the raw break at
  the default RHS under the existing code `theta/parse/literal-newline-in-string`,
  emitted from the `parseParams` per-field default loop, with the registry row's
  *Trigger* and *Phase* reconciled in the same commit. No ordering dependency:
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
  shipped in 0.61.0 and its §Fix assessed this refusal as its route C, rejected
  as a substitute for its own transform and recommended for separate filing.
  One coordination obligation, not an ordering one: four assertion groups of
  0060's shipped witness (48 tests, green at HEAD) pin today's admission and
  invert under this fix (§Fix constraint 7).
- **Sev/Diff estimate:** S1/D2 — an input the spec refuses loads with zero
  diagnostics and the value the default binds differs from the value the source
  and the rendered prompt both denote; D2 because the change is one seam in one
  subsystem plus a same-commit registry *Trigger*/*Phase* edit with no new code.
- **Kind:** parser tolerance against a lexical rule the same grammar inherits,
  with one registry-row *Phase* mismatch. `docs/spec_topics/grammar.md:9` makes
  the `params:` default RHS a strict subset of the expression grammar and `:20`
  makes `PrimitiveLit ::= STRING`, whose `STRING` production is lexical.md's
  (`grammar.md:5`); `docs/spec_topics/lexical.md:26` makes a regular string
  literal single-line only and a literal newline inside one
  `theta/parse/literal-newline-in-string`. The lexer enforces that
  (`src/lexer/lexer.ts:434`, the string scan's loop condition tests for `\n`,
  and `:520–527` raises the code). The default RHS never reaches the lexer at
  load: `parseThetaDocument` lexes `split.bodyText` only
  (`src/parser/theta-document.ts:779`), and the is-literal check the position
  does run tokenises with its own scanner whose quoted-string loop has no
  newline test (`src/parser/literal-sublanguage.ts:140`).
- **Related:**
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    — **fixed (0.61.0)**, the parent and the filing origin. Its §Fix assessed
    this refusal as *route C*, rejected it as a substitute for its own
    rendering transform, and recommended it be filed on its own terms
    (`:644–661`); its §Fix (0.61.0) *Residuals* item (i) (`:877–885`) records
    the same asymmetry as confirmed-and-not-closed at the fix baseline. 0060
    normalised the *rendering* only and added no refusal, so the input is still
    admitted at HEAD (re-confirmed below).
  - [0041](./0041-params-block-mapping-rhs-silent-permissive.md) — **fixed
    (0.51.0)**, the origin of the family and the reason this filing is scoped to
    the string-literal case alone. Its §Fix records that a first implementation
    refused any recovered type text carrying a line break and that review round
    1 removed it, because it refused a grammar-admitted multi-line flow mapping
    "with a message asserting it is not a type expression" and "did not close
    the reach anyway (a line break still arrives through the default RHS)"
    (`:427–439`). The refusal here is keyed on the string span, not on the
    presence of a break, which is what keeps it clear of that failure.
  - [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) and
    [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
    both **open**, and disjoint from this report. Both own the `params:`
    position's *type*-side lowering: 0056 the absent literal sublanguage at the
    type position (`p: '"x" | "y"'` lowering to `{"anyOf":[{},{}]}`), 0059 the
    permissive `{}` for scalar text no `Type` production spells. This report
    changes neither lowering and adds no lowering: it removes one input from the
    default-RHS admission set. The fixtures do not overlap — every row here
    carries a type that lowers correctly (`string`, `array<string>`, `Note`,
    `Triage`).
- **Affected** (every citation verified at HEAD `99b65438`, 0.62.0):
  - `src/parser/literal-sublanguage.ts:121–235` — `tokeniseExpr`, **the
    mechanism.** `:132–135` treats `\n` and `\r` as inter-token whitespace
    exactly like a space or a tab. `:136–150` is the quoted-string scan: the
    loop condition is `while (i < n && source[i] !== quote)` (`:140`) with a
    backslash-escape skip (`:141–143`) and no newline test, so a raw break
    inside a quoted span is content and the span closes only at its matching
    quote or at end of text (`:146–148`). `:149` pushes one `str` token over the
    whole span.
  - `src/parser/literal-sublanguage.ts:53–78` — `checkLiteralSublanguage`, the
    is-literal check. `:58` tokenises with `tokeniseExpr`, `:59–60` parses, `:64`
    walks for the first non-literal form. `parsePrimary` maps a `str` token to
    `{kind: "literal"}` (`:391–393`) and `firstNonLiteral` returns `undefined`
    for `literal` (`:491–492`), recursing into `array` (`:499–506`) and `object`
    (`:507–514`) members. A break-carrying string is therefore one admitted
    literal at any nesting depth.
  - `src/parser/params.ts:253–265` — the per-field default loop, with the
    `checkLiteralSublanguage(field.defaultSource, "default", …)` call at `:260`
    ranged on `field.range` (`:262`). This is the only check any default RHS
    meets, and `theta/parse/default-not-literal` is the only code it can raise.
    `:270–273` is the gate that withholds the lowered schema when any
    error-severity diagnostic is present — the reason the X3 control leaves
    `frontmatter: null` and these rows do not.
  - `src/parser/params.ts:132–136` — `parseParams`, called from
    `src/parser/frontmatter.ts:752` inside `extractParsedParams` (`:687–762`).
  - `src/parser/frontmatter.ts:614–653` — `splitParamValue`, which splits the
    field scalar at the first top-level `=`. Its quote arm (`:635–637`) tracks a
    string span with the same escape skip and no newline test, so a break inside
    a default's string literal survives the split as recorded bytes. `:711–713`
    recovers the field's raw value (a block scalar through `paramValueSource`),
    `:714` splits it, `:733–738` records the `ParamFieldInput` the check reads,
    and `:739–747` records the `BypassParamsField` the binder reads — both with
    `defaultSource` verbatim.
  - `src/lexer/lexer.ts:428–545` — the lexer's string scan, **the other side of
    the asymmetry.** `:434` is `while (i < n && text[i] !== "\n")`, so the scan
    terminates on a raw break with `closed` false, and `:520–527` raises
    `theta/parse/literal-newline-in-string` for that case (`:528–535` raises
    `theta/parse/unterminated-string` for the EOF case). This is the only
    emitter of the code in `src/`.
  - `src/parser/theta-document.ts:763`, `:779` — `splitFrontmatter` and the
    body-only lex. The lexer is given `split.bodyText`; the frontmatter block's
    bytes never reach it, so the emitter above is unreachable from a `params:`
    default at load.
  - `src/parser/theta-document.ts:1142–1153` — `parseExpressionSource`, **the
    third reader.** It lexes its argument with the real `lexTheta` (`:1143–1150`)
    and discards `lex.diagnostics` entirely, returning
    `parser.parseSingleExpression()` (`:1152`). For a recorded default carrying
    a raw break the lexer's newline test therefore fires and is thrown away, and
    the truncated node is returned.
  - `src/extension/production-theta-producer.ts:1188–1231` —
    `#recoverDeclaredDefaults`, the invocation-time default recovery, called at
    `:1163`. It re-reads the theta from disk (`:1196`), re-parses the
    frontmatter YAML (`:1207`), reads the field's raw scalar (`:1216`), splits
    the default off with `splitParamDefaultSource` (`:1220`), parses it with
    `parseExpressionSource` (`:1224`), and pushes
    `evaluatePureExpression(parsed, env)` as the field's `defaultValue`
    (`:1228`).
  - `src/extension/production-theta-producer.ts:5514–5544` —
    `splitParamDefaultSource`, whose doc comment states it is "Kept in step with
    the parser's own `splitParamValue`". Its quote arm (`:5527–5529`) carries the
    same escape skip and the same absence of a newline test, so the recovery
    path receives the same bytes the loader recorded.
  - `src/extension/production-theta-producer.ts:5713–5719` —
    `evaluatePureExpression`; `case "string": return expr.value` (`:5717–5719`).
    The value the default binds is the parsed node's `value`.
  - `src/binder/binder-system-prompt.ts:168–182` — `renderBinderParamLine`, the
    **second reader**, and 0060's shipped seam. `:169` and `:173` pass
    `field.type` and `field.requirement.literal` through
    `normaliseParamLineBreaks` (`:212`), whose string-literal arm renders a
    break as the two-character escape `\n`. `:201–210` is the doc comment
    anchoring that arm to lexical.md §String literals and citing
    `src/parser/literal-sublanguage.ts:136–150` as the loop it mirrors — a hard
    line range 0060 recorded as ungated against drift (its residual (v)). The
    doc comment runs `:184–211`; the transform begins at `:212`.
  - `src/parser/literal-sublanguage.ts:89–94` — `isBareObjectLiteral`, the
    **other consumer of the same tokeniser** (`:90`). Its only `src/` caller is
    `src/runtime/tool-call.ts:226`, the guard that raises
    `theta/parse/tool-arg-not-object-literal` (`:223–238`, the code at `:231`).
    Measured: `isBareObjectLiteral('{ path: "a",<LF>mode: "b" }')` is `true`
    today. This is what fixes the fix's seam (§Fix constraint 2).
  - `src/extension/production-composition.ts:1904–1911` — `hasLoadParseError`,
    which un-registers a theta on any error-severity `theta/load/*` or
    `theta/parse/*` diagnostic. Every row in §Reproduction below emits none, so
    each theta registers.
  - `docs/spec_topics/lexical.md:26` — §String literals: "**Single-line only** —
    a literal newline inside a regular string is
    `theta/parse/literal-newline-in-string`", with `\n` in the escape table and
    the remedy ("build via `+` concatenation with `\n` escapes, or factor the
    text into a query"). `:22` — §Statement terminators and the closed
    continuation-trigger set, which is why a multi-line `ArrayLit` is admitted
    in body code.
  - `docs/spec_topics/grammar.md:9` — the literal sublanguage is "a strict
    subset of the expression grammar admitted in one position: the RHS of a
    `params:` default"; `:5` — the lexical productions including `STRING` "are
    defined in [Lexical Structure]"; `:13–35` — the `Literal` production block,
    `:20` `PrimitiveLit ::= STRING`, `:28` `ArrayLit`, `:30–31` `BareObjectLit`,
    `:33` `NamedObjectLit`. Mirrored user-facing at
    `docs/reference/grammar.md:504–521`, and the string-literal rule at
    `docs/reference/grammar.md:115–122` (`:119–120` the single-line sentence).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` — §Defaults: the
    default RHS "is parsed by the **Theta literal sublanguage** — the same
    notation Theta uses for value construction in body code", with the refused
    set enumerated (operators, calls, non-`Enum.Variant` identifier references,
    `${...}`, `@`...``) and `theta/parse/default-not-literal` named. `:71` —
    "Because the literal sublanguage *is* a subset of the body expression
    grammar". Neither sentence admits a spelling body code refuses.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:13` — the
    `theta/parse/literal-newline-in-string` row: *Sev* `E`, *Phase* `lex`,
    *Trigger* "Literal newline inside a regular (single-line) string literal.",
    *Hint* "Use a `@`...`` query template, or split with `+ \"\\n\" +`.",
    *Message* `literal newline in string literal`. `:14` — the
    `theta/parse/unterminated-string` row, the same *Phase* and the sibling
    disposition of the same scan. `:48` — the
    `theta/parse/default-not-literal` row, *Phase* `parse`, the code emitted
    from the same `parseParams` call this fix extends. Mirrored (no *Trigger*
    column) at `docs/reference/diagnostics.md:59` and `:94`.
  - `docs/spec_topics/diagnostics/code-registry-load.md:19` —
    `theta/load/params-type-not-expression`, *Phase* `load`, emitted from
    `extractParsedParams` itself: the frontmatter `params:` seam already carries
    rows on two different *Phase* values. `:32` —
    `theta/load/invoke-path-escape`, whose *Phase* cell reads `load, runtime`,
    the one multi-valued cell in the four tables.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — "changing a
    code's namespace, severity, or trigger" is a spec change, with the GOV-15
    routing), `:74` (DIAG-4 — a *Message* reword is deferred to theta 2.0),
    `:80` (the column legend and the closed *Phase* taxonomy `lex` / `parse` /
    `type` / `load` / `runtime`), `:56` (the `Phase` column distinguishes
    `lex` / `parse` / `type` within `theta/parse/*`).
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate — no diagnostic of effective severity `E`),
    `:25` (the diagnostic-registry carve-out: a "DIAG-2 *trigger* change is
    dispositioned by the same principle, in-scope as an addition for inputs
    newly brought into the code's emission set").
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md:142` — *Default-literal
    rendering* (MUST): the rendered `<literal>` is the default "rendered in the
    Theta literal sublanguage surface syntax — the same notation accepted on the
    RHS of `params:` defaults", and "The string-literal arm escapes where the
    other collapses because `\n` is the literal sublanguage's own spelling for a
    newline, so the rendered `<literal>` still denotes the value the source
    denotes." `:129` — *Type display*, which states the two-arm rule the
    sentence defers to and names `LiteralType` as the reason the string arm
    exists in type position. `:117` — item 4's per-field cardinality.
  - `tests/binder-param-line-newline-normalisation.test.ts` — 0060's offline
    witness, 48 tests, green at HEAD. `:999–1046` is group (h), which pins this
    asymmetry as an observed control in both directions and asserts no refusal:
    `:1007–1017`
    asserts the body-code refusal (X1), `:1019–1026` the body-code array
    admission (X2), and `:1028–1045` asserts `diagCodes` `[]` and a non-null
    frontmatter for R3b and R3c. Group (a) (`:586–630`) drives R3b / R3c
    (`:596–597`) through `loadCleanly`, which asserts zero diagnostics
    (`:334–339`). Group (d) (`:741–818`) does the same at `:745–746` and
    `:788–790`. Group (b) (`:639–670`) drives F2 and R3d, whose forged lines sit
    inside a string literal carrying a raw break (`ROW.F2` `:287`, `ROW.R3d`
    `:288`), while F1 and R3e (`:286`, `:289`) carry no quote at all. Group (e)
    (`:827–869`) is the over-refusal fence. No other test in the tree names R3b
    or R3c.
  - `tests/code-registry.test.ts:58–126` — the DIAG-2 closed-set reconciliation
    over the four sharded registry pages. It reads each row's
    namespace / severity / phase / trigger / message (`:26–33`, `:62–82`) and
    fails a registry code no test asserts and an asserted code with no row
    (`:86–125`). A *Trigger* / *Phase* widening of an existing row adds no code,
    so no new asserting-test obligation arises;
    `tools/code-registry/index.js:48` reads the *Phase* cell verbatim with no
    closed-set validation.
  - `tests/lexer-parser-diagnostics-production.test.ts:82–87` — the production
    witness that `theta/parse/literal-newline-in-string` fires from the lexer,
    the asserting test the closed-set gate pairs with the row.
  - **The corpus.** 34 committed `.theta` / `.thetalib` files
    (`rg --files --glob '*.theta' --glob '*.thetalib' .`; the 35th,
    `.pi/theta/smoke.theta`, is ignored by `.gitignore:26`). 17 declare
    `params:`, 19 fields in total, zero block-scalar field values and zero field
    values spanning a physical line. Exactly one field carries a default —
    `tests/live/acceptance/fixtures/acc-params-binder.theta:6`,
    `count: number = 3` — which carries no string literal and no break.
- **Observed at:** `0.62.0` (HEAD `99b65438`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through `tests/helpers/e2e-s1.ts`, the shipped `renderBinderParamLine`, the
  shipped `checkLiteralSublanguage` / `isBareObjectLiteral`, and the shipped
  `parseExpressionSource`; plus a corpus census over the committed
  `.theta` / `.thetalib` files. Written, run, deleted.

## Summary

`docs/spec_topics/lexical.md:26` makes a regular string literal single-line
only: a literal newline inside one is
`theta/parse/literal-newline-in-string`. `docs/spec_topics/grammar.md:9` makes
the `params:` default RHS a strict subset of the same expression grammar, and
`:20` makes `PrimitiveLit ::= STRING` — the same `STRING` lexical.md defines
(`:5`). Body code enforces the rule; the default RHS does not.

```
body      let s = "a<LF>b"          →  error theta/parse/literal-newline-in-string  (twice)
default   p: string = "a<LF>b"      →  no diagnostic; the theta registers
```

The mechanism is a second tokeniser. `parseThetaDocument` lexes the body only
(`src/parser/theta-document.ts:779`), so the lexer's newline test
(`src/lexer/lexer.ts:434`) never sees a frontmatter default. The check the
position does run, `checkLiteralSublanguage`, tokenises with its own scanner
whose quoted-string loop closes on the matching quote and on nothing else
(`src/parser/literal-sublanguage.ts:140`), so the break is string content, the
default is one `PrimitiveLit`, and the check returns no diagnostic. Both YAML
spellings of the break reach the same recorded bytes — a `\n` escape inside a
double-quoted scalar and a physical line inside a block scalar — and both
quote characters are admitted, at any nesting depth inside an `ArrayLit` or an
object literal.

Three readers then consume the recorded `defaultSource` and disagree about what
it denotes:

- **The is-literal check** (`src/parser/params.ts:260`) reads the break as
  content: the default is a legal string literal.
- **The binder** (`renderBinderParamLine`,
  `src/binder/binder-system-prompt.ts:169`, `:173`) renders it as the
  two-character escape `\n`, which
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:142` states preserves
  "the value the source denotes". The model is told the default is `"a\nb"`.
- **The invocation-time recovery** (`#recoverDeclaredDefaults`,
  `src/extension/production-theta-producer.ts:1224`) re-parses the same bytes
  with `parseExpressionSource`, which lexes them with the real lexer and
  discards its diagnostics (`src/parser/theta-document.ts:1142–1153`). The
  string scan stops at the break, so the node is `{kind: "string", value: "a"}`
  and `evaluatePureExpression` returns `expr.value` (`:5717–5719`). The default
  binds `a`.

Where the break-carrying string is nested, the recovery does not only truncate.
`["a<LF>b"]` re-parses to a three-element array — `"a"`, the identifier `b`, and
the string `"]"` — and `{ text: "a<LF>b" }` to a two-field object,
`text: "a"` plus a field named `b` whose value is `" }"`, against a schema
that declares one field and forbids additional properties.

The sibling case is the reason this is scoped to the string literal alone. A
multi-line `ArrayLit` (`[1,<LF>2]`) is admitted in body code — an open `[` and a
trailing comma are both continuation triggers (`lexical.md:22`) — and its three
readers agree: recorded `[1,<LF>2]`, rendered `[1, 2]`, re-parsed as the
two-element integer array. That input stays admitted.

## Reproduction

Offline, at `99b65438`. Scratch vitest: the real `parseThetaDocument` through
`tests/helpers/e2e-s1.ts` (`parseDoc`), the shipped `renderBinderParamLine` fed
the recorded field exactly as `binderPromptParamField` maps it, the shipped
`checkLiteralSublanguage` and `isBareObjectLiteral`, and the shipped
`parseExpressionSource` over the recorded `defaultSource`. Every fixture is a
`mode: prompt` theta; the body declares the schemas each row's type names
(`schema Triage { urgent: boolean }` or `schema Note { text: string }`) plus
`let x = 1`. `diags` is `doc.diagnostics`; `field` is
`doc.frontmatter.params.fields[0]`; `render` is the rendered per-field line;
`reparse` is `parseExpressionSource(field.defaultSource)`.

### The same bytes in body code

```
@@ X1    let s = "a                 diags :: ["error theta/parse/literal-newline-in-string",
         b"                                   "error theta/parse/unknown-identifier: unknown identifier 'b'",
                                              "error theta/parse/literal-newline-in-string"]
@@ X1'   let s = 'a                 the same three codes, in the same order
         b'
@@ X2    let s = [1,                diags :: []
         2]
```

Both quote characters are refused; the multi-line array is admitted
(`lexical.md:22`).

### The same bytes at the `params:` default RHS

```
@@ R3b   p: "Triage = \"a\nb\""     diags   :: []          fmNull :: false
                                    field   :: {"wireName":"p","type":"Triage","hasDefault":true,
                                                "defaultSource":"\"a\nb\"","nullable":false}
                                    render  :: "  p (Triage) default=\"a\\nb\""
                                    reparse :: {"kind":"string","value":"a"}
@@ R3c   p: |                       diags   :: []          fmNull :: false
           string = "a              field.defaultSource :: "\"a\nb\""
           b"                       render  :: "  p (string) default=\"a\\nb\""
                                    reparse :: {"kind":"string","value":"a"}
@@ SQ    p: |                       diags   :: []          fmNull :: false
           string = 'a              field.defaultSource :: "'a\nb'"
           b'                       render  :: "  p (string) default='a\\nb'"
                                    reparse :: {"kind":"string","value":"a"}
```

R3b spells the break as YAML's `\n` escape inside a double-quoted scalar; R3c
spells it as a physical line inside a block scalar. Both record the same
`defaultSource` bytes. Every row lowers cleanly — R3b to
`{"$ref":"#/$defs/Triage"}` with the `Triage` fragment hoisted, R3c and SQ to
`{"type":"string"}` — and every theta registers (`hasLoadParseError`,
`src/extension/production-composition.ts:1904–1911`).

### Nested inside an admitted container literal

```
@@ ARR   p: |                       diags   :: []
           array<string> = ["a      field.defaultSource :: "[\"a\nb\"]"
           b"]                      lowered.properties.p :: {"type":"array","items":{"type":"string"}}
                                    render  :: "  p (array<string>) default=[\"a\\nb\"]"
                                    reparse :: array of THREE elements —
                                               {"kind":"string","value":"a"},
                                               {"kind":"ident","name":"b"},
                                               {"kind":"string","value":"]"}
@@ OBJ   p: |                       diags   :: []
           Note = { text: "a        field.defaultSource :: "{ text: \"a\nb\" }"
           b" }                     lowered.properties.p :: {"$ref":"#/$defs/Note"}
                                    render  :: "  p (Note) default={ text: \"a\\nb\" }"
                                    reparse :: object of TWO fields —
                                               text → {"kind":"string","value":"a"},
                                               b    → {"kind":"string","value":" }"}
```

`firstNonLiteral` recurses into `array` and `object` members
(`src/parser/literal-sublanguage.ts:499–514`), and every member is a literal, so
the check is silent at any depth. `Note` declares `text` and lowers with
`"additionalProperties": false`; the recovered default object carries a field
named `b`.

### The correct spelling, and the is-literal check on its own subject

```
@@ CTL   p: 'string = "a\nb"'       diags   :: []
                                    field.defaultSource :: "\"a\\nb\""
                                    render  :: "  p (string) default=\"a\\nb\""
                                    reparse :: {"kind":"string","value":"a\nb"}
@@ X3    p: integer = 1 + 1         diags   :: ["error theta/parse/default-not-literal:
                                                params default RHS must be a literal-sublanguage form;
                                                offending sub-expression: 1 + 1"]
                                    fmNull  :: true   (the theta is refused)
```

CTL is the spelling `lexical.md:26` directs an author to (`\n` as the
two-character escape). It renders to the same bytes as R3b / R3c / SQ and
re-parses to the value the author wrote — so the rendered prompt cannot
distinguish the correct spelling from the three that silently bind a different
value. X3 shows the check still refuses its own subject and withholds the
lowered schema (`src/parser/params.ts:270–273`).

### The check, called directly

```
@@ checkLiteralSublanguage(src, "default", site)
   "\"a<LF>b\""      →  []
   "'a<LF>b'"        →  []
   "[\"a<LF>b\"]"    →  []
   "\"a\\nb\""       →  []
   "\"a"             →  []            [an unterminated span, consumed to end of text]
   "1 + 1"           →  ["error theta/parse/default-not-literal: … offending sub-expression: 1 + 1"]
```

### The other consumer of the same tokeniser

```
@@ isBareObjectLiteral(src)
   "{ path: \"a\",<LF>mode: \"b\" }"  →  true      [a legal multi-line Pi-tool argument]
   "{ path: \"a\" }"                  →  true
   "{ path: \"a<LF>b\" }"             →  true
   "args"                             →  false
```

`isBareObjectLiteral` (`src/parser/literal-sublanguage.ts:89–94`) shares
`tokeniseExpr` and is the whole of `theta/parse/tool-arg-not-object-literal`'s
admission test (`src/runtime/tool-call.ts:226`). The first row is what selects
the fix's seam: a newline test placed inside `tokeniseExpr` reaches this
consumer.

### Corpus census

34 committed `.theta` / `.thetalib` files; 17 declare `params:`; 19 fields in
total; zero block-scalar field values; zero field values spanning a physical
line. One field carries a default —
`tests/live/acceptance/fixtures/acc-params-binder.theta:6`, `count: number = 3`.
No committed file is in the refused set.

## Expected behaviour

- **The default RHS inherits `STRING` from lexical.md.**
  `docs/spec_topics/grammar.md:5` states that the lexical productions
  (`Ident`, `STRING`, `NUMBER`, `BOOLEAN`, `NULL`) "are defined in [Lexical
  Structure]", `:20` makes `PrimitiveLit ::= STRING`, and
  `docs/spec_topics/lexical.md:26` makes that production single-line only with a
  named diagnostic. A position whose grammar cites `STRING` refuses what
  `STRING` excludes.
- **The subset relation is stated in both directions.**
  `grammar.md:9` calls the literal sublanguage "a strict subset of the
  expression grammar", and
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` calls it "the same
  notation Theta uses for value construction in body code", with `:71` adding
  "Because the literal sublanguage *is* a subset of the body expression
  grammar". A spelling body code refuses is not in a subset of what body code
  admits. Measured: X1 against R3b / R3c / SQ.
- **One recorded default has one denotation.**
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:142` (MUST) states that
  the rendered `<literal>` "still denotes the value the source denotes", and the
  recovery path exists to bind that same value
  (`src/extension/production-theta-producer.ts:1188–1231`, whose doc comment at
  `:1185–1186` states it "parses + evaluates the literal with the body's pure
  evaluator"). For R3b / R3c the rendering denotes `"a\nb"` and the recovery
  binds `"a"`. Both readers are correct on the input they are given; the input
  is one the grammar does not admit.
- **A diagnostic the lexer raises is not discarded on the path that raises it.**
  `parseExpressionSource` (`src/parser/theta-document.ts:1143–1150`) lexes with
  the real `lexTheta` and drops `lex.diagnostics`. For this input class the
  dropped diagnostic is exactly
  `theta/parse/literal-newline-in-string` — the code the registry carries and
  the load pass never emitted.
- **The registry row's *Phase* matches the stage that emits it.**
  `docs/spec_topics/diagnostics/diagnostic-shape.md:80` defines *Phase* as
  "which pipeline stage emits the diagnostic", and `:56` states that the column
  distinguishes `lex` / `parse` / `type` within `theta/parse/*`. The
  `literal-newline-in-string` row reads `lex`
  (`code-registry-parse.md:13`) and today that is exact: `src/lexer/lexer.ts` is
  its only emitter. An emission from the frontmatter `params:` seam is not a
  `lex`-phase emission — the sibling code raised from the same call reads
  `parse` (`code-registry-parse.md:48`) — so the row's *Phase* is part of what
  the fix reconciles, not a detail left implicit.
- **The refused set at this position is enumerated where the position is
  specified.** `frontmatter-fields-a.md:60` lists what a default RHS may not
  contain and names `theta/parse/default-not-literal`. A second refusal at the
  same position belongs in the same enumeration.

## Actual behaviour / root cause

**Two tokenisers, one grammar.** The lexer's string scan terminates on a raw
break:

```ts
      while (i < n && text[i] !== "\n") {
```

`src/lexer/lexer.ts:434`. The scan exits with `closed` false and `:520–527`
raises `theta/parse/literal-newline-in-string`. The is-literal check's scan does
not:

```ts
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          i += 1;
        }
        i += 1;
      }
```

`src/parser/literal-sublanguage.ts:140–145`. The only exit conditions are the
matching quote and end of text (`:146–148`), so the break is content and `:149`
pushes one `str` token spanning it. `parsePrimary` maps a `str` token to
`{kind: "literal"}` (`:391–393`), `firstNonLiteral` returns `undefined` for
`literal` (`:491–492`), and `checkLiteralSublanguage` returns no diagnostic
(`:65–67`). The same module treats `\n` as inter-token whitespace
(`:132–135`), which is the independent reason a multi-line `ArrayLit` is
admitted.

**The lexer is never given the frontmatter.** `parseThetaDocument` splits the
document (`src/parser/theta-document.ts:763`) and lexes `split.bodyText`
(`:779`); the frontmatter block is parsed as YAML instead (`:821`). So the one
emitter of the code in `src/` is structurally unreachable from a `params:`
default at load, and the is-literal check is the whole of what the position
enforces (`src/parser/params.ts:253–265`, the call at `:260`).

**The recorded bytes survive every split.** `splitParamValue`
(`src/parser/frontmatter.ts:622–653`) tracks a string span with the same escape
skip and no newline test (`:635–637`), so the break rides `defaultSource`
verbatim into both the `ParamFieldInput` the check reads (`:733–738`) and the
`BypassParamsField` the binder reads (`:739–747`). At invocation
`splitParamDefaultSource`
(`src/extension/production-theta-producer.ts:5514–5544`) repeats the same walk
(`:5527–5529`) over the re-read YAML, by design — its doc comment states it is
"Kept in step with the parser's own `splitParamValue` so a recovered default
matches the literal the loader validated".

**The third reader uses the lexer and throws the answer away.**

```ts
export function parseExpressionSource(source: string): Expr | null {
  const lex = lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    { pi: { sendMessage: () => {} }, ui: { notify: () => {} }, emitDiagnostic: () => {} },
  );
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
  return parser.parseSingleExpression();
}
```

`src/parser/theta-document.ts:1142–1153`. `lex.diagnostics` is never read. For
`"a<LF>b"` the lexer's newline test fires, the string token ends at the break,
and the returned node is `{kind: "string", value: "a"}` (measured).
`#recoverDeclaredDefaults` passes that node to `evaluatePureExpression`
(`:1228`), whose `case "string"` returns `expr.value` (`:5717–5719`). For the
nested rows the truncation leaves the remaining bytes to be re-parsed as
grammar: `["a<LF>b"]` yields three elements (the second an identifier `b`, the
third the string `"]"`) and `{ text: "a<LF>b" }` yields two fields (the second
named `b`, valued `" }"`).

**The rendering is correct and says the opposite.** 0060's transform escapes a
break inside a string literal precisely so the rendered `<literal>` keeps its
denotation (`binder-system-prompt.ts:193–200`,
`binder-bypass-and-envelope.md:142`). Measured: R3b renders
`  p (Triage) default="a\nb"`, byte-identical to what the CTL row — the
author's correct spelling — renders. The prompt the model reads carries no
signal distinguishing the two, and only one of them binds the value it shows.

**The registry row's *Phase* is exact for today's single emitter.**
`theta/parse/literal-newline-in-string` reads `lex`
(`code-registry-parse.md:13`) and `src/lexer/lexer.ts:520–527` is its only
emitter. The `params:` seam's own rows sit on two other values —
`theta/parse/default-not-literal` reads `parse`
(`code-registry-parse.md:48`) and `theta/load/params-type-not-expression` reads
`load` (`code-registry-load.md:19`) — so bringing this position into the code's
emission set moves the cell.

## Why it matters

- **The value the default binds differs from the value the source and the prompt
  both denote, with no diagnostic at any phase.** For R3b / R3c / SQ the source
  is a two-line string, the rendered `<literal>` is `"a\nb"` (which
  `binder-bypass-and-envelope.md:142` states denotes the source's value), and
  the bound default is the one-character string `a`. Nothing reports the
  difference: the load emits zero diagnostics, the theta registers, and
  `parseExpressionSource` discards the one diagnostic that fires.
- **A nested break fabricates structure the author never wrote.**
  `["a<LF>b"]` recovers as three elements, one of which is an unbound identifier
  and one the literal `"]"`; `{ text: "a<LF>b" }` recovers as two fields, the
  extra one named `b` with the value `" }"`, against a schema lowered with
  `"additionalProperties": false`. The recovered default is not a truncation of
  the declared one but a different value of a different shape.
- **The correct spelling and three incorrect ones are indistinguishable in the
  prompt.** The CTL row (`= "a\nb"`, the escape `lexical.md:26` directs authors
  to) renders byte-identically to R3b / R3c / SQ. An author reading the binder's
  `Parameters:` block, or a reviewer reading it, sees no difference between the
  spelling that works and the spellings that do not.
- **The two YAML spellings reach it from opposite directions.** A physical break
  inside a block scalar is what wrapping a long default for readability
  produces; a `\n` inside a double-quoted YAML scalar is what an author writes
  intending the theta escape and getting the YAML one. Both land on the same
  recorded bytes.
- **Body code refuses it, so the position is the only way in.** X1 and X1' show
  both quote characters refused in a body `let`. The asymmetry means an author
  who moves a working string default into `params:` — or out of it — changes
  whether the same bytes are legal.
- **The registry carries the rule and the position does not enforce it.**
  `theta/parse/literal-newline-in-string` exists, is `E`, and has a *Hint* that
  names the remedy (`code-registry-parse.md:13`). The gap is between an
  enforcing emitter and a position the grammar routes through the same
  production.
- **Nothing in the corpus scores it.** 34 committed files, 19 `params:` fields,
  one default (`count: number = 3`), zero in the refused set. The behaviour is
  reachable only by an author writing a string default for the first time, and
  0060's witness group (h) is the only place in the tree that records it — as a
  control that asserts no refusal.

## Non-goals

- **The multi-line `ArrayLit` at this position.** `[1,<LF>2]` is a legal
  `ArrayLit` (`grammar.md:28`) whose break is inter-token whitespace, admitted
  in body code by the continuation triggers (`lexical.md:22`), and its three
  readers agree (measured: recorded `[1,<LF>2]`, rendered `[1, 2]`, re-parsed as
  the two-element integer array). It stays admitted. This is the input 0041's
  round-1 adjudication protected in its own shape, and the reason a text-level
  break refusal is the wrong instrument.
- **The type side of the `params:` field.** A break inside a block-scalar *type*
  (`p: |` + `Triage` + `| null`) is a `Type`-production question, and a break
  inside a string literal in *type* position is what `LiteralType`
  (`docs/spec_topics/grammar.md:102`, `STRING | NUMBER | BOOLEAN | NULL`) admits
  and 0060's *Type display* string arm renders. Neither is touched here;
  the lowering of type text is 0056's and 0059's subject.
- **`parseExpressionSource` discarding `lex.diagnostics`.** The function returns
  `Expr | null` and drops the lexer's diagnostics for every caller
  (`src/parser/theta-document.ts:1142–1153`). Refusing this input at load makes
  the drop unreachable for this input class; whether the function should surface
  diagnostics at all is a separate question this report does not open.
- **`theta/parse/unterminated-string` at the same position.** The is-literal
  check's scan runs an unclosed span to end of text (`literal-sublanguage.ts:146–148`)
  and returns no diagnostic (measured: `"\"a"` → `[]`), so the sibling
  disposition of the same lexer branch (`src/lexer/lexer.ts:528–535`) is also
  unreachable here. Measured and recorded; not in this fix's refused set, and
  unfiled.
- **Whether a recovered default's value should be type-checked against the
  declared type.** `frontmatter-fields-a.md:60` requires the default literal's
  static type to be compatible with the param's declared type; this report
  measures no such check and claims nothing about one.
- **The `— <description>` slot and items 2 / 3 of the binder prompt.** 0060's
  residuals (ii) and (iii). Unchanged here.

## Fix

**Refuse a raw line terminator inside a string literal on a `params:` default
RHS, at error severity, under the existing code
`theta/parse/literal-newline-in-string`.** The refusal is emitted from the
`parseParams` per-field default loop, so `parseThetaDocument` alone is the
witness and the theta does not register
(`src/extension/production-composition.ts:1904–1911`); the field's `range` is
the diagnostic's range, as the sibling `default-not-literal` call already uses
(`src/parser/params.ts:262`). One diagnostic per offending field.

Constraints on the implementation:

1. **The refused set is the string-literal case, enumerated.** Refused:
   R3b, R3c, SQ, ARR, OBJ from §Reproduction — both quote characters, both YAML
   spellings of the break, at top level and nested inside an `ArrayLit` or an
   object literal. Admitted, unchanged: R3a (`[1,<LF>2]`), CTL
   (`= "a\nb"`, the two-character escape), every break-carrying *type* spelling
   0060 left admitted (R1, R1c, R1d, R1e, R2, R2b, F1, R3e), and R1b, the folded
   `p: >` scalar whose break YAML folds to a space before any theta code sees it
   (`tests/binder-param-line-newline-normalisation.test.ts:902`, group (f) — "the
   folded recording carries no break"). The
   predicate is "a line terminator inside a string span", not "a line terminator
   in the text": 0041's round-1 adjudication removed a text-level refusal for
   refusing a grammar-admitted multi-line flow mapping
   (`0041-params-block-mapping-rhs-silent-permissive.md:427–439`), and the span
   predicate is what keeps this clear of that failure.
2. **`tokeniseExpr` is not the seam.** The scanner is shared with
   `isBareObjectLiteral` (`src/parser/literal-sublanguage.ts:89–94`), whose only
   `src/` caller is the `theta/parse/tool-arg-not-object-literal` guard
   (`src/runtime/tool-call.ts:223–238`). Measured:
   `isBareObjectLiteral('{ path: "a",<LF>mode: "b" }')` is `true` today, so a
   newline test at the tokeniser's whitespace arm (`:132–135`) would refuse a
   legal multi-line Pi-tool argument, and one at its string-token scan
   (`:136–150`) would flip `isBareObjectLiteral('{ path: "a<LF>b" }')` — a
   second consumer's answer changed to close a defect at a different position.
   The refusal is a scan over `field.defaultSource` at the `parseParams` call
   site, and `tokeniseExpr` stays byte-stable for every input. `isBareObjectLiteral`'s
   four measured answers are the fence.
3. **The registry row is reconciled in the same commit — *Trigger* and *Phase*.**
   `theta/parse/literal-newline-in-string`
   (`docs/spec_topics/diagnostics/code-registry-parse.md:13`) reads *Trigger*
   "Literal newline inside a regular (single-line) string literal." and *Phase*
   `lex`. The *Trigger* widens to name the `params:` default RHS as a second
   emission site. The *Phase* cell moves: `docs/spec_topics/diagnostics/diagnostic-shape.md:80`
   defines *Phase* as the emitting stage and `:56` scopes the `theta/parse/*`
   values to `lex` / `parse` / `type`; the code raised from this same
   `parseParams` call reads `parse` (`code-registry-parse.md:48`), so the cell
   becomes both values. `theta/load/invoke-path-escape` already carries a
   multi-valued cell (`code-registry-load.md:32`, `load, runtime`) and
   `tools/code-registry/index.js:48` reads the cell verbatim with no closed-set
   validation, so the spelling is available. The mirror
   (`docs/reference/diagnostics.md:59`) carries no *Trigger* column, so only its
   *Phase* cell moves; edited in the same commit. The *Message* is unchanged —
   DIAG-4 defers a reword to theta 2.0 (`diagnostic-shape.md:74`). The *Hint*
   ("Use a `@`...`` query template, or split with `+ \"\\n\" +`.") names two
   remedies that are both unavailable at this position: a query template and the
   `+` operator are each outside the literal sublanguage
   (`docs/spec_topics/grammar.md:13–35`; measured for `+` at the X3 control). The
   *Hint* column is not one of the three DIAG-2 columns
   (`diagnostic-shape.md:72` names namespace, severity, trigger) and
   `diagnostic-shape.md:80` makes it normative where the spec mandates one, so
   whether the cell gains a position-scoped second remedy or the widened
   *Trigger* carries it is the one presentation choice this fix leaves to the
   run. The remedy itself is fixed either way: the `\n` escape (the CTL
   spelling).
4. **GOV-15: a DIAG-2 trigger change, in scope as an addition.** Every refused
   row loads cleanly today (measured: parse diagnostics `[]`, the theta
   registers), so all are inside GOV-15's loads-cleanly input set
   (`docs/spec_topics/governance/source-language-stability.md:9`) and the change
   is covered by the diagnostic-registry carve-out (`:25`), which dispositions a
   "DIAG-2 *trigger* change … in-scope as an addition for inputs newly brought
   into the code's emission set". No code is added or removed, so
   `tests/code-registry.test.ts:58–126`'s closed-set reconciliation gains no new
   asserting-test obligation and the existing witness
   (`tests/lexer-parser-diagnostics-production.test.ts:82–87`) stays valid.
   Census re-run at the fix baseline: **zero** committed files in the refused
   set — 34 files, 17 declaring `params:`, 19 fields, one default
   (`tests/live/acceptance/fixtures/acc-params-binder.theta:6`).
5. **The spec prose is re-derived where the position is specified.**
   `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` enumerates what a
   default RHS may not contain and names only
   `theta/parse/default-not-literal`; it gains the string-literal break and the
   second code, and states the remedy — the `\n` escape, or moving the value into
   body code, since neither of `lexical.md:26`'s two remedies (a query template,
   `+` concatenation) is admitted at a default RHS.
   `docs/spec_topics/lexical.md:26` needs no edit — it is the rule this
   fix enforces — and `docs/spec_topics/grammar.md:9`, `:20` need none either,
   since `STRING` already carries the constraint through `:5`. Whether either
   page gains a cross-reference is the one presentation choice; any sentence
   added to `docs/spec_topics/grammar.md` §Theta literal sublanguage is mirrored
   into `docs/reference/grammar.md:504–521` in the same commit, and any sentence
   added at the frontmatter §Defaults is mirrored wherever `docs/reference/`
   states that rule.
6. **0060's shipped rendering is untouched.** The two-arm transform
   (`src/binder/binder-system-prompt.ts:212`) and both spec paragraphs
   (`binder-bypass-and-envelope.md:129`, `:142`) stay as shipped: the
   string-literal escape arm remains reachable through a `LiteralType` in *type*
   position (`docs/spec_topics/grammar.md:102`, mirrored
   `docs/reference/grammar.md:191` — a production this fix does not touch), so
   the arm does not become dead and the four normative reference
   renderings need no edit. What changes is that the arm is no longer reachable
   from a `params:` *default*, which is the source of the denotation
   disagreement §Why it matters records.
7. **Test witness — offline, provider-free — and 0060's witness is re-derived,
   not weakened.** Three groups of
   `tests/binder-param-line-newline-normalisation.test.ts` pin today's
   admission and invert:
   - group (h) (`:999–1046`) — `:1028–1045` asserts `diagCodes` `[]` and a
     non-null frontmatter for R3b / R3c. That cell becomes the refusal
     assertion; `:1007–1017` (X1) and `:1019–1026` (X2) stay as they are, and
     the group's header comment (`:999–1004`), which records the asymmetry as
     0060's rejected route C, is re-derived to record it as closed.
   - group (a) (`:586–630`) — R3b / R3c at `:596–597` run through
     `loadCleanly`, which asserts zero diagnostics (`:334–339`). A refused
     fixture has no `params.fields` to render, so both rows leave the
     physical-line matrix; the remaining nine rows keep it, and the two rows'
     item-4 guarantee is restated as unreachable-by-refusal.
   - group (d) (`:741–818`) — R3b / R3c at `:745–746` and `:788–790` are the
     string arm of the value-preservation assertion, the one that discriminates
     escape from collapse. Re-source that arm from a `LiteralType` in type
     position or from a direct `SystemPromptParamField`, so constraint 6's arm
     keeps a red-able witness.
   - group (b) (`:639–670`) — F2 (`ROW.F2`, `:287`) and R3d (`ROW.R3d`, `:288`)
     carry their forged lines inside a string literal with a raw break and are
     in the refused set; F1 (`:286`) and R3e (`:289`) carry no quote and stay
     admitted. The forgery assertion keeps its subject through F1 / R3e, and
     F2 / R3d move to the refusal witness.
   - group (e) (`:827–869`), the over-refusal fence, stays green unchanged and
     is the guard against constraint 1 drifting into a text-level refusal.

   New assertions required: each refused spelling in constraint 1 with its
   diagnostic ranged on the field, and the theta un-registered; every admitted
   spelling in constraint 1 still silent; `isBareObjectLiteral`'s four measured
   answers unchanged (constraint 2); the CTL row still loading and still
   re-parsing to `"a\nb"`; and the three-reader disagreement pinned as
   unreachable — the ARR and OBJ recovery shapes recorded as the reason the
   input is refused, so a later narrowing of the refusal reds.
8. **No invariant is asserted at the readers.** `renderBinderParamLine`,
   `#recoverDeclaredDefaults`, `splitParamDefaultSource` and
   `parseExpressionSource` keep their current behaviour and their current
   tolerance: the refusal is the observable, the recorded `defaultSource` bytes
   are unchanged, and `#recoverDeclaredDefaults` re-reads the file from disk at
   invocation, so it can still be handed a break-carrying default by a file
   edited after load. An assert at any of those readers would crash on input the
   loader already refused. `src/binder/binder-system-prompt.ts:205`'s hard
   citation to `src/parser/literal-sublanguage.ts:136–150` (0060's residual (v))
   is re-derived if the fix moves those lines.

## Fix (0.75.0)

- **What shipped:**
  - `src/parser/literal-sublanguage.ts` — new exported
    `hasRawNewlineInStringLiteral(source)`: a **read-only** call to the existing
    `tokeniseExpr`, true iff any `str` token's raw text carries a `\n`. §Fix
    constraint 2 — `tokeniseExpr` itself is byte-unchanged (`cmp` over lines
    121–235 against the baseline), the module diff is a pure end-of-file append,
    and `src/binder/binder-system-prompt.ts`'s hard citation to
    `literal-sublanguage.ts:136–150` (0060's residual (v)) did not drift and
    needed no re-derivation.
  - `src/parser/params.ts` — the `parseParams` per-field default loop emits
    `theta/parse/literal-newline-in-string` at `error` severity, ranged on
    `field.range`, one diagnostic per offending **field**, immediately before the
    existing `checkLiteralSublanguage` call. No short-circuit: both checks run
    every iteration, so the refusal co-emits with the loop's other per-field
    diagnostics and shares their range.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the
    `theta/parse/literal-newline-in-string` row: *Phase* `lex` → `lex, parse`;
    *Trigger* widened to name the `params:` default RHS as a second emission
    site; *Hint* gained the position-scoped remedy. *Sev*, *Spec rule* and
    *Message* unchanged (DIAG-4).
  - `docs/reference/diagnostics.md` — the mirror row, ***Phase* cell only**
    (that table carries no *Trigger* and no *Hint* column).
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §Defaults — the
    refused-set enumeration gains the string literal's raw line break, the second
    code, and the remedy; mirrored into `docs/reference/frontmatter.md` §Defaults
    in the same commit. `docs/spec_topics/lexical.md`,
    `docs/spec_topics/grammar.md` and `docs/reference/grammar.md` are unedited —
    the first is the rule this fix enforces, and `STRING` already carries the
    constraint into the other two through `grammar.md:5`.
  - Tests — new `tests/params-default-string-literal-raw-newline.test.ts` (48);
    the four pre-authorized groups of
    `tests/binder-param-line-newline-normalisation.test.ts` re-derived (48 → 44);
    an additive H8a cell in `tests/live/live-production-acceptance.test.ts`
    (+201 lines, 0 deletions).

- **Gates** (each re-run by the orchestrator, not taken on report):
  - Witness run: `npx vitest run tests/params-default-string-literal-raw-newline.test.ts tests/binder-param-line-newline-normalisation.test.ts`
    → `Test Files  2 passed (2)` / `Tests  92 passed (92)`. Pre-fix the same two
    files were `Tests  21 failed | 66 passed (87)`, every failure naming the
    missing `theta/parse/literal-newline-in-string`.
  - Full default suite: `npm test` → `Test Files  267 passed (267)` /
    `Tests  3949 passed (3949)` (baseline 266 / 3905).
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` → exit 0, no output.
  - Lint: `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`)
    → exit 0, no output.

- **Review:** 2 rounds.
  - Round 1 (deep) — **2 defects.** (i) *correctness*: the first implementation's
    hand-written span walk had an escape branch that consumed any character after
    a backslash, so a raw break immediately after one (`"a\<LF>b"`) was skipped
    untested and still loaded clean and registered — this report's own S1
    symptom, unfixed. (ii) *spec*: the same walk had no template / query /
    `${...}` arm, so a quote inside an `@`...`` query template opened a span and
    drew a spurious `literal-newline-in-string` on source containing no string
    literal, putting the code's emission set past its DIAG-2 *Trigger* — the
    over-refusal class 0041 adjudicated against. One seam closed both: the
    predicate was re-sourced onto `tokeniseExpr`'s own `str` tokens, which
    already resolve span extent (so a post-backslash break is inside the token's
    raw text) and already emit templates and queries as single opaque tokens (so
    a quote inside one opens no span). Five cells added; red-ability proven by
    reinstalling the pre-repair body.
  - Round 2 (fast) — **CLEAN**, one non-blocking *prose* residual: the doc
    comment carried an inapplicable "union/generic split" clause copied from
    `normaliseParamLineBreaks`, naming a `Type`-grammar shape unreachable from
    this function's single caller. Polished comment-only; the polish diff touches
    no executable line and the gate re-run is green, so per the post-polish rule
    the confirmation round was skipped.

- **Verification:** VERIFIED.
  - *Red-able.* Two neutralisations, each a targeted byte edit restored
    byte-exact and `git hash-object`-verified back to
    `5f42b270d73f7d22a264dda9ce2244626949498b`. (a) `return false` → 22 cells
    red, every message naming the missing
    `theta/parse/literal-newline-in-string`, 70 green. (b) the pre-repair
    hand-walk reconstructed → exactly 5 red (BSLF missed; QRY / TPL / INTP
    over-fired), 43 green — the two round-1 defect classes stay locked.
    `git stash` was never used.
  - *Full suite.* Independently re-run: 267 files / 3949 tests passed.
  - *Live.* Both mandated commands run for real. H8a
    `tests/live/live-production-acceptance.test.ts` → `Tests  18 passed (18)`,
    including the new cell. H9a `tests/live/acceptance/` → `Tests  11 passed (11)`
    on a clean full re-run. The new H8a cell is registration-only and
    zero-token: a control theta and a break-free defaulted sibling must
    register, and the R3c spelling must not, read off the settled in-memory
    `SessionManager` — no drive is issued, so nothing turns on `prompt()`
    resolving. Both directions proven: neutralised →
    `Registered: ["b102livebroken","b102livectl","b102livegood"]`; restored →
    green.
  - *Lint and typecheck.* Both clean, run as `package.json` defines them.

- **Residuals:**
  1. **Three citations into `src/parser/params.ts` were shifted by this diff and
     are left stale**, because each lives in a file outside this fix's scope
     fence. The `parseParams` default loop grew by 18 lines, moving everything
     from old line 266 onward. (a) `src/parser/body-type-lowering.ts` —
     `lowerParamsFieldType`'s brace check cited as `params.ts:766`, now `:784`.
     (b) `tests/annotation-root-brace-union-lowering.test.ts` `CONTROL (a6)` —
     the same site cited as `params.ts:766`, now `:784`; this file is bug
     **0053**'s witness. (c)
     `tests/discriminator-field-classifier-brace-group.test.ts:70` —
     `splitTopLevel` cited as `params.ts:932`, now `:950`; this file is bug
     **0096**'s protected offline-lock witness. The implementer had corrected (a)
     and (b); the orchestrator reverted both, because (c) cannot be corrected
     under the fence and a partial sweep is worse than a documented one. All
     three are *shift-induced*, not pre-existing drift, so they fall outside the
     do-not-file class. **For the parent to file.**
  2. **§Fix constraint 7's line range for group (e) overshot.** It says group (e)
     (`:827–869`) "stays green unchanged", but group (e)'s second test,
     `GREEN (e, recording)`, reads
     `fieldOf(loadCleanly("R3c recording", ROW.R3c), "p").defaultSource` — and
     R3c is in the refused set, so that assertion could not survive. The group
     header itself scopes the over-refusal fence to "Six grammar-admitted
     spellings", i.e. the six-row `ADMITTED` matrix, which **is** byte-unchanged.
     Only the R3c half of the separate recording assertion moved, onto R3a, whose
     recorded `defaultSource` also spans a physical line (measured `[1,\n2]` —
     the block scalar strips the common indent, unlike R2's flow-mapping slice).
     The assertion keeps its subject exactly: it is 0060's route-B
     recording-seam fence, not an over-refusal assertion. **Orchestrator
     correction, flagged for ratification.**
  3. **A lone `\r` inside a string span is not refused.** The predicate tests
     `\n` only, mirroring the lexer's own scan (`text[i] !== "\n"`), and
     `decodeSource` folds `\r\n` and `\r` to `\n` before `splitFrontmatter`
     runs, so the case is unreachable at this position. Deliberate symmetry with
     body code; measured, not a defect.
  4. **`tests/fixtures/h7a/permitted-codes.json` is unchanged**, git blob hash
     `a4a8da04209f90e13d815edd92c1fc682e2a2236` before and after. Decided by the
     real H9a run, not by assumption: `grep -n "literal-newline-in-string"` over
     the captured stdout+stderr of all four live transcripts returned no match,
     the suite's own `assertCodesSubsetOfPermitted` and empty-capture
     `assertStderrClean` gates stayed green, and the static sweep found no
     committed file in the refused set. The code is not reachable from H9a.
  5. **One H9a area red once, then passed on isolation and on a clean full
     re-run.** `H9a-T (b)` (typed query with a named schema) failed its sentinel
     match at 22.5 s — not the ~180 s stochastic stall. Its fixture
     `acc-typed-named.theta` declares no `params:` block at all, so `parseParams`
     never runs for it; the signature matches neither bug 0064 (binder
     temperature 400) nor bug 0065 (overflow status gate). Area (d)
     (`params-binder`, the haiku-pinned binder fixture 0064 concerns) passed in
     both directory runs. Attributed to model stochasticity, recorded rather than
     dismissed.
  6. **`checkLiteralSublanguage`'s six direct answers are measured but not
     pinned.** Pinning `checkLiteralSublanguage('"a<LF>b"') → []` would red a
     legitimate future placement of the span scan inside that function.
     `isBareObjectLiteral`'s four answers are pinned instead — the fence §Fix
     constraint 2 actually names.

- **Discharge notes appended:**
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md),
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md),
  [0031](./0031-ctor-field-value-typing-unchecked.md),
  [0084](./0084-increment-decrement-check-dead.md).

- **Pinned dispositions / non-goals** (all re-confirmed at this baseline, none
  reopened): `parseExpressionSource`'s discard of `lex.diagnostics`;
  `theta/parse/unterminated-string` at this position; the multi-line `ArrayLit`;
  the type side of the `params:` field (0056 / 0059); whether a recovered
  default's value is type-checked against its declared type; the
  `— <description>` slot and items 2 / 3 of the binder prompt (0060's residuals
  (ii) / (iii)). §Fix constraint 8 is honoured: no assert, throw or defensive
  branch was added at `renderBinderParamLine`, `#recoverDeclaredDefaults`,
  `splitParamDefaultSource` or `parseExpressionSource`, and 0060's shipped
  two-arm transform and both of its spec paragraphs are byte-unchanged — the
  string-literal escape arm stays reachable through a `LiteralType` in *type*
  position, which the new witness's `LIT` row pins.

### The *Hint* presentation choice

§Fix constraint 3 left one choice to the run: whether the *Hint* cell gains a
position-scoped second remedy or the widened *Trigger* carries it. **The *Hint*
cell gained it.** *Trigger* is defined by the column legend
(`diagnostic-shape.md:80`) as "the canonical condition", so a remedy is a
category error there, while *Hint* is defined on the same line as "the normative
author-facing hint"; and *Hint* is not one of DIAG-2's three columns (`:72` names
namespace, severity, trigger), so widening it is not itself a spec-change
trigger. Leaving it unchanged would have shipped a normative hint naming two
remedies — a query template and `+` concatenation — that are **both** outside the
literal sublanguage and so unavailable at one of the code's two emission sites.
The two body-code remedies are retained; the position-scoped remedy is the `\n`
escape (the CTL spelling), or moving the value into body code.

### The refused and admitted sets, as re-measured at this baseline

Behavioural drift from §Reproduction: **zero** — every recorded value reproduced
byte-for-byte. Citation drift: tabulated by the test writer and re-derived to
symbols (`lexer.ts:434` → `:440`, `:520–527` → `:525–532`; `theta-document.ts:763`
/ `:779` / `:821` → `:771` / `:787` / `:829`; `production-composition.ts:1904–1911`
→ `:2045–2052`; `tool-call.ts:226` → `:227`; the `params.ts` and
`literal-sublanguage.ts` citations were exact).

- *Refused* — R3b, R3c, SQ, ARR, OBJ (both quote characters, both YAML spellings
  of the break, at top level and nested inside an `ArrayLit` or an object
  literal); F2 and R3d (whose forged lines sit inside a string literal with a raw
  break); BSLF (the break immediately after a backslash, found in review round
  1); and the cardinality rows TWO_FIELDS (2 offending fields → 2 diagnostics, in
  declaration order) and TWO_BREAKS (2 offending literals in one default → **1**
  diagnostic).
- *Admitted, silent* — R3a, CTL, LIT (a `LiteralType` string-with-break in
  **type** position, which is what keeps 0060's escape arm reachable), R1, R1b,
  R1c, R1d, R1e, R2, R2b, F1, R3e, and the QRY / TPL / INTP fences (a break
  inside an `@`...`` query template, a backtick template, or a bare `${...}`,
  each drawing `theta/parse/default-not-literal` **alone**).
- *`isBareObjectLiteral`, pinned* (§Fix constraint 2's fence) —
  `{ path: "a",<LF>mode: "b" }` → `true`; `{ path: "a" }` → `true`;
  `{ path: "a<LF>b" }` → `true`; `args` → `false`.

### GOV-15 discharge

Every refused row loaded cleanly at the baseline, so all sit inside GOV-15's
loads-cleanly set (`source-language-stability.md:9`) and the change is covered by
the diagnostic-registry carve-out (`:25`), which dispositions a DIAG-2 *trigger*
change "in-scope as an addition for inputs newly brought into the code's emission
set" — the disposition bugs 0031 and 0084 already took. No code was added or
removed, so `tests/code-registry.test.ts`'s closed-set reconciliation gains no new
asserting-test obligation and stays byte-unchanged, and the existing lexer-side
witness (`tests/lexer-parser-diagnostics-production.test.ts`) stays valid and
green. Corpus sweep re-verified twice independently, the second time
behaviourally against the fixed parser rather than by inspection:
`git ls-files -- '*.theta' '*.thetalib'` → **34** files, **17** declaring
`params:`, **19** fields, **1** default
(`tests/live/acceptance/fixtures/acc-params-binder.theta:6`, `count: number = 3`
— a bare integer, no string literal), **0** in the refused set.

## Provenance

- Origin: the bug 0060 fix (0.61.0, commit `125d3691`). Recorded twice as
  assessed-and-not-closed —
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
  §Fix *route C* (`:644–661`): "It closes strictly less than the transform …
  The one honestly refusable member is the default whose **string literal**
  carries a raw newline (R3b, R3c): `grammar.md:9` makes the default RHS a theta
  expression and `lexical.md:26` makes a literal newline inside a regular string
  `theta/parse/literal-newline-in-string`, which the registry already carries
  (`code-registry-parse.md:13`). Adding that refusal is worthwhile on its own
  terms — it closes an input that body code refuses and this position admits
  (X1 against R3b/R3c) — but it is orthogonal to the line-shape MUSTs, it leaves
  R3a (a legal multi-line `ArrayLit`) open, and it needs the registry row's
  *Phase* cell reconciled: the row reads `lex`, and the frontmatter default is
  read at load. Under GOV-15's carve-out (`source-language-stability.md:25`)
  that is a DIAG-2 trigger change, in scope as an addition for the inputs newly
  brought into the code's emission set. File it separately if it is wanted; it
  is not a substitute for the transform." — and its §Fix (0.61.0) *Residuals*
  item (i) (`:877–885`), which re-confirms the asymmetry at the fix baseline
  (`cf75460c`) and records it as "NOT closed here … Unfiled." This report is
  that filing. Beyond the residual it adds: the single-quoted spelling and the
  two nested spellings (`ArrayLit`, object literal) as members of the refused
  set; the three-reader disagreement measured end to end, including the
  invocation-time recovery's truncation to `"a"` and its fabricated element and
  field; the CTL control proving the correct spelling renders byte-identically;
  `parseExpressionSource`'s discard of the very diagnostic the code names; the
  shared-tokeniser constraint that selects the fix's seam
  (`isBareObjectLiteral` → `theta/parse/tool-arg-not-object-literal`); the
  *Phase*-cell precedent and the mixed *Phase* values the `params:` seam already
  carries; and the four assertion groups of 0060's witness that invert.
- Spec: `docs/spec_topics/lexical.md:26` (§String literals — single-line only,
  the escape table, the named code), `:22` (§Statement terminators and the
  closed continuation-trigger set); `docs/spec_topics/grammar.md:5` (lexical
  productions are lexical.md's), `:9` (the literal sublanguage is a strict
  subset of the expression grammar, admitted at the `params:` default RHS),
  `:13–35` (the `Literal` block; `:20` `PrimitiveLit ::= STRING`, `:28`
  `ArrayLit`, `:30–31` `BareObjectLit`, `:33` `NamedObjectLit`);
  `docs/spec_topics/grammar.md:95–102` (the `Type` production block, `:102`
  `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults and its
  refused set), `:71` (the subset statement);
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` (item 4), `:129`
  (*Type display* and the two-arm rule), `:142` (*Default-literal rendering* and
  the denotation sentence);
  `docs/spec_topics/diagnostics/code-registry-parse.md:13`
  (`literal-newline-in-string` — *Sev* `E`, *Phase* `lex`, *Trigger*, *Hint*,
  *Message*), `:14` (`unterminated-string`), `:48` (`default-not-literal` —
  *Phase* `parse`); `docs/spec_topics/diagnostics/code-registry-load.md:19`
  (`params-type-not-expression` — *Phase* `load`), `:32`
  (`invoke-path-escape` — the one multi-valued *Phase* cell);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:56` (the `theta/parse/*`
  *Phase* values), `:72` (DIAG-2 and its GOV-15 routing), `:74` (DIAG-4), `:80`
  (the column legend and the closed *Phase* taxonomy);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out and
  its trigger-change disposition). User-facing:
  `docs/reference/grammar.md:115–122` (the string-literal rule, `:119–120` the
  single-line sentence), `:185–191` (the mirrored `Type` block, `:191`
  `LiteralType`), `:504–521` (§Theta literal sublanguage);
  `docs/reference/diagnostics.md:59` (the mirrored row), `:94`
  (`default-not-literal`), `:182` (`params-type-not-expression`).
- Implementation evidence at `99b65438`:
  `src/parser/literal-sublanguage.ts:39` (`LiteralPosition = "default"`),
  `:53–78` (`checkLiteralSublanguage`; `:58` the tokenise, `:64` the walk,
  `:65–67` the silent return), `:89–94` (`isBareObjectLiteral`), `:121–235`
  (`tokeniseExpr`; `:132–135` the whitespace arm, `:136–150` the quoted-string
  scan, `:140` the loop condition, `:141–143` the escape skip, `:146–148` the
  end-of-text close, `:149` the token push), `:385–434` (`parsePrimary`;
  `:391–393` `str`/`num` → literal), `:436–451` (`parseArray`), `:453–479`
  (`parseObjectBody`), `:489–520` (`firstNonLiteral`; `:491–492` the literal
  arm, `:499–514` the container recursion);
  `src/parser/params.ts:132–136` (`parseParams`), `:253–265` (the per-field
  default loop, the call at `:260`, the range at `:262`), `:270–273` (the
  lowering gate);
  `src/parser/frontmatter.ts:614–653` (`splitParamValue`; `:622` the signature,
  `:635–637` the quote arm), `:687–762` (`extractParsedParams`; `:711–713` the
  raw value, `:714` the split, `:724–732` the shape check, `:733–738` the
  `ParamFieldInput`, `:739–747` the `BypassParamsField`, `:752` the
  `parseParams` call);
  `src/lexer/lexer.ts:428–545` (the string scan; `:434` the newline-terminated
  loop, `:520–527` `literal-newline-in-string`, `:528–535`
  `unterminated-string`, `:538–544` the token push);
  `src/parser/theta-document.ts:763` (`splitFrontmatter`), `:779` (the body-only
  lex), `:821` (the frontmatter parse), `:1142–1153` (`parseExpressionSource`
  and its discarded `lex.diagnostics`);
  `src/extension/production-theta-producer.ts:1163` (the recovery call),
  `:1185–1186` (its doc comment), `:1188–1231` (`#recoverDeclaredDefaults`;
  `:1216` the raw read, `:1220` the split, `:1224` the parse, `:1228` the
  evaluate-and-push), `:5514–5544` (`splitParamDefaultSource`; `:5527–5529` the
  quote arm), `:5713–5719` (`evaluatePureExpression`; `:5717–5719` the string
  case);
  `src/binder/binder-system-prompt.ts:168–182` (`renderBinderParamLine`; `:169`,
  `:173` the two transformed tokens), `:184–211` (the transform's doc comment;
  `:193–200` the two-arm rule, `:201–210` the lexical authority and `:205` the
  hard citation), `:212` (`normaliseParamLineBreaks`);
  `src/runtime/tool-call.ts:223–238` (the bare-object-shape guard; `:226` the
  `isBareObjectLiteral` call, `:231` the code);
  `src/extension/production-composition.ts:1904–1911` (`hasLoadParseError`).
- Test and corpus evidence at `99b65438`:
  `tests/binder-param-line-newline-normalisation.test.ts` (0060's witness, 48
  tests) — `:272–296` the `ROW` fixture table (`:284` R3b, `:285` R3c, `:283`
  R3a, `:286–289` F1 / F2 / R3d / R3e, `:295` X3), `:334–369` `loadCleanly` and
  its zero-diagnostic assertion, `:586–630` group (a) (`:596–597` R3b / R3c),
  `:639–670` group (b), `:741–818` group (d) (`:745–746`, `:788–790`),
  `:827–869` group (e), `:981–997` group (g), `:999–1046` group (h)
  (`:1007–1017` X1, `:1019–1026` X2, `:1028–1045` R3b / R3c);
  `tests/code-registry.test.ts:26–33`, `:58–126` (the DIAG-2 closed-set
  reconciliation over the four sharded pages);
  `tests/lexer-parser-diagnostics-production.test.ts:82–87` (the production
  witness for `literal-newline-in-string`);
  `tools/code-registry/index.js:48` (the *Phase* cell read verbatim);
  `tests/helpers/e2e-s1.ts:33–41` (`parseDeps` / `parseDoc`, the harness these
  probes reuse); the corpus census —
  `rg --files --glob '*.theta' --glob '*.thetalib' .` (34 committed files;
  `.gitignore:26` ignores `.pi/`, which holds a 35th), 17 declaring `params:`,
  19 fields, zero block-scalar or line-spanning field values, one default at
  `tests/live/acceptance/fixtures/acc-params-binder.theta:6`.
- Reproduction: scratch vitest at `99b65438` — the three body-code rows, the
  three top-level default rows with their recorded field, lowered fragment,
  rendered per-field line and re-parsed node, the two nested rows, the CTL and
  X3 controls, six direct `checkLiteralSublanguage` calls, and four direct
  `isBareObjectLiteral` calls; plus a corpus census over the committed
  `.theta` / `.thetalib` files. Run on the outputs quoted above, then deleted
  per scratch policy. No file in the tree was written by the probes; `src/`,
  `tests/` and every other bug doc are unmodified by this filing.

## Coordination note (0.77.0)

Bug 0050 (fixed 0.77.0) reused the GOV-15 diagnostic-registry carve-out
disposition a fourth time (after 0031, 0084 and this report): engaged as an
ADDITION, discharged by measurement of the shipped corpus — the three example
call sites all defer, and no committed fixture draws the newly wired code.
