# `V4e-T` — Pre-evaluation failures (tests)

**Spec.** [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** Failing tests for the paired `V4e` implementation leaf.

**Tests.**
- `ERR-1`: host-incompatible pre-eval failure routes without firing a turn.
- `ERR-2`: lex/parse/type failure routes pre-eval.
- `ERR-3`: frontmatter failure routes pre-eval.
- `ERR-4`: binder-model resolution failure routes pre-eval.
- `ERR-5`: binder arg-binding failure (ceiling #3) routes pre-eval.
- `ERR-6`: `tools:` resolution failure routes pre-eval.
- `ERR-7`: a synthetic watcher-time reload failure injected at the **watcher-time reload failure-injection seam** — owned by `V9b` (the `loom/runtime/registry-swap-failed` registry-swap arm and the `.loom`/`.warp` re-parse arm) and `V10c` (the settings-re-merge sub-arm) — exercising both arms, the re-parse/re-merge diagnostic arm and the `loom/runtime/registry-swap-failed` registry-swap arm, routes pre-eval to `loom-system-note` with `triggerTurn:false`, without standing up a live `V10c`/`V9b` watcher.
- `ERR-16`: the slash-load `params` arm of ceiling #4, cross-routed via CIO-1 / ceiling #3 no-retry, routes pre-eval.

**Deps.** `V9a`, `V6a`, `V11f`, `V10a`, `V16a`, `V9b`, `V10c` (the latter two own the **watcher-time reload failure-injection seam** the `ERR-7` test injects against)

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
