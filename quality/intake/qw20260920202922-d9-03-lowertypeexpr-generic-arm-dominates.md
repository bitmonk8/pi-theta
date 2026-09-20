---
id: pending
title: lowerTypeExpr's generic-application branch is 125 of its 241 LOC, dwarfing the union and atom arms of its Type dispatch
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/params.ts:736-976
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/params.ts#lowerTypeExpr
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# lowerTypeExpr's generic-application branch is 125 of its 241 LOC, dwarfing the union and atom arms of its Type dispatch

## Observation
`lowerTypeExpr` (src/parser/params.ts:736-976, 241 LOC, strong band) lowers a type-expression source string to a JSON-Schema fragment. Its top level dispatches over the Type grammar's alternatives (union, generic application, atom), but the generic-application branch alone carries four ordered head-refusal gates (bugs 0281/0282/0284 plus the `array` arity-1 case), the per-segment sink classification (bug 0204), the permissive argument walk, and the cut-bracket-group last resort (bug 0217).

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| trim + union precedence | 736-746 | 11 | s |
| union arm lowering (SUBS-1) | 747-766 | 20 | s, lowerCtx; per-arm recursion |
| generic-application branch | 767-891 | 125 | lt, ctor, interior, args, segments, ctxFor, beforeLoop; writes lowerCtx.reservedKeywords/unresolved/unspellable |
| primitive atom | 893-896 | 4 | s |
| reserved-keyword atom dispositions | 897-926 | 30 | s; writes lowerCtx.reservedKeywords |
| NamedType resolution atom | 927-973 | 47 | s; reads lowerCtx.bodyTypeMap; writes lowerCtx.unresolved, lowerCtx.defs |
| unspellable catch-all | 974-975 | 2 | writes lowerCtx.unspellable |

src/parser/params.ts:767-771 (the branch's own locals are private to it):

```ts
  const lt = s.indexOf("<");
  if (lt > 0 && s.endsWith(">")) {
    const ctor = s.slice(0, lt).trim();
    const interior = s.slice(lt + 1, s.length - 1);
    const args = splitTopLevel(interior, ",");
```

The generic branch ends at 891 with `pushCutBracketGroupAsLastResort(interior, lowerCtx, beforeLoop); return {};` — nothing after the branch reads its locals.

## Why this is a problem
Strong band (241 LOC ≥ 200): presumption of breakdown, not filed only on a strong concrete reason. Reasons considered and defeated: (a) closed-enumeration dispatch — the top level does mirror the Type grammar's closed alternative set (grammar.md §Type grammar), but the concrete reason requires each arm to be short, and the longest arm is 125 LOC (itself over the function justify threshold); (b) single algorithm with shared local state — cross-branch state is already carried by the `LowerCtx` parameter object; the generic branch's seven locals (lt, ctor, interior, args, segments, ctxFor, beforeLoop) are read by no other branch, so a seam threads only `(s, lowerCtx)` plus recursion; (c) strong reasons — no exemption in quality/exemptions.json for this host, no measured cost cited, no reverted split found; the gate ORDER inside the branch is bug-mandated (0281 before 0282 before 0284 before the catch-all, per the comments at 806-885) but moves wholesale with the branch, so no observable step is interleaved by a seam.

## Suggested direction (non-binding, optional)
Hypotheses, unproven. Seam A: the generic-application branch (767-891) -> `lowerGenericApplication(s, lowerCtx): Record<string, unknown> | undefined` (hypothesis) — 125 LOC, no exported symbols moved, no external importers, recurses back into lowerTypeExpr via the existing lowerGenericArgument helper. Seam B: the reserved-keyword atom dispositions (897-926) -> `lowerReservedAtom(s, lowerCtx)` (hypothesis) — 30 LOC, no exports moved. None identified yet for the NamedType arm.

## False-positive check
Band: strong per the authoritative map (241 LOC). Reasons-considered list recorded above with the defeating evidence (longest-arm LOC counted). Exemptions check: no D9 key for src/parser/params.ts#lowerTypeExpr. Generated-code check: hand-written, bug-annotated. Spec-mirror check: the dispatch mirrors grammar.md's Type alternatives, but the 125-LOC arm defeats the short-arms requirement of that reason class. Ranges re-read before filing (700-976).

## Triage
verdict: questionable — accounting verified (size-scan: lowerTypeExpr 736-976, 241 LOC, strong band; no D9 exemption; all seven inventory rows re-measure exactly and the generic arm's seven locals are unread after :891; closed-enumeration reason considered and defeated by the 125-LOC arm per this wave's own standard), but 92 of the arm's 125 lines are bug-rationale comments (33 code lines), so the target shape needs a human ruling (triage: claude-fable-5-1)
