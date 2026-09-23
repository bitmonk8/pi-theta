---
id: pending
title: ProductionThetaProducer.driveSubagentRootRegime remains 175 LOC after the PTQ-1192 fix landed only one of its three ratified seams
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:3130-3304
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#driveSubagentRootRegime
d9_band: justify
wave: qw20260923023517
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# ProductionThetaProducer.driveSubagentRootRegime remains 175 LOC after the PTQ-1192 fix landed only one of its three ratified seams

## Observation
`driveSubagentRootRegime` (src/extension/production-theta-producer.ts:3130-3304) is 175 LOC — justify band (function threshold 100; map-quoted). It is the child-process root trampoline. PTQ-1192 (confirmed, fixed) filed it at 226 LOC with three ratified seams; the fix extracted seam A only — `#confirmChildModelOrRefuse` now exists at 3307-3369 (map) and is called at 3170. Seams B (the Ok-arm envelope guard chain) and C (marshalled-params intake + inbound bind) from that confirmed issue remain inline, and the method is still over the justify threshold.

## Evidence
Fresh step inventory (line anchors verified by grep against the current file):

| phase | lines | LOC | locals written (read later by) |
|---|---|---|---|
| calleePath + envelope/outcome emitters, PIC-59 single-envelope latch | 3131-3164 | 34 | calleePath, emitEnvelope, outcomeEmitted, emitOutcome, emitErr (every later phase) |
| entry resolve + PIC-62 model-confirm call + fn-entry dispatch | 3166-3178 | 13 | entry, model |
| PIC-60 marshalled-params intake + inbound bind (PTQ-1192 seam C) | 3180-3217 | 38 | intake, paramBindings, rootBindInput |
| body drive + FN-5 terminal projection | 3222-3235 | 14 | binding, execution, terminal |
| Ok-arm envelope guard chain: depth, non-representable, enum-tag carriage, shutdown request (PTQ-1192 seam B) | 3236-3276 | 41 | tooDeep, nonRepresentable |
| Err-propagated arm + PIC-59 panic catch + teardown finally | 3277-3304 | 28 | — |

Seam-C block still inline (3184-3196, excerpt):
```ts
    const intake = this.#intakeSubagentRootParams(theta);
    if (!intake.ok) {
      (this.#input.emitDiagnostic ?? ((): void => {}))(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
      return;
    }
    ...
    const paramBindings =
      intake.params !== undefined && intake.params !== null
        ? bindParamsInbound({
```

Seam-B block still inline (3249-3274, excerpt):
```ts
        const tooDeep = mapTooDeepReturnValue(terminal.value as unknown, calleePath);
        const nonRepresentable =
          tooDeep === undefined
            ? mapNonRepresentableReturnValue(terminal.value as unknown, calleePath)
            : undefined;
        if (tooDeep !== undefined) {
          emitErr(tooDeep, "mint");
        } else if (nonRepresentable !== undefined) {
```

## Why this is a problem
Justify band (175 LOC ≥ 100): presumption of breakdown; not filed only on a concrete recorded reason. Reasons considered and defeated: (a) spec-cited invariant as one critical section — PIC-59's single-envelope rule is enforced by the `outcomeEmitted` latch and the reified emitter closures, not by body contiguity; the method already hands all three emitters onward to `#driveSubagentFnEntry` at 3175, so a seam-B/seam-C helper receiving them preserves the latch exactly (PTQ-1192's own recorded defeat, unchanged in the current code); (b) single algorithm with shared local state — after 3164 the cross-phase state is the emitter trio plus `calleePath` (4 values, under the 6-local bar); (c) closed-enumeration dispatch / data-only / generated — no (hand-authored narrative comments, no generator banner); (d) human ruling — quality/exemptions.json holds only `D8:...#firstAdmittingArmProperties` for this file, no D9 row for this member. PTQ-1192 is status fixed, so this is the post-fix residual with a fresh inventory — the same pattern PTQ-1290 (runBinder residual) followed and had confirmed.

## Suggested direction (non-binding, optional)
All hypotheses unproven; PTQ-1192's own ratified seams B and C still fit: Seam B: the Ok-arm envelope guard chain (3236-3276) -> `#emitOkEnvelopeGuarded(terminal, calleePath, ctx)` (hypothesis) — ~41 LOC, no exported symbols, 0 external importers, cross-refs back into the host: emitErr/emitEnvelope/emitOutcome closures and `#requestVisibleChildShutdown`. Seam C: params intake + inbound bind (3180-3217) -> `#bindMarshalledRootParams(theta, calleePath, emitErr)` (hypothesis) — ~38 LOC, no exports, cross-refs back: `#intakeSubagentRootParams`, `this.#input.root.schemaValidator`.

## False-positive check
Band: map-quoted 175 LOC / justify, not recounted by hand. Reasons-considered list above with defeating evidence per reason. Exemptions check: quality/exemptions.json — no D9 row for this host. Generated-code check: hand-authored. Spec-mirror check: the phases cite separate clauses (PIC-59, PIC-60, PIC-62, FN-5, RFC 0012 §7/§10), not one closed enumeration. Duplicate check: PTQ-1192 (same member key) is resolved/fixed — this is the post-fix residual; PTQ-1285 (open, confirmed) keys the FILE host, not this member; no pending intake filing names this member.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `| 3130-3304 | 175 | public | driveSubagentRootRegime |` band justify (FN justify ≥100) with `#confirmChildModelOrRefuse` 3307-3369 / 63 LOC as PTQ-1192's landed seam A (fix commit 475e62db, no keep-whole or seams-declined note in quality/resolved/PTQ-1192 whose last line is the 2026-09-21 batch ratification); both excerpts byte-match at 3184-3196 and 3249-3274; the six inventory rows are real contiguous phases at the cited offsets — seam C (3180-3217) closes over only theta/bindInput/calleePath/emitErr + this, seam B (3236-3276) over terminal/calleePath/ctx + the emitter trio + this, and the only other cross-row locals are entry (row 2 only), rootBindInput (3→4), binding (4→finally) and terminal (4→5), so the ≥2-concern inventory stands and reason (b) is not overlooked (cross-phase state under 6 with linear hand-off, the same rebuttal the human accepted on this host at 226 LOC); reason (a) correctly defeated by the existing `#driveSubagentFnEntry(bindInput, entry.name, calleePath, emitEnvelope, emitErr, emitOutcome)` call at 3175 (envelope exactly-once is positional control flow preserved by a same-position helper, as PTQ-1192's triage already recorded); quality/exemptions.json carries only `D8:…#firstAdmittingArmProperties` for this file, and the 2026-09-16 REVIEW_LOG KEEP was a D8-lens right-sizing note superseded by the later human-confirmed PTQ-1192; not a duplicate — PTQ-1192 is resolved/fixed, PTQ-1285 keys the FILE host listing this method as one member of a cluster row, and same-repo intake qw20260922211400-d4-01 is a D4 parallel filing (root vs fn-entry regimes), a different root cause; whether a second cut after seam A is worth it, and which of seams B/C, is a design decision for a human ruling (triage: claude-fable-5-1)
