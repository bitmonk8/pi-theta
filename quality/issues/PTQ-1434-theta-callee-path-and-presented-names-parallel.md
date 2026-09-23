---
id: PTQ-1434
title: thetaCalleePath and presentedCallableNames encode parallel callable-name resolution truth
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/callable-lowering.ts:376-387
  - src/extension/callable-lowering.ts:444-464
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260923023517
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# thetaCalleePath and presentedCallableNames encode parallel callable-name resolution truth

## Observation
`src/extension/callable-lowering.ts` contains two independent functions that must answer the same callable-name question over the same two-case input discriminant (frozen `callableSet` snapshot present vs. absent):

- `thetaCalleePath` maps a presented callable name back to the callee `.theta` path for code-driven `<name>(args)` calls.
- `presentedCallableNames` enumerates the presented names so the runtime environment's `localShadowsCallable` guard (bug 0016) fires on the same set the code-driven path can actually dispatch.

Both functions branch on `theta.callableSet === undefined`; when the snapshot is present they consult it directly, and when absent they fall back to `frontmatter.tools` entries, deriving default names through the same `thetaDefaultName` / `parseToolsEntry` grammar. The implementations are not token clones, but they encode the same load-bearing bifurcation.

## Evidence

Location 1 — `thetaCalleePath`, lines 376-387:

```typescript
export function thetaCalleePath(
  theta: ConversationBindInput["theta"],
  calleeName: string,
): string | undefined {
  const set = theta.callableSet;
  if (set !== undefined) {
    const entry = set.entries.get(calleeName);
    return entry !== undefined && entry.kind === "theta" ? entry.calleePath : undefined;
  }
  const tools = theta.frontmatter.tools ?? [];
  return tools.find(
    (entry) => entry.endsWith(".theta") && thetaDefaultName(entry) === calleeName,
  );
}
```

Location 2 — `presentedCallableNames`, lines 444-464:

```typescript
export function presentedCallableNames(theta: ConversationBindInput["theta"]): readonly string[] {
  const set = theta.callableSet;
  if (set !== undefined) {
    return [...set.entries.keys()];
  }
  const names: string[] = [];
  for (const entry of theta.frontmatter.tools ?? []) {
    const parsed = parseToolsEntry(entry.trim());
    if (parsed.kind !== "ok") {
      continue;
    }
    if (parsed.rename !== undefined) {
      names.push(parsed.rename);
      continue;
    }
    names.push(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.spec) ? parsed.spec : thetaDefaultName(parsed.spec),
    );
  }
  return names;
}
```

Diff verdict: structurally parallel (same snapshot-present / snapshot-absent bifurcation, same `thetaDefaultName` fallback derivation) but not token-identical. `thetaCalleePath` looks up one name and filters to `.theta` entries; `presentedCallableNames` enumerates all presented names and includes Pi-tool entries.

## Why this is a problem
This is load-bearing parallel truth, not incidental similarity. The bug-0016 shadowed-callable dispatch guard depends on the environment's callable registry (populated by `presentedCallableNames`) matching the set of names `thetaCalleePath` can actually resolve to a `.theta` callee. If the two functions disagree — for example, if one switched fallback grammars while the other did not, or if one began treating renamed entries differently — a call site could be flagged as shadowed when it is not, or allowed to dispatch when it should be guarded. The comments in both functions explicitly cite each other as the reason for using the same fallback pattern, confirming the mirror is intentional and load-bearing.

## Suggested direction (non-binding, optional)
The natural shared home is a single callable-set naming helper in `src/parser/callable-set.ts` (which already owns `thetaDefaultName` and `parseToolsEntry`) that materialises the presented-name ↔ entry mapping for both snapshot-present and snapshot-absent thetas; both `thetaCalleePath` and `presentedCallableNames` would consume that mapping rather than independently re-deriving it. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/extension/callable-lowering.ts` has no clone groups, so this parallel is correctly outside the token map.
- Both copies live: `thetaCalleePath` is imported and used by `production-theta-producer.ts` (4451, 4911); `presentedCallableNames` is imported and used by `production-theta-producer.ts` (1820, 2437, 3621) and `query-text-render.ts` (136).
- Deliberate-mirror check: the doc comments explicitly state both use the same snapshot-absent fallback pattern and the same `thetaDefaultName` derivation to stay in agreement (bug 0253, bug 0069). The mirror is intentional; the finding records parallel truth, not a copy to eliminate.
- Not tests/: both locations are under `src/` production code.
- Not dead code: both functions have production call sites.
- Not spec-normative vector table: the similarity is imperative name-resolution logic, not a repeated spec enumeration.
- No D4 duplicate: searched quality/ for filings pairing `thetaCalleePath` with `presentedCallableNames` and found none (PTQ-1188 and PTQ-1285 mention them only as separate exports in size inventories).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: both excerpts byte-match at callable-lowering.ts:376-387 and 444-464; each branches on the same two-case `theta.callableSet` present/absent discriminant, the snapshot arm reads `set.entries` and the absent arm re-derives names from `frontmatter.tools` via the shared `thetaDefaultName`/`parseToolsEntry` grammar; both live (thetaCalleePath ← production-theta-producer.ts:4451,4911; presentedCallableNames ← production-theta-producer.ts:1820,2437,3621 and query-text-render.ts:136); clone-scan map lists no groups for the file; the third mirror the comments name (`#resolvePiToolForTheta`, production-theta-producer.ts:4821) falls back to the `resolvePiTool` collaborator rather than `frontmatter.tools`, so sites: 2 is the right count; the parallel is demonstrably load-bearing — tests/tools-entry-closed-grammar-lockstep.test.ts pins that entries present identically "on both readers" and thetaCalleePath's fallback already diverges on `./c.theta as foo` (entry no longer endsWith `.theta`, so the renamed name presentedCallableNames returns resolves to no path); not a duplicate (sibling qw20260923023517-d8-01 is the distinct isBareIdentifier-inline root cause; PTQ-1126/1236/0382 cite other files); per the D4 parallel rule the shared presented-name↔entry source of truth is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted. TARGET SHAPE: single source of truth for callable-name resolution - consume callable-set.ts's existing exports (see the sibling D8 finding on the inline bare-ident regex); neither site re-encodes the rule.
