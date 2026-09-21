---
id: pending
title: parseThetaDocument runs the entire parseFrontmatter pipeline a second time per document only to read the params: field names, discarding everything else
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:213-232
  - src/parser/theta-document.ts:274-292
  - src/parser/frontmatter.ts:1013-1018
  - src/parser/frontmatter.ts:1065-1067
  - src/parser/frontmatter.ts:1083-1091
  - src/parser/frontmatter.ts:1138-1140
sites: 2
fix_scope: cross-module
d8_class: heavier-than-scale
d8_host: src/parser/theta-document.ts#parseThetaDocument
wave: qw20260921210914
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# parseThetaDocument runs the entire parseFrontmatter pipeline a second time per document only to read the params: field names, discarding everything else

## Observation
`parseThetaDocument` calls `parseFrontmatter` twice on the same `split.frontmatter` block: an early call (theta-document.ts:223) whose only consumed output is `earlyFm.paramFields[].name` (the `params:` YAML keys, seeding `BodyParser`'s immutability map), and the authoritative call (theta-document.ts:280) after the body parse produces `bodyTypes`. The early call drives the full frontmatter pipeline — `yaml` `parseDocument`, the recognised-field battery including `modelMatcher` resolution, `extractParsedParams`'s JSON-Schema lowering of every `params:` field (against an empty body-type set, so its unresolved-named-type diagnostics are minted and then discarded), and `buildSystemTemplate`'s `system:` interpolation parse — to obtain a set of key names.

## Evidence
The early pass and its stated purpose — src/parser/theta-document.ts:213-232:
```ts
  // The `params:` field wire names, extracted from the frontmatter BEFORE the
  // body parse so they seed `BodyParser`'s mutability map as immutable at file
  // scope (bug 0370 §Fix F3 — a `params:` field is a parameter, bindings.md:31,
  // always immutable). The authoritative frontmatter parse below needs the
  // body's `bodyTypes` to resolve `params:` NAMED types, so it cannot run
  // first; this early pass reads only the YAML field KEYS — which no `bodyTypes`
  // resolution touches — and its own diagnostics are discarded (the parse below
  // is the authoritative one).
  const paramFieldNames = new Set<string>();
  if (split.frontmatter !== null) {
    const earlyFm = parseFrontmatter(split.frontmatter, {
      file,
      modelMatcher: deps.modelMatcher,
    });
    for (const f of earlyFm.paramFields) {
      if (f.name !== "_") {
        paramFieldNames.add(f.name);
      }
    }
  }
```
What that call actually executes — src/parser/frontmatter.ts:1013-1018 (full YAML document parse), 1065-1067 (model resolution through the injected matcher, run again on the same `model:` value):
```ts
  const { resolvedModel, toolLoopResult, respondRepairResult } = checkRecognisedFields(
    fields, yamlErrored, file, modelMatcher, lineCounter, lineOffset, diagnostics,
  );
```
frontmatter.ts:1083-1091 (`params:` lowering to the binder's runtime JSON Schema — the heaviest phase, here run with `options.bodyTypes === undefined`, so every `NamedType` reference resolves against an empty decl list and its refusals are minted into a diagnostics array the caller throws away):
```ts
  const {
    params,
    fieldInputs,
    diagnostics: paramsShapeDiags,
    loweringDiagnostics: paramsLoweringDiags,
  } = extractParsedParams(
    paramsNode,
    file,
    lineCounter,
    lineOffset,
    bodyTypeDecls,
```
frontmatter.ts:1138 runs `buildSystemTemplate` (the `system:` interpolation parse) on the same discarded pass. The authoritative call at theta-document.ts:280-292 repeats all of it with `bodyTypes` supplied. Data size at the call sites: `parseThetaDocument` is the parse entry for every discovered `.theta`/`.thetalib` (structural map: 2 src importers, 75 test importers) and runs again per file on every watch reload; the early pass's needed output is the `params:` key-name set (typically 0-10 short strings), while its cost is a complete second frontmatter parse per document — roughly doubling frontmatter work (YAML parse, model matching, schema lowering, system-template parse) for every fenced file.

## Why this is a problem
Cost shape disproportionate to the consumed output: the whole 600+-LOC frontmatter pipeline (frontmatter.ts:1006-1183 plus the phases it delegates to) executes twice per document to recover information — YAML mapping keys under `params:` — that the pipeline's first phase alone already yields. The in-code rationale (theta-document.ts:213-220) pins only the ORDERING (key names before the body parse; authoritative parse after `bodyTypes`), and itself concedes the early pass "reads only the YAML field KEYS"; nothing in it defends running model resolution, schema lowering, and system-template parsing to get those keys. The discarded-work path also mints then drops diagnostics (unresolved-named-type refusals computed against the deliberately absent `bodyTypes`), work that exists only to be thrown away.

## Suggested direction (non-binding, optional)
Unproven hypothesis: export a keys-only reader from frontmatter.ts (YAML `parseDocument` + enumeration of the `params:` mapping's keys, the same first phase `collectRecognisedFields` already isolates), and have `parseThetaDocument`'s early pass call that instead of `parseFrontmatter`; the authoritative call is untouched. Alternatively an option on `parseFrontmatter` that stops after field collection. The fix stage owns the choice.

## False-positive check
- Stated-rationale check (D2 precedent: a documented design decision stands unless demonstrably false): the comment at theta-document.ts:213-220 justifies the two-call ORDERING (bug 0370 §Fix F3 and the bodyTypes forward-reference), not the weight of the early call; the proposed accounting preserves both ordering constraints, so the rationale is not being argued against.
- Spec check: no docs/spec_topics/ clause requires the frontmatter to be parsed twice; the observable contract (paramFieldNames seeding BodyParser, authoritative diagnostics from the second parse) is unchanged by a lighter key read. No challenges_spec.
- Exemption check: `exemptions --lens D8` has no entry for src/parser/theta-document.ts or #parseThetaDocument.
- Duplicate check: PTQ-1166 (D9, fixed) inventoried the "early params-name pass" as phase P2 of parseThetaDocument's breakdown but filed no claim about the duplicated pipeline cost; PTQ-1231 (D8, fixed) covered the fence strip/rewrap mismatch at these same call sites, now resolved (both calls pass the `FrontmatterBlock` directly). Grep of quality/issues, quality/resolved, quality/intake for `earlyFm` / `paramFieldNames` found only those two, neither claiming this.
- Liveness check: both `parseFrontmatter` calls and both consumers (`BodyParser` ctor at :234, `fm.*` reads at :281-292) are live production code; no fix direction here demotes production code to test-only reach.

## Triage
verdict: questionable — accounting verified: both excerpts byte-match (theta-document.ts:213-232 early pass consuming only earlyFm.paramFields[].name; :280-292 authoritative pass with bodyTypes), and the early call does run the full pipeline — parseDocument (frontmatter.ts:1013-1018), checkRecognisedFields with modelMatcher (:1065-1067), extractParsedParams → parseParams lowering against an empty bodyTypeDecls list (:1083-1091, frontmatter-params.ts:84-110), and buildSystemTemplate (:1138) — with every diagnostic discarded; the key set is recoverable from the first phase alone since extractParsedParams pushes every scalar-keyed params: item to fieldInputs (refused fields are retained, no `continue` other than non-scalar keys, frontmatter-params.ts:100-106/220-226), so a keys-only read yields the identical name set; these are parseFrontmatter's only two src callers and parseThetaDocument is the per-file parse entry (8 src / 331 total referencing files), so the data-size claim (0-10 key names vs a second full frontmatter parse per document) holds; no D8 exemption for src/parser/theta-document.ts or #parseThetaDocument in quality/exemptions.json; no spec clause requires a double parse and the ordering rationale in the comment is preserved by the direction; not a duplicate — PTQ-1166 (D9) only inventories the early pass as row P2 and PTQ-1231 (D8, fixed) explicitly says the early full parse is 'a separate ordering concern, noted but not filed here'; the simpler shape (keys-only reader vs stop-after-collection option) is a design decision for a human ruling (triage: claude-fable-5-1)
