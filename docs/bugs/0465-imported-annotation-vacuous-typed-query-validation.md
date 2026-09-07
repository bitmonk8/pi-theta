# Bug 0465 — A typed query or `invoke<Schema>` annotation naming an IMPORTED `.thetalib` schema lowers to the permissive `{}` at both producer call sites, so the QRY-22 legs are all vacuous — the respond tool conveys no shape, AJV accepts every payload, repair never engages — and a reply missing a required key binds as `Ok` with zero diagnostics, where the same-file spelling refuses that reply with `must have required property`

- **Status:** fixed (0.462.0).
- **Sev/Diff estimate:** S1/D2 — S1: silent wrong value end-to-end. The
  author's typed contract (`let summary: ReviewSummary = @`…`?`) is dropped
  with zero diagnostics at parse, load, and runtime; a schema-violating reply
  crosses the typed-query boundary as `Ok`, flows through the PIC-59 envelope
  to a parent, and either corrupts downstream state silently or panics
  arbitrarily far away (the live incident aborted a whole `/quality-loop`
  drive at `missing object key: filed`, after the wave's budget was spent).
  D2: multi-seam — the fix threads the load pass's already-materialised
  imported declarations into the one lowering seam both call sites share,
  plus adjudication of the transitive (lib-of-lib / re-export) closure and of
  the imported-rename sidecar legs; no design decision is open, since
  schema-subset.md:72 already prescribes the collection.
- **Kind:** defect — three spec sentences are violated, none licensing the
  imported class:
  - `docs/spec_topics/schema-subset.md:72` (Lowering Algorithm step 1):
    "**Collects every named schema** declared at the top level of the file
    (and transitively imported from `.thetalib` files used by the file)."
    The shipped lowering collects the importing file's own declarations only.
  - `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22): "the
    runtime MUST resolve that annotation to its declared shape, lower it …
    convey that lowered shape to the model on the forced-respond turn … and
    validate the final response … The runtime MUST NOT bind, as a typed
    query's value, a response that has not been validated against its
    declared schema." For an imported annotation the declared shape is never
    resolved: validation runs against `{}`, which is not the declared schema.
  - `docs/spec_topics/invocation.md:28` (Typed return): "`invoke<Schema>(...)`
    annotates the expected return type; the runtime AJV-validates the child's
    return value against the schema."
- **Related:**
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
    (fixed 0.38.0) — the ancestor: a typed-query annotation naming no
    lowerable declaration lowers permissively to `{}`. Its fix refused, at
    parse, names resolving to NO declaration; an imported name RESOLVES
    (`code-registry-parse.md:115`: "a symbol imported from a `.thetalib`
    resolves the name"), so it is admitted by design and the lowering keeps
    minting `{}` for it. 0028 §Fix names this class as a DEFERRAL, in its
    "Import nuance" paragraph: an imported name counts as resolved for the
    diagnostic while "its lowering stays permissive until the import
    machinery carries lowered fragments" — otherwise 0028's new parse error
    would reject legal thetas. A deferral inside a fix's scope fence is
    fileable when its class is later witnessed — the precedent is
    [0449](./0449-reexport-chain-enum-unknown-variant-null-panic.md), filed
    for a class 0430 §Fix had explicitly deferred — and this report is that
    deferred class now witnessed end-to-end by a live incident. 0028
    §Residuals (ii) (a `Result`-rooted annotation also lowers `{}`) is the
    sibling residual at the same seam with a distinct root (no lowered form
    exists for a `Result` root); this report does not cover it and its fix
    does not close it.
  - [0448](./0448-imported-non-object-ctor-mints-silently.md) (filed after
    this pin; fixed 0.453.0) — the object-CONSTRUCTOR position of the same
    parse-defers/load-never-judges skeleton. NEW leg here: the typed-query /
    `invoke<Schema>` ANNOTATION position, and the consequence is not a
    missing static refusal but a vacuous RUNTIME validation — the wrong
    value is minted by the model and accepted, not by theta code.
  - [0450](./0450-imported-enum-system-param-unjudged.md) (filed after this
    pin; fixed 0.455.0) — the `system:`-interpolation position of the same
    family; its fix widened the 0422 load re-walk, not the query lowering.
  - Neither landed fix touched this leg: 0448's §Fix (0.453.0) and 0450's
    §Fix (0.455.0) records list residuals and pinned non-goals that do not
    name the typed-query / `invoke<Schema>` annotation lowering, and at the
    main tree's current HEAD `rg 'importedSchemas|importedSchemaShapes'`
    still matches nothing in `production-theta-producer.ts` or
    `query-schema-lowering.ts` — the seam has no imported-declaration input.
  - 0429 (fixed 0.422.0) — its fix materialises exactly the data this fix
    needs: `importedSchemas` (local binding name → the declaring lib's
    `SchemaFieldSource[]`) at `src/extension/import-static-checks.ts:1063` /
    `:1209`, populated in the same load pass — in hand, unconsumed by either
    lowering call site.
  - 0422 (fixed 0.435.0) — landed the load-pass re-walk pattern the family's
    fixes reuse.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/runtime/query-schema-lowering.ts:153-198` —
    `lowerQueryResponseSchema(annotation, schemas, enums)`: the named arm
    consults `buildBodyTypeSchemas(schemas, enums)` only; an imported name
    misses and falls through to `lowerTypeSource`'s unresolved-name arm →
    `{}`. The header (`:38-44`) states the reachability: "a symbol a body
    `import` pulls in (both call sites hand this seam the importing file's
    OWN `schema` / `enum` decls, and the imported symbol's fields live in the
    other file) … admitted by design."
  - `src/extension/production-theta-producer.ts:3184-3190` — the typed
    `@`-query call site: `lowerQueryResponseSchema(expr.schema,
    schemaDeclsOf(deps.theta.body), enumDeclsOf(deps.theta.body))`. Shared by
    the live (prompt) and off-session (subagent) drivers; the lowered value
    also feeds the respond-tool registration and the QRY-15 template, so the
    conveyance leg degrades with it.
  - `src/extension/production-theta-producer.ts:4436-4448` —
    `#resolveReturnSite`: `annotated` resolves in the CALLER's own body,
    `callee-inferred` in the CALLEE's own body — both same-file-only.
  - `src/extension/production-theta-producer.ts:4515-4519` —
    `#validateInvokeReturn` lowers through the same seam and AJV-validates
    against the result; `{}` accepts every payload.
  - `src/extension/production-theta-producer.ts:6764-6783` —
    `schemaDeclsOf` / `enumDeclsOf`: `body.statements.filter(...)` — no
    import awareness.
  - `src/runtime/typed-query-validation.ts:344-372` — `validateAgainst`:
    unconditional AJV over the lowered fragment; vacuous for `{}`; the repair
    loop is entered only on a failed verdict, so it never engages.
  - Spec: `docs/spec_topics/schema-subset.md:72`;
    `docs/spec_topics/query/query-failure-and-repair.md:78`;
    `docs/spec_topics/invocation.md:28`;
    `docs/spec_topics/diagnostics/code-registry-parse.md:115`.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: scratch
  vitest over the production collaborators — real `parseThetaDocument`, real
  `checkThetaImports` over an in-memory FS (load-silence cell), producer-
  faithful `lowerQueryResponseSchema` inputs, real `AjvSchemaValidator`, real
  `buildTypedQueryValidation` + `runTypedQueryLoop` with a scripted
  `QueryModelDriver` (the e2e-S3 harness shape). Scratch deleted. The
  reproduction stands on the offline cells alone; the live incident
  (operator `/quality-loop` session, main tree, v0.461.0 — see §Why it
  matters) is impact evidence, not part of the reproduction.

## Summary

`lowerQueryResponseSchema` resolves a named annotation against the importing
file's own `schema` / `enum` declarations only. An annotation naming an
imported `.thetalib` schema therefore lowers to the permissive `{}`, and
everything QRY-22 hangs off the lowering degrades at once: the forced-respond
tool's wire schema is the envelope of `{}` (the model is never told the
declared fields), AJV validates every payload `ok`, and respond-repair never
engages because no verdict ever fails. A reply missing a required key — or
any JSON value at all — binds as the typed query's `Ok` value. The identical
theta with the schema declared same-file refuses the same reply with
`must have required property 'filed'` and drives repair. The same `{}` is
what `invoke<Schema>` return validation compiles when the caller imported
`Schema`, so the vacuity also crosses invoke boundaries.

