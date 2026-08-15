# Bug 0165 — An EMPTY default-side literal in a `params:` field is admitted at load and mints a `default=` requirement token with no literal: `p: 'string = '` records `hasDefault: true`, `defaultSource: ""` and `required: []`, lowers `{"type":"string"}`, and the shipped binder system prompt renders `  p (string) default=` — and because invocation-time recovery cannot parse an empty literal, the merge returns before the named post-default-merge AJV hook and the body binds `null` for a non-nullable declared param, on a theta that loaded with zero diagnostics

- **Status:** fixed (0.92.0). Residual 1 of the bug 0059 fix (0.86.0, commit `f31eac45`),
  recorded there as `## Fix (0.86.0)` *Residuals* item 1
  (`0059-…md:977–983`). §Fix is constraint-pinned, not settled: it names three
  candidate check sites with their measured blast radii, the registry and GOV-15
  constraints every route carries, and the 0059 guard every route must leave
  suppressing. Ordering: nothing blocks this report from starting.
  [0163](./0163-params-default-type-compat-unchecked-at-load.md) is open against
  the same `parseParams` per-field default loop; the two classes are disjoint on
  one measured observable (every row here carries a default that does not parse
  at all, every row of 0163's carries one that parses and evaluates), so
  whichever lands second rebases onto the other's hunks (§Fix *Ordering*).
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) is open
  against the schema-body field-type and alias-arm positions and reaches
  `parseParams`'s type-side loop, not its default loop; it shifts line numbers,
  which is why §Affected names symbols beside them.
- **Sev/Diff estimate:** S1/D3 — S1 because the declaration loads with zero
  diagnostics and then binds a value the author never wrote: recovery cannot
  parse the empty literal, so `#mergeDeclaredDefaults` returns before the compile
  and before the post-default-merge AJV hook that
  `defaulting-system-note-echo.md:11` installs, and a slash invocation that omits
  the field runs the body with `p = null` — measured `outcome success`,
  `value null` — for a field whose own lowered fragment refuses `null`, one
  binder model call in and with no diagnostic on any surface; D3 because no check
  site exists for the empty spelling, the fail-open arm sits inside the sole
  default-position checker whose Trigger does not claim the input, and every
  route has to keep 0059's type-half suppression intact against a committed cell
  that pins the count at one.
- **Kind:** defect — the implementation admits an input the specification's own
  production set does not derive, and the surfaces downstream of it then behave
  in ways their own contracts forbid. Three elements, each measured at HEAD
  `f31eac45`.
  1. *An unspellable default is recorded as a default.* `splitParamValue`
     (`src/parser/frontmatter.ts:636`) cuts at the first top-level `=` and trims
     both halves (`:661–664`), so any trailing `=` yields a **defined**
     `defaultSource` of `""`. `hasDefault` is keyed on definedness alone
     (`:796`), the field is omitted from `required` on the same test
     (`src/parser/params.ts:277–279`), and the block lowers (`:367`). The
     `Literal` production (`docs/spec_topics/grammar.md:14`) has no empty
     alternative.
  2. *The one default-position checker fails open on it.*
     `checkLiteralSublanguage` (`src/parser/literal-sublanguage.ts:53`) tokenises,
     parses, and returns `[]` when the parse yields no node (`:58–63`), before
     `firstNonLiteral` runs. Empty and whitespace-only sources reach that arm;
     every other probed source produces a node and is judged — `)`, `]`, `,`,
     `-`, `|`, `# c`, `1 +` and `totally junk` all draw
     `theta/parse/default-not-literal` (§Reproduction (i)).
  3. *Invocation cannot recover a value, so the named hook never runs.*
     `#recoverDeclaredDefaults` (`src/extension/production-theta-producer.ts:1204`)
     splits the same `=` through `splitParamDefaultSource` (`:5581`), gets `""`,
     and `parseExpressionSource("")` is `null` (`src/parser/theta-document.ts:1157`),
     so the field is skipped (`:1240–1243`) and `defaults` is `[]`.
     `#mergeDeclaredDefaults` (`:1171`) returns at `:1180–1182`, ahead of the
     compile (`:1189`) and `fillDefaultsAndRevalidate` (`:1190`). Body scope
     receives no entry for the field and reads `null`.
