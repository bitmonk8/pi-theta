# Bug 0146 — `theta/parse/invoke-arg-type-mismatch`'s registered *Trigger* covers any "`invoke(...)` argument [that] does not type-check against the callee's declared `params` schema (when the callee is statically resolvable)" (`code-registry-parse.md:114`), and bug 0137's wiring gates emission on `collectProvableArgTypes` (`invoke-static-checks.ts:505`), which returns `undefined` for the `array`-literal (`:560–567`), `ident` (`:568–580`), `index` and `par-for` (`:581–589`) arms: `invoke("./c.theta", ["a"])` and `let n: integer = 1` + `invoke("./c.theta", n)` at a `params: x: string` callee both load clean and register, while the byte-identical mistype through a same-file `fn` call is refused at `E` — three shapes measured silent on the invoke surface and refused on the `fn` one (array literal, typed-`let` read, index read), plus a `par for` argument silent on the invoke surface

- **Status:** open. §Fix is not settled: three routes are enumerated with their
  consequences and the constraints are pinned, but the disposition — widen the
  extension-layer collector, add a sink-local provable read, or narrow the
  *Trigger* under DIAG-2 — is left to the run. No ordering dependency blocks
  it. [0137](./0137-invoke-arg-type-mismatch-unreachable.md) is **fixed
  (0.78.0)** and is this report's substrate; the coordination constraints on its
  witness are in §Fix (d).
- **Sev/Diff estimate:** S3/D3 — whole argument-shape classes named by a
  registered `E`-severity row's *Trigger* have no emission at the invoke sink
  (measured: four shapes — array literal, typed-`let` read, index read, `par for`
  — zero diagnostics on any channel, callers registered), and the byte-identical
  mistype through a same-file `fn` call is refused at `E` on the three of them
  measured there (§Reproduction (C)), so enforcement of one declared `params:` type
  diverges by call spelling inside one release. No wrong value and no wrong
  message is produced, and the deferral is admissible under
  `type-system.md:48`, which is what keeps it out of S1/S2; the invoke boundary
  additionally has a child-side runtime validator that the `fn` boundary does
  not (`subagent-params.ts:233`, named not measured — §Non-goals). D3 because
  `collectProvableArgTypes` is shared by three consumers, one of which compares
  through `subsetKinds` (`src/runtime/tool-call.ts`), which admits no `array<…>`
  at all — the `array` arm's own stated reason for bailing (`:560–566`) —
  because reaching the
  `ident` arm needs a scope-aware binding table the extension layer never
  builds — its three `pass.typeOf` calls all take the default empty `bindings`
  map (`:518`, `:549`; `bindings` appears nowhere else in the file) and
  `collectCallSites` (`:121`) discards scope by construction — because the
  laundered-binding identity channel 0050 needed in-layer
  (`unprovableBindings`, `type-layer-checks.ts:906`) has no extension-layer
  counterpart, and because the cheap route is a DIAG-2 *Trigger* change
  requiring an in-run adjudication.
- **Kind:** coverage gap — implementation, against one registered *Trigger*,
  with a deliberate soundness discipline as the cause. Three elements:
  1. **The *Trigger*'s letter covers the silent shapes.** The row
     (`docs/spec_topics/diagnostics/code-registry-parse.md:114`) is `E`
     severity, phase `type`, *Trigger* verbatim: "`invoke(...)` argument does
     not type-check against the callee's declared `params` schema (when the
     callee is statically resolvable)." In §Reproduction row A-iarr the argument
     is the array literal `["a"]`, the callee's declared `params` schema for
     slot 0 is `string`, and the callee is statically resolvable by
     `invocation.md:20`'s definition. Every clause holds; no diagnostic fires.
     Row A-ilet is the same with a `let n: integer = 1` read as the argument.
  2. **Emission is gated on a collector that withholds by shape, not by
     decidability.** Bug 0137's wiring builds the actual side of each param slot
     from `collectProvableArgTypes` (`src/extension/invoke-static-checks.ts:679`
     inside `buildInvokeArgSlot`, `:657`) and withholds the slot when it answers
     `undefined` (`:680–682`). Four of that function's arms answer `undefined`
     unconditionally: `array` (`:560–567`), the eight-kind nominal group
     including `ident` (`:568–580`), and `index` / `par-for` (`:581–589`). One
     of the three arm comments states outright that the withhold is stricter
     than the information available — `index` / `par-for`: both "CAN reduce past
     a nominal reference … so bailing is stricter than `#typeExpr` needs.
     Deliberate". The `ident` comment names the mechanism instead — "both
     consumers below read types with an EMPTY bindings map, so even a `let`-bound
     name is nominal here" — which is a property of the consumers, not of the
     program (§Reproduction (C)).
  3. **The withhold is bug 0072's soundness discipline, and both sides of that
     hold.** The discipline exists because unsound static reads produce false
     `E`s against well-typed programs: all ten `correctness` findings across bug
     0050's eight review rounds were that one species, and bug 0137's own run
     rejected a sentinel-`CompatType` route for the same reason
     (`invoke-static-checks.ts:650–655` records it in the tree). The cost is the
     other side: *Trigger*-covered true positives defer. Both statements are
     measured here — §Reproduction (A) measures the deferral, (C) measures that
     the parser-layer sibling decides three of the same shapes soundly at its own
     sink, and the FLIP row measures that the invoke emitter fires the instant a
     slot stops being withheld.
