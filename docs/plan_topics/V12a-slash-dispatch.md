# `V12a` — Slash dispatch, overflow, and streaming

**Spec.** [`../spec_topics/slash-invocation.md`](../spec_topics/slash-invocation.md).

**Adds.** The slash-command dispatch path: prompt-mode streaming, the forced-respond turn run off-session (no card), and the no-params argument-overflow handling.

**Tests.**
- `SLSH-1`: a no-params loom trims args; a non-empty overflow emits the `ignoring extra arguments` note then runs; whitespace-only is silent; the rule is slash-path-only.
- `SLSH-2`: streamed assistant tokens are observable in the user transcript *before* the interpreter resumes — before `ctx.waitForIdle()` resolves — so a buffer-then-append-after-resume implementation fails; the forced-respond turn runs off-session with no card. Driven through the in-process Pi session double with an ordering-observable transcript sink.
- `SLSH-2`: on an `Err` propagated by `?` after partial assistant text, the streamed prefix is retained and the failure `loom-system-note` is appended *after* the prefix, not interleaved.
- `SLSH-2`: on mid-stream cancellation, the partial prefix is retained and the cancellation note is appended *after* the prefix, not interleaved.

**Deps.** `V12a-T`, `V9c`, `V11f`, `V4a`, `V13c`

**Ships when.** `npm test` dispatches a slash command, streams output, and asserts the overflow note.
