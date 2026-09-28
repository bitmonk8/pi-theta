---
id: PTQ-1551
title: The pure host's `member` arm (evaluatePureExpression) has no bug-0449 registered-enum belt, so an unknown variant on a re-export-chain enum reached through the pure path panics `NullMemberAccessPanic`, while the executor's `resolveEnumMemberRead` throws `UnknownVariantDefectError` for the same access
lens: D6
status: open
verdict: confirmed
locations:
  - src/runtime/pure-expression-evaluator.ts:122-147
  - src/runtime/par-for-executor.ts:246-247
  - src/runtime/statement-executor.ts:589-613
  - src/runtime/lexical-environment.ts:772-779
  - src/runtime/executor-defects.ts:217-251
sites: 2
fix_scope: module
d6_class: posture-divergence
d6_anchor: docs/bugs/0449-reexport-chain-enum-unknown-variant-null-panic.md §Fix (0.454.0) / executor-defects.ts UnknownVariantDefectError carrier adjudication — "NOT `NullMemberAccessPanic` (the lying carrier this belt exists to avoid)"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# The pure host's `member` arm (evaluatePureExpression) has no bug-0449 registered-enum belt, so an unknown variant on a re-export-chain enum reached through the pure path panics `NullMemberAccessPanic`, while the executor's `resolveEnumMemberRead` throws `UnknownVariantDefectError` for the same access

## Observation
There are two `Enum.Variant` member-read paths in src/runtime: the async executor's `resolveEnumMemberRead` (statement-executor.ts) and the pure host's `case "member"` (pure-expression-evaluator.ts). Both call `env.resolveEnumVariant(...)` first and get back one `undefined` for two different conditions. The bug 0449 fix made the executor check `env.isRegisteredEnum` after that miss and throw `UnknownVariantDefectError` ("unknown variant 'Nope' on enum 'Sev'"). The pure host has no such check. On the same miss it falls through, evaluates the enum name as a value (the `ident` arm returns `null` for a non-local resolution), and `evaluateMemberAccess(null, field)` throws `NullMemberAccessPanic`. That is the carrier the 0449 ruling calls a lie. `isRegisteredEnum` has exactly one caller in src/, and it is the executor.

## Evidence
**Divergent side: pure host, no registered-enum check.** src/runtime/pure-expression-evaluator.ts:122-147 (excerpt 122-130, 141-146):
```ts
    case "member": {
      // `Enum.Variant` access: a member on an identifier that names a registered
      // enum (not a local binding) is a pure enum-value read, NOT a generic
      // member access on a null target (runtime-value-model.md, enum row).
      if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
        const variant = env.resolveEnumVariant(expr.target.name, expr.field);
        if (variant !== undefined) {
          return variant;
        }
      }
      ...
      {
        const target = evaluatePureExpression(expr.target, env, chain);
        try {
          return evaluateMemberAccess(target, expr.field);
        } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
```
The fall-through value comes from src/runtime/pure-expression-evaluator.ts:100-103:
```ts
    case "ident": {
      const resolution = env.resolve(expr.name);
      return resolution.arm === "local" ? resolution.value ?? null : null;
    }
```

**One shipped route into it: the `par for` iterand pure shortcut.** src/runtime/par-for-executor.ts:246-247:
```ts
  if (deps.host.checkpointFor(expr.iterand) === null) {
    iterandValue = deps.host.evaluatePure(expr.iterand, env, deps.invokeChain);
```

**Sibling side: executor, has the belt.** src/runtime/statement-executor.ts:597-613 (inside `resolveEnumMemberRead`, 589-613):
```ts
  if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
    const variant = env.resolveEnumVariant(expr.target.name, expr.field);
    if (variant !== undefined) {
      return { flow: "value", value: variant };
    }
    // Bug 0449: `undefined` is ambiguous ("not an enum" vs "registered enum,
    // unknown variant") by `resolveEnumVariant`'s own collapsed contract
    // ...
    if (env.isRegisteredEnum(expr.target.name)) {
      throw new UnknownVariantDefectError(expr.target.name, expr.field);
    }
  }
```

