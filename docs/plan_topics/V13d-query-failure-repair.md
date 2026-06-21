# `V13d` — Query failure and respond-repair

**Spec.** [`../spec_topics/query/query-failure-and-repair.md`](../spec_topics/query/query-failure-and-repair.md), [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md).

**Adds.** The respond-repair loop: a new user turn appended per attempt (never re-issued), bounded by `respond_repair.attempts`, non-validation-failure proximate propagation (no attempt consumed), the context-overflow permanent short-circuit, and the forced-respond non-compliance handling. Byte-exact follow-up turn template rendering is split out to [`V13h`](./V13h-query-followup-rendering.md).

**Tests.**
- [query-failure-and-repair.md — respond-repair loop](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): a schema-validation failure appends a new user turn per attempt and terminates as `ValidationError{schema_validation}` at the bound; `none`/`0` means no follow-up.
- [query-failure-and-repair.md — proximate propagation](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): a non-validation failure propagates the proximate variant and consumes no attempt; `ContextOverflowError` permanently short-circuits.
- [query-failure-and-repair.md — per-attempt budget](../spec_topics/query/query-failure-and-repair.md) (QRY code-keyed area): each repair turn gets a fresh `tool_loop` budget.
- `ERR-17`: forced-respond non-compliance injects the synthesised `ValidationIssue` (path `""`, keyword `"required"`, branch-specific message) into the respond-repair loop.

**Deps.** `V13d-T`, `V13c`, `V4d`, `V9j`, `H4b`

**Ships when.** `npm test` asserts attempt accounting, the context-overflow short-circuit, and the proximate-variant propagation.
