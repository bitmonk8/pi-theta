# Bug 0245 — A `schema` object body that reaches end of input with at least one field captured draws ZERO diagnostics: `parseSchemaObjectBody`'s `atEnd()` break returns the captured prefix with no emission, so `schema S { a: string,` at EOF loads clean, registers, and lowers `S` to a real object schema — and when the truncation falls inside a nested inline object type (`b: {c: integer,`) the declared field `c` is dropped and `b` lowers to the permissive `{}` fragment that the same spelling written out (`b: {}`) is refused for

- **Status:** open
- **Sev/Diff estimate:** S1/D2 — a truncated source registers as a valid theta
  and the nested case ships a lowered property that accepts any JSON value where
  the source declares an object with one required integer field, so a model
  response the author's schema would reject validates; D2 because the emission
  point is one loop exit in one function but the disposition (which code, and
  whether the sibling `enum` loop and the `atEnd()` break with an EMPTY prefix
  are covered) is a registry decision with no existing row.
- **Kind:** defect — a structurally malformed source inside GOV-15's
  loads-cleanly set, plus a lowered artefact that does not correspond to the
  source. Two elements, both measured at HEAD.
  1. *No diagnostic for an unclosed body.* `SchemaShape ::= "{" Field ("," Field)*
     ","? "}"` (`docs/spec_topics/grammar.md:172`) makes the closing `}`
     mandatory. `parseSchemaObjectBody` (`src/parser/theta-document.ts:3007`)
     leaves its field loop through three exits: the `}` (`:3020–3023`), one of
     the three recovery arms via `recoverMalformedSchemaField` (`:3184`), or
     `if (this.atEnd()) break` (`:3017–3019`). The `atEnd()` exit pushes no
     diagnostic and returns the captured field array, so the declaration takes
     `finishObjectSchema`'s non-`null` path (`:2835`) and is indistinguishable
     from a closed body. No registry row describes the input:
     `theta/parse/empty-schema-body`
     (`docs/spec_topics/diagnostics/code-registry-parse.md:98`) requires a shape
     yielding no usable content, `theta/parse/malformed-schema-field` (`:99`)
     requires "a token from which no further `Field` derives" and there is no
     such token at EOF, and `theta/parse/fn-param-list-unclosed` (`:24`) is
     fenced in its own *Trigger* — "Scoped to `fn` parameter lists alone; no
     other unbalanced bracket is judged by this row."
  2. *The nested case lowers a shape the source does not spell.* For
     `schema S { a: string, b: {c: integer,` the field-type capture records the
     unterminated text `{c: integer,`, and `buildBodyTypeSchemas`
     (`src/parser/body-type-lowering.ts:428`) lowers property `b` to `{}` —
     measured. The closed twin `b: {c: integer}` lowers to a `$ref` into a
     `$defs` fragment with `properties.c` and `required: ["c"]`. `{}` is the
     JSON Schema that accepts every value, and the same fragment written
     explicitly (`b: {}`) is refused at `E` with
     `theta/parse/empty-schema-body`, which
     `docs/spec_topics/schemas.md:19` justifies precisely because the empty
     shape "would silently accept every object". Here it is produced with no
     diagnostic and the theta registers.
