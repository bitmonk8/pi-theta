# Bug 0114 — A `Result` nested inside an interpolated object or array is serialised as its interpreter-private `{"ok":…,"value":…}` carrier: the value is classified once at the top level, so `${[Ok(1)]}`, `${rs}` over a `par for` value, and a schema value whose `array<integer>` field holds an `Ok` all load with zero diagnostics, raise no panic, and put the brand's carrier keys in the prompt text sent to the model — the residual bug 0079's §Non-goals fenced, whose disposition QRY-18 does not state

- **Status:** open. §Fix is not settled: this report exists to pin the QRY-18
  nested disposition before any code lands. No ordering dependency —
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) is
  **fixed (0.69.0)** and owns both sites a fix here rebases on (one static
  emission, one runtime raise).
- **Sev/Diff estimate:** S1/D3 — S1 because an encoding
  `docs/spec_topics/runtime-value-model.md:16` declares an implementation detail
  free to change reaches the model on a load-clean production path with no
  diagnostic at any severity and no panic; D3 because the disposition (recurse
  the existing rejection, panic at the nested position, or amend QRY-18) is
  adjudicated in-run, and any route rebases on bug 0079's 22-cell witness
  including its nine false-positive controls.
- **Kind:** defect against `docs/spec_topics/runtime-value-model.md:14` on the
  better-supported reading, and a spec gap in QRY-18 on the other. `:14` ends "so
  a `Result` value never crosses the wire"; the measured prompt text carries
  `{"ok":true,"value":1}`. QRY-18
  (`docs/spec_topics/query/query-escapes-stringification.md:16–28`) keys its table
  on the interpolated expression's own static type and gives `Result<T, E>` one
  disposition (`:28`), but no sentence there says what happens to a `Result`
  *inside* an `array<T>` (`:26`) or a Schema-typed object (`:27`) being
  stringified. Which text governs is argued in §Expected behaviour; the
  adjudication is this report's deliverable.
- **Related:**
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the parent. It closed the top-level case in both halves:
    the static gate refuses the load, and `interpolationTypeOf` plus
    `InterpolatedResultPanic` abort the render for a `Result` the gate could not
    prove. Its §Non-goals fenced "the enum, array, object, or numeric rows of the
    QRY-18 table" out of scope, and its §Fix record §Residuals (i) states this
    residual by name. **This report is therefore a deliberately deferred residual
    of that fix, not a regression it introduced** — measured below: the two arms
    0079 added are never entered for a nested value.
  - [0017](./0017-ok-field-object-misclassified-as-result.md) — **fixed
    (0.27.0)**, the binding constraint on any fix. It established that a `Result`
    is recognised by the interpreter-private non-enumerable brand and never by
    the `{ ok, … }` shape, so an ordinary object carrying a boolean `ok` field
    must keep taking QRY-18's object row. Bug 0079's cells (c1)–(c3)
    (`tests/interpolated-result-gate.test.ts:898`, `:928`, `:950`) pin that at
    the top level; §Reproduction pins the same shapes at the nested position.
  - [0020](./0020-enum-schema-tags-presence-only-forgeable.md) — **fixed
    (0.32.0)**, the shared brand posture. It made all three tags
    (`ENUM_TAG` / `SCHEMA_TAG` / `RESULT_TAG`) read through one
    descriptor-checking helper (`privateBrandOf`, `src/runtime/value.ts:186`), so
    a fix classifying by anything other than `isResultValue`
    (`src/runtime/value.ts:334`) reopens both that bug and 0017.
  - [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) —
    **fixed (0.39.0)**, the same encoding through a different escape hatch. It
    gated the four runtime **read** entry points so `r.ok` is unreadable outside
    `match` / `?`. The interpolation **render** is a fifth site; 0079 closed its
    top-level position, and the nested position is the part of that site still
    open.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**, why
    one nested route is already closed and the neighbouring one is not. Its fix
    decides a `result-ctor` *field value* incompatible outright
    (`forceIncompatible`, `src/parser/type-compat.ts:492–498`, `:510`, driven
    from `src/parser/type-layer-checks.ts:1046`), so `S { n: Ok(1) }` draws
    `theta/parse/object-field-type-mismatch` — measured. The array-element sink
    reached from the adjacent line (`:1049–1050` → `checkArrayLiteral`, `:930`)
    has no counterpart, so `S { xs: [Ok(1)] }` under `xs: array<integer>` is
    silent — also measured.
  - [0019](./0019-question-operand-bypasses-result-normalisation.md) — **fixed
    (0.31.0)**, the posture precedent. It records the fail-safe direction for a
    partial `Result`-shaped static gate: defer what cannot be proven to the
    runtime rather than refuse a valid theta. Bug 0079 adopted the same posture,
    and this report's §Fix (c) is the observation that deferral only helps where
    a runtime arm exists.
