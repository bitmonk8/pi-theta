# Bug 0163 — A `params:` field default is never checked against the declared type at load: `p: '"x" | "y" = "zzz"'`, `p: 'integer = "nope"'`, `p: 'string = 5'` and nine further declaration/default pairs load with zero diagnostics, record `defaultSource` verbatim and drop the field from `required`, and since bug 0056 the lowered fragment refuses that same default at all three consumers — the post-default-merge AJV hook computes the refusal and its one caller discards the verdict, so a slash invocation that omits the field runs the body on the out-of-type value one binder model call in

- **Status:** open. Residual 2 of the bug 0056 fix (0.85.0, commit `81600080`),
  recorded there as `## Fix (0.85.0)` *Residuals* item 2
  (`0056-…md:1034–1042`). §Fix is constraint-pinned, not settled: it names three
  candidate check sites with their measured blast radii and the registry and
  GOV-15 constraints every route carries, and leaves the disposition to the
  change that lands it. Ordering: nothing blocks this report from starting;
  [0164](./0164-generic-argument-literal-lowers-permissive.md), residual 3 of
  the same fix, bounds one §Fix candidate while it is open (§Non-goals).
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) is in
  flight against the same `parseParams` per-field loop and the same
  `lowerTypeExpr` catch-all; whichever lands second rebases onto the other's
  hunks (§Fix *Ordering*). Sibling residual
  [0162](./0162-inline-enum-trigger-misses-params-position.md) is filed from the
  same fix in the same batch against a different row and shares no surface with
  this one.
- **Sev/Diff estimate:** S1/D3 — S1 because the load-time acceptance registers a
  theta whose every defaulted invocation carries a value its own lowered schema
  refuses, and the refusal the post-default-merge hook computes is discarded by
  its one caller (`#mergeDeclaredDefaults`, `src/extension/production-theta-producer.ts:1190–1191`),
  so the slash path spends a binder model call and then runs the body on the
  out-of-type value with no diagnostic on any surface — the 0052-A2 lateness
  precedent, one seam later; D3 because no check site exists at this position and
  each §Fix candidate either widens `annotationToCompatType`'s reach and the
  relation every other compatibility sink reads, or puts a literal evaluator and
  an AJV compile in the parse path, and the registry carries no row for the
  verdict.
- **Kind:** defect — the implementation does not perform a check the
  specification requires at a position the specification names. Three elements,
  each measured at HEAD `04c6585f`.
  1. *The check has no site.* `parseParams` (`src/parser/params.ts:132`) runs
     three per-field default checks and no fourth: the non-trailing-default
     ordering rule (`:244`), the raw-newline-in-string-span refusal (`:271`) and
     the literal-sublanguage form check (`:278`, `checkLiteralSublanguage`,
     `src/parser/literal-sublanguage.ts:53`). All three judge the default's
     *form*. None compares it to the declared type. The field is then dropped
     from `required` on the strength of `defaultSource` alone (`:214`) and the
     block lowers (`:293`).
  2. *The type layer never sees the default.* The parsed record
     `ParamsField` carries `{wireName, type, hasDefault, defaultSource,
     nullable}` — measured — and the type-layer walk receives from `params:`
     only the wire names, for binder-shadowing
     (`src/parser/type-layer-checks.ts:238`, `:505`). No `params:` type source
     and no `params:` default reaches `checkLetRhsCompat`
     (`src/parser/type-compat.ts:403`), the sink TYPE-9 installs for the
     `let x: T = expr` position.
  3. *The gap is position-general, not literal-specific.* Twelve
     declaration/default pairs over ten distinct declared-type shapes — literal
     union, single literal, `integer`, `string`, `number`, `boolean`,
     `array<string>`, an alias to a literal union, a named object schema and an
     inline object type — each carry a default the field's own lowered fragment
     refuses, and every one loads with zero diagnostics.
     `frontmatter-fields-a.md:60` names `theta/parse/integer-narrowing` for one
     of them by code; `p: 'integer = 1.5'` does not emit it.
- **Related:**
  - **0056** —
    [`0056-params-literal-sublanguage-absent-lowers-permissive.md`](./0056-params-literal-sublanguage-absent-lowers-permissive.md),
    **fixed (0.85.0)**, the filing origin. Its §Actual behaviour third sub-case
    (`:521–526`) states the observable and declines the boundary: "that check is
    the type layer's, and this report does not establish where it fails — only
    that the input is silent at HEAD". This report establishes it. Its
    `## Fix (0.85.0)` *Residuals* item 2 (`:1034–1042`) is the residual being
    filed and states what its own fix changed: the lowered fragment now
    enforces, so the incompatible default is refused at invocation where it was
    admitted before.
  - **0059** —
    [`0059-params-scalar-nontype-text-recorded-and-permissive.md`](./0059-params-scalar-nontype-text-recorded-and-permissive.md),
    **open, in flight in this batch**. **Boundary.** 0059 owns junk TEXT at the
    `params:` right-hand side — text no `Type` production spells, which reaches
    `lowerTypeExpr`'s catch-all and lowers the permissive `{}`. This report owns
    a declared type the grammar *does* admit and a default the literal
    sublanguage *does* admit, whose values are incompatible. The two classes are
    separated by one measured observable: 0059's class lowers `{}`
    (`p: 'lol wut'` and `p: 'lol wut = "x"'`, diags `[]`, `properties.p` `{}`),
    so nothing constrains the field and no default can ever be refused; this
    report's class lowers a constraining fragment
    (`p: '"x" | "y" = "zzz"'` → `{"type":"string","enum":["x","y"]}`) that
    refuses the recorded default. Junk text on the *default* side is neither
    report's: `p: 'string = not a literal'` already emits
    `theta/parse/default-not-literal` (`code-registry-parse.md:48`), measured.
  - **0041** —
    [`0041-params-block-mapping-rhs-silent-permissive.md`](./0041-params-block-mapping-rhs-silent-permissive.md),
    **fixed (0.51.0)**, the `params:` node-shape ancestor. Its fix installed
    `theta/load/params-type-not-expression` for a `params:` value node that is
    neither a scalar nor a flow mapping. Every fixture in this report is an
    admitted scalar and passes that gate before the question here arises.
  - **0102** —
    [`0102-params-default-string-literal-raw-newline-admitted.md`](./0102-params-default-string-literal-raw-newline-admitted.md),
    **fixed**, the sibling default-RHS rule and the owner of the second check in
    `parseParams`'s per-field default loop (`params.ts:264–283`). It establishes
    that the loop is the place a default-side rule lands, and its witness
    (`tests/params-default-string-literal-raw-newline.test.ts`) is one of the
    files a fix here re-reads.
  - **0031** —
    [`0031-ctor-field-value-typing-unchecked.md`](./0031-ctor-field-value-typing-unchecked.md),
    **fixed**, whose witness pins the `let`-position half of the same silence.
    Cells r5a/r5b (`tests/ctor-field-type-check.test.ts:304–305`, `:742–745`)
    assert that `S { k: "zzz" }` against `k: "a" | "b"` and
    `let k: "a" | "b" = "zzz"` both stay silent, and the cell title names the
    mechanism — "`annotationToCompatType` maps it to an unresolvable `named`".
    A route that makes a literal annotation decidable reds both cells; §Fix
    records it.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift. It is why
    §Affected names symbols beside lines: `src/parser/params.ts` is 1054 lines at
    this HEAD and both 0059's fix and any fix here insert into `parseParams`.
