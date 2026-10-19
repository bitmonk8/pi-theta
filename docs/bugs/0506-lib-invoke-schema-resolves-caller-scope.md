# Bug 0506 — an `invoke<Schema>(...)` written inside an imported `.thetalib` `fn` resolves `Schema` against the CALLING theta's declarations, not the declaring library's: with no same-named caller schema the annotation lowers to the permissive `{}` and a wrong-shape child value comes back `Ok`, and with a same-named caller schema the caller's shape is substituted and a value conforming to the library's schema fails `return_validation`

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published. Filed 2026-10-02 as residual 2 of the bug 0504 fix
  ([0504](./0504-thetalib-invoke-resolves-caller-relative.md),
  `## Fix (0.495.0)` → Residuals, item 2; review round 1, R2)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S1/D2 — S1: arm (a) accepts a value the spec
  refuses with no diagnostic at parse, load, or runtime (a lib fn declaring
  `invoke<ROut>` returns `Ok("not-an-ROut")`), and arm (b) refuses conformant
  input whenever an importer happens to declare a same-named schema. D2: the
  fix stays inside the invoke return-validation seam and the module-scope
  carrier; the declaring residence is already threaded to `resolveInvoke`
  (bug 0504), and what is missing is the declaring module's type
  declarations beside it, plus the lib's own imported type declarations on
  `ModuleScope`; no new diagnostic code; one witness file.
- **Kind:** defect — `docs/spec_topics/imports.md:16` pins every free name in
  an imported `fn` body, schema references included, to the declaring
  `.thetalib`'s scope; the runtime resolves the `invoke<Schema>` annotation in
  the caller's scope.
- **Where (pi-theta, main 12f1ccfd, 0.495.0):**
  - `resolveReturnSite` (`src/extension/invoke-return-validation.ts:86-99`) —
    the `annotated` arm returns `declarations: theta.body` and
    `importedTypeDecls: theta.importedTypeDecls`, where `theta` is the CALLING
    theta's bind input. The arm has no declaring-module input. Its contract
    comments state the caller rule as intended: `:42` ("the caller's
    annotation and decls"), `:58-59`, `:73-75` ("the CALLER wrote the
    annotation and the caller's `schema` / `enum` decls resolve it").
  - `InvokeMachinery.#driveCallee`
    (`src/extension/invoke-machinery.ts:364`) — the sole call site:
    `resolveReturnSite(theta, returnTyping, callee)`. The comment above it
    (`:362-363`) reads "An `invoke<Schema>` annotation is the caller's and
    keeps resolving there."
  - `InvokeMachinery.resolveInvoke`
    (`src/extension/invoke-machinery.ts:141-191`) — bug 0504's fix reads the
    declaring residence at `:169` (`const resolutionBase =
    env.currentResidence() ?? theta.sourcePath;`) and threads it as
    `resolutionBase` through `#buildInvokeChild` → `#driveCallee` →
    `#guardInvokeBoundary` for the callee PATH only. The return typing built
    at `:181-183` carries the annotation string alone
    (`{ kind: "annotated", annotation: expr.returnSchema }`); no declaring
    scope rides with it, so `#driveCallee` falls back to `theta`.
  - `validateInvokeReturn`
    (`src/extension/invoke-return-validation.ts:170-245`) — lowers the
    annotation against the site's merged decls (`:192-196`) and returns the
    payload unchanged when lowering yields `undefined`. An annotation naming
    a schema absent from the caller's scope lowers to `{}` (the
    unresolved-name arm of `lowerQueryResponseSchema`,
    `src/parser/query-schema-lowering.ts`), which AJV accepts for every
    payload.
