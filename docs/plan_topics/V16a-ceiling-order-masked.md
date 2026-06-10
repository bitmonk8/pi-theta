# `V16a` — Hard-ceiling interaction order and `masked` co-fire

**Spec.** [`../spec_topics/hard-ceilings.md`](../spec_topics/hard-ceilings.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md), [`../spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`](../spec_topics/hard-ceilings/ceiling-invariants-and-audit.md).

**Adds.** The fixed cross-ceiling evaluation order (CIO-1 … CIO-6), the at-most-one-ceiling-per-event rule with the optional `masked` enumeration, and the NOCEIL-1 … NOCEIL-4 non-existence behaviours. This leaf owns the cross-ceiling behaviour the spec pins — the fixed CIO-1 … CIO-6 evaluation order, the at-most-one-ceiling-per-event rule, and the `masked` enumeration. Each ceiling's bound/breach surface is implemented by its feature leaf (`V5e`, `V6e`/`V13c`, `V11f`, `V15b`) at that ceiling's own first-enforcement point, per `hard-ceilings.md`'s distributed model.

All CIO bullets are exercised by driving synthesised ceiling-candidate events through the unit that computes the cross-ceiling order in isolation — not against the live `invoke` entry / AJV boundary / round-boundary sites, which are built by downstream leaves (`V5e`, `V11f`, `V13c`, `V15b`) and do not exist when `V16a` is picked up.

**Tests.**
- `CIO-1`: a synthesised candidate set carrying ceiling #3 (binder retry) and a runtime-class ceiling resolves to #3 — #3 is arbitrated before any runtime-class ceiling; the slash-load `params` arm of #4 is load-time and routed by #3 templates.
- `CIO-2`: a synthesised candidate tagged as an `invoke`-entry event resolves ceiling #1 (`invoke` depth) before the callee body.
- `CIO-3`: a synthesised candidate tagged as an AJV-boundary event resolves ceiling #4 (JSON depth) as the first sub-check; the depth walk is ordered before AJV.
- `CIO-4`: a synthesised candidate tagged as a round-boundary event resolves ceiling #2 (`tool_loop.max_rounds`) post-slot-increment, pre-next-turn; `max_rounds:0` typed takes the final branch at start.
- `CIO-5`: across synthesised candidate sequences, ceiling #3 never interleaves with #1/#2/#4.
- `CIO-6`: at most one ceiling surfaces per synthesised event; `masked` enumerates co-fired siblings.

**Deps.** `V16a-T`, `V9d`

**Ships when.** `npm test` drives synthesised ceiling-candidate events through the unit that computes the cross-ceiling order and proves at-most-one-ceiling firing in the CIO-1 … CIO-6 order with `masked` co-fire enumeration — observable at `V16a`'s position without the downstream breach-site leaves.