## Reproduction

Offline, deterministic (scratch vitest, deleted; cells named as run). Shared
fixtures — lib `/proj/quality.thetalib`:

```
schema ReviewSummary {
  shard: string,
  filed: integer,
  notes: string
}
```

importing theta body (frontmatter `model: "sonnet"`, `mode: prompt`):

```
import { ReviewSummary } from "./quality.thetalib"
let summary: ReviewSummary = @`review the shard`?
summary
```

same-file control: the same body with the `schema ReviewSummary { … }` block
declared in the theta instead of imported. The incident-shaped reply payload
is `{"shard":"shard-03.json","notes":"two candidates staged"}` — the required
`filed` key absent.

- **SF-MK (control):** producer-faithful lowering of `ReviewSummary` over the
  same-file body →
  `{"type":"object","properties":{"shard":{"type":"string"},"filed":{"type":"integer"},"notes":{"type":"string"}},"required":["shard","filed","notes"],"additionalProperties":false}`.
  Driving `runTypedQueryLoop` (max_rounds 0, attempts 0) with the missing-key
  reply → outcome `validation`, leading issue
  `{"path":"","message":"must have required property 'filed'","schema_keyword":"required"}`.
- **SF-OK (control):** conforming reply binds `Ok`.
- **IMP-lowered:** producer-faithful lowering of `ReviewSummary` over the
  importing body (`schemaDeclsOf(body)` = `[]`) → `{}` exactly.
