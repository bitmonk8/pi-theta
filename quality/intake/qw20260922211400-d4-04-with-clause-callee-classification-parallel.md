---
id: pending
title: with-clause callee classification split across pre- and post-materialisation passes
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/with-clause-static-checks.ts:144-203
  - src/extension/with-clause-static-checks.ts:241-271
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# with-clause callee classification split across pre- and post-materialisation passes

## Observation
`src/extension/with-clause-static-checks.ts` implements the RFC 0009 Erratum A′/B `with`-clause default-reject callee classification in two sequential passes over the same call-site discriminant set. `checkWithClauseDefaultReject` runs before imports materialise and decides, for every `CallExpr` carrying a `with` clause, whether the callee is a legal child-spawning surface (callable-set `theta`, a same-file `subagent fn`, or an imported name that must be deferred). `checkImportedWithClauseCallees` runs after imports materialise and decides the deferred imported-name half: a materialised imported `subagent fn` is legal, every other imported callee draws `theta/parse/with-clause-in-process-callee`. Both passes emit the same default-reject diagnostic and both must agree on which callee kinds are child-spawning surfaces.

## Evidence

**`src/extension/with-clause-static-checks.ts:144-203` (`checkWithClauseDefaultReject`):**

```typescript
function checkWithClauseDefaultReject(
  callerPath: string,
  callExprs: readonly CallExpr[],
  callableSet: CallableSetSnapshot | undefined,
  statements: readonly Stmt[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (callableSet !== undefined) {
    const subagentFns = topLevelSubagentFnNames(statements);
    const imported = importedLocalNames(statements);
    for (const call of callExprs) {
      if (call.withClause === undefined) {
        continue;
      }
      const entry = callableSet.entries.get(call.callee);
      if (entry !== undefined && entry.kind === "theta") {
        continue;
      }
      if (entry === undefined && subagentFns.has(call.callee)) {
        continue;
      }
      if (entry === undefined && imported.has(call.callee)) {
        continue;
      }
      if (entry !== undefined && entry.kind === "pi-tool") {
        diagnostics.push({
          severity: "error",
          code: WITH_CLAUSE_PI_TOOL_CODE,
          file: callerPath,
          range: call.range,
          message: withClausePiToolMessage(call.callee),
          hint: WITH_CLAUSE_PI_TOOL_HINT,
        });
        continue;
      }
      diagnostics.push({
        severity: "error",
        code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
        file: callerPath,
        range: call.withClause.range,
        message: withClauseInProcessCalleeMessage(call.callee),
        hint: WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
      });
    }
  }
  return diagnostics;
}
```

**`src/extension/with-clause-static-checks.ts:241-271` (`checkImportedWithClauseCallees`):**

```typescript
export function checkImportedWithClauseCallees(
  callerPath: string,
  body: ThetaBody,
  imports: readonly MaterializedImport[],
  callableSet: CallableSetSnapshot | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const importedNames = importedLocalNames(body.statements);
  const byName = new Map(imports.map((entry) => [entry.name, entry] as const));
  for (const call of collectCallSites(body).callExprs) {
    if (call.withClause === undefined || !importedNames.has(call.callee)) {
      continue;
    }
    if (callableSet?.entries.get(call.callee) !== undefined) {
      continue;
    }
    const materialised = byName.get(call.callee);
    if (materialised?.kind === "fn" && materialised.fn?.subagent === true) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
      file: callerPath,
      range: call.withClause.range,
      message: withClauseInProcessCalleeMessage(call.callee),
      hint: WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
    });
  }
  return diagnostics;
}
```

**Diff verdict:** not a token-level clone (the clone map reports no group for these spans). The two functions are load-bearing parallel truth: they enumerate the same `with`-clause callee universe but partition the decision based on whether imported callees have materialised. Both use `WITH_CLAUSE_IN_PROCESS_CALLEE_CODE` / `WITH_CLAUSE_IN_PROCESS_CALLEE_HINT` for the default-reject arm; only the first pass also owns the `pi-tool` special case and the callable-set `theta` case.

