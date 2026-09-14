---
id: PTQ-0079
title: collectCodeSideCallNames is exported but its only caller is checkExtensionToolReachability in the same module
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/extension-tool-reachability.ts:66-70
  - src/extension/extension-tool-reachability.ts:219
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# collectCodeSideCallNames is exported but its only caller is checkExtensionToolReachability in the same module

## Observation
`extension-tool-reachability.ts` exports `collectCodeSideCallNames`, the
theta-body walker that collects code-side call callee names. The repository
holds exactly one call site: `checkExtensionToolReachability` in the same
file. No other `src/`, `extensions/`, or `tools/` module imports it, and no
test imports it — the two files that import from this module
(`production-composition.ts` and `tests/blockexpr-production.test.ts`) import
only `checkExtensionToolReachability`.

## Evidence
src/extension/extension-tool-reachability.ts:66-70 — the exported declaration:
```ts
export function collectCodeSideCallNames(body: ThetaBody): Set<string> {
  const out = new Set<string>();
  walkBlock(body, out);
  return out;
}
```

src/extension/extension-tool-reachability.ts:219 — the only call site, inside
the same module's `checkExtensionToolReachability`:
```ts
  const called = collectCodeSideCallNames(input.body);
```

Search: `grep -rn -w collectCodeSideCallNames src extensions tools tests` —
exactly two hits, the two cited above. Search: `grep -rn
"extension-tool-reachability"` across the same trees — importers are
`src/extension/production-composition.ts:74` and
`tests/blockexpr-production.test.ts:21`, both importing
`checkExtensionToolReachability` only.

## Why this is a problem
Dead export surface, proven dead: the function is alive (its same-module
caller), but the `export` modifier reaches nothing — no import anywhere in
`src/`, `extensions/`, `tools/`, or `tests/`, no namespace import of the
module, no re-export barrel, no string-keyed access. The module's public
surface claims two entry points where the codebase uses one.

## Suggested direction (non-binding, optional)
Drop the `export` modifier so the walker becomes a module-private helper next
to `walkBlock`/`walkStmt`/`walkExpr`, which are already private.

## False-positive check
Reference searches run: word-boundary grep for `collectCodeSideCallNames`
across `src/`, `extensions/`, `tools/`, `tests/` (two in-module hits only);
import-line search for the module path across the same trees (two importers,
neither naming this symbol); namespace/star import and re-export search
(`import * as`, `export *`, `require(`) across the repo — zero hits for this
module; no `index.ts` barrel exists under `src/extension/`. Tests-only caller
rule considered: not applicable — no test references the name (the
witness test `blockexpr-production.test.ts` drives the walker only through
`checkExtensionToolReachability`). Git history check: `git log -S
collectCodeSideCallNames` shows the symbol arriving with the RFC-0006 /
bug-0001 reachability work; no external consumer was ever added or removed
since. Checked the already-filed corpus for the name — no match (the filed
`collect-invoke-exprs-dead-export` finding is about
`src/extension/invoke-static-checks.ts`, a different module and symbol).

## Triage
verdict: confirmed — independently reproduced: repo-wide word-boundary grep yields only the same-module declaration (:66) and call (:219), no star import/barrel/dynamic import/string-keyed access exists, and all module importers (production-composition.ts:74 plus tests/blockexpr-production.test.ts:21 and tests/host-loop-dispatch.test.ts:32, the last missed by the filing but harmless) name only checkExtensionToolReachability, so the export modifier reaches zero consumers while sibling walkers are already private (triage: claude-opus-5)
