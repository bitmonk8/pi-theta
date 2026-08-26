# Bug 0303 — An imported `.thetalib` `fn` body executes in the CALLING theta's environment, not its declaring module's: a lib fn calling a same-lib sibling fn, reading a same-lib enum, or using the lib's own import throws at runtime on a program every static gate admits — and when the caller declares a same-named `fn` or `enum`, the lib body silently binds the CALLER's declaration and returns its value

- **Status:** fixed (0.291.0).
- **Sev/Diff estimate:** S1/D3 — S1 twice over: the capture rows are silent
  wrong values (`compute(1)` returns `100` from the caller's `helper` where
  the declaring lib's sibling computes `2`; a lib enum read returns the
  caller's same-named enum's wire string), and the no-capture rows are
  runtime aborts on statically-valid input, misattributed to bug 0003's
  parse-gate belt (`theta/runtime/internal-error`) or reported as a host-tool
  failure. D3: the fix needs a module-scope design — a per-lib environment the
  materialised `FnDecl` closes over (declarations + the lib's own materialised
  imports), threaded through both executors and the `subagent fn` spawn path —
  plus a spec sentence pinning which scope a `.thetalib` `fn` body resolves
  free names in, and a decision for the transitive materialisation it implies.
- **Kind:** defect — functions.md FN-1 (`docs/spec_topics/functions.md:20`)
  states "Mutual recursion between two top-level `fn`s is allowed
  (declarations are hoisted within the file)" for `.theta` and `.thetalib`
  alike, and the lib's own parse enforces exactly that (its call sites resolve
  against its whole-file declarations); the runtime then executes the body
  against a different file's scope, so the statically-checked program and the
  executed program disagree. The capture rows additionally violate the
  lexical-scoping premise the same parse gate encodes (bug 0016's activation
  boundary: "the parse gate resolves the body's call sites against the
  whole-file declarations", `src/runtime/statement-executor.ts:426–431`) —
  the file whose declarations bind a name at runtime is the caller's, which
  the lib author cannot see.
- **Related:**
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) —
    fixed (0.141.0). Its witness cell (i) pinned the lib-side leg as a FENCE
    (control and re-export row throw identically) and its fix record states
    the reason verbatim: "a lib's own `import` is never materialised into its
    importer and `wrap`'s body runs in the caller's environment. That is a
    distinct, unfiled gap and deliberately out of scope here." This report is
    that filing, widened from the lib-import leg to the whole scope class
    (sibling `fn`s, same-lib `enum`s, and caller-side capture).
  - [0003](./0003-tool-arg-shape-rule-not-enforced.md) — the
    `PiToolArgShapeDefectError` belt is the surface the no-capture `fn` rows
    die in; its message blames a parse gate that did its job (0101 §Non-goals
    records the same misattribution for the unbound-name class).
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) —
    fixed (0.235.0). Its load-pass check (`checkImportedFnCallArgs`) resolves
    an imported callee's parameter types through "a `TypeEnv` built from the
    DECLARING library's own statements" — the static half already answers
    scope questions against the declaring file; the runtime half does not.
  - [0016](./0016-shadowed-tool-name-runtime-dispatch.md) —
    the `childFnActivation` boundary this report cites; it isolates the body
    from caller LOCALS but chains to the caller's ROOT registries, which is
    where the capture happens.
