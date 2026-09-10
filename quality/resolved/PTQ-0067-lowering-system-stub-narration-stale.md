---
id: PTQ-0067
title: schema-lowering.ts and system-interpolation.ts still narrate their functions as inert tests-task stubs although every named function is implemented
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/schema-lowering.ts:28-30
  - src/parser/system-interpolation.ts:28-34
  - src/parser/system-interpolation.ts:257-259
  - src/parser/system-interpolation.ts:580-582
sites: 4
fix_scope: cross-module
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# schema-lowering.ts and system-interpolation.ts still narrate their functions as inert tests-task stubs although every named function is implemented

## Observation
Both module headers, and two per-function doc comments in system-interpolation.ts, describe the current file state in present tense as the tests-task (V*-T) stub phase: functions are said to be stubbed inertly so failing tests red, with the paired implementation leaf yet to "fill these in". Every function those sentences describe is implemented in the same file and does the opposite of what the narration states.

## Evidence
src/parser/schema-lowering.ts:28-30 (header):
```
// V5f-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function so the failing tests compile and red on their own primary
// assertions. The paired V5f implementation leaf fills these in.
```
Counter-evidence in the same file: `canonicalForm` serialises every kind (schema-lowering.ts:70-99), and `dedupInlineSchemas` raises the collision diagnostic (schema-lowering.ts:749-755):
```
    diagnostics.push({
      severity: "error",
      code: "theta/load/schema-slug-collision",
      file: site.file,
      range: site.range,
      message: `schema-slug collision on slug ${fragment.slug}: two distinct inline schemas hash alike`,
    });
```

src/parser/system-interpolation.ts:28-34 (header):
```
// V6d-T (tests-task) declares these seam shapes — `SystemParamType`, the parsed
// `SystemTemplate`, the parse-time `checkSystemInterpolation` and the
// resolve-time `renderSystemPrompt` entry points, and the diagnostic code +
// message anchors — and stubs the two behaviour-bearing functions inertly so
// the failing tests compile and red on their own primary assertions (no
// diagnostic fires, no template is produced, and rendering yields empty text).
// The paired V6d implementation leaf fills these in.
```
src/parser/system-interpolation.ts:257-259 (`checkSystemInterpolation` doc):
```
 * V6d-T stubs this as an inert pass (no diagnostics, no template); the paired
 * V6d implementation leaf parses the template, applies the four parse checks,
 * the prompt-mode rejection, and the `\${` escape, and maps each validated
```
src/parser/system-interpolation.ts:580-582 (`renderSystemPrompt` doc):
```
 * V6d-T stubs this as an inert pass returning empty text; the paired V6d
 * implementation leaf resolves the path segments and feeds each resolved value
 * into `stringifyInterpolatedValue`.
```
Counter-evidence in the same file: `checkSystemInterpolation` emits the prompt-mode refusal (system-interpolation.ts:269-275) and returns the parsed template (:341-345); `renderSystemPrompt` resolves each path and stringifies through the shared renderer (:587-596) and returns the rendered text (:641 `return { ok: true, text };`).

## Why this is a problem
Historical narration: each excerpt makes a present-tense claim — "stubs every behaviour-bearing function", "no diagnostic fires, no template is produced, and rendering yields empty text", "stubs this as an inert pass" — that is false against the code directly beneath it. Git shows each paired leaf landed: V5f-T 68bf05b1 → V5f c08cbff8 (schema-lowering.ts); V6d-T 397eca81 → V6d 72607649 (system-interpolation.ts). The narration describes the delivery process's intermediate state, not the shipped module. In-scope siblings show the retensed convention (schema-declarations.ts:31-32 "V5a-T (tests-task) declared these seam shapes; V5a (this leaf) implements every check"; schema-subset-gate.ts:18 "V5d implements the allowlist gate; V5d-T declared the seam shapes"), so these two files are the exception.

## Suggested direction (non-binding, optional)
Retense or drop the stub-era sentences the way schema-declarations.ts and schema-subset-gate.ts already do — state what the module owns now, and leave the tests-task/leaf split to git history.

## False-positive check
- Verified every narrated absence is present in current code: canonicalForm/canonicalHash/schemaSlug return real serialisations and digests (schema-lowering.ts:70-138); lowerUnion returns the two SUBS-1 forms (:175-198); buildSidecar builds the maps (:361-390); dedupInlineSchemas dedups and raises (:726-758); checkSystemInterpolation emits five diagnostic codes and returns a template (system-interpolation.ts:262-346); renderSystemPrompt renders non-empty text (:584-642).
- Duplicate check against every already-filed stub-narration finding: qw20260907130901-d2-01 (seams/schema-validator), d2-01 value-model, d2-01/-08/-09 stale-tests-task-stub-narration (binder/, extension/, discovery/, diagnostics/ modules), d2-05 tool-call, and this wave's qw20260907183353-d2-03-seam-stub-narration-stale-lexer-parser (lexer.ts, literals.ts, minimal-theta.ts, callable-set.ts, frontmatter.ts, control-flow.ts), d2-07-parser-seam-stub-narration-stale (functions.ts, imports.ts, invoke-diagnostics.ts, literal-sublanguage.ts, match-result.ts, params.ts, query-schema-inference.ts), d2-07-extension-modules-stub-narration-stale (extension files) — none cites schema-lowering.ts or system-interpolation.ts.
- Git intent check: `git log --follow` on both files shows the tests-task commit followed by the implementation-leaf commit (68bf05b1 → c08cbff8; 397eca81 → 72607649).
- Not a dead-code claim; the functions are alive in production (params.ts, frontmatter.ts, inbound-boundary.ts, production-theta-producer.ts, import-static-checks.ts callers verified) — only the narration is stale.

## Triage
verdict: confirmed — all four excerpts verbatim at cited lines; every named function implemented (grep finds "stub/inert" only in the narration itself), git confirms V5f-T 68bf05b1→V5f c08cbff8 and V6d-T 397eca81→V6d 72607649, siblings schema-declarations.ts:27-28 / schema-subset-gate.ts:17 show the retensed convention, and no peer intake filing cites either file (triage: claude-opus-5)