- **Affected** (every citation verified at HEAD `a410f727`, 0.69.0):
  - `stringifyInterpolation` (`src/extension/production-theta-producer.ts:5657`)
    — **the defect site.** It derives the QRY-18 discriminator **once**, from the
    whole interpolated value (`:5665`), and for the `array` and `object` arms
    (`:5666`) returns
    `JSON.stringify(translateInterpolationOutbound(value, env))` at `:5673`. Bug
    0079's raise sits at `:5680`, past that return, so it is unreachable for any
    value whose top level is an array or an object.
  - `translateInterpolationOutbound` (`:5696`) — the recursion that reaches the
    nested value. It tests `isEnumValue` (`:5701`), recurses element-wise over
    arrays (`:5705–5707`), passes primitives through (`:5709`), reads the
    declaring-schema brand with `schemaTagOf` (`:5718`), resolves a declaration
    (`:5721`), builds the theta→wire field map (`:5723–5727`), and recurses per
    key at `:5730–5734` with `wireKey = thetaKey` when no schema resolved. It
    consults neither `isResultValue` nor `interpolationTypeOf`: a nested `Result`
    is an object whose brand is `RESULT_TAG`, so `schemaTagOf` answers
    `undefined` (`src/runtime/value.ts:300`, reading `SCHEMA_TAG` through
    `privateBrandOf`) and the carrier's own enumerable keys `ok` / `value` /
    `error` are emitted verbatim.
  - `interpolationTypeOf` (`:5760`) — the classifier bug 0079 extended. Its
    `Array.isArray` arm (`:5776`) precedes the `isResultValue` arm (`:5779`), and
    the `object` fall-through is `:5783`. Both orderings are correct for the
    value's own shape; neither says anything about the value's contents.
  - `InterpolatedResultPanic` (`src/render/query-render.ts:110`), a `ThetaPanic`
    subclass carrying `INTERPOLATED_RESULT_CODE` (`:80`) and
    `INTERPOLATED_RESULT_MESSAGE` (`:95`). The **sole** runtime raise in `src/`
    is `production-theta-producer.ts:5680`; the diagnostic it carries comes from
    `stringifyInterpolatedValue`'s `case "result"`
    (`query-render.ts:396`, arm at `:431–441`).
  - `stringifyInterpolatedValue`'s own `array` / `object` arm
    (`query-render.ts:415–429`) is a second renderer with its own lowering
    (`translateOutbound`). Production `@`-query interpolation never reaches it —
    `stringifyInterpolation` returns at `:5673` first — so it serves only the
    `system:` surface, which cannot carry a `Result`
    (`src/parser/system-interpolation.ts:390`, and the reasons recorded at
    `:383–389` and `:447–451`: `params:` types never include `Result`).
  - `checkQueryInterpolationResults` (`src/parser/type-layer-checks.ts:1271`),
    driven from `walkExpr`'s `query` arm (`:1191–1193`); the **sole** static
    emission of the code in `src/` is `:1291`.
  - `interpolationIsResult` (`:1325`) — why the static half is silent here. It
    switches on the **top-level** node kind: `result-ctor` / `call`
    (`:1330–1332`), `ident` (`:1333–1336`), `index` (`:1337–1340`). An `array`
    literal and an `object` literal fall to `default: return false`
    (`:1341–1348`), whose comment scopes the default to expressions that "type as
    a `named` reference built from an author-chosen identifier" — a container
    holding a `Result` is neither classified nor descended into.
  - `checkCommonType` (`src/parser/type-compat.ts:555`) — the array-element sink.
    Its sink loop (`:566–586`) skips any branch whose compatibility answer is
    `"unknown"` (`:570–572`), and a `result-ctor` types as an unresolvable
    `named "Ok"` (the fact `checkObjectFieldCompat`'s docstring states at
    `:496–498`), so a written `array<integer>` sink admits an `Ok` element in
    silence. Measured against a `["a"]` element, which the same sink refuses with
    `theta/parse/array-element-type-mismatch`.
  - `evaluatePureExpression` (`production-theta-producer.ts:5794`) — what makes
    the nested value constructible inside an interpolation: the `array` arm
    (`:5807`), the object-literal / constructor arm (`:5809–5824`, branding at
    `:5821`), and the `result-ctor` arm (`:5860–5864`).
  - `docs/spec_topics/runtime-value-model.md:14` — the `Result` row: "Theta code
    observes `Result` only through `Ok` / `Err` constructors, `match` patterns,
    and `?`; the in-memory shape is not part of the language surface", ending "so
    a `Result` value never crosses the wire". `:16` — the reference-encoding
    paragraph naming `{ ok: true, value: T }` / `{ ok: false, error: E }`, "The
    interpreter recognises a `Result` by that brand, never by the `{ ok, … }`
    shape", and "These shapes are implementation details … either may change
    without a spec revision".
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18's rule
    ("renders the result into the prompt text by the **Theta static type** of the
    expression"); `:26` the `array<T>` row and `:27` the Schema-typed object row,
    both "`JSON.stringify` of the value, **compact** …, with wire-name
    translation applied recursively"; `:28` the `Result<T, E>` row; `:32` the
    static/runtime split; `:33` the outbound-translation note. No sentence on the
    page addresses a `Result` at a nested position.
  - `docs/spec_topics/control-flow.md:74` — CTRL-3: "The value is
    `array<Result<T, QueryError>>`". The one composite the spec itself specifies
    as an array of `Result`s, and §Reproduction's first row.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:72` — the
    `theta/parse/interpolated-result` row. *Trigger*: "`${expr}` interpolation
    whose `expr` has Theta static type `Result<T, E>` (the runtime renderer
    raises the same code as a panic when the type is statically unresolvable)".
    A container's static type is `array<…>` or a schema, not `Result<T, E>`, so
    this Trigger as written does not admit a nested-position emission — the DIAG-2
    question in §Fix (b).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a *Trigger* change is a spec change landing in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative).
  - `docs/spec_topics/errors-and-results/error-model.md:65–74` — the six
    spec-defined panic sources, each carrying a `theta/runtime/*` code, and the
    sentence "This list is closed for *spec-defined* panic sources". QRY-18's
    interpolation panic carries a `theta/parse/*` code and is absent from the
    list; the mirror `docs/reference/errors-and-results.md:80–89` enumerates the
    same six. Bug 0079's fix record flags this silence for an operator decision;
    §Fix (b) records that a panic route here inherits it rather than creating it.
  - `docs/spec_topics/control-flow.md:78` — CTRL-5's panic-downgrade at the
    `par for` iteration boundary, mirrored at
    `docs/reference/errors-and-results.md:120–126` (ERR-20). It does not apply to
    a render in the enclosing theta, which is where this panic would be raised.
  - `docs/reference/diagnostics.md:121` — the *Message* mirror;
    `docs/reference/frontmatter.md:256–265` — the user-facing statement of the
    rule, whose last clause reads "`Result<T, E>` interpolands are rejected at
    parse time (`theta/parse/interpolated-result`)". A route that panics at a
    nested position rather than rejecting reaches this sentence.
  - `tests/interpolated-result-gate.test.ts` — bug 0079's 22-cell witness and the
    harness any fix extends. The cells that constrain a fix: the nine
    false-positive controls (a4)–(a7) (`:615`, `:628`, `:641`, `:655`) and
    (a11)–(a15) (`:727`, `:738`, `:748`, `:761`, `:774`), three of which are the
    shapes of shipped H9a acceptance fixtures; bug 0017's runtime controls
    (c1)–(c3) (`:898`, `:928`, `:950`); the `par for` **element** cell (a9)
    (`:691`), which is the nearest existing coverage and pins the read rather
    than the container; and the DIAG-4 drift guard (d1) (`:976`). Cell (c3)
    counts carrier-prefix texts within **its own drive**, not file-wide, so added
    cells do not collide with it.
  - `tests/query-render.test.ts:168`, `:171`, `:176` — the direct seam calls on
    `stringifyInterpolatedValue`'s `array`, `object` and `result` arms. All three
    pass a flat value; none nests a `Result`.
  - **Test coverage of this defect: none.** No test in the tree interpolates a
    container holding a `Result`, in either direction. Grepped at HEAD: the only
    `{"ok":` texts any test admits on the wire are bug 0079's (c1)/(c2)
    controls (`tests/interpolated-result-gate.test.ts:925`, `:947`) and its two
    pre-fix baseline constants (`:578`, `:579`); no test interpolates a whole
    array or a whole `par for` value.
    `tests/schema-brand-symbol-migration.test.ts:699`, `:703` assert the same two
    carrier strings out of a direct `JSON.stringify` — the unit-level statement
    that the brand itself does not serialise, not a render reaching a session.
