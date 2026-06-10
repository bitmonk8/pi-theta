# `V4e` — Pre-evaluation failures

**Spec.** [`../spec_topics/errors-and-results/error-model.md`](../spec_topics/errors-and-results/error-model.md).

**Adds.** The closed pre-evaluation failure set surfaced on the `loom-system-note` channel with `triggerTurn:false`, never becoming evaluation outcomes. The slash-load `params` arm of ceiling #4 (`ERR-16`) **consults** `V16a`'s cross-ceiling arbitration seam at slash-load per CIO-1 — a load-time cross-route that differs in kind from the four runtime first-enforcement sites — binding the seam via its `Deps` on `V16a`.

**Tests.**
- `ERR-1`: host-incompatible pre-eval failure routes without firing a turn.
- `ERR-2`: lex/parse/type failure routes pre-eval.
- `ERR-3`: frontmatter failure routes pre-eval.
- `ERR-4`: binder-model resolution failure routes pre-eval.
- `ERR-5`: binder arg-binding failure (ceiling #3) routes pre-eval.
- `ERR-6`: `tools:` resolution failure routes pre-eval.
- `ERR-7`: watcher-reload failure routes pre-eval.
- `ERR-16`: the slash-load `params` arm of ceiling #4, cross-routed via CIO-1 / ceiling #3 no-retry, routes pre-eval.

**Deps.** `V4e-T`, `V9a`, `V6a`, `V11f`, `V10a`, `V16a`

**Ships when.** `npm test` proves all eight pre-eval causes route to `loom-system-note` without firing a turn.