- **Related:**
  - **0059** —
    [`0059-params-scalar-nontype-text-recorded-and-permissive.md`](./0059-params-scalar-nontype-text-recorded-and-permissive.md),
    **fixed (0.86.0)**, the filing origin and the boundary. 0059 owns junk TEXT
    on either half of a `params:` scalar. Its fix refuses the junk **type** half
    (`p: 'lol wut = '` → `theta/load/params-type-not-expression`, measured) and
    installs the guard that suppresses a field's default-side literal checks
    **only** when that field's type half was refused
    (`src/parser/params.ts:339`; the registry's third precedence rule,
    `code-registry-load.md:19`). Junk text on the default half was already
    refused before that fix (`p: 'string = totally junk'` →
    `theta/parse/default-not-literal`, measured). The empty default-side literal
    is the spelling neither rule reaches, and 0059's own fix record names it as
    the residual it left (`:977–983`).
  - **0163** —
    [`0163-params-default-type-compat-unchecked-at-load.md`](./0163-params-default-type-compat-unchecked-at-load.md),
    **open.** **Boundary.** 0163 owns a declared type the grammar admits and a
    default the literal sublanguage admits, whose values are incompatible
    (`p: '"x" | "y" = "zzz"'`). Every row there has a `defaultSource` that parses
    and evaluates, so a compatibility relation has two operands and the runtime
    fills a value. Every row here has a `defaultSource` that parses to nothing,
    so there is no second operand and the runtime fills nothing. The two are
    separated by one measured observable: `parseExpressionSource(defaultSource)`
    — a node for 0163's rows, `null` for these.
  - **0060** —
    [`0060-binder-parameters-line-shape-violable-by-embedded-newlines.md`](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md),
    **fixed (0.61.0)**, the `Parameters:` line-SHAPE family. It owns a recorded
    type or default whose bytes break or forge the per-field line, and its fix
    normalises both author-controlled tokens inside `renderBinderParamLine`
    (`src/binder/binder-system-prompt.ts:168`). The token here is
    single-line, unforged and correctly shaped — `  p (string) default=` — and
    empty where `binder-bypass-and-envelope.md:142` requires a literal. Nothing
    a render-seam transform can repair.
  - **0102** —
    [`0102-params-default-string-literal-raw-newline-admitted.md`](./0102-params-default-string-literal-raw-newline-admitted.md),
    **fixed (0.75.0)**, the sibling default-RHS rule and the first occupant of
    `parseParams`'s per-field default loop
    (`hasRawNewlineInStringLiteral`, `src/parser/params.ts:342`). It establishes
    that the loop is where a default-side rule lands, and that a default whose
    recorded source and bound value disagree is a defect at this position. Its
    subject is a raw line terminator inside a string-literal span; there is no
    span here.
  - **0041** —
    [`0041-params-block-mapping-rhs-silent-permissive.md`](./0041-params-block-mapping-rhs-silent-permissive.md),
    **fixed (0.51.0)**, the `params:` node-shape ancestor. Its fix installed
    `theta/load/params-type-not-expression` for a value node that is neither a
    scalar nor a flow mapping. Every fixture in this report is an admitted scalar
    and clears that gate before the question here arises.
  - **0061** —
    [`0061-nonparams-type-positions-keep-junk-arm-text-silent.md`](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md),
    **open**, the type-side sibling at the schema-body field-type and alias-arm
    positions. Disjoint surface: it does not read a `params:` default. A fix
    there reaches `parseParams`'s type-side loop and shifts this report's
    `params.ts` line numbers.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/parser/params.ts` is 1152 lines at this HEAD and two open reports insert
    into it, which is why every volatile position below is named by symbol.
- **Affected** (every citation verified against the tree at HEAD `f31eac45`,
  v0.86.0; symbols named beside lines):
  - **The split that mints the empty default.** `splitParamValue`
    (`src/parser/frontmatter.ts:636`), whose top-level-`=` arm trims both halves
    and returns `{ typeSource, defaultSource }` (`:661–664`) and whose fallthrough
    returns `{ typeSource }` alone (`:667`). Its one caller is
    `extractParsedParams` (`:728`); the parsed field record is built at `:786`
    and the binder-facing record at `:793`, with `hasDefault: defaultSource !==
    undefined` (`:796`).
  - **The position with no check.** `parseParams` (`src/parser/params.ts:145`):
    the `required` decision keyed on `defaultSource` alone (`:277–279`), the
    cross-field ordering rule (`:299`), the per-field default loop (`:326–357`)
    with the bug-0059 type-half suppression guard (`:339`), the raw-newline
    refusal (`:342`) and the `checkLiteralSublanguage` call (`:352`), the error
    gate (`:362–365`) and the lowered document (`:367–378`). The type source
    lowers through `lowerParamsFieldType` (`:969`).
  - **The fail-open arm.** `checkLiteralSublanguage`
    (`src/parser/literal-sublanguage.ts:53`): `tokeniseExpr` + `ExprParser.parse`
    (`:58–60`) and the `node === undefined` early return (`:61–63`).
    `LiteralPosition` is the single value `"default"` (`:39`), and the function
    has exactly one production caller (`src/parser/params.ts:352`) — the whole
    blast radius of that arm. Three committed test files call it directly:
    `tests/e2e-s1-grammar-literal-sublang.test.ts:27`, `:35`, `:44` and
    `tests/type-grammar.test.ts:132`, `:150` pass string literals, none empty or
    whitespace-only; `tests/binder-param-line-newline-normalisation.test.ts:850`
    and `:902` pass a rendered default literal (`defaultLiteralOf`, `:526`) and
    assert `[]`. `tests/params-default-string-literal-raw-newline.test.ts` names
    the function in prose only (`:74`, `:137`, `:139`) and does not call it.
  - **The binder surfaces.** `binderPromptParamField`
    (`src/extension/production-theta-producer.ts:619`), which mints
    `{ kind: "default", literal: field.defaultSource }` whenever `hasDefault` and
    `defaultSource !== undefined` (`:623–626`); the map into the prompt input
    (`:757`); `renderBinderParamLine`
    (`src/binder/binder-system-prompt.ts:168`), whose requirement token has two
    arms and no third (`:170–173`); `buildBinderSystemPrompt` (`:285`) and its
    no-invent-defaults line (`:345`, "Do not invent values for defaulted
    parameters that the user did not specify; omit them."). `classifyBinderBypass`
    (`src/binder/binder-envelope.ts:204`) returns `binder` for every fixture
    below — a defaulted field cannot take the single-string bypass — so the
    binder model call is unconditional.
  - **The invocation seam that returns early.** `#mergeDeclaredDefaults`
    (`src/extension/production-theta-producer.ts:1171`) and its two early
    returns (`:1176–1178`, `:1180–1182`), ahead of the compile (`:1189`) and
    `fillDefaultsAndRevalidate` (`:1190`); its one caller `runBinder` (`:856`).
    `#recoverDeclaredDefaults` (`:1204`), its `splitParamDefaultSource` call
    (`:1236`) and the `parseExpressionSource(...) === null` skip (`:1240–1243`).
    `splitParamDefaultSource` (`:5581`) returns `raw.slice(i + 1).trim()` at the
    first top-level `=` (`:5606–5608`), kept in step with the parser's own split.
    `parseExpressionSource` (`src/parser/theta-document.ts:1157`).
  - **Where the value would have been validated.**
    `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:67`) fills absent
    defaulted wire names (`:79`) and validates the merged object after (`:86`).
    It is the hook `defaulting-system-note-echo.md:11` names, and it is not
    reached for these declarations.
  - **Where the value lands instead.** `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:90`) projects each entry of the
    merged args onto body scope; a wire name absent from the args gets no slot.
    The invoke path's own marshalling (`production-theta-producer.ts:3218–3222`)
    substitutes `null` for an omitted positional argument at that position too.
  - **The three consumers of the lowered document.** All compile through the root
    `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`):
    `runBinder`'s envelope build → `buildBinderEnvelopeSchema`
    (`src/binder/binder-envelope.ts:86`) and `relaxParamsSchema` (`:137`);
    `#mergeDeclaredDefaults` (`production-theta-producer.ts:1189`); and
    `#intakeSubagentRootParams` (`:1970`) driving `intakeChildParams`
    (`src/runtime/subagent-params.ts:233`), whose refusal code is
    `SUBAGENT_PARAMS_VALIDATION_FAILED_CODE` (`:57`).
  - **Spec.**
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults — the
    `field: type = literal` grammar sentence, the literal-sublanguage reference,
    the admitted-forms list, the violation set, and the fill-before-AJV
    sentence), `:58` (§Type side — the type half's refusal set, which names "an
    empty or whitespace-only string" by name);
    `docs/spec_topics/grammar.md:9` (the sublanguage's one position and the
    is-literal check), `:14` (the closed `Literal` production set), `:20`
    (`PrimitiveLit`), `:37` (*Position rules*);
    `docs/spec_topics/diagnostics/code-registry-parse.md:48`
    (`theta/parse/default-not-literal` — *Trigger* and *Message*), `:49`
    (`theta/parse/non-trailing-default`);
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`theta/load/params-type-not-expression` — the two-stage *Trigger* naming
    "an empty or whitespace-only string" on the type half, and the third
    precedence rule that a text-refused field draws no default-RHS literal
    diagnostic);
    `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` (item 4, the
    `Parameters:` block), `:123` (the requirement token is "exactly one of the
    literal tokens `required` or `default=<literal>`"), `:129` (*Type display*),
    `:142` (*Default-literal rendering*);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:7` (defaults are
    filled by the runtime before AJV validation), `:9` (fill-if-absent, keyed on
    the wire name), `:11` (the named post-default-merge AJV validation hook);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  - **The committed cell a fix must not red.**
    `tests/params-scalar-nontype-text-refusal.test.ts` cell f1 (`:1026`,
    assertion `:1035`) pins `p: 'pick one = or two'` at exactly one diagnostic —
    the type-half refusal, with the default-side checks suppressed. Cells f2
    (`:1038`) and f3 (`:1054`) pin the other two arms of the same guard.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; 17 declare `params:`; exactly one committed default exists —
    `count: number = 3` in `tests/live/acceptance/fixtures/acc-params-binder.theta`
    — and it is well-formed. No committed fixture is in the affected class and no
    committed test declares an empty default. Of the five committed direct calls
    to `checkLiteralSublanguage`, three pass string literals (none empty or
    whitespace-only) and two pass a rendered default literal and assert `[]`.
- **Observed at:** v0.86.0 (`f31eac45`). Offline, deterministic, provider-free:
  two scratch vitest probes over the shipped load path `parseThetaDocument`
  through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the production
  `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`) constructed with the
  shipped `slugOf`, and the shipped `renderBinderParamLine`,
  `buildBinderSystemPrompt`, `classifyBinderBypass`, `buildBinderEnvelopeSchema`,
  `fillDefaultsAndRevalidate`, `checkLiteralSublanguage`, `parseExpressionSource`,
  `createProductionProducerDeps` → `bindPromptConversation` and `executeBody`
  seams; written, run, deleted. Every value below is those runs' output verbatim
  over a tree `git status --short --untracked-files=no` reported clean at
  `f31eac45`.

## Summary

`splitParamValue` treats any trailing top-level `=` as a declared default and
records the trimmed remainder verbatim, so `p: 'string = '` yields
`defaultSource: ""`. Nothing refuses it. `checkLiteralSublanguage` — the sole
checker at this position — returns no diagnostic when its parse yields no node,
which is what an empty or whitespace-only source produces. The field is then
dropped from `required` on the strength of having a default at all, and the block
lowers.

The declaration is unspellable in the sublanguage that governs the position.
`grammar.md:14` closes `Literal` over five alternatives and admits no empty one;
`frontmatter-fields-a.md:60` writes the form as `field: type = literal`. The
mirror-image spelling on the type half is refused by name — an empty or
whitespace-only type fragment is `theta/load/params-type-not-expression`
(`code-registry-load.md:19`), which bug 0059's fix landed at this HEAD — and
`p: ' = "ok"'` and `p: ' = '` are both refused, measured. The empty default half
is claimed by no registered row.

Three surfaces then behave against their own contracts. The binder system prompt
renders `  p (string) default=`, where `binder-bypass-and-envelope.md:123`
requires the requirement token to be `required` or `default=<literal>` and `:142`
requires that `<literal>` to be a literal-sublanguage form. The invocation-time
recovery re-splits the same `=`, gets `""`, cannot parse it, and returns no
default, so `#mergeDeclaredDefaults` returns before the compile and before the
post-default-merge AJV hook that `defaulting-system-note-echo.md:11` installs —
the one seam the spec puts between a filled default and the body. And body scope,
having no entry for the wire name, reads the field as `null`: measured
`outcome success`, `value null`, for a field whose own lowered fragment answers
`false` on `{"p":null}`. A defaulted field forces the `binder` classification, so
that happens after a binder model call has been spent.

## Reproduction

Offline, deterministic, at HEAD `f31eac45`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`; a real
`AjvSchemaValidator` (`src/seams/schema-validator.ts:104`); and the shipped
`renderBinderParamLine`, `buildBinderSystemPrompt`, `classifyBinderBypass`,
`buildBinderEnvelopeSchema`, `fillDefaultsAndRevalidate`,
`checkLiteralSublanguage`, `parseExpressionSource` and
`bindPromptConversation` / `executeBody` seams. Each fixture is a `mode: prompt`
theta whose `params:` block declares the one field `p`.

### (a) The four `=` spellings — one record, four ways to write it

`diags` is the whole diagnostic list for the file. `defaultedFields` is `["p"]`
in every row.

| `params:` right-hand side | `diags` | `hasDefault` | `defaultSource` | `required` | `properties.p` |
| --- | --- | --- | --- | --- | --- |
| `string = ` | `[]` | `true` | `""` | `[]` | `{"type":"string"}` |
| `string =` | `[]` | `true` | `""` | `[]` | `{"type":"string"}` |
| `string =   ` | `[]` | `true` | `""` | `[]` | `{"type":"string"}` |
| `string=` | `[]` | `true` | `""` | `[]` | `{"type":"string"}` |

`splitParamValue` (`src/parser/frontmatter.ts:636`) trims both halves at the
split (`:661–664`), so a whitespace-only remainder becomes `""` whatever the YAML
scalar delivered, and the four spellings are indistinguishable downstream. The
whole parsed record for row 1 is

```
[{"wireName":"p","type":"string","hasDefault":true,"defaultSource":"","nullable":false}]
```

### (b) Every YAML delivery reaches the same record

| `params:` entry | `diags` | `hasDefault` | `defaultSource` |
| --- | --- | --- | --- |
| `p: 'string = '` (single-quoted) | `[]` | `true` | `""` |
| `p: "string = "` (double-quoted) | `[]` | `true` | `""` |
| `p: string =` (unquoted) | `[]` | `true` | `""` |
| `p: \|` over `string =` (block literal) | `[]` | `true` | `""` |
| `p: >` over `string =` (block folded) | `[]` | `true` | `""` |
| `p: "string =\t"` (tab-only default) | `[]` | `true` | `""` |

### (c) Every declared type, same silence

| `params:` right-hand side | `diags` | `properties.p` |
| --- | --- | --- |
| `integer = ` | `[]` | `{"type":"integer"}` |
| `array<string> = ` | `[]` | `{"type":"array","items":{"type":"string"}}` |
| `"x" \| "y" = ` | `[]` | `{"type":"string","enum":["x","y"]}` |
| `boolean = ` | `[]` | `{"type":"boolean"}` |
| `string \| null = ` | `[]` | `{"type":["string","null"]}` (`nullable: true`) |
| `Sev = ` (+ `enum Sev { A, B }`) | `[]` | `{"$ref":"#/$defs/Sev"}` |

### (d) The rendered binder surfaces

`renderBinderParamLine` output, and the `Parameters:` block the shipped
`buildBinderSystemPrompt` emits for the same field:

```
string =            line   "  p (string) default="
                    block  "Parameters:\n  p (string) default="
integer =           line   "  p (integer) default="
array<string> =     line   "  p (array<string>) default="
"x" | "y" =         line   "  p (\"x\" | \"y\") default="
boolean =           line   "  p (boolean) default="
string | null =     line   "  p (string | null) default="
Sev =               line   "  p (Sev) default="
```

`classifyBinderBypass` returns `{"kind":"binder"}` for every row — a defaulted
field cannot take the single-string bypass — so each of these prompts is sent.

### (e) Real AJV over the lowered document, and the envelope

The production `AjvSchemaValidator` over each row's lowered document:

```
string =           {}          -> true    {"p":""} -> true    {"p":null} -> false  must be string
integer =          {}          -> true    {"p":""} -> false   {"p":null} -> false  must be integer
array<string> =    {}          -> true    {"p":""} -> false   {"p":null} -> false  must be array
"x" | "y" =        {}          -> true    {"p":""} -> false   {"p":null} -> false  must be equal to one of the allowed values
boolean =          {}          -> true    {"p":""} -> false   {"p":null} -> false  must be boolean
string | null =    {}          -> true    {"p":""} -> true     {"p":null} -> true
Sev =              {}          -> true    {"p":""} -> false   {"p":null} -> false  must be equal to one of the allowed values
```

`{}` answers `true` in every row because the defaulted field is out of
`required`. The envelope built by `buildBinderEnvelopeSchema` accepts
`{"kind":"ok","args":{}}` in every row, and accepts `{"kind":"ok","args":{"p":""}}`
only for the two rows whose type admits the empty string.

### (f) The invocation-time seam

Read from source (traced, not driven): `splitParamDefaultSource`
(`production-theta-producer.ts:5581`) returns `raw.slice(i + 1).trim()` at the
first top-level `=` (`:5606–5608`), so for `string = ` it returns `""` — defined,
not `undefined`, so the `undefined` skip at `:1237–1239` does not fire. The next
test, measured, does:

```
parseExpressionSource("")     -> null
parseExpressionSource(" ")    -> null
parseExpressionSource("\t")   -> null
parseExpressionSource("\"ok\"") -> a string node
```

so `#recoverDeclaredDefaults` `continue`s at `:1240–1243` and returns `[]`, and
`#mergeDeclaredDefaults` returns `binderArgs` unchanged at `:1180–1182`. Neither
the compile (`:1189`) nor `fillDefaultsAndRevalidate` (`:1190`) is reached.

Driving the hook directly, to record what it would have said had it been reached:

```
string   binderArgs {}  defaults []                  -> merged {}       filled []    ok true
string   binderArgs {}  defaults [{p, ""}]           -> merged {"p":""} filled ["p"] ok true
integer  binderArgs {}  defaults []                  -> merged {}       filled []    ok true
integer  binderArgs {}  defaults [{p, ""}]           -> merged {"p":""} filled ["p"] ok false  must be integer
```

The `defaults []` rows are the reachable state and they validate, because the
field is out of `required` — the hook has nothing to refuse. The
`defaults [{p, ""}]` rows are counterfactual, and they are recorded because they
close off "fill `""`" as a repair: it would validate for a `string` field and
fail for an `integer` one, trading the silent `null` for a silently-substituted
empty string on some declared types and a per-invocation validation failure on
others.

### (g) What the body binds

The theta body `let y = p` / `y`, driven through the production
`bindPromptConversation` and `executeBody` with the `paramBindings` map each
merge outcome produces. `bindings {}` is what `paramBindingsFrom`
(`src/extension/theta-composition-producer.ts:90`) returns for the args
`#mergeDeclaredDefaults` hands back when it returns early — an empty `Map`, not
`undefined`:

```
string =        bindings {}          -> outcome success  value null   diags []
string =        bindings {"p": ""}   -> outcome success  value ""     diags []
string = "ok"   bindings {"p":"ok"}  -> outcome success  value "ok"   diags []
integer =       bindings {}          -> outcome success  value null   diags []
```

Row 1 and row 4 are the reachable states for an invocation that omits the field:
`paramBindingsFrom` (`theta-composition-producer.ts:90`) has no entry to
project, and the body reads the declared param as `null`. Rows 2 and 3 are
recorded to show the same harness binds a filled default correctly, so the `null`
is the empty default's own product and not the harness's.

### (h) Boundary contrasts — the neighbouring spellings

```
p: 'string = totally junk'   diags ["theta/parse/default-not-literal"]        lowered withheld
p: 'lol wut = '              diags ["theta/load/params-type-not-expression"]  lowered withheld
p: ' = "ok"'                 diags ["theta/load/params-type-not-expression"]  lowered withheld
p: ' = '                     diags ["theta/load/params-type-not-expression"]  lowered withheld
p: 'string = ""'             diags []   defaultSource "\"\""   line "  p (string) default=\"\""
p: 'string'                  diags []   hasDefault false        line "  p (string) required"
p: 'string = '               diags []   defaultSource ""        line "  p (string) default="
```

Junk text on the default half is refused. Junk text on the type half is refused —
bug 0059's fix. An empty type half is refused, and the registry names that input
class explicitly (`code-registry-load.md:19`, "an empty or whitespace-only
string"). The explicit empty-string literal `""` is conformant and renders
`default=""`. The empty default half — one keystroke from the conformant row — is
the remaining cell.

### (i) Which default sources reach the fail-open arm

Two independent parsers read a default source and the columns below are both
measured. `check` is `checkLiteralSublanguage(source, "default", site)`, which
gates the load-time diagnostic. `parseExpressionSource` is the separate parser the
invocation-time recovery uses (§Reproduction (f)).

```
""                check []                                   parseExpressionSource -> null
" "               check []                                   parseExpressionSource -> null
"\t"              check []                                   parseExpressionSource -> null
"\n"              check []                                   parseExpressionSource -> null
")"               check ["theta/parse/default-not-literal"]   parseExpressionSource -> null
"]"               check ["theta/parse/default-not-literal"]   parseExpressionSource -> null
","               check ["theta/parse/default-not-literal"]   parseExpressionSource -> null
"-"               check ["theta/parse/default-not-literal"]   parseExpressionSource -> null
"|"               check ["theta/parse/default-not-literal"]   parseExpressionSource -> null
"# c"             check ["theta/parse/default-not-literal"]   parseExpressionSource -> null
"1 +"             check ["theta/parse/default-not-literal"]   parseExpressionSource -> a number node
"totally junk"    check ["theta/parse/default-not-literal"]   parseExpressionSource -> an ident node
"\"unterminated"  check []                                   parseExpressionSource -> a string node
"[1,"             check []                                   parseExpressionSource -> an array node
"\"ok\""          check []                                   parseExpressionSource -> a string node
```

The `check` column identifies the fail-open arm's input set by construction:
`checkLiteralSublanguage` returns `[]` immediately when its own `ExprParser`
yields no node (`src/parser/literal-sublanguage.ts:61–63`), so every row with a
non-empty `check` had a node, and only the four whitespace rows and the three
admitted-literal rows did not draw a diagnostic. Of those seven, the three
admitted-literal rows (`"\"unterminated"`, `"[1,"`, `"\"ok\""`) are silent because
their node **is** a literal; the four whitespace rows are silent because there is
no node to judge. The punctuation rows show that the two parsers disagree: they
are `null` under `parseExpressionSource` and still refused by the check.

The two unterminated rows are admitted as literals on the strength of their own
node and are not this report's class (§Non-goals).

### (j) The ordering rule still counts the empty default

```
p: 'string = ' then q: string       diags ["theta/parse/non-trailing-default"]
p: 'string = ' then q: 'integer = ' diags []
```

The cross-field ordering rule (`src/parser/params.ts:299`) reads
`defaultSource !== undefined`, so the empty default constrains where a later
non-defaulted field may be declared while binding nothing itself.

## Expected behaviour

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults) — "A
  param may declare a default with `field: type = literal`. The RHS is parsed by
  the **Theta literal sublanguage** — the same notation Theta uses for value
  construction in body code, restricted to the production set normatively defined
  in [Grammar Appendix — Theta literal sublanguage](../grammar.md#theta-literal-sublanguage).
  Primitive literals (including unary-`-` on numeric literals), `null`, array
  literals, bare-key object literals (the param's declared type supplies the
  schema), `Enum.Variant` access, and variant-schema construction (`Cat { ... }`)
  are all admitted." An empty RHS is none of the admitted forms, and
  `field: type = literal` has no arm without a `literal`.
- `docs/spec_topics/grammar.md:14` — the production set is closed:
  `Literal ::= PrimitiveLit | NamedValueLit | ArrayLit | BareObjectLit |
  NamedObjectLit`, and no alternative derives the empty string. `:9` states what
  the parser does about it: "only the productions enumerated below are admitted,
  and the parser performs an 'is-literal' check after parsing the AST in that
  position. A failure is `theta/parse/default-not-literal`".
- `docs/spec_topics/diagnostics/code-registry-parse.md:48` — the registered
  *Trigger* is "A `params:` default RHS **contains a form outside** the [Theta
  literal sublanguage] (operator, function call, identifier reference other than
  `Enum.Variant`, `${...}` interpolation, or `@`...`` template)." Empty text
  contains no form, and none of the five enumerated forms is "no text at all", so
  the empty spelling is outside this row's stated trigger set. The row's *Message*
  is `params default RHS must be a literal-sublanguage form; offending
  sub-expression: <expr>`, whose `<expr>` names a sub-expression that does not
  exist here. Bringing the input under this row therefore changes the row, not
  only the code.
- `docs/spec_topics/diagnostics/code-registry-load.md:19` — the type half's
  registered *Trigger* names the mirror-image input by name: refused is text
  "carrying a YAML mapping or sequence shape …, prose, punctuation, a
  comment-shaped text, two space-separated identifiers, or **an empty or
  whitespace-only string**, at whatever depth it sits". The same row states the
  precedence this report must not disturb: "a field refused by the text stage
  draws no default-RHS literal-sublanguage diagnostic
  (`theta/parse/default-not-literal`, `theta/parse/literal-newline-in-string`)
  for the same field". One half of the `params:` scalar refuses empty text by
  name; the other admits it.
- `docs/spec_topics/binder/binder-bypass-and-envelope.md:123` (item 4) —
  "`<requirement>` is exactly one of the literal tokens `required` or
  `default=<literal>`". `:142` (*Default-literal rendering*) — "The `<literal>`
  in `default=<literal>` (item 4) MUST be the field's default value rendered in
  the [Theta literal sublanguage] surface syntax — the same notation accepted on
  the RHS of `params:` defaults." The rendered line `  p (string) default=`
  carries no `<literal>`, so it is neither of the two admitted tokens, and the
  bytes after `default=` are not a form the sublanguage admits. `:142` also
  enumerates the round-trips the rendering must produce, including the
  empty-array case (`default=[]`) — so an empty value at this position has a
  conformant spelling (`default=[]`, `default=""`) that renders a literal.
- `docs/spec_topics/binder/defaulting-system-note-echo.md:7` — "the runtime
  fills the defaults before AJV validation"; `:9` — "when the wire name is
  absent, the field takes its declared default"; `:11` — the
  post-default-merge AJV validation is "the named hook this section installs".
  For these declarations the runtime fills nothing and the named hook is not
  invoked, so a field the spec says "takes its declared default" takes no value
  at all.
- `docs/spec_topics/governance/source-language-stability.md:9` — the
  loads-cleanly predicate. Every fixture in §Reproduction (a)–(c) satisfies it at
  HEAD, which is what puts the change in the carve-out's addition direction
  rather than outside GOV-15 (`:25`).

## Actual behaviour / root cause

Three independent joins have to hold for the empty default to survive, and all
three do.

**1. The split mints a default from a bare `=`.** `splitParamValue`
(`src/parser/frontmatter.ts:636`) scans for a top-level `=` and, on finding one,
returns both halves trimmed:

```ts
    if (depth === 0 && c === "=" && raw[i + 1] !== "=" && raw[i - 1] !== "=") {
      const typeSource = raw.slice(0, i).trim();
      const defaultSource = raw.slice(i + 1).trim();
      return { typeSource, defaultSource };
    }
```

`defaultSource` is therefore `""` — a **defined** empty string — for any of the
four spellings in §Reproduction (a), and the trim erases the difference between
them. Every downstream test is `!== undefined`: `hasDefault` on the binder-facing
record (`:796`), `defaultedFields` membership, and the `required` decision in
`parseParams`:

```ts
    if (field.defaultSource === undefined) {
      required.push(field.name);
    }
```

**2. The one checker at this position fails open.** `parseParams`'s per-field
default loop (`src/parser/params.ts:326–357`) is the only place a default is
examined. It runs two rules — the bug-0102 raw-newline span check (`:342`) and
`checkLiteralSublanguage` (`:352`) — behind the bug-0059 suppression guard
(`:339`). `checkLiteralSublanguage`
(`src/parser/literal-sublanguage.ts:53`) begins:

```ts
  const tokens = tokeniseExpr(source);
  const parser = new ExprParser(tokens, source);
  const node = parser.parse();
  if (node === undefined) {
    return [];
  }
```

An empty or whitespace-only source produces no node, so the function returns
before `firstNonLiteral` is asked anything. That arm is the entire mechanism:
every probed source that drew a diagnostic had a node, because a source without
one returns `[]` here first, and §Reproduction (i) shows that only the four
whitespace rows and the three admitted-literal rows were silent.
`LiteralPosition` is the single value `"default"` (`:39`) and the function has
exactly one production caller, so nothing else in the tree relies on the arm's
silence.

With both rules silent and the type half a legal `string`, the error gate
(`:362–365`) passes and the block lowers (`:367`).

**3. Invocation cannot recover a value, so it skips the validation seam
entirely.** `#recoverDeclaredDefaults`
(`src/extension/production-theta-producer.ts:1204`) re-reads the `.theta`,
re-splits the field scalar with `splitParamDefaultSource` (`:5581`) — the twin of
the parser's split, returning `raw.slice(i + 1).trim()` — and then:

```ts
      const parsed = parseExpressionSource(defaultSource);
      if (parsed === null) {
        continue;
      }
```

`parseExpressionSource("")` is `null` (measured), so the field is skipped and the
recovered list is empty. `#mergeDeclaredDefaults` (`:1171`) reads that:

```ts
    const defaults = await this.#recoverDeclaredDefaults(theta, params.defaultedFields);
    if (defaults.length === 0) {
      return binderArgs;
    }
```

and returns before the compile (`:1189`) and before
`fillDefaultsAndRevalidate` (`:1190`). The hook
`defaulting-system-note-echo.md:11` installs is not reached, so there is no
verdict to route or discard — this is one seam earlier than bug 0163's, where the
hook runs and its `false` is dropped by the same caller.

`runBinder` (`:856`) then reports the binder's own args as the bound args, and
`paramBindingsFrom` (`src/extension/theta-composition-producer.ts:90`) copies
each entry into body scope. The binder was instructed to omit a defaulted field
the user did not mention (`binder-system-prompt.ts:345`), and the envelope
accepts that omission (`relaxParamsSchema`, `binder-envelope.ts:137`; measured in
§Reproduction (e)), so the args carry no entry for the field, no slot is
installed, and the body reads it as `null` — measured `outcome success`,
`value null`. The field's own lowered fragment answers `false` on `{"p":null}`
in six of the seven rows of §Reproduction (e); the seventh is the nullable union,
the one declared type for which `null` is in range.

The render seam is downstream of all of it and does nothing wrong.
`binderPromptParamField` (`production-theta-producer.ts:619`) mints a `default`
requirement whenever `hasDefault` and `defaultSource !== undefined`, both of
which hold, and `renderBinderParamLine`
(`src/binder/binder-system-prompt.ts:168–173`) interpolates the recorded literal
after `default=`. Given a record that says "this field has a default whose source
text is the empty string", `  p (string) default=` is the only line those two
seams can produce. The record is the thing nothing refused.

## Why it matters

- **The body binds a value the author never wrote, and the declaration's own
  schema refuses it.** Measured end to end: the theta loads with `diags []`,
  registers, takes the binder path, and the body reads `p` as `null` with
  `outcome success`. AJV over the same field's lowered fragment answers `false`
  on `{"p":null}` with `must be string`. Every downstream read of that binding —
  a `match`, a comparison, an interpolation into a query — proceeds on `null`,
  which six of the seven rows in §Reproduction (e) refuse.
- **The one validation seam the spec puts between a default and the body is
  skipped, not failed.** `defaulting-system-note-echo.md:11` names the
  post-default-merge AJV validation as the hook for exactly this moment.
  `#mergeDeclaredDefaults` returns at `:1180–1182`, before the compile. Bug
  0163's class at least computes a verdict and discards it; here there is no
  verdict.
- **The cost is spent before the silence.** `classifyBinderBypass` returns
  `binder` for every fixture (measured) — a defaulted field cannot take the
  single-string bypass — so the binder model call is unconditional, and it is
  made with a prompt whose `Parameters:` line advertises a default that does not
  exist.
- **The binder is grounded in a token its own contract forbids.**
  `binder-bypass-and-envelope.md:123` admits exactly two requirement tokens and
  `:142` requires the `<literal>` to be a literal-sublanguage form.
  `  p (string) default=` is neither token. Bug 0060 closed the ways this line
  can be broken by author bytes; this is the line being well-formed and empty.
- **Two spellings one keystroke apart diverge with no signal.**
  `p: 'string = ""'` records `"\"\""`, renders `default=""`, recovers, fills, and
  binds `""`. `p: 'string = '` records `""`, renders `default=`, recovers
  nothing, and binds `null`. Both load with zero diagnostics.
- **The same emptiness is refused by name on the other half of the same
  scalar.** `code-registry-load.md:19` names "an empty or whitespace-only string"
  in the type half's refusal set, and `p: ' = "ok"'` and `p: ' = '` are both
  refused at HEAD (measured). The asymmetry is inside one YAML value.
- **Every YAML spelling reaches it.** Single-quoted, double-quoted, unquoted,
  block-literal, block-folded and a tab-only default all produce the identical
  record (§Reproduction (b)), so there is no delivery an author can avoid and no
  narrower guard that would only catch a typo.
- **The declaration still constrains its neighbours.** `p: 'string = '` followed
  by `q: string` draws `theta/parse/non-trailing-default` (measured): the empty
  default is authoritative enough to force declaration order and not
  authoritative enough to bind a value.
- **No gate scores it.** The census finds one committed default in the whole
  corpus and it is well-formed, so `tests/committed-fixture-parse-gate.test.ts`
  never meets one of these. No committed test declares an empty default, and none
  of the five committed direct calls to `checkLiteralSublanguage` passes an empty
  or whitespace-only source, so the fail-open arm is unwitnessed in either
  direction.

## Fix

Not settled. Three candidate check sites are pinned below with their measured
blast radii; the run selects one and states the evidence that decided it. Every
route carries the constraints in (d), and none may weaken the bug-0059 guard in
(d)(2).

### (a) Refuse the empty default in `parseParams`'s per-field default loop

Add a third rule to the loop at `src/parser/params.ts:326–357`, beside the
raw-newline check (`:342`) and the `checkLiteralSublanguage` call (`:352`): a
`defaultSource` that is empty or whitespace-only after trim draws an
error-severity diagnostic at the field's range, and the error gate (`:362–365`)
withholds the lowered document as it already does for the other two rules.

- **It decides every row.** All four `=` spellings, all six YAML deliveries and
  all seven declared types in §Reproduction (a)–(c) reduce to the same
  `defaultSource === ""` predicate. `trim()` has already run inside
  `splitParamValue`, so the predicate is `field.defaultSource.length === 0` —
  but the route states whether it re-trims, because a fix at (b) or (c) that
  changes the split would change what reaches here.
- **The blast radius is the loop and the gate.** No other seam moves: a refused
  declaration produces no `loweredSchema` at all, so the render token, the
  envelope, the merge and the child intake never see the field.
- **It must sit behind the bug-0059 guard, not in front of it.** The guard at
  `:339` skips both existing rules for a field whose type half was refused; the
  new rule belongs on the same side of it. Constraint (d)(2) states the cell that
  proves it.
- **It leaves the fail-open arm open.** `checkLiteralSublanguage`'s
  `node === undefined` return (`literal-sublanguage.ts:61–63`) would still be
  reachable in principle from a future caller. A route here records that the arm
  is unwitnessed and states whether it adds a direct unit cell for it.

### (b) Close the fail-open arm inside `checkLiteralSublanguage`

Return the diagnostic when `ExprParser.parse()` yields no node
(`src/parser/literal-sublanguage.ts:58–63`), instead of `[]`.

- **The blast radius is measured and small.** One production caller
  (`src/parser/params.ts:352`); `LiteralPosition` has the single value
  `"default"` (`:39`). Five committed direct calls, in three files:
  `tests/e2e-s1-grammar-literal-sublang.test.ts:27`, `:35`, `:44` and
  `tests/type-grammar.test.ts:132`, `:150` pass string literals, none empty or
  whitespace-only; `tests/binder-param-line-newline-normalisation.test.ts:850`
  and `:902` pass a rendered default literal (`defaultLiteralOf`, `:526`) and
  assert `[]`, so a route here re-runs those two rather than inspecting them.
- **Its input set needs enumerating, not assuming.** §Reproduction (i) probes
  fifteen sources and finds the arm reached only by the empty and
  whitespace-only ones; every other probed text produced a node. Fifteen is not
  a proof. A route here enumerates the arm's input set from `ExprParser`'s own
  `parse` rather than from a probe, because the diagnostic it emits must be
  correct for every member.
- **It has to say what the diagnostic names.** The registered *Message*
  (`code-registry-parse.md:48`) interpolates `<expr>`, and there is no offending
  sub-expression to name. Constraint (d)(1) holds this.
- **It also settles the position's contract, beyond this input.** Where (a)
  adds a rule about emptiness, (b) makes "the default RHS parses to a literal" a
  total predicate at the position. A route choosing (b) states which of the two
  it intends, because the second is a stronger claim than this report measures.

### (c) Make the split refuse to mint a default from a bare `=`

Have `splitParamValue` (`src/parser/frontmatter.ts:636`) return no
`defaultSource` when the remainder after the top-level `=` is empty.

- **It changes the meaning of the declaration rather than refusing it.** The
  field would become `required` (`params.ts:277–279`), the render token would
  become `required`, and the trailing `=` would be swallowed with no diagnostic.
  That converts a silent wrong bind into a silent declaration rewrite, which is
  a worse disposition on the same evidence; the route is recorded so the run
  rejects it explicitly rather than by omission.
- **It cannot land alone.** `splitParamDefaultSource`
  (`production-theta-producer.ts:5581`) is the invocation-side twin and its
  doc comment pins the two in step ("Kept in step with the parser's own
  `splitParamValue` so a recovered default matches the literal the loader
  validated"). Either both move or the two seams disagree about whether the
  field has a default.
- **It is compatible with (a).** A route may take (a) for the refusal and leave
  both splits unchanged; §Reproduction (f) is why the splits are cited here at
  all.

### (d) Constraints every route carries

1. **The registry has no row whose Trigger claims the input.**
   `theta/parse/default-not-literal` (`code-registry-parse.md:48`) is the
   position's registered row, but its *Trigger* predicates on a default RHS that
   *contains* a form outside the sublanguage and enumerates five such forms;
   empty text contains none. Reusing the code therefore requires a *Trigger*
   edit, which is a DIAG-2 spec change landing in the same commit as the code
   (`diagnostic-shape.md:72`), and the *Message* column does not move (DIAG-4,
   `:74`) — so the route must dispose of the `<expr>` placeholder, whose
   interpolation is empty for this input. Registering a new row is the
   alternative and is the same DIAG-2 operation. The type half's own row
   (`code-registry-load.md:19`) already carries "an empty or whitespace-only
   string" in its *Trigger* and is the drafting precedent for the wording.
2. **The bug-0059 type-half suppression keeps suppressing.** `parseParams`'s
   guard (`src/parser/params.ts:339`) skips a field's default-side literal checks
   when that field's type half was refused, and the registry states the rule
   normatively (`code-registry-load.md:19`, third precedence rule: "a field
   refused by the text stage draws no default-RHS literal-sublanguage
   diagnostic … for the same field"). Cell f1
   (`tests/params-scalar-nontype-text-refusal.test.ts:1026`, assertion `:1035`)
   pins `p: 'pick one = or two'` at exactly one diagnostic and reds if a new
   default-side rule is placed ahead of the guard. Cells f2 (`:1038`) and f3
   (`:1054`) pin the guard's other two arms. `p: 'lol wut = '` — a junk type half
   *and* an empty default — must stay at one diagnostic
   (`theta/load/params-type-not-expression`), measured in §Reproduction (h).
3. **GOV-15.** Every fixture in §Reproduction (a)–(c) loads cleanly at HEAD
   (`source-language-stability.md:9`) and would stop loading. That is the
   diagnostic-registry carve-out's addition direction (`:25`), admissible within
   a 1.x minor for the inputs newly brought into the emission set; the fix
   enumerates that input set — the four `=` spellings across the six YAML
   deliveries, at every declared type — rather than leaving it to be discovered.
   The census in §Affected found no committed fixture in it.
4. **The controls stay silent.** `p: 'string = ""'`, `p: 'array<string> = []'`,
   `p: 'string = "ok"'`, `p: 'string'` and the shape of the one committed default
   (`number = 3`) each load with zero diagnostics at HEAD and render
   `default=""`, `default=[]`, `default="ok"`, `required` and `default=3`
   respectively — measured. All five keep those verdicts. The empty-array
   round-trip is one `binder-bypass-and-envelope.md:142` names by name.
5. **No consumer moves.** `renderBinderParamLine`
   (`src/binder/binder-system-prompt.ts:168`), `binderPromptParamField`
   (`production-theta-producer.ts:619`), `buildBinderEnvelopeSchema`
   (`binder-envelope.ts:86`), `fillDefaultsAndRevalidate`
   (`src/binder/defaulting.ts:67`), `#mergeDeclaredDefaults`
   (`production-theta-producer.ts:1171`) and `intakeChildParams`
   (`src/runtime/subagent-params.ts:233`) are each correct given a well-formed
   record. Refusing the declaration removes the record. Bug 0060's lock
   (`tests/binder-param-line-newline-normalisation.test.ts`) and bug 0102's
   (`tests/params-default-string-literal-raw-newline.test.ts`) both hold bytes at
   this position and are re-read, not moved.
6. **Test witness — unit, offline, no live provider.** Every fixture here is a
   `parseDoc` call plus shipped seams. Required beyond the probes: the four
   `=` spellings × the six YAML deliveries as refusal cells with the emitted
   code and count; the seven declared types; the five silent controls in (d)(4);
   the bug-0059 suppression at a count of one for `p: 'lol wut = '` and
   `p: 'pick one = or two'`; the ordering-rule interaction in §Reproduction (j)
   under the new refusal; and — for whichever rows a bounded route leaves loading
   — the body-scope read, since `null` is the observable that makes this S1.

### (e) Ordering

Nothing blocks this report from starting.
[0163](./0163-params-default-type-compat-unchecked-at-load.md) is open against
the same per-field default loop that routes (a) and (b) insert into; the two
classes are disjoint (§Related; §Reproduction (f) and (h) measure the
separation), so neither fix changes the other's verdicts and whichever lands
second rebases onto the other's hunks. If this report lands first, 0163's
candidate (b) gains a guarantee it does not have today — that a recorded
`defaultSource` parses — and its §Fix (b) bullet about the parser not retaining
the value is unaffected.
[0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) is open
against the schema-body field-type and alias-arm positions and reaches
`parseParams`'s type-side loop, not the default loop; its landing shifts
`params.ts` line numbers, which is bug 0134's class and the reason §Affected
names symbols.

## Non-goals

- **Type-correct-but-incompatible defaults.** `p: '"x" | "y" = "zzz"'` and its
  eleven siblings are
  [0163](./0163-params-default-type-compat-unchecked-at-load.md)'s subject, and
  cell f3 of the 0059 witness pins that row as-is
  (`tests/params-scalar-nontype-text-refusal.test.ts:1054`). This report owns the
  cell where there is no default value to compare at all.
- **Junk TEXT on either half.** Text no `Type` production spells is
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s class,
  fixed at 0.86.0; text outside the literal sublanguage on the default half
  already emits `theta/parse/default-not-literal`. This report requires 0059's
  type-half suppression to keep suppressing (§Fix (d)(2)) and changes nothing
  about what it refuses.
- **The `Parameters:` line-shape family.** Embedded breaks and forged lines are
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)'s
  subject, fixed at 0.61.0. The token here is single-line and correctly shaped.
- **Raw newlines inside a default string-literal span.**
  [0102](./0102-params-default-string-literal-raw-newline-admitted.md)'s subject,
  fixed at 0.75.0. There is no span here.
- **The `params:` node-shape stage.**
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md)'s subject, fixed
  at 0.51.0. Every fixture here is an admitted scalar.
- **Unterminated literal defaults.** `p: 'string = "unterminated'` and
  `p: 'array<string> = [1,'` load with zero diagnostics and record a
  `defaultSource` that *does* parse (a string node and an array node,
  §Reproduction (i)), so the merge would fill a value the author did not write.
  Measured and recorded here because they share the same silent load, but they
  are a distinct class — a well-formed-enough literal, not an absent one — and no
  filed report names them at this HEAD.
- **That an unbound declared param reads `null` in body scope.** Measured here as
  what this defect produces, not as a request to change it. The invoke path
  substitutes `null` for an omitted positional argument at the same position
  (`src/extension/production-theta-producer.ts:3218–3222`), which
  [0163](./0163-params-default-type-compat-unchecked-at-load.md)'s §Non-goals
  already records; whether either should refuse instead is a separate question.
- **The post-default-merge verdict's routing.** That `#mergeDeclaredDefaults`
  discards `result.validation` when it does run is 0163's candidate (c). For this
  report's rows the hook is not reached at all, so there is no verdict to route.
- **Whether `{}` should ever be a lowering.** No fixture here lowers `{}`; every
  row lowers a constraining fragment (§Reproduction (c)).

## Provenance

Filed as residual 1 of the bug 0059 fix (0.86.0, commit `f31eac45`). That fix's
report (`.pi/tmp/fixes/0059-report.md` §Residuals item 1) and the same
disposition in the doc at
[`0059-…md`](./0059-params-scalar-nontype-text-recorded-and-permissive.md)
`## Fix (0.86.0)` *Residuals* item 1 (`:977–983`) record the load-time
observables — `hasDefault: true`, `defaultSource: ""`, `required: []`, the
rendered `default=` — and state the boundary against bug 0163. Nothing in either
record covers the invocation-time half; §Reproduction (f) and (g) are new to this
filing and are what carry the severity.

Independently re-derived at HEAD `f31eac45` for this filing, not copied: a
scratch vitest probe over `parseDoc`, the production `AjvSchemaValidator`,
`renderBinderParamLine`, `buildBinderSystemPrompt`, `classifyBinderBypass`,
`buildBinderEnvelopeSchema`, `fillDefaultsAndRevalidate`,
`checkLiteralSublanguage`, `parseExpressionSource`, and the production
`bindPromptConversation` + `executeBody` pair, covering every row of
§Reproduction (a)–(j), plus a second short probe for the five §Fix (d)(4)
controls; written, run, deleted. The corpus census was re-run over
`git ls-files`, and the "no committed test declares an empty default" and
"none of the five committed direct calls to `checkLiteralSublanguage` passes an
empty or whitespace-only source" claims were grepped over `tests/` at HEAD. Every `src/`, `tests/`, spec and bug-doc citation above was verified
against the tree at HEAD; `parseExpressionSource` is `src/parser/theta-document.ts:1157`
at this HEAD.

Two items are traced rather than driven, and are marked as such in the text: the
`#recoverDeclaredDefaults` → `#mergeDeclaredDefaults` → `runBinder` chain
(driving it needs a binder model call and an on-disk theta), and the subagent
child's params intake. Each seam those two consume was measured directly —
`parseExpressionSource` on the empty source, `fillDefaultsAndRevalidate` on both
the reachable `defaults []` state and the counterfactual `defaults [{p, ""}]`
state, the compiled validator over the same lowered document, and the body-scope
projection through the real `bindPromptConversation` with the `paramBindings` map
each merge outcome produces.

Measurement hygiene: a first pass ran against a working tree carrying another
in-flight filing's uncommitted prototype in `src/parser/params.ts`,
`src/parser/theta-document.ts` and `src/parser/body-type-lowering.ts` (a
schema-body / alias-arm junk-text guard, plus an extraction of `parseParams`'s
type-side `refusable` predicate). Every value in this report comes from a second
pass in a detached worktree checked out at `f31eac45` with
`git status --short --untracked-files=no` clean, and the two passes produced
identical output on every row. The line numbers cited here are HEAD's, not that
working tree's.

Mechanism-delta note (0.88.0). Bug
[0066](./0066-ajv-verdict-discarded-unreachable-enforcement.md)'s fix moved
this report's seam: #mergeDeclaredDefaults no longer returns before the
post-default-merge hook — the hook now runs whenever a lowered params:
schema is presented, including when default recovery yields nothing (the
exact arm this report describes; witness cell (5) of
tests/binder-post-merge-ajv-enforcement.test.ts pins it). The headline
null-bind PERSISTS: the recovered-nothing field is omitted from required,
AJV over the merged args passes, and the body still binds null for the
non-nullable declared param — measured during that fix's verification (the
red-proof output renders q=null (default)). This report's §Actual mechanism
sentences describing the early return are stale as of 0.88.0 (0134's
class); the load-time admission of the empty literal and the null-bind are
unchanged and remain this report's subject. Its load-time deferral is now
also pinned by cell c7 of tests/params-default-type-compat.test.ts — a fix
here re-pins that cell knowingly.

