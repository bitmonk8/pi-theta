---
id: PTQ-1409
title: statement-executor.ts re-exports evalParFor and evalSubagentFnCall that nothing imports through it
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:46-49
sites: 2
fix_scope: localized
wave: qw20260923010657
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# statement-executor.ts re-exports evalParFor and evalSubagentFnCall that nothing imports through it

## Observation
`src/runtime/statement-executor.ts` imports `evalParFor` from
`./par-for-executor` and `evalSubagentFnCall` from `./subagent-fn-call` for its
own internal dispatch use, then immediately re-exports both under the same
names. Both functions are called once inside `statement-executor.ts` itself
(the `evalParFor(expr, env, deps)` call and the
`evalSubagentFnCall(resolved.fn, expr, env, deps, resolved.moduleEnv)` call).
No file in `src/`, `extensions/`, `tools/`, or `tests/` imports either name
from `../runtime/statement-executor` or `./statement-executor`.

## Evidence
`src/runtime/statement-executor.ts:46-49`:
```ts
import { evalParFor } from "./par-for-executor";
export { evalParFor } from "./par-for-executor";
import { evalSubagentFnCall } from "./subagent-fn-call";
export { evalSubagentFnCall } from "./subagent-fn-call";
```

`src/runtime/statement-executor.ts:772` (the file's own internal caller of
`evalParFor`):
```ts
    return evalParFor(expr, env, deps);
```

`src/runtime/statement-executor.ts:799` (the file's own internal caller of
`evalSubagentFnCall`):
```ts
        ? evalSubagentFnCall(resolved.fn, expr, env, deps, resolved.moduleEnv)
```

Search 1 — every import of `evalParFor` repo-wide:
`grep -rn "evalParFor\b" --include=*.ts src tests extensions tools` finds it
defined/used in `src/runtime/par-for-executor.ts` (its home module) and
consumed once inside `src/runtime/statement-executor.ts:772`. Every other hit
(`src/extension/production-theta-producer.ts:2405`,
`src/runtime/executor-defects.ts:154`, and eight `tests/*.test.ts` lines) is
inside a `//` comment or `describe`/`it` string naming the function for
documentation, never an `import` statement.

Search 2 — every import of `evalSubagentFnCall` repo-wide:
`grep -rn "evalSubagentFnCall\b" --include=*.ts .` finds only its own
declaration site (`src/runtime/subagent-fn-call.ts`), the
import/export/call-site trio inside `src/runtime/statement-executor.ts`
(lines 48, 49, 799), and its `.localpi/tmp/d7-backup/` mirror copy. No file
anywhere imports it.

Search 3 — every import of `../runtime/statement-executor` or
`./statement-executor` repo-wide (to find any consumer of the re-export
surface): the import blocks in `src/extension/production-theta-producer.ts:164-183`,
`src/extension/theta-composition-producer.ts:31-34`,
`src/extension/theta-composition-contract.ts:5`,
`src/runtime/effectful-statement-host.ts:39-53`,
`src/runtime/par-for-executor.ts:12`, and
`src/runtime/pure-expression-evaluator.ts:4` name only
`executeBody`/`BodyExecution`/`ExecuteBodyDeps`/`CheckpointDescriptor`/
`StatementEvalHost`/`SubagentFnChildOutcome`/`SubagentFnChildRequest`/
`evalExpr`/`executeBlock`/`panicSiteFile`/`ThetaFnArityError`/`EvalResult`
and several defect-error classes — never `evalParFor` or `evalSubagentFnCall`.
`src/runtime/par-for-executor.ts` and `src/runtime/subagent-fn-call.ts` (the
two functions' own home modules) each import their siblings directly from
`./statement-executor` for other symbols, but neither imports its own
re-exported function back through that path.

## Why this is a problem
Both `evalParFor` and `evalSubagentFnCall` are alive — each is defined in its
own module and called once from inside `statement-executor.ts` on the direct
import. The `export { … } from "./…"` re-export lines add a second, unused
public surface for the same two names on a module that no caller anywhere
reaches them through. This is the same shape as the resolved
`src/lexer/lexer.ts` re-export finding (PTQ-1253): live declarations,
dead re-export surface.

## Suggested direction (non-binding, optional)
Drop the two `export { … } from "./…"` lines; callers that need either
function already import it from its home module (`./par-for-executor`,
`./subagent-fn-call`) directly.

## False-positive check
Ran `grep -rn "evalParFor\b" --include=*.ts src tests extensions tools` and
`grep -rn "evalSubagentFnCall\b" --include=*.ts .` — every non-comment,
non-string hit for `evalSubagentFnCall` is the declaration and the
import/export/call trio in `statement-executor.ts`; every non-comment hit for
`evalParFor` is the declaration, its home-module use, and the same file's
internal call. Ran `grep -rn "statement-executor" --include=*.ts .` and
inspected every importing file's named-import list (six files) — none names
either re-exported identifier. Ran
`grep -rn "statement-executor" --include=*.ts . | grep -iE "\* as|require\("`
for namespace/dynamic access — no hits. Both are called only from inside their
own file via the direct (non-re-exported) import, so this is not a
test-only-reachable case and not dead code — only the re-export surface is
unused.

## Triage
verdict: confirmed — excerpt byte-matches at src/runtime/statement-executor.ts:46-49 and the internal callers at :772/:799; independent identifier hunt (`evalParFor\b`, `evalSubagentFnCall\b` across src/tests/extensions/tools incl. .mjs) finds no import of either name from statement-executor — every hit outside the two home modules and the in-file import/export/call trio is a `//` comment or describe/it string; no `export * from .*statement-executor` barrel chain and no namespace/dynamic consumer reads either name (the `vi.mock` `...actual` spreads in tests/helpers/parked-statement-executor.ts and b0476 propagate but never read them); a scratch removal of the two `export { … } from` lines typechecks clean (tsc --noEmit exit 0, file restored); the lines were introduced by the PTQ-1154 D9 breakdown fix (d1461328) with no facade/compat comment; no open or resolved issue tracks this (PTQ-1253 is the same class on lexer.ts, not the same site); one inaccuracy that does not bear on the root cause — Search 3 names six src importers but ~120 tests/ files also import from statement-executor, none of which names either identifier (triage: claude-fable-5-1)