- **Affected** (every citation verified against the tree at HEAD `04c6585f`,
  v0.85.0; symbols named beside lines):
  - **The position with no check.** `parseParams` (`src/parser/params.ts:132`):
    the `required` decision keyed on `defaultSource` alone (`:214`), the
    non-trailing-default rule (`:235–251`), the per-field default loop
    (`:264–283`) with its raw-newline refusal (`:268–276`) and its
    `checkLiteralSublanguage` call (`:277–282`), the error gate (`:288–291`) and
    the lowered document (`:293–298`). The type source itself lowers through
    `lowerParamsFieldType` (`:871`). The split that produces the two halves is
    `splitParamValue` (`src/parser/frontmatter.ts:636`); the field record is
    built at `:787`.
  - **The form-only default checker.** `checkLiteralSublanguage`
    (`src/parser/literal-sublanguage.ts:53`) and `hasRawNewlineInStringLiteral`
    (`:605`). `parseExpressionSource`
    (`src/parser/theta-document.ts:1157`) already yields the default's AST with
    its value at load — measured: `"zzz"` →
    `{"kind":"string","value":"zzz",…}`, `{ a: 1 }` → an `object` node with a
    `number` field.
  - **The type-layer sink that exists, and its reach.** `checkLetRhsCompat`
    (`src/parser/type-compat.ts:403`), called from the walk's `let` arm
    (`src/parser/type-layer-checks.ts:970`), fed by `annotationToCompatType`
    (`:810`), `collectTypeEnv` (`:328`) and `StaticTypeInferencePass.typeOf`
    (`src/parser/static-type-inference.ts:182`). The relation is
    `checkCompatible` (`type-compat.ts:139`) over `CompatType`
    (`:55`), whose `literal` arm (`:57`) carries only `typesAs` — the primitive
    the value types as — and not the value.
  - **The three consumers of the lowered document.** All three compile
    `params.loweredSchema` through the root `SchemaValidator`
    (`src/seams/schema-validator.ts:104`):
    1. `ProductionThetaProducer.runBinder`
       (`src/extension/production-theta-producer.ts:671`) → the envelope build
       (`:725–728`) → `buildBinderEnvelopeSchema`
       (`src/binder/binder-envelope.ts:86`) and `relaxParamsSchema` (`:137`).
    2. `#mergeDeclaredDefaults` (`production-theta-producer.ts:1171`) → the
       compile (`:1189`) → `fillDefaultsAndRevalidate`
       (`src/binder/defaulting.ts:67`). Its one caller is `runBinder` (`:856`),
       which returns `{ bound: true, args: mergedArgs }` (`:862`).
    3. `#intakeSubagentRootParams` (`production-theta-producer.ts:1970`) → the
       lowered read (`:1984`) and the compile (`:1991`) inside the
       `ParamsSchemaValidator` handed to `intakeChildParams`
       (`src/runtime/subagent-params.ts:233`), whose refusal code is
       `SUBAGENT_PARAMS_VALIDATION_FAILED_CODE` (`:57`).
  - **Where the merge sits relative to the validation.**
    `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:67`) fills absent
    defaulted wire names first (`:77–82`) and validates the **merged** object
    after (`:86`), returning `{args, defaultedWireNames, validation}` (`:88`).
    `#mergeDeclaredDefaults` reads `result.args` and drops `result.validation`
    (`production-theta-producer.ts:1190–1191`); the in-tree comment states the
    intent (`:1183–1188`). `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:90`) then projects those args
    onto body scope with no further validation. The default's *value* is not
    retained by the parser and is recovered at invocation by
    `#recoverDeclaredDefaults` (`production-theta-producer.ts:1204`), which
    re-reads the `.theta` and evaluates the literal.
  - **The binder surfaces.** `binderPromptParamField`
    (`production-theta-producer.ts:619`) and `renderBinderParamLine`
    (`src/binder/binder-system-prompt.ts:168`).
  - **Spec.** `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`
    (§Defaults — the compatibility sentence, the admitted literal forms and the
    named narrowing code), `:57` (AJV at invocation time), `:58` (the type
    side), `:66`–`:68` (the example block's bare-object-literal, `Enum.Variant`
    and variant-schema defaults);
    `docs/spec_topics/type-system.md:27` (the `⊑` relation and its site list,
    which names "a frontmatter `params:` default"), `:29` (*Operational
    definition*), `:31` (*Structural cases*), `:36` (TYPE-2), `:37` (TYPE-3),
    `:39`–`:40` (TYPE-5 / TYPE-6), `:48` (*Unresolvable operands*), `:50`
    (TYPE-9), `:52` (TYPE-10), `:54` (TYPE-11);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:5` (the
    `post-default-merge-ajv-validation` anchor), `:7` ("the runtime fills the
    defaults before AJV validation"), `:11` (the named hook);
    `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` (the
    `Parameters:` block template), `:129` (*Type display*), `:142`
    (*Default-literal rendering*);
    `docs/spec_topics/diagnostics/code-registry-parse.md:24`
    (`theta/parse/integer-narrowing`), `:48` (`theta/parse/default-not-literal`),
    `:49` (`theta/parse/non-trailing-default`), `:54`
    (`theta/parse/let-rhs-type-mismatch`);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; 17 declare `params:`; every right-hand side is `string`, the named
    type `Author`, or `count: number = 3`. Exactly one committed default exists
    (`tests/live/acceptance/fixtures/acc-params-binder.theta`) and it is
    compatible. No committed fixture is in the affected class.
- **Observed at:** v0.85.0 (`04c6585f`). Offline, deterministic, provider-free:
  a scratch vitest probe over the shipped load path `parseThetaDocument` through
  `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the production `AjvSchemaValidator`
  (`src/seams/schema-validator.ts:104`), and the shipped
  `fillDefaultsAndRevalidate`, `buildBinderEnvelopeSchema`,
  `renderBinderParamLine`, `annotationToCompatType` and `checkCompatible` seams;
  written, run, deleted. Every value below is that run's output verbatim, over a
  tracked tree `git status --short --untracked-files=no` reported clean.

