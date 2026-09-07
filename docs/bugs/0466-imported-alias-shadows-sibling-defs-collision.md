# Bug 0466 — Aliasing a `.thetalib` import to the source name of its own same-lib transitive dependency silently drops the sibling decl from the lowering closure — the collided `$defs` name binds the aliased entry's shape, and a payload conforming to the declared shapes is refused by AJV

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2: loud-wrong. In the witnessed shape the
  collided `$defs` entry becomes self-recursive with required fields, so AJV
  refuses EVERY reply (including ones conforming to the declared shapes) and
  the typed query terminal-fails deterministically after repair exhausts; a
  silent-accept variant is constructible when the collided reference is
  nullable/optional (§Why it matters), but the witnessed face is refusal, not
  a silently bound wrong value. D2: the fix needs a namespacing decision for
  the flat `$defs` name space (qualified keys vs refusal diagnostic vs
  reference rewriting), constrained by 0028's seam-totality rule and 0465's
  closure fences.
- **Kind:** defect — `docs/spec_topics/schema-subset.md:72` (Lowering
  Algorithm step 1): the lowering "**Collects every named schema** declared at
  the top level of the file (and transitively imported from `.thetalib` files
  used by the file). Each becomes one `$defs/<Name>` entry." The sibling
  schema IS transitively imported (the entry's own field references it), yet
  it gets no `$defs` entry at all: first-wins hands its name to the aliased
  entry and drops the sibling from the closure. No sentence licenses the
  drop: `docs/spec_topics/imports.md:130-139` (§Name collisions) covers two
  import specifiers contending for one local binding and an import colliding
  with a same-file top-level declaration — both refuse loudly
  (`theta/parse/import-name-collision`, "no implicit shadowing",
  imports.md:137) — but is silent on an alias colliding with a lib-internal
  sibling that is never bound into the importing file's namespace. The parse
  layer correctly admits the authoring; the collection layer silently
  violates step 1.
- **Related:**
  - [0465](./0465-imported-annotation-vacuous-typed-query-validation.md)
    (fixed 0.462.0) — the parent. Its fix introduced the collection this
    report is about (`collectImportedTypeDecls`); its §Fix (0.462.0) record
    names this exact collision as residual 1, designated for parent filing.
    Cell `F1-a` of its witness suite pins the current first-wins behaviour as
    a documented residual, not as correct-per-spec.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
    (fixed 0.38.0) — its §Fix pins `lowerQueryResponseSchema` as a TOTAL
    function returning `{}` for genuinely unresolvable names. Any fix here
    must keep resolution BEFORE that seam (as 0465's did) rather than
    special-casing the seam.
- **Affected** (verified at d03f7398, v0.462.0):
  - `src/extension/import-static-checks.ts:265-354` —
    `collectImportedTypeDecls`: flat per-kind name maps feeding the `$defs`
    closure. `:305-310` — `visitSchema`'s dual source-name+alias storage,
    first-wins on each name: the aliased ENTRY is stored under `outputName`
    (`:308-309`) before the field-walk (`:321-324`) reaches the sibling, so
    the sibling's `schemas.set(sourceName, …)` guard (`:305`) finds the name
    taken and the sibling is dropped. `:334-339` — `visitEnum` carries the
    identical dual first-wins storage for the enum map.
  - `src/extension/import-static-checks.ts:256-263` — the doc-comment pinning
    the collision as "KNOWN RESIDUAL (rare pathological authoring) …
    First-wins decides it deterministically … No diagnostic is minted for the
    collision; the parent report files residuals."
  - `src/extension/import-static-checks.ts:1459-1470` — the per-specifier
    aggregation applies the same first-wins across specifiers/libs
    (comment `:1258-1259`): a later import's transitive closure reaching a
    name an earlier import already claimed is dropped the same way — the same
    flat-namespace mechanism, one aggregation level up.
  - `tests/b0465-imported-annotation-vacuous-validation.test.ts:812-835` —
    cell `F1-a` pins the current behaviour: root `properties` carries `shard`
    (the aliased entry's field), not `count` (the dropped sibling's field).
  - Spec: `docs/spec_topics/schema-subset.md:72`;
    `docs/spec_topics/imports.md:130-139`.
- **Observed at:** v0.462.0 (d03f7398). Offline, deterministic: cell `F1-a`
  of the shipped 0465 witness suite, plus a scratch probe (deleted) driving
  the real `checkThetaImports` `importedTypeDecls` channel and the producer's
  merge through `lowerQueryResponseSchema` and `AjvSchemaValidator` — outputs
  quoted verbatim in §Reproduction.

## Summary

`collectImportedTypeDecls` (the 0465 fix's transitive same-lib closure)
stores every reached decl in one flat per-kind name map: each entry under its
lib-local source name, plus — for the directly-imported entry — a copy under
its local `as` alias. Storage is first-wins per name. When the alias equals
the source name of a sibling decl the entry itself transitively references
(`import { ReviewSummary as Detail }` where `ReviewSummary` declares
`detail: Detail` against a same-lib `schema Detail`), the aliased entry
claims the name before the field-walk reaches the sibling, and the sibling is
dropped from the closure with no diagnostic. The lowered schema's
`$defs/<Name>` then binds the WRONG decl: every intra-lib reference that
spells the sibling's name — including the entry's own field — resolves to the
entry's shape. In the witnessed shape this makes the collided `$defs` entry
self-recursive with required fields, so no finite JSON value satisfies it and
AJV refuses every payload, including one conforming exactly to the declared
shapes. The typed query can never bind; QRY-22 exhausts repair and
terminal-fails. Renaming the alias by one character (the control) restores
correct validation in both directions.

## Reproduction

Offline, deterministic. The pinned witness is cell `F1-a`
(`tests/b0465-imported-annotation-vacuous-validation.test.ts:812-835`):

```
npx vitest run tests/b0465-imported-annotation-vacuous-validation.test.ts -t "F1-a"
```

Shared fixture — lib `/proj/quality.thetalib`:

```
schema Detail { count: integer }
schema ReviewSummary { shard: string, detail: Detail }
```

Collision case — importing theta body (frontmatter `model: "sonnet"`,
`mode: prompt`):

```
import { ReviewSummary as Detail } from "./quality.thetalib"
let d: Detail = @`x`?
d
```

Control case — identical except the alias does not equal the sibling name:

```
import { ReviewSummary as Summary } from "./quality.thetalib"
let d: Summary = @`x`?
d
```

Both routed through the production data-flow (real `checkThetaImports` over
an in-memory `.thetalib` FS, its `importedTypeDecls` channel merged
same-file-wins, lowered by `lowerQueryResponseSchema`, compiled by the real
`AjvSchemaValidator` — the `producerLowerImported` shape the 0465 suite
defines at `:218`). The conforming payload for both directions is
`{"shard":"s","detail":{"count":1}}` — exactly the declared shapes.

- **Collision, lowered** (annotation `Detail`):
  `{"type":"object","properties":{"shard":{"type":"string"},"detail":{"$ref":"#/$defs/Detail"}},"required":["shard","detail"],"additionalProperties":false,"$defs":{"Detail":{"type":"object","properties":{"shard":{"type":"string"},"detail":{"$ref":"#/$defs/Detail"}},"required":["shard","detail"],"additionalProperties":false}}}`
  — `$defs/Detail` is ReviewSummary's own shape (self-recursive `$ref`), not
  the sibling's `{count}`. This is the byte face of the drop; cell `F1-a`
  pins it as root `properties` carrying `shard` and not `count`.
- **Collision, validated:** AJV refuses the conforming payload — verdict
  `ok: false` with three issues at `/detail`:
  `must have required property 'shard'`,
  `must have required property 'detail'`, and
  `must NOT have additional properties` (`additionalProperty: "count"`).
  Because `$defs/Detail` requires `detail` recursively, NO finite payload
  validates: the typed query cannot bind under any reply.
- **Control, lowered** (annotation `Summary`): same root, but
  `$defs/Detail` is the sibling's
  `{"type":"object","properties":{"count":{"type":"integer"}},"required":["count"],"additionalProperties":false}`.
- **Control, validated:** the conforming payload is accepted (`ok: true`);
  the garbage payload `{"shard":"s","detail":{"count":"junk"}}` is refused
  (`ok: false`) — both directions of the gate work when no collision exists.

## Expected behaviour

schema-subset.md:72: every named schema in the closure — top-level and
transitively imported — becomes one `$defs/<Name>` entry. The sibling
`Detail` is in the closure (the entry's own field references it) and must be
collected; the entry's field reference must resolve to the sibling's shape;
the conforming payload must validate `ok`. If the flat `$defs` namespace
cannot represent both decls under the spelled names, the collision must
surface as a diagnostic (imports.md:137's no-implicit-shadowing posture:
two sources never silently bind one name) — not as a silent drop that
rebinds an intra-lib reference to a different schema.

## Actual behaviour / root cause

`collectImportedTypeDecls` visits the entry first: `visitSchema(entry.name,
outputName)` stores the entry under its source name (`:305-306`) and — the
rename copy — under the alias (`:308-309`, `{ ...decl, name: asName }`).
Only then does the field-walk (`:321-324`) recurse into referenced names with
`visitSchema(ref, ref)`. When `outputName` equals a referenced sibling's
source name, the sibling's own store at `:305` is guarded by
`!schemas.has(sourceName)` — already taken by the alias copy — so the sibling
decl is never stored anywhere. Downstream the merge and
`lowerQueryResponseSchema` are faithful to their inputs: the name resolves,
so no unresolved-name `{}` arm fires and no diagnostic exists at any layer —
parse admits the alias (the lib sibling is not bound into the theta's
namespace, so `theta/parse/import-name-collision` correctly does not fire),
load emits nothing (the behaviour is documented in the collector's
doc-comment `:256-263` as a known residual, explicitly deferring to this
filing), and runtime AJV enforces the wrong shape loudly. The same first-wins
mechanism operates across specifiers at the aggregation level
(`:1465-1470`): an earlier import's claim on a name silently drops a later
import's transitive decl of the same name. The enum map (`:334-339`) carries
the identical dual-storage pattern.

## Why it matters

- A payload conforming exactly to the declared shapes is refused: in the
  witnessed shape the collided entry is self-recursive with required fields,
  so the QRY-22 gate refuses EVERY reply, repair cannot converge (the
  declared shape the model is told to produce can never validate), and the
  drive terminal-fails after the turn budget is spent — loud, deterministic,
  and unexplainable to the author, whose theta names only legal constructs.
- A silent-accept variant is constructible: if the entry's reference to the
  sibling is nullable or optional (`detail: Detail | null`), a payload shaped
  like the ENTRY where the sibling was declared (`{"shard":…,"detail":
  {"shard":…,"detail":null}}`) validates `ok` against the collided schema and
  binds as a typed value violating the declared shapes — the 0465-class
  silent wrong value, reintroduced through the alias.
- The trigger is one rename away from recommended practice: imports.md:137
  itself recommends `as`-aliasing for self-clarity, and the author cannot see
  the lib's internal reference graph from the import site. Nothing warns at
  parse or load; the failure surfaces only at runtime, arbitrarily far from
  the import statement.

## Non-goals

- The cross-lib nested closure (a schema referenced across a lib's OWN
  import, beyond the directly-resolved lib's top-level decls) and
  re-export-chain-only imported bindings: separately fenced deferrals of the
  0465 fix (its §Fix residuals 2 and 3, mirroring the 0422 nested-import
  disposition and the 0429/0448/0450 direct-declaration fence) — not this
  bug, and this fix must not widen those fences as a side effect.
- Reopening 0465's totality constraint: `lowerQueryResponseSchema` stays a
  TOTAL function whose unresolved-name arm returns `{}` (0028 §Fix — "Do not
  'improve' this"); the collision must be resolved or refused BEFORE the
  seam, in the collection/merge layer.
- The parse-time collision rules (imports.md:130-139) are correct and
  unchanged: the lib sibling is not bound into the importing file's
  namespace, so no parse-time `import-name-collision` is owed.
- Enum-position and cross-map (schema-alias vs sibling-enum) collision faces
  beyond noting the shared mechanism: the witnessed and filed class is the
  schema-schema collision; a fix should state its disposition for the enum
  map's identical pattern (`:334-339`) but this report does not separately
  witness it.

## Fix

Options:

1. **Qualified/namespaced `$defs` keys**: key imported decls by declaring
   site (e.g. lib-qualified names) in the collection maps, rewriting intra-
   lib references during the walk so the entry's field resolves to the
   qualified sibling entry while the alias remains the annotation-facing
   name. Correct per schema-subset.md:72 (every schema keeps its own entry);
   largest surface — the rewriting must respect the canonical schema hash and
   byte-identity rules of schema-subset.md, and the merge helpers'
   same-file-wins filter keys on `name`.
2. **Collision refusal diagnostic**: at collection time, when `outputName`
   equals a source name reached in the entry's same-lib closure (and the two
   are different decls), mint a load-time diagnostic refusing the import
   until the author picks a different alias. Converts the silent drop into a
   loud refusal consistent with imports.md:137's no-implicit-shadowing
   posture; smallest surface; refuses an authoring shape whose intended
   meaning is unambiguous, and must define its disposition for the
   cross-specifier variant (`:1465-1470`) and the enum map.
3. **Alias-aware reference rewriting**: store the entry's rename copy under a
   collision-free synthetic key and rewrite only the ANNOTATION-side lookup
   to it, leaving the sibling the spelled name. Keeps every spelled intra-lib
   reference correct without qualifying the whole namespace; must ensure the
   synthetic key cannot itself collide and that both producer call sites and
   both `decodeInboundValue` name-sets resolve the alias consistently.

Whichever option lands must settle: the cross-specifier first-wins at the
aggregation level (`import-static-checks.ts:1465-1470` — same mechanism, one
level up), the enum map counterpart (`:334-339`), and the re-pin of cell
`F1-a` (`tests/b0465-imported-annotation-vacuous-validation.test.ts:812-835`),
which pins the current first-wins bytes as a documented residual and must be
rewritten as the fix's witness. The `KNOWN RESIDUAL` doc-comment
(`import-static-checks.ts:256-263`) is discharged by the fix.

## Provenance

0465 fix residual 1, designated for parent filing
(`.pi/tmp/fixes/0465-report.md` §Residuals/notes item 1: "**Face (a)
alias-shadows-sibling** (residual, no bug doc — parent files): aliasing an
import to the EXACT source name of one of its own same-lib transitive
dependencies … is a genuine flat-`$defs` namespace collision. Deterministic
first-wins (aliased entry claims the name, sibling dropped); documented in
`collectImportedTypeDecls`'s doc-comment; cell `F1-a` pins it. Rare
pathological authoring; no diagnostic minted. Loud-wrong (a conforming
payload may be refused), not silent." — the 0424-R1/0437-R1
documented-residual filing precedent). Verified at HEAD d03f7398 (v0.462.0):
collector + doc-comment read (`import-static-checks.ts:232-354`,
`:1250-1470`), cell `F1-a` read and run, scratch probe (deleted) over the
real `checkThetaImports` channel quoting the collision and control bytes and
AJV verdicts verbatim. Spec read: schema-subset.md §Lowering Algorithm step 1
(`:72`), imports.md §Name collisions (`:130-139`). No non-scratch file
modified besides this report.
