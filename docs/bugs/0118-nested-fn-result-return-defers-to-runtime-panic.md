# Bug 0118 — Bug 0079's static QRY-18 gate reads only TOP-LEVEL `fn` return annotations and its fix record files the resulting deferral as fail-safe, but no input reaches that deferral: a nested `fn` draws `theta/parse/nested-fn` in every placement the parse-phase structural walk visits, and in the one placement it never visits — anything under a `par for`, for which `walkExpr` has no arm — the nested `fn` loads with zero diagnostics, is never hoisted into the runtime callable registry, and its call resolves as an unknown host tool, so the interpolation is never evaluated; the collector's reach is exactly complete over legal theta, and the measured defect is the missing FN-1 refusal under a `par for`

- **Status:** fixed (0.162.0). The constraints §Fix pins are adjudicated in
  §Fix (0.162.0) below: finding (2) is closed by giving the parse-phase
  structural walk a `par-for` arm (§Fix (a), `inLoop: true`), the identifier
  walk is left un-widened (§Fix (c), arrangement 2), the collectors stay
  top-level-only (§Fix (e)), and finding (1) is recorded as unreachable rather
  than defect (§Fix (f)). The §Fix section above is the constraint analysis the
  adjudication was made from and is left as filed. Two subjects with
  opposite dispositions: bug 0079's residual (iv) — `collectFnReturnAnnotations`
  reading only top-level `fn` return annotations — needs no widening, and the
  consequence its fix record states ("defers to (b)'s runtime panic") does not
  reproduce in any direction; the defect this report files is the parse-phase
  structural walk's absent `par-for` arm, which admits the `fn` placement FN-1
  refuses. Which traversals widen, and what a newly-reached `par for` body then
  emits beside the parser's own body scan, is adjudicated in-run. No ordering
  dependency: [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)
  is **fixed (0.69.0)** and is this report's origin.
- **Sev/Diff estimate:** S1/D3 — a `fn` placement the spec refuses loads with
  zero diagnostics on any channel, and the same subtree skips every other
  parse-phase structural check (measured on `theta/parse/function-as-value` and
  `theta/parse/unreachable-code`); D3 because the fix widens one shared walk over
  the whole structural-check family at once, five traversals over that subtree
  currently disagree (three reach it, two do not), and the emission count for a
  newly-reached body is unsettled.
- **Kind:** two findings, separated because they take opposite dispositions.
  1. **Not a defect** — bug 0079 residual (iv)
     (`docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md:194–197`).
     QRY-18 does require the static rejection where the callee's return type is
     resolvable, and a nested `fn`'s written annotation would be resolvable text.
     But a nested `fn` is not legal theta — FN-1
     (`docs/spec_topics/functions.md:20`) makes `fn` declarations top-level only
     and a nested one `theta/parse/nested-fn` — so no legal input carries the
     annotation the collector does not read, and measured, no input at all
     reaches the runtime panic the residual names. The sentence needs correcting
     from "defers to (b)'s runtime panic" to "is unreachable".
  2. **Defect** against FN-1 (`docs/spec_topics/functions.md:20`) and the
     `theta/parse/nested-fn` row (`docs/spec_topics/diagnostics/code-registry-parse.md:82`;
     mirror `docs/reference/diagnostics.md:131`). The parse-phase structural walk
     `walkExpr` (`src/parser/theta-document.ts:6287–6469`) has no `par-for` arm,
     so a `fn` declared inside a `par for` body loads with zero diagnostics of
     any severity. That declaration is inert — the runtime callable registry
     hoists top-level `fn` only — so its call fails at run as a host-tool lookup.
- **Related:**
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the origin. Its §Fix (0.69.0) residual (iv) is this
    report's subject; its one emission site
    (`src/parser/type-layer-checks.ts:1289–1295`), its provenance-not-name
    classification (`:1325–1382`) and its fail-safe direction are constraints
    §Fix here preserves.
  - [0019](./0019-question-operand-bypasses-result-normalisation.md) — **fixed
    (0.31.0)**, the posture 0079's residual cites. Its coordination note
    (`docs/bugs/0019-question-operand-bypasses-result-normalisation.md:182–190`)
    states the shared asymmetry: "the type layer emits only where provenance is
    certain, and an unprovable interpolation falls to a runtime panic rather than
    a false load refusal". This report leaves that asymmetry intact; it reports
    that one named unprovable case has no input.
  - [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md),
    [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md),
    [0116](./0116-question-unwrapped-interpolation-renders-null.md),
    [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) — the
    sibling filings of 0079's residuals (i), (ii), (iii) and its spec-silence
    note. 0114 owns the array/object carrier leak this report's §Reproduction
    uses as a read of `par for` element values; nothing here changes its subject.
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) — **open**, the
    import-materialisation family. The surviving latitude §Fix (e) names — an
    imported `Result`-returning `fn` — is materialised by the same pass
    (`src/extension/import-static-checks.ts:156–188`) that report anatomises.
