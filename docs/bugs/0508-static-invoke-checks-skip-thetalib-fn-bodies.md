# Bug 0508 — no load-time invoke check walks the body of an imported `.thetalib` `fn`: an `invoke(...)` written there gets no cycle detection, no INV-1 load-time escape refusal, no argument-arity or argument-type check and no `invoke<Schema>` return-type check, so the importing theta registers clean and the site either fails at runtime or runs with its arguments silently dropped or nulled

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published. Filed 2026-10-02 as residual 4 of the bug-0504 fix
  ([0504](./0504-thetalib-invoke-resolves-caller-relative.md), `## Fix
  (0.495.0)` → Residuals, item 4; review round 1, R4)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S1/D3 — S1: an argument-count or argument-type
  error at a lib-body `invoke` site, which invocation.md refuses at parse
  time, loads clean and runs with no diagnostic at any stage — an extra
  positional argument is dropped, a missing required one binds `null`, and a
  wrong-typed one reaches the callee as `null` (Repro arms 3, 4, 6); the
  escape and return-type arms are fail-closed at runtime
  (load-green / runtime-`Err`), and a lib-body invoke cycle has no load-time
  refusal at all. D3: the walk needs import materialisation, which the
  compose pass runs after the invoke checks and after the cycle graph is
  built, so the fix reorders the pass across two subsystems, and it needs
  in-run adjudication of edge attribution (every imported `fn` or only the
  called ones) and of where a lib-site diagnostic lands when several
  thetas import the same library.
- **Where (pi-theta, main 12f1ccfd, 0.495.0):**
  - `src/extension/invoke-static-checks.ts:274` — `buildInvokeGraph`: the
    edge loop (`:293`) iterates `collectInvokeExprs(input.body)` for each
    discovered theta, so the graph holds only edges written in a discovered
    `.theta`'s own body. `collectInvokeExprs` (`:158`) is
    `collectCallSites(body).invokeExprs`
    (`src/parser/call-site-collect.ts:58`), which walks nested `fn` bodies
    of the body it is given — a `.thetalib`'s `fn` declarations live in the
    library's own parsed document, never in the importer's `input.body`.
  - `src/extension/invoke-static-checks.ts:633` —
    `checkInvokeStaticResolution`: one walk, `collectCallSites(input.body)`
    (`:669`), feeds every per-site loop, with the resolution base
    `callerPath = input.sourcePath` (`:663`) and a type environment from the
    caller's own statements (`collectTypeEnv(input.body.statements)`,
    `:676`). The per-site `invoke(...)` checks live in
    `checkInvokeExprCallSurface`
    (`src/extension/invoke-expr-call-surface.ts:182`): INV-1 containment via
    `checkInvokePathAtLoad` (`:240`), the `theta/load/callee-has-errors`
    warning via `checkCalleeHasErrors` (`:251`), the bug-0473 return-type
    leg `checkInvokeReturnTypeLeg` (`:267`), the INV-8 / INV-6 `with`-clause
    checks (`:298`), and arity then per-slot type via `checkInvokeCall`
    (`:355`). None of them sees a lib-body site. The cycle verdict
    (`detectInvocationCycle(input.slashName, deps.graph)`, `:755`) reads the
    graph above.
  - `src/extension/import-static-checks.ts` — `checkThetaImports` (`:471`)
    resolves, parses and materialises each import; it runs no invoke walk.
    `runImportedSymbolUsageChecks`
    (`src/extension/invoke-imported-checks.ts:554`) walks
    `collectCallSites(input.body)` (`:584`) — again the importer's body, for
    imported-`fn` call arguments, not the lib bodies.
  - `src/extension/production-composition.ts` — order of the compose pass:
    `buildInvokeGraph(parsedInputs, fileSystem)` (`:1182`) runs once before
    the per-theta loop; per theta, `checkInvokeStaticResolution` (`:2000`)
    runs before `checkThetaImports` (`:2061`). Lib facts (residence, parsed
    lib body, materialised scope) exist only after the invoke checks and the
    graph are done.
