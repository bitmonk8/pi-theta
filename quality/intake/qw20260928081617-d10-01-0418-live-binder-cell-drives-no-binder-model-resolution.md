---
id: pending
title: Fix record 0418 credits live obligation (3) to tests/live/withheld-binder-provenance-live-cell.test.ts as "driving real binder-model resolution … against the live registry serving the colliding openrouter ids", but that cell's three thetas have no params and no bind_model, so they are binder-bypass-eligible and resolve no binder model
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0418-binder-model-reference-dual-reading-collision.md:187
  - tests/live/withheld-binder-provenance-live-cell.test.ts:112-149
  - src/extension/production-composition.ts:1991-2002
  - src/binder/binder-envelope.ts:196-203
  - src/binder/binder-model.ts:200-208
  - docs/spec_topics/binder/binder-model-and-context.md:10
  - CHANGELOG.md:1425
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0418 credits live obligation (3) to tests/live/withheld-binder-provenance-live-cell.test.ts as "driving real binder-model resolution … against the live registry serving the colliding openrouter ids", but that cell's three thetas have no params and no bind_model, so they are binder-bypass-eligible and resolve no binder model

## Observation
Fix record 0418 settles a binder-model reference-parsing question: `bind_model:` / `theta.binderModel` strings read under the first-slash split. Its Verification line meets live obligation (3) with `tests/live/withheld-binder-provenance-live-cell.test.ts`. The record says that cell drives "real binder-model resolution" against the registry that serves the colliding ids. The cell is bug 0143's live carrier for the *match-arm pattern binder* withheld-type sentinel. All three of its thetas carry only `mode: prompt` frontmatter, with no `params:` and no `bind_model:`. Production composition skips binder-model resolution for a theta with no params ("no-params bypass"). So the cell resolves no binder model, and no bind_model string is read under either reading. The word "binder" in the cell's name refers to a pattern binder, not the argument binder. The cell had no `params:` / `bind_model:` at the 0418 fix commit `cabd5ae0` either.

## Evidence
Claim side, `docs/bugs/0418-binder-model-reference-dual-reading-collision.md:187` (re-read before filing):
```
- Verification: `bug-fix-verifier` PASS — (1) witness genuine via reverse red-proof, restored byte-exact (hash `eefd2bd3…`); (2) full suite 571/10439 green; (3) live adjacent binder cell `tests/live/withheld-binder-provenance-live-cell.test.ts` 1/1 (rc=0, orchestrator-run under the global live lock) driving real binder-model resolution through `bootShippedExtension` against the live registry serving the colliding openrouter ids; (4) typecheck + lint clean; …
```

Evidence side. `tests/live/withheld-binder-provenance-live-cell.test.ts:112-149` has three fixtures, each with frontmatter of just `mode: prompt`:
```
const CLEAN_THETA =
  [
    "---",
    "mode: prompt",
    "---",
    "// bug 0143 join-element withhold-gate live carrier (string element, …)",
    'let q = match "hi" { x => [x] }.join(",")',
    "@`What is 18 + 24? Reply with only the resulting integer digits and nothing else.`",
  ].join("\n") + "\n";
```
`CONTROL_THETA` (:130) and `PRECONDITION_THETA` (:141) have the same `"---", "mode: prompt", "---"` frontmatter.
- `grep -c "bind_model" tests/live/withheld-binder-provenance-live-cell.test.ts` → 0
- `grep -c "params:" tests/live/withheld-binder-provenance-live-cell.test.ts` → 0
- At the fix commit, `git show cabd5ae0:tests/live/withheld-binder-provenance-live-cell.test.ts | grep -c -E "bind_model|params:"` → 0

The file header (lines 1-40) names its subject as bug 0143's "withheld-binder sentinel": a *match-arm binder's* element type is withheld and the join gate defers. `describe` at :151 reads `"bug 0143 live: a match-arm-binder join-element read loads/registers/drives clean, …"`.

