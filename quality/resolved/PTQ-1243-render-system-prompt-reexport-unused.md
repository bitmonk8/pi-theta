---
id: PTQ-1243
title: system-interpolation.ts re-exports renderSystemPrompt/its input/result types that no importer pulls through this module
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/system-interpolation.ts:43-47
sites: 1
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# system-interpolation.ts re-exports renderSystemPrompt/its input/result types that no importer pulls through this module

## Observation
`system-interpolation.ts` re-exports `renderSystemPrompt`, `RenderSystemPromptInput`, and `RenderSystemPromptResult` from `./system-prompt-render` at its top (lines 43-47). Every production and test call site that uses `renderSystemPrompt` (or its input/result types) imports it directly from `../parser/system-prompt-render` / `./system-prompt-render`, never from `system-interpolation.ts`.

## Evidence
`src/parser/system-interpolation.ts:43-47`:
```ts
export {
  renderSystemPrompt,
  type RenderSystemPromptInput,
  type RenderSystemPromptResult,
} from "./system-prompt-render";
```

Search 1 — every reference to `renderSystemPrompt`/`RenderSystemPromptInput`/`RenderSystemPromptResult` across `src/`, `extensions/`, `tools/`, `tests/` (excluding the two parser files themselves), restricted to lines that import from a module path containing `system-interpolation`:
```
grep -rn "renderSystemPrompt\|RenderSystemPromptInput\|RenderSystemPromptResult" --include=*.ts . | grep "system-interpolation\""
```
Only hit: `.pi/tmp/fixes/0066-scratch-orig/src_extension_production-theta-producer.ts:221` — a scratch/backup file under `.pi/tmp/`, not part of the live source tree.

Search 2 — every live importer of `renderSystemPrompt` (`src/extension/production-theta-producer.ts:268`, and ~20 test files under `tests/`) imports it from `../parser/system-prompt-render` (or the equivalent relative path), never from `system-interpolation`.

Search 3 — every live import of anything from `system-interpolation.ts` itself:
```
grep -rn "from \"\.\./parser/system-interpolation\"\|from \"\./system-interpolation\"" --include=*.ts src/ extensions/ tools/ tests/
```
Hits: `import-static-checks.ts` (`SystemParamType`, `SystemTemplate` types only), `import-system-template-patch.ts`, `production-composition.ts` (`SystemTemplate` type only), `frontmatter.ts`, `system-param-types.ts` (`SystemParamType`, `SystemUnionArm`), `system-prompt-render.ts` itself (`SystemTemplate`, `SystemUnionArm`) — none imports `renderSystemPrompt` or its two type names from this module.

## Why this is a problem
The re-export is a redundant indirection: the header comment at the top of `system-interpolation.ts` (lines 1-33) states the module's exports include "the parse-time `checkSystemInterpolation` and re-exported resolve-time `renderSystemPrompt` entry points," but no code in the tree actually consumes `renderSystemPrompt` through this re-export path — every call site already reaches directly into `system-prompt-render.ts`, the module `renderSystemPrompt` is actually declared in. The re-export adds a second resolvable path to the same three names with zero current readers, which is the "redundant re-export file nothing imports through" shape, scoped to this one export statement rather than a whole file.

## Suggested direction
Drop the re-export statement (lines 43-47) and update the header comment's "re-exported resolve-time `renderSystemPrompt`" claim to describe the two modules as siblings instead, since every consumer already imports `renderSystemPrompt` straight from `system-prompt-render.ts`.

## False-positive check
- Ran `grep -rn "renderSystemPrompt\|RenderSystemPromptInput\|RenderSystemPromptResult"` across the whole repository tree (`.`) including `src/`, `extensions/`, `tools/`, `tests/`; every hit importing from a `system-interpolation` path is confined to a `.pi/tmp/` scratch backup file, not the live tree.
- Confirmed the sole production caller (`production-theta-producer.ts:268`) and all ~20 test files importing `renderSystemPrompt` use the `system-prompt-render` path directly.
- Checked for string-keyed/dynamic access of these three names (module-namespace `import *` usage): none found — every import is a named ES import.
- This is not a test-only-reachable case: the re-export itself has zero readers (test or production), so the "tests are legitimate callers" carve-out does not apply — no caller, test or production, uses this re-export.
- Not a house-export-style `*Deps`/diagnostic-anchor/kind-discriminator exemption: `renderSystemPrompt` is an ordinary function re-export, not one of the exempted shapes.

## Triage
verdict: confirmed — excerpt reproduces at 43-47; independently re-ran the hunt: 13 live importers of system-interpolation (6 src, 7 tests) and none of their import lists names renderSystemPrompt/RenderSystemPromptInput/RenderSystemPromptResult, no `import *`/dynamic imports, all 20 consumers of the three names import from system-prompt-render directly; git log -L shows the re-export was born in eb3a16f8 (the PTQ-1155 split) which repointed every consumer in the same commit, so it has had zero readers since creation and PTQ-1155's note records no facade intent — dead compatibility re-export, header line 31 needs the matching wording fix (triage: claude-fable-5-1)
