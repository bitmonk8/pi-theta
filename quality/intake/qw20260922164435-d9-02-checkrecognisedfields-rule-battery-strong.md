---
id: pending
title: checkRecognisedFields is a 259-LOC single function (strong band) running twelve independent cross-field rule blocks inline behind a 25-name destructure
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/frontmatter.ts:659-917
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/frontmatter.ts#checkRecognisedFields
d9_band: strong
wave: qw20260922164435
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# checkRecognisedFields is a 259-LOC single function (strong band) running twelve independent cross-field rule blocks inline behind a 25-name destructure

## Observation
`checkRecognisedFields` (src/parser/frontmatter.ts:659-917, 259 LOC per the structural map, private, importers 0/0, one caller — `parseFrontmatter` at :1096) runs the cross-field frontmatter contract: required `mode:`, the three closed-set value refusals, model resolution through the injected matcher, `tool_loop`/`respond_repair` block resolution, `params: null`, `tools:` shape, and `respond_repair.methodology`. It was minted by the PTQ-1164 fix (commit 4d18f5cf, Seam B of that ratified split) and sits in the strong band (>= 200). quality/exemptions.json carries no row for this host.

## Evidence
Step inventory (phases, line ranges, LOC; every block reads only destructured `fields` names and writes only the `diagnostics` sink, except the model/block phases which also compute the three returned values):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| 25-name destructure of `fields` | 672-698 | 27 | reads fields |
| missing-mode (gated on yamlErrored, bug 0263) | 700-714 | 15 | modePresent, yamlErrored; diagnostics |
| bind-context-session-on-subagent warning | 716-728 | 13 | bindContextValue, modeValue; diagnostics |
| argument-hint-not-displayed advisory | 730-746 | 17 | argumentHintPresent, descriptionValue; diagnostics |
| model resolution via injected matcher | 748-761 | 14 | modelPresent, modelRaw; writes resolvedModel; diagnostics |
| tool_loop/respond_repair block resolve + shape + sub-keys | 768-797 | 30 | toolLoopNode, respondRepairNode; writes toolLoopResult, respondRepairResult; diagnostics |
| unknown-mode-value refusal | 799-825 | 27 | modePresent, modeValue, modeValueKind; diagnostics |
| unknown-bind-context-value refusal | 827-850 | 24 | bindContextPresent, bindContextValue, bindContextValueKind; diagnostics |
| unknown-bind-echo-value refusal | 852-866 | 15 | bindEchoPresent, bindEchoValue, bindEchoScalar, bindEchoValueKind; diagnostics |
| params-null rejection | 868-888 | 21 | paramsPresent, paramsNode; diagnostics |
| malformed-tools-field refusal | 890-905 | 16 | toolsMalformedRange; diagnostics |
| methodology check + return | 907-916 | 10 | respondRepairNode; diagnostics; returns triple |

Representative rule-block shape, src/parser/frontmatter.ts:707-714:

```ts
  if (!modePresent && !yamlErrored) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/missing-mode",
      file,
      message: "frontmatter is missing required field 'mode:'",
    });
  }
```

No rule block reads another block's output: the only inter-block data flow is `resolvedModel`/`toolLoopResult`/`respondRepairResult` into the return value; the coupling is the emission order alone (doc comment :658 — "in diagnostic order").

