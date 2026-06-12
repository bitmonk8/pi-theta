# `V11h` — Argument echo

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** The binder argument echo — the `(default)` annotation rendered only when a field took its declared default — composing the canonical number renderer from `V2d` for numeric rows, over the fill-if-absent defaulting [`V11g`](./V11g-defaulting-revalidation.md) owns.

**Tests.**
- `BNDR-6`: the echo reference renderings (6a–6x) reproduce exactly, composing the canonical number renderer from `V2d` for the numeric rows.
- Echo annotation ([`defaulting-system-note-echo.md#echo-policy`](../spec_topics/binder/defaulting-system-note-echo.md#echo-policy)): `(default)` is rendered only for a field that took its declared default; a binder-supplied value for a defaulted field is rendered untagged.

**Deps.** `V11h-T`, `V11g`, `V2d`

**Ships when.** `npm test` reproduces the BNDR-6 echo reference renderings (6a–6x) and asserts the `(default)` annotation appears only for a field that took its declared default, untagged for a binder-supplied value.
