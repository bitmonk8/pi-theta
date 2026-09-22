---
id: PTQ-1279
title: ProductionThetaProducer.#resolveRuntimeToolCall bundles arg binding, the validation net, and per-name dispatch construction in one 102-LOC body
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:4332-4433
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#resolveRuntimeToolCall
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# ProductionThetaProducer.#resolveRuntimeToolCall bundles arg binding, the validation net, and per-name dispatch construction in one 102-LOC body

## Observation
`#resolveRuntimeToolCall` (src/extension/production-theta-producer.ts:4332-4433, 102 LOC, justify band per the wave map) resolves an RFC 0011 §6.3 runtime-tool call to a dispatchable record. It performs entry lookup with a fail-closed guard, left-to-right positional arg evaluation, signature-default binding, the §5.4 string-only argument net, and then a per-canonical-name switch that constructs the dispatch closure.

## Evidence
Step inventory (range re-read in full before filing):

| phase | line range | LOC | locals read / written |
|---|---|---|---|
| entry lookup + fail-closed non-runtime-tool guard | 4339-4358 | 20 | reads `theta.callableSet`, `presentedName`; writes `entry`, `canonicalName`, `sig` |
| positional arg evaluation (left-to-right) | 4359-4364 | 6 | reads `expr.args`, `env`; writes `argValues` |
| signature-default binding | 4366-4375 | 10 | reads `sig.params`, `argValues`; writes `boundArgs` |
| §5.4 string validation net | 4377-4395 | 19 | reads `boundArgs`, `sig.params`, `presentedName`; early Err return |
| per-name dispatch switch + return | 4396-4433 | 38 | reads `hosts`, `boundArgs`, `presentedName`, `signal`; writes `dispatchFn` |

