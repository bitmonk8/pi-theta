# Bug 0449 — An unknown variant on an enum reached through an `export … from` re-export chain (`import { Sev } from "./mid.thetalib"`, `mid` re-exporting `lib`'s `enum Sev { Low }`, then `Sev.Nope`) loads clean per the 0430 fix's stated direct-declaration fence and then aborts the drive at runtime as `NullMemberAccessPanic: null member access: .Nope` — the deferred face-2 runtime belt (0430 §Fix Option 2) is still absent, so the fenced class keeps a panic whose subject is wrong twice on a theta that REGISTERS

- **Status:** fixed (0.454.0).
- **Sev/Diff estimate:** S2/D2 — S2: a drive-aborting runtime panic on an
  ordinary authoring typo (crash/abort on registered, spec-legal-loading
  input), compounded by a lying diagnostic — the enum is not null (it is
  bound and materialised through the chain; the valid-variant control
  evaluates to its declared wire), and the fault is the variant, which the
  message never names. Loud, so nothing wrong flows onward — not S1. D2: the
  fix 0430 already scoped and deferred (its §Fix Option 2): narrow the ASYNC
  executor's enum short-circuit so "registered enum, unknown variant" fails
  naming the enum and variant instead of falling through to a fabricated null
  read; alternatively (or additionally) follow the chain in the static walk
  the way `materializeChain` already does.
