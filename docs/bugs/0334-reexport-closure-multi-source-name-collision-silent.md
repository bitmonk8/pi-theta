# Bug 0334 — A `.thetalib`'s resolved export set that receives one exported name from two different sources through its `export … from` closure carries no diagnostic: the re-export fixpoint reduces the set to a name-keyed `Set<string>`, discarding source identity, and a downstream `import { X }` of that name binds whichever re-export edge appears first in the re-exporting lib's source order — silently, and declaration-order-dependently — where the byte-identical collision written as two `import` specifiers in the importing theta is `theta/parse/import-name-collision`

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 by the silent-acceptance letter: a name
  collision the spec's own §"Name collisions" contract refuses across the
  importing theta's specifiers is neither reported nor decided across the
  re-export closure — the theta registers, one of two distinct library
  functions is bound under the imported name with zero diagnostics at any
  phase, and which one is bound is a function of declaration order in the
  re-exporting lib. D2: the fix reuses bug 0304's / 0333's landed three-phase
  re-export mechanism (`closeOverReExports` / `fixReExportedNames` /
  `diagnoseReExports`) — the fixpoint already visits every edge; the missing
  work is a same-name-two-declaring-sites check keyed on the resolved
  declaring site (so the diamond stays exempt), confined to
  `checkThetaImports`, one diagnostic shape (new row vs the existing
  `import-name-collision` code, adjudicable in lane), ordinary offline
  witness.
- **Kind:** defect — `docs/spec_topics/imports.md:117` states "Two imports
  bringing in the same symbol name is `theta/parse/import-name-collision`" and
  `:124` states an imported symbol colliding with a top-level declaration is
  the same code, "no implicit shadowing". Both sentences forbid a name binding
  to more than one source without an `as` disambiguation, and the load pass
  enforces exactly that over the importing theta's own specifiers
  (`checkImportNameCollisions`, `src/parser/imports.ts:572–598`, called at
  `src/extension/import-static-checks.ts:979–984`). The re-export closure
  admits the same name from two distinct declaring sites into one lib's
  resolved export set with neither an enforcement nor a spec sentence
  licensing the silent pick.
- **Related:**
  - [0333](./0333-transitive-lib-reexport-edge-fault-silent.md) — open. The
    edge-fault sibling: a broken `export … from` edge (unresolvable source
    path, unknown source symbol) reached only through plain-`import` hops is
    silent. Same three-phase mechanism, same file, same silent-acceptance
    family; 0333 is about a re-export edge that resolves to NOTHING, this
    report is about two re-export edges that both resolve, to DIFFERENT
    declarations, under one name. A fix for either meets the other in
    `fixReExportedNames` / `diagnoseReExports`.
  - [0304](./0304-transitive-lib-diagnostics-discarded.md) — fixed (0.288.0).
    Its §Non-goals bullet 3 and its fix-record residual 2 record this class as
    known-unfiled ("a transitive lib's `import-name-collision` … is still
    unchecked — same seam, unenumerated"). The residual frames it as a lib's
    OWN two imports binding one local; this report widens it to the multi-
    SOURCE case the re-export closure produces. The mechanism this report
    builds on is 0304's own landed work, so there is no ordering dependency.
  - 0335 (filed in parallel this cycle) — the lib-OWN-`import`-vs-OWN-
    declaration collision that bug 0303's fix-record residual 3 records (a
    `.thetalib` carrying both `enum Color` and `import { Color } from …`).
    That is a collision INSIDE one lib's own top level between its declaration
    set and its own import specifiers; this report is the importer-side
    multi-source case where the collision lives in the resolved EXPORT set a
    re-export closure computes. Measured here as distinct mechanisms: 0335's
    case is decided (or not) by a lib's own `checkImportNameCollisions` inputs
    (its declarations + its own specifiers), this report's by the re-export
    fixpoint's name-set dedup (`fixReExportedNames`); neither check sees the
    other's inputs.
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) —
    fixed (0.141.0). Established that a re-export delivers the declaration it
    names; `materializeChain` (`src/extension/import-static-checks.ts:702–760`)
    is that fix's follow-the-chain materialiser, and its first-matching-edge
    return (`:755`) is the mechanism that silently picks one source here.