- **Spec:** `docs/spec_topics/imports.md:17` — "Cycle detection from
  [Invocation](./invocation.md) walks invoke paths originating from thetalib
  functions too." The per-site checks in invocation.md are stated for every
  literal `invoke(...)` with a statically resolvable callee; none exempts a
  site written in a `.thetalib` `fn`.

> **Historical evidence:** the original symptom, source/spec line numbers,
> runtime observations and proposed direction below describe the pre-fix state.
> They are preserved rather than rewritten as current behavior. See
> [Fix (unreleased - commit/push only)](#fix-unreleased---commitpush-only)
> for the implemented contract, verification and remaining limits. In particular,
> 0506 is now fixed but unreleased, not pending as the historical text says.

## Symptom

An importing theta whose imported `.thetalib` `fn` contains an `invoke(...)`
registers with no diagnostic in every arm below, where the same `invoke(...)`
written directly in the theta's body is refused at load:

| defect at the lib-body site | direct site (load) | lib-body site (load) | lib-body site (runtime) |
|---|---|---|---|
| invoke cycle through the importer | `theta/load/invocation-cycle`, not registered | registered | no load-time refusal; prompt-mode re-entry currently fails on [0505](./0505-invoked-prompt-callee-missing-imports.md)'s `unknown_tool` |
| path escapes every discovery root | `theta/load/invoke-path-escape`, not registered | registered | `Err(invoke_infra, load_failure)` (INV-1 runtime re-check) |
| too many arguments | `theta/parse/invoke-arity-too-many`, not registered | registered | runs; extra arguments dropped, `Ok` |
| too few arguments | not probed (spec: `theta/parse/invoke-arity-too-few`) | registered | runs; missing slot bound `null`, `Ok(null)` untyped / `return_validation` typed |
| argument type mismatch | `theta/parse/invoke-arg-type-mismatch`, not registered | registered | runs; callee reads the parameter as `null`, `Ok(null)` untyped / `return_validation` typed |
| `invoke<integer>` of a string-returning callee | `theta/parse/invoke-return-type-mismatch`, not registered | registered | `Err(invoke_infra, return_validation)` |

## Expected (spec citations)

- **Cycle detection.** `imports.md:17` pins that cycle detection walks
  invoke paths originating from `.thetalib` functions. `invocation.md:93`
  (§Cycle detection): cycles "are detected at parse time by walking the
  per-load-pass static-resolution graph", reported as
  `theta/load/invocation-cycle` (`diagnostics/code-registry-load.md:42`).
- **INV-1 load-time arm.** `invocation.md:12` (§Resolution): "A resolved
  path that escapes every active root is a load-time error
  `theta/load/invoke-path-escape`; the parent theta does not register the
  call site". `invocation.md:16` (INV-1) requires the load-time check and
  the runtime re-check to apply identical semantics and both to exist
  (`code-registry-load.md:43`, phases `load, runtime`).
- **Argument arity.** `invocation.md:48-51` (§Argument arity): too few
  arguments against a statically resolvable callee is
  `theta/parse/invoke-arity-too-few`, otherwise a runtime
  `Err(InvokeInfraError { cause: "validation" })`; too many is "Always a
  parse error `theta/parse/invoke-arity-too-many` … there is no runtime
  safety net possible" (`code-registry-parse.md:150-151`).
- **Argument type.** `invocation.md:38` (§Argument binding) and bug 0137:
  a positional argument whose static type does not match the callee's
  `params:` field is `theta/parse/invoke-arg-type-mismatch`.
- **Typed return.** `invocation.md:30` (§Typed return): when both the
  annotated `Schema` and the callee are statically resolvable, a mismatch
  is `theta/parse/invoke-return-type-mismatch`
  (`code-registry-parse.md:149`).
- **Resolution base for a lib-body site.** `imports.md:17`: "The path
  resolves relative to the `.thetalib` file's location". Free names in the
  `fn` body — including a `Schema` name — resolve in the declaring
  library's scope (`imports.md:15`). A static check of a lib-body site
  therefore judges the callee path against the library's residence and the
  types against the library's declarations, not the importer's.

## Actual (implementation citations)

Every load-time invoke check is driven from one input: the discovered
theta's own body. `buildInvokeGraph` adds an edge only for an
`invoke(...)` in `input.body` (`invoke-static-checks.ts:293`), and
`checkInvokeStaticResolution` walks only `collectCallSites(input.body)`
(`:669`). `import-static-checks.ts` resolves and materialises the imported
libraries but walks none of their `fn` bodies for `invoke` sites, and it
runs after the invoke pass in any case
(`production-composition.ts:2000` → `:2061`). A lib-body site therefore
reaches the runtime unexamined. The runtime catches part of it:

- **Escape.** `#recheckCalleeContainment`
  (`src/extension/invoke-machinery.ts:735`), called from
  `#guardInvokeBoundary` (`:599`), re-runs the containment check against
  the bug-0504 `resolutionBase` (`env.currentResidence() ??
  theta.sourcePath`, `:169`) and returns `load_failure`. Fail-closed, but
  the importer registered and the refusal arrives only when the `fn` runs.
- **Return type.** `validateInvokeReturn` rejects a wrong-shape value with
  `return_validation` at runtime. For a named `Schema` the runtime leg
  resolves the name in the caller's scope
  ([0506](./0506-lib-invoke-schema-resolves-caller-scope.md)), so the
  runtime net is itself unreliable for lib-body sites until 0506 lands.
- **Cycle.** No load-time refusal. The INV-4 depth bound
  (`invocation.md:95`; `theta/runtime/invoke-depth-exceeded`,
  `code-registry-runtime.md:18`) is the only terminator the spec provides
  once the cycle is past load. In the prompt-mode probe the re-entered
  importer fails earlier, at its first imported-`fn` call, with
  `code_tool … unknown_tool`, because an invoked prompt-mode callee runs
  without materialised imports
  ([0505](./0505-invoked-prompt-callee-missing-imports.md)); that defect,
  not cycle detection, stops the recursion today. The subagent-mode path
  was not probed.
- **Arity and argument type.** No runtime check. `#bindCalleeParams`
  (`invoke-machinery.ts:667`) binds by the callee's declared parameter
  names only (`paramNames.forEach`, `:688`): an argument beyond the last
  parameter is never read, and an omitted non-defaulted slot binds `null`
  (`:697`). A string argument to an `integer` parameter reached the callee
  as `null` in the probe (arm 6); the mechanism of that conversion was not
  traced. The `validation` runtime arm invocation.md:50 names for too-few
  did not fire in the probe (arm 4).
- **Other per-site checks skipped by the same gap (structural, not
  probed):** the `theta/load/callee-has-errors` warning for a missing
  lib-body callee, and the INV-8 `theta/parse/with-clause-prompt-mode-callee`
  refusal for a `with` clause on a lib-body `invoke` of a prompt-mode
  callee.

Code-comment labels in the invoke static-check files name the arity check
"INV-3" (`invoke-static-checks.ts` header, `checkInvokeExprCallSurface`'s
doc comment) and cycle detection "INV-4". In invocation.md, INV-3 (`:44`)
is the per-call-timeout seam and INV-4 (`:95`) is the depth bound; arity is
§Argument arity (`:48`) and cycle detection §Cycle detection (`:93`). This
report cites the spec sections.

## Root cause

The compose pass treats each discovered `.theta` body as the complete set
of its `invoke(...)` sites. Imported `.thetalib` `fn` bodies are a second
source of sites that execute on the importer's behalf, but the invoke graph
is built and the per-site checks run before import materialisation, from
the discovered body alone, and the import pass that does hold the lib
bodies has no invoke walk.

The bug-0504 doc's `## Fix direction` assumed the static cycle walk
"resolves lib-side edges" on some base and asked for that base to be
cross-checked. The 0504 fix record corrects this: the walk has no lib-side
edges at all.

## Fix direction

Add a lib-body invoke walk to the compose pass, run after import
materialisation:

1. For each importing theta, collect the `InvokeExpr`s in the bodies of the
   imported `.thetalib` `fn`s, following lib-to-lib imports and
   `export … from` chains to the declaring library of each `fn` (the
   declaration-site residence INV-4 uses, `invocation.md:97`).
2. Resolve each lib-side path against the **declaring library's
   residence**, never against the importer's `sourcePath` — the constraint
   the 0504 fix pins and the base the runtime now uses
   (`resolutionBase`, `invoke-machinery.ts:169`). A static walk on the
   importer's base would pass load and fail at runtime, or the reverse,
   which is the load-green / runtime-refusal shape 0504 fixed on the
   runtime side.
3. Run the existing per-site checks (`checkInvokeExprCallSurface`) over
   those sites with the library's residence as `callerPath` and a type
   environment built from the declaring library's own scope (its
   declarations and its materialised imports), so the return-type leg
   resolves `Schema` where 0506 requires the runtime leg to resolve it.
   An error-severity diagnostic un-registers the importing theta, as it
   does for a direct site.