- **Observed at:** `0.69.0` (HEAD `a410f727`). Offline, deterministic; no
  provider, no model dispatch. Scratch vitest reusing bug 0079's own drive
  harness verbatim in shape (`tests/interpolated-result-gate.test.ts:521–552`):
  the real `parseThetaDocument`, then `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody` against the live-session double, with
  the prompt text captured at `pi.sendUserMessage`. An untyped prompt-mode query
  never dispatches `complete()`. Written, run, deleted.

## Summary

QRY-18 renders a `${…}` interpolation by the interpolated expression's type, and
bug 0079 (0.69.0) closed the case where that type is a `Result`: the static gate
refuses the load where the `Result`-ness is provable, and
`InterpolatedResultPanic` aborts the render otherwise. Both arms act on the
**top level** of the interpolated value. `stringifyInterpolation` derives the
discriminator once
(`src/extension/production-theta-producer.ts:5665`) and, for the `array` and
`object` arms, returns at `:5673` before the raise at `:5680` is reachable.
Serialisation from there is `translateInterpolationOutbound` (`:5696`), which
recurses through arrays and object keys and classifies nothing: it reads a
declaring-schema brand (`:5718`), and a `Result` value carries `RESULT_TAG`
rather than `SCHEMA_TAG`, so no schema resolves and the loop at `:5730–5734`
recurses with the carrier's own keys unchanged.

The consequence is that containment defeats both halves of the 0079 fix. Measured
at one HEAD: `${[Ok(1)]}` renders `x[{"ok":true,"value":1}]`; a `par for` value
interpolated whole renders `x[{"ok":true,"value":2},{"ok":true,"value":3}]`; a
schema value whose `array<integer>` field holds an `Ok` renders
`x{"xs":[{"ok":true,"value":1}]}`. Each source parses with an empty
`diagnostics` array, each drive completes without a panic, and each text arrives
at `pi.sendUserMessage` intact. The element **read** off the same containers is
covered: `${rs[0]}` is refused at load and `${xs[0]}` over `let xs = [Ok(1)]`
panics at run, and neither sends anything. The gap is precisely the
nested-position serialisation.

`docs/spec_topics/runtime-value-model.md:14` states "a `Result` value never
crosses the wire", and `:16` names the carrier an implementation detail that "may
change without a spec revision". Both are false for that one position: the bytes
reach the model, so the encoding is observable and a change to it would change
what an author's theta sends. QRY-18 does not resolve the conflict, because its
table is keyed on the interpolated expression's own type and its `array<T>`
(`:26`) and object (`:27`) rows instruct recursive `JSON.stringify` without
qualification. This is the same privacy family as bugs
[0017](./0017-ok-field-object-misclassified-as-result.md),
[0020](./0020-enum-schema-tags-presence-only-forgeable.md),
[0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) and
[0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md), and it
is the residual 0079's §Non-goals fenced by naming the array and object rows out
of scope.

## Reproduction

Offline, at `a410f727`. Scratch vitest over bug 0079's drive harness: the real
parse, then the production composition drive, with the prompt text read at
`pi.sendUserMessage`. `diagnostics` is the parse's whole array, unfiltered;
`sent` is every text handed to `pi.sendUserMessage`.

### The measurement — the value CTRL-3 specifies, interpolated whole

Source (frontmatter `mode: prompt` throughout):

```theta
let ns = [1, 2]
let rs = par for n in ns {
  n + 1
}
@`x${rs}`
```

```
@@ ${rs} — the whole par for value
   diagnostics :: []
   sent        :: ["x[{\"ok\":true,\"value\":2},{\"ok\":true,\"value\":3}]"]
   no throw
@@ ${rs[0]} — the ELEMENT read, same fixture                        [covered]
   diagnostics :: [error theta/parse/interpolated-result]
   sent        :: []
   THREW panic theta/parse/interpolated-result
```

CTRL-3 (`docs/spec_topics/control-flow.md:74`) fixes this value as
`array<Result<T, QueryError>>`, so the source is not a contrivance: it is the one
composite the spec defines as an array of `Result`s, and interpolating it whole
is how an author dumps the fan-out into a prompt. The two rows differ by two
characters and produce opposite dispositions.

### The array row, at its smallest

```
@@ @`x${[Ok(1)]}`                      inline array literal, no binding
   diagnostics :: []       sent :: ["x[{\"ok\":true,\"value\":1}]"]
@@ let xs = [Ok(1)] / ${xs}            bound, unannotated
   diagnostics :: []       sent :: ["x[{\"ok\":true,\"value\":1}]"]
@@ let xs: array<integer> = [Ok(1)] / ${xs}          written non-Result sink
   diagnostics :: []       sent :: ["x[{\"ok\":true,\"value\":1}]"]
@@ let xs: array<Result<integer, QueryError>> = [Ok(1)] / ${xs}
   diagnostics :: []       sent :: ["x[{\"ok\":true,\"value\":1}]"]
@@ @`x${[Ok(1), Err(2)]}`              both arms of the carrier
   diagnostics :: []
   sent :: ["x[{\"ok\":true,\"value\":1},{\"ok\":false,\"error\":2}]"]
@@ @`x${[1, Ok(2), "s"]}`              one Result among ordinary elements
   diagnostics :: []       sent :: ["x[1,{\"ok\":true,\"value\":2},\"s\"]"]
```

The fourth row is the sharpest: the author **writes** `Result` in the element
annotation and the load is still clean. `interpolationIsResult`'s generic-name
acceptance (`isResultGenericType`, `src/parser/type-layer-checks.ts:1376`) is
reached only for an `ident` or an `index` whose own type spells `Result<…>`; an
`array<Result<…>>` type is an array, and the `array` node falls to the `default`
arm (`:1341–1348`).

### The object row