## Summary

`parseParams` judges a `params:` default's form and never its type.
`frontmatter-fields-a.md:60` requires the default literal's static type to be
compatible with the param's declared type per
`type-system.md#type-compatibility`, and names `theta/parse/integer-narrowing`
for the one-way numeric case. At HEAD no operand of that relation is computed at
this position: the declared type source is lowered to JSON Schema and discarded,
the default is parsed for form and retained as source text, and the field is
dropped from `required` on the strength of having a default at all.

Twelve declaration/default pairs, over ten distinct declared-type shapes, load
with zero diagnostics, record `defaultSource` verbatim, and lower a fragment
that refuses that same value. The gap is position-general: `p: 'integer = "nope"'`,
`p: 'string = 5'`, `p: 'string = null'`, `p: 'array<string> = [1, 2]'` and
`p: 'S = { a: 1 }'` are as silent as `p: '"x" | "y" = "zzz"'`.

Bug 0056 changed what happens next. Before 0.85.0 the literal-union rows lowered
`{"anyOf":[{},{}]}` and AJV admitted the impossible default too; after it they
lower `{"type":"string","enum":["x","y"]}` and AJV refuses it. What the refusal
buys depends on the consumer. On the slash path the runtime fills the default
into the binder-returned args and validates the merged object — the hook
`defaulting-system-note-echo.md:11` installs — and the verdict is `false`; its
one caller returns the merged args and drops the verdict, and the body runs on
the out-of-type value with no diagnostic, one binder model call in. On the
subagent child's params intake the same fragment refuses fail-closed. The load
accepts either way.

## Reproduction

Offline, deterministic, at HEAD `04c6585f`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`; a real
`AjvSchemaValidator` (`src/seams/schema-validator.ts:104`) constructed with the
production `slugOf`; and the shipped `fillDefaultsAndRevalidate`,
`buildBinderEnvelopeSchema` and `renderBinderParamLine`. Each fixture is a
two-line frontmatter `params:` block with one field `p`.

### (a) Load-time — every row silent

`diags` is the whole diagnostic list. `defaultedFields` is `["p"]` and
`hasDefault` is `true` in every row.

| `params:` right-hand side | `diags` | `defaultSource` | `required` | `properties.p` |
| --- | --- | --- | --- | --- |
| `"x" \| "y" = "zzz"` | `[]` | `"\"zzz\""` | `[]` | `{"type":"string","enum":["x","y"]}` |
| `"x" = "zzz"` | `[]` | `"\"zzz\""` | `[]` | `{"const":"x"}` |
| `integer = "nope"` | `[]` | `"\"nope\""` | `[]` | `{"type":"integer"}` |
| `string = 5` | `[]` | `"5"` | `[]` | `{"type":"string"}` |
| `integer = 1.5` | `[]` | `"1.5"` | `[]` | `{"type":"integer"}` |
| `number = "nope"` | `[]` | `"\"nope\""` | `[]` | `{"type":"number"}` |
| `boolean = "nope"` | `[]` | `"\"nope\""` | `[]` | `{"type":"boolean"}` |
| `string = null` | `[]` | `"null"` | `[]` | `{"type":"string"}` |
| `array<string> = [1, 2]` | `[]` | `"[1, 2]"` | `[]` | `{"type":"array","items":{"type":"string"}}` |
| `Sev = "zzz"` (+ `schema Sev = "x" \| "y"`) | `[]` | `"\"zzz\""` | `[]` | `{"$ref":"#/$defs/Sev"}` |
| `S = { a: 1 }` (+ `schema S { a: string }`) | `[]` | `"{ a: 1 }"` | `[]` | `{"$ref":"#/$defs/S"}` |
| `{m: "x" \| "y"} = { m: "zzz" }` | `[]` | `"{ m: \"zzz\" }"` | `[]` | `{"$ref":"#/$defs/__inline_cf9a345524fd2d87"}` |

A second field ahead of the defaulted one does not change the verdict:
`params: {a: string, p: '"x" | "y" = "zzz"'}` draws `[]` with `required: ["a"]`.

### (b) Real AJV over the lowered document

The same `AjvSchemaValidator` the runtime compiles with, over the document each
row lowered, given the value the recorded default denotes:

```
"x" | "y" = "zzz"          {"p":"zzz"}      -> false  must be equal to one of the allowed values
"x" = "zzz"                {"p":"zzz"}      -> false  must be equal to constant
integer = "nope"           {"p":"nope"}     -> false  must be integer
string = 5                 {"p":5}          -> false  must be string
integer = 1.5              {"p":1.5}        -> false  must be integer
number = "nope"            {"p":"nope"}     -> false  must be number
boolean = "nope"           {"p":"nope"}     -> false  must be boolean
string = null              {"p":null}       -> false  must be string
array<string> = [1, 2]     {"p":[1,2]}      -> false  must be string          (at /p/0)
Sev = "zzz"                {"p":"zzz"}      -> false  must be equal to one of the allowed values
S = { a: 1 }               {"p":{"a":1}}    -> false  must be string          (at /p/a)
{m: "x" | "y"} = {m:"zzz"} {"p":{"m":"zzz"}}-> false  must be equal to one of the allowed values
```

Every row also answers `true` for `{}`, because the defaulted field is out of
`required`. The bare lowered document therefore never sees the default; the
merge does.

Bug 0056's fix is what moved the first row. Its §Reproduction *Real AJV over the
lowered documents* table (`0056-…md:297`) records `{"p":"zzz"} -> true` pre-fix
(`:306`), against `{"anyOf":[{},{}]}`.

### (c) The post-default-merge seam, driven offline

`fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:67`) — the hook
`defaulting-system-note-echo.md:11` names — with `binderArgs: {}` (the binder
omitted the defaulted field, which its system prompt permits) and the recovered
default value:

```
"x" | "y" = "zzz"   merged {"p":"zzz"}  filled ["p"]  validation.ok false
                    /p  #/properties/p/enum  enum  must be equal to one of the allowed values
                        allowedValues ["x","y"]