- **Related:**
  - [0504](./0504-thetalib-invoke-resolves-caller-relative.md) — fixed
    (0.495.0). Threads `env.currentResidence()` into `resolveInvoke` as the
    path-resolution base; this report is the return-type leg that fix left
    on the caller. Its residual 4 (no load-time invoke check walks imported
    `.thetalib` fn bodies, so the static `invoke<Schema>` return-type check
    never sees a lib-body site) is the load-time counterpart of this runtime
    defect.
  - [0303](./0303-imported-fn-body-resolves-in-caller-scope.md) — fixed
    (0.291.0). The per-declaring-module `moduleEnv` an imported fn body
    executes in. Together with the `moduleResidence` stamp from
    [0354](./0354-crossfile-thetalib-fn-frames-uncounted.md), read through
    `LexicalEnvironment.currentResidence()`
    (`src/runtime/lexical-environment.ts:514-516`), it is the
    declaring-residence carrier this fix consumes; 0504 is its first consumer
    at the invoke boundary.
  - [0465](./0465-imported-annotation-vacuous-typed-query-validation.md) —
    fixed (0.462.0). Added `importedTypeDecls` to the return site so an
    imported schema name lowers to its declared shape instead of `{}`. It
    merges the CALLER's imported decls; the same vacuous-`{}` outcome recurs
    here because the lib's schema is not in the caller's decl set at all.

## Symptom

A `.thetalib` declares `schema ROut { tag: string }` and
`fn bad() { invoke<ROut>("./bad.theta") }`, where `bad.theta` returns the
string `"not-an-ROut"`. A caller that imports `bad` and declares no `ROut`
receives `Ok("not-an-ROut")`. The annotation the library author wrote is
not checked.

The same lib with `fn good() { invoke<ROut>("./good.theta") }`, where
`good.theta` returns `ROut { tag: "x" }`, fails
`Err(invoke_infra, cause: "return_validation", message: "invoke<ROut> return
value failed validation")` for a caller that declares its own
`schema ROut { other: boolean }`. The caller's schema is substituted for the
library's.

## Expected (spec citations)

- `docs/spec_topics/imports.md:16`: "A **free name** in an imported `fn`'s
  body — a call to a sibling `fn`, a reference to a `schema` or `enum`, or a
  name the library itself imports — resolves in the **declaring**
  `.thetalib`'s own scope … This holds regardless of what the calling
  `.theta` … happens to declare or import under the same name; a same-named
  declaration in the caller is never substituted for the one the library's
  author wrote. Only the query/effect anchor above — which conversation an
  `@`...`` query or `invoke(...)` call runs against — is scoped to the
  calling theta; name resolution is scoped to the declaring file."
- `docs/spec_topics/invocation.md:28` (Typed return): "`invoke<Schema>(...)`
  annotates the expected return type; the runtime AJV-validates the child's
  return value against the schema."

Together: `ROut` in a lib-body `invoke<ROut>` names the lib's `ROut`, and the
child's `Ok` payload is AJV-validated against that shape whatever the caller
declares.

## Actual (implementation citations)

`resolveReturnSite`'s `annotated` arm
(`src/extension/invoke-return-validation.ts:92-99`) builds the return site
from the calling theta's body and imported type decls. `resolveInvoke`
(`src/extension/invoke-machinery.ts:169`) knows the declaring residence but
hands only the annotation string down (`:181-183`), and `#driveCallee`
(`:364`) resolves against `theta`.

Scratch probe (0.495.0 at 12f1ccfd, 2026-10-02; offline unit drive built on
the 0504 witness harness: real parser, real `checkThetaImports` load pass,
real `executeBody` through `createProductionProducerDeps(...)
.bindPromptConversation`, prompt-mode query-free callees attached in
process; probe deleted after the run). Lib at `workers/lib.thetalib`
declares `schema ROut { tag: string }`; caller one directory up. Parse and
load diagnostics were empty in every row.

| caller declares | callee returns | result | spec |
|---|---|---|---|
| no `ROut` | `"not-an-ROut"` | `Ok("not-an-ROut")` | `Err(return_validation)` |
| no `ROut` | `ROut { tag: "x" }` | `Ok({tag:"x"})` | same |
| `schema ROut { other: boolean }` | `ROut { tag: "x" }` | `Err(invoke_infra, return_validation)` | `Ok({tag:"x"})` |
| `schema ROut { other: boolean }` | `"not-an-ROut"` | `Err(invoke_infra, return_validation)` | same |
| `schema ROut { tag: string }` (control) | `"not-an-ROut"` | `Err(invoke_infra, return_validation)` | same |
| `schema ROut { tag: string }` (control) | `ROut { tag: "x" }` | `Ok({tag:"x"})` | same |