- **IMP-MK (the defect):** same loop, imported body, missing-key reply →
  outcome `value` (Ok), bound value
  `{"shard":"shard-03.json","notes":"two candidates staged"}`, follow-up
  drives 0 (repair never engaged).
- **IMP parse+load silence:** the importing theta parses `[]`; real
  `checkThetaImports` over the in-memory lib emits `[]`. The theta registers.
- **NESTED face:** a same-file `schema Outer { inner: ReviewSummary }` with
  `ReviewSummary` imported lowers to
  `{"type":"object","properties":{"inner":{}},"required":["inner"],"additionalProperties":false}`
  — the imported-typed FIELD is unconstrained; `{inner: 17}` validates `ok`.

## Expected behaviour

- schema-subset.md:72: the lowering collects named schemas "declared at the
  top level of the file (and transitively imported from `.thetalib` files
  used by the file)". `ReviewSummary` must lower to its declared object
  schema at the annotation position regardless of which file declares it.
- QRY-22 (query-failure-and-repair.md:78): resolve the annotation to its
  declared shape; convey the lowered shape on the forced-respond turn;
  validate the final response against it; route non-conformance through
  repair; "MUST NOT bind, as a typed query's value, a response that has not
  been validated against its declared schema". The SF-MK control shows all
  four legs working for the same-file spelling.
- invocation.md:28: `invoke<Schema>` returns are AJV-validated "against the
  schema" — the declared one, not a fragment that accepts everything.

## Actual behaviour / root cause

