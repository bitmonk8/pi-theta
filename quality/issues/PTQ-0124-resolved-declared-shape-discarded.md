---
id: PTQ-0124
title: typed-query-validation's injected resolveShape dependency and resolveDeclaredSchema step feed lower(shape), whose argument no implementation reads
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/typed-query-validation.ts:128-131
  - src/runtime/typed-query-validation.ts:211-217
  - src/runtime/typed-query-validation.ts:170-179
  - src/runtime/query-tool-loop.ts:327-329
  - src/runtime/query-tool-loop.ts:576-581
  - tests/typed-query-schema-integration.test.ts:205-207
sites: 4
fix_scope: cross-module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# typed-query-validation's injected resolveShape dependency and resolveDeclaredSchema step feed lower(shape), whose argument no implementation reads

## Observation
`TypedQueryValidationInput` declares a `resolveShape: () => unknown`
dependency. `ProductionTypedQueryValidation.resolveDeclaredSchema()` invokes
it and returns the value; the sole call site hands that value to
`lower(shape)`. `ProductionTypedQueryValidation.lower()` declares no
parameter at all and returns `this.#input.lowered` — the pre-lowered schema
supplied at construction. The only other implementation of the interface
names the parameter `_shape` and does not read it either. The resolved shape
therefore reaches no reader on any code path.

## Evidence
src/runtime/typed-query-validation.ts:128-131 — the injected dependency:

```ts
  /** The lowered declared response schema (QRY-22 / SUBS-1). */
  readonly lowered: LoweredSchema;
  /** The declared schema's resolved shape, for the `resolveDeclaredSchema` step. */
  readonly resolveShape: () => unknown;
```

src/runtime/typed-query-validation.ts:211-217 — the production implementation:
`resolveDeclaredSchema` calls `resolveShape()`; `lower` takes no parameter and
returns the value captured at construction:

```ts
  resolveDeclaredSchema(): unknown {
    return this.#input.resolveShape();
  }

  lower(): LoweredSchema {
    return this.#input.lowered;
  }
```

src/runtime/query-tool-loop.ts:327-329 — the interface still declares the
parameter:

```ts
  resolveDeclaredSchema(): unknown;
  /** Lower a resolved declared shape to the validating JSON Schema (`SUBS-1`). */
  lower(shape: unknown): LoweredSchema;
```

src/runtime/query-tool-loop.ts:576-581 — the only call site in the repository;
`shape` is bound and immediately passed to `lower`, whose result comes from
elsewhere:

```ts
  let lowered: LoweredSchema | undefined;
  if (schemaValidation !== undefined) {
    const shape = schemaValidation.resolveDeclaredSchema();
    lowered = schemaValidation.lower(shape);
    schemaValidation.convey(lowered);
  }
```

tests/typed-query-schema-integration.test.ts:205-207 — the only other
implementation of `lower`, which also discards the argument:

```ts
  lower(_shape: unknown): LoweredSchema {
    this.lowerCalls += 1;
    return LOWERED;
  }
```

src/runtime/typed-query-validation.ts:170-179 — the constructor doc states
both halves of the mismatch in one sentence ("`resolveDeclaredSchema` resolves
the declared schema (a named decl via the injected `resolveShape`, previously
uncalled), `lower` returns the pre-lowered schema"):

```ts
/**
 * Build the production `TypedQuerySchemaValidation` (QRY-22). The four steps wrap
 * the real collaborators: `resolveDeclaredSchema` resolves the declared schema
 * (a named decl via the injected `resolveShape`, previously uncalled), `lower`
 * returns the pre-lowered schema, `convey` is a no-op (the lowered shape
 * reaches the model through per-driver channels — see `convey` below),
 * `validate` compiles + validates via the root's `SchemaValidator`, and
 * `runRespondRepair` drives the `V13d` respond-repair loop over real follow-up
 * turns.
 */
```

## Why this is a problem
Vestigial parameter, with every implementation cited: the `shape` argument of
`lower` is read by neither of the two implementations that exist (the
production class omits the parameter from its signature; the test class
prefixes it `_shape`). Because `lower` is the sole consumer of the value
`resolveDeclaredSchema` produces, the `resolveShape` dependency threaded
through `TypedQueryValidationInput` — and the `resolveDeclaredSchema` step that
calls it once per typed query — produce a value that reaches no reader. The
lowering the seam actually uses happens before construction: the caller passes
in `lowered` already lowered (`production-theta-producer.ts` `#buildTypedValidation`
takes `lowered: LoweredSchema` as a parameter and forwards it), so the
resolve-then-lower chain the interface models is not the chain the production
seam runs.

## Suggested direction (non-binding, optional)
One direction is to decide which of the two paths is authoritative — the
construction-time `lowered` or the per-query `resolveDeclaredSchema` → `lower`
chain — and let the surviving one be the only one the seam declares, so no
step computes a value the next step ignores.

## False-positive check
- `grep -rn "resolveShape\|resolveDeclaredSchema" --include=*.ts src extensions tools tests`
  — all `src/` hits are the declaration (typed-query-validation.ts:131), the
  implementation (:212), the interface (query-tool-loop.ts:327), the call site
  (query-tool-loop.ts:578) and the construction site
  (production-theta-producer.ts:3644). No dynamic/string-keyed access.
- `grep -rn "  lower(" --include=*.ts src tests` — exactly three hits: the
  interface declaration, `ProductionTypedQueryValidation.lower()` (no
  parameter), and the test class's `lower(_shape: unknown)`. No implementation
  reads the argument, so this is not a test-only-reader case.
- `grep -rn "TypedQuerySchemaValidation" --include=*.ts src extensions tools tests`
  — one production implementation (`ProductionTypedQueryValidation`), one test
  implementation; no re-exports and no other implementers.
- Checked the construction site (`src/extension/production-theta-producer.ts:3623-3652`):
  its own doc says "the caller lowers once and shares the result with the
  respond-tool registration and the QRY-15 template, avoiding a double
  lowering", confirming `input.lowered` is the live lowering.
- Not filed as deadness: `resolveDeclaredSchema` has a production caller. The
  claim is only that the value it returns is never read.

## Triage
verdict: confirmed — all six excerpts verbatim at the cited lines; `.lower(` has exactly one call site (query-tool-loop.ts:579) and no implementation reads the arg (candidate undercounted: tests/query-tool-loop-noncompliance.test.ts:168 is a third impl, also discarding, which reinforces the claim), tests assert only call counts and never `resolvedShape`, and `resolveSchema` (lexical-environment.ts:771) is a pure Map lookup so the discarded value carries no side effect (triage: claude-opus-5)