A direct `lowerQueryResponseSchema("ROut", [], [])` returns `{}`, the
mechanism behind row 1. The defect is masked whenever the caller's scope
holds an `ROut` with the lib's shape (control rows); by code reading, a
caller that imports the lib's `ROut` alongside the fn masks it the same way
through bug 0465's `importedTypeDecls` merge.

## Root cause

The return site of an `invoke<Schema>` has one decl source: the conversation
bind input's `theta`. The imported-fn activation knows its declaring module
(`moduleEnv`, bug 0303; `currentResidence()`, bug 0354), and bug 0504
threads that residence to the invoke boundary as a path, but no declaring
module's DECLARATIONS reach `resolveReturnSite`. `ModuleScope`
(`src/runtime/lexical-environment.ts:167-180`) carries the lib's `body`,
`imports`, `enums` and `residence` but no imported type declarations, so even
a caller-side lookup of the module scope would miss a schema the lib itself
imports from another `.thetalib`.

## Fix direction

Resolve the `annotated` arm against the executing body's declaring module:

1. Carry the declaring module's type-declaration site — its own `body` plus
   its own imported schema/enum declarations (the bug 0465 closure, applied
   to the lib) — on `ModuleScope`, and expose it from `LexicalEnvironment`
   beside `currentResidence()`, stamped where the nested module env is
   built (`materializeImports`, `src/runtime/lexical-environment.ts`).
2. In `resolveInvoke`, read that site from `env` with the caller fallback
   (`undefined` at the top-level app scope, where `theta.body` /
   `theta.importedTypeDecls` stay correct) and carry it on the `annotated`
   return typing, so `resolveReturnSite`'s `annotated` arm returns the
   declaring module's declarations. `#resolveSubagentFnReturnSite`
   (`src/extension/subagent-spawn-regime.ts:1724`) already resolves an
   imported `subagent fn`'s return type against `moduleScope.body` and is
   the precedent for the declaring-file rule at a return boundary.
3. Restate the contract comments at `resolveReturnSite` and in
   `#driveCallee` to the declaring-scope rule.

The enum declaring-key retag (`enumDeclaringPath`, bug 0337) keys on the
callee's path and is unaffected. The `callee-inferred` and `untyped` arms are
unaffected.

Witness cells: the six probe rows above, with rows 1 and 3 red before the
fix; a lib-of-lib row where the lib imports `ROut` from a second `.thetalib`;
and a subagent-mode callee row, since `#driveSpawnedSubagentCallee`
validates through the same return site.

## Non-goals

- Typed queries inside an imported fn body.
  `ProductionThetaProducer.#resolvePromptQuery` lowers `expr.schema` against
  `mergedSchemaDeclsOf(deps.theta)`
  (`src/extension/production-theta-producer.ts:999-1005`), the caller's
  decls, which by code reading is the same defect class for
  a typed query `` @<ROut>`...` `` in a lib body. Not probed here; not changed by this
  fix.
- Load-time `invoke<Schema>` checks over lib bodies — bug 0504 residual 4.

## Fix (unreleased - commit/push only)

The runtime now resolves a library-authored `invoke<Schema>` against the
executing function's declaring library, including that library's directly
imported type closure. It does not merge the caller's declarations into that
site. No new package release is published; the existing package version does
not contain this fix. No resolving commit is assigned in this record.

The preceding symptom, source positions, probe table, root cause and fix
direction are retained as historical pre-fix evidence. The closure below
records the implementation and verified working-tree results, not shipment.

### Cause and implementation

The path carrier introduced by 0504 retained the declaring residence but not
its type declarations. `resolveReturnSite` selected the conversation-bound
caller's body/imported types for every annotation. An absent caller name
lowered to `{}`; a conflicting caller name substituted a different shape.
Selecting only the library body would still miss types imported by the library.

- `TypeDeclarationSite`, `ModuleScope`,
  `LexicalEnvironment.currentTypeDeclarationSite` and `spawnIsolatedScope`
  (`src/runtime/lexical-environment.ts`) carry readonly declaration metadata
  on the declaring module root, through nested activations and isolated roots.
  Top-level app roots leave the module override absent.
