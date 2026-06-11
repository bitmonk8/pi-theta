# `V11d` — System-prompt builder, defaulting, and echo

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md), [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** The binder system-prompt builder (the eight structured items with type/default renderings), the fill-if-absent defaulting with post-merge AJV validation, and the argument echo (`(default)` annotation only when a default was supplied).

**Tests.**
- `BNDR-6`: the echo reference renderings (6a–6x) reproduce exactly, composing the canonical number renderer from `V2d` for the numeric rows.
- Fill-then-revalidate ([`defaulting-system-note-echo.md#post-default-merge-ajv-validation`](../spec_topics/binder/defaulting-system-note-echo.md#post-default-merge-ajv-validation)): absent wire names take their declared defaults, then `SchemaValidator.validate()` re-validates the merged `args`.
- Echo annotation ([`defaulting-system-note-echo.md#echo-policy`](../spec_topics/binder/defaulting-system-note-echo.md#echo-policy)): `(default)` is rendered only for a field that took its declared default; a binder-supplied value for a defaulted field is rendered untagged.

**Deps.** `V11d-T`, `V11a`, `V2a`, `V2d`, `V5d`, `V8a`

**Ships when.** `npm test` reproduces the BNDR-6 echo reference renderings and the fill-if-absent + post-merge AJV path.
