# `V4f-T` — No-rollback guarantee (tests)

**Spec.** [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md), [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md).

**Adds.** Failing tests for the paired `V4f` implementation leaf.

**Tests.**
- `ERR-13`: drive each of the six [`error-model.md` §No rollback](../spec_topics/errors-and-results/error-model.md#err-13) authoring sites and assert it does not unwind prior side effects and appends no compensating turn — (1) a `?`-early-return inside a function, (2) a `?`-early-return at the top of a loom block, (3) a panic in a slash-command loom, (4) a panic in an `invoke` child (parent observes `InvokeInfraError { cause: "panic" }`), (5) mid-execution cancellation, and (6) completed-callee finality: drive a tool call / invoke child to *completion*, then fire a downstream `?`/panic/cancel and assert the completed callee's side effect persists and no compensating turn is injected — a completed callee distinct from an appended turn. Each vector drives a completed callee, modelled through the `H4a` session double (the invoke-child vectors via its completed-invoke-child scripting point) and the `V17a` side-effect seam (`loomAbort`, late-settlement discard) together with the `V17c` checkpoint set, not the live `V14a`/`V13c`/`V15a` surfaces. The guarantee rests on the runtime having no compensating/rollback path, so the tests witness it on these enumerated authoring sites rather than proving the absolute absence of a compensating path exhaustively.

**Deps.** `V4a`, `V17a`, `V17c`, `H4a`, `H4b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
