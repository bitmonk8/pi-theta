---
id: pending
title: callable-lowering.ts bundles the RFC-0006 subagent drive/teardown binding with four pure callable-set lowering families at 604 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/callable-lowering.ts:1-604
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/callable-lowering.ts
d9_band: zone
wave: qw20260923023517
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# callable-lowering.ts bundles the RFC-0006 subagent drive/teardown binding with four pure callable-set lowering families at 604 LOC

## Observation
`src/extension/callable-lowering.ts` is 604 LOC (structural map; zone band, threshold 600). Its header states the role: "Callable-set lowering & subagent drive-binding helpers for the production theta producer ... plus the RFC-0006 subagent drive binding (`buildSubagentDriveBinding`) and the prompt-mode terminal-outcome surface. ... Split out of production-theta-producer.ts (PTQ-1285)" (lines 1-12). The module was created one wave ago by the PTQ-1285 fix as a verbatim move and was already over the zone threshold at birth (the fix note records "src/extension/callable-lowering.ts (604 LOC, zone)"). The PTQ-1285 seam named the destination for the moved cluster; no ruling exists on this file's own internal shape, and `quality/exemptions.json` carries no key for it.

## Evidence
Distinct-concern inventory (declaration ranges and LOC from the authoritative map; every range re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| subagent child drive/teardown binding (RFC 0006, PIC-59/65/66) — a closure factory over a launched child process | `buildSubagentDriveBinding` (1 src/0 tests) | 88-192 | 105 |
| terminal-outcome surface projection (PIC-53, FN-5) | `promptModeSurface` (1/0), `surfaceCalleeFinalValue` (1/0) | 61-85, 212-221 | 35 |
| frozen callable-set name/entry lowering | `subagentFnCallableSet` (1/0), `callableSetPiToolNames` (1/0), `callableSetThetaEntries` (1/0), `thetaCalleePath` (1/0), `presentedCallableNames` (2/0) | 233-252, 262-276, 296-328, 376-389, 444-464 | 103 |
| code-side call/environment lowering (V14g, V15k) | `lowerToolCallParams` (1/0), `buildBoundEnvironment` (2/0) | 409-425, 481-522 | 59 |
| model-driven `.theta` tool adapter (SUBAG-2) | `LoweredThetaCallableResult` (1/0), `lowerThetaCallableModelResult` (0/0, private), `ModelDrivenThetaCall` (1/0), `lowerModelDrivenThetaCall` (1/0) | 279-282, 338-352, 531-551, 576-604 | 69 |

The first row is behaviourally unlike every other: it launches nothing pure — it wires a live child process's drive loop, cancellation detach, placement-lease release, params-file cleanup, and bounded-kill teardown around four mutable closure locals (`forwardedEnumTagsHolder`, `lastDriveSource`, `lastFnTail`, `toreDown`, lines 118-160). Its import affinity is entirely runtime-side and touched by no sibling: `runSubagentChildTeardown` (runtime/subagent-isolation), `driveSubagentChild`/`attachSubagentCancellation`/`SubagentInvocationResult` (runtime/subagent-json-driver), `PlacementLease` (runtime/subagent-placement-selection), `EnumTagEntry`/`FnTail` (runtime/subagent-envelope), `ActiveInvocationTicket` (runtime/active-invocation-registry), `RuntimeRoot` (runtime-root) — 9 imports used only by this one function, while it calls 0 of the module's other 13 declarations. Excerpt (159-166):

```ts
      await runSubagentChildTeardown(child, {
        emitDiagnostic,
        detachAbortListener: cancellation.detach,
        settleDisposeBarrier: ticket.settleDisposeBarrier,
        clock: root.clock,
      });
    };

    return {
```

## Why this is a problem
Zone band (604 ≥ 600): a breakdown finding needs a distinct-concern inventory with ≥ 2 concerns — five rows above, and the drive-binding row shares no member, no import, and no state with the four lowering rows. Reasons considered and defeated: (a) single algorithm with shared local state — every declaration is a module-level function consuming only its arguments (the header itself: "None of these touch `ProductionThetaProducer` instance state; they consume only their arguments"); no state spans the rows; (b) closed-enumeration dispatch — no spec-set switch; the LOC sits in fourteen separate declarations; (c) data-only — two small interfaces (~25 LOC), far under 80%; (d) grammar production — no; (e) generated — hand-written (bug/RFC-annotated, moved verbatim by the PTQ-1285 fix commit 927b8b63). PTQ-1285 ratified the move OUT of production-theta-producer.ts and named this destination; it did not rule on this file's own bands, and the file exceeded the zone threshold from its first commit.

## Suggested direction (non-binding, optional)
Hypotheses, unproven — the human ratifies one. Seam A: the subagent drive/teardown binding (88-192) -> `./subagent-drive-binding.ts` or a `runtime/subagent-*` sibling (hypothesis) — 105 LOC, 1 exported symbol moved (`buildSubagentDriveBinding`, 1 src/0 tests importer: production-theta-producer.ts), cross-references back into the host: none (its imports are runtime/* plus theta-composition-producer/diagnostic types); the host drops to ~499 LOC (exempt band) and sheds 9 single-consumer imports. Seam B: the model-driven `.theta` adapter group (279-282, 338-352, 531-604) -> `./model-driven-theta-call.ts` (hypothesis) — ~69 LOC, 3 exported symbols moved (`LoweredThetaCallableResult` 1/0, `ModelDrivenThetaCall` 1/0, `lowerModelDrivenThetaCall` 1/0; the private `lowerThetaCallableModelResult` moves with them), cross-references back: none. Seam C: none identified yet.

## False-positive check
Band: zone (604, between 600 and 999) from the authoritative map, not recounted. Reasons-considered list above with the defeating evidence per reason. Exemptions check: `grep callable-lowering quality/exemptions.json` → no entry (read this session; the file holds four keys, none on this host). Generated-code check: hand-written (bug 0016/0072/0342/RFC 0006/0012 comments; created by quality fix commit 927b8b63 as a verbatim move). Spec-mirror check: the header enumerates hosted families, not a closed spec enumeration whose arms the length mirrors. Duplicate check: PTQ-1285 (open) is keyed to `src/extension/production-theta-producer.ts` and its recorded fix names this file only as the seam destination; the two intake siblings touching this file this wave (qw20260923023517-d4-01 theta-callee-path parallel, d8-01 presented-names regex) are D4/D8 on member pairs, not a file-level breakdown; no pending or resolved finding carries d9_host `src/extension/callable-lowering.ts`.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `src/extension/callable-lowering.ts — 604 LOC — band zone` with all 14 declarations at exactly the cited ranges/LOC (61-85 promptModeSurface … 576-604 lowerModelDrivenThetaCall) and importer counts; the cited 159-166 excerpt byte-matches; the ≥2-concern inventory holds — `buildSubagentDriveBinding` (88-192, 105 LOC, itself justify band) is a closure factory over a live child (`forwardedEnumTagsHolder`/`lastDriveSource`/`lastFnTail`/`toreDown` at 118-150) whose runtime-side imports (`runSubagentChildTeardown`, `driveSubagentChild`, `attachSubagentCancellation`, `SubagentInvocationResult`, `PlacementLease`, `EnumTagEntry`, `FnTail`, `ActiveInvocationTicket`, `RuntimeRoot`, plus `InvokeResultSource` — 10, the filing undercounts as 9) grep to lines inside 88-192 only, and it calls none of the other 13 members, which are `this`-free callable-set/environment/model-adapter lowering functions; no overlooked reason — 29 LOC of interfaces (~5 %), no spec-table switch, no generator banner, quality/exemptions.json carries no D9 key for this host, and the file was born at 604 in commit 927b8b63 (verbatim move, no reverted prior split); not a duplicate — PTQ-1285 (open, confirmed) is keyed to `src/extension/production-theta-producer.ts` and names this file only as its seam-B destination, and the same-wave d4-01/d8-01 intakes are member-pair filings; which seam (A: drive binding out to runtime/, B: model-driven adapter out) and what home is a design decision for a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
