# `V11h-T` — Argument echo (tests)

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** Failing tests for the paired `V11h` implementation leaf.

**Tests.**
- `BNDR-6`: the echo reference renderings (6a–6x) reproduce exactly, composing the canonical number renderer from `V2d` for the numeric rows.
- Echo annotation ([`defaulting-system-note-echo.md#echo-policy`](../spec_topics/binder/defaulting-system-note-echo.md#echo-policy)): `(default)` is rendered only for a field that took its declared default; a binder-supplied value for a defaulted field is rendered untagged.

**Deps.** `V11g`, `V2d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
