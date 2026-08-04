# Bug 0121 — An integer-like `as` wire rename escapes the declaration-order guarantee bug 0080 established for the QRY-18 wire record: `b as "0"` parses with zero diagnostics, the outbound walk re-keys a fresh record by wire names, and `JSON.stringify` fronts the numeric key — so a field declared second renders first, and no spec sentence fixes the wire record's key order at all

- **Status:** open. §Fix is not settled: this report exists to pin whether the
  QRY-18 wire record's key order is guaranteed at all before any code lands. No
  ordering dependency —
  [0080](./0080-keys-values-construction-order-not-declaration-order.md) is
  **fixed (0.70.0)** and owns the single construction point
  (`buildObjectSchemaValue`) any route rebases on.
- **Sev/Diff estimate:** S4/D3 — S4 because no corpus sentence is violated: the
  input is admitted in terms (`docs/spec_topics/lexical.md:16`, a wire name "may
  be any string"), the only order clause is theta-side
  (`docs/spec_topics/expressions.md:118–119`) and holds (measured), and the
  rendered record's key set, key count and values are unchanged — only member
  order differs, so the deliverable is an adjudication of unadjudicated wording
  plus one false in-tree claim (`src/runtime/value.ts:330–337`); D3 because the
  disposition (reject at parse, restrict the wire-name grammar, document the
  order as unspecified, or serialise order-explicitly) is adjudicated in-run, one
  route needs a new registered code with same-commit spec edits under DIAG-2, and
  a route narrowing admitted input edits shipped spec prose and its
  `docs/reference/` mirrors. A re-scorer reading §Expected behaviour's Reading B
  (that QRY-18's "`JSON.stringify` of the value … with wire-name translation
  applied" *is* an order clause, which bug 0080's own cell O pins as behaviour)
  as governing should raise the severity band; the evidence for both readings is
  in that section.
- **Kind:** spec gap, plus one measurable in-tree false claim.
  - The gap: no sentence in the corpus fixes the key order of the *wire* record
    QRY-18 renders. `docs/spec_topics/expressions.md:118–119` orders `keys()` /
    `values()` over **theta-side** field names; the one clause that does state a
    wire-key order governs the lowered JSON Schema's `properties`
    (`docs/spec_topics/schema-subset.md:110`), which this render path never
    builds. Which text governs is argued in §Expected behaviour; the
    adjudication is this report's deliverable.
  - The false claim: `src/runtime/value.ts:330–337` states that "Every
    downstream consumer of the returned record" — naming "the QRY-18 outbound
    `Object.entries` walk (`translateInterpolationOutbound`,
    production-theta-producer.ts)" — "then observes
    declaration order with no further change: theta field names are identifiers
    (`[A-Za-z_][A-Za-z0-9_]*`), never integer-like". The premise is true and
    verified below; the conclusion does not carry to the walk, which builds a
    fresh record keyed by **wire** names, where the premise does not hold.
  - It is **not** a missing-validation defect. `docs/spec_topics/lexical.md:16`
    says the wire name "may be any string via the `as "WireName"` rename
    clause", mirrored at `docs/reference/grammar.md:70`: "the wire name
    (`as "WireName"`) may be any string".
    `docs/spec_topics/schemas.md:39` gives non-theta-identifier-compatible
    property names as the mechanism's whole purpose. No sentence restricts a wire
    name to an identifier shape.
- **Related:**
  - [0080](./0080-keys-values-construction-order-not-declaration-order.md) —
    **fixed (0.70.0)**, the parent. Its fix record states this residual by name
    (`:217–221`): "A wire rename may be integer-like (`b as "B"` is ordinary;
    `b as "0"` is not rejected), and the outbound walk re-keys a fresh record
    by wire names, where `JSON.stringify` fronts an integer-like key regardless
    of insertion order. Untouched here, and outside expressions.md's order
    clause, which governs `keys()` / `values()` over theta-side names." **This
    report is a deliberately deferred residual of that fix, not a regression it
    introduced** — measured below: 0080's reorder runs on the theta-keyed record
    and the render is identical for both constructor orders, so the fix neither
    causes nor worsens the escape. 0080's cell O
    (`tests/ctor-declaration-order.test.ts:540–553`) pins that a renamed field
    keeps its declared position on the wire (`J{"B":1,"a":"x"}`) — the same
    obligation this input class defeats.
  - [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) —
    **open**, the same function, a disjoint input class. It owns a nested
    `Result` reaching `translateInterpolationOutbound`
    (`src/extension/production-theta-producer.ts:5696`); this report owns the key
    the same walk writes at `:5733`. Both fixes edit that function, so whichever
    lands second rebases.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    **open**, adjacent to the out-of-scope inline-annotation observation in
    §Non-goals: the same inline-object field splitter that admits a duplicate
    field name also carries an `as` clause into the lowered property name
    (measured).
  - [0119](./0119-proto-named-field-silently-dropped.md) and
    [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md) —
    **open**, bug 0080's other two residuals: (i) a declared field named
    `__proto__` silently dropped at construction, and (ii) the inbound rebuild
    reconstructing in the model's key order and unbranded. Disjoint input classes;
    neither is this report's subject, and 0120's surface is part of why this
    defect is bounded (§Non-goals). All three reports were filed from the same fix
    record.
- **Affected** (every citation verified at HEAD `bb5206a6`, 0.70.0):
  - `src/parser/theta-document.ts:2561–2574` — **the admission site.** The `as`
    clause is recognised when the next token is an `ident` / `keyword` whose text
    is `as` (`:2562–2564`); the wire token must then be `kind === "string"` or the
    body is abandoned (`:2567–2570`); and the retained wire name is the
    **decoded** string:

    ```ts
    this.advance();
    wireName = wireTok.value ?? wireTok.text;
    ```

    (`:2572–2573`). `value` is the lexer's decoded content and `text` its raw
    spelling including quotes (`src/lexer/lexer.ts:538–542`), so `as "0"` and the
    escape spelling `as "\u{30}"` both yield the wire name `0` — measured.
  - `src/parser/theta-document.ts:2549–2550` — the field-name gate:
    `nameTok.kind === "ident" || nameTok.kind === "keyword"`. With
    `src/lexer/lexer.ts:206–212` (`isIdentStart` admits `A-Z`, `a-z`, `_` only;
    `isIdentPart` adds digits) and `:660` (the ident/keyword token production),
    a theta-side field name can never begin with a digit. This is the claim bug
    0080's round-1 review made, verified at HEAD, and it is exactly what confines
    this defect to the rename path.
  - `src/parser/theta-document.ts:2532` — `parseSchemaObjectBody`, the enclosing
    function; `:536–545` — `SchemaFieldSource`, whose optional `wireName`
    (`:545`) carries the decoded string to the runtime.
  - `src/parser/schema-declarations.ts:87` — `checkObjectSchema`, the only
    wire-name checks in the tree: redundancy (`:103–111`,
    `theta/parse/redundant-wire-name`) and collision (`:116–154`,
    `theta/parse/wire-name-collision`). Neither inspects the wire name's shape,
    and neither checks emptiness.
  - `src/extension/production-theta-producer.ts:5729–5734` — **the re-key
    site**, and the only place the escape is observable:

    ```ts
    const result: Record<string, unknown> = {};
    for (const [thetaKey, fieldValue] of Object.entries(value)) {
      const field = fields.get(thetaKey);
      const wireKey = field?.wire ?? thetaKey;
      result[wireKey] = translateInterpolationOutbound(fieldValue, env, field?.type);
    }
    ```

    The walk *reads* `value` in declaration order (0080's contribution) and
    *writes* a fresh object under wire keys, so the destination record's own-key
    order is decided by JS, not by the iteration.
  - `src/extension/production-theta-producer.ts:5696` —
    `translateInterpolationOutbound`, the enclosing function; `:5725` — the
    theta→wire map, `fields.set(field.name, { wire: field.wireName ?? field.name, … })`,
    the one production consumer of a schema field's `as` rename; `:5673` —
    `return JSON.stringify(translateInterpolationOutbound(value, env))`, the
    QRY-18 object/array arm; `:5657` — `stringifyInterpolation`, its caller.
  - `src/runtime/value.ts:385` — `buildObjectSchemaValue`, bug 0080's single
    construction point; `:400–411` — the reorder into declaration order and the
    brand install; `:317` — `SchemaFieldOrder`. The reorder runs on the
    **theta-keyed** record, before any wire name exists.
  - `src/runtime/value.ts:330–337` — the overclaiming comment quoted under
    **Kind**.
  - `src/runtime/stdlib-object.ts:114–119` — `case "keys"` / `case "values"`
    returning `Object.keys` / `Object.values` verbatim. Theta-side and unaffected:
    measured `[["a","b"],["x",1]]` under the same declaration.
  - `src/parser/body-type-lowering.ts:57–60` — `LowerableField`, which carries
    `name` and `typeSource` and **no** `wireName`; `:109–140` — `lowerObjectFields`,
    which keys `properties[field.name]` and pushes `required.push(field.name)`.
    A declared schema's lowered fragment is therefore keyed by **theta** names,
    so a wire rename never reaches `properties` — measured.
  - `src/runtime/query-schema-lowering.ts:113` — `lowerQueryResponseSchema`, the
    typed-query response lowering, reached in production from
    `src/extension/production-theta-producer.ts:2330` (the query path) and
    `:3375` (the `invoke` return path). Both route through
    `buildBodyTypeSchemas`, hence through `lowerObjectFields` above.
  - `src/parser/schema-lowering.ts:243` — `buildSidecar`, which would carry the
    theta↔wire map to the validation boundary. **It has no production caller**
    (`rg -n buildSidecar src/` answers this definition only), so
    `src/runtime/wire-translation.ts:118` (`translateInbound`) and `:183`
    (`translateOutbound`) are unreached in production: the sole
    `translateOutbound` call, `src/render/query-render.ts:423`, fires only when
    `type.sidecars` is set, and no site in `src/` ever sets it
    (`interpolationTypeOf`, `src/extension/production-theta-producer.ts:5760–5784`,
    never does; `src/parser/system-interpolation.ts:407`, `:413` forward only what
    they are handed). This is the reachability bound: the wire rename is applied
    at exactly one production site.
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18; `:27`
    — the Schema-typed-object row ("`JSON.stringify` of the value, **compact**
    (no pretty-printing), with wire-name translation applied recursively"); `:33`
    — the note binding that translation to the outbound pass, "There is no second
    translation map for interpolation". No sentence in the section states a key
    order for the rendered JSON.
  - `docs/spec_topics/expressions.md:118` — the `keys()` row: "Theta-side field
    names, in schema declaration order for named schemas; insertion order
    otherwise"; `:119` — `values()` "in the same order as `keys()`"; `:209` —
    §Object construction, "field order is irrelevant". All three are theta-side.
  - `docs/spec_topics/runtime-value-model.md:12` — the object-schema row, "JS
    plain object keyed by **theta-side names**, regardless of any wire-name
    renames declared on the schema. Wire-name translation happens only at the
    validation boundary"; `:32`, `:35` — §"Wire-name translation" and its
    *Outbound* bullet, "the runtime walks the theta-side value and produces
    wire-named JSON before AJV validation"; `:39` — "Theta code never sees wire
    names". None of the four states an order, and `:35`'s enumerated outbound
    occasions are tool input, query response payloads and `invoke` arguments —
    the interpolation render is bound in by QRY-18's `:33`, not by this page.
  - `docs/spec_topics/schemas.md:21` — §Wire-name renaming; `:39` — the
    mechanism's purpose ("the only mechanism for expressing schemas whose
    property names are not theta-identifier-compatible — PascalCase
    (`"FirstName"`), special-character (`"@type"`, `"$ref"`), kebab-case
    (`"first-name"`), or reserved-keyword (`"if"`, `"for"`) names"); `:43`
    — "The wire name is a single non-empty string literal (single- or
    double-quoted, no interpolation, escape sequences as in any other string
    literal)"; `:44`, `:45` — the collision and redundancy rules, the only two
    constraints on a wire name that carry codes.
  - `docs/spec_topics/lexical.md:16` — "The lowercase-first rule applies to the
    **theta-side** field identifier; the field's *wire* name … may be any string
    via the `as "WireName"` rename clause". The sentence that decides this is
    not a missing-validation defect.
  - `docs/spec_topics/schema-subset.md:78` — the Object emission rule
    (`properties` and `required` carry wire names); `:85` — *Array element
    order*: "object `required` lists wire names in declaring-field order
    (matching the `properties` order of the same Object form)"; `:110` — "the
    emitted lowered schema retains the theta-source declaration order of fields
    … Both invariants must hold simultaneously". This is the corpus's one stated
    wire-key-order clause; it governs the lowered fragment, which this path never
    builds, and it is a forward hazard (§Why it matters).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:84`, `:85` — the
    `theta/parse/redundant-wire-name` (W) and `theta/parse/wire-name-collision`
    (E) rows: the only registered codes for the `as` position, neither of which
    covers a shape rejection.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a code addition is a spec change landing in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative).
  - `docs/reference/grammar.md:70` — the "may be any string" mirror; `:444` — the
    `keys()` / `values()` mirror; `docs/reference/schema-subset.md:47` — the
    wire-name-renaming mirror carrying the "single non-empty string literal"
    rule. These are the user-facing pages a narrowing route must edit.
  - `tests/ctor-declaration-order.test.ts` — bug 0080's witness, 16 cells, the
    harness to extend. Cell O (`:540–553`) is the renamed-field pin and states
    the two transformations it separates; its header records the reasoning this
    report contradicts for one input class.
  - `tests/live/live-production-acceptance.test.ts:1436` — bug 0080's additive
    H8a cell, which must stay green.
  - **Test coverage of this defect: none.** No test in the tree declares an
    integer-like wire name: `rg -n 'as "0"' tests/` exits 1 with no match. Every
    rename the suite does declare is non-numeric — cell O's `as "B"`,
    `kind as "Kind"` in `tests/schema-alias-union-decl.test.ts:306`, the two
    collision fixtures at `tests/schema-declarations.test.ts:75` and `:94`, and
    `first_name as "FirstName"` in `tests/wire-name-translation.test.ts:35`.
- **Observed at:** `0.70.0` (HEAD `bb5206a6`). Offline, deterministic; no live
  model, no provider, no network. One scratch vitest file over the production
  composition drive bug 0080's witness established — parse →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`, with
  the rendered turn captured at the `pi.sendUserMessage` seam and the final value
  read off the execution — plus direct calls to `parseThetaDocument`,
  `lowerQueryResponseSchema` and `translateInbound`. Written, run, quoted below,
  deleted.

## Summary

A schema field's wire rename is admitted as the **decoded** string
(`wireName = wireTok.value ?? wireTok.text`,
`src/parser/theta-document.ts:2573`), and the only checks on it are collision and
redundancy (`src/parser/schema-declarations.ts:103–154`). So `b as "0"` loads with
zero diagnostics, as does the escape spelling `b as "\u{30}"`, whose decoded wire
name is also `0`.

The QRY-18 interpolation render then re-keys a **fresh** record by wire names
(`src/extension/production-theta-producer.ts:5729–5734`) and hands it to
`JSON.stringify` (`:5673`). JS own-key order fronts an array-index-shaped key on
that fresh record regardless of insertion order, so an integer-like wire name
leads whatever its declared position. Measured, on a schema whose `a` is
declared first:

```
schema P { a: string, b as "0": integer }   →   J{"0":1,"a":"x"}
schema P { a: string, b as "B": integer }   →   J{"a":"x","B":1}   [control]
schema P { a: string, b: integer }          →   J{"a":"x","b":1}   [control]
```

Three scope statements, each measured:

1. **Pre-existing and untouched by bug 0080.** 0080 reorders the *theta-keyed*
   record at `buildObjectSchemaValue` (`src/runtime/value.ts:400–411`), before
   any wire name exists; JS's integer-like-key rule applies afterwards, at the
   record the outbound walk builds. The render is byte-identical for both
   constructor orders (`P { a: "x", b: 1 }` and `P { b: 1, a: "x" }` both send
   `J{"0":1,"a":"x"}`), so no constructor order avoids the fronting and 0080's
   reorder is a no-op for this input. 0080's own fix record states the walk was
   not touched by it: "`src/runtime/stdlib-object.ts`,
   `translateInterpolationOutbound` and `valuesEqual` are untouched"
   (`docs/bugs/0080-keys-values-construction-order-not-declaration-order.md:110–111`).
2. **Ordinary declaration order stays safe, for the reason bug 0080's round-1
   review gave.** Schema-declaration field names are `ident` / `keyword` tokens
   (`src/parser/theta-document.ts:2549–2550`) and `isIdentStart`
   (`src/lexer/lexer.ts:206–208`) admits only `A-Z`, `a-z`, `_` — a leading digit
   is impossible. Verified at HEAD. That is precisely what confines this defect
   to the rename path.
3. **The order clause does not reach the wire record.**
   `docs/spec_topics/expressions.md:118–119` orders `keys()` / `values()` over
   theta-side names, and the theta-side order is intact under the same
   declaration (measured `[["a","b"],["x",1]]`). No sentence of QRY-18
   (`docs/spec_topics/query/query-escapes-stringification.md:16–36`) or of
   `docs/spec_topics/runtime-value-model.md:32–39` states a key order for the
   rendered wire JSON. **So this is a spec silence about wire-record key order,
   not a violation of a stated guarantee** — the weaker of the two available
   claims, and the one the corpus supports. §Expected behaviour argues the
   opposing reading and says what makes it weaker.

**Reachability bound.** The escape is confined to the interpolation render. The
wire rename is applied at exactly one production site
(`src/extension/production-theta-producer.ts:5725`). A typed query's lowered
response schema is keyed by **theta** names — `lowerObjectFields`
(`src/parser/body-type-lowering.ts:109–140`) reads `field.name` from a
`LowerableField` that has no `wireName` field — so measured, `@<P>` over the same
declaration lowers `properties: {"a":…,"b":…}` / `required: ["a","b"]`, with no
`"0"` anywhere. `buildSidecar` (`src/parser/schema-lowering.ts:243`) has no
production caller, so neither `translateInbound` nor `translateOutbound` runs in
production. An integer-like wire name therefore never reaches a lowered JSON
Schema, an AJV validation, or the inbound rebuild; it reaches prompt text only.
That bound is a consequence of a separate, larger gap (wire renaming is wired
into one of its two spec-named boundaries), fenced in §Non-goals.

## Reproduction

Offline at `bb5206a6`, one scratch vitest file. Rows R1–R8 drive the real
production composition (parse → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) and quote the text handed to
`pi.sendUserMessage`; R9 and E1 quote `parseThetaDocument`'s diagnostics and
retained field list; R10 calls `lowerQueryResponseSchema`; R11 calls
`translateInbound`; R12 is plain JS. Every fixture carries the frontmatter
`---\nmode: prompt\n---`. Output verbatim.

### The measurement — the second declared field renamed to an integer-like string

```
schema P { a: string, b as "0": integer }
let p = P { a: "x", b: 1 }
@`J${p}`

R1 ctor decl-order   :: J{"0":1,"a":"x"}
R2 ctor rev-order    :: J{"0":1,"a":"x"}      [let p = P { b: 1, a: "x" }]
R3 control as "B"    :: J{"a":"x","B":1}
R4 control no rename :: J{"a":"x","b":1}
```

`a` is declared first and renders second. R2 carries the pre-existence argument:
the constructor's own order changes nothing, because bug 0080's reorder has
already put the theta-keyed record in declaration order before the walk runs, so
no constructor order reachable before that fix could have avoided the fronting
either.

### The theta-side guarantee is intact on the same value

```
schema P { a: string, b as "0": integer }
let p = P { b: 1, a: "x" }
[p.keys(), p.values()]

R5 keys/values       :: [["a","b"],["x",1]]
```

Declaration order, theta-side names, under the same rename that fronts the wire
key. The two surfaces disagree about position for one value.

### Several integer-like renames sort numerically, ahead of every string key

```
schema Q { a as "2": string, b as "10": integer, c as "1": boolean, d: string }
let q = Q { a: "x", b: 1, c: true, d: "y" }
@`J${q}`

R6 three numeric     :: J{"1":true,"2":"x","10":1,"d":"y"}
```

Declared `a`, `b`, `c`, `d`; rendered `1`, `2`, `10`, `d`. The numeric keys are
ordered by value, not by declaration, and `10` follows `2`.

### The class is exactly the canonical array-index spellings

```
R7 as "01"              :: J{"a":"x","01":1}
R7 as "1.0"             :: J{"a":"x","1.0":1}
R7 as "-1"              :: J{"a":"x","-1":1}
R7 as " 0"              :: J{"a":"x"," 0":1}
R7 as "0x1"             :: J{"a":"x","0x1":1}
R7 as "1e2"             :: J{"a":"x","1e2":1}
R7 as "4294967294"      :: J{"4294967294":1,"a":"x"}
R7 as "4294967295"      :: J{"a":"x","4294967295":1}
```

Only a canonical decimal in `0 … 2³²−2` fronts. `4294967294` (`2³²−2`) fronts and
`4294967295` (`2³²−1`) does not, which is the array-index boundary. R12 confirms
the same partition in plain JS with no theta in the loop:

```
R12 key "0"          :: {"0":1,"a":"x"}
R12 key "01"         :: {"a":"x","01":1}
R12 key "4294967294" :: {"4294967294":1,"a":"x"}
R12 key "4294967295" :: {"a":"x","4294967295":1}
R12 key "B"          :: {"a":"x","B":1}
```

### It reaches a nested value

```
schema Inner { i: string, j as "0": integer }
schema Outer { o: Inner, z: string }
let v = Outer { o: Inner { i: "s", j: 7 }, z: "t" }
@`J${v}`

R8 nested            :: J{"o":{"0":7,"i":"s"},"z":"t"}
```

The walk recurses (`:5733`), so every nesting level re-keys its own fresh record
and each one fronts independently. The outer level, whose keys are ordinary, keeps
declaration order.

### Parse admits it, and admits it through an escape

```
R9 as "0" (double-quoted)          :: []
R9 as '0' (single-quoted)          :: []
R9 as 0 (number token)             :: ["error theta/parse/empty-schema-body","error theta/parse/unresolved-named-type"]
R9 as zero (ident token)           :: ["error theta/parse/empty-schema-body","error theta/parse/unresolved-named-type"]
R9 as "" (empty string)            :: []
```

`as` accepts a `string` token and nothing else: a `number` or `ident` token
abandons the body through `skipBraceRemainder` (`:2568–2570`), which surfaces as
`theta/parse/empty-schema-body` plus the constructor's
`theta/parse/unresolved-named-type` — so `as 0` is unreachable and only the
quoted form matters. The last row is a separate residual (§Non-goals):
`schemas.md:43` requires a non-empty literal and `as ""` draws nothing.

Because the retained wire name is the *decoded* string, an escape reaches the
same class — the retained `[thetaName, wireName]` pairs, read off the parsed
declaration:

```
E1 as \u{30}     :: codes [] :: fields [["a",null],["b","0"]]
E1 as \u0030     :: codes ["error theta/parse/invalid-unicode-escape"] :: fields [["a",null],["b","0030"]]
E1 as \x30       :: codes ["error theta/parse/illegal-escape"]         :: fields [["a",null],["b","30"]]
```

`\u{30}` is theta's escape form and decodes to `0`; the two rejected spellings are
rejected for being the wrong escape form, not for their content. Any check on the
wire name must therefore run on the decoded value, not on the source text.

### The bound — the lowered schema carries no wire name at all

```
schema P { a: string, b as "0": integer }
@<P>`ask`

R10 lowered @<P>     :: {"type":"object","properties":{"a":{"type":"string"},"b":{"type":"integer"}},"required":["a","b"],"additionalProperties":false}
```

The rename is absent: `properties` and `required` carry theta-side names, against
`schema-subset.md:78`. So AJV never compiles a property named `"0"`, and the
inbound rebuild is never handed one. Driving the same shape end to end confirms
both annotation forms load clean (`A1 inline+rename :: []`,
`A2 named+rename :: []`), so nothing downstream refuses the declaration either.

For completeness, with a hand-built sidecar — a value production never
constructs, since `buildSidecar` has no production caller:

```
R11 inbound rebuild  :: {"b":1,"a":"x"} keys ["b","a"]
R11 wire JSON.parse  :: ["0","a"]
```

`JSON.parse` of `{"a":"x","0":1}` already fronts the numeric key, and the rebuild
walks `Object.entries` of that (`src/runtime/wire-translation.ts:159`), so the
fronted position propagates into the theta-side record. That path is bug 0080's
residual (ii) and is unreachable in production today.

## Expected behaviour

Two readings are available, and which governs is the adjudication this report
owes.

**Reading A — the wire record's key order is unspecified.** The corpus's order
clauses are `docs/spec_topics/expressions.md:118–119`, whose subject is
"Theta-side field names", and `docs/spec_topics/schema-subset.md:110`, whose
subject is "the emitted lowered schema". QRY-18's Schema-typed-object row
(`query-escapes-stringification.md:27`) names a serialiser (`JSON.stringify`), a
formatting constraint (compact) and a transformation (wire-name translation
applied recursively) — three things, none of them an order. `:33` adds only that
the transformation is the outbound pass and that there is no second translation
map. `docs/spec_topics/runtime-value-model.md:12` fixes the *representation* as
theta-side-keyed and says translation "happens only at the validation boundary";
`:35` says the outbound pass "produces wire-named JSON". On this reading the
implementation is conformant and the corpus is silent, so the report asks for one
sentence rather than a code change.

**Reading B — QRY-18 does order it, by naming the value.** The row reads
"`JSON.stringify` of **the value**, compact, with wire-name translation applied
recursively". The value's key order is declaration order (`expressions.md:118`,
after bug 0080), and "wire-name translation" is defined as a *rename*
(`runtime-value-model.md:35`, `schemas.md:34`: "the field is accessed,
constructed, and pattern-matched as the theta identifier … The wire name appears
in only two places"). A rename that also permutes positions does more than the
clause licenses, so the rendered order is owed as declaration order with the
names substituted. The project has already treated this as behaviour: bug 0080's
cell O (`tests/ctor-declaration-order.test.ts:540–553`) asserts
`J{"B":1,"a":"x"}` for a *renamed* field and states the reason — "this cell pins
both at once", the rename and the position.

**Reading A is better supported, and Reading B is the stronger claim this report
declines to assert.** Three reasons:

1. Reading B has to read "of the value" as carrying member order through a
   transformation the same sentence licenses. The corpus elsewhere states an
   order when it wants one, twice, in the two places it matters
   (`expressions.md:118–119`, `schema-subset.md:110`), and both times names its
   subject explicitly. QRY-18 names neither.
2. JSON member order is not semantic for a JSON consumer, and QRY-18's output is
   prompt text read by a model. Reading B therefore asks the spec for an order
   guarantee it has not stated at this position, where it has stated one at the
   lowered-schema position (`schema-subset.md:110`) and there paired it with an
   explicit statement of what does not depend on it (the canonical hash sorts
   object keys, so "changing source-level field order changes the emitted
   schema's property order but does *not* change the canonical hash").
3. Cell O is a *test* pin, not spec text, and its input (`as "B"`) cannot
   distinguish the two readings: under Reading A the cell is pinning HEAD's
   behaviour, which for a non-integer-like wire name is declaration order either
   way.

So the honest statement is: **a spec silence about wire-record key order, plus a
false claim inside `src/runtime/value.ts:330–337`.** Under either reading the
false claim is a defect, because it asserts the conclusion of Reading B while
arguing from a premise (theta names are never integer-like) that does not hold at
the record the walk writes.

Under Reading A, the requirement on any fix is:

- One sentence at QRY-18 (`query-escapes-stringification.md:27` or its notes)
  stating what the rendered object's key order is — declaration order with names
  substituted, or unspecified for wire names JS reorders.
- The `src/runtime/value.ts:330–337` comment corrected to match, since it
  currently states the guarantee unconditionally.
- The theta-side clause untouched and still measured: `keys()` / `values()` in
  declaration order, key set and key count unchanged.

Under Reading B, additionally: the render carries declaration order for every
admitted wire name, which requires either refusing the input class or serialising
without depending on JS own-key order (§Fix (a), (d)).

Both readings agree on three controls, measured silent-and-ordered today and
required so afterwards: a non-integer-like rename keeps its declared position
(R3); an unrenamed schema is unaffected (R4); and the theta-side reads are
unaffected (R5).

## Actual behaviour / root cause

Four steps, each measured.

**(1) Parse admits the decoded string.** `parseSchemaObjectBody` requires the
wire token to be a `string` token and then retains `wireTok.value ?? wireTok.text`
(`src/parser/theta-document.ts:2567–2573`). `value` is the decoded content, so
`"0"` and `"\u{30}"` are the same wire name. The two checks that exist
(`src/parser/schema-declarations.ts:103–154`) compare wire names to each other
and to theta names; neither looks at the shape. Zero diagnostics — R9, E1.

**(2) Bug 0080's reorder applies to a different record.** `buildObjectSchemaValue`
(`src/runtime/value.ts:385–411`) rebuilds the constructed record in the declaring
schema's field order and brands it. That record is keyed by theta-side names,
which cannot be integer-like (step 2 of §Summary), so its own-key order *is*
insertion order and the guarantee holds exactly as the module comment says — for
that record. R2 shows the consequence: with the reorder in place, the
constructor's order is no longer observable, and the rendered output is identical
either way.

**(3) The outbound walk builds a *fresh* record under wire keys.**
`translateInterpolationOutbound` (`src/extension/production-theta-producer.ts:5729–5734`)
iterates `Object.entries(value)` — declaration order — and assigns into
`result[wireKey]`. Assignment order is declaration order; own-key order of the
destination is not, because `result` is a new object and JS orders integer-index
keys ascending ahead of every string key. The walk's read side is ordered and its
write side is re-ordered by the engine, and nothing in between observes the
difference.

**(4) `JSON.stringify` reports own-key order.** `:5673` serialises `result`
directly. `docs/spec_topics/runtime-value-model.md:45` pins the engine
("native `JSON.stringify`") as a non-checked invariant, so the reordering is the
host's specified behaviour, not a bug in the serialiser.

**The class is narrow and exactly determined.** A canonical decimal string in
`0 … 2³²−2` (R7, R12). Non-canonical spellings (`01`, `1.0`, `-1`, ` 0`, `0x1`,
`1e2`) and `2³²−1` are ordinary string keys and keep insertion order. Several
integer-like renames order among themselves by numeric value (R6), which means a
schema can render its fields in an order that matches neither declaration nor
constructor.

**No post-condition exists, and the value is well-formed.** The rendered JSON's
key set, key count and values are identical to the ordered rendering — only member
order differs — so no consumer, assertion or type can detect the difference. This
is the same shape as bug 0080's own root cause one layer out: there the ambiguous
artefact was a record whose order came from the call site; here it is a record
whose order comes from the engine's key-ordering rule.

**Why the module comment is wrong.** `src/runtime/value.ts:330–337` argues from
theta field names being identifiers to "Every downstream consumer of the returned
record … then observes declaration order with no further change", and names the
QRY-18 walk among the consumers. Two of the three named consumers do observe it
(`Object.keys` / `Object.values` in `src/runtime/stdlib-object.ts:114–119`, and
`JSON.stringify` of the *returned* record). The walk does not, because it does not
serialise the returned record — it serialises a copy keyed differently.

**Reach.** One production site applies a rename
(`production-theta-producer.ts:5725`), reached only from the QRY-18 object/array
arm (`:5673` ← `:5657`). The lowered-schema and inbound halves of
`runtime-value-model.md:32–35` are keyed by theta names or unwired (R10;
`buildSidecar` uncalled), so no other surface can exhibit the escape today.

## Why it matters

- **Silent, load-clean, and zero diagnostics.** Measured: the declaration parses
  with `[]`, the theta runs, and the model receives a member order the
  declaration does not predict. No code fires at any severity on any channel.
- **Two surfaces of one value disagree about position.** `p.keys()` answers
  `["a","b"]` and the render sends `{"0":1,"a":"x"}` — for the same binding, at
  one HEAD. Bug 0080's §Fix rejected its option 2 precisely because that route
  "leaves the QRY-18 JSON order wrong and makes `keys()` disagree with
  `JSON.stringify` of the same value"; for this input class the chosen route
  leaves that disagreement standing as a positional one — `keys()` reports `b`
  second, the render puts its wire key first.
- **The in-tree explanation is wrong where a reader will look.**
  `src/runtime/value.ts:330–337` is the doc comment on the single construction
  point, and it states the guarantee for the QRY-18 walk unconditionally. A
  future editor reading it will conclude the render is ordered.
- **The input class is reachable without author error, by the mechanism's own
  purpose.** `schemas.md:39` exists to bind theta to third-party JSON Schemas
  whose property names are not theta identifiers, and gives `"@type"` / `"$ref"`
  as examples. A contract with a numeric property name (`"0"`, `"1"` — array-like
  JSON objects, protocol slot maps) is the same use case, and
  `lexical.md:16` admits it in terms.
- **Forward hazard at a position where the order *is* stated.**
  `schema-subset.md:110` states that "the emitted lowered schema retains the
  theta-source declaration order of fields", and `:85` pairs `required`'s
  declaring-field order with "the `properties` order of the same Object form".
  Today no wire name reaches `properties` (R10), so neither clause can break. If
  the rename is ever wired into lowering — the separate gap §Non-goals fences —
  the same JS rule fronts the key in `properties` while `required`, an array,
  keeps declaration order, and the stated pairing breaks. The canonical schema
  hash is unaffected either way, because its canonical form sorts object keys
  (`schema-subset.md:110`).
- **Nothing in the suite scores it.** No test declares an integer-like wire name.
  Bug 0080's cell O drives the neighbouring input (`as "B"`) and is green.

## Non-goals

- **Bug 0080's residual (i)**, filed as
  [0119](./0119-proto-named-field-silently-dropped.md) — a declared field named
  `__proto__` silently dropped at construction. Disjoint input class, same
  construction point.
- **Bug 0080's residual (ii)**, filed as
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md) — the
  inbound rebuild reconstructing in the model's key order and installing no
  brand. Disjoint direction, and unreachable in production today for the reason
  below.
- **The un-wired half of wire-name translation.**
  `docs/spec_topics/runtime-value-model.md:32` says translation happens in
  exactly two places; in this tree the lowered schema is keyed by theta names
  (`lowerObjectFields`, `src/parser/body-type-lowering.ts:109–140`; measured R10)
  and `buildSidecar` (`src/parser/schema-lowering.ts:243`) has no production
  caller, so the validation-boundary half applies no rename at all. That gap is
  what bounds this report; adjudicating it is a separate and larger question, and
  a fix there re-opens this one at the `properties` position (§Why it matters).
- **The inline-object-type annotation route.** Measured at this HEAD:
  `lowerQueryResponseSchema("{ a: string, b as \"0\": integer }", [], [])` answers
  `properties: {"a":…,"b as \"0\"":…}` / `required: ["a","b as \"0\""]` — the
  inline field splitter carries the whole `as` clause into the property name, for
  `as "B"` as well as `as "0"`, and the enclosing theta parses clean
  (`A1 inline+rename :: []`). That is a different defect on a different code path
  (adjacent to [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md)),
  it is not an ordering escape, and it is not adjudicated here. It is recorded
  because it is a second reason no lowered `properties` carries `"0"` today.
- **`as ""`.** `schemas.md:43` requires "a single non-empty string literal" and
  the parse admits the empty literal with `[]` (R9). A missing validation with its
  own DIAG-2 question; not this report's subject.
- **QRY-18's other rows.** The nested-`Result` carrier leak in the same walk is
  [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md); the enum,
  numeric and `array<T>` rows are untouched here.
- **The `system:` interpolation surface.** It renders objects through
  `stringifyInterpolatedValue` (`src/parser/system-interpolation.ts:480`) with
  `sidecars` absent — no site in `src/` sets that field — so it applies no wire
  rename and cannot exhibit this. Whether it *should* apply one is a separate
  divergence.
- **JS engine key ordering.** `docs/spec_topics/runtime-value-model.md:45` makes
  the engine's value model a non-checked invariant. The fix question is what
  theta emits, not what Node orders.

## Fix

**Not settled. This report exists to pin the disposition first**, because the
primary question — whether the QRY-18 wire record's key order is guaranteed at
all — has no answer in the corpus (§Expected behaviour). Four routes, with their
consequences; the constraints after them bind whichever is chosen.

**(a) Reject an integer-like wire name at parse.** The check runs on the decoded
wire name (E1: `as "\u{30}"` must be caught too), at
`src/parser/schema-declarations.ts:87`'s `checkObjectSchema` beside the existing
collision and redundancy checks, and the predicate is the array-index test the
measurement pins: a canonical decimal in `0 … 2³²−2` (R7, R12).
*Consequences.* (i) **A DIAG-2 decision is required**: no registered code covers
this position. The two rows that exist —
`docs/spec_topics/diagnostics/code-registry-parse.md:84` (`redundant-wire-name`,
W) and `:85` (`wire-name-collision`, E) — describe different triggers, and DIAG-4
(`diagnostic-shape.md:74`) forbids rewording either *Message*, so reusing one is
a trigger widening at best and a message lie at worst. A new code is a registry
row landing in the same commit (DIAG-2, `diagnostic-shape.md:72`), with the
`docs/reference/diagnostics.md` mirror, and `tests/fixtures/h7a/permitted-codes.json`
updated only if the code can reach an h7a surface. (ii) It **narrows input the
spec admits in terms**, so `docs/spec_topics/lexical.md:16` ("may be any string")
and its mirror `docs/reference/grammar.md:70` change in the same commit, as does
`docs/spec_topics/schemas.md:43`'s rule list and its mirror
`docs/reference/schema-subset.md:47`. (iii) It forecloses binding a third-party
contract whose property name is `"0"` — the case `schemas.md:39` says the
mechanism exists for — with no escape hatch, so the disposition must state that
this is intended.

**(b) Restrict wire names to an identifier shape in the spec and enforce it.**
*Consequences.* As stated, this contradicts `schemas.md:39` directly: `"@type"`,
`"$ref"` and `"first-name"` are named there as the mechanism's purpose and none is
identifier-shaped, so the route as written would refuse the spec's own examples.
Whether the sentence or the route yields is itself part of the adjudication. The
narrower variant — restricting only the array-index-shaped subset — is route (a)
with the same DIAG-2 and mirror obligations.

**(c) Accept the escape and document that the wire record's key order is
unspecified for integer-like names.** One sentence at QRY-18
(`query-escapes-stringification.md:27` or its notes), and the
`src/runtime/value.ts:330–337` comment corrected so it no longer claims the walk
observes declaration order. *Consequences.* No code, no registry row, no
narrowing; `docs/reference/` carries no QRY-18 mirror, so the spec edit is
single-page. An author with an integer-like rename gets an order neither the
declaration nor the constructor predicts (R6: declared `a`,`b`,`c`,`d` renders
`1`,`2`,`10`,`d`), and bug 0080's cell-O obligation stops holding uniformly across
wire names — which the disposition must state, since that cell's comment says it
pins the rename and the position together.

**(d) Serialise the wire record order-explicitly.** The only route that preserves
declaration order without narrowing the admitted input: emit the object's JSON
from the ordered entry list the walk already has, instead of relying on the fresh
record's own-key order (`production-theta-producer.ts:5729–5734` → `:5673`).
*Consequences.* QRY-18 names `JSON.stringify` (`:27`), and no ordered JS
container serialises to a JSON object in a chosen key order — a `Map`
stringifies as `{}`, and an array of pairs changes the payload — so the route
reduces to a bespoke emitter that must be byte-identical to `JSON.stringify` for
every other input (string escaping, number rendering, nesting) or it becomes its
own defect class. It owes that byte-equivalence argument, it touches every object
and array interpolation, and it is the only route that makes Reading B true as
behaviour.

**Constraints — binding on every route.**

- **Bug 0080's single construction point stays single.**
  `buildObjectSchemaValue` (`src/runtime/value.ts:385`) is the one place an
  object-schema value's key order is decided, and `brandSchemaValue`'s only
  production callers are its two branded arms. A fix here must not re-split the
  two constructor sites, and must not move ordering back into either
  (`src/runtime/statement-executor.ts`'s `evalExpr` object arm,
  `evaluatePureExpression`'s `case "object"`). Route (a) touches parse only;
  route (d) touches the render only; neither needs a construction change.
- **The 16-cell witness stays green, cell O in particular.**
  `tests/ctor-declaration-order.test.ts` (16 cells), cell O at `:540–553`
  (`J{"B":1,"a":"x"}` — a renamed field keeps its wire name and its declared
  position), cell C, cell D and cell L (the second construction site), the two
  brand-integrity cells and the `__proto__` control. Bug 0080's additive H8a cell
  (`tests/live/live-production-acceptance.test.ts:1436`) also stays green; it
  asserts exact bytes on `turn.userTexts`.
- **The theta-side order guarantee must not weaken.**
  `docs/spec_topics/expressions.md:118–119` and its mirror
  `docs/reference/grammar.md:444`: `keys()` / `values()` in declaration order,
  and the record's key set and key count unchanged. Measured today under the
  defect's own input (R5) and required after.
- **DIAG-2 / DIAG-4.** Any new code lands its registry row in the same commit
  (`diagnostic-shape.md:72`) with the `docs/reference/diagnostics.md` mirror; no
  existing *Message* is reworded (`:74`). A route that narrows admitted input
  lands its `docs/spec_topics/lexical.md:16` / `schemas.md:43` edits and the
  `docs/reference/grammar.md:70` / `docs/reference/schema-subset.md:47` mirrors
  in the same commit.
- **Coordination with 0114.**
  [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) edits
  `translateInterpolationOutbound` (`:5696`), the same function route (d) rewrites
  and the same walk this report measures. Whichever lands second rebases; a route
  (d) fix should read 0114's disposition first, because both change what the walk
  emits per field.
- **Do not close the bound by accident.** The reachability bound rests on the
  lowered schema being theta-keyed (R10). A fix that wires renames into lowering
  to "make the two sides agree" re-opens this defect at the `properties` position,
  where `schema-subset.md:110` and `:85` *do* state an order. Any such change is
  the separate adjudication §Non-goals fences, not part of this fix.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one production composition drive or one direct seam call, so the harness is
`tests/ctor-declaration-order.test.ts` extended, not a new mechanism. Required
rows: the measurement and both constructor orders (R1, R2); the `as "B"` and
no-rename controls (R3, R4); the theta-side reads under the same declaration
(R5); the multi-numeric ordering (R6); the array-index boundary pair
`4294967294` / `4294967295` and at least two non-canonical spellings (R7); the
nested case (R8); the decoded-name rows, `as "0"` and the `\u{30}` escape, so a
check that inspects source text instead of the decoded value reds (R9, E1); and
the bound row (R10), which reds if a fix silently starts emitting wire names into
`properties`. Any asserted diagnostic message is sourced from the registry's
*Message* column per DIAG-4, as that file already does for its two parse
controls.

## Provenance

- Origin: the bug 0080 fix (0.70.0), whose fix record states this residual by
  name at
  `docs/bugs/0080-keys-values-construction-order-not-declaration-order.md:217–221`
  — "A wire rename may be integer-like … the outbound walk re-keys a fresh record
  by wire names, where `JSON.stringify` fronts an integer-like key regardless of
  insertion order. Untouched here, and outside expressions.md's order clause,
  which governs `keys()` / `values()` over theta-side names." Raised in that fix's
  round-1 review as R2. This report adds what the residual does not state: the
  measured renders with their controls, the pre-existence argument (identical
  output for both constructor orders, beside 0080's own record of the walk as
  untouched), the exact input class with its array-index
  boundary, the multi-numeric ordering, the nested case, the escape spelling, the
  admitted-token-kind inventory for `as`, the reachability bound through the
  lowered schema and the uncalled sidecar, the two readings of QRY-18 with the
  argument between them, the false claim in `src/runtime/value.ts:330–337`, the
  `schema-subset.md:110` forward hazard, and the four §Fix routes with their
  constraints.
- Spec: `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18),
  `:27` (the Schema-typed-object row), `:33` (the outbound-pass note);
  `docs/spec_topics/expressions.md:118`, `:119` (the `keys()` / `values()` order
  clause — theta-side), `:209` ("field order is irrelevant");
  `docs/spec_topics/runtime-value-model.md:12` (theta-side-keyed representation),
  `:32`, `:35` (§Wire-name translation and its outbound bullet), `:39` (theta code
  never sees wire names), `:45` (the engine invariant, including native
  `JSON.stringify`); `docs/spec_topics/schemas.md:21` (§Wire-name renaming),
  `:39` (the mechanism's purpose), `:43` (the single non-empty string literal
  rule), `:44`, `:45` (the two coded constraints);
  `docs/spec_topics/lexical.md:16` (the wire name "may be any string");
  `docs/spec_topics/schema-subset.md:78` (the Object emission rule), `:85`
  (*Array element order*, `required` matching `properties`), `:110` (the emitted
  lowered schema retains declaration order; the canonical form sorts keys);
  `docs/spec_topics/grammar.md:109` (an inline object field may carry `as`);
  `docs/spec_topics/diagnostics/code-registry-parse.md:84`, `:85` (the two
  wire-name rows); `docs/spec_topics/diagnostics/diagnostic-shape.md:72`
  (DIAG-2), `:74` (DIAG-4). User-facing mirrors: `docs/reference/grammar.md:70`,
  `:444`; `docs/reference/schema-subset.md:47`.
- Implementation evidence at `bb5206a6`:
  `src/parser/theta-document.ts:536–545` (`SchemaFieldSource`, `wireName` at
  `:545`), `:2532` (`parseSchemaObjectBody`), `:2549–2550` (the ident/keyword
  field-name gate), `:2561–2574` (**the `as` clause**, the string-token
  requirement at `:2567–2570`, the decoded assignment at `:2573`);
  `src/lexer/lexer.ts:206–212` (`isIdentStart` / `isIdentPart`), `:538–542` (the
  string token's `text` and `value`), `:660` (the ident/keyword production);
  `src/parser/schema-declarations.ts:87` (`checkObjectSchema`), `:103–111`
  (redundancy), `:116–154` (collision);
  `src/runtime/value.ts:317` (`SchemaFieldOrder`), `:330–337` (the overclaiming
  comment), `:385–411` (**`buildObjectSchemaValue`** and its reorder);
  `src/runtime/stdlib-object.ts:114–119` (`keys` / `values`);
  `src/extension/production-theta-producer.ts:5657` (`stringifyInterpolation`),
  `:5673` (the `JSON.stringify` call), `:5696`
  (**`translateInterpolationOutbound`**), `:5725` (the theta→wire map),
  `:5729–5734` (**the re-key site**), `:5760–5784` (`interpolationTypeOf`, which
  sets no sidecars), `:2330`, `:3375` (the two `lowerQueryResponseSchema` call
  sites); `src/parser/body-type-lowering.ts:57–60` (`LowerableField`, no
  `wireName`), `:109–140` (`lowerObjectFields`, theta-keyed `properties`);
  `src/runtime/query-schema-lowering.ts:113` (`lowerQueryResponseSchema`);
  `src/parser/schema-lowering.ts:243` (`buildSidecar`, no production caller);
  `src/runtime/wire-translation.ts:118`, `:129` (`translateInbound` /
  `rebuildInbound`, `Object.entries` at `:159`), `:183`, `:193`
  (`translateOutbound` / `lowerOutbound`); `src/render/query-render.ts:423` (the
  sole `translateOutbound` call, gated on `type.sidecars`);
  `src/parser/system-interpolation.ts:407`, `:413` (sidecar forwarding), `:480`
  (the `system:` render).
- Test evidence at `bb5206a6`: `tests/ctor-declaration-order.test.ts` (bug 0080's
  witness, 16 cells; cell O at `:540–553`; the production drive harness the
  reproduction reuses); `tests/live/live-production-acceptance.test.ts:1436` (the
  additive H8a cell); `tests/wire-name-translation.test.ts` (the sidecar
  fixtures, all `FirstName`-shaped). No test in the tree declares an
  integer-like wire name.
- Reproduction: a scratch vitest config and four scratch probe files at
  `bb5206a6` — twelve production-drive and seam rows (R1–R12) over the real
  `createProductionProducerDeps` / `bindPromptConversation` / `executeBody`, the
  real `parseThetaDocument`, the real `lowerQueryResponseSchema` and the real
  `translateInbound`, plus the escape-form rows (E1) and the two
  annotation-parse rows (A1, A2). Run on the outputs quoted above, then deleted.
  No file in the tree was written by the probe. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.