Both producer call sites hand `lowerQueryResponseSchema` the current file's
own declarations only (`production-theta-producer.ts:3184-3190`,
`:4515-4519` via `#resolveReturnSite` `:4436-4448`;
`schemaDeclsOf`/`enumDeclsOf` `:6764-6783` filter `body.statements`).
`buildBodyTypeSchemas` has no import input, so the IDENTIFIER arm
(`query-schema-lowering.ts:170-176`) misses, the source falls to
`lowerTypeSource`'s unresolved-name arm, and the annotation lowers `{}` —
the outcome the module header pins as reachable-by-design for imported
symbols (`:38-44`). Downstream, all three QRY-22 legs consume that one
lowering: the respond tool's `parameters` become the permissive envelope
(conveyance carries no field names — which is why a live model plausibly
omits `filed`), `validateAgainst` (`typed-query-validation.ts:344-372`)
compiles `{}` and reports `ok` for every payload, and `runRespondRepair` is
never entered. The load pass materialises the declaring lib's parsed field
lists for other checks (`importedSchemas`,
`import-static-checks.ts:1063`/`:1209` — the 0429 fix) but the query/invoke
lowering never consumes them.

The parse-side admit is correct per `code-registry-parse.md:115` (an imported
symbol resolves the name at the `@<T>` position); the missing piece is the
load/runtime discharge every other position of the imported-declaration
family received: 0422 (`system:` `${…}` field-path re-walk), 0429
(constructor field set), 0430 (imported enum-variant chain), 0448
(constructor naming an imported non-object kind), 0450 (`system:` path into
an imported-enum param). This report is the typed-query / `invoke<Schema>`
reply-validation leg — the sixth consumer of the same missing-import-data
root, untouched by all five fixes.

## Why it matters

- Live incident — evidence of impact, not part of the reproduction
  (operator session, main tree v0.461.0): a `/quality-loop` drive's subagent
  worker (`.pi/theta/workers/lens-d2-cruft.theta:22-24` — imports
  `ReviewSummary` from `.pi/theta/workers/quality.thetalib:6-10`, typed
  query at `:24`)
  returned `Ok` with `filed` absent; the parent
  (`.pi/theta/quality-loop.theta:77-78`) read `s.filed` and the whole drive
  aborted `theta /quality-loop aborted: missing object key: filed` — after
  the wave's review work was already spent. Had the parent's arithmetic not
  panicked, the wrong value would have flowed silently into
  `mark-reviewed` bookkeeping.
- The typed contract is the recommended factoring: shared `.thetalib` schemas
  are "the typed contracts that cross the subagent boundaries" (the
  operator's own lib comment). Moving a schema from a theta into a shared lib
  silently converts a working QRY-22 gate into no gate — the 0304-class
  refactor hazard, here disabling validation rather than a diagnostic.
- The conveyance leg makes the failure LIKELY, not just possible: with `{}`
  on the respond tool, the model never sees the declared fields, so shape
  drift is expected on any nontrivial schema.

## Non-goals

- The `theta/load/binder-model-strict-capability-unknown` note seen in the
  incident session is unrelated and honest: the strict-capability probe is
  load-time-only (`src/binder/binder-model.ts:183-247`), nothing in the
  typed-query validation path consults `strictCapable`, and the registry row
  (`code-registry-load.md:43`) accurately names a load-time check
  degradation. No validation is waived by degradation; no lying-diagnostic
  filing.
- The callee-inferred return leg's conservative floor
  (`inferCalleeReturnAnnotation`, `src/parser/functions.ts:506-533`, returns
  `null` for a constructor tail naming an imported schema, so that boundary
  runs no AJV at all): spec-backed deferral (tool-calls.md §Return type's
  "otherwise" clause), and even a named type would hit this same vacuous
  lowering — it recovers with this fix, not with a filing of its own.
- Static REFUSAL of imported annotations: wrong direction — parse admits by
  design and schema-subset.md:72 prescribes resolution, not refusal.
- The note-channel routing of the degradation note (0437/0451-0454 ground).
- Imported-rename sidecar fidelity (0423/0445 family) beyond noting it as
  fix scope: once imported schemas lower for real, their `as` wire renames
  must ride the same sidecars local schemas get.

## Fix

Options:

1. **Thread imported declarations into the lowering** (recommended): carry
   the declaring lib's materialised `SchemaDecl` / `EnumDecl` values (the
   load pass already parses and holds them — `importedSchemas` at
   `import-static-checks.ts:1063`/`:1209` holds the field lists; the full
   parsed docs are in the same loop) on the composition input, and include
   them in what both call sites pass to `lowerQueryResponseSchema` (or pass a
   merged body-type table). All three QRY-22 legs recover at once because
   they consume the one lowering. Must settle: the transitive closure
   (schema-subset.md:72 says "transitively imported" — lib-of-lib fields
   referenced by an imported schema's own body), re-export chains (mirror the
   0448/0429 direct-declaration fences or widen deliberately), name
   collisions between an imported and a same-file schema (same-file wins per
   the existing whole-file rule), and the imported wire-rename sidecars.
   Honours 0028 §Fix's totality constraint ("`lowerQueryResponseSchema`
   stays a total function returning `{}`" — "Do not 'improve' this"):
   resolution moves BEFORE the seam by widening its declaration inputs; the
   unresolved-name arm's `{}` contract is unchanged for genuinely
   unresolvable names.
