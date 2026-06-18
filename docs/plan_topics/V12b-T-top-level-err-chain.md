# `V12b-T` — Top-level `Err` formatting and chain attribution (tests)

**Spec.** [`../spec_topics/slash-invocation.md`](../spec_topics/slash-invocation.md), [`../spec_topics/errors-and-results/queryerror-variants.md`](../spec_topics/errors-and-results/queryerror-variants.md).

**Adds.** Failing tests for the paired `V12b` implementation leaf.

**Tests.**
- `SLSH-3`: a top-level `Err` at the slash-dispatch boundary renders one line; it is the sole subagent-mode surface.
- `SLSH-4`: the per-kind note templates render verbatim; one bullet per inline label below.
- `SNK-a`: the `validation` (`cause: "schema_validation"`) note renders verbatim.
- `SNK-b`: the `validation` (`cause: "empty_template"`) note renders verbatim.
- `SNK-c`: the `transport` note renders verbatim.
- `SNK-d`: the `model_tool` note renders verbatim.
- `SNK-e`: the `context_overflow` note renders verbatim.
- `SNK-f`: the `cancelled` note renders verbatim.
- `SNK-g`: the `code_tool` note renders verbatim.
- `SNK-h`: the `tool_loop_exhausted` note renders verbatim.
- `SNK-i`: the `invoke_infra` note renders verbatim.
- `SNK-j`: the `invoke_callee` note renders verbatim.
- `SNK-k`: the catch-all note renders verbatim and the renderer is total over any unlisted `kind` in the `QueryError` union.
- `SLSH-5`: chain attribution appends ` from <callee> invoked at <parent>:<line>` per `invoke_callee` hop, leaf-first; the leaf kind drives the text. The per-hop `<parent_path>:<line>` provenance is consumed from `V15g`'s per-frame invocation record (`V15g` is in `Deps.` below) — this leaf asserts rendering from that record, not source-position derivation here.

**Deps.** `V12a`, `V4d`, `V15g`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
