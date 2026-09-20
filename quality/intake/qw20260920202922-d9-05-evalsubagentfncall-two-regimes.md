---
id: pending
title: evalSubagentFnCall bundles two execution regimes (child-process and in-process session) plus argument binding and flow mapping in 126 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:688-813
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts#evalSubagentFnCall
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# evalSubagentFnCall bundles two execution regimes (child-process and in-process session) plus argument binding and flow mapping in 126 LOC

## Observation
`evalSubagentFnCall` (src/runtime/statement-executor.ts:688-813, 126 LOC —
justify band) evaluates an RFC 0001 `subagent fn` call. After arity check and
argument binding it forks into two mutually exclusive regimes: the production
child-process path (`deps.host.runSubagentFnChild`, returns early at line 741)
and the in-process spawned-session fallback, each with its own FN-6 panic
downgrade, followed by a Flow-to-result mapping switch.

## Evidence
Step inventory (anchors verified in the current file):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| arity check + isolated scope + arg binding | 688-711 | 24 | fn, expr, env, deps; scope, argValues |
| production child-process regime (RFC 0012 §10) + boundary downgrade | 713-741 | 29 | fn, argValues, expr, env, deps; outcome |
| in-process regime: spawn/INV-4 frame/execute/exit + FN-6 downgrade | 743-789 | 47 | fn, scope, deps; entered, bodyDeps, flow |
| Flow -> result mapping (callee-Err wrap, cancel) | 790-813 | 24 | flow, fn |

Regime fork (statement-executor.ts:718-719, 741):

```ts
  if (deps.host.runSubagentFnChild !== undefined) {
    let outcome: SubagentFnChildOutcome;
    ...
    return mapSubagentFnChildOutcome(outcome, fn.name, deps.signal);
```

The two regimes never share state beyond `(fn, argValues/scope, deps)`: the
child path uses `argValues` and never touches `scope`; the in-process path uses
`scope` and never touches `argValues` after binding.

## Why this is a problem
Justify band carries a presumption of breakdown unless a concrete reason is
recorded. Reasons considered and defeated: closed-enumeration dispatch — only
the 24-LOC tail switch mirrors the closed Flow set; the two regimes are not
enumeration arms; single algorithm with shared local state — extracting the
in-process regime threads (fn, scope, deps) and the child regime threads
(fn, argValues, expr, env, deps): 3-5 values, below the 6-local bar, and the
regimes are disjoint in the locals they consume (argValues vs scope); data-only
/ grammar production / generated — no. No exemptions entry for this host key.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: in-process regime (743-789) ->
`runSubagentFnInProcess(fn, scope, deps)` in-file helper returning `Flow`
(hypothesis) — 47 LOC, 0 exported symbols, 0 external importers,
back-references `executeBlock`, `pushCountableFrame`, `subagentInfraError`.
Seam B: child-process regime (713-741) -> `runSubagentFnViaChild(...)` helper
(hypothesis) — 29 LOC, 0 exports, back-references `panicSiteFile`,
`mapSubagentFnChildOutcome`, `subagentInfraError`.

## False-positive check
Band check: 126 LOC (justify) per the map. Reasons-considered list above with
counted defeats (locals per regime named; tail switch measured 24 LOC).
Exemptions check: no `src/runtime/statement-executor.ts#evalSubagentFnCall`
key in quality/exemptions.json. Generated-code check: hand-written, RFC/bug
annotated (RFC 0001/0012, bug 0303). Spec-mirror check: invocation.md
§Failures names the downgrade obligations both regimes implement — an
obligation shared by two paths, not an enumeration licensing one long body.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 688-813 / 126 LOC / justify band (FN_BANDS justify=100), four-phase inventory is real (child path 718-741 never reads `scope`, in-process path 743-813 never reads `argValues`, tail switch consumes only `flow`/`fn`), no exemptions.json key for the host, no reverted prior split in git, no overlooked concrete/strong keep-whole reason (closed-enum is only the 24-LOC tail; max 5 threaded locals per seam); sibling d9-01 is the file-level host, not a duplicate; target seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map reproduces 688-813 / 126 LOC / justify (FN_BANDS justify=100), no exemptions.json key for host or file; four-row inventory real and locals-disjoint (child regime 713-741 reads fn/argValues/expr/env/deps and never `scope`, early-returns at 741; in-process regime 743-789 reads fn/scope/deps and never `argValues`; tail switch 790-813 consumes only flow/fn); cross-row locals are scope/argValues/flow (3), max 5 threaded per seam so no ≥6-shared-locals reason; closed-enum is only the 24-LOC Flow switch; `git log -L688,813` shows monotone growth (645bcb02→96f9a136→770cbb82→89faa7c5) with no reverted split; d9-01 is the file-level host key, not a duplicate; seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
