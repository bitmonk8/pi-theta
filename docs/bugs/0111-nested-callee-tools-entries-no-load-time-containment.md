# Bug 0111 — The bug-0110 load-time containment check reaches only the discovered-theta pass: `parseCalleeTheta` calls `resolveThetaToolsAtLoad` without the active-root union, so a `tools:` `.theta` entry inside an *invoked* callee's own `tools:` mints its callable with no diagnostic on any channel — measured, the identical escaping entry un-registers its caller at the top level and, one level in, produces a callable whose first observable is an `Err(InvokeInfraError { cause: "load_failure" })` at dispatch that the spec says cannot distinguish escape from deletion

- **Status:** fixed (0.206.0). §Fix was not settled at filing and was deliberately
  left to the run; the run adjudicated **route (a), minimum honest form,
  `tools:`-surface scoped**, and §Fix (0.206.0) below records the choice, the
  measurement that ruled out route (b), and the scope bound. The filing text
  that follows is unchanged. Original filing status: open. The
  naive route — surfacing the rejection from the shared resolver — is forbidden
  by bug [0110](./0110-theta-callable-tools-entry-no-load-time-containment.md)
  §Fix constraint 5, because the nested-callee parse discards diagnostics and
  reads only `callableSet`, so a rejection there empties the callee's whole
  callable set with nothing on any channel. Three routes are stated with the
  constraints each must satisfy, including a spec-edit route, and the one-line
  change is ruled out; the choice is left to the run. No ordering dependency: 0110 shipped in 0.66.0 and is the baseline
  this report measures.
- **Sev/Diff estimate:** S2/D3 — an escaping entry is admitted with no
  diagnostic and the callable is created where `tool-calls.md:14` says it is
  not, but every call it enables fails closed at dispatch, so what is wrong is
  the channel and the timing rather than the outcome; D3 because §Fix needs an
  in-run route adjudication that reaches a spec sentence, and it edits the same
  `tools:`-resolution path bugs 0109 and 0110 own.
- **Kind:** defect — a load-time rule with a registered code is enforced on one
  of the two call sites of the function that enforces it. One element.
  `resolveThetaToolsAtLoad` (`src/extension/production-composition.ts:1434`)
  takes the active-root union as an optional trailing parameter (`:1451`) and
  forwards it to `parseCalleeForTools` (`:1474`), whose containment check is
  gated on `if (activeRoots !== undefined)` (`:1707`). It has exactly two call
  sites in `src/`: the discovered-theta compose pass
  (`:690–705`), which passes `activeRoots` (`:704`), and `parseCalleeTheta`
  (`:1957`), which passes five arguments and no union. An omitted union — not an
  empty one — turns the check off, so a nested callee's own escaping `tools:`
  entry is never judged. The enforcement that remains on that path is the
  runtime open-time re-check (`#driveCallee` → `#recheckCalleeContainment`,
  `src/extension/production-theta-producer.ts:3203`, `:3326`), which fails one
  call closed at dispatch and drops the diagnostic half of its own verdict
  (`:3346` returns `verdict.error` only).