- **Affected** (every citation verified at HEAD `a410f727`, 0.69.0):
  - `src/parser/type-layer-checks.ts:343–351` — `collectFnReturnAnnotations`, the
    subject of 0079 residual (iv). The loop (`:345–349`) reads the argument
    statement list only, so a `fn` statement in any nested block is absent from
    the map. Its docstring states the choice: "Top-level only, mirroring
    `collectFns` (query-schema-resolve.ts): a nested `fn`'s return annotation is
    not this gate's concern" (`:340–341`).
  - `src/parser/type-layer-checks.ts:227` — the sole call, over
    `body.statements`; `:231` — the map handed to `TypeLayerWalk`; `:569` — the
    constructor parameter that holds it.
  - `src/parser/type-layer-checks.ts:1359–1368` — `isCertainResultNode`,
    provenance channel 1. `:1366` reads `this.fnReturns.get(e.callee)` and
    `:1367` tests it with `isResultAnnotation` (`:532`). This is the only
    consumer of the map.
  - `src/parser/type-layer-checks.ts:1271–1298` — `checkQueryInterpolationResults`,
    the ONE emission site (the push at `:1289–1295`, the code at `:1291`, the
    enclosing `@`-query range at `:1293`); `:1191–1193` — the `query` arm that
    drives it; `:1325–1350` — `interpolationIsResult`, the three provenance
    channels; `:1376–1382` — `isResultGenericType`; `:545` —
    `isResultGenericTypeName`; `:563` — the `resultBindings` identity set.
  - `src/parser/type-layer-checks.ts:692–694`, `:734`, `:772` — the type-layer
    walk DOES descend into a nested `fn` body: `walkStatement`'s `fn` arm calls
    `walkFn`, which ends in `walkBlock(fn.body, …)`. `:1148–1189` — its `par-for`
    arm, which walks the iterand, the `max` operand and the body (`:1188`). The
    gap in (1) is the fn TABLE, not this traversal.
  - `src/parser/type-layer-checks.ts:52–53` — the value import of
    `parseExpressionSource` from `./theta-document`, the two-node runtime cycle
    0079's fix record flags; `:1275`, `:1279` — the re-lex route the emission site
    uses.
  - `src/parser/query-schema-resolve.ts:89–97` — `collectFns`, the traversal
    `collectFnReturnAnnotations` mirrors, with the same top-level-only shape;
    `:82` — its sole call; `:429–436` — `callArgFrame`, its sole consumer
    (`this.fns.get(callee)` at `:430`), which answers `{ kind: "call-arg" }` for
    an unknown callee, so a nested `fn` would leave a call-arg sink untyped
    rather than mistyped.
  - `src/parser/theta-document.ts:6053–6081` — **the defect's expected emitter.**
    The structural walk's `fn` arm calls
    `checkFnPlacement({ nested: !scope.topLevel }, …)` (`:6056`) and walks the
    body with `topLevel: false` (`:6073–6079`).
  - `src/parser/theta-document.ts:5627–5633` — the whole-document entry, the one
    place `topLevel: true` is set (`:5629`); `:5634–5636` — the body tail;
    `:5955–5966` — `walkBlock`; `:5968` — `walkStatement`; `:5999`, `:6002`,
    `:6017–6023`, `:6027–6033` — the `if` / `else` / `while` / `for` block walks,
    each passing `topLevel: false`. Every block-bearing STATEMENT form is covered.
  - `src/parser/theta-document.ts:6287–6469` — **defect site.** `walkExpr` has
    arms for `ident`, `binary`, `ternary`, `try`, `call`, `invoke`, `member`,
    `index`, `object`, `match`, `result-ctor`, `method-call`, `array` and `query`
    — and none for `par-for`. Its `default` (`:6465–6467`) is annotated "number /
    string / bool / null — no nested expressions", so a `par for` expression's
    body, iterand and `max` are all unvisited, and no check this walk owns runs
    inside them.
  - `src/parser/theta-document.ts:4610`, `:4654`, `:4696–4705`, `:4730` — the
    identifier-resolution walk (`checkUnknownIdentifiers` → `walkIdentStmt` →
    `walkIdentExpr`) has the same hole: `walkIdentExpr` has no `par-for` arm, and
    `walkIdentStmt`'s `fn` arm walks a body with the whole-file roots plus
    parameters. This is why a call to a nested `fn` draws
    `theta/parse/unknown-identifier` inside a `fn` body and nothing inside a
    `par for` body.
  - `src/parser/theta-document.ts:5374`, `:5507–5518` — the call-site walk DOES
    reach a `par for` body, and its comment names the omission: "Reached
    explicitly (unlike the ident walk, which predates RFC 0003)" (`:5508–5509`).
    Of the five traversals over this subtree three reach the body — this one, the
    type layer, and the parser's own CTRL-4 scan (which stops at a `fn`
    declaration) — and the structural and identifier walks do not.
  - `src/parser/theta-document.ts:3983–4165` — the parser's own `par for` body
    scan (CTRL-4). `:4066–4075` and `:4099–4108` emit
    `theta/parse/par-query-in-body` for a query statement and a query expression
    in the body (the code at `:4069` and `:4102`); `:4090–4093` is the `default`
    arm that does NOT descend into a `fn` declaration ("fn / schema / enum /
    import / export / doc-comment carry no enclosing-conversation body
    restriction to check"). That non-descent is why the one loading shape in
    §Reproduction hides its query inside a nested `fn`.
  - `src/parser/functions.ts:73–88` — `checkFnPlacement`: returns `undefined` for
    `nested: false` (`:77–79`), else `theta/parse/nested-fn` (`:83`) with the
    registry Message (`:86`). The check itself is correct and total over its
    input; it is never called for the `par for` subtree.
  - `src/runtime/lexical-environment.ts:288–293` — the runtime callable registry:
    the root scope hoists `stmt.kind === "fn"` from `inputs.body.statements`
    only, commented "Top-level `fn` declarations are hoisted (functions.md
    FN-1)". A nested `fn` is never callable.
  - `src/extension/production-theta-producer.ts:2858` — the fall-through a call to
    an unregistered name reaches: `UnknownHostToolError("code-side call names no
    resolvable host tool '<name>'")`, which becomes an `Err(CodeToolError)`.
  - `src/runtime/statement-executor.ts:1182–1190`, `:1208`, `:1240–1258` —
    `parForPanicError` and `runParForIteration`'s catch: CTRL-5's iteration
    boundary turns a thrown `ThetaPanic` into that element's
    `Err(invoke_infra, cause:"panic")` (`:1252–1257`), rethrowing only a
    `HostFatal` (`:1249–1251`). Any panic raised inside a `par for` body — the
    0079 runtime panic included — is an element value, not a theta abort.
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`:
    any error-severity `theta/load/*` or `theta/parse/*` diagnostic blocks
    registration; `:2092` — the registration gate reading it ("must not
    register", `:2093–2098`); `:1329`, `:1933` — the callee-arity and
    callee-composition gates.
  - `src/extension/production-theta-producer.ts:5760–5784` — (b)'s runtime arm:
    `interpolationTypeOf` tests `isResultValue` (`:5779`) before the `object`
    fall-through; `:5657`, `:5680` — `stringifyInterpolation` raising
    `InterpolatedResultPanic`. `src/render/query-render.ts:80`, `:95–96`,
    `:110–116` — the code, the registry Message and the `ThetaPanic` subclass.
    This is the disposition 0079's residual (iv) names, and the one no input in
    §Reproduction reaches.
  - `src/extension/import-static-checks.ts:77–86`, `:156–188` —
    `collectImports` and `materializeSymbol`: an imported `fn` is bound as a
    runtime import carrying its `FnDecl` (`:178`), never spliced into the
    importing document's statements. Materialisation runs in the load pass, after
    `parseThetaDocument`, and `checkTypeLayer` runs inside that parse
    (`src/parser/theta-document.ts:882`) — so an imported `fn`'s written return
    annotation is out of the gate's reach by construction, not by traversal.
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18;
    `:28` — the `Result<T, E>` row of the stringification table (parse error
    `theta/parse/interpolated-result`); `:32` — the note fixing the two
    dispositions, quoted in §Expected behaviour.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:72` — the
    `theta/parse/interpolated-result` row: Sev `E`, Phase `type`, *Trigger*
    "`${expr}` interpolation whose `expr` has Theta static type `Result<T, E>`
    (the runtime renderer raises the same code as a panic when the type is
    statically unresolvable)"; `:82` — the `theta/parse/nested-fn` row: Sev `E`,
    Phase `parse`, *Trigger* "`fn` declaration nested inside another `fn` body or
    a block", *Message* `nested 'fn' declarations are not supported in theta 1.0`.
  - `docs/spec_topics/functions.md:20` — FN-1: "`fn` declarations are top-level
    only — both in `.theta` files and in `.thetalib` library files … Nested
    function definitions surface as `theta/parse/nested-fn`". The sentence carries
    no exception for any block form.
  - `docs/spec_topics/grammar.md:143` — "A `FnDecl` is a top-level `fn`
    declaration; its placement, nesting, call-position, and documentation rules
    are owned by [Function Definitions]"; `:193` — the doc-comment mirror
    ("nested `fn` is forbidden by Function Definitions regardless of `///`").
    `docs/reference/grammar.md:257` — the user-facing mirror: "Top-level only
    (nested is `theta/parse/nested-fn`)".
  - `docs/spec_topics/control-flow.md:74` — CTRL-3: a `par for`'s value is
    `array<Result<T, QueryError>>`; `:76` — CTRL-4's body restrictions, including
    `theta/parse/par-query-in-body`; `:78` — CTRL-5's iteration-boundary panic
    downgrade. `docs/reference/diagnostics.md:114` — the
    `theta/parse/par-query-in-body` row; `:299–301` — the note recording that the
    three `theta/parse/par-*` codes originate in RFC 0003 and are registered on that
    reference page (they carry no row under
    `docs/spec_topics/diagnostics/`).
  - `docs/spec_topics/lexical.md:26` — "**No interpolation** — the sequence `${`
    inside a regular string is plain text". With
    `query-escapes-stringification.md:16`'s `system:` surface restricted to bare
    identifier paths, an interpolated CALL can occur only inside a `@`-query
    template, which bounds where finding (1)'s input class could exist at all.
  - `tests/interpolated-result-gate.test.ts` — 0079's 22-cell witness. `:599–605`
    is cell (a3), the annotated-`fn`-return row QRY-18's note singles out, over a
    TOP-LEVEL `fn`; `:679`, `:691`, `:703` are (a8) / (a9) / (a10) — a written
    `Result<…>` annotation, a `par for` element read, an annotated `fn`
    parameter. No cell declares a nested `fn`.
  - `tests/live/live-production-acceptance.test.ts:1213–1216`, `:1343–1346` — the
    two H8a comments that name `collectFnReturnAnnotations` as the reason the
    laundered shape registers. They describe the unannotated-`fn` channel, not
    nesting, and are unaffected by either finding.
  - `tests/functions-and-return.test.ts:60–68` — the only FN-1 placement test:
    it calls `checkFnPlacement({ nested: true }, …)` directly, so it witnesses the
    predicate and not the traversal that supplies `nested`.
    `tests/subagent-fn.test.ts:308–323` — the only real-parse nested-`fn` witness
    (a nested `subagent fn` inside a top-level `fn` body).
    `tests/e2e-s1-grammar-literal-sublang.test.ts:65` — asserts the code is
    ABSENT for a trailing-comma parameter list.
  - `tests/par-for.test.ts:313–322`, `:324–338`, `:340–347`, `:349–354` — the
    CTRL-4 cells (`par-query-in-body`, `par-shared-mutation`, and
    `par-break-continue` twice), the harness a witness for finding (2) extends.
  - **Test coverage of finding (2): none.** No test in the tree declares a `fn`
    inside a `par for` body, in either direction. The only `par for` in the suite
    carrying a `fn` at all declares it at the top level
    (`tests/tool-arg-parse-checks.test.ts:621`).
- **Observed at:** `0.69.0` (HEAD `a410f727`). Offline, deterministic,
  provider-free: no live model, no network. Scratch vitest over the real
  `parseThetaDocument` (the `tests/interpolated-result-gate.test.ts` parse
  harness) and, for the drive rows, the real production prompt-mode binding
  (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`)
  against that file's live-session double, reading the text handed to
  `pi.sendUserMessage`. Written, run, deleted; `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

Bug 0079 gave `theta/parse/interpolated-result` an emitter on both of QRY-18's
dispositions. Its static half classifies an interpolated expression by
PROVENANCE, and one of its three channels is a call to a `fn` whose written
return annotation names a `Result`, read from `collectFnReturnAnnotations`
(`src/parser/type-layer-checks.ts:343–351`). That collector iterates the
document's top-level statement list, mirroring `collectFns`
(`src/parser/query-schema-resolve.ts:89–97`), so a `fn` declared in a nested
block contributes nothing. 0079's fix record states the consequence as residual
(iv): "a nested `fn`'s written `Result<…>` return defers to (b)'s runtime panic.
Partial in the fail-safe direction".

Measured at HEAD, that consequence does not occur, and neither does the static
one. A nested `fn` is not legal theta: FN-1 makes `fn` declarations top-level
only and a nested one `theta/parse/nested-fn`. In the placements the parse-phase
structural walk visits, the declaration draws that code AND
`theta/parse/unknown-identifier` for the call — measured inside a `fn` body, an
`if` block, a `for` block, and an `if` nested in a `fn`; the `else` and `while`
arms pass the same `topLevel: false` (`src/parser/theta-document.ts:6002`,
`:6017–6023`) and are not separately measured. Both codes are error-severity, so
`hasLoadParseError` (`src/extension/production-composition.ts:2045–2052`) blocks
registration and the theta never runs. There is one placement the walk never
visits: `walkExpr` (`:6287–6469`) has no `par-for` arm, so nothing under a
`par for` is walked. A nested `fn` there loads with zero diagnostics — and is
still unreachable as an interpolation source, twice over: a `@`-query in the
body itself is `theta/parse/par-query-in-body`, and the runtime callable registry
hoists top-level `fn` only (`src/runtime/lexical-environment.ts:288–293`), so a
call to the nested name resolves as a host tool and answers
`Err(CodeToolError …)` without evaluating the body. Measured: the query inside
that nested `fn` never dispatches and no diagnostic of any code is produced.

So the collector's reach is exactly complete over legal theta, and residual
(iv)'s sentence overstates: the case does not reach the runtime panic either.
Widening the collector would add an unreachable branch to the one emission site
0079 established.

What the same probe exposes is a defect of a different rule. FN-1's refusal is
unconditional, and a `fn` under a `par for` body escapes it because the walk that
calls `checkFnPlacement` never arrives. The blind spot is not specific to `fn`
placement: measured on the same fixtures, `theta/parse/function-as-value` and
`theta/parse/unreachable-code` are also absent inside a `par for` body and
present at the top level, and a `fn` name used as a value in the `par for`
ITERAND is unreported too. Five traversals cross that subtree and three reach the
body: the type layer (`type-layer-checks.ts:1148–1189`), the call-site walk
(`theta-document.ts:5507–5518`, whose comment records the identifier walk's
omission by name), and the parser's own CTRL-4 scan (`:3983–4165`), which stops
at a `fn` declaration. The structural walk and the identifier walk do not arrive
at all.

## Reproduction

Offline at `a410f727`. Every row is one `parseThetaDocument` call over the
`tests/interpolated-result-gate.test.ts` parse harness; the drive rows add the
real production prompt-mode binding over that file's live-session double.
`diagnostics` is the document's whole diagnostics array, unfiltered; `sent` is
every text handed to `pi.sendUserMessage`. Frontmatter is `mode: prompt`
throughout.

### The placements the structural walk visits — every one is refused

```theta
fn outer(): integer {
  fn mk(): Result<integer, QueryError> {
    Ok(1)
  }
  let r = mk()
  let _ = @`x${r}`
  1
}
let n = outer()
@`done ${n}`
```

```
@@ nested inside a `fn` body (above)
   diagnostics :: error theta/parse/nested-fn        "nested 'fn' declarations are not supported in theta 1.0"
                  error theta/parse/unknown-identifier "unknown identifier 'mk'"
@@ nested inside a top-level `if` block
   diagnostics :: the same two codes
@@ nested inside a top-level `for` block
   diagnostics :: the same two codes
@@ nested inside an `if` inside a top-level `fn`
   diagnostics :: the same two codes
@@ nested `fn` with a NON-`Result` return; the interpolation reads the OUTER
   call, so no `Result` is in play                                     [isolation]
   diagnostics :: the same two codes
@@ CONTROL — the identical `fn` declared TOP-LEVEL, called and interpolated
   diagnostics :: error theta/parse/interpolated-result
                  "Result value cannot be interpolated; unwrap with ? or match first"
```

Both codes are error-severity `theta/parse/*`, so the registration gate drops
the theta. The control is 0079's cell (a3): the same annotation, at the only
placement FN-1 admits, refuses the load through the gate under test.

### The one placement it does not visit — a `par for` body

```
@@ nested `fn` in a `par for` body, no query in the body
   diagnostics :: []                       (FN-1 requires theta/parse/nested-fn)
@@ the same plus `let r = mk()` in the body
   diagnostics :: []
@@ nested `fn` plus a `@`-query interpolating `r` DIRECTLY in the body
   diagnostics :: error theta/parse/par-query-in-body
@@ a `for` block inside the `par for` body carrying the nested `fn`
   diagnostics :: []
@@ a `par for` inside a top-level `fn` body carrying the nested `fn`
   diagnostics :: []
```

The third row is CTRL-4: an enclosing-conversation query in a `par for` body is
refused before any interpolation question arises. The last two rows show the hole
is the `par-for` node itself, not the top level — nesting the `par for` deeper,
or nesting a block inside it, changes nothing.

### The only shape that both loads and holds the interpolation

Two nested `fn`s: the query sits inside the inner one's BODY, which the parser's
`par for` scan does not descend into (`theta-document.ts:4090–4093`).

```theta
let xs = par for i in [1, 2] {
  fn mk(): Result<integer, QueryError> {
    Ok(1)
  }
  fn use(): integer {
    let r = mk()
    let _ = @`x${r}`
    1
  }
  use()
}
@`done ${xs}`
```

```
@@ as written
   diagnostics :: []
   sent        :: ["done [{\"ok\":true,\"value\":{\"ok\":false,\"error\":{\"kind\":\"code_tool\",
                   \"message\":\"code-side call names no resolvable host tool 'use'\",
                   \"tool_name\":\"use\",\"cause\":\"execution\"}}}, <the second element,
                   byte-identical>]"]
@@ the same with the inner query carrying NO interpolation
   sent        :: identical — the inner query does not dispatch either
@@ CONTROL — `use()` not called (body tail `1`)
   sent        :: ["done [{\"ok\":true,\"value\":1},{\"ok\":true,\"value\":1}]"]
@@ CONTROL — `mk` declared TOP-LEVEL, `use` still nested in the `par for` body
   diagnostics :: error theta/parse/interpolated-result
@@ CONTROL — `let r = Ok(1)` in place of the call (provenance channel 1)
   diagnostics :: error theta/parse/interpolated-result
@@ CONTROL — `let r: Result<integer, QueryError> = mk()` (provenance channel 3)
   diagnostics :: error theta/parse/interpolated-result
```

`use` is not a callable: the call resolves through host-tool lookup
(`production-theta-producer.ts:2858`) and each element carries that `Err`, so the
`${r}` interpolation is never evaluated and (b)'s panic never raises. The three
controls establish that the interpolation site itself is inside the gate's reach
— with the annotation at the top level, or with either other provenance channel,
the same shape is refused at load. The element read uses the array arm's carrier
serialisation, which is bug 0114's subject and is used here only as the cheapest
read of the element values.

### The blind spot is not specific to `fn` placement

```
@@ `let g = f` (top-level `fn f`) INSIDE a `par for` body
   diagnostics :: []
@@ the same `let g = f` at the top level                               [control]
   diagnostics :: error theta/parse/function-as-value
@@ code after `return` inside a `fn` nested in a `par for` body
   diagnostics :: []
@@ the same inside a top-level `fn`                                    [control]
   diagnostics :: warning theta/parse/unreachable-code
@@ `par for i in [f]` — a `fn` name in value position in the ITERAND
   diagnostics :: []
```

FN-1's other clause (`function-as-value`) and RET-3 (`unreachable-code`) are
skipped in the same subtree, and the iterand is skipped as well — consistent with
`walkExpr` having no arm for the node rather than an incomplete body walk.

### The surviving latitude — an imported `Result`-returning `fn`

```
@@ import { mk } from "./lib.thetalib" / let r = mk() / @`x${r}`
   diagnostics :: []
```

Parse-level only: this harness resolves no import, and materialisation runs in
the load pass after the parse. Legal theta, and out of the gate's reach by
construction rather than by traversal — see §Fix (e).

## Expected behaviour

Two rules meet here, and the order in which they apply decides finding (1).

**QRY-18's note** (`docs/spec_topics/query/query-escapes-stringification.md:32`):

> The `Result` rejection is **static**, resolved from the expression's type, and
> fires even when the `Result`-valued expression sits behind a function call
> whose return type the parser can resolve. When the type is unresolvable (e.g.
> an inferred binding that widens past the parser's view), the runtime renderer
> falls back to a panic carrying the same `theta/parse/interpolated-result`
> diagnostic code — the same "static where possible, runtime where not" posture
> used elsewhere for tool-call argument typing.

The registry row states the same split
(`docs/spec_topics/diagnostics/code-registry-parse.md:72`): *Trigger* "`${expr}`
interpolation whose `expr` has Theta static type `Result<T, E>` (the runtime
renderer raises the same code as a panic when the type is statically
unresolvable)".

**FN-1** (`docs/spec_topics/functions.md:20`):

> `fn` declarations are top-level only — both in `.theta` files and in
> `.thetalib` library files. […] Nested function definitions surface as
> `theta/parse/nested-fn`.

On finding (1) the two compose as follows. QRY-18 conditions its static arm on a
return type "the parser can resolve", and a written `Result<…>` annotation is
resolvable text wherever it sits. But FN-1 removes the program before that
question is asked: a nested `fn` is `theta/parse/nested-fn`, Sev `E`, Phase
`parse`, and an error-severity `theta/parse/*` blocks registration
(`src/extension/production-composition.ts:2045–2052`, `:2092`). An unregistered
theta has no run, so the runtime arm has no input either. The refusal codes are
measured here; that registration then drops such a document is read from those
two sites and from 0079's own H8a cell, which asserts the un-registration through
the real discovery-to-registration path
(`tests/live/live-production-acceptance.test.ts:1213–1216`) — not re-measured by
this filing. QRY-18 therefore
prescribes nothing for a nested `fn`, and `collectFnReturnAnnotations`'s
top-level-only reach is not partial with respect to any legal input — it is
exactly the set of placements FN-1 admits. The correct record for 0079's residual
(iv) is that the case is unreachable, not that it "defers to (b)'s runtime
panic": measured, no input reaches (b) through this route.

On finding (2) FN-1 is unconditional and names no exception for a `par for` body.
Expected, on the §Reproduction rows that currently report `[]`:

- a `fn` declared anywhere under a `par for` — directly in the body, in a nested
  block of the body, or in a `par for` nested inside a `fn` — draws
  `theta/parse/nested-fn` at the declaration's range, Sev `E`, with the
  registered Message, and the theta does not register.
- the checks the same walk owns fire in that subtree on the same terms as
  everywhere else: `theta/parse/function-as-value` for a `fn` name in value
  position (FN-1's second clause), `theta/parse/unreachable-code` after a
  `return` (RET-3), and the iterand and `max` operands walked in the enclosing
  scope.
- CTRL-4's own scan (`theta-document.ts:3983–4165`) keeps its current outcomes:
  the `par-query-in-body` row of §Reproduction stays refused, and the count for a
  query the widened walk now also reaches is §Fix (b)'s question.
- Nothing changes for a legal `par for`: a body declaring no `fn`, using no
  function name as a value and carrying no query keeps loading with zero
  diagnostics.

Once (2) holds, (1)'s disposition is stable by construction: top-level is the
only placement a `fn` can occupy, so the collector's traversal and FN-1's
admitted set coincide.

## Actual behaviour / root cause

**The collector reads one statement list.** `collectFnReturnAnnotations`
(`src/parser/type-layer-checks.ts:343–351`) iterates its argument and records
`stmt.returnType` for `stmt.kind === "fn"`; the argument is `body.statements`
(`:227`). Nothing recurses. `collectFns`
(`src/parser/query-schema-resolve.ts:89–97`) has the same shape and one consumer,
`callArgFrame` (`:429–436`), which answers `{ kind: "call-arg" }` for an
unresolved callee — a conservative default, not a dependency on the restriction.
The type-layer WALK is not the limitation: it descends into every nested `fn`
body (`type-layer-checks.ts:692–694` → `:734` → `:772`) and into a `par for` body
(`:1148–1189`), so a widened table would need no new traversal — only a scoping
rule for names FN-1 forbids.

**Barrier 1 — the placements the structural walk visits.** `checkFnPlacement` is
called once, at `theta-document.ts:6056`, with `nested: !scope.topLevel`. The
document entry sets `topLevel: true` exactly once (`:5629`) and every
block-bearing statement form re-enters with `topLevel: false`: `if` and `else`
(`:5999`, `:6002`), `while` (`:6017–6023`), `for` (`:6027–6033`), and a `fn` body
(`:6073–6079`). Measured, the call to the nested name additionally draws
`theta/parse/unknown-identifier`, because `walkIdentStmt`'s `fn` arm
(`:4696–4705`) gives a body the whole-file roots plus its own parameters and
nothing else. Two error-severity codes, so registration is blocked twice over.

**Barrier 2 — the placement it does not.** `walkExpr` (`:6287–6469`) switches on
the expression kind and has no `par-for` case; the `default` (`:6465–6467`) is
annotated for leaves ("number / string / bool / null — no nested expressions").
A `par for` reaches `walkExpr` as a `let` initialiser, an expression statement or
a block tail, and its whole subtree — body, iterand, `max` — is dropped there.
`walkIdentExpr` (`:4730`) has the same omission, which the call-site walk records
in a comment at `:5508–5509` ("Reached explicitly (unlike the ident walk, which
predates RFC 0003)"). So of the five traversals that cross this subtree, the type
layer (`type-layer-checks.ts:1148–1189`), the call-site walk (`:5507–5518`) and
the parser's own CTRL-4 scan (`:3983–4165`, which stops at a `fn` declaration)
reach the body; the structural walk and the identifier walk do not.

**Barrier 3 — the nested `fn` is not callable.** The runtime root scope registers
`fn` declarations from `inputs.body.statements` only
(`src/runtime/lexical-environment.ts:288–293`), commented against FN-1's hoisting
rule. A call to a name no registry holds falls through to host-tool resolution
and raises `UnknownHostToolError` (`production-theta-producer.ts:2858`), which
surfaces as that iteration's `Err(CodeToolError …)` — measured verbatim in
§Reproduction. The body of the nested `fn` therefore never executes, so the
interpolation inside it is never rendered and (b)'s `InterpolatedResultPanic`
(`src/render/query-render.ts:110–116`) never raises.

**Why the loading shape needs two nested `fn`s.** A query in the `par for` body
itself is refused by the parser's own scan (`theta-document.ts:4066–4075`,
`:4099–4108`), whose `default` arm does not descend into a `fn` declaration
(`:4090–4093`). Hiding the query inside a nested `fn` evades both the CTRL-4 scan
(which stops at the declaration) and the structural walk (which never arrives).
That shape is what §Reproduction measures, and it is the whole of the input class
in which a nested `fn` survives load.

**The interpolation surfaces are bounded.** A `${…}` carrying a CALL can occur
only inside a `@`-query template: a regular string does not interpolate
(`docs/spec_topics/lexical.md:26`), and the frontmatter `system:` surface admits
bare identifier paths only
(`docs/spec_topics/query/query-escapes-stringification.md:16`). So no third
surface reopens finding (1).

**The panic would be an element value anyway.** If a nested `fn` under a `par for`
were callable, CTRL-5's iteration boundary
(`src/runtime/statement-executor.ts:1240–1258`) would downgrade a
`ThetaPanic` raised inside the body to that element's
`Err(invoke_infra, cause:"panic")` rather than aborting the theta. Residual
(iv)'s "defers to (b)'s runtime panic" would still not describe the observable in
this position, even with barrier 3 removed.

## Why it matters

- **An input the spec refuses loads with no diagnostic on any channel.** A `fn`
  under a `par for` body draws nothing at load, where FN-1 and the
  `theta/parse/nested-fn` row require an error. Measured, five variants of the
  placement report `[]`.
- **The admitted declaration is inert, and the failure it produces names the
  wrong subject.** The author's call to it does not fail as "nested `fn` is not
  supported"; it fails at run as "code-side call names no resolvable host tool
  '<name>'", inside a per-element `Err` of an `array<Result<…>>`. The diagnosis
  points at the tool registry rather than at the declaration.
- **The gap is one walk wide, not one check wide.** `function-as-value` and
  `unreachable-code` are measured absent in the same subtree, and the iterand is
  unwalked too. Every parse-phase structural check the walk owns is skipped for
  every `par for` in every theta.
- **Five traversals disagree about the same subtree.** The type layer, the
  call-site walk and the parser's own CTRL-4 scan enter it; the structural and
  identifier walks do not. A reader cannot infer from one check's behaviour
  inside a `par for` body what another does.
- **Residual (iv), left as written, invites an unreachable widening.** It reads
  as a coverage gap in a shipped gate, so the natural response is to widen
  `collectFnReturnAnnotations`. Measured, that widening can change no
  observable: it would add a branch to the one emission site 0079 established
  and to the fn table `collectFns` mirrors, with no input able to select it, and
  it would need a scoping rule for names FN-1 forbids.
- **Nothing in the suite scores the placement gap.** No test declares a `fn`
  inside a `par for` body in either direction. The only real-parse FN-1 witness
  nests inside a `fn` body (`tests/subagent-fn.test.ts:308–323`); the placement
  unit test calls the predicate directly with `{ nested: true }`
  (`tests/functions-and-return.test.ts:60–68`), so it passes regardless of which
  subtrees the traversal reaches.

## Non-goals

- **Widening `collectFnReturnAnnotations` or `collectFns`.** §Fix (e) states the
  reasons; the collectors stay top-level-only.
- **The imported-`fn` route.** An imported `Result`-returning `fn` is legal theta
  whose annotation the gate does not read, because materialisation
  (`src/extension/import-static-checks.ts:156–188`) runs after the parse that
  contains `checkTypeLayer` (`src/parser/theta-document.ts:882`). Whether QRY-18's
  "the parser can resolve" reaches across files is a separate adjudication, and
  the spec's second sentence covers a type the parser cannot resolve, so the
  current deferral to (b) is defensible. Measured here only at parse level;
  recorded in §Fix (e), not decided.
- **CTRL-4's scan not descending into a `fn` declaration**
  (`theta-document.ts:4090–4093`). It is observable only while a nested `fn`
  survives load; closing (2) removes its input. Whether the scan should also
  descend for other reasons is not adjudicated here.
- **The identifier walk's own `par-for` omission** beyond the traversal decision
  in §Fix (c). Which names a `par for` body should resolve against is CTRL-4 and
  FN-1 territory that the call-site walk already models; this report measures
  only that the ident walk does not arrive.
- **0079's other residuals**, filed separately: the array/object carrier leak
  ([0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md)), the
  absent reassignment type-compatibility check
  ([0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md)), the
  `?`-unwrapped interpolation rendering `null`
  ([0116](./0116-question-unwrapped-interpolation-renders-null.md)), and
  `error-model.md`'s panic enumeration
  ([0117](./0117-error-model-omits-parse-coded-interpolation-panic.md)).
- **The three `theta/parse/par-*` codes' registry home.** They carry rows in
  `docs/reference/diagnostics.md:114` and the note at `:299–301`, and none under
  `docs/spec_topics/diagnostics/`. A DIAG-2 observation, not this report's
  subject; no code here depends on which page owns them.
- **CTRL-5's downgrade.** The iteration-boundary behaviour
  (`statement-executor.ts:1240–1258`) matches
  `docs/spec_topics/control-flow.md:78` and is cited only to show that a panic in
  this position would be an element value.

## Fix

**Constraint-pinned, not settled.** The refusal is owed; its traversal scope and
its emission counts are adjudicated in-run.

**(a) Give the parse-phase structural walk a `par-for` arm.** `walkExpr`
(`src/parser/theta-document.ts:6287–6469`) gains a `case "par-for"` that walks
the iterand and the `max` operand in the enclosing scope and the body through
`walkBlock` with `topLevel: false` — the shape the `for` arm already uses
(`:6027–6033`) and the shape the type layer's own arm uses
(`type-layer-checks.ts:1148–1189`). `checkFnPlacement` then fires from the one
site it already has (`:6056`); no new emitter, no new code, no registry change.
The loop-variable scope is not this walk's concern (its context tracks `inLoop`,
`topLevel` and `voidReturn` only), but `inLoop` must be decided: `break` and
`continue` inside a `par for` body already draw
`theta/parse/par-break-continue` from the parser's own scan (`:4032–4046`, the
code at `:4040`), so `inLoop: false` may add a second diagnostic from
`checkBreakStatement` (`:6038`) and `inLoop: true` suppresses it. Measure both
directions before choosing.

**(b) Pin what a newly-reached body emits, exactly.** The widened walk brings its
whole check family into the subtree at once. At least these need measured counts,
before and after: a query in the body already draws
`theta/parse/par-query-in-body` from the CTRL-4 scan (`:4066–4075`, `:4099–4108`)
and would now also reach the walk's `query` arm (`:6418`), which runs
`checkQueryTemplateInterpolations` (`:6482`), and — for a bare query statement in
the body — `checkDiscardedQueryResult` (`:6106`); a `break` / `continue` in the
body (see (a)); the `let`-binding form check (`checkLetBinding`, `:5979`); the
unreachable-code check (`:5942`); and every type-expression parse check the arm
performs for annotations. State per code whether the count is one or two for the
same `(code, range)` pair, and assert exact pass-wide counts in the witness
rather than "at least one".

**(c) Decide which walks widen.** Five traversals cross the subtree: the
structural walk and `walkIdentExpr` (`:4730`) do not reach it; `walkCallSiteExpr`
(`:5374`, arm at `:5507–5518`), the type layer
(`type-layer-checks.ts:1148–1189`) and the parser's own CTRL-4 scan
(`:3983–4165`, which stops at a `fn` declaration) do. (a) closes the structural
one, which is what FN-1 needs. The identifier walk is a separate decision with
its own observable: today a call to a nested `fn` inside a `par for` body draws no
`theta/parse/unknown-identifier` because that walk never looks, and after (a) the
declaration is refused anyway, so the second code is not required for the
refusal. Widening it changes which names a `par for` body resolves against —
including the loop variable, which the call-site walk binds explicitly
(`:5515–5516`) — so it needs its own measurements. Either widen both in one
commit with both sets of counts pinned, or widen the structural walk alone and
record the ident walk's omission as a scoped residual naming the comment at
`:5508–5509`.

**(d) 0079's invariants are preserved, not revisited.** The static gate keeps ONE
emission site (`type-layer-checks.ts:1289–1295`). Classification stays by
PROVENANCE, never by type name: name matching produced false positives that
refuse valid thetas — `${Status.Ok}` of an `enum Status { Ok, Bad }`, and a
`string` field sharing a name with a `Result`-returning `fn` — because the
inference layer mints `named` references out of author identifiers. Where
provenance is uncertain the gate defers to (b)'s runtime panic, because a wrong
emission refuses a valid theta at load. And the two-node runtime import cycle
between `type-layer-checks.ts` and `./theta-document` (`:52–53`) must not gain a
module-evaluation-time reference: (a) touches `theta-document.ts` only, which
keeps that edge as reviewed.

**(e) The collectors stay top-level-only.** With (a) landed, top-level is the
only placement a `fn` can occupy, so a widened `collectFnReturnAnnotations` would
carry entries no legal parse can produce, and its name-keyed `Map` would need a
scoping rule (a nested `fn` is out of scope outside its block, and may shadow a
top-level name) written for programs the parser refuses. `collectFns`
(`query-schema-resolve.ts:89–97`) stays aligned for the same reason; its consumer
already defaults an unknown callee to an untyped call-arg sink (`:429–436`). The
one legal input class the gate does not reach is an imported
`Result`-returning `fn`: `materializeSymbol`
(`src/extension/import-static-checks.ts:156–188`) binds the `FnDecl` as a runtime
import after `parseThetaDocument` has already run `checkTypeLayer`
(`theta-document.ts:882`), so no traversal change inside the parse can see it.
Measured parse-clean at HEAD. Leave it deferred to (b) and record it; a static
route would need the load pass to re-run the type layer with the materialised
declarations in hand, which is a different subject.

**(f) Correct 0079's fix record in the same commit.** Residual (iv)
(`docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md:194–197`)
states a consequence that does not reproduce. It should record that the case is
unreachable — the placement is refused by FN-1 where the walk arrives, and the
declaration is not callable where it does not — and cite this report. A
documentation edit; no behaviour depends on it.

**(g) Witness — offline, provider-free.** `tests/par-for.test.ts` is the home for
the placement cells, beside its CTRL-4 group (`:313–354`). Required: the five
`[]`-reporting placements of §Reproduction, each asserting
`theta/parse/nested-fn` with the registered Message read from the registry
(DIAG-4) and an exact pass-wide count; the `function-as-value` and
`unreachable-code` pairs, each with its top-level control; the iterand row; the
CTRL-4 rows unchanged, with the counts (b) settles; and a legal `par for` control
that must keep reporting `[]`. One cell belongs in
`tests/interpolated-result-gate.test.ts`: the two-nested-`fn` shape, asserting it
is refused by `theta/parse/nested-fn` and NOT by
`theta/parse/interpolated-result`, so the gate's silence on the shape is pinned
as correct rather than read as a gap by the next reader. Prove the red direction
once by neutralising the new arm.

## Provenance

- Origin: bug 0079's fix record (0.69.0), residual (iv) — "Half (a) reads only
  TOP-LEVEL `fn` return annotations (`collectFnReturnAnnotations`, mirroring
  `collectFns`), so a nested `fn`'s written `Result<…>` return defers to (b)'s
  runtime panic. Partial in the fail-safe direction, the same posture bug 0019
  records for the `?` operand"
  (`docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md:194–197`).
  This report adds what the residual does not state: the collector's reach
  coincides with FN-1's admitted set, so no legal input is missed; the measured
  refusal (two error-severity codes) in every placement the structural walk
  visits; the one placement it never visits and the two further barriers there
  (CTRL-4's query refusal, and the runtime registry's top-level-only hoisting,
  measured as an `Err(CodeToolError …)` element); the drive showing the inner
  query never dispatching; the three provenance controls proving the
  interpolation site itself is in reach; and the size of the traversal gap
  (`function-as-value`, `unreachable-code`, the iterand).
- Spec: `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18),
  `:28` (the `Result<T, E>` row), `:32` (the static / runtime note — the anchor);
  `docs/spec_topics/diagnostics/code-registry-parse.md:72` (the
  `theta/parse/interpolated-result` row), `:82` (the `theta/parse/nested-fn`
  row); `docs/spec_topics/functions.md:20` (FN-1);
  `docs/spec_topics/grammar.md:143`, `:193` (the `FnDecl` placement referral and
  the doc-comment mirror); `docs/spec_topics/control-flow.md:74` (CTRL-3), `:76`
  (CTRL-4), `:78` (CTRL-5); `docs/spec_topics/lexical.md:26` (no string
  interpolation). User-facing mirrors: `docs/reference/grammar.md:257`;
  `docs/reference/diagnostics.md:114`, `:131`, `:299–301`.
- Implementation evidence at `a410f727`:
  `src/parser/type-layer-checks.ts:52–53`, `:227`, `:231`, `:340–341`,
  `:343–351`, `:532`, `:545`, `:563`, `:569`, `:692–694`, `:734`, `:772`,
  `:1148–1189`, `:1191–1193`, `:1271–1298`, `:1325–1350`, `:1359–1368`,
  `:1376–1382`; `src/parser/query-schema-resolve.ts:82`, `:89–97`, `:429–436`;
  `src/parser/theta-document.ts:882`, `:3983–4165` (the CTRL-4 scan; `:4032–4046`
  its break/continue arm, `:4066–4075` and `:4099–4108` its two query emissions,
  `:4090–4093` its `fn` non-descent),
  `:4610`, `:4654`, `:4696–4705`, `:4730`, `:5374`, `:5507–5518`, `:5627–5636`,
  `:5955–5966`, `:5968`, `:5999`, `:6002`, `:6017–6023`, `:6027–6033`,
  `:6053–6081` (`:6056` the placement call), `:6287–6469` (`:6418` the `query`
  arm, `:6465–6467` the `default`), `:6482`;
  `src/parser/functions.ts:73–88`; `src/runtime/lexical-environment.ts:288–293`;
  `src/runtime/statement-executor.ts:1182–1190`, `:1208`, `:1240–1258`;
  `src/extension/production-theta-producer.ts:2858`, `:5657`, `:5680`,
  `:5760–5784`; `src/render/query-render.ts:80`, `:95–96`, `:110–116`;
  `src/extension/production-composition.ts:1329`, `:1933`, `:2045–2052`, `:2092`;
  `src/extension/import-static-checks.ts:77–86`, `:156–188`.
- Test evidence at `a410f727`: `tests/interpolated-result-gate.test.ts` (0079's
  22-cell witness; `:599–605` cell (a3), `:679`, `:691`, `:703` cells (a8)–(a10);
  no nested `fn` anywhere); `tests/functions-and-return.test.ts:60–68` (the
  placement predicate called directly); `tests/subagent-fn.test.ts:308–323` (the
  only real-parse nested-`fn` witness); `tests/e2e-s1-grammar-literal-sublang.test.ts:65`
  (the code asserted absent); `tests/par-for.test.ts:313–322`, `:324–338`,
  `:340–347`, `:349–354` (the CTRL-4 cells), `:394` (the nested-`par for` cell);
  `tests/tool-arg-parse-checks.test.ts:621` (the only suite `par for` carrying a
  `fn`, declared top-level);
  `tests/live/live-production-acceptance.test.ts:1213–1216`, `:1343–1346` (the
  laundering preconditions naming `collectFnReturnAnnotations`).
- Reproduction: three scratch vitest files at `a410f727` — the placement matrix
  over the real `parseThetaDocument`, the two-nested-`fn` shape with its three
  provenance controls and its production prompt-mode drive (the real
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody` over
  the `tests/interpolated-result-gate.test.ts` live-session double, reading
  `pi.sendUserMessage`), and the traversal-gap sizing rows. Run on the outputs
  quoted above, then deleted. No file in the tree was written by the probe.

## Fix (0.162.0)

- What shipped, keyed to §Fix:
  - **§Fix (a) — the parse-phase structural walk gains a `par-for` arm.**
    `walkExpr` (`src/parser/theta-document.ts`) takes `scope: WalkCtx` as its
    second parameter, threaded through all 31 call sites; the whole-document
    tail call passes the same literal top-level context the `walkStatements`
    entry beside it passes. The new `case "par-for"` walks the iterand, then
    the `max` operand, in the enclosing scope, then the body through
    `walkBlock` with `{ ...scope, inLoop: true, topLevel: false }` — the shape
    the `for` arm already uses. `checkFnPlacement` fires from the one site it
    already had. No new emitter, no new code, no registry change: the
    `theta/parse/nested-fn` row's *Trigger*
    (`docs/spec_topics/diagnostics/code-registry-parse.md:86`) already reads
    "nested inside another `fn` body or a block", and `ParForExpr.body` is
    typed `Block`, so DIAG-2 is not engaged. Emission order is load-bearing
    (iterand, then `max`, then body) and is asserted.
  - **`inLoop: true`, measured both directions.** With `inLoop: false` a
    `break` / `continue` in a `par for` body draws a SECOND diagnostic beside
    CTRL-4's `theta/parse/par-break-continue` — `theta/parse/break-outside-loop`
    "'break' outside of a loop" / its `continue` twin — which is factually
    false, because a `par for` IS a loop. This is the ONE suppression taken;
    cells (r10) / (r11) pin the single count so a later flip reds.
  - **§Fix (b) — every newly-reached emission is pinned, and none is
    suppressed.** §Expected behaviour is "the checks the same walk owns fire in
    that subtree on the same terms as everywhere else" and §Fix (a) forbids a
    new emitter, so every code the widened walk now draws is factually true of
    the source it judges and fires. Measured and pinned with an exact
    pass-wide unfiltered `doc.diagnostics` assertion plus a top-level
    real-parse control per family: `nested-fn` (r1)–(r5), and twice for the
    two-nested-`fn` shape; `function-as-value` for a body `let`, for the
    iterand and for the `max` operand (r7) / (r9) / (r15); `unreachable-code`
    (r8); `let-without-initialiser` (r14); `discarded-query-result` beside
    CTRL-4's `par-query-in-body` for a genuine bare `QueryStmt` (r18 — two
    DIFFERENT codes, so not the `(code, range)` doubling §Fix (b) asked about;
    both are error severity and registration is blocked either way);
    `annotation-type-not-expression` (r19); `unresolved-named-type` from a body
    query ascription (r20); `bare-object-literal` (r21); `unknown-variant`
    (r22); and `unsupported-feature` for a forbidden `${match …}` interpolation
    form (r23). The already-reached rows keep their counts exactly: (r10) /
    (r11) `par-break-continue` once each, (r12) / (r17) `par-query-in-body`
    once each, (r13) a legal `par for` still `[]`.
  - **`voidReturn` inherits (`{ ...scope }`) — decided, with the countervailing
    fact recorded.** It is the `for` / `while` arms' own shape and it is "the
    same terms as everywhere else". Measured consequence, pinned both ways: a
    bare `return` in a `par for` body draws
    `theta/parse/bare-return-in-non-void` at the top level and inside a
    non-void `fn` (r24) / (r25) and is silent inside a `fn(): void` (r26); a
    `return <value>` is silent in both enclosures (r27) / (r28). Against it:
    the runtime folds a body `return` into the ITERATION's value
    (`src/runtime/statement-executor.ts`, `runParForIteration`'s
    `case "return": … makeOk(flow.value)`), and CTRL-4
    (`docs/spec_topics/control-flow.md:76`) does not enumerate `return` among
    the body restrictions. Giving a `par for` body its own return regime is
    therefore a separate subject and is NOT invented here; residual 1 records
    it.
  - **§Fix (c) — arrangement 2 taken: the structural walk alone.**
    `walkIdentExpr` / `checkUnknownIdentifiers` are untouched, so a call to a
    `fn` under a `par for` still draws NO `theta/parse/unknown-identifier` —
    the declaration is refused anyway, so the second code is not required for
    the refusal. Cell (r2) pins that absence. Bug 0140's protected cell g9,
    which pins the identifier walk's `par for` non-reach as a REACH FACT naming
    this report's class, is BYTE-UNCHANGED and green: its subject did not move,
    so no flip or extension was owed. Residual 2 records the omission.
  - **§Fix (d) and (e) — preserved, not revisited.** `type-layer-checks.ts` is
    untouched: one emission site, provenance classification, no new
    module-evaluation-time reference on the two-node import cycle.
    `collectFnReturnAnnotations` and `collectFns` stay top-level-only — with
    (a) landed, top-level is the only placement a `fn` can occupy, so their
    reach coincides exactly with FN-1's admitted set and the widening residual
    (iv) invites is unreachable.
  - **§Fix (f) — 0079's fix record corrected, same change.** An APPEND-ONLY
    discharge note at the end of
    `docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md`
    records residual (iv) as DISCHARGED-as-unreachable rather than fixed by
    the mechanism it names, with the three barriers named. Append-only
    deliberately: the existing residual text at `:194–197` is cited by other
    documents, so no existing line moved. 0079's Status is unchanged.
- Gates: witness `tests/par-for.test.ts` 69/69 and
  `tests/interpolated-result-gate.test.ts` 83/83 (11 cells RED before the fix,
  right-reason — the absent refusal, `Observed: []`); full default suite
  `npx vitest run` 352 files / 7088 tests passed; `npm run typecheck`
  (`tsc -p tsconfig.json --noEmit`) clean; `npm run lint`
  (`eslint "src/**/*.ts"`) clean. Live: H8a
  `tests/live/live-production-acceptance.test.ts` additive cell cell 81 passed
  (registration-only, zero model turns); real H9a all four acceptance files
  13/13 (`noninteractive-acceptance` 10 covering areas (a)–(i),
  `ctor-unresolved-load-refusal` 1, `non-literal-discriminator-live` 1, the new
  `nested-fn-under-par-for-live` 1) with
  `tests/fixtures/h7a/permitted-codes.json` BYTE-UNCHANGED, decided on the real
  run: the probe's captured stdout+stderr, scanned with the manifest's own
  `parseSystemNoteCodes`, carried no `theta/{load,parse,runtime}/*` code at
  all, so `theta/parse/nested-fn` does not reach the H9a capture through this
  refusal path.