- **Affected** (citations verified at `bc52da38`, v0.287.0):
  - `src/runtime/statement-executor.ts:417–457` — `evalUserFnCall`: the body
    scope is `env.childFnActivation()` (`:432`) — a child of the CALLER's
    environment — for same-file and imported `FnDecl`s alike. `:399–402`
    `resolveUserFn` returns the bare `FnDecl` for both the `fn` and `import`
    arms; nothing distinguishes which file declared it.
  - `src/runtime/lexical-environment.ts:422–426` — `childFnActivation`:
    an activation boundary over locals only; `fns` / `schemas` / `enums` /
    `imports` are root registries shared with the caller (`:285–318`), built
    from the CALLING theta's body and materialised imports.
  - `src/extension/import-static-checks.ts:182–215` — `materializeSymbol`:
    an imported `fn` is carried as `{ name, kind: "fn", fn }` — the bare
    `FnDecl`, no module scope, no declaring-lib environment.
  - `src/runtime/statement-executor.ts:759–764` — the enum-variant member arm
    resolves `Color.Red` through the CALLER-rooted `env.resolveEnumVariant`;
    when the caller has no `Color` the target evaluates to `null` and
    `NullMemberAccessPanic` follows; when the caller HAS a `Color`, the
    caller's variant value is returned into the lib body.
  - `src/extension/import-static-checks.ts:766–778` — the comment wired with
    the subagent-fn cycle check states the intended model: an imported body
    "runs against the calling theta's executor with the LIBRARY's names in
    scope" — the second half of which is not implemented for any name the
    theta did not itself import.
  - `docs/spec_topics/functions.md:20` — FN-1: hoisting "within the file";
    mutual recursion between two top-level `fn`s allowed.
  - `docs/spec_topics/imports.md:13–14` — a `.thetalib` top level may contain
    `import` and `fn`; "Inside `fn` bodies, the full Theta language is
    available".
  - `docs/spec_topics/imports.md:27` — §Visibility: implicit export is about
    downstream visibility; nothing conditions a lib's own internal references
    on what the importer imports.
- **Observed at:** `0.287.0` (`bc52da38`). Offline, deterministic; no live
  model. Scratch vitest: real `parseThetaDocument`, real `checkThetaImports`
  over an in-memory `FileSystem`, real `executeBody` via
  `createProductionProducerDeps(...).bindPromptConversation` with a frozen
  empty callable set (the `tests/reexport-chain-resolution.test.ts` harness
  shape); written, run, deleted.

## Summary

Materialisation carries an imported `fn` as a bare `FnDecl`
(`materializeSymbol`), and `evalUserFnCall` runs that body in a child of the
CALLER's environment. Free names in the body — a sibling `fn` of the same
lib, the lib's own `enum`/`schema`, a symbol the lib itself imported — are
therefore resolved against the calling theta's root registries:

- absent there → the call falls off the user-fn path into the effect path
  (`PiToolArgShapeDefectError` / `code_tool` Err / `NullMemberAccessPanic` /
  silent `null`, per 0101's unresolved-arm inventory);
- present there under the same name → the CALLER's declaration is silently
  bound inside the lib body (dynamic scoping), and the lib returns a value
  computed from a declaration its author never saw.

Every static gate passes: the lib's own parse resolves its call sites against
its own file (correctly), the importing theta's parse sees only its own body,
and `checkThetaImports` returns zero diagnostics for all rows below.

## Reproduction

Offline at `bc52da38`. `/proj/app.theta` (frontmatter `model: "sonnet"`,
`mode: prompt`); `diags` = `checkThetaImports(...).diagnostics`; `imports` =
its materialised list; `runtime` = `executeBody` outcome.

Shared lib `/proj/lib.thetalib`:

```theta
fn helper(x: integer): integer { x + 1 }
fn compute(x: integer): integer { helper(x) }
```

### B1 — sibling `fn` call, no caller-side name: abort on valid input

```
@@ app  import { compute } from "./lib.thetalib"
        let r = compute(1)
        r
   app parse :: []   diags :: []   imports :: ["fn compute"]
   runtime   :: THROW PiToolArgShapeDefectError: internal defect: Pi tool 'helper'
                call reached the runtime lowering with a non-object-literal first
                argument; the parse-time shape gate
                (theta/parse/tool-arg-not-object-literal) did not reject this call
                site — a gate gap (bug 0003)
```

### B2 — caller-side same-named `fn`: silent wrong value

```
@@ app  import { compute } from "./lib.thetalib"
        fn helper(x: integer): integer { x * 100 }
        let r = compute(1)
        r
   app parse :: []   diags :: []   imports :: ["fn compute"]
   runtime   :: value=100                                   ← lib computes 2
```

### B3 / B3b — same-lib `enum` read: panic, or caller-enum capture

Lib `/proj/lib2.thetalib`: `enum Color { Red, Blue }` +
`fn pick(): Color { Color.Red }`.

```
@@ app  import { pick } from "./lib2.thetalib"   +   let c = pick()   +   c
   runtime :: THROW NullMemberAccessPanic: null member access: .Red

@@ app  import { pick } from "./lib2.thetalib"
        enum Color { Red = "caller-red", Blue }
        let c = pick()
        c
   app parse :: []   diags :: []
   runtime   :: value="caller-red"                          ← lib declares wire "Red"
```

### B4 — lib-to-lib import (0101 cell (i)'s class): abort

```
@@ /proj/base.thetalib  fn greet(x: integer): integer { x + 10 }
   /proj/top.thetalib   import { greet } from "./base.thetalib"
                        fn wrap(y: integer): integer { greet(y) }
   app                  import { wrap } from "./top.thetalib" + let r = wrap(2) + r
   diags :: []   imports :: ["fn wrap"]
   runtime :: THROW PiToolArgShapeDefectError (…'greet'…)
```

### B5 — the accidental workaround

```
@@ app  import { compute, helper } from "./lib.thetalib" + let r = compute(1) + r
   runtime :: value=2
```

Importing the sibling too materialises it into the caller's root, which the
lib body then finds. The program's meaning thus depends on the IMPORTER's
specifier list, not the lib's own text.

## Expected behaviour

- `docs/spec_topics/functions.md:20` (FN-1): declarations are hoisted "within
  the file" and mutual recursion between two top-level `fn`s is allowed —
  stated for `.theta` and `.thetalib` files alike. `compute → helper` is a
  same-file reference the lib's own parse admits on exactly that ground; the
  executed program must agree with the checked one (2, not a throw, and never
  100).
- `docs/spec_topics/imports.md:13–14`: a `.thetalib` may contain top-level
  `import`, and "Inside `fn` bodies, the full Theta language is available".
  B4's `wrap` is the composition those two sentences license.
- theta has no dynamic scoping anywhere else: `childFnActivation`'s own
  rationale (bug 0016) is that "the parse gate resolves the body's call sites
  against the whole-file declarations plus these parameters only" — the
  whole-file in question being the file the `fn` is declared in. B2/B3b bind
  a name from a file the parse gate never consulted.
- The implementation's own comment states the intended model: an imported
  body "runs against the calling theta's executor with the LIBRARY's names in
  scope" (`src/extension/import-static-checks.ts:766–778`). The second half
  does not hold.

## Actual behaviour / root cause

`MaterializedImport` (`src/runtime/lexical-environment.ts:117–125`) carries
`fn?: FnDecl` and nothing else — no declaring-file identity, no module scope.
`buildEnvironment` registers the caller's declarations and the caller's
materialised imports into ONE root (`:285–318`). `resolveUserFn`
(`statement-executor.ts:399–402`) returns the `FnDecl` from either arm, and
`evalUserFnCall` (`:417`) binds parameters into `env.childFnActivation()`
(`:432`) — a scope whose root is the CALLER's. Every free name in the body
resolves there:

- a call: `resolveUserFn` against the caller's `fns`/`imports` (B1/B2);
- an `Enum.Variant`: `env.resolveEnumVariant` against the caller's `enums`
  (`:759–764`; B3/B3b);
- an unresolved name then takes 0101's unresolved-arm inventory (the 0003
  belt, the `code_tool` Err, `NullMemberAccessPanic`, silent `null`).