2. **Refuse-at-load stopgap**: a load-pass walk refusing a typed-query /
   `invoke<T>` annotation that resolves to an imported symbol until (1)
   lands — converts silent-permissive into loud refusal. Contradicts
   schema-subset.md:72's prescribed collection and breaks the operator's
   legitimate shared-contract pattern; acceptable only as an interim gate,
   not as the disposition.
3. **Spec-pin the imported class as unvalidated**: rejected — normalises
   silent wrong values across subagent boundaries and contradicts all three
   quoted sentences.

## Provenance

binder-reply-validation micro-wave (live-incident seeded), 401a425b
(v0.437.0). Probe: `tests/scratch-brv-imported-annotation.test.ts` (deleted)
— 6 cells, outputs quoted verbatim; e2e-S3 harness shape (scripted
`QueryModelDriver` through real `runTypedQueryLoop`), b0302/b0334/b0335
in-memory-FS shape for the load-silence cell. Code read: the two
`lowerQueryResponseSchema` call sites, `#resolveReturnSite`,
`validateAgainst`, `binder-model.ts` strict probe (H1 falsification),
`inferCalleeReturnAnnotation`. Spec read: schema-subset.md §Lowering
Algorithm, QRY-22, invocation.md §Typed return, code-registry-parse.md:115,
code-registry-load.md:42-43. Incident artifacts read read-only from the main
tree (`.pi/theta/quality-loop.theta`, `.pi/theta/workers/lens-d2-cruft.theta`,
`.pi/theta/workers/quality.thetalib`). No non-scratch file modified.

## Fix (0.462.0)

- What shipped:
  - `src/extension/import-static-checks.ts` — new `importedTypeDecls`
    channel on `checkThetaImports`: for each directly-imported schema/enum it
    materialises the declaring lib's own `SchemaDecl`/`EnumDecl` node (entry
    renamed to its local `as` binding), plus the transitive same-lib closure
    (`collectImportedTypeDecls`/`referencedNamedTypes`) — schema-subset.md:72's
    "transitively imported" (§Fix must-settle a). Every reached decl is stored
    under its SOURCE name (so self/cycle/transitive refs resolve) and
    additionally under the alias when it differs.
  - `src/extension/reload-wiring.ts` — `importedTypeDecls` optional field on
    `ParsedTheta` so it rides `ThetaCompositionInput`.
  - `src/extension/production-composition.ts` — threads the channel onto the
    slash-registration input and the `invoke` callee path (spread-when-non-empty,
    mirroring `imports`/`patchedSystemTemplate`).
  - `src/extension/production-theta-producer.ts` — `mergedSchemaDeclsOf`/
    `mergedEnumDeclsOf` (same-file-wins filter, imported-first) feed both
    `lowerQueryResponseSchema` call sites (typed `@`-query, `#validateInvokeReturn`)
    and both `decodeInboundValue` name-set sites; `InvokeReturnSite` carries the
    imported decls (caller's for `annotated`, callee's for `callee-inferred`).
  - `src/runtime/query-schema-lowering.ts` — comment-only: the unresolved-name
    arm's `{}`-origins inventory and the param doc re-pinned to the merged-inputs
    reality. The seam stays a TOTAL function (0028 §Fix); only its inputs widened.