4. Add the importer → callee edges to the invoke graph, which moves
   `buildInvokeGraph` (or the edge pass for lib sites) after import
   materialisation in `production-composition.ts`.

Points the fix adjudicates: whether edges and checks cover every `fn` the
importer imports or only the ones its body calls; which file and range a
lib-site diagnostic carries, and whether it is emitted once per library or
once per importer.

Witness: one cell per arm of the Repro table, each asserting the direct-site
control refuses at load and the lib-body site now refuses at load with the
same code, plus a cell with the callee beside the library and a same-named
decoy beside the importer, asserting the static walk judges the lib-side
file.

## Repro

Scratch probe (deleted after the run) through the shipped composition root,
`discoverAndComposeFixtures` (`src/extension/production-composition.ts`),
with a load context whose `ui.notify` records every error-severity load
diagnostic, then `fixture.run` per registered theta with
`dispatchCtx` (`tests/helpers/fixture-dispatch-harness.ts`). Fully offline:
no theta issues a query. Each arm is a fresh temp workspace with an empty
`.pi/settings.json`; paths are relative to it. `P` is
`---\nmode: prompt\n---\n`; `P1` is `P` plus `params:\n  x: integer`. Every
`w.theta` (with `params:`) itself fails to register with
`binder model unresolved` (no binder model configured); this does not
affect its use as an invoke callee.

