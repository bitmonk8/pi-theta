# Bug 0004 — `invoke<array<T>>` return validation drops transitive `$defs` of named schemas

- **Status:** open
- **Kind:** defect — the boundary-annotation lowering violates the documented
  `$defs` assembly ("only transitively-reachable `$defs` are copied in" implies
  reachable ones **are** copied in), so a documented-legal annotation fails at
  run time with an AJV resolution error.
- **Affected:** `src/runtime/query-schema-lowering.ts` `lowerQueryResponseSchema`
  (the inline primitive / union / `array<T>` arm), consumed by
  `#validateInvokeReturn` in `src/extension/production-theta-producer.ts` (INV-6)
  and by the `subagent fn` return boundary.
- **Observed at:** `0.12.0`, host Pi `0.82.1`.

## Summary

A named schema that references another named schema (`Item` containing
`array<Loc>`) is documented to lower transparently: named references become
`$ref` against `$defs`, and the lowering pass assembles the reachable `$defs`
into the document. This works for a typed query (`@<Item>`) and for a bare named
invoke annotation (`invoke<Item>`). It **fails** when the named schema sits under
a generic wrapper in the annotation — `invoke<array<Item>>` — with:

```
Err(InvokeInfraError) — can't resolve reference #/$defs/Loc from id #
```

The produced document references `#/$defs/Loc` without embedding `Loc`.

## Reproduction (verified live)

`worker5.theta`:

```theta
---
mode: subagent
---
schema Loc { path: string, anchor: string }
schema Item { id: string, location: array<Loc> }
let out = [ Item { id: "I-1", location: [ Loc { path: "a.ts", anchor: "fn a" } ] } ]
out
```

Driver (same two `schema` decls in scope):

| Boundary annotation | Result |
|---|---|
| `@<Item>` typed query | **OK** |
| `invoke<Item>("./worker5b.theta")` (worker returns one `Item`) | **OK** |
| `invoke<array<Item>>("./worker5.theta")` | **`Err(invoke_infra, "can't resolve reference #/$defs/Loc from id #")`** |

The same failure shape was hit during the pi-config migration spikes with
`invoke<array<Finding>>` where `Finding` used named sub-schemas
(`location: array<Loc>`, `factors: Factors`), forcing the workaround of writing
boundary types with inline-anonymous nested objects
(`location: array<{ path: string, anchor: string }>`) and keeping a parallel
named-schema set for value construction — every boundary shape declared twice.

## Expected behaviour (what the spec says)

- `docs/reference/schema-subset.md` §"Reuse": "`$defs` + `$ref`, including
  recursive references. Generated automatically by the lowering pass; authors do
  not write `$defs`/`$ref`."
- `docs/reference/schema-subset.md` §"Lowering algorithm": step 1 "collects every
  named schema … into `$defs/<Name>`"; the assembly step keeps the root plus the
  transitively-reachable `$defs` (unused pruned) — reachable defs are present by
  construction.
- `docs/spec_topics/schemas.md`: "Any reference to a named schema lowers to
  `$ref` against the file's `$defs`. Self- and mutual recursion are supported
  transparently."

Nothing scopes this contract away from the invoke-return boundary; INV-6 says the
`invoke<Schema>` annotation is "lowered against the caller theta's `schema`
decls" and AJV-validated.

## Actual behaviour / root cause sketch

`lowerQueryResponseSchema` has three arms:

1. **Bare named reference** (`Item`): returns the body-type-map fragment directly
   — nested named references resolve against the already-built map, so the
   document is self-contained. Works.
2. **Inline object** (`{ … }`): lowered via `lowerInlineObject`. Works for the
   shapes exercised.
3. **Inline primitive / union / generic** (`array<Item>`): lowers via
   `lowerTypeSource(s, bodyTypeMap, defs)` and attaches the collected `defs` as
   `$defs`. The collection captures the **directly referenced** def (`Item`) but
   not the defs referenced **from inside `Item`'s body fragment** (`Loc`), so the
   emitted document carries `$ref: "#/$defs/Loc"` with no `Loc` entry. AJV
   compilation of the assembled document then fails at validation time, surfaced
   as `InvokeInfraError` (the raw AJV resolver message leaks as the error
   message; there is no `theta/…` diagnostic).

The typed-query path reaches arm 1 for `@<Item>` (and its `$defs` pruning walk in
`pruneDocumentDefs` is reachability-correct), which is why queries do not exhibit
the failure for this shape.

## Why it matters

- `array<T>` is the dominant boundary annotation for fan-out workers (a lens
  returning `array<Finding>`); named sub-schemas are the natural way to share
  those shapes through a `.thetalib`. The defect blocks exactly that composition
  and forces the declare-both-forms workaround (anonymous for boundaries, named
  for constructors).
- The failure is a runtime `Err` with an AJV-internal message, far from the
  declaration site; nothing at parse/load warns that the annotation will not
  validate.

## Options

1. **Fix the def collection in arm 3** (recommended): after `lowerTypeSource`,
   close the `defs` set over the `$ref`s occurring inside collected fragments
   (the reachability walk already exists — `collectDefRefs` /
   `prunePerQueryDefs`), so the emitted document embeds every transitively
   reachable def.
2. Inline nested named fragments in the body-type map (arm-1 style) for boundary
   lowering — avoids `$ref` at boundaries entirely; loses recursion support
   (recursive schemas need `$ref`), so weaker than option 1.

Either way, a regression fixture should pin `invoke<array<Named-with-nested-Named>>`
round-tripping, and the raw AJV resolver message should be replaced by a precise
error naming the annotation and the missing def if assembly can still fail.

## Non-goals

- Changing the boundary-validation contract (INV-6) or the schema subset itself.

## Provenance

- Spec measured against: `docs/reference/schema-subset.md` (§Reuse, §Lowering
  algorithm), `docs/spec_topics/schemas.md`, `docs/spec_topics/invocation.md`
  (INV-6).
- Implementation: `src/runtime/query-schema-lowering.ts`
  (`lowerQueryResponseSchema`, `buildBodyTypeMap`, `pruneDocumentDefs`),
  `src/extension/production-theta-producer.ts` `#validateInvokeReturn`.
- Found during the pi-config theta-migration spikes (0.7.1 round, workaround
  recorded; re-verified with the minimal matrix above on 0.12.0).
