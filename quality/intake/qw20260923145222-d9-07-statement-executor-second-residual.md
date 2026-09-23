---
id: pending
title: statement-executor.ts remains at 1129 LOC (justify band) after the PTQ-1433 seams landed, still bundling the expression evaluator, the user-fn call machinery, the tool-arg pre-evaluation, and the statement/loop driver
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:1-1129
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# statement-executor.ts remains at 1129 LOC (justify band) after the PTQ-1433 seams landed, still bundling the expression evaluator, the user-fn call machinery, the tool-arg pre-evaluation, and the statement/loop driver

## Observation
The structural map places src/runtime/statement-executor.ts at 1129 LOC, band justify (FILE_BANDS justify = 1000). Its header names the module "the theta tree-walking statement executor" that "delegates par-for, defects, subagent calls, the host-contract type substrate, the scalar operator family, and the result/match disposition family to sibling modules" — i.e. the PTQ-1154 and PTQ-1433 (both confirmed, both fixed) seams landed: `statement-executor-types.ts`, `executor-operators.ts`, `executor-expression-list.ts`, `executor-result-flow.ts`, `executor-defects.ts`, `par-for-executor.ts`, and `subagent-fn-call.ts` all exist and are imported (statement-executor.ts:36-63). The file shrank 1831 → 1129 but stays in the justify band with five member clusters remaining.