| arm | files | load | run `/a` |
|---|---|---|---|
| 1 cycle, direct | `.pi/theta/a.theta` = `P` + `invoke("./a.theta")?` | `invocation cycle: a → a`; not registered | — |
| 1 cycle, lib | `a.theta` = `P` + `import { back } from "./lib.thetalib"` / `back()?`; `lib.thetalib` = `fn back() { invoke("./a.theta") }` | registered | `code_tool … unknown_tool — code-side call names no resolvable host tool 'back'` (0505) |
| 2 escape, direct | `a.theta` = `P` + `invoke("../../outside.theta")?`; `outside.theta` at the workspace root | `invoke path '../../outside.theta' resolves outside every active discovery root`; not registered | — |
| 2 escape, lib | lib `fn esc() { invoke("../../outside.theta") }` | registered | `invoke of …/outside.theta failed (load_failure)` |
| 3 arity many, direct | `a.theta` = `P` + `invoke("./w.theta", 1, 2, 3)?`; `w.theta` = `P1` + `"W"` | `invoke './w.theta' passes too many arguments: expected at most 1, got 3`; not registered | — |
| 3 arity many, lib | lib `fn ar() { invoke<integer>("./w.theta", 1, 2, 3) }`; `w.theta` = `P1` + `x`; caller `let v = ar()?` then `if v == 1 { invoke("./SAW-ONE.theta")? }` | registered | `invoke of ./SAW-ONE.theta failed (load_failure)` — `v == 1`, args 2 and 3 dropped |
| 4 arity few, lib | lib `fn ar() { invoke("./w.theta") }`; caller tests `v == null` → `./SAW-NULL.theta` | registered | `invoke of ./SAW-NULL.theta failed (load_failure)` — `Ok(null)`; typed `invoke<integer>` variant: `return_validation` |
| 5 return type, direct | `a.theta` = `P` + `invoke<integer>("./s.theta")?`; `s.theta` = `P` + `"S"` | `invoke<Schema> annotation incompatible with callee './s.theta' return type string`; not registered | — |
| 5 return type, lib | lib `fn rt() { invoke<integer>("./s.theta") }` | registered | `invoke of ./s.theta failed (return_validation)` |
| 6 arg type, direct | `a.theta` = `P` + `let v = invoke("./w.theta", "str")?` …; `w.theta` = `P1` + `x` | `invoke argument 0 ('x') type mismatch: expected integer, got string`; not registered | — |
| 6 arg type, lib | lib `fn ar() { invoke("./w.theta", "str") }`; caller tests `v == null` → `./SAW-NULL.theta` | registered | `invoke of ./SAW-NULL.theta failed (load_failure)` — `Ok(null)`; typed `invoke<integer>` variant: `return_validation` |

