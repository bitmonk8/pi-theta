# `V2c-T` — Runtime value model and equality (tests)

**Spec.** [`../spec_topics/runtime-value-model.md`](../spec_topics/runtime-value-model.md).

**Adds.** Failing tests for the paired `V2c` implementation leaf.

**Tests.**
- [runtime-value-model.md — value representation](../spec_topics/runtime-value-model.md) (RVM code-keyed area): `JSON.stringify` of an enum value yields the bare wire string; `Result` is never lowered to wire.
- [runtime-value-model.md — Equality](../spec_topics/runtime-value-model.md#equality) (RVM code-keyed area): structural equality — cross-type compares to `false`, `NaN == NaN` is `true`, `+0 == -0` is `true`, enum equality compares the declaring-enum tag (`Severity.High == OtherEnum.High` is `false`; `42 == 42.0` is `true`).

**Deps.** `V2a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