integer = "nope"    merged {"p":"nope"} filled ["p"]  validation.ok false
                    /p  #/properties/p/type  type  must be integer
Sev = "zzz"         merged {"p":"zzz"}  filled ["p"]  validation.ok false
                    /p  #/$defs/Sev/enum  enum  must be equal to one of the allowed values
"x" | "y" = "x"     merged {"p":"x"}    filled ["p"]  validation.ok true
```

Every incompatible row in (a) returns `validation.ok false`; every control in
(e) returns `true`.

**What the invocation observes.** The seam above is measured. Its one caller is
traced, not driven: `#mergeDeclaredDefaults`
(`production-theta-producer.ts:1171`) returns `result.args` and does not read
`result.validation` (`:1190–1191`); `runBinder` assigns that to `mergedArgs`
(`:856`) and returns `{ bound: true, args: mergedArgs }` (`:862`);
`paramBindingsFrom` (`theta-composition-producer.ts:90`) copies each entry into
body scope. No re-validation stands between them. A slash invocation that omits
the field therefore binds `p = "zzz"` and runs the body, after the binder model
call the `binder` classification requires.

### (d) The binder surfaces

```
"x" | "y" = "zzz"    Parameters: line   ::   p ("x" | "y") default="zzz"
                     classifyBinderBypass :: binder
                     envelope anyOf[0].properties.args.properties.p
                                        :: {"type":"string","enum":["x","y"]}
                     envelope anyOf[0].properties.args.required :: []
                     envelope accepts {"kind":"ok","args":{"p":"zzz"}} :: false
                     envelope accepts {"kind":"ok","args":{}}          :: true
integer = "nope"     Parameters: line   ::   p (integer) default="nope"
                     envelope accepts {"kind":"ok","args":{"p":"nope"}} :: false
string = 5           Parameters: line   ::   p (string) default=5
array<string>=[1, 2] Parameters: line   ::   p (array<string>) default=[1, 2]
S = { a: 1 }         Parameters: line   ::   p (S) default={ a: 1 }
```

The rendered line is what `binder-bypass-and-envelope.md:117` requires and
`:129` / `:142` govern: the declared Theta type verbatim, and the default RHS
verbatim. The binder is grounded in a default the envelope it is constrained by
would refuse if it echoed it.

### (e) Controls — silent and valid

```
string = "ok"           diags []   AJV {"p":"ok"} -> true
number = 3              diags []   AJV {"p":3}    -> true
integer = 3             diags []   AJV {"p":3}    -> true
array<string> = []      diags []   AJV {"p":[]}   -> true
"x" | "y" = "x"         diags []   AJV {"p":"x"}  -> true
"x" | "y" = "y"         diags []   AJV {"p":"y"}  -> true
```

