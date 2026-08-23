# Bug 0131 — An in-document `fn` call's argument count is checked at no parse seam: `fn f(p: integer) { 1 }` called with three arguments draws `[]`, and the only enforcement anywhere is a runtime `ThetaFnArityError` that reports an ordinary authoring mistake through `theta/runtime/internal-error` — the runtime-defect surface `error-model.md:74` defines as one "no theta expression 'causes'" — while inside a `par for` body ERR-20's downgrade turns the same mistake into a discardable element `Err` with zero diagnostics; no registry row's *Trigger* names the position, though `grammar.md:143` routes every `fn` parameter into invocation.md's argument-arity count and `placeholder-rendering-b.md:132` names a `.thetalib` `fn` callee as an emitting arm of `theta/parse/invoke-arity-too-few`

- **Status:** fixed (0.199.0). §Fix was constraint-pinned, not settled: this report
  existed to pin the registry disposition before any code landed, and the
  disposition is now taken and recorded in §Fix (0.199.0) below. Ordering
  dependency —
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) (open)
  owns the argument-**type** judgement at this same `fn` boundary, and
  `invocation.md:48` requires arity to be decided **before** per-argument type,
  so the two cannot be wired independently: whichever lands second inherits the
  other's suppression channel. Neither report's disposition is chosen yet.
- **Sev/Diff estimate:** S2/D3 — the dominant disposition is a loud but
  mis-attributed failure (the theta registers, dispatches, runs, then aborts
  under the interpreter-defect code with `internal error: …`), not a silent
  accept; one measured cell is S1-shaped and narrow (a discarded `par for` body
  swallows the mismatch entirely, zero diagnostics on any channel). D3 because
  §Fix needs an in-run DIAG-2 adjudication whose only no-new-row route collides
  with DIAG-4 on two frozen *Message* templates and one frozen *Hint*, the check
  splits across a parser-visible surface and a cross-file one, it lands on the
  shared call-site walk two fixed reports own (0071, 0072), and it is ordered
  against 0050.
- **Kind:** a specified obligation with no registered row for the position it
  names, plus a defect against existing normative text at the one place
  enforcement does happen. Three elements:
  1. **The corpus routes a `fn` parameter list into the arity count, and no row
     covers it.** `docs/spec_topics/grammar.md:143`: "a `fn` parameter carries no
     default …, so **every `fn` parameter is non-defaulted for the argument-arity
     count** at [Invocation — Argument arity]".
     `docs/spec_topics/diagnostics/placeholder-rendering-b.md:132` names an
     emitting arm of one of those codes whose callee is a `fn`: "a `.thetalib`
     `fn` callee renders as the source-text path the `import` declared". Both
     arity rows' *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:118`, `:119`) admit
     only "`invoke(...)` or `.theta` callable call" and count "non-defaulted
     `params:`" — a construct a `fn` does not have.
  2. **No parse seam evaluates the count.** Measured at HEAD: every cell of the
     declared-vs-provided matrix (0 vs 1, 1 vs 0, 1 vs 3, 3 vs 1) draws `[]`.
     `checkLexicalCallSites` (`src/parser/theta-document.ts:5288`) resolves every
     `<name>(args)` callee and already collects the file's `fn` declarations
     (`:5306–5320`), and emits nothing about argument count;
     `checkInvokeStaticResolution` (`src/extension/invoke-static-checks.ts:649`)
     runs `checkInvokeArity` over the `invoke(...)` and `.theta`-callable
     surfaces only (`:725–741`, `:750–796`);
     `checkSubagentFnStaticResolution`
     (`src/extension/subagent-fn-static-checks.ts:236`) covers cycles and
     callee-has-errors only.
  3. **The one enforcement mis-attributes the failure.** `ThetaFnArityError`
     (`src/runtime/statement-executor.ts:364`) is thrown at all three user-`fn`
     call evaluation sites and routes through `surfaceUnexpectedThrow` to
     `theta/runtime/internal-error`. `error-model.md:74` defines that surface as
     *unexpected interpreter exceptions* and states "They are not a new authoring
     concept (no theta expression 'causes' one)". `f(1, 2, 3)` causes one. The
     class's own doc comment (`:357–362`) states the invariant the parse seam does
     not establish: "Arity is a type-phase concern the theta grammar expects to be
     well-formed by execution time, so a mismatch reaching the runtime is a
     defect".
- **Related:**
  - [0071](./0071-theta-callable-call-arity-unchecked.md) — **fixed (0.64.0)**,
    the adjacent surface and the plumbing template. **It is not this defect.**
    0071's subject is the `.theta`-callable call form (`<name>(args)` for a
    `tools:` `.theta` entry) — resolution arm (4) of
    `docs/spec_topics/expressions.md:49` — whose callee is a separate file with
    its own `params:`. This report's subject is arms (2) and (3) of the same list
    (`:47`, `:48`): a top-level `fn` in the same file, and a symbol imported from
    a `.thetalib`. 0071's fix wired `checkInvokeArity` for arm (4) and exported
    the collector a fix here would reuse (`collectThetaCallableCallSites`,
    `src/extension/invoke-static-checks.ts:308`); it left arms (2)–(3) untouched
    by design, and its §Non-goals keeps it on its own callee class.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, the **type** half of this same boundary, and the ordering
    dependency. It owns whether an argument's static type is checked against the
    declared parameter type (`checkFnArgCompat`, `src/parser/type-compat.ts:452`,
    still no `src/` caller at HEAD — verified). **It does not cover arity, and
    says so twice**: its §Affected *Not affected — arity* bullet and its
    §Non-goals bullet *Parse-time arity for a plain `fn` call* ("No registry row
    covers it, so its silence is a registry question, not a divergence. `f()` and
    `f(3, 4)` against a one-parameter `fn` load clean and throw
    `ThetaFnArityError` … at runtime"). This report is that registry question,
    measured. It is **not** a duplicate of 0050 and closure as one is not
    warranted: different judgement (count against type), different missing
    registry standing (0050 has a row whose *Trigger* names the position and no
    emitter; here no row names the position at all), and a disposition 0050
    explicitly declines to take.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, the machinery an in-document `fn` call does **not** pass through.
    Measured at HEAD: `f({a: 1}, {b: 2})` at a `fn` callee draws two
    `theta/parse/bare-object-literal` and no `theta/parse/tool-arg-arity`; the
    arity arm 0072 wired is gated on `resolvesToPiTool`
    (`src/parser/theta-document.ts:5455–5460`) and its message reads "Pi tool
    '<name>' takes a single object argument". 0072's runtime AJV net
    (`#checkPiToolArgSchema` inside `#resolveToolCall`) is on the Pi-tool
    dispatch path, which a user-`fn` call never enters — `resolveUserFn`
    (`src/runtime/statement-executor.ts:377–380`) routes arms `"fn"` / `"import"`
    to `evalUserFnCall`, off the effect path entirely.
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, the
    transferable mechanism. Its fix hooked the **expression** walk rather than
    the statement walk so that statement, expression, loop-body and `fn`-body
    positions were covered by one pair of call sites. The position-coverage
    hazard is live here: measured, an arity mismatch is observable in a `let`
    initialiser, an expression statement, a schema-constructor field value, a
    nested argument and a `fn` body — and unobservable inside a `par for` body.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**, the
    GOV-15 precedent this report's carve-out reasoning reuses: a new
    error-severity judgement added at a previously-unchecked position inside a
    1.x minor, under the diagnostic-registry carve-out.
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) —
    **open**, the same family: a stated obligation with no registered row for its
    position, needing a DIAG-2 decision before code. The shapes differ in one
    respect worth stating — 0115's obligation is enforced in neither phase, this
    report's is enforced in one phase under the wrong code.
  - [0118](./0118-nested-fn-result-return-defers-to-runtime-panic.md) — **open**,
    adjacent `par for` blindness. There a parse-phase structural walk has no
    `par for` arm; here the lexical call-site walk **does**
    (`src/parser/theta-document.ts:5570`) and it is the **runtime** that treats a
    `par for` body differently, through ERR-20's downgrade. Disjoint mechanisms;
    both bear on which positions a fix must cover.
