---
id: PTQ-1453
title: with-clause prompt-mode refusal and cwd check orchestrated twice across invoke call surfaces
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/invoke-expr-call-surface.ts:281-305
  - src/extension/invoke-static-checks.ts:410-440
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# with-clause prompt-mode refusal and cwd check orchestrated twice across invoke call surfaces

## Observation
Both load-time invoke call surfaces — the literal `invoke(...)` surface in `checkInvokeExprCallSurface` and the `.theta`-callable surface in `checkThetaCallableCallSurface` — run the same two-step RFC 0009 clause orchestration: first call `withClausePromptModeRefusal` and, only when it returns no refusal, call `checkClauseCwdType`. The two blocks are structurally identical; only the variable names and the `surface` discriminator differ. The shared helpers live in `../parser/invoke-diagnostics` and `../parser/with-clause-static-checks`, but the sequencing logic and the `clauseRefused` state flag are duplicated in each caller.

## Evidence
Location 1 — `src/extension/invoke-expr-call-surface.ts:281-305` (inside `checkInvokeExprCallSurface`):

```ts
    const clauseRefusal = withClausePromptModeRefusal({
      ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
      mode: arity?.mode,
      file: site.file,
      range: site.range,
      presented: invoke.path,
    });
    let clauseRefused = false;
    if (clauseRefusal !== undefined) {
      diagnostics.push(clauseRefusal);
      clauseRefused = true;
    }
    // ... followed at 293-305 by `if (!clauseRefused) { ...checkClauseCwdType({
    //    surface: { kind: "invoke", providedCount }, ... }) }`
```

Location 2 — `src/extension/invoke-static-checks.ts:410-440` (inside `checkThetaCallableCallSurface`):

```ts
    const clauseRefusal = withClausePromptModeRefusal({
      ...(site.call.withClause !== undefined ? { clause: site.call.withClause } : {}),
      mode: arity.mode,
      file: callerPath,
      range: site.call.range,
      presented: site.name,
    });
    let clauseRefused = false;
    if (clauseRefusal !== undefined) {
      diagnostics.push(clauseRefusal);
      clauseRefused = true;
    }
    // ... followed at 432-440 by `if (!clauseRefused) { ...checkClauseCwdType({
    //    surface: { kind: "theta-callable", name: site.name }, ... }) }`
```

Diff verdict: renamed-only / type-2 clone. The control flow (`const clauseRefusal`, `let clauseRefused = false`, `if (clauseRefusal !== undefined) push+set`, `if (!clauseRefused) push cwd check`) is byte-identical. Differences are limited to identifier renames (`invoke` → `site.call`, `invoke.path` → `site.name`), the optional chaining on `arity?.mode` versus the guarded `arity.mode`, and the `surface` discriminator value. The clone-scan map lists no group for this pair; it is below the token-window floor.

## Why this is a problem
This is load-bearing duplication, not incidental similarity. Both surfaces must apply INV-8 (prompt-mode clause refusal) and INV-6 (cwd type judgement) with the same precedence and the same short-circuit rule. If one surface is changed — for example, to check cwd even after a prompt-mode refusal, to reorder the checks, or to add a third clause guard — the other surface will silently enforce a different policy. The existing comments in both files explicitly call out the cross-surface symmetry, which is evidence that maintainers already treat the two blocks as a single rule that must be kept in step.

## Suggested direction (non-binding, optional)
A natural shared home is `../parser/with-clause-static-checks.ts` or a small new helper in `src/extension/` that takes the surface-specific inputs (`clause`, `mode`, `presented`, `surface` discriminator) and returns the concatenated clause diagnostics. Both call surfaces would then delegate the orchestration to that helper and keep only their surface-specific argument assembly.

## False-positive check
- Re-read both cited ranges immediately before filing; both copies are live production code (not dead, not tests, not generated).
- Verified the clone-scan map has no group for this pair; this is a hand-diffed type-2 clone below the scanner token window.
- Confirmed the shared helpers (`withClausePromptModeRefusal`, `checkClauseCwdType`) centralise the actual decision logic, but the sequencing/conditional logic is duplicated in the two callers.
- Checked git history: commit `482e8bcf` synchronized the import source of `withClausePromptModeRefusal` across both files, supporting the claim that the two blocks are maintained as a pair.
- Searched already-filed issues; no existing issue tracks this specific duplicated clause orchestration (PTQ-1421 covers callee classification parallel, not this clone).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim at invoke-expr-call-surface.ts:281-305 and invoke-static-checks.ts:420-442 (2-line drift on the second); clone-scan map lists no group for the host, hand-diff confirms a renamed-only clone of the refusal→flag→guarded-cwd-check sequence (`site.file`/`site.range` are `callerPath`/`invoke.range` per line 190, so the only real differences are the `surface` discriminator, `presented`, and `arity?.mode` vs the already-narrowed `arity.mode`); both copies are live (called from invoke-static-checks.ts:773 and :795); `withClausePromptModeRefusal` (invoke-diagnostics.ts:401) and `checkClauseCwdType` (with-clause-static-checks.ts:38, exported :333) have no other callers; the stated breakage is real — invoke-static-checks.ts:414-416 says the theta-callable arm "exists so the gate is uniform across both clause-bearing surfaces", so the INV-8→INV-6 precedence/short-circuit is a single rule kept in step by hand; not a duplicate of resolved PTQ-1421 (callee classification passes in with-clause-static-checks.ts, different root cause); fix is a mechanical dedupe into one clause-orchestration helper (triage: claude-fable-5-1)
