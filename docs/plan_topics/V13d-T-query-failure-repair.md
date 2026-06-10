# `V13d-T` — Query failure and respond-repair (tests)

**Spec.** [`../spec_topics/query/query-failure-and-repair.md`](../spec_topics/query/query-failure-and-repair.md), [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md).

**Adds.** Failing tests for the paired `V13d` implementation leaf.

**Tests.**
- [query-failure-and-repair.md — respond-repair loop](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): a schema-validation failure appends a new user turn per attempt and terminates as `ValidationError{schema_validation}` at the bound; `none`/`0` means no follow-up.
- [query-failure-and-repair.md — proximate propagation](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): a non-validation failure propagates the proximate variant and consumes no attempt; `ContextOverflowError` permanently short-circuits.
- [query-failure-and-repair.md — per-attempt budget](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): each repair turn gets a fresh `tool_loop` budget.
- `ERR-17`: forced-respond non-compliance injects the synthesised `ValidationIssue` (path `""`, keyword `"required"`, branch-specific message) into the respond-repair loop.

**Deps.** `V13c`, `V4d`, `V9j`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