- **Affected** (every citation verified at HEAD `76dfde5c`, 0.74.0):
  - **The parse seams that see the call and check no count.**
    - `src/parser/theta-document.ts:5288` — `checkLexicalCallSites`, called once
      at `:873` (before the type layer at `:884`). It resolves every
      `<name>(args)` callee per `expressions.md:44–49` and emits three codes from
      that one judgement. Its pre-collection loop (`:5306–5320`) walks
      `body.statements` and adds each top-level `fn` name (`:5310`) and each
      imported symbol (`:5318`) to `fnImportDecls` — **a name set only**
      (`:5206`), discarding the `FnParam[]` that is in scope at that line. The
      `call` arm (`:5443–5504`) branches on `resolvesToPiTool` (`:5455–5459`);
      neither the Pi-tool arms (`:5460–5489`) nor the else arm (`:5490–5504`)
      inspects `e.args.length` against a declared count. The walk's reach is
      complete over the positions this defect occupies: `case "fn"` enters a
      function body with parameter locals (`:5398–5410`) and `case "par-for"`
      enters a parallel loop body (`:5570`).
    - `src/extension/invoke-static-checks.ts:649` —
      `checkInvokeStaticResolution`. The `invoke(...)` INV-3 block is
      `:725–741`; the `.theta`-callable loop bug 0071 added is `:750–796`, with
      the arity-before-type `continue` at `:790–796`. Both loops iterate
      `collectCallSites` (`:109`) output; the `.theta`-callable loop resolves
      through `resolveThetaCallableCallSites` (`:285`) against the frozen
      snapshot. Neither loop has an arm for a callee that resolved to a `fn`.
    - `src/extension/subagent-fn-static-checks.ts:236` —
      `checkSubagentFnStaticResolution`. Its header (`:1–24`) enumerates its two
      checks: the FN-6 self-reference ban and the broken-inline-body
      `callee-has-errors`. No arity.
    - `src/parser/type-layer-checks.ts:1137–1142` — the type-phase walk's
      `case "call": case "invoke":` arm, which walks the argument expressions and
      relates none of them to a callee signature. This is 0050's site (it cites
      `:1045–1050`, taken at 0.48.0 — position drift only).
    - `src/parser/functions.ts:145` — `resolveFnCall`, the hoisted-`fn`
      resolution helper a same-file check would consult. `rg -n "resolveFnCall"
      src/` returns one line, its own definition; the only other references are
      in `tests/functions-and-return.test.ts` (`:9`, `:36`, `:101`, `:105`).
  - **The declared count, present and unused.**
    `src/parser/theta-document.ts:409–412` — `FnParam { name, type }`, no default
    field; `:474–479` — `FnDecl.params: readonly FnParam[]`. A `fn`'s arity is
    therefore one number (`params.length`), not the `requiredCount` /
    `totalCount` pair `checkInvokeArity` takes
    (`src/parser/invoke-diagnostics.ts:331`).
  - **The runtime, which throws — three sites, one error class.**
    - `src/runtime/statement-executor.ts:356–368` — the doc comment (`:357–362`)
      and `ThetaFnArityError` (`:364`), whose message template is
      `function '<name>' expects <n> argument(s) but received <m>` (`:366`).
    - `:377–380` — `resolveUserFn`, which admits `arm === "fn"` (a hoisted
      top-level `fn`) and `arm === "import"` (an imported `.thetalib fn`) and
      excludes the `callable` arm.
    - `:401–403` — the throw in `evalUserFnCall` (`:395`); `:495` — the same
      throw in `evalSubagentFnCall` (`:488`), placed before the
      `spawnSubagentSession` call and therefore before any child session exists;
      `src/extension/production-theta-producer.ts:5903` — the same throw in the
      synchronous `evaluatePureFnCall` (`:5901`), reached from
      `evaluatePureExpression` (`:5794`) for pure sub-expression positions.
    - `src/extension/theta-composition-producer.ts:477–493` — the top-level
      framing: `surfaceUnexpectedThrow` builds the
      `theta/runtime/internal-error` diagnostic (`:481`) and
      `emitPanicNote` (`:491–493`) emits
      `theta /<slash-name> aborted with internal error: <message>`.
  - **The `par for` cell, where the throw is downgraded instead.**
    `src/runtime/statement-executor.ts:1239–1258` — the ERR-20 iteration-boundary
    catch: a `HostFatal` is rethrown (`:1249–1251`), anything else becomes that
    element's `Err` through `parForPanicError` (`:1182–1191`), which selects
    `cause: "panic"` for a `ThetaPanic` and `cause: "internal_error"` otherwise
    (`:1187`) and sets `callee_path` to the enclosing file (`:1189`).
    `isThetaPanic(new ThetaFnArityError(...))` is `false` — measured — so the
    `internal_error` arm is the one taken.
  - **The registry rows that do not name the position.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:118` —
    `theta/parse/invoke-arity-too-few`, *Trigger* "`invoke(...)` or `.theta`
    callable call passes fewer arguments than the callee's count of non-defaulted
    `params:`, where the callee is statically resolvable"; `:119` —
    `theta/parse/invoke-arity-too-many`, *Trigger* "`invoke(...)` or `.theta`
    callable call passes more arguments than the callee's total `params:` count.
    Always parse-time — no runtime safety net is possible." `:50` —
    `theta/parse/tool-arg-arity`, scoped to "A Pi-tool call site"; `:58` —
    `theta/parse/generic-arity-mismatch`, scoped to type-argument counts. A sweep
    of every row's *Trigger* cell returns no other arity row. `:116` —
    `theta/parse/fn-arg-type-mismatch`, the one row whose *Trigger* does name "A
    plain top-level `fn` call `f(args)` — a same-file or imported `.thetalib`
    function call" — and it is scoped to argument **type** (0050's subject; that
    report cites the row as `:113`, its 0.48.0 position).
  - **The frozen message text a widening would have to render.**
    `src/parser/invoke-diagnostics.ts:112–121` and `:127–133` — both templates
    open with the literal `invoke '<callee>' passes too …`; `:150–152` — the
    too-few *Hint*, "Provide the missing argument(s) or default the corresponding
    `params:` field on the callee". Mirrors:
    `docs/reference/diagnostics.md:167`, `:168` (*Message* only — that page
    carries no *Trigger* column).
  - **The spec text that routes a `fn` parameter into the arity count.**
    `docs/spec_topics/grammar.md:143` (the paragraph under the `FnDecl`
    production at `:135–141`) — the "every `fn` parameter is non-defaulted for
    the argument-arity count" clause. Its user-facing mirror,
    `docs/reference/grammar.md:257–262`, states the no-default rule and **omits
    the arity clause**, so a widening has no mirror sentence to move there.
  - **The spec text that names a `fn` callee for one of the two codes.**
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:132` — the
    *Category 7 `<callee>` fallback* bullet. `invoke(...)` cannot reach a
    `.thetalib` (`code-registry-parse.md:17`,
    `theta/parse/invoke-non-theta-extension`, and
    `src/parser/invoke-diagnostics.ts` renders "invoke path '<path>' does not end
    in .theta"), so the `.thetalib`-`fn` callee that bullet contemplates for
    `theta/parse/invoke-arity-too-few` can only be an **imported `.thetalib` `fn`
    call site** — resolution arm (3). `:55` is §7's `<callee>` rule, carrying the
    `.theta`-callable arm 0071 added.
  - **The spec text that scopes the arity rule the other way.**
    `docs/spec_topics/invocation.md:48` — "Arity is checked **before**
    per-argument type checking"; `:50` / `:51` — the too-few / too-many rules,
    both phrased over "`params:`"; `:53` — "The same arity rules apply to
    `.theta` callable calls through `tools:` entries … Pi tool calls take a
    single object argument and are unaffected", an extension list naming exactly
    one surface. `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` — "The
    same default-vs-non-default partition is what `invoke(...)` and `.theta`
    callable calls use to compute argument arity", likewise two surfaces.
    `docs/spec_topics/tool-calls.md:14` — the §"Argument shape" sentence 0071
    was filed against ("apply equally to a `.theta` callable call").
  - **The runtime surface the throw travels, and its boundary.**
    `docs/spec_topics/errors-and-results/error-model.md:67–72` — the closed
    six-source panic list; `:74` — the runtime-defect surface, its
    "not a new authoring concept (no theta expression 'causes' one)" sentence,
    the `theta/runtime/internal-error` code, the `cause: "internal_error"` arm,
    and the `theta /<name> aborted with internal error: <error.message>`
    template. `docs/spec_topics/diagnostics/code-registry-runtime.md:22` — the
    row, whose *Trigger* opens "The interpreter or an adapter it called threw an
    exception outside the closed theta 1.0.0 panic-source list (a host-function
    `TypeError`, an internal invariant violation, …)".
    `docs/spec_topics/diagnostics/diagnostic-shape.md:58` — the `theta/runtime/*`
    routing bullet. Mirrors: `docs/reference/errors-and-results.md:92–99`,
    `docs/reference/diagnostics.md:247`.
  - **The `par for` downgrade's own spec standing.**
    `docs/reference/errors-and-results.md:120–134` — ERR-20, which owns the
    anchor and is written over **panics** ("A runtime panic raised inside one
    iteration — from any of the six panic sources above") and `cause: "panic"`.
    `docs/spec_topics/control-flow.md:78` — CTRL-5, which cites ERR-20 in the
    same panic-scoped terms. No sentence names the `par for` cell for a
    runtime-defect-surface throw; the implementation's `internal_error` arm rests
    on `error-model.md:74`'s "same routing channels as panics".
  - **The governance rules the fix engages.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1, entitling
    tests to assert the code at every documented site), `:72` (DIAG-2, the closed
    registry; a *Trigger* change is a spec change in the same commit), `:73`
    (DIAG-3, renames deferred to 2.0), `:74` (DIAG-4, the *Message* column is
    normative and a reword is deferred to 2.0).
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15's three
    observables), `:9` (the loads-cleanly predicate — no `E`), `:25` (the
    diagnostic-registry carve-out and its post-hoc in-scope set).
  - **The live gates a newly-reachable code meets.**
    `tests/fixtures/h7a/permitted-codes.json` — 11 entries; it **already**
    carries `theta/runtime/internal-error`, so today's mis-attributed abort is
    permitted by name. Neither arity code is listed.
    `tests/live/acceptance/harness.ts:534–546` — `assertStderrClean`, the
    empty-capture gate (bug 0030's, measured baseline `dd4f3d3b`: 0 bytes on all
    ten H9a spawns); `tests/live/acceptance/noninteractive-acceptance.test.ts:115`
    — `assertCodesSubsetOfPermitted`, called beside it at `:149–150`, `:178–179`,
    `:221–222`.
  - **The tracked corpus, swept.** 34 tracked `.theta` / `.thetalib` (32 + 2).
    Four `fn` declarations — `docs/examples/personas.thetalib:7`
    (`rate_strictness(a: Author)`), `docs/examples/ralph-inline.theta:21`
    (`subagent fn step(objective: string)`),
    `docs/examples/refine-inline.theta:16` (`subagent fn reviewer(draft:
    string)`), `tests/live/acceptance/fixtures/acc-lib.thetalib:3`
    (`tagline()`) — and four `fn` call sites, **every one correct-arity**:
    `docs/examples/import-thetalib.theta:9` (`rate_strictness(reviewer)`, 1/1,
    the imported route), `docs/examples/ralph-inline.theta:39`
    (`step(objective)`, 1/1), `docs/examples/refine-inline.theta:30`
    (`reviewer(draft)`, 1/1), `tests/live/acceptance/fixtures/acc-imports-invoke.theta:9`
    (`tagline()`, 0/0, the imported route). `docs/examples/ralph.theta:12` and
    `docs/examples/refine.theta:13` are `.theta`-callable calls (0071's surface),
    outside this report.
  - **Test coverage of this defect: none.** `rg -n "argument\(s\) but received"
    tests/` returns nothing; `rg -ln "ThetaFnArityError" tests/` returns one file,
    `tests/tool-arg-shape-enforcement.test.ts`, where `:94` names the class only
    as a comparison for a different defect's routing. No test drives an
    arity-mismatched `fn` call in either direction, at either phase.
- **Observed at:** `0.74.0` (HEAD `76dfde5c`). Offline, deterministic; no live
  model, no provider, no file written. Two scratch probes: `parseThetaDocument`
  through `tests/helpers/e2e-s1.ts`'s `parseDoc` for the parse column, and
  `executeBody` over the real `createProductionProducerDeps` /
  `bindPromptConversation` prompt-mode binding (the harness shape
  `tests/non-object-receiver-gate.test.ts:186–290` establishes) plus
  `surfaceUnexpectedThrow` for the runtime column. Written, run, deleted.

## Summary

A `<name>(args)` call whose callee resolves to a top-level `fn` in the same file
or to a symbol imported from a `.thetalib` — resolution arms (2) and (3) of
`expressions.md:44–49` — is subject to no argument-count check at any parse seam.
Measured at HEAD, the whole declared-vs-provided matrix draws zero diagnostics:
`fn f(p: integer)` called with three arguments, with none, a three-parameter `fn`
called with one, and a zero-parameter `fn` called with one.

The count is available where the check would go. `checkLexicalCallSites`
(`theta-document.ts:5288`) already walks `body.statements` to collect every
top-level `fn` name (`:5310`) and then visits every call site, entering `fn`
bodies and `par for` bodies as it goes; it keeps names and discards the
`FnParam[]` on the same node. On the cross-file side the signature is genuinely
absent from the parser, and the compose pass that reads other files
(`invoke-static-checks.ts:649`) has arity loops for `invoke(...)` and for
`.theta`-callable calls and no arm for a `fn`.

Enforcement exists exactly once, at the wrong layer and under the wrong code. All
three user-`fn` call evaluation sites — `evalUserFnCall`, `evalSubagentFnCall`,
and the synchronous `evaluatePureFnCall` — throw `ThetaFnArityError`, which is
not a `ThetaPanic` and therefore lands on the runtime-defect surface as
`theta/runtime/internal-error`. The author's slash surface reads
`theta /p aborted with internal error: function 'f' expects 1 argument(s) but
received 3`. `error-model.md:74` defines that surface as *unexpected interpreter
exceptions* and states in terms that "They are not a new authoring concept (no
theta expression 'causes' one)". The error class's own doc comment
(`statement-executor.ts:357–362`) states the premise that makes this consistent
from the runtime's side — "Arity is a type-phase concern the theta grammar
expects to be well-formed by execution time" — and no type-phase or parse-phase
check establishes it.