- **Affected** (citations verified at HEAD `52712fb3`, v0.294.0):
  - `src/extension/import-static-checks.ts:493–504` — `ReExportEdge` carries
    `fromLib`, `sourceLib`, `source`, `exported`; `reExportEdges` collects one
    per re-export specifier. The data to detect a multi-source collision (two
    edges with the same `exported` on one `fromLib` whose `sourceLib`/`source`
    resolve to different declaring sites) is present and unused for that
    purpose.
  - `src/extension/import-static-checks.ts:585–605` — `fixReExportedNames`:
    `provided` is `Map<string, Set<string>>` (`:586`), a lib's resolved export
    set as a bare name set. `target.add(edge.exported)` (`:599`) unions a
    re-exported name into that set unconditionally once its source provides the
    source name; a name already present is skipped (`target.has(edge.exported)`,
    `:595`). Two edges contributing the same `exported` from different sources
    both succeed and collapse to one Set member — the source identity that
    would distinguish a collision from a diamond is discarded here.
  - `src/extension/import-static-checks.ts:612–627` — `diagnoseReExports`:
    the only per-edge diagnosis, and it emits `theta/parse/import-unknown-
    symbol` alone — for a source name nothing provides. It has no arm for a
    name TWO sources provide.
  - `src/extension/import-static-checks.ts:730–756` — `materializeChain`'s
    re-export follow: iterates `extractThetaLibForms(body).reExports` in source
    order and returns the FIRST edge whose `exported === source` that
    materialises (`:755`). This is the silent tie-break: declaration order in
    the re-exporting lib decides which of two colliding declarations the import
    binds.
  - `src/extension/import-static-checks.ts:761, :770, :836, :979–984` — the
    existing collision check: `checkImportNameCollisions` runs once over
    `allSpecifiers` (the union of the importing THETA's own `import` specifiers,
    accumulated at `:836`) against `localTopLevelNames` (`:761`). Its inputs are
    the theta's own written specifiers only; the resolved export set a re-export
    closure computes is never among them.
  - `src/parser/imports.ts:572–598` — `checkImportNameCollisions`: compares
    `specifier.local` values pairwise and against `localTopLevelNames`. It is
    the enforcement the multi-source case never reaches.
  - `docs/spec_topics/imports.md:117, :124` — §"Name collisions": the contract
    the multi-source case escapes.
  - `docs/spec_topics/imports.md:29` — §"Re-exports": the form whose closure
    produces the multi-source set; the section states nothing about a name the
    closure receives from two sources.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:134` — the
    `theta/parse/import-name-collision` row: "Two imports bring in the same
    symbol name" — no clause for a re-exported name provided by two sources.
- **Observed at:** `0.294.0` (`52712fb3`). Offline, deterministic; no live
  model. Scratch vitest: real `parseThetaDocument` + real `checkThetaImports`
  over an in-memory `FileSystem`, then real `executeBody` bound through
  `createProductionProducerDeps(...).bindPromptConversation` with a frozen
  empty callable set (the `tests/reexport-chain-resolution.test.ts` harness
  shape); written, run, deleted.

## Summary

`fixReExportedNames` computes each `.thetalib`'s resolved export set as a
name-keyed `Set<string>`. When two `export … from` edges of one re-exporting
lib carry the same exported name from two different declaring sources, both
union into that set and collapse to one member; `diagnoseReExports` inspects
only the never-provided case, so no collision is reported. A downstream
`import { X }` of that name then materialises through `materializeChain`, which
returns the first re-export edge in the re-exporting lib's source order that
resolves — binding one of the two declarations, silently, with the choice
determined by declaration order. The byte-identical collision written as two
`import { X } from …` specifiers in the importing theta IS reported
(`checkImportNameCollisions` over the theta's own specifiers), so enforcement
depth depends on whether the two sources meet as the theta's specifiers or as a
lib's re-export set.

## Reproduction

Offline at `52712fb3`. `/proj/app.theta` (frontmatter `model: "sonnet"`,
`mode: prompt`); `diags` = `checkThetaImports(...).diagnostics`; `mat` = its
materialised imports; `runtime` = `executeBody` outcome.

### C1 — multi-source re-export collision: silent, first-source-wins

```
@@ app  import { xf } from "./hub.thetalib"
        let r = xf(2)
        r
   /proj/hub.thetalib   export { xf } from "./a.thetalib"
                        export { xf } from "./b.thetalib"
   /proj/a.thetalib     fn xf(n: integer): integer { n + 1 }
   /proj/b.thetalib     fn xf(n: integer): integer { n + 100 }
   diags :: []          mat :: ["fn xf"]      runtime :: value=3     ← a wins (n+1)