Coordination note (appended by the bug 0166 fix, 0.91.0). 0166 landed FIRST,
so this report rebases onto its hunks per its §Fix (f). The two classes stayed
disjoint on the measured observable: 0166 narrowed `firstNonLiteral`'s `neg`
arm (and, in step, `primitiveLiteralType`'s) through one new shared predicate
`isNumericLiteralOperand`, and left `checkLiteralSublanguage`'s
`node === undefined` early return — this report's subject — byte-identical,
verified by diff and by the verifier. Cell e3 of
`tests/params-default-unary-minus-non-numeric-refusal.test.ts` now also pins
`p: 'string = '` still loading clean with `defaultSource: ""`, so a route here
reds that cell knowingly, as it already does cell c7 of
`tests/params-default-type-compat.test.ts`. A route that closes the
`node === undefined` arm **inherits a narrower `neg` arm and must not
re-widen it**: `firstNonLiteral` now takes `source` and admits `neg` only over
a numeric-literal operand, and its agreement with `primitiveLiteralType` is
witnessed — neutralising either arm alone reds group C of that file. This
report's own line citations to `src/parser/literal-sublanguage.ts` (`:53`,
`:58–63`, `:61–63`) sit ABOVE 0166's insertion point at `:493` and are
unshifted by it; the file grew 741 → 767 lines.

