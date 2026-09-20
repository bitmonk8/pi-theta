---
id: pending
title: binding and return diagnostic blocks cloned across parser checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/bindings.ts:42-73
  - src/parser/bindings.ts:74-103
  - src/parser/bindings.ts:103-129
  - src/parser/bindings.ts:139-164
  - src/parser/bindings.ts:43-63
  - src/parser/bindings.ts:75-97
  - src/parser/functions.ts:346-368
sites: 7
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# binding and return diagnostic blocks cloned across parser checks

## Observation
`src/parser/bindings.ts` and `src/parser/functions.ts` each contain seam functions that check a single parse-time rule and return either `undefined` (when the rule is satisfied) or an error `Diagnostic`. The clone scan flags three renamed-only groups that cover the same guard-then-diagnostic shape repeated in `checkLetBinding`, `checkReassignment`, `checkAssignmentTarget`, `checkMutModifier`, and `checkBareReturn`. No helper is shared; each function inlines the `if (guard) return undefined; return { severity: "error", code: ..., file: site.file, range: site.range, message: ..., hint? }` pattern.

## Evidence
**G040** — `src/parser/bindings.ts:42-73` and `src/parser/bindings.ts:74-103` — renamed-only.

`src/parser/bindings.ts:42-73` (excerpt `52-66`):
```ts
  decl: LetBindingDecl,
  site: BindingSite,
): Diagnostic | undefined {
  if (decl.hasInitialiser) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/let-without-initialiser",
    file: site.file,
    range: site.range,
    message: `let binding '${decl.name}' has no initialiser`,
    hint:
      "Initialise the binding at declaration, or restructure to bind once at the point a value is available.",
  };
```

`src/parser/bindings.ts:74-103` (excerpt `85-99`):
```ts
export function checkReassignment(
  reassign: BindingReassignment,
  site: BindingSite,
): Diagnostic | undefined {
  if (reassign.mutable) {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/immutable-rebinding",
    file: site.file,
    range: site.range,
    message: `cannot reassign immutable binding '${reassign.name}'`,
    hint: "Use `let mut` if mutation is intentional.",
  };
```

**G042** — `src/parser/bindings.ts:103-129` and `src/parser/bindings.ts:139-164` — renamed-only.

`src/parser/bindings.ts:103-129` (excerpt `117-131`):
```ts
  target: AssignmentTarget,
  site: BindingSite,
): Diagnostic | undefined {
  if (target.kind === "identifier") {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/assignment-to-member-or-index",
    file: site.file,
    range: site.range,
    message:
      "cannot assign to member or index; mutability is binding-level only",
    hint: "Rebind the whole value with `let mut`.",
  };
```

`src/parser/bindings.ts:139-164` (excerpt `152-166`):
```ts
export function checkMutModifier(
  mod: MutModifier,
  site: BindingSite,
): Diagnostic | undefined {
  if (mod.position === "let") {
    return undefined;
  }
  return {
    severity: "error",
    code: "theta/parse/mut-on-immutable-context",
    file: site.file,
    range: site.range,
    message: "'mut' is not permitted in this binding position",
  };
}
```

**G084** — `src/parser/bindings.ts:43-63`, `src/parser/bindings.ts:75-97`, and `src/parser/functions.ts:346-368` — renamed-only.

`src/parser/bindings.ts:43-63` (excerpt `58-66`):
```ts
  return {
    severity: "error",
    code: "theta/parse/let-without-initialiser",
    file: site.file,
    range: site.range,
    message: `let binding '${decl.name}' has no initialiser`,
    hint:
      "Initialise the binding at declaration, or restructure to bind once at the point a value is available.",
  };
```

`src/parser/bindings.ts:75-97` (excerpt `92-99`):
```ts
  return {
    severity: "error",
    code: "theta/parse/immutable-rebinding",
    file: site.file,
    range: site.range,
    message: `cannot reassign immutable binding '${reassign.name}'`,
    hint: "Use `let mut` if mutation is intentional.",
  };
```

`src/parser/functions.ts:346-368` (excerpt `363-369`):
```ts
  return {
    severity: "error",
    code: "theta/parse/bare-return-in-non-void",
    file: site.file,
    range: site.range,
    message: "missing return value",
  };
```

All three groups are renamed-only: the guard predicate, the `undefined` arm, the `Diagnostic` field order, and the use of `site.file`/`site.range` are identical; only the rule-specific names, codes, messages, and optional `hint` change.

## Why this is a problem
The duplicated block is the conditional diagnostic constructor harness, not just incidental similarity. Each copy must keep the same `Diagnostic` shape and the same `guard ? undefined : error` semantics. A cross-cutting change to error construction — for example adding a required field to `Diagnostic`, changing the severity default, or changing how the source location is recorded — would have to be applied to every copy. Missing one copy would change the emitted diagnostic for one parse rule while leaving the others unchanged, producing inconsistent diagnostics for the same document. The clones are not spec-anchored enumeration vectors; bindings.md and return.md state the rules but do not repeat this code shape.

## Suggested direction (non-binding, optional)
Introduce a small parser-seam helper that accepts the guard, site, code, message, and optional hint and returns `Diagnostic | undefined`. The natural shared home is a parser-wide diagnostic utility or `src/parser/bindings.ts`, because every cited site is a parser check seam.

## False-positive check
- Re-verified all cited spans in the current working tree; all copies are live code.
- Confirmed every cited function is called from `src/parser/theta-document.ts` (binding checks and `checkBareReturn`), so none are dead.
- The similarity is not a normative spec vector; the spec clauses describe the rules, not the diagnostic constructor.
- No generated or test-only code is involved.

## Triage