```

Reversing the two `export` lines in `hub.thetalib` (b first) flips the winner to
`b`'s `xf` — the resolved binding tracks declaration order in the re-exporting
lib, with no diagnostic either way.

### C2 — direct-specifier control: the same collision IS reported

```
@@ app  import { xf } from "./a.thetalib"
        import { xf } from "./b.thetalib"
        let r = xf(2)
        r
   diags :: ["error theta/parse/import-name-collision"]
   mat   :: ["fn xf", "fn xf"]     runtime :: value=102              ← last-import-wins
```

Two specifiers naming one local reach `checkImportNameCollisions` and fire the
code (un-registering the theta). The two sources of C1 are the two sources here,
one hop removed through a re-export hub.

### C3 — control: two imports of different names

```
@@ app  import { xf } from "./a.thetalib"
        import { yf } from "./b.thetalib"
        let r = xf(2) + yf(2)
        r
   diags :: []      mat :: ["fn xf", "fn yf"]     runtime :: value=105
```

### C4 — diamond: one declaration reached through two paths, correctly silent

```
@@ app  import { xf } from "./hub.thetalib"
   /proj/hub.thetalib   export { xf } from "./midA.thetalib"
                        export { xf } from "./midB.thetalib"
   /proj/midA.thetalib  export { xf } from "./base.thetalib"
   /proj/midB.thetalib  export { xf } from "./base.thetalib"
   /proj/base.thetalib  fn xf(n: integer): integer { n + 1 }
   diags :: []      mat :: ["fn xf"]     runtime :: value=3
