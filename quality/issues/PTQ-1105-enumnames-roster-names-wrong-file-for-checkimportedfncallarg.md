---
id: PTQ-1105
title: StaticTypeInferenceDeps.enumNames doc names checkImportedFnCallArgs as living in invoke-static-checks.ts, but it was split into invoke-imported-checks.ts
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/static-type-inference.ts:88-92
  - src/extension/invoke-imported-checks.ts:1-24
  - src/extension/invoke-imported-checks.ts:159-176
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# StaticTypeInferenceDeps.enumNames doc names checkImportedFnCallArgs as living in invoke-static-checks.ts, but it was split into invoke-imported-checks.ts

## Observation
The `enumNames` field's doc comment on `StaticTypeInferenceDeps` names three
production construction sites for the pass and attributes two of them,
`checkInvokeStaticResolution` and `checkImportedFnCallArgs`, to the same file,
`../extension/invoke-static-checks.ts`. `checkImportedFnCallArgs` is not
defined in that file: it was extracted into a new sibling file,
`invoke-imported-checks.ts`, on 2026-09-16 (commit c3f8a0ef, "PTQ-0370"), and
constructs its own, separate `StaticTypeInferencePass` instance there. The
roster comment was last edited 2026-09-10 (commit 264dcbd6) and was never
updated for the split.

## Evidence
src/parser/static-type-inference.ts:88-92 — the roster comment:

```ts
   * no default: every production construction site
   * (./type-layer-checks.ts's `checkTypeLayer`,
   * ../extension/invoke-static-checks.ts's `checkInvokeStaticResolution` and
   * `checkImportedFnCallArgs`)
   * has the walked body's `statements` in scope and must pass the real set, so a missing
```

src/extension/invoke-imported-checks.ts:1-24 — the file's own header, stating
the split and that `checkInvokeStaticResolution` never calls any of this
file's routes:

```ts
// Bug 0138 / bugs 0429 / 0430 / 0448 — the imported-symbol usage checks
// `checkThetaImports` (import-static-checks.ts) runs ONCE per importing
// theta, after its per-decl loop has resolved each specifier's imported
// symbol against the directly-resolved library:
//
//   - `checkImportedFnCallArgs` (bug 0138) — an imported `.thetalib` `fn`
//     call's argument COUNT (`theta/parse/fn-arity-too-few` / `-too-many`)
//     and per-slot TYPE (`theta/parse/fn-arg-type-mismatch`).
...
// Split out of ../extension/invoke-static-checks.ts as PTQ-0370: that file's
// own entry points (`checkInvokeStaticResolution`,
// `checkThetaCallableCallSurface`) never call any of the four — this file's
// sole caller is `checkThetaImports` (../extension/import-static-checks.ts),
// which imports these five names from here instead.
```