```
@@ schema S { xs: array<integer> } / let s = S { xs: [Ok(1)] } / ${s}
   diagnostics :: []       sent :: ["x{\"xs\":[{\"ok\":true,\"value\":1}]}"]
@@ @`x${ {r: Ok(1)} }`                 bare object literal inside the interpolation
   diagnostics :: []       sent :: ["x{\"r\":{\"ok\":true,\"value\":1}}"]
```

The first row reaches QRY-18's Schema-typed object row through a
brand-carrying value: `translateInterpolationOutbound` resolves `S`, renames
nothing, recurses into the `array<integer>` field with that declared type as the
hint, and the element resolves no schema of its own. The declared element type is
`integer`; the sink that would have rejected it is measured under §Actual
behaviour.

The second row is the object arm reached directly. The same literal in statement
position is refused — `let o = { r: Ok(1) }` draws
`theta/parse/bare-object-literal`, so the spelling bug 0079's §Residuals (i)
gives for the object arm does **not** load. Whether the bare-object-literal rule
(`docs/spec_topics/expressions.md`, §Object construction) should reach an
interpolation source is a separate question this report does not adjudicate; it
is fenced in §Non-goals.

### Depth

```
@@ let xs = [[Ok(1)]] / ${xs}
   diagnostics :: []       sent :: ["x[[{\"ok\":true,\"value\":1}]]"]
@@ let xs = [rs] / ${xs}               the par for value, one container deeper
   diagnostics :: []
   sent :: ["x[[{\"ok\":true,\"value\":2},{\"ok\":true,\"value\":3}]]"]
@@ schema S { xs: array<integer> } / let s = S { xs: rs } / ${s}
   diagnostics :: []
   sent :: ["x{\"xs\":[{\"ok\":true,\"value\":2},{\"ok\":true,\"value\":3}]}"]
```

The recursion is unbounded in the same way `translateInterpolationOutbound` is:
one leak per `Result` reached, at any depth, in one render.

### The positions already covered — the contrast that makes this a residual

```
@@ @`x${Ok(1)}`                        top-level constructor
   diagnostics :: [error theta/parse/interpolated-result]   sent :: []
   THREW panic theta/parse/interpolated-result
@@ let r = Ok(1) / ${r}                top-level binding
   diagnostics :: [error theta/parse/interpolated-result]   sent :: []
   THREW panic theta/parse/interpolated-result
@@ let rs = par for … / ${rs[0]}       element READ, CTRL-3's generic element type
   diagnostics :: [error theta/parse/interpolated-result]   sent :: []
   THREW panic theta/parse/interpolated-result
@@ let xs = [Ok(1)] / ${xs[0]}         element READ off an inferred array
   diagnostics :: []                                        sent :: []
   THREW panic theta/parse/interpolated-result
@@ schema S { n: integer } / let s = S { n: Ok(1) }         bug 0031's route
   diagnostics :: [error theta/parse/object-field-type-mismatch]
@@ schema S { r: Result<integer, QueryError> }              a Result-typed field
   diagnostics :: [error theta/parse/result-in-schema-position, …]
```

One HEAD, one encoding, six refusals and the twelve silent renders above. The
difference is never the value — it is whether a container stands between the
`Result` and the interpolation. The fourth row shows the two halves of the 0079
fix at their boundary: an inferred array binding's element type does not spell the
generic form, so only the runtime arm fires, and it still sends nothing. The probe
drives every row whatever the parse said, so the refused rows show both
dispositions; in production an error-severity parse diagnostic un-registers the
theta and the render is never reached.

### The controls a fix must preserve

```
@@ schema F { ok: boolean, label: string } / let xs = [F { ok: true, label: "x" }] / ${xs}
   diagnostics :: []       sent :: ["x[{\"ok\":true,\"label\":\"x\"}]"]
@@ schema G { ok: boolean, error: string } / schema H { g: G }
   let h = H { g: G { ok: false, error: "boom" } } / ${h}
   diagnostics :: []       sent :: ["x{\"g\":{\"ok\":false,\"error\":\"boom\"}}"]
@@ schema P { m as "wire_m": string } / schema Q { p: P }
   let q = Q { p: P { m: "a" } } / ${q}
   diagnostics :: []       sent :: ["x{\"p\":{\"wire_m\":\"a\"}}"]
@@ schema P { m as "wire_m": string } / let xs = [P { m: "a" }] / ${xs}
   diagnostics :: []       sent :: ["x[{\"wire_m\":\"a\"}]"]
@@ enum S { Ok, Bad } / let xs = [S.Ok] / ${xs}
   diagnostics :: []       sent :: ["x[\"Ok\"]"]
@@ @`x${[1, 2]}`                       diagnostics :: []   sent :: ["x[1,2]"]
@@ schema P { m: string } / let xs = [P { m: "a" }] / ${xs}
   diagnostics :: []       sent :: ["x[{\"m\":\"a\"}]"]
```

Rows 1 and 2 are bug 0017's invariant at the nested position: an object whose
own declared fields spell `ok`, and one byte-identical to the `Err` carrier, must
keep rendering their fields. Rows 3 and 4 are QRY-18 `:33`'s recursive
wire-name translation, which any change to the recursion must not disturb. Row 5
is the enum row inside a container. Rows 6 and 7 are the ordinary cases.

## Expected behaviour

Two readings are available, and which governs is the adjudication this report
owes.

**Reading A — `runtime-value-model.md:14`'s conclusion is unconditional, and the
implementation is non-conformant.** `:14` ends "so a `Result` value never crosses
the wire", and `:16` states the carrier shapes "are implementation details —
neither is reachable from theta code, neither appears in any wire schema, and
either may change without a spec revision". The measured prompt text is what the
model receives, so on this reading both sentences are falsified at the nested
position: the shape is reachable, and changing `{ ok, value }` to anything else
would change the bytes an unmodified theta sends. QRY-18 `:28` gives `Result` one
disposition, and reading `:26` / `:27` as licence to serialise the same value one
container down makes the disposition depend on containment, which no sentence
states.