**The split lookup built for this.** src/runtime/lexical-environment.ts:772-779:
```ts
   * Whether `name` is a registered top-level or imported `enum` — bug 0449's
   * additive split of `resolveEnumVariant`'s collapsed `undefined`. A caller
   * that needs to tell "no such enum" apart from "enum without that variant"
   * (the async executor's belt) checks this FIRST, rather than widening
   * `resolveEnumVariant`'s own return shape, so 0185's params witnesses
   * (which drive the pure-host member arm, untouched here) stay unmoved.
   */
  public isRegisteredEnum(name: string): boolean {
```

**Anchor, quoted verbatim.** src/runtime/executor-defects.ts:232-233 (the `UnknownVariantDefectError` doc-comment):
```
 * Carrier adjudication (DIAG-2): NOT a new `ThetaPanic` subclass and NOT
 * `NullMemberAccessPanic` (the lying carrier this belt exists to avoid) — the
```
docs/bugs/0449-reexport-chain-enum-unknown-variant-null-panic.md:220-221:
```
3. **Spec-pin the panic**: rejected — blesses a diagnostic that misstates
   both subject and mechanism, against the error-model's panic discipline.
```

**Witness, run in this session.** A scratch vitest file under $TEMP (config at `$TEMP/tmp.JcPhZZfKIP/vitest.config.mjs`). It used the shipped `bindImportedBody` (tests/helpers/thetalib-load-harness.ts) and the real `executeBody`, with the b0449 fixtures `lib.thetalib = "enum Sev { Low }"` and `mid.thetalib = 'export { Sev } from "./lib.thetalib"'`. Output:
```
"import { Sev } from \"./mid.thetalib\"\nlet x = Sev.Nope\nx\n"                          {"parse":[],"load":[],"r":"throw UnknownVariantDefectError: unknown variant 'Nope' on enum 'Sev'"}
"import { Sev } from \"./mid.thetalib\"\nlet x = par for s in [Sev.Nope] { s }\nx\n"     {"parse":[],"load":[],"r":"throw NullMemberAccessPanic: null member access: .Nope"}
"import { Sev } from \"./mid.thetalib\"\nlet a = [Sev.Nope]\nlet x = par for s in a { s }\nx\n" {"parse":[],"load":[],"r":"throw UnknownVariantDefectError: unknown variant 'Nope' on enum 'Sev'"}
```
The access `Sev.Nope` is the same, against the same bound enum, and both runs load clean. The panic depends only on which host evaluates it. Written inline as the `par for` iterand, it takes the pure path and panics `NullMemberAccessPanic`. Bound through a `let` first, it goes through the executor and throws `UnknownVariantDefectError`.

**Sibling-class argument (mechanical).** Both sites handle the same condition: a non-`local` identifier target, then `resolveEnumVariant(...) === undefined`, on a name for which `isRegisteredEnum` is true (a registered enum with an unknown variant). Both sites run the same first step on the same `LexicalEnvironment` and branch on the same `undefined`. They differ only in what follows the miss. The executor fails closed with the adjudicated carrier. The pure host falls through to a fabricated `null` and the `ThetaPanic` that the ruling rejected. The two carriers also route differently: `UnknownVariantDefectError` is a plain `Error` that is reframed to `theta/runtime/internal-error`, while `NullMemberAccessPanic` is a `ThetaPanic` that `isThetaPanic` boundaries treat as a genuine panic.

## Why this is a problem
The 0449 ruling sets the intended posture for this condition. A registered-enum unknown variant must fail naming the enum and the variant, and must never produce the fabricated-null `NullMemberAccessPanic` ("the lying carrier this belt exists to avoid"; "Spec-pin the panic: rejected"). The shipped belt covers one of the two member-read hosts. The same laundered input therefore still produces the rejected carrier whenever it is evaluated through the pure host, and the witness shows this for the `par for` iterand. The error message still names a null target that does not exist and does not name the faulting variant, which is exactly what bug 0449 set out to remove.

