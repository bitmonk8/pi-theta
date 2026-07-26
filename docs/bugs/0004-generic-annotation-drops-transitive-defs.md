# Bug 0004 — `invoke<array<T>>` return validation drops transitive `$defs` of named schemas

- **Status:** open
- **Kind:** defect — the boundary-annotation lowering violates the documented
  `$defs` assembly ("only transitively-reachable `$defs` are copied in" implies
  reachable ones **are** copied in), so a documented-legal annotation fails at
  run time with an AJV resolution error.
- **Affected:** `src/runtime/query-schema-lowering.ts` `lowerQueryResponseSchema`
  (the inline primitive / union / `array<T>` arm; the inline-object arm assembles
  the same broken document when it references a named schema — see root cause),
  consumed by `#validateInvokeReturn` in
  `src/extension/production-theta-producer.ts` (the implementation's INV-6 tag
  for invocation.md §Typed return), by the `subagent fn` return boundary (FN-6
  reuses the invoke machinery), and by the typed-query validation builder
  (`#buildTypedValidation`, QRY-22) — an `@<array<Item>>` query annotation
  lowers the same unresolvable document (verified at the lowering level; not
  exercised live).
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

The produced document's `$ref: "#/$defs/Loc"` is root-absolute but the
document carries no top-level `$defs.Loc` — `Loc`'s fragment rides along only
at the unreachable nested position `$defs.Item.$defs.Loc`.

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

Nothing scopes this contract away from the invoke-return boundary;
`docs/spec_topics/invocation.md` §"Typed return" says "the runtime
AJV-validates the child's return value against the schema", and the
implementation's INV-6 tag (`#validateInvokeReturn` doc comment) states the
annotation is "lowered against the caller theta's `schema` decls".

## Actual behaviour / root cause sketch

`lowerQueryResponseSchema` has three arms:

1. **Bare named reference** (`Item`): returns the body-type-map fragment directly
   — nested named references resolve against the already-built map, so the
   document is self-contained. Works.
2. **Inline object** (`{ … }`): lowered via `lowerInlineObject`. Fails the same
   way when a field references a named schema whose fragment carries nested
   named refs (`{ items: array<Item> }` reproduces the identical
   `MissingRefError`); an inline object referencing no such schema works.
3. **Inline primitive / union / generic** (`array<Item>`): lowers via
   `lowerTypeSource(s, bodyTypeMap, defs)` and attaches the collected `defs` as
   `$defs`. `Item`'s body-type-map fragment (built by `lowerObjectFields`)
   carries a **fragment-local** `$defs: { Loc: … }`; copying the fragment under
   the document's `$defs.Item` nests `Loc` at `#/$defs/Item/$defs/Loc`, where
   the fragment's root-absolute `$ref: "#/$defs/Loc"` cannot reach it, and no
   top-level `Loc` entry is emitted. `pruneDocumentDefs` computes `Loc` as
   reachable but silently skips it (`defsMap["Loc"]` is absent — the walk only
   filters, never hoists). AJV `compile` then throws `MissingRefError` at
   validation time; the throw unwinds out of `#validateInvokeReturn` and the
   invoke-boundary catch in `src/runtime/invoke-cancellation.ts` wraps it as
   `InvokeInfraError { cause: "internal_error" }` with the raw AJV resolver
   message as the error message; there is no `theta/…` diagnostic.

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

1. **Fix the `$defs` assembly** (recommended): close the document's top-level
   `$defs` over the `$ref`s occurring inside collected fragments (the
   reachability walk already exists — `collectDefRefs` / `prunePerQueryDefs`),
   resolving each missing name from the body-type map, so the emitted document
   embeds every transitively reachable def at the top level. The fix must sit
   where arms 2 and 3 share it (e.g. `pruneDocumentDefs` grown into a
   hoist-and-close step) — arm 2 assembles the same broken document — and
   should strip or hoist the fragment-local nested `$defs` residue.
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
  (§Typed return — tagged INV-6 in implementation comments; the spec's own
  anchors stop at INV-5), `docs/spec_topics/functions.md` (FN-6).
- Implementation: `src/runtime/query-schema-lowering.ts`
  (`lowerQueryResponseSchema`, `buildBodyTypeMap`, `pruneDocumentDefs`),
  `src/parser/body-type-lowering.ts` (`lowerObjectFields` / `lowerTypeSource` —
  origin of the fragment-local `$defs`),
  `src/extension/production-theta-producer.ts` (`#validateInvokeReturn`,
  `#buildTypedValidation`), `src/runtime/invoke-cancellation.ts` (the
  invoke-boundary wrap that surfaces the raw AJV message).
- Found during the pi-config theta-migration spikes (0.7.1 round, workaround
  recorded; re-verified with the minimal matrix above on 0.12.0).