- **Related:**
  - [0110](./0110-theta-callable-tools-entry-no-load-time-containment.md) —
    **fixed (0.66.0)**, the parent and the filing origin. This report is its
    §Fix (0.66.0) *Residuals* item 1, filed. 0110 scoped this path out under its
    own §Fix constraint 5, whose second authorised arm is "scope the new check
    to the discovered-theta pass"; the arm was taken for the reason constraint 5
    exists, and the omission is documented at three sites in the source — the
    parameter (`production-composition.ts:1443–1450`), the gate (`:1703–1706`),
    and the nested call (`:1949–1956`). No route dependency: 0110's fix is what this report measures
    against, and nothing here proposes changing it.
  - [0071](./0071-theta-callable-call-arity-unchecked.md) — **fixed (0.64.0)**,
    and [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**. The same `tools:` static-check surface, one generation earlier:
    0071 added the `.theta`-callable arity check and 0072 the two
    tool-argument type checks, both in `checkInvokeStaticResolution`. Neither
    reaches a nested callee either — that pass runs once per *discovered* theta
    (`production-composition.ts:743`) and never for a callee parsed at dispatch.
    Their bound is the same as this report's and is stated in the pass's own doc
    comment (`src/extension/invoke-static-checks.ts:613–623`).
  - [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md),
    [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md),
    [0108](./0108-uppercase-pi-tool-name-mints-unspellable-callable.md),
    [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) —
    **open**, the rest of the `tools:`-surface wave. Disjoint subjects: 0106 owns
    the entry-grammar derivations (`toolsEntrySpec` / `toolCallableName`), 0107
    the lock-step witness's shape, 0108 the presented-name shape rule on the
    Pi-tool arm, 0109 two stale code enumerations. None owns the active-root
    union and none names a nested callee. One coordination clause, not an
    ordering dependency: 0109's first edit lands in
    `src/extension/production-composition.ts` (`preEvalCauseOf`'s
    `tools-resolution` batch), so whichever of the two lands second re-derives
    its `path:line` citations in that file.
  - 0075 / 0076 / 0077 / 0078 — the discovery-source family. The boundary is
    0110's, unchanged: those four change *which paths land in the active-root
    union*, transitively, by changing what is discovered; this report changes
    *which call sites consult it*. `src/discovery/` holds no reference to
    `activeRoots` (`grep -rn activeRoots src/discovery/` is empty).
- **Affected** (every citation verified at HEAD `6093597c`, 0.66.0):
  - `src/extension/production-composition.ts:1434–1451` —
    **`resolveThetaToolsAtLoad`'s signature, and the optionality that is the
    defect.** `:1451` is `activeRoots?: readonly string[]`, and `:1443–1450`
    documents the omission at the parameter: "`undefined` on the nested-callee
    parse (`parseCalleeTheta`'s call site below in this file scopes the new
    check to the discovered-theta pass, §Fix constraint 5) — that callee's own
    `tools:` carries no load-time containment check because the active-root
    union is deliberately not threaded to it". `:1474` forwards it to
    `parseCalleeForTools`.
  - `src/extension/production-composition.ts:690–705` — **call site 1**, the
    discovered-theta compose pass inside `runComposePass`. `:704` passes
    `activeRoots`; `:706` emits the group and `:707–709` `continue`s the
    per-theta loop on any error-severity `tools:` diagnostic, strictly before
    `checkInvokeStaticResolution` at `:743`. This is the path bug 0110 fixed.
  - `src/extension/production-composition.ts:1912–1959` — **call site 2**,
    `parseCalleeTheta`, the runtime callee parse. `:1957` is
    `await resolveThetaToolsAtLoad(input, fs, ctx, deps, getAllTools)` — five
    arguments, no union. `:1958` is
    `return { ...input, callableSet: toolResult.callableSet ?? EMPTY_CALLABLE_SET }`:
    the resolution's `diagnostics` field is read nowhere in the function, and
    `EMPTY_CALLABLE_SET` (`:1421`) is the fallback. `:1949–1956` records the
    omission and its reason at the call site. The function's own return type is
    `Promise<ThetaCompositionInput | undefined>`, which carries no diagnostic
    channel.
  - `src/extension/production-composition.ts:1679–1751` —
    `parseCalleeForTools`, and the gate. `:1686` resolves the spec
    (`isAbsolute(spec) ? spec : resolvePath(callerDir, spec)`); `:1687–1690`
    reads its bytes with rejection-to-`undefined`; `:1707` is
    `if (activeRoots !== undefined)`; `:1715–1720` calls
    `checkInvokePathAtLoad`; `:1730–1735` returns `escape` with neutral
    `mode` / `hasErrors` and `fileExists: true`. The read precedes the gate, so
    the entry's bytes are read from outside the sandbox on both paths — the
    containment verdict governs whether they are *parsed*, not whether they are
    read.
  - `src/extension/production-composition.ts:499–501` — the `activeRoots`
    derivation (`Array.from(new Set(discovered.map((theta) => dirname(theta.path))))`),
    and `:623–627` — the `parseCallee` closure that wires `parseCalleeTheta`
    onto the producer input. Both sit inside `runComposePass`, so `activeRoots`
    (`:499`) and the pass's diagnostic sink (`sink`, the function's fourth
    parameter, `:401`; `emitDiagnostic: sink.emit` on the same producer input at
    `:620`) are **both lexically in scope at `:623`**. The missing piece is not
    the inputs at the call site; it is a channel the callee-parse *return path*
    can carry a rejection on, and a decision about what an operator sees.
  - `src/extension/production-composition.ts:1497–1514` — the V15f
    callee-has-errors loop, whose `callee.escape === undefined` guard (`:1503`)
    is dead on the nested path because no `CalleeParse` produced there can carry
    `escape`. `:1551–1556` `resolveCallableSet`; `:1559` the `registered`
    predicate; `:1560–1562` the early return that yields `{ diagnostics }` with
    no `callableSet` key — the shape that, reached from `:1958`, silently becomes
    `EMPTY_CALLABLE_SET`.
  - `src/extension/production-theta-producer.ts:3172–3207` — `#driveCallee`.
    `:3203` calls `#recheckCalleeContainment` and `:3204–3206` returns
    `makeErr(escape)` on a verdict; `:3207` is the `parseCallee` call the escape
    branch pre-empts. `:3326–3347` — `#recheckCalleeContainment`: `:3331–3333`
    returns `undefined` when `fileSystem` or `activeRoots` is absent from the
    producer input, `:3340` calls `recheckInvokePathAtRuntime`, and `:3346` is
    `return verdict.kind === "escape" ? verdict.error : undefined`. **The
    verdict's `diagnostic` is discarded**: `recheckInvokePathAtRuntime` builds
    both channels (`src/runtime/invocation.ts:254–264`) and this is its only
    call site in `src/` (`grep -rn recheckInvokePathAtRuntime src/` → the import
    at `:173` and this call).
  - `src/runtime/invocation.ts:185–201` — `checkInvokePathAtLoad`, the shared
    load-time checker, `:208–215` `invokePathEscapeDiagnostic`, `:239–265`
    `recheckInvokePathAtRuntime`, whose `:250–253` comment states the
    two-channel obligation the producer then half-honours. `:98–126`
    `checkInvokePathContainment` and `:142–147` `canonicalizePath` are
    surface-agnostic and need no change.
  - `src/runtime/invocation.ts:270–341` — **the spec's transitive
    static-resolution walk, with no `src/` call site.** `ParsedCallee`
    (`:277–284`) carries `toolThetaPaths`, "Canonical paths of this file's
    `.theta` `tools:` entries" (`:282–283`), and `runStaticResolutionPass`
    (`:310`) follows `[...parsed.invokePaths, ...parsed.toolThetaPaths]`
    (`:331–337`). `grep -rn runStaticResolutionPass src/` returns the header
    comment (`:29`) and the definition only; its sole driver is
    `tests/invocation-core.test.ts:221`, `:230`. This is the mechanism
    `invocation.md:20` and `implementation-notes.md:16` name for putting a
    callee's own `tools:` `.theta` entries inside the *entry theta's* load pass
    with their diagnostics aggregated into the entry theta's drain — i.e. the
    channel §Fix asks for is specified, and unimplemented.
  - `src/parser/invoke-diagnostics.ts:494–516` — `checkCalleeHasErrors`, the one
    mechanism that reports a callee's defect to an operator. It takes the
    caller's `site` and splits severity on `surface` (`:504`), then locates the
    diagnostic at `site.file` / `site.range` (`:509–510`). Its two callers
    both pass the caller's own file:
    `production-composition.ts:1510` (`file: parsed.sourcePath`) and
    `src/extension/invoke-static-checks.ts:680`
    (`site = { file: callerPath, range: invoke.range }`). The mechanism is
    caller-side and load-time; it does not reach a callee parsed at dispatch.
  - `src/extension/invoke-static-checks.ts:613–623` — the INV-5 bullet of
    `checkInvokeStaticResolution`'s doc comment, rewritten by the 0110 fix. It
    states "The `tools:` `.theta`-entry surface's containment is judged
    upstream, at `tools:` resolution time (`parseCalleeForTools`)" without
    qualification. That holds for every theta this pass runs over — the pass
    runs once per discovered theta and never for a callee parsed at dispatch —
    and does not hold of the surface as a whole. The sentence is a candidate for
    the same-commit reconciliation whichever route §Fix takes.
  - `docs/spec_topics/tool-calls.md:14` — §"Argument shape", the sentence this
    report measures: "The path-restriction rule from [Invocation — Resolution]
    also applies to `.theta` paths used as `tools:` entries: a path that escapes
    the active discovery roots is rejected with `theta/load/invoke-path-escape`
    and the callable is not created." No clause scopes it to a top-level theta's
    `tools:`. `:46` — §"Relationship with `invoke`": the two surfaces "both
    apply the arity, return-type-compatibility, and path-restriction rules from
    [Invocation]". `:3` — the callable set "is what the model sees during a
    `@`...`` query".
  - `docs/spec_topics/invocation.md:12` — §Resolution: "a `tools:` `.theta`
    entry that escapes likewise fails to register the callable"; the mandatory
    `realpath` step; the byte-exact segment-boundary predicate; the two-channel
    escape report and why the parent's `Err` cannot substitute ("the parent's
    `Err` cannot distinguish escape from deletion, both of which are legitimate
    causes of `load_failure`"); and the currently-active-roots rule for the
    re-check. `:16` — the INV-1 seam: "The load-time check (parent theta
    registration / `tools:` `.theta` entry registration) and the
    invocation-time re-check … MUST apply the identical
    `realpath`-then-discovery-root-containment semantics", and "a resolved path
    that escapes every active discovery root MUST surface on both channels".
  - `docs/spec_topics/invocation.md:20` — §Static resolution, the clause that
    decides the nesting question: "The walk is **transitive**: callees
    referenced by a callee's own literal `invoke` paths and `.theta` entries in
    `tools:` are loaded into the same cache. Each visited file is parsed once
    per pass and its diagnostics are aggregated into the entry theta's drain".
    `:22` — the per-surface severity split for a callee that is not statically
    resolvable (`tools:` entry → error, parent does not register).
  - `docs/spec_topics/implementation-notes.md:16` — §"Static-resolution load
    pass", the same walk from the implementation side: "The pass walks
    transitively from the entry theta across literal `invoke` paths and `.theta`
    entries in `tools:`, parses and lowers each visited file once, and
    aggregates each visited file's diagnostics into the entry theta's drain".
  - `docs/spec_topics/diagnostics/code-registry-load.md:33` — the
    `theta/load/invoke-path-escape` row. *Sev* `E`, *Phase* `load, runtime`,
    *Trigger* "An `invoke(...)` literal or a `tools:` `.theta` entry resolves
    (post-realpath) to a path that lies outside every active discovery root",
    *Message* `invoke path '<path>' resolves outside every active discovery
    root`. The *Trigger* names the entry kind, not the entry's depth, so the row
    licenses this emission without a widening. `:38` — the
    `theta/load/callee-has-errors` row, whose *Trigger* names "the parent's
    per-load-pass static-resolution walk" — the walk `runStaticResolutionPass`
    models and nothing runs.
  - `docs/reference/diagnostics.md:198` — the user-facing mirror row; `:172` its
    table header (`| Code | Sev | Phase | Message |`, no *Trigger* column), so a
    *Trigger*-only registry edit needs no mirror edit.
    `docs/reference/discovery-cli.md:230–236` — §Resolution, stated for
    `invoke(...)` and not restated for `tools:`.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:9` — category 5
    `<path>`, including the `tools:`-entry arm the 0110 fix added ("On the
    `tools:` `.theta`-entry surface, `<path>` renders the entry spec as
    written"). Whatever route §Fix takes, the rendering is already decided.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the registry
    is closed; a *Trigger* change is a spec change), `:74` (DIAG-4 — the
    *Message* column is normative and a reword is deferred to theta 2.0).
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate — no diagnostic of effective severity `E`),
    `:25` (the diagnostic-registry carve-out).
  - `docs/plan_topics/coverage-matrix.md:92` — `INV-1 | V15a`, the only row for
    the two-site-identical-containment pin. No row names the `tools:` surface's
    load-time containment, at either depth (0110 §Fix residual 6).
  - `tests/tools-entry-containment.test.ts` — bug 0110's witness over a planted
    `.pi/theta/` workspace, `discoverAndComposeFixtures` and a `ctx.ui.notify`
    collector, with every expected message substituted from the registry
    *Message* column. Every cell plants its caller as a **discovered** theta;
    `grep -n nested tests/tools-entry-containment.test.ts` returns nothing, and
    no cell reaches `parseCalleeTheta`. Its harness is what §Reproduction reuses.
  - `tests/invocation-core.test.ts:139–158` — the cell named "an invocation-time
    escape surfaces on BOTH channels — diagnostic AND
    InvokeInfraError{load_failure}". It asserts on `recheckInvokePathAtRuntime`'s
    return value, so it stays green while the producer discards the diagnostic
    half. `:221`, `:230` — the two `runStaticResolutionPass` cells, the only
    driver of the transitive walk in the tree.
  - `tests/production-tools-load-resolution.test.ts`,
    `tests/theta-callable-call-arity.test.ts` — the two shipped `tools:` /
    `.theta`-callable load witnesses. Neither plants a callee that declares its
    own `tools:` `.theta` entry.
    `grep -rln 'invoke-path-escape\|INVOKE_PATH_ESCAPE' tests/` returns exactly
    three files (`tests/invocation-core.test.ts`,
    `tests/tools-entry-containment.test.ts`,
    `tests/live/live-production-acceptance.test.ts`); none of the three plants a
    nested callee.
  - **The corpus census** (`rg --files --glob '*.theta' --glob '*.thetalib'`,
    excluding `node_modules` and `dist`): **34** committed files, **14**
    declaring `tools:`, **5** declaring a `tools:` `.theta` entry —
    `docs/examples/fan-out-reviews.theta:5` (`./review-lens.theta`),
    `ralph.theta:7` (`./ralph-step.theta`), `refine.theta:5`
    (`./reviewer.theta`), `typed-return.theta:5` (`./sentiment.theta`),
    `typed-params-across-boundary.theta:5` (`./summarise-doc.theta`). Of those
    five callees, `review-lens.theta` declares `tools: - read` and
    `ralph-step.theta` declares `tools: - read` / `- bash` (bare Pi-tool names,
    which `isBareToolName` routes away from any callee resolve); `reviewer.theta`,
    `sentiment.theta` and `summarise-doc.theta` declare no `tools:` at all.
    **Zero committed callees declare a `tools:` `.theta` entry**, so the nested
    surface is unexercised by the corpus in either direction.
- **Observed at:** `0.66.0` (HEAD `6093597c`). Offline, deterministic; no live
  model, no provider. One scratch vitest driving the shipped composition root
  (`discoverAndComposeFixtures`, `src/extension/production-composition.ts`) over
  two planted `mkdtempSync` `.pi/theta/` workspaces plus a third, undiscovered
  `mkdtempSync` directory holding the out-of-root callees; six arms, and — for
  the three dispatch arms — the registered fixture's own `run(args, ctx)` handler
  driven to completion with the `theta-system-note` channel collected off the
  fake `pi.sendMessage`. Written, run, deleted.

## Summary

Bug 0110 (0.66.0) added the load-time discovery-root containment check for a
`tools:` `.theta` entry. It reaches one of the two call sites of the function
that performs it.

```
:690   resolveThetaToolsAtLoad(input, fileSystem, ctx, parseDeps, () => …, activeRoots)  <- discovered-theta pass
:1957  resolveThetaToolsAtLoad(input, fs, ctx, deps, getAllTools)                        <- parseCalleeTheta
:1707  if (activeRoots !== undefined) { … checkInvokePathAtLoad … }                      <- parseCalleeForTools
```

(All three in `src/extension/production-composition.ts`; the union is the sixth
argument at `:704` and is absent from the second call entirely.)

An omitted union turns the check off. `parseCalleeTheta` is the runtime callee
parse — it builds the `ThetaCompositionInput` for a callee the dispatch path is
about to open — so an escaping entry in an *invoked* callee's own `tools:` is
never judged, and its callable is minted into that callee's frozen callable set.

Measured at `6093597c`, one workspace, the same escaping-entry shape reached two
ways:

```
top level   .pi/theta/calltop.theta   tools: - <ABS_OUT>/alphafar.theta
            -> caller ABSENT from the registered set
            -> "invoke path '<ABS_OUT>/alphafar.theta' resolves outside every active discovery root"

