# `V11d-T` — Binder system-prompt builder (tests)

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md).

**Adds.** Failing tests for the paired `V11d` implementation leaf.

**Tests.**
- System-prompt structure ([`binder-bypass-and-envelope.md#system-prompt-structure-normative`](../spec_topics/binder/binder-bypass-and-envelope.md#system-prompt-structure-normative)): the builder reproduces all eight structured items (1–8) exactly, including the trigger-present **and** trigger-absent assertions for conditional items 2 (Description line), 3 (Argument-hint line), 4 (Parameters block / per-field line), and 6 (Session-context block); the *Type display* reference renderings (declared-Loom-type → rendered-string table); the *Default-literal rendering* forms (`default=Severity.High`, `default="hello"`, `default=[1, 2, 3]`, `default=[]`); and the four *Parameter-line reference renderings*, including the description-omitted form (`  language (string) required`, with no trailing space or em-dash).

**Deps.** `V11a`, `V2a`, `V2d`

**Ships when.** The tests above — the binder system-prompt-structure assertions (eight items, conditional presence, Type-display, Default-literal, and Parameter-line reference renderings) — exist, compile, and fail red for the intended reason.
