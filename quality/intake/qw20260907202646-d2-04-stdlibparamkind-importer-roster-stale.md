---
id: pending
title: StdlibParamKind's doc names stdlib-array.ts and stdlib-object.ts as the modules that import it, but neither imports it — the only importer in the repository is src/parser/stdlib-arg-diagnostics.ts
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/stdlib-string.ts:47-58
  - src/runtime/stdlib-array.ts:29
  - src/runtime/stdlib-object.ts:53
  - src/parser/stdlib-arg-diagnostics.ts:38
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# StdlibParamKind's doc names stdlib-array.ts and stdlib-object.ts as the modules that import it, but neither imports it — the only importer in the repository is src/parser/stdlib-arg-diagnostics.ts

## Observation
`StdlibParamKind` is declared in `stdlib-string.ts` with a doc-comment stating
it is "Defined once here … and imported by `stdlib-array.ts` /
`stdlib-object.ts` rather than redeclared three times". Both named modules do
import from `./stdlib-string`, but their import lists name
`assertStdlibArgumentKinds` and `StdlibMemberSignature` only — neither names
`StdlibParamKind`. The single file in the repository that imports
`StdlibParamKind` is `src/parser/stdlib-arg-diagnostics.ts`, which the doc
does not mention.

## Evidence
The claim — src/runtime/stdlib-string.ts:47-58:
```ts
/**
 * Bug 0315 — the per-parameter type descriptor a stdlib member's positional
 * argument is checked against. `"element"` and `"array"` exist only for the
 * `array<T>` table (`stdlib-array.ts`) — `T`, the receiver's own element type,
 * and "any `array<U>`" (for `concat`) respectively; neither descriptor is
 * meaningful outside an array receiver, so `string`/`object` signatures never
 * spell them. Defined once here (the first stdlib module read alphabetically)
 * and imported by `stdlib-array.ts` / `stdlib-object.ts` rather than
 * redeclared three times, so the parser's type-check arm and the three
 * runtime-belt dispatchers all read ONE shape.
 */
export type StdlibParamKind = "string" | "integer" | "element" | "array";
```

First named module — src/runtime/stdlib-array.ts:29, its only import from
`./stdlib-string`:
```ts
import { assertStdlibArgumentKinds, type StdlibMemberSignature } from "./stdlib-string";
```

Second named module — src/runtime/stdlib-object.ts:53, its only import from
`./stdlib-string`:
```ts
import { assertStdlibArgumentKinds, type StdlibMemberSignature } from "./stdlib-string";
```

The actual importer, unmentioned by the doc —
src/parser/stdlib-arg-diagnostics.ts:38:
```ts
import type { StdlibMemberSignature, StdlibParamKind } from "../runtime/stdlib-string";
```
and its use at src/parser/stdlib-arg-diagnostics.ts:154:
```ts
    const descriptor = signature.params[i] as StdlibParamKind;
```

Full reference set. `grep -rn "\bStdlibParamKind\b" --include=*.ts src tests`
returns 4 hits: the declaration (stdlib-string.ts:58), its use in
`StdlibMemberSignature.params` (stdlib-string.ts:71), and the two
stdlib-arg-diagnostics.ts lines above. No hit in stdlib-array.ts or
stdlib-object.ts.

## Why this is a problem
Vestigial claim with a stated meaning that current code contradicts: the
doc-comment's justification for the declaration's placement and visibility is
an importer roster, and both entries on that roster are wrong while the one
real entry is absent. A reader tracing "who depends on this descriptor set,
and what breaks if I add a fifth member?" is pointed at two runtime modules
that never name it and away from the parser module that casts to it.

## Suggested direction (non-binding, optional)
The sentence's job is to justify single-sourcing the descriptor; restating it
against the dependency edges that exist today — the two runtime modules
consume the shape transitively through `StdlibMemberSignature`, the parser
module names the type directly — is the fix stage's call.

## False-positive check
- Identifier search: `grep -rn "\bStdlibParamKind\b" --include=*.ts src tests`
  → 4 hits, enumerated above; none in stdlib-array.ts or stdlib-object.ts.
- Import-line search: `grep -n "from \"./stdlib-string\"" src/runtime/stdlib-array.ts
  src/runtime/stdlib-object.ts` → one line each, both quoted verbatim above,
  neither naming the type.
- Transitive-use check: both modules DO use the descriptor strings indirectly —
  `ARRAY_MEMBER_SIGNATURES` (stdlib-array.ts:68) and
  `OBJECT_MEMBER_SIGNATURES` (stdlib-object.ts:119) are typed
  `ReadonlyMap<string, StdlibMemberSignature>`, whose `params` field carries
  `StdlibParamKind`. The claim under review is specifically the word
  "imported", and that edge does not exist.
- Dynamic / string-keyed access and re-exports: `grep -rn "export \*"
  --include=*.ts src extensions tools tests` → no hits anywhere, so no barrel
  re-exports the type into either module's scope; a type has no runtime
  representation, so no string-keyed access can reach it.
- Tests: `grep -rn "\bStdlibParamKind\b" --include=*.ts tests` → 0 hits, so no
  test import contradicts the count.
- Scope check: this is a claim-accuracy observation about an in-scope
  doc-comment, not a proposal to change the type's placement, visibility, or
  the checks that read it.

## Triage
