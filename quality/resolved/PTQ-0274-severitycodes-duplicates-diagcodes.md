---
id: PTQ-0274
title: ctor-declaration-order.test.ts's severityCodes reimplements tests/helpers/e2e-s1.ts's diagCodes under a different name
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-declaration-order.test.ts:165-168
  - tests/helpers/e2e-s1.ts:90-93
sites: 2
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# ctor-declaration-order.test.ts's severityCodes reimplements tests/helpers/e2e-s1.ts's diagCodes under a different name

## Observation
tests/ctor-declaration-order.test.ts declares a module-scope function
`severityCodes(doc)` whose entire body is
`doc.diagnostics.map((d) => \`${d.severity} ${d.code}\`)`, called at four
sites (lines 751, 764, 1160, 1171) to compare a fixture's diagnostic list
against a fixed expected-code array. `tests/helpers/e2e-s1.ts` already exports
`diagCodes(doc)` with the identical one-line body and the identical
`(doc: ThetaDocument) => string[]` signature. The two functions are
functionally interchangeable; only the name and the doc-comment wording
differ. tests/ctor-declaration-order.test.ts imports nothing from
`tests/helpers/e2e-s1.ts`.

## Evidence
tests/ctor-declaration-order.test.ts:165-168:
```ts
/** `severity code` for every diagnostic the parse aggregated, in emission order. */
function severityCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

tests/helpers/e2e-s1.ts:90-93 — the canonical, already-exported equivalent:
```ts
/** Every diagnostic rendered `<severity> <code>`, in emission order. */
export function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

`severityCodes`'s four call sites, confirmed via `grep -n "severityCodes"
tests/ctor-declaration-order.test.ts`: line 166 (the definition), 751 and 764
(rows J/K, each asserting `severityCodes(doc)` against a one-code array), 1160
and 1171 (the bug-0121 R9/E1 cells, each asserting `severityCodes(parseOnly(...))`
against an empty array).

Exact search: `grep -rl -F '.map((d) => \`${d.severity} ${d.code}\`)' tests
--include="*.test.ts"` → 20 files carry this exact one-line expression,
including `tests/ctor-declaration-order.test.ts:167`. Narrowing to files that
declare a named function with this exact body (rather than an inline
assertion-site call), `grep -rn "function severityCodes" tests
--include="*.test.ts"` → exactly 2 files: `tests/ctor-declaration-order.test.ts:166`
(this review's file) and `tests/ctor-proto-named-field.test.ts:210` (bug
0080/0119's sibling witness file, outside this review's scope, cited here only
as corroborating evidence that the same-named duplicate recurs). Neither file
imports `diagCodes` from `tests/helpers/e2e-s1.ts`.

## Why this is a problem
`tests/helpers/e2e-s1.ts` already exports this exact one-line
`Diagnostic[]`-projection under the name `diagCodes`, and a prior confirmed
finding in this store (PTQ-0205, fixed) established that redeclaring it
locally — there, under the SAME name `diagCodes` — is a duplicate of the
canonical helper rather than a deliberate convention; that fix's own search was
name-based (`grep "function diagCodes"`), so a body-identical function
declared under a different name, as `severityCodes` is here, was outside its
reach and was never migrated. The doc comment above `severityCodes` describes
what the function does ("`severity code` for every diagnostic the parse
aggregated, in emission order") but states no reason the projection itself
must be redefined locally rather than imported.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already exports `diagCodes`, functionally identical
to this file's `severityCodes`, under the same module this file could import
alongside its other parse-harness needs.

## False-positive check
- Gate-pin check: tests/ctor-declaration-order.test.ts does not match
  `*gate*.test.ts` or the named kin; the cited function is a rendering
  projection, not a pinned-count or inventory assertion.
- Recording-double check: `severityCodes`/`diagCodes` both map an
  already-produced `doc.diagnostics` array; neither records a call or backs a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0080-keys-values-construction-order-not-declaration-order.md
  Status "fixed (0.70.0)". `npx vitest run tests/ctor-declaration-order.test.ts`
  → 27 passed (27) at HEAD, so this is not a documented correct-reason red, and
  no docs/bugs/ document gives a rationale for the local name or definition.
- coverage-matrix/bug-doc citation search: `grep -n "ctor-declaration-order"
  docs/reference/coverage-matrix.md` → 0 hits. Several other bug documents cite
  tests/ctor-declaration-order.test.ts by name at other line ranges (e.g. bug
  0119's `:679–718`, bug 0121's `:540–553`, bug 0136's `:451`) — none of those
  citations target lines 165-168, and this finding proposes no merge, rename,
  or deletion of any `it()`/`describe()` in the file, only that `severityCodes`
  could be replaced by the existing `diagCodes` import.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; `severityCodes` is exercised by four call sites in the
  file's own tests (751, 764, 1160, 1171).

## Triage
verdict: confirmed — severityCodes (ctor-declaration-order.test.ts:166-168) and diagCodes (e2e-s1.ts:91-93) reproduce byte-identical bodies/signatures, the file imports nothing from e2e-s1.ts, both grep counts reproduce exactly (20 files share the one-line expression; exactly 2 declare `function severityCodes`, neither importing diagCodes), `npx vitest run tests/ctor-declaration-order.test.ts` reproduces 27 passed (27), docs/bugs/0080 is fixed (0.70.0) with no rationale anywhere in docs/ for the local name, coverage-matrix.md has 0 hits and the cited bug-doc citations (0119:679-718, 0121:540-553, 0136:451) target other lines entirely, diagCodes was only added to e2e-s1.ts by PTQ-0205's fix (2026-09-11, a month after severityCodes existed since 2026-08-04) whose name-based search structurally could not reach this differently-named copy, and PTQ-0205 (fixed, verified diagCodes/diagLines now imported in its three cited files) never covered this file — genuine, non-duplicate D7 boilerplate duplication with no established-convention carve-out (only 2 files repo-wide share the name) (triage: claude-opus-5)