- **Kind:** defect — the panic misattributes on both subject and mechanism
  against the error-model's own panic discipline, on an input class the
  registry row EXPECTS to reach runtime: `code-registry-parse.md:114` states
  the re-export withhold ("a specifier reached only through a re-export chain
  draws no variant verdict, a stated withhold"), so the static silence is
  adjudicated — but no sentence anywhere blesses `NullMemberAccessPanic`
  ("null member access: .Nope") as the runtime disposition for a bound,
  correctly-materialised enum whose VARIANT is wrong. 0430's fix record pins
  the withhold as "documented … per §Fix (Option 2 complementary, targeting
  `statement-executor.ts`, out of Option 1's scope)" — deferred, not
  rejected.
- **Related:**
  - 0430 (fixed 0.423.0) — the direct-import filing. Its §Fix (0.423.0)
    residual 1 names this class verbatim: "Face-2 runtime belt (§Fix Option 2)
    NOT implemented: an unknown variant on a SHADOWED or RE-EXPORT-CHAIN
    imported enum (fenced by the static walk) still reaches the runtime
    `NullMemberAccessPanic` — a documented withhold … Evidence: the B5 fence
    + §Fix." This report is that filing, with the chain face measured at the
    runtime terminal (0430's B5 pinned only the static `[]`).
  - 0185 (fixed 0.109.0) — the params-default position of the same panic.
    Its binding scope, precisely: its route-2 rejection is SCOPED to
    `evaluatePureExpression`'s shared member arm, on 0140-coordination
    grounds (the guard "would make it re-derive bug 0140's rows"; 0140
    landed at 0.122.0) — so it does NOT bind a belt at the ASYNC executor's
    arm (`statement-executor.ts:1105–1121`), a different function in a
    different module, which is exactly where 0430 §Fix Option 2 drafted the
    belt. What 0185 DOES constrain: its no-new-code adjudication
    (declared-enum head + undeclared tail is `theta/parse/unknown-variant`,
    no mint) and its params witnesses
    (`tests/params-default-enum-access-merge.test.ts`,
    `tests/params-default-unresolvable-enum-variant.test.ts`), which must
    stay unmoved if `resolveEnumVariant`'s collapsed `undefined` is split
    (0185 residual 1 left that split "recorded, not changed" — open, not
    pinned shut).
  - [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md)
    (fixed 0.236.0) — its §Fix residual 2 ("Imported enums are outside
    `collectEnumNames` … An imported enum's variant access therefore keeps
    its pre-fix disposition; no witness row") is the recorded prediction of
    this seam. 0430 §Fix residual 2 then MOVED that disposition for the
    DIRECT class only ("it now draws `theta/parse/unknown-variant` at the
    load pass. The closed 0191 doc is NOT edited (era-pinning)"); the
    re-export-chain class is the unmoved remainder, which this report is.
    0191 stays era-pinned and unedited.
  - 0305/0306 (fixed) — valid-variant chain semantics (identity tags, wire
    values) — the control plane here; untouched.
  - 0138 (fixed 0.235.0) — residual 1 established the re-export withhold
    pattern all three load walks share; this report does not contest the
    fence, only the runtime terminal behind it.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/runtime/statement-executor.ts:1105–1121` — the member arm's enum
    short-circuit: `env.resolveEnumVariant(expr.target.name, expr.field)`
    (`:1111`) answers `undefined` for an unknown variant on a REGISTERED
    enum, indistinguishable from "not an enum at all", and the arm FALLS
    THROUGH to evaluating the enum NAME as a value (`:1117–1120`).
  - `src/runtime/lexical-environment.ts:780` — `resolveEnumVariant` collapses
    "unregistered enum" and "unknown variant on a registered enum" into one
    `undefined` (the information loss 0185 first named, still present).
  - `src/runtime/runtime-panics.ts:359` — `evaluateMemberAccess(null, field)`
    throws `NullMemberAccessPanic("null member access: .Nope")` on the
    fabricated null the ident fall-through produces.
  - `src/extension/invoke-static-checks.ts` (`checkImportedEnumVariantAccess`,
    `:1598` region) + `src/extension/import-static-checks.ts:1211–1222`
    (`importedEnums` populated for DIRECT declarations only) — the stated
    fence that leaves this class to the runtime.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:114` (the stated
    withhold); `docs/spec_topics/schemas.md:97` ("Unknown-variant references
    … are `theta/parse/unknown-variant`", no chain qualifier);
    `docs/spec_topics/errors-and-results/error-model.md` §Runtime panics.
- **Observed at:** v0.437.0 (401a425b). Offline, deterministic: scratch
  vitest, bug-0306 harness shape with real `executeBody`. Scratch deleted.

## Summary

The 0430 fix judges imported unknown-variant references at the load pass for
DIRECTLY-declared imports only; the registry row states the re-export
withhold. The withheld class therefore registers and reaches the runtime,
where the executor's enum short-circuit treats `resolveEnumVariant`'s
`undefined` as "not an enum access", evaluates the enum NAME as a value, gets
`null` from the pure host's non-`local` ident safety net, and panics
`NullMemberAccessPanic: null member access: .Nope` — aborting the drive with
a message that names a null that does not exist and never names the variant.
0430 shipped Option 1 (the static walk) and explicitly deferred Option 2 (the
runtime belt) as complementary; this filing is the deferred half, now the
only reachable route to the lying panic from legal source through the
ordinary import surface.

## Reproduction

Offline at 401a425b; frontmatter `model: "sonnet"`, `mode: prompt`.

### R1 — plain chain

```
/proj/mid.thetalib   export { Sev } from "./lib.thetalib"
/proj/lib.thetalib   enum Sev { Low }
app                  import { Sev } from "./mid.thetalib"
                     let x = Sev.Nope
                     x
```

Observed: parse `[]`; load `[]`; `enum Sev` materialises (the chain
delivers); executing the body throws
`NullMemberAccessPanic: null member access: .Nope`. In production framing
this is a registered theta whose drive aborts
(`theta /<name> aborted: null member access: .Nope`).

### R2 — renamed chain (`export { Sev as Level }`, `Level.Nope`)

Same terminal: `NullMemberAccessPanic: null member access: .Nope` (`enum
Level` materialises).

### R3 — control (valid variant through the same chain)

`Sev.Low` against `enum Sev { Low = "low" }` through the same `mid` →
wire `"low"`. The chain materialisation is sound; the class is exactly the
unknown variant.

Both directions at the static tier: the direct-import spelling of R1's typo
draws `error theta/parse/unknown-variant: unknown variant 'Nope' on enum
'Sev'` at load (0430's fix, re-verified green in this sweep's harness runs).

## Expected behaviour

- error-model.md §Runtime panics: panics are the closed defect-adjacent
  list, and a panic that fires must name the actual condition. "null member
  access: .Nope" asserts a null target; R3 proves the target is a bound,
  materialised enum. The actual condition — unknown variant `Nope` on enum
  `Sev` — is named by a registered code the same reference draws in every
  unfenced position.
- `schemas.md:97` prescribes `theta/parse/unknown-variant` for the reference
  class with no chain qualifier; the registry row's withhold sentence
  (`code-registry-parse.md:114`) adjudicates the STATIC silence only — it
  describes where the load walk stops, not what the runtime may then say.
- 0430 §Fix Option 2 states the owed behaviour: the executor's enum arm
  distinguishes "registered enum, unknown variant" (fail naming the variant
  and enum) from "not an enum" before falling through, "so even laundered
  inputs (e.g. re-export chains a static walk might fence off) never
  fabricate a null-member panic."

## Actual behaviour / root cause

Unchanged from 0430's face-2 analysis, now the sole reachable route:
`resolveEnumVariant` (`lexical-environment.ts:780`) returns one `undefined`
for two distinct conditions; the async member arm
(`statement-executor.ts:1105–1121`) reads `undefined` as "fall through",
evaluates `Sev` as a value through the non-checkpointed ident tail, the pure
host answers `null` for the non-`local` resolution, and
`evaluateMemberAccess` panics (`runtime-panics.ts:359`). The static walk that
would have pre-empted it is fenced to direct declarations
(`import-static-checks.ts:1211–1222`), per the registry's stated withhold.

## Why it matters

- A one-character variant typo against a re-exported library enum — the
  facade pattern re-exports exist for — aborts the whole drive at runtime
  with a message pointing at a non-existent null. The debugging cost is the
  0430 rationale unchanged: the author reads "null member access" and
  inspects data flow, not the variant list.
- The asymmetry is now THREE-way: same-file → parse E naming the variant;
  direct import → load E naming the variant; one re-export hop → runtime
  abort naming a null. Inserting a facade lib between a theta and its enum
  silently downgrades a precise static refusal into a lying panic.
- The shadow face of the same fence (a local `let Sev` shadowing the import,
  then `Sev.Nope`) is narrower: parse-tier rows (`binding-case-mismatch`,
  `unknown-method`) already fire on that spelling, so the chain face is the
  clean production route.

## Non-goals

- The static re-export fence itself — adjudicated in the registry row and in
  0138/0429/0430 uniformly; whether to close it by following
  `materializeChain`'s chain is a fix OPTION here, not a contested
  disposition.
- Valid-variant chain semantics (0305/0306) — control plane, untouched.
- The pure evaluator's params-default position (0185, fixed) — any belt must
  leave `tests/params-default-enum-access-merge.test.ts` unmoved, per 0430
  §Fix's own constraint.
- Member access on schema values / null-producing non-enum targets — the
  panic is correct for genuinely-null targets; only the registered-enum
  fall-through is claimed.

## Fix

Options (0430 §Fix Option 2, now primary):

1. **Runtime belt** (recommended): narrow the async executor's enum
   short-circuit — when `expr.target` is a non-`local` ident that names a
   REGISTERED enum (the environment can answer this: the registration exists;
   only the variant misses), fail loudly naming the enum and variant (per
   0185's adjudication the natural carrier is the `unknown-variant`
   code/message text on the runtime failure channel, no new code) instead of
   falling through to the value read. Carrying a `theta/parse/*` code on the
   RUNTIME failure channel is a phase/registry-shape decision (DIAG-2) the
   fixer must adjudicate — flagged, not settled here. Requires splitting
   `resolveEnumVariant`'s collapsed `undefined` (e.g. a lookup that
   distinguishes "no such enum" from "enum without that variant"), which
   0185's params witnesses must survive unchanged. 0430's B5 fence cell
   (chain withholds statically) stays green either way — the belt sits
   behind it, not in it.
2. **Follow the chain in the static walk**: populate `importedEnums` through
   `materializeChain`'s own resolution so the chain class draws the load E
   like the direct class. Closes R1/R2 but moves the three fences' stated
   direct-only symmetry (0138/0429/0430 registry sentences) — a wider
   adjudication; and the shadow face still needs the belt. Complementary,
   not a substitute.
3. **Spec-pin the panic**: rejected — blesses a diagnostic that misstates
   both subject and mechanism, against the error-model's panic discipline.

## Provenance

import-intake-6 bug-hunt sweep, 401a425b (v0.437.0). Origin: bug 0430 §Fix
(0.423.0) residual 1 (documented withhold, Option 2 "complementary/deferred",
not rejected). Probe: `tests/scratch-ii6-intake.test.ts` (deleted) — cells
C1/C2/C3, outputs quoted verbatim. Spec read: schemas.md:97;
code-registry-parse.md:114; error-model.md §Runtime panics. No non-scratch
file modified.

## Fix (0.454.0)

- What shipped:
  - `src/runtime/lexical-environment.ts` — added the ADDITIVE
    `isRegisteredEnum(name)` (root-scope registration lookup) that splits
    `resolveEnumVariant`'s collapsed `undefined` WITHOUT changing that method's
    contract, so 0185's params witnesses (pure-host arm) stay unmoved.
  - `src/runtime/statement-executor.ts` — §Fix Option 1 (runtime belt): in the
    async `member` arm's enum short-circuit, after `resolveEnumVariant` misses
    on a non-`local` ident, if `isRegisteredEnum(target.name)` is true the arm
    throws `UnknownVariantDefectError` naming the ACCESS-SITE enum spelling and
    the variant with the reused `unknown variant '<variant>' on enum '<enum>'`
    text, instead of falling through to the value read that fabricated a `null`
    and panicked `NullMemberAccessPanic`. A genuinely non-enum ident still
    falls through (the panic is correct for genuine nulls — §Non-goal).
  - Carrier adjudication (DIAG-2, delegated to the fixer by §Fix; documented in
    the belt's doc-comment): `UnknownVariantDefectError` is a PLAIN `Error`
    (NOT a `ThetaPanic` — the V1 panic list is closed, error-model.md §Runtime
    panics — and NOT the lying `NullMemberAccessPanic`), so it propagates
    uncaught and is reframed by `surfaceUnexpectedThrow` to
    `theta/runtime/internal-error` exactly as the `IndexKindDefectError` /
    `RejectedWriteDefectError` belts are (the standing belt law,
    0332/0338/0365/0370 family: loud, undecorated, no new registry row). No new
    diagnostic code minted (0185's no-new-code adjudication); no registry edit.
- Gates:
  - Witness: `npx vitest run tests/b0449-reexport-chain-enum-unknown-variant.test.ts`
    → 4 passed (C1 plain chain, C2 renamed chain now name enum+variant and no
    longer panic null; C3 valid-variant control, C4 direct-static fence).
  - Full suite: `npm test` → 611 files / 10684 tests, 0 real failures (two
    off-surface suites — invoke-arg-type-mismatch-wired, production-tools-load-
    resolution — hook-timed-out under parallel load, both green isolated:
    recorded parallel-load noise, not on the runtime surface).
  - Typecheck: `npm run typecheck` clean. Lint: `npm run lint` clean.
  - Live: `tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts`
    → 1/1 green through the real host (H8a). Adjacent witness (recorded WHY):
    it drives VALID re-export-chain-forwarded enum member accesses (`Sev.Low`)
    through the exact async executor enum member arm this belt modifies, so a
    green run witnesses the belt insertion did not regress live valid-variant
    resolution; the belt fires only on the unknown-variant defect path no live
    cell exercises, and the offline b0449 witness pins that path
    deterministically through the same production `executeBody` seam.
- Review: 1 round + 1 comment-only polish.
  - Round 1 (bug-fix-reviewer, deep): F1 (prose) — the carrier-adjudication
    comment mis-attributed belt-law to CLAUDE.md (which carries no belt-law);
    everything else verified clean (belt guards, production surfacing traced,
    additive split, access-site spelling, 0185/0430 fences, full suite green).
  - Polish (bug-fix-fixer-light): F1 corrected to cite the 0332/0338/0365/0370
    lineage. Polish verified by gate-diff (comment-only, gates green);
    confirmation review round skipped.
- Verification: bug-fix-verifier SOLID.
  - Witness genuinely witnesses: neutralising the belt reds C1/C2 with the
    exact `NullMemberAccessPanic: null member access: .Nope` pin; byte-exact
    restore → 4 green.
  - Full default suite green (10684; the two hook-timeouts green isolated).
  - Lint + typecheck clean.
  - 0185 (params-default ×2, pure-host arm) and 0430 (static B5 fence) unmoved.
  - Live obligation discharged by the orchestrator (b0342live adjacency above).
- Residuals: none blocking.
  1. §Fix Option 2 (follow the chain in the static walk to draw the LOAD E for
     the chain class, like the direct class) is NOT implemented — the recommended
     Option 1 belt is the shipped, sufficient fix for the runtime terminal; the
     static direct-only symmetry (0138/0429/0430 registry sentences) is left
     intact per §Non-goals ("whether to close it by following materializeChain
     is a fix OPTION here, not a contested disposition"). The shadow face (a
     local `let Sev` shadowing then `Sev.Nope`) is already covered by parse-tier
     rows (§Why-it-matters) and is arm==="local", skipping the belt.
- Discharge notes appended: none. Bug 0430 §Fix (0.423.0) residual 1 named this
  class (Face-2 belt deferred); the closed 0430 doc and 0191 (era-pinned) are
  not edited (no parent ratification for a dated note).
- Pinned dispositions / non-goals: The 0422/0423 directly-imported-only chain
  deferral (per the dispatch's note) shares the "re-export chain launders past
  a direct-only static fence" SKELETON with this bug but is a DIFFERENT surface
  — 0422/0423 is the LOAD-pass system-interp imported-SCHEMA static walk, this
  is the RUNTIME async enum member arm. 0449's belt (Option 1) touches no static
  walk, so it neither discharges nor develops the 0422/0423 chain deferral; the
  two remain distinct gaps. Valid-variant chain semantics (0305/0306), the
  pure-host params-default position (0185), and member access on genuinely-null
  non-enum targets all remain untouched, exactly as §Non-goals states.