`number = 3` is the shape the one committed default uses
(`tests/live/acceptance/fixtures/acc-params-binder.theta`) and the shape
`frontmatter-fields-a.md:60` names as admissible ("an `integer` literal is
admissible for a `number` param").

### (f) The `let`-annotation contrast

Every §Reproduction (a) shape the `let` position can express, plus two further
literal-annotation probes, at the one position that has a compatibility sink.
The bare-object-literal rows are absent because the `let` position refuses that
spelling outright (`theta/parse/bare-object-literal`, measured):

```
let p: integer = "nope"        theta/parse/let-rhs-type-mismatch
let p: string = 5              theta/parse/let-rhs-type-mismatch
let p: number = "nope"         theta/parse/let-rhs-type-mismatch
let p: boolean = "nope"        theta/parse/let-rhs-type-mismatch
let p: string = null           theta/parse/let-rhs-type-mismatch
let p: array<string> = [1, 2]  theta/parse/let-rhs-type-mismatch + array-element-type-mismatch
let p: integer = 1.5           theta/parse/integer-narrowing
let p: "x" | "y" = "zzz"       []
let p: "x" = "zzz"             []
let p: "x" | "y" = 7           []
let p: Sev = "zzz"             []                (schema Sev = "x" | "y")
```

The sink fires for the primitive and `array<T>` annotations and is silent for
the literal and alias-to-literal annotations. The mechanism is
`annotationToCompatType` (`type-layer-checks.ts:810`), measured directly:

```
"x" | "y"       -> {"kind":"union","arms":[{"kind":"named","name":"\"x\""},
                                           {"kind":"named","name":"\"y\""}]}
"x"             -> {"kind":"named","name":"\"x\""}
{m: string}     -> {"kind":"named","name":"{m: string}"}
integer         -> {"kind":"prim","name":"integer"}
array<string>   -> {"kind":"array","element":{"kind":"prim","name":"string"}}
string | null   -> {"kind":"union","arms":[{"kind":"prim","name":"string"},
                                           {"kind":"prim","name":"null"}]}
```

A literal type source and an inline object type source both become an
unresolvable `named`, and `checkCompatible` (`type-compat.ts:139`) answers
`"unknown"` over them — the *Unresolvable operands* deferral
(`type-system.md:48`) that `checkLetRhsCompat` treats as "the runtime AJV check
is the safety net":

```
literal(string) ⊑ annotationToCompatType('"x" | "y"')   -> unknown
literal(string) ⊑ annotationToCompatType('"x"')         -> unknown
literal(string) ⊑ annotationToCompatType('{m: string}') -> unknown
literal(string) ⊑ annotationToCompatType('Sev')         -> unknown   (alias → the union above)
literal(string) ⊑ annotationToCompatType('integer')     -> incompatible
literal(integer)⊑ annotationToCompatType('string')      -> incompatible
literal(null)   ⊑ annotationToCompatType('string')      -> incompatible
literal(number) ⊑ annotationToCompatType('integer')     -> integer-narrowing
literal(string) ⊑ annotationToCompatType('array<string>')-> incompatible
```

A second, independent obstacle sits behind the first: `CompatType`'s `literal`
arm carries `typesAs` and not the value (`type-compat.ts:57`), so even given a
literal-typed annotation the relation admits every literal of the right
primitive — measured directly on `checkCompatible`, `literal(string)` is
`compatible` against both `literal(string)` and a union of two `literal(string)`
arms.

### (g) The boundary against bug 0059

```
p: 'lol wut'            diags []  type "lol wut"     default —          properties.p {}
p: 'lol wut = "x"'      diags []  type "lol wut"     default "\"x\""    properties.p {}
p: 'string = not a literal'  diags ["theta/parse/default-not-literal"]  (no lowering)
p: '"x" | "y" = "zzz"'  diags []  type "\"x\" | \"y\""  default "\"zzz\""
                                  properties.p {"type":"string","enum":["x","y"]}
```

Junk text in the type half lowers `{}` — 0059's class, where no default can be
refused because nothing constrains the field. Junk text in the default half
already emits `theta/parse/default-not-literal`. This report's class is the
remaining cell: both halves admitted, the fragment constraining, the values
incompatible.

## Expected behaviour

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults) — "The
  default literal's static type must be compatible with the param's declared
  type per [Type System — Type compatibility](../type-system.md#type-compatibility)
  (e.g. an `integer` literal is admissible for a `number` param; the reverse is
  `theta/parse/integer-narrowing`)." The sentence is a requirement on the
  declaration, not on the invocation, and it names a registered code for one of
  its cases. `p: 'integer = 1.5'` is that case and emits nothing.
- `docs/spec_topics/type-system.md:27` enumerates the sites the single relation
  `T₁ ⊑ T₂` governs and names "a frontmatter `params:` default" among them, on
  the same footing as the typed-`let` RHS and the function-argument slot. `:31`
  (*Structural cases*) closes the list for V1 and says anything outside it that
  the parser cannot decide statically "is reported as a type mismatch … unless
  the position is one where a runtime AJV check is documented as the safety
  net". No spec text documents a runtime safety net for a `params:` default; the
  net `:48` documents is for operands "past the parser's static view", and a
  default literal beside a declared type is not.
- The relation's own rules name eleven of the twelve rows of §Reproduction (a):
  TYPE-3 (`:37`) types `"nope"` as `string` and refuses it against `integer`;
  TYPE-2 (`:36`) makes `1.5 ⊑ integer` the narrowing case; TYPE-5 / TYPE-6
  (`:39`–`:40`) reduce `"zzz" ⊑ "x" | "y"` to `"zzz" ⊑ "x"` and `"zzz" ⊑ "y"`,
  neither of which any rule admits; TYPE-11 (`:54`) unfolds `Sev` to its literal
  union, and its own worked example is this shape in the positive direction
  (`"low" ⊑ Severity`); TYPE-7 and TYPE-8 handle the `array<T>` and
  inline-object rows. The twelfth (`S = { a: 1 }`, a bare object literal against
  a named object schema) is the one row where TYPE-10's nominal rule (`:52`) and
  §Defaults' "the param's declared type supplies the schema" (`:60`) have to be
  reconciled before the verdict follows; §Fix (a) holds that constraint.
- `docs/spec_topics/type-system.md:29` (*Operational definition*) fixes the
  direction of the AJV reading: "Whenever `T₁ ⊑ T₂` holds, every value
  statically typed as `T₁` AJV-validates against the lowering of `T₂`". Its
  contrapositive is what §Reproduction (b) measures — a default the lowering
  refuses is a default the relation does not admit — so the twelve rows are
  `⋢` by the spec's own operational reading, independently of which rule names
  them.
- `docs/spec_topics/binder/defaulting-system-note-echo.md:7` — "the runtime
  fills the defaults before AJV validation". A default that cannot survive that
  validation makes every invocation that omits the field fail it, which is a
  property of the declaration and is decidable where the declaration is read.
- `docs/spec_topics/binder/binder-bypass-and-envelope.md:129` (*Type display*)
  and `:142` (*Default-literal rendering*) require the `Parameters:` line to
  carry the declared type and the default verbatim. A line reading
  `p ("x" | "y") default="zzz"` is a correct rendering of a declaration that
  should not have loaded.

## Actual behaviour / root cause

The check has no site, and no site has the operands.

`parseParams` (`src/parser/params.ts:132`) walks the fields three times after
lowering. The first walk lowers each field's type through `lowerParamsFieldType`
(`:871`) into `properties`, reports whatever the lowering could not resolve, and
decides `required` from the presence of a default and nothing else:

```ts
    if (field.defaultSource === undefined) {
      required.push(field.name);
    }
```

The second walk is the ordering rule (`:235–251`). The third is the per-field
default loop (`:264–283`), and it is the only place a default is examined:

```ts
  for (const field of fields) {
    if (field.defaultSource === undefined) {
      continue;
    }
    if (hasRawNewlineInStringLiteral(field.defaultSource)) { … }
    diagnostics.push(
      ...checkLiteralSublanguage(field.defaultSource, "default", { … }),
    );
  }
```

`hasRawNewlineInStringLiteral` judges a span; `checkLiteralSublanguage` judges
membership in the literal sublanguage. Neither reads `field.typeSource`, and
nothing else in the function pairs the two halves `splitParamValue`
(`src/parser/frontmatter.ts:636`) separated. The lowered type is written into
`properties` and the default is retained as source text, and the two never meet.

The type layer is not a fallback, because it never receives either half.
`TypeLayerWalk` takes `paramsFieldNames` only — the wire names, for the
binder-shadowing classes (`src/parser/type-layer-checks.ts:238`, `:505`) — and
the parsed record it could read from carries no more than the source text:

```
[{"wireName":"p","type":"integer","hasDefault":true,
  "defaultSource":"\"nope\"","nullable":false}]
```

So the sink TYPE-9 installs for the `let` position (`checkLetRhsCompat`,
`src/parser/type-compat.ts:403`) is never called for a `params:` default. Even
where it is called, its reach stops short of half this report's rows: a literal
type source and an inline object type source both leave
`annotationToCompatType` (`type-layer-checks.ts:810`) as an unresolvable
`named`, `checkCompatible` answers `"unknown"` over them, and
`checkLetRhsCompat` returns no diagnostic on `"unknown"` by design — the
*Unresolvable operands* deferral (`type-system.md:48`). Behind that,
`CompatType`'s `literal` arm records only `typesAs` (`type-compat.ts:57`), so
the value that distinguishes `"x"` from `"zzz"` is not in the model at all.
Bug 0031's witness pins both facts as the current state
(`tests/ctor-field-type-check.test.ts:742–745`).

What bug 0056 changed is downstream of all of this. Before 0.85.0 the
literal-union rows lowered `{"anyOf":[{},{}]}`, which admits every JSON value,
so the incompatible default was invisible at load *and* at invocation. After it
they lower `{"type":"string","enum":["x","y"]}`, so the three consumers of the
lowered document begin to disagree with the declaration:

- **The binder envelope** (`runBinder` → `buildBinderEnvelopeSchema`,
  `production-theta-producer.ts:725`; `binder-envelope.ts:86`).
  `relaxParamsSchema` (`:137`) removes the defaulted field from `required` and
  leaves its type unchanged, so the envelope refuses
  `{"kind":"ok","args":{"p":"zzz"}}` and accepts `{"kind":"ok","args":{}}` —
  measured. The binder is grounded in `p ("x" | "y") default="zzz"` and
  constrained by a schema that would refuse the value that line advertises.
- **The post-default-merge validation** (`#mergeDeclaredDefaults`,
  `production-theta-producer.ts:1171`). It fills the default and validates the
  merged object through `fillDefaultsAndRevalidate`
  (`src/binder/defaulting.ts:67`, fill `:77–82`, validate `:86`) — verdict
  `false`, measured — and then:

  ```ts
    const result = fillDefaultsAndRevalidate({ binderArgs, defaults, validator });
    return result.args;
  ```

  The verdict is not returned. `runBinder` reports `bound: true` (`:862`) and
  `paramBindingsFrom` (`theta-composition-producer.ts:90`) installs the merged
  args into body scope unexamined.
- **The subagent child's params intake** (`#intakeSubagentRootParams`,
  `production-theta-producer.ts:1970`). Here the same compile
  (`:1991`) drives `intakeChildParams`
  (`src/runtime/subagent-params.ts:233`), whose refusal is fail-closed:
  `theta/runtime/subagent-params-validation-failed` (`:57`) and
  `Err(InvokeInfraError { cause: "validation" })` to an `invoke` parent.