- Blast radius, premeasured BEFORE the witness was written: a prototype of the
  exact §Fix (a) shape was applied and the full suite run — 352 files / 7050
  tests green, ZERO reds, `tsc` clean. No pre-existing source shape in `src/`,
  in `tests/`, or in any committed `.theta` / `.thetalib` puts a `fn`, a
  function name in value position, a `return`, a bare object literal, an
  unknown enum variant, a junk annotation or a bare query statement under a
  `par for`, so no whole-list pin moved.
- Review: 2 rounds. Round 1 (deep) — four findings, all test- or
  comment-shaped, no behavioural defect: a genuine bare `QueryStmt` in a body
  was unwitnessed and cell (r12)'s "no discarded-query code" clause was
  unreachable (its source is a `try` over a query EXPRESSION, never a
  `QueryStmt`); six newly-reached check families were scored by no cell,
  including §Fix (b)'s named annotation family and the whole `return`
  disposition; new comments asserted the pre-fix state in the present tense;
  §Fix (g)'s top-level `unreachable-code` control was missing. Round 2 (fast) —
  CLEAN, with one cosmetic residual: the silence cells (r26) / (r27) / (r28)
  cannot red on the arm's absence. Closed by a comment-only orchestrator polish
  naming (r24) / (r25) as the cells that own that discrimination; polish
  verified by gate-diff (witness, suite, typecheck, lint all re-run green),
  confirmation round skipped.
