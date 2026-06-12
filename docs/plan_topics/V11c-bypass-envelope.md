# `V11c` — Binder bypass and envelope schema

**Spec.** [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md).

**Adds.** The binder bypass path and the dynamic envelope schema (the three-arm discriminator, the relaxed copy with `maxLength:500`) consumed by the inference call.

**Tests.**
- `BNDR-1`: the envelope keeps the three-arm `ok | needs_info | ambiguous` discriminator.
- `BNDR-2`: `ambiguous.candidates` stays in the schema (`array<string>|null`) though it is not surfaced in 1.0.
- `BNDR-3`: the `needs more info` and `ambiguous arguments` template prefixes stay distinct.
- The envelope is a relaxed copy (`maxLength:500` as a model budget, not a user cap); the bypass path skips the LLM call.

**Deps.** `V11c-T`, `V5d`, `V5f`, `V8c`

**Ships when.** `npm test` validates the three-arm envelope and the bypass path.
