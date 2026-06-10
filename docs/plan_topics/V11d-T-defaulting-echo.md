# `V11d-T` — System-prompt builder, defaulting, and echo (tests)

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** Failing tests for the paired `V11d` implementation leaf.

**Tests.**
- `BNDR-6`: the echo reference renderings (6a–6x) reproduce exactly, composing the canonical number renderer from `V2d` for the numeric rows.
- Defaulting fills absent args then re-validates through AJV; `(default)` annotates only default-supplied args.

**Deps.** `V11a`, `V2a`, `V2d`, `V5d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
