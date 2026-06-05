# pi-loom — Consolidated Spec Review (Parked)

_Parked findings: 1._

---

## T56 - Provider/library behaviour is asserted as fact without citation or version pin

> **PARKED** — 2026-06-05
> **Reason:** Category 2 (fast-loop capability gap — the finding is well-shaped but the fast `/spec-fix-findings-loop` only partially resolved it and could not complete the remaining edits within its scope guard). The fast fix loop landed the `schema-subset.md` depth/intersection/Draft-2020-12 reframes but did not add the typed-query forced-respond `complete()` dependency forward-links (`#complete-forced-tool-presupposition`, `#pi-sdk-pin`) — those edits were excluded by the scope guard and the reviewer marked the finding partial. Loop notes: finding not resolved by fast fix — schema-subset.md depth/intersection/Draft reframes landed, but the typed-query forced-respond complete() dependency forward-links (#complete-forced-tool-presupposition, #pi-sdk-pin) were not added (excluded by scope guard); reviewer marked partial. A human must complete the remaining forward-link additions (or reshape the finding so the forced-respond dependency work falls inside the fixer's scope) before re-introducing it.
> **Forensic report:** none (fast loop — no forensic report)

# T56 - Provider/library behaviour is asserted as fact without citation or version pin

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

Several load-bearing constraints assert external provider/library behaviour as present-tense fact with no citation or version pin: the `depth ≤ 5` nesting ceiling in `schema-subset.md` hard-codes OpenAI's current cap; the JSON-Schema subset is asserted as the intersection of OpenAI/Anthropic strict modes (and Draft 2020-12 "required by Anthropic"); and the typed-query forced-respond terminator depends on pi-ai `complete()` forced tool-choice being honoured by every supported provider adapter. Each silently couples the spec to a live external surface that can drift without any anchored basis or version pin.

## Solution approach

Clarify the `depth ≤ 5` ceiling and the OpenAI/Anthropic-intersection and Draft 2020-12 claims in `schema-subset.md` as either provider-cited against a dated snapshot or as a spec-chosen conservative ceiling decoupled from the live provider caps. For the typed-query forced-respond dependency, add a forward-link to the existing `#complete-forced-tool-presupposition` and to the Pi-SDK pin `#pi-sdk-pin` rather than restating provider behaviour bare. Where the assertion remains version-coupled, follow the presupposition-plus-re-validation-gate pattern already used at `provider-error-mapping.md`'s `#provider-overflow-wording-presupposition`.

## Solution constraints

- Any new defining-obligation site added (e.g. a host-prerequisite or re-validation obligation) MUST carry GOV-22 progressive-coinage under the page's registered prefix.

## Relationships

- T19 "Binder relies on three unpinned `complete()` behaviours" — same-cluster (external-behaviour presuppositions).
