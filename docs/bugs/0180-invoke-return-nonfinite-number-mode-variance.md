# Bug 0180 — A typed `invoke<T>` whose payload carries a non-finite `number` gets opposite verdicts by callee `mode:` — the reverse of bug 0174: `1 / 0` evaluates to `Infinity`, a value `expressions.md:232` and `runtime-value-model.md:8` both specify, and the prompt→prompt attach cell hands it to AJV through `projectForValidation` unchanged where the seam's `strict: false` construction drops AJV's `isFinite` check and it validates `Ok(Infinity)`, while the subagent leg's `serializeOkEnvelope` emits `{"theta_result":{"v":1,"ok":null}}` (`JSON.stringify(Infinity)` is `null`) and the parent's AJV refuses that `null` under `{"type":"number"}` — and at a *nullable* position neither leg refuses and the two bind different values, `Infinity` against `null`, with no diagnostic

- **Status:** open. §Fix is constraint-pinned, not settled: the two legs and the
  three producing spellings are fixed and measured, but *which* leg moves is
  undecided and every candidate collides with GOV-15
  (`docs/spec_topics/governance/source-language-stability.md:5`) from a
  different side — normalising the prompt cell newly refuses an input that
  succeeds today, refusing child-side newly refuses one that succeeds today on
  the other leg, and documenting the variance moves nothing but leaves
  `invocation.md:36` false. The tension is named in §Fix (e) and the run
  adjudicates it against the evidence in §Fix (a)–(d).
  Residual **R1** of the bug 0174 fix (0.98.0, commit `f912a8c3`), recorded in
  that run's report (`.pi/tmp/fixes/0174-report.md` §*Residuals / notes*, R1)
  and in that document's `## Fix (0.98.0)` §*Residuals* 1, and not filed there —
  a fix run creates no bug docs.
  Ordering: nothing blocks this report from starting, and it blocks nothing.
  [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) is **fixed
  (0.98.0)** and its `projectForValidation` is the prompt cell's mechanism here;
  a fix touching that function rebases onto its hunks in
  `src/runtime/wire-translation.ts` and re-runs its two witnesses.
- **Sev/Diff estimate:** S1/D3 — S1 on the **nullable** arm, which is silent.
  Measured: `invoke<number | null>` lowers to `{"type":["number","null"]}`, the
  prompt cell binds `Ok(Infinity)`, and the subagent leg's envelope carries
  `null`, which the same compiled document validates `{"ok":true}` — so both
  legs return `Ok` and the two payloads differ, with no diagnostic and no
  registered code. That is GOV-15 observable (a) — "identical return values" —
  moving on the callee's `mode:` frontmatter alone, i.e. a value corrupted in
  silence. The **non-nullable** arm on its own would be S2: `invoke<number>` is
  `Ok(Infinity)` on the prompt cell and `{"ok":false}` at `instancePath ""`
  (`must be number`) on the subagent leg, which
  `#validateInvokeReturn`'s only failure arm
  (`src/extension/production-theta-producer.ts:3603–3609`, read at HEAD) surfaces
  as `Err(InvokeInfraError { cause: "return_validation" })` — a loud refusal of
  a legal program, not a mis-value. Reachability is weighed and it is not a
  seam-only construction: three theta-source spellings produce a non-finite
  `number` with `[]` diagnostics (`1 / 0` → `Infinity`, `0 / 0` and `1 % 0` →
  `NaN`, `1e308 * 10` → `Infinity`), all three spec-blessed at
  `expressions.md:232`; the one route the language *does* close is the literal
  (`1e400` → `theta/parse/number-literal-not-finite`,
  `docs/spec_topics/diagnostics/code-registry-parse.md:26`). No committed
  `.theta` / `.thetalib` performs a division or a modulo at all (census: 0 of
  34), so nothing in the corpus reaches it today. D3 because §Fix needs in-run
  adjudication among four dispositions that each move a different today-passing
  input, and because one of them (§Fix (d)) is a one-option change at
  `AjvSchemaValidator`'s constructor with seven `compile` call sites downstream
  of it.
- **Kind:** defect — a callee's `mode:` frontmatter changes both *whether* a
  typed `invoke<T>` return validates and *what value the caller binds*, which
  `invocation.md:36` fixes as mode-invariant. Bug 0174 fixed one direction of
  this (the prompt cell refusing what the subagent leg admits); this is the
  other direction, on a different value class, and it was measured while
  correcting 0174's doc-comment. Four elements, each measured at HEAD
  `a1eec82c` (v0.98.0).
  1. *A non-finite `number` is a specified theta value, reachable from source.*
     `expressions.md:232` — "Division by zero produces IEEE-754 `Infinity` /
     `-Infinity` / `NaN` per JS semantics; it does not panic. Modulo by zero
     (`n % 0`) likewise produces `NaN` and does not panic". The runtime value
     model's `number` row restates it (`runtime-value-model.md:8`: "Division
     produces IEEE-754 `Infinity` / `NaN` per JS semantics"), the reference
     mirror carries it (`docs/reference/type-system.md:109`), the runtime panic
     catalogue excludes it deliberately
     (`docs/spec_topics/diagnostics/code-registry-runtime.md:43`), and the
     query-interpolation table renders it by name
     (`docs/spec_topics/query/query-escapes-stringification.md:22`: "`NaN` →
     `NaN`; `Infinity` → `Infinity`; `-Infinity` → `-Infinity`"). Measured: all
     of `1 / 0`, `-1 / 0`, `0 / 0`, `1 % 0`, `let n: number = 1 / 0` and
     `1e308 * 10` parse with `[]` diagnostics and evaluate to the non-finite
     value (§Reproduction (a)); the committed cells
     `tests/expression-evaluator.test.ts:207` and `:213` already pin the
     evaluation half.
  2. *The prompt cell hands the value to AJV unchanged, and AJV admits it.*
     `projectForValidation` (`src/runtime/wire-translation.ts:494`, new at 0174)
     collapses a boxed `String` (`:495–499`), walks arrays (`:500–510`) and
     plain objects (`:522–531`), and returns everything else by its
     `!isPlainObject` arm (`:519–520`) — a `number` is that arm's input.
     `#validateInvokeReturn`'s AJV call (`:3591`) therefore validates the
     non-finite value itself. The seam constructs AJV with
     `{ strict: false, allErrors: true, logger: false }`
     (`src/seams/schema-validator.ts:112`), and `strict: false` propagates into
     `strictNumbers` (`node_modules/ajv/dist/core.js:74`), which is the flag
     gating the `isFinite` conjunct in AJV's own `number` type check
     (`node_modules/ajv/dist/compile/validate/dataType.js:151–152`). Measured:
     `{"type":"number"}` admits `Infinity`, `-Infinity` and `NaN` at this seam,
     where the same document under `strict: true` refuses `Infinity`
     (§Reproduction (e)).
  3. *The subagent leg destroys the value in the envelope and then refuses the
     wreckage.* `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:94`) is
     `JSON.stringify` of the payload (`:96`), called child-side at
     `production-theta-producer.ts:2211` beside `surfaceCalleeFinalValue`
     (`:2208`); `JSON.stringify` has no non-finite form and emits `null`.
     Measured: the envelope line for `Infinity`, `-Infinity` and `NaN` alike is
     `{"theta_result":{"v":1,"ok":null}}`. The parent re-reads it with
     `JSON.parse` (`parseEnvelopeLine`, `subagent-envelope.ts:149`, the parse at
     `:152`), settles `{ok:true, value: null}`
     (`src/runtime/subagent-json-driver.ts:118`, `:121`) and hands that to the
     same `#validateInvokeReturn` (`production-theta-producer.ts:3448`), where
     `{"type":"number"}` refuses `null` — `must be number` at `instancePath ""`.
     The refusal is *correct given its input*; the input is already wrong.
  4. *At a nullable position nothing refuses, and the two legs disagree in
     silence.* `number | null` lowers to `{"type":["number","null"]}` (measured
     through the real `lowerQueryResponseSchema`,
     `src/runtime/query-schema-lowering.ts:113`). Measured: the prompt cell
     returns `Ok(Infinity)`; the subagent leg's re-read `null` validates
     `{"ok":true}` against the same compiled document. The same holds one level
     down — `schema NBox { n: number | null, who: string }` returning
     `NBox { n: 1 / 0, who: "w" }` is `Ok({n:Infinity,who:"w"})` on the prompt
     cell and `{"ok":true}` over `{"n":null,"who":"w"}` on the subagent leg.
     Element 3's loud arm and this silent arm are the same mechanism read
     against two annotations.