`src/extension/production-composition.ts:1991-2002`. Bypass-eligible thetas skip binder-model resolution:
```
  // Binder-model resolution (binder-model-and-context.md §"Binder model"): a
  // NON-bypass theta's binder model resolves at LOAD time from the two-step
  // chain (`bind_model:` → `theta.binderModel`) over the SAME shared
  // `modelMatcher` the `model:` resolution binds. …
  // … Bypass-eligible thetas
  // (no-params / single-string) skip resolution entirely (they never call the
  // binder). …
  const bypassEligible =
    classifyBinderBypass(input.frontmatter.params?.fields).kind !== "binder";
```
`src/binder/binder-model.ts:200-208` (the resolver the composition calls with `bypassEligible`, production-composition.ts:2031-2043) returns before any matcher or probe runs:
```
export function resolveBinderModel(
  input: BinderModelResolutionInput,
): BinderModelResolution {
  // Bypass-eligible thetas (no-params / single-string bypass) never call the
  // binder, so they skip both binder-model resolution and the strict-capability
  // probe entirely (binder-model-and-context.md §Binder model).
  if (input.bypassEligible) {
    return { resolved: true, diagnostics: [] };
  }
```
`src/binder/binder-envelope.ts:196-203`. Absent params classify as bypass:
```
export function classifyBinderBypass(
  fields: readonly BypassParamsField[] | undefined,
): BinderBypassDecision {
  // No-params check runs BEFORE single-string, so a `params: {}` theta (zero
  // fields) cannot match the single-string branch.
  if (fields === undefined || fields.length === 0) {
    return { kind: "no-params-bypass" };
  }
```
The spec, `docs/spec_topics/binder/binder-model-and-context.md:10`, ends: "Bypass-eligible thetas (no-params bypass and single-string bypass; see [Binder bypass]…) skip both checks — they never call the binder."

Corroboration only (out of surface): `CHANGELOG.md:1425` repeats the claim: "Live: adjacent `withheld-binder-provenance-live-cell` 1/1 under the lock (real resolution against the collider-serving registry)."

## Why this is a problem
The record words obligation (3) as host-level proof of the behaviour 0418 pins: real binder-model resolution against colliding ids. The named cell exercises none of that. Its thetas are no-params bypass thetas, and production and spec both say those never resolve a binder model. The live evidence therefore shows only that an unrelated match-arm-binder theta registers and drives. The record's other evidence stands: the default-suite witness `tests/b0418-binder-model-reference-first-slash-ordering.test.ts` pins both matchers over a synthetic collision registry. So 0418's actual proof is offline and unit-level. The Verification line presents it as live resolution against the colliding registry. The record also states "No behaviour change, so no new live cell was owed" (line 190). The obligation-(3) wording is the part the evidence does not support.

## Suggested direction (non-binding, optional)
Re-word obligation (3) to what the cell proves, or drop it in favour of the record's own "no new live cell was owed" disposition. If a live adjacency is wanted, the cells that derive `bind_model: <provider>/<id>` through `tests/live/acceptance/harness.ts:377` do reach load-time binder-model resolution. The record already names that derivation site as `:379`.

## False-positive check
- Confirmed the witness path resolves (`ls tests/live/withheld-binder-provenance-live-cell.test.ts` → present, 242 lines). This is not a decayed pointer. The finding is about what the cell exercises.
- Checked every fixture in the cell for a binder trigger. The three `const *_THETA =` definitions (:112, :130, :141) and the three `"mode: prompt"` frontmatters (:115, :133, :144) were read. There are 0 `params:` and 0 `bind_model` occurrences. The same was true at fix commit `cabd5ae0`, so this is not later drift.
- Checked whether a no-params theta reaches binder-model resolution by another route. Production gates resolution on `classifyBinderBypass(...).kind !== "binder"` (production-composition.ts:2001-2002), and `resolveBinderModel` returns `{ resolved: true, diagnostics: [] }` for a bypass-eligible theta before the matcher runs (binder-model.ts:206-208). Absent `params` returns `no-params-bypass` (binder-envelope.ts:201-202). The spec says bypass thetas "never call the binder". The other `matchAvailableModel` sites in production-composition.ts are the strict-capability probe (:844), which is reached only through binder-model resolution and so is skipped under bypass, and the `model:`-field typed-query provider warning (:2064-2070). None of the cell's thetas has a `model:` line either.
- Checked the house honesty-marker rule. The claim is unmarked; it is stated as met ("PASS … driving real binder-model resolution").
- Not a truth adjudication of 0418's pinned behaviour. The offline witness (8 `it()` cells, matching the record's "8/8") exists and is not disputed.

## Triage
verdict: questionable — accounting verified: 0418:187 credits obligation (3) to tests/live/withheld-binder-provenance-live-cell.test.ts as "driving real binder-model resolution … against the live registry serving the colliding openrouter ids", but that cell's three thetas (CLEAN/CONTROL/PRECONDITION, :112/:130/:141) are all bare `mode: prompt` with 0 `bind_model`, 0 `params:` and no `model:` (the same at cabd5ae0). classifyBinderBypass returns no-params-bypass for absent fields (binder-envelope.ts:201-202), and resolveBinderModel returns early for bypassEligible (binder-model.ts:206-208, called from production-composition.ts:2001-2043), so the live evidence is a live-suite drive of a no-params theta, not live binder-model resolution. The claim overstates what the evidence shows. Rewording obligation (3) is a human's ruling (triage: claude-opus-5-5)
