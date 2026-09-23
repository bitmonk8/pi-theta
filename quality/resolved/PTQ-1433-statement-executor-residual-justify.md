---
id: PTQ-1433
title: statement-executor.ts remains at 1831 LOC (justify band) after the PTQ-1154 seams landed, still bundling the host-contract type substrate, the expression evaluator, the result/match disposition family, and the statement/loop driver
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:1-1831
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts
d9_band: justify
wave: qw20260923010657
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# statement-executor.ts remains at 1831 LOC (justify band) after the PTQ-1154 seams landed, still bundling the host-contract type substrate, the expression evaluator, the result/match disposition family, and the statement/loop driver

## Observation
src/runtime/statement-executor.ts is the tree-walking statement executor
(header, lines 1-13: "drives statements and expressions, delegating par-for,
defects, and subagent calls to sibling modules"). PTQ-1154 (confirmed,
ratified, now resolved) filed the file at 2681 LOC / strong band; its three
seams (par-for-executor.ts, executor-defects.ts, subagent-fn-call.ts) all
landed. The structural map for this wave measures the residual file at 1831
LOC — still the justify band (>= 1000), where the presumption of breakdown
applies unless a concrete reason to keep it whole is found. No such reason
covers the whole remainder.

## Evidence
Distinct-concern inventory (declaration lines and LOC quoted from the
authoritative structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| host/deps/flow contract types | CheckpointDescriptor, StatementEvalHost, SubagentFnChildRequest, SubagentFnChildOutcome, ExecuteBodyDeps, BodyExecution, EvalResult | 162-433 | 189 |
| expression evaluation (calls, effects, operators) | preEvaluateToolArgs, ThetaFnArityError, resolveUserFn, evalUserFnCall, requireBoolean, applyCompound, evalExpr, resolveEnumMemberRead, evalCheckpointedEffect, evalBinary, applyBinaryScalar, applyStdlibMethod | 460-1257 | 632 |
| result/match disposition | evalAsResult, asResultValue, evalTry, evalMatch, toRuntimePattern | 1292-1490 | 179 |
| statement and loop driving | executeStatement, executeBlock, executeIf, loopIterSite, loopIterCheckpoint, executeWhile, executeFor, executeBody | 1501-1831 | 270 |

Excerpt anchoring the type-substrate row (statement-executor.ts:426-433,
re-read this session):

```ts
export type EvalResult =
  | { readonly flow: "value"; readonly value: ThetaValue }
  | { readonly flow: "fail"; readonly error: ThetaValue; readonly event?: RuntimeEvent }
  | { readonly flow: "propagate"; readonly err: ThetaValue }
  | { readonly flow: "return"; readonly value: ThetaValue }
  | { readonly flow: "break" }
  | { readonly flow: "continue" }
  | { readonly flow: "cancel" };
```

Importer counts, quoted from the map: ExecuteBodyDeps 4/28, BodyExecution
3/50, StatementEvalHost 2/13, executeBody 2/96, executeBlock 2/0, evalExpr
2/0 — the type substrate and the two drive entry points are the file's whole
external surface; the 632-LOC expression cluster and the 179-LOC disposition
cluster are private.

## Why this is a problem
Justify band: presumption of breakdown. Reasons considered and defeated:
- Closed-enumeration dispatch: the file spans three separate enumerations
  (evalExpr's Expr-kind chain 749-929, executeStatement's Stmt-kind switch
  1501-1600, applyBinaryScalar's operator switch 1141-1223) plus a 189-LOC
  type substrate — no single spec enumeration accounts for 1831 LOC.
- Single algorithm with shared local state: no module-level mutable state;
  the clusters share only the threaded `(env, deps)` parameter pair and call
  edges (evalExpr's block arm calls executeBlock at 788; executeStatement's
  arms call evalExpr) — established by the PTQ-1154 triage verification and
  re-checked this session.
- Data-only module: type/interface LOC is 189 of 1831 (~10%), far under 80%.
- One grammar production family: this is the runtime evaluator, not a parser.
- Generated code: hand-authored, bug-annotated throughout (0016, 0303, 0354,
  0370, 0476 rationale comments).
Partial coupling noted: the expression cluster and the statement driver are
mutually recursive (a seam between them threads call handles), but the type
substrate has zero back-references (types only) and the operator/disposition
helpers reference only forward into evalExpr — the coupling does not extend
to the whole file.

## Suggested direction (non-binding, optional)
Hypotheses, unproven — the human ratifies one. Seam A: host/deps/flow
contract types -> statement-executor-types.ts (hypothesis) — 189 LOC, 7
exported symbols move (ExecuteBodyDeps 4/28, BodyExecution 3/50,
StatementEvalHost 2/13, CheckpointDescriptor 1/11, SubagentFnChildRequest
2/0, SubagentFnChildOutcome 2/0, EvalResult 2/0 importers per map), 0
cross-references back into the host. Seam B: scalar operator family
(applyCompound, applyBinaryScalar, applyStdlibMethod; evalBinary optionally
stays) -> executor-operators.ts (hypothesis) — ~126-174 LOC, 0 exported
symbols move, back-reference only if evalBinary moves (it calls evalExpr).
Seam C: result/match disposition (evalAsResult, asResultValue, evalTry,
evalMatch, toRuntimePattern) -> executor-result-flow.ts (hypothesis) — ~179
LOC, 0 exported symbols move, back-references into evalExpr.

## False-positive check
Band check: 1831 LOC, justify band per the authoritative map (FILE_BANDS
justify=1000). Reasons-considered list above with the defeating evidence per
reason. Exemptions check: quality/exemptions.json (4 entries, read this
session) has no key for src/runtime/statement-executor.ts or any of its
functions. Generated-code check: hand-authored header with spec citations,
no generator. Spec-mirror check: the header cites four spec areas
(implementation-notes.md, cancellation.md, control-flow.md, functions.md,
error-model.md) — no single enumeration licenses the length. Prior-filing
check: PTQ-1154 is resolved (its Seams A/B/C all landed as
par-for-executor.ts / executor-defects.ts / subagent-fn-call.ts; verified by
the map's import list); this filing is the residual accounting on the
post-fix file, per the PTQ-1284/PTQ-1287 residual precedent. Same-wave
siblings: qw20260923010657-d2-01 (dead re-exports, D2 topic) and d9-01
(import-static-checks misplacement, different file) — not duplicates.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: `node tools/quality/size-scan.mjs map --files <one-line manifest>` gives src/runtime/statement-executor.ts 1831 LOC / band justify (FILE_BANDS justify=1000, not exempt-band; `wc -l` 1831), all 34 declarations sit at the cited ranges and the EvalResult excerpt byte-matches at 426-433; the four inventory rows are distinct member groups with no shared locals or module-level state (`grep -nE "^(let|var|const) "` → 0 hits) — types row 162-433 sums to 189 LOC per map and its only mentions of evalExpr/executeStatement/executeBlock are in the EvalResult doc-comment (398-403), disposition row 179 LOC and driver row 270 LOC match the map exactly, expression row actually sums to 671 LOC (candidate's 632 omits resolveEnumMemberRead's 39 despite listing it) — an undercount that does not change the band or the ≥2-concern inventory; coupling claims re-checked (applyCompound/applyBinaryScalar/applyStdlibMethod call nothing back into the file; evalBinary calls evalExpr 6×; disposition helpers call evalExpr 5× + evalCheckpointedEffect 1×; driver calls evalExpr 12×), reasons-considered list holds (three separate enumerations, no shared mutable state, ~10% type LOC, hand-authored, no exemptions.json key for the file or its functions, PTQ-1154's three seams landed without reversion); PTQ-1154 is fixed/resolved and this is the post-fix residual per the PTQ-1284/PTQ-1287 precedent, and PTQ-1301/1304/1305 (D4 clones inside this file) and same-wave d2-01 (dead re-exports) are different root causes — a D9 breakdown's seam is a design decision, never confirmed at triage (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run gives src/runtime/statement-executor.ts 1831 LOC / band justify (`wc -l` 1831, not exempt-band, no exemptions.json key) with all 34 declarations at the cited ranges and the EvalResult excerpt byte-matching at 426-433; the four rows are distinct member groups sharing no locals or module state (`grep -nE "^(let|var|const) "` → 0 hits) — types 189 / disposition 179 / driver 270 LOC match the map exactly, expression row actually sums to 671 (candidate 632 omits resolveEnumMemberRead 39) without changing band or ≥2-concern status; coupling re-counted (applyCompound/applyBinaryScalar/applyStdlibMethod 0 back-references, evalBinary→evalExpr 6×, disposition→evalExpr 3×, driver→evalExpr 12×, types row mentions executor fns only in the StatementEvalHost doc-comment 240-242); reasons-considered list holds (three separate enumerations, no shared mutable state, ~10% type LOC, hand-authored header, all three PTQ-1154 seam files exist); dedupe: PTQ-1154 is status fixed / ratified so this is the post-fix residual per PTQ-1284/1287 precedent, no open D9 filing keys this file (PTQ-1261 is runtime-panics; PTQ-1301/1304/1305 are D4 clones; PTQ-1409 is D2 re-exports) — a D9 breakdown seam is a design decision, never confirmed at triage (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