Everything each consumer does with the fragment is correct. The fragment is
correct. The declaration that produced both is the thing nothing checked.

## Why it matters

- **The theta registers and the body runs on a value its own schema refuses.**
  The slash path is measured through the seam and traced through its caller: the
  default is filled, the post-default-merge validation returns `false`, and the
  verdict is discarded one line later. A `params:` field declared `"x" | "y"`
  binds `"zzz"` in body scope, and every downstream read of it — a `match` over
  the two arms, a string comparison, an interpolation into a query — proceeds on
  a value the declaration excludes.
- **The cost is paid before the failure could be reported.** Reaching
  `#mergeDeclaredDefaults` requires the `binder` classification, which a
  defaulted field forces (`classifyBinderBypass` returns `binder` for every row
  in §Reproduction (d), measured). The binder model call has been spent by the
  time the default is filled. This is the 0052-A2 shape — the throw at
  `AjvSchemaValidator.compile` "after the query turn has been spent"
  (`0052-…md:417`) — one seam later and without the throw.
- **The same declaration fails loudly on the other consumer.** An `invoke(...)`
  of a subagent-mode callee marshals its params to the child, which validates
  them against the identical fragment and refuses fail-closed. One declaration,
  two consumers, opposite dispositions, and neither is the load.
- **The binder is grounded in the impossible value.** `binderPromptParamField`
  (`production-theta-producer.ts:619`) turns `defaultSource` into the
  requirement token and `renderBinderParamLine`
  (`binder-system-prompt.ts:168`) renders `p ("x" | "y") default="zzz"`. That is
  exactly what `binder-bypass-and-envelope.md:142` requires. The model is told
  the field defaults to a value the envelope schema in the same request refuses.
- **The spec names a code for one of these rows and it never fires.**
  `frontmatter-fields-a.md:60` cites `theta/parse/integer-narrowing` for the
  `number`-literal-under-`integer` case at this position. The registry row
  (`code-registry-parse.md:24`) states the trigger position-neutrally.
  `p: 'integer = 1.5'` is silent; `let p: integer = 1.5` emits it.
- **Two spellings of one declaration behave differently with no signal.**
  `p: '"x" | "y" = "zzz"'` loads and binds; `let p: "x" | "y" = "zzz"` also
  loads, and `let p: integer = "nope"` does not. Which of an author's
  type/value pairs is checked depends on which position it is written in, and
  nothing at either position says so.
- **The gap is not confined to the shapes bug 0056 moved.** `integer = "nope"`,
  `string = 5`, `string = null`, `array<string> = [1, 2]` and `S = { a: 1 }`
  were all silent before 0.85.0 and are silent after it. 0056's fix changed
  which rows AJV catches downstream, not which rows load.
- **No gate scores it.** The census in §Affected finds one committed default in
  the whole corpus (`count: number = 3`), and it is compatible, so
  `tests/committed-fixture-parse-gate.test.ts` never meets an incompatible one.
  0102's witness declares defaults at this position but pins form, not type.

## Fix

Not settled. Three candidate check sites are pinned below with their measured
blast radii; the run selects one and states the evidence that decided it. Every
route carries the registry and GOV-15 constraints in (d) and the ordering note
in (e).

### (a) Compute the relation at the `params:` default, reusing the type layer's sink