```

Both re-export chains resolve to `base`'s one `xf`, so the import binds one
declaration by two paths — no collision. The fix must keep this row silent (the
diamond exemption): the two edges' collision key resolves to the same declaring
site.

## Expected behaviour

- `docs/spec_topics/imports.md:117`: "Two imports bringing in the same symbol
  name is `theta/parse/import-name-collision`. Resolve with `as`-aliasing." A
  name the resolved export set of one lib receives from two distinct declaring
  sources is two sources for one imported name; the reader who writes
  `import { xf } from "./hub.thetalib"` has no `as` to disambiguate a collision
  they cannot see. C1's binding is one of two library functions chosen by an
  order the importer never wrote.
- `docs/spec_topics/imports.md:124`: "no implicit shadowing." C1 is implicit
  shadowing across a library boundary — `b`'s `xf` is shadowed by `a`'s with no
  signal on either side.
- Enforcement depth is not statable from the spec: no sentence scopes the
  collision contract to the importing theta's own specifiers, yet C2 (the
  theta's specifiers) is reported and C1 (the same two sources through a
  re-export hub) is not.
- The diamond (C4) is legal input at every gate — one declaration, every path
  resolves — and must stay silent.

## Actual behaviour / root cause

`fixReExportedNames` (`src/extension/import-static-checks.ts:585–605`) keys each
lib's resolved export set on name alone (`Map<string, Set<string>>`). The union
step `target.add(edge.exported)` (`:599`) admits a re-exported name whenever its
source provides the source name and the name is not already present; the
already-present skip (`:595`) makes the second contributor a silent no-op rather
than a collision. `diagnoseReExports` (`:612–627`) inspects only the
never-provided case (`theta/parse/import-unknown-symbol`), so a name provided by
two sources draws nothing. Materialisation then resolves the importer's
specifier through `materializeChain` (`:702–760`), whose re-export loop
(`:730–756`) returns the first edge whose `exported === source` that
materialises — declaration order in the re-exporting lib is the tie-break. The
importing theta's own collision check (`checkImportNameCollisions`, called at
`:979–984`) never sees the re-export closure: its inputs are `allSpecifiers` —
the theta's own written specifiers — and `localTopLevelNames`.

## Why it matters

- **Silent wrong binding across a library boundary** (C1): a `.thetalib` is the
  spec's shared-library unit. A hub lib that re-exports the same name from two
  team libs binds one of them into every downstream importer by declaration
  order, with zero diagnostics — the exact ambiguity `as`-aliasing exists to
  force the author to resolve, invisible because the author imports one name
  from one hub.
- **Enforcement depth depends on shape, not on the fault**: the identical
  two-source collision is reported when it is the theta's two specifiers (C2)
  and silent when it is a lib's two re-exports (C1) — the same incoherence bug
  0333 records for edge faults, one aspect over.
- **The class is one refactor away from real programs**: consolidating two
  libraries behind a single re-export hub — a routine barrel-file pattern —
  converts a reported collision into an unreported one.

## Non-goals

- The lib-OWN-`import`-vs-OWN-declaration collision (bug 0303 residual 3, filed
  in parallel as 0335) — a distinct mechanism decided by a lib's own
  `checkImportNameCollisions` inputs, not the re-export fixpoint. This report is
  the importer-side multi-source case only.
- The edge-fault classes (unresolvable re-export source, unknown re-export
  symbol) — bug 0333's subject; this report is the both-edges-resolve case.
- Whether a re-export whose name shadows the re-exporting lib's OWN top-level
  declaration is itself a collision — a further seam the same fixpoint would
  meet; no probe here drove it.

## Fix

The re-export fixpoint records source identity, and a same-name-two-declaring-
sites collision in one lib's resolved export set is `theta/parse/import-name-
collision` (or a re-export-scoped sibling row — the diagnostic shape is
adjudicable in lane, new row vs the existing import-fault code), sited on the
re-exporting lib and reaching the importing theta through the existing
registration channel that `diagnoseReExports` already uses. Concretely:

1. Resolve each `ReExportEdge` to its DECLARING site (the terminal
   `(resolvedPath, declaration name)` its chain reaches), reusing
   `materializeChain`'s / the fixpoint's own edge walk — the data is already in
   `reExportEdges`.
2. For each re-exporting lib, group its resolved export names; a name reached
   from two edges whose declaring sites differ is a collision and draws the
   diagnostic once, at the second edge's specifier.
3. A name reached from two edges resolving to the SAME declaring site is the
   diamond (C4) and draws nothing — the collision key is the declaring site,
   not the immediate `sourceLib`, so a name flowing through two re-export paths
   to one declaration stays exempt.
4. `fixReExportedNames`'s name-set dedup can stay for the export-set
   computation; the collision check runs beside it over `reExportEdges` with
   source identity intact, so `computeThetaLibExports` and the existing unknown-
   symbol arm are unchanged.

Witnesses: C1 (with its declaration-order-swap variant pinning the silent
tie-break), C2 (the direct-specifier control that already reports, a regression
guard), C3 (different-name control), and C4 (the diamond exemption, which must
stay silent). Because this fix decides which of two library functions binds, it
blocks on no other open bug and is free to land after 0333 (shared file, no
logical dependency).

## Provenance

- Origin: bug 0304 §Non-goals bullet 3 and fix-record residual 2 (recorded
  unfiled), widened from the lib's-own-two-imports framing to the multi-source
  re-export-closure case; and bug 0303 fix-record residual 3, whose lib-own-
  import-vs-declaration half is filed separately as 0335.
- Spec: `docs/spec_topics/imports.md:29, :117, :124`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:134`.
- Implementation evidence at `52712fb3`:
  `src/extension/import-static-checks.ts:493–504, :585–605, :612–627,
  :702–760 (:730–756), :761, :770, :836, :979–984`;
  `src/parser/imports.ts:572–598`.
- Probes: scratch vitest cells C1–C4 plus a declaration-order-swap variant at
  `52712fb3`, outputs quoted verbatim; files deleted per scratch policy. No
  non-scratch file modified.
