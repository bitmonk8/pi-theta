# `V16a-T` — Hard-ceiling interaction order and `masked` co-fire (tests)

**Spec.** [`../spec_topics/hard-ceilings.md`](../spec_topics/hard-ceilings.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md), [`../spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`](../spec_topics/hard-ceilings/ceiling-invariants-and-audit.md).

**Adds.** Failing tests for the paired `V16a` implementation leaf.

**Tests.**
- `CIO-1`: ceiling #3 (binder retry) is evaluated at slash-load before any runtime-class ceiling; the slash-load `params` arm of #4 is load-time and routed by #3 templates.
- `CIO-2`: ceiling #1 (`invoke` depth) is evaluated at `invoke` entry before the callee body.
- `CIO-3`: ceiling #4 (JSON depth) is the first sub-check at every AJV boundary (the five sites); the depth walk runs before AJV.
- `CIO-4`: ceiling #2 (`tool_loop.max_rounds`) is evaluated at the round boundary, post-slot-increment, pre-next-turn; `max_rounds:0` typed takes the final branch at start.
- `CIO-5`: ceiling #3 never interleaves with #1/#2/#4.
- `CIO-6`: at most one ceiling surfaces per event; `masked` enumerates co-fired siblings.

**Deps.** `V9d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