Give `parseParams`'s per-field default loop (`src/parser/params.ts:264–283`) the
three operands `checkLetRhsCompat` (`src/parser/type-compat.ts:403`) takes:
`annotationToCompatType(field.typeSource)`
(`src/parser/type-layer-checks.ts:810`), `collectTypeEnv(body.statements)`
(`:328`), and the default's static type from its already-parsed AST
(`parseExpressionSource`, `src/parser/theta-document.ts:1157`, which the
sublanguage check at `params.ts:278` already runs the RHS through).

- **It decides seven of the twelve rows unchanged** — measured on
  `checkCompatible` over exactly the `CompatType` values
  `annotationToCompatType` produces: `integer = "nope"`, `string = 5`,
  `number = "nope"`, `boolean = "nope"`, `string = null` and
  `array<string> = [1, 2]` as `incompatible`, and `integer = 1.5` as
  `integer-narrowing` — which is the verdict `frontmatter-fields-a.md:60`
  already names by code for this position.
- **It decides none of the literal, alias-to-literal or inline-object rows.**
  `annotationToCompatType` maps `"x" | "y"`, `"x"` and `{m: string}` to
  unresolvable `named` shapes and `checkCompatible` answers `"unknown"`
  (§Reproduction (f)). Closing those rows requires `annotationToCompatType` to
  produce a literal `CompatType` and `CompatType`'s `literal` arm
  (`type-compat.ts:57`) to carry the value rather than only `typesAs`. Both
  changes are read by **every** site that consults the relation — the typed
  `let`, the `fn` argument slot, the `invoke` argument and return checks, the
  array element sink, the `match`-arm and ternary common type, and the
  schema-constructor field check — so the route either stops at the seven rows
  and says so, or widens the relation and disposes of that blast radius.
- **It must not refuse the spec's own example.** TYPE-10 (`type-system.md:52`)
  makes an object-schema `NamedType` nominal and states that "an inline-object
  value is **not** `⊑` a named schema with the same field shape". The `params:`
  default position admits exactly that pair by name: `frontmatter-fields-a.md:60`
  lists "bare-key object literals (the param's declared type supplies the
  schema)" among the admitted forms, and the example block at `:66` writes
  `author: Author = { name: "anon", role: "developer", experience_years: 0 }`.
  The relation applied unmodified refuses that declaration. The twelfth row
  (`S = { a: 1 }`) sits in the same cell and was not measured through the
  relation. A route here states how the bare-object-literal default, the
  `Enum.Variant` default (`:67`) and the variant-schema default (`:68`) are
  typed before `⊑` is asked.
- **Widening reds a committed pin that asserts the silence deliberately.**
  `tests/ctor-field-type-check.test.ts` cells r5a/r5b (`:304–305`, `:742–745`)
  assert that `S { k: "zzz" }` against `k: "a" | "b"` and
  `let k: "a" | "b" = "zzz"` both stay silent, and the cell title names the
  mechanism this route would change. Those cells are bug 0031's, and moving them
  is a change to that report's settled contract, not a re-pin.
- **The declared type must resolve whole-file.** `frontmatter-fields-a.md:58`
  makes a `params:` `NamedType` resolve against body-level declarations,
  including forward references. `parseParams` already receives the body type map
  for lowering; the route establishes that `collectTypeEnv`'s input is available
  at the same point, or states which resolutions it defers.

### (b) Validate the evaluated default against the field's own lowered fragment at load

The fragment is built inside `parseParams` before `loweredSchema` is assembled
(`:293`), and the default's AST is parsed a few lines earlier.

- **It decides every row.** Measured: all twelve incompatible rows return
  `false` and all six controls return `true` under the production
  `AjvSchemaValidator` (§Reproduction (b), (e)).
- **It needs the default's value, which the parser does not retain.** The field
  record carries `defaultSource` only, and the runtime recovers the value at
  invocation by re-reading the file and evaluating the literal against a
  body-bound environment (`#recoverDeclaredDefaults`,
  `production-theta-producer.ts:1204`). A load-time route either lifts that
  evaluation into the parse path or bounds itself to the literal forms whose
  value is readable off the AST directly.
- **AJV is necessary and not sufficient, by the spec's own reading.**
  `type-system.md:29` states it, and TYPE-10's nominal pairs (`:52`) are the counterexample:
  two lowered fragments can be AJV-interchangeable while `⋢`. A route here
  states how an AJV verdict stays inside `⊑` — for example by using it only to
  *refuse*, never to admit, which is the direction `:29` licenses.
- **It puts a schema compile in the parse path.** `parseParams` is called on
  every discovered theta at `session_start`; the route states the cost or scopes
  the compile to fields that declare a default.

### (c) Route the verdict the invocation-time hook already computes

`fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:67`) returns
`validation`, and `#mergeDeclaredDefaults` (`production-theta-producer.ts:1190–1191`)
drops it.

- **It closes nothing this report is about.** The requirement in
  `frontmatter-fields-a.md:60` is on the declaration; a runtime route leaves
  every fixture in §Reproduction (a) loading. It converts a silent bad bind into
  a per-invocation failure after the binder model call.
- **It is a routing decision another owner may hold.** The in-tree comment
  (`:1183–1188`) states the verdict "routes, on failure, to the AJV-on-`args`
  retry class owned elsewhere in the runtime", and
  `defaulting-system-note-echo.md:11` names that classification. Whether the
  hook's verdict reaching nothing is itself a defect is outside this report;
  §Non-goals holds it.
- **It is compatible with (a) or (b)** and would be the residual net for the
  rows a bounded static route leaves undecided.

### (d) Constraints every route carries

1. **The registry has no row for the verdict.** `theta/parse/integer-narrowing`
   (`code-registry-parse.md:24`) covers one case and its trigger is
   position-neutral, so a route emitting it here adds inputs to an existing
   emission set. For the rest, TYPE-9 (`type-system.md:50`) enumerates three
   sites and does not name the `params:` default, and
   `theta/parse/let-rhs-type-mismatch` (`code-registry-parse.md:54`) registers a
   trigger naming `let x: T = expr` only. A route either registers a new row or
   rewrites that trigger; both are DIAG-2 spec changes landing in the same
   commit as the code (`diagnostic-shape.md:72`). The *Message* column does not
   move (DIAG-4, `:74`), so a reused code keeps its registered string.
