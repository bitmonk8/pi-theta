# `V11e-T` — Binder system-note rendering and determinism (tests)

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md), [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md).

**Adds.** Failing tests for the paired `V11e` implementation leaf.

**Tests.**
- [defaulting-system-note-echo.md — system-note rendering](../spec_topics/binder/defaulting-system-note-echo.md) (BNDR area): the system-note renders single-line and truncates at 120 codepoints on a scalar boundary with `…`.
- [determinism-cancellation-failure.md — binder determinism](../spec_topics/binder/determinism-cancellation-failure.md) (BNDR area): the binder seed is derived via FNV-1a so the same inputs produce the same seed; `temperature:0` is set on every call.

**Deps.** `V11d`, `V9j`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