Nothing materialises the declaring lib's OWN scope: `materializeSymbol` walks
only the specifiers the theta wrote, and a lib's own imports are never
materialised into anyone (0101 fix record, cell (i) note). The pure-evaluator
path mirrors the executor (`production-theta-producer.ts:6802` resolves enum
variants through the same caller-rooted env).

## Why it matters

- **Silent wrong values with zero diagnostics** (B2, B3b): the caller's
  same-named declaration is substituted into a library body. A `.thetalib` is
  the spec's shared-library unit; "importer's file happens to declare
  `helper`" is exactly the collision a library boundary exists to prevent,
  and nothing warns on either side.
- **Valid programs abort** (B1, B3, B4): any lib factored into public +
  private helpers — the first thing a library author does — throws unless the
  importer imports the private helpers too (B5), a requirement no spec
  sentence states and the visibility section contradicts in spirit (implicit
  export exists so downstream can import; it does not make the lib's own
  integrity conditional on downstream's specifier list).
- **The aborts are misattributed**: the ordinary call shape dies in bug
  0003's belt naming a parse gate that is not at fault; the zero-arg shape
  reports "no resolvable host tool" for a library function.
- **The committed fixture corpus never composes two lib fns**, so no shipped
  test witnesses the class (0101's cell (i) is a fence that asserts the
  broken behaviour equal on both routes).

## Non-goals

- The unresolved-arm inventory itself (silent `null` on bare reads, the 0003
  belt's message text) — 0101 §Non-goals holds them; this report measures
  them as this class's observables.
- The transitive-lib diagnostic discard at load (separate mechanism,
  candidate 03), and the enum materialisation defects (candidates 04, 05).
- `subagent fn` bodies' scope at spawn — the same materialisation seam feeds
  them and the fix must state their scope too, but no probe here drove one.

## Fix

An imported `.thetalib` `fn` body executes against a per-declaring-module
lexical environment it closes over, not the caller's. `materializeSymbol`'s
`fn` result carries a `ModuleScope` (the declaring lib's own body, its own
recursively-materialised imports, and its own `enum` registrations tagged with
`enumDeclaringKey`); the `LexicalEnvironment` constructor builds a
declaring-module env from it (carrying the CALLER's callable set down, so
effects still dispatch on the calling theta); `resolveUserFn` returns that env
and `evalUserFnCall` / `evalSubagentFnCall` open the body scope against it
(`(moduleEnv ?? env)`), while arguments still evaluate in the caller's scope
and the conversation `deps` are untouched. The approach satisfies these
constraints:

1. A `.thetalib` `fn` body resolves free names in its DECLARING module's
   scope: the lib's own hoisted `fn`s, `schema`s, `enum`s, and the lib's own
   materialised imports (recursively, which entails materialising lib-to-lib
   imports — today never done). Queries/effects keep executing against the
   CALLING theta's conversation (imports.md `:14` — the conversation anchor is
   orthogonal to name scope).
2. Same-file `.theta` fns keep the existing caller-root behaviour (their
   file IS the caller's file), and `childFnActivation`'s local-shadow
   semantics (bug 0016) are preserved.
3. The spec states the rule: imports.md / functions.md currently say "hoisted
   within the file" and "full Theta language available" but no sentence pins
   which environment an imported body's free names resolve in; the fix owes
   that sentence (and the `subagent fn` variant of it).
4. Cycle safety: lib-to-lib materialisation must reuse the existing
   path-keyed parse cache and be bounded (IMP-5 already refuses import
   cycles).
5. Witnesses: B1–B5 above as offline cells (B2/B3b pinned to the DECLARING
   lib's values 2 / "Red"), plus a lib-to-lib depth-2 row and a `subagent fn`
   row; 0101's fence (i) flips to a witness and needs its pre-authorized
   re-derivation.

## Fix (0.291.0)

- What shipped:
  - `src/runtime/lexical-environment.ts` — new exported `ModuleScope`
    interface; `MaterializedImport.moduleScope?` (imported `fn` only);
    `EnumRegistration.declaringKey?` (constructor tags
    `reg.declaringKey ?? reg.name`); `Resolution.moduleEnv?`; a `moduleEnvs`
    root registry (added to `SharedRegistries` so `spawnIsolatedScope` shares
    it — an imported `subagent fn` gets its declaring-module env too); the
    constructor's import loop builds each imported `fn`'s declaring-module env
    recursively with `parent: null` but `callables: inputs.callables ?? []`,
    so the caller's callable set threads down every level (constraint 1 —
    effects dispatch on the calling theta) while the module env's own
    fn/schema/enum/import registries provide the body's name scope;
    `resolve()`'s import arm returns the built `moduleEnv`.
  - `src/runtime/statement-executor.ts` — `resolveUserFn` returns
    `{ fn, moduleEnv? }`; `evalUserFnCall` / `evalSubagentFnCall` take the
    optional `moduleEnv` and open the body scope against `(moduleEnv ?? env)`
    (args still evaluate in the caller's `env`; conversation `deps`
    unchanged); the dispatch site threads `moduleEnv`. Same-file fns pass no
    `moduleEnv` → caller-root behaviour and bug 0016's `childFnActivation`
    boundary preserved (constraint 2).
  - `src/extension/import-static-checks.ts` — `enumsOf(body, resolvedPath)`
    (enum registrations with `enumDeclaringKey`) and
    `buildModuleScope(resolvedPath, body, callingFrontmatter)` with a
    `moduleScopeCache` and a `moduleScopeInProgress` VISITED SET, reusing the
    existing path-keyed `parseCache`; `materializeChain` attaches the
    `ModuleScope` for a `fn` result, from the DECLARING lib's own
    resolvedPath/body (correct through a re-export chain). Boundedness is
    independent of IMP-5's cycle refusal (constraint 4).
  - `src/extension/production-theta-producer.ts` — `evaluatePureFnCall` gains
    `bodyRoot = env`; its call site passes the import arm's `moduleEnv` (bug
    0027 executor/pure-host lockstep).
  - `docs/spec_topics/imports.md`, `docs/spec_topics/functions.md` — the
    sentence pinning that an imported `.thetalib` `fn` body resolves free
    names in its declaring module's scope (its own hoisted fns/schemas/enums
    and its own materialised imports, recursively) while queries/effects run
    against the calling theta's conversation, plus the `subagent fn` variant
    (constraint 3, same commit).
  - `docs/spec_topics/runtime-value-model.md`, `docs/reference/type-system.md`
    — the enum-equality bullet corrected: a `.theta`-declared enum tags on its
    bare name; a `.thetalib`-declared enum tags on its declaring declaration
    whether read within its own module's fn bodies or through an import, so a
    lib-internal read and an importer's read of the same declaration compare
    equal (the parent forward note's identity, kept honest same-commit).
  - `src/parser/theta-document.ts` + 22 existing test files — comment /
    failure-message citation line-numbers re-derived where this fix's src
    edits shifted them (no asserted value changed).
- Design decisions (recorded per Phase-5): (a) module env CONSTRUCTION —
  built lazily-per-import in the `LexicalEnvironment` constructor from the
  carried `ModuleScope`, `parent: null` (its own root) so the body cannot see
  caller locals, `callables` inherited from the caller so the effect surface
  is the calling theta's (name scope = declaring module, effect anchor =
  calling theta). (b) CACHING — `moduleScopeCache` dedupes `ModuleScope`
  DATA per resolved path; the parse cache is the existing path-keyed
  `parseCache`; a `moduleScopeInProgress` set bounds construction on a
  lib-to-lib cycle by returning a bounded partial (own enums, no imports),
  never cached. (c) SUBAGENT-FN SCOPE — an imported `subagent fn` body runs
  in the declaring module's isolated scope (`(moduleEnv ?? env).spawnIsolatedScope()`),
  stated in imports.md/functions.md.