## Fix (0.92.0)

- **What shipped:**
  - `src/parser/params.ts` — §Fix (a): `parseParams`'s per-field default loop
    gains a third rule, BEHIND the bug-0059 type-half guard and AHEAD of the
    bug-0102 raw-newline rule, refusing a `defaultSource` that is empty or
    whitespace-only after trim with the new code
    `theta/parse/default-without-literal`, then `continue`ing so the
    raw-newline, is-literal and compat rules never judge a field that carries
    no literal at all. The error gate then withholds the lowered document.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the DIAG-2 row for
    the new code, in the same commit as the emitter.
  - `docs/reference/diagnostics.md` — the mirror row (that table has no
    *Trigger* column, so a new code needs one).
  - `docs/reference/frontmatter.md`,
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §Defaults — one
    clause each naming the new code.
  - `tests/params-default-empty-literal-refusal.test.ts` — the 39-cell load-time
    witness (new).
  - `tests/live/live-production-acceptance.test.ts` — additive H8a cell 34.
  - Three pre-authorized existing-cell re-pins (below).
- **The settled route, and the evidence that decided it.** §Fix (a) was taken
  over (b) and (c). (1) The violated production is the DECLARATION form, not
  the sublanguage's production set: `frontmatter-fields-a.md:60` writes it
  `field: type = literal` and derives no arm without a `literal`, and that form
  is checked where the params block is parsed. (2) Route (b) collides with
  `grammar.md:9`, which is normative that a failure of the is-literal check is
  `theta/parse/default-not-literal`; emitting a second code out of that check
  would falsify the sentence and force a further spec edit, where (a) leaves it
  exactly true. (3) Route (a) leaves `src/parser/literal-sublanguage.ts`
  BYTE-IDENTICAL (`git hash-object` = `git rev-parse HEAD:` =
  `5003d7d8ae9f75037a4a2425f33f0e548a14391e`), which is the strongest available
  guarantee against re-widening the `neg` arm bug 0166 narrowed one release
  earlier. (4) Route (c) is rejected by §Fix itself (a silent declaration
  rewrite that cannot land without moving `splitParamDefaultSource` in step);
  both splits are unchanged.
