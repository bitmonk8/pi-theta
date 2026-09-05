# Bug 0448 — A constructor naming an imported NON-OBJECT declaration — an imported `enum` (`Sev { junk: 1 }`), an imported alias-form `schema` (`S = string`), or an imported `fn` — is judged at no phase and mints a value at runtime: the same-file spelling of each is refused `theta/parse/unresolved-named-type` (E), while the imported spelling registers and produces an unbranded record (enum/fn) or a record BRANDED as a schema that declares no object shape (alias) — bug 0025's pre-fix observable resurfacing through the import seam

- **Status:** fixed (0.453.0).
- **Sev/Diff estimate:** S1/D2 — S1: silent wrong value end-to-end. The
  same-file control is a registered `E` (`theta/parse/unresolved-named-type`,
  the brace-constructible clause); the imported spelling loads clean at every
  phase and the runtime mints `{"junk":1}` — unbranded for an enum/fn name
  (bug 0025's exact pre-fix class: "loads clean and evaluates as an unbranded
  plain object"), and for an imported alias-form schema a value carrying the
  `__thetaSchema` brand of a declaration that is not an object schema —
  flowing to every downstream consumer with zero diagnostics. D2: the fix is
  one more arm in the load-pass route bug 0429 landed — the per-specifier
  decl loop already looks up the direct declaration and already holds its
  KIND (`fn` / `schema` without `.fields` / `enum`); a kind check beside the
  existing field-set walk reuses `unresolved-named-type` per the same-file
  clause, plus a DIAG-2 Trigger amendment mirroring the 0429/0430 wiring
  sentences.
- **Kind:** spec gap with a defect reading — the registry's constructor
  clause (`code-registry-parse.md:115`: "The object-constructor position
  carries the additional requirement that the resolved declaration be
  brace-constructible … a name declared here as an `enum`, or as a `schema`
  without an object body, is not constructible and fires this code") states
  the requirement for the same-file universe and pins the parse-side imported
  deferral ("An imported symbol always defers at the constructor position —
  the importer's parse holds neither its field bodies nor its kind"), but no
  sentence prescribes any LATER judgement for the imported class — while the
  sibling field-set halves (rows :50–:51) now spell out exactly such a
  load-pass stage. The deferral sentence predates the load route; the load
  route judges FIELD SETS only. The deferral sentence's closing clause —
  "so the field-set checks do not run and this code does not fire" — is
  already FALSE post-0429: the field-set checks DO run at the load pass
  (rows :50–:51). Stale doc-truth, not a live spec pin — it strengthens this
  filing, and the fix must amend the clause. The reachable class has no prescribed
  disposition and an observably inconsistent outcome against the same-file
  control.
- **Related:**
  - 0429 (fixed 0.422.0) — the object-form half. Its §Fix (0.422.0) residual 1
    names this class verbatim: "An imported alias-form / head-only /
    enum-name constructor stays silent (this route judges FIELD SETS only;
    the same-file position REFUSES such a name with
    `theta/parse/unresolved-named-type` — a sibling of bug 0430's class, out
    of 0429 scope). Evidence: the `import-static-checks.ts` wiring comment +
    the A5 fence." This is that filing. One evidence-cite correction: 0429's
    A5 is its RE-EXPORT fence witness, not an alias-form witness; the real
    wiring evidence for this class is the comment at
    `import-static-checks.ts:1194–1204`.
  - 0025 (fixed 0.37.0) — landed the same-file brace-constructible
    classification this report's controls exercise; its scope was the parse
    tier, so the imported deferral it introduced was left with no downstream
    judge.
  - 0430 (fixed 0.423.0) — the enum-variant sibling of the same
    parse-defers/load-holds-data/runtime-misbehaves skeleton; its fix's
    `importedEnums` map is the exact data the enum-name arm of this fix
    needs.
  - 0031 (fixed 0.43.0) — field-VALUE typing; a separate mechanism, untouched
    (per the area brief's avoid list).
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/extension/import-static-checks.ts:1194–1210` — the 0429 wiring: the
    per-specifier decl loop populates `importedSchemas` only when
    `schemaDecl.fields !== undefined`; the adjacent comment states the
    withhold outright ("the imported alias-form/enum-name constructor stays
    silent here — a residual outside this bug's scope"). The loop ALREADY
    finds the enum decl (`:1217–1222`, `importedEnums`) and the fn decl
    (`:1185–1193`, `importedFns`) for the same specifier — the kind evidence
    is in hand and dropped for the constructor question.
  - `src/extension/invoke-static-checks.ts:1538` —
    `checkImportedSchemaCtorFields` judges an `ObjectExpr` only when its
    `typeName` is in `importedSchemas`; a constructor naming an
    imported enum / alias schema / fn is not in the map and no other check
    visits it.
  - `src/parser/theta-document.ts` (`checkObjectExpr` imported-name arm) —
    the documented parse deferral (registry `:115`).
  - `src/runtime/statement-executor.ts:1070` — the `ObjectExpr` runtime arm
    calls `buildObjectSchemaValue(obj, expr.typeName, env.resolveSchema)`.
  - `src/runtime/value.ts:398–424` — `buildObjectSchemaValue`:
    `resolveSchema` answers `undefined` for an enum/fn name → the record is
    returned UNBRANDED as-is (`:406–408`); for an imported alias-form schema
    the materialised registration carries no fields → the
    `decl.fields === undefined` arm (`:410–411`) brands the record with the
    alias's name.
  - `docs/spec_topics/expressions.md` §Object construction;
    `docs/spec_topics/diagnostics/code-registry-parse.md:115`, `:50–51`.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: scratch
  vitest, bug-0306 harness shape (real `parseThetaDocument`, real
  `checkThetaImports` over an in-memory FS, real `executeBody`). Scratch
  deleted.

## Reproduction

Frontmatter `model: "sonnet"`, `mode: prompt`. `parse`/`load`/`wire` as in
the sibling reports.

### K1 — imported enum as constructor (control refuses)

Control (same file): `enum Sev { Low }` + `let x = Sev { junk: 1 }` + `x` →
`error theta/parse/unresolved-named-type: unresolved named type 'Sev'`.

Imported (lib = `enum Sev { Low }`):

```
import { Sev } from "./lib.thetalib"
let x = Sev { junk: 1 }
x
```

Observed: parse `[]`; load `[]`; `enum Sev` materialises; wire `{"junk":1}`
— an UNBRANDED plain object (the runtime's `resolveSchema("Sev")` misses;
`buildObjectSchemaValue` passes the record through).

### K2 — imported alias-form schema as constructor (control refuses)

Control: `schema S = string` + `let x = S { a: 1 }` →
`error theta/parse/unresolved-named-type: unresolved named type 'S'`.

Imported (lib = `schema S = string`): parse `[]`; load `[]`; `schema S`
materialises; wire `{"a":1}` — and by the `value.ts:410–411` arm the record
carries the `S` schema brand: a brand asserting conformance to a declaration
whose type is `string`.

### K3 — imported fn as constructor (control refuses)

Control: `fn af(x: integer): integer { x }` + `let x = af { a: 1 }` →
`error theta/parse/unresolved-named-type: unresolved named type 'af'`.

Imported: parse `[]`; load `[]`; wire `{"a":1}` (unbranded).

Bound (not claimed): an imported UNION alias constructor
(`schema U = Cat | Dog`) does not reach the class — materialising the union
draws `theta/parse/missing-discriminator` at load for an undiscriminated
union, so that theta refuses for an unrelated reason.

## Expected behaviour

- `code-registry-parse.md:115`: the object-constructor position requires the
  resolved declaration to be brace-constructible; an `enum` and a `schema`
  without an object body "fire this code". The imported spelling names the
  same declarations. The row's imported-deferral sentence licenses the PARSE
  skip only ("the importer's parse holds neither its field bodies nor its
  kind") — the load pass holds both, for exactly these specifiers, in the
  same loop that populates `importedFns` / `importedSchemas` /
  `importedEnums`.
- The corpus's settled pattern for imported halves of parse-tier constructor
  rules is load-pass judgement (rows :50–:51 spell the
  `checkImportedSchemaCtorFields` wiring; row :114 the enum-variant wiring).
  Nothing prescribes that the KIND half of the constructor rule, uniquely,
  stays unjudged forever.
- 0025's rationale binds: an unbranded (or mis-branded) record minted from a
  non-constructible name was adjudicated a refusal-worthy fault for the
  same-file universe; the import seam re-opens it.

## Actual behaviour / root cause

Parse defers on any imported constructor name (documented). The load pass's
constructor walk keys on `importedSchemas`, populated only for
`schemaDecl.fields !== undefined` (`import-static-checks.ts:1206–1210`) — an
enum name, an alias/head-only schema and a fn name never enter, so
`checkImportedSchemaCtorFields` never sees the site, and no kind check exists
beside it. At runtime `buildObjectSchemaValue` (`value.ts:398`) treats a
`resolveSchema` miss as "no schema, pass through" (enum/fn → unbranded) and a
fields-less registration as the alias/head-only brand-as-is arm (alias →
branded). Neither arm can refuse.

## Why it matters

- The minted value is wrong in kind, not merely in shape: `Sev { junk: 1 }`
  produces a plain object where the author named an enum — every downstream
  consumer (equality, `match`, tool/query envelopes, wire serialisation)
  operates on a value class the author never declared, with zero diagnostics.
  K2's branded face is sharper: the brand asserts a schema contract
  (`S = string`) the value structurally cannot satisfy.
- The 0304-class refactor hazard: moving `enum Sev` / `schema S = string`
  from the theta into a shared `.thetalib` silently converts a parse E into a
  clean load plus a wrong runtime value — libraries are the recommended
  factoring.
- The fix data is in hand at the seam that already judges the sibling halves
  (0429/0430 proved the route twice).

## Non-goals

- Field-set judgement for imported OBJECT schemas — 0429, fixed and
  untouched.
- Field-VALUE typing (`0031`'s mechanism) — untouched.
- `match` object-pattern heads naming imported symbols — the registry row
  explicitly defers those (adjudicated; avoid-listed).
- The undiscriminated-union alias load refusal (the K-bound) — correct
  behaviour, cited as a bound only.
- Head-only imported schema (`schema S`) — `empty-schema-body` refuses the
  declaring lib before the class is reachable; not measured, not claimed.

## Fix

Options:

1. **Load-pass kind check** (recommended): in the per-specifier decl loop (or
   as a fourth walk beside `checkImportedSchemaCtorFields`), record the
   direct declaration's KIND for every imported binding; judge each
   `ObjectExpr` whose `typeName` is an imported binding that resolved to an
   `enum`, a fields-less `schema`, or a `fn`, emitting
   `theta/parse/unresolved-named-type` (reusing the same-file code and
   message per the brace-constructible clause) sited on the theta, with the
   0429-shape fences (shadow-defer via `collectLocalBinderNames`;
   direct-declaration-only, re-export chains withheld and stated). DIAG-2:
   amend row :115's constructor clause with the load-pass wiring sentence the
   sibling rows carry, and correct its stale closing clause ("the field-set
   checks do not run and this code does not fire" — false since 0429). GOV-15 addition (K1–K3 load clean today).
2. **Runtime belt**: make `buildObjectSchemaValue` (or its executor caller)
   distinguish "typeName names a registered enum / non-object import" and
   fail loudly instead of minting. Catches laundered inputs the static fence
   misses (re-export chains), but alone it converts an authoring mistake into
   an invocation-time failure — complementary, not sufficient (0430's
   Option-2 analogue).
3. **Spec-pin the imported class as unchecked**: rejected — contradicts the
   same-file clause's rationale and normalises silent wrong values.

## Provenance

import-intake-6 bug-hunt sweep, 401a425b (v0.437.0). Origin: bug 0429 §Fix
(0.422.0) residual 1 (named filing candidate). Probe:
`tests/scratch-ii6-intake.test.ts` (deleted) — cells B1c/B2/B3c/B4/B5/B6c/B6,
outputs quoted verbatim; runtime brand mechanics verified by code read
(`value.ts:398–424`, `statement-executor.ts:1070`,
`import-static-checks.ts:1194–1222`). Spec read: expressions.md §Object
construction; code-registry-parse.md:50–51, :114, :115. No non-scratch file
modified.

## Fix (0.453.0)

- What shipped:
  - `src/extension/import-static-checks.ts` — a new `importedNonCtorKinds`
    map populated in the existing per-specifier decl loop for every imported
    binding whose DIRECT declaration is non-brace-constructible (an `enum`, a
    `fn`, or a fields-less/alias-form `schema`), gated on `!hasCtorSchema` so a
    same-name fields-bearing object schema (0429's class) outranks it exactly
    as the same-file constructor position resolves schemas first; wired the new
    checker beside the 0429/0430 pushes. Corrected the stale "residual outside
    this bug's scope" comment.
  - `src/extension/invoke-static-checks.ts` — `checkImportedNonCtorTypeNames`,
    modelled on `checkImportedSchemaCtorFields`: walks the importing body's
    `ObjectExpr` sites, skips bare `{}` and shadowed names, and refuses a head
    resolving to an imported non-ctor kind with the REUSED
    `theta/parse/unresolved-named-type` (no code minted), rendering the
    call-site spelling.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — DIAG-2: row :115's
    object-constructor clause amended with the load-pass wiring sentence
    (sibling-row style) and its stale "the field-set checks do not run and this
    code does not fire" clause corrected (false since 0429).
- Gates:
  - Witness: `npx vitest run tests/b0448-imported-non-object-ctor.test.ts` →
    13 passed (K1a/K2a/K3a controls, K1b/K2b/K3b imported reds now green, K4
    over-refusal guard, K5 shadow fence, K6 re-export fence, K7 alias render,
    K8 dual-kind fence).
  - Full suite: `npm test` → 610 files / 10675 passed, 0 failed.
  - Typecheck: `npm run typecheck` (tsc -p tsconfig.json --noEmit) clean.
  - Lint: `npm run lint` (eslint src/**/*.ts) clean.
  - Live: `tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts`
    → 2/2 green through the real `pi -p`. Adjacent witness (recorded WHY): its
    DIRECTION 2 exercises the shared imported-load-refusal → theta-un-registers
    → `invoke` resolves Err mechanism that the 0448 change lives inside (same
    `checkThetaImports` load pass); the 0448 constructor-kind path is
    deterministically witnessed offline through that same production seam, and
    no new model-observable behaviour arises beyond that shared registration
    flip.
- Review: 2 rounds.
  - Round 1 (bug-fix-reviewer, deep): F1 (correctness) — a lib legally
    declaring both a fields-bearing `schema X` and a same-name `enum X`/`fn X`
    was over-refused (same-file spelling parses clean); F2 (house-rule) — the
    fn-arm comments misattributed the same-file fn-constructor refusal to
    `refs.fnNames`/`enums.has` instead of the no-declaration fall-through arm.
    Both fixed (bug-fix-fixer): `hasCtorSchema` gate on all three arms + K8
    dual-kind fence cell; comments corrected.
  - Round 2 (bug-fix-reviewer-fast): CLEAN.
- Verification: bug-fix-verifier SOLID.
  - Witness genuinely reds without the fix: neutralising the
    `checkImportedNonCtorTypeNames` push reds K1b/K2b/K3b/K7 for the right
    reason (empty compose vs owed refusal) and greens on byte-exact restore.
  - Full default suite green (10675 passed).
  - Lint + typecheck clean.
  - Live obligation discharged by the orchestrator (b0422live adjacency above).
- Residuals: none. The undiscriminated-union alias K-bound and the head-only
  `schema S` class (`empty-schema-body` refuses the declaring lib first) remain
  out of reach per §Non-goals; unchanged and unmeasured.
- Discharge notes appended: none. Bug 0429 §Fix (0.422.0) residual 1 named
  this class; the closed 0429 doc is not edited (era-pinning — no parent
  ratification for a dated note).
- Pinned dispositions / non-goals: imported OBJECT-schema field sets (0429),
  field-VALUE typing (0031), `match` object-pattern heads naming imported
  symbols (registry-deferred), the union-alias K-bound, and head-only imported
  schema all remain untouched, exactly as §Non-goals states.