## Suggested direction (non-binding, optional)
Apply the existing `isRegisteredEnum` split in the pure host's `member` arm as well, so both hosts produce the same carrier for this condition. Check against 0185's params witnesses as the 0449 fix did.

## False-positive check
- **EXST-9 / PIC-73 class check:** neither site is a sink call, a producer hook, or a degrade-silent optional capability. Both are in-body expression evaluation. Not exempt.
- **allow-broad-catch token check:** the pure arm's catch carries `allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)`. It only attaches a site and re-throws, so it does not swallow anything. The divergence is the missing `isRegisteredEnum` branch before the value read, not the catch. The executor's member catch carries the same token and has the same re-raise handling.
- **Stated-rationale check:** lexical-environment.ts:772-777 and the bug 0449 §Fix say the additive split was chosen so that "0185's params witnesses (pure-host arm) stay unmoved". Bug 0449 §Non-goals says "any belt must leave tests/params-default-enum-access-merge.test.ts unmoved". So the rationale constrains which witnesses must not move. It does not endorse `NullMemberAccessPanic` on the pure host, which the same doc rejects as a disposition. The registered-enum cells in tests/params-default-unresolvable-enum-variant.test.ts that name an unknown variant are all load-time `theta/parse/*` refusals (A1-A8, F2, F3) or valid variants (B1, B2, F1). tests/params-default-enum-access-merge.test.ts drives valid variants (`Sev.High`, `Sev.A`). No cell reaches the pure-host member arm at runtime with a registered enum and an unknown variant, so a belt that fires only on that condition has no witness it could move. No other comment near either site gives a reason for the pure host keeping the null fall-through.
- **Sibling-reality check:** `grep -rn "isRegisteredEnum(" src` returns 2 hits: the definition at lexical-environment.ts:779 and the sole caller at statement-executor.ts:611. `grep -rln "UnknownVariantDefectError" src` returns 2 files (executor-defects.ts, statement-executor.ts; 4 line hits in total). `grep -rln "0449" docs/bugs` returns 3 files (the 0449 doc, 0465, README), and none of them records a follow-up for the pure host. The divergence reproduces at HEAD in the scratch witness above.
- **Already-filed check:** none of the listed PTQ, intake, or rejection entries covers the enum member arm. PTQ-1535 mentions `UnknownVariantDefectError` only in a class-placement count, which is a different topic.

## Triage
verdict: confirmed — every excerpt matches at the cited lines (pure-expression-evaluator.ts:100-147 has no isRegisteredEnum check after the resolveEnumVariant miss; statement-executor.ts:597-613 throws UnknownVariantDefectError; par-for-executor.ts:246-247 sends a non-checkpointed iterand to evaluatePure). The stated searches reproduce: isRegisteredEnum( has 2 hits (def :779, sole caller :611); UnknownVariantDefectError appears in 2 files with 4 hits; 0449 appears in 3 bug docs. My own scratch vitest run under $TEMP reproduces all three rows exactly: plain let gives UnknownVariantDefectError, `par for s in [Sev.Nope]` gives NullMemberAccessPanic, and let-bound then par for gives UnknownVariantDefectError. The anchor holds: the executor-defects.ts:232-233 carrier adjudication and bug 0449 §Fix option 3 ('Spec-pin the panic: rejected') cover the registered-enum unknown-variant condition, not one host. The only stated rationale for leaving the pure arm alone is 0185's route-2 rejection, which 0449 itself says rested on 0140 coordination, and 0140 has been fixed since 0.122.0. 0449's other constraint (0185's params witnesses stay unmoved) limits which witnesses may move but does not endorse the panic. 0449 also calls the async arm 'the sole reachable route', and the par-for witness shows that is wrong. No PTQ or intake file tracks this (triage: claude-opus-5-5)