- Gates: witness `tests/b0303-imported-fn-body-declaring-scope.test.ts`
  10/10 green (RED before fix: B1/B4/depth-2 `PiToolArgShapeDefectError`,
  B2 `100`, B3/enum-identity `NullMemberAccessPanic`, B3b `"caller-red"`,
  subagent `invoke_infra`); full default suite `npm test` 467 files / 9461
  tests green; `npm run typecheck` clean; `npm run lint` clean;
  `tests/committed-fixture-parse-gate.test.ts` 36/36 (no committed fixture
  un-registered).
- Review: 1 round — `bug-fix-reviewer` returned CLEAN (correct, faithful to
  all five constraints, spec-complete); no correctness/fidelity/spec blocker.
  Three non-blocking residuals filed (see Residuals). A prose-only
  `bug-fix-fixer-light` round then corrected the enum-equality spec sentence
  (R1); polish verified by gate-diff, confirmation round skipped.
- Verification: SOLID — witness genuinely reds under a byte-exact-restored
  neutralisation (moduleEnv threading dropped → 8 cells red with the doc's
  signatures; restored SHA-256 identical → green); full suite 467/9461 green;
  live cell `tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts`
  passed against a real provider (run under the shared live.lock, log
  `.pi/tmp/fixes/0303-live.log`); lint + typecheck clean.
