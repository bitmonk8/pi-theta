---
id: pending
title: materializeSymbol resolves an imported specifier's declaration by source-order first match while recordImportedSpecifierFacts resolves it per kind with a fields-bearing-schema-wins precedence, so a legal dual-kind lib is admitted statically as one kind and materialised at runtime as another
lens: D1
status: intake
verdict: pending
locations:
  - src/extension/import-resolution-kit.ts:191-236
  - src/extension/import-specifier-facts.ts:357-376
  - src/extension/import-specifier-facts.ts:405-421
  - src/extension/import-specifier-facts.ts:470-479
  - src/runtime/lexical-environment.ts:484-492
  - src/runtime/value.ts:404-411
  - tests/b0448-imported-non-object-ctor.test.ts:132
  - tests/b0448-imported-non-object-ctor.test.ts:463-497
sites: 2
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# materializeSymbol resolves an imported specifier's declaration by source-order first match while recordImportedSpecifierFacts resolves it per kind with a fields-bearing-schema-wins precedence, so a legal dual-kind lib is admitted statically as one kind and materialised at runtime as another

## Observation

For one `import { X } from "./lib.thetalib"` specifier, the load pass answers the question "which top-level declaration of the resolved `.thetalib` does source name `X` denote?" in two places, with two different rules. `recordImportedSpecifierFacts` (import-specifier-facts.ts) runs three independent per-kind `.find()` lookups and applies an explicit precedence — a fields-bearing `schema X` outranks a same-name `enum`/`fn`/alias `schema` (`hasCtorSchema`), mirroring the same-file `checkObjectExpr` order — to populate the static-check tables (`importedSchemas`, `importedEnums`, `importedNonCtorNames`). Moments later in the same per-specifier iteration it calls `materializeChain`, whose direct arm `materializeSymbol` (import-resolution-kit.ts) walks `body.statements` once in SOURCE ORDER and returns the FIRST statement of any of the three kinds whose name matches — no kind precedence. A lib that legally declares both `schema X { a: string }` and `enum X { A }` (the shape bug 0448's review round F1 ruled legal and the K8 "dual-kind fence" cell pins) is therefore admitted by the static checks as a schema construction under either declaration order, but is materialised into the runtime environment as `schema X` when the schema is written first and as `enum X` when the enum is written first.

## Evidence

Way 1 — source-order first match across kinds. `src/extension/import-resolution-kit.ts:191-236` (excerpt, comments elided):

```ts
export function materializeSymbol(
  source: string,
  local: string,
  resolvedPath: string,
  body: ThetaBody,
  callingFrontmatter: ParsedFrontmatter | null,
): MaterializedImport | undefined {
  for (const stmt of body.statements) {
    if (stmt.kind === "fn" && stmt.name === source) {
      ...
      return { name: local, kind: "fn", fn };
    }
    if (stmt.kind === "schema" && stmt.name === source) {
      return { name: local, kind: "schema" };
    }
    if (stmt.kind === "enum" && stmt.name === source) {
      return {
        name: local,
        kind: "enum",
```

Way 2 — per-kind finds with a fields-bearing-schema-wins precedence. `src/extension/import-specifier-facts.ts:357-376`:

```ts
  const schemaDecl = parsed.document.body.statements.find(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema" && stmt.name === specifier.source,
  );
  // Bug 0448 — same-file constructor precedence: `checkObjectExpr` consults
  // the object-form schema set FIRST (`refs.schemas`), so a fields-bearing
  // `schema X { … }` is brace-constructible and WINS even when the same lib
  // also declares an `enum` / `fn` / alias-form `schema` named `X` — the
  // same-file `X { … }` parses clean, the field set owning it. Mirror that
  // precedence: ...
  const hasCtorSchema = schemaDecl !== undefined && schemaDecl.fields !== undefined;
  if (schemaDecl !== undefined && schemaDecl.fields !== undefined) {
    importedSchemas.set(specifier.local, schemaDecl.fields);
  }
  if (schemaDecl !== undefined && !hasCtorSchema) {
    importedNonCtorNames.add(specifier.local);
  }
```

`src/extension/import-specifier-facts.ts:405-421` (the enum find in the same iteration — both kinds are recorded independently, so the dual-kind lib enters BOTH `importedSchemas` and `importedEnums`):

```ts
  const enumDecl = parsed.document.body.statements.find(
    (stmt): stmt is EnumDecl => stmt.kind === "enum" && stmt.name === specifier.source,
  );
  if (enumDecl !== undefined && enumDecl.variants !== undefined) {
    importedEnums.set(specifier.local, enumDecl.variants);
  }
  if (enumDecl !== undefined && !hasCtorSchema) {
    ...
    importedNonCtorNames.add(specifier.local);
  }
```

The two ways are joined in the same iteration — `src/extension/import-specifier-facts.ts:470-479`, the call that reaches Way 1 for the same `specifier.source` over the same `parsed.document.body`:

```ts
  const materialized = await materializeChain(
    specifier.source,
    specifier.local,
    resolvedPath,
    parsed.document.body,
    frontmatter,
    new Set<string>(),
  );
  if (materialized !== undefined) {
    imports.push(materialized);
  }
```

The dual-kind shape is a repository-ruled legal input. `tests/b0448-imported-non-object-ctor.test.ts:132`:

```ts
const DUALKIND_DECL = "schema X { a: string }\nenum X { A }";
```

`tests/b0448-imported-non-object-ctor.test.ts:463-475, 491-496` (excerpt):

```ts
// K8 — dual-kind over-refusal guard. GREEN after the F1 remedy. A lib legally
// declaring BOTH a fields-bearing `schema X { a: string }` AND a same-name
// `enum X { A }` must NOT over-refuse the imported `X { a: "x" }` construction:
...
  it("K8-dualkind-valid: `X { a: \"x\" }` against a dual-kind lib draws nothing and materialises `schema X`", async () => {
    ...
    const result = await compose(doc, { [LIB_PATH]: DUALKIND_DECL });
    expectMaterialised(result, "schema X", "K8");
```

`docs/bugs/0448-imported-non-object-ctor-mints-silently.md:264-266`: "Round 1 (bug-fix-reviewer, deep): F1 (correctness) — a lib legally declaring both a fields-bearing `schema X` and a same-name `enum X`/`fn X` was over-refused (same-file spelling parses clean)". The K8 cell fixes the declaration order schema-first, so it cannot observe Way 1's order dependence.

The runtime consumer that gives the divergence its cost — `src/runtime/lexical-environment.ts:484-492` registers ONE kind per materialised import:

```ts
      if (imp.kind === "schema") {
        this.schemas.set(imp.name, { kind: "schema", name: imp.name, range: syntheticRange() });
      } else if (imp.kind === "enum") {
        ...
        this.enums.set(imp.name, {
```

and `src/runtime/value.ts:404-411` — a constructor whose head is not a registered schema passes through unbranded:

```ts
  const decl = resolveSchema(typeName);
  if (decl === undefined) {
    return constructedFields;
  }
```

Demonstration run (scratch test under `$TEMP`, driving the shipped `checkThetaImports` exactly as the K8 cell does, over the importing body `import { X } from "./lib.thetalib"` / `let x = X { a: "x" }` / `x`). Command: `npx vitest run --config <tmp>/vitest.config.mts` (config: `{ test: { root: "C:/UnitySrc/pi-theta", include: ["<tmp>/**/*.test.ts"] } }`). Raw output lines (3 tests, 3 passed; the two lines of interest):

```
SCHEMA-FIRST {"diags":[],"materialised":["schema X"]}
ENUM-FIRST {"diags":[],"materialised":["enum X"]}
```

`SCHEMA-FIRST` used the lib body `schema X { a: string }\nenum X { A }`; `ENUM-FIRST` used `enum X { A }\nschema X { a: string }`. Both orders produce zero load diagnostics (Way 2 admits `X { a: "x" }` as a schema construction in both — `hasCtorSchema` is order-independent), but Way 1 materialises `enum X` for the second order, so at runtime `X` is registered as an enum only (lexical-environment.ts:486-490) and `X { a: "x" }` is the unbranded passthrough at value.ts:409-411.

Counts both ways. Producers/callers of Way 1: `grep -rn "materializeSymbol(" src/ --include=*.ts` → 2 hits:

```
src/extension/import-resolution-kit.ts:191:export function materializeSymbol(
src/extension/import-resolution-kit.ts:329:    const direct = materializeSymbol(source, local, resolvedPath, body, callingFrontmatter);
```

Callers of Way 2: `grep -rn "recordImportedSpecifierFacts(" src/ --include=*.ts` → 2 hits:

```
src/extension/import-specifier-facts.ts:322:async function recordImportedSpecifierFacts(
src/extension/import-specifier-facts.ts:767:      await recordImportedSpecifierFacts(specifier, parsed, resolvedPath, facts, specifierDeps);
```

The precedence rule exists only in Way 2: `grep -rn "hasCtorSchema" src/ --include=*.ts` → 7 hits, all in `src/extension/import-specifier-facts.ts` (lines 368, 370, 374, 392, 395, 411, 419); none in import-resolution-kit.ts.

No parser refusal makes the dual-kind lib unreachable: `grep -o "theta/parse/[a-z-]*duplicate[a-z-]*\|theta/parse/[a-z-]*redeclar[a-z-]*" docs/reference/diagnostics.md | sort -u` → 4 hits, none a top-level declaration-name refusal:

```
theta/parse/duplicate-discriminator-value
theta/parse/duplicate-enum-value
theta/parse/duplicate-enum-variant-name
theta/parse/duplicate-inline-field-name
```

Self-inconsistency statement: no written rule exists for which declaration an imported source name denotes when a `.thetalib` declares it under two kinds; the anchor is self-inconsistency between the two resolution rules the same per-specifier iteration applies to the same input, plus the demonstrated cost above (static admission under one kind, runtime binding under the other, decided by declaration order in the lib).

## Why this is a problem

Design consistency / boundaries. The static-check tables and the materialised runtime binding are two halves of one contract — the tables are what admits a use of `X`, the binding is what that use executes against — so the two sites owe each other one resolution rule. Today Way 2's rule is documented, order-independent and deliberately mirrors the same-file model (per-kind registries, schema-first for constructors), while Way 1's rule is undocumented, order-dependent, and collapses the imported name to a single kind chosen by textual position. The drift is not hypothetical: bug 0448's F1 round added the precedence to Way 2 only ("`hasCtorSchema` gate on all three arms + K8 dual-kind fence cell"), leaving Way 1 on its original first-match walk, and the K8 witness fixes the order the two rules happen to agree on. A maintainer reading `recordImportedSpecifierFacts`'s "Mirror that precedence" comment is led to believe the imported binding follows the same-file precedence; it does not for the reverse order, as the run above shows. Both sites are live and both carry a `satisfies Record<ThetaLibDeclarationStmt["kind"], true>` completeness ledger (import-resolution-kit.ts:172, import-specifier-facts.ts:283) declaring that they each hand-roll the same three-kind resolution.

## Suggested direction (non-binding, optional)

Unproven hypothesis: one shared "source name → declaration" resolution over a lib body with a single stated precedence (or a single stated refusal of dual-kind same-name declarations), consumed by both the fact collector and `materializeSymbol`, so the admitted kind and the materialised kind cannot disagree. The fix stage owns the design; PTQ-0365's ratified ruling kept the two sites' control flow for the kind-enumeration question, which is distinct from the precedence question filed here.

## False-positive check

- Injected clone map: no group covers import-resolution-kit.ts or import-specifier-facts.ts ("(no clone groups)" for both). The two ways are not token copies: a single OR-less if-chain with early returns over one loop versus three independent `.find()` calls plus a boolean gate.
- D9-affinity check: not a wrong-home claim — both sites are in the import subsystem where they belong; the filing is about two rules for one question, not about which file should host either.
- D2-deadness check: both sides live — `materializeSymbol` is called from `materializeChain` (import-resolution-kit.ts:329), which `recordImportedSpecifierFacts` calls at import-specifier-facts.ts:470 on every resolved specifier; `recordImportedSpecifierFacts` is called from the per-decl loop at :767. Tests reach both (the K8 cell asserts on `result.imports`, i.e. Way 1's output, and on `result.rendered`, Way 2's).
- Export-style exemption: not a wide-surface filing; not applicable.
- Prior-filing check: PTQ-0365 (resolved) covered the four-site re-enumeration of the declarable-kind set {schema, fn, enum}; its ratified fix prescribed a type-level ledger and explicitly stated "Identical behaviour"; it did not touch the same-name precedence that differs between the two sites, so its fix did not cover this. PTQ-0081 (resolved) removed a redundant duplicate `.find` of `schemaDecl` inside the fact loop; unrelated to `materializeSymbol`. PTQ-1159 (D9, Seam B split of the fact loop) moved code verbatim. Grep of quality/ for `hasCtorSchema`/`dual-kind` reaches only PTQ-1159 and review/notes logs; no filing addresses the precedence divergence. The bench-only candidates naming `materializeSymbol` (quality/bench/**) concern the enum-registration projection shape, not name precedence, and were never filed.
- Not a D4 parallel-pair claim: the two sites diverge in mechanism and outcome, demonstrated by the run above, rather than being load-bearing mirrors.
- Not a bug filing: no behaviour change is proposed; the finding is the presence of two resolution rules where one contract exists, with the divergence cited as the cost.
- Git history intent: `hasCtorSchema` entered with the bug-0448 fix (docs/bugs/0448:264-270, review F1) on the fact-loop side only; `materializeSymbol`'s first-match walk predates it and was not revisited.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both ways are at their cited lines: materializeSymbol (import-resolution-kit.ts:191-236) returns on the first source-order match, while recordImportedSpecifierFacts (import-specifier-facts.ts:357-421) runs per-kind finds under the hasCtorSchema precedence and calls materializeChain at :470. All four stated searches reproduce verbatim (2/2/7/4 hits). clone-scan shows no groups for either file. My own scratch run of checkThetaImports reproduces the cost: schema-first gives diags [] and materialises "schema X", enum-first gives diags [] and materialises "enum X". K8 (tests/b0448:132, :491-496) and the 0448 F1 round (bug doc :264-266) exist. No duplicate among the intake files, open PTQs or resolved PTQs: PTQ-0365 kept both control flows under "Identical behaviour" and does not cover precedence (triage: claude-opus-5-5)