The `SAW-*.theta` files do not exist; their `load_failure` is the
observable that the preceding `if` branch was taken.

## Related

- [0504](./0504-thetalib-invoke-resolves-caller-relative.md) — fixed
  (0.495.0). Moved the runtime resolution base of a lib-body `invoke` to the
  declaring library; residual 4 of its fix record is this report. Its
  `## Fix direction` cross-check paragraph is the origin of the lib-residence
  constraint in §Fix direction step 2.
- [0505](./0505-invoked-prompt-callee-missing-imports.md) — open (residual
  1). Terminates the prompt-mode arm-1 recursion at the first re-entry; once
  it is fixed, a prompt-mode lib-body cycle reaches the INV-4 depth bound
  with no load-time refusal.
- [0506](./0506-lib-invoke-schema-resolves-caller-scope.md) — open
  (residual 2). The runtime `invoke<Schema>` leg resolves `Schema` in the
  caller's scope. The static return-type leg this report adds for lib-body
  sites must resolve `Schema` in the declaring library's scope, the same
  scope 0506's fix gives the runtime leg; landing one without the other
  leaves the two legs judging different schemas.
- [0473](./0473-cross-file-invoke-return-type-check-unimplemented.md) —
  fixed (0.484.0). The cross-file `invoke<Schema>` return-type check, implemented for direct
  sites only.

## Fix (unreleased - commit/push only)

**Disposition:** the scoped load-time defect is fixed in this working tree,
with green verification and an independent **CLEAN — fix focus** review.
**No new package release is published.** This fix is not in the existing
published package version. No resolving commit SHA is assigned here: the
shipment commit will supply it. Closure records completion of the reviewed
patch, not a commit, push, tag, npm publication or shipment.

### Cause and actual repair

The graph and per-site checker formerly consumed only the discovered theta's
body, before imports were materialised. Merely moving the old checker later
would still miss the library bodies; walking them against importer paths or
schemas would judge the wrong file or namespace.

The repair uses one shared declaring-function-scope closure:

- `src/extension/invoke-source-contexts.ts:9-27` starts from materialised
  function imports, follows their declaring scopes' function imports, and
  visits each canonical residence once per importer. All function bodies in
  an included scope participate, including unused imports, plain/subagent
  siblings and conditional sites. Re-exports select the terminal declaration;
  forwarding-only and schema/enum-only imports do not independently introduce
  function scopes. Unrelated libraries are not scanned.
- `src/extension/invoke-static-checks.ts:292-309` combines direct-body and
  library edges, resolving against each declaring residence and attributing
  library edges to the importing theta. Libraries are not slash graph nodes.
  `:763-790` sends library invokes through the existing expression checker
  using the declaring library's own declarations and imported type closure.
  Existing codes, severities, arity-before-type ordering, multiple argument
  diagnostics, unknown-type deferrals and callee namespaces are retained.