- **DIAG-2 disposition — a NEW row, and why reuse was rejected.**
  `theta/parse/default-not-literal`'s *Message* interpolates `<expr>`, and
  `placeholder-rendering-a.md:49` binds `<expr>` normatively to "the offending
  source span … copied byte-for-byte … between the offending sub-expression's
  start and end token positions". Empty input has no token positions and no
  sub-expression, so reuse would render `offending sub-expression: ` naming
  nothing, and DIAG-4 (`diagnostic-shape.md:74`) forbids moving the *Message*
  to repair it. DIAG-2 admits a code ADDITION as a GOV-15 carve-out within a
  1.x minor. The new code is named off the `theta/parse/let-without-initialiser`
  precedent — the registry's existing "declaration form present, required
  operand absent" row. *Sev* `E`, *Phase* `parse`, *Spec rule*
  `[Frontmatter — Defaults]`, *Hint* `—` (matching
  `theta/parse/params-default-type-mismatch`; the family emits no hint, so
  promising one would be a registry claim the code does not honour). *Trigger*
  modelled on `code-registry-load.md:19`'s type-half wording, the §Fix (d)(1)
  drafting precedent. The placeholder `<field>` needs no new token: it is a
  category-5 source-derived placeholder (`placeholder-rendering-b.md:3–10`,
  "identifier-shaped per Lexical — Identifiers; rendered unquoted"), already in
  registry use by `theta/parse/non-trailing-default`. `default-not-literal`'s
  own row is UNTOUCHED, so bug 0166's landed numeric carve-out wording is
  preserved by construction, and `params-default-type-mismatch`'s precedence
  sentence needed no edit (its *Trigger* already defers on "text that parses to
  no literal"). `docs/reference/grammar.md:513` and `grammar.md:9` describe the
  IS-LITERAL CHECK and are deliberately unedited — the second dividend of not
  routing through `checkLiteralSublanguage`.
- **The fail-open arm's input set, proven rather than probed** (§Fix (b)'s
  obligation (i), discharged even though (b) was not taken). `ExprParser.parse`
  has exactly one `return undefined`, guarded by `this.peek() === undefined`;
  `peek()` returns `tokens[0]`; `tokeniseExpr` skips exactly `" "`, `"\t"`,
  `"\n"`, `"\r"` and otherwise ALWAYS pushes a token (the terminal fall-through
  pushes a single-character `punct` for any unmatched byte). Every other entry
  point below `parse()` returns a node unconditionally. The token list is
  therefore empty IFF every character is one of those four: the arm's input set
  is exactly {empty, whitespace-only}. Route (a) leaves that arm OPEN by design,
  so group G of the witness pins
  `checkLiteralSublanguage("", "default", site) → []` and the whitespace-only
  row as a DELIBERATE, documented boundary — the refusal lives at the
  declaration-form position — converting a previously unwitnessed branch into a
  witnessed one.
