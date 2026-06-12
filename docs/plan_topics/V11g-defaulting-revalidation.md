# `V11g` — Fill-if-absent defaulting and post-merge AJV validation

**Spec.** [`../spec_topics/binder/defaulting-system-note-echo.md`](../spec_topics/binder/defaulting-system-note-echo.md).

**Adds.** The fill-if-absent defaulting: absent wire names take their declared defaults, after which the merged `args` are re-validated through `SchemaValidator.validate()`. The binder system-prompt builder is owned by [`V11d`](./V11d-defaulting-echo.md); the argument echo by [`V11h`](./V11h-argument-echo.md).

**Tests.**
- Fill-then-revalidate ([`defaulting-system-note-echo.md#post-default-merge-ajv-validation`](../spec_topics/binder/defaulting-system-note-echo.md#post-default-merge-ajv-validation)): absent wire names take their declared defaults, then `SchemaValidator.validate()` re-validates the merged `args`.

**Deps.** `V11g-T`, `V11a`, `V5d`, `V5f`, `V8c`

**Ships when.** `npm test` exercises the fill-if-absent + post-merge AJV path: absent wire names take their declared defaults and the merged `args` re-validate through `SchemaValidator.validate()`.