Excerpt of the switch shape (4402-4410):
```ts
    switch (canonicalName) {
      case "compact":
        dispatchFn = () =>
          guardToolExecutePromise(
            executeCompactTool(hosts.ctx, presentedName, boundArgs[0] as string ?? ""),
            signalGuard(signal),
            noopSwallowChannels(),
          );
        break;
```

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered and defeated: (1) Closed-enumeration dispatch — the switch does mirror a spec-named closed set (tool-calls.md #session-control-runtime-tools; `RUNTIME_TOOL_SIGNATURES`) with short arms (longest arm 8 LOC), but the enumeration is 32 of the 102 LOC; the body's length is carried by the 64 LOC of lookup/binding/validation preceding it, so "the length is the enumeration's" does not hold. (2) Single algorithm with shared local state — the pipeline hands forward at most three values per boundary (`sig`, `argValues` -> `boundArgs`; `presentedName`); no 6-local threading cost. (3) Data-only — 0% declarations/tables. (4) Grammar production — not a parser. (5) Generated — hand-written.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): default binding + string validation net (4366-4395) -> `bindRuntimeToolArgs(sig, argValues, presentedName)` module-level helper — ~29 LOC, 0 exported symbols, 0 external importers, no cross-references back into the host. Seam B (hypothesis, unproven): the dispatch switch (4396-4428) -> `buildRuntimeToolDispatch(canonicalName, hosts, presentedName, boundArgs, signal)` module-level helper — ~32 LOC, 0 exports, uses the module-local `signalGuard`/`noopSwallowChannels` only. Seam C: none identified yet for the entry guard.

## False-positive check
Band confirmed from the wave map (102 LOC, justify). Reasons-considered list above with defeating evidence per reason (the closed-enumeration count — 32 of 102 LOC — is the deciding measurement). Exemptions check: quality/exemptions.json holds one entry for this file (`D8:...#firstAdmittingArmProperties`) — not this host, not D9. Generated-code check: hand-written. Spec-mirror check: the switch mirrors the closed runtime-tool set but the function length does not. Duplicate-filing check: no existing PTQ names `#resolveRuntimeToolCall` (PTQ-1152 covers `run-tool-call-effect` in runtime/; PTQ-1150 is the file-level filing).

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces #resolveRuntimeToolCall at 4332-4433, 102 LOC, band justify (FN_BANDS justify=100); the five inventory rows are real distinct steps with disjoint written locals (guard→entry/canonicalName/sig 4338-4357, arg eval→argValues 4359-4364, default binding→boundArgs 4366-4375, §5.4 net early-return 4377-4395, dispatch switch→dispatchFn 4396-4433) and the switch excerpt matches at 4402-4410; the closed-enumeration count holds (switch 4402-4428 = 27 lines, 32 with `let dispatchFn`+comment, of 102) so the enumeration does not carry the body's length; the dispatch phase reads 5 locals (canonicalName/hosts/boundArgs/presentedName/signal), below the ≥6 shared-locals bar; RFC 0011 §808-819/864/891 describe the method's four steps but state no invariant requiring one body; quality/exemptions.json holds only D8:#firstAdmittingArmProperties for this file (not this host, not D9); the two earlier REVIEW_LOG keep-wholes (qw20260920223212, qw20260921001431 'closed-enum') were reviewer notes not human rulings and this filing answers them with the 32/102 measurement; PTQ-1150 is the file-level breakdown (different root cause, same coexistence pattern as PTQ-1168/1183/1188) and PTQ-1099 was a citation drift in this method, so no duplicate (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run reproduces #resolveRuntimeToolCall at 4329-4430 (3-line drift from the cited 4332-4433), 102 LOC, band justify (FN_BANDS justify=100, not exempt); the five inventory rows re-read as real distinct steps writing disjoint locals (guard→entry/canonicalName/sig, arg eval→argValues, default binding→boundArgs, §5.4 net early-return, switch→dispatchFn) and the compact-arm excerpt matches at 4399-4407; the switch spans 27 lines (32 with `let dispatchFn`+comment) of 102 so the closed-enumeration reason covers only the tail, not the body's length; the dispatch phase reads 5 locals, under the ≥6 shared-locals bar; header cites tool-calls.md #session-control-runtime-tools / cancellation.md #cncl-1 without a one-body invariant; quality/exemptions.json carries only D8:#firstAdmittingArmProperties for this file; REVIEW_LOG keep-wholes (qw20260920223212, qw20260921001431) were reviewer notes not human rulings and qw20260922164435 defers to this filing; grep of quality/issues finds no PTQ naming #resolveRuntimeToolCall (PTQ-1150 is the file-level breakdown, PTQ-1099 a citation drift) so not a duplicate (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run places #resolveRuntimeToolCall at 4327-4428 (5-line drift from the cited 4332-4433), 102 LOC, band justify (FN_BANDS justify=100), no D9 row for this host in quality/exemptions.json (only D8:#firstAdmittingArmProperties); the five inventory rows re-read as distinct steps writing disjoint locals (fail-closed guard→entry/canonicalName/sig 4333-4352, arg eval→argValues 4357-4359, default binding→boundArgs 4363-4370, §5.4 net early-return 4375-4389, switch→dispatchFn 4396-4423) and the compact-arm excerpt matches verbatim at 4397-4405; closed-enumeration reason re-measured — switch body 27 lines (32 with `let dispatchFn`+comment) of 102, so the spec-mirrored three-name set (tool-calls.md #session-control-runtime-tools, 'closed three-name set') carries only the tail; cross-phase locals are presentedName/canonicalName/sig/argValues/boundArgs (5) plus the `signal` param, under the ≥6 shared-locals bar; tool-calls.md lines 21/25/29 pin positional binding, the string net and the closed set but no one-body invariant; REVIEW_LOG:560/563 keep-wholes are reviewer notes (no TRIAGE_LOG ruling, no exemptions row) and REVIEW_LOG:619 is this filing; grep -rl resolveRuntimeToolCall quality/issues returns nothing, so not a duplicate (PTQ-1150 is the file-level breakdown, PTQ-1099 a citation drift in this method) (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
