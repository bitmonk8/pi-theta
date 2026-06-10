# `V2b` — Type-compatibility engine (`⊑`)

**Spec.** [`../spec_topics/type-system.md`](../spec_topics/type-system.md), [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md).

**Adds.** The structural type-compatibility relation `T₁ ⊑ T₂` with per-site mismatch diagnostics, nominal treatment of named schemas, and a runtime AJV safety-net for statically-unresolvable operands.

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

**Deps.** `V2b-T`, `V2a`, `V5d`

**Ships when.** `npm test` asserts each TYPE rule and defers unresolved operands to runtime AJV.