- **Related:**
  - **0174** —
    [`0174-typed-invoke-enum-return-validation-prompt-cell.md`](./0174-typed-invoke-enum-return-validation-prompt-cell.md),
    **fixed (0.98.0)**, the finder and the owner of the prompt cell's mechanism.
    Its fix added `projectForValidation` (`wire-translation.ts:494`) and routed
    `#validateInvokeReturn`'s AJV call through it (`:3591`), which is what puts
    a non-finite `number` in front of AJV on the prompt leg unaltered. **It did
    not cause this.** Before 0.98.0 the same value reached the same `validate`
    call by the same path; the projection's `!isPlainObject` arm (`:519–520`)
    passes a `number` through, so the verdict is unchanged either side of that
    commit. **Boundary, stated from both sides.** 0174's class is a named-enum
    carrier — a value whose *representation* the prompt cell preserves and the
    envelope normalises, so the prompt cell refused what the subagent leg
    admitted. This report's class is a non-finite `number` — a value whose
    *identity* the prompt cell preserves and the envelope destroys, so the
    subagent leg refuses (or silently substitutes) what the prompt cell admits.
    Opposite direction, disjoint value class, same sentence violated.
    0174's own record already names this: its `## Fix (0.98.0)` deliberately
    **scopes** the corrected doc-comment's conclusion to named-enum returns
    (`production-theta-producer.ts:3546–3547` — "a callee's `mode:` frontmatter
    cannot change whether a **named-enum** return validates"), because review
    round 1 measured this counterexample and the unscoped form would have
    reproduced the overclaim 0174 §Actual behaviour 5 indicts. **This report
    does not reopen 0174.** Its two witnesses
    (`tests/invoke-return-enum-carrier-projection.test.ts`, 16 cells;
    `tests/invoke-prompt-cell-enum-return.test.ts`) stay as they are, and its
    §Fix (b) route — validate a projection, hand the original downstream — is
    not revisited.
  - **0068** —
    [`0068-prompt-callee-invoke-final-value-null.md`](./0068-prompt-callee-invoke-final-value-null.md),
    **wontfix — not a defect**, the grandparent investigation, cited here for
    the bound it establishes. Its §Resolution fixes that the untyped
    `invoke(...)` form discards the callee's value by specification
    (`invocation.md:28`), which is mode-blind. That discard **bounds this
    report's domain**: only the typed form carries a value to the boundary, so
    only the typed form can exhibit a mode-variant verdict on one.
    §Non-goals declines the discard.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6165 lines at this HEAD and
    every open report inserts into it — 0174's fix alone moved every position
    that report cites downward, by between +71 (`#driveCallee`, `:3235` →
    `:3306`) and +128 (`#validateInvokeReturn`, `:3436` → `:3564`) — which is
    why every volatile position below is named by symbol beside its line and
    every line is stamped with the commit it was read at.
  - **0152** —
    [`0152-modulo-zero-result-type-not-number.md`](./0152-modulo-zero-result-type-not-number.md),
    **open**, and **0142** —
    [`0142-division-result-type-not-number.md`](./0142-division-result-type-not-number.md),
    **fixed (0.80.0)**. Both own the *static type* the `/` and `%` operators
    assign; neither touches what the produced value does at a return boundary.
    They are named here only as the provenance of the spellings in
    §Reproduction (a): 0142's fix is why `/` answers `number`, and 0152's open
    subject is `integer % 0`'s widening. Neither is a prerequisite in either
    direction and no fix here changes a static type.
- **Affected** (every citation re-verified against the tree at HEAD `a1eec82c`,
  v0.98.0, by `rg` and by reading the file; symbols named beside lines):
  - **The gate that judges both legs.** `#validateInvokeReturn`
    (`src/extension/production-theta-producer.ts:3564`), its
    `returnSite === null || !result.ok` early return (`:3569–3571`), the
    ceiling-#4 depth walk that precedes AJV (`:3578`, over
    `enforceInvokeReturnDepth`, `src/runtime/invoke-ceiling-depth.ts:99`), the
    lowering call (`:3582–3586`), the `compile` (`:3590`), **the `validate` call
    this report is about (`:3591`)**, the `verdict.ok` arm that binds
    `validated: result.value` (`:3592–3601`, the bind at `:3599`) and the
    `InvokeInfraError` construction (`:3603–3609`). Its doc-comment
    (`:3528–3563`), of which `:3546–3547` is the clause 0174 scoped **because**
    of this defect and `:3541–3542` is the copy-on-change clause §Fix (e) tests.
  - **The two cells.** `#driveCallee` (`:3306`); the prompt→prompt attach guard
    `callerMode === "prompt" && callee.frontmatter.mode === "prompt"` (`:3376`)
    and its `#validateInvokeReturn` call (`:3410`); the subagent spawn cell's
    `binding.drive()` (`:3442`) and its call (`:3448`).
    `surfaceCalleeFinalValue` (`:3639`) projects the callee body's terminal
    execution onto the crossing `Result` on both cells.
  - **The projection that lets the value through.** `projectForValidation`
    (`src/runtime/wire-translation.ts:494`), the boxed-`String` collapse
    (`:495–499`), the array arm and its `next !== element` identity test
    (`:500–510`, the test at `:504`), the `Result` pass-through (`:511–518`),
    **the `!isPlainObject` arm a `number` takes (`:519–520`)**, and the object
    arm with its `next !== fieldValue` identity test (`:522–531`, the test at
    `:526`).
  - **The subagent leg's serialisation and re-read.** `serializeOkEnvelope`
    (`src/runtime/subagent-envelope.ts:94`), its doc-comment's
    JSON-representability claim (`:90–92`) and its `JSON.stringify` (`:96`),
    called child-side at `production-theta-producer.ts:2211` beside
    `surfaceCalleeFinalValue` (`:2208`); `parseEnvelopeLine`
    (`subagent-envelope.ts:149`) and its `JSON.parse` (`:152`);
    `scanStreamForEnvelope` (`:195`); the driver's parse and settle
    (`src/runtime/subagent-json-driver.ts:118`, `:121`).
  - **The validator seam and the flag that decides the prompt leg's verdict.**
    `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`), its AJV
    construction (`:112` — `{ strict: false, allErrors: true, logger: false }`),
    its content-addressed `compile` (`:116`) and the underlying `#ajv.compile`
    (`:149`). In the installed `ajv` 8.20.0: `strictNumbers` derives from
    `strict` (`node_modules/ajv/dist/core.js:74`), `checkDataType`
    (`node_modules/ajv/dist/compile/validate/dataType.js:129`) routes `number`
    (`:144`) and `integer` (`:141–142`) through `numCond` (`:151–152`), whose
    `isFinite(data)` conjunct is emitted **only** when `strictNums` is true.
    Every other AJV boundary in the runtime shares this seam, which is what
    bounds §Fix (d).
  - **The lowering.** `lowerQueryResponseSchema`
    (`src/runtime/query-schema-lowering.ts:113`), reached with the theta body's
    decls through the module-private `schemaDeclsOf` / `enumDeclsOf`
    (`production-theta-producer.ts:3584–3585`). Measured outputs:
    `number` → `{"type":"number"}`, `integer` → `{"type":"integer"}`,
    `array<number>` → `{"type":"array","items":{"type":"number"}}`,
    `number | null` → `{"type":["number","null"]}`.
  - **Spec.** `docs/spec_topics/invocation.md:36` (§Final-value propagation
    across callees — the sentence this defect contradicts, and INV-5's
    envelope-only rule for the subagent leg), `:28` (§Typed return — the form
    that carries a value back; the untyped form discards it, which bounds the
    domain), `:55` (§Cross-mode semantics — the callee's mode selects
    conversation isolation and nothing else);
    `docs/spec_topics/runtime-value-model.md:8` (the `number` row, which names
    the non-finite results as the type's own values), `:34` (the inbound
    bullet's post-AJV ordering, which every route here is constrained by);
    `docs/spec_topics/expressions.md:232` (the division / modulo-by-zero
    disposition); `docs/spec_topics/query/query-escapes-stringification.md:22`
    (the `number` interpolation row, which renders all three non-finite values
    by name — the corpus's one existing decision about how a non-finite `number`
    crosses a boundary); `docs/spec_topics/diagnostics/code-registry-parse.md:26`
    (`theta/parse/number-literal-not-finite` — the one route the language
    closes); `docs/spec_topics/diagnostics/code-registry-runtime.md:43`
    (division and modulo by zero deliberately outside the panic catalogue);
    `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59) and
    `:110` (the `Ok`-values bullet whose parenthetical this defect falsifies);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
    observables (a) return values and (c) `theta-system-note` content strings).
    Reference mirror: `docs/reference/type-system.md:109`.
  - **The committed cells a fix must not red.**
    `tests/expression-evaluator.test.ts:207` (`/` produces `number` and `n / 0`
    is `±Infinity` without panic) and `:213` (`0 / 0` and `n % 0` are `NaN`) pin
    the *evaluation* half and must stay green under every route — a route that
    refuses non-finite arithmetic at the operator is out of scope by §Non-goals.
    `tests/subagent-envelope.test.ts:59` declares the eight-value `OK_VALUES`
    round-trip corpus (`"hello"`, `42`, `3.14`, `true`, `false`, `null`,
    `[1,2,3]`, one nested object) driven at `:178–186`; **no row is non-finite**,
    which is why the envelope's lossy arm is unwitnessed.
    `tests/invoke-return-enum-carrier-projection.test.ts` (0174's unit witness,
    16 cells, including a `SUBAGENT LEG` cell (`:842`) over
    `serializeOkEnvelope`/`parseEnvelopeLine`) and
    `tests/invoke-prompt-cell-enum-return.test.ts` (0174's integration witness)
    both drive this gate for the enum class and must stay green.
    `tests/invoke-ceiling-depth.test.ts:105` pins that the ceiling-#4 depth walk
    is the first sub-check at this boundary, so a route must not reorder it.
    `tests/division-result-type-number.test.ts` and
    `tests/division-result-type-number-invoke.test.ts` judge the *static type*
    `/` assigns at let-, argument- and field-sinks; neither reaches a return
    boundary and neither is affected.
    `tests/live/hardening/session-invoke-attach.test.ts:95` drives the attach
    topology with `let v: number = invoke<number>("./ppnum.theta")?` — the one
    live cell already on this annotation, and the natural home for a live row.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files. **None performs a division or a modulo**: the only `/` and `%`
    occurrences in the tracked set are inside comment prose
    (`tests/live/acceptance/fixtures/acc-imports-invoke.theta:4`,
    `tests/live/acceptance/fixtures/acc-params-binder.theta:12`). No committed
    fixture can therefore mint a non-finite value, and the committed-fixture
    parse gate never meets one.
- **Observed at:** v0.98.0 (`a1eec82c`). Offline, deterministic, provider-free:
  one scratch vitest probe driving the REAL in-process prompt→prompt attach cell
  end to end (`parseThetaDocument` →
  `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
  `executeBody`, explicit `invoke<T>("./kidp.theta")` form, a real
  `AjvSchemaValidator` on the runtime root behind a pass-through recording
  `SchemaValidator` decorator) and the subagent leg's own seams
  (`serializeOkEnvelope` → `parseEnvelopeLine` → the same compiled document),
  plus `projectForValidation` and `lowerQueryResponseSchema` directly and one
  direct construction of the installed `ajv` 8.20.0 under both `strict` settings.
  Every theta body is a pure tail expression, so zero model turns were spent.
  Written, run, deleted; the tree carries no scratch file from it. Every value in
  §Reproduction is that run's output verbatim.
  **The measurements were additionally re-run against a pristine `HEAD`
  checkout** (`git archive HEAD` into a temp directory outside the repository,
  the repository's `node_modules` junctioned in), because the working tree
  carried an unrelated in-flight `src/parser/` change at the time. Every measured
  line is byte-identical between the two runs; only wall-clock timestamps differ.

## Summary

`invocation.md:36` fixes the return surface as mode-invariant: "A `prompt`-mode
child attaches to the caller's current conversation, but the final value still
propagates through the same return surface." For a typed `invoke<T>` whose
payload carries a non-finite `number` at any position, it is not — and the
failure is the mirror image of the one bug 0174 fixed at 0.98.0.

A non-finite `number` is a specified theta value, not an accident.
`expressions.md:232` fixes that division by zero "produces IEEE-754 `Infinity` /
`-Infinity` / `NaN` per JS semantics; it does not panic", the `number` row of the
value model restates it (`runtime-value-model.md:8`), and the query-interpolation
table renders all three by name
(`query-escapes-stringification.md:22`). Three source spellings produce one with
`[]` diagnostics: `1 / 0`, `0 / 0` / `n % 0`, and finite-literal overflow
(`1e308 * 10`). The one route the language closes is the literal — `1e400` is
refused at lex with `theta/parse/number-literal-not-finite`.

`#validateInvokeReturn` (`production-theta-producer.ts:3564`) compiles the
lowered annotation and validates the callee's `Ok` payload through
`projectForValidation` (`:3591`). A `number` takes that function's
`!isPlainObject` pass-through arm (`wire-translation.ts:519–520`), so what AJV
sees differs by cell — and this time it is the *subagent* leg that is altered:

| cell | what reaches `:3591` | AJV verdict, `{"type":"number"}` |
| --- | --- | --- |
| prompt→prompt attach (`:3410`) | the callee's own `Infinity` | `{"ok":true}` |
| subagent spawn (`:3448`) | `null` — `JSON.stringify(Infinity)` | `{"ok":false}` `must be number` |

The prompt leg's `{"ok":true}` is not a coincidence either. The seam builds AJV
with `{ strict: false, … }` (`schema-validator.ts:112`), `strict` feeds
`strictNumbers` (`ajv/dist/core.js:74`), and `strictNumbers` is the flag that
emits AJV's `isFinite` conjunct in the `number` type check
(`ajv/dist/compile/validate/dataType.js:151–152`). Under `strict: true` the same
document refuses `Infinity`.

So one callee body, byte-identical but for `mode:`, produces:

- `invoke<number>` — `Ok(Infinity)` on the prompt cell,
  `Err(InvokeInfraError { cause: "return_validation" })` on the subagent cell.
- `invoke<number | null>` — `Ok(Infinity)` on the prompt cell, `Ok(null)` on the
  subagent cell. **Neither refuses**, the two values differ, and nothing reports
  it.

The same holds one level down: `invoke<Box>` over
`schema Box { n: number, who: string }` returning `Box { n: 1 / 0, who: "w" }` is
`Ok({n:Infinity,who:"w"})` on the prompt cell and `{"ok":false}` at `/n` on the
subagent leg; `invoke<array<number>>` returning `[1 / 0, 0 / 0]` is
`Ok([Infinity,NaN])` against `{"ok":false}` at `/0` and `/1`. Under `integer` the
split is finer still: the subagent leg refuses all three non-finite values,
while the prompt leg admits `Infinity` and `-Infinity` and refuses only `NaN`,
because AJV's `integer` check adds `!isNaN(data)` and nothing else
(`dataType.js:141–142`).

PIC-59's `Ok`-values bullet
(`docs/spec_topics/pi-integration-contract/subagent.md:110`) states the premise
that fails: "**`Ok` values** serialise per the runtime value model
(JSON-representable by construction)." A non-finite `number` *is* a runtime value
per `runtime-value-model.md:8` and is *not* JSON-representable. The
`serializeOkEnvelope` doc-comment repeats the same claim in the code
(`subagent-envelope.ts:90–92`). The envelope neither refuses the value nor
carries it; it substitutes `null` and continues.

## Reproduction

Offline, deterministic, provider-free, at HEAD `a1eec82c`. One scratch vitest
probe; written, run, deleted. Output verbatim.

### (a) Which theta-source spellings produce a non-finite `number`

Real `parseThetaDocument` over the callee body, then the real prompt→prompt
attach cell under `invoke<number>`. The right-hand column is what the recording
decorator saw at the shipped AJV seam and the verdict it returned.

```
--- A: parse diagnostics for each spelling (callee body) ---
  1 / 0              diags []
  -1 / 0             diags []
  0 / 0              diags []
  1 % 0              diags []
  let-bound 1 / 0    diags []
  1.0 / 0.0          diags []
  1e308 * 10         diags []
  control 3 / 2      diags []

--- A: invoke<number> of a prompt-mode callee, per spelling ---
  1 / 0              Ok(Infinity) typeof=number  | AJV saw Infinity -> {"ok":true}
  -1 / 0             Ok(-Infinity) typeof=number  | AJV saw -Infinity -> {"ok":true}
  0 / 0              Ok(NaN) typeof=number  | AJV saw NaN -> {"ok":true}
  1 % 0              Ok(NaN) typeof=number  | AJV saw NaN -> {"ok":true}
  let-bound 1 / 0    Ok(Infinity) typeof=number  | AJV saw Infinity -> {"ok":true}
  1.0 / 0.0          Ok(Infinity) typeof=number  | AJV saw Infinity -> {"ok":true}
  1e308 * 10         Ok(Infinity) typeof=number  | AJV saw Infinity -> {"ok":true}
  control 3 / 2      Ok(1.5) typeof=number  | AJV saw 1.5 -> {"ok":true}
```

And the route the language closes:

```
--- F: non-finite LITERALS at lex ---
  1e400                  diags ["error:theta/parse/number-literal-not-finite"]
  let n: number = 1e400  diags ["error:theta/parse/number-literal-not-finite"]
  1e308                  diags []
```

Three reachable classes: division by zero (`Infinity` / `-Infinity` / `NaN`),
modulo by zero (`NaN`), and finite-literal arithmetic overflow. Every one loads
with zero diagnostics.

### (b) The subagent leg over the same values

The child's own `serializeOkEnvelope`, the parent's own `parseEnvelopeLine`, and
the same compiled `{"type":"number"}` document applied to what each leg presents.

```
--- B: lowering ---
  number        -> {"type":"number"}
  integer       -> {"type":"integer"}
  array<number> -> {"type":"array","items":{"type":"number"}}

--- B: envelope round trip + both legs' AJV verdicts, {"type":"number"} ---
  Infinity       envelope "{\"theta_result\":{\"v\":1,\"ok\":null}}"
                   re-read null typeof=object
                   PROMPT leg AJV {"ok":true}
                   SUBAGENT leg AJV {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/type","keyword":"type","message":"must be number","params":{"type":"number"}}]}
  -Infinity      envelope "{\"theta_result\":{\"v\":1,\"ok\":null}}"
                   re-read null typeof=object
                   PROMPT leg AJV {"ok":true}
                   SUBAGENT leg AJV {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/type","keyword":"type","message":"must be number","params":{"type":"number"}}]}
  NaN            envelope "{\"theta_result\":{\"v\":1,\"ok\":null}}"
                   re-read null typeof=object
                   PROMPT leg AJV {"ok":true}
                   SUBAGENT leg AJV {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/type","keyword":"type","message":"must be number","params":{"type":"number"}}]}
  1.5 (control)  envelope "{\"theta_result\":{\"v\":1,\"ok\":1.5}}"
                   re-read 1.5 typeof=number
                   PROMPT leg AJV {"ok":true}
                   SUBAGENT leg AJV {"ok":true}

--- B: same values under {"type":"integer"} ---
  Infinity       prompt {"ok":true} | subagent {"ok":false,…"message":"must be integer"…}
  -Infinity      prompt {"ok":true} | subagent {"ok":false,…"message":"must be integer"…}
  NaN            prompt {"ok":false,…"message":"must be integer"…} | subagent {"ok":false,…"message":"must be integer"…}
  3 (control)    prompt {"ok":true} | subagent {"ok":true}
```

The `1.5` control crosses both legs unchanged, so the leg itself is sound: the
loss is specific to the values `JSON.stringify` has no form for. The `integer`
block is the finer split — `NaN` is the one non-finite value AJV's `integer`
check rejects even with `strictNumbers` off, so `invoke<integer>` is
mode-invariant for `NaN` and mode-variant for `±Infinity`.

The `Err` carrier that follows the subagent leg's `{"ok":false}` is read from
source, not driven here: `#validateInvokeReturn` has exactly one failure arm
(`production-theta-producer.ts:3603–3609`) and it mints
`InvokeInfraError { kind: "invoke_infra", message: "invoke<number> return value
failed validation", callee_path, cause: "return_validation" }` — the same carrier
bug 0174 measured end to end for its own class.

### (c) `projectForValidation` over non-finite numbers

```
--- C: projectForValidation ---
  root Infinity   -> Infinity
  root -Infinity  -> -Infinity
  root NaN        -> NaN
  {n: Infinity}   -> same reference? true n=Infinity
  {n: NaN}        -> same reference? false n=NaN
  [Inf,-Inf]      -> same reference? true elems=Infinity,-Infinity
  [Inf,-Inf,NaN]  -> same reference? false elems=Infinity,-Infinity,NaN
  JSON.stringify({n:Infinity}) -> {"n":null,"who":"w"}
  JSON.stringify([Inf,-Inf,NaN]) -> [null,null,null]
```

Two facts. First, the projection is transparent to a non-finite `number` at every
depth — the `!isPlainObject` arm (`wire-translation.ts:519–520`) returns it
unchanged, so what AJV judges on the prompt leg is the callee's own value.
Second, the copy-on-change property is **not** universal: the walk's identity
tests are `next !== element` (`:504`) and `next !== fieldValue` (`:526`), and
`NaN !== NaN`, so any container holding a `NaN` is copied although no descendant
was collapsed. That falsifies the doc-comment clause at
`production-theta-producer.ts:3541–3542` ("copy-on-change, so where no descendant
needs collapsing the projection is the payload, unchanged") for exactly this
value. It is **observationally inert today** — the copy is structurally identical
and is discarded after the `validate` call, and the `verdict.ok` arm binds
`result.value` (`:3599`), the original — so it is recorded as a §Fix (e)
constraint, not as a second defect.

### (d) Nested positions, both legs

```
--- D: nested positions, prompt leg ---
  invoke<Box>{n:1/0}     Ok({n:Infinity,who:"w"}) typeof=object | AJV saw {n:Infinity,who:"w"} -> {"ok":true} | schema {"type":"object","properties":{"n":{"type":"number"},"who":{"type":"string"}},"required":["n","who"],"additionalProperties":false}
  invoke<array<number>>  Ok([Infinity,NaN]) typeof=object | AJV saw [Infinity,NaN] -> {"ok":true} | schema {"type":"array","items":{"type":"number"}}
  invoke<Box>{n:2}ctl    Ok({n:2,who:"w"}) typeof=object | AJV saw {n:2,who:"w"} -> {"ok":true} | schema {"type":"object","properties":{"n":{"type":"number"},"who":{"type":"string"}},"required":["n","who"],"additionalProperties":false}

--- D: the same payloads through the subagent leg's serialisation ---
  Box{n:Infinity}    envelope "{\"theta_result\":{\"v\":1,\"ok\":{\"n\":null,\"who\":\"w\"}}}"
                       PROMPT leg AJV {"ok":true}
                       SUBAGENT leg AJV {"ok":false,"errors":[{"instancePath":"/n","schemaPath":"#/properties/n/type","keyword":"type","message":"must be number","params":{"type":"number"}}]}
  [Inf, NaN]         envelope "{\"theta_result\":{\"v\":1,\"ok\":[null,null]}}"
                       PROMPT leg AJV {"ok":true}
                       SUBAGENT leg AJV {"ok":false,"errors":[{"instancePath":"/0","schemaPath":"#/items/type","keyword":"type","message":"must be number","params":{"type":"number"}}, …"/1"…]}
```

The callee bodies are
`schema Box { n: number, who: string }` / `Box { n: 1 / 0, who: "w" }` and
`[1 / 0, 0 / 0]`, and the `Box { n: 2, who: "w" }` row is the control: a finite
field crosses both legs. One non-finite field anywhere in a returned schema is
enough to split the verdicts, at `/n` and at `/0`.

### (e) The nullable arm — both legs return `Ok`, with different values

```
--- F: nullable annotation, both legs ---
  lowering number | null  -> {"type":["number","null"]}
  lowering array<number>  -> {"type":"array","items":{"type":"number"}}
  prompt leg Infinity   -> {"ok":true}
  subagent leg re-read  -> null {"ok":true}
  Box{n: number|null} prompt {"ok":true} | subagent {"ok":true} value {"n":null,"who":"w"}
  prompt cell invoke<NBox>         -> Ok({n:Infinity,who:"w"}) typeof=object | AJV {"ok":true}
  prompt cell invoke<number|null>  -> Ok(Infinity) typeof=number | AJV {"ok":true}
```

`NBox` is `schema NBox { n: number | null, who: string }` and the callee body is
`NBox { n: 1 / 0, who: "w" }`; both parse with `[]` diagnostics. The prompt-cell
rows are driven end to end. The subagent-leg rows are the AJV verdict over the
value the envelope actually carries; the last hop — `#validateInvokeReturn`'s
`verdict.ok` arm binding `validated: result.value`
(`production-theta-producer.ts:3592–3601`, the bind at `:3599`), fed from the
driver's `settle({ok:true, value: parse.value})`
(`subagent-json-driver.ts:118`, `:121`) — is read from source, not driven. On
that reading the caller binds `null` where the callee produced `Infinity`, with
no diagnostic on either side.

### (f) Why AJV admits it on the prompt leg

```
--- E: seam options ---
  {"type":"number"} vs Infinity : {"ok":true}
  raw ajv strict:true  vs Infinity : false [{"instancePath":"","schemaPath":"#/type","keyword":"type","params":{"type":"number"},"message":"must be number"}]
  raw ajv strict:false vs Infinity : true
  raw ajv strict:false vs NaN      : true
  raw ajv strict:false vs null     : false [{"instancePath":"","schemaPath":"#/type","keyword":"type","params":{"type":"number"},"message":"must be number"}]
```

The first row is the shipped seam. The next three are the installed `ajv` 8.20.0
constructed directly, isolating the flag: `strict: true` refuses `Infinity`,
`strict: false` admits it. `strict: false` is what
`src/seams/schema-validator.ts:112` passes, and `requiredOptions`
(`ajv/dist/core.js:74`) derives `strictNumbers` from it, which is the conjunct
switch at `dataType.js:151–152`. The last row is the control: `null` is refused
under `{"type":"number"}` regardless, which is why the subagent leg's substituted
value fails.

## Expected behaviour

- **`docs/spec_topics/invocation.md:36` (§Final-value propagation across
  callees)** — the sentence this defect contradicts, verbatim: "A `prompt`-mode
  child attaches to the caller's current conversation, but the final value still
  propagates through the same return surface." The same paragraph fixes the
  subagent leg's *mechanism* — the value "crosses the subagent boundary as the
  `ok` arm of the single-JSONL-line `{"theta_result": …}` return envelope" — and
  INV-5 requires the parent to "derive the `invoke` result solely from the
  child's `theta_result` envelope". The envelope is specified as that leg's
  carriage; nothing specifies it as a filter on which values may propagate.
- **`docs/spec_topics/invocation.md:55` (§Cross-mode semantics)** — "The callee's
  mode controls whether it gets a fresh conversation or attaches to its caller's
  current conversation. The caller's mode is irrelevant to that decision." The
  mode selects conversation isolation. It is not specified to select whether a
  return value validates, nor which value the caller binds.
- **`docs/spec_topics/runtime-value-model.md:8` (the `number` row)** — "JS
  `number` (the static type system enforces the distinction; at runtime they are
  the same value). Division produces IEEE-754 `Infinity` / `NaN` per JS
  semantics." The non-finite results are named as values of the type, not as
  errors. `docs/reference/type-system.md:109` mirrors it.
- **`docs/spec_topics/expressions.md:232`** — "Division by zero produces IEEE-754
  `Infinity` / `-Infinity` / `NaN` per JS semantics; it does not panic. Modulo by
  zero (`n % 0`) likewise produces `NaN` and does not panic." Read with
  `docs/spec_topics/diagnostics/code-registry-runtime.md:43` ("Division by zero,
  modulo by zero, integer overflow … are deliberately not in theta 1.0.0's panic
  catalogue"), this is a decision to let the value exist, taken twice.
- **`docs/spec_topics/query/query-escapes-stringification.md:22`** — the corpus's
  one existing ruling on a non-finite `number` crossing a boundary: the `number`
  interpolation row is "finite values per BNDR-5 …; `NaN` → `NaN`; `Infinity` →
  `Infinity`; `-Infinity` → `-Infinity`". The interpolation surface enumerates
  the three values and gives each a rendering rather than treating them as
  unreachable. The return surface enumerates nothing.
- **`docs/spec_topics/pi-integration-contract/subagent.md:110` (PIC-59, `Ok`
  values)** — "**`Ok` values** serialise per the runtime value model
  (JSON-representable by construction)." The parenthetical is the premise the
  envelope is built on and it is false for this class: a non-finite `number` is a
  runtime value the value model names and JSON has no form for. The same claim
  appears in the code at `src/runtime/subagent-envelope.ts:90–92`. Whichever way
  §Fix goes, this sentence is wrong at HEAD and is corrected in the same commit.
- **`docs/spec_topics/diagnostics/code-registry-parse.md:26`** — the language's
  own precedent for refusing a non-finite `number`:
  `theta/parse/number-literal-not-finite`, "A `number`-typed literal whose parsed
  value is not a finite IEEE-754 double (e.g. `1e400`, which parses to
  `Infinity`)." The literal route is closed with a registered diagnostic; the
  computed route is open by design (`expressions.md:232`). A route that refuses
  computed non-finite values at the envelope is adding a *second* closure and
  owes the same explicitness.
- **`docs/spec_topics/governance/source-language-stability.md:5` (GOV-15)** —
  observable (a), identical return values for any given input, and observable
  (c), equivalent `theta-system-note` content strings. Both move here: (a)
  already moves at HEAD *between modes*, which is the defect; and every candidate
  in §Fix moves (a) or (c) *between releases* for some input that loads cleanly
  today. That is why §Fix is an adjudication rather than a patch.

## Actual behaviour / root cause

**1. The value class is legal, computed, and unrepresentable in JSON.** Three
spellings mint it from clean source (§Reproduction (a)) and the spec blesses all
three. JSON has no non-finite number form, and `JSON.stringify` answers `null`
rather than throwing. The language's type system says `number`; the wire's type
system says "no such value". Nothing in the runtime reconciles the two.

**2. The prompt cell hands the value to AJV and AJV is configured not to look.**
`projectForValidation` exists to normalise *representation* — it collapses the
boxed `String` enum carrier (`wire-translation.ts:495–499`) — and a `number` is
not a representation problem, so it takes the `!isPlainObject` pass-through
(`:519–520`). The value then meets a validator built with `strict: false`
(`schema-validator.ts:112`). In `ajv` 8.20.0 that setting propagates to
`strictNumbers` (`core.js:74`), and `strictNumbers` is precisely the switch that
emits `isFinite(data)` into the compiled `number` check
(`dataType.js:151–152`). The prompt leg's `{"ok":true}` is therefore produced by
an AJV option chosen for schema-strictness reasons, not by any decision about
non-finite values.

**3. The subagent leg substitutes silently and then refuses its own
substitution.** `serializeOkEnvelope` (`subagent-envelope.ts:94`) is
`JSON.stringify` of the payload (`:96`):

```ts
export function serializeOkEnvelope(value: unknown): string {
  const payload: EnvelopeOk = { v: THETA_ENVELOPE_VERSION, ok: value };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}
```

Its doc-comment asserts the input is "JSON-representable per the runtime value
model" (`:90–92`) and nothing checks that. `JSON.stringify(Infinity)` is `null`,
so the child emits `{"theta_result":{"v":1,"ok":null}}` — a well-formed envelope
carrying a value the callee never produced. The parent parses it
(`:149`, `:152`), settles it as the `Ok` payload
(`subagent-json-driver.ts:118`, `:121`), and hands it to the gate at
`production-theta-producer.ts:3448`. The refusal that follows is AJV correctly
rejecting `null` under `{"type":"number"}`. **The corruption happens in the
child; the diagnosis happens in the parent; and the message the author reads —
`invoke<number> return value failed validation` (`:3605`) — names the annotation
and blames the callee's return value, which was of the annotated type.**

**4. When the annotation admits `null`, nothing diagnoses anything.**
`number | null` lowers to `{"type":["number","null"]}` and the substituted `null`
is a member. Both legs return `Ok`; the values are `Infinity` and `null`. This is
the same mechanism as element 3 with the type-refusal removed, so the loudness of
the defect is a property of the *annotation*, not of the defect. A schema with
one nullable numeric field has the same property (§Reproduction (e)).

**5. Two shipped sentences claim the invariant this breaks, and one of them was
narrowed for this exact reason.** PIC-59's `Ok`-values bullet
(`subagent.md:110`) and the `serializeOkEnvelope` doc-comment
(`subagent-envelope.ts:90–92`) both assert JSON-representability by
construction; §Reproduction (b) falsifies both. Meanwhile
`#validateInvokeReturn`'s doc-comment already carries the scar: bug 0174's fix
deliberately scoped its conclusion to "whether a **named-enum** return
validates" (`production-theta-producer.ts:3546–3547`) after its review round 1
measured this counterexample. The scoping is correct and is not a defect; it is
the record that the general claim is false and was left false.

**6. Nothing is witnessed.** `tests/subagent-envelope.test.ts:59` round-trips
eight `Ok` values (`:178–186`) and none is non-finite, so the envelope's lossy
arm has no cell. `tests/expression-evaluator.test.ts:207`, `:213` pin that the
values are *produced* but never carry one across a boundary. No committed
`.theta` / `.thetalib` divides or takes a modulo at all (census: 0 of 34). The
class is produced by the language, named by the spec, and untested at every
boundary that loses it.

## Why it matters

- **A caller can bind a value its callee never returned, with no diagnostic.**
  Under `invoke<number | null>` the subagent leg binds `null` where the callee
  produced `Infinity` (§Reproduction (e)). That is GOV-15 observable (a) moving
  on `mode:` frontmatter alone, and no channel reports it — no diagnostic code,
  no runtime event, no system note.
- **On the non-nullable annotation the failure is loud and misattributed.** The
  author reads `invoke<number> return value failed validation` and inspects a
  callee that returned exactly the annotated type. The value was destroyed in
  the child's envelope writer, one process away from the message.
- **The two legs disagree at every depth and per annotation.** Measured at the
  root, at a schema field (`/n`), at an array element (`/0`, `/1`), and
  differently again under `integer`, where `±Infinity` splits by mode and `NaN`
  does not. An author cannot predict the boundary's behaviour from the value's
  type.
- **The workaround is a mode change, and the modes are not interchangeable.**
  `invocation.md:55` fixes that a subagent-mode callee gets a fresh isolated
  conversation rather than attaching to the caller's. An author who reaches for
  `mode: prompt` to make the refusal stop trades conversation isolation for it,
  and nothing says so.
- **Two shipped sentences are false and one is load-bearing.** PIC-59's
  "JSON-representable by construction" (`subagent.md:110`) is the premise the
  whole `Ok` arm of the envelope rests on. It is wrong for a value class the
  spec mints in two other places.
- **It is exactly the class bug 0174 fixed, reflected.** 0174's subject was a
  value the prompt cell preserved and the envelope normalised; this is a value
  the prompt cell preserves and the envelope destroys. Both are the same
  unanswered question — where in the return surface a value is normalised, and
  against whose type system — and the runtime still answers it by accident on
  one leg and not at all on the other.
- **Nothing gates it.** No committed fixture divides; the envelope witness's
  eight-value corpus has no non-finite row; no committed test drives a typed
  `invoke<T>` return of a non-finite value on either leg. The cell is unwitnessed
  in both directions.

## Fix

Not settled. The surface and the mechanism are fixed and measured; *which leg
moves* is not, because every candidate collides with GOV-15 from a different
side. The run selects one and states the evidence that decided it. Every route
carries the constraints in (e) and corrects the two false sentences in (f).

### (a) Normalise the prompt cell — project non-finite → `null` before AJV

Extend `projectForValidation` (`wire-translation.ts:494`) so a non-finite
`number` projects to `null`, matching what `JSON.stringify` does on the other
leg. Both cells then present AJV the same shape.

- **It makes the two legs identical by construction**, which is what
  `invocation.md:36` requires and what the mechanism-level fix looks like.
- **It is BLOCKED by GOV-15 as stated in 0174's own record.** That report's
  residual R1 says it directly: "normalising it would newly refuse a today-passing
  prompt-cell input, which GOV-15 forbids". Measured here: `invoke<number>`
  returning `1 / 0` is `Ok(Infinity)` at HEAD on the prompt cell
  (§Reproduction (a)); under this route it becomes
  `Err(InvokeInfraError { cause: "return_validation" })`. That is observable (a)
  moving from a value to a refusal for a file that loads cleanly under 1.0.0.
- **It leaves the silent arm exactly where it is.** Under `invoke<number | null>`
  the projection would validate and the `verdict.ok` arm would still bind
  `result.value` — the original `Infinity` — because bug 0174's shipped route
  validates a projection and hands the ORIGINAL value downstream
  (`production-theta-producer.ts:3591`, `:3599`). So the prompt cell would keep
  binding `Infinity` while the subagent cell binds `null`, and the projection
  change would have moved nothing on the arm that is silent. A route taking (a)
  states what it does about that arm.
- **A route taking (a) must argue the GOV-15 exception explicitly**, not
  incidentally: which release-note class it falls under, and why refusing a
  today-passing input is the lesser cost. It cannot be taken by default.

### (b) Refuse child-side — make the envelope fail closed on a non-finite `Ok`

Have the child detect a non-finite `number` anywhere in the `Ok` payload before
`serializeOkEnvelope` and emit an `err` envelope instead — a registered
diagnostic and an `InvokeInfraError` naming the value and its position, rather
than an envelope carrying a substituted `null`.

- **It removes the silent arm entirely**, which is the S1 half of this report:
  no caller ever binds a `null` the callee did not produce. It also puts the
  diagnosis in the process where the corruption happens, which is where the
  position information (`/n`, `/0`) is still true of the real value.
- **It is GOV-15-relevant in the opposite direction to (a).** Today
  `invoke<number | null>` of a subagent callee returning `1 / 0` succeeds with
  `Ok(null)`; under this route it becomes an `Err`. A success becomes a refusal
  — the same class of move (a) makes, on the other leg. Measured, this is the
  only annotation shape affected: under a non-nullable annotation the subagent
  leg already fails, so the route changes the *carrier and the message*, not the
  outcome.
- **It needs a registered code and its same-commit spec edits.** PIC-59's
  fail-closed inventory (`subagent.md:112–113`) enumerates schema skew, parse
  failure and exit-without-envelope; a fourth cause is a registry-level change
  (`docs/spec_topics/diagnostics/code-registry-runtime.md`) plus the PIC-59 bullet
  correction (f) already owes.
- **It leaves the prompt leg admitting `Infinity`**, so `invocation.md:36` holds
  only in the weak sense that both legs now *report* rather than disagree
  silently. A route taking (b) states whether that is the intended end state or
  a first half.

### (c) Document the variance — a spec sentence, no code change

State in `invocation.md` §Final-value propagation (and mirror in PIC-59) that a
non-finite `number` does not survive the subagent envelope, that its behaviour is
therefore mode-dependent, and what a caller observes on each leg and each
annotation shape.

- **It is the honest floor and it moves nothing.** No input's verdict changes, so
  GOV-15 observables (a) and (c) are untouched. It converts an unstated
  divergence into a stated one.
- **It leaves the S1 arm live.** A caller still binds `null` for `Infinity` under
  a nullable annotation with no diagnostic; the document would say so, and the
  program would still do it. This is a floor, not a remedy, and a route taking
  only (c) says why the silent bind is acceptable.
- **It is a genuine cost saving only if (a), (b) and (d) are all refused.**
  Otherwise the spec sentence is written twice — once here and once by whichever
  route lands.

### (d) Flip `strictNumbers` at the seam

Pass `strictNumbers: true` explicitly at `AjvSchemaValidator`'s construction
(`schema-validator.ts:112`), restoring the `isFinite` conjunct
(`dataType.js:151–152`) that `strict: false` currently suppresses. Both legs then
refuse a non-finite `number` under `{"type":"number"}` — the prompt cell at the
value, the subagent cell at the substituted `null`.

- **It is a one-word change and it makes the *verdict* mode-invariant**, which is
  the narrowest reading of `invocation.md:36`. Measured: `strict: true` refuses
  `Infinity` where `strict: false` admits it (§Reproduction (f)).
- **Its blast radius is every AJV boundary in the runtime**, not this one. The
  seam has seven `compile` call sites in `src/` at HEAD — the binder envelope
  validator, the binder's post-default-merge check, the subagent-root params
  intake, the respond-tool payload check, the Pi-tool `parameters` check, the
  typed-query loop, and this gate. A route here re-measures each: model-produced
  JSON cannot carry a non-finite number (JSON has no form for one), so the
  boundaries fed by `JSON.parse` are inert by construction — but "inert" is a
  claim to measure, not assume, and binder `args` and `params:` defaults are
  theta-side values, not parsed JSON.
- **It has the same GOV-15 shape as (a)** — a today-passing prompt-cell input is
  newly refused — with a wider surface, and it decouples the seam's numeric
  strictness from its schema strictness, which is a posture the seam does not
  currently state either way.
- **It does not fix the silent arm.** Under `{"type":["number","null"]}` the
  subagent leg's `null` still validates, so the two legs still bind different
  values. (d) is a verdict fix, not a value fix.

### (e) Constraints every route carries

1. **`invocation.md:36` is the sentence under test, and the two annotations are
   both in scope.** A route that makes `invoke<number>` mode-invariant and leaves
   `invoke<number | null>` binding two different values has fixed the loud half
   and left the silent half, which is the S1 half. It says so explicitly if that
   is the chosen bound.
2. **The evaluation semantics do not move.** `expressions.md:232` fixes that
   `n / 0` and `n % 0` produce non-finite values without panicking, and
   `tests/expression-evaluator.test.ts:207` / `:213` pin it. No route refuses the
   arithmetic, adds a panic, or changes a static type; §Non-goals repeats this.
3. **The ceiling-#4 depth walk stays first.** `enforceInvokeReturnDepth`
   (`production-theta-producer.ts:3578`) runs before the lowering and before AJV,
   and `tests/invoke-ceiling-depth.test.ts:105` pins it as the first sub-check at
   this boundary. Any normalisation or refusal added at this gate goes after it.
4. **The translation pass stays after AJV.** `runtime-value-model.md:34` fixes
   the inbound pass "after AJV validation against the lowered schema" and bug
   0067's fix landed it in that order; the `verdict.ok` arm
   (`production-theta-producer.ts:3592–3601`) does not move.
5. **Bug 0174's route is not revisited.** `#validateInvokeReturn` validates a
   projection and binds the ORIGINAL value (`:3591`, `:3599`). A route touching
   `projectForValidation` preserves that split and re-runs 0174's two witnesses
   green.
6. **The copy-on-change claim is corrected or made true.** §Reproduction (c)
   measures that a container holding `NaN` is copied although nothing was
   collapsed, because the walk's identity tests are `!==` (`:504`, `:526`) and
   `NaN !== NaN`. The doc-comment at
   `production-theta-producer.ts:3541–3542` claims otherwise. A route either
   changes the tests to `Object.is`-style identity or narrows the sentence; it
   does not leave a measured-false claim standing.
7. **GOV-15 is named, not absorbed.** Every route except (c) moves observable (a)
   for at least one input that loads cleanly today. The chosen route enumerates
   exactly which spellings flip and in which direction, in the form 0174's
   `## Fix (0.98.0)` GOV-15 block uses.
8. **Witness — unit, offline, provider-free.** The unit half re-drives
   §Reproduction (a), (b), (d) and (e) over the shipped seams: the real
   prompt→prompt attach cell for the prompt leg,
   `serializeOkEnvelope`/`parseEnvelopeLine` plus the production
   `AjvSchemaValidator` for the subagent leg, at the root, at a schema field and
   at an array element, under `number`, `integer` and `number | null`. The
   `1.5` / `Box { n: 2 }` finite controls are the over-reach fence and assert
   UNCHANGED values. If (b) is chosen, the child-side refusal is driven through
   the real envelope writer. Each new assertion is proved both directions once —
   red with the change neutralised, green with it restored.

### (f) Same-commit corrections every route carries

1. **PIC-59's `Ok`-values bullet**
   (`docs/spec_topics/pi-integration-contract/subagent.md:110`) — "(JSON-representable
   by construction)" is false for a non-finite `number` and is the premise the
   envelope's `Ok` arm rests on. Corrected to state what actually holds under the
   chosen route.
2. **`serializeOkEnvelope`'s doc-comment**
   (`src/runtime/subagent-envelope.ts:90–92`) — the same claim in the code, at
   the function that performs the substitution.

### (g) Ordering

Nothing blocks this report and it blocks nothing.
[0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) is fixed
(0.98.0); a route touching `projectForValidation` or `#validateInvokeReturn`
rebases onto its hunks and re-runs its two witnesses.
[0152](./0152-modulo-zero-result-type-not-number.md) is open on `%`'s static
result type and shares no file with any route here.

## Non-goals

- **Changing what `/` and `%` produce.** `expressions.md:232` fixes that division
  and modulo by zero yield IEEE-754 `Infinity` / `-Infinity` / `NaN` without
  panicking, and `code-registry-runtime.md:43` records the exclusion from the
  panic catalogue as deliberate. No route here adds a panic, a diagnostic at the
  operator, or a static-type change. `tests/expression-evaluator.test.ts:207` and
  `:213` stay green untouched.
- **The static result types of `/` and `%`.**
  [0142](./0142-division-result-type-not-number.md) (fixed, 0.80.0) and
  [0152](./0152-modulo-zero-result-type-not-number.md) (open) own those. This
  report is about a value at a return boundary, whatever static type the operator
  assigned it.
- **Bug 0174's enum carrier.** Fixed at 0.98.0. The boxed-`String` representation,
  `projectForValidation`'s collapse arm (`wire-translation.ts:495–499`), and the
  route-(b) split between the validated projection and the bound original are
  settled and are not reopened. This report's class takes a different arm of the
  same function.
- **The untyped `invoke(...)` discard.** `invocation.md:28` fixes that the
  untyped form returns `Result<null, QueryError>` and discards the callee's
  value; [0068](./0068-prompt-callee-invoke-final-value-null.md) settled the
  design question as wontfix. There is no value at that boundary to validate, so
  the untyped form cannot exhibit this defect on either leg — which is what
  bounds this report to the typed form.
- **Non-finite values on the query-interpolation surface.**
  `query-escapes-stringification.md:22` already decides that surface (`NaN` →
  `NaN`, `Infinity` → `Infinity`, `-Infinity` → `-Infinity`). It is cited here as
  evidence that the corpus contemplates the class, not as a surface to change.
- **The AJV seam's `strict: false` posture in general.** Whether the seam should
  be schema-strict is a separate question from whether it should be number-strict;
  §Fix (d) proposes decoupling only the numeric conjunct. Schema-level strictness
  (`strictSchema`, `strictTypes`, `strictTuples`) is untouched by every route.
- **The wording of the failure message.** `invoke<number> return value failed
  validation` (`production-theta-producer.ts:3605`) names the annotation and
  carries no AJV error detail. Whether it should is a separate question about
  every `return_validation` failure, not this class — the same disposition bug
  0174 §Non-goals took.
- **Other `JSON.stringify` holes at the envelope.** `undefined`, functions and
  symbols are not theta values, and `Result` never crosses the wire by
  specification (`runtime-value-model.md`, the `Result` row). Non-finite `number`
  is the one JSON hole a legal theta value can occupy; if a route finds a second,
  it records it rather than widening.

## Provenance

Filed as residual **R1** of the bug 0174 fix (0.98.0, commit `f912a8c3`). That
run's report (`.pi/tmp/fixes/0174-report.md` §*Residuals / notes*, R1 — "the
return surface's mode-invariance is still not total, for a different reason …
**Not filed** (a fix run creates no bug docs)") is the source, and the same
finding is recorded in that document's `## Fix (0.98.0)` §*Residuals* item 1 and
is the stated reason its corrected doc-comment scopes its conclusion to
named-enum returns (`production-theta-producer.ts:3546–3547`). R1 was measured in
that fix's review round 1.

**Re-verified at HEAD `a1eec82c` for this filing, not copied.** R1's bundle was
treated as a set of claims to check. Its four headline measurements reproduce
exactly: `1 / 0` yields `Infinity`; the prompt cell preserves it and AJV admits
it; `serializeOkEnvelope(Infinity)` is `{"theta_result":{"v":1,"ok":null}}`; the
parent's AJV refuses that under `{"type":"number"}`. Four things R1 does not say,
established here:

- **The nullable arm.** R1 states the defect only in its loud form
  (prompt admits / subagent refuses). Measured: under `number | null` — and under
  a nullable schema field — **neither leg refuses** and the two bind different
  values, `Infinity` against `null` (§Reproduction (e)). This is the S1 half of
  the report and it is not in R1's bundle.
- **Why the prompt leg admits.** R1 does not name the mechanism. It is the seam's
  `strict: false` construction (`schema-validator.ts:112`) feeding AJV's
  `strictNumbers` (`ajv/dist/core.js:74`), which gates the `isFinite` conjunct
  (`dataType.js:151–152`). Under `strict: true` the same document refuses
  `Infinity` (§Reproduction (f)). This is what makes §Fix (d) a candidate at all.
- **The reachable spelling set.** R1 names `n / 0`. Measured: `0 / 0` and `n % 0`
  produce `NaN`, and finite-literal overflow (`1e308 * 10`) produces `Infinity`,
  all with `[]` diagnostics; the non-finite *literal* is refused at lex
  (`theta/parse/number-literal-not-finite`). So the class is reachable from
  source by three distinct routes and closed on a fourth.
- **The `integer` split and the depth reach.** Under `{"type":"integer"}` the
  prompt leg admits `±Infinity` and refuses `NaN` — AJV's `integer` check adds
  `!isNaN(data)` and no finiteness test (`dataType.js:141–142`) — so the
  mode-variance is annotation-dependent. Measured at the root, at a schema field
  (`/n`) and at an array element (`/0`, `/1`).

**One measured over-claim in the shipped code, recorded not chased.**
`#validateInvokeReturn`'s doc-comment states that `projectForValidation` is
copy-on-change "so where no descendant needs collapsing the projection is the
payload, unchanged" (`production-theta-producer.ts:3541–3542`). The walk's
identity tests are `!==` (`wire-translation.ts:504`, `:526`) and `NaN !== NaN`,
so a container holding a `NaN` is copied although nothing was collapsed
(§Reproduction (c)). It is observationally inert at HEAD — the copy is
structurally identical, is discarded after the `validate` call, and the
`verdict.ok` arm binds the original (`:3599`) — so it is carried as §Fix (e)
constraint 6 rather than as a second report.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted). It drove the real in-process prompt→prompt attach cell end to end
for §Reproduction (a), (d) and (e)'s prompt rows, and the shipped
`serializeOkEnvelope` / `parseEnvelopeLine` / `AjvSchemaValidator` /
`lowerQueryResponseSchema` / `projectForValidation` entry points for (b), (c),
(d)'s subagent rows and (f). Zero model turns — every theta body a pure tail
expression. Because the working tree carried an unrelated in-flight
`src/parser/` change while the probe ran, the whole probe was re-run against a
pristine `git archive HEAD` checkout outside the repository with `node_modules`
junctioned in; **every measured line is byte-identical between the two runs**,
timestamps excepted. The temp checkout and the junction were removed afterwards.

**Read from source rather than driven, and marked as such in the text.** Two
hops: the `Err(InvokeInfraError { cause: "return_validation" })` carrier that
follows the subagent leg's `{"ok":false}` verdict
(`production-theta-producer.ts:3603–3609` — the method's only failure arm, and
the carrier bug 0174 measured end to end for its own class); and the bind of the
subagent leg's substituted `null` into theta code
(`subagent-json-driver.ts:118`, `:121` → `production-theta-producer.ts:3448` →
`:3592–3601`, the bind at `:3599`). No probe drove a real spawned child; the
subagent leg is measured at its own seams, which is where the substitution
happens.

Every `src/`, `tests/`, spec, reference, bug-doc and `node_modules/ajv` citation
above was read at HEAD `a1eec82c`; volatile positions in
`src/extension/production-theta-producer.ts` (6165 lines) are named by symbol
beside their line numbers, per
[0134](./0134-params-shift-induced-stale-citations.md)'s adjudication.
