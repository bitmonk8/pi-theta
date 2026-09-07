---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Nine runtime seam modules still carry tests-task stub narration describing their implemented functions as inert stubs
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/effectful-statement-host.ts:29-36
  - src/runtime/effectful-statement-host.ts:548-550
  - src/runtime/expression-evaluator.ts:36-51
  - src/runtime/expression-evaluator.ts:87-90
  - src/runtime/expression-evaluator.ts:577
  - src/runtime/function-result.ts:15-21
  - src/runtime/function-result.ts:68-70
  - src/runtime/err-note-render.ts:25-30
  - src/runtime/err-note-render.ts:119
  - src/runtime/err-note-render.ts:196-197
  - src/runtime/invocation.ts:20-32
  - src/runtime/invoke-cancellation.ts:117-119
  - src/runtime/invoke-ceiling-depth.ts:37-42
  - src/runtime/invoke-cross-mode.ts:27-36
  - src/runtime/depth-walk.ts:32-37
sites: 15
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Nine runtime seam modules still carry tests-task stub narration describing their implemented functions as inert stubs

## Observation
These nine `src/runtime/` modules were built under the paired tests-task /
implementation flow ("V<N>-T declares the seam and stubs the functions
inertly; the paired V<N> leaf fills them in"). The stub-phase narration was
left in place after the implementations landed. Six of the sites are
doc-comments sitting directly on the implemented function and stating, in
present tense, that the function is an inert stub (returns `null`, returns a
fixed sentinel, "fires no checkpoint, never drives the child", "dispatches NO
effect"); the other nine are module headers narrating the same retired stub
state. Every named function is fully implemented today in the same file.

## Evidence
Function-doc sites (the comment on the function contradicts the body below it):

src/runtime/effectful-statement-host.ts:548-550 — on
`createEffectfulStatementHost`:
```ts
 * V19d-T stub: `runEffect` is inert — it dispatches NO effect through the real
 * query / tool-call / invoke hosts and returns an inert `Ok(null)`, so every
 * integration assertion reds. The paired `V19d` leaf fills it in.
```
The body's `runEffect` (:596-614) dispatches through the real hosts
(`return runQueryEffect(expr, env, deps, chain);` at :611, with the tool-call
and invoke arms following).

src/runtime/expression-evaluator.ts:87-90 — on `evaluateSource`:
```ts
 * V3a-T stubs this as the inert `null` sentinel: it neither parses nor
 * evaluates `source` and never touches `host`, so every value assertion reds on
 * its own primary expectation and the short-circuit must-run assertion reds
 * because the host call is never recorded. The paired V3a leaf implements it.
```
The body (:92-97) tokenizes, parses, and evaluates: `const tokens =
tokenize(source); ... return evaluateNode(ast, host);`.

src/runtime/expression-evaluator.ts:577 — on `checkBooleanPosition`, whose
body (:579-607) runs `checkCompatible` and returns the
`theta/parse/non-boolean-condition` diagnostic:
```ts
 * V3a-T stubs this inert (no diagnostics); the paired V3a leaf fills it in.
```

src/runtime/function-result.ts:68-70 — on `discardForVoid`, whose body
(:72-77) is `void tailValue; return null;`:
```ts
 * V3d-T stubs this so it returns the tail value unchanged (no discard), so the
 * FN-4 void-discard test reds on its own primary assertion. The paired V3d leaf
 * returns `null`.
```

src/runtime/err-note-render.ts:119 — on `renderLeafKindNote`, whose body
(:121-188) renders the SNK-a…SNK-k templates (e.g. :142 `` return `${prefix}
returned Err: transport ${DASH} ${renderNoteField(e.message)}`; ``):
```ts
 * The V12b-T stub returns the sentinel so the per-kind string assertions red.
```
src/runtime/err-note-render.ts:196-197 — the same claim on
`renderTopLevelErrNote`, whose body (:199-224) walks the wrapper chain and
appends the SLSH-5 suffix:
```ts
 * The V12b-T stub returns the sentinel so the SLSH-3/SLSH-4/SLSH-5 string
 * assertions red on their own primary comparison.
```

src/runtime/invoke-cancellation.ts:117-119 — on `runInvokeChild`, whose body
(:131 onward) awaits `checkpoint.before("invoke", site)`, reads
`signal.aborted`, and drives the child; the module header (:24-30) itself
says "V15m (this implementation leaf) fills in `runInvokeChild`":
```ts
 * V15m-T stubs this inert: it fires no checkpoint, never drives the child, and
 * returns a cancelled outcome carrying no committed side effect. The paired V15m
 * leaf implements it.
```

Module-header sites (present-tense stub narration for functions implemented
below in the same file):

src/runtime/effectful-statement-host.ts:29-36 (claims the file IS the tests
task):
```ts
// V19d-T (this tests task) declares the assembly seam and stubs the
// behaviour-bearing `runEffect` inertly: the returned host dispatches NO effect
// through the real query / tool-call / invoke hosts — it returns an inert
// `Ok(null)` — so every paired integration assertion reds on its own primary
```

src/runtime/invocation.ts:20-32:
```ts
// V15a-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions:
//   - `checkInvokePathContainment` returns an inert `""` canonical path and
//     `within: false`, so both the within-root and the byte-exact-`realpath`
//     assertions red.
```
`checkInvokePathContainment`'s body (:108 onward) computes the real
canonical path (`const canonicalPath = await canonicalizePath(deps.fs,
resolvedPath);`) and the containment verdict; `checkInvokePathAtLoad`,
`recheckInvokePathAtRuntime`, and `runStaticResolutionPass` are likewise
implemented in this file.

src/runtime/invoke-ceiling-depth.ts:37-42:
```ts
// V15j-T (tests-task) declares the seam shapes and stubs both behaviour-bearing
// functions inertly — each never fires (returns `undefined`), so a depth-6 value
// yields no breach and the failing tests red on their own primary "expected a
// breach" assertion, per the per-phase TDD ritual's "fail red for the intended
// reason". The paired `V15j` implementation leaf fills in the depth-walk
// short-circuit and the `InvokeInfraError` wrapping.
```
`enforceInvokeDepth` (:136 onward) runs `wireFormDepthWalk(value)` and wraps
the breach.

src/runtime/invoke-cross-mode.ts:27-36 (the stub roster; :38-43 then narrates
the implementation stage — `selectCalleeContext` at :132 carries the correct,
non-inverted mapping):
```ts
// V15l-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions:
//   - `selectCalleeContext` returns the INVERTED mapping (subagent → "attach",
//     prompt → "fresh"), so every cell's context assertion reds.
```

src/runtime/depth-walk.ts:32-37 (`jsonDepth` at :141 computes the real depth;
the implementation section is marked "V5e — implementation" at :107-110):
```ts
// V5e-T (tests-task) declares the seam shapes and stubs both behaviour-bearing
// functions inertly — `jsonDepth` returns a wrong constant, `depthWalk` never
// fires, and `routeDepthBoundary` deranges the site→destination map — so the
// failing tests compile and red on their own primary assertions.
```

src/runtime/expression-evaluator.ts:36-51, src/runtime/function-result.ts:15-21,
and src/runtime/err-note-render.ts:25-30 carry the same per-module stub
roster ("`evaluateSource` returns the inert `null` sentinel", "`functionResult`
returns an unimplemented sentinel for every outcome; `discardForVoid` returns
the tail value unchanged", "stubs the two render entries inertly /
non-compliantly (they return a fixed sentinel...)").

## Why this is a problem
Historical narration comments: each site describes a stub state that no longer
exists anywhere in the file — the described stub bodies were replaced by the
paired implementations, so the comments now assert falsehoods about the code
they annotate ("returns an inert `Ok(null)`", "never touches `host`", "returns
the tail value unchanged", "fires no checkpoint"). A reader trusting the
doc-comment on `runInvokeChild` or `evaluateSource` would conclude the
production path is a non-functional stub. This is the same retired-scaffolding
narration class already confirmed in other directories (e.g. the pending
qw20260907130901-d2-01/d2-08/d2-09 stub-narration batches covering binder/,
discovery/, and extension/ modules); none of those cover these nine
`src/runtime/` files.

## Suggested direction (non-binding, optional)
Drop the stub-phase sentences (or recast them as past-tense provenance where
the seam split is still worth naming), keeping the seam/spec description that
is still true of the implemented code — the same treatment the earlier
stub-narration batches propose for their directories.

## False-positive check
- Verified each named function is implemented, not stubbed:
  `runEffect` dispatches (effectful-statement-host.ts:596-614), `evaluateSource`
  parses/evaluates (:92-97), `checkBooleanPosition` returns the diagnostic
  (:579-607), `discardForVoid` returns `null` (:72-77), `renderLeafKindNote` /
  `renderTopLevelErrNote` render the templates (:121-224),
  `checkInvokePathContainment` computes real containment (invocation.ts:108+),
  `runInvokeChild` awaits the checkpoint and drives (invoke-cancellation.ts:131+),
  `enforceInvokeDepth` runs the wire-form walk (invoke-ceiling-depth.ts:136+),
  `selectCalleeContext` returns the correct mapping (invoke-cross-mode.ts:132),
  `jsonDepth`/`depthWalk`/`routeDepthBoundary` are implemented
  (depth-walk.ts:141-232).
- Checked the already-filed intake set for overlap: the three
  stale-tests-task-stub-narration batches (qw20260907130901-d2-01, -d2-08,
  -d2-09) list binder/, diagnostics/, discovery/, and extension/ files only;
  the per-module filings (schema-validator, value-model, tool-call,
  lowering-system, extension-modules, parser-seam, lexer-parser,
  factory-header-scope) name other modules. None cite these nine files.
- Confirmed the narration is not describing a live stub elsewhere: searched
  for paired stub bodies (`grep -n "not implemented" src/runtime/` and the
  named sentinel returns) — the stubbed forms described do not exist in the
  repository's src tree.

## Triage