- **GOV-15 — the newly-refused input set, enumerated** (`source-language-stability.md:25`,
  the carve-out's ADDITION direction, admissible within a 1.x minor): the four
  `=` spellings (`T = `, `T =`, `T =␠␠␠`, `T=`) × the six YAML deliveries
  (single-quoted, double-quoted, unquoted, block literal `|`, block folded `>`,
  tab-only) × every declared type (measured across `string`, `integer`,
  `array<string>`, `"x" | "y"`, `boolean`, `string | null`, a named enum), plus
  the cross-field row `p: 'string = '` + `q: 'integer = '`. Two of the 24
  spelling×delivery cells are UNSPELLABLE and are documented rather than
  asserted: YAML strips trailing white space from a plain scalar, so the
  one-space and three-space spellings cannot arrive unquoted. **Corpus census
  re-run at this HEAD:** 34 committed `.theta`/`.thetalib`, 17 declaring
  `params:`, exactly one top-level `=` inside a committed `params:` block —
  `count: number = 3` in `tests/live/acceptance/fixtures/acc-params-binder.theta`,
  well-formed. No committed fixture is in the affected class. A repo-wide sweep
  for the trigger shape found exactly one collision, cell (5) below.
- **The over-refusal fence stays silent** (§Fix (d)(4), all five re-measured):
  `string = ""` → `default=""`, `array<string> = []` → `default=[]`,
  `string = "ok"` → `default="ok"`, `string` → `required`, `number = 3` →
  `default=3`. The bug-0059 guard keeps suppressing (§Fix (d)(2)):
  `p: 'lol wut = '` and `p: 'pick one = or two'` each still draw EXACTLY ONE
  `theta/load/params-type-not-expression` and never the new code — the cells
  that red if the rule is placed ahead of the guard rather than behind it. No
  consumer moved (§Fix (d)(5)): `splitParamValue`, `splitParamDefaultSource`,
  `renderBinderParamLine`, `binderPromptParamField`, `buildBinderEnvelopeSchema`,
  `fillDefaultsAndRevalidate`, `#mergeDeclaredDefaults` and `intakeChildParams`
  are all byte-identical to HEAD.
- **Authorized cell re-pins — three, each with its authority, each subject preserved:**
  1. `tests/params-default-type-compat.test.ts` **c7** — authority: this doc's
     own mechanism-delta note ("a fix here re-pins that cell knowingly"). Lifted
     out of the `DEFERRED` table into its own cell asserting the new refusal AND
     that `theta/parse/params-default-type-mismatch` still declines — bug 0066's
     subject at that row.
  2. `tests/params-default-unary-minus-non-numeric-refusal.test.ts` **e3** —
     authority: bug 0166's coordination note appended below ("a route here reds
     that cell knowingly"). Restated: the file now asserts the new refusal AND
     that `theta/parse/default-not-literal` does NOT co-fire, which is exactly
     the separating observable the cell existed to hold. Its `recordedDefault`
     premise moved from `""` to `undefined` because an error-severity `params:`
     diagnostic withholds the WHOLE frontmatter object
     (`src/parser/frontmatter.ts`, the `registered` gate), the same disposition
     that file's own refusal helper already asserts — verified empirically
     before the cell was touched.
  3. `tests/binder-post-merge-ajv-enforcement.test.ts` **cell (5)** — authority:
     an explicit OPERATOR GRANT, recorded verbatim below. This cell was not
     pre-authorized by any document; the first run of this fix STOPPED at the
     blast-radius pre-measurement and reported it rather than self-authorizing,
     because re-vehicling it touches assertions in a protected witness of a
     fixed bug.

  > "GRANT — re-vehicle cell (5) onto the unreadable-file arm, subject preserved
  > (recommended)" — "One cell, one file, nothing else moves. Keep
  > DEEP_UNRECOVERABLE_DEFAULT_THETA's default well-formed (q: 'string = "d"')
  > and reach the empty recovered-defaults list through the unreadable-file arm
  > the cell's own comment already names — the harness supplies a fake
  > filesystem. Premise assertions change from "defaultSource is empty /
  > parseExpressionSource is null" to "the theta declares a default, and the
  > shipped recovery returns none for it". The four outcome assertions (single
  > AJV args note, result.bound === false, no success echo) are UNTOUCHED, so
  > bug 0066's subject stays witnessed. Moved rows marked inline naming 0165 as
  > the authority, per the 0056/0059 discipline; coordination note appended to
  > 0066's doc."

  Implemented within every bound: `q`'s default is now `string = "d"`,
  `DEEP_UNRECOVERABLE_DEFAULT_PATH` is deliberately omitted from the harness's
  `FIXTURE_SOURCES` so `root.fileSystem.readBytes` rejects and
  `#recoverDeclaredDefaults` returns `[]` through its `bytes === undefined`
  arm, and the premise now asserts that rejection off the same `readBytes` seam
  the production code calls. `params.defaultedFields` is still `["q"]`, so the
  recovery is genuinely invoked rather than short-circuited onto cell 4's
  no-defaults arm. The four outcome assertions are outside every diff hunk —
  literally unchanged — and the AJV-on-`args` depth-breach note still fires with
  `result.bound === false`, re-proven on the new vehicle. Nothing else in that
  file moved beyond the now-unused `parseExpressionSource` import.
