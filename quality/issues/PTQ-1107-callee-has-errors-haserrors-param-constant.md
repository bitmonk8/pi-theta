---
id: PTQ-1107
title: checkCalleeHasErrors's hasErrors gate is true at every production call site
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/invoke-diagnostics.ts:642-668
  - src/extension/invoke-expr-call-surface.ts:418-427
  - src/extension/production-composition.ts:2836-2847
  - src/extension/subagent-fn-static-checks.ts:150-163
sites: 4
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# checkCalleeHasErrors's hasErrors gate is true at every production call site

## Observation
`checkCalleeHasErrors` (src/parser/invoke-diagnostics.ts) takes a `hasErrors: boolean`
field on its input and returns `[]` immediately when it is `false`. Every one of
the three production call sites already computes and branches on the exact same
condition before calling the function, and passes the literal `hasErrors: true`
in all three; each site's own surrounding `if` is what decides whether the
function is invoked at all. The only place `hasErrors: false` is exercised is a
unit test asserting the early-return.

## Evidence
src/parser/invoke-diagnostics.ts:642-668
```ts
export interface CalleeHasErrorsInput {
  readonly calleePath: string;
  readonly surface: InvokePathSurface;
  /**
   * Whether the callee is unreadable, unparseable, or failed its own structural
   * checks during the static-resolution walk (i.e. is *not* statically
   * resolvable). When `false`, no diagnostic fires.
   */
  readonly hasErrors: boolean;
  readonly relatedSites: readonly RelatedSite[];
  readonly site: CompatSite;
}
...
export function checkCalleeHasErrors(input: CalleeHasErrorsInput): Diagnostic[] {
  const { calleePath, surface, hasErrors, relatedSites, site } = input;
  if (!hasErrors) {
    return [];
  }
```

src/extension/invoke-expr-call-surface.ts:418-427
```ts
    if (containment === undefined) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: invoke.path,
          surface: "invoke",
          hasErrors: true,
          relatedSites: [],
          site,
        }),
      );
```

src/extension/production-composition.ts:2836-2847
```ts
  for (const [spec, callee] of calleeCache) {
    if (callee.escape === undefined && callee.fileExists && callee.hasErrors) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: spec,
          surface: "tools",
          hasErrors: true,
          relatedSites: [],
          site: { file: parsed.sourcePath, range: TOOLS_DIAGNOSTIC_RANGE },
        }),
      );
    }
  }
```

src/extension/subagent-fn-static-checks.ts:150-163
```ts
    if (bodyErrors.length > 0) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: fn.name,
          surface: "tools",
          hasErrors: true,
          relatedSites: bodyErrors.map((d) => ({
            file: d.file ?? input.file,
            range: d.range ?? fn.range,
            message: d.message,
          })),
          site: { file: input.file, range: fn.range },
        }),
      );
```

Every production call is inside a conditional (`containment === undefined`,
`callee.hasErrors`, `bodyErrors.length > 0`) that already establishes the same
fact `hasErrors` restates, and each then passes the literal `true`.

## Why this is a problem
`hasErrors` is a parameter whose value is fixed at every real call site: the
caller decides whether to call `checkCalleeHasErrors` at all, then repeats the
decision as a constant argument. The `if (!hasErrors) return [];` branch inside
the function is therefore unreachable from any of the three production paths —
its only exerciser is `tests/invoke-diagnostics.test.ts:329-336`, which asserts
`hasErrors: false` yields an empty array. This is the "vestigial parameter"
shape: the field adds a second copy of a decision the caller already made, with
no production caller ever supplying the other value.

## Suggested direction (non-binding, optional)
Consider dropping `hasErrors` from `CalleeHasErrorsInput` and calling the
function only from the already-established `if` at each site, letting the
caller's own guard be the single source of the decision.

## False-positive check
- `grep -rn "checkCalleeHasErrors" --include="*.ts" .` (excluding dist/) turned
  up exactly three production call sites (invoke-expr-call-surface.ts,
  production-composition.ts, subagent-fn-static-checks.ts) and four test call
  sites (tests/invoke-diagnostics.test.ts x3, tests/subagent-fn.test.ts x1).
- Inspected each production call site's surrounding code: all three sit behind
  a caller-side conditional that already established `hasErrors` would be
  `true`, and all three pass the literal `true`.
- Confirmed via `tests/invoke-diagnostics.test.ts:329-336` that `hasErrors:
  false` is exercised only from a test, not from any production caller.
- Checked the interface's own doc comment for a stated design rationale for
  keeping the boolean despite the caller-side gating (e.g. a "uniform posture"
  or reuse argument) — none is given; the comment only describes what `false`
  means, not why the parameter must be threaded.

## Triage
verdict: confirmed — every excerpt reproduces at HEAD (invoke-diagnostics.ts:638-668, invoke-expr-call-surface.ts:418-427, production-composition.ts:2836-2847, subagent-fn-static-checks.ts:150-163); my own `hasErrors:` grep over *.ts finds exactly three CalleeHasErrorsInput constructions in src, all literal `true` and each behind a caller-side guard that already establishes the fact (the `hasErrors: false` hits at production-composition.ts:3061/3105/3164 are the separate CalleeCacheEntry type), with tests/invoke-diagnostics.test.ts:332 the sole `false` supplier; git shows the gate never had a computed production value — V15f (d9ea72a6) shipped the function with no caller and the first wiring in V20a (44faae57) already used `if (callee.fileExists && callee.hasErrors)` + literal `true`, as did 8f3fccf3 and 645bcb02; the field's doc comment states semantics only, no design rationale (contrast the staticallyResolvable/calleeResolvable gates REVIEW_LOG:487 left unfiled for in-code rationale); same confirmed constant-parameter shape as PTQ-0196/0173/0147, distinct from resolved PTQ-0004 (checkInvokeExtension.surface), no dedupe (triage: claude-fable-5-1)
