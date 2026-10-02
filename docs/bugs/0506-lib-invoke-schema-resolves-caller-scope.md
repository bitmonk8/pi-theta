# Bug 0506 — an `invoke<Schema>(...)` written inside an imported `.thetalib` `fn` resolves `Schema` against the CALLING theta's declarations, not the declaring library's: with no same-named caller schema the annotation lowers to the permissive `{}` and a wrong-shape child value comes back `Ok`, and with a same-named caller schema the caller's shape is substituted and a value conforming to the library's schema fails `return_validation`

- **Status:** open — filed 2026-10-02 as residual 2 of the bug 0504 fix
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

## Provenance

Residual 2 of bug 0504's fix record, from the bug-fix-reviewer's round-1
scratch probe at 0.495.0. Re-probed at 12f1ccfd with the six-row table
above.
