---
id: PTQ-1104
title: with-clause-prompt-mode-gate.ts header says both callers live in invoke-static-checks.ts, but the invoke(...) surface caller moved to invoke-expr-call-surface.ts
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/with-clause-prompt-mode-gate.ts:1-13
  - src/extension/invoke-expr-call-surface.ts:23-24,353,483-489
  - src/extension/invoke-static-checks.ts:126,723,749-764,1215
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# with-clause-prompt-mode-gate.ts header says both callers live in invoke-static-checks.ts, but the invoke(...) surface caller moved to invoke-expr-call-surface.ts

## Observation
`with-clause-prompt-mode-gate.ts`'s module header states that `withClausePromptModeRefusal` is called by "the one decision both clause-bearing call surfaces inside `checkInvokeStaticResolution` (./invoke-static-checks.ts) apply identically — the inline `invoke(...)` loop and the delegated `.theta`-callable loop (`checkThetaCallableCallSurface`)", and adds "invoke-static-checks.ts imports it back like any other caller" (singular file). At HEAD one of the two callers — the `invoke(...)` expression surface — is no longer inline inside `checkInvokeStaticResolution` in `invoke-static-checks.ts`; it was relocated, along with its own call to `withClausePromptModeRefusal`, into `checkInvokeExprCallSurface` in a separate module, `src/extension/invoke-expr-call-surface.ts`, by a later commit than the one that wrote this header.

## Evidence

`src/extension/with-clause-prompt-mode-gate.ts:1-13`:
```ts
// RFC 0009 (invocation.md INV-8 static mode gate) — the call-site `with`
// clause's mode-gate refusal: the one decision both clause-bearing call
// surfaces inside `checkInvokeStaticResolution` (./invoke-static-checks.ts)
// apply identically — the inline `invoke(...)` loop and the delegated
// `.theta`-callable loop (`checkThetaCallableCallSurface`).
//
// PTQ-0364: split into its own module rather than living beside its two
// callers — invoke-static-checks.ts is over the D4 justify band (1000 LOC),
// so a helper shared only within that file is never grown there. This
// module holds `withClausePromptModeRefusal` alone; invoke-static-checks.ts
// imports it back like any other caller. `checkClauseCwdType`, the sibling
// INV-6 rule this mirrors (the clause's `cwd` value), stays behind in
// invoke-static-checks.ts, unmoved by this change.
```

`src/extension/invoke-expr-call-surface.ts:23,353,483-489` (the `invoke(...)` expression surface's own caller, now in a different file):
```ts
import { withClausePromptModeRefusal } from "./with-clause-prompt-mode-gate";
...
export async function checkInvokeExprCallSurface(
...
    const clauseRefusal = withClausePromptModeRefusal({
      ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
      mode: arity?.mode,
      file: site.file,
      range: site.range,
      presented: invoke.path,
    });
```

`src/extension/invoke-static-checks.ts:126,723,749-758,1215` (the `.theta`-callable surface's caller, still in this file, and the exported entry point `checkInvokeStaticResolution` that now delegates the `invoke(...)` surface out to the other module instead of running an inline loop):
```ts
import { withClausePromptModeRefusal } from "./with-clause-prompt-mode-gate";
...
async function checkThetaCallableCallSurface(
...
    const clauseRefusal = withClausePromptModeRefusal({
...
export async function checkInvokeStaticResolution(
```
`invoke-static-checks.ts` imports `checkInvokeExprCallSurface` from `invoke-expr-call-surface.ts` (line 147) and calls it at line 1271 inside `checkInvokeStaticResolution`, rather than running an inline `invoke(...)` loop itself.

Search: `grep -n "withClausePromptModeRefusal" src/**/*.ts` — 2 call sites total, one per file (`invoke-static-checks.ts:758`, `invoke-expr-call-surface.ts:483`); `grep -n "withClausePromptModeRefusal" src/extension/invoke-static-checks.ts` returns only the `.theta`-callable arm's call, not a second, inline `invoke(...)` loop call in the same file.

Git history: `with-clause-prompt-mode-gate.ts` was added by commit `9b7dc6a7` ("quality: qw20260917045205 fix src/extension"). `invoke-expr-call-surface.ts` was created later the same day by commit `f7aae3fc` ("quality: qw20260917154546 fix d9/src__extension__invoke-static-checks.ts", `git show --stat` shows 414 lines removed from `invoke-static-checks.ts` and 435 added to the new `invoke-expr-call-surface.ts`). That commit did not touch `with-clause-prompt-mode-gate.ts`, so its header's caller-location claim was left describing the pre-split layout.

## Why this is a problem
The header's claim that both callers sit "inside `checkInvokeStaticResolution` (./invoke-static-checks.ts)" and that "invoke-static-checks.ts imports it back like any other caller" (singular) misnames the current collaborator for the `invoke(...)` surface: that caller is `checkInvokeExprCallSurface` in `invoke-expr-call-surface.ts`, a different module produced by a later D9-motivated split of `invoke-static-checks.ts`. A reader following the header's own claim to find "the inline `invoke(...)` loop" inside `checkInvokeStaticResolution` will not find it there; they must instead discover the delegation to the sibling module on their own. This is the "header names a wrong collaborator" shape explicitly listed as in-scope even where the surrounding code is deliberate.

## Suggested direction (non-binding, optional)
Update the header to name both current callers by module: `checkInvokeExprCallSurface` in `invoke-expr-call-surface.ts` for the `invoke(...)` expression surface, and `checkThetaCallableCallSurface` in `invoke-static-checks.ts` for the `.theta`-callable surface, dropping the "living beside its two callers" / "invoke-static-checks.ts imports it back" framing that assumed a single-file caller set.

## False-positive check
- Re-read `with-clause-prompt-mode-gate.ts:1-16` verbatim at HEAD.
- `grep -rn "withClausePromptModeRefusal" src/` — exactly 4 matches: the definition, one import + one call in `invoke-static-checks.ts`, one import + one call in `invoke-expr-call-surface.ts`. No third production caller; no test imports it directly (it is exercised only through the two production call sites' own tests).
- Confirmed `checkInvokeStaticResolution` (invoke-static-checks.ts:1215) no longer contains an inline `invoke(...)` loop calling this helper — it calls the imported `checkInvokeExprCallSurface` instead (line 1271), which is where the `invoke(...)` surface's own call to `withClausePromptModeRefusal` now lives.
- `git log --diff-filter=A --oneline -- src/extension/with-clause-prompt-mode-gate.ts` → single creation commit `9b7dc6a7`; `git log --oneline --follow -- src/extension/invoke-expr-call-surface.ts` → oldest commit `f7aae3fc`, dated later the same day per the wave-id timestamps in both commit messages (`qw20260917045205` vs `qw20260917154546`); `git show --stat f7aae3fc` confirms the file-split move (414 lines removed from `invoke-static-checks.ts`, 435 added to the new file), with no corresponding edit to `with-clause-prompt-mode-gate.ts`.
- Not a test-only-reachable case: both citations are production call sites in `src/extension/`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header at with-clause-prompt-mode-gate.ts:1-13 (unchanged since its sole commit 9b7dc6a7) still places the invoke(...) caller "inside checkInvokeStaticResolution (./invoke-static-checks.ts)" and names invoke-static-checks.ts as the single importer, but f7aae3fc (later same day, 414 LOC moved out) relocated that caller to checkInvokeExprCallSurface in invoke-expr-call-surface.ts:483; grep shows exactly two callers, one per file, and no existing PTQ tracks this header (the d9-03 sibling is a distinct misplacement claim) (triage: claude-fable-5-1)
