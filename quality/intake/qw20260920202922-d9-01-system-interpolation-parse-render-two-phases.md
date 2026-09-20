---
id: pending
title: system-interpolation.ts bundles the parse-time template check and the resolve-time render, whose sole production consumers live in different layers
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/system-interpolation.ts:1-761
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/system-interpolation.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# system-interpolation.ts bundles the parse-time template check and the resolve-time render, whose sole production consumers live in different layers

## Observation
`src/parser/system-interpolation.ts` is 761 LOC (zone band, 600-999). Its header says the module "owns the `system:` frontmatter field's interpolation surface" and names two entry points explicitly: "the parse-time `checkSystemInterpolation` and resolve-time `renderSystemPrompt` entry points" (line 29). The two entry points run in different phases (frontmatter parse vs conversation creation), share no locals, and each has exactly one production importer — in different layer directories: the parse half is consumed only by `src/parser/frontmatter.ts`, the render half only by `src/extension/production-theta-producer.ts`.

## Evidence
Distinct-concern inventory (LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| parse-time template validation | CheckSystemInterpolationInput, CheckSystemInterpolationResult, checkSystemInterpolation, isIdentStart, isIdentPart, splitPathSegments, parseInterpolationPath, located | 217-480, 533-546 | 236 |
| resolve-time render | RenderSystemPromptInput, RenderSystemPromptResult, renderSystemPrompt, interpolationTypeOfValue, unionArmObjectType, resolvePath | 551-761 | 155 |
| param-type / template model (shared) | SystemParamType, SystemUnionArm, SystemTemplatePart, SystemTemplate | 121-212 | 71 |
| terminal-type conversion (shared, also exported to extension) | toInterpolationType | 495-530 | 36 |
| diagnostic code + message anchors | 6 code consts, 2 message fns, 3 message consts | 50-92 | 20 |

Consumer split (search: `from "../parser/system-interpolation"` and `from "./system-interpolation"` across src/, 5 hits):
- `src/parser/frontmatter.ts:42-46` imports `checkSystemInterpolation` — the only src caller of the parse half.
- `src/extension/production-theta-producer.ts:283`: `import { renderSystemPrompt } from "../parser/system-interpolation";` — the only src caller of the render half (map: 1 src / 17 test importers of `renderSystemPrompt`).
- `src/extension/import-system-template-patch.ts:21-24` imports `toInterpolationType` + types; `src/extension/production-composition.ts:195` and `src/extension/import-static-checks.ts:109` import types only.

The header names the split itself (lines 28-30):
```
// The seam shapes are `SystemParamType`, the parsed `SystemTemplate`, the
// parse-time `checkSystemInterpolation` and resolve-time `renderSystemPrompt`
// entry points, and the diagnostic code + message anchors.
```

The render half's private helpers are render-only: `interpolationTypeOfValue` (652-675, "mirrors `production-theta-producer.ts`'s `interpolationTypeOf` exactly" per its own doc, 652), `unionArmObjectType` (697-739), `resolvePath` (742-761). None is reachable from the parse half.

## Why this is a problem
Zone band carries no presumption, so the case rests on the 2-or-more-concern inventory above: two entry-point concerns of 236 and 155 LOC that execute in different phases, share zero locals and zero private helpers, and are consumed by exactly one production module each — in different layer directories (parser/ vs extension/). Reasons considered and defeated: single algorithm with shared local state — fails, the two entry points share only the `SystemTemplate`/`SystemUnionArm` type declarations, no runtime state; closed-enumeration dispatch — fails, only `toInterpolationType` (36 LOC) is a spec-mirroring switch, not the file; data-only module — fails, type declarations plus code/message anchors are 127 of 761 LOC (~17%); one grammar production family — fails, the Path production recognition (`splitPathSegments` + `parseInterpolationPath`, 113 LOC) is a fraction of the file and the render half is not recognition; generated code — no generator cited anywhere in the file.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the resolve-time render — `renderSystemPrompt`, `RenderSystemPromptInput`, `RenderSystemPromptResult`, `interpolationTypeOfValue`, `unionArmObjectType`, `resolvePath` -> `system-prompt-render.ts` (name a hypothesis) — 155 LOC; exported symbols moved: `renderSystemPrompt`, `RenderSystemPromptInput`, `RenderSystemPromptResult` (external importers per map: 1 src / 17 tests for `renderSystemPrompt`, 0/0 for the two interfaces); cross-references back into the host: type imports of `SystemTemplate`, `SystemTemplatePart`, `SystemUnionArm`. This drops the host to ~606 LOC. Seam B (hypothesis, unproven): the shared model types (`SystemParamType`, `SystemUnionArm`, `SystemTemplate`, `SystemTemplatePart`, 71 LOC) -> a `system-template-types.ts` both halves import — exported symbols moved carry 3/1, 1/0, 3/5, 1/0 importers per the map; no cross-references back. Seam A alone or A+B both leave every consumer's import a rename. The human ratifies one.

## False-positive check
Band check: 761 LOC, zone per the structural map — 2-concern inventory required and supplied (5 rows, two ≥150 LOC). Reasons-considered list: all five concrete reason classes checked and defeated above (shared-state, closed-enumeration, data-only with the 127/761 count, grammar-production, generated). Exemptions check: `quality/exemptions.json` has no `D9:src/parser/system-interpolation.ts` entry. Generated-code check: no generator header; hand-maintained doc comments citing bugs 0406/0422/0425/0444. Spec-mirror check: the file cites frontmatter/frontmatter-fields-b-and-templates.md §`system` Interpolation — that section defines the diagnostic set and grammar the parse half mirrors, not a mandate that parse and render share a module. Duplicate check: no prior D9 filing on this file (the pending `qw20260920183643-d4-01-system-interp-brace-scanner-cloned` is a D4 clone finding on the brace scanner; `qw20260920183643-d2-09-system-interp-load-consumer-citations` is a D2 citation finding — different classes, different claims).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 761 LOC / zone band; inventory LOC sums re-added exactly (parse 236, render 155, model 71, anchors 20); private-helper use sites confirm the halves share zero runtime helpers (`located`/`splitPathSegments`/`parseInterpolationPath` only at 266-441, `resolvePath`/`unionArmObjectType`/`interpolationTypeOfValue` only at 588-625), only the `SystemTemplate`/`SystemUnionArm` types and the 36-LOC `toInterpolationType` switch cross; consumer split reproduces (`checkSystemInterpolation` imported only by src/parser/frontmatter.ts:42-46, `renderSystemPrompt` only by src/extension/production-theta-producer.ts:283 — the other two src mentions are doc comments); no `system-interpolation` key in quality/exemptions.json, no prior D9 filing on this host (PTQ-0304 is import-static-checks; the two pending same-file candidates are D2/D4); no overlooked concrete/strong reason found (type+anchor LOC ≈17%, no generator, no reverted split). Seam A vs A+B is a design decision for a human ruling. (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map reproduces 761 LOC / zone band with no exemption key; inventory rows re-add exactly from the map (parse 236 = 12+6+85+3+3+23+90+14, render 155 = 6+3+59+24+43+20, model 71, toInterpolationType 36, anchors 20); grep of helper call sites confirms the halves share no runtime helper (parse helpers only at 266-479, render helpers only at 588-625; `toInterpolationType` is parse-side at 475/479 plus one extension importer) and the header at 28-30 names the two entry points verbatim; consumer split reproduces with tolerable drift (`checkSystemInterpolation` imported only at src/parser/frontmatter.ts:42-46, `renderSystemPrompt` only at src/extension/production-theta-producer.ts:282, the other src hits are comments; import-static-checks.ts:109 / production-composition.ts:191 are type-only); reasons-considered stand — data/type LOC 127/761 ≈ 17 %, no generator, the spec citation defines the surface not co-location, git log shows no prior split reverted; existing host issues PTQ-1106 (D2), PTQ-1120 / PTQ-1124 (D4) are different root causes, no D9 filing on this host. The seam shape (A vs A+B) is a design decision for a human ruling. (triage: claude-fable-5-1)
