---
id: pending
title: checkSubagentFnModelOverrides resides in extension despite using only parser-owned inputs
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/subagent-fn-static-checks.ts:192-220
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# checkSubagentFnModelOverrides resides in extension despite using only parser-owned inputs

## Observation
`subagent-fn-static-checks.ts` describes itself as load-time compose-pass wiring for inline subagent functions. Its `checkSubagentFnModelOverrides` declaration is a 29-LOC pure diagnostic check over `FnDecl[]`, a source filename and the parser's injected `ModelReferenceMatcher`. It reads no extension host, composition state, sibling checker or OS seam. This is placement review only: the file is 220 LOC and exempt from breakdown findings.

## Evidence
Affinity unit: distinct member declarations read, excluding JS array methods and fields written on the output `Diagnostic`. The declaration touches **7 members of the foreign parser contract family, 0 members of its own module**:

| parser-owned member | use in misplaced declaration | owning declaration |
|---|---|---|
| FnDecl.withClause | fn.withClause at 199 | src/parser/theta-ast.ts:575 |
| WithField.key | field.key at 199 | src/parser/theta-ast.ts:469 |
| FnDecl.sessionConfig | fn.sessionConfig at 205 | src/parser/theta-ast.ts:582 |
| SubagentSessionConfig.model | optional .model at 205 | src/parser/theta-ast.ts:520 |
| ModelReferenceMatcher.resolve | matcher.resolve at 209 | src/parser/frontmatter-contract.ts:57 |
| WithField.value | modelField.value at 214 | src/parser/theta-ast.ts:470 |
| NodeBase.range (inherited by Expr) | modelField.value.range at 214 | src/parser/theta-ast.ts:19-21 |

Own-module member names touched: none. In particular there is no call to `collectSubagentFns`, `buildSubagentFnGraph`, `withinFn` or `checkSubagentFnStaticResolution`. Inputs are already collected by the callers. There are also zero imported extension declarations in this function's signature or body.

Source 192-205 (14 lines):
```ts
export function checkSubagentFnModelOverrides(
  fns: readonly FnDecl[],
  file: string,
  matcher: ModelReferenceMatcher,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const fn of fns) {
    const modelField = (fn.withClause ?? []).find((field) => field.key === "model");
    if (modelField === undefined) {
      continue;
    }
    // The override string as resolved by the parser (parse already flagged a
    // non-string model value); absent ⇒ nothing further to validate here.
    const reference = fn.sessionConfig?.model;
```
Source 209-216:
```ts
    if (matcher.resolve(reference) !== "resolved") {
      diagnostics.push({
        severity: "error",
        code: "theta/load/model-unresolved",
        file,
        range: modelField.value.range,
        message: `subagent fn 'with { model }' value '${reference}' resolves to no available model, or is ambiguous across providers`,
      });
```

Sibling pattern, per instance:
- `src/parser/frontmatter.ts:121-146`, `resolveModelReference`, already applies the same injected matcher to a model reference and emits `theta/load/model-unresolved`. At 132-139:
```ts
  const outcome = modelMatcher.resolve(modelRaw);
  if (outcome === "resolved") {
    return renderScalarValue(modelRaw);
  }
  diagnostics.push({
    severity: "error",
    code: "theta/load/model-unresolved",
    file,
```
- `src/parser/with-clause-static-checks.ts:43-65`, `checkClauseCwdType`, is another compose-pass check of a `with` field using AST/range/type inputs and returning diagnostics. Its header (line 1) explicitly says `Compose-pass with-clause cwd type checks and local/imported callee classification.` At 58-65:
```ts
  const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
  const out: Diagnostic[] = [];
  for (const field of clause.fields) {
    if (field.key !== "cwd") {
      // An unknown key already drew `theta/parse/with-clause-unknown-key` at
      // parse and un-registered the theta; it has no expected type here.
      continue;
    }
```
The parser layer's role is stated by `src/parser/theta-document.ts:3-14`: parser orchestration delegates structural/identifier/placement checks to siblings and aggregates their diagnostic sets. Thus being called during composition is not, by itself, a reason for a pure AST checker to live under extension.

Map-quoted importer count for `checkSubagentFnModelOverrides`: **2 src / 1 tests**. The production consumers are `import-static-checks.ts` and `production-composition.ts`; `tests/subagent-fn.test.ts` also calls it. These are module consumers, not parser affinity counts.

## Why this is a problem
This declaration's seven read-member affinities point to parser-owned AST and matching contracts, versus zero to its current module. The two cited sibling checks establish the existing home pattern: source-located, injected-input diagnostic checks reside in parser even when composition invokes them. Here extension contributes no composition behavior to the declaration. This finding does not challenge model matching or the diagnostic's current behavior; message rendering/posture is the separate PTQ-1555 topic.

## Suggested direction (non-binding, optional)
Unproven hypothesis; human ratification required. Seam A: `checkSubagentFnModelOverrides` -> `parser/subagent-fn-static-checks.ts` (hypothesis) - 29 mapped LOC, 1 exported symbol moved, external importers 2 src / 1 tests (map-quoted), cross-references back into the old host: 0. The filename is a home hypothesis, not a prescription to move the remaining graph/checker family.

## False-positive check
Affinity counts both ways: seven named parser contract members, zero current-module declarations; the table cites each read and its owner. Sibling-pattern check: frontmatter's model resolver and parser's compose-pass with-clause type checker are cited individually above. Host-role check: the source header calls the module compose-pass wiring, but this declaration neither collects functions nor composes collaborators; its complete input and output surface is shown. Reference check: `rg -n 'checkSubagentFnModelOverrides' src extensions tools tests --glob '*.ts'` found the declaration, the two production imports/calls, tests and comments; no extra dynamic dispatch mechanism was found, and importer counts are taken only from the supplied map. Barrel/facade check: this function is implemented here, not merely re-exported. Deadness check: production callers are live; this is not D2 dead code. History check: `git log -3 --oneline --follow -- src/extension/subagent-fn-static-checks.ts` includes `84f7de2f`, `71af3b5b`, `255a90dd`; no header rationale reserves this model check to a host-only surface. Exempt-band check: no breakdown claim is made. Duplicate check: PTQ-1555 covers message text and PTQ-1553 covers budget validation; neither is this declaration's placement claim.

## Triage
verdict: questionable — Accounting verified: the 29-LOC declaration reads seven distinct parser-contract members and no own-module declarations; both cited parser sibling checks and their excerpts reproduce. Size-scan confirms 220 LOC/exempt (placement still applies) and 2 src/1 tests importers; both production callers supply collected AST inputs. The stated reference search and history reproduce, this is an implementation rather than a facade, and PTQ-1553/1555 track different validation/message concerns. The target home is a design decision requiring a human ruling. (triage: claude-opus-5-5)
