---
id: PTQ-0337
title: import-static-checks.ts's materializeChain comment names resolveLibExports, an identifier with no declaration anywhere in the codebase
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1089-1098
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# import-static-checks.ts's materializeChain comment names resolveLibExports, an identifier with no declaration anywhere in the codebase

## Observation
The doc comment immediately above the `materializeChain` closure compares its
own cycle-termination bound to "`resolveLibExports`' in-progress bound." No
function, variable, type, or any other declaration named `resolveLibExports`
exists anywhere in the current source tree, and none has ever existed under
that name in the repository's git history — the single line that introduces
the name is also the only line that has ever contained it.

## Evidence
src/extension/import-static-checks.ts:1089-1098 — the comment and the
declaration it precedes:
```ts
  // Materialise an importing specifier by following the
  // re-export chain (imports.md §Re-exports, the resolution paragraph) when the
  // resolved lib's own body carries no matching
  // top-level declaration for the SOURCE name — searching the re-export whose
  // `exported` equals that source name, at its resolved source lib, binding
  // under the IMPORTING specifier's LOCAL name throughout. Bounded by a
  // visited-path set (fresh per top-level specifier) so a re-export cycle
  // terminates by contributing no binding, matching `resolveLibExports`'
  // in-progress bound.
  const materializeChain = async (
```

Repo-wide search (`grep -rn "resolveLibExports" **/*.ts`): exactly one hit,
the line quoted above.

`git log --all -S"resolveLibExports" --oneline -- .` (searches every commit
that ever added or removed the string, across the whole repository): exactly
one commit, `2565269d` ("fix(bug-0101): resolve from-bearing re-export chains
to real bindings"). That commit's diff on this file shows the comment (and
`materializeChain` itself) introduced together in the same hunk — the
function this file does have with the closest matching shape,
`buildModuleScope`, was added three commits later by a different bug fix
(`96f9a136`, bug 0303) and uses its own differently-named guard,
`moduleScopeInProgress`:
```ts
    if (moduleScopeInProgress.has(resolvedPath)) {
      // A lib-to-lib import cycle reached while BUILDING a module scope
      // returns a bounded partial — this lib's own enums, no imports — rather
      // than recursing without termination.
```

## Why this is a problem
The comment's own grammar — "matching `resolveLibExports`' in-progress
bound" — reads as a cross-reference to a second, already-existing mechanism
this file's own bound is being compared against, the same rhetorical role
`buildModuleScope`'s doc comment elsewhere in this file fills when it invokes
`materializeChain`'s doc comment by name ("see `materializeChain`'s
doc-comment above"). No such second mechanism named `resolveLibExports`
exists to compare against: a reader who looks for it to understand what
"in-progress bound" means finds nothing, in this file or anywhere else in the
codebase.

## Suggested direction (non-binding, optional)
Either drop the comparison clause, or point it at the mechanism it appears to
intend — `buildModuleScope`'s own `moduleScopeInProgress` guard, the file's
only other in-progress-style recursion bound.

## False-positive check
- `grep -rn "resolveLibExports"` across the repository root (not limited to
  `src/`): one hit, the comment cited above.
- `git log --all -S"resolveLibExports" --oneline -- .`: one commit
  (`2565269d`), which added the string; no later commit removes or renames it,
  and no earlier commit ever carried it — ruling out both a stale
  post-rename comment and a reverted future feature.
- Confirmed `materializeChain` (the function this comment documents) is
  itself live and not the subject of this finding: called at
  import-static-checks.ts:1061 (its own recursive re-export-chain follow),
  :1142 (from `buildModuleScope`'s per-import loop), and :1418 (the main
  per-specifier loop) in the current file — three real call sites, confirmed
  by `grep -n "materializeChain("`.
- Searched the intake/issues/resolved topic list for `resolveLibExports` or
  `materializeChain` in a title — no match; not a duplicate of any prior
  filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>

verdict: confirmed — excerpt reproduces verbatim at 1089-1098; repo-wide grep shows `resolveLibExports` has exactly one hit (this comment) and `git log --all -S` shows exactly one commit (2565269d, bug-0101) ever touched the string, never removed or renamed, ruling out a stale rename; `materializeChain` is live with 3 real call sites (1061/1142/1418, not dead code); the file's only analogous in-progress guard is `buildModuleScope`'s `moduleScopeInProgress`, added later under a different name by 96f9a136 (bug-0303) — a mechanically-proven dangling cross-reference in production src/, matching this repo's PTQ-0049/PTQ-0119/PTQ-0174 confirmed precedent class; no dedupe hit in issues/resolved (triage: claude-opus-5)
