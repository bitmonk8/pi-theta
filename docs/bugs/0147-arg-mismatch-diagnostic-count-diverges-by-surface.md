# Bug 0147 — One call site passing two mistyped arguments draws a different number of argument-type-mismatch diagnostics on each of the three call spellings — two `theta/parse/invoke-arg-type-mismatch` through `invoke(...)` (per-slot loop, no `break`, `invoke-diagnostics.ts:219–244`), two `theta/parse/fn-arg-type-mismatch` through a same-file `fn` (per-slot loop, no `break`, `type-layer-checks.ts:1599–1626`), and one `theta/parse/tool-arg-type-mismatch` through a `.theta` callable (first-mismatch `break`, `invoke-static-checks.ts:1038`) — and no sentence in the corpus fixes an intra-site diagnostic count for any of the three rows

- **Status:** open. §Fix is constraint-pinned, not settled: three routes with
  the constraints each has to satisfy, no route selected. No ordering
  dependency in either direction — every surface named here is wired at HEAD
  and the divergence is stable under any of the three routes' code being
  written first.
- **Sev/Diff estimate:** S4/D3 — no written sentence is violated by any
  measured count, so no input is admitted that the corpus refuses and no
  rendered message is wrong about the slot it names: all nineteen mistyped
  callers measured below deny registration on every surface, because
  `hasLoadParseError` (`production-composition.ts:2047`) needs one `E` and each
  row is `E`. The residue is unadjudicated multiplicity semantics plus an
  implementation that visibly disagrees with itself across three sibling
  surfaces of one family. D3 because the disposition is unsettled in-run and
  the two harmonising routes touch three emitters in three files
  (`invoke-diagnostics.ts`, `type-compat.ts` via `type-layer-checks.ts`,
  `invoke-static-checks.ts`), and because the per-slot-everywhere route needs a
  DIAG-4 *Message* reword that DIAG-4 defers to theta 2.0: the
  `theta/parse/tool-arg-type-mismatch` *Message* carries neither `<i>` nor
  `<param>` and its range is the whole call site, so two per-slot emissions at
  one site render byte-identically (measured — §Reproduction (b) cells
  `t2first` / `t2int`).
- **Kind:** spec gap, disposition open. Two elements, neither an emission
  outside a registry row:
  1. **The corpus does not adjudicate intra-site multiplicity for this
     family.** The three rows' *Trigger*s are singular conditions over one
     argument with no count:
     `docs/spec_topics/diagnostics/code-registry-parse.md:114` ("`invoke(...)`
     argument does not type-check against the callee's declared `params` schema
     (when the callee is statically resolvable)"), `:115` ("`<name>(args)`
     `.theta`-callable-call argument does not match the callee theta's `params`
     (when statically resolvable)"), `:116` ("… passes an argument whose static
     type is not compatible with the matched parameter's declared type"). The
     two `diagnostic-shape.md` paragraphs that speak about diagnostic counts
     are both about a different granularity: `:65` (*Multi-error reporting*)
     binds the **pass** — "Every parse / type pass collects all errors from the
     full file … rather than fast-failing on the first error" — and `:24`
     (*Re-scan deduplication*) forbids the renderer suppressing the **same**
     diagnostic recurring across watcher-triggered reloads. Measured
     (§Reproduction (d)): neither surface fast-fails the pass, so `:65`'s
     letter holds on both and decides nothing intra-site.
  2. **The implementation answers the unadjudicated question three ways at one
     seam.** The three checks read the same kind of input (a positional
     argument against a declared param type), run in the same load pass, and
     produce `E`-severity rows from the same family, yet two loop per slot and
     one stops at its first mismatch. The divergence is recorded in the tree at
     the site the bug 0137 fix added (`invoke-static-checks.ts:889–893`, quoted
     in §Affected) and was carried out of that run as residual 2 with the
     judgement "no spec sentence fixes a per-site count, so this is recorded as
     a divergence, not a defect". That judgement is what makes the report's
     subject the silence: nothing decides which behaviour is the contract, so
     nothing marks either as wrong.
- **Related:**
  - [0137](./0137-invoke-arg-type-mismatch-unreachable.md) — **fixed
    (0.78.0)**, the origin. It wired `theta/parse/invoke-arg-type-mismatch`'s
    caller at the invoke-literal arm through `checkInvokeCall`, which made the
    per-slot half of this divergence observable for the first time (before it,
    the invoke row fired for no input at all), and its fix record's residual 2
    files this report. Its §Fix chose the emitter deliberately —
    `checkInvokeArgTypes`, the registered row's own emitter, unchanged — so the
    count is that emitter's pre-existing shape rather than a decision that run
    took. Its measurement of the `fn` surface's count is the gap this report
    closes: the 0137 run stated the invoke and `.theta`-callable counts and did
    not establish the `fn` one.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, and the owner of the first-mismatch `break`
    (`invoke-static-checks.ts:1036–1038`). It wired the per-argument type check
    for the `.theta`-callable surface through `checkToolCallArguments`, which
    returns at most one diagnostic per call by construction: its four arms
    (`src/runtime/tool-call.ts:198–208`, `:224–239`, `:247–263`, `:275–290`)
    each return a single-element array. Its `break`'s own comment gives its
    reason as mirroring
    the Pi-tool schema-conflict arm's "first provably-disjoint field fires".
    That Pi-tool arm is first-only twice over: `resolveSchemaConflict`
    (`tool-call.ts:305–321`) returns "the first field it proves disjoint"
    (`:300`) and the emitter returns one diagnostic.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the owner of the `fn` surface. Its emission arm is
    `checkFnCallArgs` (`src/parser/type-layer-checks.ts:1575`), whose per-slot
    loop pushes for every mismatching slot with no `break` — measured here at
    two and three mistyped slots (§Reproduction (c)). It is the surface whose
    behaviour the 0137 run left unmeasured, and it settles the arithmetic of
    the divergence: two of the three surfaces are per-slot, and the
    `.theta`-callable surface is the outlier.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    and the nearest neighbour in subject. Its §Kind item 2 states the same
    silence from the other direction — how many codes one written mistake may
    draw — with the same two `diagnostic-shape.md` paragraphs (`:65`, `:24`)
    and the same observation that the corpus decides cascade questions per row
    and never in general. **It is a different question**: 0129 asks whether a
    *second, differently-coded* rule may fire for a field an earlier code
    already refused; this report asks how many times *one* code fires for one
    site. Any route here that writes a general intra-site multiplicity rule
    into `diagnostic-shape.md` reaches 0129's subject, which §Fix records as a
    coordination constraint.
  - [0093](./0093-let-annotation-query-position-double-emission.md) — **open**,
    the corpus's established duplicate-diagnostic report, and a **different
    mechanism**. There one occurrence draws the same code twice because
    `parseLet` copies the annotation text onto the query node and two walk arms
    re-check it, so the duplication is a property of the check-site topology.
    Here each emission names a distinct argument slot and no slot is judged
    twice. The two reports share only the fact that no general count rule
    exists, which 0093 also records against `diagnostic-shape.md:65`.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, and its
    surface **does** interact, measured (§Reproduction (e)). `invocation.md:48`
    puts arity before per-argument type, and both invoke surfaces implement it
    (`invoke-static-checks.ts:949–954`; `checkInvokeCall`'s
    `arityDiags.length > 0` early return, `invoke-diagnostics.ts:423–425`), so
    a wrong-arity site reports arity alone and no type row. The in-document
    `fn` call has no arity check at all, so `g(1, true, 2)` at a two-param `fn`
    draws two `theta/parse/fn-arg-type-mismatch` rows over the matched prefix
    (`matchedCount = Math.min(…)`, `type-layer-checks.ts:1598`) and no arity
    row. Whichever route this report takes, the `fn` surface's count at a
    wrong-arity site is decided by 0131's disposition and not by this one.
  - [0146](./0146-invoke-arg-provable-set-withholds-true-positives.md) —
    **open**, the sibling residual of the same bug 0137 fix (its residual 1),
    and the report that owns **which** slots are judged: `collectProvableArgTypes`
    (`invoke-static-checks.ts:505`) withholds the `array`, `ident`, `index` and
    `par-for` shapes, so a provably mistyped argument of those shapes defers.
    Disjoint subject, one interaction: widening that collector raises the number
    of judged slots at a site, so it raises the per-slot counts measured here on
    the invoke arm without changing which route this report takes. Neither
    report gates the other.
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md) —
    **fixed (0.24.0)**, the owner of the channel arithmetic that makes the
    count author-visible. Error-severity load diagnostics route **one
    `theta-system-note` per diagnostic** through the pre-eval router
    (`production-composition.ts:1115–1132`), while a group's warnings batch
    into one note; `makeLoadEmit` (`:191–212`) likewise fires one
    `ctx.ui.notify` per error and one stderr line per diagnostic. The routing
    itself is that report's settled disposition and is not reopened here.
