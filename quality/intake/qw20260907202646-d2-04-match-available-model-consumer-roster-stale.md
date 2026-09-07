---
id: pending
title: matchAvailableModel's doc-comment names two consumers ("the strict-capability probe and the runtime binder dispatch"); production has six call sites
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/binder-model.ts:112-114
  - src/extension/production-composition.ts:705
  - src/extension/production-composition.ts:1244
  - src/extension/production-theta-producer.ts:953
  - src/extension/production-theta-producer.ts:2841
  - src/extension/production-theta-producer.ts:3069
  - src/extension/production-theta-producer.ts:3446
sites: 7
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# matchAvailableModel's doc-comment names two consumers ("the strict-capability probe and the runtime binder dispatch"); production has six call sites

## Observation

`matchAvailableModel`'s doc-comment closes with a rationale sentence that
enumerates its consumers as a closed pair: the strict-capability probe and the
runtime binder dispatch. Both of those still exist, but the function has since
been adopted by four further production sites that the sentence does not
mention — the typed-query provider-support model resolver, the PIC-62 child
model confirmation, the `subagent fn` `with { model }` override resolution, and
the forced-respond model resolution. The enumeration reads as the exhaustive
consumer roster of a shared helper and is now four short.

## Evidence

src/binder/binder-model.ts:112-114 — the claim:

```ts
 * decided such a reference resolves to no model). Generic over the model shape
 * so both the strict-capability probe and the runtime binder dispatch reuse it
 * against `ctx.modelRegistry.getAvailable()`.
```

The six production call sites, from
`grep -rnE "matchAvailableModel\(" src extensions tools --include=*.ts`
(6 hits, all listed here; the declaration at src/binder/binder-model.ts:116 is
excluded):

src/extension/production-composition.ts:705 — the strict-capability probe (one
of the two the comment names):

```ts
  const probeStrictCapable = (reference: string): StrictCapableProbe | undefined => {
    const model = matchAvailableModel(reference, ctx.modelRegistry.getAvailable());
```

src/extension/production-composition.ts:1244 — the typed-query provider-support
check's injected model resolver (not named by the comment):

```ts
    const typedQueryProviderWarning = checkThetaTypedQueryProviderSupport({
```

```ts
      resolveModel: (reference) =>
        matchAvailableModel(reference, ctx.modelRegistry.getAvailable()),
```

src/extension/production-theta-producer.ts:953 — the runtime binder dispatch
(the other one the comment names):

```ts
    const binderModelRef = binderInput.theta.binderModel;
    const model =
      binderModelRef !== undefined
        ? matchAvailableModel(binderModelRef, this.#input.modelRegistry.getAvailable())
        : undefined;
```

src/extension/production-theta-producer.ts:2841 — the PIC-62 marshalled
child-model confirmation (not named by the comment):

```ts
      const qualified = `${model.provider}/${model.id}`;
      const resolved = matchAvailableModel(qualified, available);
```

src/extension/production-theta-producer.ts:3069 — the FN-7 `with { model }`
override resolution (not named by the comment):

```ts
    const overrideModel =
      config.model !== undefined
        ? matchAvailableModel(config.model, this.#input.modelRegistry.getAvailable())
        : undefined;
```

src/extension/production-theta-producer.ts:3446 — the forced-respond model
resolution (not named by the comment):

```ts
    const respondModel =
      modelRef !== undefined
        ? matchAvailableModel(modelRef, modelRegistry.getAvailable())
        : deps.ctx.model;
```

## Why this is a problem

Historical narration: the sentence records the consumer set as it stood when
the helper was introduced and has not tracked the four adoptions since. A
closed two-item roster on a shared helper is load-bearing for a reader deciding
the blast radius of a change to the matching rule — the reference-ordering
semantics this function fixes (bare id vs `provider/id`, ambiguity →
`undefined`) are consumed by six independent production paths, four of which
the comment tells the reader do not exist. The neighbouring `matches.length === 1
? matches[0] : undefined` rule is exactly the kind of behaviour whose consumer
census a maintainer would take from this sentence.

## Suggested direction (non-binding, optional)

Either state the consumer set without enumerating it ("every site that resolves
a model reference against `modelRegistry.getAvailable()`"), or update the list
to the six current sites.

## False-positive check

- Call-site enumeration: `grep -rnE "matchAvailableModel\(" src extensions
  tools --include=*.ts` — exactly the six hits quoted above; each was read in
  context to identify which subsystem it belongs to.
- Test call sites (not counted as production consumers, listed for
  completeness): tests/b0418-binder-model-reference-first-slash-ordering.test.ts
  (:67, :80, :93, :103, :111, :112) and tests/host-peer-version-and-model.test.ts
  (:288, :292, :296, :304, :305, :313, :358).
- Import enumeration: `grep -rn "matchAvailableModel" src extensions tools
  --include=*.ts` also shows the two import statements
  (production-composition.ts:153, production-theta-producer.ts:322) and three
  prose mentions (production-composition.ts:1865,
  production-theta-producer.ts:2837, tests/typed-two-phase-live.test.ts:670);
  none is a further call.
- Re-export check: `grep -rn "export \*" src extensions tools --include=*.ts`
  returns nothing — no export-star barrel could hide an additional consumer.
- Deadness is not claimed: the function and both named consumers are live. The
  claim is only that the enumeration undercounts.
- Scope: this is a comment-content claim about a file in the reviewed set
  (src/binder/binder-model.ts); the cited consumer sites are evidence for the
  count, not the subject of the finding.

## Triage