one level in .pi/theta/nested/midcallee.theta   tools: - <ABS_OUT>/betafar.theta
             (in-root, undiscovered; named by a discovered caller's `tools:` entry)
            -> caller REGISTERS, its `midcallee` callable minted
            -> ZERO diagnostics naming betafar.theta, on any channel
```

Driven to dispatch, the nested entry's callable is real and the runtime re-check
is what stops the call:

```
theta /pcaller returned Err: invoke of <ABS_OUT>/gammafar.theta failed (load_failure)
```

That is the whole of what an operator sees, and it arrives at the moment of a
call. `docs/spec_topics/invocation.md:12` records why it is not the report the
spec specifies: "the parent's `Err` cannot distinguish escape from deletion,
both of which are legitimate causes of `load_failure`", which is why the
specified escape report is two-channel. The second channel is absent here twice
over — no load-time diagnostic, and `#recheckCalleeContainment`
(`production-theta-producer.ts:3346`) returns `verdict.error` and drops the
`verdict.diagnostic` its own checker built.

**The naive fix is forbidden.** `parseCalleeTheta` reads only
`toolResult.callableSet ?? EMPTY_CALLABLE_SET` (`:1958`) and discards the
resolution's `diagnostics`. An error-severity `tools:` diagnostic makes
`resolveThetaToolsAtLoad` return `{ diagnostics }` with no `callableSet` key
(`:1560–1562`), so threading the union into that call site without also
threading a diagnostic channel would replace the callee's **entire** callable
set with the frozen empty set — every Pi tool and every other `.theta` callable
the callee declares, silently gone at dispatch, with nothing on any channel.
That is the failure mode 0110 §Fix constraint 5 exists to forbid, and it is why
0110 took its scope.

**The nesting question is not open.** `invocation.md:20` states the
static-resolution walk is transitive and names a callee's own `.theta` `tools:`
entries as its edges, with each visited file's diagnostics "aggregated into the
entry theta's drain"; `implementation-notes.md:16` states the same from the
implementation side. INV-1 (`invocation.md:16`) names "`tools:` `.theta` entry
registration" as a load-time call site of the shared checker, without
qualification as to depth, and the registry *Trigger*
(`code-registry-load.md:33`) names the entry kind, not its depth. So the
obligation attaches to every `tools:` `.theta` entry registration, the
destination for the diagnostic is specified, and the nested path is
non-conformant. The mechanism the spec names for it,
`runStaticResolutionPass` (`src/runtime/invocation.ts:310`), exists with
`toolThetaPaths` edges and has no `src/` call site.

## Reproduction

Offline, at `6093597c`. Scratch vitest, the shipped composition root: a fake
`pi` / `ctx` pair with `ctx.cwd` set to a `mkdtempSync` workspace carrying
`.pi/theta/` and a `{}` `.pi/settings.json`, then
`await discoverAndComposeFixtures(pi, ctx)` — the harness
`tests/tools-entry-containment.test.ts` uses. Observables: the returned
fixtures' `slashName`s (`REGISTERED`), each fixture's frozen `callableSet`
snapshot (`SNAP`, read as
`tests/tool-arg-runtime-schema-validation.test.ts:157–171` reads it), every
string reaching `ctx.ui.notify` (`NOTIFY`), and every payload reaching
`pi.sendMessage` (`MESSAGES` — the `theta-system-note` channel).

The out-of-root callees sit in a **third** `mkdtempSync` directory the discovery
walk never visits. `activeRoots` is
`Array.from(new Set(discovered.map((theta) => dirname(theta.path))))`
(`production-composition.ts:499`), so with every discovered theta in
`<ws>/.pi/theta` the union is that one directory. Each out-of-root callee
declares `mode: subagent` plus `params: x: string, y: string` — `requiredCount`
2 — and every call passes exactly two string arguments, so no arity,
unresolvable-path, prompt-mode, rename, derived-name or collision rule can
reject any entry. Containment is the only rule left.

The nested callee sits in `<ws>/.pi/theta/nested/`, which is **inside** the
active root by segment-boundary containment and is **not itself discovered**
(the walk collects `*.theta` per directory and does not recurse — the planted
`nested/nestprobe.theta` is absent from every registered set, which is the
in-run proof). That is what makes the nested arm's escaping entry attributable
to the nested parse alone: the file that declares it is never seen by the
discovered-theta pass.

### The arms

| Arm | Planted | Shape | Question |
|---|---|---|---|
| 1 | `calltop` | `tools: - <ABS_OUT>/alphafar.theta` | the 0110 fix, top level |
| 2 | `callmid` + `nested/midcallee` | `tools: - ./nested/midcallee.theta`; mid's own `tools: - <ABS_OUT>/betafar.theta` | the nested entry at load |
| 3 | `pcaller` + `nested/pmid` | prompt→prompt `invoke`; pmid's own `tools: - <ABS_OUT>/gammafar.theta`, called | the nested entry at dispatch |
| 4 | `pcallerrel` + `nested/pmidrel` | as arm 3, entry written `../../../../<out>/deltafar.theta` | which runtime branch fired |
| 5 | `pcallernone` + `nested/pmidnone` | as arm 3, callee declares **no** `tools:` and calls the name anyway | the no-minting contrast |
| 6 | `calldmid` + `dmid` | `tools: - ./dmid.theta`; dmid is **discovered** and its own `tools: - <ABS_OUT>/epsilonfar.theta` | does the top-level verdict propagate? |

One further theta, `pcallernear` + `nested/pmidnear`, is arm 3's shape with the
nested callee's entry naming an in-root sibling. It registers and is not driven;
it is in the workspace so the registered set below is complete rather than
filtered.

Arms 3–5 use prompt-mode caller and prompt-mode callee, the one cross-mode cell
that attaches in-process rather than spawning a child
(`production-theta-producer.ts:3235`), so the dispatch is offline and
provider-free. No body carries a `@`...`` query.

### Verbatim run output

```
OUT:          C:/Users/…/Temp/theta-b0111-out-QsOf18
WS_A:         C:/Users/…/Temp/theta-b0111-wsA-J0rOSI
REGISTERED_A: ["calldmid","callmid","ctl","pcaller","pcallernear","pcallernone","pcallerrel"]
NOTIFY_A:
  - invoke path 'C:/Users/…/Temp/theta-b0111-out-QsOf18/alphafar.theta' resolves outside every active discovery root
  - invoke path 'C:/Users/…/Temp/theta-b0111-out-QsOf18/epsilonfar.theta' resolves outside every active discovery root
MESSAGES_A:
SNAP callmid:  [["midcallee",{"kind":"theta","mode":"subagent","calleePath":"./nested/midcallee.theta","closureHash":"sha256:903d0f70…"}]]
SNAP calltop:  <not registered>
SNAP calldmid: [["dmid",{"kind":"theta","mode":"subagent","calleePath":"./dmid.theta","closureHash":"sha256:8f84e5c6…"}]]
SNAP dmid:     <not registered>
```

Then, each dispatch arm's `run("", ctx)` driven to completion (`NOTIFY total`
after each is `2` — the two load-time notifications above and nothing else):

```
pcaller     -> theta-system-note: theta /pcaller returned Err: invoke of
               C:/Users/…/Temp/theta-b0111-out-QsOf18/gammafar.theta failed (load_failure)
pcallerrel  -> theta-system-note: theta /pcallerrel returned Err: invoke of
               C:\Users\…\Temp\theta-b0111-out-QsOf18\deltafar.theta failed (load_failure)
pcallernone -> theta-system-note: theta /pcallernone returned Err: invoke of
               ./nested/pmidnone.theta failed (load_failure)
```

Read against the arms:

- **Arm 1 — `calltop` is absent from `REGISTERED_A`** and drew
  `theta/load/invoke-path-escape` naming the entry spec as written. The 0110 fix
  is live at this baseline; this arm is also the in-run proof that the third temp
  directory is outside every active root.
- **Arm 2 — `callmid` is in `REGISTERED_A`** with the `midcallee` callable
  minted, and the whole run carries **no** notification naming `betafar.theta`.
  The escaping entry one level in is invisible at load: the caller's own entry
  passes containment (in-root), and `midcallee`'s escaping entry produces no
  diagnostic on either channel. It also shows the top-level rejection cannot
  reach the caller through V15f: `parseCalleeForTools` derives `hasErrors` from
  `parseThetaDocument`'s diagnostics (`:1739`, `:1749`), and a containment verdict
  is not among them.