## Why this is a problem
The two passes are a single classification rule split across time. The set of callee kinds that admit a `with` clause is a closed, load-bearing design point (Erratum A′/B): callable-set `theta`, same-file `subagent fn`, and imported `subagent fn`. Today the first pass covers two of those three surfaces (`theta`, same-file `subagent fn`) plus the deferred-import escape hatch, and the second pass covers the remaining one (imported `subagent fn`). If a new child-spawning surface is added — for example, a built-in callee kind or a new callable-set classification — both passes must be updated or same-file and imported callees will disagree. Likewise, if the default-reject code, hint, or message builder changes, both emission sites must change together. The first pass already documents the deferral to the second pass, so the authors recognise the coupling, but the rule is still written twice rather than driven from one source of truth.

## Suggested direction (non-binding, optional)
Shared source of truth (hypothesis): a single callee-classification predicate or helper that, given a callee name and the available evidence (callable-set entry, same-file declarations, materialised imports), returns its `with`-clause legality. The pre-materialisation pass would call it with only callable-set and same-file evidence; the post-materialisation pass would call it with materialised-import evidence too.

## False-positive check
- Re-verified both cited spans in current code; excerpts match.
- Both functions are live: `checkWithClauseDefaultReject` is exported and called from `src/extension/invoke-static-checks.ts:814`, and `checkImportedWithClauseCallees` is exported and called from `src/extension/production-composition.ts:1476`.
- Clone-map re-verify: the scanner reports no clone group for either span; the similarity is structural/rule-level, not token-level.
- Searched `src/` for other `with`-clause callee classifications: `src/parser/theta-document.ts:769` implements a related parse-time `.thetalib` check (`checkThetaLibCallWithClauses`) that also admits only same-file `subagent fn`s and rejects everything else with the same default-reject code. It is not cited as a primary location because it sits outside this shard, but it reinforces that the same discriminant set is evaluated in more than one pass.
- Not `tests/`; both sites are production sources.
- Not generated: no generator marker, hand-maintained static-check wiring.
- Not a spec-normative vector table: `invocation.md` INV-8 states the rule once; these are multiple code passes implementing it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: both excerpts match at 144-203 / 241-271, both live (invoke-static-checks.ts:814, production-composition.ts:1476 + re-export at :142), clone-scan map reports no group for the file, and the partition is as counted (pass 1: theta/same-file subagent fn admitted, imported deferred, pi-tool + default convicted; pass 2: imported subagent fn admitted, else the same WITH_CLAUSE_IN_PROCESS_CALLEE code/hint/message trio); not a duplicate of PTQ-0364 (mode gate, fixed) or PTQ-1266 (D9 misplacement of the module); the shared classification predicate is a design decision for a human ruling — note invocation.md INV-8 itself prescribes the two evidence points (same-file at load pass, imported once materialised), so any unification must keep both (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: both excerpts match verbatim at with-clause-static-checks.ts:144-203 / 241-271; both live (checkWithClauseDefaultReject imported+called at invoke-static-checks.ts:145/:818 via the :273 re-export, checkImportedWithClauseCallees re-exported at invoke-static-checks.ts:146 and called at production-composition.ts:1476; test caller tests/call-with-clause-erratum-b.test.ts); clone-scan map on a one-line manifest reports "(no clone groups)" so the pair is structural not token-level; partition recounted as filed (pass 1 admits callable-set `theta` + same-file `subagent fn`, defers imported names, convicts `pi-tool` + default; pass 2 admits only materialised imported `subagent fn`, skips set-bound names, convicts the rest with the same WITH_CLAUSE_IN_PROCESS_CALLEE code/message/hint trio); dedupe: PTQ-0364 (prompt-mode gate, fixed) and PTQ-1266 (D9 misplacement of this module, open) are different root causes, no D4 filing names these two functions; d4_class parallel caps accurate accounting at questionable — invocation.md INV-8 itself prescribes the two judgement points (same-file at load pass, imported once materialised), so the shared classification predicate is a human design ruling (triage: claude-fable-5-1)
