# `V11d` — Binder system-prompt builder

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md).

**Adds.** The binder system-prompt builder (the eight structured items with type/default renderings). The fill-if-absent defaulting with post-merge AJV validation is owned by [`V11g`](./V11g-defaulting-revalidation.md); the argument echo by [`V11h`](./V11h-argument-echo.md).

**Tests.**
- System-prompt structure ([`binder-bypass-and-envelope.md#system-prompt-structure-normative`](../spec_topics/binder/binder-bypass-and-envelope.md#system-prompt-structure-normative)): the builder reproduces all eight structured items (1–8) exactly, including the trigger-present **and** trigger-absent assertions for conditional items 2 (Description line), 3 (Argument-hint line), 4 (Parameters block / per-field line), and 6 (Session-context block); the *Type display* reference renderings (declared-Loom-type → rendered-string table); the *Default-literal rendering* forms (`default=Severity.High`, `default="hello"`, `default=[1, 2, 3]`, `default=[]`); and the four *Parameter-line reference renderings*, including the description-omitted form (`  language (string) required`, with no trailing space or em-dash).

**Deps.** `V11d-T`, `V11a`, `V2a`, `V2d`

**Ships when.** `npm test` reproduces the binder system-prompt structure (the eight items with conditional-presence handling, the *Type display*, *Default-literal rendering*, and *Parameter-line reference renderings*).