- **Gates:**
  - Witness, red before: `npx vitest run tests/params-default-empty-literal-refusal.test.ts`
    → `Tests 30 failed | 9 passed (39)`, every red the empty diagnostic list
    where the fix emits (`expected [] to deeply equal [ Array(1) ]`).
  - Witness, green after: `Test Files 1 passed (1)` / `Tests 39 passed (39)`.
  - Red-proof, production neutralisation: removing only the new rule reds 30/39
    and restoring returns `git hash-object src/parser/params.ts` to its
    pre-neutralisation value byte-exact.
  - Red-proof, registry neutralisation: removing only the registry row reds
    29/39 on the DIAG-4 loud-failure path
    (`expected undefined to be defined`), proving every expected message is read
    from the registry rather than copied.
  - Full default suite: `Test Files 295 passed (295)` / `Tests 4869 passed (4869)`
    (baseline 294/4830; +1 file / +39 tests is exactly the new witness).
  - `npx tsc -p tsconfig.json --noEmit` → clean. `npm run lint` → clean.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts`
    → `Tests 34 passed (34)`, cell 34 green in 42.7 s, first attempt.
  - Live H9a: `noninteractive-acceptance.test.ts` → 10 passed;
    `ctor-unresolved-load-refusal.test.ts` → 1 passed. 11/11.
    `tests/fixtures/h7a/permitted-codes.json` is UNCHANGED, decided by the real
    run and not by assumption — no H9a fixture carries the trigger shape.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) returned one `prose`
  finding (a stale `:399` citation in the new witness file's own header, which
  the fix's `+27`-line insertion had moved to `:426`) plus one non-blocking
  residual (an imprecise "ahead of this same loop" clause, and a pre-existing
  wrong `production-composition.ts` citation left alone as bug 0134's class).
  Both actionable items were routed to `bug-fix-fixer-light`; that round's diff
  touched only comment text, verified by gate-diff, so the confirmation round
  was skipped under the post-polish rule. A pre-review correction round preceded
  round 1: the implementer had refreshed nine `params.ts` citations across six
  files, but three of them were already wrong at HEAD (the `unspellable` sink is
  at `:747`, not the cited `:701`; the cited generic-argument split `:591–612`
  is JSDoc prose) — shifting those by `+27` would launder bug 0134's stale-citation
  class as freshly re-derived, so `tests/params-scalar-nontype-text-refusal.test.ts`,
  `tests/schema-body-nontype-text-refusal.test.ts` and
  `tests/inline-object-nested-lowering.test.ts` were reverted BYTE-EXACT to HEAD
  (hashes equal, line counts 1299 / 1217 / 2043). Only the citations this change
  genuinely invalidated were kept.
- **Verification:** SOLID, no findings. Obligation 1 — both neutralisations red
  the witness and both restore byte-exact. Obligation 2 — 295/4869 green.
  Obligation 3 — H8a 34/34 and H9a 11/11, run for real; the H8a addition is
  purely additive (`git diff --numstat` → `239 0`, zero deletion lines; cell
  31's `anthropic/claude-haiku-4-5` pin and cells 32/33 untouched).
  Obligation 4 — typecheck and lint clean.
- **Residuals:**
  1. **This doc was wrong that bug 0163 is open.** `0163-…md` reads
     `Status: fixed (0.88.0) — discharged by bug 0066's fix`, so §Fix (e)
     *Ordering*'s "whichever lands second rebases" reasoning is moot on that
     pair. The per-field default loop has also gained a fourth occupant this doc
     does not describe — `checkParamsDefaultCompat`, landed by 0163/0066.
  2. **This doc under-measured its own blast radius.** §Affected's census claim
     "no committed test declares an empty default" is FALSE at this HEAD:
     `tests/binder-post-merge-ajv-enforcement.test.ts` declared one, landed by
     bug 0066 at 0.88.0 — after this doc was measured. None of §Fix's three
     routes names that file, although this doc's own mechanism-delta note cites
     cell (5) by name. That gap is what forced the operator grant above.
  3. **The 0166 coordination note's "unshifted" claim is wrong.** This doc's
     citations `src/parser/literal-sublanguage.ts:53`, `:58–63`, `:61–63` are
     each off by one at this HEAD (`checkLiteralSublanguage` is at `:54`, the
     `node === undefined` return at `:62–64`, `LiteralPosition` at `:40`). Bug
     0134's class; disclosed, not chased.
  4. **Positional drift elsewhere in this doc** — every `src/parser/params.ts`
     citation, and the `tests/params-scalar-nontype-text-refusal.test.ts` f1/f2/f3
     positions, are stale. Bug 0134's adjudicated do-not-chase class.
- **Discharge notes appended:** bug 0066 (cell (5) re-vehicled, subject
  preserved, grant named), bug 0166 (what moved in the shared loop and the
  registry), bug 0059 (its guard kept suppressing, with the cells that prove
  it).
- **Pinned dispositions / non-goals:** the fail-open arm inside
  `checkLiteralSublanguage` stays OPEN and is now a witnessed boundary rather
  than an unwitnessed branch (group G) — closing it is route (b), rejected.
  Unterminated literal defaults (`string = "unterminated`, `array<string> = [1,`)
  remain admitted; they record a `defaultSource` that DOES parse and are this
  doc's own §Non-goals. The trailing-token `ExprParser` tolerance
  (`integer = -1x`) is bug 0175's, already filed. That an unbound declared param
  reads `null` in body scope is unchanged as a general rule — this fix removes
  the declaration that reached it, not the rule.