- **Arm 3 — the nested callable is real, and the runtime is what stops the
  call.** `pcaller` registers, dispatches, and its `theta-system-note` names
  `<ABS_OUT>/gammafar.theta` with cause `load_failure`. For the call to name that
  path at all, `pmid`'s escaping entry must have minted its callable at the
  nested parse: `thetaCalleePath` reads the presented name out of the frozen
  snapshot and falls back to `./<name>.theta` when absent
  (`production-theta-producer.ts:3096`), so an unminted `gammafar` would have
  produced `./gammafar.theta`.
- **Arm 4 — the branch is identified.** The entry is written
  `../../../../<out>/deltafar.theta`, so the snapshot's `calleePath` is that
  relative spec, and the note nonetheless names the **host-native absolute**
  `C:\Users\…\deltafar.theta`. Only `#recheckCalleeContainment` renders that
  value: it sets `callee_path: input.resolvedPath`
  (`src/runtime/invocation.ts:261`) from the caller-relative resolve at
  `production-theta-producer.ts:3335–3339`, whereas the `parseCallee`-returned-
  `undefined` branch sets `callee_path: calleePath`, the spec as written
  (`:3208–3216`, the assignment at `:3212`). So the `Err` is the containment
  refusal, not a load failure of the callee file.
- **Arm 5 — the contrast.** With no `tools:` entry for the name, the *callee*
  fails its own parse (`theta/parse/unknown-identifier`), `parseCalleeTheta`
  returns `undefined`, and the note names `./nested/pmidnone.theta` — the callee,
  not the out-of-root file. Minting is what puts an out-of-root callee within
  reach of a call at all.
- **Arm 6 — the same file, refused at one depth and admitted at the other.**
  `dmid` is discovered, so its escaping entry un-registers it
  (second `NOTIFY_A` line). `calldmid`, whose `tools:` entry names that same
  file, registers with the `dmid` callable minted. The load pass holds an
  error-severity verdict about exactly that file and the callee-parse path is not
  reached by it; at dispatch, `parseCalleeTheta` re-resolves `dmid`'s `tools:`
  with no union, so `epsilonfar` is minted again inside the invoked callee.
- **`NOTIFY total: 2` after every dispatch arm.** Three runtime containment
  refusals fired and added **zero** diagnostics to the notification channel. This
  is `production-theta-producer.ts:3346` dropping `verdict.diagnostic`.

### The differential that isolates the gate

A second workspace plants the arm-1 caller unchanged and adds the out-of-root
directory as a settings `thetaPaths` entry, making it an active root:

```
REGISTERED_B:  ["calltop"]
SNAP calltop:  [["alphafar",{"kind":"theta","mode":"subagent",
                "calleePath":"C:/Users/…/theta-b0111-out-QsOf18/alphafar.theta",
                "closureHash":"sha256:8d02af27…"}]]
```

The byte-identical entry registers and mints its callable once the containment
verdict is `within`. The nested path produces the same `escape: undefined`
`CalleeParse` for the opposite reason — the check did not run — so the minted
outcome is the same code path with the same input to `resolveCallableSet`.

## Expected behaviour

- **A `tools:` `.theta` entry whose path escapes every active root creates no
  callable, at any depth.** `docs/spec_topics/tool-calls.md:14` states it in
  those words and names `theta/load/invoke-path-escape`;
  `docs/spec_topics/invocation.md:12` states the same disposition from
  §Resolution. Neither sentence carries a depth qualifier, and neither admits a
  runtime-only reading: `theta/load/` is a load-phase namespace and "the callable
  is not created" is a statement about the frozen snapshot.
- **INV-1's load-time call site is "`tools:` `.theta` entry registration",
  not "a discovered theta's `tools:` entry registration".**
  `docs/spec_topics/invocation.md:16` requires the load-time check and the
  invocation-time re-check to "apply the identical
  `realpath`-then-discovery-root-containment semantics", and requires an escape
  to "surface on both channels". A registration that runs no load-time check
  satisfies neither half.
- **A callee's own `tools:` `.theta` entries belong to the entry theta's load
  pass, and their diagnostics have a specified destination.**
  `docs/spec_topics/invocation.md:20`: "The walk is transitive: callees
  referenced by a callee's own literal `invoke` paths and `.theta` entries in
  `tools:` are loaded into the same cache. Each visited file is parsed once per
  pass and its diagnostics are aggregated into the entry theta's drain."
  `docs/spec_topics/implementation-notes.md:16` repeats it. So the question this
  report raises — does INV-1's obligation attach to every `tools:` entry
  registration or only to the discovered-theta pass? — is answered by the
  corpus, in favour of every registration; and the channel objection that scoped
  0110's fix is answered too: the drain of the theta whose load pass reached the
  callee.
- **The registry *Trigger* names the entry kind, not its depth.**
  `code-registry-load.md:33`: "An `invoke(...)` literal or a `tools:` `.theta`
  entry resolves (post-realpath) to a path that lies outside every active
  discovery root", *Phase* `load, runtime`. Under DIAG-2 the *Trigger* column is
  normative, so the row already licenses this emission.
