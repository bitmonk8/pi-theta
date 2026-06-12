# `V11g-T` — Fill-if-absent defaulting and post-merge AJV validation (tests)

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** Failing tests for the paired `V11g` implementation leaf.

**Tests.**
- Fill-then-revalidate ([`defaulting-system-note-echo.md#post-default-merge-ajv-validation`](../spec_topics/binder/defaulting-system-note-echo.md#post-default-merge-ajv-validation)): absent wire names take their declared defaults, then `SchemaValidator.validate()` re-validates the merged `args`.

**Deps.** `V11a`, `V5d`, `V5f`, `V8c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
