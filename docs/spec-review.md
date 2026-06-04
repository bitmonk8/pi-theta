# Triaged Spec Review - spec

_Generated: 2026-06-04T03:10:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T22) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 4 high, 4 medium retained; 13 low discarded; 16 low findings merged into 6 medium findings (plus one co-resolve merge of two high findings); 4 nit dropped; 0 false dropped._

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
# T02 - Pi version-bump gate cannot detect three unstated host/provider behavioural presuppositions

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`pi-integration-contract.md` relies on three load-bearing host/provider behaviours that the Pi version-bump gate (the SDK surface-inventory test plus the editorial-review checklist) cannot detect, because none is encoded in a type signature or in pi-ai's package version. (1) The *`SessionContext` and the `.messages` element shape* paragraph pins the element type `AgentMessage[]` but never states the array is chronological, while three downstream consumers (binder session-context truncation, the compact-transcript renderer, untyped-query trailing-turn extraction) assume oldest-to-newest. (2) **Provider error mapping** classifies context-overflow from substring/regex matches over provider-owned HTTP error bodies, which a provider can reword with no pi-ai version change, silently downgrading a real overflow to `TransportError` with null token fields. (3) The **Pi-side slash-handler promise lifecycle** paragraph never records that Pi *eventually* delivers a terminal `agent_end` (`willRetry: false`) / settles `ctx.waitForIdle()`, so a future Pi retry-cap or never-terminating path would hang loom invocations until cancellation. The downstream prose is internally correct today; the gap is purely in the regression-detection apparatus.

## Solution approach

Treat each of the three presuppositions in the disclosure-plus-bump-checklist shape the page already uses at `#snapshot-restore-pi-behavioural-preconditions`. Clarify the *`SessionContext` and the `.messages` element shape* paragraph that the field is chronologically ordered (oldest-to-newest) as a Pi behavioural precondition the `AgentMessage[]` type does not encode, add a stable anchor for it, and add a matching audit item to the *Editorial-review checklist for unpinned host presuppositions* (currently ending at item (g)). Clarify **Provider error mapping** that the matched overflow substrings are provider-owned text outside the pi-ai version-bump gate, naming a provider-side fixture re-run cadence, and add the corresponding checklist audit item. Add a further presupposition to the **Pi-side slash-handler promise lifecycle** paragraph (which already pins presuppositions (i)–(iii)) covering the eventual terminal `agent_end` / `ctx.waitForIdle()` guarantee, and add its checklist audit item.

## Solution constraints

- Out of scope: the inter-attempt retry-timing delegation within **Provider error mapping**, owned by T14.

## Relationships

- T22 "Binder inference call — no pi-ai entry point pinned" - same-cluster (the binder call shape may bypass the `agent_end` channel entirely; the liveness presupposition either pins the analogous terminal-signal contract for the chosen entry point or states the binder bypasses the session-event channel).
- T14 "Transport-class binder retry: no inter-attempt timing contract" - same-cluster (both touch the **Provider error mapping** surface; the overflow-wording disclosure and the retry-timing delegation share that paragraph).
- T19 "Subagent spawn has no contract when both `model:` and `ctx.model` are absent" - same-cluster (another conversation-drive presupposition gap; resolves independently).