- **A load-time rule is not discharged by a runtime backstop, and this backstop
  delivers one channel.** `invocation.md:12` specifies the re-check as a
  *re*-check whose purpose is a symlink swapped between load and invocation, and
  fixes the two-channel report with the reason ("the parent's `Err` cannot
  distinguish escape from deletion"). Measured: the load channel is silent and
  the runtime channel emits only the `Err` — `#recheckCalleeContainment` drops
  the diagnostic its checker built.
- **A rejection on this path narrows nothing that was not rejected.** Whatever
  route is taken, the observable for an escaping nested entry is a report about
  that entry. A callee losing its other callables is not a stated consequence of
  any rule, which is the constraint 0110 recorded and this report inherits.

## Actual behaviour / root cause

**The check is a parameter, and one caller omits it.**

```ts
async function resolveThetaToolsAtLoad(
  …
  activeRoots?: readonly string[],
): Promise<ThetaToolsResolution> {
```

`src/extension/production-composition.ts:1434–1452`. Forwarded at `:1474` into
`parseCalleeForTools`, where the whole check sits behind

```ts
  if (activeRoots !== undefined) {
```

`:1707`. The discovered-theta pass passes the union (`:704`);
`parseCalleeTheta` passes five arguments (`:1957`). An omitted union is what
turns the check off, deliberately — the shape mirrors
`#recheckCalleeContainment`'s `activeRoots === undefined` early return
(`production-theta-producer.ts:3331–3333`) — and both sites document it
(`:1443–1450`, `:1703–1706`, `:1949–1956`).

**The nested parse has no diagnostic channel to reject on.**

```ts
  const toolResult = await resolveThetaToolsAtLoad(input, fs, ctx, deps, getAllTools);
  return { ...input, callableSet: toolResult.callableSet ?? EMPTY_CALLABLE_SET };
```

`:1957–1958`. `toolResult.diagnostics` is read nowhere in `parseCalleeTheta`,
and the function's return type is `Promise<ThetaCompositionInput | undefined>` —
a callee or nothing. An error-severity `tools:` diagnostic returns
`{ diagnostics }` with no `callableSet` key (`:1560–1562`), which this line
turns into `EMPTY_CALLABLE_SET` (`:1421`). So a rejection reaches the dispatch
path as a callee whose every callable has vanished, with nothing on any channel:
0110 §Fix constraint 5's forbidden outcome, and the reason its second arm was
taken.

**The inputs are in scope at the call site; the channel is not.** `parseCallee`
is wired at `:623–627`, inside `runComposePass`, after `activeRoots` at `:499`
and beside `emitDiagnostic: sink.emit` at `:620` on the same producer input. So
a fix does not need new plumbing to know the roots or to reach a sink. What is
missing is a decision about which theta's drain a nested rejection belongs to
and what it does to the callee — and the spec answers the first
(`invocation.md:20`: the entry theta's drain) through a mechanism with no
production caller.

**The transitive walk the spec names is unwired.**
`runStaticResolutionPass` (`src/runtime/invocation.ts:310`) walks
`[...parsed.invokePaths, ...parsed.toolThetaPaths]` (`:331–337`) from an entry
theta, parsing each canonical path once. `grep -rn runStaticResolutionPass src/`
returns the module header comment and the definition; nothing calls it. The
production load pass instead resolves a discovered theta's `tools:` entries
exactly one level deep — `resolveThetaToolsAtLoad` pre-parses each distinct
callee through `parseCalleeForTools` (`:1470–1478`), which reads and parses the
callee for its `mode` and its own error-severity diagnostics and never looks at
the callee's `tools:`. A nested entry is therefore first *seen* at dispatch,
which is why the only channel available there is the one the dispatch path
already has: the parent's `Err`.

**The runtime backstop, precisely.** `#driveCallee`
(`production-theta-producer.ts:3172`) calls `#recheckCalleeContainment`
(`:3203`) before `parseCallee` (`:3207`) and returns `makeErr(escape)` on a
verdict (`:3204–3206`). `#recheckCalleeContainment` (`:3326`) resolves the
callee against the caller's directory (`:3335–3339`), calls
`recheckInvokePathAtRuntime` (`:3340`), and returns `verdict.error` (`:3346`).
What that delivers, measured: one
`Err(InvokeInfraError { cause: "load_failure", callee_path })` at the moment of
dispatch, computed against the *currently* active roots, rendered to the
operator as `theta /<name> returned Err: invoke of <path> failed
(load_failure)`. What it does not deliver: the `theta/load/invoke-path-escape`
diagnostic — `recheckInvokePathAtRuntime` builds it (`invocation.ts:257`) and
this call site discards it — nor any load-time observable, nor the callable's
non-creation. It also returns `undefined`, i.e. no check at all, when the
producer input carries no `fileSystem` / `activeRoots` (`:3331–3333`).

**Nothing in the tree scores it.** The three test files naming the escape code
plant only discovered callers. `tests/invocation-core.test.ts:139` asserts the
two-channel obligation on the *checker's return value*, so it stays green while
the producer drops one channel, and `:221` / `:230` are the only driver of the
transitive walk. `grep -n nested tests/tools-entry-containment.test.ts` is
empty.

## Why it matters

- **A containment rule with a `theta/load/` code and an `E` severity is
  unenforced on one of the two call sites of the function that enforces it.**
  The registry *Trigger* (`code-registry-load.md:33`) names the entry kind, not
  its depth, and under DIAG-2 that column is normative. Measured: the identical
  entry un-registers its caller at depth 0 and mints its callable at depth 1.
- **The unenforced rule is the sandbox boundary.**
  `production-composition.ts:494–498` describes the union it builds in those
  terms ("a callee resolving outside all of them escapes the sandbox"). A
  callee reached through one `tools:` entry can name any absolute path on the
  filesystem in its own `tools:` and mint a callable for it, and the entry's
  bytes are read whatever the verdict would be — `parseCalleeForTools` reads at
  `:1687`, before the gate at `:1707`.
- **The operator sees nothing at load and an ambiguous `Err` at dispatch.**
  `invocation.md:12` states why that is not the specified report: "the parent's
  `Err` cannot distinguish escape from deletion, both of which are legitimate
  causes of `load_failure`". Measured, both halves are missing: no load-time
  diagnostic, and `#recheckCalleeContainment` drops the runtime diagnostic. The
  first observable is a failed call, possibly inside a loop, possibly after the
  callee has already done work.
- **The failure is un-actionable from what is shown.** The rendered note names
  the callee path and `load_failure`. An author whose entry was mistyped, whose
  callee was deleted, and whose callee sits outside the roots all see the same
  string. The diagnostic that names the cause exists, is registered, carries a
  *Hint* that states the remedy (`code-registry-load.md:33`: "Move the callee
  under one of the active discovery roots … or add the callee's directory as a
  settings `thetaPaths` entry"), and is discarded.
- **The two depths disagree about the same file.** Arm 6: `dmid` is refused
  registration for its escaping entry and is simultaneously minted as a callable
  by a caller naming it. One load pass holds both verdicts.
- **The spec's transitive walk is the specified home for this check and has no
  production caller.** `invocation.md:20` and `implementation-notes.md:16` put a
  callee's own `.theta` `tools:` entries inside the entry theta's load pass with
  their diagnostics on the entry theta's drain. `runStaticResolutionPass` models
  exactly that and is driven only by `tests/invocation-core.test.ts`. Every
  load-time rule that ranges over "a callee referenced by a `tools:` `.theta`
  entry" is bounded at depth 1 for the same reason, so this report's element is
  the containment instance of a structural bound.
- **Nothing reds in either direction.** No test plants a nested callee, so the
  gap is unrecorded and a later narrowing of any fix is unguarded.
- **The corpus does not exercise it.** Of the 5 committed `tools:` `.theta`
  entries, zero callees declare a `tools:` `.theta` entry of their own, so the
  measured blast radius of newly refusing an escaping nested entry is **zero**
  committed files. The behaviour is reachable only by an author writing a callee
  that itself declares a `tools:` `.theta` entry outside the roots.

## Non-goals

- **The discovered-theta pass's containment check**, which is correct (measured:
  arms 1 and 6). This report adds no requirement to it and proposes no change to
  bug 0110's fix.
- **Implementing the spec's transitive static-resolution walk.**
  `runStaticResolutionPass`'s absent production caller bounds every load-time
  rule that ranges over a transitively-reached callee — `callee-has-errors`
  propagation depth, cross-theta return-type inference, and cycle detection as
  well as containment. Wiring it is a larger change than this report's subject
  and is unfiled; §Fix route (a) states what it would cost and why it is the
  spec-shaped home, without asking for it here.
- **`#recheckCalleeContainment` discarding `verdict.diagnostic`.** Verified at
  `production-theta-producer.ts:3346` against `invocation.md:16`'s
  both-channels MUST, and it is the reason candidate (c) in §Fix cannot be
  accepted on the runtime check as it stands. It is a defect of the runtime
  re-check on *both* call surfaces, not of the nested `tools:` path, and it is
  unfiled. This report records it as evidence and does not claim it.
- **The `theta/load/invoke-path-escape` *Message* text.** It reads `invoke path
  '<path>' resolves outside every active discovery root`; DIAG-4
  (`diagnostic-shape.md:74`) defers a reword to theta 2.0, and
  `placeholder-rendering-b.md:9` already carries the `tools:`-entry rendering
  arm. Both are constraints on the fix, not defects.
- **How `activeRoots` is computed** (`production-composition.ts:499`), and which
  paths land in it — the discovery-source family 0075–0078 owns the stage that
  feeds it.
- **The `INV-5` label drift in the source comments.**
  `src/extension/invoke-static-checks.ts:28`, `:613` and
  `src/extension/production-theta-producer.ts:3182` label the containment check
  "INV-5" while `invocation.md`'s INV-5 (`:36`) is subagent return-value
  propagation and its containment pin is INV-1 (`:14`). 0110 §Fix residual 4;
  unchanged here, and noted so this report's citations resolve.
- **Whether a subagent child re-checks its own roots.** A subagent-mode nested
  callee is driven in a spawned child whose active-root union is reconstructed
  there; what that union contains is
  [0008](./0008-subagent-child-drops-all-but-last-theta-root.md)'s subject.
  Every cell here settles in one process.

## Fix

**Judge a `tools:` `.theta` entry's discovery-root containment wherever the
entry's callable is created, including inside a callee parsed at dispatch, and
report an escape on a channel an operator reads.** The route is not settled.
The constraints below bind every route, and constraint 1 is what makes the
obvious change unacceptable.

*No new registered code is expected under any route.*
`theta/load/invoke-path-escape` exists, its *Sev* is `E`, its *Phase* is
already `load, runtime`, its *Trigger* names the entry kind without a depth
qualifier, and its `<path>` rendering for this surface is already pinned
(`placeholder-rendering-b.md:9`). Confirm that reading against the row as
written rather than assuming it; if a *Trigger* widening turns out to be needed,
it is a DIAG-2 spec edit in the same commit, and `docs/reference/diagnostics.md`
needs no mirror edit because its table (`:172`) carries no *Trigger* column.

### What channel exists today

The route decision turns on this, so it is settled first, by measurement and by
source.

**No diagnostic produced during a nested-callee parse reaches any channel.**
`parseCalleeTheta` returns a callee or `undefined` and reads only
`toolResult.callableSet` (`:1957–1958`); nothing on that path holds a sink.
Measured: at load, `MESSAGES_A` is empty and no notification names the nested
escaping callee; at dispatch, three containment refusals fired and the
notification count did not move.

**`theta/load/callee-has-errors` does not supply a usable mechanism, because it
is a caller-side emission.** It is raised *about* a callee *by the caller's load
pass*, never by the callee's own parse:
`checkCalleeHasErrors` (`src/parser/invoke-diagnostics.ts:494`) takes a `site`
and a `surface`, splits severity on the surface (`:504` — `error` for `tools:`,
`warning` for `invoke(...)`), and has two callers. On the `tools:` surface the
V15f loop in `resolveThetaToolsAtLoad` passes
`site: { file: parsed.sourcePath, range: TOOLS_DIAGNOSTIC_RANGE }`
(`production-composition.ts:1510`, inside the loop at `:1502–1514`) — the
*caller's* file. On the
`invoke(...)` surface `checkInvokeStaticResolution` passes
`site = { file: callerPath, range: invoke.range }`
(`src/extension/invoke-static-checks.ts:680`). Both emissions travel out on the
return value of a per-discovered-theta check, into the compose pass's sink. So
the mechanism that reports a callee's defect to an operator is a *caller-side
diagnostic raised while the caller loads* — which is route (a)'s shape, and is
unavailable at dispatch because no load pass is running then.

### The design question

Three routes, plus one that is ruled out. Each must answer the same question —
*what does an operator see, and when* — and none may answer it by emptying a
callable set.

- **Route (a) — put the nested entry inside a load pass, as the spec says.**
  `invocation.md:20` and `implementation-notes.md:16` specify a transitive walk
  from the entry theta across `invoke` paths and `.theta` `tools:` entries whose
  visited files' diagnostics aggregate into the entry theta's drain.
  `runStaticResolutionPass` (`src/runtime/invocation.ts:310`) already models it,
  with `toolThetaPaths` edges (`:282–283`), and has no `src/` call site. On this
  route the nested entry is judged at the *caller's* load, before any callable
  exists anywhere, the diagnostic un-registers the entry theta, and the dispatch
  path needs no channel at all — which dissolves constraint 1 rather than
  working around it. Assess: this is the spec's own answer and the only
  route that delivers "the callable is not created" for a nested entry, and it is
  also the largest change in this report's neighbourhood. Wiring the walk changes
  the depth at which several other load-time rules range
  (`callee-has-errors` propagation, cross-theta return-type inference, cycle
  detection), so scoping it to containment alone is itself a decision that has to
  be made and defended, and doing it in full is a separate report's subject
  (§Non-goals). The minimum honest form of this route is: reach the nested
  entries of a discovered theta's `tools:` callees at the caller's load, judge
  containment there, and state explicitly which other rules were left at depth 1
  and why.
- **Route (b) — reject the entry, not the set.** Thread the union into
  `parseCalleeTheta`'s call (`:1957`) and have `resolveCallableSet` drop only the
  escaping entry from the nested callee's snapshot, so the callee keeps its other
  callables and a call to the escaping name fails later as an ordinary unknown
  callable. Assess: this satisfies constraint 1 in the letter — no set is
  emptied — and it is honest only if the *later* failure names the cause. Arm 5
  measured what an unminted name does today: the callee fails its own parse with
  `theta/parse/unknown-identifier`, and the parent's note names the callee file
  rather than the escaping path. That is a quieter silence than the status quo,
  not an improvement: the operator loses even the out-of-root path that the
  present `load_failure` note prints. Route (b) is therefore acceptable only in
  combination with an emitted diagnostic, at which point it needs the same
  channel decision route (a) makes — and it must state which theta's drain
  carries it, since the callee is not a registered theta at that moment.
- **Route (c) — a spec edit stating the runtime re-check is this path's
  containment defence.** Amend `invocation.md`/`tool-calls.md` to scope the
  load-time obligation to a registration the load pass performs, and pin the
  invocation-time re-check as the defence for a callee's own `tools:` entries.
  Assess: this is a serious candidate, because the re-check does fail the call
  closed at dispatch, before the callee is opened
  (`production-theta-producer.ts:3203` precedes `:3207`), and because the spec
  already accepts an invocation-time-only defence for a callee that is not
  statically resolvable at load (`invocation.md:22`). Three things stand against
  it as the corpus reads today, and a route-(c) fix must dispose of all three
  in the same commit. First, `invocation.md:20`'s transitive-walk clause says a
  callee's own `tools:` entries *are* part of the load pass, so scoping the
  obligation away from them contradicts a sentence on the same page. Second,
  INV-1 requires an escape to surface on **both** channels, and
  `#recheckCalleeContainment` (`:3346`) emits only the `Err` — so route (c)
  cannot be a pure spec edit; it also has to make the runtime check emit its
  discarded diagnostic. Third, the re-check returns `undefined` when the producer
  input carries no `fileSystem` / `activeRoots` (`:3331–3333`), so on that
  configuration route (c) leaves no defence at all, and the spec would be
  pinning a guarantee to a seam that is optional.
- **Route (d) is not available.** Threading the union into `:1957` and leaving
  the diagnostics discarded — the one-line change — replaces the callee's whole
  callable set with `EMPTY_CALLABLE_SET` (`:1958`) at dispatch with nothing on
  any channel. See constraint 1.

Constraints on any route:

1. **No route may silently empty a callee's callable set.** 0110 §Fix
   constraint 5, inherited verbatim and now the governing constraint.
   `parseCalleeTheta` reads only `toolResult.callableSet` and discards
   `toolResult.diagnostics` (`:1957–1958`); an error-severity `tools:`
   diagnostic returns `{ diagnostics }` with no `callableSet` key (`:1560–1562`).
   A rejection surfaced into that return path is a whole-set narrowing with no
   observable, which is worse than the gap it closes. Any route that emits from
   `resolveThetaToolsAtLoad` on the nested call site must carry the diagnostic to
   a named drain in the same change, and the witness must assert the callee's
   other callables survive.
2. **Containment precedes every rule derived from the callee's contents, at
   every depth.** 0110 §Fix constraint 1's discipline, one level in: an escaping
   nested entry attracts its containment rejection and no content-derived
   diagnostic naming the same callee. `parseCalleeForTools` already encodes this
   for depth 0 by returning neutral `mode` / `hasErrors` beside `escape`
   (`:1730–1735`), and its V15f skip (`:1503`) is currently dead on the nested
   path; whichever route lands must state whether that guard becomes live.
3. **The resolution primitive stays `checkInvokePathAtLoad`.** `realpath` on both
   sides plus the segment-boundary predicate
   (`src/runtime/invocation.ts:98–126`, `:142–147`); INV-1 requires identical
   semantics at every load-time site. Call it; do not reimplement it and do not
   substitute `resolvePath`. The junction witness the 0110 fix established
   (a directory junction inside the root pointing outside it) is plantable on the
   reporting host and must be replanted for the nested path — a nested entry
   `./farlink/x.theta` bare-resolves inside the root while its `realpath` lies
   outside it.
4. **The runtime re-check stays.** `#recheckCalleeContainment` is the defence
   for a callee not statically resolvable at load, for a symlink swapped between
   load and invocation, and for the currently-active-root semantics
   `invocation.md:12` pins to invocation time. Any route adds a gate; none
   removes it. `tests/invocation-core.test.ts` stays green unmodified. If a route
   also makes the re-check emit its dropped diagnostic, that is an addition to a
   second channel, not a change to the `Err`.
5. **GOV-15: the refused set is enumerated and the census re-run.** An escaping
   nested entry loads cleanly today (measured: the caller registers, zero
   error-severity diagnostics), so it sits inside GOV-15's loads-cleanly input
   set (`source-language-stability.md:9`) and the change is covered by the
   diagnostic-registry carve-out (`:25`). The carve-out is not the whole answer
   and does not have to be: `tool-calls.md:14` already prescribes this rejection.
   Measured blast radius at `6093597c`: **zero** — 34 committed
   `.theta` / `.thetalib` files, 14 with `tools:`, 5 with a `tools:` `.theta`
   entry, and **zero** of those five callees declaring a `tools:` `.theta` entry
   of their own. Re-run the census at the fix baseline as a measured claim, and
   extend it to entries synthesised as TypeScript string literals in `tests/`.
6. **Test witness — offline, provider-free, both directions.** Every cell in
   §Reproduction settles inside one `discoverAndComposeFixtures` over a planted
   workspace, plus — for the dispatch arms — one `fixture.run("", ctx)` through
   the prompt→prompt in-process invoke cell with the `theta-system-note` channel
   read off the fake `pi.sendMessage`. Required: the nested escaping entry drawing
   the containment report on whichever channel the route chooses; the nested
   in-root control unaffected; the depth-0 cells of
   `tests/tools-entry-containment.test.ts` unchanged, which pins that the fix
   added a call site rather than moved one; arm 6's two-depth disagreement
   resolved in the direction the route chooses, with both halves asserted; the
   nested callee's **other** callables still present in its snapshot (constraint
   1); arm 5's no-minting contrast retained so a later regression to a quieter
   silence reds; the junction cell from constraint 3; and every expected message
   substituted from the registry *Message* column per DIAG-4. Prove the red
   direction once by reverting the new call and confirming the nested cells red,
   then restore byte-exact.
7. **Same-commit documentation reconciliation.** Whichever route lands,
   `src/extension/invoke-static-checks.ts:613–623` ("The `tools:`
   `.theta`-entry surface's containment is judged upstream, at `tools:`
   resolution time") and the three call-site comments that record the omission
   as deliberate (`production-composition.ts:1443–1450`, `:1703–1706`,
   `:1949–1956`) state the current invariant and must state the new one instead.
   Route (c) additionally moves `invocation.md` and `tool-calls.md` prose and
   must reconcile `invocation.md:20`'s transitive-walk clause with the scoping it
   introduces.
8. **Coordinate on `src/extension/production-composition.ts`.**
   [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) is open
   with a settled two-condition edit in the same file. Whichever lands second
   re-derives its `path:line` citations and re-runs the other's witness. Do not
   refresh unrelated test-file citations in passing — corpus-wide stale citations
   are bug 0069 residual 5, and 0110's fix already had 13 such edits reverted.

## Provenance

- Origin: the bug 0110 fix (0.66.0, HEAD `6093597c`), §Fix (0.66.0)
  *Residuals* item 1
  ([0110](./0110-theta-callable-tools-entry-no-load-time-containment.md)), which
  records the gap, its reason, and the constraint that forbids the obvious fix.
  This report is that filing. What it adds beyond the residual: the nested arm
  measured at load *and* at dispatch through the shipped composition root; the
  identification of which runtime branch renders the `Err` (arm 4's relative
  spec); the no-minting contrast (arm 5) that shows the fallback observable is
  quieter than the status quo; the two-depth disagreement over one file (arm 6);
  the differential that isolates the `activeRoots !== undefined` gate; the
  finding that `#recheckCalleeContainment` discards the diagnostic half of its
  own verdict, so the runtime path delivers one of INV-1's two channels; the
  `invocation.md:20` / `implementation-notes.md:16` transitive-walk clauses,
  which answer the nesting question and name the diagnostic's destination; the
  unwired `runStaticResolutionPass`; and the nested-depth corpus census.
- Spec: `docs/spec_topics/tool-calls.md:3` (the callable set is what the model
  sees), `:14` (§"Argument shape" — the containment sentence naming
  `theta/load/invoke-path-escape` and "the callable is not created"), `:46`
  (§"Relationship with `invoke`"); `docs/spec_topics/invocation.md:12`
  (§Resolution — the `tools:` entry clause, the mandatory `realpath` step, the
  two-channel escape report and why the parent's `Err` cannot substitute, the
  currently-active-roots rule), `:14`, `:16` (the INV-1 seam naming "`tools:`
  `.theta` entry registration" as a load-time call site and requiring both
  channels), `:20` (§Static resolution — the transitive walk across a callee's
  own `.theta` `tools:` entries and the entry theta's drain), `:22` (the
  per-surface severity split), `:36` (INV-5 — envelope propagation, not
  containment); `docs/spec_topics/implementation-notes.md:16` (§"Static-resolution
  load pass"); `docs/spec_topics/diagnostics/code-registry-load.md:33` (the
  `theta/load/invoke-path-escape` row — *Sev* `E`, *Phase* `load, runtime`,
  *Trigger*, *Message*, *Hint*), `:38` (the `theta/load/callee-has-errors` row
  naming the per-load-pass static-resolution walk);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/diagnostics/placeholder-rendering-b.md:9`
  (category 5 `<path>` and its `tools:`-entry arm);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  Plan: `docs/plan_topics/coverage-matrix.md:92` (`INV-1 | V15a`).
  User-facing: `docs/reference/diagnostics.md:172` (the mirror table's header —
  no *Trigger* column), `:198` (the mirrored row);
  `docs/reference/discovery-cli.md:230–236` (§Resolution, stated for
  `invoke(...)`).
- Implementation evidence at `6093597c`:
  `src/extension/production-composition.ts:401` (`runComposePass`'s `sink`
  parameter), `:499–501` (the `activeRoots` derivation), `:620`
  (`emitDiagnostic: sink.emit`), `:623–627` (the `parseCallee` closure wiring
  `parseCalleeTheta`), `:690–709` (call site 1 and its error-severity
  `continue`), `:743` (`checkInvokeStaticResolution`'s call site), `:1421`
  (`EMPTY_CALLABLE_SET`), `:1434–1452` (`resolveThetaToolsAtLoad`'s signature
  with `activeRoots?` at `:1451` and the omission documented at `:1443–1450`),
  `:1470–1478` (the per-spec `parseCalleeForTools` pre-parse), `:1479–1495` (the
  escape-diagnostic push loop), `:1497–1514` (the V15f loop and its
  `callee.escape === undefined` skip at `:1503`), `:1551–1562`
  (`resolveCallableSet`, the `registered` predicate, and the
  `{ diagnostics }`-only return), `:1679–1751` (`parseCalleeForTools`: `:1686`
  the resolve, `:1687–1690` the read, `:1703–1706` the omission comment, `:1707`
  the gate, `:1715–1720` `checkInvokePathAtLoad`, `:1730–1735` the escape
  return, `:1739` the parse, `:1749` the `hasErrors` derivation), `:1912–1959` (`parseCalleeTheta`: `:1949–1956` the
  omission comment, `:1957` call site 2, `:1958` the discard);
  `src/extension/production-theta-producer.ts:3096` (`thetaCalleePath`'s
  `./<name>.theta` fallback), `:3172–3216` (`#driveCallee`, `:3203` the
  re-check, `:3204–3206` the `makeErr`, `:3207` the `parseCallee` call,
  `:3208–3216` the load-failure `Err`, whose `callee_path` at `:3212` is the spec
  as written), `:3235` (the prompt→prompt in-process cell §Reproduction's
  dispatch arms use),
  `:3326–3347` (`#recheckCalleeContainment`, `:3331–3333` the seams-absent
  early return, `:3340` the re-check call, `:3346` the discarded diagnostic);
  `src/runtime/invocation.ts:50` (the code), `:57`
  (`invokePathEscapeMessage`), `:98–126` (`checkInvokePathContainment`),
  `:142–147` (`canonicalizePath`), `:185–201` (`checkInvokePathAtLoad`),
  `:208–215` (`invokePathEscapeDiagnostic`), `:239–265`
  (`recheckInvokePathAtRuntime` and its both-channels return), `:270–341` (the
  static-resolution walk: `:277–284` `ParsedCallee` with `toolThetaPaths`,
  `:310` `runStaticResolutionPass`, `:331–337` the edge walk);
  `src/extension/invoke-static-checks.ts:28` (the INV-5 label), `:613–623` (the
  doc comment asserting the surface's containment is judged upstream), `:680`
  (the `invoke(...)` surface's caller-side `site` for `checkCalleeHasErrors`);
  `src/parser/invoke-diagnostics.ts:494` (`checkCalleeHasErrors`), `:504` (its
  per-surface severity split).
  Grep-derived claims: `grep -rn resolveThetaToolsAtLoad src/` (eight hits: two
  call sites, `production-composition.ts:690` and `:1957`; the definition at
  `:1434`; and five comment mentions — `:616`, `:750`, `:2104`,
  `invoke-static-checks.ts:753`, `production-theta-producer.ts:326`);
  `grep -rn runStaticResolutionPass src/` (the header comment and the definition
  only); `grep -rn recheckInvokePathAtRuntime src/` (one import, one call);
  `grep -rn activeRoots src/discovery/` (empty).
- Test and corpus evidence at `6093597c`:
  `tests/tools-entry-containment.test.ts` (bug 0110's witness and the harness
  §Reproduction reuses; `grep -n nested` returns nothing);
  `tests/invocation-core.test.ts:139–158` (the both-channels cell, asserted on
  the checker's return value), `:159–175` (the removed-root fail-closed cell),
  `:221`, `:230` (the two `runStaticResolutionPass` cells — the walk's only
  driver); `tests/tool-arg-runtime-schema-validation.test.ts:157–171` (the
  fixture-snapshot reader §Reproduction reuses);
  `tests/production-tools-load-resolution.test.ts`,
  `tests/theta-callable-call-arity.test.ts` (the two shipped `tools:` /
  `.theta`-callable load witnesses, no nested callee in either);
  `grep -rln 'invoke-path-escape\|INVOKE_PATH_ESCAPE' tests/` (three files, none
  nested); the corpus census —
  `rg --files --glob '*.theta' --glob '*.thetalib'` (34 files),
  `rg -l '^tools:'` (14), `rg -n '^\s*-\s*\S*\.theta'` (5 entries in
  `docs/examples/`), and each of those five callees read at HEAD
  (`review-lens.theta` `tools: - read`; `ralph-step.theta` `tools: - read` /
  `- bash`; `reviewer.theta`, `sentiment.theta`, `summarise-doc.theta` no
  `tools:`) — zero nested `.theta` entries.
- Reproduction: one scratch vitest at `6093597c` — two `mkdtempSync` workspaces
  and a third, undiscovered `mkdtempSync` directory holding five out-of-root
  callees; six arms over the shipped `discoverAndComposeFixtures`, three of them
  driven to dispatch through the registered fixture's own `run("", ctx)` handler
  on the prompt→prompt in-process invoke cell; observables quoted verbatim
  above (registered sets, frozen `callableSet` snapshots, `ctx.ui.notify`
  strings, and `pi.sendMessage` `theta-system-note` payloads). Run on the output
  quoted, then deleted per scratch policy. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug doc are unmodified by this filing.

## Fix (0.206.0)

**Route adjudication (§Fix was deliberately unsettled; "the choice is left to
the run").** Route **(a), minimum honest form, `tools:`-surface scoped** —
reach the nested `tools:` `.theta` entries of a discovered theta's `tools:`
callees at the *caller's* load, judge containment there, and let the existing
error-severity path un-register the caller. Route (b) was ruled out **by
measurement, not by preference**: a throwaway prototype threaded the union into
`parseCalleeTheta` and dropped only the escaping entry from the nested
snapshot; a positional-argument call to the excluded name is then reclassified
by `#classifyCall` as a Pi-tool call, `lowerToolCallParams` throws
`PiToolArgShapeDefectError`, and the caller's note reads
`Err(InvokeInfraError { cause: "internal_error" })` — worse than both the
status quo (`load_failure` naming the escaping path) and this report's own
predicted worst case for route (b) (arm 5's `unknown-identifier`). Repairing it
needs `#classifyCall` / `thetaCalleePath` in `production-theta-producer.ts`,
outside the region this run owns. Route (c) was not taken: it requires the spec
edits and the runtime-diagnostic change this report's §Fix enumerates as its
three standing objections. Route (d) remains forbidden by constraint 1. Route
(a) dissolves constraint 1 rather than working around it — no callable is
created at any depth, and no callable set is emptied.

- **What shipped:**
  - `src/extension/production-composition.ts` — new `CalleeParse`
    `nestedToolsEscapes` field; new helper `checkNestedToolsContainment`, which
    resolves each of a `tools:`-reached callee's own `tools:` `.theta` entries
    against the *callee's* directory (absolute specs stay absolute; empty specs
    and `isBareToolName` names routed away exactly as the depth-0 loop routes
    them) and judges each with the shared primitive `checkInvokePathAtLoad`
    (§Fix constraint 3), `literalPath` being the nested spec **as written**
    (`placeholder-rendering-b.md` category 5). `parseCalleeForTools` calls it
    only for a callee that passed its own containment check and parsed to
    non-null frontmatter, so an escaping or unreadable callee's bytes are still
    never inspected (§Fix constraint 2). `resolveThetaToolsAtLoad` drains the
    field in the **same loop** that already drains depth-0 escapes — strictly
    before the V15f callee-has-errors loop — stamping
    `file: parsed.sourcePath` / `range: TOOLS_DIAGNOSTIC_RANGE`, at the
    registered `E` severity, so the caller un-registers through the existing
    `registered` predicate with no new registration mechanism. A `realpath`
    rejection uses the same rejection-to-`undefined` idiom the depth-0 gate
    uses, never a broad `catch`.
  - `src/extension/production-composition.ts` — §Fix constraint 7
    reconciliation of the four comments that asserted the old invariant:
    `resolveThetaToolsAtLoad`'s `activeRoots` parameter, `parseCalleeForTools`'s
    gate, `parseCalleeForTools`'s own doc comment, and `parseCalleeTheta`'s
    "No `activeRoots` argument" comment — which now states why passing no union
    is *correct* for a `tools:`-reached callee rather than a deliberate gap, and
    names the residual.
  - `src/extension/invoke-static-checks.ts` — **comment-only**, and
    deliberately **line-neutral** (file back to 1168 lines, tail byte-identical
    from line 790): `checkInvokeStaticResolution`'s INV-5 bullet now carries the
    depth qualifier and names the invoke-reached residual. Line-neutrality is
    load-bearing, not cosmetic: bugs 0130, 0137, 0144, 0146, 0147 and 0173 all
    cite this file by line in the shifted region, and §Fix constraint 8 forbids
    refreshing unrelated citations.
  - `tests/nested-tools-entry-containment.test.ts` — **new**, the offline
    witness (29 tests, 10 cells).
  - `tests/live/live-production-acceptance.test.ts` — **additive only**
    (+165/−0): a new H8a-U `describe` block beside the existing bug-0110 H8a-T
    block.
  - **No registry edit and no `docs/reference/diagnostics.md` edit.** DIAG-2
    confirmed against the row as written rather than assumed: the
    `theta/load/invoke-path-escape` *Trigger* ("An `invoke(...)` literal or a
    `tools:` `.theta` entry resolves (post-realpath) to a path that lies
    outside every active discovery root") names the entry **kind**, not its
    **depth**, so it already licenses this emission. *Phase* is already
    `load, runtime`; *Sev* is already `E`. No new registered code.
- **Gates:** witness `29 passed (29)`; full default suite
  `Test Files 388 passed (388)` / `Tests 8037 passed (8037)` (baseline
  387/8008 plus the new file's 1/29, zero red); `npm run typecheck` clean;
  `npm run lint` clean; `citation-symbol-form-gate`,
  `registry-closed-set-corpus-gate` and `committed-fixture-parse-gate`
  `45 passed (45)`. Protected locks green and unmodified at their pre-change
  counts: `tools-entry-containment` (37 — bug 0110's depth-0 cells, which pin
  that this fix **added** a call site rather than moved one),
  `production-tools-load-resolution` (50, additive-only invariant intact),
  `invocation-core` (10, unmodified — §Fix constraint 4),
  `theta-callable-call-arity` (39), `tools-field-shape-refusal` (37),
  `tools-field-zero-entry-scalar-refusal` (51),
  `committed-fixture-parse-gate` (36).
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — **CLEAN**, no findings,
  with the diff read symbol by symbol, the red direction independently
  re-proved by neutering `checkNestedToolsContainment`, and eight adversarial
  input shapes reasoned from source (self-naming/cycle entry; a `.thetalib`
  nested entry; one callee reached from two callers; two relative spellings of
  one target; an `as` rename; a non-existent nested file, which correctly draws
  **no** escape because `canonicalizePath` rejects on ENOENT and so keeps its
  `unresolvable-theta-path` flavour; a directory target; depth 3+, which is
  covered hop-by-hop because a `tools:`-reached callee is necessarily
  subagent-mode and its child's own compose pass threads the union). Three
  non-blocking residuals raised, recorded below. A **pre-review correction
  round** ran before round 1 (it is not a review round and does not consume the
  cap): the first implementation shifted `invoke-static-checks.ts` by +6 lines
  and then edited a third file (`tests/wire-translation-inbound-retag.test.ts`)
  to chase the shift; both were undone — the comment was rewritten
  line-neutrally and the test file restored byte-exact
  (`git hash-object` `a9e59fbd…` == `git rev-parse HEAD:…`).
- **Verification:** SOLID on three of four obligations, with the fourth
  reported as a harness limitation rather than papered over.
  - *The witness genuinely witnesses the bug*: `checkNestedToolsContainment`
    neutered to an immediate `return undefined`, witness re-run →
    `9 failed | 20 passed (29)`, the reds being exactly cells 1, 3b, 4 and 5
    with the bug's own symptom text (the caller registering; no message naming
    the escaping entry). Restored by writing the pre-edit byte copy back —
    `git hash-object` `9e451ebf…` identical before and after — then
    `29 passed (29)`.
  - *Full default suite green*: quoted above.
  - *A live test exercises the fixed path, run for real*: the new H8a-U cell
    ran green under the live config against a real provider
    (`Tests 1 passed | 87 skipped (88)`), planting a caller whose `tools:`
    entry names an in-root **undiscovered** nested callee whose own `tools:`
    entry escapes, and asserting non-registration plus the registry-sourced
    escape message naming the nested spec. Guard cells re-run in the same lock
    session and unflipped: bug-0110's H8a-T block,
    `tools-field-shape-refusal-live-cell` (bug 0104),
    `tools-field-zero-entry-scalar-refusal-live-cell` (bug 0206).
    `permitted-codes.json` untouched — no new or newly-reachable code fired on
    a real H9a run, because no H9a run occurred. The red direction for the live
    assertion was proved **offline**, by the neuter-and-restore cycle over
    `checkNestedToolsContainment` — the identical helper the live cell
    exercises — rather than by a second lock acquisition.
  - *Lint and typecheck*: clean, quoted above.
- **Residuals:**
  1. **A callee reached by an `invoke(...)` literal keeps the status quo.**
     Route (a)'s minimum honest form is `tools:`-callee scoped, so the nested
     `tools:` entries of an *invoke*-reached callee are still judged only by
     the runtime open-time re-check. §Reproduction arms 3, 4 and 5 therefore
     keep their measured behaviour, and this is **pinned deliberately** by
     cells 8 and 9 of `tests/nested-tools-entry-containment.test.ts` so a later
     change to it reds rather than passing silently. Bounded by the same cause
     as every other depth-1 load-time rule: `runStaticResolutionPass`
     (`src/runtime/invocation.ts`) has no production call site, which
     §Non-goals scopes out.
  2. **`#recheckCalleeContainment` still discards `verdict.diagnostic`**
     (`src/extension/production-theta-producer.ts`), so the runtime channel
     still delivers one of INV-1's two channels. Unchanged and unclaimed here —
     it is this report's own §Non-goal, is a defect of the re-check on *both*
     call surfaces, and remains unfiled.
  3. **No H9a `tests/live/acceptance/` cell is possible for this observable
     class.** Route (a)'s observable is "a discovered caller did not register",
     and `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` records
     (in its header, lines 30–33) the measurement that an unregistered slash
     makes `pi -p` hang with zero bytes on both streams — identically to a
     control slash no extension ever registered — so it is a host-level
     property of unknown slashes in print mode, not an observable.
     Independently confirmed: bug 0110, whose headline observable is
     structurally identical, has **no** `tests/live/acceptance/` cell either.
     H8a is the live channel for this class, exactly as for 0110. A future H9a
     harness change that lets print mode report an unregistered slash without
     hanging would unblock an H9a cell for 0110 and 0111 together.
  4. **The V15f `callee.escape === undefined` guard's liveness is unchanged**
     (§Fix constraint 2 requires this to be stated). A nested escape attaches
     to `nestedToolsEscapes`, never to `CalleeParse.escape`, and
     `parseCalleeTheta` still passes no union — so the guard stays live for
     depth-0 escapes on the discovered pass and stays dead on the dispatch
     parse. It did **not** become live on the nested path.
  5. **Two relative spellings of one nested target draw two identical
     diagnostics.** The `calleeCache` is spec-keyed, so a caller naming one
     callee two ways runs `parseCalleeForTools` twice. This mirrors depth-0
     behaviour exactly (that cache is spec-keyed too), so it is consistency
     rather than a defect; no cell pins it.
  6. **GOV-15 census, re-run at this baseline as a measured claim** (§Fix
     constraint 5): 34 committed `.theta` / `.thetalib` files, 14 declaring
     `tools:`, 5 declaring a `tools:` `.theta` entry (`refine.theta`,
     `fan-out-reviews.theta`, `typed-params-across-boundary.theta`,
     `typed-return.theta`, `ralph.theta`). Each of those five callees read:
     `reviewer.theta`, `summarise-doc.theta` and `sentiment.theta` declare no
     `tools:`; `review-lens.theta` declares `tools: - read`; `ralph-step.theta`
     declares `tools: - read` / `- bash` — bare Pi-tool names, routed away by
     `isBareToolName` before any nested judgement runs. **Zero** of the five
     declares a `tools:` `.theta` entry of its own. Extended to entries
     synthesised as TypeScript string literals in `tests/`: every pre-existing
     fixture plants at most one level, so the only nested fixtures in the tree
     are this fix's own witness plants. **Measured blast radius of the new
     refusal: zero committed files, zero pre-existing test fixtures.** The
     no-shipped-source-moves half is discharged mechanically by
     `tests/committed-fixture-parse-gate.test.ts` (36 green), not by a scratch
     probe.
  7. **§Fix constraint 8 coordination is live.** Bug
     [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) is
     open with a settled edit in `src/extension/production-composition.ts`.
     This change adds roughly +122 net lines to that file, so every
     `path:line` citation into it below the insertion points is shifted. No
     corpus-wide citation sweep was performed — constraint 8 forbids it in
     terms ("0110's fix already had 13 such edits reverted"), and corpus-wide
     stale citations are bug 0069 residual 5. Whichever of 0109 / 0111 lands
     second re-derives its own citations in this file and re-runs the other's
     witness.
- **Discharge notes appended:** none. No sibling bug document was edited; the
  0109 coordination clause above is recorded here rather than in 0109.
- **Pinned dispositions / non-goals:** the discovered-theta pass's depth-0
  containment check is unchanged (bug 0110's fix is untouched, its 37-cell
  witness green and unmodified); `checkInvokePathAtLoad` and
  `recheckInvokePathAtRuntime` (`src/runtime/invocation.ts`) are unchanged;
  `#recheckCalleeContainment` and the whole runtime re-check are unchanged
  (§Fix constraint 4) and `tests/invocation-core.test.ts` is green and
  unmodified; `runStaticResolutionPass` is still unwired (§Non-goals); the
  `theta/load/invoke-path-escape` *Message* text is unchanged (DIAG-4 defers a
  reword to theta 2.0); the INV-5 label drift in the source comments is
  unchanged (0110 §Fix residual 4); `docs/plan_topics/coverage-matrix.md` gains
  no row for the `tools:` surface's load-time containment (0110 §Fix
  residual 6, still open at both depths).
