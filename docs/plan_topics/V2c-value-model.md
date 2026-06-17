# `V2c` — Runtime value model and equality

**Spec.** [`../spec_topics/runtime-value-model.md`](../spec_topics/runtime-value-model.md).

**Adds.** The JS representation of loom values (native map, enum tag, internal `Result` tag) and structural `==`/`!=` equality.

**Tests.**
- [runtime-value-model.md — value representation](../spec_topics/runtime-value-model.md) (RVM code-keyed area): `JSON.stringify` of an enum value yields the bare wire string; `Result` is never lowered to wire.
- [runtime-value-model.md — Equality](../spec_topics/runtime-value-model.md#equality) (RVM code-keyed area): structural equality — cross-type compares to `false`, `NaN == NaN` is `true`, `+0 == -0` is `true`, enum equality compares the declaring-enum tag (`Severity.High == OtherEnum.High` is `false`; `42 == 42.0` is `true`).

**Deps.** `V2c-T`, `V2a`

**Ships when.** `npm test` asserts the value-representation and equality vectors above.
