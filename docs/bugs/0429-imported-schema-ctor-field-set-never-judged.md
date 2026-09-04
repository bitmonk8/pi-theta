# Bug 0429 — An imported-schema constructor's field set is judged at no phase: parse defers by design (FS-free), the load pass holds the declaring lib's full field list and never checks the theta's constructor sites, and the runtime brands the record AS-IS — so `Author { junk: 1 }` against an imported `schema Author { name: string }` mints a branded Author value with a wrong field set and zero diagnostics

- **Status:** fixed (0.422.0).
- **Sev/Diff estimate:** S1/D2 — S1: silent wrong value end-to-end. The
  same-file spelling draws two `E`-severity refusals
  (`theta/parse/extra-object-field`, `theta/parse/missing-object-field`); the
  imported spelling registers, runs, and produces a `__thetaSchema`-branded
  value whose shape contradicts the declaration it is branded as, flowing to
  every downstream consumer (queries, tool args, returns, `match`) with no
  diagnostic at any phase. D2: the fix is a load-pass walk of the importing
  body's `ObjectExpr` sites against the resolved lib's `SchemaDecl` fields —
  the exact route bug 0138 landed for imported `fn` call arguments
  (`checkImportedFnCallArgs`), reusing the two existing codes — plus registry
  Trigger amendments mirroring the fn-arity rows' load-pass wiring sentences.
