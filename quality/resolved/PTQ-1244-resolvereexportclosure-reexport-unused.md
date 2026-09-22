---
id: PTQ-1244
title: import-static-checks.ts re-exports resolveReExportClosure through a binding nothing imports
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/import-static-checks.ts:129-130
sites: 1
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# import-static-checks.ts re-exports resolveReExportClosure through a binding nothing imports

## Observation
`import-static-checks.ts` both imports `resolveReExportClosure` for its own use
and immediately re-exports the same binding on the next line. The import is
used once inside the file (line 1836); the re-export is a separate statement
serving only external importers of `import-static-checks.ts`.

## Evidence
`src/extension/import-static-checks.ts:129-130`:
```ts
import { resolveReExportClosure } from "./import-reexport-closure";
export { resolveReExportClosure } from "./import-reexport-closure";
```

`src/extension/import-static-checks.ts:1836` (the file's own use of the
imported binding):
```ts
    ...(await resolveReExportClosure(walked, parseThetaLib, probe, resolver, unreadablePaths)),
```

Repo-wide search for any importer going through `import-static-checks.ts`
rather than directly through `import-reexport-closure.ts`:
`grep -rn "resolveReExportClosure" --include=*.ts .` (excluding node_modules)
returns exactly four lines: the declaration in `import-reexport-closure.ts:309`,
the import and re-export lines in `import-static-checks.ts:129-130`, and the
one internal call site at `import-static-checks.ts:1836`. No file anywhere in
`src/`, `extensions/`, or `tests/` writes
`import { resolveReExportClosure } from ".../import-static-checks"` — every
consumer that needs the function imports it straight from
`import-reexport-closure.ts` (e.g. that is the only import path used inside
`import-static-checks.ts` itself). `extensions/index.ts` re-exports the
factory, not this module, so no barrel forwards the re-export either.

## Why this is a problem
The re-export at line 130 is a second, unread public surface for a name the
file already consumes privately via its own import at line 129. Unlike the
house `export` convention this repo's precedents protect (an export keyword
left on an otherwise-alive, internally-referenced declaration), this is a
distinct `export { … } from` re-export statement whose only possible
consumers are external importers — and none exist. It sits on the module's
public surface unread by anything in the tree.

## Suggested direction
Drop the re-export line and keep the plain `import` this file already uses for
its own call; if the function belongs on this module's public surface for a
future consumer, that can be re-added when a consumer needs it.

## False-positive check
Searched `resolveReExportClosure` across the whole repo (`grep -rn` over `.`,
excluding `node_modules`): 4 hits total — the declaration, the file's own
import, the re-export, and the file's own call site. Confirmed no test or
`src/`/`extensions/` file imports the symbol through `import-static-checks.ts`
(all `checkThetaImports`-style imports of the module import unrelated names).
Confirmed no `export *` barrel exists that could forward it indirectly
(checked `extensions/index.ts`, the only top-level index file, which
re-exports the factory only). This is not a house `export`-keyword-on-a-live-
declaration case: the declaration itself lives in a different file
(`import-reexport-closure.ts`) and is alive there; this specific re-export
statement is the dead artifact.

## Triage
verdict: confirmed — excerpts byte-exact at import-static-checks.ts:129-130 and the sole call at :1836; repo-wide grep (src/, extensions/, tools/, tests/, incl. .mjs/.js/.json for string-keyed access) yields only the declaration at import-reexport-closure.ts:309, the import, the re-export and the internal call — no `import { resolveReExportClosure } from …/import-static-checks` anywhere, no `export *` barrel forwards the module (the only cross-import, import-reexport-closure.ts:18, runs the other way), and no test imports it (so the test-only carve-out does not apply); git -L shows the `export { … } from` line was minted by the D9 move commit 60bd4037 (qw20260921045345, PTQ-1205's landing) when the function was module-private with 0 external importers, so the re-export never had a consumer; import-reexport-closure.ts's header is a plain module comment, not a compatibility-facade declaration; not a duplicate — PTQ-1205 (breakdown of the function) and the sibling qw20260922150013-d2 filings name different symbols; single root cause, one-line mechanical fix (triage: claude-fable-5-1)
