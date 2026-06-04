# Triaged Spec Review - spec

_Generated: 2026-06-04T03:10:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 4 high, 3 medium retained; 13 low discarded; 16 low findings merged into 6 medium findings (plus one co-resolve merge of two high findings); 4 nit dropped; 0 false dropped._

---

# T01 - Operator-bound MUSTs mis-classified as runtime conformance requirements

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Three normative-modal `MUST` sentences bind *operators* (or operator-tooling authors) rather than the loom runtime, so they cannot anchor any conformance test of the implementation. Two sit in the **Runtime event channel** section of `pi-integration-contract.md`: the `display: false` gating paragraph's *"Operators MUST treat all `loom-system-note` content … as durable session-context input"*, and the *Engine-assumption carve-out* paragraph's *"Operators MUST treat a missing terminal event as one of (a)/(b)/(c)"* — the latter admits in the same sentence that no in-band signal distinguishes (a) from (c), making the obligation unfalsifiable by construction. The third is the closing operator-directed `MUST` of NOCEIL-3 in `hard-ceilings.md`, which sits inside a claim whose purpose is to record a *non-existence* of runtime obligation, conflating the runtime non-claim with operator guidance. Per the project's normative-modal convention every `MUST` must anchor an observable runtime obligation; these do not.

## Solution approach

Demote each of the three operator-directed `MUST` sentences to non-normative operator guidance, preserving their substantive content — the `convertToLlm` durability fact, the (a)/(b)/(c) enumeration with its "no in-band signal" caveat, and NOCEIL-3's host-side-mechanism guidance with its "loom 1.0 makes no claim" clause. Rewrite the two sentences in `pi-integration-contract.md`'s **Runtime event channel** section and the closing sentence of NOCEIL-3 in `hard-ceilings.md`.

## Solution constraints

- Out of scope: the genuinely-normative runtime obligations in the same **Runtime event channel** section (the exactly-once emission rule, the `display: false` / `content: ""` pairing, the dedup tuple, the `RuntimeEvent` payload shape, and the engine-assumption carve-out's runtime guarantee) — only the operator-directed sentences move to non-normative voice.

## Relationships

- T18 "`RuntimeEvent.occurred_at` source clock contradicts the `Clock.now()` monotonic pin" - same-cluster (touches the same **Runtime event channel** section; resolves independently).
- T08 "Broad-catch sites mandated by spec lack a matching exemption in the plan's `no-broad-catch` convention" - same-cluster (sibling testability/handler gap on the same handler surface; not co-resolvable).
