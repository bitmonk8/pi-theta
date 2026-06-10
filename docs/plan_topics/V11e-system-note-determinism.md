# `V11e` — Binder system-note rendering and determinism

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md), [`../spec_topics/binder/determinism-cancellation-failure.md`](../spec_topics/binder/determinism-cancellation-failure.md).

**Adds.** The binder system-note rendering (single-line, 120-codepoint cap at scalar boundaries with `…`, the five note rules) and the binder determinism contract (`temperature:0`, the FNV-1a seed derivation, fixed messages).

**Tests.**
- [defaulting-system-note-echo.md — system-note rendering](../spec_topics/binder/defaulting-system-note-echo.md) (BNDR area): the system-note renders single-line and truncates at 120 codepoints on a scalar boundary with `…`.
- [determinism-cancellation-failure.md — binder determinism](../spec_topics/binder/determinism-cancellation-failure.md) (BNDR area): the binder seed is derived via FNV-1a so the same inputs produce the same seed; `temperature:0` is set on every call.

**Deps.** `V11e-T`, `V11d`, `V9j`

**Ships when.** `npm test` asserts the 120-codepoint note cap and the deterministic FNV-1a seed.