- **Affected** (every citation verified at HEAD `a314ac83`, 0.78.0; symbols
  cited with their current lines):
  - **The per-slot surface, invoke-literal.**
    `src/parser/invoke-diagnostics.ts:211` (`checkInvokeArgTypes`) — the loop
    opens at `:219` and closes at `:244` with no `break`: a withheld slot
    `continue`s (`:225–227`), a `"compatible"` or `"unknown"` verdict
    `continue`s (`:228–231`), and a mismatch pushes (`:232–243`) before the
    loop advances. The code constant is `:59`, the *Message* helper
    `invokeArgTypeMismatchMessage` is `:89`. Its caller `checkInvokeCall`
    (`:411`) runs arity first (`:415–422`), returns arity diagnostics alone
    (`:423–425`), then returns the whole per-slot list (`:427`).
  - **The per-slot surface, same-file `fn`.**
    `src/parser/type-layer-checks.ts:1575` (`checkFnCallArgs`) — the per-slot
    loop is `:1599–1626`, bounded by `matchedCount` (`:1598`), with an
    unannotated-param `continue` (`:1602–1606`), an unprovable-argument
    `continue` (`:1609–1613`), and a push through `checkFnArgCompat`
    (`:1615–1625`). No `break`. `checkFnArgCompat`
    (`src/parser/type-compat.ts:452`) returns one diagnostic per call
    (`:468–479`), so the count is the loop's. The one caller is `walkExpr`'s
    `call` arm (`:1987`).
  - **The first-mismatch surface, `.theta`-callable.**
    `src/extension/invoke-static-checks.ts:986` — the per-slot loop over
    `site.call.args.entries()`, with the same two withhold `continue`s
    (`:988–990`, `:992–994`, `:996–1001`), the every-arm-incompatible gate
    (`:1002–1014`), the push through `checkToolCallArguments` (`:1015–1035`),
    and the **`break` at `:1038`** under its own comment: "First mismatch only
    — mirrors the schema-conflict arm's 'first provably-disjoint field fires'
    below" (`:1036–1037`). The loop is entered only after arity passes
    (`:948–954`).
  - **The comment recording the divergence** — present and accurate,
    `src/extension/invoke-static-checks.ts:889–893`, at the call site bug 0137
    added:

    > `checkInvokeArgTypes` (run by `checkInvokeCall` once arity passes)
    > emits one diagnostic per mismatched slot, with no `break` — unlike
    > the `.theta`-callable arm below, which stops at its first mismatch
    > because it reuses `checkToolCallArguments` per call. This row's own
    > registered emitter, unchanged by this wiring.

    Two of its three claims are confirmed by measurement below (per-slot on the
    invoke arm; first-mismatch on the `.theta`-callable arm). The third — the
    *reason*, "because it reuses `checkToolCallArguments` per call" — is
    imprecise: the emitter is called once **per slot** (`:1015`, inside the
    per-slot loop) and returns one diagnostic per call, so the count-limiting
    mechanism is the `break` at `:1038`, not the emitter's shape. Removing the
    `break` would yield one diagnostic per mismatched slot from the same
    emitter. The comment names no third surface, so it does not record that the
    `fn` surface sides with the invoke arm.
  - **The shared emitter on the `.theta`-callable path.**
    `src/runtime/tool-call.ts:188` (`checkToolCallArguments`) — four arms, each
    a single `return [...]`: arity (`:198–208`), argument shape (`:224–239`),
    the `.theta`-callable type mismatch (`:247–263`), and the Pi-tool
    provable-disjointness front-run (`:275–290`). `resolveSchemaConflict`
    (`:305–321`) reduces the per-field statics to **the first** provably
    disjoint field (`:315–320`), documented at `:300–303`. So the Pi-tool
    schema-conflict row is a fourth family member and first-only; it is
    established here by source read, not measured (§Non-goals).
  - **The registered rows and their *Message*s.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:114` — `invoke
    argument <i> ('<param>') type mismatch: expected <expected>, got
    <actual>`; `:115` — `tool '<name>' argument type mismatch: expected
    <expected>, got <actual>`; `:116` — `fn '<name>' argument <i> ('<param>')
    type mismatch: expected <expected>, got <actual>`. Mirrors without a
    *Trigger* column, byte-identical *Message*s:
    `docs/reference/diagnostics.md:163`, `:164`, `:165`. **Only the
    `.theta`-callable row carries no argument index and no param name**, which
    is what makes two per-slot emissions at one site indistinguishable there.
  - **The ranges the three surfaces attach.** The invoke arm's site is the
    whole `invoke(...)` expression (`invoke-static-checks.ts:807`, `range:
    invoke.range`), so every per-slot diagnostic at one site renders at one
    `<file>:<line>:<col>` — measured identical in §Reproduction (a). The
    `.theta`-callable arm's is the whole call (`:1027`, `range:
    site.call.range`). The `fn` arm's is the **argument expression**
    (`type-layer-checks.ts:1623`, `range: arg.range`), so its per-slot
    diagnostics render at distinct columns — measured in §Reproduction (c).
  - **The registration consequence is count-independent.**
    `src/extension/production-composition.ts:2047` (`hasLoadParseError`) drops
    any theta carrying an error-severity `theta/load/*` or `theta/parse/*`
    diagnostic. All three rows are `E`, so one is as decisive as three:
    measured, every mistyped caller in every group below reports
    `registered :: NO`.
  - **The author-visible channels, one call per error diagnostic.**
    `src/extension/production-composition.ts:191–212` (`makeLoadEmit`) — one
    `ctx.ui.notify(message, "error")` per error-severity diagnostic (`:193–195`)
    and, on a host with `hasUI` false, one `theta: <rendered line>` stderr
    write per diagnostic (`:208–210`). `:1115–1132` (`emitLoadNoteGroup`) — on
    the shipped `theta-system-note` channel, each error-severity diagnostic
    routes as its own note through `routePreEvalFailure`, warnings alone
    batching. So an intra-site count of two is two notifications, two stderr
    lines and two transcript notes.
  - **The corpus sentences that bear on the count, and what each settles.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:65` (*Multi-error
    reporting*) — pass-level, quoted in §Expected behaviour; `:24` (*Re-scan
    deduplication*) — reload-level; `:71` (DIAG-1), `:72` (DIAG-2), `:74`
    (DIAG-4), `:80` (the column legend, which defines *Trigger* as "the
    canonical condition" and fixes no cardinality on it).
    `docs/spec_topics/invocation.md:38` (*Argument binding* — "each argument
    type-checked against the param's declared schema"), `:48` (*Argument
    arity* — arity before per-argument type), `:20` (*Static resolution*).
    `docs/spec_topics/tool-calls.md:14` (*Argument shape* — `.theta` callables
    take their callee `params:` "positionally in declaration order — the same
    argument-binding rules `invoke(...)` uses", and a mismatching argument
    "surfaces as `theta/parse/tool-arg-type-mismatch` when the callee is
    statically resolvable"), `:16` (the Pi-tool provable-disjointness rule).
    `docs/spec_topics/type-system.md:50` (TYPE-9, which names the `fn` site's
    row), `:52` (TYPE-10). `docs/reference/discovery-cli.md:240–241` ("each
    type-checked against the param's schema"), `:242–244` (the arity codes).
    None of these fixes how many diagnostics one site draws.
  - **Where the corpus does fix a count — per row, never in general.**
    `docs/spec_topics/diagnostics/code-registry-load.md:9` — a per-theta
    `pi.registerCommand` failure "emits one diagnostic per failing theta";
    `:53` — for one sub-case of `theta/load/settings-value-out-of-range`, "no
    per-key cascade fires (a non-object root has no keys to inspect)".
    `docs/spec_topics/diagnostics/code-registry-host.md:12` — the handler
    "emits this diagnostic exactly once per `session_shutdown` event"; `:14` —
    the teardown row enumerates its call sites with "one potential emission
    each". The vocabulary for pinning multiplicity exists and is used; it is
    absent from all three rows here.
  - **Test coverage of the count: none, on any surface.** No committed test
    passes more than one mistyped argument at a single call site — searched
    across `tests/` for a call whose first two arguments are both mistyped
    literals, and separately by reading the three witnesses.
    `tests/invoke-arg-type-mismatch-wired.test.ts` (bug 0137's 40-cell witness)
    has one two-param cell, a7 (`invoke("./ctwo.theta", "a", 1)`), whose slot 0
    is well-typed. `tests/tool-arg-parse-checks.test.ts` (bug 0072's) asserts
    no `break`-dependent cell. `tests/fn-arg-type-mismatch-wired.test.ts` (bug
    0050's) asserts no multi-slot cell.
    `tests/invoke-diagnostics.test.ts:76–102` drives `checkInvokeArgTypes` with
    a single hand-built slot. **Consequence for §Fix:** no route moves an
    already-asserted byte, and no gate in the tree reds on the divergence.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15, whose
    observable (b) is "ordered diagnostic-code sequences"), `:9` (the
    loads-cleanly predicate, which admits an input only when its load emits no
    `E`), `:25` (the diagnostic-registry carve-out). Every input whose count
    any route would change emits `E` today on at least one surface, so it is
    outside GOV-15's input set — §Fix states this per route rather than
    assuming it.
- **Observed at:** `0.78.0` (HEAD `a314ac83`). Offline, deterministic; no live
  model, no provider. Every row below is one planted `.theta` in a temp
  `.pi/theta/` discovery workspace loaded once through the shipped composition
  root `discoverAndComposeFixtures`
  (`src/extension/production-composition.ts`), with the fake `pi` / `ctx` shape
  `tests/invoke-arg-type-mismatch-wired.test.ts:441–457` establishes and
  `hasUI` absent so the stderr mirror is live. Three observables: which slash
  names the root returned, which error-severity messages reached
  `ctx.ui.notify`, and the per-diagnostic stderr lines (the only channel
  carrying the emitting file, which is what attributes a count to one caller —
  the `.theta`-callable and invoke *Message*s name no caller). Two scratch
  vitest files, run on the outputs quoted below, then deleted; `git status
  --short` and a case-insensitive scratch sweep over `tests/` are both empty.
  `src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
  unmodified by this filing.

## Summary

Three call spellings reach one obligation — a positional argument judged
against a callee's declared param type — and the corpus registers a separate
`E`-severity row for each: `theta/parse/invoke-arg-type-mismatch` for the
`invoke(...)` literal, `theta/parse/tool-arg-type-mismatch` for a `.theta`
callable, `theta/parse/fn-arg-type-mismatch` for a same-file `fn`. When a
single site mistypes **two** arguments, the three surfaces report different
numbers of diagnostics: two, one, and two respectively. At three mistyped
arguments they report three, one, and three.

The mechanisms are three loops. `checkInvokeArgTypes`
(`invoke-diagnostics.ts:219–244`) iterates every param slot and pushes per
mismatch. `checkFnCallArgs` (`type-layer-checks.ts:1599–1626`) does the same
over the matched prefix. The `.theta`-callable loop
(`invoke-static-checks.ts:986–1039`) pushes and then `break`s at `:1038`, so
slot 1 is never judged. The `break`'s comment gives its reason as mirroring the
Pi-tool schema-conflict arm, which is first-only twice over
(`tool-call.ts:300`, `:315–320`).

No sentence in the corpus decides which behaviour is the contract. The three
*Trigger*s are singular conditions over one argument
(`code-registry-parse.md:114`, `:115`, `:116`) with no cardinality; the column
legend defines *Trigger* as "the canonical condition" and fixes no count
(`diagnostic-shape.md:80`). The two paragraphs in `diagnostic-shape.md` that
speak about counts bind other granularities — the pass (`:65`) and the reload
(`:24`) — and measurement confirms both surfaces satisfy `:65`'s letter: the
`break` is intra-site, and a second call site in the same file still reports
(§Reproduction (d)). The corpus does pin multiplicity where it chose to, per
row and in prose — "one diagnostic per failing theta"
(`code-registry-load.md:9`), "no per-key cascade fires" (`:53`), "exactly once
per `session_shutdown` event" (`code-registry-host.md:12`) — and none of the
three rows here carries such a clause.

Nothing else about the outcome diverges. Each row is `E`, `hasLoadParseError`
(`production-composition.ts:2047`) needs one to deny registration, and all
nineteen mistyped callers measured below are un-registered. The divergence is
therefore confined to how many messages the author sees: one
`ctx.ui.notify` call, one stderr line and one `theta-system-note` per
error-severity diagnostic (`production-composition.ts:191–212`, `:1115–1132`).

The invoke row and the `fn` row can carry per-slot detail because their
*Message*s render `<i>` and `<param>`. The `.theta`-callable row's *Message*
carries neither, and its range is the whole call site, so two per-slot
emissions there would be byte-identical lines — measured indirectly by two
cells at different slots whose renderings differ only in the callable name
(§Reproduction (b), `t2first` and `t2int`). That
makes "per-slot everywhere" require a DIAG-4 *Message* reword, which DIAG-4
defers to theta 2.0, and it is the reason §Fix leaves the disposition open.

## Reproduction

Offline, deterministic, at `a314ac83`. Each cell is one planted `.theta` in a
temp `.pi/theta/` workspace; every callee declares two or three `string`
`params:` fields. `registered` is membership in the returned fixture list.
Diagnostic lines are the verbatim stderr mirror, `theta: <file>:<line>:<col>:
<code>: <message>`, with the temp workspace prefix elided as `<ws>`; nothing
else is edited. Callee stems are distinct per caller because neither the
`.theta`-callable *Message* nor the `invoke` *Message* names a caller.

### (a) The invoke-literal surface — one diagnostic per mistyped slot

```
@@ i2both  invoke("./cinv2a.theta", 1, true)      [two mistyped slots]
   registered :: NO
   <ws>/.pi/theta/i2both.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/i2both.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 1 ('y') type mismatch: expected string, got boolean

@@ i3all  invoke("./cinv3a.theta", 1, true, 2)    [three mistyped slots]
   registered :: NO
   <ws>/.pi/theta/i3all.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/i3all.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 1 ('y') type mismatch: expected string, got boolean
   <ws>/.pi/theta/i3all.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 2 ('z') type mismatch: expected string, got integer

@@ i2first  [control] invoke("./cinv2b.theta", 1, "a")   [slot 0 only]
   registered :: NO
   <ws>/.pi/theta/i2first.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer

@@ i2second [control] invoke("./cinv2c.theta", "a", true) [slot 1 only]
   registered :: NO
   <ws>/.pi/theta/i2second.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 1 ('y') type mismatch: expected string, got boolean
```

The two controls establish that the check is live at both slots independently,
so `i2both`'s count of two measures the loop and not a doubled emission: the
two lines name different slots, different param names and different actual
types. All four lines at one site render the same `4:1` — the range is the
whole `invoke(...)` expression (`invoke-static-checks.ts:807`), so `<i>` and
`<param>` are the only fields distinguishing them.

### (b) The `.theta`-callable surface — one diagnostic per site

```
@@ t2both  tools: - ./ctool2a.theta / ctool2a(1, true)   [two mistyped slots]
   registered :: NO
   <ws>/.pi/theta/t2both.theta:6:1: theta/parse/tool-arg-type-mismatch: tool 'ctool2a' argument type mismatch: expected string, got integer

@@ t3all  tools: - ./ctool3a.theta / ctool3a(1, true, 2) [three mistyped slots]
   registered :: NO
   <ws>/.pi/theta/t3all.theta:6:1: theta/parse/tool-arg-type-mismatch: tool 'ctool3a' argument type mismatch: expected string, got integer

@@ t2first  [control] ctool2b(1, "a")             [slot 0 only]
   registered :: NO
   <ws>/.pi/theta/t2first.theta:6:1: theta/parse/tool-arg-type-mismatch: tool 'ctool2b' argument type mismatch: expected string, got integer

@@ t2second [control] ctool2c("a", true)          [slot 1 only]
   registered :: NO
   <ws>/.pi/theta/t2second.theta:6:1: theta/parse/tool-arg-type-mismatch: tool 'ctool2c' argument type mismatch: expected string, got boolean

@@ t2int    [control] ctool2d("a", 1)             [slot 1 only, integer]
   registered :: NO
   <ws>/.pi/theta/t2int.theta:6:1: theta/parse/tool-arg-type-mismatch: tool 'ctool2d' argument type mismatch: expected string, got integer
```

`t2second` is the control that identifies the mechanism as *first mismatch*
rather than *slot 0 only*: with slot 0 well-typed, the loop reaches slot 1 and
fires. `t2both` and `t3all` then show that a second and third mismatching slot
add nothing — one line for two mistakes, one line for three.

`t2first` and `t2int` are the same mistyped type at two different slots and
render identically apart from the callable name (`tool 'ctool2b' …` versus
`tool 'ctool2d' …`, both `expected string, got integer`). Within one call the
name is fixed, so per-slot emission at a site like `ctool3a(1, true, 2)` would
produce two byte-identical lines for slots 0 and 2. This is the DIAG-4
constraint §Fix carries.

### (c) The same-file `fn` surface — one diagnostic per mistyped slot

```
@@ f2both  fn g(x: string, y: string) / g(1, true)       [two mistyped slots]
   registered :: NO
   <ws>/.pi/theta/f2both.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/f2both.theta:5:14: theta/parse/fn-arg-type-mismatch: fn 'g' argument 1 ('y') type mismatch: expected string, got boolean

@@ f3all  fn g(x: string, y: string, z: string) / g(1, true, 2)
   registered :: NO
   <ws>/.pi/theta/f3all.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/f3all.theta:5:14: theta/parse/fn-arg-type-mismatch: fn 'g' argument 1 ('y') type mismatch: expected string, got boolean
   <ws>/.pi/theta/f3all.theta:5:20: theta/parse/fn-arg-type-mismatch: fn 'g' argument 2 ('z') type mismatch: expected string, got integer

@@ f2first  [control] g(1, "a")                    [slot 0 only]
   registered :: NO
   <ws>/.pi/theta/f2first.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('x') type mismatch: expected string, got integer

@@ f2second [control] g("a", true)                 [slot 1 only]
   registered :: NO
   <ws>/.pi/theta/f2second.theta:5:16: theta/parse/fn-arg-type-mismatch: fn 'g' argument 1 ('y') type mismatch: expected string, got boolean
```

This is the measurement the bug 0137 run did not make. The `fn` surface is
per-slot, so the divergence is two-against-one and the `.theta`-callable
surface is the outlier. The per-slot lines here carry **distinct columns**
(`:11`, `:14`, `:20`) because this arm ranges at the argument expression
(`type-layer-checks.ts:1623`), unlike the invoke arm's shared site range.

### (d) The `break` is intra-site — `diagnostic-shape.md:65` holds on both surfaces

```
@@ twosites  two `.theta`-callable sites, two mistyped slots each
   registered :: NO
   <ws>/.pi/theta/twosites.theta:7:1: theta/parse/tool-arg-type-mismatch: tool 'csa' argument type mismatch: expected string, got integer
   <ws>/.pi/theta/twosites.theta:8:1: theta/parse/tool-arg-type-mismatch: tool 'csb' argument type mismatch: expected string, got integer

@@ twoinv    two `invoke(...)` sites, two mistyped slots each
   registered :: NO
   <ws>/.pi/theta/twoinv.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/twoinv.theta:4:1: theta/parse/invoke-arg-type-mismatch: invoke argument 1 ('y') type mismatch: expected string, got boolean
   <ws>/.pi/theta/twoinv.theta:5:1: theta/parse/invoke-arg-type-mismatch: invoke argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/twoinv.theta:5:1: theta/parse/invoke-arg-type-mismatch: invoke argument 1 ('y') type mismatch: expected string, got boolean
```

`twosites` reports both sites, so the `break` exits the slot loop and not the
site loop: 2 sites × 2 mistypes yields 2 lines there and 4 on the invoke arm.
Neither surface fast-fails the pass, which is what `diagnostic-shape.md:65`
forbids. The paragraph is satisfied by both and decides neither.

### (e) The arity interaction, and where bug 0131's surface diverges

```
@@ i2many  invoke("./cinv2d.theta", 1, true, 2)   [two params, three args, both mistyped]
   registered :: NO
   <ws>/.pi/theta/i2many.theta:4:1: theta/parse/invoke-arity-too-many: invoke './cinv2d.theta' passes too many arguments: expected at most 2, got 3

@@ t2many  ctool2e(1, true, 2)                    [same shape, callable surface]
   registered :: NO
   <ws>/.pi/theta/t2many.theta:6:1: theta/parse/invoke-arity-too-many: invoke 'ctool2e' passes too many arguments: expected at most 2, got 3

@@ f2many  fn g(x: string, y: string) / g(1, true, 2)
   registered :: NO
   <ws>/.pi/theta/f2many.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('x') type mismatch: expected string, got integer
   <ws>/.pi/theta/f2many.theta:5:14: theta/parse/fn-arg-type-mismatch: fn 'g' argument 1 ('y') type mismatch: expected string, got boolean

@@ f2few   fn g(x: string, y: string) / g(1)
   registered :: NO
   <ws>/.pi/theta/f2few.theta:5:11: theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('x') type mismatch: expected string, got integer
```

Both invoke surfaces report arity alone and zero type rows, which is
`invocation.md:48`. The `fn` surface reports per-slot type rows and **no arity
row at either wrong arity** — bug 0131's subject, measured here because it
changes the count at a wrong-arity `fn` site and is therefore a constraint on
any route below.

## Expected behaviour

**The corpus states the obligation per argument and stops there.**
`invocation.md:38` is the governing sentence for the invoke surface:
"Arguments bind positionally to the callee's `params:` in declaration order,
with each argument type-checked against the param's declared schema. Type
mismatches surface as `theta/parse/invoke-arg-type-mismatch` when the callee is
statically resolvable". `docs/reference/discovery-cli.md:240–241` states the
same to authors: "Positional, in `params:` declaration order, each type-checked
against the param's schema". Both distribute the *check* over arguments.
Neither says what the site *reports* when more than one argument fails, and no
registry *Trigger* supplies a cardinality: the column legend
(`diagnostic-shape.md:80`) defines *Trigger* as "the canonical condition", and
`:114`, `:115` and `:116` each phrase that condition over a single argument.

**One reading makes the `.theta`-callable `break` a candidate violation; it is
not decisive.** `tool-calls.md:14` routes the callable surface to the invoke
surface's rules — `.theta` callables "take their callee `params:` as
already-typed values, positionally in declaration order — the same
argument-binding rules `invoke(...)` uses". Read strictly, "each argument
type-checked" plus "the same argument-binding rules" would require slot 1 to be
type-checked at a site whose slot 0 already failed, which the `break` prevents.
Three things stop that reading from settling the question. The cross-reference
names *argument-binding* rules and its own gloss is positional-and-in-order,
not diagnostic multiplicity; `tool-calls.md:14` then states the callable
surface's diagnostic disposition separately and with no count ("an argument
that does not type-check against the callee's `params:` surfaces as
`theta/parse/tool-arg-type-mismatch` when the callee is statically
resolvable"); and `invocation.md:48` already suspends per-argument checking
wholesale on an arity failure — "Arity is checked **before** per-argument type
checking" — without being written as an exception to `:38`, so `:38`'s
distribution is already read as defeasible in the corpus's own hands. Measured
(§Reproduction (e)), that suspension is what both invoke surfaces implement.

**`diagnostic-shape.md:65` is about the pass, and both surfaces satisfy it.**
Verbatim: "Every parse / type pass collects all errors from the full file (and
from transitive `.thetalib` imports) before failing. The theta is rejected with
the complete list in **one `pi.sendMessage` call per `.theta` file** … rather
than fast-failing on the first error or fanning out one message per error.
Authors get every problem in the file at once, in a single transcript entry."
The prohibition is on fast-failing the pass, and §Reproduction (d) shows
neither surface does: a second call site in the same file still reports. The
paragraph's *purpose* clause — every problem at once — is what the
`.theta`-callable `break` defeats intra-site, and "all errors" is the term that
would have to be adjudicated to turn purpose into obligation: whether an error
is a condition that satisfies a *Trigger*, or a diagnostic some check chose to
construct. Under the second reading the `break` produces no error to collect.
The corpus does not choose.

**Where the corpus wanted a count, it wrote one.** `code-registry-load.md:9`:
a per-theta `pi.registerCommand` failure "emits one diagnostic per failing
theta". `:53`: for a non-object settings root, "no per-key cascade fires".
`code-registry-host.md:12`: the handler "emits this diagnostic exactly once per
`session_shutdown` event". `:14`: the teardown row enumerates its call sites at
"one potential emission each". Three `theta/parse/*-arg-type-mismatch` rows
carry no such clause, and the two invoke surfaces plus the `fn` surface
therefore each satisfy their row as written at any count.

**What a decided corpus would fix.** For a site with N provably mistyped slots
at a statically resolvable callee: whether the count is N (each slot named
through `<i>`/`<param>` where the *Message* carries them) or 1 (the first, with
the remainder deferred to the next load), and whether the answer is uniform
across the three rows or stated per row. Until one of those is written, no
measured count above is wrong and no two of them can both be right as a
family contract.

## Actual behaviour / root cause

**Three loops, two shapes.** The invoke arm and the `fn` arm iterate every
judgeable slot and push per mismatch; the `.theta`-callable arm pushes once and
leaves.

```ts
// src/parser/invoke-diagnostics.ts:219 — invoke-literal, per-slot
  for (let i = 0; i < args.length; i++) {
    …
    const r = checkCompatible(argType, paramType, env);
    if (r === "compatible" || r === "unknown") {
      continue;
    }
    diags.push({ …, message: invokeArgTypeMismatchMessage(i, slot.paramName, …) });
  }                                                   // :244 — no break
```

```ts
// src/parser/type-layer-checks.ts:1599 — same-file `fn`, per-slot
    for (let i = 0; i < matchedCount; i += 1) {
      …
      this.diagnostics.push(
        ...checkFnArgCompat({ fnName: fn.name, index: i, paramName: p.name, … }),
      );
    }                                                 // :1626 — no break
```

```ts
// src/extension/invoke-static-checks.ts:986 — `.theta`-callable, first only
      for (const [i, argExpr] of site.call.args.entries()) {
        …
        diagnostics.push(...checkToolCallArguments({ toolName: site.name, … }));
        // First mismatch only — mirrors the schema-conflict arm's "first
        // provably-disjoint field fires" below.
        break;                                        // :1038
      }
```

**The count-limiting mechanism is the `break`, not the emitter.**
`checkToolCallArguments` is called from inside the per-slot loop (`:1015`) and
each call returns exactly one diagnostic (`tool-call.ts:254–262`), so without
the `break` it would run once per mismatching slot. Removing `:1038` therefore
yields one diagnostic per mismatched slot from the same emitter. The 0137 call-site comment
(`invoke-static-checks.ts:889–893`) attributes the difference to reuse of
`checkToolCallArguments` "per call"; that is the shape of the emitter, not the
reason for the count.

**The `break`'s stated model is genuinely first-only.** The Pi-tool
schema-conflict arm it mirrors reduces its per-field statics to the first
provably disjoint field before emitting (`tool-call.ts:305–321`, documented at
`:300–303`), and the emitter's single `return` makes a second field
unreportable at that site by construction. So the family contains two
first-only members (`tool-arg-type-mismatch`, `tool-arg-schema-conflict`, both
routed through `checkToolCallArguments`) and two per-slot members
(`invoke-arg-type-mismatch`, `fn-arg-type-mismatch`, each looping in its own
module).

**The divergence became observable in 0.78.0 and predates it as code.** The
`break` is bug 0072's (0.65.0) and the `fn` loop is bug 0050's (0.77.0), but
`checkInvokeArgTypes` had no production caller until bug 0137's fix wired it
(`invoke-static-checks.ts:894–903`), so before `a314ac83` the invoke arm's
per-slot loop ran for no input. That fix chose the registered row's own emitter
unchanged, which is why the count is inherited rather than decided.

**No gate reds on it.** No committed test passes two mistyped arguments at one
call site on any of the three surfaces (§Affected), so the divergence is
unwitnessed in both directions: nothing pins the per-slot counts and nothing
pins the `break`.

## Why it matters

- **The family's author-facing behaviour depends on which spelling the author
  chose, in the direction the corpus does not adjudicate.** Bug 0137 removed
  the enforcement divergence across the three spellings; the count divergence
  it left is the same axis one step down. An author who refactors a `tools:`
  entry into a literal `invoke` sees the number of reported mistakes change at
  a site whose text is otherwise equivalent.
- **On the `.theta`-callable surface a multi-mistake site needs one load per
  mistake.** Measured: `ctool3a(1, true, 2)` reports one of three. Each
  fix-then-reload cycle surfaces the next.
  `diagnostic-shape.md:65`'s stated purpose is
  the opposite — "Authors get every problem in the file at once" — and it is
  satisfied only across sites, not within one.
- **The count is one-to-one visible on all three production channels.** One
  `ctx.ui.notify` per error diagnostic, one stderr line per diagnostic on a
  no-UI host (`production-composition.ts:191–212`), and one persistent
  `theta-system-note` per error diagnostic through the pre-eval router
  (`:1115–1132`). Two per-slot rows are two transcript entries, not two lines
  inside one.
- **The silence blocks the cheap route and hides the cost of the other.**
  Harmonising per-slot needs the `theta/parse/tool-arg-type-mismatch`
  *Message* to name a slot, which DIAG-4 defers to theta 2.0; harmonising
  first-only discards information the two per-slot rows already render
  correctly through `<i>` and `<param>`. Neither cost is visible from any
  document today, and each new argument-checking surface added to this family
  will pick a side by accident, as these three did.
- **The registry is read as the inventory of what the implementation reports.**
  DIAG-1 entitles tests to assert on the specific code at every documented
  site, and DIAG-2 makes the registry closed. A consumer reading the three rows
  cannot derive how many diagnostics one site produces, and the three
  implementations do not agree, so no consistent expectation can be written
  against the rows as they stand.

## Non-goals

- **Choosing the disposition.** This report pins the constraints; §Fix
  enumerates three routes and selects none. The run adjudicates.
- **Re-opening bug 0137's wiring, bug 0072's soundness discipline or bug
  0050's emission arm.** Each is fixed and each behaves as its report records.
  Only the intra-site count is at issue, and only where a route names it.
- **The Pi-tool `theta/parse/tool-arg-schema-conflict` count.** Established
  here by source read (`tool-call.ts:300`, `:305–321`) and **not measured**: it
  needs a host exposing registered Pi tools with input schemas, which the
  offline composition-root harness this report uses does not provide. Its
  first-only shape is stated as a source fact, not a measurement, and any route
  that changes it owns its own witness.
- **Argument arity at any position.** Wired and ordered first on both invoke
  surfaces (§Reproduction (e)); absent on the in-document `fn` call, which is
  bug 0131's subject. This report measures the interaction and does not fix
  either half.
- **The per-error-diagnostic note routing.** One `theta-system-note` per
  error-severity load diagnostic is bug 0013's settled disposition
  (`production-composition.ts:1115–1132`), and its tension with
  `diagnostic-shape.md:65`'s "one `pi.sendMessage` call per `.theta` file" for
  the error case is that report's, not this one's. Recorded because it is what
  makes the count visible as separate transcript entries.
- **Two-code cascades for one written mistake.** Bug 0129's subject. Here one
  code fires N times; there two different codes fire for one occurrence.
- **The stale in-tree comment at `src/parser/type-layer-checks.ts:1993–1996`.**
  Measured stale at HEAD: it still describes
  `theta/parse/invoke-arg-type-mismatch` as having "its own, separately unwired
  emitter — a different open defect this walk does not fix", which bug 0137's
  fix falsified. Content drift in a comment, not a behaviour, and not filed
  here — recorded so a route that edits this file does not re-derive it.
- **Widening any surface's static read.** Which arguments are *judgeable* is
  owned by `collectProvableArgTypes` (`invoke-static-checks.ts:505`) and
  `provableArgType` (`type-layer-checks.ts:1654`), and bug 0137's residual 1 is
  filed as [0146](./0146-invoke-arg-provable-set-withholds-true-positives.md).
  This report counts diagnostics over the slots those functions already judge.

## Fix

The subject is the count, so every route below is defined by what it makes
true for a site with N provably mistyped slots. All three leave enforcement,
severity, registration denial and message *content* per emission unchanged, and
none is selected here.

**Shared constraints — every route satisfies all five.**

1. **Arity keeps its precedence.** `invocation.md:48`, measured in
   §Reproduction (e): a wrong-arity site on either invoke surface reports arity
   alone. The gates are `checkInvokeCall`'s `arityDiags.length > 0`
   (`invoke-diagnostics.ts:423–425`) and the `.theta`-callable `continue`
   (`invoke-static-checks.ts:949–954`). A count route touches neither.
2. **The withhold arms stay withholds.** `type-system.md:48`'s
   unresolvable-operand deferral is implemented as `undefined` from
   `collectProvableArgTypes` / `provableArgType` and as the absent-`paramType`
   / absent-`argType` skip in `checkInvokeArgTypes` (`:225–227`). A route
   changes how many *judged mismatches* are reported, never how many slots are
   judged.
3. **DIAG-4 binds every rendered message.** No *Message* may change wording
   inside theta 1.x (`diagnostic-shape.md:74`), and any witness sources its
   expected strings from the registry through `registryMessage`.
4. **GOV-15 is discharged by the loads-cleanly predicate, per route.** Every
   input whose count a route changes carries at least one `E` today, so it sits
   outside GOV-15's input set (`source-language-stability.md:9`) and observable
   (b)'s ordered-code-sequence promise does not range over it. State this from
   the sweep, not from assumption: re-run the committed-corpus sweep over every
   tracked `.theta` and `.thetalib`, with bug 0132 binding on how (the
   committed-fixture parse gate does not walk `.thetalib`).
5. **No committed test asserts a multi-slot count** (§Affected), so no route
   moves an already-asserted byte, and every route needs its own witness cells
   to become falsifiable.

**Route A — per-slot everywhere.** Delete the `break`
(`invoke-static-checks.ts:1038`), leaving the `.theta`-callable loop to emit
one diagnostic per mismatched slot as the other two already do.

- **Blocked inside theta 1.x as stated.** `theta/parse/tool-arg-type-mismatch`
  renders `tool '<name>' argument type mismatch: expected <expected>, got
  <actual>` (`code-registry-parse.md:115`) — no `<i>`, no `<param>` — at the
  whole-call range (`invoke-static-checks.ts:1027`). Measured (§Reproduction
  (b), `t2first` / `t2int`): slot 0 and slot 1 of the same mistyped type render
  identically, so `ctool3a(1, true, 2)` would emit two byte-identical lines.
  Adding `<i>`
  and `<param>` is a DIAG-4 *Message* reword, "deferred to theta 2.0 migration
  and outside the GOV-15 diagnostic-registry carve-out"
  (`diagnostic-shape.md:74`). The route therefore reduces to either accepting
  indistinguishable duplicates within theta 1.x or deferring itself to theta
  2.0.
- **The Pi-tool sibling comes with it or diverges from its own model.** The
  `break`'s reason is the schema-conflict arm's first-only reduction. Taking
  this route without touching `resolveSchemaConflict` (`tool-call.ts:305–321`)
  leaves the two `checkToolCallArguments` rows disagreeing where they currently
  agree, and touching it needs the unmeasured Pi-tool witness §Non-goals
  declines.
- **What it buys.** One rule for the family, every mistyped slot reported at
  the load that judges it, and `diagnostic-shape.md:65`'s purpose clause
  satisfied intra-site.

**Route B — first-only everywhere.** Add a `break` after the first pushed
diagnostic in `checkInvokeArgTypes` (`invoke-diagnostics.ts:243`) and in
`checkFnCallArgs` (`type-layer-checks.ts:1625`).

- **No message edit, so no DIAG-2 and no DIAG-4 engagement.** Both rows keep
  their `<i>`/`<param>` placeholders and render the first mismatched slot
  correctly.
- **It edits a registered row's own emitter.** `checkInvokeArgTypes` is
  `theta/parse/invoke-arg-type-mismatch`'s sole construction site
  (`invoke-diagnostics.ts:232–243`), unit-tested at
  `tests/invoke-diagnostics.test.ts:76–102` with a single slot, so the existing
  cells stay green and the new behaviour is unwitnessed until cells are added.
  `checkFnArgCompat` is shared with other sinks (`type-compat.ts:452`), so the
  `break` belongs in the loop, not the emitter.
- **It removes information the two rows already render.** An author with three
  mistyped arguments gets one, then reloads. Against
  `diagnostic-shape.md:65`'s purpose clause this is the losing direction, which
  is why the route is only admissible together with a written multiplicity rule
  that says so (see Route C — the two compose).
- **It interacts with bug 0131.** At a wrong-arity `fn` site the per-slot loop
  is the only check that fires today (§Reproduction (e), `f2many`), so a
  `break` there also changes what a wrong-arity `fn` call reports. Coordinate
  with 0131 or state the overlap.

**Route C — adjudicate the count in the corpus and align the code to the
ruling.** Add one multiplicity paragraph to `diagnostic-shape.md` (beside `:65`
and `:24`, the two existing count paragraphs) or one clause per row to the
three registry *Trigger*s, then make the three implementations match it.

- **Registry-clause form engages DIAG-2** — a *Trigger* change is a spec
  change, dispositioned by the GOV-15 diagnostic-registry carve-out
  (`source-language-stability.md:25`) "as an addition for inputs newly brought
  into the code's emission set and as a removal for inputs taken out of it".
  Under constraint 4 every input whose count would change already emits `E`, so
  it is outside the loads-cleanly input set and the carve-out's theta-2.0 arm
  — "an edit that alters what an in-scope input observes for a code it already
  emits" — is not reached. Measure the input set, do not assume it.
- **General-paragraph form reaches bug 0129 and bug 0093.** A rule phrased over
  "one occurrence" rather than "one call site" decides 0129's two-codes
  question and 0093's two-ranges question as a side effect. Either scope the
  paragraph to per-argument checks explicitly, or coordinate with both reports
  and let whichever lands second rebase.
- **The nearest precedent for the wording is a bug document, not the spec.**
  Bug 0045's §Fix *Multiplicity* clause
  (`./0045-inline-empty-object-type-missing-empty-schema-body.md:212–220`) —
  "One diagnostic per occurrence, in source order, no dedup" — is scoped to
  `theta/parse/empty-schema-body` alone. Route C's addition is the general form
  of that clause and should say which rows it ranges over.
- **The ruling can also bless the divergence.** A paragraph that assigns
  multiplicity per row, naming the invoke and `fn` rows per-slot and the two
  `checkToolCallArguments` rows first-only, closes the gap with no code change
  and makes each surface's behaviour testable. It is the only route that lands
  inside theta 1.x with no *Message* work and no information loss; its cost is
  a documented, permanent difference between spellings.

**Witness — offline, provider-free, whichever route lands.** A new test file at
the `discoverAndComposeFixtures` boundary on
`tests/invoke-arg-type-mismatch-wired.test.ts`'s harness shape: one planted
`.pi/theta/` workspace, distinct callee stem per caller, assertions on the
registered slash names, the `ctx.ui.notify` messages and the per-caller stderr
lines, and every expected message read from the registry through
`registryMessage` (DIAG-4). Required cells: the two- and three-mistype sites on
all three surfaces; the single-slot controls at slot 0 and slot 1 on each
surface, which are what prove a count of one is a `break` and not a dead check;
the two-site cell of §Reproduction (d), which pins the pass-level behaviour
`diagnostic-shape.md:65` governs; and the wrong-arity cells of §Reproduction
(e) on all three surfaces. Each count assertion is an exact count, never
`toBeGreaterThan`, and each surface's cells carry a live positive control from
the same load so no cell can pass while measuring nothing. No live tier
applies: every observable settles inside one load pass.

## Provenance

- **Origin:** the bug 0137 fix (0.78.0, HEAD `a314ac83`), residual 2 of
  `.pi/tmp/fixes/0137-report.md` — "A site with two mistyped slots draws two
  diagnostics on the invoke surface and one on the `.theta`-callable surface …
  No spec sentence fixes a per-site count, so this is recorded as a divergence,
  not a defect." That run measured the invoke and `.theta`-callable counts and
  left the `fn` surface's count unestablished; §Reproduction (c) establishes it.
- **Evidence:** two scratch vitest files driving `discoverAndComposeFixtures`
  over planted temp `.pi/theta/` workspaces at `a314ac83` — the first with 17
  callers over 11 callees covering §Reproduction (a), (b), (c) and (e), the
  second with 2 callers over 4 callees covering (d). Every line quoted above is
  from those runs, verbatim apart from the elided workspace prefix. Both files
  written, run, deleted; `git status --short` empty and no `tests/**` path
  matching `scratch` (case-insensitive) afterwards. The Pi-tool
  schema-conflict count is a source read, not a measurement (§Non-goals).
- **Implementation, at `a314ac83`:**
  `src/parser/invoke-diagnostics.ts:59` (the code constant), `:89`
  (`invokeArgTypeMismatchMessage`), `:211` (`checkInvokeArgTypes`), `:219–244`
  (the per-slot loop with no `break`; withheld-slot skip `:225–227`, verdict
  skip `:228–231`, emission `:232–243`), `:411` (`checkInvokeCall`), `:415–422`
  (its arity call), `:423–425` (the arity-alone early return), `:427` (the type
  call);
  `src/parser/type-layer-checks.ts:1575` (`checkFnCallArgs`), `:1598`
  (`matchedCount`), `:1599–1626` (the per-slot loop with no `break`),
  `:1623` (the per-argument range), `:1654` (`provableArgType`), `:1987`
  (`walkExpr`'s `call` arm), `:1993–1996` (the stale invoke-arm comment,
  §Non-goals);
  `src/parser/type-compat.ts:452` (`checkFnArgCompat`), `:468–479` (its single
  emission);
  `src/extension/invoke-static-checks.ts:505` (`collectProvableArgTypes`),
  `:768` (`checkInvokeStaticResolution`), `:801` (the invoke loop), `:807` (the
  invoke site range), `:855` (`resolveCalleeArity`), `:874–888` (the per-slot
  `InvokeArgSlot` build), `:889–893` (the divergence comment), `:894–903` (bug
  0137's `checkInvokeCall` call), `:915` (the `.theta`-callable loop), `:929–947`
  (its arity call), `:948–954` (its arity-before-type `continue`), `:985` (its
  empty callee-annotation env), `:986–1039` (its per-slot loop), `:1015–1035`
  (its emission), `:1027` (its whole-call range), `:1036–1038` (the
  first-mismatch comment and `break`), `:1042` (the Pi-tool loop's header
  comment);
  `src/runtime/tool-call.ts:188` (`checkToolCallArguments`), `:198–208` (the
  arity arm), `:224–239` (the Pi-tool argument-shape arm), `:247–263` (the
  `.theta`-callable type-mismatch arm), `:275–290`
  (the Pi-tool schema-conflict arm), `:300–303` and `:305–321`
  (`resolveSchemaConflict`, first provably-disjoint field);
  `src/extension/production-composition.ts:191–212` (`makeLoadEmit`; the
  per-error notify `:193–195`, the per-diagnostic stderr mirror `:208–210`),
  `:1115–1132` (`emitLoadNoteGroup`, one note per error diagnostic), `:2047`
  (`hasLoadParseError`).
- **Spec:** `docs/spec_topics/diagnostics/code-registry-parse.md:114`, `:115`,
  `:116` (the three rows, their *Trigger*s and *Message*s);
  `docs/reference/diagnostics.md:163`, `:164`, `:165` (the mirrors);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:24` (*Re-scan
  deduplication*), `:65` (*Multi-error reporting*), `:71` (DIAG-1), `:72`
  (DIAG-2), `:74` (DIAG-4), `:80` (the column legend's *Trigger* definition);
  `docs/spec_topics/diagnostics/code-registry-load.md:9`, `:53` and
  `docs/spec_topics/diagnostics/code-registry-host.md:12`, `:14` (the four
  places the corpus does fix a multiplicity, each per row);
  `docs/spec_topics/invocation.md:20`, `:38`, `:48`;
  `docs/spec_topics/tool-calls.md:14`, `:16`;
  `docs/spec_topics/type-system.md:48`, `:50` (TYPE-9), `:52` (TYPE-10);
  `docs/reference/discovery-cli.md:240–241`, `:242–244`;
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
- **Tests:** `tests/invoke-arg-type-mismatch-wired.test.ts` (bug 0137's
  witness; the harness shape §Reproduction mirrors, `:441–457` for the fake
  host, cell a7 the only two-param cell and its slot 0 well-typed);
  `tests/tool-arg-parse-checks.test.ts` (bug 0072's; no `break`-dependent
  cell); `tests/fn-arg-type-mismatch-wired.test.ts` (bug 0050's; no multi-slot
  cell); `tests/invoke-diagnostics.test.ts:76–102` (the emitter's unit cells,
  single hand-built slot).
- **Related bug documents:** `docs/bugs/0137-…md` (origin, fixed 0.78.0),
  `docs/bugs/0072-…md` (fixed 0.65.0, owner of the `break`),
  `docs/bugs/0050-…md` (fixed 0.77.0, owner of the `fn` loop),
  `docs/bugs/0146-…md` (open, the sibling residual of the same fix),
  `docs/bugs/0129-…md` and `docs/bugs/0093-…md` (open, the multiplicity
  neighbours), `docs/bugs/0131-…md` (open, the `fn` arity seam),
  `docs/bugs/0013-…md` (fixed 0.24.0, the note routing),
  `docs/bugs/0045-…md:212–220` (the nearest count clause in the tree),
  `docs/bugs/0132-…md` (open, binding on how the GOV-15 corpus sweep runs).