## Why this is a problem
Strong-band presumption of breakdown: 259 LOC >= 200 with no strong concrete reason on record. Reasons considered and why each fails:
- Closed-enumeration dispatch: the blocks mirror the registered diagnostic rows for the frontmatter field contract (frontmatter-fields-a.md; code-registry-load.md/-parse.md codes named per block) and the longest block is 30 LOC — concrete, sufficient only in the justify band; the PTQ-1164 triage precedent on this same file already ruled concrete-only reasons insufficient at strong.
- Single algorithm with shared local state: the blocks share one write sink (`diagnostics`) and read disjoint destructured names; only three blocks produce return values. Not 6+ threaded locals — fails, and shows the seams are cheap.
- Data-only / grammar production / generated code: it is imperative rule code, hand-written with bug-numbered rationale (0263, 0296, 0297, 0104, 0206); all fail.
Strong reasons: no spec clause pins the battery as one critical section — "diagnostic order" is preserved by calling extracted rule helpers in the same sequence; no measured cost cited; no prior split reverted (git log --follow shows 4d18f5cf minted this helper as PTQ-1164's ratified fix and it stuck); no human ruling in quality/exemptions.json.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, in confidence order. Seam A: the three closed-set value refusals (unknown-mode/bind-context/bind-echo, :799-866, 66 LOC) -> one shared `pushUnknownValueDiagnostic(present, value, kindToken, range, code, expected, ...)` helper — the three blocks are the same present-but-bad render-scalar-or-kind-token shape; no exported symbols move, 0 external importers. Seam B: the tool_loop/respond_repair cluster (:768-797, 30 LOC) -> a `resolveFrontmatterBlocks(toolLoopNode, respondRepairNode, ...)` helper returning the two results plus its diagnostics — back-references: resolveNonNegIntBlock, checkBlockShape, unknownSubKeyDiagnostics. Seam C: none identified yet.

## False-positive check
- Band: 259 LOC per the structural map (659-917), strong (>= 200); not recounted by hand.
- Exemptions check: quality/exemptions.json has no row for this file or host (four rows total, none on src/parser/frontmatter.ts).
- Reasons-considered list recorded above with the evidence defeating each.
- Generated-code check: hand-written, bug-numbered inline rationale; no generator marker.
- Spec-mirror check: the blocks mirror the registered diagnostic roster, but the 27-LOC destructure and the return plumbing are not enumeration arms, and the mirror is a concrete reason only — insufficient at strong per the PTQ-1164 triage precedent on this same file.
- Duplicate check: PTQ-1164 (fixed) keyed #parseFrontmatter — its fix minted this helper as Seam B; PTQ-1146 (resolved) keyed the pre-split file-level host; PTQ-1238 (fixed, D8) keyed #collectRecognisedFields's roster spelling — no existing filing keys this host.

## Triage
verdict: questionable — accounting verified: independent size-scan map --files re-run gives src/parser/frontmatter.ts#checkRecognisedFields 659-917 / 259 LOC / band strong (FN strong ≥ 200), importers 0/0, sole caller parseFrontmatter at :1096, no frontmatter key in quality/exemptions.json (4 rows, none on this file); all twelve inventory rows sit at the cited lines and sum exactly (27+15+13+17+14+30+27+24+15+21+16+10 = 229 body + 13-line header + 17 blank/gap lines = 259), the :707-714 excerpt is byte-exact, and the rows are real distinct rules — each block reads a disjoint destructured subset (mode/bindContext/argumentHint/model/toolLoop+respondRepair/bindEcho/params/toolsMalformedRange) and writes only the `diagnostics` sink, with resolvedModel/toolLoopResult/respondRepairResult flowing only into the return, so no block consumes another's output; reasons-considered holds: the shared names are pass-through parameters (file, lineCounter, lineOffset, diagnostics), not ≥ 6 threaded algorithm locals; the blocks are independent if-rules, not a switch over an enumeration, and a diagnostic-roster mirror is concrete-only, which PTQ-1164's three triage notes on this same file already ruled insufficient at strong; docs/spec_topics/frontmatter* has no clause pinning cross-field emission order or a single pass (the :658 doc comment is the function's own contract, preserved by sequencing extracted helpers), 47 --follow commits contain no reverted split (4d18f5cf minted this helper as PTQ-1164's fix and stuck), no measured cost; not a duplicate — PTQ-1164 (resolved, #parseFrontmatter) and PTQ-1146 (resolved, file host) are the pre-split hosts, PTQ-1238 is D8 on collectRecognisedFields's roster, sibling d9-01 keys #collectRecognisedFields and qw20260922150013-d9-02 keys the file-level host, so this is the post-fix residual with a fresh ≥ 2-concern inventory (PTQ-0351 precedent); the breakdown shape (Seam A shared refusal helper vs Seam B block cluster vs per-rule helpers) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified on an independent re-run: size-scan map --files gives src/parser/frontmatter.ts#checkRecognisedFields 659-917 / 259 LOC / band strong (FN strong ≥ 200), importers 0/0, the sole caller is parseFrontmatter at :1096 and no other src/extensions/tools/tests reference exists; quality/exemptions.json has 4 rows, none on frontmatter.ts; every inventory row sits at its cited lines (destructure 672-698 is 25 names, missing-mode 707-714 excerpt byte-exact, rule blocks at 716-728/730-746/748-761/768-797/799-825/827-850/852-866/868-888/890-905/907-916) and each is a distinct rule reading a disjoint destructured subset with `diagnostics` as the only shared sink — the only cross-block values (resolvedModel, toolLoopResult, respondRepairResult) flow to the return, not into another block; reasons-considered holds: no ≥ 6 threaded algorithm locals (file/lineCounter/lineOffset/diagnostics are pass-through parameters), independent if-rules are not a switch over a spec enumeration and a diagnostic-roster mirror is concrete-only (already ruled insufficient at strong in PTQ-1164's three notes on this file), docs/spec_topics/frontmatter* has no clause pinning cross-field emission order or a single pass, git -S shows 4d18f5cf minted the helper (PTQ-1164 fix) and it stuck among 47 --follow commits, no measured cost; not a duplicate — PTQ-1164 (#parseFrontmatter) and PTQ-1146 (file host) are resolved pre-split hosts, PTQ-1238 is D8 on collectRecognisedFields, sibling d9-01 keys #collectRecognisedFields and qw20260922150013-d9-02 keys the file-level host; the breakdown shape (shared refusal helper vs block-cluster helper vs per-rule helpers) is a design decision for a human ruling (triage: claude-fable-5-1)