- **Related:**
  - [0137](./0137-invoke-arg-type-mismatch-unreachable.md) — **fixed (0.78.0)**,
    the origin and the substrate. Its subject was the whole row: the emitter
    `checkInvokeArgTypes` was reached only from `checkInvokeCall`, which had no
    caller in `src/`, so no input fired the code. Its fix wired the
    invoke-literal arm through `checkInvokeCall`
    (`invoke-static-checks.ts:895`) and settled four sub-questions. **This is
    not a duplicate and closing it as one would be wrong**: 0137's defect is
    closed by measurement — row A-ictl fires and un-registers its caller, which
    it did not at 0137's baseline — and this report's rows are measured after
    that fix. What remains is the part of the *Trigger* the collector's arms
    withhold. 0137's own fix record is explicit about the boundary: its
    "**Where the bug document turned out to be wrong**" section records that
    §Expected behaviour's "a1–a5 should report" contradicted §Fix's binding
    soundness constraint, that §Fix governed, and that cells a3 and a4 were
    therefore encoded as SILENCE cells with the reason named in the witness
    header — after the same two shapes were confirmed silent on the already-wired
    `.theta`-callable arm rather than read off the source. Residual 1 of that
    record names this filing.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, and the owner of the collector and its conservatism. It built
    `collectProvableArgTypes` for the `.theta`-callable and Pi-tool argument
    surfaces, and its rule — only an explicit incompatibility on **every** value
    the argument can take is a mismatch, `"unknown"` defers to the runtime net —
    is the rule 0137 reused verbatim at the invoke sink. Its *Coordination note
    (0.77.0)* (`:654–665`) records the layering wall any fix here meets: the
    collector is extension-layer and cannot be imported into `src/parser/**`
    without inverting the dependency direction, which is why 0050 re-applied the
    discipline in-layer instead. **Its subject was a different surface**: rows
    B-tarr and B-tlet measure that its own arm defers on the same two shapes, so
    this report's gap is the collector's, not the invoke sink's.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the asymmetry's other pole. Its in-layer answer to the
    same soundness problem, `provableArgType` (`type-layer-checks.ts:1654`) with
    `isProvenReduction` (`:1886`), **proves** all four shapes this report
    measures silent on the invoke surface: an annotated `let`'s recorded type is
    a proof (`:1793–1802`; only an unannotated `let` is marked unprovable,
    `:1019`, `:1043–1052`), an array literal is proven element-wise
    (`:1691–1704`), and an index read is proven by recursion on its target
    (`:1855–1865`). Committed cells `r4` (`tests/fn-arg-type-mismatch-wired.test.ts:949–968`)
    and `u7p` (`:1427–1445`) pin two of those emissions, both green at HEAD.
    **It does not reach this position**: its sink is `walkExpr`'s `call` case
    inside one file's parse, and the `invoke` label was deliberately split out of
    that arm (`type-layer-checks.ts:1992–1996`).
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) — **open**, the
    imported-route twin of "a registered *Trigger* half with no emission", at a
    different axis: there the uncovered half is a callee the parse cannot see;
    here it is an argument shape the extension-layer collector declines to read.
    Its §Fix routes may interact. Route 1 carries an imported signature into the
    parse-layer check, which lands on `provableArgType`'s argument side —
    unchanged by that route (0138 §Non-goals pins row d7). Route 2 runs an
    argument check at compose, and a compose-layer check needs an argument-side
    static read; 0138 §Fix (b) names the seam explicitly ("a compose-layer check
    either re-derives it or reads it off the importing document"), and
    `collectProvableArgTypes` is the extension-layer read already in that layer.
    **A route-2 fix there and a collector widening here would share one
    mechanism**; whichever lands second rebases against the first.
  - [0142](./0142-division-result-type-not-number.md) — **open**, and it touches
    this collector. Its §Fix (c) asks "whether `collectProvableArgTypes` moves in
    the same commit" and offers mirroring the operator rule for `/` at the
    arithmetic arm as one disposition. At this HEAD that arm is
    `invoke-static-checks.ts:551–558`; 0142 cites it as `:530–537`, which was its
    position at `3efdb4ac` before the 0137 fix shifted the file (+21 from
    `collectProvableArgTypes` onward — the bug 0134 drift class, adjudicated
    do-not-fix and therefore not corrected in that document by this filing).
    That arm is not one of the four this report names, and narrowing it makes
    disjointness *more* provable, so it can only add emissions. **A fix there
    must not flip witness cells a3/a4 without retaking this report's decision**;
    those cells assert silence for the `array` and `ident` arms, which §Fix (c)
    does not touch.
  - [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) —
    **open**, and its *Discharge note — bug 0137 (0.78.0)* is the same
    measurement from the other direction: it enumerates the withheld set
    (`ident`, `member`, `call`, `invoke`, `query`, `object`, `result-ctor`,
    `method-call`, `index`, `par-for`, `array`) and concludes that its own
    `named ⊑ array<…>` arm-order asymmetry is "structurally unreachable through
    `invoke(...)`". A collector widening here re-opens that reachability, so
    0144's §Fix must be consulted by any route 1 fix.
  - [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md) —
    **open**, residual 2 of the same 0137 fix record that produced this report.
    Disjoint by question: it measures how many diagnostics one site with two
    decidable mistypes draws per surface; this one measures whether a site with
    one mistype draws any. They share the sink, so a widening here enlarges the
    input set 0147 ranges over (§Non-goals).
  - [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) —
    **open**, disjoint. It owns the parser-layer withheld-binder sentinel's two
    faces. This report's withhold is encoded as absent `CompatType`s
    (`InvokeArgSlot.paramType` / `.argType` both `undefined`,
    `invoke-diagnostics.ts:172–182`), never as a sentinel name, so nothing here
    renders a sentinel.
- **Affected** (every citation verified at HEAD `a314ac83`, 0.78.0):
  - **The registered row.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:114` — `E`, phase
    `type`, spec anchor *[Invocation — Argument binding]*, *Hint* `—`, *Message*
    `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`.
    Mirror without a *Trigger* column: `docs/reference/diagnostics.md:163`,
    byte-identical *Message*. `rg -n 'invoke-arg-type-mismatch' docs/reference/`
    returns that one line, so a *Trigger*-only edit reaches no `docs/reference/`
    page.
  - **The collector, and its four withholding arms.**
    `src/extension/invoke-static-checks.ts:505` (`collectProvableArgTypes`,
    doc comment `:472–504`), `:560–567` (the `array` arm — "`displayType`
    renders an array as `array<…>`, which `subsetKinds`
    (`../runtime/tool-call.ts`) never admits, so the Pi-tool arm can prove
    nothing from it either way"), `:568–580` (the eight-kind nominal arm,
    `ident` first — "both consumers below read types with an EMPTY bindings map,
    so even a `let`-bound name is nominal here"), `:581–589` (`index` /
    `par-for` — "bailing is stricter than `#typeExpr` needs. Deliberate").
    `collectArmUnion` (`:601`) propagates `undefined` out of any composite
    containing one and maps an empty concatenation to `undefined` (`:615`).
  - **Why the `ident` arm is not a one-line widening.** The whole module makes
    exactly three `pass.typeOf` calls — `:518` (literals), `:549` (the
    result-fixed boolean operators) — both with the default empty `bindings`
    map (`StaticTypeInferencePass.typeOf`,
    `src/parser/static-type-inference.ts:182–188`, third parameter
    `bindings: ReadonlyMap<string, CompatType> = new Map()`). `rg -n bindings
    src/extension/invoke-static-checks.ts` returns three lines, two of them
    comments. The extension layer therefore holds **no** binding table at all,
    and `collectCallSites` (`:121`, walking at `:127` / `:136` / `:182`) collects
    call-site expressions while discarding every scope they sit in.
  - **The sink, which reads the collector unchanged.**
    `:801` (the invoke-literal loop), `:855` (`providedCount`, excluding the
    leading path literal), `:856` (`resolveCalleeArity`), `:857–905` (the arity
    and type block), `:872` (this arm's own empty null-prototype
    callee-annotation `TypeEnv`), `:874–887` (the per-slot loop calling
    `buildInvokeArgSlot`), `:895` (`checkInvokeCall`). `buildInvokeArgSlot`
    (`:657–698`) withholds on `field === undefined` (`:669`), `argExpr ===
    undefined` (`:672`), `annotationToCompatType` answering `undefined` (`:676`)
    and `collectProvableArgTypes` answering `undefined` (`:680`), then applies
    the every-member-incompatible test (`:683–692`). **`:680–682` is the only
    gate between the collector and the emitter on the actual side.**
  - **The emitter, which skips a withheld slot and emits otherwise.**
    `src/parser/invoke-diagnostics.ts:211` (`checkInvokeArgTypes`), the
    resolvability guard `:215–217`, the withheld-slot skip `:225–227`, the
    `"compatible"` / `"unknown"` deferral `:229–231`, the emission `:232–243`.
    `checkInvokeCall` (`:411–428`) runs arity first (`:415`), returns arity
    alone when it fires (`:423–425`), and calls the type check otherwise
    (`:427`). `InvokeArgSlot`'s two `CompatType | undefined` fields and their
    documented meaning are at `:169–183`.
  - **The other two consumers of the same collector.** `:995–1001` (the
    `.theta`-callable per-slot check — the same `argTypes === undefined`
    `continue`, measured as rows B-tarr / B-tlet) and `:1084–1096` (the Pi-tool
    schema-conflict check, whose `subsetKinds` consumer is the reason the
    `array` arm's comment gives for bailing). A widening lands at all three.
  - **The parser-layer sibling that decides the same shapes.**
    `src/parser/type-layer-checks.ts:1575` (`checkFnCallArgs`), `:1608` (its
    `provableArgType` call), `:1654` (`provableArgType`, doc comment
    `:1629–1653` naming `collectProvableArgTypes` as the discipline's source and
    the import direction as the reason it is re-applied in-layer), `:1691–1704`
    (the `array` arm — proven element-wise through `isProvenReduction`),
    `:1769–1803` (the `ident` arm — the RECORDED type is read directly and
    returned unless its object identity is in `unprovableBindings`),
    `:1804–1844` (the arms it withholds: `member` / `method-call`, `call` /
    `invoke`), `:1855–1865` (the `index` arm — recurse on the target, then take
    the element narrowing), `:1886` (`isProvenReduction`), `:906`
    (`unprovableBindings`),
    `:1019` and `:1043–1052` (only an UNANNOTATED `let` is marked, "An ANNOTATED
    `let` is excluded because the annotation IS the recorded type … so it stays
    a proof"). This is the mechanism §Reproduction (C) measures.
  - **The registration consequence.**
    `src/extension/production-composition.ts:2047` (`hasLoadParseError`) drops
    any theta carrying an error-severity `theta/load/*` or `theta/parse/*`
    diagnostic. The row is `E`, so a fired slot denies registration — which
    rows A-ictl, B-tctl and all four (C) rows measurably do, and the silent rows
    do not.
  - **The resolved callee shape, unchanged and sufficient.**
    `:371–381` (`CalleeArityField` — `typeSource` and `name`), `:383–397`
    (`CalleeArity`, its `fields` list at `:396`), built by `resolveCalleeArity`
    (`src/extension/production-composition.ts:1316`, the field map `:1346`).
    Nothing on the EXPECTED side is missing: the silent rows' expected type is
    the primitive `string`, which `annotationToCompatType` resolves without an
    environment.
  - `docs/spec_topics/type-system.md:48` — *Unresolvable operands*, the rule the
    withhold defers under, and the rule §Expected behaviour reads against the
    `ident` arm. `:31` — the closed structural-case list, which names this row
    among the codes an undecidable case is reported as. `:50` (TYPE-9), `:52`
    (TYPE-10, which routes a cross-form or cross-named-schema mismatch to this
    row "not deferred to a runtime AJV failure").
  - `docs/spec_topics/invocation.md:20` — *Static resolution*, satisfied at
    every row in (A) because `resolveCalleeArity` returned a shape.  `:22` — the
    unresolvable-callee warning arm, untouched here. `:38` — *Argument binding*,
    "each argument type-checked against the param's declared schema … Type
    mismatches surface as `theta/parse/invoke-arg-type-mismatch` when the callee
    is statically resolvable per Static resolution above; otherwise the runtime
    AJV check is the safety net". `:48` — arity before per-argument type.
  - `docs/reference/discovery-cli.md:240–241` — the author-facing statement:
    "Positional, in `params:` declaration order, each type-checked against the
    param's schema (the slash-boundary binder does not run)."
  - `docs/spec_topics/tool-calls.md:14` — §*Argument shape*, which binds the
    `.theta`-callable surface to the invoke one by name.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a *Trigger* change is a spec change, dispositioned under the
    GOV-15 carve-out); `:74` — DIAG-4 (the *Message* column is normative;
    unchanged by every route below).
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9`
    — the loads-cleanly predicate; `:25` — the diagnostic-registry carve-out,
    whose addition arm covers inputs newly brought into a code's emission set.
  - **The corpus bound.** `git ls-files -- '*.theta' '*.thetalib'` → 34 files;
    `grep -n 'invoke('` over them returns one site,
    `tests/live/acceptance/fixtures/acc-imports-invoke.theta:8`
    (`invoke("./acc-child.theta")`, zero arguments against a callee declaring no
    `params:`), so no tracked file has a param slot for this row to judge. Bug
    [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) is binding
    on any re-measurement: the committed-fixture parse gate does not walk
    `.thetalib`.
  - **Existing coverage — the silences are pinned, the emissions are not.**
    `tests/invoke-arg-type-mismatch-wired.test.ts` (40 cells, green at HEAD):
    cell a3 (`:815–837`, fixture `:363`) asserts the array-literal silence on
    three channels and that the caller registers; cell a4 (`:839–853`, fixture
    `:364–366`) asserts the typed-`let` silence. Both call `assertRowSurfaceLive`
    (`:535`) first — a positive control on two channels asserting that the same
    workspace and the same load produced the row at least once — so neither
    passes while measuring nothing. The file header states the reason at
    `:60–70`. **No cell measures the invoke surface in the emitting direction
    for any of the four shapes**, because no input produces one. On the
    `fn` surface the mirror emissions ARE pinned: `r4`
    (`tests/fn-arg-type-mismatch-wired.test.ts:949–968`) and `u7p` (`:1427–1445`).
  - **The gate does not see this.** `tools/closing-gate/index.js:705` (finding
    kind `registry-code-no-asserting-test`) relates a registered code to an
    *asserting test*, not to a reachable emission per *Trigger* clause;
    `tests/invoke-diagnostics.test.ts` asserts the code against hand-built
    `CompatType`s and clears it.
- **Observed at:** `0.78.0` (HEAD `a314ac83`). Offline, deterministic; no live
  model, no provider. Every row in groups (A)–(C) through the shipped
  composition root `discoverAndComposeFixtures`
  (`src/extension/production-composition.ts`) over one planted `.pi/theta/`
  discovery workspace in a temp directory, on
  `tests/invoke-arg-type-mismatch-wired.test.ts`'s harness shape — one load in
  `beforeAll`, a distinct callee stem per caller, the fake `pi` / `ctx` shape and
  the three channels that file establishes (registered slash names,
  `ctx.ui.notify` error messages, `makeLoadEmit`'s no-UI stderr mirror, the only
  channel carrying the emitting file). The FLIP row calls `checkInvokeCall`
  (`src/parser/invoke-diagnostics.ts:411`) directly with one non-withheld slot.
  One scratch vitest file, run on the outputs quoted below, then deleted.
  `src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
  unmodified by this filing.

## Summary

`theta/parse/invoke-arg-type-mismatch` is registered at `E` severity with a
*Trigger* that is a condition over author source text against a callee the load
pass already opens (`code-registry-parse.md:114`). Bug 0137's fix (0.78.0) gave
the row its production emission site at the `invoke("./x.theta", …)` literal
surface. That site fires for a literal argument and defers for four whole
argument-shape classes.

Emission is gated on `collectProvableArgTypes`
(`invoke-static-checks.ts:505`) returning a collected type set whose every
member is explicitly incompatible with the param's declared type. Four of that
function's arms return `undefined` unconditionally, and `undefined` means
"withhold": the `array` literal (`:560–567`), the eight-kind nominal group whose
first member is `ident` (`:568–580`), and `index` / `par-for` (`:581–589`).
`buildInvokeArgSlot` (`:657`) turns that into a withheld slot at `:680–682`, and
`checkInvokeArgTypes` skips a withheld slot before `checkCompatible` runs
(`invoke-diagnostics.ts:225–227`).

Measured through the shipped composition root: `invoke("./c.theta", ["a"])` and
`let n: integer = 1` + `invoke("./c.theta", n)` against a callee declaring
`params: x: string` each register with **zero** diagnostics on any channel. So do
an index read off an annotated `array<integer>` binding and a `par for` used as
the argument. The integer-literal control at the same callee shape draws
`invoke argument 0 ('x') type mismatch: expected string, got integer` and denies
registration, so the workspace and the load are producing the row.

**The withhold is decidable-shape-shaped, not information-shaped, and the
`fn` surface proves it.** The same-file `fn` call surface refuses every shape
measured on it. `fn h(x: string)` called `h(["a"])` draws
`fn 'h' argument 0 ('x') type mismatch: expected string, got array<string>`; the
typed-`let` and index-read spellings draw the `integer` form; the integer-literal
control draws it too. The `par for` argument shape was measured on the invoke
surface only, so the fourth pair is one-sided — though the parser-layer sibling
treats a `par for` as a proof by returning `typeOf`
(`type-layer-checks.ts:1845–1854`), which is the same disposition as the three
measured pairs. Bug 0050's `provableArgType` (`type-layer-checks.ts:1654`) decides
them because it holds a per-scope binding map and treats an annotated `let`'s
recorded type as a proof (`:1793–1802`; only unannotated `let`s are marked
unprovable, `:1019`, `:1043–1052`). The extension-layer collector holds no
binding map at all — its three `pass.typeOf` calls take the default empty one
(`:518`, `:549`; `static-type-inference.ts:182–188`) — and `collectCallSites`
(`:121`) discards scope by construction.

**The `.theta`-callable surface defers identically**, because it reads the same
collector (`:995–1001`): rows B-tarr and B-tlet are silent while B-tctl fires.
So the divergence is one surface against two, not one row against one surface.

**The withhold is bug 0072's deliberate discipline, and this report claims no
error in it.** Only an explicit incompatibility on every value an argument can
take is a mismatch; `"unknown"` defers to the runtime net. That rule exists
because unsound static reads produce false `E`s against well-typed programs —
all ten `correctness` findings across bug 0050's eight review rounds were that
one species, and bug 0137's run rejected a sentinel-`CompatType` shortcut for
the same reason (recorded in the tree at `:650–655`). The cost is the other
side of the same coin: arguments the *Trigger*'s letter covers, and which the
sibling sink decides soundly, defer.

**The flip is one gate wide and needs no edit at the sink.** `:680–682` is the
only place the collector's verdict reaches the invoke slot, and the emitter
fires the moment a slot stops being withheld — measured directly (§Reproduction
FLIP): one non-withheld slot carrying `array<string>` under `string` produces
`invoke argument 0 ('x') type mismatch: expected string, got array<string>`,
the same `<actual>` rendering the `fn` surface already emits for that shape. Any
widening of the collector's arms therefore lands emissions here automatically,
and reds witness cells a3/a4, which assert the silence.

## Reproduction

Offline, deterministic, at `a314ac83`. Each row is one planted `.theta` in a temp
`.pi/theta/` workspace loaded once by `discoverAndComposeFixtures`. Every callee
is `mode: subagent` declaring a single `params:` field `x: string`, one callee
per caller (the row's *Message* names neither caller nor callee, so a shared
callee would make a per-cell verdict unattributable). `registered` is membership
in the returned fixture list; `diag` is the stderr-mirror line, verbatim, with
the temp path stripped to the file's basename and the callees' own
`theta/load/binder-model-unresolved` warnings filtered out — a callee with a
non-`string` param is not bypass-eligible against this workspace's model-less
registry, which is inert here and not under test.

```
@@ A ictl  invoke("./xctl.theta", 1)                             [integer literal]
   registered :: NO
   diag       :: ictl.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
@@ A iarr  invoke("./xarr.theta", ["a"])                         [array literal]
   registered :: YES
   diag       :: —
@@ A ilet  let n: integer = 1 / invoke("./xlet.theta", n)        [typed-let ident]
   registered :: YES
   diag       :: —
@@ A iidx  let xs: array<integer> = [1] / invoke(…, xs[0])       [index read]
   registered :: YES
   diag       :: —
@@ A ipar  invoke("./xpar.theta", par for a in ["a"] { "b" })    [par for]
   registered :: YES
   diag       :: —
@@ B tctl  yctl(1)                                               [integer literal]
   registered :: NO
   diag       :: tctl.theta:6:1: theta/parse/tool-arg-type-mismatch: tool 'yctl' argument type mismatch: expected string, got integer
@@ B tarr  yarr(["a"])                                           [array literal]
   registered :: YES
   diag       :: —
@@ B tlet  let n: integer = 1 / ylet(n)                          [typed-let ident]
   registered :: YES
   diag       :: —
@@ C fctl  fn g(x: string) / let q = g(1)                        [integer literal]
   registered :: NO
   diag       :: fctl.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('x') type mismatch: expected string, got integer
@@ C farr  fn h(x: string) / let q = h(["a"])                    [array literal]
   registered :: NO
   diag       :: farr.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'h' argument 0 ('x') type mismatch: expected string, got array<string>
@@ C flet  fn k(x: string) / let n: integer = 1 / let q = k(n)   [typed-let ident]
   registered :: NO
   diag       :: flet.theta:6:11: theta/parse/fn-arg-type-mismatch: fn 'k' argument 0 ('x') type mismatch: expected string, got integer
@@ C fidx  fn m(x: string) / let xs: array<integer> = [1] / m(xs[0]) [index read]
   registered :: NO
   diag       :: fidx.theta:6:11: theta/parse/fn-arg-type-mismatch: fn 'm' argument 0 ('x') type mismatch: expected string, got integer
@@   p0ctl  let z = 1                                             [workspace control]
   registered :: YES
   diag       :: —

REGISTERED :: ["iarr","iidx","ilet","ipar","p0ctl","tarr","tlet","xarr","xctl","xidx","xlet","xpar","yarr","yctl","ylet"]
```

**(A) is the invoke-literal surface, the report.** A-ictl is the live positive
control: this workspace and this load do produce the row, and its caller is
un-registered by `hasLoadParseError`
(`production-composition.ts:2047`), so the four `YES` rows below it measure a
missing emission and not a broken workspace. A-iarr and A-ilet are the two
shapes witness cells a3 and a4 already pin. A-iidx and A-ipar reach the
`index` / `par-for` arm; neither draws an arity diagnostic, which is how the
run establishes that each argument really occupied a param slot — the callee
declares one required param, so a slot the walk had missed would have produced
`theta/parse/invoke-arity-too-few`.

**(B) is the `.theta`-callable surface, and it defers identically.** B-tctl
fires through bug 0072's wiring; B-tarr and B-tlet are silent. Both surfaces
read the same collector (`:995` versus `:679`), so the two silences have one
cause.

**(C) is the same-file `fn` surface, and it refuses all four rows measured on
it.** Every row
un-registers its caller. C-farr renders `array<string>` as `<actual>`, which is
the exact string a widened `array` arm would carry into the invoke *Message*
(see FLIP). C-flet and C-fidx are the annotated-`let` proof
(`type-layer-checks.ts:1793–1802`) reached directly and through the `index` arm's
recursion (`:1855–1865`). C-fctl is the shared control.

### FLIP — the emitter fires the instant a slot is not withheld

`checkInvokeCall` (`invoke-diagnostics.ts:411`) called directly, arity in range,
with one slot whose `paramType` is `prim string` and whose `argType` is
`array<prim string>` — i.e. exactly what `buildInvokeArgSlot` would build if the
collector's `array` arm returned a set instead of `undefined`:

```
FLIP :: [
  "error theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got array<string>"
]
```

No second gate exists between the collector and this emission: `:680–682` is the
only actual-side withhold in `buildInvokeArgSlot`, and the emitter's own skip
(`:225–227`) triggers on a withheld slot alone. **This is the flip condition** —
widening any arm of `collectProvableArgTypes` lands emissions at the invoke sink
with no edit at the sink, and reds witness cells a3 (`:815–837`) and a4
(`:839–853`), which assert the silence.

## Expected behaviour

**The *Trigger* names the shapes, so the row promises them.** DIAG-2
(`diagnostic-shape.md:72`) makes the registry closed and a *Trigger* change a
spec change. `code-registry-parse.md:114`'s *Trigger* has exactly two clauses —
the argument does not type-check against the callee's declared `params` schema,
and the callee is statically resolvable — and both hold at rows A-iarr, A-ilet,
A-iidx and A-ipar. It carries no qualifier by argument shape, by expression kind,
or by what the implementation can read. Neither does `invocation.md:38`
("each argument type-checked against the param's declared schema"), nor
`docs/reference/discovery-cli.md:240–241` ("each type-checked against the param's
schema"), nor TYPE-10 (`type-system.md:52`), which routes a cross-form or
cross-named-schema mismatch to this row "not deferred to a runtime AJV failure".
A reader of the registry cannot distinguish the covered shapes from the
uncovered ones.

**`type-system.md:48` licenses the deferral for an operand, and the `ident`
arm's operand is one the parser demonstrably resolves.** The rule skips a check
"when either side of a compatibility check is past the parser's static view",
with two examples — a binding whose RHS depends on an unregistered Pi-tool
schema, and an `invoke` against a callee that produced
`theta/load/callee-has-errors`. Both are genuinely unavailable to the pipeline.
A typed `let n: integer = 1` is not: at the `fn`-argument sink the parser layer
proves it and emits (row C-flet), and it does so through a mechanism the same
run already builds — `TypeLayerWalk`'s per-scope `bindings` map, with the
annotated case explicitly excluded from the unprovable set
(`type-layer-checks.ts:1043–1052`). The operand is past *this consumer's* static
view because the extension layer builds no binding table, not because the
program hides it. The same reading applies verbatim to the `index` and `par-for`
arms, whose own comment concedes that both "CAN reduce past a nominal reference
… so bailing is stricter than `#typeExpr` needs".

The `array` arm is different and must be stated separately. Its stated reason is
about a **different consumer**: `displayType` renders an array as `array<…>`,
"which `subsetKinds` … never admits, so the Pi-tool arm can prove nothing from
it either way". That is true of the Pi-tool schema-conflict check
(`:1084–1096`), whose comparison is over JSON-Schema kind sets. It is not a
statement about the invoke or `.theta`-callable checks, which compare
`CompatType`s through `checkCompatible` — and row C-farr measures that the same
comparison decides `array<string> ⋢ string` at the `fn` sink and renders it. So
on the `array` arm the withhold is a shared-collector consequence, not a
decidability one.

**That does not make the current behaviour wrong.** The discipline it implements
is the correct one and this report proposes no weakening of it: an argument whose
value set is not provably every-member-incompatible must defer, and no route
below may reach an emission by fabricating a type. What is unsettled is the
pairing of a *Trigger* that names these shapes with a sink that defers on 100%
of their inputs while the sibling sink decides them. Two readings are available
and this report does not pick between them:

- **Reading A — the *Trigger* is accurate and the extension-layer read is
  incomplete.** The information exists in the run (the parser layer proves the
  same shapes in the same load), so the collector or the sink is missing a
  mechanism. §Fix routes 1 and 2 follow; DIAG-2 is not engaged, because the
  *Trigger* prose is already correct.
- **Reading B — the collector's shape set IS the theta 1.x disposition and the
  *Trigger* over-promises.** The soundness discipline is deliberate, its
  conservatism is load-bearing, and the honest corpus edit states which argument
  shapes the invoke and `.theta`-callable surfaces judge, citing
  `type-system.md:48`. §Fix route 3 follows, as a DIAG-2 *Trigger* change under
  the GOV-15 diagnostic-registry carve-out
  (`source-language-stability.md:25`) — a **removal** over an empty in-scope
  input set, since no input emits on these shapes today.

What both readings agree on: the present state is a registered `E` row whose
*Trigger* half has no emission site, which is the state bug 0137 was filed
against for the whole row and bug 0138 records for a different half of a sibling
row.

**GOV-15 is engaged in the addition direction under routes 1 and 2.** Rows
A-iarr, A-ilet, A-iidx, A-ipar, B-tarr and B-tlet all load cleanly today
(`source-language-stability.md:9`: no diagnostic of effective severity `E`) and
would gain an `E`, changing observable (b). That is the carve-out's addition arm
(`:25`). The corpus half is already bounded — 34 tracked `.theta` / `.thetalib`
files carry one `invoke` site, with zero arguments against a param-less callee —
and a fix re-measures rather than citing, reading
[0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) first.

## Actual behaviour / root cause

**One gate, fed by a collector that answers by expression kind.**
`buildInvokeArgSlot` (`invoke-static-checks.ts:657`) builds the actual side of
each param slot and withholds when the collector answers `undefined`:

```ts
  const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);   // :679
  if (argTypes === undefined) {
    return withheld(field.name);                                          // :681
  }
```

`collectProvableArgTypes` (`:505`) is an exhaustive `switch` over the `Expr`
union with no `default` arm. Four arms answer `undefined` for every input:

- `array` (`:560–567`) — the reason given is the Pi-tool consumer's kind-set
  comparison, not this consumer's `CompatType` comparison.
- the eight-kind nominal group `ident` / `member` / `call` / `invoke` / `query` /
  `object` / `result-ctor` / `method-call` (`:568–580`) — "Each types as a
  `named` nominal reference past the parser's static view … `ident` included:
  both consumers below read types with an EMPTY bindings map, so even a
  `let`-bound name is nominal here."
- `index` and `par-for` (`:581–589`) — "Both CAN reduce past a nominal reference
  … so bailing is stricter than `#typeExpr` needs. Deliberate."

`collectArmUnion` (`:601`) propagates `undefined` out of any composite one of
whose value-contributing arms is withheld, so a ternary or `match` containing an
`ident` withholds too.

**The `ident` arm's stated reason is a fact about the extension layer, not about
the program.** `StaticTypeInferencePass.typeOf`
(`src/parser/static-type-inference.ts:182–188`) takes `bindings` as a third
parameter defaulting to an empty `Map`, and its doc comment states what that
costs: "`bindings` resolves an in-scope `let`-binding identifier to its recorded
type … an unbound identifier remains a nominal self-reference (deferred to the
runtime AJV safety net)". The module makes three `typeOf` calls (`:518`, `:549`)
and passes no `bindings` at any of them; `rg -n bindings
src/extension/invoke-static-checks.ts` returns three lines, two of which are
comments. There is no binding table in the extension layer to pass, and
`collectCallSites` (`:121`) — the one traversal that feeds all three check loops
— records call-site expressions and discards the scopes containing them. So
widening the `ident` arm is not an arm edit; it needs a scope-aware binding
carriage the layer does not have.

**The parser layer holds exactly that carriage, and uses it.** `TypeLayerWalk`
threads a `bindings` map through its statement walk and `provableArgType`
(`type-layer-checks.ts:1654`) reads the RECORDED type directly rather than
through `typeOf`, because "The RECORDED type is the only channel that carries a
JUDGED type" (`:1769–1792`). An annotated `let` is recorded as its annotation
and is never marked unprovable — "An ANNOTATED `let` is excluded because the
annotation IS the recorded type and `checkLetRhsCompat` above already judges its
initialiser, so it stays a proof" (`:1049–1051`). The `array` arm proves
element-wise through `isProvenReduction` (`:1691–1704`, `:1886`), and the
`index` arm recurses on the target before taking the element narrowing
(`:1855–1865`). Rows C-farr, C-flet and C-fidx are those three mechanisms
firing; committed cells `r4` and `u7p` pin two of them.

**Nothing downstream of the collector re-filters.** Once a slot is not withheld,
`checkInvokeArgTypes` (`invoke-diagnostics.ts:211`) skips only on an absent side
(`:225–227`) or a `"compatible"` / `"unknown"` answer (`:229–231`), and emits
otherwise (`:232–243`). The FLIP row measures that directly: a slot carrying
`array<string>` under `string` emits, with the same `<actual>` rendering the
`fn` surface already produces. The invoke sink is a pure reader of the
collector, which is why the flip needs no edit there — and why cells a3/a4 are
the tripwire.

**The withhold is the discipline, and the discipline is right.** Bug 0072's rule
is that only an explicit incompatibility on every value an argument can take is
provable. Bug 0050's eight review rounds produced ten `correctness` findings and
every one was the same species: an unsound static read yielding a false `E`
against a well-typed program. Bug 0137's run met the same wall and recorded it
in the tree (`invoke-static-checks.ts:650–655`): fabricating a sentinel
unresolvable `named` argument type answers `"incompatible"` at an `array<…>` or
inline-object param, because `decide` (`src/parser/type-compat.ts`) tests
`sup.kind === "array"` and `sup.kind === "object"` before its `sub.kind ===
"named"` branch. So the four arms are not an oversight; they are the cheapest
correct answer available to a consumer with no binding table. The defect is that
the registered *Trigger* promises what that answer withholds.

## Why it matters

- **A registered `E` row promises argument shapes no input can fire.** That is
  the shape bug 0137 was filed against for the whole row and bug 0138 records
  for a sibling row's imported half. A reader of
  `code-registry-parse.md:114` cannot tell which shapes are live.
- **Enforcement of one declared `params:` type depends on call spelling.** The
  same array literal under the same `string` param is refused through a
  same-file `fn` (C-farr) and admitted through `invoke(...)` (A-iarr) and
  through a `.theta`-callable call (B-tarr). Bug 0137's §Why it matters made
  exactly this argument for the integer-literal shape; it still holds for the
  three measured pairs after that fix, in the opposite direction — the `fn`
  surface is now the strict one.
- **Refactoring in the direction the corpus recommends loses checks.** A
  `let`-bound argument is the ordinary spelling once a value is computed before
  the call, and `imports.md`-style factoring moves a same-file `fn` call to an
  `invoke` or a `tools:` entry. Both moves silently remove a load-time check,
  with no diagnostic marking the loss.
- **The pinned silences make a widening a coordinated change, not a local
  one.** Cells a3 and a4 assert the silence with live positive controls, and
  they red on any widening — by design. That is the right tripwire, and it means
  an unrelated fix that touches the collector (bug 0142 §Fix (c) names it)
  cannot flip these shapes without retaking this report's decision.
- **Bug 0144's arm-order asymmetry becomes reachable again under routes 1 and
  2.** Its 0137 discharge note concludes that a `named` sub can never reach
  `decide` from the invoke sink because the collector withholds every shape that
  types as `named`. Widening the `ident` group is precisely the change that
  re-opens it.
- **The runtime nets differ per surface and the divergence is not symmetric.**
  The `fn` boundary has none — bug 0138 measures `evalUserFnCall` binding each
  argument with `defineLocal` and no type test
  (`src/runtime/statement-executor.ts:395`, `:416`) — and it is the surface that
  checks. The invoke boundary has a child-side marshalled-params validator
  (`src/runtime/subagent-params.ts:214`, `:233`, named not measured here) and it
  is the surface that defers. The stricter parse check sits on the boundary with
  the weaker runtime.

## Non-goals

- **Weakening bug 0072's soundness rule.** No route below may reach an emission
  by trusting a reduced type, by fabricating a `CompatType`, or by treating an
  `"unknown"` compatibility answer as a mismatch. The every-member-incompatible
  test (`invoke-static-checks.ts:683–692`) and the emitter's `"compatible"` /
  `"unknown"` deferral (`invoke-diagnostics.ts:229–231`) are invariants here.
- **The remaining seven kinds of the nominal group.** `member`, `call`, `invoke`,
  `query`, `object`, `result-ctor` and `method-call` (`:568–580`) type as
  `named` references minted from an author-chosen name. The parser-layer sibling
  withholds `member` / `method-call` (`type-layer-checks.ts:1804–1819`) and
  `call` / `invoke` (`:1820–1844`) for reasons stated at each arm, and does NOT
  withhold `query` / `object` / `result-ctor` / `par-for` (`:1845–1854`, which
  return `typeOf`). They are named here as the bound of the `ident`-arm question,
  not claimed as gaps.
- **The `<actual>` rendering of any newly-decidable shape beyond what FLIP
  measures.** `renderCollectedTypes` (`:626`) and `dedupeArgType` (`:716`) fix
  the spelling; FLIP measures the `array<string>` case. A route that admits a
  union of newly-collected members states its own rendering.
- **The per-site diagnostic-count divergence across the three surfaces.**
  `checkInvokeArgTypes` has no first-mismatch `break` while the
  `.theta`-callable arm stops at its first;
  [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md) owns it
  (residual 2 of the bug 0137 fix record). Disjoint: that report is about how
  many diagnostics a site with two *decidable* mistypes draws, this one about
  whether a site with one draws any. Every route below leaves the counts
  unchanged — but a route that makes more shapes decidable widens 0147's input
  set, which a fix here states.
- **Runtime validation on either surface.** Whether and where a mistyped
  argument is caught at runtime is unmeasured here; the two seams are named in
  §Why it matters so the class is bounded, and establishing the per-surface
  disposition needs a live probe and belongs with whatever report claims it.
- **Arity at any position.** Wired and ordered first on this surface
  (`invoke-diagnostics.ts:415`, `:423–425`); bug
  [0131](./0131-in-document-fn-call-arity-unchecked.md) owns the in-document
  `fn` call position.
- **Widening the check beyond declared param types.** A callee param whose
  declared type does not resolve to a decidable `CompatType` defers by
  `type-system.md:48`, as it does on both sibling arms. Inferring a param type
  from the callee body is not part of any route here.
- **The withheld-binder sentinel's two faces.**
  [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) owns them.
  This report's withhold is encoded as absent `CompatType`s
  (`invoke-diagnostics.ts:172–182`), so no sentinel is minted or rendered.

## Fix

**Not settled. This report exists to pin the disposition first**, on the model
bugs 0135, 0136 and 0138 §Fix set: the constraints are fixed and the routes are
enumerated with their consequences, and the choice is left to the run. Three
questions have to be answered, and (d) orders the work.

**(a) Which reading is being taken?** §Expected behaviour states them. Reading A
(the *Trigger* is accurate; the extension-layer read is incomplete) admits routes
1 and 2. Reading B (the collector's shape set is the theta 1.x disposition)
admits route 3. A fix must state which, because the corpus consequence differs:
routes 1 and 2 edit no `docs/` file, route 3 edits one registry row and must
verify the mirrors.

**(b) Three routes, with their consequences.**

1. **Widen `collectProvableArgTypes`' arms.** Per-arm, and the arms price
   differently:
   - **`array` (`:560–567`)** is the cheapest. `#typeExpr`'s own `array` arm
     already answers `kind: "array"`, and the parser-layer sibling proves an
     array literal element-wise through `isProvenReduction`
     (`type-layer-checks.ts:1691–1704`) — the same exactness test this
     collector's every-member rule expresses set-wise. **Costs to weigh:** the
     collector has three consumers and the Pi-tool one is the arm comment's
     stated reason for bailing. `subsetKinds` (`src/runtime/tool-call.ts`)
     splits a rendered top-level union into kinds and admits no `array<…>`, so
     the arm must either return a set only when the consumer can use it — which
     the current signature cannot express — or the Pi-tool call site
     (`:1084–1096`) must be made to withhold on an `array`-kinded member
     locally. Either way the change lands emissions on all three surfaces at
     once, so the GOV-15 addition sweep covers three surfaces.
   - **`ident` (`:568–580`)** is not an arm edit. It needs a scope-aware
     binding table in the extension layer: `collectCallSites` (`:121`) discards
     scope, `pass.typeOf` is called with the default empty `bindings` map
     (`:518`, `:549`), and the laundered-binding identity channel bug 0050
     needed in-layer (`unprovableBindings`, `type-layer-checks.ts:906`,
     recorded at `:1019` / `:1043–1052`) has no counterpart here — without it,
     an unannotated `let x = flag ? 1 : "a"` would launder an erased read into
     a proof, which is the false-`E` species this whole discipline refuses.
     **Costs to weigh:** a second binding walk in a second layer, over the same
     statements the parser layer already walked, with two implementations of
     one rule to keep in step.
   - **`index` / `par-for` (`:581–589`)** follow the `ident` arm: an index read's
     proof obligation belongs to its target, which is usually an `ident`
     (row A-iidx / C-fidx), and a `par for`'s element type is the CTRL-3
     nominal. Both are reachable only once the `ident` arm is.
2. **Give the invoke sink a provable read of its own, sourced from the parser
   layer.** The discipline already exists as `provableArgType` /
   `isProvenReduction`, and the import direction is available: the extension
   module already imports `annotationToCompatType` and `collectTypeEnv` from
   `../parser/type-layer-checks` (`invoke-static-checks.ts:78`). **Costs to
   weigh:** `TypeLayerWalk` is a module-private class
   (`type-layer-checks.ts:882`, not exported) and `provableArgType` is a private
   method carrying per-parse instance state (`unprovableBindings`,
   `resultBindings`, the callee-resolution tables), so the route means
   extracting the predicate into an exported, explicitly-parametrised helper and
   supplying it the bindings map — which is question 1's `ident` cost relocated,
   not removed. What it buys is one implementation of the rule instead of two,
   and bug 0072's *Coordination note* is the precedent for wanting that. It also
   answers a single-`CompatType` shape against the collector's set shape, so the
   two disciplines must be reconciled at the sink rather than assumed
   equivalent.
3. **Narrow the *Trigger* (DIAG-2).** Edit
   `docs/spec_topics/diagnostics/code-registry-parse.md:114`'s *Trigger* to
   state which argument shapes the check judges, citing `type-system.md:48` for
   the rest. `docs/reference/diagnostics.md:163` carries no *Trigger* column —
   verified, `rg -n 'invoke-arg-type-mismatch' docs/reference/` returns that one
   line — so a *Trigger*-only narrowing does not reach it; a fix confirms rather
   than assuming, and checks `invocation.md:38`,
   `docs/reference/discovery-cli.md:240–241` and TYPE-9 / TYPE-10
   (`type-system.md:50`, `:52`) for the same over-promise, since all four state
   the obligation with no shape qualifier. **Costs to weigh:** cheapest route,
   and the only one that leaves an author's array-literal or typed-`let` mistype
   permanently unreported on the invoke and `.theta`-callable surfaces while the
   `fn` surface reports it — it must say so in the corpus rather than by
   omission, including the cross-surface divergence, which no current sentence
   admits. Under GOV-15 it is a removal over an empty in-scope input set
   (`source-language-stability.md:25`), so no in-scope input observes a change.
   Cells a3 and a4 then become correctness pins rather than deferral pins, and
   the witness header's `:60–70` explanation is rewritten in the same commit.
   The row's sibling `theta/parse/tool-arg-type-mismatch` shares the mechanism
   (rows B-tarr / B-tlet), so a fix states whether its *Trigger* is narrowed too
   or why it is not.

**(c) Constraints any route preserves**, each with a witness row above:

- **Row A-ictl keeps firing, un-registering its caller.** The wired
  integer-literal path (`invoke-static-checks.ts:895`,
  `invoke-diagnostics.ts:427`) is bug 0137's shipped behaviour and its 40-cell
  witness plus one live H8a cell pin it.
- **The every-member-incompatible rule is untouched.** `:683–692`. A route may
  make more arguments *collectable*; none may make a collected set emit on
  anything short of every member answering `"incompatible"`.
- **No fabricated `CompatType`.** `decide`'s branch order
  (`src/parser/type-compat.ts`, recorded at `invoke-static-checks.ts:650–655`)
  makes a sentinel unresolvable `named` answer `"incompatible"` at an
  `array<…>` or inline-object param. Bug 0137's run rejected that route; it
  stays rejected.
- **`type-system.md:48`'s genuine cases stay deferred.** Row d1 of bug 0137's
  §Reproduction — an unresolvable callee registering with a
  `theta/load/callee-has-errors` warning — and the emitter's resolvability
  guard (`invoke-diagnostics.ts:215–217`) are unaffected by every route.
  `"unknown"` continues to defer.
- **One `StaticTypeInferencePass` and one `TypeEnv` per theta, never per call
  site.** `invoke-static-checks.ts:798–799`, bug 0072's constraint, restated at
  the loop's own comment (`:793–797`). A binding carriage added under route 1 or
  2 obeys the same rule.
- **The Pi-tool schema-conflict check's verdicts do not move silently.**
  `:1084–1096` reads the same collector. A route 1 fix states what happens
  there and measures it, rather than inheriting a change.
- **DIAG-4 is not engaged by any route.** The *Message* template
  (`code-registry-parse.md:114`) is unchanged in all three; routes 1 and 2
  change which inputs fill it, route 3 changes only the *Trigger*.

**(d) Ordering and coordination.**

- **Bug 0137 is fixed and is not a prerequisite**, but its witness is the
  coordination surface. `tests/invoke-arg-type-mismatch-wired.test.ts` is 40
  cells green at HEAD; cells a3 (`:815–837`) and a4 (`:839–853`) assert this
  report's silence, guarded by `assertRowSurfaceLive` (`:535`). Routes 1 and 2
  red them **by design**; the required response is to flip each to an expected
  emission carrying the registry-sourced message — for a3, `invoke argument 0
  ('x') type mismatch: expected string, got array<string>`, the string FLIP
  measured — not a weakening, and the file header's `:60–70` reason paragraph is
  rewritten in the same commit. Route 3 keeps them green and rewrites the same
  paragraph.
- **Bug [0142](./0142-division-result-type-not-number.md)** touches this
  collector at its arithmetic arm (§Fix (c); `:551–558` at this HEAD, cited
  there as `:530–537` pre-shift). That arm is disjoint from the four here
  and its change can only add emissions, so it does not flip a3/a4 — a fix
  there confirms that by running this witness rather than assuming it.
- **Bug [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md)**
  must be consulted before routes 1 and 2 land: its 0137 discharge note rests
  on the `named`-withholding property those routes remove.
- **Bug [0138](./0138-imported-thetalib-fn-arg-route-deferred.md)** shares a
  mechanism with route 2 of this report if its own route 2 (a compose-layer
  argument check) is taken — both then need one argument-side static read in the
  extension layer. Whichever lands second rebases against the first.
- **Bug [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)** bounds
  the GOV-15 sweep either way: the committed-fixture parse gate walks `.theta`
  only, so `.thetalib` files are swept explicitly by `git ls-files`.

**Witness — offline, provider-free.** Extend
`tests/invoke-arg-type-mismatch-wired.test.ts` at the same
`discoverAndComposeFixtures` boundary and on the same three channels, with every
expected message read from the registry through `registryMessage` per DIAG-4 and
every absence cell gated on `assertRowSurfaceLive`. Required rows under routes 1
and 2: A-iarr, A-ilet, A-iidx and A-ipar flipped to emissions with their
`<actual>` renderings pinned; the corresponding `.theta`-callable rows (B-tarr,
B-tlet) asserted in whichever direction the route lands them; one row per arm
that stays withheld, so a widening's boundary is measured and not assumed; and
the (C) rows kept as the cross-surface parity pins they are today (cells b1–b3).
Under route 3 the counterpart is an assertion that the registry *Trigger* text
no longer names the withheld shapes, sourced from the registry rather than
copied, plus a3/a4 re-commented as correctness pins. Whichever route lands, one
row is owed that no group above supplies: a positive cell per newly-covered arm,
so a later refactor silently re-withholding it reds. No live tier applies: every
observable settles inside one load pass, and bug 0137's existing H8a cell
already covers the surface end-to-end.

## Provenance

- **Origin:** the bug 0137 fix (0.78.0, HEAD `a314ac83`), residual 1 of
  `.pi/tmp/fixes/0137-report.md` — "Withheld true positives on the invoke arm" —
  which names the three arm groups, quotes each arm's own stated reason, cites
  witness cells a3 and a4 as the evidence, and states the flip condition: "any
  widening of `collectProvableArgTypes`' arms lands emissions here
  automatically, since this arm reads it unchanged — no edit at the invoke sink
  would be needed." The same record's "Where the bug document turned out to be
  wrong" section explains why a3/a4 defer: bug 0137 §Expected behaviour's
  "a1–a5 should report" contradicted §Fix's own binding soundness constraint,
  §Fix governed, and the two shapes were confirmed silent on the already-wired
  `.theta`-callable arm before being encoded. This report adds what those
  records do not state: the four shapes measured on the invoke surface, the same
  two measured on the `.theta`-callable surface, all four measured **refused**
  on the same-file `fn` surface with the exact messages, the mechanism behind
  that asymmetry (the extension layer builds no `bindings` map; the parser layer
  does and treats an annotated `let` as a proof), the direct measurement of the
  flip condition through `checkInvokeCall`, the tension with
  `type-system.md:48`, the two readings, and the three routes with their DIAG-2 /
  GOV-15 dispositions.
- **Evidence:** one scratch vitest file at `a314ac83`, run over
  `discoverAndComposeFixtures` with a planted temp `.pi/theta/` workspace — 8
  callees, 13 callers, one load — and over `checkInvokeCall` directly for the
  FLIP row, then deleted. All 13 rows and the FLIP row quoted verbatim above.
  Rows A-iarr and A-ilet additionally reproduce as committed cells a3 and a4 of
  `tests/invoke-arg-type-mismatch-wired.test.ts`, which passes 40/40 at HEAD;
  rows C-farr and C-fidx as cells `r4` and `u7p` of
  `tests/fn-arg-type-mismatch-wired.test.ts`. No file in `src/`, `tests/` or
  `docs/bugs/` other than this one was written.
- **Implementation evidence at `a314ac83`:**
  `src/extension/invoke-static-checks.ts` (`:78` the parser-layer imports,
  `:121` `collectCallSites`, `:472–504` the collector's doc comment, `:505`
  `collectProvableArgTypes`, `:518` and `:549` its two `pass.typeOf` calls,
  `:551–558` the arithmetic arm bug 0142 §Fix (c) names (cited there as
  `:530–537`, its pre-0137-fix position), **`:560–567` the
  `array` arm**, **`:568–580` the nominal group**, **`:581–589` the `index` /
  `par-for` arm**, `:601–615` `collectArmUnion`, `:626` `renderCollectedTypes`,
  `:650–655` the rejected-sentinel record, `:657–698` `buildInvokeArgSlot` with
  the withhold at `:680–682` and the every-member test at `:683–692`, `:716`
  `dedupeArgType`, `:371–397` `CalleeArityField` / `CalleeArity`, `:768`
  `checkInvokeStaticResolution`, `:798–799` the once-per-theta pass and
  `TypeEnv`, `:801` the invoke loop, `:855–905` the arity-and-type block with
  `:872` the empty callee-annotation env and `:895` the `checkInvokeCall` call,
  `:995–1001` the `.theta`-callable arm's identical withhold, `:1084–1096` the
  Pi-tool arm);
  `src/parser/invoke-diagnostics.ts` (`:169–183` `InvokeArgSlot`, `:211`
  `checkInvokeArgTypes`, `:215–217` the resolvability guard, `:225–227` the
  withheld-slot skip, `:229–231` the `"compatible"` / `"unknown"` deferral,
  `:232–243` the emission, `:411–428` `checkInvokeCall`);
  `src/parser/static-type-inference.ts:182–188` (`typeOf`'s defaulted
  `bindings` parameter and its doc comment);
  `src/parser/type-layer-checks.ts` (`:882` the module-private `TypeLayerWalk`,
  `:906` `unprovableBindings`, `:1019` and `:1043–1052` the annotated-`let`
  exclusion, `:1575` `checkFnCallArgs`, `:1608` its `provableArgType` call,
  `:1629–1653` the doc comment naming this collector, `:1654`
  `provableArgType`, `:1691–1704` the `array` arm, `:1769–1803` the `ident`
  arm, `:1804–1844` the withheld nominal arms, `:1855–1865` the `index` arm,
  `:1886` `isProvenReduction`, `:1992–1996` bug 0050's `invoke`-split comment);
  `src/extension/production-composition.ts` (`:1316` `resolveCalleeArity`,
  `:1346` its field map, `:2047` `hasLoadParseError`);
  `src/runtime/statement-executor.ts:395` and `:416` (the `fn` surface's
  unvalidated runtime bind, cited from bug 0138's measurement);
  `src/runtime/subagent-params.ts:214` and `:233` (the invoke surface's
  child-side validator, named and unmeasured).
- **Spec measured against:**
  [Code registry — parse](../spec_topics/diagnostics/code-registry-parse.md)
  (`:114` the row and its verbatim *Trigger*);
  [Diagnostics — shape](../spec_topics/diagnostics/diagnostic-shape.md) (`:72`
  DIAG-2, `:74` DIAG-4);
  [Type System](../spec_topics/type-system.md) (`:31` the closed
  structural-case list, `:48` *Unresolvable operands*, `:50` TYPE-9, `:52`
  TYPE-10);
  [Invocation](../spec_topics/invocation.md) (`:20` *Static resolution*, `:22`
  the unresolvable-callee arm, `:38` *Argument binding*, `:48` arity before
  type);
  [Tool Calls](../spec_topics/tool-calls.md) (`:14` *Argument shape*);
  [Source-language stability](../spec_topics/governance/source-language-stability.md)
  (`:5` GOV-15, `:9` the loads-cleanly predicate, `:25` the
  diagnostic-registry carve-out);
  [Diagnostics reference](../reference/diagnostics.md) (`:163`, the mirror with
  no *Trigger* column);
  [Discovery CLI reference](../reference/discovery-cli.md) (`:240–241`, the
  author-facing statement).
- **Tests:** `tests/invoke-arg-type-mismatch-wired.test.ts` (bug 0137's
  witness, 40 cells green at HEAD — `:60–70` the header's reason paragraph,
  `:363` and `:364–366` the a3/a4 fixtures, `:535` `assertRowSurfaceLive`,
  `:815–837` cell a3, `:839–853` cell a4, `:1049–1087` cells b1–b3, the
  cross-surface parity pins);
  `tests/fn-arg-type-mismatch-wired.test.ts` (bug 0050's witness — `:667` the
  `R4` fixture, `:949–968` cell `r4`; `:712–713` the `U7P_DIRECT` fixture,
  `:1427–1445` cell `u7p`; `:698–699` the `U2` laundered-`let` fixture and
  `:1290–1301` its withholding cell, the negative pole of the annotated-`let`
  proof);
  `tests/invoke-diagnostics.test.ts` (the emitter's unit cells, which clear the
  closing gate for shapes no input reaches);
  `tests/tool-arg-parse-checks.test.ts` (bug 0072's surface);
  `tools/closing-gate/index.js:705` (finding kind
  `registry-code-no-asserting-test`, which relates a code to an asserting test
  and not to a reachable emission per *Trigger* clause);
  `tools/code-registry/index.js` (`parseRegistry` / `registryMessage`, the
  DIAG-4 message source a witness uses).