- Gates: witness `npx vitest run tests/b0465-imported-annotation-vacuous-validation.test.ts`
  → 24/24; full `npm test` → 635 files / 10854 passed, 0 failed; `npm run typecheck`
  (tsc --noEmit) clean; `npm run lint` (eslint) clean. Live: H8a
  `live-production-acceptance` 90/90, acceptance area 42 files / 53 passed
  (incl. `b0422live` 2/2); a scratch live probe drove an imported-schema typed
  `invoke<ReviewSummary>` end-to-end (red with the merge neutralised, green with
  it, deleted — 0033 precedent).
- Review: 2 rounds. Round 1 (bug-fix-reviewer, deep) — F1 (correctness): the
  alias-rename family reintroduced silent-vacuous validation for a renamed
  self-recursive / mutually-cyclic imported schema (nested position lowered `{}`)
  and a loud-wrong alias-shadows-sibling case; F2 (prose): comments contradicted
  the merged-inputs behaviour; residuals R1 (merge unwitnessed) / R3 (imported-enum
  path) / R2 (citation drift). All fixed (bug-fix-fixer): dual source-name+alias
  storage with the cycle guard fencing only recursion; F1-b/F1-c anti-vacuity
  witnesses; exported merge helpers + direct cell; imported-enum + wire-rename
  cells; comment/citation sweep. Round 2 (bug-fix-reviewer-fast) — CLEAN (reviewer
  reproduced the pre-fix shapes to prove the witnesses genuinely red).
- Verification: bug-fix-verifier SOLID. Witness reds under two targeted
  neutralisations (channel emits `{schemas:[],enums:[]}`; merge helpers drop
  imported decls) — the imported/defect cells red for the symptom — and greens on
  byte-exact restore (blob-hash confirmed). Full suite green; live obligation
  discharged (shipped H8a/acceptance + the imported-annotation scratch probe,
  red-with-neutralised / green-with-fix). Lint + typecheck clean.
- Residuals:
  1. Face (a) — aliasing an import to the EXACT source name of one of its own
     same-lib transitive dependencies (`import { ReviewSummary as Detail }` where
     ReviewSummary references a sibling `schema Detail`): a genuine flat-`$defs`
     namespace collision with no clean resolution. Deterministic first-wins (the
     aliased entry claims the name, the sibling is dropped); documented in
     `collectImportedTypeDecls`'s doc-comment. Rare pathological authoring; no
     diagnostic minted. Cell `F1-a` pins the deterministic behaviour.
  2. Cross-lib closure (a nested IMPORT inside a lib, beyond the directly-resolved
     lib's own top-level decls) stays opaque/deferred, mirroring 0422's nested-import
     disposition; consistent with the 0429/0448/0450 direct-declaration fence.
  3. Re-export-chain-only imported bindings stay deferred (same fence).
- Discharge notes appended: 0028 §Fix "Import nuance" (the deferral this fix
  closes — the import machinery now carries lowered fragments).
- Pinned dispositions / non-goals: the `binder-model-strict-capability-unknown`
  load note is unrelated (§Non-goals, unchanged). The callee-inferred return leg's
  conservative floor (`inferCalleeReturnAnnotation`) DOES now recover — its name
  sets are widened with the merged imported decls, so a constructor/enum-variant
  tail naming an imported type is recognised (§Non-goals anticipated this). Wire-
  rename sidecars (must-settle d) ride automatically: lowering the imported
  schema's real `.fields` carries each field's `wireName` through the outbound
  sidecars exactly as a same-file schema (cell `R3-wire-rename`).