**Reading B — QRY-18's array and object rows govern, and the corpus is merely
underdetermined.** `:14`'s conclusion is *derived*: its warrant is the
lowered-schema argument ("`Result` is not a lowerable type form and is rejected
in any schema-feeding position at parse time"). A rendered prompt is not a
lowered schema and is not AJV-validated, so the warrant does not reach it, and
what governs instead is the row for the interpolated expression's actual static
type — `array<T>` (`:26`) or Schema-typed object (`:27`), each instructing
compact `JSON.stringify` with recursive wire-name translation. On this reading
the implementation does exactly what those rows say and the defect is a silence,
not a violation.

**Reading A is better supported.** Four reasons:

1. `:16`'s "may change without a spec revision" is not satisfiable under Reading
   B. If the nested carrier is licensed output, its bytes are part of what a
   theta sends to a model, and a future change to the encoding changes program
   behaviour — which is the definition of a spec-relevant surface. Reading A
   keeps the sentence true; Reading B makes it false while claiming the
   implementation is correct.
2. The whole privacy family exists to keep this encoding out of author- and
   model-visible positions: 0017 (never classify by `{ ok, … }` shape), 0020 (one
   descriptor-checked brand read for all three tags), 0027 (four runtime read
   gates), 0079 (the interpolation render). Reading B admits the encoding at one
   position of the very site 0079 was filed to close.
3. The corpus already treats a `Result` inside a schema-typed container as
   inadmissible on the type side, for a reason that is about lowerability rather
   than about interpolation: `checkObjectFieldCompat`'s `forceIncompatible`
   (`src/parser/type-compat.ts:492–498`) decides a `result-ctor` field value
   incompatible with **any** declared field type precisely because
   `theta/parse/result-in-schema-position` makes a `Result`-typed field
   undeclarable. Measured, that closes `S { n: Ok(1) }`. Reading B has to hold
   that the same value, one level further inside the same constructor, is
   licensed output.
4. Reading B's texts are about the *shape* of a well-typed container's render.
   Neither `:26` nor `:27` contemplates an element whose type the type layer
   never resolved; treating them as governing here lets the general rule about
   container rendering override the specific rule about `Result` visibility.

Reading A does not make the corpus complete. QRY-18 states no nested disposition,
no range for one, and no interaction with `:26`/`:27`'s recursive translation.
`code-registry-parse.md:72`'s *Trigger* names an "`${expr}` interpolation whose
`expr` has Theta static type `Result<T, E>`", which a container's type is not.
One clarifying sentence is owed — at `:28`, or as a fourth note under the QRY-18
table — before code lands. That sentence is what this report asks for.

Under Reading A, on the measured input, the following hold whatever route §Fix
takes:

- No render reaching `pi.sendUserMessage` contains the carrier keys of a branded
  `Result` at any depth.
- The disposition is the registered `theta/parse/interpolated-result` — one code,
  and DIAG-4 forbids rewording its *Message*, which renders correctly for a
  nested position as written.
- Bug 0017's controls keep rendering: classification stays `isResultValue`, never
  key presence, at every depth.
- QRY-18 `:33`'s recursive wire-name translation is unchanged for every value
  that is not a `Result`.

## Actual behaviour / root cause

**The QRY-18 discriminator is derived once, from the top level.**
`stringifyInterpolation` (`src/extension/production-theta-producer.ts:5657`)
computes `interpolationTypeOf(value)` at `:5665` and branches at `:5666`:

```ts
  const type = interpolationTypeOf(value);
  if (type.kind === "object" || type.kind === "array") {
    return JSON.stringify(translateInterpolationOutbound(value, env));
  }
  const rendered = stringifyInterpolatedValue(value, type);
  if (!rendered.ok) {
    throw new InterpolatedResultPanic(rendered.diagnostic.message);
  }
```

Bug 0079's raise is the `throw` at `:5680`. For a container it is dead code: the
function has already returned at `:5673`. `interpolationTypeOf`'s own arm order
is correct for the value's own shape — `Array.isArray` at `:5776` before
`isResultValue` at `:5779` — and irrelevant to contents, which it never
inspects.

**The recursion classifies nothing.** `translateInterpolationOutbound` (`:5696`)
has four dispositions: enum → bare wire string (`:5701`), array → element-wise
recursion (`:5705–5707`), non-object → passthrough (`:5709`), object → resolve a
declaring schema and recurse per key (`:5717–5735`). A branded `Result` takes the
object arm: `schemaTagOf` (`:5718`) reads `SCHEMA_TAG` and a `Result` carries
`RESULT_TAG`, so `brand` is `undefined`; `typeHint` is either absent or names a
non-schema type (`integer` in the measured schema-field row), so `schemaName` is
`undefined` and `decl` is `undefined`; the field map stays empty and `:5730–5734`
copies every own enumerable key through with `wireKey = thetaKey`. The keys are
the carrier's — the brand itself is a non-enumerable symbol and stays behind, as
`src/runtime/value.ts:72–88` describes. The docstring's stated default ("A value
whose schema cannot be resolved recurses with its keys unchanged (the safe
no-rename default)") is exactly the behaviour; it is safe for an un-branded
object literal and wrong for a `Result`.

**The static half never descends either.** `interpolationIsResult`
(`src/parser/type-layer-checks.ts:1325`) switches on the top-level node kind and
returns `false` at `:1341–1348` for `array` and `object`. That default is
deliberate and, for its own purpose, correct: the comment records that the
remaining kinds "type as a `named` reference built from an author-chosen
identifier", so classifying them by type name would false-positive the nine
controls bug 0079's round 1 established. A nested `Result` is not a
misclassification risk — it is an input class the walk does not visit.

**A written non-`Result` element sink does not reject it either.** For a
constructor field declared `array<T>`, `type-layer-checks.ts:1049–1050` calls
`checkArrayLiteral` (`:930`), which passes the element types to `checkCommonType`
(`src/parser/type-compat.ts:555`). Its sink loop skips any branch whose
compatibility answer is `"unknown"` (`:570–572`), and a `result-ctor` types as an
unresolvable `named "Ok"`, so the branch is skipped. Measured discrimination on
one fixture:

```
@@ schema S { xs: array<integer> } / S { xs: ["a"] }
   diagnostics :: [error theta/parse/object-field-type-mismatch,
                   error theta/parse/array-element-type-mismatch]
@@ schema S { xs: array<integer> } / S { xs: [Ok(1)] }
   diagnostics :: []
@@ let xs: array<integer> = ["a"]
   diagnostics :: [error theta/parse/let-rhs-type-mismatch,
                   error theta/parse/array-element-type-mismatch]
@@ let xs: array<integer> = [Ok(1)]
   diagnostics :: []
```

The sink exists and fires; a `Result` element passes it. The asymmetry is
attributable: `checkObjectFieldCompat` takes a `forceIncompatible` flag set from
`value.kind === "result-ctor"` (`type-layer-checks.ts:1046`), and the
array-element path has no counterpart.

**No post-condition exists anywhere on the render path.**
`translateInterpolationOutbound` returns `unknown`, and a tree containing a
carrier is the same type as one that does not. `JSON.stringify` of the carrier
succeeds — the brand is symbol-keyed and absent from JSON output by construction
(`src/runtime/value.ts:72–88`) — so the leak produces well-formed output that no
caller can distinguish from a legitimate render. This is the same conflation bug
0079 identified at the top level, one layer inside the value.

**Reach.** One entry point (`renderQueryText`, `:5626`, the sole caller of
`stringifyInterpolation`), one recursion, one static walk. The `system:`
interpolation surface is not reachable: `toInterpolationType`
(`src/parser/system-interpolation.ts:390`) has no `result` arm because `params:`
types never include `Result` (`:383–389`), and that surface's array/object
rendering is a different function (`query-render.ts:415–429`) which production
`@`-query interpolation never enters.

## Why it matters

- **The prompt is silently wrong, and the author cannot see it.** Measured: twelve
  sources render interpreter bookkeeping into the prompt text with an empty parse
  `diagnostics` array and no panic. An author writing ``@`Review these: ${rs}` ``
  intends the payloads; the model receives `ok` / `value` / `error` keys that
  name nothing in the theta's source.
- **It is on the idiomatic path for the one composite the spec defines as an
  array of `Result`s.** CTRL-3 fixes a `par for` value as
  `array<Result<T, QueryError>>` and CTRL-5 makes per-element `Err` the normal
  outcome, so interpolating that value is how a fan-out result reaches a prompt.
  Measured, that exact source leaks; changing `${rs}` to `${rs[0]}` refuses the
  load.
- **The disposition depends on containment, which no spec sentence mentions.**
  Two characters separate a refused load from a silent leak, on one fixture at one
  HEAD. An author cannot predict which they get from anything QRY-18 says.
- **It re-exposes an encoding the corpus declares free to change.**
  `runtime-value-model.md:16` states the carrier "may change without a spec
  revision". For as long as these renders reach the model that sentence is false
  in one position: a change to the carrier changes what an unmodified theta sends.
- **A written `Result` element annotation buys nothing.** Measured:
  `let xs: array<Result<integer, QueryError>> = [Ok(1)]` loads clean and leaks.
  The author has said the word `Result` in the source and the gate that exists
  for that word does not see it.
- **The type-side asymmetry is arbitrary from the author's seat.**
  `S { n: Ok(1) }` is refused and `S { xs: [Ok(1)] }` is admitted, one line apart
  in the same schema, because one sink forces incompatibility for a
  `result-ctor` and the neighbouring one skips unresolvable branches.
- **Nothing in the suite scores it.** No test interpolates a container holding a
  `Result`. Bug 0079's witness has one adjacent cell — (a9), the `par for`
  **element** read (`tests/interpolated-result-gate.test.ts:691`) — and the
  container it reads from is unexercised.

## Non-goals

- **Rendering a `Result` usefully** (as its payload, or as a summary). QRY-18
  `:28` fixes the disposition as a rejection; changing that is a GOV-30 spec
  edit, which bug 0079's §Fix record pins as a settled disposition.
- **The top-level positions.** Bug 0079 closed them, in both halves, and
  §Reproduction re-measures six refusals at this HEAD to keep the boundary
  visible. Nothing here reopens the classification order in
  `interpolationTypeOf` or the provenance channels in `interpolationIsResult`.
- **Whether `theta/parse/bare-object-literal` should reach an interpolation
  source.** Measured: `let o = { r: Ok(1) }` is refused in statement position and
  the same literal inside `${…}` is not. That asymmetry is an input class of the
  `expressions.md` §Object construction rule, adjudicated on its own terms; this
  report uses the interpolation spelling only as a measured route to QRY-18's
  object row and does not decide whether the route should exist.
- **The array-element sink's treatment of an unresolvable branch.**
  `checkCommonType`'s `"unknown"` skip (`src/parser/type-compat.ts:570–572`) is a
  deliberate deferral to the runtime safety net, and widening it touches every
  array literal in the language. §Fix (c) records why a sink-side fix cannot be
  the whole answer; whether bug 0031's `forceIncompatible` route should extend to
  the element position is a separate adjudication.
- **The `system:` interpolation surface**, which cannot carry a `Result` by
  construction (`src/parser/system-interpolation.ts:383–389`).
- **The `?`-unwrap render.** Bug 0079's §Residuals (iii) records that `${r?}`
  renders `null` rather than the unwrapped payload; filed as
  [0116](./0116-question-unwrapped-interpolation-renders-null.md). A distinct
  wrong observable on a different arm of the same render.
- **Reassignment type-compatibility.** Bug 0079's §Residuals (ii) records that no
  emitter exists for `bindings.md` §Reassignment; filed as
  [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md).
  Unrelated to containment.
- **The closed panic-source enumeration.** `error-model.md:65–74` lists six
  `theta/runtime/*` panic sources and does not mention QRY-18's interpolation
  panic. That silence predates this report (bug 0079's fix record raises it for an
  operator decision), is not created by any route here, and is filed as
  [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md); §Fix (b)
  records the interaction.

## Fix

**Not settled. This report exists to pin the QRY-18 nested disposition first.**
Bug 0079 fenced these rows in its §Non-goals and recorded the residual without a
disposition; QRY-18 states none. Five questions have to be answered, and (a) is
the one that gates code.

**(a) What disposition does a `Result` at a nested position take?** Three routes,
with their consequences:

1. **Recurse the existing rejection into nested positions.** The static gate
   descends into an interpolated `array` / `object` literal and the runtime
   recursion raises the same panic at the nested position, so the render fails
   exactly as the top-level case does. This keeps one code, one *Message*, and
   the QRY-18 `:28` disposition uniform under containment. It also makes every
   measured §Reproduction row fail loudly rather than silently, which is what
   Reading A requires. Its cost is scope: a static descent reaches only the
   container the author wrote at the interpolation, so `${[Ok(1)]}` and
   `${ {r: Ok(1)} }` are refusable at load while a `par for` value and a binding
   laundered through an unannotated `fn` are not. Whether the descent also
   extends `resultBindings` (`src/parser/type-layer-checks.ts:563`, written at
   `:660`) to record an array- or object-literal initialiser holding an `Ok` /
   `Err`, the way it already records a direct constructor, is part of this
   route's scope and is not settled here. Everything it cannot prove still needs
   the runtime arm, so route 1 subsumes route 2 rather than replacing it.
2. **Panic at the nested position only, with no static descent.** Smaller: one
   `isResultValue` test in `translateInterpolationOutbound` (`:5696`), raising
   the existing `InterpolatedResultPanic`. It closes the wire leak completely
   with no risk to the nine false-positive controls, because nothing in the parse
   layer changes. Its cost is that QRY-18 `:32`'s "static where possible" claim
   stays as partial for containers as it is today, and a theta that could have
   been refused at load aborts mid-drive instead. Under this route the panic
   surfaces as bug 0079's `theta /<name> aborted: <message>` framing. CTRL-5's
   iteration-boundary downgrade (`docs/spec_topics/control-flow.md:78`) does not
   soften it: the render runs in the enclosing theta, so an author interpolating
   a `par for` value loses the whole theta rather than one element.
3. **Amend QRY-18 to state the nested disposition explicitly**, then implement
   whatever it says. This is route 1 or 2 with the spec sentence written first,
   and is the only route that discharges the `runtime-value-model.md:14` /
   QRY-18 `:26`–`:27` tension in the corpus rather than in code. If the
   adjudication lands on *licensing* the nested render instead, then `:14`'s "a
   `Result` value never crosses the wire" and `:16`'s "may change without a spec
   revision" both need qualifying in the same commit — silence there leaves the
   corpus asserting a rule the implementation does not follow.

The routes are not equivalent on where the fix lives. **A fix here is a
render-path concern first**: measured, the static gate is silent on every nested
form (parse `diagnostics` empty for all twelve rows), and it is silent for the
right reason — its `default` arm exists to avoid the false positives bug 0079's
round 1 found, and none of its nine controls (a4)–(a7), (a11)–(a15) nests a
`Result`, so no nested-position emission can disturb them. The render recursion
is the only place every measured row meets.

**(b) The DIAG-2 obligation.** `theta/parse/interpolated-result`'s *Trigger*
(`code-registry-parse.md:72`) reads "`${expr}` interpolation whose `expr` has
Theta static type `Result<T, E>` (the runtime renderer raises the same code as a
panic when the type is statically unresolvable)". A container's static type is
`array<…>` or a schema, so any route owes a *Trigger* determination: either that
sentence already admits an emission for a `Result` reached *within* the
interpolated value, or it takes a widening naming the nested sub-case, landing in
the same commit per DIAG-2 (`diagnostic-shape.md:72`). Read the row as written
before editing — bug 0079 read the same row and determined no widening was owed
for its own two dispositions. Two constraints hold either way. DIAG-4 (`:74`)
forbids rewording the *Message*, and `Result value cannot be interpolated; unwrap
with ? or match first` renders correctly for a nested position as written. No new
code is required and no closed union is extended; if the adjudication mints a new
code instead, that is a DIAG-2 row addition with its own mirrors. The mirrors a
widening reaches: `docs/reference/diagnostics.md:121` carries no *Trigger*
column, so it does not; `docs/reference/frontmatter.md:256–265` states the rule as
"rejected at parse time", which route 2 makes incomplete and would need the
runtime arm named. A panic route also meets the closed panic-source list
(`error-model.md:65–74`, mirrored at
`docs/reference/errors-and-results.md:80–89`): it enumerates six `theta/runtime/*`
sources and QRY-18's interpolation panic is already absent from it at this HEAD,
so a nested raise inherits that open question rather than creating it — decide
whether to close it in the same commit, or leave it to
[0117](./0117-error-model-omits-parse-coded-interpolation-panic.md), which owns
that enumeration.

**(c) Classification stays the brand, at every depth — binding.** Bug
[0017](./0017-ok-field-object-misclassified-as-result.md)'s invariant is that a
`Result` is recognised by the interpreter-private non-enumerable brand
(`isResultValue`, `src/runtime/value.ts:334`) and never by the `{ ok, … }` shape,
and bug [0020](./0020-enum-schema-tags-presence-only-forgeable.md) makes that one
descriptor-checked read for all three tags. A nested test keyed on key presence
would reclassify §Reproduction's control rows 1 and 2 — an object whose declared
fields are `ok`/`label`, and one byte-identical to the `Err` carrier — and bug
0079's fix record states those controls were proven load-bearing by
neutralisation: re-classifying by `"ok" in value` reddened exactly (c1)–(c3).
This is also why a type-layer-only fix cannot stand alone: measured, the
array-element sink admits an `Ok` element because a `result-ctor` types as an
unresolvable `named "Ok"`, and the sinks reach only *written* element types —
`${[Ok(1)]}`, `let xs = [Ok(1)]` and a `par for` value have no sink at all.

**(d) One emission site and one runtime raise stay one of each.** Bug 0079
established the shape: the sole static emission is
`src/parser/type-layer-checks.ts:1291` and the sole runtime raise is
`src/extension/production-theta-producer.ts:5680` (grepped at HEAD). A nested
route must extend one of those, not add a third: two raises for one code make the
"one emission site" property this family is verified against unstatable, and the
`ThetaPanic` subclassing at `src/render/query-render.ts:110` is what keeps QRY-21
true (a panic during interpolation is not contained by `let _ =`). Any new raise
must be the same class for the same reason.

**(e) The controls stay silent, and the translation stays intact.** Measured
silent today and required silent after: every row of §Reproduction's control
block — bug 0017's two nested shapes, the two wire-name renames (QRY-18 `:33`
recursion, which is the same code path a fix edits), the enum element, a plain
array, and an array of ordinary schema values. Required unchanged: the six
refusals of §Reproduction's covered-positions block, including bug 0031's
`object-field-type-mismatch` route and `result-in-schema-position`.