2. **GOV-15.** Every fixture in §Reproduction (a) loads cleanly at HEAD and
   would stop loading. That is the diagnostic-registry carve-out's addition
   direction (`source-language-stability.md:25`), admissible within a 1.x minor
   for the inputs newly brought into the emission set; the fix enumerates that
   input set rather than leaving it to be discovered. The census in §Affected
   found no committed fixture in it.
3. **The three consumers do not move.** No route changes what
   `buildBinderEnvelopeSchema`, `fillDefaultsAndRevalidate` or
   `intakeChildParams` do with a fragment; a refused declaration produces no
   `loweredSchema` at all, because `parseParams`'s error gate (`:288–291`)
   already withholds it on any error-severity diagnostic.
4. **The controls stay silent.** §Reproduction (e)'s six rows, and the one
   committed default `count: number = 3`, keep loading with zero diagnostics.
   `integer ⊑ number` is the widening `frontmatter-fields-a.md:60` names as
   admissible and TYPE-2 (`type-system.md:36`) makes one-way.
5. **Test witness — unit, offline, no live provider.** Every fixture here is a
   `parseDoc` call plus a real `AjvSchemaValidator` compile. Required beyond the
   probes: the twelve-row refusal table with each row's emitted code; the
   six-row silent-control table; the `let`-position contrast for the same pairs,
   proving the two positions agree after the fix on whichever rows the route
   decides; the post-default-merge seam over a row the route leaves undecided,
   if any; and the binder `Parameters:` line and envelope shape for a defaulted
   field, since both read `defaultSource`.

### (e) Ordering

Nothing blocks this report from starting.
[0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) is in
flight against `parseParams`'s per-field loop and `lowerTypeExpr`'s catch-all —
the same function routes (a) and (b) insert into. The two classes are disjoint
(§Related, and §Reproduction (g) measures the separation), so neither fix
changes the other's verdicts; whichever lands second rebases onto the other's
hunks. If 0059 lands first, its refusal of junk type text removes the
`properties.p == {}` rows from this report's neighbourhood without touching any
row in §Reproduction (a).

## Non-goals

- **Junk text at either half.** Text no `Type` production spells is
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s class;
  text outside the literal sublanguage on the default RHS already emits
  `theta/parse/default-not-literal`. This report owns the cell where both halves
  are admitted and their values are incompatible.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments is
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s inventory
  question, and a `params:` field lowering `{}` cannot exhibit this report's
  defect at all.
- **The post-default-merge verdict's routing.** That
  `#mergeDeclaredDefaults` discards a `false` verdict is measured and cited here
  as what an invocation observes; changing it is candidate (c) and, on its own,
  a runtime-routing question this report does not settle.
- **The `invoke(...)` path's own defaulting.** An omitted positional argument at
  the invoke path is marshalled as `null`
  (`production-theta-producer.ts:3220–3222`), not as the declared default; that
  is a separate question about where defaults apply and is not this report's
  subject.
- **The `let` position's silence for literal annotations.** Measured in
  §Reproduction (f) and pinned as deliberate by bug 0031's witness
  (`tests/ctor-field-type-check.test.ts:742–745`). It is recorded here because
  it bounds candidate (a)'s reach, not because this report asks for it to
  change.
- **`array<"x" | "y">`'s permissive element.** Residual 3 of the same fix, filed
  in this batch as
  [0164](./0164-generic-argument-literal-lowers-permissive.md). A default against
  that shape is undecidable by candidate (b) while that report is open, because
  the element lowers `{"anyOf":[{},{}]}` and admits every value, so no AJV
  verdict separates an in-set element from an out-of-set one.
- **The `theta/parse/inline-enum` trigger gap at this position.** Residual 1 of
  the same fix, filed in this batch as
  [0162](./0162-inline-enum-trigger-misses-params-position.md). Disjoint
  surface.

## Provenance

Filed as residual 2 of the bug 0056 fix (0.85.0, commit `81600080`). That fix's
report (`.pi/tmp/fixes/0056-report.md` §Residuals item 2) records the load-time
silence and the post-fix invocation-time enforcement; the same disposition is in
the doc at
[`0056-…md`](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
`## Fix (0.85.0)` *Residuals* item 2 (`:1034–1042`). The residual originates in
that report's §Actual behaviour (`:521–526`), which states the observable and
explicitly declines to establish where the check fails.

Independently re-derived at HEAD `04c6585f` for this filing, not copied: five
scratch vitest probes over `parseDoc`, the production `AjvSchemaValidator`,
`fillDefaultsAndRevalidate`, `buildBinderEnvelopeSchema`,
`renderBinderParamLine`, `classifyBinderBypass`, `annotationToCompatType` and
`checkCompatible`, covering every row of §Reproduction (a)–(g), run and then
deleted. The corpus census in §Affected was re-run over `git ls-files`. Every
`src/`, `tests/`, spec and bug-doc citation above was verified against the tree
at HEAD.

Two items were traced rather than driven, and are marked as such in the text:
the caller chain from `#mergeDeclaredDefaults` through `runBinder` to
`paramBindingsFrom` (driving it needs a binder model call), and the subagent
child's params intake. The seam each of them consumes —
`fillDefaultsAndRevalidate` and the compiled validator over the same lowered
document — was measured directly.

The 0056-era anchor for the compatibility sentence was `frontmatter-fields-a.md:60`
and it resolves at this HEAD unchanged; the sentence is inside the §Defaults
bullet of the `params:` entry. Two 0056 citations that this report re-anchors
rather than repeats: `parseLiteralArm` and the literal sublanguage now live in
`src/parser/params.ts`, and `lowerParamsFieldType` is `:871` at this HEAD, not
the `:606–615` that report's §Actual behaviour cites at `52e257bc`.

A concurrent sibling filing's uncommitted prototype in `src/parser/params.ts`
was present in the working tree during an earlier measurement pass; it adds a
diagnostic on `lowerTypeExpr`'s permissive `{}` catch-all, which contaminated
the §Reproduction (g) rows only. Every value in this report comes from a later
pass over a tree `git status --short --untracked-files=no` reported clean at
`04c6585f`, and the two passes produced byte-identical output on every row
outside (g). No file outside `docs/bugs/` was read as evidence in a modified
state.