- **Kind:** spec gap with a defect reading — `expressions.md:218` pins the
  PARSE-side skip ("A name imported from a `.thetalib` always resolves at
  this position … so the field-set checks above do not run and the
  construction is not checked **here**") but no page prescribes any later
  check, while the registry row's constructor clause
  (`code-registry-parse.md:50`: "Schema constructor lists a field not
  declared by the schema") carries no imported carve-out — its explicit
  imported-symbol deferral is scoped "at the pattern-head position" only.
  The two lines leave the reachable class with no prescribed disposition and
  an observably inconsistent outcome against the same-file control.
- **Related:**
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md)
    — fixed (0.235.0). The precedent this report's fix mirrors: parse defers
    on imported callees, so the LOAD pass judges them once the resolved
    library exists as a parsed document; the registry rows were amended to
    state that wiring. Constructors never received the same treatment.
  - [0025](./0025-ctor-unresolved-schema-name-passthrough.md)
    — fixed. Landed the parse-side classification this report measures the
    downstream of (imported constructor names defer); its scope was the parse
    tier only.
  - [0406](./0406-object-typed-params-misclassified-string.md)
    — fixed (0.404.0). Its fix-record residual 1 records the sibling
    consequence of the same FS-free design on the RENDER surface
    (imported-field typos in `system:` interpolation, "filing candidate for
    the next hunt"); this report is the CONSTRUCTOR consequence on the load
    surface.
  - [bug 0430](./0430-imported-enum-unknown-variant-panics-null-member.md) — same skeleton (parse defers, load holds
    the data and never judges, runtime misbehaves), on the enum-variant
    member-access site.
  - [0306](./0306-imported-enum-drops-explicit-wire-values.md)
    — fixed (0.289.0). Threaded the imported enum's full variant set and
    explicit wire values through `MaterializedImport`: in-corpus proof that
    the materialisation seam can carry declaration payload, grounding §Fix
    option 2 and the "data already in hand" claim.
  - [bug 0422](./0422-imported-schema-field-invisibility-renders-undefined.md) — shared root: the parser is sync +
    `FileSystem`-free (`ParseThetaDocumentDeps` = `{systemNote,
    modelMatcher}`), so imported members do not exist at parse; every
    consumer of that data either defers or misbehaves. Different walked
    artefact (frontmatter `system:` template vs body `ObjectExpr`), different
    consumer, different terminal. If that report's load-phase template
    revalidation route is chosen it becomes another site in the same
    import-resolution pass this report creates — schedule after/with
    system-templates-2/01; do not merge.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/theta-document.ts:9146–9151` (`checkObjectExpr`): the
    imported-name arm returns with no check ("The sole genuinely undecidable
    class — defer, since the field-set checks below have no shape to run
    against").
  - `src/extension/import-static-checks.ts:248` (`materializeSymbol`): an
    imported schema materialises as `{ name: local, kind: "schema" }` — the
    declaring `SchemaDecl`'s field list, in hand in the parsed lib document,
    is dropped at the seam.
  - `src/extension/import-static-checks.ts` — `checkThetaImports` walks the
    importing body for imported-`fn` CALL sites only
    (`checkImportedFnCallArgs`); no pass visits `ObjectExpr` constructor
    sites.
  - `src/runtime/lexical-environment.ts:486` — the imported schema registers
    field-less; `src/runtime/value.ts:410–411`
    (`buildObjectSchemaValue`): `decl.fields === undefined` → the constructed
    record is branded AS-IS.
  - `docs/spec_topics/expressions.md:213` (the two codes' prescriptions),
    `:218` (the parse-position skip);
    `docs/spec_topics/diagnostics/code-registry-parse.md:50–51`.

## Summary

Same-file constructor faults are refused at parse: `Author { junk: 1 }`
against a same-file `schema Author { name: string }` draws
`extra-object-field('junk')` and `missing-object-field('name')`. The
byte-identical constructor against the same declaration IMPORTED from a
`.thetalib` is checked nowhere: parse defers (the parser cannot see the lib —
by design, bug 0406's Residual establishes the parser is sync-FS-free), the
load pass — which parses the lib and holds the full `SchemaDecl` — judges
only `fn` CALL sites (bug 0138) and never constructor sites, and the runtime
registers the imported schema without fields so `buildObjectSchemaValue`
brands whatever record was built.

## Reproduction

Offline at 04579e12; bug-0306 harness shape (real `parseThetaDocument`, real
`checkThetaImports` over an in-memory FS, real `executeBody`).

Control (same file):

```
schema Author { name: string }
let a = Author { junk: 1 }
a
```

Observed parse: `error theta/parse/extra-object-field: extra field 'junk' on
schema 'Author'` + `error theta/parse/missing-object-field: missing field
'name' on schema 'Author'` — the theta does not register.

Imported (lib `/proj/lib.thetalib` = `schema Author { name: string }`):

```
import { Author } from "./lib.thetalib"
let a = Author { junk: 1 }
a
```

Observed: app parse `[]`; load diagnostics `[]`; `imports` =
`["schema Author"]`; body executes; settled value JSON `{"junk":1}` carrying
the schema brand (`Symbol(__thetaSchema)` present on the value). Zero
diagnostics at every phase.

## Expected behaviour

- `expressions.md:213`: "Every declared field of the schema must be present
  (omissions are `theta/parse/missing-object-field`); extra fields are
  `theta/parse/extra-object-field`" — stated for the construction form as
  such, not for same-file declarations only.
- `code-registry-parse.md:50`: the constructor clause of
  `extra-object-field`'s Trigger is unqualified; the row's imported-symbol
  deferral names "the pattern-head position" alone. `:51`
  (`missing-object-field`): "Schema constructor omits a declared (required)
  field" — unqualified.
- The load pass is where the corpus already judges imported halves once the
  resolved library exists as a parsed document (the fn-arity /
  fn-arg-type-mismatch rows spell this wiring out — `code-registry-parse.md`
  rows at `:144`, `:148–149`). Nothing prescribes that constructors, uniquely,
  stay unjudged forever.
- `expressions.md:218` licenses only the PARSE-position skip ("not checked
  here"); it does not prescribe the total absence.

## Actual behaviour / root cause

`checkObjectExpr` defers on the imported name (correct — parse is FS-free).
The load pass drops the field list at `materializeSymbol`
(`import-static-checks.ts:248` narrows to `{ name, kind: "schema" }`) and has
no constructor-site walk (its only body walk is `checkImportedFnCallArgs`,
CALL expressions only). The runtime therefore registers a field-less
`SchemaDecl` (`lexical-environment.ts:486`), and `buildObjectSchemaValue`'s
`fields === undefined` arm (`value.ts:410`) brands the record as-is — the arm
built for the alias/head-only shape absorbs the imported-object-schema case.

## Why it matters

- The brand asserts a contract the value does not satisfy: downstream
  consumers that trust the brand (wire translation re-brands through it,
  `match` heads and equality read the shape, tool/query envelopes serialise
  it) receive a wrong-shaped value that looks declared. A missing required
  field surfaces — if ever — as `null`-reads or provider-side validation
  noise far from the authoring mistake.
- The refactor hazard is the 0304 class: moving a schema from the theta into
  a shared `.thetalib` silently converts two E-severity refusals into clean
  loads. Libraries exist to be imported; the checked spelling is the one
  authors are steered away from.
- The load pass already parses the lib and holds the declaration — the check
  is withheld, not unreachable (0138 proved the route).

## Non-goals

- `match` object-pattern heads naming imported symbols — the registry row
  explicitly defers those (adjudicated).
- Field-VALUE typing (`name: 1` vs declared `string`) for imported schemas —
  same seam, but bug 0031's code (`object-field-type-mismatch`) and its
  TypeEnv threading are a separate mechanism; a fix here will meet it when it
  threads the lib's fields.
- The render/system-template consequences of imported-schema field
  invisibility (0406 residuals; system-templates-2's surface).
- The schema-brand identity string for aliased imports (brand = local alias
  name) — no observable consumer divergence found in this sweep.

## Fix

Options:

1. **Load-pass constructor walk** (recommended): alongside
   `checkImportedFnCallArgs`, walk the importing body's `ObjectExpr`s whose
   `typeName` is an imported schema binding (the shared walk already descends
   into `ObjectExpr` field values — `invoke-static-checks.ts:239`
   `case "object":` — only a constructor-site collector is missing, so the
   header's D2 is conservative); judge the field set against the
   resolved lib's own `SchemaDecl.fields` (source name, declaring lib's
   document — the bug-0072 namespace rule), emitting the two existing codes
   sited on the theta. Amend the two registry rows with the same "imported
   half judged at the LOAD pass" sentences the fn rows carry, and soften
   `expressions.md:218`'s "not checked here" to name the load-pass route.
   Shadowing (local binding named `Author`) must defer, mirroring
   `checkImportedFnCallArgs`'s `shadowedNames` arm; re-export-chain-reached
   schemas may keep the fn route's stated direct-declaration-only fence for
   coherence.
2. **Thread fields through materialisation**: carry `fields` on
   `MaterializedImport` so the runtime's `buildObjectSchemaValue` orders and
   the existing parse-shape codes… cannot fire at runtime — this option alone
   only fixes field ORDERING, not the refusal; rejected as the primary fix
   (no diagnostic phase exists there), though threading fields is
   independently correct hygiene.
3. **Spec-only**: pin the imported constructor as permanently unchecked.
   Rejected: contradicts the same-file refusal's rationale
   (`additionalProperties: false`, "every declared field is required") and
   normalises a silent wrong brand.

## Provenance

imports-exports-2 bug-hunt sweep, 04579e12 (v0.415.0). Probe:
`tests/scratch-ie2-load-semantics.test.ts` (deleted after the run) — cells A1
(same-file control, both codes observed) and A2 (imported: parse `[]`, load
`[]`, settled `{"junk":1}` with `Symbol(__thetaSchema)`), outputs quoted
verbatim. Spec read: expressions.md §Object construction;
code-registry-parse.md rows 50–51, 144, 148–149. No non-scratch file
modified.

## Fix (0.422.0)
- What shipped: `src/extension/invoke-static-checks.ts` — new `checkImportedSchemaCtorFields` walks the importing body's `ObjectExpr` constructor sites (a `objectExprs` collector added to the shared walk) whose `typeName` is an imported-schema binding (direct-declaration-only, `collectLocalBinderNames` shadow-defer) and emits `theta/parse/extra-object-field` + `theta/parse/missing-object-field` (reusing `checkObjectLiteralFields`) sited on the theta, alias-name rendered (§Fix Option 1). `src/extension/import-static-checks.ts` — an `importedSchemas` map populated beside `importedFns`, the new checker wired once after `checkImportedFnCallArgs`. `docs/spec_topics/diagnostics/code-registry-parse.md` rows for `extra-object-field`/`missing-object-field` amended with the load-pass wiring + GOV-15 notes (DIAG-2); `docs/spec_topics/expressions.md:218` softened to name the load-pass route.
- Gates: witness `tests/b0429-imported-schema-ctor-field-set.test.ts` 7/7 green (A1 same-file control, A2 imported RED→green, A3 valid, A4 shadow-defer, A5 re-export fence, A6 alias rendering, A7 lib-internal fence); full default suite green (one machine-load hook-timeout flake, green isolated); `npm run typecheck` clean; `npm run lint` clean; code-registry + grammar-cite gates green. Live: adjacent `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` green under the global lock — WHY: 0429's refusal un-registers via the identical error-severity load-diagnostic channel proven end-to-end by the new `b0428live` cell; the offline A1–A7 witnesses cover the constructor-specific behaviour and no model participates in a constructor field set.
- Review: 1 deep round + 1 polish round — R1 (bug-fix-reviewer): F1 house-rule (wiring comment misstated same-file parity), R1 prose (registry fence vocabulary), R2 test (alias + lib-internal witnesses absent); bug-fix-fixer-light resolved all three (comment/prose/test only). Post-polish confirmation skipped per gate-diff + orchestrator inspection of the A6/A7 cells (green at HEAD, additive).
- Verification: SOLID — witness reds on fix revert (A2/A6 lose both codes), restores green; full suite green; typecheck+lint clean; DIAG-2 registry-consistency gate green.
- Residuals: 1. An imported alias-form / head-only / enum-name constructor stays silent (this route judges FIELD SETS only; the same-file position REFUSES such a name with `theta/parse/unresolved-named-type` — a sibling of bug 0430's class, out of 0429 scope). Evidence: the `import-static-checks.ts` wiring comment + the A5 fence.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `match` object-pattern heads (registry defers); field-VALUE typing for imported schemas (bug 0031's separate mechanism); render/system-template consequences (bug 0406 residuals); Option 2 (thread fields) rejected as primary, Option 3 (spec-only) rejected. Also touched `tests/arg-mismatch-diagnostic-count-by-surface.test.ts` — comment/message-only citation freshness from the line shift (self-authorized citation-only: charter permits comment-only bounded edits; git diff confirms no assertion touched; the test stays 98/98 green).
