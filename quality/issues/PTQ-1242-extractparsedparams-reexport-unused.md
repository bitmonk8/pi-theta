---
id: PTQ-1242
title: frontmatter.ts re-exports extractParsedParams but no importer reaches it through that path
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:47
  - src/parser/frontmatter.ts:66
sites: 1
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# frontmatter.ts re-exports extractParsedParams but no importer reaches it through that path

## Observation
`src/parser/frontmatter.ts` imports `extractParsedParams` from `./frontmatter-params` at line 47 for its own internal use (called at frontmatter.ts:1120), and separately re-exports the same binding at line 66 (`export { extractParsedParams } from "./frontmatter-params";`). The re-export is a second, independent export surface distinct from the internal import; no file in the repository imports `extractParsedParams` from `"../parser/frontmatter"` or `"./frontmatter"` — every other reference to the name is either the declaration/re-export itself or a prose mention inside a comment.

## Evidence
`src/parser/frontmatter.ts:47,66`:
```ts
import { extractParsedParams } from "./frontmatter-params";
...
export { extractParsedParams } from "./frontmatter-params";
```

Search for every `import` statement naming `extractParsedParams` across the repository (`grep -rn "import.*extractParsedParams" src tests extensions tools`) returns exactly one hit:
```
src/parser/frontmatter.ts:47:import { extractParsedParams } from "./frontmatter-params";
```
That is the module's own internal import (consumed at frontmatter.ts:1120), not a consumer of the line-66 re-export. A broader search for the bare identifier `extractParsedParams` anywhere in the tree (`grep -rn "extractParsedParams" --include="*.ts" .`) turns up only: the declaration and its own re-export in `frontmatter.ts` and `frontmatter-params.ts`, doc-comment mentions in `frontmatter-yaml.ts` and `type-compat.ts`, and prose references inside test files' comments (e.g. `tests/schema-field-name-case.test.ts:39,45`, `tests/params-inline-object-lowering.test.ts:25`) — none of which is an `import` statement.

## Why this is a problem
The re-export at frontmatter.ts:66 duplicates the module's own internal import of the same name for no reachable external consumer: every caller that needs `extractParsedParams` already imports it directly from `./frontmatter-params` (there are none in production or tests), and the sole live caller is `frontmatter.ts` itself via its ordinary import at line 47. The re-export is therefore an exported surface with zero importers reaching it through the path it opens, distinct from the "house export style" precedent (which protects a live *declaration*, not an additional unreached re-export of an already-imported binding).

## Suggested direction (non-binding, optional)
Removing the re-export line would not change any resolvable import path, since frontmatter.ts's own internal import already covers its sole use.

## False-positive check
Ran `grep -rn "import.*extractParsedParams" src tests extensions tools` (repository-wide, no exclusions) — one hit, `frontmatter.ts`'s own internal import. Ran `grep -rn "extractParsedParams" --include="*.ts" .` (repository-wide including dist/) — all hits are the declaration, the internal import, the re-export line itself, or comment/prose mentions; no second `import { extractParsedParams }` anywhere. Checked for string-keyed/dynamic access (`["extractParsedParams"]`) — none found. Not test-only reachable: even tests never import it from `frontmatter.ts`, and the function's live production caller is `frontmatter.ts`'s own body via the direct import, not through the re-export.

## Triage
verdict: confirmed — excerpts byte-match at frontmatter.ts:47/66 and the sole live call is frontmatter.ts:1120 via the line-47 import; independent hunt (grep of the identifier across src/tests/extensions/tools/docs, all `from "…frontmatter"` importers incl. multi-line blocks, `export * from …frontmatter` barrels, `["extractParsedParams"]`/`import(...)` dynamic access) finds zero consumers of the re-export — every non-frontmatter.ts hit is a comment or docs prose, and no gate test pins frontmatter's export surface; the facade argument does not apply because git shows extractParsedParams was module-private (`function extractParsedParams(` at 4d18f5cf^:1515, not exported) before the PTQ-1146 split commit 4d18f5cf minted line 66, so the re-export opens a path that never existed, unlike sibling `toSystemParamType` (line 65) which was already exported and is still imported through `../parser/frontmatter` by import-static-checks.ts:103; not a duplicate (PTQ-0406 is an unrelated dead type export; no issue row cites this line) (triage: claude-fable-5-1)
