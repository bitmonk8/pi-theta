# `V11c-T` — Binder bypass and envelope schema (tests)

**Spec.** [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md).

**Adds.** Failing tests for the paired `V11c` implementation leaf.

**Tests.**
- `BNDR-1`: the envelope keeps the three-arm `ok | needs_info | ambiguous` discriminator.
- `BNDR-2`: `ambiguous.candidates` stays in the schema (`array<string>|null`) though it is not surfaced in 1.0.
- `BNDR-3`: the `needs more info` and `ambiguous arguments` template prefixes stay distinct.
- The envelope is a relaxed copy (`maxLength:500` as a model budget, not a user cap); the bypass path skips the LLM call.

**Deps.** `V5d`, `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
