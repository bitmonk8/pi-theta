---
id: pending
title: runToolCallEffect bundles the theta-callable invoke route, the with-clause gate, the runtime-tool route, and the Pi-tool route in one 179-LOC function
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/effectful-statement-host.ts:343-521
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/effectful-statement-host.ts#runToolCallEffect
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# runToolCallEffect bundles the theta-callable invoke route, the with-clause gate, the runtime-tool route, and the Pi-tool route in one 179-LOC function

## Observation
`runToolCallEffect` (src/runtime/effectful-statement-host.ts:343-521, 179 LOC, justify band per the structural map) dispatches one `<name>(args)` code-tool call. The file's header names it as one of the three real-effect dispatchers assembled into the `V19c` executor's `StatementEvalHost` seam. Inside, the function is four sequential routes selected by `deps.classifyCall` and the expression shape, each ending in a `return`.

## Evidence
Step inventory (line ranges from the current file; the map's declaration span is 343-521):

| phase | lines | LOC | reads/writes |
|---|---|---|---|
| theta-callable-as-invoke route: `resolveCallAsInvoke` → `runInvokeChild`, FN-5 pass-through, wrap/bare provenance split, `recordInvokeHop` | 350-417 | 68 | expr, env, deps, chain; locals child, invokeOutcome, result, innerKind, wrapped |
| with-clause fail-closed gate (INV-8/TOOL-1 belt for Pi-tool dispatch) | 418-435 | 18 | expr only |
| runtime-tool route (RFC 0011 §6.3): checkpoint, signal gate, `argViolation` net, `awaitToolSettlementOrAbort` race | 436-473 | 38 | expr, env, deps; locals rtCall, settlement |
| Pi-tool code-side route: `resolveToolCall` → `runCodeSideToolCall`, six-arm outcome switch incl. `return-shape-defect` throw | 474-520 | 47 | expr, env, deps, evaluatedToolArgs; locals call, outcome |

Route selectors, verbatim:

```
360:    deps.classifyCall?.(expr, env) === "theta-callable" &&
425:  if (expr.withClause !== undefined) {
442:    deps.classifyCall?.(expr, env) === "runtime-tool" &&
474:  const call = deps.resolveToolCall(expr, env, evaluatedToolArgs);
```

Seam cost: the four routes share only the function's five parameters (`expr`, `env`, `deps`, `evaluatedToolArgs`, `chain`); every named local above is route-private, so no state object would need inventing.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered: (1) closed-enumeration dispatch — the routes do mirror the closed `classifyCall` set `{pi-tool, theta-callable, runtime-tool}` (RFC 0011 §6.3; tool-calls.md:38/46), but the reason requires each arm to be short, and the theta-callable arm is 68 LOC and the Pi-tool arm 47 LOC — defeated. (2) Single algorithm with shared local state — defeated: the routes share only the five parameters; no local crosses a route boundary. (3) Data-only / grammar production / generated — not applicable. Additionally, the theta-callable arm's wrap/bare provenance block (376-413) restates the same rule `runInvokeEffect` applies at 585-608 (both compute `innerKind`, test `source === "boundary-minted" || (innerKind === "cancelled" && deps.signal.aborted)`, then `surfaceThetaCallableCalleeFailure` + `recordInvokeHop`), so the current shape also carries a near-clone inside the host.

## Suggested direction (non-binding, optional)
Seam A (unproven): the theta-callable route → `runThetaCallableCallEffect` helper (in-file) — 68 LOC, no exported symbols move, 0 external importers, calls back into `siteOf` and shares the callee-Err wrap with `runInvokeEffect`. Seam B (unproven): the runtime-tool route → `runRuntimeToolEffect` helper — 38 LOC, no exports move, 0 external importers. Seam C (unproven): hoist the shared wrap/bare provenance split (376-413 / 585-608) into one helper used by both effect runners.

## False-positive check
Band: justify (179 LOC, FN_BANDS.justify = 100). Reasons considered and defeated as listed above (closed-enumeration defeated by 68-LOC longest arm; shared-local-state defeated by parameter-only sharing). Exemptions check: quality/exemptions.json has no entry for `src/runtime/effectful-statement-host.ts#runToolCallEffect`. Generated-code check: hand-written leaf with V19d header rationale, not generated. Spec-mirror check: the route set mirrors RFC 0011 §6.3 / tool-calls.md but the arms are not short, so the enumeration length does not account for the total. Existing filings checked: PTQ-0594 concerns test-harness scaffolding for this file, not this function.

## Triage
verdict: questionable — accounting verified: size-scan map confirms runToolCallEffect 343-521 = 179 LOC justify band, no exemptions.json entry; selectors at 360/425/442/474 reproduce and the four routes share only the five parameters (locals child/invokeOutcome/result/innerKind/wrapped, rtCall/settlement, call/outcome are route-private); closed-enumeration reason is real (tool-calls.md:36-46 Pi-tool/theta/runtime-tool table) but its 68-LOC longest arm sits between the kept-whole (~45-54) and filed (205) precedents, so keep-whole vs Seams A/B/C is a human ruling; not a dup of PTQ-0594 (test scaffolding) or PTQ-0940 (D7 fixture clone); the 376-413 vs 585-608 wrap/bare near-clone is D4's (already routed by shard-14) (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map (one-line manifest) reproduces `runToolCallEffect 343-521 — 179 LOC — band justify`, no exemptions.json entry for the file or function; the four route selectors at 360/425/442/474 match verbatim and every named local (child/invokeOutcome/result/innerKind/wrapped; rtCall/settlement; call/outcome) is declared and read inside its own route, so the ≥6-shared-locals reason is not overlooked; closed-enumeration reason is real (tool-calls.md:36-40 Pi-tool/registered-theta/runtime-tool table) but the theta-callable arm at 68 LOC and the Pi-tool arm at 47 LOC exceed a short-arm dispatch, so keep-whole vs Seams A/B is a human ruling; no reverted prior split in git; Seam C is PTQ-1122's D4 root cause (376-413 vs 585-608 clone), not a dup of this breakdown filing; not a dup of PTQ-0594 (test scaffolding) (triage: claude-fable-5-1)
