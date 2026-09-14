---
id: PTQ-0061
title: collectInvokeExprs is exported from invoke-static-checks.ts but nothing in src, extensions, tools, or tests imports it — its only caller is same-module buildInvokeGraph
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:159-161
  - src/extension/invoke-static-checks.ts:436
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# collectInvokeExprs is exported from invoke-static-checks.ts but nothing in src, extensions, tools, or tests imports it — its only caller is same-module buildInvokeGraph

## Observation
`collectInvokeExprs` is a one-line projection over the module's shared
call-site walk, declared with `export`. Its only caller is `buildInvokeGraph`
in the same file. No import statement anywhere in the repository names it —
not in src/, extensions/, tools/, or tests/. Two test files mention the name
in prose comments only. The sibling module exports that ARE consumed
externally (`buildInvokeGraph`, `checkInvokeStaticResolution`, `CalleeArity`,
`collectThetaCallableCallSites`, the four `checkImported*` functions) each
have at least one importer.

## Evidence
src/extension/invoke-static-checks.ts:159-161 — the exported definition:

```ts
export function collectInvokeExprs(body: ThetaBody): InvokeExpr[] {
  return collectCallSites(body).invokeExprs;
}
```

src/extension/invoke-static-checks.ts:436 — the sole caller, same module:

```ts
    for (const invoke of collectInvokeExprs(input.body)) {
```

Exhaustive reference search (`grep -rn "collectInvokeExprs"` over the working
tree, node_modules excluded): src/extension/invoke-static-checks.ts:159 (def),
:289 (comment), :436 (internal call); tests/production-tools-load-resolution.test.ts:1051
(comment prose); tests/theta-callable-call-arity.test.ts:33 (comment prose);
plus dist/ build mirrors of the same. Zero `import` sites. Every import from
this module across the repo was enumerated (`from ".*invoke-static-checks"`):
src/extension/production-composition.ts:139-143 (`buildInvokeGraph`,
`checkInvokeStaticResolution`, `type CalleeArity`),
src/extension/import-static-checks.ts:114-121 (the four `checkImported*`
functions and two types), tests/b0362-case-variant-invoke-cycle-edge.test.ts:5-9,
tests/theta-callable-call-arity.test.ts:14, tests/tool-arg-parse-checks.test.ts:13-16 —
none names `collectInvokeExprs`.

## Why this is a problem
Dead export: an exported symbol nothing reaches through the module boundary.
The function itself is alive (it feeds `buildInvokeGraph`'s edge minting), so
the cruft is precisely the `export` modifier, which advertises an external
API surface that has zero consumers and obliges any future signature change
to treat the symbol as public.

## Suggested direction (non-binding, optional)
Demote the declaration to module-private (matching `collectCallSites`, the
unexported walker it delegates to), leaving the externally-consumed exports
of the module untouched.

## False-positive check
Reference searches: identifier grep across src/, extensions/, tools/, tests/,
and dist/ (build mirror) — no import site, only the same-module definition and
internal call plus two prose comments in tests; import-clause enumeration of
every `from ".*invoke-static-checks"` across the repo (5 files) shows the
symbol in none of them. String-keyed/dynamic access: no `require(...)`,
namespace-import (`import * as`), or property access on a module namespace
object references this module anywhere. Re-exports: no barrel re-exports the
module (the package's only entry, extensions/index.ts, re-exports the factory
default alone; package.json declares no `main`/`exports` module API — it is a
pi extension package whose `pi.extensions` points at ./extensions). Tests-only
caller check: not applicable — no test imports it either (prose mentions
only). Git intent: `git log -S collectInvokeExprs -- src/extension/production-composition.ts`
is empty, so the export was never consumed externally and then orphaned; it
has had no importer since introduction.

## Triage
verdict: confirmed — reproduced independently: def at :159-161 and sole caller at :436 inside buildInvokeGraph match verbatim, repo-wide grep yields only def/internal-call/two test prose comments, all 5 import clauses of the module name it nowhere, no namespace/require/re-export/barrel path exists, and the module's two other externally-unreferenced exports are structurally required by exported signatures so the unused `export` here is genuine (triage: claude-opus-5)
