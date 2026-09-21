---
id: PTQ-1176
title: lowerTypeExpr's generic-application branch is 125 of its 241 LOC, dwarfing the union and atom arms of its Type dispatch
lens: D9
status: fixed
verdict: confirmed
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
verdict: questionable — accounting verified independently: size-scan map re-run gives lowerTypeExpr 736-976, 241 LOC, strong band (FN strong=200) and quality/exemptions.json has no key for src/parser/params.ts or #lowerTypeExpr; function bounds are exactly :736/:976 and all seven inventory rows re-measure (generic arm 767-891 = 125 lines), each row a distinct grammar.md:90-102 Type alternative writing its own sink with only `s` and the `lowerCtx` parameter shared across arms (< 6 shared locals); the arm's seven locals are declared at 767-875 and have zero reads in 892-976; the closed-enumeration reason was engaged, not overlooked, but the arm is 92 comment lines / 33 code lines (0 blank) versus the 38-code-line arms this shard kept whole in rewriteStmt (REVIEW_LOG:547), so whether raw or code LOC defeats the short-arm requirement, and hence the target shape, needs a human ruling; sibling d9-01 keys on the file host and carves out #lowerTypeExpr, so no duplicate (triage: claude-fable-5-1)
verdict: questionable — accounting verified with post-filing drift: size-scan map re-run now reports lowerTypeExpr at 688-928 (cited 736-976; uniform −48 because commit 71af3b5b removed 49 lines inside parseParams at 508-562 and left lowerTypeExpr's body byte-identical), still 241 LOC / strong band (FN strong=200), and quality/exemptions.json has no key for src/parser/params.ts or #lowerTypeExpr; every inventory row re-measures at the shifted lines (generic arm 719-843 = 125 lines, 33 code / 92 comment / 0 blank) and its seven locals (lt, ctor, interior, args, segments, ctxFor, beforeLoop) have zero reads in 844-928, with only `s` and the `lowerCtx` parameter shared across arms (< 6 shared locals, so the single-algorithm reason does not apply); the top-level dispatch does mirror grammar.md:90-96's closed Type alternatives, but the reason requires short arms and the filing engaged and counted it rather than overlooking it; git log --follow shows no reverted split (98bddb7a/af7f932e are bug-fix split-order changes, not extractions); no PTQ in issues/resolved keys on #lowerTypeExpr (PTQ-1115 is a D4 clone in type-compat/type-layer-checks), and siblings d9-01/d9-02 key on the file host and #parseParams — whether raw or code LOC defeats the short-arm requirement, and hence the target shape, needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
