# `V2b-T` — Type-compatibility engine (`⊑`) (tests)

**Spec.** [`../spec_topics/type-system.md`](../spec_topics/type-system.md), [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md).

**Adds.** Failing tests for the paired `V2b` implementation leaf.

**Tests.**
- `TYPE-1`: reflexivity `T ⊑ T` holds.
- `TYPE-2`: `integer ⊑ number` one-way; the reverse emits `integer-narrowing`.
- `TYPE-3`: a literal `L ⊑ T` when `L` types as `T`.
- `TYPE-4`: variant `A ⊑ U` for its declaring union.
- `TYPE-5`: union widening `T ⊑ T|U`.
- `TYPE-6`: `T₁|T₂ ⊑ T₃` iff each arm `⊑ T₃`.
- `TYPE-7`: `array<T₁> ⊑ array<T₂>` iff `T₁ ⊑ T₂`.
- `TYPE-8`: inline-object field-wise compatibility with exact field-set / `additionalProperties:false`.
- `TYPE-9`: per-site codes (`let-rhs-type-mismatch`, `fn-arg-type-mismatch`, ternary/array common-type) fire on static mismatch.
- `TYPE-10`: named schemas are nominal — no cross-named structural admission.

**Deps.** `V2a`, `V5d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