Inside a `par for` body the throw does not even reach that surface. ERR-20's
iteration-boundary catch (`statement-executor.ts:1239–1258`) downgrades it to
that element's `Err(InvokeInfraError { cause: "internal_error", message:
"function 'g' expects 1 argument(s) but received 2" })`, the theta's outcome
stays `success`, and no diagnostic is emitted on any channel. When the `par for`
is an expression statement its array of `Err`s is discarded, so the mismatch
produces nothing at all.

The registry standing is the part that has to be settled before code. No row's
*Trigger* names this position: both arity rows (`code-registry-parse.md:118`,
`:119`) admit "`invoke(...)` or `.theta` callable call" and count "non-defaulted
`params:`", which a `fn` has none of. Two sentences elsewhere in the corpus point
the other way — `grammar.md:143` states that "every `fn` parameter is
non-defaulted for the argument-arity count at [Invocation — Argument arity]", and
`placeholder-rendering-b.md:132` names "a `.thetalib` `fn` callee" as a rendering
arm of `theta/parse/invoke-arity-too-few`. That is the adjudication this report
owes.

## Reproduction

Offline, at `76dfde5c`. Two columns per row. **parse** is the whole
`parseThetaDocument` diagnostic list, unfiltered, through
`tests/helpers/e2e-s1.ts:39`'s `parseDoc`. **runtime** is `executeBody` over the
real prompt-mode binding (`createProductionProducerDeps(...).bindPromptConversation`),
with a thrown value passed through `surfaceUnexpectedThrow` to show the code and
message it surfaces. Every fixture is `mode: prompt` with no `tools:`, no query
and no provider.

### The declared-arity × call-arity matrix

```
m-1v3   fn f(p: integer): integer { 1 }        + let r = f(1, 2, 3)
   parse   []
   runtime THREW ThetaFnArityError panic=false -> theta/runtime/internal-error:
           "internal error: function 'f' expects 1 argument(s) but received 3"
m-1v0   fn f(p: integer): integer { 1 }        + let r = f()
   parse   []
   runtime THREW ThetaFnArityError panic=false -> theta/runtime/internal-error:
           "internal error: function 'f' expects 1 argument(s) but received 0"
m-3v1   fn f(a: integer, b: integer, c: integer): integer { 1 } + let r = f(1)
   parse   []
   runtime THREW ThetaFnArityError panic=false -> theta/runtime/internal-error:
           "internal error: function 'f' expects 3 argument(s) but received 1"
m-0v1   fn f(): integer { 1 }                  + let r = f(1)
   parse   []
   runtime THREW ThetaFnArityError panic=false -> theta/runtime/internal-error:
           "internal error: function 'f' expects 0 argument(s) but received 1"
```

Controls, both directions of the count:

```
ctl-1v1 fn f(p: integer): integer { 1 } + let r = f(1)
   parse []   runtime {"outcome":"success","result":{"present":true,"value":1}}
ctl-0v0 fn f(): integer { 1 }           + let r = f()
   parse []   runtime {"outcome":"success","result":{"present":true,"value":1}}
```

`panic=false` is `isThetaPanic(thrown)`, measured: the throw is not one of the
six closed panic sources, so `surfaceUnexpectedThrow` routes it to the
runtime-defect code rather than to a panic code. The top-level framing composed
from the same diagnostic is
`theta /p aborted with internal error: function 'f' expects 1 argument(s) but
received 3` (`theta-composition-producer.ts:491–493`).

### The parse column is silent in every syntactic position, and for `subagent fn`

```
fn f(p: integer): integer { 1 }        + f(1, 2, 3)              [statement] -> []
fn f(p: integer) { 1 }                 + f(1, 2, 3)     [no return annot.] -> []
fn f(p): integer { 1 }                 + f(1, 2)  [unannotated param]     -> []
subagent fn f(p: integer): integer { 1 } + let r = f(1, 2, 3)?           -> []
fn f(p: integer): integer { f(1, 2) }  + 1              [self-recursive] -> []
import { helper } from "./x.thetalib"  + helper(1, 2, 3)                 -> []
```

The `fn f(p: integer) { 1 }` / three-argument row is the form bug 0095's fix
record measured (residual 4); it reproduces byte-identically at HEAD. The
unannotated-parameter row establishes that the silence is not the
unresolvable-operand deferral `type-system.md:48` grants the type judgement — a
count needs no operand types.

### The runtime throws from every position except one

```
let initialiser        fn f(p: integer): integer { 1 }  + let r = f(1, 2, 3)   THREW
expression statement   fn f(p: integer): integer { 1 }  + f(1, 2, 3)           THREW
schema field value     schema S { a: integer } + fn f(p: integer): integer { 1 }
                       + let o = S { a: f(1, 2) }                              THREW
nested argument        f(g(1, 2))  (both one-parameter)                        THREW g
inside a `fn` body     fn f(p: integer): integer { g(1, 2) } + let r = f(1)     THREW g
`subagent fn` call     subagent fn f(p: integer): integer { 1 } + f(1, 2, 3)?  THREW
plain `for` body       for i in [1] { g(1, 2) }                                THREW g
`par for` body         par for i in [1] { g(1, 2) }                        NO THROW
```

The `subagent fn` row throws before `spawnSubagentSession` is called
(`statement-executor.ts:495` precedes the `try` at `:515` and its
`spawnSubagentSession` call at `:516`), so no child session is created.

### The `par for` cell in full — a discardable `Err`, no diagnostic

```
@@ fn g(x: integer): integer { 1 }
   par for i in [1, 2] { g(1, 2) }                       [expression statement]
   parse   []
   runtime {"outcome":"success","result":{"present":true,"value":[
             {"ok":false,"error":{"kind":"invoke_infra","cause":"internal_error",
              "message":"function 'g' expects 1 argument(s) but received 2",
              "callee_path":"p"}},
             {"ok":false,"error":{"kind":"invoke_infra","cause":"internal_error",
              "message":"function 'g' expects 1 argument(s) but received 2",
              "callee_path":"p"}}]}}
@@ same body, result bound: let rs = par for i in [1, 2] { g(1, 2) } + rs
   identical array of two `internal_error` Errs
@@ control: let rs = par for i in [1, 2] { g(1) } + rs
   runtime {"outcome":"success","result":{"present":true,"value":[
             {"ok":true,"value":1},{"ok":true,"value":1}]}}
```

`outcome` is `success` in all three. The iteration result carries no
`diagnostics` — `collectedDiagnostics` is empty
(`statement-executor.ts:1255–1257`) — so nothing reaches the diagnostic channel
or the system-note channel. In the first form the array is discarded by the
expression statement, and the mismatch is unobservable at both phases.

### A statically unreachable call is never observed at all

```
@@ fn f(p: integer): integer { 1 }
   if false { f(1, 2, 3) }
   7
   parse   []
   runtime {"outcome":"success","result":{"present":true,"value":7}}
@@ fn f(p: integer): integer { 1 }   (never called)      + 7
   parse   []   runtime {"outcome":"success","result":{"present":true,"value":7}}