src/extension/invoke-imported-checks.ts:159-176 — `checkImportedFnCallArgs`'s
own, separate `StaticTypeInferencePass` construction (a third, distinct
construction site the roster comment's file attribution does not name):

```ts
export function checkImportedFnCallArgs(
  importingBody: ThetaBody,
  importingFile: string,
  shadowedNames: ReadonlySet<string>,
  callSites: CollectedCallSites,
  importedFns: ReadonlyMap<string, ImportedFnCallee>,
): Diagnostic[] {
  if (importedFns.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const { callExprs } = callSites;
  const importerEnv = collectTypeEnv(importingBody.statements);
  const importerPass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(importingBody.statements),
  });
```

The three actual production construction sites at HEAD:
`grep -rn "new StaticTypeInferencePass(" src/` →
`src/extension/invoke-imported-checks.ts:172`,
`src/extension/invoke-static-checks.ts:1264`,
`src/parser/type-layer-checks.ts:349`.

## Why this is a problem
The comment's parenthetical groups `checkInvokeStaticResolution` and
`checkImportedFnCallArgs` under one file name, `../extension/invoke-static-checks.ts`,
implying a reader can find both entry points there. A reader following that
pointer to `checkImportedFnCallArgs` inside `invoke-static-checks.ts` finds no
such function — it now lives in a different file the roster never names. The
underlying claim the comment makes (every production construction site passes
a real `enumNames` set) is still true; only the file attribution for one of
the three sites has decayed since the 2026-09-16 file split.

## Suggested direction (non-binding, optional)
Give `checkImportedFnCallArgs` its own file citation (`../extension/invoke-imported-checks.ts`)
alongside the other two, rather than folding it under `invoke-static-checks.ts`.

## False-positive check
- Confirmed the comment's exact wording at src/parser/static-type-inference.ts:88-92
  (`Read` of the file).
- Confirmed `checkImportedFnCallArgs`'s current definition site:
  `grep -rn "checkImportedFnCallArgs" src/` → defined at
  `src/extension/invoke-imported-checks.ts:159`, re-exported/imported by
  `src/extension/import-static-checks.ts:125` and `:1960`; no definition in
  `src/extension/invoke-static-checks.ts`.
- Confirmed all three `new StaticTypeInferencePass(` production construction
  sites: `grep -rn "new StaticTypeInferencePass("` → `invoke-imported-checks.ts:172`,
  `invoke-static-checks.ts:1264`, `type-layer-checks.ts:349` — matches the
  comment's claimed count of three sites, but not its file grouping.
  (Non-production construction sites in `tests/` are a separate, disjoint
  set: `array-ternary-common-type-union.test.ts`, `for-empty-array-iterand-adjudication.test.ts`,
  `tests/helpers/e2e-s1.ts`, `match-fn-return-lub-dominating-discipline.test.ts`,
  `par-for.test.ts`, `static-type-inference.test.ts`, `subagent-fn.test.ts`.)
- Git history: `git log --oneline -- src/extension/invoke-imported-checks.ts`
  shows the file created 2026-09-16 (commit c3f8a0ef, "quality: qw20260916045442
  fix d9/src__extension__invoke-static-checks.ts"), which moved 547 lines out
  of `invoke-static-checks.ts` per that commit's diffstat. `git log --oneline
  -- src/parser/static-type-inference.ts` shows the roster comment's text
  (adding `checkImportedFnCallArgs` to the parenthetical) was introduced at
  commit 264dcbd6, dated 2026-09-10 — six days before the split — confirming
  the comment predates, and was never updated for, the file's relocation.
- This is a prose/citation-drift claim, not a deadness claim, so no
  identifier-reachability search across src/extensions/tools/tests is owed;
  the underlying field (`enumNames`) and all three construction sites remain
  live production code.

## Triage
verdict: confirmed — excerpt verbatim at static-type-inference.ts:88-92 and both invoke-imported-checks.ts excerpts (:1-29 header, :159-175 with `new StaticTypeInferencePass` at :172) reproduce; `grep -rn "new StaticTypeInferencePass(" src/` gives exactly the 3 cited production sites and `grep -rn checkImportedFnCallArgs src/` finds the only definition at invoke-imported-checks.ts:159 (invoke-static-checks.ts:55 is a header cross-reference, not a definition), so the roster's file attribution is false at HEAD; `git blame -L 88,92` puts lines 89/91/92 at 264dcbd6 (2026-09-10, the PTQ-0127 fix that introduced the correct-at-the-time wording) and `git show --stat c3f8a0ef` (2026-09-16, PTQ-0370 move) touched only import-static-checks/invoke-imported-checks/invoke-static-checks — never this file — proving real decay; not a duplicate: PTQ-0127 (resolved) was the "both"-undercount root cause whose fix is the wording now stale, PTQ-0370 (resolved, D9) was the move itself and cited this file only as a prose hit, and no intake sibling cites this comment; same accepted stale-pointer class as PTQ-0157/0170 (aside for the fixer, not a second root cause here: type-layer-checks.ts:151/:1032/:2747 carry the same stale attribution) (triage: claude-fable-5-1)