- **Related:**
  - [0133](./0133-field-list-discard-recovery-unsettled.md) — **fixed
    (0.203.0)**, the report that found and recorded this input. Its §Fix record
    residual 2 reads: "An unclosed body at end of input, after a trailing
    comma, loads clean. Measured during review: `schema S { a: string,` at EOF
    draws ZERO diagnostics — the field loop's `atEnd()` break returns the
    captured fields with no emission. Byte-identical at HEAD `f5d0d125`,
    outside all three recovery arms, and therefore outside this fix; adjacent to
    residual 1 and worth its own filing." This report is that filing. 0133 owns
    the three recovery arms and `recoverMalformedSchemaField`; this report owns
    the fourth exit, which no arm reaches. 0133's residual 1 — an unbalanced
    body consuming the file remainder through `skipBraceRemainder`
    (`src/parser/theta-document.ts:3149`) — is adjacent and stays 0133's:
    it is pinned as today's behaviour by that report's witness cells 0g
    (`tests/schema-field-discard-prefix-retention.test.ts:527`), 8b (`:1045`)
    and 8c (`:1060`), each of which drives an unbalanced body that DOES carry an
    offending token and DOES draw `malformed-schema-field`. None of them reaches
    the `atEnd()` exit. 0133's residual 3 (`schema S { a: string, b as` at EOF,
    a zero-width anchor) is inside `malformed-schema-field`'s *Trigger* and is
    not this report's subject.
  - [0151](./0151-unclosed-fn-parameter-list-accepted.md) — **fixed (0.163.0)**,
    the same structural shape one declaration form over: an `fn` parameter list
    that is never closed. Its fix minted
    `theta/parse/fn-param-list-unclosed`, whose *Trigger* names the EOF exit
    explicitly ("the parameter loop reaches EOF") and states the containment and
    the non-registration. Measured at HEAD, `fn f(a: string,` at EOF draws that
    code; the byte-analogous `schema S { a: string,` draws nothing. The row's
    own scoping sentence says why the code does not extend here.
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) —
    **fixed (0.74.0)**. Its §Non-goals fenced "the tolerant recoveries
    themselves"; 0133 discharged that fence for the three discard arms. Neither
    report dispositions the `atEnd()` exit, which discards nothing and recovers
    nothing.
  - [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) — the
    owner of `theta/parse/schema-type-not-expression`
    (`code-registry-parse.md:105`), the code that DOES fire on the neighbouring
    truncations `b:` and `b: array<integer` (measured below). It is the reason
    the silent class is narrow: a body truncated mid-field-type is refused; a
    body truncated at a field boundary is not.
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0):
  - `src/parser/theta-document.ts:3017–3019` — **the defect site**, the
    `if (this.atEnd()) { break; }` exit of `parseSchemaObjectBody`'s field loop.
    It pushes no diagnostic and falls out of the loop to `return fields`
    (`:3145`).
  - `src/parser/theta-document.ts:3007–3146` — `parseSchemaObjectBody` as a
    whole: the `{` guard (`:3008–3010`), the `fields` accumulator (`:3012`),
    the `}` exit (`:3020–3023`), the three recovery arms
    (`:3026–3031`, `:3043–3047`, `:3051–3057`) and the comma rule
    (`:3127–3143`). Its doc comment (`:2991–3006`) describes the three arms and
    their partition with `empty-schema-body`; the `atEnd()` exit is not
    mentioned there.
  - `src/parser/theta-document.ts:2828–2836` — `finishObjectSchema`. A
    non-`null` return records `{ kind: "schema", name, fields, … }` (`:2835`),
    which is the same statement a closed body produces.
  - `src/parser/theta-document.ts:3184–3201` — `recoverMalformedSchemaField`,
    bug 0133's landed recovery. It is reached only from the three arms; the
    `atEnd()` exit bypasses it, so no `malformed-schema-field` is available at
    this exit.
  - `src/parser/theta-document.ts:3149–3159` — `skipBraceRemainder`, whose
    end-of-input reach is 0133's residual 1. It is not on this path: nothing is
    left to consume.
  - `src/parser/theta-document.ts:3227–3319` — `parseEnumVariants`, whose
    variant loop has the same shape (`while (!this.atEnd() && depth > 0)`,
    `:3258`) and the same silence: `enum E { A,` at EOF is observationally
    identical to `enum E { A }` (measured). §Non-goals fences it.
  - `src/parser/body-type-lowering.ts:428–443` — `buildBodyTypeSchemas`, which
    lowers a `schema` statement carrying a `fields` array with no knowledge of
    how the body ended.
  - `src/extension/production-composition.ts:1782` — `const registered =
    !diagnostics.some((d) => d.severity === "error")`. Zero diagnostics means
    the theta registers.
  - `docs/spec_topics/grammar.md:171–172` — `SchemaDecl` / `SchemaShape`, the
    production whose closing `"}"` the input omits; `:143` — the `fn` clause,
    which states the analogous rule in prose ("a parameter list not closed by a
    matching `)` is `theta/parse/fn-param-list-unclosed`") and has no schema
    counterpart.
  - `docs/spec_topics/schemas.md:17` — "Fields are comma-separated; the trailing
    comma is optional"; `:19` — the empty-body rule and the rationale that the
    empty fragment "would silently accept every object"; `:93` — the enum
    variant-list rule (the sibling in §Non-goals).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:98` —
    `theta/parse/empty-schema-body`; `:99` —
    `theta/parse/malformed-schema-field` (bug 0133's row, whose *Trigger*
    requires an offending token); `:24` —
    `theta/parse/fn-param-list-unclosed` and its scoping sentence; `:105` —
    `theta/parse/schema-type-not-expression`, the code that fires on the
    mid-field-type truncations.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15 and its
    three observables), `:9` (the loads-cleanly predicate: no `E` means the
    input is inside the promise's input set, so any new refusal is a
    diagnostic-registry-carve-out edit under `:25`).
  - `tests/schema-field-discard-prefix-retention.test.ts` — bug 0133's witness.
    Cells 0g (`:527`), 8b (`:1045`) and 8c (`:1060`) are the unbalanced-body
    pins; each asserts a `malformed-schema-field` line, so none of them is this
    input. **Test coverage of this defect: none.** No cell in the suite drives a
    schema or enum body that reaches EOF with a captured prefix and no offending
    token.
- **Observed at:** `0.219.0` (HEAD `b9cf2f26`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseDoc`
  (`tests/helpers/e2e-s1.ts` — the shipped lexer and `parseThetaDocument` behind
  an inert `parseDeps` double), reading `doc.diagnostics`, the parsed
  `doc.body`, and the lowered bodies from `buildBodyTypeSchemas`. Written, run,
  deleted; `src/`, `tests/` and every other document are unmodified by this
  filing.

## Summary

`parseSchemaObjectBody` (`src/parser/theta-document.ts:3007`) breaks its field
loop on `atEnd()` (`:3017–3019`) and returns the fields captured so far with no
diagnostic. A `schema` object body whose source ends before its `}` therefore
loads exactly as if it had closed:

```
schema S { a: string,        →  []   schema S fields=["a: string"]
schema S { a: string }       →  []   schema S fields=["a: string"]
```

The theta registers (`production-composition.ts:1782` gates registration on the
absence of an `E`), and `S` lowers to
`{"type":"object","properties":{"a":{"type":"string"}},"required":["a"],"additionalProperties":false}`
— a schema the author's file never finished writing.

Where the truncation falls inside a nested inline object type, the lowered shape
also stops corresponding to the source:

```
schema S { a: string, b: {c: integer,     →  []  b lowers to {}
schema S { a: string, b: {c: integer} }   →  []  b lowers to $ref → {properties:{c:{type:"integer"}},required:["c"]}
```

The declared field `c` is gone and `b` accepts any JSON value. The same fragment
written explicitly — `schema S { a: string, b: {} }` — is refused at `E` with
`theta/parse/empty-schema-body`, on the rationale
(`docs/spec_topics/schemas.md:19`) that the empty shape "would silently accept
every object". Truncation reaches the artefact the rule exists to prevent, with
no diagnostic.

The class is bounded by the field boundary. A body truncated mid-field-type is
refused — `b:` draws `theta/parse/schema-type-not-expression`, `b: "x` adds
`theta/parse/unterminated-string` — and a body truncated after a name draws
`theta/parse/malformed-schema-field` through bug 0133's landed recovery. Only a
truncation at a point where the loop is expecting the next field, or the `}`,
is silent.

No registry row covers the input. `theta/parse/malformed-schema-field`'s
*Trigger* (`code-registry-parse.md:99`) requires "a token from which no further
`Field` derives"; at EOF there is no token. `theta/parse/fn-param-list-unclosed`
(`:24`) covers the identical shape for `fn` parameter lists — bug 0151's fix —
and its own *Trigger* fences itself: "Scoped to `fn` parameter lists alone; no
other unbalanced bracket is judged by this row."

## Reproduction

Offline, at `b9cf2f26`. Every fixture is a whole `.theta` source
(`---\nmode: prompt\n---\n<decl>`) driven through `parseDoc`. `diags` is
`doc.diagnostics` in `(file, line, col)` order; `fields` reads the parsed
`schema` statement off `doc.body`; `lowered` is `buildBodyTypeSchemas` over the
parsed statements. `E` abbreviates `error theta/parse/`. The declaration is on
source line 4.

### The subject

```
@@ schema S { a: string,
   diags   :: []
   fields  :: ["a: string"]
   lowered :: {"type":"object","properties":{"a":{"type":"string"}},
               "required":["a"],"additionalProperties":false}
@@ schema S { a: string }                                          [control]
   diags   :: []
   fields  :: ["a: string"]
   lowered :: identical to the row above
```

The two rows are observationally identical on every channel measured: diagnostic
list, recorded statement, lowered body.

### The class boundary — what else is silent

```
@@ schema S { a: string                    diags :: []   fields :: ["a: string"]
@@ schema S { a: string, b: integer        diags :: []   fields :: ["a: string","b: integer"]
@@ schema S { a: string, b: integer,       diags :: []   fields :: ["a: string","b: integer"]
@@ schema S { a: string,\n                 diags :: []   fields :: ["a: string"]
@@ schema S { a as "A": string,            diags :: []   fields :: ["a: string"]   (wireName A)
```

A trailing comma is not the trigger — the omitted `}` is. Every shape in which
the last field completed before EOF is silent, with or without the comma, with
or without a wire-name rename, and at any field count.

### What is refused, one token either side

```
@@ schema S { a: string, b:            diags :: [E schema-type-not-expression]   fields :: ["a: string","b: "]
@@ schema S { a: string, b: array<integer
                                       diags :: [E schema-type-not-expression]
@@ schema S { a: string, b: "x         diags :: [E schema-type-not-expression, E unterminated-string]
@@ schema S { a: string, b             diags :: [E malformed-schema-field]       fields :: ["a: string"]
@@ schema S { a: string, b as          diags :: [E malformed-schema-field]       fields :: ["a: string"]
@@ schema S { a: string, 42            diags :: [E malformed-schema-field]       fields :: ["a: string"]
@@ schema S {                          diags :: [E empty-schema-body]            fields :: []
@@ schema S {                          [one trailing space — same output]
```

The empty-prefix case is refused because `recoverMalformedSchemaField` is never
needed: `parseSchemaObjectBody` returns an empty array and
`checkObjectSchema`'s zero-field arm draws `empty-schema-body`. Between an empty
body and a mid-field truncation, the one gap is a body whose last field
completed.

### The nested inline truncation

```
@@ schema S { a: string, b: {c: integer,
   diags   :: []
   fields  :: ["a: string","b: {c: integer,"]
   lowered :: {"type":"object","properties":{"a":{"type":"string"},"b":{}},
               "required":["a","b"],"additionalProperties":false}
@@ schema S { a: string, b: {c: integer} }                          [control]
   diags   :: []
   lowered :: … "b":{"$ref":"#/$defs/__inline_562094ebf0ccad82"} …
               "$defs":{"__inline_562094ebf0ccad82":{"type":"object",
                 "properties":{"c":{"type":"integer"}},"required":["c"],
                 "additionalProperties":false}}
@@ schema S { a: string, b: {} }                                    [control]
   diags   :: [E empty-schema-body]
   lowered :: … "b":{} …
```

Three rows, two lowered artefacts. The truncated body and the explicitly-empty
body lower `b` identically; one is refused and one is not.

### Statements after the body are not silent

```
@@ schema S { a: string,\nlet a = 1\na\n
   diags  :: [E malformed-schema-field @5:…]
   stmts  :: [schema S fields=["a: string"]]
@@ schema S { a: string,\nschema T { b: string }        (bug 0133 cell 8b's class)
   diags  :: [E malformed-schema-field]
```

Text following an unclosed body is read as further field material: `let` is a
keyword, so it is admitted as a field name and the missing `:` takes arm 3.
Silence needs the file to end. The truncated-file case is the reachable one — a
partial write, a truncated copy-paste, an editor session that ended mid-body.

### The `enum` sibling

```
@@ enum E { A,        diags :: []   variants :: ["A"]   lowered :: {"type":"string","enum":["A"]}
@@ enum E { A }       diags :: []   variants :: ["A"]   lowered :: identical
```

`parseEnumVariants`'s loop bound (`src/parser/theta-document.ts:3258`) is
`!this.atEnd() && depth > 0` and has the same silent EOF exit. Recorded here as
measurement; §Non-goals keeps it out of scope.

### The `fn` analogue, already refused

```
@@ fn f(a: string,    diags :: [E single-line-if, E fn-param-list-unclosed]
```

Bug 0151's landed row. The same truncation on the same day, in a different
declaration form, is refused at `E` and does not register.

## Expected behaviour

`SchemaShape ::= "{" Field ("," Field)* ","? "}"`
(`docs/spec_topics/grammar.md:172`) requires the closing `}`. A source that ends
before it derives from no production of the grammar, so it is not a theta 1.0
source and the load is refused with a diagnostic naming the unclosed body. The
corpus already states this rule for the one declaration form that has been
dispositioned: `grammar.md:143`, "a parameter list not closed by a matching `)`
is `theta/parse/fn-param-list-unclosed`", with the *Trigger* at
`code-registry-parse.md:24` naming the EOF exit, the containment and the
non-registration.

The lowered artefact follows from the refusal: nothing that ends mid-body
registers, so no `{}` property fragment reaches a provider from a truncated
nested body. The explicit spelling `b: {}` keeps its own refusal
(`empty-schema-body`), which is the disposition
`docs/spec_topics/schemas.md:19` states.

Two sentences are owed before code lands.

- **Which code.** `theta/parse/fn-param-list-unclosed`'s *Trigger* scopes itself
  to `fn` parameter lists and disclaims every other unbalanced bracket, so
  reusing it is a *Trigger* widening (DIAG-2), not an application. Minting a row
  for the schema body — or one row covering any unclosed declaration body — is
  the alternative. Either way the edit is a diagnostic-registry carve-out under
  `source-language-stability.md:25`: the input carries no `E` today, so it sits
  in GOV-15's loads-cleanly set (`:9`) and the addition is carve-out-covered
  only as an addition on inputs that emitted nothing.
- **How far the row reaches.** Three neighbouring exits share the shape and are
  currently silent or separately dispositioned: the same body with an EMPTY
  captured prefix (`schema S {` — refused today as `empty-schema-body`, whose
  *Message* "has no fields" is true of it but says nothing about the missing
  `}`), the `enum` variant loop (`parseEnumVariants`, measured silent), and an
  unbalanced body that consumes the file remainder (bug 0133's residual 1,
  pinned by that report's cells 0g / 8b / 8c). A row that names "a declaration
  body not closed by a matching `}`" reaches all three; a row scoped to the
  schema field loop's EOF exit reaches one.

## Actual behaviour / root cause

**One loop exit, no emission.** `parseSchemaObjectBody`
(`src/parser/theta-document.ts:3007`) accumulates `SchemaFieldSource` entries and
leaves the loop three ways. The `}` exit (`:3020–3023`) is the well-formed one.
The three recovery arms hand an offending token to
`recoverMalformedSchemaField` (`:3184`), which — since bug 0133 — emits
`theta/parse/malformed-schema-field` at that token and returns the captured
prefix. The third exit is:

```ts
      if (this.atEnd()) {
        break;
      }
```

It runs after the `stmt-sep` skip and before the `}` test, records nothing, and
falls through to `return fields`. The function's return type
(`SchemaFieldSource[] | null`) carries the empty/non-empty partition bug 0133
established and nothing else: a body that closed and a body that ran out of
source produce the same value.

**The caller cannot tell.** `finishObjectSchema` (`:2828`) branches only on
`null` (`:2831`). A non-`null` array takes `:2835`, producing the ordinary
`schema` statement with its `fields` and its `by`. Every downstream check —
`checkObjectSchema`, the wire-name checks, the constructor field-set checks —
then runs on a declaration the source never finished.

**Registration is gated on diagnostics alone.**
`src/extension/production-composition.ts:1782` computes `registered` as the
absence of an error-severity diagnostic. With none emitted, the truncated
document is a registered theta.

**Lowering reads the recorded text.** `buildBodyTypeSchemas`
(`src/parser/body-type-lowering.ts:428`) lowers each field's `typeSource`. For
the nested case that text is the unterminated `{c: integer,`, which lowers to
`{}` — measured — while the closed twin hoists a `$defs` fragment carrying `c`.
`{}` imposes no constraint, so the property the author declared as an object with
one required integer field validates against any JSON value, and
`additionalProperties: false` on the parent does not reach inside it.

**Why the class is narrow.** The field loop only reaches `atEnd()` between
fields. A truncation inside a field type is consumed by `parseType`, whose
capture is then judged by bug 0061's `schema-type-not-expression`; a truncation
after a field name takes arm 3; a truncation before any field yields the empty
array and `empty-schema-body`. The single uncovered position is the one the
grammar's `","? "}"` tail occupies.

**The sibling loop has the same hole.** `parseEnumVariants` (`:3227`) bounds its
loop with `!this.atEnd() && depth > 0` (`:3258`) and emits nothing when the first
conjunct fails, so `enum E { A,` at EOF is identical to `enum E { A }`. Its
capture is a separate function with a separate registry row
(`theta/parse/empty-enum-body`, `docs/spec_topics/schemas.md:93`) and is fenced
in §Non-goals.

## Why it matters

- **A truncated file is accepted as a complete program.** The one signal that a
  source ended mid-declaration is the missing `}` the parser drops. Every other
  channel — diagnostics, the recorded statement, the lowered body, registration
  — reports success.
- **The lowered schema stops matching the source.** For a nested truncation the
  declared field disappears and the property lowers to `{}`, which validates any
  value. The schema is the contract a provider response is checked against, so
  the check silently passes where the author's schema would reject.
- **`schemas.md:19`'s rule is bypassed rather than enforced.** The corpus refuses
  the empty fragment because it "would silently accept every object"; the
  truncated body produces the same fragment through a path with no diagnostic.
- **The same shape is refused one declaration form over.** `fn f(a: string,` at
  EOF draws `theta/parse/fn-param-list-unclosed` and does not register;
  `schema S { a: string,` at EOF draws nothing and does. The inconsistency is
  visible to any author who meets both.

## Non-goals

- **`enum E { A,` at EOF.** Measured silent above and left to the fix's scope
  decision (§Expected behaviour, second sentence owed). It is a different
  function (`parseEnumVariants`) with a different registry row, and widening
  this report to it would put two capture loops under one §Fix.
- **The unbalanced body that consumes the file remainder.** Bug 0133's residual
  1, pinned as today's behaviour by that report's cells 0g / 8b / 8c
  (`tests/schema-field-discard-prefix-retention.test.ts:527`, `:1045`, `:1060`).
  Those inputs already carry an `E`; this report's do not.
- **The three recovery arms and `recoverMalformedSchemaField`.** Bug 0133's
  subject and its landed fix. Nothing here re-opens the prefix-retention
  disposition, the `malformed-schema-field` row or its anchor.
- **The inline object type's own tolerances.** Duplicate field names
  ([0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md)) and
  the inline field-name rules are untouched. This report's nested measurement is
  evidence about the lowered artefact of an unterminated capture, not a claim
  about the inline field loop's rules.
- **Whether `schema S {` should say more than "has no fields".** The empty-prefix
  case is refused today; whether its *Message* should also name the unclosed
  body is a wording question under DIAG-4.

## Provenance

Found by bug 0133's fix run (0.203.0) during review of its recovery arms, and
recorded there as §Fix record residual 2 — "outside all three recovery arms, and
therefore outside this fix … worth its own filing". Re-measured at HEAD
`b9cf2f26` (0.219.0) before filing: the subject is byte-identical to 0133's
recorded observation, and the nested-lowering element and the class boundary are
new measurements taken for this report.