- `src/extension/production-composition.ts:1224-1245` prepares imports before
  building the shared graph and finalising registrations. `:1985-1993`
  materialises once for preparation, without claiming diagnostic delivery,
  and retains resolved library watch directories even on subsequent refusal.
  `:2008-2037` decides admission from complete import/invoke results, not the
  display remainder. Shared library errors therefore refuse every affected
  importer; warnings alone do not refuse. Pass-local display accounting in
  `invoke-source-contexts.ts:35-53` retains diagnostic multiplicity while
  suppressing duplicate delivery across importers. Reload makes fresh
  decisions and re-emits still-broken diagnostics.

Located site diagnostics name the actual declaring library and invoke range;
whole-cycle diagnostics remain location-less. The existing expression checker
(`src/extension/invoke-expr-call-surface.ts:225-365`), runtime invoke machinery,
materialiser and generic AST collector were not changed.

The owner explicitly approved the exact seven-clause proposal preserved in
the run's `spec-proposal.md`, recorded in `state.json.approvedProposal` and
`specApproved: true`. The earlier blocked diagnosis and needs-spec PLAN remain
historical records, not missing approval. The applied clauses are
`docs/spec_topics/invocation.md:10,24-36,106,108`,
`docs/spec_topics/imports.md:17` and the invocation mirror in
`docs/reference/discovery-cli.md:305` onward. They define the precise closure,
declaring path/type context, every-importer refusal and syntactic cycle policy.
Unused siblings/conditional calls/fresh conversations do not exempt cycles;
ordinary plain-function recursion and the independent runtime depth cap remain
distinct. The approved two path-prose corrections overlap 0509; its separate
status is deliberately unchanged.

### Preserved red and post-fix green evidence

All artifact names below are relative to this absolute run directory:

```text
/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0508-39c6f13d-3b04-40ec-a659-bafad5c4f67d
```

The pre-fix checkout base was
`7e6ad47bf39dda12c4496a2897bbbfacb10a6e0e` (a base, **not** a resolving SHA).
The original three witness files and `witnesses.json` retain their recorded
hashes; commands, assertions and red signatures were not weakened.