- Residuals:
  1. `runtime-value-model.md`/`type-system.md` enum-equality precision (R1) —
     RESOLVED this commit (the `.theta`/`.thetalib` tag distinction).
  2. Module-env construction is per-import-reference, not per-`ModuleScope`
     object: a stacked-diamond lib DAG builds O(2^k) env objects
     (termination and correctness hold; cyclic programs un-register via
     IMP-5 before execution). Pathological-input cost only; a
     per-`ModuleScope`-identity memoisation is the remedy if ever needed.
  3. A `.thetalib` carrying both `enum Color` and `import { Color } from …`
     is an undiagnosed own-import-vs-own-declaration collision (the theta-side
     `import-name-collision` check runs only over the importing theta's own
     specifiers). Such a lib was wholly non-functional pre-fix, so nothing
     regresses; a follow-up filing candidate for the 0304 family.
- Discharge notes appended: `docs/bugs/0101-…md` (cell (i) fence rationale
  discharged by this fix); `docs/bugs/0003-…md` (the lib-internal-name class
  no longer reaches the tool-arg-shape belt as of 0.291.0).
- Pinned dispositions / non-goals: the 0003-belt / unresolved-arm message
  text is untouched (this fix makes the class unreachable for lib-internal
  names, it does not reword the belt); no new diagnostic code minted (DIAG-2
  closed — lib-to-lib faults reuse 0304's landed reporting);
  `graphEdges`/`entryStems`/`walkThetaLib` cycle-graph keying untouched (bug
  0302 owns it); B5's accidental-workaround row still works (redundant, not
  broken).

## Provenance

- Origin: bug 0101's fix record — cell (i) fence rationale ("a lib's own
  `import` is never materialised into its importer and `wrap`'s body runs in
  the caller's environment. That is a distinct, unfiled gap") — this report is
  that filing, widened to sibling declarations and caller-capture.
- Spec: `docs/spec_topics/functions.md:20` (FN-1);
  `docs/spec_topics/imports.md:13–14, 27`.
- Implementation evidence at `bc52da38`:
  `src/runtime/statement-executor.ts:399–402, 417–457, 759–764`;
  `src/runtime/lexical-environment.ts:117–125, 285–318, 422–426`;
  `src/extension/import-static-checks.ts:182–215, 766–778`;
  `src/extension/production-theta-producer.ts:6802`.
- Probes: scratch vitest cells B1–B5 at `bc52da38`, outputs quoted verbatim;
  file deleted per scratch policy. No non-scratch file modified.