**Witness — offline, provider-free, zero-token.** Every row of §Reproduction
settles inside one `parseThetaDocument` plus one production-composition drive, so
the harness is `tests/interpolated-result-gate.test.ts` extended, not a new
mechanism — its drive harness (`:521–552`) and its DIAG-4 registry oracle
(`:176–207`) are reused as-is. Required: the `par for` pair (whole value against
element read) as the primary; the six array rows including the written
`array<Result<…>>` annotation; both object rows; the three depth rows; every
control of (e); and the six covered positions, so a fix that regresses the
top-level gate reds here. Expected messages sourced from the registry's *Message*
column per DIAG-4, as that file already does. Cell (c3) (`:950`) counts
carrier-prefix texts within its own drive, so new cells do not collide with it;
the file's `CARRIER_PREFIX` constant (`:582`) is the assertion vocabulary to
reuse.

## Provenance

- Origin: the bug 0079 fix (0.69.0, `a410f727`), whose §Non-goals fenced "the
  enum, array, object, or numeric rows of the QRY-18 table" and whose fix record
  §Residuals (i) states this residual by name — "A `Result` NESTED inside an
  interpolated object or array still serialises the carrier … `translateInterpolationOutbound`
  resolves no declaring schema and recurses with keys unchanged". That report
  attributes its evidence to its round-1 reviewer's out-of-scope probe and its
  verifier's drive probes. Everything quoted in this document was re-measured
  here at `a410f727` through the drive harness described under §Observed at.
  What this report adds beyond the deferral: the measured registered text and
  full parse-diagnostic list for twelve leaking sources and seven controls; the
  `par for` whole-value row (CTRL-3's own composite) and its two-character
  contrast against the element read; the written-`array<Result<…>>` row; the
  schema-field route and the `bare-object-literal` correction to the residual's
  own spelling (a `let`-bound bare object literal does not load); the
  element-sink discrimination isolating why bug 0031's route closes one position
  and not its neighbour; the two readings of `runtime-value-model.md:14` with the
  argument between them; and the five §Fix questions.
- Correction to the residual as written: bug 0079's §Residuals (i) and its fix
  report both give `let o = { r: Ok(1) }` / `${o}` as the object-arm spelling.
  Measured at `a410f727`, that source is refused —
  `theta/parse/bare-object-literal` — so the object arm is reachable through a
  branded schema value whose `array<T>` field holds the `Result`, or through a
  bare object literal written inside the interpolation. The array arm reproduces
  exactly as the residual states.
- Spec: `docs/spec_topics/runtime-value-model.md:14` (the `Result` row and the
  "never crosses the wire" conclusion), `:16` (the reference encoding, the
  brand-not-shape rule, and "may change without a spec revision");
  `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18's rule),
  `:26` (`array<T>`), `:27` (Schema-typed object), `:28` (`Result<T, E>`), `:32`
  (the static/runtime split), `:33` (recursive outbound translation);
  `docs/spec_topics/control-flow.md:74` (CTRL-3), `:78` (CTRL-5's
  iteration-boundary panic downgrade);
  `docs/spec_topics/diagnostics/code-registry-parse.md:72` (the row and its
  *Trigger*); `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2),
  `:74` (DIAG-4); `docs/spec_topics/errors-and-results/error-model.md:65–74` (the
  closed panic-source list). User-facing mirrors:
  `docs/reference/diagnostics.md:121`;
  `docs/reference/frontmatter.md:256–265`;
  `docs/reference/errors-and-results.md:80–89`, `:120–126`.