| Exact command from the checkout root | Pre-fix artifact / exit | Post-fix controller artifact / exit |
|---|---|---|
| `npx vitest run tests/b0508-thetalib-invoke-static-production.test.ts` | `red-0.json`, exit 1; also `diagnose-a2-offline-red-01.log` | `green-1-0.json`, exit 0 |
| `npx vitest run tests/b0508-thetalib-invoke-static-unit.test.ts` | `red-2.json`, exit 1; also `diagnose-a2-unit-red-01.log` | `green-1-2.json`, exit 0 |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0508live-thetalib-invoke-static-registration.test.ts` | `red-1.json`, exit 1; also `diagnose-a2-live-red-01.log` | `green-1-1.json`, exit 0 |

- Production red: all six bad library sites registered with `codes: []`,
  `callerRegistered: true`, instead of their existing diagnostic and refusal.
  Thirteen direct/healthy/residence controls passed. Post-fix all 19 pass.
- Unit red: nine omitted site verdicts and six graph-edge/cycle omissions;
  fifteen correct-reason failures and twenty passing supplied-document/healthy
  controls. Post-fix all 35 pass. This isolates missing orchestration rather
  than assuming the underlying emitters or cycle detector are broken.
- Real-host red: the invalid importer was actually registered
  (`b0508-library=true` rather than required `false`); direct invalid was
  refused and healthy direct/library controls registered. Post-fix both cases
  pass with the invalid library false and the healthy library true. The oracle
  is user text derived from the public command registry in a real `pi -p`
  loading this checkout, not merely `prompt()` resolving or arithmetic output.
  Raw streams show host exit 0, empty stderr, completed `openai/gpt-6.1-sol`
  turns with stop reason `stop`, and no outer `theta_result` envelopes.

Additional tests in `tests/b0508-thetalib-invoke-static-coverage.test.ts`
(24 cases) and `tests/b0508-thetalib-invoke-static-compose-integration.test.ts`
(8 cases) pin unused/sibling/transitive scope coverage, re-export/type-only
exclusions, canonical identity, both modes and reversed graph input order,
declaring schemas/spans, multiplicity/deferral, shared-importer decisions,
warning-only admission and refused-library watching/corrected reload.
The first additive pre-fix run had 18 expected failures and six controls
(`implement-a1-additive-red-01.log`, exit 1); final additive run passes all
32 (`implement-a1-additive-green-03.log`, exit 0).

Two existing 0506 fixture files were adapted, without changing any assertion:
`tests/b0506-lib-invoke-schema-production-composition.test.ts:103-113` and
`tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts:97-106`.
Their good/bad child payloads now pass through the same plain-function tail,
whose return summary is genuinely undecidable in the current static engine
(0513). This preserves runtime AJV success/failure coverage rather than
silencing the new earlier static refusal. A separate decidable named-schema
case locks that refusal boundary. Independent review accepted this as fixture
compatibility, not weakened tests or skipped gates.

### Gates and independent review

| Exact command | Exit | Artifact in the run directory |
|---|---:|---|
| `npm run typecheck` | 0 | `gate-1-initial-0.json`; also `implement-a1-typecheck-final-01.log` |
| `npm test` | 0 | `gate-1-initial-1.json`; also `implement-a1-full-default-01.log` |
| `npm run lint` | 0 | `implement-a1-lint-final-01.log` |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0508live-thetalib-invoke-static-registration.test.ts` | 0 | `gate-1-initial-2.json`; independent `review-fix-live-01.log` |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts` | 0 | `implement-a1-live-0506-01.log` |

Full default verification passed 744 files / 12,563 tests, including the
62-case committed fixture parse gate and provider-free real-child spawn test.
Relevant 0506 live compatibility passed all 21 runtime/prompt/subagent-child
cases with actual validation outcomes and completed provider turns.
`evidence-review.md` is independently CLEAN on the pre-fix evidence;
`reviews.md` is independently CLEAN on the implemented fix, exact approved
normative diff and witness integrity. Its focused rerun passed seven files /
114 cases (`review-fix-focused-01.log`, exit 0), and its separate unchanged
live witness passed both cases (`review-fix-live-01.log`, exit 0).

Rejected construction attempts remain preserved and are not proof: the first
session-header-only live observer, the corrected unit helper tag error, the
case-variant fake-directory setup failures, and the exact-spec blank-line
correction. The earlier 0506 failures were related earlier-refusal fixture
failures, resolved with unchanged runtime assertions as described above.
No unrelated failing test or infrastructure failure remained at closure.
The full command history, failed-attempt explanations and saved-log decoding
are in the run's `reproduce.md`, `diagnose.md`, `implement.md` and `close.md`.
No quality loop was run. CLOSE inspected captured evidence and changed docs
only; it did not rerun test suites or claim new execution results.

### Remaining boundaries and related bugs

- The deterministic production tests use real filesystem/discovery/parser/
  import/static-check composition with an outer host double; the separate
  real host proves registration and provider completion. Invalid 0508 bodies
  are intentionally not dispatched. This does not establish runtime argument
  dropping/null conversion, actual cyclic execution or subagent transport for
  those invalid bodies, nor does the fix add runtime argument validation.
- The graph retains the existing discovered-theta target boundary; cycles
  through exclusively undiscovered target files are not newly proven or fixed.
  Static inference still has the limits recorded by 0513 and 0518; unknowns
  defer, and the runtime fixtures may need new dynamic inputs if inference
  later improves. No blanket source-admission equivalence is claimed: invalid
  unused library siblings can now refuse an importer, by approved design.
- 0505 prompt-callee runtime imports and 0507 runtime provenance remain
  separate open bugs. 0506's runtime declaring-schema fix is already fixed,
  unreleased; this patch preserves it rather than claiming to implement it.
  0509 remains open for its owner's disposition despite the explicitly
  approved overlapping prose corrections. No other numbered bug was closed.
- No new out-of-scope residual report was filed: this stage found no newly
  established defect requiring one. The above limits are not release claims.
