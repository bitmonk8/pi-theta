---
id: pending
title: buildSubagentFnGraph is exported from subagent-fn-static-checks.ts but called only by checkSubagentFnStaticResolution in the same module
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/subagent-fn-static-checks.ts:179-197
  - src/extension/subagent-fn-static-checks.ts:250
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# buildSubagentFnGraph is exported from subagent-fn-static-checks.ts but called only by checkSubagentFnStaticResolution in the same module

## Observation
`buildSubagentFnGraph` builds the per-file `subagent fn` invocation graph and is
declared `export function`. Its single caller is
`checkSubagentFnStaticResolution`, in the same module. The two production
importers of this module (`import-static-checks.ts`, `production-composition.ts`)
and the two test importers take `checkSubagentFnStaticResolution`,
`checkSubagentFnModelOverrides`, and `collectSubagentFns` only, so the exported
graph builder has no consumer anywhere.

## Evidence
src/extension/subagent-fn-static-checks.ts:179-197 — the exported builder:

```ts
/**
 * Build the per-file `subagent fn` invocation graph (FN-6). Nodes are the file's
 * `subagent fn` names; an edge `a → b` exists when `a`'s body calls `b` and `b`
 * is itself a `subagent fn` declared in the same file. A `subagent fn` calling a
 * PLAIN `fn` (inline, runs in the caller's session — not a spawned boundary) is
 * not an edge; only spawned-boundary calls count toward the cycle, exactly as
 * only `.theta`/`.thetalib` boundary crossings count for the cross-file graph.
 */
export function buildSubagentFnGraph(fns: readonly FnDecl[]): InvokeGraph {
  const subagentNames = new Set(fns.map((fn) => fn.name));
  const edges = new Map<string, readonly string[]>();
  for (const fn of fns) {
    const targets = collectCallCallees(fn.body).filter((callee) =>
      subagentNames.has(callee),
    );
```

src/extension/subagent-fn-static-checks.ts:250 — the only call, module-internal:

```ts
  const graph = buildSubagentFnGraph(fns);
```

Reference search: `grep -rnw "buildSubagentFnGraph"` across `src/`, `tests/`,
`tools/`, `extensions/`, `docs/`, `skills/`, `config/` (`*.ts`, `*.md`, `*.json`)
→ 2 hits, the declaration and the call above.

## Why this is a problem
Dead export surface, proven dead: the function is alive (one in-module caller)
but the `export` modifier reaches nothing — no import in `src/`, `extensions/`,
`tools/`, or `tests/`, no namespace import, no barrel re-export, no string-keyed
access. The module's real cross-module contract is the three checker entry
points its importers name; publishing the internal graph construction step
alongside them widens the apparent surface without a consumer.

## Suggested direction (non-binding, optional)
Drop the `export` modifier so the graph builder joins the module's other
private helpers (`collectCallCallees`, `walkBlock`, `withinFn`).

## False-positive check
- Reference searches run: `grep -rnw "buildSubagentFnGraph"` over `src`, `tests`,
  `tools`, `extensions`, `docs`, `skills`, `config` — the two in-module hits
  only.
- Importer inspection: `grep -rn "subagent-fn-static-checks" src tests
  --include=*.ts` → src/extension/import-static-checks.ts:110-114 and
  src/extension/production-composition.ts:144-148 both import
  `{ checkSubagentFnModelOverrides, checkSubagentFnStaticResolution,
  collectSubagentFns }`; tests/subagent-fn.test.ts:18-20 imports the same
  checkers and tests/blockexpr-production.test.ts:23 imports
  `checkSubagentFnStaticResolution`. None names the graph builder.
- Tests-only-caller rule considered: not applicable — no test references the
  identifier, so this is not test-only-reachable production code.
- Dynamic / re-export access: grep for the quoted identifier and for
  `export *` / `import * as` involving `subagent-fn-static-checks` → 0 hits.
- Duplicate check: `grep -rn "subagent-fn-static-checks" quality/intake` →
  qw20260907130901-d2-03-invoke-diagnostics-tail-reexport-unused.md and
  qw20260907183353-d2-07-extension-modules-stub-narration-stale.md; neither
  cites this export.

## Triage