- Verification: SOLID. (1) The witness reds: with the `par-for` arm neutralised
  to `return;` 19 cells red — every positive-expectation cell, (r1)–(r5), (r7),
  (r8), (r9), (r14), (r15), (r18)–(r25) and (h1) — and the cells that stay
  green are the eleven top-level controls, the four CTRL-4-owned count cells,
  the legal-`par for` control and the three silence cells, each of which now
  says in terms that it cannot make that discrimination. Restored by writing
  the recorded content back and verifying `git hash-object`
  (`abca53ce7e016ee4d0776906b8ae587bf8cd11c6`); green again 152/152. (2) Full
  default suite green. (3) The live cells were red-proven in both directions
  against the same neutralisation: the H8a cell reds with the offender
  appearing in `registeredNames()`, and it asserts the `theta-system-note`
  channel carries this row's own DIAG-4 message rather than only a registration
  boolean — `hasLoadParseError` is severity-and-namespace-only, so a boolean
  cannot tell this refusal from any other `theta/parse/*` error. (4) Lint and
  typecheck clean. Protected witnesses confirmed byte-unchanged by
  `git hash-object` and green: bug 0140's `type-name-as-value-refusal` 62/62
  (g9 inspected, subject intact), bug 0219's
  `reserved-keyword-object-pattern-head-refusal` 54/54, bug 0128's
  `non-literal-by-field-refusal` 12/12.
