# Bug 0445 — The bug-0423 load-phase rename carry reaches only the exact bare-root position: `xs: 'array<Author>'` and a body-schema field typed by the imported schema (`schema Wrap { author: Author }`) render the import's `as` renames theta-side under STATIC container rows whose translation clause is unconditional

- **Status:** fixed (0.457.0).
- **Sev/Diff estimate:** S2/D2 — theta-side names silently reach the child's
  system prompt on registering documents, triggered by exactly the refactor
  `.thetalib` promotes (bug 0423's own argument), and the nested face shows
  the two-spellings-in-one-prompt shape (the wrapper's own rename translates
  while the imported field's does not); never a WRONG wire name. D2 — not
  D3 like the parent: the load-phase data problem is SOLVED
  (`importedSchemaShapes` already builds each direct import's full
  sidecar-bearing shape in the same pass); the fix is consuming that map at
  the array/nested positions instead of only at the bare-root patch, plus
  one adjudication on patching static (non-value-driven) parts.
- **Kind:** defect — same normative sentences as bug 0423, on the sibling
  STATIC-row positions:
  `docs/spec_topics/query/query-escapes-stringification.md:26–27` (the
  `array<T>` and Schema-typed-object rows render "with wire-name translation
  applied recursively") and `:36` ("the theta-side names an author writes
  never appear in the rendered prompt"), applied to `system:` by `:16` and
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`.
  The QRY-18 value-driven note's opaque carve-out
  (`query-escapes-stringification.md:35`: "an opaque imported-schema object
  value … render[s] untranslated") does not govern either face: an
  `array<Author>` param takes the STATIC `array<T>` row (kind `array`, not
  value-driven — verified on the parsed template), and a `Wrap`-typed param
  takes the STATIC Schema-typed-object row (`Wrap` is a body schema); the
  untranslated blessing is scoped to opaque VALUES on the value-driven row.
  Not a designated residual — a residual CONTINUATION with no owning
  residual list. Bug 0424 §Fix's pinned dispositions read verbatim:
  "Imported-schema renames (bug 0423, lane L3) and union-arm renames (bug
  0425) remain out of scope"; bug 0425 §Fix residual 2 names "an imported
  schema arm" — a union-ARM class only. Both fixes' walks read
  `bodyTypes.schemas`, which imports never enter, so the imported
  array/nested container positions were never covered by anything. Bug 0423
  §Fix residual 1's attribution of these positions to "bugs 0424 / 0425
  (lane L4)" is a WRONG cross-reference — those fixes reach BODY schemas
  only — and the same residual's rationale ("mirroring
  `buildOutboundSidecars`' own flat-root scope") was already stale when
  written (0424 made the walk transitive in 0.430.0, six releases before
  0423's 0.436.0).
- **Related:**
  - 0423 (fixed 0.436.0) — the parent: built `importedSchemaShapes` (full
    sidecar-bearing shapes per direct import) and the bare-root template
    patch; this report is the array/nested positions the patch's guards
    exclude. Its never-wrong-wire and rename-free-byte-identity constraints
    bind here too.
  - 0424 (fixed 0.430.0) — made nested BODY-schema renames translate; the
    nested face here is its imported twin, unreachable by its BFS
    (`namedSchemaOf` consults `bodyTypes.schemas` only). Its §Fix pinned
    dispositions state the exclusion verbatim: "Imported-schema renames
    (bug 0423, lane L3) and union-arm renames (bug 0425) remain out of
    scope".
  - 0425 (fixed 0.431.0) — its §Fix residual 2 names "an imported schema
    arm" only as a union-ARM mis-pick class; no 0425 residual owns the
    static container positions here.
  - 0422 (fixed 0.435.0) — the same load pass this fix would extend; its F1
    nested-import admit and direct-import-only scope bound what shapes are
    in hand.
  - [bug 0442](./0442-alias-blind-outbound-sidecar-construction.md) — the body-alias twin of the same
    construction blindness (alias vs import: both are `schemas`-map misses
    at the sidecar walk).
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/extension/import-static-checks.ts:1292–1305` — the patch loop's
    guards: `part.valueDriven !== true` (`:1294`) excludes the `array<Author>`
    part (a STATIC `{kind:"array"}` part), and
    `importedSchemaShapes.get(typeSource.trim())` (`:1302`) requires the
    param's type source to BE the imported local name verbatim — `Wrap` and
    `array<Author>` both miss.
  - `src/extension/import-static-checks.ts:1323–1350` — the bare-root patch
    (`segments.length === 1`, object shape, has-rename gate): the only
    consumer of `importedSchemaShapes`' sidecars.
  - `src/parser/frontmatter.ts:1186–1190` — parse side of the array face:
    `namedSchemaOf(element, bodyTypes.schemas)` is `undefined` for an
    imported element (imports are a name-only set in
    `FrontmatterBodyTypes`), so the part is `{kind:"array"}` with no
    sidecars and nothing marks it for a load-phase revisit.
  - `src/parser/frontmatter.ts:915–933` — parse side of the nested face: the
    BFS field loop records no `refTarget` for a field whose type is an
    imported name, so `Wrap`'s sidecar map carries no hop and the runtime
    walk leaves the nested record untouched
    (`wire-translation.ts:618–621` finds no target).
  - `src/render/query-render.ts:415–430` — both faces serialise theta-side
    because the reaching type carries no (or no covering) sidecars.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic:
  `parseThetaDocument` + `checkThetaImports` over an in-memory `FileSystem`
  double (the b0422/b0423 LOAD-path harness pattern) +
  `renderSystemPrompt` over `patchedSystemTemplate ?? frontmatter.system` —
  the exact effective-template computation production-composition threads;
  scratch vitest run and deleted.

## Summary

Bug 0423's load pass builds, for every directly-imported schema a `params:`
names, the full sidecar-bearing `SystemParamType` (`importedSchemaShapes`) —
then consumes it at exactly one place: a bare `${param}` whose declared type
is the import itself. The two container positions beside it read nothing:
an `array<Author>` param renders every element theta-side (static array row,
no sidecars, not value-driven, so both the parse-time construction and the
load-time patch skip it), and a body schema wrapping the import renders the
nested imported record theta-side while translating its own renames. Moving
a schema from the body to a `.thetalib` — the refactor the format exists
for — silently flips the rendered bytes for exactly these spellings while
the bare spelling now (post-0423) keeps them.

## Reproduction

At 401a425b, offline, real load pass (`checkThetaImports`, in-memory FS).
`/proj/types.thetalib` declares
`schema Author { first_name as "FirstName": string, role: string }`; the
app imports `{ Author }` (row 2 adds
`schema Wrap { author: Author, tag as "Tag": string }`):

| params | render input | observed | expected wire form |
|---|---|---|---|
| `authors: 'array<Author>'` | `{authors: [{first_name:"Ada",role:"dev"}]}` | `R: [{"first_name":"Ada","role":"dev"}]` | `R: [{"FirstName":"Ada","role":"dev"}]` |
| `p: Wrap` | `{p: {author: {first_name:"Ada",role:"dev"}, tag:"t"}}` | `R: {"author":{"first_name":"Ada","role":"dev"},"Tag":"t"}` | `R: {"author":{"FirstName":"Ada","role":"dev"},"Tag":"t"}` |

Zero error diagnostics on both rows; `patchedSystemTemplate` absent (no
bare-root renamed part exists to patch). Controls on the same HEAD (green,
scratch-verified): bare `author: Author` → `{"FirstName":"Ada","role":"dev"}`
(b0423 W1 class); body-declared nested twin (`Wrap { author: BodyAuthor }`)
translates (b0424 class); `array<BodyAuthor>` translates (b0407 class).
Row 2's observed bytes show the two-faces shape: `tag` → `"Tag"` applied,
`first_name` kept theta-side, one prompt.

## Expected behaviour

- `query-escapes-stringification.md:26–27, 36` as quoted under **Kind**:
  both rows' translation clauses are unconditional, and neither qualifies by
  where the schema is declared (the 0423 argument, verbatim, one position
  over).
- `frontmatter-fields-b-and-templates.md:46`: one rendering per value
  regardless of surface — the query surface translates these values
  (brand-driven, environment-resolved), and the bare `system:` spelling now
  translates them too; the array/nested spellings render different bytes for
  the same values.
- The typed-response contract for the same import is wire-named
  (`properties.FirstName`), so the prompt teaches names the contract
  refuses.

## Actual behaviour / root cause

Three cooperating scopes, each individually deliberate:

1. Parse: imports are a name-only set, so `namedSchemaOf` /
   `buildOutboundSidecars` cannot see them (`frontmatter.ts:1186–1190,
   915–933`) — 0406/0407's recorded ground.
2. Load: `importedSchemaShapes` HAS the missing data
   (`import-static-checks.ts:1242–1254`) but the patch consumes it only for
   `valueDriven` parts whose param type source equals the import name and
   whose segments are bare (`:1294, :1302, :1323`).
3. The fixes that own "nested" and "array" translation (0424, 0407) operate
   on `bodyTypes.schemas`, which imports never enter.

No diagnostic, note, or spec sentence covers the composed classes.

## Why it matters

- The trigger is the library refactor itself: `array<Cat>` params and
  wrapper schemas are ordinary; factoring `Cat` into a shared `.thetalib`
  silently un-translates them while the bare spelling keeps working —
  an inconsistency WITHIN the imported class that did not exist before
  0.436.0 (everything imported rendered theta-side uniformly; now the bare
  position translates and its siblings do not, so the surface teaches that
  imports translate, then breaks the expectation one container in).
- Bug 0423's residual note mis-attributes these positions to fixed bugs
  whose machinery cannot reach them, so absent a filing the classes are
  orphaned (no residual list owns them).

## Non-goals

- The bare-root imported render — fixed (0423), control green.
- A body ALIAS of an import (`schema AI = Author`, `p: AI`) — reproduced
  theta-side at this HEAD (scratch row C6c), but its render is the
  value-driven opaque-object row, which the QRY-18 note's "opaque
  imported-schema object value … render[s] untranslated" clause arguably
  blesses, and 0422's F2 deliberately left the imported-alias head opaque;
  recorded here as a sibling observation, not filed as a face.
- Re-export chains and nested-import intermediates — bug 0422 residual 1's
  direct-import-only scope, imports-side ground (area import-intake-6 for
  load legality; only the render bytes were probed here).
- Import LOAD semantics (resolution, the permissive `{}` lowering) —
  imports-side, taken as given.
- A WRONG wire name never renders; any fix keeps that.

## Fix

Consume `importedSchemaShapes` at the two excluded positions, in the same
load pass (parent-adjudicated route (a) machinery). Options:

- (a) **Widen the load-phase patch**:
  - array face: for a STATIC `{kind:"array"}` part whose param type source
    is `array<Imp>` (one `array<...>` unwrap, or reuse of a widened
    `namedSchemaOf` against the import set), patch the part to an array
    `InterpolationType` carrying the import's `sidecars`/`rootDef` (the
    has-rename gate mirrored from `:1338–1341`). Requires lifting the
    `valueDriven !== true` guard for this specific shape — adjudicate that
    the patch may rewrite static parts (it already rewrites the bare part's
    kind).
  - nested face: when building a BODY schema's shape at parse is done
    (`buildOutboundSidecars`), fields typed by an imported name currently
    drop; at load, merge the import's sidecar fragment into the enclosing
    param's map under its own def name and add the missing `refTarget` to a
    patched part. This is a deeper patch (the part's existing sidecar map is
    rebuilt), but the per-`$defs` keying makes the merge collision-safe
    (the 0424 F2 discipline).
- (b) **Brand-driven render** for these positions — rejected by the parent
  line already (0423 §Pinned dispositions: invoke-path bindings are
  unbranded), noted for completeness.

Spec lane: QRY-18's opaque-imported-schema clause
(`query-escapes-stringification.md:35`, "an opaque imported-schema object
value … render[s] untranslated") reads stale post-0423 — the bare
renamed-direct-import position now translates — so the fix should carry a
spec-wording amendment for that clause alongside whichever option lands.

Constraints: rename-free imports stay byte-identical (patch absent — the
0423 F3/F4 gate, extended per position); the b0423 W1/W2/F1 cells stay
green; b0422's refusal cells unaffected (no new refusals — this is a
render-bytes carry only); both probe rows flip in the same commit as
witnesses, including a two-faces cell for row 2.

## Fix (0.457.0)

- What shipped:
  - `src/extension/import-static-checks.ts` — a load-phase static-container
    patch loop (in the same `checkThetaImports` pass as the bug-0423 bare-root
    patch, after it, on the STATIC parts it excludes). Array face: for an
    `array<Import>` param it patches the part to an array `InterpolationType`
    carrying the import's LIB-BUILT `sidecars`/`rootDef` from
    `importedSchemaShapes` (the bug-0407 `array<Schema>` element carriage).
    Nested face: for a body schema wrapping an import it merges each
    import-typed field's LIB-BUILT fragment into the enclosing per-`$defs` map
    under its own def name and adds the missing `refTarget`, across every
    body-schema def the parse-time map carries. Has-rename gate is
    root-def-only (`importedRootHasWireRename`), the SAME condition the
    bug-0423 bare-root patch uses, so the bare / array / nested positions
    agree. A def-name COLLISION (a lib-internal schema clashing with a
    different fragment already in the map) DECLINES to translate that field —
    it renders theta-side, never a wrong wire name.
  - `docs/spec_topics/query/query-escapes-stringification.md` — the §Fix "Spec
    lane" amendment (QRY-18 value-driven note, single physical line, net-0):
    the "opaque imported-schema object value renders untranslated" clause
    scoped to genuinely-opaque residuals (imported alias head, nested-import
    intermediate, re-export-chain schema, or an imported value reached by a
    `.field` path step), and the sentence now records that a directly-imported
    schema's renames translate when rendered as part of a container the load
    pass patches (the bare `${p}`, and one container in, an `array<Import>`
    element or an import-typed field of a rendered body schema — bugs
    0423 / 0445).
- Gates: witness `tests/b0445-imported-renames-static-container-positions.test.ts`
  6/6 green (RED-proven both directions: neutralising both container gates reds
  W1 array + W2 nested on imported theta-side keys, restore greens; blob
  byte-exact on restore); full default suite 611 files / 10681 tests green,
  bare rc 0; `tsc --noEmit` clean; `eslint` clean.
- Review: 3 rounds. R1 (`bug-fix-reviewer`) — F1 correctness (augmented-reparse
  resolved import-internal refs in the APP namespace → wrong wire name), F2
  fidelity (transitive lib renames dropped), F3 spec (clause taxonomy), F4
  fidelity (loop wider than the two faces); the reparse was replaced with a
  direct-carry (array) + fragment-merge (nested) over the lib-built
  `importedSchemaShapes`, resolving F1/F2/F4, and the spec reworded (F3). R2
  (`bug-fix-reviewer`) — F1 (flat merge dropped a colliding lib def → wrong
  wire name across namespaces), F2 (total-fragment gate diverged from 0423's
  root-only gate → bare-vs-container split); fixed with a collision-skip and
  the root-only `importedRootHasWireRename` gate (W5/W6 added). R3
  (`bug-fix-reviewer-fast`) — CLEAN.
- Verification: SOLID — witness reds without the fix (W1+W2 red on imported
  theta-side keys) and greens restored (blob byte-exact); default suite green;
  live cell well-formed (fails-loudly, task-framed discriminator, offline
  attribution guard asserting `patchedSystemTemplate` DEFINED + wire render);
  typecheck + lint clean; spec net-0 lines, LF.
- Live: `tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts`
  — a `mode: subagent` child with an `array<Author>` `system:` param over a
  REAL imported `.thetalib` whose `Author` renames `weight as "Weight"`; the
  parent renders each element's wire key `"Weight"` into the child's
  `--system-prompt` at the RFC-0006 spawn boundary. Green under the shared live
  lock (child sums the two wire-`Weight` values 10+20, returns 500+30=530,
  prober answers 630); token-free red-proof via neutralising the array-face
  gate (offline attribution guard reds on the theta-side render).
- Residuals:
  1. A def-name COLLISION — a lib-internal schema the import references sharing
     a name with a DIFFERENT schema already in the enclosing map (an app body
     schema, or another import's same-named internal helper) — renders the
     import-typed field theta-side (the collision-skip; never a wrong wire
     name). Witnessed by W5. Full translation of the collision case (via
     collision-free def-name minting) is future work; the §Fix's absolute
     constraint ("never a wrong wire name") is met.
  2. A TRANSITIVE-ONLY-renamed import (its OWN root object rename-free, a nested
     lib schema it references renamed) stays theta-side at every position —
     bare `${p}`, `array<Import>`, and import-typed body field — because the
     has-rename gate is root-def-only, matching bug 0423. Witnessed by W6. This
     is a shared residual with bug 0423's root-only gate, not a bare-vs-
     container split introduced here.
  3. Positions outside the two §Fix faces stay theta-side (pre-fix): an
     inline-object param wrapping an import (`p: '{author: Author}'`), an
     `${p.field}` path step reaching an imported value directly, and deeper
     compositions (`array<BodyWrapperWithImport>`). Consistent with the
     reworded spec clause's "one container in" scoping and bug 0422's
     direct-import-only / nested-import-intermediate §Non-goals.
- Discharge notes appended: none.
- Pinned dispositions / non-goals:
  - §Non-goals unchanged: the bare-root imported render (bug 0423, control
    green); a body ALIAS of an import (`schema AI = Author`; value-driven
    opaque row, 0422 F2); re-export chains and nested-import intermediates
    (bug 0422 residual 1, direct-import-only scope); import LOAD semantics; a
    WRONG wire name never renders — the collision-skip keeps that.

## Provenance

Fresh composition find (wave-6 seed: "imported×renamed composition").
Probed at 401a425b with scratch vitest
`tests/scratch-render-sidecars-6-imports.test.ts` (rows C6a, C6b red;
C6-control green; C6c reproduced and set aside per the QRY-18 opaque-value
clause; deleted), driving the real `checkThetaImports` load pass over an
in-memory `FileSystem` double per the b0423 harness pattern. Patch-guard
scope verified by code read at `import-static-checks.ts:1292–1350`; the
stale "flat-root scope" rationale verified against bug 0424 §Fix (0.430.0)
and bug 0423 §Fix (0.436.0) version order.