- Implementation evidence at `a410f727`:
  `src/extension/production-theta-producer.ts:5626` (`renderQueryText`),
  `:5657` (**`stringifyInterpolation`**, the single classification at `:5665`,
  the container return at `:5666–5673`, the sole runtime raise at `:5680`),
  `:5696` (**`translateInterpolationOutbound`**, the enum arm `:5701`, the array
  recursion `:5705–5707`, the primitive passthrough `:5709`, the brand read
  `:5718`, the schema resolution `:5719–5727`, the keys-unchanged recursion
  `:5730–5734`), `:5760` (`interpolationTypeOf`, `Array.isArray` at `:5776`,
  `isResultValue` at `:5779`, the object fall-through `:5783`), `:5794`
  (`evaluatePureExpression`; array `:5807`, object `:5809–5824`, `result-ctor`
  `:5860–5864`); `src/render/query-render.ts:80` / `:95`
  (`INTERPOLATED_RESULT_CODE` / `_MESSAGE`), `:110` (`InterpolatedResultPanic`),
  `:396` (`stringifyInterpolatedValue`), `:415–429` (its array/object arm, reached
  only from the `system:` surface), `:431–441` (its `result` arm);
  `src/parser/type-layer-checks.ts:930` (`checkArrayLiteral`), `:1038–1050`
  (the constructor-field checks, `forceIncompatible` at `:1046`, the array-sink
  call at `:1049–1050`), `:1191–1193` (`walkExpr`'s `query` arm), `:1271`
  (`checkQueryInterpolationResults`), `:1291` (the sole static emission), `:1325`
  (`interpolationIsResult`, its `default: return false` at `:1341–1348`), `:1376`
  (`isResultGenericType`), `:563` and `:660` (the `resultBindings` identity set
  and its `let`-arm write); `src/parser/type-compat.ts:492–498` and `:510`
  (`forceIncompatible`), `:555` (`checkCommonType`, the sink loop `:566–586`, the
  `"unknown"` skip `:570–572`); `src/runtime/value.ts:72–88` (`RESULT_TAG` and
  its privacy docstring), `:100–103` (the `ResultValue` carrier shape), `:186`
  (`privateBrandOf`), `:300` (`schemaTagOf`),
  `:334` (`isResultValue`); `src/parser/system-interpolation.ts:383–389` and
  `:390` (`toInterpolationType`, no `result` arm), `:447–451`.
- Test evidence at `a410f727`: `tests/interpolated-result-gate.test.ts` (bug
  0079's 22-cell witness; the drive harness `:521–552`, the registry oracle
  `:176–207`, the `CARRIER_PREFIX` constant `:582`, the pre-fix baseline
  constants `:578–579`; the nine false-positive controls `:615`, `:628`, `:641`,
  `:655`, `:727`, `:738`, `:748`, `:761`, `:774`; the `par for` element cell
  (a9) `:691`; bug 0017's runtime controls `:898`, `:928`, `:950`; the DIAG-4
  drift guard `:976`); `tests/query-render.test.ts:168`, `:171`, `:176` (the
  three seam calls, all on flat values); `tests/ctor-field-type-check.test.ts:276`
  and `:400` (bug 0031's `Holder { r: Ok(1) }` cell — the constructor-field
  smuggle route this report measures the array-element neighbour of). No test in
  the tree interpolates a container holding a `Result`.
- Reproduction: one scratch vitest directory outside the tracked tree at
  `a410f727` — four files, forty-six rows over the real `parseThetaDocument` and
  the real production-composition drive (`createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`) against bug 0079's live-session
  double, with the prompt text read at `pi.sendUserMessage`. Run on the outputs
  quoted above, then deleted. No provider and no model were involved; no file
  under `src/`, `tests/` or `docs/` was written by the probe. `docs/bugs/README.md`
  and every other bug document are unmodified by this filing.
