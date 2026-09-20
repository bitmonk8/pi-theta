---
id: PTQ-1117
title: typed-query respond-repair switch cloned in three terminal arms
lens: D4
status: open
verdict: confirmed
locations:
  - src/runtime/query-tool-loop.ts:611-631
  - src/runtime/query-tool-loop.ts:667-687
  - src/runtime/query-tool-loop.ts:741-761
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# typed-query respond-repair switch cloned in three terminal arms

## Observation
`runTypedQueryLoop` in `src/runtime/query-tool-loop.ts` routes three different forced-respond failure modes through the same `schemaValidation.runRespondRepair` loop: the `noncompliance` arm (ERR-17/QRY-9), the depth-walk failure arm (CIO-3/ceiling #4), and the AJV schema-validation failure arm (QRY-22). Each arm constructs a different `ValidationFailure` input, then contains the same `switch (repair.kind)` over `{ value, validation, propagated }` with byte-identical return statements. The shared switch body is repeated three times in the same function, with only the preceding `failure` object and trailing fallback event construction differing between arms.

## Evidence
Clone-map groups G006, G007, and G015 all overlap on these three switch-shaped spans; re-reading at HEAD confirms the switch bodies are identical except for local comments.

**Site 1 — noncompliance arm** `src/runtime/query-tool-loop.ts:611-631`:
```ts
      switch (repair.kind) {
        case "value":
          // A respond-repair follow-up produced a validated value: it is the
          // typed query's final result.
          return { kind: "value", value: repair.value, rounds, forcedRespond, committed };
        case "validation": {
          // Terminal non-compliance / non-conformance: surface the repair
          // loop's ValidationError with the operator-facing RuntimeEvent.
          // PIC-1 (d): when a follow-up ran, its own slot count masks the event
          // (bug 0355) — `repair.surfacing` carries it.
          const event = buildValidationEvent(config, repair.error, slotCountAtDispatch, repair.surfacing);
          return { kind: "validation", error: repair.error, event, rounds, forcedRespond, committed };
        }
        case "propagated":
          // A proximate non-validation failure won respond-repair (QRY-11).
          return { kind: "propagated", error: repair.error, rounds, forcedRespond, committed };
      }
```

**Site 2 — depth-walk arm** `src/runtime/query-tool-loop.ts:667-687`:
```ts
      switch (repair.kind) {
        case "value":
          // A respond-repair follow-up re-validated successfully: its corrected
          // value is the typed query's final result.
          return { kind: "value", value: repair.value, rounds, forcedRespond, committed };
        case "validation": {
          // Terminal non-conformance: surface the repair loop's ValidationError
          // on the operator-facing RuntimeEvent. PIC-1 (d) / bug 0355: a
          // depth-arm repair terminal raised on a follow-up masks against the
          // follow-up's own slot count (`repair.surfacing`), not the parent's.
          const event = buildValidationEvent(config, repair.error, slotCountAtDispatch, repair.surfacing);
          return { kind: "validation", error: repair.error, event, rounds, forcedRespond, committed };
        }
        case "propagated":
          // A proximate non-validation failure won respond-repair (QRY-11).
          return { kind: "propagated", error: repair.error, rounds, forcedRespond, committed };
      }
```

**Site 3 — schema-validation arm** `src/runtime/query-tool-loop.ts:741-761`:
```ts
      switch (repair.kind) {
        case "value":
          // A respond-repair follow-up re-validated successfully: its corrected
          // value is the typed query's final result.
          return { kind: "value", value: repair.value, rounds, forcedRespond, committed };
        case "validation": {
          // Terminal non-conformance: surface the schema_validation
          // `ValidationError` on the operator-facing `RuntimeEvent`, enumerating
          // any co-satisfied ceiling #2 via `V9d`'s V1-reachable predicate.
          // PIC-1 (d) / bug 0355: a follow-up-originated terminal masks against
          // the follow-up's own slot count (`repair.surfacing`).
          const event = buildValidationEvent(config, repair.error, slotCountAtDispatch, repair.surfacing);
          return { kind: "validation", error: repair.error, event, rounds, forcedRespond, committed };
        }
        case "propagated":
          // A proximate non-validation failure won respond-repair (QRY-11): the
          // proximate cause propagates as the query's `Err`.
          return { kind: "propagated", error: repair.error, rounds, forcedRespond, committed };
      }
```

Diff verdict: **identical** return expressions and `buildValidationEvent` call; comments differ only in the failure-mode noun phrases. The surrounding `failure` construction and the post-switch fallback diverge by design (each arm supplies its own `ValidationFailure` and terminal message), but the `RespondRepairOutcome` dispatch itself is the same code path copied three times.

## Why this is a problem
This is load-bearing duplication, not incidental similarity. The three arms are three different trigger conditions for the same `RespondRepairOutcome` state machine. If `RespondRepairOutcome` ever gains a new `kind` (for example, a future retry/escalation arm), all three switches must be updated together or one failure mode will silently fall through. Likewise, any change to the terminal return shape (e.g., adding a new field to the `value`/`validation`/`propagated` outcomes) must be applied in all three places. Today the code relies on copy-paste discipline to keep them aligned.

## Suggested direction (non-binding, optional)
A single helper inside `src/runtime/query-tool-loop.ts` could take a `ValidationFailure` and the caller-specific terminal fallback, run `schemaValidation.runRespondRepair(failure)`, and dispatch the shared `switch`. The three arms would then only differ in how they build the `failure` object and in their no-repair fallback, keeping the respond-repair state machine in one place.

## False-positive check
- Re-read all three spans at HEAD before filing; lines are live code in the current function.
- Verified the three switch bodies are the same control flow and identical return expressions.
- Searched `src/runtime/` for other `runRespondRepair` call sites: only this function contains the three copies.
- Not a spec-normative vector table; the similarity is implementation code, not a repeated clause from a spec document.
- No occurrences in `tests/`; this is production source under `src/runtime/`.
- Not generated code.

## Triage
verdict: confirmed — all three `switch (repair.kind)` bodies verified byte-identical (excluding comments) at the cited lines and live under `schemaValidation !== undefined`; clone-scan reproduces G015 (610-628, 666-684, 740-760, identical) plus pairwise G006/G007; sole `runRespondRepair` call sites in src/; not a spec vector table; no existing PTQ tracks this root cause (PTQ-0180 is frontmatter, the pending D9 nine-phases candidate is a breakdown claim) (triage: claude-fable-5-1)
