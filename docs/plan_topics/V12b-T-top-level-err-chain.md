# `V12b-T` — Top-level `Err` formatting and chain attribution (tests)

**Spec.** [`../spec_topics/slash-invocation.md`](../spec_topics/slash-invocation.md), [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md).

**Adds.** Failing tests for the paired `V12b` implementation leaf.

**Tests.**
- `SLSH-3`: a top-level `Err` at the slash-dispatch boundary renders one line; it is the sole subagent-mode surface.
- `SLSH-4`: the per-kind note templates (SNK-a..k) render verbatim with a catch-all total over `QueryError`.
- `SLSH-5`: chain attribution appends ` from <callee> invoked at <parent>:<line>` per `invoke_callee` hop, leaf-first; the leaf kind drives the text.

**Deps.** `V12a`, `V4d`, `V15a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
