# `V16a` — Hard-ceiling interaction order and `masked` co-fire

**Spec.** [`../spec_topics/hard-ceilings.md`](../spec_topics/hard-ceilings.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md), [`../spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`](../spec_topics/hard-ceilings/ceiling-invariants-and-audit.md).

**Adds.** A pure **cross-ceiling arbitration seam** that encodes the fixed cross-ceiling evaluation order (CIO-1 … CIO-6), the at-most-one-ceiling-per-event rule, and the optional `masked` enumeration. The seam is a stateless function `arbitrate(candidate) → { surfaced, masked? }`:

- **Input** — a *ceiling-candidate*: the ceiling class(es) whose precondition is satisfied at a single check site, tagged with the check-site / ceiling-class the candidate carries (`invoke`-entry → ceiling #1, round-boundary → ceiling #2, slash-load binder → ceiling #3, AJV-boundary → ceiling #4).
- **Output** — `surfaced`, the single string identifier (`"ceiling#1"` … `"ceiling#4"`) of the ceiling that fires per the CIO order, and `masked`, the closed-set enumeration of any co-satisfied sibling(s) drawn from `"ceiling#1"` … `"ceiling#4"`, **omitted** when empty (never `masked: []`), exactly as pinned in [`ceilings-3-and-4.md` — `masked` field](../spec_topics/hard-ceilings/ceilings-3-and-4.md#masked-field).

Enforcement stays distributed: each ceiling's bound/breach detection is implemented by its feature leaf (`V5e`, `V6e`/`V13c`, `V11f`, `V15b`) at that ceiling's own first-enforcement point, per `hard-ceilings.md`'s distributed model. Those live sites **consult** this seam at their first-enforcement point to obtain the cross-ceiling surfacing precedence and to populate the surface's `masked` field; the load-time `V4e` slash-load `params` cross-route consults it at slash-load per CIO-1. The seam computes only the cross-ceiling order / mask decision — it does not receive or intercept events, run any breach check, or own any per-ceiling surface.

All CIO bullets are exercised by driving synthesised ceiling-candidates through this seam in isolation — observing its `{ surfaced, masked }` output — not against the live `invoke` entry / AJV boundary / round-boundary sites, which are built by downstream leaves (`V5e`, `V11f`, `V13c`, `V15b`) and do not exist when `V16a` is picked up. Each downstream leaf's `Deps` on `V16a` binds the seam it consults.

**Tests.**
- `CIO-1`: a synthesised candidate set carrying ceiling #3 (binder retry) and a runtime-class ceiling resolves to #3 — #3 is arbitrated before any runtime-class ceiling; the slash-load `params` arm of #4 is load-time and routed by #3 templates.
- `CIO-2`: a synthesised candidate tagged as an `invoke`-entry event resolves ceiling #1 (`invoke` depth) before the callee body.
- `CIO-3`: a synthesised candidate tagged as an AJV-boundary event resolves ceiling #4 (JSON depth) as the first sub-check; the depth walk is ordered before AJV.
- `CIO-4`: a synthesised candidate tagged as a round-boundary event resolves ceiling #2 (`tool_loop.max_rounds`) post-slot-increment, pre-next-turn; `max_rounds:0` typed takes the final branch at start.
- `CIO-5`: across synthesised candidate sequences, ceiling #3 never interleaves with #1/#2/#4.
- `CIO-6`: at most one ceiling surfaces per synthesised event; `masked` enumerates co-fired siblings.

**Deps.** `V16a-T`, `V9d`

**Ships when.** `npm test` drives synthesised ceiling-candidates through the cross-ceiling arbitration seam and proves at-most-one-ceiling firing (the `surfaced` identifier) in the CIO-1 … CIO-6 order with `masked` co-fire enumeration — observable at `V16a`'s position without the downstream breach-site leaves.