- Residuals:
  1. **A `par for` body's `return` regime is not enumerated by the spec.**
     `voidReturn` inherits, so a bare `return` in a `par for` body is judged
     against the ENCLOSING `fn`'s (or the theta's) return type — measured and
     pinned in both directions by (r24)–(r28). The runtime disagrees in
     principle: `runParForIteration` folds a body `return` into that
     ITERATION's `makeOk(flow.value)`, never into the enclosing `fn`'s return,
     and CTRL-4 (`docs/spec_topics/control-flow.md:76`) names `break` /
     `continue` / an enclosing-conversation query / shared mutation and not
     `return`. Whether a `par for` body should carry its own return regime is a
     CTRL-4 spec question this fix deliberately does not answer; the shipped
     verdict is the least-change one and is pinned so a change to it is
     deliberate.
  2. **The identifier walk's `par for` omission survives.** `walkIdentExpr`
     still has no `par-for` arm, so no identifier-resolution code is drawn
     anywhere under a `par for` — the gap `walkCallSiteExpr`'s own comment
     names ("Reached explicitly (unlike the ident walk, which predates RFC
     0003)"). §Fix (c) admits exactly this arrangement. Pinned by (r2) here and
     by bug 0140's row g9 (`tests/type-name-as-value-refusal.test.ts`,
     byte-unchanged), whose REACH FACT therefore still holds verbatim. Widening
     it changes which names a `par for` body resolves against — including the
     loop variable, which the call-site walk binds explicitly — and needs its
     own measurements.
  3. **CTRL-4's scan still does not descend into a `fn` declaration** (the
     `default` arm of the parser's own `par for` body scan). It is now
     unobservable for the shape §Reproduction used, because that shape no
     longer loads; cell (h1) pins that the two-nested-`fn` source is refused by
     `theta/parse/nested-fn` twice and NOT by
     `theta/parse/interpolated-result`, so the static gate's silence on it is
     recorded as correct rather than read as a gap. Whether the scan should
     descend for other reasons is untouched (§Non-goals).
  4. **The imported-`fn` route stays deferred (§Fix (e)).** An imported
     `Result`-returning `fn` is legal theta whose written annotation the static
     gate does not read, because `materializeSymbol`
     (`src/extension/import-static-checks.ts`) binds the `FnDecl` after
     `parseThetaDocument` has already run `checkTypeLayer`. No traversal change
     inside the parse can see it; a static route would need the load pass to
     re-run the type layer with the materialised declarations in hand.
  5. **Citation drift (bug 0134's class), NOT swept.** `walkExpr`'s new
     parameter and arm grow `src/parser/theta-document.ts` by 6 lines, shifting
     `theta-document.ts:<line>` citations at and beyond the `walkExpr` region.
     Measured: nine such citations in test files
     (`inline-object-duplicate-field-name`, `live-production-acceptance` twice,
     `params-default-unresolvable-enum-variant`, `type-name-as-value-refusal`
     twice, `non-literal-by-field-refusal`, `interpolation-parse-diagnostics`,
     `let-annotation-query-double-emission`) plus citations in several
     `docs/bugs/*.md` records. Two of the nine sit in protected witnesses. All
     are line-number-only drift — every cited comment text is still correct —
     and a sweep into unowned files is outside this report's remit. The two
     citations inside the files this fix does touch were re-measured and
     corrected.
- Discharge notes appended: bug 0079 (residual (iv) — DISCHARGED as
  unreachable, not as fixed by the mechanism it names; append-only at the end
  of that document, no existing line moved). Bug 0140's g9 note needed no
  amendment: its REACH FACT names the IDENTIFIER walk, which this fix does not
  widen, so the cell and its stated rationale hold verbatim and the file is
  byte-unchanged.
- Pinned dispositions / non-goals: the collectors stay top-level-only; the
  static gate keeps ONE emission site and provenance-not-name classification;
  the two-node `type-layer-checks.ts` to `theta-document.ts` import cycle gains
  no module-evaluation-time reference; no diagnostic code is minted and no
  registry *Trigger* is widened; `theta/parse/break-outside-loop` and
  `theta/parse/continue-outside-loop` are deliberately NOT drawn in a `par for`
  body; the three `theta/parse/par-*` codes' registry home is untouched.

## Discharge note (bug 0224)

*Residuals* item 2 above — the identifier walk's `par for` omission — is
DISCHARGED by bug
[0224](./0224-identifier-walk-never-descends-par-for.md): `walkIdentExpr`
gained a `case "par-for"` mirroring `walkCallSiteExpr`'s and `walkExpr`'s
arms. This report's §Fix (c) arrangement-2 standing charge ("the identifier
walk's omission survives … and needs its own measurements") is discharged by
that report's own measurements; this Status stays unchanged.

## Discharge note (bug 0223)

*Residuals* item 1 above — a `par for` body's unenumerated `return` regime — is
DISCHARGED by bug
[0223](./0223-par-for-body-return-folds-unenumerated.md): CTRL-4
(`docs/spec_topics/control-flow.md`) now enumerates `return` as a fourth body
restriction and `scanParForStmt` refuses it as
`theta/parse/par-return-in-body`, so the CTRL-4 spec question this fix
deliberately left open is answered in the refuse direction. The five cells this
report added — (r24)–(r28) in `tests/par-for.test.ts` — flip with it: each now
carries the body refusal, and (r24) / (r25) carry it beside the
`bare-return-in-non-void` verdict this report pinned, which 0223 withholds
nothing from. `runParForIteration`'s fold keeps its behaviour as a defensive
arm behind a load that no longer succeeds, and is locked by 0223's own
`tests/par-for-body-return-refusal.test.ts`. This Status stays unchanged.
