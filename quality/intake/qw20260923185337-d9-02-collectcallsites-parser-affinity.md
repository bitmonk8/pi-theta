---
id: pending
title: collectCallSites and CollectedCallSites live in extension/invoke-static-checks.ts while touching 6 parser/theta-document members and 0 of their host's, and parser/with-clause-static-checks.ts imports them back upward
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/invoke-static-checks.ts:163-179
  - src/extension/invoke-static-checks.ts:206-233
sites: 2
fix_scope: cross-module
d9_class: misplacement
wave: qw20260923185337
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# collectCallSites and CollectedCallSites live in extension/invoke-static-checks.ts while touching 6 parser/theta-document members and 0 of their host's, and parser/with-clause-static-checks.ts imports them back upward

## Observation
`src/extension/invoke-static-checks.ts` (834 LOC, zone) declares `CollectedCallSites` (163-179, 17 LOC; importers 1 src / 0 tests) and `collectCallSites` (206-233, 28 LOC; importers 2 src / 0 tests). Together they sort the nodes of the parser's shared call-site walk (`walkCallSiteNodes`, src/parser/theta-document.ts:808) into four arrays by node kind. The host's role, from its header (:1-5), is "Load-time (compose-pass) orchestration for invoke static checks". The walk bucketing does no orchestration and no invoke check. Since commit 65fe42f7 (2026-09-23, PTQ-1266's fix) moved `with-clause-static-checks.ts` into `src/parser/`, a parser module imports this walk from `../extension/invoke-static-checks`. `invoke-static-checks.ts` in turn imports two value functions from that parser module, so the two files now import each other at the value level across the parser/extension boundary.

## Evidence
src/extension/invoke-static-checks.ts:206-219 (the body, abridged at 15 lines; :220-233 add the `object` and `member` arms of the same form):
```
export function collectCallSites(body: ThetaBody): CollectedCallSites {
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [], objectExprs: [], memberExprs: [] };
  // `target.method(args)` (a `MethodCallExpr`) is a method call, not a
  // `.theta`-callable-call candidate — `method` names a stdlib member, never a
  // `tools:` name — so it has no case below and joins none of the four arrays;
  // `walkCallSiteNodes` still reaches its target and args, just uncollected.
  walkCallSiteNodes(body, (node) => {
    switch (node.kind) {
      case "invoke":
        out.invokeExprs.push(node);
        return;
      case "call":
        out.callExprs.push(node);
        return;
```

Affinity, counted both ways. The pair touches 6 members of src/parser/theta-document.ts: `walkCallSiteNodes` (value, imported at :101), and `ThetaBody`, `InvokeExpr`, `CallExpr`, `ObjectExpr`, `MemberExpr` (types, imported at :94-100). They touch 0 other members of their host: neither references `resolveCalleeAbsolute`, any check function, or any of the host's other imports. The only own-host reference is each other. The four array element types are exactly the arms of theta-document's own `CallSiteNode` union (src/parser/theta-document.ts:770):
```
export type CallSiteNode = CallExpr | InvokeExpr | ObjectExpr | MemberExpr;
```

Callers (`grep -rn -E "\b(collectCallSites|CollectedCallSites)\b" src`, comment hits excluded):
- In the host (3): `collectInvokeExprs` :192, `collectThetaCallableCallSites` :301, `checkInvokeStaticResolution` :742.
- src/parser/with-clause-static-checks.ts:23 `import { collectCallSites } from "../extension/invoke-static-checks";`, used at :353 `for (const call of collectCallSites(body).callExprs) {`.
- src/extension/import-static-checks.ts:98 (import), :584 `const callSites = collectCallSites(input.body);`.
- src/extension/invoke-imported-checks.ts:57 `type CollectedCallSites,` (parameter type at :100/:182/:332/:416/:512).

The reverse edge that closes the cycle is src/extension/invoke-static-checks.ts:146:
```
import { checkWithClauseAtCallSurface, checkWithClauseDefaultReject } from "../parser/with-clause-static-checks";
```

Sibling pattern: the other collector over the same walk that turns visits into a `CallExpr[]`, `collectClauseBearingCalls`, lives beside the walk in src/parser/theta-document.ts:746-758 (`walkCallSiteNodes(block, (node) => { if (node.kind === "call" && node.withClause !== undefined) { out.push(node); } }, …)`). The walk's own types (`CallSiteNode` :770, `CallSiteWalkOptions` :778) sit there too.

## Why this is a problem
Counted affinity is 6 parser members against 0 host members. Of the 4 importing modules (the host plus 3), the one outside `src/extension/` is a parser module, and it reaches upward to get a parser-AST bucketing. That turns what would be a one-way extension→parser dependency into a value-level cycle between parser/with-clause-static-checks.ts and extension/invoke-static-checks.ts. PTQ-1266's filing named `collectCallSites` as one of the "cross-references back into extension … the blockers a ratified move would have to inject or relocate first" (quality/resolved/PTQ-1266-with-clause-static-checks-parser-affinity.md:60). The move landed (65fe42f7) without relocating it, so the blocker is now a live upward edge. The bug-0071 one-walker rule (header :150-162) limits how many walkers exist, not which layer hosts the bucketing. The walker itself already lives in parser.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: re-home `CollectedCallSites` and `collectCallSites` into the parser layer beside `walkCallSiteNodes`/`CallSiteNode` (in src/parser/theta-document.ts, or a small parser sibling it re-exports). `invoke-static-checks.ts` would then import them, with a re-export line if the current importers should keep their import shape. The private `collectInvokeExprs` (191-193) stays with its only caller, `buildInvokeGraph`. 45 LOC move; 2 exported symbols; external importers 3 src / 0 tests; cross-references back into the host: none.

## False-positive check
- Affinity counts both ways: 6 parser/theta-document members vs 0 host members, names listed above, from the import block :94-101 and the body :206-233, both re-read at HEAD.
- Sibling-pattern citation: `collectClauseBearingCalls` (theta-document.ts:746) and the walk's `CallSiteNode`/`CallSiteWalkOptions` types (:770/:778) are in parser. The two extension-side direct users of `walkCallSiteNodes` (extension-tool-reachability.ts:47, subagent-fn-static-checks.ts:28) are consumers, not bucketing helpers, and have no parser importer.
- Importer counts are the map's (collectCallSites 2/0, CollectedCallSites 1/0), matching the grep.
- Not dead: every caller listed is live production code, so no D2 routing is needed.
- Not a barrel or facade: invoke-static-checks.ts declares implementation bodies, and its header states an orchestration role.
- Layer direction: `grep -rn 'from "\.\./extension' src/parser` finds 5 hits. Two are this finding's edge and the collectProvableArgTypes edge (filed separately as d9-03, a different declaration and host). Three are system-note-channel edges already tracked by PTQ-1272.
- Dedupe: PTQ-1266 (resolved) re-homed `with-clause-static-checks.ts`, a different host. PTQ-1175 (resolved) was a breakdown of this file whose ratified Seams A/B did not touch the walk. The same-wave D8 intake d8-01 quotes this import line only as context for a deps-injection finding. No open or intake item keys this declaration's placement.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified; target shape needs a human ruling: `CollectedCallSites` (163-179) and `collectCallSites` (206-233) touch exactly 6 parser/theta-document members (`walkCallSiteNodes` value import :101; `ThetaBody`/`InvokeExpr`/`CallExpr`/`ObjectExpr`/`MemberExpr` type imports :94-100) and nothing from their host except each other; the grep reproduces the listed importers (with-clause-static-checks.ts:23/353, import-static-checks.ts:98/584, invoke-imported-checks.ts:57 plus 5 parameter sites; host uses at :192/:301/:742; no test callers); the reverse value import at invoke-static-checks.ts:146 is real, so parser↔extension value-level mutual import stands; the sibling pattern holds (`collectClauseBearingCalls` theta-document.ts:746 over the same walk, `CallSiteNode` :770, `CallSiteWalkOptions` :778, `walkCallSiteNodes` :808); PTQ-1266:60 names `collectCallSites` as an unrelocated blocker and 65fe42f7 is that move; `grep 'from "../extension' src/parser` → 5 hits as stated; not a duplicate — no issues/ or intake row keys this declaration's placement (PTQ-1175 and PTQ-1266 are resolved, with different hosts/seams; d9-03 is collectProvableArgTypes) (triage: claude-opus-5-5)