## Evidence
Distinct-concern inventory (declarations and LOC quoted from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| panic-site / trace helpers | panicSiteFile, traceEffectDispatch | 105-141 | 14 |
| tool-arg pre-evaluation (RFC 0002) | preEvaluateToolArgs | 168-232 | 65 |
| user-fn call machinery (FN-1…FN-5, INV-4 frame accounting) | ThetaFnArityError, resolveUserFn, evalUserFnCall | 242-377 | 111 |
| expression evaluation (Expr-kind dispatch + checkpointed-effect segmentation) | requireBoolean, evalExpr, resolveEnumMemberRead, evalCheckpointedEffect, evalBinary | 388-788 | 361 |
| statement / loop driver (Stmt-kind dispatch, loops, body boundary) | executeStatement, executeBlock, executeIf, loopIterSite, loopIterCheckpoint, executeWhile, executeFor, executeBody | 799-1129 | 270 |

Declared-member total 821 LOC; the remainder is the 34-line header, imports, re-exports, and doc comments. Excerpt showing the driver/evaluator boundary the file straddles (statement-executor.ts:586-588):

```ts
  return evalCheckpointedEffect(expr, env, deps, atTerminal);
}
```

Cross-module recursion is already the established pattern for this host's extractions — all three extracted siblings import the executor's core back:
- subagent-fn-call.ts:9 `import { evalExpr, executeBlock, panicSiteFile, ThetaFnArityError, … } from "./statement-executor";`
- par-for-executor.ts:12 `import { evalExpr, executeBlock, panicSiteFile, … } from "./statement-executor";`
- executor-result-flow.ts:42 `} from "./statement-executor";`

Module-level state: `grep -nE "^(let|var|const) " src/runtime/statement-executor.ts` → 0 hits; the clusters communicate only through parameters (`env`, `deps`).

Importer counts from the map: executeBody 3 src / 94 tests; evalExpr 3 src; executeBlock 2 src; preEvaluateToolArgs 1 src; panicSiteFile 3 src.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered and defeated:
- Closed-enumeration dispatch: applies to two individual functions (evalExpr mirrors the `Expr` union, executeStatement the `Stmt` union of ../parser/theta-document) — both kept whole under that reason at function level — but the FILE is two separate enumerations plus three non-enumeration clusters (65 + 111 + 14 LOC), so the enumeration reason does not cover the host.
- Single algorithm with shared local state: no module-level state (grep above → 0 hits); the only coupling is mutual recursion through `evalExpr`/`executeBlock`, and the codebase already bridges exactly that seam cross-module three times (subagent-fn-call.ts:9, par-for-executor.ts:12, executor-result-flow.ts:42), so recursion is a demonstrated non-blocking seam cost.
- Data-only module: the type substrate was extracted to statement-executor-types.ts (this shard, 316 LOC); ~0% of the remaining LOC are type declarations.
- One grammar production family: runtime module, not a parser production.
- Generated code: hand-authored (bug-numbered lockstep comments throughout).
PTQ-1154 and PTQ-1433 are both resolved/fixed; per the PTQ-1284/PTQ-1287 residual-chain precedent the post-fix host is re-accounted while it remains over-band.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies: Seam A: user-fn call machinery -> `user-fn-call.ts` (hypothesis) — 111 LOC, exported symbols moved: resolveUserFn (1 src importer per map), ThetaFnArityError (2 src); cross-references back into the host: evalExpr, executeBlock, panicSiteFile (same shape as subagent-fn-call.ts:9). Seam B: checkpointed-effect segmentation (preEvaluateToolArgs + evalCheckpointedEffect) -> `executor-effect-dispatch.ts` (hypothesis) — 160 LOC, exported symbols moved: preEvaluateToolArgs (1 src importer); cross-references back: evalExpr, traceEffectDispatch, panicSiteFile. Seam C: statement/loop driver (executeStatement … executeBody) -> `statement-driver.ts` (hypothesis) — 270 LOC, exported symbols moved: executeBody (3 src / 94 tests), executeBlock (2 src); cross-references back: evalExpr, panicSiteFile — this seam takes the file's public entry point with it, so it is listed last-confidence.

## False-positive check
Band: 1129 LOC, justify — quoted from the structural map, not recounted. Reasons-considered list recorded above with the defeating evidence per reason (grep for module state, extraction citations, type-LOC count). Exemptions check: quality/exemptions.json holds no key for src/runtime/statement-executor.ts or any of its functions (4 keys, none runtime). Generated-code check: hand-authored. Spec-mirror check: the two dispatchers mirror spec enumerations and are dispositioned KEEP-WHOLE individually at function level (recorded in this shard's notes); the file-level presumption is not answered by them. Duplicate check: PTQ-1154 (fixed) and PTQ-1433 (fixed, quality/resolved/) are the prior links in this chain — this filing accounts the post-fix residual at 1129 LOC; PTQ-1409 (D2 dead re-exports), PTQ-1301/1304/1305 and this wave's d4-04 (D4 clones inside the file) are different root causes; no D9 filing this wave keys this host.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: `node tools/quality/size-scan.mjs map --files <one-line manifest>` gives src/runtime/statement-executor.ts 1129 LOC / band justify (FILE_BANDS justify=1000, not exempt-band; `wc -l` 1129; no exemptions.json key for the file or any #function — 4 keys, none runtime), all 19 declarations sit at the cited ranges and the five inventory rows sum exactly to the map (14 / 65 / 111 / 361 / 270 = 821 LOC) and are distinct member groups sharing no module state (`grep -nE "^(let|var|const) "` → 0 hits; coupling is only the `(env, deps)` parameter pair plus mutual recursion evalExpr↔executeBlock/evalUserFnCall) — the only soft spot is the preEvaluateToolArgs row being separable from evalCheckpointedEffect only by adjective (the filing's own Seam B regroups them), but merging it leaves a ≥ 3-concern inventory (user-fn call 111 / expression 426 / driver 270); the excerpt at 586-588 byte-matches, the header quote, the 36-63 sibling imports, the back-import citations (subagent-fn-call.ts:9, par-for-executor.ts:12, executor-result-flow.ts:42 — in fact five siblings import back, effectful-statement-host.ts:54 and pure-expression-evaluator.ts:4 too, which strengthens the claim) and the importer counts all reproduce; reasons-considered list holds (two separate enumerations plus three non-enumeration clusters, no shared mutable state, ~0% type LOC, runtime not grammar, hand-authored, no reverted split — PTQ-1154/PTQ-1433 seam files all exist at HEAD, commits 2865e9ac/dd12c482/c2ac6d12); dedupe: PTQ-1154 and PTQ-1433 are status fixed in quality/resolved/ so this is the post-fix residual per the PTQ-1284/1287 precedent, PTQ-1163 (evalExpr #function) fixed, no open D9 filing keys this host (`grep d9_host: src/runtime/statement-executor.ts quality/issues/` → 0), same-wave d4-04 and PTQ-1301/1304/1305/1409 are D4/D2 root causes — a D9 breakdown seam is a design decision, never confirmed at triage (triage: claude-fable-5-1)