- `recordImportedTypeDecls` (`src/extension/import-type-decls.ts`) extracts
  the existing bounded closure/alias/collision collector for reuse by
  `src/extension/import-specifier-facts.ts` and `buildModuleScope`
  (`src/extension/import-resolution-kit.ts`). Each module retains its own
  schema/enum AST declarations. Existing collision refusal and single-delivery
  diagnostics are preserved; this is not a whole-import-graph type resolver.
- `InvokeMachinery.resolveInvoke` (`src/extension/invoke-machinery.ts`)
  captures the active declaration site on the annotated return typing.
  `resolveReturnSite` (`src/extension/invoke-return-validation.ts`) selects
  that site, with the bound theta fallback only when no module override exists.
  Callee-inferred/untyped selection, effect anchoring, path resolution,
  validation/depth/enum translation, error provenance and teardown are unchanged.

The contract is unchanged: [Imports — permitted top-level forms](../spec_topics/imports.md#permitted-top-level-forms)
assigns free schema/enum names to the declaring library;
[Invocation — typed return](../spec_topics/invocation.md#typed-return) requires
AJV validation; [INV-5](../spec_topics/invocation.md#inv-5) applies it to spawned
child envelopes. No normative specification files change.

### Pre-fix red / post-fix green

Run artifact root **R**:
`/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0506-41ead218-972e-4cff-9c09-165de9727dc0`.
Commands below run from `/home/thomasa/Projects/pi-theta`. The JSON captures
retain exact `argv`, command exit `code` and complete `output`; text logs retain
`COMMAND_EXIT_CODE`. These are inspected prior executions, not closure-stage
reruns. Pre-fix evidence is against HEAD
`f084fcc0b12a20b35d6133d8e45556b18f3f948d`.

| Exact command | Pre-fix capture / exit | Post-fix capture / exit |
|---|---|---|
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts` | `R/red-0.json`: **1**, 8 scope failures / 9 controls pass | `R/green-1-0.json`, `R/gate-1-initial-2.json`, `R/reviewer-fix-live.log`: **0** each, all 21 cells pass |
| `npx vitest run tests/b0506-lib-invoke-schema-production-composition.test.ts tests/b0506-live-fixture-setup.test.ts` | `R/red-1.json`: **1**, 4 scope failures / 15 passes | `R/green-1-1.json`: **0**, 25 passes |
| `npx vitest run tests/b0506-lib-invoke-schema-unit.test.ts` | `R/red-2.json`: **1**, 8 scope/carrier failures / 8 controls pass | `R/green-1-2.json`: **0**, 22 passes |
| `npm run typecheck` | — | `R/gate-1-initial-0.json`, `R/reviewer-fix-typecheck.log`: **0** each |
| `npm test` | No pre-fix full-suite claim | `R/gate-1-initial-1.json`: **0**, 727 files / 12,176 tests pass |
| `npm run lint` | — | `R/reviewer-fix-lint.log`: **0** |

The exact red signatures in the unchanged `R/witnesses.json` identify the
wrong observable, not a generic failure banner:

- Real host: `B0506 declaring-scope outcome in real-host user turn`, expected
  `Validation outcome: return_validation...`, received `accepted-valid...`.
  The reverse arm rejects a library-conformant object under a caller conflict.
- Composition: `B0506 declaring-scope return-validation note`, expected
  `theta /caller returned Err: invoke of ./child.theta failed (return_validation)`,
  received no note; the reverse arm emits the unexpected note.
- Unit: `B0506 isolated wrong-shape result`, expected boundary-minted
  `Err(invoke_infra/return_validation)`, received callee-returned
  `Ok("not-an-ROut")`. Imported schema/enum carrier tests also observed `{}`
  instead of the declaring shapes.

Healthy acceptance/rejection controls use matching caller schemas and the
same prompt/child transports. Coverage includes absent/conflicting callers,
local and directly imported library schemas, imported enum wire fields,
nested/re-exported **functions**, module isolation/concurrency, exact error
fields and collision registration refusal/single delivery. Fixture setup
also tests real command registration and the malformed-fixture red direction.
All original witness cases and assertions are preserved.

The four added enum live cells and four routed composition cells have a
captured red-direction check: temporarily omitting only declaration-site
capture makes every selected cell fail its exact outcome assertion. Commands:

```sh
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts -t 'imported enum'
npx vitest run tests/b0506-lib-invoke-schema-production-composition.test.ts -t 'terminal library'
```

Each exits **1** in `R/implement-enum-red-direction.log` and
`R/implement-routed-red-direction.log`, respectively. Capture is restored
before unfiltered green runs; these selectors are not gate exclusions.

Live success is the exact outbound **user text computed from the invoke
result**, with successful CLI exits, empty stderr, completed nonempty
OpenAI/gpt-6.1-sol assistant turns (`stopReason: stop`), no fail-closed notes
and no outer `theta_result` in the complete JSONL streams. Neither `prompt()`
resolution nor the assistant's arithmetic answer is the oracle. Real CLI
loading/discovery, prompt attachment, production AJV and real child envelope
transport are exercised. Offline composition doubles the host/context; unit
tests also control child payloads. Query-free children prove interpreter and
envelope transport, not child-side model querying.

### Gates, repair history and independent review

`R/implement.md` and the original `R/implement-default.log` remain **blocked**
history: that full run exits **1** with eight failures. Six fresh-host tests
reauthenticate inherited worker control-plane state; two added collision tests
observe a toast-only helper through the wrong diagnostic channel. These are
not 0506 witnesses and are not relabelled green.

Owner-authorized repairs recorded in `R/owner-implementation-unblock.md` use
`topLevelThetaHostEnv` in `tests/bugfix-workflow-reporting.test.ts` and
`tests/theta-print-real-spawn.test.ts`, and switch the two collision cells to
`composeExtensionInstance`'s actual system-note channel while preserving
refusal, exact diagnostic identity/message/path and one-row assertions.
No production workflow/printing behavior or baseline expectation changes.
The subsequent initial gate is green without waivers or test exclusions.

The independent fix review is **CLEAN — no actionable in-scope must-fix
findings** (`R/reviews.md`; unabridged findings in
`R/owner-review-fix-result.json`; host/session captures in
`R/owner-review-fix.log` and `R/owner-review-fix.jsonl`). It independently runs
102 focused offline tests and all 21 real-host cells, typecheck, lint, and
seven real-spawn tests against the operator's installed CLI, all exit **0**.
Focused cancellation, enum-carrier, 0465/0466, lexical/path and committed-fixture
controls are green; full argv/log details are in `R/close.md`.

Before documentation edits, closure inspection recomputes the current
source/test digest as
`387cd0539956aac16260939b6bb11acb6c8152da6054ef596937050573b5fd23`,
matching both independent review and initial gate. The documentation-only
closure does not claim a later final gate, final review, commit, push or release.

### Residuals and limits

- Existing collector limitations remain: deeper cross-library field-type
  closure, re-export-only imported **types** and cross-kind collision handling
  are not solved by this bounded collector reuse (0465/0466 residuals).
- Typed queries inside imported function bodies remain a separate scope issue;
  no new probe or fix is claimed here.
- [0508](./0508-static-invoke-checks-skip-thetalib-fn-bodies.md) remains open:
  load-time checks do not walk library-body invokes.
- [0505](./0505-invoked-prompt-callee-missing-imports.md),
  [0507](./0507-slsh5-lib-hop-parent-path-caller-file-lib-line.md) and
  [0509](./0509-spec-invoke-caller-relative-no-thetalib-exception.md) remain
  separate open callee-import/provenance/path-prose issues.
- No full live-suite or exhaustive cancellation-race claim is made. No new
  residual report is filed without new evidence.

## Provenance

Closure: `R/reproduce.md`, `R/diagnose.md`, `R/plan.md`, `R/spec-proposal.md`,
`R/implement.md`, the owner continuation and independent fix-review artifacts,
and the exact red/green captures listed above. `R/close.md` records closure
commands, scope checks and limitations; `R/close-evidence-audit-2.log` records
complete saved-stream inspection and review/gate digest checks. Governing spec
and actual implementation symbols are cited in the fix section.

Residual 2 of bug 0504's fix record, from the bug-fix-reviewer's round-1
scratch probe at 0.495.0. Re-probed at 12f1ccfd with the six-row table
above.
