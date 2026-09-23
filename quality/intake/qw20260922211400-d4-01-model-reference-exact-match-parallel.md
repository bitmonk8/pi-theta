---
id: pending
title: Model-reference exact-match rule is implemented twice and must stay in step
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/model-reference-matcher.ts:34-67
  - src/binder/binder-model.ts:133-149
  - src/extension/production-composition.ts:910-920
  - src/extension/production-composition.ts:1565-1567
  - src/extension/production-theta-producer.ts:1072-1078
  - src/extension/production-theta-producer.ts:3205-3226
  - src/extension/production-theta-producer.ts:3572-3575
sites: 2
fix_scope: cross-module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Model-reference exact-match rule is implemented twice and must stay in step

## Observation
The theta model-reference exact-match rule — a bare `modelId` matches `Model<Api>.id`; a `provider/modelId` reference matches `Model<Api>.provider` and `Model<Api>.id`; more than one match is treated as no match — is implemented in two independent places.

`src/parser/model-reference-matcher.ts` owns the canonical matcher used by frontmatter `model:` resolution and by binder-model resolution via `resolveChainReference`. It returns a `ModelMatchOutcome` (`"resolved" | "ambiguous" | "no-match"`).

`src/binder/binder-model.ts` exports `matchAvailableModel`, which applies the same slash-split/filter logic but returns the matched model object or `undefined`. This second implementation is injected into the strict-capability probe in `production-composition.ts` and is also used at runtime in `production-theta-producer.ts` to recover a concrete `Model<Api>` from the resolved binder-model reference.

Both sites must agree on which reference resolves to which model, but neither delegates to the other; they duplicate the rule.

## Evidence

**Copy 1 — canonical matcher outcome (`src/parser/model-reference-matcher.ts:34-67`):**

```typescript
  return {
    resolve(reference: unknown): ModelMatchOutcome {
      // A non-string reference matches no available model (no-match).
      if (typeof reference !== "string") {
        return "no-match";
      }
      const available = registry.getAvailable();
      const slash = reference.indexOf("/");
      if (slash >= 0) {
        // `provider/modelId`: the provider half compares against the short
        // provider-id `Model<Api>.provider` (NOT the api-shaped `.api`) and the
        // modelId half against `Model<Api>.id`.
        const provider = reference.slice(0, slash);
        const modelId = reference.slice(slash + 1);
        const matches = available.filter(
          (m) => m.provider === provider && m.id === modelId,
        );
        return outcomeOf(matches.length);
      }
      // A bare `modelId` matches each model's `Model<Api>.id`; a match across
      // more than one provider is ambiguous (resolves to no model).
      const matches = available.filter((m) => m.id === reference);
      return outcomeOf(matches.length);
    },
  };
```

**Copy 2 — concrete-model resolver (`src/binder/binder-model.ts:133-149`):**

```typescript
export function matchAvailableModel<M extends { readonly id: string; readonly provider: string }>(
  reference: string,
  available: readonly M[],
): M | undefined {
  const slash = reference.indexOf("/");
  const matches =
    slash >= 0
      ? available.filter(
          (m) =>
            m.provider === reference.slice(0, slash) &&
            m.id === reference.slice(slash + 1),
        )
      : available.filter((m) => m.id === reference);
  return matches.length === 1 ? matches[0] : undefined;
}
```

**Diff verdict:** renamed-only / structurally identical. Both implementations split on `/`, compare `provider` and `id` for qualified references, compare `id` for bare references, and treat anything other than exactly one match as a non-resolution. The only differences are return shape (`ModelMatchOutcome` vs. `M | undefined`) and that `matchAvailableModel` takes a pre-typed `string` reference while the matcher accepts `unknown`.

**Consumers of the second implementation (current-code evidence that both copies are live):**

- `src/extension/production-composition.ts:910-920` — `probeStrictCapable` calls `matchAvailableModel(reference, ctx.modelRegistry.getAvailable())` to resolve the strict-capability probe target.
- `src/extension/production-composition.ts:1565-1567` — typed-query provider-support check calls `matchAvailableModel(reference, ctx.modelRegistry.getAvailable())` to map a `model:` reference to an api.
- `src/extension/production-theta-producer.ts:1072-1078` — runtime binder dispatch calls `matchAvailableModel(binderModelRef, this.#input.modelRegistry.getAvailable())` to recover the concrete model.
- `src/extension/production-theta-producer.ts:3205-3226` and `3572-3575` — additional runtime uses of `matchAvailableModel` against the registry snapshot.

