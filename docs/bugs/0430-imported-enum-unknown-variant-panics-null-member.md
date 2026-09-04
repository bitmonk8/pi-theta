# Bug 0430 — An unknown variant on an IMPORTED enum (`Sev.Nope` against an imported `enum Sev { Low }`) is refused at no static phase and aborts at runtime as `NullMemberAccessPanic: null member access: .Nope` — a panic whose subject is wrong twice (the enum is not null; the fault is the variant) where the registered disposition is the parse-time E `theta/parse/unknown-variant`

- **Status:** fixed (0.423.0).
- **Sev/Diff estimate:** S2/D2 — S2: a drive-aborting runtime panic on an
  ordinary authoring typo the spec refuses statically (crash/abort where a
  load refusal is prescribed), compounded by a lying diagnostic (wrong
  mechanism, wrong subject, wrong phase). Not S1: the failure is loud —
  nothing wrong flows onward. D2: the natural fix is the same load-pass walk
  as [bug 0429](./0429-imported-schema-ctor-field-set-never-judged.md) (member-access sites whose target is an
  imported enum binding, judged against the materialised variant set the pass
  already carries), reusing the existing code; the runtime fall-through also
  wants a defect-belt guard so an unknown variant can never read the enum
  NAME as a value.
- **Kind:** defect — `docs/spec_topics/schemas.md:97`: "Unknown-variant
  references (`Severity.Critical` when no such variant exists) are
  `theta/parse/unknown-variant`", and the registry Trigger
  (`code-registry-parse.md:114`: "`Enum.Variant` reference where `Variant` is
  not a declared variant of `Enum`") carries no same-file qualifier and no
  imported carve-out; the implementation enforces the row for same-file enums
  only and gives the imported class a null-member panic. One root, two
  faces: **face 1** — the withheld static refusal for the imported class
  (measured end state: parse `[]`, load `[]`, theta registers); **face 2** —
  the runtime fall-through that fabricates a `null` target (measured end
  state: `NullMemberAccessPanic: null member access: .Nope`). Face 2 is not
  wholly derivative of face 1: a static walk fenced to directly-declared
  imports, or the shadowed-name defer arm, leaves face 2 reachable.
- **Related:**
  - [bug 0429](./0429-imported-schema-ctor-field-set-never-judged.md) — same skeleton (parse defers on imported
    members by FS-free design; the load pass holds the declaring data and
    never judges the theta's sites; runtime misbehaves), on the constructor
    field-set site. One root — `checkThetaImports` materialises the
    declaring data and walks no use sites other than imported-`fn` calls
    (`checkImportedFnCallArgs`); a single walk fixes both faces, which is
    why the reports are filed per mechanism, not per pass.
  - [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md)
    — fixed (0.109.0). OVERLAPS: shares the registry row
    (`theta/parse/unknown-variant`), the panic
    (`NullMemberAccessPanic`), and the information loss
    (`resolveEnumVariant` collapsing "unregistered enum" and "unknown
    variant on a registered enum" into one `undefined`). Its input class is
    the same-file `params:` default; neither position is in the other's
    reach. Its §Fix REJECTED the evaluator-guard route, and its
    code-identity adjudication is binding precedent here:
    declared-enum head + undeclared tail is `theta/parse/unknown-variant`,
    unresolvable head is `theta/parse/unknown-identifier` — no new code, no
    registry row edited.
  - [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md)
    — fixed (0.236.0). Its §Fix residual 2 ("Imported enums are outside
    `collectEnumNames` … An imported enum's variant access therefore keeps
    its pre-fix disposition; no witness row") is the nearest recorded
    prediction of this seam; §Fix below states whether that disposition
    moves.
  - [0306](./0306-imported-enum-drops-explicit-wire-values.md)
    — fixed (0.289.0). Established that `MaterializedImport` carries the full
    variant set (and wire values) to the runtime — the data a load-time check
    needs is already threaded.
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md)
    — fixed (0.141.0). Documented `NullMemberAccessPanic` as the unbound-
    import observable on enum variant access; this report shows the same
    panic still reachable for a BOUND, correctly-materialised enum when only
    the VARIANT is wrong.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) —
    fixed (0.199.0). Precedent for the classification: an ordinary authoring
    mistake surfacing only through a runtime-defect-flavoured channel is a
    defect against the registered static row, not an acceptable late error.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/theta-document.ts:9400–9418` — the body walk's `member` arm:
    `refs.enums.get(e.target.name)` answers `undefined` for an imported enum
    and the arm skips silently. Its map is fed by `hoistEnumVariants` over
    `body.statements` only (`:7894–7904`, hoisted at `:8262`) — same-file
    `enum` statements, imported enums absent by construction. The refusal it
    would have pushed is `checkVariantAccess`
    (`src/parser/schema-declarations.ts:315`).
  - `src/extension/import-static-checks.ts` — `checkThetaImports` materialises
    the imported enum's variants (`materializeSymbol`, `:250–264`) but walks
    no member-access sites; no check compares the theta's `Sev.X` spellings
    against the materialised variant set.
  - `src/runtime/statement-executor.ts:1105–1121` — the member arm; its enum
    short-circuit (`:1109–1113`, `resolveEnumVariant` at `:1111`) answers
    `undefined` for an unknown variant, and the arm FALLS THROUGH to
    evaluating the enum NAME as a value (`evaluateMemberAccess` at `:1120`).
  - `src/runtime/statement-executor.ts:1172` — the fall-through's ident tail:
    the non-checkpointed target read routes through `deps.host.evaluatePure`,
    whose pure-host `ident` arm answers `null` for a non-`local` resolution —
    the source of the fabricated `null` target.
  - `src/runtime/runtime-panics.ts:359` — `evaluateMemberAccess(null, field)`
    throws `NullMemberAccessPanic("null member access: .Nope")`.
  - `src/runtime/lexical-environment.ts:780–793` (`resolveEnumVariant`) —
    returns `undefined` for an unknown variant on a REGISTERED enum,
    indistinguishable to the caller from "not an enum at all".

## Summary

Same-file control: `enum Sev { Low }` + `Sev.Nope` draws
`error theta/parse/unknown-variant: unknown variant 'Nope' on enum 'Sev'` and
the theta does not register. The identical reference against the identical
declaration imported from a `.thetalib` parses clean (the FS-free parser has
no variant set to judge), loads clean (the load pass carries the variant set
but checks no sites), and at runtime the executor's enum short-circuit
misses, evaluates `Sev` itself as a value, gets `null` from the pure
evaluator's safety net, and panics `NullMemberAccessPanic` — aborting the
drive with a message that names a null target that is not null and never
names the actual fault (the variant).

## Reproduction

Offline at 04579e12; bug-0306 harness shape.

Control (same file):

```
enum Sev { Low }
let x = Sev.Nope
x
```

Observed parse:
`error theta/parse/unknown-variant: unknown variant 'Nope' on enum 'Sev'`.

Imported (lib `/proj/lib.thetalib` = `enum Sev { Low }`):

```
import { Sev } from "./lib.thetalib"
let x = Sev.Nope
x
```

Observed: app parse `[]`; load diagnostics `[]`; enum materialises
(`enum Sev`); executing the body throws:

```
NullMemberAccessPanic: null member access: .Nope
```

Both directions: the imported `Sev.Low` (valid variant) evaluates normally
(bug 0306's witness pins the wire), so the class is exactly the unknown
variant, not imported enums generally.

## Expected behaviour

- The registry contrast strengthens the reading: `code-registry-parse.md:115`
  (`unresolved-named-type`) spells its imported deferrals explicitly ("An
  imported symbol always defers at the constructor position …"), where the
  `unknown-variant` row at `:114` is bare — the corpus writes deferrals down
  when it means them, and wrote none here.
- `schemas.md:97` and `code-registry-parse.md:114` — unqualified: an
  `Enum.Variant` reference to an undeclared variant is the E-severity
  `theta/parse/unknown-variant`, message
  `unknown variant '<variant>' on enum '<enum>'`. The imported reference is
  the same reference shape against the same declaration.
- The corpus's settled pattern for imported halves of parse-tier rows is
  load-pass judgement once the resolved lib is a parsed document (the
  fn-arity rows, `code-registry-parse.md:148–149`); the variant set is
  already materialised (`MaterializedImport.variants`, threaded since bug
  0306).
- Runtime panics are the closed defect-adjacent list
  (`errors-and-results/error-model.md` §Runtime panics); an author typo owed
  a static E should not reach one, and a panic that does fire must name the
  actual condition.

## Actual behaviour / root cause

Three-layer miss: (1) the body walk's `member` arm
(`theta-document.ts:9400–9418`) skips when `refs.enums.get` misses, and its
map (`hoistEnumVariants`, `:7894–7904`) holds same-file enums only — parser
FS-free by design; (2) `checkThetaImports` materialises the variant set and
never judges the theta's member accesses against it; (3) the executor's
short-circuit (`statement-executor.ts:1109–1113`) treats
`resolveEnumVariant === undefined` as "not an enum access" rather than "bad
variant on a known enum", falling through to a value read of the enum name
(the ident tail at `:1172`, `deps.host.evaluatePure`), whose pure-host
`ident` arm converts the non-`local` resolution to `null`, so
`evaluateMemberAccess` panics on a fabricated null. `resolveEnumVariant` collapses "unknown enum"
and "unknown variant on a registered enum" into one `undefined`, which is the
information loss the fall-through then mis-narrates.

## Why it matters

- A one-character variant typo against a shared library enum — the exact
  spelling libraries exist for — aborts the whole drive at runtime with a
  message pointing at a null that does not exist, in production framed as a
  panic (`theta /<name> aborted…`) rather than a load refusal naming the
  variant. Debugging cost is disproportionate: the author reads "null member
  access" and inspects data flow, not the variant list.
- The same-file/imported asymmetry is the 0304-class refactor hazard: moving
  an enum into a `.thetalib` converts a precise static E into a runtime
  abort.

## Non-goals

- Valid-variant imported enum semantics (wire values, identity tags) — bugs
  0305/0306/0361, fixed and untouched.
- The generic "unbound import reads null" fall-through (0101, fixed
  surfaces); the enum here IS bound and materialised.
- Member access on imported SCHEMA values (`a.typo`) — structural access on
  branded values is a different rule set (no same-file parse refusal exists
  for it either, so no asymmetry witnessed).

## Fix

Options:

1. **Load-pass member-access walk** (recommended): in `checkThetaImports`,
   walk the importing body's member expressions whose target is an
   imported-enum binding (unshadowed — mirror `checkImportedFnCallArgs`'s
   `shadowedNames` arm) and emit `theta/parse/unknown-variant` against the
   materialised variant set, sited on the theta. Reuses the registered code
   and message (per 0185's binding code-identity adjudication: no new code);
   amend the registry row with the load-pass wiring sentence the fn rows
   carry. Naturally shared with [bug 0429](./0429-imported-schema-ctor-field-set-never-judged.md)'s constructor
   walk. This MOVES 0191 §Fix residual 2's recorded disposition for the
   unknown-variant half: an imported enum's variant access no longer "keeps
   its pre-fix disposition", and the fix should say so. A fix that narrows
   `resolveEnumVariant`'s collapsed `undefined` must leave 0185's
   params-position witnesses
   (`tests/params-default-enum-access-merge.test.ts`) unmoved.
2. **Runtime narrowing** (belt, complementary): make the executor's enum arm
   distinguish "registered enum, unknown variant" (panic or `fail` naming the
   variant and enum) from "not an enum" before falling through — so even
   laundered inputs (e.g. re-export chains a static walk might fence off)
   never fabricate a null-member panic. This alone leaves the static row
   withheld; not sufficient by itself. It must answer 0185 §Fix route (2)'s
   rejection rationale: this targets the ASYNC executor's arm
   (`statement-executor.ts:1109–1113`), not the shared pure-evaluator arm
   0185 declined to touch, and bug 0140 (0.122.0) has since landed.
3. **Spec-only** (pin the imported class as runtime-judged): rejected — it
   would bless a lying panic as the disposition for a class whose same-file
   twin has a precise E, and no current spec sentence supports the
   asymmetry.

## Provenance

imports-exports-2 bug-hunt sweep, 04579e12 (v0.415.0). Probe:
`tests/scratch-ie2-load-semantics.test.ts` (deleted after the run) — cells B1
(same-file control, code + message observed) and B2 (imported: parse `[]`,
load `[]`, `NullMemberAccessPanic: null member access: .Nope` thrown),
outputs quoted verbatim. Spec read: schemas.md §Variant access;
code-registry-parse.md:114; error-model.md §Runtime panics. No non-scratch
file modified.

## Fix (0.423.0)
- What shipped: `src/extension/invoke-static-checks.ts` — new `checkImportedEnumVariantAccess` walks the importing body's member expressions (a `memberExprs` collector added to the shared walk) whose target is an imported-enum binding (direct-declaration-only, `collectLocalBinderNames` shadow-defer) and emits `theta/parse/unknown-variant` (reusing the parser's own `checkVariantAccess` — no new code) sited on the theta (§Fix Option 1). `src/extension/import-static-checks.ts` — an `importedEnums` map populated beside `importedFns`/`importedSchemas`, the new checker wired after the schema-ctor push. `docs/spec_topics/diagnostics/code-registry-parse.md` row `theta/parse/unknown-variant` amended with the load-pass wiring, the re-export + lib-internal fences, and a GOV-15 note (DIAG-2).
- Gates: witness `tests/b0430-imported-enum-unknown-variant.test.ts` 5/5 green (B1 same-file control, B2 imported RED→green, B3 valid variant, B4 shadow-defer, B5 re-export fence); full default suite green (one machine-load hook-timeout flake, green isolated); `npm run typecheck` clean; `npm run lint` clean; bug 0185's witnesses (`params-default-enum-access-merge`, `params-default-unresolvable-enum-variant`) green; code-registry gate green. Live: shares the `b0428live` registration-refusal channel — WHY: 0430's refusal un-registers via the identical `invoke`-`Err` channel proven end-to-end by the new `b0428live` cell; the offline B1–B5 witnesses (verifier red-on-revert) cover the variant-specific behaviour and no model participates in variant judgement.
- Review: 1 round — R1 (bug-fix-reviewer): CLEAN (residuals: state the 0191 §Fix residual-2 move here; witness-comment line citations, non-blocking).
- Verification: SOLID — witness reds on fix revert (B2 loses the code), restores green; full suite green; typecheck+lint clean; `git diff -- src/runtime` EMPTY (Option 1 only; `resolveEnumVariant` untouched, so 0185's params-position witnesses are trivially preserved).
- Residuals: 1. Face-2 runtime belt (§Fix Option 2) NOT implemented: an unknown variant on a SHADOWED or RE-EXPORT-CHAIN imported enum (fenced by the static walk) still reaches the runtime `NullMemberAccessPanic` — a documented withhold per §Fix (Option 2 complementary, targeting `statement-executor.ts`, out of Option 1's scope). Evidence: the B5 fence + §Fix. 2. This fix MOVES bug 0191 §Fix residual-2's recorded disposition: an imported enum's unknown-variant access no longer "keeps its pre-fix disposition" — it now draws `theta/parse/unknown-variant` at the load pass. The closed 0191 doc is NOT edited (era-pinning); the move is recorded here per the §Fix instruction.
- Discharge notes appended: none (bug 0191 is a closed doc — era-pinning; the residual-2 move is recorded in this record rather than by editing 0191).
- Pinned dispositions / non-goals: Option 2 (runtime belt) complementary/deferred; Option 3 (spec-only) rejected; valid-variant imported-enum semantics (bugs 0305/0306) untouched; member access on imported SCHEMA values (a different rule set — non-goal).