```

`functions.md:26` (FN-3) states that theta 1.0 "defines no reachability predicate
the type system consumes", so an arity check at the parse seam would judge the
`if false` call while today nothing does. This is one of the input classes §Fix
(f) has to disposition.

### The 0072 machinery does not cover it

```
@@ fn f(p: integer): integer { 1 }   + f({a: 1}, {b: 2})
   parse   error theta/parse/bare-object-literal ×2
           ("bare object literal not permitted in this position; name the
             schema (Schema { ... })")
@@ tools: [read]                     + read({path: "a"}, {path: "b"})   [contrast]
   parse   error theta/parse/tool-arg-arity
           ("Pi tool 'read' takes a single object argument; got 2")
@@ fn f(p: integer): integer { 1 }   + f(1, 2)
   parse   []
```

Two positional arguments at a `fn` callee draw a diagnostic only when they happen
to be bare object literals, and it is the argument-*shape* rule, not a count
rule; with scalar arguments the same call is silent. The count rule 0072 wired is
gated on `resolvesToPiTool` (`theta-document.ts:5455–5459`).

### The callee-resolution control

```
@@ q(1, 2, 3)                        (no declaration anywhere)
   parse   error theta/parse/unknown-identifier: unknown identifier 'q'
```

Callee resolution itself is enforced, so the silence is confined to the argument
count.

## Expected behaviour

Three dispositions are available and the corpus supports them unequally. Which
one governs is this report's deliverable; the classification matters because it
selects the fix's shape.

**Reading A — the corpus already routes this position into the arity rule, and
the registry rows have not kept up.** Two sentences carry it.

`docs/spec_topics/grammar.md:143`, verbatim:

> Each `FnParam` is an `Ident ":" Type` pair: a `fn` parameter carries no default
> (theta 1.0 admits literal-valued defaults only on `params:` frontmatter
> fields …), so every `fn` parameter is non-defaulted for the argument-arity
> count at [Invocation — Argument arity](./invocation.md#argument-binding) …

The clause does work only if a `fn` parameter can reach that count. It supplies
the substitution invocation.md's own wording needs — a `fn` has no `params:`, so
the count's operand is the parameter list, every member non-defaulted — which
makes `requiredCount === totalCount === params.length` for a `fn` callee, and
makes the too-few and too-many arms collapse into one predicate.

`docs/spec_topics/diagnostics/placeholder-rendering-b.md:132`, verbatim:

> **Category 7 `<callee>` fallback.** When `<callee>` falls through to the path
> form (the parent has no slash-name binding for the callee — e.g. a sibling
> `.thetalib` `fn`), it renders verbatim per the path-literal rule rather than as
> an absolute path. This matters for the `theta/parse/invoke-arity-too-few` test
> vectors: a `.thetalib` `fn` callee renders as the source-text path the `import`
> declared, not a realpath.

This names a `fn` callee as an emitting arm of one of the two codes and pins its
`<callee>` rendering. It cannot be about `invoke("./x.thetalib")`: that is
`theta/parse/invoke-non-theta-extension` (`code-registry-parse.md:17`). So the
only reading is an imported `.thetalib` `fn` call site — resolution arm (3). On
Reading A the position is already inside the rule for at least that arm, and
`grammar.md:143` does not distinguish arm (2) from arm (3).

**Reading B — the arity rule is scoped to two surfaces and this is not one of
them.** `invocation.md:53`: "The same arity rules apply to `.theta` callable
calls through `tools:` entries … Pi tool calls take a single object argument and
are unaffected." The extension list names exactly one surface beyond `invoke`,
and `frontmatter-fields-a.md:60` repeats the pair — "The same default-vs-non-default
partition is what `invoke(...)` and `.theta` callable calls use to compute
argument arity". Both registry *Trigger*s (`:118`, `:119`) name the same two.
0050's §Affected reached this reading in terms: "No registry row covers a plain
`fn` call's argument count … Parse-time silence on arity is therefore not a
registry mismatch." On Reading B `grammar.md:143`'s clause is an inert
observation about a count a `fn` never enters, and
`placeholder-rendering-b.md:132`'s `.thetalib`-`fn` arm is a rendering rule for a
site the registry does not admit — a defect in one of those two pages rather than
in the implementation.

**Reading A is better supported, and it is narrower than it looks.** Four
reasons.

1. `grammar.md:143` is not written as an observation. It draws a consequence
   ("so every `fn` parameter is non-defaulted **for** the argument-arity count"),
   and a consequence about a count no `fn` participates in is vacuous. Reading B
   has to treat a normative grammar page's stated consequence as decoration.
2. `placeholder-rendering-b.md:132` is stronger still: it does not merely admit
   the arm, it decides a contested rendering for it and says the decision
   "matters for the `theta/parse/invoke-arity-too-few` test vectors". §7's
   `<callee>` rule (`:55`) already carries three arms — slash name, path
   fallback, `.theta`-callable presented name — and the path fallback's worked
   example is this position.
3. `invocation.md:53` is an extension sentence, not a closure sentence. Its
   subject is which *other* surfaces reuse the `invoke` rules; it does not say
   that no third surface may. The one sentence in the corpus that does read as
   closure — `frontmatter-fields-a.md:60` — is about which *default partition*
   the count consumes, and its own subject is the `params:` field schema, which a
   `fn` does not have.
4. Reading B leaves the implementation's runtime behaviour unexplained. The
   runtime does not treat an arity mismatch as legal: it refuses, and its refusal
   is documented in the code as recovering from a static invariant it expects to
   hold. Reading B has to say that theta 1.x defines no arity rule at a `fn`
   call while the interpreter enforces one anyway.

Reading A does not make the text complete, and this is the part that has to land
before code. Neither sentence says which of arms (2) and (3) is covered, neither
registry *Trigger* names either, and the *Message* / *Hint* text
`checkInvokeArity` renders is `invoke '<callee>' passes too many arguments …` /
"default the corresponding `params:` field on the callee" — a construct and a
repair that do not exist at a `fn` call site, and both frozen under DIAG-4. So
the classification is: **a specified obligation with no registered row for its
position** — 0115's family, not 0050's. 0050's family is a registered row whose
*Trigger* names a position and whose emitter has no caller; here the emitter
exists and is wired, and it is the *Trigger* that stops at the boundary.

**The third element is a defect against text that is not in dispute.** Whatever
Reading governs the parse seam, `error-model.md:74` bounds the surface the
runtime currently uses:

> Separately, *unexpected interpreter exceptions* — any throw originating inside
> the runtime, an adapter it called, or a host function the runtime did not
> anticipate, that is not one of the six closed-list sources above … form a
> distinct **runtime-defect surface**. They are not a new authoring concept (no
> theta expression "causes" one) …

`f(1, 2, 3)` is a theta expression and it causes one. The registry row's
*Trigger* (`code-registry-runtime.md:22`) admits the emission by letter — "an
internal invariant violation" — while the surface's normative framing excludes
the input class. Under either Reading of the parse question, one of the two has
to move: either a parse-phase refusal removes this input from the surface, or the
surface's boundary sentence is amended to admit an authoring mistake the
implementation deliberately routes there.

Under Reading A, on the measured input:

- A `fn` call whose argument count differs from the callee's parameter count is
  an error-severity parse (or type-phase) diagnostic, so the enclosing theta does
  not register (`GOV-15`'s loads-cleanly predicate, `:9`, is not satisfied).
- The count's operands are the declared parameter list, every member
  non-defaulted (`grammar.md:143`), so both directions are parse-time: the
  too-few arm's "otherwise it surfaces at runtime as
  `Err(InvokeInfraError { cause: "validation" })`" escape (`invocation.md:50`) is
  unreachable at this position — there is no callee `params:` AJV net for a `fn`
  (`code-registry-parse.md:116` says as much for the type judgement at the same
  boundary: "no runtime AJV safety net applies").
- Arity is decided before per-argument type (`invocation.md:48`), which binds
  this report's disposition to 0050's.
- `theta/parse/unknown-identifier` continues to own an unresolvable callee
  (measured), and the argument-*shape* rules continue to own bare object
  literals at a non-Pi-tool callee (measured).
- The runtime throw either becomes unreachable from legal source (and is retained
  as a defensive guard, 0071's residual-1 shape) or is re-attributed; §Fix (g)
  owns that choice.

## Actual behaviour / root cause

**1. The lexical call-site walk has the resolution and discards the arity.**
`checkLexicalCallSites` (`theta-document.ts:5288`) pre-collects whole-file
callee names into `fnImportDecls`:

```ts
// src/parser/theta-document.ts:5306–5320
  const fnImportDecls = new Set<string>();
  for (const s of body.statements) {
    switch (s.kind) {
      case "fn":
        fnImportDecls.add(s.name);
        break;
      case "import":
        for (const sym of s.symbols) {
          fnImportDecls.add(sym);
        }
```

`s` is the `FnDecl`; `s.params` is a `readonly FnParam[]`
(`theta-document.ts:477`) on the same node and is not read. The field's own doc
comment (`:5194–5206`) states the set's purpose — a call of such a name "is a
legal user-fn / import call, NOT a shadowed-callable-call site" — so the walk
uses the resolution to *stand down* three checks and adds none of its own. In the
`call` arm the only count test is Pi-tool-gated:

```ts
// src/parser/theta-document.ts:5455–5460
      const resolvesToPiTool =
        walkCtx.piTools.has(e.callee) &&
        localBinder === undefined &&
        !walkCtx.fnImportDecls.has(e.callee);
      if (resolvesToPiTool) {
        if (e.args.length > 1) {
```

A `fn` callee is excluded by the third conjunct, by construction. The else arm
(`:5490–5504`) tests each argument's *node kind*, never the list's length.

**2. The compose pass has the cross-file reach and no arm for a `fn`.**
`checkInvokeStaticResolution` (`invoke-static-checks.ts:649`) runs two arity
loops over one shared traversal. The `invoke(...)` loop (`:725–741`) subtracts
the leading path literal (`:728`); the `.theta`-callable loop bug 0071 added
(`:750–796`) resolves each collected `CallExpr` against the frozen callable-set
snapshot through `resolveThetaCallableCallSites` (`:285`) and keeps only
`kind === "theta"` entries. A `CallExpr` whose callee resolved to a `fn` is
collected by `collectCallSites` (`:109`) and then dropped, because it has no
callable-set entry. Nothing else in the pass reads `CallExpr.args.length`.

**3. Every user-`fn` call evaluation site refuses at runtime, identically.**

```ts
// src/runtime/statement-executor.ts:401–403 (evalUserFnCall)
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
```

The same three lines appear at `:495` (`evalSubagentFnCall`) and at
`production-theta-producer.ts:5903` (`evaluatePureFnCall`, the synchronous pure
host). `resolveUserFn` (`:377–380`) admits both `arm === "fn"` and
`arm === "import"`, so the same-file and imported routes share the check.
Nothing binds `null` for a missing argument and nothing discards a surplus one —
the class's doc comment states that this is deliberate. **A silent bind is not
what happens.**

**4. The refusal lands on the interpreter-defect surface.** `ThetaFnArityError`
extends `Error`, not `ThetaPanic`, so `isThetaPanic` is `false` (measured) and
`surfaceUnexpectedThrow` builds a `theta/runtime/internal-error` diagnostic;
`theta-composition-producer.ts:477–493` strips the `internal error: ` prefix and
emits `theta /<name> aborted with internal error: <message>`. The message names
the counts correctly, so the information reaches the author — under a code, a
prefix and a channel that `error-model.md:74` reserves for defects "no theta
expression 'causes'", and that `capability-probe.md`'s post-probe-drift rule also
routes host-SDK drift to. An operator triaging `internal error:` cannot tell an
authoring mistake from an interpreter bug from host drift on the code alone; the
row's own text concedes the third pair ("Operator triage … cannot, in theta 1.0,
distinguish a host-drift failure from a theta-runtime defect").

**5. In a `par for` body the refusal is downgraded to a value.**

```ts
// src/runtime/statement-executor.ts:1239–1254
  try {
    flow = await executeBlock(expr.body, scope, iterationDeps);
  } catch (thrown) { // allow-broad-catch: ERR-20 — errors-and-results.md#err-20
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    return {
      kind: "result",
      result: makeErr(parForPanicError(thrown, deps.file) as unknown as ThetaValue),
```

`parForPanicError` (`:1182–1191`) selects `cause: "internal_error"` for a
non-`ThetaPanic`. The element `Err` is a well-formed value, the loop yields a
full array, and the theta's outcome is `success` — measured. ERR-20
(`docs/reference/errors-and-results.md:120–134`) and CTRL-5
(`control-flow.md:78`) are both written over **panics** and `cause: "panic"`; the
`internal_error` arm at the same boundary rests on `error-model.md:74`'s "same
routing channels as panics" and no sentence names this cell for it. The
consequence is measurable regardless of that gap: the position where the runtime
does *not* abort is the position where the mistake is invisible.

**6. No registry row's *Trigger* reaches the position, so an emitter cannot be
wired without a spec decision.** A sweep of every row in
`code-registry-parse.md` returns four arity-shaped rows: `:50`
(`tool-arg-arity`, "A Pi-tool call site"), `:58` (`generic-arity-mismatch`,
type-argument counts), `:118` and `:119` (the two `invoke-arity-*` rows). The
registry is closed under DIAG-2 (`diagnostic-shape.md:72`). Reusing the two
`invoke-arity-*` rows would render, at a `fn` call site with no `invoke` on the
line and no `params:` anywhere:

```
invoke 'f' passes too many arguments: expected at most 1, got 3
   hint: Drop the extra argument(s); positional binding has no destination for them.
invoke 'f' passes too few arguments: expected 1 non-defaulted, got 0
   hint: Provide the missing argument(s) or default the corresponding
         `params:` field on the callee.
```

The too-few *Hint* prescribes a repair `grammar.md:143` forbids — a `fn`
parameter cannot carry a default. Both strings are the registry's *Message* /
*Hint* columns, normative under DIAG-4 (`:74`), with a reword deferred to theta
2.0. So the no-new-row route is not free: it either renders text that names
absent constructs, or it takes a DIAG-4 reword that DIAG-4 defers past 1.x.

**7. Nothing in the suite scores any of this.** No test drives an
arity-mismatched `fn` call, at either phase, in either direction. The only
in-tree mention of `ThetaFnArityError` outside `src/` is a comment
(`tests/tool-arg-shape-enforcement.test.ts:94`) citing it as the routing
comparison for a different defect.

## Why it matters

- **A broken program registers, dispatches, and fails late.** An error-severity
  parse diagnostic un-registers a theta; this one produces none, so the theta is
  slash-discoverable and dispatchable. The refusal arrives mid-body, after
  whatever the body has already committed — queries driven, tool calls executed,
  subagents spawned, tokens spent. Measured: `fn f(p: integer): integer { 1 }` +
  `f(1, 2, 3)` reaches `executeBody` and aborts there.
- **The author is told the interpreter is broken.** The surfaced string is
  `theta /<name> aborted with internal error: function 'f' expects 1 argument(s)
  but received 3`. The counts are right; the attribution is not. Under
  `error-model.md:74` this surface exists for throws "no theta expression
  'causes'", and it is the same code the corpus assigns to host-SDK drift and to
  catchable allocation failures.
- **One cell is fully silent.** In a `par for` body the mismatch becomes an
  element `Err` with `cause: "internal_error"`, the theta's outcome is `success`,
  and zero diagnostics are emitted. When the `par for` is an expression statement
  the array is discarded and nothing anywhere records that a call was made with
  the wrong number of arguments. The position is admitted by the rule that bounds
  a `par for` body: `control-flow.md:76` (CTRL-4) enumerates `subagent fn` calls
  among the forms the body may run, and an ordinary `fn` call whose body issues no
  enclosing-conversation query is pure computation, which the same sentence
  admits.
- **A surplus argument is authored and never delivered.** Positional binding has
  no destination for it — the registered too-many *Hint* says exactly this for
  the neighbouring surfaces. At a `fn` callee the argument's expression is not
  even evaluated: the count test precedes the per-argument `evalExpr` loop
  (`statement-executor.ts:401` before `:411`), so an argument written for its
  effect is dropped.
- **The same mistake at the same callee is caught through a sibling call form and
  not this one.** `twoparam("a")` at a `tools:` `.theta` entry is
  `theta/parse/invoke-arity-too-few` since 0.64.0; `f("a")` at a one-parameter
  `fn` in the same file is nothing. Bug 0071's §Why-it-matters made this argument
  for its own pair of forms.
- **Two corpus sentences currently assert a rule the implementation does not
  have.** `grammar.md:143` routes a `fn` parameter into the argument-arity count;
  `placeholder-rendering-b.md:132` decides `<callee>` rendering for
  `theta/parse/invoke-arity-too-few` at a `.thetalib` `fn` callee and calls that
  rendering load-bearing for the code's "test vectors". No such vector can exist:
  the code is unreachable from a `fn` call site. DIAG-1
  (`diagnostic-shape.md:71`) entitles tests to assert the code at every
  documented site, and this documented site cannot be asserted from source text.
- **The `fn` boundary is now the only argument boundary with no static
  judgement at all.** 0071 gave the `.theta`-callable surface arity; 0072 gave
  the Pi-tool surface arity and type plus a runtime AJV net; `invoke(...)` has
  had both since before either. At a `fn` call site neither count nor type is
  checked — 0050 owns the type half and is likewise open — so a declared
  parameter list constrains nothing until the call runs.
- **Nothing would notice a regression.** Zero tests cover the position, so a
  future change to `evalUserFnCall`, to `parForPanicError`, or to the lexical
  walk's `fn` handling cannot red on it.

## Non-goals

- **The argument-type judgement at the same boundary.** `checkFnArgCompat`'s
  missing caller is
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md), a
  registered row (`code-registry-parse.md:116`) with an emitter and no caller.
  This report measures the **count**. The two are ordered against each other
  (`invocation.md:48`), and §Fix (d) states the constraint; nothing here decides
  0050's disposition.
- **The `.theta`-callable and `invoke(...)` arity surfaces.** Both work
  (0071, and `invoke` before it). This report does not reopen them, and the
  `<callee>` rendering 0071 settled for its own arm
  (`placeholder-rendering-b.md:55`) is untouched.
- **The Pi-tool argument rules.** `theta/parse/tool-arg-arity`,
  `-not-object-literal`, `-type-mismatch` and `-schema-conflict` are 0003's and
  0072's, all fixed, all gated on a Pi-tool callee. The measured
  `bare-object-literal` pair at a `fn` callee is 0072's deliberate re-scoping to
  every direct argument position and is correct as it stands.
- **Whether ERR-20's downgrade should admit a runtime-defect-surface throw at
  all.** ERR-20 (`docs/reference/errors-and-results.md:120–134`) and CTRL-5
  (`control-flow.md:78`) are written over the six closed panic sources and
  `cause: "panic"`; the implementation's `cause: "internal_error"` arm
  (`statement-executor.ts:1187`) covers a wider input class than either sentence
  names. That gap is general — it applies to every non-panic throw in a `par for`
  body, not to arity — and is not adjudicated here. This report measures the cell
  because it is where its own subject becomes silent.
- **The runtime-defect surface's boundary as a general question.** Whether other
  input classes reach `theta/runtime/internal-error` contrary to
  `error-model.md:74` is out of scope. Element 3 is confined to the arity throw.
- **Reachability as a type-system input.** `functions.md:26` states that theta
  1.0 defines no reachability predicate the type system consumes. A fix judging
  the `if false { f(1, 2, 3) }` call does not change that; §Fix (f) records the
  input class rather than proposing a reachability rule.
- **Callee resolution.** An unresolvable callee is
  `theta/parse/unknown-identifier` (measured), and the load-time collision
  rejection across resolution arms (2)–(4) (`expressions.md:51`) is unchanged.
- **A `fn` parameter's name, mutability or annotation.** `mut` on one is
  `theta/parse/mut-on-immutable-context` (`code-registry-parse.md:31`); a
  non-identifier parameter name is bug 0095's recorded non-goal. Neither is a
  count.

## Fix

**Not settled. This report exists to pin the registry disposition first**,
because no emitter can be wired without one: the registry is closed under DIAG-2
and no row's *Trigger* names this position. Eight questions, with (d) ordering
the work against a sibling report.

**(a) Mint a row, widen two, or retire the two sentences.** Three routes, with
their costs measured.

1. **Mint one new registered code** for a `fn` call's argument count. This is a
   DIAG-2 addition, carve-out-covered within 1.x for the inputs it newly touches
   (`source-language-stability.md:25`), with a same-commit row in
   `code-registry-parse.md` and a *Message* mirror in
   `docs/reference/diagnostics.md`. It is the only route that can render text
   naming the constructs present at the site. One code or two is itself a
   sub-question: `grammar.md:143` makes every `fn` parameter non-defaulted, so
   `requiredCount === totalCount` and the too-few / too-many distinction carries
   no information a single "expects `<n>`, got `<m>`" row lacks — but splitting
   preserves shape-parity with the two neighbouring rows and with the *Hint*
   split (add arguments against drop arguments) that is the whole author-facing
   value of the distinction.
2. **Widen `theta/parse/invoke-arity-too-few` / `-too-many`.** A *Trigger* change
   is a DIAG-2 spec change landing in the same commit (`diagnostic-shape.md:72`),
   dispositioned by the carve-out as an addition for the newly-covered inputs
   (`:25`). No new code, no mirror row. **The cost is a DIAG-4 collision,
   measured**: both *Message* templates begin with the literal `invoke ` and the
   too-few *Hint* reads "default the corresponding `params:` field on the callee"
   — a repair `grammar.md:143` forbids at a `fn` parameter. DIAG-4
   (`diagnostic-shape.md:74`) makes the *Message* column normative and defers a
   reword to theta 2.0, so this route either emits text naming an `invoke` and a
   `params:` that are not there, or takes a reword 1.x cannot take. The *Hint*
   column's DIAG-4 standing is itself worth settling before this route is
   costed: DIAG-4 names the *Message* column, and whether a *Hint* edit is a
   reword under it is not stated.
3. **Retire the obligation.** Delete `grammar.md:143`'s "for the argument-arity
   count" clause and `placeholder-rendering-b.md:132`'s `.thetalib`-`fn` arm,
   stating that theta 1.x defines no parse-time arity rule at a `fn` call. This
   is the smaller edit only if Reading B wins §Expected behaviour, and it does
   not close the report: element 3 survives, so this route must also disposition
   the runtime attribution (question (g)) — an authoring mistake would then be
   *specified* to surface as `internal error: …`, which needs
   `error-model.md:74`'s boundary sentence amended in the same commit.

**(b) Which resolution arms.** `expressions.md:44–49` gives four; this position
is (2) a same-file top-level `fn` and (3) an imported `.thetalib` symbol. Both
are in `grammar.md:143`'s letter; only (3) is named by
`placeholder-rendering-b.md:132`. A `subagent fn` is arm (2) with FN-6's
"Parameters bind positionally as for `fn` and `invoke`" (`functions.md:61`)
stating the binding rule explicitly, and `functions.md:50` making it "identical
to an ordinary `fn` in its parameter list, positional call form". A fix that
lands narrower than the adjudicated scope moves the *Trigger* prose in the same
commit (DIAG-2); silently dropping an arm the *Trigger* names is what produced
0071.

**(c) Where the check runs — reuse, do not fork.** Bug 0071's landed plumbing is
the template and its constraints are binding:

- **One traversal.** `collectCallSites` (`invoke-static-checks.ts:109`) yields
  `{ invokeExprs, callExprs }` from a single walk precisely so the surfaces
  "cannot drift apart as the node shapes evolve". Do not add a second body
  traversal and do not fork the walk (0071's *Handoff to bug 0072* states this in
  terms; 0072 complied, adding two more loops over the same collection).
- **Never re-derive a callee from the presented name.** 0071's §Fix constraint 2
  and its witness cell B7 exist for the `as`-rename and hyphen→underscore
  rewrite. The analogue here is the resolution arm: a `fn` callee must be
  identified by the resolution judgement, not by name-matching against a
  declaration list that a local binding may shadow (arm 1 wins —
  `expressions.md:51`, and `checkLexicalCallSites` already tracks exactly this).
- **Read any snapshot through `Map.get` plus an explicit `!== undefined` test**,
  never a plain-object index — a callee name is author-controlled source text
  (the 0031 / 0038 hazard class 0071's fix record names).
- **Arity before type**, as a `continue` and not as an emission order:
  `invoke-static-checks.ts:790–796` is the shape.

The host is not obvious, and the two arms pull apart:

- **Arm (2) needs no new plumbing.** The parameter count is on the `FnDecl` the
  lexical walk already iterates (`theta-document.ts:5306–5320`), so a
  `Map<string, number>` beside `fnImportDecls` and one test in the `call` arm
  reaches it synchronously — inside `parseThetaDocument`, before the compose
  pass, with `par for` and `fn`-body positions already covered (`:5570`,
  `:5398–5410`).
- **Arm (3) cannot be served there.** `fnImportDecls` records imported *names*
  only; the signature is in another file, which the parser does not read. That is
  the compose pass's reach (`invoke-static-checks.ts`), where 0071's arity
  machinery already lives.

Splitting the two arms across two hosts is exactly the fork the constraints
forbid, and hosting both in the compose pass means the same-file arm's diagnostic
is produced after the parse-phase buckets — which changes nothing about the
emitted order (`assembleDiagnostics`,
`src/diagnostics/diagnostic.ts:107–127`, sorts by file/line/column) but does
change the *phase* column a registry row would carry. Whichever host is chosen,
the choice is a §Fix decision, not an implementation detail, and it must state
how the other arm reaches it. Bug 0016 owns `checkLexicalCallSites`'s three
existing emissions and its shared-builder message invariant; bug 0072 owns the
`resolvesToPiTool` branch structure. Neither may be weakened.

**(d) Ordering against bug 0050 — binding.**
[0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) owns the
argument-**type** judgement at this same position, and its disposition 1 wires
`checkFnArgCompat` at the type-phase walk's `call` arm
(`type-layer-checks.ts:1137`). `invocation.md:48` requires arity to be decided
first: "Arity is checked **before** per-argument type checking, so an arity error
is reported as such rather than as a confusing per-argument type error on the
first extra slot." A too-many call has extra slots with no declared parameter to
type them against, and a too-few call leaves declared parameters unmatched, so
running 0050's check on a site this one rejects produces exactly the confusing
output that sentence forbids. **The suppression channel is the coordination
point.** If both land in one pass it is 0071's `continue`. If they land in
different passes — this one in `checkLexicalCallSites`, 0050's in
`checkTypeLayer` — there is no `continue` between them and the suppression has to
be built: either the type check re-derives the count itself, or the arity verdict
is carried across the two calls (`theta-document.ts:873` and `:884` are eleven
lines apart in one function, so a channel exists). Whichever report lands second
inherits this and must re-derive the other's positions rather than assume them.
Neither disposition is chosen, so the ordering cannot be resolved here; both
reports record it.

**(e) GOV-15, and the two codes that move in opposite directions.** Engaged.
Inputs like §Reproduction's matrix load cleanly today
(`source-language-stability.md:9` — no `E`) and would gain an `E`, changing
observable (b) and, because an `E` denies registration, observable (a). That is
the [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
(`:25`) applied as an addition "for inputs newly brought into the code's emission
set" — the disposition
[0031](./0031-ctor-field-value-typing-unchecked.md) recorded for the same class
and [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
reuses. **One wrinkle this report must not leave for the fixer.** The same inputs
also *stop* emitting `theta/runtime/internal-error` and stop producing its
`theta-system-note` content, because the theta no longer registers. The carve-out
covers "the appearance or disappearance of a code's emission", so the
disappearance is textually in scope — but it is a disappearance produced by a
*different* code's addition, not by a removal of the disappearing row, and the
carve-out's per-operation in-scope sets are written one code at a time. A fix
states which arm it relies on rather than assuming the union.

**Blast radius, measured, not predicted.** The tracked corpus is 34 files (32
`.theta` + 2 `.thetalib`). It carries four `fn` declarations and four `fn` call
sites, and **every call site is correct-arity** — `rate_strictness(reviewer)`
1/1, `step(objective)` 1/1, `reviewer(draft)` 1/1, `tagline()` 0/0 — so no
committed file moves in either direction. Two of the four exercise arm (3), which
is the arm with no in-parser signature. A fix re-runs this sweep at its own
baseline rather than trusting this count.

**(f) The input classes to disposition explicitly.** Measured silent today; each
needs a stated disposition after:

- The `par for` body cell — the only position where the runtime does not refuse.
  A fix hosted in a walk without a `par for` arm would leave the *one* cell that
  is silent today silent afterwards. `walkCallSiteExpr` has the arm
  (`theta-document.ts:5570`); `invoke-static-checks.ts`'s `walkExpr` gained one
  in 0071 after a round-1 `correctness` finding. Whichever host is chosen, this
  cell is the first witness cell.
- The statically unreachable call (`if false { f(1, 2, 3) }`), which no
  reachability predicate excludes (`functions.md:26`).
- A `fn` declared but never called — must stay silent; the count rule is about
  call sites.
- An unannotated parameter (`fn f(p)`), where a count is decidable even though a
  type is not. The type judgement's unresolvable-operand deferral
  (`type-system.md:48`) has no arity analogue, and a fix must not import one.
- The self-recursive call (`fn f(p: integer): integer { f(1, 2) }`), inside the
  callee's own body, where the declaration is trivially in scope.
- Arm (3) with an unreadable or unparseable `.thetalib`, where the signature is
  unavailable. Deferring is admissible; silently dropping the arm is not, if the
  *Trigger* names it.

**(g) What happens to the runtime throw.** Three sub-questions, all measured
above. (i) Does `ThetaFnArityError` stay? A parse gate makes it unreachable from
legal source, which is 0071's residual-1 shape — a load-bearing defensive guard
with no witness. Deleting it means an arity mismatch reaching the runtime binds
or crashes; keeping it means a branch no fixture can red. (ii) Does its
attribution change? Under route (a)(1) or (a)(2) the surface is no longer the
author's only channel, so leaving it on `theta/runtime/internal-error` becomes
defensible on `error-model.md:74`'s own terms — a mismatch that reaches the
runtime after a parse gate exists genuinely *is* an internal invariant violation.
Under route (a)(3) it does not, and the boundary sentence moves. (iii) The `par
for` cell's `cause: "internal_error"` element `Err` — same disposition, one layer
down.

**(h) The live gates, decided by the run and not by assumption.**
`tests/fixtures/h7a/permitted-codes.json` already carries
`theta/runtime/internal-error`; a newly-minted or newly-reachable parse code is
not listed. Measured basis for the prediction that no append is needed: all four
`fn` call sites under `tests/live/**` and `docs/examples/` are correct-arity, so
the emission is structurally unreachable from an ordinary `pi -p` run — the same
reasoning 0071's fix record used to leave the file unedited, and the same
obligation to verify it with the real H9a run rather than assert it. The
empty-capture stderr gate (`tests/live/acceptance/harness.ts:534–546`, bug 0030's)
is the second half: a parse-phase refusal un-registers its theta rather than
writing to stderr, so the expectation is zero bytes, and `assertStderrClean`
reds if that is wrong.

**Witness — offline, provider-free, two columns per cell.** Every row of
§Reproduction settles inside one `parseDoc` call plus one `executeBody` call over
the real prompt-mode binding, so the harness is
`tests/non-object-receiver-gate.test.ts:186–290`'s shape reused, not a new
mechanism. Required: the whole declared × provided matrix with both
correct-arity controls; the syntactic-position table, including the `subagent fn`
row and the imported-`.thetalib` row; the `par for` cell in all three forms
(discarded, bound, control) asserting the element `Err`'s `cause` and the
theta's `outcome`, since it is the only cell where no enforcement exists today; the
unreachable-call and never-called rows; the unannotated-parameter row; every
excluded callee kind asserting the new code does **not** appear (`invoke(...)`,
`.theta`-callable, Pi tool, unknown identifier); and the four tracked-corpus call
sites measured as non-movers. Messages sourced from the registry through
`parseRegistry` / `registryMessage` with row presence and placeholder asserted
before filling (DIAG-4), never copied prose. A live cell is owed only if the
adjudication makes the code reachable from a registration path — 0071's H8a
precedent (registration-only, zero tokens, the `theta-system-note` channel read
off the settled in-memory `SessionManager`, `requireLiveProvider()` failing
loudly) is the shape.

## Provenance

- **Origin:** the bug 0095 fix (0.74.0, commit `75af7646`), fix report
  `.pi/tmp/fixes/0095-report.md` §Residuals item 4, which corrected that
  report's own GOV-15 premise and recorded the measurement in passing: "**Measured
  at this baseline: an in-document `fn` call is not arity-checked at the parse
  seam at all** — `fn f(p: integer) { 1 }` called with three arguments draws
  `[]`, exactly as the phantom three-parameter signature called with one draws
  `[]`. So observable (b) could never move for this family. Recorded as residual
  (iv) in the fix record; independent of this fix." That residual states the
  parse-seam fact and nothing else. This report adds: the whole declared ×
  provided matrix with controls, the runtime column at all three evaluation sites
  (the throw, its non-panic classification, the `theta/runtime/internal-error`
  routing and the top-level framing string), the `par for` cell's ERR-20
  downgrade to a discardable element `Err` with a `success` outcome and zero
  diagnostics, the syntactic-position table, the registry sweep establishing that
  no row's *Trigger* names the position, the two corpus sentences that do route a
  `fn` parameter into the arity count, the two readings with the argument between
  them, the DIAG-4 collision that costs the no-new-row route, the separation from
  bugs 0050 / 0071 / 0072 with each boundary measured, the tracked-corpus sweep,
  and the eight §Fix questions with the 0050 ordering constraint.
- **Spec measured against:** `docs/spec_topics/grammar.md:135–141` (the `FnDecl`
  / `FnParams` / `FnParam` productions), `:143` (the no-default rule and the
  "non-defaulted for the argument-arity count" clause — the anchor);
  `docs/spec_topics/expressions.md:44–49` (the call-position resolution order;
  arms (2)–(3) are this position, arm (4) is 0071's), `:51` (no-match and the
  cross-arm collision rule);
  `docs/spec_topics/invocation.md:48` (arity before type), `:50`, `:51` (the two
  arms), `:53` (the extension to `.theta` callable calls);
  `docs/spec_topics/functions.md:20` (FN-1, hoisting and the cross-file frame),
  `:26` (FN-3, no reachability predicate), `:50` (`subagent fn` identical in
  parameter list and positional call form), `:61` (FN-6, positional binding "as
  for `fn` and `invoke`");
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (the
  default-vs-non-default partition, named for two surfaces);
  `docs/spec_topics/tool-calls.md:14` (§"Argument shape", 0071's anchor);
  `docs/spec_topics/diagnostics/code-registry-parse.md:9` (the column legend),
  `:17` (`invoke-non-theta-extension`), `:31`
  (`mut-on-immutable-context`), `:50` (`tool-arg-arity`), `:58`
  (`generic-arity-mismatch`), `:61` (`unknown-identifier`), `:82`
  (`nested-fn`), `:83` (`function-as-value`), `:116`
  (`fn-arg-type-mismatch`, 0050's row), `:118`, `:119` (the two arity rows);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:22`
  (`theta/runtime/internal-error`);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55` (§7's `<callee>`
  rule), `:132` (the Category-7 fallback bullet naming a `.thetalib` `fn`
  callee);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:58` (the `theta/runtime/*`
  routing bullet), `:71` (DIAG-1), `:72` (DIAG-2), `:73` (DIAG-3), `:74`
  (DIAG-4);
  `docs/spec_topics/errors-and-results/error-model.md:67–72` (the closed panic
  list), `:74` (the runtime-defect surface and its authoring-concept boundary);
  `docs/spec_topics/control-flow.md:78` (CTRL-5);
  `docs/spec_topics/type-system.md:48` (the unresolvable-operand deferral, cited
  to show it has no arity analogue);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (loads-cleanly), `:25` (the diagnostic-registry carve-out).
  User-facing mirrors: `docs/reference/grammar.md:247–262` (the `fn` production
  and its prose, which omits the arity clause);
  `docs/reference/diagnostics.md:165` (the `fn-arg-type-mismatch` *Message*),
  `:167`, `:168` (the two arity *Message*s), `:247`
  (`theta/runtime/internal-error`);
  `docs/reference/errors-and-results.md:92–99` (the runtime-defect surface),
  `:120–134` (ERR-20, which owns the anchor).
- **Implementation evidence at `76dfde5c`:**
  `src/parser/theta-document.ts:409–412` (`FnParam`), `:474–479` (`FnDecl`),
  `:873` (the lexical walk's call site), `:884` (the type layer's), `:896–907`
  (the diagnostic buckets), `:5194–5206` (`fnImportDecls`'s doc comment and
  declaration), `:5288` (`checkLexicalCallSites`), `:5306–5320` (the
  declaration pre-collection), `:5343` / `:5356` / `:5437` (the three walk
  functions), `:5398–5410` (the `fn`-body arm), `:5443–5504` (the `call` arm;
  `:5455–5459` `resolvesToPiTool`, `:5460–5489` the Pi-tool arms, `:5490–5504`
  the else arm), `:5570` (the `par-for` arm);
  `src/parser/functions.ts:145` (`resolveFnCall`, no `src/` caller);
  `src/parser/invoke-diagnostics.ts:66`, `:69` (the two codes), `:112–121`,
  `:127–133` (the two *Message* builders), `:150–155` (the two *Hint*s), `:331`
  (`checkInvokeArity`);
  `src/parser/type-compat.ts:452` (`checkFnArgCompat`, 0050's, still no `src/`
  caller); `src/parser/type-layer-checks.ts:1137–1142` (the `call` / `invoke`
  arm);
  `src/extension/invoke-static-checks.ts:104` (`collectInvokeExprs`), `:109`
  (`collectCallSites`), `:247` (`ThetaCallableCallSite`), `:285`
  (`resolveThetaCallableCallSites`), `:308`
  (`collectThetaCallableCallSites`), `:649`
  (`checkInvokeStaticResolution`), `:725–741` (the INV-3 `invoke` block),
  `:750–796` (0071's `.theta`-callable loop and its `:790–796`
  arity-before-type `continue`);
  `src/extension/subagent-fn-static-checks.ts:1–24` (the two checks it covers),
  `:236` (`checkSubagentFnStaticResolution`);
  `src/runtime/statement-executor.ts:356–368` (the doc comment and
  `ThetaFnArityError`), `:377–380` (`resolveUserFn`), `:395–403`
  (`evalUserFnCall` and its throw), `:488–495` (`evalSubagentFnCall` and its
  throw), `:1182–1191` (`parForPanicError`), `:1239–1258` (the ERR-20 catch),
  `:1690` (`executeBody`);
  `src/extension/production-theta-producer.ts:5794`
  (`evaluatePureExpression`), `:5901–5903` (`evaluatePureFnCall` and its
  throw);
  `src/extension/theta-composition-producer.ts:477–493` (the
  `internal-error` framing);
  `src/diagnostics/diagnostic.ts:107–127` (`assembleDiagnostics`'s stable
  file/line/column sort).
- **Test and fixture evidence at `76dfde5c`:**
  `tests/helpers/e2e-s1.ts:39` (`parseDoc`);
  `tests/non-object-receiver-gate.test.ts:186–290` (the parse-plus-production-executor
  harness this report's runtime column reuses);
  `tests/tool-arg-shape-enforcement.test.ts:94` (the only `ThetaFnArityError`
  mention outside `src/`, a comment);
  `tests/theta-callable-call-arity.test.ts` (0071's 39-cell witness, the
  arity-witness shape to mirror);
  `tests/functions-and-return.test.ts:9`, `:36`, `:101`, `:105`
  (`resolveFnCall`'s only consumers);
  `tests/fixtures/h7a/permitted-codes.json` (11 entries, already carrying
  `theta/runtime/internal-error`);
  `tests/live/acceptance/harness.ts:534–546` (`assertStderrClean`);
  `tests/live/acceptance/noninteractive-acceptance.test.ts:115`, `:149–150`,
  `:178–179`, `:221–222` (`assertCodesSubsetOfPermitted` beside it);
  `docs/examples/personas.thetalib:7`, `docs/examples/import-thetalib.theta:9`,
  `docs/examples/ralph-inline.theta:21`, `:39`,
  `docs/examples/refine-inline.theta:16`, `:30`,
  `tests/live/acceptance/fixtures/acc-lib.thetalib:3`,
  `tests/live/acceptance/fixtures/acc-imports-invoke.theta:9` (the tracked
  corpus's four `fn` declarations and four correct-arity call sites).
- **Reproduction:** two scratch probes at `76dfde5c`, both deleted. (1) A
  `parseDoc` sweep over sixteen sources — the four-cell arity matrix, the two
  controls, the syntactic-position rows including `subagent fn`, the
  unannotated-parameter and self-recursive rows, the imported-`.thetalib` row,
  the object-literal-argument rows against a `fn` callee and their Pi-tool
  contrast, and the unknown-callee control. (2) An `executeBody` sweep over the
  same fixtures through `createProductionProducerDeps(...).bindPromptConversation`,
  reporting either the settled `BodyExecution` or the thrown value's
  constructor, its `isThetaPanic` verdict, and the code and message
  `surfaceUnexpectedThrow` produces for it; plus the three `par for` forms and
  the plain-`for` contrast. Run on the outputs quoted in §Reproduction. No file
  in the tree was written by either probe, no provider was contacted, and `src/`,
  `tests/`, `docs/bugs/README.md` and every other bug document are unmodified by
  this filing.

## Coordination note — bug 0050 landed (0.77.0)

The arity half now sits one line from checkable: `checkFnCallArgs`
(`src/parser/type-layer-checks.ts`) holds the resolved `FnDecl` and the
argument list, and deliberately iterates only the `Math.min(args, params)`
prefix. Cell a1 of `tests/fn-arg-type-mismatch-wired.test.ts` pins the
current silence in both directions (`g()` and `g(3, 4)` draw neither the
fn-arg code nor any arity code). Per this report, the registry question
comes first — no row covers a plain `fn` call's argument count.

## Fix (0.199.0)

**The adjudication §Fix owed.** Re-derived at the fix baseline: every cell of
§Reproduction still drew `[]` at parse, no registry row's *Trigger* reached the
position, and both corpus sentences (`grammar.md`'s `FnDecl` prose,
`placeholder-rendering-b.md`'s Category-7 fallback) still stood — so the report
was neither mooted nor owned by a fresher document (0050 and
[0138](./0138-imported-thetalib-fn-arg-route-deferred.md) own the argument
**type** route, [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md)
the intra-site diagnostic count for the type rows; none owns arity). Reading A
governs. §Fix (a) **route 1 — mint**, on the measured DIAG-4 collision that costs
route 2 (both `invoke-arity-*` *Message*s open with the literal `invoke ` and the
too-few *Hint* prescribes defaulting a `params:` field, a repair a `fn` parameter
cannot take, with a reword deferred past 1.x) and the extra `error-model.md`
boundary amendment that route 3 would force — 0115's landed precedent for the
same family. **Two** rows, not one, because a single row carries one *Hint* and
the author-facing repair is opposite in the two directions; `<required>` is the
declared parameter count in both arms, since required equals total at a `fn`
callee. §Fix (b): arm (2) only, `subagent fn` included; arm (3) **deferred and
stated in the minted *Trigger*** rather than silently dropped — the cross-file
signature is 0138's plumbing at this identical boundary. §Fix (c): hosted in
0050's landed `checkFnCallArgs`, no forked walk, callee identified by the
resolution ladder (`shadowedNames` → `importedSymbols` → `fnDecls.get` with an
explicit `!== undefined` test), arity before type as an early `return`. §Fix (d)
is discharged structurally: both judgements now live in one function, so the
suppression is that `return` and no cross-pass channel is built. §Fix (e): the
carve-out's **addition** arm alone, singly stated; the paired disappearance of
`theta/runtime/internal-error` at those inputs is that addition's consequence at
the loads-cleanly predicate, not a second claim. §Fix (g): the runtime throw, its
three sites, its `theta/runtime/internal-error` attribution and the `par for`
element-`Err` downgrade are **unchanged** — the surface is no longer the author's
only channel for arm (2), and arm (3) keeps the throw genuinely reachable from
legal source, so it is not a witness-less guard. §Fix (h): decided by the real
run, not by prediction.

- **What shipped:**
  - `src/parser/invoke-diagnostics.ts` — appended (no existing line moved) the
    two code constants, the two registry-*Hint* constants, the two *Message*
    builders and `checkFnCallArity`, mirroring `checkInvokeArity`'s shape with no
    not-statically-resolvable escape: a same-file `fn` is hoisted and always
    resolvable, and required equals total, so both arms are always parse-time.
    The module header's code inventory names the two new codes.
  - `src/parser/type-layer-checks.ts` — inside `checkFnCallArgs` only: the
    `Ident`-shape constant, and after the callee resolves out of `fnDecls`, (i) a
    **withhold** when any recorded parameter name is not `Ident`-shaped (a
    `theta/parse/fn-param-not-identifier` recovery artefact holds a count no
    author wrote), else (ii) `checkFnCallArity` at the call expression's range,
    pushed and returned above the per-argument loop. `checkArrayLiteral`'s body,
    the pattern region and every sibling-lane surface are untouched.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the two minted rows
    (Sev `E`, phase `type`), whose *Trigger*s state exactly what the emitter
    serves: the same-file arm including `subagent fn`, the arm-(3) deferral named
    as deferred, the junk-parameter-table withhold, required-equals-total, and
    that the suppression on a mis-arity call covers the per-argument
    `theta/parse/fn-arg-type-mismatch` check and the parameter-typed element sink
    but **not** each argument expression's own judgement.
  - `docs/reference/diagnostics.md` — the two same-commit mirror rows (Code /
    Sev / Phase / Message, per that page's own statement).
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — the category-4
    numeric scope sentence, which names its rows by code, gains the two new
    codes. No placeholder coined, no closure edit.
- **Gates:** witness `tests/fn-call-arity-unchecked.test.ts` 29/29 green (16 of
  29 red before the fix, red again under neutralisation and green after
  byte-exact restoration); full default suite `388 files / 8037 tests passed`;
  `npm run typecheck` clean; `npm run lint` clean; live H8a
  `tests/live/fn-call-arity-live-cell-.test.ts` green with its red path
  proven, beside all four sibling live cells green in the same run; real H9a
  `tests/live/acceptance/noninteractive-acceptance.test.ts` 10/10 green.
- **Review:** 3 rounds. Round 1 (deep) — three findings and one residual, all
  prose or a dropped assertion, no correctness or fidelity defect: two *Trigger*
  clauses that were false of the shipped emitter (the "differ in `<name>`'s
  repair" claim, and "draws this row alone"), one stale cell's prose in
  `tests/fn-arg-type-mismatch-wired.test.ts`, and the flipped sink cell's dropped
  message and column pins. Round 2 (fast) — clean. Round 3 (fast, scoped to the
  live cell added during verification) — no findings, two naming/ordering
  residuals, both answered in the file's own header.
- **Verification:** SOLID. The witness reds under neutralisation on the 16 arity
  cells with the "arity check absent" signature and greens after restoration
  (`git hash-object` proof both ways); the default suite is green at the
  premeasured 388/8037; the live cell witnesses both directions over a real
  drive with its refusal read off the settled `SessionManager`'s
  `theta-system-note` channel and its message sourced from the registry; lint
  and typecheck are clean. `tests/fixtures/h7a/permitted-codes.json` needs **no**
  append, decided by the real H9a run (10/10, `assertStderrClean` and
  `assertCodesSubsetOfPermitted` both green), not by the corpus prediction.
- **Residuals:**
  1. **Arm (3) is deferred, not covered.** An imported `.thetalib` `fn` called at
     the wrong arity still loads clean and still throws `ThetaFnArityError` into
     `theta/runtime/internal-error` at runtime. The minted *Trigger*s say so.
     Cell `e-imported-arm3` of the witness pins the silence. The cross-file
     signature is 0138's plumbing.
     **Discharged by 0138's fix (0.235.0):** the compose-layer check
     (`checkImportedFnCallArgs` over the import callee map) now refuses
     wrong-arity and provably mistyped imported-`fn` calls at load; cell
     `e-imported-arm3`'s silence subject was re-vehicled under 0138's
     witness authority (see `tests/imported-thetalib-fn-call-args-checked.test.ts`).
  2. **`placeholder-rendering-b.md`'s Category-7 fallback still names a
     `.thetalib` `fn` callee as a rendering arm of
     `theta/parse/invoke-arity-too-few`.** That sentence is untouched here: it is
     about arm (3), which this fix defers, and about a code this fix does not
     widen. It stays unreachable from source text until residual 1 closes.
  3. **The junk-parameter-table withhold is silence, not a verdict.** A `fn`
     whose parameter list absorbed a statement draws its own declaration-level
     refusal and no arity row; since that refusal is `E`-severity the theta does
     not register either way, so no input is left both silent and loadable.
  4. **Adding two rows to `docs/reference/diagnostics.md`'s `theta/parse/*` table
     shifts every line after it by +2**, so line-form citations into that page at
     `:187` and beyond — carried by roughly two dozen `docs/bugs/*.md` documents —
     are stale by two. Intrinsic to any registry addition on that page and not
     repaired here: those documents belong to other owners and this lane may not
     edit them.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the runtime throw, its attribution and the
  ERR-20 `par for` downgrade are unchanged (§Fix (g)); `error-model.md`'s
  boundary sentence, `invocation.md`'s scoping sentences and
  `placeholder-rendering-b.md` are unedited; the `invoke(...)` and
  `.theta`-callable arity surfaces, the Pi-tool argument rules, and the argument
  **type** judgement at this boundary are untouched.