## Why this is a problem
This is load-bearing parallel truth, not incidental similarity. The two functions owe each other the exact same reference-to-model semantics because the same reference string is resolved by the canonical matcher at load time and by `matchAvailableModel` at load-time probe and runtime.

If they diverge:
- A reference that the frontmatter/binder matcher treats as resolved could be rejected by `matchAvailableModel` in the strict-capability probe or runtime dispatch, or vice versa.
- A theta could load with a resolved `model:` / binder-model reference but then fail at runtime binder dispatch because `matchAvailableModel` cannot find the model the matcher admitted.
- The typed-query provider-support check (`production-composition.ts:1565`) could classify a provider differently from the load-time frontmatter resolution because it resolves the reference through a separate implementation.

The file comment on `matchAvailableModel` explicitly states it applies "the same exact-match rule ... the shared `ModelReferenceMatcher` applies" — acknowledging the parallel without providing a shared source of truth.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/model-reference-matcher.ts`, which already owns the canonical exact-match rule. A single internal helper that returns both the outcome and the single matched model (when there is exactly one) could replace the duplicated filter logic in both places, leaving the public `resolve` and `matchAvailableModel` APIs as thin adapters.

## False-positive check
- **Clone-map verification:** The shard's clone map reports no groups for `src/binder/binder-model.ts` or `src/parser/model-reference-matcher.ts`; the duplication is below the scanner's token-window floor and was found by reading.
- **Both copies live:** `matchAvailableModel` is exported and used in `production-composition.ts` and `production-theta-producer.ts`; `createModelReferenceMatcher` is imported and used in `binder-model.ts` (`loadPassResolveBinderModels`, `resolveChainReference`) and in frontmatter parsing. Neither copy is dead.
- **Spec-normative vector:** The exact-match rule is spec-anchored (`binder-model-and-context.md#binder-model-parse-rule`), but the spec does not require two implementations; the duplication is a codebase artifact, not a spec-repeated vector.
- **Tests excluded:** All cited usages are in `src/` production code; no test files are involved.
- **Already-filed check:** Searched `quality/intake/` for `matchAvailableModel`, `model-reference-matcher`, and `exact-match rule`; no existing D4 filing covers this pair.

## Triage
verdict: questionable — accounting verified: both copies exist at the cited lines (model-reference-matcher.ts:34-67 `resolve`, binder-model.ts:133-147 `matchAvailableModel`) and implement the same three-arm rule (first-slash `provider/id`, bare `id`, exactly-one-match else non-resolution); all cited consumers are live (production-composition.ts:910/1565, production-theta-producer.ts:1075/3209/3225/3574, plus an uncited 4063), clone-scan map lists no group for model-reference-matcher.ts, not already tracked (PTQ-1177 was the fixed D9 move of the matcher out of reload-wiring, PTQ-0168 a stale roster comment) and REVIEW_LOG.md:570 explicitly routed this pair to D4; tests/b0418 already pins the two in lockstep, confirming the must-stay-in-step claim — per the D4 parallel rule the shared source of truth (adapter over one helper vs. keep the typed-outcome/concrete-model split) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: both copies byte-match at model-reference-matcher.ts:34-67 and binder-model.ts:133-147 and encode the same three-arm rule (first-slash provider+id, bare id, exactly-one-match else non-resolution); both are live in src/ (`matchAvailableModel` called at production-composition.ts:910/1565 and production-theta-producer.ts:1075/3209/3225/3574/4063; `createModelReferenceMatcher` at binder-model.ts:463, production-composition.ts:881, reload-wiring.ts:525), `clone-scan map` on model-reference-matcher.ts reports no group so this is a hand-diffed parallel, tests/b0418 imports both and pins them in lockstep, REVIEW_LOG.md:570 routed exactly this pair to D4, and no open/resolved PTQ tracks it (PTQ-0168 = stale doc roster, PTQ-1177 = D9 move) — per the D4 parallel rule the shared source of truth is a human design ruling, never confirmed (triage: claude-fable-5-1)
